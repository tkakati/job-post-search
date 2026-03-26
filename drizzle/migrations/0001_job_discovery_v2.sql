-- Custom SQL migration file for Job Discovery Agent (v2 schema).
-- Creates run tracking, canonical leads, shown-history, analytics, and pgvector embeddings scaffold.

CREATE TABLE IF NOT EXISTS "users" (
	"id" text PRIMARY KEY NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL REFERENCES "users"("id"),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_sessions_user_id_idx" ON "user_sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_sessions_last_seen_at_idx" ON "user_sessions" USING btree ("last_seen_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "search_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_session_id" text NOT NULL REFERENCES "user_sessions"("id"),
	"role" text NOT NULL,
	"location" text NOT NULL,
	"role_location_key" text NOT NULL,
	"recency_preference" integer NOT NULL,
	"iteration_count" integer NOT NULL,
	"final_stop_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_runs_user_session_id_idx" ON "search_runs" USING btree ("user_session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_runs_role_location_key_idx" ON "search_runs" USING btree ("role_location_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "search_runs_created_at_idx" ON "search_runs" USING btree ("created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "planner_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"search_run_id" integer NOT NULL REFERENCES "search_runs"("id"),
	"iteration_number" integer NOT NULL,
	"planner_mode" text NOT NULL,
	"enable_retrieval" boolean NOT NULL DEFAULT false,
	"enable_new_lead_generation" boolean NOT NULL DEFAULT false,
	"num_explore_queries" integer NOT NULL DEFAULT 0,
	"retrieval_summary_json" jsonb,
	"rationale_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "planner_runs_unique_by_run_iteration" UNIQUE ("search_run_id","iteration_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"canonical_url" text NOT NULL,
	"source_type" text NOT NULL,
	"title_or_role" text NOT NULL,
	"company" text,
	"location" text,
	"author" text,
	"snippet" text,
	"full_text" text,
	"posted_at" timestamp,
	"fetched_at" timestamp,
	"quality_score" real,
	"relevance_score" real,
	"hiring_intent_score" real,
	"role_location_key" text NOT NULL,
	"raw_payload_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "leads_canonical_url_unique" UNIQUE ("canonical_url")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_role_location_key_idx" ON "leads" USING btree ("role_location_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_role_location_posted_idx" ON "leads" USING btree ("role_location_key","posted_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_role_location_fetched_idx" ON "leads" USING btree ("role_location_key","fetched_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_fetched_at_idx" ON "leads" USING btree ("fetched_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_source_type_idx" ON "leads" USING btree ("source_type");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL REFERENCES "leads"("id"),
	"source_provider" text NOT NULL,
	"source_query" text,
	"source_url" text NOT NULL,
	"source_input_url" text,
	"source_metadata_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_sources_unique_by_lead_source_url" UNIQUE ("lead_id","source_url")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_sources_lead_id_idx" ON "lead_sources" USING btree ("lead_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_embeddings" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL REFERENCES "leads"("id"),
	"embedding" vector(1536) NOT NULL,
	"embedding_model" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_embeddings_lead_id_unique" UNIQUE ("lead_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_embeddings_embedding_idx" ON "lead_embeddings" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shown_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_session_id" text NOT NULL REFERENCES "user_sessions"("id"),
	"lead_id" integer NOT NULL REFERENCES "leads"("id"),
	"first_shown_at" timestamp DEFAULT now() NOT NULL,
	"search_run_id" integer NOT NULL REFERENCES "search_runs"("id"),
	"iteration_number" integer NOT NULL,
	CONSTRAINT "shown_leads_unique_by_user_lead" UNIQUE ("user_session_id","lead_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shown_leads_user_session_id_idx" ON "shown_leads" USING btree ("user_session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shown_leads_search_run_id_idx" ON "shown_leads" USING btree ("search_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shown_leads_lead_id_idx" ON "shown_leads" USING btree ("lead_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "generated_queries" (
	"id" serial PRIMARY KEY NOT NULL,
	"search_run_id" integer NOT NULL REFERENCES "search_runs"("id"),
	"iteration_number" integer NOT NULL,
	"role_location_key" text NOT NULL,
	"query_text" text NOT NULL,
	"query_kind" text NOT NULL,
	"is_explore" boolean NOT NULL DEFAULT false,
	"source_url" text,
	"performance_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "generated_queries_unique" UNIQUE ("search_run_id","iteration_number","role_location_key","query_text","query_kind")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generated_queries_search_run_idx" ON "generated_queries" USING btree ("search_run_id");
--> statement-breakpoint
-- Extend existing query_performance table to match v2 schema.
ALTER TABLE "query_performance" ADD COLUMN IF NOT EXISTS "role_location_key" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "query_performance" ADD COLUMN IF NOT EXISTS "query_text" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "query_performance" ADD COLUMN IF NOT EXISTS "total_runs" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "query_performance" ADD COLUMN IF NOT EXISTS "total_results" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "query_performance" ADD COLUMN IF NOT EXISTS "total_usable_results" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "query_performance" ADD COLUMN IF NOT EXISTS "total_new_lead_contributions" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "query_performance" ADD COLUMN IF NOT EXISTS "avg_quality" real NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "query_performance" ADD COLUMN IF NOT EXISTS "updated_at" timestamp DEFAULT now() NOT NULL;
--> statement-breakpoint
-- The repo originally scaffolded `query_performance` with different NOT NULL columns.
-- Drop those legacy NOT NULL constraints so inserts using the v2 schema succeed.
ALTER TABLE "query_performance" ALTER COLUMN "role" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "query_performance" ALTER COLUMN "location" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "query_performance" ALTER COLUMN "iterations_used" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "query_performance" ALTER COLUMN "planner_mode" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "query_performance" ALTER COLUMN "retrieval_ms" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "query_performance" ALTER COLUMN "search_ms" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "query_performance" ALTER COLUMN "combine_ms" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "query_performance" ALTER COLUMN "total_ms" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "query_performance" ALTER COLUMN "cache_hit" DROP NOT NULL;
--> statement-breakpoint
-- Backfill role_location_key + make query_text unique per old row, so the new unique constraint won't fail.
-- Old schema used (role, location, planner_mode, ...). We preserve role+location mapping.
UPDATE "query_performance"
SET
	"role_location_key" = ("role" || '::' || "location"),
	"query_text" = ("planner_mode" || '::' || "id"::text),
	"total_runs" = "iterations_used",
	"total_results" = 0,
	"total_usable_results" = 0,
	"total_new_lead_contributions" = 0,
	"avg_quality" = 0,
	"updated_at" = now()
WHERE "role_location_key" = '' AND "query_text" = '';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "query_performance_unique_role_query" ON "query_performance" USING btree ("role_location_key","query_text");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "query_performance_role_location_key_idx" ON "query_performance" USING btree ("role_location_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "lead_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_session_id" text NOT NULL REFERENCES "user_sessions"("id"),
	"lead_id" integer NOT NULL REFERENCES "leads"("id"),
	"event_type" text NOT NULL,
	"search_run_id" integer REFERENCES "search_runs"("id"),
	"metadata_json" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_events_user_session_event_created_idx" ON "lead_events" USING btree ("user_session_id","event_type","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_events_lead_id_idx" ON "lead_events" USING btree ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_events_search_run_id_idx" ON "lead_events" USING btree ("search_run_id");
