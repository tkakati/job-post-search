"use client";

import type { AnalyticsEventInput } from "@/lib/types/api";

export async function trackAnalyticsEvents(events: AnalyticsEventInput[]) {
  if (!Array.isArray(events) || events.length === 0) return;
  try {
    await fetch("/api/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      keepalive: true,
      body: JSON.stringify({ events }),
    });
  } catch {
    // Best-effort client telemetry.
  }
}

export async function trackAnalyticsEvent(event: AnalyticsEventInput) {
  if (!event) return;
  await trackAnalyticsEvents([event]);
}
