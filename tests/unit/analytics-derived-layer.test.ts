import { describe, expect, it } from "vitest";
import { deriveDashboardMetrics } from "../../src/lib/analytics/derived-metrics";
import { getMockAnalyticsEntityDataset } from "../../src/lib/analytics/mock/entities";

describe("analytics derived metrics layer", () => {
  it("computes key dashboard metrics from entity dataset", () => {
    const dataset = getMockAnalyticsEntityDataset("30d");
    const metrics = deriveDashboardMetrics(dataset);

    expect(metrics.zero_result_search_rate.value).toBeGreaterThanOrEqual(0);
    expect(metrics.extraction_success_rate.value).toBeGreaterThan(0);
    expect(metrics.scoring_success_rate.value).toBeGreaterThan(0);
    expect(metrics.results_per_query.value).toBeGreaterThan(0);
    expect(metrics.time_to_first_actionable_post.value).toBeGreaterThan(0);
  });
});

