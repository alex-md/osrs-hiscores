import { expectedRate } from "./training.js";
import test from "node:test";
import assert from "node:assert/strict";
import worker, { handleApiRequest, runScheduled } from "./index.js";
import { onRequest } from "../../functions/api/[[path]].js";
import { SKILLS } from "./constants.js";
import { xpForLevel, totalLevel, totalXP } from "./utils.js";
import { allUsers, mapBatches } from "./store.js";
import { publishSnapshot } from "./snapshots.js";
import { computeAchievementContext } from "./achievements.js";
import { combatLevel, rarity } from "../../frontend/lib/domain.js";

class MemoryKV {
  data = new Map();
  async get(key, type) {
    if (Array.isArray(key)) {
      assert.ok(key.length <= 100);
      return new Map(
        key.map((k) => [
          k,
          this.data.has(k)
            ? type === "json"
              ? JSON.parse(this.data.get(k))
              : this.data.get(k)
            : null,
        ]),
      );
    }
    return this.data.get(key) || null;
  }
  async put(key, value) {
    this.data.set(key, value);
  }
  async delete(key) {
    this.data.delete(key);
  }
  async list({ prefix = "", cursor = "0", limit = 1000 }) {
    const keys = [...this.data.keys()]
      .filter((k) => k.startsWith(prefix))
      .sort();
    const start = Number(cursor),
      end = Math.min(start + Math.min(limit, 200), keys.length);
    return {
      keys: keys.slice(start, end).map((name) => ({ name })),
      list_complete: end >= keys.length,
      cursor: String(end),
    };
  }
}
const env = () => ({ GE_FETCH: async () => { throw new Error("Offline test"); }, ALLOW_TWODNE_SCRAPE: "false", WORLD_STORE: new MemoryKV(), ADMIN_TOKEN: "test-only" });
const putUser = async (e, user) => {
  const users = (await allUsers(e)).filter((u) => u.username.toLowerCase() !== user.username.toLowerCase());
  await publishSnapshot(e, [...users, user]);
};
function player(username, level = 50) {
  const skills = Object.fromEntries(
    SKILLS.map((s) => [s, { xp: xpForLevel(level), level }]),
  );
  return {
    username,
    skills,
    totalLevel: totalLevel(skills),
    totalXP: totalXP(skills),
    createdAt: 1700000000000,
    updatedAt: 1700000000000,
    archetype: "CASUAL",
    achievements: {},
  };
}
const call = (environment, path, options = {}) =>
  handleApiRequest(
    new Request(`https://hiscores.test${path}`, options),
    environment,
  );
const post = (body = {}, token = "test-only") => ({
  method: "POST",
  headers: { "content-type": "application/json", "x-admin-token": token },
  body: JSON.stringify(body),
});

test("health and preflight remain reachable when storage is missing", async () => {
  assert.equal((await call({}, "/api/health")).status, 503);
  assert.equal((await call({}, "/api/users")).status, 503);
  const response = await onRequest({
    request: new Request("https://test/api/seed", { method: "OPTIONS" }),
    env: { HISCORES_WORLD: { idFromName: (name) => name, get: () => ({ fetch: (request) => handleApiRequest(request, {}) }) } },
  });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), "*");
});
test("all mutations require configured header authentication", async () => {
  const e = env();
  for (const path of [
    "/api/seed",
    "/api/cron/trigger",
    "/api/admin/rebuild",
    "/api/admin/users/delete-batch",
    "/api/admin/migrate/v4",
  ]) {
    assert.equal((await call(e, path, post({}, "wrong"))).status, 401);
  }
  assert.equal(
    (await call(e, "/api/seed?token=test-only", { method: "POST" })).status,
    401,
  );
  assert.equal(
    (await call({ WORLD_STORE: e.WORLD_STORE }, "/api/seed", post())).status,
    503,
  );
  assert.equal(e.WORLD_STORE.data.size, 0);
});
test("seed validates the whole batch, preserves existing players and deduplicates names", async () => {
  const e = env();
  assert.equal(
    (await call(e, "/api/seed", post({ usernames: ["Valid", "<script>"] })))
      .status,
    400,
  );
  assert.equal(e.WORLD_STORE.data.size, 0);
  const first = await (
    await call(
      e,
      "/api/seed",
      post({ usernames: ["Rune Mage", "Rune Mage", "rune mage", "Oak"] }),
    )
  ).json();
  assert.equal(first.created.length, 2);
  const old = (await allUsers(e)).find((u) => u.username === "Oak");
  const second = await (
    await call(e, "/api/seed", post({ usernames: ["Oak"] }))
  ).json();
  assert.deepEqual(second.skipped, ["Oak"]);
  assert.deepEqual((await allUsers(e)).find((u) => u.username === "Oak"), old);
});
test("rankings include players beyond the former 500 cap, paginate and filter without changing ranks", async () => {
  const e = env();
  const users = Array.from({ length: 520 }, (_, i) =>
    player(`Player${String(i).padStart(3, "0")}`, 50),
  );
  await publishSnapshot(e, users);
  assert.equal((await allUsers(e)).length, 520);
  await publishSnapshot(e, users);
  const data = await (
    await call(e, "/api/leaderboard?page=11&limit=50")
  ).json();
  assert.equal(data.totalPlayers, 520);
  assert.equal(data.total, 520);
  assert.equal(data.players.length, 20);
  assert.equal(data.players[0].rank, 501);
  const skill = await (
    await call(
      e,
      "/api/skill-rankings?skill=attack&q=Player519&minLevel=50&maxLevel=50",
    )
  ).json();
  assert.equal(skill.players[0].rank, 520);
  assert.equal(skill.total, 1);
  const last = await (
    await call(e, "/api/leaderboard?page=999&limit=50")
  ).json();
  assert.equal(last.page, 11);
  assert.equal((await call(e, "/api/leaderboard?limit=nope")).status, 400);
  assert.equal((await call(e, "/api/skill-rankings?skill=banana")).status, 400);
  assert.equal(
    (await call(e, "/api/skill-rankings?skill=attack&minXP=20&maxXP=10"))
      .status,
    400,
  );
  const all = await (await call(e, "/api/skill-rankings")).json();
  assert.equal(all.rankings.attack.length, 520);
});
test("skill ties use the same username ordering for rankings and achievement crowns", () => {
  const users = [player("Zed"), player("Ada")];
  const context = computeAchievementContext(users);
  assert.equal(context.top1SkillsByUserCount.get("ada"), SKILLS.length);
  assert.equal(context.top1SkillsByUserCount.get("zed"), undefined);
});
test("player profiles expose authoritative ranks, combat level and persisted achievement timestamps", async () => {
  const e = env();
  const user = player("Rune Mage", 99);
  user.achievements["total-1500"] = 123456;
  await putUser(e, user);
  await publishSnapshot(e);
  const data = await (await call(e, "/api/users/Rune%20Mage")).json();
  assert.equal(data.rank, 1);
  assert.equal(data.ranks.attack, 1);
  assert.equal(data.combatLevel, 126);
  assert.equal(data.achievements["total-1500"], 123456);
  assert.equal((await call(e, "/api/users/%E0%A4%A")).status, 400);
  assert.equal((await call(e, "/api/users/Missing")).status, 404);
});
test("firsts reconcile earlier historical timestamps and repeated rebuilds are idempotent", async () => {
  const e = env();
  const u = player("Ada", 99);
  u.achievements["skill-master-attack"] = 100;
  await putUser(e, u);
  await e.WORLD_STORE.put(
    "ach:firsts",
    JSON.stringify({
      "skill-master-attack": { username: "Historic", timestamp: 50 },
    }),
  );
  await publishSnapshot(e);
  const catalog = await (await call(e, "/api/achievements/catalog")).json();
  const mastery = catalog.achievements.find(
    (a) => a.key === "skill-master-attack",
  );
  assert.equal(mastery.first.username, "Historic");
  assert.equal(mastery.count, 1);
  const log = await e.WORLD_STORE.get("snapshot:current");
  await publishSnapshot(e);
  assert.deepEqual(
    JSON.parse(await e.WORLD_STORE.get("snapshot:current")).events,
    JSON.parse(log).events,
  );
});
test("deletion defaults to dry-run and live deletion rebuilds all projections", async () => {
  const e = env();
  await putUser(e, player("Ada"));
  await putUser(e, player("Zed"));
  await publishSnapshot(e);
  let response = await (
    await call(e, "/api/admin/users/delete-batch", post({ usernames: ["Ada"] }))
  ).json();
  assert.equal(response.dryRun, true);
  assert.ok((await allUsers(e)).some((u) => u.username === "Ada"));
  assert.equal(
    (await call(e, "/api/admin/users/delete-batch", post({ dryRun: "false" })))
      .status,
    400,
  );
  await call(
    e,
    "/api/admin/users/delete-batch",
    post({ usernames: ["Ada"], dryRun: false }),
  );
  response = await (await call(e, "/api/leaderboard")).json();
  assert.equal(response.total, 1);
  assert.equal(response.players[0].username, "Zed");
});
test("scheduled simulation seeds an empty world and never lowers XP or loses history", async (t) => {
  let now = Date.now();
  t.mock.method(Date, "now", () => now);
  const e = env();
  const first = await runScheduled(e);
  assert.equal(first.newUsers, 5);
  const before = await allUsers(e);
  now += 15 * 60_000;
  const second = await runScheduled(e);
  assert.ok(second.totalPlayers > 5);
  const after = await allUsers(e);
  for (const old of before) {
    const user = after.find((u) => u.username === old.username);
    assert.ok(user.totalXP >= old.totalXP);
    for (const key of Object.keys(old.achievements))
      assert.equal(user.achievements[key], old.achievements[key]);
    assert.equal(user.totalLevel, totalLevel(user.skills));
    assert.ok(SKILLS.every((s) => user.skills[s].xp <= 200_000_000));
  }
});
test("independent database environments cannot leak cached users", async () => {
  const one = env(),
    two = env();
  await putUser(one, player("Ada"));
  await putUser(two, player("Zed"));
  assert.deepEqual((await (await call(one, "/api/users")).json()).users, [
    "Ada",
  ]);
  assert.deepEqual((await (await call(two, "/api/users")).json()).users, [
    "Zed",
  ]);
});
test("Worker serves assets separately and Pages delegates to the same API", async () => {
  const e = env();
  e.ASSETS = { fetch: () => new Response("asset") };
  assert.equal(
    await (await worker.fetch(new Request("https://test/"), e)).text(),
    "asset",
  );
  assert.equal(
    (await worker.fetch(new Request("https://test/api/unknown"), e)).status,
    503,
  );
  const pages = await onRequest({
    request: new Request("https://test/api/health"),
    env: { HISCORES_WORLD: { idFromName: (name) => name, get: () => ({ fetch: (request) => handleApiRequest(request, e) }) } },
  });
  assert.equal((await pages.json()).status, "ok");
});
test("combat and rarity definitions distinguish unclaimed milestones", () => {
  assert.equal(combatLevel(player("Max", 99).skills), 126);
  assert.equal(rarity(0, 100), "unclaimed");
  assert.equal(rarity(1, 10000), "mythic");
});

test("packed player reads use the manifest and only canonical profile shards", async () => {
  const e = env();
  await publishSnapshot(e, Array.from({ length: 1200 }, (_, i) => player(`User${i}`)));
  let calls = 0;
  const get = e.WORLD_STORE.get.bind(e.WORLD_STORE);
  e.WORLD_STORE.get = async (...args) => { calls++; return get(...args); };
  e.WORLD_STORE.list = () => { throw new Error("Enumeration must never run"); };
  assert.equal((await allUsers(e)).length, 1200);
  assert.equal(calls, 2); // Manifest and twelve packed shards in one bulk call.
});
test("bounded storage writes finish in-flight work and propagate errors before publishing", async () => {
  let active = 0,
    peak = 0,
    completed = 0;
  await assert.rejects(
    mapBatches([1, 2, 3, 4], 2, async (value) => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      completed++;
      if (value === 1) throw new Error("KV unavailable");
    }),
    /KV unavailable/,
  );
  assert.equal(peak, 2);
  assert.equal(completed, 2);
  assert.equal(active, 0);
});

test("packed snapshots cut writes and profiles read one generation with two cold database reads", async () => {
  const e = env();
  const users = Array.from({ length: 501 }, (_, i) => player(`User${i}`));
  let writes = 0;
  const put = e.WORLD_STORE.put.bind(e.WORLD_STORE);
  e.WORLD_STORE.put = async (key, value) => {
    if (key.includes(":rankings:")) writes++;
    return put(key, value);
  };
  const snapshot = await publishSnapshot(e, users);
  assert.equal(writes, 2); // Previously 48 ranking shard writes.
  let reads = 0;
  const get = e.WORLD_STORE.get.bind(e.WORLD_STORE);
  e.WORLD_STORE.get = async (...args) => {
    reads++;
    return get(...args);
  };
  const response = await (await call(e, "/api/users/User500")).json();
  assert.equal(reads, 2);
  assert.equal(response.generation, snapshot.generation);
  assert.equal(response.ranks.attack, 448);
  assert.equal(response.training.baseScale, 18.5);
  assert.ok(response.training.scale >= 6 && response.training.scale <= 31);
  assert.equal(response.training.schedule.day, new Date(snapshot.generatedAt).toISOString().slice(0, 10));
  assert.ok(Math.abs(response.goal.trainingHours - response.goal.remainingXP / (expectedRate(response.goal.skill, response.skills[response.goal.skill].xp, response.skills[response.goal.skill].level) * response.training.scale)) < 1e-9);
  // Obsolete direct documents cannot change the authoritative published world.
  await e.WORLD_STORE.put("user:user500", JSON.stringify(player("User500", 99)));
  const stillPublished = await (await call(e, "/api/users/User500")).json();
  assert.equal(stillPublished.skills.attack.level, 50);
  assert.ok(stillPublished.goal.remainingXP > 0);
});
test("scheduled updates process every existing player and persist each at most once", async () => {
  const e = env();
  await publishSnapshot(e, Array.from({ length: 20 }, (_, i) => player(`User${i}`)));
  const calls = new Map();
  const put = e.WORLD_STORE.put.bind(e.WORLD_STORE);
  e.WORLD_STORE.put = async (key, value) => {
    calls.set(key, (calls.get(key) || 0) + 1);
    return put(key, value);
  };
  const result = await runScheduled(e);
  assert.equal(result.processed, 20);
  assert.ok(
    [...calls]
      .filter(([key]) => key.startsWith("user:"))
      .every(([, n]) => n === 1),
  );
  const world = await (await call(e, "/api/world")).json();
  assert.equal(world.training.baseScale, 18.5);
  assert.ok(world.training.scale >= 6 && world.training.scale <= 31);
  assert.equal(world.generatedAt, result.generatedAt);
});

test("snapshot profile indexes support names matching object properties", async () => {
  const e = env();
  await publishSnapshot(e, [player("__proto__"), player("constructor")]);
  assert.equal(
    (await (await call(e, "/api/users/__proto__")).json()).username,
    "__proto__",
  );
  assert.equal(
    (await (await call(e, "/api/users/constructor")).json()).username,
    "constructor",
  );
  const batch = await (
    await call(e, "/api/users/batch?usernames=__proto__,constructor,missing")
  ).json();
  assert.equal(batch.returned, 2);
});
test("edge cache serves repeated reads without database operations and diagnostics stay uncached", async (t) => {
  const e = env();
  await publishSnapshot(e, [player("Ada")]);
  const cached = new Map(),
    pending = [];
  const original = Object.getOwnPropertyDescriptor(globalThis, "caches");
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: {
      default: {
        match: async (request) => cached.get(request.url)?.clone(),
        put: async (request, response) => cached.set(request.url, response),
      },
    },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, "caches", original);
    else delete globalThis.caches;
  });
  const ctx = { waitUntil: (promise) => pending.push(promise) };
  let reads = 0;
  const get = e.WORLD_STORE.get.bind(e.WORLD_STORE);
  e.WORLD_STORE.get = async (...args) => {
    reads++;
    return get(...args);
  };
  const request = new Request("https://hiscores.test/api/users/Ada");
  assert.equal((await handleApiRequest(request, e, ctx)).status, 200);
  await Promise.all(pending);
  const firstReads = reads;
  assert.ok(firstReads > 0);
  assert.equal((await handleApiRequest(request, e, ctx)).status, 200);
  assert.equal(reads, firstReads);
  await handleApiRequest(new Request("https://hiscores.test/api/debug"), e, ctx);
  await Promise.all(pending);
  assert.equal(cached.size, 1);
});

test("full skill rankings load each packed shard once", async () => {
  const e = env();
  await publishSnapshot(e, [player("Ada")]);
  let reads = 0;
  const get = e.WORLD_STORE.get.bind(e.WORLD_STORE);
  e.WORLD_STORE.get = async (...args) => {
    reads++;
    return get(...args);
  };
  const response = await (await call(e, "/api/skill-rankings")).json();
  assert.equal(reads, 2);
  assert.equal(Object.keys(response.rankings).length, SKILLS.length);
});

test("administrative seed cannot exceed the 5000-player world budget", async () => {
  const e = env();
  await publishSnapshot(e, Array.from({ length: 5000 }, (_, i) => player(`Cap${i}`)));
  const generation = JSON.parse(await e.WORLD_STORE.get("snapshot:current")).generation;
  assert.equal((await call(e, "/api/seed", post({ usernames: ["Overflow"] }))).status, 409);
  assert.equal(JSON.parse(await e.WORLD_STORE.get("snapshot:current")).generation, generation);
  assert.equal((await allUsers(e)).length, 5000);
});

test("Sailing and activity rankings share packed generations, global ranks, pagination and stable bank state", async () => {
  const e = env();
  const users = [player("Ada", 99), player("Zed", 80), player("Bob", 70)];
  users[0].bosses = { vorkath: 100, zulrah: 5 };
  users[1].bosses = { vorkath: 50 };
  users[0].economy = { bankValue: 10000000 };
  users[1].economy = { bankValue: 10000000 };
  users[2].economy = { bankValue: 500000 };
  const snapshot = await publishSnapshot(e, users);
  const all = await (await call(e, "/api/activity-rankings?category=bank&limit=1&page=2")).json();
  assert.equal(all.players[0].username, "Zed");
  assert.equal(all.players[0].rank, 2);
  assert.equal(all.generation, snapshot.generation);
  const filtered = await (await call(e, "/api/activity-rankings?category=vorkath&q=Zed")).json();
  assert.equal(filtered.players[0].rank, 2);
  assert.equal(filtered.total, 1);
  const combined = await (await call(e, "/api/activity-rankings?category=bosses")).json();
  assert.equal(combined.players[0].score, 105);
  assert.equal(combined.total, 2); // Zero-KC players are unranked.
  const profile = await (await call(e, "/api/users/Ada")).json();
  assert.equal(profile.activityRanks.vorkath, 1);
  assert.equal(profile.activityRanks.bank, 1);
  assert.equal(profile.skills.sailing.level, 99);
  const sailing = await (await call(e, "/api/skill-rankings?skill=sailing")).json();
  assert.equal(sailing.players[0].username, "Ada");
  assert.equal((await call(e, "/api/activity-rankings?category=constructor")).status, 400);
  assert.equal((await call(e, "/api/activity-rankings?category=vorkath&page=-1")).status, 400);
  const bankBefore = profile.economy;
  await publishSnapshot(e);
  const again = await (await call(e, "/api/users/Ada")).json();
  assert.deepEqual(again.economy, bankBefore);
  assert.deepEqual(again.bosses, profile.bosses);
});
