const cache = new Map<string, { data: any; createdAt: number }>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  return entry ? entry.data : null;
}

export function setCache(key: string, data: any): void {
  cache.set(key, { data, createdAt: Date.now() });
}

export function invalidateCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}
