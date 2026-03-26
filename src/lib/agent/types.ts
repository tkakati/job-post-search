export type PlannerMode = "full_explore" | "explore_heavy" | "exploit_heavy";

export type RecencyPreference = {
  recencyPreference: "past-24h" | "past-week" | "past-month";
};

export type Lead = {
  id?: number;
  role: string;
  location: string;
  title: string;
  company?: string | null;
  url: string;
  description?: string | null;
  source: string;
  sourceMetadata?: Record<string, unknown> | null;
  createdAt?: string;
};

export type JobDiscoveryInput = {
  userId: string;
  role: string;
  location: string;
  recencyPreference: "past-24h" | "past-week" | "past-month";
};

export type JobDiscoveryPerformance = {
  roleLocationKey: string;
  retrievalMs: number;
  searchMs: number;
  combineMs: number;
  totalMs: number;
  cacheHit: boolean;
};

export type JobDiscoveryResponse = {
  mode: PlannerMode;
  iterationsUsed: number;
  targetHighQualityLeads: number;
  newLeadsCount: number;
  performance: JobDiscoveryPerformance;
  leads: Array<Pick<Lead, "title" | "company" | "url" | "source" | "createdAt"> & { id?: number }>;
  summary: string;
};

