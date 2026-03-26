import type { LeadRecord } from "@/lib/types/contracts";
import { resolveLocation } from "@/lib/location/geo";

const COUNTRY_ALIAS_TO_CANONICAL = new Map<string, string>([
  ["us", "united_states"],
  ["u.s.", "united_states"],
  ["u.s.a", "united_states"],
  ["u.s.a.", "united_states"],
  ["usa", "united_states"],
  ["united states", "united_states"],
  ["united states of america", "united_states"],
  ["uk", "united_kingdom"],
  ["u.k.", "united_kingdom"],
  ["great britain", "united_kingdom"],
  ["britain", "united_kingdom"],
  ["england", "united_kingdom"],
  ["uae", "united_arab_emirates"],
  ["u.a.e.", "united_arab_emirates"],
]);

function normalizeCountryText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

function countryFromCommaSeparatedLocation(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const segments = value
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (segments.length < 2) return null;
  return segments[segments.length - 1] ?? null;
}

export function normalizeCountryToken(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeCountryText(value);
  if (!normalized) return null;
  const aliased = COUNTRY_ALIAS_TO_CANONICAL.get(normalized);
  if (aliased) return aliased;
  return normalized.replace(/\s+/g, "_");
}

export function resolveUserCountry(locationInput: string): string | null {
  const resolved = resolveLocation(locationInput);
  const fromResolver = normalizeCountryToken(resolved?.country ?? null);
  if (fromResolver) return fromResolver;
  return normalizeCountryToken(countryFromCommaSeparatedLocation(locationInput));
}

export function extractLeadCountryTokens(
  lead: Pick<LeadRecord, "locations" | "rawLocationText">,
): Set<string> {
  const countries = new Set<string>();

  for (const location of lead.locations ?? []) {
    const directCountry = normalizeCountryToken(location.country ?? null);
    if (directCountry) countries.add(directCountry);

    const resolvedCountry = normalizeCountryToken(resolveLocation(location.raw)?.country ?? null);
    if (resolvedCountry) countries.add(resolvedCountry);

    const commaCountry = normalizeCountryToken(countryFromCommaSeparatedLocation(location.raw));
    if (commaCountry) countries.add(commaCountry);
  }

  const rawLines =
    typeof lead.rawLocationText === "string"
      ? lead.rawLocationText
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
      : [];

  for (const rawLine of rawLines) {
    const resolvedCountry = normalizeCountryToken(resolveLocation(rawLine)?.country ?? null);
    if (resolvedCountry) countries.add(resolvedCountry);

    const commaCountry = normalizeCountryToken(countryFromCommaSeparatedLocation(rawLine));
    if (commaCountry) countries.add(commaCountry);
  }

  return countries;
}

export function isLeadCountryEligibleForUser(input: {
  userLocation: string;
  lead: Pick<LeadRecord, "locations" | "rawLocationText">;
}): {
  eligible: boolean;
  reason: "user_country_unknown" | "lead_country_unknown" | "country_match" | "country_mismatch";
} {
  const userCountry = resolveUserCountry(input.userLocation);
  if (!userCountry) {
    return { eligible: true, reason: "user_country_unknown" };
  }

  const leadCountries = extractLeadCountryTokens(input.lead);
  if (leadCountries.size === 0) {
    return { eligible: true, reason: "lead_country_unknown" };
  }

  if (leadCountries.has(userCountry)) {
    return { eligible: true, reason: "country_match" };
  }

  return { eligible: false, reason: "country_mismatch" };
}
