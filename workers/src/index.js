// osrs-hiscores-clone/workers/src/index.js

/**
 * OSRS Hiscores Cloudflare Worker
 * 
 * This worker provides an API for OSRS hiscores data and includes a scheduled
 * cron job that updates player XP and creates new random users.
 * 
 * MANUAL CRON EXECUTION:
 * To manually execute the cron job on demand:
 * 1. Send a POST request to: /api/cron/trigger
 * 2. Or use curl: curl -X POST "http://localhost:8787/api/cron/trigger"
 * 3. Check cron status: curl "http://localhost:8787/api/cron/status"
 * 
 * CRON TRIGGER TESTING (Local Development):
 * To test the cron trigger locally during development:
 * 1. Run `wrangler dev` to start the local development server
 * 2. Send a POST request to: http://localhost:8787/cdn-cgi/handler/scheduled
 * 3. Or use curl: curl -X POST "http://localhost:8787/cdn-cgi/handler/scheduled"
 * 
 * Optional testing parameters:
 * - Test with custom cron pattern: ?cron=*+*+*+*+*
 * - Test with custom time: ?time=1745856238
 * - Example: curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=0+*+*+*+*&time=1745856238"
 * 
 * PRODUCTION DEPLOYMENT:
 * The cron trigger is configured in wrangler.toml and runs automatically
 * every hour (0 * * * *) when deployed to Cloudflare Workers.
 */

import { handleFetch, handleScheduled, runScheduledUpdate } from './handlers.js';
import { generateNewUser } from './dataGenerator.js';
import { getUser, putUser } from './kvHelper.js';

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
