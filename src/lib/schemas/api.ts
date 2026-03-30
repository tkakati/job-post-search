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
