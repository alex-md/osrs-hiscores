// src/services/hiscores.service.js

import * as config from '../config.js';
import { xpToLevel } from '../utils.js';
import { AvatarService } from './avatar.service.js';

export class HiscoresService {
    constructor(kvService) {
        this.kv = kvService;
        this.avatarService = new AvatarService();
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
    getPlayerArchetype() {
        const rand = Math.random();
        let cumulative = 0;
        for (const [type, details] of Object.entries(config.PLAYER_ARCHETYPES)) {
            cumulative += details.probability;
            if (rand <= cumulative) return type;
        }
        return 'CASUAL'; // Fallback
    }

    generateNewUser(username) {
        const archetype = this.getPlayerArchetype();
        const user = { username, archetype, skills: {}, status: 'active' };
        const profile = config.PLAYER_ARCHETYPES[archetype];
        const talent = 0.75 + Math.random() * 0.75;

        // Generate avatar configuration
        user.avatar = this.avatarService.getAvatarConfig(username);

        config.SKILLS.forEach(skill => {
            if (skill === 'Hitpoints') return;
            const focusWeights = config.SKILL_FOCUS_WEIGHTS[profile.focus] || {};
            const popularityWeight = config.SKILL_POPULARITY_WEIGHTS[skill] || 1.0;
            const finalWeight = focusWeights[skill] !== undefined ? focusWeights[skill] : popularityWeight;

            const xp = Math.random() < profile.skillProbability
                ? Math.floor(Math.random() * (profile.xpRange.max * finalWeight * talent - profile.xpRange.min * finalWeight) + profile.xpRange.min * finalWeight)
                : 0;
            user.skills[skill] = { xp: Math.min(200000000, Math.max(0, xp)), level: xpToLevel(xp) };
        });

        const combatXp = config.NON_HP_COMBAT_SKILLS.reduce((sum, s) => sum + (user.skills[s]?.xp || 0), 0);
        const hpXp = Math.max(1154, Math.floor(combatXp / 3));
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
                        archetype: userData.archetype
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
        await this.manageWorldEvents();

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
        const worldEvent = await this.kv.getWorldEvent();
        const updatePayloads = this.processUserUpdates(users, worldEvent);
        const newUserCount = Math.random() < 0.2 ? 4 : 0; // Increased from 1 to 4
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

    processUserUpdates(users, worldEvent) {
        const updatePayloads = [];
        for (const user of users) {
            let hasChanges = !user.archetype;
            user.archetype = user.archetype || this.getPlayerArchetype();

            // Ensure user has avatar configuration
            if (!user.avatar) {
                user.avatar = this.avatarService.getAvatarConfig(user.username);
                hasChanges = true;
            }

            // Handle burnout status
            if (user.status === 'burnout') {
                if (Math.random() < 0.2) { // 20% chance to recover from burnout
                    user.status = 'active';
                    user.archetype = 'CASUAL'; // Reset to casual after burnout
                    hasChanges = true;
                }
            } else if (user.archetype === 'ELITE' || user.archetype === 'LEGEND') {
                if (Math.random() < 0.02) { // 2% chance for top players to burnout
                    user.status = 'burnout';
                    hasChanges = true;
                }
            }

            config.SKILLS.forEach(skillName => {
                if (skillName === 'Hitpoints') return;
                const skill = user.skills[skillName];
                const xpGained = this.generateWeightedXpGain(
                    user.archetype,
                    skillName,
                    skill.level,
                    worldEvent
                );
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

    generateWeightedXpGain(archetype, skillName, currentLevel = 1, worldEvent) {
        const archetypeProfile = config.PLAYER_ARCHETYPES[archetype];
        const weight = config.SKILL_POPULARITY_WEIGHTS[skillName] || 1.0;
        if (Math.random() > archetypeProfile.skillProbability * weight) return 0;

        const efficiency = 0.6 + Math.random() * 0.8;
        const baseXp = Math.floor(
            Math.random() * (archetypeProfile.xpRange.max - archetypeProfile.xpRange.min + 1)
            + archetypeProfile.xpRange.min
        );
        const levelScaling = 1 + (currentLevel / 99) * config.LEVEL_SCALING_FACTOR;
        const weekendBoost = config.WEEKEND_DAYS.includes(new Date().getUTCDay())
            ? config.WEEKEND_BONUS_MULTIPLIER
            : 1;

        // original cubic burst
        const rawGain = Math.floor(
            baseXp * efficiency * weight * levelScaling * config.GLOBAL_XP_MULTIPLIER * weekendBoost
        );
        const cubed = Math.pow(rawGain, 3);

        // scale it back by 5×
        return Math.floor(cubed / 5);
    }


    updateHitpoints(user) {
        // 1) sum up all non-HP combat skill XP
        const combatXp = config.NON_HP_COMBAT_SKILLS.reduce(
            (sum, s) => sum + (user.skills[s]?.xp || 0),
            0
        );

        // 2) recalc HP XP: HP gets 1/3 the rate of other combat XP
        //    level 10 XP is this.levelToXp(10), so we mirror that
        const minHpXp = this.levelToXp(10);
        const newHpXp = Math.min(200000000, Math.max(
            minHpXp,
            Math.floor(combatXp / 3)
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

    async manageWorldEvents() {
        const currentEvent = await this.kv.getWorldEvent();
        const now = new Date();

        if (currentEvent && new Date(currentEvent.expires) > now) {
            return; // Event is still active
        }

        const eventKeys = Object.keys(config.WORLD_EVENTS);
        const eventType = eventKeys[Math.floor(Math.random() * eventKeys.length)];
        const eventDetails = config.WORLD_EVENTS[eventType];

        let skill = eventDetails.skill;
        if (eventType === 'SKILL_OF_THE_WEEK') {
            skill = config.SKILLS[Math.floor(Math.random() * config.SKILLS.length)];
        }

        const newEvent = {
            type: eventType,
            message: typeof eventDetails.message === 'function' ? eventDetails.message(skill) : eventDetails.message,
            skill: skill,
            started: now.toISOString(),
            expires: new Date(now.getTime() + eventDetails.durationHours * 60 * 60 * 1000).toISOString()
        };

        await this.kv.setWorldEvent(newEvent);
        console.log(`New world event started: ${newEvent.type} - ${newEvent.message}`);
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

    // --- Migration Methods ---

    /**
     * Migrates all existing users to use the new hitpoints calculation formula
     * This should be run once after deploying the new formula
     */
    async migrateAllUsersHitpoints() {
        console.log('Starting hitpoints migration for all users...');

        let totalProcessed = 0;
        let totalMigrated = 0;
        const batchSize = 50;
        const migrationPayloads = [];

        // Process users in batches to avoid memory issues
        for await (const userBatch of this.kv.streamAllUsers(batchSize)) {
            for (const user of userBatch) {
                totalProcessed++;

                // Store the old HP values for comparison
                const oldHpXp = user.skills['Hitpoints']?.xp || 0;
                const oldHpLevel = user.skills['Hitpoints']?.level || 10;

                // Apply the new hitpoints calculation
                const wasUpdated = this.updateHitpoints(user);

                if (wasUpdated) {
                    totalMigrated++;
                    const newHpXp = user.skills['Hitpoints'].xp;
                    const newHpLevel = user.skills['Hitpoints'].level;

                    console.log(`Migrated ${user.username}: HP ${oldHpLevel} (${oldHpXp} XP) -> ${newHpLevel} (${newHpXp} XP)`);

                    migrationPayloads.push({
                        username: user.username,
                        data: user
                    });
                }

                // Process in smaller batches to avoid overwhelming the system
                if (migrationPayloads.length >= 25) {
                    await this.saveBatchUpdatesOptimized(migrationPayloads);
                    migrationPayloads.length = 0; // Clear the array
                }
            }
        }

        // Save any remaining updates
        if (migrationPayloads.length > 0) {
            await this.saveBatchUpdatesOptimized(migrationPayloads);
        }

        // After migration, regenerate leaderboards to reflect the changes
        console.log('Regenerating leaderboards after migration...');
        await this.regenerateLeaderboardsEfficiently();

        const result = {
            totalProcessed,
            totalMigrated,
            migrationComplete: true,
            timestamp: new Date().toISOString()
        };

        console.log(`Hitpoints migration complete: ${totalMigrated}/${totalProcessed} users updated`);
        return result;
    }

    /**
     * Checks if a specific user needs hitpoints migration
     * Useful for spot-checking or debugging
     */
    checkUserHitpointsMigration(user) {
        const currentHpXp = user.skills['Hitpoints']?.xp || 0;

        // Calculate what the HP XP should be with the new formula
        const combatXp = config.NON_HP_COMBAT_SKILLS.reduce(
            (sum, s) => sum + (user.skills[s]?.xp || 0),
            0
        );
        const expectedHpXp = Math.max(this.levelToXp(10), Math.floor(combatXp / 3));

        return {
            username: user.username,
            currentHpXp,
            expectedHpXp,
            needsMigration: currentHpXp !== expectedHpXp,
            difference: expectedHpXp - currentHpXp
        };
    }
}
