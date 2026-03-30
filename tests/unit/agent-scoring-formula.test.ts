import { describe, expect, it } from "vitest";
import { createInitialAgentGraphState } from "../../src/lib/agent/state";
import { scoringNode } from "../../src/lib/agent/nodes/scoring";
import type { LeadRecord } from "../../src/lib/types/contracts";

function makeLead(overrides?: Partial<LeadRecord>): LeadRecord {
  return {
    canonicalUrl: "https://www.linkedin.com/posts/scoring-formula-lead",
    identityKey: "scoring-formula-lead-1",
    sourceType: "linkedin-content",
    titleOrRole: "Product Strategy Manager",
    company: "Acme",
    locations: [
      {
        raw: "Seattle, WA",
        city: "Seattle",
        state: "WA",
        country: "US",
        lat: null,
        lon: null,
      },
    ],
    rawLocationText: "Seattle, WA",
    employmentType: "full-time",
    workMode: "onsite",
    author: "Jordan Lee",
    snippet: "My team is hiring.",
    fullText: "My team is hiring for a product strategy manager role in Seattle.",
    postedAt: "2026-03-21T00:00:00.000Z",
    fetchedAt: "2026-03-21T00:00:00.000Z",
    roleEmbedding: null,
    hiringIntentScore: 0.8,
    leadScore: null,
    roleLocationKey: "product manager::seattle",
    sourceMetadataJson: {
      extraction: {
        authorLatestPositionTitle: "Senior Recruiter",
      },
    },
    ...overrides,
  };
}

function buildState(lead: LeadRecord) {
  const state = createInitialAgentGraphState({
    userSessionId: "scoring-formula-session",
    role: "Product Manager",
    location: "Seattle",
    employmentType: "full-time",
    recencyPreference: "past-week",
  });

  state.combinedResults = {
    roleLocationKey: state.roleLocationKey,
    mergedLeads: [],
    dedupedLeads: [],
    newLeadsForUser: [lead],
    leads: [],
    leadProvenance: [],
    totalRetrievedCount: 0,
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
      maxIterations: state.maxIterations,
      shownHistoryCount: 0,
      dedupedFromMergedCount: 0,
    },
  };

  return state;
}

describe("scoring formula", () => {
  it("uses weighted base + intent boost formula", async () => {
    const state = buildState(makeLead());
    const out = await scoringNode(state);
    const scored = out.scoringResults.scoredLeads[0];

    expect(scored).toBeDefined();
    const breakdown = scored.scoreBreakdown;
    const expectedBase =
      0.55 * Math.pow(breakdown.roleMatchScore, 1.5) +
      0.25 * breakdown.locationMatchScore +
      0.2 * breakdown.authorStrengthScore;
    const expectedIntentBoost = Math.round((breakdown.hiringIntentScore ?? 0) * 15);
    const expectedFinalScore100 = Math.min(100, expectedBase * 100 + expectedIntentBoost);

    expect(breakdown.baseScore).toBeCloseTo(expectedBase, 6);
    expect(breakdown.intentBoost).toBe(expectedIntentBoost);
    expect(breakdown.finalScore100).toBeCloseTo(expectedFinalScore100, 6);
    expect(scored.leadScore).toBeCloseTo(expectedFinalScore100 / 100, 6);
  });

  it("uses neutral 0.5 hiring intent when score is missing", async () => {
    const state = buildState(
      makeLead({
        hiringIntentScore: null,
      }),
    );

    const out = await scoringNode(state);
    const breakdown = out.scoringResults.scoredLeads[0]?.scoreBreakdown;
    expect(breakdown?.hiringIntentScore).toBe(0.5);
  });

  it("forces final score to 0 on employment mismatch", async () => {
    const state = buildState(
      makeLead({
        employmentType: "contract",
      }),
    );

    const out = await scoringNode(state);
    const breakdown = out.scoringResults.scoredLeads[0]?.scoreBreakdown;
    expect(breakdown?.employmentTypeScore).toBe(0);
    expect(out.scoringResults.scoredLeads[0]?.leadScore).toBe(0);
    expect(breakdown?.gatedToZero).toBe(true);
    expect(breakdown?.gateReason).toBe("employment_type_mismatch");
  });

  it("forces final score to 0 when hiring intent is zero", async () => {
    const state = buildState(
      makeLead({
        hiringIntentScore: 0,
      }),
    );

    const out = await scoringNode(state);
    const breakdown = out.scoringResults.scoredLeads[0]?.scoreBreakdown;
    expect(out.scoringResults.scoredLeads[0]?.leadScore).toBe(0);
    expect(breakdown?.intentBoost).toBe(0);
    expect(breakdown?.gatedToZero).toBe(true);
    expect(breakdown?.gateReason).toBe("hiring_intent_zero");
  });
});
