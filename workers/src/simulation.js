import { arrivals, cleanupPopulation, populationPolicy } from "./population.js";
import { activityScale, normalizeCareer, progressBossing, progressSkillingEconomy, selectMethod, valueBank } from "./economy.js";
import { clearExchange, exchangeMarket } from "./exchange.js";
import { advanceTrainingClimate, personalTraining } from "./training-dynamics.js";
import { windowXpScale } from "./xp-schedule.js";
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
  computeHitpointsLevelFromCombat,
  xpForLevel,
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
  const hp = computeHitpointsLevelFromCombat(skills);
  skills.hitpoints = { xp: xpForLevel(hp), level: hp };
  const xpGainTier = determineXpGainTierFromTotal(totalXP(skills));
  const now = Date.now();
  return normalizeUser({
    username,
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
}
export function progressUser(
  user,
  date = new Date(),
  { hours = TICK_HOURS, rng = Math.random, market, climate } = {},
) {
  normalizeCareer(user);
  user.economy.needs = {};
  user.economy.inputReserve = {};
  user.xpGainTier = determineXpGainTierFromTotal(user.totalXP);
  user.archetype ||= "CASUAL";
  user.multipliers ||= buildSkillMultipliers(user.archetype, user.xpGainTier);
  user.activity = chooseActivityForUser(user.archetype, user.xpGainTier);
  const [min, max] = SESSION_FRACTIONS[user.activity];
  const duration =
    Math.max(0, Math.min(TICK_HOURS, hours)) * (min + rng() * (max - min));
  const scale = Math.max(6, Math.min(31, windowXpScale(date, hours) * (climate?.factor || 1)));
  const personal = personalTraining(user, { hours: Math.max(0, Math.min(TICK_HOURS, hours)), activeHours: duration, rng, climate, market });
  const bossing = progressBossing(user, date, { hours: duration, rng, market, scale });
  const gains = {};
  const add = (skill, xp) => {
    const before = user.skills[skill].xp;
    user.skills[skill].xp = Math.min(200_000_000, before + Math.floor(xp));
    user.skills[skill].level = levelFromXp(user.skills[skill].xp);
    gains[skill] = (gains[skill] || 0) + user.skills[skill].xp - before;
  };
  for (const [skill, xp] of Object.entries(bossing.gains)) add(skill, xp * scale * personal.multiplier);
  let skill = personal.skill;
  if (bossing.trainingHours > 0 && skill) {
    let work = progressSkillingEconomy(user, date, { skill, hours: bossing.trainingHours * activityScale(scale), market, rng, append: bossing.active });
    if (work.modeled && !work.actions && !work.preparation) {
      // A stalled goal yields to a useful session, rather than idling for hours
      // on an unavailable recipe. Thieving rebuilds spendable cash, not paper wealth.
      const alternatives = SKILLS.filter(s => s !== "hitpoints" && user.skills[s].xp < 200_000_000
        && (!selectMethod(user, s, market) || !Object.keys(selectMethod(user, s, market).inputs).length));
      skill = user.skills.thieving.xp < 200_000_000 ? "thieving"
        : alternatives[Math.min(alternatives.length - 1, Math.floor(rng() * alternatives.length))] || "thieving";
      user.trainingState.remaining = 0;
      work = progressSkillingEconomy(user, date, { skill, hours: bossing.trainingHours * activityScale(scale), market, rng, append: bossing.active, earnCash: skill === "thieving" });
    }
    const stat = user.skills[skill];
    const skillScale = climate?.focusSkill === skill ? climate.skillFactor : 1;
    const gain = work.modeled
      ? work.xp * scale / activityScale(scale) * personal.multiplier * skillScale
      : expectedRate(skill, stat.xp, stat.level) * bossing.trainingHours * scale * personal.multiplier * skillScale;
    add(skill, gain);
    if (["attack", "strength", "defence", "ranged"].includes(skill))
      add("hitpoints", gain / 3);
    if (skill === "slayer") {
      const combat = ["attack", "strength", "defence", "ranged"][
        Math.floor(rng() * 4)
      ];
      add(combat, gain * 2);
      add("hitpoints", (gain * 2) / 3);
    }
  }
  const gainedXP = Object.values(gains).reduce((a, b) => a + b, 0);
  if (gainedXP > 0) {
    const previous = user.progress || {};
    const day = date.toISOString().slice(0, 10);
    user.progress = {
      sessions: (previous.sessions || 0) + 1,
      earnedXP: (previous.earnedXP || 0) + gainedXP,
      day,
      dayXP: (previous.day === day ? previous.dayXP || 0 : 0) + gainedXP,
      bestSessionXP: Math.max(previous.bestSessionXP || 0, gainedXP),
      lastSession: {
        skill: bossing.active ? "bossing" : skill,
        trainingSkill: skill,
        hours: duration,
        trainingHours: bossing.trainingHours,
        xpScale: scale,
        personalScale: personal.multiplier,
        skillScale: climate?.focusSkill === skill ? climate.skillFactor : 1,
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
  user.totalLevel = totalLevel(user.skills);
  user.totalXP = totalXP(user.skills);
  user.version = 5;
  return user;
}
export async function runScheduled(env) {
  await reserveUpdate(env);
  let users = await allUsers(env);
  const existing = new Set(users.map((u) => u.username.toLowerCase()));
  const changed = [];
  const previous = await readJSON(env, "system:last-run");
  const date = new Date(Date.now());
  const previousExchange = await readJSON(env, "system:exchange", {});
  const market = exchangeMarket(previousExchange);
  const climate = advanceTrainingClimate(await readJSON(env, "system:training-climate"), date);
  await writeJSON(env, "system:training-climate", climate);
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
  for (const user of users) {
    const before = JSON.stringify(user);
    valueBank(user, market);
    progressUser(user, date, { hours, market, climate });
    if (JSON.stringify(user) !== before) changed.push(user);
  }
  const count = users.length;
  const newCount = arrivals(users.length, MAX_PLAYERS);
  for (const username of await generateUsernames(newCount, existing, env)) {
    const user = newUser(username);
    users.push(user);
    changed.push(user);
  }
  const exchange = clearExchange(users, date, previousExchange, { hours });
  await writeJSON(env, "system:exchange", exchange);
  const snapshot = await publishSnapshot(env, users);
  const result = {
    processed: count,
    newUsers: newCount,
    removedPlayers: cleanup.removed.length,
    totalPlayers: users.length,
    generatedAt: snapshot.generatedAt,
    simulatedHours: hours,
    changedPlayers: changed.length,
    pricing: { status: market.status, capturedAt: market.capturedAt || null },
  };
  await writeJSON(env, "system:last-run", result);
  return result;
}
