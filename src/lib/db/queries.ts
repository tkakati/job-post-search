import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { dbClient } from "@/lib/db";
import { jobLeads, leadShows, queryPerformance } from "@/lib/db/schema";
import type { Lead } from "@/lib/agent/types";

export async function getStoredLeads(input: {
  role: string;
  location: string;
  recencyDays: number;
  limit: number;
}): Promise<Lead[]> {
  const db = dbClient();
  const { role, location, recencyDays, limit } = input;
  const since = new Date(Date.now() - recencyDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      id: jobLeads.id,
      role: jobLeads.role,
      location: jobLeads.location,
      title: jobLeads.title,
      company: jobLeads.company,
      url: jobLeads.url,
      description: jobLeads.description,
      source: jobLeads.source,
      sourceMetadata: jobLeads.sourceMetadata,
      createdAt: jobLeads.createdAt,
    })
    .from(jobLeads)
    .where(and(eq(jobLeads.role, role), eq(jobLeads.location, location), gte(jobLeads.createdAt, since)))
    .orderBy(desc(jobLeads.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    ...r,
    company: r.company ?? null,
    description: r.description ?? null,
    sourceMetadata: r.sourceMetadata ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : (r.createdAt as string),
  }));
}

export async function upsertLeads(input: {
  leads: Array<Omit<Lead, "id">>;
}): Promise<Lead[]> {
  const db = dbClient();
  const { leads } = input;
  if (leads.length === 0) return [];

  const urls = leads.map((l) => l.url);
  const existing = await db
    .select({
      id: jobLeads.id,
      url: jobLeads.url,
      title: jobLeads.title,
      company: jobLeads.company,
      role: jobLeads.role,
      location: jobLeads.location,
      description: jobLeads.description,
      source: jobLeads.source,
      sourceMetadata: jobLeads.sourceMetadata,
      createdAt: jobLeads.createdAt,
    })
    .from(jobLeads)
    .where(inArray(jobLeads.url, urls));

  const existingByUrl = new Map(existing.map((e) => [e.url, e]));
  const toInsert = leads.filter((l) => !existingByUrl.has(l.url));

  if (toInsert.length > 0) {
    // Keep the insertion idempotent by skipping duplicates by URL.
    await db.insert(jobLeads).values(
      toInsert.map((l) => ({
        role: l.role,
        location: l.location,
        title: l.title,
        company: l.company ?? null,
        url: l.url,
        description: l.description ?? null,
        embedding: null, // Embeddings come later; pgvector schema is already in place.
        source: l.source,
        sourceMetadata: l.sourceMetadata ?? null,
      })),
    );
  }

  const afterInsert = await db
    .select({
      id: jobLeads.id,
      url: jobLeads.url,
      title: jobLeads.title,
      company: jobLeads.company,
      role: jobLeads.role,
      location: jobLeads.location,
      description: jobLeads.description,
      source: jobLeads.source,
      sourceMetadata: jobLeads.sourceMetadata,
      createdAt: jobLeads.createdAt,
    })
    .from(jobLeads)
    .where(inArray(jobLeads.url, urls));

  return afterInsert.map((r) => ({
    ...r,
    company: r.company ?? null,
    description: r.description ?? null,
    sourceMetadata: r.sourceMetadata ?? null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : (r.createdAt as string),
  }));
}

export async function getAlreadyShownLeadIds(input: {
  userId: string;
  leadIds: number[];
}): Promise<Set<number>> {
  const db = dbClient();
  const { userId, leadIds } = input;
  if (leadIds.length === 0) return new Set<number>();

  const rows = await db
    .select({ leadId: leadShows.leadId })
    .from(leadShows)
    .where(and(eq(leadShows.userId, userId), inArray(leadShows.leadId, leadIds)));

  return new Set(rows.map((r) => r.leadId));
}

export async function markLeadsAsShown(input: {
  userId: string;
  leadIds: number[];
}): Promise<void> {
  const db = dbClient();
  const { userId, leadIds } = input;
  if (leadIds.length === 0) return;

  // Idempotent: ignore duplicates.
  await db
    .insert(leadShows)
    .values(
      leadIds.map((leadId) => ({
        userId,
        leadId,
        shownAt: new Date(),
      })),
    )
    .onConflictDoNothing();
}

export async function recordQueryPerformance(input: {
  roleLocationKey: string;
  queryText: string;
  totalRuns: number;
  totalResults: number;
  totalUsableResults: number;
  totalNewLeadContributions: number;
  avgQuality: number;
}): Promise<void> {
  const db = dbClient();
  const {
    roleLocationKey,
    queryText,
    totalRuns,
    totalResults,
    totalUsableResults,
    totalNewLeadContributions,
    avgQuality,
  } = input;

  await db
    .insert(queryPerformance)
    .values({
      roleLocationKey,
      queryText,
      totalRuns,
      totalResults,
      totalUsableResults,
      totalNewLeadContributions,
      avgQuality,
    })
    .onConflictDoUpdate({
      target: [queryPerformance.roleLocationKey, queryPerformance.queryText],
      set: {
        // Increment counters; for MVP we just overwrite avgQuality.
        totalRuns: sql`"query_performance"."total_runs" + excluded."total_runs"`,
        totalResults: sql`"query_performance"."total_results" + excluded."total_results"`,
        totalUsableResults: sql`"query_performance"."total_usable_results" + excluded."total_usable_results"`,
        totalNewLeadContributions: sql`"query_performance"."total_new_lead_contributions" + excluded."total_new_lead_contributions"`,
        avgQuality: avgQuality,
        updatedAt: sql`now()`,
      },
    });
}

