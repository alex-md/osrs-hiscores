// Frontend main application logic for OSRS Hiscores clone
const LEADERBOARD_LIMIT = 500; // configurable cap for initial view
const cache = { leaderboard: null, users: null, skillRankings: null, usersFetchedAt: 0 };

// fetchJSON & API_BASE now provided by common.js
async function loadLeaderboard(force = false) { if (cache.leaderboard && !force) return cache.leaderboard; cache.leaderboard = await fetchJSON(`/api/leaderboard?limit=${LEADERBOARD_LIMIT}`); return cache.leaderboard; }
async function loadUsers(force = false) { if (cache.users && !force && (Date.now() - cache.usersFetchedAt < 60_000)) return cache.users; cache.users = await fetchJSON('/api/users'); cache.usersFetchedAt = Date.now(); return cache.users; }
async function loadSkillRankings(force = false) {
    if (cache.skillRankings && !force) return cache.skillRankings;
    cache.skillRankings = await fetchJSON('/api/skill-rankings');
    return cache.skillRankings;
}

function getUserSkillRank(skillRankings, username, skill) {
    if (!skillRankings || !skillRankings.rankings || !skillRankings.rankings[skill]) return null;
    const skillData = skillRankings.rankings[skill];
    const playerData = skillData.find(p => p.username === username);
    return playerData ? playerData.rank : null;
}

// ---------- Views ----------
function renderHomeView() {
    const root = $('#viewRoot');
    root.innerHTML = '';

    const section = el('section', 'flex flex-col gap-6');

    // Header section
    const headerDiv = el('div', 'flex items-center justify-between flex-wrap gap-4');
    headerDiv.appendChild(el('h2', 'text-2xl font-bold flex items-center gap-2 text-foreground', [
        text('🏆 Overall Leaderboard')
    ]));

    const statsDiv = el('div', 'flex gap-3 flex-wrap text-muted text-sm');
    statsDiv.appendChild(el('div', 'badge', [text('Top 100 Players')]));
    section.appendChild(headerDiv);

    // Table wrapper with OSRS styling
    const tableWrap = el('div', 'osrs-table');
    const table = el('table', 'min-w-full');
    table.innerHTML = `<thead><tr><th>Rank</th><th class="text-left">Player</th><th>Total Level</th><th>Total Experience</th></tr></thead><tbody></tbody>`;
    tableWrap.appendChild(table);
    section.appendChild(tableWrap);
    root.appendChild(section);

    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-8">⏳ Loading leaderboard...</td></tr>';

    loadLeaderboard().then(data => {
        tbody.innerHTML = '';
        data.players.slice(0, 100).forEach((p, index) => {
            const tr = document.createElement('tr');

            // Add rank indicators for top 3
            let rankDisplay = p.rank;
            if (p.rank === 1) rankDisplay = '🥇 ' + p.rank;
            else if (p.rank === 2) rankDisplay = '🥈 ' + p.rank;
            else if (p.rank === 3) rankDisplay = '🥉 ' + p.rank;

            if (p.rank === 1) tr.classList.add('rank-1');
            else if (p.rank === 2) tr.classList.add('rank-2');
            else if (p.rank === 3) tr.classList.add('rank-3');

            tr.innerHTML = `
                <td class="text-center font-bold">${rankDisplay}</td>
                <td>
                    <button class="username-link" data-user="${p.username}" aria-label="View ${p.username} stats">${p.username}</button>
                </td>
                <td class="text-center skill-level">${p.totalLevel}</td>
                <td class="text-right skill-xp">${p.totalXP.toLocaleString()}</td>
            `;
            tbody.appendChild(tr);
        });

        // Update stats
        if (data.totalPlayers > 0) {
            statsDiv.innerHTML = '';
            statsDiv.appendChild(el('div', 'badge', [text(`${data.totalPlayers} total players`)]));
            headerDiv.appendChild(statsDiv);
        }
    }).catch(e => {
        const htmlLike = /Received HTML|Unexpected content-type/.test(e.message);
        const hint = htmlLike ? '<div class="mt-4 text-sm text-left max-w-lg mx-auto p-4 bg-layer2 rounded border-l-4 border-accent">⚠️ <strong>Backend not mounted:</strong><br>Verify _worker.js is present at repo root and KV binding HISCORES_KV is configured in Pages project settings. Also ensure deployment finished successfully.<br><br><code class="bg-layer p-1 rounded text-xs">/api/health</code> should return JSON.</div>' : '';
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8"><div class="text-danger font-semibold">❌ ${e.message}</div>${hint}</td></tr>`;
    });
}

async function loadUser(username) { return fetchJSON('/api/users/' + encodeURIComponent(username)); }

function renderUserView(username) {
    const root = $('#viewRoot');
    root.innerHTML = '<div class="text-center text-muted py-8">⏳ Loading player data...</div>';

    Promise.all([
        loadUser(username),
        loadSkillRankings(),
        loadLeaderboard().catch(() => null)
    ]).then(([user, skillRankings, leaderboard]) => {
        const wrap = el('div', 'flex flex-col gap-8');

        // User header with enhanced styling
        const headerSection = el('div', 'bg-layer2 p-6 rounded-lg border-2 border-border-dark');
        const headerContent = el('div', 'flex items-center justify-between flex-wrap gap-4');

        const userInfo = el('div', 'flex items-center gap-3 flex-wrap');
        userInfo.appendChild(el('h3', 'font-bold text-foreground', [text(`⚔️ ${user.username}`)]));

        // Calculate combat level (simplified)
        const attack = user.skills.attack.level;
        const strength = user.skills.strength.level;
        const defence = user.skills.defence.level;
        const hitpoints = user.skills.hitpoints.level;
        const ranged = user.skills.ranged.level;
        const magic = user.skills.magic.level;
        const prayer = user.skills.prayer.level;

        const combatLevel = Math.floor((defence + hitpoints + Math.floor(prayer / 2)) * 0.25 +
            Math.max(attack + strength, Math.max(ranged * 1.5, magic * 1.5)) * 0.325);

        // Inline metadata badges next to username
        const meta = el('div', 'meta-badges text-sm flex items-center gap-2 flex-wrap');
        meta.appendChild(el('span', 'meta-badge', [text(`Combat Lv. ${combatLevel}`)]));
        {
            const ts = user.createdAt || user.updatedAt || null;
            if (ts) {
                const createdStr = new Date(ts).toLocaleDateString();
                meta.appendChild(el('span', 'meta-badge', [text(`User created on ${createdStr}`)]));
            }
        }
        userInfo.appendChild(meta);

        headerContent.appendChild(userInfo);
        headerSection.appendChild(headerContent);
        wrap.appendChild(headerSection);

        // Hiscores table (column layout like OSRS)
        const section = el('section', 'flex flex-col gap-4');
        const headerRow = el('div', 'flex items-center justify-between');
        headerRow.appendChild(el('h3', 'text-2xl font-bold text-foreground', [text('📜 Hiscores')]));
        section.appendChild(headerRow);

        const tableWrap = el('div', 'osrs-table');
        const table = el('table', 'min-w-full text-sm');
        table.innerHTML = `
            <thead>
                <tr>
            <th class="text-left">Skill</th>
            <th>Level</th>
            <th>Experience</th>
            <th>Rank</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        tableWrap.appendChild(table);
        section.appendChild(tableWrap);
        wrap.appendChild(section);

        const tbody = table.querySelector('tbody');

        // Determine overall rank from leaderboard (if available)
        let overallRank = null;
        if (leaderboard && leaderboard.players) {
            const found = leaderboard.players.find(p => p.username === user.username);
            if (found) overallRank = found.rank;
        }

        // Removed overall totals row per request; focus on per-skill stats only

        // Per-skill rows
        SKILLS.forEach(skillName => {
            const skill = user.skills[skillName];
            const rank = getUserSkillRank(skillRankings, username, skillName);

            const tr = document.createElement('tr');

            // Decorative highlight for top 3 ranks
            if (rank === 1) tr.classList.add('rank-1');
            else if (rank === 2) tr.classList.add('rank-2');
            else if (rank === 3) tr.classList.add('rank-3');

            // Clickable if any meaningful progress
            const baseXP = skillName === 'hitpoints' ? 1154 : 0;
            const isClickable = (skill?.level || 1) > 1 || (skill?.xp || 0) > baseXP;
            if (isClickable) {
                tr.classList.add('clickable');
                tr.addEventListener('click', () => {
                    window.open(`skill-hiscores.html?skill=${skillName}#skill=${skillName}`, '_blank');
                });
            }

            const iconUrl = window.getSkillIcon(skillName);
            const nameCell = document.createElement('td');
            nameCell.className = 'text-left';
            nameCell.innerHTML = `${iconUrl ? `<img src="${iconUrl}" class="skill-icon skill-icon--sm" alt="${skillName}">` : ''}<span class="skill-name text-capitalize">${skillName}</span>`;

            const lvl = skill?.level ?? 1;
            const xp = skill?.xp ?? 0;

            tr.appendChild(nameCell);
            tr.appendChild(el('td', 'text-center skill-level', [text(String(lvl))]));
            tr.appendChild(el('td', 'text-right skill-xp', [text(xp.toLocaleString())]));
            tr.appendChild(el('td', 'text-center skill-rank', [text(rank ? `#${rank}` : '—')]));

            tbody.appendChild(tr);
        });

        root.innerHTML = '';
        root.appendChild(wrap);
    }).catch(() => {
        root.innerHTML = '<div class="text-center py-8"><div class="text-danger text-xl font-semibold">❌ Player not found</div><div class="text-muted mt-2">The player you\'re looking for doesn\'t exist in our database.</div></div>';
    });
}

// ---------- Routing ----------
function handleRoute() { const hash = location.hash.slice(1); if (!hash) { renderHomeView(); } else if (hash.startsWith('user/')) { const u = decodeURIComponent(hash.split('/')[1]); renderUserView(u); } else { renderHomeView(); } }

// ---------- Search + Suggestions ----------
function setupSearch() {
    const input = $('#playerSearch'); const suggest = $('#searchSuggest'); let debounce; let activeIndex = -1; let currentItems = [];
    function hideSuggest() { suggest.classList.add('hidden'); suggest.innerHTML = ''; activeIndex = -1; currentItems = []; input.setAttribute('aria-expanded', 'false'); }
    function renderSuggest(matches) { currentItems = matches; suggest.innerHTML = matches.map((m, i) => `<button role="option" aria-selected="${i === activeIndex}" data-user="${m}" class="block${i === activeIndex ? ' active' : ''}">${m}</button>`).join(''); suggest.classList.remove('hidden'); input.setAttribute('aria-expanded', 'true'); }
    input.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(async () => { const q = input.value.trim().toLowerCase(); if (!q) { hideSuggest(); return; } try { const list = await loadUsers(); const matches = list.users.filter(u => u.toLowerCase().includes(q)).slice(0, 10); if (!matches.length) { hideSuggest(); return; } activeIndex = -1; renderSuggest(matches); } catch (e) { hideSuggest(); } }, 200); });
    input.addEventListener('keydown', e => {
        if (suggest.classList.contains('hidden')) { if (e.key === 'ArrowDown') { e.preventDefault(); } return; }
        if (e.key === 'Escape') { hideSuggest(); input.blur(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); activeIndex = Math.min(currentItems.length - 1, activeIndex + 1); renderSuggest(currentItems); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); activeIndex = Math.max(0, activeIndex - 1); renderSuggest(currentItems); }
        else if (e.key === 'Enter') { if (activeIndex >= 0 && currentItems[activeIndex]) { const u = currentItems[activeIndex]; location.hash = 'user/' + encodeURIComponent(u); hideSuggest(); } }
    });
    document.addEventListener('click', e => { if (e.target.closest('#searchSuggest button')) { const u = e.target.getAttribute('data-user'); location.hash = 'user/' + encodeURIComponent(u); hideSuggest(); } else if (!e.target.closest('#playerSearch') && !e.target.closest('#searchSuggest')) { hideSuggest(); } });
    input.addEventListener('change', async () => { const q = input.value.trim().toLowerCase(); if (!q) return; try { const list = await loadUsers(); const found = list.users.find(u => u.toLowerCase() === q); if (found) location.hash = 'user/' + encodeURIComponent(found); } catch (_) { } });
    // Accessibility attributes
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    suggest.setAttribute('role', 'listbox');
}

// ---------- Delegation ----------
document.addEventListener('click', e => {
    const btn = e.target.closest('.username-link');
    if (btn) {
        const u = btn.getAttribute('data-user');
        location.hash = 'user/' + encodeURIComponent(u);
    }
    if (e.target.id === 'themeToggle' || e.target.closest('#themeToggle')) toggleTheme();
    const brand = e.target.closest('.brand-link');
    if (brand) {
        e.preventDefault();
        // SPA: go back to main leaderboard view without reload
        location.hash = '';
    }
});

window.addEventListener('hashchange', handleRoute);

// Init
(() => {
    const saved = localStorage.getItem('theme');
    const startTheme = saved || (matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(startTheme);
    setupSearch();
    handleRoute();
    // Show current API base in footer
    const apiSpan = $('#currentApiBase');
    if (apiSpan && window.API_BASE) {
        const displayBase = window.API_BASE === location.origin ? 'Same-origin' : window.API_BASE;
        apiSpan.textContent = displayBase;
    }
})();
