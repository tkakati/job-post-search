import type { QueryGenerationOutput } from "@/lib/types/contracts";

export interface LlmProvider {
  generateQueries(input: {
    roleLocationKey: string;
    role: string;
    location: string;
    recencyPreference: "past-24h" | "past-week" | "past-month";
    iterationNumber: number;
    numExploreQueries: 0 | 1 | 2 | 3;
  }): Promise<QueryGenerationOutput>;
}
