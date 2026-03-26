"use client";

import * as React from "react";
import { LeadCard } from "@/components/job-discovery/lead-card";
import {
  FilterBar,
  type RecencyFilter,
  type SortBy,
  type SourceFilter,
} from "@/components/job-discovery/filter-bar";
import type { LeadCardViewModel } from "@/lib/types/contracts";
import { EmptyState } from "@/components/job-discovery/empty-state";
import { formatLeadLocationDisplay } from "@/lib/location/display";

function matchesText(lead: LeadCardViewModel, query: string) {
  const locationText = formatLeadLocationDisplay({
    locations: lead.locations ?? [],
    rawLocationText: lead.rawLocationText ?? null,
    location: lead.location ?? lead.jobLocation ?? null,
    maxVisible: Number.POSITIVE_INFINITY,
  }).display;
  const haystack = [
    lead.title,
    lead.company ?? "",
    locationText,
    lead.snippet ?? "",
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
}

function inRecencyWindow(lead: LeadCardViewModel, recencyFilter: RecencyFilter) {
  if (recencyFilter === "any" || !lead.postedAt) return true;
  const days = recencyFilter === "7d" ? 7 : recencyFilter === "30d" ? 30 : 90;
  const ms = Date.now() - new Date(lead.postedAt).getTime();
  return ms <= days * 24 * 60 * 60 * 1000;
}

function scoreForSort(lead: LeadCardViewModel) {
  if (lead.qualityBadge === "high") return 4;
  if (lead.qualityBadge === "medium") return 3;
  if (lead.qualityBadge === "low") return 2;
  return 1;
}

export function ResultsGrid({
  leads,
  onLeadClick,
  onLeadHelpful,
  onLeadNotHelpful,
  onLeadHidden,
}: {
  leads: LeadCardViewModel[];
  onLeadClick?: (lead: LeadCardViewModel) => void;
  onLeadHelpful?: (lead: LeadCardViewModel) => void;
  onLeadNotHelpful?: (lead: LeadCardViewModel) => void;
  onLeadHidden?: (lead: LeadCardViewModel) => void;
}) {
  const [companyQuery, setCompanyQuery] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState<SourceFilter>("all");
  const [newOnly, setNewOnly] = React.useState(true);
  const [recencyFilter, setRecencyFilter] = React.useState<RecencyFilter>("any");
  const [sortBy, setSortBy] = React.useState<SortBy>("relevance");
  const [saved, setSaved] = React.useState<Set<string>>(new Set());
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());

  const filtered = React.useMemo(() => {
    const rows = leads
      .filter((lead) => !hidden.has(lead.canonicalUrl))
      .filter((lead) => {
      if (sourceFilter !== "all" && lead.sourceBadge !== sourceFilter) return false;
      if (newOnly && !lead.isNewForUser) return false;
      if (companyQuery.trim() && !matchesText(lead, companyQuery.trim())) return false;
      if (!inRecencyWindow(lead, recencyFilter)) return false;
      return true;
      });

    rows.sort((a, b) => {
      if (sortBy === "recent") {
        const am = a.postedAt ? new Date(a.postedAt).getTime() : 0;
        const bm = b.postedAt ? new Date(b.postedAt).getTime() : 0;
        return bm - am;
      }
      return scoreForSort(b) - scoreForSort(a);
    });
    return rows;
  }, [leads, sourceFilter, newOnly, companyQuery, recencyFilter, sortBy, hidden]);

  function toggleSaved(lead: LeadCardViewModel) {
    setSaved((prev) => {
      const next = new Set(prev);
      if (next.has(lead.canonicalUrl)) next.delete(lead.canonicalUrl);
      else next.add(lead.canonicalUrl);
      return next;
    });
  }

  function toggleHidden(lead: LeadCardViewModel) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(lead.canonicalUrl)) next.delete(lead.canonicalUrl);
      else next.add(lead.canonicalUrl);
      return next;
    });
    onLeadHidden?.(lead);
  }

  return (
    <div className="space-y-4">
      <FilterBar
        companyQuery={companyQuery}
        setCompanyQuery={setCompanyQuery}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
        newOnly={newOnly}
        setNewOnly={setNewOnly}
        recencyFilter={recencyFilter}
        setRecencyFilter={setRecencyFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
      />

      {filtered.length === 0 ? (
        <EmptyState
          title="No results match these filters"
          message="Try relaxing source, recency, or company filters to reveal more leads."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((lead) => (
            <LeadCard
              key={`${lead.leadId ?? lead.canonicalUrl}`}
              lead={lead}
              onOutboundClick={onLeadClick}
              onToggleSave={toggleSaved}
              onToggleHide={toggleHidden}
              onHelpful={onLeadHelpful}
              onNotHelpful={onLeadNotHelpful}
              isSaved={saved.has(lead.canonicalUrl)}
              isHidden={hidden.has(lead.canonicalUrl)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
