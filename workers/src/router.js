// src/router.js

import * as config from './config.js';
import { jsonResponse, handleOptions } from './utils.js';

export class Router {
    constructor(hiscoresService) {
        this.service = hiscoresService;
    }

    async handle(request) {
        if (request.method === 'OPTIONS') return handleOptions();

        const { pathname } = new URL(request.url);

        try {
            if (pathname === '/api/health') return jsonResponse({ status: 'OK' });
            if (pathname === '/api/skills') return jsonResponse({ skills: config.SKILLS });
            if (pathname === '/api/status') {
                const status = {
                    status: 'OK',
                    restApiEnabled: this.service.kv.hasRestApi,
                    bulkOperationsSupported: this.service.kv.hasRestApi,
                    features: {
                        bulkGet: this.service.kv.hasRestApi,
                        bulkPut: this.service.kv.hasRestApi,
                        metadata: this.service.kv.hasRestApi,
                        ttl: this.service.kv.hasRestApi
                    },
                    config: {
                        bulkGetBatchSize: config.REST_API_CONFIG.BULK_GET_BATCH_SIZE,
                        bulkPutBatchSize: config.REST_API_CONFIG.BULK_PUT_BATCH_SIZE,
                        leaderboardTtl: config.REST_API_CONFIG.LEADERBOARD_TTL_SECONDS
                    }
                };
                return jsonResponse(status);
            }
            if (pathname === '/api/skill-rankings') {
                const leaderboards = await this.service.kv.getLeaderboards();
                return jsonResponse(leaderboards);
            }
            if (pathname === '/api/events') {
                const event = await this.service.kv.getWorldEvent();
                return jsonResponse(event || { message: 'No active world event.' });
            }
            // Invoke-RestMethod -Uri "https://osrs-hiscores-clone.vs.workers.dev/api/cron/trigger" -Method POST
            if (pathname === '/api/cron/trigger' && request.method === 'POST') {
                await this.service.runScheduledUpdate();
                return jsonResponse({ message: 'Cron job executed successfully' });
            }

            if (pathname === '/api/users/generate' && request.method === 'POST') {
                const newUserPayloads = await this.service.createNewUsers(10);
                await this.service.saveBatchUpdatesOptimized(newUserPayloads);
                return jsonResponse({
                    message: 'Successfully generated 10 new users',
                    users: newUserPayloads.map(p => p.username)
                });
            }

            if (pathname === '/api/users/new-users' && request.method === 'POST') {
                const newUserPayloads = await this.service.createNewUsers(10);
                await this.service.saveBatchUpdatesOptimized(newUserPayloads);
                return jsonResponse({
                    message: 'Successfully generated 10 new users',
                    users: newUserPayloads.map(p => p.username)
                });
            }

            // Migration endpoint for hitpoints formula update
            // Invoke-RestMethod -Uri "https://osrs-hiscores-clone.vs.workers.dev/api/migrate/hitpoints" -Method POST
            if (pathname === '/api/migrate/hitpoints' && request.method === 'POST') {
                const result = await this.service.migrateAllUsersHitpoints();
                return jsonResponse(result);
            }

            const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
            if (userMatch?.[1]) {
                const user = await this.service.kv.getUser(decodeURIComponent(userMatch[1]));
                return user ? jsonResponse(user) : jsonResponse({ error: 'User not found' }, 404);
            }

            // Check hitpoints migration status for a specific user
            const migrationCheckMatch = pathname.match(/^\/api\/users\/([^/]+)\/hitpoints-check$/);
            if (migrationCheckMatch?.[1]) {
                const user = await this.service.kv.getUser(decodeURIComponent(migrationCheckMatch[1]));
                if (!user) return jsonResponse({ error: 'User not found' }, 404);

                const migrationInfo = this.service.checkUserHitpointsMigration(user);
                return jsonResponse(migrationInfo);
            }            // Avatar endpoints
            const avatarMatch = pathname.match(/^\/api\/avatars\/([^/]+)$/);
            if (avatarMatch?.[1]) {
                const username = decodeURIComponent(avatarMatch[1]);
                const avatarConfig = this.service.avatarService.getAvatarConfig(username);
                return jsonResponse(avatarConfig);
            }

            const avatarSvgMatch = pathname.match(/^\/api\/avatars\/([^/]+)\/svg$/);
            if (avatarSvgMatch?.[1]) {
                const username = decodeURIComponent(avatarSvgMatch[1]);
                const avatarUrl = this.service.avatarService.getAvatarUrl(username, 64);

                // Proxy the request to DiceBear to avoid CORS issues
                try {
                    const response = await fetch(avatarUrl);
                    if (!response.ok) {
                        throw new Error(`Avatar service returned ${response.status}`);
                    }

                    const svg = await response.text();
                    return new Response(svg, {
                        headers: {
                            'Content-Type': 'image/svg+xml',
                            'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                } catch (error) {
                    // Return a simple fallback SVG if the service fails
                    const fallbackSvg = `<svg width="64" height="64" xmlns="http://www.w3.org/2000/svg">
                        <rect width="64" height="64" fill="#5d4c38"/>
                        <circle cx="32" cy="20" r="12" fill="#c5b394"/>
                        <rect x="26" y="35" width="12" height="20" fill="#3a2d1d"/>
                        <text x="32" y="55" text-anchor="middle" fill="#ffb700" font-size="8">${username.charAt(0).toUpperCase()}</text>
                    </svg>`;

                    return new Response(fallbackSvg, {
                        headers: {
                            'Content-Type': 'image/svg+xml',
                            'Cache-Control': 'public, max-age=3600', // Cache fallback for 1 hour
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                }
            }

            return jsonResponse({ error: 'Not Found' }, 404);
        } catch (error) {
            console.error('Router error:', error);
            return jsonResponse({ error: 'Internal Server Error', message: error.message }, 500);
        }
    }
}
