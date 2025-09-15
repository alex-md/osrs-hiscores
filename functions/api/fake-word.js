// (Deprecated) Former /api/fake-word Pages Function wrapper removed after consolidation into Worker.
export async function onRequestGet() {
    return new Response(JSON.stringify({ error: 'Deprecated wrapper removed. Use Worker API.' }), { status: 410, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
}
