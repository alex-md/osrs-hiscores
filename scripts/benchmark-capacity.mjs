// Runs entirely in local workerd with disposable SQLite storage. No credentials,
// remote requests or production mutations. Includes SQLite's index write counts.
import { build } from "../workers/node_modules/esbuild/lib/main.js";
import { Miniflare, convertV4MiniflareOptions } from "../workers/node_modules/miniflare/dist/src/index.js";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const source = `
import { HiscoresWorld } from './workers/src/world.js';
import { newUser } from './workers/src/simulation.js';
import { publishSnapshot } from './workers/src/snapshots.js';
import { MAX_PLAYERS, UPDATE_INTERVAL_MS } from './frontend/lib/simulation-config.js';
export class BenchWorld extends HiscoresWorld {
 async fetch(request) {
  const users = Array.from({length:MAX_PLAYERS}, (_,i)=>newUser('Bench'+i));
  await publishSnapshot(this.env, users); this.store.commit();
  const sql = this.store.sql; let read=0, written=0;
  this.store.sql={exec:(...args)=>{const c=sql.exec(...args);read+=c.rowsRead;written+=c.rowsWritten;return c;}};
  const start=Date.now();
  const result=await this.respond(new Request('https://world/internal/scheduled',{method:'POST'}));
  const run=await result.json();
  return Response.json({status:result.status,rowsRead:read,rowsWritten:written,elapsedMs:Date.now()-start,updatesPerDay:86400000/UPDATE_INTERVAL_MS,run});
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
  console.log(JSON.stringify(data, null, 2));
  if (data.status !== 200 || data.run.totalPlayers !== 5000 || data.run.newUsers !== 0 || data.projectedScheduledWritesPerDay >= 30_000)
    throw new Error("Capacity benchmark failed");
} finally { await mf.dispose(); }
