import { env } from "@/lib/env";
import type { PlannerMode } from "@/lib/agent/types";

export async function generateSearchQuery(input: {
  role: string;
  location: string;
  recencyDays: number;
  plannerMode: PlannerMode;
}): Promise<string> {
  const { role, location, recencyDays, plannerMode } = input;
  // Provider placement guardrail:
  // OpenAI usage is restricted to query-generation node in the new agent graph.
  // This legacy helper stays deterministic to avoid violating architecture boundaries.
  void env.OPENAI_API_KEY;
  return `${role} ${location} ${recencyDays}d ${plannerMode}`;
}

