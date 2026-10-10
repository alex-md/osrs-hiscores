import { SKILLS } from "./constants.js";
import { inferMetaTierWithContext } from "./utils.js";
import {
  computeAchievementContext,
  evaluateAchievements,
  mergeNewUnlocks,
  ACHIEVEMENT_KEYS,
} from "./achievements.js";
import {
  allUsers,
  readJSON,
  writeJSON,
  putUser,
  mapBatches,
  readManyJSON,
} from "./store.js";

const CHUNK_SIZE = 500;
const rebuilds = new WeakMap();
export function buildRankings(
  users,
  context = computeAchievementContext(users),
) {
  const overall = [...users].sort(
    (a, b) =>
      b.totalLevel - a.totalLevel ||
      b.totalXP - a.totalXP ||
      a.username.localeCompare(b.username),
  );
  const rankings = {
    overall: overall.map((u, i) => ({
      username: u.username,
      totalLevel: u.totalLevel,
      totalXP: u.totalXP,
      rank: i + 1,
      updatedAt: u.updatedAt,
      archetype: u.archetype,
      tier: inferMetaTierWithContext(u, {
        rank: i + 1,
        totalPlayers: users.length,
        top1SkillsCount:
          context.top1SkillsByUserCount.get(u.username.toLowerCase()) || 0,
      }).name,
    })),
  };
  for (const skill of SKILLS) {
    rankings[skill] = users
      .map((u) => ({ username: u.username, ...u.skills[skill] }))
      .sort((a, b) => b.xp - a.xp || a.username.localeCompare(b.username))
      .map((u, i) => ({ ...u, rank: i + 1 }));
  }
  return rankings;
}
export async function publishSnapshot(env, users = null) {
  users ||= await allUsers(env);
  const now = Date.now(),
    context = computeAchievementContext(users);
  const [legacy, previous, log] = await Promise.all([
    readJSON(env, "ach:firsts", {}),
    readJSON(env, "ach:firsts:v2", {}),
    readJSON(env, "ach:events", { events: [] }),
  ]);
  const firsts = { ...legacy };
  for (const [key, value] of Object.entries(previous.keys || {})) {
    if (!firsts[key] || value.timestamp < firsts[key].timestamp)
      firsts[key] = value;
  }
  const events = [],
    changedUsers = [];
  for (const user of users) {
    const unlocked = evaluateAchievements(user, context);
    const added = mergeNewUnlocks(user, unlocked, now);
    if (added.length) changedUsers.push(user);
    for (const key of added)
      events.push({ key, username: user.username, timestamp: now });
    for (const [key, timestamp] of Object.entries(user.achievements)) {
      if (
        Number(timestamp) > 0 &&
        (!firsts[key] || Number(timestamp) < firsts[key].timestamp)
      )
        firsts[key] = {
          username: user.username,
          timestamp: Number(timestamp),
          source: "recorded",
        };
    }
  }
  await mapBatches(changedUsers, 16, (user) => putUser(env, user));
  for (const [key, prefix] of [
    ["first-99-any", "skill-master-"],
    ["first-top1-any", "crowned-any"],
  ]) {
    const candidates = Object.entries(firsts)
      .filter(([k]) => k.startsWith(prefix))
      .map(([, value]) => value)
      .sort((a, b) => a.timestamp - b.timestamp);
    if (
      candidates[0] &&
      (!firsts[key] || candidates[0].timestamp < firsts[key].timestamp)
    )
      firsts[key] = { ...candidates[0], source: "aggregate" };
  }
  // Count historical unlocks, matching the badges shown on player profiles.
  const counts = Object.fromEntries(
    ACHIEVEMENT_KEYS.map((k) => [
      k,
      users.filter((u) => Boolean(u.achievements[k])).length,
    ]),
  );
  for (const key of ["first-99-any", "first-top1-any"])
    counts[key] = firsts[key] ? 1 : 0;
  const rankings = buildRankings(users, context);
  const generation = `${now}-${crypto.randomUUID()}`;
  const chunks = {},
    writes = [];
  // Generation-scoped shards prevent readers combining two different simulation ticks.
  // Expired snapshots can always be rebuilt from permanent player documents.
  for (const [name, rows] of Object.entries(rankings)) {
    chunks[name] = Math.ceil(rows.length / CHUNK_SIZE);
    for (let i = 0; i < chunks[name]; i++) {
      writes.push({
        key: `snapshot:${generation}:${name}:${i}`,
        value: rows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      });
    }
  }
  await mapBatches(writes, 16, ({ key, value }) =>
    env.HISCORES_KV.put(key, JSON.stringify(value), {
      expirationTtl: 2_592_000,
    }),
  );
  const snapshot = {
    version: 1,
    generation,
    generatedAt: now,
    totalPlayers: users.length,
    chunks,
    counts,
    firsts,
  };
  await writeJSON(env, "ach:firsts", firsts);
  await writeJSON(env, "ach:firsts:v2", {
    version: 2,
    updatedAt: now,
    keys: firsts,
    counts,
  });
  await writeJSON(env, "ach:events", {
    updatedAt: now,
    events: [...events, ...(log.events || [])].slice(0, 100),
  });
  await writeJSON(env, "snapshot:current", snapshot);
  return snapshot;
}
export async function getSnapshot(env) {
  const snapshot = await readJSON(env, "snapshot:current");
  if (!snapshot || Date.now() - snapshot.generatedAt > 2_500_000_000) {
    if (!rebuilds.has(env.HISCORES_KV)) {
      const rebuilding = publishSnapshot(env).finally(() =>
        rebuilds.delete(env.HISCORES_KV),
      );
      rebuilds.set(env.HISCORES_KV, rebuilding);
    }
    return rebuilds.get(env.HISCORES_KV);
  }
  return snapshot;
}
export async function rankingRows(env, snapshot, name) {
  const keys = Array.from(
    { length: snapshot.chunks[name] || 0 },
    (_, i) => `snapshot:${snapshot.generation}:${name}:${i}`,
  );
  const values = await readManyJSON(env, keys);
  const batches = keys.map((key) => values.get(key));
  if (batches.some((b) => !Array.isArray(b)))
    throw new Error(
      "Ranking snapshot is temporarily unavailable. Retry shortly.",
    );
  return batches.flat();
}
