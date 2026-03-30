import { cookies } from "next/headers";
import { z } from "zod";
import { ensureAnonymousSession } from "@/lib/api/session";
import { fetchPriorShownIdentitySet, purgeExpiredLeads } from "@/lib/api/search-runs";
import { buildLeadCardsFromLeads } from "@/lib/agent/formatters/build-lead-cards";
import { createAgentGraph } from "@/lib/agent/graph";
import {
  AgentGraphStateSchema,
  createInitialAgentGraphState,
} from "@/lib/agent/state";
import { DebugRunInputSchema, DebugRunOutputSchema } from "@/lib/schemas/api";
import { FinalResponseOutputSchema } from "@/lib/schemas/contracts";
import { env } from "@/lib/env";
import { runWithDebugApiCallSink } from "@/lib/debug/api-call-sink";
import { logger } from "@/lib/observability/logger";
import type { LeadRecord } from "@/lib/types/contracts";

export const runtime = "nodejs";

function recursionLimitForMaxIterations(maxIterations: number) {
  return Math.max(100, maxIterations * 40);
}

function graphFromLangGraphInternals() {
  const graph = createAgentGraph();
  const internal = graph.getGraph();
  const nodes = Object.keys(internal.nodes ?? {}).map((n) =>
    n === "__start__" ? "START" : n === "__end__" ? "END" : n,
  );
  const edges = (internal.edges ?? []).map((e: {
    source: string;
    target: string;
    conditional?: boolean;
  }) => ({
    source:
      e.source === "__start__" ? "START" : e.source === "__end__" ? "END" : e.source,
    target:
      e.target === "__start__" ? "START" : e.target === "__end__" ? "END" : e.target,
    conditional: Boolean(e.conditional),
  }));
  const graphMermaid =
    typeof internal.drawMermaid === "function"
      ? internal.drawMermaid()
      : "flowchart TD\nSTART-->END";
  return { nodes, edges, graphMermaid };
}

function line(value: unknown) {
  return `${JSON.stringify(value)}\n`;
}

function buildFreshPreviewLeadCards(normalizedLeads: LeadRecord[]) {
  const selectedLeads = normalizedLeads.slice(0, 20);
  const leadProvenance = selectedLeads.map((lead) => ({
    identityKey: lead.identityKey,
    sources: ["fresh_search"] as Array<"fresh_search">,
    isNewForUser: true,
  }));

  return buildLeadCardsFromLeads({
    selectedLeads,
    leadProvenance,
    maxLeads: 20,
    scope: "all",
  });
}

function summarizeStreamRunError(error: unknown): { code: string; message: string } {
  const raw =
    error instanceof Error
      ? error.message.toLowerCase()
      : typeof error === "string"
        ? error.toLowerCase()
        : "";

  if (raw.includes("database_url")) {
    return {
      code: "MISSING_DATABASE_URL",
      message: "Search is temporarily unavailable due to server configuration.",
    };
  }

  if (
    raw.includes("apify") ||
    raw.includes("profile_scraper") ||
    raw.includes("provider_execute_failed")
  ) {
    return {
      code: "POST_FETCH_FAILED",
      message: "Couldn't fetch posts right now. Please retry.",
    };
  }

  return { code: "DEBUG_RUN_FAILED", message: "Run failed. Please try again." };
}

export async function POST(req: Request) {
  if (!env.DATABASE_URL) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "MISSING_DATABASE_URL",
          message:
            "DATABASE_URL is not set. Add it to .env.local before running debug flow.",
        },
      },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = DebugRunInputSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid debug run input",
          details: z.flattenError(parsed.error),
        },
      },
      { status: 400 },
    );
  }

  const cookieStore = await cookies();
  const userSessionId = await ensureAnonymousSession(cookieStore);
  await purgeExpiredLeads({ olderThanDays: 31 });
  const persistedShownSet = await fetchPriorShownIdentitySet(userSessionId);
  const requestShownSet = new Set(
    (parsed.data.shownIdentityKeys ?? [])
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );
  const shownLeadIdentityKeys = Array.from(
    new Set([...persistedShownSet, ...requestShownSet]),
  );

  const initial = createInitialAgentGraphState({
    userSessionId,
    role: parsed.data.role,
    location: parsed.data.location,
    locationIsHardFilter: parsed.data.locationIsHardFilter ?? false,
    employmentType: parsed.data.employmentType ?? null,
    recencyPreference: parsed.data.recencyPreference,
    maxIterations: parsed.data.maxIterations,
    targetHighQualityLeads: parsed.data.targetHighQualityLeads,
    shownLeadIdentityKeys,
  });

  const graph = createAgentGraph();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let state = initial;
      let step = 0;
      const sequence: Array<{
        step: number;
        node: string;
        phase: "started" | "completed";
        log: string;
      }> = [];
      const nodeRuns: Array<{
        step: number;
        node: string;
        input: unknown;
        output: unknown;
        log: string;
      }> = [];
      let hasEmittedInterimResults = false;
      let hasEmittedFreshPreview = false;

      try {
        let apiCallSeq = 0;
        await runWithDebugApiCallSink((callPayload) => {
          apiCallSeq += 1;
          const { node, ...rest } = callPayload;
          controller.enqueue(
            encoder.encode(
              line({
                type: "api_call",
                id: apiCallSeq,
                at: new Date().toISOString(),
                node: node ?? "unknown",
                ...rest,
              }),
            ),
          );
        }, async () => {
          const updates = await graph.stream(initial, {
            streamMode: "updates",
            recursionLimit: recursionLimitForMaxIterations(initial.maxIterations),
          });
          for await (const chunk of updates as AsyncIterable<
            Record<string, Record<string, unknown>>
          >) {
            for (const [node, patch] of Object.entries(chunk)) {
              step += 1;
              const lastLog =
                Array.isArray((patch as { debugLog?: unknown }).debugLog) &&
                (patch as { debugLog?: unknown[] }).debugLog?.length
                  ? String(
                      (patch as { debugLog?: unknown[] }).debugLog?.[
                        (patch as { debugLog?: unknown[] }).debugLog!.length - 1
                      ] ?? `${node} completed`,
                    )
                  : `${node} completed`;

              sequence.push({ step, node, phase: "started", log: `${node} started` });
              sequence.push({ step, node, phase: "completed", log: lastLog });
              controller.enqueue(
                encoder.encode(
                  line({ type: "started", step, node, phase: "started", log: `${node} started` }),
                ),
              );
              controller.enqueue(
                encoder.encode(
                  line({
                    type: "completed",
                    step,
                    node,
                    phase: "completed",
                    log: lastLog,
                    patch,
                  }),
                ),
              );

              nodeRuns.push({
                step,
                node,
                input: {
                  iteration: state.iteration,
                  maxIterations: state.maxIterations,
                  role: state.role,
                  location: state.location,
                  plannerOutput: state.plannerOutput ?? null,
                  retrievalSummarySignal: state.retrievalSummarySignal ?? null,
                  generatedQueryHistoryCount: state.generatedQueryHistory?.length ?? 0,
                  taskComplete: state.taskComplete,
                  stopReason: state.stopReason,
                },
                output: patch,
                log: lastLog,
              });

              state = AgentGraphStateSchema.parse({
                ...state,
                ...patch,
              });

              if (
                !hasEmittedFreshPreview &&
                node === "search" &&
                state.searchResults &&
                Array.isArray(state.searchResults.normalizedSearchResults) &&
                state.searchResults.normalizedSearchResults.length > 0
              ) {
                const freshPreviewLeads = buildFreshPreviewLeadCards(
                  state.searchResults.normalizedSearchResults,
                );

                if (freshPreviewLeads.length > 0) {
                  const previewPayload = FinalResponseOutputSchema.parse({
                    taskComplete: false,
                    stopReason: null,
                    plannerMode: state.plannerOutput?.plannerMode ?? "exploit_heavy",
                    iterationsUsed: state.iteration + 1,
                    leads: freshPreviewLeads,
                    summary: `Showing ${freshPreviewLeads.length} fresh posts while extraction and scoring continue.`,
                    totalCounts: {
                      retrieved: state.combinedResults?.totalRetrievedCount ?? 0,
                      generated: state.searchResults.searchDiagnostics.totalKept ?? freshPreviewLeads.length,
                      merged: state.combinedResults?.totalMergedCount ?? freshPreviewLeads.length,
                      newForUser: state.combinedResults?.totalNewLeadCountForUser ?? freshPreviewLeads.length,
                    },
                    emptyState: {
                      isEmpty: false,
                      title: "Fresh posts ready",
                      message: "Showing fresh posts while deeper extraction and scoring continue.",
                    },
                  });

                  controller.enqueue(
                    encoder.encode(
                      line({
                        type: "interim_results",
                        phase: "fresh_search_preview",
                        payload: previewPayload,
                      }),
                    ),
                  );
                  hasEmittedFreshPreview = true;
                }
              }

              if (
                !hasEmittedInterimResults &&
                node === "scoring_node" &&
                state.scoringResults &&
                state.combinedResults
              ) {
                const leadProvenance = state.combinedResults.leadProvenance ?? [];
                const sourcesByIdentity = new Map(
                  leadProvenance.map((row) => [row.identityKey, row.sources]),
                );
                const retrievalHighQualityCount = (state.scoringResults.rankedLeads ?? []).filter(
                  (lead) => {
                    const sources = sourcesByIdentity.get(lead.identityKey) ?? [];
                    return sources.includes("retrieval") && (lead.leadScore ?? 0) >= 0.7;
                  },
                ).length;

                if (retrievalHighQualityCount > 0) {
                  const interimLeads = buildLeadCardsFromLeads({
                    selectedLeads: state.scoringResults.rankedLeads ?? [],
                    leadProvenance,
                    maxLeads: 20,
                    scope: "retrieval_only",
                  });

                  const interimPayload = FinalResponseOutputSchema.parse({
                    taskComplete: false,
                    stopReason: null,
                    plannerMode: state.plannerOutput?.plannerMode ?? "exploit_heavy",
                    iterationsUsed: state.iteration + 1,
                    leads: interimLeads,
                    summary: `Showing ${interimLeads.length} high-quality retrieved leads while we fetch more relevant posts.`,
                    totalCounts: {
                      retrieved: state.combinedResults.totalRetrievedCount,
                      generated: state.combinedResults.totalGeneratedCount,
                      merged: state.combinedResults.totalMergedCount,
                      newForUser: state.combinedResults.totalNewLeadCountForUser,
                    },
                    emptyState: {
                      isEmpty: interimLeads.length === 0,
                      title:
                        interimLeads.length === 0 ? "No retrieved leads yet" : "Retrieved leads ready",
                      message:
                        interimLeads.length === 0
                          ? "No high-quality retrieved leads yet."
                          : "Showing retrieved leads while fresh search continues.",
                    },
                  });

                  controller.enqueue(
                    encoder.encode(
                      line({
                        type: "interim_results",
                        phase: "retrieval_scored",
                        payload: interimPayload,
                      }),
                    ),
                  );
                  hasEmittedInterimResults = true;
                }
              }
            }
          }

          const graphData = graphFromLangGraphInternals();
          const payload = DebugRunOutputSchema.parse({
            graph: {
              nodes: graphData.nodes,
              edges: graphData.edges,
            },
            sequence,
            nodeRuns,
            graphMermaid: graphData.graphMermaid,
            final: {
              taskComplete: state.taskComplete,
              stopReason: state.stopReason,
              iteration: state.iteration,
              targetHighQualityLeads: state.targetHighQualityLeads,
              plannerMode: state.plannerOutput?.plannerMode ?? null,
              counts: {
                retrieved: state.combinedResults?.totalRetrievedCount ?? 0,
                generated: state.combinedResults?.totalGeneratedCount ?? 0,
                merged: state.combinedResults?.totalMergedCount ?? 0,
                newForUser: state.combinedResults?.totalNewLeadCountForUser ?? 0,
              },
            },
            snapshots: {
              plannerOutput: state.plannerOutput ?? null,
              retrievalResults: state.retrievalResults ?? null,
              generatedQueries: state.generatedQueries ?? null,
              searchResults: state.searchResults ?? null,
              extractionResults: state.extractionResults ?? null,
              combinedResults: state.combinedResults ?? null,
              scoringResults: state.scoringResults ?? null,
              finalResponse: state.finalResponse ?? null,
            },
          });
          controller.enqueue(encoder.encode(line({ type: "final", payload })));
        });
      } catch (error) {
        const summarizedError = summarizeStreamRunError(error);
        logger.error("debug_run_stream_failed", {
          error: error instanceof Error ? error.message : "unknown",
          code: summarizedError.code,
        });
        controller.enqueue(
          encoder.encode(
            line({
              type: "error",
              code: summarizedError.code,
              message: summarizedError.message,
            }),
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
