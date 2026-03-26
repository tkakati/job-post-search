export interface CacheProvider {
  getJson<T>(key: string): Promise<T | null>;
  setJson<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  acquireLock(key: string, value: string, ttlSeconds: number): Promise<boolean>;
}

