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

function applyNameFilter(rows) {
  const q = ($("#filterName")?.value || "").trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((r) => r.username.toLowerCase().includes(q));
}

function renderTable() {
  loadSkillRankings()
    .then((data) => {
      const rows = data.rankings[currentSkill];
      const filtered = applyNameFilter(rows);
      const tableBody = $("#skillTable tbody");
      tableBody.innerHTML = "";
      const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
      if (page > totalPages) page = totalPages;
      const start = (page - 1) * perPage;
      const slice = filtered.slice(start, start + perPage);

      const skillIcon = window.getSkillIcon(currentSkill);

      if (slice.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">No players found</td></tr>`;
      } else {
        slice.forEach((r) => {
          const tr = document.createElement("tr");
          if (r.rank === 1) tr.classList.add("rank-1");
          else if (r.rank === 2) tr.classList.add("rank-2");
          else if (r.rank === 3) tr.classList.add("rank-3");

          tr.innerHTML = `
                    <td class="text-center">${r.rank}</td>
                    <td>
                        <a class="username-link" href="index.html#user/${encodeURIComponent(r.username)}" aria-label="View ${r.username} overall stats">${r.username}</a>
                    </td>
                    <td class="text-center skill-level">${r.level}</td>
                    <td class="text-right skill-xp">${r.xp.toLocaleString()}</td>
                `;
          tableBody.appendChild(tr);
        });
      }

      // update pagination display
      const num = $("#pageNum");
      const tot = $("#pageTotal");
      if (num) num.textContent = String(page);
      if (tot) tot.textContent = String(totalPages);

      const statsEl = $("#skillStats");
      if (statsEl && filtered.length) {
        const top = filtered[0];
        const highestXp = filtered.slice().sort((a, b) => b.xp - a.xp)[0];
        const avgLvl = (
          filtered.reduce((a, x) => a + x.level, 0) / filtered.length
        ).toFixed(2);
        const skillIconHtml = skillIcon
          ? `<img src="${skillIcon}" class="skill-icon skill-icon--xs" alt="${currentSkill}">`
          : "";
        statsEl.innerHTML = `${skillIconHtml}<strong>${currentSkill.charAt(0).toUpperCase() + currentSkill.slice(1)}</strong> • ${filtered.length} players • Top: ${top.username} (rank ${top.rank}) • Highest XP: ${highestXp.username} (${highestXp.xp.toLocaleString()}) • Avg Lvl: ${avgLvl}`;
      } else if (statsEl) {
        statsEl.textContent = "No results";
      }
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

// name filter
let filterDebounce;
function queueFilterRender() {
  clearTimeout(filterDebounce);
  filterDebounce = setTimeout(() => {
    page = 1;
    renderTable();
  }, 150);
}
$("#filterName").addEventListener("input", queueFilterRender);
// removed min/max level filters
$("#skillSelect").addEventListener("change", () => {
  currentSkill = $("#skillSelect").value;
  page = 1;
  renderTable();
});

function init() {
  const select = $("#skillSelect");
  SKILLS.forEach((s) => {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s.charAt(0).toUpperCase() + s.slice(1);
    select.appendChild(opt);
  });

  // Check for skill parameter in URL hash or query params
  const urlParams = new URLSearchParams(location.search);
  const hashParams = new URLSearchParams(location.hash.slice(1));
  const skillParam = urlParams.get("skill") || hashParams.get("skill");

  if (skillParam && SKILLS.includes(skillParam)) {
    currentSkill = skillParam;
  }

  select.value = currentSkill;

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

init();
