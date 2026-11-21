import test from 'node:test';
import assert from 'node:assert/strict';
import { festivalWeek, recordFestival, buildFestival, rollRelic, discoveryCount } from './festival.js';
import { buildCollectionHall } from './collection-hall.js';
import { normalizeUser } from './store.js';
import { progressUser } from './simulation.js';
import { evaluateAchievements } from './achievements.js';
import { BOSSES } from '../../frontend/lib/activities.js';
import { SKILLS } from './constants.js';
const now = Date.parse('2026-11-21T12:00:00Z');
const player = username => normalizeUser({username, createdAt:now-86400000, skills:Object.fromEntries(SKILLS.map(s=>[s,{xp:20_000_000}]))});

test('festival rolls on Monday UTC, rotates all trainable skills and never selects HP',()=>{
  const monday=Date.parse('2026-11-23T00:00:00Z');
  assert.equal(festivalWeek(monday-1).end,monday);
  assert.equal(festivalWeek(monday).start,monday);
  const skills = new Set(Array.from({length:23},(_,i)=>festivalWeek(monday+i*7*86400000).skill));
  assert.equal(skills.size,23);assert.ok(!skills.has('hitpoints'));
});
test('scores use earned deltas, reset weekly and lock newcomer eligibility',()=>{
  const a=player('Ada');a.createdAt=now-100*86400000;
  recordFestival(a,new Date(now),{gainedXP:500,skillXP:50,kills:2,discoveries:1});
  recordFestival(a,new Date(now+900000),{gainedXP:100});
  assert.equal(a.festival.xp,600);assert.equal(a.festival.newcomer,false);
  assert.equal(a.festival.bosses,2);
  recordFestival(a,new Date(festivalWeek(now).end),{gainedXP:30});
  assert.equal(a.festival.xp,30);assert.equal(a.festival.discoveries,0);
});
test('closed results retain last capture, award each division once and bound the archive',()=>{
  const a=player('Ada'), b=player('Bea');
  recordFestival(a,new Date(now),{gainedXP:100,kills:10});
  recordFestival(b,new Date(now),{gainedXP:200,kills:1});
  const first=buildFestival([a,b],null,now);
  const closed=buildFestival([a,b],first,first.end+1);
  assert.equal(closed.archive[0].observedAt,now);
  assert.equal(b.festivalWins,2);assert.equal(a.festivalWins,2);
  assert.ok(evaluateAchievements(a).has('festival-champion'));
  buildFestival([a,b],closed,first.end+2);
  assert.equal(a.festivalWins,2);
  const later=buildFestival([a,b],{...first,archive:Array.from({length:8},(_,i)=>({id:'old'+i}))},first.end+1);
  assert.equal(later.archive.length,8);
});
test('relics require completed encounters and are permanent, unique, and worthless to the bank',()=>{
  const a=player('Ada'), cash=a.economy.cash, kc=a.bosses.scurrius;
  assert.equal(rollRelic(a,'scurrius',0,new Date(now),()=>0),false);
  assert.equal(rollRelic(a,'unknown',100,new Date(now),()=>0),false);
  assert.equal(rollRelic(a,'scurrius',1,new Date(now),()=>0),true);
  assert.equal(rollRelic(a,'scurrius',1,new Date(now+1),()=>0),false);
  assert.equal(a.expedition.relics.scurrius,now);assert.equal(a.bosses.scurrius,kc);assert.equal(a.economy.cash,cash);
  assert.equal(discoveryCount(a),1);
  const b=player('Bea');let draws=0;
  rollRelic(b,'scurrius',40*35,new Date(now),()=>{draws++;return .64;});
  assert.equal(draws,1);assert.equal(b.expedition,undefined); // P(at least one) = 1-e^-1.
});
test('collection hall counts earned drops and retained relics, never purchases or opening banks',()=>{
  const a=player('Ada');a.economy.holdings={20997:50};
  let hall=buildCollectionHall([a]);
  assert.equal(hall.rewards.find(r=>r.id==='20997').collectors,0);
  a.economy.rareFinds={20997:{quantity:2,lastAt:now}};
  rollRelic(a,'scurrius',1,new Date(now),()=>0);
  hall=buildCollectionHall([a]);
  assert.equal(hall.rewards.find(r=>r.id==='20997').quantity,2);
  assert.deepEqual(hall.leaders,[{username:'Ada',found:1,relics:1}]);
  assert.equal(hall.relics.length,BOSSES.length);
});
test('spotlight bonus reaches actual XP calculation and records only newly earned scores',t=>{
  t.mock.method(Math,'random',()=>.999);
  const a=player('Ada'), skill=festivalWeek(now).skill;
  a.trainingState={aptitude:1,fatigue:0,momentum:1,remaining:100,phase:'steady',phaseRemaining:100,focusSkill:skill,targetXP:200000000};
  progressUser(a,new Date(now),{hours:.25,rng:()=>.5});
  assert.equal(a.progress.lastSession.trainingSkill,skill);
  assert.equal(a.progress.lastSession.skillScale,1.15);
  assert.equal(a.festival.skill,a.progress.lastSession.gains[skill]);
  assert.equal(a.festival.xp,a.progress.lastSession.gainedXP);
  assert.ok(a.festival.xp>0 && a.festival.xp < a.totalXP);
});
