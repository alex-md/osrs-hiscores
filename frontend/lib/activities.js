// Authored ordinary-play rates and readiness gates. Selected drop tables are
// explicit below; older encounters retain approximate common reward bundles.
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
  // Selected tradeable Wiki drops; encounter rates and supply usage are estimates.
  ...[
    ["king-black-dragon", "King Black Dragon", 80, 35, 240, 0, [[536,1,1],[1747,2,1],[11286,1,1/5000]]],
    ["chaos-elemental", "Chaos Elemental", 80, 25, 250, 0, [[11920,1,1/256]]],
    ["kraken", "Kraken", 90, 40, 255, 87, [[560,50,10/128],[12004,1,1/400]]],
    ["thermonuclear-smoke-devil", "Thermonuclear Smoke Devil", 100, 45, 240, 93, [[565,100,10/128],[12002,1,1/350]]],
    ["cerberus", "Cerberus", 105, 30, 600, 91, [[13227,1,1/512],[13229,1,1/512],[13231,1,1/512],[13233,1,1/512]]],
    ["dagannoth-rex", "Dagannoth Rex", 75, 35, 255, 0, [[6729,1,1],[6737,1,1/128]]],
    ["dagannoth-prime", "Dagannoth Prime", 85, 35, 255, 0, [[6729,1,1],[6731,1,1/128]]],
    ["dagannoth-supreme", "Dagannoth Supreme", 85, 35, 255, 0, [[6729,1,1],[6733,1,1/128]]],
  ].map(([key,name,combat,killsPerHour,hp,slayer,table]) => ({ key,name,combat,killsPerHour,hp,slayer,
    cost: 10000, loot: 0, rareChance: 0, supplies: {385: 2,2434: 1},
    drops: table.map(([id,quantity,chance]) => ({ id,quantity,chance,rare: chance < 0.01 })),
    source: `https://oldschool.runescape.wiki/w/${name.replaceAll(" ", "_")}` })),
];
// Supplies are authored whole-item budgets per kill/completion. Raid entries
// represent one completion, so they consume a trip's supplies rather than a kill's.
const SUPPLY_BUDGETS = {
  barrows: {385:3,2434:1,560:60},
  zulrah: {385:3,2434:1,12934:50},
  vorkath: {385:4,2434:1,9144:10},
  "phantom-muspah": {385:5,2434:2,560:40},
  "alchemical-hydra": {385:4,2434:2,9144:15},
  cerberus: {385:5,2434:3},
  "chambers-of-xeric": {385:20,2434:12,565:200},
  "theatre-of-blood": {385:25,2434:15,565:300},
  "tombs-of-amascut": {385:20,2434:12,565:250},
};
for (const boss of BOSSES) boss.supplies = SUPPLY_BUDGETS[boss.key] || boss.supplies || {385:2,2434:1};
export const BOSS_BY_KEY = Object.fromEntries(BOSSES.map(boss => [boss.key, boss]));
export const MAX_BANK_VALUE = 1_000_000_000_000;
