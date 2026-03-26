import type { LeadLocation, LeadRecord } from "@/lib/types/contracts";

type ResolvedLocation = {
  city: string | null;
  state: string | null;
  country: string | null;
  lat: number | null;
  lon: number | null;
};

const CITY_GEO_MAP: Record<
  string,
  { city: string; state: string | null; country: string | null; lat: number; lon: number }
> = {
  seattle: {
    city: "Seattle",
    state: "WA",
    country: "USA",
    lat: 47.6062,
    lon: -122.3321,
  },
  bellevue: {
    city: "Bellevue",
    state: "WA",
    country: "USA",
    lat: 47.6101,
    lon: -122.2015,
  },
  redmond: {
    city: "Redmond",
    state: "WA",
    country: "USA",
    lat: 47.6739,
    lon: -122.1215,
  },
};

function normalizeLocationToken(value: string) {
  return value.trim().toLowerCase();
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
    return {
      raw,
      city: parsed.city ?? raw,
      state: parsed.state,
      country: parsed.country,
      lat: null,
      lon: null,
    };
  });
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
  return {
    city: segments[0] ?? null,
    state: segments[1] ?? null,
    country: segments[2] ?? null,
  };
}

export function resolveLocation(locationString: string | null | undefined): ResolvedLocation | null {
  if (!locationString || !locationString.trim()) return null;
  const trimmed = locationString.trim();
  const parsed = parseLocationParts(trimmed);
  const cityKey = normalizeLocationToken(parsed.city ?? trimmed.split(",")[0] ?? "");
  const mapped = CITY_GEO_MAP[cityKey];
  if (mapped) {
    return {
      city: mapped.city,
      state: mapped.state,
      country: mapped.country,
      lat: mapped.lat,
      lon: mapped.lon,
    };
  }
  return {
    city: parsed.city,
    state: parsed.state,
    country: parsed.country,
    lat: null,
    lon: null,
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
      .map((loc) => ({
        raw: typeof loc.raw === "string" ? loc.raw.trim() : "",
        city: typeof loc.city === "string" ? loc.city.trim() || null : null,
        state: typeof loc.state === "string" ? loc.state.trim() || null : null,
        country: typeof loc.country === "string" ? loc.country.trim() || null : null,
        lat: typeof loc.lat === "number" && Number.isFinite(loc.lat) ? loc.lat : null,
        lon: typeof loc.lon === "number" && Number.isFinite(loc.lon) ? loc.lon : null,
      }))
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
