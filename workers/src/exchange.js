import { equipped, nextUpgrade } from "../data/equipment.js";
import baseline from "../data/ge-baseline.js";
import { valueBank } from "./economy.js";

const ids = Object.keys(baseline);
const DAY = 86_400_000;
const integerPrice = value => Math.max(1, Math.min(1_000_000_000_000, Math.round(Number(value) || 1)));
function hash(text) {
  let result = 2166136261;
  for (const char of text) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}
export function exchangeMarket(previous = {}) {
  return { source: "Simulated Grand Exchange", status: "simulated", capturedAt: previous.generatedAt || null,
    history: Object.fromEntries((previous.items || []).map(item => [item.id, item.history])),
    prices: Object.fromEntries(ids.map(id => [id, integerPrice(previous.prices?.[id] ?? baseline[id].price)])) };
}

// Orders last one clearing interval. Unfilled orders are replaced from current
// holdings/needs next tick. Nothing is reserved outside this atomic world update.
export function clearExchange(users, date, previous = {}, { hours = 0.25 } = {}) {
  const now = date.getTime(), cutoff = now - DAY;
  const market = exchangeMarket(previous);
  const fraction = Math.max(0, Math.min(1, hours / 0.25));
  const books = Object.fromEntries(ids.map(id => [id, { buys: [], sells: [], demand: 0, supply: 0, volume: 0, traded: 0 }]));
  const ordered = [...users].sort((a, b) => hash(`${now}:${a.username}`) - hash(`${now}:${b.username}`));
  for (const user of ordered) {
    valueBank(user, market);
    const e = user.economy;
    e.exchange ||= { bought: 0, sold: 0, tax: 0, fills: 0 };
    if (user.activity === "INACTIVE" || !fraction) continue;
    const needs = Object.fromEntries(Object.entries(e.inputReserve || e.needs || {}).map(([id, n]) => [id,
      e.inputReserve ? Math.max(0, n - (e.holdings[id] || 0)) : n]));
    // Gear demand is a funded upgrade, not an unrelated speculative purchase.
    const upgrade = nextUpgrade(user, market.prices);
    if (!Object.values(needs).some(n => n > 0) && upgrade) needs[upgrade.id] = 1;
    const retainedGear = new Set(equipped(user).map(item => String(item.id)));
    for (const [id, held] of Object.entries(e.holdings)) {
      if (!books[id] || held <= 0) continue;
      // Retain equipment and enough inputs for the next training/PvM session.
      const reserve = retainedGear.has(id) ? 1 : (e.inputReserve?.[id] || 0);
      const surplus = Math.max(0, held - reserve);
      const quantity = surplus ? Math.min(surplus, Math.max(1, Math.floor(surplus * 0.2 * fraction))) : 0;
      if (!quantity) continue;
      books[id].sells.push({ user, quantity }); books[id].supply += quantity;
    }
    const budget = Math.floor(e.cash * 0.3 * fraction);
    const requestedCost = Object.entries(needs).reduce((sum, [id, n]) => sum + (books[id] && n > 0 ? n * market.prices[id] : 0), 0);
    const funding = Math.min(1, budget / Math.max(1, requestedCost));
    for (const [id, requested] of Object.entries(needs)) {
      if (!books[id] || !(requested > 0)) continue;
      const quantity = Math.min(Math.floor(requested), Math.floor(requested * funding));
      if (!quantity) continue;
      books[id].buys.push({ user, quantity }); books[id].demand += quantity;
    }
  }
  let turnover = 0, tax = 0, fills = 0;
  const tape = [], prices = {};
  const oldItems = new Map((previous.items || []).map(item => [item.id, item]));
  const buckets = previous.version >= 3 ? (previous.buckets || []).filter(b => b.timestamp > cutoff && b.timestamp <= now) : [];
  const current = { timestamp: now, items: {} };
  const items = ids.map(id => {
    const book = books[id], old = oldItems.get(id);
    const reference = market.prices[id];
    const depth = Math.max(1_000_000, (book.demand + book.supply) * reference);
    const imbalance = (book.demand - book.supply) * reference / depth;
    const quote = integerPrice(reference * Math.exp(imbalance * 0.02 * fraction));
    let lastTrade = previous.version >= 3 ? old?.lastTrade || null : null;
    let sellerIndex = 0;
    for (const buy of book.buys) {
      while (buy.quantity > 0 && sellerIndex < book.sells.length) {
        const sell = book.sells[sellerIndex];
        if (sell.user === buy.user) {
          const alternative = book.sells.findIndex((offer, index) => index > sellerIndex && offer.quantity > 0 && offer.user !== buy.user);
          if (alternative < 0) break;
          [book.sells[sellerIndex], book.sells[alternative]] = [book.sells[alternative], sell];
          continue;
        }
        const buyer = buy.user.economy, seller = sell.user.economy;
        const quantity = Math.min(buy.quantity, sell.quantity, Math.floor(buyer.cash / quote), seller.holdings[id] || 0);
        if (quantity <= 0) {
          if (buyer.cash < quote) break;
          sellerIndex++; continue;
        }
        const value = quantity * quote, fee = Math.floor(value * 2 / 100);
        buyer.cash -= value; seller.cash += value - fee;
        buyer.holdings[id] = (buyer.holdings[id] || 0) + quantity;
        seller.holdings[id] -= quantity;
        buyer.exchange.bought += value; seller.exchange.sold += value;
        seller.exchange.tax += fee; seller.spent += fee; seller.bankValue -= fee;
        seller.flows.coinSinks += fee;
        buyer.exchange.fills++; seller.exchange.fills++;
        buyer.lastTradeAt = seller.lastTradeAt = now;
        book.volume += quantity; book.traded += value;
        turnover += value; tax += fee; fills++;
        const trade = { item: id, buyer: buy.user.username, seller: sell.user.username, quantity, price: quote, total: value, tax: fee, timestamp: now };
        if (tape.length < 100) tape.push(trade);
        lastTrade = { timestamp: now, price: quote, quantity };
        buy.quantity -= quantity; sell.quantity -= quantity;
        if (sell.quantity === 0) sellerIndex++;
      }
    }
    // Orders without a completed trade cannot mark up their own inventory.
    prices[id] = book.volume ? quote : reference;
    current.items[id] = { price: prices[id], volume: book.volume, traded: book.traded };
    const observations = [...buckets, current];
    const volume24h = observations.reduce((sum, bucket) => sum + (bucket.items[id]?.volume || 0), 0);
    const opening = (previous.version >= 3 ? previous.priceHistory || [] : []).filter(b => b.timestamp <= cutoff).at(-1)?.prices[id];
    return { id, name: baseline[id].name, price: prices[id],
      change: opening ? (prices[id] / opening - 1) * 100 : null,
      volume: book.volume, traded: book.traded, volume24h, circulatingSupply: 0,
      buyUnits: book.buys.reduce((sum, offer) => sum + offer.quantity, 0),
      sellUnits: book.sells.reduce((sum, offer) => sum + offer.quantity, 0),
      buyOffers: book.buys.filter(o => o.quantity > 0).length, sellOffers: book.sells.filter(o => o.quantity > 0).length,
      lastTrade, history: [...(old?.history || []), prices[id]].slice(-24) };
  });
  for (const user of users) {
    // Transfers/fees change wealth; only the closing quote change is revaluation.
    valueBank(user, { ...market, prices });
  }
  // Reconcile public inventory/order metrics after any wealth-cap sinks.
  const circulation = {};
  for (const user of users) for (const [id, count] of Object.entries(user.economy.holdings)) circulation[id] = (circulation[id] || 0) + count;
  const funded = new Map(users.map(user => [user, user.economy.cash]));
  for (const item of items) {
    const book = books[item.id];
    item.circulatingSupply = circulation[item.id] || 0;
    for (const offer of book.buys) {
      offer.quantity = Math.min(offer.quantity, Math.floor(funded.get(offer.user) / item.price));
      funded.set(offer.user, funded.get(offer.user) - offer.quantity * item.price);
    }
    for (const offer of book.sells) offer.quantity = Math.min(offer.quantity, offer.user.economy.holdings[item.id] || 0);
    item.buyUnits = book.buys.reduce((sum, offer) => sum + offer.quantity, 0);
    item.sellUnits = book.sells.reduce((sum, offer) => sum + offer.quantity, 0);
    item.buyOffers = book.buys.filter(offer => offer.quantity > 0).length;
    item.sellOffers = book.sells.filter(offer => offer.quantity > 0).length;
  }
  const priceHistory = [...(previous.version >= 3 ? previous.priceHistory || [] : []), { timestamp: now, prices }];
  // Keep one boundary observation plus all prices within the rolling window.
  const boundary = priceHistory.filter(b => b.timestamp <= cutoff).at(-1);
  const retainedPrices = [...(boundary ? [boundary] : []), ...priceHistory.filter(b => b.timestamp > cutoff)].slice(-98);
  const recent = [...tape.reverse(), ...(previous.version >= 3 ? previous.tape || [] : [])].filter(t => t.timestamp > cutoff).slice(0, 100);
  return { version: 3, generatedAt: now, prices, items, tape: recent, turnover, tax, fills,
    buckets: [...buckets, current].slice(-96), priceHistory: retainedPrices,
    statsStartedAt: previous.version >= 3 ? previous.statsStartedAt : now,
    orderExpiresAt: now + 900000,
    totalTurnover: Math.round(previous.totalTurnover || 0) + turnover };
}
