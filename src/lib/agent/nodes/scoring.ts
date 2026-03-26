import type { AgentGraphState } from "@/lib/agent/state";
import { ScoringOutputSchema } from "@/lib/schemas/contracts";
import type { LeadRecord } from "@/lib/types/contracts";
import { appendDebug } from "@/lib/agent/nodes/helpers";
import { cosineSimilarity, getEmbedding } from "@/lib/ai/embeddings";
import { authorStrengthScoreFromType, resolveAuthorType } from "@/lib/author/classification";
import { coerceLeadLocations, haversineDistance, resolveLocation } from "@/lib/location/geo";
import { resolveExtractedCompany } from "@/lib/post-feed/company-resolution";
import { dbClient } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

type ScoreBreakdown = {
  roleMatchScore: number;
  locationMatchScore: number;
  authorStrengthScore: number;
  engagementScore: number;
  employmentTypeScore: number;
};

const HIGH_QUALITY_THRESHOLD = 0.7;
const ROLE_EMBEDDING_BACKFILL_IN_FLIGHT = new Set<string>();

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function hasValidEmbedding(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((v) => typeof v === "number" && Number.isFinite(v))
  );
}

function heuristicRoleScoreForLead(lead: LeadRecord, state: AgentGraphState) {
  const userRole = state.role?.toLowerCase() ?? "";
  const leadRole = lead.titleOrRole?.toLowerCase() ?? "";

  if (!userRole || !leadRole) return 0;

  // exact / strong match
  if (leadRole.includes(userRole)) return 1;

  // partial token match
  const userTokens = userRole.split(" ").filter(Boolean);
  const overlap = userTokens.filter((t) => leadRole.includes(t)).length;

  if (overlap >= 2) return 0.7;
  if (overlap === 1) return 0.5;

  return 0.2;
}

function roleMatchScoreForLead(lead: LeadRecord, state: AgentGraphState) {
  const heuristicRoleScore = clamp01(heuristicRoleScoreForLead(lead, state));
  const leadRoleEmbedding = hasValidEmbedding(lead.roleEmbedding) ? lead.roleEmbedding : null;
  const userRoleEmbedding = hasValidEmbedding(state.userRoleEmbedding)
    ? state.userRoleEmbedding
    : null;
  const canUseEmbedding =
    leadRoleEmbedding != null &&
    userRoleEmbedding != null &&
    leadRoleEmbedding.length === userRoleEmbedding.length;
  const embeddingScore = canUseEmbedding
    ? clamp01(cosineSimilarity(leadRoleEmbedding, userRoleEmbedding))
    : null;
  const finalRoleScore =
    embeddingScore == null
      ? heuristicRoleScore
      : clamp01(0.7 * heuristicRoleScore + 0.3 * embeddingScore);

  return {
    heuristicRoleScore,
    embeddingScore,
    finalRoleScore,
  };
}

function queueRoleEmbeddingBackfill(leadsIn: LeadRecord[]) {
  const candidates = leadsIn.filter(
    (lead) =>
      !hasValidEmbedding(lead.roleEmbedding) &&
      typeof lead.titleOrRole === "string" &&
      lead.titleOrRole.trim().length > 0 &&
      typeof lead.canonicalUrl === "string" &&
      lead.canonicalUrl.trim().length > 0,
  );
  if (candidates.length === 0) return;

  const db = dbClient();
  for (const lead of candidates) {
    const key = lead.canonicalUrl;
    if (ROLE_EMBEDDING_BACKFILL_IN_FLIGHT.has(key)) continue;
    ROLE_EMBEDDING_BACKFILL_IN_FLIGHT.add(key);

    void (async () => {
      try {
        const embedding = await getEmbedding(lead.titleOrRole);
        if (!hasValidEmbedding(embedding)) return;
        await db
          .update(leads)
          .set({
            roleEmbedding: embedding,
            updatedAt: new Date(),
          })
          .where(eq(leads.canonicalUrl, key));
      } catch {
        // Non-blocking by design; scoring must not fail on async backfill errors.
      } finally {
        ROLE_EMBEDDING_BACKFILL_IN_FLIGHT.delete(key);
      }
    })();
  }
}

function locationMatchScoreForLead(lead: LeadRecord, state: AgentGraphState) {
  const userResolved = resolveLocation(state.location);
  const leadLocations = coerceLeadLocations({
    locations: lead.locations,
    rawLocationText: lead.rawLocationText,
    location: (lead as { location?: string | null }).location ?? null,
  });

  let bestScore = 0;

  if (userResolved?.lat != null && userResolved.lon != null) {
    for (const loc of leadLocations) {
      const resolved = resolveLocation(loc.raw);
      const lat = resolved?.lat;
      const lon = resolved?.lon;
      if (lat == null || lon == null) continue;

      const distance = haversineDistance(userResolved.lat, userResolved.lon, lat, lon);
      let score = 0;
      if (distance < 10) score = 1.0;
      else if (distance < 30) score = 0.9;
      else if (distance < 75) score = 0.8;
      else if (distance < 150) score = 0.7;
      else if (distance < 300) score = 0.6;
      else score = 0.4;

      bestScore = Math.max(bestScore, score);
    }
  }

  if (bestScore === 0) {
    bestScore = 0.3;
  }

  if (lead.workMode === "remote") {
    bestScore = Math.max(bestScore, 0.7);
  }

  if (state.locationIsHardFilter && bestScore < 0.6) {
    return 0.2;
  }

  return bestScore;
}

function authorStrengthScoreForLead(lead: LeadRecord) {
  const extraction =
    lead.sourceMetadataJson &&
    typeof lead.sourceMetadataJson === "object" &&
    typeof (lead.sourceMetadataJson as Record<string, unknown>).extraction === "object"
      ? ((lead.sourceMetadataJson as Record<string, unknown>).extraction as Record<string, unknown>)
      : null;
  const authorProfile =
    lead.sourceMetadataJson &&
    typeof lead.sourceMetadataJson === "object" &&
    typeof (lead.sourceMetadataJson as Record<string, unknown>).authorProfile === "object"
      ? ((lead.sourceMetadataJson as Record<string, unknown>).authorProfile as Record<
          string,
          unknown
        >)
      : null;
  const inferredPostCompany = resolveExtractedCompany({
    leadCompany: lead.company ?? null,
    extractionCompany: typeof extraction?.company === "string" ? extraction.company : null,
  });
  const resolved = resolveAuthorType({
    postCompany: inferredPostCompany,
    latestPositionTitle:
      typeof extraction?.authorLatestPositionTitle === "string"
        ? extraction.authorLatestPositionTitle
        : typeof authorProfile?.latestPositionTitle === "string"
          ? authorProfile.latestPositionTitle
          : null,
    latestPositionCompanyName:
      typeof extraction?.authorLatestPositionCompanyName === "string"
        ? extraction.authorLatestPositionCompanyName
        : typeof authorProfile?.latestPositionCompanyName === "string"
          ? authorProfile.latestPositionCompanyName
          : null,
    headline:
      typeof extraction?.authorHeadline === "string"
        ? extraction.authorHeadline
        : typeof authorProfile?.headline === "string"
          ? authorProfile.headline
          : null,
    about:
      typeof extraction?.authorAbout === "string"
        ? extraction.authorAbout
        : typeof authorProfile?.about === "string"
          ? authorProfile.about
          : null,
    postText:
      (typeof lead.fullText === "string" && lead.fullText.trim() ? lead.fullText : null) ??
      (typeof lead.snippet === "string" && lead.snippet.trim() ? lead.snippet : null),
    llmAuthorTypeGuess: extraction?.authorTypeGuess,
  });
  return {
    authorType: resolved.authorType,
    authorStrengthScore: clamp01(authorStrengthScoreFromType(resolved.authorType)),
    hasHiringPhrase: resolved.hasHiringPhrase,
    resolutionSource: resolved.source,
  };
}

function engagementScoreForLead(lead: LeadRecord) {
  return (lead.hiringIntentScore ?? 0) >= 0.5 ? 1 : 0;
}

function employmentTypeFromLead(lead: LeadRecord) {
  if (
    lead.employmentType === "full-time" ||
    lead.employmentType === "part-time" ||
    lead.employmentType === "contract" ||
    lead.employmentType === "internship"
  ) {
    return lead.employmentType;
  }
  const extraction =
    lead.sourceMetadataJson &&
    typeof lead.sourceMetadataJson === "object" &&
    typeof (lead.sourceMetadataJson as Record<string, unknown>).extraction === "object"
      ? ((lead.sourceMetadataJson as Record<string, unknown>).extraction as Record<string, unknown>)
      : null;
  const raw = extraction?.employmentType;
  return raw === "full-time" || raw === "part-time" || raw === "contract" || raw === "internship"
    ? raw
    : null;
}

function employmentTypeScoreForLead(lead: LeadRecord, state: AgentGraphState) {
  // Lenient behavior:
  // - if user did not provide employment type => no penalty (1)
  // - if extraction has no employment type => no penalty (1)
  const userEmploymentType = state.employmentType ?? null;
  if (!userEmploymentType) return 1;
  const extractedEmploymentType = employmentTypeFromLead(lead);
  if (!extractedEmploymentType) return 1;
  return extractedEmploymentType === userEmploymentType ? 1 : 0;
}

function scoreLead(lead: LeadRecord, state: AgentGraphState) {
  const roleScore = roleMatchScoreForLead(lead, state);
  const authorScore = authorStrengthScoreForLead(lead);
  const breakdown: ScoreBreakdown = {
    roleMatchScore: roleScore.finalRoleScore,
    locationMatchScore: locationMatchScoreForLead(lead, state),
    authorStrengthScore: authorScore.authorStrengthScore,
    engagementScore: engagementScoreForLead(lead),
    employmentTypeScore: employmentTypeScoreForLead(lead, state),
  };

  const leadScore = clamp01(
    (0.4 * breakdown.roleMatchScore +
      0.3 * breakdown.locationMatchScore +
      0.3 * breakdown.authorStrengthScore) *
      (breakdown.engagementScore * breakdown.employmentTypeScore),
  );
  return {
    leadScore,
    scoreBreakdown: breakdown,
    roleScoreDebug: roleScore,
    authorScoreDebug: authorScore,
  };
}

export async function scoringNode(state: AgentGraphState) {
  const startedAt = Date.now();
  const combined = state.combinedResults;
  const inputLeads = combined?.newLeadsForUser ?? [];
  queueRoleEmbeddingBackfill(inputLeads);
  const isFirstIteration = state.iteration === 0;
  const hasFreshQueriesExecutedYet =
    state.generatedQueries != null ||
    state.searchResults != null ||
    state.extractionResults != null;
  const isInitialRetrievalScoring = isFirstIteration && !hasFreshQueriesExecutedYet;

  const rankedLeads = inputLeads
    .map((lead) => ({ ...lead, ...scoreLead(lead, state) }))
    .sort((a, b) => b.leadScore - a.leadScore);
  const topLeads = rankedLeads.slice(0, 20);
  const highQualityLeadsCount = rankedLeads.filter(
    (lead) => lead.leadScore >= HIGH_QUALITY_THRESHOLD,
  ).length;
  const avgScore =
    rankedLeads.length > 0
      ? rankedLeads.reduce((acc, lead) => acc + lead.leadScore, 0) / rankedLeads.length
      : 0;

  const persistedLeadScores = 0;

  const targetHighQualityLeads = state.targetHighQualityLeads;
  const reachedQualityTarget = highQualityLeadsCount >= targetHighQualityLeads;
  const reachedIterationLimit = state.iteration + 1 >= state.maxIterations;
  const taskComplete = isInitialRetrievalScoring
    ? false
    : reachedQualityTarget || reachedIterationLimit;
  const stopReason = isInitialRetrievalScoring
    ? null
    : taskComplete
      ? reachedQualityTarget
        ? "sufficient_high_quality_leads"
        : "max_iterations"
      : null;
  const scoringProfile = isInitialRetrievalScoring
    ? "initial_retrieval_scoring"
    : taskComplete && state.plannerOutput?.enableNewLeadGeneration === false
      ? "retrieval_only_finalization"
      : "adaptive_exploration";
  const nextIteration = isInitialRetrievalScoring
    ? state.iteration
    : taskComplete
      ? state.iteration
      : state.iteration + 1;

  const scoringResults = ScoringOutputSchema.parse({
    roleLocationKey: state.roleLocationKey,
    iterationNumber: state.iteration,
    scoredLeads: rankedLeads,
    rankedLeads,
    topLeads,
    highQualityLeadsCount,
    avgScore: clamp01(avgScore),
    scoringDiagnostics: {
      totalInputLeads: inputLeads.length,
      totalRankedLeads: rankedLeads.length,
      topLeadIdentityKeys: topLeads.map((lead) => lead.identityKey),
      elapsedMs: Date.now() - startedAt,
    },
  });

  const leadScoreLog = rankedLeads
    .slice(0, 10)
    .map((lead) => `${lead.identityKey}:${lead.leadScore.toFixed(3)}`)
    .join(", ");
  const roleScoreLog = rankedLeads
    .slice(0, 10)
    .map((lead) => {
      const heuristic = lead.roleScoreDebug.heuristicRoleScore.toFixed(2);
      const embedding =
        lead.roleScoreDebug.embeddingScore == null
          ? "n/a"
          : lead.roleScoreDebug.embeddingScore.toFixed(2);
      const final = lead.roleScoreDebug.finalRoleScore.toFixed(2);
      return `${lead.identityKey}: heuristicRoleScore=${heuristic}, embeddingScore=${embedding}, finalRoleScore=${final}; role_score = heuristic(${heuristic}) + embedding(${embedding}) -> final(${final})`;
    })
    .join(" | ");
  const topRankedLog = topLeads
    .map((lead) => `${lead.titleOrRole}(${lead.leadScore.toFixed(3)})`)
    .join(" | ");
  const deterministicAuthorHits = rankedLeads.filter(
    (lead) => lead.authorScoreDebug.resolutionSource === "deterministic",
  ).length;
  const llmFallbackHits = rankedLeads.filter(
    (lead) => lead.authorScoreDebug.resolutionSource === "llm_fallback",
  ).length;
  const unknownAuthorHits = rankedLeads.filter(
    (lead) => lead.authorScoreDebug.authorType === "Unknown",
  ).length;
  const phraseHitCount = rankedLeads.filter((lead) => lead.authorScoreDebug.hasHiringPhrase).length;
  const authorTypeDistribution = rankedLeads.reduce<Record<string, number>>((acc, lead) => {
    acc[lead.authorScoreDebug.authorType] = (acc[lead.authorScoreDebug.authorType] ?? 0) + 1;
    return acc;
  }, {});
  const authorScoreLog = rankedLeads
    .slice(0, 10)
    .map(
      (lead) =>
        `${lead.identityKey}: author_type=${lead.authorScoreDebug.authorType}, author_strength=${lead.authorScoreDebug.authorStrengthScore.toFixed(2)}, source=${lead.authorScoreDebug.resolutionSource}, phrase_hit=${lead.authorScoreDebug.hasHiringPhrase}`,
    )
    .join(" | ");

  return {
    scoringResults,
    taskComplete,
    stopReason,
    iteration: nextIteration,
    debugLog: appendDebug(
      state,
      `scoring_node => mode=${isInitialRetrievalScoring ? "initial_retrieval_scoring" : "normal_scoring"}, scoring_profile=${scoringProfile}, total=${rankedLeads.length}, highQuality=${highQualityLeadsCount}, avgScore=${clamp01(avgScore).toFixed(2)}, persistedLeadScores=${persistedLeadScores}, ${taskComplete ? "finalize" : "continue"}, stopReason=${stopReason ?? "continue"}, targetHighQualityLeads=${targetHighQualityLeads}, author_stats={deterministic_hits:${deterministicAuthorHits}, llm_fallback_hits:${llmFallbackHits}, unknown_count:${unknownAuthorHits}, phrase_hit_count:${phraseHitCount}, type_distribution:${JSON.stringify(authorTypeDistribution)}}, lead_scores=[${leadScoreLog}], role_scores=[${roleScoreLog}], author_scores=[${authorScoreLog}], top_ranked=[${topRankedLog}]`,
    ),
  };
}

export function routeAfterScoring(state: AgentGraphState) {
  return state.taskComplete ? "final_response_generation" : "planning_phase";
}
