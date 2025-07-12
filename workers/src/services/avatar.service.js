// src/services/avatar.service.js

/**
 * Service for generating deterministic OSRS-style avatars based on usernames
 */
export class AvatarService {
    constructor() {
        // OSRS character customization options
        this.skinTones = [
            '#FDBCB4', // Light 1
            '#F1C27D', // Light 2 
            '#E0AC69', // Medium 1
            '#C68642', // Medium 2
            '#8D5524', // Dark 1
            '#68392F', // Dark 2
        ];

        this.hairColors = [
            '#2E1B07', // Black
            '#4A2C17', // Dark Brown
            '#8B4513', // Brown
            '#CD853F', // Light Brown
            '#DAA520', // Blonde
            '#B22222', // Red
            '#708090', // Gray
            '#F5F5DC', // White
        ];

        this.hairStyles = [
            'bald', 'short', 'medium', 'long', 'ponytail', 'mohawk', 'afro', 'buzz'
        ];

        this.eyeColors = [
            '#8B4513', // Brown
            '#4169E1', // Blue
            '#228B22', // Green
            '#708090', // Gray
            '#800080', // Purple
            '#2F4F4F', // Dark Gray
        ];

        this.outfitColors = [
            '#FF0000', // Red
            '#0000FF', // Blue
            '#008000', // Green
            '#800080', // Purple
            '#FFA500', // Orange
            '#FFFF00', // Yellow
            '#FFC0CB', // Pink
            '#A52A2A', // Brown
            '#000000', // Black
            '#FFFFFF', // White
            '#808080', // Gray
            '#00FFFF', // Cyan
        ];

        this.accessories = [
            'none', 'hat', 'helmet', 'crown', 'bandana', 'hood'
        ];
    }

    /**
     * Generates a deterministic hash from a string
     */
    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return Math.abs(hash);
    }

    /**
     * Gets a pseudo-random value based on username and seed
     */
    getSeededRandom(username, seed = 0) {
        const hash = this.hashString(username + seed);
        return hash / 2147483647; // Normalize to 0-1
    }

    /**
     * Selects an item from array based on username and seed
     */
    selectFromArray(username, array, seed = 0) {
        const random = this.getSeededRandom(username, seed);
        const index = Math.floor(random * array.length);
        return array[index];
    }

    /**
     * Generates a complete avatar configuration for a user
     */
    generateAvatarConfig(username) {
        const config = {
            username,
            skinTone: this.selectFromArray(username, this.skinTones, 1),
            hairStyle: this.selectFromArray(username, this.hairStyles, 2),
            hairColor: this.selectFromArray(username, this.hairColors, 3),
            eyeColor: this.selectFromArray(username, this.eyeColors, 4),
            topColor: this.selectFromArray(username, this.outfitColors, 5),
            bottomColor: this.selectFromArray(username, this.outfitColors, 6),
            accessory: this.selectFromArray(username, this.accessories, 7),
            accessoryColor: this.selectFromArray(username, this.outfitColors, 8),
        };

        // Ensure top and bottom colors are different
        if (config.topColor === config.bottomColor) {
            const alternateColors = this.outfitColors.filter(c => c !== config.topColor);
            config.bottomColor = this.selectFromArray(username, alternateColors, 9);
        }

        return config;
    }

    /**
     * Generates an SVG avatar based on the configuration
     */
    generateAvatarSVG(config) {
        const { skinTone, hairStyle, hairColor, eyeColor, topColor, bottomColor, accessory, accessoryColor } = config;

        const size = 64;
        const centerX = size / 2;
        const centerY = size / 2;

        let svgElements = [];

        // Background circle
        svgElements.push(`<circle cx="${centerX}" cy="${centerY}" r="${size / 2}" fill="#2e2518" stroke="#5d4c38" stroke-width="2"/>`);

        // Head (skin)
        svgElements.push(`<circle cx="${centerX}" cy="${centerY - 8}" r="18" fill="${skinTone}" stroke="#000" stroke-width="1"/>`);

        // Eyes
        const eyeY = centerY - 12;
        svgElements.push(`<circle cx="${centerX - 6}" cy="${eyeY}" r="2" fill="${eyeColor}"/>`);
        svgElements.push(`<circle cx="${centerX + 6}" cy="${eyeY}" r="2" fill="${eyeColor}"/>`);

        // Eye pupils
        svgElements.push(`<circle cx="${centerX - 6}" cy="${eyeY}" r="1" fill="#000"/>`);
        svgElements.push(`<circle cx="${centerX + 6}" cy="${eyeY}" r="1" fill="#000"/>`);

        // Nose (simple line)
        svgElements.push(`<line x1="${centerX}" y1="${centerY - 8}" x2="${centerX}" y2="${centerY - 4}" stroke="#000" stroke-width="0.5"/>`);

        // Mouth
        svgElements.push(`<path d="M ${centerX - 3} ${centerY - 2} Q ${centerX} ${centerY} ${centerX + 3} ${centerY - 2}" stroke="#000" stroke-width="0.5" fill="none"/>`);

        // Hair (if not bald)
        if (hairStyle !== 'bald') {
            this.addHair(svgElements, hairStyle, hairColor, centerX, centerY, size);
        }

        // Body/Torso
        const torsoY = centerY + 12;
        svgElements.push(`<rect x="${centerX - 12}" y="${torsoY}" width="24" height="20" fill="${topColor}" stroke="#000" stroke-width="1"/>`);

        // Arms
        svgElements.push(`<rect x="${centerX - 18}" y="${torsoY + 2}" width="6" height="16" fill="${skinTone}" stroke="#000" stroke-width="1"/>`);
        svgElements.push(`<rect x="${centerX + 12}" y="${torsoY + 2}" width="6" height="16" fill="${skinTone}" stroke="#000" stroke-width="1"/>`);

        // Legs/Pants
        const legsY = centerY + 32;
        svgElements.push(`<rect x="${centerX - 8}" y="${legsY}" width="6" height="16" fill="${bottomColor}" stroke="#000" stroke-width="1"/>`);
        svgElements.push(`<rect x="${centerX + 2}" y="${legsY}" width="6" height="16" fill="${bottomColor}" stroke="#000" stroke-width="1"/>`);

        // Accessories
        if (accessory !== 'none') {
            this.addAccessory(svgElements, accessory, accessoryColor, centerX, centerY);
        }

        return `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
            ${svgElements.join('\n')}
        </svg>`;
    }

    /**
     * Adds hair to the avatar
     */
    addHair(svgElements, hairStyle, hairColor, centerX, centerY, size) {
        const hairY = centerY - 26;

        switch (hairStyle) {
            case 'short':
                svgElements.push(`<ellipse cx="${centerX}" cy="${hairY + 5}" rx="16" ry="8" fill="${hairColor}" stroke="#000" stroke-width="1"/>`);
                break;
            case 'medium':
                svgElements.push(`<ellipse cx="${centerX}" cy="${hairY + 3}" rx="18" ry="12" fill="${hairColor}" stroke="#000" stroke-width="1"/>`);
                break;
            case 'long':
                svgElements.push(`<ellipse cx="${centerX}" cy="${hairY}" rx="20" ry="16" fill="${hairColor}" stroke="#000" stroke-width="1"/>`);
                break;
            case 'ponytail':
                svgElements.push(`<ellipse cx="${centerX}" cy="${hairY + 5}" rx="16" ry="8" fill="${hairColor}" stroke="#000" stroke-width="1"/>`);
                svgElements.push(`<ellipse cx="${centerX + 15}" cy="${centerY - 15}" rx="4" ry="8" fill="${hairColor}" stroke="#000" stroke-width="1"/>`);
                break;
            case 'mohawk':
                svgElements.push(`<rect x="${centerX - 2}" y="${hairY}" width="4" height="20" fill="${hairColor}" stroke="#000" stroke-width="1"/>`);
                break;
            case 'afro':
                svgElements.push(`<circle cx="${centerX}" cy="${hairY + 3}" r="22" fill="${hairColor}" stroke="#000" stroke-width="1"/>`);
                break;
            case 'buzz':
                svgElements.push(`<ellipse cx="${centerX}" cy="${hairY + 8}" rx="14" ry="6" fill="${hairColor}" stroke="#000" stroke-width="1"/>`);
                break;
        }
    }

    /**
     * Adds accessories to the avatar
     */
    addAccessory(svgElements, accessory, accessoryColor, centerX, centerY) {
        const accessoryY = centerY - 26;

        switch (accessory) {
            case 'hat':
                svgElements.push(`<ellipse cx="${centerX}" cy="${accessoryY}" rx="20" ry="8" fill="${accessoryColor}" stroke="#000" stroke-width="1"/>`);
                svgElements.push(`<ellipse cx="${centerX}" cy="${accessoryY - 5}" rx="16" ry="6" fill="${accessoryColor}" stroke="#000" stroke-width="1"/>`);
                break;
            case 'helmet':
                svgElements.push(`<ellipse cx="${centerX}" cy="${centerY - 8}" rx="22" ry="20" fill="${accessoryColor}" stroke="#000" stroke-width="2" fill-opacity="0.8"/>`);
                break;
            case 'crown':
                svgElements.push(`<polygon points="${centerX - 15},${accessoryY + 5} ${centerX - 10},${accessoryY - 5} ${centerX - 5},${accessoryY + 2} ${centerX},${accessoryY - 8} ${centerX + 5},${accessoryY + 2} ${centerX + 10},${accessoryY - 5} ${centerX + 15},${accessoryY + 5}" fill="${accessoryColor}" stroke="#FFD700" stroke-width="1"/>`);
                break;
            case 'bandana':
                svgElements.push(`<polygon points="${centerX - 18},${centerY - 20} ${centerX + 18},${centerY - 20} ${centerX + 15},${centerY - 5} ${centerX - 15},${centerY - 5}" fill="${accessoryColor}" stroke="#000" stroke-width="1"/>`);
                break;
            case 'hood':
                svgElements.push(`<path d="M ${centerX - 20} ${centerY - 20} Q ${centerX} ${centerY - 35} ${centerX + 20} ${centerY - 20} L ${centerX + 18} ${centerY + 5} L ${centerX - 18} ${centerY + 5} Z" fill="${accessoryColor}" stroke="#000" stroke-width="1"/>`);
                break;
        }
    }

    /**
     * Generates a base64 data URL for the avatar
     */
    generateAvatarDataURL(username) {
        const config = this.generateAvatarConfig(username);
        const svg = this.generateAvatarSVG(config);
        const base64 = btoa(svg);
        return `data:image/svg+xml;base64,${base64}`;
    }

    /**
     * Gets just the avatar configuration without generating SVG
     */
    getAvatarConfig(username) {
        return this.generateAvatarConfig(username);
    }
}
