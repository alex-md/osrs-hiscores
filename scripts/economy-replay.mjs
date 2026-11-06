// Deterministic, disposable economy experiment. No network or production writes.
import { newUser, progressUser } from '../workers/src/simulation.js';
import { valueBank } from '../workers/src/economy.js';
import { advanceEconomy, economyFrame } from '../workers/src/market.js';
import { tradeRares } from '../workers/src/rare-trading.js';
import items from '../frontend/lib/items.js';
const ticks = Math.min(2880,Math.max(1,Number(process.argv[2]) || 288));
const population = Math.min(2000,Math.max(1,Number(process.argv[3]) || 100));
let seed=42;
const random=Math.random;
Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
try {
  const users=Array.from({length:population},(_,i)=>newUser(`Replay${i}`));
  for(const user of users) valueBank(user);
  const openingXP=users.reduce((s,u)=>s+u.totalXP,0);
  let market=null,trades=null;
  for(let tick=0;tick<ticks;tick++) {
    const date=new Date(Date.parse('2026-11-06T00:00:00Z')+tick*900000);
    const before=economyFrame(users);
    for(const user of users)progressUser(user,date,{market});
    market=advanceEconomy(market,before,users,date,{stock:trades?.stock});
    trades=tradeRares(users,date,trades,{market});
    for(const user of users) {
      valueBank(user,market);
      const e=user.economy;
      if(!Number.isSafeInteger(e.cash)||e.cash<0||e.bankValue>1e12||e.bankValue<0||!Object.values(e.holdings).every(n=>Number.isSafeInteger(n)&&n>=0)) throw new Error(`Invalid bank: ${user.username}`);
      if(e.bankValue!==e.cash+Object.entries(e.holdings).reduce((sum,[id,n])=>sum+n*market.prices[id],0)) throw new Error('Quote mismatch');
    }
  }
  const rows=Object.entries(market.items).map(([id,row])=>({item:items[id].name,price:row.price,changePercent:Math.round((row.price/items[id].price-1)*1000)/10,driver:row.driver})).sort((a,b)=>b.changePercent-a.changePercent);
  console.log(JSON.stringify({experiment:true,population,ticks,days:ticks/96,xpGained:users.reduce((s,u)=>s+u.totalXP,0)-openingXP,
    changedItems:rows.filter(r=>r.changePercent!==0).length,items:rows.length,inflation:market.inflation,
    biggestRises:rows.slice(0,5),biggestFalls:rows.slice(-5).reverse(),marketBytes:JSON.stringify(market).length},null,2));
} finally {Math.random=random;}
