// osrs-hiscores-clone/workers/src/kvHelper.js

/**
 * Retrieves a user's data from the KV store.
 * @param {object} env - The worker environment containing the KV namespace.
 * @param {string} username - The username to look up.
 * @returns {Promise<object|null>} The user data object or null if not found.
 */
export async function getUser(env, username) {
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
export async function putUser(env, username, data) {
    const key = username.toLowerCase();
    await env.HISCORES_KV.put(key, JSON.stringify(data));
}

/**
 * Lists all keys (usernames) currently in the KV store.
 * @param {object} env - The worker environment containing the KV namespace.
 * @returns {Promise<object>} The result of the KV list operation.
 */
export async function listUsers(env) {
    return await env.HISCORES_KV.list();
}
