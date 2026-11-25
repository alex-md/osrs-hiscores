import test from 'node:test';
import assert from 'node:assert/strict';
import { rollRelic, discoveryCount } from './festival.js';
import { buildCollectionHall } from './collection-hall.js';
import { normalizeUser } from './store.js';
import { progressUser } from './simulation.js';
import { BOSSES } from '../../frontend/lib/activities.js';
import { SKILLS } from './constants.js';
const now = Date.parse('2026-11-21T12:00:00Z');
const player = username => normalizeUser({username, createdAt:now-86400000, skills:Object.fromEntries(SKILLS.map(s=>[s,{xp:20_000_000}]))});

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
test('retired festival no longer modifies XP, scores or historical honours',t=>{
  t.mock.method(Math,'random',()=>.999);
  const a=player('Ada'), skill='sailing';
  a.festival={id:'historical',xp:123}; a.festivalWins=2;
  a.trainingState={aptitude:1,fatigue:0,momentum:1,remaining:100,phase:'steady',phaseRemaining:100,focusSkill:skill,targetXP:200000000};
  progressUser(a,new Date(now),{hours:.25,rng:()=>.5});
  assert.equal(a.progress.lastSession.skillScale,1);
  assert.equal(a.progress.lastSession.festivalSkill,undefined);
  assert.deepEqual(a.festival,{id:'historical',xp:123});
  assert.equal(a.festivalWins,2);
});
