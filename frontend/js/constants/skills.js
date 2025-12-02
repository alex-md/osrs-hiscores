export const SKILLS = [
  'attack',
  'defence',
  'strength',
  'hitpoints',
  'ranged',
  'prayer',
  'magic',
  'cooking',
  'woodcutting',
  'fletching',
  'fishing',
  'firemaking',
  'crafting',
  'smithing',
  'mining',
  'herblore',
  'agility',
  'thieving',
  'slayer',
  'farming',
  'runecraft',
  'hunter',
  'construction'
];

export const SKILL_ICONS = {
  attack: 'https://oldschool.runescape.wiki/images/thumb/f/fe/Attack_icon.png/21px-Attack_icon.png',
  defence: 'https://oldschool.runescape.wiki/images/thumb/b/b8/Defence_icon.png/21px-Defence_icon.png',
  strength: 'https://oldschool.runescape.wiki/images/thumb/1/1b/Strength_icon.png/21px-Strength_icon.png',
  hitpoints: 'https://oldschool.runescape.wiki/images/thumb/8/8c/Hitpoints_icon.png/21px-Hitpoints_icon.png',
  ranged: 'https://oldschool.runescape.wiki/images/thumb/1/19/Ranged_icon.png/21px-Ranged_icon.png',
  prayer: 'https://oldschool.runescape.wiki/images/thumb/f/f2/Prayer_icon.png/21px-Prayer_icon.png',
  magic: 'https://oldschool.runescape.wiki/images/thumb/5/5c/Magic_icon.png/21px-Magic_icon.png',
  cooking: 'https://oldschool.runescape.wiki/images/thumb/4/43/Cooking_icon.png/21px-Cooking_icon.png',
  woodcutting: 'https://oldschool.runescape.wiki/images/thumb/f/f4/Woodcutting_icon.png/21px-Woodcutting_icon.png',
  fletching: 'https://oldschool.runescape.wiki/images/thumb/2/23/Fletching_icon.png/21px-Fletching_icon.png',
  fishing: 'https://oldschool.runescape.wiki/images/thumb/0/05/Fishing_icon.png/21px-Fishing_icon.png',
  firemaking: 'https://oldschool.runescape.wiki/images/thumb/9/9b/Firemaking_icon.png/21px-Firemaking_icon.png',
  crafting: 'https://oldschool.runescape.wiki/images/thumb/0/06/Crafting_icon.png/21px-Crafting_icon.png',
  smithing: 'https://oldschool.runescape.wiki/images/thumb/d/dd/Smithing_icon.png/21px-Smithing_icon.png',
  mining: 'https://oldschool.runescape.wiki/images/thumb/4/4a/Mining_icon.png/21px-Mining_icon.png',
  herblore: 'https://oldschool.runescape.wiki/images/thumb/3/34/Herblore_icon.png/21px-Herblore_icon.png',
  agility: 'https://oldschool.runescape.wiki/images/thumb/0/0a/Agility_icon.png/21px-Agility_icon.png',
  thieving: 'https://oldschool.runescape.wiki/images/thumb/4/4a/Thieving_icon.png/21px-Thieving_icon.png',
  slayer: 'https://oldschool.runescape.wiki/images/thumb/2/28/Slayer_icon.png/21px-Slayer_icon.png',
  farming: 'https://oldschool.runescape.wiki/images/thumb/f/fc/Farming_icon.png/21px-Farming_icon.png',
  runecraft: 'https://oldschool.runescape.wiki/images/thumb/6/63/Runecraft_icon.png/21px-Runecraft_icon.png',
  hunter: 'https://oldschool.runescape.wiki/images/thumb/d/dd/Hunter_icon.png/21px-Hunter_icon.png',
  construction: 'https://oldschool.runescape.wiki/images/thumb/f/f6/Construction_icon.png/21px-Construction_icon.png'
};

export function getSkillIcon(skillName) {
  return SKILL_ICONS[skillName] || '';
}
