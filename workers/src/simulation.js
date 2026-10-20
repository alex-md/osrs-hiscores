import { MAX_PLAYERS } from "../../frontend/lib/simulation-config.js";
import { reserveUpdate } from "./budget.js";
import {
  XP_SCALE,
  TICK_HOURS,
  SESSION_FRACTIONS,
  expectedRate,
  chooseTrainingSkill,
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
  weekendBonusMultiplier,
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
  { hours = TICK_HOURS, rng = Math.random } = {},
) {
  user.xpGainTier = determineXpGainTierFromTotal(user.totalXP);
  user.archetype ||= "CASUAL";
  user.multipliers ||= buildSkillMultipliers(user.archetype, user.xpGainTier);
  user.activity = chooseActivityForUser(user.archetype, user.xpGainTier);
  const [min, max] = SESSION_FRACTIONS[user.activity];
  const duration =
    Math.max(0, Math.min(TICK_HOURS, hours)) * (min + rng() * (max - min));
  const gains = {};
  const add = (skill, xp) => {
    const before = user.skills[skill].xp;
    user.skills[skill].xp = Math.min(200_000_000, before + Math.floor(xp));
    user.skills[skill].level = levelFromXp(user.skills[skill].xp);
    gains[skill] = (gains[skill] || 0) + user.skills[skill].xp - before;
  };
  const skill = chooseTrainingSkill(user, rng);
  if (duration > 0 && skill) {
    const stat = user.skills[skill];
    const gain =
      expectedRate(skill, stat.xp, stat.level) *
      duration *
      XP_SCALE *
      weekendBonusMultiplier(date);
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
        skill,
        hours: duration,
        gainedXP,
        gains,
        timestamp: date.getTime(),
      },
    };
    user.updatedAt = date.getTime();
  }
  user.totalLevel = totalLevel(user.skills);
  user.totalXP = totalXP(user.skills);
  user.version = 5;
  return user;
}
export async function runScheduled(env) {
  await reserveUpdate(env);
  const users = await allUsers(env);
  const existing = new Set(users.map((u) => u.username.toLowerCase()));
  const changed = [];
  const previous = await readJSON(env, "system:last-run");
  const date = new Date(Date.now());
  const hours = previous?.generatedAt
    ? Math.max(
        0,
        Math.min(TICK_HOURS, (date.getTime() - previous.generatedAt) / 3600000),
      )
    : TICK_HOURS;
  for (const user of users) {
    const before = JSON.stringify(user);
    progressUser(user, date, { hours });
    if (JSON.stringify(user) !== before) changed.push(user);
  }
  const count = users.length;
  const newCount = Math.min(Math.max(0, MAX_PLAYERS - users.length), users.length ? 1 + Math.floor(Math.random() * 2) : 5);
  for (const username of await generateUsernames(newCount, existing, env)) {
    const user = newUser(username);
    users.push(user);
    changed.push(user);
  }
  const snapshot = await publishSnapshot(env, users);
  const result = {
    processed: count,
    newUsers: newCount,
    totalPlayers: users.length,
    generatedAt: snapshot.generatedAt,
    simulatedHours: hours,
    changedPlayers: changed.length,
  };
  await writeJSON(env, "system:last-run", result);
  return result;
}
