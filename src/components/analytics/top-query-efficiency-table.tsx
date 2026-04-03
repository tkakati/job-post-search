"use client";

import * as React from "react";
import type { QueryEfficiencyRow } from "@/components/analytics/charts/adapters";

function sourceTone(source: QueryEfficiencyRow["source"]) {
  if (source === "real") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-violet-50 text-violet-700 border-violet-200";
}

export function TopQueryEfficiencyTable({ rows }: { rows: QueryEfficiencyRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--intent-muted-border)] bg-[var(--surface-2)]">
      <table className="w-full min-w-[520px] text-xs">
        <thead className="border-b border-[var(--intent-muted-border)] text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Query</th>
            <th className="px-3 py-2 text-right font-medium">Extracted</th>
            <th className="px-3 py-2 text-right font-medium">HQ</th>
            <th className="px-3 py-2 text-right font-medium">Efficiency</th>
            <th className="px-3 py-2 text-right font-medium">Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-[var(--intent-muted-border)] last:border-b-0">
              <td className="max-w-[320px] truncate px-3 py-2 text-foreground">{row.query}</td>
              <td className="px-3 py-2 text-right font-medium text-foreground">{row.postsExtracted}</td>
              <td className="px-3 py-2 text-right font-medium text-foreground">{row.hqPosts}</td>
              <td className="px-3 py-2 text-right font-medium text-foreground">
                {Math.round(row.efficiencyPct)}%
              </td>
              <td className="px-3 py-2 text-right">
                <span
                  className={`inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium uppercase tracking-wide ${sourceTone(row.source)}`}
                >
                  {row.source}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

