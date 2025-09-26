import { ACHIEVEMENT_KEYS } from './achievements.js';

export const SYNC_SNAPSHOT_VERSION = 1;

export const DEFAULT_SNAPSHOT_KEYS = [
    { key: 'stats:leaderboard:top', required: true },
    { key: 'stats:leaderboard:skills', required: true },
    { key: 'stats:achievements:prevalence', required: true },
    { key: 'ach:firsts:v2', required: true },
    { key: 'ach:firsts', required: false },
    { key: 'ach:events', required: false }
];

function cloneSafe(value) {
    if (value === null || typeof value !== 'object') return value;
    return JSON.parse(JSON.stringify(value));
}

async function getKvJson(env, key) {
    const raw = await env.HISCORES_KV.get(key);
    if (!raw) return null;
    try { return JSON.parse(raw); }
    catch (err) { throw new Error(`KV key ${key} contains invalid JSON: ${err.message}`); }
}

export function validateSnapshotObject(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
        throw new Error('Snapshot must be an object');
    }
    if (typeof snapshot.version !== 'number') {
        throw new Error('Snapshot missing numeric version');
    }
    if (!snapshot.kv || typeof snapshot.kv !== 'object') {
        throw new Error('Snapshot missing kv map');
    }
    for (const [key, value] of Object.entries(snapshot.kv)) {
        if (value === undefined) throw new Error(`Snapshot kv entry ${key} is undefined`);
    }
    if (snapshot.meta && typeof snapshot.meta !== 'object') {
        throw new Error('Snapshot meta must be an object if provided');
    }
    if (Array.isArray(snapshot.keys)) {
        for (const item of snapshot.keys) {
            if (!item || typeof item !== 'string') throw new Error('Snapshot.keys must be strings');
        }
    }
    return validateSnapshotObject(snapshot);
}

export async function buildSnapshot(env, options = {}) {
    if (!env || !env.HISCORES_KV) throw new Error('buildSnapshot requires env with HISCORES_KV');
    const {
        keys = DEFAULT_SNAPSHOT_KEYS,
        builders = {},
        allowPartial = false,
        includeChecksum = true,
        meta = {}
    } = options;

    const snapshot = {
        version: SYNC_SNAPSHOT_VERSION,
        generatedAt: Date.now(),
        kv: {}
    };

    const usedBuilders = {};

    for (const entry of keys) {
        const key = typeof entry === 'string' ? entry : entry?.key;
        const required = typeof entry === 'string' ? false : Boolean(entry?.required);
        if (!key) continue;
        let value = await getKvJson(env, key);
        if (value === null && typeof builders[key] === 'function') {
            value = await builders[key]();
            usedBuilders[key] = true;
            if (value !== undefined) {
                await env.HISCORES_KV.put(key, JSON.stringify(value));
            }
        }
        if (value === null) {
            if (required && !allowPartial) {
                throw new Error(`Missing required KV key ${key}`);
            }
            continue;
        }
        snapshot.kv[key] = cloneSafe(value);
    }

    const achCounts = snapshot.kv['stats:achievements:prevalence'];
    if (achCounts && achCounts.counts) {
        for (const key of ACHIEVEMENT_KEYS) {
            if (achCounts.counts[key] === undefined) {
                achCounts.counts[key] = 0;
            }
        }
    }

    const keyList = Object.keys(snapshot.kv).sort();
    snapshot.keys = keyList;
    snapshot.meta = { ...meta, usedBuilders, requiredKeys: keys.map(k => typeof k === 'string' ? k : k.key) };

    if (includeChecksum) {
        const payload = JSON.stringify(snapshot.kv);
        let hash = 0;
        for (let i = 0; i < payload.length; i++) {
            hash = ((hash << 5) - hash + payload.charCodeAt(i)) | 0;
        }
        snapshot.checksum = (hash >>> 0).toString(16);
    }

    return snapshot;
}

