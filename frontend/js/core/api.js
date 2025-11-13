const overrideKey = 'apiBaseOverride';
const defaultBase = (document.documentElement.getAttribute('data-api-base') || window.location.origin).replace(/\/$/, '');
let apiBase = (localStorage.getItem(overrideKey) || defaultBase).replace(/\/$/, '');

const cache = new Map(); // key -> { exp:number, value:any }
const DEFAULT_TTL_MS = 30_000;
const listeners = new Set();

function setBase(newBase) {
  if (!newBase) return apiBase;
  const normalized = String(newBase).replace(/\/$/, '');
  apiBase = normalized || defaultBase;
  localStorage.setItem(overrideKey, apiBase);
  for (const cb of listeners) {
    try { cb(apiBase); } catch (_) { /* ignore */ }
  }
  cache.clear();
  return apiBase;
}

export function getApiBase() {
  return apiBase;
}

export function setApiBase(newBase) {
  return setBase(newBase);
}

export function clearApiBase() {
  localStorage.removeItem(overrideKey);
  apiBase = defaultBase;
  for (const cb of listeners) {
    try { cb(apiBase); } catch (_) { /* ignore */ }
  }
  cache.clear();
  return apiBase;
}

export function onApiBaseChange(cb) {
  if (typeof cb !== 'function') return () => {};
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function buildApiUrl(path) {
  if (!path) return apiBase;
  return apiBase + (path.startsWith('/') ? path : `/${path}`);
}

export function resetFetchCache() {
  cache.clear();
}

export async function fetchJson(path, init = {}) {
  const url = buildApiUrl(path);
  const method = (init.method || 'GET').toUpperCase();
  const isGet = method === 'GET';
  const noCache = Boolean(init.noCache);
  const cacheKey = isGet ? url : null;
  if (isGet && !noCache) {
    const cached = cache.get(cacheKey);
    if (cached && cached.exp > Date.now()) return cached.value;
  }
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }
  const contentType = response.headers.get('content-type') || '';
  const body = await response.text();
  if (!contentType.includes('application/json')) {
    if (/^\s*</.test(body)) {
      throw new Error(`Received HTML instead of JSON from ${url} (is the frontend pointing at the Worker API?)`);
    }
    throw new Error(`Unexpected content-type (${contentType}) from ${url}`);
  }
  try {
    const parsed = JSON.parse(body);
    if (isGet && !noCache) {
      cache.set(cacheKey, { exp: Date.now() + DEFAULT_TTL_MS, value: parsed });
    }
    return parsed;
  } catch (err) {
    if (err instanceof SyntaxError) {
      throw new Error(`Invalid JSON from ${url} – first chars: ${body.slice(0, 60)}`);
    }
    throw err;
  }
}
