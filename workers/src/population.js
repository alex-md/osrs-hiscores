const DAY = 86_400_000;
export const POPULATION_POLICY = { inactivityDays: 45, establishedDays: 180, graceDays: 14, cleanupIntervalHours: 24 };
export function populationPolicy(env = {}) {
  return Object.fromEntries(Object.entries(POPULATION_POLICY).map(([key, fallback]) => {
    const value = Number(env[`POPULATION_${key.replace(/[A-Z]/g, c => `_${c}`).toUpperCase()}`]);
    return [key, Number.isFinite(value) && value > 0 ? value : fallback];
  }));
}
// 0.45 arrivals/tick vs the old mean of 1.5: 70% fewer, no mass deletion.
export function arrivals(count, max, rng = Math.random) {
  return Math.min(Math.max(0, max - count), count === 0 ? 5 : rng() < 0.45 ? 1 : 0);
}
export function cleanupPopulation(users, date, policy = POPULATION_POLICY) {
  const now = date.getTime(), kept = [], removed = [];
  const retired = { cash: 0, items: {}, players: 0, bankValue: 0 };
  for (const user of users) {
    // Missing legacy timestamps get a fresh grace period, not inferred abandonment.
    user.retention ||= { observedAt: now };
    const last = Math.max(user.createdAt || user.retention.observedAt, user.progress?.lastSession?.timestamp || 0,
      user.economy?.lastActivityAt || 0, user.lastTradeAt || 0, user.updatedAt || 0);
    const established = (user.progress?.sessions || 0) >= 100 || (user.progress?.earnedXP || 0) >= 1_000_000
      || Object.values(user.bosses || {}).some(kc => kc >= 100) || (user.economy?.exchange?.fills || 0) >= 100 || user.totalXP >= 10_000_000;
    const days = established ? Math.max(policy.inactivityDays, policy.establishedDays) : policy.inactivityDays;
    const protectedPlayer = user.retention.preserve === true || now - user.retention.observedAt < policy.graceDays * DAY;
    if (protectedPlayer || now - last < days * DAY) { kept.push(user); continue; }
    removed.push(user.username);
    retired.players++; retired.cash += user.economy?.cash || 0; retired.bankValue += user.economy?.bankValue || 0;
    for (const [id, n] of Object.entries(user.economy?.holdings || {})) retired.items[id] = (retired.items[id] || 0) + n;
  }
  return { users: kept, removed, retired };
}
