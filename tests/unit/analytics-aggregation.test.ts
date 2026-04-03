import { describe, expect, it } from "vitest";
import { AnalyticsQuerySchema, AnalyticsResponseSchema } from "../../src/lib/schemas/api";

describe("analytics aggregation contracts", () => {
  it("defaults range to 30d", () => {
    const parsed = AnalyticsQuerySchema.parse({});
    expect(parsed.range).toBe("30d");
  });

  it("accepts analytics response shape with global/mine metrics", () => {
    const parsed = AnalyticsResponseSchema.parse({
      range: "30d",
      generatedAt: new Date().toISOString(),
      overview: {
        metrics: [
          {
            id: "overview_total_runs",
            label: "Total runs",
            unit: "count",
            source: "real",
            global: { value: 100, prevValue: 90 },
            mine: { value: 12, prevValue: 9 },
          },
        ],
        runTrend: [{ date: "2026-04-01", global: 10, mine: 2 }],
        sourceMix: [{ id: "source_fresh", label: "Fresh", value: 58, source: "real" }],
      },
      productUser: {
        metrics: [],
        topRoleLocations: [],
        engagementRates: [],
      },
      feedQuality: {
        metrics: [],
        qualityBadgeDistribution: [],
        fieldCompleteness: [],
      },
      agentSystem: {
        metrics: [],
        plannerModeDistribution: [],
        stopReasonDistribution: [],
        queryStrategyMix: [],
        runDurationBuckets: [],
        queryVolumeTrend: [],
        nodeLatencyMock: [],
      },
      experiments: {
        metrics: [],
        variants: [],
        notes: "mock",
      },
      provenance: {
        real: ["overview_total_runs"],
        mock: [],
        mixed: [],
      },
    });
    expect(parsed.overview.metrics[0]?.global.value).toBe(100);
    expect(parsed.overview.metrics[0]?.mine.value).toBe(12);
  });
});
