import { financeDays, packFinanceDays, latestFinanceDay } from '../../frontend/lib/finance-data.js';
import { priceOf } from './market.js';
const DAY = 86400000;
export const financeFrame = user => ({ bank:user.economy.bankValue, cash:user.economy.cash,
  holdings:{...user.economy.holdings}, earned:user.economy.earned, spent:user.economy.spent,
  trades:user.economy.tradeCount || 0 });

// Called only by a successful simulation, after pricing and settlement. Rebuilds
// never fabricate observations. The first observation is a zero-delta baseline.
export function recordFinance(user, before, oldMarket, market, now) {
  if (user.finance?.at >= now) return;
  const e = user.economy, day = new Date(now).toISOString().slice(0,10);
  const first = !user.finance || !before;
  const f = user.finance ||= { since:now, days:[] };
  const change = first ? 0 : e.bankValue-before.bank;
  const marketChange = first ? 0 : Object.entries(before.holdings).reduce((sum,[id,n]) => sum+n*(priceOf(market,id)-priceOf(oldMarket,id)),0);
  const days = financeDays(f), last = days.at(-1);
  const row = last?.day === day ? {...last} : {day,from:first ? now : f.at,change:0,market:0,flows:0,earned:0,spent:0,trades:0,observedMs:0};
  row.observedMs=(row.observedMs || 0)+(first ? 0 : Math.min(900000,Math.max(0,now-f.at)));
  row.at=now; row.bank=e.bankValue; row.cash=e.cash;
  row.change+=change; row.market+=marketChange; row.flows+=change-marketChange;
  row.earned+=first ? 0 : e.earned-before.earned;
  row.spent+=first ? 0 : e.spent-before.spent;
  row.trades+=first ? 0 : (e.tradeCount || 0)-before.trades;
  f.days=packFinanceDays([...days.filter(r=>r.day!==day && r.at>=now-35*DAY),row].slice(-35));
  f.at=now;
  f.last={at:now,change,market:marketChange,flows:change-marketChange,bankBefore:first ? e.bankValue : before.bank};
}
const median = rows => { const a=[...rows].sort((a,b)=>a-b); return a.length ? (a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2 : 0; };
export function unusualDay(user) {
  const rows=financeDays(user.finance), today=rows.at(-1);
  // Compare only complete observed days, and like elapsed time is not assumed.
  // Today's whole observed gain must already exceed historical full-day gains.
  const history=rows.slice(0,-1).filter(r=>r.observedMs>=23*3600000 && r.at-r.from<=25*3600000);
  if (!today || history.length<7) return null;
  const baseline=median(history.map(r=>r.flows));
  const deviation=median(history.map(r=>Math.abs(r.flows-baseline)));
  if (today.flows<=Math.max(1_000_000,baseline+6*Math.max(100000,deviation))) return null;
  return {baseline,samples:history.length,flows:today.flows,day:today.day};
}
export function buildFinance(users, now) {
  const banks=users.map(u=>u.economy.bankValue).sort((a,b)=>a-b);
  const total=banks.reduce((a,b)=>a+b,0), cash=users.reduce((n,u)=>n+(u.economy.cash || 0),0);
  const day=new Date(now).toISOString().slice(0,10), exposures={};
  for (const u of users) for (const [id,quantity] of Object.entries(u.economy.holdings || {})) {
    if (!(quantity>0)) continue;
    const value=quantity*(u.economy.pricing?.prices?.[id] || 0);
    const row=exposures[id] ||= {holders:0,value:0,players:[]}; row.holders++; row.value+=value;
    row.players.push({username:u.username,quantity,value,share:u.economy.bankValue ? value/u.economy.bankValue : 0});
    row.players.sort((a,b)=>b.value-a.value || a.username.localeCompare(b.username)); row.players.length=Math.min(3,row.players.length);
  }
  const observed=users.filter(u=>latestFinanceDay(u.finance)?.day===day);
  return {since:observed.length ? Math.min(...observed.map(u=>u.finance.since)) : null, observed:observed.length,
    total,cash,cashKnown:users.filter(u=>Number.isFinite(u.economy.cash)).length,population:users.length,median:median(banks),topDecileShare:total ? banks.slice(-Math.ceil(banks.length*.1)).reduce((a,b)=>a+b,0)/total : 0,
    day,change:observed.reduce((n,u)=>n+latestFinanceDay(u.finance).change,0),
    market:observed.reduce((n,u)=>n+latestFinanceDay(u.finance).market,0),
    exposures};
}
