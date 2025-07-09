// frontend/app.js

document.addEventListener('DOMContentLoaded', () => {
    const ITEMS_PER_PAGE = 25;
    let currentPage = 1;
    // Auto-detect API URL based on environment
    const API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'https://osrs-hiscores-clone.vs.workers.dev';
        }
        return 'https://osrs-hiscores-clone.vs.workers.dev';
    })();

    let SKILLS = []; // Will be populated from API

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
    let cachedUsers = [];
    let cachedRankings = null;
    let cachedLeaderboardData = [];

    // =================================================================
    // UTILITY FUNCTIONS
    // =================================================================

    const showToast = (message, type = 'info', duration = 4000) => {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <i data-lucide="${type === 'error' ? 'alert-circle' : type === 'success' ? 'check-circle' : type === 'warning' ? 'alert-triangle' : 'info'}"></i>
                <span>${message}</span>
            </div>
            <button class="toast-close"><i data-lucide="x"></i></button>`;
        toastContainer.appendChild(toast);
        lucide.createIcons();
        setTimeout(() => toast.remove(), duration);
        toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    };

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

    const formatNumber = (num) => {
        if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
        if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
        return num.toLocaleString();
    };

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

    const handleApiError = (error, logMessage, displayMessage, toastMessage) => {
        console.error(logMessage, error);
        errorMessage.textContent = `${displayMessage}: ${error.message}`;
        showView('error');
        showToast(toastMessage, 'error');
    };

    const createSkillRow = ({ icon, name, rank, level, xp, isOverall = false }) => {
        const row = document.createElement('tr');
        row.className = 'hover:bg-slate-700/20 transition-colors duration-200';
        const fontWeightClass = isOverall ? 'font-bold' : 'font-medium';
        if (isOverall) row.classList.add('border-b', 'border-slate-600/50');
        row.innerHTML = `
            <td class="px-4 py-3">
                <div class="flex items-center">
                    <div class="w-6 h-6 mr-3 flex items-center justify-center"><i data-lucide="${icon}" class="w-4 h-4 text-amber-400"></i></div>
                    <span class="text-white ${fontWeightClass}">${name}</span>
                </div>
            </td>
            <td class="px-4 py-3"><span class="text-slate-300 ${fontWeightClass}">${rank}</span></td>
            <td class="px-4 py-3"><span class="text-white ${fontWeightClass}">${level.toLocaleString()}</span></td>
            <td class="px-4 py-3"><span class="text-white ${fontWeightClass}">${xp.toLocaleString()}</span></td>`;
        return row;
    };

    const attachPlayerLinkListeners = (selector = '.player-link') => {
        document.querySelectorAll(selector).forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                const username = link.dataset.username;
                if (username) window.location.hash = encodeURIComponent(username);
            });
        });
    };

    const createSuggestionElement = (username) => {
        const suggestion = document.createElement('div');
        suggestion.className = 'search-suggestion';
        suggestion.innerHTML = `
            <div class="suggestion-content">
                <i data-lucide="user"></i>
                <span class="suggestion-name">${username}</span>
                <span class="suggestion-level">Click to view</span>
            </div>`;
        suggestion.addEventListener('click', () => {
            searchInput.value = username;
            window.location.hash = encodeURIComponent(username);
            hideSearch();
        });
        return suggestion;
    };

    const navigateToHome = () => { window.location.hash = ''; };

    const changePage = (direction) => {
        const maxPage = Math.ceil(cachedLeaderboardData.length / ITEMS_PER_PAGE);
        const newPage = currentPage + direction;
        if (newPage >= 1 && newPage <= maxPage) {
            currentPage = newPage;
            renderLeaderboard();
        }
    };

    // =================================================================
    // VIEW MANAGEMENT
    // =================================================================

    const showView = (viewName) => {
        [loadingState, errorState, homeView, leaderboardView, playerView].forEach(v => v.style.display = 'none');
        currentView = viewName;
        const viewMap = { loading: loadingState, error: errorState, home: homeView, leaderboard: leaderboardView, player: playerView };
        if (viewMap[viewName]) viewMap[viewName].style.display = 'block';
    };

    const handleRouteChange = () => {
        const hash = window.location.hash.substring(1);
        if (hash) {
            const username = decodeURIComponent(hash);
            fetchUserStats(username);
        } else {
            showView('leaderboard');
            renderLeaderboard();
        }
    };

    // =================================================================
    // API FUNCTIONS
    // =================================================================

    /**
     * FIX: This is the new primary data fetching function.
     * It fetches all rankings data in a single API call and populates all caches.
     */
    const fetchAndCacheRankings = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/skill-rankings`);
            if (!response.ok) throw new Error(`API Error: ${response.statusText}`);

            const data = await response.json();
            cachedRankings = data;
            cachedLeaderboardData = data.totalLevel || [];
            cachedUsers = data.totalLevel?.map(p => p.username) || [];

            if (data.lastUpdated) {
                displayLastUpdated(data.lastUpdated);
            }
            return data;
        } catch (error) {
            handleApiError(error, 'Error fetching rankings:', 'Could not load hiscores data', 'Failed to connect to the server.');
            throw error; // Re-throw to stop subsequent actions
        }
    };

    const getUserSkillRank = (username, skillName) => {
        const skillRanking = cachedRankings?.skills?.[skillName];
        const userRank = skillRanking?.find(p => p.username === username);
        return userRank ? userRank.rank.toLocaleString() : 'N/A';
    };

    const getUserTotalRank = (username) => {
        const userRank = cachedRankings?.totalLevel?.find(p => p.username === username);
        return userRank ? userRank.rank.toLocaleString() : 'N/A';
    };

    /**
     * FIX: Simplified to use the new caching function.
     */
    const fetchLeaderboard = async () => {
        showView('loading');
        try {
            await fetchAndCacheRankings();
            renderLeaderboard();
            showView('leaderboard');
        } catch (error) {
            // Error is already handled by fetchAndCacheRankings
            console.log("Stopping leaderboard render due to fetch error.");
        }
    };

    const fetchUserStats = async (username) => {
        showView('loading');
        try {
            // FIX: Ensure rankings are loaded, then fetch just the specific user data.
            const [userResponse] = await Promise.all([
                fetch(`${API_BASE_URL}/api/users/${encodeURIComponent(username)}`),
                cachedRankings ? Promise.resolve() : fetchAndCacheRankings()
            ]);

            if (!userResponse.ok) {
                throw new Error(userResponse.status === 404 ? `Player "${username}" not found` : `API Error: ${userResponse.statusText}`);
            }

            const userData = await userResponse.json();
            currentPlayer = userData;
            await renderUserDetail(userData);
            showView('player');
        } catch (error) {
            handleApiError(error, 'Error fetching user stats:', 'Error loading player data', error.message);
        }
    };

    // =================================================================
    // RENDERING FUNCTIONS
    // =================================================================

    /**
     * FIX: No longer needs data passed in; it uses the global cache.
     */
    function renderLeaderboard() {
        const totalPages = Math.ceil(cachedLeaderboardData.length / ITEMS_PER_PAGE);
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
        const pageData = cachedLeaderboardData.slice(startIdx, startIdx + ITEMS_PER_PAGE);
        leaderboardBody.innerHTML = '';

        if (pageData.length === 0) {
            leaderboardBody.innerHTML = `<tr><td colspan="4" class="px-4 py-8 text-center text-slate-400">No players found.</td></tr>`;
        } else {
            pageData.forEach((player) => {
                const row = document.createElement('tr');
                row.className = 'hover:bg-slate-700/30 transition-colors duration-200';
                let rankClass = '';
                if (player.rank === 1) rankClass = 'rank-gold';
                else if (player.rank === 2) rankClass = 'rank-silver';
                else if (player.rank === 3) rankClass = 'rank-bronze';

                row.innerHTML = `
                    <td class="px-4 py-3"><span class="font-medium ${rankClass}">${player.rank}</span></td>
                    <td class="px-4 py-3">
                        <button class="player-link text-left hover:text-amber-400 transition-colors duration-200" data-username="${player.username}">
                            <span class="font-medium">${player.username}</span>
                        </button>
                    </td>
                    <td class="px-4 py-3"><span>${player.totalLevel.toLocaleString()}</span></td>
                    <td class="px-4 py-3"><span>${player.totalXp.toLocaleString()}</span></td>`;
                leaderboardBody.appendChild(row);
            });
            attachPlayerLinkListeners();
        }

        document.getElementById('prev-page').disabled = (currentPage === 1);
        document.getElementById('next-page').disabled = (currentPage >= totalPages);
        document.getElementById('page-info').textContent = `Page ${currentPage} of ${totalPages || 1}`;
        lucide.createIcons();
    }

    const renderUserDetail = async (user) => {
        document.getElementById('player-name').textContent = user.username;
        const totalLevel = Object.values(user.skills).reduce((sum, skill) => sum + skill.level, 0);
        const totalXp = Object.values(user.skills).reduce((sum, skill) => sum + skill.xp, 0);
        document.getElementById('total-level').textContent = totalLevel.toLocaleString();
        document.getElementById('total-xp').textContent = formatNumber(totalXp);
        document.getElementById('combat-level').textContent = calculateCombatLevel(user.skills);

        const skillsTableBody = document.getElementById('skills-table-body');
        skillsTableBody.innerHTML = '';
        const overallRow = createSkillRow({ icon: 'trophy', name: 'Overall', rank: getUserTotalRank(user.username), level: totalLevel, xp: totalXp, isOverall: true });
        skillsTableBody.appendChild(overallRow);

        SKILLS.forEach((skillName) => {
            const skill = user.skills[skillName];
            if (!skill) return;
            const skillRow = createSkillRow({ icon: getSkillIcon(skillName), name: skillName, rank: getUserSkillRank(user.username, skillName), level: skill.level, xp: skill.xp });
            skillsTableBody.appendChild(skillRow);
        });
        lucide.createIcons();
    };

    const getSkillIcon = (skillName) => {
        const iconMap = { 'Attack': 'sword', 'Strength': 'dumbbell', 'Defence': 'shield', 'Ranged': 'bow', 'Prayer': 'sparkles', 'Magic': 'wand', 'Runecrafting': 'zap', 'Construction': 'hammer', 'Hitpoints': 'heart', 'Agility': 'wind', 'Herblore': 'flask-conical', 'Thieving': 'key', 'Crafting': 'scissors', 'Fletching': 'target', 'Slayer': 'skull', 'Hunter': 'crosshair', 'Mining': 'pickaxe', 'Smithing': 'anvil', 'Fishing': 'fish', 'Cooking': 'chef-hat', 'Firemaking': 'flame', 'Woodcutting': 'axe', 'Farming': 'sprout' };
        return iconMap[skillName] || 'circle';
    };

    // =================================================================
    // SEARCH & THEME
    // =================================================================

    const handleSearch = debounce((query) => {
        if (!query.trim()) {
            searchSuggestions.classList.add('hidden');
            return;
        }
        const filteredUsers = cachedUsers.filter(u => u.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
        searchSuggestions.innerHTML = '';
        if (filteredUsers.length > 0) {
            filteredUsers.forEach(u => searchSuggestions.appendChild(createSuggestionElement(u)));
            lucide.createIcons();
        } else {
            searchSuggestions.innerHTML = '<div class="no-suggestions">No players found</div>';
        }
        searchSuggestions.classList.remove('hidden');
    }, 300);

    const showSearch = () => {
        searchContainer.classList.remove('hidden', 'opacity-0', '-translate-y-2');
        searchInput.focus();
    };

    const hideSearch = () => {
        searchContainer.classList.add('hidden', 'opacity-0', '-translate-y-2');
        searchInput.value = '';
        searchSuggestions.classList.add('hidden');
    };

    const toggleTheme = () => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    };

    // =================================================================
    // EVENT LISTENERS
    // =================================================================

    themeToggle?.addEventListener('click', toggleTheme);
    searchToggle?.addEventListener('click', showSearch);
    searchInput?.addEventListener('input', (e) => handleSearch(e.target.value));
    searchClear?.addEventListener('click', () => { searchInput.value = ''; searchSuggestions.classList.add('hidden'); });
    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (query) { window.location.hash = encodeURIComponent(query); hideSearch(); }
        } else if (e.key === 'Escape') hideSearch();
    });
    document.addEventListener('click', (e) => {
        if (!searchContainer.contains(e.target) && !searchToggle.contains(e.target)) hideSearch();
    });
    backBtn?.addEventListener('click', navigateToHome);
    logoBtn?.addEventListener('click', navigateToHome);
    retryBtn?.addEventListener('click', () => { currentView === 'player' ? fetchUserStats(currentPlayer.username) : fetchLeaderboard(); });
    refreshLeaderboard?.addEventListener('click', fetchLeaderboard);
    refreshPlayer?.addEventListener('click', () => { if (currentPlayer) fetchUserStats(currentPlayer.username); });
    startSearch?.addEventListener('click', showSearch);
    window.addEventListener('hashchange', handleRouteChange);
    document.getElementById('prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('next-page').addEventListener('click', () => changePage(1));

    // =================================================================
    // INITIALIZATION
    // =================================================================

    /**
     * FIX: Displays the server's cache timestamp.
     */
    const displayLastUpdated = (isoString) => {
        if (!lastUpdated || !isoString) return;
        const date = new Date(isoString);
        const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        lastUpdated.innerHTML = `<i data-lucide="clock" class="w-3 h-3 mr-1.5"></i> Hiscores updated at ${timeString}`;
        lucide.createIcons();
    };

    const fetchSkills = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/skills`);
            if (response.ok) SKILLS = (await response.json()).skills;
        } catch (error) {
            console.warn('Failed to fetch skills, using fallback list.');
            SKILLS = ['Attack', 'Strength', 'Defence', 'Ranged', 'Prayer', 'Magic', 'Runecrafting', 'Construction', 'Hitpoints', 'Agility', 'Herblore', 'Thieving', 'Crafting', 'Fletching', 'Slayer', 'Hunter', 'Mining', 'Smithing', 'Fishing', 'Cooking', 'Firemaking', 'Woodcutting', 'Farming'];
        }
    };

    /**
     * FIX: Simplified init flow.
     */
    const init = async () => {
        showView('loading');
        if (localStorage.theme === 'dark') document.documentElement.classList.add('dark');

        await fetchSkills(); // Fetch skill list first
        try {
            await fetchAndCacheRankings(); // Then get all data
            handleRouteChange(); // Finally, render the correct view based on the URL
        } catch (error) {
            // Error already handled, init stops here.
        }
    };

    init();
});
