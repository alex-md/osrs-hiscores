// frontend/app.js

document.addEventListener('DOMContentLoaded', () => {
    const ITEMS_PER_PAGE_DEFAULT = 25;
    let currentPage = 1;
    let itemsPerPage = ITEMS_PER_PAGE_DEFAULT;
    let currentLeaderboardSortField = 'rank';
    let currentLeaderboardSortDirection = 'asc';
    let filteredLeaderboardData = [];
    let allLeaderboardData = [];

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
    const leaderboardView = document.getElementById('leaderboard-view');
    const playerView = document.getElementById('player-view');
    const leaderboardBody = document.getElementById('leaderboard-body');

    // Old search elements (still needed for compatibility)
    const searchContainer = document.getElementById('search-container');
    const searchInput = document.getElementById('search-input');
    const searchSuggestions = document.getElementById('search-suggestions');
    const searchClear = document.getElementById('search-clear');

    // New navbar search elements
    const searchModal = document.getElementById('search-modal');
    const searchOverlay = document.getElementById('search-overlay');
    const modalSearchInput = document.getElementById('modal-search-input');
    const modalSearchSuggestions = document.getElementById('modal-search-suggestions');
    const closeSearchModal = document.getElementById('close-search-modal');
    const quickSearchInput = document.getElementById('quick-search-input');
    const searchPlayerBtn = document.getElementById('search-player-btn');
    const mobileSearchBtn = document.getElementById('mobile-search-btn');
    const mobileSearchInput = document.getElementById('mobile-search-input');

    // Mobile menu elements
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const mobileMenu = document.getElementById('mobile-menu');

    // Navigation elements
    const navLinks = document.querySelectorAll('.nav-link');
    const mobileNavLinks = document.querySelectorAll('.mobile-nav-link');

    const leaderboardPlayerSearch = document.getElementById('leaderboard-player-search');
    const totalLevelFilter = document.getElementById('total-level-filter');
    const totalXpFilter = document.getElementById('total-xp-filter');
    const leaderboardItemsPerPage = document.getElementById('leaderboard-items-per-page');
    const totalLeaderboardPlayers = document.getElementById('total-leaderboard-players');
    const exportLeaderboard = document.getElementById('export-leaderboard');
    const viewSkillHiscores = document.getElementById('view-skill-hiscores');
    const themeToggle = document.getElementById('theme-toggle');
    const retryBtn = document.getElementById('retry-btn');
    const backBtn = document.getElementById('back-btn');
    const logoBtn = document.getElementById('logo-btn');
    const refreshLeaderboard = document.getElementById('refresh-leaderboard');
    const refreshPlayer = document.getElementById('refresh-player');
    const startSearch = document.getElementById('start-search');
    const lastUpdated = document.getElementById('last-updated');
    const toastContainer = document.getElementById('toast-container');

    // State management
    let currentView = 'leaderboard';
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

        // Make skill names clickable (except for Overall)
        const skillNameElement = isOverall
            ? `<span class="text-white ${fontWeightClass}">${name}</span>`
            : `<button class="skill-link text-white ${fontWeightClass} hover:text-amber-400 transition-colors duration-200 text-left" data-skill="${name}" title="View ${name} hiscores">${name}</button>`;

        row.innerHTML = `
            <td class="px-4 py-3">
                <div class="flex items-center">
                    <div class="w-6 h-6 mr-3 flex items-center justify-center"><i data-lucide="${icon}" class="w-4 h-4 text-amber-400"></i></div>
                    ${skillNameElement}
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

    const attachSkillLinkListeners = (selector = '.skill-link') => {
        document.querySelectorAll(selector).forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                const skillName = link.dataset.skill;
                if (skillName) {
                    // Open skill hiscores page in a new tab
                    window.open(`skill-hiscores.html#${encodeURIComponent(skillName)}`, '_blank');
                }
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

    const navigateToHome = () => {
        window.location.hash = '';
        setActiveNavLink('leaderboard');
    };

    const changePage = (direction) => {
        const maxPage = Math.ceil(filteredLeaderboardData.length / itemsPerPage);
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
        [loadingState, errorState, leaderboardView, playerView].forEach(v => v.style.display = 'none');
        currentView = viewName;
        const viewMap = { loading: loadingState, error: errorState, leaderboard: leaderboardView, player: playerView };
        if (viewMap[viewName]) viewMap[viewName].style.display = 'block';
    };

    const handleRouteChange = () => {
        const hash = window.location.hash.substring(1);
        if (hash) {
            const username = decodeURIComponent(hash);
            fetchUserStats(username);
            setActiveNavLink('player');
        } else {
            showView('leaderboard');
            renderLeaderboard();
            setActiveNavLink('leaderboard');
        }
    };

    // =================================================================
    // SORTING & FILTERING FUNCTIONS
    // =================================================================

    const applyLeaderboardFiltersAndSort = () => {
        let filtered = [...allLeaderboardData];

        // Apply search filter
        const searchTerm = leaderboardPlayerSearch?.value.toLowerCase().trim();
        if (searchTerm) {
            filtered = filtered.filter(player =>
                player.username.toLowerCase().includes(searchTerm)
            );
        }

        // Apply total level filter
        const levelFilterValue = totalLevelFilter?.value;
        if (levelFilterValue) {
            const minLevel = parseInt(levelFilterValue);
            filtered = filtered.filter(player => player.totalLevel >= minLevel);
        }

        // Apply total XP filter
        const xpFilterValue = totalXpFilter?.value;
        if (xpFilterValue) {
            const minXp = parseInt(xpFilterValue);
            filtered = filtered.filter(player => player.totalXp >= minXp);
        }

        // Apply sorting
        filtered.sort((a, b) => {
            let aValue, bValue;
            switch (currentLeaderboardSortField) {
                case 'rank':
                    aValue = a.rank;
                    bValue = b.rank;
                    break;
                case 'player':
                    aValue = a.username.toLowerCase();
                    bValue = b.username.toLowerCase();
                    break;
                case 'level':
                    aValue = a.totalLevel;
                    bValue = b.totalLevel;
                    break;
                case 'xp':
                    aValue = a.totalXp;
                    bValue = b.totalXp;
                    break;
                default:
                    aValue = a.rank;
                    bValue = b.rank;
            }

            if (currentLeaderboardSortDirection === 'asc') {
                return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
            } else {
                return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
            }
        });

        filteredLeaderboardData = filtered;
        currentPage = 1; // Reset to first page when filters change
        renderLeaderboard();
    };

    const setLeaderboardSortField = (field) => {
        if (currentLeaderboardSortField === field) {
            currentLeaderboardSortDirection = currentLeaderboardSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            currentLeaderboardSortField = field;
            currentLeaderboardSortDirection = field === 'rank' ? 'asc' : 'desc'; // Default to desc for most fields except rank
        }
        applyLeaderboardFiltersAndSort();
        updateLeaderboardSortIndicators();
    };

    const updateLeaderboardSortIndicators = () => {
        // Reset all sort indicators
        document.querySelectorAll('[id^="sort-leaderboard-"] i[data-lucide="arrow-up-down"], [id^="sort-leaderboard-"] i[data-lucide="arrow-up"], [id^="sort-leaderboard-"] i[data-lucide="arrow-down"]').forEach(icon => {
            icon.setAttribute('data-lucide', 'arrow-up-down');
            icon.className = 'w-3 h-3 ml-2 opacity-50';
        });

        // Set active sort indicator
        const activeSortElement = document.getElementById(`sort-leaderboard-${currentLeaderboardSortField}`);
        if (activeSortElement) {
            const icon = activeSortElement.querySelector('i[data-lucide="arrow-up-down"]');
            if (icon) {
                icon.setAttribute('data-lucide', currentLeaderboardSortDirection === 'asc' ? 'arrow-up' : 'arrow-down');
                icon.className = 'w-3 h-3 ml-2 opacity-100 text-amber-400';
            }
        }
        lucide.createIcons();
    };

    const exportLeaderboardData = () => {
        if (!filteredLeaderboardData.length) {
            showToast('No data to export', 'warning');
            return;
        }

        const csvContent = [
            ['Rank', 'Player Name', 'Total Level', 'Total Experience'].join(','),
            ...filteredLeaderboardData.map(player => [
                player.rank,
                player.username,
                player.totalLevel,
                player.totalXp
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `osrs-overall-hiscores.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        showToast('Overall hiscores exported successfully!', 'success');
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
            allLeaderboardData = [...cachedLeaderboardData];
            applyLeaderboardFiltersAndSort();
            showView('leaderboard');

            // Update total players count
            if (totalLeaderboardPlayers) {
                totalLeaderboardPlayers.textContent = `${allLeaderboardData.length.toLocaleString()} players tracked`;
            }
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
        const totalPages = Math.ceil(filteredLeaderboardData.length / itemsPerPage);
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIdx = (currentPage - 1) * itemsPerPage;
        const pageData = filteredLeaderboardData.slice(startIdx, startIdx + itemsPerPage);
        leaderboardBody.innerHTML = '';

        if (pageData.length === 0) {
            leaderboardBody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-slate-400">No players found matching your criteria.</td></tr>`;
        } else {
            pageData.forEach((player) => {
                const row = document.createElement('tr');
                row.className = 'hover:bg-slate-700/30 transition-colors duration-200';
                let rankClass = '';
                if (player.rank === 1) rankClass = 'rank-gold';
                else if (player.rank === 2) rankClass = 'rank-silver';
                else if (player.rank === 3) rankClass = 'rank-bronze';

                row.innerHTML = `
                    <td class="px-6 py-3"><span class="font-medium ${rankClass}">${player.rank.toLocaleString()}</span></td>
                    <td class="px-6 py-3">
                        <button class="player-link text-left hover:text-amber-400 transition-colors duration-200" data-username="${player.username}">
                            <span class="font-medium">${player.username}</span>
                        </button>
                    </td>
                    <td class="px-6 py-3"><span class="font-medium">${player.totalLevel.toLocaleString()}</span></td>
                    <td class="px-6 py-3"><span class="font-medium">${formatNumber(player.totalXp)}</span></td>`;
                leaderboardBody.appendChild(row);
            });
            attachPlayerLinkListeners();
        }

        updateLeaderboardPaginationControls(totalPages);
        lucide.createIcons();
    }

    const updateLeaderboardPaginationControls = (totalPages) => {
        document.getElementById('prev-page').disabled = (currentPage === 1);
        document.getElementById('next-page').disabled = (currentPage >= totalPages);
        document.getElementById('page-info').textContent = `Page ${currentPage} of ${totalPages || 1} (${filteredLeaderboardData.length.toLocaleString()} players)`;
    };

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
        attachSkillLinkListeners(); // Attach click listeners to skill names
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

    // Enhanced search functionality for the new modal
    const showSearchModal = () => {
        searchModal.classList.remove('hidden');
        modalSearchInput.focus();
        setTimeout(() => {
            searchModal.querySelector('.bg-slate-900\\/95').classList.add('search-modal-content', 'active');
        }, 10);
    };

    const hideSearchModal = () => {
        searchModal.querySelector('.bg-slate-900\\/95').classList.remove('active');
        setTimeout(() => {
            searchModal.classList.add('hidden');
            modalSearchInput.value = '';
            modalSearchSuggestions.classList.add('hidden');
        }, 300);
    };

    // Handle quick search functionality
    const handleQuickSearch = (value) => {
        if (value.trim().length >= 2) {
            debouncedSearch(value, quickSearchInput);
        }
    };

    // Handle mobile search functionality
    const handleMobileSearch = (value) => {
        if (value.trim().length >= 2) {
            debouncedSearch(value, mobileSearchInput);
        }
    };

    // Enhanced search handler that works with multiple inputs
    const handleModalSearch = (value) => {
        if (value.trim().length >= 2) {
            debouncedModalSearch(value);
        } else {
            modalSearchSuggestions.classList.add('hidden');
        }
    };

    // Debounced modal search
    const debouncedModalSearch = debounce(async (query) => {
        if (!query.trim()) {
            modalSearchSuggestions.classList.add('hidden');
            return;
        }

        try {
            const results = cachedUsers.filter(user =>
                user.toLowerCase().includes(query.toLowerCase())
            ).slice(0, 10);

            if (results.length > 0) {
                modalSearchSuggestions.innerHTML = results.map(username => `
                    <div class="search-result-item" data-username="${username}">
                        <div class="search-result-name">${username}</div>
                        <div class="search-result-details">
                            <span>Click to view stats</span>
                        </div>
                    </div>
                `).join('');

                modalSearchSuggestions.querySelectorAll('.search-result-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const username = item.dataset.username;
                        window.location.hash = encodeURIComponent(username);
                        hideSearchModal();
                    });
                });
            } else {
                modalSearchSuggestions.innerHTML = '<div class="search-no-results">No players found matching your search</div>';
            }
            modalSearchSuggestions.classList.remove('hidden');
        } catch (error) {
            console.error('Search error:', error);
            modalSearchSuggestions.innerHTML = '<div class="search-no-results">Search temporarily unavailable</div>';
            modalSearchSuggestions.classList.remove('hidden');
        }
    }, 300);

    // Mobile menu toggle functionality
    const toggleMobileMenu = () => {
        const isHidden = mobileMenu.classList.contains('hidden');
        if (isHidden) {
            mobileMenu.classList.remove('hidden');
            setTimeout(() => mobileMenu.classList.add('active'), 10);
        } else {
            mobileMenu.classList.remove('active');
            setTimeout(() => mobileMenu.classList.add('hidden'), 300);
        }
    };

    // Navigation functionality
    const setActiveNavLink = (currentPage) => {
        navLinks.forEach(link => {
            link.classList.remove('active', 'text-white', 'bg-amber-500/20', 'border', 'border-amber-500/30');
            link.classList.add('text-slate-300');
        });

        mobileNavLinks.forEach(link => {
            link.classList.remove('text-white', 'bg-amber-500/20', 'border-l-4', 'border-amber-500');
            link.classList.add('text-slate-300');
        });

        const activeNav = document.querySelector(`.nav-link[data-page="${currentPage}"]`);
        const activeMobileNav = document.querySelector(`.mobile-nav-link[data-page="${currentPage}"]`);

        if (activeNav) {
            activeNav.classList.add('active', 'text-white', 'bg-amber-500/20', 'border', 'border-amber-500/30');
            activeNav.classList.remove('text-slate-300');
        }

        if (activeMobileNav) {
            activeMobileNav.classList.add('text-white', 'bg-amber-500/20', 'border-l-4', 'border-amber-500');
            activeMobileNav.classList.remove('text-slate-300');
        }
    };

    // Legacy search functions (maintained for compatibility)
    const showSearch = () => {
        if (searchContainer) {
            searchContainer.classList.remove('hidden', 'opacity-0', '-translate-y-2');
            searchInput?.focus();
        }
    };

    const hideSearch = () => {
        if (searchContainer) {
            searchContainer.classList.add('hidden', 'opacity-0', '-translate-y-2');
            if (searchInput) searchInput.value = '';
            searchSuggestions?.classList.add('hidden');
        }
    };

    const toggleTheme = () => {
        const isDark = document.documentElement.classList.toggle('dark');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    };

    // =================================================================
    // EVENT LISTENERS
    // =================================================================

    // Theme toggle
    themeToggle?.addEventListener('click', toggleTheme);

    // New navbar search functionality
    searchPlayerBtn?.addEventListener('click', showSearchModal);
    mobileSearchBtn?.addEventListener('click', showSearchModal);
    closeSearchModal?.addEventListener('click', hideSearchModal);
    searchOverlay?.addEventListener('click', hideSearchModal);

    // Modal search input
    modalSearchInput?.addEventListener('input', (e) => handleModalSearch(e.target.value));
    modalSearchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (query) {
                window.location.hash = encodeURIComponent(query);
                hideSearchModal();
            }
        } else if (e.key === 'Escape') {
            hideSearchModal();
        }
    });

    // Quick search input (desktop)
    quickSearchInput?.addEventListener('input', (e) => handleQuickSearch(e.target.value));
    quickSearchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (query) {
                window.location.hash = encodeURIComponent(query);
                e.target.value = '';
            }
        }
    });

    // Mobile search input
    mobileSearchInput?.addEventListener('input', (e) => handleMobileSearch(e.target.value));
    mobileSearchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (query) {
                window.location.hash = encodeURIComponent(query);
                e.target.value = '';
                toggleMobileMenu(); // Close mobile menu after search
            }
        }
    });

    // Mobile menu toggle
    mobileMenuToggle?.addEventListener('click', toggleMobileMenu);

    // Navigation links
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const page = link.dataset.page;
            if (page === 'leaderboard') {
                e.preventDefault();
                navigateToHome(); // Home is now the leaderboard
            }
            // For external links like skill-hiscores.html, let default behavior occur
        });
    });

    mobileNavLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const page = link.dataset.page;
            if (page === 'leaderboard') {
                e.preventDefault();
                navigateToHome(); // Home is now the leaderboard
                toggleMobileMenu();
            }
            // For external links, let default behavior occur but close menu
            setTimeout(() => toggleMobileMenu(), 100);
        });
    });

    // Legacy search event listeners (maintained for compatibility)
    searchInput?.addEventListener('input', (e) => handleSearch(e.target.value));
    searchClear?.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        searchSuggestions?.classList.add('hidden');
    });
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
        // Close legacy search
        if (searchContainer && !searchContainer.contains(e.target)) {
            hideSearch();
        }

        // Close mobile menu when clicking outside
        if (mobileMenu && !mobileMenu.contains(e.target) && !mobileMenuToggle?.contains(e.target)) {
            if (!mobileMenu.classList.contains('hidden')) {
                toggleMobileMenu();
            }
        }
    });

    // Navigation buttons
    backBtn?.addEventListener('click', navigateToHome);
    logoBtn?.addEventListener('click', navigateToHome);
    retryBtn?.addEventListener('click', () => {
        currentView === 'player' ? fetchUserStats(currentPlayer.username) : fetchLeaderboard();
    });
    refreshLeaderboard?.addEventListener('click', fetchLeaderboard);
    refreshPlayer?.addEventListener('click', () => { if (currentPlayer) fetchUserStats(currentPlayer.username); });
    startSearch?.addEventListener('click', showSearchModal);
    window.addEventListener('hashchange', handleRouteChange);
    document.getElementById('prev-page').addEventListener('click', () => changePage(-1));
    document.getElementById('next-page').addEventListener('click', () => changePage(1));

    // Enhanced leaderboard functionality
    leaderboardPlayerSearch?.addEventListener('input', debounce(() => applyLeaderboardFiltersAndSort(), 300));
    totalLevelFilter?.addEventListener('change', () => applyLeaderboardFiltersAndSort());
    totalXpFilter?.addEventListener('change', () => applyLeaderboardFiltersAndSort());
    leaderboardItemsPerPage?.addEventListener('change', (e) => {
        itemsPerPage = parseInt(e.target.value);
        currentPage = 1;
        renderLeaderboard();
    });
    exportLeaderboard?.addEventListener('click', exportLeaderboardData);
    viewSkillHiscores?.addEventListener('click', () => window.open('skill-hiscores.html', '_self'));

    // Leaderboard sorting
    document.getElementById('sort-leaderboard-rank')?.addEventListener('click', () => setLeaderboardSortField('rank'));
    document.getElementById('sort-leaderboard-player')?.addEventListener('click', () => setLeaderboardSortField('player'));
    document.getElementById('sort-leaderboard-level')?.addEventListener('click', () => setLeaderboardSortField('level'));
    document.getElementById('sort-leaderboard-xp')?.addEventListener('click', () => setLeaderboardSortField('xp'));

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
            await fetchAndCacheRankings();
            allLeaderboardData = [...cachedLeaderboardData];
            applyLeaderboardFiltersAndSort();
            handleRouteChange(); // Finally, render the correct view based on the URL
        } catch (error) {
            // Error already handled, init stops here.
        }
    };

    init();
});
