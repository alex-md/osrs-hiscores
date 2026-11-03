import { readJSON } from './store.js';
import { UPDATE_INTERVAL_MS } from '../../frontend/lib/simulation-config.js';

export async function worldDiagnostics(env, now = Date.now()) {
  if (!env.WORLD_STORE) return null;
  const [lastRun, pending, publication, operations] = await Promise.all([
    readJSON(env,'system:last-run'), readJSON(env,'history:pending',{}),
    readJSON(env,'history:publication'), readJSON(env,'system:operations'),
  ]);
  const ageMs = lastRun ? Math.max(0,now-lastRun.generatedAt) : null;
  return {
    progression: { state: ageMs === null ? 'awaiting-first-update' : ageMs > UPDATE_INTERVAL_MS*2 ? 'stale' : 'current',
      lastSuccessfulAt:lastRun?.generatedAt || null, ageMs, durationMs:lastRun?.durationMs ?? null,
      nextExpectedAt:lastRun ? (Math.floor(lastRun.generatedAt/UPDATE_INTERVAL_MS)+1)*UPDATE_INTERVAL_MS : null,
      activePlayers:lastRun?.activePlayers ?? null, restingPlayers:lastRun?.restingPlayers ?? null },
    history: { connected:Boolean(env.HISTORY_DB), pendingDays:Object.keys(pending).length,
      lastPublishedAt:publication?.lastPublishedAt || null,
      lagMs:lastRun && publication?.lastPublishedAt ? Math.max(0,lastRun.generatedAt-publication.lastPublishedAt) : null,
      failures:publication?.failures || 0, lastFailedAt:publication?.lastFailedAt || null },
    updates:operations || {failures:0},
  };
}
