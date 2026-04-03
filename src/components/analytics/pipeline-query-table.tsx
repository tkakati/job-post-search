"use client";

import * as React from "react";
import type { PipelineQueryRow } from "@/components/analytics/charts/adapters";

const STATUS_META: Record<
  PipelineQueryRow["status"],
  { label: string; className: string }
> = {
  strong: {
    label: "Strong",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  watch: {
    label: "Watch",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  weak: {
    label: "Weak",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
};

export function PipelineQueryTable({ rows }: { rows: PipelineQueryRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--intent-muted-border)] bg-[var(--surface-2)]">
      <table className="w-full min-w-[900px] text-xs">
        <thead className="border-b border-[var(--intent-muted-border)] text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Query family</th>
            <th className="px-3 py-2 text-right font-medium">Runs</th>
            <th className="px-3 py-2 text-right font-medium">Retrieved</th>
            <th className="px-3 py-2 text-right font-medium">Extracted</th>
            <th className="px-3 py-2 text-right font-medium">HQ posts</th>
            <th className="px-3 py-2 text-right font-medium">HQ yield</th>
            <th className="px-3 py-2 text-right font-medium">Avg cost</th>
            <th className="px-3 py-2 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = STATUS_META[row.status];
            return (
              <tr key={row.id} className="border-b border-[var(--intent-muted-border)] last:border-b-0">
                <td className="max-w-[360px] truncate px-3 py-2 text-foreground">{row.queryFamily}</td>
                <td className="px-3 py-2 text-right font-medium text-foreground">{row.runs}</td>
                <td className="px-3 py-2 text-right font-medium text-foreground">{row.retrieved}</td>
                <td className="px-3 py-2 text-right font-medium text-foreground">{row.extracted}</td>
                <td className="px-3 py-2 text-right font-medium text-foreground">{row.highQuality}</td>
                <td className="px-3 py-2 text-right font-medium text-foreground">{Math.round(row.hqYieldPct)}%</td>
                <td className="px-3 py-2 text-right font-medium text-foreground">${row.avgCostUsd.toFixed(2)}</td>
                <td className="px-3 py-2 text-right">
                  <span
                    className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium ${status.className}`}
                  >
                    {status.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

