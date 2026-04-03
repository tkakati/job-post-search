export type MetricTrackingPriority = "track_now" | "track_later";

export type DerivedMetricDefinition = {
  id: string;
  label: string;
  formula: string;
  priority: MetricTrackingPriority;
};

export const DERIVED_METRICS: DerivedMetricDefinition[] = [
  {
    id: "searches_per_user",
    label: "Searches per user",
    formula: "count(search_submitted) / count(distinct user_key)",
    priority: "track_now",
  },
  {
    id: "zero_result_search_rate",
    label: "Zero-result rate",
    formula: "count(run_completed where total_scored_posts=0) / count(run_completed)",
    priority: "track_now",
  },
  {
    id: "hq_posts_per_run",
    label: "HQ posts per run",
    formula: "sum(total_hq_posts) / count(run_completed)",
    priority: "track_now",
  },
  {
    id: "actionable_posts_per_run",
    label: "Actionable posts per run",
    formula: "count(actioned_shown_posts) / count(run_completed)",
    priority: "track_now",
  },
  {
    id: "message_generation_rate",
    label: "Message generation rate",
    formula: "count(generate_message_clicked) / count(post_viewed)",
    priority: "track_now",
  },
  {
    id: "agent_success_rate",
    label: "Agent success rate",
    formula:
      "count(run_completed where stop_reason='sufficient_high_quality_leads' and total_hq_posts>0) / count(run_completed)",
    priority: "track_now",
  },
  {
    id: "cost_per_run",
    label: "Cost per run",
    formula: "sum(run_cost_usd) / count(run_completed)",
    priority: "track_later",
  },
  {
    id: "cost_per_hq_lead",
    label: "Cost per HQ lead",
    formula: "sum(run_cost_usd) / sum(total_hq_posts)",
    priority: "track_later",
  },
  {
    id: "results_per_query",
    label: "Results per query",
    formula: "sum(num_posts_retrieved) / sum(num_queries_generated)",
    priority: "track_now",
  },
  {
    id: "query_efficiency",
    label: "Query efficiency",
    formula: "sum(num_posts_extracted) / sum(num_queries_generated)",
    priority: "track_now",
  },
  {
    id: "hq_query_efficiency",
    label: "HQ query efficiency",
    formula: "sum(num_hq_posts) / sum(num_queries_generated)",
    priority: "track_now",
  },
  {
    id: "extraction_success_rate",
    label: "Extraction success rate",
    formula: "sum(num_posts_extracted) / sum(num_posts_retrieved)",
    priority: "track_now",
  },
  {
    id: "latency_by_stage",
    label: "Latency by stage",
    formula: "p50/p95(stage_duration_ms) by stage",
    priority: "track_now",
  },
  {
    id: "time_to_first_actionable_post",
    label: "Time to first actionable post",
    formula: "median(time_to_first_actionable_post_ms) for runs where actionable_posts>0",
    priority: "track_now",
  },
];
