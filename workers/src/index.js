// OSRS Hiscores Clone Cloudflare Worker
// Implements endpoints for leaderboard, user stats, skill rankings, health, cron trigger, and hitpoints migration.
// Data stored in KV using key pattern: user:<username>
/* eslint-disable no-restricted-globals */

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
function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

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
    const randChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const roll = (p) => Math.random() < p;

    // --- heuristics to avoid gibberish ---
    const isAlpha = (w) => /^[a-z]+$/i.test(w);
    const hasVowel = (w) => /[aeiou]/i.test(w);
    const noLongConsonantRuns = (w) => !/[bcdfghjklmnpqrstvwxyz]{4,}/i.test(w);
    const looksLikeWord = (w) => isAlpha(w) && hasVowel(w) && noLongConsonantRuns(w);

    // Accept words 3..12 chars (12 to allow single-word usernames that exactly fit)
    const GOOD_MIN = 3;
    const GOOD_MAX = 12;

    function normalize(u) {
        return u.toLowerCase();
    }

    async function fetchBatch(n) {
        while (true) {
            try {
                const resp = await fetch(`https://random-word-api.herokuapp.com/word?number=${n}`, {
                    cf: { cacheTtl: 60, cacheEverything: true }
                });
                if (!resp.ok) throw new Error("bad status");
                const data = await resp.json();
                if (Array.isArray(data) && data.length) return data.map(String);
            } catch (_) {
                // ignore and retry after a couple seconds
            }
            await sleep(2000);
        }
    }

    function capFirst(w) {
        return w.replace(/^[a-z]/, ch => ch.toUpperCase());
    }

    // Build without ever slicing inside a word.
    // Return null if we can't make a clean <=12 username.
    function buildName(w1, w2) {
        // sanitize source words first
        const a = String(w1 || "").trim();
        const b = String(w2 || "").trim();

        const pool = [a, b].filter(
            w => w.length >= GOOD_MIN && w.length <= GOOD_MAX && looksLikeWord(w)
        );
        if (pool.length === 0) return null;

        // maybe try two-word combo
        const tryTwoWords = roll(0.5) && pool.length >= 2;
        const joiners = ["", " ", "-", "_"];

        // candidates list in preference order (shorter first helps fit within 12)
        const words = [...new Set(pool.map(w => w.toLowerCase()))].sort((x, y) => x.length - y.length);

        const combos = [];
        if (tryTwoWords && words.length >= 2) {
            const wA = words[0], wB = words[1];
            for (const j of joiners) {
                combos.push(capFirst(wA) + j + capFirst(wB));
                combos.push(capFirst(wB) + j + capFirst(wA));
            }
        }

        // always consider single-word options
        for (const w of words) combos.push(capFirst(w));

        // filter to <= 12 and not starting with a digit (we never prefix digits anyway)
        const clean = combos.filter(c => c.length <= 12 && !/^\d/.test(c));
        if (clean.length === 0) return null;

        // maybe add a numeric suffix (never prefix), keep within 12
        let base = randChoice(clean);
        if (roll(0.25)) {
            const suffix = String(randInt(1, 999));
            if (base.length + suffix.length <= 12) base = base + suffix;
        }

        // Final guardrails: still mustn’t start with a digit, must be whole words (it is), <=12.
        if (/^\d/.test(base) || base.length > 12) return null;

        return base;
    }

    const results = [];
    const maxAttempts = count * 20; // a bit more slack due to stricter filters
    let attempts = 0;

    while (results.length < count && attempts < maxAttempts) {
        const need = Math.max(6, (count - results.length) * 6); // fetch larger batches to find good words
        const batch = await fetchBatch(need);

        // prefilter words once to reduce noise
        const good = batch.filter(w =>
            typeof w === "string" &&
            looksLikeWord(w) &&
            w.length >= GOOD_MIN &&
            w.length <= GOOD_MAX
        );

        // walk pairs
        for (let i = 0; i + 1 < good.length && results.length < count; i += 2) {
            const w1 = good[i];
            const w2 = good[i + 1];

            const name = buildName(w1, w2);
            if (!name) { attempts++; continue; }

            const sanitizedName = sanitizeUsername(name);
            const key = normalize(sanitizedName);
            if (
                sanitizedName &&
                !/^\d/.test(sanitizedName) &&
                sanitizedName.length <= 12 &&
                !existingUsernames.has(key)
            ) {
                results.push(sanitizedName);
                existingUsernames.add(key);
            }
            attempts++;
        }
    }

    return results;
}

// keep it strict and short; no slicing mid-word happens before this point
function sanitizeUsername(name) {
    // allow letters, digits, underscore, space, hyphen
    let n = String(name || "").replace(/[^a-zA-Z0-9_ -]/g, "");
    // no leading spaces/hyphens/underscores
    n = n.replace(/^[_\-\s]+/, "");
    // hard cap (we already enforce complete words <=12)
    return n.slice(0, 12);
}

// unchanged:
function newUser(username) {
    const skills = {};
    SKILLS.forEach(s => { skills[s] = { xp: 0, level: 1 }; });
    skills.hitpoints.level = 10; skills.hitpoints.xp = 1154; // OSRS starting HP
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

function recalcTotals(user) { user.totalLevel = totalLevel(user.skills); user.totalXP = totalXP(user.skills); }
function applyXpGain(user, skill, gainedXp) { const s = user.skills[skill]; s.xp += Math.floor(gainedXp); const newLevel = levelFromXp(s.xp); if (newLevel !== s.level) s.level = newLevel; }
function simulateUserProgress(user, activityName, date = new Date()) {
    const act = PLAYER_ACTIVITY_TYPES[activityName]; if (!act || act.xpRange[1] === 0) return;
    const [minXp, maxXp] = act.xpRange; const weekendMult = weekendBonusMultiplier(date); let budget = (Math.random() * (maxXp - minXp) + minXp) * weekendMult;
    const skillsChosen = [...SKILLS].sort(() => Math.random() - 0.5).slice(0, Math.ceil(Math.random() * 5));
    let totalWeight = skillsChosen.reduce((a, s) => a + (SKILL_POPULARITY[s] || 1), 0);
    for (const skill of skillsChosen) {
        const w = SKILL_POPULARITY[skill] || 1; const portion = budget * (w / totalWeight) * (0.8 + Math.random() * 0.4); applyXpGain(user, skill, portion);
    }
    user.updatedAt = Date.now(); recalcTotals(user);
}
function migrateHitpoints(user) {
    const hp = user.skills.hitpoints; const correctLevel = levelFromXp(hp.xp); if (hp.level !== correctLevel) { hp.level = correctLevel; user.needsHpMigration = false; recalcTotals(user); return true; } else { user.needsHpMigration = false; return false; }
}

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
async function putUser(env, user) { await env.HISCORES_KV.put(`user:${user.username.toLowerCase()}`, JSON.stringify(user)); }
async function getUser(env, username) { const raw = await env.HISCORES_KV.get(`user:${username.toLowerCase()}`); if (!raw) return null; try { return JSON.parse(raw); } catch (_) { return null; } }
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
    return jsonResponse({ generatedAt: Date.now(), totalPlayers: users.length, returned: slice.length, players: slice.map(u => ({ username: u.username, totalLevel: u.totalLevel, totalXP: u.totalXP, rank: u.rank, updatedAt: u.updatedAt })) }, { headers: { 'cache-control': 'public, max-age=30' } });
}
async function handleUser(env, username) { const user = await getUser(env, username); if (!user) return notFound('User not found'); return jsonResponse(user); }
async function handleUsersList(env) { const users = await getAllUsers(env); return jsonResponse({ users: users.map(u => u.username).sort() }); }
async function handleSkillRankings(env) { const users = await getAllUsers(env); const rankings = {}; for (const skill of SKILLS) { const arr = users.map(u => ({ username: u.username, xp: u.skills[skill].xp, level: u.skills[skill].level })).sort((a, b) => b.xp - a.xp || a.username.localeCompare(b.username)); arr.forEach((r, i) => r.rank = i + 1); rankings[skill] = arr; } return jsonResponse({ generatedAt: Date.now(), rankings }); }
function handleHealth() { return jsonResponse({ status: 'ok', time: Date.now() }); }
async function handleCronTrigger(env) { const result = await runScheduled(env); return jsonResponse({ triggered: true, ...result }); }
async function handleHitpointsMigration(env) { const users = await getAllUsers(env); let changed = 0; for (const u of users) { if (u.needsHpMigration) { if (migrateHitpoints(u)) changed++; await putUser(env, u); } } return jsonResponse({ migrated: changed }); }
async function handleUserHpCheck(env, username) { const user = await getUser(env, username); if (!user) return notFound('User not found'); const hp = user.skills.hitpoints; const correct = levelFromXp(hp.xp); const needs = hp.level !== correct || user.needsHpMigration; return jsonResponse({ username: user.username, needsMigration: needs, currentLevel: hp.level, correctLevel: correct }); }

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

// Admin: delete users in batches (Worker version)
async function handleDeleteUsersBatch(env, request) {
    // Unprotected endpoint (requested). Use dryRun and limit as safety rails.
    const url = new URL(request.url);
    let payload = {};
    try { if (request.headers.get('content-type')?.includes('application/json')) payload = await request.json(); } catch (_) { /* ignore */ }

    const dryRun = Boolean(payload?.dryRun);
    const limitRaw = Number(payload?.limit);
    let limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 100;
    const HARD_CAP = 1000; if (limit > HARD_CAP) limit = HARD_CAP;

    // Interpret olderThan as days (e.g., 1 => older than 1 day)
    const olderThanInput = payload?.olderThan;
    let olderThanTs = null;
    if (olderThanInput !== undefined && olderThanInput !== null) {
        const days = Number(olderThanInput);
        if (Number.isFinite(days) && days > 0) {
            olderThanTs = Date.now() - (days * 24 * 60 * 60 * 1000);
        }
    }

    const byUsernames = Array.isArray(payload?.usernames) ? payload.usernames : null;

    const keysToDelete = [];

    function kvKeyFromUsername(name) {
        const sanitized = sanitizeUsername(String(name || '').trim());
        if (!sanitized) return null;
        return `user:${sanitized.toLowerCase()}`;
    }

    if (byUsernames && byUsernames.length) {
        const seen = new Set();
        for (const raw of byUsernames) {
            const key = kvKeyFromUsername(raw);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            keysToDelete.push(key);
            if (keysToDelete.length >= limit) break;
        }
    } else {
        // Auto-paginate until we gather up to `limit` keys to delete
        let cursor;
        do {
            const page = await env.HISCORES_KV.list({ prefix: 'user:', limit: Math.min(1000, limit), cursor });
            cursor = page.list_complete ? undefined : page.cursor;
            if (olderThanTs == null) {
                for (const k of page.keys) {
                    if (keysToDelete.length >= limit) break;
                    keysToDelete.push(k.name);
                }
            } else {
                const chunkSize = 50;
                for (let i = 0; i < page.keys.length && keysToDelete.length < limit; i += chunkSize) {
                    const slice = page.keys.slice(i, i + chunkSize);
                    const values = await Promise.all(slice.map(k => env.HISCORES_KV.get(k.name)));
                    for (let j = 0; j < values.length && keysToDelete.length < limit; j++) {
                        const v = values[j]; if (!v) continue;
                        try {
                            const obj = JSON.parse(v);
                            const ts = Number(obj?.updatedAt || obj?.createdAt || 0);
                            if (Number.isFinite(ts) && ts < olderThanTs) keysToDelete.push(slice[j].name);
                        } catch (_) { /* skip malformed */ }
                    }
                }
            }
            if (keysToDelete.length >= limit) break;
        } while (cursor);
    }

    if (dryRun) {
        return jsonResponse({ dryRun: true, count: keysToDelete.length, keys: keysToDelete });
    }

    const chunk = (arr, n) => arr.reduce((acc, _, i) => (i % n ? acc : [...acc, arr.slice(i, i + n)]), []);
    const batches = chunk(keysToDelete, 50);
    let deleted = 0;
    for (const b of batches) {
        await Promise.all(b.map(k => env.HISCORES_KV.delete(k).then(() => { deleted++; }).catch(() => { })));
    }
    return jsonResponse({ deleted, requested: keysToDelete.length });
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
        const words = await fetchRandomWords(2, new Set(lowerSet));
        const uname = sanitizeUsername(words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')) || 'Player' + Date.now();
        if (lowerSet.has(uname.toLowerCase())) continue;
        const u = newUser(uname);
        await putUser(env, u);
        created++;
    }
    return { processed: toUpdate, newUsers: created, totalPlayers: users.length + created };
}

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
function notFound(message = 'Not found') { return jsonResponse({ error: message }, { status: 404 }); }

async function router(request, env) {
    const url = new URL(request.url); const path = url.pathname; const method = request.method.toUpperCase();
    if (path === '/api/health') return handleHealth();
    if (path === '/api/leaderboard' && method === 'GET') return handleLeaderboard(env, url);
    if (path === '/api/users' && method === 'GET') return handleUsersList(env);
    if (path === '/api/skill-rankings' && method === 'GET') return handleSkillRankings(env);
    if (path === '/api/cron/trigger' && method === 'POST') return handleCronTrigger(env);
    if (path === '/api/migrate/hitpoints' && method === 'POST') return handleHitpointsMigration(env);
    if (path === '/api/seed' && method === 'POST') return handleSeed(env, request);
    if (path === '/api/admin/users/delete-batch' && method === 'POST') return handleDeleteUsersBatch(env, request);
    const userMatch = path.match(/^\/api\/users\/([^\/]+)$/); if (userMatch && method === 'GET') return handleUser(env, decodeURIComponent(userMatch[1]));
    const hpCheckMatch = path.match(/^\/api\/users\/([^\/]+)\/hitpoints-check$/); if (hpCheckMatch && method === 'GET') return handleUserHpCheck(env, decodeURIComponent(hpCheckMatch[1]));
    if (method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'Content-Type, X-Admin-Token' } });
    return notFound();
}

export default {
    async fetch(request, env) { try { return await router(request, env); } catch (err) { return jsonResponse({ error: 'Internal error', detail: String(err) }, { status: 500 }); } },
    async scheduled(_event, env, ctx) { ctx.waitUntil(runScheduled(env)); }
};
