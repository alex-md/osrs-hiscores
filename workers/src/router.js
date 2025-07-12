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
            // Invoke-RestMethod -Uri "https://osrs-hiscores-clone.vs.workers.dev/api/cron/trigger" -Method POST
            if (pathname === '/api/cron/trigger' && request.method === 'POST') {
                await this.service.runScheduledUpdate();
                return jsonResponse({ message: 'Cron job executed successfully' });
            }

            const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
            if (userMatch?.[1]) {
                const user = await this.service.kv.getUser(decodeURIComponent(userMatch[1]));
                return user ? jsonResponse(user) : jsonResponse({ error: 'User not found' }, 404);
            }

            // Avatar endpoints
            const avatarMatch = pathname.match(/^\/api\/avatars\/([^/]+)$/);
            if (avatarMatch?.[1]) {
                const username = decodeURIComponent(avatarMatch[1]);
                const user = await this.service.kv.getUser(username);

                if (!user) {
                    return jsonResponse({ error: 'User not found' }, 404);
                }

                // If user doesn't have avatar config, generate it
                if (!user.avatar) {
                    user.avatar = this.service.avatarService.getAvatarConfig(username);
                    // Save the updated user data
                    await this.service.kv.setUser(username, user);
                }

                return jsonResponse(user.avatar);
            }

            const avatarSvgMatch = pathname.match(/^\/api\/avatars\/([^/]+)\/svg$/);
            if (avatarSvgMatch?.[1]) {
                const username = decodeURIComponent(avatarSvgMatch[1]);
                const user = await this.service.kv.getUser(username);

                if (!user) {
                    // Generate avatar for non-existent users too (for preview purposes)
                    const config = this.service.avatarService.getAvatarConfig(username);
                    const svg = this.service.avatarService.generateAvatarSVG(config);
                    return new Response(svg, {
                        headers: {
                            'Content-Type': 'image/svg+xml',
                            'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                }

                // Ensure user has avatar config
                if (!user.avatar) {
                    user.avatar = this.service.avatarService.getAvatarConfig(username);
                    await this.service.kv.setUser(username, user);
                }

                const svg = this.service.avatarService.generateAvatarSVG(user.avatar);
                return new Response(svg, {
                    headers: {
                        'Content-Type': 'image/svg+xml',
                        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }

            return jsonResponse({ error: 'Not Found' }, 404);
        } catch (error) {
            console.error('Router error:', error);
            return jsonResponse({ error: 'Internal Server Error', message: error.message }, 500);
        }
    }
}
