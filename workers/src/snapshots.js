import { MAX_PLAYERS } from "../../frontend/lib/simulation-config.js";
import { HttpError } from "./http.js";
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
  readManyJSON,
} from "./store.js";

const CHUNK_SIZE = 500;

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
  if (users.length > MAX_PLAYERS)
    throw new HttpError(409, `The simulated world is limited to ${MAX_PLAYERS} players to preserve free-tier headroom.`);
  const now = Date.now(),
    context = computeAchievementContext(users);
  const [legacy, previous, oldLog, previousSnapshot] = await Promise.all([
    readJSON(env, "ach:firsts", {}),
    readJSON(env, "ach:firsts:v2", {}),
    readJSON(env, "ach:events", { events: [] }),
    readJSON(env, "snapshot:current"),
  ]);
  const log = previousSnapshot ? { events: previousSnapshot.events || [] } : oldLog;
  const firsts = {};
  for (const source of [legacy, previous.keys || {}, previousSnapshot?.firsts || {}])
    for (const [key, value] of Object.entries(source))
      if (!firsts[key] || value.timestamp < firsts[key].timestamp)
        firsts[key] = value;
  const events = [];
  for (const user of users) {
    const unlocked = evaluateAchievements(user, context);
    const added = mergeNewUnlocks(user, unlocked, now);
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
  // SQLite retains the current generation until a later successful commit.
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
  // The adapter stages these documents and atomically commits the entire job in
  // SQLite. Profile shards are both canonical state and the published projection.
  const documents = [...writes, { key: "snapshot:current", value: snapshot }]
    .map((doc) => ({ ...doc, encoded: JSON.stringify(doc.value) }));
  // SQLite limits individual rows to 2 MB. Fail without changing the live world.
  if (documents.some((doc) => new TextEncoder().encode(doc.encoded).length > 1_900_000))
    throw new Error("Snapshot row exceeds the SQLite safety limit; reduce shard size.");
  for (const doc of documents)
    await env.WORLD_STORE.put(doc.key, doc.encoded);
  return snapshot;
}
export async function getSnapshot(env) {
  const snapshot = await readJSON(env, "snapshot:current");
  if (!snapshot)
    throw new HttpError(503, "No published snapshot. Run an authenticated rebuild or wait for the scheduled update.");
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
  let cache = shardCaches.get(env.WORLD_STORE);
  if (!cache)
    shardCaches.set(
      env.WORLD_STORE,
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
