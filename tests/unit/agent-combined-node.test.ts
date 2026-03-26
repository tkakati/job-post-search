import { describe, expect, it } from "vitest";
import { combinedResultNode } from "../../src/lib/agent/nodes/combined-result";
import { createInitialAgentGraphState } from "../../src/lib/agent/state";

function makeLead(input: {
  identityKey: string;
  canonicalUrl: string;
  quality?: number;
  relevance?: number;
  intent?: number;
}) {
  return {
    identityKey: input.identityKey,
    canonicalUrl: input.canonicalUrl,
    sourceType: "test",
    titleOrRole: "Role",
    roleLocationKey: "role::location",
    qualityScore: input.quality ?? 0.5,
    relevanceScore: input.relevance ?? 0.5,
    hiringIntentScore: input.intent ?? 0.5,
  };
}

describe("combined_result node", () => {
  it("stops with sufficient_new_leads when new leads >= 5", async () => {
    const state = createInitialAgentGraphState({
      userSessionId: "s1",
      role: "Role",
      location: "Location",
      recencyPreference: "past-month",
      shownLeadIdentityKeys: [],
    });
    state.retrievalResults = {
      roleLocationKey: state.roleLocationKey,
      retrievedLeads: [
        makeLead({ identityKey: "a", canonicalUrl: "https://x/a" }),
        makeLead({ identityKey: "b", canonicalUrl: "https://x/b" }),
        makeLead({ identityKey: "c", canonicalUrl: "https://x/c" }),
      ],
      totalRetrievedCount: 3,
      newUnseenCountForUser: 3,
      highQualityNewUnseenCountForUser: 3,
      retrievalDiagnostics: {
        recencyPreference: "past-month",
        highQualityThreshold: 0.7,
        retrievedBeforeRecencyFilter: 3,
        retrievedAfterRecencyFilter: 3,
        shownCountForUser: 0,
        elapsedMs: 1,
      },
    };
    state.searchResults = {
      roleLocationKey: state.roleLocationKey,
      iterationNumber: 0,
      rawSearchResults: [],
      normalizedSearchResults: [
        makeLead({ identityKey: "d", canonicalUrl: "https://x/d" }),
        makeLead({ identityKey: "e", canonicalUrl: "https://x/e" }),
      ],
      persistedLeadIds: [],
      queryPerformanceSummary: [],
      diagnostics: {
        provider: "test",
        totalRawResults: 0,
        totalNormalizedResults: 2,
        dedupedResults: 2,
        persistedLeadCount: 0,
        elapsedMs: 1,
      },
      searchDiagnostics: {
        apifyCallTime: 1,
        totalFetched: 0,
        totalKept: 2,
        resultsFetched: 0,
        resultsKept: 2,
        dedupedCount: 0,
      },
      leads: [],
      providerMetadataJson: {},
    };

    const result = await combinedResultNode(state);
    expect(result.taskComplete).toBe(true);
    expect(result.stopReason).toBe("sufficient_new_leads");
    expect(result.combinedResults?.totalNewLeadCountForUser).toBeGreaterThanOrEqual(5);
  });

  it("stops with max_iterations when iteration >= 3 and insufficient new leads", async () => {
    const state = createInitialAgentGraphState({
      userSessionId: "s2",
      role: "Role",
      location: "Location",
      recencyPreference: "past-month",
      shownLeadIdentityKeys: ["a"],
    });
    state.iteration = 3;
    state.retrievalResults = {
      roleLocationKey: state.roleLocationKey,
      retrievedLeads: [makeLead({ identityKey: "a", canonicalUrl: "https://x/a" })],
      totalRetrievedCount: 1,
      newUnseenCountForUser: 0,
      highQualityNewUnseenCountForUser: 0,
      retrievalDiagnostics: {
        recencyPreference: "past-month",
        highQualityThreshold: 0.7,
        retrievedBeforeRecencyFilter: 1,
        retrievedAfterRecencyFilter: 1,
        shownCountForUser: 1,
        elapsedMs: 1,
      },
    };
    state.searchResults = {
      roleLocationKey: state.roleLocationKey,
      iterationNumber: 3,
      rawSearchResults: [],
      normalizedSearchResults: [],
      persistedLeadIds: [],
      queryPerformanceSummary: [],
      diagnostics: {
        provider: "test",
        totalRawResults: 0,
        totalNormalizedResults: 0,
        dedupedResults: 0,
        persistedLeadCount: 0,
        elapsedMs: 1,
      },
      searchDiagnostics: {
        apifyCallTime: 1,
        totalFetched: 0,
        totalKept: 0,
        resultsFetched: 0,
        resultsKept: 0,
        dedupedCount: 0,
      },
      leads: [],
      providerMetadataJson: {},
    };

    const result = await combinedResultNode(state);
    expect(result.taskComplete).toBe(true);
    expect(result.stopReason).toBe("max_iterations");
  });

  it("continues loop when neither stop condition is met", async () => {
    const state = createInitialAgentGraphState({
      userSessionId: "s3",
      role: "Role",
      location: "Location",
      recencyPreference: "past-month",
      shownLeadIdentityKeys: [],
    });
    state.iteration = 1;
    state.retrievalResults = {
      roleLocationKey: state.roleLocationKey,
      retrievedLeads: [makeLead({ identityKey: "a", canonicalUrl: "https://x/a" })],
      totalRetrievedCount: 1,
      newUnseenCountForUser: 1,
      highQualityNewUnseenCountForUser: 0,
      retrievalDiagnostics: {
        recencyPreference: "past-month",
        highQualityThreshold: 0.7,
        retrievedBeforeRecencyFilter: 1,
        retrievedAfterRecencyFilter: 1,
        shownCountForUser: 0,
        elapsedMs: 1,
      },
    };
    state.searchResults = {
      roleLocationKey: state.roleLocationKey,
      iterationNumber: 1,
      rawSearchResults: [],
      normalizedSearchResults: [makeLead({ identityKey: "b", canonicalUrl: "https://x/b" })],
      persistedLeadIds: [],
      queryPerformanceSummary: [],
      diagnostics: {
        provider: "test",
        totalRawResults: 0,
        totalNormalizedResults: 1,
        dedupedResults: 1,
        persistedLeadCount: 0,
        elapsedMs: 1,
      },
      searchDiagnostics: {
        apifyCallTime: 1,
        totalFetched: 0,
        totalKept: 1,
        resultsFetched: 0,
        resultsKept: 1,
        dedupedCount: 0,
      },
      leads: [],
      providerMetadataJson: {},
    };

    const result = await combinedResultNode(state);
    expect(result.taskComplete).toBe(false);
    expect(result.stopReason).toBeNull();
    expect(result.iteration).toBe(2);
  });

  it("preserves provenance and marks new vs shown", async () => {
    const state = createInitialAgentGraphState({
      userSessionId: "s4",
      role: "Role",
      location: "Location",
      recencyPreference: "past-month",
      shownLeadIdentityKeys: ["x-shown"],
    });
    state.retrievalResults = {
      roleLocationKey: state.roleLocationKey,
      retrievedLeads: [
        makeLead({ identityKey: "x-shown", canonicalUrl: "https://x/shown" }),
        makeLead({ identityKey: "x-both", canonicalUrl: "https://x/both" }),
      ],
      totalRetrievedCount: 2,
      newUnseenCountForUser: 1,
      highQualityNewUnseenCountForUser: 0,
      retrievalDiagnostics: {
        recencyPreference: "past-month",
        highQualityThreshold: 0.7,
        retrievedBeforeRecencyFilter: 2,
        retrievedAfterRecencyFilter: 2,
        shownCountForUser: 1,
        elapsedMs: 1,
      },
    };
    state.searchResults = {
      roleLocationKey: state.roleLocationKey,
      iterationNumber: 0,
      rawSearchResults: [],
      normalizedSearchResults: [
        makeLead({ identityKey: "x-both", canonicalUrl: "https://x/both" }),
        makeLead({ identityKey: "x-new", canonicalUrl: "https://x/new", quality: 0.9 }),
      ],
      persistedLeadIds: [],
      queryPerformanceSummary: [],
      diagnostics: {
        provider: "test",
        totalRawResults: 0,
        totalNormalizedResults: 2,
        dedupedResults: 2,
        persistedLeadCount: 0,
        elapsedMs: 1,
      },
      searchDiagnostics: {
        apifyCallTime: 1,
        totalFetched: 0,
        totalKept: 2,
        resultsFetched: 0,
        resultsKept: 2,
        dedupedCount: 0,
      },
      leads: [],
      providerMetadataJson: {},
    };

    const result = await combinedResultNode(state);
    const provenance = result.combinedResults?.leadProvenance ?? [];
    const both = provenance.find((p) => p.identityKey === "x-both");
    const shown = provenance.find((p) => p.identityKey === "x-shown");

    expect(both?.sources.sort()).toEqual(["fresh_search", "retrieval"]);
    expect(shown?.isNewForUser).toBe(false);
    expect(result.combinedResults?.newLeadsForUser.some((l) => l.identityKey === "x-new")).toBe(
      true,
    );
  });
});

