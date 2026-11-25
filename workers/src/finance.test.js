import test from 'node:test';
import assert from 'node:assert/strict';
import { financeDays } from '../../frontend/lib/finance-data.js';
import { financeFrame,recordFinance,buildFinance,unusualDay } from './finance.js';
import { buildDiscoveries } from './discoveries.js';
import { bossProfitWeight } from './economy.js';
import { advanceEconomy,economyFrame,MARKET_MODEL } from './market.js';
const DAY=86400000, now=Date.parse('2026-11-24T12:00:00Z');
const user=()=>({username:'Ada',archetype:'PVMER',career:{thrift:.9},economy:{bankValue:200,cash:100,holdings:{1511:2},earned:0,spent:0,pricing:{prices:{1511:50}}}});
const market=price=>({model:MARKET_MODEL,prices:{1511:price}});
test('finance starts at zero and exactly bridges price movements and new assets, once per timestamp',()=>{
  const u=user(); recordFinance(u,financeFrame(u),market(50),market(50),now);
  assert.equal(financeDays(u.finance)[0].change,0);
  const before=financeFrame(u);u.economy.cash+=20;u.economy.holdings[1511]++;u.economy.bankValue=300;
  recordFinance(u,before,market(50),market(60),now+900000);
  const row=financeDays(u.finance)[0];assert.equal(row.market,20);assert.equal(row.change,100);assert.equal(row.flows,80);
  assert.equal(row.change,row.market+row.flows);
  const saved=structuredClone(u.finance);recordFinance(u,before,market(50),market(60),now+900000);assert.deepEqual(u.finance,saved);
  assert.equal(buildFinance([u],now).exposures[1511].players[0].quantity,3);
});
test('financial history crosses days with no fabricated gaps, stays bounded, and preserves signed losses',()=>{
  const u=user(); recordFinance(u,financeFrame(u),null,null,now);
  for(let i=1;i<=45;i++) {const before=financeFrame(u);u.economy.cash--;u.economy.bankValue--;recordFinance(u,before,null,null,now+i*DAY);}
  assert.equal(u.finance.days.length,35);assert.equal(financeDays(u.finance).at(-1).change,-1);
  assert.equal(financeDays(u.finance).at(-1).market,0);assert.equal(financeDays(u.finance).at(-1).flows,-1);
});
test('outliers require seven complete personal days and a material deviation, not large absolute banks',()=>{
  const u=user();u.finance={days:Array.from({length:8},(_,i)=>({day:`day${i}`,at:now+i*DAY,from:now+(i-1)*DAY,observedMs:DAY,flows:i===7?4_000_000:100000}))};
  assert.equal(unusualDay(u).baseline,100000);
  u.finance.days[7].flows=200000;assert.equal(unusualDay(u),null);
  u.finance.days[7].flows=4_000_000;u.finance.days[0].observedMs=0;assert.equal(unusualDay(u),null);
});
test('market discoveries require full observed windows, update without duplication and expire',()=>{
  const row={price:60,dayChangePct:-12,driver:'Supply / surplus',history:[[now-DAY,70],[now,60]]};
  const m={capturedAt:now,items:{1511:row}};
  const result=buildDiscoveries([],m,null,now);assert.equal(result.length,1);
  assert.equal(buildDiscoveries([],m,{discoveries:result},now).length,1);
  assert.equal(buildDiscoveries([],null,{discoveries:result},now+8*DAY).length,0);
  row.history[0][0]=now-1000;assert.equal(buildDiscoveries([],m,null,now).length,0);
});
test('profit response changes with actual prices and keeps collection motives intact',()=>{
  const u=user(), boss={cost:10,commonLoot:0,drops:[{id:1511,chance:1,quantity:1}]};
  assert.ok(bossProfitWeight(u,boss,market(100))>bossProfitWeight(u,boss,market(20)));
  assert.ok(bossProfitWeight(u,boss,market(10000))<=2.5);
  u.archetype='COLLECTION_HUNTER';assert.equal(bossProfitWeight(u,boss,market(100)),1);
});
test('purchase follow-through requires a real earlier purchase, retained item and subsequent completed encounter',()=>{
  const u=user();u.economy.trades=[{side:'buy',itemId:1511,price:50,counterparty:'Bea',timestamp:now-900000}];
  u.economy.lastSession={boss:'scurrius',kills:2,timestamp:now};
  const previous={generatedAt:now-1};
  assert.equal(buildDiscoveries([u],null,previous,now)[0].kind,'after-purchase');
  u.economy.holdings[1511]=0;assert.equal(buildDiscoveries([u],null,previous,now).length,0);
});

test('matched training choices shift toward a repriced resource while collectors retain their preferences',async()=>{
  const {chooseTrainingSkill}=await import('./training.js');
  const {skillingItem,priceOf}=await import('./market.js');
  const u={archetype:'GATHERER',career:{thrift:.9},skills:Object.fromEntries(['woodcutting','mining','fishing'].map(s=>[s,{level:99,xp:20000000}]))};
  const output=skillingItem('woodcutting',99), repriced={model:MARKET_MODEL,prices:{[output]:priceOf(null,output)*4}};
  const count=(market)=>Array.from({length:2000},(_,i)=>chooseTrainingSkill(u,()=>(i+.5)/2000,{market})).filter(s=>s==='woodcutting').length;
  assert.ok(count(repriced)>count(null)*1.3);
  u.archetype='COLLECTION_HUNTER';assert.equal(count(repriced),count(null));
});

test('daily price quotes replace same-day observations, retain 35 days and never backfill gaps',()=>{
  const u=user();u.skills=Object.fromEntries(['attack','defence','ranged','magic'].map(s=>[s,{level:1}]));
  let m=null;
  for(let i=0;i<45;i++)m=advanceEconomy(m,economyFrame([u]),[u],new Date(now+i*DAY));
  assert.equal(m.items[1511].dailyHistory.length,35);
  const next=advanceEconomy(m,economyFrame([u]),[u],new Date(now+44*DAY+900000));
  assert.equal(next.items[1511].dailyHistory.length,35);
  const gap=advanceEconomy(next,economyFrame([u]),[u],new Date(now+100*DAY));
  assert.equal(gap.items[1511].dailyHistory.length,1);
});

test('new accounts without initialized inventories do not produce non-finite cash summaries',()=>{
  const u=user();delete u.economy.cash;delete u.economy.holdings;
  const summary=buildFinance([u],now);
  assert.equal(summary.cash,0);assert.equal(summary.cashKnown,0);assert.equal(summary.total,200);
});
