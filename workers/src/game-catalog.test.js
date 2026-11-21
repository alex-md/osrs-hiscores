import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {defaultGameContent,applyGameContent} from '../../frontend/lib/game-content.js';
import {validateGameCatalog,loadGameCatalog,editGameCatalog} from './game-catalog.js';
import items from '../../frontend/lib/items.js';
import {BOSSES} from '../../frontend/lib/activities.js';
import {PROGRESS_METRICS} from '../../frontend/lib/progress.js';
import {handleApiRequest} from './index.js';
import {publishSnapshot} from './snapshots.js';
import {normalizeUser} from './store.js';
function database() {
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0002_game_catalog.sql',import.meta.url),'utf8'));
  return {db,prepare(sql){return {args:[],sql,bind(...args){return {...this,args};},async first(){return db.prepare(sql).get(...this.args);}};},async batch(statements){db.exec('BEGIN');try {const rows=statements.map(s=>({meta:{changes:db.prepare(s.sql).run(...s.args).changes}}));db.exec('COMMIT');return rows;}catch(e){db.exec('ROLLBACK');throw e;}}};
}
test('D1 migration exactly seeds the extracted catalog and is idempotent',()=>{
  const d1=database(), before=d1.db.prepare('SELECT * FROM game_catalog').get();
  assert.deepEqual(JSON.parse(before.payload),defaultGameContent);
  d1.db.exec(readFileSync(new URL('../migrations/0002_game_catalog.sql',import.meta.url),'utf8'));
  assert.deepEqual(d1.db.prepare('SELECT * FROM game_catalog').get(),before);
});
test('catalog validates cross references, historical ordering, probability groups, and training gates',()=>{
  validateGameCatalog(defaultGameContent);
  for (const change of [c=>c.bosses.reverse(),c=>delete c.items['20997'],c=>c.bosses[0].drops[0].id=99999999,c=>c.bosses[0].drops.push({id:20997,quantity:1,chance:2,rare:true}),c=>c.bosses[0].requirements={fake:50},c=>c.trainingCeilings.fishing=-1,c=>c.bosses[0].styles=['prayer']]) {
    const c=structuredClone(defaultGameContent);change(c);assert.throws(()=>validateGameCatalog(c),/Invalid game catalog/);
  }
});
test('reviewable edits use CAS, archive previous content and activate engine references without changing identities',async t=>{
  t.after(()=>applyGameContent());
  const d1=database(), env={HISTORY_DB:d1};
  const content=structuredClone(defaultGameContent);content.items['20997'].name='Reviewed bow';content.bosses[0].killsPerHour=20;
  const oldBosses=BOSSES, oldItems=items, oldMetrics=PROGRESS_METRICS.map(m=>m.key);
  assert.equal((await editGameCatalog(env,{content,expectedRevision:1})).dryRun,true);
  assert.equal(d1.db.prepare('SELECT revision FROM game_catalog').get().revision,1);
  assert.equal((await editGameCatalog(env,{content,expectedRevision:1,dryRun:false})).revision,2);
  assert.equal((await editGameCatalog(env,{content,expectedRevision:1,dryRun:false})).conflict,true);
  assert.equal(d1.db.prepare('SELECT count(*) AS n FROM game_catalog_revisions').get().n,1);
  await loadGameCatalog(env,defaultGameContent);
  assert.equal(items,oldItems);assert.equal(BOSSES,oldBosses);assert.equal(items[20997].name,'Reviewed bow');assert.equal(BOSSES[0].killsPerHour,20);
  assert.deepEqual(PROGRESS_METRICS.map(m=>m.key),oldMetrics);
  const extra={...structuredClone(content.bosses[0]),key:'new-encounter',name:'New encounter'};
  content.bosses.push(extra);validateGameCatalog(content);
  applyGameContent(content);assert.equal(PROGRESS_METRICS.at(-1).key,'new-encounter');
  assert.deepEqual(PROGRESS_METRICS.slice(0,-1).map(m=>m.key),oldMetrics);
});
test('D1 outages or invalid edits keep last published content and report the fallback',async t=>{
  t.after(()=>applyGameContent());
  const previous=structuredClone(defaultGameContent);previous.items['20997'].name='Last good bow';
  const env={HISTORY_DB:{prepare(){throw new Error('offline');}}};
  const loaded=await loadGameCatalog(env,previous);
  assert.equal(loaded.source,'last-known-good');assert.match(loaded.error,/offline/);assert.equal(items[20997].name,'Last good bow');
  await assert.rejects(loadGameCatalog(env),/offline/);
});
test('new public APIs are snapshot-only; D1 content editing requires authorization',async()=>{
  const data=new Map(), env={ADMIN_TOKEN:'secret',WORLD_STORE:{get:async key=>data.get(key)||null,put:async(k,v)=>data.set(k,v),delete:async k=>data.delete(k)}};
  const snapshot=await publishSnapshot(env,[normalizeUser({username:'Ada',skills:{}})]), before=new Map(data);
  env.HISTORY_DB={prepare(){throw new Error('public reads must not query D1');}};
  for (const [path,key] of [['game-catalog','content'],['festival','festival'],['collections','hall']]) {
    const response=await handleApiRequest(new Request('https://world/api/'+path),env);assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.generation,snapshot.generation);assert.ok(result[key]);
  }
  assert.deepEqual(data,before);
  const response=await handleApiRequest(new Request('https://world/api/admin/game-catalog',{method:'POST',body:'{}'}),env);
  assert.equal(response.status,401);
});
