"use client";

import * as React from "react";
import type { PipelineStageItem } from "@/components/analytics/charts/adapters";

export function PipelineStageLossView({ rows }: { rows: PipelineStageItem[] }) {
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const width = Math.max(8, Math.round((row.value / max) * 100));
        const barTone = row.highlightDrop
          ? "bg-rose-500"
          : row.source === "real"
            ? "bg-emerald-500"
            : row.source === "mixed"
              ? "bg-amber-500"
              : "bg-violet-500";
        return (
          <div key={row.id} className="space-y-1">
            <div className="flex items-end justify-between gap-3 text-xs">
              <p className="min-w-0 truncate text-foreground">{row.label}</p>
              <div className="shrink-0 text-right">
                <p className="font-semibold text-foreground">{Math.round(row.value).toLocaleString()}</p>
                <p className={row.highlightDrop ? "text-rose-600" : "text-muted-foreground"}>
                  {row.conversionFromPrev === null ? "—" : `${Math.round(row.conversionFromPrev)}% from prev`}
                </p>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-[var(--intent-muted-border)] bg-[var(--surface-2)]">
              <div className={`h-full rounded-full ${barTone}`} style={{ width: `${width}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground">
              Cumulative loss: {Math.max(0, Math.round(row.cumulativeLoss))}%
            </p>
          </div>
        );
      })}
    </div>
  );
}

