"use client";

import * as React from "react";
import type { RankedItem } from "@/components/analytics/charts/types";

export function RankedBarList({
  items,
}: {
  items: RankedItem[];
}) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const width = (item.value / max) * 100;
        return (
          <div key={item.id} className="space-y-1">
            <div className="flex items-end justify-between gap-3 text-xs">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{item.label}</p>
                {item.subLabel ? (
                  <p className="truncate text-[11px] text-muted-foreground">{item.subLabel}</p>
                ) : null}
              </div>
              <p className="shrink-0 font-semibold text-foreground">
                {Math.round(item.value).toLocaleString()}
              </p>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-[var(--intent-muted-border)] bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--intent-primary)]"
                style={{ width: `${Math.max(6, width)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
