import type { LocationDisplayOutput } from "@/lib/location/display";
import { formatScore, type AuthorTypeLabel } from "@/lib/post-feed/formatters";

type SourceBadge = "retrieved" | "fresh" | "both" | null | undefined;

type BuildPostCardDisplayInput = {
  title?: string | null;
  company?: string | null;
  locationDisplay: LocationDisplayOutput;
  postAuthor?: string | null;
  authorHeadline?: string | null;
  authorTypeLabel: AuthorTypeLabel;
  leadScore?: number | null;
  sourceBadge?: SourceBadge;
  isNew?: boolean;
};

export type PostCardTagTone =
  | "green"
  | "yellow"
  | "red"
  | "blue"
  | "purple"
  | "gray"
  | "soft-gray"
  | "orange"
  | "neutral";

export type PostCardDisplayTag = {
  key: "match_strength" | "author_type" | "new";
  label: string;
  tone: PostCardTagTone;
};

export type PostCardDisplayModel = {
  score: {
    pillLabel: string;
    numericLabel: string;
    isMissing: boolean;
  };
  roleCompany: {
    title: string;
    company: string;
  };
  location: {
    tokens: string[];
    preview: string;
    full: string;
    omittedCount: number;
    hasAny: boolean;
  };
  author: {
    name: string;
    headline: string | null;
  };
  tags: PostCardDisplayTag[];
};

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toCompanyDisplayText(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) return "Company: Unknown";
  if (/^company\s*:/i.test(normalized)) return normalized;
  return `Company: ${normalized}`;
}

function dedupeLocationTokens(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function deriveLocationTokens(locationDisplay: LocationDisplayOutput): string[] {
  const fromParsed = dedupeLocationTokens(
    Array.isArray(locationDisplay.parsedLocations)
      ? locationDisplay.parsedLocations
          .map((loc) => normalizeText(loc.raw) ?? "")
          .filter((value) => value.length > 0)
      : [],
  );
  if (fromParsed.length > 0) return fromParsed;

  const fallback = normalizeText(locationDisplay.full ?? locationDisplay.rawLocationText);
  if (fallback) return [fallback];
  return [];
}

export function buildPostCardDisplayModel(input: BuildPostCardDisplayInput): PostCardDisplayModel {
  const locationTokens = deriveLocationTokens(input.locationDisplay);
  const visibleTokens = locationTokens.slice(0, 3);
  const omittedCount = Math.max(0, locationTokens.length - visibleTokens.length);
  const locationPreview =
    locationTokens.length === 0
      ? "Location not specified"
      : omittedCount > 0
        ? `${visibleTokens.join(" • ")} • +${omittedCount} more`
        : locationTokens.join(" • ");
  const locationFull =
    locationTokens.length > 0 ? locationTokens.join(" • ") : "Location not specified";

  const title = normalizeText(input.title) ?? "Untitled role";
  const company = toCompanyDisplayText(input.company);
  const authorName = normalizeText(input.postAuthor) ?? "Unknown author";
  const authorHeadline = normalizeText(input.authorHeadline);
  const scoreValue = formatScore(input.leadScore);
  const scoreMissing = scoreValue === "n/a";

  const tags: PostCardDisplayTag[] = [];
  if (typeof input.leadScore === "number" && Number.isFinite(input.leadScore)) {
    if (input.leadScore >= 0.8) {
      tags.push({ key: "match_strength", label: "Strong Match", tone: "green" });
    } else if (input.leadScore >= 0.6) {
      tags.push({ key: "match_strength", label: "Medium Match", tone: "yellow" });
    } else {
      tags.push({ key: "match_strength", label: "Weak Match", tone: "red" });
    }
  }

  if (input.authorTypeLabel === "Hiring Manager") {
    tags.push({
      key: "author_type",
      label: "Hiring Manager",
      tone: "blue",
    });
  } else if (input.authorTypeLabel === "Recruiter") {
    tags.push({
      key: "author_type",
      label: "Recruiter",
      tone: "purple",
    });
  } else {
    tags.push({
      key: "author_type",
      label: "Unknown",
      tone: "soft-gray",
    });
  }

  if (input.isNew) {
    tags.push({ key: "new", label: "New", tone: "orange" });
  }

  return {
    score: {
      pillLabel: scoreMissing ? "unscored" : scoreValue,
      numericLabel: scoreMissing ? "n/a" : scoreValue,
      isMissing: scoreMissing,
    },
    roleCompany: {
      title,
      company,
    },
    location: {
      tokens: visibleTokens,
      preview: locationPreview,
      full: locationFull,
      omittedCount,
      hasAny: locationTokens.length > 0,
    },
    author: {
      name: authorName,
      headline: authorHeadline,
    },
    tags: tags.slice(0, 4),
  };
}
