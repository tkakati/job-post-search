import type { AgentGraphState } from "@/lib/agent/state";
import { SearchOutputSchema } from "@/lib/schemas/contracts";
import { appendDebug } from "@/lib/agent/nodes/helpers";
import { runSearchNode } from "@/features/lead-generation/search-node";

/**
 * search:
 * Executes generated queries via search provider integrations.
 * Deterministic stub to keep graph behavior testable.
 */
export async function searchNode(state: AgentGraphState) {
  const searchResults = SearchOutputSchema.parse(
    await runSearchNode({ state }),
  );
  const searchCalls = Number(searchResults.providerMetadataJson.queryCount ?? 0);
  const queryErrors = Array.isArray(searchResults.providerMetadataJson.queryErrors)
    ? searchResults.providerMetadataJson.queryErrors.length
    : 0;
  const fallbackUsed = Boolean(searchResults.providerMetadataJson.fallbackUsed);
  const iterationMetrics =
    searchResults.providerMetadataJson.iterationMetrics &&
    typeof searchResults.providerMetadataJson.iterationMetrics === "object"
      ? (searchResults.providerMetadataJson.iterationMetrics as Record<string, unknown>)
      : null;
  const queryFanoutMs = Number(iterationMetrics?.queryFanoutMs ?? 0);
  const profileEnrichmentMs = Number(iterationMetrics?.profileEnrichmentMs ?? 0);
  const persistenceUpdateMs = Number(iterationMetrics?.persistenceUpdateMs ?? 0);

  return {
    searchResults,
    debugLog: appendDebug(
      state,
      `search => latency=${searchResults.diagnostics.elapsedMs}ms, searchCalls=${searchCalls}, results=${searchResults.searchDiagnostics.totalKept}, fetched=${searchResults.searchDiagnostics.totalFetched}, deduped=${searchResults.searchDiagnostics.dedupedCount}, stagesMs={fanout:${queryFanoutMs}, enrichment:${profileEnrichmentMs}, persistence:${persistenceUpdateMs}}, queryErrors=${queryErrors}, fallbackUsed=${fallbackUsed}, query_performance updated for ${searchResults.providerMetadataJson.queryPerformanceUpdatedCount ?? 0} queries`,
    ),
  };
}
