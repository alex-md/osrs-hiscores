// osrs-hiscores-clone/workers/src/dataGenerator.js

/**
 * List of all 23 skills in Old School RuneScape.
 */
export const SKILLS = [
    'Attack', 'Strength', 'Defence', 'Ranged', 'Prayer', 'Magic',
    'Runecrafting', 'Construction', 'Hitpoints', 'Agility', 'Herblore',
    'Thieving', 'Crafting', 'Fletching', 'Slayer', 'Hunter',
    'Mining', 'Smithing', 'Fishing', 'Cooking', 'Firemaking',
    'Woodcutting', 'Farming'
];

// --- NEW: Username generation components ---
const ADJECTIVES = [
    'Brisk', 'Luminous', 'Gritty', 'Mellow', 'Jagged', 'Sleek', 'Timid', 'Radiant',
    'Murky', 'Zesty', 'Brittle', 'Plush', 'Gaudy', 'Nimble', 'Rustic', 'Feeble',
    'Vibrant', 'Hasty', 'Serene', 'Grimy', 'Quirky', 'Blunt', 'Lavish', 'Eerie',
    'Crisp', 'Fuzzy', 'Dainty', 'Rugged', 'Glossy', 'Mellow'
];

const NOUNS = [
    'Lantern', 'Canyon', 'Whisper', 'Glacier', 'Compass', 'Meadow', 'Relic', 'Ember',
    'Turret', 'Prism', 'Orchard', 'Talon', 'Scroll', 'Anchor', 'Forge', 'Ripple',
    'Beacon', 'Thicket', 'Vault', 'Spindle', 'Chalice', 'Gust', 'Tapestry', 'Quarry',
    'Bramble', 'Silo', 'Perch', 'Rune', 'Vessel', 'Grove'
];


/**
 * Generates a random, OSRS-style username.
 * Note: This does not guarantee uniqueness on its own. The caller must verify.
 * @returns {string} A randomly generated username.
 */
export function generateRandomUsername() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    const num = Math.floor(Math.random() * 999) + 1;
    return `${adj}_${noun}_${num}`;
}
// --- END NEW ---

/**
 * Calculates the OSRS level for a given amount of XP.
 * The formula is a standard, well-known progression.
 * @param {number} xp - The total experience points in a skill.
 * @returns {number} The calculated level (1-99).
 */
export function xpToLevel(xp) {
    if (xp < 0) return 1;
    let points = 0;
    let output = 0;
    for (let lvl = 1; lvl <= 99; lvl++) {
        points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
        output = Math.floor(points / 4);
        if (output > xp) {
            return lvl;
        }
    }
    return 99;
}

/**
 * Calculates the XP required for a given level using the OSRS formula.
 * Formula: (1/8)(lvl)((lvl)-1) + (75*(2^(((lvl)-1)/7)-1)/(1-2^(-1/7))) + ((lvl)*-0.109)
 * @param {number} level - The level to calculate XP for (1-99).
 * @returns {number} The XP required for that level.
 */
export function levelToXp(level) {
    if (level <= 1) return 0;

    const part1 = (1 / 8) * level * (level - 1);
    const part2 = (75 * (Math.pow(2, (level - 1) / 7) - 1)) / (1 - Math.pow(2, -1 / 7));
    const part3 = level * -0.109;

    return Math.floor(part1 + part2 + part3);
}

/**
 * Generates a new user object with randomized hiscores for all 23 skills.
 * XP is seeded to be somewhat realistic, favoring lower and mid-levels.
 * Hitpoints is calculated based on combat skills (Attack, Strength, Defence, Ranged).
 * @param {string} username - The username for the new player.
 * @returns {object} A user object containing the username and a skills object.
 */
export function generateNewUser(username) {
    const user = {
        username: username,
        skills: {},
    };

    // Generate random XP for all skills except Hitpoints (1-15000 XP per skill)
    SKILLS.forEach(skill => {
        if (skill !== 'Hitpoints') {
            const randomXp = Math.floor(Math.random() * 14999) + 1; // 1 to 15000 XP
            user.skills[skill] = {
                xp: randomXp,
                level: xpToLevel(randomXp),
            };
        }
    });

    // Calculate Hitpoints based on combat skills
    const combatSkills = ['Attack', 'Strength', 'Defence', 'Ranged'];
    const totalCombatXp = combatSkills.reduce((sum, skill) => {
        return sum + user.skills[skill].xp;
    }, 0);

    // Formula: Take total combat XP, divide by 4, multiply by 1.3
    const hitpointsXp = Math.floor((totalCombatXp / 4) * 1.3);

    user.skills['Hitpoints'] = {
        xp: hitpointsXp,
        level: xpToLevel(hitpointsXp),
    };

    return user;
}

/**
 * Updates the Hitpoints skill for an existing user based on their combat skills.
 * Formula: Take total combat XP (Attack, Strength, Defence, Ranged), divide by 4, multiply by 1.3
 * @param {object} user - The user object to update.
 * @returns {boolean} True if Hitpoints was updated, false otherwise.
 */
export function updateHitpointsForUser(user) {
    if (!user || !user.skills) return false;

    const combatSkills = ['Attack', 'Strength', 'Defence', 'Ranged'];
    const totalCombatXp = combatSkills.reduce((sum, skill) => {
        return sum + (user.skills[skill]?.xp || 0);
    }, 0);

    // Formula: Take total combat XP, divide by 4, multiply by 1.3
    const newHitpointsXp = Math.floor((totalCombatXp / 4) * 1.3);

    // Only update if the new XP is different from current
    if (user.skills['Hitpoints'] && user.skills['Hitpoints'].xp !== newHitpointsXp) {
        user.skills['Hitpoints'].xp = newHitpointsXp;
        user.skills['Hitpoints'].level = xpToLevel(newHitpointsXp);
        return true;
    }

    return false;
}
