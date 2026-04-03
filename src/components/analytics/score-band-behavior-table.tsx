"use client";

import * as React from "react";
import type { ScoreBandBehaviorRow } from "@/components/analytics/charts/adapters";

function bandLabel(band: ScoreBandBehaviorRow["band"]) {
  if (band === "high") return "High";
  if (band === "medium") return "Medium";
  if (band === "low") return "Low";
  return "Unscored";
}

const BAND_TONE: Record<ScoreBandBehaviorRow["band"], string> = {
  high: "text-emerald-700",
  medium: "text-amber-700",
  low: "text-rose-700",
  unscored: "text-slate-600",
};

export function ScoreBandBehaviorTable({ rows }: { rows: ScoreBandBehaviorRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--intent-muted-border)] bg-[var(--surface-2)]">
      <table className="w-full min-w-[760px] text-xs">
        <thead className="border-b border-[var(--intent-muted-border)] text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Score band</th>
            <th className="px-3 py-2 text-right font-medium">Shown</th>
            <th className="px-3 py-2 text-right font-medium">Opened rate</th>
            <th className="px-3 py-2 text-right font-medium">Click rate</th>
            <th className="px-3 py-2 text-right font-medium">Message rate</th>
            <th className="px-3 py-2 text-right font-medium">Hide / not helpful</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-[var(--intent-muted-border)] last:border-b-0">
              <td className={`px-3 py-2 font-medium ${BAND_TONE[row.band]}`}>{bandLabel(row.band)}</td>
              <td className="px-3 py-2 text-right font-medium text-foreground">{row.shown.toLocaleString()}</td>
              <td className="px-3 py-2 text-right font-medium text-foreground">{Math.round(row.openedRate)}%</td>
              <td className="px-3 py-2 text-right font-medium text-foreground">{Math.round(row.clickRate)}%</td>
              <td className="px-3 py-2 text-right font-medium text-foreground">{Math.round(row.messageRate)}%</td>
              <td className="px-3 py-2 text-right font-medium text-foreground">
                {Math.round(row.hideNotHelpfulRate)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

