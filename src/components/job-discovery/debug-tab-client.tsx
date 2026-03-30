"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DebugRunOutput } from "@/lib/types/api";
import { readApiErrorMessage } from "@/lib/client/api-error";
import { summarizeUiError } from "@/lib/client/error-presentation";
import { AgentGraphDiagram } from "@/components/job-discovery/agent-graph-diagram";
import { Check, Copy, Pause, Play, SkipBack, SkipForward, X } from "lucide-react";
import { formatLeadLocationDisplay } from "@/lib/location/display";
import { PostCard } from "@/components/job-discovery/post-card";
import {
  formatAuthorType,
  formatLocations,
  type AuthorTypeLabel,
} from "@/lib/post-feed/formatters";
import {
  extractJobCountries,
  resolveDisplayCompany,
  resolveExtractedCompany,
} from "@/lib/post-feed/company-resolution";
import { isLeadCountryEligibleForUser } from "@/lib/location/country-eligibility";
import {
  coercePostReviewStatus,
  isPostReviewStatus,
  type PostReviewStatus,
} from "@/lib/post-feed/status";
import { dedupeRedundantLeads } from "@/lib/leads/redundancy";
import { classifyMatchStrength } from "@/lib/scoring/thresholds";

const STAGES = [
  "planning_phase",
  "execution_routing",
  "retrieval_arm",
  "query_generation",
  "search",
  "extraction_node",
  "combined_result",
  "scoring_node",
  "final_response_generation",
];

const FALLBACK_GRAPH = {
  nodes: ["START", ...STAGES, "END"],
  edges: [
    { source: "START", target: "planning_phase", conditional: false },
    { source: "planning_phase", target: "execution_routing", conditional: false },
    { source: "execution_routing", target: "retrieval_arm", conditional: true },
    { source: "execution_routing", target: "query_generation", conditional: true },
    { source: "retrieval_arm", target: "query_generation", conditional: true },
    { source: "retrieval_arm", target: "combined_result", conditional: true },
    { source: "query_generation", target: "search", conditional: false },
    { source: "search", target: "extraction_node", conditional: false },
    { source: "extraction_node", target: "combined_result", conditional: false },
    { source: "combined_result", target: "scoring_node", conditional: false },
    { source: "scoring_node", target: "planning_phase", conditional: true },
    {
      source: "scoring_node",
      target: "final_response_generation",
      conditional: true,
    },
    {
      source: "final_response_generation",
      target: "END",
      conditional: false,
    },
  ],
};

type FinalLeadCard = {
  leadId?: number;
  identityKey?: string | null;
  title: string;
  company?: string | null;
  location?: string | null;
  locations?: Array<{
    raw: string;
    city: string | null;
    state: string | null;
    country: string | null;
    lat: number | null;
    lon: number | null;
  }>;
  rawLocationText?: string | null;
  canonicalUrl: string;
  postUrl?: string;
  generatedQuery?: string;
  postAuthor?: string | null;
  postAuthorUrl?: string | null;
  jobTitle?: string;
  jobLocation?: string | null;
  score?: number | null;
  freshness?: "retrieved" | "fresh" | "both";
  snippet?: string | null;
  sourceBadge?: "retrieved" | "fresh" | "both";
  qualityBadge?: "high" | "medium" | "low" | "unscored";
  isNewForUser?: boolean;
  newBadge?: "new";
  postedAt?: string | null;
  workMode?: "onsite" | "hybrid" | "remote" | null;
  employmentType?: "full-time" | "part-time" | "contract" | "internship" | null;
  sourceMetadataJson?: Record<string, unknown> | null;
};

type InterimFinalResponse = {
  leads?: FinalLeadCard[];
  summary?: string;
  totalCounts?: {
    retrieved?: number;
    generated?: number;
    merged?: number;
    newForUser?: number;
  };
};
type LiveLogEntry = {
  timestamp: string;
  node: string;
  iteration: number;
  message: string;
};

type GraphSequenceEvent = {
  step: number;
  node: string;
  phase: "started" | "completed";
  log: string;
};

type LiveApiCallRow = {
  id: number;
  at: string;
  node: string;
  api: string;
  method: string;
  url?: string;
  input: unknown;
  output: unknown;
};

type JobPostAuthorProfile = {
  email_ID: string | null;
  location: string | null;
  companyLinkedinUrl: string | null;
  companyName: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  headline: string | null;
  about: string | null;
};

type PostFeedRow = {
  key: string;
  lead: FinalLeadCard;
  displayRoleTitle: string;
  displayPostAuthor: string | null;
  displayPostAuthorUrl: string | null;
  authorProfile: JobPostAuthorProfile | undefined;
  freshness: "retrieved" | "fresh" | "both";
  sourceSignal: "retrieved" | "fresh" | "both" | null;
  authorTypeLabel: AuthorTypeLabel;
  locationDisplay: ReturnType<typeof formatLeadLocationDisplay>;
  score: number | null;
  roleMatchScore: number | null;
  locationMatchScore: number | null;
  authorStrengthScore: number | null;
  hiringIntentScore: number | null;
  employmentTypeScore: number | null;
  baseScore: number | null;
  intentBoost: number | null;
  finalScore100: number | null;
  gatedToZero: boolean;
  gateReason: "hiring_intent_zero" | "employment_type_mismatch" | "hard_location_mismatch" | null;
  isNew: boolean;
  fullText: string | null;
  whyMatched: string[];
  provenanceDetails: string[];
  viewPostUrl: string | null;
  searchText: string;
  statusStorageKey: string;
  isLocationLowConfidence: boolean;
  companyDisplayText: string;
  resolvedCompanyRaw: string | null;
  isCompanyLowConfidence: boolean;
  companyFallbackBlockedByCountryMismatch: boolean;
  isPostedByCompany: boolean;
};

type DebugTabMode = "agent" | "post-feed";

type PostFeedSortMode = "best_match" | "most_recent" | "highest_author_strength";
type PostFeedRecencyFilter = "any" | "past-24h" | "past-week" | "past-month";
type PostFeedEmploymentFilter =
  | "any"
  | "full-time"
  | "part-time"
  | "contract"
  | "internship"
  | "unknown";
type PostFeedWorkModeFilter = "any" | "onsite" | "hybrid" | "remote" | "unknown";
type PostFeedPosterTypeFilter = "any" | "hiring_manager" | "recruiter" | "unknown";
type PostFeedMatchStrengthFilter = "any" | "strong" | "medium" | "weak" | "unscored";
type PostFeedSourceFilter = "any" | "retrieved" | "fresh" | "both";
type PostFeedStatusFilter =
  | "any"
  | "not_reviewed"
  | "interested"
  | "applied"
  | "messaged"
  | "ignored";
type PostFeedNewOnlyFilter = "any" | "new_only";

type PostFeedFilterState = {
  role: string;
  location: string;
  recency: PostFeedRecencyFilter;
  employmentType: PostFeedEmploymentFilter;
  workMode: PostFeedWorkModeFilter;
  posterType: PostFeedPosterTypeFilter;
  matchStrength: PostFeedMatchStrengthFilter;
  source: PostFeedSourceFilter;
  status: PostFeedStatusFilter;
  newOnly: PostFeedNewOnlyFilter;
};

function inferFreshnessFromSourceMetadata(value: unknown): "retrieved" | "fresh" | "both" | null {
  if (!value || typeof value !== "object") return null;
  const provenanceSources = (value as Record<string, unknown>).provenanceSources;
  if (!Array.isArray(provenanceSources)) return null;

  const hasRetrieved = provenanceSources.includes("retrieval");
  const hasFresh = provenanceSources.includes("fresh_search");
  if (hasRetrieved && hasFresh) return "both";
  if (hasRetrieved) return "retrieved";
  if (hasFresh) return "fresh";
  return null;
}

function normalizeStringList(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function toHttpUrlOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

function extractWhyMatchedFromMetadata(
  sourceMetadataJson: Record<string, unknown> | null,
): string[] {
  if (!sourceMetadataJson) return [];
  const extraction =
    sourceMetadataJson.extraction && typeof sourceMetadataJson.extraction === "object"
      ? (sourceMetadataJson.extraction as Record<string, unknown>)
      : null;
  const candidates = [
    sourceMetadataJson.whyMatched,
    sourceMetadataJson.matchReason,
    sourceMetadataJson.matchReasons,
    extraction?.whyMatched,
    extraction?.matchReason,
    extraction?.matchReasons,
  ];
  for (const candidate of candidates) {
    const values = normalizeStringList(candidate);
    if (values.length > 0) return values;
  }
  return [];
}

function resolvePostContextFromSourceMetadata(
  sourceMetadataJson: Record<string, unknown> | null,
): {
  primaryPostUrl: string | null;
  primaryAuthorName: string | null;
  primaryAuthorProfileUrl: string | null;
} | null {
  if (!sourceMetadataJson) return null;
  const postContextRaw =
    sourceMetadataJson.postContext && typeof sourceMetadataJson.postContext === "object"
      ? (sourceMetadataJson.postContext as Record<string, unknown>)
      : null;
  if (!postContextRaw) return null;
  return {
    primaryPostUrl: readIdentityKey(postContextRaw.primaryPostUrl),
    primaryAuthorName: readIdentityKey(postContextRaw.primaryAuthorName),
    primaryAuthorProfileUrl: readIdentityKey(postContextRaw.primaryAuthorProfileUrl),
  };
}

function readExtractionRoleFromSourceMetadata(
  sourceMetadataJson: Record<string, unknown> | null | undefined,
): string | null {
  if (!sourceMetadataJson || typeof sourceMetadataJson !== "object") return null;
  const extractionRaw =
    sourceMetadataJson.extraction && typeof sourceMetadataJson.extraction === "object"
      ? (sourceMetadataJson.extraction as Record<string, unknown>)
      : null;
  if (!extractionRaw) return null;
  return readIdentityKey(extractionRaw.role);
}

function resolveDisplayRoleTitle(input: {
  lead: FinalLeadCard;
  rankedLead?: {
    titleOrRole?: string | null;
    sourceMetadataJson?: Record<string, unknown> | null;
  } | null;
}): string {
  const extractionRole = readExtractionRoleFromSourceMetadata(input.lead.sourceMetadataJson ?? null);
  if (extractionRole) return extractionRole;

  const leadJobTitle = readIdentityKey(input.lead.jobTitle);
  if (leadJobTitle) return leadJobTitle;

  const leadTitle = readIdentityKey(input.lead.title);
  if (leadTitle) return leadTitle;

  const rankedExtractionRole = readExtractionRoleFromSourceMetadata(
    input.rankedLead?.sourceMetadataJson ?? null,
  );
  if (rankedExtractionRole) return rankedExtractionRole;

  const rankedTitle = readIdentityKey(input.rankedLead?.titleOrRole ?? null);
  if (rankedTitle) return rankedTitle;

  return "Untitled role";
}

function toCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (!/[",\n\r]/.test(stringValue)) return stringValue;
  return `"${stringValue.replace(/"/g, '""')}"`;
}

function normalizeUrlForLookup(value: string): string {
  try {
    const u = new URL(value);
    u.hash = "";
    u.search = "";
    u.hostname = u.hostname.toLowerCase();
    u.pathname = u.pathname.replace(/\/+$/, "");
    return u.toString();
  } catch {
    return value.trim().toLowerCase();
  }
}

function normalizeSearchContextKey(
  role: string,
  location: string,
  recencyPreference: "past-24h" | "past-week" | "past-month",
): string {
  return `${normalizeLowerText(role)}::${normalizeLowerText(location)}::${recencyPreference}`;
}

function resolveLeadMergeKey(lead: FinalLeadCard): string | null {
  const identityKey = readIdentityKey(lead.identityKey);
  if (identityKey) return `identity:${identityKey.toLowerCase()}`;
  const canonicalUrl = readIdentityKey(lead.canonicalUrl);
  if (canonicalUrl) return `canonical:${normalizeUrlForLookup(canonicalUrl)}`;
  const postUrl = readIdentityKey(lead.postUrl);
  if (postUrl) return `post:${normalizeUrlForLookup(postUrl)}`;
  return null;
}

function resolveLeadFetchedAtFromSourceMetadata(lead: FinalLeadCard): string | null {
  const sourceMetadata =
    lead.sourceMetadataJson && typeof lead.sourceMetadataJson === "object"
      ? (lead.sourceMetadataJson as Record<string, unknown>)
      : null;
  if (!sourceMetadata) return null;
  const directFetchedAt = readIdentityKey(sourceMetadata.fetchedAt);
  if (directFetchedAt) return directFetchedAt;
  const leadRaw =
    sourceMetadata.lead && typeof sourceMetadata.lead === "object"
      ? (sourceMetadata.lead as Record<string, unknown>)
      : null;
  return readIdentityKey(leadRaw?.fetchedAt);
}

function dedupeFinalLeadCardsByRedundancy(leads: FinalLeadCard[]): {
  deduped: FinalLeadCard[];
  droppedCount: number;
} {
  const deduped = dedupeRedundantLeads({
    items: leads,
    toComparable: (lead) => ({
      sourceMetadataJson: lead.sourceMetadataJson ?? null,
      postAuthor: lead.postAuthor ?? null,
      jobTitle: lead.jobTitle ?? null,
      titleOrRole: lead.title ?? null,
      fullText:
        lead.sourceMetadataJson &&
        typeof lead.sourceMetadataJson === "object" &&
        typeof lead.sourceMetadataJson.fullText === "string"
          ? lead.sourceMetadataJson.fullText
          : null,
      snippet: lead.snippet ?? null,
      postedAt: lead.postedAt ?? null,
      fetchedAt: resolveLeadFetchedAtFromSourceMetadata(lead),
    }),
    getRichnessScore: (lead) => {
      let score = 0;
      if (typeof lead.score === "number" && Number.isFinite(lead.score)) score += lead.score * 100;
      if (typeof lead.snippet === "string" && lead.snippet.trim()) score += 2;
      if (typeof lead.jobTitle === "string" && lead.jobTitle.trim()) score += 2;
      if (lead.sourceMetadataJson && typeof lead.sourceMetadataJson === "object") score += 1;
      return score;
    },
  });
  return {
    deduped: deduped.deduped,
    droppedCount: deduped.droppedCount,
  };
}

function extractShownIdentityKeys(leads: FinalLeadCard[]): string[] {
  return Array.from(
    new Set(
      leads
        .map((lead) => readIdentityKey(lead.identityKey))
        .filter((value): value is string => Boolean(value))
        .map((value) => value.toLowerCase()),
    ),
  );
}

function extractMergeKeysFromLeads(leads: FinalLeadCard[]): Set<string> {
  const keys = new Set<string>();
  for (const lead of leads) {
    const mergeKey = resolveLeadMergeKey(lead);
    if (mergeKey) keys.add(mergeKey);
  }
  return keys;
}

function mergeNetNewLeads(
  existing: FinalLeadCard[],
  incoming: FinalLeadCard[],
): { merged: FinalLeadCard[]; addedCount: number; addedKeys: string[] } {
  const normalizedExisting = dedupeFinalLeadCardsByRedundancy(existing).deduped;
  if (incoming.length === 0) return { merged: normalizedExisting, addedCount: 0, addedKeys: [] };

  const merged = [...normalizedExisting];
  const existingKeys = extractMergeKeysFromLeads(normalizedExisting);
  const seenKeys = new Set(existingKeys);

  for (const lead of incoming) {
    const mergeKey = resolveLeadMergeKey(lead);
    if (mergeKey && seenKeys.has(mergeKey)) continue;
    merged.push(lead);
    if (mergeKey) seenKeys.add(mergeKey);
  }

  const mergedAfterRedundancy = dedupeFinalLeadCardsByRedundancy(merged).deduped;
  const addedCount = Math.max(0, mergedAfterRedundancy.length - normalizedExisting.length);
  const mergedKeys = extractMergeKeysFromLeads(mergedAfterRedundancy);
  const addedKeys = Array.from(mergedKeys).filter((key) => !existingKeys.has(key));

  return { merged: mergedAfterRedundancy, addedCount, addedKeys };
}

const AGENT_APIFY_MAX_ITEMS_PER_CALL = 10;
const AGENT_APIFY_MAX_PAYLOAD_ATTEMPTS_PER_QUERY = 1;
const POST_FEED_INITIAL_COUNT = 20;
const POST_FEED_LOAD_MORE_COUNT = 20;
const POST_FEED_STATUS_STORAGE_KEY = "job-post-discovery.post-feed-status.v1";
const RUNNING_FEED_STATUS_WITH_RESULTS_COPY =
  "Showing retrieved matches from database while we find more posts… ETA ~2 min";
const RUNNING_FEED_STATUS_EMPTY_COPY =
  "We are working on finding you relevant posts… ETA ~2 min";

function formatPlannerModeLabel(value: unknown): string {
  if (value === "full_explore") return "Full explore";
  if (value === "explore_heavy") return "Explore heavy";
  if (value === "exploit_heavy") return "Exploit heavy";
  return "Unknown";
}

const DEFAULT_POST_FEED_FILTERS: PostFeedFilterState = {
  role: "",
  location: "",
  recency: "any",
  employmentType: "any",
  workMode: "any",
  posterType: "any",
  matchStrength: "any",
  source: "any",
  status: "any",
  newOnly: "any",
};

function normalizeLowerText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function normalizeScoreGateReason(
  value: unknown,
): "hiring_intent_zero" | "employment_type_mismatch" | "hard_location_mismatch" | null {
  if (value === "hiring_intent_zero") return value;
  if (value === "employment_type_mismatch") return value;
  if (value === "hard_location_mismatch") return value;
  return null;
}

function readIdentityKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolvePostStatusStorageKey(input: {
  leadId?: number;
  identityKey?: string | null;
  canonicalUrl?: string | null;
}): string {
  if (typeof input.leadId === "number" && Number.isInteger(input.leadId) && input.leadId > 0) {
    return `lead_id:${input.leadId}`;
  }
  const identityKey = readIdentityKey(input.identityKey);
  if (identityKey) return `identity_key:${identityKey.toLowerCase()}`;
  const canonicalUrl = readIdentityKey(input.canonicalUrl);
  if (canonicalUrl) return `canonical_url:${normalizeUrlForLookup(canonicalUrl)}`;
  return "fallback:not_reviewed";
}

function normalizeEmploymentTypeValue(value: unknown): Exclude<PostFeedEmploymentFilter, "any"> {
  const normalized = normalizeLowerText(value).replace(/\s+/g, "-");
  if (normalized === "full-time") return "full-time";
  if (normalized === "part-time") return "part-time";
  if (normalized === "contract") return "contract";
  if (normalized === "internship") return "internship";
  return "unknown";
}

function normalizeStreamError(error: unknown): { message: string; code: string | null } {
  if (error && typeof error === "object") {
    const maybeMessage =
      "message" in error && typeof (error as { message?: unknown }).message === "string"
        ? ((error as { message: string }).message ?? "").trim()
        : "";
    const maybeCode =
      "code" in error && typeof (error as { code?: unknown }).code === "string"
        ? ((error as { code: string }).code ?? "").trim()
        : "";
    if (maybeMessage) {
      return { message: maybeMessage, code: maybeCode || null };
    }
  }
  if (error instanceof Error) {
    return { message: error.message, code: null };
  }
  return { message: "Agent run failed", code: null };
}

function normalizeWorkModeValue(value: unknown): Exclude<PostFeedWorkModeFilter, "any"> {
  const normalized = normalizeLowerText(value).replace(/\s+/g, "-");
  if (normalized === "onsite") return "onsite";
  if (normalized === "hybrid") return "hybrid";
  if (normalized === "remote") return "remote";
  return "unknown";
}

function normalizePosterTypeValue(value: AuthorTypeLabel): Exclude<PostFeedPosterTypeFilter, "any"> {
  if (value === "Hiring Manager") return "hiring_manager";
  if (value === "Recruiter") return "recruiter";
  return "unknown";
}

function normalizeMatchStrengthValue(
  score: number | null | undefined,
): Exclude<PostFeedMatchStrengthFilter, "any"> {
  return classifyMatchStrength(score);
}

function recencyToWindowMs(recency: PostFeedRecencyFilter): number | null {
  if (recency === "past-24h") return 24 * 60 * 60 * 1000;
  if (recency === "past-week") return 7 * 24 * 60 * 60 * 1000;
  if (recency === "past-month") return 30 * 24 * 60 * 60 * 1000;
  return null;
}

export function DebugTabClient({ mode = "agent" }: { mode?: DebugTabMode }) {
  const [role, setRole] = React.useState("Product Manager");
  const [location, setLocation] = React.useState("Seattle");
  const [locationIsHardFilter, setLocationIsHardFilter] = React.useState(true);
  const [employmentType, setEmploymentType] = React.useState<
    "full-time" | "part-time" | "contract" | "internship" | ""
  >("full-time");
  const [recencyPreference, setRecencyPreference] = React.useState<
    "past-24h" | "past-week" | "past-month"
  >("past-week");
  const [maxIterations, setMaxIterations] = React.useState(2);
  const [isRunning, setIsRunning] = React.useState(false);
  const [activeStage, setActiveStage] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<DebugRunOutput | null>(null);
  const [interimFinalResponse, setInterimFinalResponse] =
    React.useState<InterimFinalResponse | null>(null);
  const [liveLogEntries, setLiveLogEntries] = React.useState<LiveLogEntry[]>([]);
  const [liveSequence, setLiveSequence] = React.useState<GraphSequenceEvent[]>([]);
  const [nodewiseExplanation, setNodewiseExplanation] = React.useState<{
    summary: string;
    inputs: string[];
    outputs: string[];
    state: string[];
  } | null>(null);
  const [isGeneratingNodewiseExplanation, setIsGeneratingNodewiseExplanation] =
    React.useState(false);
  const [isGraphPlaybackEngaged, setIsGraphPlaybackEngaged] = React.useState(false);
  const [expandedScoreRows, setExpandedScoreRows] = React.useState<Record<string, boolean>>({});
  const [expandedJobPostRows, setExpandedJobPostRows] = React.useState<Record<string, boolean>>({});
  const [postFeedDraftFilters, setPostFeedDraftFilters] =
    React.useState<PostFeedFilterState>(DEFAULT_POST_FEED_FILTERS);
  const [postFeedAppliedFilters, setPostFeedAppliedFilters] =
    React.useState<PostFeedFilterState>(DEFAULT_POST_FEED_FILTERS);
  const [isAdvancedFiltersOpen, setIsAdvancedFiltersOpen] = React.useState(false);
  const [postFeedSortMode, setPostFeedSortMode] = React.useState<PostFeedSortMode>("best_match");
  const [postFeedVisibleCount, setPostFeedVisibleCount] = React.useState(POST_FEED_INITIAL_COUNT);
  const [stickyFeedLeads, setStickyFeedLeads] = React.useState<FinalLeadCard[]>([]);
  const [activeSearchKey, setActiveSearchKey] = React.useState<string>("");
  const [lastRunNewLeadCount, setLastRunNewLeadCount] = React.useState<number | null>(null);
  const [runStartedWithExistingFeed, setRunStartedWithExistingFeed] = React.useState(false);
  const [runNewLeadKeys, setRunNewLeadKeys] = React.useState<Record<string, true>>({});
  const [postFeedStatuses, setPostFeedStatuses] = React.useState<Record<string, PostReviewStatus>>(
    {},
  );
  const [messageCopiedRowKey, setMessageCopiedRowKey] = React.useState<string | null>(null);
  const [messageDrawerRowKey, setMessageDrawerRowKey] = React.useState<string | null>(null);
  const [messageDrawerInstructionByRow, setMessageDrawerInstructionByRow] = React.useState<
    Record<string, string>
  >({});
  const [generatedMessagesByRow, setGeneratedMessagesByRow] = React.useState<
    Record<string, string>
  >({});
  const [messageGeneratingByRow, setMessageGeneratingByRow] = React.useState<
    Record<string, boolean>
  >({});
  const [messageErrorByRow, setMessageErrorByRow] = React.useState<Record<string, string | null>>(
    {},
  );
  const [resumeFileName, setResumeFileName] = React.useState<string | null>(null);
  const [resumeRawText, setResumeRawText] = React.useState<string | null>(null);
  const [resumeSenderName, setResumeSenderName] = React.useState<string | null>(null);
  const [resumeParseStatus, setResumeParseStatus] = React.useState<
    "idle" | "parsing" | "ready" | "error"
  >("idle");
  const [resumeParseError, setResumeParseError] = React.useState<string | null>(null);
  const [liveExtractionRows, setLiveExtractionRows] = React.useState<
    Array<{
      batchIndex: number;
      inputIndex: number;
      inputUrl: string;
      inputText: string;
      role: string | null;
      location: string | null;
      company: string | null;
      employmentType: string | null;
      yearsOfExperience: string | null;
      workMode: string | null;
      isHiring: boolean;
      roleMatchScore: number;
      locationMatchScore: number;
      elapsedMs: number;
      llmModel: string | null;
    }>
  >([]);
  const [liveApiCalls, setLiveApiCalls] = React.useState<LiveApiCallRow[]>([]);
  const [runErrorSummary, setRunErrorSummary] = React.useState<string | null>(null);
  const graphSectionRef = React.useRef<HTMLDivElement | null>(null);
  const postFeedSectionRef = React.useRef<HTMLDivElement | null>(null);
  const runSearchKeyRef = React.useRef<string>("");
  const runBaseStickyCountRef = React.useRef<number>(0);
  const runStartedWithExistingFeedRef = React.useRef<boolean>(false);
  const runAccumulatedAddedCountRef = React.useRef<number>(0);
  const resumeInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (isRunning || lastRunNewLeadCount == null) return;
    const timeoutId = window.setTimeout(() => {
      setLastRunNewLeadCount(null);
    }, 4000);
    return () => window.clearTimeout(timeoutId);
  }, [isRunning, lastRunNewLeadCount]);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(POST_FEED_STATUS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      const normalized: Record<string, PostReviewStatus> = {};
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof key !== "string" || key.trim().length === 0) continue;
        normalized[key] = coercePostReviewStatus(value);
      }
      setPostFeedStatuses(normalized);
    } catch {
      // Ignore malformed localStorage payloads.
    }
  }, []);

  const setPostFeedStatus = React.useCallback(
    (statusStorageKey: string, nextStatus: PostReviewStatus) => {
      if (!statusStorageKey.trim()) return;
      setPostFeedStatuses((prev) => {
        const normalizedStatus = isPostReviewStatus(nextStatus) ? nextStatus : "not_reviewed";
        const next = { ...prev, [statusStorageKey]: normalizedStatus };
        try {
          window.localStorage.setItem(POST_FEED_STATUS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage write failures.
        }
        return next;
      });
    },
    [],
  );

  const clearResumePersonalization = React.useCallback(() => {
    setResumeFileName(null);
    setResumeRawText(null);
    setResumeSenderName(null);
    setResumeParseStatus("idle");
    setResumeParseError(null);
    if (resumeInputRef.current) {
      resumeInputRef.current.value = "";
    }
  }, []);

  const onResumeFileSelected = React.useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setResumeParseStatus("parsing");
      setResumeParseError(null);
      setResumeFileName(file.name);
      setResumeRawText(null);
      setResumeSenderName(null);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const response = await fetch("/api/resume/parse", {
          method: "POST",
          body: formData,
        });
        const rawResponseText = await response.text();
        let body:
          | {
              ok: true;
              data: {
                rawText: string;
                inferredName: string | null;
                fileName: string;
              };
            }
          | { ok: false; error?: { message?: string } }
          | null = null;
        try {
          body = JSON.parse(rawResponseText) as
            | {
                ok: true;
                data: {
                  rawText: string;
                  inferredName: string | null;
                  fileName: string;
                };
              }
            | { ok: false; error?: { message?: string } }
            | null;
        } catch {
          body = null;
        }
        if (!response.ok || !body || !body.ok) {
          const message =
            !body || body.ok
              ? rawResponseText.trim().slice(0, 240) || "Failed to parse resume."
              : (body.error?.message ?? "Failed to parse resume.");
          throw new Error(message);
        }
        setResumeFileName(body.data.fileName || file.name);
        setResumeRawText(body.data.rawText.trim() || null);
        setResumeSenderName(body.data.inferredName ?? null);
        setResumeParseStatus("ready");
      } catch (error) {
        setResumeRawText(null);
        setResumeSenderName(null);
        setResumeParseStatus("error");
        setResumeParseError(
          summarizeUiError({
            source: "resume_parse",
            rawMessage: error instanceof Error ? error.message : "Failed to parse resume.",
          }),
        );
      }
    },
    [],
  );

  const groupedNodeLogs = React.useMemo(() => {
    const map = new Map<
      string,
      Array<{ step: number; phase: "started" | "completed"; log: string; seqIndex: number }>
    >();
    for (const stage of STAGES) map.set(stage, []);
    for (const [seqIndex, item] of (isRunning ? liveSequence : (result?.sequence ?? [])).entries()) {
      const key = STAGES.includes(item.node) ? item.node : "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push({
        step: item.step,
        phase: item.phase,
        log: item.log,
        seqIndex,
      });
    }
    return map;
  }, [result, isRunning, liveSequence]);

  const groupedNodeRuns = React.useMemo(() => {
    const map = new Map<
      string,
      Array<{ step: number; log: string; input: unknown; output: unknown }>
    >();
    for (const stage of STAGES) map.set(stage, []);
    for (const item of result?.nodeRuns ?? []) {
      const key = STAGES.includes(item.node) ? item.node : "unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)?.push({
        step: item.step,
        log: item.log,
        input: item.input,
        output: item.output,
      });
    }
    return map;
  }, [result]);

  const nodeDetails = React.useMemo(() => {
    const details: Record<
      string,
      {
        inputSummary?: string;
        outputSummary?: string;
        decision?: string;
        chosenTarget?: string;
        latencyMs?: number | null;
      }
    > = {};
    for (const [node, runs] of groupedNodeRuns.entries()) {
      const latest = runs[runs.length - 1];
      if (!latest) continue;
      const inputObj =
        latest.input && typeof latest.input === "object"
          ? (latest.input as Record<string, unknown>)
          : {};
      const outputObj =
        latest.output && typeof latest.output === "object"
          ? (latest.output as Record<string, unknown>)
          : {};
      const inputSummary =
        node === "planning_phase"
          ? `Role=${String(inputObj.role ?? "")}, location=${String(inputObj.location ?? "")}, iteration=${String(inputObj.iteration ?? 0)}`
          : node === "query_generation"
            ? `Planner mode=${formatPlannerModeLabel(
                inputObj.plannerOutput
                  ? (inputObj.plannerOutput as Record<string, unknown>).plannerMode
                  : null,
              )}`
            : node === "search"
              ? `Queries=${Array.isArray((inputObj.generatedQueries as Record<string, unknown>)?.queries) ? ((inputObj.generatedQueries as Record<string, unknown>).queries as unknown[]).length : 0}`
              : node === "extraction_node"
                ? `Raw posts=${Array.isArray((inputObj.searchResults as Record<string, unknown>)?.rawSearchResults) ? ((inputObj.searchResults as Record<string, unknown>).rawSearchResults as unknown[]).length : 0}`
                : node === "scoring_node"
                  ? `Leads to score=${Array.isArray(inputObj.leads) ? (inputObj.leads as unknown[]).length : 0}`
                  : `Iteration=${String(inputObj.iteration ?? 0)}`;

      const outputSummary =
        node === "planning_phase"
          ? `Mode=${formatPlannerModeLabel(
              (outputObj.plannerOutput as Record<string, unknown> | undefined)?.plannerMode ?? null,
            )}`
          : node === "query_generation"
            ? `Generated ${(outputObj.generatedQueries as Record<string, unknown> | undefined)?.queries && Array.isArray((outputObj.generatedQueries as Record<string, unknown>).queries) ? ((outputObj.generatedQueries as Record<string, unknown>).queries as unknown[]).length : 0} queries`
            : node === "search"
              ? `Fetched ${String((outputObj.searchResults as Record<string, unknown> | undefined)?.diagnostics && typeof (outputObj.searchResults as Record<string, unknown>).diagnostics === "object" ? (((outputObj.searchResults as Record<string, unknown>).diagnostics as Record<string, unknown>).totalFetched ?? 0) : 0)} items`
              : node === "extraction_node"
                ? `Extracted ${String((outputObj.extractionResults as Record<string, unknown> | undefined)?.extractedLeads && Array.isArray((outputObj.extractionResults as Record<string, unknown>).extractedLeads) ? ((outputObj.extractionResults as Record<string, unknown>).extractedLeads as unknown[]).length : 0)} lead signals`
                : node === "scoring_node"
                  ? `Ranked ${String((outputObj.scoringResults as Record<string, unknown> | undefined)?.rankedLeads && Array.isArray((outputObj.scoringResults as Record<string, unknown>).rankedLeads) ? ((outputObj.scoringResults as Record<string, unknown>).rankedLeads as unknown[]).length : 0)} leads`
                  : `Completed step ${latest.step}`;

      const parseRoutingDecision = () => {
        if (node !== "execution_routing") return null;
        const routingOutput = outputObj;
        const nextFromOutput =
          typeof routingOutput.nextNode === "string"
            ? routingOutput.nextNode
            : typeof (routingOutput.routing as Record<string, unknown> | undefined)?.next ===
                "string"
              ? ((routingOutput.routing as Record<string, unknown>).next as string)
              : null;
        const logText = latest.log.toLowerCase();
        const nextFromLog = logText.includes("next=query_generation")
          ? "query_generation"
          : logText.includes("next=retrieval_arm")
            ? "retrieval_arm"
            : null;
        const chosenTarget = nextFromOutput ?? nextFromLog;
        if (chosenTarget === "retrieval_arm") {
          return {
            chosenTarget,
            decision: "Used retrieval-only path because previous results were sufficient.",
          };
        }
        if (chosenTarget === "query_generation") {
          return {
            chosenTarget,
            decision: "Generated new queries due to low relevance.",
          };
        }
        return {
          chosenTarget: undefined,
          decision: "Chose the next best path for this run.",
        };
      };
      const routingDecision = parseRoutingDecision();

      details[node] = {
        inputSummary,
        outputSummary,
        decision: routingDecision?.decision ?? latest.log,
        chosenTarget: routingDecision?.chosenTarget,
        latencyMs: null,
      };
    }
    return details;
  }, [groupedNodeRuns]);

  const finalLeads = React.useMemo(() => {
    const maybeFinal = (result?.snapshots?.finalResponse ?? interimFinalResponse) as
      | { leads?: FinalLeadCard[] }
      | null
      | undefined;
    return Array.isArray(maybeFinal?.leads) ? maybeFinal.leads : [];
  }, [result, interimFinalResponse]);

  const postFeedLeads = React.useMemo(
    () => (stickyFeedLeads.length > 0 ? stickyFeedLeads : finalLeads),
    [stickyFeedLeads, finalLeads],
  );

  const plannerDecisionSnapshot = React.useMemo(() => {
    const plannerOutput = result?.snapshots?.plannerOutput as
      | {
          plannerMode?: string;
          enableRetrieval?: boolean;
          enableNewLeadGeneration?: boolean;
          numExploreQueries?: number;
          rationale?: unknown[];
        }
      | null
      | undefined;
    const scoringResults = result?.snapshots?.scoringResults as
      | { iterationNumber?: number; highQualityLeadsCount?: number }
      | null
      | undefined;
    const iteration =
      typeof scoringResults?.iterationNumber === "number"
        ? scoringResults.iterationNumber
        : typeof result?.final.iteration === "number"
          ? result.final.iteration
          : null;
    const targetHighQualityLeads =
      typeof result?.final.targetHighQualityLeads === "number"
        ? result.final.targetHighQualityLeads
        : null;
    const highQualityLeadsCount =
      typeof scoringResults?.highQualityLeadsCount === "number"
        ? scoringResults.highQualityLeadsCount
        : null;
    const rationale = (Array.isArray(plannerOutput?.rationale) ? plannerOutput.rationale : [])
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item == null) return "";
        try {
          return JSON.stringify(item);
        } catch {
          return String(item);
        }
      })
      .filter((item) => item.length > 0);

    const plannerMode = plannerOutput?.plannerMode ?? null;
    return {
      iteration,
      highQualityLeadsCount,
      targetHighQualityLeads,
      plannerMode,
      plannerModeLabel: formatPlannerModeLabel(plannerMode),
      enableRetrieval:
        typeof plannerOutput?.enableRetrieval === "boolean" ? plannerOutput.enableRetrieval : null,
      enableNewLeadGeneration:
        typeof plannerOutput?.enableNewLeadGeneration === "boolean"
          ? plannerOutput.enableNewLeadGeneration
          : null,
      numExploreQueries:
        typeof plannerOutput?.numExploreQueries === "number"
          ? plannerOutput.numExploreQueries
          : null,
      rationale,
    };
  }, [result]);

  const retrievalVsFreshSnapshot = React.useMemo(() => {
    const combinedSnapshot = result?.snapshots?.combinedResults as
      | {
          leadProvenance?: Array<{
            identityKey?: string;
            sources?: Array<"retrieval" | "fresh_search">;
          }>;
        }
      | null
      | undefined;
    const scoringSnapshot = result?.snapshots?.scoringResults as
      | {
          topLeads?: Array<{ identityKey?: string }>;
        }
      | null
      | undefined;

    const provenanceRows = Array.isArray(combinedSnapshot?.leadProvenance)
      ? combinedSnapshot.leadProvenance
      : [];
    const topLeads = Array.isArray(scoringSnapshot?.topLeads) ? scoringSnapshot.topLeads : [];

    const sourcesByIdentity = new Map<string, Set<"retrieval" | "fresh_search">>();
    let totalRetrievedLeads = 0;
    let totalFreshLeads = 0;
    let totalBothLeads = 0;
    for (const row of provenanceRows) {
      const identityKey = typeof row.identityKey === "string" ? row.identityKey.trim() : "";
      if (!identityKey) continue;
      const sources = Array.isArray(row.sources)
        ? row.sources.filter(
            (source): source is "retrieval" | "fresh_search" =>
              source === "retrieval" || source === "fresh_search",
          )
        : [];
      const sourceSet = new Set<"retrieval" | "fresh_search">(sources);
      const hasRetrieved = sourceSet.has("retrieval");
      const hasFresh = sourceSet.has("fresh_search");
      if (hasRetrieved) totalRetrievedLeads += 1;
      if (hasFresh) totalFreshLeads += 1;
      if (hasRetrieved && hasFresh) totalBothLeads += 1;
      sourcesByIdentity.set(identityKey, sourceSet);
    }

    let selectedRetrievedOnlyLeads = 0;
    let selectedFreshOnlyLeads = 0;
    let selectedBothLeads = 0;
    let selectedUnknownLeads = 0;
    for (const lead of topLeads) {
      const identityKey = typeof lead.identityKey === "string" ? lead.identityKey.trim() : "";
      const sourceSet = identityKey ? sourcesByIdentity.get(identityKey) : undefined;
      if (!sourceSet) {
        selectedUnknownLeads += 1;
        continue;
      }
      const hasRetrieved = sourceSet.has("retrieval");
      const hasFresh = sourceSet.has("fresh_search");
      if (hasRetrieved && hasFresh) selectedBothLeads += 1;
      else if (hasRetrieved) selectedRetrievedOnlyLeads += 1;
      else if (hasFresh) selectedFreshOnlyLeads += 1;
      else selectedUnknownLeads += 1;
    }

    const selectedRetrievedLeads = selectedRetrievedOnlyLeads + selectedBothLeads;
    const selectedFreshLeads = selectedFreshOnlyLeads + selectedBothLeads;
    const selectedTotal = topLeads.length;
    return {
      totalRetrievedLeads,
      totalFreshLeads,
      totalBothLeads,
      selectedRetrievedLeads,
      selectedFreshLeads,
      selectedTotal,
      selectedRetrievedOnlyLeads,
      selectedFreshOnlyLeads,
      selectedBothLeads,
      selectedUnknownLeads,
    };
  }, [result]);

  const iterationTimingRows = React.useMemo(() => {
    type IterationTimingRow = {
      iteration: number;
      planningTotalMs: number | null;
      routingTotalMs: number | null;
      retrievalTotalMs: number | null;
      queryGenerationTotalMs: number | null;
      searchTotalMs: number | null;
      searchQueryFanoutMs: number | null;
      searchProfileEnrichmentMs: number | null;
      searchPersistenceUpdateMs: number | null;
      searchProviderCallTimeMs: number | null;
      extractionTotalMs: number | null;
      extractionBatchCount: number | null;
      extractionP50BatchMs: number | null;
      extractionP90BatchMs: number | null;
      extractionLlmBatchCount: number | null;
      extractionFallbackBatchCount: number | null;
      combineTotalMs: number | null;
      combineRetrievalComponentMs: number | null;
      combineSearchComponentMs: number | null;
      combineMergeComputeMs: number | null;
      scoringTotalMs: number | null;
      scoringRankingMs: number | null;
      scoringAggregationMs: number | null;
      scoringFinalizeDecisionMs: number | null;
      finalResponseTotalMs: number | null;
    };

    const rows = new Map<number, IterationTimingRow>();
    const ensure = (iteration: number): IterationTimingRow => {
      if (!rows.has(iteration)) {
        rows.set(iteration, {
          iteration,
          planningTotalMs: null,
          routingTotalMs: null,
          retrievalTotalMs: null,
          queryGenerationTotalMs: null,
          searchTotalMs: null,
          searchQueryFanoutMs: null,
          searchProfileEnrichmentMs: null,
          searchPersistenceUpdateMs: null,
          searchProviderCallTimeMs: null,
          extractionTotalMs: null,
          extractionBatchCount: null,
          extractionP50BatchMs: null,
          extractionP90BatchMs: null,
          extractionLlmBatchCount: null,
          extractionFallbackBatchCount: null,
          combineTotalMs: null,
          combineRetrievalComponentMs: null,
          combineSearchComponentMs: null,
          combineMergeComputeMs: null,
          scoringTotalMs: null,
          scoringRankingMs: null,
          scoringAggregationMs: null,
          scoringFinalizeDecisionMs: null,
          finalResponseTotalMs: null,
        });
      }
      return rows.get(iteration)!;
    };

    const readNumber = (value: unknown, path: Array<string>): number | null => {
      let cur: unknown = value;
      for (const key of path) {
        if (!cur || typeof cur !== "object") return null;
        cur = (cur as Record<string, unknown>)[key];
      }
      return typeof cur === "number" && Number.isFinite(cur) ? cur : null;
    };
    const readArrayLength = (value: unknown, path: Array<string>): number | null => {
      let cur: unknown = value;
      for (const key of path) {
        if (!cur || typeof cur !== "object") return null;
        cur = (cur as Record<string, unknown>)[key];
      }
      return Array.isArray(cur) ? cur.length : null;
    };

    for (const run of result?.nodeRuns ?? []) {
      const inputObj =
        run.input && typeof run.input === "object" ? (run.input as Record<string, unknown>) : {};
      const outputObj =
        run.output && typeof run.output === "object" ? (run.output as Record<string, unknown>) : {};
      const iteration = typeof inputObj.iteration === "number" ? inputObj.iteration : 0;
      const row = ensure(iteration);

      switch (run.node) {
        case "planning_phase":
          row.planningTotalMs = readNumber(outputObj, [
            "plannerOutput",
            "planningDiagnostics",
            "elapsedMs",
          ]);
          break;
        case "execution_routing":
          row.routingTotalMs = readNumber(outputObj, ["routingDiagnostics", "elapsedMs"]);
          break;
        case "retrieval_arm":
          row.retrievalTotalMs = readNumber(outputObj, [
            "retrievalResults",
            "retrievalDiagnostics",
            "elapsedMs",
          ]);
          break;
        case "query_generation":
          row.queryGenerationTotalMs = readNumber(outputObj, [
            "generatedQueries",
            "queryGenerationDiagnostics",
            "elapsedMs",
          ]);
          break;
        case "search":
          row.searchTotalMs = readNumber(outputObj, ["searchResults", "diagnostics", "elapsedMs"]);
          row.searchQueryFanoutMs =
            readNumber(outputObj, ["searchResults", "searchDiagnostics", "queryFanoutMs"]) ??
            readNumber(outputObj, [
              "searchResults",
              "providerMetadataJson",
              "iterationMetrics",
              "queryFanoutMs",
            ]);
          row.searchProfileEnrichmentMs =
            readNumber(outputObj, ["searchResults", "searchDiagnostics", "profileEnrichmentMs"]) ??
            readNumber(outputObj, [
              "searchResults",
              "providerMetadataJson",
              "iterationMetrics",
              "profileEnrichmentMs",
            ]);
          row.searchPersistenceUpdateMs =
            readNumber(outputObj, ["searchResults", "searchDiagnostics", "persistenceUpdateMs"]) ??
            readNumber(outputObj, [
              "searchResults",
              "providerMetadataJson",
              "iterationMetrics",
              "persistenceUpdateMs",
            ]);
          row.searchProviderCallTimeMs = readNumber(outputObj, [
            "searchResults",
            "searchDiagnostics",
            "apifyCallTime",
          ]);
          break;
        case "extraction_node": {
          row.extractionTotalMs = readNumber(outputObj, [
            "extractionResults",
            "extractionDiagnostics",
            "elapsedMs",
          ]);
          row.extractionBatchCount =
            readNumber(outputObj, ["extractionResults", "extractionDiagnostics", "batchCount"]) ??
            readArrayLength(outputObj, ["extractionResults", "extractionDiagnostics", "batches"]);
          row.extractionP50BatchMs = readNumber(outputObj, [
            "extractionResults",
            "extractionDiagnostics",
            "extractionLatencyP50Ms",
          ]);
          row.extractionP90BatchMs = readNumber(outputObj, [
            "extractionResults",
            "extractionDiagnostics",
            "extractionLatencyP90Ms",
          ]);
          row.extractionLlmBatchCount = readNumber(outputObj, [
            "extractionResults",
            "extractionDiagnostics",
            "llmBatchCount",
          ]);
          row.extractionFallbackBatchCount = readNumber(outputObj, [
            "extractionResults",
            "extractionDiagnostics",
            "fallbackBatchCount",
          ]);
          break;
        }
        case "combined_result":
          row.combineTotalMs =
            readNumber(outputObj, [
              "combinedResults",
              "combinedDiagnostics",
              "totalIterationTimeMs",
            ]) ??
            readNumber(outputObj, ["combinedResults", "combinedDiagnostics", "combineTimeMs"]);
          row.combineRetrievalComponentMs = readNumber(outputObj, [
            "combinedResults",
            "combinedDiagnostics",
            "retrievalLatencyMs",
          ]);
          row.combineSearchComponentMs = readNumber(outputObj, [
            "combinedResults",
            "combinedDiagnostics",
            "searchLatencyMs",
          ]);
          row.combineMergeComputeMs = readNumber(outputObj, [
            "combinedResults",
            "combinedDiagnostics",
            "combineTimeMs",
          ]);
          break;
        case "scoring_node":
          row.scoringTotalMs = readNumber(outputObj, [
            "scoringResults",
            "scoringDiagnostics",
            "elapsedMs",
          ]);
          row.scoringRankingMs = readNumber(outputObj, [
            "scoringResults",
            "scoringDiagnostics",
            "rankingTimeMs",
          ]);
          row.scoringAggregationMs = readNumber(outputObj, [
            "scoringResults",
            "scoringDiagnostics",
            "aggregationTimeMs",
          ]);
          row.scoringFinalizeDecisionMs = readNumber(outputObj, [
            "scoringResults",
            "scoringDiagnostics",
            "finalizeDecisionTimeMs",
          ]);
          break;
        case "final_response_generation":
          row.finalResponseTotalMs = readNumber(outputObj, [
            "finalResponse",
            "finalizationDiagnostics",
            "elapsedMs",
          ]);
          break;
        default:
          break;
      }
    }

    return Array.from(rows.values()).sort((a, b) => a.iteration - b.iteration);
  }, [result]);

  const latencyMetricRows = React.useMemo(
    () =>
      [
        { kind: "section", label: "Planning" },
        { kind: "metric", label: "Total", key: "planningTotalMs", indent: 0, unit: "ms", isTotal: true },
        { kind: "section", label: "Routing" },
        { kind: "metric", label: "Total", key: "routingTotalMs", indent: 0, unit: "ms", isTotal: true },
        { kind: "section", label: "Retrieval" },
        { kind: "metric", label: "Total", key: "retrievalTotalMs", indent: 0, unit: "ms", isTotal: true },
        { kind: "section", label: "Query Generation" },
        { kind: "metric", label: "Total", key: "queryGenerationTotalMs", indent: 0, unit: "ms", isTotal: true },
        { kind: "section", label: "Search" },
        { kind: "metric", label: "Total", key: "searchTotalMs", indent: 0, unit: "ms", isTotal: true },
        { kind: "metric", label: "Query fanout", key: "searchQueryFanoutMs", indent: 1, unit: "ms", isTotal: false },
        {
          kind: "metric",
          label: "Profile enrichment",
          key: "searchProfileEnrichmentMs",
          indent: 1,
          unit: "ms",
          isTotal: false,
        },
        {
          kind: "metric",
          label: "Persistence update",
          key: "searchPersistenceUpdateMs",
          indent: 1,
          unit: "ms",
          isTotal: false,
        },
        {
          kind: "metric",
          label: "Provider call time",
          key: "searchProviderCallTimeMs",
          indent: 1,
          unit: "ms",
          isTotal: false,
        },
        { kind: "section", label: "Extraction" },
        { kind: "metric", label: "Total", key: "extractionTotalMs", indent: 0, unit: "ms", isTotal: true },
        { kind: "metric", label: "Batch count", key: "extractionBatchCount", indent: 1, unit: "count", isTotal: false },
        { kind: "metric", label: "Batch p50", key: "extractionP50BatchMs", indent: 1, unit: "ms", isTotal: false },
        { kind: "metric", label: "Batch p90", key: "extractionP90BatchMs", indent: 1, unit: "ms", isTotal: false },
        {
          kind: "metric",
          label: "LLM batch count",
          key: "extractionLlmBatchCount",
          indent: 1,
          unit: "count",
          isTotal: false,
        },
        {
          kind: "metric",
          label: "Fallback batch count",
          key: "extractionFallbackBatchCount",
          indent: 1,
          unit: "count",
          isTotal: false,
        },
        { kind: "section", label: "Combine" },
        { kind: "metric", label: "Total", key: "combineTotalMs", indent: 0, unit: "ms", isTotal: true },
        {
          kind: "metric",
          label: "Retrieval component",
          key: "combineRetrievalComponentMs",
          indent: 1,
          unit: "ms",
          isTotal: false,
        },
        {
          kind: "metric",
          label: "Search component",
          key: "combineSearchComponentMs",
          indent: 1,
          unit: "ms",
          isTotal: false,
        },
        {
          kind: "metric",
          label: "Merge compute",
          key: "combineMergeComputeMs",
          indent: 1,
          unit: "ms",
          isTotal: false,
        },
        { kind: "section", label: "Scoring" },
        { kind: "metric", label: "Total", key: "scoringTotalMs", indent: 0, unit: "ms", isTotal: true },
        { kind: "metric", label: "Ranking", key: "scoringRankingMs", indent: 1, unit: "ms", isTotal: false },
        { kind: "metric", label: "Aggregation", key: "scoringAggregationMs", indent: 1, unit: "ms", isTotal: false },
        {
          kind: "metric",
          label: "Finalize decision",
          key: "scoringFinalizeDecisionMs",
          indent: 1,
          unit: "ms",
          isTotal: false,
        },
        { kind: "section", label: "Final Response" },
        { kind: "metric", label: "Total", key: "finalResponseTotalMs", indent: 0, unit: "ms", isTotal: true },
      ] as const,
    [],
  );

  const extractionBatchRows = React.useMemo(() => {
    const extractionSnapshot = result?.snapshots?.extractionResults as
      | {
          extractionDiagnostics?: {
            batches?: Array<{
              batchIndex?: number;
              inputCount?: number;
              inputSourceUrls?: string[];
              inputPreview?: string[];
              inputs?: Array<{
                inputIndex?: number;
                inputUrl?: string;
                inputText?: string;
                role?: string | null;
                location?: string | null;
                company?: string | null;
                employmentType?: string | null;
                yearsOfExperience?: string | null;
                workMode?: string | null;
                isHiring?: boolean;
                roleMatchScore?: number;
                locationMatchScore?: number;
              }>;
              elapsedMs?: number;
              usedLlm?: boolean;
              llmModel?: string | null;
            }>;
          };
        }
      | null
      | undefined;
    const batchRows = extractionSnapshot?.extractionDiagnostics?.batches ?? [];
    if (liveExtractionRows.length > 0) return liveExtractionRows;
    return batchRows.flatMap((batch) =>
      (batch.inputs ?? []).map((input) => ({
        batchIndex: batch.batchIndex ?? 0,
        inputIndex: input.inputIndex ?? 0,
        inputUrl: input.inputUrl ?? "",
        inputText: input.inputText ?? "",
        role: input.role ?? null,
        location: input.location ?? null,
        company: input.company ?? null,
        employmentType: input.employmentType ?? null,
        yearsOfExperience: input.yearsOfExperience ?? null,
        workMode: input.workMode ?? null,
        isHiring: Boolean(input.isHiring),
        roleMatchScore: typeof input.roleMatchScore === "number" ? input.roleMatchScore : 0,
        locationMatchScore:
          typeof input.locationMatchScore === "number" ? input.locationMatchScore : 0,
        elapsedMs: typeof batch.elapsedMs === "number" ? batch.elapsedMs : 0,
        llmModel: batch.llmModel ?? null,
      })),
    );
  }, [result, liveExtractionRows]);

  const scoredLeadByUrl = React.useMemo(() => {
    const scoringSnapshot = result?.snapshots?.scoringResults as
      | {
          scoredLeads?: Array<{
            canonicalUrl?: string;
            leadScore?: number;
            rawLocationText?: string | null;
            locations?: Array<{
              raw?: string;
              city?: string | null;
              state?: string | null;
              country?: string | null;
              lat?: number | null;
              lon?: number | null;
            }>;
            scoreBreakdown?: {
              roleMatchScore?: number;
              locationMatchScore?: number;
              authorStrengthScore?: number;
              hiringIntentScore?: number;
              engagementScore?: number;
              employmentTypeScore?: number;
              baseScore?: number;
              intentBoost?: number;
              finalScore100?: number;
              gatedToZero?: boolean;
              gateReason?: string | null;
            };
          }>;
        }
      | null
      | undefined;
    const map = new Map<
      string,
      {
        leadScore: number;
        roleMatchScore: number;
        locationMatchScore: number;
        authorStrengthScore: number;
        hiringIntentScore: number;
        employmentTypeScore: number;
        baseScore: number | null;
        intentBoost: number | null;
        finalScore100: number | null;
        gatedToZero: boolean;
        gateReason:
          | "hiring_intent_zero"
          | "employment_type_mismatch"
          | "hard_location_mismatch"
          | null;
        rawLocationText: string | null;
        parsedLocations: Array<{
          raw: string;
          city: string | null;
          state: string | null;
          country: string | null;
          lat: number | null;
          lon: number | null;
        }>;
      }
    >();
    for (const lead of scoringSnapshot?.scoredLeads ?? []) {
      if (!lead.canonicalUrl || !lead.scoreBreakdown) continue;
      const value = {
        leadScore: typeof lead.leadScore === "number" ? lead.leadScore : 0,
        roleMatchScore: lead.scoreBreakdown.roleMatchScore ?? 0,
        locationMatchScore: lead.scoreBreakdown.locationMatchScore ?? 0,
        authorStrengthScore: lead.scoreBreakdown.authorStrengthScore ?? 0.5,
        hiringIntentScore:
          lead.scoreBreakdown.hiringIntentScore ?? lead.scoreBreakdown.engagementScore ?? 0.5,
        employmentTypeScore: lead.scoreBreakdown.employmentTypeScore ?? 1,
        baseScore:
          typeof lead.scoreBreakdown.baseScore === "number" ? lead.scoreBreakdown.baseScore : null,
        intentBoost:
          typeof lead.scoreBreakdown.intentBoost === "number"
            ? lead.scoreBreakdown.intentBoost
            : null,
        finalScore100:
          typeof lead.scoreBreakdown.finalScore100 === "number"
            ? lead.scoreBreakdown.finalScore100
            : null,
        gatedToZero: lead.scoreBreakdown.gatedToZero === true,
        gateReason: normalizeScoreGateReason(lead.scoreBreakdown.gateReason),
        rawLocationText: typeof lead.rawLocationText === "string" ? lead.rawLocationText : null,
        parsedLocations: Array.isArray(lead.locations)
          ? lead.locations
              .map((loc) => ({
                raw: typeof loc?.raw === "string" ? loc.raw : "",
                city: typeof loc?.city === "string" && loc.city.trim() ? loc.city : null,
                state: typeof loc?.state === "string" && loc.state.trim() ? loc.state : null,
                country:
                  typeof loc?.country === "string" && loc.country.trim() ? loc.country : null,
                lat: typeof loc?.lat === "number" && Number.isFinite(loc.lat) ? loc.lat : null,
                lon: typeof loc?.lon === "number" && Number.isFinite(loc.lon) ? loc.lon : null,
              }))
              .filter((loc) => loc.raw.trim().length > 0)
          : [],
      };
      map.set(lead.canonicalUrl, value);
      map.set(normalizeUrlForLookup(lead.canonicalUrl), value);
    }
    return map;
  }, [result]);

  const resolveScoredLeadForRow = React.useCallback(
    (lead: FinalLeadCard) =>
      scoredLeadByUrl.get(lead.postUrl ?? lead.canonicalUrl) ??
      scoredLeadByUrl.get(lead.canonicalUrl) ??
      scoredLeadByUrl.get(normalizeUrlForLookup(lead.postUrl ?? lead.canonicalUrl)) ??
      scoredLeadByUrl.get(normalizeUrlForLookup(lead.canonicalUrl)),
    [scoredLeadByUrl],
  );

  const authorProfileByUrl = React.useMemo(() => {
    const scoringSnapshot = result?.snapshots?.scoringResults as
      | {
          rankedLeads?: Array<{
            canonicalUrl?: string;
            sourceMetadataJson?: Record<string, unknown> | null;
          }>;
        }
      | null
      | undefined;
    const map = new Map<string, JobPostAuthorProfile>();

    const readNullableString = (value: unknown) =>
      typeof value === "string" && value.trim() ? value.trim() : null;

    for (const lead of scoringSnapshot?.rankedLeads ?? []) {
      const url = lead.canonicalUrl;
      if (!url) continue;
      const meta =
        lead.sourceMetadataJson && typeof lead.sourceMetadataJson === "object"
          ? (lead.sourceMetadataJson as Record<string, unknown>)
          : null;
      const extraction =
        meta?.extraction && typeof meta.extraction === "object"
          ? (meta.extraction as Record<string, unknown>)
          : null;
      const authorProfile =
        meta?.authorProfile && typeof meta.authorProfile === "object"
          ? (meta.authorProfile as Record<string, unknown>)
          : null;

      map.set(url, {
        email_ID:
          readNullableString(extraction?.email_ID) ?? readNullableString(authorProfile?.email_ID),
        location:
          readNullableString(extraction?.authorLocation) ??
          readNullableString(authorProfile?.location),
        companyLinkedinUrl:
          readNullableString(extraction?.authorCompanyLinkedinUrl) ??
          readNullableString(authorProfile?.companyLinkedinUrl),
        companyName:
          readNullableString(extraction?.authorCompanyName) ??
          readNullableString(authorProfile?.companyName),
        city: readNullableString(extraction?.authorCity) ?? readNullableString(authorProfile?.city),
        state:
          readNullableString(extraction?.authorState) ?? readNullableString(authorProfile?.state),
        country:
          readNullableString(extraction?.authorCountry) ??
          readNullableString(authorProfile?.country),
        headline:
          readNullableString(extraction?.authorHeadline) ??
          readNullableString(authorProfile?.headline),
        about: readNullableString(authorProfile?.about),
      });
    }
    return map;
  }, [result]);

  const searchAuthorProfileByUrl = React.useMemo(() => {
    const searchSnapshot = result?.snapshots?.searchResults as
      | {
          rawSearchResults?: Array<{
            items?: Array<Record<string, unknown>>;
          }>;
        }
      | null
      | undefined;
    const map = new Map<string, JobPostAuthorProfile>();
    const readNullableString = (value: unknown) =>
      typeof value === "string" && value.trim() ? value.trim() : null;

    for (const batch of searchSnapshot?.rawSearchResults ?? []) {
      for (const item of batch.items ?? []) {
        const raw = item as Record<string, unknown>;
        const rawUrl =
          (typeof raw.postUrl === "string" && raw.postUrl.trim()) ||
          (typeof raw.url === "string" && raw.url.trim()) ||
          "";
        if (!rawUrl) continue;
        const profile =
          raw.authorProfile && typeof raw.authorProfile === "object"
            ? (raw.authorProfile as Record<string, unknown>)
            : null;
        if (!profile) continue;

        const key = normalizeUrlForLookup(rawUrl);
        map.set(key, {
          email_ID: readNullableString(profile.email_ID),
          location: readNullableString(profile.location),
          companyLinkedinUrl: readNullableString(profile.companyLinkedinUrl),
          companyName: readNullableString(profile.companyName),
          city: readNullableString(profile.city),
          state: readNullableString(profile.state),
          country: readNullableString(profile.country),
          headline: readNullableString(profile.headline),
          about: readNullableString(profile.about),
        });
      }
    }
    return map;
  }, [result]);

  const resolveAuthorProfileForLead = React.useCallback(
    (lead: FinalLeadCard): JobPostAuthorProfile | undefined =>
      authorProfileByUrl.get(lead.postUrl ?? lead.canonicalUrl) ??
      authorProfileByUrl.get(lead.canonicalUrl) ??
      searchAuthorProfileByUrl.get(normalizeUrlForLookup(lead.postUrl ?? lead.canonicalUrl)) ??
      searchAuthorProfileByUrl.get(normalizeUrlForLookup(lead.canonicalUrl)),
    [authorProfileByUrl, searchAuthorProfileByUrl],
  );

  const onExportJobPostsCsv = React.useCallback(() => {
    if (finalLeads.length === 0) return;

    const headers = [
      "#",
      "Generated query",
      "Post URL",
      "Post author",
      "Post author URL",
      "email_ID",
      "location",
      "company",
      "companyConfidence",
      "companyLinkedinUrl",
      "companyName",
      "headline",
      "about",
      "Job title",
      "Score",
      "Fresh/Retrieved",
    ];

    const rows = finalLeads.map((lead, idx) => {
      const authorProfile = resolveAuthorProfileForLead(lead);
      const sourceMetadata =
        lead.sourceMetadataJson && typeof lead.sourceMetadataJson === "object"
          ? lead.sourceMetadataJson
          : null;
      const postContext = resolvePostContextFromSourceMetadata(sourceMetadata);
      const extraction =
        sourceMetadata?.extraction && typeof sourceMetadata.extraction === "object"
          ? (sourceMetadata.extraction as Record<string, unknown>)
          : null;
      const locationDisplay = formatLeadLocationDisplay({
        locations: lead.locations ?? [],
        rawLocationText: lead.rawLocationText ?? null,
        location: lead.location ?? lead.jobLocation ?? null,
        maxVisible: Number.POSITIVE_INFINITY,
      });
      const extractedCompany = resolveExtractedCompany({
        leadCompany: lead.company ?? null,
        extractionCompany: typeof extraction?.company === "string" ? extraction.company : null,
      });
      const companyResolution = resolveDisplayCompany({
        extractedCompany,
        authorCompany:
          authorProfile?.companyName ??
          (typeof extraction?.authorCompanyName === "string" ? extraction.authorCompanyName : null),
        authorCountry:
          authorProfile?.country ??
          (typeof extraction?.authorCountry === "string" ? extraction.authorCountry : null),
        jobCountries: extractJobCountries(locationDisplay.parsedLocations),
      });
      const displayPostUrl =
        toHttpUrlOrNull(postContext?.primaryPostUrl) ??
        toHttpUrlOrNull(lead.postUrl) ??
        toHttpUrlOrNull(lead.canonicalUrl);
      const displayPostAuthor = postContext?.primaryAuthorName ?? lead.postAuthor ?? null;
      const displayPostAuthorUrl =
        toHttpUrlOrNull(postContext?.primaryAuthorProfileUrl) ??
        toHttpUrlOrNull(lead.postAuthorUrl);
      const displayRoleTitle = resolveDisplayRoleTitle({ lead });
      return [
        String(idx + 1),
        lead.generatedQuery ?? "n/a",
        displayPostUrl ?? lead.canonicalUrl,
        displayPostAuthor ?? "Unknown",
        displayPostAuthorUrl ?? "N/A",
        authorProfile?.email_ID ?? "N/A",
        locationDisplay.display,
        companyResolution.displayCompanyText,
        companyResolution.isLowConfidence
          ? "low"
          : companyResolution.fallbackBlockedByCountryMismatch
            ? "blocked_country_mismatch"
            : "high",
        authorProfile?.companyLinkedinUrl ?? "N/A",
        authorProfile?.companyName ?? "N/A",
        authorProfile?.headline ?? "N/A",
        authorProfile?.about ?? "N/A",
        displayRoleTitle,
        lead.score != null ? lead.score.toFixed(3) : "unscored",
        lead.freshness ?? lead.sourceBadge ?? "fresh",
      ];
    });

    const csv = [headers, ...rows].map((row) => row.map(toCsvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `job-posts-${timestamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [finalLeads, resolveAuthorProfileForLead]);

  const rankedScoredLeads = React.useMemo(() => {
    const scoringSnapshot = result?.snapshots?.scoringResults as
      | {
          rankedLeads?: Array<{
            identityKey?: string | null;
            canonicalUrl?: string;
            titleOrRole?: string | null;
            company?: string | null;
            author?: string | null;
            location?: string | null;
            locations?: Array<{
              raw?: string;
              city?: string | null;
              state?: string | null;
              country?: string | null;
              lat?: number | null;
              lon?: number | null;
            }>;
            rawLocationText?: string | null;
            snippet?: string | null;
            fullText?: string | null;
            leadScore?: number;
            postedAt?: string | null;
            workMode?: "onsite" | "hybrid" | "remote" | null;
            employmentType?: "full-time" | "part-time" | "contract" | "internship" | null;
            sourceType?: string | null;
            scoreBreakdown?: {
              roleMatchScore?: number;
              locationMatchScore?: number;
              authorStrengthScore?: number;
              hiringIntentScore?: number;
              engagementScore?: number;
              employmentTypeScore?: number;
              baseScore?: number;
              intentBoost?: number;
              finalScore100?: number;
              gatedToZero?: boolean;
              gateReason?: string | null;
            };
            sourceMetadataJson?: Record<string, unknown> | null;
          }>;
        }
      | null
      | undefined;
    return Array.isArray(scoringSnapshot?.rankedLeads) ? scoringSnapshot.rankedLeads : [];
  }, [result]);

  const postFeedRows = React.useMemo(() => {
    const leadByUrl = new Map<string, FinalLeadCard>();
    const seenCanonicalUrls = new Set<string>();

    for (const lead of postFeedLeads) {
      const rawKeys = [lead.postUrl, lead.canonicalUrl].filter(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      );
      for (const key of rawKeys) {
        leadByUrl.set(key, lead);
        leadByUrl.set(normalizeUrlForLookup(key), lead);
      }
    }

    const rows: PostFeedRow[] = [];

    const createRow = (
      lead: FinalLeadCard,
      rowIndex: number,
      options?: {
        rankedLead?: {
          titleOrRole?: string | null;
          sourceMetadataJson?: Record<string, unknown> | null;
        } | null;
        rankedScore?: number | null;
        rankedBreakdown?: {
          roleMatchScore?: number;
          locationMatchScore?: number;
          authorStrengthScore?: number;
          hiringIntentScore?: number;
          engagementScore?: number;
          employmentTypeScore?: number;
          baseScore?: number;
          intentBoost?: number;
          finalScore100?: number;
          gatedToZero?: boolean;
          gateReason?: string | null;
        } | null;
        sourceMetadataJson?: Record<string, unknown> | null;
        rankedFullText?: string | null;
        rankedSourceType?: string | null;
      },
    ) => {
      const scoredLead = resolveScoredLeadForRow(lead);
      const authorProfile = resolveAuthorProfileForLead(lead);
      const sourceMetadata = options?.sourceMetadataJson ?? lead.sourceMetadataJson ?? null;
      const displayRoleTitle = resolveDisplayRoleTitle({
        lead,
        rankedLead: options?.rankedLead ?? null,
      });
      const postContext = resolvePostContextFromSourceMetadata(sourceMetadata);
      const sourceSignal =
        lead.freshness ??
        lead.sourceBadge ??
        inferFreshnessFromSourceMetadata(sourceMetadata) ??
        null;
      const freshness = sourceSignal ?? "fresh";
      const preferredLocations =
        Array.isArray(lead.locations) && lead.locations.length > 0
          ? lead.locations
          : (scoredLead?.parsedLocations ?? []);
      const explicitLocationText =
        (typeof lead.rawLocationText === "string" && lead.rawLocationText.trim()
          ? lead.rawLocationText.trim()
          : null) ??
        (typeof scoredLead?.rawLocationText === "string" && scoredLead.rawLocationText.trim()
          ? scoredLead.rawLocationText.trim()
          : null) ??
        (typeof lead.location === "string" && lead.location.trim() ? lead.location.trim() : null) ??
        (typeof lead.jobLocation === "string" && lead.jobLocation.trim()
          ? lead.jobLocation.trim()
          : null);
      const inferredAuthorLocation =
        preferredLocations.length === 0 && !explicitLocationText && authorProfile?.location?.trim()
          ? authorProfile.location.trim()
          : null;
      const locationDisplay = formatLocations(
        {
          locations: preferredLocations,
          rawLocationText: lead.rawLocationText ?? scoredLead?.rawLocationText ?? null,
          location: inferredAuthorLocation ?? lead.location ?? lead.jobLocation ?? null,
        },
        {
          maxVisible: Number.POSITIVE_INFINITY,
        },
      );
      const isLocationLowConfidence = Boolean(
        inferredAuthorLocation && locationDisplay.parsedLocations.length > 0,
      );
      const extraction =
        sourceMetadata?.extraction && typeof sourceMetadata.extraction === "object"
          ? (sourceMetadata.extraction as Record<string, unknown>)
          : null;
      const extractedCompany = resolveExtractedCompany({
        leadCompany: lead.company ?? null,
        extractionCompany: typeof extraction?.company === "string" ? extraction.company : null,
      });
      const authorCompany =
        authorProfile?.companyName ??
        (typeof extraction?.authorCompanyName === "string" ? extraction.authorCompanyName : null);
      const authorCountry =
        authorProfile?.country ??
        (typeof extraction?.authorCountry === "string" ? extraction.authorCountry : null);
      const companyResolution = resolveDisplayCompany({
        extractedCompany,
        authorCompany,
        authorCountry,
        jobCountries: extractJobCountries(locationDisplay.parsedLocations),
      });
      const score =
        typeof options?.rankedScore === "number"
          ? options.rankedScore
          : (scoredLead?.leadScore ?? (typeof lead.score === "number" ? lead.score : null));
      const roleMatchScore =
        typeof options?.rankedBreakdown?.roleMatchScore === "number"
          ? options.rankedBreakdown.roleMatchScore
          : typeof scoredLead?.roleMatchScore === "number"
            ? scoredLead.roleMatchScore
            : null;
      const locationMatchScore =
        typeof options?.rankedBreakdown?.locationMatchScore === "number"
          ? options.rankedBreakdown.locationMatchScore
          : typeof scoredLead?.locationMatchScore === "number"
            ? scoredLead.locationMatchScore
            : null;
      const authorStrengthScore =
        typeof options?.rankedBreakdown?.authorStrengthScore === "number"
          ? options.rankedBreakdown.authorStrengthScore
          : typeof scoredLead?.authorStrengthScore === "number"
            ? scoredLead.authorStrengthScore
            : null;
      const hiringIntentScore =
        typeof options?.rankedBreakdown?.hiringIntentScore === "number"
          ? options.rankedBreakdown.hiringIntentScore
          : typeof options?.rankedBreakdown?.engagementScore === "number"
            ? options.rankedBreakdown.engagementScore
            : typeof scoredLead?.hiringIntentScore === "number"
              ? scoredLead.hiringIntentScore
              : null;
      const employmentTypeScore =
        typeof options?.rankedBreakdown?.employmentTypeScore === "number"
          ? options.rankedBreakdown.employmentTypeScore
          : typeof scoredLead?.employmentTypeScore === "number"
            ? scoredLead.employmentTypeScore
            : null;
      const baseScore =
        typeof options?.rankedBreakdown?.baseScore === "number"
          ? options.rankedBreakdown.baseScore
          : typeof scoredLead?.baseScore === "number"
            ? scoredLead.baseScore
            : null;
      const intentBoost =
        typeof options?.rankedBreakdown?.intentBoost === "number"
          ? options.rankedBreakdown.intentBoost
          : typeof scoredLead?.intentBoost === "number"
            ? scoredLead.intentBoost
            : null;
      const finalScore100 =
        typeof options?.rankedBreakdown?.finalScore100 === "number"
          ? options.rankedBreakdown.finalScore100
          : typeof scoredLead?.finalScore100 === "number"
            ? scoredLead.finalScore100
            : typeof score === "number" && Number.isFinite(score)
              ? Math.round(Math.max(0, Math.min(1, score)) * 100)
              : null;
      const gateReason =
        normalizeScoreGateReason(options?.rankedBreakdown?.gateReason) ??
        normalizeScoreGateReason(scoredLead?.gateReason);
      const gatedToZero =
        options?.rankedBreakdown?.gatedToZero === true ||
        scoredLead?.gatedToZero === true;
      const fullText =
        (typeof options?.rankedFullText === "string" && options.rankedFullText.trim()
          ? options.rankedFullText
          : null) ??
        (sourceMetadata &&
        typeof sourceMetadata.fullText === "string" &&
        sourceMetadata.fullText.trim()
          ? sourceMetadata.fullText
          : null) ??
        (typeof lead.snippet === "string" && lead.snippet.trim() ? lead.snippet : null);
      const authorTypeLabel = formatAuthorType({
        sourceMetadataJson: sourceMetadata,
        company: extractedCompany,
        fullText,
        snippet: typeof lead.snippet === "string" ? lead.snippet : null,
      });
      const mergeKey = resolveLeadMergeKey(lead);
      const isNew = runStartedWithExistingFeed
        ? Boolean(mergeKey && runNewLeadKeys[mergeKey])
        : lead.isNewForUser === true || lead.newBadge === "new";
      const whyMatched = extractWhyMatchedFromMetadata(sourceMetadata);
      const displayPostAuthor = postContext?.primaryAuthorName ?? lead.postAuthor ?? null;
      const displayPostAuthorUrl =
        toHttpUrlOrNull(postContext?.primaryAuthorProfileUrl) ??
        toHttpUrlOrNull(lead.postAuthorUrl) ??
        toHttpUrlOrNull(sourceMetadata?.postAuthorUrl) ??
        toHttpUrlOrNull(sourceMetadata?.authorUrl);
      const viewPostUrl =
        toHttpUrlOrNull(postContext?.primaryPostUrl) ??
        toHttpUrlOrNull(lead.canonicalUrl) ??
        toHttpUrlOrNull(lead.postUrl) ??
        toHttpUrlOrNull(sourceMetadata?.sourceUrl);
      const authorUrl = displayPostAuthorUrl;
      const postedByCompanyFromUrl = Boolean(
        authorUrl && /linkedin\.com\/company\//i.test(authorUrl),
      );
      const authorNameNormalized = normalizeLowerText(displayPostAuthor);
      const companyNameNormalized = normalizeLowerText(extractedCompany);
      const postedByCompanyByName = Boolean(
        authorNameNormalized &&
        companyNameNormalized &&
        authorNameNormalized === companyNameNormalized,
      );
      const isPostedByCompany = postedByCompanyFromUrl || postedByCompanyByName;
      const leadIdentityFromMetadata =
        readIdentityKey(sourceMetadata?.identityKey) ??
        (sourceMetadata && typeof sourceMetadata.leadIdentity === "object"
          ? readIdentityKey((sourceMetadata.leadIdentity as Record<string, unknown>).identityKey)
          : null) ??
        (sourceMetadata && typeof sourceMetadata.lead === "object"
          ? readIdentityKey((sourceMetadata.lead as Record<string, unknown>).identityKey)
          : null);
      const statusStorageKey = resolvePostStatusStorageKey({
        leadId: lead.leadId,
        identityKey: readIdentityKey(lead.identityKey) ?? leadIdentityFromMetadata,
        canonicalUrl: lead.canonicalUrl ?? viewPostUrl,
      });
      const provenanceDetails = [
        sourceSignal
          ? `Source: ${
              sourceSignal === "both"
                ? "Retrieved + Fresh"
                : sourceSignal === "retrieved"
                  ? "Retrieved"
                  : "Fresh"
            }`
          : null,
        typeof options?.rankedSourceType === "string" && options.rankedSourceType.trim()
          ? `Source type: ${options.rankedSourceType}`
          : null,
        sourceMetadata &&
        typeof sourceMetadata.sourceQuery === "string" &&
        sourceMetadata.sourceQuery.trim()
          ? `Query: ${sourceMetadata.sourceQuery.trim()}`
          : null,
        sourceMetadata &&
        typeof sourceMetadata.sourceUrl === "string" &&
        sourceMetadata.sourceUrl.trim()
          ? `Source URL: ${sourceMetadata.sourceUrl.trim()}`
          : null,
      ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
      const searchText = [
        displayRoleTitle,
        lead.jobTitle,
        lead.title,
        extractedCompany,
        companyResolution.displayCompanyText,
        lead.generatedQuery,
        displayPostAuthor,
        lead.snippet,
        authorProfile?.companyName,
        locationDisplay.full ?? locationDisplay.display,
      ]
        .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        .join(" ")
        .toLowerCase();

      return {
        key: `${lead.leadId ?? rowIndex}-${lead.canonicalUrl}-feed`,
        lead,
        displayRoleTitle,
        displayPostAuthor,
        displayPostAuthorUrl,
        authorProfile,
        freshness,
        sourceSignal,
        authorTypeLabel,
        locationDisplay,
        score,
        roleMatchScore,
        locationMatchScore,
        authorStrengthScore,
        hiringIntentScore,
        employmentTypeScore,
        baseScore,
        intentBoost,
        finalScore100,
        gatedToZero,
        gateReason,
        isNew,
        fullText,
        whyMatched,
        provenanceDetails,
        viewPostUrl,
        searchText,
        statusStorageKey,
        isLocationLowConfidence,
        companyDisplayText: companyResolution.displayCompanyText,
        resolvedCompanyRaw: companyResolution.rawCompany,
        isCompanyLowConfidence: companyResolution.isLowConfidence,
        companyFallbackBlockedByCountryMismatch: companyResolution.fallbackBlockedByCountryMismatch,
        isPostedByCompany,
      };
    };

    if (rankedScoredLeads.length > 0) {
      for (const [index, rankedLead] of rankedScoredLeads.entries()) {
        const canonicalUrl =
          typeof rankedLead.canonicalUrl === "string" ? rankedLead.canonicalUrl.trim() : "";
        if (!canonicalUrl) continue;
        const canonicalLookup = normalizeUrlForLookup(canonicalUrl);
        if (seenCanonicalUrls.has(canonicalLookup)) continue;
        seenCanonicalUrls.add(canonicalLookup);

        const matchedLead = leadByUrl.get(canonicalUrl) ?? leadByUrl.get(canonicalLookup);
        const inferredFreshness = inferFreshnessFromSourceMetadata(
          rankedLead.sourceMetadataJson ?? null,
        );
        const rankedLocations = Array.isArray(rankedLead.locations)
          ? rankedLead.locations
              .map((loc) => ({
                raw: typeof loc?.raw === "string" ? loc.raw : "",
                city: typeof loc?.city === "string" && loc.city.trim() ? loc.city : null,
                state: typeof loc?.state === "string" && loc.state.trim() ? loc.state : null,
                country:
                  typeof loc?.country === "string" && loc.country.trim() ? loc.country : null,
                lat: typeof loc?.lat === "number" && Number.isFinite(loc.lat) ? loc.lat : null,
                lon: typeof loc?.lon === "number" && Number.isFinite(loc.lon) ? loc.lon : null,
              }))
              .filter((loc) => loc.raw.trim().length > 0)
          : [];

        const lead = matchedLead
          ? ({
              ...matchedLead,
              postedAt:
                matchedLead.postedAt ??
                (typeof rankedLead.postedAt === "string" ? rankedLead.postedAt : null),
              workMode: matchedLead.workMode ?? rankedLead.workMode ?? null,
              employmentType: matchedLead.employmentType ?? rankedLead.employmentType ?? null,
              sourceMetadataJson:
                matchedLead.sourceMetadataJson ?? rankedLead.sourceMetadataJson ?? null,
            } satisfies FinalLeadCard)
          : ({
              title:
                typeof rankedLead.titleOrRole === "string" && rankedLead.titleOrRole.trim()
                  ? rankedLead.titleOrRole
                  : "Untitled role",
              company: typeof rankedLead.company === "string" ? rankedLead.company : null,
              location: typeof rankedLead.location === "string" ? rankedLead.location : null,
              locations: rankedLocations,
              rawLocationText:
                typeof rankedLead.rawLocationText === "string" ? rankedLead.rawLocationText : null,
              identityKey:
                typeof rankedLead.identityKey === "string" && rankedLead.identityKey.trim()
                  ? rankedLead.identityKey.trim()
                  : null,
              canonicalUrl,
              postUrl: canonicalUrl,
              postAuthor: typeof rankedLead.author === "string" ? rankedLead.author : null,
              snippet: typeof rankedLead.snippet === "string" ? rankedLead.snippet : null,
              score: typeof rankedLead.leadScore === "number" ? rankedLead.leadScore : null,
              freshness: inferredFreshness ?? "fresh",
              sourceBadge: inferredFreshness ?? "fresh",
              jobTitle:
                typeof rankedLead.titleOrRole === "string" ? rankedLead.titleOrRole : undefined,
              postedAt: typeof rankedLead.postedAt === "string" ? rankedLead.postedAt : null,
              workMode: rankedLead.workMode ?? null,
              employmentType: rankedLead.employmentType ?? null,
              sourceMetadataJson: rankedLead.sourceMetadataJson ?? null,
            } satisfies FinalLeadCard);

        rows.push(
          createRow(lead, index, {
            rankedLead: {
              titleOrRole: rankedLead.titleOrRole ?? null,
              sourceMetadataJson: rankedLead.sourceMetadataJson ?? null,
            },
            rankedScore: typeof rankedLead.leadScore === "number" ? rankedLead.leadScore : null,
            rankedBreakdown: rankedLead.scoreBreakdown ?? null,
            sourceMetadataJson: rankedLead.sourceMetadataJson ?? null,
            rankedFullText: typeof rankedLead.fullText === "string" ? rankedLead.fullText : null,
            rankedSourceType:
              typeof rankedLead.sourceType === "string" ? rankedLead.sourceType : null,
          }),
        );
      }
    } else {
      const sortedFinalLeads = [...postFeedLeads].sort((a, b) => {
        const aScore = resolveScoredLeadForRow(a)?.leadScore ?? a.score ?? -1;
        const bScore = resolveScoredLeadForRow(b)?.leadScore ?? b.score ?? -1;
        return bScore - aScore;
      });
      for (const [index, lead] of sortedFinalLeads.entries()) {
        rows.push(createRow(lead, index));
        seenCanonicalUrls.add(normalizeUrlForLookup(lead.canonicalUrl));
      }
    }

    for (const [index, lead] of postFeedLeads.entries()) {
      const canonicalLookup = normalizeUrlForLookup(lead.canonicalUrl);
      if (seenCanonicalUrls.has(canonicalLookup)) continue;
      rows.push(createRow(lead, index));
      seenCanonicalUrls.add(canonicalLookup);
    }

    const dedupedRows = dedupeRedundantLeads({
      items: rows,
      toComparable: (row) => ({
        sourceMetadataJson: row.lead.sourceMetadataJson ?? null,
        postAuthor: row.displayPostAuthor ?? row.lead.postAuthor ?? null,
        jobTitle: row.displayRoleTitle,
        titleOrRole: row.lead.title ?? row.lead.jobTitle ?? null,
        fullText: row.fullText,
        snippet: row.lead.snippet ?? null,
        postedAt: row.lead.postedAt ?? null,
        fetchedAt: resolveLeadFetchedAtFromSourceMetadata(row.lead),
      }),
      getRichnessScore: (row) => {
        let score = 0;
        if (typeof row.score === "number" && Number.isFinite(row.score)) score += row.score * 100;
        if (typeof row.lead.snippet === "string" && row.lead.snippet.trim()) score += 2;
        if (typeof row.fullText === "string" && row.fullText.trim()) score += 3;
        if (row.lead.sourceMetadataJson && typeof row.lead.sourceMetadataJson === "object") {
          score += 1;
        }
        return score;
      },
    });

    return dedupedRows.deduped;
  }, [
    postFeedLeads,
    rankedScoredLeads,
    resolveAuthorProfileForLead,
    resolveScoredLeadForRow,
    runStartedWithExistingFeed,
    runNewLeadKeys,
  ]);
  const postFeedRowsByKey = React.useMemo(
    () => new Map(postFeedRows.map((row) => [row.key, row])),
    [postFeedRows],
  );
  const selectedDrawerRow = React.useMemo(() => {
    if (!messageDrawerRowKey) return null;
    return postFeedRowsByKey.get(messageDrawerRowKey) ?? null;
  }, [messageDrawerRowKey, postFeedRowsByKey]);
  const selectedDrawerInstruction =
    selectedDrawerRow && messageDrawerInstructionByRow[selectedDrawerRow.key]
      ? messageDrawerInstructionByRow[selectedDrawerRow.key]
      : "";
  const hasPendingPostFeedFilterChanges =
    postFeedDraftFilters.role !== postFeedAppliedFilters.role ||
    postFeedDraftFilters.location !== postFeedAppliedFilters.location ||
    postFeedDraftFilters.recency !== postFeedAppliedFilters.recency ||
    postFeedDraftFilters.employmentType !== postFeedAppliedFilters.employmentType ||
    postFeedDraftFilters.workMode !== postFeedAppliedFilters.workMode ||
    postFeedDraftFilters.posterType !== postFeedAppliedFilters.posterType ||
    postFeedDraftFilters.matchStrength !== postFeedAppliedFilters.matchStrength ||
    postFeedDraftFilters.source !== postFeedAppliedFilters.source ||
    postFeedDraftFilters.status !== postFeedAppliedFilters.status ||
    postFeedDraftFilters.newOnly !== postFeedAppliedFilters.newOnly;

  const applyPostFeedFilters = React.useCallback(() => {
    setPostFeedAppliedFilters(postFeedDraftFilters);
  }, [postFeedDraftFilters]);

  const resetPostFeedFilters = React.useCallback(() => {
    setPostFeedDraftFilters(DEFAULT_POST_FEED_FILTERS);
    setPostFeedAppliedFilters(DEFAULT_POST_FEED_FILTERS);
  }, []);
  const clearPostFeedFilter = React.useCallback((key: keyof PostFeedFilterState) => {
    setPostFeedDraftFilters((prev) => ({ ...prev, [key]: DEFAULT_POST_FEED_FILTERS[key] }));
    setPostFeedAppliedFilters((prev) => ({ ...prev, [key]: DEFAULT_POST_FEED_FILTERS[key] }));
  }, []);
  const countPostFeedFilters = React.useCallback((filters: PostFeedFilterState) => {
    let count = 0;
    if (filters.role.trim().length > 0) count += 1;
    if (filters.location.trim().length > 0) count += 1;
    if (filters.recency !== "any") count += 1;
    if (filters.employmentType !== "any") count += 1;
    if (filters.workMode !== "any") count += 1;
    if (filters.posterType !== "any") count += 1;
    if (filters.matchStrength !== "any") count += 1;
    if (filters.source !== "any") count += 1;
    if (filters.status !== "any") count += 1;
    if (filters.newOnly !== "any") count += 1;
    return count;
  }, []);
  const countPostFeedAdvancedFilters = React.useCallback((filters: PostFeedFilterState) => {
    let count = 0;
    if (filters.employmentType !== "any") count += 1;
    if (filters.posterType !== "any") count += 1;
    if (filters.matchStrength !== "any") count += 1;
    if (filters.source !== "any") count += 1;
    if (filters.status !== "any") count += 1;
    if (filters.newOnly !== "any") count += 1;
    return count;
  }, []);
  const postFeedDraftFilterCount = React.useMemo(() => {
    return countPostFeedFilters(postFeedDraftFilters);
  }, [countPostFeedFilters, postFeedDraftFilters]);
  const postFeedAppliedFilterCount = React.useMemo(() => {
    return countPostFeedFilters(postFeedAppliedFilters);
  }, [postFeedAppliedFilters]);
  const postFeedDraftAdvancedFilterCount = React.useMemo(() => {
    return countPostFeedAdvancedFilters(postFeedDraftFilters);
  }, [countPostFeedAdvancedFilters, postFeedDraftFilters]);

  const filteredPostFeedRows = React.useMemo(() => {
    const roleQuery = normalizeLowerText(postFeedAppliedFilters.role);
    const roleTokens = roleQuery.split(/\s+/).filter((token) => token.length > 0);
    const locationQuery = normalizeLowerText(postFeedAppliedFilters.location);
    const recencyWindowMs = recencyToWindowMs(postFeedAppliedFilters.recency);
    const nowMs = Date.now();

    return postFeedRows.filter((row) => {
      const countryEligibility = isLeadCountryEligibleForUser({
        userLocation: location,
        lead: {
          locations:
            Array.isArray(row.lead.locations) && row.lead.locations.length > 0
              ? row.lead.locations
              : row.locationDisplay.parsedLocations,
          rawLocationText: row.lead.rawLocationText ?? row.locationDisplay.full ?? null,
        },
      });
      if (!countryEligibility.eligible) return false;

      if (roleTokens.length > 0) {
        const roleText = normalizeLowerText(
          row.displayRoleTitle ?? row.lead.jobTitle ?? row.lead.title ?? row.lead.company ?? null,
        );
        const roleMatches = roleTokens.every((token) => roleText.includes(token));
        if (!roleMatches) return false;
      }

      if (locationQuery) {
        const locationCandidates = [
          ...(Array.isArray(row.locationDisplay.parsedLocations)
            ? row.locationDisplay.parsedLocations.map((loc) => loc.raw)
            : []),
          row.locationDisplay.full,
          row.locationDisplay.display,
          row.lead.location,
          row.lead.jobLocation,
          row.lead.rawLocationText,
        ]
          .map((value) => normalizeLowerText(value))
          .filter((value) => value.length > 0);
        const locationMatches = locationCandidates.some((value) => value.includes(locationQuery));
        if (!locationMatches) return false;
      }

      if (typeof recencyWindowMs === "number") {
        const postedAtMs =
          typeof row.lead.postedAt === "string"
            ? new Date(row.lead.postedAt).getTime()
            : Number.NaN;
        if (!Number.isFinite(postedAtMs)) return false;
        if (postedAtMs < nowMs - recencyWindowMs) return false;
      }

      if (postFeedAppliedFilters.employmentType !== "any") {
        const normalizedEmployment = normalizeEmploymentTypeValue(row.lead.employmentType);
        if (normalizedEmployment !== postFeedAppliedFilters.employmentType) return false;
      }

      if (postFeedAppliedFilters.workMode !== "any") {
        const normalizedWorkMode = normalizeWorkModeValue(row.lead.workMode);
        if (normalizedWorkMode !== postFeedAppliedFilters.workMode) return false;
      }

      if (postFeedAppliedFilters.posterType !== "any") {
        const normalizedPosterType = normalizePosterTypeValue(row.authorTypeLabel);
        if (normalizedPosterType !== postFeedAppliedFilters.posterType) return false;
      }

      if (postFeedAppliedFilters.matchStrength !== "any") {
        const normalizedMatchStrength = normalizeMatchStrengthValue(row.score);
        if (normalizedMatchStrength !== postFeedAppliedFilters.matchStrength) return false;
      }

      if (postFeedAppliedFilters.source !== "any" && row.freshness !== postFeedAppliedFilters.source) {
        return false;
      }

      if (postFeedAppliedFilters.status !== "any") {
        const currentStatus = coercePostReviewStatus(postFeedStatuses[row.statusStorageKey]);
        if (currentStatus !== postFeedAppliedFilters.status) return false;
      }

      if (postFeedAppliedFilters.newOnly === "new_only" && !row.isNew) return false;
      return true;
    });
  }, [location, postFeedRows, postFeedAppliedFilters, postFeedStatuses]);

  const sortedPostFeedRows = React.useMemo(() => {
    if (postFeedSortMode === "best_match") return filteredPostFeedRows;

    const rows = [...filteredPostFeedRows];
    if (postFeedSortMode === "most_recent") {
      rows.sort((a, b) => {
        const aMs = a.lead.postedAt ? new Date(a.lead.postedAt).getTime() : 0;
        const bMs = b.lead.postedAt ? new Date(b.lead.postedAt).getTime() : 0;
        return bMs - aMs;
      });
      return rows;
    }

    rows.sort((a, b) => (b.authorStrengthScore ?? -1) - (a.authorStrengthScore ?? -1));
    return rows;
  }, [filteredPostFeedRows, postFeedSortMode]);

  const postFeedBreakdown = React.useMemo(() => {
    const allRetrieved = postFeedRows.filter((row) => row.freshness === "retrieved").length;
    const allFresh = postFeedRows.filter((row) => row.freshness === "fresh").length;
    const allBoth = postFeedRows.filter((row) => row.freshness === "both").length;
    return {
      all: postFeedRows.length,
      retrieved: allRetrieved,
      fresh: allFresh,
      both: allBoth,
      filtered: filteredPostFeedRows.length,
    };
  }, [postFeedRows, filteredPostFeedRows]);

  const visiblePostFeedRows = React.useMemo(
    () => sortedPostFeedRows.slice(0, postFeedVisibleCount),
    [sortedPostFeedRows, postFeedVisibleCount],
  );
  const hasAnyFeedRows = postFeedRows.length > 0;
  const isRunActive = isRunning;
  const isRetrievedVisibleWhileRunning = isRunActive && hasAnyFeedRows;
  const isNoRetrievedWhileRunning = isRunActive && !hasAnyFeedRows;
  const hasMorePostFeedRows = sortedPostFeedRows.length > visiblePostFeedRows.length;
  const visiblePostFeedBreakdown = React.useMemo(() => {
    let retrieved = 0;
    let fresh = 0;
    let both = 0;
    for (const row of visiblePostFeedRows) {
      if (row.freshness === "retrieved") retrieved += 1;
      else if (row.freshness === "fresh") fresh += 1;
      else if (row.freshness === "both") both += 1;
    }
    return {
      retrieved,
      fresh,
      both,
    };
  }, [visiblePostFeedRows]);

  const postFeedSortLabel =
    postFeedSortMode === "most_recent"
      ? "Most Recent"
      : postFeedSortMode === "highest_author_strength"
        ? "Highest Author Strength"
        : rankedScoredLeads.length > 0
          ? "Best Match (backend ranking)"
          : "Best Match";

  const onGenerateMessageForRow = React.useCallback(
    async (row: PostFeedRow, options?: { force?: boolean; userInstruction?: string | null }) => {
      const force = Boolean(options?.force);
      const userInstruction =
        typeof options?.userInstruction === "string" && options.userInstruction.trim().length > 0
          ? options.userInstruction.trim()
          : null;
      if (messageGeneratingByRow[row.key]) return;
      const existing = generatedMessagesByRow[row.key];
      if (!force && typeof existing === "string" && existing.trim().length > 0) return;

      const locations = Array.from(
        new Set(
          row.locationDisplay.parsedLocations
            .map((loc) => (typeof loc.raw === "string" ? loc.raw.trim() : ""))
            .filter((value) => value.length > 0),
        ),
      );
      if (locations.length === 0 && row.locationDisplay.full) {
        locations.push(row.locationDisplay.full);
      }

      setMessageErrorByRow((prev) => ({ ...prev, [row.key]: null }));
      setMessageGeneratingByRow((prev) => ({ ...prev, [row.key]: true }));
      try {
        const res = await fetch("/api/messages/generate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            roleTitle: row.displayRoleTitle,
            company: row.resolvedCompanyRaw ?? null,
            locations,
            workMode: row.lead.workMode ?? null,
            employmentType: row.lead.employmentType ?? null,
            postText: row.fullText ?? row.lead.snippet ?? null,
            authorName: row.displayPostAuthor ?? null,
            authorHeadline: row.authorProfile?.headline ?? null,
            authorCompany: row.authorProfile?.companyName ?? null,
            authorType: row.authorTypeLabel === "Unknown" ? null : row.authorTypeLabel,
            postUrl: row.viewPostUrl,
            userRoleFitContext: role,
            previousMessage:
              typeof existing === "string" && existing.trim().length > 0 ? existing : null,
            userInstruction,
            resumeRawText,
            senderName: resumeSenderName,
          }),
        });

        const json = (await res.json().catch(() => null)) as
          | { ok: true; data: { message: string } }
          | { ok: false; error?: { message?: string } }
          | null;
        if (!res.ok || !json || !json.ok || typeof json.data?.message !== "string") {
          const fallbackMessage =
            !json || json.ok
              ? "Failed to generate message"
              : (json.error?.message ?? "Failed to generate message");
          throw new Error(fallbackMessage);
        }

        const message = json.data.message.trim();
        if (!message) {
          throw new Error("Message generation returned empty content");
        }

        setGeneratedMessagesByRow((prev) => ({ ...prev, [row.key]: message }));
      } catch (err) {
        const message = summarizeUiError({
          source: "message_generation",
          rawMessage: err instanceof Error ? err.message : "Failed to generate message",
        });
        setMessageErrorByRow((prev) => ({ ...prev, [row.key]: message }));
      } finally {
        setMessageGeneratingByRow((prev) => ({ ...prev, [row.key]: false }));
      }
    },
    [generatedMessagesByRow, messageGeneratingByRow, role, resumeRawText, resumeSenderName],
  );

  const onCopyMessageForRow = React.useCallback(
    async (row: PostFeedRow) => {
      const text = generatedMessagesByRow[row.key];
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // Clipboard can be unavailable in some browser contexts.
      }
      setMessageCopiedRowKey(row.key);
      window.setTimeout(() => {
        setMessageCopiedRowKey((prev) => (prev === row.key ? null : prev));
      }, 1800);
    },
    [generatedMessagesByRow],
  );

  const costGuardMetrics = React.useMemo(() => {
    const searchSnapshot = result?.snapshots?.searchResults as
      | {
          providerMetadataJson?: {
            queryCount?: number;
            queryErrors?: Array<{ queryText?: string; error?: string }>;
            apifyAttemptsByQuery?: Array<{
              attempts?: Array<{ success: boolean }>;
            }>;
          };
        }
      | null
      | undefined;

    const queryCount =
      typeof searchSnapshot?.providerMetadataJson?.queryCount === "number"
        ? searchSnapshot.providerMetadataJson.queryCount
        : 0;
    const attemptsByQuery = searchSnapshot?.providerMetadataJson?.apifyAttemptsByQuery ?? [];
    // In strict batched mode we may replicate the same attempt metadata per query;
    // use the max attempt count observed across queries to avoid overcounting.
    const apifyCallsMade = attemptsByQuery.reduce((maxCalls, q) => {
      const calls = Array.isArray(q.attempts) ? q.attempts.length : 0;
      return Math.max(maxCalls, calls);
    }, 0);
    const queryErrors = searchSnapshot?.providerMetadataJson?.queryErrors ?? [];
    const firstError =
      queryErrors.find((e) => typeof e?.error === "string" && e.error.trim())?.error ?? null;
    const apifyCallsZeroReason =
      apifyCallsMade > 0
        ? null
        : queryCount === 0
          ? "No generated queries for this iteration."
          : firstError
            ? firstError
            : "No Apify attempt metadata recorded for this run.";

    return {
      queryCount,
      apifyCallsMade,
      maxItemsPerCall: AGENT_APIFY_MAX_ITEMS_PER_CALL,
      payloadAttemptsPerQuery: AGENT_APIFY_MAX_PAYLOAD_ATTEMPTS_PER_QUERY,
      apifyCallsZeroReason,
    };
  }, [result]);

  const graphSequence = React.useMemo(
    () => (isRunning ? liveSequence : (result?.sequence ?? [])),
    [isRunning, liveSequence, result],
  );

  const startedSequence = React.useMemo(
    () => graphSequence.filter((item) => item.phase === "started" && STAGES.includes(item.node)),
    [graphSequence],
  );

  const iterationPasses = React.useMemo(
    () =>
      graphSequence.filter((item) => item.phase === "started" && item.node === "combined_result")
        .length,
    [graphSequence],
  );

  const playbackNodes = React.useMemo(
    () => startedSequence.map((item) => item.node),
    [startedSequence],
  );
  const [playbackIndex, setPlaybackIndex] = React.useState(0);
  const [isPlaybackPlaying, setIsPlaybackPlaying] = React.useState(false);
  const [currentStep, setCurrentStep] = React.useState(0);
  const [selectedLogIteration, setSelectedLogIteration] = React.useState("");
  const [selectedLogNode, setSelectedLogNode] = React.useState("");

  React.useEffect(() => {
    setPlaybackIndex(0);
    setCurrentStep(0);
    setIsPlaybackPlaying(false);
    setIsGraphPlaybackEngaged(false);
  }, [result]);

  React.useEffect(() => {
    if (isRunning || !isPlaybackPlaying || playbackNodes.length <= 1) return;
    const timer = window.setInterval(() => {
      setPlaybackIndex((prev) => {
        if (prev >= playbackNodes.length - 1) {
          setIsPlaybackPlaying(false);
          return prev;
        }
        const next = prev + 1;
        setCurrentStep(next);
        return next;
      });
    }, 500);
    return () => window.clearInterval(timer);
  }, [isPlaybackPlaying, playbackNodes, isRunning]);

  const graphPlaybackNode =
    playbackNodes[Math.min(playbackIndex, Math.max(playbackNodes.length - 1, 0))] ?? null;
  const isPostRunNeutralGraph = !isRunning && !isGraphPlaybackEngaged;
  const graphActiveNode = isRunning
    ? activeStage
    : isGraphPlaybackEngaged
      ? graphPlaybackNode
      : null;
  const hasRunData = startedSequence.length > 0;
  const displayedGraphStep = isPostRunNeutralGraph
    ? 0
    : startedSequence.length
      ? Math.min(currentStep + 1, startedSequence.length)
      : 0;
  const iterationsAvailable = React.useMemo(
    () => Array.from(new Set(liveLogEntries.map((e) => e.iteration))).sort((a, b) => a - b),
    [liveLogEntries],
  );
  const nodesForSelectedIteration = React.useMemo(() => {
    if (!selectedLogIteration) {
      return Array.from(new Set(liveLogEntries.map((e) => e.node)));
    }
    const selectedIter = Number(selectedLogIteration);
    return Array.from(
      new Set(liveLogEntries.filter((e) => e.iteration === selectedIter).map((e) => e.node)),
    );
  }, [liveLogEntries, selectedLogIteration]);
  const latencyTotalsByIteration = React.useMemo(() => {
    const totals = new Map<number, number>();
    const totalKeys = latencyMetricRows
      .filter((metric) => metric.kind === "metric" && metric.isTotal && metric.unit === "ms")
      .map((metric) => metric.key);
    for (const row of iterationTimingRows) {
      let iterationTotal = 0;
      for (const key of totalKeys) {
        const value = row[key];
        if (typeof value === "number") iterationTotal += value;
      }
      totals.set(row.iteration, iterationTotal);
    }
    return totals;
  }, [iterationTimingRows, latencyMetricRows]);

  React.useEffect(() => {
    if (!selectedLogNode) return;

    const selectedNodeIterations = liveLogEntries
      .filter((entry) => entry.node === selectedLogNode)
      .map((entry) => entry.iteration);
    if (selectedNodeIterations.length === 0) return;

    const uniqueIterations = Array.from(new Set(selectedNodeIterations)).sort((a, b) => a - b);
    const latestIteration = uniqueIterations[uniqueIterations.length - 1];
    if (!selectedLogIteration) {
      setSelectedLogIteration(String(latestIteration));
      return;
    }

    const requestedIteration = Number(selectedLogIteration);
    if (!uniqueIterations.includes(requestedIteration)) {
      setSelectedLogIteration(String(latestIteration));
    }
  }, [selectedLogIteration, selectedLogNode, liveLogEntries]);

  React.useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!selectedLogIteration || !selectedLogNode) {
        setNodewiseExplanation(null);
        return;
      }
      const selectedIter = Number(selectedLogIteration);
      const runsForSelection = (groupedNodeRuns.get(selectedLogNode) ?? []).filter((run) => {
        const inputObj =
          run.input && typeof run.input === "object"
            ? (run.input as Record<string, unknown>)
            : null;
        return typeof inputObj?.iteration === "number" && inputObj.iteration === selectedIter;
      });
      const logsForSelection = liveLogEntries
        .filter((e) => e.iteration === selectedIter && e.node === selectedLogNode)
        .map((e) => `[${e.timestamp}] ${e.message}`);
      if (runsForSelection.length === 0 && logsForSelection.length === 0) {
        setNodewiseExplanation(null);
        return;
      }
      setIsGeneratingNodewiseExplanation(true);
      try {
        const res = await fetch("/api/debug-runs/explain", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            node: selectedLogNode,
            iteration: selectedIter,
            logs: logsForSelection.slice(-12),
            runs: runsForSelection.slice(-2),
          }),
        });
        const body = (await res.json().catch(() => null)) as {
          ok: boolean;
          data?: {
            summary: string;
            inputs: string[];
            outputs: string[];
            state: string[];
          };
        } | null;
        if (!cancelled && body?.ok && body.data) {
          setNodewiseExplanation(body.data);
        }
      } finally {
        if (!cancelled) setIsGeneratingNodewiseExplanation(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedLogIteration, selectedLogNode, groupedNodeRuns, liveLogEntries]);

  React.useEffect(() => {
    if (!messageDrawerRowKey) return;
    if (postFeedRowsByKey.has(messageDrawerRowKey)) return;
    setMessageDrawerRowKey(null);
  }, [messageDrawerRowKey, postFeedRowsByKey]);

  React.useEffect(() => {
    if (!messageDrawerRowKey) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMessageDrawerRowKey(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [messageDrawerRowKey]);

  const completedNodes = React.useMemo(() => {
    const nodes = new Set<string>();
    if (isRunning) {
      for (const item of startedSequence) {
        nodes.add(item.node);
      }
      return nodes;
    }
    if (isPostRunNeutralGraph) {
      return nodes;
    }
    const maxIdx = Math.min(currentStep, startedSequence.length - 1);
    for (let i = 0; i <= maxIdx; i += 1) {
      const node = startedSequence[i]?.node;
      if (node) nodes.add(node);
    }
    return nodes;
  }, [currentStep, isRunning, isPostRunNeutralGraph, startedSequence]);

  const traversedEdges = React.useMemo(() => {
    const edges = new Set<string>();
    if (!isRunning && isPostRunNeutralGraph) {
      return edges;
    }
    const maxIdx = isRunning
      ? startedSequence.length - 1
      : Math.min(currentStep, startedSequence.length - 1);
    for (let i = 1; i <= maxIdx; i += 1) {
      const prev = startedSequence[i - 1]?.node;
      const cur = startedSequence[i]?.node;
      if (prev && cur) edges.add(`${prev}->${cur}`);
    }
    return edges;
  }, [startedSequence, currentStep, isRunning, isPostRunNeutralGraph]);

  function smoothScrollToElement(
    targetRef: React.RefObject<HTMLDivElement | null>,
    durationMs = 800,
    topOffsetPx = 12,
  ) {
    const targetEl = targetRef.current;
    if (!targetEl) return;
    const startY = window.scrollY;
    const targetY = Math.max(
      0,
      targetEl.getBoundingClientRect().top + window.scrollY - topOffsetPx,
    );
    const delta = targetY - startY;
    const start = performance.now();
    const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const tick = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(1, elapsed / durationMs);
      window.scrollTo(0, startY + delta * easeInOut(p));
      if (p < 1) window.requestAnimationFrame(tick);
    };
    window.requestAnimationFrame(tick);
  }

  async function startRun() {
    if (isRunning) return;
    const nextSearchKey = normalizeSearchContextKey(role, location, recencyPreference);
    const normalizedSticky = dedupeFinalLeadCardsByRedundancy(stickyFeedLeads);
    const stickyLeadsForRun = normalizedSticky.deduped;
    const hasStickyFeed = stickyLeadsForRun.length > 0;
    const isSameContextRerun = hasStickyFeed && activeSearchKey === nextSearchKey;
    const shownIdentityKeys = isSameContextRerun ? extractShownIdentityKeys(stickyLeadsForRun) : [];

    runSearchKeyRef.current = nextSearchKey;
    runBaseStickyCountRef.current = isSameContextRerun ? stickyLeadsForRun.length : 0;
    runStartedWithExistingFeedRef.current = isSameContextRerun;
    runAccumulatedAddedCountRef.current = 0;
    setRunStartedWithExistingFeed(isSameContextRerun);
    setRunNewLeadKeys({});
    setLastRunNewLeadCount(null);
    setActiveSearchKey(nextSearchKey);
    if (normalizedSticky.droppedCount > 0) {
      setStickyFeedLeads(stickyLeadsForRun);
    }
    if (!isSameContextRerun) {
      setStickyFeedLeads([]);
    }

    setIsRunning(true);
    setResult(null);
    setRunErrorSummary(null);
    setNodewiseExplanation(null);
    setLiveLogEntries([]);
    setLiveSequence([]);
    setLiveExtractionRows([]);
    setLiveApiCalls([]);
    setExpandedScoreRows({});
    setExpandedJobPostRows({});
    setPostFeedVisibleCount(POST_FEED_INITIAL_COUNT);
    setMessageCopiedRowKey(null);
    setMessageDrawerRowKey(null);
    setMessageDrawerInstructionByRow({});
    setGeneratedMessagesByRow({});
    setMessageGeneratingByRow({});
    setMessageErrorByRow({});
    setInterimFinalResponse(null);
    setActiveStage(null);
    setIsGraphPlaybackEngaged(false);
    setCurrentStep(0);
    setPlaybackIndex(0);
    setSelectedLogIteration("");
    setSelectedLogNode("");
    if (mode === "post-feed") {
      smoothScrollToElement(postFeedSectionRef, 800, 12);
    } else {
      smoothScrollToElement(graphSectionRef, 800, 12);
    }
    try {
      const res = await fetch("/api/debug-runs/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          role,
          location,
          locationIsHardFilter,
          employmentType: employmentType || null,
          recencyPreference,
          maxIterations,
          shownIdentityKeys,
        }),
      });
      if (!res.ok || !res.body) {
        const body = (await res.json().catch(() => null)) as {
          ok: false;
          error?: { message?: string; code?: string };
        } | null;
        throw {
          message: readApiErrorMessage(body, "Debug run failed"),
          code: body?.error?.code ?? null,
        };
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const evt = JSON.parse(trimmed) as
            | { type: "started"; step: number; node: string; log: string }
            | {
                type: "completed";
                step: number;
                node: string;
                log: string;
                patch?: Record<string, unknown>;
              }
            | {
                type: "api_call";
                id: number;
                at: string;
                node?: string;
                api: string;
                method: string;
                url?: string;
                input: unknown;
                output: unknown;
              }
            | {
                type: "interim_results";
                phase: "retrieval_scored" | "fresh_search_preview";
                payload: InterimFinalResponse;
              }
            | { type: "final"; payload: DebugRunOutput }
            | { type: "error"; message: string; code?: string };
          if (evt.type === "started") {
            setLiveSequence((prev) => [
              ...prev,
              { step: evt.step, node: evt.node, phase: "started", log: evt.log },
            ]);
            setActiveStage(evt.node);
            setCurrentStep(Math.max(0, evt.step - 1));
            const timestamp = new Date().toLocaleTimeString();
            const iterationMatch = evt.log.match(/\[iteration=(\d+)\]/);
            const iteration = iterationMatch ? Number(iterationMatch[1]) : 0;
            setLiveLogEntries((prev) => [
              ...prev,
              { timestamp, node: evt.node, iteration, message: evt.log },
            ]);
          } else if (evt.type === "completed") {
            setLiveSequence((prev) => [
              ...prev,
              { step: evt.step, node: evt.node, phase: "completed", log: evt.log },
            ]);
            const timestamp = new Date().toLocaleTimeString();
            const iterationMatch = evt.log.match(/\[iteration=(\d+)\]/);
            const iteration = iterationMatch ? Number(iterationMatch[1]) : 0;
            setLiveLogEntries((prev) => [
              ...prev,
              { timestamp, node: evt.node, iteration, message: evt.log },
            ]);
            if (evt.node === "extraction_node" && evt.patch) {
              const extraction = evt.patch.extractionResults as
                | {
                    extractionDiagnostics?: {
                      batches?: Array<{
                        batchIndex?: number;
                        elapsedMs?: number;
                        llmModel?: string | null;
                        inputs?: Array<{
                          inputIndex?: number;
                          inputUrl?: string;
                          inputText?: string;
                          role?: string | null;
                          location?: string | null;
                          company?: string | null;
                          employmentType?: string | null;
                          yearsOfExperience?: string | null;
                          workMode?: string | null;
                          isHiring?: boolean;
                          roleMatchScore?: number;
                          locationMatchScore?: number;
                        }>;
                      }>;
                    };
                  }
                | undefined;
              const rows = (extraction?.extractionDiagnostics?.batches ?? []).flatMap((batch) =>
                (batch.inputs ?? []).map((input) => ({
                  batchIndex: batch.batchIndex ?? 0,
                  inputIndex: input.inputIndex ?? 0,
                  inputUrl: input.inputUrl ?? "",
                  inputText: input.inputText ?? "",
                  role: input.role ?? null,
                  location: input.location ?? null,
                  company: input.company ?? null,
                  employmentType: input.employmentType ?? null,
                  yearsOfExperience: input.yearsOfExperience ?? null,
                  workMode: input.workMode ?? null,
                  isHiring: Boolean(input.isHiring),
                  roleMatchScore:
                    typeof input.roleMatchScore === "number" ? input.roleMatchScore : 0,
                  locationMatchScore:
                    typeof input.locationMatchScore === "number" ? input.locationMatchScore : 0,
                  elapsedMs: typeof batch.elapsedMs === "number" ? batch.elapsedMs : 0,
                  llmModel: batch.llmModel ?? null,
                })),
              );
              setLiveExtractionRows(rows);
            }
          } else if (evt.type === "api_call") {
            if (evt.node && STAGES.includes(evt.node)) {
              setActiveStage(evt.node);
            }
            setLiveApiCalls((prev) => [
              ...prev,
              {
                id: evt.id,
                at: evt.at,
                node: evt.node ?? "unknown",
                api: evt.api,
                method: evt.method,
                url: evt.url,
                input: evt.input,
                output: evt.output,
              },
            ]);
          } else if (evt.type === "interim_results") {
            const incomingLeads = Array.isArray(evt.payload?.leads)
              ? (evt.payload.leads as FinalLeadCard[])
              : [];
            if (incomingLeads.length > 0) {
              setStickyFeedLeads((prev) => {
                const { merged, addedCount, addedKeys } = mergeNetNewLeads(prev, incomingLeads);
                runAccumulatedAddedCountRef.current += addedCount;
                if (addedKeys.length > 0) {
                  setRunNewLeadKeys((existingKeys) => {
                    const nextKeys = { ...existingKeys };
                    for (const key of addedKeys) nextKeys[key] = true;
                    return nextKeys;
                  });
                }
                return merged;
              });
            }
            setInterimFinalResponse(evt.payload);
          } else if (evt.type === "final") {
            setLiveSequence(evt.payload.sequence ?? []);
            const finalResponseSnapshot = evt.payload?.snapshots?.finalResponse as
              | { leads?: FinalLeadCard[] }
              | null
              | undefined;
            const incomingLeads = Array.isArray(finalResponseSnapshot?.leads)
              ? finalResponseSnapshot.leads
              : [];
            if (incomingLeads.length > 0) {
              setStickyFeedLeads((prev) => {
                const { merged, addedCount, addedKeys } = mergeNetNewLeads(prev, incomingLeads);
                runAccumulatedAddedCountRef.current += addedCount;
                if (addedKeys.length > 0) {
                  setRunNewLeadKeys((existingKeys) => {
                    const nextKeys = { ...existingKeys };
                    for (const key of addedKeys) nextKeys[key] = true;
                    return nextKeys;
                  });
                }
                return merged;
              });
            }
            setActiveStage(null);
            setInterimFinalResponse(null);
            setResult(evt.payload);
            setIsGraphPlaybackEngaged(false);
            setPlaybackIndex(0);
            setCurrentStep(0);
            setSelectedLogIteration("");
            setSelectedLogNode("");
            if (runStartedWithExistingFeedRef.current) {
              setLastRunNewLeadCount(runAccumulatedAddedCountRef.current);
            }
          } else if (evt.type === "error") {
            throw { message: evt.message, code: evt.code ?? null };
          }
        }
      }
    } catch (err) {
      const normalized = normalizeStreamError(err);
      setRunErrorSummary(
        summarizeUiError({
          source: "run",
          rawMessage: normalized.message,
          code: normalized.code,
        }),
      );
    } finally {
      setIsRunning(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    void startRun();
  }

  return (
    <div className="mt-4 space-y-4">
      <Card className="border-[var(--intent-muted-border)] bg-[var(--section-controls-bg)] p-5">
        <h2 className="text-lg font-semibold">Search parameters</h2>
        <div className="mt-2 border-t border-[var(--intent-muted-border)]" />
        <form onSubmit={onSubmit} className="mt-4">
          <div className="grid gap-3 rounded-lg border border-[var(--intent-muted-border)] bg-[var(--surface-1)] p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_112px]">
            <div className="space-y-2">
              <Label htmlFor="role">
                Role <span className="text-red-500">*</span>
              </Label>
              <Input id="role" value={role} onChange={(e) => setRole(e.target.value)} />
              <p className="text-xs text-muted-foreground">One one role at a time</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">
                Location <span className="text-red-500">*</span>
              </Label>
              <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  id="locationHardFilter"
                  type="checkbox"
                  checked={locationIsHardFilter}
                  onChange={(e) => setLocationIsHardFilter(e.target.checked)}
                />
                It&apos;s Important to me
              </label>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recency">
                Recency <span className="text-red-500">*</span>
              </Label>
              <select
                id="recency"
                value={recencyPreference}
                onChange={(e) =>
                  setRecencyPreference(e.target.value as "past-24h" | "past-week" | "past-month")
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors duration-200 hover:border-[color-mix(in_srgb,var(--intent-primary)_24%,var(--input))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--intent-primary)_32%,transparent)]"
              >
                <option value="past-24h">Past 24 hours</option>
                <option value="past-week">Past week</option>
                <option value="past-month">Past 30 days</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employmentType">Employment Type</Label>
              <select
                id="employmentType"
                value={employmentType}
                onChange={(e) =>
                  setEmploymentType(
                    e.target.value as "full-time" | "part-time" | "contract" | "internship" | "",
                  )
                }
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors duration-200 hover:border-[color-mix(in_srgb,var(--intent-primary)_24%,var(--input))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--intent-primary)_32%,transparent)]"
              >
                <option value="">Any</option>
                <option value="full-time">Full Time</option>
                <option value="part-time">Part Time</option>
                <option value="contract">Contract</option>
                <option value="internship">Internship</option>
              </select>
              <p className="text-xs text-muted-foreground">optional</p>
            </div>
            <div className="w-full space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="maxIterations">Max iterations</Label>
                <span className="group/help relative inline-flex items-center">
                  <button
                    type="button"
                    aria-label="Max iterations help"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-[var(--intent-muted-border)] bg-background text-[10px] font-semibold leading-none text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    i
                  </button>
                  <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden w-[260px] -translate-x-1/2 rounded-md border border-[var(--intent-muted-border)] bg-background px-2 py-1 text-[11px] leading-snug text-foreground shadow-md group-hover/help:block group-focus-within/help:block dark:bg-popover dark:text-popover-foreground">
                    Maximum planning/scoring loops before the run stops. Higher values may find more
                    posts but take longer.
                  </span>
                </span>
              </div>
              <select
                id="maxIterations"
                value={String(maxIterations)}
                onChange={(e) => setMaxIterations(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors duration-200 hover:border-[color-mix(in_srgb,var(--intent-primary)_24%,var(--input))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--intent-primary)_32%,transparent)]"
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="resumeUpload">Resume (optional)</Label>
                <span className="group/help relative inline-flex items-center">
                  <button
                    type="button"
                    aria-label="Resume personalization help"
                    className="text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm px-0.5"
                  >
                    why?
                  </button>
                  <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden w-[280px] max-w-[320px] -translate-x-1/2 rounded-md border border-[var(--intent-muted-border)] bg-background px-2 py-1 text-[11px] leading-snug text-foreground shadow-md group-hover/help:block group-focus-within/help:block dark:bg-popover dark:text-popover-foreground">
                    Uploading your resume helps personalize generated outreach messages to your
                    background. Used only for this browser session.
                  </span>
                </span>
              </div>
              <input
                ref={resumeInputRef}
                id="resumeUpload"
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => {
                  void onResumeFileSelected(event);
                }}
                disabled={resumeParseStatus === "parsing"}
                className="sr-only"
              />
              <div className="relative">
                <button
                  type="button"
                  onClick={() => resumeInputRef.current?.click()}
                  disabled={resumeParseStatus === "parsing"}
                  className="h-9 w-full truncate rounded-md border border-input bg-background px-3 pr-9 text-left text-sm text-foreground transition-colors duration-200 hover:border-[color-mix(in_srgb,var(--intent-primary)_24%,var(--input))] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="block truncate">{resumeFileName ?? "Upload PDF or DOCX"}</span>
                </button>
                {resumeFileName || resumeParseStatus === "error" ? (
                  <button
                    type="button"
                    className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 rounded-md text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
                    onClick={clearResumePersonalization}
                    disabled={resumeParseStatus === "parsing"}
                    aria-label="Remove resume"
                  >
                    <span aria-hidden className="text-base leading-none">
                      ×
                    </span>
                  </button>
                ) : null}
              </div>
              <p
                className={`truncate text-xs ${
                  resumeParseStatus === "error" ? "text-destructive" : "text-muted-foreground"
                }`}
                title={
                  resumeParseStatus === "error"
                    ? (resumeParseError ?? "Couldn't parse this resume. Upload a PDF or DOCX up to 5 MB.")
                    : undefined
                }
              >
                {resumeParseStatus === "parsing"
                  ? "Parsing..."
                  : resumeParseStatus === "ready"
                    ? "Ready (session only)"
                    : resumeParseStatus === "error"
                      ? (resumeParseError ?? "Failed to parse resume.")
                      : "Stored only in this browser session."}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="opacity-0">Run</Label>
              <Button
                type="submit"
                disabled={isRunning}
                className="h-9 w-28 justify-center text-center font-semibold"
              >
                {isRunning ? "Running..." : "Run"}
              </Button>
            </div>
          </div>
        </form>
        {runErrorSummary ? (
          <div className="mt-4 flex items-center justify-between gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2">
            <p className="min-w-0 truncate text-sm text-destructive">{runErrorSummary}</p>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => void startRun()}
                disabled={isRunning}
              >
                Retry
              </Button>
              <button
                type="button"
                aria-label="Dismiss run error"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-destructive/80 transition-colors hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setRunErrorSummary(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      {mode === "post-feed" ? (
        <>
          <div
            ref={postFeedSectionRef}
            className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start"
          >
            <Card className="h-fit border-[var(--intent-muted-border)] bg-[var(--section-workspace-bg)] p-4 lg:sticky lg:top-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">Feed filters</h2>
                  {postFeedDraftFilterCount > 0 ? (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--intent-primary)] px-1.5 text-[11px] font-semibold text-white">
                      {postFeedDraftFilterCount}
                    </span>
                  ) : null}
                </div>
                {postFeedDraftFilterCount > 0 || postFeedAppliedFilterCount > 0 ? (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground"
                    onClick={resetPostFeedFilters}
                  >
                    Clear all
                  </button>
                ) : null}
              </div>
              <div className="mt-2 border-t border-[var(--intent-muted-border)]" />

              <div className="mt-4 space-y-4">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="post-feed-role" className="inline-block w-[60px] shrink-0">
                        Role
                      </Label>
                      <Input
                        id="post-feed-role"
                        value={postFeedDraftFilters.role}
                        onChange={(e) =>
                          setPostFeedDraftFilters((prev) => ({ ...prev, role: e.target.value }))
                        }
                        placeholder="Product Manager"
                        className="h-8 min-w-0 flex-1"
                      />
                      {postFeedDraftFilters.role.trim().length > 0 ? (
                        <button
                          type="button"
                          className="h-6 w-6 shrink-0 rounded text-sm leading-none text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
                          onClick={() => clearPostFeedFilter("role")}
                          aria-label="Clear role filter"
                        >×</button>
                      ) : (
                        <span className="w-6 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="post-feed-location" className="inline-block w-[60px] shrink-0">
                        Location
                      </Label>
                      <Input
                        id="post-feed-location"
                        value={postFeedDraftFilters.location}
                        onChange={(e) =>
                          setPostFeedDraftFilters((prev) => ({ ...prev, location: e.target.value }))
                        }
                        placeholder="Seattle"
                        className="h-8 min-w-0 flex-1"
                      />
                      {postFeedDraftFilters.location.trim().length > 0 ? (
                        <button
                          type="button"
                          className="h-6 w-6 shrink-0 rounded text-sm leading-none text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
                          onClick={() => clearPostFeedFilter("location")}
                          aria-label="Clear location filter"
                        >×</button>
                      ) : (
                        <span className="w-6 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="post-feed-recency" className="inline-block w-[60px] shrink-0">
                        Recency
                      </Label>
                      <select
                        id="post-feed-recency"
                        value={postFeedDraftFilters.recency}
                        onChange={(e) =>
                          setPostFeedDraftFilters((prev) => ({
                            ...prev,
                            recency: e.target.value as PostFeedRecencyFilter,
                          }))
                        }
                        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors duration-200 hover:border-[color-mix(in_srgb,var(--intent-primary)_24%,var(--input))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--intent-primary)_32%,transparent)]"
                      >
                        <option value="any">Any</option>
                        <option value="past-24h">Past 24 hours</option>
                        <option value="past-week">Past week</option>
                        <option value="past-month">Past month</option>
                      </select>
                      {postFeedDraftFilters.recency !== "any" ? (
                        <button
                          type="button"
                          className="h-6 w-6 shrink-0 rounded text-sm leading-none text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
                          onClick={() => clearPostFeedFilter("recency")}
                          aria-label="Clear recency filter"
                        >×</button>
                      ) : (
                        <span className="w-6 shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="post-feed-work-mode" className="inline-block w-[60px] shrink-0">
                        Work mode
                      </Label>
                      <select
                        id="post-feed-work-mode"
                        value={postFeedDraftFilters.workMode}
                        onChange={(e) =>
                          setPostFeedDraftFilters((prev) => ({
                            ...prev,
                            workMode: e.target.value as PostFeedWorkModeFilter,
                          }))
                        }
                        className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors duration-200 hover:border-[color-mix(in_srgb,var(--intent-primary)_24%,var(--input))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--intent-primary)_32%,transparent)]"
                      >
                        <option value="any">Any</option>
                        <option value="onsite">Onsite</option>
                        <option value="hybrid">Hybrid</option>
                        <option value="remote">Remote</option>
                        <option value="unknown">Unknown</option>
                      </select>
                      {postFeedDraftFilters.workMode !== "any" ? (
                        <button
                          type="button"
                          className="h-6 w-6 shrink-0 rounded text-sm leading-none text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
                          onClick={() => clearPostFeedFilter("workMode")}
                          aria-label="Clear work mode filter"
                        >×</button>
                      ) : (
                        <span className="w-6 shrink-0" />
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t border-[var(--intent-muted-border)] pt-3">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left"
                    onClick={() => setIsAdvancedFiltersOpen((prev) => !prev)}
                    aria-expanded={isAdvancedFiltersOpen}
                    aria-controls="more-options-feed-filters"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        More options
                      </span>
                      {postFeedDraftAdvancedFilterCount > 0 ? (
                        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--intent-primary)] px-1.5 text-[11px] font-semibold text-white">
                          {postFeedDraftAdvancedFilterCount}
                        </span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {isAdvancedFiltersOpen ? "▲" : "▼"}
                    </span>
                  </button>

                  {isAdvancedFiltersOpen ? (
                    <div id="more-options-feed-filters" className="mt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="post-feed-employment-type" className="inline-block w-[72px] shrink-0">
                          Emp type
                        </Label>
                        <select
                          id="post-feed-employment-type"
                          value={postFeedDraftFilters.employmentType}
                          onChange={(e) =>
                            setPostFeedDraftFilters((prev) => ({
                              ...prev,
                              employmentType: e.target.value as PostFeedEmploymentFilter,
                            }))
                          }
                          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors duration-200 hover:border-[color-mix(in_srgb,var(--intent-primary)_24%,var(--input))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--intent-primary)_32%,transparent)]"
                        >
                          <option value="any">Any</option>
                          <option value="full-time">Full time</option>
                          <option value="part-time">Part time</option>
                          <option value="contract">Contract</option>
                          <option value="internship">Internship</option>
                          <option value="unknown">Unknown</option>
                        </select>
                        {postFeedDraftFilters.employmentType !== "any" ? (
                          <button
                            type="button"
                            className="h-6 w-6 shrink-0 rounded text-sm leading-none text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
                            onClick={() => clearPostFeedFilter("employmentType")}
                            aria-label="Clear employment type filter"
                          >×</button>
                        ) : (
                          <span className="w-6 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="post-feed-poster-type" className="inline-block w-[72px] shrink-0">
                          Poster type
                        </Label>
                        <select
                          id="post-feed-poster-type"
                          value={postFeedDraftFilters.posterType}
                          onChange={(e) =>
                            setPostFeedDraftFilters((prev) => ({
                              ...prev,
                              posterType: e.target.value as PostFeedPosterTypeFilter,
                            }))
                          }
                          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors duration-200 hover:border-[color-mix(in_srgb,var(--intent-primary)_24%,var(--input))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--intent-primary)_32%,transparent)]"
                        >
                          <option value="any">Any</option>
                          <option value="hiring_manager">Hiring Manager</option>
                          <option value="recruiter">Recruiter</option>
                          <option value="unknown">Unknown</option>
                        </select>
                        {postFeedDraftFilters.posterType !== "any" ? (
                          <button
                            type="button"
                            className="h-6 w-6 shrink-0 rounded text-sm leading-none text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
                            onClick={() => clearPostFeedFilter("posterType")}
                            aria-label="Clear poster type filter"
                          >×</button>
                        ) : (
                          <span className="w-6 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="post-feed-match-strength" className="inline-block w-[72px] shrink-0">
                          Match
                        </Label>
                        <select
                          id="post-feed-match-strength"
                          value={postFeedDraftFilters.matchStrength}
                          onChange={(e) =>
                            setPostFeedDraftFilters((prev) => ({
                              ...prev,
                              matchStrength: e.target.value as PostFeedMatchStrengthFilter,
                            }))
                          }
                          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors duration-200 hover:border-[color-mix(in_srgb,var(--intent-primary)_24%,var(--input))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--intent-primary)_32%,transparent)]"
                        >
                          <option value="any">Any</option>
                          <option value="strong">Strong</option>
                          <option value="medium">Medium</option>
                          <option value="weak">Weak</option>
                          <option value="unscored">Unscored</option>
                        </select>
                        {postFeedDraftFilters.matchStrength !== "any" ? (
                          <button
                            type="button"
                            className="h-6 w-6 shrink-0 rounded text-sm leading-none text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
                            onClick={() => clearPostFeedFilter("matchStrength")}
                            aria-label="Clear match strength filter"
                          >×</button>
                        ) : (
                          <span className="w-6 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="post-feed-source" className="inline-block w-[72px] shrink-0">
                          Source
                        </Label>
                        <select
                          id="post-feed-source"
                          value={postFeedDraftFilters.source}
                          onChange={(e) =>
                            setPostFeedDraftFilters((prev) => ({
                              ...prev,
                              source: e.target.value as PostFeedSourceFilter,
                            }))
                          }
                          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors duration-200 hover:border-[color-mix(in_srgb,var(--intent-primary)_24%,var(--input))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--intent-primary)_32%,transparent)]"
                        >
                          <option value="any">Any</option>
                          <option value="retrieved">Retrieved</option>
                          <option value="fresh">Fresh</option>
                          <option value="both">Retrieved + Fresh</option>
                        </select>
                        {postFeedDraftFilters.source !== "any" ? (
                          <button
                            type="button"
                            className="h-6 w-6 shrink-0 rounded text-sm leading-none text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
                            onClick={() => clearPostFeedFilter("source")}
                            aria-label="Clear source filter"
                          >×</button>
                        ) : (
                          <span className="w-6 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="post-feed-status" className="inline-block w-[72px] shrink-0">
                          Status
                        </Label>
                        <select
                          id="post-feed-status"
                          value={postFeedDraftFilters.status}
                          onChange={(e) =>
                            setPostFeedDraftFilters((prev) => ({
                              ...prev,
                              status: e.target.value as PostFeedStatusFilter,
                            }))
                          }
                          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors duration-200 hover:border-[color-mix(in_srgb,var(--intent-primary)_24%,var(--input))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--intent-primary)_32%,transparent)]"
                        >
                          <option value="any">Any</option>
                          <option value="not_reviewed">Not reviewed</option>
                          <option value="interested">Interested</option>
                          <option value="applied">Applied</option>
                          <option value="messaged">Messaged</option>
                          <option value="ignored">Ignored</option>
                        </select>
                        {postFeedDraftFilters.status !== "any" ? (
                          <button
                            type="button"
                            className="h-6 w-6 shrink-0 rounded text-sm leading-none text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
                            onClick={() => clearPostFeedFilter("status")}
                            aria-label="Clear status filter"
                          >×</button>
                        ) : (
                          <span className="w-6 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label htmlFor="post-feed-new-only" className="inline-block w-[72px] shrink-0">
                          New only
                        </Label>
                        <select
                          id="post-feed-new-only"
                          value={postFeedDraftFilters.newOnly}
                          onChange={(e) =>
                            setPostFeedDraftFilters((prev) => ({
                              ...prev,
                              newOnly: e.target.value as PostFeedNewOnlyFilter,
                            }))
                          }
                          className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-1 text-sm transition-colors duration-200 hover:border-[color-mix(in_srgb,var(--intent-primary)_24%,var(--input))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--intent-primary)_32%,transparent)]"
                        >
                          <option value="any">Any</option>
                          <option value="new_only">New only</option>
                        </select>
                        {postFeedDraftFilters.newOnly !== "any" ? (
                          <button
                            type="button"
                            className="h-6 w-6 shrink-0 rounded text-sm leading-none text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-foreground"
                            onClick={() => clearPostFeedFilter("newOnly")}
                            aria-label="Clear new-only filter"
                          >×</button>
                        ) : (
                          <span className="w-6 shrink-0" />
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    onClick={applyPostFeedFilters}
                    disabled={!hasPendingPostFeedFilterChanges}
                  >
                    Apply Filters
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={resetPostFeedFilters}>
                    Reset Filters
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="overflow-hidden border-[var(--intent-muted-border)] bg-[var(--section-workspace-bg)] p-0">
              <div className="flex items-center justify-between border-b border-[var(--intent-muted-border)] bg-[var(--section-workspace-bg)] px-4 py-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold">Post feed</h2>
                  {postFeedRows.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {filteredPostFeedRows.length} result
                      {filteredPostFeedRows.length === 1 ? "" : "s"}
                      {filteredPostFeedRows.length !== postFeedRows.length
                        ? ` (of ${postFeedRows.length})`
                        : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 rounded-md border border-[var(--intent-muted-border)] bg-background px-2 py-1">
                  <span className="text-xs font-medium text-muted-foreground">Sorted by</span>
                  <select
                    aria-label="Sort Post feed"
                    value={postFeedSortMode}
                    onChange={(e) => setPostFeedSortMode(e.target.value as PostFeedSortMode)}
                    className="h-8 rounded-md border border-input bg-background px-2 text-xs transition-colors duration-200 hover:border-[color-mix(in_srgb,var(--intent-primary)_24%,var(--input))] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_srgb,var(--intent-primary)_32%,transparent)]"
                  >
                    <option value="best_match">Best Match</option>
                    <option value="most_recent">Most Recent</option>
                    <option value="highest_author_strength">Highest Author Strength</option>
                  </select>
                </div>
              </div>

              <div className="max-h-[72vh] overflow-y-auto bg-background p-4 scroll-smooth lg:h-[calc(100vh-170px)] lg:max-h-none">
                {isRetrievedVisibleWhileRunning ? (
                  <div className="mb-3 flex items-center gap-2 rounded-md border border-[var(--intent-muted-border)] bg-[var(--brand-soft)] px-3 py-2 text-xs text-foreground">
                    <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-[var(--intent-primary)]" />
                    <span>{RUNNING_FEED_STATUS_WITH_RESULTS_COPY}</span>
                  </div>
                ) : null}
                {!isRunActive && lastRunNewLeadCount != null ? (
                  <div className="mb-3 rounded-md border border-[var(--intent-muted-border)] bg-background px-3 py-2 text-xs text-muted-foreground">
                    {lastRunNewLeadCount > 0
                      ? `Added ${lastRunNewLeadCount} new post${
                          lastRunNewLeadCount === 1 ? "" : "s"
                        }`
                      : "No new posts found"}
                  </div>
                ) : null}
                {isNoRetrievedWhileRunning ? (
                  <div className="space-y-3">
                    <div className="relative mb-3 overflow-hidden rounded-md border border-[var(--intent-muted-border)] bg-[var(--brand-soft)] px-3 py-1.5 text-xs text-foreground">
                      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-transparent via-background/30 to-transparent opacity-40 motion-safe:animate-pulse motion-reduce:animate-none" />
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--intent-primary)] motion-safe:animate-[pulse_1.05s_ease-in-out_infinite] motion-reduce:animate-none" />
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-[var(--intent-primary)] motion-safe:animate-[pulse_1.05s_ease-in-out_infinite] motion-reduce:animate-none"
                            style={{ animationDelay: "140ms" }}
                          />
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-[var(--intent-primary)] motion-safe:animate-[pulse_1.05s_ease-in-out_infinite] motion-reduce:animate-none"
                            style={{ animationDelay: "280ms" }}
                          />
                        </span>
                        <span>{RUNNING_FEED_STATUS_EMPTY_COPY}</span>
                      </div>
                    </div>
                    {Array.from({ length: 4 }).map((_, idx) => (
                      <div
                        key={`post-feed-skeleton-${idx}`}
                        className="rounded-lg border border-[var(--intent-muted-border)] bg-background p-3"
                      >
                        <div className="grid gap-3 lg:grid-cols-[minmax(0,35%)_minmax(0,15%)_minmax(0,20%)_minmax(0,15%)_minmax(0,15%)]">
                          <div className="space-y-2">
                            <div className="h-3.5 w-4/5 animate-pulse rounded bg-muted" />
                            <div className="h-3 w-3/5 animate-pulse rounded bg-muted" />
                            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                            <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                          </div>
                          <div className="space-y-2 lg:border-l lg:border-border/50 lg:pl-3">
                            <div className="h-5 w-24 animate-pulse rounded bg-muted" />
                            <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                            <div className="h-5 w-28 animate-pulse rounded bg-muted" />
                          </div>
                          <div className="space-y-2 lg:border-l lg:border-border/50 lg:pl-3">
                            <div className="h-3 w-20 animate-pulse rounded bg-muted" />
                            <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
                            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
                          </div>
                          <div className="flex items-center justify-center lg:border-l lg:border-border/50 lg:pl-3">
                            <div className="h-8 w-28 animate-pulse rounded bg-muted" />
                          </div>
                          <div className="space-y-2 lg:border-l lg:border-border/50 lg:pl-3">
                            <div className="h-3 w-14 animate-pulse rounded bg-muted" />
                            <div className="h-8 w-full animate-pulse rounded bg-muted" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : postFeedRows.length === 0 ? (
                  <div className="flex min-h-[320px] flex-col items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--intent-muted-border)] bg-background text-base">
                      ◌
                    </span>
                    <p className="text-sm text-foreground">Run a search to see matching posts.</p>
                  </div>
                ) : filteredPostFeedRows.length === 0 ? (
                  <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 p-6 text-center">
                    <p className="text-sm text-foreground">No posts match the current filters.</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={resetPostFeedFilters}
                    >
                      Reset Filters
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {visiblePostFeedRows.map((row) => (
                      <PostCard
                        key={row.key}
                        title={row.displayRoleTitle}
                        company={row.companyDisplayText}
                        locationDisplay={row.locationDisplay}
                        postAuthor={row.displayPostAuthor ?? null}
                        authorHeadline={row.authorProfile?.headline ?? null}
                        authorTypeLabel={row.authorTypeLabel}
                        postedAt={row.lead.postedAt ?? null}
                        workMode={row.lead.workMode ?? null}
                        leadScore={row.score}
                        roleMatchScore={row.roleMatchScore}
                        locationMatchScore={row.locationMatchScore}
                        authorStrengthScore={row.authorStrengthScore}
                        hiringIntentScore={row.hiringIntentScore}
                        employmentTypeScore={row.employmentTypeScore}
                        baseScore={row.baseScore}
                        intentBoost={row.intentBoost}
                        finalScore100={row.finalScore100}
                        gatedToZero={row.gatedToZero}
                        gateReason={row.gateReason}
                        sourceBadge={row.sourceSignal}
                        isNew={row.isNew}
                        postUrl={row.viewPostUrl}
                        selectedLocation={location}
                        onGenerateMessage={() => void onGenerateMessageForRow(row)}
                        onRegenerateMessage={() =>
                          void onGenerateMessageForRow(row, { force: true })
                        }
                        isMessageGenerating={Boolean(messageGeneratingByRow[row.key])}
                        messageDraft={generatedMessagesByRow[row.key] ?? null}
                        messageError={messageErrorByRow[row.key] ?? null}
                        onDismissMessageError={() =>
                          setMessageErrorByRow((prev) => ({ ...prev, [row.key]: null }))
                        }
                        onCopyMessage={() => void onCopyMessageForRow(row)}
                        isMessageCopied={messageCopiedRowKey === row.key}
                        onOpenMessageDrawer={() => setMessageDrawerRowKey(row.key)}
                        showResumeNudge={!resumeRawText}
                        status={coercePostReviewStatus(postFeedStatuses[row.statusStorageKey])}
                        onStatusChange={(nextStatus) =>
                          setPostFeedStatus(row.statusStorageKey, nextStatus)
                        }
                        isLocationLowConfidence={row.isLocationLowConfidence}
                        isCompanyLowConfidence={row.isCompanyLowConfidence}
                        isPostedByCompany={row.isPostedByCompany}
                      />
                    ))}

                    {hasMorePostFeedRows ? (
                      <div className="flex flex-col items-center gap-2 pt-2">
                        <p className="text-center text-xs text-muted-foreground">
                          Showing {visiblePostFeedRows.length} of {filteredPostFeedRows.length}{" "}
                          posts
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setPostFeedVisibleCount((prev) => prev + POST_FEED_LOAD_MORE_COUNT)
                          }
                        >
                          Load More
                        </Button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </Card>
          </div>
          {selectedDrawerRow ? (
            <>
              <button
                type="button"
                aria-label="Close message drawer"
                className="fixed inset-0 z-40 bg-black/20"
                onClick={() => setMessageDrawerRowKey(null)}
              />
              <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-border bg-background shadow-xl">
                <div className="border-b border-border/70 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-sm font-semibold">
                        {selectedDrawerRow.displayRoleTitle}
                      </h3>
                    </div>
                    <button
                      type="button"
                      aria-label="Close message drawer"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={() => setMessageDrawerRowKey(null)}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {!resumeRawText ? (
                    <p className="rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-xs text-muted-foreground">
                      Tip: Upload your resume for stronger personalization.
                    </p>
                  ) : null}
                  {messageGeneratingByRow[selectedDrawerRow.key] ? (
                    <p className="rounded-md border border-border/60 bg-muted/20 p-2.5 text-xs text-muted-foreground">
                      Generating a tailored message...
                    </p>
                  ) : null}

                  {!messageGeneratingByRow[selectedDrawerRow.key] &&
                  messageErrorByRow[selectedDrawerRow.key] ? (
                    <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
                      <p
                        className="truncate text-xs text-destructive"
                        title={messageErrorByRow[selectedDrawerRow.key] ?? undefined}
                      >
                        {messageErrorByRow[selectedDrawerRow.key]}
                      </p>
                      <div className="space-y-1.5">
                        <Label htmlFor={`drawer-instruction-${selectedDrawerRow.key}`}>
                          Regeneration instruction (optional)
                        </Label>
                        <Input
                          id={`drawer-instruction-${selectedDrawerRow.key}`}
                          value={selectedDrawerInstruction}
                          onChange={(event) =>
                            setMessageDrawerInstructionByRow((prev) => ({
                              ...prev,
                              [selectedDrawerRow.key]: event.target.value,
                            }))
                          }
                          placeholder="e.g. make it more direct"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          type="button"
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            void onGenerateMessageForRow(selectedDrawerRow, {
                              force: true,
                              userInstruction: selectedDrawerInstruction,
                            })
                          }
                        >
                          Retry
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          type="button"
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            setMessageErrorByRow((prev) => ({
                              ...prev,
                              [selectedDrawerRow.key]: null,
                            }))
                          }
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {!messageGeneratingByRow[selectedDrawerRow.key] &&
                  !messageErrorByRow[selectedDrawerRow.key] &&
                  generatedMessagesByRow[selectedDrawerRow.key] ? (
                    <>
                      <div className="relative max-h-[44vh] overflow-y-auto rounded-md border border-border/60 bg-background/80 p-3 pr-10">
                        <button
                          type="button"
                          aria-label="Copy generated message"
                          className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          onClick={() => void onCopyMessageForRow(selectedDrawerRow)}
                        >
                          {messageCopiedRowKey === selectedDrawerRow.key ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                          {generatedMessagesByRow[selectedDrawerRow.key]}
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor={`drawer-instruction-${selectedDrawerRow.key}`}>
                          Regeneration instruction (optional)
                        </Label>
                        <Input
                          id={`drawer-instruction-${selectedDrawerRow.key}`}
                          value={selectedDrawerInstruction}
                          onChange={(event) =>
                            setMessageDrawerInstructionByRow((prev) => ({
                              ...prev,
                              [selectedDrawerRow.key]: event.target.value,
                            }))
                          }
                          placeholder="e.g. make it more direct"
                        />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          type="button"
                          className="h-7 px-2 text-xs"
                          onClick={() =>
                            void onGenerateMessageForRow(selectedDrawerRow, {
                              force: true,
                              userInstruction: selectedDrawerInstruction,
                            })
                          }
                        >
                          Regenerate
                        </Button>
                      </div>
                    </>
                  ) : null}

                  {!messageGeneratingByRow[selectedDrawerRow.key] &&
                  !messageErrorByRow[selectedDrawerRow.key] &&
                  !generatedMessagesByRow[selectedDrawerRow.key] ? (
                    <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-2.5">
                      <p className="text-xs text-muted-foreground">
                        Generate a message draft for this post.
                      </p>
                      <div className="space-y-1.5">
                        <Label htmlFor={`drawer-instruction-${selectedDrawerRow.key}`}>
                          Regeneration instruction (optional)
                        </Label>
                        <Input
                          id={`drawer-instruction-${selectedDrawerRow.key}`}
                          value={selectedDrawerInstruction}
                          onChange={(event) =>
                            setMessageDrawerInstructionByRow((prev) => ({
                              ...prev,
                              [selectedDrawerRow.key]: event.target.value,
                            }))
                          }
                          placeholder="e.g. make it more direct"
                        />
                      </div>
                      <Button
                        size="sm"
                        type="button"
                        className="h-7 px-2 text-xs"
                        onClick={() =>
                          void onGenerateMessageForRow(selectedDrawerRow, {
                            userInstruction: selectedDrawerInstruction,
                          })
                        }
                      >
                        Generate Message
                      </Button>
                    </div>
                  ) : null}
                </div>
              </aside>
            </>
          ) : null}
        </>
      ) : (
        <>
          <div ref={graphSectionRef} className="flex w-full flex-col">
            <Card className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold">Graph</h2>
                  <p className="text-xs text-muted-foreground">
                    Generated from the precise flow implemented.
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-2.5">
                  <p className="text-xs text-muted-foreground">
                    Step {displayedGraphStep} of {startedSequence.length}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!hasRunData}
                    onClick={() => {
                      setIsPlaybackPlaying(false);
                      setIsGraphPlaybackEngaged(false);
                      setPlaybackIndex(0);
                      setCurrentStep(0);
                    }}
                    className="h-9 px-3 shadow-none transition-all duration-150 ease-out hover:bg-muted/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100"
                  >
                    Reset View
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isRunning || !hasRunData}
                    onClick={() => {
                      setIsGraphPlaybackEngaged(true);
                      setIsPlaybackPlaying((v) => !v);
                    }}
                    title={isPlaybackPlaying ? "Pause" : "Autoplay"}
                    aria-label={isPlaybackPlaying ? "Pause" : "Autoplay"}
                    className="h-9 gap-2 px-3 shadow-none transition-all duration-150 ease-out hover:bg-muted/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100"
                  >
                    {isPlaybackPlaying ? (
                      <Pause size={16} strokeWidth={1.75} />
                    ) : (
                      <Play size={16} strokeWidth={1.75} />
                    )}
                    {isPlaybackPlaying ? "Pause" : "Auto Step"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isRunning || currentStep === 0}
                    onClick={() =>
                      setPlaybackIndex((prev) => {
                        setIsGraphPlaybackEngaged(true);
                        const next = Math.max(0, Math.min(playbackNodes.length - 1, prev - 1));
                        setCurrentStep(next);
                        return next;
                      })
                    }
                    title="Previous Node"
                    aria-label="Previous Node"
                    className="h-9 gap-2 px-3 shadow-none transition-all duration-150 ease-out hover:bg-muted/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100"
                  >
                    <SkipBack size={16} strokeWidth={1.75} />
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isRunning || currentStep === Math.max(playbackNodes.length - 1, 0)}
                    onClick={() =>
                      setPlaybackIndex((prev) => {
                        setIsGraphPlaybackEngaged(true);
                        const next = Math.min(playbackNodes.length - 1, prev + 1);
                        setCurrentStep(next);
                        return next;
                      })
                    }
                    title="Next Node"
                    aria-label="Next Node"
                    className="h-9 gap-2 px-3 shadow-none transition-all duration-150 ease-out hover:bg-muted/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:active:scale-100"
                  >
                    <SkipForward size={16} strokeWidth={1.75} />
                    Next
                  </Button>
                </div>
              </div>
              <div className="mt-3">
                <AgentGraphDiagram
                  activeNode={graphActiveNode}
                  graph={result?.graph ?? FALLBACK_GRAPH}
                  completedNodes={completedNodes}
                  nodeDetails={nodeDetails}
                  traversedEdges={traversedEdges}
                  variant="data-flow"
                  highlightDataFlow={!isPostRunNeutralGraph}
                  onNodeClick={(nodeId) => {
                    setIsPlaybackPlaying(false);
                    setIsGraphPlaybackEngaged(true);
                    setSelectedLogNode(nodeId);
                    const idx = startedSequence.findIndex((s) => s.node === nodeId);
                    if (idx >= 0) {
                      setPlaybackIndex(idx);
                      setCurrentStep(idx);
                    }
                    const iterationsForNode = liveLogEntries
                      .filter((entry) => entry.node === nodeId)
                      .map((entry) => entry.iteration);
                    if (iterationsForNode.length > 0) {
                      const latestIteration = Math.max(...iterationsForNode);
                      setSelectedLogIteration(String(latestIteration));
                    } else if (iterationsAvailable.length > 0) {
                      setSelectedLogIteration(String(iterationsAvailable[iterationsAvailable.length - 1]));
                    }
                  }}
                />
              </div>
            </Card>
          </div>

          <div className="grid w-full gap-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,3fr)_minmax(0,3fr)]">
            <Card className="flex h-[360px] flex-col p-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold">Nodewise Summary</h2>
                </div>
                <p className="text-xs text-muted-foreground">
                  Auto-generated from selected node + iteration.
                </p>
                <div className="flex items-center gap-2">
                <select
                  value={selectedLogIteration}
                  onChange={(e) => setSelectedLogIteration(e.target.value)}
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                >
                  <option value="">Iteration</option>
                  {iterationsAvailable.map((iter) => (
                    <option key={`iter-filter-${iter}`} value={String(iter)}>
                      Iteration {iter + 1}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedLogNode}
                  onChange={(e) => setSelectedLogNode(e.target.value)}
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                >
                  <option value="">Node</option>
                  {nodesForSelectedIteration.map((node) => (
                    <option key={`node-filter-${node}`} value={node}>
                      {node}
                    </option>
                  ))}
                </select>
                </div>
              </div>
              <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-border/60 bg-background p-3 text-sm">
                {isGeneratingNodewiseExplanation ? (
                  <p className="text-muted-foreground">Generating concise node summary...</p>
                ) : nodewiseExplanation ? (
                  <div className="space-y-4 text-foreground">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Summary
                      </p>
                      <p className="mt-1 leading-relaxed">{nodewiseExplanation.summary}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Inputs
                      </p>
                      <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
                        {nodewiseExplanation.inputs.map((item, i) => (
                          <li key={`explain-input-${i}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Outputs
                      </p>
                      <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
                        {nodewiseExplanation.outputs.map((item, i) => (
                          <li key={`explain-output-${i}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        State
                      </p>
                      <ul className="mt-1.5 list-disc space-y-1.5 pl-5">
                        {nodewiseExplanation.state.map((item, i) => (
                          <li key={`explain-state-${i}`}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    Select Iteration and Node to generate a concise node summary.
                  </p>
                )}
              </div>
            </Card>

            <Card className="flex h-[360px] flex-col p-4">
              <h2 className="text-sm font-semibold">Latency view</h2>
              <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-border/60">
                <table className="min-w-full text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-muted/80">
                    <tr>
                      <th className="w-[1%] whitespace-nowrap px-3 py-2 font-medium">Metric</th>
                      {iterationTimingRows.map((row) => (
                        <th
                          key={`iter-col-${row.iteration}`}
                          className="w-[96px] whitespace-nowrap px-3 py-2 font-medium"
                        >
                          Iteration {row.iteration + 1}
                          <div className="text-[10px] text-muted-foreground/90">
                            Σ{" "}
                            {typeof latencyTotalsByIteration.get(row.iteration) === "number"
                              ? `${Math.round(latencyTotalsByIteration.get(row.iteration) ?? 0)} ms`
                              : "-"}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {latencyMetricRows.map((metric, metricIndex) => {
                      if (metric.kind === "section") {
                        return (
                          <tr key={`latency-section-${metric.label}-${metricIndex}`} className="border-t border-border/70 bg-muted/30">
                            <td className="w-[1%] whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {metric.label}
                            </td>
                            {iterationTimingRows.length === 0 ? (
                              <td className="w-[96px] whitespace-nowrap px-3 py-2 text-muted-foreground">-</td>
                            ) : (
                              iterationTimingRows.map((row) => (
                                <td
                                  key={`latency-section-${metric.label}-${row.iteration}`}
                                  className="w-[96px] whitespace-nowrap px-3 py-2 text-muted-foreground"
                                >
                                  -
                                </td>
                              ))
                            )}
                          </tr>
                        );
                      }

                      return (
                        <tr key={`metric-${metric.key}-${metricIndex}`} className="border-t border-border/50">
                          <td className={`w-[1%] whitespace-nowrap px-3 py-2 ${metric.indent === 0 ? "font-medium" : "text-muted-foreground"}`}>
                            {metric.indent === 0 ? metric.label : `\u21B3 ${metric.label}`}
                          </td>
                          {iterationTimingRows.length === 0 ? (
                            <td className="w-[96px] whitespace-nowrap px-3 py-2 text-muted-foreground">
                              -
                            </td>
                          ) : (
                            iterationTimingRows.map((row) => {
                              const value = row[metric.key];
                              const text =
                                typeof value !== "number"
                                  ? "-"
                                  : metric.unit === "ms"
                                    ? `${Math.round(value)} ms`
                                    : String(Math.round(value));
                              return (
                                <td
                                  key={`metric-${metric.key}-${row.iteration}`}
                                  className="w-[96px] whitespace-nowrap px-3 py-2"
                                >
                                  {text}
                                </td>
                              );
                            })
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="flex h-[360px] flex-col p-4">
              <h2 className="text-sm font-semibold">Final summary</h2>
              <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-md border border-border/60">
                <table className="min-w-full text-left text-xs">
                  <tbody>
                    {[
                      ["taskComplete", result ? String(result.final.taskComplete) : "-"],
                      ["stopReason", result ? (result.final.stopReason ?? "null") : "-"],
                      [
                        "plannerMode",
                        result ? formatPlannerModeLabel(result.final.plannerMode ?? null) : "-",
                      ],
                      [
                        "iterationsUsed",
                        result ? String(iterationPasses || result.final.iteration + 1) : "-",
                      ],
                      ["retrieved", result ? String(result.final.counts.retrieved) : "-"],
                      ["generated", result ? String(result.final.counts.generated) : "-"],
                      ["merged", result ? String(result.final.counts.merged) : "-"],
                      ["newForUser", result ? String(result.final.counts.newForUser) : "-"],
                    ].map(([k, v]) => (
                      <tr key={`summary-${k}`} className="border-t border-border/50">
                        <td className="w-[1%] whitespace-nowrap px-3 py-2 font-medium">{k}</td>
                        <td className="px-3 py-2">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {result ? (
            <Card className="p-4">
              <h2 className="text-sm font-semibold">Cost guard</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Agent-side safety limits and observed Apify call count for this run.
              </p>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
                <p>apifyCallsMade: {costGuardMetrics.apifyCallsMade}</p>
                <p>queriesInRun: {costGuardMetrics.queryCount}</p>
                <p>maxItemsPerCall: {costGuardMetrics.maxItemsPerCall}</p>
                <p>payloadAttemptsPerQuery: {costGuardMetrics.payloadAttemptsPerQuery}</p>
                <p>apiEventsCaptured: {liveApiCalls.length}</p>
              </div>
              {costGuardMetrics.apifyCallsMade === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  reason: {costGuardMetrics.apifyCallsZeroReason}
                </p>
              ) : null}
            </Card>
          ) : null}

          <div className="grid w-full gap-4 lg:grid-cols-2">
            <Card className="p-4">
              <h2 className="text-sm font-semibold">Planner Decision</h2>
              <div className="mt-3 overflow-auto rounded-md border border-border/60">
                <table className="min-w-full text-left text-xs">
                  <tbody>
                    {[
                      [
                        "iteration",
                        plannerDecisionSnapshot.iteration == null
                          ? "n/a"
                          : String(plannerDecisionSnapshot.iteration),
                      ],
                      [
                        "highQualityLeadsCount",
                        plannerDecisionSnapshot.highQualityLeadsCount == null
                          ? "n/a"
                          : String(plannerDecisionSnapshot.highQualityLeadsCount),
                      ],
                      [
                        "targetHighQualityLeads",
                        plannerDecisionSnapshot.targetHighQualityLeads == null
                          ? "n/a"
                          : String(plannerDecisionSnapshot.targetHighQualityLeads),
                      ],
                      ["plannerMode", plannerDecisionSnapshot.plannerModeLabel],
                      [
                        "enableRetrieval",
                        plannerDecisionSnapshot.enableRetrieval == null
                          ? "n/a"
                          : String(plannerDecisionSnapshot.enableRetrieval),
                      ],
                      [
                        "enableNewLeadGeneration",
                        plannerDecisionSnapshot.enableNewLeadGeneration == null
                          ? "n/a"
                          : String(plannerDecisionSnapshot.enableNewLeadGeneration),
                      ],
                      [
                        "numExploreQueries",
                        plannerDecisionSnapshot.numExploreQueries == null
                          ? "n/a"
                          : String(plannerDecisionSnapshot.numExploreQueries),
                      ],
                    ].map(([k, v]) => (
                      <tr key={`planner-decision-${k}`} className="border-t border-border/50">
                        <td
                          className="w-[1%] whitespace-nowrap px-3 py-2 font-medium"
                          suppressHydrationWarning
                        >
                          {k}
                        </td>
                        <td className="px-3 py-2" suppressHydrationWarning>
                          {v}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  rationale
                </p>
                {plannerDecisionSnapshot.rationale.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">No rationale yet.</p>
                ) : (
                  <ol className="mt-1 list-decimal space-y-1 pl-4 text-xs">
                    {plannerDecisionSnapshot.rationale.map((item, idx) => (
                      <li key={`planner-rationale-${idx}`}>{item}</li>
                    ))}
                  </ol>
                )}
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="text-sm font-semibold">Data Source Breakdown</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Computed from combined provenance and scored top leads.
              </p>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <p>totalRetrievedLeads: {retrievalVsFreshSnapshot.totalRetrievedLeads}</p>
                <p>totalFreshLeads: {retrievalVsFreshSnapshot.totalFreshLeads}</p>
                <p>totalBothLeads: {retrievalVsFreshSnapshot.totalBothLeads}</p>
                <p>selectedRetrievedLeads: {retrievalVsFreshSnapshot.selectedRetrievedLeads}</p>
                <p>selectedFreshLeads: {retrievalVsFreshSnapshot.selectedFreshLeads}</p>
                <p>selectedTopLeads: {retrievalVsFreshSnapshot.selectedTotal}</p>
              </div>
              <div className="mt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  selected top leads composition
                </p>
                {retrievalVsFreshSnapshot.selectedTotal === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">No selected leads yet.</p>
                ) : (
                  <>
                    <div className="mt-2 flex h-3 w-full overflow-hidden rounded bg-muted">
                      <div
                        className="h-full bg-sky-500"
                        style={{
                          width: `${
                            (retrievalVsFreshSnapshot.selectedRetrievedOnlyLeads /
                              retrievalVsFreshSnapshot.selectedTotal) *
                            100
                          }%`,
                        }}
                      />
                      <div
                        className="h-full bg-emerald-500"
                        style={{
                          width: `${
                            (retrievalVsFreshSnapshot.selectedFreshOnlyLeads /
                              retrievalVsFreshSnapshot.selectedTotal) *
                            100
                          }%`,
                        }}
                      />
                      <div
                        className="h-full bg-amber-500"
                        style={{
                          width: `${
                            (retrievalVsFreshSnapshot.selectedBothLeads /
                              retrievalVsFreshSnapshot.selectedTotal) *
                            100
                          }%`,
                        }}
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                      <Badge variant="secondary">
                        retrieved: {retrievalVsFreshSnapshot.selectedRetrievedOnlyLeads}
                      </Badge>
                      <Badge variant="secondary">
                        fresh: {retrievalVsFreshSnapshot.selectedFreshOnlyLeads}
                      </Badge>
                      <Badge variant="secondary">
                        both: {retrievalVsFreshSnapshot.selectedBothLeads}
                      </Badge>
                      <Badge variant="secondary">
                        unknown: {retrievalVsFreshSnapshot.selectedUnknownLeads}
                      </Badge>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </div>

          <Card className="p-4">
            <h2 className="text-sm font-semibold">Scoring Breakdown</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Per-lead scoring factors for the selected top results. Expand a row to inspect
              component scores.
            </p>
            <div className="mt-3 h-[300px] overflow-auto rounded-md border border-border/60">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-muted/80">
                  <tr>
                    <th className="w-[1%] whitespace-nowrap px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Lead</th>
                    <th className="px-3 py-2 font-medium">Retrieved/Fresh</th>
                    <th className="px-3 py-2 font-medium">final leadScore</th>
                    <th className="w-[1%] whitespace-nowrap px-3 py-2 font-medium">Breakdown</th>
                  </tr>
                </thead>
                <tbody>
                  {finalLeads.length === 0 ? (
                    <tr className="border-t border-border/50">
                      <td className="px-3 py-2 text-muted-foreground" colSpan={5}>
                        No scored leads yet.
                      </td>
                    </tr>
                  ) : (
                    finalLeads.map((lead, idx) => {
                      const rowKey = `${lead.leadId ?? idx}-${lead.canonicalUrl}`;
                      const breakdown = resolveScoredLeadForRow(lead);
                      const isExpanded = Boolean(expandedScoreRows[rowKey]);
                      const freshness = lead.freshness ?? lead.sourceBadge ?? "fresh";
                      return (
                        <React.Fragment key={`score-breakdown-${rowKey}`}>
                          <tr className="border-t border-border/50">
                            <td className="whitespace-nowrap px-3 py-2 align-top">{idx + 1}</td>
                            <td className="px-3 py-2 align-top">
                              <div className="max-w-[420px] truncate">
                                {lead.postUrl ?? lead.canonicalUrl}
                              </div>
                            </td>
                            <td className="px-3 py-2 align-top">
                              <Badge variant="secondary">{freshness}</Badge>
                            </td>
                            <td className="px-3 py-2 align-top">
                              {breakdown
                                ? breakdown.leadScore.toFixed(3)
                                : lead.score != null
                                  ? lead.score.toFixed(3)
                                  : "unscored"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 align-top">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={!breakdown}
                                onClick={() =>
                                  setExpandedScoreRows((prev) => ({
                                    ...prev,
                                    [rowKey]: !prev[rowKey],
                                  }))
                                }
                              >
                                {isExpanded ? "Collapse" : "Expand"}
                              </Button>
                            </td>
                          </tr>
                          {isExpanded ? (
                            <tr className="border-t border-border/30 bg-muted/20">
                              <td colSpan={5} className="px-3 py-3">
                                {breakdown ? (
                                  <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                                    <p>roleMatchScore: {breakdown.roleMatchScore.toFixed(3)}</p>
                                    <p>
                                      locationMatchScore: {breakdown.locationMatchScore.toFixed(3)}
                                    </p>
                                    <p>
                                      authorStrengthScore:{" "}
                                      {breakdown.authorStrengthScore.toFixed(3)}
                                    </p>
                                    <p>
                                      hiringIntentScore: {breakdown.hiringIntentScore.toFixed(3)}
                                    </p>
                                    <p>
                                      intentBoost:{" "}
                                      {typeof breakdown.intentBoost === "number"
                                        ? breakdown.intentBoost
                                        : "-"}
                                    </p>
                                    <p>
                                      employmentTypeScore:{" "}
                                      {breakdown.employmentTypeScore.toFixed(3)}
                                    </p>
                                    <p>
                                      baseScore:{" "}
                                      {typeof breakdown.baseScore === "number"
                                        ? breakdown.baseScore.toFixed(3)
                                        : "-"}
                                    </p>
                                    <p>
                                      finalScore100:{" "}
                                      {typeof breakdown.finalScore100 === "number"
                                        ? breakdown.finalScore100.toFixed(0)
                                        : "-"}
                                    </p>
                                    <p>
                                      gatedToZero: {breakdown.gatedToZero ? "true" : "false"}
                                    </p>
                                    <p>gateReason: {breakdown.gateReason ?? "none"}</p>
                                    <p>
                                      final leadScore:{" "}
                                      {lead.score != null ? lead.score.toFixed(3) : "unscored"}
                                    </p>
                                    <p>
                                      rawLocationText:{" "}
                                      {breakdown.rawLocationText ?? "Location not specified"}
                                    </p>
                                    <p className="sm:col-span-2 lg:col-span-3">
                                      parsedLocations:{" "}
                                      <span className="font-mono">
                                        {JSON.stringify(breakdown.parsedLocations)}
                                      </span>
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-muted-foreground">
                                    No score breakdown data for this row.
                                  </p>
                                )}
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Job posts</h2>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onExportJobPostsCsv}
                disabled={finalLeads.length === 0}
              >
                Export CSV
              </Button>
            </div>
            <div className="mt-3 h-[420px] overflow-auto rounded-md border border-border/60">
              <table className="min-w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground backdrop-blur supports-[backdrop-filter]:bg-muted/80">
                  <tr>
                    <th className="w-[1%] whitespace-nowrap px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 font-medium">Generated query</th>
                    <th className="px-3 py-2 font-medium">Post URL</th>
                    <th className="px-3 py-2 font-medium">Post author</th>
                    <th className="px-3 py-2 font-medium">Post author URL</th>
                    <th className="px-3 py-2 font-medium">email_ID</th>
                    <th className="px-3 py-2 font-medium">location</th>
                    <th className="px-3 py-2 font-medium">company</th>
                    <th className="px-3 py-2 font-medium">companyLinkedinUrl</th>
                    <th className="px-3 py-2 font-medium">companyName</th>
                    <th className="px-3 py-2 font-medium">headline</th>
                    <th className="px-3 py-2 font-medium">about</th>
                    <th className="px-3 py-2 font-medium">Job title</th>
                    <th className="px-3 py-2 font-medium">Score</th>
                    <th className="px-3 py-2 font-medium">Fresh/Retrieved</th>
                    <th className="px-3 py-2 font-medium">Score details</th>
                  </tr>
                </thead>
                <tbody>
                  {finalLeads.length === 0 ? (
                    <tr className="border-t border-border/50">
                      <td className="px-3 py-2 text-muted-foreground" colSpan={16}>
                        Placeholder: no final leads yet. Run debug flow to populate rows.
                      </td>
                    </tr>
                  ) : (
                    finalLeads.map((lead, idx) => {
                      const rowKey = `${lead.leadId ?? idx}-${lead.canonicalUrl}-table`;
                      const authorProfile = resolveAuthorProfileForLead(lead);
                      const scoredLead = resolveScoredLeadForRow(lead);
                      const locationDisplay = formatLeadLocationDisplay({
                        locations: scoredLead?.parsedLocations.length
                          ? scoredLead.parsedLocations
                          : (lead.locations ?? []),
                        rawLocationText:
                          scoredLead?.rawLocationText ?? lead.rawLocationText ?? null,
                        location: lead.location ?? lead.jobLocation ?? null,
                        maxVisible: 3,
                      });
                      const sourceMetadata =
                        lead.sourceMetadataJson && typeof lead.sourceMetadataJson === "object"
                          ? lead.sourceMetadataJson
                          : null;
                      const postContext = resolvePostContextFromSourceMetadata(sourceMetadata);
                      const displayPostUrl =
                        toHttpUrlOrNull(postContext?.primaryPostUrl) ??
                        toHttpUrlOrNull(lead.postUrl) ??
                        toHttpUrlOrNull(lead.canonicalUrl);
                      const displayPostAuthor = postContext?.primaryAuthorName ?? lead.postAuthor;
                      const displayPostAuthorUrl =
                        toHttpUrlOrNull(postContext?.primaryAuthorProfileUrl) ??
                        toHttpUrlOrNull(lead.postAuthorUrl);
                      const displayRoleTitle = resolveDisplayRoleTitle({ lead });
                      const extraction =
                        sourceMetadata?.extraction && typeof sourceMetadata.extraction === "object"
                          ? (sourceMetadata.extraction as Record<string, unknown>)
                          : null;
                      const extractedCompany = resolveExtractedCompany({
                        leadCompany: lead.company ?? null,
                        extractionCompany:
                          typeof extraction?.company === "string" ? extraction.company : null,
                      });
                      const companyResolution = resolveDisplayCompany({
                        extractedCompany,
                        authorCompany:
                          authorProfile?.companyName ??
                          (typeof extraction?.authorCompanyName === "string"
                            ? extraction.authorCompanyName
                            : null),
                        authorCountry:
                          authorProfile?.country ??
                          (typeof extraction?.authorCountry === "string"
                            ? extraction.authorCountry
                            : null),
                        jobCountries: extractJobCountries(locationDisplay.parsedLocations),
                      });
                      const isExpanded = Boolean(expandedJobPostRows[rowKey]);
                      return (
                        <React.Fragment key={rowKey}>
                          <tr className="border-t border-border/50">
                            <td className="whitespace-nowrap px-3 py-2 align-top">{idx + 1}</td>
                            <td className="px-3 py-2 align-top">{lead.generatedQuery ?? "n/a"}</td>
                            <td className="px-3 py-2 align-top">
                              {displayPostUrl ? (
                                <a
                                  href={displayPostUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary underline"
                                >
                                  {displayPostUrl}
                                </a>
                              ) : (
                                lead.canonicalUrl
                              )}
                            </td>
                            <td className="px-3 py-2 align-top">
                              {displayPostAuthor ?? "Unknown"}
                            </td>
                            <td className="px-3 py-2 align-top">
                              {displayPostAuthorUrl ? (
                                <a
                                  href={displayPostAuthorUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary underline"
                                >
                                  {displayPostAuthorUrl}
                                </a>
                              ) : (
                                "N/A"
                              )}
                            </td>
                            <td className="px-3 py-2 align-top">
                              {authorProfile?.email_ID ?? "N/A"}
                            </td>
                            <td
                              className="px-3 py-2 align-top"
                              title={
                                locationDisplay.omittedCount > 0
                                  ? (locationDisplay.full ?? undefined)
                                  : undefined
                              }
                            >
                              {locationDisplay.display}
                            </td>
                            <td className="px-3 py-2 align-top">
                              <div className="inline-flex items-center gap-1">
                                <span>{companyResolution.displayCompanyText}</span>
                                {companyResolution.isLowConfidence ? (
                                  <span
                                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-[10px] text-amber-700"
                                    title="Company inferred from author profile (low confidence)"
                                  >
                                    i
                                  </span>
                                ) : null}
                                {companyResolution.fallbackBlockedByCountryMismatch ? (
                                  <span
                                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-muted-foreground/40 bg-muted/40 text-[10px] text-muted-foreground"
                                    title="Author company ignored due country mismatch"
                                  >
                                    i
                                  </span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-2 align-top">
                              {authorProfile?.companyLinkedinUrl ? (
                                <a
                                  href={authorProfile.companyLinkedinUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary underline"
                                >
                                  {authorProfile.companyLinkedinUrl}
                                </a>
                              ) : (
                                "N/A"
                              )}
                            </td>
                            <td className="px-3 py-2 align-top">
                              {authorProfile?.companyName ?? "N/A"}
                            </td>
                            <td className="px-3 py-2 align-top">
                              {authorProfile?.headline ?? "N/A"}
                            </td>
                            <td className="px-3 py-2 align-top">{authorProfile?.about ?? "N/A"}</td>
                            <td className="px-3 py-2 align-top">{displayRoleTitle}</td>
                            <td className="px-3 py-2 align-top">
                              {scoredLead
                                ? scoredLead.leadScore.toFixed(3)
                                : lead.score != null
                                  ? lead.score.toFixed(3)
                                  : "unscored"}
                            </td>
                            <td className="px-3 py-2 align-top">
                              {lead.freshness ?? lead.sourceBadge ?? "fresh"}
                            </td>
                            <td className="px-3 py-2 align-top">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                disabled={!scoredLead}
                                onClick={() =>
                                  setExpandedJobPostRows((prev) => ({
                                    ...prev,
                                    [rowKey]: !prev[rowKey],
                                  }))
                                }
                              >
                                {isExpanded ? "Collapse" : "Expand"}
                              </Button>
                            </td>
                          </tr>
                          {isExpanded ? (
                            <tr className="border-t border-border/30 bg-muted/20">
                              <td colSpan={16} className="px-3 py-3">
                                {scoredLead ? (
                                  <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-3">
                                    <p>leadScore: {scoredLead.leadScore.toFixed(3)}</p>
                                    <p>roleMatchScore: {scoredLead.roleMatchScore.toFixed(3)}</p>
                                    <p>
                                      locationMatchScore: {scoredLead.locationMatchScore.toFixed(3)}
                                    </p>
                                    <p>
                                      authorStrengthScore:{" "}
                                      {scoredLead.authorStrengthScore.toFixed(3)}
                                    </p>
                                    <p>
                                      hiringIntentScore: {scoredLead.hiringIntentScore.toFixed(3)}
                                    </p>
                                    <p>
                                      intentBoost:{" "}
                                      {typeof scoredLead.intentBoost === "number"
                                        ? scoredLead.intentBoost
                                        : "-"}
                                    </p>
                                    <p>
                                      employmentTypeScore:{" "}
                                      {scoredLead.employmentTypeScore.toFixed(3)}
                                    </p>
                                    <p>
                                      baseScore:{" "}
                                      {typeof scoredLead.baseScore === "number"
                                        ? scoredLead.baseScore.toFixed(3)
                                        : "-"}
                                    </p>
                                    <p>
                                      finalScore100:{" "}
                                      {typeof scoredLead.finalScore100 === "number"
                                        ? scoredLead.finalScore100.toFixed(0)
                                        : "-"}
                                    </p>
                                    <p>
                                      gatedToZero: {scoredLead.gatedToZero ? "true" : "false"}
                                    </p>
                                    <p>gateReason: {scoredLead.gateReason ?? "none"}</p>
                                    <p>
                                      rawLocationText:{" "}
                                      {scoredLead.rawLocationText ?? "Location not specified"}
                                    </p>
                                    <p className="sm:col-span-2 lg:col-span-3">
                                      parsedLocations:{" "}
                                      <span className="font-mono">
                                        {JSON.stringify(scoredLead.parsedLocations)}
                                      </span>
                                    </p>
                                  </div>
                                ) : (
                                  <p className="text-muted-foreground">
                                    No scored lead breakdown available for this row.
                                  </p>
                                )}
                              </td>
                            </tr>
                          ) : null}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
