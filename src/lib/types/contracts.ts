export type PlannerMode = "full_explore" | "explore_heavy" | "exploit_heavy";
export type NumExploreQueries = 0 | 1 | 2 | 3;
export type StopReason = "sufficient_high_quality_leads" | "max_iterations" | null;
export type RecencyPreference = "past-24h" | "past-week" | "past-month";

export type UserInput = {
  userSessionId: string;
  role: string;
  location: string;
  locationIsHardFilter?: boolean;
  employmentType?: "full-time" | "part-time" | "contract" | "internship" | null;
  recencyPreference: RecencyPreference;
};

export type LeadIdentity = {
  canonicalUrl: string;
  identityKey: string;
};

export type LeadLocation = {
  raw: string;
  city: string | null;
  state: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
};

export type LeadRecord = LeadIdentity & {
  id?: number;
  sourceType: string;
  titleOrRole: string;
  company?: string | null;
  locations?: LeadLocation[];
  rawLocationText?: string | null;
  normalizedLocationJson?: Record<string, unknown> | string | null;
  employmentType?: "full-time" | "part-time" | "contract" | "internship" | null;
  workMode?: "onsite" | "hybrid" | "remote" | null;
  author?: string | null;
  snippet?: string | null;
  fullText?: string | null;
  postedAt?: string | null;
  fetchedAt?: string | null;
  roleEmbedding?: number[] | null;
  hiringIntentScore?: number | null;
  leadScore?: number | null;
  roleLocationKey: string;
  sourceMetadataJson?: Record<string, unknown> | null;
};

export type PlannerOutput = {
  plannerMode: PlannerMode;
  enableRetrieval: boolean;
  enableNewLeadGeneration: boolean;
  numExploreQueries: NumExploreQueries;
  rationale: string[];
  retrievalSummary: {
    roleLocationKey: string;
    newUnseenRetrievedLeads: number;
    totalRetrievedCandidates: number;
    signalSource: string;
  };
  planningDiagnostics?: {
    elapsedMs: number;
  };
};

export type RetrievalOutput = {
  roleLocationKey: string;
  retrievedLeads: LeadRecord[];
  totalRetrievedCount: number;
  newUnseenCountForUser: number;
  retrievalDiagnostics: {
    recencyPreference: RecencyPreference;
    retrievedBeforeRecencyFilter: number;
    retrievedAfterRecencyFilter: number;
    shownCountForUser: number;
    elapsedMs: number;
  };
};

export type QueryGenerationOutput = {
  roleLocationKey: string;
  iterationNumber: number;
  generatedQueries: Array<{
    queryText: string;
    queryKind: "explore" | "exploit";
    isExplore: boolean;
    sourceUrl: string;
  }>;
  queryGenerationDiagnostics: {
    plannerMode: PlannerMode;
    requestedExploreQueries: NumExploreQueries;
    generatedTotal: number;
    generatedExploreCount: number;
    generatedExploitCount: number;
    deduplicatedCount: number;
    usedLlm: boolean;
    persistedCount: number;
    elapsedMs: number;
    highSignalPatterns: string[];
    lowSignalPatterns: string[];
  };
};

export type SearchOutput = {
  roleLocationKey: string;
  iterationNumber: number;
  rawSearchResults: Array<{
    queryText: string;
    sourceUrl: string;
    provider: string;
    items: Array<Record<string, unknown>>;
  }>;
  normalizedSearchResults: LeadRecord[];
  persistedLeadIds: number[];
  queryPerformanceSummary: QueryPerformanceSummary[];
  diagnostics: {
    provider: string;
    totalRawResults: number;
    totalNormalizedResults: number;
    dedupedResults: number;
    persistedLeadCount: number;
    elapsedMs: number;
  };
  searchDiagnostics: {
    apifyCallTime: number;
    totalFetched: number;
    totalKept: number;
    resultsFetched: number;
    resultsKept: number;
    dedupedCount: number;
    queryFanoutMs?: number;
    profileEnrichmentMs?: number;
    persistenceUpdateMs?: number;
  };
  // Keep `leads` for backward compatibility with downstream merge logic.
  leads: LeadRecord[];
  providerMetadataJson: Record<string, unknown>;
};

export type ExtractedLead = {
  url: string;
  role: string | null;
  location: string | null;
  company: string | null;
  employmentType?: "full-time" | "part-time" | "contract" | "internship" | null;
  yearsOfExperience?: string | null;
  workMode?: "onsite" | "hybrid" | "remote" | null;
  isHiring: boolean;
  roleMatchScore: number;
  locationMatchScore: number;
};

export type UnifiedLead = {
  url: string;
  role: string | null;
  location: string | null;
  company: string | null;
  employmentType?: "full-time" | "part-time" | "contract" | "internship" | null;
  yearsOfExperience?: string | null;
  workMode?: "onsite" | "hybrid" | "remote" | null;
  isHiring: boolean;
  roleMatchScore: number;
  locationMatchScore: number;
  rawText: string;
  score: number;
};

export type ExtractionOutput = {
  roleLocationKey: string;
  iterationNumber: number;
  extractedLeads: ExtractedLead[];
  leads: UnifiedLead[];
  normalizedLeads: LeadRecord[];
  extractionDiagnostics: {
    postsProcessed: number;
    successfullyExtracted: number;
    skipped: number;
    averageConfidence: number;
    elapsedMs: number;
    batches: Array<{
      batchIndex: number;
      inputCount: number;
      inputSourceUrls: string[];
      inputPreview: string[];
      inputs: Array<{
        inputIndex: number;
        inputUrl: string;
        inputText: string;
        role: string | null;
        location: string | null;
        company: string | null;
        employmentType?: "full-time" | "part-time" | "contract" | "internship" | null;
        yearsOfExperience?: string | null;
        workMode?: "onsite" | "hybrid" | "remote" | null;
        isHiring: boolean;
        roleMatchScore: number;
        locationMatchScore: number;
      }>;
      elapsedMs: number;
      usedLlm: boolean;
      llmModel: string | null;
    }>;
  };
};

export type CombinedResultOutput = {
  roleLocationKey: string;
  mergedLeads: LeadRecord[];
  dedupedLeads: LeadRecord[];
  newLeadsForUser: LeadRecord[];
  leads: UnifiedLead[];
  leadProvenance: Array<{
    identityKey: string;
    sources: Array<"retrieval" | "fresh_search">;
    isNewForUser: boolean;
  }>;
  totalRetrievedCount: number;
  totalGeneratedCount: number;
  totalMergedCount: number;
  totalNewLeadCountForUser: number;
  taskComplete: boolean;
  stopReason: StopReason;
  combinedDiagnostics: {
    iteration: number;
    maxIterations: number;
    shownHistoryCount: number;
    dedupedFromMergedCount: number;
  };
};

export type ScoredLead = LeadRecord & {
  leadScore: number;
  scoreBreakdown: {
    roleMatchScore: number;
    locationMatchScore: number;
    authorStrengthScore: number;
    hiringIntentScore?: number;
    engagementScore?: number;
    employmentTypeScore: number;
    baseScore?: number;
    intentBoost?: number;
    finalScore100?: number;
    gatedToZero?: boolean;
    gateReason?:
      | "hiring_intent_zero"
      | "employment_type_mismatch"
      | "hard_location_mismatch"
      | null;
  };
};

export type ScoringOutput = {
  roleLocationKey: string;
  iterationNumber: number;
  scoredLeads: ScoredLead[];
  rankedLeads: ScoredLead[];
  topLeads: ScoredLead[];
  highQualityLeadsCount: number;
  avgScore: number;
  scoringDiagnostics: {
    totalInputLeads: number;
    totalRankedLeads: number;
    topLeadIdentityKeys: string[];
    elapsedMs: number;
  };
};

export type FinalResponseOutput = {
  taskComplete: boolean;
  stopReason: StopReason;
  plannerMode: PlannerMode;
  iterationsUsed: number;
  leads: LeadCardViewModel[];
  summary: string;
  totalCounts: {
    retrieved: number;
    generated: number;
    merged: number;
    newForUser: number;
  };
  emptyState: {
    isEmpty: boolean;
    title: string;
    message: string;
    suggestion?: string;
  };
};

export type QueryPerformanceSummary = {
  roleLocationKey: string;
  queryText: string;
  totalRuns: number;
  totalResults: number;
  totalUsableResults: number;
  totalNewLeadContributions: number;
  avgQuality: number;
};

export type LeadCardViewModel = {
  leadId?: number;
  title: string;
  company?: string | null;
  location?: string | null;
  locations?: LeadLocation[];
  rawLocationText?: string | null;
  canonicalUrl: string;
  url?: string;
  snippet?: string | null;
  sourceType: string;
  sourceBadge: "retrieved" | "fresh" | "both";
  postUrl?: string;
  generatedQuery?: string;
  postAuthor?: string | null;
  postAuthorUrl?: string | null;
  jobTitle?: string;
  jobLocation?: string | null;
  score?: number | null;
  freshness?: "retrieved" | "fresh" | "both";
  provenanceSources: Array<"retrieval" | "fresh_search">;
  postedAt?: string | null;
  isNewForUser: boolean;
  newBadge?: "new";
  qualityBadge?: "high" | "medium" | "low" | "unscored";
};

export type AgentState = {
  input: UserInput;
  searchRunId?: number | null;
  roleLocationKey: string;
  iterationNumber: number;
  maxIterations: number;
  targetHighQualityLeads: number;
  retrievalSummarySignal?: {
    newUnseenRetrievedLeads: number;
    totalRetrievedCandidates?: number;
    signalSource?: string;
  };
  priorIterationContext?: {
    previousIterationNumber: number;
    previousPlannerMode?: PlannerMode;
    previousTaskComplete?: boolean;
    previousStopReason?: StopReason;
  };

  plannerOutput?: PlannerOutput;
  retrievalOutput?: RetrievalOutput;
  queryGenerationOutput?: QueryGenerationOutput;
  generatedQueryHistory?: QueryGenerationOutput["generatedQueries"];
  searchOutput?: SearchOutput;
  combinedOutput?: CombinedResultOutput;
  finalOutput?: FinalResponseOutput;

  taskComplete: boolean;
  stopReason: StopReason;
};
