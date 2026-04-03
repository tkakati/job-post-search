import { z } from "zod";
import { LeadCardViewModelSchema } from "@/lib/schemas/lead";
import { RecencyPreferenceSchema, StopReasonSchema } from "@/lib/schemas/common";

export const StartSearchRunInputSchema = z.object({
  role: z.string().min(1).max(120),
  location: z.string().min(1).max(120),
  locationIsHardFilter: z.coerce.boolean().optional().default(false),
  employmentType: z
    .enum(["full-time", "part-time", "contract", "internship"])
    .nullable()
    .optional()
    .default(null),
  recencyPreference: RecencyPreferenceSchema,
});

export const RunStatusSchema = z.enum(["queued", "running", "completed", "failed"]);

export const SearchRunResultSchema = z.object({
  runId: z.number().int().positive(),
  status: RunStatusSchema,
  stopReason: StopReasonSchema,
  iterationsUsed: z.number().int().nonnegative(),
  summary: z.string(),
  totalCounts: z.object({
    retrieved: z.number().int().nonnegative(),
    generated: z.number().int().nonnegative(),
    merged: z.number().int().nonnegative(),
    newForUser: z.number().int().nonnegative(),
  }),
  sourceBreakdown: z.object({
    retrieved: z.number().int().nonnegative(),
    fresh: z.number().int().nonnegative(),
    both: z.number().int().nonnegative(),
  }),
  debug: z.object({
    plannerMode: z.enum(["full_explore", "explore_heavy", "exploit_heavy"]).nullable(),
    retrievalRan: z.boolean(),
    freshSearchRan: z.boolean(),
    numExploreQueries: z.number().int().nonnegative(),
    iterationCount: z.number().int().nonnegative(),
    stopReason: StopReasonSchema,
    countBreakdowns: z.object({
      retrieved: z.number().int().nonnegative(),
      generated: z.number().int().nonnegative(),
      merged: z.number().int().nonnegative(),
      newForUser: z.number().int().nonnegative(),
    }),
  }),
  leads: z.array(LeadCardViewModelSchema),
  updatedAt: z.string().datetime(),
});

export const SearchRunEnvelopeSchema = z.object({
  runId: z.number().int().positive(),
  status: RunStatusSchema,
  pollAfterMs: z.number().int().positive().nullable(),
  result: SearchRunResultSchema.nullable(),
  error: z.string().optional(),
});

export const LeadEventInputSchema = z.object({
  eventType: z.enum([
    "opened",
    "clicked",
    "helpful",
    "not_helpful",
    "hidden",
    // Backward-compatible aliases:
    "open",
    "click",
  ]),
  searchRunId: z.number().int().positive().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const LeadFeedbackInputSchema = z.object({
  useful: z.boolean(),
  score: z.number().int().min(1).max(5).optional(),
  notes: z.string().max(1000).optional(),
  searchRunId: z.number().int().positive().optional(),
});

export const HistoryQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export const HistoryItemSchema = z.object({
  runId: z.number().int().positive(),
  role: z.string().min(1),
  location: z.string().min(1),
  recencyPreference: RecencyPreferenceSchema,
  stopReason: StopReasonSchema,
  iterationCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const HistoryResponseSchema = z.object({
  items: z.array(HistoryItemSchema),
});

export const AnalyticsRangeSchema = z.enum(["7d", "30d", "90d"]);

export const AnalyticsQuerySchema = z.object({
  range: AnalyticsRangeSchema.default("30d"),
});

export const AnalyticsEventNameSchema = z.enum([
  "search_submitted",
  "filters_changed",
  "run_started",
  "iteration_completed",
  "query_generated",
  "retrieval_completed",
  "extraction_completed",
  "scoring_completed",
  "post_viewed",
  "external_post_clicked",
  "generate_message_clicked",
  "status_changed",
  "analytics_tab_viewed",
  "run_completed",
  "message_generation_completed",
  "message_generation_failed",
]);

export const AnalyticsEventSourceSchema = z.enum(["client", "api", "agent"]);

export const AnalyticsEventInputSchema = z.object({
  eventName: AnalyticsEventNameSchema,
  source: AnalyticsEventSourceSchema,
  occurredAt: z.string().datetime().optional(),
  searchId: z.string().min(1).max(120).optional(),
  runId: z.number().int().positive().optional(),
  iterationIndex: z.number().int().nonnegative().optional(),
  queryId: z.string().min(1).max(160).optional(),
  leadId: z.number().int().positive().optional(),
  properties: z.record(z.string(), z.unknown()).optional(),
});

export const AnalyticsEventsBatchInputSchema = z.object({
  events: z.array(AnalyticsEventInputSchema).min(1).max(50),
});

const AnalyticsMetricSourceSchema = z.enum(["real", "mock", "mixed"]);
const AnalyticsMetricUnitSchema = z.enum(["count", "percent", "ms", "ratio"]);

const AnalyticsMetricSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  unit: AnalyticsMetricUnitSchema,
  source: AnalyticsMetricSourceSchema,
  global: z.object({
    value: z.number(),
    prevValue: z.number().nullable(),
  }),
  mine: z.object({
    value: z.number(),
    prevValue: z.number().nullable(),
  }),
});

const AnalyticsTimePointSchema = z.object({
  date: z.string().min(1),
  global: z.number(),
  mine: z.number(),
});

const AnalyticsBreakdownItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.number(),
  source: AnalyticsMetricSourceSchema,
});

const AnalyticsRankedItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  value: z.number(),
  source: AnalyticsMetricSourceSchema,
  subLabel: z.string().nullable().optional(),
});

export const AnalyticsResponseSchema = z.object({
  range: AnalyticsRangeSchema,
  generatedAt: z.string().datetime(),
  overview: z.object({
    metrics: z.array(AnalyticsMetricSchema),
    runTrend: z.array(AnalyticsTimePointSchema),
    sourceMix: z.array(AnalyticsBreakdownItemSchema),
  }),
  productUser: z.object({
    metrics: z.array(AnalyticsMetricSchema),
    topRoleLocations: z.array(AnalyticsRankedItemSchema),
    engagementRates: z.array(AnalyticsBreakdownItemSchema),
  }),
  feedQuality: z.object({
    metrics: z.array(AnalyticsMetricSchema),
    qualityBadgeDistribution: z.array(AnalyticsBreakdownItemSchema),
    fieldCompleteness: z.array(AnalyticsBreakdownItemSchema),
  }),
  agentSystem: z.object({
    metrics: z.array(AnalyticsMetricSchema),
    plannerModeDistribution: z.array(AnalyticsBreakdownItemSchema),
    stopReasonDistribution: z.array(AnalyticsBreakdownItemSchema),
    queryStrategyMix: z.array(AnalyticsBreakdownItemSchema),
    runDurationBuckets: z.array(AnalyticsBreakdownItemSchema),
    queryVolumeTrend: z.array(AnalyticsTimePointSchema),
    nodeLatencyMock: z.array(AnalyticsBreakdownItemSchema),
  }),
  experiments: z.object({
    metrics: z.array(AnalyticsMetricSchema),
    variants: z.array(AnalyticsBreakdownItemSchema),
    notes: z.string().min(1),
  }),
  provenance: z.object({
    real: z.array(z.string().min(1)),
    mock: z.array(z.string().min(1)),
    mixed: z.array(z.string().min(1)),
  }),
});

export const SavedPostFeedLeadSchema = LeadCardViewModelSchema.extend({
  identityKey: z.string().nullable().optional(),
  workMode: z.enum(["onsite", "hybrid", "remote"]).nullable().optional(),
  employmentType: z
    .enum(["full-time", "part-time", "contract", "internship"])
    .nullable()
    .optional(),
  sourceMetadataJson: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const SavedPostFeedResponseSchema = z.object({
  items: z.array(
    z.object({
      lead: SavedPostFeedLeadSchema,
      runContext: z.object({
        role: z.string().min(1),
        location: z.string().min(1),
        searchRunId: z.number().int().positive().nullable(),
        shownAt: z.string().datetime(),
      }),
    }),
  ),
});

export const DebugRunInputSchema = z.object({
  role: z.string().min(1).max(120),
  location: z.string().min(1).max(120),
  locationIsHardFilter: z.coerce.boolean().optional().default(false),
  employmentType: z
    .enum(["full-time", "part-time", "contract", "internship"])
    .nullable()
    .optional()
    .default(null),
  recencyPreference: RecencyPreferenceSchema,
  maxIterations: z.coerce.number().int().positive().max(10).default(2),
  targetHighQualityLeads: z.coerce.number().int().positive().max(20).default(20),
  shownIdentityKeys: z.array(z.string().min(1)).optional().default([]),
});

export const DebugRunOutputSchema = z.object({
  graph: z.object({
    nodes: z.array(z.string().min(1)),
    edges: z.array(
      z.object({
        source: z.string().min(1),
        target: z.string().min(1),
        conditional: z.boolean(),
      }),
    ),
  }),
  sequence: z.array(
    z.object({
      step: z.number().int().positive(),
      node: z.string().min(1),
      phase: z.enum(["started", "completed"]),
      log: z.string().min(1),
    }),
  ),
  nodeRuns: z.array(
    z.object({
      step: z.number().int().positive(),
      node: z.string().min(1),
      input: z.unknown(),
      output: z.unknown(),
      log: z.string().min(1),
    }),
  ),
  graphMermaid: z.string().min(1),
  final: z.object({
    taskComplete: z.boolean(),
    stopReason: StopReasonSchema,
    iteration: z.number().int().nonnegative(),
    targetHighQualityLeads: z.number().int().positive(),
    plannerMode: z.enum(["full_explore", "explore_heavy", "exploit_heavy"]).nullable(),
    counts: z.object({
      retrieved: z.number().int().nonnegative(),
      generated: z.number().int().nonnegative(),
      merged: z.number().int().nonnegative(),
      newForUser: z.number().int().nonnegative(),
    }),
  }),
  snapshots: z.object({
    plannerOutput: z.unknown().nullable(),
    retrievalResults: z.unknown().nullable(),
    generatedQueries: z.unknown().nullable(),
    searchResults: z.unknown().nullable(),
    extractionResults: z.unknown().nullable(),
    combinedResults: z.unknown().nullable(),
    scoringResults: z.unknown().nullable(),
    finalResponse: z.unknown().nullable(),
  }),
});
