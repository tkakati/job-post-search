"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function AnalyticsSectionCard({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-[var(--intent-muted-border)] bg-[var(--surface-1)] p-3", className)}>
      <div className="mb-2 flex items-start justify-between gap-2.5">
        <div>
          <h3 className="text-[13px] font-semibold tracking-tight text-foreground">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </Card>
  );
}
