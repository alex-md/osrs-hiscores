// src/config.js

export const SKILLS = ['Attack', 'Strength', 'Defence', 'Ranged', 'Prayer', 'Magic', 'Runecrafting', 'Construction', 'Hitpoints', 'Agility', 'Herblore', 'Thieving', 'Crafting', 'Fletching', 'Slayer', 'Hunter', 'Mining', 'Smithing', 'Fishing', 'Cooking', 'Firemaking', 'Woodcutting', 'Farming'];
export const COMBAT_SKILLS = ['Attack', 'Strength', 'Defence', 'Ranged'];
export const WEEKEND_DAYS = [0, 6]; // 0 = Sun, 6 = Sat

export const PLAYER_ACTIVITY_TYPES = {
    INACTIVE: { probability: 0.30, xpRange: { min: 0, max: 1000 }, skillProbability: 0.15 },
    CASUAL: { probability: 0.40, xpRange: { min: 500, max: 15000 }, skillProbability: 0.40 },
    REGULAR: { probability: 0.20, xpRange: { min: 10000, max: 80000 }, skillProbability: 0.65 },
    HARDCORE: { probability: 0.08, xpRange: { min: 50000, max: 400000 }, skillProbability: 0.85 },
    ELITE: { probability: 0.02, xpRange: { min: 250000, max: 1200000 }, skillProbability: 0.95 }
};

export const SKILL_POPULARITY_WEIGHTS = {
    'Attack': 1.3, 'Strength': 1.4, 'Defence': 1.15, 'Ranged': 1.3, 'Magic': 1.15, 'Slayer': 1.25,
    'Hitpoints': 1.0, 'Woodcutting': 1.0, 'Fishing': 0.95, 'Mining': 0.9, 'Hunter': 0.7, 'Farming': 0.8, 'Cooking': 0.85, 'Thieving': 0.5,
    'Prayer': 0.6, 'Smithing': 0.6, 'Crafting': 0.7, 'Fletching': 0.65, 'Herblore': 0.55,
    'Runecrafting': 0.2, 'Construction': 0.2, 'Agility': 0.3, 'Firemaking': 0.4,
};

export const LEVEL_SCALING_FACTOR = 0.60;
export const GLOBAL_XP_MULTIPLIER = 1.1;
export const WEEKEND_BONUS_MULTIPLIER = 1.5;

// Cron Job Execution Tuning
export const MAX_USERS_PER_SCHEDULED_RUN = 100;
export const USERS_PER_BATCH = 50;
export const BATCH_DELAY_MS = 100;
export const LEADERBOARD_CACHE_TTL_MINUTES = 30;
