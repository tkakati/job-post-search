import type { AgentGraphState } from "@/lib/agent/state";
import type { LeadRecord, UnifiedLead } from "@/lib/types/contracts";
import { CombinedResultOutputSchema } from "@/lib/schemas/contracts";
import { appendDebug } from "@/lib/agent/nodes/helpers";
import { leadDedupKey, leadRichnessScore } from "@/lib/utils/lead-dedupe";
import { primaryLeadLocationText } from "@/lib/location/geo";
import { isLeadCountryEligibleForUser } from "@/lib/location/country-eligibility";
import { dedupeRedundantLeads } from "@/lib/leads/redundancy";

function filterLeadsByCountry(input: {
  leads: LeadRecord[];
  userLocation: string;
}): { filtered: LeadRecord[]; countryMismatchDroppedCount: number } {
  let countryMismatchDroppedCount = 0;
  const filtered: LeadRecord[] = [];

  for (const lead of input.leads) {
    const eligibility = isLeadCountryEligibleForUser({
      userLocation: input.userLocation,
      lead: {
        locations: lead.locations,
        rawLocationText: lead.rawLocationText ?? null,
      },
    });
    if (!eligibility.eligible && eligibility.reason === "country_mismatch") {
      countryMismatchDroppedCount += 1;
      continue;
    }
    filtered.push(lead);
  }

  return { filtered, countryMismatchDroppedCount };
}

/**
 * combined_result:
 * Merges retrieval + fresh search results and computes "new for this user".
 * Loop decisions are handled by scoring_node.
 */
export async function combinedResultNode(state: AgentGraphState) {
  const combineStartedAt = Date.now();
  const retrievalLeads = state.retrievalResults?.retrievedLeads ?? [];
  const extractedSearchLeads = state.extractionResults?.normalizedLeads ?? [];
  // If extraction produced no normalized leads, keep search-node normalized leads
  // so the run does not collapse to zero fresh leads when extraction fallback is weak.
  const searchLeads =
    extractedSearchLeads.length > 0
      ? extractedSearchLeads
      : (state.searchResults?.normalizedSearchResults ?? []);
  const retrievalCountryFiltered = filterLeadsByCountry({
    leads: retrievalLeads,
    userLocation: state.location,
  });
  const searchCountryFiltered = filterLeadsByCountry({
    leads: searchLeads,
    userLocation: state.location,
  });
  const retrievalRedundancyDeduped = dedupeRedundantLeads({
    items: retrievalCountryFiltered.filtered,
    toComparable: (lead) => ({
      sourceMetadataJson: lead.sourceMetadataJson ?? null,
      author: lead.author ?? null,
      titleOrRole: lead.titleOrRole ?? null,
      fullText: lead.fullText ?? null,
      snippet: lead.snippet ?? null,
      postedAt: lead.postedAt ?? null,
      fetchedAt: lead.fetchedAt ?? null,
    }),
    getRichnessScore: (lead) => leadRichnessScore(lead),
  });
  const searchRedundancyDeduped = dedupeRedundantLeads({
    items: searchCountryFiltered.filtered,
    toComparable: (lead) => ({
      sourceMetadataJson: lead.sourceMetadataJson ?? null,
      author: lead.author ?? null,
      titleOrRole: lead.titleOrRole ?? null,
      fullText: lead.fullText ?? null,
      snippet: lead.snippet ?? null,
      postedAt: lead.postedAt ?? null,
      fetchedAt: lead.fetchedAt ?? null,
    }),
    getRichnessScore: (lead) => leadRichnessScore(lead),
  });
  const withSource: Array<{ lead: LeadRecord; source: "retrieval" | "fresh_search" }> = [
    ...retrievalRedundancyDeduped.deduped.map((lead) => ({ lead, source: "retrieval" as const })),
    ...searchRedundancyDeduped.deduped.map((lead) => ({ lead, source: "fresh_search" as const })),
  ];

  const mergedLeads = withSource.map((row) => row.lead);
  const crossSourceRedundancyDeduped = dedupeRedundantLeads({
    items: withSource,
    toComparable: (row) => ({
      sourceMetadataJson: row.lead.sourceMetadataJson ?? null,
      author: row.lead.author ?? null,
      titleOrRole: row.lead.titleOrRole ?? null,
      fullText: row.lead.fullText ?? null,
      snippet: row.lead.snippet ?? null,
      postedAt: row.lead.postedAt ?? null,
      fetchedAt: row.lead.fetchedAt ?? null,
    }),
    getRichnessScore: (row) => leadRichnessScore(row.lead) + (row.source === "fresh_search" ? 1 : 0),
  });

  const nearDedupedEntries = crossSourceRedundancyDeduped.clusters.map((cluster) => {
    const sources = new Set<"retrieval" | "fresh_search">();
    const identityKeys = new Set<string>();
    for (const member of cluster.members) {
      sources.add(member.source);
      identityKeys.add(member.lead.identityKey);
    }
    return {
      lead: cluster.winner.lead,
      sources,
      identityKeys,
    };
  });

  const byDedupeKey = new Map<
    string,
    {
      lead: LeadRecord;
      sources: Set<"retrieval" | "fresh_search">;
      identityKeys: Set<string>;
    }
  >();

  for (const entry of nearDedupedEntries) {
    const lead = entry.lead;
    const key = leadDedupKey({
      canonicalUrl: lead.canonicalUrl,
      titleOrRole: lead.titleOrRole,
      company: lead.company,
      rawLocationText: primaryLeadLocationText(lead),
    });
    const existing = byDedupeKey.get(key);
    if (!existing) {
      byDedupeKey.set(key, {
        lead,
        sources: new Set(entry.sources),
        identityKeys: new Set(entry.identityKeys),
      });
      continue;
    }

    for (const source of entry.sources) existing.sources.add(source);
    for (const identityKey of entry.identityKeys) existing.identityKeys.add(identityKey);

    const existingSourcePriority = existing.sources.has("fresh_search") ? 1 : 0;
    const currentSourcePriority = entry.sources.has("fresh_search") ? 1 : 0;
    const existingScore = leadRichnessScore(existing.lead) + existingSourcePriority;
    const currentScore = leadRichnessScore(lead) + currentSourcePriority;
    if (currentScore > existingScore) {
      existing.lead = lead;
    }
  }

  const combineDedupedEntries = Array.from(byDedupeKey.values());
  const combineDedupedLeads = combineDedupedEntries.map((entry) => entry.lead);
  const extractedLeads = state.extractionResults?.leads ?? [];

  const shown = new Set(state.shownLeadIdentityKeys);
  const newLeadsForUser = combineDedupedEntries
    .filter((entry) => !Array.from(entry.identityKeys).some((id) => shown.has(id)))
    .map((entry) => entry.lead);

  // Loop control is handled in scoring_node.
  const taskComplete = false;
  const stopReason = null;
  const retrievalLatencyMs =
    state.retrievalResults?.retrievalDiagnostics?.elapsedMs ?? 0;
  const searchLatencyMs = state.searchResults?.diagnostics?.elapsedMs ?? 0;
  const combineTimeMs = Date.now() - combineStartedAt;
  const totalIterationTimeMs = retrievalLatencyMs + searchLatencyMs + combineTimeMs;
  const crossSourceRedundancyDroppedCount =
    retrievalRedundancyDeduped.droppedCount +
    searchRedundancyDeduped.droppedCount +
    crossSourceRedundancyDeduped.droppedCount;
  const countryMismatchDroppedCount =
    retrievalCountryFiltered.countryMismatchDroppedCount +
    searchCountryFiltered.countryMismatchDroppedCount;
  const searchCalls = Number(state.searchResults?.providerMetadataJson?.queryCount ?? 0);
  const resultsCount = state.searchResults?.searchDiagnostics?.totalKept ?? 0;

  const combinedResults = CombinedResultOutputSchema.parse({
    roleLocationKey: state.roleLocationKey,
    mergedLeads,
    dedupedLeads: combineDedupedLeads,
    newLeadsForUser,
    leads: [
      ...extractedLeads,
      ...newLeadsForUser.map(
        (lead): UnifiedLead => ({
          url: lead.canonicalUrl,
          role: lead.titleOrRole || null,
          location: primaryLeadLocationText(lead),
          company: lead.company ?? null,
          isHiring: Boolean(lead.hiringIntentScore && lead.hiringIntentScore > 0.5),
          roleMatchScore: 0,
          locationMatchScore: 0,
          rawText: lead.fullText ?? lead.snippet ?? lead.titleOrRole,
          score: 0,
        }),
      ),
    ],
    leadProvenance: combineDedupedEntries.map((entry) => ({
      identityKey: entry.lead.identityKey,
      sources: Array.from(entry.sources),
      isNewForUser: !Array.from(entry.identityKeys).some((id) => shown.has(id)),
    })),
    totalRetrievedCount: retrievalRedundancyDeduped.deduped.length,
    totalGeneratedCount: searchRedundancyDeduped.deduped.length,
    totalMergedCount: combineDedupedLeads.length,
    totalNewLeadCountForUser: newLeadsForUser.length,
    taskComplete,
    stopReason,
    combinedDiagnostics: {
      iteration: state.iteration,
      maxIterations: state.maxIterations,
      shownHistoryCount: shown.size,
      dedupedFromMergedCount: mergedLeads.length - combineDedupedLeads.length,
      retrievalLatencyMs,
      searchLatencyMs,
      combineTimeMs,
      totalIterationTimeMs,
      crossSourceRedundancyDroppedCount,
      countryMismatchDroppedCount,
    },
  });

  return {
    combinedResults,
    taskComplete: false,
    stopReason: null,
    iteration: state.iteration,
    debugLog: appendDebug(
      state,
      `combined_result => new=${combinedResults.totalNewLeadCountForUser}, deduped=${mergedLeads.length - combineDedupedLeads.length}, redundantDroppedCount=${crossSourceRedundancyDroppedCount}, countryMismatchDroppedCount=${countryMismatchDroppedCount}, stopReason=deferred_to_scoring_node, retrievalTimeMs=${retrievalLatencyMs}, searchTimeMs=${searchLatencyMs}, combineTimeMs=${combineTimeMs}, totalIterationTimeMs=${totalIterationTimeMs}, iteration => latency=${totalIterationTimeMs}ms, searchCalls=${searchCalls}, results=${resultsCount}`,
    ),
  };
}
