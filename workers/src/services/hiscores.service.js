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

    async generateNewUser(username) {
        const archetype = this.getPlayerArchetype();
        const user = { username, archetype, skills: {}, status: 'active' };
        const profile = config.PLAYER_ARCHETYPES[archetype];
        const talent = 0.75 + Math.random() * 0.75;

        // Generate avatar configuration
        user.avatar = await this.avatarService.getAvatarConfig(username);

        // First pass: generate XP for all skills except Hitpoints
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

        // Calculate current total XP (excluding Hitpoints)
        const currentTotalXp = Object.values(user.skills).reduce((sum, skill) => sum + skill.xp, 0);
        const MAX_TOTAL_XP = 4600000; // 4.6M max total XP

        // If total XP exceeds the limit, scale down all skills proportionally
        if (currentTotalXp > MAX_TOTAL_XP) {
            const scaleFactor = MAX_TOTAL_XP / currentTotalXp;
            config.SKILLS.forEach(skill => {
                if (skill === 'Hitpoints') return;
                user.skills[skill].xp = Math.floor(user.skills[skill].xp * scaleFactor);
                user.skills[skill].level = xpToLevel(user.skills[skill].xp);
            });
        }

        // Calculate Hitpoints after scaling
        const combatXp = config.NON_HP_COMBAT_SKILLS.reduce((sum, s) => sum + (user.skills[s]?.xp || 0), 0);
        const hpXp = Math.max(1154, Math.floor(combatXp / 3));
        user.skills['Hitpoints'] = { xp: hpXp, level: xpToLevel(hpXp) };

        return user;
    }

    // FIX 2: Rewrote this entire method. The original version had a fatal logic flaw
    // where it would `return` after the first user, and the username generation logic
    // was broken. This version correctly loops `count` times and handles unique
    // username generation robustly.
    async createNewUsers(count) {
        const payloads = [];
        const usedUsernames = new Set();

        for (let i = 0; i < count; i++) {
            let username;
            let isUnique = false;
            let attempts = 0;

            while (!isUnique && attempts < 10) {
                attempts++;
                let candidateUsername;
                try {
                    // Attempt to get a unique name from the API
                    const response = await fetch('https://random-word-api.herokuapp.com/word', { signal: AbortSignal.timeout(3000) });
                    if (!response.ok) throw new Error('API response not OK');

                    const [word] = await response.json();
                    const baseUsername = word.charAt(0).toUpperCase() + word.slice(1);
                    const suffix = Math.random() < 0.2 ? Math.floor(Math.random() * 999) : '';
                    candidateUsername = baseUsername + suffix;

                } catch (error) {
                    console.warn(`Failed to fetch random word (attempt ${attempts}):`, error.message);
                    // Fallback to timestamp-based username if API fails
                    const timestamp = Date.now().toString(36) + Math.random().toString(36).substring(2, 5);
                    candidateUsername = `User_${timestamp}`;
                }

                // Check for uniqueness after generating a candidate username
                if (candidateUsername && !usedUsernames.has(candidateUsername.toLowerCase())) {
                    if (!(await this.kv.getUser(candidateUsername))) {
                        username = candidateUsername; // Confirm username
                        usedUsernames.add(username.toLowerCase());
                        isUnique = true;
                    }
                }
            } // end while

            // If a unique username was found, generate the user data
            if (isUnique && username) {
                const userData = await this.generateNewUser(username);
                const payload = { username, data: userData };

                if (this.kv.hasRestApi) {
                    payload.metadata = {
                        created: new Date().toISOString(),
                        source: 'auto_generated',
                        archetype: userData.archetype
                    };
                }
                payloads.push(payload);
            } else {
                console.warn(`Could not generate a unique username after ${attempts} attempts.`);
            }
        } // end for

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

        if (Math.abs(userKeys.length - cronState.totalUsers) > 50) {
            startIndex = 0;
        }

        const usersToProcess = Math.min(config.MAX_USERS_PER_SCHEDULED_RUN, userKeys.length);
        const selectedUserKeys = Array.from({ length: usersToProcess }, (_, i) => userKeys[(startIndex + i) % userKeys.length]);

        const users = (await Promise.all(selectedUserKeys.map(key => this.kv.getUser(key.name)))).filter(Boolean);

        const worldEvent = await this.kv.getWorldEvent();

        // FIX 4: Added 'await' because processUserUpdates is now an async function.
        const updatePayloads = await this.processUserUpdates(users, worldEvent);
        const newUserCount = Math.random() < 0.2 ? 4 : 0;
        const newUserPayloads = await this.createNewUsers(newUserCount);

        const allPayloads = [...updatePayloads, ...newUserPayloads];
        if (allPayloads.length > 0) {
            await this.saveBatchUpdatesOptimized(allPayloads);
        }

        const leaderboards = await this.kv.getLeaderboards();
        const now = new Date();
        const lastUpdated = leaderboards.lastUpdated ? new Date(leaderboards.lastUpdated) : null;
        const shouldRegenerate = !lastUpdated || (now.getTime() - lastUpdated.getTime()) > config.LEADERBOARD_CACHE_TTL_MINUTES * 60 * 1000;

        if (shouldRegenerate) {
            console.log("Regenerating leaderboards...");
            await this.regenerateLeaderboardsEfficiently();
        }

        await this.kv.setCronState({
            lastProcessedIndex: (startIndex + usersToProcess) % userKeys.length,
            totalUsers: userKeys.length,
        });

        console.log(`Update complete. Updated: ${updatePayloads.length}, Created: ${newUserPayloads.length}, Leaderboards: ${shouldRegenerate ? ' regenerated' : 'fresh'}`);
    }

    // FIX 3: Made this method 'async' to handle the 'await' for getAvatarConfig.
    async processUserUpdates(users, worldEvent) {
        const updatePayloads = [];
        for (const user of users) {
            let hasChanges = false;

            if (!user.archetype) {
                user.archetype = this.getPlayerArchetype();
                hasChanges = true;
            }

            if (!user.avatar) {
                // FIX 3: Added 'await' here. Otherwise, user.avatar would be a Promise, not the config object.
                user.avatar = await this.avatarService.getAvatarConfig(user.username);
                hasChanges = true;
            }

            if (user.status === 'burnout') {
                if (Math.random() < 0.2) {
                    user.status = 'active';
                    user.archetype = 'CASUAL';
                    hasChanges = true;
                }
            } else if (user.archetype === 'ELITE' || user.archetype === 'LEGEND') {
                if (Math.random() < 0.02) {
                    user.status = 'burnout';
                    hasChanges = true;
                }
            }

            config.SKILLS.forEach(skillName => {
                if (skillName === 'Hitpoints') return;
                const skill = user.skills[skillName];
                const xpGained = this.generateWeightedXpGain(user.archetype, skillName, skill.level, worldEvent);
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

        const rawGain = Math.floor(
            baseXp * efficiency * weight * levelScaling * config.GLOBAL_XP_MULTIPLIER * weekendBoost
        );

        return Math.floor(rawGain * 0.1);
    }

    updateHitpoints(user) {
        const combatXp = config.NON_HP_COMBAT_SKILLS.reduce((sum, s) => sum + (user.skills[s]?.xp || 0), 0);
        const minHpXp = this.levelToXp(10);
        const newHpXp = Math.min(200000000, Math.max(minHpXp, Math.floor(combatXp / 3)));
        const currHp = user.skills['Hitpoints'] || { xp: 0 };
        if (currHp.xp !== newHpXp) {
            user.skills['Hitpoints'] = {
                xp: newHpXp,
                level: xpToLevel(newHpXp)
            };
            return true;
        }
        return false;
    }

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
            return;
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

        for await (const userBatch of this.kv.streamAllUsers(50)) {
            userBatch.forEach(user => {
                const totals = this.calculateUserTotals(user);
                totalLevelData.push({ username: user.username, ...totals });

                config.SKILLS.forEach(skillName => {
                    const skill = user.skills?.[skillName];
                    if (skill) {
                        skillRankings[skillName].push({ username: user.username, ...skill });
                    }
                });
            });
        }

        const totalLevelLeaderboard = totalLevelData
            .sort((a, b) => b.totalLevel - a.totalLevel || b.totalXp - a.totalXp)
            .map((p, i) => ({ ...p, rank: i + 1 }));

        Object.keys(skillRankings).forEach(skillName => {
            skillRankings[skillName]
                .sort((a, b) => b.level - a.level || b.xp - a.xp)
                .forEach((p, i) => p.rank = i + 1);
        });

        const leaderboardData = {
            totalLevel: totalLevelLeaderboard,
            skills: skillRankings,
            lastUpdated: new Date().toISOString(),
        };

        if (this.kv.hasRestApi) {
            await this.kv.setLeaderboardsWithTTL(leaderboardData, config.REST_API_CONFIG.LEADERBOARD_TTL_SECONDS);
        } else {
            await this.kv.setLeaderboards(leaderboardData);
        }
    }

    async saveBatchUpdatesOptimized(updatePayloads) {
        return this.kv.saveBatchUpdates(updatePayloads);
    }

    // --- Migration Methods ---
    // FIX 5: Removed duplicated method definitions and orphaned comments from this section.
    /**
     * Migrates all existing users to use the new hitpoints calculation formula.
     * This method is idempotent; users already migrated will not be changed.
     */
    async migrateAllUsersHitpoints() {
        console.log('Starting hitpoints migration for all users...');

        let totalProcessed = 0;
        let totalMigrated = 0;
        const batchSize = 50;
        const migrationPayloads = [];

        for await (const userBatch of this.kv.streamAllUsers(batchSize)) {
            for (const user of userBatch) {
                totalProcessed++;

                const oldHpXp = user.skills['Hitpoints']?.xp || 0;
                const oldHpLevel = user.skills['Hitpoints']?.level || 10;

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

                if (migrationPayloads.length >= 25) {
                    await this.saveBatchUpdatesOptimized(migrationPayloads);
                    migrationPayloads.length = 0;
                }
            }
        }

        if (migrationPayloads.length > 0) {
            await this.saveBatchUpdatesOptimized(migrationPayloads);
        }

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
     */
    checkUserHitpointsMigration(user) {
        const currentHpXp = user.skills['Hitpoints']?.xp || 0;
        const combatXp = config.NON_HP_COMBAT_SKILLS.reduce((sum, s) => sum + (user.skills[s]?.xp || 0), 0);
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
