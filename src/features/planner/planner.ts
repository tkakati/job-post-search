import type { PlannerMode } from "../../lib/agent/types";
import type { RecencyPreference } from "../../lib/types/contracts";

export function planDiscoveryByRecencyDays(input: {
  recencyPreference: RecencyPreference;
  maxIterations: number;
}): { mode: PlannerMode; searchIterationsAllowed: number } {
  const { maxIterations } = input;

  if (input.recencyPreference === "past-month") {
    return { mode: "exploit_heavy", searchIterationsAllowed: 0 };
  }

  if (input.recencyPreference === "past-24h") {
    return { mode: "full_explore", searchIterationsAllowed: maxIterations };
  }

  return { mode: "explore_heavy", searchIterationsAllowed: 1 };
}

