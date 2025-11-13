import { friendlyAchievementLabel } from './achievements-meta.js';

function isoFromValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toISOString().replace(/\.\d{3}Z$/, 'Z');
    }
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return new Date(num).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function buildWatchlistFromData(leaderboard, { onTheRise, weeklyRarest, now = Date.now(), maxEntries = 8 } = {}) {
  const players = Array.isArray(leaderboard?.players) ? leaderboard.players : [];
  const playerMap = new Map();
  for (const p of players) {
    const lower = String(p?.username || '').toLowerCase();
    if (lower) playerMap.set(lower, p);
  }
  const tracked = [];
  const seen = new Set();
  const counts = { rare: 0, climbers: 0, anchors: 0, fallback: 0 };

  const pushEntry = (entry) => {
    if (!entry) return false;
    const rawName = String(entry.username || '').trim();
    if (!rawName) return false;
    const lower = rawName.toLowerCase();
    if (seen.has(lower) || tracked.length >= maxEntries) {
      return tracked.length < maxEntries;
    }
    const player = playerMap.get(lower);
    const source = entry.source || 'top-tier';
    const rankValue = Number.isFinite(entry.rank) ? Number(entry.rank)
      : Number.isFinite(player?.rank) ? Number(player.rank) : null;
    const tierValue = entry.tier || player?.tier || null;
    const item = {
      username: rawName,
      rank: rankValue,
      tier: tierValue,
      source,
      reason: entry.reason || null,
      happenedAt: isoFromValue(entry.happenedAt) || null,
      delta: Number.isFinite(entry.delta) ? Number(entry.delta) : null,
      previousRank: Number.isFinite(entry.previousRank) ? Number(entry.previousRank) : null,
      achievementKey: entry.achievementKey || null,
      fallback: entry.fallback === true
    };
    if (!item.happenedAt) {
      const ts = entry.updatedAt ?? player?.updatedAt;
      item.happenedAt = isoFromValue(ts);
    }
    tracked.push(item);
    seen.add(lower);
    if (source === 'rare-achievement') counts.rare++;
    else if (source === 'rank-climb') counts.climbers++;
    else if (source === 'top-tier') {
      counts.anchors++;
      if (entry.fallback) counts.fallback++;
    } else {
      counts.fallback++;
    }
    return tracked.length < maxEntries;
  };

  if (weeklyRarest && Array.isArray(weeklyRarest.recentUnlocks) && weeklyRarest.recentUnlocks.length) {
    const label = friendlyAchievementLabel(weeklyRarest.key) || 'Unlocked a rare achievement';
    const unlocks = weeklyRarest.recentUnlocks.slice(0, 4);
    for (const unlock of unlocks) {
      pushEntry({
        username: unlock?.username,
        source: 'rare-achievement',
        reason: label,
        happenedAt: unlock?.timestamp,
        achievementKey: weeklyRarest.key
      });
    }
  }

  if (onTheRise && Array.isArray(onTheRise.players) && onTheRise.players.length) {
    for (const climb of onTheRise.players.slice(0, 4)) {
      const delta = Number(climb?.delta) || 0;
      if (delta <= 0) continue;
      pushEntry({
        username: climb?.username,
        rank: climb?.currentRank,
        previousRank: climb?.previousRank,
        delta,
        source: 'rank-climb',
        reason: `Climbed ${delta} ranks`
      });
    }
  }

  if (tracked.length < maxEntries && players.length) {
    const tierPriority = new Set(['Grandmaster', 'Master', 'Diamond', 'Platinum']);
    for (const player of players) {
      if (tracked.length >= maxEntries) break;
      if (!tierPriority.has(player?.tier)) continue;
      pushEntry({
        username: player?.username,
        rank: player?.rank,
        tier: player?.tier,
        source: 'top-tier',
        reason: `Holding overall rank #${player?.rank ?? ''}`,
        updatedAt: player?.updatedAt
      });
    }
  }

  if (tracked.length < maxEntries && players.length) {
    for (const player of players) {
      if (tracked.length >= maxEntries) break;
      pushEntry({
        username: player?.username,
        rank: player?.rank,
        tier: player?.tier,
        source: 'top-tier',
        reason: `Overall rank #${player?.rank ?? ''}`,
        updatedAt: player?.updatedAt,
        fallback: true
      });
    }
  }

  const totalPlayers = Number(leaderboard?.totalPlayers) || players.length || 0;
  const windowHours = Number.isFinite(onTheRise?.windowHours) ? Number(onTheRise.windowHours) : null;
  return {
    generatedAt: now,
    totalPlayers,
    windowHours,
    tracked,
    sources: { rare: counts.rare, climbers: counts.climbers, anchors: counts.anchors, fallback: counts.fallback },
    message: tracked.length ? 'Auto-curated from recent leaderboard activity.' : 'No notable players detected yet.'
  };
}
