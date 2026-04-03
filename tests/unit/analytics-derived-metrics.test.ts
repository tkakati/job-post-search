import { describe, expect, it } from "vitest";
import { DERIVED_METRICS } from "../../src/lib/analytics/metric-framework";

describe("analytics derived metric framework", () => {
  it("defines unique metric ids", () => {
    const ids = DERIVED_METRICS.map((item) => item.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("keeps critical metrics marked track_now", () => {
    const requiredTrackNow = [
      "searches_per_user",
      "zero_result_search_rate",
      "hq_posts_per_run",
      "actionable_posts_per_run",
      "query_efficiency",
      "extraction_success_rate",
      "latency_by_stage",
    ];

    for (const id of requiredTrackNow) {
      const metric = DERIVED_METRICS.find((item) => item.id === id);
      expect(metric).toBeDefined();
      expect(metric?.priority).toBe("track_now");
    }
  });

  it("keeps cost metrics deferred as track_later", () => {
    const costPerRun = DERIVED_METRICS.find((item) => item.id === "cost_per_run");
    const costPerHqLead = DERIVED_METRICS.find((item) => item.id === "cost_per_hq_lead");
    expect(costPerRun?.priority).toBe("track_later");
    expect(costPerHqLead?.priority).toBe("track_later");
  });

  it("contains formula text for pm-level transparency", () => {
    const queryEfficiency = DERIVED_METRICS.find((item) => item.id === "query_efficiency");
    expect(queryEfficiency?.formula).toContain("num_posts_extracted");
    expect(queryEfficiency?.formula).toContain("num_queries_generated");
  });
});
