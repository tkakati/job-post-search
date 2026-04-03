"use client";

import * as React from "react";
import type { DemandComboRow } from "@/components/analytics/charts/adapters";

const STATUS_META: Record<
  DemandComboRow["status"],
  { label: string; className: string }
> = {
  strong_coverage: {
    label: "Strong coverage",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  weak_coverage: {
    label: "Weak coverage",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  high_demand_gap: {
    label: "High demand gap",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
};

export function DemandComboTable({ rows }: { rows: DemandComboRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--intent-muted-border)] bg-[var(--surface-2)]">
      <table className="w-full min-w-[760px] text-xs">
        <thead className="border-b border-[var(--intent-muted-border)] text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Role · Location</th>
            <th className="px-3 py-2 text-right font-medium">Search volume</th>
            <th className="px-3 py-2 text-right font-medium">Zero-result rate</th>
            <th className="px-3 py-2 text-right font-medium">HQ yield / run</th>
            <th className="px-3 py-2 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = STATUS_META[row.status];
            return (
              <tr key={row.id} className="border-b border-[var(--intent-muted-border)] last:border-b-0">
                <td className="max-w-[280px] truncate px-3 py-2 text-foreground">{row.combo}</td>
                <td className="px-3 py-2 text-right font-medium text-foreground">{row.searchVolume}</td>
                <td className="px-3 py-2 text-right font-medium text-foreground">{row.zeroResultRate}%</td>
                <td className="px-3 py-2 text-right font-medium text-foreground">
                  {Math.round(row.hqYieldPerRun * 100)}%
                </td>
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

