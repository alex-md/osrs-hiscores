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
