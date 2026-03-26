import type { RecencyPreference } from "@/lib/types/contracts";

export type ProviderQueryInput = {
  queryText: string;
  sourceUrl: string;
  role: string;
  location: string;
  recencyPreference: RecencyPreference;
  roleLocationKey: string;
  iterationNumber: number;
  userSessionId: string;
};

export type ProviderRawResult = {
  url: string;
  titleOrRole: string;
  company?: string | null;
  location?: string | null;
  author?: string | null;
  snippet?: string | null;
  fullText?: string | null;
  postedAt?: string | null;
  qualityScore?: number | null;
  relevanceScore?: number | null;
  hiringIntentScore?: number | null;
  metadata?: Record<string, unknown>;
};

export interface SearchExecutionProvider {
  name: string;
  execute(input: ProviderQueryInput): Promise<ProviderRawResult[]>;
}


