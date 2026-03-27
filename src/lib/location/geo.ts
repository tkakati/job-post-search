import geonamesIndexRaw from "@/lib/location/data/geonames-cities1000-index.json";
import type { LeadLocation, LeadRecord } from "@/lib/types/contracts";

export type ResolvedLocation = {
  city: string | null;
  state: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
};

type GeoCityRecord = {
  city: string;
  state: string | null;
  stateCode: string | null;
  country: string | null;
  countryCode: string;
  lat: number;
  lon: number;
  population: number;
};

type GeoNamesIndex = {
  aliases?: Record<string, string>;
  byCity?: Record<string, GeoCityRecord[]>;
};

const geonamesIndex = geonamesIndexRaw as GeoNamesIndex;

const DEFAULT_ALIAS_MAP: Record<string, string> = {
  nyc: "new york",
  "new york city": "new york",
  sf: "san francisco",
  sfo: "san francisco",
  la: "los angeles",
  dc: "washington",
  "d c": "washington",
  blr: "bengaluru",
  bangalore: "bengaluru",
  bombay: "mumbai",
  calcutta: "kolkata",
};

const COUNTRY_ALIAS_TO_ISO: Record<string, string> = {
  us: "US",
  usa: "US",
  "united states": "US",
  "united states of america": "US",
  uk: "GB",
  "united kingdom": "GB",
  britain: "GB",
  england: "GB",
  uae: "AE",
  "united arab emirates": "AE",
};

const STATE_ALIAS_NORMALIZED: Record<string, string> = {
  "new york": "NY",
  california: "CA",
  washington: "WA",
  massachusetts: "MA",
  illinois: "IL",
  texas: "TX",
  "district of columbia": "DC",
};

function normalizeLocationToken(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeCountryToken(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeLocationToken(value);
  if (!normalized) return null;
  if (COUNTRY_ALIAS_TO_ISO[normalized]) return COUNTRY_ALIAS_TO_ISO[normalized];
  if (/^[a-z]{2}$/i.test(normalized)) return normalized.toUpperCase();
  return normalized.toUpperCase();
}

function normalizeStateToken(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = normalizeLocationToken(value);
  if (!normalized) return null;
  if (/^[a-z]{2}$/i.test(normalized)) return normalized.toUpperCase();
  if (STATE_ALIAS_NORMALIZED[normalized]) return STATE_ALIAS_NORMALIZED[normalized];
  return normalized.toUpperCase();
}

function resolveCityKey(rawCity: string) {
  const normalized = normalizeLocationToken(rawCity);
  if (!normalized) return null;
  const aliasMap = geonamesIndex.aliases ?? DEFAULT_ALIAS_MAP;
  return aliasMap[normalized] ?? normalized;
}

export function hasLocationAlias(locationString: string | null | undefined) {
  if (typeof locationString !== "string" || !locationString.trim()) return false;
  const parsed = parseLocationParts(locationString.trim());
  const cityInput = parsed.city ?? locationString.trim().split(",")[0] ?? locationString;
  const normalized = normalizeLocationToken(cityInput);
  if (!normalized) return false;
  const aliasMap = geonamesIndex.aliases ?? DEFAULT_ALIAS_MAP;
  return Boolean(aliasMap[normalized]);
}

function parseLocationParts(locationString: string): {
  city: string | null;
  state: string | null;
  country: string | null;
} {
  const segments = locationString
    .split(",")
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    return { city: null, state: null, country: null };
  }

  if (segments.length === 1) {
    return { city: segments[0] ?? null, state: null, country: null };
  }

  if (segments.length === 2) {
    const maybeCountry = normalizeCountryToken(segments[1]);
    const originalSecond = segments[1] ?? null;
    if (maybeCountry && maybeCountry.length > 2) {
      return { city: segments[0] ?? null, state: null, country: originalSecond };
    }
    return { city: segments[0] ?? null, state: originalSecond, country: null };
  }

  return {
    city: segments[0] ?? null,
    state: segments[1] ?? null,
    country: segments[segments.length - 1] ?? null,
  };
}

function candidateScore(
  candidate: GeoCityRecord,
  hints: { stateHint: string | null; countryHint: string | null },
) {
  let score = 0;

  const candidateCountryCode = candidate.countryCode.toUpperCase();
  const hintCountry = normalizeCountryToken(hints.countryHint);
  if (hintCountry) {
    if (
      hintCountry === candidateCountryCode ||
      normalizeLocationToken(candidate.country ?? "") === normalizeLocationToken(hints.countryHint ?? "")
    ) {
      score += 100;
    } else {
      score -= 90;
    }
  }

  const hintState = normalizeStateToken(hints.stateHint);
  if (hintState) {
    const candidateStateCode = normalizeStateToken(candidate.stateCode);
    const candidateStateName = normalizeStateToken(candidate.state);
    if (hintState === candidateStateCode || hintState === candidateStateName) {
      score += 45;
    } else {
      score -= 25;
    }
  }

  const pop = Number.isFinite(candidate.population) ? Math.max(1, candidate.population) : 1;
  score += Math.min(40, Math.log10(pop) * 4);
  return score;
}

function bestCandidateForCityKey(
  cityKey: string,
  hints: { stateHint: string | null; countryHint: string | null },
): GeoCityRecord | null {
  const candidates = geonamesIndex.byCity?.[cityKey] ?? [];
  if (candidates.length === 0) return null;

  let best = candidates[0] ?? null;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const candidate of candidates) {
    const score = candidateScore(candidate, hints);
    if (!best || score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function parseRawLocationText(rawLocationText: string | null | undefined): LeadLocation[] {
  if (!rawLocationText) return [];
  const parts = rawLocationText
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean);
  const deduped = Array.from(new Set(parts.map((x) => x.toLowerCase())));
  return deduped.map((normalized) => {
    const raw = parts.find((value) => value.toLowerCase() === normalized) ?? normalized;
    const parsed = parseLocationParts(raw);
    const resolved = resolveLocation(raw);
    return {
      raw,
      city: parsed.city ?? raw,
      state: parsed.state,
      country: parsed.country,
      lat: resolved?.lat ?? null,
      lon: resolved?.lon ?? null,
    };
  });
}

export function resolveLocation(locationString: string | null | undefined): ResolvedLocation | null {
  if (!locationString || !locationString.trim()) return null;
  const trimmed = locationString.trim();
  const parsed = parseLocationParts(trimmed);

  const cityInput = parsed.city ?? trimmed.split(",")[0] ?? trimmed;
  const cityKey = resolveCityKey(cityInput);
  if (!cityKey) {
    return {
      city: parsed.city,
      state: parsed.state,
      country: parsed.country,
      lat: null,
      lon: null,
    };
  }

  const candidate = bestCandidateForCityKey(cityKey, {
    stateHint: parsed.state,
    countryHint: parsed.country,
  });

  if (!candidate) {
    return {
      city: parsed.city,
      state: parsed.state,
      country: parsed.country,
      lat: null,
      lon: null,
    };
  }

  return {
    city: candidate.city ?? parsed.city,
    state: candidate.state ?? parsed.state,
    country: candidate.country ?? parsed.country,
    lat: candidate.lat,
    lon: candidate.lon,
  };
}

export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

export function coerceLeadLocations(
  lead: Pick<LeadRecord, "locations" | "rawLocationText"> & {
    location?: string | null;
  },
): LeadLocation[] {
  if (Array.isArray(lead.locations) && lead.locations.length > 0) {
    return lead.locations
      .map((loc) => {
        const raw = typeof loc.raw === "string" ? loc.raw.trim() : "";
        const resolved = raw ? resolveLocation(raw) : null;
        return {
          raw,
          city: typeof loc.city === "string" ? loc.city.trim() || null : resolved?.city ?? null,
          state: typeof loc.state === "string" ? loc.state.trim() || null : resolved?.state ?? null,
          country:
            typeof loc.country === "string"
              ? loc.country.trim() || null
              : resolved?.country ?? null,
          lat:
            typeof loc.lat === "number" && Number.isFinite(loc.lat)
              ? loc.lat
              : resolved?.lat ?? null,
          lon:
            typeof loc.lon === "number" && Number.isFinite(loc.lon)
              ? loc.lon
              : resolved?.lon ?? null,
        };
      })
      .filter((loc) => loc.raw.length > 0);
  }

  const fallbackText = lead.rawLocationText ?? lead.location ?? null;
  return parseRawLocationText(fallbackText);
}

export function primaryLeadLocationText(
  lead: Pick<LeadRecord, "locations" | "rawLocationText"> & {
    location?: string | null;
  },
): string | null {
  const fromLocations = coerceLeadLocations(lead)[0]?.raw ?? null;
  if (fromLocations) return fromLocations;
  const fromRawLocationText =
    typeof lead.rawLocationText === "string" ? lead.rawLocationText.trim() : "";
  if (fromRawLocationText) return fromRawLocationText;
  const legacyLocation = typeof lead.location === "string" ? lead.location.trim() : "";
  return legacyLocation || null;
}
