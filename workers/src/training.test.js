import test from "node:test";
import assert from "node:assert/strict";
import { SKILLS } from "./constants.js";
import {
  expectedRate,
  preferenceWeight,
  XP_SCALE,
  trainingInfo,
} from "./training.js";
import { progressUser } from "./simulation.js";
import { xpForLevel, totalXP, totalLevel } from "./utils.js";
import { evaluateAchievements } from "./achievements.js";
import { catalog } from "../../frontend/lib/catalog.js";
function player(level = 80) {
  const skills = Object.fromEntries(
    SKILLS.map((s) => [s, { xp: xpForLevel(level), level }]),
  );
  return {
    username: "Test",
    skills,
    totalXP: totalXP(skills),
    totalLevel: totalLevel(skills),
    archetype: "CASUAL",
    achievements: {},
  };
}
test("all skills have finite rates; slow skills and low-level unlocks stay slower before the variable world scale", () => {
  assert.equal(XP_SCALE, 18.5);
  assert.ok(trainingInfo().sampleSize > 0);
  for (const s of SKILLS) {
    assert.ok(expectedRate(s, 0, 1) > 0);
    assert.ok(expectedRate(s, 0, 1) < expectedRate(s, 13034431, 99));
  }
  assert.ok(
    expectedRate("runecraft", 13034431, 99) <
      expectedRate("cooking", 13034431, 99) / 3,
  );
  assert.ok(
    expectedRate("agility", 13034431, 99) <
      expectedRate("construction", 13034431, 99) / 3,
  );
  assert.ok(
    preferenceWeight("runecraft", player()) <
      preferenceWeight("strength", player()),
  );
  assert.ok(
    preferenceWeight("agility", player()) <
      preferenceWeight("slayer", player()),
  );
});
test("inactive sessions gain nothing; active sessions obey window, cap and preserve history", (t) => {
  const u = player();
  u.achievements.old = 123;
  const before = u.totalXP;
  t.mock.method(Math, "random", () => 0);
  progressUser(u);
  assert.equal(u.totalXP, before);
  assert.equal(u.progress, undefined);
  t.mock.method(Math, "random", () => 0.999);
  progressUser(u, new Date("2026-10-12T12:00:00Z"), {
    hours: 200,
    rng: () => 0.5,
  });
  assert.ok(u.progress.lastSession.hours <= 0.25);
  assert.ok(u.totalXP > before);
  assert.equal(u.progress.earnedXP, u.totalXP - before);
  assert.equal(u.achievements.old, 123);
  assert.ok(SKILLS.every((s) => u.skills[s].xp <= 200000000));
  const saved = u.totalXP;
  progressUser(u, new Date(), { hours: 0, rng: () => 0.5 });
  assert.equal(u.totalXP, saved);
});
test("session records reset UTC daily XP and unlock catalog-backed milestones", (t) => {
  t.mock.method(Math, "random", () => 0.999);
  const u = player(99);
  u.progress = { day: "2026-10-11", dayXP: 9000000, sessions: 99 };
  progressUser(u, new Date("2026-10-12T12:00:00Z"), { rng: () => 0.5 });
  assert.equal(u.progress.sessions, 100);
  assert.equal(u.progress.dayXP, u.progress.lastSession.gainedXP);
  const unlocked = evaluateAchievements(u);
  for (const key of [
    "first-session",
    "hundred-sessions",
    "base-70",
    "patient-master",
  ]) {
    assert.ok(unlocked.has(key));
    assert.ok(
      catalog().some(
        (a) => a.key === key && !a.description.startsWith("A recorded"),
      ),
    );
  }
});

test("Pages-compatible calibration module stays aligned with the source observations", async () => {
  const { readFile } = await import("node:fs/promises");
  const { default: runtime } = await import("../data/calibration.js");
  const data = JSON.parse(
    await readFile(
      new URL("../data/calibration.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(runtime.methods, data.methods);
  assert.deepEqual(runtime.participation, data.participation);
  assert.equal(runtime.sampleSize, data.samples.length);
  assert.equal(runtime.fetchedAt, data.fetchedAt);
  assert.equal(runtime.caveat, data.caveat);
});

test("shorter simulation windows scale gains by elapsed time", (t) => {
  t.mock.method(Math, "random", () => 0.999);
  const full = player(), short = player();
  const date = new Date("2026-10-20T12:00:00Z");
  progressUser(full, date, { hours: 0.25, rng: () => 0.5 });
  progressUser(short, date, { hours: 0.125, rng: () => 0.5 });
  assert.ok(Math.abs(full.progress.lastSession.gainedXP - 2 * short.progress.lastSession.gainedXP) <= 2);
  assert.ok(full.progress.lastSession.hours <= 0.25);
});
