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
    const getSkillColor = (skillName) => { const map = { 'Attack': 'from-red-400 to-red-600', 'Strength': 'from-green-400 to-green-600', 'Defence': 'from-blue-400 to-blue-600', 'Ranged': 'from-emerald-400 to-emerald-600', 'Prayer': 'from-yellow-400 to-yellow-600', 'Magic': 'from-purple-400 to-purple-600', 'Runecrafting': 'from-indigo-400 to-indigo-600', 'Construction': 'from-orange-400 to-orange-600', 'Hitpoints': 'from-pink-400 to-pink-600', 'Agility': 'from-cyan-400 to-cyan-600', 'Herblore': 'from-lime-400 to-lime-600', 'Thieving': 'from-violet-400 to-violet-600', 'Crafting': 'from-rose-400 to-rose-600', 'Fletching': 'from-teal-400 to-teal-600', 'Slayer': 'from-red-500 to-red-700', 'Hunter': 'from-amber-400 to-amber-600', 'Mining': 'from-gray-400 to-gray-600', 'Smithing': 'from-orange-500 to-orange-700', 'Fishing': 'from-sky-400 to-sky-600', 'Cooking': 'from-red-400 to-pink-600', 'Firemaking': 'from-orange-400 to-red-600', 'Woodcutting': 'from-green-500 to-green-700', 'Farming': 'from-green-400 to-lime-600' }; return map[skillName] || 'from-amber-400 to-orange-500'; };

    const renderSkillGrid = () => {
        Object.entries(SKILL_CATEGORIES).forEach(([category, skills]) => {
            const container = document.getElementById(`${category}-skills`);
            if (!container) return;
            container.innerHTML = skills
                .filter(skill => HiscoresApp.state.skills.includes(skill))
                .map(skill => `
                    <button class="skill-button" data-skill="${skill}">
                        <div class="w-12 h-12 bg-gradient-to-br ${getSkillColor(skill)} rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                            <i data-lucide="${HiscoresApp.getSkillIcon(skill)}" class="w-6 h-6 text-white"></i>
                        </div>
                        <span class="text-white font-medium text-sm group-hover:text-amber-300">${skill}</span>
                    </button>`).join('');
            container.querySelectorAll('.skill-button').forEach(btn =>
                btn.addEventListener('click', () => window.location.hash = encodeURIComponent(btn.dataset.skill))
            );
        });
        lucide.createIcons();
    };

    const updateSkillHeader = (skillName, data) => {
        document.getElementById('current-skill-name').textContent = skillName;
        document.getElementById('skill-icon').setAttribute('data-lucide', HiscoresApp.getSkillIcon(skillName));
        document.getElementById('skill-icon-container').className = `w-16 h-16 bg-gradient-to-br ${getSkillColor(skillName)} rounded-2xl flex items-center justify-center mr-4 shadow-lg animate-glow`;
        document.getElementById('total-players-count').textContent = `${data.length.toLocaleString()} players tracked`;

        if (data.length > 0) {
            const topPlayer = data[0];
            document.getElementById('top-player-name').textContent = topPlayer.username;
            document.getElementById('top-player-level').textContent = `Level ${topPlayer.level} (${HiscoresApp.formatNumber(topPlayer.xp)} XP)`;
        }
        lucide.createIcons();
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
            ? `<tr><td colspan="4" class="px-6 py-8 text-center text-slate-400">No players found.</td></tr>`
            : pageData.map(player => {
                let rankClass = '';
                if (player.rank === 1) rankClass = 'rank-gold';
                else if (player.rank === 2) rankClass = 'rank-silver';
                else if (player.rank === 3) rankClass = 'rank-bronze';
                return `<tr class="hover:bg-slate-700/30">
                    <td class="px-6 py-3"><span class="font-medium ${rankClass}">${player.rank.toLocaleString()}</span></td>
                    <td class="px-6 py-3"><button class="player-link font-medium hover:text-amber-400" data-username="${player.username}">${player.username}</button></td>
                    <td class="px-6 py-3 font-medium">${player.level.toLocaleString()}</td>
                    <td class="px-6 py-3 font-medium">${HiscoresApp.formatNumber(player.xp)}</td>
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
        document.getElementById('refresh-skill-data')?.addEventListener('click', () => { if (currentSkill) loadSkillHiscores(currentSkill); });

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
