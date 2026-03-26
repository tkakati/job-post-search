import type { AgentGraphState } from "../state";
import { PlannerOutputSchema } from "../../schemas/contracts";
import { appendDebug } from "./helpers";
import { roleLocationKey } from "../../utils/role-location";
import { getEmbedding } from "../../ai/embeddings";

/**
 * planning_phase:
 * Deterministically decides the strategy for this iteration.
 * No LLM calls here by design.
 */
export async function planningPhaseNode(state: AgentGraphState) {
  const computedRoleLocationKey = roleLocationKey(state.role, state.location);
  const isFirstIteration = state.iteration === 0;
  const shouldInitRoleEmbedding = !Array.isArray(state.userRoleEmbedding);
  const userRoleEmbedding: number[] = Array.isArray(state.userRoleEmbedding)
    ? state.userRoleEmbedding
    : (await getEmbedding(state.role)) ?? [];
  // Retrieval runs once at bootstrap before fresh generation starts.
  const retrievalWillBeTriggered = state.iteration === 0 && state.scoringResults == null;
  const n = state.scoringResults?.highQualityLeadsCount ?? 0;
  const avgScore = state.scoringResults?.avgScore ?? 0;
  const signalSource = state.scoringResults ? "scoring_node" : "default_zero_signal";
  const totalRetrievedCandidates =
    state.retrievalSummarySignal?.totalRetrievedCandidates ?? n;
  const retrievalShortCircuitTriggered = isFirstIteration && n >= 20;
  const planningProfile = retrievalShortCircuitTriggered
    ? "retrieval_only_finalization"
    : "adaptive_exploration";

  const rationale: string[] = [
    `deterministic retrieval-first planner policy`,
    `iteration=${state.iteration}`,
    `highQualityLeadsCount=${n}`,
    `roleLocationKey=${computedRoleLocationKey}`,
    `signalSource=${signalSource}`,
    `avgScore=${avgScore.toFixed(2)}`,
    `retrievalTriggered=${retrievalWillBeTriggered}`,
  ];

  if (state.priorIterationContext) {
    rationale.push(
      `priorIterationContext=iteration:${state.priorIterationContext.previousIterationNumber},mode:${state.priorIterationContext.previousPlannerMode ?? "n/a"},taskComplete:${state.priorIterationContext.previousTaskComplete ?? false},stopReason:${state.priorIterationContext.previousStopReason ?? "null"}`,
    );
  }
  if (isFirstIteration) {
    rationale.push("iteration 0: retrieval explicitly enabled");
  }

  let plannerOutputInput:
    | {
        plannerMode: "full_explore" | "explore_heavy" | "exploit_heavy";
        enableRetrieval: boolean;
        enableNewLeadGeneration: boolean;
        numExploreQueries: 0 | 1 | 2 | 3;
        rationale: string[];
        retrievalSummary: {
          roleLocationKey: string;
          newUnseenRetrievedLeads: number;
          totalRetrievedCandidates: number;
          signalSource: string;
        };
      }
    | null = null;

  if (retrievalShortCircuitTriggered) {
    plannerOutputInput = {
      plannerMode: "exploit_heavy",
      enableRetrieval: retrievalWillBeTriggered,
      enableNewLeadGeneration: false,
      numExploreQueries: 0,
      rationale: [
        ...rationale,
        "iteration 0 retrieval short-circuit triggered",
        "retrieval produced >= 20 high-quality leads; skip fresh generation",
        "remainingLeadsNeeded=0",
        "selectedFreshQueries=0",
      ],
      retrievalSummary: {
        roleLocationKey: computedRoleLocationKey,
        newUnseenRetrievedLeads: n,
        totalRetrievedCandidates,
        signalSource,
      },
    };
  } else if (n === 0) {
    plannerOutputInput = {
      plannerMode: "full_explore",
      enableRetrieval: retrievalWillBeTriggered,
      enableNewLeadGeneration: true,
      numExploreQueries: 3,
      rationale: [
        ...rationale,
        "no useful retrieval leads available",
        "remainingLeadsNeeded=20",
        "selectedFreshQueries=3",
      ],
      retrievalSummary: {
        roleLocationKey: computedRoleLocationKey,
        newUnseenRetrievedLeads: n,
        totalRetrievedCandidates,
        signalSource,
      },
    };
  } else {
    const remaining = Math.max(0, 20 - n);
    const queriesNeeded = Math.ceil(remaining / 5);
    const numQueries = Math.min(3, Math.max(1, queriesNeeded)) as 1 | 2 | 3;
    plannerOutputInput = {
      plannerMode: numQueries >= 2 ? "explore_heavy" : "exploit_heavy",
      enableRetrieval: retrievalWillBeTriggered,
      enableNewLeadGeneration: true,
      numExploreQueries: numQueries,
      rationale: [
        ...rationale,
        "partial retrieval coverage; continue with reduced fresh generation",
        `remainingLeadsNeeded=${remaining}`,
        `selectedFreshQueries=${numQueries}`,
      ],
      retrievalSummary: {
        roleLocationKey: computedRoleLocationKey,
        newUnseenRetrievedLeads: n,
        totalRetrievedCandidates,
        signalSource,
      },
    };
  }

  const plannerOutput = PlannerOutputSchema.parse(plannerOutputInput);

  return {
    roleLocationKey: computedRoleLocationKey,
    userRoleEmbedding,
    plannerOutput,
    debugLog: appendDebug(
      state,
      `planning_phase => iteration=${state.iteration}, N=${n}, mode=${plannerOutput.plannerMode}, planning_profile=${planningProfile}, retrievalTriggered=${plannerOutput.enableRetrieval}, freshTriggered=${plannerOutput.enableNewLeadGeneration}, exploreQueries=${plannerOutput.numExploreQueries}, retrievalShortCircuit=${retrievalShortCircuitTriggered}, roleEmbedding=${shouldInitRoleEmbedding ? "initialized" : "cached"}(${userRoleEmbedding.length})`,
    ),
  };
}
