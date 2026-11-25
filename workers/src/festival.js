import { BOSSES } from '../../frontend/lib/activities.js';

export const discoveryCount = user => Object.values(user.economy?.rareFinds || {}).filter(row => row.quantity > 0).length + Object.keys(user.expedition?.relics || {}).length;
export const bossCount = user => BOSSES.reduce((n, boss) => n + (user.bosses?.[boss.key] || 0), 0);

// Only newly completed encounters can produce these simulation-only keepsakes.
// Equal expected ordinary encounter time; no bank value, trade or combat power.
export function rollRelic(user, bossKey, kills, date, rng = Math.random) {
  const boss = BOSSES.find(row => row.key === bossKey);
  if (!boss || !(kills > 0) || user.expedition?.relics?.[bossKey]) return false;
  if (rng() >= -Math.expm1(-kills / (boss.killsPerHour * 40))) return false;
  user.expedition ||= { relics: {} };
  user.expedition.relics ||= {};
  user.expedition.relics[bossKey] = +date;
  return true;
}
