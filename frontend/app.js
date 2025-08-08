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
async function loadUser(username) { return fetchJSON('/api/users/' + encodeURIComponent(username)); }

// ---------- Views ----------
function renderHomeView() {
    const root = $('#viewRoot'); root.innerHTML = ''; const section = el('section', 'flex flex-col gap-4');
    section.appendChild(el('h2', 'text-lg font-semibold flex items-center gap-2', [text('Overall Leaderboard')]));
    const tableWrap = el('div', 'overflow-auto border border-border rounded bg-layer');
    const table = el('table', 'min-w-full text-sm');
    table.innerHTML = `<thead class="bg-layer2 text-xs uppercase tracking-wide"><tr><th class=\"w-16\">Rank</th><th class=\"text-left\">Player</th><th class=\"w-32\">Total Level</th><th class=\"w-40\">Total XP</th></tr></thead><tbody></tbody>`;
    tableWrap.appendChild(table); section.appendChild(tableWrap); root.appendChild(section);
    const tbody = table.querySelector('tbody');
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-6">Loading...</td></tr>';
    loadLeaderboard().then(data => { tbody.innerHTML = ''; data.players.slice(0, 100).forEach(p => { const tr = document.createElement('tr'); tr.innerHTML = `<td class=\"text-center\">${p.rank}</td><td><button class=\"underline username-link\" data-user=\"${p.username}\" aria-label=\"View ${p.username} stats\">${p.username}</button></td><td class=\"text-center\">${p.totalLevel}</td><td class=\"text-right tabular-nums\">${p.totalXP.toLocaleString()}</td>`; tbody.appendChild(tr); }); }).catch(e => {
        const htmlLike = /Received HTML|Unexpected content-type/.test(e.message);
        const hint = htmlLike ? '<div class="mt-2 text-xs text-left max-w-sm mx-auto">Backend not mounted under /api – verify _worker.js present at repo root and KV binding HISCORES_KV set in Pages project. Also ensure deployment finished successfully. <code>/api/health</code> should return JSON.</div>' : '';
        tbody.innerHTML = `<tr><td colspan=\"4\" class=\"text-center text-danger py-6\">${e.message}${hint}</td></tr>`;
    });
}

function renderUserView(username) {
    const root = $('#viewRoot'); root.innerHTML = '<div class="text-sm text-muted">Loading player...</div>';
    loadUser(username).then(user => { const wrap = el('div', 'flex flex-col gap-6'); wrap.appendChild(el('div', 'flex items-center gap-4 flex-wrap', [el('h2', 'text-lg font-semibold', [text(user.username)]), el('div', 'badge', [text('Total Level ' + user.totalLevel)]), el('div', 'badge', [text('Total XP ' + user.totalXP.toLocaleString())])])); const skillsTable = el('table', 'min-w-full text-sm border border-border rounded overflow-hidden'); skillsTable.innerHTML = `<thead class=\"bg-layer2 text-xs uppercase\"><tr><th class=\"text-left\">Skill</th><th class=\"w-24\">Level</th><th class=\"w-40\">XP</th></tr></thead><tbody></tbody>`; const tbody = skillsTable.querySelector('tbody'); SKILLS.forEach(s => { const sk = user.skills[s]; const tr = document.createElement('tr'); tr.innerHTML = `<td class=\"capitalize\">${s}</td><td class=\"text-center\">${sk.level}</td><td class=\"text-right tabular-nums\">${sk.xp.toLocaleString()}</td>`; tbody.appendChild(tr); }); wrap.appendChild(skillsTable); root.innerHTML = ''; root.appendChild(wrap); }).catch(() => { root.innerHTML = '<div class="text-danger">Player not found</div>'; });
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
(() => { const savedTheme = localStorage.getItem('theme') || 'light'; setTheme(savedTheme); setupSearch(); handleRoute(); })();
