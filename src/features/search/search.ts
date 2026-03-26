import type { Lead } from "../../lib/agent/types";
import type { SearchProvider } from "../../lib/search/searchProvider";

export async function searchLeadsWithProvider(input: {
  provider: SearchProvider;
  role: string;
  location: string;
  recencyDays: number;
  query: string;
  userId: string;
}): Promise<Array<Omit<Lead, "id">>> {
  return input.provider.search({
    role: input.role,
    location: input.location,
    recencyDays: input.recencyDays,
    query: input.query,
    userId: input.userId,
  });
}

