// Cloudflare Pages Function to handle all /api/* routes
// This file handles dynamic API routing using the [[path]] catch-all pattern

const SKILLS = [
    'attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer', 'magic', 'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking', 'crafting', 'smithing', 'mining', 'herblore', 'agility', 'thieving', 'slayer', 'farming', 'runecraft', 'hunter', 'construction'
];

const PLAYER_ACTIVITY_TYPES = {
    INACTIVE: { weight: 0, xpRange: [0, 200] },
    CASUAL: { weight: 40, xpRange: [200, 4000] },
    REGULAR: { weight: 30, xpRange: [4000, 15000] },
    HARDCORE: { weight: 20, xpRange: [15000, 40000] },
    ELITE: { weight: 10, xpRange: [40000, 120000] },
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
function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function weightedRandomActivity() {
    const entries = Object.entries(PLAYER_ACTIVITY_TYPES);
    const totalWeight = entries.reduce((a, [, v]) => a + v.weight, 0);
    let r = Math.random() * totalWeight;
    for (const [name, data] of entries) {
        if ((r -= data.weight) <= 0) return name;
    }
    return 'INACTIVE';
}

async function fetchRandomWords(count = 2) {
    try {
        const resp = await fetch(`https://random-word-api.herokuapp.com/word?number=${count}`, {
            cf: { cacheTtl: 60, cacheEverything: true }
        });
        if (!resp.ok) throw new Error('bad status');
        const data = await resp.json();
        if (Array.isArray(data)) return data;
    } catch (_) {
        const syllables = ["zor", "val", "dar", "mor", "lin", "bar", "rax", "zen", "tal", "fin", "gar", "zul", "ora", "ker", "nim", "jor", "sal", "ven", "qua", "lir"];
        const words = [];
        for (let i = 0; i < count; i++) {
            words.push((randomChoice(syllables) + randomChoice(syllables) + randomChoice(syllables)).slice(0, 8));
        }
        return words;
    }
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
        needsHpMigration: false,
        version: 1
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

        // Batch fetch in chunks to avoid overwhelming KV
        const chunkSize = 50;
        for (let i = 0; i < keys.length; i += chunkSize) {
            const slice = keys.slice(i, i + chunkSize);
            const values = await Promise.all(slice.map(k => env.HISCORES_KV.get(k)));
            values.forEach(v => {
                if (v) {
                    try {
                        users.push(JSON.parse(v));
                    } catch (_) { }
                }
            });
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
        const words = await fetchRandomWords(5);
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

    // Hard cap to avoid excessively huge payloads
    const HARD_CAP = 5000;
    if (limit > HARD_CAP) limit = HARD_CAP;
    const slice = users.slice(0, limit);

    return jsonResponse({
        generatedAt: Date.now(),
        totalPlayers: users.length,
        returned: slice.length,
        players: slice.map(u => ({
            username: u.username,
            totalLevel: u.totalLevel,
            totalXP: u.totalXP,
            rank: u.rank,
            updatedAt: u.updatedAt
        }))
    }, {
        headers: { 'cache-control': 'public, max-age=30' }
    });
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
        const arr = users.map(u => ({
            username: u.username,
            xp: u.skills[skill].xp,
            level: u.skills[skill].level
        })).sort((a, b) => b.xp - a.xp || a.username.localeCompare(b.username));
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
    for (const u of users) {
        if (u.needsHpMigration) {
            if (migrateHitpoints(u)) changed++;
            await putUser(env, u);
        }
    }
    return jsonResponse({ migrated: changed });
}

async function handleUserHpCheck(env, username) {
    const user = await getUser(env, username);
    if (!user) return notFound('User not found');
    const hp = user.skills.hitpoints;
    const correct = levelFromXp(hp.xp);
    const needs = hp.level !== correct || user.needsHpMigration;
    return jsonResponse({
        username: user.username,
        needsMigration: needs,
        currentLevel: hp.level,
        correctLevel: correct
    });
}

async function handleSeed(env, request) {
    if (!env.ADMIN_TOKEN || env.ADMIN_TOKEN === 'CHANGE_ME_ADMIN_TOKEN') {
        return jsonResponse({ error: 'Seed disabled (missing ADMIN_TOKEN)' }, { status: 403 });
    }
    const authToken = request.headers.get('x-admin-token') || new URL(request.url).searchParams.get('token');
    if (authToken !== env.ADMIN_TOKEN) return jsonResponse({ error: 'Unauthorized' }, { status: 401 });

    let payload;
    try {
        payload = await request.json();
    } catch (_) {
        return jsonResponse({ error: 'Invalid JSON' }, { status: 400 });
    }

    if (!payload || !Array.isArray(payload.usernames)) {
        return jsonResponse({ error: 'Expected { usernames: [] }' }, { status: 400 });
    }

    const input = payload.usernames.slice(0, 200); // safety cap
    const seen = new Set();
    const results = [];

    for (const raw of input) {
        const sanitized = sanitizeUsername(String(raw || '').trim());
        if (!sanitized) {
            results.push({ input: raw, ok: false, error: 'empty' });
            continue;
        }

        const key = sanitized.toLowerCase();
        if (seen.has(key)) {
            results.push({ username: sanitized, ok: false, error: 'duplicate_in_request' });
            continue;
        }
        seen.add(key);

        const existing = await getUser(env, sanitized);
        if (existing) {
            results.push({ username: sanitized, ok: false, error: 'exists' });
            continue;
        }

        const user = newUser(sanitized);
        await putUser(env, user);
        results.push({ username: sanitized, ok: true });
    }

    return jsonResponse({
        seeded: results.filter(r => r.ok).length,
        total: results.length,
        results
    });
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
        const activity = weightedRandomActivity();
        u.activity = activity;
        simulateUserProgress(u, activity, now);
        if (Math.random() < 0.01) u.needsHpMigration = true;
        await putUser(env, u);
    }

    const newCount = 1 + Math.floor(Math.random() * 3);
    let created = 0;
    const lowerSet = new Set(users.map(u => u.username.toLowerCase()));

    for (let i = 0; i < newCount; i++) {
        const words = await fetchRandomWords(2);
        const uname = sanitizeUsername(words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')) || 'Player' + Date.now();
        if (lowerSet.has(uname.toLowerCase())) continue;
        const u = newUser(uname);
        await putUser(env, u);
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
        'access-control-allow-headers': 'Content-Type'
    };
    const provided = init.headers || {};
    return new Response(JSON.stringify(obj), {
        ...init,
        headers: { ...baseHeaders, ...provided }
    });
}

function notFound(message = 'Not found') {
    return jsonResponse({ error: message }, { status: 404 });
}

// Main router function
async function router(request, env) {
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(p => p); // Remove empty parts
    const method = request.method.toUpperCase();

    // Remove 'api' from the beginning if it exists (since this function handles /api/* routes)
    if (pathParts[0] === 'api') {
        pathParts.shift();
    }

    const path = '/' + pathParts.join('/');

    // Route handlers
    if (path === '/health') return handleHealth();
    if (path === '/leaderboard' && method === 'GET') return handleLeaderboard(env, url);
    if (path === '/users' && method === 'GET') return handleUsersList(env);
    if (path === '/skill-rankings' && method === 'GET') return handleSkillRankings(env);
    if (path === '/cron/trigger' && method === 'POST') return handleCronTrigger(env);
    if (path === '/migrate/hitpoints' && method === 'POST') return handleHitpointsMigration(env);
    if (path === '/seed' && method === 'POST') return handleSeed(env, request);

    // User-specific routes
    const userMatch = path.match(/^\/users\/([^\/]+)$/);
    if (userMatch && method === 'GET') {
        return handleUser(env, decodeURIComponent(userMatch[1]));
    }

    const hpCheckMatch = path.match(/^\/users\/([^\/]+)\/hitpoints-check$/);
    if (hpCheckMatch && method === 'GET') {
        return handleUserHpCheck(env, decodeURIComponent(hpCheckMatch[1]));
    }

    // Handle CORS preflight
    if (method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'access-control-allow-origin': '*',
                'access-control-allow-methods': 'GET,POST,OPTIONS'
            }
        });
    }

    return notFound();
}

// Cloudflare Pages Function export
export async function onRequest(context) {
    const { request, env } = context;

    try {
        return await router(request, env);
    } catch (err) {
        console.error('API Error:', err);
        return jsonResponse({
            error: 'Internal error',
            detail: String(err)
        }, { status: 500 });
    }
}
