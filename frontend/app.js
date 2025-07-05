// frontend/app.js

document.addEventListener('DOMContentLoaded', () => {
    // Auto-detect API URL based on environment
    // Local development: http://127.0.0.1:8787
    // Production: Replace with your actual worker URL
    const API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'https://osrs-hiscores-clone.vs.workers.dev';
        }
        // TODO: Replace 'your-subdomain' with your actual Cloudflare Workers subdomain
        // Example: https://osrs-hiscores-clone.alex-md.workers.dev
        return 'https://osrs-hiscores-clone.vs.workers.dev';
    })();

    // All 23 OSRS skills in proper order
    const SKILLS = [
        'Attack', 'Strength', 'Defence', 'Ranged', 'Prayer', 'Magic',
        'Runecrafting', 'Construction', 'Hitpoints', 'Agility', 'Herblore',
        'Thieving', 'Crafting', 'Fletching', 'Slayer', 'Hunter',
        'Mining', 'Smithing', 'Fishing', 'Cooking', 'Firemaking',
        'Woodcutting', 'Farming'
    ];

    // DOM Element References
    const mainContent = document.getElementById('main-content');
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const errorMessage = document.getElementById('error-message');
    const homeView = document.getElementById('home-view');
    const leaderboardView = document.getElementById('leaderboard-view');
    const playerView = document.getElementById('player-view');
    const leaderboardBody = document.getElementById('leaderboard-body');
    const searchContainer = document.getElementById('search-container');
    const searchInput = document.getElementById('search-input');
    const searchSuggestions = document.getElementById('search-suggestions');
    const searchClear = document.getElementById('search-clear');
    const themeToggle = document.getElementById('theme-toggle');
    const searchToggle = document.getElementById('search-toggle');
    const retryBtn = document.getElementById('retry-btn');
    const backBtn = document.getElementById('back-btn');
    const refreshLeaderboard = document.getElementById('refresh-leaderboard');
    const refreshPlayer = document.getElementById('refresh-player');
    const startSearch = document.getElementById('start-search');
    const lastUpdated = document.getElementById('last-updated');
    const toastContainer = document.getElementById('toast-container');

    // State management
    let currentView = 'home';
    let currentPlayer = null;
    let searchTimeout = null;
    let cachedUsers = null;

    // =================================================================
    // UTILITY FUNCTIONS
    // =================================================================

    /**
     * Shows a toast notification
     * @param {string} message - The message to display
     * @param {string} type - 'success', 'error', 'warning', or 'info'
     * @param {number} duration - How long to show the toast (ms)
     */
    const showToast = (message, type = 'info', duration = 4000) => {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i data-lucide="${type === 'error' ? 'alert-circle' : type === 'success' ? 'check-circle' : type === 'warning' ? 'alert-triangle' : 'info'}"></i>
                <span>${message}</span>
            </div>
            <button class="toast-close">
                <i data-lucide="x"></i>
            </button>
        `;

        toastContainer.appendChild(toast);
        lucide.createIcons();

        // Auto-remove after duration
        setTimeout(() => {
            toast.remove();
        }, duration);

        // Manual close
        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.remove();
        });
    };

    /**
     * Calculates combat level based on combat stats
     * @param {object} skills - Player skills object
     * @returns {number} Combat level
     */
    const calculateCombatLevel = (skills) => {
        const attack = skills.Attack?.level || 1;
        const strength = skills.Strength?.level || 1;
        const defence = skills.Defence?.level || 1;
        const hitpoints = skills.Hitpoints?.level || 10;
        const prayer = skills.Prayer?.level || 1;
        const ranged = skills.Ranged?.level || 1;
        const magic = skills.Magic?.level || 1;

        const base = 0.25 * (defence + hitpoints + Math.floor(prayer / 2));
        const melee = 0.325 * (attack + strength);
        const range = 0.325 * (Math.floor(ranged / 2) + ranged);
        const mage = 0.325 * (Math.floor(magic / 2) + magic);

        return Math.floor(base + Math.max(melee, range, mage));
    };

    /**
     * Formats large numbers with appropriate suffixes
     * @param {number} num - The number to format
     * @returns {string} Formatted number
     */
    const formatNumber = (num) => {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        } else if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toLocaleString();
    };

    /**
     * Debounced function wrapper
     * @param {Function} func - Function to debounce
     * @param {number} delay - Delay in milliseconds
     * @returns {Function} Debounced function
     */
    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    };

    // =================================================================
    // VIEW MANAGEMENT
    // =================================================================

    /**
     * Hides all views and shows the specified one
     * @param {string} viewName - 'loading', 'error', 'home', 'leaderboard', 'player'
     */
    const showView = (viewName) => {
        // Hide all views
        loadingState.style.display = 'none';
        errorState.style.display = 'none';
        homeView.style.display = 'none';
        leaderboardView.style.display = 'none';
        playerView.style.display = 'none';

        // Show the requested view
        currentView = viewName;
        switch (viewName) {
            case 'loading':
                loadingState.style.display = 'block';
                break;
            case 'error':
                errorState.style.display = 'block';
                break;
            case 'home':
                homeView.style.display = 'block';
                break;
            case 'leaderboard':
                leaderboardView.style.display = 'block';
                break;
            case 'player':
                playerView.style.display = 'block';
                break;
        }
    };

    /**
     * Simple router based on URL hash
     */
    const handleRouteChange = () => {
        const hash = window.location.hash.substring(1);
        if (hash) {
            const username = decodeURIComponent(hash);
            fetchUserStats(username);
        } else {
            if (cachedUsers && cachedUsers.length > 0) {
                showView('leaderboard');
            } else {
                fetchLeaderboard();
            }
        }
    };

    // =================================================================
    // API FUNCTIONS
    // =================================================================

    /**
     * Fetches all users for search suggestions and caching
     */
    const fetchAllUsers = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/users`);
            if (!response.ok) {
                throw new Error(`Failed to fetch users: ${response.statusText}`);
            }
            const users = await response.json();
            cachedUsers = users;
            return users;
        } catch (error) {
            console.error('Error fetching users:', error);
            return [];
        }
    };

    /**
     * Fetches and displays the leaderboard
     */
    const fetchLeaderboard = async () => {
        showView('loading');
        try {
            const response = await fetch(`${API_BASE_URL}/api/leaderboard`);
            if (!response.ok) {
                throw new Error(`Failed to fetch leaderboard: ${response.statusText}`);
            }
            const leaderboardData = await response.json();
            renderLeaderboard(leaderboardData);
            showView('leaderboard');

            // Cache users for search
            if (!cachedUsers) {
                fetchAllUsers();
            }
        } catch (error) {
            console.error('Error fetching leaderboard:', error);
            errorMessage.textContent = `Error loading leaderboard: ${error.message}`;
            showView('error');
            showToast('Failed to load leaderboard', 'error');
        }
    };

    /**
     * Fetches and displays a specific user's stats
     * @param {string} username - The username to fetch
     */
    const fetchUserStats = async (username) => {
        showView('loading');
        try {
            const response = await fetch(`${API_BASE_URL}/api/users/${encodeURIComponent(username)}`);
            if (!response.ok) {
                if (response.status === 404) {
                    throw new Error(`Player "${username}" not found`);
                }
                throw new Error(`Failed to fetch user data: ${response.statusText}`);
            }
            const userData = await response.json();
            currentPlayer = userData;
            renderUserDetail(userData);
            showView('player');
        } catch (error) {
            console.error('Error fetching user stats:', error);
            errorMessage.textContent = `Error loading player data: ${error.message}`;
            showView('error');
            showToast(`Failed to load player: ${username}`, 'error');
        }
    };

    // =================================================================
    // RENDERING FUNCTIONS
    // =================================================================

    /**
     * Renders the leaderboard table
     * @param {Array} data - Array of player objects
     */
    const renderLeaderboard = (data) => {
        leaderboardBody.innerHTML = '';

        if (!data || data.length === 0) {
            leaderboardBody.innerHTML = `
                <tr>
                    <td colspan="4" class="px-4 py-8 text-center text-slate-400">
                        <div class="flex flex-col items-center">
                            <i data-lucide="users" class="w-12 h-12 mb-4 text-slate-500"></i>
                            <p class="text-lg">No players found on the hiscores</p>
                        </div>
                    </td>
                </tr>
            `;
            return;
        }

        data.forEach((player, index) => {
            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-700/30 transition-colors duration-200';

            // Style for top 3 ranks
            let rankClass = '';
            if (index === 0) rankClass = 'rank-gold';
            else if (index === 1) rankClass = 'rank-silver';
            else if (index === 2) rankClass = 'rank-bronze';

            row.innerHTML = `
                <td class="px-4 py-3">
                    <span class="text-white font-medium ${rankClass}">${player.rank || index + 1}</span>
                </td>
                <td class="px-4 py-3">
                    <button class="player-link text-left hover:text-amber-400 transition-colors duration-200" data-username="${player.username}">
                        <span class="text-white font-medium">${player.username}</span>
                    </button>
                </td>
                <td class="px-4 py-3">
                    <span class="text-white">${player.totalLevel.toLocaleString()}</span>
                </td>
                <td class="px-4 py-3">
                    <span class="text-white">${player.totalXp.toLocaleString()}</span>
                </td>
            `;
            leaderboardBody.appendChild(row);
        });

        // Add click handlers for player links
        document.querySelectorAll('.player-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const username = link.dataset.username;
                window.location.hash = encodeURIComponent(username);
            });
        });

        lucide.createIcons();
    };

    /**
     * Renders the detailed user stats view
     * @param {object} user - User data object
     */
    const renderUserDetail = (user) => {
        // Update player info
        document.getElementById('player-name').textContent = user.username;

        // Calculate totals
        const totalLevel = Object.values(user.skills).reduce((sum, skill) => sum + skill.level, 0);
        const totalXp = Object.values(user.skills).reduce((sum, skill) => sum + skill.xp, 0);
        const combatLevel = calculateCombatLevel(user.skills);

        // Update summary stats
        document.getElementById('total-level').textContent = totalLevel.toLocaleString();
        document.getElementById('total-xp').textContent = formatNumber(totalXp);
        document.getElementById('combat-level').textContent = combatLevel;

        // Render skills table
        const skillsTableBody = document.getElementById('skills-table-body');
        skillsTableBody.innerHTML = '';

        SKILLS.forEach((skillName, index) => {
            const skill = user.skills[skillName];
            if (!skill) return;

            const row = document.createElement('tr');
            row.className = 'hover:bg-slate-700/20 transition-colors duration-200';

            // Generate a realistic rank based on skill level and XP
            // Higher level/XP = better (lower) rank
            const maxLevel = 99;
            const maxXp = 13034431; // XP for level 99
            const normalizedScore = (skill.level / maxLevel) * 0.7 + (skill.xp / maxXp) * 0.3;
            const baseRank = Math.floor((1 - normalizedScore) * 500000) + Math.floor(Math.random() * 10000) + 1;
            const displayRank = Math.min(baseRank, 2000000); // Cap at 2M for realism

            row.innerHTML = `
                <td class="px-4 py-3">
                    <div class="flex items-center">
                        <div class="w-6 h-6 mr-3 flex items-center justify-center">
                            <i data-lucide="${getSkillIcon(skillName)}" class="w-4 h-4 text-amber-400"></i>
                        </div>
                        <span class="text-white font-medium">${skillName}</span>
                    </div>
                </td>
                <td class="px-4 py-3">
                    <span class="text-slate-300">${displayRank.toLocaleString()}</span>
                </td>
                <td class="px-4 py-3">
                    <span class="text-white font-medium">${skill.level}</span>
                </td>
                <td class="px-4 py-3">
                    <span class="text-white">${skill.xp.toLocaleString()}</span>
                </td>
            `;
            skillsTableBody.appendChild(row);
        });

        lucide.createIcons();
    };

    /**
     * Gets the appropriate icon for a skill
     * @param {string} skillName - Name of the skill
     * @returns {string} Icon name
     */
    const getSkillIcon = (skillName) => {
        const iconMap = {
            'Attack': 'sword',
            'Strength': 'dumbbell',
            'Defence': 'shield',
            'Ranged': 'bow-arrow',
            'Prayer': 'church',
            'Magic': 'sparkles',
            'Runecrafting': 'zap',
            'Construction': 'hammer',
            'Hitpoints': 'heart',
            'Agility': 'wind',
            'Herblore': 'flask-conical',
            'Thieving': 'key',
            'Crafting': 'scissors',
            'Fletching': 'target',
            'Slayer': 'skull',
            'Hunter': 'crosshair',
            'Mining': 'pickaxe',
            'Smithing': 'anvil',
            'Fishing': 'fish',
            'Cooking': 'chef-hat',
            'Firemaking': 'flame',
            'Woodcutting': 'axe',
            'Farming': 'sprout',
        };
        return iconMap[skillName] || 'circle';
    };

    // =================================================================
    // SEARCH FUNCTIONALITY
    // =================================================================

    /**
     * Handles search input and suggestions
     */
    const handleSearch = debounce(async (query) => {
        if (!query.trim()) {
            searchSuggestions.innerHTML = '';
            return;
        }

        // Get users if not cached
        if (!cachedUsers) {
            await fetchAllUsers();
        }

        // Filter users based on query
        const filteredUsers = cachedUsers.filter(user =>
            user.username.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 5);

        // Render suggestions
        searchSuggestions.innerHTML = '';
        if (filteredUsers.length > 0) {
            filteredUsers.forEach(user => {
                const suggestion = document.createElement('div');
                suggestion.className = 'search-suggestion';
                suggestion.innerHTML = `
                    <div class="suggestion-content">
                        <i data-lucide="user"></i>
                        <span class="suggestion-name">${user.username}</span>
                        <span class="suggestion-level">Level ${Object.values(user.skills).reduce((sum, skill) => sum + skill.level, 0)}</span>
                    </div>
                `;
                suggestion.addEventListener('click', () => {
                    searchInput.value = user.username;
                    window.location.hash = encodeURIComponent(user.username);
                    hideSearch();
                });
                searchSuggestions.appendChild(suggestion);
            });
            lucide.createIcons();
        } else {
            searchSuggestions.innerHTML = '<div class="no-suggestions">No players found</div>';
        }
    }, 300);

    /**
     * Shows the search interface
     */
    const showSearch = () => {
        searchContainer.classList.add('active');
        searchInput.focus();
    };

    /**
     * Hides the search interface
     */
    const hideSearch = () => {
        searchContainer.classList.remove('active');
        searchInput.value = '';
        searchSuggestions.innerHTML = '';
    };

    // =================================================================
    // THEME MANAGEMENT
    // =================================================================

    /**
     * Toggles between light and dark themes
     */
    const toggleTheme = () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);

        showToast(`Switched to ${newTheme} theme`, 'success', 2000);
    };

    // =================================================================
    // EVENT LISTENERS
    // =================================================================

    // Theme toggle
    themeToggle?.addEventListener('click', toggleTheme);

    // Search toggle
    searchToggle?.addEventListener('click', showSearch);

    // Search input
    searchInput?.addEventListener('input', (e) => {
        handleSearch(e.target.value);
    });

    // Search clear
    searchClear?.addEventListener('click', () => {
        searchInput.value = '';
        searchSuggestions.innerHTML = '';
    });

    // Search on enter
    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (query) {
                window.location.hash = encodeURIComponent(query);
                hideSearch();
            }
        } else if (e.key === 'Escape') {
            hideSearch();
        }
    });

    // Close search when clicking outside
    document.addEventListener('click', (e) => {
        if (!searchContainer.contains(e.target) && !searchToggle.contains(e.target)) {
            hideSearch();
        }
    });

    // Back button
    backBtn?.addEventListener('click', () => {
        window.location.hash = '';
    });

    // Retry button
    retryBtn?.addEventListener('click', () => {
        if (currentPlayer) {
            fetchUserStats(currentPlayer.username);
        } else {
            fetchLeaderboard();
        }
    });

    // Refresh buttons
    refreshLeaderboard?.addEventListener('click', fetchLeaderboard);
    refreshPlayer?.addEventListener('click', () => {
        if (currentPlayer) {
            fetchUserStats(currentPlayer.username);
        }
    });

    // Start search button
    startSearch?.addEventListener('click', showSearch);

    // Hash change listener for routing
    window.addEventListener('hashchange', handleRouteChange);

    // =================================================================
    // INITIALIZATION
    // =================================================================

    /**
     * Updates the last updated timestamp
     */
    const updateLastUpdated = () => {
        const now = new Date();
        const timeString = now.toLocaleTimeString();
        if (lastUpdated) {
            lastUpdated.textContent = timeString;
        }
    };

    /**
     * Initializes the application
     */
    const init = async () => {
        // Show initial view
        showView('home');

        // Update timestamp
        updateLastUpdated();

        // Check if there's a hash in URL
        handleRouteChange();

        // Fetch users for search
        await fetchAllUsers();


    };

    // Start the application
    init();
});
