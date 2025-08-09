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

// Import the worker module - note the file extension is important
import workerModule from './workers/src/index.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Route API calls to existing worker logic
    if (url.pathname.startsWith('/api/')) {
      // Check if the worker module has a fetch handler
      if (workerModule && typeof workerModule.fetch === 'function') {
        return await workerModule.fetch(request, env, ctx);
      } else if (workerModule && typeof workerModule.default?.fetch === 'function') {
        return await workerModule.default.fetch(request, env, ctx);
      } else {
        return new Response(JSON.stringify({
          error: 'API handler unavailable',
          debug: `Module type: ${typeof workerModule}, keys: ${Object.keys(workerModule || {})}`
        }), {
          status: 500,
          headers: { 'content-type': 'application/json' }
        });
      }
    }

    // Otherwise serve static assets (Pages automatically exposes them via env.ASSETS)
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    // Handle scheduled events (cron jobs)
    if (workerModule && typeof workerModule.scheduled === 'function') {
      return await workerModule.scheduled(event, env, ctx);
    } else if (workerModule && typeof workerModule.default?.scheduled === 'function') {
      return await workerModule.default.scheduled(event, env, ctx);
    }
  }
};
