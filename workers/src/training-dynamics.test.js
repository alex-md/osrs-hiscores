import test from "node:test";
import assert from "node:assert/strict";
import { advanceTrainingClimate, personalTraining } from "./training-dynamics.js";
import { normalizeUser } from "./store.js";
import { progressUser } from "./simulation.js";
import { chooseTrainingSkill } from "./training.js";
import { SKILLS } from "./constants.js";
import { xpForLevel } from "./utils.js";
const date = new Date("2026-10-26T12:00:00Z");
const seeded = initial => { let seed = initial; return () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32); };
function player(name = "Ada") {
  return normalizeUser({ username: name, archetype: "SKILLER", skills: Object.fromEntries(SKILLS.map(skill => [skill, { xp: xpForLevel(80) }])) });
}
test("shared training regimes persist without rerolls, then change after their expiry", () => {
  const climate = advanceTrainingClimate(null, date, seeded(7));
  assert.ok(climate.until - date.getTime() >= 1.5 * 3600000);
  assert.ok(climate.until - date.getTime() <= 9 * 3600000);
  assert.equal(advanceTrainingClimate(climate, new Date(climate.until - 1), () => { throw new Error("Premature reroll"); }), climate);
  const next = advanceTrainingClimate(climate, new Date(climate.until), seeded(19));
  assert.notDeepEqual(next, climate);
  assert.ok(next.until > climate.until);
});
test("goals last across sessions, exhausted grinders recover, capped skills are abandoned", () => {
  const user = player();
  const rng = seeded(17);
  const options = { hours: 0.25, activeHours: 0.25, rng };
  const first = personalTraining(user, options);
  const focus = user.trainingState.focusSkill;
  personalTraining(user, options);
  assert.equal(user.trainingState.focusSkill, focus);
  assert.ok(first.multiplier >= 0.2 && first.multiplier <= 2.5);
  user.trainingState.phase = "grind";
  user.trainingState.phaseRemaining = 4;
  user.trainingState.fatigue = 1;
  const recovery = personalTraining(user, options);
  assert.equal(recovery.phase, "recovery");
  const fatigued = user.trainingState.fatigue;
  personalTraining(user, { ...options, activeHours: 0 });
  assert.ok(user.trainingState.fatigue < fatigued);
  user.skills[focus].xp = 200_000_000;
  personalTraining(user, options);
  assert.notEqual(user.trainingState.focusSkill, focus);
});
test("zero elapsed time changes neither XP nor personal training state", () => {
  const user = player();
  progressUser(user, date, { rng: seeded(1) });
  const beforeXP = user.totalXP, before = structuredClone(user.trainingState);
  progressUser(user, date, { hours: 0, rng: seeded(2) });
  assert.equal(user.totalXP, beforeXP);
  assert.deepEqual(user.trainingState, before);
});
test("shared booms alter population gains instead of washing out across independent players", (t) => {
  t.mock.method(Math, "random", () => 0.999);
  const results = [0.55, 1.6].map(factor => {
    let gained = 0;
    for (let i = 0; i < 200; i++) {
      const user = player(`Player${i}`), before = user.totalXP;
      progressUser(user, date, { rng: seeded(i + 100), climate: { factor, focusSkill: "mining", skillFactor: 1.8 } });
      gained += user.totalXP - before;
      assert.ok(SKILLS.every(skill => user.skills[skill].xp <= 200000000));
    }
    return gained;
  });
  assert.ok(results[1] > results[0] * 1.5);
});
test("equal starting accounts diverge and daily gain leaders turn over across persistent cycles", (t) => {
  t.mock.method(Math, "random", () => 0.999);
  const users = Array.from({ length: 80 }, (_, i) => player(`Player${i}`));
  const randoms = users.map((_, i) => seeded(i + 432));
  const totals = [new Array(80).fill(0), new Array(80).fill(0)];
  for (let tick = 0; tick < 192; tick++) {
    const at = new Date(date.getTime() + tick * 900000);
    users.forEach((user, i) => {
      const before = user.totalXP;
      progressUser(user, at, { rng: randoms[i] });
      totals[Math.floor(tick / 96)][i] += user.totalXP - before;
    });
  }
  const leaders = totals.map(day => day.map((gain, i) => ({ gain, i })).sort((a, b) => b.gain - a.gain).slice(0, 20));
  const old = new Set(leaders[0].map(row => row.i));
  const newLeaders = leaders[1].filter(row => !old.has(row.i)).length;
  assert.ok(newLeaders >= 3, `Only ${newLeaders} new daily leaders`);
  assert.ok(new Set(users.map(user => user.trainingState.focusSkill)).size > 10);
  assert.ok(Math.max(...totals[1]) > Math.min(...totals[1]) * 2);
});


test("fully capped accounts can continue economic activity without selecting an XP goal", () => {
  const user = player();
  for (const stat of Object.values(user.skills)) { stat.xp = 200000000; stat.level = 99; }
  user.totalXP = SKILLS.length * 200000000;
  progressUser(user, date, { rng: seeded(7) });
  assert.equal(user.totalXP, SKILLS.length * 200000000);
  assert.equal(user.trainingState?.focusSkill, undefined);
});

test("archived prices have no influence on skill preferences", () => {
  const user = player();
  const counts = [0.5, 10].map(ratio => {
    const rng = seeded(13);
    let mining = 0;
    for (let i = 0; i < 5000; i++)
      if (chooseTrainingSkill(user, rng, { market: { prices: { 440: 100 * ratio }, history: { 440: [100, 100, 100] } } }) === "mining") mining++;
    return mining;
  });
  assert.equal(counts[1], counts[0]);
  assert.ok(counts[1] < counts[0] * 1.3);
});
