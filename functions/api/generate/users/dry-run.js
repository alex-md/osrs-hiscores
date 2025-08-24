// Pages Function wrapper for /api/generate/users/dry-run endpoint.
// Delegates to the unified Worker implementation.

import { handleApiRequest } from '../../../../workers/src/index.js';

export async function onRequestGet(context) {
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
        console.error('API Error (generate users dry-run Pages Function):', err);
        return new Response(JSON.stringify({ error: 'Internal error', detail: String(err) }), {
            status: 500,
            headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
        });
    }
}
