import { ACHIEVEMENT_KEYS } from "./achievement-keys.js";
import { title, rarity } from "./domain.js";
const descriptions = {
  "first-session": "Complete your first recorded training session.",
  "hundred-sessions": "Complete 100 recorded training sessions.",
  "million-xp-day": "Earn 1 million simulated XP in a UTC day.",
  "base-70": "Reach level 70 in every skill.",
  "patient-master": "Reach level 99 in both Agility and Runecraft.",
  "triple-crown": "Hold rank 1 in at least three skills.",
  "crowned-any": "Hold rank 1 in a skill.",
  "top-10-any": "Reach the top 10 in a skill.",
  "top-100-any": "Reach the top 100 in a skill.",
  "maxed-account": "Reach level 99 in every skill.",
  "seven-99s": "Reach level 99 in seven skills.",
  "five-99s": "Reach level 99 in five skills.",
  "combat-maxed": "Reach level 99 in every combat skill.",
  "overall-rank-1": "Claim the top overall rank.",
  "first-99-any": "The earliest recorded level 99.",
  "first-top1-any": "The earliest recorded skill crown.",
  "tier-grandmaster": "Lead the overall ladder or hold three skill crowns.",
  "tier-master": "Earn Master prestige in the overall rankings.",
  "tier-diamond": "Earn Diamond prestige in the overall rankings.",
  "gathering-elite": "Reach level 90 in Woodcutting, Fishing and Mining.",
  "artisan-elite": "Reach level 90 in Smithing, Crafting and Fletching.",
  "support-elite": "Reach level 90 in Herblore, Runecraft and Slayer.",
  balanced:
    "Reach level 40 in every skill with at most 30 levels between your highest and lowest skills.",
  "glass-cannon":
    "Reach 180 combined Attack and Strength while keeping Defence at 60 or below.",
  tank: "Reach level 90 Defence and 85 Hitpoints.",
  skiller:
    "Average level 70 in non-combat skills with a combat skill average of 50 or below.",
  "combat-pure":
    "Average level 80 in combat skills with a non-combat skill average of 30 or below.",
  elite: "Exceed the population average in at least 90% of skills.",
  versatile: "Exceed the population average in at least 75% of skills.",
  consistent: "Exceed the population average in at least 50% of skills.",
  "magic-ranged": "Reach level 80 in Magic and Ranged.",
  "melee-specialist": "Reach level 85 in Attack, Strength and Defence.",
  "support-master": "Reach level 80 in Prayer, Herblore and Runecraft.",
  "gathering-master": "Reach level 80 in Woodcutting, Fishing and Mining.",
  "xp-millionaire": "Earn at least 1 million total XP.",
  "xp-billionaire": "Earn at least 1 billion total XP.",
};
export function catalog(counts = {}, totalPlayers = 0, firsts = {}) {
  return ACHIEVEMENT_KEYS.map((key) => {
    let name = title(key),
      description =
        descriptions[key] ||
        "A recorded achievement for account progression or playstyle.";
    let category = "Playstyle";
    if (key.startsWith("skill-master-")) {
      name = `${title(key.slice(13))} mastery`;
      description = `Reach level 99 in ${title(key.slice(13))}.`;
      category = "Mastery";
    }
    if (key.startsWith("skill-200m-")) {
      name = `${title(key.slice(11))} · 200M`;
      description = `Earn 200 million XP in ${title(key.slice(11))}.`;
      category = "Mastery";
    }
    if (
      /^(woodcutting|fishing|mining|cooking|firemaking|smithing|herblore|agility|thieving)-expert$/.test(
        key,
      )
    ) {
      description = `Reach level 85 in ${title(key.split("-")[0])}.`;
      category = "Mastery";
    }
    if (
      [
        "first-session",
        "hundred-sessions",
        "million-xp-day",
        "base-70",
      ].includes(key)
    )
      category = "Progression";
    if (key === "patient-master") category = "Mastery";
    if (/^total-/.test(key)) {
      name = `${key.slice(6)} total level`;
      description = `Reach a total level of ${key.slice(6)}.`;
      category = "Progression";
    }
    if (/^totalxp-/.test(key)) {
      name = `${key.slice(8).toUpperCase()} total XP`;
      description = `Earn ${key.slice(8).toUpperCase()} total XP.`;
      category = "Progression";
    }
    if (/^combat-level-/.test(key)) {
      name = `Combat level ${key.slice(13)}`;
      description = `Reach combat level ${key.slice(13)}.`;
      category = "Progression";
    }
    if (/^level-\d+-average/.test(key)) {
      const level = key.split("-")[1];
      description = `Reach an average skill level of ${level}.`;
      category = "Progression";
    }
    if (/^(tier-|top-|crowned|triple|overall|first)/.test(key))
      category = "Competition";
    if (/99s|maxed|millionaire|billionaire/.test(key)) category = "Progression";
    const count = counts[key] || 0;
    return {
      key,
      name,
      description,
      category,
      count,
      pct: totalPlayers ? (count / totalPlayers) * 100 : 0,
      rarity: rarity(count, totalPlayers),
      first: firsts[key] || null,
    };
  });
}
