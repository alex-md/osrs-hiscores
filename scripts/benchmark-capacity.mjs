// Runs entirely in local workerd with disposable SQLite storage. No credentials,
// remote requests or production mutations. Includes SQLite's index write counts.
import { build } from "../workers/node_modules/esbuild/lib/main.js";
import { Miniflare, convertV4MiniflareOptions } from "../workers/node_modules/miniflare/dist/src/index.js";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const source = `
import { HiscoresWorld } from './workers/src/world.js';
import { newUser } from './workers/src/simulation.js';
import { BOSSES } from './frontend/lib/activities.js';
import { normalizeUser } from './workers/src/store.js';
import { publishSnapshot } from './workers/src/snapshots.js';
import { flushHistory } from './workers/src/history.js';
import { MAX_PLAYERS, UPDATE_INTERVAL_MS } from './frontend/lib/simulation-config.js';
import baseline from './workers/data/ge-baseline.js';
export class BenchWorld extends HiscoresWorld {
 async fetch(request) {
  await this.env.HISTORY_DB.exec('CREATE TABLE IF NOT EXISTS progress_days (day TEXT PRIMARY KEY,captured_at INTEGER NOT NULL,generation TEXT NOT NULL,summary TEXT NOT NULL); CREATE TABLE IF NOT EXISTS progress_players (day TEXT NOT NULL,shard INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(day,shard));');
  let d1Read=0, d1Written=0;
  const rawD1=this.env.HISTORY_DB;
  const measureD1=results=>{for(const result of results){d1Read+=result.meta.rows_read || 0;d1Written+=result.meta.rows_written || 0;}return results;};
  function measured(stmt){return {raw:stmt,bind(...args){return measured(stmt.bind(...args));},async all(){return measureD1([await stmt.all()])[0];},async first(){return (await this.all()).results[0] || null;}};}
  this.env.HISTORY_DB={prepare:sql=>measured(rawD1.prepare(sql)),batch:async statements=>measureD1(await rawD1.batch(statements.map(s=>s.raw)))};
  const users = Array.from({length:MAX_PLAYERS}, (_,i)=>{
   const user = newUser('Bench'+i);
   for (const skill of Object.values(user.skills)) {skill.xp=200000000;skill.level=99;}
   for (const boss of BOSSES) user.bosses[boss.key]=1000000+i;
   user.economy.bankValue=1000000000000-i;
   user.economy.cash=0;
   user.economy.holdings=Object.fromEntries(Object.entries(baseline).map(([id,item])=>[id,user.economy.bankValue/Object.keys(baseline).length/item.price]));
   user.economy.revaluation=0;
   return normalizeUser(user);
  });
  await publishSnapshot(this.env, users); this.store.commit(); await flushHistory(this.env); d1Read=0; d1Written=0;
  const sql = this.store.sql; let read=0, written=0;
  this.store.sql={exec:(...args)=>{const c=sql.exec(...args);read+=c.rowsRead;written+=c.rowsWritten;return c;}};
  let telemetryPoints=0;
  this.env.EXCHANGE_ANALYTICS={writeDataPoint:()=>{telemetryPoints++;}};
  const start=Date.now();
  const result=await this.respond(new Request('https://world/internal/scheduled',{method:'POST'}));
  const run=await result.json();
  const scheduledTelemetryPoints=telemetryPoints;
  const scheduledRead=read, scheduledWritten=written, elapsedMs=Date.now()-start, scheduledD1Read=d1Read, scheduledD1Written=d1Written;
  const latestDay = new Date().toISOString().slice(0,10);
  await this.env.HISTORY_DB.batch(Array.from({length:29},(_,i)=>[
    this.env.HISTORY_DB.prepare("INSERT INTO progress_players(day,shard,payload) SELECT date(day, ?), shard, payload FROM progress_players WHERE day = ?").bind('-'+(i+1)+' days',latestDay),
    this.env.HISTORY_DB.prepare("INSERT INTO progress_days(day,captured_at,generation,summary) SELECT date(day, ?),captured_at,generation,summary FROM progress_days WHERE day = ?").bind('-'+(i+1)+' days',latestDay),
  ]).flat());
  const historySize=await this.env.HISTORY_DB.prepare('SELECT sum(length(payload)) AS bytes, count(*) AS rows FROM progress_players').first();
  const reads=[];
  for(const path of ['/api/users/batch?usernames='+Array.from({length:50},(_,i)=>'Bench'+(i*100)).join(','),'/api/activity-rankings?category=bank','/api/activity-rankings?category=vorkath','/api/users/Bench0','/api/exchange','/api/progress?days=30']){
   const beforeRead=read, beforeWritten=written, beforeD1Read=d1Read, beforeD1Written=d1Written, startRead=Date.now();
   const response=await this.respond(new Request('https://world'+path));
   if(!response.ok) throw new Error('Read failed: '+path);
   const body=await response.json();
   if(path.startsWith('/api/progress') && (!body.available || body.days !== 30 || body.series.length !== 30)) throw new Error('History unavailable');
   reads.push({path,rowsRead:read-beforeRead,rowsWritten:written-beforeWritten,d1RowsRead:d1Read-beforeD1Read,d1RowsWritten:d1Written-beforeD1Written,elapsedMs:Date.now()-startRead});
  }
  const size=sql.exec('SELECT sum(length(value)) AS storedBytes, max(length(value)) AS largestDocumentBytes, count(*) AS documents FROM documents').toArray()[0];
  if(telemetryPoints !== scheduledTelemetryPoints) throw new Error('Reads emitted telemetry');
  return Response.json({status:result.status,rowsRead:scheduledRead,rowsWritten:scheduledWritten,elapsedMs,scheduledD1Read,scheduledD1Written,scheduledTelemetryPoints,updatesPerDay:86400000/UPDATE_INTERVAL_MS,reads,historySize,...size,run});
 }
}
export default {fetch(request,env){return env.WORLD.get(env.WORLD.idFromName('benchmark')).fetch(request);}};
`;
const built = await build({stdin:{contents:source,resolveDir:root},bundle:true,format:"esm",write:false,platform:"browser"});
const mf = new Miniflare(convertV4MiniflareOptions({workers:[{name:"capacity",modules:true,script:built.outputFiles[0].text,compatibilityDate:"2026-10-10",d1Databases:{HISTORY_DB:"00000000-0000-0000-0000-000000000001"},durableObjects:{WORLD:{className:"BenchWorld",useSQLite:true}}}]}));
try {
  const response = await mf.dispatchFetch("https://bench/");
  const data = await response.json();
  data.projectedScheduledWritesPerDay = data.rowsWritten * data.updatesPerDay;
  data.projectedD1WritesPerDay = data.scheduledD1Written * data.updatesPerDay;
  data.projectedScheduledReadsPerDay = data.rowsRead * data.updatesPerDay;
  data.projectedTelemetryPointsPerDay = data.scheduledTelemetryPoints * data.updatesPerDay;
  const worstRead = Math.max(...data.reads.map(row => row.rowsRead));
  data.projectedReadsAtRequestLimit = data.projectedScheduledReadsPerDay + worstRead * (100000 - data.updatesPerDay);
  console.log(JSON.stringify(data, null, 2));
  if (data.scheduledTelemetryPoints !== Object.keys((await import('../workers/data/ge-baseline.js')).default).length + 1 || data.scheduledTelemetryPoints > 250 || data.projectedTelemetryPointsPerDay >= 100_000)
    throw new Error("Telemetry capacity benchmark failed");
  if (data.status !== 200 || data.run.totalPlayers !== 5000 || data.run.newUsers !== 0 || data.projectedScheduledWritesPerDay >= 30_000 || data.projectedD1WritesPerDay >= 80_000 || data.projectedReadsAtRequestLimit >= 4_500_000 || data.largestDocumentBytes >= 1_900_000 || data.storedBytes >= 100_000_000 || data.historySize.bytes * 35 / 30 >= 450_000_000 || data.reads.some(row => row.rowsWritten !== 0 || row.d1RowsWritten !== 0 || row.d1RowsRead > 500))
    throw new Error("Capacity benchmark failed");
} finally { await mf.dispose(); }
