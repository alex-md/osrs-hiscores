import { BOSSES, MAX_BANK_VALUE } from "../../frontend/lib/activities.js";
import { combatLevel } from "../../frontend/lib/domain.js";

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
// per-kill loop, per-drop document, market API, or growing transaction history.
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
function settle(user, income, cost, details, date) {
  const economy = user.economy;
  const earned = integer(income);
  const spent = Math.min(integer(cost), economy.bankValue + earned);
  economy.bankValue = integer(economy.bankValue + earned - spent);
  economy.earned = integer(economy.earned + earned);
  economy.spent = integer(economy.spent + spent);
  economy.recordedFrom ??= date.getTime();
  economy.lastSession = { ...details, earned, spent, net: earned - spent, timestamp: date.getTime() };
}
export function progressBossing(user, date, { hours, scale, rng }) {
  normalizeCareer(user);
  const gains = {};
  if (!(hours > 0)) return { trainingHours: 0, gains, active: false };
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
    return preference * challenge * (1 + familiarity);
  }, rng);
  // Bossing consumes this session's time; it does not run alongside a full XP session.
  const bossHours = hours * (0.6 + rng() * 0.4);
  const acceleratedHours = bossHours * scale;
  const gear = 0.4 + 0.6 * Math.min(1, Math.log1p(user.economy.bankValue / 100000) / Math.log(1001));
  const experience = 0.65 + 0.35 * (1 - Math.exp(-user.bosses[boss.key] / 300));
  const level = 0.65 + 0.35 * clamp((combatLevel(user.skills) - boss.combat) / 25, 0, 1);
  const efficiency = user.career.aptitude * gear * experience * level * clamp(lognormal(rng, 0.18), 0.5, 1.5);
  const kills = Math.min(1000, poisson(boss.killsPerHour * acceleratedHours * efficiency, rng));
  const deaths = Math.min(10, poisson(acceleratedHours * (0.08 + user.career.risk * 0.18) * (1.2 - experience), rng));
  const drops = rareDrops(kills, boss.rareChance, rng);
  const income = kills * boss.loot * clamp(lognormal(rng, 0.35), 0.25, 3) + drops * boss.rareValue * clamp(lognormal(rng, 0.4), 0.3, 4);
  const cost = kills * boss.cost * (1.2 - user.career.thrift * 0.35) + deaths * Math.min(500000, user.economy.bankValue * 0.005);
  user.bosses[boss.key] = integer(user.bosses[boss.key] + kills);
  user.economy.rareDrops = integer(user.economy.rareDrops + drops);
  user.economy.deaths = integer(user.economy.deaths + deaths);
  const combatSkill = ["attack", "strength", "defence", "ranged", "magic"][Math.min(4, Math.floor(rng() * 5))];
  gains[combatSkill] = kills * boss.hp * 4;
  gains.hitpoints = kills * boss.hp * 4 / 3;
  if (boss.slayer) gains.slayer = kills * boss.hp;
  settle(user, income, cost, { activity: "bossing", boss: boss.key, kills, rareDrops: drops, deaths, hours: bossHours, scale }, date);
  return { trainingHours: hours - bossHours, gains, active: true };
}
const SKILL_INCOME = { fishing: 150000, mining: 180000, woodcutting: 90000, thieving: 300000, hunter: 220000, runecraft: 280000, farming: 180000, slayer: 160000, sailing: 160000, agility: 30000 };
const SKILL_COST = { construction: 1200000, herblore: 700000, prayer: 900000, crafting: 300000, smithing: 180000, fletching: 100000, firemaking: 60000, cooking: 30000, magic: 100000, sailing: 60000 };
export function skillingFunding(user, skill, hours, scale) {
  const fullCost = (SKILL_COST[skill] || 5000) * hours * scale * (1.2 - user.career.thrift * 0.5);
  // Poorer accounts use slower, cheaper methods rather than receiving expensive
  // buyable-skill rates after their bank has run out. Never borrow below zero.
  return fullCost > 0 ? 0.2 + 0.8 * Math.min(1, user.economy.bankValue / fullCost) : 1;
}
export function progressSkillingEconomy(user, date, { skill, hours, scale, rng, append = false }) {
  if (!(hours > 0) || !skill) return;
  const level = user.skills[skill].level;
  const efficiency = 0.15 + 0.85 * (level / 99) ** 1.5;
  const rate = clamp(lognormal(rng, 0.25), 0.3, 3);
  const earned = (SKILL_INCOME[skill] || 15000) * hours * scale * efficiency * rate;
  const spent = (SKILL_COST[skill] || 5000) * hours * scale * (1.2 - user.career.thrift * 0.5);
  const previous = append ? user.economy.lastSession : null;
  settle(user, earned, spent, { activity: "skilling", skill, hours, scale }, date);
  if (previous) {
    const current = user.economy.lastSession;
    user.economy.lastSession = { ...previous, trainingSkill: skill, trainingHours: hours, earned: previous.earned + current.earned, spent: previous.spent + current.spent, net: previous.net + current.net };
  }
}
