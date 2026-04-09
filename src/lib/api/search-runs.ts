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
  SavedPostFeedResponseSchema,
  SearchRunEnvelopeSchema,
  SearchRunResultSchema,
} from "@/lib/schemas/api";
import { z } from "zod";
import { canonicalLeadIdentity } from "@/lib/utils/lead-identity";
import { daysToRecencyPreference, recencyPreferenceToDays } from "@/lib/utils/recency";
import { qualityBadgeFromScore } from "@/lib/scoring/thresholds";
import type { RecencyPreference } from "@/lib/types/contracts";

type SearchRunEnvelope = z.infer<typeof SearchRunEnvelopeSchema>;
type SearchRunResult = z.infer<typeof SearchRunResultSchema>;
type HistoryResponse = z.infer<typeof HistoryResponseSchema>;
type SavedPostFeedResponse = z.infer<typeof SavedPostFeedResponseSchema>;
type LeadCardScoreBreakdown = NonNullable<LeadCardViewModel["scoreBreakdown"]>;

const SHOWN_EVENT_TYPE = "shown";
const FEEDBACK_EVENT_TYPE = "feedback";
const HIDDEN_EVENT_TYPE = "hidden";

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

function normalizeSessionScopeIds(input: {
  userSessionId?: string;
  sessionScopeIds?: string[];
}) {
  const normalized = new Set<string>();
  for (const value of input.sessionScopeIds ?? []) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    normalized.add(trimmed);
  }
  if (typeof input.userSessionId === "string" && input.userSessionId.trim()) {
    normalized.add(input.userSessionId.trim());
  }
  return Array.from(normalized);
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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function resolveScoreFromMetadata(input: {
  metadata: Record<string, unknown> | null;
  scoreBreakdown?: LeadCardScoreBreakdown;
}): number | null {
  const rawScore = input.metadata?.score;
  if (typeof rawScore === "number" && Number.isFinite(rawScore)) {
    return clamp01(rawScore);
  }
  if (typeof rawScore === "string") {
    const parsed = Number(rawScore);
    if (Number.isFinite(parsed)) return clamp01(parsed);
  }
  if (
    typeof input.scoreBreakdown?.finalScore100 === "number" &&
    Number.isFinite(input.scoreBreakdown.finalScore100)
  ) {
    return clamp01(input.scoreBreakdown.finalScore100 / 100);
  }
  return null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeUrlForLookup(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString().toLowerCase();
  } catch {
    return trimmed.toLowerCase();
  }
}

function parseLeadLocationsFromDb(input: {
  normalizedLocationJson: Record<string, unknown> | string | null;
  fallbackRawLocation: string | null;
}): LeadCardViewModel["locations"] {
  if (input.normalizedLocationJson && typeof input.normalizedLocationJson === "object") {
    const maybeLocations = (input.normalizedLocationJson as Record<string, unknown>).locations;
    if (Array.isArray(maybeLocations)) {
      const parsed = maybeLocations
        .map((entry) => {
          const obj = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
          if (!obj) return null;
          const raw = readString(obj.raw);
          if (!raw) return null;
          const city = readString(obj.city);
          const state = readString(obj.state);
          const country = readString(obj.country);
          const lat = typeof obj.lat === "number" && Number.isFinite(obj.lat) ? obj.lat : null;
          const lon = typeof obj.lon === "number" && Number.isFinite(obj.lon) ? obj.lon : null;
          return { raw, city, state, country, lat, lon };
        })
        .filter((value): value is NonNullable<typeof value> => value !== null);
      if (parsed.length > 0) return parsed;
    }
  }

  const fallbackRaw = readString(input.fallbackRawLocation);
  if (!fallbackRaw) return [];
  return [{ raw: fallbackRaw, city: null, state: null, country: null, lat: null, lon: null }];
}

function readPostContext(
  sourceMetadata: Record<string, unknown> | null,
): {
  primaryPostUrl: string | null;
  primaryAuthorName: string | null;
  primaryAuthorProfileUrl: string | null;
} | null {
  if (!sourceMetadata) return null;
  const postContextRaw =
    sourceMetadata.postContext && typeof sourceMetadata.postContext === "object"
      ? (sourceMetadata.postContext as Record<string, unknown>)
      : null;
  if (!postContextRaw) return null;
  return {
    primaryPostUrl: readString(postContextRaw.primaryPostUrl),
    primaryAuthorName: readString(postContextRaw.primaryAuthorName),
    primaryAuthorProfileUrl: readString(postContextRaw.primaryAuthorProfileUrl),
  };
}

function parseEmploymentType(
  value: unknown,
): LeadCardViewModel["employmentType"] {
  if (value === "full-time") return "full-time";
  if (value === "part-time") return "part-time";
  if (value === "contract") return "contract";
  if (value === "internship") return "internship";
  return null;
}

function parseWorkMode(value: unknown): LeadCardViewModel["workMode"] {
  if (value === "onsite") return "onsite";
  if (value === "hybrid") return "hybrid";
  if (value === "remote") return "remote";
  return null;
}

function normalizeScoreBreakdownGateReason(
  value: unknown,
): LeadCardScoreBreakdown["gateReason"] {
  if (value === "hiring_intent_zero") return value;
  if (value === "employment_type_mismatch") return value;
  if (value === "hard_location_mismatch") return value;
  return null;
}

function normalizeScoreBreakdown(
  value: unknown,
): LeadCardScoreBreakdown | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Record<string, unknown>;
  const normalized: LeadCardScoreBreakdown = {};

  if (typeof raw.roleMatchScore === "number" && Number.isFinite(raw.roleMatchScore)) {
    normalized.roleMatchScore = raw.roleMatchScore;
  }
  if (typeof raw.locationMatchScore === "number" && Number.isFinite(raw.locationMatchScore)) {
    normalized.locationMatchScore = raw.locationMatchScore;
  }
  if (typeof raw.authorStrengthScore === "number" && Number.isFinite(raw.authorStrengthScore)) {
    normalized.authorStrengthScore = raw.authorStrengthScore;
  }
  if (typeof raw.hiringIntentScore === "number" && Number.isFinite(raw.hiringIntentScore)) {
    normalized.hiringIntentScore = raw.hiringIntentScore;
  }
  if (typeof raw.engagementScore === "number" && Number.isFinite(raw.engagementScore)) {
    normalized.engagementScore = raw.engagementScore;
  }
  if (typeof raw.employmentTypeScore === "number" && Number.isFinite(raw.employmentTypeScore)) {
    normalized.employmentTypeScore = raw.employmentTypeScore;
  }
  if (typeof raw.baseScore === "number" && Number.isFinite(raw.baseScore)) {
    normalized.baseScore = raw.baseScore;
  }
  if (typeof raw.intentBoost === "number" && Number.isFinite(raw.intentBoost)) {
    normalized.intentBoost = raw.intentBoost;
  }
  if (typeof raw.finalScore100 === "number" && Number.isFinite(raw.finalScore100)) {
    normalized.finalScore100 = raw.finalScore100;
  }
  if (typeof raw.gatedToZero === "boolean") {
    normalized.gatedToZero = raw.gatedToZero;
  }
  if ("gateReason" in raw) {
    normalized.gateReason = normalizeScoreBreakdownGateReason(raw.gateReason);
  }

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export async function fetchPriorShownIdentitySet(input: {
  sessionScopeIds: string[];
  userSessionId?: string;
}) {
  const scopeIds = normalizeSessionScopeIds(input);
  if (scopeIds.length === 0) return new Set<string>();

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
    .where(inArray(shownLeads.userSessionId, scopeIds));
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

export async function fetchHiddenLeadExclusions(input: {
  sessionScopeIds: string[];
  userSessionId?: string;
}) {
  const scopeIds = normalizeSessionScopeIds(input);
  if (scopeIds.length === 0) {
    return {
      hiddenLeadIds: new Set<number>(),
      hiddenIdentityKeys: new Set<string>(),
      hiddenCanonicalUrls: new Set<string>(),
    };
  }

  const db = dbClient();
  const rows = await db
    .select({
      leadId: leadEvents.leadId,
      identityKey: leads.identityKey,
      canonicalUrl: leads.canonicalUrl,
    })
    .from(leadEvents)
    .innerJoin(leads, eq(leads.id, leadEvents.leadId))
    .where(
      and(
        inArray(leadEvents.userSessionId, scopeIds),
        eq(leadEvents.eventType, HIDDEN_EVENT_TYPE),
      ),
    );

  const hiddenLeadIds = new Set<number>();
  const hiddenIdentityKeys = new Set<string>();
  const hiddenCanonicalUrls = new Set<string>();
  for (const row of rows) {
    hiddenLeadIds.add(row.leadId);
    if (typeof row.identityKey === "string" && row.identityKey.trim()) {
      hiddenIdentityKeys.add(row.identityKey.trim().toLowerCase());
    }
    if (typeof row.canonicalUrl === "string" && row.canonicalUrl.trim()) {
      hiddenCanonicalUrls.add(row.canonicalUrl.trim().toLowerCase());
    }
  }

  return {
    hiddenLeadIds,
    hiddenIdentityKeys,
    hiddenCanonicalUrls,
  };
}

export async function createSearchRunRecord(input: {
  userSessionId: string;
  role: string;
  location: string;
  recencyPreference: "past-24h" | "past-week" | "past-month";
}) {
  const db = dbClient();
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
  return inserted?.id ?? null;
}

export async function finalizeSearchRunRecord(input: {
  runId: number;
  iterationCount: number;
  stopReason: "sufficient_high_quality_leads" | "max_iterations" | null;
}) {
  const db = dbClient();
  await db
    .update(searchRuns)
    .set({
      iterationCount: input.iterationCount,
      finalStopReason: input.stopReason,
      updatedAt: new Date(),
    })
    .where(eq(searchRuns.id, input.runId));
}

export async function markFinalResponseLeadsAsShown(input: {
  userSessionId: string;
  searchRunId: number;
  iterationNumber: number;
  finalLeads: LeadCardViewModel[];
}) {
  const db = dbClient();
  const urls = input.finalLeads
    .map((l) => l.canonicalUrl)
    .filter((value) => typeof value === "string" && value.trim().length > 0);
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
      const scoreBreakdown = normalizeScoreBreakdown(leadCard.scoreBreakdown);
      const score =
        typeof leadCard.score === "number" && Number.isFinite(leadCard.score)
          ? clamp01(leadCard.score)
          : resolveScoreFromMetadata({
              metadata: null,
              scoreBreakdown,
            });
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
          newBadge: leadCard.newBadge,
          ...(typeof score === "number" ? { score } : {}),
          qualityBadge: leadCard.qualityBadge ?? mapQualityBadge(score),
          postedAt:
            leadCard.postedAt ??
            (row.postedAt instanceof Date ? row.postedAt.toISOString() : null),
          ...(scoreBreakdown ? { scoreBreakdown } : {}),
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
  sessionScopeIds?: string[];
  role: string;
  location: string;
  locationIsHardFilter?: boolean;
  employmentType?: "full-time" | "part-time" | "contract" | "internship" | null;
  recencyPreference: "past-24h" | "past-week" | "past-month";
}): Promise<SearchRunEnvelope> {
  await purgeExpiredLeads({ olderThanDays: 31 });
  const runId = await createSearchRunRecord({
    userSessionId: input.userSessionId,
    role: input.role,
    location: input.location,
    recencyPreference: input.recencyPreference,
  });

  if (!runId) {
    return {
      runId: -1,
      status: "failed",
      pollAfterMs: null,
      result: null,
      error: "Could not create search run",
    };
  }

  const sessionScopeIds = normalizeSessionScopeIds({
    userSessionId: input.userSessionId,
    sessionScopeIds: input.sessionScopeIds,
  });

  try {
    const shownLeadIdentityKeys = Array.from(
      await fetchPriorShownIdentitySet({
        userSessionId: input.userSessionId,
        sessionScopeIds,
      }),
    );
    const hiddenExclusions = await fetchHiddenLeadExclusions({
      userSessionId: input.userSessionId,
      sessionScopeIds,
    });

    const state = await runAgent({
      userSessionId: input.userSessionId,
      role: input.role,
      location: input.location,
      locationIsHardFilter: input.locationIsHardFilter ?? false,
      employmentType: input.employmentType ?? null,
      recencyPreference: input.recencyPreference,
      searchRunId: runId,
      shownLeadIdentityKeys,
      hiddenLeadIdentityKeys: Array.from(hiddenExclusions.hiddenIdentityKeys),
      hiddenLeadCanonicalUrls: Array.from(hiddenExclusions.hiddenCanonicalUrls),
    });

    const final = state.finalResponse;
    const iterationsUsed = final?.iterationsUsed ?? state.iteration + 1;
    const stopReason = final?.stopReason ?? state.stopReason;
    await finalizeSearchRunRecord({
      runId,
      iterationCount: iterationsUsed,
      stopReason,
    });

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
    await finalizeSearchRunRecord({
      runId,
      iterationCount: 0,
      stopReason: "max_iterations",
    });
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
  sessionScopeIds: string[];
  runId: number;
}): Promise<SearchRunEnvelope> {
  const scopeIds = normalizeSessionScopeIds({
    sessionScopeIds: input.sessionScopeIds,
  });
  if (scopeIds.length === 0) {
    return {
      runId: input.runId,
      status: "failed",
      pollAfterMs: null,
      result: null,
      error: "Search run not found",
    };
  }

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
        inArray(searchRuns.userSessionId, scopeIds),
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
        inArray(leadEvents.userSessionId, scopeIds),
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
          })
          .from(leads)
          .where(inArray(leads.id, leadIds))
      : [];
  const leadById = new Map(leadRows.map((l) => [l.id, l]));

  const cards: LeadCardViewModel[] = [];
  for (const event of shownEvents) {
    const leadRow = leadById.get(event.leadId);
    if (!leadRow) continue;
    const metadata = parseCardMetadata(
      (event.metadataJson ?? null) as Record<string, unknown> | null,
    );
    const scoreBreakdown = normalizeScoreBreakdown(
      (event.metadataJson as Record<string, unknown> | null)?.scoreBreakdown,
    );
    const metadataRecord =
      event.metadataJson && typeof event.metadataJson === "object"
        ? (event.metadataJson as Record<string, unknown>)
        : null;
    const score = resolveScoreFromMetadata({
      metadata: metadataRecord,
      scoreBreakdown,
    });
    cards.push({
      leadId: leadRow.id,
      title: (event.metadataJson?.title as string | undefined) ?? leadRow.titleOrRole,
      company:
        (event.metadataJson?.company as string | null | undefined) ?? leadRow.company,
      location:
        (event.metadataJson?.location as string | null | undefined) ?? leadRow.location,
      canonicalUrl: leadRow.canonicalUrl,
      url: leadRow.canonicalUrl,
      snippet:
        (event.metadataJson?.snippet as string | null | undefined) ?? leadRow.snippet,
      sourceType:
        (event.metadataJson?.sourceType as string | undefined) ?? leadRow.sourceType,
      sourceBadge: metadata.sourceBadge ?? "fresh",
      provenanceSources: metadata.provenanceSources ?? ["fresh_search"],
      postedAt:
        (event.metadataJson?.postedAt as string | null | undefined) ??
        (leadRow.postedAt instanceof Date ? leadRow.postedAt.toISOString() : null),
      score,
      isNewForUser: true,
      newBadge: "new",
      qualityBadge: metadata.qualityBadge ?? mapQualityBadge(score),
      ...(scoreBreakdown ? { scoreBreakdown } : {}),
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
  sessionScopeIds: string[];
  limit: number;
}): Promise<HistoryResponse> {
  const scopeIds = normalizeSessionScopeIds({ sessionScopeIds: input.sessionScopeIds });
  if (scopeIds.length === 0) return { items: [] };

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
    .where(inArray(searchRuns.userSessionId, scopeIds))
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

export async function getSavedPostFeed(input: {
  sessionScopeIds: string[];
  limit?: number;
  recencyPreference?: RecencyPreference;
}): Promise<SavedPostFeedResponse> {
  const scopeIds = normalizeSessionScopeIds({ sessionScopeIds: input.sessionScopeIds });
  if (scopeIds.length === 0) return { items: [] };
  const recencyPreference = input.recencyPreference ?? "past-week";
  const recencyDays = recencyPreferenceToDays(recencyPreference);
  const recencyCutoff = new Date(Date.now() - recencyDays * 24 * 60 * 60 * 1000);

  const db = dbClient();
  const hidden = await fetchHiddenLeadExclusions({ sessionScopeIds: scopeIds });
  const fetchLimit = Math.max((input.limit ?? 200) * 6, 500);
  const shownRows = await db
    .select({
      leadId: leadEvents.leadId,
      shownAt: leadEvents.createdAt,
      searchRunId: leadEvents.searchRunId,
      metadataJson: leadEvents.metadataJson,
      canonicalUrl: leads.canonicalUrl,
      identityKey: leads.identityKey,
      titleOrRole: leads.titleOrRole,
      company: leads.company,
      location: leads.location,
      normalizedLocationJson: leads.normalizedLocationJson,
      employmentType: leads.employmentType,
      workMode: leads.workMode,
      author: leads.author,
      snippet: leads.snippet,
      sourceType: leads.sourceType,
      postedAt: leads.postedAt,
      sourceMetadataJson: leads.sourceMetadataJson,
      runRole: searchRuns.role,
      runLocation: searchRuns.location,
    })
    .from(leadEvents)
    .innerJoin(leads, eq(leads.id, leadEvents.leadId))
    .leftJoin(searchRuns, eq(searchRuns.id, leadEvents.searchRunId))
    .where(
      and(
        inArray(leadEvents.userSessionId, scopeIds),
        eq(leadEvents.eventType, SHOWN_EVENT_TYPE),
      ),
    )
    .orderBy(desc(leadEvents.createdAt))
    .limit(fetchLimit);

  const seenLeadIds = new Set<number>();
  const items: SavedPostFeedResponse["items"] = [];
  for (const row of shownRows) {
    if (seenLeadIds.has(row.leadId)) continue;
    seenLeadIds.add(row.leadId);

    const identityKey = readString(row.identityKey)?.toLowerCase() ?? null;
    const canonicalUrl = normalizeUrlForLookup(row.canonicalUrl);
    if (hidden.hiddenLeadIds.has(row.leadId)) continue;
    if (identityKey && hidden.hiddenIdentityKeys.has(identityKey)) continue;
    if (canonicalUrl && hidden.hiddenCanonicalUrls.has(canonicalUrl)) continue;
    const leadRecencyDate = row.postedAt ?? row.shownAt;
    if (leadRecencyDate < recencyCutoff) continue;

    const sourceMetadata =
      row.sourceMetadataJson && typeof row.sourceMetadataJson === "object"
        ? (row.sourceMetadataJson as Record<string, unknown>)
        : null;
    const metadata =
      row.metadataJson && typeof row.metadataJson === "object"
        ? (row.metadataJson as Record<string, unknown>)
        : null;
    const cardMetadata = parseCardMetadata(metadata);
    const scoreBreakdown = normalizeScoreBreakdown(metadata?.scoreBreakdown);
    const postContext = readPostContext(sourceMetadata);
    const score = resolveScoreFromMetadata({ metadata, scoreBreakdown });
    const sourceBadge = cardMetadata.sourceBadge ?? "fresh";
    const locations = parseLeadLocationsFromDb({
      normalizedLocationJson: row.normalizedLocationJson,
      fallbackRawLocation: row.location,
    });

    items.push({
      lead: {
        leadId: row.leadId,
        identityKey: readString(row.identityKey),
        title: readString((metadata as Record<string, unknown> | null)?.title) ?? row.titleOrRole,
        company: readString((metadata as Record<string, unknown> | null)?.company) ?? row.company,
        location: readString((metadata as Record<string, unknown> | null)?.location) ?? row.location,
        locations,
        rawLocationText: row.location,
        canonicalUrl: row.canonicalUrl,
        url: row.canonicalUrl,
        postUrl: postContext?.primaryPostUrl ?? row.canonicalUrl,
        postAuthor: postContext?.primaryAuthorName ?? row.author,
        postAuthorUrl: postContext?.primaryAuthorProfileUrl ?? null,
        jobTitle: row.titleOrRole,
        jobLocation:
          readString((metadata as Record<string, unknown> | null)?.location) ?? row.location,
        score,
        ...(scoreBreakdown ? { scoreBreakdown } : {}),
        freshness: sourceBadge,
        snippet: readString((metadata as Record<string, unknown> | null)?.snippet) ?? row.snippet,
        sourceType: readString((metadata as Record<string, unknown> | null)?.sourceType) ?? row.sourceType,
        sourceBadge,
        provenanceSources:
          cardMetadata.provenanceSources ??
          (sourceBadge === "both"
            ? ["retrieval", "fresh_search"]
            : sourceBadge === "retrieved"
              ? ["retrieval"]
              : ["fresh_search"]),
        postedAt:
          readString((metadata as Record<string, unknown> | null)?.postedAt) ??
          (row.postedAt instanceof Date ? row.postedAt.toISOString() : null),
        isNewForUser: false,
        qualityBadge: cardMetadata.qualityBadge ?? mapQualityBadge(score),
        workMode: parseWorkMode(row.workMode),
        employmentType: parseEmploymentType(row.employmentType),
        sourceMetadataJson: sourceMetadata,
      },
      runContext: {
        role: readString(row.runRole) ?? "Unknown role",
        location: readString(row.runLocation) ?? "Unknown location",
        searchRunId: row.searchRunId ?? null,
        shownAt: toIso(row.shownAt),
      },
    });

    if (items.length >= (input.limit ?? 200)) break;
  }

  return { items };
}
