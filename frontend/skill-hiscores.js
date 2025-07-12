// frontend/skill-hiscores.js

document.addEventListener('DOMContentLoaded', () => {
    // --- PAGE-SPECIFIC STATE ---
    const ITEMS_PER_PAGE_DEFAULT = 25;
    let currentPage = 1;
    let itemsPerPage = ITEMS_PER_PAGE_DEFAULT;
    let currentSkill = null;
    let currentSortField = 'rank';
    let currentSortDirection = 'asc';
    let filteredData = [];
    let allSkillData = [];

    // --- DOM ELEMENT REFERENCES ---
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const skillSelectionView = document.getElementById('skill-selection-view');
    const skillHiscoresView = document.getElementById('skill-hiscores-view');
    const skillHiscoresBody = document.getElementById('skill-hiscores-body');
    const skillPlayerSearch = document.getElementById('skill-player-search');
    const levelFilter = document.getElementById('level-filter');
    const xpFilter = document.getElementById('xp-filter');
    const itemsPerPageSelect = document.getElementById('items-per-page');

    // --- VIEW MANAGEMENT ---
    const showView = (viewName) => {
        [loadingState, errorState, skillSelectionView, skillHiscoresView].forEach(v => v.style.display = 'none');
        document.getElementById('main-content').style.display = 'block';
        const viewMap = { loading: loadingState, error: errorState, skillSelection: skillSelectionView, skillHiscores: skillHiscoresView };
        if (viewMap[viewName]) {
            viewMap[viewName].style.display = 'block';
            if (viewName === 'loading' || viewName === 'error') {
                document.getElementById('main-content').style.display = 'none';
            }
        }
    };

    const handleRouteChange = () => {
        const skillName = decodeURIComponent(window.location.hash.substring(1));
        if (skillName && HiscoresApp.state.skills.includes(skillName)) {
            loadSkillHiscores(skillName);
        } else {
            window.location.hash = '';
            showView('skillSelection');
        }
    };

    // --- DATA & RENDERING ---
    const loadSkillHiscores = async (skillName) => {
        showView('loading');
        try {
            const rankings = await HiscoresApp.ApiService.fetchAndCacheRankings();
            currentSkill = skillName;
            allSkillData = rankings.skills?.[skillName] || [];
            updateSkillHeader(skillName, allSkillData);
            applyFiltersAndSort();
            showView('skillHiscores');
        } catch (error) { /* Error handled by shared function */ }
    };

    const SKILL_CATEGORIES = { combat: ['Attack', 'Strength', 'Defence', 'Ranged', 'Prayer', 'Magic', 'Hitpoints'], gathering: ['Mining', 'Fishing', 'Woodcutting', 'Farming', 'Hunter'], artisan: ['Smithing', 'Cooking', 'Fletching', 'Crafting', 'Firemaking', 'Herblore'], support: ['Runecrafting', 'Construction', 'Agility', 'Thieving', 'Slayer'] };


    const renderSkillGrid = () => {
        Object.entries(SKILL_CATEGORIES).forEach(([category, skills]) => {
            const container = document.getElementById(`${category}-skills`);
            if (!container) return;
            container.innerHTML = skills
                .filter(skill => HiscoresApp.state.skills.includes(skill))
                .map(skill => `
                    <button class="osrs-button" data-skill="${skill}">
                        <span class="text-osrs-text-light font-medium text-sm group-hover:text-osrs-gold">${skill}</span>
                    </button>`).join('');
            container.querySelectorAll('.osrs-button').forEach(btn =>
                btn.addEventListener('click', () => window.location.hash = encodeURIComponent(btn.dataset.skill))
            );
        });
    };

    const updateSkillHeader = (skillName, data) => {
        document.getElementById('current-skill-name').textContent = skillName;
        document.getElementById('total-players-count').textContent = `${data.length.toLocaleString()} players tracked`;

        if (data.length > 0) {
            const topPlayer = data[0];
            const topPlayerEl = document.getElementById('top-player-name');
            const topPlayerLevelEl = document.getElementById('top-player-level');
            const highestXpEl = document.getElementById('highest-xp');
            const highestXpPlayerEl = document.getElementById('highest-xp-player');
            const avgLevelEl = document.getElementById('average-level');

            if (topPlayerEl) topPlayerEl.textContent = topPlayer.username;
            if (topPlayerLevelEl) topPlayerLevelEl.textContent = `Level ${topPlayer.level}`;

            // Find highest XP
            const highestXpPlayer = data.reduce((max, player) => player.xp > max.xp ? player : max, data[0]);
            if (highestXpEl) highestXpEl.textContent = HiscoresApp.formatNumber(highestXpPlayer.xp);
            if (highestXpPlayerEl) highestXpPlayerEl.textContent = highestXpPlayer.username;

            // Calculate average level of top 100
            const top100 = data.slice(0, 100);
            const avgLevel = Math.round(top100.reduce((sum, p) => sum + p.level, 0) / top100.length);
            if (avgLevelEl) avgLevelEl.textContent = avgLevel;
        }
    };

    const applyFiltersAndSort = () => {
        const searchTerm = skillPlayerSearch.value.toLowerCase().trim();
        const minLevel = parseInt(levelFilter.value) || 0;
        const minXp = parseInt(xpFilter.value) || 0;

        let filtered = allSkillData.filter(p =>
            p.username.toLowerCase().includes(searchTerm) &&
            p.level >= minLevel &&
            p.xp >= minXp
        );

        filtered = HiscoresApp.Sorter.apply(filtered, currentSortField, currentSortDirection);
        filteredData = filtered;
        currentPage = 1;
        renderSkillHiscoresTable();
    };

    const renderSkillHiscoresTable = () => {
        const totalPages = Math.ceil(filteredData.length / itemsPerPage);
        currentPage = Math.max(1, Math.min(currentPage, totalPages));
        const startIdx = (currentPage - 1) * itemsPerPage;
        const pageData = filteredData.slice(startIdx, startIdx + itemsPerPage);

        skillHiscoresBody.innerHTML = pageData.length === 0
            ? `<tr><td colspan="4" class="px-4 py-8 text-center text-osrs-brown">No players found.</td></tr>`
            : pageData.map(player => {
                let rankClass = '';
                if (player.rank === 1) rankClass = 'text-yellow-600 font-bold';
                else if (player.rank === 2) rankClass = 'text-gray-500 font-bold';
                else if (player.rank === 3) rankClass = 'text-yellow-700 font-bold';

                return `<tr class="border-t-2 border-osrs-brown/50 hover:bg-osrs-parchment-dark">
                    <td class="px-4 py-2"><span class="font-medium ${rankClass}">${player.rank.toLocaleString()}</span></td>
                    <td class="px-4 py-2">
                        <div class="flex items-center">
                            <div class="w-6 h-6 mr-2 bg-black/20 border border-black/50 rounded-sm overflow-hidden flex-shrink-0">
                                <img src="${HiscoresApp.AvatarService.getAvatarUrl(player.username)}" 
                                     alt="${player.username}'s avatar" 
                                     class="w-full h-full object-cover"
                                     onerror="this.style.display='none'">
                            </div>
                            <button class="player-link font-medium hover:text-blue-700 underline" data-username="${player.username}">${player.username}</button>
                        </div>
                    </td>
                    <td class="px-4 py-2 font-medium">${player.level.toLocaleString()}</td>
                    <td class="px-4 py-2 font-medium">${HiscoresApp.formatNumber(player.xp)}</td>
                </tr>`;
            }).join('');

        document.querySelectorAll('.player-link').forEach(link => {
            link.addEventListener('click', e => window.open(`index.html#${encodeURIComponent(e.currentTarget.dataset.username)}`, '_blank'));
        });

        document.getElementById('skill-prev-page').disabled = (currentPage === 1);
        document.getElementById('skill-next-page').disabled = (currentPage >= totalPages);
        document.getElementById('skill-page-info').textContent = `Page ${currentPage} of ${totalPages || 1} (${filteredData.length.toLocaleString()} players)`;
    };

    // --- EVENT LISTENERS & INITIALIZATION ---
    const init = async () => {
        showView('loading');
        HiscoresApp.Theme.init();
        HiscoresApp.MobileMenu.init();
        HiscoresApp.Navigation.setActive('skills');
        HiscoresApp.Search.init({
            onPlayerSelect: (username) => window.open(`index.html#${encodeURIComponent(username)}`),
            onQuickSearch: (username) => window.open(`index.html#${encodeURIComponent(username)}`)
        });

        try {
            await HiscoresApp.ApiService.fetchSkills();
            await HiscoresApp.ApiService.fetchAndCacheRankings();
            renderSkillGrid();
            handleRouteChange();
        } catch (error) { /* Error handled by shared function */ }

        // --- Permanent Event Listeners ---
        window.addEventListener('hashchange', handleRouteChange);
        document.getElementById('back-to-skills-btn')?.addEventListener('click', () => window.location.hash = '');
        document.getElementById('retry-btn')?.addEventListener('click', () => location.reload());

        // Filtering & Pagination
        skillPlayerSearch?.addEventListener('input', HiscoresApp.debounce(applyFiltersAndSort, 300));
        [levelFilter, xpFilter].forEach(el => el?.addEventListener('change', applyFiltersAndSort));
        itemsPerPageSelect?.addEventListener('change', (e) => { itemsPerPage = parseInt(e.target.value); applyFiltersAndSort(); });
        document.getElementById('skill-prev-page')?.addEventListener('click', () => { currentPage--; renderSkillHiscoresTable(); });
        document.getElementById('skill-next-page')?.addEventListener('click', () => { currentPage++; renderSkillHiscoresTable(); });

        // Sorting
        ['rank', 'player', 'level', 'xp'].forEach(field => {
            document.getElementById(`sort-${field}`)?.addEventListener('click', () => {
                if (currentSortField === field) {
                    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    currentSortField = field;
                    currentSortDirection = field === 'rank' ? 'asc' : 'desc';
                }
                applyFiltersAndSort();
                HiscoresApp.Sorter.updateIndicators('sort-', currentSortField, currentSortDirection);
            });
        });
        HiscoresApp.Sorter.updateIndicators('sort-', currentSortField, currentSortDirection);
    };

    init();
});
