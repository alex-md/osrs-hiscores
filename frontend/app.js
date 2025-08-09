// Frontend main application logic for OSRS Hiscores clone
const LEADERBOARD_LIMIT = 500; // configurable cap for initial view
const cache = { leaderboard: null, users: null, skillRankings: null, usersFetchedAt: 0 };
const SKILLS = ['attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer', 'magic', 'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking', 'crafting', 'smithing', 'mining', 'herblore', 'agility', 'thieving', 'slayer', 'farming', 'runecraft', 'hunter', 'construction'];

function $(sel, root = document) { return root.querySelector(sel); }
function el(tag, cls, children) { const e = document.createElement(tag); if (cls) e.className = cls; if (children) children.forEach(c => e.appendChild(c)); return e; }
function text(t) { return document.createTextNode(t); }

function toast(msg, type = 'info', timeout = 3000) {
    const container = $('#toastContainer');
    const div = el('div', 'toast');
    if (type === 'error') div.style.borderColor = 'var(--color-danger)';
    div.textContent = msg;
    container.appendChild(div);
    setTimeout(() => div.remove(), timeout);
}

function setTheme(theme) { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('theme', theme); updateThemeToggle(); }
function toggleTheme() { const cur = localStorage.getItem('theme') || 'light'; setTheme(cur === 'light' ? 'dark' : 'light'); }
function updateThemeToggle() { const btn = $('#themeToggle'); if (!btn) return; btn.innerHTML = ''; const theme = localStorage.getItem('theme') || 'light'; const icon = document.createElement('i'); icon.setAttribute('data-lucide', theme === 'light' ? 'moon' : 'sun'); btn.appendChild(icon); if (window.lucide) window.lucide.createIcons(); }

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

    const statsDiv = el('div', 'flex gap-2 flex-wrap');
    statsDiv.appendChild(el('div', 'badge', [text('Top 100 Players')]));
    section.appendChild(headerDiv);

    // Table wrapper with OSRS styling
    const tableWrap = el('div', 'osrs-table');
    const table = el('table', 'min-w-full');
    table.innerHTML = `<thead><tr><th class="w-20">Rank</th><th class="text-left">Player</th><th class="w-32">Total Level</th><th class="w-40">Total Experience</th></tr></thead><tbody></tbody>`;
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

            tr.innerHTML = `
                <td class="text-center font-bold">${rankDisplay}</td>
                <td>
                    <button class="username-link" data-user="${p.username}" aria-label="View ${p.username} stats">
                        ${p.username}
                    </button>
                </td>
                <td class="text-center font-semibold text-accent">${p.totalLevel}</td>
                <td class="text-right tabular-nums font-mono">${p.totalXP.toLocaleString()}</td>
            `;
            tbody.appendChild(tr);
        });

        // Update stats
        if (data.totalPlayers > 0) {
            statsDiv.innerHTML = '';
            statsDiv.appendChild(el('div', 'badge', [text(`${data.totalPlayers} Total Players`)]));
            statsDiv.appendChild(el('div', 'badge', [text(`Updated: ${new Date(data.generatedAt).toLocaleTimeString()}`)]));
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
        loadSkillRankings()
    ]).then(([user, skillRankings]) => {
        const wrap = el('div', 'flex flex-col gap-8');

        // User header with enhanced styling
        const headerSection = el('div', 'bg-layer2 p-6 rounded-lg border-2 border-border-dark');
        const headerContent = el('div', 'flex items-center justify-between flex-wrap gap-4');

        const userInfo = el('div', 'flex items-center gap-4');
        userInfo.appendChild(el('h2', 'text-3xl font-bold text-foreground', [text(`⚔️ ${user.username}`)]));

        const badges = el('div', 'flex gap-3 flex-wrap');
        badges.appendChild(el('div', 'badge', [text(`Total Level ${user.totalLevel}`)]));
        badges.appendChild(el('div', 'badge', [text(`${user.totalXP.toLocaleString()} XP`)]));

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

        badges.appendChild(el('div', 'badge', [text(`Combat ${combatLevel}`)]));

        headerContent.appendChild(userInfo);
        headerContent.appendChild(badges);
        headerSection.appendChild(headerContent);
        wrap.appendChild(headerSection);

        // Skills section with better organization
        const skillsSection = el('div', 'flex flex-col gap-6');
        const skillsHeader = el('div', 'flex items-center justify-between');
        skillsHeader.appendChild(el('h3', 'text-2xl font-bold text-foreground', [text('⚡ Skills Overview')]));
        skillsHeader.appendChild(el('div', 'badge', [text('Click skills to view hiscores')]));
        skillsSection.appendChild(skillsHeader);

        const skillsGrid = el('div', 'skills-grid');

        // Group skills by category for better organization
        const skillCategories = {
            combat: ['attack', 'strength', 'defence', 'hitpoints', 'ranged', 'prayer', 'magic'],
            gathering: ['mining', 'fishing', 'woodcutting', 'farming', 'hunter'],
            production: ['cooking', 'smithing', 'crafting', 'herblore', 'fletching', 'firemaking', 'runecraft'],
            support: ['agility', 'thieving', 'slayer', 'construction']
        };

        // Render skills in category order
        Object.values(skillCategories).flat().forEach(skillName => {
            const skill = user.skills[skillName];
            const rank = getUserSkillRank(skillRankings, username, skillName);

            const skillRow = el('div', 'skill-row bg-layer');

            // Only make clickable if the skill has meaningful progress
            const baseXP = skillName === 'hitpoints' ? 1154 : 0;
            const isClickable = skill.level > 1 || skill.xp > baseXP;

            if (isClickable) {
                skillRow.classList.add('clickable');
                skillRow.addEventListener('click', () => {
                    window.open(`skill-hiscores.html?skill=${skillName}#skill=${skillName}`, '_blank');
                });
            }

            // Skill icon
            const iconUrl = window.getSkillIcon(skillName);
            const skillIcon = el('div', 'skill-icon');
            if (iconUrl) {
                skillIcon.style.backgroundImage = `url(${iconUrl})`;
            }

            const skillInfo = el('div', 'skill-info');
            const nameDiv = el('div', 'skill-name', [text(skillName)]);

            const statsDiv = el('div', 'skill-stats');
            statsDiv.appendChild(el('span', 'skill-level', [text(`Level ${skill.level}`)]));
            statsDiv.appendChild(el('span', 'skill-xp', [text(`${skill.xp.toLocaleString()} XP`)]));

            if (rank) {
                statsDiv.appendChild(el('span', 'skill-rank', [text(`Rank #${rank}`)]));
            }

            skillInfo.appendChild(nameDiv);
            skillInfo.appendChild(statsDiv);

            skillRow.appendChild(skillIcon);
            skillRow.appendChild(skillInfo);

            skillsGrid.appendChild(skillRow);
        });

        skillsSection.appendChild(skillsGrid);
        wrap.appendChild(skillsSection);

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
document.addEventListener('click', e => { const btn = e.target.closest('.username-link'); if (btn) { const u = btn.getAttribute('data-user'); location.hash = 'user/' + encodeURIComponent(u); } if (e.target.id === 'themeToggle' || e.target.closest('#themeToggle')) toggleTheme(); });

window.addEventListener('hashchange', handleRoute);

// Init
(() => {
    const savedTheme = localStorage.getItem('theme') || 'light'; setTheme(savedTheme); setupSearch(); handleRoute();
    // Show current API base in footer
    const apiSpan = $('#currentApiBase');
    if (apiSpan && window.API_BASE) {
        const displayBase = window.API_BASE === location.origin ? 'Same-origin' : window.API_BASE;
        apiSpan.textContent = displayBase;
    }
})();
