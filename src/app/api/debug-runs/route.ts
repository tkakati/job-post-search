import { cookies } from "next/headers";
import { z } from "zod";
import { ensureAnonymousSession } from "@/lib/api/session";
import { fetchPriorShownIdentitySet, purgeExpiredLeads } from "@/lib/api/search-runs";
import { apiError, apiOk } from "@/lib/api/response";
import { logger } from "@/lib/observability/logger";
import { createAgentGraph } from "@/lib/agent/graph";
import {
  AgentGraphStateSchema,
  createInitialAgentGraphState,
} from "@/lib/agent/state";
import { DebugRunInputSchema, DebugRunOutputSchema } from "@/lib/schemas/api";
import { env } from "@/lib/env";

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
    source: e.source === "__start__" ? "START" : e.source === "__end__" ? "END" : e.source,
    target: e.target === "__start__" ? "START" : e.target === "__end__" ? "END" : e.target,
    conditional: Boolean(e.conditional),
  }));
  const graphMermaid =
    typeof internal.drawMermaid === "function"
      ? internal.drawMermaid()
      : "flowchart TD\nSTART-->END";
  return { nodes, edges, graphMermaid };
}

export async function POST(req: Request) {
  try {
    if (!env.DATABASE_URL) {
      return apiError({
        status: 400,
        code: "MISSING_DATABASE_URL",
        message:
          "DATABASE_URL is not set. Add it to .env.local before running debug flow.",
      });
    }

    const body = await req.json().catch(() => null);
    const parsed = DebugRunInputSchema.safeParse(body);
    if (!parsed.success) {
      return apiError({
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Invalid debug run input",
        details: z.flattenError(parsed.error),
      });
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

    const stream = await graph.stream(initial, {
      streamMode: "updates",
      recursionLimit: recursionLimitForMaxIterations(initial.maxIterations),
    });
    for await (const chunk of stream as AsyncIterable<Record<string, Record<string, unknown>>>) {
      const entries = Object.entries(chunk);
      for (const [node, patch] of entries) {
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

        sequence.push({
          step,
          node,
          phase: "started",
          log: `${node} started`,
        });
        sequence.push({
          step,
          node,
          phase: "completed",
          log: lastLog,
        });

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

    logger.info("debug_run_completed", {
      userSessionId,
      steps: payload.sequence.length,
      stopReason: payload.final.stopReason,
    });
    return apiOk(payload);
  } catch (error) {
    logger.error("debug_run_failed", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return apiError({
      status: 500,
      code: "INTERNAL_ERROR",
      message:
        error instanceof Error ? `Failed to run debug flow: ${error.message}` : "Failed to run debug flow",
    });
  }
}
