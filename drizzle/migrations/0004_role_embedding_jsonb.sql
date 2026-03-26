ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "role_embedding_jsonb" jsonb;
--> statement-breakpoint

UPDATE "leads"
SET "role_embedding_jsonb" = CASE
  WHEN "role_embedding" IS NULL THEN NULL
  ELSE to_jsonb(ARRAY(
    SELECT trim(x)::double precision
    FROM unnest(regexp_split_to_array(trim(both '[]' from "role_embedding"::text), ',')) AS x
    WHERE trim(x) <> ''
  ))
END
WHERE "role_embedding_jsonb" IS NULL;
--> statement-breakpoint

ALTER TABLE "leads" DROP COLUMN IF EXISTS "role_embedding";
--> statement-breakpoint

ALTER TABLE "leads" RENAME COLUMN "role_embedding_jsonb" TO "role_embedding";
