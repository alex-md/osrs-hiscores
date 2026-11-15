import items from '../../frontend/lib/items.js';
import { valueBank } from './economy.js';
import { priceOf } from './market.js';
import { equipmentBonus } from './wealth-progression.js';
const MAX_TRADES = 64;
const TAX = .02;
const RESERVE = 1_000_000;
const stamp = (user, trade) => {
  const e = user.economy;
  e.trades = [trade,...(e.trades || [])].slice(0,8);
  e.tradeCount = (e.tradeCount || 0)+1;
  e.tradeVolume = (e.tradeVolume || 0)+trade.price;
  user.lastTradeAt = trade.timestamp;
};
const canBuy = (user,id,market) => {
  const item = items[id], e = user.economy;
  if (!item?.power || e.holdings[id] > 0 || priceOf(market,id) > Math.max(0,e.cash-RESERVE)*.65) return false;
  const withItem = {...user,economy:{...e,holdings:{[id]:1}}};
  const skill = item.style === 'melee' ? 'attack' : item.style === 'all' ? null : item.style;
  return equipmentBonus(withItem,skill) > 0 && equipmentBonus(withItem,skill) > equipmentBonus(user,skill);
};

// Current market quotes, bounded participation, no borrowing and no orders that XP waits on.
// Outside stock comes only from actual sales; it never fabricates rare supply.
export function tradeRares(users, date, previous = null, {hours=.25,rng=Math.random,market} = {}) {
  const stock = {...previous?.stock};
  const summary = {timestamp:+date,playerTrades:0,outsideSales:0,outsidePurchases:0,volume:0,tax:0};
  if (!(hours>0)) return {version:1,stock,summary};
  for (const user of users) valueBank(user,market);
  const participation = Math.min(1,hours/.25);
  const shuffled = users.map(user=>({user,order:rng()})).sort((a,b)=>a.order-b.order).map(row=>row.user);
  const buyers = shuffled.filter(user=>rng()<.25*participation);
  const busy = new Set();
  let count=0, outsideBudget=5_000_000_000;
  const record = (seller,buyer,id,outside) => {
    const price = priceOf(market,id), tax = Math.floor(price*TAX);
    if (seller) {
      seller.economy.holdings[id]--;
      seller.economy.flows.transferredOut ||= {};
      seller.economy.flows.transferredOut[id] = (seller.economy.flows.transferredOut[id] || 0)+1;
      seller.economy.cash += price-tax;
      seller.economy.flows.coinSinks += tax;
      if (outside) seller.economy.flows.coinFaucets += price;
      stamp(seller,{side:'sell',itemId:Number(id),price,tax,counterparty:buyer?.username || 'Outside buyer',timestamp:+date});
      busy.add(seller);
      valueBank(seller,market);
    }
    if (buyer) {
      buyer.economy.cash -= price;
      buyer.economy.holdings[id]=(buyer.economy.holdings[id] || 0)+1;
      buyer.economy.flows.transferredIn ||= {};
      buyer.economy.flows.transferredIn[id] = (buyer.economy.flows.transferredIn[id] || 0)+1;
      if (outside) buyer.economy.flows.coinSinks += price;
      stamp(buyer,{side:'buy',itemId:Number(id),price,tax:0,counterparty:seller?.username || 'Outside stock',timestamp:+date});
      busy.add(buyer);
      valueBank(buyer,market);
    }
    summary.volume+=price; summary.tax+=seller ? tax : 0; count++;
  };
  for (const seller of shuffled) {
    if (count>=MAX_TRADES) break;
    if (busy.has(seller) || rng()>=.18*participation) continue;
    const offers=Object.entries(seller.economy.holdings).filter(([id,n])=>{
      if (!(n>0) || !items[id]?.rare) return false;
      // Collectors prefer to keep their first copy. All accounts can trade. Other
      // owners may choose a windfall; duplicates are offered much more readily.
      return n>1 || (!['COLLECTION_HUNTER','COMPLETIONIST'].includes(seller.archetype)
        && seller.career.thrift>.6 && rng()<.12);
    }).sort((a,b)=>priceOf(market,b[0])-priceOf(market,a[0]));
    const offer=offers[0];
    if (!offer) continue;
    const id=offer[0];
    const buyer=buyers.find(user=>user!==seller && !busy.has(user) && canBuy(user,id,market));
    if (buyer) {record(seller,buyer,id,false);summary.playerTrades++;}
    else if ((stock[id] || 0)<1000 && priceOf(market,id)<=outsideBudget && rng()<.35) {
      record(seller,null,id,true); stock[id]=(stock[id] || 0)+1;
      outsideBudget-=priceOf(market,id); summary.outsideSales++;
    }
  }
  for (const buyer of buyers) {
    if (count>=MAX_TRADES) break;
    if (busy.has(buyer)) continue;
    const id=Object.keys(stock).filter(id=>stock[id]>0 && canBuy(buyer,id,market))
      .sort((a,b)=>(items[b].power-items[a].power) || priceOf(market,a)-priceOf(market,b))[0];
    if (!id) continue;
    record(null,buyer,id,true); stock[id]--;summary.outsidePurchases++;
  }
  return {version:1,stock,summary};
}
