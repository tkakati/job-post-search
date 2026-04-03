"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function AnalyticsSectionStack({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-2.5", className)}>{children}</div>;
}

export function AnalyticsKpiRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("grid gap-2 md:grid-cols-2 xl:grid-cols-6", className)}>{children}</div>;
}

export function AnalyticsPrimaryRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("grid gap-2.5 xl:grid-cols-2", className)}>{children}</div>;
}

export function AnalyticsSupportRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("grid gap-2.5 md:grid-cols-2", className)}>{children}</div>;
}

