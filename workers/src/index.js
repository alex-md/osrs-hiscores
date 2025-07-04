// osrs-hiscores-clone/workers/src/index.js

import { handleFetch, handleScheduled } from './handlers.js';
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

        return handleFetch(request, env);
    },

    /**
     * The scheduled handler is triggered by the cron schedule.
     * @param {ScheduledEvent} event - Details about the scheduled event.
     * @param {object} env - The worker's environment variables and bindings.
     * @param {ExecutionContext} ctx - The execution context.
     */
    async scheduled(event, env, ctx) {
        await handleScheduled(event, env, ctx);
    },
};
