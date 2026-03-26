import { desc, eq } from "drizzle-orm";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { AgentGraphState } from "@/lib/agent/state";
import { QueryGenerationOutputSchema } from "@/lib/schemas/contracts";
import { appendDebug } from "@/lib/agent/nodes/helpers";
import { parseQueryGenerationLlmResponse } from "@/lib/agent/nodes/query-generation-parser";
import { buildQueryGenerationPrompt } from "@/lib/agent/nodes/prompts/query-generation-prompt";
import { env } from "@/lib/env";
import { emitDebugApiCall } from "@/lib/debug/api-call-sink";
import { dbClient } from "@/lib/db";
import { generatedQueries as generatedQueriesTable, queryPerformance } from "@/lib/db/schema";
import { buildLinkedInContentSearchUrl } from "@/lib/utils/recency";

type MemoryItem = {
  queryText: string;
  avgQuality: number;
  totalNewLeadContributions: number;
  totalRuns: number;
};

function withoutRecencyNoise(value: string) {
  return value
    .replace(/\blast week\b/gi, " ")
    .replace(/\blast 7 days?\b/gi, " ")
    .replace(/\blast 30 days?\b/gi, " ")
    .replace(/\bposted recently\b/gi, " ")
    .replace(/\brecently posted\b/gi, " ")
    .replace(/\bpast month\b/gi, " ")
    .replace(/\bpast week\b/gi, " ")
    .replace(/\bpast 24 hours?\b/gi, " ");
}

export function sanitizeQueryString(value: string) {
  return withoutRecencyNoise(value)
    .replace(/\s+/g, " ")
    .replace(/[“”"']/g, "")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, 180);
}

function isLocationHardFilter(location: string) {
  const normalized = location.trim().toLowerCase();
  return !["any", "global", "worldwide", "anywhere"].includes(normalized);
}

function buildBooleanQuery(input: {
  hiringPhrase: string;
  rolePhrase: string;
  location: string;
  locationIsHardFilter: boolean;
}) {
  const parts = [
    sanitizeQueryString(input.hiringPhrase),
    sanitizeQueryString(input.rolePhrase),
  ];
  if (input.locationIsHardFilter) {
    parts.push(sanitizeQueryString(input.location));
  }
  return parts.join(" AND ");
}

function buildLooseQuery(input: {
  hiringPhrase: string;
  rolePhrase: string;
  location: string;
  locationIsHardFilter: boolean;
}) {
  const parts = [
    sanitizeQueryString(input.hiringPhrase),
    sanitizeQueryString(input.rolePhrase),
  ];
  if (input.locationIsHardFilter) {
    parts.push(sanitizeQueryString(input.location));
  }
  return parts.join(" ");
}

function normalizeBooleanOrLooseQuery(input: {
  queryText: string;
  enforceBoolean: boolean;
}) {
  const base = sanitizeQueryString(input.queryText);
  if (input.enforceBoolean) {
    if (!/\bAND\b/.test(base)) {
      const tokens = base
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 3);
      return tokens.join(" AND ");
    }
    return base
      .split(/\bAND\b/i)
      .map((x) => sanitizeQueryString(x))
      .filter(Boolean)
      .join(" AND ");
  }
  // Loose queries must not contain Boolean AND operator.
  return base.replace(/\bAND\b/gi, " ").replace(/\s+/g, " ").trim();
}

function tokenize(value: string) {
  return sanitizeQueryString(value)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

function isTooSimilarByTokens(a: string, b: string) {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (aTokens.size === 0 || bTokens.size === 0) return false;
  let overlap = 0;
  for (const t of aTokens) {
    if (bTokens.has(t)) overlap += 1;
  }
  return overlap / Math.max(aTokens.size, bTokens.size) > 0.7;
}

function filterNearDuplicateCandidates(input: Array<{
  queryText: string;
  queryKind: "explore" | "exploit";
  isExplore: boolean;
}>) {
  const out: typeof input = [];
  for (const candidate of input) {
    const duplicate = out.some((existing) =>
      isTooSimilarByTokens(existing.queryText, candidate.queryText),
    );
    if (!duplicate) out.push(candidate);
  }
  return out;
}

function toLinkedInContentSearchUrl(
  queryText: string,
  recencyPreference: AgentGraphState["recencyPreference"],
) {
  return buildLinkedInContentSearchUrl({
    queryText,
    recencyPreference,
  });
}

function selectMixTargets(input: {
  requestedQueryCount: 0 | 1 | 2 | 3;
  plannerMode: "full_explore" | "explore_heavy" | "exploit_heavy";
}) {
  const { requestedQueryCount, plannerMode } = input;
  if (requestedQueryCount === 3) {
    if (plannerMode === "exploit_heavy") return { explore: 1, exploit: 2 };
    return { explore: 3, exploit: 0 };
  }
  if (requestedQueryCount === 2) {
    if (plannerMode === "exploit_heavy") return { explore: 1, exploit: 1 };
    return { explore: 2, exploit: 0 };
  }
  if (requestedQueryCount === 1) {
    if (plannerMode === "exploit_heavy") return { explore: 0, exploit: 1 };
    return { explore: 1, exploit: 0 };
  }
  return { explore: 0, exploit: 0 };
}

export function computeQueryKindPlan(
  requestedQueryCount: 0 | 1 | 2 | 3,
  plannerMode: "full_explore" | "explore_heavy" | "exploit_heavy" = "explore_heavy",
) {
  const targets = selectMixTargets({ requestedQueryCount, plannerMode });
  return {
    total: requestedQueryCount,
    explore: targets.explore,
    exploit: targets.exploit,
  };
}

function dedupeCandidates(input: Array<{
  queryText: string;
  queryKind: "explore" | "exploit";
  isExplore: boolean;
}>) {
  const seen = new Set<string>();
  const out: typeof input = [];
  for (const q of input) {
    const normalized = sanitizeQueryString(q.queryText).toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push({
      queryText: sanitizeQueryString(q.queryText),
      queryKind: q.queryKind,
      isExplore: q.isExplore,
    });
  }
  return out;
}

async function fetchQueryPerformanceMemory(roleLocationKey: string) {
  const db = dbClient();
  const rows = await db
    .select({
      queryText: queryPerformance.queryText,
      avgQuality: queryPerformance.avgQuality,
      totalNewLeadContributions: queryPerformance.totalNewLeadContributions,
      totalRuns: queryPerformance.totalRuns,
    })
    .from(queryPerformance)
    .where(eq(queryPerformance.roleLocationKey, roleLocationKey))
    .orderBy(desc(queryPerformance.totalNewLeadContributions), desc(queryPerformance.avgQuality))
    .limit(40);

  const memory = rows.map((r) => ({
    queryText: r.queryText,
    avgQuality: r.avgQuality ?? 0,
    totalNewLeadContributions: r.totalNewLeadContributions ?? 0,
    totalRuns: r.totalRuns ?? 0,
  }));

  const highSignalPatterns = memory.filter(
    (m) => m.avgQuality >= 0.65 && m.totalNewLeadContributions >= 1,
  );
  const lowSignalPatterns = memory.filter(
    (m) => m.avgQuality < 0.35 && m.totalRuns >= 2,
  );

  return {
    memory,
    highSignalPatterns,
    lowSignalPatterns,
  };
}

function fallbackCandidates(input: {
  role: string;
  location: string;
  highSignalPatterns: MemoryItem[];
  locationIsHardFilter: boolean;
}) {
  const exploitFromMemory = input.highSignalPatterns.slice(0, 2).map((m) => ({
    queryText: m.queryText,
    queryKind: "exploit" as const,
    isExplore: false,
  }));

  const locationSuffix = input.locationIsHardFilter ? ` ${input.location}` : "";
  const base = `${input.role}${locationSuffix}`;
  return [
    ...exploitFromMemory,
    {
      queryText: `hiring ${input.role}${locationSuffix}`,
      queryKind: "exploit" as const,
      isExplore: false,
    },
    {
      queryText: `${base} open roles`,
      queryKind: "explore" as const,
      isExplore: true,
    },
    {
      queryText: `we are hiring ${input.role}${locationSuffix}`,
      queryKind: "explore" as const,
      isExplore: true,
    },
    {
      queryText: `looking for ${input.role}${locationSuffix}`,
      queryKind: "explore" as const,
      isExplore: true,
    },
  ];
}

function ensureExploreDiversity(input: {
  role: string;
  location: string;
  locationIsHardFilter: boolean;
  candidates: Array<{ queryText: string; queryKind: "explore" | "exploit"; isExplore: boolean }>;
}) {
  const locationSuffix = input.locationIsHardFilter ? ` ${input.location}` : "";
  const templates = [
    `hiring ${input.role}${locationSuffix}`,
    `${input.role}${locationSuffix} open roles`,
    `looking for ${input.role}${locationSuffix}`,
    input.locationIsHardFilter
      ? `${input.location} recruiter hiring ${input.role}`
      : `recruiter hiring ${input.role}`,
  ];
  for (const template of templates) {
    const duplicate = input.candidates.some((c) =>
      isTooSimilarByTokens(c.queryText, template),
    );
    if (!duplicate) {
      input.candidates.push({
        queryText: template,
        queryKind: "explore",
        isExplore: true,
      });
    }
  }
}

export function materializeRequestedQueries(input: {
  candidates: Array<{
    queryText: string;
    queryKind: "explore" | "exploit";
    isExplore: boolean;
  }>;
  requestedQueryCount: 0 | 1 | 2 | 3;
  plannerMode: "full_explore" | "explore_heavy" | "exploit_heavy";
  priorQueries: string[];
  role: string;
  location: string;
  highSignalPatterns: MemoryItem[];
  recencyPreference: AgentGraphState["recencyPreference"];
}) {
  if (input.requestedQueryCount === 0) return [];
  const targets = selectMixTargets({
    requestedQueryCount: input.requestedQueryCount,
    plannerMode: input.plannerMode,
  });
  const locationIsHardFilter = isLocationHardFilter(input.location);
  const prior = new Set(input.priorQueries.map((q) => sanitizeQueryString(q).toLowerCase()));
  const candidates = filterNearDuplicateCandidates(dedupeCandidates(input.candidates)).filter(
    (q) => !prior.has(sanitizeQueryString(q.queryText).toLowerCase()),
  );
  ensureExploreDiversity({
    role: input.role,
    location: input.location,
    locationIsHardFilter,
    candidates,
  });

  const explorePool = candidates.filter((q) => q.queryKind === "explore");
  const exploitPool = candidates.filter((q) => q.queryKind === "exploit");

  const selected: Array<{
    queryText: string;
    queryKind: "explore" | "exploit";
    isExplore: boolean;
    sourceUrl: string;
  }> = [];

  const selectedNormalized = new Set<string>();

  const pushCandidate = (
    queryText: string,
    queryKind: "explore" | "exploit",
  ) => {
    if (selected.length >= input.requestedQueryCount) return false;
    const normalized = sanitizeQueryString(queryText).toLowerCase();
    if (!normalized || prior.has(normalized) || selectedNormalized.has(normalized)) return false;
    selectedNormalized.add(normalized);
    selected.push({
      queryText: sanitizeQueryString(queryText),
      queryKind,
      isExplore: queryKind === "explore",
      sourceUrl: toLinkedInContentSearchUrl(queryText, input.recencyPreference),
    });
    return true;
  };

  const selectedCountByKind = (kind: "explore" | "exploit") =>
    selected.filter((q) => q.queryKind === kind).length;

  const stillNeedsKind = (kind: "explore" | "exploit") => {
    const target = kind === "explore" ? targets.explore : targets.exploit;
    return selectedCountByKind(kind) < target;
  };

  if (
    input.requestedQueryCount === 3 &&
    targets.explore === 3 &&
    targets.exploit === 0
  ) {
    // Keep a diverse all-explore template set for full-explore runs.
    const seedQueries = [
      normalizeBooleanOrLooseQuery({
        queryText: buildBooleanQuery({
          hiringPhrase: "hiring",
          rolePhrase: input.role,
          location: input.location,
          locationIsHardFilter,
        }),
        enforceBoolean: true,
      }),
      normalizeBooleanOrLooseQuery({
        queryText: buildLooseQuery({
          hiringPhrase: "hiring",
          rolePhrase: input.role,
          location: input.location,
          locationIsHardFilter,
        }),
        enforceBoolean: false,
      }),
      normalizeBooleanOrLooseQuery({
        queryText: buildLooseQuery({
          hiringPhrase: "looking for",
          rolePhrase: input.role,
          location: input.location,
          locationIsHardFilter,
        }),
        enforceBoolean: false,
      }),
    ];
    for (const seed of seedQueries) {
      if (!stillNeedsKind("explore")) break;
      pushCandidate(seed, "explore");
    }
  }

  for (const q of explorePool) {
    if (!stillNeedsKind("explore")) break;
    pushCandidate(q.queryText, "explore");
  }

  for (const q of exploitPool) {
    if (!stillNeedsKind("exploit")) break;
    pushCandidate(q.queryText, "exploit");
  }

  // Fill any remaining mix gaps deterministically from fallback templates.
  if (selected.length < input.requestedQueryCount) {
    const fallback = dedupeCandidates(
      fallbackCandidates({
        role: input.role,
        location: input.location,
        highSignalPatterns: input.highSignalPatterns,
        locationIsHardFilter,
      }),
    );
    for (const q of fallback) {
      if (selected.length >= input.requestedQueryCount) break;
      if (
        (q.queryKind === "explore" && stillNeedsKind("explore")) ||
        (q.queryKind === "exploit" && stillNeedsKind("exploit"))
      ) {
        pushCandidate(q.queryText, q.queryKind);
      }
    }
  }

  // Last resort: pad only to requested count.
  while (selected.length < input.requestedQueryCount) {
    const idx = selected.length + 1;
    const synthetic = `${input.role}${locationIsHardFilter ? ` ${input.location}` : ""} hiring ${idx}`;
    const queryKind: "explore" | "exploit" =
      stillNeedsKind("explore") ? "explore" : stillNeedsKind("exploit") ? "exploit" : input.plannerMode === "exploit_heavy" ? "exploit" : "explore";
    pushCandidate(synthetic, queryKind);
  }

  return selected.slice(0, input.requestedQueryCount);
}

// Backward-compatible export name used by existing tests/tools.
export function materializeExactlyThree(input: {
  candidates: Array<{
    queryText: string;
    queryKind: "explore" | "exploit";
    isExplore: boolean;
  }>;
  numExploreQueries: 0 | 1 | 2 | 3;
  priorQueries: string[];
  role: string;
  location: string;
  highSignalPatterns: MemoryItem[];
  recencyPreference: AgentGraphState["recencyPreference"];
}) {
  return materializeRequestedQueries({
    candidates: input.candidates,
    requestedQueryCount: input.numExploreQueries,
    plannerMode: input.numExploreQueries <= 1 ? "exploit_heavy" : "explore_heavy",
    priorQueries: input.priorQueries,
    role: input.role,
    location: input.location,
    highSignalPatterns: input.highSignalPatterns,
    recencyPreference: input.recencyPreference,
  });
}

async function persistGeneratedQueries(input: {
  searchRunId: number | null;
  iterationNumber: number;
  roleLocationKey: string;
  queries: Array<{
    queryText: string;
    queryKind: "explore" | "exploit";
    isExplore: boolean;
    sourceUrl: string;
  }>;
}) {
  if (!input.searchRunId) return 0;
  const db = dbClient();
  await db
    .insert(generatedQueriesTable)
    .values(
      input.queries.map((q) => ({
        searchRunId: input.searchRunId as number,
        iterationNumber: input.iterationNumber,
        roleLocationKey: input.roleLocationKey,
        queryText: q.queryText,
        queryKind: q.queryKind,
        isExplore: q.isExplore,
        sourceUrl: q.sourceUrl,
        performanceJson: { persistedBy: "query_generation_node" },
      })),
    )
    .onConflictDoNothing();

  return input.queries.length;
}

/**
 * query_generation:
 * Instantiates concrete queries from planner directives.
 * This node does not make planning decisions.
 */
export async function queryGenerationNode(state: AgentGraphState) {
  const t0 = Date.now();
  const plannerMode = state.plannerOutput?.plannerMode ?? "exploit_heavy";
  const requestedQueryCount = state.plannerOutput?.numExploreQueries ?? 0;
  const enableFresh = state.plannerOutput?.enableNewLeadGeneration ?? false;

  if (!enableFresh || requestedQueryCount === 0) {
    const generatedQueries = QueryGenerationOutputSchema.parse({
      roleLocationKey: state.roleLocationKey,
      iterationNumber: state.iteration,
      generatedQueries: [],
      queryGenerationDiagnostics: {
        plannerMode,
        requestedExploreQueries: requestedQueryCount,
        generatedTotal: 0,
        generatedExploreCount: 0,
        generatedExploitCount: 0,
        deduplicatedCount: 0,
        usedLlm: false,
        persistedCount: 0,
        elapsedMs: Date.now() - t0,
        highSignalPatterns: [],
        lowSignalPatterns: [],
      },
    });
    return {
      generatedQueries,
      debugLog: appendDebug(state, "query_generation skipped (fresh disabled or explore=0)"),
    };
  }

  const { highSignalPatterns, lowSignalPatterns } = await fetchQueryPerformanceMemory(
    state.roleLocationKey,
  );
  const priorQueries = (state.generatedQueryHistory ?? []).map((q) => q.queryText);

  let llmCandidates: Array<{
    queryText: string;
    queryKind: "explore" | "exploit";
    isExplore: boolean;
  }> = [];
  let usedLlm = false;

  if (env.OPENAI_API_KEY) {
    try {
      const llm = new ChatOpenAI({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_CHAT_MODEL ?? "gpt-5.2",
        temperature: 0,
      });

      const prompt = buildQueryGenerationPrompt({
        role: state.role,
        location: state.location,
        recencyPreference: state.recencyPreference,
        plannerMode,
        numExploreQueries: requestedQueryCount,
        highSignalPatterns,
        lowSignalPatterns,
        priorGeneratedQueries: priorQueries,
      });

      const response = await llm.invoke([new HumanMessage(prompt)]);
      const text = response.content?.toString().trim() ?? '{"queries":[]}';
      emitDebugApiCall({
        node: "query_generation",
        api: "OpenAI chat (query_generation)",
        method: "POST",
        url: env.OPENAI_CHAT_MODEL ?? "gpt-5.2",
        input: {
          model: env.OPENAI_CHAT_MODEL ?? "gpt-5.2",
          promptChars: prompt.length,
        },
        output: {
          responseChars: text.length,
          textPreview: text.slice(0, 2000),
        },
      });
      const parsed = parseQueryGenerationLlmResponse(JSON.parse(text));
      llmCandidates = parsed.queries.map((q) => ({
        queryText: q.queryText,
        queryKind: q.queryKind,
        isExplore: q.isExplore,
      }));
      usedLlm = llmCandidates.length > 0;
    } catch {
      llmCandidates = [];
      usedLlm = false;
    }
  }

  const combinedCandidates = [
    ...llmCandidates,
    ...fallbackCandidates({
      role: state.role,
      location: state.location,
      highSignalPatterns,
      locationIsHardFilter: state.locationIsHardFilter,
    }),
  ];
  const deduplicatedCount = dedupeCandidates(combinedCandidates).length;
  const finalQueries = materializeRequestedQueries({
    candidates: combinedCandidates,
    requestedQueryCount,
    plannerMode,
    priorQueries,
    role: state.role,
    location: state.location,
    highSignalPatterns,
    recencyPreference: state.recencyPreference,
  });

  const persistedCount = await persistGeneratedQueries({
    searchRunId: state.searchRunId ?? null,
    iterationNumber: state.iteration,
    roleLocationKey: state.roleLocationKey,
    queries: finalQueries,
  });

  const generatedQueries = QueryGenerationOutputSchema.parse({
      roleLocationKey: state.roleLocationKey,
      iterationNumber: state.iteration,
      generatedQueries: finalQueries,
      queryGenerationDiagnostics: {
        plannerMode,
        requestedExploreQueries: requestedQueryCount,
      generatedTotal: finalQueries.length,
      generatedExploreCount: finalQueries.filter((q) => q.isExplore).length,
      generatedExploitCount: finalQueries.filter((q) => !q.isExplore).length,
      deduplicatedCount,
      usedLlm,
      persistedCount,
      elapsedMs: Date.now() - t0,
      highSignalPatterns: highSignalPatterns.map((p) => p.queryText),
      lowSignalPatterns: lowSignalPatterns.map((p) => p.queryText),
    },
  });

  return {
    generatedQueries,
    generatedQueryHistory: [
      ...(state.generatedQueryHistory ?? []),
      ...generatedQueries.generatedQueries,
    ],
    debugLog: appendDebug(
      state,
      `query_generation => total=${generatedQueries.generatedQueries.length}, explore=${generatedQueries.queryGenerationDiagnostics.generatedExploreCount}, exploit=${generatedQueries.queryGenerationDiagnostics.generatedExploitCount}, persisted=${persistedCount}`,
    ),
  };
}
