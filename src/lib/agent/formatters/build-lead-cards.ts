import { formatLeadLocationDisplay } from "@/lib/location/display";
import { primaryLeadLocationText } from "@/lib/location/geo";
import { qualityBadgeFromScore } from "@/lib/scoring/thresholds";
import type { LeadCardViewModel, LeadRecord } from "@/lib/types/contracts";
import { leadDedupKey, leadRichnessScore } from "@/lib/utils/lead-dedupe";
import { dedupeRedundantLeads } from "@/lib/leads/redundancy";

type LeadSource = "retrieval" | "fresh_search";

type LeadProvenanceRow = {
  identityKey: string;
  sources: LeadSource[];
  isNewForUser: boolean;
};

export type LeadCardScope = "all" | "retrieval_only";

function readTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function readPostContext(
  value: Record<string, unknown> | null | undefined,
): {
  primaryPostUrl: string | null;
  primaryAuthorName: string | null;
  primaryAuthorProfileUrl: string | null;
} | null {
  if (!value) return null;
  const postContextRaw =
    value.postContext && typeof value.postContext === "object"
      ? (value.postContext as Record<string, unknown>)
      : null;
  if (!postContextRaw) return null;
  return {
    primaryPostUrl: readTrimmedString(postContextRaw.primaryPostUrl),
    primaryAuthorName: readTrimmedString(postContextRaw.primaryAuthorName),
    primaryAuthorProfileUrl: readTrimmedString(postContextRaw.primaryAuthorProfileUrl),
  };
}

function readExtractionRoleFromSourceMetadata(
  value: Record<string, unknown> | null | undefined,
): string | null {
  if (!value) return null;
  const extractionRaw =
    value.extraction && typeof value.extraction === "object"
      ? (value.extraction as Record<string, unknown>)
      : null;
  if (!extractionRaw) return null;
  return readTrimmedString(extractionRaw.role);
}

function qualityBadgeForLead(lead: {
  leadScore?: number | null;
  hiringIntentScore?: number | null;
}): LeadCardViewModel["qualityBadge"] {
  if (typeof lead.leadScore === "number") {
    return qualityBadgeFromScore(lead.leadScore);
  }
  return qualityBadgeFromScore(Math.max(lead.hiringIntentScore ?? 0, 0));
}

function sourceBadgeForProvenance(
  sources: Array<"retrieval" | "fresh_search">,
): LeadCardViewModel["sourceBadge"] {
  if (sources.includes("retrieval") && sources.includes("fresh_search")) {
    return "both";
  }
  return sources.includes("retrieval") ? "retrieved" : "fresh";
}

export function buildLeadCardsFromLeads(input: {
  selectedLeads: LeadRecord[];
  leadProvenance?: LeadProvenanceRow[] | null;
  maxLeads: number;
  scope?: LeadCardScope;
}): LeadCardViewModel[] {
  const scope = input.scope ?? "all";
  const provenanceByIdentity = new Map(
    (input.leadProvenance ?? []).map((p) => [p.identityKey, p]),
  );
  const selectedEntries: Array<{ lead: LeadRecord; sources: Set<LeadSource> }> = [];
  for (const lead of input.selectedLeads) {
    const provenance = provenanceByIdentity.get(lead.identityKey);
    const leadSources = provenance?.sources ?? (["fresh_search"] as const);
    if (scope === "retrieval_only" && !leadSources.includes("retrieval")) {
      continue;
    }
    selectedEntries.push({
      lead,
      sources: new Set(leadSources as LeadSource[]),
    });
  }
  const dedupedByRedundancy = dedupeRedundantLeads({
    items: selectedEntries,
    toComparable: (entry) => ({
      sourceMetadataJson: entry.lead.sourceMetadataJson ?? null,
      author: entry.lead.author ?? null,
      titleOrRole: entry.lead.titleOrRole ?? null,
      fullText: entry.lead.fullText ?? null,
      snippet: entry.lead.snippet ?? null,
      postedAt: entry.lead.postedAt ?? null,
      fetchedAt: entry.lead.fetchedAt ?? null,
    }),
    getRichnessScore: (entry) => leadRichnessScore(entry.lead),
  });
  const redundancyCollapsedEntries = dedupedByRedundancy.clusters.map((cluster) => {
    const sources = new Set<LeadSource>();
    for (const member of cluster.members) {
      for (const source of member.sources) {
        sources.add(source);
      }
    }
    return {
      lead: cluster.winner.lead,
      sources,
    };
  });

  const dedupedSelectedByKey = new Map<
    string,
    {
      lead: LeadRecord;
      sources: Set<LeadSource>;
    }
  >();

  for (const { lead, sources } of redundancyCollapsedEntries) {
    const key = leadDedupKey({
      canonicalUrl: lead.canonicalUrl,
      titleOrRole: lead.titleOrRole,
      company: lead.company,
      rawLocationText: primaryLeadLocationText(lead),
    });
    const existing = dedupedSelectedByKey.get(key);
    if (!existing) {
      dedupedSelectedByKey.set(key, {
        lead,
        sources: new Set(sources),
      });
      continue;
    }

    for (const source of sources) {
      existing.sources.add(source as LeadSource);
    }

    const existingLeadScore =
      (typeof existing.lead.leadScore === "number" ? existing.lead.leadScore : -1) * 100;
    const currentLeadScore = (typeof lead.leadScore === "number" ? lead.leadScore : -1) * 100;
    const existingScore = existingLeadScore + leadRichnessScore(existing.lead);
    const currentScore = currentLeadScore + leadRichnessScore(lead);
    if (currentScore > existingScore) {
      existing.lead = lead;
    }
  }

  const dedupedSelected = Array.from(dedupedSelectedByKey.values()).sort((a, b) => {
    const aScore = typeof a.lead.leadScore === "number" ? a.lead.leadScore : -1;
    const bScore = typeof b.lead.leadScore === "number" ? b.lead.leadScore : -1;
    if (bScore !== aScore) return bScore - aScore;
    const aRichness = leadRichnessScore(a.lead);
    const bRichness = leadRichnessScore(b.lead);
    if (bRichness !== aRichness) return bRichness - aRichness;
    return a.lead.identityKey.localeCompare(b.lead.identityKey);
  });
  const limitedSelected = dedupedSelected.slice(0, input.maxLeads);

  return limitedSelected.map(({ lead, sources }) => {
    const sourceBadge = sourceBadgeForProvenance(Array.from(sources));
    const provenance = provenanceByIdentity.get(lead.identityKey);
    const isNewForUser = provenance?.isNewForUser === true;
    const meta = lead.sourceMetadataJson as Record<string, unknown> | null | undefined;
    const extractedRole = readExtractionRoleFromSourceMetadata(meta);
    const displayJobTitle = extractedRole ?? readTrimmedString(lead.titleOrRole) ?? "Untitled role";
    const postContext = readPostContext(meta);
    const authorProfileUrlRaw =
      postContext?.primaryAuthorProfileUrl ??
      (typeof meta?.authorProfileUrl === "string" ? meta.authorProfileUrl.trim() : "");
    const postAuthorUrl =
      authorProfileUrlRaw && /^https?:\/\//i.test(authorProfileUrlRaw)
        ? authorProfileUrlRaw
        : null;
    const postUrlRaw =
      postContext?.primaryPostUrl && /^https?:\/\//i.test(postContext.primaryPostUrl)
        ? postContext.primaryPostUrl
        : lead.canonicalUrl;
    const postAuthor = postContext?.primaryAuthorName ?? lead.author ?? null;
    const leadScore =
      typeof (lead as { leadScore?: unknown }).leadScore === "number"
        ? ((lead as { leadScore: number }).leadScore ?? null)
        : null;
    const locationDisplay = formatLeadLocationDisplay({
      locations: lead.locations ?? [],
      rawLocationText: lead.rawLocationText ?? null,
      location: primaryLeadLocationText(lead),
      maxVisible: Number.POSITIVE_INFINITY,
    });

    return {
      leadId: lead.id,
      title: lead.titleOrRole,
      company: lead.company ?? null,
      location: locationDisplay.display,
      locations: lead.locations ?? [],
      rawLocationText: lead.rawLocationText ?? null,
      canonicalUrl: lead.canonicalUrl,
      url: lead.canonicalUrl,
      postUrl: postUrlRaw,
      generatedQuery:
        typeof meta?.sourceQuery === "string" && meta.sourceQuery.trim()
          ? meta.sourceQuery.trim()
          : undefined,
      postAuthor,
      postAuthorUrl,
      jobTitle: displayJobTitle,
      jobLocation: locationDisplay.display,
      score: leadScore,
      freshness: sourceBadge,
      snippet: lead.snippet ?? null,
      sourceType: lead.sourceType,
      sourceBadge,
      provenanceSources: Array.from(sources),
      postedAt: lead.postedAt ?? null,
      isNewForUser,
      ...(isNewForUser ? { newBadge: "new" as const } : {}),
      qualityBadge: qualityBadgeForLead(lead),
    };
  });
}
