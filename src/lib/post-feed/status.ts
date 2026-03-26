export const POST_REVIEW_STATUS_VALUES = [
  "not_reviewed",
  "interested",
  "applied",
  "messaged",
  "ignored",
] as const;

export type PostReviewStatus = (typeof POST_REVIEW_STATUS_VALUES)[number];

export const POST_REVIEW_STATUS_LABELS: Record<PostReviewStatus, string> = {
  not_reviewed: "Not reviewed",
  interested: "Interested",
  applied: "Applied",
  messaged: "Messaged",
  ignored: "Ignored",
};

export const POST_REVIEW_STATUS_RELEVANCE_ORDER: readonly PostReviewStatus[] = [
  "applied",
  "messaged",
  "interested",
  "not_reviewed",
  "ignored",
] as const;

type PostReviewStatusUiMeta = {
  tone: "strong_positive" | "high_positive" | "moderate_positive" | "neutral" | "muted";
  selectClassName: string;
  dotClassName: string;
  ariaLabel: string;
};

export const POST_REVIEW_STATUS_UI: Record<PostReviewStatus, PostReviewStatusUiMeta> = {
  applied: {
    tone: "strong_positive",
    selectClassName:
      "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800/70 dark:bg-emerald-950/40 dark:text-emerald-200",
    dotClassName: "bg-emerald-600 dark:bg-emerald-400",
    ariaLabel: "Status Applied",
  },
  messaged: {
    tone: "high_positive",
    selectClassName:
      "border-green-300 bg-green-50 text-green-800 dark:border-green-800/70 dark:bg-green-950/40 dark:text-green-200",
    dotClassName: "bg-green-600 dark:bg-green-400",
    ariaLabel: "Status Messaged",
  },
  interested: {
    tone: "moderate_positive",
    selectClassName:
      "border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800/70 dark:bg-teal-950/40 dark:text-teal-200",
    dotClassName: "bg-teal-600 dark:bg-teal-400",
    ariaLabel: "Status Interested",
  },
  not_reviewed: {
    tone: "neutral",
    selectClassName:
      "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/50 dark:text-slate-200",
    dotClassName: "bg-slate-500 dark:bg-slate-400",
    ariaLabel: "Status Not reviewed",
  },
  ignored: {
    tone: "muted",
    selectClassName:
      "border-zinc-300 bg-zinc-100 text-zinc-600 dark:border-zinc-700/70 dark:bg-zinc-900/60 dark:text-zinc-300",
    dotClassName: "bg-zinc-500 dark:bg-zinc-400",
    ariaLabel: "Status Ignored",
  },
};

export function isPostReviewStatus(value: unknown): value is PostReviewStatus {
  return (
    typeof value === "string" &&
    (POST_REVIEW_STATUS_VALUES as readonly string[]).includes(value)
  );
}

export function coercePostReviewStatus(value: unknown): PostReviewStatus {
  return isPostReviewStatus(value) ? value : "not_reviewed";
}
