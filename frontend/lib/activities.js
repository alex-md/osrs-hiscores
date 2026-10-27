// Authored ordinary-play rates and readiness gates, not exact drop tables.
// The Worker prices representative rewards using daily GE data. Activity uses a reduced world multiplier; bank value follows items and costs.
export const BOSSES = [
  { key: "scurrius", name: "Scurrius", combat: 45, killsPerHour: 35, hp: 500, loot: 16000, cost: 8000, rareChance: 1/100 },
  { key: "giant-mole", name: "Giant Mole", combat: 65, killsPerHour: 40, hp: 200, loot: 26000, cost: 7000, rareChance: 1/500 },
  { key: "barrows", name: "Barrows Chests", combat: 70, killsPerHour: 10, hp: 600, loot: 18000, cost: 14000, rareChance: 1/15 },
  { key: "sarachnis", name: "Sarachnis", combat: 75, killsPerHour: 30, hp: 400, loot: 28000, cost: 15000, rareChance: 1/384 },
  { key: "dagannoth-kings", name: "Dagannoth Kings", combat: 85, killsPerHour: 45, hp: 255, loot: 22000, cost: 12000, rareChance: 1/128 },
  { key: "zulrah", requirements: { magic: 70, ranged: 70 }, name: "Zulrah", combat: 90, killsPerHour: 22, hp: 500, loot: 110000, cost: 42000, rareChance: 1/128 },
  { key: "vorkath", requirements: { ranged: 75, prayer: 43 }, name: "Vorkath", combat: 95, killsPerHour: 24, hp: 750, loot: 125000, cost: 48000, rareChance: 1/1000 },
  { key: "phantom-muspah", requirements: { magic: 75, ranged: 75 }, name: "Phantom Muspah", combat: 100, killsPerHour: 18, hp: 850, loot: 130000, cost: 60000, rareChance: 1/100 },
  { key: "general-graardor", name: "General Graardor", combat: 100, killsPerHour: 18, hp: 255, loot: 30000, cost: 28000, rareChance: 1/127 },
  { key: "commander-zilyana", name: "Commander Zilyana", combat: 100, killsPerHour: 18, hp: 255, loot: 30000, cost: 30000, rareChance: 1/127 },
  { key: "kril-tsutsaroth", name: "K’ril Tsutsaroth", combat: 100, killsPerHour: 18, hp: 255, loot: 30000, cost: 30000, rareChance: 1/127 },
  { key: "kreearra", name: "Kree’arra", combat: 105, killsPerHour: 16, hp: 255, loot: 35000, cost: 48000, rareChance: 1/127 },
  { key: "alchemical-hydra", requirements: { ranged: 80 }, name: "Alchemical Hydra", combat: 105, slayer: 95, killsPerHour: 20, hp: 1100, loot: 140000, cost: 50000, rareChance: 1/1000 },
  { key: "chambers-of-xeric", requirements: { magic: 75, ranged: 75, prayer: 70 }, name: "Chambers of Xeric", combat: 105, killsPerHour: 1.8, hp: 3500, loot: 650000, cost: 300000, rareChance: 1/30 },
  { key: "theatre-of-blood", requirements: { attack: 85, strength: 85, ranged: 80, magic: 80, prayer: 70 }, name: "Theatre of Blood", combat: 115, killsPerHour: 1.5, hp: 4500, loot: 850000, cost: 450000, rareChance: 1/25 },
  { key: "tombs-of-amascut", requirements: { magic: 70, ranged: 70, prayer: 60 }, name: "Tombs of Amascut", combat: 95, killsPerHour: 1.8, hp: 3500, loot: 550000, cost: 350000, rareChance: 1/35 },
];
export const BOSS_BY_KEY = Object.fromEntries(BOSSES.map(boss => [boss.key, boss]));
export const MAX_BANK_VALUE = 1_000_000_000_000;
