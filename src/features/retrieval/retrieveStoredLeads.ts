import type { Lead } from "../../lib/agent/types";
import { getStoredLeads } from "../../lib/db/queries";

export async function retrieveStoredLeadsForRoleLocation(input: {
  role: string;
  location: string;
  recencyDays: number;
  limit: number;
}): Promise<Lead[]> {
  return getStoredLeads(input);
}

