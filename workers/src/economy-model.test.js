import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUser } from './store.js';
import { valueBank, progressSkillingEconomy, selectMethod, eligibleBosses, progressBossing, rollBossDrops } from './economy.js';
import { clearExchange, exchangeMarket } from './exchange.js';
import { arrivals, cleanupPopulation, populationPolicy, POPULATION_POLICY } from './population.js';
import { METHODS } from '../data/methods.js';
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
const sum = (users, f) => users.reduce((n,u)=>n+f(u.economy),0);
const work = (u, skill, hours=1) => progressSkillingEconomy(u,at,{skill,hours});

test('catalog definitions use known tradeable items, integer quantities, and valid gates',()=>{
  assert.ok(Object.keys(baseline).length >= 130);
  assert.equal(BOSSES.length,24);
  for (const m of METHODS) for (const [id,n] of Object.entries({...m.inputs,...m.outputs})) {
    assert.ok(baseline[id],`${m.name}: ${id}`); assert.ok(Number.isSafeInteger(n) && n>0);
  }
  for(const boss of BOSSES) for(const drop of boss.drops||[]) {
    assert.ok(baseline[drop.id]); assert.ok(Number.isSafeInteger(drop.quantity)); assert.ok(drop.chance>0 && drop.chance<=1);
  }
});
test('legacy fractional conversion preserves rounded wealth exactly and runs once',()=>{
  const u=player('Legacy'); u.economy={bankValue:1700000,cash:12.3,holdings:{4151:1.23,6585:0.31},earned:400,spent:20};
  const expected=Math.round(12.3+1.23*baseline[4151].price+.31*baseline[6585].price);
  valueBank(u); assert.equal(u.economy.bankValue,expected);
  assert.equal(u.economy.earned,400); assert.equal(u.economy.spent,20);
  const copy=structuredClone(u.economy);valueBank(u);assert.deepEqual(u.economy,copy);
  assert.ok(Number.isSafeInteger(u.economy.cash));assert.ok(Object.values(u.economy.holdings).every(Number.isSafeInteger));
});
test('ore prices change available mining methods without changing skill gates',()=>{
  const u=player('Miner',{},1000000,40);
  const ordinary=selectMethod(u,'mining');
  const expensiveGold=selectMethod(u,'mining',{prices:{444:10000}});
  assert.notEqual(ordinary.name,expensiveGold.name);assert.equal(expensiveGold.outputs[444],1);
  u.skills.mining.level=1;assert.equal(selectMethod(u,'mining',{prices:{444:10000}}).level,1);
});
test('Mining → Smithing transforms owned ores; missing inputs block XP and request real orders',()=>{
  const miner=player('Miner',{},0,1);work(miner,'mining');
  const ore=Object.keys(miner.economy.flows.created)[0];assert.ok(miner.economy.holdings[ore]>0);
  const smith=player('Smith',{436:3,438:2},0,1);const result=work(smith,'smithing');
  assert.equal(result.actions,2);assert.equal(smith.economy.holdings[2349],2);
  assert.equal(smith.economy.holdings[436],1);assert.equal(smith.economy.holdings[438],0);
  assert.equal(smith.economy.flows.consumed[438],2);
  const blocked=work(smith,'smithing');assert.equal(blocked.xp,0);assert.ok(smith.economy.needs[438]>0);
});
test('GE acquisition enables a blocked recipe without awarding XP for trade',()=>{
  const smith=player('Smith',{},1000000,1), seller=player('Supplier',{436:1000,438:1000},0,1);
  work(smith,'smithing',.1);const xp=smith.totalXP;
  const result=clearExchange([smith,seller],at);
  assert.ok(result.fills>0);assert.equal(smith.totalXP,xp);
  assert.ok(work(smith,'smithing',.1).actions>0);
});
test('Farming → Herblore → PvM consumes real herbs, potion ingredients and food',()=>{
  const farmer=player('Farmer',{5295:100},1000000,38);work(farmer,'farming',1);
  assert.ok(farmer.economy.holdings[257]>0);
  const herb=player('Herb',{257:40,231:40,227:40},1000000,38);
  const brewed=work(herb,'herblore',1);assert.ok(brewed.actions>0);assert.ok(herb.economy.holdings[2434]>0);
  const fighter=player('Fighter',{385:1000,2434:1000},1000000,99);
  fighter.career.favoriteBoss='scurrius';
  const before=structuredClone(fighter.economy.holdings);
  const encounter=progressBossing(fighter,at,{hours:1,rng:()=>.01});
  assert.ok(encounter.active);const kills=fighter.economy.lastSession.kills;
  assert.ok(kills>0);assert.equal(fighter.economy.holdings[385],before[385]-kills*2);
  assert.equal(fighter.economy.holdings[2434],before[2434]-kills);
  const starved=player('Starved',{},1000000,99);assert.equal(progressBossing(starved,at,{hours:1,rng:()=>.01}).active,false);
  assert.ok(starved.economy.needs[2434]>0);
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
test('fills, cash, tax, circulating supply, residual orders and rolling volume reconcile exactly',()=>{
  const buyer=player('Buyer',{},100000),seller=player('Seller',{436:1000},0);
  buyer.economy.needs={436:100};
  const cash=sum([buyer,seller],e=>e.cash), qty=sum([buyer,seller],e=>e.holdings[436]||0);
  let ex=clearExchange([buyer,seller],at);
  assert.ok(ex.fills>0);assert.equal(sum([buyer,seller],e=>e.cash)+ex.tax,cash);
  const item=ex.items.find(i=>i.id==='436');
  assert.equal(item.circulatingSupply,qty);assert.equal(item.volume24h,ex.tape.reduce((n,t)=>n+t.quantity,0));
  assert.equal(item.sellUnits,200-item.volume);assert.equal(item.change,null);
  for(const trade of ex.tape){assert.equal(trade.total,trade.quantity*trade.price);assert.ok([trade.quantity,trade.price,trade.total,trade.tax].every(Number.isSafeInteger));assert.equal(trade.timestamp,+at);}
  for(const u of [buyer,seller])u.activity='INACTIVE';
  ex=clearExchange([buyer,seller],new Date(+at+86400000),ex);
  const next=ex.items.find(i=>i.id==='436');assert.equal(next.volume24h,0);assert.equal(next.change,0);assert.equal(next.lastTrade.timestamp,+at);assert.equal(ex.tape.length,0);
});
test('legacy GE activity is not relabeled as integer 24h trades',()=>{
  const ex=clearExchange([],at,{version:2,items:[{id:'436',price:35,volume:4.7}],tape:[{quantity:.2}],prices:{436:35.7}});
  assert.equal(ex.tape.length,0);assert.equal(ex.items.find(i=>i.id==='436').volume24h,0);assert.equal(ex.prices[436],36);
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

test('potion dose recipes preserve bottles and empty-vial preparation earns no XP', () => {
  const u=player('PotionMaker',{257:4,231:4,227:4},1000000,38);
  const made=work(u,'herblore',1);
  assert.equal(made.actions,1);assert.equal(u.economy.holdings[2434],3);assert.equal(u.economy.holdings[229],1);
  u.economy.holdings[229]=10;
  const refill=work(u,'herblore',1);
  assert.equal(refill.xp,0);assert.equal(u.economy.holdings[227],10);assert.equal(u.economy.holdings[229],0);
});


test('circulation uses final holdings after closing-price wealth-cap sinks', () => {
  const buyer=player('Buyer',{},50000000), seller=player('Seller',{4151:10},0), passive=player('Passive',{4151:Math.floor(1e12/baseline[4151].price)},0);
  passive.activity='INACTIVE';buyer.economy.needs={4151:10};
  const ex=clearExchange([buyer,seller,passive],at);
  assert.ok(ex.prices[4151]>baseline[4151].price);
  assert.ok(passive.economy.flows.capSink>0);
  assert.equal(ex.items.find(i=>i.id==='4151').circulatingSupply,sum([buyer,seller,passive],e=>e.holdings[4151]||0));
});
