"use client";

import * as React from "react";
import type { FunnelStep } from "@/components/analytics/charts/adapters";

const SOURCE_TONE: Record<FunnelStep["source"], string> = {
  real: "bg-emerald-500",
  mock: "bg-violet-500",
  mixed: "bg-amber-500",
};

export function PipelineFunnel({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((step) => step.value), 1);

  return (
    <div className="space-y-2">
      {steps.map((step, index) => {
        const width = Math.max(8, Math.round((step.value / max) * 100));
        return (
          <div key={step.id} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <p className="truncate text-muted-foreground">
                {index + 1}. {step.label}
              </p>
              <p className="shrink-0 font-semibold text-foreground">{Math.round(step.value).toLocaleString()}</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full border border-[var(--intent-muted-border)] bg-[var(--surface-2)]">
              <div className={`h-full rounded-full ${SOURCE_TONE[step.source]}`} style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

