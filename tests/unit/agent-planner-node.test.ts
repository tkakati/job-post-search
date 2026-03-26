import { describe, expect, it } from "vitest";
import { planningPhaseNode } from "../../src/lib/agent/nodes/planning-phase";
import { createInitialAgentGraphState } from "../../src/lib/agent/state";

function makeState(n: number) {
  return createInitialAgentGraphState({
    userSessionId: "session_1",
    role: "Frontend Engineer",
    location: "San Francisco, CA",
    recencyPreference: "past-month",
    retrievalSummarySignal: {
      newHighQualityUnseenRetrievedLeads: n,
      totalRetrievedCandidates: n + 2,
      signalSource: "test_signal",
    },
  });
}

describe("planningPhaseNode deterministic policy", () => {
  it("N >= 10 => exploit_heavy, retrieval on, fresh off, explore=0", async () => {
    const state = makeState(10);
    const result = await planningPhaseNode(state);
    const out = result.plannerOutput!;

    expect(out.plannerMode).toBe("exploit_heavy");
    expect(out.enableRetrieval).toBe(true);
    expect(out.enableNewLeadGeneration).toBe(false);
    expect(out.numExploreQueries).toBe(0);
    expect(out.retrievalSummary.newHighQualityUnseenRetrievedLeads).toBe(10);
  });

  it("5 < N < 10 => explore_heavy, retrieval on, fresh on, explore=2", async () => {
    const state = makeState(7);
    const result = await planningPhaseNode(state);
    const out = result.plannerOutput!;

    expect(out.plannerMode).toBe("explore_heavy");
    expect(out.enableRetrieval).toBe(true);
    expect(out.enableNewLeadGeneration).toBe(true);
    expect(out.numExploreQueries).toBe(2);
    expect(out.retrievalSummary.newHighQualityUnseenRetrievedLeads).toBe(7);
  });

  it("N <= 5 => full_explore, retrieval on, fresh on, explore=3", async () => {
    const state = makeState(5);
    const result = await planningPhaseNode(state);
    const out = result.plannerOutput!;

    expect(out.plannerMode).toBe("full_explore");
    expect(out.enableRetrieval).toBe(true);
    expect(out.enableNewLeadGeneration).toBe(true);
    expect(out.numExploreQueries).toBe(3);
  });

  it("includes prior iteration context in rationale when available", async () => {
    const state = createInitialAgentGraphState({
      userSessionId: "session_2",
      role: "Backend Engineer",
      location: "Remote",
      recencyPreference: "past-week",
      retrievalSummarySignal: {
        newHighQualityUnseenRetrievedLeads: 6,
        totalRetrievedCandidates: 9,
        signalSource: "memory_table",
      },
      priorIterationContext: {
        previousIterationNumber: 1,
        previousPlannerMode: "full_explore",
        previousTaskComplete: false,
        previousStopReason: null,
      },
    });

    const result = await planningPhaseNode(state);
    const out = result.plannerOutput!;

    expect(out.rationale.join(" ")).toContain("priorIterationContext");
    expect(out.retrievalSummary.signalSource).toBe("memory_table");
    expect(result.roleLocationKey).toContain("backend engineer::remote");
  });
});

