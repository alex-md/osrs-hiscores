// Legacy opening quotes captured 2026-10-26; expanded resources use authored
// opening estimates. These seed quotes once, never fabricate completed trades.
const items = {
  "2577":{"name":"Ranger boots","price":12000000},
  "229":{"name":"Vial","price":3},
  "5299":{"name":"Kwuarm seed","price":500},
  "39":{"name":"Bronze arrowtips","price":2},
  "6729":{"name":"Dagannoth bones","price":10000},
  "1119":{"name":"Steel platebody","price":1000},
  "1127":{"name":"Rune platebody","price":38000},
  "225": {"name":"Limpwurt root","price":500},
  "245": {"name":"Wine of zamorak","price":800},
  "6731": {"name":"Seers ring","price":500000},
  "6733": {"name":"Archers ring","price":2000000},
  "13227": {"name":"Eternal crystal","price":1000000},
  "13229": {"name":"Pegasian crystal","price":2000000},
  "13231": {"name":"Primordial crystal","price":15000000},
  "436": {"name": "Copper ore", "price": 35},
  "438": {"name": "Tin ore", "price": 35},
  "440": {"name": "Iron ore", "price": 100},
  "453": {"name": "Coal", "price": 150},
  "447": {"name": "Mithril ore", "price": 150},
  "449": {"name": "Adamantite ore", "price": 700},
  "451": {"name": "Runite ore", "price": 10000},
  "2349": {"name": "Bronze bar", "price": 100},
  "2351": {"name": "Iron bar", "price": 200},
  "2353": {"name": "Steel bar", "price": 500},
  "2357": {"name": "Gold bar", "price": 150},
  "2359": {"name": "Mithril bar", "price": 800},
  "2361": {"name": "Adamantite bar", "price": 1800},
  "2363": {"name": "Runite bar", "price": 12000},
  "1511": {"name": "Logs", "price": 40},
  "1521": {"name": "Oak logs", "price": 60},
  "1519": {"name": "Willow logs", "price": 40},
  "1517": {"name": "Maple logs", "price": 30},
  "1513": {"name": "Magic logs", "price": 1000},
  "317": {"name": "Raw shrimps", "price": 20},
  "315": {"name": "Shrimps", "price": 30},
  "335": {"name": "Raw trout", "price": 50},
  "333": {"name": "Trout", "price": 60},
  "359": {"name": "Raw tuna", "price": 80},
  "361": {"name": "Tuna", "price": 100},
  "377": {"name": "Raw lobster", "price": 150},
  "379": {"name": "Lobster", "price": 180},
  "383": {"name": "Raw shark", "price": 600},
  "7946": {"name": "Monkfish", "price": 250},
  "249": {"name": "Guam leaf", "price": 50},
  "255": {"name": "Harralander", "price": 400},
  "259": {"name": "Irit leaf", "price": 800},
  "263": {"name": "Kwuarm", "price": 1800},
  "267": {"name": "Dwarf weed", "price": 1500},
  "221": {"name": "Eye of newt", "price": 5},
  "223": {"name": "Red spiders eggs", "price": 300},
  "231": {"name": "Snape grass", "price": 400},
  "227": {"name": "Vial of water", "price": 5},
  "2428": {"name": "Attack potion(4)", "price": 100},
  "2436": {"name": "Super attack(4)", "price": 1000},
  "2440": {"name": "Super strength(4)", "price": 3000},
  "2444": {"name": "Ranging potion(4)", "price": 2000},
  "5291": {"name": "Guam seed", "price": 5},
  "5295": {"name": "Ranarr seed", "price": 15000},
  "5297": {"name": "Irit seed", "price": 100},
  "5301": {"name": "Cadantine seed", "price": 1000},
  "5303": {"name": "Dwarf weed seed", "price": 500},
  "1739": {"name": "Cowhide", "price": 100},
  "1741": {"name": "Leather", "price": 200},
  "1745": {"name": "Green dragon leather", "price": 1800},
  "1753": {"name": "Green dragonhide", "price": 1500},
  "1747": {"name": "Black dragonhide", "price": 3000},
  "1749": {"name": "Red dragonhide", "price": 2500},
  "526": {"name": "Bones", "price": 50},
  "532": {"name": "Big bones", "price": 200},
  "561": {"name": "Nature rune", "price": 100},
  "554": {"name": "Fire rune", "price": 5},
  "557": {"name": "Earth rune", "price": 5},
  "555": {"name": "Water rune", "price": 5},
  "1436": {"name": "Rune essence", "price": 10},
  "7936": {"name": "Pure essence", "price": 5},
  "52": {"name": "Arrow shaft", "price": 1},
  "53": {"name": "Headless arrow", "price": 10},
  "314": {"name": "Feather", "price": 3},
  "882": {"name": "Bronze arrow", "price": 5},
  "9144": {"name": "Runite bolts", "price": 100},
  "8778": {"name": "Oak plank", "price": 400},
  "8780": {"name": "Teak plank", "price": 800},
  "8782": {"name": "Mahogany plank", "price": 1800},
  "960": {"name": "Plank", "price": 200},
  "11920": {"name": "Dragon pickaxe", "price": 1000000},
  "11907": {"name": "Trident of the seas", "price": 500000},
  "12004": {"name": "Kraken tentacle", "price": 500000},
  "13265": {"name": "Abyssal dagger", "price": 2000000},
  "13233": {"name": "Smouldering stone", "price": 1000000},
  "12002": {"name": "Occult necklace", "price": 500000},
  "12845": {"name": "Super combat potion(4)", "price": 10000},
  "11230": {"name": "Dragon dart", "price": 1000},
  "11212": {"name": "Dragon arrow", "price": 1000},
  "11286": {"name": "Draconic visage", "price": 3000000},
  "12603": {"name": "Tyrannical ring", "price": 500000},
  "12605": {"name": "Treasonous ring", "price": 500000},
  "12601": {"name": "Ring of the gods", "price": 2000000},
  "11931": {"name": "Odium shard 1", "price": 100000},
  "11928": {"name": "Malediction shard 1", "price": 100000},

  "560": {
    "name": "Death rune",
    "price": 156
  },
  "565": {
    "name": "Blood rune",
    "price": 342
  },
  "385": {
    "name": "Shark",
    "price": 810
  },
  "2434": {
    "name": "Prayer potion(4)",
    "price": 8647
  },
  "536": {
    "name": "Dragon bones",
    "price": 3658
  },
  "7416": {
    "name": "Mole claw",
    "price": 5267
  },
  "7418": {
    "name": "Mole skin",
    "price": 4529
  },
  "6291": {
    "name": "Spider carcass",
    "price": 102
  },
  "12934": {
    "name": "Zulrah's scales",
    "price": 139
  },
  "27616": {
    "name": "Ancient essence",
    "price": 16
  },
  "444": {
    "name": "Gold ore",
    "price": 118
  },
  "1515": {
    "name": "Yew logs",
    "price": 86
  },
  "7944": {
    "name": "Raw monkfish",
    "price": 92
  },
  "10034": {
    "name": "Red chinchompa",
    "price": 1272
  },
  "257": {
    "name": "Ranarr weed",
    "price": 5240
  },
  "556": {
    "name": "Air rune",
    "price": 6
  },
  "1751": {
    "name": "Blue dragonhide",
    "price": 1582
  },
  "6737": {
    "name": "Berserker ring",
    "price": 3060762
  },
  "12922": {
    "name": "Tanzanite fang",
    "price": 9128500
  },
  "22111": {
    "name": "Dragonbone necklace",
    "price": 77018
  },
  "27614": {
    "name": "Venator shard",
    "price": 12949001
  },
  "11834": {
    "name": "Bandos tassets",
    "price": 12299118
  },
  "11814": {
    "name": "Saradomin hilt",
    "price": 18758666
  },
  "11824": {
    "name": "Zamorakian spear",
    "price": 673364
  },
  "11828": {
    "name": "Armadyl chestplate",
    "price": 38480000
  },
  "22966": {
    "name": "Hydra's claw",
    "price": 37994026
  },
  "21034": {
    "name": "Dexterous prayer scroll",
    "price": 13801086
  },
  "22477": {
    "name": "Avernic defender hilt",
    "price": 29567610
  },
  "25975": {
    "name": "Lightbearer",
    "price": 3217350
  },
  "4151": {
    "name": "Abyssal whip",
    "price": 754142
  },
  "6585": {
    "name": "Amulet of fury",
    "price": 2190624
  },
  "4749": {
    "name": "Torag's platebody",
    "price": 226796
  },
  "4726": {
    "name": "Guthan's warspear",
    "price": 69546
  },
  "4712": {
    "name": "Ahrim's robetop",
    "price": 1044637
  },
  "4718": {
    "name": "Dharok's greataxe",
    "price": 1431324
  },
  "4736": {
    "name": "Karil's leathertop",
    "price": 655738
  },
  "4757": {
    "name": "Verac's brassard",
    "price": 178708
  },
  "23528": {
    "name": "Sarachnis cudgel",
    "price": 73860
  },
  "21079": {
    "name": "Arcane prayer scroll",
    "price": 3047792
  },
  "21000": {
    "name": "Twisted buckler",
    "price": 12605391
  },
  "21012": {
    "name": "Dragon hunter crossbow",
    "price": 28845662
  },
  "21015": {
    "name": "Dinh's bulwark",
    "price": 8719144
  },
  "13652": {
    "name": "Dragon claws",
    "price": 30497814
  },
  "21018": {
    "name": "Ancestral hat",
    "price": 33148740
  },
  "21021": {
    "name": "Ancestral robe top",
    "price": 84036698
  },
  "21024": {
    "name": "Ancestral robe bottom",
    "price": 57646120
  },
  "21043": {
    "name": "Kodai insignia",
    "price": 45313601
  },
  "21003": {
    "name": "Elder maul",
    "price": 90534824
  },
  "20997": {
    "name": "Twisted bow",
    "price": 1427650000
  },
  "22324": {
    "name": "Ghrazi rapier",
    "price": 17323128
  },
  "22481": {
    "name": "Sanguinesti staff (uncharged)",
    "price": 14196846
  },
  "22326": {
    "name": "Justiciar faceguard",
    "price": 7480331
  },
  "22327": {
    "name": "Justiciar chestguard",
    "price": 7956870
  },
  "22328": {
    "name": "Justiciar legguards",
    "price": 6445823
  },
  "26219": {
    "name": "Osmumten's fang",
    "price": 13002648
  },
  "25985": {
    "name": "Elidinis' ward",
    "price": 3101896
  },
  "27226": {
    "name": "Masori mask",
    "price": 7961984
  },
  "27229": {
    "name": "Masori body",
    "price": 52072824
  },
  "27232": {
    "name": "Masori chaps",
    "price": 39878556
  },
  "27277": {
    "name": "Tumeken's shadow (uncharged)",
    "price": 667056758
  },
  "22486": {
    "name": "Scythe of Vitur (uncharged)",
    "price": 1118641713
  }
};

// Expansion values and upgrade potential are authored simulation estimates.
const expansion = {
  "12819": {"name":"Elysian sigil","price":650000000,"rare":true,"style":"defence","power":0.12,"requiredLevel":80},
  "12827": {"name":"Arcane sigil","price":100000000,"rare":true,"style":"magic","power":0.08,"requiredLevel":80},
  "12823": {"name":"Spectral sigil","price":50000000,"rare":true,"style":"defence","power":0.07,"requiredLevel":70},
  "26376": {"name":"Torva full helm (damaged)","price":100000000,"rare":true,"style":"melee","power":0.07,"requiredLevel":80},
  "26378": {"name":"Torva platebody (damaged)","price":250000000,"rare":true,"style":"melee","power":0.1,"requiredLevel":80},
  "26380": {"name":"Torva platelegs (damaged)","price":180000000,"rare":true,"style":"melee","power":0.09,"requiredLevel":80},
  "26235": {"name":"Zaryte vambraces","price":75000000,"rare":true,"style":"ranged","power":0.1,"requiredLevel":70},
  "26372": {"name":"Nihil horn","price":300000000,"rare":true,"style":"ranged","power":0.12,"requiredLevel":80},
  "24419": {"name":"Inquisitor's great helm","price":45000000,"rare":true,"style":"melee","power":0.07,"requiredLevel":70},
  "24420": {"name":"Inquisitor's hauberk","price":80000000,"rare":true,"style":"melee","power":0.09,"requiredLevel":70},
  "24421": {"name":"Inquisitor's plateskirt","price":60000000,"rare":true,"style":"melee","power":0.08,"requiredLevel":70},
  "24417": {"name":"Inquisitor's mace","price":400000000,"rare":true,"style":"melee","power":0.16,"requiredLevel":80},
  "24422": {"name":"Nightmare staff","price":25000000,"rare":true,"style":"magic","power":0.07,"requiredLevel":70},
  "24511": {"name":"Harmonised orb","price":350000000,"rare":true,"style":"magic","power":0.14,"requiredLevel":80},
  "24514": {"name":"Volatile orb","price":60000000,"rare":true,"style":"magic","power":0.1,"requiredLevel":70},
  "24517": {"name":"Eldritch orb","price":200000000,"rare":true,"style":"magic","power":0.12,"requiredLevel":80},
  "26241": {"name":"Virtus mask","price":8000000,"rare":true,"style":"magic","power":0.04,"requiredLevel":70},
  "26243": {"name":"Virtus robe top","price":35000000,"rare":true,"style":"magic","power":0.08,"requiredLevel":70},
  "26245": {"name":"Virtus robe bottom","price":22000000,"rare":true,"style":"magic","power":0.06,"requiredLevel":70},
  "28334": {"name":"Awakener's orb","price":1000000,"rare":true},
  "23956": {"name":"Crystal armour seed","price":5000000,"rare":true,"style":"ranged","power":0.05,"requiredLevel":70},
  "25859": {"name":"Enhanced crystal weapon seed","price":100000000,"rare":true,"style":"ranged","power":0.13,"requiredLevel":80},
  "3140": {"name":"Dragon chainbody","price":180000,"rare":true,"style":"melee","power":0.025,"requiredLevel":70},
  "7158": {"name":"Dragon 2h sword","price":130000,"rare":true,"style":"melee","power":0.025,"requiredLevel":70},
  "13265": {"name":"Abyssal dagger","price":2000000,"rare":true,"style":"melee","power":0.04,"requiredLevel":70},
  "21742": {"name":"Granite hammer","price":100000,"rare":true,"style":"melee","power":0.025,"requiredLevel":70},
  "27684": {"name":"Voidwaker blade","price":12000000,"rare":true,"style":"melee","power":0.06,"requiredLevel":70},
  "27687": {"name":"Voidwaker gem","price":35000000,"rare":true,"style":"melee","power":0.08,"requiredLevel":70},
  "27681": {"name":"Voidwaker hilt","price":18000000,"rare":true,"style":"melee","power":0.07,"requiredLevel":70},
  "12601": {"name":"Ring of the gods","price":3000000,"rare":true,"style":"defence","power":0.04,"requiredLevel":70},
  "12603": {"name":"Tyrannical ring","price":500000,"rare":true,"style":"melee","power":0.025,"requiredLevel":70},
  "12605": {"name":"Treasonous ring","price":500000,"rare":true,"style":"melee","power":0.025,"requiredLevel":70},
  "22372": {"name":"Bryophyta's essence","price":6000000,"rare":true,"style":"magic","power":0.04,"requiredLevel":70},
  "20756": {"name":"Hill giant club","price":500000,"rare":true,"style":"melee","power":0.03,"requiredLevel":70},
  "29796": {"name":"Noxious halberd","price":18000000,"rare":true,"style":"melee","power":0.09,"requiredLevel":70},
  "30750": {"name":"Oathplate helm","price":100000000,"rare":true,"style":"melee","power":0.08,"requiredLevel":80},
  "30753": {"name":"Oathplate chest","price":250000000,"rare":true,"style":"melee","power":0.12,"requiredLevel":80},
  "30756": {"name":"Oathplate legs","price":180000000,"rare":true,"style":"melee","power":0.1,"requiredLevel":80},
  "30759": {"name":"Soulflame horn","price":250000000,"rare":true,"style":"melee","power":0.13,"requiredLevel":80},
  "31088": {"name":"Avernic treads","price":150000000,"rare":true,"style":"all","power":0.09,"requiredLevel":80},
  "31115": {"name":"Eye of Ayak (uncharged)","price":80000000,"rare":true,"style":"magic","power":0.11,"requiredLevel":70},
  "12932": {"name":"Magic fang","price":8000000,"rare":true,"style":"magic","power":0.07,"requiredLevel":70},
  "12927": {"name":"Serpentine visage","price":3000000,"rare":true,"style":"defence","power":0.04,"requiredLevel":70},
  "11832": {"name":"Bandos chestplate","price":25000000,"rare":true,"style":"melee","power":0.06,"requiredLevel":70},
  "11836": {"name":"Bandos boots","price":1000000,"rare":true,"style":"melee","power":0.03,"requiredLevel":70},
  "11812": {"name":"Bandos hilt","price":10000000,"rare":true,"style":"melee","power":0.05,"requiredLevel":70},
  "11826": {"name":"Armadyl helmet","price":4000000,"rare":true,"style":"ranged","power":0.04,"requiredLevel":70},
  "11830": {"name":"Armadyl chainskirt","price":25000000,"rare":true,"style":"ranged","power":0.06,"requiredLevel":70},
  "11810": {"name":"Armadyl hilt","price":8000000,"rare":true,"style":"ranged","power":0.05,"requiredLevel":70},
  "11785": {"name":"Armadyl crossbow","price":50000000,"rare":true,"style":"ranged","power":0.09,"requiredLevel":70},
  "11838": {"name":"Saradomin sword","price":500000,"rare":true,"style":"melee","power":0.03,"requiredLevel":70},
  "11816": {"name":"Zamorak hilt","price":3000000,"rare":true,"style":"melee","power":0.04,"requiredLevel":70},
  "22983": {"name":"Hydra leather","price":8000000,"rare":true,"style":"melee","power":0.05,"requiredLevel":70},
};
for (const [id, item] of Object.entries(expansion)) items[id] = { ...item, ...items[id], rare: true, ...(item.style ? { style: item.style, power: item.power, requiredLevel: item.requiredLevel } : {}) };
const existingGear = {"20997": {"style": "ranged", "power": 0.18, "requiredLevel": 85}, "22486": {"style": "melee", "power": 0.18, "requiredLevel": 80}, "27277": {"style": "magic", "power": 0.18, "requiredLevel": 85}, "21003": {"style": "melee", "power": 0.12, "requiredLevel": 80}, "13652": {"style": "melee", "power": 0.1, "requiredLevel": 60}, "26219": {"style": "melee", "power": 0.09, "requiredLevel": 82}, "22324": {"style": "melee", "power": 0.08, "requiredLevel": 80}, "22481": {"style": "magic", "power": 0.09, "requiredLevel": 82}, "4151": {"style": "melee", "power": 0.04, "requiredLevel": 70}, "12922": {"style": "ranged", "power": 0.07, "requiredLevel": 75}, "11834": {"style": "melee", "power": 0.05, "requiredLevel": 65}, "11828": {"style": "ranged", "power": 0.06, "requiredLevel": 70}, "22966": {"style": "melee", "power": 0.08, "requiredLevel": 78}, "27614": {"style": "ranged", "power": 0.06, "requiredLevel": 80}};
for (const [id, gear] of Object.entries(existingGear)) Object.assign(items[id], gear, {rare:true});
for (const id of [2577,4749,4726,4712,4718,4736,4757,23528,21034,21079,21000,21012,21015,21018,21021,21024,21043,22326,22327,22328,25975,25985,27226,27229,27232,22477,11814,11824,12004,12002,13227,13229,13231,13233,11286,11920,6731,6733,6737,22111]) items[id].rare = true;
export default items;
