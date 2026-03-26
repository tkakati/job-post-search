import { canonicalizeLeadUrl } from "@/lib/utils/lead-identity";

function normalizeLoose(value?: string | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeUrlForDedupe(inputUrl: string): string {
  const canonical = canonicalizeLeadUrl(inputUrl).trim();
  try {
    const url = new URL(canonical);
    url.hash = "";
    // For dedupe purposes, query params are not identity for lead posts.
    url.search = "";
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }
    return url.toString();
  } catch {
    return canonical.toLowerCase();
  }
}

function extractLinkedInActivityId(inputUrl: string): string | null {
  try {
    const url = new URL(inputUrl);
    const host = url.hostname.toLowerCase();
    if (!host.endsWith("linkedin.com")) return null;

    const direct = url.searchParams.get("activityId");
    if (direct && /^\d+$/.test(direct)) return direct;

    const path = decodeURIComponent(url.pathname).toLowerCase();
    const fromFeedUpdate = path.match(/\/feed\/update\/urn:li:(?:activity|share):(\d+)/);
    if (fromFeedUpdate?.[1]) return fromFeedUpdate[1];

    const fromPosts = path.match(/\/posts\/[^/?#]*?activity-(\d+)/);
    if (fromPosts?.[1]) return fromPosts[1];

    return null;
  } catch {
    return null;
  }
}

export function leadDedupKey(input: {
  canonicalUrl?: string | null;
  titleOrRole?: string | null;
  company?: string | null;
  rawLocationText?: string | null;
}): string {
  const rawUrl = (input.canonicalUrl ?? "").trim();
  if (rawUrl) {
    const normalizedUrl = normalizeUrlForDedupe(rawUrl);
    const activityId = extractLinkedInActivityId(normalizedUrl);
    if (activityId) return `linkedin-activity:${activityId}`;
    return `url:${normalizedUrl}`;
  }

  return `semantic:${normalizeLoose(input.titleOrRole)}|${normalizeLoose(input.company)}|${normalizeLoose(input.rawLocationText)}`;
}

export function leadRichnessScore(input: {
  sourceMetadataJson?: Record<string, unknown> | null;
  snippet?: string | null;
  fullText?: string | null;
  leadScore?: number | null;
  company?: string | null;
  rawLocationText?: string | null;
  author?: string | null;
}): number {
  let score = 0;

  if (typeof input.leadScore === "number") score += 10;
  if ((input.fullText ?? "").trim().length > 0) score += 2;
  if ((input.snippet ?? "").trim().length > 0) score += 1;
  if ((input.company ?? "").trim().length > 0) score += 1;
  if ((input.rawLocationText ?? "").trim().length > 0) score += 1;
  if ((input.author ?? "").trim().length > 0) score += 1;

  const meta =
    input.sourceMetadataJson && typeof input.sourceMetadataJson === "object"
      ? input.sourceMetadataJson
      : null;
  const extraction =
    meta?.extraction && typeof meta.extraction === "object"
      ? (meta.extraction as Record<string, unknown>)
      : null;
  const authorProfile =
    meta?.authorProfile && typeof meta.authorProfile === "object"
      ? (meta.authorProfile as Record<string, unknown>)
      : null;

  if (extraction) {
    if (typeof extraction.email_ID === "string" && extraction.email_ID.trim()) score += 3;
    if (typeof extraction.authorLocation === "string" && extraction.authorLocation.trim())
      score += 1;
    if (
      typeof extraction.authorCompanyLinkedinUrl === "string" &&
      extraction.authorCompanyLinkedinUrl.trim()
    ) {
      score += 1;
    }
  }

  if (authorProfile) {
    if (typeof authorProfile.email_ID === "string" && authorProfile.email_ID.trim()) score += 3;
    if (typeof authorProfile.location === "string" && authorProfile.location.trim()) score += 1;
    if (
      typeof authorProfile.companyLinkedinUrl === "string" &&
      authorProfile.companyLinkedinUrl.trim()
    ) {
      score += 1;
    }
  }

  return score;
}
