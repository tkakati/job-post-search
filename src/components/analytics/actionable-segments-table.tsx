"use client";

import * as React from "react";
import type { ActionableSegmentRow } from "@/components/analytics/charts/adapters";

const CONFIDENCE_TONE: Record<ActionableSegmentRow["confidence"], string> = {
  high: "border-emerald-200 bg-emerald-50 text-emerald-700",
  medium: "border-amber-200 bg-amber-50 text-amber-700",
  low: "border-slate-200 bg-slate-50 text-slate-700",
};

export function ActionableSegmentsTable({ rows }: { rows: ActionableSegmentRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--intent-muted-border)] bg-[var(--surface-2)]">
      <table className="w-full min-w-[560px] text-xs">
        <thead className="border-b border-[var(--intent-muted-border)] text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Segment</th>
            <th className="px-3 py-2 text-right font-medium">Action rate</th>
            <th className="px-3 py-2 text-right font-medium">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-[var(--intent-muted-border)] last:border-b-0">
              <td className="max-w-[360px] truncate px-3 py-2 text-foreground">{row.segment}</td>
              <td className="px-3 py-2 text-right font-medium text-foreground">{Math.round(row.actionRate)}%</td>
              <td className="px-3 py-2 text-right">
                <span
                  className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium ${CONFIDENCE_TONE[row.confidence]}`}
                >
                  {row.confidence}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

