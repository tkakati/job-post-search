"use client";

import * as React from "react";
import type { BreakdownItem } from "@/components/analytics/charts/types";

export function StageLatencyTable({ rows }: { rows: BreakdownItem[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--intent-muted-border)] bg-[var(--surface-2)]">
      <table className="w-full min-w-[280px] text-xs">
        <thead className="border-b border-[var(--intent-muted-border)] text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Stage</th>
            <th className="px-3 py-2 text-right font-medium">p50</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-[var(--intent-muted-border)] last:border-b-0">
              <td className="px-3 py-2 text-foreground">{row.label}</td>
              <td className="px-3 py-2 text-right font-medium text-foreground">
                {Math.round(row.value)} ms
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

