// Compact readiness model. Actual items are owned; these ratings approximate
// upgrades rather than reproducing OSRS accuracy rolls and attack styles.
export const EQUIPMENT = [
  {id:4151,slot:'weapon',power:25,requirements:{attack:70}},
  {id:13265,slot:'weapon',power:28,requirements:{attack:70}},
  {id:22324,slot:'weapon',power:40,requirements:{attack:80}},
  {id:20997,slot:'weapon',power:60,requirements:{ranged:85}},
  {id:11907,slot:'weapon',power:20,requirements:{magic:75}},
  {id:27277,slot:'weapon',power:65,requirements:{magic:85}},
  {id:6585,slot:'necklace',power:10,requirements:{}},
  {id:12002,slot:'necklace',power:12,requirements:{magic:70}},
  {id:11828,slot:'body',power:25,requirements:{defence:70,ranged:70}},
  {id:21021,slot:'body',power:30,requirements:{defence:65,magic:75}},
  {id:11834,slot:'legs',power:20,requirements:{defence:65}},
  {id:21024,slot:'legs',power:25,requirements:{defence:65,magic:75}},
  {id:6737,slot:'ring',power:8,requirements:{}},
  {id:25975,slot:'ring',power:12,requirements:{}},
];
export const canEquip = (user, item) => Object.entries(item.requirements).every(([skill, level]) => (user.skills[skill]?.level || 1) >= level);
export function equipped(user) {
  const slots = {};
  for (const item of EQUIPMENT) if (canEquip(user,item) && user.economy.holdings[item.id] > 0 && item.power > (slots[item.slot]?.power || 0)) slots[item.slot] = item;
  return Object.values(slots);
}
export function nextUpgrade(user, prices) {
  const current = new Map(equipped(user).map(item => [item.slot,item.power]));
  return EQUIPMENT.filter(item => canEquip(user,item) && item.power > (current.get(item.slot) || 0) && prices[item.id]*3 <= user.economy.cash)
    .sort((a,b) => prices[a.id]/(a.power-(current.get(a.slot)||0)) - prices[b.id]/(b.power-(current.get(b.slot)||0)))[0];
}
