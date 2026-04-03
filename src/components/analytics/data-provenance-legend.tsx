"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function DataProvenanceLegend({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[var(--intent-muted-border)] bg-[var(--surface-2)] px-1.5 py-0.5 text-[9px] text-muted-foreground",
        className,
      )}
    >
      <span className="inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Real
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
        Mock
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Mixed
      </span>
    </div>
  );
}
