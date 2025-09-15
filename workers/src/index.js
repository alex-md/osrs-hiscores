// OSRS Hiscores Clone Cloudflare Worker
// Implements endpoints for leaderboard, user stats, skill rankings, health, cron trigger, and hitpoints migration.
// Data stored in KV using key pattern: user:<username>
/* eslint-disable no-restricted-globals */

import {
    SKILLS,
    PLAYER_ACTIVITY_TYPES,
    PLAYER_ARCHETYPES,
    ARCHETYPE_TO_ACTIVITY_PROBABILITY,
    SKILL_POPULARITY
} from './constants.js';
import {
    computeAchievementContext,
    evaluateAchievements,
    mergeNewUnlocks,
    computePrevalenceCounts,
    pruneAchievementFamilies,
    pruneTotalMilestones,
    ACHIEVEMENT_KEYS
} from './achievements.js';
import {
    weekendBonusMultiplier,
    levelFromXp,
    totalLevel,
    totalXP,
    weightedRandomChoice,
    assignRandomArchetype,
    sanitizeUsername,
    fetchRandomWords,
    inferMetaTierWithContext,
    sampleInitialTotalXP,
    distributeInitialXP,
    assignArchetypeForTotalXP,
    computeHitpointsLevelFromCombat,
    xpForLevel
} from './utils.js';

// Lightweight per-isolate memory cache and throttling to lower KV pressure
const __memCache = new Map(); // key -> { value, expires }
const __inflight = new Map(); // key -> Promise

function nowMs() { return Date.now(); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Shared small utility to split an array into chunks of size n
const chunk = (arr, n) => arr.reduce((acc, _, i) => (i % n ? acc : [...acc, arr.slice(i, i + n)]), []);

function memGet(key) {
    const e = __memCache.get(key);
    if (!e) return undefined;
    if (e.expires <= nowMs()) { __memCache.delete(key); return undefined; }
    return e.value;
}

function memSet(key, value, ttlSeconds = 10) {
    const ttl = Math.max(0, Number(ttlSeconds) || 0);
    if (ttl <= 0) { __memCache.delete(key); return; }
    __memCache.set(key, { value, expires: nowMs() + ttl * 1000 });
}

async function withInflightDedup(key, fn) {
    if (__inflight.has(key)) return __inflight.get(key);
    const p = (async () => {
        try { return await fn(); }
        finally { __inflight.delete(key); }
    })();
    __inflight.set(key, p);
    return p;
}

// KV get with brief per-isolate memoization and inflight dedupe
async function kvGetCached(env, key, { ttlSeconds = 10 } = {}) {
    const memKey = `kv:text:${key}`;
    const cached = memGet(memKey);
    if (cached !== undefined) return cached;
    return withInflightDedup(memKey, async () => {
        const raw = await env.HISCORES_KV.get(key);
        memSet(memKey, raw, ttlSeconds);
        return raw;
    });
}

// Limit parallel async ops
async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let i = 0; let running = 0;
    return new Promise((resolve) => {
        const pump = () => {
            while (running < limit && i < items.length) {
                const idx = i++;
                running++;
                Promise.resolve(mapper(items[idx], idx))
                    .then(v => { results[idx] = v; })
                    .catch(err => { results[idx] = undefined; console.log('KV op error:', String(err)); })
                    .finally(() => { running--; if (i >= items.length && running === 0) resolve(results); else pump(); });
            }
            if (i >= items.length && running === 0) resolve(results);
        };
        if (!items.length) resolve(results); else pump();
    });
}

// Cache API wrapper for GET routes; respects response cache-control
async function cacheResponseIfPossible(request, compute) {
    if ((request.method || 'GET').toUpperCase() !== 'GET') return compute();
    try {
        const cache = caches.default;
        const hit = await cache.match(request);
        if (hit) return hit;
        const resp = await compute();
        const cc = (resp.headers.get('cache-control') || '').toLowerCase();
        if (!cc.includes('no-store')) {
            try { await cache.put(request, resp.clone()); } catch (_) { }
        }
        return resp;
    } catch (_) {
        return compute();
    }
}

function newUser(username) {
    // 1. Sample an initial total XP budget (top heavy; per-tier power-law weighting)
    const totalInitialXP = sampleInitialTotalXP();
    // 2. Distribute across skills (hitpoints baseline handled after)
    const distributed = distributeInitialXP(totalInitialXP);
    const skills = {};
    for (const s of SKILLS) {
        if (s === 'hitpoints') continue; // handle after baseline
        const xp = distributed[s] || 1_154;
        skills[s] = { xp, level: levelFromXp(xp) };
    }
    // 3. Derive hitpoints from combat stats average (attack/strength/defence/ranged/magic/prayer)
    const hpLevel = computeHitpointsLevelFromCombat(skills);
    const hpXp = xpForLevel(hpLevel);
    skills.hitpoints = { xp: hpXp, level: hpLevel };
    // 4. Recalculate totals (includes HP baseline; adds a small extra XP on top of sampled distribution)
    //    Because we fixed HP at 1_154 we add it only if not already in distributed map; distributed excludes HP.
    const userTotalLevel = totalLevel(skills);
    const userTotalXP = totalXP(skills);
    // 5. Archetype assignment influenced by total XP (rarer archetypes more likely for very high XP)
    const archetype = assignArchetypeForTotalXP(userTotalXP);
    return {
        username,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        skills,
        totalLevel: userTotalLevel,
        totalXP: userTotalXP,
        activity: "INACTIVE",
        archetype,
        achievements: {},
        needsHpMigration: false,
        version: 3
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
    }
    user.needsHpMigration = false;
    return false;
}

async function getAllUsers(env, opts = {}) {
    const { fresh = false } = opts;
    const MEM_KEY = 'all-users:v2';
    if (!fresh) {
        const cached = memGet(MEM_KEY);
        if (cached) return cached;
    }

    const users = [];
    let cursor;
    const perPageLimit = 1000;
    const getConcurrency = Math.min(16, Math.max(1, Number(env.KV_GET_CONCURRENCY) || 8));
    const betweenPageDelayMs = Math.max(0, Number(env.KV_LIST_PAGE_DELAY_MS) || 10);
    do {
        const list = await env.HISCORES_KV.list({ prefix: 'user:', cursor, limit: perPageLimit });
        cursor = list.list_complete ? undefined : list.cursor;
        const keys = list.keys.map(k => k.name);
        const values = await mapWithConcurrency(keys, getConcurrency, async (k) => kvGetCached(env, k, { ttlSeconds: 10 }));
        for (const v of values) {
            if (!v) continue;
            try { users.push(JSON.parse(v)); } catch (_) { }
        }
        if (cursor && betweenPageDelayMs) await sleep(betweenPageDelayMs);
    } while (cursor);
    memSet(MEM_KEY, users, 10);
    return users;
}

async function putUser(env, user) {
    await env.HISCORES_KV.put(`user:${user.username.toLowerCase()}`, JSON.stringify(user));
    // Invalidate memory caches best-effort
    __memCache.delete('all-users:v2');
    __memCache.delete(`kv:text:user:${user.username.toLowerCase()}`);
}

async function getUser(env, username) {
    const raw = await kvGetCached(env, `user:${username.toLowerCase()}`, { ttlSeconds: 15 });
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (_) { return null; }
}

async function ensureInitialData(env) {
    const existing = await env.HISCORES_KV.list({ prefix: 'user:', limit: 1 });
    if (existing.keys.length === 0) {
        const existingUsernames = new Set();
        // Generate 5 initial users using TWDNE + fallback
        for (let i = 0; i < 5; i++) {
            const username = await generateUsername(env, existingUsernames);
            existingUsernames.add(username.toLowerCase());
            const u = newUser(username);
            await putUser(env, u);
        }
    }
}

// Persist global achievements statistics and firsts mapping
async function persistAchievementStats(env, users) {
    try {
        const ctx = computeAchievementContext(users);
        // Evaluate and persist new unlocks per user
        const firstsRaw = await env.HISCORES_KV.get('ach:firsts');
        let firsts = {};
        if (firstsRaw) {
            try { firsts = JSON.parse(firstsRaw) || {}; } catch (_) { firsts = {}; }
        }
        // Load or initialize upgraded firsts structure (v2)
        // Schema: { version:2, updatedAt, keys: { achKey: { username, timestamp } }, counts: { achKey: number } }
        let firstsV2Raw = null;
        let firstsV2 = null;
        try { firstsV2Raw = await env.HISCORES_KV.get('ach:firsts:v2'); } catch (_) { }
        if (firstsV2Raw) {
            try { firstsV2 = JSON.parse(firstsV2Raw) || null; } catch (_) { firstsV2 = null; }
        }
        if (!firstsV2 || firstsV2.version !== 2) {
            // Bootstrap from legacy mapping if present
            firstsV2 = { version: 2, updatedAt: 0, keys: {}, counts: {} };
            for (const [k, v] of Object.entries(firsts)) {
                if (v && v.username && v.timestamp) firstsV2.keys[k] = { username: v.username, timestamp: v.timestamp, source: 'legacy' };
            }
        }
        const events = [];
        const updatedUsers = [];
        const now = Date.now();
        for (const u of users) {
            const got = evaluateAchievements(u, ctx);
            const newly = mergeNewUnlocks(u, got, now);
            // Always prune achievement families to keep only the highest per category (e.g., total level milestones)
            const pruned = pruneAchievementFamilies(u);
            if (newly.length) {
                updatedUsers.push(u);
                for (const key of newly) {
                    if (!firsts[key]) {
                        firsts[key] = { username: u.username, timestamp: now };
                        events.push({ key, username: u.username, timestamp: now });
                    }
                    // v2: record counts & firsts
                    firstsV2.counts[key] = (firstsV2.counts[key] || 0) + 1;
                    if (!firstsV2.keys[key]) {
                        firstsV2.keys[key] = { username: u.username, timestamp: now, source: 'live' };
                        events.push({ key, username: u.username, timestamp: now, v2: true });
                    }
                }
            }
            // If pruning removed any keys, persist as well
            if (pruned && pruned.length && !updatedUsers.includes(u)) {
                updatedUsers.push(u);
            }
        }
        // Persist users that changed
        for (const u of updatedUsers) {
            await putUser(env, u);
        }
        // Prevalence counts
        const countsMap = computePrevalenceCounts(users, ctx);
        const countsObj = Object.fromEntries(ACHIEVEMENT_KEYS.map(k => [k, countsMap.get(k) || 0]));
        await env.HISCORES_KV.put('stats:achievements:prevalence', JSON.stringify({
            updatedAt: Date.now(),
            totalPlayers: users.length,
            counts: countsObj
        }));
        // Initialize missing counts in v2 model using prevalence snapshot (best-effort bootstrap)
        for (const k of ACHIEVEMENT_KEYS) {
            if (firstsV2.counts[k] === undefined) firstsV2.counts[k] = countsObj[k] || 0;
        }
        // Reconciliation: for each achievement where we have user timestamps that predate stored first
        // (Only possible for non-pruned achievements; pruned families lose historical timestamps.)
        try {
            for (const k of ACHIEVEMENT_KEYS) {
                let earliest = null; // { username, timestamp }
                for (const u of users) {
                    const ts = u?.achievements?.[k];
                    if (!ts) continue;
                    const numTs = Number(ts) || 0;
                    if (!earliest || numTs < earliest.timestamp) {
                        earliest = { username: u.username, timestamp: numTs };
                    }
                }
                if (earliest) {
                    const existing = firstsV2.keys[k];
                    if (!existing || earliest.timestamp < existing.timestamp) {
                        firstsV2.keys[k] = { username: earliest.username, timestamp: earliest.timestamp, source: existing ? 'reconciled-earlier' : 'reconciled-new' };
                    }
                }
                // Ensure legacy map stays in sync for compatibility (do not overwrite an earlier legacy first)
                if (firstsV2.keys[k] && (!firsts[k] || firstsV2.keys[k].timestamp < firsts[k].timestamp)) {
                    firsts[k] = { username: firstsV2.keys[k].username, timestamp: firstsV2.keys[k].timestamp };
                }
            }
        } catch (reconErr) {
            console.log('firsts reconciliation error:', String(reconErr));
        }
        firstsV2.updatedAt = Date.now();
        // Save firsts mapping
        await env.HISCORES_KV.put('ach:firsts', JSON.stringify(firsts));
        await env.HISCORES_KV.put('ach:firsts:v2', JSON.stringify(firstsV2));
        // Append to events list (trimmed)
        if (events.length) {
            let log = { updatedAt: now, events: [] };
            try {
                const raw = await env.HISCORES_KV.get('ach:events');
                if (raw) log = JSON.parse(raw) || log;
            } catch (_) { }
            log.events = [...events, ...(Array.isArray(log.events) ? log.events : [])].slice(0, 100);
            log.updatedAt = now;
            await env.HISCORES_KV.put('ach:events', JSON.stringify(log));
        }
    } catch (err) {
        console.log('persistAchievementStats error:', String(err));
    }
}

async function handleLeaderboard(env, url) {
    const users = await getAllUsers(env, { fresh: false });
    // Use achievement context to avoid recomputing per-skill scans
    const ctx = computeAchievementContext(users, { useCache: true });
    const top1ByUser = ctx.top1SkillsByUserCount || new Map();
    // Ensure rank on each user aligns with context
    users.sort((a, b) => b.totalLevel - a.totalLevel || b.totalXP - a.totalXP || a.username.localeCompare(b.username));
    users.forEach((u) => { u.rank = ctx.rankByUser?.get(String(u.username || '').toLowerCase()) || u.rank || 0; });

    // Compute tier prevalence for quick frontend stats
    const tierCounts = { Novice: 0, Bronze: 0, Silver: 0, Gold: 0, Platinum: 0, Diamond: 0, Master: 0, Grandmaster: 0, Adept: 0, Expert: 0 };
    const playersOut = [];
    for (const u of users) {
        const perUserCtx = { rank: u.rank, totalPlayers: users.length, top1SkillsCount: top1ByUser.get((u.username || '').toLowerCase()) || 0 };
        const tierInfo = inferMetaTierWithContext(u, perUserCtx);
        tierCounts[tierInfo.name] = (tierCounts[tierInfo.name] || 0) + 1;
        playersOut.push({
            username: u.username,
            totalLevel: u.totalLevel,
            totalXP: u.totalXP,
            rank: u.rank,
            updatedAt: u.updatedAt,
            archetype: u.archetype || null,
            tier: tierInfo.name,
            tierInfo: { ...tierInfo, top1Skills: perUserCtx.top1SkillsCount }
        });
    }
    const limitParam = url.searchParams.get('limit');
    let limit = Number(limitParam);
    if (!Number.isFinite(limit) || limit <= 0) limit = users.length;
    const HARD_CAP = 5000;
    if (limit > HARD_CAP) limit = HARD_CAP;
    const slice = playersOut.slice(0, limit);
    return jsonResponse({
        generatedAt: Date.now(),
        totalPlayers: users.length,
        tiers: tierCounts,
        returned: slice.length,
        players: slice
    }, { headers: { 'cache-control': 'public, max-age=30' } });
}

async function handleUser(env, username) {
    const user = await getUser(env, username);
    if (!user) return notFound('User not found');
    return jsonResponse(user, { headers: { 'cache-control': 'public, max-age=15' } });
}

async function handleUsersList(env) {
    const users = await getAllUsers(env, { fresh: false });
    return jsonResponse({ users: users.map(u => u.username).sort() }, { headers: { 'cache-control': 'public, max-age=120' } });
}

async function handleSkillRankings(env) {
    const users = await getAllUsers(env, { fresh: false });
    const rankings = {};
    for (const skill of SKILLS) {
        const arr = users
            .map(u => ({ username: u.username, xp: u.skills[skill].xp, level: u.skills[skill].level }))
            .sort((a, b) => b.xp - a.xp || a.username.localeCompare(b.username));
        arr.forEach((r, i) => r.rank = i + 1);
        rankings[skill] = arr;
    }
    return jsonResponse({ generatedAt: Date.now(), rankings }, { headers: { 'cache-control': 'public, max-age=30' } });
}

function handleHealth() {
    return jsonResponse({ status: 'ok', time: Date.now() }, { headers: { 'cache-control': 'no-store' } });
}

async function handleUserAchievements(env, username) {
    const user = await getUser(env, username);
    if (!user) return notFound('User not found');
    // Prepare a filtered view that keeps only the highest total-* milestone (non-mutating)
    const ach = pruneTotalMilestones(user.achievements || {});
    return jsonResponse({ username: user.username, achievements: ach, generatedAt: Date.now() }, { headers: { 'cache-control': 'public, max-age=30' } });
}

async function handleAchievementsStats(env) {
    let raw = await env.HISCORES_KV.get('stats:achievements:prevalence');
    let payload = null;
    try { if (raw) payload = JSON.parse(raw); } catch (_) { }
    if (!payload) {
        // Compute on-demand as a fallback
        try {
            const users = await getAllUsers(env, { fresh: true });
            const ctx = computeAchievementContext(users);
            const countsMap = computePrevalenceCounts(users, ctx);
            const countsObj = Object.fromEntries(ACHIEVEMENT_KEYS.map(k => [k, countsMap.get(k) || 0]));
            payload = { updatedAt: Date.now(), totalPlayers: users.length, counts: countsObj };
            await env.HISCORES_KV.put('stats:achievements:prevalence', JSON.stringify(payload));
        } catch (_) {
            payload = { updatedAt: 0, totalPlayers: 0, counts: {} };
        }
    }
    return jsonResponse(payload, { headers: { 'cache-control': 'public, max-age=30' } });
}

async function handleAchievementsFirsts(env) {
    // Prefer v2 structure if present
    let v2Raw = null; let v2 = null;
    try { v2Raw = await env.HISCORES_KV.get('ach:firsts:v2'); } catch (_) { }
    if (v2Raw) {
        try { v2 = JSON.parse(v2Raw) || null; } catch (_) { v2 = null; }
    }
    let legacyRaw = await env.HISCORES_KV.get('ach:firsts');
    let legacy = null;
    try { if (legacyRaw) legacy = JSON.parse(legacyRaw) || null; } catch (_) { legacy = null; }
    if (!v2) {
        // Fallback: reconstruct both legacy & v2 from user data
        try {
            const users = await getAllUsers(env, { fresh: true });
            const best = {};
            for (const u of users) {
                const ach = u?.achievements || {};
                for (const [k, ts] of Object.entries(ach)) {
                    const numTs = Number(ts) || 0;
                    if (!best[k] || numTs < best[k].timestamp) {
                        best[k] = { username: u.username, timestamp: numTs };
                    }
                }
            }
            legacy = best;
            v2 = { version: 2, updatedAt: Date.now(), keys: {}, counts: {} };
            for (const [k, v] of Object.entries(best)) v2.keys[k] = { username: v.username, timestamp: v.timestamp, source: 'reconstructed' };
            await env.HISCORES_KV.put('ach:firsts', JSON.stringify(legacy));
            await env.HISCORES_KV.put('ach:firsts:v2', JSON.stringify(v2));
        } catch (reconErr) {
            legacy = legacy || {};
            v2 = v2 || { version: 2, updatedAt: Date.now(), keys: {}, counts: {} };
            console.log('firsts reconstruction error:', String(reconErr));
        }
    }
    // Build response merging legacy for backward compatibility (legacy map can be derived from v2.keys)
    const mergedLegacy = legacy || (v2 ? Object.fromEntries(Object.entries(v2.keys || {}).map(([k, v]) => [k, { username: v.username, timestamp: v.timestamp }])) : {});
    // Attach enriched metadata: counts, percentages, rarity tiers
    let counts = {}; let totalPlayers = 0;
    try {
        const statsRaw = await env.HISCORES_KV.get('stats:achievements:prevalence');
        if (statsRaw) {
            try {
                const stats = JSON.parse(statsRaw) || {};
                counts = stats.counts || {};
                totalPlayers = Number(stats.totalPlayers) || 0;
            } catch (_) { }
        }
    } catch (_) { }
    // Derive percentages and dynamic rarity (same thresholds as frontend; keep in sync)
    const rarityFor = (pct) => {
        if (pct <= 0) return 'mythic';
        if (pct < 0.05) return 'mythic';
        if (pct < 0.2) return 'legendary';
        if (pct < 1) return 'epic';
        if (pct < 5) return 'rare';
        if (pct < 15) return 'uncommon';
        return 'common';
    };
    const enriched = {};
    for (const key of Object.keys(mergedLegacy)) {
        const first = mergedLegacy[key];
        const count = counts[key] || 0;
        const pct = totalPlayers > 0 ? (count / totalPlayers) * 100 : 0;
        enriched[key] = { ...first, count, pct, rarity: rarityFor(pct) };
    }
    return jsonResponse({ updatedAt: Date.now(), totalPlayers, counts, firsts: mergedLegacy, enriched, v2 }, { headers: { 'cache-control': 'public, max-age=30' } });
}

async function handleFakeWord(env) {
    const CACHE_KEY = 'cache:twodne:word';
    const CACHE_TTL = 600; // 10 minutes
    const SCRAPING_ENABLED = env.ALLOW_TWODNE_SCRAPE !== 'false'; // Default to true unless explicitly false

    // Check cache first
    const cached = await env.HISCORES_KV.get(CACHE_KEY);
    if (cached) {
        try {
            const data = JSON.parse(cached);
            return jsonResponse({ word: data.word, cached: true }, { headers: { 'cache-control': 'public, max-age=60' } });
        } catch (_) {
            // Cache corrupted, continue to fetch fresh
        }
    }

    let word = null;
    let fallback = false;

    // Try scraping if enabled
    if (SCRAPING_ENABLED) {
        try {
            word = await scrapeWordFromTWDNE();
        } catch (err) {
            console.log('Scraping failed:', err.message);
            // Continue to fallback
        }
    }

    // Fallback to local generator if scraping failed or disabled
    if (!word) {
        word = await generateFallbackWord(env);
        fallback = true;
    }

    // Sanitize the word
    const sanitizedWord = sanitizeUsername(word);
    if (!sanitizedWord) {
        // Last resort fallback
        const finalWord = 'Player' + Math.floor(Math.random() * 10000);
        return jsonResponse({ word: finalWord, cached: false, fallback: true }, { headers: { 'cache-control': 'public, max-age=60' } });
    }

    // Cache the result
    try {
        await env.HISCORES_KV.put(CACHE_KEY, JSON.stringify({ word: sanitizedWord }), { expirationTtl: CACHE_TTL });
    } catch (err) {
        console.log('Cache write failed:', err.message);
    }

    const response = { word: sanitizedWord, cached: false };
    if (fallback) response.fallback = true;

    return jsonResponse(response, { headers: { 'cache-control': 'public, max-age=60' } });
}

async function scrapeWordFromTWDNE() {
    const response = await fetch('https://www.thisworddoesnotexist.com/', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; osrs-hiscores/1.0)',
            'Accept-Language': 'en-US,en;q=0.9'
        },
        cf: { cacheTtl: 300, cacheEverything: true }
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    let word = null;

    // Try HTMLRewriter first
    const rewriter = new HTMLRewriter()
        .on('#definition-word, h1, .word, #word, .word-text', {
            text(text) {
                if (!word && text.text) {
                    const candidate = text.text.trim().split(/\s+/)[0];
                    if (candidate && /^[a-zA-Z]+$/.test(candidate)) {
                        word = candidate;
                    }
                }
            }
        });

    const rewrittenResponse = rewriter.transform(response.clone());
    await rewrittenResponse.text(); // Process the HTMLRewriter

    // If HTMLRewriter didn't find anything, try regex fallback
    if (!word) {
        const html = await response.text();
        const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i);
        if (ogTitleMatch && ogTitleMatch[1]) {
            const candidate = ogTitleMatch[1].trim().split(/\s+/)[0];
            if (candidate && /^[a-zA-Z]+$/.test(candidate)) {
                word = candidate;
            }
        }
    }

    if (!word) {
        throw new Error('No word found in page');
    }

    return word;
}

async function generateFallbackWord(env) {
    try {
        const words = await fetchRandomWords(2, new Set());
        if (words.length > 0) {
            return words[0];
        }
    } catch (err) {
        console.log('Fallback word generation failed:', err.message);
    }

    // Ultimate fallback
    const prefixes = ['Word', 'Name', 'User', 'Player'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    return prefix + Math.floor(Math.random() * 10000);
}

async function generateUsername(env, existingUsernames = new Set()) {
    const SCRAPING_ENABLED = env.ALLOW_TWODNE_SCRAPE !== 'false'; // Default to true unless explicitly false

    // Try TWDNE scraping first if enabled
    if (SCRAPING_ENABLED) {
        try {
            const word = await scrapeWordFromTWDNE();
            if (word) {
                const sanitized = sanitizeUsername(word.charAt(0).toUpperCase() + word.slice(1));
                if (sanitized && !existingUsernames.has(sanitized.toLowerCase())) {
                    return sanitized;
                }
            }
        } catch (err) {
            console.log('TWDNE scraping failed for username generation:', err.message);
        }
    }

    // Fallback to existing fetchRandomWords logic
    try {
        const words = await fetchRandomWords(2, existingUsernames);
        if (words.length > 0) {
            return words[0];
        }
    } catch (err) {
        console.log('fetchRandomWords failed:', err.message);
    }

    // Ultimate fallback
    const prefixes = ['Player', 'User', 'Hero', 'Warrior'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    let candidate;
    let attempts = 0;
    do {
        candidate = prefix + Math.floor(Math.random() * 10000);
        attempts++;
    } while (existingUsernames.has(candidate.toLowerCase()) && attempts < 20);

    return candidate;
}

async function handleGenerateUsersDryRun(env, url) {
    const count = parseInt(url.searchParams.get('count')) || 5;
    const maxCount = 50; // Reasonable limit
    const actualCount = Math.min(Math.max(1, count), maxCount);

    // Get existing usernames to avoid collisions in dry run
    const users = await getAllUsers(env, { fresh: false });
    const existingUsernames = new Set(users.map(u => u.username.toLowerCase()));

    const results = [];
    const generationDetails = [];

    for (let i = 0; i < actualCount; i++) {
        const startTime = Date.now();
        let source = 'generateUsername';
        let error = null;
        let username;
        try {
            // Reuse generateUsername to avoid duplication; it respects existingUsernames set
            username = await generateUsername(env, existingUsernames);
            if (!username || existingUsernames.has(String(username).toLowerCase())) {
                // Ultimate fallback if a collision somehow happens
                const fallback = 'Player' + Math.floor(Math.random() * 10000);
                username = sanitizeUsername(fallback);
                source = 'fallback';
            }
            existingUsernames.add(String(username).toLowerCase());
            results.push(username);
        } catch (err) {
            error = `Generation failed: ${err.message}`;
            results.push(`Error${i}`);
            source = 'error';
        }
        const duration = Date.now() - startTime;
        generationDetails.push({ index: i + 1, username: results[results.length - 1], source, duration: `${duration}ms`, error });
    }

    return jsonResponse({
        dryRun: true,
        requested: actualCount,
        generated: results.length,
        usernames: results,
        details: generationDetails,
        scrapingEnabled: env.ALLOW_TWDNE_SCRAPE !== 'false',
        existingUsersCount: users.length,
        generatedAt: Date.now()
    }, { headers: { 'cache-control': 'no-store' } });
}

async function handleCronTrigger(env) {
    const result = await runScheduled(env);
    return jsonResponse({ triggered: true, ...result });
}

async function handleHitpointsMigration(env) {
    const users = await getAllUsers(env, { fresh: true });
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

async function handleDeleteUsersBatch(env, request) {
    const url = new URL(request.url); // unused but kept for parity
    let payload = {};
    try { if (request.headers.get('content-type')?.includes('application/json')) payload = await request.json(); } catch (_) { }

    const dryRun = Boolean(payload?.dryRun);
    const limitRaw = Number(payload?.limit);
    let limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 100;
    const HARD_CAP = 1000; if (limit > HARD_CAP) limit = HARD_CAP;

    const byUsernames = Array.isArray(payload?.usernames) ? payload.usernames : null;

    const keysToDelete = [];

    // Safety guard: never delete users in the current top N of the leaderboard
    const PROTECTED_TOP_N = 20;
    let protectedSet = new Set(); // lowercased usernames
    let protectedList = []; // cased usernames for reporting
    try {
        const users = await getAllUsers(env, { fresh: true });
        users.sort((a, b) => b.totalLevel - a.totalLevel || b.totalXP - a.totalXP || a.username.localeCompare(b.username));
        const top = users.slice(0, PROTECTED_TOP_N);
        protectedSet = new Set(top.map(u => String(u.username || '').toLowerCase()));
        protectedList = top.map(u => u.username);
    } catch (_) { /* best-effort guard; continue even if this fails */ }

    function kvKeyFromUsername(name) {
        const sanitized = sanitizeUsername(String(name || '').trim());
        if (!sanitized) return null;
        return `user:${sanitized.toLowerCase()}`;
    }

    const skippedProtectedUsernames = [];

    if (byUsernames && byUsernames.length) {
        const seen = new Set();
        for (const raw of byUsernames) {
            const key = kvKeyFromUsername(raw);
            if (!key || seen.has(key)) continue;
            seen.add(key);
            const unameLower = key.slice('user:'.length);
            if (protectedSet.has(unameLower)) {
                skippedProtectedUsernames.push(raw);
                continue; // skip protected top-N users
            }
            keysToDelete.push(key);
            if (keysToDelete.length >= limit) break;
        }
    } else {
        let cursor; let eligibleSeenCount = 0; const reservoir = [];
        do {
            const page = await env.HISCORES_KV.list({ prefix: 'user:', limit: 1000, cursor });
            cursor = page.list_complete ? undefined : page.cursor;
            for (const k of page.keys) {
                const keyName = k.name;
                const unameLower = keyName.slice('user:'.length);
                if (protectedSet.has(unameLower)) continue; // skip protected users from random selection
                eligibleSeenCount++;
                if (reservoir.length < limit) {
                    reservoir.push(keyName);
                } else {
                    const j = Math.floor(Math.random() * eligibleSeenCount);
                    if (j < limit) reservoir[j] = keyName;
                }
            }
        } while (cursor);
        keysToDelete.push(...reservoir);
    }

    if (dryRun) {
        return jsonResponse({
            dryRun: true,
            count: keysToDelete.length,
            keys: keysToDelete,
            protectedTopN: PROTECTED_TOP_N,
            protectedUsernames: protectedList,
            skippedProtectedUsernames
        });
    }

    const batches = chunk(keysToDelete, 50);
    let deleted = 0; let deletedRelated = 0; let guardedSkips = 0;
    for (const b of batches) {
        // Extra guard at deletion time
        const toDelete = b.filter(k => {
            const unameLower = k.slice('user:'.length);
            const isProtected = protectedSet.has(unameLower);
            if (isProtected) guardedSkips++;
            return !isProtected;
        });
        for (const baseKey of toDelete) {
            const res = await deleteUserAndData(env, baseKey);
            deleted += res.deleted;
            deletedRelated += res.deletedRelated;
        }
    }
    return jsonResponse({
        deleted,
        deletedRelated,
        requested: keysToDelete.length,
        [`guardedTop${PROTECTED_TOP_N}Skipped`]: guardedSkips,
        protectedTopN: PROTECTED_TOP_N
    });
}

// Delete all users whose usernames match a "bad" regex.
// Default pattern matches names that start with digits followed by letters OR
// start with a capital letter and end with digits. (Hypocrite428, 910Plasmodiu, 533fluebulbo)
// POST body: { dryRun?: true, pattern?: "regex", limit?: number }
async function handleDeleteBadUsernames(env, request) {
    let payload = {};
    try { if (request.headers.get('content-type')?.includes('application/json')) payload = await request.json(); } catch (_) { }
    const dryRun = Boolean(payload?.dryRun);
    const limitRaw = Number(payload?.limit);
    let limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : Infinity;
    const HARD_CAP = 10000; if (limit > HARD_CAP) limit = HARD_CAP;
    let patternSource = typeof payload?.pattern === 'string' && payload.pattern.trim() ? payload.pattern.trim() : null;
    let matcher;
    try {
        if (patternSource) matcher = new RegExp(patternSource, 'i'); else { patternSource = '^(?:[0-9]+[A-Za-z]+|[A-Z][A-Za-z]*[0-9]+)$'; matcher = new RegExp(patternSource, 'i'); }
    } catch (e) {
        return jsonResponse({ error: 'Invalid regex pattern', detail: String(e) }, { status: 400 });
    }
    const matched = []; let scanned = 0; let cursor;
    outer: do {
        const list = await env.HISCORES_KV.list({ prefix: 'user:', cursor, limit: 1000 });
        cursor = list.list_complete ? undefined : list.cursor;
        for (const k of list.keys) {
            const keyName = k.name; // e.g., 'user:SomeName'
            const uname = keyName.slice('user:'.length);
            scanned++;
            if (typeof uname === 'string' && matcher.test(uname)) {
                matched.push({ username: uname, key: keyName });
                if (matched.length >= limit) { cursor = undefined; break outer; }
            }
        }
        // small pacing between pages to avoid bursts
        await sleep(5);
    } while (cursor);
    if (dryRun) return jsonResponse({ dryRun: true, pattern: patternSource, matched: matched.map(m => m.username), count: matched.length, scanned });
    const keys = matched.map(m => m.key);
    let deleted = 0; let deletedRelated = 0;
    for (const batch of chunk(keys, 50)) {
        for (const baseKey of batch) {
            const res = await deleteUserAndData(env, baseKey);
            deleted += res.deleted;
            deletedRelated += res.deletedRelated;
        }
    }
    return jsonResponse({ pattern: patternSource, deleted, deletedRelated, matched: matched.length, scanned });
}

// Delete the bottom 25% of users based on overall leaderboard ranking (totalLevel desc, then totalXP desc, then username asc)
// POST body: { dryRun?: true }
async function handleDeleteBottomQuartile(env, request) {
    let payload = {};
    try { if (request.headers.get('content-type')?.includes('application/json')) payload = await request.json(); } catch (_) { }
    const dryRun = Boolean(payload?.dryRun);

    const users = await getAllUsers(env, { fresh: true });
    if (users.length === 0) return jsonResponse({ deleted: 0, deletedRelated: 0, totalPlayers: 0, target: 0 });

    // Sort by leaderboard order
    users.sort((a, b) => b.totalLevel - a.totalLevel || b.totalXP - a.totalXP || a.username.localeCompare(b.username));

    const startIdx = Math.floor(users.length * 0.75);
    const bottom = users.slice(startIdx);
    const keysToDelete = bottom.map(u => `user:${String(u.username || '').toLowerCase()}`);

    if (dryRun) {
        return jsonResponse({ dryRun: true, totalPlayers: users.length, target: keysToDelete.length, usernames: bottom.map(u => u.username), keys: keysToDelete });
    }

    let deleted = 0; let deletedRelated = 0;
    for (const batch of chunk(keysToDelete, 50)) {
        for (const baseKey of batch) {
            const res = await deleteUserAndData(env, baseKey);
            deleted += res.deleted;
            deletedRelated += res.deletedRelated;
        }
    }

    return jsonResponse({ deleted, deletedRelated, totalPlayers: users.length, target: keysToDelete.length });
}

// Utility: delete a user key and all related keys under the prefix `${userKey}:*`
async function deleteUserAndData(env, userKvKey) {
    let deleted = 0; let deletedRelated = 0;
    // Delete the base user key
    try { await env.HISCORES_KV.delete(userKvKey); deleted++; } catch (_) { }
    // Delete related keys with prefix
    const relPrefix = userKvKey + ':';
    let relCursor;
    do {
        const rel = await env.HISCORES_KV.list({ prefix: relPrefix, limit: 1000, cursor: relCursor });
        relCursor = rel.list_complete ? undefined : rel.cursor;
        if (rel.keys && rel.keys.length) {
            const relBatches = chunk(rel.keys.map(x => x.name), 50);
            for (const rb of relBatches) {
                await Promise.all(rb.map(rk => env.HISCORES_KV.delete(rk).then(() => { deletedRelated++; }).catch(() => { })));
            }
        }
    } while (relCursor);
    return { deleted, deletedRelated };
}

async function runScheduled(env) {
    await ensureInitialData(env);
    const users = await getAllUsers(env, { fresh: true });
    if (users.length === 0) return { processed: 0, newUsers: 0 };
    const now = new Date();
    const fraction = 0.10 + Math.random() * 0.25;
    const toUpdate = Math.max(1, Math.floor(users.length * fraction));
    const shuffled = [...users].sort(() => Math.random() - 0.5).slice(0, toUpdate);
    for (const u of shuffled) {
        if (!u.archetype) {
            u.archetype = assignRandomArchetype();
            u.version = 2;
        }
        const activityProbs = ARCHETYPE_TO_ACTIVITY_PROBABILITY[u.archetype] || ARCHETYPE_TO_ACTIVITY_PROBABILITY.CASUAL;
        const activity = weightedRandomChoice(activityProbs);
        u.activity = activity;
        simulateUserProgress(u, activity, now);
        if (Math.random() < 0.01) u.needsHpMigration = true;
        await putUser(env, u);
        // gentle pacing for large batches to reduce write burst
        if (toUpdate > 100 && Math.random() < 0.05) await sleep(2);
    }
    const newCount = 1 + Math.floor(Math.random() * 2); // 1 to 2 new users
    let created = 0;
    const lowerSet = new Set(users.map(u => u.username.toLowerCase()));
    for (let i = 0; i < newCount; i++) {
        const username = await generateUsername(env, lowerSet);
        if (lowerSet.has(username.toLowerCase())) continue;
        lowerSet.add(username.toLowerCase());
        const u = newUser(username);
        await putUser(env, u);
        created++;
        if (newCount > 1) await sleep(1);
    }
    // Re-fetch latest users and update achievements + stats in one pass
    try {
        const all = await getAllUsers(env, { fresh: true });
        await persistAchievementStats(env, all);
    } catch (e) { console.log('runScheduled stats error:', String(e)); }
    return { processed: toUpdate, newUsers: created, totalPlayers: users.length + created };
}

// ———————————————————————————————————————————————————————————————
// v3 Migration: Upgrade all users not yet at version 3.
// Strategy: process in chunks; for each user version <3 apply archetype recalculation
// based on current totalXP (do NOT reshuffle existing skill XP to avoid retroactive distortion).
// Idempotent: users with version >=3 are skipped.
async function migrateAllUsersToV3(env, { chunkSize = 200 } = {}) {
    const users = await getAllUsers(env, { fresh: true });
    const outdated = users.filter(u => (u.version || 1) < 3);
    let migrated = 0;
    const total = outdated.length;
    for (let i = 0; i < outdated.length; i += chunkSize) {
        const slice = outdated.slice(i, i + chunkSize);
        for (const u of slice) {
            try {
                // Recalculate totals just in case
                recalcTotals(u);
                // Assign archetype based on weighted XP distribution logic if missing or legacy
                u.archetype = assignArchetypeForTotalXP(u.totalXP);
                u.version = 3;
                u.updatedAt = Date.now();
                await putUser(env, u);
                migrated++;
            } catch (e) {
                // Log and continue
                console.log('migrate v3 user failed', u.username, String(e));
            }
        }
        // Light pacing to avoid write spikes
        if (outdated.length > 500) await sleep(5);
    }
    return { scanned: users.length, candidates: total, migrated };
}

function jsonResponse(obj, init = {}) {
    const baseHeaders = {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
        'access-control-allow-headers': 'Content-Type, X-Admin-Token',
        'vary': 'Origin, Accept-Encoding'
    };
    const provided = init.headers || {};
    return new Response(JSON.stringify(obj), { ...init, headers: { ...baseHeaders, ...provided } });
}

function notFound(message = 'Not found') {
    return jsonResponse({ error: message }, { status: 404, headers: { 'cache-control': 'no-store' } });
}

async function router(request, env) {
    const url = new URL(request.url); const path = url.pathname; const method = request.method.toUpperCase();
    if (path === '/api/health') return handleHealth();
    // Added debug endpoint for parity with Pages Functions implementation
    if (path === '/api/debug') {
        return jsonResponse({
            path,
            method,
            hasKV: !!env.HISCORES_KV,
            availableBindings: Object.keys(env || {}),
            adminToken: Boolean(env.ADMIN_TOKEN)
        });
    }
    if (path === '/api/leaderboard' && method === 'GET') return cacheResponseIfPossible(request, () => handleLeaderboard(env, url));
    if (path === '/api/users' && method === 'GET') return cacheResponseIfPossible(request, () => handleUsersList(env));
    if (path === '/api/skill-rankings' && method === 'GET') return cacheResponseIfPossible(request, () => handleSkillRankings(env));
    if (path === '/api/fake-word' && method === 'GET') return cacheResponseIfPossible(request, () => handleFakeWord(env));
    if (path === '/api/achievements/stats' && method === 'GET') return cacheResponseIfPossible(request, () => handleAchievementsStats(env));
    if (path === '/api/achievements/firsts' && method === 'GET') return cacheResponseIfPossible(request, () => handleAchievementsFirsts(env));
    if (path === '/api/cron/trigger' && method === 'POST') return handleCronTrigger(env);
    if (path === '/api/migrate/hitpoints' && method === 'POST') return handleHitpointsMigration(env);
    if (path === '/api/seed' && method === 'POST') return handleSeed(env, request);
    if (path === '/api/generate/users/dry-run' && method === 'GET') return handleGenerateUsersDryRun(env, url);
    if (path === '/api/admin/users/delete-batch' && method === 'POST') return handleDeleteUsersBatch(env, request);
    if (path === '/api/admin/users/delete-bad' && method === 'POST') return handleDeleteBadUsernames(env, request);
    if (path === '/api/admin/users/delete-bottom-quartile' && method === 'POST') return handleDeleteBottomQuartile(env, request);
    if (path === '/api/admin/migrate/v3' && method === 'POST') {
        // Publicly callable (NO ADMIN TOKEN). Use responsibly.
        const started = Date.now();
        let chunkSize = Number(url.searchParams.get('chunkSize'));
        if (!Number.isFinite(chunkSize) || chunkSize <= 0) chunkSize = 200;
        if (chunkSize > 1000) chunkSize = 1000; // hard cap
        const result = await migrateAllUsersToV3(env, { chunkSize });
        return jsonResponse({ ...result, chunkSize, durationMs: Date.now() - started, public: true });
    }
    if (path === '/api/admin/rebalance/hitpoints' && method === 'POST') {
        const users = await getAllUsers(env, { fresh: true });
        let adjusted = 0; let scanned = 0;
        for (const u of users) {
            scanned++;
            if (!u?.skills) continue;
            const combatStats = ['attack', 'strength', 'defence', 'ranged', 'magic', 'prayer'];
            const avg = combatStats.reduce((a, s) => a + (u.skills[s]?.level || 1), 0) / combatStats.length;
            const desiredLevel = Math.max(10, Math.round(avg));
            const hp = u.skills.hitpoints || { level: 10, xp: 1154 };
            if (hp.level !== desiredLevel) {
                hp.level = desiredLevel;
                hp.xp = xpForLevel(desiredLevel);
                u.skills.hitpoints = hp;
                recalcTotals(u);
                await putUser(env, u);
                adjusted++;
            }
        }
        return jsonResponse({ scanned, adjusted });
    }
    const userMatch = path.match(/^\/api\/users\/([^\/]+)$/); if (userMatch && method === 'GET') return cacheResponseIfPossible(request, () => handleUser(env, decodeURIComponent(userMatch[1])));
    const userAchMatch = path.match(/^\/api\/users\/([^\/]+)\/achievements$/); if (userAchMatch && method === 'GET') return cacheResponseIfPossible(request, () => handleUserAchievements(env, decodeURIComponent(userAchMatch[1])));
    const hpCheckMatch = path.match(/^\/api\/users\/([^\/]+)\/hitpoints-check$/); if (hpCheckMatch && method === 'GET') return handleUserHpCheck(env, decodeURIComponent(hpCheckMatch[1]));
    if (method === 'OPTIONS') return new Response(null, { headers: { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS', 'access-control-allow-headers': 'Content-Type, X-Admin-Token' } });
    return notFound();
}

export default {
    async fetch(request, env) {
        try {
            // Consolidated deployment: Previously Cloudflare Pages Functions wrappers in /functions
            // delegated to handleApiRequest. We removed them to deduplicate code; this guard preserves
            // the explicit error those wrappers returned if KV wasn't bound correctly.
            if (!env.HISCORES_KV) {
                return jsonResponse({ error: 'KV binding HISCORES_KV missing' }, { status: 500 });
            }
            return await router(request, env);
        } catch (err) {
            return jsonResponse({ error: 'Internal error', detail: String(err) }, { status: 500 });
        }
    },
    async scheduled(_event, env, ctx) {
        ctx.waitUntil(runScheduled(env));
    }
};

// Named export so other runtimes (e.g. Pages Functions) can reuse identical logic
export async function handleApiRequest(request, env) {
    return router(request, env);
}

// Also export runScheduled for reuse in tests or alternative schedulers
export { runScheduled };
