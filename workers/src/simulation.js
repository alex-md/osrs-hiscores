import {
  SKILLS,
  PLAYER_ACTIVITY_TYPES,
  SKILL_POPULARITY,
} from "./constants.js";
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
import {
  allUsers,
  normalizeUser,
  putUser,
  writeJSON,
  mapBatches,
} from "./store.js";
import { publishSnapshot } from "./snapshots.js";

export function generateUsername(existing = new Set()) {
  const prefixes = [
    "Rune",
    "Ash",
    "Moss",
    "Iron",
    "Oak",
    "Mist",
    "Dusk",
    "Star",
    "Void",
    "Fern",
  ];
  const suffixes = [
    "Fox",
    "Mage",
    "Wolf",
    "Wisp",
    "Knight",
    "Raven",
    "Drake",
    "Bard",
    "Blade",
    "Owl",
  ];
  for (let attempt = 0; attempt < 100; attempt++) {
    const pick = (list) => list[Math.floor(Math.random() * list.length)];
    const name = `${pick(prefixes)}${pick(suffixes)}${Math.floor(Math.random() * 1000)}`;
    if (!existing.has(name.toLowerCase())) return name;
  }
  throw new Error("Could not generate a unique player name");
}
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
    version: 4,
  });
}
export function progressUser(user, date = new Date()) {
  user.xpGainTier ||= determineXpGainTierFromTotal(user.totalXP);
  user.archetype ||= "CASUAL";
  user.multipliers ||= buildSkillMultipliers(user.archetype, user.xpGainTier);
  user.activity = chooseActivityForUser(user.archetype, user.xpGainTier);
  const [min, max] = PLAYER_ACTIVITY_TYPES[user.activity].xpRange;
  const budget =
    (min + Math.random() * (max - min)) *
    weekendBonusMultiplier(date) *
    (user.multipliers.global || 1) *
    1.2;
  const pool = [...SKILLS];
  const chosen = [];
  const count = 1 + Math.floor(Math.random() * 5);
  while (chosen.length < count)
    chosen.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  const weight = chosen.reduce((n, s) => n + SKILL_POPULARITY[s], 0);
  for (const skill of chosen) {
    const mult = user.multipliers.perSkill?.[skill] || 1;
    user.skills[skill].xp = Math.min(
      200_000_000,
      user.skills[skill].xp +
        Math.floor(((budget * SKILL_POPULARITY[skill]) / weight) * mult),
    );
    user.skills[skill].level = levelFromXp(user.skills[skill].xp);
  }
  user.totalLevel = totalLevel(user.skills);
  user.totalXP = totalXP(user.skills);
  user.updatedAt = date.getTime();
  user.version = 4;
  return user;
}
export async function runScheduled(env) {
  const users = await allUsers(env);
  const existing = new Set(users.map((u) => u.username.toLowerCase()));
  const count = users.length
    ? Math.max(1, Math.floor(users.length * (0.1 + Math.random() * 0.25)))
    : 0;
  const pool = [...users],
    changed = [];
  for (let i = 0; i < count; i++) {
    const user = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    progressUser(user);
    changed.push(user);
  }
  const newCount = users.length ? 1 + Math.floor(Math.random() * 2) : 5;
  for (let i = 0; i < newCount; i++) {
    const username = generateUsername(existing);
    existing.add(username.toLowerCase());
    const user = newUser(username);
    users.push(user);
    changed.push(user);
  }
  await mapBatches(changed, 16, (user) => putUser(env, user));
  const snapshot = await publishSnapshot(env, users);
  const result = {
    processed: count,
    newUsers: newCount,
    totalPlayers: users.length,
    generatedAt: snapshot.generatedAt,
  };
  await writeJSON(env, "system:last-run", result);
  return result;
}
