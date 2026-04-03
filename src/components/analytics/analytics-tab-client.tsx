"use client";

import * as React from "react";
import { RefreshCcw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AnalyticsKpiCard } from "@/components/analytics/analytics-kpi-card";
import { AnalyticsSectionCard } from "@/components/analytics/analytics-section-card";
import {
  AnalyticsKpiRow,
  AnalyticsPrimaryRow,
  AnalyticsSectionStack,
  AnalyticsSupportRow,
} from "@/components/analytics/analytics-section-layout";
import {
  buildCostEfficiencyRows,
  buildActionableSegments,
  buildDemandBehaviorBreakdowns,
  buildDemandComboRows,
  buildDemandCoverageGapInsights,
  buildDemandKpis,
  buildFailureSourceRows,
  buildOverviewFunnel,
  buildOverviewKpis,
  buildProductValueKpis,
  buildReliabilityKpis,
  buildScoreBandBehavior,
  buildStageLatencyMatrixRows,
  buildStopReasonRows,
  buildTrustFieldRows,
  buildPipelineDiagnostics,
  buildPipelineKpis,
  buildPipelineQueryRows,
  buildPipelineStages,
  buildTopIssues,
  buildTopOpportunities,
  toBreakdownItems,
  toTrendPoints,
} from "@/components/analytics/charts/adapters";
import { MiniAreaTrend } from "@/components/analytics/charts/mini-area-trend";
import { StackedBarTrend } from "@/components/analytics/charts/stacked-bar-trend";
import { DataProvenanceLegend } from "@/components/analytics/data-provenance-legend";
import { PipelineFunnel } from "@/components/analytics/pipeline-funnel";
import { DemandComboTable } from "@/components/analytics/demand-combo-table";
import { PipelineStageLossView } from "@/components/analytics/pipeline-stage-loss-view";
import { PipelineQueryTable } from "@/components/analytics/pipeline-query-table";
import { ScoreBandBehaviorTable } from "@/components/analytics/score-band-behavior-table";
import { ActionableSegmentsTable } from "@/components/analytics/actionable-segments-table";
import type { AnalyticsRange, AnalyticsResponse } from "@/lib/types/api";
import { readApiErrorMessage } from "@/lib/client/api-error";
import { trackAnalyticsEvent } from "@/lib/client/analytics-events";
import { cn } from "@/lib/utils";

type AnalyticsSection =
  | "overview"
  | "demand"
  | "pipeline"
  | "product-value"
  | "reliability-cost";

const RANGE_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
];

const SECTION_OPTIONS: Array<{ value: AnalyticsSection; label: string }> = [
  { value: "overview", label: "Overview" },
  { value: "demand", label: "Demand" },
  { value: "pipeline", label: "Pipeline" },
  { value: "product-value", label: "Product Value" },
  { value: "reliability-cost", label: "Reliability & Cost" },
];

const SOURCE_TONE: Record<"real" | "mock" | "mixed", string> = {
  real: "border-emerald-200 bg-emerald-50 text-emerald-700",
  mock: "border-violet-200 bg-violet-50 text-violet-700",
  mixed: "border-amber-200 bg-amber-50 text-amber-700",
};

function InsightList({
  items,
}: {
  items: Array<{ id: string; title: string; detail: string; action: string; source: "real" | "mock" | "mixed" }>;
}) {
  return (
    <div className="space-y-1.5">
      {items.map((item) => (
        <div
          key={item.id}
          className="rounded-md border border-[var(--intent-muted-border)] bg-[var(--surface-2)] px-2.5 py-2"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[11px] font-medium text-foreground">{item.title}</p>
            {item.source !== "real" ? (
              <span
                className={`inline-flex h-4 items-center rounded-full border px-1.5 text-[9px] font-medium uppercase ${SOURCE_TONE[item.source]}`}
              >
                {item.source}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">{item.detail}</p>
          <p className="mt-1 text-[10px] text-foreground">{item.action}</p>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsTabClient({ isActive = true }: { isActive?: boolean }) {
  const [range, setRange] = React.useState<AnalyticsRange>("30d");
  const [section, setSection] = React.useState<AnalyticsSection>("overview");
  const [snapshot, setSnapshot] = React.useState<AnalyticsResponse | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshTick, setRefreshTick] = React.useState(0);
  const lastViewTrackRef = React.useRef<string | null>(null);

  const loadAnalytics = React.useCallback(async (nextRange: AnalyticsRange, signal?: AbortSignal) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/analytics?range=${nextRange}`, {
        method: "GET",
        cache: "no-store",
        signal,
      });
      const payload = (await response.json()) as {
        ok?: boolean;
        data?: AnalyticsResponse;
        error?: unknown;
      };
      if (!response.ok || !payload?.ok || !payload.data) {
        throw new Error(readApiErrorMessage(payload, "Failed to load analytics"));
      }
      setSnapshot(payload.data);
    } catch (loadError) {
      if (loadError instanceof Error && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Failed to load analytics");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    const controller = new AbortController();
    void loadAnalytics(range, controller.signal);
    return () => controller.abort();
  }, [loadAnalytics, range, refreshTick]);

  React.useEffect(() => {
    if (!isActive) return;
    const trackKey = `${range}:${section}`;
    if (lastViewTrackRef.current === trackKey) return;
    lastViewTrackRef.current = trackKey;
    void trackAnalyticsEvent({
      eventName: "analytics_tab_viewed",
      source: "client",
      properties: {
        range,
        section,
        loadSource: snapshot ? "client_refetch" : "ssr",
      },
    });
  }, [isActive, range, section, snapshot]);

  const isEmpty = React.useMemo(() => {
    if (!snapshot) return false;
    return snapshot.overview.metrics.every(
      (metric) => metric.global.value === 0 && metric.mine.value === 0,
    );
  }, [snapshot]);

  const slices = React.useMemo(() => {
    if (!snapshot) return null;
    const demandKpis = buildDemandKpis(snapshot);
    const demandComboRows = buildDemandComboRows(snapshot);
    const demandGapInsights = buildDemandCoverageGapInsights(demandComboRows);
    const demandBehavior = buildDemandBehaviorBreakdowns(snapshot);
    const pipelineKpis = buildPipelineKpis(snapshot);
    const pipelineStages = buildPipelineStages(snapshot);
    const pipelineQueryRows = buildPipelineQueryRows(snapshot);
    const pipelineDiagnostics = buildPipelineDiagnostics(snapshot, pipelineQueryRows);
    const productValueKpis = buildProductValueKpis(snapshot);
    const scoreBandBehavior = buildScoreBandBehavior(snapshot);
    const trustFieldRows = buildTrustFieldRows(snapshot);
    const actionableSegments = buildActionableSegments(snapshot);
    const reliabilityKpis = buildReliabilityKpis(snapshot);
    const stopReasonRows = buildStopReasonRows(snapshot);
    const stageLatencyMatrixRows = buildStageLatencyMatrixRows(snapshot);
    const failureSourceRows = buildFailureSourceRows(snapshot);
    const costEfficiencyRows = buildCostEfficiencyRows(snapshot);

    return {
      overviewKpis: buildOverviewKpis(snapshot),
      overviewFunnel: buildOverviewFunnel(snapshot),
      topIssues: buildTopIssues(snapshot),
      topOpportunities: buildTopOpportunities(snapshot),
      demandKpis,
      demandComboRows,
      demandGapInsights,
      demandBehavior,
      pipelineKpis,
      pipelineStages,
      pipelineQueryRows,
      pipelineDiagnostics,
      productValueKpis,
      scoreBandBehavior,
      trustFieldRows,
      actionableSegments,
      reliabilityKpis,
      stopReasonRows,
      stageLatencyMatrixRows,
      failureSourceRows,
      costEfficiencyRows,
      runTrend: toTrendPoints(snapshot.overview.runTrend),
      queryMix: toBreakdownItems(snapshot.agentSystem.queryStrategyMix),
      queryVolumeTrend: toTrendPoints(snapshot.agentSystem.queryVolumeTrend),
      runDurationSplit: toBreakdownItems(snapshot.agentSystem.runDurationBuckets),
    };
  }, [snapshot]);

  return (
    <div className="mt-3 space-y-2.5">
      <Card className="border-[var(--intent-muted-border)] bg-[var(--section-workspace-bg)] p-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="grid min-w-[560px] flex-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {SECTION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setSection(option.value)}
                className={cn(
                  "rounded-md border px-2.5 py-1.5 text-left text-[11px] font-medium transition-colors",
                  section === option.value
                    ? "border-[var(--intent-primary)] bg-[var(--brand-soft)] text-[var(--intent-primary)]"
                    : "border-[var(--intent-muted-border)] bg-[var(--surface-1)] text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <div className="inline-flex rounded-full border border-[var(--intent-muted-border)] bg-[var(--surface-2)] p-1">
              {RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                    range === option.value
                      ? "bg-black text-white"
                      : "text-muted-foreground hover:bg-background hover:text-foreground",
                  )}
                  onClick={() => setRange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 px-2 text-[10px]"
              onClick={() => setRefreshTick((value) => value + 1)}
            >
              <RefreshCcw className="mr-1 h-3 w-3" />
              Refresh
            </Button>
          </div>
        </div>
        <div className="mt-1.5 flex justify-end gap-2 text-[10px] text-muted-foreground">
          <span>Updated: {snapshot?.generatedAt ? new Date(snapshot.generatedAt).toLocaleString() : "—"}</span>
          <DataProvenanceLegend className="opacity-45" />
        </div>
      </Card>

      {error ? (
        <Card className="border-destructive/40 bg-destructive/10 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </Card>
      ) : null}

      {isLoading && !snapshot ? (
        <Card className="border-[var(--intent-muted-border)] bg-[var(--surface-1)] p-4">
          <p className="text-sm text-muted-foreground">Loading analytics…</p>
        </Card>
      ) : null}

      {!isLoading && snapshot && isEmpty ? (
        <Card className="border-[var(--intent-muted-border)] bg-[var(--surface-1)] p-4">
          <h3 className="text-sm font-semibold">No analytics yet</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Run a few searches to populate dashboard metrics and trends.
          </p>
        </Card>
      ) : null}

      {!isLoading && snapshot && !isEmpty ? (
        <div className="space-y-2.5">
          {section === "overview" ? (
            <AnalyticsSectionStack>
              <AnalyticsKpiRow>
                {(slices?.overviewKpis ?? []).map((metric) => (
                  <AnalyticsKpiCard
                    key={metric.id}
                    label={metric.label}
                    value={metric.value}
                    delta={metric.delta}
                    footnote={metric.subline}
                    source={metric.source}
                  />
                ))}
              </AnalyticsKpiRow>
              <AnalyticsPrimaryRow className="xl:grid-cols-[1.7fr_1fr]">
                <AnalyticsSectionCard
                  title="Value chain funnel"
                  subtitle="Find the largest drop from search intent to user action"
                >
                  <div className="space-y-1.5">
                    <PipelineFunnel steps={slices?.overviewFunnel ?? []} />
                    <div className="overflow-x-auto rounded-md border border-[var(--intent-muted-border)] bg-[var(--surface-2)]">
                      <table className="w-full min-w-[520px] text-[11px]">
                        <thead className="border-b border-[var(--intent-muted-border)] text-muted-foreground">
                          <tr>
                            <th className="px-2 py-1.5 text-left font-medium">Stage</th>
                            <th className="px-2 py-1.5 text-right font-medium">Count</th>
                            <th className="px-2 py-1.5 text-right font-medium">Conv. from prev</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(slices?.overviewFunnel ?? []).map((step, index, arr) => {
                            const prev = index > 0 ? arr[index - 1]?.value ?? 0 : step.value;
                            const conv = prev > 0 ? (step.value / prev) * 100 : 0;
                            const tone =
                              index > 0 && conv < 55
                                ? "text-rose-600"
                                : index > 0 && conv < 75
                                  ? "text-amber-600"
                                  : "text-emerald-600";
                            return (
                              <tr key={step.id} className="border-b border-[var(--intent-muted-border)] last:border-b-0">
                                <td className="px-2 py-1.5 text-foreground">{step.label}</td>
                                <td className="px-2 py-1.5 text-right font-medium text-foreground">
                                  {Math.round(step.value).toLocaleString()}
                                </td>
                                <td className={`px-2 py-1.5 text-right font-medium ${index === 0 ? "text-muted-foreground" : tone}`}>
                                  {index === 0 ? "—" : `${Math.round(conv)}%`}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </AnalyticsSectionCard>
                <AnalyticsSectionCard title="Run throughput trend" subtitle="Volume trend for delivered searches">
                  <MiniAreaTrend data={slices?.runTrend ?? []} />
                </AnalyticsSectionCard>
              </AnalyticsPrimaryRow>
              <AnalyticsSupportRow>
                <AnalyticsSectionCard
                  title="Top issues"
                  subtitle="Most likely reasons value is leaking today"
                >
                  <InsightList items={slices?.topIssues ?? []} />
                </AnalyticsSectionCard>
                <AnalyticsSectionCard
                  title="Top opportunities"
                  subtitle="Highest-leverage areas to improve value creation"
                >
                  <InsightList items={slices?.topOpportunities ?? []} />
                </AnalyticsSectionCard>
              </AnalyticsSupportRow>
            </AnalyticsSectionStack>
          ) : null}

          {section === "demand" ? (
            <AnalyticsSectionStack>
              <AnalyticsKpiRow className="xl:grid-cols-5">
                {(slices?.demandKpis ?? []).map((metric) => (
                  <AnalyticsKpiCard
                    key={metric.id}
                    label={metric.label}
                    value={metric.value}
                    delta={metric.delta}
                    footnote={metric.subline}
                    source={metric.source}
                  />
                ))}
              </AnalyticsKpiRow>
              <AnalyticsSectionCard
                title="Role-location demand map"
                subtitle="Demand concentration with yield and coverage health"
              >
                <DemandComboTable rows={slices?.demandComboRows ?? []} />
              </AnalyticsSectionCard>
              <AnalyticsPrimaryRow>
                <AnalyticsSectionCard
                  title="Coverage gaps"
                  subtitle="Prioritization aid for retrieval and geo-query expansion"
                >
                  <InsightList items={slices?.demandGapInsights ?? []} />
                </AnalyticsSectionCard>
                <AnalyticsSectionCard
                  title="Search pattern diagnostics"
                  subtitle="Behavioral splits that explain demand-side friction"
                >
                  <div className="grid gap-1.5 md:grid-cols-2">
                    <div className="rounded-md border border-[var(--intent-muted-border)] bg-[var(--surface-2)] p-2">
                      <p className="mb-1 text-[11px] text-muted-foreground">Recency filter usage</p>
                      <StackedBarTrend items={slices?.demandBehavior?.recencyUsage ?? []} />
                    </div>
                    <div className="rounded-md border border-[var(--intent-muted-border)] bg-[var(--surface-2)] p-2">
                      <p className="mb-1 text-[11px] text-muted-foreground">Employment type usage</p>
                      <StackedBarTrend items={slices?.demandBehavior?.employmentUsage ?? []} />
                    </div>
                    <div className="rounded-md border border-[var(--intent-muted-border)] bg-[var(--surface-2)] p-2">
                      <p className="mb-1 text-[11px] text-muted-foreground">Strict vs loose location split</p>
                      <StackedBarTrend items={slices?.demandBehavior?.strictLooseSplit ?? []} />
                    </div>
                    <div className="rounded-md border border-[var(--intent-muted-border)] bg-[var(--surface-2)] p-2">
                      <p className="mb-1 text-[11px] text-muted-foreground">Reruns of same filters</p>
                      <StackedBarTrend items={slices?.demandBehavior?.rerunSplit ?? []} />
                    </div>
                  </div>
                </AnalyticsSectionCard>
              </AnalyticsPrimaryRow>
              <AnalyticsSectionCard title="Demand trend" subtitle="Search pressure over selected range">
                <MiniAreaTrend data={slices?.runTrend ?? []} />
              </AnalyticsSectionCard>
            </AnalyticsSectionStack>
          ) : null}

          {section === "pipeline" ? (
            <AnalyticsSectionStack>
              <AnalyticsKpiRow>
                {(slices?.pipelineKpis ?? []).map((metric) => (
                  <AnalyticsKpiCard
                    key={metric.id}
                    label={metric.label}
                    value={metric.value}
                    delta={metric.delta}
                    footnote={metric.subline}
                    source={metric.source}
                  />
                ))}
              </AnalyticsKpiRow>
              <AnalyticsPrimaryRow className="xl:grid-cols-[1.45fr_1fr]">
                <AnalyticsSectionCard
                  title="Stage conversion + loss"
                  subtitle="Pinpoint where throughput is constrained in the run pipeline"
                >
                  <PipelineStageLossView rows={slices?.pipelineStages ?? []} />
                </AnalyticsSectionCard>
                <AnalyticsSectionCard title="Primary bottleneck" subtitle="Most expensive drop-off to fix next">
                  <div className="space-y-2">
                    {(() => {
                      const drop = (slices?.pipelineStages ?? []).find((row) => row.highlightDrop);
                      if (!drop) {
                        return <p className="text-xs text-muted-foreground">No stage drop-off detected.</p>;
                      }
                      return (
                        <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2">
                          <p className="text-xs font-medium text-rose-700">{drop.label}</p>
                          <p className="mt-1 text-[11px] text-rose-700">
                            Conversion from previous stage: {Math.round(drop.conversionFromPrev ?? 0)}%
                          </p>
                          <p className="mt-1 text-[11px] text-rose-700">
                            Cumulative loss by this stage: {Math.round(drop.cumulativeLoss)}%
                          </p>
                        </div>
                      );
                    })()}
                    <div>
                      <p className="mb-1 text-[11px] text-muted-foreground">Query overlap / strategy split</p>
                      <StackedBarTrend items={slices?.queryMix ?? []} />
                    </div>
                  </div>
                </AnalyticsSectionCard>
              </AnalyticsPrimaryRow>
              <AnalyticsSectionCard title="Query efficiency by family" subtitle="Yield and cost efficiency for pipeline tuning">
                <PipelineQueryTable rows={slices?.pipelineQueryRows ?? []} />
              </AnalyticsSectionCard>
              <AnalyticsSectionCard
                title="Dedupe + extraction diagnostics"
                subtitle="Signals for overlap, extraction failures, missing fields, and scoring blockers"
              >
                <div className="grid gap-1.5 md:grid-cols-2">
                  {(slices?.pipelineDiagnostics ?? []).map((item) => (
                    <div
                      key={item.id}
                      className="rounded-md border border-[var(--intent-muted-border)] bg-[var(--surface-2)] px-2.5 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[11px] font-medium text-foreground">{item.title}</p>
                        <span
                          className={`inline-flex h-4 items-center rounded-full border px-1.5 text-[9px] font-medium uppercase ${SOURCE_TONE[item.source]}`}
                        >
                          {item.source}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] font-semibold text-foreground">{item.value}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </AnalyticsSectionCard>
            </AnalyticsSectionStack>
          ) : null}

          {section === "product-value" ? (
            <AnalyticsSectionStack>
              <AnalyticsKpiRow>
                {(slices?.productValueKpis ?? []).map((metric) => (
                  <AnalyticsKpiCard
                    key={metric.id}
                    label={metric.label}
                    value={metric.value}
                    delta={metric.delta}
                    footnote={metric.subline}
                    source={metric.source}
                  />
                ))}
              </AnalyticsKpiRow>
              <AnalyticsSectionCard
                title="Score-band behavior"
                subtitle="Validate whether ranking score aligns with user behavior"
              >
                <ScoreBandBehaviorTable rows={slices?.scoreBandBehavior ?? []} />
              </AnalyticsSectionCard>
              <AnalyticsPrimaryRow>
                <AnalyticsSectionCard
                  title="Trust and metadata quality"
                  subtitle="Missing card fields that can reduce user trust/actionability"
                >
                  <div className="overflow-x-auto rounded-md border border-[var(--intent-muted-border)] bg-[var(--surface-2)]">
                    <table className="w-full min-w-[560px] text-xs">
                      <thead className="border-b border-[var(--intent-muted-border)] text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Field</th>
                          <th className="px-3 py-2 text-right font-medium">Coverage</th>
                          <th className="px-3 py-2 text-right font-medium">Trust risk</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(slices?.trustFieldRows ?? []).map((row) => (
                          <tr key={row.id} className="border-b border-[var(--intent-muted-border)] last:border-b-0">
                            <td className="px-3 py-2">
                              <p className="font-medium text-foreground">{row.field}</p>
                              <p className="mt-1 text-[11px] text-muted-foreground">{row.note}</p>
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-foreground">{Math.round(row.coverage)}%</td>
                            <td className="px-3 py-2 text-right">
                              <span
                                className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium ${
                                  row.trustRisk === "high"
                                    ? "border-rose-200 bg-rose-50 text-rose-700"
                                    : row.trustRisk === "medium"
                                      ? "border-amber-200 bg-amber-50 text-amber-700"
                                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                }`}
                              >
                                {row.trustRisk}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AnalyticsSectionCard>
                <AnalyticsSectionCard
                  title="Most actionable post segments"
                  subtitle="Segments showing strongest downstream action"
                >
                  <ActionableSegmentsTable rows={slices?.actionableSegments ?? []} />
                </AnalyticsSectionCard>
              </AnalyticsPrimaryRow>
            </AnalyticsSectionStack>
          ) : null}

          {section === "reliability-cost" ? (
            <AnalyticsSectionStack>
              <AnalyticsKpiRow>
                {(slices?.reliabilityKpis ?? []).map((metric) => (
                  <AnalyticsKpiCard
                    key={metric.id}
                    label={metric.label}
                    value={metric.value}
                    delta={metric.delta}
                    footnote={metric.subline}
                    source={metric.source}
                  />
                ))}
              </AnalyticsKpiRow>
              <AnalyticsPrimaryRow>
                <AnalyticsSectionCard
                  title="Stop reasons and completion diagnostics"
                  subtitle="Are run termination outcomes healthy for value delivery?"
                >
                  <StackedBarTrend items={slices?.stopReasonRows ?? []} />
                </AnalyticsSectionCard>
                <AnalyticsSectionCard
                  title="Failure diagnostics"
                  subtitle="Top failure sources across pipeline and UX fallback paths"
                >
                  <div className="overflow-x-auto rounded-md border border-[var(--intent-muted-border)] bg-[var(--surface-2)]">
                    <table className="w-full min-w-[520px] text-xs">
                      <thead className="border-b border-[var(--intent-muted-border)] text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Failure source</th>
                          <th className="px-3 py-2 text-right font-medium">Share</th>
                          <th className="px-3 py-2 text-right font-medium">Impact</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(slices?.failureSourceRows ?? []).map((row) => (
                          <tr key={row.id} className="border-b border-[var(--intent-muted-border)] last:border-b-0">
                            <td className="px-3 py-2 text-foreground">{row.sourceLabel}</td>
                            <td className="px-3 py-2 text-right font-medium text-foreground">{Math.round(row.share)}%</td>
                            <td className="px-3 py-2 text-right">
                              <span
                                className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium ${
                                  row.impact === "high"
                                    ? "border-rose-200 bg-rose-50 text-rose-700"
                                    : row.impact === "medium"
                                      ? "border-amber-200 bg-amber-50 text-amber-700"
                                      : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                }`}
                              >
                                {row.impact}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AnalyticsSectionCard>
              </AnalyticsPrimaryRow>
              <AnalyticsPrimaryRow className="xl:grid-cols-[1.5fr_1fr]">
                <AnalyticsSectionCard
                  title="Stage latency breakdown"
                  subtitle="p50 and p95 by stage to pinpoint bottlenecks"
                >
                  <div className="overflow-x-auto rounded-md border border-[var(--intent-muted-border)] bg-[var(--surface-2)]">
                    <table className="w-full min-w-[560px] text-xs">
                      <thead className="border-b border-[var(--intent-muted-border)] text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Stage</th>
                          <th className="px-3 py-2 text-right font-medium">p50</th>
                          <th className="px-3 py-2 text-right font-medium">p95</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(slices?.stageLatencyMatrixRows ?? []).map((row) => (
                          <tr key={row.id} className="border-b border-[var(--intent-muted-border)] last:border-b-0">
                            <td className="px-3 py-2 text-foreground">{row.stage}</td>
                            <td className="px-3 py-2 text-right font-medium text-foreground">{row.p50Ms} ms</td>
                            <td className="px-3 py-2 text-right font-medium text-foreground">{row.p95Ms} ms</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </AnalyticsSectionCard>
                <AnalyticsSectionCard title="Run duration distribution" subtitle="Where run durations cluster by bucket">
                  <StackedBarTrend items={slices?.runDurationSplit ?? []} />
                </AnalyticsSectionCard>
              </AnalyticsPrimaryRow>
              <AnalyticsSectionCard
                title="Cost efficiency"
                subtitle="Unit economics and efficiency by output quality and planner behavior"
              >
                <div className="overflow-x-auto rounded-md border border-[var(--intent-muted-border)] bg-[var(--surface-2)]">
                  <table className="w-full min-w-[760px] text-xs">
                    <thead className="border-b border-[var(--intent-muted-border)] text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Metric</th>
                        <th className="px-3 py-2 text-right font-medium">Value</th>
                        <th className="px-3 py-2 text-left font-medium">Diagnostic note</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(slices?.costEfficiencyRows ?? []).map((row) => (
                        <tr key={row.id} className="border-b border-[var(--intent-muted-border)] last:border-b-0">
                          <td className="px-3 py-2 text-foreground">{row.label}</td>
                          <td className="px-3 py-2 text-right font-medium text-foreground">{row.value}</td>
                          <td className="px-3 py-2 text-muted-foreground">{row.note}</td>
                        </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </AnalyticsSectionCard>
            </AnalyticsSectionStack>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
