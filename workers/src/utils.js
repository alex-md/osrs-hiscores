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
      } catch (_) {}
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
  const maxAttempts = count * 20;
  let attempts = 0;

  while (results.length < count && attempts < maxAttempts) {
    const need = Math.max(6, (count - results.length) * 6);
    const batch = await fetchBatch(need);
    const good = batch.filter(w =>
      typeof w === 'string' &&
      looksLikeWord(w) &&
      w.length >= GOOD_MIN &&
      w.length <= GOOD_MAX
    );

    for (let i = 0; i + 1 < good.length && results.length < count; i += 2) {
      const w1 = good[i];
      const w2 = good[i + 1];

      const name = buildName(w1, w2);
      if (!name) { attempts++; continue; }

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
      attempts++;
    }
  }

  return results;
}
