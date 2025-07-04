// OSRS Hiscores Cloudflare Worker - Bundled Version
// This file contains all the source code bundled together for manual deployment

// =================================================================
// DATA GENERATOR MODULE
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
 */
function generateRandomUsername() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num = Math.floor(Math.random() * 999) + 1;
    return `${adj}_${noun}_${num}`;
}

/**
 * Calculates the OSRS level for a given amount of XP.
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
 * Generates a new user object with randomized hiscores for all 23 skills.
 */
function generateNewUser(username) {
    const user = {
        username: username,
        skills: {},
    };

    SKILLS.forEach(skill => {
        const randomXp = Math.floor(Math.pow(Math.random(), 2.5) * 14000000);
        user.skills[skill] = {
            xp: randomXp,
            level: xpToLevel(randomXp),
        };
    });

    return user;
}

// =================================================================
// KV HELPER MODULE
// =================================================================

/**
 * Retrieves a user from KV storage.
 */
async function getUser(env, username) {
    try {
        const userData = await env.HISCORES_KV.get(username);
        return userData ? JSON.parse(userData) : null;
    } catch (error) {
        console.error(`Error getting user ${username}:`, error);
        return null;
    }
}

/**
 * Stores a user in KV storage.
 */
async function putUser(env, username, userData) {
    try {
        await env.HISCORES_KV.put(username, JSON.stringify(userData));
        return true;
    } catch (error) {
        console.error(`Error putting user ${username}:`, error);
        return false;
    }
}

/**
 * Lists all users in KV storage.
 */
async function listUsers(env) {
    try {
        return await env.HISCORES_KV.list();
    } catch (error) {
        console.error('Error listing users:', error);
        return { keys: [] };
    }
}

// =================================================================
// HANDLERS MODULE
// =================================================================

/**
 * Creates a JSON response with appropriate headers.
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
 * Handles OPTIONS requests for CORS preflight.
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
 */
async function handleFetch(request, env) {
    if (request.method === 'OPTIONS') {
        return handleOptions();
    }

    const url = new URL(request.url);
    const path = url.pathname;

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
 */
async function handleScheduled(controller, env, ctx) {
    console.log(`Cron triggered at: ${new Date(controller.scheduledTime)}`);
    console.log(`Cron pattern: ${controller.cron}`);
    ctx.waitUntil(runScheduledUpdate(env));
}

/**
 * Updates existing users' XP and creates new random users.
 */
async function runScheduledUpdate(env) {
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

        const newUserCount = Math.floor(Math.random() * 3) + 1;
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
// SEEDING DATA
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
// MAIN WORKER EXPORT
// =================================================================

export default {
    /**
     * The fetch handler is the primary entry point for HTTP requests.
     */
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // Seeding endpoint
        if (url.pathname === '/__seed') {
            return seedKV(env);
        }

        // Manual cron trigger endpoint
        if (url.pathname === '/api/cron/trigger' && request.method === 'POST') {
            try {
                const mockController = {
                    scheduledTime: Date.now(),
                    cron: 'manual-trigger'
                };

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

        // Cron status endpoint
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

        // Admin interface
        if (url.pathname === '/admin' && request.method === 'GET') {
            const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OSRS Hiscores Admin</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background-color: #f5f5f5; }
        .container { background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { color: #333; text-align: center; }
        .section { margin: 20px 0; padding: 20px; background-color: #f9f9f9; border-radius: 4px; }
        button { background-color: #4CAF50; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; margin: 5px; }
        button:hover { background-color: #45a049; }
        button:disabled { background-color: #cccccc; cursor: not-allowed; }
        .status { margin: 10px 0; padding: 10px; border-radius: 4px; }
        .success { background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
        .info { background-color: #d1ecf1; color: #0c5460; border: 1px solid #b8daff; }
        code { background-color: #f1f1f1; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
    </style>
</head>
<body>
    <div class="container">
        <h1>OSRS Hiscores Admin Panel</h1>
        
        <div class="section">
            <h2>Manual Cron Execution</h2>
            <p>Click the button below to manually execute the scheduled update job:</p>
            <button onclick="triggerCron()">Execute Cron Job</button>
            <div id="cronStatus"></div>
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
            const statusDiv = document.getElementById('cronStatus');
            statusDiv.innerHTML = '<div class="status info">Executing cron job...</div>';
            
            try {
                const response = await fetch('/api/cron/trigger', { method: 'POST' });
                const result = await response.json();
                
                if (result.success) {
                    statusDiv.innerHTML = \`<div class="status success"><strong>Success!</strong> Cron job executed successfully.</div>\`;
                } else {
                    statusDiv.innerHTML = \`<div class="status error"><strong>Error:</strong> \${result.message}</div>\`;
                }
            } catch (error) {
                statusDiv.innerHTML = \`<div class="status error"><strong>Error:</strong> \${error.message}</div>\`;
            }
        }
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
     */
    async scheduled(controller, env, ctx) {
        await handleScheduled(controller, env, ctx);
    },
};
