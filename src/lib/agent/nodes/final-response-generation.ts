import type { AgentGraphState } from "@/lib/agent/state";
import { FinalResponseOutputSchema } from "@/lib/schemas/contracts";
import { appendDebug } from "@/lib/agent/nodes/helpers";
import { buildLeadCardsFromLeads } from "@/lib/agent/formatters/build-lead-cards";

const FINAL_RESPONSE_MAX_LEADS = 20;

/**
 * final_response_generation:
 * Produces the final user payload from combined results.
 */
export async function finalResponseGenerationNode(state: AgentGraphState) {
  const combined = state.combinedResults;
  const plannerMode = state.plannerOutput?.plannerMode ?? "exploit_heavy";
  const finalizationMode =
    state.plannerOutput?.enableNewLeadGeneration === false
      ? "retrieval_only_finalization"
      : "adaptive_exploration";
  const scoredRankedLeads = state.scoringResults?.rankedLeads ?? [];
  const selected =
    scoredRankedLeads.length > 0
      ? scoredRankedLeads
      : (combined?.newLeadsForUser ?? []);
  const leadCards = buildLeadCardsFromLeads({
    selectedLeads: selected,
    leadProvenance: combined?.leadProvenance ?? [],
    maxLeads: FINAL_RESPONSE_MAX_LEADS,
    scope: "all",
  });

  const noNewLeads = leadCards.length === 0;
  const summary =
    state.stopReason === "sufficient_high_quality_leads"
      ? `Found ${leadCards.length} high-quality leads for ${state.role} in ${state.location}.`
      : noNewLeads
        ? `No new leads found after ${state.maxIterations} iterations for ${state.role} in ${state.location}.`
        : `Reached max iterations (${state.maxIterations}) with ${leadCards.length} new leads for ${state.role} in ${state.location}.`;

  const finalResponse = FinalResponseOutputSchema.parse({
    taskComplete: state.taskComplete,
    stopReason: state.stopReason,
    plannerMode,
    iterationsUsed: state.iteration + 1,
    leads: leadCards,
    summary,
    totalCounts: {
      retrieved: combined?.totalRetrievedCount ?? 0,
      generated: combined?.totalGeneratedCount ?? 0,
      merged: combined?.totalMergedCount ?? 0,
      newForUser: combined?.totalNewLeadCountForUser ?? 0,
    },
    emptyState: noNewLeads
      ? {
          isEmpty: true,
          title: "No new leads yet",
          message:
            "We could not find new leads for this role/location with current signals.",
          suggestion:
            "Try broadening location, increasing recency window, or rerunning later for fresh posts.",
        }
      : {
          isEmpty: false,
          title: "New leads ready",
          message: "We found new leads for your search.",
        },
  });

  return {
    finalResponse,
    debugLog: appendDebug(
      state,
      `final_response_generation => finalization_mode=${finalizationMode}, leads=${finalResponse.leads.length}, cap=${FINAL_RESPONSE_MAX_LEADS}, stopReason=${finalResponse.stopReason}, empty=${finalResponse.emptyState.isEmpty}`,
    ),
  };
}
