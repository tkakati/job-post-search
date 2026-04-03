"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type CompactMetricSource = "real" | "mock" | "mixed";

const SOURCE_TONE: Record<CompactMetricSource, string> = {
  real: "border-emerald-200 bg-emerald-50 text-emerald-700",
  mock: "border-violet-200 bg-violet-50 text-violet-700",
  mixed: "border-amber-200 bg-amber-50 text-amber-700",
};

export function AnalyticsKpiCard({
  label,
  value,
  delta,
  footnote,
  source,
  className,
}: {
  label: string;
  value: string;
  delta: string;
  footnote: string;
  source?: CompactMetricSource;
  className?: string;
}) {
  const showSource = source && source !== "real";
  return (
    <Card className={cn("border-[var(--intent-muted-border)] bg-[var(--surface-1)] px-3 py-2", className)}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        {showSource ? (
          <span
            className={cn(
              "inline-flex h-4 items-center rounded-full border px-1.5 text-[9px] font-medium uppercase",
              SOURCE_TONE[source],
            )}
          >
            {source}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-lg font-semibold leading-tight text-foreground">{value}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">{delta}</p>
      <p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground">{footnote}</p>
    </Card>
  );
}
