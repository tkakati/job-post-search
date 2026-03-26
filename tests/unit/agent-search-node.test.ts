import { describe, expect, it } from "vitest";
import {
  dedupeNormalizedLeads,
  normalizeRawResultToLead,
  summarizeQueryPerformance,
} from "../../src/features/lead-generation/search-node";
import { linkedinContentMvpProvider } from "../../src/lib/search/providers/linkedin-content-mvp-provider";

describe("search node helpers + provider behavior", () => {
  it("normalizes raw provider item into canonical lead", () => {
    const lead = normalizeRawResultToLead({
      roleLocationKey: "frontend engineer::san francisco",
      raw: {
        url: "https://www.linkedin.com/posts/abc?utm_source=x",
        titleOrRole: "Frontend Engineer hiring",
        company: "Acme",
        location: "San Francisco",
        snippet: "Hiring now",
        postedAt: "2026-03-01T00:00:00.000Z",
        qualityScore: 0.8,
        relevanceScore: 0.7,
        hiringIntentScore: 0.9,
      },
    });

    expect(lead).not.toBeNull();
    expect(lead?.canonicalUrl).toContain("linkedin.com/posts/abc");
    expect(lead?.canonicalUrl).not.toContain("utm_source");
    expect(lead?.identityKey.length).toBeGreaterThan(10);
  });

  it("dedupes normalized leads by canonical identity", () => {
    const base = {
      sourceType: "linkedin-content",
      titleOrRole: "Frontend Engineer",
      roleLocationKey: "frontend::sf",
    };
    const lead1 = {
      ...base,
      canonicalUrl: "https://x.com/a",
      identityKey: "k1",
    };
    const lead2 = {
      ...base,
      canonicalUrl: "https://x.com/a",
      identityKey: "k1",
    };
    const lead3 = {
      ...base,
      canonicalUrl: "https://x.com/b",
      identityKey: "k2",
    };
    const deduped = dedupeNormalizedLeads([lead1 as never, lead2 as never, lead3 as never]);
    expect(deduped).toHaveLength(2);
  });

  it("summarizes query performance metrics", () => {
    const summary = summarizeQueryPerformance({
      roleLocationKey: "frontend engineer::sf",
      queryText: "frontend engineer sf hiring",
      totalResults: 10,
      usableResults: 6,
      newLeadContributions: 4,
      normalizedLeadsForQuery: [
        {
          canonicalUrl: "https://x.com/a",
          identityKey: "a",
          sourceType: "linkedin-content",
          titleOrRole: "Frontend Engineer",
          roleLocationKey: "frontend engineer::sf",
          qualityScore: 0.8,
        } as never,
      ],
    });
    expect(summary.totalRuns).toBe(1);
    expect(summary.totalResults).toBe(10);
    expect(summary.totalUsableResults).toBe(6);
    expect(summary.totalNewLeadContributions).toBe(4);
    expect(summary.avgQuality).toBeGreaterThan(0);
  });

  it("linkedinContentMvpProvider executes deterministic linkedIn-oriented flow", async () => {
    const out = await linkedinContentMvpProvider.execute({
      queryText: "frontend engineer san francisco hiring",
      sourceUrl:
        "https://www.linkedin.com/search/results/content/?keywords=frontend%20engineer",
      role: "Frontend Engineer",
      location: "San Francisco",
      recencyPreference: "past-month",
      roleLocationKey: "frontend engineer::san francisco",
      iterationNumber: 0,
      userSessionId: "sess_1",
    });

    expect(out.length).toBeGreaterThan(0);
    expect(out[0]?.url).toContain("linkedin.com");
    expect(out[0]?.titleOrRole).toContain("hiring");
  });
});

