import { SKILLS } from "./constants.js";
import { clamp, levelFromXp, totalLevel, totalXP } from "./utils.js";

// Database access stays scoped to the Durable Object store.
export async function readJSON(env, key, fallback = null) {
  const raw = await env.WORLD_STORE.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in database document ${key}`);
  }
}
export const writeJSON = (env, key, value) =>
  env.WORLD_STORE.put(key, JSON.stringify(value));
export function normalizeUser(user) {
  if (!user || typeof user.username !== "string" || !user.skills)
    throw new Error("Invalid player record");
  const skills = Object.fromEntries(
    SKILLS.map((skill) => {
      const xp = Math.floor(
        clamp(
          Number(user.skills[skill]?.xp) || 0,
          skill === "hitpoints" ? 1154 : 0,
          200_000_000,
        ),
      );
      return [skill, { xp, level: levelFromXp(xp) }];
    }),
  );
  return {
    ...user,
    skills,
    totalLevel: totalLevel(skills),
    totalXP: totalXP(skills),
    achievements: user.achievements || {},
  };
}
// Keep independent storage operations bounded, and wait for the whole batch before
// publishing a manifest or proceeding to dependent operations.
export async function mapBatches(items, limit, mapper) {
  const results = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = await Promise.allSettled(
      items.slice(i, i + limit).map(mapper),
    );
    const failure = batch.find((result) => result.status === "rejected");
    if (failure) throw failure.reason;
    results.push(...batch.map((result) => result.value));
  }
  return results;
}
export async function readManyJSON(env, keys) {
  const groups = [];
  for (let i = 0; i < keys.length; i += 100)
    groups.push(keys.slice(i, i + 100));
  const maps = await mapBatches(groups, 4, (group) =>
    env.WORLD_STORE.get(group, "json"),
  );
  return new Map(maps.flatMap((values) => [...values]));
}
// Published profile shards are the canonical player records in the Durable Object.
export async function allUsers(env) {
  const snapshot = await readJSON(env, "snapshot:current");
  if (!snapshot) return [];
  const keys = [...new Set(Object.values(snapshot.profileIndex || {}))].map(
    (i) => `snapshot:${snapshot.generation}:profiles:${i}`,
  );
  const values = await readManyJSON(env, keys);
  if (keys.some((key) => !values.get(key))) throw new Error("Missing player shard");
  return [...values.values()].flatMap((group) => Object.values(group).map(normalizeUser));
}
export async function getUser(env, name) {
  const snapshot = await readJSON(env, "snapshot:current");
  if (snapshot?.version >= 2) {
    const lower = name.toLowerCase();
    if (!Object.hasOwn(snapshot.profileIndex, lower)) return null;
    const group = await readJSON(env, `snapshot:${snapshot.generation}:profiles:${snapshot.profileIndex[lower]}`);
    return group?.[lower] ? normalizeUser(group[lower]) : null;
  }
  return null;
}
