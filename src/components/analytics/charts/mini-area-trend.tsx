"use client";

import * as React from "react";
import type { TrendPoint } from "@/components/analytics/charts/types";

function buildPath(values: number[], width: number, height: number): string {
  if (values.length === 0) return "";
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? width / (values.length - 1) : width;
  return values
    .map((value, index) => {
      const x = index * stepX;
      const y = height - (value / max) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function MiniAreaTrend({
  data,
}: {
  data: TrendPoint[];
}) {
  const width = 560;
  const height = 116;
  const globalValues = data.map((point) => point.global);
  const mineValues = data.map((point) => point.mine);
  const globalPath = buildPath(globalValues, width, height);
  const minePath = buildPath(mineValues, width, height);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--intent-primary)]" />
          Global
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
          You
        </span>
      </div>
      <div className="overflow-x-auto rounded-md border border-[var(--intent-muted-border)] bg-[var(--surface-2)] p-1.5">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[116px] w-full min-w-[480px]"
          role="img"
          aria-label="Trend chart"
        >
          <path d={globalPath} fill="none" stroke="var(--intent-primary)" strokeWidth="2.2" />
          <path d={minePath} fill="none" stroke="#64748b" strokeWidth="1.8" strokeDasharray="4 4" />
        </svg>
      </div>
    </div>
  );
}
