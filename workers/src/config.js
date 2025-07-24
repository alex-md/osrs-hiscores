// src/config.js

export const SKILLS = [
    'Attack',
    'Defence',
    'Strength',
    'Hitpoints',
    'Ranged',
    'Prayer',
    'Magic',
    'Cooking',
    'Woodcutting',
    'Fletching',
    'Fishing',
    'Firemaking',
    'Crafting',
    'Smithing',
    'Mining',
    'Herblore',
    'Agility',
    'Thieving',
    'Slayer',
    'Farming',
    'Runecrafting',
    'Hunter',
    'Construction',
];
export const COMBAT_SKILLS = ['Attack', 'Strength', 'Defence', 'Ranged', 'Prayer', 'Magic', 'Hitpoints'];
export const NON_HP_COMBAT_SKILLS = ['Attack', 'Strength', 'Defence', 'Ranged', 'Prayer', 'Magic'];
export const WEEKEND_DAYS = [0, 6]; // 0 = Sun, 6 = Sat

export const PLAYER_ACTIVITY_TYPES = {
    INACTIVE: { probability: 0.30, xpRange: { min: 0, max: 1000 }, skillProbability: 0.15 },
    NEWBIE: { probability: 0.25, xpRange: { min: 1000, max: 5000 }, skillProbability: 0.25 },
    CASUAL: { probability: 0.40, xpRange: { min: 500, max: 15000 }, skillProbability: 0.40 },
    REGULAR: { probability: 0.20, xpRange: { min: 10000, max: 80000 }, skillProbability: 0.65 },
    SEMI_PRO: { probability: 0.10, xpRange: { min: 20000, max: 200000 }, skillProbability: 0.75 },
    PRO: { probability: 0.05, xpRange: { min: 20000, max: 300000 }, skillProbability: 0.75 },
    HARDCORE: { probability: 0.08, xpRange: { min: 50000, max: 400000 }, skillProbability: 0.85 },
    VETERAN: { probability: 0.04, xpRange: { min: 100000, max: 600000 }, skillProbability: 0.90 },
    ELITE: { probability: 0.02, xpRange: { min: 250000, max: 1200000 }, skillProbability: 0.95 },
    LEGEND: { probability: 0.01, xpRange: { min: 500000, max: 2000000 }, skillProbability: 0.98 },
};

export const SKILL_POPULARITY_WEIGHTS = {
    'Attack': 1.3, 'Strength': 1.4, 'Defence': 1.15, 'Ranged': 1.3, 'Magic': 1.15, 'Slayer': 1.25,
    'Hitpoints': 1.0, 'Woodcutting': 1.0, 'Fishing': 0.95, 'Mining': 0.9, 'Hunter': 0.7, 'Farming': 0.8, 'Cooking': 0.85, 'Thieving': 0.5,
    'Prayer': 0.6, 'Smithing': 0.6, 'Crafting': 0.7, 'Fletching': 0.65, 'Herblore': 0.55,
    'Runecrafting': 0.2, 'Construction': 0.2, 'Agility': 0.3, 'Firemaking': 0.4,
};

export const LEVEL_SCALING_FACTOR = 0.60; // 
export const GLOBAL_XP_MULTIPLIER = 1.4;
export const WEEKEND_BONUS_MULTIPLIER = 1.9;

// Cron Job Execution Tuning
export const MAX_USERS_PER_SCHEDULED_RUN = 50; // Maximum number of users processed in a single scheduled run
export const USERS_PER_BATCH = 10; // Number of users processed in each batch to balance performance and memory usage
export const BATCH_DELAY_MS = 5000; // Delay between batches to prevent overwhelming the KV store
export const LEADERBOARD_CACHE_TTL_MINUTES = 20; // Cache TTL for leaderboard data to reduce load on the KV store (in plain english: every 20 minutes, the leaderboard data is refreshed)

// REST API Configuration
export const REST_API_CONFIG = {
    // Enable REST API for bulk operations when credentials are available
    ENABLE_BULK_OPERATIONS: true,
    // Batch sizes for different operations
    BULK_GET_BATCH_SIZE: 100,    // REST API limit
    BULK_PUT_BATCH_SIZE: 5000,   // Conservative batch size (max 10,000)
    BULK_DELETE_BATCH_SIZE: 5000, // Conservative batch size (max 10,000)
    // TTL settings
    DEFAULT_USER_TTL_SECONDS: null, // No expiration by default
    LEADERBOARD_TTL_SECONDS: 3600,  // 1 hour
    TEMP_CACHE_TTL_SECONDS: 300,    // 5 minutes for temporary data
};

// Performance thresholds for deciding when to use bulk operations
export const PERFORMANCE_THRESHOLDS = {
    // Use bulk operations when processing more than this many items
    MIN_BULK_OPERATIONS_SIZE: 50,
    // Switch to REST API when KV binding performance degrades
    FALLBACK_TO_REST_API_THRESHOLD: 200,
};
