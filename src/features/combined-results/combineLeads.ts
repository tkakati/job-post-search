import type { Lead } from "../../lib/agent/types";

export function dedupeLeadsByUrl(leads: Lead[]) {
  const map = new Map<string, Lead>();
  for (const l of leads) {
    if (!map.has(l.url)) map.set(l.url, l);
  }
  return Array.from(map.values());
}

