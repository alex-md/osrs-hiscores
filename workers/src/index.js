// osrs-hiscores-clone/workers/src/index.js

/**
 * OSRS Hiscores Cloudflare Worker
 * 
 * This worker provides an API for OSRS hiscores data and includes a scheduled
 * cron job that updates player XP and creates new random users.
 */

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
    // Less idling, more gains
    INACTIVE: {
        probability: 0.25,
        xpRange: { min: 100, max: 1500 },
        skillProbability: 0.20 // 20% chance to gain XP in any given skill
    },
    // Casual players (35% chance) - moderate XP gains
    CASUAL: {
        probability: 0.35,
        xpRange: { min: 800, max: 7000 },
        skillProbability: 0.40 // 40% chance to gain XP in any given skill
    },
    // Regular players (25% chance) - good XP gains
    REGULAR: {
        probability: 0.25,
        xpRange: { min: 4000, max: 25000 },
        skillProbability: 0.60 // 60% chance to gain XP in any given skill
    },
    // Hardcore players (12% chance) - high XP gains
    HARDCORE: {
        probability: 0.12,
        xpRange: { min: 15000, max: 125000 },
        skillProbability: 0.80 // 80% chance to gain XP in any given skill
    },
    // Elite players (3% chance) - extreme XP gains
    ELITE: {
        probability: 0.03,
        xpRange: { min: 80000, max: 500000 },
        skillProbability: 0.95 // 95% chance to gain XP in any given skill
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
/**
 * Weekend days (Saturday = 6, Sunday = 0)
 */

/**
 * XP multiplier constants for more realistic gains
 */
const LEVEL_SCALING_FACTOR = 0.35;     // +35 % at 99
const GLOBAL_XP_MULTIPLIER = 1.75;     // blanket boost

// === XP realism toggles (easy to dial up or down) =================
const WEEKEND_BONUS_MULTIPLIER = 1.25;     // Sat/Sun extra
const WEEKEND_DAYS = [0, 6];   // 0 = Sun, 6 = Sat



/**
 * More realistic (and juicier) XP roll-out.
 * @param {string} activityType
 * @param {string} skillName
 * @param {number} [currentLevel=1]  // optional, stays backward-compatible
 */
function generateWeightedXpGain(activityType, skillName, currentLevel = 1) {
    const activityConfig = PLAYER_ACTIVITY_TYPES[activityType];
    const skillWeight = SKILL_POPULARITY_WEIGHTS[skillName] || 1.0;

    // Determine if this skill gets trained
    const adjustedSkillProbability = activityConfig.skillProbability * skillWeight;
    if (Math.random() > adjustedSkillProbability) return 0;

    let baseXp = Math.floor(
        Math.random() * (activityConfig.xpRange.max - activityConfig.xpRange.min + 1) +
        activityConfig.xpRange.min
    );

    // === realism multipliers =====================================
    const levelScaling = 1 + (currentLevel / 99) * LEVEL_SCALING_FACTOR;
    const weekendBoost = WEEKEND_DAYS.includes(new Date().getUTCDay())
        ? WEEKEND_BONUS_MULTIPLIER : 1;

    const finalXp = Math.floor(
        baseXp *
        skillWeight *
        levelScaling *
        GLOBAL_XP_MULTIPLIER *
        weekendBoost
    );
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

// =================================================================
// START: USERNAME GENERATION REFACTOR
// =================================================================

/**
 * [MODIFIED] Fetches random words from a public API to create a username.
 * There is a 15% chance of fetching two words, and an 85% chance of fetching one.
 * @returns {Promise<string|null>} A username string if the API call is successful, otherwise null.
 */
async function generateUsernameFromAPI() {
    // Decide whether to use one or two words (15% chance for two words)
    const useTwoWords = Math.random() < 0.15;
    const wordCount = useTwoWords ? 2 : 1;
    const apiUrl = `https://random-word-api.herokuapp.com/word?number=${wordCount}`;

    try {
        const response = await fetch(apiUrl, {
            headers: { 'User-Agent': 'osrs-hiscores-clone-worker/1.0' } // Good practice to set a user-agent
        });

        if (!response.ok) {
            console.warn(`API call failed with status: ${response.status}`);
            return null;
        }

        const words = await response.json();
        if (!Array.isArray(words) || words.length !== wordCount) {
            console.warn('API returned unexpected word format.');
            return null;
        }

        const num = Math.floor(Math.random() * 999) + 1;

        // Capitalize the first letter of each word for style
        const capitalizedWords = words.map(w => w.charAt(0).toUpperCase() + w.slice(1));

        if (useTwoWords) {
            // Format: "WordOne_WordTwo"
            return `${capitalizedWords[0]}_${capitalizedWords[1]}`;
        } else {
            // Format: "Word"
            return `${capitalizedWords[0]}`;
        }

    } catch (error) {
        console.error('Error fetching from random word API:', error);
        return null;
    }
}

/**
 * Fallback local username generator. This is the original function,
 * renamed to serve as a reliable backup if the API fails.
 * @returns {string} A randomly generated username from a local, hardcoded list.
 */
function generateUsernameLocally() {
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
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num = Math.floor(Math.random() * 999) + 1;
    return `${adj}_${noun}_${num}`;
}


/**
 * Generates a random, OSRS-style username.
 * This function now acts as an orchestrator. It attempts to generate a username
 * from the API and falls back to the local generator if the API call fails.
 * Note: This does not guarantee uniqueness on its own. The caller must verify.
 * @returns {Promise<string>} A randomly generated username.
 */
async function generateRandomUsername() {
    const apiUsername = await generateUsernameFromAPI();
    if (apiUsername) {
        return apiUsername;
    }

    // Fallback if the API fails
    console.warn('API username generation failed, falling back to local generator.');
    return generateUsernameLocally();
}

// =================================================================
// END: USERNAME GENERATION REFACTOR
// =================================================================


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
                    // The username generator is now async, so we must await it.
                    newUsername = await generateRandomUsername();
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
