import { z } from "zod";
import { JsonRecordSchema, IsoDateStringSchema } from "@/lib/schemas/common";

export const LeadLocationSchema = z.object({
  raw: z.string().min(1),
  city: z.string().nullable(),
  state: z.string().nullable(),
  country: z.string().nullable(),
  lat: z.number().nullable(),
  lon: z.number().nullable(),
});

export const LeadRecordSchema = z.object({
  id: z.number().int().positive().optional(),
  canonicalUrl: z.string().url(),
  identityKey: z.string().min(1),
  sourceType: z.string().min(1),
  titleOrRole: z.string().min(1),
  company: z.string().nullable().optional(),
  locations: z.array(LeadLocationSchema).optional(),
  rawLocationText: z.string().nullable().optional(),
  normalizedLocationJson: JsonRecordSchema.or(z.string()).nullable().optional(),
  employmentType: z
    .enum(["full-time", "part-time", "contract", "internship"])
    .nullable()
    .optional(),
  workMode: z.enum(["onsite", "hybrid", "remote"]).nullable().optional(),
  author: z.string().nullable().optional(),
  snippet: z.string().nullable().optional(),
  fullText: z.string().nullable().optional(),
  postedAt: IsoDateStringSchema.nullable().optional(),
  fetchedAt: IsoDateStringSchema.nullable().optional(),
  roleEmbedding: z.array(z.number()).nullable().optional(),
  hiringIntentScore: z.number().min(0).max(1).nullable().optional(),
  leadScore: z.number().min(0).max(1).nullable().optional(),
  roleLocationKey: z.string().min(1),
  sourceMetadataJson: JsonRecordSchema.nullable().optional(),
});

export const LeadCardViewModelSchema = z.object({
  leadId: z.number().int().positive().optional(),
  title: z.string().min(1),
  company: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  locations: z.array(LeadLocationSchema).optional(),
  rawLocationText: z.string().nullable().optional(),
  canonicalUrl: z.string().url(),
  url: z.string().url().optional(),
  snippet: z.string().nullable().optional(),
  sourceType: z.string().min(1),
  sourceBadge: z.enum(["retrieved", "fresh", "both"]),
  // Explicit final result fields for debugging/product payload.
  postUrl: z.string().url().optional(),
  generatedQuery: z.string().optional(),
  postAuthor: z.string().nullable().optional(),
  postAuthorUrl: z.string().url().nullable().optional(),
  jobTitle: z.string().min(1).optional(),
  jobLocation: z.string().nullable().optional(),
  score: z.number().min(0).max(1).nullable().optional(),
  freshness: z.enum(["retrieved", "fresh", "both"]).optional(),
  provenanceSources: z.array(z.enum(["retrieval", "fresh_search"])).min(1),
  postedAt: IsoDateStringSchema.nullable().optional(),
  isNewForUser: z.boolean(),
  newBadge: z.literal("new").optional(),
  qualityBadge: z.enum(["high", "medium", "low", "unscored"]).optional(),
});

export function parseLeadRecord(input: unknown) {
  return LeadRecordSchema.parse(input);
}
