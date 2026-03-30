import { describe, expect, it } from "vitest";
import { createInitialAgentGraphState } from "../../src/lib/agent/state";
import { routeAfterScoring, scoringNode } from "../../src/lib/agent/nodes/scoring";
import type { LeadRecord } from "../../src/lib/types/contracts";

function makeLead(overrides?: Partial<LeadRecord>): LeadRecord {
  return {
    canonicalUrl: "https://www.linkedin.com/posts/scoring-iteration-routing",
    identityKey: "iteration-routing-lead-1",
    sourceType: "linkedin-content",
    titleOrRole: "Product Manager",
    company: "Acme",
    locations: [],
    rawLocationText: "Anywhere",
    employmentType: "full-time",
    workMode: "remote",
    author: "Taylor Morgan",
    snippet: "My team is hiring a product manager.",
    fullText: "My team is hiring a product manager.",
    postedAt: "2026-03-20T00:00:00.000Z",
    fetchedAt: "2026-03-20T00:00:00.000Z",
    roleEmbedding: null,
    hiringIntentScore: 1,
    leadScore: null,
    roleLocationKey: "product manager::nyc",
    sourceMetadataJson: {},
    ...overrides,
  };
}

function buildState(input: {
  targetHighQualityLeads: number;
  lead: LeadRecord;
}) {
  const state = createInitialAgentGraphState({
    userSessionId: "scoring-routing-session",
    role: "Product Manager",
    location: "NYC",
    recencyPreference: "past-week",
    targetHighQualityLeads: input.targetHighQualityLeads,
    maxIterations: 3,
  });

  state.combinedResults = {
    roleLocationKey: state.roleLocationKey,
    mergedLeads: [],
    dedupedLeads: [],
    newLeadsForUser: [input.lead],
    leads: [],
    leadProvenance: [],
    totalRetrievedCount: 1,
    totalGeneratedCount: 0,
    totalMergedCount: 1,
    totalNewLeadCountForUser: 1,
    qualitySummary: {
      avgQuality: 0,
      avgRelevance: 0,
      avgHiringIntent: 0,
      highQualityCount: 0,
    },
    taskComplete: false,
    stopReason: null,
    combinedDiagnostics: {
      iteration: 0,
      maxIterations: 3,
      shownHistoryCount: 0,
      dedupedFromMergedCount: 0,
    },
  };

  return state;
}

describe("scoring node iteration-0 routing behavior", () => {
  it("finalizes at iteration 0 when retrieval already meets quality target", async () => {
    const state = buildState({
      targetHighQualityLeads: 1,
      lead: makeLead(),
    });

    const out = await scoringNode(state);
    expect(out.taskComplete).toBe(true);
    expect(out.stopReason).toBe("sufficient_high_quality_leads");
    expect(out.iteration).toBe(0);
    expect(routeAfterScoring({ taskComplete: out.taskComplete } as never)).toBe(
      "final_response_generation",
    );
  });

  it("returns to planning phase at iteration 0 when retrieval is insufficient", async () => {
    const state = buildState({
      targetHighQualityLeads: 2,
      lead: makeLead(),
    });

    const out = await scoringNode(state);
    expect(out.taskComplete).toBe(false);
    expect(out.stopReason).toBeNull();
    expect(out.iteration).toBe(0);
    expect(routeAfterScoring({ taskComplete: out.taskComplete } as never)).toBe(
      "planning_phase",
    );
  });
});
