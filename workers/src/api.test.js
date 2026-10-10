import test from "node:test";
import assert from "node:assert/strict";
import { SKILLS } from "./constants.js";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
async function client(t, responses, hostname = "localhost") {
  const storage = new Map();
  t.mock.method(globalThis, "fetch", async (url) => {
    const result = responses[url];
    assert.ok(result, `Unexpected request: ${url}`);
    return result();
  });
  globalThis.location = { origin: `https://${hostname}`, hostname, search: "" };
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  t.after(() => {
    delete globalThis.location;
    delete globalThis.localStorage;
  });
  return import(`../../frontend/lib/api.js?test=${Math.random()}`);
}

test("client consumes v2 pagination without extra requests", async (t) => {
  const data = {
    page: 2,
    pages: 4,
    limit: 25,
    total: 100,
    players: [{ username: "Ada", rank: 26 }],
  };
  const api = await client(t, { "/api/leaderboard?page=2": () => json(data) });
  assert.deepEqual(await api.request("/api/leaderboard?page=2"), data);
});
test("client adapts legacy pagination and explicitly exposes snapshot coverage", async (t) => {
  const players = Array.from({ length: 55 }, (_, i) => ({
    username: `Player${i}`,
    rank: i + 1,
  }));
  const api = await client(t, {
    "/api/leaderboard?page=2&limit=25": () =>
      json({ totalPlayers: 90, players: players.slice(0, 25) }),
    "/api/leaderboard?limit=5000": () => json({ totalPlayers: 90, players }),
  });
  const result = await api.request("/api/leaderboard?page=2&limit=25");
  assert.equal(result.coverage, 55);
  assert.equal(result.players[0].rank, 26);
  assert.equal(result.pages, 3);
  assert.equal(result.legacy, true);
});
test("client derives legacy skill filters and preserves global ranks", async (t) => {
  const api = await client(t, {
    "/api/skill-rankings?skill=attack&minLevel=90": () =>
      json({
        totalPlayers: 1000,
        rankings: {
          attack: [
            { username: "Ada", rank: 1, level: 99, xp: 13034431 },
            { username: "Zed", rank: 2, level: 50, xp: 100000 },
          ],
        },
      }),
  });
  const result = await api.request(
    "/api/skill-rankings?skill=attack&minLevel=90",
  );
  assert.equal(result.players.length, 1);
  assert.equal(result.players[0].rank, 1);
  assert.equal(result.coverage, 2);
});
test("legacy profile and catalog use shared domain rules and recorded firsts", async (t) => {
  const skills = Object.fromEntries(
    SKILLS.map((s) => [s, { level: 99, xp: 13034431 }]),
  );
  const api = await client(t, {
    "/api/users/Ada": () => json({ username: "Ada", skills }),
    "/api/leaderboard?limit=5000": () =>
      json({ players: [{ username: "Ada", rank: 1, tier: "Grandmaster" }] }),
    "/api/skill-rankings": () =>
      json({
        rankings: Object.fromEntries(
          SKILLS.map((s) => [s, [{ username: "Ada", rank: 1 }]]),
        ),
      }),
    "/api/achievements/catalog": () => json({ error: "Not found" }, 404),
    "/api/achievements/stats": () =>
      json({ totalPlayers: 100, counts: { "skill-master-attack": 1 } }),
    "/api/achievements/firsts": () =>
      json({
        firsts: { "skill-master-attack": { username: "Ada", timestamp: 100 } },
      }),
  });
  const profile = await api.request("/api/users/Ada");
  assert.equal(profile.combatLevel, 126);
  assert.equal(profile.ranks.construction, 1);
  assert.equal(profile.tier, "Grandmaster");
  const catalog = await api.request("/api/achievements/catalog");
  const achievement = catalog.achievements.find(
    (a) => a.key === "skill-master-attack",
  );
  assert.equal(achievement.first.username, "Ada");
  assert.equal(achievement.count, 1);
});
test("GitHub Pages selects the Worker origin and validates/reset connection overrides", async (t) => {
  const api = await client(t, {}, "alex-md.github.io");
  assert.equal(api.apiBase(), api.LEGACY_WORKER);
  assert.throws(() => api.validateBase("javascript:alert(1)"));
  assert.throws(() => api.validateBase("https://user:pass@test.com"));
  assert.equal(
    api.validateBase("https://example.com/api/"),
    "https://example.com",
  );
  api.saveBase("http://localhost:8787");
  assert.equal(api.apiBase(), "http://localhost:8787");
  api.saveBase("");
  assert.equal(api.apiBase(), api.LEGACY_WORKER);
});
test("client recognizes static-host routing mistakes and propagates API errors", async (t) => {
  const api = await client(t, {
    "/api/leaderboard": () =>
      new Response("<html>", { headers: { "content-type": "text/html" } }),
    "/api/users/Missing": () => json({ error: "Player not found" }, 404),
  });
  await assert.rejects(api.request("/api/leaderboard"), /not connected/);
  await assert.rejects(api.request("/api/users/Missing"), /Player not found/);
});

test("published configuration selects the API on a custom Pages domain", async (t) => {
  globalThis.HISCORES_CONFIG = { apiBase: "https://custom-worker.workers.dev" };
  t.after(() => {
    delete globalThis.HISCORES_CONFIG;
  });
  const api = await client(
    t,
    {
      "https://custom-worker.workers.dev/api/health": () =>
        json({ status: "ok" }),
    },
    "winrar.ai",
  );
  assert.equal((await api.request("/api/health")).status, "ok");
});
