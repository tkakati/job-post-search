"use client";

import * as React from "react";
import type { BreakdownItem } from "@/components/analytics/charts/types";

const COLORS = ["#2f7a4b", "#16a34a", "#0ea5e9", "#64748b", "#f59e0b", "#8b5cf6"];

export function DonutBreakdown({
  items,
  centerLabel = "Distribution",
}: {
  items: BreakdownItem[];
  centerLabel?: string;
}) {
  const segments = React.useMemo(() => {
    const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
    return items.reduce<Array<BreakdownItem & { color: string; start: number; end: number; pct: number }>>(
      (acc, item, index) => {
        const ratio = total > 0 ? Math.max(0, item.value) / total : 0;
        const start = acc.length > 0 ? acc[acc.length - 1]!.end : 0;
        const end = start + ratio * 360;
        acc.push({
          ...item,
          color: COLORS[index % COLORS.length],
          start,
          end,
          pct: ratio * 100,
        });
        return acc;
      },
      [],
    );
  }, [items]);

  const gradient = segments
    .map((segment) => `${segment.color} ${segment.start}deg ${segment.end}deg`)
    .join(", ");

  return (
    <div className="grid gap-4 sm:grid-cols-[120px_minmax(0,1fr)] sm:items-center">
      <div className="relative mx-auto h-[120px] w-[120px] rounded-full border border-[var(--intent-muted-border)] bg-[var(--surface-2)]">
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: `conic-gradient(${gradient || "#e2e8f0 0deg 360deg"})` }}
        />
        <div className="absolute inset-[16px] grid place-items-center rounded-full bg-background text-center">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{centerLabel}</span>
        </div>
      </div>
      <div className="space-y-2">
        {segments.map((segment) => (
          <div key={segment.id} className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: segment.color }} />
              {segment.label}
            </span>
            <span className="font-medium text-foreground">{Math.round(segment.pct)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
