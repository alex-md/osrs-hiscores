import { skillingItem, priceOf, costIndex } from './market.js';
import { archetypePolicy } from './archetypes.js';
import { TICK_HOURS, UPDATE_MINUTES, MAX_PLAYERS } from "../../frontend/lib/simulation-config.js";
export { TICK_HOURS };
import calibration from "../data/calibration.js";
import {
  SKILL_POPULARITY,
  INITIAL_DISTRIBUTION_ARCHETYPE_FOCUS,
} from "./constants.js";

import { xpModifier, dailyXpSchedule, MIN_XP_SCALE, MAX_XP_SCALE } from "./xp-schedule.js";
export { XP_SCALE } from "./xp-schedule.js";
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
// These are ordinary high-level training ceilings BEFORE the time-of-day world scale.
import { gameTrainingCeilings as ORDINARY_CEILINGS } from '../../frontend/lib/game-content.js';
export { ORDINARY_CEILINGS };
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
export function chooseTrainingSkill(user, rng = Math.random, { climate, market } = {}) {
  const entries = Object.entries(user.skills).filter(
    ([s, v]) => s !== "hitpoints" && v.xp < 200000000,
  );
  const weights = entries.map(([s]) => {
    const level = user.skills[s].level;
    const policy = archetypePolicy(user.archetype);
    const maxer = user.archetype === "EFFICIENT_MAXER";
    const skiller = user.archetype === "SKILLER";
    const combat = ["attack", "defence", "strength", "ranged", "magic", "prayer", "slayer"].includes(s);
    // Finish the cape before chasing post-99 records. Specialists keep their grinds.
    const completion = maxer ? (level < 99 ? 5 + (99 - level) / 8 : .08) : 1;
    const completionist = policy.completion ? (level < 99 ? policy.completion * (1 + (99-level)/40) : .3) : 1;
    const specialty = policy.specialty ? (s === user.career?.specialty ? 30 : .12) : 1;
    const rank = user.ranks?.[s];
    const crown = policy.crowns && rank ? rank === 1 ? .4 : 1 + 12 / Math.sqrt(rank) : 1;
    const output = skillingItem(s, level);
    const priceRatio = output ? priceOf(market, output) / Math.max(1, priceOf(null, output)) : 1;
    const response = policy.collection || policy.completion || policy.specialty ? 1 : Math.max(.5, Math.min(2, (priceRatio / costIndex(s, market)) ** (user.career?.thrift || .5)));
    return response * preferenceWeight(s, user) * completionist * specialty * crown * completion * (skiller && combat ? .04 : 1) * (climate?.focusSkill === s ? 4 : 1);
  });
  let pick = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < entries.length; i++) {
    pick -= weights[i];
    if (pick < 0) return entries[i][0];
  }
  return entries.at(-1)?.[0];
}
export const trainingInfo = (date = new Date(), climate = null) => ({
  ...xpModifier(date),
  scale: Math.max(MIN_XP_SCALE, Math.min(MAX_XP_SCALE, xpModifier(date).scale * (climate?.factor || 1))),
  climate,
  schedule: dailyXpSchedule(date),
  tickHours: TICK_HOURS,
  updateMinutes: UPDATE_MINUTES,
  maxPlayers: MAX_PLAYERS,
  calibratedAt: calibration.fetchedAt,
  sampleSize: calibration.sampleSize,
  source: "Wise Old Man",
  estimatedSkills: ["sailing"],
  caveat: calibration.caveat,
});
