import { describe, expect, it } from "vitest";
import {
  extractLeadCountryTokens,
  isLeadCountryEligibleForUser,
  normalizeCountryToken,
  resolveUserCountry,
} from "../../src/lib/location/country-eligibility";

describe("country eligibility helpers", () => {
  it("normalizes aliases for US country tokens", () => {
    expect(normalizeCountryToken("US")).toBe("united_states");
    expect(normalizeCountryToken("United States")).toBe("united_states");
    expect(normalizeCountryToken("usa")).toBe("united_states");
  });

  it("resolves user country from known city map", () => {
    expect(resolveUserCountry("Seattle")).toBe("united_states");
  });

  it("extracts explicit lead country tokens", () => {
    const countries = extractLeadCountryTokens({
      locations: [
        {
          raw: "Toronto, ON, Canada",
          city: "Toronto",
          state: "ON",
          country: "Canada",
          lat: null,
          lon: null,
        },
      ],
      rawLocationText: "Toronto, ON, Canada",
    });
    expect(countries.has("canada")).toBe(true);
  });

  it("marks explicit country mismatches as ineligible", () => {
    const result = isLeadCountryEligibleForUser({
      userLocation: "Seattle",
      lead: {
        locations: [
          {
            raw: "Toronto, ON, Canada",
            city: "Toronto",
            state: "ON",
            country: "Canada",
            lat: null,
            lon: null,
          },
        ],
        rawLocationText: "Toronto, ON, Canada",
      },
    });
    expect(result).toEqual({ eligible: false, reason: "country_mismatch" });
  });

  it("keeps leads when country is unknown", () => {
    const result = isLeadCountryEligibleForUser({
      userLocation: "Seattle",
      lead: {
        locations: [
          {
            raw: "Remote",
            city: "Remote",
            state: null,
            country: null,
            lat: null,
            lon: null,
          },
        ],
        rawLocationText: "Remote",
      },
    });
    expect(result).toEqual({ eligible: true, reason: "lead_country_unknown" });
  });
});
