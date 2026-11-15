// Replay a saved public snapshot offline. Never writes to production.
// node scripts/simulation-health.mjs /tmp/snapshot.json [ticks=96]
import { readFile } from 'node:fs/promises';
import { progressUser } from '../workers/src/simulation.js';
import { advanceTrainingClimate } from '../workers/src/training-dynamics.js';
import { normalizeUser } from '../workers/src/store.js';
import { SKILLS } from '../workers/src/constants.js';
import { levelFromXp, totalXP, totalLevel } from '../workers/src/utils.js';
import { eligibleBosses } from '../workers/src/economy.js';
export function simulateHealth(snapshot, ticks = 96, seed = 12345) {
  const users = snapshot.users.map(u => normalizeUser(structuredClone(u)));
  const generatedAt = snapshot.generatedAt ?? snapshot.exchange?.generatedAt;
  if (!Number.isFinite(generatedAt)) throw new Error("Snapshot requires generatedAt");
  let state = seed;
  const rng = () => ((state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const originalRandom = Math.random;
  const initial = users.map(u => u.totalXP);
  const initialKC = users.map(u => Object.values(u.bosses).reduce((a,b)=>a+b,0));
  const initialClues = users.map(u => u.career.clues?.completed || 0);
  const gains = Object.fromEntries(SKILLS.map(s => [s, 0]));
  let active = 0, stalled = 0, kills = 0, climate;
  const days = [];
  let prior = { xp: 0, kills: 0, active: 0, stalled: 0 };
  try {
    Math.random = rng;
    for (let tick = 0; tick < ticks; tick++) {
      const at = new Date(generatedAt + (tick + 1) * 900000);
      climate = advanceTrainingClimate(climate, at, rng);
      for (const u of users) {
        const before = Object.fromEntries(SKILLS.map(s => [s, u.skills[s].xp]));
        const eligible = new Set(eligibleBosses(u).map(b => b.key));
        const priorBosses = {...u.bosses};
        const kc = Object.values(u.bosses).reduce((a,b) => a+b, 0);
        const xp = u.totalXP;
        progressUser(u, at, { rng, hours: .25, climate });
        if (u.activity !== 'INACTIVE' && u.activity !== 'BANK_STANDING') {
          active++; if (u.totalXP === xp && u.totalXP < 24 * 200000000) stalled++;
        }
        kills += Object.values(u.bosses).reduce((a,b) => a+b, 0) - kc;
        for (const s of SKILLS) gains[s] += u.skills[s].xp - before[s];
        if (u.totalXP !== totalXP(u.skills) || u.totalLevel !== totalLevel(u.skills)
          || Object.values(u.skills).some(s => !Number.isSafeInteger(s.xp) || s.xp < 0 || s.xp > 200000000 || s.level !== levelFromXp(s.xp)))
          throw new Error('Invalid progression totals: '+u.username);
        if (Object.entries(u.bosses).some(([key,n]) => !Number.isSafeInteger(n) || n < priorBosses[key] || (n > priorBosses[key] && !eligible.has(key))))
          throw new Error('Ineligible or invalid boss progress: '+u.username);
        if (!Number.isSafeInteger(u.economy.cash) || u.economy.cash < 0 || Object.values(u.economy.holdings).some(n => !Number.isSafeInteger(n) || n < 0)) throw new Error('Invalid inventory: '+u.username);
      }
      if ((tick + 1) % 96 === 0 || tick === ticks - 1) {
        const xp = Object.values(gains).reduce((a,b)=>a+b,0);
        days.push({ day: days.length + 1, xp: xp - prior.xp, kills: kills - prior.kills,
          restingPlayers: users.filter(u=>u.restDay).length,
          stalledPercent: +(100 * (stalled - prior.stalled) / Math.max(1, active - prior.active)).toFixed(2) });
        prior = { xp, kills, active, stalled };
      }
    }
  } finally { Math.random = originalRandom; }
  const cohorts = Object.fromEntries([...new Set(users.map(u=>u.archetype))].map(archetype=>{
    const group=users.map((u,i)=>({u,i})).filter(({u})=>u.archetype===archetype);
    return [archetype,{players:group.length, meanXP:Math.round(group.reduce((n,{u,i})=>n+u.totalXP-initial[i],0)/group.length),
      meanKC:Math.round(group.reduce((n,{u,i})=>n+Object.values(u.bosses).reduce((a,b)=>a+b,0)-initialKC[i],0)/group.length)}];
  }));
  return { players: users.length, ticks, cohorts, maxedPlayers:users.filter(u=>u.totalLevel===2376).length,
    treasureCaskets:users.reduce((n,u,i)=>n+(u.career.clues?.completed || 0)-initialClues[i],0), active, stalled, stalledPercent: +(100*stalled/Math.max(1,active)).toFixed(2),
    playersGaining: users.filter((u,i) => u.totalXP > initial[i]).length, xp: Object.values(gains).reduce((a,b)=>a+b,0), kills, gains, days };
}
if (process.argv[1]?.endsWith('/simulation-health.mjs')) console.log(JSON.stringify(simulateHealth(JSON.parse(await readFile(process.argv[2], 'utf8')), Number(process.argv[3] || 96)), null, 2));
