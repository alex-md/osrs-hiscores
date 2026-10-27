import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { HiscoresWorld } from "./world.js";
import { forwardApiRequest } from "./gateway.js";

function setup(legacy) {
  const db = new DatabaseSync(":memory:");
  const storage = {
    sql: { exec(sql, ...args) {
      const stmt = db.prepare(sql);
      const rows = stmt.columns().length ? stmt.all(...args) : (stmt.run(...args), []);
      return { toArray: () => rows };
    } },
    transactionSync(fn) {
      db.exec("BEGIN");
      try { fn(); db.exec("COMMIT"); }
      catch (error) { db.exec("ROLLBACK"); throw error; }
    },
  };
  const object = new HiscoresWorld({ storage }, { ALLOW_TWODNE_SCRAPE: "false", ADMIN_TOKEN: "secret", HISCORES_KV: legacy });
  const request = (path, body, token = "secret") => object.fetch(new Request(`https://world${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-admin-token": token, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  return { object, request, db, storage };
}
test("a clean Durable Object world ignores the old KV namespace entirely", async () => {
  const legacy = new Proxy({}, { get() { throw new Error("Legacy KV must never be accessed"); } });
  const { request } = setup(legacy);
  assert.equal((await request("/api/world")).status, 503);
  assert.equal((await request("/api/seed", { usernames: ["Ada"] }, "wrong")).status, 401);
  assert.equal((await request("/internal/scheduled", {})).status, 200);
  const world = await (await request("/api/world")).json();
  assert.equal(world.totalPlayers, 5);
  for (const path of ["/api/world", "/api/leaderboard", "/api/generate/users/dry-run", "/api/skill-rankings", "/api/achievements/catalog", "/api/exchange"])
    assert.equal((await request(path)).status, 200, path);
  assert.equal((await request("/api/admin/rebuild", {})).status, 200);
  assert.equal((await request("/api/seed", { usernames: ["Ada", "__proto__"] })).status, 200);
  assert.equal((await request("/api/users/Ada")).status, 200);
  assert.equal((await request("/api/users/__proto__")).status, 200);
  assert.equal((await request("/api/admin/users/delete-batch", { usernames: ["Ada"], dryRun: false })).status, 200);
  assert.equal((await request("/api/users/Ada")).status, 404);
});

test("all public reads stay read-only when the world is absent", async () => {
  const { request, db } = setup();
  for (let i = 0; i < 20; i++)
    for (const path of ["/api/world", "/api/users", "/api/leaderboard", "/api/generate/users/dry-run", "/api/debug", "/api/exchange"])
      await request(path);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM documents").get().n, 0);
});

test("failed SQL commit rolls back player state, manifest, and simulation slot", async (t) => {
  t.mock.method(console, "error", () => {});
  const { request, object, storage } = setup();
  assert.equal((await request("/api/seed", { usernames: ["Ada"] })).status, 200);
  const before = await (await request("/api/world")).json();
  const original = storage.sql.exec;
  let writes = 0;
  storage.sql.exec = (sql, ...args) => {
    if (sql.startsWith("INSERT") && ++writes === 3) throw new Error("Injected SQL write failure");
    return original(sql, ...args);
  };
  assert.equal((await request("/internal/scheduled", {})).status, 503);
  storage.sql.exec = original;
  assert.equal((await (await request("/api/world")).json()).generation, before.generation);
  assert.equal(await object.store.get("system:update-slot"), null);
  assert.equal(await object.store.get("system:exchange"), null);
  assert.equal(await object.store.get("system:training-climate"), null);
  assert.equal((await request("/internal/scheduled", {})).status, 200);
});

test("simultaneous triggers advance the world once and retain only current shards", async () => {
  const { request, db } = setup();
  const responses = await Promise.all(Array.from({ length: 12 }, () => request("/internal/scheduled", {})));
  assert.equal(responses.filter((r) => r.status === 200).length, 1);
  assert.equal(responses.filter((r) => r.status === 429).length, 11);
  const world = await (await request("/api/world")).json();
  assert.equal(world.totalPlayers, 5);
  await request("/api/admin/rebuild", {});
  const latest = await (await request("/api/world")).json();
  const shards = db.prepare("SELECT key FROM documents WHERE key LIKE 'snapshot:%' AND key != 'snapshot:current'").all();
  assert.ok(shards.every(({ key }) => key.startsWith(`snapshot:${latest.generation}:`)));
});

test("Pages and Worker gateways address the same singleton and edge-cache reads", async (t) => {
  const { object, request } = setup();
  await request("/api/seed", { usernames: ["Ada"] });
  let calls = 0;
  const env = { HISCORES_WORLD: { idFromName(name) { assert.equal(name, "main-world"); return name; }, get() { return { fetch(req) { calls++; return object.fetch(req); } }; } } };
  const cache = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", { configurable: true, value: { default: {
    match: async (req) => cache.get(req.url)?.clone(),
    put: async (req, response) => cache.set(req.url, response),
  } } });
  t.after(() => previous ? Object.defineProperty(globalThis, "caches", previous) : delete globalThis.caches);
  const pending = [], ctx = { waitUntil: (p) => pending.push(p) };
  const req = new Request("https://site/api/world");
  assert.equal((await forwardApiRequest(req, env, ctx)).status, 200);
  await Promise.all(pending);
  assert.equal((await forwardApiRequest(req, env, ctx)).status, 200);
  assert.equal(calls, 1);
});

test("96 daily simulation windows advance only elapsed time and report the aligned next update", async (t) => {
  let now = Date.parse("2026-10-20T00:00:00Z");
  t.mock.method(Date, "now", () => now);
  const { request } = setup();
  for (let slot = 0; slot < 96; slot++) {
    const response = await request("/internal/scheduled", {});
    assert.equal(response.status, 200);
    const run = await response.json();
    assert.equal(run.simulatedHours, 0.25);
    assert.equal((await request("/internal/scheduled", {})).status, 429);
    const world = await (await request("/api/world")).json();
    assert.equal(world.nextUpdateAt, now + 15 * 60_000);
    assert.equal(world.training.updateMinutes, 15);
    now += 15 * 60_000;
  }
});

test("rename-all preserves progress, historical references and backups, and runs once", async () => {
  const { request, db, object } = setup();
  await request("/api/seed", { usernames: ["RuneFox123", "IronMage456"] });
  const before = await (await request("/api/users/batch?usernames=RuneFox123,IronMage456")).json();
  const snapshotBefore = JSON.parse(await object.store.get("snapshot:current"));
  assert.equal((await request("/api/admin/users/rename-all", { dryRun: false }, "wrong")).status, 401);
  assert.equal((await request("/api/admin/users/rename-all", { dryRun: "false" })).status, 400);
  const preview = await (await request("/api/admin/users/rename-all", {})).json();
  assert.equal(preview.count, 2);
  assert.equal(preview.dryRun, true);
  assert.equal(await object.store.get("system:username-migration:v1"), null);
  assert.equal((await request("/api/users/RuneFox123")).status, 200);
  const response = await request("/api/admin/users/rename-all", { dryRun: false });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.count, 2);
  const mapping = new Map(result.renames.map(({ from, to }) => [from, to]));
  const snapshot = JSON.parse(await object.store.get("snapshot:current"));
  for (const [key, value] of Object.entries(snapshotBefore.firsts))
    assert.deepEqual(snapshot.firsts[key], { ...value, username: mapping.get(value.username) || value.username });
  for (const event of snapshotBefore.events)
    assert.ok(snapshot.events.some((item) => item.key === event.key && item.timestamp === event.timestamp && item.username === mapping.get(event.username)));
  for (const { from, to } of result.renames) {
    assert.equal((await request(`/api/users/${encodeURIComponent(from)}`)).status, 404);
    const user = await (await request(`/api/users/${encodeURIComponent(to)}`)).json();
    // Batch endpoint returns full player documents, including simulation state.
    const old = before.users.find((item) => item.username === from);
    assert.deepEqual(user.skills, old.skills);
    assert.equal(user.createdAt, old.createdAt);
    assert.equal(user.updatedAt, old.updatedAt);
    for (const [key, value] of Object.entries(old.achievements)) assert.equal(user.achievements[key], value);
  }
  assert.equal(JSON.parse(await object.store.get("backup:username-v1:players:0")).length, 2);
  const repeated = await (await request("/api/admin/users/rename-all", { dryRun: false })).json();
  assert.equal(repeated.alreadyApplied, true);
  assert.deepEqual(repeated.renames, result.renames);
  await request("/api/admin/rebuild", {});
  const rebuilt = JSON.parse(await object.store.get("snapshot:current"));
  for (const value of Object.values(rebuilt.firsts)) assert.ok(!mapping.has(value.username));
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM documents WHERE key LIKE 'system:username-migration:%'").get().n, 1);
});

test("rename-all rolls back backup, history and names if the SQLite commit fails", async (t) => {
  t.mock.method(console, "error", () => {});
  const { request, object, storage } = setup();
  await request("/api/seed", { usernames: ["RuneFox123"] });
  const snapshot = await object.store.get("snapshot:current");
  const original = storage.sql.exec;
  storage.sql.exec = (sql, ...args) => {
    if (sql.startsWith("INSERT") && args[0] === "system:username-migration:v1") throw new Error("Injected failure");
    return original(sql, ...args);
  };
  const response = await request("/api/admin/users/rename-all", { dryRun: false });
  assert.equal(response.status, 503);
  assert.equal(await object.store.get("snapshot:current"), snapshot);
  assert.equal(await object.store.get("system:username-migration:v1"), null);
  assert.equal(await object.store.get("backup:username-v1:players:0"), null);
});

test("exchange reads publish bounded market data with the world generation and never write", async () => {
  const { request, db } = setup();
  await request("/internal/scheduled", {});
  const before = db.prepare("SELECT key, value FROM documents ORDER BY key").all();
  const world = await (await request("/api/world")).json();
  const response = await request("/api/exchange");
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.generation, world.generation);
  assert.ok(data.items.length > 20);
  assert.ok(data.tape.length <= 20);
  assert.equal(data.prices, undefined);
  assert.deepEqual(db.prepare("SELECT key, value FROM documents ORDER BY key").all(), before);
});


test("scheduled worlds cross UTC days without external price requests", async (t) => {
  let now = Date.parse("2026-10-26T23:45:00Z");
  t.mock.method(Date, "now", () => now);
  let requests = 0;
  t.mock.method(globalThis, "fetch", async () => { requests++; throw new Error("Network disabled"); });
  const { request } = setup();
  for (let tick = 0; tick < 3; tick++) {
    assert.equal((await request("/internal/scheduled", {})).status, 200);
    now += 900000;
  }
  assert.equal(requests, 0);
});

test("gateway health reports the serving release even when a world retains its earlier revision", async () => {
  const older = "a".repeat(40), current = "b".repeat(40);
  let calls = 0;
  const env = { RELEASE_SHA: current, HISCORES_WORLD: {
    idFromName: name => name,
    get: () => ({fetch: async () => {
      calls++;
      return Response.json({status:"ok",hasDurableObject:true,storage:"durable-object-sqlite",revision:older});
    }}),
  }};
  const response = await forwardApiRequest(new Request('https://site/api/health'),env);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{status:"ok",hasDurableObject:true,storage:"durable-object-sqlite",revision:current,worldRevision:older});
  assert.equal(calls,1);
  assert.equal(response.headers.get('cache-control'),'no-store');
  env.HISCORES_WORLD.get = () => ({fetch:async()=>Response.json({error:'World unavailable'}, {status:503})});
  assert.equal((await forwardApiRequest(new Request('https://site/api/health'),env)).status,503);
});
