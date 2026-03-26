import { describe, expect, it } from "vitest";
import { createInitialAgentGraphState } from "../../src/lib/agent/state";
import { scoringNode } from "../../src/lib/agent/nodes/scoring";
import type { LeadRecord } from "../../src/lib/types/contracts";

function baseLead(overrides?: Partial<LeadRecord>): LeadRecord {
  return {
    canonicalUrl: "https://linkedin.com/posts/example",
    identityKey: "lead-1",
    sourceType: "linkedin-content",
    titleOrRole: "Product Manager",
    company: "Acme",
    locations: [
      {
        raw: "Seattle",
        city: "Seattle",
        state: "WA",
        country: "US",
        lat: null,
        lon: null,
      },
    ],
    rawLocationText: "Seattle",
    employmentType: "full-time",
    workMode: "onsite",
    author: "Jane Doe",
    snippet: "My team is hiring a product manager.",
    fullText: "My team is hiring a product manager in Seattle.",
    postedAt: "2026-03-20T00:00:00.000Z",
    fetchedAt: "2026-03-21T00:00:00.000Z",
    roleEmbedding: null,
    hiringIntentScore: 1,
    leadScore: null,
    roleLocationKey: "product manager::seattle",
    sourceMetadataJson: {},
    ...overrides,
  };
}

function metadataWithFields(input: {
  title?: string | null;
  authorTypeGuess?: "hiring_manager" | "recruiter" | "unknown" | null;
}) {
  return {
    extraction: {
      authorLatestPositionTitle: input.title ?? null,
      authorTypeGuess: input.authorTypeGuess ?? null,
    },
  };
}

function buildScoringState(lead: LeadRecord) {
  const state = createInitialAgentGraphState({
    userSessionId: "session-test",
    role: "Product Manager",
    location: "Seattle",
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

describe("scoring author strength from phrase-gated author classification", () => {
  it("assigns 1.0 for hiring manager", async () => {
    const state = buildScoringState(
      baseLead({
        sourceMetadataJson: metadataWithFields({
          title: "Engineering Manager",
        }),
      }),
    );

    const out = await scoringNode(state);
    expect(out.scoringResults.scoredLeads[0]?.scoreBreakdown.authorStrengthScore).toBe(1.0);
  });

  it("assigns 0.75 for recruiter", async () => {
    const state = buildScoringState(
      baseLead({
        sourceMetadataJson: metadataWithFields({
          title: "Senior Recruiter",
        }),
      }),
    );

    const out = await scoringNode(state);
    expect(out.scoringResults.scoredLeads[0]?.scoreBreakdown.authorStrengthScore).toBe(0.75);
  });

  it("assigns neutral 0.5 when hiring phrase is absent", async () => {
    const state = buildScoringState(
      baseLead({
        fullText: "Sharing product lessons from this quarter.",
        snippet: "Sharing product lessons.",
        sourceMetadataJson: metadataWithFields({
          title: "Senior Recruiter",
          authorTypeGuess: "recruiter",
        }),
      }),
    );

    const out = await scoringNode(state);
    expect(out.scoringResults.scoredLeads[0]?.scoreBreakdown.authorStrengthScore).toBe(0.5);
  });

  it("uses LLM fallback when phrase exists and deterministic is unknown", async () => {
    const state = buildScoringState(
      baseLead({
        sourceMetadataJson: metadataWithFields({
          title: "People Ops",
          authorTypeGuess: "recruiter",
        }),
      }),
    );

    const out = await scoringNode(state);
    expect(out.scoringResults.scoredLeads[0]?.scoreBreakdown.authorStrengthScore).toBe(0.75);
  });
});
