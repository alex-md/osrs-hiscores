import { archetypePolicy, careerPhase } from './archetypes.js';
import { ARCHETYPE_TO_ACTIVITY_PROBABILITY, XP_GAIN_TIER_ACTIVITY_WEIGHTS } from './constants.js';

const bands = ['INACTIVE', 'BANK_STANDING', 'CASUAL', 'FOCUSED', 'HARDCORE', 'GRINDING', 'UNHEALTHY'];
// Tier influences opportunity; personality and dedication continue to matter at 200M.
export function activityWeights(archetype, tier, dedication = .5) {
  const personal = ARCHETYPE_TO_ACTIVITY_PROBABILITY[archetypePolicy(archetype).activity || archetype] || ARCHETYPE_TO_ACTIVITY_PROBABILITY.CASUAL;
  const experience = XP_GAIN_TIER_ACTIVITY_WEIGHTS[tier] || personal;
  return Object.fromEntries(bands.map((band, i) => [band,
    (.8 * personal[band] + .2 * experience[band] + (i === 0 ? 2 : 0)) *
    Math.exp((Math.max(.05, Math.min(.95, dedication)) - .5) * (i - 2) * .65),
  ]));
}
export function isRestDay(user, date) {
  // Date-seeded personal holidays last a full UTC day and survive retries/renames.
  if (!user.createdAt || +date - user.createdAt < 2 * 86400000) return false;
  if (careerPhase(user,date) === "away") return true;
  const c = user.career;
  let hash = 2166136261;
  for (const char of `${c.aptitude}:${c.dedication}:${c.favoriteBoss}:${date.toISOString().slice(0,10)}`)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const chance = .015 + (1 - c.dedication) * .075 + (user.archetype === 'IDLER' ? .06 : 0);
  return (hash >>> 0) / 2 ** 32 < chance;
}
