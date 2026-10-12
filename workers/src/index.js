import { SKILLS } from "./constants.js";
import { combatLevel } from "../../frontend/lib/domain.js";
import { allUsers, getUser, putUser, readJSON } from "./store.js";
import {
  getSnapshot,
  publishSnapshot,
  rankingRows,
  snapshotUser,
  snapshotUsers,
  allSkillRankings,
} from "./snapshots.js";
import { newUser, generateUsername, runScheduled } from "./simulation.js";
import { projectHighestAchievementFamilies } from "./achievements.js";
import { catalog } from "../../frontend/lib/catalog.js";
import {
  json,
  HttpError,
  integer,
  bodyJSON,
  requireAdmin,
  paginate,
} from "./http.js";

// An isolate-local queue prevents overlapping jobs in this runtime. KV is eventually
// consistent and is not a distributed mutex; strict concurrent writes need a Durable Object.
const jobs = new WeakMap();
async function mutate(env, operation) {
  if (jobs.has(env.HISCORES_KV))
    throw new HttpError(409, "Another update is in progress. Retry shortly.");
  const job = Promise.resolve().then(operation);
  jobs.set(env.HISCORES_KV, job);
  try {
    return await job;
  } finally {
    jobs.delete(env.HISCORES_KV);
  }
}
const cached = (data) =>
  json(data, 200, { "cache-control": "public, max-age=30" });
const snapshotInfo = (s) => ({
  generatedAt: s.generatedAt,
  totalPlayers: s.totalPlayers,
  generation: s.generation,
  training: s.training,
});
function playerName(value) {
  let name;
  try {
    name = decodeURIComponent(value);
  } catch {
    throw new HttpError(400, "Invalid player name encoding.");
  }
  if (!/^[a-zA-Z0-9_ -]{1,12}$/.test(name) || !name.trim())
    throw new HttpError(
      400,
      "Player names must contain 1–12 letters, numbers, spaces, underscores or hyphens.",
    );
  return name.trim();
}
async function route(request, env) {
  const url = new URL(request.url),
    path = url.pathname.replace(/\/$/, ""),
    method = request.method;
  if (method === "OPTIONS")
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "Content-Type, X-Admin-Token",
        "access-control-max-age": "86400",
      },
    });
  if (path === "/api/health" && method === "GET")
    return json(
      {
        status: env.HISCORES_KV ? "ok" : "unconfigured",
        hasKV: Boolean(env.HISCORES_KV),
        time: Date.now(),
      },
      env.HISCORES_KV ? 200 : 503,
    );
  if (!env.HISCORES_KV)
    throw new HttpError(503, "HISCORES_KV is not bound to this deployment.");
  if (method === "POST") {
    requireAdmin(request, env);
    return mutate(env, async () => {
      if (path === "/api/cron/trigger")
        return json({ triggered: true, ...(await runScheduled(env)) });
      if (path === "/api/admin/rebuild")
        return json(snapshotInfo(await publishSnapshot(env)));
      if (path === "/api/seed") {
        const body = await bodyJSON(request);
        if (
          !Array.isArray(body.usernames) ||
          !body.usernames.length ||
          body.usernames.length > 200
        )
          throw new HttpError(400, "Provide 1–200 usernames.");
        const names = [
          ...new Map(
            body.usernames.map((n) => {
              if (typeof n !== "string")
                throw new HttpError(400, "Usernames must be strings.");
              const name = playerName(encodeURIComponent(n));
              return [name.toLowerCase(), name];
            }),
          ).values(),
        ];
        const created = [],
          skipped = [];
        for (const name of names) {
          if (await getUser(env, name)) skipped.push(name);
          else {
            await putUser(env, newUser(name));
            created.push(name);
          }
        }
        await publishSnapshot(env);
        return json({ created, skipped });
      }
      if (path === "/api/admin/users/delete-batch") {
        const body = await bodyJSON(request);
        const users = await allUsers(env);
        if (body.dryRun !== undefined && typeof body.dryRun !== "boolean")
          throw new HttpError(400, "dryRun must be a boolean.");
        let selected;
        if (body.usernames !== undefined) {
          if (!Array.isArray(body.usernames) || body.usernames.length > 200)
            throw new HttpError(400, "Provide at most 200 usernames.");
          const names = new Set(
            body.usernames.map((n) =>
              playerName(encodeURIComponent(n)).toLowerCase(),
            ),
          );
          selected = users.filter((u) => names.has(u.username.toLowerCase()));
        } else {
          const limit = integer(body.limit, 10, 1, 200, "limit");
          const pool = [...users];
          selected = [];
          while (pool.length && selected.length < limit)
            selected.push(
              pool.splice(Math.floor(Math.random() * pool.length), 1)[0],
            );
        }
        const dryRun = body.dryRun !== false;
        if (!dryRun) {
          for (const user of selected)
            await env.HISCORES_KV.delete(`user:${user.username.toLowerCase()}`);
          const removed = new Set(selected.map((u) => u.username));
          await publishSnapshot(
            env,
            users.filter((u) => !removed.has(u.username)),
          );
        }
        return json({
          dryRun,
          count: selected.length,
          usernames: selected.map((u) => u.username),
        });
      }
      throw new HttpError(404, "Unknown API route.");
    });
  }
  if (method !== "GET")
    throw new HttpError(
      405,
      "Use GET for reads or POST for administrative updates.",
    );
  if (path === "/api/debug")
    return json({
      hasKV: true,
      adminConfigured: Boolean(env.ADMIN_TOKEN),
      assetsConfigured: Boolean(env.ASSETS),
      lastRun: await readJSON(env, "system:last-run"),
    });
  if (path === "/api/generate/users/dry-run") {
    const count = integer(url.searchParams.get("count"), 5, 1, 50, "count");
    const existing = new Set(
        (await allUsers(env)).map((u) => u.username.toLowerCase()),
      ),
      usernames = [];
    for (let i = 0; i < count; i++) {
      const name = generateUsername(existing);
      existing.add(name.toLowerCase());
      usernames.push(name);
    }
    return json({ dryRun: true, generated: usernames.length, usernames });
  }
  if (path === "/api/users/batch") {
    const names =
      url.searchParams.get("usernames")?.split(",").filter(Boolean) || [];
    if (names.length > 200)
      throw new HttpError(400, "Request at most 200 players.");
    const unique = [
      ...new Set(
        names.map((n) => playerName(encodeURIComponent(n)).toLowerCase()),
      ),
    ];
    const snapshot = await getSnapshot(env);
    const users =
      snapshot.version >= 2
        ? await snapshotUsers(env, snapshot, unique)
        : (await Promise.all(unique.map((n) => getUser(env, n)))).filter(
            Boolean,
          );
    return cached({
      ...snapshotInfo(snapshot),
      requested: unique.length,
      returned: users.length,
      users,
    });
  }
  const userMatch = path.match(/^\/api\/users\/([^/]+)(\/achievements)?$/);
  if (userMatch) {
    const snapshot = await getSnapshot(env);
    const user =
      snapshot.version >= 2
        ? await snapshotUser(env, snapshot, playerName(userMatch[1]))
        : await getUser(env, playerName(userMatch[1]));
    if (!user)
      throw new HttpError(
        404,
        "Player not found. Check the name and try again.",
      );
    if (userMatch[2])
      return cached({
        username: user.username,
        achievements: projectHighestAchievementFamilies(user.achievements),
        history: user.achievements,
      });
    if (snapshot.version >= 2)
      return cached({ ...user, ...snapshotInfo(snapshot) });
    const overall = await rankingRows(env, snapshot, "overall");
    const ranks = {};
    for (const skill of SKILLS) {
      const rows = await rankingRows(env, snapshot, skill);
      ranks[skill] =
        rows.find(
          (u) => u.username.toLowerCase() === user.username.toLowerCase(),
        )?.rank || null;
    }
    const entry = overall.find(
      (u) => u.username.toLowerCase() === user.username.toLowerCase(),
    );
    return cached({
      ...user,
      rank: entry?.rank || null,
      tier: entry?.tier || "Novice",
      combatLevel: combatLevel(user.skills),
      ranks,
      ...snapshotInfo(snapshot),
    });
  }
  const known = [
    "/api/leaderboard",
    "/api/skill-rankings",
    "/api/users",
    "/api/achievements/stats",
    "/api/achievements/firsts",
    "/api/achievements/catalog",
    "/api/banners/rare",
    "/api/world",
  ];
  if (!known.includes(path)) throw new HttpError(404, "Unknown API route.");
  const snapshot = await getSnapshot(env);
  if (path === "/api/world")
    return cached({
      ...snapshotInfo(snapshot),
      nextUpdateAt: snapshot.generatedAt + 4 * 3600000,
    });
  if (path === "/api/leaderboard" || path === "/api/skill-rankings") {
    const skill =
      path === "/api/skill-rankings" ? url.searchParams.get("skill") : null;
    if (path === "/api/skill-rankings" && !skill) {
      const rankings = await allSkillRankings(env, snapshot);
      return cached({
        ...snapshotInfo(snapshot),
        topN: snapshot.totalPlayers,
        rankings,
      });
    }
    if (skill && !SKILLS.includes(skill))
      throw new HttpError(400, "Unknown skill.");
    let rows = await rankingRows(
      env,
      snapshot,
      path === "/api/leaderboard" ? "overall" : skill,
    );
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    if (q) rows = rows.filter((u) => u.username.toLowerCase().includes(q));
    if (skill) {
      const min = integer(
          url.searchParams.get("minLevel"),
          1,
          1,
          99,
          "minLevel",
        ),
        max = integer(url.searchParams.get("maxLevel"), 99, 1, 99, "maxLevel");
      const minXP = integer(
          url.searchParams.get("minXP"),
          0,
          0,
          200_000_000,
          "minXP",
        ),
        maxXP = integer(
          url.searchParams.get("maxXP"),
          200_000_000,
          0,
          200_000_000,
          "maxXP",
        );
      if (min > max || minXP > maxXP)
        throw new HttpError(
          400,
          "Minimum filters must not exceed maximum filters.",
        );
      rows = rows.filter(
        (u) =>
          u.level >= min && u.level <= max && u.xp >= minXP && u.xp <= maxXP,
      );
    }
    return cached({
      ...snapshotInfo(snapshot),
      skill: skill || null,
      ...paginate(rows, url.searchParams),
    });
  }
  if (path === "/api/users") {
    const users = (await rankingRows(env, snapshot, "overall"))
      .map((u) => u.username)
      .sort((a, b) => a.localeCompare(b));
    return cached({ ...snapshotInfo(snapshot), users });
  }
  if (path === "/api/achievements/stats")
    return cached({
      updatedAt: snapshot.generatedAt,
      totalPlayers: snapshot.totalPlayers,
      counts: snapshot.counts,
    });
  if (path === "/api/achievements/firsts")
    return cached({
      updatedAt: snapshot.generatedAt,
      totalPlayers: snapshot.totalPlayers,
      firsts: snapshot.firsts,
      counts: snapshot.counts,
      v2: { version: 2, keys: snapshot.firsts, counts: snapshot.counts },
    });
  if (path === "/api/achievements/catalog")
    return cached({
      ...snapshotInfo(snapshot),
      achievements: catalog(
        snapshot.counts,
        snapshot.totalPlayers,
        snapshot.firsts,
      ),
    });
  const log = snapshot.events
    ? { events: snapshot.events }
    : await readJSON(env, "ach:events", { events: [] });
  const byKey = new Map(
    catalog(snapshot.counts, snapshot.totalPlayers, snapshot.firsts).map(
      (a) => [a.key, a],
    ),
  );
  return cached(
    log.events
      .filter(
        (e) => e.timestamp >= Date.now() - 48 * 3600_000 && byKey.has(e.key),
      )
      .map((e) => ({
        ...e,
        ...byKey.get(e.key),
        name: byKey.get(e.key).name,
        username: e.username,
        timestamp: e.timestamp,
      }))
      .slice(0, 12),
  );
}
export async function handleApiRequest(request, env, ctx) {
  try {
    const edge = ctx?.waitUntil && globalThis.caches?.default;
    const cacheable =
      request.method === "GET" &&
      /^\/api\/(world|leaderboard|skill-rankings|users(?:\/.*)?|achievements\/.*|banners\/rare)$/.test(
        new URL(request.url).pathname,
      );
    if (edge && cacheable) {
      const hit = await edge.match(request);
      if (hit) return hit;
    }
    const response = await route(request, env);
    if (edge && cacheable && response.status === 200)
      ctx.waitUntil(edge.put(request, response.clone()));
    return response;
  } catch (error) {
    if (!(error instanceof HttpError)) console.error("API failure:", error);
    return json(
      {
        error:
          error instanceof HttpError
            ? error.message
            : "The hiscores service is temporarily unavailable. Try again shortly.",
      },
      error.status || 503,
    );
  }
}
export { runScheduled };
export default {
  async fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (path === "/api" || path.startsWith("/api/"))
      return handleApiRequest(request, env, ctx);
    return env.ASSETS
      ? env.ASSETS.fetch(request)
      : json({ error: "Static assets are not configured." }, 404);
  },
  scheduled(_event, env, ctx) {
    ctx.waitUntil(mutate(env, () => runScheduled(env)));
  },
};
