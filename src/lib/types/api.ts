import type { LeadCardViewModel, StopReason } from "@/lib/types/contracts";

export type RunStatus = "queued" | "running" | "completed" | "failed";

export type SearchRunResult = {
  runId: number;
  status: RunStatus;
  stopReason: StopReason;
  iterationsUsed: number;
  summary: string;
  totalCounts: {
    retrieved: number;
    generated: number;
    merged: number;
    newForUser: number;
  };
  sourceBreakdown: {
    retrieved: number;
    fresh: number;
    both: number;
  };
  debug: {
    plannerMode: "full_explore" | "explore_heavy" | "exploit_heavy" | null;
    retrievalRan: boolean;
    freshSearchRan: boolean;
    numExploreQueries: number;
    iterationCount: number;
    stopReason: StopReason;
    countBreakdowns: {
      retrieved: number;
      generated: number;
      merged: number;
      newForUser: number;
    };
  };
  leads: LeadCardViewModel[];
  updatedAt: string;
};

export type SearchRunEnvelope = {
  runId: number;
  status: RunStatus;
  pollAfterMs: number | null;
  result: SearchRunResult | null;
  error?: string;
};

export type HistoryItem = {
  runId: number;
  role: string;
  location: string;
  recencyPreference: "past-24h" | "past-week" | "past-month";
  stopReason: StopReason;
  iterationCount: number;
  createdAt: string;
  updatedAt: string;
};

export type HistoryResponse = {
  items: HistoryItem[];
};

export type DebugRunInput = {
  role: string;
  location: string;
  locationIsHardFilter?: boolean;
  employmentType?: "full-time" | "part-time" | "contract" | "internship" | null;
  recencyPreference: "past-24h" | "past-week" | "past-month";
  maxIterations: number;
  targetHighQualityLeads: number;
  shownIdentityKeys?: string[];
};

export type DebugRunOutput = {
  graph: {
    nodes: string[];
    edges: Array<{
      source: string;
      target: string;
      conditional: boolean;
    }>;
  };
  sequence: Array<{
    step: number;
    node: string;
    phase: "started" | "completed";
    log: string;
  }>;
  nodeRuns: Array<{
    step: number;
    node: string;
    input: unknown;
    output: unknown;
    log: string;
  }>;
  graphMermaid: string;
  final: {
    taskComplete: boolean;
    stopReason: "sufficient_high_quality_leads" | "max_iterations" | null;
    iteration: number;
    targetHighQualityLeads: number;
    plannerMode: "full_explore" | "explore_heavy" | "exploit_heavy" | null;
    counts: {
      retrieved: number;
      generated: number;
      merged: number;
      newForUser: number;
    };
  };
  snapshots: {
    plannerOutput: unknown | null;
    retrievalResults: unknown | null;
    generatedQueries: unknown | null;
    searchResults: unknown | null;
    extractionResults: unknown | null;
    combinedResults: unknown | null;
    scoringResults: unknown | null;
    finalResponse: unknown | null;
  };
};

export type AnalyticsRange = "7d" | "30d" | "90d";
export type AnalyticsMetricSource = "real" | "mock" | "mixed";

export type AnalyticsMetric = {
  id: string;
  label: string;
  unit: "count" | "percent" | "ms" | "ratio";
  source: AnalyticsMetricSource;
  global: {
    value: number;
    prevValue: number | null;
  };
  mine: {
    value: number;
    prevValue: number | null;
  };
};

export type AnalyticsTimePoint = {
  date: string;
  global: number;
  mine: number;
};

export type AnalyticsBreakdownItem = {
  id: string;
  label: string;
  value: number;
  source: AnalyticsMetricSource;
};

export type AnalyticsRankedItem = {
  id: string;
  label: string;
  value: number;
  source: AnalyticsMetricSource;
  subLabel?: string | null;
};

export type AnalyticsResponse = {
  range: AnalyticsRange;
  generatedAt: string;
  overview: {
    metrics: AnalyticsMetric[];
    runTrend: AnalyticsTimePoint[];
    sourceMix: AnalyticsBreakdownItem[];
  };
  productUser: {
    metrics: AnalyticsMetric[];
    topRoleLocations: AnalyticsRankedItem[];
    engagementRates: AnalyticsBreakdownItem[];
  };
  feedQuality: {
    metrics: AnalyticsMetric[];
    qualityBadgeDistribution: AnalyticsBreakdownItem[];
    fieldCompleteness: AnalyticsBreakdownItem[];
  };
  agentSystem: {
    metrics: AnalyticsMetric[];
    plannerModeDistribution: AnalyticsBreakdownItem[];
    stopReasonDistribution: AnalyticsBreakdownItem[];
    queryStrategyMix: AnalyticsBreakdownItem[];
    runDurationBuckets: AnalyticsBreakdownItem[];
    queryVolumeTrend: AnalyticsTimePoint[];
    nodeLatencyMock: AnalyticsBreakdownItem[];
  };
  experiments: {
    metrics: AnalyticsMetric[];
    variants: AnalyticsBreakdownItem[];
    notes: string;
  };
  provenance: {
    real: string[];
    mock: string[];
    mixed: string[];
  };
};

export type AnalyticsEventName =
  | "search_submitted"
  | "filters_changed"
  | "run_started"
  | "iteration_completed"
  | "query_generated"
  | "retrieval_completed"
  | "extraction_completed"
  | "scoring_completed"
  | "post_viewed"
  | "external_post_clicked"
  | "generate_message_clicked"
  | "status_changed"
  | "analytics_tab_viewed"
  | "run_completed"
  | "message_generation_completed"
  | "message_generation_failed";

export type AnalyticsEventSource = "client" | "api" | "agent";

export type AnalyticsEventInput = {
  eventName: AnalyticsEventName;
  source: AnalyticsEventSource;
  occurredAt?: string;
  searchId?: string;
  runId?: number;
  iterationIndex?: number;
  queryId?: string;
  leadId?: number;
  properties?: Record<string, unknown>;
};

export type AnalyticsEventsBatchInput = {
  events: AnalyticsEventInput[];
};
