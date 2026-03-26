import { describe, expect, it } from "vitest";
import {
  dedupeRetrievedLeadsByRedundancy,
  filterLeadRecordsByCountry,
  filterLeadsByRecency,
  routeAfterRetrieval,
  summarizeRetrievedLeads,
  type LeadWithShown,
} from "../../src/lib/agent/nodes/retrieval-arm";

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

describe("retrieval helper functions", () => {
  it("filterLeadRecordsByCountry drops explicit mismatches and keeps unknown-country leads", () => {
    const normalizedLeads = [
      {
        canonicalUrl: "https://example.com/ca",
        identityKey: "ca",
        sourceType: "mock",
        titleOrRole: "Product Manager",
        company: "A",
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
        rawLocationText: "Toronto, ON, Canada",
        roleLocationKey: "pm::seattle",
      },
      {
        canonicalUrl: "https://example.com/unknown",
        identityKey: "unknown",
        sourceType: "mock",
        titleOrRole: "Product Manager",
        company: "B",
        locations: [
          {
            raw: "Remote",
            city: "Remote",
            state: null,
            country: null,
            lat: null,
            lon: null,
          },
        ],
        rawLocationText: "Remote",
        roleLocationKey: "pm::seattle",
      },
      {
        canonicalUrl: "https://example.com/us",
        identityKey: "us",
        sourceType: "mock",
        titleOrRole: "Product Manager",
        company: "C",
        locations: [
          {
            raw: "Seattle, WA, USA",
            city: "Seattle",
            state: "WA",
            country: "USA",
            lat: null,
            lon: null,
          },
        ],
        rawLocationText: "Seattle, WA, USA",
        roleLocationKey: "pm::seattle",
      },
    ];

    const filtered = filterLeadRecordsByCountry({
      leads: normalizedLeads as never,
      userLocation: "Seattle",
    });

    expect(filtered.eligibleLeads.map((lead) => lead.identityKey)).toEqual(["unknown", "us"]);
    expect(filtered.countryMismatchDroppedCount).toBe(1);
    expect(filtered.countryUnknownCount).toBe(1);
  });

  it("filterLeadsByRecency keeps only recent leads", () => {
    const leads = [
      {
        id: 1,
        canonicalUrl: "https://example.com/1",
        identityKey: "id-1",
        sourceType: "mock",
        titleOrRole: "Frontend Engineer",
        company: "A",
        location: "SF",
        normalizedLocationJson: null,
        employmentType: null,
        workMode: null,
        author: null,
        snippet: null,
        fullText: null,
        postedAt: daysAgo(3),
        fetchedAt: daysAgo(3),
        roleEmbedding: null,
        hiringIntentScore: 0.8,
        leadScore: null,
        roleLocationKey: "frontend engineer::sf",
        sourceMetadataJson: null,
        createdAt: daysAgo(3),
      },
      {
        id: 2,
        canonicalUrl: "https://example.com/2",
        identityKey: "id-2",
        sourceType: "mock",
        titleOrRole: "Frontend Engineer",
        company: "B",
        location: "SF",
        normalizedLocationJson: null,
        employmentType: null,
        workMode: null,
        author: null,
        snippet: null,
        fullText: null,
        postedAt: daysAgo(60),
        fetchedAt: daysAgo(60),
        roleEmbedding: null,
        hiringIntentScore: 0.9,
        leadScore: null,
        roleLocationKey: "frontend engineer::sf",
        sourceMetadataJson: null,
        createdAt: daysAgo(60),
      },
    ];

    const filtered = filterLeadsByRecency({
      // Cast keeps this unit test focused on recency logic only.
      leads: leads as never,
      recencyPreference: "past-month",
    });

    expect(filtered.length).toBe(1);
    expect(filtered[0]?.id).toBe(1);
  });

  it("postedAt takes precedence over fetchedAt for recency filtering", () => {
    const leads = [
      {
        id: 10,
        canonicalUrl: "https://example.com/10",
        identityKey: "id-10",
        sourceType: "mock",
        titleOrRole: "PM",
        company: "A",
        location: "Seattle",
        normalizedLocationJson: null,
        employmentType: null,
        workMode: null,
        author: null,
        snippet: null,
        fullText: null,
        postedAt: daysAgo(15),
        fetchedAt: daysAgo(1),
        roleEmbedding: null,
        hiringIntentScore: 0.9,
        leadScore: null,
        roleLocationKey: "pm::seattle",
        sourceMetadataJson: null,
        createdAt: daysAgo(1),
      },
    ];

    const filtered = filterLeadsByRecency({
      leads: leads as never,
      recencyPreference: "past-week",
    });

    expect(filtered).toHaveLength(0);
  });

  it("falls back to fetchedAt when postedAt is missing", () => {
    const leads = [
      {
        id: 11,
        canonicalUrl: "https://example.com/11",
        identityKey: "id-11",
        sourceType: "mock",
        titleOrRole: "PM",
        company: "A",
        location: "Seattle",
        normalizedLocationJson: null,
        employmentType: null,
        workMode: null,
        author: null,
        snippet: null,
        fullText: null,
        postedAt: null,
        fetchedAt: daysAgo(2),
        roleEmbedding: null,
        hiringIntentScore: 0.8,
        leadScore: null,
        roleLocationKey: "pm::seattle",
        sourceMetadataJson: null,
        createdAt: daysAgo(30),
      },
      {
        id: 12,
        canonicalUrl: "https://example.com/12",
        identityKey: "id-12",
        sourceType: "mock",
        titleOrRole: "PM",
        company: "B",
        location: "Seattle",
        normalizedLocationJson: null,
        employmentType: null,
        workMode: null,
        author: null,
        snippet: null,
        fullText: null,
        postedAt: null,
        fetchedAt: daysAgo(10),
        roleEmbedding: null,
        hiringIntentScore: 0.8,
        leadScore: null,
        roleLocationKey: "pm::seattle",
        sourceMetadataJson: null,
        createdAt: daysAgo(2),
      },
      {
        id: 13,
        canonicalUrl: "https://example.com/13",
        identityKey: "id-13",
        sourceType: "mock",
        titleOrRole: "PM",
        company: "C",
        location: "Seattle",
        normalizedLocationJson: null,
        employmentType: null,
        workMode: null,
        author: null,
        snippet: null,
        fullText: null,
        postedAt: null,
        fetchedAt: null,
        roleEmbedding: null,
        hiringIntentScore: 0.8,
        leadScore: null,
        roleLocationKey: "pm::seattle",
        sourceMetadataJson: null,
        createdAt: daysAgo(1),
      },
    ];

    const filtered = filterLeadsByRecency({
      leads: leads as never,
      recencyPreference: "past-week",
    });

    expect(filtered.map((row) => row.id)).toEqual([11]);
  });

  it("summarizeRetrievedLeads computes unseen and high-quality unseen counts", () => {
    const leadsWithShown: LeadWithShown[] = [
      {
        id: 1,
        canonicalUrl: "https://example.com/1",
        identityKey: "id1",
        sourceType: "mock",
        titleOrRole: "Role",
        company: "A",
        location: "SF",
        author: null,
        snippet: null,
        fullText: null,
        postedAt: null,
        fetchedAt: null,
        normalizedLocationJson: null,
        employmentType: null,
        workMode: null,
        roleEmbedding: null,
        hiringIntentScore: 0.2,
        leadScore: null,
        roleLocationKey: "role::sf",
        sourceMetadataJson: null,
        isShownForUser: false,
        locations: [],
        rawLocationText: "SF",
      },
      {
        id: 2,
        canonicalUrl: "https://example.com/2",
        identityKey: "id2",
        sourceType: "mock",
        titleOrRole: "Role",
        company: "B",
        location: "SF",
        author: null,
        snippet: null,
        fullText: null,
        postedAt: null,
        fetchedAt: null,
        normalizedLocationJson: null,
        employmentType: null,
        workMode: null,
        roleEmbedding: null,
        hiringIntentScore: 0.4,
        leadScore: null,
        roleLocationKey: "role::sf",
        sourceMetadataJson: null,
        isShownForUser: false,
        locations: [],
        rawLocationText: "SF",
      },
      {
        id: 3,
        canonicalUrl: "https://example.com/3",
        identityKey: "id3",
        sourceType: "mock",
        titleOrRole: "Role",
        company: "C",
        location: "SF",
        author: null,
        snippet: null,
        fullText: null,
        postedAt: null,
        fetchedAt: null,
        normalizedLocationJson: null,
        employmentType: null,
        workMode: null,
        roleEmbedding: null,
        hiringIntentScore: 0.95,
        leadScore: null,
        roleLocationKey: "role::sf",
        sourceMetadataJson: null,
        isShownForUser: true,
        locations: [],
        rawLocationText: "SF",
      },
    ];

    const summary = summarizeRetrievedLeads({
      roleLocationKey: "role::sf",
      recencyPreference: "past-month",
      retrievedBeforeRecencyFilter: 5,
      retrievedAfterRecencyFilter: 3,
      leadsWithShown,
      elapsedMs: 12,
    });

    expect(summary.totalRetrievedCount).toBe(3);
    expect(summary.newUnseenCountForUser).toBe(2);
    expect(summary.retrievalDiagnostics.shownCountForUser).toBe(1);
  });

  it("dedupeRetrievedLeadsByRedundancy removes near-duplicate leads for same poster", () => {
    const leads = [
      {
        canonicalUrl: "https://www.linkedin.com/posts/a",
        identityKey: "a",
        sourceType: "mock",
        titleOrRole: "Senior Product Manager",
        company: "Acme",
        roleLocationKey: "senior product manager::seattle",
        author: "Alex Smith",
        fullText: "My team is hiring a senior product manager in Seattle and SF.",
        postedAt: "2026-03-01T00:00:00.000Z",
        fetchedAt: "2026-03-02T00:00:00.000Z",
        sourceMetadataJson: {
          postContext: {
            primaryAuthorProfileUrl: "https://www.linkedin.com/in/alex-smith",
            primaryAuthorName: "Alex Smith",
          },
          extraction: {
            role: "Senior Product Manager",
          },
        },
      },
      {
        canonicalUrl: "https://www.linkedin.com/posts/b",
        identityKey: "b",
        sourceType: "mock",
        titleOrRole: "Senior Product Manager",
        company: "Acme",
        roleLocationKey: "senior product manager::seattle",
        author: "Alex Smith",
        fullText: "My team is hiring senior product manager in Seattle or SF.",
        postedAt: "2026-03-03T00:00:00.000Z",
        fetchedAt: "2026-03-03T00:00:00.000Z",
        sourceMetadataJson: {
          postContext: {
            primaryAuthorProfileUrl: "https://www.linkedin.com/in/alex-smith",
            primaryAuthorName: "Alex Smith",
          },
          extraction: {
            role: "Senior Product Manager",
          },
        },
      },
    ];

    const result = dedupeRetrievedLeadsByRedundancy({
      leads: leads as never,
    });

    expect(result.redundantDroppedCount).toBe(1);
    expect(result.dedupedLeads).toHaveLength(1);
    expect(result.dedupedLeads[0]?.identityKey).toBe("b");
  });

  it("routeAfterRetrieval honors planner new-generation flag", () => {
    expect(
      routeAfterRetrieval({
        plannerOutput: {
          enableNewLeadGeneration: true,
        },
      } as never),
    ).toBe("query_generation");

    expect(
      routeAfterRetrieval({
        plannerOutput: {
          enableNewLeadGeneration: false,
        },
      } as never),
    ).toBe("combined_result");
  });
});
