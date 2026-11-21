import { loadGameCatalog } from './game-catalog.js';
import { festivalWeek, recordFestival, discoveryCount, bossCount, rollRelic } from './festival.js';
import { advanceEconomy, economyFrame } from './market.js';
import { trainingBenefits } from './wealth-progression.js';
import { tradeRares } from './rare-trading.js';
import { adoptExpandedCareer, careerPhase } from './archetypes.js';
import { isRestDay } from './engagement.js';
import { arrivals, cleanupPopulation, populationPolicy } from "./population.js";
import { activityScale, BUYABLE_SKILLS, spendableBank, normalizeCareer, progressBossing, progressClues, progressSkillingEconomy, valueBank } from "./economy.js";
import { advanceTrainingClimate, personalTraining } from "./training-dynamics.js";
import { windowXpScale, MIN_XP_SCALE, MAX_XP_SCALE } from "./xp-schedule.js";
import { MAX_PLAYERS } from "../../frontend/lib/simulation-config.js";
import { reserveUpdate } from "./budget.js";
import {
  TICK_HOURS,
  SESSION_FRACTIONS,
  expectedRate,
} from "./training.js";
import { SKILLS } from "./constants.js";
import {
  sampleInitialTotalXP,
  assignArchetypeForTotalXP,
  distributeInitialXP,
  repairCombatProgression,
  DAMAGE_SKILLS,
  determineXpGainTierFromTotal,
  buildSkillMultipliers,
  chooseActivityForUser,
  levelFromXp,
  totalLevel,
  totalXP,
} from "./utils.js";
import { allUsers, normalizeUser, writeJSON, readJSON } from "./store.js";
import { publishSnapshot } from "./snapshots.js";

export { generateUsername } from "./usernames.js";
import { generateUsernames } from "./usernames.js";
export function newUser(username) {
  const initialXP = sampleInitialTotalXP();
  const archetype = assignArchetypeForTotalXP(initialXP);
  const allocation = distributeInitialXP(initialXP, Math.random, archetype);
  const skills = Object.fromEntries(
    SKILLS.map((s) => [
      s,
      { xp: allocation[s] || 0, level: levelFromXp(allocation[s] || 0) },
    ]),
  );
  skills.hitpoints = { xp: 1154, level: 10 };
  const initial = { skills };
  repairCombatProgression(initial);
  const xpGainTier = determineXpGainTierFromTotal(totalXP(skills));
  const now = Date.now();
  const user = normalizeUser({
    username,
    progressionRulesVersion: 1,
    skills,
    archetype,
    xpGainTier,
    multipliers: buildSkillMultipliers(archetype, xpGainTier),
    createdAt: now,
    updatedAt: now,
    activity: "INACTIVE",
    achievements: {},
    version: 5,
  });
  user.career.identityVersion = 2;
  return user;
}
export function progressUser(
  user,
  date = new Date(),
  { hours = TICK_HOURS, rng = Math.random, climate, market } = {},
) {
  const festival = festivalWeek(+date);
  climate = { ...climate, festivalSkill: festival.skill };
  const beforeDiscoveries = discoveryCount(user), beforeKC = bossCount(user);
  normalizeCareer(user);
  adoptExpandedCareer(user, date);
  user.xpGainTier = determineXpGainTierFromTotal(user.totalXP);
  user.archetype ||= "CASUAL";
  user.multipliers ||= buildSkillMultipliers(user.archetype, user.xpGainTier);
  user.restDay = isRestDay(user, date);
  user.activity = user.restDay ? "INACTIVE" : chooseActivityForUser(user.archetype, user.xpGainTier, user.career.dedication);
  // Retire the obsolete pre-climate goal representation.
  delete user.goal;
  const phase = careerPhase(user, date);
  if (!user.restDay && phase === "surge" && Math.random() < .75) user.activity = "GRINDING";
  const [min, max] = SESSION_FRACTIONS[user.activity];
  const duration =
    Math.max(0, Math.min(TICK_HOURS, hours)) * (min + rng() * (max - min)) * (phase === "quiet" ? .35 : 1);
  const scale = Math.max(MIN_XP_SCALE, Math.min(MAX_XP_SCALE, windowXpScale(date, hours) * (climate?.factor || 1)));
  const personal = personalTraining(user, { hours: Math.max(0, Math.min(TICK_HOURS, hours)), activeHours: duration, rng, climate });
  const clues = progressClues(user,date,{hours:duration,rng,scale,market});
  const bossing = clues.active ? {active:false,trainingHours:clues.trainingHours,gains:{}} : progressBossing(user, date, { hours: duration, rng, scale, market });
  const gains = {};
  const add = (skill, xp) => {
    const before = user.skills[skill].xp;
    user.skills[skill].xp = Math.min(200_000_000, before + Math.floor(xp));
    user.skills[skill].level = levelFromXp(user.skills[skill].xp);
    gains[skill] = (gains[skill] || 0) + user.skills[skill].xp - before;
    return user.skills[skill].xp - before;
  };
  for (const [skill, xp] of Object.entries(clues.gains)) add(skill, xp * scale * personal.multiplier);
  for (const [skill, xp] of Object.entries(bossing.gains)) add(skill, xp * scale * personal.multiplier);
  let skill = personal.skill;
  valueBank(user, market);
  // Persist the long-term goal, but earn supplies when the method is unfunded.
  if (BUYABLE_SKILLS.has(skill) && spendableBank(user, market) < 1000) skill = ["thieving", "mining", "fishing", "woodcutting", "hunter", "agility"]
    .find(candidate => user.skills[candidate].xp < 200_000_000) || "thieving";
  let trainingFraction = 1;
  const benefits = trainingBenefits(user, skill, bossing.trainingHours, scale);
  if (bossing.trainingHours > 0 && skill) {
    const training = progressSkillingEconomy(user, date, { skill, hours: bossing.trainingHours * activityScale(scale), rng, market, append: bossing.active || clues.active, fundingCost: benefits.fundingCost });
    trainingFraction = training.fraction;
    const stat = user.skills[skill];
    const skillScale = (climate?.focusSkill === skill ? climate.skillFactor : 1) * (festival.skill === skill ? festival.bonus : 1);
    const combat = skill === "slayer" ? DAMAGE_SKILLS[Math.floor(rng() * DAMAGE_SKILLS.length)] : null;
    // A low-level fighter cannot use a high-level Slayer XP rate independently
    // of the damage they can deal. Both rewards come from the same kills.
    const rate = Math.min(expectedRate(skill, stat.xp, stat.level), combat
      ? expectedRate(combat, user.skills[combat].xp, user.skills[combat].level) / 4 : Infinity);
    const gain = add(skill, rate * bossing.trainingHours * trainingFraction * scale * personal.multiplier * skillScale * benefits.multiplier);
    if (["attack", "strength", "defence", "ranged"].includes(skill))
      add("hitpoints", gain / 3);
    if (skill === "slayer") {
      add(combat, gain * 4);
      add("hitpoints", (gain * 4) / 3);
    }
  }
  const gainedXP = Object.values(gains).reduce((a, b) => a + b, 0);
  if (gainedXP > 0) {
    const previous = user.progress || {};
    const day = date.toISOString().slice(0, 10);
    user.progress = {
      ...previous,
      sessions: (previous.sessions || 0) + 1,
      earnedXP: (previous.earnedXP || 0) + gainedXP,
      day,
      dayXP: (previous.day === day ? previous.dayXP || 0 : 0) + gainedXP,
      bestSessionXP: Math.max(previous.bestSessionXP || 0, gainedXP),
      lastSession: {
        skill: clues.active ? "treasure-trails" : bossing.active ? "bossing" : skill,
        boss: bossing.boss || null,
        trainingSkill: skill,
        hours: duration,
        trainingHours: bossing.trainingHours * trainingFraction,
        requestedTrainingSkill: personal.skill,
        fundingFraction: trainingFraction,
        xpScale: scale,
        personalScale: personal.multiplier,
        wealthScale: benefits.multiplier,
        benefits,
        skillScale: (climate?.focusSkill === skill ? climate.skillFactor : 1) * (festival.skill === skill ? festival.bonus : 1),
        festivalSkill: festival.skill,
        trainingPhase: personal.phase,
        gainedXP,
        gains,
        timestamp: date.getTime(),
      },
    };
    user.updatedAt = date.getTime();
  }
  if (duration > 0 && user.economy.lastActivityAt === date.getTime())
    user.updatedAt = date.getTime();
  const completedKills = bossCount(user) - beforeKC;
  if (bossing.active) rollRelic(user, bossing.boss, completedKills, date, rng);
  recordFestival(user, date, { gainedXP, skillXP: gains[festival.skill] || 0, kills: completedKills, discoveries: discoveryCount(user) - beforeDiscoveries });
  user.totalLevel = totalLevel(user.skills);
  user.totalXP = totalXP(user.skills);
  user.version = 5;
  return user;
}
export async function runScheduled(env) {
  const startedAt = Date.now();
  await reserveUpdate(env);
  const published = await readJSON(env, "snapshot:current");
  const loadedCatalog = await loadGameCatalog(env, published?.gameContent);
  await writeJSON(env, "system:catalog", {source:loadedCatalog.source, revision:loadedCatalog.revision || published?.catalogInfo?.revision || 0, ...(loadedCatalog.error ? {error:loadedCatalog.error} : {})});
  let users = await allUsers(env);
  const existing = new Set(users.map((u) => u.username.toLowerCase()));
  const changed = [];
  const previous = await readJSON(env, "system:last-run");
  const date = new Date(Date.now());
  const climate = advanceTrainingClimate(await readJSON(env, "system:training-climate"), date);
  await writeJSON(env, "system:training-climate", climate);
  const market = await readJSON(env, "system:economy");
  const previousTrades = await readJSON(env, "system:rare-trading");
  const policy = populationPolicy(env);
  const previousCleanup = await readJSON(env, "system:population", {});
  let cleanup = { removed: [], retired: { players: 0 } };
  if (!previousCleanup.generatedAt || date.getTime() - previousCleanup.generatedAt >= policy.cleanupIntervalHours * 3600000) {
    for (const user of users) valueBank(user, market);
    cleanup = cleanupPopulation(users, date, policy);
    users = cleanup.users;
    const totals = previousCleanup.retired || { players: 0, cash: 0, bankValue: 0, items: {} };
    for (const key of ["players", "cash", "bankValue"]) totals[key] += cleanup.retired[key];
    for (const [id, n] of Object.entries(cleanup.retired.items)) totals.items[id] = (totals.items[id] || 0) + n;
    await writeJSON(env, "system:population", { generatedAt: date.getTime(), retired: totals, lastRemoved: cleanup.removed.slice(0, 100), policy });
  }
  const hours = previous?.generatedAt
    ? Math.max(
        0,
        Math.min(TICK_HOURS, (date.getTime() - previous.generatedAt) / 3600000),
      )
    : TICK_HOURS;
  for (const user of users) valueBank(user, market);
  const economyBefore = economyFrame(users);
  for (const user of users) {
    const before = JSON.stringify(user);
    valueBank(user, market);
    repairCombatProgression(user, date);
    progressUser(user, date, { hours, climate, market });
    if (JSON.stringify(user) !== before) changed.push(user);
  }
  const economy = advanceEconomy(market, economyBefore, users, date, {hours, stock:previousTrades?.stock});
  const count = users.length;
  const newCount = arrivals(users.length, MAX_PLAYERS);
  for (const username of await generateUsernames(newCount, existing, env)) {
    const user = newUser(username);
    users.push(user);
    changed.push(user);
  }
  const rareTrading = tradeRares(users, date, previousTrades, {hours,market:economy});
  await writeJSON(env, "system:rare-trading", rareTrading);
  for (const user of users) valueBank(user, economy);
  await writeJSON(env, "system:economy", economy);
  const snapshot = await publishSnapshot(env, users);
  const result = {
    processed: count,
    newUsers: newCount,
    removedPlayers: cleanup.removed.length,
    totalPlayers: users.length,
    generatedAt: snapshot.generatedAt,
    simulatedHours: hours,
    changedPlayers: changed.length,
    durationMs: Date.now() - startedAt,
    activePlayers: users.filter(u => u.updatedAt === date.getTime()).length,
    restingPlayers: users.filter(u => u.restDay).length,
    pricing: { status: economy.status, capturedAt: economy.capturedAt },
    rareTrading: rareTrading.summary,
  };
  await writeJSON(env, "system:last-run", result);
  return result;
}
