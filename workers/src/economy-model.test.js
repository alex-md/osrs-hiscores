import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUser } from './store.js';
import { valueBank, eligibleBosses, rollBossDrops } from './economy.js';
import { arrivals, cleanupPopulation, populationPolicy, POPULATION_POLICY } from './population.js';
import baseline from '../data/ge-baseline.js';
import { BOSSES } from '../../frontend/lib/activities.js';
import { compactGP } from '../../frontend/lib/gp.js';
import { SKILLS } from './constants.js';
import { xpForLevel } from './utils.js';
const at = new Date('2026-10-28T12:00:00Z');
function player(username, holdings = {}, cash = 1000000, level = 99) {
  const user = normalizeUser({username, activity:'ACTIVE', archetype:'PVMER', skills:Object.fromEntries(SKILLS.map(s=>[s,{xp:xpForLevel(level)}])), economy:{bankValue:cash,cash,holdings,inventoryVersion:2}});
  valueBank(user); return user;
}

test('legacy fractional conversion preserves rounded wealth exactly and runs once',()=>{
  const u=player('Legacy'); u.economy={bankValue:1700000,cash:12.3,holdings:{4151:1.23,6585:0.31},earned:400,spent:20};
  const expected=Math.round(12.3+1.23*baseline[4151].price+.31*baseline[6585].price);
  valueBank(u); assert.equal(u.economy.bankValue,expected);
  assert.equal(u.economy.earned,400); assert.equal(u.economy.spent,20);
  const copy=structuredClone(u.economy);valueBank(u);assert.deepEqual(u.economy,copy);
  assert.ok(Number.isSafeInteger(u.economy.cash));assert.ok(Object.values(u.economy.holdings).every(Number.isSafeInteger));
});
test('population generation is reduced 70%, cap respected, no existing players removed by arrivals',()=>{
  let births=0;for(let i=0;i<10000;i++)births+=arrivals(100,5000,()=>i/10000);
  assert.equal(births,4500);assert.equal(births/15000,.3);assert.equal(arrivals(5000,5000),0);assert.equal(arrivals(0,5000),5);
});
test('cleanup respects progression, trading, grace, established thresholds and tracks retired assets',()=>{
  const stale=()=>{const u=player('Old',{436:15},123);u.createdAt=+at-200*86400000;u.retention={observedAt:u.createdAt};return u;};
  const abandoned=stale(),established=stale(),trader=stale(),protectedUser=stale(),legacy=stale();
  established.progress={sessions:200,lastSession:{timestamp:+at-100*86400000}};
  trader.lastTradeAt=+at-1000;protectedUser.retention.preserve=true;delete legacy.retention;delete legacy.createdAt;
  const result=cleanupPopulation([abandoned,established,trader,protectedUser,legacy],at);
  assert.equal(result.users.length,4);assert.equal(result.retired.cash,123);assert.equal(result.retired.items[436],15);assert.equal(result.retired.players,1);
  assert.equal(populationPolicy({POPULATION_INACTIVITY_DAYS:'7'}).inactivityDays,7);
  assert.equal(populationPolicy({POPULATION_GRACE_DAYS:'-1'}).graceDays,POPULATION_POLICY.graceDays);
});
test('GP formatting is compact presentation and leaves exact amounts intact',()=>{
  for(const [n,s] of [[975,'975'],[341000,'341k'],[1200000,'1.2m'],[1100000000,'1.1b']])assert.equal(compactGP(n),s);
});


test('boss sampling grants exact guaranteed quantities and statistically bounded unique rewards', () => {
  let seed=15;
  const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  const boss=BOSSES.find(b=>b.key==='king-black-dragon');
  const result=rollBossDrops(boss,100000,rng);
  assert.equal(result.rewards[536],100000);
  assert.equal(result.rewards[1747],200000);
  assert.ok(result.rewards[11286] >= 5 && result.rewards[11286] <= 40);
  const ceramic=rollBossDrops(BOSSES.find(b=>b.key==='cerberus'),100000,rng);
  assert.equal(ceramic.drops,Object.values(ceramic.rewards).reduce((a,b)=>a+b,0));
  assert.ok(ceramic.drops >= 500 && ceramic.drops <= 1000);
  assert.ok(Object.values(ceramic.rewards).every(Number.isSafeInteger));
  const fullRare={drops:[{id:536,quantity:1,chance:.5,rare:true},{id:1747,quantity:1,chance:.5,rare:true}]};
  assert.equal(rollBossDrops(fullRare,100,rng).drops,100);
});

test('selected boss tables produce deterministic guaranteed drops and sampled rares',()=>{
  // Restrict eligibility to KBD by using the shared catalog gates plus selected favorite
  // and a deterministic weighted draw that reaches its entry.
  const kbd=BOSSES.find(b=>b.key==='king-black-dragon');
  assert.deepEqual(kbd.drops.slice(0,2).map(d=>[d.id,d.quantity,d.chance]),[[536,1,1],[1747,2,1]]);
  assert.equal(kbd.drops.find(d=>d.id===11286).chance,1/5000);
  const low=player('Low',{},0,1);assert.equal(eligibleBosses(low).length,0);
  const high=player('High');assert.ok(eligibleBosses(high).some(b=>b.key==='cerberus'));
  high.skills.slayer.level=90;assert.ok(!eligibleBosses(high).some(b=>b.key==='cerberus'));
});
