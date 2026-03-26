type QueryMemoryItem = {
  queryText: string;
  avgQuality: number;
  totalNewLeadContributions: number;
  totalRuns: number;
};

export function buildQueryGenerationPrompt(input: {
  role: string;
  location: string;
  recencyPreference: "past-24h" | "past-week" | "past-month";
  plannerMode: "full_explore" | "explore_heavy" | "exploit_heavy";
  numExploreQueries: 0 | 1 | 2 | 3;
  highSignalPatterns: QueryMemoryItem[];
  lowSignalPatterns: QueryMemoryItem[];
  priorGeneratedQueries: string[];
}) {
  return [
    "You generate job discovery search queries.",
    "Return strict JSON only. No markdown, no commentary.",
    "",
    "Goal:",
    "- Generate candidate query strings for discovering hiring/job-post leads.",
    "- Respect the planner decision exactly.",
    "",
    "Inputs:",
    `role=${input.role}`,
    `location=${input.location}`,
    `recencyPreference=${input.recencyPreference}`,
    `plannerMode=${input.plannerMode}`,
    `numExploreQueries=${input.numExploreQueries}`,
    `priorGeneratedQueries=${JSON.stringify(input.priorGeneratedQueries)}`,
    "",
    "High signal historical patterns (prefer for exploit):",
    JSON.stringify(input.highSignalPatterns),
    "",
    "Low signal historical patterns (avoid repeating):",
    JSON.stringify(input.lowSignalPatterns),
    "",
    "Output JSON schema:",
    "{",
    '  "queries": [',
    "    {",
    '      "queryText": "string",',
    '      "queryKind": "explore" | "exploit",',
    '      "isExplore": true | false',
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- Generate between 6 and 10 candidate queries.",
    "- Keep each query concise, plain text, no quotes.",
    "- Keep queries LinkedIn content-search friendly and natural to type.",
    "- Avoid spammy phrasing, keyword stuffing, and awkward search strings.",
    "- DO NOT include any time-based phrasing in query text.",
    "- Recency is handled separately via LinkedIn datePosted facet; never encode recency in query text.",
    "- Forbidden phrases include: last week, last 7 days, last 30 days, posted recently, recently posted, past month, past week, past 24 hours.",
    "- Every query must stay anchored to the requested role and location.",
    "- Do not drift into unrelated job families.",
    "- Avoid exact duplicates and near duplicates.",
    "- Never repeat any query from priorGeneratedQueries.",
    "- Maximize diversity across candidate queries while preserving relevance.",
    "- For exploit: lean into high-signal patterns.",
    "- For explore: generate broader/novel variants.",
    "- Each query must represent a different search angle. Do not generate paraphrases.",
    "- Maximize diversity across phrasing, keyword ordering, and intent signals.",
    "- Diversity dimensions to vary across candidates: intent style (hiring/open roles/looking for/careers), structure (role-first/hiring-first/company-first), and actor perspective (recruiter/company/announcement).",
    "- Support both Boolean and non-Boolean query formats in candidates.",
    "- Boolean format must be: <hiring phrase> AND <role phrase> AND <location phrase> (location only if hard filter).",
    "- Loose format must be: <hiring phrase> <role phrase> <location phrase> with no AND operator.",
    "- For numExploreQueries=3, ensure the finalizable set can include: 1 strict Boolean query, 1 loose query, and 1 phrasing-variation query.",
    "- locationIsHardFilter rule: include location when strict geographic filtering is intended; otherwise omit location from all query strings.",
    "- Candidate mix by numExploreQueries:",
    "  - If numExploreQueries=3: candidate pool must be explore-dominated; include at least 4 explore candidates.",
    "    - Ensure the selected final 3 can cover: hiring-focused, role-focused, recruiter-style.",
    "  - If numExploreQueries=1: include at least 2 exploit candidates and at least 1 explore candidate.",
    "  - If numExploreQueries=2: include at least 3 explore candidates and at least 2 exploit candidates.",
    "  - If numExploreQueries=0: generate exploit candidates only.",
    "- queryKind and isExplore must be consistent for every candidate.",
    "- Do NOT make planner decisions.",
  ].join("\n");
}
