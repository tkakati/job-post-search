import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";

// We use `pg` so this works with both Neon Postgres and local Postgres.
// Create the pool lazily so `next dev` and `next lint` don't crash
// when env vars aren't set yet.
let _db: ReturnType<typeof drizzle> | null = null;

export function dbClient() {
  if (_db) return _db;

  if (!env.DATABASE_URL) {
    throw new Error(
      "Missing DATABASE_URL. Set DATABASE_URL in `.env.local` (Neon recommended).",
    );
  }

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    // Neon + Vercel can benefit from smaller pools; adjust later if needed.
    max: 10,
  });

  _db = drizzle(pool);
  return _db;
}

