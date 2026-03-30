import { z } from "zod";
import { loadEnvConfig } from "@next/env";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

loadEnvConfig(process.cwd());

const localEnvPath = path.join(process.cwd(), ".env.local");
if (existsSync(localEnvPath)) {
  const lines = readFileSync(localEnvPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trim().startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    const raw = m[2] ?? "";
    const value = raw.replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}

const emptyToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
};

const OptionalUrlSchema = z.preprocess(
  emptyToUndefined,
  z.string().url().optional(),
);

const OptionalNonEmptyStringSchema = z.preprocess(
  emptyToUndefined,
  z.string().min(1).optional(),
);

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: OptionalNonEmptyStringSchema,

  // Upstash Redis (optional for local/dev; strongly recommended for caching + coordination).
  UPSTASH_REDIS_REST_URL: OptionalUrlSchema,
  UPSTASH_REDIS_REST_TOKEN: OptionalNonEmptyStringSchema,

  // LLM (optional for query generation; planner is deterministic so the app still works without it).
  OPENAI_API_KEY: OptionalNonEmptyStringSchema,
  OPENAI_CHAT_MODEL: OptionalNonEmptyStringSchema,
  OPENAI_EMBEDDING_MODEL: OptionalNonEmptyStringSchema,

  // Search provider configuration (Apify should be used only in search node provider path).
  SEARCH_PROVIDER: z
    .enum(["linkedin-content-mvp", "apify-linkedin-content"])
    .default("linkedin-content-mvp"),
  APIFY_API_TOKEN: OptionalNonEmptyStringSchema,
  APIFY_ACTOR_ID: OptionalNonEmptyStringSchema,
  APIFY_AGENT_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Vector settings (must match the embedding model dimension you use later).
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1536),

  // Tuning for bounded iteration loop.
  JOB_DISCOVERY_TARGET_NEW_LEADS: z.coerce.number().int().positive().default(20),
  JOB_DISCOVERY_MAX_ITERATIONS: z.coerce.number().int().positive().default(2),

  NEXT_PUBLIC_APP_URL: OptionalUrlSchema,
  PLAYWRIGHT_BASE_URL: OptionalUrlSchema,
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  const flat = parsed.error.flatten().fieldErrors;
  // Keep build flow unblocked, but surface explicit validation problems.
  console.warn("Invalid environment variables:", flat);
}

export const env: z.infer<typeof EnvSchema> = parsed.success
  ? parsed.data
  : {
      NODE_ENV: "development",
      DATABASE_URL: undefined,
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
      OPENAI_API_KEY: undefined,
      OPENAI_CHAT_MODEL: undefined,
      OPENAI_EMBEDDING_MODEL: undefined,
      SEARCH_PROVIDER: "linkedin-content-mvp",
      APIFY_API_TOKEN: undefined,
      APIFY_ACTOR_ID: undefined,
      APIFY_AGENT_ENABLED: false,
      EMBEDDING_DIMENSIONS: 1536,
      JOB_DISCOVERY_TARGET_NEW_LEADS: 20,
      JOB_DISCOVERY_MAX_ITERATIONS: 2,
      NEXT_PUBLIC_APP_URL: undefined,
      PLAYWRIGHT_BASE_URL: undefined,
    };

export type Env = z.infer<typeof EnvSchema>;
