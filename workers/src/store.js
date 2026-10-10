import { SKILLS } from "./constants.js";
import { clamp, levelFromXp, totalLevel, totalXP } from "./utils.js";

// No global dataset cache: each KV binding is an independent environment.
export async function readJSON(env, key, fallback = null) {
  const raw = await env.HISCORES_KV.get(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in KV key ${key}`);
  }
}
export const writeJSON = (env, key, value) =>
  env.HISCORES_KV.put(key, JSON.stringify(value));
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
// Keep independent KV operations bounded, and wait for the whole batch before
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
    env.HISCORES_KV.get(group, "json"),
  );
  return new Map(maps.flatMap((values) => [...values]));
}
export async function allUsers(env) {
  const users = [];
  let cursor;
  do {
    const page = await env.HISCORES_KV.list({
      prefix: "user:",
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    // Native bulk reads consume one subrequest per 100 keys, rather than one
    // per player, and avoid dozens of serial cold-read round trips.
    const values = await readManyJSON(
      env,
      page.keys.map((k) => k.name),
    );
    users.push(...[...values.values()].filter(Boolean).map(normalizeUser));
    cursor = page.list_complete ? null : page.cursor;
    if (!page.list_complete && !cursor)
      throw new Error("KV listing returned no continuation cursor");
  } while (cursor);
  return users;
}
export async function getUser(env, name) {
  const user = await readJSON(env, `user:${name.toLowerCase()}`);
  return user ? normalizeUser(user) : null;
}
export const putUser = (env, user) =>
  writeJSON(env, `user:${user.username.toLowerCase()}`, normalizeUser(user));
