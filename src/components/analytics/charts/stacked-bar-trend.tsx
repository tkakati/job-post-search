"use client";

import * as React from "react";
import type { BreakdownItem } from "@/components/analytics/charts/types";

const COLORS = [
  "#2f7a4b",
  "#16a34a",
  "#0ea5e9",
  "#64748b",
  "#f59e0b",
  "#8b5cf6",
];

export function StackedBarTrend({
  items,
}: {
  items: BreakdownItem[];
}) {
  const normalized = React.useMemo(() => {
    const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
    return items.map((item, index) => ({
      ...item,
      color: COLORS[index % COLORS.length],
      width: total > 0 ? (Math.max(0, item.value) / total) * 100 : 0,
    }));
  }, [items]);

  return (
    <div className="space-y-2">
      <div className="h-3 w-full overflow-hidden rounded-full border border-[var(--intent-muted-border)] bg-[var(--surface-2)]">
        {normalized.map((item) => (
          <div
            key={item.id}
            className="inline-block h-full"
            style={{ width: `${item.width}%`, backgroundColor: item.color }}
            title={`${item.label}: ${Math.round(item.value)}%`}
          />
        ))}
      </div>
      <div className="grid gap-x-2 gap-y-1.5 sm:grid-cols-2">
        {normalized.map((item) => (
          <div key={item.id} className="flex items-center justify-between text-[11px]">
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
              {item.label}
            </span>
            <span className="font-medium text-foreground">{Math.round(item.value)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
