import { describe, expect, it } from "vitest";
import { AnalyticsResponseSchema } from "../../src/lib/schemas/api";

describe("analytics mock/real provenance", () => {
  it("supports mixed provenance and mock metrics in one payload", () => {
    const parsed = AnalyticsResponseSchema.parse({
      range: "7d",
      generatedAt: new Date().toISOString(),
      overview: {
        metrics: [],
        runTrend: [],
        sourceMix: [],
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
        metrics: [
          {
            id: "system_first_result_latency",
            label: "First result latency",
            unit: "ms",
            source: "mock",
            global: { value: 4200, prevValue: 4500 },
            mine: { value: 4100, prevValue: 4400 },
          },
          {
            id: "agent_query_volume",
            label: "Query volume",
            unit: "count",
            source: "real",
            global: { value: 560, prevValue: 500 },
            mine: { value: 34, prevValue: 21 },
          },
        ],
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
        real: ["agent_query_volume"],
        mock: ["system_first_result_latency"],
        mixed: ["overview_fresh_share"],
      },
    });

    expect(parsed.provenance.mock).toContain("system_first_result_latency");
    expect(parsed.provenance.real).toContain("agent_query_volume");
    expect(parsed.provenance.mixed).toContain("overview_fresh_share");
  });
});
