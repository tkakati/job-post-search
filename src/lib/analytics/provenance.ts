import type { AnalyticsMetric, AnalyticsResponse } from "@/lib/types/api";

type BuildAnalyticsProvenanceInput = {
  metrics: AnalyticsMetric[];
  mixedIds?: string[];
};

export function buildAnalyticsProvenance(
  input: BuildAnalyticsProvenanceInput,
): AnalyticsResponse["provenance"] {
  const mixed = new Set(input.mixedIds ?? []);
  const real: string[] = [];
  const mock: string[] = [];

  for (const item of input.metrics) {
    if (mixed.has(item.id)) continue;
    if (item.source === "real") {
      real.push(item.id);
      continue;
    }
    if (item.source === "mock") {
      mock.push(item.id);
    }
  }

  return {
    real,
    mock,
    mixed: Array.from(mixed),
  };
}
