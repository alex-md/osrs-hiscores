import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUser } from './store.js';
import { SKILLS } from './constants.js';
import { xpForLevel } from './utils.js';
import { progressBossing, progressSkillingEconomy, valueBank, selectMethod, restockPrice } from './economy.js';
import { clearExchange } from './exchange.js';
import { progressUser } from './simulation.js';
import { simulateHealth } from '../../scripts/simulation-health.mjs';
import { METHODS } from '../data/methods.js';
const at = new Date('2026-10-29T00:00:00Z');
function player(name, cash=1000000, holdings={}, level=80) {
  const u=normalizeUser({username:name,archetype:'PVMER',activity:'FOCUSED',skills:Object.fromEntries(SKILLS.map(s=>[s,{xp:xpForLevel(level)}])),economy:{cash,holdings,bankValue:cash,inventoryVersion:2}});
  valueBank(u);return u;
}
test('cash-funded restocking unblocks PvM without equipment endowments or GE fills',()=>{
  const u=player('Restock');u.career.favoriteBoss='scurrius';
  const before=u.economy.cash, bank=u.economy.bankValue;
  const result=progressBossing(u,at,{hours:.25,scale:18,rng:()=>.01});
  assert.ok(result.active);assert.ok(u.economy.lastSession.kills>0);
  assert.ok(u.economy.restock.spent>0);assert.ok(u.economy.cash<before);
  assert.equal(u.economy.bankValue-bank,u.economy.lastSession.net);
  assert.equal(u.economy.flows.coinSinks,before-u.economy.cash);
  assert.equal(u.economy.flows.consumed[2434],u.economy.lastSession.kills);
  assert.equal(u.economy.flows.created[2434],u.economy.restock.items[2434]);
  assert.ok(result.trainingHours>=0&&result.trainingHours<=.25);
  assert.equal(clearExchange([u],at).fills,0);
});
test('restocking buys complete recipe bundles within cash and records exact sources/sinks',()=>{
  const u=player('Builder',100000,{},1), cash=u.economy.cash;
  const bank=u.economy.bankValue;
  const work=progressSkillingEconomy(u,at,{skill:'construction',hours:.25});
  assert.ok(work.actions>0);assert.equal(work.xp,work.actions*29);
  assert.equal(u.economy.cash,cash-u.economy.restock.spent);
  assert.equal(u.economy.spent,u.economy.flows.coinSinks);
  assert.equal(u.economy.bankValue-bank,u.economy.lastSession.net);
  assert.equal(u.economy.flows.created[960],u.economy.flows.consumed[960]);
  assert.ok(u.economy.restock.spent<=cash*.25);
  assert.ok(restockPrice({prices:{960:1}},960)>1);
});
test('renewable surplus can fund training while rare equipment remains owned',()=>{
  const u=player('Liquid',0,{1511:10000,20997:1},1);
  const bank=u.economy.bankValue;
  const result=progressSkillingEconomy(u,at,{skill:'construction',hours:.1});
  assert.ok(result.actions>0);assert.ok(u.economy.liquidation.received>0);
  assert.equal(u.economy.holdings[20997],1);
  assert.equal(u.economy.flows.coinFaucets,u.economy.liquidation.received);
  assert.equal(u.economy.bankValue-bank,u.economy.lastSession.net);
  assert.equal(clearExchange([u],at).fills,0);
});
test('method choice uses owned inputs and affordable cash rather than unrelated portfolio value',()=>{
  const u=player('Owned',0,{1511:200,20997:1},70);
  assert.equal(selectMethod(u,'firemaking').inputs[1511],1);
  const before=u.economy.holdings[1511];
  const work=progressSkillingEconomy(u,at,{skill:'firemaking',hours:.1});
  assert.ok(work.actions>0);assert.equal(u.economy.holdings[1511],before-work.actions);
});
test('a blocked persisted goal yields to funded work without deleting the account history',t=>{
  t.mock.method(Math,'random',()=>.999);
  const u=player('Broke',0,{},1);
  u.trainingState={aptitude:1,fatigue:0,momentum:1,remaining:8,phase:'steady',phaseRemaining:3,focusSkill:'construction',targetXP:100000};
  u.achievements={legacy:123};
  const before=u.totalXP;
  progressUser(u,at,{rng:()=>.5});
  assert.ok(u.totalXP>before);assert.ok(u.economy.cash>0);
  assert.equal(u.progress.lastSession.trainingSkill,'thieving');
  assert.equal(u.trainingState.remaining,0);
  assert.equal(u.achievements.legacy,123);
});
test('GE allocates scarce cash across a requested bundle and reserves both boss and training inputs',()=>{
  const buyer=player('Buyer',100000),seller=player('Seller',0,{385:1000,2434:1000});
  buyer.economy.inputReserve={385:100,2434:50};
  const ex=clearExchange([buyer,seller],at);
  assert.ok(buyer.economy.holdings[385]>0);assert.ok(buyer.economy.holdings[2434]>0);
  assert.ok(buyer.economy.cash>=0);assert.ok(ex.fills>=2);
  const u=player('Both');u.career.favoriteBoss='scurrius';
  progressBossing(u,at,{hours:.25,rng:()=>.01});
  const reserve=u.economy.inputReserve[2434];
  progressSkillingEconomy(u,at,{skill:'herblore',hours:.05});
  assert.ok(u.economy.inputReserve[2434]>=reserve);
});
test('an initially supply-starved mixed population recovers across several days',()=>{
  const users=Array.from({length:48},(_,i)=>{
    const u=player('Replay'+i,i%3===0?0:1000000,{},i%2?80:40);
    u.archetype=['PVMER','SKILLER','CASUAL','HARDCORE'][i%4];return u;
  });
  const result=simulateHealth({users,exchange:{generatedAt:+at,items:[]}},288);
  assert.equal(result.playersGaining,users.length);
  assert.ok(result.stalledPercent<5,JSON.stringify(result));
  assert.ok(result.kills>100);
  assert.ok(result.fills>0);
  for(const [skill,gain] of Object.entries(result.gains))assert.ok(gain>0,skill);
});

test('the supply-service price floor blocks coin-profit loops through alchemy',()=>{
  const lowMarket={prices:Object.fromEntries(METHODS.flatMap(m=>Object.keys(m.inputs)).map(id=>[id,1]))};
  for(const m of METHODS.filter(m=>m.coins>0&&Object.keys(m.inputs).length)) {
    const cost=Object.entries(m.inputs).reduce((sum,[id,n])=>sum+n*restockPrice(lowMarket,id),0);
    assert.ok(cost>m.coins,m.name);
  }
});
test('partially supplied boss trips leave their unused time available for training',()=>{
  const poor=player('Partial',60000),stocked=player('Partial',60000,{385:10000,2434:10000});
  poor.career.favoriteBoss=stocked.career.favoriteBoss='scurrius';
  const partial=progressBossing(poor,at,{hours:1,scale:18,rng:()=>.01});
  const full=progressBossing(stocked,at,{hours:1,scale:18,rng:()=>.01});
  assert.ok(partial.active&&full.active);
  assert.ok(poor.economy.lastSession.kills<stocked.economy.lastSession.kills);
  assert.ok(partial.trainingHours>full.trainingHours);
  assert.ok(partial.trainingHours+poor.economy.lastSession.hours<=1);
});
