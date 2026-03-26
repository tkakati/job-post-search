ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "identity_key" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "normalized_location_json" jsonb;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "employment_type" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "work_mode" text;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "source_metadata_json" jsonb;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "role_embedding" vector(1536);
--> statement-breakpoint

-- Backfill metadata into the new canonical metadata column.
UPDATE "leads"
SET "source_metadata_json" = "raw_payload_json"
WHERE "source_metadata_json" IS NULL AND "raw_payload_json" IS NOT NULL;
--> statement-breakpoint

-- Backfill identity_key for existing rows using stable, deterministic text normalization.
UPDATE "leads"
SET "identity_key" = md5(
  lower(coalesce("canonical_url", '')) || '|' ||
  lower(regexp_replace(trim(coalesce("title_or_role", '')), '\\s+', ' ', 'g')) || '|' ||
  lower(regexp_replace(trim(coalesce("company", '')), '\\s+', ' ', 'g')) || '|' ||
  lower(regexp_replace(trim(coalesce("location", '')), '\\s+', ' ', 'g'))
)
WHERE "identity_key" IS NULL OR trim("identity_key") = '';
--> statement-breakpoint

-- Enforce new identity key invariant after backfill.
ALTER TABLE "leads" ALTER COLUMN "identity_key" SET NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "leads_identity_key_idx" ON "leads" USING btree ("identity_key");
--> statement-breakpoint

-- Remove user-dependent persisted scores.
ALTER TABLE "leads" DROP COLUMN IF EXISTS "quality_score";
--> statement-breakpoint
ALTER TABLE "leads" DROP COLUMN IF EXISTS "relevance_score";
--> statement-breakpoint

-- Remove legacy metadata column after copy.
ALTER TABLE "leads" DROP COLUMN IF EXISTS "raw_payload_json";
