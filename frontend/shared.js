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



    // --- UTILITIES ---
    const formatNumber = (num) => num.toLocaleString();
    const debounce = (func, delay) => {
        let timeoutId;
        return (...args) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func.apply(this, args), delay);
        };
    };


    // --- UI HELPERS ---
    const showToast = (message, type = 'info', duration = 4000) => {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <div class="toast-content">
                <span>${message}</span>
            </div>
            <button class="toast-close">X</button>`;
        toastContainer.appendChild(toast);
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
        lastUpdatedEl.innerHTML = `Hiscores updated at ${timeString}`;
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
            // Always use dark theme for this project
            document.documentElement.classList.add('dark');
        },
        toggle: () => {
            // No-op for now since we only support dark theme
        },
    };

    const MobileMenu = {
        init: () => {
            const toggleBtn = document.getElementById('mobile-menu-toggle');
            const menu = document.getElementById('mobile-menu');

            if (toggleBtn && menu) {
                toggleBtn.addEventListener('click', MobileMenu.toggle);
                // Close menu when clicking outside
                document.addEventListener('click', (e) => {
                    if (!menu.contains(e.target) && !toggleBtn.contains(e.target) && !menu.classList.contains('hidden')) {
                        MobileMenu.toggle();
                    }
                });
            }
        },
        toggle: () => {
            const menu = document.getElementById('mobile-menu');
            if (menu) {
                menu.classList.toggle('hidden');
            }
        },
    };

    const Navigation = {
        setActive: (currentPage) => {
            // Simple navigation management - could be expanded later
            console.log(`Active page: ${currentPage}`);
        },
    };

    const Search = {
        init: (options) => {
            const { onPlayerSelect, onQuickSearch } = options;

            const modal = document.getElementById('search-modal');
            const overlay = document.getElementById('search-overlay');
            const closeBtn = document.getElementById('close-search-modal');
            const modalInput = document.getElementById('modal-search-input');

            const showModal = () => {
                if (modal) {
                    modal.classList.remove('hidden');
                    if (modalInput) modalInput.focus();
                }
            };

            const hideModal = () => {
                if (modal) {
                    modal.classList.add('hidden');
                    if (modalInput) modalInput.value = '';
                }
            };
            Search.hideModal = hideModal;

            // Basic search functionality
            const searchBtns = [
                document.getElementById('search-player-btn'),
                document.getElementById('mobile-search-btn')
            ];

            searchBtns.forEach(btn => {
                if (btn) btn.addEventListener('click', showModal);
            });

            if (closeBtn) closeBtn.addEventListener('click', hideModal);
            if (overlay) overlay.addEventListener('click', hideModal);

            if (modalInput) {
                modalInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        hideModal();
                    } else if (e.key === 'Enter') {
                        const query = e.target.value.trim();
                        if (query && onPlayerSelect) {
                            onPlayerSelect(query);
                            hideModal();
                        }
                    }
                });
            }
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
            document.querySelectorAll(`[id^="${prefix}"]`).forEach(el => {
                el.classList.remove('sorted-asc', 'sorted-desc');
            });
            const activeSortElement = document.getElementById(`${prefix}${sortField}`);
            if (activeSortElement) {
                activeSortElement.classList.add(sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
            }
        }
    };    // --- AVATAR SERVICE ---
    const AvatarService = {
        getAvatarUrl: (username) => {
            return `${API_BASE_URL}/api/avatars/${encodeURIComponent(username)}/svg`;
        },
        
        // Get direct DiceBear URL for faster loading (bypassing our proxy)
        getDirectAvatarUrl: (username, size = 64) => {
            const seed = encodeURIComponent(username);
            // Use pixel-art style by default for OSRS feel, with username hash for variety
            const styles = ['pixel-art', 'adventurer', 'avataaars', 'bottts', 'fun-emoji'];
            let hash = 0;
            for (let i = 0; i < username.length; i++) {
                hash = ((hash << 5) - hash) + username.charCodeAt(i);
                hash = hash & hash;
            }
            const styleIndex = Math.abs(hash) % styles.length;
            const style = styles[styleIndex];
            
            return `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}&size=${size}`;
        },
        
        loadAvatar: (username, imgElement, fallbackSrc = null) => {
            if (!imgElement || !username) return;
            
            // Try direct DiceBear URL first for better performance
            const directUrl = AvatarService.getDirectAvatarUrl(username);
            const proxyUrl = AvatarService.getAvatarUrl(username);
            
            let attempts = 0;
            const maxAttempts = 2;
            
            const tryLoadAvatar = (url) => {
                imgElement.onload = () => {
                    imgElement.style.display = 'block';
                };
                
                imgElement.onerror = () => {
                    attempts++;
                    if (attempts === 1) {
                        // Try proxy URL if direct fails
                        tryLoadAvatar(proxyUrl);
                    } else if (attempts < maxAttempts && fallbackSrc) {
                        // Try fallback if provided
                        imgElement.src = fallbackSrc;
                        imgElement.style.display = 'block';
                    } else {
                        // Create a simple text-based avatar as last resort
                        const canvas = document.createElement('canvas');
                        canvas.width = 64;
                        canvas.height = 64;
                        const ctx = canvas.getContext('2d');
                        
                        // Background
                        ctx.fillStyle = '#5d4c38';
                        ctx.fillRect(0, 0, 64, 64);
                        
                        // Initial
                        ctx.fillStyle = '#ffb700';
                        ctx.font = 'bold 24px Arial';
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(username.charAt(0).toUpperCase(), 32, 32);
                        
                        imgElement.src = canvas.toDataURL();
                        imgElement.style.display = 'block';
                    }
                };
                
                imgElement.src = url;
            };
            
            tryLoadAvatar(directUrl);
        },
        
        createAvatarImg: (username, className = '', size = 32) => {
            const img = document.createElement('img');
            img.className = className;
            img.style.width = `${size}px`;
            img.style.height = `${size}px`;
            img.alt = `${username}'s avatar`;
            img.title = username;
            
            AvatarService.loadAvatar(username, img);
            return img;
        }
    };

    return {
        state,
        API_BASE_URL,
        formatNumber,
        debounce,
        showToast,
        ApiService,
        AvatarService,
        Theme,
        MobileMenu,
        Navigation,
        Search,
        Sorter,
    };
})();
