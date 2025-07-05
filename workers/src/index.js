// osrs-hiscores-clone/workers/src/index.js

/**
 * OSRS Hiscores Cloudflare Worker
 * 
 * This worker provides an API for OSRS hiscores data and includes a scheduled
 * cron job that updates player XP and creates new random users.

// =================================================================
// KV HELPER FUNCTIONS
// =================================================================

/**
 * Retrieves a user's data from the KV store.
 * @param {object} env - The worker environment containing the KV namespace.
 * @param {string} username - The username to look up.
 * @returns {Promise<object|null>} The user data object or null if not found.
 */
async function getUser(env, username) {
    if (!username) return null;
    const key = username.toLowerCase();
    return await env.HISCORES_KV.get(key, 'json');
}

/**
 * Saves a user's data to the KV store.
 * @param {object} env - The worker environment containing the KV namespace.
 * @param {string} username - The username to save the data under.
 * @param {object} data - The user data object to store.
 * @returns {Promise<void>}
 */
async function putUser(env, username, data) {
    const key = username.toLowerCase();
    await env.HISCORES_KV.put(key, JSON.stringify(data));
}

/**
 * Lists all keys (usernames) currently in the KV store.
 * @param {object} env - The worker environment containing the KV namespace.
 * @returns {Promise<object>} The result of the KV list operation.
 */
async function listUsers(env) {
    return await env.HISCORES_KV.list();
}

// =================================================================
// DATA GENERATION FUNCTIONS
// =================================================================

/**
 * List of all 23 skills in Old School RuneScape.
 */
const SKILLS = [
    'Attack', 'Strength', 'Defence', 'Ranged', 'Prayer', 'Magic',
    'Runecrafting', 'Construction', 'Hitpoints', 'Agility', 'Herblore',
    'Thieving', 'Crafting', 'Fletching', 'Slayer', 'Hunter',
    'Mining', 'Smithing', 'Fishing', 'Cooking', 'Firemaking',
    'Woodcutting', 'Farming'
];

/**
 * Player activity types with different XP gain patterns.
 * Each type has different probabilities and XP ranges.
 */
const PLAYER_ACTIVITY_TYPES = {
    // Inactive players (40% chance) - minimal XP gains
    INACTIVE: {
        probability: 0.40,
        xpRange: { min: 0, max: 500 },
        skillProbability: 0.15 // 15% chance to gain XP in any given skill
    },
    // Casual players (35% chance) - moderate XP gains
    CASUAL: {
        probability: 0.35,
        xpRange: { min: 100, max: 3000 },
        skillProbability: 0.30 // 30% chance to gain XP in any given skill
    },
    // Regular players (20% chance) - good XP gains
    REGULAR: {
        probability: 0.20,
        xpRange: { min: 500, max: 8000 },
        skillProbability: 0.50 // 50% chance to gain XP in any given skill
    },
    // Hardcore players (4% chance) - high XP gains
    HARDCORE: {
        probability: 0.04,
        xpRange: { min: 2000, max: 25000 },
        skillProbability: 0.70 // 70% chance to gain XP in any given skill
    },
    // Elite players (1% chance) - extreme XP gains
    ELITE: {
        probability: 0.01,
        xpRange: { min: 10000, max: 100000 },
        skillProbability: 0.85 // 85% chance to gain XP in any given skill
    }
};

/**
 * Skill popularity weights - some skills are trained more frequently than others.
 * Higher values mean more likely to be trained.
 */
const SKILL_POPULARITY_WEIGHTS = {
    // Combat skills (most popular)
    'Attack': 1.2,
    'Strength': 1.3,
    'Defence': 1.1,
    'Ranged': 1.25,
    'Magic': 1.15,
    'Hitpoints': 1.0, // Calculated separately
    'Prayer': 0.6,
    'Slayer': 1.1,

    // Gathering skills (popular)
    'Woodcutting': 1.0,
    'Fishing': 0.95,
    'Mining': 0.9,
    'Hunter': 0.7,
    'Farming': 0.8,

    // Artisan skills (moderate popularity)
    'Cooking': 0.85,
    'Firemaking': 0.4,
    'Smithing': 0.6,
    'Crafting': 0.7,
    'Fletching': 0.65,

    // Specialist skills (less popular)
    'Runecrafting': 0.3,
    'Construction': 0.25,
    'Agility': 0.35,
    'Herblore': 0.5,
    'Thieving': 0.45
};

/**
 * Determines a player's activity type based on weighted probabilities.
 * @returns {string} The activity type key
 */
function getPlayerActivityType() {
    const random = Math.random();
    let cumulativeProbability = 0;

    for (const [activityType, config] of Object.entries(PLAYER_ACTIVITY_TYPES)) {
        cumulativeProbability += config.probability;
        if (random <= cumulativeProbability) {
            return activityType;
        }
    }

    // Fallback to CASUAL if something goes wrong
    return 'CASUAL';
}

/**
 * Generates weighted random XP gain for a player based on their activity type.
 * @param {string} activityType - The player's activity type
 * @param {string} skillName - The skill being trained
 * @returns {number} The XP gained (0 if no training occurred)
 */
function generateWeightedXpGain(activityType, skillName) {
    const activityConfig = PLAYER_ACTIVITY_TYPES[activityType];
    const skillWeight = SKILL_POPULARITY_WEIGHTS[skillName] || 1.0;

    // Determine if this skill gets trained this update
    const adjustedSkillProbability = activityConfig.skillProbability * skillWeight;
    if (Math.random() > adjustedSkillProbability) {
        return 0; // No XP gain for this skill
    }

    // Generate base XP within the activity type's range
    const baseXp = Math.floor(
        Math.random() * (activityConfig.xpRange.max - activityConfig.xpRange.min + 1) +
        activityConfig.xpRange.min
    );

    // Apply skill-specific multiplier for final XP
    const finalXp = Math.floor(baseXp * skillWeight);

    return Math.max(0, finalXp);
}

/**
 * Calculates statistics about XP gains for logging purposes.
 * @param {Object} xpGains - Object mapping skill names to XP gained
 * @returns {Object} Statistics about the XP gains
 */
function calculateXpGainStats(xpGains) {
    const gains = Object.values(xpGains).filter(xp => xp > 0);
    if (gains.length === 0) {
        return { totalXp: 0, skillsUpdated: 0, averageXp: 0, maxXp: 0 };
    }

    const totalXp = gains.reduce((sum, xp) => sum + xp, 0);
    const maxXp = Math.max(...gains);
    const averageXp = Math.floor(totalXp / gains.length);

    return {
        totalXp,
        skillsUpdated: gains.length,
        averageXp,
        maxXp
    };
}

// Username generation components
const ADJECTIVES = [
    'Brisk', 'Luminous', 'Gritty', 'Mellow', 'Jagged', 'Sleek', 'Timid', 'Radiant',
    'Murky', 'Zesty', 'Brittle', 'Plush', 'Gaudy', 'Nimble', 'Rustic', 'Feeble',
    'Vibrant', 'Hasty', 'Serene', 'Grimy', 'Quirky', 'Blunt', 'Lavish', 'Eerie',
    'Crisp', 'Fuzzy', 'Dainty', 'Rugged', 'Glossy', 'Mellow'
];

const NOUNS = [
    'Lantern', 'Canyon', 'Whisper', 'Glacier', 'Compass', 'Meadow', 'Relic', 'Ember',
    'Turret', 'Prism', 'Orchard', 'Talon', 'Scroll', 'Anchor', 'Forge', 'Ripple',
    'Beacon', 'Thicket', 'Vault', 'Spindle', 'Chalice', 'Gust', 'Tapestry', 'Quarry',
    'Bramble', 'Silo', 'Perch', 'Rune', 'Vessel', 'Grove'
];

/**
 * Generates a random, OSRS-style username.
 * Note: This does not guarantee uniqueness on its own. The caller must verify.
 * @returns {string} A randomly generated username.
 */
function generateRandomUsername() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num = Math.floor(Math.random() * 999) + 1;
    return `${adj}_${noun}_${num}`;
}

/**
 * Calculates the OSRS level for a given amount of XP.
 * The formula is a standard, well-known progression.
 * @param {number} xp - The total experience points in a skill.
 * @returns {number} The calculated level (1-99).
 */
function xpToLevel(xp) {
    if (xp < 0) return 1;
    let points = 0;
    let output = 0;
    for (let lvl = 1; lvl <= 99; lvl++) {
        points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
        output = Math.floor(points / 4);
        if (output > xp) {
            return lvl;
        }
    }
    return 99;
}

/**
 * Calculates the XP required for a given level using the OSRS formula.
 * Formula: (1/8)(lvl)((lvl)-1) + (75*(2^(((lvl)-1)/7)-1)/(1-2^(-1/7))) + ((lvl)*-0.109)
 * @param {number} level - The level to calculate XP for (1-99).
 * @returns {number} The XP required for that level.
 */
function levelToXp(level) {
    if (level <= 1) return 0;

    const part1 = (1 / 8) * level * (level - 1);
    const part2 = (75 * (Math.pow(2, (level - 1) / 7) - 1)) / (1 - Math.pow(2, -1 / 7));
    const part3 = level * -0.109;

    return Math.floor(part1 + part2 + part3);
}

/**
 * Generates a new user object with randomized hiscores for all 23 skills.
 * XP is seeded to be somewhat realistic, favoring lower and mid-levels.
 * Uses weighted distribution to make some skills more likely to have higher XP.
 * Hitpoints is calculated based on combat skills (Attack, Strength, Defence, Ranged).
 * @param {string} username - The username for the new player.
 * @returns {object} A user object containing the username and a skills object.
 */
function generateNewUser(username) {
    const user = {
        username: username,
        skills: {},
    };

    // Determine new player type (affects starting XP ranges)
    const playerType = Math.random();
    let xpMultiplier, baseXpRange;

    if (playerType < 0.60) {
        // New/Low level player (60% chance)
        baseXpRange = { min: 0, max: 5000 };
        xpMultiplier = 1.0;
    } else if (playerType < 0.85) {
        // Medium level player (25% chance)
        baseXpRange = { min: 1000, max: 25000 };
        xpMultiplier = 1.5;
    } else if (playerType < 0.95) {
        // High level player (10% chance)
        baseXpRange = { min: 5000, max: 100000 };
        xpMultiplier = 2.0;
    } else {
        // Elite level player (5% chance)
        baseXpRange = { min: 50000, max: 500000 };
        xpMultiplier = 3.0;
    }

    // Generate random XP for all skills except Hitpoints
    SKILLS.forEach(skill => {
        if (skill !== 'Hitpoints') {
            const skillWeight = SKILL_POPULARITY_WEIGHTS[skill] || 1.0;
            const weightedRange = {
                min: Math.floor(baseXpRange.min * skillWeight),
                max: Math.floor(baseXpRange.max * skillWeight * xpMultiplier)
            };

            const randomXp = Math.floor(
                Math.random() * (weightedRange.max - weightedRange.min + 1) + weightedRange.min
            );

            user.skills[skill] = {
                xp: Math.max(0, randomXp),
                level: xpToLevel(Math.max(0, randomXp)),
            };
        }
    });

    // Calculate Hitpoints based on combat skills
    const combatSkills = ['Attack', 'Strength', 'Defence', 'Ranged'];
    const totalCombatXp = combatSkills.reduce((sum, skill) => {
        return sum + user.skills[skill].xp;
    }, 0);

    // Formula: Take total combat XP, divide by 4, multiply by 1.3, ensure minimum of 1154 XP (level 10)
    const hitpointsXp = Math.max(1154, Math.floor((totalCombatXp / 4) * 1.3));

    user.skills['Hitpoints'] = {
        xp: hitpointsXp,
        level: xpToLevel(hitpointsXp),
    };

    return user;
}

/**
 * Updates the Hitpoints skill for an existing user based on their combat skills.
 * Formula: Take total combat XP (Attack, Strength, Defence, Ranged), divide by 4, multiply by 1.3
 * @param {object} user - The user object to update.
 * @returns {boolean} True if Hitpoints was updated, false otherwise.
 */
function updateHitpointsForUser(user) {
    if (!user || !user.skills) return false;

    const combatSkills = ['Attack', 'Strength', 'Defence', 'Ranged'];
    const totalCombatXp = combatSkills.reduce((sum, skill) => {
        return sum + (user.skills[skill]?.xp || 0);
    }, 0);

    // Formula: Take total combat XP, divide by 4, multiply by 1.3
    const newHitpointsXp = Math.floor((totalCombatXp / 4) * 1.3);

    // Only update if the new XP is different from current
    if (user.skills['Hitpoints'] && user.skills['Hitpoints'].xp !== newHitpointsXp) {
        user.skills['Hitpoints'].xp = newHitpointsXp;
        user.skills['Hitpoints'].level = xpToLevel(newHitpointsXp);
        return true;
    }

    return false;
}

// =================================================================
// HANDLER FUNCTIONS
// =================================================================

/**
 * Creates a JSON response with appropriate headers.
 * @param {object | Array} data - The data to be sent as JSON.
 * @param {number} [status=200] - The HTTP status code.
 * @returns {Response}
 */
function jsonResponse(data, status = 200) {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*', // Allow cross-origin requests
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
    return new Response(JSON.stringify(data, null, 2), { status, headers });
}

/**
 * Handles OPTIONS requests for CORS preflight.
 * @returns {Response}
 */
function handleOptions() {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
    return new Response(null, { headers });
}

/**
 * Main fetch handler for routing API requests.
 * @param {Request} request - The incoming request.
 * @param {object} env - The worker environment.
 * @returns {Promise<Response>}
 */
async function handleFetch(request, env) {
    if (request.method === 'OPTIONS') {
        return handleOptions();
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Using a more robust regex for usernames
    const userDetailRegex = /^\/api\/users\/([^/]+)$/;
    const userMatch = path.match(userDetailRegex);

    try {
        if (path === '/api/health') {
            return jsonResponse({ status: 'ok', timestamp: new Date().toISOString() });
        }

        if (path === '/api/users') {
            const kvList = await listUsers(env);
            const usernames = kvList.keys.map(k => k.name);
            return jsonResponse({ users: usernames });
        }

        if (userMatch && userMatch[1]) {
            const username = decodeURIComponent(userMatch[1]);
            const user = await getUser(env, username);
            if (user) {
                return jsonResponse(user);
            } else {
                return jsonResponse({ error: 'User not found' }, 404);
            }
        }

        if (path === '/api/leaderboard') {
            const kvList = await listUsers(env);
            if (!kvList.keys || kvList.keys.length === 0) {
                return jsonResponse([]);
            }

            const userPromises = kvList.keys.map(key => getUser(env, key.name));
            const users = await Promise.all(userPromises);

            const leaderboard = users
                .map(user => {
                    if (!user || !user.skills) return null;
                    const totalXp = Object.values(user.skills).reduce((sum, skill) => sum + skill.xp, 0);
                    const totalLevel = Object.values(user.skills).reduce((sum, skill) => sum + skill.level, 0);
                    return {
                        username: user.username,
                        totalXp,
                        totalLevel,
                    };
                })
                .filter(Boolean);

            // Sort by totalLevel first, then by totalXp as a tie-breaker
            leaderboard.sort((a, b) => {
                if (b.totalLevel !== a.totalLevel) {
                    return b.totalLevel - a.totalLevel;
                }
                return b.totalXp - a.totalXp;
            });

            const rankedLeaderboard = leaderboard.map((player, index) => ({
                rank: index + 1,
                ...player,
            }));

            return jsonResponse(rankedLeaderboard);
        }

        if (path === '/api/skill-rankings') {
            const kvList = await listUsers(env);
            if (!kvList.keys || kvList.keys.length === 0) {
                return jsonResponse({});
            }

            const userPromises = kvList.keys.map(key => getUser(env, key.name));
            const users = await Promise.all(userPromises);

            const skillRankings = {};

            // Initialize skill rankings object
            SKILLS.forEach(skillName => {
                skillRankings[skillName] = [];
            });

            // Collect all users' skill data
            users.forEach(user => {
                if (!user || !user.skills) return;

                SKILLS.forEach(skillName => {
                    const skill = user.skills[skillName];
                    if (skill) {
                        skillRankings[skillName].push({
                            username: user.username,
                            level: skill.level,
                            xp: skill.xp
                        });
                    }
                });
            });

            // Sort each skill by level (desc) then by XP (desc) and assign ranks
            Object.keys(skillRankings).forEach(skillName => {
                skillRankings[skillName].sort((a, b) => {
                    if (b.level !== a.level) {
                        return b.level - a.level;
                    }
                    return b.xp - a.xp;
                });

                // Assign ranks
                skillRankings[skillName] = skillRankings[skillName].map((player, index) => ({
                    ...player,
                    rank: index + 1
                }));
            });

            // Also calculate total level rankings
            const totalLevelRankings = users
                .map(user => {
                    if (!user || !user.skills) return null;
                    const totalXp = Object.values(user.skills).reduce((sum, skill) => sum + skill.xp, 0);
                    const totalLevel = Object.values(user.skills).reduce((sum, skill) => sum + skill.level, 0);
                    return {
                        username: user.username,
                        totalXp,
                        totalLevel,
                    };
                })
                .filter(Boolean);

            totalLevelRankings.sort((a, b) => {
                if (b.totalLevel !== a.totalLevel) {
                    return b.totalLevel - a.totalLevel;
                }
                return b.totalXp - a.totalXp;
            });

            const rankedTotalLevels = totalLevelRankings.map((player, index) => ({
                ...player,
                rank: index + 1
            }));

            return jsonResponse({
                skills: skillRankings,
                totalLevel: rankedTotalLevels
            });
        }

        // Handle manual cron trigger
        if (path === '/api/cron/trigger' && request.method === 'POST') {
            try {
                const result = await runScheduledUpdate(env);
                return jsonResponse({
                    message: 'Cron job executed successfully',
                    result: result,
                    timestamp: new Date().toISOString()
                });
            } catch (error) {
                console.error('Manual cron trigger failed:', error);
                return jsonResponse({
                    error: 'Cron job failed',
                    message: error.message,
                    timestamp: new Date().toISOString()
                }, 500);
            }
        }

        // Handle cron status check
        if (path === '/api/cron/status') {
            return jsonResponse({
                status: 'Cron service is running',
                timestamp: new Date().toISOString(),
                nextScheduledRun: 'Every hour (0 * * * *)'
            });
        }

        return jsonResponse({ error: 'Not Found' }, 404);

    } catch (error) {
        console.error('Error in handleFetch:', error);
        return jsonResponse({ error: 'Internal Server Error', message: error.message }, 500);
    }
}

/**
 * Scheduled event handler for updating XP and creating new users.
 * @param {ScheduledController} controller - The scheduled controller object.
 * @param {object} env - The worker environment.
 * @param {ExecutionContext} ctx - The execution context.
 */
async function handleScheduled(controller, env, ctx) {
    console.log(`Cron triggered at: ${new Date(controller.scheduledTime)}`);
    console.log(`Cron pattern: ${controller.cron}`);
    ctx.waitUntil(runScheduledUpdate(env));
}

/**
 * Updates existing users' XP and creates new random users.
 * @param {object} env - The worker environment.
 */
async function runScheduledUpdate(env) {
    try {
        const kvList = await listUsers(env);
        const updatePromises = [];

        if (kvList.keys && kvList.keys.length > 0) {
            const userPromises = kvList.keys.map(key => getUser(env, key.name));
            const users = await Promise.all(userPromises);

            // Track activity type distribution for logging
            const activityTypeCount = {};
            Object.keys(PLAYER_ACTIVITY_TYPES).forEach(type => {
                activityTypeCount[type] = 0;
            });

            for (const user of users) {
                if (!user) continue;

                // Determine this player's activity type for this update cycle
                const activityType = getPlayerActivityType();
                activityTypeCount[activityType]++;

                let hasChanges = false;
                const xpGains = {};

                SKILLS.forEach(skillName => {
                    // Skip Hitpoints - it will be calculated separately
                    if (skillName === 'Hitpoints') return;

                    const xpGained = generateWeightedXpGain(activityType, skillName);
                    const currentSkill = user.skills[skillName];

                    xpGains[skillName] = xpGained;

                    if (xpGained > 0 && currentSkill.xp < 200000000) {
                        const oldXp = currentSkill.xp;
                        currentSkill.xp = Math.min(200000000, currentSkill.xp + xpGained);
                        currentSkill.level = xpToLevel(currentSkill.xp);
                        hasChanges = true;
                    }
                });

                // Update Hitpoints based on combat skills
                const hitpointsUpdated = updateHitpointsForUser(user);
                if (hitpointsUpdated) {
                    hasChanges = true;
                }

                if (hasChanges) {
                    updatePromises.push(putUser(env, user.username, user));

                    // Log update details for players with significant activity
                    const stats = calculateXpGainStats(xpGains);
                    if (stats.totalXp > 0) {
                        console.log(`${user.username} (${activityType}): ${stats.totalXp} total XP across ${stats.skillsUpdated} skills (avg: ${stats.averageXp}, max: ${stats.maxXp})`);
                    }
                }
            }

            // Log activity type distribution
            console.log('Activity type distribution:', activityTypeCount);
        }

        const newUserCount = Math.floor(Math.random() * 3) + 1; // Generate 1-3 new users
        let createdUserCount = 0;
        if (newUserCount > 0) {
            for (let i = 0; i < newUserCount; i++) {
                let newUsername;
                let isUnique = false;
                let attempts = 0;
                while (!isUnique && attempts < 10) {
                    newUsername = generateRandomUsername();
                    const existingUser = await getUser(env, newUsername);
                    if (!existingUser) {
                        isUnique = true;
                    }
                    attempts++;
                }

                if (isUnique) {
                    const newUser = generateNewUser(newUsername);
                    updatePromises.push(putUser(env, newUsername, newUser));
                    createdUserCount++;
                }
            }
        }

        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
            console.log(`Scheduled update complete. Updated ${updatePromises.length - createdUserCount} users and created ${createdUserCount} new users.`);
            return {
                success: true,
                updatedUsers: updatePromises.length - createdUserCount,
                createdUsers: createdUserCount,
                totalUpdates: updatePromises.length
            };
        } else {
            console.log('No user XP was updated in this run.');
            return {
                success: true,
                updatedUsers: 0,
                createdUsers: 0,
                totalUpdates: 0
            };
        }

    } catch (error) {
        console.error('Failed to run scheduled update:', error);
        throw error;
    }
}

// =================================================================
// SEEDING BLOCK - For initial data population during development
// To use this, you can temporarily call `seedKV(env)` inside the
// fetch handler, e.g., on a specific hidden endpoint.
// IMPORTANT: Remove or disable this for production.
// =================================================================
const SEED_USERS = [
    'Zezima', 'Lynx Titan', 'B0aty', 'Woox', 'Le Me', 'Rune Shark',
    'Drumgun', 'King Condor', 'Sparc Mac', 'Trance Music'
];

async function seedKV(env) {
    console.log('Seeding KV store with initial users...');
    const putPromises = SEED_USERS.map(async (username) => {
        const existingUser = await getUser(env, username);
        if (!existingUser) {
            const newUser = generateNewUser(username);
            await putUser(env, username, newUser);
            console.log(`- Seeded user: ${username}`);
        } else {
            console.log(`- User already exists, skipping: ${username}`);
        }
    });

    await Promise.all(putPromises);
    console.log('Seeding complete.');
    return new Response('Seeding complete.', { status: 200 });
}
// =================================================================
// END SEEDING BLOCK
// =================================================================


export default {
    /**
     * The fetch handler is the primary entry point for HTTP requests.
     * @param {Request} request - The incoming request.
     * @param {object} env - The worker's environment variables and bindings.
     * @param {ExecutionContext} ctx - The execution context.
     * @returns {Promise<Response>}
     */
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // A simple, non-production-safe way to trigger seeding.
        // Visit /__seed in your browser to populate the KV store.
        if (url.pathname === '/__seed') {
            return seedKV(env);
        }

        // Manual cron trigger endpoint
        // Visit /api/cron/trigger to manually execute the scheduled update
        if (url.pathname === '/api/cron/trigger' && request.method === 'POST') {
            try {
                // Create a mock controller object similar to what the scheduled handler receives
                const mockController = {
                    scheduledTime: Date.now(),
                    cron: 'manual-trigger'
                };

                // Execute the scheduled handler
                await handleScheduled(mockController, env, ctx);

                return new Response(JSON.stringify({
                    success: true,
                    message: 'Cron job executed successfully',
                    timestamp: new Date().toISOString()
                }), {
                    status: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                    }
                });
            } catch (error) {
                console.error('Error executing manual cron trigger:', error);
                return new Response(JSON.stringify({
                    success: false,
                    message: 'Failed to execute cron job',
                    error: error.message,
                    timestamp: new Date().toISOString()
                }), {
                    status: 500,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Access-Control-Allow-Methods': 'POST, OPTIONS',
                        'Access-Control-Allow-Headers': 'Content-Type',
                    }
                });
            }
        }

        // Cron status endpoint - provides information about the cron configuration
        if (url.pathname === '/api/cron/status' && request.method === 'GET') {
            return new Response(JSON.stringify({
                cronTrigger: {
                    pattern: '0 * * * *',
                    description: 'Runs at minute 0 of every hour',
                    nextRun: 'Based on UTC time'
                },
                manualTrigger: {
                    endpoint: '/api/cron/trigger',
                    method: 'POST',
                    description: 'Manually execute the scheduled update'
                },
                localTesting: {
                    endpoint: '/cdn-cgi/handler/scheduled',
                    method: 'POST',
                    description: 'Cloudflare Workers local testing endpoint'
                },
                timestamp: new Date().toISOString()
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                }
            });
        }

        // Debug/admin page for manual cron execution
        if (url.pathname === '/admin' && request.method === 'GET') {
            const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OSRS Hiscores Admin</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f5f5f5;
        }
        .container {
            background-color: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            text-align: center;
        }
        .section {
            margin: 20px 0;
            padding: 20px;
            background-color: #f9f9f9;
            border-radius: 4px;
        }
        button {
            background-color: #4CAF50;
            color: white;
            padding: 10px 20px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            margin: 5px;
        }
        button:hover {
            background-color: #45a049;
        }
        button:disabled {
            background-color: #cccccc;
            cursor: not-allowed;
        }
        .status {
            margin: 10px 0;
            padding: 10px;
            border-radius: 4px;
        }
        .success {
            background-color: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .error {
            background-color: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .info {
            background-color: #d1ecf1;
            color: #0c5460;
            border: 1px solid #b8daff;
        }
        code {
            background-color: #f1f1f1;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: monospace;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>OSRS Hiscores Admin Panel</h1>
        
        <div class="section">
            <h2>Manual Cron Execution</h2>
            <p>Click the button below to manually execute the scheduled update job:</p>
            <button id="triggerCron">Execute Cron Job</button>
            <div id="cronStatus"></div>
        </div>
        
        <div class="section">
            <h2>Cron Configuration</h2>
            <p><strong>Pattern:</strong> <code>0 * * * *</code> (Every hour at minute 0)</p>
            <p><strong>Function:</strong> Updates existing users' XP and creates new random users</p>
            <button id="checkStatus">Check Status</button>
            <div id="statusInfo"></div>
        </div>
        
        <div class="section">
            <h2>Quick Actions</h2>
            <button onclick="window.location.href='/api/users'">View All Users</button>
            <button onclick="window.location.href='/api/leaderboard'">View Leaderboard</button>
            <button onclick="window.location.href='/__seed'">Seed Data</button>
        </div>
    </div>

    <script>
        async function triggerCron() {
            const button = document.getElementById('triggerCron');
            const statusDiv = document.getElementById('cronStatus');
            
            button.disabled = true;
            button.textContent = 'Executing...';
            statusDiv.innerHTML = '<div class="status info">Executing cron job...</div>';
            
            try {
                const response = await fetch('/api/cron/trigger', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                });
                
                const result = await response.json();
                
                if (result.success) {
                    statusDiv.innerHTML = \`<div class="status success">
                        <strong>Success!</strong> Cron job executed successfully.<br>
                        <small>Time: \${result.timestamp}</small>
                    </div>\`;
                } else {
                    statusDiv.innerHTML = \`<div class="status error">
                        <strong>Error:</strong> \${result.message}<br>
                        <small>\${result.error || ''}</small>
                    </div>\`;
                }
            } catch (error) {
                statusDiv.innerHTML = \`<div class="status error">
                    <strong>Error:</strong> Failed to execute cron job.<br>
                    <small>\${error.message}</small>
                </div>\`;
            } finally {
                button.disabled = false;
                button.textContent = 'Execute Cron Job';
            }
        }
        
        async function checkStatus() {
            const button = document.getElementById('checkStatus');
            const statusDiv = document.getElementById('statusInfo');
            
            button.disabled = true;
            button.textContent = 'Checking...';
            
            try {
                const response = await fetch('/api/cron/status');
                const result = await response.json();
                
                statusDiv.innerHTML = \`<div class="status info">
                    <strong>Cron Status Retrieved:</strong><br>
                    <small>Pattern: \${result.cronTrigger.pattern}</small><br>
                    <small>Description: \${result.cronTrigger.description}</small><br>
                    <small>Last checked: \${result.timestamp}</small>
                </div>\`;
            } catch (error) {
                statusDiv.innerHTML = \`<div class="status error">
                    <strong>Error:</strong> Failed to check status.<br>
                    <small>\${error.message}</small>
                </div>\`;
            } finally {
                button.disabled = false;
                button.textContent = 'Check Status';
            }
        }
        
        document.getElementById('triggerCron').addEventListener('click', triggerCron);
        document.getElementById('checkStatus').addEventListener('click', checkStatus);
    </script>
</body>
</html>
            `;

            return new Response(htmlContent, {
                status: 200,
                headers: {
                    'Content-Type': 'text/html',
                    'Access-Control-Allow-Origin': '*',
                }
            });
        }

        return handleFetch(request, env);
    },

    /**
     * The scheduled handler is triggered by the cron schedule.
     * @param {ScheduledController} controller - The scheduled controller object.
     * @param {object} env - The worker's environment variables and bindings.
     * @param {ExecutionContext} ctx - The execution context.
     */
    async scheduled(controller, env, ctx) {
        await handleScheduled(controller, env, ctx);
    },
};
