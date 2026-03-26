export type AuthorTypeLabel = "Hiring Manager" | "Recruiter" | "Unknown";

export type AuthorTypeGuess = "hiring_manager" | "recruiter" | "unknown";

type StrictAuthorClassificationInput = {
  postCompany?: string | null;
  latestPositionTitle?: string | null;
  latestPositionCompanyName?: string | null;
  headline?: string | null;
  about?: string | null;
  postText?: string | null;
};

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePositionTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const RECRUITER_KEYWORDS = [
  "recruiter",
  "talent acquisition",
  "talent partner",
  "sourcer",
  "staffing",
];

const HIRING_MANAGER_KEYWORDS = ["manager", "head", "director", "vp", "chief", "lead", "founder"];

const HIRING_INTENT_PATTERNS = [
  /\bmy team is hiring\b/i,
  /\bwe(?:\s+are|['’]re)\s+hiring\b/i,
  /\bhiring for\b/i,
  /\blooking for\b/i,
  /\bopening applications?\b/i,
  /\bapplications?\s+open\b/i,
];

function combineDesignationText(input: StrictAuthorClassificationInput): string | null {
  const chunks = [
    normalizeText(input.latestPositionTitle),
    normalizeText(input.headline),
    normalizeText(input.about),
  ].filter((value): value is string => Boolean(value));
  if (chunks.length === 0) return null;
  return normalizePositionTitle(chunks.join(" "));
}

export function hasHiringIntentPhrase(postText: string | null | undefined): boolean {
  const normalized = normalizeText(postText);
  if (!normalized) return false;
  return HIRING_INTENT_PATTERNS.some((pattern) => pattern.test(normalized));
}

function inferDesignationType(
  input: StrictAuthorClassificationInput,
): "hiring_manager" | "recruiter" | "unknown" {
  const designationText = combineDesignationText(input);
  if (!designationText) return "unknown";

  const isRecruiter = RECRUITER_KEYWORDS.some((keyword) => designationText.includes(keyword));
  if (isRecruiter) return "recruiter";

  const isHiringManager = HIRING_MANAGER_KEYWORDS.some((keyword) =>
    designationText.includes(keyword),
  );
  if (isHiringManager) return "hiring_manager";

  return "unknown";
}

export function mapAuthorTypeGuessToLabel(
  guess: AuthorTypeGuess | null | undefined,
): AuthorTypeLabel {
  if (guess === "hiring_manager") return "Hiring Manager";
  if (guess === "recruiter") return "Recruiter";
  return "Unknown";
}

export function parseAuthorTypeGuess(value: unknown): AuthorTypeGuess | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "hiring_manager" || normalized === "recruiter" || normalized === "unknown") {
    return normalized;
  }
  return null;
}

export function resolveAuthorType(
  input: StrictAuthorClassificationInput & {
    llmAuthorTypeGuess?: unknown;
  },
): {
  authorType: AuthorTypeLabel;
  source: "deterministic" | "llm_fallback" | "unknown";
  hasHiringPhrase: boolean;
} {
  const hasPhrase = hasHiringIntentPhrase(input.postText);
  if (!hasPhrase) {
    return {
      authorType: "Unknown",
      source: "unknown",
      hasHiringPhrase: false,
    };
  }

  const designationType = inferDesignationType(input);
  if (designationType === "hiring_manager") {
    return {
      authorType: "Hiring Manager",
      source: "deterministic",
      hasHiringPhrase: true,
    };
  }
  if (designationType === "recruiter") {
    return {
      authorType: "Recruiter",
      source: "deterministic",
      hasHiringPhrase: true,
    };
  }

  const llmGuess = parseAuthorTypeGuess(input.llmAuthorTypeGuess);
  const llmLabel = mapAuthorTypeGuessToLabel(llmGuess);
  if (llmLabel !== "Unknown") {
    return {
      authorType: llmLabel,
      source: "llm_fallback",
      hasHiringPhrase: true,
    };
  }

  return {
    authorType: "Unknown",
    source: "unknown",
    hasHiringPhrase: true,
  };
}

export function classifyAuthorTypeStrict(input: StrictAuthorClassificationInput): AuthorTypeLabel {
  return resolveAuthorType(input).authorType;
}

export function authorStrengthScoreFromType(authorType: AuthorTypeLabel): number {
  if (authorType === "Hiring Manager") return 1.0;
  if (authorType === "Recruiter") return 0.75;
  return 0.5;
}
