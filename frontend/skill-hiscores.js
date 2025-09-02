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
let perPage = 50; // fixed page size; can be adjusted if needed
let minLevel = null;
let maxLevel = null;
let minXp = null;
let maxXp = null;

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
  loadSkillRankings()
    .then((data) => {
      const rows = data.rankings[currentSkill];
      const filtered = applyFilters(rows);
      const tableBody = $("#skillTable tbody");
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
    })
    .catch((e) => {
      const htmlLike = /Received HTML|Unexpected content-type/.test(e.message);
      if (htmlLike)
        toast(
          "API not mounted under /api - verify _worker.js deployment",
          "error",
        );
      else toast(e.message, "error");
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
});

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
    badges.push('<span class="mini-achievement-badge" data-tooltip="Skill Crowned\nAchieve rank #1 in any single skill" title="Skill Crowned">🥇</span>');
  }

  // Check for max level in this skill
  if (player.level >= 99) {
    badges.push('<span class="mini-achievement-badge" data-tooltip="Skill Master\nReach level 99 in this skill" title="Skill Master">💫</span>');
  }

  // Check for elite level (90+)
  if (player.level >= 90 && player.level < 99) {
    badges.push('<span class="mini-achievement-badge" data-tooltip="Elite Skill\nReach level 90+ in this skill" title="Elite Skill">👑</span>');
  }

  // Check for high level (80+)
  if (player.level >= 80 && player.level < 90) {
    badges.push('<span class="mini-achievement-badge" data-tooltip="Expert Skill\nReach level 80+ in this skill" title="Expert Skill">⭐</span>');
  }

  // Check for very high XP (top 1% in skill)
  if (player.rank && player.rank <= 10) {
    badges.push('<span class="mini-achievement-badge" data-tooltip="Top 10\nRank in top 10 for this skill" title="Top 10">🎯</span>');
  }

  // Check for high XP (top 5% in skill)
  if (player.rank && player.rank <= 50) {
    badges.push('<span class="mini-achievement-badge" data-tooltip="Elite Rank\nRank in top 50 for this skill" title="Elite Rank">🏅</span>');
  }

  return badges.join('');
}

init();
