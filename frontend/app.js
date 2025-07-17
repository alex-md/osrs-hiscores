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
    const totalLevelFilter = null; // Remove filters for simplified UI
    const totalXpFilter = null;
    const leaderboardItemsPerPage = null; // Simplified UI, no items per page selection

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
        const searchTerm = leaderboardPlayerSearch?.value.toLowerCase().trim() || '';

        let filtered = allLeaderboardData.filter(p =>
            p.username.toLowerCase().includes(searchTerm)
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
            ? `<tr><td colspan="4" class="px-4 py-8 text-center text-osrs-brown">No players found.</td></tr>`
            : pageData.map(player => {
                let rankClass = '';
                if (player.rank === 1) rankClass = 'text-yellow-600 font-bold';
                else if (player.rank === 2) rankClass = 'text-gray-500 font-bold';
                else if (player.rank === 3) rankClass = 'text-yellow-700 font-bold';

                return `<tr class="border-t-2 border-osrs-brown/50 hover:bg-osrs-parchment-dark">
                    <td class="px-4 py-2"><span class="font-medium ${rankClass}">${player.rank.toLocaleString()}</span></td>
                    <td class="px-4 py-2">
                        <button class="player-link font-medium hover:text-blue-700 underline" data-username="${player.username}">${player.username}</button>
                    </td>
                    <td class="px-4 py-2 font-medium">${player.totalLevel.toLocaleString()}</td>
                    <td class="px-4 py-2 font-medium">${HiscoresApp.formatNumber(player.totalXp)}</td>
                </tr>`;
            }).join('');

        document.getElementById('prev-page').disabled = (currentPage === 1);
        document.getElementById('next-page').disabled = (currentPage >= totalPages);
        document.getElementById('page-info').textContent = `Page ${currentPage} of ${totalPages || 1} (${filteredLeaderboardData.length.toLocaleString()} players)`;

        attachPlayerLinkListeners();
    };


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

        // Load player avatar
        const avatarImg = document.getElementById('player-avatar');
        if (avatarImg) {
            HiscoresApp.AvatarService.loadAvatar(user.username, avatarImg);
        }

        const totalLevel = Object.values(user.skills).reduce((sum, skill) => sum + skill.level, 0);
        const totalXp = Object.values(user.skills).reduce((sum, skill) => sum + skill.xp, 0);
        const rankings = HiscoresApp.state.cachedRankings;

        document.getElementById('total-level').textContent = totalLevel.toLocaleString();
        document.getElementById('total-xp').textContent = HiscoresApp.formatNumber(totalXp);
        document.getElementById('combat-level').textContent = calculateCombatLevel(user.skills);

        // Display account creation date if available
        if (user.createdAt) {
            const createdDate = new Date(user.createdAt);
            const now = new Date();
            const daysDiff = Math.floor((now - createdDate) / (1000 * 60 * 60 * 24));
            
            let accountAgeText;
            if (daysDiff === 0) {
                accountAgeText = 'Today';
            } else if (daysDiff === 1) {
                accountAgeText = '1 day ago';
            } else if (daysDiff < 30) {
                accountAgeText = `${daysDiff} days ago`;
            } else if (daysDiff < 365) {
                const months = Math.floor(daysDiff / 30);
                accountAgeText = months === 1 ? '1 month ago' : `${months} months ago`;
            } else {
                const years = Math.floor(daysDiff / 365);
                accountAgeText = years === 1 ? '1 year ago' : `${years} years ago`;
            }

            const accountCreationElement = document.getElementById('account-creation');
            if (accountCreationElement) {
                accountCreationElement.textContent = accountAgeText;
            }
        }

        const skillsTableBody = document.getElementById('skills-table-body');
        const overallRank = rankings?.totalLevel?.find(p => p.username === user.username)?.rank.toLocaleString() || 'N/A';

        const skillsWithIcons = HiscoresApp.state.skills.map(skillName => {
            const skill = user.skills[skillName];
            if (!skill) return null;
            const rank = rankings?.skills?.[skillName]?.find(p => p.username === user.username)?.rank.toLocaleString() || 'N/A';

            // Get skill icon URL from OSRS wiki
            const iconUrl = `https://oldschool.runescape.wiki/images/${skillName}_icon.png`;

            return { iconUrl, name: skillName, rank, ...skill };
        }).filter(Boolean);

        const rows = [{
            iconUrl: 'https://oldschool.runescape.wiki/images/Overall_icon.png',
            name: 'Overall',
            rank: overallRank,
            level: totalLevel,
            xp: totalXp,
            isOverall: true
        }].concat(skillsWithIcons);

        skillsTableBody.innerHTML = rows.map(s => `
            <tr class="border-t-2 border-osrs-brown/50 hover:bg-osrs-parchment-dark ${s.isOverall ? 'border-b-4 border-osrs-brown-dark' : ''}">
                <td class="px-4 py-2"><div class="flex items-center">
                    <img src="${s.iconUrl}" alt="${s.name}" class="w-5 h-5 mr-3" onerror="this.style.display='none'">
                    ${s.isOverall ?
                `<span class="font-bold text-osrs-text-dark">${s.name}</span>` :
                `<button class="skill-link font-medium text-osrs-text-dark hover:text-blue-700 underline" data-skill="${s.name}">${s.name}</button>`
            }
                </div></td>
                <td class="px-4 py-2 font-medium">${s.rank}</td>
                <td class="px-4 py-2 font-bold">${s.level.toLocaleString()}</td>
                <td class="px-4 py-2 font-bold">${s.xp.toLocaleString()}</td>
            </tr>`).join('');

        attachSkillLinkListeners();
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

        // Sorting - simplify the sort button IDs to match the HTML
        ['rank', 'player', 'level', 'xp'].forEach(field => {
            const sortId = `sort-${field}`;
            const sortElement = document.getElementById(sortId);
            if (sortElement) {
                sortElement.addEventListener('click', () => {
                    if (currentLeaderboardSortField === field) {
                        currentLeaderboardSortDirection = currentLeaderboardSortDirection === 'asc' ? 'desc' : 'asc';
                    } else {
                        currentLeaderboardSortField = field;
                        currentLeaderboardSortDirection = field === 'rank' ? 'asc' : 'desc';
                    }
                    applyLeaderboardFiltersAndSort();
                    HiscoresApp.Sorter.updateIndicators('sort-', currentLeaderboardSortField, currentLeaderboardSortDirection);
                });
            }
        });
        HiscoresApp.Sorter.updateIndicators('sort-', currentLeaderboardSortField, currentLeaderboardSortDirection);

        // Nav Links
        document.querySelectorAll('.nav-link[data-page="leaderboard"], .mobile-nav-link[data-page="leaderboard"]').forEach(link => {
            link.addEventListener('click', (e) => { e.preventDefault(); navigateToHome(); });
        });
    };

    init();
});
