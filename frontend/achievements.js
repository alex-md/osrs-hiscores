// Achievements page logic
const ACHIEVEMENT_CATALOG = [
    // Meta tier (prestige) - Ultra elite status
    { key: 'tier-grandmaster', icon: '👑', label: 'Grandmaster', desc: 'Ultra-elite: top 0.001% overall or #1 in 3+ skills.', category: 'tier', rarity: 'mythic' },
    { key: 'tier-master', icon: '🏆', label: 'Master', desc: 'Elite: top 0.01% overall.', category: 'tier', rarity: 'legendary' },
    { key: 'tier-diamond', icon: '💎', label: 'Diamond', desc: 'Top 0.1% overall.', category: 'tier', rarity: 'epic' },

    // Competitive Rankings - Dominating skill leaderboards
    { key: 'triple-crown', icon: '👑', label: 'Triple Crown', desc: 'Hold rank #1 in 3 or more skills at once.', category: 'rank', rarity: 'legendary' },
    { key: 'crowned-any', icon: '🥇', label: 'Skill Crowned', desc: 'Achieve rank #1 in any single skill.', category: 'rank', rarity: 'rare' },
    { key: 'top-10-any', icon: '🎯', label: 'Elite Contender', desc: 'Reach top 10 in any skill.', category: 'rank', rarity: 'rare' },
    { key: 'top-100-any', icon: '⭐', label: 'Rising Star', desc: 'Reach top 100 in any skill.', category: 'rank', rarity: 'common' },

    // Account Progression - Skill development milestones
    { key: 'total-2000', icon: '📈', label: '2K Club', desc: 'Reach total level 2000 or higher.', category: 'account', rarity: 'epic' },
    { key: 'total-1500', icon: '📊', label: '1.5K Milestone', desc: 'Reach total level 1500 or higher.', category: 'account', rarity: 'rare' },
    { key: 'maxed-account', icon: '👑', label: 'Maxed Account', desc: 'Reach level 99 in every skill.', category: 'account', rarity: 'mythic' },
    { key: 'seven-99s', icon: '💫', label: 'Seven Seals', desc: 'Reach level 99 in seven or more skills.', category: 'account', rarity: 'rare' },
    { key: 'five-99s', icon: '✨', label: 'Five Star', desc: 'Reach level 99 in five or more skills.', category: 'account', rarity: 'common' },
    { key: 'combat-maxed', icon: '⚔️', label: 'Combat Master', desc: 'Max all combat skills (Attack, Strength, Defence, Hitpoints, Ranged, Magic, Prayer).', category: 'account', rarity: 'epic' },

    // Skill Mastery - Individual skill excellence
    { key: 'skill-master-attack', icon: '🗡️', label: 'Attack Master', desc: 'Reach level 99 in Attack.', category: 'skill-mastery', rarity: 'rare' },
    { key: 'skill-master-strength', icon: '💪', label: 'Strength Master', desc: 'Reach level 99 in Strength.', category: 'skill-mastery', rarity: 'rare' },
    { key: 'skill-master-defence', icon: '🛡️', label: 'Defence Master', desc: 'Reach level 99 in Defence.', category: 'skill-mastery', rarity: 'rare' },
    { key: 'skill-master-hitpoints', icon: '❤️', label: 'Constitution Master', desc: 'Reach level 99 in Hitpoints.', category: 'skill-mastery', rarity: 'rare' },
    { key: 'skill-master-ranged', icon: '🏹', label: 'Ranged Master', desc: 'Reach level 99 in Ranged.', category: 'skill-mastery', rarity: 'rare' },
    { key: 'skill-master-magic', icon: '🔮', label: 'Magic Master', desc: 'Reach level 99 in Magic.', category: 'skill-mastery', rarity: 'rare' },
    { key: 'skill-master-prayer', icon: '🙏', label: 'Prayer Master', desc: 'Reach level 99 in Prayer.', category: 'skill-mastery', rarity: 'rare' },

    // Gathering Skills - Resource collection
    { key: 'gathering-elite', icon: '🪓', label: 'Resource Baron', desc: 'Reach level 90+ in Woodcutting, Fishing, and Mining.', category: 'gathering', rarity: 'epic' },
    { key: 'woodcutting-expert', icon: '🌳', label: 'Lumberjack', desc: 'Reach level 85+ in Woodcutting.', category: 'gathering', rarity: 'common' },
    { key: 'fishing-expert', icon: '🎣', label: 'Angler', desc: 'Reach level 85+ in Fishing.', category: 'gathering', rarity: 'common' },
    { key: 'mining-expert', icon: '⛏️', label: 'Miner', desc: 'Reach level 85+ in Mining.', category: 'gathering', rarity: 'common' },

    // Artisan Skills - Crafting and creation
    { key: 'artisan-elite', icon: '🔨', label: 'Master Craftsman', desc: 'Reach level 90+ in Smithing, Crafting, and Fletching.', category: 'artisan', rarity: 'epic' },
    { key: 'cooking-expert', icon: '👨‍🍳', label: 'Chef', desc: 'Reach level 85+ in Cooking.', category: 'artisan', rarity: 'common' },
    { key: 'firemaking-expert', icon: '🔥', label: 'Pyromancer', desc: 'Reach level 85+ in Firemaking.', category: 'artisan', rarity: 'common' },
    { key: 'smithing-expert', icon: '⚒️', label: 'Blacksmith', desc: 'Reach level 85+ in Smithing.', category: 'artisan', rarity: 'common' },

    // Support Skills - Utility and assistance
    { key: 'support-elite', icon: '🧪', label: 'Utility Expert', desc: 'Reach level 90+ in Herblore, Runecraft, and Slayer.', category: 'support', rarity: 'epic' },
    { key: 'herblore-expert', icon: '🌿', label: 'Herbalist', desc: 'Reach level 85+ in Herblore.', category: 'support', rarity: 'common' },
    { key: 'agility-expert', icon: '🏃', label: 'Acrobat', desc: 'Reach level 85+ in Agility.', category: 'support', rarity: 'common' },
    { key: 'thieving-expert', icon: '🕵️', label: 'Thief', desc: 'Reach level 85+ in Thieving.', category: 'support', rarity: 'common' },

    // Playstyle Specializations - Unique character builds
    { key: 'balanced', icon: '⚖️', label: 'Balanced Build', desc: 'All skills ≥40 with spread within 30 levels.', category: 'playstyle', rarity: 'rare' },
    { key: 'glass-cannon', icon: '💥', label: 'Glass Cannon', desc: 'Offense 180+ (Atk+Str) with Defence ≤60.', category: 'playstyle', rarity: 'epic' },
    { key: 'tank', icon: '🛡️', label: 'Tank', desc: 'Defence 90+ with Hitpoints 85+.', category: 'playstyle', rarity: 'rare' },
    { key: 'skiller', icon: '🎯', label: 'Pure Skiller', desc: 'Non-combat skills average 70+ while combat skills ≤50.', category: 'playstyle', rarity: 'epic' },
    { key: 'combat-pure', icon: '⚔️', label: 'Combat Pure', desc: 'Combat skills 80+ while non-combat skills ≤30.', category: 'playstyle', rarity: 'rare' },

    // Performance Excellence - Statistical achievements
    { key: 'elite', icon: '🚀', label: 'Polymath', desc: 'Above average in ≥90% of skills.', category: 'performance', rarity: 'legendary' },
    { key: 'versatile', icon: '🎭', label: 'Versatile', desc: 'Above average in ≥75% of skills.', category: 'performance', rarity: 'epic' },
    { key: 'consistent', icon: '📊', label: 'Consistent', desc: 'Above average in ≥50% of skills.', category: 'performance', rarity: 'rare' },
    { key: 'xp-millionaire', icon: '💰', label: 'XP Millionaire', desc: 'Accumulate 1,000,000+ total XP.', category: 'performance', rarity: 'epic' },
    { key: 'xp-billionaire', icon: '🏦', label: 'XP Billionaire', desc: 'Accumulate 1,000,000,000+ total XP.', category: 'performance', rarity: 'legendary' },

    // Activity & Dedication - Consistency and engagement
    { key: 'daily-grinder', icon: '🕒', label: 'Daily Grinder', desc: 'Updated within the last 24 hours.', category: 'activity', rarity: 'common' },
    { key: 'weekly-active', icon: '📅', label: 'Weekly Warrior', desc: 'Updated within the last 7 days.', category: 'activity', rarity: 'common' },
    { key: 'monthly-active', icon: '🗓️', label: 'Monthly Maven', desc: 'Updated within the last 30 days.', category: 'activity', rarity: 'common' },
    { key: 'dedicated', icon: '🔥', label: 'Dedicated', desc: 'Updated within the last 3 days.', category: 'activity', rarity: 'common' },

    // Milestone Achievements - Level-based goals
    { key: 'level-50-average', icon: '🎯', label: 'Halfway Hero', desc: 'Average level of 50+ across all skills.', category: 'milestone', rarity: 'common' },
    { key: 'level-75-average', icon: '⭐', label: 'Three-Quarter Champion', desc: 'Average level of 75+ across all skills.', category: 'milestone', rarity: 'rare' },
    { key: 'level-90-average', icon: '👑', label: 'Elite Average', desc: 'Average level of 90+ across all skills.', category: 'milestone', rarity: 'epic' },

    // Special Combinations - Unique skill combinations
    { key: 'magic-ranged', icon: '🧙‍♂️', label: 'Hybrid Mage', desc: 'Both Magic and Ranged at level 80+.', category: 'special', rarity: 'rare' },
    { key: 'melee-specialist', icon: '⚔️', label: 'Melee Specialist', desc: 'Attack, Strength, and Defence all 85+.', category: 'special', rarity: 'rare' },
    { key: 'support-master', icon: '🛠️', label: 'Support Master', desc: 'Prayer, Herblore, and Runecraft all 80+.', category: 'special', rarity: 'rare' },
    { key: 'gathering-master', icon: '📦', label: 'Gathering Master', desc: 'Woodcutting, Fishing, and Mining all 80+.', category: 'special', rarity: 'rare' }
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

function renderAchievementsPage() {
    const container = $('#achievementsContainer');

    // Group achievements by category
    const categories = {};
    ACHIEVEMENT_CATALOG.forEach(achievement => {
        if (!categories[achievement.category]) {
            categories[achievement.category] = [];
        }
        categories[achievement.category].push(achievement);
    });

    // Render each category
    Object.keys(CATEGORY_INFO).forEach(categoryKey => {
        if (categories[categoryKey]) {
            container.appendChild(createCategorySection(categoryKey, categories[categoryKey]));
        }
    });
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

    renderAchievementsPage();
}

init();
