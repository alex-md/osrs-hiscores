import { PLAYER_ARCHETYPES, SKILLS, INITIAL_TOTAL_XP_TIERS, SKILL_POPULARITY } from './constants.js';

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

// Reverse of levelFromXp: approximate XP for a given level (1..99). Returns minimum XP required.
export function xpForLevel(level) {
  if (level <= 1) return 0;
  let points = 0;
  for (let lvl = 1; lvl < level; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
  }
  return Math.floor(points / 4);
}

// Compute hitpoints level as the rounded average of primary combat skills.
// You mentioned: "based on all other combat stats, basically the average of all of them".
// We'll treat attack, strength, defence, ranged, magic, prayer as the contributors.
// (Prayer often has different weighting in OSRS combat level, but per your instruction we use a simple average.)
export function computeHitpointsLevelFromCombat(skills) {
  const combatStats = ['attack', 'strength', 'defence', 'ranged', 'magic', 'prayer'];
  const levels = combatStats.map(s => skills?.[s]?.level || 1);
  const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
  // Minimum starting HP level often is 10; respect that floor.
  return Math.max(10, Math.round(avg));
}

export function syncHitpointsFromCombat(skills) {
  if (!skills) return;
  const desiredLevel = computeHitpointsLevelFromCombat(skills);
  const current = skills.hitpoints || { xp: 1154, level: 10 };
  if (current.level === desiredLevel) return false;
  const newXp = xpForLevel(desiredLevel);
  skills.hitpoints = { xp: newXp, level: desiredLevel };
  return true;
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
  if (totalWeight <= 0) return null;
  let r = Math.random() * totalWeight;
  for (const [name, weight] of Object.entries(choices)) {
    if ((r -= weight) <= 0) return name;
  }
  return null;
}

// ———————————————————————————————————————————————————————————————
// Initial total XP sampler
// Strategy: pick a tier by weight, then sample inside tier using a power curve skew
// toward the lower bound (heavily top-heavy overall distribution).
// After choosing tier: value = min + (max-min) * u^(gamma) with gamma>1.
// Higher tiers get slightly larger gamma to further bias downward.
export function sampleInitialTotalXP(rng = Math.random) {
  const tiers = Array.isArray(INITIAL_TOTAL_XP_TIERS) ? INITIAL_TOTAL_XP_TIERS : [];
  if (!tiers.length) return 1_154;
  // Build cumulative weights
  let totalW = 0;
  for (const t of tiers) totalW += Math.max(0, t.weight || 0);
  if (totalW <= 0) return 1_154;
  let r = rng() * totalW;
  let chosen = tiers[0];
  for (const t of tiers) { r -= Math.max(0, t.weight || 0); if (r <= 0) { chosen = t; break; } }
  const span = Math.max(1, (chosen.max - chosen.min));
  // gamma increases with tier index to accentuate downward bias at higher tiers
  const idx = tiers.indexOf(chosen);
  const baseGamma = 1.35; // baseline curvature
  const gamma = baseGamma + idx * 0.18; // escalate gently
  const u = rng();
  const scaled = chosen.min + Math.floor(span * Math.pow(u, gamma));
  return Math.min(chosen.max, Math.max(chosen.min, scaled));
}

// ———————————————————————————————————————————————————————————————
// Distribute a total XP budget across skills (excluding hitpoints baseline which will be overridden later).
// Approach: choose a dynamic number of active skills based on total XP magnitude, then allocate using
// normalized popularity weights with a Dirichlet-like randomization (via exponential sampling).
export function distributeInitialXP(totalXp, rng = Math.random) {
  const MIN_PER_SKILL = 1154;
  const skillNames = SKILLS.filter((s) => s !== "hitpoints");
  const tiers = [
    { max: 5e4, count: [3, 5] },
    { max: 5e5, count: [5, 9] },
    { max: 5e6, count: [7, 15] },
    { max: 2e7, count: [12, 19] },
    { max: 5.5e7, count: [18, skillNames.length - 3] }
    // heavy mid/late game
  ];
  let targetRange = tiers[tiers.length - 1].count;
  for (const t of tiers) {
    if (totalXp <= t.max) {
      targetRange = t.count;
      break;
    }
  }
  const minCount = Math.min(skillNames.length, targetRange[0]);
  const maxCount = Math.min(skillNames.length, targetRange[1]);
  const activeCount = Math.max(minCount, Math.min(maxCount, Math.floor(minCount + rng() * (maxCount - minCount + 1))));
  // Fisher-Yates shuffle for unbiased randomization
  const shuffled = [...skillNames];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const selected = shuffled.slice(0, activeCount);
  const popularity = selected.map((s) => SKILL_POPULARITY[s] || 1);
  const popSum = popularity.reduce((a, b) => a + b, 0) || 1;
  const raw = popularity.map((w) => -Math.log(1 - rng()) * w);
  const rawSum = raw.reduce((a, b) => a + b, 0) || 1;
  const allocatable = Math.max(0, totalXp - activeCount * MIN_PER_SKILL);
  const xpMap = {};
  for (let i = 0; i < selected.length; i++) {
    const portion = allocatable * (raw[i] / rawSum);
    xpMap[selected[i]] = MIN_PER_SKILL + Math.floor(portion);
  }
  const assigned = Object.values(xpMap).reduce((a, b) => a + b, 0);
  let remainder = totalXp - assigned;
  if (remainder > 0) {
    const keys = Object.keys(xpMap);
    while (remainder-- > 0 && keys.length) {
      const k = keys[Math.floor(rng() * keys.length)];
      xpMap[k] += 1;
    }
  }
  for (const s of skillNames) if (!(s in xpMap)) xpMap[s] = MIN_PER_SKILL;
  return xpMap;
}

// ———————————————————————————————————————————————————————————————
// Archetype assignment influenced by total initial XP.
// We adjust base archetype weights with multipliers per XP threshold, favoring rarer endgame at high XP.
export function assignArchetypeForTotalXP(totalXP2, rng = Math.random) {
  const modifiers = [
    { max: 5e4, mult: { IDLER: 1.3, SOCIALITE: 1.2, AFKER: 1.1, CASUAL: 1, FOCUSED: 0.9, SKILLER: 0.8, PVMER: 0.7, IRON_SOUL: 0.6, HARDCORE: 0.5, EFFICIENT_MAXER: 0.4, ELITE_GRINDER: 0.4 } },
    { max: 5e5, mult: { IDLER: 1, SOCIALITE: 1, AFKER: 1, CASUAL: 1, FOCUSED: 1.05, SKILLER: 1.05, PVMER: 1, IRON_SOUL: 0.9, HARDCORE: 0.9, EFFICIENT_MAXER: 0.7, ELITE_GRINDER: 0.7 } },
    { max: 5e6, mult: { IDLER: 0.8, SOCIALITE: 0.8, AFKER: 0.85, CASUAL: 1, FOCUSED: 1.15, SKILLER: 1.2, PVMER: 1.15, IRON_SOUL: 1, HARDCORE: 1, EFFICIENT_MAXER: 0.9, ELITE_GRINDER: 0.9 } },
    { max: 2e7, mult: { IDLER: 0.6, SOCIALITE: 0.6, AFKER: 0.7, CASUAL: 0.9, FOCUSED: 1.2, SKILLER: 1.3, PVMER: 1.3, IRON_SOUL: 1.2, HARDCORE: 1.25, EFFICIENT_MAXER: 1.3, ELITE_GRINDER: 1.35 } },
    { max: 5.5e7, mult: { IDLER: 0.5, SOCIALITE: 0.5, AFKER: 0.6, CASUAL: 0.85, FOCUSED: 1.15, SKILLER: 1.3, PVMER: 1.35, IRON_SOUL: 1.3, HARDCORE: 1.4, EFFICIENT_MAXER: 1.5, ELITE_GRINDER: 1.6 } },
    { max: 1e8, mult: { IDLER: 0.4, SOCIALITE: 0.4, AFKER: 0.5, CASUAL: 0.8, FOCUSED: 1.1, SKILLER: 1.35, PVMER: 1.4, IRON_SOUL: 1.4, HARDCORE: 1.5, EFFICIENT_MAXER: 1.7, ELITE_GRINDER: 1.8 } }
  ];
  let multSet = modifiers[modifiers.length - 1].mult;
  for (const m of modifiers) {
    if (totalXP2 <= m.max) {
      multSet = m.mult;
      break;
    }
  }
  const weights = {};
  for (const [name, data] of Object.entries(PLAYER_ARCHETYPES)) {
    const base = data.weight || 1;
    const mult = multSet[name] || 1;
    weights[name] = base * mult;
  }
  return weightedRandomChoice(weights);
}

export function assignRandomArchetype() {
  const weights = Object.fromEntries(
    Object.entries(PLAYER_ARCHETYPES).map(([name, data]) => [name, data.weight])
  );
  return weightedRandomChoice(weights);
}

export function sanitizeUsername(name) {
  let n = String(name || '').replace(/[^a-zA-Z0-9_ -]/g, '');
  n = n.replace(/^[_\-\s]+|[_\-\s]+$/g, '');
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

  const isValidSanitizedName = (sanitizedName) =>
    sanitizedName &&
    !/^\d/.test(sanitizedName) &&
    sanitizedName.length <= 12;

  const results = [];
  const maxAttempts = Math.max(10, count * 5); // Lower min attempts for small counts, scale with count
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
        isValidSanitizedName(sanitizedName) &&
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
          isValidSanitizedName(sanitizedName) &&
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
