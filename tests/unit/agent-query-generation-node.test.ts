import { describe, expect, it } from "vitest";
import {
  sanitizeQueryString,
  computeQueryKindPlan,
  materializeExactlyThree,
} from "../../src/lib/agent/nodes/query-generation";
import {
  buildLinkedInContentSearchUrl,
  recencyPreferenceToDays,
} from "../../src/lib/utils/recency";

describe("query generation mode compliance", () => {
  it("numExploreQueries=3 => 3 explore, 0 exploit", () => {
    const plan = computeQueryKindPlan(3);
    expect(plan.total).toBe(3);
    expect(plan.explore).toBe(3);
    expect(plan.exploit).toBe(0);
  });

  it("numExploreQueries=2 => 2 total queries by default (explore-heavy)", () => {
    const plan = computeQueryKindPlan(2);
    expect(plan.total).toBe(2);
    expect(plan.explore).toBe(2);
    expect(plan.exploit).toBe(0);
  });

  it("materializeExactlyThree respects requested query count and avoids prior queries", () => {
    const queries = materializeExactlyThree({
      candidates: [
        { queryText: "frontend engineer sf hiring", queryKind: "exploit", isExplore: false },
        { queryText: "frontend engineer sf hiring", queryKind: "exploit", isExplore: false },
        { queryText: "frontend engineer san francisco startup", queryKind: "explore", isExplore: true },
        { queryText: "react engineer bay area openings", queryKind: "explore", isExplore: true },
      ],
      numExploreQueries: 2,
      priorQueries: ["frontend engineer sf hiring"],
      role: "Frontend Engineer",
      location: "San Francisco",
      highSignalPatterns: [],
      recencyPreference: "past-week",
    });

    expect(queries).toHaveLength(2);
    const unique = new Set(queries.map((q) => q.queryText.toLowerCase()));
    expect(unique.size).toBe(2);
    expect(queries.every((q) => q.sourceUrl.includes("linkedin.com/search/results/content"))).toBe(
      true,
    );
    expect(queries.filter((q) => q.isExplore).length).toBe(2);
    expect(queries.filter((q) => !q.isExplore).length).toBe(0);
  });

  it("strips recency phrases from query text", () => {
    const q = sanitizeQueryString(
      "frontend engineer remote last 7 days recently posted opportunities",
    );
    expect(q.toLowerCase()).not.toContain("last 7 days");
    expect(q.toLowerCase()).not.toContain("recently posted");
    expect(q.toLowerCase()).toContain("frontend engineer remote");
  });

  it("builds LinkedIn URL with datePosted facet", () => {
    const url = buildLinkedInContentSearchUrl({
      queryText: "hiring frontend engineer remote",
      recencyPreference: "past-week",
    });
    expect(url).toContain("origin=GLOBAL_SEARCH_HEADER");
    expect(url).toContain("datePosted=%5B%22past-week%22%5D");
  });

  it("maps RecencyPreference to expected days", () => {
    expect(recencyPreferenceToDays("past-24h")).toBe(1);
    expect(recencyPreferenceToDays("past-week")).toBe(7);
    expect(recencyPreferenceToDays("past-month")).toBe(30);
  });
});
