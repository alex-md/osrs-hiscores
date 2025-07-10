// frontend/shared.js

window.HiscoresApp = (() => {
    // --- SHARED STATE ---
    const state = {
        skills: [],
        cachedRankings: null,
        cachedUsers: [],
    };

    // --- CONSTANTS ---
    const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' ?
        'https://osrs-hiscores-clone.vs.workers.dev' :
        'https://osrs-hiscores-clone.vs.workers.dev';

    const SKILL_ICON_MAP = { 'Attack': 'sword', 'Strength': 'dumbbell', 'Defence': 'shield', 'Ranged': 'bow', 'Prayer': 'sparkles', 'Magic': 'wand', 'Runecrafting': 'zap', 'Construction': 'hammer', 'Hitpoints': 'heart', 'Agility': 'wind', 'Herblore': 'flask-conical', 'Thieving': 'key', 'Crafting': 'scissors', 'Fletching': 'target', 'Slayer': 'skull', 'Hunter': 'crosshair', 'Mining': 'pickaxe', 'Smithing': 'anvil', 'Fishing': 'fish', 'Cooking': 'chef-hat', 'Firemaking': 'flame', 'Woodcutting': 'axe', 'Farming': 'sprout' };

    // --- UTILITIES ---
    const formatNumber = (num) => num.toLocaleString();
    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    };
    const getSkillIcon = (skillName) => SKILL_ICON_MAP[skillName] || 'circle';

    // --- UI HELPERS ---
    const showToast = (message, type = 'info', duration = 4000) => {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icon = type === 'error' ? 'alert-circle' : type === 'success' ? 'check-circle' : type === 'warning' ? 'alert-triangle' : 'info';
        toast.innerHTML = `
            <div class="toast-content">
                <i data-lucide="${icon}"></i><span>${message}</span>
            </div>
            <button class="toast-close"><i data-lucide="x"></i></button>`;
        toastContainer.appendChild(toast);
        lucide.createIcons();
        setTimeout(() => toast.remove(), duration);
        toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    };

    const displayLastUpdated = (isoString) => {
        const lastUpdatedEl = document.getElementById('last-updated');
        if (!lastUpdatedEl || !isoString) return;
        const date = new Date(isoString);
        const minutes = date.getMinutes();
        const roundedMinutes = Math.floor(minutes / 10) * 10;
        date.setMinutes(roundedMinutes, 0, 0);
        const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        lastUpdatedEl.innerHTML = `<i data-lucide="clock" class="w-3 h-3 mr-1.5"></i> Hiscores updated at ${timeString}`;
        lucide.createIcons();
    };

    const handleApiError = (error, logMessage, displayMessage, toastMessage) => {
        console.error(logMessage, error);
        document.getElementById('error-message').textContent = `${displayMessage}: ${error.message}`;
        document.getElementById('loading-state').style.display = 'none';
        document.getElementById('main-content').style.display = 'none';
        document.getElementById('error-state').style.display = 'block';
        showToast(toastMessage, 'error');
    };

    // --- API SERVICE ---
    const ApiService = {
        fetchSkills: async () => {
            if (state.skills.length > 0) return state.skills;
            try {
                const response = await fetch(`${API_BASE_URL}/api/skills`);
                if (!response.ok) throw new Error('Failed to fetch skills');
                state.skills = (await response.json()).skills;
            } catch (error) {
                console.warn('Using fallback skill list.', error);
                state.skills = ['Attack', 'Strength', 'Defence', 'Ranged', 'Prayer', 'Magic', 'Runecrafting', 'Construction', 'Hitpoints', 'Agility', 'Herblore', 'Thieving', 'Crafting', 'Fletching', 'Slayer', 'Hunter', 'Mining', 'Smithing', 'Fishing', 'Cooking', 'Firemaking', 'Woodcutting', 'Farming'];
            }
            return state.skills;
        },
        fetchAndCacheRankings: async (force = false) => {
            if (state.cachedRankings && !force) return state.cachedRankings;
            try {
                const response = await fetch(`${API_BASE_URL}/api/skill-rankings`);
                if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
                const data = await response.json();
                state.cachedRankings = data;
                state.cachedUsers = data.totalLevel?.map(p => p.username) || [];
                if (data.lastUpdated) displayLastUpdated(data.lastUpdated);
                return data;
            } catch (error) {
                handleApiError(error, 'Error fetching rankings:', 'Could not load hiscores data', 'Failed to connect to the server.');
                throw error;
            }
        },
    };

    // --- UI MODULES ---
    const Theme = {
        init: () => {
            if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
            }
            document.getElementById('theme-toggle')?.addEventListener('click', Theme.toggle);
        },
        toggle: () => {
            const isDark = document.documentElement.classList.toggle('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        },
    };

    const MobileMenu = {
        init: () => {
            const toggleBtn = document.getElementById('mobile-menu-toggle');
            toggleBtn?.addEventListener('click', MobileMenu.toggle);
            document.addEventListener('click', (e) => {
                const menu = document.getElementById('mobile-menu');
                if (menu && !menu.contains(e.target) && !toggleBtn?.contains(e.target) && !menu.classList.contains('hidden')) {
                    MobileMenu.toggle();
                }
            });
        },
        toggle: () => {
            const menu = document.getElementById('mobile-menu');
            if (!menu) return;
            const isHidden = menu.classList.contains('hidden');
            if (isHidden) {
                menu.classList.remove('hidden');
                setTimeout(() => menu.classList.add('active'), 10);
            } else {
                menu.classList.remove('active');
                setTimeout(() => menu.classList.add('hidden'), 300);
            }
        },
    };

    const Navigation = {
        setActive: (currentPage) => {
            document.querySelectorAll('.nav-link, .mobile-nav-link').forEach(link => {
                link.classList.remove('active', 'text-white', 'bg-amber-500/20', 'border', 'border-amber-500/30', 'border-l-4', 'border-amber-500');
                link.classList.add('text-slate-300');
                if (link.dataset.page === currentPage) {
                    link.classList.add('active', 'text-white');
                    link.classList.remove('text-slate-300');
                    if (link.classList.contains('nav-link')) {
                        link.classList.add('bg-amber-500/20', 'border', 'border-amber-500/30');
                    } else { // mobile-nav-link
                        link.classList.add('bg-amber-500/20', 'border-l-4', 'border-amber-500');
                    }
                }
            });
        },
    };

    const Search = {
        init: (options) => {
            const { onPlayerSelect, onQuickSearch } = options;

            const modal = document.getElementById('search-modal');
            const overlay = document.getElementById('search-overlay');
            const closeBtn = document.getElementById('close-search-modal');
            const modalInput = document.getElementById('modal-search-input');
            const modalSuggestions = document.getElementById('modal-search-suggestions');
            const quickSearchInput = document.getElementById('quick-search-input');
            const mobileSearchInput = document.getElementById('mobile-search-input');

            const showModal = () => {
                modal?.classList.remove('hidden');
                modalInput?.focus();
                setTimeout(() => modal?.querySelector('.bg-slate-900\\/95')?.classList.add('active'), 10);
            };

            const hideModal = () => {
                modal?.querySelector('.bg-slate-900\\/95')?.classList.remove('active');
                setTimeout(() => {
                    modal?.classList.add('hidden');
                    if (modalInput) modalInput.value = '';
                    if (modalSuggestions) modalSuggestions.classList.add('hidden');
                }, 300);
            };
            Search.hideModal = hideModal;

            document.getElementById('search-player-btn')?.addEventListener('click', showModal);
            document.getElementById('mobile-search-btn')?.addEventListener('click', showModal);
            closeBtn?.addEventListener('click', hideModal);
            overlay?.addEventListener('click', hideModal);

            const handleEnter = (e, callback) => {
                if (e.key === 'Enter') {
                    const query = e.target.value.trim();
                    if (query) {
                        callback(query);
                        e.target.value = '';
                    }
                }
            };

            quickSearchInput?.addEventListener('keydown', (e) => handleEnter(e, onQuickSearch));
            mobileSearchInput?.addEventListener('keydown', (e) => {
                handleEnter(e, (query) => {
                    onQuickSearch(query);
                    MobileMenu.toggle();
                });
            });

            const debouncedModalSearch = debounce((query) => {
                if (!query.trim()) {
                    modalSuggestions.classList.add('hidden');
                    return;
                }
                const results = state.cachedUsers.filter(u => u.toLowerCase().includes(query.toLowerCase())).slice(0, 10);
                if (results.length > 0) {
                    modalSuggestions.innerHTML = results.map(username => `
                        <div class="search-result-item" data-username="${username}">
                            <div class="search-result-name">${username}</div>
                            <span class="text-xs text-slate-400">Click to view stats</span>
                        </div>`).join('');

                    modalSuggestions.querySelectorAll('.search-result-item').forEach(item => {
                        item.addEventListener('click', () => onPlayerSelect(item.dataset.username));
                    });
                } else {
                    modalSuggestions.innerHTML = '<div class="search-no-results">No players found matching your search</div>';
                }
                modalSuggestions.classList.remove('hidden');
            }, 300);

            modalInput?.addEventListener('input', (e) => debouncedModalSearch(e.target.value));
            modalInput?.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') hideModal();
                else if (e.key === 'Enter') {
                    const query = e.target.value.trim();
                    if (query) onPlayerSelect(query);
                }
            });
        },
        hideModal: () => { }, // Placeholder, will be defined in init
    };

    const Sorter = {
        apply: (data, sortField, sortDirection) => {
            return [...data].sort((a, b) => {
                const aValue = (typeof a[sortField] === 'string') ? a[sortField].toLowerCase() : a[sortField];
                const bValue = (typeof b[sortField] === 'string') ? b[sortField].toLowerCase() : b[sortField];
                if (sortDirection === 'asc') {
                    return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
                } else {
                    return bValue < aValue ? -1 : bValue > aValue ? 1 : 0;
                }
            });
        },
        updateIndicators: (prefix, sortField, sortDirection) => {
            document.querySelectorAll(`[id^="${prefix}"] i`).forEach(icon => {
                icon.setAttribute('data-lucide', 'arrow-up-down');
                icon.className = 'w-3 h-3 ml-2 opacity-50';
            });
            const activeSortElement = document.getElementById(`${prefix}${sortField}`);
            if (activeSortElement) {
                const icon = activeSortElement.querySelector('i');
                if (icon) {
                    icon.setAttribute('data-lucide', sortDirection === 'asc' ? 'arrow-up' : 'arrow-down');
                    icon.className = 'w-3 h-3 ml-2 opacity-100 text-amber-400';
                }
            }
            lucide.createIcons();
        }
    };

    return {
        state,
        API_BASE_URL,
        formatNumber,
        debounce,
        getSkillIcon,
        showToast,
        ApiService,
        Theme,
        MobileMenu,
        Navigation,
        Search,
        Sorter,
    };
})();
