// Cloudflare Pages Function to handle all /api/* routes
// This file handles dynamic API routing using the [[path]] catch-all pattern

const SKILLS = [
    'attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer', 'magic', 'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking', 'crafting', 'smithing', 'mining', 'herblore', 'agility', 'thieving', 'slayer', 'farming', 'runecraft', 'hunter', 'construction'
];

// More granular activity types for a session
const PLAYER_ACTIVITY_TYPES = {
    INACTIVE: { xpRange: [0, 100] },
    BANK_STANDING: { xpRange: [100, 500] },
    CASUAL: { xpRange: [500, 3000] },
    FOCUSED: { xpRange: [3000, 12000] },
    HARDCORE: { xpRange: [12000, 50000] },
    GRINDING: { xpRange: [50000, 150000] },
    UNHEALTHY: { xpRange: [150000, 400000] },
};

// Player archetypes define long-term playstyle and are assigned once per user
const PLAYER_ARCHETYPES = {
    IDLER: { weight: 15 },
    CASUAL: { weight: 45 },
    FOCUSED: { weight: 25 },
    HARDCORE: { weight: 10 },
    ELITE_GRINDER: { weight: 5 },
};

// Determines the probability of a session activity based on a player's archetype
const ARCHETYPE_TO_ACTIVITY_PROBABILITY = {
    IDLER: { INACTIVE: 60, BANK_STANDING: 30, CASUAL: 10, FOCUSED: 0, HARDCORE: 0, GRINDING: 0, UNHEALTHY: 0 },
    CASUAL: { INACTIVE: 20, BANK_STANDING: 40, CASUAL: 30, FOCUSED: 10, HARDCORE: 0, GRINDING: 0, UNHEALTHY: 0 },
    FOCUSED: { INACTIVE: 5, BANK_STANDING: 15, CASUAL: 40, FOCUSED: 35, HARDCORE: 5, GRINDING: 0, UNHEALTHY: 0 },
    HARDCORE: { INACTIVE: 1, BANK_STANDING: 4, CASUAL: 15, FOCUSED: 40, HARDCORE: 35, GRINDING: 5, UNHEALTHY: 0 },
    ELITE_GRINDER: { INACTIVE: 0, BANK_STANDING: 1, CASUAL: 4, FOCUSED: 20, HARDCORE: 40, GRINDING: 30, UNHEALTHY: 5 },
};

const SKILL_POPULARITY = {
    attack: 1.1, defence: 1.0, strength: 1.15, hitpoints: 1.05, ranged: 1.05, prayer: 0.6, magic: 1.1,
    cooking: 0.9, woodcutting: 0.85, fletching: 0.75, fishing: 0.9, firemaking: 0.7, crafting: 0.65,
    smithing: 0.7, mining: 0.85, herblore: 0.55, agility: 0.6, thieving: 0.7, slayer: 0.8, farming: 0.6,
    runecraft: 0.4, hunter: 0.65, construction: 0.5
};

function weekendBonusMultiplier(date = new Date()) {
    const day = date.getUTCDay();
    return (day === 6 || day === 0) ? 1.15 : 1.0;
}

function levelFromXp(xp) {
    let points = 0;
    let output = 1;
    for (let lvl = 1; lvl <= 99; lvl++) {
        points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
        const exp = Math.floor(points / 4);
        if (exp > xp) return lvl;
        output = lvl;
    }
    return output;
}

function totalLevel(skills) { return SKILLS.reduce((sum, s) => sum + (skills[s]?.level || 1), 0); }
function totalXP(skills) { return SKILLS.reduce((sum, s) => sum + (skills[s]?.xp || 0), 0); }

// Generic function to make a weighted random choice from an object of weights.
function weightedRandomChoice(choices) {
    const totalWeight = Object.values(choices).reduce((sum, weight) => sum + weight, 0);
    if (totalWeight <= 0) return Object.keys(choices)[0] || null;
    let r = Math.random() * totalWeight;
    for (const [name, weight] of Object.entries(choices)) {
        if ((r -= weight) <= 0) return name;
    }
    return Object.keys(choices)[0];
}

function assignRandomArchetype() {
    const choices = Object.fromEntries(
        Object.entries(PLAYER_ARCHETYPES).map(([name, data]) => [name, data.weight])
    );
    return weightedRandomChoice(choices);
}

async function fetchRandomWords(count = 2, existingUsernames = new Set()) {
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));
    const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min; // inclusive
    const randomChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const roll = (p) => Math.random() < p;

    async function fetchBatch(n) {
        while (true) {
            try {
                const resp = await fetch(`https://random-word-api.herokuapp.com/word?number=${n}`, { cf: { cacheTtl: 60, cacheEverything: true } });
                if (!resp.ok) throw new Error("bad status");
                const data = await resp.json();
                if (Array.isArray(data) && data.length) return data.map(String);
            } catch (_) {
                // ignore and retry after a couple seconds
            }
            await sleep(2000);
        }
    }

    function buildName(w1, w2) {
        const p = randInt(20, 30) / 100;
        let useOneWord = roll(p);
        let joiner = "";
        if (!useOneWord && roll(p)) joiner = " ";
        if (!useOneWord && roll(p)) joiner = randomChoice(["-", "_"]);
        let base = useOneWord ? randomChoice([w1, w2]) : (w1 + joiner + w2);
        if (roll(p)) base = base.replace(/^[a-z]/, ch => ch.toUpperCase());
        if (roll(p)) {
            const num = String(randInt(1, 999));
            base = roll(0.5) ? (num + base) : (base + num);
        }
        if (base.length > 12) base = base.slice(0, 12);
        return base;
    }

    const results = [];
    const maxAttempts = count * 10;
    let attempts = 0;
    while (results.length < count && attempts < maxAttempts) {
        const need = Math.max(2, (count - results.length) * 2);
        const batch = await fetchBatch(need);
        for (let i = 0; i + 1 < batch.length && results.length < count; i += 2) {
            const w1 = String(batch[i] || "");
            const w2 = String(batch[i + 1] || "");
            const name = buildName(w1, w2);
            const sanitizedName = sanitizeUsername(name);
            if (sanitizedName && !existingUsernames.has(sanitizedName.toLowerCase())) {
                results.push(name);
                existingUsernames.add(sanitizedName.toLowerCase());
            }
            attempts++;
        }
    }
    return results;
}

function sanitizeUsername(name) {
    return name.replace(/[^a-zA-Z0-9_ -]/g, '').slice(0, 12);
}

function newUser(username) {
    const skills = {};
    SKILLS.forEach(s => { skills[s] = { xp: 0, level: 1 }; });
    skills.hitpoints.level = 10;
    skills.hitpoints.xp = 1154; // OSRS starting HP
    return {
        username,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        skills,
        totalLevel: totalLevel(skills),
        totalXP: totalXP(skills),
        activity: 'INACTIVE',
        archetype: assignRandomArchetype(),
        needsHpMigration: false,
        version: 2
    };
}

function recalcTotals(user) {
    user.totalLevel = totalLevel(user.skills);
    user.totalXP = totalXP(user.skills);
}

function applyXpGain(user, skill, gainedXp) {
    const s = user.skills[skill];
    s.xp += Math.floor(gainedXp);
    const newLevel = levelFromXp(s.xp);
    if (newLevel !== s.level) s.level = newLevel;
}

function simulateUserProgress(user, activityName, date = new Date()) {
    const act = PLAYER_ACTIVITY_TYPES[activityName];
    if (!act || act.xpRange[1] === 0) return;

    const [minXp, maxXp] = act.xpRange;
    const weekendMult = weekendBonusMultiplier(date);
    let budget = (Math.random() * (maxXp - minXp) + minXp) * weekendMult;
    const skillsChosen = [...SKILLS].sort(() => Math.random() - 0.5).slice(0, Math.ceil(Math.random() * 5));
    let totalWeight = skillsChosen.reduce((a, s) => a + (SKILL_POPULARITY[s] || 1), 0);

    for (const skill of skillsChosen) {
        const w = SKILL_POPULARITY[skill] || 1;
        const portion = budget * (w / totalWeight) * (0.8 + Math.random() * 0.4);
        applyXpGain(user, skill, portion);
    }
    user.updatedAt = Date.now();
    recalcTotals(user);
}

function migrateHitpoints(user) {
    const hp = user.skills.hitpoints;
    const correctLevel = levelFromXp(hp.xp);
    if (hp.level !== correctLevel) {
        hp.level = correctLevel;
        user.needsHpMigration = false;
        recalcTotals(user);
        return true;
    } else {
        user.needsHpMigration = false;
        return false;
    }
}

// KV operations
async function getAllUsers(env) {
    const users = [];
    let cursor;
    do {
        const list = await env.HISCORES_KV.list({ prefix: 'user:', cursor, limit: 1000 });
        cursor = list.cursor;
        const keys = list.keys.map(k => k.name);
        const chunkSize = 50;
        for (let i = 0; i < keys.length; i += chunkSize) {
            const slice = keys.slice(i, i + chunkSize);
            const values = await Promise.all(slice.map(k => env.HISCORES_KV.get(k)));
            values.forEach(v => { if (v) { try { users.push(JSON.parse(v)); } catch (_) { } } });
        }
        if (list.list_complete) break;
    } while (cursor);
    return users;
}

async function putUser(env, user) {
    await env.HISCORES_KV.put(`user:${user.username.toLowerCase()}`, JSON.stringify(user));
}

async function getUser(env, username) {
    const raw = await env.HISCORES_KV.get(`user:${username.toLowerCase()}`);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (_) {
        return null;
    }
}

async function ensureInitialData(env) {
    const existing = await env.HISCORES_KV.list({ prefix: 'user:', limit: 1 });
    if (existing.keys.length === 0) {
        const existingUsernames = new Set();
        const words = await fetchRandomWords(5, existingUsernames);
        await Promise.all(words.map(async w => {
            const username = sanitizeUsername(w.charAt(0).toUpperCase() + w.slice(1));
            const u = newUser(username);
            await putUser(env, u);
        }));
    }
}

// API Handlers
async function handleLeaderboard(env, url) {
    const users = await getAllUsers(env);
    users.sort((a, b) => b.totalLevel - a.totalLevel || b.totalXP - a.totalXP || a.username.localeCompare(b.username));
    users.forEach((u, i) => u.rank = i + 1);
    const limitParam = url.searchParams.get('limit');
    let limit = Number(limitParam);
    if (!Number.isFinite(limit) || limit <= 0) limit = users.length;
    const HARD_CAP = 5000;
    if (limit > HARD_CAP) limit = HARD_CAP;
    const slice = users.slice(0, limit);
    return jsonResponse({
        generatedAt: Date.now(), totalPlayers: users.length, returned: slice.length,
        players: slice.map(u => ({ username: u.username, totalLevel: u.totalLevel, totalXP: u.totalXP, rank: u.rank, updatedAt: u.updatedAt }))
    }, { headers: { 'cache-control': 'public, max-age=30' } });
}

async function handleUser(env, username) {
    const user = await getUser(env, username);
    if (!user) return notFound('User not found');
    return jsonResponse(user);
}

async function handleUsersList(env) {
    const users = await getAllUsers(env);
    return jsonResponse({ users: users.map(u => u.username).sort() });
}

async function handleSkillRankings(env) {
    const users = await getAllUsers(env);
    const rankings = {};
    for (const skill of SKILLS) {
        const arr = users.map(u => ({ username: u.username, xp: u.skills[skill].xp, level: u.skills[skill].level }))
            .sort((a, b) => b.xp - a.xp || a.username.localeCompare(b.username));
        arr.forEach((r, i) => r.rank = i + 1);
        rankings[skill] = arr;
    }
    return jsonResponse({ generatedAt: Date.now(), rankings });
}

function handleHealth() {
    return jsonResponse({ status: 'ok', time: Date.now() });
}

async function handleCronTrigger(env) {
    const result = await runScheduled(env);
    return jsonResponse({ triggered: true, ...result });
}

async function handleHitpointsMigration(env) {
    const users = await getAllUsers(env);
    let changed = 0;
    for (const u of users) { if (u.needsHpMigration) { if (migrateHitpoints(u)) changed++; await putUser(env, u); } }
    return jsonResponse({ migrated: changed });
}

async function handleUserHpCheck(env, username) {
    const user = await getUser(env, username);
    if (!user) return notFound('User not found');
    const hp = user.skills.hitpoints;
    const correct = levelFromXp(hp.xp);
    const needs = hp.level !== correct || user.needsHpMigration;
    return jsonResponse({ username: user.username, needsMigration: needs, currentLevel: hp.level, correctLevel: correct });
}

async function handleSeed(env, request) {
    if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN === 'CHANGE_ME_ADMIN_TOKEN') {
        return jsonResponse({ error: 'Seed disabled (missing ADMIN_TOKEN)' }, { status: 403 });
    }
    const authToken = request.headers.get('x-admin-token') || new URL(request.url).searchParams.get('token');
    if (authToken !== env.ADMIN_TOKEN) return jsonResponse({ error: 'Unauthorized' }, { status: 401 });
    let payload;
    try { payload = await request.json(); } catch (_) { return jsonResponse({ error: 'Invalid JSON' }, { status: 400 }); }
    if (!payload || !Array.isArray(payload.usernames)) return jsonResponse({ error: 'Expected { usernames: [] }' }, { status: 400 });
    const input = payload.usernames.slice(0, 200);
    const seen = new Set();
    const results = [];
    for (const raw of input) {
        const sanitized = sanitizeUsername(String(raw || '').trim());
        if (!sanitized) { results.push({ input: raw, ok: false, error: 'empty' }); continue; }
        const key = sanitized.toLowerCase();
        if (seen.has(key)) { results.push({ username: sanitized, ok: false, error: 'duplicate_in_request' }); continue; }
        seen.add(key);
        const existing = await getUser(env, sanitized);
        if (existing) { results.push({ username: sanitized, ok: false, error: 'exists' }); continue; }
        const user = newUser(sanitized);
        await putUser(env, user);
        results.push({ username: sanitized, ok: true });
    }
    return jsonResponse({ seeded: results.filter(r => r.ok).length, total: results.length, results });
}

async function runScheduled(env) {
    await ensureInitialData(env);
    const users = await getAllUsers(env);
    if (users.length === 0) return { processed: 0, newUsers: 0 };

    const now = new Date();
    const fraction = 0.10 + Math.random() * 0.25;
    const toUpdate = Math.max(1, Math.floor(users.length * fraction));
    const shuffled = [...users].sort(() => Math.random() - 0.5).slice(0, toUpdate);

    for (const u of shuffled) {
        // Migration: If user has no archetype, assign one. This makes the change non-breaking.
        if (!u.archetype) {
            u.archetype = assignRandomArchetype();
            u.version = 2; // Mark user object as updated to new schema
        }

        // Determine session activity based on the player's long-term archetype
        const activityProbs = ARCHETYPE_TO_ACTIVITY_PROBABILITY[u.archetype] || ARCHETYPE_TO_ACTIVITY_PROBABILITY.CASUAL;
        const activity = weightedRandomChoice(activityProbs);

        u.activity = activity;
        simulateUserProgress(u, activity, now);
        if (Math.random() < 0.01) u.needsHpMigration = true;
        await putUser(env, u);
    }

    const newCount = 1 + Math.floor(Math.random() * 3);
    let created = 0;
    const lowerSet = new Set(users.map(u => u.username.toLowerCase()));

    for (let i = 0; i < newCount; i++) {
        // Pass existing usernames to avoid creating duplicates within the same batch
        const words = await fetchRandomWords(2, lowerSet);
        const uname = sanitizeUsername(words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')) || 'Player' + Date.now();
        if (lowerSet.has(uname.toLowerCase())) continue;
        const u = newUser(uname);
        await putUser(env, u);
        lowerSet.add(uname.toLowerCase()); // Add new user to the set to avoid duplicates in this run
        created++;
    }

    return { processed: toUpdate, newUsers: created, totalPlayers: users.length + created };
}

// Utility functions
function jsonResponse(obj, init = {}) {
    const baseHeaders = {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'Content-Type, X-Admin-Token'
    };
    const provided = init.headers || {};
    return new Response(JSON.stringify(obj), { ...init, headers: { ...baseHeaders, ...provided } });
}

function notFound(message = 'Not found') {
    return jsonResponse({ error: message }, { status: 404 });
}

// Main router function
async function router(request, env) {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(p => p);
    const method = request.method.toUpperCase();

    if (pathParts[0] === 'api') { pathParts.shift(); }
    const path = '/' + pathParts.join('/');

    if (path === '/health') return handleHealth();
    if (path === '/debug') return jsonResponse({ path, originalPath: url.pathname, pathParts, method, hasKV: !!env.HISCORES_KV, availableBindings: Object.keys(env || {}), adminToken: !!env.ADMIN_TOKEN });
    if (path === '/leaderboard' && method === 'GET') return handleLeaderboard(env, url);
    if (path === '/users' && method === 'GET') return handleUsersList(env);
    if (path === '/skill-rankings' && method === 'GET') return handleSkillRankings(env);
    if (path === '/cron/trigger' && method === 'POST') return handleCronTrigger(env);
    if (path === '/migrate/hitpoints' && method === 'POST') return handleHitpointsMigration(env);
    if (path === '/seed' && method === 'POST') return handleSeed(env, request);

    const userMatch = path.match(/^\/users\/([^\/]+)$/);
    if (userMatch && method === 'GET') return handleUser(env, decodeURIComponent(userMatch[1]));

    const hpCheckMatch = path.match(/^\/users\/([^\/]+)\/hitpoints-check$/);
    if (hpCheckMatch && method === 'GET') return handleUserHpCheck(env, decodeURIComponent(hpCheckMatch[1]));

    if (method === 'OPTIONS') {
        return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'Content-Type, X-Admin-Token' } });
    }

    return notFound();
}

// Cloudflare Pages Function export
export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.HISCORES_KV) return jsonResponse({ error: 'KV binding not configured', message: 'HISCORES_KV binding is missing. Please configure it in Pages project settings.', availableBindings: Object.keys(env) }, { status: 500 });
        return await router(request, env);
    } catch (err) {
        console.error('API Error:', err);
        return jsonResponse({ error: 'Internal error', detail: String(err), stack: err.stack }, { status: 500 });
    }
}
