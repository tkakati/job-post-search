import type { AgentGraphState } from "@/lib/agent/state";
import { appendDebug } from "@/lib/agent/nodes/helpers";

/**
 * execution_routing:
 * Runs after planning and decides execution order:
 * - retrieval_only: retrieval enabled, fresh generation disabled
 * - fresh_only: retrieval disabled, fresh generation enabled
 * - both: retrieval + fresh generation enabled (retrieval runs first, then retrieval_arm routes onward)
 */
export async function executionRoutingNode(state: AgentGraphState) {
  const startedAt = Date.now();
  const enableRetrieval = state.plannerOutput?.enableRetrieval ?? false;
  const enableFresh = state.plannerOutput?.enableNewLeadGeneration ?? false;
  const mode = enableRetrieval && enableFresh
    ? "both"
    : enableRetrieval
      ? "retrieval_only"
      : "fresh_only";
  const next = enableRetrieval ? "retrieval_arm" : "query_generation";

  return {
    routingDiagnostics: {
      elapsedMs: Date.now() - startedAt,
    },
    debugLog: appendDebug(
      state,
      `execution_routing => mode=${mode}, next=${next}, execution_sequence=${
        enableRetrieval && enableFresh
          ? "retrieval → fresh_generation"
          : enableRetrieval
            ? "retrieval_only"
            : "fresh_only"
      }`,
    ),
  };
}

export function routeFromExecution(state: AgentGraphState) {
  const enableRetrieval = state.plannerOutput?.enableRetrieval ?? false;
  const enableFresh = state.plannerOutput?.enableNewLeadGeneration ?? false;

  // Three explicit planner-driven modes:
  // 1) both            => retrieval_arm first (retrieval_arm decides to continue to query_generation)
  // 2) retrieval_only  => retrieval_arm only
  // 3) fresh_only      => query_generation only
  if (enableRetrieval && enableFresh) return "retrieval_arm";
  if (enableRetrieval && !enableFresh) return "retrieval_arm";
  return "query_generation";
}
