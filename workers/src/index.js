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
const GLOBAL_XP_MULTIPLIER = 2.0;

// Increased significantly to make weekends feel like a major competitive event.
const WEEKEND_BONUS_MULTIPLIER = 1.5;

// =================================================================
// KV & RESPONSE HELPERS
// =================================================================

async function getUser(env, username) {
    if (!username) return null;
    return await env.HISCORES_KV.get(username.toLowerCase(), 'json');
}

async function putUser(env, username, data) {
    await env.HISCORES_KV.put(username.toLowerCase(), JSON.stringify(data));
}

async function listUsers(env) {
    return await env.HISCORES_KV.list();
}

/**
 * Fetches all user objects from the KV store.
 * @param {object} env - The worker environment.
 * @returns {Promise<Array<object>>} A promise that resolves to an array of user objects.
 */
async function getAllUsers(env) {
    const kvList = await listUsers(env);
    if (!kvList.keys || kvList.keys.length === 0) {
        return [];
    }
    const userPromises = kvList.keys.map(key => getUser(env, key.name));
    const users = await Promise.all(userPromises);
    return users.filter(Boolean); // Filter out any null/failed lookups
}

function jsonResponse(data, status = 200) {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
    };
    return new Response(JSON.stringify(data, null, 2), { status, headers });
}

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

function xpToLevel(xp) {
    if (xp < 0) return 1;
    let points = 0;
    for (let lvl = 1; lvl <= 99; lvl++) {
        points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
        if (Math.floor(points / 4) > xp) {
            return lvl;
        }
    }
    return 99;
}

function calculateUserTotals(user) {
    if (!user || !user.skills) return { totalXp: 0, totalLevel: 0 };
    const totalXp = Object.values(user.skills).reduce((sum, skill) => sum + skill.xp, 0);
    const totalLevel = Object.values(user.skills).reduce((sum, skill) => sum + skill.level, 0);
    return { totalXp, totalLevel };
}

function updateHitpointsForUser(user) {
    if (!user || !user.skills) return false;
    const totalCombatXp = COMBAT_SKILLS.reduce((sum, skill) => sum + (user.skills[skill]?.xp || 0), 0);
    const newHitpointsXp = Math.floor((totalCombatXp / 4) * 1.3);
    if (user.skills['Hitpoints']?.xp !== newHitpointsXp) {
        user.skills['Hitpoints'].xp = newHitpointsXp;
        user.skills['Hitpoints'].level = xpToLevel(newHitpointsXp);
        return true;
    }
    return false;
}

// =================================================================
// USERNAME GENERATION HELPERS
// =================================================================

/**
 * Generates a username from a local list of prefixes and suffixes as a fallback.
 * @returns {string} A simple, locally generated username.
 */

async function generateUsernameFromAPI() {
    const useTwoWords = Math.random() < 0.15;
    const wordCount = useTwoWords ? 2 : 1;
    const apiUrl = `https://random-word-api.herokuapp.com/word?number=${wordCount}`;
    try {
        const response = await fetch(apiUrl, { headers: { 'User-Agent': 'osrs-hiscores-clone-worker/1.0' } });
        if (!response.ok) return null;
        const words = await response.json();
        if (!Array.isArray(words) || words.length !== wordCount) return null;

        const processedWords = words.map(w => (Math.random() < 0.7 ? w.charAt(0).toUpperCase() + w.slice(1) : w));
        let username = useTwoWords ? `${processedWords[0]}_${processedWords[1]}` : processedWords[0];

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

async function generateRandomUsername() {
    const apiUsername = await generateUsernameFromAPI();
    return apiUsername;
}

// =================================================================
// NEW USER & XP GAIN HELPERS (TUNED)
// =================================================================

/**
 * Generates a new user with a starting profile based on a randomly assigned player activity type.
 * This creates a wider and more realistic spectrum of new accounts.
 * @param {string} username - The username for the new player.
 * @returns {object} A new user object.
 */
function generateNewUser(username) {
    const user = { username, skills: {} };

    // Use the global player activity types to determine the starting profile.
    // This creates a more realistic distribution of new player skill levels.
    // 'INACTIVE' players will start as true beginners, while rare 'ELITE' players
    // can start with a significant head start, like a "prodigy" or an experienced player's alt.
    const activityType = getPlayerActivityType();
    const startingProfile = PLAYER_ACTIVITY_TYPES[activityType];
    const baseXpRange = startingProfile.xpRange;

    // A small random talent multiplier to ensure two new players of the same type aren't identical.
    const talentMultiplier = 0.75 + Math.random() * 0.75; // a value between 0.75 and 1.5

    SKILLS.forEach(skill => {
        if (skill !== 'Hitpoints') {
            const skillWeight = SKILL_POPULARITY_WEIGHTS[skill] || 1.0;
            const weightedMax = Math.floor(baseXpRange.max * skillWeight * talentMultiplier);
            const weightedMin = Math.floor(baseXpRange.min * skillWeight);

            // Only grant XP if a random chance, influenced by the profile's skill probability, passes.
            // This prevents inactive players from starting with stats in every skill.
            if (Math.random() < startingProfile.skillProbability) {
                const randomXp = Math.floor(Math.random() * (weightedMax - weightedMin + 1) + weightedMin);
                user.skills[skill] = { xp: Math.max(0, randomXp), level: xpToLevel(randomXp) };
            } else {
                user.skills[skill] = { xp: 0, level: 1 };
            }
        }
    });

    // Ensure Hitpoints is calculated correctly and has a base value.
    const hitpointsXp = Math.max(1154, Math.floor((COMBAT_SKILLS.reduce((sum, s) => sum + (user.skills[s]?.xp || 0), 0) / 4) * 1.3));
    user.skills['Hitpoints'] = { xp: hitpointsXp, level: xpToLevel(hitpointsXp) };

    return user;
}

/**
 * Selects a player activity type based on the globally defined probabilities.
 * No changes needed here, as its behavior is controlled by the PLAYER_ACTIVITY_TYPES constant.
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
 * Generates a random amount of XP gain for a specific skill, factoring in multiple dynamic variables.
 * @param {string} activityType - The player's activity level for this update.
 * @param {string} skillName - The name of the skill gaining XP.
 * @param {number} [currentLevel=1] - The current level of the skill, used for scaling.
 * @returns {number} The amount of XP gained, can be 0.
 */
function generateWeightedXpGain(activityType, skillName, currentLevel = 1) {
    const activityConfig = PLAYER_ACTIVITY_TYPES[activityType];
    const skillWeight = SKILL_POPULARITY_WEIGHTS[skillName] || 1.0;

    // Check if the player trains this skill at all during this session.
    // A popular skill (high weight) is more likely to pass this check.
    if (Math.random() > (activityConfig.skillProbability * skillWeight)) {
        return 0;
    }

    // Introduce a random efficiency multiplier for the session.
    // This simulates player focus, luck, or choice of training method.
    // A value < 1.0 represents a distracted/inefficient session.
    // A value > 1.0 represents a highly focused/efficient session.
    const efficiencyMultiplier = 0.6 + Math.random() * 0.8; // Random value between 0.6 and 1.4

    const baseXp = Math.floor(Math.random() * (activityConfig.xpRange.max - activityConfig.xpRange.min + 1) + activityConfig.xpRange.min);
    const levelScaling = 1 + (currentLevel / 99) * LEVEL_SCALING_FACTOR;
    const weekendBoost = WEEKEND_DAYS.includes(new Date().getUTCDay()) ? WEEKEND_BONUS_MULTIPLIER : 1;

    // The final calculation now includes the new efficiency factor.
    const finalXp = Math.floor(
        baseXp *
        efficiencyMultiplier *
        skillWeight *
        levelScaling *
        GLOBAL_XP_MULTIPLIER *
        weekendBoost
    );

    return Math.max(0, finalXp);
}

function calculateXpGainStats(xpGains) {
    const gains = Object.values(xpGains).filter(xp => xp > 0);
    if (gains.length === 0) return { totalXp: 0, skillsUpdated: 0, averageXp: 0, maxXp: 0 };
    const totalXp = gains.reduce((sum, xp) => sum + xp, 0);
    return { totalXp, skillsUpdated: gains.length, averageXp: Math.floor(totalXp / gains.length), maxXp: Math.max(...gains) };
}

// =================================================================
// RANKING & LEADERBOARD HELPERS
// =================================================================

function sortPlayersByTotals(players) {
    return players.sort((a, b) => b.totalLevel - a.totalLevel || b.totalXp - a.totalXp);
}

function sortPlayersBySkill(a, b) {
    return b.level - a.level || b.xp - a.xp;
}

function generateTotalLevelLeaderboard(users) {
    const leaderboardData = users.map(user => {
        const { totalXp, totalLevel } = calculateUserTotals(user);
        return { username: user.username, totalXp, totalLevel };
    });
    return sortPlayersByTotals(leaderboardData).map((player, index) => ({ rank: index + 1, ...player }));
}

function generateAllSkillRankings(users) {
    const skillRankings = Object.fromEntries(SKILLS.map(skillName => [skillName, []]));
    users.forEach(user => {
        SKILLS.forEach(skillName => {
            const skill = user.skills?.[skillName];
            if (skill) {
                skillRankings[skillName].push({ username: user.username, level: skill.level, xp: skill.xp });
            }
        });
    });
    Object.keys(skillRankings).forEach(skillName => {
        const sortedPlayers = skillRankings[skillName].sort(sortPlayersBySkill);
        skillRankings[skillName] = sortedPlayers.map((player, index) => ({ ...player, rank: index + 1 }));
    });
    return skillRankings;
}

// =================================================================
// CRON JOB HELPERS
// =================================================================

function processUserUpdates(users) {
    const updatePayloads = [];
    const activityTypeCount = Object.fromEntries(Object.keys(PLAYER_ACTIVITY_TYPES).map(type => [type, 0]));

    for (const user of users) {
        const activityType = getPlayerActivityType();
        activityTypeCount[activityType]++;
        let hasChanges = false;
        const xpGains = {};

        SKILLS.forEach(skillName => {
            if (skillName === 'Hitpoints') return;
            const currentSkill = user.skills[skillName];
            const xpGained = generateWeightedXpGain(activityType, skillName, currentSkill.level);
            xpGains[skillName] = xpGained;
            if (xpGained > 0 && currentSkill.xp < 200000000) {
                currentSkill.xp = Math.min(200000000, currentSkill.xp + xpGained);
                currentSkill.level = xpToLevel(currentSkill.xp);
                hasChanges = true;
            }
        });

        if (updateHitpointsForUser(user)) hasChanges = true;
        if (hasChanges) {
            updatePayloads.push({ username: user.username, data: user });
            const stats = calculateXpGainStats(xpGains);
            if (stats.totalXp > 0) {
                console.log(`${user.username} (${activityType}): ${stats.totalXp} XP across ${stats.skillsUpdated} skills (avg: ${stats.averageXp}, max: ${stats.maxXp})`);
            }
        }
    }
    console.log('Activity type distribution:', activityTypeCount);
    return updatePayloads;
}

async function createNewUsers(env, count) {
    const newUserPayloads = [];
    for (let i = 0; i < count; i++) {
        let newUsername, isUnique = false, attempts = 0;
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

async function runScheduledUpdate(env) {
    try {
        const users = await getAllUsers(env);
        const userUpdatePayloads = processUserUpdates(users);
        const newUserCount = Math.floor(Math.random() * 3) + 1;
        const newUserPayloads = await createNewUsers(env, newUserCount);
        const allPayloads = [...userUpdatePayloads, ...newUserPayloads];

        if (allPayloads.length > 0) {
            await Promise.all(allPayloads.map(p => putUser(env, p.username, p.data)));
            const log = {
                success: true,
                updatedUsers: userUpdatePayloads.length,
                createdUsers: newUserPayloads.length,
            };
            console.log(`Scheduled update complete. Updated ${log.updatedUsers} users and created ${log.createdUsers} new users.`);
            return log;
        } else {
            console.log('No users were updated or created in this run.');
            return { success: true, updatedUsers: 0, createdUsers: 0 };
        }
    } catch (error) {
        console.error('Failed to run scheduled update:', error);
        throw error;
    }
}

// =================================================================
// ROUTER & HANDLERS
// =================================================================

async function handleFetch(request, env) {
    if (request.method === 'OPTIONS') return handleOptions();
    const { pathname } = new URL(request.url);
    const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);

    try {
        if (pathname === '/api/health') {
            return jsonResponse({ status: 'OK', timestamp: new Date().toISOString() });
        }
        if (pathname === '/api/skills') {
            return jsonResponse({ skills: SKILLS });
        }
        if (pathname === '/api/users') {
            const kvList = await listUsers(env);
            return jsonResponse({ users: kvList.keys.map(k => k.name) });
        }
        if (userMatch?.[1]) {
            const user = await getUser(env, decodeURIComponent(userMatch[1]));
            return user ? jsonResponse(user) : jsonResponse({ error: 'User not found' }, 404);
        }
        if (pathname === '/api/leaderboard') {
            const users = await getAllUsers(env);
            return jsonResponse(generateTotalLevelLeaderboard(users));
        }
        if (pathname === '/api/skill-rankings') {
            const users = await getAllUsers(env);
            return jsonResponse({
                skills: generateAllSkillRankings(users),
                totalLevel: generateTotalLevelLeaderboard(users)
            });
        }
        if (pathname === '/api/cron/trigger' && request.method === 'POST') {
            const result = await runScheduledUpdate(env);
            return jsonResponse({ message: 'Cron job executed successfully', result });
        }
        if (pathname === '/api/cron/status') {
            return jsonResponse({ status: 'Cron service is running', nextScheduledRun: 'Every hour (0 * * * *)' });
        }

        return jsonResponse({ error: 'Not Found' }, 404);
    } catch (error) {
        console.error('Error in handleFetch:', error);
        return jsonResponse({ error: 'Internal Server Error', message: error.message }, 500);
    }
}

export default {
    async fetch(request, env, ctx) {
        return handleFetch(request, env);
    },
    async scheduled(controller, env, ctx) {
        console.log(`Cron triggered at: ${new Date(controller.scheduledTime)} (${controller.cron})`);
        ctx.waitUntil(runScheduledUpdate(env));
    },
};
