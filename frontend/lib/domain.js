export const SKILLS = [
  "attack",
  "defence",
  "strength",
  "hitpoints",
  "ranged",
  "prayer",
  "magic",
  "cooking",
  "woodcutting",
  "fletching",
  "fishing",
  "firemaking",
  "crafting",
  "smithing",
  "mining",
  "herblore",
  "agility",
  "thieving",
  "slayer",
  "farming",
  "runecraft",
  "hunter",
  "construction",
  "sailing",
];
export const SKILL_SYMBOLS = [
  "⚔",
  "🛡",
  "✊",
  "♥",
  "🏹",
  "✦",
  "✧",
  "♨",
  "🪓",
  "➶",
  "🐟",
  "🔥",
  "💎",
  "⚒",
  "⛏",
  "🌿",
  "👟",
  "🗝",
  "☠",
  "🌱",
  "◈",
  "🐾",
  "⌂",
  "⚓",
];
export const title = (value) =>
  String(value)
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
export function combatLevel(skills) {
  const level = (key) => skills?.[key]?.level || 1;
  return Math.floor(
    0.25 *
      (level("defence") +
        level("hitpoints") +
        Math.floor(level("prayer") / 2)) +
      0.325 *
        Math.max(
          level("attack") + level("strength"),
          Math.floor(level("ranged") * 1.5),
          Math.floor(level("magic") * 1.5),
        ),
  );
}
export function rarity(count, total) {
  if (!count || !total) return "unclaimed";
  const pct = (count / total) * 100;
  return pct < 0.05
    ? "mythic"
    : pct < 0.2
      ? "legendary"
      : pct < 1
        ? "epic"
        : pct < 5
          ? "rare"
          : pct < 15
            ? "uncommon"
            : "common";
}
