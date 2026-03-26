import type {
  LeadRecord,
  QueryPerformanceSummary,
  RetrievalOutput,
} from "@/lib/types/contracts";

export interface DbProvider {
  getStoredLeads(input: {
    roleLocationKey: string;
    recencyPreference: "past-24h" | "past-week" | "past-month";
    limit: number;
  }): Promise<RetrievalOutput>;

  upsertLeads(input: { leads: LeadRecord[] }): Promise<LeadRecord[]>;

  getShownLeadIdentityKeys(input: {
    userSessionId: string;
    identityKeys: string[];
  }): Promise<Set<string>>;

  markLeadsShown(input: {
    userSessionId: string;
    searchRunId: number;
    iterationNumber: number;
    leadIds: number[];
  }): Promise<void>;

  upsertQueryPerformance(input: QueryPerformanceSummary): Promise<void>;
}

