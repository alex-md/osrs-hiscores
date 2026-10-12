import calibration from "../data/calibration.json" with { type: "json" };
import {
  SKILL_POPULARITY,
  INITIAL_DISTRIBUTION_ARCHETYPE_FOCUS,
} from "./constants.js";

export const XP_SCALE = 3.5;
export const TICK_HOURS = 4;
export const SESSION_FRACTIONS = {
  INACTIVE: [0, 0],
  BANK_STANDING: [0, 0.01],
  CASUAL: [0.03, 0.15],
  FOCUSED: [0.15, 0.35],
  HARDCORE: [0.35, 0.65],
  GRINDING: [0.65, 0.9],
  UNHEALTHY: [0.9, 1],
};
// Design estimates cap composite/zero-time EHP methods and expensive endgame methods.
// These are ordinary high-level training ceilings BEFORE the 3.5x world scale.
export const ORDINARY_CEILINGS = {
  attack: 85000,
  strength: 95000,
  defence: 85000,
  hitpoints: 30000,
  ranged: 180000,
  magic: 140000,
  prayer: 350000,
  cooking: 280000,
  woodcutting: 80000,
  fletching: 250000,
  fishing: 60000,
  firemaking: 200000,
  crafting: 260000,
  smithing: 170000,
  mining: 60000,
  herblore: 220000,
  agility: 60000,
  thieving: 150000,
  slayer: 45000,
  farming: 120000,
  runecraft: 55000,
  hunter: 130000,
  construction: 350000,
};
export function expectedRate(skill, xp, level) {
  const ceiling = ORDINARY_CEILINGS[skill];
  const methods = calibration.methods[skill];
  const method = methods?.filter((m) => m.startExp <= xp).at(-1);
  // Level scaling prevents EHP methods with no unlock breakpoint being available at level 1.
  const unlocked =
    ceiling * (0.12 + 0.88 * Math.pow(Math.min(99, level) / 99, 1.5));
  return Math.round(Math.min(unlocked, method ? method.rate * 0.7 : unlocked));
}
export function preferenceWeight(skill, user) {
  const participation = calibration.participation[skill] || 0;
  const focused =
    INITIAL_DISTRIBUTION_ARCHETYPE_FOCUS[user.archetype]?.includes(skill);
  return (
    SKILL_POPULARITY[skill] *
    (0.85 + 0.3 * participation) *
    (focused ? 1.8 : 1) *
    (user.multipliers?.perSkill?.[skill] || 1)
  );
}
export function chooseTrainingSkill(user, rng = Math.random) {
  const entries = Object.entries(user.skills).filter(
    ([s, v]) => s !== "hitpoints" && v.xp < 200000000,
  );
  const weights = entries.map(([s]) => preferenceWeight(s, user));
  let pick = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < entries.length; i++) {
    pick -= weights[i];
    if (pick < 0) return entries[i][0];
  }
  return entries.at(-1)?.[0];
}
export const trainingInfo = () => ({
  scale: XP_SCALE,
  tickHours: TICK_HOURS,
  calibratedAt: calibration.fetchedAt,
  sampleSize: calibration.samples.length,
  source: "Wise Old Man",
  caveat: calibration.caveat,
});
