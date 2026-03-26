import { inArray } from "drizzle-orm";

import { dbClient } from "@/lib/db";
import {
  generatedQueries,
  leadEvents,
  leadSources,
  leads,
  plannerRuns,
  queryPerformance,
  searchRuns,
  shownLeads,
  userSessions,
  users,
} from "@/lib/db/schema";
import { canonicalLeadIdentity } from "@/lib/utils/lead-identity";

function roleLocationKey(role: string, location: string) {
  return `${role.trim().toLowerCase()}::${location.trim().toLowerCase()}`;
}

async function main() {
  const db = dbClient();

  // Demo identity
  const userId = "demo_user";
  const userSessionId = "demo_session";
  const now = new Date();

  const role = "Frontend Engineer";
  const location = "San Francisco, CA";
  const roleLocKey = roleLocationKey(role, location);

  // 1) Users + sessions
  await db
    .insert(users)
    .values({
      id: userId,
      createdAt: now,
      lastSeenAt: now,
    })
    .onConflictDoNothing();

  await db
    .insert(userSessions)
    .values({
      id: userSessionId,
      userId,
      createdAt: now,
      lastSeenAt: now,
    })
    .onConflictDoNothing();

  // 2) Search run (insert a new run each time; shown history is idempotent per user+lead)
  const insertedSearch = await db
    .insert(searchRuns)
    .values({
      userSessionId,
      role,
      location,
      roleLocationKey: roleLocKey,
      recencyPreference: 30,
      iterationCount: 2,
      finalStopReason: "target_reached",
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: searchRuns.id });

  const searchRunId = insertedSearch[0]?.id;
  if (!searchRunId) throw new Error("Failed to insert search run");

  // 3) Planner run (deterministic placeholder)
  await db.insert(plannerRuns).values({
    searchRunId,
    iterationNumber: 0,
    plannerMode: "retrieval_plus_search",
    enableRetrieval: true,
    enableNewLeadGeneration: true,
    numExploreQueries: 1,
    retrievalSummaryJson: { retrievedCount: 1 },
    rationaleJson: { reason: "MVP deterministic planner by recency bucket" },
    createdAt: now,
  });

  // 4) Generated query + query performance
  const queryText = "frontend engineer san francisco job";
  await db.insert(generatedQueries).values({
    searchRunId,
    iterationNumber: 0,
    roleLocationKey: roleLocKey,
    queryText,
    queryKind: "search",
    isExplore: true,
    sourceUrl: "mock",
    performanceJson: { mock: true, totalResults: 12 },
    createdAt: now,
  });

  await db.insert(queryPerformance).values({
    roleLocationKey: roleLocKey,
    queryText,
    totalRuns: 1,
    totalResults: 12,
    totalUsableResults: 10,
    totalNewLeadContributions: 1,
    avgQuality: 0.75,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: [queryPerformance.roleLocationKey, queryPerformance.queryText],
    set: {
      totalRuns: 1,
      totalResults: 12,
      totalUsableResults: 10,
      totalNewLeadContributions: 1,
      avgQuality: 0.75,
      updatedAt: now,
    },
  });

  // 5) Leads + lead_sources
  const demoLeads = [
    {
      canonicalUrl: "https://example.com/jobs/lead-1",
      sourceType: "mock",
      titleOrRole: role,
      company: "Acme Inc",
      location,
      author: "Example",
      snippet: "Building job discovery pipelines.",
      fullText: "Full job description text for lead 1.",
      postedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
      fetchedAt: now,
      hiringIntentScore: 0.7,
      sourceMetadataJson: { source: "mock", lead: 1 },
    },
    {
      canonicalUrl: "https://example.com/jobs/lead-2",
      sourceType: "mock",
      titleOrRole: role,
      company: "Globex",
      location,
      author: "Example",
      snippet: "Frontend role with React and TypeScript.",
      fullText: "Full job description text for lead 2.",
      postedAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
      fetchedAt: now,
      hiringIntentScore: 0.66,
      sourceMetadataJson: { source: "mock", lead: 2 },
    },
    {
      canonicalUrl: "https://example.com/jobs/lead-3",
      sourceType: "mock",
      titleOrRole: role,
      company: "Initech",
      location,
      author: "Example",
      snippet: "React/Next.js engineering opportunity.",
      fullText: "Full job description text for lead 3.",
      postedAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      fetchedAt: now,
      hiringIntentScore: 0.55,
      sourceMetadataJson: { source: "mock", lead: 3 },
    },
  ];

  // Insert leads (idempotent by canonical URL) and then fetch IDs.
  const canonicalUrls = demoLeads.map((l) => l.canonicalUrl);
  await db
    .insert(leads)
    .values(
      demoLeads.map((l) => ({
        canonicalUrl: l.canonicalUrl,
        identityKey: canonicalLeadIdentity({
          url: l.canonicalUrl,
          titleOrRole: l.titleOrRole,
          company: l.company,
          location: l.location,
        }).identityKey,
        sourceType: l.sourceType,
        titleOrRole: l.titleOrRole,
        company: l.company,
        location: l.location,
        normalizedLocationJson: null,
        employmentType: null,
        workMode: null,
        author: l.author,
        snippet: l.snippet,
        fullText: l.fullText,
        postedAt: l.postedAt,
        fetchedAt: l.fetchedAt,
        hiringIntentScore: l.hiringIntentScore,
        roleLocationKey: roleLocKey,
        sourceMetadataJson: l.sourceMetadataJson,
        roleEmbedding: null,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing();

  const insertedLeads = await db
    .select({ id: leads.id, canonicalUrl: leads.canonicalUrl })
    .from(leads)
    .where(inArray(leads.canonicalUrl, canonicalUrls));

  const idByCanonical = new Map(
    insertedLeads.map((l) => [l.canonicalUrl, l.id]),
  );

  const sourceRows = demoLeads.map((l) => ({
    leadId: idByCanonical.get(l.canonicalUrl)!,
    sourceProvider: "mock-search-provider",
    sourceQuery: queryText,
    sourceUrl: `https://example.com/source/${l.canonicalUrl.split("/").pop()}`,
    sourceInputUrl: "https://example.com/search",
    sourceMetadataJson: { queryText, canonicalUrl: l.canonicalUrl },
    createdAt: now,
  }));

  await db.insert(leadSources).values(sourceRows).onConflictDoNothing();

  // 6) Shown history + events
  await db.insert(shownLeads).values([
    {
      userSessionId,
      leadId: idByCanonical.get("https://example.com/jobs/lead-1")!,
      firstShownAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      searchRunId,
      iterationNumber: 0,
    },
    {
      userSessionId,
      leadId: idByCanonical.get("https://example.com/jobs/lead-2")!,
      firstShownAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      searchRunId,
      iterationNumber: 1,
    },
  ]).onConflictDoNothing();

  await db.insert(leadEvents).values([
    {
      userSessionId,
      leadId: idByCanonical.get("https://example.com/jobs/lead-2")!,
      eventType: "click",
      searchRunId,
      metadataJson: { clickedAt: now.toISOString() },
      createdAt: now,
    },
  ]);

  // Embeddings intentionally not inserted in seed (scaffold only).
  // When you add embedding generation, insert into lead_embeddings for each lead.

  console.log("db:seed populated v2 job discovery schema (demo).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
