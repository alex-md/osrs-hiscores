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
    getPlayerPlayStyle() {
        const weights = config.calculatePlayStyleWeights();
        const rand = Math.random();
        let cumulative = 0;

        for (const [style, probability] of Object.entries(weights)) {
            cumulative += probability;
            if (rand <= cumulative) return style;
        }
        return 'CASUAL'; // Fallback
    }

    generateNewUser(username) {
        const playStyle = this.getPlayerPlayStyle();
        const user = {
            username,
            playStyle, // Use playStyle instead of activityType for clarity
            activityType: playStyle, // Keep for backward compatibility
            skills: {},
            createdAt: new Date().toISOString()
        };

        const profile = config.PLAYER_PLAY_STYLES[playStyle];
        const talent = 0.75 + Math.random() * 0.75; // Individual talent modifier

        // Generate avatar configuration
        user.avatar = this.avatarService.getAvatarConfig(username);

        // Handle specialist players differently
        if (playStyle === 'SPECIALIST') {
            user.specialistType = config.getSpecialistFocus(username);
            user.specialistSkills = config.SPECIALIST_SKILL_FOCUS[user.specialistType];
        }

        config.SKILLS.forEach(skill => {
            if (skill === 'Hitpoints') return;

            let skillWeight = config.SKILL_POPULARITY_WEIGHTS[skill] || 1.0;
            let skillProbability = profile.skillProbability;

            // Specialist handling - boost focus skills, reduce others
            if (playStyle === 'SPECIALIST' && user.specialistSkills) {
                if (user.specialistSkills.includes(skill)) {
                    skillWeight *= 3.0; // 3x weight for specialist skills
                    skillProbability = 0.95; // Almost always train specialist skills
                } else {
                    skillWeight *= 0.3; // Reduce non-specialist skills
                    skillProbability *= 0.2; // Much lower chance to train
                }
            }

            const xp = Math.random() < skillProbability
                ? Math.floor(Math.random() * (profile.xpRange.max * skillWeight * talent - profile.xpRange.min * skillWeight) + profile.xpRange.min * skillWeight)
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
                        playStyle: userData.playStyle,
                        specialistType: userData.specialistType || null
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
            let hasChanges = false;

            // Ensure user has a persistent play style (migrate old users)
            if (!user.playStyle && user.activityType) {
                user.playStyle = user.activityType; // Migrate old format
                hasChanges = true;
            } else if (!user.playStyle) {
                user.playStyle = this.getPlayerPlayStyle(); // Assign new play style
                user.activityType = user.playStyle; // Keep for compatibility
                hasChanges = true;
            }

            // Ensure specialist users have their focus defined
            if (user.playStyle === 'SPECIALIST' && !user.specialistType) {
                user.specialistType = config.getSpecialistFocus(user.username);
                user.specialistSkills = config.SPECIALIST_SKILL_FOCUS[user.specialistType];
                hasChanges = true;
            }

            // Ensure user has avatar configuration
            if (!user.avatar) {
                user.avatar = this.avatarService.getAvatarConfig(user.username);
                hasChanges = true;
            }

            // Add creation timestamp if missing
            if (!user.createdAt) {
                user.createdAt = new Date().toISOString();
                hasChanges = true;
            }

            config.SKILLS.forEach(skillName => {
                if (skillName === 'Hitpoints') return;
                const skill = user.skills[skillName];
                const xpGained = this.generateWeightedXpGain(user.playStyle, skillName, skill.level, user);
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

    generateWeightedXpGain(playStyle, skillName, currentLevel = 1, user = null) {
        const activity = config.PLAYER_PLAY_STYLES[playStyle];
        let skillWeight = config.SKILL_POPULARITY_WEIGHTS[skillName] || 1.0;
        let skillProbability = activity.skillProbability;

        // Handle specialists - they focus heavily on their chosen skills
        if (playStyle === 'SPECIALIST' && user && user.specialistSkills) {
            if (user.specialistSkills.includes(skillName)) {
                skillWeight *= 2.5; // 2.5x weight for specialist skills
                skillProbability = Math.min(0.98, skillProbability * 2.5); // Much higher chance
            } else {
                skillWeight *= 0.4; // Reduce non-specialist skills
                skillProbability *= 0.3; // Much lower chance to train
            }
        }

        if (Math.random() > skillProbability * skillWeight) return 0;

        const efficiency = 0.6 + Math.random() * 0.8;
        const baseXp = Math.floor(Math.random() * (activity.xpRange.max - activity.xpRange.min + 1) + activity.xpRange.min);
        const levelScaling = 1 + (currentLevel / 99) * config.LEVEL_SCALING_FACTOR;
        const weekendBoost = config.WEEKEND_DAYS.includes(new Date().getUTCDay()) ? config.WEEKEND_BONUS_MULTIPLIER : 1;

        return Math.floor(baseXp * efficiency * skillWeight * levelScaling * config.GLOBAL_XP_MULTIPLIER * weekendBoost);
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

    // Debug method to analyze play style distribution
    async getPlayStyleDistribution() {
        const users = await this.getAllUsersOptimized(1000); // Sample first 1000 users
        const distribution = {};
        const specialistTypes = {};

        users.forEach(user => {
            const style = user.playStyle || user.activityType || 'UNKNOWN';
            distribution[style] = (distribution[style] || 0) + 1;

            if (style === 'SPECIALIST' && user.specialistType) {
                specialistTypes[user.specialistType] = (specialistTypes[user.specialistType] || 0) + 1;
            }
        });

        return {
            totalUsers: users.length,
            distribution,
            specialistTypes,
            currentWeights: config.calculatePlayStyleWeights()
        };
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
