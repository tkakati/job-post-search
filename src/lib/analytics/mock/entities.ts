import type { AnalyticsRange } from "@/lib/types/api";

export type MockSearchEntity = {
  searchId: string;
  userKey: string;
  sessionId: string;
  submittedAt: string;
  role: string;
  location: string;
  locationStrict: boolean;
  recency: "past-24h" | "past-week" | "past-month";
  employmentType: "full-time" | "part-time" | "contract" | "internship" | null;
};

export type MockRunEntity = {
  runId: number;
  searchId: string;
  startedAt: string;
  completedAt: string;
  maxIterations: number;
  iterationCount: number;
  stopReason:
    | "sufficient_high_quality_leads"
    | "max_iterations"
    | "timeout"
    | "error"
    | "unknown";
  numQueriesGenerated: number;
  numPostsRetrieved: number;
  numUniquePosts: number;
  numPostsExtracted: number;
  numPostsScored: number;
  numPostsShown: number;
  numHighQualityPosts: number;
  timeToFirstResultMs: number;
  timeToFirstActionableMs: number;
};

export type MockQueryEntity = {
  queryId: string;
  runId: number;
  iterationIndex: number;
  family: string;
  isExplore: boolean;
  retrievedCount: number;
  extractedCount: number;
  highQualityCount: number;
};

export type MockPostEntity = {
  postKey: string;
  runId: number;
  queryId: string;
  stage: "retrieved" | "deduped" | "extracted" | "scored";
  scoreBand: "high" | "medium" | "low" | "unscored";
};

export type MockShownPostEntity = {
  shownId: string;
  runId: number;
  postKey: string;
  score: number | null;
  isHighQuality: boolean;
  sourceBadge: "retrieved" | "fresh" | "both";
  shownAt: string;
};

export type MockActionEventEntity = {
  eventId: string;
  runId: number;
  postKey: string;
  eventType:
    | "opened"
    | "clicked"
    | "generate_message_clicked"
    | "status_changed"
    | "hidden"
    | "not_helpful";
  occurredAt: string;
};

export type MockStageTimingEntity = {
  runId: number;
  stage:
    | "planning"
    | "query_generation"
    | "search_retrieval"
    | "extraction"
    | "scoring"
    | "response_assembly";
  durationMs: number;
};

export type MockCostSnapshotEntity = {
  runId: number;
  queryCostUsd: number;
  extractionCostUsd: number;
  enrichmentCostUsd: number;
  totalCostUsd: number;
};

export type AnalyticsEntityDataset = {
  searches: MockSearchEntity[];
  runs: MockRunEntity[];
  queries: MockQueryEntity[];
  posts: MockPostEntity[];
  shownPosts: MockShownPostEntity[];
  actionEvents: MockActionEventEntity[];
  stageTimings: MockStageTimingEntity[];
  costSnapshots: MockCostSnapshotEntity[];
};

const ROLE_LOCATION_PAIRS: Array<{ role: string; location: string; family: string }> = [
  { role: "Product Manager", location: "Seattle", family: "Product Manager · Seattle hiring posts" },
  { role: "Product Manager", location: "Bay Area", family: "Product Manager · Bay Area hiring posts" },
  { role: "Finance Intern", location: "Bengaluru", family: "Finance Intern · Bengaluru hiring posts" },
  { role: "Staff Product Designer", location: "New York", family: "Product Design · NYC hiring posts" },
];

function rangeRunCount(range: AnalyticsRange): number {
  if (range === "7d") return 28;
  if (range === "90d") return 240;
  return 96;
}

function isoAtOffset(base: Date, offsetMinutes: number): string {
  return new Date(base.getTime() + offsetMinutes * 60 * 1000).toISOString();
}

export function getMockAnalyticsEntityDataset(
  range: AnalyticsRange,
): AnalyticsEntityDataset {
  const runCount = rangeRunCount(range);
  const base = new Date();

  const searches: MockSearchEntity[] = [];
  const runs: MockRunEntity[] = [];
  const queries: MockQueryEntity[] = [];
  const posts: MockPostEntity[] = [];
  const shownPosts: MockShownPostEntity[] = [];
  const actionEvents: MockActionEventEntity[] = [];
  const stageTimings: MockStageTimingEntity[] = [];
  const costSnapshots: MockCostSnapshotEntity[] = [];

  for (let i = 0; i < runCount; i += 1) {
    const pair = ROLE_LOCATION_PAIRS[i % ROLE_LOCATION_PAIRS.length]!;
    const searchId = `search_${i + 1}`;
    const runId = i + 1;
    const started = isoAtOffset(base, -1 * (runCount - i) * 45);
    const strict = i % 3 === 0;
    const recency = i % 4 === 0 ? "past-24h" : i % 4 === 1 ? "past-week" : "past-month";
    const employmentType = i % 5 === 0 ? "contract" : "full-time";

    const queryCount = 4 + (i % 4);
    const retrieved = 24 + (i % 9) * 3;
    const uniquePosts = Math.max(6, Math.round(retrieved * (0.65 - (i % 3) * 0.04)));
    const extracted = Math.max(4, Math.round(uniquePosts * (0.8 - (i % 4) * 0.05)));
    const scored = Math.max(3, Math.round(extracted * (0.86 - (i % 5) * 0.04)));
    const shown = Math.max(0, Math.round(scored * (0.5 - (i % 3) * 0.08)));
    const hq = Math.max(0, Math.round(shown * (0.45 - (i % 4) * 0.05)));
    const runDurationMs = 21000 + (i % 8) * 3200;
    const firstResultMs = 2600 + (i % 7) * 430;
    const firstActionableMs = shown > 0 ? firstResultMs + 2800 + (i % 6) * 390 : runDurationMs;

    const stopReason: MockRunEntity["stopReason"] =
      i % 11 === 0
        ? "timeout"
        : i % 13 === 0
          ? "error"
          : hq >= 3
            ? "sufficient_high_quality_leads"
            : "max_iterations";

    searches.push({
      searchId,
      userKey: `user_${(i % 12) + 1}`,
      sessionId: `session_${(i % 18) + 1}`,
      submittedAt: started,
      role: pair.role,
      location: pair.location,
      locationStrict: strict,
      recency,
      employmentType,
    });

    runs.push({
      runId,
      searchId,
      startedAt: started,
      completedAt: new Date(new Date(started).getTime() + runDurationMs).toISOString(),
      maxIterations: 2,
      iterationCount: 1 + (i % 2),
      stopReason,
      numQueriesGenerated: queryCount,
      numPostsRetrieved: retrieved,
      numUniquePosts: uniquePosts,
      numPostsExtracted: extracted,
      numPostsScored: scored,
      numPostsShown: shown,
      numHighQualityPosts: hq,
      timeToFirstResultMs: firstResultMs,
      timeToFirstActionableMs: firstActionableMs,
    });

    for (let q = 0; q < queryCount; q += 1) {
      const qid = `q_${runId}_${q + 1}`;
      const qRetrieved = Math.max(2, Math.round(retrieved / queryCount + ((q % 3) - 1) * 2));
      const qExtracted = Math.max(1, Math.round(qRetrieved * 0.62));
      const qHq = Math.max(0, Math.round(qExtracted * 0.18));
      queries.push({
        queryId: qid,
        runId,
        iterationIndex: q < Math.ceil(queryCount / 2) ? 0 : 1,
        family: pair.family,
        isExplore: q % 2 === 0,
        retrievedCount: qRetrieved,
        extractedCount: qExtracted,
        highQualityCount: qHq,
      });
    }

    for (let p = 0; p < shown; p += 1) {
      const postKey = `post_${runId}_${p + 1}`;
      const score = Math.min(1, 0.35 + (p % 5) * 0.14);
      const isHq = p < hq;
      const scoreBand: MockPostEntity["scoreBand"] = score >= 0.7 ? "high" : score >= 0.5 ? "medium" : "low";
      posts.push({
        postKey,
        runId,
        queryId: `q_${runId}_${(p % queryCount) + 1}`,
        stage: "scored",
        scoreBand,
      });
      shownPosts.push({
        shownId: `shown_${runId}_${p + 1}`,
        runId,
        postKey,
        score,
        isHighQuality: isHq,
        sourceBadge: p % 4 === 0 ? "retrieved" : p % 4 === 1 ? "both" : "fresh",
        shownAt: isoAtOffset(new Date(started), 4 + p),
      });
      if (p % 2 === 0) {
        actionEvents.push({
          eventId: `evt_open_${runId}_${p + 1}`,
          runId,
          postKey,
          eventType: "opened",
          occurredAt: isoAtOffset(new Date(started), 5 + p),
        });
      }
      if (p % 3 === 0) {
        actionEvents.push({
          eventId: `evt_click_${runId}_${p + 1}`,
          runId,
          postKey,
          eventType: "clicked",
          occurredAt: isoAtOffset(new Date(started), 6 + p),
        });
      }
      if (p % 5 === 0) {
        actionEvents.push({
          eventId: `evt_msg_${runId}_${p + 1}`,
          runId,
          postKey,
          eventType: "generate_message_clicked",
          occurredAt: isoAtOffset(new Date(started), 7 + p),
        });
      }
    }

    const stageBase = 30 + (i % 5) * 5;
    stageTimings.push(
      { runId, stage: "planning", durationMs: stageBase + 25 },
      { runId, stage: "query_generation", durationMs: stageBase + 60 },
      { runId, stage: "search_retrieval", durationMs: 900 + (i % 7) * 130 },
      { runId, stage: "extraction", durationMs: 1200 + (i % 8) * 160 },
      { runId, stage: "scoring", durationMs: 95 + (i % 6) * 16 },
      { runId, stage: "response_assembly", durationMs: 80 + (i % 5) * 11 },
    );

    const queryCost = queryCount * 0.038;
    const extractionCost = extracted * 0.0065;
    const enrichmentCost = extracted * 0.0028;
    costSnapshots.push({
      runId,
      queryCostUsd: Number(queryCost.toFixed(4)),
      extractionCostUsd: Number(extractionCost.toFixed(4)),
      enrichmentCostUsd: Number(enrichmentCost.toFixed(4)),
      totalCostUsd: Number((queryCost + extractionCost + enrichmentCost).toFixed(4)),
    });
  }

  return {
    searches,
    runs,
    queries,
    posts,
    shownPosts,
    actionEvents,
    stageTimings,
    costSnapshots,
  };
}

