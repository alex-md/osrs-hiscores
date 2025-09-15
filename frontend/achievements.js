// Achievements page logic
// Reuse the shared catalog from common.js to avoid duplication.
const ACHIEVEMENT_CATALOG = window.ACHIEVEMENT_CATALOG || [];

const CATEGORY_INFO = {
    tier: { name: 'Prestige Tiers', desc: 'Elite status based on overall ranking and skill dominance', color: 'tier-grandmaster' },
    rank: { name: 'Competitive Rankings', desc: 'Achievements for dominating skill leaderboards', color: 'tier-diamond' },
    account: { name: 'Account Progression', desc: 'Milestones in skill development and maxing', color: 'tier-platinum' },
    'skill-mastery': { name: 'Skill Mastery', desc: 'Individual skill perfection and expertise', color: 'tier-gold' },
    gathering: { name: 'Gathering Skills', desc: 'Resource collection and harvesting achievements', color: 'tier-silver' },
    artisan: { name: 'Artisan Skills', desc: 'Crafting, cooking, and creation milestones', color: 'tier-bronze' },
    support: { name: 'Support Skills', desc: 'Utility skills and assistance achievements', color: 'tier-bronze' },
    playstyle: { name: 'Playstyle Specializations', desc: 'Unique character builds and strategies', color: 'tier-gold' },
    performance: { name: 'Performance Excellence', desc: 'Outstanding performance across multiple skills', color: 'tier-silver' },
    activity: { name: 'Activity & Dedication', desc: 'Consistency and recent activity', color: 'tier-bronze' },
    milestone: { name: 'Level Milestones', desc: 'Average level achievements and progression goals', color: 'tier-platinum' },
    special: { name: 'Special Combinations', desc: 'Unique skill combinations and hybrid builds', color: 'tier-diamond' }
};

// Tier metadata for richer tooltip & SVG badges
const TIER_META = {
    Grandmaster: {
        key: 'tier-grandmaster',
        label: 'Grandmaster',
        desc: 'Rank #1 overall or #1 in 3+ skills',
        svg: '<svg viewBox="0 0 24 24" aria-hidden="true" class="tier-svg tier-svg--grandmaster"><path d="M12 2.5 9.7 8.2H3.5l5 3.9-1.9 6 5.4-3.6 5.4 3.6-1.9-6 5-3.9h-6.2z" fill="currentColor"/></svg>'
    },
    Master: {
        key: 'tier-master',
        label: 'Master',
        desc: 'Top 0.01% overall (or near top)',
        svg: '<svg viewBox="0 0 24 24" aria-hidden="true" class="tier-svg tier-svg--master"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8 13.5 11 9l2.5 3L16 9l-2 6H8z" fill="currentColor"/></svg>'
    },
    Diamond: {
        key: 'tier-diamond',
        label: 'Diamond',
        desc: 'Top 0.1% overall',
        svg: '<svg viewBox="0 0 24 24" aria-hidden="true" class="tier-svg tier-svg--diamond"><path d="M4 9 12 3l8 6-8 12L4 9z" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M12 3v18" stroke="currentColor" stroke-width="1"/></svg>'
    }
};

function buildTierBadge(tierName) {
    if (!tierName || !TIER_META[tierName]) return '';
    const meta = TIER_META[tierName];
    // Compact symbol-only variant: single letter (G/M/D) plus visually hidden SVG for sharpness
    const symbolMap = { Grandmaster: 'G', Master: 'M', Diamond: 'D' };
    const letter = symbolMap[tierName] || meta.label.charAt(0);
    return `<span class="tier-badge tier--mini tier-${tierName.toLowerCase()}" data-tooltip="${meta.label}: ${meta.desc}" aria-label="${meta.label}" title="${meta.label}"><span class="tier-mini-letter">${letter}</span></span>`;
}

// ---------- Frontend full evaluation (mirrors worker logic) ----------
// We replicate enough of backend logic so matrix can represent ALL achievements, not just rank & coarse milestones.
function evaluateAchievementsFrontend(user, ctx) {
    const SKILLS = window.SKILLS || [];
    const out = new Set();
    const unameLower = String(user.username || '').toLowerCase();
    const levels = Object.fromEntries(SKILLS.map(s => [s, user?.skills?.[s]?.level || 1]));
    const totalLvl = Number(user.totalLevel || 0);
    const totalXp = Number(user.totalXP || 0);
    const now = Date.now();
    // Prestige tiers (simplified: use ctx.rankByUser if present)
    if (ctx) {
        const rank = ctx.rankByUser?.get(unameLower) || Infinity;
        const top1Count = ctx.top1SkillsByUserCount?.get(unameLower) || 0;
        // Derive tier using simplified logic consistent with backend thresholds
        if (rank === 1 || top1Count >= 3) out.add('tier-grandmaster');
        else if (rank <= Math.max(2, Math.ceil((ctx.totalPlayers || 1) * 0.0001))) out.add('tier-master');
        else if (rank <= Math.max(5, Math.ceil((ctx.totalPlayers || 1) * 0.001))) out.add('tier-diamond');
    }
    // Ranking family
    if (ctx) {
        const top10Any = SKILLS.some(s => ctx.top10BySkill?.get(s)?.has(unameLower));
        const top100Any = SKILLS.some(s => ctx.top100BySkill?.get(s)?.has(unameLower));
        const top1Count = ctx.top1SkillsByUserCount?.get(unameLower) || 0;
        if (top1Count >= 3) out.add('triple-crown');
        else if (top1Count >= 1) out.add('crowned-any');
        if (top10Any) out.add('top-10-any');
        else if (top100Any) out.add('top-100-any');
    }
    // Account progression
    if (totalLvl >= 2000) out.add('total-2000');
    else if (totalLvl >= 1500) out.add('total-1500');
    const SKILL_COUNT = SKILLS.length || 1;
    const count99 = SKILLS.filter(s => levels[s] >= 99).length;
    if (count99 >= SKILL_COUNT) out.add('maxed-account');
    else if (count99 >= 7) out.add('seven-99s');
    else if (count99 >= 5) out.add('five-99s');
    const combatSkills = ['attack', 'strength', 'defence', 'hitpoints', 'ranged', 'magic', 'prayer'];
    if (combatSkills.every(s => levels[s] >= 99)) out.add('combat-maxed');
    // Skill mastery
    ['attack', 'strength', 'defence', 'hitpoints', 'ranged', 'magic', 'prayer'].forEach(s => { if (levels[s] >= 99) out.add('skill-master-' + s); });
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
    if (levelVals.length) {
        const minLvl = Math.min(...levelVals);
        const maxLvl = Math.max(...levelVals);
        if (minLvl >= 40 && (maxLvl - minLvl) <= 30) out.add('balanced');
    }
    const offense = (levels.attack || 1) + (levels.strength || 1);
    if (offense >= 180 && levels.defence <= 60) out.add('glass-cannon');
    if ((levels.defence || 1) >= 90 && (levels.hitpoints || 1) >= 85) out.add('tank');
    const nonCombatSkills = SKILLS.filter(s => !combatSkills.includes(s));
    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const nonCombatAvg = avg(nonCombatSkills.map(s => levels[s] || 1));
    const combatAvg = avg(combatSkills.map(s => levels[s] || 1));
    if (nonCombatAvg >= 70 && combatAvg <= 50) out.add('skiller');
    if (combatAvg >= 80 && nonCombatAvg <= 30) out.add('combat-pure');
    // Performance (needs population averages from ctx)
    if (ctx?.skillAvgLevel) {
        let above = 0; SKILLS.forEach(s => { if ((levels[s] || 1) > (ctx.skillAvgLevel.get(s) || 0)) above++; });
        const ratio = above / SKILLS.length;
        if (ratio >= 0.90) out.add('elite');
        else if (ratio >= 0.75) out.add('versatile');
        else if (ratio >= 0.50) out.add('consistent');
    }
    // XP thresholds
    if (totalXp >= 1_000_000_000) out.add('xp-billionaire');
    else if (totalXp >= 1_000_000) out.add('xp-millionaire');
    // Activity
    if (user.updatedAt) {
        const ageMs = Date.now() - Number(user.updatedAt);
        if (ageMs <= 24 * 3600 * 1000) out.add('daily-grinder');
        else if (ageMs <= 3 * 24 * 3600 * 1000) out.add('dedicated');
        else if (ageMs <= 7 * 24 * 3600 * 1000) out.add('weekly-active');
        else if (ageMs <= 30 * 24 * 3600 * 1000) out.add('monthly-active');
    }
    // Average level milestones
    if (SKILLS.length) {
        const avgLevel = totalLvl / SKILLS.length;
        if (avgLevel >= 90) out.add('level-90-average');
        else if (avgLevel >= 75) out.add('level-75-average');
        else if (avgLevel >= 50) out.add('level-50-average');
    }
    // Special combos
    if ((levels.magic || 1) >= 80 && (levels.ranged || 1) >= 80) out.add('magic-ranged');
    if ((levels.attack || 1) >= 85 && (levels.strength || 1) >= 85 && (levels.defence || 1) >= 85) out.add('melee-specialist');
    if ((levels.prayer || 1) >= 80 && (levels.herblore || 1) >= 80 && (levels.runecraft || 1) >= 80) out.add('support-master');
    if ((levels.woodcutting || 1) >= 80 && (levels.fishing || 1) >= 80 && (levels.mining || 1) >= 80) out.add('gathering-master');
    return out;
}

// Build evaluation context from leaderboard + skillRankings for frontend
function buildFrontendAchievementContext(players, skillRankings) {
    const SKILLS = window.SKILLS || [];
    const rankByUser = new Map();
    players.forEach(p => { if (p.username && p.rank) rankByUser.set(p.username.toLowerCase(), p.rank); });
    const rankings = skillRankings?.rankings || {};
    const top1SkillsByUserCount = new Map();
    const top10BySkill = new Map();
    const top100BySkill = new Map();
    const skillAvgLevel = new Map();
    SKILLS.forEach(skill => {
        const arr = rankings[skill] || [];
        if (arr[0]?.username) {
            const topXp = arr[0].xp || 0;
            let leaders = new Set();
            arr.forEach(r => { if (r.xp === topXp && topXp > 0) leaders.add(r.username.toLowerCase()); });
            leaders.forEach(name => top1SkillsByUserCount.set(name, (top1SkillsByUserCount.get(name) || 0) + 1));
        }
        const top10 = new Set();
        const top100 = new Set();
        for (let i = 0; i < arr.length && i < 100; i++) {
            const name = arr[i].username.toLowerCase();
            if (i < 10) top10.add(name);
            top100.add(name);
        }
        top10BySkill.set(skill, top10);
        top100BySkill.set(skill, top100);
        // Average level (approx) use entries (level field)
        let lvlSum = 0;
        arr.forEach(r => { lvlSum += (r.level || 1); });
        skillAvgLevel.set(skill, arr.length ? (lvlSum / arr.length) : 1);
    });
    return { rankByUser, top1SkillsByUserCount, top10BySkill, top100BySkill, skillAvgLevel, totalPlayers: players.length };
}

function getRarityColor(rarity) {
    const colors = {
        mythic: '#ff6b6b',
        legendary: '#a855f7',
        epic: '#3b82f6',
        rare: '#10b981',
        common: '#6b7280'
    };
    return colors[rarity] || colors.common;
}

function createAchievementCard(achievement) {
    const rarityClass = achievement.dynamicRarity || achievement.rarity || 'common';
    const card = el('div', `achievement-card rarity-${rarityClass}`);
    const parts = [
        `${achievement.label}`,
        `${achievement.desc}`
    ];
    if (typeof achievement.prevalencePct === 'number' && achievement.totalPlayers) {
        const pctStr = formatPrevalenceDetailed(achievement.prevalencePct, achievement.count || 0, achievement.totalPlayers);
        parts.push(`Prevalence: ${pctStr} (${achievement.count || 0}/${achievement.totalPlayers})`);
    }
    if (achievement.first) {
        const when = achievement.first.timestamp ? new Date(achievement.first.timestamp).toLocaleDateString() : '';
        parts.push(`First: ${achievement.first.username}${when ? ' on ' + when : ''}`);
    }
    parts.push(`Rarity tier: ${(achievement.dynamicRarity || achievement.rarity)}`);
    card.setAttribute('data-tooltip', parts.join('\n'));

    const icon = el('div', 'ach-icon', [text(achievement.icon)]);
    const title = el('div', 'ach-title', [text(achievement.label)]);
    const desc = el('div', 'ach-desc', [text(achievement.desc)]);

    card.appendChild(icon);
    card.appendChild(title);
    card.appendChild(desc);

    return card;
}

function createCategorySection(categoryKey, achievements) {
    const category = CATEGORY_INFO[categoryKey];
    const section = el('div', 'achievement-category');

    const header = el('div', 'achievement-category-header mb-4');
    const title = el('h3', 'text-2xl font-bold text-foreground flex-items-center gap-2', [
        text(category.name),
        el('span', 'text-sm font-normal text-muted', [text(`(${achievements.length})`)])
    ]);
    const desc = el('p', 'text-muted mt-1', [text(category.desc)]);

    header.appendChild(title);
    header.appendChild(desc);

    const grid = el('div', 'achievement-grid');
    achievements.forEach(achievement => {
        grid.appendChild(createAchievementCard(achievement));
    });

    section.appendChild(header);
    section.appendChild(grid);

    return section;
}

// --- Insights and relationships ---
function pickTop(arr, n, keyFn) {
    return [...arr].sort((a, b) => keyFn(b) - keyFn(a)).slice(0, n);
}

function computePlayerUnlocks(players, skillRankings) {
    const rankings = skillRankings?.rankings || {};
    // Build a map of username -> count of #1 skills
    const top1 = new Map();
    const top10AnySet = new Set();
    const top100AnySet = new Set();
    try {
        (window.SKILLS || []).forEach(s => {
            const arr = rankings[s] || [];
            if (arr[0]?.username) {
                const u = arr[0].username;
                top1.set(u, (top1.get(u) || 0) + 1);
            }
            // Mark top 10 / top 100 membership
            for (let i = 0; i < arr.length; i++) {
                const entry = arr[i];
                if (!entry || !entry.username) continue;
                if (i < 10) top10AnySet.add(entry.username);
                if (i < 100) top100AnySet.add(entry.username);
                if (i >= 100) break; // no need to scan further
            }
        });
    } catch (_) { }

    const map = new Map();
    players.forEach(p => {
        const set = new Set();
        // Tier-based
        if (p.tier === 'Grandmaster') set.add('tier-grandmaster');
        if (p.tier === 'Master') set.add('tier-master');
        if (p.tier === 'Diamond') set.add('tier-diamond');
        // Top ranks in skills
        const c = top1.get(p.username) || 0;
        if (c >= 3) set.add('triple-crown');
        if (c >= 1) set.add('crowned-any');
        // Generic top placement achievements (independent chain)
        if (top10AnySet.has(p.username)) set.add('top-10-any');
        else if (top100AnySet.has(p.username)) set.add('top-100-any');
        // Account progression
        if (p.totalLevel >= 2277) set.add('maxed-account');
        else if (p.totalLevel >= 2000) set.add('total-2000');
        else if (p.totalLevel >= 1500) set.add('total-1500');
        // Activity recency
        if (p.updatedAt) {
            const diffH = (Date.now() - p.updatedAt) / 3600000;
            if (diffH <= 24) set.add('daily-grinder');
            else if (diffH <= 72) set.add('dedicated');
            else if (diffH <= 168) set.add('weekly-active');
            else if (diffH <= 720) set.add('monthly-active');
        }
        map.set(p.username, set);
    });
    return map; // username => Set(keys)
}

// Families where higher tier replaces lower tier visually, but we want historical awareness.
// Ordered from highest priority to lowest; if a player has a higher one active, lower ones become historical (if they were ever unlocked).
const ACHIEVEMENT_FAMILY_CHAINS = [
    ['tier-grandmaster', 'tier-master', 'tier-diamond'],
    ['triple-crown', 'crowned-any'],
    ['top-10-any', 'top-100-any'],
    ['maxed-account', 'seven-99s', 'five-99s'],
    ['total-2000', 'total-1500'],
    ['daily-grinder', 'dedicated', 'weekly-active', 'monthly-active'],
    ['elite', 'versatile', 'consistent'],
    ['level-90-average', 'level-75-average', 'level-50-average'],
    ['xp-billionaire', 'xp-millionaire']
];

// Given an active set (after pruning) and raw achievements object (with timestamps), derive historical (superseded) achievements.
function expandHistorical(activeSet, achievementsObj) {
    const historical = new Set();
    const ownedKeys = achievementsObj ? Object.keys(achievementsObj) : [];
    for (const chain of ACHIEVEMENT_FAMILY_CHAINS) {
        // Determine highest tier currently active OR highest owned if none active (regression case)
        let highestActiveIndex = -1;
        for (let i = 0; i < chain.length; i++) {
            if (activeSet.has(chain[i])) { highestActiveIndex = i; break; }
        }
        if (highestActiveIndex >= 0) {
            // Any lower priority (later index) achievements are implied historical even if not stored.
            for (let j = highestActiveIndex + 1; j < chain.length; j++) {
                const key = chain[j];
                if (!activeSet.has(key)) historical.add(key);
            }
        } else {
            // None are active: treat all but the best (lowest index) owned as historical; if only higher tiers missing due to prune we still show them as historical if owned.
            const ownedInChain = chain.filter(k => ownedKeys.includes(k));
            if (ownedInChain.length) {
                // Sort by chain order (already) and keep the earliest owned as representative active fallback? We won't add to active here (handled upstream) — mark the rest historical.
                for (let i = 0; i < ownedInChain.length; i++) {
                    if (i === 0) continue; // treat first as potential active replacement
                    historical.add(ownedInChain[i]);
                }
            }
        }
    }
    return historical;
}

// New helper returning map username -> { active:Set, historical:Set }
function computePlayerUnlocksWithHistory(players, skillRankings) {
    const inferred = computePlayerUnlocks(players, skillRankings); // username -> Set(active inferred)
    const map = new Map();
    players.forEach(p => {
        // Start with inferred active
        const active = new Set(inferred.get(p.username) || []);
        // Merge actual achievements object keys (these are authoritative unlock evidence)
        if (p.achievements && typeof p.achievements === 'object') {
            Object.keys(p.achievements).forEach(k => active.add(k));
        }
        // Prune by keeping only highest tiers in each chain for "active" representation
        for (const chain of ACHIEVEMENT_FAMILY_CHAINS) {
            const present = chain.filter(k => active.has(k));
            if (present.length > 1) {
                // Keep highest priority (first in chain) only
                for (let i = 1; i < present.length; i++) active.delete(present[i]);
            }
        }
        const historical = expandHistorical(active, p.achievements || {});
        map.set(p.username, { active, historical });
    });
    return map;
}

function prevalenceForKeys(totalPlayers, counts) {
    const map = new Map();
    ACHIEVEMENT_CATALOG.forEach(a => {
        const c = counts?.[a.key] || 0;
        const pct = totalPlayers > 0 ? (c / totalPlayers) * 100 : 0;
        map.set(a.key, pct);
    });
    return map;
}

// Formatting helpers for prevalence percentages.
// Avoids misleading "0.0%" when prevalence is small but non-zero.
function formatPrevalenceDetailed(pct, count, total) {
    if (!total) return '0%';
    if (count === 0 || pct === 0) return '0%';
    if (pct < 0.01) return '<0.01%';
    if (pct < 0.1) return pct.toFixed(2) + '%';
    if (pct < 1) return pct.toFixed(2) + '%';
    if (pct < 10) return pct.toFixed(1) + '%';
    return pct.toFixed(1) + '%';
}

function formatPrevalenceShort(pct, count, total) {
    if (!total) return '0%';
    if (count === 0 || pct === 0) return '0%';
    if (pct < 0.1) return '<0.1%';
    if (pct < 1) return pct.toFixed(1) + '%';
    return Math.round(pct) + '%';
}

async function renderInsights(globalStats, leaderboard, skillRankings, firsts) {
    const wrap = $('#insightsContainer');
    if (!wrap) return;
    wrap.innerHTML = '';

    const players = leaderboard?.players || [];
    const totalPlayers = globalStats?.totalPlayers || players.length || 0;
    const counts = globalStats?.counts || {};
    const prevalence = prevalenceForKeys(totalPlayers, counts);
    // Enrich a subset with detailed user data to accurately count achievements (including historical chains)
    const sample = players.slice(0, Math.min(players.length, 50));
    const detailed = await Promise.all(sample.map(async p => {
        try { return await window.fetchJSON(`/api/users/${encodeURIComponent(p.username)}`); } catch (_) { return p; }
    }));
    const detailedByName = new Map();
    detailed.forEach(u => { if (u && u.username) detailedByName.set(u.username, u); });
    // Replace sampled entries with detailed variants where available for accurate counts
    const merged = sample.map(p => detailedByName.get(p.username) ? { ...p, ...detailedByName.get(p.username) } : p);
    const unlocksWithHistory = computePlayerUnlocksWithHistory(merged, skillRankings); // username -> { active, historical }

    // Top players by total earned (active + historical unique)
    const earnedCount = (name) => {
        const uh = unlocksWithHistory.get(name);
        if (!uh) return 0;
        const all = new Set([...(uh.active || []), ...(uh.historical || [])]);
        return all.size;
    };
    const topPlayers = pickTop(merged, 5, p => earnedCount(p.username));

    const topPlayersCard = el('div', 'insight-card insight-card--top-players');
    topPlayersCard.innerHTML = '<h3 class="insight-title insight-title--section">Most Achievements Unlocked</h3>';
    const tpList = el('div', 'insight-list top-players-list');
    topPlayers.forEach((p, idx) => {
        const size = earnedCount(p.username);
        const row = el('div', 'insight-row top-player-row');
        const tierBadge = buildTierBadge(p.tier);
        row.innerHTML = `
            <div class="insight-rank">${idx + 1}</div>
            <div class="insight-user">
                <button class="username-link" data-user="${p.username}">${p.username}</button>
                ${tierBadge}
            </div>
            <div class="insight-bar-wrap" title="${size} achievements">
                <div class="insight-bar" style="width:${Math.min(100, (size / 25) * 100)}%"></div>
                <span class="insight-bar-label">${size}</span>
            </div>`;
        tpList.appendChild(row);
    });
    topPlayersCard.appendChild(tpList);

    // Most/least common achievements
    const withPrev = ACHIEVEMENT_CATALOG.map(a => {
        const count = counts[a.key] || 0;
        const prevalencePct = prevalence.get(a.key) || 0;
        return {
            ...a,
            prevalence: prevalencePct,
            count,
            totalPlayers,
            dynamicRarity: deriveDynamicRarity(prevalencePct),
            first: firsts?.[a.key] || null
        };
    });
    const mostCommon = pickTop(withPrev, 5, a => a.prevalence);
    const leastCommon = pickTop(withPrev, 5, a => -a.prevalence);

    function makeAchList(title, list) {
        const card = el('div', 'insight-card');
        card.appendChild(el('h3', 'insight-title', [text(title)]));
        const container = el('div', 'insight-list');
        list.forEach(a => {
            const item = el('div', 'insight-row');
            const detailed = formatPrevalenceDetailed(a.prevalence, a.count, a.totalPlayers);
            const firstInfo = a.first ? `\nFirst: ${a.first.username}` + (a.first.timestamp ? ` on ${new Date(a.first.timestamp).toLocaleDateString()}` : '') : '';
            const tooltip = `${a.label}\n${a.desc}\n${a.count}/${a.totalPlayers} players (${detailed})\nRarity: ${a.dynamicRarity}${firstInfo}`;
            item.innerHTML = `
                <div class="insight-icon" title="${tooltip}">${a.icon}</div>
                <div class="insight-ach">
                    <div class="ach-name">${a.label}</div>
                    <div class="ach-desc">${a.desc}</div>
                </div>
                <div class="insight-bar-wrap" title="${tooltip}">
                    <div class="insight-bar" style="width:${a.prevalence}%"></div>
                    <span class="insight-bar-label">${detailed}</span>
                </div>`;
            container.appendChild(item);
        });
        card.appendChild(container);
        return card;
    }

    const grid = el('div', 'insights-grid');
    grid.appendChild(topPlayersCard);
    grid.appendChild(makeAchList('Most Common Achievements', mostCommon));
    grid.appendChild(makeAchList('Rarest Achievements', leastCommon));
    wrap.appendChild(grid);

    // Summary chips
    const chips = el('div', 'insight-chips');
    const totalUnlockedEvents = Object.values(counts).reduce((a, b) => a + (b || 0), 0);
    chips.innerHTML = `
        <span class="chip">${totalPlayers} players</span>
        <span class="chip">${ACHIEVEMENT_CATALOG.length} achievements</span>
        <span class="chip">${totalUnlockedEvents.toLocaleString()} unlocks (all-time)</span>`;
    wrap.appendChild(chips);
}

async function renderRelationshipMatrix(globalStats, leaderboard, skillRankings, firsts) {
    const mount = $('#relationshipMatrix');
    if (!mount) return;
    mount.innerHTML = '';

    const players = (leaderboard?.players || []).slice(0, 12); // cap for readability
    if (!players.length) return;

    // Fetch detailed user objects (skills + achievements) for accuracy
    const detailed = await Promise.all(players.map(async p => {
        try { return await window.fetchJSON(`/api/users/${encodeURIComponent(p.username)}`); } catch (_) { return p; }
    }));
    // Merge base leaderboard metadata (rank, tier) into detailed objects
    const detailedByName = new Map();
    detailed.forEach(u => { if (u && u.username) detailedByName.set(u.username, u); });
    players.forEach(p => {
        const d = detailedByName.get(p.username);
        if (d) { d.rank = p.rank; d.tier = p.tier; }
    });

    const ctx = buildFrontendAchievementContext(players, skillRankings);
    const unlocks = new Map(); // username -> { active:Set, historical:Set }
    detailed.forEach(u => {
        if (!u || !u.username) return;
        const activeEval = evaluateAchievementsFrontend(u, ctx);
        // Merge stored achievements as proof (some might have been pruned visually but we treat them historical if implied)
        if (u.achievements) {
            Object.keys(u.achievements).forEach(k => activeEval.add(k));
        }
        // Prune to highest tiers for active visual set
        const active = new Set(activeEval);
        for (const chain of ACHIEVEMENT_FAMILY_CHAINS) {
            const present = chain.filter(k => active.has(k));
            if (present.length > 1) {
                // keep first
                for (let i = 1; i < present.length; i++) active.delete(present[i]);
            }
        }
        const historical = expandHistorical(active, u.achievements || {});
        unlocks.set(u.username, { active, historical });
    });
    const totalPlayers = globalStats?.totalPlayers || 0;
    const counts = globalStats?.counts || {};
    const prevalence = prevalenceForKeys(totalPlayers, counts);

    // Choose columns: 12 most informative achievements (high variance)
    const withPrev = ACHIEVEMENT_CATALOG.map(a => {
        const count = counts[a.key] || 0;
        const prev = prevalence.get(a.key) || 0;
        return {
            ...a,
            prevalence: prev,
            count,
            totalPlayers,
            dynamicRarity: deriveDynamicRarity(prev),
            first: firsts?.[a.key] || null
        };
    });
    // score by closeness to 50% (most informative binary split)
    const columns = pickTop(withPrev, 12, a => 50 - Math.abs(50 - a.prevalence));

    const table = el('div', 'matrix');
    // Header row
    const header = el('div', 'matrix-row matrix-header');
    header.appendChild(el('div', 'matrix-cell fixed cell--corner', [text('Player')]));
    columns.forEach(a => {
        const cell = el('div', 'matrix-cell');
        const shortPrev = formatPrevalenceShort(a.prevalence, a.count, a.totalPlayers);
        const detailed = formatPrevalenceDetailed(a.prevalence, a.count, a.totalPlayers);
        const firstInfo = a.first ? `\nFirst: ${a.first.username}` + (a.first.timestamp ? ` on ${new Date(a.first.timestamp).toLocaleDateString()}` : '') : '';
        const tooltip = `${a.label}\n${a.desc}\n${a.count}/${a.totalPlayers} players (${detailed})\nRarity: ${a.dynamicRarity}${firstInfo}`;
        cell.innerHTML = `<div class="matrix-ach" title="${tooltip}">${a.icon}</div>
                          <div class="matrix-prev" title="${tooltip}">${shortPrev}</div>`;
        header.appendChild(cell);
    });
    table.appendChild(header);

    // Rows per player
    players.forEach(p => {
        const row = el('div', 'matrix-row');
        const left = el('div', 'matrix-cell fixed');
        left.innerHTML = `<button class="username-link" data-user="${p.username}">${p.username}</button>`;
        row.appendChild(left);
        const entry = unlocks.get(p.username) || { active: new Set(), historical: new Set() };
        columns.forEach(a => {
            const active = entry.active.has(a.key);
            const hist = !active && entry.historical.has(a.key);
            const cls = active ? 'hit' : hist ? 'superseded' : 'miss';
            const title = active ? `${p.username} currently has ${a.label}` : hist ? `${p.username} previously unlocked ${a.label} (superseded)` : `${p.username} has not unlocked ${a.label}`;
            const cell = el('div', `matrix-cell ${cls}`);
            cell.setAttribute('title', title);
            row.appendChild(cell);
        });
        table.appendChild(row);
    });

    // Legend
    const legend = el('div', 'matrix-legend');
    legend.innerHTML = `<span class="legend-swatch hit"></span> Active <span class="legend-swatch superseded"></span> Historical <span class="legend-swatch miss"></span> Never`;

    const headerEl = el('h3', 'insight-title');
    headerEl.textContent = 'Players × Achievements';
    mount.appendChild(headerEl);
    // Set CSS var for column count
    mount.style.setProperty('--matrix-cols', String(columns.length));
    mount.appendChild(table);
    mount.appendChild(legend);
}

// --- Interactive controls state ---
const UI_STATE = {
    viewMode: 'grid', // 'grid' | 'table'
    sortBy: 'rarity', // 'rarity' | 'alpha' | 'prevalence' | 'first'
    filterText: '',
    filterRarity: 'all',
    showOnlyFirsts: false
};

function applyAchievementFilters(achList) {
    return achList
        .filter(a => !UI_STATE.filterText || (a.label.toLowerCase().includes(UI_STATE.filterText) || a.desc.toLowerCase().includes(UI_STATE.filterText) || a.key.includes(UI_STATE.filterText)))
        .filter(a => UI_STATE.filterRarity === 'all' || (a.dynamicRarity || a.rarity) === UI_STATE.filterRarity)
        .filter(a => !UI_STATE.showOnlyFirsts || a.first);
}

function sortAchievements(achList) {
    const arr = [...achList];
    const rarityRank = { mythic: 0, legendary: 1, epic: 2, rare: 3, uncommon: 4, common: 5 };
    arr.sort((a, b) => {
        switch (UI_STATE.sortBy) {
            case 'alpha':
                return a.label.localeCompare(b.label);
            case 'prevalence':
                return (a.prevalencePct || 0) - (b.prevalencePct || 0); // ascending rarity (lowest first)
            case 'first':
                return (a.first?.timestamp || Infinity) - (b.first?.timestamp || Infinity);
            case 'rarity':
            default:
                return (rarityRank[a.dynamicRarity || a.rarity] ?? 99) - (rarityRank[b.dynamicRarity || b.rarity] ?? 99) || a.label.localeCompare(b.label);
        }
    });
    return arr;
}

function buildControlsBar() {
    const bar = el('div', 'ach-controls flex flex-wrap gap-3 items-center mb-6');
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Achievement controls');
    bar.innerHTML = `
        <div class="flex gap-2 items-center">
            <label class="text-xs uppercase tracking-wide opacity-70">View</label>
            <div class="inline-flex rounded overflow-hidden border border-border">
                <button type="button" data-view="grid" class="view-toggle px-3 py-1 text-sm active">Grid</button>
                <button type="button" data-view="table" class="view-toggle px-3 py-1 text-sm">Table</button>
            </div>
        </div>
        <div class="flex gap-2 items-center">
            <label class="text-xs uppercase tracking-wide opacity-70" for="achSort">Sort</label>
            <select id="achSort" class="ach-select">
                <option value="rarity">Rarity Tier</option>
                <option value="alpha">Alphabetical</option>
                <option value="prevalence">Prevalence %</option>
                <option value="first">Earliest First</option>
            </select>
        </div>
        <div class="flex gap-2 items-center grow min-w-[220px]">
            <label class="text-xs uppercase tracking-wide opacity-70" for="achSearch">Search</label>
            <input id="achSearch" type="search" placeholder="Search achievements..." class="ach-input flex-1" />
        </div>
        <div class="flex gap-2 items-center">
            <label class="text-xs uppercase tracking-wide opacity-70" for="achRarity">Rarity</label>
            <select id="achRarity" class="ach-select">
                <option value="all">All</option>
                <option value="mythic">Mythic</option>
                <option value="legendary">Legendary</option>
                <option value="epic">Epic</option>
                <option value="rare">Rare</option>
                <option value="uncommon">Uncommon</option>
                <option value="common">Common</option>
            </select>
        </div>
        <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input id="achOnlyFirsts" type="checkbox" class="ach-checkbox" />
            <span>Only Firsts</span>
        </label>
    `;
    return bar;
}

function renderAdaptiveCatalog(container, categoriesMap) {
    container.innerHTML = '';
    const keys = Object.keys(categoriesMap);
    keys.forEach(categoryKey => {
        const list = categoriesMap[categoryKey];
        const filtered = sortAchievements(applyAchievementFilters(list));
        if (!filtered.length) return;
        if (UI_STATE.viewMode === 'table') {
            container.appendChild(buildCategoryTable(categoryKey, filtered));
        } else {
            container.appendChild(createCategorySection(categoryKey, filtered));
        }
    });
}

function buildCategoryTable(categoryKey, achievements) {
    const category = CATEGORY_INFO[categoryKey];
    const wrap = el('div', 'achievement-category');
    const header = el('div', 'achievement-category-header mb-3');
    header.innerHTML = `<h3 class="text-xl font-bold flex items-center gap-2">${category.name}<span class="text-xs font-normal opacity-60">(${achievements.length})</span></h3><p class="text-muted text-sm">${category.desc}</p>`;
    wrap.appendChild(header);
    const table = el('div', 'ach-table-wrapper');
    table.innerHTML = `<table class="ach-table" aria-label="${category.name}">
        <thead><tr>
            <th scope="col">Achievement</th>
            <th scope="col" class="hidden sm:table-cell">Description</th>
            <th scope="col">Rarity</th>
            <th scope="col" class="hidden md:table-cell">Prevalence</th>
            <th scope="col" class="hidden lg:table-cell">First</th>
        </tr></thead>
        <tbody></tbody>
    </table>`;
    const tbody = table.querySelector('tbody');
    achievements.forEach(a => {
        const pctStr = typeof a.prevalencePct === 'number' && a.totalPlayers ? formatPrevalenceDetailed(a.prevalencePct, a.count || 0, a.totalPlayers) : '-';
        const firstStr = a.first ? `${a.first.username}${a.first.timestamp ? ' · ' + new Date(a.first.timestamp).toLocaleDateString() : ''}` : '';
        const rarityTier = a.dynamicRarity || a.rarity;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="ach-cell-name"><span class="ach-icon-inline">${a.icon}</span> ${a.label}</td>
            <td class="hidden sm:table-cell text-muted text-xs">${a.desc}</td>
            <td><span class="rarity-badge rarity-${rarityTier}">${rarityTier}</span></td>
            <td class="hidden md:table-cell text-xs">${pctStr}</td>
            <td class="hidden lg:table-cell text-xs">${firstStr}</td>`;
        tbody.appendChild(tr);
    });
    wrap.appendChild(table);
    return wrap;
}

async function renderAchievementsPage() {
    // Render insights first, then catalog
    const container = $('#achievementsContainer');
    const insightsWrap = $('#insightsContainer');
    const matrixWrap = $('#relationshipMatrix');

    // Load data needed for insights
    let leaderboard = null, skillRankings = null, globalStats = null;
    try {
        leaderboard = await window.fetchJSON('/api/leaderboard?limit=200');
    } catch (_) { }
    try {
        skillRankings = await window.fetchJSON('/api/skill-rankings');
    } catch (_) { }
    let firsts = {};
    let enrichedFirsts = {};
    try {
        const stats = await window.fetchJSON('/api/achievements/stats');
        globalStats = {
            counts: stats?.counts || {},
            totalPlayers: Number(stats?.totalPlayers) || leaderboard?.totalPlayers || leaderboard?.players?.length || 0
        };
    } catch (_) {
        globalStats = { counts: {}, totalPlayers: leaderboard?.totalPlayers || leaderboard?.players?.length || 0 };
    }
    try {
        const firstsResp = await window.fetchJSON('/api/achievements/firsts');
        firsts = firstsResp?.firsts || {};
        enrichedFirsts = firstsResp?.enriched || {};
        if (!globalStats.totalPlayers && Number(firstsResp?.totalPlayers)) {
            globalStats.totalPlayers = Number(firstsResp.totalPlayers);
        }
        // Merge enriched metadata into counts if backend provided counts map
        if (firstsResp?.counts && Object.keys(firstsResp.counts).length) {
            globalStats.counts = { ...globalStats.counts, ...firstsResp.counts };
        }
    } catch (_) { firsts = {}; enrichedFirsts = {}; }

    // Render insights and matrix
    try { await renderInsights(globalStats, leaderboard, skillRankings, firsts); } catch (_) { }
    try { await renderRelationshipMatrix(globalStats, leaderboard, skillRankings, firsts); } catch (_) { }

    // Group achievements by category for catalog
    if (container) {
        container.innerHTML = '';
        const categories = {};
        // Build dynamic rarity mapping now that we have prevalence.
        const totalPlayers = globalStats.totalPlayers || 0;
        const dynamicCatalog = ACHIEVEMENT_CATALOG.map(a => {
            const count = globalStats.counts[a.key] || enrichedFirsts[a.key]?.count || 0;
            const prevalencePct = totalPlayers ? (count / totalPlayers) * 100 : enrichedFirsts[a.key]?.pct || 0;
            const dynamicRarity = enrichedFirsts[a.key]?.rarity || deriveDynamicRarity(prevalencePct);
            return { ...a, dynamicRarity, prevalencePct, count, totalPlayers, first: firsts[a.key] || null };
        });
        dynamicCatalog.forEach(achievement => {
            if (!categories[achievement.category]) categories[achievement.category] = [];
            categories[achievement.category].push(achievement);
        });
        // Inject controls bar before rendering first category
        const controls = buildControlsBar();
        container.appendChild(controls);
        function reRender() {
            const cats = {};
            Object.keys(CATEGORY_INFO).forEach(k => { if (categories[k]) cats[k] = categories[k]; });
            const existing = container.querySelectorAll('.achievement-category');
            existing.forEach(e => e.remove());
            renderAdaptiveCatalog(container, cats);
        }
        // Attach events
        container.addEventListener('change', (e) => {
            const t = e.target;
            if (t.id === 'achSort') { UI_STATE.sortBy = t.value; reRender(); }
            if (t.id === 'achRarity') { UI_STATE.filterRarity = t.value; reRender(); }
            if (t.id === 'achOnlyFirsts') { UI_STATE.showOnlyFirsts = !!t.checked; reRender(); }
        });
        container.addEventListener('input', (e) => {
            if (e.target.id === 'achSearch') {
                UI_STATE.filterText = e.target.value.trim().toLowerCase();
                reRender();
            }
        });
        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.view-toggle');
            if (btn) {
                UI_STATE.viewMode = btn.getAttribute('data-view');
                container.querySelectorAll('.view-toggle').forEach(b => b.classList.toggle('active', b === btn));
                reRender();
            }
        });
        reRender();
    }
}

function init() {
    // Set theme
    const theme = localStorage.getItem("theme") || "dark";
    setTheme(theme);

    // Show current API base in footer
    const apiSpan = $("#currentApiBase");
    if (apiSpan && window.API_BASE) {
        const displayBase = window.API_BASE === location.origin ? "Same-origin" : window.API_BASE;
        apiSpan.textContent = displayBase;
    }

    renderAchievementsPage().then(() => {
        // Validate that key visuals exist; if not, surface a subtle toast
        const ok = !!document.querySelector('.insights-grid') && !!document.querySelector('.matrix');
        if (!ok) {
            try { toast('Note: Some insights could not be rendered (missing data). Showing catalog.', 'info', 4000); } catch (_) { }
        }

        // Enhance tooltips for leaderboard badges with a portal (fixed) tooltip to avoid clipping
        try { setupPortalTooltips(); } catch (_) { }
    });
}

// --- Dynamic rarity logic ---
// Buckets (tunable):
// mythic: <0.05%, legendary: <0.2%, epic: <1%, rare: <5%, uncommon: <15%, common: otherwise
function deriveDynamicRarity(pct) {
    if (pct <= 0) return 'mythic'; // nothing unlocked yet
    if (pct < 0.05) return 'mythic';
    if (pct < 0.2) return 'legendary';
    if (pct < 1) return 'epic';
    if (pct < 5) return 'rare';
    if (pct < 15) return 'uncommon';
    return 'common';
}

// Portal tooltip implementation to bypass stacking/overflow issues
let __portalTooltipEl = null;
function ensurePortalTooltip() {
    if (!__portalTooltipEl) {
        const elDiv = document.createElement('div');
        elDiv.id = 'portal-tooltip';
        elDiv.style.position = 'fixed';
        elDiv.style.zIndex = '999999';
        elDiv.style.pointerEvents = 'none';
        elDiv.style.opacity = '0';
        elDiv.style.transition = 'opacity .12s';
        elDiv.style.maxWidth = '260px';
        elDiv.style.fontSize = '.7rem';
        elDiv.style.lineHeight = '1.3';
        elDiv.style.fontWeight = '500';
        elDiv.style.padding = '.55rem .7rem';
        elDiv.style.borderRadius = '8px';
        elDiv.style.background = 'rgba(12,12,12,.92)';
        elDiv.style.border = '1px solid rgba(255,255,255,.15)';
        elDiv.style.boxShadow = '0 8px 22px -4px rgba(0,0,0,.6)';
        elDiv.style.backdropFilter = 'blur(3px)';
        elDiv.setAttribute('role', 'tooltip');
        document.body.appendChild(elDiv);
        __portalTooltipEl = elDiv;
    }
    return __portalTooltipEl;
}

function positionPortalTooltip(target) {
    const tip = ensurePortalTooltip();
    const rect = target.getBoundingClientRect();
    const gap = 8;
    const content = target.getAttribute('data-tooltip') || '';
    // Replace \n with <br>
    tip.innerHTML = content.replace(/\n/g, '<br>');
    tip.style.opacity = '1';
    tip.style.display = 'block';
    // Temporarily set left for width measurement
    tip.style.left = '0px';
    tip.style.top = '0px';
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const desiredX = rect.left + rect.width / 2;
    let left = desiredX - tip.offsetWidth / 2;
    left = Math.max(8, Math.min(vw - tip.offsetWidth - 8, left));
    let top = rect.top - tip.offsetHeight - gap;
    if (top < 4) top = rect.bottom + gap; // flip below if not enough space
    tip.style.left = left + 'px';
    tip.style.top = top + 'px';
}

function hidePortalTooltip() {
    if (!__portalTooltipEl) return;
    __portalTooltipEl.style.opacity = '0';
    // Delay hide to allow fade-out
    setTimeout(() => { if (__portalTooltipEl && __portalTooltipEl.style.opacity === '0') __portalTooltipEl.style.display = 'none'; }, 130);
}

function setupPortalTooltips() {
    const selector = '.leaderboard-table .tier-badge[data-tooltip], .leaderboard-table .mini-badge[data-tooltip], .leaderboard-table .mini-achievement-badge[data-tooltip]';
    const root = document.querySelector('.leaderboard-table');
    if (!root) return;
    root.addEventListener('mouseenter', (e) => {
        const t = e.target.closest(selector);
        if (!t) return;
        positionPortalTooltip(t);
    }, true);
    root.addEventListener('mousemove', (e) => {
        const t = e.target.closest(selector);
        if (!t) return;
        positionPortalTooltip(t);
    }, true);
    root.addEventListener('mouseleave', (e) => {
        const t = e.target.closest(selector);
        if (!t) return;
        hidePortalTooltip();
    }, true);
    // Also hide on scroll / resize for correctness
    window.addEventListener('scroll', hidePortalTooltip, true);
    window.addEventListener('resize', hidePortalTooltip, true);
}

init();
