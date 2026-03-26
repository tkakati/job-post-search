import { redis } from "@/lib/redis/client";

export async function getCachedJson<T>(key: string): Promise<T | null> {
  if (!redis) return null;
  const value = await redis.get<string>(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function setCachedJson(input: {
  key: string;
  value: unknown;
  ttlSeconds: number;
}): Promise<void> {
  const { key, value, ttlSeconds } = input;
  if (!redis) return;
  await redis.set(key, JSON.stringify(value), { ex: ttlSeconds });
}

