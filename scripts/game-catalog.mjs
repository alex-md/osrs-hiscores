// Pull a reviewable document, edit it, validate it, then push with optimistic locking.
import {readFile,writeFile} from 'node:fs/promises';
import {validateGameCatalog} from '../workers/src/game-catalog.js';
const [action,file,flag] = process.argv.slice(2);
if (!['pull','check','push'].includes(action) || !file) throw new Error('Usage: node scripts/game-catalog.mjs pull|check|push <file.json> [--apply]');
if (action === 'check') {
  const document=JSON.parse(await readFile(file,'utf8'));
  validateGameCatalog(document.content);
  console.log(`Valid catalog: ${Object.keys(document.content.items).length} items, ${document.content.bosses.length} encounters.`);
} else {
  const base = process.env.WORKER_BASE_URL;
  const token = process.env.ADMIN_TOKEN;
  if (!base || !token) throw new Error('Set WORKER_BASE_URL and ADMIN_TOKEN in the environment.');
  const url = new URL('/api/admin/game-catalog',base);
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP(S) Worker origin.');
  const options = {headers:{'x-admin-token':token,'content-type':'application/json'}};
  if (action === 'push') {
    const document=JSON.parse(await readFile(file,'utf8'));
    validateGameCatalog(document.content);
    Object.assign(options,{method:'POST',body:JSON.stringify({content:document.content,expectedRevision:document.revision,dryRun:flag !== '--apply'})});
  }
  const response=await fetch(url,options), result=await response.json();
  if (!response.ok) throw new Error(result.error || `Catalog request failed (${response.status}); pull the latest revision before retrying.`);
  if (action === 'pull') { await writeFile(file,JSON.stringify(result,null,2)+'\n');console.log(`Saved catalog revision ${result.revision} to ${file}`); }
  else console.log(JSON.stringify(result,null,2));
}
