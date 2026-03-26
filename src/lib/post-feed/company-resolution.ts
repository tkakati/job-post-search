type ResolveExtractedCompanyInput = {
  leadCompany?: string | null;
  extractionCompany?: string | null;
};

type ResolveDisplayCompanyInput = {
  extractedCompany?: string | null;
  authorCompany?: string | null;
  authorCountry?: string | null;
  jobCountries?: Iterable<string>;
};

export type ResolvedDisplayCompany = {
  displayCompanyText: string;
  rawCompany: string | null;
  source: "extracted" | "author_fallback" | "unknown";
  isLowConfidence: boolean;
  fallbackBlockedByCountryMismatch: boolean;
};

const UNKNOWN_COMPANY_TOKENS = new Set([
  "n/a",
  "na",
  "none",
  "null",
  "unknown",
  "not available",
  "not specified",
]);

const COUNTRY_ALIASES = new Map<string, string>([
  ["united states", "united_states"],
  ["united states of america", "united_states"],
  ["usa", "united_states"],
  ["us", "united_states"],
  ["u s", "united_states"],
  ["u s a", "united_states"],
  ["united kingdom", "united_kingdom"],
  ["uk", "united_kingdom"],
  ["u k", "united_kingdom"],
  ["great britain", "united_kingdom"],
  ["britain", "united_kingdom"],
  ["england", "united_kingdom"],
  ["united arab emirates", "united_arab_emirates"],
  ["uae", "united_arab_emirates"],
  ["u a e", "united_arab_emirates"],
]);

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSimpleToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompany(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const normalizedToken = normalizeSimpleToken(normalized);
  if (!normalizedToken || UNKNOWN_COMPANY_TOKENS.has(normalizedToken)) return null;
  return normalized;
}

export function normalizeCountry(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  const token = normalizeSimpleToken(normalized);
  if (!token) return null;
  return COUNTRY_ALIASES.get(token) ?? token.replace(/\s+/g, "_");
}

export function extractJobCountries(
  parsedLocations:
    | Array<{
        country?: string | null;
      }>
    | null
    | undefined,
): Set<string> {
  const out = new Set<string>();
  if (!Array.isArray(parsedLocations)) return out;
  for (const location of parsedLocations) {
    const normalized = normalizeCountry(location?.country ?? null);
    if (normalized) out.add(normalized);
  }
  return out;
}

export function resolveExtractedCompany(
  input: ResolveExtractedCompanyInput,
): string | null {
  return normalizeCompany(input.leadCompany) ?? normalizeCompany(input.extractionCompany);
}

function unknownCompanyResult(
  fallbackBlockedByCountryMismatch: boolean,
): ResolvedDisplayCompany {
  return {
    displayCompanyText: "Company: Unknown",
    rawCompany: null,
    source: "unknown",
    isLowConfidence: false,
    fallbackBlockedByCountryMismatch,
  };
}

export function resolveDisplayCompany(
  input: ResolveDisplayCompanyInput,
): ResolvedDisplayCompany {
  const extractedCompany = normalizeCompany(input.extractedCompany);
  if (extractedCompany) {
    return {
      displayCompanyText: `Company: ${extractedCompany}`,
      rawCompany: extractedCompany,
      source: "extracted",
      isLowConfidence: false,
      fallbackBlockedByCountryMismatch: false,
    };
  }

  const authorCompany = normalizeCompany(input.authorCompany);
  if (!authorCompany) return unknownCompanyResult(false);

  const authorCountry = normalizeCountry(input.authorCountry);
  const jobCountries = new Set<string>();
  for (const rawCountry of input.jobCountries ?? []) {
    const normalized = normalizeCountry(rawCountry);
    if (normalized) jobCountries.add(normalized);
  }
  const hasKnownCountryMismatch = Boolean(
    authorCountry && jobCountries.size > 0 && !jobCountries.has(authorCountry),
  );
  if (hasKnownCountryMismatch) return unknownCompanyResult(true);

  return {
    displayCompanyText: `Company: ${authorCompany}`,
    rawCompany: authorCompany,
    source: "author_fallback",
    isLowConfidence: true,
    fallbackBlockedByCountryMismatch: false,
  };
}
