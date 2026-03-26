export const DEFAULT_TARGET_NEW_LEADS = 20;
export const DEFAULT_MAX_ITERATIONS = 3;

// Planner thresholds are deterministic so the graph behavior is predictable.
// They map "recency preference" to whether we do retrieval-only, a light search,
// or heavy fresh search.
export const RECENCY_DAYS_TO_PLANNER_MODE = {
  retrievalOnlyAtDays: 90,
  retrievalPlusSearchAtDays: 30,
} as const;
