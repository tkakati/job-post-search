import type { JobDiscoveryResponse, Lead } from "../../lib/agent/types";

export function selectBestLeads(input: {
  leads: Lead[];
  targetHighQualityLeads: number;
}): Lead[] {
  const { leads, targetHighQualityLeads } = input;
  const sorted = [...leads].sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });
  return sorted.slice(0, targetHighQualityLeads);
}

export function formatSummary(input: {
  role: string;
  location: string;
  newLeadsCount: number;
  targetHighQualityLeads: number;
  maxIterations: number;
}): string {
  const { role, location, newLeadsCount, targetHighQualityLeads, maxIterations } = input;
  if (newLeadsCount >= targetHighQualityLeads) {
    return `Found ${targetHighQualityLeads} new job leads for you (${role} in ${location}).`;
  }
  return `Found ${newLeadsCount} new job leads for you (${role} in ${location}) within the ${maxIterations}-iteration limit.`;
}

// Placeholder: actual persistence + "already shown" marking lives in the agent runner.
export type FinalizeResponseResult = Pick<
  JobDiscoveryResponse,
  "mode" | "iterationsUsed" | "targetHighQualityLeads" | "newLeadsCount" | "performance" | "leads" | "summary"
>;

