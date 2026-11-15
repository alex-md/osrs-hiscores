import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS } from './constants.js';
import { distributeInitialXP, DAMAGE_SKILLS, repairCombatProgression, levelFromXp } from './utils.js';
import { newUser } from './simulation.js';
const combatXP = skills => DAMAGE_SKILLS.reduce((n, s) => n + skills[s].xp - 1, 0);
const rngFor = seed => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);

test('initial budgets support Slayer with damage XP across seeds and account sizes', () => {
  for (const budget of [10000, 400000, 4000000, 20000000, 55000000]) {
    for (let seed = 1; seed <= 300; seed++) {
      const xp = distributeInitialXP(budget, rngFor(seed));
      assert.equal(Object.values(xp).reduce((a, b) => a + b, 0), budget);
      assert.ok(Object.values(xp).every(n => n >= 1 && n <= 10000000));
      const combat = DAMAGE_SKILLS.reduce((n, s) => n + xp[s] - 1, 0);
      assert.ok(combat >= 4 * (xp.slayer - 1));
    }
  }
});

test('legacy level-three Slayer account receives an audited, idempotent repair', () => {
  const skills = Object.fromEntries(SKILLS.map(s => [s, { xp: s === 'hitpoints' ? 1154 : 1, level: s === 'hitpoints' ? 10 : 1 }]));
  skills.slayer = { xp: 92126, level: 49 };
  skills.herblore = { xp: 136812, level: 53 };
  const user = { skills };
  repairCombatProgression(user, new Date('2026-11-15T00:00:00Z'));
  assert.equal(skills.slayer.xp, 92126);
  assert.equal(skills.herblore.xp, 136812);
  assert.equal(combatXP(skills), 4 * 92125);
  assert.equal(skills.hitpoints.xp, 1154 + Math.floor(combatXP(skills) / 3));
  assert.ok(user.progressionRepair.gains.hitpoints > 0);
  const before = JSON.stringify(user);
  repairCombatProgression(user);
  assert.equal(JSON.stringify(user), before);
});

test('new accounts start with coherent HP, Slayer and derived totals', () => {
  for (let i = 0; i < 300; i++) {
    const user = newUser(`integrity-${i}`);
    assert.ok(combatXP(user.skills) >= 4 * (user.skills.slayer.xp - 1));
    assert.equal(user.skills.hitpoints.xp, 1154 + Math.floor(combatXP(user.skills) / 3));
    assert.equal(user.skills.hitpoints.level, levelFromXp(user.skills.hitpoints.xp));
    assert.equal(user.totalXP, Object.values(user.skills).reduce((n, s) => n + s.xp, 0));
    assert.equal(user.progressionRulesVersion, 1);
  }
});

test('Slayer sessions earn damage and HP from the same kills at a combat-limited rate', async t => {
  const { normalizeUser } = await import('./store.js');
  const { progressUser } = await import('./simulation.js');
  const { expectedRate } = await import('./training.js');
  t.mock.method(Math, 'random', () => .999);
  const user = normalizeUser({ username: 'Slayer-session', archetype: 'CASUAL', progressionRulesVersion: 1,
    skills: Object.fromEntries(SKILLS.map(s => [s, { xp: s === 'hitpoints' ? 1154 : 1 }])),
    trainingState: { focusSkill: 'slayer', targetXP: 200000000, remaining: 10, phase: 'steady', phaseRemaining: 10, fatigue: 0, aptitude: 1, momentum: 1 } });
  progressUser(user, new Date('2026-10-24T00:07:30Z'), { rng: () => .5 });
  const session = user.progress.lastSession;
  const slayer = session.gains.slayer;
  assert.ok(slayer > 0);
  assert.equal(session.gains.defence, slayer * 4);
  assert.equal(session.gains.hitpoints, Math.floor(slayer * 4 / 3));
  assert.ok(slayer <= Math.floor(expectedRate('defence', 1, 1) / 4 * session.trainingHours * session.xpScale * session.personalScale * session.skillScale * session.wealthScale));
});
