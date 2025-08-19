// Unified Pages Function delegating to the Worker implementation.
// This keeps API logic in one place (workers/src/index.js) while
// allowing Cloudflare Pages Functions to serve the same endpoints.

import { handleApiRequest } from '../../workers/src/index.js';

export async function onRequest(context) {
    const { request, env } = context;
    try {
        if (!env.HISCORES_KV) {
            return new Response(JSON.stringify({ error: 'KV binding HISCORES_KV missing' }), {
                status: 500,
                headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
            });
        }
        return await handleApiRequest(request, env);
    } catch (err) {
        console.error('API Error (Pages Function):', err);
        return new Response(JSON.stringify({ error: 'Internal error', detail: String(err) }), {
            status: 500,
            headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
        });
    }
}
