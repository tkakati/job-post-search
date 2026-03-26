CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "job_leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"location" text NOT NULL,
	"title" text NOT NULL,
	"company" text,
	"url" text NOT NULL,
	"description" text,
	"embedding" vector(1536),
	"source" text NOT NULL,
	"source_metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_shows" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"lead_id" integer NOT NULL,
	"shown_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "query_performance" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"location" text NOT NULL,
	"iterations_used" integer NOT NULL,
	"planner_mode" text NOT NULL,
	"retrieval_ms" integer NOT NULL,
	"search_ms" integer NOT NULL,
	"combine_ms" integer NOT NULL,
	"total_ms" integer NOT NULL,
	"cache_hit" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lead_shows" ADD CONSTRAINT "lead_shows_lead_id_job_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."job_leads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_leads_role_location_created_idx" ON "job_leads" USING btree ("role","location","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "job_leads_url_unique" ON "job_leads" USING btree ("url");--> statement-breakpoint
CREATE INDEX "job_leads_embedding_idx" ON "job_leads" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "lead_shows_user_lead_unique" ON "lead_shows" USING btree ("user_id","lead_id");