import { z } from "zod";
import {
  JsonRecordSchema,
  NumExploreQueriesSchema,
  PlannerModeSchema,
  RecencyPreferenceSchema,
  StopReasonSchema,
} from "@/lib/schemas/common";
import { LeadCardViewModelSchema, LeadRecordSchema } from "@/lib/schemas/lead";

export const UserInputSchema = z.object({
  userSessionId: z.string().min(1),
  role: z.string().min(1).max(120),
  location: z.string().min(1).max(120),
  locationIsHardFilter: z.boolean().default(false),
  employmentType: z
    .enum(["full-time", "part-time", "contract", "internship"])
    .nullable()
    .default(null),
  recencyPreference: RecencyPreferenceSchema,
});

export const PlannerOutputSchema = z.object({
  plannerMode: PlannerModeSchema,
  enableRetrieval: z.boolean(),
  enableNewLeadGeneration: z.boolean(),
  numExploreQueries: NumExploreQueriesSchema,
  rationale: z.array(z.string().min(1)).min(1),
  retrievalSummary: z.object({
    roleLocationKey: z.string().min(1),
    newUnseenRetrievedLeads: z.number().int().nonnegative(),
    totalRetrievedCandidates: z.number().int().nonnegative(),
    signalSource: z.string().min(1),
  }),
  planningDiagnostics: z
    .object({
      elapsedMs: z.number().int().nonnegative(),
    })
    .optional(),
});

export const RetrievalOutputSchema = z.object({
  roleLocationKey: z.string().min(1),
  retrievedLeads: z.array(LeadRecordSchema),
  totalRetrievedCount: z.number().int().nonnegative(),
  newUnseenCountForUser: z.number().int().nonnegative(),
  retrievalDiagnostics: z.object({
    recencyPreference: RecencyPreferenceSchema,
    retrievedBeforeRecencyFilter: z.number().int().nonnegative(),
    retrievedAfterRecencyFilter: z.number().int().nonnegative(),
    shownCountForUser: z.number().int().nonnegative(),
    elapsedMs: z.number().int().nonnegative(),
  }),
});

export const QueryGenerationOutputSchema = z.object({
  roleLocationKey: z.string().min(1),
  iterationNumber: z.number().int().nonnegative(),
  generatedQueries: z.array(
    z.object({
      queryText: z.string().min(1),
      queryKind: z.enum(["explore", "exploit"]),
      isExplore: z.boolean(),
      sourceUrl: z.string().url(),
    }),
  ),
  queryGenerationDiagnostics: z.object({
    plannerMode: PlannerModeSchema,
    requestedExploreQueries: NumExploreQueriesSchema,
    generatedTotal: z.number().int().nonnegative(),
    generatedExploreCount: z.number().int().nonnegative(),
    generatedExploitCount: z.number().int().nonnegative(),
    deduplicatedCount: z.number().int().nonnegative(),
    usedLlm: z.boolean(),
    persistedCount: z.number().int().nonnegative(),
    elapsedMs: z.number().int().nonnegative(),
    highSignalPatterns: z.array(z.string()),
    lowSignalPatterns: z.array(z.string()),
  }),
});

export const QueryPerformanceSummarySchema = z.object({
  roleLocationKey: z.string().min(1),
  queryText: z.string().min(1),
  totalRuns: z.number().int().nonnegative(),
  totalResults: z.number().int().nonnegative(),
  totalUsableResults: z.number().int().nonnegative(),
  totalNewLeadContributions: z.number().int().nonnegative(),
  avgQuality: z.number().min(0).max(1),
});

export const UnifiedLeadSchema = z.object({
  url: z.string().url(),
  role: z.string().nullable(),
  location: z.string().nullable(),
  company: z.string().nullable(),
  employmentType: z
    .enum(["full-time", "part-time", "contract", "internship"])
    .nullable()
    .optional(),
  yearsOfExperience: z.string().nullable().optional(),
  workMode: z.enum(["onsite", "hybrid", "remote"]).nullable().optional(),
  isHiring: z.boolean(),
  roleMatchScore: z.number().min(0).max(1),
  locationMatchScore: z.number().min(0).max(1),
  rawText: z.string(),
  score: z.number().min(0).max(1),
});

export const SearchOutputSchema = z.object({
  roleLocationKey: z.string().min(1),
  iterationNumber: z.number().int().nonnegative(),
  rawSearchResults: z.array(
    z.object({
      queryText: z.string().min(1),
      sourceUrl: z.string().url(),
      provider: z.string().min(1),
      items: z.array(JsonRecordSchema),
    }),
  ),
  normalizedSearchResults: z.array(LeadRecordSchema),
  persistedLeadIds: z.array(z.number().int().positive()),
  queryPerformanceSummary: z.array(QueryPerformanceSummarySchema),
  diagnostics: z.object({
    provider: z.string().min(1),
    totalRawResults: z.number().int().nonnegative(),
    totalNormalizedResults: z.number().int().nonnegative(),
    dedupedResults: z.number().int().nonnegative(),
    persistedLeadCount: z.number().int().nonnegative(),
    elapsedMs: z.number().int().nonnegative(),
  }),
  searchDiagnostics: z.object({
    apifyCallTime: z.number().int().nonnegative(),
    totalFetched: z.number().int().nonnegative(),
    totalKept: z.number().int().nonnegative(),
    resultsFetched: z.number().int().nonnegative(),
    resultsKept: z.number().int().nonnegative(),
    dedupedCount: z.number().int().nonnegative(),
    queryFanoutMs: z.number().int().nonnegative().optional(),
    profileEnrichmentMs: z.number().int().nonnegative().optional(),
    persistenceUpdateMs: z.number().int().nonnegative().optional(),
  }),
  leads: z.array(LeadRecordSchema),
  providerMetadataJson: JsonRecordSchema,
});

export const ExtractedLeadSchema = z.object({
  url: z.string().url(),
  role: z.string().nullable(),
  location: z.string().nullable(),
  company: z.string().nullable(),
  employmentType: z
    .enum(["full-time", "part-time", "contract", "internship"])
    .nullable()
    .optional(),
  yearsOfExperience: z.string().nullable().optional(),
  workMode: z.enum(["onsite", "hybrid", "remote"]).nullable().optional(),
  isHiring: z.boolean(),
  roleMatchScore: z.number().min(0).max(1),
  locationMatchScore: z.number().min(0).max(1),
});

export const ExtractionOutputSchema = z.object({
  roleLocationKey: z.string().min(1),
  iterationNumber: z.number().int().nonnegative(),
  extractedLeads: z.array(ExtractedLeadSchema),
  leads: z.array(UnifiedLeadSchema),
  normalizedLeads: z.array(LeadRecordSchema),
  extractionDiagnostics: z.object({
    postsProcessed: z.number().int().nonnegative(),
    successfullyExtracted: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    averageConfidence: z.number().min(0).max(1),
    elapsedMs: z.number().int().nonnegative(),
    batchCount: z.number().int().nonnegative().optional(),
    extractionLatencyP50Ms: z.number().int().nonnegative().optional(),
    extractionLatencyP90Ms: z.number().int().nonnegative().optional(),
    llmBatchCount: z.number().int().nonnegative().optional(),
    fallbackBatchCount: z.number().int().nonnegative().optional(),
    batches: z.array(
      z.object({
        batchIndex: z.number().int().nonnegative(),
        inputCount: z.number().int().nonnegative(),
        inputSourceUrls: z.array(z.string()),
        inputPreview: z.array(z.string()),
        inputs: z.array(
          z.object({
            inputIndex: z.number().int().nonnegative(),
            inputUrl: z.string().url(),
            inputText: z.string(),
            role: z.string().nullable(),
            location: z.string().nullable(),
            company: z.string().nullable(),
            employmentType: z
              .enum(["full-time", "part-time", "contract", "internship"])
              .nullable()
              .optional(),
            yearsOfExperience: z.string().nullable().optional(),
            workMode: z.enum(["onsite", "hybrid", "remote"]).nullable().optional(),
            isHiring: z.boolean(),
            roleMatchScore: z.number().min(0).max(1),
            locationMatchScore: z.number().min(0).max(1),
          }),
        ),
        elapsedMs: z.number().int().nonnegative(),
        usedLlm: z.boolean(),
        llmModel: z.string().nullable(),
      }),
    ),
  }),
});

export const CombinedResultOutputSchema = z.object({
  roleLocationKey: z.string().min(1),
  mergedLeads: z.array(LeadRecordSchema),
  dedupedLeads: z.array(LeadRecordSchema),
  newLeadsForUser: z.array(LeadRecordSchema),
  leads: z.array(UnifiedLeadSchema),
  leadProvenance: z.array(
    z.object({
      identityKey: z.string().min(1),
      sources: z.array(z.enum(["retrieval", "fresh_search"])).min(1),
      isNewForUser: z.boolean(),
    }),
  ),
  totalRetrievedCount: z.number().int().nonnegative(),
  totalGeneratedCount: z.number().int().nonnegative(),
  totalMergedCount: z.number().int().nonnegative(),
  totalNewLeadCountForUser: z.number().int().nonnegative(),
  taskComplete: z.boolean(),
  stopReason: StopReasonSchema,
  combinedDiagnostics: z.object({
    iteration: z.number().int().nonnegative(),
    maxIterations: z.number().int().positive(),
    shownHistoryCount: z.number().int().nonnegative(),
    dedupedFromMergedCount: z.number().int().nonnegative(),
    retrievalLatencyMs: z.number().int().nonnegative().optional(),
    searchLatencyMs: z.number().int().nonnegative().optional(),
    combineTimeMs: z.number().int().nonnegative().optional(),
    totalIterationTimeMs: z.number().int().nonnegative().optional(),
    crossSourceRedundancyDroppedCount: z.number().int().nonnegative().optional(),
    countryMismatchDroppedCount: z.number().int().nonnegative().optional(),
  }),
});

export const ScoredLeadSchema = LeadRecordSchema.extend({
  leadScore: z.number().min(0).max(1),
  scoreBreakdown: z.object({
    roleMatchScore: z.number().min(0).max(1),
    locationMatchScore: z.number().min(0).max(1),
    authorStrengthScore: z.number().min(0).max(1),
    hiringIntentScore: z.number().min(0).max(1).optional(),
    engagementScore: z.number().min(0).max(1).optional(),
    employmentTypeScore: z.number().min(0).max(1),
    baseScore: z.number().min(0).max(1).optional(),
    intentBoost: z.number().min(0).max(15).optional(),
    finalScore100: z.number().min(0).max(100).optional(),
    gatedToZero: z.boolean().optional(),
    gateReason: z
      .enum(["hiring_intent_zero", "employment_type_mismatch", "hard_location_mismatch"])
      .nullable()
      .optional(),
  }),
});

export const ScoringOutputSchema = z.object({
  roleLocationKey: z.string().min(1),
  iterationNumber: z.number().int().nonnegative(),
  scoredLeads: z.array(ScoredLeadSchema),
  rankedLeads: z.array(ScoredLeadSchema),
  topLeads: z.array(ScoredLeadSchema),
  highQualityLeadsCount: z.number().int().nonnegative(),
  avgScore: z.number().min(0).max(1),
  scoringDiagnostics: z.object({
    totalInputLeads: z.number().int().nonnegative(),
    totalRankedLeads: z.number().int().nonnegative(),
    topLeadIdentityKeys: z.array(z.string().min(1)),
    elapsedMs: z.number().int().nonnegative(),
    rankingTimeMs: z.number().int().nonnegative().optional(),
    aggregationTimeMs: z.number().int().nonnegative().optional(),
    finalizeDecisionTimeMs: z.number().int().nonnegative().optional(),
  }),
});

export const FinalResponseOutputSchema = z.object({
  taskComplete: z.boolean(),
  stopReason: StopReasonSchema,
  plannerMode: PlannerModeSchema,
  iterationsUsed: z.number().int().nonnegative(),
  leads: z.array(LeadCardViewModelSchema),
  summary: z.string(),
  totalCounts: z.object({
    retrieved: z.number().int().nonnegative(),
    generated: z.number().int().nonnegative(),
    merged: z.number().int().nonnegative(),
    newForUser: z.number().int().nonnegative(),
  }),
  emptyState: z.object({
    isEmpty: z.boolean(),
    title: z.string().min(1),
    message: z.string().min(1),
    suggestion: z.string().optional(),
  }),
  finalizationDiagnostics: z
    .object({
      elapsedMs: z.number().int().nonnegative(),
    })
    .optional(),
});

export const AgentStateSchema = z.object({
  input: UserInputSchema,
  roleLocationKey: z.string().min(1),
  iterationNumber: z.number().int().nonnegative(),
  maxIterations: z.number().int().positive(),
  targetHighQualityLeads: z.number().int().positive(),
  retrievalSummarySignal: z
    .object({
      newUnseenRetrievedLeads: z.number().int().nonnegative(),
      totalRetrievedCandidates: z.number().int().nonnegative().optional(),
      signalSource: z.string().min(1).optional(),
    })
    .optional(),
  priorIterationContext: z
    .object({
      previousIterationNumber: z.number().int().nonnegative(),
      previousPlannerMode: PlannerModeSchema.optional(),
      previousTaskComplete: z.boolean().optional(),
      previousStopReason: StopReasonSchema.optional(),
    })
    .optional(),

  plannerOutput: PlannerOutputSchema.optional(),
  retrievalOutput: RetrievalOutputSchema.optional(),
  queryGenerationOutput: QueryGenerationOutputSchema.optional(),
  searchOutput: SearchOutputSchema.optional(),
  extractionOutput: ExtractionOutputSchema.optional(),
  combinedOutput: CombinedResultOutputSchema.optional(),
  scoringOutput: ScoringOutputSchema.optional(),
  finalOutput: FinalResponseOutputSchema.optional(),

  taskComplete: z.boolean(),
  stopReason: StopReasonSchema,
});

export function parseUserInput(input: unknown) {
  return UserInputSchema.parse(input);
}
