import test from "node:test";
import assert from "node:assert/strict";
import { SKILLS } from "./constants.js";
import { BOSSES, MAX_BANK_VALUE } from "../../frontend/lib/activities.js";
import { normalizeUser } from "./store.js";
import { normalizeCareer, eligibleBosses, progressBossing, progressSkillingEconomy, skillingFunding } from "./economy.js";
import { progressUser } from "./simulation.js";
import { xpForLevel } from "./utils.js";
const date = new Date("2026-10-26T19:00:00Z");
function seeded(seed) { return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32); }
function player(name = "Ada", level = 99) {
  return normalizeUser({ username: name, archetype: "PVMER", skills: Object.fromEntries(SKILLS.map(skill => [skill, { xp: xpForLevel(level), level }])), achievements: { old: 123 } });
}

test("legacy players gain level-1 Sailing and an explicit bank estimate without fabricated boss history", () => {
  const user = player();
  delete user.skills.sailing;
  delete user.economy;
  delete user.bosses;
  delete user.career;
  const oldXP = Object.values(user.skills).reduce((sum, skill) => sum + skill.xp, 0);
  const upgraded = normalizeUser(user);
  assert.deepEqual(upgraded.skills.sailing, { xp: 0, level: 1 });
  assert.equal(upgraded.totalXP, oldXP);
  assert.equal(upgraded.achievements.old, 123);
  assert.ok(upgraded.economy.bankValue > 0);
  assert.equal(upgraded.economy.recordedFrom, null);
  assert.ok(Object.values(upgraded.bosses).every(kills => kills === 0));
  const saved = structuredClone(upgraded);
  normalizeCareer(upgraded);
  assert.deepEqual(upgraded, saved);
  upgraded.username = "Renamed";
  normalizeCareer(upgraded);
  assert.deepEqual(upgraded.career, saved.career);
  assert.deepEqual(upgraded.economy, saved.economy);
});

test("boss eligibility respects combat and skill gates; inactive time produces no wealth or kills", () => {
  const fresh = player("New", 1);
  assert.equal(eligibleBosses(fresh).length, 0);
  const user = player();
  user.skills.slayer = { xp: 0, level: 1 };
  assert.ok(!eligibleBosses(user).some(boss => boss.key === "alchemical-hydra"));
  const saved = structuredClone(user);
  const result = progressBossing(user, date, { hours: 0, scale: 31, rng: seeded(1) });
  assert.equal(result.active, false);
  assert.deepEqual(user, saved);
});

test("bossing consumes a shared time budget and produces integer kills, bounded XP and reconciled bank flows", (t) => {
  t.mock.method(Math, "random", () => 0.999);
  const user = player();
  user.career.favoriteBoss = "scurrius";
  const before = structuredClone(user);
  progressUser(user, date, { rng: () => 0.01 });
  const session = user.economy.lastSession;
  assert.equal(session.activity, "bossing");
  assert.ok(session.hours + (session.trainingHours || 0) / session.activityScale <= user.progress.lastSession.hours + 1e-12);
  assert.ok(user.progress.lastSession.trainingHours < user.progress.lastSession.hours);
  assert.ok(user.skills.attack.xp <= 200000000);
  assert.equal(user.economy.bankValue, before.economy.bankValue + session.earned - session.spent);
  assert.ok(BOSSES.every(boss => Number.isSafeInteger(user.bosses[boss.key]) && user.bosses[boss.key] >= before.bosses[boss.key]));
  assert.equal(user.achievements.old, 123);
});

test("funding constrains buyable methods, costs cannot overdraw a bank, and capped wealth stays finite", () => {
  const user = player();
  user.economy.bankValue = 0;
  assert.equal(skillingFunding(user, "construction", 0.25, 31), 0.2);
  progressSkillingEconomy(user, date, { skill: "construction", hours: 0.25, scale: 31, rng: seeded(9) });
  assert.ok(user.economy.bankValue >= 0);
  assert.ok(Number.isSafeInteger(user.economy.bankValue));
  user.economy.bankValue = Infinity;
  normalizeCareer(user);
  assert.equal(user.economy.bankValue, MAX_BANK_VALUE);
  assert.equal(skillingFunding(user, "construction", 0.25, 31), 1);
});

test("a population has diverse persistent personalities and heavy-tailed starting wealth", () => {
  const users = Array.from({ length: 1000 }, (_, index) => player(`Player${index}`, 80));
  const banks = users.map(user => user.economy.bankValue).sort((a, b) => a - b);
  assert.ok(banks[990] > banks[500] * 3);
  assert.ok(new Set(users.map(user => user.career.favoriteBoss)).size >= 12);
  assert.ok(new Set(banks).size > 900);
});

test("world scaling increases KC at a gentler pace while wealth stays bounded and costs grow", () => {
  let lowKills = 0, highKills = 0;
  for (let index = 0; index < 300; index++) {
    const low = player(`Player${index}`), high = structuredClone(low);
    for (let session = 0; session < 8; session++) {
      progressBossing(low, date, { hours: 0.2, scale: 6, rng: seeded(1000 + index * 10 + session) });
      progressBossing(high, date, { hours: 0.2, scale: 31, rng: seeded(1000 + index * 10 + session) });
    }
    lowKills += Object.values(low.bosses).reduce((sum, kills) => sum + kills, 0);
    highKills += Object.values(high.bosses).reduce((sum, kills) => sum + kills, 0);

    assert.ok(high.economy.bankValue >= 0 && high.economy.bankValue <= MAX_BANK_VALUE);
    assert.ok(high.economy.earned >= (high.economy.lastSession?.earned || 0));
  }
  assert.ok(lowKills > 0);
  assert.ok(highKills > lowKills * 1.7);
  assert.ok(highKills < lowKills * 2.9);
  console.log(`Matched boss populations: ${lowKills} kills at 6x XP; ${highKills} at 31x XP`);
});
