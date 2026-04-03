CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_id" text NOT NULL,
  "event_name" text NOT NULL,
  "event_version" text DEFAULT 'v1' NOT NULL,
  "source" text NOT NULL,
  "occurred_at" timestamp DEFAULT now() NOT NULL,
  "user_id" text NOT NULL,
  "user_session_id" text NOT NULL,
  "is_authenticated" boolean DEFAULT false NOT NULL,
  "search_id" text,
  "search_run_id" integer,
  "iteration_number" integer,
  "query_id" text,
  "lead_id" integer,
  "properties_json" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "analytics_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_session_id_user_sessions_id_fk" FOREIGN KEY ("user_session_id") REFERENCES "public"."user_sessions"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_search_run_id_search_runs_id_fk" FOREIGN KEY ("search_run_id") REFERENCES "public"."search_runs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "analytics_events_occurred_at_idx" ON "analytics_events" ("occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_event_name_occurred_idx" ON "analytics_events" ("event_name","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_user_session_idx" ON "analytics_events" ("user_session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_search_run_idx" ON "analytics_events" ("search_run_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_lead_idx" ON "analytics_events" ("lead_id");
