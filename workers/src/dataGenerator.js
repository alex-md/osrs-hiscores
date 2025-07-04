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
 * Generates a new user object with randomized hiscores for all 23 skills.
 * XP is seeded to be somewhat realistic, favoring lower and mid-levels.
 * @param {string} username - The username for the new player.
 * @returns {object} A user object containing the username and a skills object.
 */
export function generateNewUser(username) {
    const user = {
        username: username,
        skills: {},
    };

    SKILLS.forEach(skill => {
        const randomXp = Math.floor(Math.pow(Math.random(), 2.5) * 14000000);
        user.skills[skill] = {
            xp: randomXp,
            level: xpToLevel(randomXp),
        };
    });

    return user;
}
