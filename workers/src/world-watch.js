import { BOSSES } from '../../frontend/lib/activities.js';
import { SKILLS } from './constants.js';
import { xpForLevel } from './utils.js';

// Read-only, bounded summaries from the same generation as the ladders.
export function buildWorldWatch(users, now) {
  const windowStart = now - 15 * 60 * 1000;
  const encounters = BOSSES.map(boss => ({ key: boss.key, participants: 0, totalKC: 0, hunters: 0, recentKC: 0 }));
  const byBoss = Object.fromEntries(encounters.map(row => [row.key, row]));
  const activities = new Map(), nearMastery = [];
  let activePlayers = 0, bossingPlayers = 0, recentXP = 0;
  const fresh = timestamp => Number.isFinite(timestamp) && timestamp > windowStart && timestamp <= now;
  for (const user of users) {
    for (const row of encounters) {
      const kc = user.bosses?.[row.key] || 0;
      row.totalKC += kc;
      if (kc > 0) row.participants++;
    }
    const session = user.economy?.lastSession;
    const training = user.progress?.lastSession;
    if (fresh(session?.timestamp) || fresh(training?.timestamp)) {
      activePlayers++;
      // Economy sessions preserve the primary activity even after leftover skilling.
      const boss = fresh(session?.timestamp) && byBoss[session.boss];
      const key = boss ? session.boss : fresh(session?.timestamp) && session.activity === 'clues'
        ? 'treasure-trails' : fresh(training?.timestamp) ? training.skill : session.skill;
      activities.set(key || 'training', (activities.get(key || 'training') || 0) + 1);
      if (boss) {
        bossingPlayers++;
        boss.hunters++;
        boss.recentKC += session.kills || 0;
      }
      if (fresh(training?.timestamp)) recentXP += training.gainedXP || 0;
    }
    const closest = SKILLS.filter(skill => user.skills[skill]?.level < 99)
      .map(skill => ({ username:user.username, skill, level:user.skills[skill].level, remainingXP:xpForLevel(99)-user.skills[skill].xp }))
      .filter(row => row.remainingXP > 0 && row.remainingXP <= 1_000_000)
      .sort((a,b) => a.remainingXP-b.remainingXP || a.skill.localeCompare(b.skill))[0];
    if (closest) nearMastery.push(closest);
  }
  nearMastery.sort((a,b) => a.remainingXP-b.remainingXP || a.username.localeCompare(b.username));
  const newcomers = users.filter(user => Number.isFinite(user.createdAt) && user.createdAt > now-7*86400000 && user.createdAt <= now)
    .sort((a,b) => b.createdAt-a.createdAt || a.username.localeCompare(b.username)).slice(0,8)
    .map(({username,createdAt,totalLevel}) => ({username,createdAt,totalLevel}));
  return { windowStart, activePlayers, bossingPlayers, recentXP, encounters,
    activities:[...activities].map(([key,players])=>({key,players})).sort((a,b)=>b.players-a.players || a.key.localeCompare(b.key)).slice(0,8),
    nearMastery:nearMastery.slice(0,8), newcomers };
}
