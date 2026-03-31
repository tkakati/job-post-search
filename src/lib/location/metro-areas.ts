import {
  haversineDistance,
  resolveLocation,
  type ResolvedLocation,
} from "@/lib/location/geo";

export type MetroAreaId = "bay_area";

export const BAY_AREA_CITIES = [
  "San Francisco",
  "San Jose",
  "Oakland",
  "Palo Alto",
  "Mountain View",
  "Sunnyvale",
  "Cupertino",
  "Santa Clara",
  "Redwood City",
  "Menlo Park",
  "Fremont",
  "Berkeley",
  "San Mateo",
  "Daly City",
  "Milpitas",
] as const;

export const BAY_AREA_RADIUS_KM = 20;

const BAY_AREA_ALIASES = [
  "bay area",
  "sf bay area",
  "san francisco bay area",
] as const;

const metroSeedCache = new Map<MetroAreaId, ResolvedLocation[]>();

function normalizeLocationToken(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const BAY_AREA_ALIAS_SET = new Set(BAY_AREA_ALIASES.map((alias) => normalizeLocationToken(alias)));
const BAY_AREA_CITY_SET = new Set(
  BAY_AREA_CITIES.map((city) => normalizeLocationToken(city)),
);

function chunkCities(input: readonly string[], chunkSize: number) {
  const out: string[][] = [];
  for (let i = 0; i < input.length; i += chunkSize) {
    out.push([...input.slice(i, i + chunkSize)]);
  }
  return out;
}

export function resolveMetroAreaInput(location: string): MetroAreaId | null {
  const normalized = normalizeLocationToken(location);
  if (!normalized) return null;
  return BAY_AREA_ALIAS_SET.has(normalized) ? "bay_area" : null;
}

export function getMetroAreaQueryClauses(location: string): string[] {
  const metroArea = resolveMetroAreaInput(location);
  if (metroArea !== "bay_area") return [];
  const cityGroups = chunkCities(BAY_AREA_CITIES, 5);
  return cityGroups.map((group) => `(${group.join(" OR ")})`);
}

export function getMetroSeedLocations(metroArea: MetroAreaId): ResolvedLocation[] {
  const cached = metroSeedCache.get(metroArea);
  if (cached) return cached;

  const cityList = metroArea === "bay_area" ? BAY_AREA_CITIES : [];
  const resolved = cityList
    .map((city) => resolveLocation(city))
    .filter(
      (candidate): candidate is ResolvedLocation =>
        candidate != null && candidate.lat != null && candidate.lon != null,
    );
  metroSeedCache.set(metroArea, resolved);
  return resolved;
}

export function isResolvedLocationInMetroArea(
  inputResolvedLocation: ResolvedLocation | null | undefined,
  options?: {
    radiusKm?: number;
    area?: MetroAreaId;
  },
): boolean {
  if (!inputResolvedLocation) return false;
  const area = options?.area ?? "bay_area";
  const radiusKm = options?.radiusKm ?? BAY_AREA_RADIUS_KM;
  if (area !== "bay_area") return false;

  const normalizedCity = normalizeLocationToken(inputResolvedLocation.city ?? "");
  if (normalizedCity && BAY_AREA_CITY_SET.has(normalizedCity)) return true;

  if (inputResolvedLocation.lat == null || inputResolvedLocation.lon == null) return false;
  const seeds = getMetroSeedLocations("bay_area");
  for (const seed of seeds) {
    if (seed.lat == null || seed.lon == null) continue;
    const distance = haversineDistance(
      inputResolvedLocation.lat,
      inputResolvedLocation.lon,
      seed.lat,
      seed.lon,
    );
    if (distance <= radiusKm) return true;
  }
  return false;
}
