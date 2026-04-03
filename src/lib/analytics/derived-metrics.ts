import {
  getAnalyticsMetricDefinition,
  type AnalyticsDataSourceType,
  type AnalyticsMetricStatus,
} from "@/lib/analytics/metric-registry";
import type { AnalyticsEntityDataset } from "@/lib/analytics/mock/entities";

export type DerivedMetricResult = {
  id: string;
  value: number;
  formulaDescription: string;
  dataSourceType: AnalyticsDataSourceType;
  status: AnalyticsMetricStatus;
};

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return numerator / denominator;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) return (sorted[mid - 1]! + sorted[mid]!) / 2;
  return sorted[mid]!;
}

export function deriveDashboardMetrics(
  dataset: AnalyticsEntityDataset,
): Record<string, DerivedMetricResult> {
  const distinctUsers = new Set(dataset.searches.map((search) => search.userKey)).size;
  const runsCount = dataset.runs.length;
  const queriesCount = dataset.queries.length;

  const runsWithZeroShown = dataset.runs.filter((run) => run.numPostsShown <= 0).length;
  const totalHq = dataset.runs.reduce((sum, run) => sum + run.numHighQualityPosts, 0);
  const totalRetrieved = dataset.runs.reduce((sum, run) => sum + run.numPostsRetrieved, 0);
  const totalExtracted = dataset.runs.reduce((sum, run) => sum + run.numPostsExtracted, 0);
  const totalScored = dataset.runs.reduce((sum, run) => sum + run.numPostsScored, 0);
  const totalShown = dataset.runs.reduce((sum, run) => sum + run.numPostsShown, 0);

  const openedEvents = dataset.actionEvents.filter((event) => event.eventType === "opened").length;
  const messageEvents = dataset.actionEvents.filter(
    (event) => event.eventType === "generate_message_clicked",
  ).length;

  const actionedShownPostKeySet = new Set(
    dataset.actionEvents
      .filter((event) =>
        event.eventType === "opened" ||
        event.eventType === "clicked" ||
        event.eventType === "generate_message_clicked")
      .map((event) => `${event.runId}:${event.postKey}`),
  );
  const actionableShownCount = dataset.shownPosts.filter((shown) =>
    actionedShownPostKeySet.has(`${shown.runId}:${shown.postKey}`),
  ).length;

  const totalCost = dataset.costSnapshots.reduce((sum, cost) => sum + cost.totalCostUsd, 0);
  const timeToFirstActionableValues = dataset.runs
    .map((run) => run.timeToFirstActionableMs)
    .filter((value) => value > 0);

  const calculations: Record<string, number> = {
    searches_per_user: safeDivide(dataset.searches.length, distinctUsers),
    zero_result_search_rate: safeDivide(runsWithZeroShown, runsCount) * 100,
    hq_posts_per_run: safeDivide(totalHq, runsCount),
    actionable_posts_per_run: safeDivide(actionableShownCount, runsCount),
    results_per_query: safeDivide(totalRetrieved, queriesCount),
    extraction_success_rate: safeDivide(totalExtracted, totalRetrieved) * 100,
    scoring_success_rate: safeDivide(totalScored, totalExtracted) * 100,
    posts_opened_per_run: safeDivide(openedEvents, runsCount),
    message_generation_rate: safeDivide(messageEvents, totalShown) * 100,
    cost_per_run: safeDivide(totalCost, runsCount),
    cost_per_hq_post: safeDivide(totalCost, totalHq),
    time_to_first_actionable_post: median(timeToFirstActionableValues),
  };

  const results: Record<string, DerivedMetricResult> = {};
  for (const [id, value] of Object.entries(calculations)) {
    const definition = getAnalyticsMetricDefinition(id);
    results[id] = {
      id,
      value: round2(value),
      formulaDescription: definition?.formulaDescription ?? "Derived from analytics entities",
      dataSourceType: definition?.dataSourceType ?? "inferred",
      status: definition?.status ?? "track_now",
    };
  }
  return results;
}

