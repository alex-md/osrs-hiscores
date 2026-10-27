export const DEFAULT_WORKER_URL = "https://osrs-hiscores-clone.vs.workers.dev";

export function workerBaseURL(value = process.env.WORKER_BASE_URL || DEFAULT_WORKER_URL) {
  const base = new URL(value);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash || !["", "/", "/api", "/api/"].includes(base.pathname))
    throw new Error("WORKER_BASE_URL must be an HTTP(S) origin, optionally ending in /api, without credentials, query or fragment.");
  return base.origin;
}
