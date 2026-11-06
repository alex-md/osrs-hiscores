import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceEconomy, economyFrame, MARKET_MODEL, priceOf } from './market.js';
import { normalizeUser } from './store.js';
import { valueBank, progressSkillingEconomy } from './economy.js';
import { tradeRares } from './rare-trading.js';
import { SKILLS } from './constants.js';
import { xpForLevel } from './utils.js';
import items from '../../frontend/lib/items.js';
const at = Date.parse('2026-11-06T00:00:00Z');
function player(name='Trader',cash=100_000_000,holdings={}) {
  const u=normalizeUser({username:name,archetype:'PVMER',skills:Object.fromEntries(SKILLS.map(s=>[s,{xp:xpForLevel(90)}])),economy:{cash,bankValue:cash,holdings,inventoryVersion:2}});
  valueBank(u);u.career.thrift=.9;return u;
}
test('production lowers resource prices while paid use raises them; old flows are not replayed',()=>{
  const u=player(), before=economyFrame([u]);
  u.economy.holdings[1515]=100000;
  u.economy.flows.created[1515]=100000;
  u.economy.flows.demand={536:100000};
  const next=advanceEconomy(null,before,[u],new Date(at));
  assert.ok(next.prices[1515]<items[1515].price);
  assert.ok(next.prices[536]>items[536].price);
  const later=advanceEconomy(next,economyFrame([u]),[u],new Date(at+900000));
  assert.equal(later.items[1515].produced,0);
  assert.equal(later.items[536].demand,0);
  assert.deepEqual(advanceEconomy(next,before,[u],new Date(at)),next);
});
test('affordable eligible upgrade demand supports rares; supplied outside stock depresses them',()=>{
  const u=player(), frame=economyFrame([u]);
  const scarce=advanceEconomy(null,frame,[u],new Date(at));
  const stocked=advanceEconomy(null,frame,[u],new Date(at),{stock:{4151:1000}});
  assert.ok(scarce.items[4151].upgradeDemand>0);
  assert.ok(scarce.prices[4151]>items[4151].price);
  assert.ok(stocked.prices[4151]<scarce.prices[4151]);
  const poor=player('Poor',0);
  assert.equal(advanceEconomy(null,economyFrame([poor]),[poor],new Date(at)).items[4151].upgradeDemand,0);
});
test('market revaluation preserves cash, items, XP and lifetime income; repeating is idempotent',()=>{
  const u=player('Holder',123,{4151:2,1511:1000}), old=structuredClone(u);
  const market={model:MARKET_MODEL,prices:{4151:items[4151].price*2,1511:20},capturedAt:at};
  valueBank(u,market);
  assert.equal(u.economy.bankValue,123+4*items[4151].price+20000);
  assert.equal(u.economy.cash,old.economy.cash);
  assert.deepEqual(u.economy.holdings,old.economy.holdings);
  assert.deepEqual(u.skills,old.skills);
  assert.equal(u.economy.earned,old.economy.earned);
  assert.equal(u.economy.revaluation-old.economy.revaluation,u.economy.bankValue-old.economy.bankValue);
  const saved=structuredClone(u);valueBank(u,market);assert.deepEqual(u,saved);
});
test('current quotes determine settlement, affordability, tax and bank conservation',()=>{
  const seller=player('Seller',10_000_000,{4151:2}), buyer=player('Buyer');
  const market={model:MARKET_MODEL,prices:{4151:items[4151].price*2},capturedAt:at};
  for(const u of [seller,buyer])valueBank(u,market);
  const before=seller.economy.bankValue+buyer.economy.bankValue;
  const result=tradeRares([seller,buyer],new Date(at),null,{rng:()=>0,market});
  assert.equal(result.summary.playerTrades,1);
  assert.equal(buyer.economy.trades[0].price,market.prices[4151]);
  assert.equal(seller.economy.bankValue+buyer.economy.bankValue,before-result.summary.tax);
  assert.equal(seller.economy.holdings[4151]+buyer.economy.holdings[4151],2);
  const broke=player('NotEnough',3_000_000), finder=player('Finder',0,{4151:2});
  const blocked=tradeRares([finder,broke],new Date(at),null,{rng:()=>0,market});
  assert.equal(blocked.summary.playerTrades,0);
});
test('resource quantities stay physical when quotes change; paid supply costs respond to prices',()=>{
  const low=player(), high=structuredClone(low);
  const market={model:MARKET_MODEL,prices:{536:items[536].price*2,526:items[526].price*2,532:items[532].price*2,6729:items[6729].price*2}};
  progressSkillingEconomy(low,new Date(at),{skill:'prayer',hours:.1,rng:()=>.5});
  progressSkillingEconomy(high,new Date(at),{skill:'prayer',hours:.1,rng:()=>.5,market});
  assert.ok(Math.abs(high.economy.lastSession.spent-2*low.economy.lastSession.spent)<=1);
  assert.ok(high.economy.flows.demand[536]>0);
  const a=player(),b=structuredClone(a);
  progressSkillingEconomy(a,new Date(at),{skill:'fishing',hours:.25,rng:()=>.5});
  progressSkillingEconomy(b,new Date(at),{skill:'fishing',hours:.25,rng:()=>.5,market:{model:MARKET_MODEL,prices:{7944:items[7944].price*4}}});
  assert.equal(a.economy.flows.created[7944],b.economy.flows.created[7944]);
  assert.ok(b.economy.lastSession.earned>a.economy.lastSession.earned);
});
test('long replay bounds prices, histories and cash; tiny prices can move and no-time updates do not move prices',()=>{
  const u=player(), users=[u];let market=null;
  for(let i=0;i<400;i++) {
    const before=economyFrame(users);
    u.economy.flows.demand={39:(u.economy.flows.demand?.[39] || 0)+1000000};
    u.economy.flows.created[1515]=(u.economy.flows.created[1515] || 0)+1000000;
    u.economy.holdings[1515]=(u.economy.holdings[1515] || 0)+1000000;
    const next=advanceEconomy(market,before,users,new Date(at+i*900000));
    for(const [id,row] of Object.entries(next.items)) {
      assert.ok(row.price>=1&&row.price<=items[id].price*8);
      assert.ok(row.history.length<=97);
      if(market) assert.ok(Math.abs(Math.log(row.fairValue/market.items[id].fairValue))<=.020000001);
    }
    market=next;
  }
  assert.ok(market.prices[39]>items[39].price);
  const afterGap=advanceEconomy(market,economyFrame(users),users,new Date(at+500*900000));
  assert.equal(afterGap.items[39].history.length,1);
  const still=advanceEconomy(market,economyFrame(users),users,new Date(at+401*900000),{hours:0});
  assert.deepEqual(still.prices,market.prices);
  assert.equal(priceOf({model:MARKET_MODEL,prices:{39:NaN}},39),items[39].price);
  assert.ok(advanceEconomy(null,economyFrame([]),[],new Date(at)).openingCash===null);
});


test('an economy initialized before arrivals anchors stock and inflation to its first population',()=>{
  const empty=advanceEconomy(null,economyFrame([]),[],new Date(at));
  const u=player('First',1_000_000,{1511:10000});
  const next=advanceEconomy(empty,economyFrame([u]),[u],new Date(at+900000));
  assert.equal(next.inflation,1);
  assert.equal(next.items[1511].openingHeld,10000);
  assert.equal(next.prices[1511],items[1511].price);
});
