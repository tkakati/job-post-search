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

export function isPostReviewStatus(value: unknown): value is PostReviewStatus {
  return (
    typeof value === "string" &&
    (POST_REVIEW_STATUS_VALUES as readonly string[]).includes(value)
  );
}

export function coercePostReviewStatus(value: unknown): PostReviewStatus {
  return isPostReviewStatus(value) ? value : "not_reviewed";
}
