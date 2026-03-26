import type { Config } from "drizzle-kit";
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

export default {
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
} satisfies Config;

