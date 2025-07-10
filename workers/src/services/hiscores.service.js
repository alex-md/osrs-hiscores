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
            user.skills[skill] = { xp: Math.max(0, xp), level: xpToLevel(xp) };
        });

        const combatXp = config.COMBAT_SKILLS.reduce((sum, s) => sum + (user.skills[s]?.xp || 0), 0);
        const hpXp = Math.max(1154, Math.floor((combatXp / 4) * 1.3));
        user.skills['Hitpoints'] = { xp: hpXp, level: xpToLevel(hpXp) };
        return user;
    }

    async createNewUsers(count) {
        const payloads = [];
        for (let i = 0; i < count; i++) {
            let username, isUnique = false, attempts = 0;
            while (!isUnique && attempts < 10) {
                const response = await fetch('https://random-word-api.herokuapp.com/word', { signal: AbortSignal.timeout(3000) });
                if (response.ok) {
                    const [word] = await response.json();
                    username = word.charAt(0).toUpperCase() + word.slice(1) + (Math.random() < 0.2 ? Math.floor(Math.random() * 999) : '');
                    if (!(await this.kv.getUser(username))) isUnique = true;
                }
                attempts++;
            }
            if (isUnique) {
                payloads.push({ username, data: this.generateNewUser(username) });
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
            await this.kv.saveBatchUpdates(allPayloads, config.USERS_PER_BATCH, config.BATCH_DELAY_MS);
        }

        // Conditionally regenerate leaderboards
        const leaderboards = await this.kv.getLeaderboards();
        const now = new Date();
        const lastUpdated = leaderboards.lastUpdated ? new Date(leaderboards.lastUpdated) : null;
        const shouldRegenerate = !lastUpdated || (now - lastUpdated) > config.LEADERBOARD_CACHE_TTL_MINUTES * 60 * 1000;

        if (shouldRegenerate) {
            console.log("Regenerating leaderboards...");
            const allUsers = await this.kv.getAllUsers();
            await this.kv.setLeaderboards({
                totalLevel: this.generateTotalLevelLeaderboard(allUsers),
                skills: this.generateAllSkillRankings(allUsers),
                lastUpdated: now.toISOString(),
            });
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
        // Get combat skill levels
        const attack = user.skills['Attack']?.level || 1;
        const strength = user.skills['Strength']?.level || 1;
        const defence = user.skills['Defence']?.level || 1;
        const ranged = user.skills['Ranged']?.level || 1;
        const magic = user.skills['Magic']?.level || 1;
        const prayer = user.skills['Prayer']?.level || 1;

        // Calculate combat level using OSRS formula
        const base = 0.25 * (defence + (user.skills['Hitpoints']?.level || 10) + Math.floor(prayer / 2));
        const melee = 0.325 * (attack + strength);
        const rangedStyle = 0.325 * (Math.floor(ranged / 2) + ranged);
        const magicStyle = 0.325 * (Math.floor(magic / 2) + magic);
        const combatLevel = Math.floor(base + Math.max(melee, rangedStyle, magicStyle));

        // Calculate required Hitpoints level using derived formula:
        // H ≈ 4C - D - floor(P/2) - 1.3K
        // where K = max{A+S, floor(R/2)+R, floor(M/2)+M}
        const K = Math.max(
            attack + strength,
            Math.floor(ranged / 2) + ranged,
            Math.floor(magic / 2) + magic
        );

        const requiredHpLevel = Math.max(10, Math.round(4 * combatLevel - defence - Math.floor(prayer / 2) - 1.3 * K));
        const currentHpLevel = user.skills['Hitpoints']?.level || 10;

        if (currentHpLevel !== requiredHpLevel) {
            // Convert level back to XP (approximate, since we need consistent XP values)
            const newHpXp = this.levelToXp(requiredHpLevel);
            user.skills['Hitpoints'].xp = newHpXp;
            user.skills['Hitpoints'].level = requiredHpLevel;
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
}
