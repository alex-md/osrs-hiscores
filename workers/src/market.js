import baseline from '../data/ge-baseline.js';
import { equipmentBonus } from './wealth-progression.js';

export const MARKET_MODEL = 'supply-demand-v1';
const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
export function priceOf(market, id) {
  const opening = baseline[id]?.price || 0;
  const quote = market?.model === MARKET_MODEL ? market.prices?.[id] : null;
  return Number.isFinite(quote) && quote > 0 ? Math.round(clamp(quote, Math.max(1, opening * .15), opening * 8)) : opening;
}
import { gameSkillItems as SKILL_ITEMS, gameSkillOutputs as SKILL_OUTPUTS } from '../../frontend/lib/game-content.js';
export { SKILL_ITEMS, SKILL_OUTPUTS };
export function skillingItem(skill, level) {
  return SKILL_OUTPUTS[skill]?.filter(([required]) => level >= required).at(-1)?.[1] || null;
}
export { BOSS_ITEMS, RARE_ITEMS } from '../../frontend/lib/loot.js';

// An estimated spending basket, not a recipe or an inventory requirement.
const BASKETS = {
  construction: [960,8778,8780,8782], herblore: [257,259,263,227,231], prayer: [526,532,536,6729],
  crafting: [1741,1745,1751,1747], smithing: [440,444,453,2353,2361], fletching: [1517,1515,52,314],
  firemaking: [1511,1521,1519,1515], cooking: [317,335,377,383,7944], magic: [556,560,565],
  farming: [5295,5297,5301], sailing: [1515,960], runecraft: [7936,1436],
  bossing: [385,2434,12845,565,11230],
};
export function costIndex(activity, market) {
  const basket = BASKETS[activity];
  return basket ? basket.reduce((sum,id) => sum+priceOf(market,id)/baseline[id].price,0)/basket.length : 1;
}
export function publicEconomy(market) {
  if (!market) return null;
  return { capturedAt:market.capturedAt, model:market.model, inflation:market.inflation,
    items:Object.fromEntries(Object.entries(market.items).map(([id,row]) => [id, {
      price:row.price, changePct:row.changePct, dayChangePct:row.dayChangePct, driver:row.driver,
      produced:row.produced, demand:row.demand, upgradeDemand:row.upgradeDemand, held:row.held, stock:row.stock,
      history:row.history, dailyHistory:row.dailyHistory || [],
    }])) };
}
export function recordDemand(economy, activity, spent, market) {
  const basket = BASKETS[activity];
  if (!basket || !(spent > 0)) return;
  economy.flows.demand ||= {};
  for (const id of basket) economy.flows.demand[id] = (economy.flows.demand[id] || 0) + spent / basket.length / priceOf(market, id);
}

// Capture before/after frames to count only this session's production and paid
// demand. Opening inventories, transfers and arrivals never become new drops.
export function economyFrame(users) {
  const frame = { items: {}, cash: 0, players: users.length };
  for (const user of users) {
    const e = user.economy;
    frame.cash += e.cash || 0;
    for (const id of Object.keys(baseline)) {
      const row = frame.items[id] ||= { held:0, created:0, removed:0, demand:0 };
      row.held += e.holdings?.[id] || 0;
      row.created += e.flows?.created?.[id] || 0;
      row.removed += e.flows?.consumed?.[id] || 0;
      row.demand += e.flows?.demand?.[id] || 0;
    }
  }
  return frame;
}
function upgradeDemand(users, market) {
  const demand = {};
  const gear = Object.entries(baseline).filter(([,item]) => item.power);
  for (const user of users) {
    if (user.archetype === 'IRON_SOUL') continue;
    const e = user.economy, budget = Math.max(0,(e.cash || 0)-1_000_000)*.65;
    const best = Object.fromEntries(['attack','defence','ranged','magic'].map(skill => [skill,equipmentBonus(user,skill)]));
    for (const [id,item] of gear) {
      if (e.holdings?.[id] > 0 || priceOf(market,id) > budget) continue;
      const gate = item.style === 'melee' ? Math.min(user.skills.attack.level,user.skills.strength.level)
        : item.style === 'all' ? Math.min(user.skills.attack.level,user.skills.ranged.level,user.skills.magic.level)
        : user.skills[item.style]?.level || 1;
      const current = item.style === 'all' ? Math.max(...Object.values(best)) : best[item.style === 'melee' ? 'attack' : item.style];
      if (gate >= item.requiredLevel && item.power > current) demand[id] = (demand[id] || 0)+.025;
    }
  }
  return demand;
}

export function advanceEconomy(previous, before, users, date, {hours=.25, stock={}} = {}) {
  const saved = previous?.model === MARKET_MODEL ? previous : null;
  if (saved && +date <= saved.capturedAt) return saved;
  const after = economyFrame(users);
  const openingCash = saved?.openingCash ?? (before.players ? Math.max(1,before.cash / before.players) : null);
  const inflation = openingCash ? clamp((after.cash / Math.max(1,after.players) / openingCash) ** .2,.6,1.8) : 1;
  const market = { model:MARKET_MODEL, status:'simulated', capturedAt:+date, openingCash, prices:{}, items:{}, inflation };
  const demand = upgradeDemand(users,saved);
  const step = clamp(hours,0,.25)/.25;
  const smoothing = 1-Math.exp(-Math.max(0,Math.min(hours,.25))/6);
  for (const [id,item] of Object.entries(baseline)) {
    const old = saved?.items?.[id];
    const start = before.items[id] || {held:0,created:0,removed:0,demand:0};
    const end = after.items[id] || {held:0,created:0,removed:0,demand:0};
    const produced = Math.max(0,end.created-start.created);
    const removed = Math.max(0,end.removed-start.removed);
    const wanted = Math.max(0,end.demand-start.demand);
    const supplyRate = (old?.supplyRate || 0)*(1-smoothing) + produced* smoothing;
    const demandRate = (old?.demandRate || 0)*(1-smoothing) + wanted*smoothing;
    const openingHeld = saved?.openingCash != null ? old?.openingHeld ?? start.held : start.held;
    // Market depth absorbs small orders. Thin rare markets respond more strongly.
    const depth = item.rare ? Math.max(1,users.length*.005) : Math.max(10,users.length*1500/item.price);
    const flow = Math.log((depth+demandRate+(item.rare ? demand[id] || 0 : 0))/(depth+supplyRate));
    const scarcity = Math.log((depth+openingHeld)/(depth+end.held+(stock[id] || 0)));
    const pressure = clamp(.65*flow+.35*scarcity,-1.7,1.7);
    const target = item.price*clamp(inflation*Math.exp(pressure),.15,8);
    const current = old?.fairValue || priceOf(saved,id);
    // Fractional fair values let even 1–5 GP goods accumulate gradual changes.
    const move = clamp(Math.log(target/current)*.08*step,-.02*step,.02*step);
    const fairValue = clamp(current*Math.exp(move),Math.max(1,item.price*.15),item.price*8);
    const price = Math.round(fairValue);
    const history = [...(old?.history || [[+date-Math.max(0,hours)*3600000,item.price]]),[+date,price]].filter(([timestamp]) => timestamp >= +date-86400000).slice(-97);
    const day = new Date(+date).toISOString().slice(0,10);
    const dailyHistory = [...(old?.dailyHistory || []).filter(([at]) => new Date(at).toISOString().slice(0,10) !== day), [+date,price]].filter(([at]) => at >= +date-35*86400000).slice(-35);
    const dayPrice = history[0][1];
    market.prices[id] = price;
    market.items[id] = { price, fairValue, openingHeld, supplyRate, demandRate, produced, removed,
      demand:wanted, upgradeDemand:demand[id] || 0, held:end.held, stock:stock[id] || 0,
      change:price-priceOf(saved,id), changePct:100*(price/priceOf(saved,id)-1), dayChangePct:100*(price/dayPrice-1),
      driver: pressure > .025 ? 'Demand / scarcity' : pressure < -.025 ? 'Supply / surplus' : inflation > 1.01 ? 'Coin inflation' : inflation < .99 ? 'Coin contraction' : 'Balanced', history, dailyHistory };
  }
  return market;
}
