import baseline from "../data/ge-baseline.js";
import { valueBank } from "./economy.js";

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const ids = Object.keys(baseline);
const trainingInputs = { construction: 1515, firemaking: 1515, fletching: 1515,
  smithing: 444, cooking: 7944, herblore: 257, prayer: 536, magic: 560, ranged: 10034, crafting: 1751 };
function buyTarget(user, market, date) {
  const preference = ids[hash(user.username) % ids.length];
  const needed = trainingInputs[user.trainingState?.focusSkill];
  const weights = ids.map(id => {
    const history = market.history[id];
    const average = history?.length ? history.reduce((sum, price) => sum + price, 0) / history.length : market.prices[id];
    const relative = market.prices[id] / average;
    const temperament = user.career.risk > 0.5 ? relative : 1 / relative;
    const exposure = (user.economy.holdings[id] || 0) * market.prices[id] / Math.max(1, user.economy.bankValue);
    return (id === preference ? 4 : 1) * (Number(id) === needed ? 5 : 1)
      * clamp(temperament, 0.5, 2) / (1 + exposure * 20);
  });
  let choice = hash(`${user.username}:${date.getTime()}:order`) / 2 ** 32 * weights.reduce((sum, weight) => sum + weight, 0);
  for (let i = 0; i < ids.length; i++) if ((choice -= weights[i]) < 0) return ids[i];
  return ids.at(-1);
}
function hash(text) {
  let result = 2166136261;
  for (const char of text) result = Math.imul(result ^ char.charCodeAt(0), 16777619);
  return result >>> 0;
}
// Offline catalog prices seed a new market once. Every later quote carries
// forward from this world's own close, without an external anchor or reversion.
export function exchangeMarket(previous = {}) {
  return { source: "Simulated Grand Exchange", status: "simulated", capturedAt: previous.generatedAt || null,
    history: Object.fromEntries((previous.items || []).map(item => [item.id, item.history])),
    prices: Object.fromEntries(ids.map(id => [id, previous.prices?.[id] ?? baseline[id].price])) };
}

export function clearExchange(users, date, previous = {}, { hours = 0.25 } = {}) {
  const market = exchangeMarket(previous);
  const fraction = clamp(hours / 0.25, 0, 1);
  const books = Object.fromEntries(ids.map(id => [id, { buys: [], sells: [], demand: 0, supply: 0, volume: 0, traded: 0 }]));
  // Rotate priority each update so the same names do not always fill first.
  const ordered = [...users].sort((a, b) => hash(`${date.getTime()}:${a.username}`) - hash(`${date.getTime()}:${b.username}`));
  for (const user of ordered) {
    valueBank(user, market);
    const economy = user.economy;
    economy.exchange ||= { bought: 0, sold: 0, tax: 0, fills: 0 };
    if (user.activity === "INACTIVE" || !fraction) continue;
    // Retain most equipment/materials; offer a small slice of the item basket.
    for (const [id, held] of Object.entries(economy.holdings)) {
      if (!books[id] || held <= 0) continue;
      const quantity = held * 0.05 * fraction;
      books[id].sells.push({ user, quantity });
      books[id].supply += quantity;
    }
    // Training needs, taste, exposure and recent trends guide funded orders.
    const target = buyTarget(user, market, date);
    const budget = Math.min(2_000_000 * fraction, economy.cash * (0.01 + 0.02 * (1 - user.career.thrift)) * fraction);
    if (budget >= 1) {
      const quantity = budget / market.prices[target];
      books[target].buys.push({ user, quantity });
      books[target].demand += quantity;
    }
  }
  let turnover = 0, tax = 0, fills = 0;
  const tape = [], prices = {};
  const oldItems = new Map((previous.items || []).map(item => [item.id, item]));
  const items = ids.map(id => {
    const book = books[id], price = market.prices[id];
    let sellerIndex = 0;
    for (const buy of book.buys) {
      while (buy.quantity > 1e-9 && sellerIndex < book.sells.length) {
        const sell = book.sells[sellerIndex];
        // Skip self offers for this buyer without losing their place for others.
        if (sell.user === buy.user) {
          const alternative = book.sells.findIndex((offer, index) => index > sellerIndex && offer.quantity > 1e-9 && offer.user !== buy.user);
          if (alternative < 0) break;
          [book.sells[sellerIndex], book.sells[alternative]] = [book.sells[alternative], sell];
          continue;
        }
        const buyer = buy.user.economy, seller = sell.user.economy;
        const quantity = Math.min(buy.quantity, sell.quantity, buyer.cash / price, seller.holdings[id] || 0);
        if (quantity <= 1e-9) { sellerIndex++; continue; }
        const value = quantity * price;
        const fee = value * 0.02; // Authored 2% sink on these fractional baskets.
        buyer.cash -= value;
        seller.cash += value - fee;
        buyer.holdings[id] = (buyer.holdings[id] || 0) + quantity;
        seller.holdings[id] = Math.max(0, seller.holdings[id] - quantity);
        buyer.exchange.bought += value;
        seller.exchange.sold += value;
        seller.exchange.tax += fee;
        seller.spent += fee;
        buyer.exchange.fills++;
        seller.exchange.fills++;
        book.volume += quantity;
        book.traded += value;
        turnover += value; tax += fee; fills++;
        if (tape.length < 20) tape.push({ item: id, buyer: buy.user.username, seller: sell.user.username, quantity, price });
        buy.quantity -= quantity;
        sell.quantity -= quantity;
        if (sell.quantity <= 1e-9) sellerIndex++;
      }
    }
    // Shallow markets move less: a tiny offer cannot move a rare item's price.
    const depth = Math.max(1_000_000, (book.demand + book.supply) * price);
    const imbalance = (book.demand - book.supply) * price / depth;
    // A per-update circuit breaker slows shocks without resetting trends.
    prices[id] = clamp(price * Math.exp(imbalance * 0.02 * fraction), 1, 1_000_000_000_000);
    return { id, name: baseline[id].name, price,
      change: oldItems.get(id)?.price ? (price / oldItems.get(id).price - 1) * 100 : 0,
      volume: book.volume, traded: book.traded, buyOffers: book.buys.length, sellOffers: book.sells.length,
      history: [...(oldItems.get(id)?.history || []), price].slice(-24) };
  });
  for (const user of users) {
    // Account for fees as spending, rather than mislabeling them as price moves.
    const before = user.economy.bankValue;
    const oldRevaluation = user.economy.revaluation;
    valueBank(user, market);
    user.economy.revaluation = oldRevaluation;
    if (user.economy.bankValue !== before) user.updatedAt = date.getTime();
  }
  return { version: 2, generatedAt: date.getTime(), prices, items, tape, turnover, tax, fills,
    totalTurnover: (previous.totalTurnover || 0) + turnover };
}
