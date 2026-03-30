import { describe, expect, it } from "vitest";
import {
  HIGH_QUALITY_LEAD_THRESHOLD,
  MATCH_MEDIUM_THRESHOLD,
  MATCH_STRONG_THRESHOLD,
  classifyMatchStrength,
  qualityBadgeFromScore,
} from "../../src/lib/scoring/thresholds";

describe("scoring thresholds", () => {
  it("uses recalibrated match-strength cutoffs", () => {
    expect(MATCH_STRONG_THRESHOLD).toBe(0.7);
    expect(MATCH_MEDIUM_THRESHOLD).toBe(0.45);
    expect(HIGH_QUALITY_LEAD_THRESHOLD).toBe(0.55);

    expect(classifyMatchStrength(0.72)).toBe("strong");
    expect(classifyMatchStrength(0.5)).toBe("medium");
    expect(classifyMatchStrength(0.4)).toBe("weak");
    expect(classifyMatchStrength(null)).toBe("unscored");
  });

  it("maps quality badges from calibrated score scale", () => {
    expect(qualityBadgeFromScore(0.75)).toBe("high");
    expect(qualityBadgeFromScore(0.5)).toBe("medium");
    expect(qualityBadgeFromScore(0.2)).toBe("low");
    expect(qualityBadgeFromScore(0)).toBe("unscored");
  });
});
