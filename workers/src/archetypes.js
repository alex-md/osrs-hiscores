// Internal motives. The website describes observed activities, never these labels.
export const EXPANDED_ARCHETYPES = {
  RAID_SPECIALIST: { weight:3, activity:'PVMER', focus:['ranged','magic','prayer','herblore'], bossChance:.82, raidWeight:12, description:'Long raids and repeat completions.' },
  COLLECTION_HUNTER: { weight:4, activity:'FOCUSED', focus:['slayer','hunter','magic'], bossChance:.64, collection:true, clueChance:.16, description:'Unseen encounters and missing rare rewards.' },
  CLUE_HUNTER: { weight:4, activity:'FOCUSED', focus:['agility','thieving','hunter','sailing'], bossChance:.08, clueChance:.72, description:'Treasure trails between short skill sessions.' },
  WANDERER: { weight:5, activity:'CASUAL', focus:['sailing','agility','hunter','farming'], bossChance:.12, clueChance:.25, goalHours:.4, description:'Short varied goals and exploration.' },
  COMPLETIONIST: { weight:3, activity:'SKILLER', focus:[], bossChance:.24, completion:3.5, description:'Raise neglected skills and visit untried encounters.' },
  GATHERER: { weight:5, activity:'AFKER', focus:['mining','fishing','woodcutting','hunter','farming'], bossChance:.025, description:'Long resource-gathering sessions.' },
  ARTISAN: { weight:4, activity:'FOCUSED', focus:['smithing','crafting','fletching','construction','herblore'], bossChance:.025, description:'Making things, regardless of bank size.' },
  SLAYER_SPECIALIST: { weight:3, activity:'PVMER', focus:['slayer','attack','strength','defence'], bossChance:.58, slayerWeight:10, description:'Slayer training and unlocked Slayer bosses.' },
  RUNE_SCHOLAR: { weight:3, activity:'FOCUSED', focus:['runecraft','magic','prayer'], bossChance:.06, description:'The patient rune and magic ladders.' },
  WEEKEND_WARRIOR: { weight:5, activity:'CASUAL', focus:[], bossChance:.35, calendar:'weekend', description:'Quiet weekdays and intense weekends.' },
  COMEBACK_KID: { weight:3, activity:'FOCUSED', focus:[], bossChance:.3, calendar:'comeback', description:'Multi-day absences followed by bursts of activity.' },
  SINGLE_SKILL_PURIST: { weight:2, activity:'SKILLER', focus:[], bossChance:.01, specialty:true, description:'A persistent personal skill, including post-99 records.' },
  CROWN_CHASER: { weight:2, activity:'HARDCORE', focus:[], bossChance:.08, crowns:true, description:'Skills where another crown looks reachable.' },
};
export const archetypePolicy = key => EXPANDED_ARCHETYPES[key] || {};

export function careerPhase(user, date) {
  const calendar=archetypePolicy(user.archetype).calendar;
  if(calendar==='weekend')return [0,6].includes(date.getUTCDay())?'surge':'quiet';
  if(calendar==='comeback') {
    const offset=Math.floor((user.career.aptitude*17+user.career.dedication*31)%10);
    const day=(Math.floor(+date/86400000)+offset)%10;
    return day<3?'away':day<6?'surge':'steady';
  }
  return 'steady';
}

export function adoptExpandedCareer(user, date) {
  if(user.career.identityVersion>=2)return false;
  user.career.identityVersion=2;
  // Existing generalists can discover a direction once. Their progress is intact.
  const generic=['CASUAL','FOCUSED','AFKER','IDLER','SOCIALITE'];
  if(!generic.includes(user.archetype) || !user.createdAt)return false;
  let hash=2166136261;
  for(const c of `${user.career.aptitude}:${user.career.risk}:${user.career.thrift}`)hash=Math.imul(hash^c.charCodeAt(0),16777619);
  const roll=(hash>>>0)/2**32;
  if(roll>=.42)return false;
  const keys=Object.keys(EXPANDED_ARCHETYPES);
  const next=keys[Math.min(keys.length-1,Math.floor(roll/.42*keys.length))];
  user.career.previousArchetype=user.archetype;
  user.archetype=next;
  user.career.directionSince=+date;
  // Rebuild preferences for the new direction on this simulation update.
  delete user.multipliers;delete user.trainingState;
  return true;
}
