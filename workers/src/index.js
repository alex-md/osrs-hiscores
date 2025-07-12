// src/index.js

import { Router } from './router.js';
import { KVService } from './services/kv.service.js';
import { HiscoresService } from './services/hiscores.service.js';

export default {
    async fetch(request, env, ctx) {
        const kvService = new KVService(env.HISCORES_KV, env);
        const hiscoresService = new HiscoresService(kvService);
        const router = new Router(hiscoresService);
        return router.handle(request);
    },

    async scheduled(controller, env, ctx) {
        console.log(`Cron triggered: ${controller.cron}`);
        const kvService = new KVService(env.HISCORES_KV, env);
        const hiscoresService = new HiscoresService(kvService);
        ctx.waitUntil(hiscoresService.runScheduledUpdate());
    },
};
