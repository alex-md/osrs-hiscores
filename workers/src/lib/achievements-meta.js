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

function capitalizeSkillName(skill) {
  if (!skill) return '';
  return skill.charAt(0).toUpperCase() + skill.slice(1);
}

export function friendlyAchievementLabel(key) {
  if (!key) return '';
  if (ACHIEVEMENT_LABEL_OVERRIDES[key]) return ACHIEVEMENT_LABEL_OVERRIDES[key];
  let match = /^skill-master-(.+)$/.exec(key);
  if (match) return `99 ${capitalizeSkillName(match[1])}`;
  match = /^skill-200m-(.+)$/.exec(key);
  if (match) return `200m XP in ${capitalizeSkillName(match[1])}`;
  match = /^totalxp-(\d+)([a-z]+)$/.exec(key);
  if (match) return `${match[1]}${match[2].toUpperCase()} Total XP`;
  if (key === 'triple-crown') return 'Three #1 Skill Ranks';
  if (key === 'crowned-any') return '#1 Rank (Any Skill)';
  if (key === 'top-10-any') return 'Top 10 (Any Skill)';
  if (key === 'top-100-any') return 'Top 100 (Any Skill)';
  if (key === 'gathering-elite') return '90+ Gathering Trio';
  if (key === 'artisan-elite') return '90+ Artisan Trio';
  if (key === 'support-elite') return '90+ Support Trio';
  if (key === 'balanced') return 'Balanced Skill Spread';
  if (key === 'glass-cannon') return 'Glass Cannon Build';
  if (key === 'tank') return 'Tank Build';
  if (key === 'skiller') return 'Skiller Build';
  if (key === 'combat-pure') return 'Combat Pure Build';
  return key.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export { ACHIEVEMENT_LABEL_OVERRIDES };
