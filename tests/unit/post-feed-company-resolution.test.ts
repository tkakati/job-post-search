import { describe, expect, it } from "vitest";
import {
  extractJobCountries,
  normalizeCountry,
  resolveDisplayCompany,
  resolveExtractedCompany,
} from "../../src/lib/post-feed/company-resolution";

describe("post feed company resolution", () => {
  it("uses extracted company when available", () => {
    const extractedCompany = resolveExtractedCompany({
      leadCompany: "Acme",
      extractionCompany: "Ignored",
    });
    const resolved = resolveDisplayCompany({
      extractedCompany,
      authorCompany: "Fallback Co",
      authorCountry: "US",
      jobCountries: extractJobCountries([{ country: "United States" }]),
    });
    expect(resolved.displayCompanyText).toBe("Company: Acme");
    expect(resolved.source).toBe("extracted");
    expect(resolved.isLowConfidence).toBe(false);
    expect(resolved.fallbackBlockedByCountryMismatch).toBe(false);
  });

  it("uses author fallback when extracted company is missing and countries allow it", () => {
    const resolved = resolveDisplayCompany({
      extractedCompany: null,
      authorCompany: "Author Corp",
      authorCountry: "US",
      jobCountries: extractJobCountries([{ country: "USA" }]),
    });
    expect(resolved.displayCompanyText).toBe("Company: Author Corp");
    expect(resolved.source).toBe("author_fallback");
    expect(resolved.isLowConfidence).toBe(true);
    expect(resolved.fallbackBlockedByCountryMismatch).toBe(false);
  });

  it("blocks author fallback when author and job countries are known and mismatched", () => {
    const resolved = resolveDisplayCompany({
      extractedCompany: null,
      authorCompany: "Author Corp",
      authorCountry: "India",
      jobCountries: extractJobCountries([{ country: "United States" }]),
    });
    expect(resolved.displayCompanyText).toBe("Company: Unknown");
    expect(resolved.source).toBe("unknown");
    expect(resolved.isLowConfidence).toBe(false);
    expect(resolved.fallbackBlockedByCountryMismatch).toBe(true);
  });

  it("allows author fallback when any parsed job country matches", () => {
    const resolved = resolveDisplayCompany({
      extractedCompany: null,
      authorCompany: "Author Corp",
      authorCountry: "US",
      jobCountries: extractJobCountries([
        { country: "India" },
        { country: "United States of America" },
      ]),
    });
    expect(resolved.displayCompanyText).toBe("Company: Author Corp");
    expect(resolved.source).toBe("author_fallback");
    expect(resolved.isLowConfidence).toBe(true);
  });

  it("blocks author fallback when all parsed countries mismatch", () => {
    const resolved = resolveDisplayCompany({
      extractedCompany: null,
      authorCompany: "Author Corp",
      authorCountry: "United Kingdom",
      jobCountries: extractJobCountries([{ country: "Canada" }, { country: "US" }]),
    });
    expect(resolved.displayCompanyText).toBe("Company: Unknown");
    expect(resolved.fallbackBlockedByCountryMismatch).toBe(true);
  });

  it("allows author fallback when no job countries are available", () => {
    const resolved = resolveDisplayCompany({
      extractedCompany: null,
      authorCompany: "Author Corp",
      authorCountry: "US",
      jobCountries: new Set<string>(),
    });
    expect(resolved.displayCompanyText).toBe("Company: Author Corp");
    expect(resolved.source).toBe("author_fallback");
    expect(resolved.isLowConfidence).toBe(true);
  });

  it("returns unknown when both extracted and author company are missing", () => {
    const resolved = resolveDisplayCompany({
      extractedCompany: null,
      authorCompany: null,
      authorCountry: normalizeCountry("US"),
      jobCountries: extractJobCountries([{ country: "US" }]),
    });
    expect(resolved.displayCompanyText).toBe("Company: Unknown");
    expect(resolved.source).toBe("unknown");
    expect(resolved.isLowConfidence).toBe(false);
  });
});
