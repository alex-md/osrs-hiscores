// Unified Pages Functions + Static Assets adapter
// This file allows Cloudflare Pages to serve the frontend and handle /api/* using
// the existing Worker implementation in workers/src/index.js, enabling same-origin
// API calls (no data-api-base override needed).
//
// Requirements:
// - In Cloudflare Pages project settings, bind the KV namespace as HISCORES_KV.
// - (Optional) Add ADMIN_TOKEN as an environment variable / secret.
// - Cron triggers: Currently rely on traditional Workers; Pages may not run your existing
//   scheduled() handler unless Pages Scheduled Functions are enabled (beta). If scheduling
//   is essential, keep the standalone Worker deployment for cron and have it write to the
//   same KV namespace.

import workerModule from './workers/src/index.js';

// Reuse the fetch & scheduled handlers from the worker module
const apiFetch = workerModule.fetch ? workerModule.fetch.bind(workerModule) : null;
const apiScheduled = workerModule.scheduled ? workerModule.scheduled.bind(workerModule) : null;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    // Route API calls to existing worker logic
    if (url.pathname.startsWith('/api/')) {
      if (!apiFetch) return new Response('API handler unavailable', { status: 500 });
      return apiFetch(request, env, ctx);
    }
    // Otherwise serve static assets (Pages automatically exposes them via env.ASSETS)
    return env.ASSETS.fetch(request);
  },
  async scheduled(event, env, ctx) {
    if (apiScheduled) return apiScheduled(event, env, ctx);
  }
};
