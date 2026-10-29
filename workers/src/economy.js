import { BOSSES, MAX_BANK_VALUE } from "../../frontend/lib/activities.js";
import { combatLevel } from "../../frontend/lib/domain.js";
import { priceOf, SKILL_ITEMS, BOSS_ITEMS, RARE_ITEMS } from "./market.js";
import baseline from "../data/ge-baseline.js";

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
      const quantity = Math.floor(before * 0.0875 / priceOf(null, id));
      e.holdings[id] = (e.holdings[id] || 0) + quantity;
      e.cash -= quantity * priceOf(null, id);
    }
    e.revaluation = 0;
  }
  if (e.inventoryVersion !== 2) {
    let remainder = 0;
    for (const [id, count] of Object.entries(e.holdings)) {
      const whole = Math.max(0, Math.floor(Number(count) || 0));
      remainder += Math.max(0, (Number(count) || 0) - whole) * priceOf(null, id);
      e.holdings[id] = whole;
    }
    e.cash = Math.max(0, Math.round((e.cash || 0) + remainder));
    e.inventoryVersion = 2;
    e.migration = { fractionalValueConverted: Math.round(remainder) };
  }
  e.flows ||= { created: {}, consumed: {}, coinFaucets: 0, coinSinks: 0, capSink: 0 };
  let modeled = e.cash + Object.entries(e.holdings).reduce((sum, [id, count]) => sum + count * priceOf(null, id), 0);
  // Explicit integer asset sink at the safety ceiling, never proportional fractions.
  if (modeled > MAX_BANK_VALUE) {
    const cashSink = Math.min(e.cash, modeled - MAX_BANK_VALUE);
    e.cash -= cashSink; modeled -= cashSink; e.flows.capSink += cashSink;
    for (const [id, count] of Object.entries(e.holdings)) {
      if (modeled <= MAX_BANK_VALUE) break;
      const removed = Math.min(count, Math.ceil((modeled - MAX_BANK_VALUE) / priceOf(null, id)));
      e.holdings[id] -= removed; modeled -= removed * priceOf(null, id);
      e.flows.consumed[id] = (e.flows.consumed[id] || 0) + removed;
      e.flows.capSink += removed * priceOf(null, id);
    }
  }
  e.bankValue = modeled;
  e.revaluation = (e.revaluation || 0) + modeled - before;
  e.pricing = { source: "Fixed item catalog", capturedAt: null, status: "fixed" };
}
// Session costs are accounting estimates. They never limit XP or kill counts.
// Pay with cash, then redeem whole items at their fixed catalog value. Any change
// stays as cash; an exhausted bank pays only what it owns and never borrows.
function settle(user, income, cost, details, date, market, rewards = {}) {
  const e = user.economy;
  income = integer(income);
  const earned = income + Object.entries(rewards).reduce((sum, [id, n]) => sum + n * priceOf(null, id), 0);
  e.cash += income;
  e.flows.coinFaucets += income;
  for (const [id, n] of Object.entries(rewards)) {
    if (!Number.isSafeInteger(n) || n < 0) throw new Error("Invalid production");
    e.holdings[id] = (e.holdings[id] || 0) + n;
    e.flows.created[id] = (e.flows.created[id] || 0) + n;
  }
  const spent = Math.min(integer(cost), e.bankValue + earned);
  for (const [id, held] of Object.entries(e.holdings)) {
    if (e.cash >= spent) break;
    const price = priceOf(null, id);
    const n = Math.min(held, Math.ceil((spent - e.cash) / price));
    e.holdings[id] -= n;
    e.flows.consumed[id] = (e.flows.consumed[id] || 0) + n;
    e.cash += n * price;
    e.flows.coinFaucets += n * price;
  }
  e.cash -= spent;
  e.flows.coinSinks += spent;
  e.bankValue += earned - spent;
  e.earned = integer(e.earned + earned);
  e.spent = integer(e.spent + spent);
  valueBank(user);
  e.recordedFrom ??= date.getTime();
  e.lastActivityAt = date.getTime();
  e.lastSession = { ...details, earned, spent, net: earned - spent, timestamp: date.getTime() };
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
  const eligible = eligibleBosses(user);
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
    return preference * challenge * (1 + familiarity);
  }, rng);
  // Bossing consumes this session's time; it does not run alongside a full XP session.
  const bossHours = hours * (0.6 + rng() * 0.4);
  const pace = activityScale(scale);
  const effectiveHours = bossHours * pace;
  const gear = 0.4 + 0.6 * Math.min(1, Math.log1p(user.economy.bankValue / 100000) / Math.log(1001));
  const experience = 0.65 + 0.35 * (1 - Math.exp(-user.bosses[boss.key] / 300));
  const level = 0.65 + 0.35 * clamp((combatLevel(user.skills) - boss.combat) / 25, 0, 1);
  const efficiency = user.career.aptitude * gear * experience * level * clamp(lognormal(rng, 0.18), 0.5, 1.5);
  const planned = Math.min(1000, poisson(boss.killsPerHour * effectiveHours * efficiency, rng));
  const kills = planned;
  if (!kills) return { trainingHours: hours, gains, active: false };
  const deaths = Math.min(10, poisson(effectiveHours * kills / planned * (0.08 + user.career.risk * 0.18) * (1.2 - experience), rng));
  const { rewards, drops } = rollBossDrops(boss, kills, rng);
  const cost = kills * boss.cost * (1.2 - user.career.thrift * 0.35)
    + deaths * Math.min(500000, Math.floor(user.economy.bankValue * 0.005));
  user.bosses[boss.key] = integer(user.bosses[boss.key] + kills);
  user.economy.rareDrops = integer(user.economy.rareDrops + drops);
  user.economy.deaths = integer(user.economy.deaths + deaths);
  const combatSkill = ["attack", "strength", "defence", "ranged", "magic"][Math.min(4, Math.floor(rng() * 5))];
  gains[combatSkill] = kills * boss.hp * 4 / pace;
  gains.hitpoints = kills * boss.hp * 4 / (3 * pace);
  if (boss.slayer) gains.slayer = kills * boss.hp / pace;
  settle(user, 0, cost, { activity: "bossing", boss: boss.key, kills, rareDrops: drops, deaths, hours: bossHours, activityScale: pace }, date, market, rewards);
  return { trainingHours: hours - bossHours, gains, active: true };
}
const SKILL_INCOME = { fishing: 150000, mining: 180000, woodcutting: 90000, thieving: 300000, hunter: 220000, runecraft: 280000, farming: 180000, slayer: 160000, sailing: 160000, agility: 30000 };
const SKILL_COST = { construction: 1200000, herblore: 700000, prayer: 900000, crafting: 300000, smithing: 180000, fletching: 100000, firemaking: 60000, cooking: 30000, magic: 100000, sailing: 60000 };
export function progressSkillingEconomy(user, date, { skill, hours, rng = Math.random, market, append = false }) {
  if (!(hours > 0) || !skill) return;
  valueBank(user, market);
  const level = user.skills[skill].level;
  const efficiency = 0.15 + 0.85 * (level / 99) ** 1.5;
  const rate = clamp(lognormal(rng, 0.25), 0.3, 3);
  const earned = (SKILL_INCOME[skill] || 15000) * hours * efficiency * rate;
  const spent = (SKILL_COST[skill] || 5000) * hours * (1.2 - user.career.thrift * 0.5);
  const item = SKILL_ITEMS[skill];
  const previous = append ? user.economy.lastSession : null;
  settle(user, item ? 0 : earned, spent, { activity: "skilling", skill, hours }, date, market, item ? { [item]: Math.floor(earned / priceOf(null, item)) } : {});
  if (previous) {
    const current = user.economy.lastSession;
    user.economy.lastSession = { ...previous, trainingSkill: skill, trainingHours: hours, earned: previous.earned + current.earned, spent: previous.spent + current.spent, net: previous.net + current.net };
  }
}
