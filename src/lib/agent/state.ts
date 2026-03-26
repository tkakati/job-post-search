import { z } from "zod";
import {
  CombinedResultOutputSchema,
  FinalResponseOutputSchema,
  PlannerOutputSchema,
  QueryGenerationOutputSchema,
  RetrievalOutputSchema,
  ExtractionOutputSchema,
  ScoringOutputSchema,
  SearchOutputSchema,
  UserInputSchema,
} from "@/lib/schemas/contracts";
import type { RecencyPreference } from "@/lib/types/contracts";
import { StopReasonSchema } from "@/lib/schemas/common";
import { roleLocationKey } from "@/lib/utils/role-location";

export const AgentGraphStateSchema = z.object({
  userSessionId: z.string().min(1),
  searchRunId: z.number().int().positive().nullable(),
  role: z.string().min(1),
  location: z.string().min(1),
  locationIsHardFilter: z.boolean().default(false),
  employmentType: UserInputSchema.shape.employmentType,
  recencyPreference: UserInputSchema.shape.recencyPreference,
  userRoleEmbedding: z.array(z.number()).optional(),

  iteration: z.number().int().nonnegative(),
  maxIterations: z.number().int().positive().default(3),
  targetHighQualityLeads: z.number().int().positive().default(20),

  roleLocationKey: z.string().min(1),
  retrievalSummarySignal: z
    .object({
      newUnseenRetrievedLeads: z.number().int().nonnegative(),
      totalRetrievedCandidates: z.number().int().nonnegative(),
      signalSource: z.string().min(1),
    })
    .nullable(),
  priorIterationContext: z
    .object({
      previousIterationNumber: z.number().int().nonnegative(),
      previousPlannerMode: z
        .enum(["full_explore", "explore_heavy", "exploit_heavy"])
        .optional(),
      previousTaskComplete: z.boolean().optional(),
      previousStopReason: StopReasonSchema.optional(),
    })
    .nullable(),

  plannerOutput: PlannerOutputSchema.nullable(),
  retrievalResults: RetrievalOutputSchema.nullable(),
  generatedQueries: QueryGenerationOutputSchema.nullable(),
  generatedQueryHistory: z.array(
    QueryGenerationOutputSchema.shape.generatedQueries.element,
  ),
  searchResults: SearchOutputSchema.nullable(),
  extractionResults: ExtractionOutputSchema.nullable(),
  combinedResults: CombinedResultOutputSchema.nullable(),
  scoringResults: ScoringOutputSchema.nullable(),
  finalResponse: FinalResponseOutputSchema.nullable(),

  stopReason: StopReasonSchema,
  taskComplete: z.boolean(),

  // Inputs for filtering "already shown".
  shownLeadIdentityKeys: z.array(z.string()),

  // Lightweight stateful debug trace for each node transition.
  debugLog: z.array(z.string()),
});

export type AgentGraphState = z.infer<typeof AgentGraphStateSchema>;

export function createInitialAgentGraphState(input: {
  userSessionId: string;
  searchRunId?: number | null;
  role: string;
  location: string;
  locationIsHardFilter?: boolean;
  employmentType?: "full-time" | "part-time" | "contract" | "internship" | null;
  recencyPreference: RecencyPreference;
  maxIterations?: number;
  targetHighQualityLeads?: number;
  shownLeadIdentityKeys?: string[];
  retrievalSummarySignal?: {
    newUnseenRetrievedLeads: number;
    totalRetrievedCandidates?: number;
    signalSource?: string;
  };
  priorIterationContext?: {
    previousIterationNumber: number;
    previousPlannerMode?: "full_explore" | "explore_heavy" | "exploit_heavy";
    previousTaskComplete?: boolean;
    previousStopReason?: "sufficient_high_quality_leads" | "max_iterations" | null;
  };
}): AgentGraphState {
  const parsed = UserInputSchema.parse({
    userSessionId: input.userSessionId,
    role: input.role,
    location: input.location,
    locationIsHardFilter: input.locationIsHardFilter ?? false,
    employmentType: input.employmentType ?? null,
    recencyPreference: input.recencyPreference,
  });

  return AgentGraphStateSchema.parse({
    userSessionId: parsed.userSessionId,
    searchRunId: input.searchRunId ?? null,
    role: parsed.role,
    location: parsed.location,
    locationIsHardFilter: parsed.locationIsHardFilter,
    employmentType: parsed.employmentType ?? null,
    recencyPreference: parsed.recencyPreference,
    userRoleEmbedding: undefined,
    iteration: 0,
    maxIterations: input.maxIterations ?? 3,
    targetHighQualityLeads: input.targetHighQualityLeads ?? 20,
    roleLocationKey: roleLocationKey(parsed.role, parsed.location),
    retrievalSummarySignal: {
      newUnseenRetrievedLeads:
        input.retrievalSummarySignal?.newUnseenRetrievedLeads ?? 0,
      totalRetrievedCandidates:
        input.retrievalSummarySignal?.totalRetrievedCandidates ??
        input.retrievalSummarySignal?.newUnseenRetrievedLeads ??
        0,
      signalSource: input.retrievalSummarySignal?.signalSource ?? "default_zero_signal",
    },
    priorIterationContext: input.priorIterationContext ?? null,
    plannerOutput: null,
    retrievalResults: null,
    generatedQueries: null,
    generatedQueryHistory: [],
    searchResults: null,
    extractionResults: null,
    combinedResults: null,
    scoringResults: null,
    finalResponse: null,
    stopReason: null,
    taskComplete: false,
    shownLeadIdentityKeys: input.shownLeadIdentityKeys ?? [],
    debugLog: [],
  });
}
