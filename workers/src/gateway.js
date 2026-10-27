import { historyResponse } from "./history.js";
import { json } from "./http.js";

export function worldStub(env) {
  if (!env.HISCORES_WORLD) return null;
  return env.HISCORES_WORLD.get(env.HISCORES_WORLD.idFromName("main-world"));
}
export async function forwardApiRequest(request, env, ctx) {
  if (new URL(request.url).pathname === "/api/progress" && request.method === "GET") {
    const historyCache = ctx?.waitUntil && globalThis.caches?.default;
    const hit = historyCache && await historyCache.match(request);
    if (hit) return hit;
    const response = await historyResponse(request, env);
    if (historyCache && response.ok && response.headers.has("cache-control"))
      ctx.waitUntil(historyCache.put(request, response.clone()));
    return response;
  }
  const stub = worldStub(env);
  if (!stub) return json({ error: "HISCORES_WORLD Durable Object binding is missing." }, 503);
  const edge = ctx?.waitUntil && globalThis.caches?.default;
  const cacheable = request.method === "GET" &&
    /^\/api\/(world|leaderboard|skill-rankings|activity-rankings|users(?:\/.*)?|achievements\/.*|banners\/rare)$/.test(new URL(request.url).pathname);
  if (edge && cacheable) {
    const hit = await edge.match(request);
    if (hit) return hit;
  }
  // Materialize POST bodies before crossing the object boundary. Routes such as
  // cron may reply without consuming a body; forwarding its live stream can
  // otherwise outlive the outer request and break the next keep-alive request.
  const forwarded = request.method === "POST"
    ? new Request(request, { body: await request.arrayBuffer() })
    : request;
  const response = await stub.fetch(forwarded);
  if (edge && cacheable && response.ok) ctx.waitUntil(edge.put(request, response.clone()));
  return response;
}
