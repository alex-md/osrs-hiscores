import { SKILLS, title } from './domain.js';
import { BOSSES } from './activities.js';
export const PROGRESS_METRICS = [
  { key: 'overall', name: 'Overall XP', unit: 'XP' },
  ...SKILLS.map(key => ({ key, name: title(key), unit: 'XP' })),
  { key: 'bosses', name: 'All bosses', unit: 'KC' },
  ...BOSSES.map(boss => ({ key: boss.key, name: boss.name, unit: 'KC' })),
];
