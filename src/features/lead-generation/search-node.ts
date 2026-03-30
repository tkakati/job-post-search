import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { AgentGraphState } from "@/lib/agent/state";
import type {
  LeadRecord,
  QueryPerformanceSummary,
  SearchOutput,
} from "@/lib/types/contracts";
import type { ProviderRawResult } from "@/lib/search/provider";
import { canonicalLeadIdentity, canonicalizeLeadUrl } from "@/lib/utils/lead-identity";
import { parseRawLocationText } from "@/lib/location/geo";
import { dbClient } from "@/lib/db";
import { resolveLinkedinPostContext } from "@/lib/linkedin/repost-context";
import {
  generatedQueries as generatedQueriesTable,
  leads,
  queryPerformance,
} from "@/lib/db/schema";
import {
  runApifyLinkedinContentDebug,
} from "@/lib/search/providers/apify-linkedin-content-provider";
import { env } from "@/lib/env";
import { emitDebugApiCall, redactApifyUrl } from "@/lib/debug/api-call-sink";

const LINKEDIN_PROFILE_SCRAPER_ACTOR = "harvestapi/linkedin-profile-scraper";
const PROFILE_SCRAPER_MODE = "Profile details + email search ($10 per 1k)";
type AuthorProfileRecord = Record<string, string | null>;

function toAuthorString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const direct =
      (typeof obj.name === "string" && obj.name) ||
      (typeof obj.fullName === "string" && obj.fullName) ||
      "";
    if (direct.trim()) return direct.trim();
    const first = typeof obj.firstName === "string" ? obj.firstName : "";
    const last = typeof obj.lastName === "string" ? obj.lastName : "";
    const combined = `${first} ${last}`.trim();
    return combined || null;
  }
  return null;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readPostContextFromMetadata(
  metadata: unknown,
): {
  primaryAuthorName: string | null;
  primaryAuthorProfileUrl: string | null;
} | null {
  if (!metadata || typeof metadata !== "object") return null;
  const postContextRaw =
    typeof (metadata as Record<string, unknown>).postContext === "object"
      ? ((metadata as Record<string, unknown>).postContext as Record<string, unknown>)
      : null;
  if (!postContextRaw) return null;
  return {
    primaryAuthorName: readString(postContextRaw.primaryAuthorName),
    primaryAuthorProfileUrl: readString(postContextRaw.primaryAuthorProfileUrl),
  };
}

function readNestedString(value: unknown, path: string[]): string | null {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== "object") return null;
    current = (current as Record<string, unknown>)[key];
  }
  return readString(current);
}

function asObjectEntries(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(
      (entry): entry is Record<string, unknown> =>
        Boolean(entry) && typeof entry === "object",
    );
  }
  if (value && typeof value === "object") return [value as Record<string, unknown>];
  return [];
}

function readPositionTitle(entry: Record<string, unknown>): string | null {
  return (
    readString(entry.position) ??
    readString(entry.title) ??
    readString(entry.jobTitle) ??
    readNestedString(entry, ["position", "title"])
  );
}

function readPositionCompany(entry: Record<string, unknown>): string | null {
  return (
    readString(entry.companyName) ??
    readString(entry.company) ??
    readString(entry.organizationName) ??
    readNestedString(entry, ["company", "name"])
  );
}

function isLikelyCurrentExperience(entry: Record<string, unknown>): boolean {
  const explicitCurrent =
    entry.isCurrent === true ||
    entry.current === true ||
    entry.isPresent === true ||
    entry.present === true;
  if (explicitCurrent) return true;

  const endDateText =
    readString(entry.endDate) ??
    readString(entry.end) ??
    readString(entry.to) ??
    readNestedString(entry, ["dateRange", "end"]) ??
    readNestedString(entry, ["date", "to"]);
  if (!endDateText) return true;
  return /(present|current|now)/i.test(endDateText);
}

function extractLatestPositionEntry(
  row: Record<string, unknown>,
): Record<string, unknown> | null {
  const currentPositionEntries = asObjectEntries(row.currentPosition);
  if (currentPositionEntries.length > 0) {
    const firstCurrent = currentPositionEntries[0];
    const hasAnyValue = Boolean(
      readPositionTitle(firstCurrent) || readPositionCompany(firstCurrent),
    );
    if (hasAnyValue) return firstCurrent;
  }

  const experienceEntries = asObjectEntries(row.experience).filter((entry) =>
    Boolean(readPositionTitle(entry) || readPositionCompany(entry)),
  );
  if (experienceEntries.length === 0) return null;

  const preferredCurrent = experienceEntries.find((entry) =>
    isLikelyCurrentExperience(entry),
  );
  return preferredCurrent ?? experienceEntries[0];
}

function extractLatestPositionTitle(row: Record<string, unknown>): string | null {
  const entry = extractLatestPositionEntry(row);
  if (!entry) return null;
  return readPositionTitle(entry);
}

function extractLatestPositionCompanyName(
  row: Record<string, unknown>,
): string | null {
  const entry = extractLatestPositionEntry(row);
  if (!entry) return null;
  return readPositionCompany(entry);
}

function normalizeLinkedinProfileUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    u.hash = "";
    // miniProfileUrn and other params are not identity; strip query for dedupe.
    u.search = "";
    // Normalize host/path casing shape and trailing slash.
    u.hostname = u.hostname.toLowerCase();
    u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return url.trim().toLowerCase();
  }
}

function extractLinkedinProfileSlug(url: string): string | null {
  try {
    const u = new URL(url.trim());
    const parts = u.pathname
      .toLowerCase()
      .split("/")
      .filter(Boolean);
    const inIdx = parts.indexOf("in");
    if (inIdx >= 0 && parts[inIdx + 1]) return parts[inIdx + 1];
    return null;
  } catch {
    const m = url.toLowerCase().match(/linkedin\.com\/in\/([^/?#]+)/);
    return m?.[1] ?? null;
  }
}

function resolveRequestedProfileUrl(
  requestedUrls: readonly string[],
  matchedNormalizedUrl: string,
): string | null {
  if (requestedUrls.includes(matchedNormalizedUrl)) return matchedNormalizedUrl;
  const slug = extractLinkedinProfileSlug(matchedNormalizedUrl);
  if (!slug) return null;
  return (
    requestedUrls.find((candidate) => extractLinkedinProfileSlug(candidate) === slug) ??
    null
  );
}

function toAuthorProfileRecord(row: Record<string, unknown>): AuthorProfileRecord {
  const readFirstEmail = (value: unknown): string | null => {
    if (typeof value === "string") return readString(value);
    if (!Array.isArray(value)) return null;
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const email = readString((item as Record<string, unknown>).email);
      if (email) return email;
    }
    return null;
  };

  const firstCurrentPosition =
    Array.isArray(row.currentPosition) && row.currentPosition.length > 0
      ? (row.currentPosition[0] as Record<string, unknown>)
      : null;
  const firstExperience =
    Array.isArray(row.experience) && row.experience.length > 0
      ? (row.experience[0] as Record<string, unknown>)
      : null;

  return {
    email_ID: readString(row.email_ID) ?? readFirstEmail(row.emails),
    location:
      readString(row.location) ??
      readNestedString(row.location, ["parsed", "text"]) ??
      readNestedString(row.location, ["linkedinText"]),
    companyLinkedinUrl:
      readString(row.companyLinkedinUrl) ??
      readString(firstCurrentPosition?.companyLinkedinUrl) ??
      readString(firstExperience?.companyLinkedinUrl),
    companyName:
      readString(row.companyName) ??
      readString(firstCurrentPosition?.companyName) ??
      readString(firstExperience?.companyName),
    city: readString(row.city) ?? readNestedString(row.location, ["parsed", "city"]),
    state: readString(row.state) ?? readNestedString(row.location, ["parsed", "state"]),
    country:
      readString(row.country) ??
      readNestedString(row.location, ["parsed", "country"]) ??
      readNestedString(row.location, ["parsed", "countryFull"]),
    headline: readString(row.headline),
    about: readString(row.about),
    latestPositionTitle: extractLatestPositionTitle(row),
    latestPositionCompanyName: extractLatestPositionCompanyName(row),
  };
}

function readProfileScraperMaxChargeUsd(): string | null {
  const raw = process.env.APIFY_PROFILE_SCRAPER_MAX_TOTAL_CHARGE_USD;
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return String(parsed);
}

function buildProfileScraperEndpoint(
  apiToken: string,
  limit: number,
): string {
  const params = new URLSearchParams({
    token: apiToken,
    clean: "true",
    limit: String(limit),
    maxItems: String(limit),
  });
  const maxChargeUsd = readProfileScraperMaxChargeUsd();
  if (maxChargeUsd) {
    params.set("maxTotalChargeUsd", maxChargeUsd);
  }
  return `https://api.apify.com/v2/acts/${encodeURIComponent(
    LINKEDIN_PROFILE_SCRAPER_ACTOR,
  )}/run-sync-get-dataset-items?${params.toString()}`;
}

function resolveOriginalAuthorProfileUrl(
  post: Record<string, unknown>,
): string | null {
  const postContext = resolveLinkedinPostContext(post);
  const contextProfileUrl = postContext.primaryAuthorProfileUrl;
  if (contextProfileUrl && /linkedin\.com\/in\//i.test(contextProfileUrl)) {
    return normalizeLinkedinProfileUrl(contextProfileUrl);
  }

  const authorTypeRaw =
    readString(post.authorType) ??
    readString(post.author_type) ??
    (post.author && typeof post.author === "object"
      ? readString((post.author as Record<string, unknown>).type)
      : null);
  const authorType = authorTypeRaw?.toLowerCase() ?? null;
  // Company pages should not be resolved via profile scraper.
  if (authorType === "company") return null;

  const isRepost = post.isRepost === true;
  const resharedPost =
    post.resharedPost && typeof post.resharedPost === "object"
      ? (post.resharedPost as Record<string, unknown>)
      : null;
  const resharedAuthorTypeRaw =
    resharedPost
      ? readString(resharedPost.authorType) ??
        readString(resharedPost.author_type) ??
        (resharedPost.author && typeof resharedPost.author === "object"
          ? readString((resharedPost.author as Record<string, unknown>).type)
          : null)
      : null;
  const resharedAuthorType = resharedAuthorTypeRaw?.toLowerCase() ?? null;

  if (isRepost && resharedPost) {
    if (resharedAuthorType === "company") return null;
    const originalAuthorProfileUrl = readString(resharedPost.authorProfileUrl);
    if (originalAuthorProfileUrl) {
      return normalizeLinkedinProfileUrl(originalAuthorProfileUrl);
    }
  }
  const fallback = readString(post.authorProfileUrl);
  return fallback ? normalizeLinkedinProfileUrl(fallback) : null;
}

async function fetchLinkedinProfilesBatch(profileUrls: string[]) {
  if (profileUrls.length === 0) return new Map<string, AuthorProfileRecord | null>();
  if (!env.APIFY_API_TOKEN) {
    return new Map<string, AuthorProfileRecord | null>();
  }
  const maxTotalChargeUsd = readProfileScraperMaxChargeUsd();
  const endpoint = buildProfileScraperEndpoint(env.APIFY_API_TOKEN, profileUrls.length);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      profileScraperMode: PROFILE_SCRAPER_MODE,
      queries: profileUrls,
    }),
  });
  if (!response.ok) {
    const errBody = await response.text().catch(() => "");
    emitDebugApiCall({
      node: "search",
      api: "Apify linkedin-profile-scraper (run-sync)",
      method: "POST",
      url: redactApifyUrl(endpoint),
      input: {
        actor: LINKEDIN_PROFILE_SCRAPER_ACTOR,
        profileCount: profileUrls.length,
        queries: profileUrls,
        maxTotalChargeUsd: maxTotalChargeUsd ?? "unset",
      },
      output: {
        status: response.status,
        errorPreview: errBody.slice(0, 800),
      },
    });
    throw new Error(`profile_scraper_batch_status_${response.status}`);
  }
  const json = (await response.json()) as unknown;
  const items = Array.isArray(json) ? json : [];
  const result = new Map<string, AuthorProfileRecord | null>();

  for (const url of profileUrls) result.set(url, null);

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const matchedUrlRaw =
      readString(row.query) ??
      readString(row.profileUrl) ??
      readString(row.linkedinUrl) ??
      readString(row.url);
    if (!matchedUrlRaw) continue;
    const matchedUrl = normalizeLinkedinProfileUrl(matchedUrlRaw);
    const resolvedRequestedUrl = resolveRequestedProfileUrl(profileUrls, matchedUrl);
    if (!resolvedRequestedUrl) continue;
    result.set(resolvedRequestedUrl, toAuthorProfileRecord(row));
  }

  let missingUrls = profileUrls.filter((url) => result.get(url) == null);
  emitDebugApiCall({
    node: "search",
    api: "Apify linkedin-profile-scraper (run-sync)",
    method: "POST",
    url: redactApifyUrl(endpoint),
    input: {
      actor: LINKEDIN_PROFILE_SCRAPER_ACTOR,
      profileCount: profileUrls.length,
      queries: profileUrls,
      retryMode: "missing_single_retry",
      maxTotalChargeUsd: maxTotalChargeUsd ?? "unset",
    },
    output: {
      status: response.status,
      itemCount: items.length,
      resolvedCount: profileUrls.length - missingUrls.length,
      missingCount: missingUrls.length,
    },
  });

  const retryResults = await Promise.all(
    missingUrls.map(async (profileUrl) => {
      const singleEndpoint = buildProfileScraperEndpoint(env.APIFY_API_TOKEN!, 1);

      try {
        const singleRes = await fetch(singleEndpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profileScraperMode: PROFILE_SCRAPER_MODE,
            queries: [profileUrl],
          }),
        });
        if (!singleRes.ok) {
          const errBody = await singleRes.text().catch(() => "");
          emitDebugApiCall({
            node: "search",
            api: "Apify linkedin-profile-scraper (single retry)",
            method: "POST",
            url: redactApifyUrl(singleEndpoint),
            input: {
              actor: LINKEDIN_PROFILE_SCRAPER_ACTOR,
              query: profileUrl,
              maxTotalChargeUsd: maxTotalChargeUsd ?? "unset",
            },
            output: {
              status: singleRes.status,
              errorPreview: errBody.slice(0, 800),
            },
          });
          return [profileUrl, null] as const;
        }

        const singleJson = (await singleRes.json()) as unknown;
        const singleItems = Array.isArray(singleJson) ? singleJson : [];
        let resolvedProfile: AuthorProfileRecord | null = null;
        for (const entry of singleItems) {
          if (!entry || typeof entry !== "object") continue;
          const row = entry as Record<string, unknown>;
          const matchedUrlRaw =
            readString(row.query) ??
            readString(row.profileUrl) ??
            readString(row.linkedinUrl) ??
            readString(row.url);
          if (!matchedUrlRaw) continue;
          const matchedNormalized = normalizeLinkedinProfileUrl(matchedUrlRaw);
          const resolvedRequestedUrl = resolveRequestedProfileUrl(
            [profileUrl],
            matchedNormalized,
          );
          if (!resolvedRequestedUrl) continue;
          resolvedProfile = toAuthorProfileRecord(row);
          break;
        }

        emitDebugApiCall({
          node: "search",
          api: "Apify linkedin-profile-scraper (single retry)",
          method: "POST",
          url: redactApifyUrl(singleEndpoint),
          input: {
            actor: LINKEDIN_PROFILE_SCRAPER_ACTOR,
            query: profileUrl,
            maxTotalChargeUsd: maxTotalChargeUsd ?? "unset",
          },
          output: {
            status: singleRes.status,
            itemCount: singleItems.length,
            resolved: resolvedProfile != null,
          },
        });

        return [profileUrl, resolvedProfile] as const;
      } catch (error) {
        emitDebugApiCall({
          node: "search",
          api: "Apify linkedin-profile-scraper (single retry)",
          method: "POST",
          input: {
            actor: LINKEDIN_PROFILE_SCRAPER_ACTOR,
            query: profileUrl,
            maxTotalChargeUsd: maxTotalChargeUsd ?? "unset",
          },
          output: {
            error:
              error instanceof Error ? error.message : "single_retry_unknown_error",
          },
        });
        return [profileUrl, null] as const;
      }
    }),
  );
  for (const [profileUrl, profile] of retryResults) {
    if (profile) result.set(profileUrl, profile);
  }

  missingUrls = profileUrls.filter((url) => result.get(url) == null);
  if (missingUrls.length > 0) {
    emitDebugApiCall({
      node: "search",
      api: "Apify linkedin-profile-scraper (retry summary)",
      method: "INFO",
      input: {
        actor: LINKEDIN_PROFILE_SCRAPER_ACTOR,
        requestedCount: profileUrls.length,
        maxTotalChargeUsd: maxTotalChargeUsd ?? "unset",
      },
      output: {
        unresolvedCount: missingUrls.length,
        unresolvedQueries: missingUrls,
      },
    });
  }

  return result;
}

async function enrichPostsWithAuthorProfiles(
  posts: Array<Record<string, unknown>>,
  profileCacheByUrl?: Map<string, AuthorProfileRecord | null>,
): Promise<Array<Record<string, unknown> & { authorProfile: AuthorProfileRecord | null }>> {
  const profileByUrl =
    profileCacheByUrl ?? new Map<string, AuthorProfileRecord | null>();
  const profileUrlByIndex = posts.map((post) => resolveOriginalAuthorProfileUrl(post));
  const uniqueProfileUrls = Array.from(
    new Set(profileUrlByIndex.filter((url): url is string => Boolean(url))),
  );
  const uncachedProfileUrls = uniqueProfileUrls.filter((url) => !profileByUrl.has(url));

  if (uncachedProfileUrls.length > 0) {
    try {
      const profilesByUrl = await fetchLinkedinProfilesBatch(uncachedProfileUrls);
      for (const url of uncachedProfileUrls) {
        profileByUrl.set(url, profilesByUrl.get(url) ?? null);
      }
    } catch {
      for (const url of uncachedProfileUrls) {
        profileByUrl.set(url, null);
      }
    }
  }

  return posts.map((post, index) => {
    const url = profileUrlByIndex[index];
    return {
      ...(post as Record<string, unknown>),
      authorProfile: url ? (profileByUrl.get(url) ?? null) : null,
    };
  });
}

async function runApifyLinkedInSearch(input: {
  queryText: string;
  sourceUrl: string;
}) {
  if (!env.APIFY_AGENT_ENABLED) {
    throw new Error(
      "APIFY_AGENT_ENABLED=false. Agent search is blocked to prevent spend. Set APIFY_AGENT_ENABLED=true in .env.local to enable.",
    );
  }
  // Explicit probe-style call per URL.
  return runApifyLinkedinContentDebug({
    sourceUrl: input.sourceUrl,
    queryText: input.queryText,
    maxPayloadAttempts: 1,
    strictCostMode: true,
  });
}

function readNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function staticExtractionFromRaw(input: {
  raw: ProviderRawResult;
  authorProfile?: Record<string, unknown> | null;
}) {
  const authorProfile = input.authorProfile ?? null;
  return {
    role: input.raw.titleOrRole ?? null,
    location: input.raw.location ?? null,
    company: input.raw.company ?? null,
    employmentType: null,
    yearsOfExperience: null,
    workMode: null,
    isHiring: Boolean(input.raw.hiringIntentScore && input.raw.hiringIntentScore > 0.5),
    authorStrengthScore: 0.5,
    email_ID: readNullableString(authorProfile?.email_ID),
    authorLocation: readNullableString(authorProfile?.location),
    authorCompanyName: readNullableString(authorProfile?.companyName),
    authorCompanyLinkedinUrl: readNullableString(authorProfile?.companyLinkedinUrl),
    authorCity: readNullableString(authorProfile?.city),
    authorState: readNullableString(authorProfile?.state),
    authorCountry: readNullableString(authorProfile?.country),
    authorHeadline: readNullableString(authorProfile?.headline),
    authorAbout: readNullableString(authorProfile?.about),
    authorLatestPositionTitle: readNullableString(authorProfile?.latestPositionTitle),
    authorLatestPositionCompanyName: readNullableString(
      authorProfile?.latestPositionCompanyName,
    ),
  };
}

export function normalizeRawResultToLead(input: {
  roleLocationKey: string;
  raw: ProviderRawResult;
}): LeadRecord | null {
  if (!input.raw.url || !input.raw.titleOrRole) return null;
  const identity = canonicalLeadIdentity({
    url: input.raw.url,
    titleOrRole: input.raw.titleOrRole,
    company: input.raw.company,
    location: input.raw.location,
  });

  const postContext = readPostContextFromMetadata(input.raw.metadata);
  return {
    canonicalUrl: identity.canonicalUrl,
    identityKey: identity.identityKey,
    sourceType: "linkedin-content",
    titleOrRole: input.raw.titleOrRole.trim(),
    company: input.raw.company ?? null,
    locations: parseRawLocationText(input.raw.location ?? null),
    rawLocationText: input.raw.location ?? null,
    normalizedLocationJson: {
      locations: parseRawLocationText(input.raw.location ?? null),
    },
    employmentType: null,
    workMode: null,
    author: postContext?.primaryAuthorName ?? input.raw.author ?? null,
    snippet: input.raw.snippet ?? null,
    fullText: input.raw.fullText ?? null,
    postedAt: input.raw.postedAt ?? null,
    fetchedAt: new Date().toISOString(),
    roleEmbedding: null,
    hiringIntentScore: input.raw.hiringIntentScore ?? null,
    leadScore: null,
    roleLocationKey: input.roleLocationKey,
    sourceMetadataJson: {
      ...(input.raw.metadata ?? {}),
      authorProfileUrl:
        postContext?.primaryAuthorProfileUrl ??
        (typeof input.raw.metadata?.authorProfileUrl === "string"
          ? input.raw.metadata.authorProfileUrl
          : null),
      extraction: staticExtractionFromRaw({ raw: input.raw }),
    },
  };
}

function averageQuality(leadsIn: LeadRecord[]) {
  const vals = leadsIn
    .map((lead) => lead.hiringIntentScore ?? 0)
    .filter((v) => Number.isFinite(v));
  if (vals.length === 0) return 0;
  return vals.reduce((acc, v) => acc + v, 0) / vals.length;
}

export function summarizeQueryPerformance(input: {
  roleLocationKey: string;
  queryText: string;
  totalResults: number;
  usableResults: number;
  newLeadContributions: number;
  normalizedLeadsForQuery: LeadRecord[];
}): QueryPerformanceSummary {
  return {
    roleLocationKey: input.roleLocationKey,
    queryText: input.queryText,
    totalRuns: 1,
    totalResults: input.totalResults,
    totalUsableResults: input.usableResults,
    totalNewLeadContributions: input.newLeadContributions,
    avgQuality: averageQuality(input.normalizedLeadsForQuery),
  };
}

async function computePotentialNewLeadContributions(input: {
  queryRows: Array<{
    queryText: string;
    queryKind: "explore" | "exploit";
    isExplore: boolean;
    sourceUrl: string;
    rawItems: ProviderRawResult[];
    normalized: LeadRecord[];
  }>;
}) {
  const db = dbClient();
  const allNormalized = input.queryRows.flatMap((q) => q.normalized);
  const dedupedByCanonicalUrl = new Map<string, LeadRecord>();
  for (const lead of allNormalized) {
    if (!dedupedByCanonicalUrl.has(lead.canonicalUrl)) {
      dedupedByCanonicalUrl.set(lead.canonicalUrl, lead);
    }
  }
  const dedupedByIdentity = new Map<string, LeadRecord>();
  for (const lead of dedupedByCanonicalUrl.values()) {
    if (!dedupedByIdentity.has(lead.identityKey)) {
      dedupedByIdentity.set(lead.identityKey, lead);
    }
  }
  const deduped = Array.from(dedupedByIdentity.values());

  if (deduped.length === 0) {
    return {
      newLeadContributionsByQuery: new Map<string, number>(),
    };
  }

  const canonicalUrls = deduped.map((lead) => lead.canonicalUrl);
  const identityKeys = deduped.map((lead) => lead.identityKey);
  const existing = await db
    .select({
      id: leads.id,
      canonicalUrl: leads.canonicalUrl,
      identityKey: leads.identityKey,
    })
    .from(leads)
    .where(
      or(
        inArray(leads.canonicalUrl, canonicalUrls),
        inArray(leads.identityKey, identityKeys),
      ),
    );
  const existingCanonicalSet = new Set(existing.map((row) => row.canonicalUrl));
  const existingIdentitySet = new Set(existing.map((row) => row.identityKey));

  const toInsert = deduped.filter(
    (lead) =>
      !existingCanonicalSet.has(lead.canonicalUrl) &&
      !existingIdentitySet.has(lead.identityKey),
  );
  const insertedCanonicalUrls = new Set(toInsert.map((lead) => lead.canonicalUrl));

  const newLeadContributionsByQuery = new Map<string, number>();
  for (const q of input.queryRows) {
    const queryUniqueCanonicalUrls = new Set(q.normalized.map((lead) => lead.canonicalUrl));
    let contributed = 0;
    for (const canonicalUrl of queryUniqueCanonicalUrls) {
      if (insertedCanonicalUrls.has(canonicalUrl)) {
        contributed += 1;
      }
    }
    newLeadContributionsByQuery.set(q.queryText, contributed);
  }

  return {
    newLeadContributionsByQuery,
  };
}

async function updateQueryPerformanceSummaries(
  summaries: QueryPerformanceSummary[],
) {
  if (summaries.length === 0) return;
  const db = dbClient();

  for (const summary of summaries) {
    await db
      .insert(queryPerformance)
      .values({
        roleLocationKey: summary.roleLocationKey,
        queryText: summary.queryText,
        totalRuns: summary.totalRuns,
        totalResults: summary.totalResults,
        totalUsableResults: summary.totalUsableResults,
        totalNewLeadContributions: summary.totalNewLeadContributions,
        avgQuality: summary.avgQuality,
      })
      .onConflictDoUpdate({
        target: [queryPerformance.roleLocationKey, queryPerformance.queryText],
        set: {
          totalRuns: sql`"query_performance"."total_runs" + excluded."total_runs"`,
          totalResults: sql`"query_performance"."total_results" + excluded."total_results"`,
          totalUsableResults: sql`"query_performance"."total_usable_results" + excluded."total_usable_results"`,
          totalNewLeadContributions: sql`"query_performance"."total_new_lead_contributions" + excluded."total_new_lead_contributions"`,
          avgQuality: sql`CASE
            WHEN ("query_performance"."total_runs" + excluded."total_runs") = 0 THEN excluded."avg_quality"
            ELSE (
              ("query_performance"."avg_quality" * "query_performance"."total_runs") +
              (excluded."avg_quality" * excluded."total_runs")
            ) / ("query_performance"."total_runs" + excluded."total_runs")
          END`,
          updatedAt: sql`now()`,
        },
      });
  }
}

async function markGeneratedQueryPerformance(input: {
  searchRunId: number | null;
  iteration: number;
  roleLocationKey: string;
  summaries: QueryPerformanceSummary[];
}) {
  if (!input.searchRunId) return;
  const db = dbClient();
  for (const s of input.summaries) {
    await db
      .update(generatedQueriesTable)
      .set({
        performanceJson: {
          roleLocationKey: s.roleLocationKey,
          totalResults: s.totalResults,
          usableResults: s.totalUsableResults,
          newLeadContributions: s.totalNewLeadContributions,
          avgQuality: s.avgQuality,
        },
      })
      .where(
        and(
          eq(generatedQueriesTable.searchRunId, input.searchRunId),
          eq(generatedQueriesTable.iterationNumber, input.iteration),
          eq(generatedQueriesTable.roleLocationKey, input.roleLocationKey),
          eq(generatedQueriesTable.queryText, s.queryText),
        ),
      );
  }
}

export async function runSearchNode(input: {
  state: AgentGraphState;
}): Promise<SearchOutput> {
  const startedAt = Date.now();
  const state = input.state;
  const generated = state.generatedQueries?.generatedQueries ?? [];

  const rawSearchResults: SearchOutput["rawSearchResults"] = [];
  const queryRows: Array<{
    queryText: string;
    queryKind: "explore" | "exploit";
    isExplore: boolean;
    sourceUrl: string;
    apifyRawItems: Array<Record<string, unknown>>;
    rawItems: ProviderRawResult[];
    normalized: LeadRecord[];
  }> = [];
  const queryErrors: Array<{ queryText: string; error: string }> = [];
  const apifyAttemptsByQuery: Array<{
    queryText: string;
    attempts: Array<{
      payloadKeys: string[];
      status: number;
      errorPreview?: string;
      success: boolean;
    }>;
    selectedPayloadKeys: string[];
    datasetId: string | null;
    strictCostMode: boolean;
  }> = [];
  const profileEnrichmentCacheByUrl = new Map<string, AuthorProfileRecord | null>();
  const queryFanoutStartedAt = Date.now();
  const perQueryRuns = await Promise.all(
    generated.map(async (q) => {
      const apifyStartedAt = Date.now();
      try {
        const out = await runApifyLinkedInSearch({
          queryText: q.queryText,
          sourceUrl: q.sourceUrl,
        });
        return {
          queryText: q.queryText,
          sourceUrl: q.sourceUrl,
          rawItems: out.rawItems,
          normalizedItems: out.normalizedItems,
          attempts: out.attempts,
          selectedPayloadKeys: out.selectedPayloadKeys,
          datasetId: out.datasetId,
          strictCostMode: Boolean(out.strictCostMode),
          apifyCallMs: Date.now() - apifyStartedAt,
          error: null as string | null,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "provider_execute_failed";
        return {
          queryText: q.queryText,
          sourceUrl: q.sourceUrl,
          rawItems: [] as Array<Record<string, unknown>>,
          normalizedItems: [] as ProviderRawResult[],
          attempts: [] as Array<{
            payloadKeys: string[];
            status: number;
            errorPreview?: string;
            success: boolean;
          }>,
          selectedPayloadKeys: [] as string[],
          datasetId: null as string | null,
          strictCostMode: true,
          apifyCallMs: Date.now() - apifyStartedAt,
          error: message,
        };
      }
    }),
  );
  const queryFanoutMs = Date.now() - queryFanoutStartedAt;
  const totalApifyCallTime = perQueryRuns.reduce(
    (sum, run) => sum + run.apifyCallMs,
    0,
  );
  for (const run of perQueryRuns) {
    if (run.error) {
      queryErrors.push({ queryText: run.queryText, error: run.error });
    }
  }

  const shouldSkipProfileEnrichmentForFastFirstFresh =
    state.iteration === 0 && state.searchResults == null;
  const profileEnrichmentStartedAt = Date.now();
  const allRawPostsWithRunIndex = perQueryRuns.flatMap((run, runIndex) =>
    run.rawItems.map((post) => ({ runIndex, post })),
  );
  const enrichedGlobalRawItems = shouldSkipProfileEnrichmentForFastFirstFresh
    ? allRawPostsWithRunIndex.map((entry) => ({
        ...(entry.post as Record<string, unknown>),
        authorProfile: null,
      }))
    : await enrichPostsWithAuthorProfiles(
        allRawPostsWithRunIndex.map((entry) => entry.post),
        profileEnrichmentCacheByUrl,
      );
  const profileEnrichmentMs = Date.now() - profileEnrichmentStartedAt;
  const profileEnrichmentAttempted = shouldSkipProfileEnrichmentForFastFirstFresh
    ? 0
    : allRawPostsWithRunIndex.length;
  const profileEnrichmentSucceeded = shouldSkipProfileEnrichmentForFastFirstFresh
    ? 0
    : enrichedGlobalRawItems.filter(
    (post) => post.authorProfile && typeof post.authorProfile === "object",
      ).length;
  const enrichedRawItemsByRunIndex = new Map<
    number,
    Array<Record<string, unknown> & { authorProfile: AuthorProfileRecord | null }>
  >();
  for (let index = 0; index < allRawPostsWithRunIndex.length; index += 1) {
    const runIndex = allRawPostsWithRunIndex[index]?.runIndex;
    const enrichedItem = enrichedGlobalRawItems[index];
    if (runIndex == null || !enrichedItem) continue;
    const existing = enrichedRawItemsByRunIndex.get(runIndex);
    if (existing) {
      existing.push(enrichedItem);
      continue;
    }
    enrichedRawItemsByRunIndex.set(runIndex, [enrichedItem]);
  }

  for (let runIndex = 0; runIndex < generated.length; runIndex += 1) {
    const q = generated[runIndex];
    if (!q) continue;
    const run = perQueryRuns[runIndex];
    const apifyRawItems = run?.rawItems ?? [];
    const enrichedRawItems = enrichedRawItemsByRunIndex.get(runIndex) ?? [];
    const rawItems = run?.normalizedItems ?? [];
    const authorProfileByCanonicalUrl = new Map<string, Record<string, unknown>>();
    for (const rawPost of enrichedRawItems) {
      const postContext = resolveLinkedinPostContext(rawPost);
      const primaryPostUrl = postContext.primaryPostUrl;
      const rawPostUrl =
        (typeof rawPost["postUrl"] === "string" && rawPost["postUrl"].trim()) ||
        (typeof rawPost["url"] === "string" && rawPost["url"].trim()) ||
        "";
      const profile =
        rawPost.authorProfile && typeof rawPost.authorProfile === "object"
          ? (rawPost.authorProfile as Record<string, unknown>)
          : null;
      if (!profile) continue;

      const candidateUrls = [rawPostUrl, primaryPostUrl].filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      );
      for (const candidateUrl of candidateUrls) {
        authorProfileByCanonicalUrl.set(canonicalizeLeadUrl(candidateUrl), profile);
      }
    }

    rawSearchResults.push({
      queryText: q.queryText,
      sourceUrl: q.sourceUrl,
      provider: "apify-linkedin-content",
      items: enrichedRawItems,
    });

    // Probe-style execution: no search-node normalization/deduping.
    // We only shape provider results into LeadRecord fields for downstream contracts.
    const normalized = rawItems.map((raw): LeadRecord => {
      const identity = canonicalLeadIdentity({
        url: raw.url,
        titleOrRole: raw.titleOrRole,
        company: raw.company,
        location: raw.location,
      });
      const postContext = readPostContextFromMetadata(raw.metadata);
      return {
        canonicalUrl: identity.canonicalUrl,
        identityKey: identity.identityKey,
        sourceType: "linkedin-content",
        titleOrRole: raw.titleOrRole,
        company: raw.company ?? null,
        locations: parseRawLocationText(raw.location ?? null),
        rawLocationText: raw.location ?? null,
        normalizedLocationJson: {
          locations: parseRawLocationText(raw.location ?? null),
        },
        employmentType: null,
        workMode: null,
        author: postContext?.primaryAuthorName ?? toAuthorString(raw.author),
        snippet: raw.snippet ?? null,
        fullText: raw.fullText ?? null,
        postedAt: raw.postedAt ?? null,
        fetchedAt: new Date().toISOString(),
        roleEmbedding: null,
        hiringIntentScore: raw.hiringIntentScore ?? null,
        leadScore: null,
        roleLocationKey: state.roleLocationKey,
        sourceMetadataJson: {
          ...(raw.metadata ?? {}),
          authorProfileUrl:
            postContext?.primaryAuthorProfileUrl ??
            (typeof raw.metadata?.authorProfileUrl === "string"
              ? raw.metadata.authorProfileUrl
              : null),
          extraction: staticExtractionFromRaw({
            raw,
            authorProfile: authorProfileByCanonicalUrl.get(identity.canonicalUrl) ?? null,
          }),
        },
      };
    });

    queryRows.push({
      queryText: q.queryText,
      queryKind: q.queryKind,
      isExplore: q.isExplore,
      sourceUrl: q.sourceUrl,
      apifyRawItems,
      rawItems,
      normalized,
    });

    apifyAttemptsByQuery.push({
      queryText: q.queryText,
      attempts: run?.attempts ?? [],
      selectedPayloadKeys: run?.selectedPayloadKeys ?? [],
      datasetId: run?.datasetId ?? null,
      strictCostMode: run?.strictCostMode ?? true,
    });
  }

  const noRawResults = queryRows.every((q) => q.apifyRawItems.length === 0);

  const normalizedAll = queryRows.flatMap((q) => q.normalized);
  const resultsFetched = rawSearchResults.reduce((acc, r) => acc + r.items.length, 0);
  const resultsKept = normalizedAll.length;
  const dedupedCount = 0;
  const persistenceStartedAt = Date.now();
  const { newLeadContributionsByQuery } =
    await computePotentialNewLeadContributions({
      queryRows,
    });
  const persistedLeadIds: number[] = [];

  const queryPerformanceSummary = queryRows.map((q) =>
    summarizeQueryPerformance({
      roleLocationKey: state.roleLocationKey,
      queryText: q.queryText,
      totalResults: q.rawItems.length,
      usableResults: q.normalized.length,
      newLeadContributions: newLeadContributionsByQuery.get(q.queryText) ?? 0,
      normalizedLeadsForQuery: q.normalized,
    }),
  );

  await updateQueryPerformanceSummaries(queryPerformanceSummary);
  await markGeneratedQueryPerformance({
    searchRunId: state.searchRunId ?? null,
    iteration: state.iteration,
    roleLocationKey: state.roleLocationKey,
    summaries: queryPerformanceSummary,
  });
  const persistenceUpdateMs = Date.now() - persistenceStartedAt;

  const elapsedMs = Date.now() - startedAt;
  return {
    roleLocationKey: state.roleLocationKey,
    iterationNumber: state.iteration,
    rawSearchResults,
    normalizedSearchResults: normalizedAll,
    persistedLeadIds,
    queryPerformanceSummary,
    diagnostics: {
      provider: "apify-linkedin-content",
      totalRawResults: resultsFetched,
      totalNormalizedResults: normalizedAll.length,
      dedupedResults: normalizedAll.length,
      persistedLeadCount: 0,
      elapsedMs,
    },
    searchDiagnostics: {
      apifyCallTime: totalApifyCallTime,
      totalFetched: resultsFetched,
      totalKept: resultsKept,
      resultsFetched,
      resultsKept,
      dedupedCount,
      queryFanoutMs,
      profileEnrichmentMs,
      persistenceUpdateMs,
    },
    leads: normalizedAll,
    providerMetadataJson: {
      provider: "apify-linkedin-content",
      batchedActorRun: false,
      queriesUsed: queryRows.map((q) => ({ queryText: q.queryText, sourceUrl: q.sourceUrl })),
      queryCount: queryRows.length,
      queryPerformanceUpdatedCount: queryPerformanceSummary.length,
      totalRawResultBatches: rawSearchResults.length,
      apifyAttemptsByQuery,
      resultsFetched,
      iterationMetrics: {
        iteration: state.iteration,
        searchLatencyMs: elapsedMs,
        searchCalls: queryRows.length,
        results: resultsKept,
        queryFanoutMs,
        profileEnrichmentMs,
        persistenceUpdateMs,
      },
      queryErrors,
      profileEnrichment: {
        attempted: profileEnrichmentAttempted,
        succeeded: profileEnrichmentSucceeded,
        skippedForFastFirstFresh: shouldSkipProfileEnrichmentForFastFirstFresh,
      },
      fallbackUsed: noRawResults,
    },
  };
}
