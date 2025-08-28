export const SKILLS = [
  'attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer', 'magic',
  'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking', 'crafting',
  'smithing', 'mining', 'herblore', 'agility', 'thieving', 'slayer', 'farming',
  'runecraft', 'hunter', 'construction'
];

// Units: total XP earned during the sampling window (your existing window length).
// Ranges are inclusive of the lower bound and exclusive of the upper bound.
export const PLAYER_ACTIVITY_TYPES = {
  INACTIVE: { xpRange: [0, 100] },
  BANK_STANDING: { xpRange: [100, 500] },
  CASUAL: { xpRange: [500, 3000] },
  FOCUSED: { xpRange: [3000, 12000] },
  HARDCORE: { xpRange: [12000, 50000] },
  GRINDING: { xpRange: [50000, 150000] },
  UNHEALTHY: { xpRange: [150000, 400000] }
};

// ———————————————————————————————————————————————————————————————
// Archetype sampling weights (rarer top tiers; slightly higher mid-tier for competition)
// Interpretation: non-normalized relative weights for RNG sampling.
// Keeping integers to match typical weighted-choice utilities you may be using.
export const PLAYER_ARCHETYPES = {
  // Light engagement / social
  IDLER: { weight: 8 },
  SOCIALITE: { weight: 6 },
  AFKER: { weight: 8 },
  // General play
  CASUAL: { weight: 24 },
  FOCUSED: { weight: 16 },
  // Specialists
  SKILLER: { weight: 6 },
  PVMER: { weight: 5 },
  IRON_SOUL: { weight: 2 },
  // Endgame (rarer but much stronger via ARCHETYPE_ADVANTAGE below)
  HARDCORE: { weight: 2 },
  EFFICIENT_MAXER: { weight: 1 },
  ELITE_GRINDER: { weight: 1 }
};

// ———————————————————————————————————————————————————————————————
// Activity distribution per archetype (must sum to 100).
// Higher tiers lean more aggressively into HARDCORE/GRINDING, amplifying “skill ceiling”
// while keeping UNHEALTHY rare and controlled.
export const ARCHETYPE_TO_ACTIVITY_PROBABILITY = {
  IDLER: { INACTIVE: 65, BANK_STANDING: 25, CASUAL: 10, FOCUSED: 0, HARDCORE: 0, GRINDING: 0, UNHEALTHY: 0 },
  SOCIALITE: { INACTIVE: 25, BANK_STANDING: 55, CASUAL: 15, FOCUSED: 5, HARDCORE: 0, GRINDING: 0, UNHEALTHY: 0 },
  AFKER: { INACTIVE: 10, BANK_STANDING: 35, CASUAL: 35, FOCUSED: 15, HARDCORE: 4, GRINDING: 1, UNHEALTHY: 0 },

  // General
  CASUAL: { INACTIVE: 15, BANK_STANDING: 30, CASUAL: 35, FOCUSED: 17, HARDCORE: 3, GRINDING: 0, UNHEALTHY: 0 },
  FOCUSED: { INACTIVE: 3, BANK_STANDING: 8, CASUAL: 32, FOCUSED: 42, HARDCORE: 12, GRINDING: 3, UNHEALTHY: 0 },

  // Specialists
  SKILLER: { INACTIVE: 2, BANK_STANDING: 8, CASUAL: 28, FOCUSED: 42, HARDCORE: 15, GRINDING: 5, UNHEALTHY: 0 },
  PVMER: { INACTIVE: 1, BANK_STANDING: 6, CASUAL: 14, FOCUSED: 34, HARDCORE: 30, GRINDING: 12, UNHEALTHY: 3 },
  IRON_SOUL: { INACTIVE: 1, BANK_STANDING: 6, CASUAL: 12, FOCUSED: 32, HARDCORE: 33, GRINDING: 14, UNHEALTHY: 2 },

  // Endgame
  HARDCORE: { INACTIVE: 0, BANK_STANDING: 3, CASUAL: 8, FOCUSED: 32, HARDCORE: 40, GRINDING: 15, UNHEALTHY: 2 },
  EFFICIENT_MAXER: { INACTIVE: 0, BANK_STANDING: 1, CASUAL: 3, FOCUSED: 16, HARDCORE: 42, GRINDING: 33, UNHEALTHY: 5 },
  ELITE_GRINDER: { INACTIVE: 0, BANK_STANDING: 1, CASUAL: 2, FOCUSED: 10, HARDCORE: 43, GRINDING: 39, UNHEALTHY: 5 }
};

// ———————————————————————————————————————————————————————————————
// Skill popularity (slightly sharpened to spotlight competitive metas).
// Interpretation: multiplicative popularity weights for RNG skill selection.
// Tip: normalize at call-site if your sampler expects normalized weights.
export const SKILL_POPULARITY = {
  attack: 1.24, defence: 1.06, strength: 1.30, hitpoints: 1.16, ranged: 1.20,
  prayer: 0.66, magic: 1.20, cooking: 1.06, woodcutting: 0.96, fletching: 0.94,
  fishing: 0.96, firemaking: 0.90, crafting: 0.84, smithing: 0.82, mining: 0.88,
  herblore: 0.78, agility: 0.68, thieving: 0.88, slayer: 1.30, farming: 0.86,
  runecraft: 0.70, hunter: 0.84, construction: 0.66
};

// export const SKILL_POPULARITY = {
//   attack: 1.1, defence: 1.0, strength: 1.15, hitpoints: 1.05, ranged: 1.05,
//   prayer: 0.6, magic: 1.1, cooking: 0.9, woodcutting: 0.85, fletching: 0.75,
//   fishing: 0.9, firemaking: 0.7, crafting: 0.65, smithing: 0.7, mining: 0.85,
//   herblore: 0.55, agility: 0.6, thieving: 0.7, slayer: 0.8, farming: 0.6,
//   runecraft: 0.4, hunter: 0.65, construction: 0.5
// };
