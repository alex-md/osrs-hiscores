// osrs-hiscores-clone/workers/src/index.js

/**
 * OSRS Hiscores Cloudflare Worker
 *
 * This worker provides an API for OSRS hiscores data and includes a scheduled
 * cron job that updates player XP and creates new random users.
 */

// =================================================================
// CONSTANTS & CONFIGURATION (TUNED)
// =================================================================

const SKILLS = [
    'Attack', 'Strength', 'Defence', 'Ranged', 'Prayer', 'Magic',
    'Runecrafting', 'Construction', 'Hitpoints', 'Agility', 'Herblore',
    'Thieving', 'Crafting', 'Fletching', 'Slayer', 'Hunter',
    'Mining', 'Smithing', 'Fishing', 'Cooking', 'Firemaking',
    'Woodcutting', 'Farming'
];

const COMBAT_SKILLS = ['Attack', 'Strength', 'Defence', 'Ranged'];
const WEEKEND_DAYS = [0, 6]; // 0 = Sun, 6 = Sat

const PLAYER_ACTIVITY_TYPES = {
    // A larger pool of inactive/low-activity players makes the top players stand out more.
    INACTIVE: { probability: 0.30, xpRange: { min: 0, max: 1000 }, skillProbability: 0.15 },
    // The bulk of the player base. Wider XP range for more variability.
    CASUAL: { probability: 0.40, xpRange: { min: 500, max: 15000 }, skillProbability: 0.40 },
    // More serious players, but a smaller group.
    REGULAR: { probability: 0.20, xpRange: { min: 10000, max: 80000 }, skillProbability: 0.65 },
    // Rarer and more dedicated. The ceiling is significantly higher.
    HARDCORE: { probability: 0.08, xpRange: { min: 50000, max: 400000 }, skillProbability: 0.85 },
    // The 1% of players. Truly massive potential gains to create a competitive top-end.
    ELITE: { probability: 0.02, xpRange: { min: 250000, max: 1200000 }, skillProbability: 0.95 }
};

const SKILL_POPULARITY_WEIGHTS = {
    // Increased weights for combat skills to reflect their popularity and competitive nature.
    'Attack': 1.3, 'Strength': 1.4, 'Defence': 1.15, 'Ranged': 1.3, 'Magic': 1.15,
    'Slayer': 1.25, // Slayer is a very popular and competitive skill.

    // Core non-combat skills
    'Hitpoints': 1.0, 'Woodcutting': 1.0, 'Fishing': 0.95, 'Mining': 0.9,
    'Hunter': 0.7, 'Farming': 0.8, 'Cooking': 0.85, 'Thieving': 0.5,

    // "Buyable" and utility skills, with some adjustments
    'Prayer': 0.6, 'Smithing': 0.6, 'Crafting': 0.7, 'Fletching': 0.65, 'Herblore': 0.55,

    // The notoriously slow/unpopular skills are now even more so, making high ranks in them more prestigious.
    'Runecrafting': 0.2, 'Construction': 0.2, 'Agility': 0.3, 'Firemaking': 0.4,
};

// Increased to make high-level players pull away from the pack faster, rewarding dedication.
const LEVEL_SCALING_FACTOR = 0.60;

// A slight bump to make the hiscores move a bit faster overall.
const GLOBAL_XP_MULTIPLIER = 1.1;

// Increased significantly to make weekends feel like a major competitive event.
const WEEKEND_BONUS_MULTIPLIER = 1.5;

// BUG FIX: Tuned constants for frequent, smaller cron job runs to avoid platform limits.
const MAX_USERS_PER_SCHEDULED_RUN = 100; // Max users to update in a single cron execution. (Lowered)
const USERS_PER_BATCH = 50;              // How many users to fetch/save in a single KV operation batch.
const BATCH_DELAY_MS = 100;              // Delay between batches to prevent rate limiting.
const LEADERBOARD_CACHE_TTL_MINUTES = 30; // How often to regenerate the full leaderboard. (New)


// =================================================================
// KV & RESPONSE HELPERS
// =================================================================

/**
 * Retrieves a user's data from the KV store.
 * @param {object} env - The worker's environment object, containing the KV namespace.
 * @param {string} username - The username to look up.
 * @returns {Promise<object|null>} The parsed user object, or null if not found.
 */
async function getUser(env, username) {
    if (!username) return null;
    return await env.HISCORES_KV.get(username.toLowerCase(), 'json');
}

/**
 * Saves a user's data to the KV store.
 * @param {object} env - The worker's environment object.
 * @param {string} username - The username to save data for.
 * @param {object} data - The user data object to be stored.
 * @returns {Promise<void>}
 */
async function putUser(env, username, data) {
    await env.HISCORES_KV.put(username.toLowerCase(), JSON.stringify(data));
}

/**
 * Retrieves the current state of the cron job processor from KV.
 * @param {object} env - The worker's environment object.
 * @returns {Promise<object>} The cron state object, or a default initial state.
 */
async function getCronState(env) {
    const state = await env.HISCORES_KV.get('__cron_state__', 'json');
    return state || { lastProcessedIndex: 0, totalUsers: 0 };
}

/**
 * Saves the current state of the cron job processor to KV.
 * @param {object} env - The worker's environment object.
 * @param {object} state - The cron state object to save.
 * @returns {Promise<void>}
 */
async function setCronState(env, state) {
    await env.HISCORES_KV.put('__cron_state__', JSON.stringify(state));
}

/**
 * Retrieves the cached leaderboards from the KV store.
 * @param {object} env - The worker's environment object.
 * @returns {Promise<object>} The leaderboards object, or a default empty structure.
 */
async function getLeaderboards(env) {
    const leaderboards = await env.HISCORES_KV.get('__leaderboards__', 'json');
    return leaderboards || { totalLevel: [], skills: {}, lastUpdated: null };
}

/**
 * Saves the generated leaderboards to the KV store as a cache.
 * @param {object} env - The worker's environment object.
 * @param {object} leaderboards - The complete leaderboards object to save.
 * @returns {Promise<void>}
 */
async function setLeaderboards(env, leaderboards) {
    await env.HISCORES_KV.put('__leaderboards__', JSON.stringify(leaderboards));
}

/**
 * Lists all user keys from the KV store, excluding internal system keys.
 * @param {object} env - The worker's environment object.
 * @returns {Promise<object>} The result of the KV list operation, with keys filtered.
 */
async function listUsers(env) {
    // Filter out internal keys like '__cron_state__' and '__leaderboards__'
    const kvList = await env.HISCORES_KV.list();
    kvList.keys = kvList.keys.filter(key => !key.name.startsWith('__'));
    return kvList;
}

/**
 * Fetches all user objects from the KV store in batches to avoid rate limits.
 * @param {object} env - The worker environment.
 * @param {number} batchSize - Maximum number of users to fetch in one batch.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of user objects.
 */
async function getAllUsers(env, batchSize = 100) {
    const kvList = await listUsers(env);
    if (!kvList.keys || kvList.keys.length === 0) {
        return [];
    }

    const users = [];
    const totalUsers = kvList.keys.length;

    // Process users in smaller batches to avoid hitting KV read limits.
    for (let i = 0; i < totalUsers; i += batchSize) {
        const batch = kvList.keys.slice(i, i + batchSize);
        const userPromises = batch.map(key => getUser(env, key.name));
        const batchUsers = await Promise.all(userPromises);
        users.push(...batchUsers.filter(Boolean)); // Filter out any nulls from failed gets

        // Add a small delay between batches to avoid overwhelming the system.
        if (i + batchSize < totalUsers) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    return users;
}

/**
 * Creates a standard JSON response with CORS headers.
 * @param {object|Array} data - The payload to be stringified and sent.
 * @param {number} [status=200] - The HTTP status code.
 * @returns {Response} A Cloudflare Worker Response object.
 */
function jsonResponse(data, status = 200) {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
    return new Response(JSON.stringify(data, null, 2), { status, headers });
}

/**
 * Handles CORS preflight (OPTIONS) requests.
 * @returns {Response} An empty response with appropriate CORS headers.
 */
function handleOptions() {
    return new Response(null, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        }
    });
}

// =================================================================
// USER & SKILL CALCULATION HELPERS
// =================================================================

/**
 * Calculates a player's level in a skill based on their total XP, using the OSRS formula.
 * @param {number} xp - The total experience points in a skill.
 * @returns {number} The calculated level, from 1 to 99.
 */
function xpToLevel(xp) {
    if (xp < 0) return 1;
    let points = 0;
    // Iterate from level 1 to 99 to find the level corresponding to the XP.
    for (let lvl = 1; lvl <= 99; lvl++) {
        points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
        if (Math.floor(points / 4) > xp) {
            return lvl;
        }
    }
    return 99;
}

/**
 * Calculates the total XP and total level for a given user object.
 * @param {object} user - The user object containing a `skills` property.
 * @returns {{totalXp: number, totalLevel: number}} An object with the calculated totals.
 */
function calculateUserTotals(user) {
    if (!user || !user.skills) return { totalXp: 0, totalLevel: 0 };
    const totalXp = Object.values(user.skills).reduce((sum, skill) => sum + skill.xp, 0);
    const totalLevel = Object.values(user.skills).reduce((sum, skill) => sum + skill.level, 0);
    return { totalXp, totalLevel };
}

/**
 * Updates a user's Hitpoints XP and level based on their combat skills' XP.
 * HP XP is roughly 1/3 of the sum of Attack, Strength, Defence, and Ranged XP.
 * @param {object} user - The user object to update.
 * @returns {boolean} True if the Hitpoints skill was updated, false otherwise.
 */
function updateHitpointsForUser(user) {
    if (!user || !user.skills) return false;
    // Sum XP from the four main combat skills.
    const totalCombatXp = COMBAT_SKILLS.reduce((sum, skill) => sum + (user.skills[skill]?.xp || 0), 0);
    // Calculate new HP XP based on combat XP (approximates the in-game formula).
    const newHitpointsXp = Math.floor((totalCombatXp / 4) * 1.3); // OSRS formula is 1.333... HP XP per 4 combat XP.

    if (user.skills['Hitpoints']?.xp !== newHitpointsXp) {
        user.skills['Hitpoints'].xp = newHitpointsXp;
        user.skills['Hitpoints'].level = xpToLevel(newHitpointsXp);
        return true; // Indicates a change was made.
    }
    return false;
}

// =================================================================
// USERNAME GENERATION HELPERS
// =================================================================

/**
 * Generates a username by fetching random words from an external API.
 * @returns {Promise<string|null>} A generated username, or null if the API call fails.
 */
async function generateUsernameFromAPI() {
    const useTwoWords = Math.random() < 0.15;
    const wordCount = useTwoWords ? 2 : 1;
    const apiUrl = `https://random-word-api.herokuapp.com/word?number=${wordCount}`;
    try {
        // Fetch with a timeout to prevent long waits on a slow API.
        const response = await fetch(apiUrl, {
            headers: { 'User-Agent': 'osrs-hiscores-clone-worker/1.0' },
            signal: AbortSignal.timeout(3000)
        });
        if (!response.ok) return null;
        const words = await response.json();
        if (!Array.isArray(words) || words.length !== wordCount) return null;

        // Process words for a more "game-like" username.
        const processedWords = words.map(w => (Math.random() < 0.7 ? w.charAt(0).toUpperCase() + w.slice(1) : w));
        let username = useTwoWords ? `${processedWords[0]}_${processedWords[1]}` : processedWords[0];

        // Occasionally add numbers to the username.
        if (Math.random() < 0.2) {
            const randomNumber = Math.floor(Math.random() * 999) + 1;
            username = Math.random() < 0.5 ? `${randomNumber}${username}` : `${username}${randomNumber}`;
        }
        return username;
    } catch (error) {
        console.error('Error fetching from random word API:', error);
        return null;
    }
}

/**
 * Generates a random username, currently acting as a wrapper for the API-based generator.
 * @returns {Promise<string|null>} A generated username, or null on failure.
 */
async function generateRandomUsername() {
    const apiUsername = await generateUsernameFromAPI();
    return apiUsername;
}

// =================================================================
// NEW USER & XP GAIN HELPERS (TUNED)
// =================================================================

/**
 * Generates a new user object with a randomized activity type and starting skills.
 * @param {string} username - The username for the new user.
 * @returns {object} A complete user object, ready to be stored.
 */
function generateNewUser(username) {
    const activityType = getPlayerActivityType();
    const user = { username, activityType, skills: {} };
    const startingProfile = PLAYER_ACTIVITY_TYPES[activityType];
    const baseXpRange = startingProfile.xpRange;
    // Add a "talent" multiplier to create variety among players of the same activity type.
    const talentMultiplier = 0.75 + Math.random() * 0.75;

    SKILLS.forEach(skill => {
        if (skill !== 'Hitpoints') { // Hitpoints is calculated separately.
            const skillWeight = SKILL_POPULARITY_WEIGHTS[skill] || 1.0;
            // Adjust XP range based on skill popularity and player talent.
            const weightedMax = Math.floor(baseXpRange.max * skillWeight * talentMultiplier);
            const weightedMin = Math.floor(baseXpRange.min * skillWeight);
            // Decide if the player has any starting XP in this skill.
            if (Math.random() < startingProfile.skillProbability) {
                const randomXp = Math.floor(Math.random() * (weightedMax - weightedMin + 1) + weightedMin);
                user.skills[skill] = { xp: Math.max(0, randomXp), level: xpToLevel(randomXp) };
            } else {
                user.skills[skill] = { xp: 0, level: 1 };
            }
        }
    });

    // Set initial Hitpoints based on combat skills, ensuring a minimum of level 10 (1154 XP).
    const hitpointsXp = Math.max(1154, Math.floor((COMBAT_SKILLS.reduce((sum, s) => sum + (user.skills[s]?.xp || 0), 0) / 4) * 1.3));
    user.skills['Hitpoints'] = { xp: hitpointsXp, level: xpToLevel(hitpointsXp) };
    return user;
}

/**
 * Selects a player activity type based on predefined probabilities.
 * @returns {string} The key of the selected activity type (e.g., 'CASUAL', 'ELITE').
 */
function getPlayerActivityType() {
    const random = Math.random();
    let cumulativeProbability = 0;
    for (const [type, config] of Object.entries(PLAYER_ACTIVITY_TYPES)) {
        cumulativeProbability += config.probability;
        if (random <= cumulativeProbability) return type;
    }
    return 'CASUAL'; // Fallback
}

/**
 * Assigns activity types to legacy users who don't have one.
 * @param {Array<object>} users - Array of user objects.
 * @returns {Array<object>} Array of users who were modified and need to be updated in KV.
 */
function assignActivityTypesToLegacyUsers(users) {
    const usersNeedingUpdate = [];
    for (const user of users) {
        if (!user.activityType) {
            // Assign a random activity type if one is missing.
            user.activityType = getPlayerActivityType();
            usersNeedingUpdate.push(user);
        }
    }
    return usersNeedingUpdate;
}

/**
 * Generates a random amount of XP gain for a specific skill, weighted by various factors.
 * @param {string} activityType - The player's activity type (e.g., 'HARDCORE').
 * @param {string} skillName - The name of the skill to generate XP for.
 * @param {number} [currentLevel=1] - The player's current level in that skill.
 * @returns {number} The amount of XP gained (can be 0).
 */
function generateWeightedXpGain(activityType, skillName, currentLevel = 1) {
    const activityConfig = PLAYER_ACTIVITY_TYPES[activityType];
    const skillWeight = SKILL_POPULARITY_WEIGHTS[skillName] || 1.0;
    // Determine the chance of gaining any XP in this skill for this update cycle.
    const effectiveSkillProbability = Math.min(1, activityConfig.skillProbability * skillWeight);

    if (Math.random() > effectiveSkillProbability) {
        return 0; // No XP gain this time.
    }

    // A random factor representing how "efficiently" the player is training.
    const efficiencyMultiplier = 0.6 + Math.random() * 0.8;
    // The base XP gain is pulled from the player's activity type range.
    const baseXp = Math.floor(Math.random() * (activityConfig.xpRange.max - activityConfig.xpRange.min + 1) + activityConfig.xpRange.min);
    // Higher level players gain XP faster.
    const levelScaling = 1 + (currentLevel / 99) * LEVEL_SCALING_FACTOR;
    // Apply a bonus for training on weekends.
    const weekendBoost = WEEKEND_DAYS.includes(new Date().getUTCDay()) ? WEEKEND_BONUS_MULTIPLIER : 1;

    // Combine all factors to calculate the final XP gain.
    const finalXp = Math.floor(baseXp * efficiencyMultiplier * skillWeight * levelScaling * GLOBAL_XP_MULTIPLIER * weekendBoost);
    return Math.max(0, finalXp);
}

/**
 * Calculates summary statistics for a user's XP gains in a single update.
 * @param {object} xpGains - An object mapping skill names to XP gained.
 * @returns {object} An object with total, count, average, and max XP stats.
 */
function calculateXpGainStats(xpGains) {
    const gains = Object.values(xpGains).filter(xp => xp > 0);
    if (gains.length === 0) return { totalXp: 0, skillsUpdated: 0, averageXp: 0, maxXp: 0 };
    const totalXp = gains.reduce((sum, xp) => sum + xp, 0);
    return { totalXp, skillsUpdated: gains.length, averageXp: Math.floor(totalXp / gains.length), maxXp: Math.max(...gains) };
}

// =================================================================
// RANKING & LEADERBOARD HELPERS
// =================================================================

/**
 * A comparator function for sorting players by total level, then by total XP as a tie-breaker.
 * @param {object} a - The first player object.
 * @param {object} b - The second player object.
 * @returns {number} A negative, zero, or positive value for sorting.
 */
function sortPlayersByTotals(players) {
    return players.sort((a, b) => b.totalLevel - a.totalLevel || b.totalXp - a.totalXp);
}

/**
 * A comparator function for sorting players within a skill by level, then by XP as a tie-breaker.
 * @param {object} a - The first player's skill data.
 * @param {object} b - The second player's skill data.
 * @returns {number} A negative, zero, or positive value for sorting.
 */
function sortPlayersBySkill(a, b) {
    return b.level - a.level || b.xp - a.xp;
}

/**
 * Generates the overall leaderboard based on total level and total XP.
 * @param {Array<object>} users - An array of all user objects.
 * @returns {Array<object>} A sorted and ranked array of players.
 */
function generateTotalLevelLeaderboard(users) {
    const leaderboardData = users.map(user => {
        const { totalXp, totalLevel } = calculateUserTotals(user);
        return { username: user.username, totalXp, totalLevel };
    });
    // Sort players and assign a rank.
    return sortPlayersByTotals(leaderboardData).map((player, index) => ({ rank: index + 1, ...player }));
}

/**
 * Generates ranked leaderboards for every individual skill.
 * @param {Array<object>} users - An array of all user objects.
 * @returns {object} An object where keys are skill names and values are ranked player arrays.
 */
function generateAllSkillRankings(users) {
    // Initialize an empty array for each skill.
    const skillRankings = Object.fromEntries(SKILLS.map(skillName => [skillName, []]));
    // Populate each skill array with data from all users.
    users.forEach(user => {
        SKILLS.forEach(skillName => {
            const skill = user.skills?.[skillName];
            if (skill) {
                skillRankings[skillName].push({ username: user.username, level: skill.level, xp: skill.xp });
            }
        });
    });
    // Sort and rank each skill leaderboard individually.
    Object.keys(skillRankings).forEach(skillName => {
        const sortedPlayers = skillRankings[skillName].sort(sortPlayersBySkill);
        skillRankings[skillName] = sortedPlayers.map((player, index) => ({ ...player, rank: index + 1 }));
    });
    return skillRankings;
}

// =================================================================
// BATCH PROCESSING HELPERS
// =================================================================

/**
 * Fetches and processes a batch of users to generate update payloads.
 * This function reads from KV in smaller sub-batches to avoid rate limits.
 * @param {object} env - The worker's environment object.
 * @param {Array<object>} userKeys - An array of KV key objects for the users to process.
 * @returns {Promise<Array<object>>} An array of payloads for users that need to be updated.
 */
async function processBatchOfUsers(env, userKeys) {
    const updatePayloads = [];
    for (let i = 0; i < userKeys.length; i += USERS_PER_BATCH) {
        const subBatch = userKeys.slice(i, i + USERS_PER_BATCH);
        // Fetch user data for the current sub-batch.
        const userPromises = subBatch.map(key => getUser(env, key.name));
        const users = await Promise.all(userPromises);
        // Process updates for the fetched users.
        const batchUpdates = processUserUpdates(users.filter(Boolean));
        updatePayloads.push(...batchUpdates);
        // Pause briefly between sub-batches to avoid hitting read limits.
        if (i + USERS_PER_BATCH < userKeys.length) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
    }
    return updatePayloads;
}

/**
 * Saves an array of user update payloads to KV in batches.
 * @param {object} env - The worker's environment object.
 * @param {Array<object>} updatePayloads - An array of { username, data } objects.
 * @returns {Promise<void>}
 */
async function saveBatchUpdates(env, updatePayloads) {
    for (let i = 0; i < updatePayloads.length; i += USERS_PER_BATCH) {
        const batch = updatePayloads.slice(i, i + USERS_PER_BATCH);
        // Write the batch of updates to KV concurrently.
        await Promise.all(batch.map(payload => putUser(env, payload.username, payload.data)));
        // Pause briefly between write batches to avoid hitting write limits.
        if (i + USERS_PER_BATCH < updatePayloads.length) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
    }
}

// =================================================================
// CRON JOB HELPERS
// =================================================================

/**
 * Processes a list of users, calculates XP gains, and returns payloads for those who changed.
 * @param {Array<object>} users - The array of user objects to process.
 * @returns {Array<object>} An array of { username, data } payloads for users with updates.
 */
function processUserUpdates(users) {
    const updatePayloads = [];
    const activityTypeCount = Object.fromEntries(Object.keys(PLAYER_ACTIVITY_TYPES).map(type => [type, 0]));

    for (const user of users) {
        // Use the user's existing activity type, or assign one if missing (for legacy users).
        const activityType = user.activityType || getPlayerActivityType();

        // If the user didn't have an activity type, ensure it gets saved.
        let needsActivityTypeUpdate = false;
        if (!user.activityType) {
            user.activityType = activityType;
            needsActivityTypeUpdate = true;
        }

        activityTypeCount[activityType]++;
        let hasChanges = needsActivityTypeUpdate;
        const xpGains = {};

        // Calculate XP gain for each skill (except Hitpoints).
        SKILLS.forEach(skillName => {
            if (skillName === 'Hitpoints') return;
            const currentSkill = user.skills[skillName];
            const xpGained = generateWeightedXpGain(activityType, skillName, currentSkill.level);
            xpGains[skillName] = xpGained;
            // Apply XP gain if any was generated and the skill is not maxed out.
            if (xpGained > 0 && currentSkill.xp < 200000000) {
                currentSkill.xp = Math.min(200000000, currentSkill.xp + xpGained);
                currentSkill.level = xpToLevel(currentSkill.xp);
                hasChanges = true;
            }
        });

        // Update Hitpoints based on any combat XP changes.
        if (updateHitpointsForUser(user)) hasChanges = true;

        // If any data changed, add the user to the list of updates to be saved.
        if (hasChanges) {
            updatePayloads.push({ username: user.username, data: user });
            const stats = calculateXpGainStats(xpGains);
            if (stats.totalXp > 0) {
                console.log(`${user.username} (${activityType}): ${stats.totalXp} XP across ${stats.skillsUpdated} skills (avg: ${stats.averageXp}, max: ${stats.maxXp})`);
            }
        }
    }
    console.log('Activity type distribution in this batch:', activityTypeCount);
    return updatePayloads;
}

/**
 * Creates a specified number of new, unique users.
 * @param {object} env - The worker's environment object.
 * @param {number} count - The number of new users to create.
 * @returns {Promise<Array<object>>} An array of { username, data } payloads for the new users.
 */
async function createNewUsers(env, count) {
    const newUserPayloads = [];
    for (let i = 0; i < count; i++) {
        let newUsername, isUnique = false, attempts = 0;
        // Attempt to generate a unique username, retrying a few times if a collision occurs.
        while (!isUnique && attempts < 10) {
            newUsername = await generateRandomUsername();
            if (newUsername && !(await getUser(env, newUsername))) isUnique = true;
            attempts++;
        }
        if (isUnique) {
            newUserPayloads.push({ username: newUsername, data: generateNewUser(newUsername) });
        }
    }
    return newUserPayloads;
}

/**
 * The main function executed by the cron job. It processes a slice of users,
 * creates new ones, and periodically regenerates leaderboards.
 * @param {object} env - The worker's environment object.
 * @returns {Promise<object>} A log object summarizing the actions taken.
 */
async function runScheduledUpdate(env) {
    try {
        const kvList = await listUsers(env);
        if (!kvList.keys || kvList.keys.length === 0) {
            console.log('No users found to update');
            return { success: true, updatedUsers: 0, createdUsers: 0 };
        }

        // Load the state to know where the last run left off.
        const cronState = await getCronState(env);
        const totalUsers = kvList.keys.length;
        let startIndex = cronState.lastProcessedIndex;

        // If user count has changed drastically, reset the processing index to the start.
        if (Math.abs(totalUsers - cronState.totalUsers) > 50) {
            startIndex = 0;
            console.log(`User count changed significantly (${cronState.totalUsers} -> ${totalUsers}), resetting index`);
        }

        // Process a fixed-size slice of users to stay within execution time limits.
        const usersToProcess = Math.min(MAX_USERS_PER_SCHEDULED_RUN, totalUsers);
        const selectedUserKeys = [];
        for (let i = 0; i < usersToProcess; i++) {
            const index = (startIndex + i) % totalUsers; // Wrap around if we reach the end.
            selectedUserKeys.push(kvList.keys[index]);
        }

        console.log(`Processing ${selectedUserKeys.length} users (indices ${startIndex} to ${(startIndex + usersToProcess - 1) % totalUsers}) out of ${totalUsers} total`);

        // Generate updates and create new users.
        const userUpdatePayloads = await processBatchOfUsers(env, selectedUserKeys);
        const newUserCount = Math.random() < 0.2 ? 1 : 0; // Small chance to create a new user each run.
        const newUserPayloads = await createNewUsers(env, newUserCount);

        // Save all changes to KV.
        const allPayloads = [...userUpdatePayloads, ...newUserPayloads];
        if (allPayloads.length > 0) {
            await saveBatchUpdates(env, allPayloads);
        }

        // Conditionally regenerate leaderboards based on a time-based cache.
        const leaderboards = await getLeaderboards(env);
        const now = new Date();
        const lastUpdated = leaderboards.lastUpdated ? new Date(leaderboards.lastUpdated) : null;
        const shouldRegenerate = !lastUpdated || (now.getTime() - lastUpdated.getTime()) > LEADERBOARD_CACHE_TTL_MINUTES * 60 * 1000;

        if (shouldRegenerate) {
            console.log(`Leaderboard cache is stale (older than ${LEADERBOARD_CACHE_TTL_MINUTES} mins). Regenerating...`);
            // This is an expensive operation, so it only runs periodically.
            const allUsers = await getAllUsers(env);
            const totalLevelLeaderboard = generateTotalLevelLeaderboard(allUsers);
            const skillRankings = generateAllSkillRankings(allUsers);
            await setLeaderboards(env, {
                totalLevel: totalLevelLeaderboard,
                skills: skillRankings,
                lastUpdated: now.toISOString()
            });
            console.log('Leaderboards regenerated and cached.');
        } else {
            console.log('Skipping leaderboard regeneration, cache is fresh.');
        }

        // Save the new state for the next cron run.
        const nextIndex = (startIndex + usersToProcess) % totalUsers;
        await setCronState(env, {
            lastProcessedIndex: nextIndex,
            totalUsers: totalUsers
        });

        const log = {
            success: true,
            updatedUsers: userUpdatePayloads.length,
            createdUsers: newUserPayloads.length,
            nextStartIndex: nextIndex,
            totalUsers: totalUsers,
            leaderboardsRegenerated: shouldRegenerate
        };

        console.log(`Update complete: ${log.updatedUsers} users updated, ${log.createdUsers} users created. Next run starts at index ${log.nextStartIndex}`);
        return log;

    } catch (error) {
        console.error('Failed to run scheduled update:', error);
        throw error;
    }
}


// =================================================================
// ROUTER & HANDLERS
// =================================================================

/**
 * Handles incoming HTTP requests and routes them to the appropriate function.
 * @param {Request} request - The incoming request object.
 * @param {object} env - The worker's environment object.
 * @returns {Promise<Response>} A Response object.
 */
async function handleFetch(request, env) {
    // Handle CORS preflight requests first.
    if (request.method === 'OPTIONS') return handleOptions();

    const { pathname } = new URL(request.url);
    const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);

    try {
        // Health check endpoint
        if (pathname === '/api/health') {
            return jsonResponse({ status: 'OK', timestamp: new Date().toISOString() });
        }
        // Get list of all skills
        if (pathname === '/api/skills') {
            return jsonResponse({ skills: SKILLS });
        }
        // Get list of all usernames
        if (pathname === '/api/users') {
            const kvList = await listUsers(env);
            return jsonResponse({ users: kvList.keys.map(k => k.name) });
        }
        // Get a specific user's hiscores data
        if (userMatch?.[1]) {
            const user = await getUser(env, decodeURIComponent(userMatch[1]));
            return user ? jsonResponse(user) : jsonResponse({ error: 'User not found' }, 404);
        }
        // Get the total level leaderboard
        if (pathname === '/api/leaderboard') {
            const { totalLevel } = await getLeaderboards(env);
            return jsonResponse(totalLevel);
        }
        // Get all skill-specific leaderboards
        if (pathname === '/api/skill-rankings') {
            const leaderboards = await getLeaderboards(env);
            return jsonResponse(leaderboards);
        }
        // Manually trigger the cron job (for testing)
        if (pathname === '/api/cron/trigger' && request.method === 'POST') {
            const result = await runScheduledUpdate(env);
            return jsonResponse({ message: 'Cron job executed successfully', result });
        }
        // Check cron status
        if (pathname === '/api/cron/status') {
            return jsonResponse({ status: 'Cron service is running', nextScheduledRun: 'Check wrangler.toml for schedule' });
        }
        // One-time utility to assign activity types to old users
        if (pathname === '/api/migrate-legacy-users' && request.method === 'POST') {
            const allUsers = await getAllUsers(env);
            const usersNeedingUpdate = assignActivityTypesToLegacyUsers(allUsers);

            if (usersNeedingUpdate.length > 0) {
                await saveBatchUpdates(env, usersNeedingUpdate.map(user => ({
                    username: user.username,
                    data: user
                })));
            }

            return jsonResponse({
                message: 'Legacy user migration completed',
                usersUpdated: usersNeedingUpdate.length,
                totalUsers: allUsers.length
            });
        }
        // Get a report of the current player activity type distribution
        if (pathname === '/api/activity-distribution') {
            const allUsers = await getAllUsers(env);
            const distribution = Object.fromEntries(Object.keys(PLAYER_ACTIVITY_TYPES).map(type => [type, 0]));
            let usersWithoutActivityType = 0;

            allUsers.forEach(user => {
                if (user.activityType) {
                    distribution[user.activityType]++;
                } else {
                    usersWithoutActivityType++;
                }
            });

            return jsonResponse({
                distribution,
                usersWithoutActivityType,
                totalUsers: allUsers.length
            });
        }

        // Fallback for any other path
        return jsonResponse({ error: 'Not Found' }, 404);
    } catch (error) {
        console.error('Error in handleFetch:', error);
        return jsonResponse({ error: 'Internal Server Error', message: error.message }, 500);
    }
}

export default {
    /**
     * The entry point for all HTTP requests to the worker.
     * @param {Request} request - The incoming request.
     * @param {object} env - The worker environment.
     * @param {object} ctx - The execution context.
     * @returns {Promise<Response>}
     */
    async fetch(request, env, ctx) {
        return handleFetch(request, env);
    },
    /**
     * The entry point for scheduled (cron) events.
     * @param {ScheduledController} controller - Contains metadata about the scheduled event.
     * @param {object} env - The worker environment.
     * @param {object} ctx - The execution context.
     * @returns {Promise<void>}
     */
    async scheduled(controller, env, ctx) {
        console.log(`Cron triggered at: ${new Date(controller.scheduledTime)} (${controller.cron})`);
        // Use waitUntil to ensure the cron job can complete even after the event handler returns.
        ctx.waitUntil(runScheduledUpdate(env));
    },
};
