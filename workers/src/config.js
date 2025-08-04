// src/config.js

export const SKILLS = [
    'Attack', 'Defence', 'Strength', 'Hitpoints', 'Ranged', 'Prayer', 'Magic',
    'Cooking', 'Woodcutting', 'Fletching', 'Fishing', 'Firemaking', 'Crafting',
    'Smithing', 'Mining', 'Herblore', 'Agility', 'Thieving', 'Slayer',
    'Farming', 'Runecrafting', 'Hunter', 'Construction',
];
export const COMBAT_SKILLS = ['Attack', 'Strength', 'Defence', 'Ranged', 'Prayer', 'Magic', 'Hitpoints'];
export const NON_HP_COMBAT_SKILLS = ['Attack', 'Strength', 'Defence', 'Ranged', 'Prayer', 'Magic'];
export const WEEKEND_DAYS = [0, 6]; // 0 = Sun, 6 = Sat

<<<<<<< HEAD
// Player Play Style Configuration - Persistent once assigned
export const PLAYER_PLAY_STYLES = {
    // Ultra Casual - Very light players (15%)
    ULTRA_CASUAL: {
        baseWeight: 15,
        xpRange: { min: 50, max: 2000 },
        skillProbability: 0.15,
        description: "Logs in occasionally, very light progression"
    },

    // Casual - Regular casual players (25%)
    CASUAL: {
        baseWeight: 25,
        xpRange: { min: 500, max: 8000 },
        skillProbability: 0.35,
        description: "Casual players with moderate engagement"
    },

    // Moderate - Consistent players (20%)
    MODERATE: {
        baseWeight: 20,
        xpRange: { min: 3000, max: 18000 },
        skillProbability: 0.55,
        description: "Regular players with steady progression"
    },

    // Focused - Goal-oriented players (12%)
    FOCUSED: {
        baseWeight: 12,
        xpRange: { min: 8000, max: 35000 },
        skillProbability: 0.75,
        description: "Players focused on specific goals"
    },

    // Active - Dedicated players (10%)
    ACTIVE: {
        baseWeight: 10,
        xpRange: { min: 15000, max: 50000 },
        skillProbability: 0.85,
        description: "Very active with consistent play sessions"
    },

    // Enthusiast - Highly engaged players (8%)
    ENTHUSIAST: {
        baseWeight: 8,
        xpRange: { min: 25000, max: 75000 },
        skillProbability: 0.9,
        description: "Enthusiasts who play regularly and efficiently"
    },

    // Hardcore - Very dedicated players (5%)
    HARDCORE: {
        baseWeight: 5,
        xpRange: { min: 40000, max: 120000 },
        skillProbability: 0.95,
        description: "Hardcore players with intensive sessions"
    },

    // Elite - Top tier players (3%)
    ELITE: {
        baseWeight: 3,
        xpRange: { min: 80000, max: 200000 },
        skillProbability: 0.98,
        description: "Elite players with maximum efficiency"
    },

    // Specialist - Skill specialists (1.5%)
    SPECIALIST: {
        baseWeight: 1.5,
        xpRange: { min: 20000, max: 150000 },
        skillProbability: 0.4, // Lower overall, but will focus heavily on specific skills
        description: "Players who specialize in specific skills"
    },

    // No-Lifer - Extreme players (0.5%)
    NO_LIFER: {
        baseWeight: 0.5,
        xpRange: { min: 150000, max: 500000 },
        skillProbability: 0.99,
        description: "Players with extreme dedication and playtime"
    }
};

// Dynamic weight calculation for more realistic distribution
export function calculatePlayStyleWeights() {
    const now = new Date();
    const dayOfWeek = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const hour = now.getUTCHours();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isPeakHours = hour >= 18 && hour <= 23; // 6 PM to 11 PM UTC

    const weights = {};
    let totalWeight = 0;

    Object.entries(PLAYER_PLAY_STYLES).forEach(([style, config]) => {
        let weight = config.baseWeight;

        // Weekend adjustments - more active players on weekends
        if (isWeekend) {
            if (['ACTIVE', 'ENTHUSIAST', 'HARDCORE', 'ELITE'].includes(style)) {
                weight *= 1.3;
            } else if (['ULTRA_CASUAL', 'CASUAL'].includes(style)) {
                weight *= 0.8;
            }
        }

        // Peak hours adjustments
        if (isPeakHours) {
            if (['MODERATE', 'FOCUSED', 'ACTIVE'].includes(style)) {
                weight *= 1.2;
            }
        }

        // Random variance to add unpredictability (±20%)
        const variance = 0.8 + Math.random() * 0.4;
        weight *= variance;

        weights[style] = weight;
        totalWeight += weight;
    });

    // Normalize to probabilities
    Object.keys(weights).forEach(style => {
        weights[style] = weights[style] / totalWeight;
    });

    return weights;
}

// Legacy compatibility - map old PLAYER_ACTIVITY_TYPES to new system
export const PLAYER_ACTIVITY_TYPES = PLAYER_PLAY_STYLES;

=======
// Defines player behavior, XP potential, and specialization.
export const PLAYER_ARCHETYPES = {
    // Balanced players
    NEWBIE: { probability: 0.15, xpRange: { min: 100, max: 800 }, skillProbability: 0.30, focus: 'BALANCED' },
    CASUAL: { probability: 0.25, xpRange: { min: 50, max: 1500 }, skillProbability: 0.45, focus: 'BALANCED' },
    REGULAR: { probability: 0.20, xpRange: { min: 300, max: 3500 }, skillProbability: 0.70, focus: 'BALANCED' },
    DEDICATED: { probability: 0.10, xpRange: { min: 800, max: 8000 }, skillProbability: 0.80, focus: 'BALANCED' },
    HARDCORE: { probability: 0.08, xpRange: { min: 1500, max: 12000 }, skillProbability: 0.88, focus: 'BALANCED' },
    ELITE: { probability: 0.04, xpRange: { min: 3000, max: 18000 }, skillProbability: 0.95, focus: 'BALANCED' },
    LEGEND: { probability: 0.02, xpRange: { min: 5000, max: 25000 }, skillProbability: 0.98, focus: 'BALANCED' },

    // Specialized players
    SKILLER: { probability: 0.05, xpRange: { min: 1000, max: 10000 }, skillProbability: 0.85, focus: 'SKILLING' },
    PVP_ACCOUNT: { probability: 0.05, xpRange: { min: 1200, max: 12000 }, skillProbability: 0.85, focus: 'PVP' },

    // Temporary states
    INACTIVE: { probability: 0.05, xpRange: { min: 0, max: 500 }, skillProbability: 0.10, focus: 'NONE' },
    BURNOUT: { probability: 0.01, xpRange: { min: 100, max: 2000 }, skillProbability: 0.15, focus: 'NONE' },
};

// Weights to direct XP gains for specialized player archetypes.
export const SKILL_FOCUS_WEIGHTS = {
    BALANCED: { /* All skills use default popularity */ },
    SKILLING: {
        'Attack': 0.01, 'Strength': 0.01, 'Defence': 0.01, 'Ranged': 0.1, 'Prayer': 0.2, 'Magic': 0.2, 'Hitpoints': 0,
        'Woodcutting': 1.5, 'Fishing': 1.5, 'Mining': 1.4, 'Hunter': 1.3, 'Farming': 1.3, 'Cooking': 1.2, 'Thieving': 1.2,
        'Smithing': 1.1, 'Crafting': 1.1, 'Fletching': 1.1, 'Herblore': 1.0,
        'Runecrafting': 1.0, 'Construction': 1.0, 'Agility': 1.0, 'Firemaking': 1.0, 'Slayer': 0.1,
    },
    PVP: {
        'Attack': 1.8, 'Strength': 1.8, 'Defence': 1.5, 'Ranged': 1.7, 'Magic': 1.7, 'Prayer': 1.4, 'Hitpoints': 1.5,
        'Slayer': 0.5, 'Woodcutting': 0.3, 'Fishing': 0.3, 'Mining': 0.2, 'Hunter': 0.2, 'Farming': 0.1, 'Cooking': 0.4,
        'Thieving': 0.4, 'Smithing': 0.2, 'Crafting': 0.2, 'Fletching': 0.3, 'Herblore': 0.5,
        'Runecrafting': 0.1, 'Construction': 0.1, 'Agility': 0.5, 'Firemaking': 0.1,
    }
};

// Popularity weights for skills, influencing how often they are trained by 'BALANCED' players.
>>>>>>> 567072c8f0081405ddd4047ce5fe0fb188a9c3a0
export const SKILL_POPULARITY_WEIGHTS = {
    // Combat skills - Most popular overall
    'Attack': 1.4, 'Strength': 1.5, 'Defence': 1.2, 'Ranged': 1.4, 'Magic': 1.2, 'Slayer': 1.3,
    'Hitpoints': 1.0, // Calculated automatically

    // Gathering skills - Moderately popular
    'Woodcutting': 1.1, 'Fishing': 1.0, 'Mining': 0.95, 'Hunter': 0.75,

    // Production skills - Variable popularity
    'Cooking': 0.9, 'Smithing': 0.65, 'Crafting': 0.75, 'Fletching': 0.7, 'Herblore': 0.6,

    // Support skills - Lower popularity but essential
    'Prayer': 0.65, 'Farming': 0.85,

    // High-effort skills - Least popular
    'Runecrafting': 0.25, 'Construction': 0.3, 'Agility': 0.35, 'Thieving': 0.55, 'Firemaking': 0.45,
};

<<<<<<< HEAD
// Specialist skill preferences - used when playStyle is SPECIALIST
export const SPECIALIST_SKILL_FOCUS = {
    'Combat Specialist': ['Attack', 'Strength', 'Defence', 'Ranged', 'Magic', 'Slayer'],
    'Skiller Specialist': ['Woodcutting', 'Fishing', 'Mining', 'Hunter', 'Farming'],
    'Artisan Specialist': ['Cooking', 'Smithing', 'Crafting', 'Fletching', 'Herblore', 'Construction'],
    'Efficiency Specialist': ['Runecrafting', 'Agility', 'Thieving', 'Prayer'],
    'Gatherer Specialist': ['Woodcutting', 'Fishing', 'Mining', 'Hunter'],
    'Producer Specialist': ['Cooking', 'Smithing', 'Crafting', 'Fletching'],
    'Elite Specialist': ['Runecrafting', 'Construction', 'Agility'], // Most challenging skills
};

// Function to get specialist focus for a user
export function getSpecialistFocus(username) {
    // Use username hash to consistently assign specialist type
    const hash = username.split('').reduce((a, b) => {
        a = ((a << 5) - a) + b.charCodeAt(0);
        return a & a;
    }, 0);

    const specialistTypes = Object.keys(SPECIALIST_SKILL_FOCUS);
    const index = Math.abs(hash) % specialistTypes.length;
    return specialistTypes[index];
}

export const LEVEL_SCALING_FACTOR = 0.60;
export const GLOBAL_XP_MULTIPLIER = 1.4;
export const WEEKEND_BONUS_MULTIPLIER = 1.9;
=======
// Dynamic world events to create variety and competition.
export const WORLD_EVENTS = {
    NONE: { multiplier: 1.0, message: "The world is calm.", durationHours: 24 },
    XP_BONUS_WEEKEND: {
        multiplier: 1.5,
        message: "It's a bonus XP weekend! All skills gain 50% more XP.",
        skill: 'all',
        durationHours: 24, // Will be re-triggered each day of the weekend
    },
    SKILL_OF_THE_WEEK: {
        multiplier: 2.0,
        message: (skill) => `This week's featured skill is ${skill}! All ${skill} XP is doubled.`,
        skill: null, // will be set dynamically
        durationHours: 7 * 24,
    },
    CLAN_WARS_TOURNAMENT: {
        multiplier: 1.8,
        message: "A Clan Wars tournament is underway! Combat skills are favored.",
        skill: 'combat',
        durationHours: 48,
    },
    WILDERNESS_LOOT_BONANZA: {
        multiplier: 2.2,
        message: "A treasure bonanza in the Wilderness! Thieving and Slayer are highly rewarding.",
        skill: 'wildy', // Special key for hiscores service to handle
        durationHours: 36,
    }
};

export const LEVEL_SCALING_FACTOR = 0.65; // Increased slightly for more impact at higher levels
export const GLOBAL_XP_MULTIPLIER = 1.6; // Increased for fiercer competition
export const WEEKEND_BONUS_MULTIPLIER = 1.2; // 20% bonus XP on weekends
>>>>>>> 567072c8f0081405ddd4047ce5fe0fb188a9c3a0

// Cron Job Execution Tuning
export const MAX_USERS_PER_SCHEDULED_RUN = 50;
export const USERS_PER_BATCH = 10;
export const BATCH_DELAY_MS = 5000;
export const LEADERBOARD_CACHE_TTL_MINUTES = 15; // Reduced for more frequent updates

// REST API Configuration
export const REST_API_CONFIG = {
    ENABLE_BULK_OPERATIONS: true,
    BULK_GET_BATCH_SIZE: 100,
    BULK_PUT_BATCH_SIZE: 5000,
    BULK_DELETE_BATCH_SIZE: 5000,
    DEFAULT_USER_TTL_SECONDS: null,
    LEADERBOARD_TTL_SECONDS: 2700,  // 45 minutes
    TEMP_CACHE_TTL_SECONDS: 300,
};

// Performance thresholds
export const PERFORMANCE_THRESHOLDS = {
    MIN_BULK_OPERATIONS_SIZE: 50,
    FALLBACK_TO_REST_API_THRESHOLD: 200,
};
