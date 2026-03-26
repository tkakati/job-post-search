import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";

export const redis =
  env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

/**
 * Small helper for coordination in Redis (e.g. preventing duplicate search runs).
 * Falls back to "no lock" if Redis is not configured.
 */
export async function acquireRedisLock(
  key: string,
  value: string,
  ttlSeconds: number,
) {
  if (!redis) return { acquired: true };

  // Upstash's REST API supports `nx: true` for "SET if not exists".
  const result = await redis.set(key, value, { ex: ttlSeconds, nx: true });
  return { acquired: Boolean(result) };
}

