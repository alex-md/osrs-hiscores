export const LEADERBOARD_HISTORY_KEY = 'stats:leaderboard:history';
export const LEADERBOARD_HISTORY_MAX_ENTRIES = 32;
export const LEADERBOARD_HISTORY_PLAYER_LIMIT = 200;
const WEEK_MS = 7 * 24 * 3600 * 1000;

function safeAverageFrom(list, accessor) {
  if (!Array.isArray(list) || list.length === 0) return 0;
  let sum = 0;
  let count = 0;
  for (const item of list) {
    const value = Number(accessor(item));
    if (!Number.isFinite(value)) continue;
    sum += value;
    count++;
  }
  return count ? sum / count : 0;
}

export async function getLeaderboardHistory(env) {
  try {
    const raw = await env.HISCORES_KV.get(LEADERBOARD_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

export async function updateLeaderboardHistory(env, leaderboard) {
  if (!leaderboard || !Array.isArray(leaderboard.players)) return;
  const entry = {
    generatedAt: Number(leaderboard.generatedAt) || Date.now(),
    totalPlayers: Number(leaderboard.totalPlayers) || leaderboard.players.length || 0,
    players: leaderboard.players.slice(0, LEADERBOARD_HISTORY_PLAYER_LIMIT).map((p) => ({
      username: p.username,
      rank: Number(p.rank) || 0,
      totalLevel: Number(p.totalLevel) || 0,
      totalXP: Number(p.totalXP) || 0
    }))
  };
  let history = await getLeaderboardHistory(env);
  const last = history[history.length - 1];
  const lastTs = Number(last?.generatedAt) || 0;
  if (last && Math.abs(entry.generatedAt - lastTs) < (15 * 60 * 1000)) {
    history[history.length - 1] = entry;
  } else {
    history.push(entry);
  }
  const cutoff = Date.now() - WEEK_MS;
  history = history.filter((item) => Number(item?.generatedAt) >= cutoff);
  while (history.length > LEADERBOARD_HISTORY_MAX_ENTRIES) history.shift();
  try {
    await env.HISCORES_KV.put(LEADERBOARD_HISTORY_KEY, JSON.stringify(history));
  } catch (_) {
    /* ignore history write errors */
  }
  return history;
}

export function selectHistoryEntry(history, hoursBack = 24) {
  if (!Array.isArray(history) || history.length === 0) return { entry: null, hours: null };
  const now = Date.now();
  const target = now - hoursBack * 3600000;
  let candidate = null;
  let candidateTs = -Infinity;
  for (const item of history) {
    const ts = Number(item?.generatedAt);
    if (!Number.isFinite(ts)) continue;
    if (ts <= target && ts > candidateTs) {
      candidate = item;
      candidateTs = ts;
    }
  }
  if (!candidate) {
    let earliest = null;
    let earliestTs = Infinity;
    for (const item of history) {
      const ts = Number(item?.generatedAt);
      if (!Number.isFinite(ts)) continue;
      if (ts < earliestTs) {
        earliest = item;
        earliestTs = ts;
      }
    }
    candidate = earliest || null;
    candidateTs = Number(candidate?.generatedAt) || 0;
  }
  if (!candidate || !Number.isFinite(candidateTs)) return { entry: null, hours: null };
  const hours = Math.max(1, Math.round((now - candidateTs) / 3600000));
  return { entry: candidate, hours };
}

export function computeOnTheRiseFromHistory(currentPlayers, history) {
  const list = Array.isArray(currentPlayers) ? currentPlayers : [];
  if (!list.length) return { players: [], windowHours: null };
  const { entry, hours } = selectHistoryEntry(history, 24);
  if (!entry || !Array.isArray(entry.players)) return { players: [], windowHours: hours };
  const prevMap = new Map();
  for (const p of entry.players) {
    const uname = String(p?.username || '').toLowerCase();
    const rank = Number(p?.rank);
    if (!uname || !Number.isFinite(rank)) continue;
    prevMap.set(uname, rank);
  }
  const climbers = [];
  for (const player of list) {
    const unameLower = String(player?.username || '').toLowerCase();
    if (!unameLower) continue;
    const prevRank = prevMap.get(unameLower);
    const currentRank = Number(player?.rank);
    if (!Number.isFinite(prevRank) || !Number.isFinite(currentRank)) continue;
    const delta = prevRank - currentRank;
    if (delta >= 100) {
      climbers.push({
        username: player.username,
        currentRank,
        previousRank: prevRank,
        delta,
        totalLevel: Number(player?.totalLevel) || 0,
        totalXP: Number(player?.totalXP) || 0
      });
    }
  }
  climbers.sort((a, b) => b.delta - a.delta || a.currentRank - b.currentRank || a.username.localeCompare(b.username));
  return { players: climbers.slice(0, 6), windowHours: hours };
}

export function computeTrendSummaryFromHistory(currentPayload, history) {
  const players = Array.isArray(currentPayload?.players) ? currentPayload.players : [];
  const totalPlayers = Number(currentPayload?.totalPlayers) || 0;
  const currentAvgLevel = safeAverageFrom(players, (p) => p?.totalLevel || 0);
  const currentAvgXp = safeAverageFrom(players, (p) => p?.totalXP || 0);
  const { entry, hours } = selectHistoryEntry(history, 24);
  let prevAvgLevel = currentAvgLevel;
  let prevAvgXp = currentAvgXp;
  let prevTotalPlayers = totalPlayers;
  if (entry && Array.isArray(entry.players) && entry.players.length) {
    prevAvgLevel = safeAverageFrom(entry.players, (p) => p?.totalLevel || 0);
    prevAvgXp = safeAverageFrom(entry.players, (p) => p?.totalXP || 0);
    prevTotalPlayers = Number(entry.totalPlayers) || prevTotalPlayers;
  }
  return {
    totalPlayers,
    totalPlayersChange24h: totalPlayers - prevTotalPlayers,
    sampleSize: players.length,
    sampleWindowHours: hours,
    avgTotalLevel: {
      current: currentAvgLevel,
      change: currentAvgLevel - prevAvgLevel
    },
    avgTotalXP: {
      current: currentAvgXp,
      change: currentAvgXp - prevAvgXp
    }
  };
}
