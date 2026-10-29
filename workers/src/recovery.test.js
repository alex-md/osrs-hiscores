import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUser } from './store.js';
import { SKILLS } from './constants.js';
import { xpForLevel } from './utils.js';
import { progressBossing, progressSkillingEconomy, valueBank } from './economy.js';
import { progressUser } from './simulation.js';
import { simulateHealth } from '../../scripts/simulation-health.mjs';
const at = new Date('2026-10-29T00:00:00Z');
function player(name, cash=1000000, holdings={}, level=80) {
  const u=normalizeUser({username:name,archetype:'PVMER',activity:'FOCUSED',skills:Object.fromEntries(SKILLS.map(s=>[s,{xp:xpForLevel(level)}])),economy:{cash,holdings,bankValue:cash,inventoryVersion:2}});
  valueBank(u);return u;
}
test('boss sessions complete without cash, supplies or an equipment purchase',()=>{
  const u=player('Empty',0);u.career.favoriteBoss='scurrius';
  const result=progressBossing(u,at,{hours:.25,scale:18,rng:()=>.01});
  assert.ok(result.active);assert.ok(u.economy.lastSession.kills>0);
  assert.ok(result.trainingHours>=0&&result.trainingHours<=.25);
  assert.ok(u.economy.cash>=0);
  assert.equal(u.economy.needs,undefined);
  assert.equal(u.economy.restock,undefined);
});
test('persisted buyable-skill goals earn calibrated XP with an empty bank',t=>{
  t.mock.method(Math,'random',()=>.999);
  const u=player('Broke',0,{},1);
  u.trainingState={aptitude:1,fatigue:0,momentum:1,remaining:8,phase:'steady',phaseRemaining:3,focusSkill:'construction',targetXP:100000};
  u.achievements={legacy:123};u.progress={recovery:{planId:'saved'}};
  const before=u.totalXP;
  progressUser(u,at,{rng:()=>.5});
  assert.ok(u.totalXP>before);
  assert.equal(u.progress.lastSession.trainingSkill,'construction');
  assert.ok(u.skills.construction.xp>0);
  assert.equal(u.achievements.legacy,123);
  assert.deepEqual(u.progress.recovery,{planId:'saved'});
  assert.equal(u.economy.cash,0);
});
test('archived prices, input requests and balances cannot change training XP',t=>{
  t.mock.method(Math,'random',()=>.999);
  const poor=player('Matched',0,{},1),rich=structuredClone(poor);
  rich.economy.cash=10000000;rich.economy.bankValue=10000000;
  rich.economy.needs={960:100000};rich.economy.inputReserve={960:100000};
  progressUser(poor,at,{rng:()=>.5});
  progressUser(rich,at,{rng:()=>.5,market:{prices:{960:99999999},status:'simulated'}});
  assert.deepEqual(poor.skills,rich.skills);
  assert.deepEqual(poor.progress,rich.progress);
});
test('fixed valuation preserves owned integer items and ignores old exchange quotes',()=>{
  const u=player('Fixed',123,{20997:1,1511:1000});
  const before=structuredClone(u.economy);
  valueBank(u,{prices:{20997:1,1511:99999999}});
  assert.deepEqual(u.economy,before);
  progressSkillingEconomy(u,at,{skill:'construction',hours:.1,rng:()=>.5});
  assert.ok(u.economy.cash>=0);
  assert.ok(Object.values(u.economy.holdings).every(n=>Number.isSafeInteger(n)&&n>=0));
  assert.equal(u.economy.bankValue-before.bankValue,u.economy.lastSession.net);
});
test('a supply-starved mixed population progresses across three days without trading',()=>{
  const users=Array.from({length:48},(_,i)=>{
    const u=player('Replay'+i,i%3===0?0:1000000,{},i%2?80:40);
    u.archetype=['PVMER','SKILLER','CASUAL','HARDCORE'][i%4];return u;
  });
  const result=simulateHealth({users,generatedAt:+at},288);
  assert.equal(result.playersGaining,users.length);
  assert.ok(result.stalledPercent<5,JSON.stringify(result));
  assert.ok(result.kills>100);
  for(const [skill,gain] of Object.entries(result.gains))assert.ok(gain>0,skill);
  console.log(JSON.stringify({xp:result.xp,kills:result.kills,stalledPercent:result.stalledPercent,days:result.days}));
});
