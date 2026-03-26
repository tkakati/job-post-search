import { describe, expect, it } from "vitest";
import { createInitialAgentGraphState } from "../../src/lib/agent/state";
import {
  executionRoutingNode,
  routeFromExecution,
} from "../../src/lib/agent/nodes/execution-routing";

describe("execution_routing node", () => {
  it("routes BOTH mode to retrieval_arm first", async () => {
    const state = createInitialAgentGraphState({
      userSessionId: "s-both",
      role: "Frontend Engineer",
      location: "Remote",
      recencyPreference: "past-month",
    });
    state.plannerOutput = {
      plannerMode: "explore_heavy",
      enableRetrieval: true,
      enableNewLeadGeneration: true,
      numExploreQueries: 2,
      rationale: ["both mode test"],
      retrievalSummary: {
        roleLocationKey: state.roleLocationKey,
        newHighQualityUnseenRetrievedLeads: 6,
        totalRetrievedCandidates: 12,
        signalSource: "test",
      },
    };
    expect(routeFromExecution(state)).toBe("retrieval_arm");
    const result = await executionRoutingNode(state);
    expect(result.debugLog.at(-1)).toContain("mode=both");
  });

  it("routes retrieval_only mode to retrieval_arm", async () => {
    const state = createInitialAgentGraphState({
      userSessionId: "s-retrieval",
      role: "Frontend Engineer",
      location: "Remote",
      recencyPreference: "past-month",
    });
    state.plannerOutput = {
      plannerMode: "exploit_heavy",
      enableRetrieval: true,
      enableNewLeadGeneration: false,
      numExploreQueries: 0,
      rationale: ["retrieval only mode test"],
      retrievalSummary: {
        roleLocationKey: state.roleLocationKey,
        newHighQualityUnseenRetrievedLeads: 12,
        totalRetrievedCandidates: 20,
        signalSource: "test",
      },
    };
    expect(routeFromExecution(state)).toBe("retrieval_arm");
    const result = await executionRoutingNode(state);
    expect(result.debugLog.at(-1)).toContain("mode=retrieval_only");
  });

  it("routes fresh_only mode to query_generation", async () => {
    const state = createInitialAgentGraphState({
      userSessionId: "s-fresh",
      role: "Frontend Engineer",
      location: "Remote",
      recencyPreference: "past-month",
    });
    state.plannerOutput = {
      plannerMode: "full_explore",
      enableRetrieval: false,
      enableNewLeadGeneration: true,
      numExploreQueries: 3,
      rationale: ["fresh only mode test"],
      retrievalSummary: {
        roleLocationKey: state.roleLocationKey,
        newHighQualityUnseenRetrievedLeads: 2,
        totalRetrievedCandidates: 4,
        signalSource: "test",
      },
    };
    expect(routeFromExecution(state)).toBe("query_generation");
    const result = await executionRoutingNode(state);
    expect(result.debugLog.at(-1)).toContain("mode=fresh_only");
  });
});

