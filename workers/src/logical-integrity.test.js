import test from 'node:test';
import assert from 'node:assert/strict';
import { SKILLS } from './constants.js';
import { BOSSES } from '../../frontend/lib/activities.js';
import items from '../../frontend/lib/items.js';
import { normalizeUser } from './store.js';
import { xpForLevel } from './utils.js';
import { progressBossing, progressSkillingEconomy, progressClues, eligibleBosses, bossCombatSkills, valueBank } from './economy.js';
import { SKILL_OUTPUTS, skillingItem, MARKET_MODEL } from './market.js';
const at = new Date('2026-11-15T00:00Z');
function player(cash = 1000000, level = 80) {
  const u = normalizeUser({ username:'Integrity', archetype:'PVMER', skills:Object.fromEntries(SKILLS.map(s => [s,{xp:xpForLevel(level)}])), economy:{cash,holdings:{},bankValue:cash,inventoryVersion:2} });
  valueBank(u); return u;
}
const seeded = initial => { let n=initial; return () => ((n=(Math.imul(n,1664525)+1013904223)>>>0)/2**32); };

test('funded buyable methods scale down to pre-session assets without borrowing', () => {
  for (const skill of ['construction','herblore','prayer','crafting','smithing','fletching','firemaking','cooking','magic','sailing']) {
    const u=player(1000);
    const result=progressSkillingEconomy(u,at,{skill,hours:1,rng:()=>.5});
    assert.ok(result.fraction>0 && result.fraction<1,skill);
    assert.equal(u.economy.lastSession.unpaid,0,skill);
    assert.ok(u.economy.spent<=1000,skill);
    assert.equal(u.economy.lastSession.earned,0,skill);
    assert.ok(u.economy.cash>=0);
    const broke=player(0);
    assert.equal(progressSkillingEconomy(broke,at,{skill,hours:1}).fraction,0);
  }
});
test('boss rewards cannot finance their own attempts, including high-price supplies', () => {
  for(let seed=1;seed<=100;seed++) {
    const u=player(30000);
    const market={model:MARKET_MODEL,prices:{385:items[385].price*8,2434:items[2434].price*8}};
    const result=progressBossing(u,at,{hours:.25,scale:31,rng:seeded(seed),market});
    if(result.active) {
      assert.ok(u.economy.lastSession.spent<=30000);
      assert.equal(u.economy.lastSession.unpaid,0);
      assert.ok(Object.keys(result.gains).filter(s=>s!=='hitpoints'&&s!=='slayer')
        .every(s=>bossCombatSkills(u,BOSSES.find(b=>b.key===result.boss)).includes(s)));
    }
  }
});
test('zero-cost encounters remain finite and can progress without a bank', () => {
  const u=player(0,99);
  u.career.pendingRaid='the-gauntlet';
  const result=progressBossing(u,at,{hours:.25,scale:31,rng:()=>.01});
  assert.equal(result.boss,'the-gauntlet');
  assert.ok(Object.values(result.gains).every(Number.isFinite));
  assert.ok(Number.isFinite(u.career.raidProgress['the-gauntlet']));
  assert.equal(u.economy.lastSession.spent,0);
});
test('inflated total combat cannot unlock bosses without an offensive style', () => {
  const u=player(1000000,99);
  for(const s of ['attack','strength','ranged','magic'])u.skills[s]={xp:0,level:1};
  assert.equal(eligibleBosses(u).length,0);
  u.skills.magic={xp:xpForLevel(99),level:99};
  assert.deepEqual(bossCombatSkills(u,BOSSES.find(b=>b.key==='kraken')),['magic']);
  assert.ok(!eligibleBosses(u).some(b=>b.key==='dagannoth-supreme'));
});
test('gathering outputs obey their tier boundaries and reference priced resources', () => {
  for(const [skill,tiers] of Object.entries(SKILL_OUTPUTS)) {
    for(const [level,id] of tiers) {
      assert.ok(items[id]?.price>0);
      assert.equal(skillingItem(skill,level),id);
      if(level>1) assert.notEqual(skillingItem(skill,level-1),id);
    }
  }
  for(const [skill,id] of [['mining',436],['woodcutting',1511],['fishing',317]]) {
    const u=player(10000,1);
    progressSkillingEconomy(u,at,{skill,hours:1,rng:()=>.5});
    assert.ok(u.economy.flows.created[id]>0);
    assert.ok(Object.keys(u.economy.flows.created).every(key=>Number(key)===id));
  }
});
test('unfunded clue expeditions cannot create caskets or reward-funded steps', () => {
  const u=player(0);
  u.career.clues={steps:3.9,completed:0};
  const before=structuredClone(u.career.clues);
  const result=progressClues(u,at,{hours:.25,scale:31,rng:()=>.01});
  assert.equal(result.active,false);
  assert.deepEqual(u.career.clues,before);
  assert.equal(u.economy.cash,0);
});
