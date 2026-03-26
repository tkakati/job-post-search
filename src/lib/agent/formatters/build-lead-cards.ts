import { formatLeadLocationDisplay } from "@/lib/location/display";
import { primaryLeadLocationText } from "@/lib/location/geo";
import type { LeadCardViewModel, LeadRecord } from "@/lib/types/contracts";
import { leadDedupKey, leadRichnessScore } from "@/lib/utils/lead-dedupe";

type LeadSource = "retrieval" | "fresh_search";

type LeadProvenanceRow = {
  identityKey: string;
  sources: LeadSource[];
};

export type LeadCardScope = "all" | "retrieval_only";

function qualityBadgeForLead(lead: {
  leadScore?: number | null;
  hiringIntentScore?: number | null;
}): LeadCardViewModel["qualityBadge"] {
  if (typeof lead.leadScore === "number") {
    if (lead.leadScore >= 0.75) return "high";
    if (lead.leadScore >= 0.5) return "medium";
    if (lead.leadScore > 0) return "low";
    return "unscored";
  }
  const signal = Math.max(lead.hiringIntentScore ?? 0, 0);
  if (signal >= 0.75) return "high";
  if (signal >= 0.5) return "medium";
  if (signal > 0) return "low";
  return "unscored";
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
    (input.leadProvenance ?? []).map((p) => [p.identityKey, p.sources]),
  );

  const dedupedSelectedByKey = new Map<
    string,
    {
      lead: LeadRecord;
      sources: Set<LeadSource>;
    }
  >();

  for (const lead of input.selectedLeads) {
    const leadSources =
      provenanceByIdentity.get(lead.identityKey) ?? (["fresh_search"] as const);
    if (scope === "retrieval_only" && !leadSources.includes("retrieval")) {
      continue;
    }

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
        sources: new Set(leadSources as LeadSource[]),
      });
      continue;
    }

    for (const source of leadSources) {
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
    const meta = lead.sourceMetadataJson as Record<string, unknown> | null | undefined;
    const authorProfileUrlRaw =
      typeof meta?.authorProfileUrl === "string" ? meta.authorProfileUrl.trim() : "";
    const postAuthorUrl =
      authorProfileUrlRaw && /^https?:\/\//i.test(authorProfileUrlRaw)
        ? authorProfileUrlRaw
        : null;
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
      postUrl: lead.canonicalUrl,
      generatedQuery:
        typeof meta?.sourceQuery === "string" && meta.sourceQuery.trim()
          ? meta.sourceQuery.trim()
          : undefined,
      postAuthor: lead.author ?? null,
      postAuthorUrl,
      jobTitle: lead.titleOrRole,
      jobLocation: locationDisplay.display,
      score: leadScore,
      freshness: sourceBadge,
      snippet: lead.snippet ?? null,
      sourceType: lead.sourceType,
      sourceBadge,
      provenanceSources: Array.from(sources),
      postedAt: lead.postedAt ?? null,
      isNewForUser: true,
      newBadge: "new",
      qualityBadge: qualityBadgeForLead(lead),
    };
  });
}

