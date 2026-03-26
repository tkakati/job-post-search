import {
  boolean,
  index,
  jsonb,
  real,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

const EMBEDDING_DIMENSIONS = 1536;

export const jobLeads = pgTable(
  "job_leads",
  {
    id: serial("id").primaryKey(),

    // Role/location pair used for retrieval + caching.
    role: text("role").notNull(),
    location: text("location").notNull(),

    title: text("title").notNull(),
    company: text("company"),
    url: text("url").notNull(),
    description: text("description"),

    // Required for pgvector; nullable for MVP while providers are wired up.
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),

    source: text("source").notNull(),
    sourceMetadata: jsonb("source_metadata").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("job_leads_role_location_created_idx").on(
      table.role,
      table.location,
      table.createdAt,
    ),
    uniqueIndex("job_leads_url_unique").on(table.url),
    index("job_leads_embedding_idx")
      .using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);

export const leadShows = pgTable(
  "lead_shows",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    leadId: integer("lead_id")
      .notNull()
      .references(() => jobLeads.id),
    shownAt: timestamp("shown_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("lead_shows_user_lead_unique").on(table.userId, table.leadId),
  ],
);

export const queryPerformance = pgTable(
  "query_performance",
  {
    id: serial("id").primaryKey(),
    roleLocationKey: text("role_location_key").notNull(),
    queryText: text("query_text").notNull().default(""),

    totalRuns: integer("total_runs").notNull().default(0),
    totalResults: integer("total_results").notNull().default(0),
    totalUsableResults: integer("total_usable_results").notNull().default(0),
    totalNewLeadContributions: integer("total_new_lead_contributions")
      .notNull()
      .default(0),
    avgQuality: real("avg_quality").notNull().default(0),

    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("query_performance_unique_role_query").on(
      table.roleLocationKey,
      table.queryText,
    ),
    index("query_performance_role_location_key_idx").on(table.roleLocationKey),
  ],
);

/**
 * === Job Discovery Agent (v2) Schema ===
 *
 * The agent workflow needs persistent identity, run tracking, lead canonicalization,
 * shown-history per user/session, and query performance analytics.
 *
 * pgvector support is scaffolded via `lead_embeddings`.
 */

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
});

export const userSessions = pgTable(
  "user_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (table) => [
    index("user_sessions_user_id_idx").on(table.userId),
    index("user_sessions_last_seen_at_idx").on(table.lastSeenAt),
  ],
);

export const searchRuns = pgTable(
  "search_runs",
  {
    id: serial("id").primaryKey(),
    userSessionId: text("user_session_id")
      .notNull()
      .references(() => userSessions.id),
    role: text("role").notNull(),
    location: text("location").notNull(),
    // Deterministic role+location key; should match app normalization.
    roleLocationKey: text("role_location_key").notNull(),

    recencyPreference: integer("recency_preference").notNull(),
    iterationCount: integer("iteration_count").notNull(),
    finalStopReason: text("final_stop_reason"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("search_runs_user_session_id_idx").on(table.userSessionId),
    index("search_runs_role_location_key_idx").on(table.roleLocationKey),
    index("search_runs_created_at_idx").on(table.createdAt),
  ],
);

export const plannerRuns = pgTable(
  "planner_runs",
  {
    id: serial("id").primaryKey(),
    searchRunId: integer("search_run_id")
      .notNull()
      .references(() => searchRuns.id),
    iterationNumber: integer("iteration_number").notNull(),
    plannerMode: text("planner_mode").notNull(),

    enableRetrieval: boolean("enable_retrieval").notNull().default(false),
    enableNewLeadGeneration: boolean("enable_new_lead_generation")
      .notNull()
      .default(false),

    numExploreQueries: integer("num_explore_queries").notNull().default(0),
    retrievalSummaryJson: jsonb("retrieval_summary_json").$type<
      Record<string, unknown>
    >(),
    rationaleJson: jsonb("rationale_json").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("planner_runs_unique_by_run_iteration").on(
      table.searchRunId,
      table.iterationNumber,
    ),
  ],
);

export const leads = pgTable(
  "leads",
  {
    id: serial("id").primaryKey(),

    canonicalUrl: text("canonical_url").notNull(),
    identityKey: text("identity_key").notNull(),
    sourceType: text("source_type").notNull(),

    titleOrRole: text("title_or_role").notNull(),
    company: text("company"),
    location: text("location"),
    normalizedLocationJson: jsonb("normalized_location_json").$type<
      Record<string, unknown> | string
    >(),
    employmentType: text("employment_type"),
    workMode: text("work_mode"),
    author: text("author"),

    snippet: text("snippet"),
    fullText: text("full_text"),

    postedAt: timestamp("posted_at"),
    fetchedAt: timestamp("fetched_at"),
    roleEmbedding: jsonb("role_embedding").$type<number[]>(),

    hiringIntentScore: real("hiring_intent_score"),
    leadScore: real("lead_score"),

    roleLocationKey: text("role_location_key").notNull(),
    sourceMetadataJson: jsonb("source_metadata_json").$type<
      Record<string, unknown>
    >(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("leads_canonical_url_unique").on(table.canonicalUrl),
    index("leads_identity_key_idx").on(table.identityKey),
    index("leads_role_location_key_idx").on(table.roleLocationKey),
    index("leads_role_location_posted_idx").on(
      table.roleLocationKey,
      table.postedAt,
    ),
    index("leads_role_location_fetched_idx").on(
      table.roleLocationKey,
      table.fetchedAt,
    ),
    index("leads_fetched_at_idx").on(table.fetchedAt),
    index("leads_source_type_idx").on(table.sourceType),
  ],
);

export const leadSources = pgTable(
  "lead_sources",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leads.id),

    sourceProvider: text("source_provider").notNull(),
    sourceQuery: text("source_query"),

    sourceUrl: text("source_url").notNull(),
    sourceInputUrl: text("source_input_url"),
    sourceMetadataJson: jsonb("source_metadata_json").$type<
      Record<string, unknown>
    >(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("lead_sources_unique_by_lead_source_url").on(
      table.leadId,
      table.sourceUrl,
    ),
    index("lead_sources_lead_id_idx").on(table.leadId),
  ],
);

export const leadEmbeddings = pgTable(
  "lead_embeddings",
  {
    id: serial("id").primaryKey(),
    leadId: integer("lead_id")
      .notNull()
      .unique()
      .references(() => leads.id),

    // Optional scaffold for future semantic retrieval.
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }),
    embeddingModel: text("embedding_model"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("lead_embeddings_embedding_idx")
      .using("hnsw", table.embedding.op("vector_cosine_ops")),
  ],
);

export const shownLeads = pgTable(
  "shown_leads",
  {
    id: serial("id").primaryKey(),
    userSessionId: text("user_session_id")
      .notNull()
      .references(() => userSessions.id),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leads.id),

    firstShownAt: timestamp("first_shown_at").defaultNow().notNull(),
    searchRunId: integer("search_run_id")
      .notNull()
      .references(() => searchRuns.id),
    iterationNumber: integer("iteration_number").notNull(),
  },
  (table) => [
    uniqueIndex("shown_leads_unique_by_user_lead").on(
      table.userSessionId,
      table.leadId,
    ),
    index("shown_leads_user_session_id_idx").on(table.userSessionId),
    index("shown_leads_search_run_id_idx").on(table.searchRunId),
    index("shown_leads_lead_id_idx").on(table.leadId),
  ],
);

export const generatedQueries = pgTable(
  "generated_queries",
  {
    id: serial("id").primaryKey(),
    searchRunId: integer("search_run_id")
      .notNull()
      .references(() => searchRuns.id),
    iterationNumber: integer("iteration_number").notNull(),
    roleLocationKey: text("role_location_key").notNull(),

    queryText: text("query_text").notNull(),
    queryKind: text("query_kind").notNull(),
    isExplore: boolean("is_explore").notNull().default(false),
    sourceUrl: text("source_url"),

    performanceJson: jsonb("performance_json").$type<
      Record<string, unknown>
    >(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("generated_queries_unique").on(
      table.searchRunId,
      table.iterationNumber,
      table.roleLocationKey,
      table.queryText,
      table.queryKind,
    ),
    index("generated_queries_search_run_idx").on(table.searchRunId),
  ],
);

export const leadEvents = pgTable(
  "lead_events",
  {
    id: serial("id").primaryKey(),
    userSessionId: text("user_session_id")
      .notNull()
      .references(() => userSessions.id),
    leadId: integer("lead_id")
      .notNull()
      .references(() => leads.id),

    eventType: text("event_type").notNull(),
    searchRunId: integer("search_run_id").references(() => searchRuns.id),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("lead_events_user_session_event_created_idx").on(
      table.userSessionId,
      table.eventType,
      table.createdAt,
    ),
    index("lead_events_lead_id_idx").on(table.leadId),
    index("lead_events_search_run_id_idx").on(table.searchRunId),
  ],
);
