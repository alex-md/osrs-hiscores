import { allUsers, readJSON, writeJSON } from "./store.js";
import { publishSnapshot } from "./snapshots.js";
import { generateUsernames } from "./usernames.js";

const KEY = "system:username-migration:v1";

function renameReferences(value, mapping) {
  if (Array.isArray(value)) return value.map((item) => renameReferences(item, mapping));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    key === "username" && typeof item === "string"
      ? mapping.get(item.toLowerCase()) || item
      : renameReferences(item, mapping),
  ]));
}

// The Durable Object commits the backup, history changes and new profiles in
// one SQLite transaction. A retry cannot rename the same world twice.
export async function renameExistingUsers(env, { dryRun = true } = {}) {
  const completed = await readJSON(env, KEY);
  if (completed) return { ...completed, dryRun, alreadyApplied: true };
  const users = await allUsers(env);
  const existing = new Set(users.map((user) => user.username.toLowerCase()));
  const names = await generateUsernames(users.length, existing, env);
  const renames = users.map((user, i) => ({ from: user.username, to: names[i] }));
  const result = { count: users.length, renames };
  if (dryRun || !users.length) return { ...result, dryRun };

  const mapping = new Map(renames.map(({ from, to }) => [from.toLowerCase(), to]));
  for (let i = 0; i < users.length; i += 100)
    await writeJSON(env, `backup:username-v1:players:${i / 100}`, users.slice(i, i + 100));
  for (const key of ["snapshot:current", "ach:firsts", "ach:firsts:v2", "ach:events"]) {
    const value = await readJSON(env, key);
    if (value !== null) {
      await writeJSON(env, `backup:username-v1:${key}`, value);
      await writeJSON(env, key, renameReferences(value, mapping));
    }
  }
  await publishSnapshot(env, users.map((user, i) => ({ ...user, username: names[i] })));
  const record = { ...result, appliedAt: Date.now() };
  await writeJSON(env, KEY, record);
  return { ...record, dryRun: false };
}
