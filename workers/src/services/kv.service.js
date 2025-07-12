// src/services/kv.service.js

export class KVService {
    constructor(kvNamespace, env = null) {
        this.kv = kvNamespace;
        this.env = env;

        // Check if REST API is available
        this.hasRestApi = !!(this.env && this.env.ACCOUNT_ID && this.env.CF_API_TOKEN && this.env.KV_NAMESPACE_ID);

        if (this.hasRestApi) {
            console.log('KV Service initialized with REST API support');
        } else {
            console.log('KV Service initialized with standard bindings only');
        }
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

    async getAllUsers(batchSize = 100, maxUsers = null) {
        const userKeys = await this.listUserKeys();
        if (!userKeys || userKeys.length === 0) return [];

        // Limit the number of users to process if maxUsers is specified
        const keysToProcess = maxUsers ? userKeys.slice(0, maxUsers) : userKeys;

        // Use bulk operations if available and beneficial
        if (this.hasRestApi && keysToProcess.length >= 50) {
            console.log(`Using bulk GET for ${keysToProcess.length} users`);
            const usernames = keysToProcess.map(key => key.name);
            return this.getBulkUsers(usernames, true);
        }

        // Fallback to individual requests
        const users = [];
        for (let i = 0; i < keysToProcess.length; i += batchSize) {
            const batchKeys = keysToProcess.slice(i, i + batchSize);
            const userPromises = batchKeys.map(key => this.getUser(key.name));
            const batchUsers = await Promise.all(userPromises);
            users.push(...batchUsers.filter(Boolean));

            // Add delay between batches to prevent overwhelming the KV store
            if (i + batchSize < keysToProcess.length) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
        return users;
    }

    // New method for streaming user processing without loading all into memory
    async *streamAllUsers(batchSize = 50) {
        const userKeys = await this.listUserKeys();
        if (!userKeys || userKeys.length === 0) return;

        for (let i = 0; i < userKeys.length; i += batchSize) {
            const batchKeys = userKeys.slice(i, i + batchSize);
            const userPromises = batchKeys.map(key => this.getUser(key.name));
            const batchUsers = await Promise.all(userPromises);
            yield batchUsers.filter(Boolean);

            // Add delay between batches
            if (i + batchSize < userKeys.length) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }
    }

    async saveBatchUpdates(updatePayloads, batchSize = 50, delay = 100) {
        // Use bulk operations if available and beneficial
        if (this.hasRestApi && updatePayloads.length >= 50) {
            console.log(`Using bulk PUT for ${updatePayloads.length} updates`);
            return this.saveBulkUpdates(updatePayloads, true);
        }

        // Fallback to individual batch processing
        for (let i = 0; i < updatePayloads.length; i += batchSize) {
            const batch = updatePayloads.slice(i, i + batchSize);

            // Process each item in the batch, handling metadata if present
            const batchPromises = batch.map(payload => {
                if (payload.metadata && this.hasRestApi) {
                    // Use metadata-aware put for new users
                    return this.putUserWithMetadata(payload.username, payload.data, null, payload.metadata);
                } else {
                    // Use regular put for existing users
                    return this.putUser(payload.username, payload.data);
                }
            });

            await Promise.all(batchPromises);

            if (i + batchSize < updatePayloads.length) {
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // Enhanced bulk operations using REST API when available
    async getBulkUsers(usernames, useRestApi = false) {
        if (!useRestApi || !this.hasRestApi) {
            // Fallback to existing implementation
            const userPromises = usernames.map(username => this.getUser(username));
            return Promise.all(userPromises);
        }

        // Use REST API bulk get (up to 100 keys)
        const chunks = this.chunkArray(usernames, 100);
        const allUsers = [];

        for (const chunk of chunks) {
            try {
                const response = await fetch(
                    `https://api.cloudflare.com/client/v4/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${this.env.KV_NAMESPACE_ID}/bulk/get`,
                    {
                        method: 'POST',
                        headers: {
                            'Authorization': `Bearer ${this.env.CF_API_TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(chunk.map(name => name.toLowerCase()))
                    }
                );

                if (response.ok) {
                    const result = await response.json();
                    const users = result.result.values.map(item =>
                        item.value ? JSON.parse(item.value) : null
                    ).filter(Boolean);
                    allUsers.push(...users);
                } else {
                    console.warn('Bulk GET failed, falling back to individual requests for chunk');
                    // Fallback to individual requests for this chunk
                    const fallbackUsers = await Promise.all(
                        chunk.map(username => this.getUser(username))
                    );
                    allUsers.push(...fallbackUsers.filter(Boolean));
                }
            } catch (error) {
                console.error('Bulk get failed, falling back to individual requests:', error);
                const fallbackUsers = await Promise.all(
                    chunk.map(username => this.getUser(username))
                );
                allUsers.push(...fallbackUsers.filter(Boolean));
            }
        }

        return allUsers;
    }

    async saveBulkUpdates(updatePayloads, useRestApi = false) {
        if (!useRestApi || !this.hasRestApi) {
            // Use existing implementation
            return this.saveBatchUpdates(updatePayloads);
        }

        // Use REST API bulk put (up to 10,000 keys)
        const chunks = this.chunkArray(updatePayloads, 5000); // Conservative batch size
        const results = [];

        for (const chunk of chunks) {
            try {
                const bulkData = chunk.map(payload => {
                    const bulkItem = {
                        key: payload.username.toLowerCase(),
                        value: JSON.stringify(payload.data)
                    };

                    // Add metadata if available (either from payload or default)
                    if (payload.metadata) {
                        bulkItem.metadata = {
                            lastUpdated: new Date().toISOString(),
                            source: 'bulk_update',
                            ...payload.metadata
                        };
                    } else {
                        bulkItem.metadata = {
                            lastUpdated: new Date().toISOString(),
                            source: 'bulk_update'
                        };
                    }

                    return bulkItem;
                });

                const response = await fetch(
                    `https://api.cloudflare.com/client/v4/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${this.env.KV_NAMESPACE_ID}/bulk`,
                    {
                        method: 'PUT',
                        headers: {
                            'Authorization': `Bearer ${this.env.CF_API_TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(bulkData)
                    }
                );

                if (response.ok) {
                    const result = await response.json();
                    results.push({
                        successful: result.result.successful_key_count,
                        unsuccessful: result.result.unsuccessful_keys || []
                    });

                    // Retry failed keys individually if any
                    if (result.result.unsuccessful_keys?.length > 0) {
                        console.warn(`Retrying ${result.result.unsuccessful_keys.length} failed keys individually`);
                        for (const failedKey of result.result.unsuccessful_keys) {
                            const payload = chunk.find(p => p.username.toLowerCase() === failedKey);
                            if (payload) {
                                await this.putUser(payload.username, payload.data);
                            }
                        }
                    }
                } else {
                    console.error('Bulk update failed, falling back to batch updates');
                    await this.saveBatchUpdates(chunk);
                }
            } catch (error) {
                console.error('Bulk update failed, falling back to batch updates:', error);
                await this.saveBatchUpdates(chunk);
            }
        }

        return results;
    }

    // Enhanced user storage with metadata and optional TTL
    async putUserWithMetadata(username, data, ttlSeconds = null, metadata = {}) {
        const key = username.toLowerCase();
        const value = JSON.stringify(data);

        if (!this.hasRestApi) {
            // Use regular KV binding (no metadata support)
            const options = ttlSeconds ? { expirationTtl: ttlSeconds } : {};
            return this.kv.put(key, value, options);
        }

        // Add default metadata
        const fullMetadata = {
            lastUpdated: new Date().toISOString(),
            source: 'api',
            ...metadata
        };

        // Use REST API for metadata support
        const formData = new FormData();
        formData.append('value', value);
        formData.append('metadata', JSON.stringify(fullMetadata));

        if (ttlSeconds) {
            formData.append('expiration_ttl', ttlSeconds.toString());
        }

        try {
            const response = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${this.env.KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${this.env.CF_API_TOKEN}`
                    },
                    body: formData
                }
            );

            if (!response.ok) {
                console.warn('REST API put failed, falling back to KV binding');
                const options = ttlSeconds ? { expirationTtl: ttlSeconds } : {};
                return this.kv.put(key, value, options);
            }

            return response.json();
        } catch (error) {
            console.error('REST API put failed, falling back to KV binding:', error);
            const options = ttlSeconds ? { expirationTtl: ttlSeconds } : {};
            return this.kv.put(key, value, options);
        }
    }

    // Get user metadata
    async getUserMetadata(username) {
        if (!this.hasRestApi) {
            return null; // No metadata support with KV binding
        }

        try {
            const response = await fetch(
                `https://api.cloudflare.com/client/v4/accounts/${this.env.ACCOUNT_ID}/storage/kv/namespaces/${this.env.KV_NAMESPACE_ID}/metadata/${encodeURIComponent(username.toLowerCase())}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.env.CF_API_TOKEN}`
                    }
                }
            );

            if (response.ok) {
                const result = await response.json();
                return result.result;
            }
        } catch (error) {
            console.error('Failed to get metadata:', error);
        }

        return null;
    }

    // Enhanced leaderboard caching with TTL
    async setLeaderboardsWithTTL(leaderboards, ttlSeconds = 3600) { // 1 hour default
        const data = {
            ...leaderboards,
            lastUpdated: new Date().toISOString(),
            version: Date.now() // For cache busting
        };

        if (this.hasRestApi) {
            return this.putUserWithMetadata('__leaderboards__', data, ttlSeconds, {
                type: 'leaderboard',
                ttl: ttlSeconds
            });
        } else {
            // Fallback to regular setLeaderboards
            return this.setLeaderboards(data);
        }
    }

    // Utility method to chunk arrays
    chunkArray(array, chunkSize) {
        const chunks = [];
        for (let i = 0; i < array.length; i += chunkSize) {
            chunks.push(array.slice(i, i + chunkSize));
        }
        return chunks;
    }
}
