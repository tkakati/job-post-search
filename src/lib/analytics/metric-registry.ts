export type AnalyticsMetricSection =
  | "overview"
  | "demand"
  | "pipeline"
  | "product_value"
  | "reliability_cost";

export type AnalyticsJourneyStage =
  | "search_intent"
  | "agent_execution"
  | "post_yield"
  | "post_quality"
  | "user_action"
  | "system_health";

export type AnalyticsDataSourceType = "real" | "inferred" | "mock";
export type AnalyticsMetricStatus = "track_now" | "track_later";

export type AnalyticsMetricDefinition = {
  id: string;
  label: string;
  section: AnalyticsMetricSection;
  stage: AnalyticsJourneyStage;
  description: string;
  decisionUse: string;
  failureMode: string;
  dataSourceType: AnalyticsDataSourceType;
  formulaDescription: string;
  status: AnalyticsMetricStatus;
};

export const ANALYTICS_METRIC_REGISTRY: AnalyticsMetricDefinition[] = [
  {
    id: "searches_per_user",
    label: "Searches per active user",
    section: "demand",
    stage: "search_intent",
    description: "Average search submissions per active user in the selected window.",
    decisionUse: "Diagnose demand intensity and whether discovery cadence is rising or falling.",
    failureMode: "Low value may indicate low engagement or weak intent capture.",
    dataSourceType: "real",
    formulaDescription: "count(searches) / count(distinct active users)",
    status: "track_now",
  },
  {
    id: "zero_result_search_rate",
    label: "Zero-result search rate",
    section: "overview",
    stage: "post_yield",
    description: "Share of runs that produce no shown posts.",
    decisionUse: "Prioritize coverage expansion for unmet demand pockets.",
    failureMode: "High rate indicates retrieval gaps or over-constrained matching.",
    dataSourceType: "inferred",
    formulaDescription: "count(runs with posts_shown=0) / count(runs)",
    status: "track_now",
  },
  {
    id: "hq_posts_per_run",
    label: "High-quality posts per run",
    section: "overview",
    stage: "post_quality",
    description: "Average high-quality output per run.",
    decisionUse: "Evaluate if ranking/extraction throughput creates actionable inventory.",
    failureMode: "Low output suggests weak query quality or brittle scoring.",
    dataSourceType: "inferred",
    formulaDescription: "sum(high_quality_posts) / count(runs)",
    status: "track_now",
  },
  {
    id: "actionable_posts_per_run",
    label: "Actionable posts per run",
    section: "overview",
    stage: "user_action",
    description: "Average high-quality posts that receive user action.",
    decisionUse: "Measure realized value, not just surfaced output.",
    failureMode: "Low ratio implies trust or relevance problems in shown cards.",
    dataSourceType: "inferred",
    formulaDescription: "count(actioned shown posts) / count(runs)",
    status: "track_now",
  },
  {
    id: "results_per_query",
    label: "Results per query",
    section: "pipeline",
    stage: "post_yield",
    description: "Retrieved result volume per generated query.",
    decisionUse: "Tune query breadth and family selection.",
    failureMode: "Low value indicates poor recall or over-specific phrasing.",
    dataSourceType: "inferred",
    formulaDescription: "sum(posts_retrieved) / count(queries)",
    status: "track_now",
  },
  {
    id: "extraction_success_rate",
    label: "Extraction success rate",
    section: "pipeline",
    stage: "agent_execution",
    description: "Share of retrieved posts converted to structured extracted leads.",
    decisionUse: "Prioritize parsing robustness and fallback quality.",
    failureMode: "Low rate indicates parser/schema fragility.",
    dataSourceType: "inferred",
    formulaDescription: "sum(posts_extracted) / sum(posts_retrieved)",
    status: "track_now",
  },
  {
    id: "scoring_success_rate",
    label: "Scoring success rate",
    section: "pipeline",
    stage: "post_quality",
    description: "Share of extracted posts successfully scored.",
    decisionUse: "Detect scoring blockers and missing required fields.",
    failureMode: "Low rate means brittle scoring inputs or strict filters.",
    dataSourceType: "inferred",
    formulaDescription: "sum(posts_scored) / sum(posts_extracted)",
    status: "track_now",
  },
  {
    id: "posts_opened_per_run",
    label: "Posts opened per run",
    section: "product_value",
    stage: "user_action",
    description: "Average feed-card opens generated per run.",
    decisionUse: "Gauge shortlist quality and card-level relevance.",
    failureMode: "Low value suggests weak top-of-feed ranking confidence.",
    dataSourceType: "real",
    formulaDescription: "count(post_opened events) / count(runs)",
    status: "track_now",
  },
  {
    id: "message_generation_rate",
    label: "Message generation rate",
    section: "product_value",
    stage: "user_action",
    description: "Share of shown posts that trigger message generation.",
    decisionUse: "Measure conversion from relevance to outreach intent.",
    failureMode: "Low rate indicates weak confidence or incomplete metadata.",
    dataSourceType: "real",
    formulaDescription: "count(message_generated events) / count(shown posts)",
    status: "track_now",
  },
  {
    id: "time_to_first_actionable_post",
    label: "Time to first actionable post",
    section: "reliability_cost",
    stage: "system_health",
    description: "Median time from run start to first actioned post opportunity.",
    decisionUse: "Optimize perceived speed-to-value.",
    failureMode: "High latency reduces user trust and repeat usage.",
    dataSourceType: "inferred",
    formulaDescription: "median(run.time_to_first_actionable_ms)",
    status: "track_now",
  },
  {
    id: "cost_per_run",
    label: "Cost per run",
    section: "reliability_cost",
    stage: "system_health",
    description: "Average blended run cost.",
    decisionUse: "Set retrieval/query budget constraints.",
    failureMode: "High unit cost without quality gain hurts scalability.",
    dataSourceType: "mock",
    formulaDescription: "sum(run_cost_usd) / count(runs)",
    status: "track_later",
  },
  {
    id: "cost_per_hq_post",
    label: "Cost per high-quality post",
    section: "reliability_cost",
    stage: "system_health",
    description: "Unit economics normalized by HQ output.",
    decisionUse: "Choose planner/query strategies with strongest ROI.",
    failureMode: "High cost with low HQ yield signals inefficient planning.",
    dataSourceType: "inferred",
    formulaDescription: "sum(run_cost_usd) / sum(high_quality_posts)",
    status: "track_later",
  },
];

const METRIC_DEFINITION_BY_ID = new Map(
  ANALYTICS_METRIC_REGISTRY.map((metric) => [metric.id, metric]),
);

export function getAnalyticsMetricDefinition(
  metricId: string,
): AnalyticsMetricDefinition | null {
  return METRIC_DEFINITION_BY_ID.get(metricId) ?? null;
}

