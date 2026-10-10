import test from "node:test";
import assert from "node:assert/strict";
import worker, { handleApiRequest, runScheduled } from "./index.js";
import { onRequest } from "../../functions/api/[[path]].js";
import { SKILLS } from "./constants.js";
import { xpForLevel, totalLevel, totalXP } from "./utils.js";
import { putUser, allUsers } from "./store.js";
import { publishSnapshot } from "./snapshots.js";
import { computeAchievementContext } from "./achievements.js";
import { combatLevel, rarity } from "../../frontend/lib/domain.js";

class MemoryKV {
  data = new Map();
  async get(key) {
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
const env = () => ({ HISCORES_KV: new MemoryKV(), ADMIN_TOKEN: "test-only" });
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

test("health and preflight remain reachable when KV is missing", async () => {
  assert.equal((await call({}, "/api/health")).status, 503);
  assert.equal((await call({}, "/api/users")).status, 503);
  const response = await onRequest({
    request: new Request("https://test/api/seed", { method: "OPTIONS" }),
    env: {},
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
    (await call({ HISCORES_KV: e.HISCORES_KV }, "/api/seed", post())).status,
    503,
  );
  assert.equal(e.HISCORES_KV.data.size, 0);
});
test("seed validates the whole batch, preserves existing players and deduplicates names", async () => {
  const e = env();
  assert.equal(
    (await call(e, "/api/seed", post({ usernames: ["Valid", "<script>"] })))
      .status,
    400,
  );
  assert.equal(e.HISCORES_KV.data.size, 0);
  const first = await (
    await call(
      e,
      "/api/seed",
      post({ usernames: ["Rune Mage", "Rune Mage", "rune mage", "Oak"] }),
    )
  ).json();
  assert.equal(first.created.length, 2);
  const old = await e.HISCORES_KV.get("user:oak");
  const second = await (
    await call(e, "/api/seed", post({ usernames: ["Oak"] }))
  ).json();
  assert.deepEqual(second.skipped, ["Oak"]);
  assert.equal(await e.HISCORES_KV.get("user:oak"), old);
});
test("rankings include players beyond the former 500 cap, paginate and filter without changing ranks", async () => {
  const e = env();
  const users = Array.from({ length: 520 }, (_, i) =>
    player(`Player${String(i).padStart(3, "0")}`, 50),
  );
  for (const u of users) await putUser(e, u);
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
  assert.equal(context.top1SkillsByUserCount.get("ada"), 23);
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
  await e.HISCORES_KV.put(
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
  const log = await e.HISCORES_KV.get("ach:events");
  await publishSnapshot(e);
  assert.deepEqual(
    JSON.parse(await e.HISCORES_KV.get("ach:events")).events,
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
  assert.ok(await e.HISCORES_KV.get("user:ada"));
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
test("scheduled simulation seeds an empty world and never lowers XP or loses history", async () => {
  const e = env();
  const first = await runScheduled(e);
  assert.equal(first.newUsers, 5);
  const before = await allUsers(e);
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
test("independent KV environments cannot leak cached users", async () => {
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
    404,
  );
  const pages = await onRequest({
    request: new Request("https://test/api/health"),
    env: e,
  });
  assert.equal((await pages.json()).status, "ok");
});
test("combat and rarity definitions distinguish unclaimed milestones", () => {
  assert.equal(combatLevel(player("Max", 99).skills), 126);
  assert.equal(rarity(0, 100), "unclaimed");
  assert.equal(rarity(1, 10000), "mythic");
});
