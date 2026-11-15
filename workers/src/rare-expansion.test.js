import test from 'node:test';
import assert from 'node:assert/strict';
import { BOSSES } from '../../frontend/lib/activities.js';
import items from '../../frontend/lib/items.js';
import { normalizeUser } from './store.js';
import { SKILLS } from './constants.js';
import { xpForLevel } from './utils.js';
import { bossDropTable,rollBossDrops,valueBank,progressSkillingEconomy } from './economy.js';
import { tradeRares } from './rare-trading.js';
import { equipmentBonus,trainingBenefits } from './wealth-progression.js';
import { progressUser } from './simulation.js';
const at=new Date('2026-11-04T19:00:00Z');
function player(username,cash=0,holdings={},level=99) {
  const user=normalizeUser({username,archetype:'PVMER',skills:Object.fromEntries(SKILLS.map(s=>[s,{xp:xpForLevel(level)}])),
    economy:{bankValue:cash,cash,holdings,inventoryVersion:2}});
  valueBank(user);user.career.thrift=.9;return user;
}
const totalWealth = users => users.reduce((sum,u)=>sum+u.economy.bankValue,0);

test('48 encounters have valid unique keys, valued integer rewards and bounded probability groups',()=>{
  assert.equal(BOSSES.length,48);assert.equal(new Set(BOSSES.map(b=>b.key)).size,48);
  for (const boss of BOSSES) {
    const groups={};
    for (const drop of bossDropTable(boss)) {
      assert.ok(items[drop.id]?.price>0,`${boss.key}:${drop.id}`);
      assert.ok(Number.isSafeInteger(drop.quantity)&&drop.quantity>0);
      assert.ok(drop.chance>0&&drop.chance<=1);
      if(drop.rare) groups[drop.group || 'unique']=(groups[drop.group || 'unique'] || 0)+drop.chance;
    }
    assert.ok(Object.values(groups).every(p=>p<=1),boss.key);
  }
  for(const id of [20997,22486,27277]) assert.ok(items[id].rare && items[id].power>0);
  const nightmare=BOSSES.find(b=>b.key==='nightmare');
  // Armour/staff and orb tables are independent, unlike mutually exclusive purples.
  const double=rollBossDrops({...nightmare,drops:[{id:24417,quantity:1,chance:1,rare:true},{id:24511,quantity:1,chance:1,rare:true,group:'orbs'}]},1,()=>.5);
  assert.equal(double.drops,2);assert.equal(double.rewards[24417],1);assert.equal(double.rewards[24511],1);
});

test('player rare trades conserve items and wealth less tax, transfer cash and retain discovery records',()=>{
  const seller=player('Finder',0,{20997:2}),buyer=player('Buyer',5_000_000_000);
  seller.economy.rareFinds={20997:{quantity:2,firstAt:1,lastAt:2,boss:'chambers-of-xeric'}};
  const original=totalWealth([seller,buyer]),cash=seller.economy.cash;
  const result=tradeRares([seller,buyer],at,null,{rng:()=>0});
  assert.equal(result.summary.playerTrades,1);
  assert.equal(seller.economy.holdings[20997],1);assert.equal(buyer.economy.holdings[20997],1);
  assert.equal(totalWealth([seller,buyer]),original-result.summary.tax);
  assert.equal(seller.economy.cash-cash,items[20997].price-result.summary.tax);
  assert.equal(buyer.economy.cash,5_000_000_000-items[20997].price);
  assert.equal(seller.economy.rareFinds[20997].quantity,2);
  assert.equal(buyer.economy.rareFinds,undefined);
  assert.equal(buyer.economy.trades[0].counterparty,'Finder');
  assert.equal(equipmentBonus(buyer,'ranged'),.18);
  assert.ok(trainingBenefits(seller,'construction',.2,29).funded>0);
});

test('outside stock requires a real sale, later purchases consume stock and reconcile boundary flows',()=>{
  const finder=player('OutsideSale',0,{22486:2});
  const before=finder.economy.bankValue;
  const sold=tradeRares([finder],at,null,{rng:()=>0});
  assert.equal(sold.summary.outsideSales,1);assert.equal(sold.stock[22486],1);
  assert.equal(finder.economy.bankValue,before-sold.summary.tax);
  assert.equal(finder.economy.flows.coinFaucets,items[22486].price);
  const buyer=player('LaterBuyer',5_000_000_000);
  const bought=tradeRares([buyer],new Date(+at+900000),sold,{rng:()=>0});
  assert.equal(bought.summary.outsidePurchases,1);assert.equal(bought.stock[22486],0);
  assert.equal(buyer.economy.holdings[22486],1);
  assert.equal(buyer.economy.bankValue,5_000_000_000);
  assert.equal(buyer.economy.flows.coinSinks,items[22486].price);
  const noStock=player('NoStock',5_000_000_000);
  assert.equal(tradeRares([noStock],at,null,{rng:()=>0}).summary.outsidePurchases,0);
});

test('kept mega-rares survive unfunded costs and duplicate power never stacks',()=>{
  const user=player('Keep',0,{27277:1});
  progressSkillingEconomy(user,at,{skill:'construction',hours:20,rng:()=>.5});
  assert.equal(user.economy.holdings[27277],1);assert.equal(user.economy.cash,0);
  assert.equal(user.economy.unpaidCosts || 0,0);assert.equal(equipmentBonus(user,'magic'),.18);
  user.economy.holdings[27277]=100;assert.equal(equipmentBonus(user,'magic'),.18);
  const low=player('TooLow',0,{27277:1},1);assert.equal(equipmentBonus(low,'magic'),0);
  const benefits=trainingBenefits(user,'magic',.25,70);
  assert.ok(benefits.multiplier>1 && benefits.multiplier<=1.53);
  user.archetype='COLLECTION_HUNTER';
  user.economy.holdings[27277]=1;
  tradeRares([user],at,null,{rng:()=>0});assert.equal(user.economy.holdings[27277],1);
});

test('empty banks earn supplies, funded training pays costs, and inactive accounts gain no XP',t=>{
  t.mock.method(Math,'random',()=>.999);
  const poor=player('Matched',0,{},1),rich=structuredClone(poor);
  rich.economy.cash=20_000_000;valueBank(rich);
  for(const user of [poor,rich]) user.trainingState={aptitude:1,fatigue:0,momentum:1,remaining:8,phase:'steady',phaseRemaining:3,focusSkill:'construction',targetXP:200000000};
  const start=poor.totalXP;
  progressUser(poor,at,{rng:()=>.5});progressUser(rich,at,{rng:()=>.5});
  assert.ok(poor.totalXP>start);assert.equal(poor.skills.construction.level,1);assert.ok(poor.skills.thieving.xp>0);
  assert.equal(poor.progress.lastSession.wealthScale,1);
  assert.ok(rich.totalXP>poor.totalXP);assert.ok(rich.progress.lastSession.benefits.fundingCost>0);
  assert.ok(rich.economy.cash<20_000_000);
  const inactive=player('Idle',0,{},1),saved=inactive.totalXP;
  progressUser(inactive,at,{hours:0,rng:()=>.5});assert.equal(inactive.totalXP,saved);
  assert.deepEqual(tradeRares([inactive],at,null,{hours:0,rng:()=>0}).summary,{timestamp:+at,playerTrades:0,outsideSales:0,outsidePurchases:0,volume:0,tax:0});
});

test('all main-account archetypes can trade, respecting cash, upgrade choices and bounded ledgers',()=>{
  const seller=player('Seller',0,{20997:2}),broke=player('Broke',0),low=player('Low',5_000_000_000,{},1),iron=player('Iron',5_000_000_000);
  iron.archetype='IRON_SOUL';
  tradeRares([seller,broke,low,iron],at,null,{rng:()=>0});
  for(const user of [broke,low]) assert.equal(user.economy.holdings[20997],undefined);
  assert.equal(iron.economy.holdings[20997],1);
  const collector=player('Lots',0,{20997:100}),prev={stock:{},summary:{}};
  for(let tick=0;tick<12;tick++) Object.assign(prev,tradeRares([collector],new Date(+at+tick*900000),prev,{rng:()=>0}));
  assert.equal(collector.economy.trades.length,8);assert.equal(collector.economy.tradeCount,12);
  assert.ok(collector.economy.cash>=0);
});

test('a retained mega-rare increases future combat training without an instant XP grant',t=>{
  t.mock.method(Math,'random',()=>.999);
  const base=player('MatchedBow',0,{},85);base.archetype='CASUAL';base.career.identityVersion=2;
  base.trainingState={aptitude:1,fatigue:0,momentum:1,remaining:8,phase:'steady',phaseRemaining:3,focusSkill:'ranged',targetXP:200000000};
  const owner=structuredClone(base),startXP=base.totalXP;
  owner.economy.holdings[20997]=1;valueBank(owner);
  assert.equal(owner.totalXP,startXP);
  progressUser(base,at,{rng:()=>.5});progressUser(owner,at,{rng:()=>.5});
  assert.equal(owner.progress.lastSession.trainingSkill,'ranged');
  assert.ok(base.totalXP>startXP);assert.ok(owner.totalXP>base.totalXP);
  assert.equal(owner.progress.lastSession.benefits.equipment,.18);
  assert.equal(owner.economy.holdings[20997],1);
  assert.ok(owner.skills.ranged.level>85);
});
