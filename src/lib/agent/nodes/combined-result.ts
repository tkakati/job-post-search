import type { AgentGraphState } from "@/lib/agent/state";
import type { LeadRecord, UnifiedLead } from "@/lib/types/contracts";
import { CombinedResultOutputSchema } from "@/lib/schemas/contracts";
import { appendDebug } from "@/lib/agent/nodes/helpers";
import { leadDedupKey, leadRichnessScore } from "@/lib/utils/lead-dedupe";
import { primaryLeadLocationText } from "@/lib/location/geo";

/**
 * combined_result:
 * Merges retrieval + fresh search results and computes "new for this user".
 * Loop decisions are handled by scoring_node.
 */
export async function combinedResultNode(state: AgentGraphState) {
  const combineStartedAt = Date.now();
  const retrievalLeads = state.retrievalResults?.retrievedLeads ?? [];
  const searchLeads =
    state.extractionResults?.normalizedLeads ??
    state.searchResults?.normalizedSearchResults ??
    [];
  const mergedLeads = [...retrievalLeads, ...searchLeads];

  const byDedupeKey = new Map<
    string,
    {
      lead: LeadRecord;
      sources: Set<"retrieval" | "fresh_search">;
      identityKeys: Set<string>;
    }
  >();

  const withSource: Array<{ lead: LeadRecord; source: "retrieval" | "fresh_search" }> = [
    ...retrievalLeads.map((lead) => ({ lead, source: "retrieval" as const })),
    ...searchLeads.map((lead) => ({ lead, source: "fresh_search" as const })),
  ];

  for (const { lead, source } of withSource) {
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
        sources: new Set([source]),
        identityKeys: new Set([lead.identityKey]),
      });
      continue;
    }

    existing.sources.add(source);
    existing.identityKeys.add(lead.identityKey);

    const existingSourcePriority = existing.sources.has("fresh_search") ? 1 : 0;
    const currentSourcePriority = source === "fresh_search" ? 1 : 0;
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
    totalRetrievedCount: retrievalLeads.length,
    totalGeneratedCount: searchLeads.length,
    totalMergedCount: combineDedupedLeads.length,
    totalNewLeadCountForUser: newLeadsForUser.length,
    taskComplete,
    stopReason,
    combinedDiagnostics: {
      iteration: state.iteration,
      maxIterations: state.maxIterations,
      shownHistoryCount: shown.size,
      dedupedFromMergedCount: mergedLeads.length - combineDedupedLeads.length,
    },
  });

  return {
    combinedResults,
    taskComplete: false,
    stopReason: null,
    iteration: state.iteration,
    debugLog: appendDebug(
      state,
      `combined_result => new=${combinedResults.totalNewLeadCountForUser}, deduped=${mergedLeads.length - combineDedupedLeads.length}, stopReason=deferred_to_scoring_node, retrievalTimeMs=${retrievalLatencyMs}, searchTimeMs=${searchLatencyMs}, combineTimeMs=${combineTimeMs}, totalIterationTimeMs=${totalIterationTimeMs}, iteration => latency=${totalIterationTimeMs}ms, searchCalls=${searchCalls}, results=${resultsCount}`,
    ),
  };
}
