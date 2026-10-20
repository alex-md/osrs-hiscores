import { UPDATE_INTERVAL_MS, UPDATE_MINUTES } from "../../frontend/lib/simulation-config.js";
export { UPDATE_INTERVAL_MS };
import { readJSON, writeJSON } from "./store.js";
import { HttpError } from "./http.js";

// One simulation per UTC simulation slot. Reads and writes use the serialized
// Durable Object SQLite transaction, so retries cannot advance the world twice.
export async function checkUpdate(env) {
  const slot = Math.floor(Date.now() / UPDATE_INTERVAL_MS);
  const previous = await readJSON(env, "system:update-slot");
  if (previous?.slot >= slot)
    throw new HttpError(429, `An update was already attempted this ${UPDATE_MINUTES}-minute UTC window. Retry in the next window.`);
  return slot;
}
export async function reserveUpdate(env) {
  const slot = await checkUpdate(env);
  await writeJSON(env, "system:update-slot", { slot, attemptedAt: Date.now() });
  return slot;
}
