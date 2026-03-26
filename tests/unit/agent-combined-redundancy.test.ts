import { describe, expect, it } from "vitest";
import { combinedResultNode } from "../../src/lib/agent/nodes/combined-result";
import { createInitialAgentGraphState } from "../../src/lib/agent/state";

function makeLead(input: {
  identityKey: string;
  canonicalUrl: string;
  author: string;
  role: string;
  text: string;
  postedAt: string;
}) {
  return {
    identityKey: input.identityKey,
    canonicalUrl: input.canonicalUrl,
    sourceType: "linkedin-content",
    titleOrRole: input.role,
    roleLocationKey: "senior product manager::seattle",
    author: input.author,
    fullText: input.text,
    postedAt: input.postedAt,
    sourceMetadataJson: {
      postContext: {
        primaryAuthorProfileUrl: "https://www.linkedin.com/in/alex-smith",
        primaryAuthorName: input.author,
      },
      extraction: {
        role: input.role,
      },
    },
  };
}

describe("combined_result redundancy dedupe", () => {
  it("collapses near-duplicate retrieval + fresh leads and preserves source union", async () => {
    const state = createInitialAgentGraphState({
      userSessionId: "dedupe-s1",
      role: "Senior Product Manager",
      location: "Seattle",
      recencyPreference: "past-month",
      shownLeadIdentityKeys: [],
    });

    state.retrievalResults = {
      roleLocationKey: state.roleLocationKey,
      retrievedLeads: [
        makeLead({
          identityKey: "retrieval-1",
          canonicalUrl: "https://x/retrieval-1",
          author: "Alex Smith",
          role: "Senior Product Manager",
          text: "My team is hiring a senior product manager in Seattle and SF.",
          postedAt: "2026-03-01T00:00:00.000Z",
        }),
      ],
      totalRetrievedCount: 1,
      newUnseenCountForUser: 1,
      retrievalDiagnostics: {
        recencyPreference: "past-month",
        retrievedBeforeRecencyFilter: 1,
        retrievedAfterRecencyFilter: 1,
        shownCountForUser: 0,
        elapsedMs: 1,
      },
    };

    state.searchResults = {
      roleLocationKey: state.roleLocationKey,
      iterationNumber: 0,
      rawSearchResults: [],
      normalizedSearchResults: [
        makeLead({
          identityKey: "fresh-1",
          canonicalUrl: "https://x/fresh-1",
          author: "Alex Smith",
          role: "Senior Product Manager",
          text: "My team is hiring senior product manager in Seattle or SF.",
          postedAt: "2026-03-03T00:00:00.000Z",
        }),
      ],
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
    expect(result.combinedResults?.dedupedLeads).toHaveLength(1);
    expect(result.combinedResults?.newLeadsForUser).toHaveLength(1);
    expect(result.combinedResults?.leadProvenance).toHaveLength(1);
    expect(result.combinedResults?.leadProvenance[0]?.sources.sort()).toEqual([
      "fresh_search",
      "retrieval",
    ]);
  });
});
