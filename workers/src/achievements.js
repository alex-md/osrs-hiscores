// Achievement evaluation and utilities for OSRS Hiscores Worker
// Stores unlock timestamps per user and supports global stats + first-to-achieve logging

import { SKILLS } from "./constants.js";
import { inferMetaTierWithContext } from "./utils.js";

// Catalog keys we can evaluate on the backend (subset aligns with frontend)
import { ACHIEVEMENT_KEYS } from "../../frontend/lib/achievement-keys.js";
export { ACHIEVEMENT_KEYS };

// Family chains in priority order (index 0 = highest). Presence of a higher tier implies lower tiers were earned historically.
const ACHIEVEMENT_FAMILY_CHAINS = [
  ["tier-grandmaster", "tier-master", "tier-diamond"],
  ["triple-crown", "crowned-any"],
  ["top-10-any", "top-100-any"],
  ["maxed-account", "seven-99s", "five-99s"],
  [
    "total-2376",
    "total-2277",
    "total-2200",
    "total-2000",
    "total-1500",
    "total-1000",
    "total-500",
  ],
  ["elite", "versatile", "consistent"],
  ["level-90-average", "level-75-average", "level-50-average"],
  // XP thresholds: keep highest
  [
    "xp-billionaire",
    "totalxp-200m",
    "totalxp-100m",
    "totalxp-50m",
    "totalxp-10m",
    "xp-millionaire",
  ],
  // Combat level milestones: keep highest
  [
    "combat-level-126",
    "combat-level-120",
    "combat-level-110",
    "combat-level-100",
  ],
];

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}
function avg(arr) {
  return arr.length ? sum(arr) / arr.length : 0;
}

// The same deterministic ordering is used by the public rankings.
export function computeAchievementContext(users) {
  const sort = (a, b) => a.username.localeCompare(b.username);
  const overall = [...users].sort(
    (a, b) =>
      b.totalLevel - a.totalLevel || b.totalXP - a.totalXP || sort(a, b),
  );
  const rankByUser = new Map(
    overall.map((u, i) => [u.username.toLowerCase(), i + 1]),
  );
  const top1SkillsByUserCount = new Map(),
    top10BySkill = new Map(),
    top100BySkill = new Map(),
    skillAvgLevel = new Map();
  for (const skill of SKILLS) {
    const ranked = [...users].sort(
      (a, b) =>
        (b.skills[skill]?.xp || 0) - (a.skills[skill]?.xp || 0) || sort(a, b),
    );
    const names = ranked.map((u) => u.username.toLowerCase());
    if (ranked[0]?.skills[skill]?.xp > 0) {
      const name = names[0];
      top1SkillsByUserCount.set(
        name,
        (top1SkillsByUserCount.get(name) || 0) + 1,
      );
    }
    top10BySkill.set(skill, new Set(names.slice(0, 10)));
    top100BySkill.set(skill, new Set(names.slice(0, 100)));
    skillAvgLevel.set(
      skill,
      users.length
        ? users.reduce((n, u) => n + (u.skills[skill]?.level || 1), 0) /
            users.length
        : 0,
    );
  }
  return {
    rankByUser,
    top1SkillsByUserCount,
    top10BySkill,
    top100BySkill,
    skillAvgLevel,
    totalPlayers: users.length,
  };
}

// Evaluate which achievements a user meets right now.
// Returns a Set of achievement keys.
export function evaluateAchievements(user, ctx) {
  const out = new Set();
  const unameLower = String(user.username || "").toLowerCase();
  const levels = Object.fromEntries(
    SKILLS.map((s) => [s, user?.skills?.[s]?.level || 1]),
  );
  const totalLvl = Number(user.totalLevel || 0);
  const totalXp = Number(user.totalXP || 0);

  if (user.progress?.sessions >= 1) out.add("first-session");
  if (user.progress?.sessions >= 100) out.add("hundred-sessions");
  if (user.progress?.dayXP >= 1_000_000) out.add("million-xp-day");
  if (SKILLS.every((s) => levels[s] >= 70)) out.add("base-70");
  if (levels.agility >= 99 && levels.runecraft >= 99) out.add("patient-master");
  if (totalLvl >= 500) out.add("total-500");
  if (totalLvl >= 1000) out.add("total-1000");

  // Prestige tier achievements
  if (ctx) {
    const rank = ctx.rankByUser?.get(unameLower) || Infinity;
    if (rank === 1) out.add("overall-rank-1");
    const top1Count = ctx.top1SkillsByUserCount?.get(unameLower) || 0;
    const tier = inferMetaTierWithContext(user, {
      rank,
      totalPlayers: ctx.totalPlayers || 1,
      top1SkillsCount: top1Count,
    });
    if (tier.name === "Grandmaster") out.add("tier-grandmaster");
    else if (tier.name === "Master") out.add("tier-master");
    else if (tier.name === "Diamond") out.add("tier-diamond");
  }

  // Ranking achievements (keep only highest per sub-family)
  if (ctx) {
    const top10Any = SKILLS.some((s) =>
      ctx.top10BySkill?.get(s)?.has(unameLower),
    );
    const top100Any = SKILLS.some((s) =>
      ctx.top100BySkill?.get(s)?.has(unameLower),
    );
    const top1Count = ctx.top1SkillsByUserCount?.get(unameLower) || 0;
    // Crown family: triple-crown > crowned-any
    if (top1Count >= 3) out.add("triple-crown");
    else if (top1Count >= 1) out.add("crowned-any");
    // Top-any family: top-10-any > top-100-any
    if (top10Any) out.add("top-10-any");
    else if (top100Any) out.add("top-100-any");
  }

  // Account progression (total level milestones) — keep only the highest milestone
  // If additional milestones are added (e.g., total-1000), this logic will still only select the highest one.
  if (totalLvl >= 2376) {
    out.add("total-2376");
  } else if (totalLvl >= 2277) {
    out.add("total-2277");
  } else if (totalLvl >= 2200) {
    out.add("total-2200");
  } else if (totalLvl >= 2000) {
    out.add("total-2000");
  } else if (totalLvl >= 1500) {
    out.add("total-1500");
  }
  const count99 = SKILLS.filter((s) => levels[s] >= 99).length;
  // 99s family: maxed-account > seven-99s > five-99s
  if (count99 >= SKILLS.length) out.add("maxed-account");
  else if (count99 >= 7) out.add("seven-99s");
  else if (count99 >= 5) out.add("five-99s");
  const combatSkills = [
    "attack",
    "strength",
    "defence",
    "hitpoints",
    "ranged",
    "magic",
    "prayer",
  ];
  if (combatSkills.every((s) => levels[s] >= 99)) out.add("combat-maxed");

  // Skill mastery is tracked for every skill in the public skill book.
  for (const skill of SKILLS)
    if (levels[skill] >= 99) out.add(`skill-master-${skill}`);

  // Gathering
  if (levels.woodcutting >= 90 && levels.fishing >= 90 && levels.mining >= 90)
    out.add("gathering-elite");
  if (levels.woodcutting >= 85) out.add("woodcutting-expert");
  if (levels.fishing >= 85) out.add("fishing-expert");
  if (levels.mining >= 85) out.add("mining-expert");

  // Artisan
  if (levels.smithing >= 90 && levels.crafting >= 90 && levels.fletching >= 90)
    out.add("artisan-elite");
  if (levels.cooking >= 85) out.add("cooking-expert");
  if (levels.firemaking >= 85) out.add("firemaking-expert");
  if (levels.smithing >= 85) out.add("smithing-expert");

  // Support
  if (levels.herblore >= 90 && levels.runecraft >= 90 && levels.slayer >= 90)
    out.add("support-elite");
  if (levels.herblore >= 85) out.add("herblore-expert");
  if (levels.agility >= 85) out.add("agility-expert");
  if (levels.thieving >= 85) out.add("thieving-expert");

  // Playstyle
  const levelVals = SKILLS.map((s) => levels[s]);
  const minLvl = Math.min(...levelVals);
  const maxLvl = Math.max(...levelVals);
  if (minLvl >= 40 && maxLvl - minLvl <= 30) out.add("balanced");
  const offense = (levels.attack || 1) + (levels.strength || 1);
  if (offense >= 180 && levels.defence <= 60) out.add("glass-cannon");
  if (levels.defence >= 90 && levels.hitpoints >= 85) out.add("tank");
  const nonCombat = SKILLS.filter(
    (s) =>
      ![
        "attack",
        "defence",
        "strength",
        "hitpoints",
        "ranged",
        "magic",
        "prayer",
      ].includes(s),
  );
  const combat = combatSkills;
  const nonCombatAvg = avg(nonCombat.map((s) => levels[s]));
  const combatAvg = avg(combat.map((s) => levels[s]));
  if (nonCombatAvg >= 70 && combatAvg <= 50) out.add("skiller");
  if (combatAvg >= 80 && nonCombatAvg <= 30) out.add("combat-pure");

  // Performance vs population averages
  if (ctx?.skillAvgLevel) {
    let above = 0;
    for (const s of SKILLS)
      if (levels[s] > (ctx.skillAvgLevel.get(s) || 0)) above++;
    const ratio = above / SKILLS.length;
    // Performance family: elite > versatile > consistent
    if (ratio >= 0.9) out.add("elite");
    else if (ratio >= 0.75) out.add("versatile");
    else if (ratio >= 0.5) out.add("consistent");
  }

  // XP thresholds (expanded)
  if (totalXp >= 1_000_000_000) out.add("xp-billionaire");
  if (totalXp >= 200_000_000) out.add("totalxp-200m");
  if (totalXp >= 100_000_000) out.add("totalxp-100m");
  if (totalXp >= 50_000_000) out.add("totalxp-50m");
  if (totalXp >= 10_000_000) out.add("totalxp-10m");
  else if (totalXp >= 1_000_000) out.add("xp-millionaire");

  // Activity achievements removed

  // Average level milestones
  const avgLevel = totalLvl / SKILLS.length;
  // Average level milestones family: 90 > 75 > 50
  if (avgLevel >= 90) out.add("level-90-average");
  else if (avgLevel >= 75) out.add("level-75-average");
  else if (avgLevel >= 50) out.add("level-50-average");

  // Special combinations
  if (levels.magic >= 80 && levels.ranged >= 80) out.add("magic-ranged");
  if (levels.attack >= 85 && levels.strength >= 85 && levels.defence >= 85)
    out.add("melee-specialist");
  if (levels.prayer >= 80 && levels.herblore >= 80 && levels.runecraft >= 80)
    out.add("support-master");
  if (levels.woodcutting >= 80 && levels.fishing >= 80 && levels.mining >= 80)
    out.add("gathering-master");

  // Ultra-rare: 200,000,000 XP in any skill
  try {
    for (const s of SKILLS) {
      const xp = Number(user?.skills?.[s]?.xp) || 0;
      if (xp >= 200_000_000) out.add(`skill-200m-${s}`);
    }
  } catch (_) {}

  // Combat level milestones (approximate OSRS formula)
  try {
    const atk = levels.attack || 1,
      str = levels.strength || 1,
      def = levels.defence || 1,
      hp = levels.hitpoints || 10,
      rng = levels.ranged || 1,
      mag = levels.magic || 1,
      pray = levels.prayer || 1;
    const base = 0.25 * (def + hp + Math.floor(pray / 2));
    const melee = 0.325 * (atk + str);
    const ranger = 0.325 * Math.floor(1.5 * rng);
    const mager = 0.325 * Math.floor(1.5 * mag);
    const combatLevel = Math.floor(base + Math.max(melee, ranger, mager));
    if (combatLevel >= 100) out.add("combat-level-100");
    if (combatLevel >= 110) out.add("combat-level-110");
    if (combatLevel >= 120) out.add("combat-level-120");
    if (combatLevel >= 126) out.add("combat-level-126");
  } catch (_) {}

  return out;
}

// Persist helper: merge new unlocks into user.achievements (key -> timestamp ms)
export function mergeNewUnlocks(user, unlockedSet, timestampMs = Date.now()) {
  if (!user.achievements || typeof user.achievements !== "object")
    user.achievements = {};
  const newlyUnlocked = [];
  for (const key of unlockedSet) {
    if (user.achievements[key]) continue;
    user.achievements[key] = timestampMs;
    newlyUnlocked.push(key);
  }
  return newlyUnlocked;
}

// Non-mutating helper that keeps only the highest-ranked achievement within each family chain.
// Returns a shallow clone suitable for read-only payloads without altering historical unlock data.
export function projectHighestAchievementFamilies(achievementsObj) {
  if (!achievementsObj || typeof achievementsObj !== "object") return {};
  const keep = new Set(Object.keys(achievementsObj));
  for (const chain of ACHIEVEMENT_FAMILY_CHAINS) {
    const present = chain.filter((k) => keep.has(k));
    if (present.length > 1) {
      const [, ...toRemove] = present;
      for (const key of toRemove) keep.delete(key);
    }
  }
  const projected = {};
  for (const key of keep) projected[key] = achievementsObj[key];
  return projected;
}
