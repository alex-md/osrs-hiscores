// src/services/hiscores.service.js

import * as config from '../config.js';
import { xpToLevel } from '../utils.js';

export class HiscoresService {
    constructor(kvService) {
        this.kv = kvService;
    }

    // --- User Calculation Helpers ---
    calculateUserTotals(user) {
        if (!user || !user.skills) return { totalXp: 0, totalLevel: 0 };
        const totalXp = Object.values(user.skills).reduce((sum, skill) => sum + skill.xp, 0);
        const totalLevel = Object.values(user.skills).reduce((sum, skill) => sum + skill.level, 0);
        return { totalXp, totalLevel };
    }

    // --- Leaderboard Generation ---
    generateTotalLevelLeaderboard(users) {
        const data = users.map(user => ({
            username: user.username,
            ...this.calculateUserTotals(user)
        }));
        return data
            .sort((a, b) => b.totalLevel - a.totalLevel || b.totalXp - a.totalXp)
            .map((p, i) => ({ ...p, rank: i + 1 }));
    }

    generateAllSkillRankings(users) {
        const rankings = Object.fromEntries(config.SKILLS.map(skill => [skill, []]));
        users.forEach(user => {
            config.SKILLS.forEach(skillName => {
                const skill = user.skills?.[skillName];
                if (skill) rankings[skillName].push({ username: user.username, ...skill });
            });
        });
        Object.keys(rankings).forEach(skillName => {
            rankings[skillName]
                .sort((a, b) => b.level - a.level || b.xp - a.xp)
                .forEach((p, i) => p.rank = i + 1);
        });
        return rankings;
    }

    // --- User Update & Creation Logic ---
    getPlayerActivityType() {
        const rand = Math.random();
        let cumulative = 0;
        for (const [type, details] of Object.entries(config.PLAYER_ACTIVITY_TYPES)) {
            cumulative += details.probability;
            if (rand <= cumulative) return type;
        }
        return 'CASUAL'; // Fallback
    }

    generateNewUser(username) {
        const activityType = this.getPlayerActivityType();
        const user = { username, activityType, skills: {} };
        const profile = config.PLAYER_ACTIVITY_TYPES[activityType];
        const talent = 0.75 + Math.random() * 0.75;

        config.SKILLS.forEach(skill => {
            if (skill === 'Hitpoints') return;
            const weight = config.SKILL_POPULARITY_WEIGHTS[skill] || 1.0;
            const xp = Math.random() < profile.skillProbability
                ? Math.floor(Math.random() * (profile.xpRange.max * weight * talent - profile.xpRange.min * weight) + profile.xpRange.min * weight)
                : 0;
            user.skills[skill] = { xp: Math.min(200000000, Math.max(0, xp)), level: xpToLevel(xp) };
        });

        const combatXp = config.COMBAT_SKILLS.reduce((sum, s) => sum + (user.skills[s]?.xp || 0), 0);
        const hpXp = Math.max(1154, Math.floor((combatXp / 4) * 1.3));
        user.skills['Hitpoints'] = { xp: hpXp, level: xpToLevel(hpXp) };
        return user;
    }

    async createNewUsers(count) {
        const payloads = [];
        const usedUsernames = new Set();

        for (let i = 0; i < count; i++) {
            let username, isUnique = false, attempts = 0;
            while (!isUnique && attempts < 10) {
                try {
                    const response = await fetch('https://random-word-api.herokuapp.com/word', { signal: AbortSignal.timeout(3000) });
                    if (response.ok) {
                        const [word] = await response.json();
                        const baseUsername = word.charAt(0).toUpperCase() + word.slice(1);
                        const suffix = Math.random() < 0.2 ? Math.floor(Math.random() * 999) : '';
                        username = baseUsername + suffix;

                        // Check both local set and KV store to prevent race conditions
                        if (!usedUsernames.has(username.toLowerCase()) && !(await this.kv.getUser(username))) {
                            usedUsernames.add(username.toLowerCase());
                            isUnique = true;
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to fetch random word (attempt ${attempts + 1}):`, error.message);
                    // Fallback to timestamp-based username if API fails
                    if (attempts >= 5) {
                        const timestamp = Date.now().toString(36);
                        username = `User${timestamp}`;
                        if (!usedUsernames.has(username.toLowerCase()) && !(await this.kv.getUser(username))) {
                            usedUsernames.add(username.toLowerCase());
                            isUnique = true;
                        }
                    }
                }
                attempts++;
            }
            if (isUnique) {
                const userData = this.generateNewUser(username);
                const payload = { username, data: userData };

                // Add creation metadata if REST API is available
                if (this.kv.hasRestApi) {
                    payload.metadata = {
                        created: new Date().toISOString(),
                        source: 'auto_generated',
                        activityType: userData.activityType
                    };
                }

                payloads.push(payload);
            }
        }
        return payloads;
    }

    // --- Scheduled Update (Cron) Logic ---
    async runScheduledUpdate() {
        console.log(`Starting scheduled update...`);
        const userKeys = await this.kv.listUserKeys();
        if (userKeys.length === 0) return { message: "No users found." };

        const cronState = await this.kv.getCronState();
        let startIndex = cronState.lastProcessedIndex;

        // Reset index if user count has changed significantly
        if (Math.abs(userKeys.length - cronState.totalUsers) > 50) {
            startIndex = 0;
        }

        const usersToProcess = Math.min(config.MAX_USERS_PER_SCHEDULED_RUN, userKeys.length);
        const selectedUserKeys = Array.from({ length: usersToProcess }, (_, i) => userKeys[(startIndex + i) % userKeys.length]);

        // Fetch users in batches
        const users = await Promise.all(selectedUserKeys.map(key => this.kv.getUser(key.name))).then(u => u.filter(Boolean));

        // Process updates
        const updatePayloads = this.processUserUpdates(users);
        const newUserCount = Math.random() < 0.2 ? 1 : 0;
        const newUserPayloads = await this.createNewUsers(newUserCount);

        // Save all changes
        const allPayloads = [...updatePayloads, ...newUserPayloads];
        if (allPayloads.length > 0) {
            await this.saveBatchUpdatesOptimized(allPayloads);
        }

        // Conditionally regenerate leaderboards
        const leaderboards = await this.kv.getLeaderboards();
        const now = new Date();
        const lastUpdated = leaderboards.lastUpdated ? new Date(leaderboards.lastUpdated) : null;
        const shouldRegenerate = !lastUpdated || (now - lastUpdated) > config.LEADERBOARD_CACHE_TTL_MINUTES * 60 * 1000;

        if (shouldRegenerate) {
            console.log("Regenerating leaderboards...");
            await this.regenerateLeaderboardsEfficiently();
        }

        // Update cron state
        await this.kv.setCronState({
            lastProcessedIndex: (startIndex + usersToProcess) % userKeys.length,
            totalUsers: userKeys.length,
        });

        console.log(`Update complete. Updated: ${updatePayloads.length}, Created: ${newUserPayloads.length}, Leaderboards: ${shouldRegenerate ? ' regenerated' : 'fresh'}`);
    }

    processUserUpdates(users) {
        const updatePayloads = [];
        for (const user of users) {
            let hasChanges = !user.activityType;
            user.activityType = user.activityType || this.getPlayerActivityType();

            config.SKILLS.forEach(skillName => {
                if (skillName === 'Hitpoints') return;
                const skill = user.skills[skillName];
                const xpGained = this.generateWeightedXpGain(user.activityType, skillName, skill.level);
                if (xpGained > 0 && skill.xp < 200000000) {
                    skill.xp = Math.min(200000000, skill.xp + xpGained);
                    skill.level = xpToLevel(skill.xp);
                    hasChanges = true;
                }
            });

            if (this.updateHitpoints(user)) hasChanges = true;

            if (hasChanges) {
                updatePayloads.push({ username: user.username, data: user });
            }
        }
        return updatePayloads;
    }

    generateWeightedXpGain(activityType, skillName, currentLevel = 1) {
        const activity = config.PLAYER_ACTIVITY_TYPES[activityType];
        const weight = config.SKILL_POPULARITY_WEIGHTS[skillName] || 1.0;
        if (Math.random() > activity.skillProbability * weight) return 0;

        const efficiency = 0.6 + Math.random() * 0.8;
        const baseXp = Math.floor(Math.random() * (activity.xpRange.max - activity.xpRange.min + 1) + activity.xpRange.min);
        const levelScaling = 1 + (currentLevel / 99) * config.LEVEL_SCALING_FACTOR;
        const weekendBoost = config.WEEKEND_DAYS.includes(new Date().getUTCDay()) ? config.WEEKEND_BONUS_MULTIPLIER : 1;

        return Math.floor(baseXp * efficiency * weight * levelScaling * config.GLOBAL_XP_MULTIPLIER * weekendBoost);
    }

    updateHitpoints(user) {
        // 1) sum up all combat‐skill XP
        const combatXp = config.COMBAT_SKILLS.reduce(
            (sum, s) => sum + (user.skills[s]?.xp || 0),
            0
        );

        // 2) recalc HP XP exactly like in new‐user generator
        //    level 10 XP is this.levelToXp(10), so we mirror that
        const minHpXp = this.levelToXp(10);
        const newHpXp = Math.min(200000000, Math.max(
            minHpXp,
            Math.floor((combatXp / 4) * 1.3)
        ));

        // 3) only update if it actually changed
        const currHp = user.skills['Hitpoints'] || { xp: 0 };
        if (currHp.xp !== newHpXp) {
            currHp.xp = newHpXp;
            currHp.level = xpToLevel(newHpXp);
            return true;
        }
        return false;
    }

    // Helper method to convert level to XP (inverse of xpToLevel)
    levelToXp(level) {
        if (level <= 1) return 0;
        let xp = 0;
        for (let i = 1; i < level; i++) {
            xp += Math.floor(i + 300 * Math.pow(2, i / 7));
        }
        return Math.floor(xp / 4);
    }



    // --- Memory-Efficient Leaderboard Generation ---
    async regenerateLeaderboardsEfficiently() {
        const totalLevelData = [];
        const skillRankings = Object.fromEntries(config.SKILLS.map(skill => [skill, []]));

        // Process users in batches to avoid memory issues
        for await (const userBatch of this.kv.streamAllUsers(50)) {
            // Process total level data
            userBatch.forEach(user => {
                const totals = this.calculateUserTotals(user);
                totalLevelData.push({
                    username: user.username,
                    ...totals
                });

                // Process skill rankings
                config.SKILLS.forEach(skillName => {
                    const skill = user.skills?.[skillName];
                    if (skill) {
                        skillRankings[skillName].push({
                            username: user.username,
                            ...skill
                        });
                    }
                });
            });
        }

        // Sort and rank total level leaderboard
        const totalLevelLeaderboard = totalLevelData
            .sort((a, b) => b.totalLevel - a.totalLevel || b.totalXp - a.totalXp)
            .map((p, i) => ({ ...p, rank: i + 1 }));

        // Sort and rank skill leaderboards
        Object.keys(skillRankings).forEach(skillName => {
            skillRankings[skillName]
                .sort((a, b) => b.level - a.level || b.xp - a.xp)
                .forEach((p, i) => p.rank = i + 1);
        });

        // Save the leaderboards with TTL if REST API is available
        const leaderboardData = {
            totalLevel: totalLevelLeaderboard,
            skills: skillRankings,
            lastUpdated: new Date().toISOString(),
        };

        // Use enhanced TTL functionality if available, otherwise fallback to regular save
        if (this.kv.hasRestApi) {
            await this.kv.setLeaderboardsWithTTL(leaderboardData, config.REST_API_CONFIG.LEADERBOARD_TTL_SECONDS);
        } else {
            await this.kv.setLeaderboards(leaderboardData);
        }
    }

    // Enhanced batch processing using bulk operations
    async saveBatchUpdatesOptimized(updatePayloads) {
        // The KVService will automatically determine whether to use bulk operations
        // based on payload size and REST API availability
        return this.kv.saveBatchUpdates(updatePayloads);
    }

    // Enhanced user fetching with bulk operations
    async getAllUsersOptimized(maxUsers = null) {
        // The KVService will automatically determine whether to use bulk operations
        // based on user count and REST API availability
        return this.kv.getAllUsers(100, maxUsers);
    }
}
