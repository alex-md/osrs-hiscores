// frontend/app.js

document.addEventListener('DOMContentLoaded', () => {
    const ITEMS_PER_PAGE = 25;
    let currentPage = 1;
    let cachedLeaderboardData = [];
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

    // All 23 OSRS skills in proper order - fetched from API to avoid duplication
    let SKILLS = [
        'Attack', 'Strength', 'Defence', 'Ranged', 'Prayer', 'Magic',
        'Runecrafting', 'Construction', 'Hitpoints', 'Agility', 'Herblore',
        'Thieving', 'Crafting', 'Fletching', 'Slayer', 'Hunter',
        'Mining', 'Smithing', 'Fishing', 'Cooking', 'Firemaking',
        'Woodcutting', 'Farming'
    ];

    /**
     * Fetches skills from API to sync with backend
     */
    const fetchSkills = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/skills`);
            if (response.ok) {
                const data = await response.json();
                SKILLS = data.skills;
            }
        } catch (error) {
            console.warn('Failed to fetch skills from API, using fallback:', error);
        }
    };

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
    const logoBtn = document.getElementById('logo-btn');
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
    let cachedRankings = null;

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
    // DOM & UI HELPER FUNCTIONS
    // =================================================================

    /**
     * Handles API errors by displaying a generic error view and a toast.
     * @param {Error} error - The caught error object.
     * @param {string} logMessage - Message for console.error.
     * @param {string} displayMessage - Message for the error view.
     * @param {string} toastMessage - Message for the toast notification.
     */
    const handleApiError = (error, logMessage, displayMessage, toastMessage) => {
        console.error(logMessage, error);
        errorMessage.textContent = `${displayMessage}: ${error.message}`;
        showView('error');
        showToast(toastMessage, 'error');
    };

    /**
     * Creates a table row element for the user skills table.
     * @param {object} data - The data for the row.
     * @param {string} data.icon - Lucide icon name.
     * @param {string} data.name - Skill or 'Overall' name.
     * @param {string|number} data.rank - The player's rank (pre-formatted).
     * @param {number} data.level - The player's level.
     * @param {number} data.xp - The player's experience points.
     * @param {boolean} [data.isOverall=false] - Whether this is the 'Overall' row.
     * @returns {HTMLTableRowElement} The created table row.
     */
    const createSkillRow = ({ icon, name, rank, level, xp, isOverall = false }) => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-700/20 transition-colors duration-200';

        if (isOverall) {
            row.classList.add('border-b', 'border-slate-600/50');
            row.innerHTML = `
                <td class="px-4 py-3">
                    <div class="flex items-center">
                        <div class="w-6 h-6 mr-3 flex items-center justify-center">
                            <i data-lucide="${icon}" class="w-4 h-4 text-amber-400"></i>
                        </div>
                        <span class="text-white font-bold">${name}</span>
                    </div>
                </td>
                <td class="px-4 py-3">
                    <span class="text-slate-300 font-medium">${rank}</span>
                </td>
                <td class="px-4 py-3">
                    <span class="text-white font-bold">${level.toLocaleString()}</span>
                </td>
                <td class="px-4 py-3">
                    <span class="text-white font-bold">${xp.toLocaleString()}</span>
                </td>
            `;
        } else {
            row.innerHTML = `
                <td class="px-4 py-3">
                    <div class="flex items-center">
                        <div class="w-6 h-6 mr-3 flex items-center justify-center">
                            <i data-lucide="${icon}" class="w-4 h-4 text-amber-400"></i>
                        </div>
                        <span class="text-white font-medium">${name}</span>
                    </div>
                </td>
                <td class="px-4 py-3">
                    <span class="text-slate-300">${rank}</span>
                </td>
                <td class="px-4 py-3">
                    <span class="text-white font-medium">${level}</span>
                </td>
                <td class="px-4 py-3">
                    <span class="text-white">${xp.toLocaleString()}</span>
                </td>
            `;
        }
        return row;
    };

    /**
     * Attaches click event listeners to elements that link to player pages.
     * @param {string} [selector='.player-link'] - The CSS selector for the link elements.
     */
    const attachPlayerLinkListeners = (selector = '.player-link') => {
        document.querySelectorAll(selector).forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                const username = link.dataset.username;
                if (username) {
                    window.location.hash = encodeURIComponent(username);
                }
            });
        });
    };

    /**
     * Creates a search suggestion element.
     * @param {string} username - The username for the suggestion.
     * @returns {HTMLDivElement} The suggestion element with event listener attached.
     */
    const createSuggestionElement = (username) => {
        const suggestion = document.createElement('div');
        suggestion.className = 'search-suggestion';
        suggestion.innerHTML = `
            <div class="suggestion-content">
                <i data-lucide="user"></i>
                <span class="suggestion-name">${username}</span>
                <span class="suggestion-level">Click to view</span>
            </div>
        `;
        suggestion.addEventListener('click', () => {
            searchInput.value = username;
            window.location.hash = encodeURIComponent(username);
            hideSearch();
        });
        return suggestion;
    };

    /**
     * Navigates to the home view by clearing the URL hash.
     */
    const navigateToHome = () => {
        window.location.hash = '';
    };

    /**
     * Changes the current leaderboard page.
     * @param {number} direction - 1 for next, -1 for previous.
     */
    const changePage = (direction) => {
        const maxPage = Math.ceil(cachedLeaderboardData.length / ITEMS_PER_PAGE);
        const newPage = currentPage + direction;

        if (newPage >= 1 && newPage <= maxPage) {
            currentPage = newPage;
            renderLeaderboard(cachedLeaderboardData);
        }
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
     * Fetches skill rankings for accurate rank display
     */
    const fetchSkillRankings = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/skill-rankings`);
            if (!response.ok) {
                throw new Error(`Failed to fetch skill rankings: ${response.statusText}`);
            }
            const rankings = await response.json();
            cachedRankings = rankings;
            return rankings;
        } catch (error) {
            console.error('Error fetching skill rankings:', error);
            return null;
        }
    };

    /**
     * Gets the actual rank for a user in a specific skill
     * @param {string} username - The username
     * @param {string} skillName - The skill name
     * @returns {number} The user's rank in that skill
     */
    const getUserSkillRank = (username, skillName) => {
        if (!cachedRankings || !cachedRankings.skills || !cachedRankings.skills[skillName]) {
            return 'N/A';
        }

        const skillRanking = cachedRankings.skills[skillName];
        const userRank = skillRanking.find(player => player.username === username);
        return userRank ? userRank.rank : 'N/A';
    };

    /**
     * Gets the actual total level rank for a user
     * @param {string} username - The username
     * @returns {number} The user's total level rank
     */
    const getUserTotalRank = (username) => {
        if (!cachedRankings || !cachedRankings.totalLevel) {
            return 'N/A';
        }

        const userRank = cachedRankings.totalLevel.find(player => player.username === username);
        return userRank ? userRank.rank : 'N/A';
    };

    /**
     * Fetches all users for search suggestions and caching
     */
    const fetchAllUsers = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/users`);
            if (!response.ok) {
                throw new Error(`Failed to fetch users: ${response.statusText}`);
            }
            const data = await response.json();
            cachedUsers = data.users; // Extract the users array from the response
            return data.users;
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

            // Cache the leaderboard data for pagination
            cachedLeaderboardData = leaderboardData;

            renderLeaderboard(leaderboardData);
            showView('leaderboard');

            // Cache users for search and refresh rankings
            if (!cachedUsers) {
                fetchAllUsers();
            }

            // Refresh rankings when leaderboard is refreshed
            fetchSkillRankings();
        } catch (error) {
            handleApiError(
                error,
                'Error fetching leaderboard:',
                'Error loading leaderboard',
                'Failed to load leaderboard'
            );
        }
    };

    /**
     * Fetches and displays a specific user's stats
     * @param {string} username - The username to fetch
     */
    const fetchUserStats = async (username) => {
        showView('loading');
        try {
            // Fetch user data and rankings in parallel
            const [userResponse, rankings] = await Promise.all([
                fetch(`${API_BASE_URL}/api/users/${encodeURIComponent(username)}`),
                cachedRankings ? Promise.resolve(cachedRankings) : fetchSkillRankings()
            ]);

            if (!userResponse.ok) {
                if (userResponse.status === 404) {
                    throw new Error(`Player "${username}" not found`);
                }
                throw new Error(`Failed to fetch user data: ${userResponse.statusText}`);
            }

            const userData = await userResponse.json();
            currentPlayer = userData;

            // Make sure we have rankings cached
            if (rankings && !cachedRankings) {
                cachedRankings = rankings;
            }

            await renderUserDetail(userData);
            showView('player');
        } catch (error) {
            handleApiError(
                error,
                'Error fetching user stats:',
                'Error loading player data',
                `Failed to load player: ${username}`
            );
        }
    };

    // =================================================================
    // RENDERING FUNCTIONS
    // =================================================================

    /**
     * Renders the leaderboard table
     * @param {Array} data - Array of player objects
     */
    function renderLeaderboard(data) {
        const totalPages = Math.ceil(data.length / ITEMS_PER_PAGE);
        // clamp currentPage
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
        const pageData = data.slice(startIdx, startIdx + ITEMS_PER_PAGE);

        leaderboardBody.innerHTML = '';

        if (pageData.length === 0) {
            leaderboardBody.innerHTML = `
                <tr>
                    <td colspan="4" class="px-4 py-8 text-center text-slate-400">
                        <div class="flex flex-col items-center">
                            <i data-lucide="users" class="w-12 h-12 mb-4 text-slate-500"></i>
                            <p class="text-lg">No players to show</p>
                        </div>
                    </td>
                </tr>`;
        } else {
            pageData.forEach((player) => {
                const row = document.createElement('tr');
                row.className = 'hover:bg-slate-700/30 transition-colors duration-200';
                // highlight top-3 by absolute rank:
                let rankClass = '';
                if (player.rank === 1) rankClass = 'rank-gold';
                else if (player.rank === 2) rankClass = 'rank-silver';
                else if (player.rank === 3) rankClass = 'rank-bronze';

                row.innerHTML = `
                    <td class="px-4 py-3">
                        <span class="text-white font-medium ${rankClass}">${player.rank}</span>
                    </td>
                    <td class="px-4 py-3">
                        <button class="player-link text-left hover:text-amber-400 transition-colors duration-200"
                                        data-username="${player.username}">
                            <span class="text-white font-medium">${player.username}</span>
                        </button>
                    </td>
                    <td class="px-4 py-3">
                        <span class="text-white">${player.totalLevel.toLocaleString()}</span>
                    </td>
                    <td class="px-4 py-3">
                        <span class="text-white">${player.totalXp.toLocaleString()}</span>
                    </td>`;
                leaderboardBody.appendChild(row);
            });
            // re-attach click handlers
            attachPlayerLinkListeners();
        }

        // update pagination UI
        document.getElementById('prev-page').disabled = (currentPage === 1);
        document.getElementById('next-page').disabled = (currentPage === totalPages);
        document.getElementById('page-info').textContent = `Page ${currentPage} of ${totalPages}`;

        lucide.createIcons();
    }

    /**
     * Renders the detailed user stats view
     * @param {object} user - User data object
     */
    const renderUserDetail = async (user) => {
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

        // Ensure rankings are loaded
        if (!cachedRankings) {
            await fetchSkillRankings();
        }

        // Render skills table
        const skillsTableBody = document.getElementById('skills-table-body');
        skillsTableBody.innerHTML = '';

        // Add Overall row first
        const overallRank = getUserTotalRank(user.username);
        const displayOverallRank = overallRank === 'N/A' ? 'N/A' : overallRank.toLocaleString();
        const overallRow = createSkillRow({
            icon: 'trophy',
            name: 'Overall',
            rank: displayOverallRank,
            level: totalLevel,
            xp: totalXp,
            isOverall: true
        });
        skillsTableBody.appendChild(overallRow);

        // Add individual skills
        SKILLS.forEach((skillName) => {
            const skill = user.skills[skillName];
            if (!skill) return;

            const actualRank = getUserSkillRank(user.username, skillName);
            const displayRank = actualRank === 'N/A' ? 'N/A' : actualRank.toLocaleString();

            const skillRow = createSkillRow({
                icon: getSkillIcon(skillName),
                name: skillName,
                rank: displayRank,
                level: skill.level,
                xp: skill.xp
            });
            skillsTableBody.appendChild(skillRow);
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
            searchSuggestions.classList.add('hidden');
            return;
        }

        // Get users if not cached
        if (!cachedUsers) {
            await fetchAllUsers();
        }

        // Filter users based on query
        const filteredUsers = cachedUsers.filter(username =>
            username.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 5);

        // Render suggestions
        searchSuggestions.innerHTML = '';
        if (filteredUsers.length > 0) {
            filteredUsers.forEach(username => {
                const suggestion = createSuggestionElement(username);
                searchSuggestions.appendChild(suggestion);
            });
            lucide.createIcons();
            searchSuggestions.classList.remove('hidden');
        } else {
            searchSuggestions.innerHTML = '<div class="no-suggestions">No players found</div>';
            searchSuggestions.classList.remove('hidden');
        }
    }, 300);

    /**
     * Shows the search interface
     */
    const showSearch = () => {
        searchContainer.classList.remove('hidden', 'opacity-0', '-translate-y-2');
        searchContainer.classList.add('active');
        searchInput.focus();
    };

    /**
     * Hides the search interface
     */
    const hideSearch = () => {
        searchContainer.classList.add('hidden', 'opacity-0', '-translate-y-2');
        searchContainer.classList.remove('active');
        searchInput.value = '';
        searchSuggestions.innerHTML = '';
        searchSuggestions.classList.add('hidden');
    };

    // =================================================================
    // THEME MANAGEMENT
    // =================================================================

    /**
     * Toggles between light and dark themes
     */
    const toggleTheme = () => {
        const isDark = document.documentElement.classList.contains('dark');
        const newTheme = isDark ? 'light' : 'dark';

        document.documentElement.classList.toggle('dark', !isDark);
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
        searchSuggestions.classList.add('hidden');
    });

    // Search on enter/escape
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
    backBtn?.addEventListener('click', navigateToHome);

    // Logo button (home navigation)
    logoBtn?.addEventListener('click', navigateToHome);

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
    refreshPlayer?.addEventListener('click', async () => {
        if (currentPlayer) {
            // Refresh rankings before refreshing player data
            await fetchSkillRankings();
            fetchUserStats(currentPlayer.username);
        }
    });

    // Start search button on home page
    startSearch?.addEventListener('click', showSearch);

    // Hash change listener for routing
    window.addEventListener('hashchange', handleRouteChange);

    // Pagination event listeners
    document.getElementById('prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('next-page').addEventListener('click', () => changePage(1));


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

        // Check if there's a hash in URL to load a player directly
        handleRouteChange();

        // Fetch configuration, users and rankings for search and accurate ranking display
        await Promise.all([
            fetchSkills(),
            fetchAllUsers(),
            fetchSkillRankings()
        ]);
    };

    // Start the application
    init();
});
