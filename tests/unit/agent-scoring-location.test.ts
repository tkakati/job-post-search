import { describe, expect, it } from "vitest";
import { createInitialAgentGraphState } from "../../src/lib/agent/state";
import { scoringNode } from "../../src/lib/agent/nodes/scoring";
import type { LeadRecord } from "../../src/lib/types/contracts";

function baseLead(overrides?: Partial<LeadRecord>): LeadRecord {
  return {
    canonicalUrl: "https://linkedin.com/posts/example-location",
    identityKey: "lead-location-1",
    sourceType: "linkedin-content",
    titleOrRole: "Product Manager",
    company: "Acme",
    locations: [
      {
        raw: "New York, NY",
        city: "New York",
        state: "NY",
        country: "US",
        lat: null,
        lon: null,
      },
    ],
    rawLocationText: "New York, NY",
    employmentType: "full-time",
    workMode: "onsite",
    author: "Jane Doe",
    snippet: "We're hiring a product manager in New York.",
    fullText: "We're hiring a product manager in New York.",
    postedAt: "2026-03-20T00:00:00.000Z",
    fetchedAt: "2026-03-21T00:00:00.000Z",
    roleEmbedding: null,
    hiringIntentScore: 1,
    leadScore: null,
    roleLocationKey: "product manager::new york",
    sourceMetadataJson: {},
    ...overrides,
  };
}

function buildScoringState({
  userLocation,
  hardFilter = false,
  lead,
}: {
  userLocation: string;
  hardFilter?: boolean;
  lead: LeadRecord;
}) {
  const state = createInitialAgentGraphState({
    userSessionId: "session-test",
    role: "Product Manager",
    location: userLocation,
    locationIsHardFilter: hardFilter,
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

describe("scoring location behavior", () => {
  it("scores NYC query against New York lead in high band", async () => {
    const state = buildScoringState({
      userLocation: "NYC",
      lead: baseLead(),
    });

    const out = await scoringNode(state);
    const locationScore = out.scoringResults.scoredLeads[0]?.scoreBreakdown.locationMatchScore ?? 0;
    expect(locationScore).toBeGreaterThanOrEqual(0.9);
  });

  it("uses neutral fallback when lead location is unresolved", async () => {
    const state = buildScoringState({
      userLocation: "NYC",
      lead: baseLead({
        rawLocationText: "Global / Flexible",
        locations: [],
      }),
    });

    const out = await scoringNode(state);
    expect(out.scoringResults.scoredLeads[0]?.scoreBreakdown.locationMatchScore).toBe(0.5);
  });

  it("does not hard-penalize unresolved locations when hard filter is on", async () => {
    const state = buildScoringState({
      userLocation: "NYC",
      hardFilter: true,
      lead: baseLead({
        rawLocationText: "Anywhere",
        locations: [],
      }),
    });

    const out = await scoringNode(state);
    expect(out.scoringResults.scoredLeads[0]?.scoreBreakdown.locationMatchScore).toBe(0.5);
  });

  it("applies hard-filter penalty only for explicit resolvable mismatch", async () => {
    const state = buildScoringState({
      userLocation: "Seattle",
      hardFilter: true,
      lead: baseLead({
        rawLocationText: "Toronto, ON, Canada",
        locations: [
          {
            raw: "Toronto, ON, Canada",
            city: "Toronto",
            state: "ON",
            country: "Canada",
            lat: null,
            lon: null,
          },
        ],
      }),
    });

    const out = await scoringNode(state);
    expect(out.scoringResults.scoredLeads[0]?.scoreBreakdown.locationMatchScore).toBe(0.2);
  });
});
