// src/utils.js

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
};

export function jsonResponse(data, status = 200) {
    const headers = {
        'Content-Type': 'application/json',
        ...CORS_HEADERS
    };
    return new Response(JSON.stringify(data, null, 2), { status, headers });
}

export function handleOptions() {
    return new Response(null, { headers: CORS_HEADERS });
}

export function xpToLevel(xp) {
    if (xp < 0) return 1;
    let points = 0;
    for (let lvl = 1; lvl <= 99; lvl++) {
        points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
        if (Math.floor(points / 4) > xp) {
            return lvl;
        }
    }
    return 99;
}
