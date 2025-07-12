// src/services/avatar.service.js

/**
 * Service for generating persistent avatars using DiceBear API
 */
export class AvatarService {
    constructor() {
        // Available avatar styles from DiceBear that work well for gaming
        this.avatarStyles = [
            'adventurer',      // Fantasy/RPG style
            'adventurer-neutral', // Gender-neutral fantasy
            'avataaars',       // Popular cartoon style
            'big-ears',        // Cute cartoon style
            'bottts',          // Robot style (for fun variety)
            'fun-emoji',       // Emoji style
            'lorelei',         // Modern cartoon
            'micah',           // Simple geometric
            'miniavs',         // Minimal style
            'personas',        // Professional looking
            'pixel-art',       // Retro pixel art (perfect for OSRS!)
        ];
        
        // Default to pixel-art for that OSRS retro feel
        this.defaultStyle = 'pixel-art';
        
        // Backup styles if primary fails
        this.fallbackStyles = ['adventurer', 'avataaars', 'bottts'];
    }

    /**
     * Generates a deterministic hash from a string to select style
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
     * Selects a consistent avatar style based on username
     */
    getAvatarStyle(username) {
        // Use username to deterministically pick a style
        const hash = this.hashString(username);
        const styleIndex = hash % this.avatarStyles.length;
        return this.avatarStyles[styleIndex];
    }

    /**
     * Generates avatar URLs for a user with multiple fallback options
     */
    generateAvatarUrls(username, size = 64) {
        const seed = encodeURIComponent(username);
        const primaryStyle = this.getAvatarStyle(username);
        
        const urls = [];
        
        // Primary URL with selected style
        urls.push(`https://api.dicebear.com/7.x/${primaryStyle}/svg?seed=${seed}&size=${size}`);
        
        // Fallback URLs with different styles
        this.fallbackStyles.forEach(style => {
            if (style !== primaryStyle) {
                urls.push(`https://api.dicebear.com/7.x/${style}/svg?seed=${seed}&size=${size}`);
            }
        });
        
        // Ultimate fallback with initials style
        urls.push(`https://api.dicebear.com/7.x/initials/svg?seed=${seed}&size=${size}`);
        
        return urls;
    }

    /**
     * Gets the primary avatar URL for a user
     */
    getAvatarUrl(username, size = 64) {
        const urls = this.generateAvatarUrls(username, size);
        return urls[0]; // Return primary URL
    }

    /**
     * Gets avatar configuration including fallback URLs
     */
    getAvatarConfig(username) {
        const urls = this.generateAvatarUrls(username);
        
        return {
            username,
            primaryUrl: urls[0],
            fallbackUrls: urls.slice(1),
            style: this.getAvatarStyle(username),
            service: 'dicebear'
        };
    }

    /**
     * Generates a complete avatar configuration for a user (legacy compatibility)
     */
    generateAvatarConfig(username) {
        return this.getAvatarConfig(username);
    }

    /**
     * Gets avatar URL - main method used by frontend
     */
    generateAvatarDataURL(username) {
        return this.getAvatarUrl(username);
    }
}
