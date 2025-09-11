// Achievements page logic
const ACHIEVEMENT_CATALOG = [
    // Meta tier (prestige) - neutral, descriptive titles
    { key: 'tier-grandmaster', icon: '👑', label: 'Grandmaster: rank #1 or #1 in 3+ skills', desc: 'Rank #1 overall or #1 in 3+ skills.', category: 'tier', rarity: 'mythic' },
    { key: 'tier-master', icon: '🏆', label: 'Master: top 0.01% overall', desc: 'Be in the top 0.01% overall.', category: 'tier', rarity: 'legendary' },
    { key: 'tier-diamond', icon: '💎', label: 'Diamond: top 0.1% overall', desc: 'Be in the top 0.1% overall.', category: 'tier', rarity: 'epic' },

    // Competitive Rankings - clear labels
    { key: 'triple-crown', icon: '👑', label: 'Three #1 Skill Ranks', desc: 'Hold #1 rank in 3 or more skills at once.', category: 'rank', rarity: 'legendary' },
    { key: 'crowned-any', icon: '🥇', label: '#1 Rank (Any Skill)', desc: 'Achieve #1 rank in any single skill.', category: 'rank', rarity: 'rare' },
    { key: 'top-10-any', icon: '🎯', label: 'Top 10 (Any Skill)', desc: 'Reach top 10 in any skill.', category: 'rank', rarity: 'rare' },
    { key: 'top-100-any', icon: '⭐', label: 'Top 100 (Any Skill)', desc: 'Reach top 100 in any skill.', category: 'rank', rarity: 'common' },

    // Account Progression - straightforward
    { key: 'total-2000', icon: '📈', label: 'Total Level 2000+', desc: 'Reach total level 2000 or higher.', category: 'account', rarity: 'epic' },
    { key: 'total-1500', icon: '📊', label: 'Total Level 1500+', desc: 'Reach total level 1500 or higher.', category: 'account', rarity: 'rare' },
    { key: 'maxed-account', icon: '👑', label: 'All Skills 99', desc: 'Reach level 99 in every skill.', category: 'account', rarity: 'mythic' },
    { key: 'seven-99s', icon: '💫', label: 'Seven 99s', desc: 'Reach level 99 in seven or more skills.', category: 'account', rarity: 'rare' },
    { key: 'five-99s', icon: '✨', label: 'Five 99s', desc: 'Reach level 99 in five or more skills.', category: 'account', rarity: 'common' },
    { key: 'combat-maxed', icon: '⚔️', label: 'All Combat Skills 99', desc: 'Attack, Strength, Defence, Hitpoints, Ranged, Magic, Prayer at 99.', category: 'account', rarity: 'epic' },

    // Skill Mastery - plain
    { key: 'skill-master-attack', icon: '🗡️', label: '99 Attack', desc: 'Reach level 99 in Attack.', category: 'skill-mastery', rarity: 'rare' },
    { key: 'skill-master-strength', icon: '💪', label: '99 Strength', desc: 'Reach level 99 in Strength.', category: 'skill-mastery', rarity: 'rare' },
    { key: 'skill-master-defence', icon: '🛡️', label: '99 Defence', desc: 'Reach level 99 in Defence.', category: 'skill-mastery', rarity: 'rare' },
    { key: 'skill-master-hitpoints', icon: '❤️', label: '99 Hitpoints', desc: 'Reach level 99 in Hitpoints.', category: 'skill-mastery', rarity: 'rare' },
    { key: 'skill-master-ranged', icon: '🏹', label: '99 Ranged', desc: 'Reach level 99 in Ranged.', category: 'skill-mastery', rarity: 'rare' },
    { key: 'skill-master-magic', icon: '🔮', label: '99 Magic', desc: 'Reach level 99 in Magic.', category: 'skill-mastery', rarity: 'rare' },
    { key: 'skill-master-prayer', icon: '🙏', label: '99 Prayer', desc: 'Reach level 99 in Prayer.', category: 'skill-mastery', rarity: 'rare' },

    // Gathering Skills - describe thresholds
    { key: 'gathering-elite', icon: '🪓', label: '90+ WC, Fishing, Mining', desc: 'Woodcutting, Fishing, and Mining at level 90+.', category: 'gathering', rarity: 'epic' },
    { key: 'woodcutting-expert', icon: '🌳', label: '85+ Woodcutting', desc: 'Reach level 85+ in Woodcutting.', category: 'gathering', rarity: 'common' },
    { key: 'fishing-expert', icon: '🎣', label: '85+ Fishing', desc: 'Reach level 85+ in Fishing.', category: 'gathering', rarity: 'common' },
    { key: 'mining-expert', icon: '⛏️', label: '85+ Mining', desc: 'Reach level 85+ in Mining.', category: 'gathering', rarity: 'common' },

    // Artisan Skills
    { key: 'artisan-elite', icon: '🔨', label: '90+ Smithing, Crafting, Fletching', desc: 'Smithing, Crafting, and Fletching at level 90+.', category: 'artisan', rarity: 'epic' },
    { key: 'cooking-expert', icon: '👨‍🍳', label: '85+ Cooking', desc: 'Reach level 85+ in Cooking.', category: 'artisan', rarity: 'common' },
    { key: 'firemaking-expert', icon: '🔥', label: '85+ Firemaking', desc: 'Reach level 85+ in Firemaking.', category: 'artisan', rarity: 'common' },
    { key: 'smithing-expert', icon: '⚒️', label: '85+ Smithing', desc: 'Reach level 85+ in Smithing.', category: 'artisan', rarity: 'common' },

    // Support Skills
    { key: 'support-elite', icon: '🧪', label: '90+ Herblore, Runecraft, Slayer', desc: 'Herblore, Runecraft, and Slayer at level 90+.', category: 'support', rarity: 'epic' },
    { key: 'herblore-expert', icon: '🌿', label: '85+ Herblore', desc: 'Reach level 85+ in Herblore.', category: 'support', rarity: 'common' },
    { key: 'agility-expert', icon: '🏃', label: '85+ Agility', desc: 'Reach level 85+ in Agility.', category: 'support', rarity: 'common' },
    { key: 'thieving-expert', icon: '🕵️', label: '85+ Thieving', desc: 'Reach level 85+ in Thieving.', category: 'support', rarity: 'common' },

    // Playstyle Specializations
    { key: 'balanced', icon: '⚖️', label: 'Balanced Levels', desc: 'All skills ≥40 with spread ≤30 levels.', category: 'playstyle', rarity: 'rare' },
    { key: 'glass-cannon', icon: '💥', label: 'High Offense, Low Defence', desc: 'Atk+Str ≥180 and Defence ≤60.', category: 'playstyle', rarity: 'epic' },
    { key: 'tank', icon: '🛡️', label: 'High Defence and Hitpoints', desc: 'Defence ≥90 and Hitpoints ≥85.', category: 'playstyle', rarity: 'rare' },
    { key: 'skiller', icon: '🎯', label: 'Non-Combat Focused', desc: 'Non-combat skills avg ≥70; combat skills avg ≤50.', category: 'playstyle', rarity: 'epic' },
    { key: 'combat-pure', icon: '⚔️', label: 'Combat Focused', desc: 'Combat skills avg ≥80; non-combat skills avg ≤30.', category: 'playstyle', rarity: 'rare' },

    // Performance Excellence
    { key: 'elite', icon: '🚀', label: 'Above Avg in 90%+ Skills', desc: 'Be above the population average in ≥90% of skills.', category: 'performance', rarity: 'legendary' },
    { key: 'versatile', icon: '🎭', label: 'Above Avg in 75%+ Skills', desc: 'Be above the population average in ≥75% of skills.', category: 'performance', rarity: 'epic' },
    { key: 'consistent', icon: '📊', label: 'Above Avg in 50%+ Skills', desc: 'Be above the population average in ≥50% of skills.', category: 'performance', rarity: 'rare' },
    { key: 'xp-millionaire', icon: '💰', label: '1,000,000+ Total XP', desc: 'Accumulate 1,000,000 or more total XP.', category: 'performance', rarity: 'epic' },
    { key: 'xp-billionaire', icon: '🏦', label: '1,000,000,000+ Total XP', desc: 'Accumulate 1,000,000,000 or more total XP.', category: 'performance', rarity: 'legendary' },

    // Activity & Dedication
    { key: 'daily-grinder', icon: '🕒', label: 'Updated in Last 24h', desc: 'Profile updated within the last 24 hours.', category: 'activity', rarity: 'common' },
    { key: 'weekly-active', icon: '📅', label: 'Updated in Last 7d', desc: 'Profile updated within the last 7 days.', category: 'activity', rarity: 'common' },
    { key: 'monthly-active', icon: '🗓️', label: 'Updated in Last 30d', desc: 'Profile updated within the last 30 days.', category: 'activity', rarity: 'common' },
    { key: 'dedicated', icon: '🔥', label: 'Updated in Last 3d', desc: 'Profile updated within the last 3 days.', category: 'activity', rarity: 'common' },

    // Milestone Achievements
    { key: 'level-50-average', icon: '🎯', label: 'Average Level 50+', desc: 'Average level of 50+ across all skills.', category: 'milestone', rarity: 'common' },
    { key: 'level-75-average', icon: '⭐', label: 'Average Level 75+', desc: 'Average level of 75+ across all skills.', category: 'milestone', rarity: 'rare' },
    { key: 'level-90-average', icon: '👑', label: 'Average Level 90+', desc: 'Average level of 90+ across all skills.', category: 'milestone', rarity: 'epic' },

    // Special Combinations
    { key: 'magic-ranged', icon: '🧙‍♂️', label: '80+ Magic and Ranged', desc: 'Both Magic and Ranged at level 80+.', category: 'special', rarity: 'rare' },
    { key: 'melee-specialist', icon: '⚔️', label: '85+ Atk, Str, Def', desc: 'Attack, Strength, and Defence all at 85+.', category: 'special', rarity: 'rare' },
    { key: 'support-master', icon: '🛠️', label: '80+ Prayer, Herblore, Runecraft', desc: 'Prayer, Herblore, and Runecraft all at 80+.', category: 'special', rarity: 'rare' },
    { key: 'gathering-master', icon: '📦', label: '80+ WC, Fishing, Mining', desc: 'Woodcutting, Fishing, and Mining all at 80+.', category: 'special', rarity: 'rare' }
];

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
    const card = el('div', `achievement-card rarity-${achievement.rarity}`);
    card.setAttribute('data-tooltip', `${achievement.label}\n${achievement.desc}`);

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

function renderInsights(globalStats, leaderboard, skillRankings) {
    const wrap = $('#insightsContainer');
    if (!wrap) return;
    wrap.innerHTML = '';

    const players = leaderboard?.players || [];
    const totalPlayers = globalStats?.totalPlayers || players.length || 0;
    const counts = globalStats?.counts || {};
    const prevalence = prevalenceForKeys(totalPlayers, counts);
    const unlocks = computePlayerUnlocks(players, skillRankings);

    // Top players by unlock count
    const topPlayers = pickTop(players, 5, p => unlocks.get(p.username)?.size || 0);

    const topPlayersCard = el('div', 'insight-card');
    topPlayersCard.innerHTML = '<h3 class="insight-title">Most Achievements Unlocked</h3>';
    const tpList = el('div', 'insight-list');
    topPlayers.forEach((p, idx) => {
        const size = unlocks.get(p.username)?.size || 0;
        const row = el('div', 'insight-row');
        row.innerHTML = `
            <div class="insight-rank">${idx + 1}</div>
            <div class="insight-user">
                <button class="username-link" data-user="${p.username}">${p.username}</button>
                ${p.tier ? `<span class="tier-badge tier-${p.tier.toLowerCase()}">${p.tier}</span>` : ''}
            </div>
            <div class="insight-bar-wrap" title="${size} achievements">
                <div class="insight-bar" style="width:${Math.min(100, (size / 25) * 100)}%"></div>
                <span class="insight-bar-label">${size}</span>
            </div>`;
        tpList.appendChild(row);
    });
    topPlayersCard.appendChild(tpList);

    // Most/least common achievements
    const withPrev = ACHIEVEMENT_CATALOG.map(a => ({
        ...a,
        prevalence: prevalence.get(a.key) || 0
    }));
    const mostCommon = pickTop(withPrev, 5, a => a.prevalence);
    const leastCommon = pickTop(withPrev, 5, a => -a.prevalence);

    function makeAchList(title, list) {
        const card = el('div', 'insight-card');
        card.appendChild(el('h3', 'insight-title', [text(title)]));
        const container = el('div', 'insight-list');
        list.forEach(a => {
            const item = el('div', 'insight-row');
            item.innerHTML = `
                <div class="insight-icon" title="${a.label}\n${a.desc}">${a.icon}</div>
                <div class="insight-ach">
                    <div class="ach-name">${a.label}</div>
                    <div class="ach-desc">${a.desc}</div>
                </div>
                <div class="insight-bar-wrap" title="${a.prevalence.toFixed(1)}% of players">
                    <div class="insight-bar" style="width:${a.prevalence}%"></div>
                    <span class="insight-bar-label">${a.prevalence.toFixed(1)}%</span>
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

async function renderRelationshipMatrix(globalStats, leaderboard, skillRankings) {
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
    const prevalence = prevalenceForKeys(globalStats?.totalPlayers || 0, globalStats?.counts || {});

    // Choose columns: 12 most informative achievements (high variance)
    const withPrev = ACHIEVEMENT_CATALOG.map(a => ({
        ...a,
        prevalence: prevalence.get(a.key) || 0
    }));
    // score by closeness to 50% (most informative binary split)
    const columns = pickTop(withPrev, 12, a => 50 - Math.abs(50 - a.prevalence));

    const table = el('div', 'matrix');
    // Header row
    const header = el('div', 'matrix-row matrix-header');
    header.appendChild(el('div', 'matrix-cell fixed cell--corner', [text('Player')]));
    columns.forEach(a => {
        const cell = el('div', 'matrix-cell');
        cell.innerHTML = `<div class="matrix-ach" title="${a.label}\n${a.desc}">${a.icon}</div>
                          <div class="matrix-prev">${a.prevalence.toFixed(0)}%</div>`;
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
    try {
        const stats = await window.fetchJSON('/api/achievements/stats');
        globalStats = {
            counts: stats?.counts || {},
            totalPlayers: Number(stats?.totalPlayers) || leaderboard?.totalPlayers || leaderboard?.players?.length || 0
        };
    } catch (_) {
        globalStats = { counts: {}, totalPlayers: leaderboard?.totalPlayers || leaderboard?.players?.length || 0 };
    }

    // Render insights and matrix
    try { renderInsights(globalStats, leaderboard, skillRankings); } catch (_) { }
    try { await renderRelationshipMatrix(globalStats, leaderboard, skillRankings); } catch (_) { }

    // Group achievements by category for catalog
    if (container) {
        container.innerHTML = '';
        const categories = {};
        ACHIEVEMENT_CATALOG.forEach(achievement => {
            if (!categories[achievement.category]) {
                categories[achievement.category] = [];
            }
            categories[achievement.category].push(achievement);
        });
        Object.keys(CATEGORY_INFO).forEach(categoryKey => {
            if (categories[categoryKey]) {
                container.appendChild(createCategorySection(categoryKey, categories[categoryKey]));
            }
        });
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
    });
}

init();
