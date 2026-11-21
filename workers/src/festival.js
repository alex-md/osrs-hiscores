import { SKILLS } from './constants.js';
import { BOSSES } from '../../frontend/lib/activities.js';

const WEEK = 7 * 86400000;
const EPOCH = Date.UTC(2026, 0, 5); // Monday, UTC.
const rotatingSkills = SKILLS.filter(s => s !== 'hitpoints');
export function festivalWeek(now) {
  const index = Math.floor((Number(now) - EPOCH) / WEEK);
  const start = EPOCH + index * WEEK;
  return { id: String(start), start, end: start + WEEK,
    skill: rotatingSkills[((index % rotatingSkills.length) + rotatingSkills.length) % rotatingSkills.length], bonus: 1.15 };
}
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
export function recordFestival(user, date, { gainedXP = 0, skillXP = 0, kills = 0, discoveries = 0 } = {}) {
  const week = festivalWeek(+date);
  if (user.festival?.id !== week.id) user.festival = { id: week.id, observedAt: +date,
    newcomer: user.createdAt >= week.start - 14 * 86400000 && user.createdAt <= +date,
    xp: 0, skill: 0, bosses: 0, discoveries: 0 };
  for (const [key, value] of Object.entries({ xp: gainedXP, skill: skillXP, bosses: kills, discoveries }))
    user.festival[key] += Math.max(0, Math.floor(value));
}
const tracks = ['xp', 'skill', 'bosses', 'discoveries'];
export function buildFestival(users, previous, now) {
  const week = festivalWeek(now);
  const archive = [...(previous?.archive || [])];
  if (previous && previous.id !== week.id && !archive.some(row => row.id === previous.id)) {
    // Archive exactly what was last observed, never extrapolate a missed ending.
    const closed = { id: previous.id, start: previous.start, end: previous.end, skill: previous.skill,
      observedAt: previous.capturedAt, divisions: previous.divisions };
    archive.unshift(closed);
    for (const division of Object.values(previous.divisions || {})) for (const track of tracks) {
      const leaders = division[track]?.leaders || [];
      for (const leader of leaders.slice(0,1)) {
        const user = users.find(u => u.username === leader.username);
        if (user) {
          user.festivalHonours ||= {};
          user.festivalHonours[`${previous.id}:${division === previous.divisions.newcomers ? 'newcomers' : 'open'}:${track}`] = previous.end;
          // Bound profile storage while retaining the lifetime win count.
          user.festivalWins = (user.festivalWins || 0) + 1;
          const entries = Object.entries(user.festivalHonours).slice(-24);
          user.festivalHonours = Object.fromEntries(entries);
        }
      }
    }
  }
  const divisions = {};
  for (const name of ['open', 'newcomers']) {
    const eligible = users.filter(u => u.festival?.id === week.id && (name === 'open' || u.festival.newcomer));
    divisions[name] = Object.fromEntries(tracks.map(key => {
      const ranked = eligible.filter(u => u.festival[key] > 0).sort((a,b) => b.festival[key] - a.festival[key] || a.username.localeCompare(b.username));
      return [key, { participants: ranked.length, total: ranked.reduce((n,u) => n + u.festival[key],0),
        leaders: ranked.slice(0,8).map(u => ({ username: u.username, score: u.festival[key] })) }];
    }));
  }
  return { ...week, capturedAt: now, divisions, archive: archive.slice(0,8),
    observedFrom: previous?.id === week.id ? previous.observedFrom : Math.min(now, ...users.filter(u => u.festival?.id === week.id).map(u => u.festival.observedAt)) };
}
