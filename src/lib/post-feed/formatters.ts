import { formatLeadLocationDisplay, type LocationDisplayOutput } from "@/lib/location/display";
import type { LeadLocation } from "@/lib/types/contracts";
import { resolveAuthorType, type AuthorTypeLabel } from "@/lib/author/classification";
export type { AuthorTypeLabel } from "@/lib/author/classification";

type PostFeedLeadLike = {
  locations?: LeadLocation[] | null;
  rawLocationText?: string | null;
  location?: string | null;
  jobLocation?: string | null;
  postedAt?: string | null;
  workMode?: string | null;
  employmentType?: string | null;
  sourceMetadataJson?: Record<string, unknown> | null;
  authorHeadline?: string | null;
  authorType?: string | null;
};

type FormatLocationsInput = {
  locations?: LeadLocation[] | null;
  rawLocationText?: string | null;
  location?: string | null;
  jobLocation?: string | null;
};

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toDisplayLabel(value: string | null | undefined): string {
  const normalized = normalizeText(value);
  if (!normalized) return "Unknown";
  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatLocations(
  input: FormatLocationsInput,
  options?: { maxVisible?: number },
): LocationDisplayOutput {
  return formatLeadLocationDisplay({
    locations: input.locations ?? null,
    rawLocationText: input.rawLocationText ?? null,
    location: input.location ?? input.jobLocation ?? null,
    maxVisible: options?.maxVisible,
  });
}

export function formatAuthorType(lead: {
  sourceMetadataJson?: Record<string, unknown> | null;
  company?: string | null;
  fullText?: string | null;
  snippet?: string | null;
}): AuthorTypeLabel {
  const extraction =
    lead.sourceMetadataJson?.extraction && typeof lead.sourceMetadataJson.extraction === "object"
      ? (lead.sourceMetadataJson.extraction as Record<string, unknown>)
      : null;
  const authorProfile =
    lead.sourceMetadataJson?.authorProfile &&
    typeof lead.sourceMetadataJson.authorProfile === "object"
      ? (lead.sourceMetadataJson.authorProfile as Record<string, unknown>)
      : null;
  return resolveAuthorType({
    postCompany: lead.company ?? null,
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
  }).authorType;
}

export function formatPostedAt(lead: Pick<PostFeedLeadLike, "postedAt">): string {
  const value = normalizeText(lead.postedAt);
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toISOString().slice(0, 10);
}

export function formatScore(value?: number | null): string {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(3) : "n/a";
}

export function formatWorkMode(lead: Pick<PostFeedLeadLike, "workMode">): string {
  return toDisplayLabel(lead.workMode);
}

export function formatEmploymentType(lead: Pick<PostFeedLeadLike, "employmentType">): string {
  return toDisplayLabel(lead.employmentType);
}
