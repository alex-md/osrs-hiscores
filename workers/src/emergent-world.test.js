import test from 'node:test';
import assert from 'node:assert/strict';
import { activityWeights, isRestDay } from './engagement.js';
import { chooseTrainingSkill } from './training.js';
import { normalizeUser } from './store.js';
import { valueBank, progressBossing, rollBossDrops, bossDropTable } from './economy.js';
import { buildRankings, publishSnapshot } from './snapshots.js';
import { buildDiscoveries } from './discoveries.js';
import { worldDiagnostics } from './diagnostics.js';
import { handleApiRequest } from './index.js';
import { SKILLS } from './constants.js';
import { xpForLevel } from './utils.js';
import { BOSSES } from '../../frontend/lib/activities.js';
import items from '../../frontend/lib/items.js';

const at = new Date('2026-11-03T12:00Z');
function seeded(seed) { return () => ((seed = (Math.imul(seed,1664525)+1013904223)>>>0)/2**32); }
function player(name='Ada', archetype='PVMER') {
  const u=normalizeUser({username:name,archetype,createdAt:+at-10*86400000,skills:Object.fromEntries(SKILLS.map(s=>[s,{xp:xpForLevel(99)}]))});
  valueBank(u);return u;
}
function store() {
  const data=new Map();
  return {data,async get(key,type){if(Array.isArray(key))return new Map(key.map(k=>[k,data.has(k)?JSON.parse(data.get(k)):null]));return data.get(key)||null;},async put(key,value){data.set(key,value);},async delete(key){data.delete(key);}};
}
test('top-tier personalities and dedication retain distinct activity budgets',()=>{
  const mean=(archetype,dedication)=>{const w=Object.values(activityWeights(archetype,'T10',dedication));return w.reduce((s,v,i)=>s+v*i,0)/w.reduce((s,v)=>s+v,0);};
  assert.ok(mean('ELITE_GRINDER',.5)>mean('IDLER',.5)*2);
  assert.ok(mean('CASUAL',.9)>mean('CASUAL',.1));
  for(const archetype of ['IDLER','SOCIALITE','PVMER','ELITE_GRINDER'])assert.ok(activityWeights(archetype,'T10').INACTIVE>0);
});
test('personal rest days persist across renames and do not freeze a career',()=>{
  const u=player();let rests=0;
  for(let day=0;day<365;day++) {
    const date=new Date(+at+day*86400000),before=isRestDay(u,date);
    assert.equal(isRestDay({...u,username:'Renamed'},date),before);
    assert.equal(isRestDay(u,new Date(+date+3600000)),before);
    rests+=before;
  }
  assert.ok(rests>2 && rests<60,rests);
});
test('maxers finish remaining skills while skillers avoid combat training',()=>{
  const u=player('Maxer','EFFICIENT_MAXER');u.skills.runecraft={xp:xpForLevel(70),level:70};
  let rng=seeded(3),rc=0;
  for(let i=0;i<3000;i++)rc+=chooseTrainingSkill(u,rng)==='runecraft';
  assert.ok(rc>1800,rc);
  u.archetype='SKILLER';rng=seeded(4);let combat=0;
  for(let i=0;i<3000;i++)combat+=['attack','strength','defence','ranged','magic','prayer','slayer'].includes(chooseTrainingSkill(u,rng));
  assert.ok(combat<300,combat);
});
test('partial raids consume time, pay attempt costs, persist progress and eventually complete',()=>{
  const u=player();u.career.favoriteBoss='theatre-of-blood';u.career.raidProgress={'theatre-of-blood':.001};
  const before=u.economy.bankValue,rng=seeded(55);
  let partial=false,completed=false;
  for(let i=0;i<200 && !completed;i++) {
    const result=progressBossing(u,new Date(+at+i*900000),{hours:.08,scale:18,rng});
    if(result.active && !u.economy.lastSession.kills) {
      partial=true;assert.ok(result.trainingHours<.08);assert.ok(u.career.raidProgress['theatre-of-blood']>0);
      assert.ok(u.economy.lastSession.estimatedCost>0);
    }
    completed=u.bosses['theatre-of-blood']>0;
  }
  assert.ok(partial);assert.ok(completed);assert.ok(u.economy.spent>0);assert.ok(u.economy.bankValue!==before);
  assert.ok(u.career.raidProgress['theatre-of-blood']>=0 && u.career.raidProgress['theatre-of-blood']<1);
});
test('completing a legacy raid releases its priority while retaining fractional work',()=>{
  const u=player();u.career.raidProgress={'chambers-of-xeric':.9};
  const rng=seeded(827),visited=new Set();
  for(let i=0;i<300;i++) {
    const result=progressBossing(u,new Date(+at+i*900000),{hours:.25,scale:29,rng});
    if(!result.active)continue;
    visited.add(result.boss);
    const session=u.economy.lastSession;
    if(BOSSES.find(b=>b.key===result.boss).raid) {
      assert.equal(u.career.pendingRaid,session.kills===0 ? result.boss : null);
      assert.ok(u.career.raidProgress[result.boss]>=0 && u.career.raidProgress[result.boss]<1);
    }
  }
  assert.ok(u.bosses['chambers-of-xeric']>0);
  assert.ok(visited.size>15,`Only visited ${[...visited]}`);
  assert.ok([...visited].some(key=>BOSSES.slice(24).some(b=>b.key===key)));
});
test('selected reward tables have finite rewards and common plus rare value covering base costs',()=>{
  for(const boss of BOSSES) {
    const table=bossDropTable(boss),common=table.filter(d=>!d.rare).reduce((n,d)=>n+d.quantity*d.chance*items[d.id].price,0);
    const rareEV=table.filter(d=>d.rare).reduce((n,d)=>n+d.quantity*d.chance*items[d.id].price,0);
    assert.ok(Math.max(common,boss.commonLoot)+rareEV>=boss.cost || !boss.drops,boss.key);
    const result=rollBossDrops(boss,0,seeded(2));assert.equal(result.coins,0);assert.deepEqual(result.notable,[]);
  }
});
test('notable loot is backed by actual rewards, not inferred from starting holdings',()=>{
  const boss={drops:[{id:20997,quantity:1,chance:1,rare:true}],commonLoot:0};
  const result=rollBossDrops(boss,2,seeded(5));
  assert.deepEqual(result.notable,[{itemId:20997,quantity:2}]);assert.equal(result.rewards[20997],2);assert.equal(result.drops,2);
  assert.equal(player().economy.notableLoot,undefined);
});
test('discoveries require meaningful observed rewards and never infer opening acquisitions',()=>{
  const users=[player('Ada')];
  users[0].finance={last:{at:+at,bankBefore:1000000}};
  users[0].economy.notableLoot=[{itemId:20997,quantity:1,boss:'chambers-of-xeric',kc:1,timestamp:+at,value:items[20997].price}];
  assert.equal(buildDiscoveries(users,null,null,+at).length,0);
  const result=buildDiscoveries(users,null,{generatedAt:+at-1},+at);
  assert.equal(result.filter(s=>s.kind==='windfall').length,1);
  assert.equal(buildDiscoveries(users,null,{generatedAt:+at,discoveries:result},+at+1).length,1);
});
test('public stories are snapshot reads and diagnostics detect stale progression',async()=>{
  const WORLD_STORE=store(),env={WORLD_STORE},u=player();u.skills.sailing={xp:xpForLevel(98),level:98};await publishSnapshot(env,[u]);
  const before=new Map(WORLD_STORE.data);
  const response=await handleApiRequest(new Request('https://world/api/stories'),env);
  assert.equal(response.status,200);assert.deepEqual((await response.json()).contenders,[]);
  assert.deepEqual(WORLD_STORE.data,before);
  await WORLD_STORE.put('system:last-run',JSON.stringify({generatedAt:+at-3600000,durationMs:55}));
  await WORLD_STORE.put('history:pending',JSON.stringify({'2026-11-03':1}));
  await WORLD_STORE.put('history:publication',JSON.stringify({lastPublishedAt:+at-7200000,failures:2}));
  const result=await worldDiagnostics(env,+at);assert.equal(result.progression.state,'stale');assert.equal(result.history.lagMs,3600000);assert.equal(result.history.failures,2);assert.equal(result.history.pendingDays,1);
});

test('all expanded motives have valid activity weights and reachable initial sampling',async()=>{
  const {EXPANDED_ARCHETYPES}=await import('./archetypes.js');
  const {assignArchetypeForTotalXP}=await import('./utils.js');
  const rng=seeded(774);const found=new Set();
  // The creation sampler uses its supplied RNG, independently of global randomness.
  for(let i=0;i<12000;i++)found.add(assignArchetypeForTotalXP(1000000,rng));
  for(const key of Object.keys(EXPANDED_ARCHETYPES)) {
    assert.ok(found.has(key),key);
    const weights=Object.values(activityWeights(key,'T10'));
    assert.ok(weights.every(v=>Number.isFinite(v)&&v>=0),key);
    assert.ok(weights.reduce((a,b)=>a+b,0)>0,key);
  }
});
test('existing generalists discover new directions once without losing their records',async()=>{
  const {adoptExpandedCareer}=await import('./archetypes.js');
  const changed=new Set();
  for(let i=0;i<300;i++) {
    const u=player('Career'+i,'CASUAL');u.achievements={old:123};const stats=structuredClone(u.skills),bank=u.economy.bankValue;
    if(adoptExpandedCareer(u,at))changed.add(u.archetype);
    const first=u.archetype;
    assert.equal(adoptExpandedCareer(u,new Date(+at+86400000)),false);
    assert.equal(u.archetype,first);assert.deepEqual(u.skills,stats);assert.equal(u.economy.bankValue,bank);assert.equal(u.achievements.old,123);
  }
  assert.ok(changed.size>=10,changed.size);
});
test('weekend and comeback calendars create sustained multi-day variation',async()=>{
  const {careerPhase}=await import('./archetypes.js');
  const u=player('Calendar','WEEKEND_WARRIOR');
  assert.equal(careerPhase(u,new Date('2026-11-07T12:00Z')),'surge');
  assert.equal(careerPhase(u,new Date('2026-11-09T12:00Z')),'quiet');
  u.archetype='COMEBACK_KID';const phases=Array.from({length:20},(_,i)=>careerPhase(u,new Date(+at+i*86400000)));
  assert.equal(phases.filter(p=>p==='away').length,6);assert.equal(phases.filter(p=>p==='surge').length,6);
  for(let i=0;i<20;i++)if(phases[i]==='away')assert.ok(isRestDay(u,new Date(+at+i*86400000)));
});
test('clue expeditions share time, carry steps and grant only completed caskets',async()=>{
  const {progressClues}=await import('./economy.js');
  const u=player('Trails','CLUE_HUNTER');u.economy.cash=1000000;u.economy.holdings={};valueBank(u);
  const rng=seeded(95);let used=0;
  for(let i=0;i<100;i++) {
    const result=progressClues(u,new Date(+at+i*900000),{hours:.2,scale:18,rng});
    assert.ok(result.trainingHours>=0 && result.trainingHours<=.2);used+=.2-result.trainingHours;
    if(u.career.clues)assert.ok(u.career.clues.steps>=0 && u.career.clues.steps<4);
  }
  assert.ok(used>1);assert.ok(u.career.clues.completed>0);assert.ok(u.economy.earned>0);assert.ok(u.economy.cash>=0);
});
