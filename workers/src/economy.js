import { equipped } from "../data/equipment.js";
import { BOSSES, MAX_BANK_VALUE } from "../../frontend/lib/activities.js";
import { combatLevel } from "../../frontend/lib/domain.js";
import { priceOf, BOSS_ITEMS, RARE_ITEMS } from "./market.js";
import baseline from "../data/ge-baseline.js";
import { METHODS } from "../data/methods.js";

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const integer = value => Math.floor(clamp(Number(value) || 0, 0, MAX_BANK_VALUE));
// Personalities survive renames: once persisted, never derive traits again.
function seeded(seed) {
  let value = 2166136261;
  for (const char of seed) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 4294967296);
}
function normal(rng) {
  return Math.sqrt(-2 * Math.log(Math.max(1e-12, rng()))) * Math.cos(2 * Math.PI * rng());
}
function lognormal(rng, sigma) { return Math.exp(sigma * normal(rng) - sigma * sigma / 2); }
function weighted(items, weight, rng) {
  let remaining = rng() * items.reduce((sum, item) => sum + weight(item), 0);
  for (const item of items) { remaining -= weight(item); if (remaining < 0) return item; }
  return items.at(-1);
}
// Exact Poisson for small counts, normal approximation for larger counts. No
// per-kill loop, per-drop document, or growing transaction history.
function poisson(mean, rng) {
  if (mean <= 0) return 0;
  if (mean > 25) return Math.max(0, Math.round(mean + Math.sqrt(mean) * normal(rng)));
  const stop = Math.exp(-mean);
  let product = 1, count = 0;
  do { count++; product *= Math.max(1e-12, rng()); } while (product > stop && count < 256);
  return count - 1;
}
function rareDrops(kills, chance, rng) {
  // Geometric gaps sample independent Bernoulli drops without iterating kills.
  let position = 0, drops = 0;
  while (position < kills) {
    position += Math.floor(Math.log(Math.max(1e-12, 1 - rng())) / Math.log(1 - chance)) + 1;
    if (position <= kills) drops++;
  }
  return drops;
}
export function normalizeCareer(user) {
  const rng = seeded(user.username.toLowerCase());
  const defaults = {
    version: 1, aptitude: 0.65 + rng() * 0.7, risk: 0.1 + rng() * 0.8,
    thrift: 0.2 + rng() * 0.7, dedication: 0.2 + rng() * 0.8,
    favoriteBoss: BOSSES[Math.floor(rng() * BOSSES.length)].key,
  };
  const saved = user.career || {};
  user.career = { ...defaults, ...saved };
  for (const key of ["aptitude", "risk", "thrift", "dedication"])
    user.career[key] = clamp(Number(user.career[key]) || defaults[key], key === "aptitude" ? 0.5 : 0.05, key === "aptitude" ? 1.5 : 0.95);
  user.bosses = Object.fromEntries(BOSSES.map(({key}) => [key, integer(user.bosses?.[key])]));
  const seedBank = Math.min(2_000_000_000, Math.max(5000, (user.totalXP || 0) * (0.5 + rng() * 4) * lognormal(rng, 1)));
  // Only the opening bank estimate is inferred. No historical kills or drops.
  user.economy = {
    ...user.economy,
    version: 1,
    bankValue: user.economy?.bankValue == null ? integer(seedBank) : integer(user.economy.bankValue),
    earned: integer(user.economy?.earned), spent: integer(user.economy?.spent),
    rareDrops: integer(user.economy?.rareDrops), deaths: integer(user.economy?.deaths),
    openingEstimate: user.economy?.openingEstimate ?? integer(seedBank),
    recordedFrom: user.economy?.recordedFrom ?? null,
  };
  return user;
}
export function eligibleBosses(user) {
  const combat = combatLevel(user.skills);
  return BOSSES.filter(boss => combat >= boss.combat && (!boss.slayer || user.skills.slayer?.level >= boss.slayer)
    && Object.entries(boss.requirements || {}).every(([skill, level]) => (user.skills[skill]?.level || 1) >= level));
}
// Upgrade fractional legacy baskets once. Whole items are retained and the
// fractional remainder becomes cash at the migration quote; total wealth survives.
export function valueBank(user, market) {
  const e = user.economy;
  const before = e.bankValue;
  if (!e.holdings) {
    e.cash = before;
    e.holdings = {};
    const assets = Object.keys(baseline);
    const random = seeded(user.username);
    for (let i = 0; i < 8; i++) {
      const id = assets[Math.floor(random() * assets.length)];
      const quantity = Math.floor(before * 0.0875 / priceOf(market, id));
      e.holdings[id] = (e.holdings[id] || 0) + quantity;
      e.cash -= quantity * priceOf(market, id);
    }
    e.revaluation = 0;
  }
  if (e.inventoryVersion !== 2) {
    let remainder = 0;
    for (const [id, count] of Object.entries(e.holdings)) {
      const whole = Math.max(0, Math.floor(Number(count) || 0));
      remainder += Math.max(0, (Number(count) || 0) - whole) * priceOf(market, id);
      e.holdings[id] = whole;
    }
    e.cash = Math.max(0, Math.round((e.cash || 0) + remainder));
    e.inventoryVersion = 2;
    e.migration = { fractionalValueConverted: Math.round(remainder) };
  }
  e.flows ||= { created: {}, consumed: {}, coinFaucets: 0, coinSinks: 0, capSink: 0 };
  let modeled = e.cash + Object.entries(e.holdings).reduce((sum, [id, count]) => sum + count * priceOf(market, id), 0);
  // Explicit integer asset sink at the safety ceiling, never proportional fractions.
  if (modeled > MAX_BANK_VALUE) {
    const cashSink = Math.min(e.cash, modeled - MAX_BANK_VALUE);
    e.cash -= cashSink; modeled -= cashSink; e.flows.capSink += cashSink;
    for (const [id, count] of Object.entries(e.holdings)) {
      if (modeled <= MAX_BANK_VALUE) break;
      const removed = Math.min(count, Math.ceil((modeled - MAX_BANK_VALUE) / priceOf(market, id)));
      e.holdings[id] -= removed; modeled -= removed * priceOf(market, id);
      e.flows.consumed[id] = (e.flows.consumed[id] || 0) + removed;
      e.flows.capSink += removed * priceOf(market, id);
    }
  }
  e.bankValue = modeled;
  e.revaluation = (e.revaluation || 0) + modeled - before;
  e.pricing = { source: market?.source || "Opening price catalog", capturedAt: market?.capturedAt || null, status: market?.status || "simulated" };
}
function settle(user, income, cost, details, date, market, rewards = {}, consumed = {}) {
  const e = user.economy;
  income = integer(income);
  cost = Math.min(e.cash, integer(cost));
  const earned = income + Object.entries(rewards).reduce((sum, [id, count]) => sum + count * priceOf(market, id), 0);
  const spent = cost + Object.entries(consumed).reduce((sum, [id, count]) => sum + count * priceOf(market, id), 0);
  e.cash += income - cost;
  for (const [id, count] of Object.entries(consumed)) {
    if (!Number.isSafeInteger(count) || count < 0 || count > (e.holdings[id] || 0)) throw new Error("Unbacked consumption");
    e.holdings[id] = (e.holdings[id] || 0) - count;
    e.flows.consumed[id] = (e.flows.consumed[id] || 0) + count;
  }
  for (const [id, count] of Object.entries(rewards)) {
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid production");
    e.holdings[id] = (e.holdings[id] || 0) + count;
    e.flows.created[id] = (e.flows.created[id] || 0) + count;
  }
  e.flows.coinFaucets += income; e.flows.coinSinks += cost;
  e.bankValue += earned - spent;
  e.earned = integer(e.earned + earned); e.spent = integer(e.spent + spent);
  valueBank(user, market);
  e.recordedFrom ??= date.getTime();
  if (details.kills > 0 || details.actions > 0) e.lastActivityAt = date.getTime();
  e.lastSession = { ...details, earned, spent, net: earned - spent, timestamp: date.getTime() };
}
const METHOD_INDEX = new Map([...new Set(METHODS.map(m => m.skill))].map(skill => [skill, METHODS.filter(m => m.skill === skill)]));
const basketValue = (basket, market) => Object.entries(basket).reduce((sum, [id, n]) => sum + n * priceOf(market, id), 0);
export function selectMethod(user, skill, market) {
  const methods = METHOD_INDEX.get(skill) || [];
  let best, score = -Infinity;
  for (const m of methods) {
    if (m.preparation || (user.skills[skill]?.level || 1) < m.level) continue;
    const current = methodScore(m);
    if (current > score) { best = m; score = current; }
  }
  if (best) {
    const preparation = methods.find(m => m.preparation && Object.keys(m.outputs).some(id => best.inputs[id] && !(user.economy?.holdings?.[id] > 0))
      && Object.entries(m.inputs).every(([id,n]) => user.economy?.holdings?.[id] >= n));
    if (preparation) return preparation;
  }
  return best;
  function methodScore(m) {
    const inputCost = basketValue(m.inputs, market);
    const profit = (basketValue(m.outputs, market) + m.coins - inputCost) * m.rate;
    const owned = Object.entries(m.inputs).every(([id, n]) => (user.economy?.holdings?.[id] || 0) >= n);
    const affordable = owned || restockUnitCost(user, m.inputs, market) <= (user.economy?.cash || 0) * 0.25;
    // XP goals lead. Price signals break close choices, never overpower a skill's
    // training rate; illiquid bank estimates cannot fund a recipe.
    return m.rate * m.xp * (1 + 0.15 * Math.tanh(profit / 100000)) * (affordable ? 1 : 0.01);
  }
}
export function methodOpportunity(user, skill, market) {
  const m = selectMethod(user, skill, market);
  if (!m) return 1;
  const net = basketValue(m.outputs, market) + m.coins - basketValue(m.inputs, market);
  const original = basketValue(m.outputs) + m.coins - basketValue(m.inputs);
  return clamp(1 + (net - original) * m.rate / Math.max(30000, Math.abs(original) * m.rate), 0.9, 1.1);
}
// A deliberately authored supply service, separate from the player GE. It
// supplies consumable recipe/PvM inputs only, never equipment or rare rewards.
// The opening-price floor prevents cheap-market -> alchemy coin arbitrage.
export const restockPrice = (market, id) => Math.ceil(Math.max(priceOf(market, id) * 1.1, priceOf(null, id) * 1.25));
function restockUnitCost(user, inputs, market) {
  return Object.entries(inputs).reduce((sum, [id, n]) => sum + Math.max(0, n - (user.economy?.holdings?.[id] || 0)) * restockPrice(market, id), 0);
}
const renewableOutputs = new Set([
  ...METHODS.flatMap(m => Object.keys(m.outputs)),
  ...BOSSES.flatMap(boss => bossDropTable(boss).filter(d => !d.rare).map(d => String(d.id))),
]);
function restockInputs(user, inputs, planned, market) {
  const e = user.economy;
  const costFor = actions => Object.entries(inputs).reduce((sum, [id, n]) => sum + Math.max(0, actions * n - (e.holdings[id] || 0)) * restockPrice(market, id), 0);
  // A small closed population cannot guarantee a buyer for gathered supplies.
  // Liquidate only renewable surplus needed to fund this session, at a discount.
  // This is an explicit item sink/coin faucet, never a fabricated GE fill.
  const target = costFor(planned) * 4;
  const limit = costFor(planned);
  let received = 0, disposed = 0;
  for (const [id, held] of Object.entries(e.holdings)) {
    if (e.cash >= target || received >= limit) break;
    if (!renewableOutputs.has(id) || inputs[id]) continue;
    const surplus = Math.max(0, held - (e.inputReserve?.[id] || 0));
    const quote = Math.max(1, Math.floor(Math.min(priceOf(market, id), priceOf(null, id)) * 0.6));
    const count = Math.min(surplus, Math.ceil(Math.min(target - e.cash, limit - received) / quote));
    if (!count) continue;
    const coins = count * quote;
    e.liquidation ||= { received: 0, items: {} };
    e.liquidation.received += coins;
    e.liquidation.items[id] = (e.liquidation.items[id] || 0) + count;
    e.holdings[id] -= count;
    e.flows.consumed[id] = (e.flows.consumed[id] || 0) + count;
    e.flows.coinFaucets += coins;
    e.cash += coins;
    e.bankValue += coins - count * priceOf(market, id);
    received += coins;
    disposed += count * priceOf(market, id);
  }
  const budget = Math.floor(e.cash * 0.25);
  // Buy complete bundles. Buying only food while lacking potions strands cash.
  let low = 0, high = planned;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (costFor(mid) <= budget) low = mid; else high = mid - 1;
  }
  let cost = 0, acquired = 0;
  e.restock ||= { spent: 0, items: {} };
  for (const [id, n] of Object.entries(inputs)) {
    const count = Math.max(0, low * n - (e.holdings[id] || 0));
    if (!count) continue;
    cost += count * restockPrice(market, id);
    acquired += count * priceOf(market, id);
    e.holdings[id] = (e.holdings[id] || 0) + count;
    e.flows.created[id] = (e.flows.created[id] || 0) + count;
    e.restock.items[id] = (e.restock.items[id] || 0) + count;
  }
  e.cash -= cost;
  // Inventory purchases are transfers of value; only premiums/discounts are
  // economic losses. Recipe consumption records the used item value separately.
  e.spent += cost - acquired + disposed - received;
  e.flows.coinSinks += cost;
  e.restock.spent += cost;
  e.bankValue += acquired - cost;
  valueBank(user, market);
  return { cost, acquired, received, disposed };
}
function recordRestock(session, restock) {
  session.restockCost = restock.cost;
  session.restockValue = restock.acquired;
  session.liquidationReceived = restock.received;
  session.liquidationValue = restock.disposed;
  session.spent += restock.cost - restock.acquired + restock.disposed - restock.received;
  session.net += restock.acquired - restock.cost + restock.received - restock.disposed;
}
function requestInputs(user, inputs, actions) {
  const e = user.economy;
  e.inputReserve ||= {};
  e.needs ||= {};
  for (const [id, count] of Object.entries(inputs)) {
    e.inputReserve[id] = Math.max(e.inputReserve[id] || 0, Math.ceil(actions * count));
    e.needs[id] = Math.max(0, e.inputReserve[id] - (e.holdings[id] || 0));
  }
}
export function bossDropTable(boss) {
  if (boss.drops) return boss.drops;
  const [common, rare] = BOSS_ITEMS[boss.key] || [];
  const rareTable = RARE_ITEMS[boss.key] || (rare ? [[rare, 1]] : []);
  return [
    { id: common, quantity: Math.max(1, Math.floor(boss.loot / priceOf(null, common))), chance: 1 },
    ...rareTable.map(([id, weight]) => ({ id, quantity: 1, chance: boss.rareChance * weight / rareTable.reduce((sum, row) => sum + row[1], 0), rare: true }))];
}
export function rollBossDrops(boss, kills, rng) {
  const table = bossDropTable(boss), rewards = {};
  const grant = (entry, n) => { if (n) rewards[entry.id] = (rewards[entry.id] || 0) + n * entry.quantity; };
  for (const entry of table.filter(d => !d.rare)) grant(entry, entry.chance === 1 ? kills : rareDrops(kills, entry.chance, rng));
  // One rare-table roll per kill prevents multiple raid purples or crystals from
  // a single kill. Geometric waiting gaps avoid a loop for every kill.
  const rares = table.filter(d => d.rare), chance = rares.reduce((sum, d) => sum + d.chance, 0);
  const drops = chance ? rareDrops(kills, chance, rng) : 0;
  for (let i = 0; i < drops; i++) grant(weighted(rares, entry => entry.chance, rng), 1);
  return { rewards, drops };
}
export const activityScale = scale => Math.sqrt(clamp(Number(scale) || 1, 1, 31));

export function progressBossing(user, date, { hours, rng, market, scale = 1 }) {
  normalizeCareer(user);
  const gains = {};
  if (!(hours > 0)) return { trainingHours: 0, gains, active: false };
  valueBank(user, market);
  const eligible = eligibleBosses(user).filter(boss => user.economy.bankValue >= boss.cost * 2);
  const inclination = ({ PVMER: 0.72, HARDCORE: 0.42, ELITE_GRINDER: 0.45, IRON_SOUL: 0.45, SKILLER: 0.015, IDLER: 0.04, SOCIALITE: 0.06 })[user.archetype] ?? 0.16;
  // A shared daily appetite plus persistent personal taste: streaks and goals,
  // rather than independently choosing every boss on every tick.
  const daily = seeded(`${date.toISOString().slice(0,10)}:${user.career.favoriteBoss}`);
  const appetite = 0.75 + daily() * 0.5;
  if (!eligible.length || rng() >= inclination * appetite) return { trainingHours: hours, gains, active: false };
  const boss = weighted(eligible, boss => {
    const familiarity = Math.log1p(user.bosses[boss.key]) / 10;
    const preference = boss.key === user.career.favoriteBoss ? 3 + 4 * user.career.dedication : 1;
    const challenge = 1 + user.career.risk * (boss.combat - 45) / 45;
    const table = bossDropTable(boss);
    const revenue = table.reduce((sum, drop) => sum + priceOf(market, drop.id) * drop.quantity * drop.chance, 0);
    const supplies = basketValue(boss.supplies || {385: 2, 2434: 1}, market);
    return preference * challenge * (1 + familiarity) * clamp(1 + (revenue - supplies) * boss.killsPerHour / 500000, 0.85, 1.15);
  }, rng);
  // Bossing consumes this session's time; it does not run alongside a full XP session.
  const bossHours = hours * (0.6 + rng() * 0.4);
  const pace = activityScale(scale);
  const effectiveHours = bossHours * pace;
  const gear = 0.4 + 0.6 * Math.min(1, equipped(user).reduce((sum, item) => sum + item.power, 0) / 130);
  const experience = 0.65 + 0.35 * (1 - Math.exp(-user.bosses[boss.key] / 300));
  const level = 0.65 + 0.35 * clamp((combatLevel(user.skills) - boss.combat) / 25, 0, 1);
  const efficiency = user.career.aptitude * gear * experience * level * clamp(lognormal(rng, 0.18), 0.5, 1.5);
  const planned = Math.min(1000, poisson(boss.killsPerHour * effectiveHours * efficiency, rng));
  const supplies = boss.supplies || {385: 2, 2434: 1};
  requestInputs(user, supplies, Math.max(1, planned) * 2);
  const restock = restockInputs(user, supplies, planned, market);
  const kills = Math.min(planned, ...Object.entries(supplies).map(([id, count]) => Math.floor((user.economy.holdings[id] || 0) / count)));
  if (!kills) return { trainingHours: hours, gains, active: false };
  const deaths = Math.min(10, poisson(effectiveHours * kills / planned * (0.08 + user.career.risk * 0.18) * (1.2 - experience), rng));
  const { rewards, drops } = rollBossDrops(boss, kills, rng);
  if (supplies[2434]) rewards[229] = (rewards[229] || 0) + supplies[2434] * kills;
  const consumed = Object.fromEntries(Object.entries(supplies).map(([id, count]) => [id, count * kills]));
  const cost = deaths * Math.min(500000, Math.floor(user.economy.bankValue * 0.005));
  user.bosses[boss.key] = integer(user.bosses[boss.key] + kills);
  user.economy.rareDrops = integer(user.economy.rareDrops + drops);
  user.economy.deaths = integer(user.economy.deaths + deaths);
  const combatSkill = ["attack", "strength", "defence", "ranged", "magic"][Math.min(4, Math.floor(rng() * 5))];
  gains[combatSkill] = kills * boss.hp * 4 / pace;
  gains.hitpoints = kills * boss.hp * 4 / (3 * pace);
  if (boss.slayer) gains.slayer = kills * boss.hp / pace;
  settle(user, 0, cost, { activity: "bossing", boss: boss.key, kills, rareDrops: drops, deaths, hours: bossHours, activityScale: pace }, date, market, rewards, consumed);
  recordRestock(user.economy.lastSession, restock);
  // Partial supplies consume only the time spent on actual kills.
  const usedHours = bossHours * kills / planned;
  user.economy.lastSession.hours = usedHours;
  return { trainingHours: hours - usedHours, gains, active: true };
}
// Funding is determined by physical inputs. No XP for an unfunded recipe.
export function skillingFunding(user, skill, hours, market) {
  const m = selectMethod(user, skill, market);
  if (!m || !Object.keys(m.inputs).length) return 1;
  const planned = Math.max(1, Math.floor(m.rate * hours));
  return Math.min(1, ...Object.entries(m.inputs).map(([id, count]) => Math.floor((user.economy.holdings?.[id] || 0) / count) / planned));
}
export function progressSkillingEconomy(user, date, { skill, hours, market, append = false, earnCash = false }) {
  if (!(hours > 0) || !skill) return { xp: 0, modeled: false };
  valueBank(user, market);
  const m = earnCash ? (METHOD_INDEX.get(skill) || []).find(m => m.coins > 0 && !Object.keys(m.inputs).length
    && m.level <= user.skills[skill].level) : selectMethod(user, skill, market);
  if (!m) return { xp: 0, modeled: false };
  const planned = Math.floor(m.rate * hours * user.career.aptitude);
  // Keep boss supply requests alongside the next training batch.
  requestInputs(user, m.inputs, Math.max(1, planned) * 2);
  const restock = restockInputs(user, m.inputs, planned, market);
  const actions = Math.min(planned, ...Object.entries(m.inputs).map(([id, count]) => Math.floor((user.economy.holdings[id] || 0) / count)));
  const rewards = Object.fromEntries(Object.entries(m.outputs).map(([id, count]) => [id, count * actions]));
  const consumed = Object.fromEntries(Object.entries(m.inputs).map(([id, count]) => [id, count * actions]));
  const previous = append ? user.economy.lastSession : null;
  settle(user, actions * m.coins, 0, { activity: "skilling", skill, method: m.name, actions, hours }, date, market, rewards, consumed);
  recordRestock(user.economy.lastSession, restock);
  if (previous) {
    const current = user.economy.lastSession;
    user.economy.lastSession = { ...previous, trainingSkill: skill, trainingHours: hours, earned: previous.earned + current.earned, spent: previous.spent + current.spent, net: previous.net + current.net, restockCost: (previous.restockCost || 0) + restock.cost, restockValue: (previous.restockValue || 0) + restock.acquired, liquidationReceived: (previous.liquidationReceived || 0) + restock.received, liquidationValue: (previous.liquidationValue || 0) + restock.disposed };
  }
  return { xp: Math.floor(actions * m.xp), modeled: true, actions, preparation: !!m.preparation };
}
