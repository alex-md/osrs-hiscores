// frontend/skill-hiscores.js

document.addEventListener('DOMContentLoaded', () => {
    const ITEMS_PER_PAGE_DEFAULT = 25;
    let currentPage = 1;
    let itemsPerPage = ITEMS_PER_PAGE_DEFAULT;
    let currentSkill = null;
    let currentSortField = 'rank';
    let currentSortDirection = 'asc';
    let filteredData = [];
    let allSkillData = [];

    // Auto-detect API URL based on environment
    const API_BASE_URL = (() => {
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            return 'https://osrs-hiscores-clone.vs.workers.dev';
        }
        return 'https://osrs-hiscores-clone.vs.workers.dev';
    })();

    let SKILLS = []; // Will be populated from API
    let cachedRankings = null;

    // DOM Element References
    const mainContent = document.getElementById('main-content');
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const errorMessage = document.getElementById('error-message');
    const skillSelectionView = document.getElementById('skill-selection-view');
    const skillHiscoresView = document.getElementById('skill-hiscores-view');
    const skillGrid = document.getElementById('skill-grid');
    const currentSkillName = document.getElementById('current-skill-name');
    const skillIcon = document.getElementById('skill-icon');
    const skillIconContainer = document.getElementById('skill-icon-container');
    const skillHiscoresBody = document.getElementById('skill-hiscores-body');
    const totalPlayersCount = document.getElementById('total-players-count');
    const topPlayerName = document.getElementById('top-player-name');
    const topPlayerLevel = document.getElementById('top-player-level');
    const highestXp = document.getElementById('highest-xp');
    const highestXpPlayer = document.getElementById('highest-xp-player');
    const averageLevel = document.getElementById('average-level');

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

    const skillPlayerSearch = document.getElementById('skill-player-search');
    const levelFilter = document.getElementById('level-filter');
    const xpFilter = document.getElementById('xp-filter');
    const itemsPerPageSelect = document.getElementById('items-per-page');
    const themeToggle = document.getElementById('theme-toggle');
    const retryBtn = document.getElementById('retry-btn');
    const backToSkillsBtn = document.getElementById('back-to-skills-btn');
    const logoBtn = document.getElementById('logo-btn');
    const refreshSkillData = document.getElementById('refresh-skill-data');
    const exportSkillDataBtn = document.getElementById('export-skill-data');
    const viewOverallBtn = document.getElementById('view-overall-btn');
    const randomSkillBtn = document.getElementById('random-skill-btn');
    const lastUpdated = document.getElementById('last-updated');
    const toastContainer = document.getElementById('toast-container');

    // State management
    let currentView = 'skillSelection';

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

    const getSkillIcon = (skillName) => {
        const iconMap = {
            'Attack': 'sword',
            'Strength': 'dumbbell',
            'Defence': 'shield',
            'Ranged': 'bow',
            'Prayer': 'sparkles',
            'Magic': 'wand',
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
            'Farming': 'sprout'
        };
        return iconMap[skillName] || 'circle';
    };

    const getSkillColor = (skillName) => {
        const colorMap = {
            'Attack': 'from-red-400 to-red-600',
            'Strength': 'from-green-400 to-green-600',
            'Defence': 'from-blue-400 to-blue-600',
            'Ranged': 'from-emerald-400 to-emerald-600',
            'Prayer': 'from-yellow-400 to-yellow-600',
            'Magic': 'from-purple-400 to-purple-600',
            'Runecrafting': 'from-indigo-400 to-indigo-600',
            'Construction': 'from-orange-400 to-orange-600',
            'Hitpoints': 'from-pink-400 to-pink-600',
            'Agility': 'from-cyan-400 to-cyan-600',
            'Herblore': 'from-lime-400 to-lime-600',
            'Thieving': 'from-violet-400 to-violet-600',
            'Crafting': 'from-rose-400 to-rose-600',
            'Fletching': 'from-teal-400 to-teal-600',
            'Slayer': 'from-red-500 to-red-700',
            'Hunter': 'from-amber-400 to-amber-600',
            'Mining': 'from-gray-400 to-gray-600',
            'Smithing': 'from-orange-500 to-orange-700',
            'Fishing': 'from-sky-400 to-sky-600',
            'Cooking': 'from-red-400 to-pink-600',
            'Firemaking': 'from-orange-400 to-red-600',
            'Woodcutting': 'from-green-500 to-green-700',
            'Farming': 'from-green-400 to-lime-600'
        };
        return colorMap[skillName] || 'from-amber-400 to-orange-500';
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

    const createPlayerLink = (username, additionalClasses = '') => {
        return `<button class="player-link text-left hover:text-amber-400 transition-colors duration-200 ${additionalClasses}" data-username="${username}">
            <span class="font-medium">${username}</span>
        </button>`;
    };

    const attachPlayerLinkListeners = (selector = '.player-link') => {
        document.querySelectorAll(selector).forEach(link => {
            link.addEventListener('click', e => {
                e.preventDefault();
                const username = link.dataset.username;
                if (username) {
                    // Navigate to player detail on main hiscores page
                    window.open(`index.html#${encodeURIComponent(username)}`, '_blank');
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
            window.open(`index.html#${encodeURIComponent(username)}`, '_blank');
            hideSearch();
        });
        return suggestion;
    };

    // =================================================================
    // VIEW MANAGEMENT
    // =================================================================

    const showView = (viewName) => {
        [loadingState, errorState, skillSelectionView, skillHiscoresView].forEach(v => v.style.display = 'none');
        currentView = viewName;
        const viewMap = {
            loading: loadingState,
            error: errorState,
            skillSelection: skillSelectionView,
            skillHiscores: skillHiscoresView
        };
        if (viewMap[viewName]) viewMap[viewName].style.display = 'block';
    };

    const handleRouteChange = () => {
        const hash = window.location.hash.substring(1);
        if (hash) {
            const skillName = decodeURIComponent(hash);
            if (SKILLS.includes(skillName)) {
                loadSkillHiscores(skillName);
            } else {
                showView('skillSelection');
            }
        } else {
            showView('skillSelection');
        }
    };

    // =================================================================
    // API FUNCTIONS
    // =================================================================

    const fetchAndCacheRankings = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/skill-rankings`);
            if (!response.ok) throw new Error(`API Error: ${response.statusText}`);

            const data = await response.json();
            cachedRankings = data;

            if (data.lastUpdated) {
                displayLastUpdated(data.lastUpdated);
            }
            return data;
        } catch (error) {
            handleApiError(error, 'Error fetching rankings:', 'Could not load hiscores data', 'Failed to connect to the server.');
            throw error;
        }
    };

    const fetchSkills = async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/skills`);
            if (response.ok) {
                SKILLS = (await response.json()).skills;
            } else {
                throw new Error('Failed to fetch skills');
            }
        } catch (error) {
            console.warn('Failed to fetch skills, using fallback list.');
            SKILLS = [
                'Attack', 'Strength', 'Defence', 'Ranged', 'Prayer', 'Magic',
                'Runecrafting', 'Construction', 'Hitpoints', 'Agility', 'Herblore',
                'Thieving', 'Crafting', 'Fletching', 'Slayer', 'Hunter',
                'Mining', 'Smithing', 'Fishing', 'Cooking', 'Firemaking',
                'Woodcutting', 'Farming'
            ];
        }
    };

    // =================================================================
    // RENDERING FUNCTIONS
    // =================================================================

    // Skill categories for better organization
    const SKILL_CATEGORIES = {
        combat: ['Attack', 'Strength', 'Defence', 'Ranged', 'Prayer', 'Magic', 'Hitpoints'],
        gathering: ['Mining', 'Fishing', 'Woodcutting', 'Farming', 'Hunter'],
        artisan: ['Smithing', 'Cooking', 'Fletching', 'Crafting', 'Firemaking', 'Herblore'],
        support: ['Runecrafting', 'Construction', 'Agility', 'Thieving', 'Slayer']
    };

    const renderSkillGrid = () => {
        // Clear all category containers
        const containers = {
            combat: document.getElementById('combat-skills'),
            gathering: document.getElementById('gathering-skills'),
            artisan: document.getElementById('artisan-skills'),
            support: document.getElementById('support-skills')
        };

        Object.values(containers).forEach(container => {
            if (container) container.innerHTML = '';
        });

        // Group skills by category and render
        Object.entries(SKILL_CATEGORIES).forEach(([category, skills]) => {
            const container = containers[category];
            if (!container) return;

            skills.forEach(skill => {
                if (SKILLS.includes(skill)) {
                    const skillButton = document.createElement('button');
                    skillButton.className = `skill-button bg-slate-800/30 backdrop-blur-sm border border-slate-700/40 rounded-xl p-4 hover:bg-slate-700/40 transition-all duration-300 hover:scale-105 hover:border-amber-500/40 group flex flex-col items-center`;
                    skillButton.innerHTML = `
                        <div class="w-12 h-12 bg-gradient-to-br ${getSkillColor(skill)} rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                            <i data-lucide="${getSkillIcon(skill)}" class="w-6 h-6 text-white"></i>
                        </div>
                        <span class="text-white font-medium text-sm text-center group-hover:text-amber-300 transition-colors duration-300">${skill}</span>
                    `;
                    skillButton.addEventListener('click', () => {
                        window.location.hash = encodeURIComponent(skill);
                    });
                    container.appendChild(skillButton);
                }
            });
        });

        lucide.createIcons();
    };

    const loadSkillHiscores = async (skillName) => {
        showView('loading');
        try {
            if (!cachedRankings) {
                await fetchAndCacheRankings();
            }

            currentSkill = skillName;
            const skillData = cachedRankings.skills?.[skillName] || [];
            allSkillData = [...skillData];

            updateSkillHeader(skillName, skillData);
            applyFiltersAndSort();
            showView('skillHiscores');
        } catch (error) {
            handleApiError(error, 'Error loading skill hiscores:', 'Could not load skill data', 'Failed to load skill hiscores.');
        }
    };

    const updateSkillHeader = (skillName, skillData) => {
        currentSkillName.textContent = skillName;
        skillIcon.setAttribute('data-lucide', getSkillIcon(skillName));
        skillIconContainer.className = `w-16 h-16 bg-gradient-to-br ${getSkillColor(skillName)} rounded-2xl flex items-center justify-center mr-4 shadow-lg animate-glow`;

        totalPlayersCount.textContent = `${skillData.length.toLocaleString()} players tracked`;

        if (skillData.length > 0) {
            const topPlayer = skillData[0];
            topPlayerName.textContent = topPlayer.username;
            topPlayerLevel.textContent = `Level ${topPlayer.level} (${formatNumber(topPlayer.xp)} XP)`;

            const highestXpPlayer = skillData.reduce((max, player) => player.xp > max.xp ? player : max, skillData[0]);
            highestXp.textContent = formatNumber(highestXpPlayer.xp);
            highestXpPlayer.textContent = highestXpPlayer.username;

            const top100 = skillData.slice(0, 100);
            const avgLevel = Math.round(top100.reduce((sum, player) => sum + player.level, 0) / top100.length);
            averageLevel.textContent = avgLevel.toString();
        } else {
            topPlayerName.textContent = 'No data';
            topPlayerLevel.textContent = 'No players found';
            highestXp.textContent = '0';
            highestXpPlayer.textContent = 'No data';
            averageLevel.textContent = '0';
        }

        lucide.createIcons();
    };

    const applyFiltersAndSort = () => {
        let filtered = [...allSkillData];

        // Apply search filter
        const searchTerm = skillPlayerSearch.value.toLowerCase().trim();
        if (searchTerm) {
            filtered = filtered.filter(player =>
                player.username.toLowerCase().includes(searchTerm)
            );
        }

        // Apply level filter
        const levelFilterValue = levelFilter.value;
        if (levelFilterValue) {
            const minLevel = parseInt(levelFilterValue);
            filtered = filtered.filter(player => player.level >= minLevel);
        }

        // Apply XP filter
        const xpFilterValue = xpFilter.value;
        if (xpFilterValue) {
            const minXp = parseInt(xpFilterValue);
            filtered = filtered.filter(player => player.xp >= minXp);
        }

        // Apply sorting
        filtered.sort((a, b) => {
            let aValue, bValue;
            switch (currentSortField) {
                case 'rank':
                    aValue = a.rank;
                    bValue = b.rank;
                    break;
                case 'player':
                    aValue = a.username.toLowerCase();
                    bValue = b.username.toLowerCase();
                    break;
                case 'level':
                    aValue = a.level;
                    bValue = b.level;
                    break;
                case 'xp':
                    aValue = a.xp;
                    bValue = b.xp;
                    break;
                default:
                    aValue = a.rank;
                    bValue = b.rank;
            }

            if (currentSortDirection === 'asc') {
                return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
            } else {
                return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
            }
        });

        filteredData = filtered;
        currentPage = 1; // Reset to first page when filters change
        renderSkillHiscoresTable();
    };

    const renderSkillHiscoresTable = () => {
        const totalPages = Math.ceil(filteredData.length / itemsPerPage);
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const startIdx = (currentPage - 1) * itemsPerPage;
        const pageData = filteredData.slice(startIdx, startIdx + itemsPerPage);
        skillHiscoresBody.innerHTML = '';

        if (pageData.length === 0) {
            skillHiscoresBody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-slate-400">No players found matching your criteria.</td></tr>`;
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
                    <td class="px-6 py-3">${createPlayerLink(player.username)}</td>
                    <td class="px-6 py-3"><span class="font-medium">${player.level.toLocaleString()}</span></td>
                    <td class="px-6 py-3"><span class="font-medium">${formatNumber(player.xp)}</span></td>
                `;
                skillHiscoresBody.appendChild(row);
            });
            attachPlayerLinkListeners();
        }

        updatePaginationControls(totalPages);
        lucide.createIcons();
    };

    const updatePaginationControls = (totalPages) => {
        document.getElementById('skill-prev-page').disabled = (currentPage === 1);
        document.getElementById('skill-next-page').disabled = (currentPage >= totalPages);
        document.getElementById('skill-page-info').textContent = `Page ${currentPage} of ${totalPages || 1} (${filteredData.length.toLocaleString()} players)`;
    };

    const changePage = (direction) => {
        const totalPages = Math.ceil(filteredData.length / itemsPerPage);
        const newPage = currentPage + direction;
        if (newPage >= 1 && newPage <= totalPages) {
            currentPage = newPage;
            renderSkillHiscoresTable();
        }
    };

    const setSortField = (field) => {
        if (currentSortField === field) {
            currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            currentSortField = field;
            currentSortDirection = field === 'rank' ? 'asc' : 'desc'; // Default to desc for most fields except rank
        }
        applyFiltersAndSort();
        updateSortIndicators();
    };

    const updateSortIndicators = () => {
        // Reset all sort indicators
        document.querySelectorAll('[id^="sort-"] i[data-lucide="arrow-up-down"], [id^="sort-"] i[data-lucide="arrow-up"], [id^="sort-"] i[data-lucide="arrow-down"]').forEach(icon => {
            icon.setAttribute('data-lucide', 'arrow-up-down');
            icon.className = 'w-3 h-3 ml-2 opacity-50';
        });

        // Set active sort indicator
        const activeSortElement = document.getElementById(`sort-${currentSortField}`);
        if (activeSortElement) {
            const icon = activeSortElement.querySelector('i[data-lucide="arrow-up-down"]');
            if (icon) {
                icon.setAttribute('data-lucide', currentSortDirection === 'asc' ? 'arrow-up' : 'arrow-down');
                icon.className = 'w-3 h-3 ml-2 opacity-100 text-amber-400';
            }
        }
        lucide.createIcons();
    };

    // =================================================================
    // SEARCH & THEME
    // =================================================================

    const handleSearch = debounce((query) => {
        if (!query.trim()) {
            searchSuggestions.classList.add('hidden');
            return;
        }

        // Get random players from all skills for suggestions
        const allPlayers = new Set();
        if (cachedRankings && cachedRankings.skills) {
            Object.values(cachedRankings.skills).forEach(skillData => {
                skillData.slice(0, 20).forEach(player => allPlayers.add(player.username));
            });
        }

        const filteredUsers = Array.from(allPlayers)
            .filter(u => u.toLowerCase().includes(query.toLowerCase()))
            .slice(0, 5);

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
    // EXPORT FUNCTIONALITY
    // =================================================================

    const exportSkillData = () => {
        if (!currentSkill || !filteredData.length) {
            showToast('No data to export', 'warning');
            return;
        }

        const csvContent = [
            ['Rank', 'Player Name', 'Level', 'Experience'].join(','),
            ...filteredData.map(player => [
                player.rank,
                player.username,
                player.level,
                player.xp
            ].join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `osrs-${currentSkill.toLowerCase()}-hiscores.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        showToast(`${currentSkill} hiscores exported successfully!`, 'success');
    };

    // =================================================================
    // ENHANCED NAVBAR FUNCTIONALITY
    // =================================================================

    // Enhanced search functionality for the new modal
    const showSearchModal = () => {
        searchModal?.classList.remove('hidden');
        modalSearchInput?.focus();
        setTimeout(() => {
            const modalContent = searchModal?.querySelector('.bg-slate-900\\/95');
            modalContent?.classList.add('search-modal-content', 'active');
        }, 10);
    };

    const hideSearchModal = () => {
        const modalContent = searchModal?.querySelector('.bg-slate-900\\/95');
        modalContent?.classList.remove('active');
        setTimeout(() => {
            searchModal?.classList.add('hidden');
            if (modalSearchInput) modalSearchInput.value = '';
            modalSearchSuggestions?.classList.add('hidden');
        }, 300);
    };

    // Handle quick search functionality
    const handleQuickSearch = (value) => {
        if (value.trim().length >= 2) {
            // Redirect to main hiscores page with search query
            window.open(`index.html#${encodeURIComponent(value)}`, '_self');
        }
    };

    // Handle mobile search functionality
    const handleMobileSearch = (value) => {
        if (value.trim().length >= 2) {
            // Redirect to main hiscores page with search query
            window.open(`index.html#${encodeURIComponent(value)}`, '_self');
        }
    };

    // Enhanced search handler for modal
    const handleModalSearch = (value) => {
        if (value.trim().length >= 2) {
            debouncedModalSearch(value);
        } else {
            modalSearchSuggestions?.classList.add('hidden');
        }
    };

    // Debounced modal search
    const debouncedModalSearch = debounce(async (query) => {
        if (!query.trim()) {
            modalSearchSuggestions?.classList.add('hidden');
            return;
        }

        try {
            modalSearchSuggestions.innerHTML = `
                <div class="search-loading">
                    <div class="search-loading-dot"></div>
                    <div class="search-loading-dot"></div>
                    <div class="search-loading-dot"></div>
                    <span class="ml-2 text-slate-400">Searching players...</span>
                </div>
            `;
            modalSearchSuggestions?.classList.remove('hidden');

            // Search functionality - redirect to main page for player search
            const searchResult = `
                <div class="search-result-item cursor-pointer" onclick="window.open('index.html#${encodeURIComponent(query)}', '_self')">
                    <div class="search-result-name">Search for "${query}"</div>
                    <div class="search-result-details">
                        <span>Click to view player stats</span>
                    </div>
                </div>
            `;

            modalSearchSuggestions.innerHTML = searchResult;
            modalSearchSuggestions?.classList.remove('hidden');
        } catch (error) {
            console.error('Search error:', error);
            modalSearchSuggestions.innerHTML = '<div class="search-no-results">Search temporarily unavailable</div>';
            modalSearchSuggestions?.classList.remove('hidden');
        }
    }, 300);

    // Mobile menu toggle functionality
    const toggleMobileMenu = () => {
        if (!mobileMenu) return;

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

    // Set the skills page as active on load
    setActiveNavLink('skills');

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
                window.open(`index.html#${encodeURIComponent(query)}`, '_self');
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
                window.open(`index.html#${encodeURIComponent(query)}`, '_self');
            }
        }
    });

    // Mobile search input
    mobileSearchInput?.addEventListener('input', (e) => handleMobileSearch(e.target.value));
    mobileSearchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const query = e.target.value.trim();
            if (query) {
                window.open(`index.html#${encodeURIComponent(query)}`, '_self');
            }
        }
    });

    // Mobile menu toggle
    mobileMenuToggle?.addEventListener('click', toggleMobileMenu);

    // Navigation links
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const page = link.dataset.page;
            if (page === 'home') {
                e.preventDefault();
                window.open('index.html', '_self');
            } else if (page === 'leaderboard') {
                e.preventDefault();
                window.open('index.html#leaderboard', '_self');
            }
            // For skill hiscores page, we're already here
        });
    });

    mobileNavLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const page = link.dataset.page;
            if (page === 'home') {
                e.preventDefault();
                window.open('index.html', '_self');
            } else if (page === 'leaderboard') {
                e.preventDefault();
                window.open('index.html#leaderboard', '_self');
            }
            // Close mobile menu for any navigation
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
        if (e.key === 'Escape') hideSearch();
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

    // Navigation
    backToSkillsBtn?.addEventListener('click', () => window.location.hash = '');
    logoBtn?.addEventListener('click', () => window.open('index.html', '_self'));
    retryBtn?.addEventListener('click', () => {
        if (currentSkill) {
            loadSkillHiscores(currentSkill);
        } else {
            init();
        }
    });

    // Skill-specific controls
    refreshSkillData?.addEventListener('click', () => {
        if (currentSkill) {
            cachedRankings = null; // Force refresh
            loadSkillHiscores(currentSkill);
        }
    });
    exportSkillDataBtn?.addEventListener('click', exportSkillData);
    viewOverallBtn?.addEventListener('click', () => window.open('index.html', '_self'));
    randomSkillBtn?.addEventListener('click', () => {
        if (SKILLS.length > 0) {
            const randomSkill = SKILLS[Math.floor(Math.random() * SKILLS.length)];
            window.location.hash = encodeURIComponent(randomSkill);
        }
    });

    // Filtering and sorting
    skillPlayerSearch?.addEventListener('input', debounce(() => applyFiltersAndSort(), 300));
    levelFilter?.addEventListener('change', () => applyFiltersAndSort());
    xpFilter?.addEventListener('change', () => applyFiltersAndSort());
    itemsPerPageSelect?.addEventListener('change', (e) => {
        itemsPerPage = parseInt(e.target.value);
        currentPage = 1;
        renderSkillHiscoresTable();
    });

    // Pagination
    document.getElementById('skill-prev-page')?.addEventListener('click', () => changePage(-1));
    document.getElementById('skill-next-page')?.addEventListener('click', () => changePage(1));

    // Sorting
    document.getElementById('sort-rank')?.addEventListener('click', () => setSortField('rank'));
    document.getElementById('sort-player')?.addEventListener('click', () => setSortField('player'));
    document.getElementById('sort-level')?.addEventListener('click', () => setSortField('level'));
    document.getElementById('sort-xp')?.addEventListener('click', () => setSortField('xp'));

    // Route handling
    window.addEventListener('hashchange', handleRouteChange);

    // =================================================================
    // INITIALIZATION
    // =================================================================

    const displayLastUpdated = (isoString) => {
        if (!lastUpdated || !isoString) return;
        const date = new Date(isoString);
        const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        lastUpdated.innerHTML = `<i data-lucide="clock" class="w-3 h-3 mr-1.5"></i> Hiscores updated at ${timeString}`;
        lucide.createIcons();
    };

    const init = async () => {
        showView('loading');
        if (localStorage.theme === 'dark') document.documentElement.classList.add('dark');

        try {
            await fetchSkills();
            await fetchAndCacheRankings();
            renderSkillGrid();
            handleRouteChange();
        } catch (error) {
            // Error already handled by individual functions
            console.error('Initialization failed:', error);
        }
    };

    init();
});
