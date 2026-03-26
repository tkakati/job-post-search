import { describe, expect, it } from "vitest";
import { createInitialAgentGraphState } from "../../src/lib/agent/state";
import { finalResponseGenerationNode } from "../../src/lib/agent/nodes/final-response-generation";

function lead(identityKey: string, canonicalUrl: string, sourceType = "linkedin-content") {
  return {
    identityKey,
    canonicalUrl,
    sourceType,
    titleOrRole: "Frontend Engineer",
    company: "Acme",
    location: "San Francisco",
    snippet: "Hiring now",
    postedAt: "2026-03-01T00:00:00.000Z",
    qualityScore: 0.8,
    relevanceScore: 0.75,
    hiringIntentScore: 0.7,
    roleLocationKey: "frontend engineer::san francisco",
  };
}

describe("final_response_generation node", () => {
  it("returns all good new leads when stopReason is sufficient_high_quality_leads", async () => {
    const state = createInitialAgentGraphState({
      userSessionId: "s1",
      role: "Frontend Engineer",
      location: "San Francisco",
      recencyPreference: "past-month",
    });

    state.taskComplete = true;
    state.stopReason = "sufficient_high_quality_leads";
    state.combinedResults = {
      roleLocationKey: state.roleLocationKey,
      mergedLeads: [
        lead("a", "https://x/a"),
        lead("b", "https://x/b"),
      ] as never,
      dedupedLeads: [
        lead("a", "https://x/a"),
        lead("b", "https://x/b"),
      ] as never,
      newLeadsForUser: [
        lead("a", "https://x/a"),
        lead("b", "https://x/b"),
      ] as never,
      leadProvenance: [
        { identityKey: "a", sources: ["retrieval"], isNewForUser: true },
        { identityKey: "b", sources: ["fresh_search"], isNewForUser: true },
      ],
      totalRetrievedCount: 1,
      totalGeneratedCount: 1,
      totalMergedCount: 2,
      totalNewLeadCountForUser: 2,
      qualitySummary: {
        avgQuality: 0.8,
        avgRelevance: 0.75,
        avgHiringIntent: 0.7,
        highQualityCount: 2,
      },
      taskComplete: true,
      stopReason: "sufficient_high_quality_leads",
      combinedDiagnostics: {
        iteration: 1,
        maxIterations: 3,
        shownHistoryCount: 0,
        dedupedFromMergedCount: 0,
      },
    };

    const result = await finalResponseGenerationNode(state);
    expect(result.finalResponse.leads).toHaveLength(2);
    expect(result.finalResponse.stopReason).toBe("sufficient_high_quality_leads");
    expect(result.finalResponse.emptyState.isEmpty).toBe(false);
    expect(result.finalResponse.leads[0]?.canonicalUrl).toBeDefined();
  });

  it("returns best available leads when max_iterations reached and fewer than 20 leads", async () => {
    const state = createInitialAgentGraphState({
      userSessionId: "s2",
      role: "Backend Engineer",
      location: "Remote",
      recencyPreference: "past-month",
    });

    state.taskComplete = true;
    state.stopReason = "max_iterations";
    state.maxIterations = 3;
    state.combinedResults = {
      roleLocationKey: state.roleLocationKey,
      mergedLeads: [lead("c", "https://x/c")] as never,
      dedupedLeads: [lead("c", "https://x/c")] as never,
      newLeadsForUser: [lead("c", "https://x/c")] as never,
      leadProvenance: [
        { identityKey: "c", sources: ["fresh_search"], isNewForUser: true },
      ],
      totalRetrievedCount: 0,
      totalGeneratedCount: 1,
      totalMergedCount: 1,
      totalNewLeadCountForUser: 1,
      qualitySummary: {
        avgQuality: 0.8,
        avgRelevance: 0.75,
        avgHiringIntent: 0.7,
        highQualityCount: 1,
      },
      taskComplete: true,
      stopReason: "max_iterations",
      combinedDiagnostics: {
        iteration: 3,
        maxIterations: 3,
        shownHistoryCount: 0,
        dedupedFromMergedCount: 0,
      },
    };

    const result = await finalResponseGenerationNode(state);
    expect(result.finalResponse.stopReason).toBe("max_iterations");
    expect(result.finalResponse.leads).toHaveLength(1);
    expect(result.finalResponse.emptyState.isEmpty).toBe(false);
  });

  it("returns thoughtful empty state when zero new leads after max iterations", async () => {
    const state = createInitialAgentGraphState({
      userSessionId: "s3",
      role: "Data Engineer",
      location: "NYC",
      recencyPreference: "past-month",
    });

    state.taskComplete = true;
    state.stopReason = "max_iterations";
    state.maxIterations = 3;
    state.combinedResults = {
      roleLocationKey: state.roleLocationKey,
      mergedLeads: [] as never,
      dedupedLeads: [] as never,
      newLeadsForUser: [] as never,
      leadProvenance: [],
      totalRetrievedCount: 0,
      totalGeneratedCount: 0,
      totalMergedCount: 0,
      totalNewLeadCountForUser: 0,
      qualitySummary: {
        avgQuality: 0,
        avgRelevance: 0,
        avgHiringIntent: 0,
        highQualityCount: 0,
      },
      taskComplete: true,
      stopReason: "max_iterations",
      combinedDiagnostics: {
        iteration: 3,
        maxIterations: 3,
        shownHistoryCount: 0,
        dedupedFromMergedCount: 0,
      },
    };

    const result = await finalResponseGenerationNode(state);
    expect(result.finalResponse.leads).toHaveLength(0);
    expect(result.finalResponse.emptyState.isEmpty).toBe(true);
    expect(result.finalResponse.emptyState.message.toLowerCase()).toContain("new leads");
  });
});
