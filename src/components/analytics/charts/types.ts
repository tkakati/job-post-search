import type { AnalyticsMetricSource } from "@/lib/types/api";

export type TrendPoint = {
  date: string;
  global: number;
  mine: number;
};

export type BreakdownItem = {
  id: string;
  label: string;
  value: number;
  source?: AnalyticsMetricSource;
};

export type RankedItem = {
  id: string;
  label: string;
  value: number;
  source?: AnalyticsMetricSource;
  subLabel?: string | null;
};
