// Skill Hiscores page logic
// API_BASE, setApiBase, fetchJSON provided by common.js
const cache = { skillRankings: null };

// fetchJSON now global (common.js)
async function loadSkillRankings(force = false) {
  if (cache.skillRankings && !force) return cache.skillRankings;
  cache.skillRankings = await fetchJSON("/api/skill-rankings");
  return cache.skillRankings;
}

let currentSkill = "attack";
let page = 1;
let perPage = 50; // default page size; configurable via selector
let minLevel = null;
let maxLevel = null;
let minXp = null;
let maxXp = null;

const describeRelativeTime = window.describeRelativeTime || ((ts) => {
  if (!Number.isFinite(ts)) return null;
  const diff = Date.now() - Number(ts);
  if (!Number.isFinite(diff) || diff < 0) return null;
  const seconds = Math.round(diff / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.round(days / 365);
  return `${years}y ago`;
});

function updateSkillHero(rows, data) {
  const total = Array.isArray(rows) ? rows.length : 0;
  const totalEl = document.getElementById('skillLeadersCount');
  if (totalEl) totalEl.textContent = total ? total.toLocaleString() : '—';

  const top = Array.isArray(rows) && rows.length ? rows[0] : null;
  const playerEl = document.getElementById('skillTopPlayer');
  if (playerEl) playerEl.textContent = top ? top.username : '—';
  const levelEl = document.getElementById('skillTopLevel');
  if (levelEl) levelEl.textContent = top ? `Lv ${top.level}` : '—';
  const xpEl = document.getElementById('skillTopXp');
  if (xpEl) xpEl.textContent = top ? `${top.xp.toLocaleString()} XP` : '—';

  const spotlightWrap = document.getElementById('skillHeroSpotlight');
  const spotlightName = document.getElementById('skillHeroHighlightName');
  const spotlightMeta = document.getElementById('skillHeroHighlightMeta');
  if (spotlightWrap && spotlightName && spotlightMeta) {
    if (top) {
      spotlightName.textContent = top.username;
      const metaParts = [`Lv ${top.level}`];
      if (Number.isFinite(top.rank)) metaParts.push(`#${top.rank}`);
      if (Number.isFinite(top.xp)) metaParts.push(`${top.xp.toLocaleString()} XP`);
      spotlightMeta.textContent = metaParts.join(' • ');
      spotlightWrap.classList.add('is-active');
    } else {
      spotlightName.textContent = 'Choose a skill to see the pacesetter';
      spotlightMeta.textContent = 'Live rankings update with every search.';
      spotlightWrap.classList.remove('is-active');
    }
  }

  const generatedAt = Number(data?.generatedAt || 0);
  const lastEl = document.getElementById('skillLastUpdatedHero');
  if (lastEl) {
    if (generatedAt) {
      const rel = describeRelativeTime(generatedAt);
      lastEl.textContent = rel || new Date(generatedAt).toLocaleString();
      lastEl.setAttribute('title', new Date(generatedAt).toLocaleString());
    } else {
      lastEl.textContent = 'Live snapshot';
      lastEl.removeAttribute('title');
    }
  }

  const tickerWrap = document.getElementById('skillHeroTicker');
  if (tickerWrap) {
    tickerWrap.innerHTML = '';
    const track = document.createElement('div');
    track.className = 'ticker-track';
    const leaders = Array.isArray(rows) ? rows.slice(0, 4) : [];
    if (!leaders.length) {
      const empty = document.createElement('span');
      empty.className = 'ticker-item';
      empty.textContent = 'Awaiting ladder updates…';
      track.appendChild(empty);
    } else {
      leaders.forEach((entry) => {
        const item = document.createElement('span');
        item.className = 'ticker-item';
        const link = document.createElement('a');
        link.className = 'username-link';
        link.href = `index.html#user/${encodeURIComponent(entry.username)}`;
        link.textContent = entry.username;
        link.setAttribute('aria-label', `View ${entry.username} overall stats`);
        item.appendChild(link);
        const meta = document.createElement('span');
        meta.className = 'ticker-meta';
        const parts = [`Lv ${entry.level}`];
        if (Number.isFinite(entry.xp)) parts.push(`${entry.xp.toLocaleString()} XP`);
        meta.textContent = parts.join(' • ');
        item.appendChild(meta);
        track.appendChild(item);
      });
      if (leaders.length > 1) {
        Array.from(track.children).forEach((node) => {
          const clone = node.cloneNode(true);
          clone.dataset.duplicate = 'true';
          track.appendChild(clone);
        });
      }
    }
    tickerWrap.appendChild(track);
    if (window.applyTickerMotion) window.applyTickerMotion(tickerWrap, track);
    else tickerWrap.classList.toggle('paused', track.childElementCount <= 1);
  }
}

function applyFilters(rows) {
  const q = (($("#filterName"))?.value || "").trim().toLowerCase();
  return rows.filter(r => {
    if (q && !r.username.toLowerCase().includes(q)) return false;
    if (minLevel != null && r.level < minLevel) return false;
    if (maxLevel != null && r.level > maxLevel) return false;
    if (minXp != null && r.xp < minXp) return false;
    if (maxXp != null && r.xp > maxXp) return false;
    return true;
  });
}

function renderTable() {
  const tableBody = $("#skillTable tbody");
  if (tableBody) {
    tableBody.innerHTML = Array.from({ length: 10 }).map(() => (
      `<tr>
        <td class="text-center"><div class="skeleton skeleton-line" style="width:28px;margin:0 auto;"></div></td>
        <td><div class="skeleton skeleton-line" style="width:140px"></div></td>
        <td class="text-center"><div class="skeleton skeleton-line" style="width:48px;margin:0 auto;"></div></td>
        <td class="text-right"><div class="skeleton skeleton-line" style="width:100px;margin-left:auto;"></div></td>
      </tr>`
    )).join('');
  }
  loadSkillRankings()
    .then((data) => {
      const rows = data.rankings[currentSkill];
      const filtered = applyFilters(rows);
      updateSkillHero(filtered, data);
      tableBody.innerHTML = "";
      const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
      if (page > totalPages) page = totalPages;
      const start = (page - 1) * perPage;
      const slice = filtered.slice(start, start + perPage);

      if (slice.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">No players found</td></tr>`;
      } else {
        slice.forEach((r) => {
          const tr = document.createElement("tr");
          if (r.rank === 1) tr.classList.add("rank-1");
          else if (r.rank === 2) tr.classList.add("rank-2");
          else if (r.rank === 3) tr.classList.add("rank-3");

          // Create achievement badges for this player
          const achievementBadges = createAchievementBadgesForSkillPlayer(r);

          tr.innerHTML = `
                    <td class="text-center">${r.rank}</td>
                    <td>
                        <a class="username-link" href="index.html#user/${encodeURIComponent(r.username)}" aria-label="View ${r.username} overall stats">${r.username}</a>
                        ${achievementBadges}
                    </td>
                    <td class="text-center skill-level">${r.level}</td>
                    <td class="text-right skill-xp">${r.xp.toLocaleString()}</td>
                `;
          tableBody.appendChild(tr);
        });
      }

      const num = $("#pageNum");
      const tot = $("#pageTotal");
      if (num) num.textContent = String(page);
      if (tot) tot.textContent = String(totalPages);

      // Last updated footer hint (from generatedAt)
      const ts = Number(data.generatedAt || 0);
      const last = document.getElementById('lastUpdated');
      if (last && ts) last.textContent = new Date(ts).toLocaleString();
    })
    .catch((e) => {
      const htmlLike = /Received HTML|Unexpected content-type/.test(e.message);
      if (htmlLike)
        toast(
          "API not mounted under /api - verify _worker.js deployment",
          "error",
        );
      else toast(e.message, "error");
      updateSkillHero([], null);
    });
}

// Removed exportCsv and CSV export button handlers

document.addEventListener("click", (e) => {
  if (e.target.id === "themeToggle" || e.target.closest("#themeToggle"))
    toggleTheme();
  if (e.target.id === "prevPage") {
    if (page > 1) {
      page--;
      renderTable();
    }
  }
  if (e.target.id === "nextPage") {
    page++;
    renderTable();
  }
  if (
    e.target.id === "backButton" ||
    (e.target.closest && e.target.closest("#backButton"))
  ) {
    e.preventDefault();
    location.href = "index.html";
  }
  if (e.target.id === 'copyCsv') {
    e.preventDefault();
    loadSkillRankings().then((data) => {
      const rows = applyFilters(data.rankings[currentSkill] || []);
      const header = ['rank','username','level','xp'];
      const lines = [header.join(',')].concat(
        rows.map(r => [r.rank, r.username, r.level, r.xp].map(v => {
          const s = String(v ?? '');
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(','))
      );
      const csv = lines.join('\n');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(csv).then(() => toast('CSV copied')).catch(() => downloadCsv(csv));
      } else {
        downloadCsv(csv);
      }
    }).catch(() => toast('Failed to build CSV', 'error'));
  }
});

function downloadCsv(csv) {
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentSkill}-hiscores.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('CSV downloaded');
  } catch (_) { toast('CSV download failed', 'error'); }
}

// filters (name + numeric)
let filterDebounce;
function queueFilterRender() {
  clearTimeout(filterDebounce);
  filterDebounce = setTimeout(() => {
    page = 1;
    renderTable();
  }, 150);
}
$("#filterName").addEventListener("input", queueFilterRender);
['minLevel', 'maxLevel', 'minXp', 'maxXp'].forEach(id => {
  const elInput = document.getElementById(id);
  if (elInput) {
    elInput.addEventListener('input', () => {
      const v = elInput.value.trim();
      const num = v === '' ? null : Number(v);
      if (id === 'minLevel') minLevel = num;
      if (id === 'maxLevel') maxLevel = num;
      if (id === 'minXp') minXp = num;
      if (id === 'maxXp') maxXp = num;
      queueFilterRender();
    });
  }
});

function init() {
  // Check for skill parameter in URL hash or query params
  const urlParams = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.slice(1));
  const skillParam = urlParams.get("skill") || hashParams.get("skill");

  if (skillParam && SKILLS.includes(skillParam)) {
    currentSkill = skillParam;
  }

  // Populate skill dropdown if present
  const skillSelect = document.getElementById('skillSelect');
  if (skillSelect) {
    skillSelect.innerHTML = SKILLS.map(s => `<option value="${s}" ${s === currentSkill ? 'selected' : ''}>${s.charAt(0).toUpperCase() + s.slice(1)}</option>`).join('');
    skillSelect.addEventListener('change', () => {
      currentSkill = skillSelect.value;
      page = 1;
      renderTable();
      history.replaceState({}, '', `?skill=${currentSkill}`);
    });
  }

  const theme = localStorage.getItem("theme") || "dark";
  setTheme(theme);

  // perPage is fixed; page starts at 1

  // Page size selector
  const pageSize = document.getElementById('pageSize');
  if (pageSize) {
    pageSize.addEventListener('change', () => {
      const v = Number(pageSize.value) || 50;
      perPage = Math.max(5, Math.min(500, v));
      page = 1;
      renderTable();
    });
  }

  // Show current API base in footer
  const apiSpan = $("#currentApiBase");
  if (apiSpan && window.API_BASE) {
    const displayBase =
      window.API_BASE === location.origin ? "Same-origin" : window.API_BASE;
    apiSpan.textContent = displayBase;
  }

  renderTable();
}

function createAchievementBadgesForSkillPlayer(player) {
  const badges = [];

  // Check if this player is #1 in this skill
  if (player.rank === 1) {
    badges.push('<span class="mini-achievement-badge" data-tooltip="#1 Rank (This Skill)\nAchieve #1 rank in this skill" title="#1 Rank (This Skill)">🥇</span>');
  }

  // Check for max level in this skill
  if (player.level >= 99) {
    badges.push('<span class="mini-achievement-badge" data-tooltip="99 in This Skill\nReach level 99 in this skill" title="99 in This Skill">💫</span>');
  }

  // Check for elite level (90+)
  if (player.level >= 90 && player.level < 99) {
    badges.push('<span class="mini-achievement-badge" data-tooltip="90+ in This Skill\nReach level 90+ in this skill" title="90+ in This Skill">👑</span>');
  }

  // Check for high level (80+)
  if (player.level >= 80 && player.level < 90) {
    badges.push('<span class="mini-achievement-badge" data-tooltip="80+ in This Skill\nReach level 80+ in this skill" title="80+ in This Skill">⭐</span>');
  }

  // Check for very high XP (top 1% in skill)
  if (player.rank && player.rank <= 10) {
    badges.push('<span class="mini-achievement-badge" data-tooltip="Top 10 (This Skill)\nRank in top 10 for this skill" title="Top 10 (This Skill)">🎯</span>');
  }

  // Check for high XP (top 5% in skill)
  if (player.rank && player.rank <= 50) {
    badges.push('<span class="mini-achievement-badge" data-tooltip="Top 50 (This Skill)\nRank in top 50 for this skill" title="Top 50 (This Skill)">🏅</span>');
  }

  return badges.join('');
}

init();
