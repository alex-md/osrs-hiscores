// src/services/kv.service.js

export class KVService {
    constructor(kvNamespace) {
        this.kv = kvNamespace;
    }

    async getUser(username) {
        if (!username) return null;
        return this.kv.get(username.toLowerCase(), 'json');
    }

    async putUser(username, data) {
        return this.kv.put(username.toLowerCase(), JSON.stringify(data));
    }

    async getCronState() {
        return (await this.kv.get('__cron_state__', 'json')) || { lastProcessedIndex: 0, totalUsers: 0 };
    }

    async setCronState(state) {
        return this.kv.put('__cron_state__', JSON.stringify(state));
    }

    async getLeaderboards() {
        return (await this.kv.get('__leaderboards__', 'json')) || { totalLevel: [], skills: {}, lastUpdated: null };
    }

    async setLeaderboards(leaderboards) {
        return this.kv.put('__leaderboards__', JSON.stringify(leaderboards));
    }

    async listUserKeys() {
        const kvList = await this.kv.list();
        return kvList.keys.filter(key => !key.name.startsWith('__'));
    }

    async getAllUsers(batchSize = 100) {
        const userKeys = await this.listUserKeys();
        if (!userKeys || userKeys.length === 0) return [];

        const users = [];
        for (let i = 0; i < userKeys.length; i += batchSize) {
            const batchKeys = userKeys.slice(i, i + batchSize);
            const userPromises = batchKeys.map(key => this.getUser(key.name));
            const batchUsers = await Promise.all(userPromises);
            users.push(...batchUsers.filter(Boolean));
            if (i + batchSize < userKeys.length) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        return users;
    }

    async saveBatchUpdates(updatePayloads, batchSize = 50, delay = 100) {
        for (let i = 0; i < updatePayloads.length; i += batchSize) {
            const batch = updatePayloads.slice(i, i + batchSize);
            await Promise.all(batch.map(p => this.putUser(p.username, p.data)));
            if (i + batchSize < updatePayloads.length) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
}
