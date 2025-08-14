export const SKILLS = [
  'attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer', 'magic',
  'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking', 'crafting',
  'smithing', 'mining', 'herblore', 'agility', 'thieving', 'slayer', 'farming',
  'runecraft', 'hunter', 'construction'
];

export const PLAYER_ACTIVITY_TYPES = {
  INACTIVE: { xpRange: [0, 100] },
  BANK_STANDING: { xpRange: [100, 500] },
  CASUAL: { xpRange: [500, 3000] },
  FOCUSED: { xpRange: [3000, 12000] },
  HARDCORE: { xpRange: [12000, 50000] },
  GRINDING: { xpRange: [50000, 150000] },
  UNHEALTHY: { xpRange: [150000, 400000] }
};

export const PLAYER_ARCHETYPES = {
  IDLER: { weight: 15 },
  CASUAL: { weight: 45 },
  FOCUSED: { weight: 25 },
  HARDCORE: { weight: 10 },
  ELITE_GRINDER: { weight: 5 }
};

export const ARCHETYPE_TO_ACTIVITY_PROBABILITY = {
  IDLER: { INACTIVE: 60, BANK_STANDING: 30, CASUAL: 10, FOCUSED: 0, HARDCORE: 0, GRINDING: 0, UNHEALTHY: 0 },
  CASUAL: { INACTIVE: 20, BANK_STANDING: 40, CASUAL: 30, FOCUSED: 10, HARDCORE: 0, GRINDING: 0, UNHEALTHY: 0 },
  FOCUSED: { INACTIVE: 5, BANK_STANDING: 15, CASUAL: 40, FOCUSED: 35, HARDCORE: 5, GRINDING: 0, UNHEALTHY: 0 },
  HARDCORE: { INACTIVE: 1, BANK_STANDING: 4, CASUAL: 15, FOCUSED: 40, HARDCORE: 35, GRINDING: 5, UNHEALTHY: 0 },
  ELITE_GRINDER: { INACTIVE: 0, BANK_STANDING: 1, CASUAL: 4, FOCUSED: 20, HARDCORE: 40, GRINDING: 30, UNHEALTHY: 5 }
};

export const SKILL_POPULARITY = {
  attack: 1.1, defence: 1.0, strength: 1.15, hitpoints: 1.05, ranged: 1.05,
  prayer: 0.6, magic: 1.1, cooking: 0.9, woodcutting: 0.85, fletching: 0.75,
  fishing: 0.9, firemaking: 0.7, crafting: 0.65, smithing: 0.7, mining: 0.85,
  herblore: 0.55, agility: 0.6, thieving: 0.7, slayer: 0.8, farming: 0.6,
  runecraft: 0.4, hunter: 0.65, construction: 0.5
};
