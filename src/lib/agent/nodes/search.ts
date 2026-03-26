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

  return {
    searchResults,
    debugLog: appendDebug(
      state,
      `search => latency=${searchResults.diagnostics.elapsedMs}ms, searchCalls=${searchCalls}, results=${searchResults.searchDiagnostics.totalKept}, fetched=${searchResults.searchDiagnostics.totalFetched}, deduped=${searchResults.searchDiagnostics.dedupedCount}, queryErrors=${queryErrors}, fallbackUsed=${fallbackUsed}, query_performance updated for ${searchResults.providerMetadataJson.queryPerformanceUpdatedCount ?? 0} queries`,
    ),
  };
}

