const memCache = new Map();

export function memGet(key) {
  const entry = memCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    memCache.delete(key);
    return undefined;
  }
  return entry.value;
}

export function memSet(key, value, ttlSeconds = 0) {
  const expiresAt = ttlSeconds > 0 ? (Date.now() + ttlSeconds * 1000) : 0;
  memCache.set(key, { value, expiresAt });
}

export function memDelete(key) {
  memCache.delete(key);
}

export function clearMemCache() {
  memCache.clear();
}

export async function kvGetCached(env, key, { ttlSeconds = 10 } = {}) {
  const memKey = `kv:text:${key}`;
  const cached = memGet(memKey);
  if (typeof cached === 'string') return cached;
  const raw = await env.HISCORES_KV.get(key);
  if (typeof raw === 'string') memSet(memKey, raw, ttlSeconds);
  return raw || null;
}
