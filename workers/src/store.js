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
export async function allUsers(env) {
  const users = [];
  let cursor;
  do {
    const page = await env.HISCORES_KV.list({
      prefix: "user:",
      limit: 1000,
      ...(cursor ? { cursor } : {}),
    });
    // Bound read concurrency without swallowing failures or publishing partial rankings.
    for (let i = 0; i < page.keys.length; i += 16) {
      const batch = await Promise.all(
        page.keys.slice(i, i + 16).map((k) => readJSON(env, k.name)),
      );
      users.push(...batch.filter(Boolean).map(normalizeUser));
    }
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
