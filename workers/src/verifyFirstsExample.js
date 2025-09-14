// Simple manual verification script (not part of worker runtime)
// Usage (with Miniflare or node fetch polyfill environment):
//   import './verifyFirstsExample.js'
// Adjust BASE below to point at a running dev worker.

const BASE = process.env.HISCORES_BASE || 'http://127.0.0.1:8787';

async function main() {
    try {
        const res = await fetch(BASE + '/api/achievements/firsts');
        const data = await res.json();
        console.log('[firsts] keys:', Object.keys(data.firsts).length);
        const sample = Object.entries(data.firsts).slice(0, 5);
        for (const [k, v] of sample) console.log(' -', k, '=>', v.username, 'at', new Date(v.timestamp).toISOString());
        if (data.v2) {
            const withCounts = Object.entries(data.v2.counts || {}).filter(([, c]) => c > 0).slice(0, 5);
            console.log('[counts sample]', withCounts);
        }
    } catch (err) {
        console.error('Verify firsts failed:', err);
    }
}

if (typeof fetch !== 'undefined') {
    main();
} else {
    console.error('Global fetch not available; run in environment with fetch (Node 18+, Miniflare, etc).');
}
