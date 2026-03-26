import type { LeadLocation } from "@/lib/types/contracts";
import { coerceLeadLocations } from "@/lib/location/geo";

type LocationDisplayInput = {
  locations?: LeadLocation[] | null;
  rawLocationText?: string | null;
  location?: string | null;
  maxVisible?: number;
};

export type LocationDisplayOutput = {
  display: string;
  full: string | null;
  rawLocationText: string | null;
  parsedLocations: LeadLocation[];
  omittedCount: number;
};

function normalizeText(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function dedupeLocationTokens(values: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

export function formatLeadLocationDisplay(
  input: LocationDisplayInput,
): LocationDisplayOutput {
  const parsedLocations = coerceLeadLocations({
    locations: input.locations ?? undefined,
    rawLocationText: input.rawLocationText ?? null,
    location: input.location ?? null,
  });
  const locationTokens = dedupeLocationTokens(
    parsedLocations.map((loc) => loc.raw),
  );
  const fullFromTokens =
    locationTokens.length > 0 ? locationTokens.join(" • ") : null;

  const fallbackRawLocationText = normalizeText(input.rawLocationText);
  const fallbackText = fallbackRawLocationText;

  if (!fullFromTokens && !fallbackText) {
    return {
      display: "Location not specified",
      full: null,
      rawLocationText: fallbackRawLocationText,
      parsedLocations: [],
      omittedCount: 0,
    };
  }

  const full = fullFromTokens ?? fallbackText;
  const maxVisible =
    typeof input.maxVisible === "number" && Number.isFinite(input.maxVisible)
      ? Math.max(1, Math.trunc(input.maxVisible))
      : Number.POSITIVE_INFINITY;

  if (!fullFromTokens || locationTokens.length <= maxVisible) {
    return {
      display: full ?? "Location not specified",
      full,
      rawLocationText: fallbackRawLocationText,
      parsedLocations,
      omittedCount: 0,
    };
  }

  const omittedCount = Math.max(0, locationTokens.length - maxVisible);
  const visible = locationTokens.slice(0, maxVisible).join(" • ");
  return {
    display: `${visible} • +${omittedCount} more`,
    full,
    rawLocationText: fallbackRawLocationText,
    parsedLocations,
    omittedCount,
  };
}
