// Achievement evaluation and utilities for OSRS Hiscores Worker
// Stores unlock timestamps per user and supports global stats + first-to-achieve logging

import { SKILLS } from './constants.js';

// Catalog keys we can evaluate on the backend (subset aligns with frontend)
export const ACHIEVEMENT_KEYS = [
    // Prestige tiers (computed from overall rank percentile or dominance)
    'tier-grandmaster', 'tier-master', 'tier-diamond',
    // Ranking
    'triple-crown', 'crowned-any', 'top-10-any', 'top-100-any',
    // Account progression
    'total-2000', 'total-1500', 'maxed-account', 'seven-99s', 'five-99s', 'combat-maxed',
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
    // Activity
    'daily-grinder', 'weekly-active', 'monthly-active', 'dedicated',
    // Milestones
    'level-50-average', 'level-75-average', 'level-90-average',
    // Special combos
    'magic-ranged', 'melee-specialist', 'support-master', 'gathering-master'
];

function sum(arr) { return arr.reduce((a, b) => a + b, 0); }
function avg(arr) { return arr.length ? sum(arr) / arr.length : 0; }

// Local copy of tier inference to avoid circular imports
function inferMetaTierWithContextLocal(user, ctx) {
    try {
        const rank = Number(ctx?.rank) || Infinity;
        const totalPlayers = Math.max(1, Number(ctx?.totalPlayers) || 1);
        const top1SkillsCount = Math.max(0, Number(ctx?.top1SkillsCount) || 0);
        const percentile = rank / totalPlayers; // 0..1

        if (percentile <= 0.00001 || top1SkillsCount >= 3) return { name: 'Grandmaster', ordinal: 0 };
        if (percentile <= 0.0001) return { name: 'Master', ordinal: 1 };
        if (percentile <= 0.001) return { name: 'Diamond', ordinal: 2 };
        if (percentile <= 0.01) return { name: 'Platinum', ordinal: 3 };
        if (percentile <= 0.05) return { name: 'Gold', ordinal: 4 };
        if (percentile <= 0.20) return { name: 'Silver', ordinal: 5 };
        if (percentile <= 0.50) return { name: 'Bronze', ordinal: 6 };

        const levels = SKILLS.map(s => user.skills?.[s]?.level || 1);
        const total = levels.reduce((a, b) => a + b, 0);
        if (total >= 1700) return { name: 'Expert', ordinal: 5 };
        if (total >= 900) return { name: 'Adept', ordinal: 6 };
        return { name: 'Novice', ordinal: 7 };
    } catch (_) {
        return { name: 'Novice', ordinal: 7 };
    }
}

// Compute global context needed for some achievements
// users: array of user objects
export function computeAchievementContext(users) {
    const usernameLower = (u) => String(u?.username || '').toLowerCase();

    // Overall rank mapping
    const sorted = [...users].sort((a, b) => b.totalLevel - a.totalLevel || b.totalXP - a.totalXP || a.username.localeCompare(b.username));
    const rankByUser = new Map();
    sorted.forEach((u, i) => rankByUser.set(usernameLower(u), i + 1));

    // For each skill, compute top1, top10, top100 sets and average levels
    const top1SkillsByUserCount = new Map();
    const top10BySkill = new Map(); // skill -> Set(lower)
    const top100BySkill = new Map();
    const skillAvgLevel = new Map();

    for (const skill of SKILLS) {
        const arr = users.map(u => ({ u, level: u?.skills?.[skill]?.level || 1, xp: u?.skills?.[skill]?.xp || 0 }));
        arr.sort((a, b) => b.xp - a.xp || a.u.username.localeCompare(b.u.username));
        const top10 = new Set();
        const top100 = new Set();
        for (let i = 0; i < arr.length && i < 100; i++) {
            const unameLower = usernameLower(arr[i].u);
            if (i < 10) top10.add(unameLower);
            top100.add(unameLower);
        }
        top10BySkill.set(skill, top10);
        top100BySkill.set(skill, top100);

        // Count top1s (ties included)
        let bestXp = arr.length ? arr[0].xp : -1;
        for (const row of arr) {
            if (row.xp === bestXp && bestXp > 0) {
                const key = usernameLower(row.u);
                top1SkillsByUserCount.set(key, (top1SkillsByUserCount.get(key) || 0) + 1);
            } else {
                break;
            }
        }

        // Average level per skill
        skillAvgLevel.set(skill, avg(arr.map(x => x.level)));
    }

    // Average level per skill is already computed. For performance achievements, we compare levels vs averages.

    return {
        rankByUser,
        top1SkillsByUserCount,
        top10BySkill,
        top100BySkill,
        skillAvgLevel,
        totalPlayers: users.length
    };
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
        const top1Count = ctx.top1SkillsByUserCount?.get(unameLower) || 0;
        const tier = inferMetaTierWithContextLocal(user, { rank, totalPlayers: ctx.totalPlayers || 1, top1SkillsCount: top1Count });
        if (tier.name === 'Grandmaster') out.add('tier-grandmaster');
        else if (tier.name === 'Master') out.add('tier-master');
        else if (tier.name === 'Diamond') out.add('tier-diamond');
    }

    // Ranking achievements
    if (ctx) {
        const top1Any = SKILLS.some(s => ctx.top10BySkill?.get(s)?.has(unameLower) && (() => false)()); // placeholder to avoid eslint
        const top10Any = SKILLS.some(s => ctx.top10BySkill?.get(s)?.has(unameLower));
        const top100Any = SKILLS.some(s => ctx.top100BySkill?.get(s)?.has(unameLower));
        const top1Count = ctx.top1SkillsByUserCount?.get(unameLower) || 0;
        if (top1Count >= 1) out.add('crowned-any');
        if (top1Count >= 3) out.add('triple-crown');
        if (top10Any) out.add('top-10-any');
        if (top100Any) out.add('top-100-any');
    }

    // Account progression
    if (totalLvl >= 2000) out.add('total-2000');
    if (totalLvl >= 1500) out.add('total-1500');
    const count99 = SKILLS.filter(s => levels[s] >= 99).length;
    if (count99 >= SKILLS.length) out.add('maxed-account');
    if (count99 >= 7) out.add('seven-99s');
    if (count99 >= 5) out.add('five-99s');
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
        if (ratio >= 0.90) out.add('elite');
        if (ratio >= 0.75) out.add('versatile');
        if (ratio >= 0.50) out.add('consistent');
    }

    // XP thresholds
    if (totalXp >= 1_000_000) out.add('xp-millionaire');
    if (totalXp >= 1_000_000_000) out.add('xp-billionaire');

    // Activity (timestamps in ms)
    const ageMs = now - Number(user.updatedAt || 0);
    if (ageMs <= 24 * 3600 * 1000) out.add('daily-grinder');
    if (ageMs <= 3 * 24 * 3600 * 1000) out.add('dedicated');
    if (ageMs <= 7 * 24 * 3600 * 1000) out.add('weekly-active');
    if (ageMs <= 30 * 24 * 3600 * 1000) out.add('monthly-active');

    // Average level milestones
    const avgLevel = totalLvl / SKILLS.length;
    if (avgLevel >= 90) out.add('level-90-average');
    if (avgLevel >= 75) out.add('level-75-average');
    if (avgLevel >= 50) out.add('level-50-average');

    // Special combinations
    if (levels.magic >= 80 && levels.ranged >= 80) out.add('magic-ranged');
    if (levels.attack >= 85 && levels.strength >= 85 && levels.defence >= 85) out.add('melee-specialist');
    if (levels.prayer >= 80 && levels.herblore >= 80 && levels.runecraft >= 80) out.add('support-master');
    if (levels.woodcutting >= 80 && levels.fishing >= 80 && levels.mining >= 80) out.add('gathering-master');

    return out;
}

// Compute achievement prevalence counts across users without mutating users
export function computePrevalenceCounts(users, ctx) {
    const counts = new Map();
    for (const key of ACHIEVEMENT_KEYS) counts.set(key, 0);
    for (const u of users) {
        const got = evaluateAchievements(u, ctx);
        for (const key of got) counts.set(key, (counts.get(key) || 0) + 1);
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
