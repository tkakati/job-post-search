import { and, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { dbClient } from "@/lib/db";
import { buildAnalyticsProvenance } from "@/lib/analytics/provenance";
import { deriveDashboardMetrics } from "@/lib/analytics/derived-metrics";
import { getMockAnalyticsEntityDataset } from "@/lib/analytics/mock/entities";
import {
  getMockExperimentsSection,
  getMockNodeLatencyBreakdown,
  getMockSystemMetrics,
} from "@/lib/analytics/mock/snapshot";
import {
  generatedQueries,
  leadEvents,
  leads,
  plannerRuns,
  searchRuns,
} from "@/lib/db/schema";
import type {
  AnalyticsBreakdownItem,
  AnalyticsMetric,
  AnalyticsMetricSource,
  AnalyticsRange,
  AnalyticsRankedItem,
  AnalyticsResponse,
  AnalyticsTimePoint,
} from "@/lib/types/api";

const RANGE_DAYS: Record<AnalyticsRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const SHOWN_EVENT = "shown";
const TRACKED_ENGAGEMENT_EVENTS = ["opened", "clicked", "helpful", "not_helpful", "hidden"] as const;

type TimeWindow = {
  start: Date;
  end: Date;
};

type TimedCountRow = {
  date: string;
  value: number;
};

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toPercent(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return round2((numerator / denominator) * 100);
}

function dayKeyUTC(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function buildDayKeys(window: TimeWindow): string[] {
  const keys: string[] = [];
  const cursor = new Date(window.start);
  cursor.setUTCHours(0, 0, 0, 0);
  const last = new Date(window.end);
  last.setUTCHours(0, 0, 0, 0);
  while (cursor <= last) {
    keys.push(dayKeyUTC(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

function fillTimeSeries(days: string[], globalRows: TimedCountRow[], mineRows: TimedCountRow[]): AnalyticsTimePoint[] {
  const globalByDay = new Map(globalRows.map((row) => [row.date, row.value]));
  const mineByDay = new Map(mineRows.map((row) => [row.date, row.value]));
  return days.map((date) => ({
    date,
    global: globalByDay.get(date) ?? 0,
    mine: mineByDay.get(date) ?? 0,
  }));
}

function metric(input: {
  id: string;
  label: string;
  unit: AnalyticsMetric["unit"];
  source: AnalyticsMetricSource;
  globalValue: number;
  mineValue: number;
  globalPrevValue: number | null;
  minePrevValue: number | null;
}): AnalyticsMetric {
  return {
    id: input.id,
    label: input.label,
    unit: input.unit,
    source: input.source,
    global: {
      value: round2(input.globalValue),
      prevValue:
        typeof input.globalPrevValue === "number" ? round2(input.globalPrevValue) : null,
    },
    mine: {
      value: round2(input.mineValue),
      prevValue: typeof input.minePrevValue === "number" ? round2(input.minePrevValue) : null,
    },
  };
}

function breakdown(
  id: string,
  label: string,
  value: number,
  source: AnalyticsMetricSource = "real",
): AnalyticsBreakdownItem {
  return {
    id,
    label,
    value: round2(value),
    source,
  };
}

function ranked(
  id: string,
  label: string,
  value: number,
  source: AnalyticsMetricSource = "real",
  subLabel?: string | null,
): AnalyticsRankedItem {
  return {
    id,
    label,
    value: round2(value),
    source,
    subLabel: subLabel ?? null,
  };
}

function derivedMetricToSource(
  dataSourceType: "real" | "inferred" | "mock",
): AnalyticsMetricSource {
  if (dataSourceType === "real") return "real";
  if (dataSourceType === "mock") return "mock";
  return "mixed";
}

async function countRuns(window: TimeWindow): Promise<number> {
  const db = dbClient();
  const rows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(searchRuns)
    .where(and(gte(searchRuns.createdAt, window.start), lt(searchRuns.createdAt, window.end)));
  return toNumber(rows[0]?.value);
}

async function countRunsForScope(window: TimeWindow, sessionScopeIds: string[]): Promise<number> {
  if (sessionScopeIds.length === 0) return 0;
  const db = dbClient();
  const rows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(searchRuns)
    .where(
      and(
        gte(searchRuns.createdAt, window.start),
        lt(searchRuns.createdAt, window.end),
        inArray(searchRuns.userSessionId, sessionScopeIds),
      ),
    );
  return toNumber(rows[0]?.value);
}

async function countShownEvents(window: TimeWindow): Promise<number> {
  const db = dbClient();
  const rows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(leadEvents)
    .where(
      and(
        eq(leadEvents.eventType, SHOWN_EVENT),
        gte(leadEvents.createdAt, window.start),
        lt(leadEvents.createdAt, window.end),
      ),
    );
  return toNumber(rows[0]?.value);
}

async function countShownEventsForScope(window: TimeWindow, sessionScopeIds: string[]): Promise<number> {
  if (sessionScopeIds.length === 0) return 0;
  const db = dbClient();
  const rows = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(leadEvents)
    .where(
      and(
        eq(leadEvents.eventType, SHOWN_EVENT),
        gte(leadEvents.createdAt, window.start),
        lt(leadEvents.createdAt, window.end),
        inArray(leadEvents.userSessionId, sessionScopeIds),
      ),
    );
  return toNumber(rows[0]?.value);
}

async function countActiveSessions(window: TimeWindow): Promise<number> {
  const db = dbClient();
  const rows = await db
    .select({ value: sql<number>`count(distinct ${searchRuns.userSessionId})::int` })
    .from(searchRuns)
    .where(and(gte(searchRuns.createdAt, window.start), lt(searchRuns.createdAt, window.end)));
  return toNumber(rows[0]?.value);
}

async function countActiveSessionsForScope(window: TimeWindow, sessionScopeIds: string[]): Promise<number> {
  if (sessionScopeIds.length === 0) return 0;
  const db = dbClient();
  const rows = await db
    .select({ value: sql<number>`count(distinct ${searchRuns.userSessionId})::int` })
    .from(searchRuns)
    .where(
      and(
        gte(searchRuns.createdAt, window.start),
        lt(searchRuns.createdAt, window.end),
        inArray(searchRuns.userSessionId, sessionScopeIds),
      ),
    );
  return toNumber(rows[0]?.value);
}

async function avgRunDurationMs(window: TimeWindow): Promise<number> {
  const db = dbClient();
  const rows = await db
    .select({
      value:
        sql<number>`coalesce(avg(extract(epoch from (${searchRuns.updatedAt} - ${searchRuns.createdAt})) * 1000), 0)::float8`,
    })
    .from(searchRuns)
    .where(and(gte(searchRuns.createdAt, window.start), lt(searchRuns.createdAt, window.end)));
  return toNumber(rows[0]?.value);
}

async function avgRunDurationMsForScope(window: TimeWindow, sessionScopeIds: string[]): Promise<number> {
  if (sessionScopeIds.length === 0) return 0;
  const db = dbClient();
  const rows = await db
    .select({
      value:
        sql<number>`coalesce(avg(extract(epoch from (${searchRuns.updatedAt} - ${searchRuns.createdAt})) * 1000), 0)::float8`,
    })
    .from(searchRuns)
    .where(
      and(
        gte(searchRuns.createdAt, window.start),
        lt(searchRuns.createdAt, window.end),
        inArray(searchRuns.userSessionId, sessionScopeIds),
      ),
    );
  return toNumber(rows[0]?.value);
}

async function medianIterations(window: TimeWindow): Promise<number> {
  const db = dbClient();
  const rows = await db
    .select({
      value:
        sql<number>`coalesce(percentile_cont(0.5) within group (order by ${searchRuns.iterationCount}), 0)::float8`,
    })
    .from(searchRuns)
    .where(and(gte(searchRuns.createdAt, window.start), lt(searchRuns.createdAt, window.end)));
  return toNumber(rows[0]?.value);
}

async function medianIterationsForScope(window: TimeWindow, sessionScopeIds: string[]): Promise<number> {
  if (sessionScopeIds.length === 0) return 0;
  const db = dbClient();
  const rows = await db
    .select({
      value:
        sql<number>`coalesce(percentile_cont(0.5) within group (order by ${searchRuns.iterationCount}), 0)::float8`,
    })
    .from(searchRuns)
    .where(
      and(
        gte(searchRuns.createdAt, window.start),
        lt(searchRuns.createdAt, window.end),
        inArray(searchRuns.userSessionId, sessionScopeIds),
      ),
    );
  return toNumber(rows[0]?.value);
}

async function sourceMix(window: TimeWindow, sessionScopeIds?: string[]): Promise<Record<string, number>> {
  const db = dbClient();
  const badgeExpr = sql<string>`coalesce(${leadEvents.metadataJson}->>'sourceBadge', 'fresh')`;
  const baseCondition = and(
    eq(leadEvents.eventType, SHOWN_EVENT),
    gte(leadEvents.createdAt, window.start),
    lt(leadEvents.createdAt, window.end),
  );
  const whereCondition =
    sessionScopeIds && sessionScopeIds.length > 0
      ? and(baseCondition, inArray(leadEvents.userSessionId, sessionScopeIds))
      : baseCondition;
  const rows = await db
    .select({
      badge: badgeExpr,
      value: sql<number>`count(*)::int`,
    })
    .from(leadEvents)
    .where(whereCondition)
    .groupBy(badgeExpr);
  const result: Record<string, number> = {
    retrieved: 0,
    fresh: 0,
    both: 0,
  };
  for (const row of rows) {
    const key = typeof row.badge === "string" ? row.badge : "fresh";
    result[key] = (result[key] ?? 0) + toNumber(row.value);
  }
  return result;
}

async function runsTrend(window: TimeWindow, sessionScopeIds?: string[]): Promise<TimedCountRow[]> {
  const db = dbClient();
  const dayExpr = sql<string>`to_char(date_trunc('day', ${searchRuns.createdAt}), 'YYYY-MM-DD')`;
  const baseCondition = and(gte(searchRuns.createdAt, window.start), lt(searchRuns.createdAt, window.end));
  const whereCondition =
    sessionScopeIds && sessionScopeIds.length > 0
      ? and(baseCondition, inArray(searchRuns.userSessionId, sessionScopeIds))
      : baseCondition;
  const rows = await db
    .select({
      date: dayExpr,
      value: sql<number>`count(*)::int`,
    })
    .from(searchRuns)
    .where(whereCondition)
    .groupBy(dayExpr)
    .orderBy(dayExpr);

  return rows.map((row) => ({
    date: typeof row.date === "string" ? row.date : "",
    value: toNumber(row.value),
  }));
}

async function queryVolumeTrend(window: TimeWindow, sessionScopeIds?: string[]): Promise<TimedCountRow[]> {
  const db = dbClient();
  const dayExpr = sql<string>`to_char(date_trunc('day', ${generatedQueries.createdAt}), 'YYYY-MM-DD')`;
  const baseCondition = and(
    gte(generatedQueries.createdAt, window.start),
    lt(generatedQueries.createdAt, window.end),
  );

  const rows =
    sessionScopeIds && sessionScopeIds.length > 0
      ? await db
          .select({
            date: dayExpr,
            value: sql<number>`count(*)::int`,
          })
          .from(generatedQueries)
          .innerJoin(searchRuns, eq(searchRuns.id, generatedQueries.searchRunId))
          .where(and(baseCondition, inArray(searchRuns.userSessionId, sessionScopeIds)))
          .groupBy(dayExpr)
          .orderBy(dayExpr)
      : await db
          .select({
            date: dayExpr,
            value: sql<number>`count(*)::int`,
          })
          .from(generatedQueries)
          .where(baseCondition)
          .groupBy(dayExpr)
          .orderBy(dayExpr);

  return rows.map((row) => ({
    date: typeof row.date === "string" ? row.date : "",
    value: toNumber(row.value),
  }));
}

async function repeatSessionRate(window: TimeWindow, sessionScopeIds?: string[]): Promise<number> {
  const db = dbClient();
  const baseCondition = and(gte(searchRuns.createdAt, window.start), lt(searchRuns.createdAt, window.end));
  const whereCondition =
    sessionScopeIds && sessionScopeIds.length > 0
      ? and(baseCondition, inArray(searchRuns.userSessionId, sessionScopeIds))
      : baseCondition;
  const rows = await db
    .select({
      userSessionId: searchRuns.userSessionId,
      runs: sql<number>`count(*)::int`,
    })
    .from(searchRuns)
    .where(whereCondition)
    .groupBy(searchRuns.userSessionId);
  const total = rows.length;
  const repeat = rows.filter((row) => toNumber(row.runs) > 1).length;
  return toPercent(repeat, total);
}

async function topRoleLocationCombos(window: TimeWindow): Promise<AnalyticsRankedItem[]> {
  const db = dbClient();
  const rows = await db
    .select({
      role: searchRuns.role,
      location: searchRuns.location,
      value: sql<number>`count(*)::int`,
    })
    .from(searchRuns)
    .where(and(gte(searchRuns.createdAt, window.start), lt(searchRuns.createdAt, window.end)))
    .groupBy(searchRuns.role, searchRuns.location)
    .orderBy(sql`count(*) desc`)
    .limit(5);

  return rows.map((row, index) =>
    ranked(
      `role_location_${index}`,
      `${row.role} · ${row.location}`,
      toNumber(row.value),
      "real",
      null,
    ),
  );
}

async function engagementBreakdown(window: TimeWindow): Promise<AnalyticsBreakdownItem[]> {
  const db = dbClient();
  const rows = await db
    .select({
      eventType: leadEvents.eventType,
      value: sql<number>`count(*)::int`,
    })
    .from(leadEvents)
    .where(
      and(
        gte(leadEvents.createdAt, window.start),
        lt(leadEvents.createdAt, window.end),
        inArray(leadEvents.eventType, TRACKED_ENGAGEMENT_EVENTS as unknown as string[]),
      ),
    )
    .groupBy(leadEvents.eventType);

  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.eventType, toNumber(row.value));
  }
  const grandTotal = Array.from(totals.values()).reduce((sum, count) => sum + count, 0);

  return TRACKED_ENGAGEMENT_EVENTS.map((eventType) =>
    breakdown(
      `engagement_${eventType}`,
      eventType.replace("_", " "),
      toPercent(totals.get(eventType) ?? 0, grandTotal),
      "real",
    ),
  );
}

async function scoreCoverage(window: TimeWindow, sessionScopeIds?: string[]): Promise<number> {
  const db = dbClient();
  const baseCondition = and(
    eq(leadEvents.eventType, SHOWN_EVENT),
    gte(leadEvents.createdAt, window.start),
    lt(leadEvents.createdAt, window.end),
  );
  const whereCondition =
    sessionScopeIds && sessionScopeIds.length > 0
      ? and(baseCondition, inArray(leadEvents.userSessionId, sessionScopeIds))
      : baseCondition;

  const rows = await db
    .select({
      total: sql<number>`count(*)::int`,
      withScore:
        sql<number>`sum(case when (${leadEvents.metadataJson} ? 'score') or (${leadEvents.metadataJson}->'scoreBreakdown' ? 'finalScore100') then 1 else 0 end)::int`,
    })
    .from(leadEvents)
    .where(whereCondition);

  const total = toNumber(rows[0]?.total);
  const withScore = toNumber(rows[0]?.withScore);
  return toPercent(withScore, total);
}

async function qualityBadgeDistribution(window: TimeWindow): Promise<AnalyticsBreakdownItem[]> {
  const db = dbClient();
  const badgeExpr = sql<string>`coalesce(${leadEvents.metadataJson}->>'qualityBadge', 'unscored')`;
  const rows = await db
    .select({
      badge: badgeExpr,
      value: sql<number>`count(*)::int`,
    })
    .from(leadEvents)
    .where(
      and(
        eq(leadEvents.eventType, SHOWN_EVENT),
        gte(leadEvents.createdAt, window.start),
        lt(leadEvents.createdAt, window.end),
      ),
    )
    .groupBy(badgeExpr);

  const total = rows.reduce((sum, row) => sum + toNumber(row.value), 0);
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = typeof row.badge === "string" ? row.badge : "unscored";
    map.set(key, toNumber(row.value));
  }
  return ["high", "medium", "low", "unscored"].map((badgeValue) =>
    breakdown(
      `quality_${badgeValue}`,
      badgeValue,
      toPercent(map.get(badgeValue) ?? 0, total),
      "real",
    ),
  );
}

async function fieldCompleteness(window: TimeWindow): Promise<AnalyticsBreakdownItem[]> {
  const db = dbClient();
  const rows = await db
    .select({
      total: sql<number>`count(*)::int`,
      withCompany: sql<number>`sum(case when coalesce(${leads.company}, '') <> '' then 1 else 0 end)::int`,
      withLocation: sql<number>`sum(case when coalesce(${leads.location}, '') <> '' then 1 else 0 end)::int`,
      withWorkMode: sql<number>`sum(case when coalesce(${leads.workMode}, '') <> '' then 1 else 0 end)::int`,
    })
    .from(leadEvents)
    .innerJoin(leads, eq(leads.id, leadEvents.leadId))
    .where(
      and(
        eq(leadEvents.eventType, SHOWN_EVENT),
        gte(leadEvents.createdAt, window.start),
        lt(leadEvents.createdAt, window.end),
      ),
    );

  const total = toNumber(rows[0]?.total);
  const withCompany = toNumber(rows[0]?.withCompany);
  const withLocation = toNumber(rows[0]?.withLocation);
  const withWorkMode = toNumber(rows[0]?.withWorkMode);
  return [
    breakdown("complete_company", "Company", toPercent(withCompany, total), "real"),
    breakdown("complete_location", "Location", toPercent(withLocation, total), "real"),
    breakdown("complete_work_mode", "Work mode", toPercent(withWorkMode, total), "real"),
  ];
}

async function plannerModeDistribution(window: TimeWindow): Promise<AnalyticsBreakdownItem[]> {
  const db = dbClient();
  const rows = await db
    .select({
      mode: plannerRuns.plannerMode,
      value: sql<number>`count(*)::int`,
    })
    .from(plannerRuns)
    .innerJoin(searchRuns, eq(searchRuns.id, plannerRuns.searchRunId))
    .where(and(gte(searchRuns.createdAt, window.start), lt(searchRuns.createdAt, window.end)))
    .groupBy(plannerRuns.plannerMode);
  const total = rows.reduce((sum, row) => sum + toNumber(row.value), 0);
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.mode, toNumber(row.value));
  }
  return [
    breakdown("planner_full_explore", "Full explore", toPercent(map.get("full_explore") ?? 0, total), "real"),
    breakdown("planner_explore_heavy", "Explore heavy", toPercent(map.get("explore_heavy") ?? 0, total), "real"),
    breakdown("planner_exploit_heavy", "Exploit heavy", toPercent(map.get("exploit_heavy") ?? 0, total), "real"),
  ];
}

async function stopReasonDistribution(window: TimeWindow): Promise<AnalyticsBreakdownItem[]> {
  const db = dbClient();
  const rows = await db
    .select({
      reason: searchRuns.finalStopReason,
      value: sql<number>`count(*)::int`,
    })
    .from(searchRuns)
    .where(and(gte(searchRuns.createdAt, window.start), lt(searchRuns.createdAt, window.end)))
    .groupBy(searchRuns.finalStopReason);
  const total = rows.reduce((sum, row) => sum + toNumber(row.value), 0);
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.reason ?? "unknown", toNumber(row.value));
  }
  return [
    breakdown(
      "stop_sufficient_high_quality_leads",
      "Sufficient high quality leads",
      toPercent(map.get("sufficient_high_quality_leads") ?? 0, total),
      "real",
    ),
    breakdown(
      "stop_max_iterations",
      "Max iterations",
      toPercent(map.get("max_iterations") ?? 0, total),
      "real",
    ),
    breakdown("stop_unknown", "Unknown", toPercent(map.get("unknown") ?? 0, total), "real"),
  ];
}

async function queryStrategyMix(window: TimeWindow): Promise<AnalyticsBreakdownItem[]> {
  const db = dbClient();
  const rows = await db
    .select({
      isExplore: generatedQueries.isExplore,
      value: sql<number>`count(*)::int`,
    })
    .from(generatedQueries)
    .where(and(gte(generatedQueries.createdAt, window.start), lt(generatedQueries.createdAt, window.end)))
    .groupBy(generatedQueries.isExplore);
  const total = rows.reduce((sum, row) => sum + toNumber(row.value), 0);
  const exploreCount = rows.find((row) => row.isExplore)?.value;
  const exploitCount = rows.find((row) => !row.isExplore)?.value;
  return [
    breakdown("query_explore", "Explore queries", toPercent(toNumber(exploreCount), total), "real"),
    breakdown("query_exploit", "Exploit queries", toPercent(toNumber(exploitCount), total), "real"),
  ];
}

async function runDurationBuckets(window: TimeWindow): Promise<AnalyticsBreakdownItem[]> {
  const db = dbClient();
  const rows = await db
    .select({
      under20s:
        sql<number>`sum(case when extract(epoch from (${searchRuns.updatedAt} - ${searchRuns.createdAt})) < 20 then 1 else 0 end)::int`,
      sec20to60:
        sql<number>`sum(case when extract(epoch from (${searchRuns.updatedAt} - ${searchRuns.createdAt})) >= 20 and extract(epoch from (${searchRuns.updatedAt} - ${searchRuns.createdAt})) < 60 then 1 else 0 end)::int`,
      sec60to120:
        sql<number>`sum(case when extract(epoch from (${searchRuns.updatedAt} - ${searchRuns.createdAt})) >= 60 and extract(epoch from (${searchRuns.updatedAt} - ${searchRuns.createdAt})) < 120 then 1 else 0 end)::int`,
      over120:
        sql<number>`sum(case when extract(epoch from (${searchRuns.updatedAt} - ${searchRuns.createdAt})) >= 120 then 1 else 0 end)::int`,
    })
    .from(searchRuns)
    .where(and(gte(searchRuns.createdAt, window.start), lt(searchRuns.createdAt, window.end)));
  const under20s = toNumber(rows[0]?.under20s);
  const sec20to60 = toNumber(rows[0]?.sec20to60);
  const sec60to120 = toNumber(rows[0]?.sec60to120);
  const over120 = toNumber(rows[0]?.over120);
  const total = under20s + sec20to60 + sec60to120 + over120;
  return [
    breakdown("duration_under_20s", "<20s", toPercent(under20s, total), "real"),
    breakdown("duration_20_to_60s", "20-60s", toPercent(sec20to60, total), "real"),
    breakdown("duration_60_to_120s", "60-120s", toPercent(sec60to120, total), "real"),
    breakdown("duration_over_120s", ">120s", toPercent(over120, total), "real"),
  ];
}

export async function getAnalyticsSnapshot(input: {
  sessionScopeIds: string[];
  range: AnalyticsRange;
}): Promise<AnalyticsResponse> {
  const now = new Date();
  const rangeDays = RANGE_DAYS[input.range] ?? 30;
  const currentWindow: TimeWindow = {
    start: new Date(now.getTime() - rangeDays * 24 * 60 * 60 * 1000),
    end: now,
  };
  const previousWindow: TimeWindow = {
    start: new Date(currentWindow.start.getTime() - rangeDays * 24 * 60 * 60 * 1000),
    end: currentWindow.start,
  };
  const derivedFromMockEntities = deriveDashboardMetrics(
    getMockAnalyticsEntityDataset(input.range),
  );

  const days = buildDayKeys(currentWindow);

  const [
    totalRunsGlobal,
    totalRunsMine,
    totalRunsGlobalPrev,
    totalRunsMinePrev,
    shownGlobal,
    shownMine,
    shownGlobalPrev,
    shownMinePrev,
    activeSessionsGlobal,
    activeSessionsMine,
    activeSessionsGlobalPrev,
    activeSessionsMinePrev,
    avgRunDurationGlobalMs,
    avgRunDurationMineMs,
    avgRunDurationGlobalMsPrev,
    avgRunDurationMineMsPrev,
    medianIterationsGlobal,
    medianIterationsMine,
    medianIterationsGlobalPrev,
    medianIterationsMinePrev,
    sourceMixGlobal,
    sourceMixMine,
    runTrendGlobalRows,
    runTrendMineRows,
    topCombos,
    engagementRatesGlobal,
    scoreCoverageGlobal,
    scoreCoverageMine,
    scoreCoverageGlobalPrev,
    scoreCoverageMinePrev,
    qualityDistributionGlobal,
    completenessGlobal,
    plannerModes,
    stopReasons,
    queryMix,
    runDurationSplit,
    queryVolumeGlobalRows,
    queryVolumeMineRows,
  ] = await Promise.all([
    countRuns(currentWindow),
    countRunsForScope(currentWindow, input.sessionScopeIds),
    countRuns(previousWindow),
    countRunsForScope(previousWindow, input.sessionScopeIds),
    countShownEvents(currentWindow),
    countShownEventsForScope(currentWindow, input.sessionScopeIds),
    countShownEvents(previousWindow),
    countShownEventsForScope(previousWindow, input.sessionScopeIds),
    countActiveSessions(currentWindow),
    countActiveSessionsForScope(currentWindow, input.sessionScopeIds),
    countActiveSessions(previousWindow),
    countActiveSessionsForScope(previousWindow, input.sessionScopeIds),
    avgRunDurationMs(currentWindow),
    avgRunDurationMsForScope(currentWindow, input.sessionScopeIds),
    avgRunDurationMs(previousWindow),
    avgRunDurationMsForScope(previousWindow, input.sessionScopeIds),
    medianIterations(currentWindow),
    medianIterationsForScope(currentWindow, input.sessionScopeIds),
    medianIterations(previousWindow),
    medianIterationsForScope(previousWindow, input.sessionScopeIds),
    sourceMix(currentWindow),
    sourceMix(currentWindow, input.sessionScopeIds),
    runsTrend(currentWindow),
    input.sessionScopeIds.length > 0 ? runsTrend(currentWindow, input.sessionScopeIds) : Promise.resolve([]),
    topRoleLocationCombos(currentWindow),
    engagementBreakdown(currentWindow),
    scoreCoverage(currentWindow),
    scoreCoverage(currentWindow, input.sessionScopeIds),
    scoreCoverage(previousWindow),
    scoreCoverage(previousWindow, input.sessionScopeIds),
    qualityBadgeDistribution(currentWindow),
    fieldCompleteness(currentWindow),
    plannerModeDistribution(currentWindow),
    stopReasonDistribution(currentWindow),
    queryStrategyMix(currentWindow),
    runDurationBuckets(currentWindow),
    queryVolumeTrend(currentWindow),
    input.sessionScopeIds.length > 0
      ? queryVolumeTrend(currentWindow, input.sessionScopeIds)
      : Promise.resolve([]),
  ]);

  const sourceMixTotalGlobal =
    (sourceMixGlobal.retrieved ?? 0) + (sourceMixGlobal.fresh ?? 0) + (sourceMixGlobal.both ?? 0);
  const sourceMixTotalMine =
    (sourceMixMine.retrieved ?? 0) + (sourceMixMine.fresh ?? 0) + (sourceMixMine.both ?? 0);

  const overviewMetrics: AnalyticsMetric[] = [
    metric({
      id: "overview_total_runs",
      label: "Total runs",
      unit: "count",
      source: "real",
      globalValue: totalRunsGlobal,
      mineValue: totalRunsMine,
      globalPrevValue: totalRunsGlobalPrev,
      minePrevValue: totalRunsMinePrev,
    }),
    metric({
      id: "overview_leads_shown",
      label: "Leads shown",
      unit: "count",
      source: "real",
      globalValue: shownGlobal,
      mineValue: shownMine,
      globalPrevValue: shownGlobalPrev,
      minePrevValue: shownMinePrev,
    }),
    metric({
      id: "overview_active_users",
      label: "Active users",
      unit: "count",
      source: "real",
      globalValue: activeSessionsGlobal,
      mineValue: activeSessionsMine,
      globalPrevValue: activeSessionsGlobalPrev,
      minePrevValue: activeSessionsMinePrev,
    }),
    metric({
      id: "overview_avg_run_ms",
      label: "Avg run duration",
      unit: "ms",
      source: "real",
      globalValue: avgRunDurationGlobalMs,
      mineValue: avgRunDurationMineMs,
      globalPrevValue: avgRunDurationGlobalMsPrev,
      minePrevValue: avgRunDurationMineMsPrev,
    }),
    metric({
      id: "overview_median_iterations",
      label: "Median iterations",
      unit: "count",
      source: "real",
      globalValue: medianIterationsGlobal,
      mineValue: medianIterationsMine,
      globalPrevValue: medianIterationsGlobalPrev,
      minePrevValue: medianIterationsMinePrev,
    }),
    metric({
      id: "overview_fresh_share",
      label: "Fresh mix share",
      unit: "percent",
      source: "real",
      globalValue: toPercent(
        (sourceMixGlobal.fresh ?? 0) + (sourceMixGlobal.both ?? 0),
        sourceMixTotalGlobal,
      ),
      mineValue: toPercent((sourceMixMine.fresh ?? 0) + (sourceMixMine.both ?? 0), sourceMixTotalMine),
      globalPrevValue: null,
      minePrevValue: null,
    }),
    metric({
      id: "overview_zero_result_search_rate",
      label: "Zero-result search rate",
      unit: "percent",
      source: derivedMetricToSource(
        derivedFromMockEntities.zero_result_search_rate?.dataSourceType ?? "inferred",
      ),
      globalValue: derivedFromMockEntities.zero_result_search_rate?.value ?? 0,
      mineValue: derivedFromMockEntities.zero_result_search_rate?.value ?? 0,
      globalPrevValue: null,
      minePrevValue: null,
    }),
    metric({
      id: "overview_hq_posts_per_run",
      label: "High-quality posts per run",
      unit: "ratio",
      source: derivedMetricToSource(
        derivedFromMockEntities.hq_posts_per_run?.dataSourceType ?? "inferred",
      ),
      globalValue: derivedFromMockEntities.hq_posts_per_run?.value ?? 0,
      mineValue: derivedFromMockEntities.hq_posts_per_run?.value ?? 0,
      globalPrevValue: null,
      minePrevValue: null,
    }),
    metric({
      id: "overview_actionable_posts_per_run",
      label: "Actionable posts per run",
      unit: "ratio",
      source: derivedMetricToSource(
        derivedFromMockEntities.actionable_posts_per_run?.dataSourceType ?? "inferred",
      ),
      globalValue: derivedFromMockEntities.actionable_posts_per_run?.value ?? 0,
      mineValue: derivedFromMockEntities.actionable_posts_per_run?.value ?? 0,
      globalPrevValue: null,
      minePrevValue: null,
    }),
  ];

  const runTrend = fillTimeSeries(days, runTrendGlobalRows, runTrendMineRows);
  const queryVolumeTrendRows = fillTimeSeries(days, queryVolumeGlobalRows, queryVolumeMineRows);

  const sourceMixBreakdown: AnalyticsBreakdownItem[] = [
    breakdown("source_retrieved", "Retrieved", toPercent(sourceMixGlobal.retrieved ?? 0, sourceMixTotalGlobal), "real"),
    breakdown("source_fresh", "Fresh", toPercent(sourceMixGlobal.fresh ?? 0, sourceMixTotalGlobal), "real"),
    breakdown("source_both", "Both", toPercent(sourceMixGlobal.both ?? 0, sourceMixTotalGlobal), "real"),
  ];

  const productUserMetrics: AnalyticsMetric[] = [
    metric({
      id: "demand_searches_per_user",
      label: "Searches per active user",
      unit: "ratio",
      source: derivedMetricToSource(
        derivedFromMockEntities.searches_per_user?.dataSourceType ?? "real",
      ),
      globalValue: derivedFromMockEntities.searches_per_user?.value ?? 0,
      mineValue: derivedFromMockEntities.searches_per_user?.value ?? 0,
      globalPrevValue: null,
      minePrevValue: null,
    }),
    metric({
      id: "product_repeat_user_rate",
      label: "Repeat user rate",
      unit: "percent",
      source: "real",
      globalValue: await repeatSessionRate(currentWindow),
      mineValue: await repeatSessionRate(currentWindow, input.sessionScopeIds),
      globalPrevValue: await repeatSessionRate(previousWindow),
      minePrevValue: await repeatSessionRate(previousWindow, input.sessionScopeIds),
    }),
    metric({
      id: "product_run_frequency",
      label: "Runs per active user",
      unit: "ratio",
      source: "real",
      globalValue: activeSessionsGlobal > 0 ? totalRunsGlobal / activeSessionsGlobal : 0,
      mineValue: activeSessionsMine > 0 ? totalRunsMine / activeSessionsMine : 0,
      globalPrevValue:
        activeSessionsGlobalPrev > 0 ? totalRunsGlobalPrev / activeSessionsGlobalPrev : 0,
      minePrevValue: activeSessionsMinePrev > 0 ? totalRunsMinePrev / activeSessionsMinePrev : 0,
    }),
    metric({
      id: "product_engagement_events",
      label: "Tracked engagement events",
      unit: "count",
      source: "real",
      globalValue: engagementRatesGlobal.reduce((sum, item) => sum + item.value, 0),
      mineValue: 0,
      globalPrevValue: null,
      minePrevValue: null,
    }),
    metric({
      id: "product_posts_opened_per_run",
      label: "Posts opened per run",
      unit: "ratio",
      source: derivedMetricToSource(
        derivedFromMockEntities.posts_opened_per_run?.dataSourceType ?? "real",
      ),
      globalValue: derivedFromMockEntities.posts_opened_per_run?.value ?? 0,
      mineValue: derivedFromMockEntities.posts_opened_per_run?.value ?? 0,
      globalPrevValue: null,
      minePrevValue: null,
    }),
    metric({
      id: "product_message_generation_rate",
      label: "Message generation rate",
      unit: "percent",
      source: derivedMetricToSource(
        derivedFromMockEntities.message_generation_rate?.dataSourceType ?? "real",
      ),
      globalValue: derivedFromMockEntities.message_generation_rate?.value ?? 0,
      mineValue: derivedFromMockEntities.message_generation_rate?.value ?? 0,
      globalPrevValue: null,
      minePrevValue: null,
    }),
  ];

  const feedQualityMetrics: AnalyticsMetric[] = [
    metric({
      id: "feed_score_coverage",
      label: "Score coverage",
      unit: "percent",
      source: "real",
      globalValue: scoreCoverageGlobal,
      mineValue: scoreCoverageMine,
      globalPrevValue: scoreCoverageGlobalPrev,
      minePrevValue: scoreCoverageMinePrev,
    }),
    metric({
      id: "feed_unscored_share",
      label: "Unscored share",
      unit: "percent",
      source: "real",
      globalValue: 100 - scoreCoverageGlobal,
      mineValue: 100 - scoreCoverageMine,
      globalPrevValue: scoreCoverageGlobalPrev === null ? null : 100 - scoreCoverageGlobalPrev,
      minePrevValue: scoreCoverageMinePrev === null ? null : 100 - scoreCoverageMinePrev,
    }),
    metric({
      id: "feed_complete_company",
      label: "Company completeness",
      unit: "percent",
      source: "real",
      globalValue: completenessGlobal.find((item) => item.id === "complete_company")?.value ?? 0,
      mineValue: 0,
      globalPrevValue: null,
      minePrevValue: null,
    }),
  ];

  const totalQueriesGlobal = queryVolumeGlobalRows.reduce((sum, row) => sum + row.value, 0);
  const totalQueriesMine = queryVolumeMineRows.reduce((sum, row) => sum + row.value, 0);
  const agentSystemMetrics: AnalyticsMetric[] = [
    metric({
      id: "agent_query_volume",
      label: "Queries generated",
      unit: "count",
      source: "real",
      globalValue: totalQueriesGlobal,
      mineValue: totalQueriesMine,
      globalPrevValue: null,
      minePrevValue: null,
    }),
    metric({
      id: "agent_explore_mix",
      label: "Explore query share",
      unit: "percent",
      source: "real",
      globalValue: queryMix.find((item) => item.id === "query_explore")?.value ?? 0,
      mineValue: 0,
      globalPrevValue: null,
      minePrevValue: null,
    }),
    metric({
      id: "system_fast_runs_under_20s",
      label: "Runs under 20s",
      unit: "percent",
      source: "real",
      globalValue: runDurationSplit.find((item) => item.id === "duration_under_20s")?.value ?? 0,
      mineValue: 0,
      globalPrevValue: null,
      minePrevValue: null,
    }),
    metric({
      id: "pipeline_results_per_query",
      label: "Results per query",
      unit: "ratio",
      source: derivedMetricToSource(
        derivedFromMockEntities.results_per_query?.dataSourceType ?? "inferred",
      ),
      globalValue: derivedFromMockEntities.results_per_query?.value ?? 0,
      mineValue: derivedFromMockEntities.results_per_query?.value ?? 0,
      globalPrevValue: null,
      minePrevValue: null,
    }),
    metric({
      id: "pipeline_extraction_success_rate",
      label: "Extraction success rate",
      unit: "percent",
      source: derivedMetricToSource(
        derivedFromMockEntities.extraction_success_rate?.dataSourceType ?? "inferred",
      ),
      globalValue: derivedFromMockEntities.extraction_success_rate?.value ?? 0,
      mineValue: derivedFromMockEntities.extraction_success_rate?.value ?? 0,
      globalPrevValue: null,
      minePrevValue: null,
    }),
    metric({
      id: "pipeline_scoring_success_rate",
      label: "Scoring success rate",
      unit: "percent",
      source: derivedMetricToSource(
        derivedFromMockEntities.scoring_success_rate?.dataSourceType ?? "inferred",
      ),
      globalValue: derivedFromMockEntities.scoring_success_rate?.value ?? 0,
      mineValue: derivedFromMockEntities.scoring_success_rate?.value ?? 0,
      globalPrevValue: null,
      minePrevValue: null,
    }),
    metric({
      id: "reliability_time_to_first_actionable_post",
      label: "Time to first actionable post",
      unit: "ms",
      source: derivedMetricToSource(
        derivedFromMockEntities.time_to_first_actionable_post?.dataSourceType ?? "inferred",
      ),
      globalValue: derivedFromMockEntities.time_to_first_actionable_post?.value ?? 0,
      mineValue: derivedFromMockEntities.time_to_first_actionable_post?.value ?? 0,
      globalPrevValue: null,
      minePrevValue: null,
    }),
    metric({
      id: "reliability_cost_per_hq_post",
      label: "Cost per HQ post",
      unit: "ratio",
      source: derivedMetricToSource(
        derivedFromMockEntities.cost_per_hq_post?.dataSourceType ?? "inferred",
      ),
      globalValue: derivedFromMockEntities.cost_per_hq_post?.value ?? 0,
      mineValue: derivedFromMockEntities.cost_per_hq_post?.value ?? 0,
      globalPrevValue: null,
      minePrevValue: null,
    }),
    ...getMockSystemMetrics(input.range),
  ];

  const experiments = getMockExperimentsSection();
  const provenance = buildAnalyticsProvenance({
    metrics: [
      ...overviewMetrics,
      ...productUserMetrics,
      ...feedQualityMetrics,
      ...agentSystemMetrics,
      ...experiments.metrics,
    ],
    mixedIds: [],
  });

  return {
    range: input.range,
    generatedAt: now.toISOString(),
    overview: {
      metrics: overviewMetrics,
      runTrend,
      sourceMix: sourceMixBreakdown,
    },
    productUser: {
      metrics: productUserMetrics,
      topRoleLocations: topCombos,
      engagementRates: engagementRatesGlobal,
    },
    feedQuality: {
      metrics: feedQualityMetrics,
      qualityBadgeDistribution: qualityDistributionGlobal,
      fieldCompleteness: completenessGlobal,
    },
    agentSystem: {
      metrics: agentSystemMetrics,
      plannerModeDistribution: plannerModes,
      stopReasonDistribution: stopReasons,
      queryStrategyMix: queryMix,
      runDurationBuckets: runDurationSplit,
      queryVolumeTrend: queryVolumeTrendRows,
      nodeLatencyMock: getMockNodeLatencyBreakdown(),
    },
    experiments,
    provenance,
  };
}
