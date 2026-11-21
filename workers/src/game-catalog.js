import { defaultGameContent, applyGameContent, currentGameContent } from '../../frontend/lib/game-content.js';
import { SKILLS } from './constants.js';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(`Invalid game catalog: ${message}`); };
const finite = (value, min, max) => Number.isFinite(value) && value >= min && value <= max;
export function validateGameCatalog(content, previous = defaultGameContent) {
  if (!object(content) || content.version !== 1 || !Array.isArray(content.bosses) || !object(content.items) || !object(content.skillOutputs) || !object(content.skillItems) || !object(content.trainingCeilings)) fail('unsupported format');
  if (JSON.stringify(content).length > 400_000) fail('catalog exceeds 400KB');
  if (content.bosses.length < previous.bosses.length || content.bosses.length > 96) fail('encounters must be append-only, up to 96');
  const safeKey = key => /^[a-z][a-z0-9-]{0,60}$/.test(key);
  const text = value => typeof value === 'string' && value.length > 0 && value.length <= 160;
  const ids = Object.keys(content.items);
  if (ids.length > 1000) fail('too many items');
  for (const [id, item] of Object.entries(content.items)) {
    if (!object(item) || !/^[1-9]\d{0,8}$/.test(id) || !text(item.name) || !finite(item.price,1,1e12)) fail(`item ${id}`);
    if (item.power !== undefined && (!finite(item.power,0,.5) || !['all','melee','attack','strength','defence','ranged','magic'].includes(item.style) || !finite(item.requiredLevel,1,99))) fail(`equipment ${id}`);
  }
  for (const id of Object.keys(previous.items)) if (!content.items[id]) fail(`cannot remove historical item ${id}`);
  const seen = new Set();
  for (const [index,boss] of content.bosses.entries()) {
    if (!object(boss) || !safeKey(boss.key) || seen.has(boss.key) || (previous.bosses[index] && previous.bosses[index].key !== boss.key)) fail('encounter keys and ordering are immutable');
    seen.add(boss.key);
    if (!text(boss.name) || !finite(boss.combat,1,126) || !finite(boss.killsPerHour,.1,1000) || !finite(boss.hp,1,100000) || !finite(boss.cost,0,1e8) || !finite(boss.commonLoot,0,1e9) || !finite(boss.loot,0,1e9)) fail(`encounter ${boss.key}`);
    if (boss.styles && (!Array.isArray(boss.styles) || !boss.styles.length || boss.styles.some(s=>!['attack','strength','defence','ranged','magic'].includes(s)))) fail(`styles ${boss.key}`);
    if (typeof boss.raid !== 'boolean' || !['kills','completions'].includes(boss.unit)) fail(`encounter units ${boss.key}`);
    for (const [skill,level] of Object.entries(boss.requirements || {})) if (!SKILLS.includes(skill) || !Number.isInteger(level) || !finite(level,1,99)) fail(`requirements ${boss.key}`);
    if (boss.slayer !== undefined && !finite(boss.slayer,0,99)) fail(`slayer ${boss.key}`);
    for (const [id,quantity] of Object.entries(boss.supplies || {})) if (!content.items[id] || !Number.isInteger(quantity) || !finite(quantity,1,10000)) fail(`supplies ${boss.key}`);
    if (!Array.isArray(boss.drops) || boss.drops.length > 100) fail(`drops ${boss.key}`);
    const groups = new Map(), dropIds = new Set();
    for (const drop of boss.drops) {
      if (!object(drop) || !content.items[drop.id] || dropIds.has(String(drop.id)) || !Number.isInteger(drop.quantity) || !finite(drop.quantity,1,1e6) || !finite(drop.chance,Number.EPSILON,1)) fail(`drop ${boss.key}`);
      dropIds.add(String(drop.id));
      if (drop.rare) groups.set(drop.group || 'unique',(groups.get(drop.group || 'unique') || 0)+drop.chance);
    }
    if ([...groups.values()].some(chance=>chance>1)) fail(`rare group exceeds probability 1: ${boss.key}`);
  }
  for (const skill of Object.keys(previous.skillOutputs)) if (!content.skillOutputs[skill]) fail(`missing resource tiers ${skill}`);
  for (const [skill,tiers] of Object.entries(content.skillOutputs || {})) {
    if (!SKILLS.includes(skill) || !Array.isArray(tiers) || !tiers.length) fail('skill output');
    let last = 0;
    for (const tier of tiers) { if (!Array.isArray(tier) || tier.length !== 2) fail(`resource tier ${skill}`); const [level,id] = tier; if (!Number.isInteger(level) || level <= last || level > 99 || !content.items[id]) fail(`resource tiers ${skill}`); last=level; }
  }
  for (const skill of SKILLS) if (!finite(content.trainingCeilings?.[skill],1,1e6)) fail(`training ceiling ${skill}`);
  for (const [skill,id] of Object.entries(content.skillItems || {})) if (!SKILLS.includes(skill) || !content.items[id]) fail(`skill item ${skill}`);
  return content;
}

// D1 owns authored content, while the Durable Object remains the world owner.
// A missing binding uses the bootstrap in tests. A configured-but-broken database
// retains the published catalog with an explicit diagnostic on read/validation failure.
export async function loadGameCatalog(env, previous) {
  const db = env.HISTORY_DB;
  if (!db) { applyGameContent(previous || defaultGameContent); return { source:'bootstrap', content:currentGameContent() }; }
  try {
    const row = await db.prepare("SELECT payload, revision FROM game_catalog WHERE id = 'active'").first();
    if (!row) throw new Error('D1 game catalog is empty. Apply catalog migrations.');
    const content = validateGameCatalog(JSON.parse(row.payload), previous || defaultGameContent);
    applyGameContent(content);
    return { source:'d1', revision:row.revision, content };
  } catch (error) {
    if (!previous) throw error;
    applyGameContent(previous);
    return {source:'last-known-good', error:error.message.slice(0,300), content:currentGameContent()};
  }
}

export async function editGameCatalog(env, body) {
  if (!env.HISTORY_DB) throw new Error('D1 is not configured.');
  const row = await env.HISTORY_DB.prepare("SELECT payload, revision FROM game_catalog WHERE id = 'active'").first();
  if (!row) throw new Error('D1 catalog migration is missing.');
  validateGameCatalog(body.content, JSON.parse(row.payload));
  if (body.expectedRevision !== row.revision) return { conflict:true, revision:row.revision };
  if (body.dryRun !== false) return { dryRun:true, revision:row.revision, items:Object.keys(body.content.items).length, encounters:body.content.bosses.length };
  const payload = JSON.stringify(body.content), now = Date.now();
  const results = await env.HISTORY_DB.batch([
    env.HISTORY_DB.prepare("INSERT OR IGNORE INTO game_catalog_revisions (revision,payload,updated_at) SELECT revision,payload,updated_at FROM game_catalog WHERE id = 'active' AND revision = ?").bind(row.revision),
    env.HISTORY_DB.prepare("UPDATE game_catalog SET payload = ?, revision = revision + 1, updated_at = ? WHERE id = 'active' AND revision = ?").bind(payload,now,row.revision),
  ]);
  if (results[1].meta?.changes !== 1) return { conflict:true, revision:row.revision };
  return { applied:true, revision:row.revision+1, activatesOnNextUpdate:true };
}
