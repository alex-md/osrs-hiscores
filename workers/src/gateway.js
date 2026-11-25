import { json } from "./http.js";

export function worldStub(env) {
  if (!env.HISCORES_WORLD) return null;
  return env.HISCORES_WORLD.get(env.HISCORES_WORLD.idFromName("main-world"));
}
export async function forwardApiRequest(request, env, ctx) {
  // History metric indices must use the world's published D1 encounter catalog.
  // Keep the edge gateway independent of engine/data modules for Pages builds.
  const stub = worldStub(env);
  if (!stub) return json({ error: "HISCORES_WORLD Durable Object binding is missing." }, 503);
  const edge = ctx?.waitUntil && globalThis.caches?.default;
  const cacheable = request.method === "GET" &&
    /^\/api\/(world|world-watch|finance|discoveries|festival|collections|game-catalog|stories|progress|leaderboard|skill-rankings|activity-rankings|users(?:\/.*)?|achievements\/.*|banners\/rare)$/.test(new URL(request.url).pathname);
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
  if (new URL(request.url).pathname === "/api/health" && request.method === "GET" && response.ok) {
    const world = await response.json();
    // The DO may retain its constructor environment across asset-only releases.
    // Report the serving gateway's release while preserving the world's own
    // revision and all of its health/storage checks separately.
    return json({ ...world, worldRevision: world.revision, revision: env.RELEASE_SHA || "local" });
  }
  if (edge && cacheable && response.ok) ctx.waitUntil(edge.put(request, response.clone()));
  return response;
}
