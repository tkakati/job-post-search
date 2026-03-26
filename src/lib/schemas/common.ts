import { z } from "zod";

export const PlannerModeSchema = z.enum([
  "full_explore",
  "explore_heavy",
  "exploit_heavy",
]);

export const NumExploreQueriesSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export const StopReasonSchema = z.union([
  z.literal("sufficient_high_quality_leads"),
  z.literal("max_iterations"),
  z.null(),
]);

export const RecencyPreferenceSchema = z.enum([
  "past-24h",
  "past-week",
  "past-month",
]);

export const IsoDateStringSchema = z
  .string()
  .datetime({ offset: true })
  .or(z.string().datetime());

export const JsonRecordSchema = z.record(z.string(), z.unknown());
