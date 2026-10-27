// Resolve the named D1 database for releases without committing an account-specific ID.
import { readFileSync, writeFileSync } from 'node:fs';
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!account || !token) throw new Error('Cloudflare account ID and API token are required.');
const endpoint = `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database`;
async function api(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization:`Bearer ${token}`, 'content-type':'application/json' } });
  const data = await response.json();
  if (!response.ok || !data.success) throw new Error(`D1 setup failed (${response.status}): ${data.errors?.map(e=>e.message).join('; ')}. The release token needs Account / D1 / Edit permission.`);
  return data;
}
const name = 'osrs-hiscores-history';
let database;
for (let page=1; ;page++) {
  const data = await api(`${endpoint}?per_page=100&page=${page}`);
  database = data.result.find(db=>db.name === name);
  if (database || data.result.length < 100) break;
}
if (!database) database = (await api(endpoint,{method:'POST',body:JSON.stringify({name})})).result;
if (!/^[a-f0-9-]{36}$/.test(database.uuid)) throw new Error('Unexpected D1 database identifier.');
const config = new URL('../workers/wrangler.toml',import.meta.url);
const source = readFileSync(config,'utf8');
const binding = /(\[\[d1_databases\]\][\s\S]*?binding = "HISTORY_DB"[\s\S]*?database_id = ")[a-f0-9-]+(")/;
if (!binding.test(source)) throw new Error('History D1 binding not found.');
writeFileSync(config,source.replace(binding,(_,prefix,suffix)=>prefix+database.uuid+suffix));
console.log(`History database ready: ${name}`);
