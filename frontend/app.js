// frontend/app.js

document.addEventListener('DOMContentLoaded', () => {
    // --- PAGE-SPECIFIC STATE ---
    const ITEMS_PER_PAGE_DEFAULT = 25;
    let currentPage = 1;
    let itemsPerPage = ITEMS_PER_PAGE_DEFAULT;
    let currentLeaderboardSortField = 'rank';
    let currentLeaderboardSortDirection = 'asc';
    let filteredLeaderboardData = [];
    let allLeaderboardData = [];
    let currentPlayer = null;

    // --- DOM ELEMENT REFERENCES ---
    const loadingState = document.getElementById('loading-state');
    const errorState = document.getElementById('error-state');
    const leaderboardView = document.getElementById('leaderboard-view');
    const playerView = document.getElementById('player-view');
    const leaderboardBody = document.getElementById('leaderboard-body');
    const leaderboardPlayerSearch = document.getElementById('leaderboard-player-search');
    const totalLevelFilter = document.getElementById('total-level-filter');
    const totalXpFilter = document.getElementById('total-xp-filter');
    const leaderboardItemsPerPage = document.getElementById('leaderboard-items-per-page');

    // --- VIEW MANAGEMENT ---
    const showView = (viewName) => {
        [loadingState, errorState, leaderboardView, playerView].forEach(v => v.style.display = 'none');
        document.getElementById('main-content').style.display = 'block';
        const viewMap = { loading: loadingState, error: errorState, leaderboard: leaderboardView, player: playerView };
        if (viewMap[viewName]) {
            viewMap[viewName].style.display = 'block';
            if (viewName === 'loading' || viewName === 'error') {
                document.getElementById('main-content').style.display = 'none';
            }
        }
    };

    const handleRouteChange = () => {
        const username = decodeURIComponent(window.location.hash.substring(1));
        if (username) {
            fetchUserStats(username);
            HiscoresApp.Navigation.setActive('player');
        } else {
            showView('leaderboard');
            renderLeaderboard();
            HiscoresApp.Navigation.setActive('leaderboard');
        }
    };

    const navigateToHome = () => { window.location.hash = ''; };

    // --- DATA FETCHING ---
    const fetchLeaderboard = async () => {
        showView('loading');
        try {
            const rankings = await HiscoresApp.ApiService.fetchAndCacheRankings(true);
            allLeaderboardData = rankings.totalLevel || [];
            applyLeaderboardFiltersAndSort();
            showView('leaderboard');
            document.getElementById('total-leaderboard-players').textContent = `${allLeaderboardData.length.toLocaleString()} players tracked`;
        } catch (error) { /* Error handled by shared function */ }
    };

    const fetchUserStats = async (username) => {
        showView('loading');
        try {
            await HiscoresApp.ApiService.fetchAndCacheRankings();
            const response = await fetch(`${HiscoresApp.API_BASE_URL}/api/users/${encodeURIComponent(username)}`);
            if (!response.ok) throw new Error(response.status === 404 ? `Player "${username}" not found` : `API Error: ${response.statusText}`);

            const userData = await response.json();
            currentPlayer = userData;
            renderUserDetail(userData);
            showView('player');
        } catch (error) {
            HiscoresApp.showToast(error.message, 'error');
            navigateToHome(); // Go back to leaderboard on error
        }
    };

    // --- RENDERING & UI LOGIC ---
    const applyLeaderboardFiltersAndSort = () => {
        const searchTerm = leaderboardPlayerSearch?.value.toLowerCase().trim();
        const minLevel = parseInt(totalLevelFilter?.value) || 0;
        const minXp = parseInt(totalXpFilter?.value) || 0;

        let filtered = allLeaderboardData.filter(p =>
            p.username.toLowerCase().includes(searchTerm) &&
            p.totalLevel >= minLevel &&
            p.totalXp >= minXp
        );

        const sortKeyMap = { 'rank': 'rank', 'player': 'username', 'level': 'totalLevel', 'xp': 'totalXp' };
        filtered = HiscoresApp.Sorter.apply(filtered, sortKeyMap[currentLeaderboardSortField], currentLeaderboardSortDirection);

        filteredLeaderboardData = filtered;
        currentPage = 1;
        renderLeaderboard();
    };

    const renderLeaderboard = () => {
        const totalPages = Math.ceil(filteredLeaderboardData.length / itemsPerPage);
        currentPage = Math.max(1, Math.min(currentPage, totalPages));
        const startIdx = (currentPage - 1) * itemsPerPage;
        const pageData = filteredLeaderboardData.slice(startIdx, startIdx + itemsPerPage);

        leaderboardBody.innerHTML = pageData.length === 0
            ? `<tr><td colspan="4" class="px-6 py-8 text-center text-slate-400">No players found.</td></tr>`
            : pageData.map(player => {
                let rankClass = '';
                if (player.rank === 1) rankClass = 'rank-gold';
                else if (player.rank === 2) rankClass = 'rank-silver';
                else if (player.rank === 3) rankClass = 'rank-bronze';
                return `<tr class="hover:bg-slate-700/30">
                    <td class="px-6 py-3"><span class="font-medium ${rankClass}">${player.rank.toLocaleString()}</span></td>
                    <td class="px-6 py-3"><button class="player-link font-medium hover:text-amber-400" data-username="${player.username}">${player.username}</button></td>
                    <td class="px-6 py-3 font-medium">${player.totalLevel.toLocaleString()}</td>
                    <td class="px-6 py-3 font-medium">${HiscoresApp.formatNumber(player.totalXp)}</td>
                </tr>`;
            }).join('');

        document.getElementById('prev-page').disabled = (currentPage === 1);
        document.getElementById('next-page').disabled = (currentPage >= totalPages);
        document.getElementById('page-info').textContent = `Page ${currentPage} of ${totalPages || 1} (${filteredLeaderboardData.length.toLocaleString()} players)`;

        attachPlayerLinkListeners();
    };

    // OSRS Combat Level Formula:
    // C = ⌊0.25(D + H + ⌊P/2⌋) + 0.325·max{A+S, ⌊R/2⌋ + R, ⌊M/2⌋ + M}⌋
    // where A=Attack, S=Strength, D=Defence, H=Hitpoints, R=Ranged, M=Magic, P=Prayer
    // ⌊x⌋ means "round down" (Math.floor)
    const calculateCombatLevel = (skills) => {
        const s = (name) => skills[name]?.level || (name === 'Hitpoints' ? 10 : 1);

        // Base combat level: 0.25 * (Defence + Hitpoints + floor(Prayer/2))
        const base = 0.25 * (s('Defence') + s('Hitpoints') + Math.floor(s('Prayer') / 2));

        // Combat style multipliers: 0.325 * max combat style
        const melee = 0.325 * (s('Attack') + s('Strength'));
        const ranged = 0.325 * (Math.floor(s('Ranged') / 2) + s('Ranged'));
        const magic = 0.325 * (Math.floor(s('Magic') / 2) + s('Magic'));

        return Math.floor(base + Math.max(melee, ranged, magic));
    };

    const renderUserDetail = (user) => {
        document.getElementById('player-name').textContent = user.username;
        const totalLevel = Object.values(user.skills).reduce((sum, skill) => sum + skill.level, 0);
        const totalXp = Object.values(user.skills).reduce((sum, skill) => sum + skill.xp, 0);
        const rankings = HiscoresApp.state.cachedRankings;

        document.getElementById('total-level').textContent = totalLevel.toLocaleString();
        document.getElementById('total-xp').textContent = HiscoresApp.formatNumber(totalXp);
        document.getElementById('combat-level').textContent = calculateCombatLevel(user.skills);

        const skillsTableBody = document.getElementById('skills-table-body');
        const overallRank = rankings?.totalLevel?.find(p => p.username === user.username)?.rank.toLocaleString() || 'N/A';

        const rows = [{ icon: 'trophy', name: 'Overall', rank: overallRank, level: totalLevel, xp: totalXp, isOverall: true }]
            .concat(HiscoresApp.state.skills.map(skillName => {
                const skill = user.skills[skillName];
                if (!skill) return null;
                const rank = rankings?.skills?.[skillName]?.find(p => p.username === user.username)?.rank.toLocaleString() || 'N/A';
                return { icon: HiscoresApp.getSkillIcon(skillName), name: skillName, rank, ...skill };
            }).filter(Boolean));

        skillsTableBody.innerHTML = rows.map(s => `
            <tr class="hover:bg-slate-700/20 ${s.isOverall ? 'border-b border-slate-600/50' : ''}">
                <td class="px-4 py-3"><div class="flex items-center">
                    <i data-lucide="${s.icon}" class="w-4 h-4 mr-3 text-amber-400"></i>
                    ${s.isOverall ? `<span class="font-bold text-white">${s.name}</span>` : `<button class="skill-link font-medium text-white hover:text-amber-400" data-skill="${s.name}">${s.name}</button>`}
                </div></td>
                <td class="px-4 py-3 font-medium text-slate-300">${s.rank}</td>
                <td class="px-4 py-3 font-bold text-white">${s.level.toLocaleString()}</td>
                <td class="px-4 py-3 font-bold text-white">${s.xp.toLocaleString()}</td>
            </tr>`).join('');

        attachSkillLinkListeners();
        lucide.createIcons();
    };

    const attachPlayerLinkListeners = () => document.querySelectorAll('.player-link').forEach(link => {
        link.addEventListener('click', e => window.location.hash = encodeURIComponent(e.currentTarget.dataset.username));
    });

    const attachSkillLinkListeners = () => document.querySelectorAll('.skill-link').forEach(link => {
        link.addEventListener('click', e => window.open(`skill-hiscores.html#${encodeURIComponent(e.currentTarget.dataset.skill)}`, '_blank'));
    });

    const exportLeaderboardData = () => {
        if (!filteredLeaderboardData.length) return HiscoresApp.showToast('No data to export', 'warning');
        const csv = ['Rank,Player,Total Level,Total XP', ...filteredLeaderboardData.map(p => [p.rank, p.username, p.totalLevel, p.totalXp].join(','))].join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        a.download = 'osrs-overall-hiscores.csv';
        a.click();
        URL.revokeObjectURL(a.href);
        HiscoresApp.showToast('Hiscores exported!', 'success');
    };

    // --- EVENT LISTENERS & INITIALIZATION ---
    const init = async () => {
        showView('loading');
        HiscoresApp.Theme.init();
        HiscoresApp.MobileMenu.init();
        HiscoresApp.Search.init({
            onPlayerSelect: (username) => {
                window.location.hash = encodeURIComponent(username);
                HiscoresApp.Search.hideModal();
            },
            onQuickSearch: (username) => {
                window.location.hash = encodeURIComponent(username);
            }
        });

        await HiscoresApp.ApiService.fetchSkills();
        try {
            const rankings = await HiscoresApp.ApiService.fetchAndCacheRankings();
            allLeaderboardData = rankings.totalLevel || [];
            applyLeaderboardFiltersAndSort();
            handleRouteChange();
        } catch (error) { /* Error handled by shared function */ }

        // --- Permanent Event Listeners ---
        window.addEventListener('hashchange', handleRouteChange);
        document.getElementById('logo-btn')?.addEventListener('click', navigateToHome);
        document.getElementById('back-btn')?.addEventListener('click', navigateToHome);
        document.getElementById('retry-btn')?.addEventListener('click', () => location.reload());
        document.getElementById('refresh-leaderboard')?.addEventListener('click', fetchLeaderboard);
        document.getElementById('refresh-player')?.addEventListener('click', () => { if (currentPlayer) fetchUserStats(currentPlayer.username); });

        // Leaderboard controls
        document.getElementById('prev-page').addEventListener('click', () => { currentPage--; renderLeaderboard(); });
        document.getElementById('next-page').addEventListener('click', () => { currentPage++; renderLeaderboard(); });
        leaderboardPlayerSearch?.addEventListener('input', HiscoresApp.debounce(applyLeaderboardFiltersAndSort, 300));
        [totalLevelFilter, totalXpFilter].forEach(el => el?.addEventListener('change', applyLeaderboardFiltersAndSort));
        leaderboardItemsPerPage?.addEventListener('change', (e) => { itemsPerPage = parseInt(e.target.value); applyLeaderboardFiltersAndSort(); });
        exportLeaderboard?.addEventListener('click', exportLeaderboardData);

        // Sorting
        ['rank', 'player', 'level', 'xp'].forEach(field => {
            document.getElementById(`sort-leaderboard-${field}`)?.addEventListener('click', () => {
                if (currentLeaderboardSortField === field) {
                    currentLeaderboardSortDirection = currentLeaderboardSortDirection === 'asc' ? 'desc' : 'asc';
                } else {
                    currentLeaderboardSortField = field;
                    currentLeaderboardSortDirection = field === 'rank' ? 'asc' : 'desc';
                }
                applyLeaderboardFiltersAndSort();
                HiscoresApp.Sorter.updateIndicators('sort-leaderboard-', currentLeaderboardSortField, currentLeaderboardSortDirection);
            });
        });
        HiscoresApp.Sorter.updateIndicators('sort-leaderboard-', currentLeaderboardSortField, currentLeaderboardSortDirection);

        // Nav Links
        document.querySelectorAll('.nav-link[data-page="leaderboard"], .mobile-nav-link[data-page="leaderboard"]').forEach(link => {
            link.addEventListener('click', (e) => { e.preventDefault(); navigateToHome(); });
        });
    };

    init();
});
