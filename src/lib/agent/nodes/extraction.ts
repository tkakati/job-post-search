import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import type { AgentGraphState } from "@/lib/agent/state";
import { ExtractionOutputSchema } from "@/lib/schemas/contracts";
import type { LeadRecord, UnifiedLead } from "@/lib/types/contracts";
import { appendDebug } from "@/lib/agent/nodes/helpers";
import { env } from "@/lib/env";
import { emitDebugApiCall } from "@/lib/debug/api-call-sink";
import { buildExtractionPrompt } from "@/lib/agent/nodes/prompts/extraction-prompt";
import { canonicalLeadIdentity } from "@/lib/utils/lead-identity";
import { parseRawLocationText } from "@/lib/location/geo";
import { dbClient } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { inArray, or } from "drizzle-orm";
import {
  resolveLinkedinPostContext,
  type LinkedinPostContext,
} from "@/lib/linkedin/repost-context";

const MAX_EXTRACTION_BATCH_SIZE = 5;
const DEFAULT_EXTRACTION_BATCH_SIZE = 5;

function resolveExtractionBatchSize() {
  const raw = Number(process.env.EXTRACTION_BATCH_SIZE ?? DEFAULT_EXTRACTION_BATCH_SIZE);
  if (!Number.isFinite(raw)) return DEFAULT_EXTRACTION_BATCH_SIZE;
  const normalized = Math.trunc(raw);
  return Math.min(MAX_EXTRACTION_BATCH_SIZE, Math.max(1, normalized));
}

type RawPost = {
  sourceUrl: string;
  /** Search query text for this batch (for provenance / UI). */
  queryText: string;
  postUrl: string;
  primaryAuthorName: string | null;
  primaryAuthorProfileUrl: string | null;
  rawText: string;
  postedAt: string | null;
  metadata: Record<string, unknown>;
};

function toAuthorString(value: unknown): string | null {
  if (typeof value === "string") {
    const t = value.trim();
    return t ? t : null;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const direct =
      (typeof obj.name === "string" && obj.name) ||
      (typeof obj.fullName === "string" && obj.fullName) ||
      "";
    if (String(direct).trim()) return String(direct).trim();
    const first = typeof obj.firstName === "string" ? obj.firstName : "";
    const last = typeof obj.lastName === "string" ? obj.lastName : "";
    const combined = `${first} ${last}`.trim();
    return combined || null;
  }
  return null;
}

function authorProfileUrlFromRaw(raw: Record<string, unknown>): string | null {
  const direct = typeof raw.authorProfileUrl === "string" ? raw.authorProfileUrl.trim() : "";
  if (direct && /^https?:\/\//i.test(direct)) return direct;
  const author =
    raw.author && typeof raw.author === "object" ? (raw.author as Record<string, unknown>) : null;
  const fromAuthor =
    author && typeof author.profileUrl === "string" ? author.profileUrl.trim() : "";
  if (fromAuthor && /^https?:\/\//i.test(fromAuthor)) return fromAuthor;
  return null;
}

function dedupeRawPosts(posts: RawPost[]) {
  const seen = new Set<string>();
  const out: RawPost[] = [];
  for (const post of posts) {
    let canonicalPostUrl = post.postUrl.trim().toLowerCase();
    try {
      const u = new URL(post.postUrl);
      u.hash = "";
      u.search = "";
      canonicalPostUrl = u.toString().trim().toLowerCase();
    } catch {
      // keep best-effort raw url
    }
    const normalizedText = post.rawText.replace(/\s+/g, " ").trim().toLowerCase();
    const key = `${canonicalPostUrl}::${normalizedText.slice(0, 200).trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(post);
  }
  return out;
}

function dedupeExtractedByContent<
  T extends { url: string; role: string | null; location: string | null },
>(items: T[]) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = `${item.url.trim().toLowerCase()}::${(item.role ?? "").trim().toLowerCase()}::${(
      item.location ?? ""
    )
      .trim()
      .toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function percentile(values: number[], ratio: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * ratio)));
  return sorted[idx] ?? 0;
}

function toIsoOrNull(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function extractRawPosts(state: AgentGraphState): RawPost[] {
  const out: RawPost[] = [];
  const batches = state.searchResults?.rawSearchResults ?? [];
  for (const batch of batches) {
    for (const item of batch.items) {
      const raw = item as Record<string, unknown>;
      const storedPostContext = readStoredPostContext(raw);
      const postContext = storedPostContext ?? resolveLinkedinPostContext(raw);
      const postUrl =
        postContext.primaryPostUrl ??
        ((typeof raw.postUrl === "string" && raw.postUrl) ||
          (typeof raw.url === "string" && raw.url) ||
          "");
      if (!postUrl) continue;
      const rawText =
        postContext.primaryText ??
        ((typeof raw.text === "string" && raw.text.trim()) ||
          (typeof raw.description === "string" && raw.description.trim()) ||
          (typeof raw.title === "string" && raw.title.trim()) ||
          "");
      if (!rawText) continue;

      const postedAt =
        toIsoOrNull(raw.postedAtISO) ??
        toIsoOrNull(raw.postedAt) ??
        toIsoOrNull(
          raw.postedAtTimestamp ? new Date(Number(raw.postedAtTimestamp)).toISOString() : null,
        );

      out.push({
        sourceUrl: batch.sourceUrl,
        queryText: batch.queryText ?? "",
        postUrl,
        primaryAuthorName: postContext.primaryAuthorName,
        primaryAuthorProfileUrl: postContext.primaryAuthorProfileUrl,
        rawText,
        postedAt,
        metadata: {
          ...raw,
          postContext: {
            isRepost: postContext.isRepost,
            primaryPostUrl: postContext.primaryPostUrl,
            primaryAuthorName: postContext.primaryAuthorName,
            primaryAuthorProfileUrl: postContext.primaryAuthorProfileUrl,
            primaryText: postContext.primaryText,
            reposterAuthorName: postContext.reposterAuthorName,
            reposterAuthorProfileUrl: postContext.reposterAuthorProfileUrl,
            reposterText: postContext.reposterText,
          },
        },
      });
    }
  }
  return out;
}

function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function parseJsonFromText(text: string) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const objectMatch = trimmed.match(/\{[\s\S]*\}/);
    if (objectMatch) return JSON.parse(objectMatch[0]);
    const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
    if (arrayMatch) return JSON.parse(arrayMatch[0]);
    throw new Error("Failed to parse extraction JSON");
  }
}

function safeUrl(value: string, fallback: string) {
  try {
    return new URL(value).toString();
  } catch {
    return fallback;
  }
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v ? v : null;
}

function normalizeAuthorProfileForPrompt(raw: Record<string, unknown>): {
  email_ID: string | null;
  location: string | null;
  companyName: string | null;
  companyLinkedinUrl: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  headline: string | null;
  about: string | null;
  latestPositionTitle: string | null;
  latestPositionCompanyName: string | null;
} | null {
  const source =
    raw.authorProfile && typeof raw.authorProfile === "object"
      ? (raw.authorProfile as Record<string, unknown>)
      : null;
  if (!source) return null;
  return {
    email_ID: normalizeNullableString(source.email_ID),
    location: normalizeNullableString(source.location),
    companyName: normalizeNullableString(source.companyName),
    companyLinkedinUrl: normalizeNullableString(source.companyLinkedinUrl),
    city: normalizeNullableString(source.city),
    state: normalizeNullableString(source.state),
    country: normalizeNullableString(source.country),
    headline: normalizeNullableString(source.headline),
    about: normalizeNullableString(source.about),
    latestPositionTitle: normalizeNullableString(source.latestPositionTitle),
    latestPositionCompanyName: normalizeNullableString(source.latestPositionCompanyName),
  };
}

function readStoredPostContext(raw: Record<string, unknown>): LinkedinPostContext | null {
  const postContextRaw =
    raw.postContext && typeof raw.postContext === "object"
      ? (raw.postContext as Record<string, unknown>)
      : null;
  if (!postContextRaw) return null;
  return {
    isRepost: postContextRaw.isRepost === true,
    primaryPostUrl: normalizeNullableString(postContextRaw.primaryPostUrl),
    primaryAuthorName: normalizeNullableString(postContextRaw.primaryAuthorName),
    primaryAuthorProfileUrl: normalizeNullableString(postContextRaw.primaryAuthorProfileUrl),
    primaryText: normalizeNullableString(postContextRaw.primaryText),
    reposterAuthorName: normalizeNullableString(postContextRaw.reposterAuthorName),
    reposterAuthorProfileUrl: normalizeNullableString(postContextRaw.reposterAuthorProfileUrl),
    reposterText: normalizeNullableString(postContextRaw.reposterText),
  };
}

async function persistExtractedLeadEnrichment(leadsIn: LeadRecord[]) {
  if (leadsIn.length === 0) {
    return { attempted: 0, inserted: 0, skippedExisting: 0, updated: 0 };
  }

  const dedupedByCanonicalUrl = new Map<string, LeadRecord>();
  for (const lead of leadsIn) {
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
  const canonicalUrls = deduped.map((lead) => lead.canonicalUrl);
  const identityKeys = deduped.map((lead) => lead.identityKey);

  const db = dbClient();
  const existing = await db
    .select({
      canonicalUrl: leads.canonicalUrl,
      identityKey: leads.identityKey,
    })
    .from(leads)
    .where(
      or(inArray(leads.canonicalUrl, canonicalUrls), inArray(leads.identityKey, identityKeys)),
    );

  const existingByCanonicalUrl = new Map(existing.map((row) => [row.canonicalUrl, row]));
  const existingIdentityKeys = new Set(existing.map((row) => row.identityKey));
  const toInsert = deduped.filter(
    (lead) =>
      !existingByCanonicalUrl.has(lead.canonicalUrl) && !existingIdentityKeys.has(lead.identityKey),
  );
  const skippedExisting = deduped.length - toInsert.length;

  if (toInsert.length > 0) {
    await db
      .insert(leads)
      .values(
        toInsert.map((lead) => ({
          canonicalUrl: lead.canonicalUrl,
          identityKey: lead.identityKey,
          sourceType: lead.sourceType ?? "linkedin-content",
          titleOrRole: lead.titleOrRole,
          company: lead.company ?? null,
          location: lead.rawLocationText ?? null,
          normalizedLocationJson: lead.normalizedLocationJson ?? {
            locations: lead.locations ?? [],
          },
          employmentType: lead.employmentType ?? null,
          workMode: lead.workMode ?? null,
          author: lead.author ?? null,
          snippet: lead.snippet ?? null,
          fullText: lead.fullText ?? null,
          postedAt: lead.postedAt ? new Date(lead.postedAt) : null,
          fetchedAt: lead.fetchedAt ? new Date(lead.fetchedAt) : new Date(),
          roleEmbedding: lead.roleEmbedding ?? null,
          hiringIntentScore: lead.hiringIntentScore ?? null,
          leadScore: lead.leadScore ?? null,
          roleLocationKey: lead.roleLocationKey,
          sourceMetadataJson: lead.sourceMetadataJson ?? null,
        })),
      )
      .onConflictDoNothing();
  }

  return {
    attempted: deduped.length,
    inserted: toInsert.length,
    skippedExisting,
    updated: 0,
  };
}

function toLeadRecord(input: {
  extracted: {
    url: string;
    role: string | null;
    location: string | null;
    company: string | null;
    employmentType: "full-time" | "part-time" | "contract" | "internship" | null;
    yearsOfExperience: string | null;
    workMode: "onsite" | "hybrid" | "remote" | null;
    isHiring: boolean;
    authorTypeGuess: "hiring_manager" | "recruiter" | "unknown" | null;
    authorTypeReason: string | null;
    roleMatchScore: number;
    locationMatchScore: number;
  };
  post: RawPost;
  roleLocationKey: string;
  roleEmbedding?: number[] | null;
}): LeadRecord | null {
  const title = input.extracted.role ?? "";
  if (!title) return null;
  const identity = canonicalLeadIdentity({
    url: input.extracted.url || input.post.postUrl,
    titleOrRole: title,
    company: input.extracted.company,
    location: input.extracted.location,
  });
  const authorName =
    input.post.primaryAuthorName ??
    toAuthorString(input.post.metadata.author) ??
    toAuthorString(input.post.metadata.authorName);
  const authorProfileUrl =
    input.post.primaryAuthorProfileUrl ?? authorProfileUrlFromRaw(input.post.metadata);
  const authorProfile = normalizeAuthorProfileForPrompt(input.post.metadata);
  const storedPostContext = readStoredPostContext(input.post.metadata);
  const resolvedPostContext = storedPostContext ?? {
    isRepost: input.post.metadata.isRepost === true,
    primaryPostUrl: input.post.postUrl,
    primaryAuthorName: authorName,
    primaryAuthorProfileUrl: authorProfileUrl,
    primaryText: input.post.rawText,
    reposterAuthorName: toAuthorString(input.post.metadata.author),
    reposterAuthorProfileUrl: authorProfileUrlFromRaw(input.post.metadata),
    reposterText: normalizeNullableString(input.post.metadata.text),
  };
  const parsedLocations = parseRawLocationText(input.extracted.location);

  return {
    canonicalUrl: identity.canonicalUrl,
    identityKey: identity.identityKey,
    sourceType: "linkedin-content",
    titleOrRole: title,
    company: input.extracted.company,
    locations: parsedLocations,
    rawLocationText: input.extracted.location,
    normalizedLocationJson: {
      locations: parsedLocations,
    },
    employmentType: input.extracted.employmentType,
    workMode: input.extracted.workMode,
    author: authorName,
    snippet: input.post.rawText.slice(0, 400),
    fullText: input.post.rawText,
    postedAt: input.post.postedAt,
    fetchedAt: new Date().toISOString(),
    roleEmbedding: input.roleEmbedding ?? null,
    hiringIntentScore: input.extracted.isHiring ? 1 : 0,
    leadScore: null,
    roleLocationKey: input.roleLocationKey,
    sourceMetadataJson: {
      extraction: {
        role: input.extracted.role,
        location: input.extracted.location,
        company: input.extracted.company,
        employmentType: input.extracted.employmentType,
        yearsOfExperience: input.extracted.yearsOfExperience,
        workMode: input.extracted.workMode,
        isHiring: input.extracted.isHiring,
        authorTypeGuess: input.extracted.authorTypeGuess,
        authorTypeReason: input.extracted.authorTypeReason,
        authorStrengthScore: 0.5,
        // Keep author enrichment in extraction metadata for debug/UI display.
        email_ID: authorProfile?.email_ID ?? null,
        authorLocation: authorProfile?.location ?? null,
        authorCompanyLinkedinUrl: authorProfile?.companyLinkedinUrl ?? null,
        authorCompanyName: authorProfile?.companyName ?? null,
        authorCity: authorProfile?.city ?? null,
        authorState: authorProfile?.state ?? null,
        authorCountry: authorProfile?.country ?? null,
        authorHeadline: authorProfile?.headline ?? null,
        authorAbout: authorProfile?.about ?? null,
        authorLatestPositionTitle: authorProfile?.latestPositionTitle ?? null,
        authorLatestPositionCompanyName: authorProfile?.latestPositionCompanyName ?? null,
      },
      sourceUrl: input.post.sourceUrl,
      sourceQuery: input.post.queryText,
      authorProfileUrl,
      authorProfile,
      postContext: {
        isRepost: resolvedPostContext.isRepost,
        primaryPostUrl: resolvedPostContext.primaryPostUrl,
        primaryAuthorName: resolvedPostContext.primaryAuthorName,
        primaryAuthorProfileUrl: resolvedPostContext.primaryAuthorProfileUrl,
        primaryText: resolvedPostContext.primaryText,
        reposterAuthorName: resolvedPostContext.reposterAuthorName,
        reposterAuthorProfileUrl: resolvedPostContext.reposterAuthorProfileUrl,
        reposterText: resolvedPostContext.reposterText,
      },
    },
  };
}

export async function extractionNode(state: AgentGraphState) {
  const startedAt = Date.now();
  const rawPosts = dedupeRawPosts(extractRawPosts(state));
  if (!rawPosts.length) {
    const extractionResults = ExtractionOutputSchema.parse({
      roleLocationKey: state.roleLocationKey,
      iterationNumber: state.iteration,
      extractedLeads: [],
      leads: [],
      normalizedLeads: [],
      extractionDiagnostics: {
        postsProcessed: 0,
        successfullyExtracted: 0,
        skipped: 0,
        averageConfidence: 0,
        elapsedMs: Date.now() - startedAt,
        batches: [],
      },
    });
    return {
      extractionResults,
      debugLog: appendDebug(
        state,
        "extraction_node => processed=0, extracted=0, skipped=0, avgConfidence=0.00",
      ),
    };
  }

  const llm = env.OPENAI_API_KEY
    ? new ChatOpenAI({
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_CHAT_MODEL ?? "gpt-5.2",
        temperature: 0,
      })
    : null;

  const extractedLeads: Array<{
    url: string;
    role: string | null;
    location: string | null;
    company: string | null;
    employmentType: "full-time" | "part-time" | "contract" | "internship" | null;
    yearsOfExperience: string | null;
    workMode: "onsite" | "hybrid" | "remote" | null;
    isHiring: boolean;
    authorTypeGuess: "hiring_manager" | "recruiter" | "unknown" | null;
    authorTypeReason: string | null;
    roleMatchScore: number;
    locationMatchScore: number;
  }> = [];
  const extractedPairs: Array<{
    extracted: {
      url: string;
      role: string | null;
      location: string | null;
      company: string | null;
      employmentType: "full-time" | "part-time" | "contract" | "internship" | null;
      yearsOfExperience: string | null;
      workMode: "onsite" | "hybrid" | "remote" | null;
      isHiring: boolean;
      authorTypeGuess: "hiring_manager" | "recruiter" | "unknown" | null;
      authorTypeReason: string | null;
      roleMatchScore: number;
      locationMatchScore: number;
    };
    post: RawPost;
  }> = [];
  let skipped = 0;

  const extractionBatchSize = resolveExtractionBatchSize();
  const batches = chunk(rawPosts, extractionBatchSize);
  const llmModel = llm ? (env.OPENAI_CHAT_MODEL ?? "gpt-5.2") : null;
  const batchOutputs = await Promise.all(
    batches.map(async (batch, batchIndex) => {
      const batchStartedAt = Date.now();
      const indexed = batch.map((post, index) => ({
        index,
        url: post.postUrl,
        text: post.rawText,
        authorProfile: normalizeAuthorProfileForPrompt(post.metadata),
      }));

      let parsedItems: Array<{
        index: number;
        url: string;
        role: string | null;
        location: string | null;
        company: string | null;
        employmentType: "full-time" | "part-time" | "contract" | "internship" | null;
        yearsOfExperience: string | null;
        workMode: "onsite" | "hybrid" | "remote" | null;
        isHiring: boolean;
        authorTypeGuess: "hiring_manager" | "recruiter" | "unknown" | null;
        authorTypeReason: string | null;
      }> = [];
      const parsedByIndex = new Map<number, (typeof parsedItems)[number]>();

      if (llm) {
        try {
          const prompt = buildExtractionPrompt({
            userRole: state.role,
            userLocation: state.location,
            locationIsHardFilter: state.locationIsHardFilter,
            posts: indexed,
          });
          const response = await llm.invoke([new HumanMessage(prompt)]);
          const rawText = response.content?.toString() ?? "{}";
          emitDebugApiCall({
            node: "extraction_node",
            api: "OpenAI chat (extraction)",
            method: "POST",
            url: env.OPENAI_CHAT_MODEL ?? "gpt-5.2",
            input: {
              model: env.OPENAI_CHAT_MODEL ?? "gpt-5.2",
              promptChars: prompt.length,
              postCount: indexed.length,
            },
            output: {
              responseChars: rawText.length,
              textPreview: rawText.slice(0, 2000),
            },
          });
          const payload = parseJsonFromText(rawText) as {
            items?: Array<{
              index: number;
              url: string;
              role: string | null;
              location: string | null;
              company: string | null;
              employmentType: "full-time" | "part-time" | "contract" | "internship" | null;
              yearsOfExperience: string | null;
              workMode: "onsite" | "hybrid" | "remote" | null;
              isHiring: boolean;
              authorTypeGuess: "hiring_manager" | "recruiter" | "unknown" | null;
              authorTypeReason: string | null;
            }>;
          };
          parsedItems = Array.isArray(payload.items) ? payload.items : [];
          for (const item of parsedItems) {
            if (typeof item.index === "number") parsedByIndex.set(item.index, item);
          }
        } catch {
          parsedItems = [];
        }
      }

      if (!parsedItems.length) {
        const fallbackExtracted = batch.map((post) => {
          const extracted = {
            url: post.postUrl,
            role: null,
            location: null,
            company: null,
            employmentType: null,
            yearsOfExperience: null,
            workMode: null,
            isHiring: false,
            authorTypeGuess: null,
            authorTypeReason: null,
            roleMatchScore: 0,
            locationMatchScore: 0,
          };
          return { extracted, post };
        });
        return {
          extracted: fallbackExtracted,
          skipped: 0,
          meta: {
            batchIndex,
            inputCount: batch.length,
            inputSourceUrls: Array.from(new Set(batch.map((b) => b.sourceUrl))),
            inputPreview: batch.map((b) => b.rawText.slice(0, 120)),
            inputs: batch.map((post, idx) => ({
              inputIndex: idx,
              inputUrl: post.postUrl,
              inputText: post.rawText.slice(0, 200),
              role: null,
              location: null,
              company: null,
              employmentType: null,
              yearsOfExperience: null,
              workMode: null,
              isHiring: false,
              authorTypeGuess: null,
              authorTypeReason: null,
              roleMatchScore: 0,
              locationMatchScore: 0,
            })),
            elapsedMs: Date.now() - batchStartedAt,
            usedLlm: false,
            llmModel,
          },
        };
      }

      const extracted: Array<{
        extracted: {
          url: string;
          role: string | null;
          location: string | null;
          company: string | null;
          employmentType: "full-time" | "part-time" | "contract" | "internship" | null;
          yearsOfExperience: string | null;
          workMode: "onsite" | "hybrid" | "remote" | null;
          isHiring: boolean;
          authorTypeGuess: "hiring_manager" | "recruiter" | "unknown" | null;
          authorTypeReason: string | null;
          roleMatchScore: number;
          locationMatchScore: number;
        };
        post: RawPost;
      }> = [];
      let skippedInBatch = 0;
      for (const item of parsedItems) {
        const post = batch[item.index];
        if (!post) {
          skippedInBatch += 1;
          continue;
        }
        const normalized = {
          url: safeUrl(item.url || post.postUrl, post.postUrl),
          role: normalizeNullableString(item.role),
          location: normalizeNullableString(item.location),
          company: normalizeNullableString(item.company),
          employmentType:
            item.employmentType === "full-time" ||
            item.employmentType === "part-time" ||
            item.employmentType === "contract" ||
            item.employmentType === "internship"
              ? item.employmentType
              : null,
          yearsOfExperience: normalizeNullableString(item.yearsOfExperience),
          workMode:
            item.workMode === "onsite" || item.workMode === "hybrid" || item.workMode === "remote"
              ? item.workMode
              : null,
          isHiring: Boolean(item.isHiring),
          authorTypeGuess:
            item.authorTypeGuess === "hiring_manager" ||
            item.authorTypeGuess === "recruiter" ||
            item.authorTypeGuess === "unknown"
              ? item.authorTypeGuess
              : null,
          authorTypeReason: normalizeNullableString(item.authorTypeReason),
          roleMatchScore: 0,
          locationMatchScore: 0,
        };
        extracted.push({ extracted: normalized, post });
      }
      return {
        extracted,
        skipped: skippedInBatch,
        meta: {
          batchIndex,
          inputCount: batch.length,
          inputSourceUrls: Array.from(new Set(batch.map((b) => b.sourceUrl))),
          inputPreview: batch.map((b) => b.rawText.slice(0, 120)),
          inputs: batch.map((post, idx) => {
            const parsed = parsedByIndex.get(idx);
            return {
              inputIndex: idx,
              inputUrl: post.postUrl,
              inputText: post.rawText.slice(0, 200),
              role: normalizeNullableString(parsed?.role),
              location: normalizeNullableString(parsed?.location),
              company: normalizeNullableString(parsed?.company),
              employmentType:
                parsed?.employmentType === "full-time" ||
                parsed?.employmentType === "part-time" ||
                parsed?.employmentType === "contract" ||
                parsed?.employmentType === "internship"
                  ? parsed.employmentType
                  : null,
              yearsOfExperience: normalizeNullableString(parsed?.yearsOfExperience),
              workMode:
                parsed?.workMode === "onsite" ||
                parsed?.workMode === "hybrid" ||
                parsed?.workMode === "remote"
                  ? parsed.workMode
                  : null,
              isHiring: Boolean(parsed?.isHiring),
              authorTypeGuess:
                parsed?.authorTypeGuess === "hiring_manager" ||
                parsed?.authorTypeGuess === "recruiter" ||
                parsed?.authorTypeGuess === "unknown"
                  ? parsed.authorTypeGuess
                  : null,
              authorTypeReason: normalizeNullableString(parsed?.authorTypeReason),
              roleMatchScore: 0,
              locationMatchScore: 0,
            };
          }),
          elapsedMs: Date.now() - batchStartedAt,
          usedLlm: Boolean(llm),
          llmModel,
        },
      };
    }),
  );

  for (const out of batchOutputs) {
    skipped += out.skipped;
    for (const pair of out.extracted) {
      extractedLeads.push(pair.extracted);
      extractedPairs.push(pair);
    }
  }

  const normalizedLeads = extractedPairs
    .map(({ extracted, post }) =>
      toLeadRecord({
        extracted,
        post,
        roleLocationKey: state.roleLocationKey,
      }),
    )
    .filter((lead): lead is LeadRecord => lead !== null);
  const dedupedNormalizedLeads = Array.from(
    new Map(normalizedLeads.map((lead) => [lead.canonicalUrl, lead])).values(),
  );
  const dedupedExtractedLeads = dedupeExtractedByContent(extractedLeads);
  const persistenceSummary = await persistExtractedLeadEnrichment(dedupedNormalizedLeads);

  const avgScore =
    extractedLeads.length > 0
      ? extractedLeads.reduce((acc, x) => acc + (x.roleMatchScore + x.locationMatchScore) / 2, 0) /
        extractedLeads.length
      : 0;

  const extractionResults = ExtractionOutputSchema.parse({
    roleLocationKey: state.roleLocationKey,
    iterationNumber: state.iteration,
    extractedLeads: dedupedExtractedLeads,
    leads: dedupedExtractedLeads.map(
      (lead): UnifiedLead => ({
        url: lead.url,
        role: lead.role,
        location: lead.location,
        company: lead.company,
        employmentType: lead.employmentType ?? null,
        yearsOfExperience: lead.yearsOfExperience ?? null,
        workMode: lead.workMode ?? null,
        isHiring: lead.isHiring,
        roleMatchScore: lead.roleMatchScore,
        locationMatchScore: lead.locationMatchScore,
        rawText: "",
        score: 0,
      }),
    ),
    normalizedLeads: dedupedNormalizedLeads,
    extractionDiagnostics: {
      postsProcessed: rawPosts.length,
      successfullyExtracted: dedupedExtractedLeads.filter(
        (x) => x.role !== null || x.company !== null || x.location !== null || x.isHiring,
      ).length,
      skipped,
      averageConfidence: clamp01(
        dedupedExtractedLeads.length > 0
          ? dedupedExtractedLeads.reduce(
              (acc, x) => acc + (x.roleMatchScore + x.locationMatchScore) / 2,
              0,
            ) / dedupedExtractedLeads.length
          : avgScore,
      ),
      elapsedMs: Date.now() - startedAt,
      batches: batchOutputs.map((b) => b.meta),
    },
  });

  const topRank = dedupedNormalizedLeads
    .slice(0, 20)
    .map((lead) => lead.titleOrRole)
    .join(" | ");
  const authorTypeGuessStats = dedupedNormalizedLeads.reduce(
    (acc, lead) => {
      const extraction =
        lead.sourceMetadataJson &&
        typeof lead.sourceMetadataJson === "object" &&
        typeof (lead.sourceMetadataJson as Record<string, unknown>).extraction === "object"
          ? ((lead.sourceMetadataJson as Record<string, unknown>).extraction as Record<
              string,
              unknown
            >)
          : null;
      const guess =
        extraction?.authorTypeGuess === "hiring_manager" ||
        extraction?.authorTypeGuess === "recruiter" ||
        extraction?.authorTypeGuess === "unknown"
          ? extraction.authorTypeGuess
          : "unknown";
      acc[guess] += 1;
      if (typeof extraction?.authorTypeReason === "string" && extraction.authorTypeReason.trim()) {
        acc.withReason += 1;
      }
      return acc;
    },
    {
      hiring_manager: 0,
      recruiter: 0,
      unknown: 0,
      withReason: 0,
    },
  );
  const batchElapsedMs = batchOutputs.map((b) => b.meta.elapsedMs).filter((value) => value >= 0);
  const extractionLatencyP50 = percentile(batchElapsedMs, 0.5);
  const extractionLatencyP90 = percentile(batchElapsedMs, 0.9);

  return {
    extractionResults,
    debugLog: appendDebug(
      state,
      `extraction_node => processed=${rawPosts.length}, batchSize=${extractionBatchSize}, extracted=${dedupedExtractedLeads.filter((x) => x.role !== null || x.company !== null || x.location !== null || x.isHiring).length}, deduped=${extractedLeads.length - dedupedExtractedLeads.length}, skipped=${skipped}, avgConfidence=${clamp01(
        dedupedExtractedLeads.length > 0
          ? dedupedExtractedLeads.reduce(
              (acc, x) => acc + (x.roleMatchScore + x.locationMatchScore) / 2,
              0,
            ) / dedupedExtractedLeads.length
          : avgScore,
      ).toFixed(
        2,
      )}, latency_ms={p50:${extractionLatencyP50}, p90:${extractionLatencyP90}}, author_guess_stats={hiring_manager:${authorTypeGuessStats.hiring_manager}, recruiter:${authorTypeGuessStats.recruiter}, unknown:${authorTypeGuessStats.unknown}, with_reason:${authorTypeGuessStats.withReason}}, persisted=${persistenceSummary.attempted} (inserted=${persistenceSummary.inserted}, skippedExisting=${persistenceSummary.skippedExisting}, updated=${persistenceSummary.updated}), top=[${topRank}]`,
    ),
  };
}
