// Achievement evaluation and utilities for OSRS Hiscores Worker
// Stores unlock timestamps per user and supports global stats + first-to-achieve logging

import { SKILLS } from './constants.js';
import { inferMetaTierWithContext } from './utils.js';

// Catalog keys we can evaluate on the backend (subset aligns with frontend)
export const ACHIEVEMENT_KEYS = [
    // Prestige tiers (computed from overall rank percentile or dominance)
    'tier-grandmaster', 'tier-master', 'tier-diamond',
    // Ranking
    'triple-crown', 'crowned-any', 'top-10-any', 'top-100-any',
    // Account progression
    'total-2277', 'total-2200', 'total-2000', 'total-1500', 'maxed-account', 'seven-99s', 'five-99s', 'combat-maxed',
    // Skill mastery
    'skill-master-attack', 'skill-master-strength', 'skill-master-defence', 'skill-master-hitpoints', 'skill-master-ranged', 'skill-master-magic', 'skill-master-prayer',
    // Gathering
    'gathering-elite', 'woodcutting-expert', 'fishing-expert', 'mining-expert',
    // Artisan
    'artisan-elite', 'cooking-expert', 'firemaking-expert', 'smithing-expert',
    // Support
    'support-elite', 'herblore-expert', 'agility-expert', 'thieving-expert',
    // Playstyle
    'balanced', 'glass-cannon', 'tank', 'skiller', 'combat-pure',
    // Performance
    'elite', 'versatile', 'consistent', 'xp-millionaire', 'xp-billionaire',
    // Activity (removed)
    // Milestones
    'level-50-average', 'level-75-average', 'level-90-average',
    // Special combos
    'magic-ranged', 'melee-specialist', 'support-master', 'gathering-master',
    // Total XP thresholds (overall XP milestones)
    'totalxp-10m', 'totalxp-50m', 'totalxp-100m', 'totalxp-200m',
    // Combat level milestones
    'combat-level-100', 'combat-level-110', 'combat-level-120', 'combat-level-126',
    // Ultra-rare skill XP milestones (per-skill 200m XP)
    'skill-200m-attack', 'skill-200m-defence', 'skill-200m-strength', 'skill-200m-hitpoints', 'skill-200m-ranged', 'skill-200m-prayer', 'skill-200m-magic',
    'skill-200m-cooking', 'skill-200m-woodcutting', 'skill-200m-fletching', 'skill-200m-fishing', 'skill-200m-firemaking', 'skill-200m-crafting',
    'skill-200m-smithing', 'skill-200m-mining', 'skill-200m-herblore', 'skill-200m-agility', 'skill-200m-thieving', 'skill-200m-slayer', 'skill-200m-farming',
    'skill-200m-runecraft', 'skill-200m-hunter', 'skill-200m-construction',
    // Meta-firsts
    'overall-rank-1', 'first-99-any', 'first-top1-any'
];

// Family chains in priority order (index 0 = highest). Presence of a higher tier implies lower tiers were earned historically.
const ACHIEVEMENT_FAMILY_CHAINS = [
    ['tier-grandmaster', 'tier-master', 'tier-diamond'],
    ['triple-crown', 'crowned-any'],
    ['top-10-any', 'top-100-any'],
    ['maxed-account', 'seven-99s', 'five-99s'],
    ['total-2277', 'total-2200', 'total-2000', 'total-1500'],
    ['elite', 'versatile', 'consistent'],
    ['level-90-average', 'level-75-average', 'level-50-average'],
    // XP thresholds: keep highest
    ['xp-billionaire', 'totalxp-200m', 'totalxp-100m', 'totalxp-50m', 'totalxp-10m', 'xp-millionaire'],
    // Combat level milestones: keep highest
    ['combat-level-126', 'combat-level-120', 'combat-level-110', 'combat-level-100']
];

function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
function avg(arr) { return arr.length ? sum(arr) / arr.length : 0; }

// Lightweight fixed-size min-heap for top-K selection
class MinHeap {
    constructor(compareFn) {
        this._a = [];
        this._cmp = compareFn || ((x, y) => x - y);
    }
    size() { return this._a.length; }
    peek() { return this._a[0]; }
    toArray() { return this._a.slice(); }
    push(v) { this._a.push(v); this._siftUp(this._a.length - 1); }
    pop() {
        const a = this._a;
        if (a.length === 0) return undefined;
        const top = a[0];
        const last = a.pop();
        if (a.length) { a[0] = last; this._siftDown(0); }
        return top;
    }
    _siftUp(i) {
        const a = this._a, cmp = this._cmp; let p;
        while (i > 0 && cmp(a[i], a[p = ((i - 1) >> 1)]) < 0) { [a[i], a[p]] = [a[p], a[i]]; i = p; }
    }
    _siftDown(i) {
        const a = this._a, cmp = this._cmp; const n = a.length;
        while (true) {
            let l = (i << 1) + 1, r = l + 1, m = i;
            if (l < n && cmp(a[l], a[m]) < 0) m = l;
            if (r < n && cmp(a[r], a[m]) < 0) m = r;
            if (m === i) break;
            [a[i], a[m]] = [a[m], a[i]]; i = m;
        }
    }
}

// Simple cache for achievement context (opt-in)
const __achievementsContextCache = { key: null, value: null };
function buildUsersSignature(users) {
    try {
        let maxUpdatedAt = 0;
        let acc = 0;
        for (let i = 0; i < users.length; i++) {
            const u = users[i] || {};
            const up = Number(u.updatedAt || 0);
            if (up > maxUpdatedAt) maxUpdatedAt = up;
            acc = (acc + (u.username ? u.username.length : 0) + (u.totalLevel || 0) + (u.totalXP || 0)) >>> 0;
        }
        return `${users.length}:${maxUpdatedAt}:${acc}`;
    } catch (_) {
        // Fallback to non-cached path if anything goes wrong
        return `nocache:${Date.now()}`;
    }
}


// Compute global context needed for some achievements
// users: array of user objects
export function computeAchievementContext(users, opts = undefined) {
    const usernameLower = (u) => String(u?.username || '').toLowerCase();
    const options = opts || {};
    if (options.useCache) {
        const key = options.cacheKey || buildUsersSignature(users);
        if (__achievementsContextCache.key === key && __achievementsContextCache.value) {
            return __achievementsContextCache.value;
        }
    }

    // Overall rank mapping
    const sorted = [...users].sort((a, b) => b.totalLevel - a.totalLevel || b.totalXP - a.totalXP || a.username.localeCompare(b.username));
    const rankByUser = new Map();
    sorted.forEach((u, i) => rankByUser.set(usernameLower(u), i + 1));

    // For each skill, compute top1, top10, top100 sets and average levels
    const top1SkillsByUserCount = new Map();
    const top10BySkill = new Map(); // skill -> Set(lower)
    const top100BySkill = new Map();
    const skillAvgLevel = new Map();

    // Heap comparator: order by "worse" first so heap is a min-heap of the top entries
    // Worse = lower xp, or same xp and lexicographically GREATER name
    const heapCompare = (a, b) => {
        if (a.xp !== b.xp) return a.xp - b.xp; // lower xp is worse (smaller)
        if (a.nameLower === b.nameLower) return 0;
        return a.nameLower < b.nameLower ? -1 : 1; // lesser name is worse (smaller)
    };

    for (const skill of SKILLS) {
        const heap100 = new MinHeap(heapCompare);
        let levelSum = 0;
        let maxXp = -1;
        let leaders = new Set(); // usernames (lower) with max xp (>0)

        for (const u of users) {
            const level = u?.skills?.[skill]?.level || 1;
            const xp = u?.skills?.[skill]?.xp || 0;
            const unameLower = usernameLower(u);
            levelSum += level;

            // Track leaders (ties included, xp must be > 0)
            if (xp > maxXp) {
                maxXp = xp;
                leaders.clear();
                if (xp > 0) leaders.add(unameLower);
            } else if (xp === maxXp && xp > 0) {
                leaders.add(unameLower);
            }

            // Maintain top-100 via min-heap
            const entry = { xp, nameLower: unameLower };
            if (heap100.size() < 100) {
                heap100.push(entry);
            } else if (heapCompare(entry, heap100.peek()) > 0) {
                heap100.pop();
                heap100.push(entry);
            }
        }

        // Update top1 skill counts
        if (maxXp > 0 && leaders.size > 0) {
            for (const name of leaders) {
                top1SkillsByUserCount.set(name, (top1SkillsByUserCount.get(name) || 0) + 1);
            }
        }

        // Derive top-100 and top-10 sets from heap (sort small array)
        const topArr = heap100.toArray().sort((a, b) => {
            if (b.xp !== a.xp) return b.xp - a.xp; // desc xp
            return a.nameLower.localeCompare(b.nameLower); // asc name
        });
        const top10 = new Set();
        const top100 = new Set();
        for (let i = 0; i < topArr.length; i++) {
            const name = topArr[i].nameLower;
            if (i < 10) top10.add(name);
            top100.add(name);
        }
        top10BySkill.set(skill, top10);
        top100BySkill.set(skill, top100);

        // Average level per skill
        skillAvgLevel.set(skill, users.length ? (levelSum / users.length) : 0);
    }

    // Average level per skill is already computed. For performance achievements, we compare levels vs averages.

    const result = {
        rankByUser,
        top1SkillsByUserCount,
        top10BySkill,
        top100BySkill,
        skillAvgLevel,
        totalPlayers: users.length
    };

    if (options.useCache) {
        __achievementsContextCache.key = options.cacheKey || buildUsersSignature(users);
        __achievementsContextCache.value = result;
    }

    return result;
}

// Evaluate which achievements a user meets right now.
// Returns a Set of achievement keys.
export function evaluateAchievements(user, ctx) {
    const out = new Set();
    const unameLower = String(user.username || '').toLowerCase();
    const levels = Object.fromEntries(SKILLS.map(s => [s, user?.skills?.[s]?.level || 1]));
    const totalLvl = Number(user.totalLevel || 0);
    const totalXp = Number(user.totalXP || 0);
    const now = Date.now();

    // Prestige tier achievements
    if (ctx) {
        const rank = ctx.rankByUser?.get(unameLower) || Infinity;
        if (rank === 1) out.add('overall-rank-1');
        const top1Count = ctx.top1SkillsByUserCount?.get(unameLower) || 0;
        const tier = inferMetaTierWithContext(user, { rank, totalPlayers: ctx.totalPlayers || 1, top1SkillsCount: top1Count });
        if (tier.name === 'Grandmaster') out.add('tier-grandmaster');
        else if (tier.name === 'Master') out.add('tier-master');
        else if (tier.name === 'Diamond') out.add('tier-diamond');
    }

    // Ranking achievements (keep only highest per sub-family)
    if (ctx) {
        const top10Any = SKILLS.some(s => ctx.top10BySkill?.get(s)?.has(unameLower));
        const top100Any = SKILLS.some(s => ctx.top100BySkill?.get(s)?.has(unameLower));
        const top1Count = ctx.top1SkillsByUserCount?.get(unameLower) || 0;
        // Crown family: triple-crown > crowned-any
        if (top1Count >= 3) out.add('triple-crown');
        else if (top1Count >= 1) out.add('crowned-any');
        // Top-any family: top-10-any > top-100-any
        if (top10Any) out.add('top-10-any');
        else if (top100Any) out.add('top-100-any');
    }

    // Account progression (total level milestones) — keep only the highest milestone
    // If additional milestones are added (e.g., total-1000), this logic will still only select the highest one.
    if (totalLvl >= 2277) {
        out.add('total-2277');
    } else if (totalLvl >= 2200) {
        out.add('total-2200');
    } else if (totalLvl >= 2000) {
        out.add('total-2000');
    } else if (totalLvl >= 1500) {
        out.add('total-1500');
    }
    const count99 = SKILLS.filter(s => levels[s] >= 99).length;
    // 99s family: maxed-account > seven-99s > five-99s
    if (count99 >= SKILLS.length) out.add('maxed-account');
    else if (count99 >= 7) out.add('seven-99s');
    else if (count99 >= 5) out.add('five-99s');
    const combatSkills = ['attack', 'strength', 'defence', 'hitpoints', 'ranged', 'magic', 'prayer'];
    if (combatSkills.every(s => levels[s] >= 99)) out.add('combat-maxed');

    // Skill mastery (selected)
    if (levels.attack >= 99) out.add('skill-master-attack');
    if (levels.strength >= 99) out.add('skill-master-strength');
    if (levels.defence >= 99) out.add('skill-master-defence');
    if (levels.hitpoints >= 99) out.add('skill-master-hitpoints');
    if (levels.ranged >= 99) out.add('skill-master-ranged');
    if (levels.magic >= 99) out.add('skill-master-magic');
    if (levels.prayer >= 99) out.add('skill-master-prayer');

    // Gathering
    if (levels.woodcutting >= 90 && levels.fishing >= 90 && levels.mining >= 90) out.add('gathering-elite');
    if (levels.woodcutting >= 85) out.add('woodcutting-expert');
    if (levels.fishing >= 85) out.add('fishing-expert');
    if (levels.mining >= 85) out.add('mining-expert');

    // Artisan
    if (levels.smithing >= 90 && levels.crafting >= 90 && levels.fletching >= 90) out.add('artisan-elite');
    if (levels.cooking >= 85) out.add('cooking-expert');
    if (levels.firemaking >= 85) out.add('firemaking-expert');
    if (levels.smithing >= 85) out.add('smithing-expert');

    // Support
    if (levels.herblore >= 90 && levels.runecraft >= 90 && levels.slayer >= 90) out.add('support-elite');
    if (levels.herblore >= 85) out.add('herblore-expert');
    if (levels.agility >= 85) out.add('agility-expert');
    if (levels.thieving >= 85) out.add('thieving-expert');

    // Playstyle
    const levelVals = SKILLS.map(s => levels[s]);
    const minLvl = Math.min(...levelVals);
    const maxLvl = Math.max(...levelVals);
    if (minLvl >= 40 && (maxLvl - minLvl) <= 30) out.add('balanced');
    const offense = (levels.attack || 1) + (levels.strength || 1);
    if (offense >= 180 && levels.defence <= 60) out.add('glass-cannon');
    if (levels.defence >= 90 && levels.hitpoints >= 85) out.add('tank');
    const nonCombat = SKILLS.filter(s => !['attack', 'defence', 'strength', 'hitpoints', 'ranged', 'magic', 'prayer'].includes(s));
    const combat = combatSkills;
    const nonCombatAvg = avg(nonCombat.map(s => levels[s]));
    const combatAvg = avg(combat.map(s => levels[s]));
    if (nonCombatAvg >= 70 && combatAvg <= 50) out.add('skiller');
    if (combatAvg >= 80 && nonCombatAvg <= 30) out.add('combat-pure');

    // Performance vs population averages
    if (ctx?.skillAvgLevel) {
        let above = 0;
        for (const s of SKILLS) if (levels[s] > (ctx.skillAvgLevel.get(s) || 0)) above++;
        const ratio = above / SKILLS.length;
        // Performance family: elite > versatile > consistent
        if (ratio >= 0.90) out.add('elite');
        else if (ratio >= 0.75) out.add('versatile');
        else if (ratio >= 0.50) out.add('consistent');
    }

    // XP thresholds (expanded)
    if (totalXp >= 1_000_000_000) out.add('xp-billionaire');
    if (totalXp >= 200_000_000) out.add('totalxp-200m');
    if (totalXp >= 100_000_000) out.add('totalxp-100m');
    if (totalXp >= 50_000_000) out.add('totalxp-50m');
    if (totalXp >= 10_000_000) out.add('totalxp-10m');
    else if (totalXp >= 1_000_000) out.add('xp-millionaire');

    // Activity achievements removed

    // Average level milestones
    const avgLevel = totalLvl / SKILLS.length;
    // Average level milestones family: 90 > 75 > 50
    if (avgLevel >= 90) out.add('level-90-average');
    else if (avgLevel >= 75) out.add('level-75-average');
    else if (avgLevel >= 50) out.add('level-50-average');

    // Special combinations
    if (levels.magic >= 80 && levels.ranged >= 80) out.add('magic-ranged');
    if (levels.attack >= 85 && levels.strength >= 85 && levels.defence >= 85) out.add('melee-specialist');
    if (levels.prayer >= 80 && levels.herblore >= 80 && levels.runecraft >= 80) out.add('support-master');
    if (levels.woodcutting >= 80 && levels.fishing >= 80 && levels.mining >= 80) out.add('gathering-master');

    // Ultra-rare: 200,000,000 XP in any skill
    try {
        for (const s of SKILLS) {
            const xp = Number(user?.skills?.[s]?.xp) || 0;
            if (xp >= 200_000_000) out.add(`skill-200m-${s}`);
        }
    } catch (_) { }

    // Ultra-rare: 200,000,000 XP in any skill
    try {
        for (const s of SKILLS) {
            const xp = Number(user?.skills?.[s]?.xp) || 0;
            if (xp >= 200_000_000) out.add(`skill-200m-${s}`);
        }
    } catch (_) { }

    // Combat level milestones (approximate OSRS formula)
    try {
        const atk = levels.attack || 1, str = levels.strength || 1, def = levels.defence || 1, hp = levels.hitpoints || 10, rng = levels.ranged || 1, mag = levels.magic || 1, pray = levels.prayer || 1;
        const base = 0.25 * (def + hp + Math.floor(pray / 2));
        const melee = 0.325 * (atk + str);
        const ranger = 0.325 * Math.floor(1.5 * rng);
        const mager = 0.325 * Math.floor(1.5 * mag);
        const combatLevel = Math.floor(base + Math.max(melee, ranger, mager));
        if (combatLevel >= 100) out.add('combat-level-100');
        if (combatLevel >= 110) out.add('combat-level-110');
        if (combatLevel >= 120) out.add('combat-level-120');
        if (combatLevel >= 126) out.add('combat-level-126');
    } catch (_) { }

    return out;
}

// Compute achievement prevalence counts across users without mutating users
export function computePrevalenceCounts(users, ctx) {
    // Count players who have ever earned each achievement (persistent unlocks),
    // including implied lower tiers within families when a higher tier is present.
    const counts = new Map();
    for (const key of ACHIEVEMENT_KEYS) counts.set(key, 0);
    for (const u of users) {
        const stored = u?.achievements && typeof u.achievements === 'object' ? new Set(Object.keys(u.achievements)) : null;
        const base = stored && stored.size ? stored : evaluateAchievements(u, ctx);
        const expanded = new Set(base);
        // Add implied lower tiers within families when a higher exists
        for (const chain of ACHIEVEMENT_FAMILY_CHAINS) {
            const highestIdx = chain.findIndex(k => expanded.has(k));
            if (highestIdx >= 0) {
                for (let j = highestIdx + 1; j < chain.length; j++) expanded.add(chain[j]);
            }
        }
        for (const k of expanded) if (counts.has(k)) counts.set(k, (counts.get(k) || 0) + 1);
    }
    return counts;
}

// Persist helper: merge new unlocks into user.achievements (key -> timestamp ms)
export function mergeNewUnlocks(user, unlockedSet, timestampMs = Date.now()) {
    if (!user.achievements || typeof user.achievements !== 'object') user.achievements = {};
    const newlyUnlocked = [];
    for (const key of unlockedSet) {
        if (user.achievements[key]) continue;
        user.achievements[key] = timestampMs;
        newlyUnlocked.push(key);
    }
    return newlyUnlocked;
}

// Prune redundant achievements within families so only the highest tier within each family remains.
export function pruneAchievementFamilies(user) {
    if (!user || !user.achievements || typeof user.achievements !== 'object') return [];
    const removed = [];
    const ach = user.achievements;
    for (const chain of ACHIEVEMENT_FAMILY_CHAINS) {
        const present = chain.filter(k => ach[k]);
        if (present.length > 1) {
            for (const key of present.slice(1)) {
                delete ach[key];
                removed.push(key);
            }
        }
    }
    return removed;
}

// Non-mutating helper that keeps only the highest-ranked achievement within each family chain.
// Returns a shallow clone suitable for read-only payloads without altering historical unlock data.
export function projectHighestAchievementFamilies(achievementsObj) {
    if (!achievementsObj || typeof achievementsObj !== 'object') return {};
    const keep = new Set(Object.keys(achievementsObj));
    for (const chain of ACHIEVEMENT_FAMILY_CHAINS) {
        const present = chain.filter(k => keep.has(k));
        if (present.length > 1) {
            const [, ...toRemove] = present;
            for (const key of toRemove) keep.delete(key);
        }
    }
    const projected = {};
    for (const key of keep) projected[key] = achievementsObj[key];
    return projected;
}
