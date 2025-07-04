// osrs-hiscores-clone/workers/src/handlers.js

import { SKILLS, xpToLevel, generateNewUser, generateRandomUsername } from './dataGenerator.js';
import { getUser, putUser, listUsers } from './kvHelper.js';

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
export async function handleFetch(request, env) {
    if (request.method === 'OPTIONS') {
        return handleOptions();
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // --- FIX 1: Using a more robust regex for usernames ---
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

            // --- FIX 2: Sort by totalLevel first, then by totalXp as a tie-breaker ---
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
export async function handleScheduled(controller, env, ctx) {
    console.log(`Cron triggered at: ${new Date(controller.scheduledTime)}`);
    console.log(`Cron pattern: ${controller.cron}`);
    ctx.waitUntil(runScheduledUpdate(env));
}

/**
 * Updates existing users' XP and creates new random users.
 * @param {object} env - The worker environment.
 */
export async function runScheduledUpdate(env) {
    try {
        const kvList = await listUsers(env);
        const updatePromises = [];

        if (kvList.keys && kvList.keys.length > 0) {
            const userPromises = kvList.keys.map(key => getUser(env, key.name));
            const users = await Promise.all(userPromises);

            for (const user of users) {
                if (!user) continue;

                let hasChanges = false;
                SKILLS.forEach(skillName => {
                    const xpGained = Math.floor(Math.random() * 10000) + 100;
                    const currentSkill = user.skills[skillName];
                    if (currentSkill.xp < 200000000) {
                        currentSkill.xp = Math.min(200000000, currentSkill.xp + xpGained);
                        currentSkill.level = xpToLevel(currentSkill.xp);
                        hasChanges = true;
                    }
                });

                if (hasChanges) {
                    updatePromises.push(putUser(env, user.username, user));
                }
            }
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
