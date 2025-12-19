import { SKILLS } from './skills.js';

const BASE_CATALOG = [
  // Meta tier (prestige)
  { key: 'tier-grandmaster', icon: '👑', label: 'Grandmaster: rank #1 or #1 in 3+ skills', desc: 'Rank #1 overall or #1 in 3+ skills.', category: 'tier', rarity: 'mythic' },
  { key: 'overall-rank-1', icon: '🏁', label: 'Overall Rank #1', desc: 'Hold #1 position on the overall leaderboard.', category: 'tier', rarity: 'mythic' },
  { key: 'first-99-any', icon: '🥇', label: 'First 99 (Any Skill)', desc: 'The first player to hit 99 in any skill.', category: 'rank', rarity: 'legendary' },
  { key: 'first-top1-any', icon: '🏆', label: 'First #1 (Any Skill)', desc: 'The first player to reach rank #1 in any skill.', category: 'rank', rarity: 'legendary' },
  { key: 'tier-master', icon: '🏆', label: 'Master: top 0.01% overall', desc: 'Be in the top 0.01% overall.', category: 'tier', rarity: 'legendary' },
  { key: 'tier-diamond', icon: '💎', label: 'Diamond: top 0.1% overall', desc: 'Be in the top 0.1% overall.', category: 'tier', rarity: 'epic' },

  // Competitive Rankings
  { key: 'triple-crown', icon: '👑', label: 'Three #1 Skill Ranks', desc: 'Hold #1 rank in 3 or more skills at once.', category: 'rank', rarity: 'legendary' },
  { key: 'crowned-any', icon: '🥇', label: '#1 Rank (Any Skill)', desc: 'Achieve #1 rank in any single skill.', category: 'rank', rarity: 'rare' },
  { key: 'top-10-any', icon: '🎯', label: 'Top 10 (Any Skill)', desc: 'Reach top 10 in any skill.', category: 'rank', rarity: 'rare' },
  { key: 'top-100-any', icon: '⭐', label: 'Top 100 (Any Skill)', desc: 'Reach top 100 in any skill.', category: 'rank', rarity: 'common' },

  // Account Progression
  { key: 'total-2277', icon: '🏆', label: 'Max Total Level (2277)', desc: 'Reach the maximum total level 2277.', category: 'account', rarity: 'mythic' },
  { key: 'total-2200', icon: '🏅', label: 'Total Level 2200+', desc: 'Reach total level 2200 or higher.', category: 'account', rarity: 'legendary' },
  { key: 'total-2000', icon: '📈', label: 'Total Level 2000+', desc: 'Reach total level 2000 or higher.', category: 'account', rarity: 'epic' },
  { key: 'total-1500', icon: '📊', label: 'Total Level 1500+', desc: 'Reach total level 1500 or higher.', category: 'account', rarity: 'rare' },
  { key: 'maxed-account', icon: '👑', label: 'All Skills 99', desc: 'Reach level 99 in every skill.', category: 'account', rarity: 'mythic' },
  { key: 'seven-99s', icon: '💫', label: 'Seven 99s', desc: 'Reach level 99 in seven or more skills.', category: 'account', rarity: 'rare' },
  { key: 'five-99s', icon: '✨', label: 'Five 99s', desc: 'Reach level 99 in five or more skills.', category: 'account', rarity: 'common' },
  { key: 'combat-maxed', icon: '⚔️', label: 'All Combat Skills 99', desc: 'Attack, Strength, Defence, Hitpoints, Ranged, Magic, Prayer at 99.', category: 'account', rarity: 'epic' },

  // Skill Mastery
  { key: 'skill-master-attack', icon: '🗡️', label: '99 Attack', desc: 'Reach level 99 in Attack.', category: 'skill-mastery', rarity: 'rare' },
  { key: 'skill-master-strength', icon: '💪', label: '99 Strength', desc: 'Reach level 99 in Strength.', category: 'skill-mastery', rarity: 'rare' },
  { key: 'skill-master-defence', icon: '🛡️', label: '99 Defence', desc: 'Reach level 99 in Defence.', category: 'skill-mastery', rarity: 'rare' },
  { key: 'skill-master-hitpoints', icon: '❤️', label: '99 Hitpoints', desc: 'Reach level 99 in Hitpoints.', category: 'skill-mastery', rarity: 'rare' },
  { key: 'skill-master-ranged', icon: '🏹', label: '99 Ranged', desc: 'Reach level 99 in Ranged.', category: 'skill-mastery', rarity: 'rare' },
  { key: 'skill-master-magic', icon: '🔮', label: '99 Magic', desc: 'Reach level 99 in Magic.', category: 'skill-mastery', rarity: 'rare' },
  { key: 'skill-master-prayer', icon: '🙏', label: '99 Prayer', desc: 'Reach level 99 in Prayer.', category: 'skill-mastery', rarity: 'rare' },

  // Gathering Skills
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

const ACHIEVEMENT_CATALOG = [
  ...BASE_CATALOG,
  { key: 'totalxp-10m', icon: '💎', label: '10m Total XP', desc: 'Reach 10,000,000 total XP.', category: 'performance', rarity: 'rare' },
  { key: 'totalxp-50m', icon: '💠', label: '50m Total XP', desc: 'Reach 50,000,000 total XP.', category: 'performance', rarity: 'epic' },
  { key: 'totalxp-100m', icon: '🔷', label: '100m Total XP', desc: 'Reach 100,000,000 total XP.', category: 'performance', rarity: 'legendary' },
  { key: 'totalxp-200m', icon: '🔶', label: '200m Total XP', desc: 'Reach 200,000,000 total XP.', category: 'performance', rarity: 'mythic' },
  { key: 'combat-level-100', icon: '⚔️', label: 'Combat Level 100+', desc: 'Reach combat level 100 or higher.', category: 'milestone', rarity: 'rare' },
  { key: 'combat-level-110', icon: '🛡️', label: 'Combat Level 110+', desc: 'Reach combat level 110 or higher.', category: 'milestone', rarity: 'epic' },
  { key: 'combat-level-120', icon: '🏹', label: 'Combat Level 120+', desc: 'Reach combat level 120 or higher.', category: 'milestone', rarity: 'legendary' },
  { key: 'combat-level-126', icon: '👑', label: 'Combat Level 126', desc: 'Reach the max combat level 126.', category: 'milestone', rarity: 'mythic' }
];

for (const skill of SKILLS) {
  ACHIEVEMENT_CATALOG.push({
    key: `skill-200m-${skill}`,
    icon: '🥇',
    label: `200m XP in ${skill.charAt(0).toUpperCase() + skill.slice(1)}`,
    desc: `Reach 200,000,000 XP in ${skill}.`,
    category: 'skill-mastery',
    rarity: 'mythic'
  });
}

export const ACHIEVEMENTS_BY_KEY = new Map(ACHIEVEMENT_CATALOG.map((entry) => [entry.key, entry]));

export function getAchievementMeta(key) {
  if (!key) return null;
  return ACHIEVEMENTS_BY_KEY.get(key) || null;
}

const ACHIEVEMENT_LABEL_OVERRIDES = {
  'overall-rank-1': 'Overall Rank #1',
  'first-99-any': 'First 99 (Any Skill)',
  'first-top1-any': 'First #1 (Any Skill)',
  'maxed-account': 'Maxed Account',
  'combat-maxed': 'All Combat Skills 99',
  'total-2277': 'Max Total Level (2277)',
  'total-2200': 'Total Level 2200+',
  'total-2000': 'Total Level 2000+',
  'total-1500': 'Total Level 1500+',
  'totalxp-200m': '200m Total XP',
  'totalxp-100m': '100m Total XP',
  'totalxp-50m': '50m Total XP',
  'totalxp-10m': '10m Total XP',
  'xp-billionaire': '1b Total XP',
  'xp-millionaire': '1m Total XP',
  'tier-grandmaster': 'Grandmaster Tier',
  'tier-master': 'Master Tier',
  'tier-diamond': 'Diamond Tier',
  'tier-platinum': 'Platinum Tier',
  'tier-gold': 'Gold Tier',
  'tier-silver': 'Silver Tier',
  'tier-bronze': 'Bronze Tier'
};

export function friendlyAchievementLabel(key) {
  if (!key) return '';
  const meta = getAchievementMeta(key);
  if (meta?.label) return meta.label;
  if (ACHIEVEMENT_LABEL_OVERRIDES[key]) return ACHIEVEMENT_LABEL_OVERRIDES[key];

  const skillCase = (value) => value ? value.charAt(0).toUpperCase() + value.slice(1) : '';

  const matchMaster = /^skill-master-(.+)$/.exec(key);
  if (matchMaster) return `99 ${skillCase(matchMaster[1])}`;

  const matchXp = /^skill-200m-(.+)$/.exec(key);
  if (matchXp) return `200m XP in ${skillCase(matchXp[1])}`;

  const matchTotalXp = /^totalxp-(\d+)([a-z]+)$/.exec(key);
  if (matchTotalXp) return `${matchTotalXp[1]}${matchTotalXp[2].toUpperCase()} Total XP`;

  switch (key) {
    case 'triple-crown':
      return 'Three #1 Skill Ranks';
    case 'crowned-any':
      return '#1 Rank (Any Skill)';
    case 'top-10-any':
      return 'Top 10 (Any Skill)';
    case 'top-100-any':
      return 'Top 100 (Any Skill)';
    case 'gathering-elite':
      return '90+ Gathering Trio';
    case 'artisan-elite':
      return '90+ Artisan Trio';
    case 'support-elite':
      return '90+ Support Trio';
    case 'balanced':
      return 'Balanced Skill Spread';
    case 'glass-cannon':
      return 'Glass Cannon Build';
    case 'tank':
      return 'Tank Build';
    case 'skiller':
      return 'Skiller Build';
    case 'combat-pure':
      return 'Combat Pure Build';
    default:
      return key.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

export { ACHIEVEMENT_LABEL_OVERRIDES };
