import { combatLevel } from "../../frontend/lib/domain.js";
import { trainingInfo, expectedRate, XP_SCALE } from "./training.js";
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
export async function publishSnapshot(env, users = null, dirtyUsers = []) {
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
    changedUsers = [...dirtyUsers];
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
  await mapBatches(
    [
      ...new Map(
        changedUsers.map((u) => [u.username.toLowerCase(), u]),
      ).values(),
    ],
    16,
    (user) => putUser(env, user),
  );
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
  const profileIndex = Object.create(null);
  const overallByName = new Map(
    rankings.overall.map((u) => [u.username.toLowerCase(), u]),
  );
  const ranksByName = new Map(users.map((u) => [u.username.toLowerCase(), {}]));
  for (const skill of SKILLS)
    for (const row of rankings[skill])
      ranksByName.get(row.username.toLowerCase())[skill] = row.rank;
  const profiles = users.map((user) => {
    const name = user.username.toLowerCase();
    const next = SKILLS.filter((s) => user.skills[s].level < 99).sort(
      (a, b) => user.skills[b].xp - user.skills[a].xp,
    )[0];
    const goal = next
      ? {
          skill: next,
          target: 99,
          remainingXP: Math.max(0, 13034431 - user.skills[next].xp),
          trainingHours:
            (13034431 - user.skills[next].xp) /
            (expectedRate(next, user.skills[next].xp, user.skills[next].level) *
              XP_SCALE),
        }
      : null;
    return {
      ...user,
      rank: overallByName.get(name)?.rank || null,
      tier: overallByName.get(name)?.tier || "Novice",
      ranks: ranksByName.get(name),
      combatLevel: combatLevel(user.skills),
      goal,
    };
  });
  // Pack all 24 ladders together: one write per 500 players instead of 24.
  const shardCount = Math.ceil(users.length / CHUNK_SIZE);
  for (const name of Object.keys(rankings)) chunks[name] = shardCount;
  for (let i = 0; i < shardCount; i++) {
    writes.push({
      key: `snapshot:${generation}:rankings:${i}`,
      value: Object.fromEntries(
        Object.entries(rankings).map(([name, rows]) => [
          name,
          rows.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
        ]),
      ),
    });
  }
  // Profiles carry XP, ranks and unlocks from the same generation.
  for (let i = 0; i < profiles.length; i += 100) {
    const group = profiles.slice(i, i + 100);
    for (const user of group)
      profileIndex[user.username.toLowerCase()] = i / 100;
    writes.push({
      key: `snapshot:${generation}:profiles:${i / 100}`,
      value: Object.fromEntries(
        group.map((u) => [u.username.toLowerCase(), u]),
      ),
    });
  }
  await mapBatches(writes, 16, ({ key, value }) =>
    env.HISCORES_KV.put(key, JSON.stringify(value), {
      expirationTtl: 2_592_000,
    }),
  );
  const snapshot = {
    version: 2,
    generation,
    generatedAt: now,
    totalPlayers: users.length,
    chunks,
    counts,
    firsts,
    profileIndex,
    training: trainingInfo(),
    events: [...events, ...(log.events || [])].slice(0, 100),
  };
  if (JSON.stringify(legacy) !== JSON.stringify(firsts))
    await writeJSON(env, "ach:firsts", firsts);
  if (
    JSON.stringify(previous.keys) !== JSON.stringify(firsts) ||
    JSON.stringify(previous.counts) !== JSON.stringify(counts)
  )
    await writeJSON(env, "ach:firsts:v2", {
      version: 2,
      updatedAt: now,
      keys: firsts,
      counts,
    });
  if (events.length)
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
    (_, i) =>
      `snapshot:${snapshot.generation}:${snapshot.version >= 2 ? "rankings" : name}:${i}`,
  );
  const values = await immutableJSON(env, keys);
  const batches = keys.map((key) =>
    snapshot.version >= 2 ? values.get(key)?.[name] : values.get(key),
  );
  if (batches.some((b) => !Array.isArray(b)))
    throw new Error(
      "Ranking snapshot is temporarily unavailable. Retry shortly.",
    );
  return batches.flat();
}

// Cache only immutable generation shards; keep binding isolation and bounded memory.
const shardCaches = new WeakMap();
async function immutableJSON(env, keys) {
  let cache = shardCaches.get(env.HISCORES_KV);
  if (!cache)
    shardCaches.set(
      env.HISCORES_KV,
      (cache = { entries: new Map(), bytes: 0 }),
    );
  const entries = cache.entries;
  const missing = keys.filter((key) => !entries.has(key));
  const result = new Map(
    keys
      .filter((key) => entries.has(key))
      .map((key) => [key, entries.get(key).value]),
  );
  if (missing.length) {
    const values = await readManyJSON(env, missing);
    for (const [key, value] of values) result.set(key, value);
    for (const [key, value] of values)
      if (value) {
        const bytes = JSON.stringify(value).length * 2;
        if (bytes > 16 * 1024 * 1024) continue;
        while (
          entries.size &&
          (entries.size >= 64 || cache.bytes + bytes > 16 * 1024 * 1024)
        ) {
          const oldest = entries.keys().next().value;
          cache.bytes -= entries.get(oldest).bytes;
          entries.delete(oldest);
        }
        if (!entries.has(key)) {
          entries.set(key, { value, bytes });
          cache.bytes += bytes;
        }
      }
  }
  return result;
}
export async function snapshotUser(env, snapshot, name) {
  const lower = name.toLowerCase();
  const index = Object.hasOwn(snapshot.profileIndex || {}, lower)
    ? snapshot.profileIndex[lower]
    : undefined;
  if (index === undefined) return null;
  const key = `snapshot:${snapshot.generation}:profiles:${index}`;
  const values = await immutableJSON(env, [key]);
  if (!values.get(key))
    throw new Error(
      "Player snapshot is temporarily unavailable. Retry shortly.",
    );
  return values.get(key)[lower] || null;
}

export async function snapshotUsers(env, snapshot, names) {
  const keys = [
    ...new Set(
      names
        .filter((n) => Object.hasOwn(snapshot.profileIndex, n))
        .map(
          (n) =>
            `snapshot:${snapshot.generation}:profiles:${snapshot.profileIndex[n]}`,
        ),
    ),
  ];
  const values = await immutableJSON(env, keys);
  if (keys.some((k) => !values.get(k)))
    throw new Error(
      "Player snapshot is temporarily unavailable. Retry shortly.",
    );
  return names
    .map(
      (n) =>
        values.get(
          `snapshot:${snapshot.generation}:profiles:${snapshot.profileIndex[n]}`,
        )?.[n],
    )
    .filter(Boolean);
}

export async function allSkillRankings(env, snapshot) {
  if (snapshot.version < 2) {
    const rankings = {};
    for (const skill of SKILLS)
      rankings[skill] = await rankingRows(env, snapshot, skill);
    return rankings;
  }
  const keys = Array.from(
    { length: snapshot.chunks.overall || 0 },
    (_, i) => `snapshot:${snapshot.generation}:rankings:${i}`,
  );
  const values = await immutableJSON(env, keys);
  const rankings = {};
  for (const skill of SKILLS) {
    const batches = keys.map((key) => values.get(key)?.[skill]);
    if (batches.some((batch) => !Array.isArray(batch)))
      throw new Error(
        "Ranking snapshot is temporarily unavailable. Retry shortly.",
      );
    rankings[skill] = batches.flat();
  }
  return rankings;
}
