import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { AgentGraphState } from "@/lib/agent/state";
import type { LeadRecord } from "@/lib/types/contracts";
import { RetrievalOutputSchema } from "@/lib/schemas/contracts";
import { appendDebug } from "@/lib/agent/nodes/helpers";
import { dbClient } from "@/lib/db";
import { leads, shownLeads } from "@/lib/db/schema";
import { canonicalLeadIdentity } from "@/lib/utils/lead-identity";
import { recencyPreferenceToDays } from "@/lib/utils/recency";
import { coerceLeadLocations } from "@/lib/location/geo";

type LeadDbRow = {
  id: number;
  canonicalUrl: string;
  identityKey: string;
  sourceType: string;
  titleOrRole: string;
  company: string | null;
  location: string | null;
  normalizedLocationJson: Record<string, unknown> | string | null;
  employmentType: string | null;
  workMode: string | null;
  author: string | null;
  snippet: string | null;
  fullText: string | null;
  postedAt: Date | null;
  fetchedAt: Date | null;
  roleEmbedding: number[] | null;
  hiringIntentScore: number | null;
  leadScore: number | null;
  roleLocationKey: string;
  sourceMetadataJson: Record<string, unknown> | null;
  createdAt: Date;
};

export type LeadWithShown = LeadRecord & { isShownForUser: boolean };

function toIso(value: Date | null | undefined) {
  return value instanceof Date ? value.toISOString() : null;
}

function effectiveRecencyDate(lead: {
  postedAt: Date | null;
  fetchedAt: Date | null;
}): Date | null {
  if (lead.postedAt instanceof Date) return lead.postedAt;
  if (lead.fetchedAt instanceof Date) return lead.fetchedAt;
  return null;
}

export async function fetchLeadsForRoleLocation(input: {
  roleLocationKey: string;
  recencyPreference: AgentGraphState["recencyPreference"];
  limit?: number;
}): Promise<LeadDbRow[]> {
  const db = dbClient();
  const recencyDays = recencyPreferenceToDays(input.recencyPreference);
  const since = new Date(
    Date.now() - recencyDays * 24 * 60 * 60 * 1000,
  );

  const rows = await db
    .select({
      id: leads.id,
      canonicalUrl: leads.canonicalUrl,
      identityKey: leads.identityKey,
      sourceType: leads.sourceType,
      titleOrRole: leads.titleOrRole,
      company: leads.company,
      location: leads.location,
      normalizedLocationJson: leads.normalizedLocationJson,
      employmentType: leads.employmentType,
      workMode: leads.workMode,
      author: leads.author,
      snippet: leads.snippet,
      fullText: leads.fullText,
      postedAt: leads.postedAt,
      fetchedAt: leads.fetchedAt,
      roleEmbedding: leads.roleEmbedding,
      hiringIntentScore: leads.hiringIntentScore,
      leadScore: leads.leadScore,
      roleLocationKey: leads.roleLocationKey,
      sourceMetadataJson: leads.sourceMetadataJson,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .where(
      and(
        eq(leads.roleLocationKey, input.roleLocationKey),
        gte(
          sql<Date>`COALESCE(${leads.postedAt}, ${leads.fetchedAt})`,
          since,
        ),
      ),
    )
    .orderBy(desc(leads.postedAt), desc(leads.fetchedAt), desc(leads.createdAt))
    .limit(input.limit ?? 200);

  return rows;
}

export function filterLeadsByRecency(input: {
  leads: LeadDbRow[];
  recencyPreference: AgentGraphState["recencyPreference"];
}): LeadDbRow[] {
  const recencyDays = recencyPreferenceToDays(input.recencyPreference);
  const since = new Date(
    Date.now() - recencyDays * 24 * 60 * 60 * 1000,
  );
  return input.leads.filter((lead) => {
    const anchor = effectiveRecencyDate(lead);
    if (!anchor) return false;
    return anchor.getTime() >= since.getTime();
  });
}

function normalizeLead(lead: LeadDbRow): LeadRecord {
  const fallbackIdentity = canonicalLeadIdentity({
    url: lead.canonicalUrl,
    titleOrRole: lead.titleOrRole,
    company: lead.company,
    location: lead.location,
  });

  const employmentType =
    lead.employmentType === "full-time" ||
    lead.employmentType === "part-time" ||
    lead.employmentType === "contract" ||
    lead.employmentType === "internship"
      ? lead.employmentType
      : null;
  const workMode =
    lead.workMode === "onsite" ||
    lead.workMode === "hybrid" ||
    lead.workMode === "remote"
      ? lead.workMode
      : null;

  return {
    id: lead.id,
    canonicalUrl: fallbackIdentity.canonicalUrl,
    identityKey: lead.identityKey || fallbackIdentity.identityKey,
    sourceType: lead.sourceType,
    titleOrRole: lead.titleOrRole,
    company: lead.company,
    locations: coerceLeadLocations({
      locations:
        lead.normalizedLocationJson &&
        typeof lead.normalizedLocationJson === "object" &&
        Array.isArray((lead.normalizedLocationJson as Record<string, unknown>).locations)
          ? ((lead.normalizedLocationJson as Record<string, unknown>)
              .locations as LeadRecord["locations"])
          : undefined,
      rawLocationText: lead.location,
      location: lead.location,
    }),
    rawLocationText: lead.location,
    normalizedLocationJson: lead.normalizedLocationJson,
    employmentType,
    workMode,
    author: lead.author,
    snippet: lead.snippet,
    fullText: lead.fullText,
    postedAt: toIso(lead.postedAt),
    fetchedAt: toIso(lead.fetchedAt),
    roleEmbedding:
      Array.isArray(lead.roleEmbedding) &&
      lead.roleEmbedding.every((value) => typeof value === "number")
        ? lead.roleEmbedding
        : null,
    hiringIntentScore: lead.hiringIntentScore,
    leadScore: lead.leadScore,
    roleLocationKey: lead.roleLocationKey,
    sourceMetadataJson: lead.sourceMetadataJson ?? null,
  };
}

export async function markLeadsShownVsUnseen(input: {
  userSessionId: string;
  normalizedLeads: LeadRecord[];
}): Promise<LeadWithShown[]> {
  const db = dbClient();
  const ids = input.normalizedLeads
    .map((lead) => lead.id)
    .filter((id): id is number => typeof id === "number");

  if (ids.length === 0) {
    return input.normalizedLeads.map((lead) => ({
      ...lead,
      isShownForUser: false,
    }));
  }

  const shown = await db
    .select({ leadId: shownLeads.leadId })
    .from(shownLeads)
    .where(
      and(
        eq(shownLeads.userSessionId, input.userSessionId),
        inArray(shownLeads.leadId, ids),
      ),
    );
  const shownSet = new Set(shown.map((row) => row.leadId));

  return input.normalizedLeads.map((lead) => ({
    ...lead,
    isShownForUser: lead.id ? shownSet.has(lead.id) : false,
  }));
}

export function summarizeRetrievedLeads(input: {
  roleLocationKey: string;
  recencyPreference: AgentGraphState["recencyPreference"];
  retrievedBeforeRecencyFilter: number;
  retrievedAfterRecencyFilter: number;
  leadsWithShown: LeadWithShown[];
  elapsedMs: number;
}) {
  const unseen = input.leadsWithShown.filter((lead) => !lead.isShownForUser);

  return {
    totalRetrievedCount: input.retrievedAfterRecencyFilter,
    newUnseenCountForUser: unseen.length,
    retrievalDiagnostics: {
      recencyPreference: input.recencyPreference,
      retrievedBeforeRecencyFilter: input.retrievedBeforeRecencyFilter,
      retrievedAfterRecencyFilter: input.retrievedAfterRecencyFilter,
      shownCountForUser: input.leadsWithShown.length - unseen.length,
      elapsedMs: input.elapsedMs,
    },
  };
}

/**
 * retrieval_arm:
 * Fetches previously stored leads for this role/location.
 * Invoked from execution routing during planning-driven execution.
 */
export async function retrievalArmNode(state: AgentGraphState) {
  const t0 = Date.now();
  const isFirstIteration = state.iteration === 0;
  const hasFreshQueriesExecutedYet =
    state.generatedQueries != null ||
    state.searchResults != null ||
    state.extractionResults != null;
  const retrievalPhase =
    isFirstIteration && !hasFreshQueriesExecutedYet
      ? "initial_retrieval"
      : "iterative_retrieval";
  const fetched = await fetchLeadsForRoleLocation({
    roleLocationKey: state.roleLocationKey,
    recencyPreference: state.recencyPreference,
  });
  const recencyFiltered = filterLeadsByRecency({
    leads: fetched,
    recencyPreference: state.recencyPreference,
  });
  const normalized = recencyFiltered.map(normalizeLead);
  const leadsWithShown = await markLeadsShownVsUnseen({
    userSessionId: state.userSessionId,
    normalizedLeads: normalized,
  });

  const elapsedMs = Date.now() - t0;
  const summary = summarizeRetrievedLeads({
    roleLocationKey: state.roleLocationKey,
    recencyPreference: state.recencyPreference,
    retrievedBeforeRecencyFilter: fetched.length,
    retrievedAfterRecencyFilter: recencyFiltered.length,
    leadsWithShown,
    elapsedMs,
  });

  const retrievalResults = RetrievalOutputSchema.parse({
    roleLocationKey: state.roleLocationKey,
    retrievedLeads: leadsWithShown.map((lead) => ({
      id: lead.id,
      canonicalUrl: lead.canonicalUrl,
      identityKey: lead.identityKey,
      sourceType: lead.sourceType,
      titleOrRole: lead.titleOrRole,
      company: lead.company ?? null,
      locations: lead.locations ?? [],
      rawLocationText: lead.rawLocationText ?? null,
      normalizedLocationJson:
        lead.normalizedLocationJson ??
        { locations: lead.locations ?? [] },
      employmentType: lead.employmentType ?? null,
      workMode: lead.workMode ?? null,
      author: lead.author ?? null,
      snippet: lead.snippet ?? null,
      fullText: lead.fullText ?? null,
      postedAt: lead.postedAt ?? null,
      fetchedAt: lead.fetchedAt ?? null,
      roleEmbedding: lead.roleEmbedding ?? null,
      hiringIntentScore: lead.hiringIntentScore ?? null,
      roleLocationKey: lead.roleLocationKey,
      sourceMetadataJson: lead.sourceMetadataJson ?? null,
    })),
    totalRetrievedCount: summary.totalRetrievedCount,
    newUnseenCountForUser: summary.newUnseenCountForUser,
    retrievalDiagnostics: summary.retrievalDiagnostics,
  });
  const next =
    state.iteration === 0 && state.scoringResults == null
      ? "combined_result"
      : state.plannerOutput?.enableNewLeadGeneration
        ? "query_generation"
        : "combined_result";

  return {
    retrievalResults,
    retrievalSummarySignal: {
      newUnseenRetrievedLeads: summary.newUnseenCountForUser,
      totalRetrievedCandidates: summary.totalRetrievedCount,
      signalSource: "retrieval_node",
    },
    debugLog: appendDebug(
      state,
      `retrieval_arm => phase=${retrievalPhase}, next=${next}`,
    ),
  };
}

export function routeAfterRetrieval(state: AgentGraphState) {
  // Bootstrap path: after the very first retrieval, always score retrieved leads first.
  // This enables immediate retrieval-backed results before fresh generation starts.
  if (state.iteration === 0 && state.scoringResults == null) {
    return "combined_result";
  }
  // In normal "both" mode, retrieval hands off to query generation.
  // In retrieval-only mode, proceed to combine -> scoring -> potential finalization.
  return state.plannerOutput?.enableNewLeadGeneration ? "query_generation" : "combined_result";
}
