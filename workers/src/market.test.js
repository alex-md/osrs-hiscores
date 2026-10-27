import test from "node:test";
import assert from "node:assert/strict";
import baseline from "../data/ge-baseline.js";
import { priceOf, BOSS_ITEMS, RARE_ITEMS, SKILL_ITEMS } from "./market.js";
import { normalizeUser } from "./store.js";
import { valueBank, progressSkillingEconomy } from "./economy.js";
import { progressUser } from "./simulation.js";
import { SKILLS } from "./constants.js";
import { xpForLevel } from "./utils.js";

const date = new Date("2026-10-26T19:00:00Z");
function player() {
  return normalizeUser({ username: "MarketTest", archetype: "PVMER", skills: Object.fromEntries(SKILLS.map(skill => [skill, { xp: xpForLevel(85) }])) });
}

test("all modeled rewards and materials have verified baseline item prices", () => {
  for (const id of [...Object.values(BOSS_ITEMS).flat(), ...Object.values(RARE_ITEMS).flatMap(items => items.map(([id]) => id)), ...Object.values(SKILL_ITEMS)])
    if (id) assert.ok(baseline[id]?.price > 0);
});

test("legacy conversion preserves wealth/history and retained equipment follows GE prices exactly once", () => {
  const user = player();
  const old = structuredClone(user);
  valueBank(user);
  assert.equal(user.economy.bankValue, old.economy.bankValue);
  assert.equal(user.economy.earned, old.economy.earned);
  assert.deepEqual(user.bosses, old.bosses);
  const market = { prices: Object.fromEntries(Object.entries(baseline).map(([id, item]) => [id, item.price * 2])), status: "current", capturedAt: date.getTime() };
  valueBank(user, market);
  assert.equal(user.economy.bankValue, Math.round(old.economy.bankValue * 1.7));
  assert.equal(user.economy.revaluation, user.economy.bankValue - old.economy.bankValue);
  const saved = structuredClone(user);
  for (let index = 0; index < 96; index++) valueBank(user, market);
  assert.deepEqual(user, saved);
});

test("skilling money ignores XP scale, follows material prices, and liquidates holdings without minting money", () => {
  const low = player(), high = structuredClone(low);
  for (const [user, scale] of [[low, 6], [high, 31]])
    progressSkillingEconomy(user, date, { skill: "fishing", hours: 0.25, scale, rng: () => 0.5 });
  assert.deepEqual(low.economy, high.economy);
  const before = low.economy.bankValue;
  const market = { prices: { 7944: baseline[7944].price * 2 } };
  valueBank(low, market);
  assert.ok(low.economy.bankValue > before);
  low.economy.cash = 0;
  valueBank(low, market);
  progressSkillingEconomy(low, date, { skill: "construction", hours: 10000, rng: () => 0.5, market });
  assert.equal(low.economy.bankValue, 0);
  valueBank(low, market);
  assert.equal(low.economy.bankValue, 0);
});

test("market gains respect the wealth cap without leaving hidden spendable holdings", () => {
  const user = player();
  user.economy.bankValue = 1_000_000_000_000;
  valueBank(user);
  const market = { prices: { 4151: baseline[4151].price * 10, 6585: baseline[6585].price * 10 } };
  valueBank(user, market);
  const modeled = user.economy.cash + Object.entries(user.economy.holdings).reduce((sum, [id, count]) => sum + count * priceOf(market, id), 0);
  assert.ok(Math.abs(modeled - user.economy.bankValue) < 0.001);
  assert.equal(user.economy.bankValue, 1_000_000_000_000);
  const saved = structuredClone(user.economy);
  valueBank(user, market);
  assert.deepEqual(user.economy, saved);
});

test("integrated sessions accelerate bossing without multiplying combat XP by both world and boss scales", (t) => {
  t.mock.method(Math, "random", () => 0.999);
  const low = player(), high = structuredClone(low);
  const early = new Date("2026-10-26T09:00:00Z"), late = new Date("2026-10-26T19:00:00Z");
  progressUser(low, early, { rng: () => 0.01 });
  progressUser(high, late, { rng: () => 0.01 });
  assert.equal(low.economy.lastSession.activity, "bossing");
  assert.ok(low.economy.lastSession.kills > 0);
  assert.notEqual(low.progress.lastSession.xpScale, high.progress.lastSession.xpScale);
  assert.notEqual(low.progress.lastSession.gainedXP, high.progress.lastSession.gainedXP);
  for (const user of [low, high]) {
    const session = user.economy.lastSession;
    assert.ok(session.activityScale >= Math.sqrt(6) && session.activityScale <= Math.sqrt(31));
    assert.equal(user.economy.bankValue, user.economy.openingEstimate + session.earned - session.spent);
    assert.ok(Number.isSafeInteger(session.kills));
  }
});
