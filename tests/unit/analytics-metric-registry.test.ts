import { describe, expect, it } from "vitest";
import {
  ANALYTICS_METRIC_REGISTRY,
  getAnalyticsMetricDefinition,
} from "../../src/lib/analytics/metric-registry";

describe("analytics metric registry", () => {
  it("contains unique metric ids", () => {
    const ids = ANALYTICS_METRIC_REGISTRY.map((metric) => metric.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("provides PM diagnostics metadata for core metrics", () => {
    const metric = getAnalyticsMetricDefinition("cost_per_hq_post");
    expect(metric).toBeTruthy();
    expect(metric?.decisionUse.length).toBeGreaterThan(0);
    expect(metric?.failureMode.length).toBeGreaterThan(0);
    expect(metric?.formulaDescription).toContain("high_quality_posts");
  });
});

