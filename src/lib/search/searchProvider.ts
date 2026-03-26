import type { Lead } from "@/lib/agent/types";

export type SearchInput = {
  role: string;
  location: string;
  recencyDays: number;
  query: string;
  userId: string;
};

export type SearchProvider = {
  /**
   * Runs a job search and returns candidate leads.
   * Embeddings can be computed later; for now we focus on lead identity + text.
   */
  search: (input: SearchInput) => Promise<Omit<Lead, "id">[]>;
};

