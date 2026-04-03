import type { AnalyticsBreakdownItem, AnalyticsMetric, AnalyticsResponse } from "@/lib/types/api";
import { deriveDashboardMetrics } from "@/lib/analytics/derived-metrics";
import { getMockAnalyticsEntityDataset } from "@/lib/analytics/mock/entities";
import type { AnalyticsRange } from "@/lib/types/api";

export function getMockNodeLatencyBreakdown(): AnalyticsBreakdownItem[] {
  return [
    { id: "lat_planning_p50", label: "Planning p50", value: 48, source: "mock" },
    { id: "lat_query_generation_p50", label: "Query generation p50", value: 86, source: "mock" },
    { id: "lat_search_p50", label: "Search p50", value: 1240, source: "mock" },
    { id: "lat_extraction_p50", label: "Extraction p50", value: 1620, source: "mock" },
    { id: "lat_scoring_p50", label: "Scoring p50", value: 94, source: "mock" },
  ];
}

export function getMockSystemMetrics(range: AnalyticsRange = "30d"): AnalyticsMetric[] {
  const derived = deriveDashboardMetrics(getMockAnalyticsEntityDataset(range));
  return [
    {
      id: "system_first_result_latency",
      label: "First result latency",
      unit: "ms",
      source: "mock",
      global: { value: 4200, prevValue: 4500 },
      mine: { value: 4200, prevValue: 4500 },
    },
    {
      id: "derived_cost_per_hq_post",
      label: "Derived cost per HQ post",
      unit: "ratio",
      source: "mixed",
      global: { value: derived.cost_per_hq_post?.value ?? 0, prevValue: null },
      mine: { value: derived.cost_per_hq_post?.value ?? 0, prevValue: null },
    },
    {
      id: "derived_time_to_first_actionable",
      label: "Derived time to first actionable post",
      unit: "ms",
      source: "mixed",
      global: { value: derived.time_to_first_actionable_post?.value ?? 0, prevValue: null },
      mine: { value: derived.time_to_first_actionable_post?.value ?? 0, prevValue: null },
    },
  ];
}

export function getMockExperimentsSection(): AnalyticsResponse["experiments"] {
  return {
    metrics: [
      {
        id: "exp_variant_coverage",
        label: "Experiment coverage",
        unit: "percent",
        source: "mock",
        global: { value: 100, prevValue: 100 },
        mine: { value: 100, prevValue: 100 },
      },
      {
        id: "exp_ctr_lift",
        label: "CTR lift",
        unit: "percent",
        source: "mock",
        global: { value: 8.5, prevValue: 6.9 },
        mine: { value: 8.5, prevValue: 6.9 },
      },
    ],
    variants: [
      { id: "variant_control", label: "Control", value: 50, source: "mock" },
      { id: "variant_treatment", label: "Treatment", value: 50, source: "mock" },
    ],
    notes: "Experiment analytics are mock in v1 and will be replaced by real assignment + outcome telemetry.",
  };
}
