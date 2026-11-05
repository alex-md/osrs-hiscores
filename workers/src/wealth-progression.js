import items from '../../frontend/lib/items.js';
const combatSkills = ['attack','strength','defence','ranged','magic','slayer','hitpoints'];
const styleFor = skill => ['attack','strength'].includes(skill) ? 'melee' : skill;
const buyables = new Set(['construction','herblore','prayer','crafting','smithing','fletching','firemaking','cooking','magic','sailing']);

// Upgrade potential is a simulation estimate, including converting components.
// Best relevant upgrade wins: hoarding duplicate mega-rares cannot stack power.
export function equipmentBonus(user, skill = null) {
  let best = 0;
  for (const [id, quantity] of Object.entries(user.economy?.holdings || {})) {
    const item = items[id];
    if (!(quantity > 0) || !item?.power) continue;
    const relevant = skill ? item.style === 'all' || item.style === styleFor(skill) || skill === 'slayer' : true;
    const gate = item.style === 'melee' ? Math.min(user.skills.attack?.level || 1,user.skills.strength?.level || 1)
      : item.style === 'all' ? Math.min(user.skills.attack?.level || 1,user.skills.ranged?.level || 1,user.skills.magic?.level || 1)
      : user.skills[item.style]?.level || 1;
    if (relevant && gate >= item.requiredLevel) best = Math.max(best, item.power);
  }
  return Math.min(.18,best);
}
export function trainingBenefits(user, skill, hours, scale) {
  if (!skill || !(hours > 0)) return { multiplier:1, wealth:0, equipment:0, funded:0, fundingCost:0 };
  const wealth = .10 * Math.min(1, Math.log1p(Math.max(0,user.economy.bankValue) / 1_000_000) / Math.log(1001));
  const equipment = combatSkills.includes(skill) ? equipmentBonus(user,skill) : 0;
  const budget = buyables.has(skill) ? Math.max(1,Math.ceil(hours * scale * 200000)) : 0;
  // Only disposable cash funds an extra method bonus. Free base XP always runs.
  const fundingCost = Math.min(budget,Math.floor(Math.max(0,user.economy.cash - 100000) * .02));
  const funded = budget ? .25 * fundingCost / budget : 0;
  return { multiplier:1+wealth+equipment+funded, wealth,equipment,funded,fundingCost };
}
