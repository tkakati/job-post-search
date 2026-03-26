"use client";

import * as React from "react";
import type { LeadCardViewModel } from "@/lib/types/contracts";

type TrackEventType = "opened" | "clicked" | "helpful" | "not_helpful" | "hidden";

export function useLeadTracking(runId: number) {
  const track = React.useCallback(
    async (
      lead: LeadCardViewModel,
      eventType: TrackEventType,
      metadata?: Record<string, unknown>,
    ) => {
      if (!lead.leadId) return;
      await fetch(`/api/leads/${lead.leadId}/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          eventType,
          searchRunId: runId,
          metadata: {
            canonicalUrl: lead.canonicalUrl,
            sourceBadge: lead.sourceBadge,
            ...metadata,
          },
        }),
      });
    },
    [runId],
  );

  return {
    trackOpened: (lead: LeadCardViewModel) => track(lead, "opened"),
    trackClicked: (lead: LeadCardViewModel) => track(lead, "clicked"),
    trackHelpful: (lead: LeadCardViewModel) => track(lead, "helpful"),
    trackNotHelpful: (lead: LeadCardViewModel) => track(lead, "not_helpful"),
    trackHidden: (lead: LeadCardViewModel) => track(lead, "hidden"),
  };
}

