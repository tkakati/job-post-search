import { describe, expect, it } from "vitest";
import { planDiscoveryByRecencyDays } from "../../src/features/planner/planner";

describe("planner", () => {
  it("exploit_heavy for long recency", () => {
    const res = planDiscoveryByRecencyDays({
      recencyPreference: "past-month",
      maxIterations: 3,
    });
    expect(res.mode).toBe("exploit_heavy");
    expect(res.searchIterationsAllowed).toBe(0);
  });

  it("full_explore for short recency", () => {
    const res = planDiscoveryByRecencyDays({
      recencyPreference: "past-24h",
      maxIterations: 3,
    });
    expect(res.mode).toBe("full_explore");
    expect(res.searchIterationsAllowed).toBe(3);
  });
});

