import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { dbClient } from "@/lib/db";
import {
  leadEvents,
  leads,
  plannerRuns,
  searchRuns,
  shownLeads,
  leadSources,
  leadEmbeddings,
} from "@/lib/db/schema";
import type { LeadCardViewModel } from "@/lib/types/contracts";
import { roleLocationKey } from "@/lib/utils/role-location";
import { runAgent } from "@/lib/agent/run-agent";
import {
  HistoryResponseSchema,
  SearchRunEnvelopeSchema,
  SearchRunResultSchema,
} from "@/lib/schemas/api";
import { z } from "zod";
import { canonicalLeadIdentity } from "@/lib/utils/lead-identity";
import { daysToRecencyPreference, recencyPreferenceToDays } from "@/lib/utils/recency";
import { qualityBadgeFromScore } from "@/lib/scoring/thresholds";

type SearchRunEnvelope = z.infer<typeof SearchRunEnvelopeSchema>;
type SearchRunResult = z.infer<typeof SearchRunResultSchema>;
type HistoryResponse = z.infer<typeof HistoryResponseSchema>;

const SHOWN_EVENT_TYPE = "shown";
const FEEDBACK_EVENT_TYPE = "feedback";

type LeadTrackedEventType =
  | "opened"
  | "clicked"
  | "helpful"
  | "not_helpful"
  | "hidden"
  | "open"
  | "click";

function toIso(date: Date) {
  return date.toISOString();
}

export async function purgeExpiredLeads(input?: { olderThanDays?: number }) {
  const db = dbClient();
  const olderThanDays = input?.olderThanDays ?? 31;
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

  const expiredLeadRows = await db
    .select({ id: leads.id })
    .from(leads)
    .where(
      sql`COALESCE(${leads.postedAt}, ${leads.fetchedAt}, ${leads.createdAt}) < ${cutoff}`,
    );
  const expiredLeadIds = expiredLeadRows.map((row) => row.id);
  if (expiredLeadIds.length === 0) {
    return { deletedLeadCount: 0 };
  }

  await db.transaction(async (tx) => {
    await tx.delete(shownLeads).where(inArray(shownLeads.leadId, expiredLeadIds));
    await tx.delete(leadSources).where(inArray(leadSources.leadId, expiredLeadIds));
    await tx.delete(leadEvents).where(inArray(leadEvents.leadId, expiredLeadIds));
    await tx
      .delete(leadEmbeddings)
      .where(inArray(leadEmbeddings.leadId, expiredLeadIds));
    await tx.delete(leads).where(inArray(leads.id, expiredLeadIds));
  });

  return { deletedLeadCount: expiredLeadIds.length };
}

function mapQualityBadge(
  score: number | null | undefined,
): LeadCardViewModel["qualityBadge"] {
  return qualityBadgeFromScore(score);
}

function parseCardMetadata(
  metadata: Record<string, unknown> | null,
): Partial<LeadCardViewModel> {
  if (!metadata) return {};
  const sourceBadge = metadata.sourceBadge;
  const provenanceSources = metadata.provenanceSources;
  const qualityBadge = metadata.qualityBadge;
  return {
    sourceBadge:
      sourceBadge === "retrieved" || sourceBadge === "fresh" || sourceBadge === "both"
        ? sourceBadge
        : "fresh",
    provenanceSources: Array.isArray(provenanceSources)
      ? provenanceSources.filter(
          (s): s is "retrieval" | "fresh_search" =>
            s === "retrieval" || s === "fresh_search",
        )
      : ["fresh_search"],
    qualityBadge:
      qualityBadge === "high" ||
      qualityBadge === "medium" ||
      qualityBadge === "low" ||
      qualityBadge === "unscored"
        ? qualityBadge
        : undefined,
  };
}

export async function fetchPriorShownIdentitySet(userSessionId: string) {
  const db = dbClient();
  const rows = await db
    .select({
      canonicalUrl: leads.canonicalUrl,
      titleOrRole: leads.titleOrRole,
      company: leads.company,
      location: leads.location,
    })
    .from(shownLeads)
    .innerJoin(leads, eq(leads.id, shownLeads.leadId))
    .where(eq(shownLeads.userSessionId, userSessionId));
  return new Set(
    rows.map((r) =>
    canonicalLeadIdentity({
      url: r.canonicalUrl,
      titleOrRole: r.titleOrRole,
      company: r.company,
      location: r.location,
    }).identityKey,
  ),
  );
}

export async function markFinalResponseLeadsAsShown(input: {
  userSessionId: string;
  searchRunId: number;
  iterationNumber: number;
  finalLeads: LeadCardViewModel[];
}) {
  const db = dbClient();
  const urls = input.finalLeads.map((l) => l.canonicalUrl);
  if (urls.length === 0) return;

  const leadRows = await db
    .select({
      id: leads.id,
      canonicalUrl: leads.canonicalUrl,
      titleOrRole: leads.titleOrRole,
      company: leads.company,
      location: leads.location,
      snippet: leads.snippet,
      postedAt: leads.postedAt,
      sourceType: leads.sourceType,
      leadScore: leads.leadScore,
      hiringIntentScore: leads.hiringIntentScore,
    })
    .from(leads)
    .where(inArray(leads.canonicalUrl, urls));
  const byUrl = new Map(leadRows.map((r) => [r.canonicalUrl, r]));

  const shownRows = input.finalLeads
    .map((leadCard) => {
      const row = byUrl.get(leadCard.canonicalUrl);
      if (!row) return null;
      return {
        userSessionId: input.userSessionId,
        leadId: row.id,
        searchRunId: input.searchRunId,
        iterationNumber: input.iterationNumber,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (shownRows.length > 0) {
    await db.insert(shownLeads).values(shownRows).onConflictDoNothing();
  }

  const eventRows = input.finalLeads
    .map((leadCard) => {
      const row = byUrl.get(leadCard.canonicalUrl);
      if (!row) return null;
      return {
        userSessionId: input.userSessionId,
        leadId: row.id,
        eventType: SHOWN_EVENT_TYPE,
        searchRunId: input.searchRunId,
        metadataJson: {
          title: leadCard.title || row.titleOrRole,
          company: leadCard.company ?? row.company,
          location: leadCard.location ?? row.location,
          snippet: leadCard.snippet ?? row.snippet,
          canonicalUrl: leadCard.canonicalUrl,
          sourceType: leadCard.sourceType ?? row.sourceType,
          sourceBadge: leadCard.sourceBadge ?? "fresh",
          provenanceSources: leadCard.provenanceSources ?? ["fresh_search"],
          newBadge: leadCard.newBadge ?? "new",
          qualityBadge:
            leadCard.qualityBadge ??
            mapQualityBadge(row.leadScore ?? row.hiringIntentScore ?? 0),
          postedAt:
            leadCard.postedAt ??
            (row.postedAt instanceof Date ? row.postedAt.toISOString() : null),
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  if (eventRows.length > 0) {
    await db.insert(leadEvents).values(eventRows);
  }
}

export async function startSearchRun(input: {
  userSessionId: string;
  role: string;
  location: string;
  locationIsHardFilter?: boolean;
  employmentType?: "full-time" | "part-time" | "contract" | "internship" | null;
  recencyPreference: "past-24h" | "past-week" | "past-month";
}): Promise<SearchRunEnvelope> {
  const db = dbClient();
  await purgeExpiredLeads({ olderThanDays: 31 });
  const now = new Date();
  const [inserted] = await db
    .insert(searchRuns)
    .values({
      userSessionId: input.userSessionId,
      role: input.role,
      location: input.location,
      roleLocationKey: roleLocationKey(input.role, input.location),
      recencyPreference: recencyPreferenceToDays(input.recencyPreference),
      iterationCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: searchRuns.id });
  const runId = inserted?.id;
  if (!runId) {
    return {
      runId: -1,
      status: "failed",
      pollAfterMs: null,
      result: null,
      error: "Could not create search run",
    };
  }

  try {
    const shownLeadIdentityKeys = Array.from(
      await fetchPriorShownIdentitySet(input.userSessionId),
    );
    const state = await runAgent({
      userSessionId: input.userSessionId,
      role: input.role,
      location: input.location,
      locationIsHardFilter: input.locationIsHardFilter ?? false,
      employmentType: input.employmentType ?? null,
      recencyPreference: input.recencyPreference,
      searchRunId: runId,
      shownLeadIdentityKeys,
    });

    const final = state.finalResponse;
    const iterationsUsed = final?.iterationsUsed ?? state.iteration + 1;
    const stopReason = final?.stopReason ?? state.stopReason;
    await db
      .update(searchRuns)
      .set({
        iterationCount: iterationsUsed,
        finalStopReason: stopReason,
        updatedAt: new Date(),
      })
      .where(eq(searchRuns.id, runId));

    if (final) {
      await markFinalResponseLeadsAsShown({
        userSessionId: input.userSessionId,
        searchRunId: runId,
        iterationNumber: Math.max(0, iterationsUsed - 1),
        finalLeads: final.leads,
      });

      return {
        runId,
        status: "completed",
        pollAfterMs: null,
        result: {
          runId,
          status: "completed",
          stopReason: final.stopReason,
          iterationsUsed: final.iterationsUsed,
          summary: final.summary,
          totalCounts: final.totalCounts,
          sourceBreakdown: {
            retrieved: final.leads.filter((l) => l.sourceBadge === "retrieved").length,
            fresh: final.leads.filter((l) => l.sourceBadge === "fresh").length,
            both: final.leads.filter((l) => l.sourceBadge === "both").length,
          },
          debug: {
            plannerMode: state.plannerOutput?.plannerMode ?? null,
            retrievalRan:
              state.debugLog.some((entry) => entry.includes("retrieval_arm")) ??
              false,
            freshSearchRan:
              state.debugLog.some((entry) => entry.includes("search =>")) ?? false,
            numExploreQueries: state.plannerOutput?.numExploreQueries ?? 0,
            iterationCount: final.iterationsUsed,
            stopReason: final.stopReason,
            countBreakdowns: final.totalCounts,
          },
          leads: final.leads,
          updatedAt: new Date().toISOString(),
        },
      };
    }

    return {
      runId,
      status: "failed",
      pollAfterMs: null,
      result: null,
      error: "Agent run completed without final response",
    };
  } catch (error) {
    await db
      .update(searchRuns)
      .set({ finalStopReason: "max_iterations", updatedAt: new Date() })
      .where(eq(searchRuns.id, runId));
    return {
      runId,
      status: "failed",
      pollAfterMs: null,
      result: null,
      error: error instanceof Error ? error.message : "Unknown run error",
    };
  }
}

export async function getSearchRunResult(input: {
  userSessionId: string;
  runId: number;
}): Promise<SearchRunEnvelope> {
  const db = dbClient();
  const run = await db
    .select({
      id: searchRuns.id,
      role: searchRuns.role,
      location: searchRuns.location,
      recencyPreference: searchRuns.recencyPreference,
      iterationCount: searchRuns.iterationCount,
      finalStopReason: searchRuns.finalStopReason,
      updatedAt: searchRuns.updatedAt,
    })
    .from(searchRuns)
    .where(
      and(
        eq(searchRuns.id, input.runId),
        eq(searchRuns.userSessionId, input.userSessionId),
      ),
    )
    .limit(1);
  const row = run[0];
  if (!row) {
    return {
      runId: input.runId,
      status: "failed",
      pollAfterMs: null,
      result: null,
      error: "Search run not found",
    };
  }

  const shownEvents = await db
    .select({
      metadataJson: leadEvents.metadataJson,
      leadId: leadEvents.leadId,
      createdAt: leadEvents.createdAt,
    })
    .from(leadEvents)
    .where(
      and(
        eq(leadEvents.userSessionId, input.userSessionId),
        eq(leadEvents.searchRunId, input.runId),
        eq(leadEvents.eventType, SHOWN_EVENT_TYPE),
      ),
    )
    .orderBy(desc(leadEvents.createdAt));

  const plannerRows = await db
    .select({
      plannerMode: plannerRuns.plannerMode,
      enableRetrieval: plannerRuns.enableRetrieval,
      enableNewLeadGeneration: plannerRuns.enableNewLeadGeneration,
      numExploreQueries: plannerRuns.numExploreQueries,
      iterationNumber: plannerRuns.iterationNumber,
    })
    .from(plannerRuns)
    .where(eq(plannerRuns.searchRunId, input.runId))
    .orderBy(desc(plannerRuns.iterationNumber));

  const leadIds = shownEvents.map((e) => e.leadId);
  const leadRows =
    leadIds.length > 0
      ? await db
          .select({
            id: leads.id,
            canonicalUrl: leads.canonicalUrl,
            titleOrRole: leads.titleOrRole,
            company: leads.company,
            location: leads.location,
            snippet: leads.snippet,
            sourceType: leads.sourceType,
            postedAt: leads.postedAt,
            leadScore: leads.leadScore,
            hiringIntentScore: leads.hiringIntentScore,
          })
          .from(leads)
          .where(inArray(leads.id, leadIds))
      : [];
  const leadById = new Map(leadRows.map((l) => [l.id, l]));

  const cards: LeadCardViewModel[] = [];
  for (const event of shownEvents) {
    const row = leadById.get(event.leadId);
    if (!row) continue;
    const metadata = parseCardMetadata(
      (event.metadataJson ?? null) as Record<string, unknown> | null,
    );
    cards.push({
      leadId: row.id,
      title: (event.metadataJson?.title as string | undefined) ?? row.titleOrRole,
      company:
        (event.metadataJson?.company as string | null | undefined) ?? row.company,
      location:
        (event.metadataJson?.location as string | null | undefined) ?? row.location,
      canonicalUrl: row.canonicalUrl,
      url: row.canonicalUrl,
      snippet:
        (event.metadataJson?.snippet as string | null | undefined) ?? row.snippet,
      sourceType:
        (event.metadataJson?.sourceType as string | undefined) ?? row.sourceType,
      sourceBadge: metadata.sourceBadge ?? "fresh",
      provenanceSources: metadata.provenanceSources ?? ["fresh_search"],
      postedAt:
        (event.metadataJson?.postedAt as string | null | undefined) ??
        (row.postedAt instanceof Date ? row.postedAt.toISOString() : null),
      isNewForUser: true,
      newBadge: "new",
      qualityBadge:
        metadata.qualityBadge ??
        mapQualityBadge(row.leadScore ?? row.hiringIntentScore),
    });
  }

  const result: SearchRunResult = {
    runId: row.id,
    status: "completed",
    stopReason:
      row.finalStopReason === "sufficient_high_quality_leads" ||
      row.finalStopReason === "max_iterations"
        ? row.finalStopReason
        : null,
    iterationsUsed: row.iterationCount,
    summary:
      cards.length > 0
        ? `Found ${cards.length} new leads for ${row.role} in ${row.location}.`
        : `No new leads found for ${row.role} in ${row.location}.`,
    totalCounts: {
      retrieved: cards.filter((c) => c.sourceBadge === "retrieved").length,
      generated: cards.filter((c) => c.sourceBadge === "fresh").length,
      merged: cards.length,
      newForUser: cards.length,
    },
    sourceBreakdown: {
      retrieved: cards.filter((c) => c.sourceBadge === "retrieved").length,
      fresh: cards.filter((c) => c.sourceBadge === "fresh").length,
      both: cards.filter((c) => c.sourceBadge === "both").length,
    },
    debug: {
      plannerMode:
        plannerRows[0]?.plannerMode === "full_explore" ||
        plannerRows[0]?.plannerMode === "explore_heavy" ||
        plannerRows[0]?.plannerMode === "exploit_heavy"
          ? plannerRows[0].plannerMode
          : null,
      retrievalRan: plannerRows.some((p) => p.enableRetrieval),
      freshSearchRan: plannerRows.some((p) => p.enableNewLeadGeneration),
      numExploreQueries: plannerRows[0]?.numExploreQueries ?? 0,
      iterationCount: row.iterationCount,
      stopReason:
        row.finalStopReason === "sufficient_high_quality_leads" ||
        row.finalStopReason === "max_iterations"
          ? row.finalStopReason
          : null,
      countBreakdowns: {
        retrieved: cards.filter((c) => c.sourceBadge === "retrieved").length,
        generated: cards.filter((c) => c.sourceBadge === "fresh").length,
        merged: cards.length,
        newForUser: cards.length,
      },
    },
    leads: cards,
    updatedAt: toIso(row.updatedAt),
  };
  return { runId: row.id, status: "completed", pollAfterMs: null, result };
}

export async function recordLeadEvent(input: {
  userSessionId: string;
  leadId: number;
  eventType: LeadTrackedEventType;
  searchRunId?: number;
  metadata?: Record<string, unknown>;
}) {
  const db = dbClient();
  const normalizedType =
    input.eventType === "click"
      ? "clicked"
      : input.eventType === "open"
        ? "opened"
        : input.eventType;
  await db.insert(leadEvents).values({
    userSessionId: input.userSessionId,
    leadId: input.leadId,
    eventType: normalizedType,
    searchRunId: input.searchRunId,
    metadataJson: input.metadata ?? null,
  });
}

export async function recordLeadFeedback(input: {
  userSessionId: string;
  leadId: number;
  useful: boolean;
  score?: number;
  notes?: string;
  searchRunId?: number;
}) {
  const db = dbClient();
  await db.insert(leadEvents).values({
    userSessionId: input.userSessionId,
    leadId: input.leadId,
    eventType: input.useful ? "helpful" : "not_helpful",
    searchRunId: input.searchRunId,
    metadataJson: {
      useful: input.useful,
      score: input.score,
      notes: input.notes,
      legacyType: FEEDBACK_EVENT_TYPE,
    },
  });
}

export async function getRecentHistory(input: {
  userSessionId: string;
  limit: number;
}): Promise<HistoryResponse> {
  const db = dbClient();
  const rows = await db
    .select({
      runId: searchRuns.id,
      role: searchRuns.role,
      location: searchRuns.location,
      recencyPreference: searchRuns.recencyPreference,
      stopReason: searchRuns.finalStopReason,
      iterationCount: searchRuns.iterationCount,
      createdAt: searchRuns.createdAt,
      updatedAt: searchRuns.updatedAt,
    })
    .from(searchRuns)
    .where(eq(searchRuns.userSessionId, input.userSessionId))
    .orderBy(desc(searchRuns.createdAt))
    .limit(input.limit);

  return {
    items: rows.map((row) => ({
      runId: row.runId,
      role: row.role,
      location: row.location,
      recencyPreference: daysToRecencyPreference(row.recencyPreference),
      stopReason:
        row.stopReason === "sufficient_high_quality_leads" ||
        row.stopReason === "max_iterations"
          ? row.stopReason
          : null,
      iterationCount: row.iterationCount,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    })),
  };
}
