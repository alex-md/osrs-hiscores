// (Deprecated) Former Pages Function wrapper removed after consolidating API logic into workers/src/index.js
// This file kept as placeholder to avoid stale imports during transition. Will be deleted.
export async function onRequestGet() {
    return new Response(JSON.stringify({ error: 'Deprecated endpoint wrapper removed. Use Worker API directly.' }), { status: 410, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
}
