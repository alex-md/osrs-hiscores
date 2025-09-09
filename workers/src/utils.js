import { PLAYER_ARCHETYPES, SKILLS } from './constants.js';

export function weekendBonusMultiplier(date = new Date()) {
  const day = date.getUTCDay();
  return (day === 6 || day === 0) ? 1.15 : 1.0;
}

export function levelFromXp(xp) {
  let points = 0;
  let output = 1;
  for (let lvl = 1; lvl <= 99; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    const exp = Math.floor(points / 4);
    if (exp > xp) return lvl;
    output = lvl;
  }
  return output;
}

export function totalLevel(skills) {
  return SKILLS.reduce((sum, s) => sum + (skills[s]?.level || 1), 0);
}

export function totalXP(skills) {
  return SKILLS.reduce((sum, s) => sum + (skills[s]?.xp || 0), 0);
}

// Meta tier inference prioritizing overall rank percentiles with fallbacks.
// Returns an object { name, ordinal } where lower ordinal is higher prestige.
export function inferMetaTierWithContext(user, ctx) {
  try {
    const rank = Number(ctx?.rank) || Infinity;
    const totalPlayers = Math.max(1, Number(ctx?.totalPlayers) || 1);
    const top1SkillsCount = Math.max(0, Number(ctx?.top1SkillsCount) || 0);

    // Grandmaster: absolute #1 or #1 in 3+ skills
    if (rank === 1 || top1SkillsCount >= 3) return { name: 'Grandmaster', ordinal: 0 };

    if (totalPlayers <= 500) {
      // Absolute thresholds for small ladders
      if (rank <= 2) return { name: 'Master', ordinal: 1 };
      if (rank <= 5) return { name: 'Diamond', ordinal: 2 };
      if (rank <= 15) return { name: 'Platinum', ordinal: 3 };

      // Scaled broader tiers
      if (rank <= Math.ceil(totalPlayers * 0.05)) return { name: 'Gold', ordinal: 4 };
      if (rank <= Math.ceil(totalPlayers * 0.20)) return { name: 'Silver', ordinal: 5 };
      if (rank <= Math.ceil(totalPlayers * 0.50)) return { name: 'Bronze', ordinal: 6 };
    } else {
      // Percentile thresholds for big ladders
      const percentile = rank / totalPlayers; // 0..1
      if (percentile <= 0.0001) return { name: 'Master', ordinal: 1 };
      if (percentile <= 0.001) return { name: 'Diamond', ordinal: 2 };
      if (percentile <= 0.01) return { name: 'Platinum', ordinal: 3 };
      if (percentile <= 0.05) return { name: 'Gold', ordinal: 4 };
      if (percentile <= 0.20) return { name: 'Silver', ordinal: 5 };
      if (percentile <= 0.50) return { name: 'Bronze', ordinal: 6 };
    }

    // Fallback by account maturity if no rank context available or below 50%
    const levels = SKILLS.map(s => user.skills?.[s]?.level || 1);
    const total = levels.reduce((a, b) => a + b, 0);
    if (total >= 1700) return { name: 'Expert', ordinal: 5 };
    if (total >= 900) return { name: 'Adept', ordinal: 6 };
    return { name: 'Novice', ordinal: 7 };
  } catch (_) {
    return { name: 'Novice', ordinal: 7 };
  }
}

export function weightedRandomChoice(choices) {
  const totalWeight = Object.values(choices).reduce((sum, w) => sum + w, 0);
  if (totalWeight <= 0) return Object.keys(choices)[0] || null;
  let r = Math.random() * totalWeight;
  for (const [name, weight] of Object.entries(choices)) {
    if ((r -= weight) <= 0) return name;
  }
  return Object.keys(choices)[0] || null;
}

export function assignRandomArchetype() {
  const weights = Object.fromEntries(
    Object.entries(PLAYER_ARCHETYPES).map(([name, data]) => [name, data.weight])
  );
  return weightedRandomChoice(weights);
}

export function sanitizeUsername(name) {
  let n = String(name || '').replace(/[^a-zA-Z0-9_ -]/g, '');
  n = n.replace(/^[_\-\s]+/, '');
  return n.slice(0, 12);
}

export async function fetchRandomWords(count = 2, existingUsernames = new Set()) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const randChoice = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const roll = (p) => Math.random() < p;

  const isAlpha = (w) => /^[a-z]+$/i.test(w);
  const hasVowel = (w) => /[aeiou]/i.test(w);
  const noLongConsonantRuns = (w) => !/[bcdfghjklmnpqrstvwxyz]{4,}/i.test(w);
  const looksLikeWord = (w) => isAlpha(w) && hasVowel(w) && noLongConsonantRuns(w);

  const GOOD_MIN = 3;
  const GOOD_MAX = 12;

  function normalize(u) { return u.toLowerCase(); }

  async function fetchBatch(n) {
    while (true) {
      try {
        const resp = await fetch(`https://random-word-api.herokuapp.com/word?number=${n}`, {
          cf: { cacheTtl: 60, cacheEverything: true }
        });
        if (!resp.ok) throw new Error('bad status');
        const data = await resp.json();
        if (Array.isArray(data) && data.length) return data.map(String);
      } catch (_) { }
      await sleep(2000);
    }
  }

  function capFirst(w) { return w.replace(/^[a-z]/, ch => ch.toUpperCase()); }

  function buildName(w1, w2) {
    const a = String(w1 || '').trim();
    const b = String(w2 || '').trim();

    const pool = [a, b].filter(
      w => w.length >= GOOD_MIN && w.length <= GOOD_MAX && looksLikeWord(w)
    );
    if (pool.length === 0) return null;

    const tryTwoWords = roll(0.5) && pool.length >= 2;
    const joiners = ['', ' ', '-', '_'];

    const words = [...new Set(pool.map(w => w.toLowerCase()))].sort((x, y) => x.length - y.length);

    const combos = [];
    if (tryTwoWords && words.length >= 2) {
      const wA = words[0], wB = words[1];
      for (const j of joiners) {
        combos.push(capFirst(wA) + j + capFirst(wB));
        combos.push(capFirst(wB) + j + capFirst(wA));
      }
    }

    for (const w of words) combos.push(capFirst(w));

    const clean = combos.filter(c => c.length <= 12 && !/^\d/.test(c));
    if (clean.length === 0) return null;

    let base = randChoice(clean);
    if (roll(0.25)) {
      const suffix = String(randInt(1, 999));
      if (base.length + suffix.length <= 12) base = base + suffix;
    }

    if (/^\d/.test(base) || base.length > 12) return null;
    return base;
  }

  const results = [];
  const maxAttempts = Math.max(40, count * 8); // Lower max attempts for faster exit
  let attempts = 0;
  const maxTimeMs = 8000; // 8 seconds timeout
  const startTime = Date.now();

  while (
    results.length < count &&
    attempts < maxAttempts &&
    (Date.now() - startTime) < maxTimeMs
  ) {
    const need = Math.max(6, (count - results.length) * 6);
    const batch = await fetchBatch(need);
    const good = batch
      .map(w => String(w || '').trim())
      .filter(w => w.length >= GOOD_MIN && w.length <= GOOD_MAX && looksLikeWord(w));

    for (let i = 0; i + 1 < good.length && results.length < count && attempts < maxAttempts; i += 2) {
      const w1 = good[i];
      const w2 = good[i + 1];

      const name = buildName(w1, w2);
      attempts++;
      if (!name) continue;

      const sanitizedName = sanitizeUsername(name);
      const key = normalize(sanitizedName);
      if (
        sanitizedName &&
        !/^\d/.test(sanitizedName) &&
        sanitizedName.length <= 12 &&
        !existingUsernames.has(key)
      ) {
        results.push(sanitizedName);
        existingUsernames.add(key);
      }
    }

    // Handle the last word if good.length is odd and more results are needed
    if (good.length % 2 === 1 && results.length < count && attempts < maxAttempts) {
      const w = good[good.length - 1];
      const name = buildName(w, null);
      attempts++;
      if (name) {
        const sanitizedName = sanitizeUsername(name);
        const key = normalize(sanitizedName);
        if (
          sanitizedName &&
          !/^\d/.test(sanitizedName) &&
          sanitizedName.length <= 12 &&
          !existingUsernames.has(key)
        ) {
          results.push(sanitizedName);
          existingUsernames.add(key);
        }
      }
    }
  }

  return results;
}
