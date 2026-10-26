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
import { MAX_PLAYERS, UPDATE_INTERVAL_MS } from './frontend/lib/simulation-config.js';
export class BenchWorld extends HiscoresWorld {
 async fetch(request) {
  const users = Array.from({length:MAX_PLAYERS}, (_,i)=>{
   const user = newUser('Bench'+i);
   for (const skill of Object.values(user.skills)) {skill.xp=200000000;skill.level=99;}
   for (const boss of BOSSES) user.bosses[boss.key]=1000000+i;
   user.economy.bankValue=1000000000000-i;
   return normalizeUser(user);
  });
  await publishSnapshot(this.env, users); this.store.commit();
  const sql = this.store.sql; let read=0, written=0;
  this.store.sql={exec:(...args)=>{const c=sql.exec(...args);read+=c.rowsRead;written+=c.rowsWritten;return c;}};
  const start=Date.now();
  const result=await this.respond(new Request('https://world/internal/scheduled',{method:'POST'}));
  const run=await result.json();
  const scheduledRead=read, scheduledWritten=written, elapsedMs=Date.now()-start;
  const reads=[];
  for(const path of ['/api/users/batch?usernames='+Array.from({length:50},(_,i)=>'Bench'+(i*100)).join(','),'/api/activity-rankings?category=bank','/api/activity-rankings?category=vorkath','/api/users/Bench0']){
   const beforeRead=read, beforeWritten=written;
   const response=await this.respond(new Request('https://world'+path));
   if(!response.ok) throw new Error('Read failed: '+path);
   await response.text();
   reads.push({path,rowsRead:read-beforeRead,rowsWritten:written-beforeWritten});
  }
  const size=sql.exec('SELECT sum(length(value)) AS storedBytes, max(length(value)) AS largestDocumentBytes, count(*) AS documents FROM documents').toArray()[0];
  return Response.json({status:result.status,rowsRead:scheduledRead,rowsWritten:scheduledWritten,elapsedMs,updatesPerDay:86400000/UPDATE_INTERVAL_MS,reads,...size,run});
 }
}
export default {fetch(request,env){return env.WORLD.get(env.WORLD.idFromName('benchmark')).fetch(request);}};
`;
const built = await build({stdin:{contents:source,resolveDir:root},bundle:true,format:"esm",write:false,platform:"browser"});
const mf = new Miniflare(convertV4MiniflareOptions({workers:[{name:"capacity",modules:true,script:built.outputFiles[0].text,compatibilityDate:"2026-10-10",durableObjects:{WORLD:{className:"BenchWorld",useSQLite:true}}}]}));
try {
  const response = await mf.dispatchFetch("https://bench/");
  const data = await response.json();
  data.projectedScheduledWritesPerDay = data.rowsWritten * data.updatesPerDay;
  data.projectedScheduledReadsPerDay = data.rowsRead * data.updatesPerDay;
  const worstRead = Math.max(...data.reads.map(row => row.rowsRead));
  data.projectedReadsAtRequestLimit = data.projectedScheduledReadsPerDay + worstRead * (100000 - data.updatesPerDay);
  console.log(JSON.stringify(data, null, 2));
  if (data.status !== 200 || data.run.totalPlayers !== 5000 || data.run.newUsers !== 0 || data.projectedScheduledWritesPerDay >= 30_000 || data.projectedReadsAtRequestLimit >= 4_500_000 || data.largestDocumentBytes >= 1_900_000 || data.storedBytes >= 100_000_000 || data.reads.some(row => row.rowsWritten !== 0))
    throw new Error("Capacity benchmark failed");
} finally { await mf.dispose(); }
