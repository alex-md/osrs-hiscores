import test from "node:test";
import assert from "node:assert/strict";
import { dailyXpSchedule, xpModifier, windowXpScale, XP_SCALE } from "./xp-schedule.js";
import { progressUser } from "./simulation.js";
import { expectedRate } from "./training.js";
import { SKILLS } from "./constants.js";
import { xpForLevel, totalXP, totalLevel } from "./utils.js";

test("daily hierarchical schedules repeat across reads and vary across days without consuming session RNG", (t) => {
  t.mock.method(Math, "random", () => { throw new Error("Schedule consumed session RNG"); });
  const date = new Date("2026-10-26T12:00:00Z");
  const first = dailyXpSchedule(date);
  const next = dailyXpSchedule(new Date("2026-10-27T12:00:00Z"));
  assert.notDeepEqual(first.scales, next.scales);
  assert.notEqual(first.dailyFactor, next.dailyFactor);
  assert.deepEqual(dailyXpSchedule(date), first);
  assert.equal(first.scales.length, 96);
  assert.equal(first.timezone, "UTC");
  const current = xpModifier(date);
  assert.ok(Math.abs(current.scale - current.baseScale * current.weekendMultiplier * current.dailyFactor * current.timeOfDayFactor) < 1e-10);
  assert.equal(current.scale, first.scales[48]);
  assert.equal(current.nextChangeAt, Date.parse("2026-10-26T12:15:00Z"));
});

test("a year of schedules has overnight lulls, evening peaks, variable lows and capped combined weekend rates", () => {
  let reachedCap = false;
  const lows = new Set(), peaks = new Set();
  for (let day = 0; day < 366; day++) {
    const date = new Date(Date.UTC(2026, 0, 1 + day));
    const schedule = dailyXpSchedule(date);
    assert.ok(schedule.scales.every(value => Number.isFinite(value) && value >= 6 && value <= 31));
    const mean = schedule.scales.reduce((sum, value) => sum + value, 0) / 96;
    assert.ok(Math.abs(mean - XP_SCALE * schedule.weekendMultiplier * schedule.dailyFactor) < 1e-10);
    const average = values => values.reduce((sum, value) => sum + value, 0) / values.length;
    assert.ok(average(schedule.scales.slice(17 * 4, 22 * 4)) > average(schedule.scales.slice(2 * 4, 6 * 4)));
    assert.equal(schedule.weekendMultiplier, [0, 6].includes(date.getUTCDay()) ? 1.15 : 1);
    reachedCap ||= schedule.maxScale === 31;
    lows.add(schedule.minScale.toFixed(2));
    peaks.add(schedule.scales.indexOf(schedule.maxScale));
  }
  assert.ok(reachedCap);
  assert.ok(lows.size > 100);
  assert.ok(peaks.size > 10);
});

test("elapsed XP windows integrate both periods across hour, midnight and weekend boundaries", () => {
  for (const end of ["2026-10-26T12:07:30Z", "2026-10-24T00:07:30Z", "2026-10-26T00:07:30Z"]) {
    const date = new Date(end);
    const before = xpModifier(new Date(date.getTime() - 10 * 60_000)).scale;
    const after = xpModifier(date).scale;
    assert.ok(Math.abs(windowXpScale(date, 0.25) - (before + after) / 2) < 1e-10);
    assert.equal(windowXpScale(date, 200), windowXpScale(date, 0.25));
    assert.ok(Math.abs(windowXpScale(date, 0.05) - after) < 1e-10);
  }
  const edge = new Date("2026-10-26T12:00:00Z");
  assert.equal(windowXpScale(edge, 0.25), xpModifier(new Date("2026-10-26T11:59:59Z")).scale);
});

test("actual XP uses the period-weighted scale once and records it without changing historical state", (t) => {
  t.mock.method(Math, "random", () => 0.999);
  const date = new Date("2026-10-24T00:07:30Z");
  const skills = Object.fromEntries(SKILLS.map(skill => [skill, { xp: xpForLevel(80), level: 80 }]));
  const user = { username: "Test", skills, totalXP: totalXP(skills), totalLevel: totalLevel(skills), archetype: "CASUAL", achievements: { old: 123 } };
  const before = structuredClone(user);
  progressUser(user, date, { rng: () => 0.5 });
  const session = user.progress.lastSession;
  assert.equal(session.xpScale, windowXpScale(date, 0.25));
  const stat = before.skills[session.skill];
  assert.equal(session.gains[session.skill], Math.floor(expectedRate(session.skill, stat.xp, stat.level) * session.hours * session.xpScale));
  assert.equal(user.totalXP - before.totalXP, session.gainedXP);
  assert.equal(user.achievements.old, 123);
  const previous = user.totalXP;
  progressUser(user, date, { hours: 0, rng: () => 0.5 });
  assert.equal(user.totalXP, previous);
});

test("identical active sessions earn more XP in busy periods than overnight lulls", (t) => {
  t.mock.method(Math, "random", () => 0.999);
  const day = new Date("2026-10-26T00:00:00Z");
  const schedule = dailyXpSchedule(day);
  const indices = [schedule.scales.indexOf(schedule.minScale), schedule.scales.indexOf(schedule.maxScale)];
  const sessions = indices.map(index => {
    const skills = Object.fromEntries(SKILLS.map(skill => [skill, { xp: xpForLevel(80), level: 80 }]));
    const user = { username: "Test", skills, totalXP: totalXP(skills), totalLevel: totalLevel(skills), archetype: "CASUAL", achievements: {} };
    progressUser(user, new Date(day.getTime() + (index + 1) * 15 * 60_000), { rng: () => 0.5 });
    return user.progress.lastSession;
  });
  assert.equal(sessions[0].skill, sessions[1].skill);
  assert.equal(sessions[0].hours, sessions[1].hours);
  assert.ok(sessions[1].gainedXP > sessions[0].gainedXP * 2);
  assert.ok(Math.abs(sessions[1].gains[sessions[1].skill] / sessions[0].gains[sessions[0].skill] - schedule.maxScale / schedule.minScale) < 0.001);
});
