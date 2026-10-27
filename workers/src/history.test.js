import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { HiscoresWorld } from './world.js';
import { publishSnapshot } from './snapshots.js';
import { allUsers } from './store.js';
import { historyResponse, flushHistory } from './history.js';
import { SKILLS } from './constants.js';

function setup() {
  const db = new DatabaseSync(':memory:'), history = new DatabaseSync(':memory:');
  history.exec(readFileSync(new URL('../migrations/0001_progress.sql',import.meta.url),'utf8'));
  const storage = { sql:{exec(sql,...args) {
    const stmt=db.prepare(sql);const rows=stmt.columns().length?stmt.all(...args):(stmt.run(...args),[]);return {toArray:()=>rows};
  }},transactionSync(fn){db.exec('BEGIN');try {fn();db.exec('COMMIT');} catch(e){db.exec('ROLLBACK');throw e;}} };
  let fail = false;
  const d1 = {prepare(sql){return {bind(...args){return {...this,args};},args:[],async first(){return history.prepare(sql).get(...this.args) || null;},async all(){return {results:history.prepare(sql).all(...this.args)};},sql};},
    async batch(statements){if(fail) throw new Error('D1 offline');history.exec('BEGIN');try{const out=statements.map(s=>{const q=history.prepare(s.sql);return {results:q.columns().length?q.all(...s.args):(q.run(...s.args),[])};});history.exec('COMMIT');return out;}catch(e){history.exec('ROLLBACK');throw e;}}};
  const world = new HiscoresWorld({storage},{HISTORY_DB:d1,ADMIN_TOKEN:'test',ALLOW_TWODNE_SCRAPE:'false'});
  const request = (path,body) => world.fetch(new Request('https://world'+path,{method:body===undefined?'GET':'POST',headers:{'x-admin-token':'test','content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})}));
  const progress = async params => {
    const response = await historyResponse(new Request('https://world/api/progress?'+new URLSearchParams(params)),{HISTORY_DB:d1});
    assert.equal(response.status,200);return response.json();
  };
  return {world,request,history,db,progress,offline:value=>{fail=value;}};
}
async function change(world, xp, kc, name='Ada') {
  const users = await allUsers(world.env);
  const user=users.find(u=>u.username===name);
  user.skills.attack.xp += xp;
  user.bosses.scurrius += kc;
  await publishSnapshot(world.env,users);world.store.commit();await flushHistory(world.env);
}
test('history begins at a baseline, aggregates skill/boss gains and records rank falls without inventing XP losses', async t=>{
  let now=Date.parse('2026-10-20T12:00Z');t.mock.method(Date,'now',()=>now);
  const {world,request,progress}=setup();
  await request('/api/seed',{usernames:['Ada','Bea']});
  assert.equal((await progress({days:1})).totalGain,0);
  now+=900000;await change(world,50000,3);
  let p=await progress({days:1,metric:'attack'});
  assert.equal(p.totalGain,50000);assert.equal(p.players[0].gain,50000);
  assert.equal(p.records['daily:attack'].value,50000);
  p=await progress({days:1,metric:'scurrius'});
  assert.equal(p.totalGain,3);assert.equal(p.players[0].bossStreak,1);
  // Force Bea above Ada to create an independently verifiable fall.
  now+=900000;await change(world,200000000,4,'Bea');
  p=await progress({days:1,metric:'attack',sort:'falls'});
  // Starting ranks depend on seeded XP; assert every fall has the right sign.
  assert.ok(p.players.every(u=>u.movement<0));
  assert.equal((await progress({days:1,username:'Ada'})).players[0].xpStreak,1);
});
test('UTC rollover preserves daily sums, weekly start/end ranks and consecutive-day streaks; gaps reset streaks',async t=>{
  let now=Date.parse('2026-10-20T23:00Z');t.mock.method(Date,'now',()=>now);
  const {world,request,progress}=setup();await request('/api/seed',{usernames:['Ada']});
  now+=900000;await change(world,1000,2);
  now=Date.parse('2026-10-21T00:00Z');await change(world,2000,3);
  let p=await progress({days:7});assert.equal(p.totalGain,3000);assert.equal(p.series.length,2);assert.equal(p.players[0].xpStreak,2);
  assert.equal((await progress({days:1})).totalGain,2000);
  now=Date.parse('2026-10-23T00:00Z');await change(world,4000,1);
  p=await progress({days:7});assert.equal(p.totalGain,7000);assert.equal(p.players[0].xpStreak,1);assert.equal(p.records['streak:xp'].value,2);
  assert.ok(p.reigns.overall.through>=p.reigns.overall.since);
});
test('D1 failures do not roll back a committed world and retry publication is idempotent',async t=>{
  let now=Date.parse('2026-10-20T12:00Z');t.mock.method(Date,'now',()=>now);t.mock.method(console,'error',()=>{});
  const {world,request,progress,offline,history}=setup();
  offline(true);assert.equal((await request('/api/seed',{usernames:['Ada']})).status,200);
  assert.equal((await request('/api/users/Ada')).status,200);
  assert.ok(await world.store.get('history:pending'));
  offline(false);await flushHistory(world.env);
  const before=history.prepare('SELECT * FROM progress_players').all();
  await flushHistory(world.env);assert.deepEqual(history.prepare('SELECT * FROM progress_players').all(),before);
  assert.equal((await progress({days:1})).totalGain,0);
  assert.deepEqual(JSON.parse(await world.store.get('history:pending')),{});
});
test('failed world commit cannot publish its staged history', async t=>{
  t.mock.method(console,'error',()=>{});
  const {world,request,history}=setup();
  const original=world.store.storage.transactionSync;
  world.store.storage.transactionSync=()=>{throw new Error('SQL failure');};
  assert.equal((await request('/api/seed',{usernames:['Ada']})).status,503);
  assert.equal(history.prepare('SELECT count(*) AS n FROM progress_days').get().n,0);
  world.store.storage.transactionSync=original;
  assert.equal(await world.store.get('history:pending'),null);
});
test('validation, empty history, public access and retention are bounded',async t=>{
  let now=Date.parse('2026-01-01T00:00Z');t.mock.method(Date,'now',()=>now);
  const {world,request,progress,history}=setup();
  assert.equal((await progress({})).collecting,true);
  for(const query of ['days=31','days=2','metric=unknown','sort=oops','page=-2'])
    assert.equal((await request('/api/progress?'+query)).status,400);
  await request('/api/seed',{usernames:['Ada']});
  now+=91*86400000;await change(world,100,1);
  assert.equal(history.prepare('SELECT count(*) AS n FROM progress_days').get().n,1);
  assert.equal((await request('/api/progress')).status,200);
  const unbound=await historyResponse(new Request('https://world/api/progress'),{});
  assert.equal((await unbound.json()).available,false);
  assert.equal(SKILLS.length>20,true);
});

test('window comparisons exclude earlier gains and never count a late entrant’s starting XP',async t=>{
  let now=Date.parse('2026-10-01T12:00Z');t.mock.method(Date,'now',()=>now);
  const {world,request,progress}=setup();await request('/api/seed',{usernames:['Ada']});
  now+=900000;await change(world,1000,2);
  now=Date.parse('2026-10-10T12:00Z');await change(world,2000,3);
  await request('/api/seed',{usernames:['Bea']});
  now+=900000;await change(world,3000,4,'Bea');
  let p=await progress({days:7});assert.equal(p.totalGain,5000);
  assert.equal(p.players.find(p=>p.username==='Bea').gain,3000);
  assert.equal((await progress({days:30})).totalGain,6000);
  p=await progress({days:7,username:'ada'});assert.equal(p.totalGain,2000);
  assert.equal(p.series.length,1);assert.equal(p.series[0].startRank,1);assert.ok('movement' in p.series[0]);
});

test('daily rank records, unranked boss entrants and observed leader switches use the live ranks',async t=>{
  let now=Date.parse('2026-10-20T12:00Z');t.mock.method(Date,'now',()=>now);
  const {newUser}=await import('./simulation.js');
  const {world,progress}=setup();
  const users=['Ada','Bea'].map(name=>{
    const u=newUser(name);
    for(const s of SKILLS) u.skills[s].xp=s==='hitpoints'?1154:0;
    u.bosses=Object.fromEntries(Object.keys(u.bosses).map(k=>[k,0]));return u;
  });
  await publishSnapshot(world.env,users);world.store.commit();await flushHistory(world.env);
  now+=900000;await change(world,1000,2);
  let p=await progress({days:1,metric:'scurrius'});assert.equal(p.players[0].movement,null);
  now+=900000;await change(world,3000,4,'Bea');
  p=await progress({days:1,metric:'attack',sort:'falls'});
  assert.equal(p.players[0].username,'Ada');assert.equal(p.players[0].movement,-1);
  assert.equal(p.records['climb:attack'].username,'Bea');assert.equal(p.records['fall:attack'].username,'Ada');
  assert.equal(p.leaders.attack.username,'Bea');assert.equal(p.leaders.attack.since,now);
  assert.equal(p.reigns.attack.username,'Ada');assert.equal(p.reigns.attack.through-p.reigns.attack.since,900000);
});

test('an outage spanning UTC midnight retains both daily publications for replay',async t=>{
  let now=Date.parse('2026-10-20T23:00Z');t.mock.method(Date,'now',()=>now);t.mock.method(console,'error',()=>{});
  const {world,request,progress,offline,history}=setup();offline(true);
  await request('/api/seed',{usernames:['Ada']});
  now+=900000;await assert.rejects(change(world,1000,2),/D1 offline/);
  now=Date.parse('2026-10-21T00:00Z');await assert.rejects(change(world,2000,3),/D1 offline/);
  assert.equal(Object.keys(JSON.parse(await world.store.get('history:pending'))).length,2);
  offline(false);await flushHistory(world.env);
  assert.equal(history.prepare('SELECT count(*) AS n FROM progress_days').get().n,2);
  const p=await progress({days:7});assert.equal(p.totalGain,3000);assert.equal(p.players[0].xpStreak,2);
  assert.equal(p.series.length,2);
});

test('replacing a smaller daily population removes obsolete D1 shards',async()=>{
  const {world,request,history,progress}=setup();
  const names=Array.from({length:126},(_,i)=>'Player'+i);
  assert.equal((await request('/api/seed',{usernames:names})).status,200);
  assert.equal(history.prepare('SELECT count(*) AS n FROM progress_players').get().n,2);
  await request('/api/admin/users/delete-batch',{usernames:names.slice(25),dryRun:false});
  assert.equal(history.prepare('SELECT count(*) AS n FROM progress_players').get().n,1);
  assert.equal((await progress({days:1})).totalPlayers,25);
  assert.deepEqual(JSON.parse(await world.store.get('history:pending')),{});
});
