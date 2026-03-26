"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { LeadCardViewModel } from "@/lib/types/contracts";
import { formatLeadLocationDisplay } from "@/lib/location/display";

export function LeadCard({
  lead,
  onOutboundClick,
  onToggleSave,
  onToggleHide,
  onHelpful,
  onNotHelpful,
  isSaved,
  isHidden,
}: {
  lead: LeadCardViewModel;
  onOutboundClick?: (lead: LeadCardViewModel) => void;
  onToggleSave?: (lead: LeadCardViewModel) => void;
  onToggleHide?: (lead: LeadCardViewModel) => void;
  onHelpful?: (lead: LeadCardViewModel) => void;
  onNotHelpful?: (lead: LeadCardViewModel) => void;
  isSaved?: boolean;
  isHidden?: boolean;
}) {
  const badgeLabel =
    lead.sourceBadge === "both"
      ? "Both"
      : lead.sourceBadge === "retrieved"
        ? "Retrieved"
        : "Fresh";
  const locationDisplay = formatLeadLocationDisplay({
    locations: lead.locations ?? [],
    rawLocationText: lead.rawLocationText ?? null,
    location: lead.location ?? lead.jobLocation ?? null,
    maxVisible: 3,
  });

  return (
    <Card
      className={`h-full border-border/70 p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${isHidden ? "opacity-60" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="text-base font-semibold leading-5">{lead.title}</h3>
          <p
            className="text-sm text-muted-foreground"
            title={locationDisplay.omittedCount > 0 ? locationDisplay.full ?? undefined : undefined}
          >
            {lead.company ?? "Unknown company"}
            {` · ${locationDisplay.display}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <Badge variant="secondary">{badgeLabel}</Badge>
          <Badge>{lead.newBadge}</Badge>
          {lead.qualityBadge ? <Badge>{lead.qualityBadge}</Badge> : null}
        </div>
      </div>

      {lead.snippet ? (
        <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{lead.snippet}</p>
      ) : null}

      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>{lead.sourceType}</span>
        <span>
          {lead.postedAt
            ? new Date(lead.postedAt).toLocaleDateString()
            : "Date unavailable"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          asChild
          size="sm"
          onClick={() => onOutboundClick?.(lead)}
          className="min-w-28"
        >
          <a href={lead.canonicalUrl} target="_blank" rel="noreferrer">
            Open Lead
          </a>
        </Button>
        <Button
          size="sm"
          variant="secondary"
          type="button"
          onClick={() => onToggleSave?.(lead)}
        >
          {isSaved ? "Saved" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          type="button"
          onClick={() => onToggleHide?.(lead)}
        >
          {isHidden ? "Unhide" : "Hide"}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          type="button"
          onClick={() => onHelpful?.(lead)}
        >
          Helpful
        </Button>
        <Button
          size="sm"
          variant="secondary"
          type="button"
          onClick={() => onNotHelpful?.(lead)}
        >
          Not helpful
        </Button>
      </div>
    </Card>
  );
}
