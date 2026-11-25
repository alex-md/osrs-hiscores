import { unusualDay } from './finance.js';
const DAY=86400000;
export function buildDiscoveries(users, market, previous, now) {
  const fresh=[], since=previous?.generatedAt ?? now;
  const existing=new Set((previous?.discoveries || []).map(row=>row.id));
  const add=row=>fresh.push(row);
  for (const user of users) {
    const f=user.finance;
    for (const loot of user.economy?.notableLoot || []) {
      if (loot.timestamp<=since || loot.timestamp>now || loot.value<1_000_000) continue;
      const bankBefore=f?.last?.at===loot.timestamp ? f.last.bankBefore : null;
      if (!(bankBefore>0) || loot.value<bankBefore*.15) continue;
      add({...loot,kind:'windfall',username:user.username,share:loot.value/bankBefore,
        id:`windfall:${user.username}:${loot.itemId}:${loot.timestamp}`});
    }
    const unusual=unusualDay(user);
    if (unusual && f.at>since) add({...unusual,kind:'unusual-income',username:user.username,timestamp:f.at,id:`income:${user.username}:${unusual.day}`});
    // A purchased upgrade followed by actual subsequent activity. This records
    // the sequence; it does not claim the upgrade caused a performance change.
    const session=user.economy?.lastSession;
    if (session?.timestamp>since && session.timestamp<=now && session.boss && session.kills>0) {
      const trade=(user.economy.trades || []).find(t=>t.side==='buy' && t.timestamp<session.timestamp && session.timestamp-t.timestamp<=DAY && user.economy.holdings[t.itemId]>0);
      if (trade && !existing.has(`purchase:${user.username}:${trade.timestamp}:${trade.itemId}`)) add({kind:'after-purchase',username:user.username,itemId:trade.itemId,price:trade.price,
        counterparty:trade.counterparty,purchasedAt:trade.timestamp,boss:session.boss,kills:session.kills,timestamp:session.timestamp,id:`purchase:${user.username}:${trade.timestamp}:${trade.itemId}`});
    }
  }
  const movers=Object.entries(market?.items || {}).filter(([,row])=>row.history?.length>1 && row.history.at(-1)[0]-row.history[0][0]>=23.75*3600000 && Math.abs(row.dayChangePct)>=8)
    .sort((a,b)=>Math.abs(b[1].dayChangePct)-Math.abs(a[1].dayChangePct)).slice(0,3);
  for (const [itemId,row] of movers) add({kind:'market',itemId:Number(itemId),changePct:row.dayChangePct,windowHours:(row.history.at(-1)[0]-row.history[0][0])/3600000,price:row.price,driver:row.driver,
    timestamp:market.capturedAt,id:`market:${itemId}:${new Date(market.capturedAt).toISOString().slice(0,10)}`});
  // New evidence replaces the same day's developing observation. Bound both
  // age and count; duplicate rebuilds cannot create additional stories.
  const importance=row=>row.kind==='windfall' ? row.share : row.kind==='unusual-income' ? row.flows/Math.max(100000,Math.abs(row.baseline)) : row.kind==='market' ? Math.abs(row.changePct) : row.price;
  const chosen=['market','windfall','unusual-income','after-purchase'].flatMap(kind=>fresh.filter(row=>row.kind===kind).sort((a,b)=>importance(b)-importance(a) || a.id.localeCompare(b.id)).slice(0,4));
  const seen=new Set(), counts={};
  return [...chosen.sort((a,b)=>b.timestamp-a.timestamp),...(previous?.discoveries || [])]
    .filter(row=>{
      if (row.timestamp>now || row.timestamp<now-7*DAY || seen.has(row.id) || (counts[row.kind] || 0)>=10) return false;
      seen.add(row.id);counts[row.kind]=(counts[row.kind] || 0)+1;return true;
    }).sort((a,b)=>b.timestamp-a.timestamp).slice(0,40);
}
