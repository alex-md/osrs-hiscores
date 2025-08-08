// Skill Hiscores page logic
const API_BASE = (document.documentElement.getAttribute('data-api-base') || location.origin).replace(/\/$/, '');
const SKILLS = ['attack', 'defence', 'strength', 'hitpoints', 'ranged', 'prayer', 'magic', 'cooking', 'woodcutting', 'fletching', 'fishing', 'firemaking', 'crafting', 'smithing', 'mining', 'herblore', 'agility', 'thieving', 'slayer', 'farming', 'runecraft', 'hunter', 'construction'];
const cache = { skillRankings: null };

function $(sel, root = document) { return root.querySelector(sel); }
function el(tag, cls, children) { const e = document.createElement(tag); if (cls) e.className = cls; if (children) children.forEach(c => e.appendChild(c)); return e; }
function toast(msg, type = 'info', timeout = 3000) { const c = $('#toastContainer'); const d = el('div', 'toast'); if (type === 'error') d.style.borderColor = 'var(--color-danger)'; d.textContent = msg; c.appendChild(d); setTimeout(() => d.remove(), timeout); }

function setTheme(theme) { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('theme', theme); updateThemeToggle(); }
function toggleTheme() { setTheme((localStorage.getItem('theme') || 'light') === 'light' ? 'dark' : 'light'); }
function updateThemeToggle() { const btn = $('#themeToggle'); if (!btn) return; btn.innerHTML = ''; const i = document.createElement('i'); i.setAttribute('data-lucide', (localStorage.getItem('theme') || 'light') === 'light' ? 'moon' : 'sun'); btn.appendChild(i); if (window.lucide) window.lucide.createIcons(); }

async function fetchJSON(path) {
    const url = API_BASE + path;
    const r = await fetch(url);
    if (!r.ok) throw new Error('Request failed: ' + r.status + ' ' + r.statusText);
    const ct = r.headers.get('content-type') || '';
    const body = await r.text();
    try {
        if (!ct.includes('application/json')) {
            if (/^\s*</.test(body)) throw new Error('Received HTML instead of JSON from ' + url + ' (configure data-api-base).');
            throw new Error('Unexpected content-type (' + ct + ') from ' + url);
        }
        return JSON.parse(body);
    } catch (e) {
        if (e instanceof SyntaxError) throw new Error('Invalid JSON from ' + url + ' – first chars: ' + body.slice(0, 60));
        throw e;
    }
}
async function loadSkillRankings(force = false) { if (cache.skillRankings && !force) return cache.skillRankings; cache.skillRankings = await fetchJSON('/api/skill-rankings'); return cache.skillRankings; }

let currentSkill = 'attack';
let sortKey = 'rank';
let sortDir = 1; // 1 asc, -1 desc
let page = 1; let perPage = parseInt(localStorage.getItem('perPage') || '25') || 25;

function applyFilters(data) { const name = $('#filterName').value.trim().toLowerCase(); const minLvl = parseInt($('#filterMinLvl').value) || 1; const maxLvl = parseInt($('#filterMaxLvl').value) || 99; return data.filter(r => r.level >= minLvl && r.level <= maxLvl && (!name || r.username.toLowerCase().includes(name))); }
function sortData(data) { return [...data].sort((a, b) => { let av = a[sortKey]; let bv = b[sortKey]; if (typeof av === 'string') return av.localeCompare(bv) * sortDir; return (av - bv) * sortDir; }); }

function renderTable() { loadSkillRankings().then(data => { const rows = data.rankings[currentSkill]; const filtered = applyFilters(rows); const sorted = sortData(filtered); const tableBody = $('#skillTable tbody'); tableBody.innerHTML = ''; const totalPages = Math.max(1, Math.ceil(sorted.length / perPage)); if (page > totalPages) page = totalPages; const slice = sorted.slice((page - 1) * perPage, page * perPage); slice.forEach(r => { const tr = document.createElement('tr'); tr.innerHTML = `<td class=\"text-center\">${r.rank}</td><td><a class=\"underline\" href=\"index.html#user/${encodeURIComponent(r.username)}\" aria-label=\"View ${r.username} overall stats\">${r.username}</a></td><td class=\"text-center\">${r.level}</td><td class=\"text-right tabular-nums\">${r.xp.toLocaleString()}</td>`; tableBody.appendChild(tr); }); $('#pageNum').textContent = String(page); $('#pageTotal').textContent = String(totalPages); const statsEl = $('#skillStats'); if (filtered.length) { const top = filtered[0]; const highestXp = filtered.slice().sort((a, b) => b.xp - a.xp)[0]; const avgLvl = (filtered.reduce((a, x) => a + x.level, 0) / filtered.length).toFixed(2); statsEl.textContent = `${filtered.length} players • Top: ${top.username} (rank ${top.rank}) • Highest XP: ${highestXp.username} (${highestXp.xp.toLocaleString()}) • Avg Lvl: ${avgLvl}`; } else statsEl.textContent = 'No results'; }).catch(e => toast(e.message, 'error')); }

function exportCsv() { loadSkillRankings().then(data => { const rows = data.rankings[currentSkill]; const filtered = applyFilters(rows); const header = 'rank,username,level,xp\n'; const body = filtered.map(r => `${r.rank},${r.username},${r.level},${r.xp}`).join('\n'); const blob = new Blob([header + body], { type: 'text/csv' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${currentSkill}-hiscores.csv`; document.body.appendChild(a); a.click(); a.remove(); }); }

document.addEventListener('click', e => { if (e.target.id === 'themeToggle' || e.target.closest('#themeToggle')) toggleTheme(); if (e.target.closest('th.sortable')) { const th = e.target.closest('th'); const key = th.getAttribute('data-sort'); if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = key === 'rank' ? 1 : -1; } renderTable(); } if (e.target.id === 'prevPage') { if (page > 1) { page--; renderTable(); } } if (e.target.id === 'nextPage') { const totalPages = parseInt($('#pageTotal').textContent) || 1; if (page < totalPages) { page++; renderTable(); } } if (e.target.id === 'exportCsv') exportCsv(); });

$('#perPage').addEventListener('change', () => { perPage = parseInt($('#perPage').value) || 25; localStorage.setItem('perPage', String(perPage)); page = 1; renderTable(); });
let filterDebounce; function queueFilterRender() { clearTimeout(filterDebounce); filterDebounce = setTimeout(() => { page = 1; renderTable(); }, 150); }
$('#filterName').addEventListener('input', queueFilterRender);
$('#filterMinLvl').addEventListener('input', queueFilterRender);
$('#filterMaxLvl').addEventListener('input', queueFilterRender);
$('#skillSelect').addEventListener('change', () => { currentSkill = $('#skillSelect').value; page = 1; renderTable(); });

function init() {
    const select = $('#skillSelect'); SKILLS.forEach(s => { const opt = document.createElement('option'); opt.value = s; opt.textContent = s; select.appendChild(opt); }); select.value = currentSkill; const theme = localStorage.getItem('theme') || 'light'; setTheme(theme); // apply stored perPage
    const perPageSelect = $('#perPage'); if (perPageSelect) { [...perPageSelect.options].forEach(o => { if (parseInt(o.value) === perPage) perPageSelect.value = o.value; }); }
    renderTable();
}

init();
