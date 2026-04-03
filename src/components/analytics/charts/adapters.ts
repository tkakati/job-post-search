import type { AnalyticsMetric, AnalyticsResponse } from "@/lib/types/api";
import type { BreakdownItem, RankedItem, TrendPoint } from "@/components/analytics/charts/types";

export type QueryEfficiencyRow = {
  id: string;
  query: string;
  postsExtracted: number;
  hqPosts: number;
  efficiencyPct: number;
  source: "real" | "mock";
};

export function toTrendPoints(
  data: Array<{ date: string; global: number; mine: number }>,
): TrendPoint[] {
  return data.map((point) => ({
    date: point.date,
    global: point.global,
    mine: point.mine,
  }));
}

export function toBreakdownItems(
  items: Array<{ id: string; label: string; value: number; source?: "real" | "mock" | "mixed" }>,
): BreakdownItem[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    value: item.value,
    source: item.source,
  }));
}

export function toRankedItems(
  items: Array<{ id: string; label: string; value: number; source?: "real" | "mock" | "mixed"; subLabel?: string | null }>,
): RankedItem[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    value: item.value,
    source: item.source,
    subLabel: item.subLabel ?? null,
  }));
}

export function splitAgentSystemMetrics(metrics: AnalyticsMetric[]) {
  const agentMetrics = metrics.filter((metric) => metric.id.startsWith("agent_"));
  const systemMetrics = metrics.filter((metric) => metric.id.startsWith("system_"));
  return {
    agentMetrics,
    systemMetrics,
  };
}

export function buildStageLatencyRows(snapshot: AnalyticsResponse): BreakdownItem[] {
  return toBreakdownItems(snapshot.agentSystem.nodeLatencyMock);
}

export function buildTopQueryEfficiencyRows(snapshot: AnalyticsResponse): QueryEfficiencyRow[] {
  const runVolume =
    snapshot.agentSystem.metrics.find((metric) => metric.id === "agent_query_volume")?.global.value ?? 0;
  const proxyTotal = Math.max(1, Math.round(runVolume));

  const rows = snapshot.productUser.topRoleLocations.slice(0, 5).map((item, index) => {
    const extracted = Math.max(6, Math.round(item.value * 0.55));
    const hq = Math.max(1, Math.round(extracted * (0.22 - index * 0.02)));
    const efficiencyPct = extracted > 0 ? (hq / extracted) * 100 : 0;
    return {
      id: `query_eff_${item.id}`,
      query: `${item.label} hiring posts`,
      postsExtracted: extracted,
      hqPosts: hq,
      efficiencyPct,
      source: "mock" as const,
    };
  });

  if (rows.length > 0) return rows;
  return [
    {
      id: "query_eff_default_1",
      query: "Product Manager Bay Area hiring posts",
      postsExtracted: Math.max(8, Math.round(proxyTotal * 0.05)),
      hqPosts: 3,
      efficiencyPct: 37.5,
      source: "mock",
    },
  ];
}

export type FunnelStep = {
  id: string;
  label: string;
  value: number;
  source: "real" | "mock" | "mixed";
};

export type OverviewKpiItem = {
  id: string;
  label: string;
  value: string;
  delta: string;
  subline: string;
  source: "real" | "mock" | "mixed";
};

export type InsightItem = {
  id: string;
  title: string;
  detail: string;
  action: string;
  source: "real" | "mock" | "mixed";
};

export type DemandKpiItem = {
  id: string;
  label: string;
  value: string;
  subline: string;
  delta: string;
  source: "real" | "mock" | "mixed";
};

export type DemandComboRow = {
  id: string;
  combo: string;
  searchVolume: number;
  zeroResultRate: number;
  hqYieldPerRun: number;
  status: "strong_coverage" | "weak_coverage" | "high_demand_gap";
  source: "real" | "mock" | "mixed";
};

export type PipelineKpiItem = {
  id: string;
  label: string;
  value: string;
  delta: string;
  subline: string;
  source: "real" | "mock" | "mixed";
};

export type PipelineStageItem = {
  id: string;
  label: string;
  value: number;
  conversionFromPrev: number | null;
  cumulativeLoss: number;
  source: "real" | "mock" | "mixed";
  highlightDrop: boolean;
};

export type PipelineQueryRow = {
  id: string;
  queryFamily: string;
  runs: number;
  retrieved: number;
  extracted: number;
  highQuality: number;
  hqYieldPct: number;
  avgCostUsd: number;
  status: "strong" | "watch" | "weak";
  source: "real" | "mock" | "mixed";
};

export type PipelineDiagnosticItem = {
  id: string;
  title: string;
  value: string;
  detail: string;
  source: "real" | "mock" | "mixed";
};

export type ProductValueKpiItem = {
  id: string;
  label: string;
  value: string;
  delta: string;
  subline: string;
  source: "real" | "mock" | "mixed";
};

export type ScoreBandBehaviorRow = {
  id: string;
  band: "high" | "medium" | "low" | "unscored";
  shown: number;
  openedRate: number;
  clickRate: number;
  messageRate: number;
  hideNotHelpfulRate: number;
  source: "real" | "mock" | "mixed";
};

export type TrustFieldRow = {
  id: string;
  field: string;
  coverage: number;
  trustRisk: "low" | "medium" | "high";
  note: string;
  source: "real" | "mock" | "mixed";
};

export type ActionableSegmentRow = {
  id: string;
  segment: string;
  actionRate: number;
  confidence: "high" | "medium" | "low";
  source: "real" | "mock" | "mixed";
};

export type ReliabilityKpiItem = {
  id: string;
  label: string;
  value: string;
  delta: string;
  subline: string;
  source: "real" | "mock" | "mixed";
};

export type StageLatencyRow = {
  id: string;
  stage: string;
  p50Ms: number;
  p95Ms: number;
  source: "real" | "mock" | "mixed";
};

export type FailureSourceRow = {
  id: string;
  sourceLabel: string;
  share: number;
  impact: "high" | "medium" | "low";
  source: "real" | "mock" | "mixed";
};

export type CostEfficiencyRow = {
  id: string;
  label: string;
  value: string;
  note: string;
  source: "real" | "mock" | "mixed";
};

function metricValue(metrics: AnalyticsMetric[], id: string): number {
  return metrics.find((metric) => metric.id === id)?.global.value ?? 0;
}

function breakdownValue(items: Array<{ id: string; value: number }>, id: string): number {
  return items.find((item) => item.id === id)?.value ?? 0;
}

export function buildPipelineFunnel(snapshot: AnalyticsResponse): FunnelStep[] {
  const queryVolume = Math.max(0, metricValue(snapshot.agentSystem.metrics, "agent_query_volume"));
  const shownLeads = Math.max(0, metricValue(snapshot.overview.metrics, "overview_leads_shown"));
  const scoreCoveragePct = Math.max(0, metricValue(snapshot.feedQuality.metrics, "feed_score_coverage"));
  const highQualityPct = Math.max(0, breakdownValue(snapshot.feedQuality.qualityBadgeDistribution, "quality_high"));
  const engagementClickedPct = Math.max(0, breakdownValue(snapshot.productUser.engagementRates, "engagement_clicked"));

  const scoredLeads = Math.round(shownLeads * (scoreCoveragePct / 100));
  const highQualityLeads = Math.round(scoredLeads * (highQualityPct / 100));
  const actedLeads = Math.round(shownLeads * (engagementClickedPct / 100));

  return [
    { id: "step_queries", label: "Queries generated", value: queryVolume, source: "real" },
    { id: "step_shown", label: "Posts shown", value: shownLeads, source: "real" },
    { id: "step_scored", label: "Scored posts", value: scoredLeads, source: "mixed" },
    { id: "step_hq", label: "High-quality posts", value: highQualityLeads, source: "mixed" },
    { id: "step_acted", label: "Posts acted on", value: actedLeads, source: "mixed" },
  ];
}

export function buildCoverageGapRows(snapshot: AnalyticsResponse): BreakdownItem[] {
  const rows = toBreakdownItems(snapshot.feedQuality.fieldCompleteness);
  const unscored = metricValue(snapshot.feedQuality.metrics, "feed_unscored_share");
  rows.push({
    id: "coverage_unscored",
    label: "Unscored share",
    value: unscored,
    source: "real",
  });
  return rows;
}

function toSafePercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function formatDelta(value: number, prevValue: number | null, unit: AnalyticsMetric["unit"]) {
  if (prevValue === null) return "No baseline";
  const delta = value - prevValue;
  const sign = delta > 0 ? "+" : "";
  if (unit === "percent") return `${sign}${Math.round(delta)} pts`;
  if (unit === "ms") return `${sign}${Math.round(delta)} ms`;
  if (unit === "ratio") return `${sign}${delta.toFixed(2)}`;
  return `${sign}${Math.round(delta)}`;
}

export function buildOverviewKpis(snapshot: AnalyticsResponse): OverviewKpiItem[] {
  const totalRunsMetric = snapshot.overview.metrics.find((item) => item.id === "overview_total_runs");
  const zeroResultRateMetric = snapshot.overview.metrics.find(
    (item) => item.id === "overview_zero_result_search_rate",
  );
  const hqPerRunMetric = snapshot.overview.metrics.find((item) => item.id === "overview_hq_posts_per_run");
  const actionablePerRunMetric = snapshot.overview.metrics.find(
    (item) => item.id === "overview_actionable_posts_per_run",
  );
  const timeToFirstActionableMetric = snapshot.agentSystem.metrics.find(
    (item) => item.id === "reliability_time_to_first_actionable_post",
  );
  const costPerHqMetric = snapshot.agentSystem.metrics.find(
    (item) => item.id === "reliability_cost_per_hq_post",
  );

  const highQualityPerRun = hqPerRunMetric?.global.value ?? 0;
  const actionablePerRun = actionablePerRunMetric?.global.value ?? 0;
  const zeroResultRateEstimate = zeroResultRateMetric?.global.value ?? toSafePercent(Math.max(8, 42 - highQualityPerRun * 12));
  const medianFirstActionableMs = timeToFirstActionableMetric?.global.value ?? 18000;
  const costPerHighQualityPost = costPerHqMetric?.global.value ?? 0.34;

  return [
    {
      id: "ov_kpi_searches",
      label: "Searches",
      value: `${Math.round(totalRunsMetric?.global.value ?? 0).toLocaleString()}`,
      delta: formatDelta(totalRunsMetric?.global.value ?? 0, totalRunsMetric?.global.prevValue ?? null, "count"),
      subline: "Total search runs in selected range",
      source: "real",
    },
    {
      id: "ov_kpi_zero_rate",
      label: "Zero-result search rate",
      value: `${Math.round(zeroResultRateEstimate)}%`,
      delta: "Share of runs with no shown posts",
      subline: "Lower is better; investigate low-yield demand pockets",
      source: zeroResultRateMetric?.source ?? "mixed",
    },
    {
      id: "ov_kpi_hq_per_run",
      label: "High-quality posts / run",
      value: highQualityPerRun.toFixed(2),
      delta: "Average HQ output per run",
      subline: "Shown posts meeting HQ threshold",
      source: hqPerRunMetric?.source ?? "mixed",
    },
    {
      id: "ov_kpi_actionable_per_run",
      label: "Actionable posts / run",
      value: actionablePerRun.toFixed(2),
      delta: "Opened/clicked/message proxy",
      subline: "HQ posts with opened/clicked signal",
      source: actionablePerRunMetric?.source ?? "mixed",
    },
    {
      id: "ov_kpi_ttfap",
      label: "Median time to first actionable",
      value: `${Math.round(medianFirstActionableMs / 1000)}s`,
      delta: "Time from run start to first action-ready post",
      subline: "Primary speed-to-value signal",
      source: timeToFirstActionableMetric?.source ?? "mixed",
    },
    {
      id: "ov_kpi_cost_hq",
      label: "Cost per high-quality post",
      value: `$${costPerHighQualityPost.toFixed(2)}`,
      delta: "Blended unit economics",
      subline: "Tracks efficiency of quality output generation",
      source: costPerHqMetric?.source ?? "mixed",
    },
  ];
}

export function buildOverviewFunnel(snapshot: AnalyticsResponse): FunnelStep[] {
  const searches = Math.max(0, metricValue(snapshot.overview.metrics, "overview_total_runs"));
  const runsStarted = Math.round(searches * 0.97);
  const shown = Math.max(0, metricValue(snapshot.overview.metrics, "overview_leads_shown"));
  const scoreCoverage = Math.max(0, metricValue(snapshot.feedQuality.metrics, "feed_score_coverage"));
  const scored = Math.round(shown * (scoreCoverage / 100));
  const qualityHighPct = breakdownValue(snapshot.feedQuality.qualityBadgeDistribution, "quality_high");
  const openedPct = breakdownValue(snapshot.productUser.engagementRates, "engagement_opened");
  const clickedPct = breakdownValue(snapshot.productUser.engagementRates, "engagement_clicked");

  const extracted = Math.max(scored, Math.round((shown * 1.45) || 0));
  const retrieved = Math.max(extracted, Math.round(extracted * 1.35));
  const opened = Math.round(shown * (openedPct / 100));
  const externalClicks = Math.round(shown * (clickedPct / 100));
  const messageGenerated = Math.max(0, Math.round(Math.min(externalClicks, shown * 0.08)));

  return [
    { id: "f_searches", label: "Searches", value: searches, source: "real" },
    { id: "f_runs_started", label: "Runs started", value: runsStarted, source: "mixed" },
    { id: "f_posts_retrieved", label: "Posts retrieved", value: retrieved, source: "mixed" },
    { id: "f_posts_extracted", label: "Posts extracted", value: extracted, source: "mixed" },
    { id: "f_posts_scored", label: "Posts scored", value: scored, source: "mixed" },
    { id: "f_posts_shown", label: "Posts shown", value: shown, source: "real" },
    { id: "f_posts_opened", label: "Posts opened", value: opened, source: "mixed" },
    { id: "f_external_clicks", label: "External clicks", value: externalClicks, source: "mixed" },
    {
      id: "f_message_generated",
      label: "Message generated",
      value: messageGenerated,
      source: "mock",
    },
  ];
}

export function buildTopIssues(snapshot: AnalyticsResponse): InsightItem[] {
  const lowYieldDemand = snapshot.productUser.topRoleLocations[2];
  const stageLatency = buildStageLatencyRows(snapshot);
  const slowestStage = [...stageLatency].sort((a, b) => b.value - a.value)[0];
  const queryRows = buildTopQueryEfficiencyRows(snapshot);
  const worstQuery = [...queryRows].sort((a, b) => a.efficiencyPct - b.efficiencyPct)[0];

  return [
    {
      id: "issue_demand_zero",
      title: `High zero-result pocket: ${lowYieldDemand?.label ?? "Emerging role/location"}`,
      detail: "Search demand is high but shown yield is inconsistent.",
      action: "Increase targeted query families and location variants for this pocket.",
      source: lowYieldDemand ? "real" : "mock",
    },
    {
      id: "issue_latency_stage",
      title: `Highest latency stage: ${slowestStage?.label ?? "Extraction"}`,
      detail: `${Math.round(slowestStage?.value ?? 1620)} ms p50 is the largest pipeline delay.`,
      action: "Prioritize batching, caching, and retries in this stage first.",
      source: slowestStage?.source ?? "mock",
    },
    {
      id: "issue_hide_band",
      title: "Score band with highest hide rate: Medium band",
      detail: "Users likely see partial relevance without enough confidence to act.",
      action: "Improve ranking calibration around mid-confidence scores.",
      source: "mock",
    },
    {
      id: "issue_query_yield",
      title: `Lowest HQ-yield query family: ${worstQuery?.query ?? "Long-tail exploratory queries"}`,
      detail: `${Math.round(worstQuery?.efficiencyPct ?? 12)}% HQ efficiency is below target.`,
      action: "Prune low-yield query templates and reallocate budget to higher-yield families.",
      source: worstQuery?.source ?? "mock",
    },
  ];
}

export function buildTopOpportunities(snapshot: AnalyticsResponse): InsightItem[] {
  const bestDemand = snapshot.productUser.topRoleLocations[0];
  const queryRows = buildTopQueryEfficiencyRows(snapshot);
  const bestQuery = [...queryRows].sort((a, b) => b.efficiencyPct - a.efficiencyPct)[0];
  const highQualityPct = breakdownValue(snapshot.feedQuality.qualityBadgeDistribution, "quality_high");

  return [
    {
      id: "opp_demand_pocket",
      title: `Best-performing pocket: ${bestDemand?.label ?? "Core PM roles"}`,
      detail: "Consistent demand and better downstream yield than median pockets.",
      action: "Expand retrieval depth and freshness cadence for this pocket.",
      source: bestDemand ? "real" : "mock",
    },
    {
      id: "opp_query_family",
      title: `Best query family by HQ yield: ${bestQuery?.query ?? "Focused exploit queries"}`,
      detail: `${Math.round(bestQuery?.efficiencyPct ?? 38)}% HQ efficiency outperforms peers.`,
      action: "Promote this family in planner allocation and reduce low-yield variants.",
      source: bestQuery?.source ?? "mock",
    },
    {
      id: "opp_score_action",
      title: "Strongest action rate score band: High band",
      detail: `${Math.round(highQualityPct)}% of scored output is high quality with better action signals.`,
      action: "Increase surfaced share of high-band leads while tightening medium-band thresholds.",
      source: "mixed",
    },
    {
      id: "opp_coverage_expand",
      title: "Coverage expansion opportunity: Bay Area + adjacent metros",
      detail: "Demand concentration suggests strong incremental value from metro expansion.",
      action: "Expand geo alias + query expansion for adjacent city clusters.",
      source: "mock",
    },
  ];
}

function trendFromPrev(value: number, prevValue: number | null, unit: "count" | "percent" | "ratio") {
  if (prevValue === null) return "No baseline";
  const delta = value - prevValue;
  const sign = delta > 0 ? "+" : "";
  if (unit === "percent") return `${sign}${Math.round(delta)} pts`;
  if (unit === "ratio") return `${sign}${delta.toFixed(2)}`;
  return `${sign}${Math.round(delta)}`;
}

export function buildDemandKpis(snapshot: AnalyticsResponse): DemandKpiItem[] {
  const totalRuns = snapshot.overview.metrics.find((item) => item.id === "overview_total_runs");
  const activeUsers = snapshot.overview.metrics.find((item) => item.id === "overview_active_users");
  const freshShare = snapshot.overview.metrics.find((item) => item.id === "overview_fresh_share");
  const repeatRate = snapshot.productUser.metrics.find((item) => item.id === "product_repeat_user_rate");
  const topDemandTotal = snapshot.productUser.topRoleLocations.reduce((sum, row) => sum + row.value, 0);

  const searches = totalRuns?.global.value ?? 0;
  const active = Math.max(1, activeUsers?.global.value ?? 1);
  const searchesPerActiveUser = searches / active;

  const strictLocationRate = Math.max(14, Math.round((freshShare?.global.value ?? 0) * 0.48));
  const zeroResultRate = snapshot.overview.metrics.find((item) => item.id === "overview_zero_result_search_rate")?.global.value
    ?? Math.max(8, Math.round(41 - (freshShare?.global.value ?? 0) * 0.23));
  const repeatSearchRate = Math.max(6, Math.round((repeatRate?.global.value ?? 0) * 0.72));
  const distinctCombos = Math.max(snapshot.productUser.topRoleLocations.length, Math.round(topDemandTotal * 0.22));

  return [
    {
      id: "demand_kpi_searches_per_user",
      label: "Searches / active user",
      value: searchesPerActiveUser.toFixed(2),
      delta: trendFromPrev(searchesPerActiveUser, totalRuns?.global.prevValue ? totalRuns.global.prevValue / active : null, "ratio"),
      subline: "Higher can signal strong demand or unresolved intent",
      source: "real",
    },
    {
      id: "demand_kpi_strict_location_rate",
      label: "Strict location usage",
      value: `${strictLocationRate}%`,
      delta: "Proxy from strict-intent behavior",
      subline: "High strictness increases coverage pressure",
      source: "mixed",
    },
    {
      id: "demand_kpi_zero_result_rate",
      label: "Zero-result search rate",
      value: `${zeroResultRate}%`,
      delta: "Estimated from shown-yield patterns",
      subline: "Primary signal of unmet demand",
      source: "mixed",
    },
    {
      id: "demand_kpi_repeat_rerun_rate",
      label: "Repeat search / rerun rate",
      value: `${repeatSearchRate}%`,
      delta: trendFromPrev(repeatSearchRate, repeatRate?.global.prevValue ?? null, "percent"),
      subline: "Reruns imply unresolved user intent",
      source: "mixed",
    },
    {
      id: "demand_kpi_distinct_combos",
      label: "Distinct role-location combos",
      value: distinctCombos.toLocaleString(),
      delta: "Top combinations in selected range",
      subline: "Demand spread across search intent pockets",
      source: "mixed",
    },
  ];
}

export function buildDemandComboRows(snapshot: AnalyticsResponse): DemandComboRow[] {
  const qualityHighPct = breakdownValue(snapshot.feedQuality.qualityBadgeDistribution, "quality_high");
  return snapshot.productUser.topRoleLocations.map((row, index) => {
    const zeroResultRate = Math.max(10, Math.min(72, Math.round(57 - row.value * 1.9 + index * 6)));
    const hqYieldPerRun = Math.max(0.08, Number((qualityHighPct / 100 * (0.95 - index * 0.11)).toFixed(2)));
    let status: DemandComboRow["status"] = "weak_coverage";
    if (zeroResultRate <= 18 && hqYieldPerRun >= 0.24) status = "strong_coverage";
    if (zeroResultRate >= 40 || hqYieldPerRun <= 0.12) status = "high_demand_gap";
    return {
      id: `demand_combo_${row.id}`,
      combo: row.label,
      searchVolume: Math.round(row.value),
      zeroResultRate,
      hqYieldPerRun,
      status,
      source: "mixed",
    };
  });
}

export function buildDemandCoverageGapInsights(rows: DemandComboRow[]): InsightItem[] {
  const priorityRows = rows
    .filter((row) => row.status === "high_demand_gap" || row.status === "weak_coverage")
    .sort((a, b) => b.searchVolume - a.searchVolume)
    .slice(0, 4);

  return priorityRows.map((row) => ({
    id: `gap_${row.id}`,
    title: row.combo,
    detail: `${row.searchVolume} searches • ${row.zeroResultRate}% zero-result • ${Math.round(row.hqYieldPerRun * 100)}% HQ/run`,
    action:
      row.status === "high_demand_gap"
        ? "High-priority retrieval expansion candidate."
        : "Tune query family and location variants to improve yield.",
    source: row.source,
  }));
}

export function buildDemandBehaviorBreakdowns(snapshot: AnalyticsResponse) {
  const strictUsage = buildDemandKpis(snapshot).find((item) => item.id === "demand_kpi_strict_location_rate");
  const strictRate = strictUsage ? Number(strictUsage.value.replace("%", "")) : 35;
  const repeatRate = buildDemandKpis(snapshot).find((item) => item.id === "demand_kpi_repeat_rerun_rate");
  const rerunRate = repeatRate ? Number(repeatRate.value.replace("%", "")) : 24;

  const base24 = Math.max(18, Math.min(36, Math.round(22 + (strictRate - 25) * 0.22)));
  const baseMonth = Math.max(14, Math.min(32, Math.round(29 - (strictRate - 25) * 0.18)));
  const baseWeek = Math.max(20, 100 - base24 - baseMonth);
  const fullTime = Math.max(40, Math.min(62, Math.round(54 - rerunRate * 0.2)));
  const contract = Math.max(10, Math.min(28, Math.round(17 + strictRate * 0.12)));
  const internship = 11;
  const partTime = Math.max(5, 100 - fullTime - contract - internship);

  return {
    recencyUsage: [
      { id: "recency_24h", label: "Past 24h", value: base24, source: "mixed" as const },
      { id: "recency_week", label: "Past week", value: baseWeek, source: "mixed" as const },
      { id: "recency_month", label: "Past month", value: baseMonth, source: "mixed" as const },
    ],
    employmentUsage: [
      { id: "emp_full_time", label: "Full-time", value: fullTime, source: "mixed" as const },
      { id: "emp_contract", label: "Contract", value: contract, source: "mixed" as const },
      { id: "emp_intern", label: "Internship", value: internship, source: "mixed" as const },
      { id: "emp_part_time", label: "Part-time", value: partTime, source: "mixed" as const },
    ],
    strictLooseSplit: [
      { id: "loc_strict", label: "Strict location", value: strictRate, source: "mixed" as const },
      { id: "loc_loose", label: "Loose location", value: Math.max(0, 100 - strictRate), source: "mixed" as const },
    ],
    rerunSplit: [
      { id: "rerun_same", label: "Reruns (same filters)", value: rerunRate, source: "mixed" as const },
      { id: "rerun_new", label: "New searches", value: Math.max(0, 100 - rerunRate), source: "mixed" as const },
    ],
  };
}

export function buildPipelineKpis(snapshot: AnalyticsResponse): PipelineKpiItem[] {
  const runs = Math.max(1, metricValue(snapshot.overview.metrics, "overview_total_runs"));
  const queries = Math.max(0, metricValue(snapshot.agentSystem.metrics, "agent_query_volume"));
  const shown = Math.max(0, metricValue(snapshot.overview.metrics, "overview_leads_shown"));
  const scoreCoverage = Math.max(0, metricValue(snapshot.feedQuality.metrics, "feed_score_coverage"));
  const hqPct = Math.max(0, breakdownValue(snapshot.feedQuality.qualityBadgeDistribution, "quality_high"));

  const retrieved = Math.round(queries * 7.8);
  const uniqueAfterDedupe = Math.round(retrieved * 0.63);
  const extracted = Math.round(uniqueAfterDedupe * 0.76);
  const scored = Math.round(shown * (scoreCoverage / 100));
  const highQuality = Math.round(scored * (hqPct / 100));

  const queriesPerRun = queries / runs;
  const resultsPerQuery = queries > 0 ? retrieved / queries : 0;
  const uniquePerRun = uniqueAfterDedupe / runs;
  const extractionSuccessRate = uniqueAfterDedupe > 0 ? (extracted / uniqueAfterDedupe) * 100 : 0;
  const scoringSuccessRate = extracted > 0 ? (scored / extracted) * 100 : 0;
  const highQualityPerRun = highQuality / runs;

  return [
    {
      id: "pipe_kpi_queries_per_run",
      label: "Queries / run",
      value: queriesPerRun.toFixed(2),
      delta: "Planner query pressure",
      subline: "Higher values can improve recall but add cost/overlap",
      source: "real",
    },
    {
      id: "pipe_kpi_results_per_query",
      label: "Results / query",
      value: resultsPerQuery.toFixed(1),
      delta: "Retrieval breadth proxy",
      subline: "Low value suggests weak query recall",
      source: "mixed",
    },
    {
      id: "pipe_kpi_unique_per_run",
      label: "Unique posts / run",
      value: uniquePerRun.toFixed(1),
      delta: "After dedupe",
      subline: "Signals overlap and duplicate-heavy retrieval",
      source: "mixed",
    },
    {
      id: "pipe_kpi_extraction_success",
      label: "Extraction success rate",
      value: `${Math.round(extractionSuccessRate)}%`,
      delta: "Unique → extracted",
      subline: "Low value indicates extraction/schema failures",
      source: "mixed",
    },
    {
      id: "pipe_kpi_scoring_success",
      label: "Scoring success rate",
      value: `${Math.round(scoringSuccessRate)}%`,
      delta: "Extracted → scored",
      subline: "Low value indicates scoring blockers or missing signals",
      source: "mixed",
    },
    {
      id: "pipe_kpi_hq_per_run",
      label: "High-quality posts / run",
      value: highQualityPerRun.toFixed(2),
      delta: `${Math.round(hqPct)}% HQ among scored`,
      subline: "Primary output quality signal",
      source: "mixed",
    },
  ];
}

export function buildPipelineStages(snapshot: AnalyticsResponse): PipelineStageItem[] {
  const runs = Math.max(1, metricValue(snapshot.overview.metrics, "overview_total_runs"));
  const queries = Math.max(0, metricValue(snapshot.agentSystem.metrics, "agent_query_volume"));
  const shown = Math.max(0, metricValue(snapshot.overview.metrics, "overview_leads_shown"));
  const scoreCoverage = Math.max(0, metricValue(snapshot.feedQuality.metrics, "feed_score_coverage"));
  const hqPct = Math.max(0, breakdownValue(snapshot.feedQuality.qualityBadgeDistribution, "quality_high"));

  const retrieved = Math.round(queries * 7.8);
  const uniqueAfterDedupe = Math.round(retrieved * 0.63);
  const extracted = Math.round(uniqueAfterDedupe * 0.76);
  const scored = Math.round(shown * (scoreCoverage / 100));
  const highQuality = Math.round(scored * (hqPct / 100));

  const base = [
    { id: "pipe_run_started", label: "Run started", value: runs, source: "real" as const },
    { id: "pipe_queries_generated", label: "Queries generated", value: queries, source: "real" as const },
    { id: "pipe_results_retrieved", label: "Results retrieved", value: retrieved, source: "mixed" as const },
    { id: "pipe_unique_after_dedupe", label: "Unique posts after dedupe", value: uniqueAfterDedupe, source: "mixed" as const },
    { id: "pipe_extracted", label: "Posts extracted successfully", value: extracted, source: "mixed" as const },
    { id: "pipe_scored", label: "Posts scored successfully", value: scored, source: "mixed" as const },
    { id: "pipe_shown", label: "Posts shown", value: shown, source: "real" as const },
    { id: "pipe_hq", label: "High-quality posts", value: highQuality, source: "mixed" as const },
  ];

  const withMetrics = base.map((item, index) => {
    const prev = index > 0 ? base[index - 1]?.value ?? 0 : item.value;
    const conversion = index === 0 ? null : (prev > 0 ? (item.value / prev) * 100 : 0);
    const cumulativeLoss = base[0].value > 0 ? (1 - item.value / base[0].value) * 100 : 0;
    return {
      ...item,
      conversionFromPrev: conversion,
      cumulativeLoss,
      highlightDrop: false,
    };
  });

  let maxDrop = -1;
  let maxDropIndex = -1;
  for (let index = 1; index < withMetrics.length; index += 1) {
    const conv = withMetrics[index]?.conversionFromPrev ?? 100;
    const drop = 100 - conv;
    if (drop > maxDrop) {
      maxDrop = drop;
      maxDropIndex = index;
    }
  }
  if (maxDropIndex > 0) {
    withMetrics[maxDropIndex]!.highlightDrop = true;
  }

  return withMetrics;
}

export function buildPipelineQueryRows(snapshot: AnalyticsResponse): PipelineQueryRow[] {
  const top = snapshot.productUser.topRoleLocations;
  if (top.length === 0) {
    return [
      {
        id: "pipeline_query_default_1",
        queryFamily: "Product Manager · Seattle hiring posts",
        runs: 12,
        retrieved: 86,
        extracted: 54,
        highQuality: 14,
        hqYieldPct: 25.9,
        avgCostUsd: 0.08,
        status: "strong",
        source: "mock",
      },
    ];
  }

  return top.slice(0, 6).map((item, index) => {
    const runs = Math.max(4, Math.round(item.value * 0.55));
    const retrieved = Math.max(18, Math.round(item.value * (8.6 - index * 0.8)));
    const extracted = Math.max(8, Math.round(retrieved * (0.68 - index * 0.05)));
    const highQuality = Math.max(1, Math.round(extracted * (0.29 - index * 0.03)));
    const hqYieldPct = extracted > 0 ? (highQuality / extracted) * 100 : 0;
    const avgCostUsd = Number((0.06 + index * 0.015).toFixed(2));
    const status: PipelineQueryRow["status"] =
      hqYieldPct >= 24 ? "strong" : hqYieldPct >= 14 ? "watch" : "weak";
    return {
      id: `pipeline_query_${item.id}`,
      queryFamily: `${item.label} hiring posts`,
      runs,
      retrieved,
      extracted,
      highQuality,
      hqYieldPct: Number(hqYieldPct.toFixed(1)),
      avgCostUsd,
      status,
      source: "mixed",
    };
  });
}

export function buildPipelineDiagnostics(
  snapshot: AnalyticsResponse,
  rows: PipelineQueryRow[],
): PipelineDiagnosticItem[] {
  const duplicateHeavy = [...rows].sort(
    (a, b) => b.retrieved - b.extracted - (a.retrieved - a.extracted),
  )[0];
  const extractionSuccessRaw = buildPipelineKpis(snapshot)
    .find((item) => item.id === "pipe_kpi_extraction_success")
    ?.value;
  const scoringSuccessRaw = buildPipelineKpis(snapshot)
    .find((item) => item.id === "pipe_kpi_scoring_success")
    ?.value;
  const extractionSuccess = Number.parseFloat((extractionSuccessRaw ?? "0").replace("%", ""));
  const scoringSuccess = Number.parseFloat((scoringSuccessRaw ?? "0").replace("%", ""));
  const extractionFailureShare = Math.max(0, 100 - (Number.isFinite(extractionSuccess) ? extractionSuccess : 0));
  const scoringFailureShare = Math.max(0, 100 - (Number.isFinite(scoringSuccess) ? scoringSuccess : 0));

  return [
    {
      id: "pipe_diag_duplicates",
      title: "Duplicate-heavy query family",
      value: duplicateHeavy?.queryFamily ?? "N/A",
      detail: "High overlap indicates wasted retrieval budget and lower unique yield.",
      source: duplicateHeavy?.source ?? "mock",
    },
    {
      id: "pipe_diag_extraction_fail",
      title: "Extraction failure share",
      value: `${Math.round(Number(extractionFailureShare) || 24)}%`,
      detail: "Focus on parsing robustness and fallback extraction paths.",
      source: "mixed",
    },
    {
      id: "pipe_diag_missing_fields",
      title: "Common missing fields",
      value: "company, workMode, employmentType",
      detail: "Missing static fields reduce scoring confidence and downstream action.",
      source: "mock",
    },
    {
      id: "pipe_diag_scoring_blockers",
      title: "Scoring blockers",
      value: `${Math.round(Number(scoringFailureShare) || 17)}% unscored`,
      detail: "Usually caused by missing extraction fields or unresolved location signals.",
      source: "mixed",
    },
  ];
}

export function buildProductValueKpis(snapshot: AnalyticsResponse): ProductValueKpiItem[] {
  const runs = Math.max(1, metricValue(snapshot.overview.metrics, "overview_total_runs"));
  const shown = Math.max(0, metricValue(snapshot.overview.metrics, "overview_leads_shown"));
  const openedRate = Math.max(0, breakdownValue(snapshot.productUser.engagementRates, "engagement_opened"));
  const clickRate = Math.max(0, breakdownValue(snapshot.productUser.engagementRates, "engagement_clicked"));
  const hiddenRate = Math.max(0, breakdownValue(snapshot.productUser.engagementRates, "engagement_hidden"));
  const notHelpfulRate = Math.max(0, breakdownValue(snapshot.productUser.engagementRates, "engagement_not_helpful"));
  const repeatRate = Math.max(0, metricValue(snapshot.productUser.metrics, "product_repeat_user_rate"));

  const openedPerRun = runs > 0 ? (shown * (openedRate / 100)) / runs : 0;
  const messageGenerationRate = Math.max(2, Math.round(clickRate * 0.42));
  const statusUpdateRate = Math.max(6, Math.round((openedRate + clickRate) * 0.5));
  const timeToFirstActionableMetric = snapshot.agentSystem.metrics.find(
    (item) => item.id === "reliability_time_to_first_actionable_post",
  );
  const timeToFirstActionable = Math.max(
    9,
    Math.round((timeToFirstActionableMetric?.global.value ?? (shown > 0 ? (runs / shown) * 26000 : 26000)) / 1000),
  );

  return [
    {
      id: "pv_kpi_opened_per_run",
      label: "Posts opened / run",
      value: openedPerRun.toFixed(2),
      delta: `${Math.round(openedRate)}% open rate`,
      subline: "Primary signal that surfaced posts look worth reviewing",
      source: "mixed",
    },
    {
      id: "pv_kpi_external_ctr",
      label: "External click-through rate",
      value: `${Math.round(clickRate)}%`,
      delta: "Shown → external click",
      subline: "Measures trust to leave HireFeed and inspect original post",
      source: "real",
    },
    {
      id: "pv_kpi_message_rate",
      label: "Message generation rate",
      value: `${messageGenerationRate}%`,
      delta: "Action proxy",
      subline: "Share of shown posts that trigger outreach intent",
      source: "mock",
    },
    {
      id: "pv_kpi_status_update_rate",
      label: "Status update rate",
      value: `${statusUpdateRate}%`,
      delta: "Lifecycle tracking signal",
      subline: "Indicates users are progressing leads, not just browsing",
      source: "mixed",
    },
    {
      id: "pv_kpi_repeat_user_rate",
      label: "Repeat user rate",
      value: `${Math.round(repeatRate)}%`,
      delta: "Retention quality signal",
      subline: "Repeat usage implies sustained value from results",
      source: "real",
    },
    {
      id: "pv_kpi_ttf_actionable",
      label: "Time to first actionable post",
      value: `${timeToFirstActionable}s`,
      delta: "Median proxy",
      subline: "Lower time means value appears faster in the feed",
      source: timeToFirstActionableMetric?.source ?? "mixed",
    },
  ];
}

export function buildScoreBandBehavior(snapshot: AnalyticsResponse): ScoreBandBehaviorRow[] {
  const shown = Math.max(0, metricValue(snapshot.overview.metrics, "overview_leads_shown"));
  const quality = snapshot.feedQuality.qualityBadgeDistribution;
  const highPct = breakdownValue(quality, "quality_high");
  const mediumPct = breakdownValue(quality, "quality_medium");
  const lowPct = breakdownValue(quality, "quality_low");
  const unscoredPct = breakdownValue(quality, "quality_unscored");

  const openedBase = Math.max(0, breakdownValue(snapshot.productUser.engagementRates, "engagement_opened"));
  const clickedBase = Math.max(0, breakdownValue(snapshot.productUser.engagementRates, "engagement_clicked"));
  const hiddenBase = Math.max(0, breakdownValue(snapshot.productUser.engagementRates, "engagement_hidden"));
  const notHelpfulBase = Math.max(0, breakdownValue(snapshot.productUser.engagementRates, "engagement_not_helpful"));
  const negativeBase = hiddenBase + notHelpfulBase;

  const rows: Array<Omit<ScoreBandBehaviorRow, "source">> = [
    {
      id: "band_high",
      band: "high",
      shown: Math.round(shown * (highPct / 100)),
      openedRate: Math.max(35, Math.min(82, Math.round(openedBase * 1.55))),
      clickRate: Math.max(18, Math.min(56, Math.round(clickedBase * 1.65))),
      messageRate: Math.max(7, Math.min(26, Math.round(clickedBase * 0.72))),
      hideNotHelpfulRate: Math.max(4, Math.round(negativeBase * 0.36)),
    },
    {
      id: "band_medium",
      band: "medium",
      shown: Math.round(shown * (mediumPct / 100)),
      openedRate: Math.max(20, Math.min(65, Math.round(openedBase * 1.02))),
      clickRate: Math.max(8, Math.min(38, Math.round(clickedBase * 1.06))),
      messageRate: Math.max(3, Math.min(16, Math.round(clickedBase * 0.44))),
      hideNotHelpfulRate: Math.max(10, Math.round(negativeBase * 0.9)),
    },
    {
      id: "band_low",
      band: "low",
      shown: Math.round(shown * (lowPct / 100)),
      openedRate: Math.max(9, Math.min(41, Math.round(openedBase * 0.62))),
      clickRate: Math.max(2, Math.min(22, Math.round(clickedBase * 0.55))),
      messageRate: Math.max(1, Math.min(8, Math.round(clickedBase * 0.22))),
      hideNotHelpfulRate: Math.max(18, Math.round(negativeBase * 1.3)),
    },
    {
      id: "band_unscored",
      band: "unscored",
      shown: Math.round(shown * (unscoredPct / 100)),
      openedRate: Math.max(7, Math.min(34, Math.round(openedBase * 0.5))),
      clickRate: Math.max(1, Math.min(18, Math.round(clickedBase * 0.4))),
      messageRate: Math.max(1, Math.min(6, Math.round(clickedBase * 0.16))),
      hideNotHelpfulRate: Math.max(20, Math.round(negativeBase * 1.45)),
    },
  ];

  return rows.map((row) => ({
    ...row,
    source: row.band === "high" || row.band === "medium" ? "mixed" : "mock",
  }));
}

export function buildTrustFieldRows(snapshot: AnalyticsResponse): TrustFieldRow[] {
  const fields = snapshot.feedQuality.fieldCompleteness;
  const company = breakdownValue(fields, "complete_company");
  const location = breakdownValue(fields, "complete_location");
  const workMode = breakdownValue(fields, "complete_work_mode");

  return [
    {
      id: "trust_company",
      field: "Company presence",
      coverage: company,
      trustRisk: company >= 80 ? "low" : company >= 60 ? "medium" : "high",
      note: "Missing company reduces confidence in authenticity and outreach quality.",
      source: "real",
    },
    {
      id: "trust_location",
      field: "Location presence",
      coverage: location,
      trustRisk: location >= 80 ? "low" : location >= 60 ? "medium" : "high",
      note: "Missing location lowers intent-match trust for strict searchers.",
      source: "real",
    },
    {
      id: "trust_work_mode",
      field: "Work mode presence",
      coverage: workMode,
      trustRisk: workMode >= 75 ? "low" : workMode >= 55 ? "medium" : "high",
      note: "Unknown work mode weakens actionability and response confidence.",
      source: "real",
    },
    {
      id: "trust_poster_type",
      field: "Poster type coverage",
      coverage: 71,
      trustRisk: "medium",
      note: "Unknown poster type reduces confidence in hiring intent strength.",
      source: "mock",
    },
    {
      id: "trust_employment_type",
      field: "Employment type presence",
      coverage: 64,
      trustRisk: "medium",
      note: "Missing employment type creates mismatch risk and lower click intent.",
      source: "mock",
    },
  ];
}

export function buildActionableSegments(snapshot: AnalyticsResponse): ActionableSegmentRow[] {
  const topDemand = snapshot.productUser.topRoleLocations[0]?.label ?? "Product Manager · Seattle";
  const secondDemand = snapshot.productUser.topRoleLocations[1]?.label ?? "Product Manager · Bay Area";
  const clickRate = Math.max(0, breakdownValue(snapshot.productUser.engagementRates, "engagement_clicked"));
  const openedRate = Math.max(0, breakdownValue(snapshot.productUser.engagementRates, "engagement_opened"));
  const baseActionRate = Math.max(8, Math.round((clickRate * 0.62 + openedRate * 0.38)));

  return [
    {
      id: "seg_hiring_manager",
      segment: "Hiring manager posts",
      actionRate: Math.max(18, baseActionRate + 7),
      confidence: "medium",
      source: "mixed",
    },
    {
      id: "seg_strong_match",
      segment: "Strong match posts",
      actionRate: Math.max(22, baseActionRate + 11),
      confidence: "medium",
      source: "mixed",
    },
    {
      id: "seg_top_demand_1",
      segment: topDemand,
      actionRate: Math.max(16, baseActionRate + 4),
      confidence: "medium",
      source: "mixed",
    },
    {
      id: "seg_top_demand_2",
      segment: secondDemand,
      actionRate: Math.max(14, baseActionRate + 1),
      confidence: "medium",
      source: "mixed",
    },
    {
      id: "seg_recent_7d",
      segment: "Recent posts (<=7 days)",
      actionRate: Math.max(17, baseActionRate + 6),
      confidence: "low",
      source: "mixed",
    },
  ];
}

export function buildReliabilityKpis(snapshot: AnalyticsResponse): ReliabilityKpiItem[] {
  const runs = Math.max(1, metricValue(snapshot.overview.metrics, "overview_total_runs"));
  const durationMs = Math.max(0, metricValue(snapshot.overview.metrics, "overview_avg_run_ms"));
  const shown = Math.max(0, metricValue(snapshot.overview.metrics, "overview_leads_shown"));
  const scoreCoverage = Math.max(0, metricValue(snapshot.feedQuality.metrics, "feed_score_coverage"));
  const hqPct = Math.max(0, breakdownValue(snapshot.feedQuality.qualityBadgeDistribution, "quality_high"));
  const actionableRate = Math.max(0, breakdownValue(snapshot.productUser.engagementRates, "engagement_clicked"));
  const ttfaMetric = snapshot.agentSystem.metrics.find(
    (item) => item.id === "reliability_time_to_first_actionable_post",
  );
  const costPerHqMetric = snapshot.agentSystem.metrics.find(
    (item) => item.id === "reliability_cost_per_hq_post",
  );

  const completionRate = Math.max(74, Math.min(98, Math.round(100 - (breakdownValue(snapshot.agentSystem.stopReasonDistribution, "stop_unknown") || 0) * 1.2)));
  const failureRate = Math.max(2, Math.round(100 - completionRate));
  const medianTtfrSec = Math.max(7, Math.round((durationMs / 1000) * 0.34));
  const medianRunDurationSec = Math.max(12, Math.round(durationMs / 1000));

  const highQualityCount = shown * (scoreCoverage / 100) * (hqPct / 100);
  const costPerHq = costPerHqMetric?.global.value ?? (highQualityCount > 0 ? Number((0.09 * runs / highQualityCount).toFixed(2)) : 0.34);
  const costPerRun = Number((costPerHq * Math.max(1, highQualityCount) / runs).toFixed(2));
  const medianTtfActionableSec = Math.max(7, Math.round((ttfaMetric?.global.value ?? 19000) / 1000));

  return [
    {
      id: "rel_kpi_run_completion",
      label: "Run completion rate",
      value: `${completionRate}%`,
      delta: `${failureRate}% failure`,
      subline: "How often runs finish without terminal issues",
      source: "mixed",
    },
    {
      id: "rel_kpi_ttfr",
      label: "Median time to first result",
      value: `${medianTtfrSec}s`,
      delta: "Proxy from run-stage telemetry",
      subline: "How quickly users see usable output",
      source: "mock",
    },
    {
      id: "rel_kpi_run_duration",
      label: "Median total run duration",
      value: `${medianRunDurationSec}s`,
      delta: "Derived from run timing",
      subline: "End-to-end latency for full workflow",
      source: "real",
    },
    {
      id: "rel_kpi_ttf_actionable",
      label: "Median time to first actionable post",
      value: `${medianTtfActionableSec}s`,
      delta: "Includes ranking + quality readiness",
      subline: "Closer to real user-perceived value than first result latency",
      source: ttfaMetric?.source ?? "mixed",
    },
    {
      id: "rel_kpi_failure_rate",
      label: "Failure rate",
      value: `${failureRate}%`,
      delta: "Includes timeout/error/unknown stops",
      subline: "Reliability risk indicator",
      source: "mixed",
    },
    {
      id: "rel_kpi_cost_run",
      label: "Cost per run",
      value: `$${costPerRun.toFixed(2)}`,
      delta: "Current blended estimate",
      subline: "Used for budget tuning decisions",
      source: "mock",
    },
    {
      id: "rel_kpi_cost_hq",
      label: "Cost per high-quality post",
      value: `$${Math.max(0.1, costPerHq).toFixed(2)}`,
      delta: "Output-adjusted unit economics",
      subline: "Should fall as quality throughput improves",
      source: costPerHqMetric?.source ?? "mixed",
    },
  ];
}

export function buildStopReasonRows(snapshot: AnalyticsResponse): BreakdownItem[] {
  const rows = toBreakdownItems(snapshot.agentSystem.stopReasonDistribution);
  const map = new Map(rows.map((row) => [row.id, row.value]));
  const timeout = Math.max(2, Math.round((map.get("stop_max_iterations") ?? 0) * 0.42));
  const error = Math.max(2, Math.round((map.get("stop_unknown") ?? 0) * 0.58));
  const unknown = Math.max(1, Math.round((map.get("stop_unknown") ?? 0) * 0.42));

  return [
    { id: "stop_sufficient_hq", label: "Sufficient HQ leads", value: map.get("stop_sufficient_high_quality_leads") ?? 0, source: "real" },
    { id: "stop_max_iterations", label: "Max iterations reached", value: map.get("stop_max_iterations") ?? 0, source: "real" },
    { id: "stop_timeout", label: "Timeout", value: timeout, source: "mock" },
    { id: "stop_error", label: "Error", value: error, source: "mock" },
    { id: "stop_unknown", label: "Unknown", value: unknown, source: "mixed" },
  ];
}

export function buildStageLatencyMatrixRows(snapshot: AnalyticsResponse): StageLatencyRow[] {
  const existing = buildStageLatencyRowsBase(snapshot);
  return existing.map((row) => ({
    id: row.id,
    stage: row.label.replace(" p50", ""),
    p50Ms: Math.round(row.value),
    p95Ms: Math.round(row.value * 1.82),
    source: row.source ?? "mixed",
  }));
}

function buildStageLatencyRowsBase(snapshot: AnalyticsResponse): BreakdownItem[] {
  return buildStageLatencyRows(snapshot);
}

export function buildFailureSourceRows(snapshot: AnalyticsResponse): FailureSourceRow[] {
  const extractionFailure = Math.max(
    6,
    Math.round(
      100 -
        Number.parseFloat(
          (buildPipelineKpis(snapshot).find((item) => item.id === "pipe_kpi_extraction_success")?.value ?? "0").replace("%", ""),
        ),
    ),
  );
  const scoringFailure = Math.max(
    4,
    Math.round(
      100 -
        Number.parseFloat(
          (buildPipelineKpis(snapshot).find((item) => item.id === "pipe_kpi_scoring_success")?.value ?? "0").replace("%", ""),
        ),
    ),
  );

  const rows: FailureSourceRow[] = [
    { id: "fail_retrieval", sourceLabel: "Retrieval failure", share: 14, impact: "medium", source: "mock" },
    { id: "fail_scrape", sourceLabel: "Scrape failure", share: 18, impact: "high", source: "mock" },
    { id: "fail_extraction", sourceLabel: "Extraction parse failure", share: extractionFailure, impact: extractionFailure > 18 ? "high" : "medium", source: "mixed" },
    { id: "fail_enrichment", sourceLabel: "Enrichment failure", share: 11, impact: "medium", source: "mock" },
    { id: "fail_scoring", sourceLabel: "Scoring failure", share: scoringFailure, impact: scoringFailure > 16 ? "high" : "medium", source: "mixed" },
    { id: "fail_ui", sourceLabel: "UI rendering fallback", share: 3, impact: "low", source: "mock" },
  ];
  return rows.sort((a, b) => b.share - a.share);
}

export function buildCostEfficiencyRows(snapshot: AnalyticsResponse): CostEfficiencyRow[] {
  const queryRows = buildPipelineQueryRows(snapshot);
  const weakest = [...queryRows].sort((a, b) => a.hqYieldPct - b.hqYieldPct).slice(0, 2);
  const planner = toBreakdownItems(snapshot.agentSystem.plannerModeDistribution);
  const bestPlanner = [...planner].sort((a, b) => b.value - a.value)[0];

  const costPerHq = snapshot.agentSystem.metrics.find((metric) => metric.id === "reliability_cost_per_hq_post")?.global.value ?? 0.34;
  const runs = Math.max(1, metricValue(snapshot.overview.metrics, "overview_total_runs"));
  const shown = Math.max(0, metricValue(snapshot.overview.metrics, "overview_leads_shown"));
  const clickRate = Math.max(0, breakdownValue(snapshot.productUser.engagementRates, "engagement_clicked"));
  const actionablePosts = Math.max(1, Math.round(shown * (clickRate / 100)));
  const costPerRun = Number((costPerHq * Math.max(1, Math.round(shown * 0.2)) / runs).toFixed(2));
  const costPerActionable = Number((costPerRun * runs / actionablePosts).toFixed(2));

  const rows: CostEfficiencyRow[] = [
    {
      id: "cost_eff_run",
      label: "Cost per run",
      value: `$${costPerRun.toFixed(2)}`,
      note: "Baseline unit cost for one run cycle",
      source: "mixed",
    },
    {
      id: "cost_eff_hq",
      label: "Cost per HQ post",
      value: `$${costPerHq.toFixed(2)}`,
      note: "Cost normalized by high-quality output volume",
      source: "mixed",
    },
    {
      id: "cost_eff_actionable",
      label: "Cost per actionable post",
      value: `$${Math.max(0.1, costPerActionable).toFixed(2)}`,
      note: "Uses action proxy (click/message) for value-adjusted economics",
      source: "mixed",
    },
    {
      id: "cost_eff_high_cost_low_yield",
      label: "High-cost low-yield query families",
      value: weakest.map((row) => row.queryFamily).join(" | "),
      note: "Candidates to prune or reduce budget",
      source: "mixed",
    },
    {
      id: "cost_eff_planner_mode",
      label: "Planner mode vs output efficiency",
      value: bestPlanner?.label ?? "Explore heavy",
      note: "Current dominant planner mode; compare HQ/run before scaling",
      source: "mixed",
    },
  ];
  return rows;
}
