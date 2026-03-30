export const MATCH_STRONG_THRESHOLD = 0.7;
export const MATCH_MEDIUM_THRESHOLD = 0.45;
export const HIGH_QUALITY_LEAD_THRESHOLD = 0.55;

export const QUALITY_BADGE_HIGH_THRESHOLD = MATCH_STRONG_THRESHOLD;
export const QUALITY_BADGE_MEDIUM_THRESHOLD = MATCH_MEDIUM_THRESHOLD;

export type MatchStrength = "strong" | "medium" | "weak" | "unscored";

export function classifyMatchStrength(score: number | null | undefined): MatchStrength {
  if (typeof score !== "number" || !Number.isFinite(score)) return "unscored";
  if (score >= MATCH_STRONG_THRESHOLD) return "strong";
  if (score >= MATCH_MEDIUM_THRESHOLD) return "medium";
  return "weak";
}

export function qualityBadgeFromScore(score: number | null | undefined):
  | "high"
  | "medium"
  | "low"
  | "unscored" {
  if (typeof score !== "number" || !Number.isFinite(score)) return "unscored";
  if (score >= QUALITY_BADGE_HIGH_THRESHOLD) return "high";
  if (score >= QUALITY_BADGE_MEDIUM_THRESHOLD) return "medium";
  if (score > 0) return "low";
  return "unscored";
}
