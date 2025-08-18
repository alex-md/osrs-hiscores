// Frontend main application logic for OSRS Hiscores clone
const LEADERBOARD_LIMIT = 500; // configurable cap for initial view
const cache = {
  leaderboard: null,
  users: null,
  skillRankings: null,
  usersFetchedAt: 0,
};

// Relative time formatter
function formatRelativeTime(ts) {
  const date = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  const diffMs = Date.now() - date.getTime();
  const sec = Math.round(diffMs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  const month = Math.round(day / 30);
  const year = Math.round(day / 365);
  if (sec < 5) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 30) return `${day}d ago`;
  if (month < 12) return `${month}mo ago`;
  return `${year}y ago`;
}

// (Removed XP progress utilities – no longer needed after removing progress bars)

// fetchJSON & API_BASE now provided by common.js
async function loadLeaderboard(force = false) {
  if (cache.leaderboard && !force) {
    return cache.leaderboard;
  }
  cache.leaderboard = await fetchJSON(
    `/api/leaderboard?limit=${LEADERBOARD_LIMIT}`,
  );
  return cache.leaderboard;
}
async function loadUsers(force = false) {
  if (cache.users && !force && Date.now() - cache.usersFetchedAt < 60_000)
    return cache.users;
  cache.users = await fetchJSON("/api/users");
  cache.usersFetchedAt = Date.now();
  return cache.users;
}
async function loadSkillRankings(force = false) {
  if (cache.skillRankings && !force) return cache.skillRankings;
  cache.skillRankings = await fetchJSON("/api/skill-rankings");
  return cache.skillRankings;
}

function getUserSkillRank(skillRankings, username, skill) {
  if (
    !skillRankings ||
    !skillRankings.rankings ||
    !skillRankings.rankings[skill]
  )
    return null;
  const skillData = skillRankings.rankings[skill];
  const playerData = skillData.find((p) => p.username === username);
  return playerData ? playerData.rank : null;
}

function updateSummary(user, skillRankings) {
  const rankEl = $("#topRankSummary span");
  const levelEl = $("#topLevelSummary span");
  if (!rankEl || !levelEl) return;
  if (!user) {
    rankEl.textContent = "Highest rank: —";
    levelEl.textContent = "Highest level: —";
    return;
  }

  // Highest rank (lowest rank number)
  let bestRank = Infinity;
  let bestRankSkill = null;
  SKILLS.forEach((s) => {
    const r = getUserSkillRank(skillRankings, user.username, s);
    if (r && r < bestRank) {
      bestRank = r;
      bestRankSkill = s;
    }
  });
  if (bestRankSkill) {
    const name =
      bestRankSkill.charAt(0).toUpperCase() + bestRankSkill.slice(1);
    rankEl.textContent = `Highest rank: ${name} (#${bestRank})`;
  } else {
    rankEl.textContent = "Highest rank: —";
  }

  // Highest level/XP
  let bestLevel = -1;
  let bestXp = -1;
  let bestLevelSkill = null;
  SKILLS.forEach((s) => {
    const skill = user.skills[s];
    const lvl = skill?.level || 1;
    const xp = skill?.xp || 0;
    if (lvl > bestLevel || (lvl === bestLevel && xp > bestXp)) {
      bestLevel = lvl;
      bestXp = xp;
      bestLevelSkill = s;
    }
  });
  if (bestLevelSkill) {
    const name =
      bestLevelSkill.charAt(0).toUpperCase() + bestLevelSkill.slice(1);
    levelEl.textContent = `Highest level: ${name} (Lv. ${bestLevel}, ${bestXp.toLocaleString()} XP)`;
  } else {
    levelEl.textContent = "Highest level: —";
  }
}

// ---------- Views ----------
function renderHomeView() {
  const root = $("#viewRoot");
  root.innerHTML = "";

  const section = el("section", "flex flex-col gap-6");

  // Header section
  const headerDiv = el(
    "div",
    "flex items-center justify-between flex-wrap gap-4",
  );
  headerDiv.appendChild(
    el("h2", "text-2xl font-bold flex items-center gap-2 text-foreground", [
      text("🏆 Overall Leaderboard"),
    ]),
  );

  const statsDiv = el("div", "flex gap-3 flex-wrap text-muted text-sm");
  // Will be updated after data load
  statsDiv.appendChild(el("div", "badge js-leaderboard-range", [text("Loading…")]));
  section.appendChild(headerDiv);

  // Table wrapper with OSRS styling
  const tableWrap = el("div", "osrs-table home-leaderboard");
  // Always treat home leaderboard as wide, rely on CSS media queries for padding
  tableWrap.classList.add('full-width');
  // Scroll container to enable sticky header without stretching page
  const scrollWrap = el("div", "table-scroll");
  const table = el("table", "min-w-full leaderboard-table");
  table.innerHTML = `<thead><tr><th>Rank</th><th class="text-left">Player</th><th>Total Level</th><th>Total Experience</th></tr></thead><tbody></tbody>`;
  scrollWrap.appendChild(table);
  tableWrap.appendChild(scrollWrap);
  section.appendChild(tableWrap);
  root.appendChild(section);

  const tbody = table.querySelector("tbody");
  tbody.innerHTML =
    '<tr><td colspan="4" class="text-center text-muted py-8">⏳ Loading leaderboard...</td></tr>';

  // Pagination state (page size chosen to balance density)
  let page = 1;
  const pageSize = 50; // show 50 at a time to avoid overwhelming UI

  // Controls UI
  const controls = el("div", "flex items-center justify-between gap-4 flex-wrap text-sm bg-layer2 p-3 rounded border-2 border-border-dark");
  controls.innerHTML = `
      <div class="flex items-center gap-2">
        <button class="btn-sm" data-action="prev">← Prev</button>
        <button class="btn-sm" data-action="next">Next →</button>
      </div>
      <div class="font-semibold">Page <span class="js-page">1</span> / <span class="js-pages">1</span></div>
      <div class="opacity-70 js-range"></div>
    `;
  section.appendChild(controls);

  function renderPage(data) {
    const players = data.players || [];
    const total = players.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) page = totalPages;
    const start = (page - 1) * pageSize;
    const slice = players.slice(start, start + pageSize);
    tbody.innerHTML = "";
    if (!slice.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-6">No players</td></tr>';
    } else {
      slice.forEach((p) => {
        const tr = document.createElement("tr");
        let rankDisplay = p.rank;
        if (p.rank === 1) rankDisplay = "🥇 " + p.rank;
        else if (p.rank === 2) rankDisplay = "🥈 " + p.rank;
        else if (p.rank === 3) rankDisplay = "🥉 " + p.rank;
        if (p.rank === 1) tr.classList.add("rank-1");
        else if (p.rank === 2) tr.classList.add("rank-2");
        else if (p.rank === 3) tr.classList.add("rank-3");
        tr.innerHTML = `
              <td class="text-center font-bold">${rankDisplay}</td>
              <td>
                  <button class="username-link" data-user="${p.username}" aria-label="View ${p.username} stats">${p.username}</button>
              </td>
              <td class="text-center skill-level">${p.totalLevel}</td>
              <td class="text-right skill-xp">${p.totalXP.toLocaleString()}</td>`;
        tbody.appendChild(tr);
      });
    }
    // Update footer controls & stats pill
    controls.querySelector('.js-page').textContent = String(page);
    controls.querySelector('.js-pages').textContent = String(totalPages);
    const rangeStart = total ? start + 1 : 0;
    const rangeEnd = Math.min(total, start + pageSize);
    const rangeEl = controls.querySelector('.js-range');
    rangeEl.textContent = `Showing ${rangeStart}–${rangeEnd} of ${total} (limit ${LEADERBOARD_LIMIT})`;
    const pill = statsDiv.querySelector('.js-leaderboard-range');
    if (pill) pill.textContent = `Players ${rangeStart}–${rangeEnd}`;
  }

  controls.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const act = btn.getAttribute('data-action');
    if (act === 'prev' && page > 1) { page--; renderPage(cache.leaderboard); }
    if (act === 'next') { const players = cache.leaderboard?.players || []; const maxPages = Math.ceil(players.length / pageSize) || 1; if (page < maxPages) { page++; renderPage(cache.leaderboard); } }
  });

  loadLeaderboard()
    .then((data) => {
      renderPage(data);
      // Update total players badge
      if (data.totalPlayers > 0) {
        statsDiv.appendChild(
          el("div", "badge", [text(`${data.totalPlayers} total players`)]),
        );
      }
    })
    .catch((e) => {
      const htmlLike = /Received HTML|Unexpected content-type/.test(e.message);
      const hint = htmlLike
        ? '<div class="mt-4 text-sm text-left max-w-lg mx-auto p-4 bg-layer2 rounded border-l-4 border-accent">⚠️ <strong>Backend not mounted:</strong><br>Verify _worker.js is present at repo root and KV binding HISCORES_KV is configured in Pages project settings. Also ensure deployment finished successfully.<br><br><code class="bg-layer p-1 rounded text-xs">/api/health</code> should return JSON.</div>'
        : "";
      tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8"><div class="text-danger font-semibold">❌ ${e.message}</div>${hint}</td></tr>`;
    });
}

async function loadUser(username) {
  return fetchJSON("/api/users/" + encodeURIComponent(username));
}

function renderUserView(username) {
  const root = $("#viewRoot");
  root.innerHTML =
    '<div class="text-center text-muted py-8">⏳ Loading player data...</div>';

  Promise.all([
    loadUser(username),
    loadSkillRankings(),
    loadLeaderboard().catch(() => null),
  ])
    .then(([user, skillRankings, leaderboard]) => {
      const wrap = el("div", "flex flex-col gap-8");

      // User header with enhanced styling
      const headerSection = el(
        "div",
        "bg-layer2 p-6 rounded-lg border-2 border-border-dark",
      );
      const headerContent = el(
        "div",
        "flex items-center justify-between flex-wrap gap-4",
      );

      const userInfo = el("div", "flex items-center gap-3 flex-wrap");
      userInfo.appendChild(
        el("h3", "font-bold text-foreground", [text(`⚔️ ${user.username}`)]),
      );

      // Calculate combat level (simplified)
      const attack = user.skills.attack.level;
      const strength = user.skills.strength.level;
      const defence = user.skills.defence.level;
      const hitpoints = user.skills.hitpoints.level;
      const ranged = user.skills.ranged.level;
      const magic = user.skills.magic.level;
      const prayer = user.skills.prayer.level;

      const combatLevel = Math.floor(
        (defence + hitpoints + Math.floor(prayer / 2)) * 0.25 +
        Math.max(attack + strength, Math.max(ranged * 1.5, magic * 1.5)) *
        0.325,
      );

      // Inline metadata badges next to username
      const meta = el(
        "div",
        "meta-badges text-sm flex items-center gap-2 flex-wrap",
      );
      meta.appendChild(
        el("span", "meta-badge", [text(`Combat Lv. ${combatLevel}`)]),
      );
      {
        if (user.createdAt) {
          const createdStr = new Date(user.createdAt).toLocaleDateString();
          meta.appendChild(
            el("span", "meta-badge", [text(`Created ${createdStr}`)]),
          );
        }
        if (user.updatedAt) {
          const updatedStr = new Date(user.updatedAt).toLocaleString();
          const rel = formatRelativeTime(user.updatedAt);
          const badge = el("span", "meta-badge meta-badge--muted", [text(`Updated ${rel}`)]);
          badge.setAttribute('title', `Updated ${updatedStr}`);
          meta.appendChild(badge);
        }
      }
      userInfo.appendChild(meta);

      headerContent.appendChild(userInfo);
      headerSection.appendChild(headerContent);
      wrap.appendChild(headerSection);

      // Compute aggregate stats for comparison & averages
      const allSkillRankings = skillRankings.rankings || {};
      const averages = {};
      SKILLS.forEach((s) => {
        const arr = allSkillRankings[s] || [];
        if (arr.length) {
          const totalLvl = arr.reduce((sum, p) => sum + (p.level || 0), 0);
          const totalXp = arr.reduce((sum, p) => sum + (p.xp || 0), 0);
          averages[s] = {
            level: totalLvl / arr.length,
            xp: totalXp / arr.length
          };
        } else {
          averages[s] = { level: 1, xp: 0 };
        }
      });

      // --- Achievements detection (expanded) ---
      function buildAchievements(user, skillRankings) {
        const out = [];
        const now = Date.now();
        // Helper: push achievement
        function add(obj) { out.push(obj); }
        // Per-skill level thresholds (pick highest per skill)
        const LEVEL_THRESHOLDS = [80, 90, 99];
        SKILLS.forEach(s => {
          const sk = user.skills[s];
          if (!sk) return;
          const lvl = sk.level || 1;
          for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
            const t = LEVEL_THRESHOLDS[i];
            if (lvl >= t) {
              if (t === 99) {
                add({ key: `skill-99-${s}`, icon: '🏅', label: `99 ${s}`, desc: `Reached level 99 in ${s}.`, category: 'skill', priority: 10 });
              } else {
                add({ key: `skill-${t}-${s}`, icon: '🆙', label: `${s} ${t}+`, desc: `Reached level ${t} or higher in ${s}.`, category: 'skill', priority: 30 + t });
              }
              break; // only highest threshold
            }
          }
          // Rank achievements
          const rank = getUserSkillRank(skillRankings, username, s);
          if (rank) {
            if (rank === 1) add({ key: `rank-1-${s}`, icon: '🥇', label: `#1 ${s}`, desc: `Rank 1 on the ${s} hiscores.`, category: 'rank', priority: 1 });
            else if (rank <= 3) add({ key: `rank-top3-${s}`, icon: '🥉', label: `Top 3 ${s}`, desc: `Top 3 placement in ${s}.`, category: 'rank', priority: 2 });
            else if (rank <= 10) add({ key: `rank-top10-${s}`, icon: '📈', label: `Top 10 ${s}`, desc: `Top 10 placement in ${s}.`, category: 'rank', priority: 3 });
          }
        });
        // Account-wide level milestones
        const allLevels = SKILLS.map(s => user.skills[s]?.level || 1);
        const minLevel = Math.min(...allLevels);
        const maxLevel = Math.max(...allLevels);
        const totalLevel = allLevels.reduce((a, b) => a + b, 0);
        const all99 = allLevels.every(l => l >= 99);
        const milestones = [500, 1000, 1500, 2000];
        for (let i = milestones.length - 1; i >= 0; i--) {
          const m = milestones[i];
          if (totalLevel >= m) { add({ key: `total-${m}`, icon: '📊', label: `Total ${m}+`, desc: `Reached a combined total level of ${m} or higher.`, category: 'account', priority: 50 + m }); break; }
        }
        if (all99) add({ key: 'maxed-account', icon: '👑', label: 'Maxed Account', desc: 'Achieved level 99 in every skill.', category: 'account', priority: 5 });
        // Balanced vs Specialist
        if (minLevel >= 40 && (maxLevel - minLevel) <= 30) {
          add({ key: 'balanced', icon: '⚖️', label: 'Balanced', desc: 'Maintained relatively even progress across all skills.', category: 'style', priority: 60 });
        }
        const lowSkills = allLevels.filter(l => l < 50).length;
        const has99 = allLevels.some(l => l >= 99);
        if (has99 && lowSkills >= 5) {
          add({ key: 'specialist', icon: '🎯', label: 'Specialist', desc: 'Has at least one 99 skill while many others remain under 50.', category: 'style', priority: 61 });
        }
        // Performance vs Average
        const aboveAvg = SKILLS.filter(s => (user.skills[s]?.level || 1) > (averages[s]?.level || 1)).length;
        const ratio = aboveAvg / SKILLS.length;
        if (ratio >= 0.90) add({ key: 'elite', icon: '🚀', label: 'Elite', desc: `Above average in at least 90% of skills.`, category: 'performance', priority: 39 });
        // Activity achievements
        if (user.updatedAt) {
          const updated = new Date(user.updatedAt).getTime();
          const diffH = (now - updated) / 3600000;
          if (diffH <= 24) add({ key: 'active-today', icon: '🕒', label: 'Active Today', desc: 'Account updated within the last 24 hours.', category: 'activity', priority: 70 });
          else if (diffH <= 24 * 7) add({ key: 'active-week', icon: '🔄', label: 'Active This Week', desc: 'Account updated within the last 7 days.', category: 'activity', priority: 71 });
        }
        // Consolidate duplicates (keep highest priority = lowest number)
        const map = new Map();
        out.forEach(a => {
          if (!map.has(a.key) || map.get(a.key).priority > a.priority) {
            map.set(a.key, a);
          }
        });
        // Sort by priority then label
        return Array.from(map.values()).sort((a, b) => a.priority - b.priority || a.label.localeCompare(b.label));
      }
      const achievements = buildAchievements(user, skillRankings);

      // Achievements section
      if (achievements.length) {
        const achSection = el('div', 'flex flex-col gap-2');
        achSection.appendChild(el('h4', 'font-semibold flex items-center gap-2', [text(`🏅 Achievements (${achievements.length})`)]));
        const wrapBadges = el('div', 'flex flex-wrap gap-2');
        achievements.slice(0, 50).forEach(a => {
          const badge = el('span', `achievement-badge achievement-${a.category}`, [text(`${a.icon} ${a.label}`)]);
          badge.setAttribute('data-tooltip', a.desc);
          wrapBadges.appendChild(badge);
        });
        achSection.appendChild(wrapBadges);
        headerSection.appendChild(achSection);
      }



      // Hiscores table (column layout like OSRS)
      const section = el("section", "flex flex-col gap-4");
      const headerRow = el("div", "flex items-center justify-between");
      headerRow.appendChild(
        el("h3", "text-2xl font-bold text-foreground", [text("📜 Hiscores")]),
      );
      section.appendChild(headerRow);

      const tableWrap = el("div", "osrs-table");
      const table = el("table", "min-w-full text-sm");
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

      const tbody = table.querySelector("tbody");

      // Determine overall rank from leaderboard (if available)
      let overallRank = null;
      if (leaderboard && leaderboard.players) {
        const found = leaderboard.players.find(
          (p) => p.username === user.username,
        );
        if (found) overallRank = found.rank;
      }

      // Overall row
      const totalLevel =
        user.totalLevel ||
        SKILLS.reduce((sum, s) => sum + (user.skills[s]?.level || 1), 0);
      const totalXP =
        user.totalXP ||
        SKILLS.reduce((sum, s) => sum + (user.skills[s]?.xp || 0), 0);
      const overallTr = document.createElement("tr");
      overallTr.classList.add("font-bold");
      overallTr.innerHTML = `
          <td class="text-left">Overall</td>
          <td class="text-center skill-level">${totalLevel}</td>
          <td class="text-right skill-xp">${totalXP.toLocaleString()}</td>
          <td class="text-center skill-rank">${overallRank ? "#" + overallRank : "—"}</td>
        `;
      tbody.appendChild(overallTr);

      // Per-skill rows
      SKILLS.forEach((skillName) => {
        const skill = user.skills[skillName];
        const rank = getUserSkillRank(skillRankings, username, skillName);

        const tr = document.createElement("tr");

        // Decorative highlight for top 3 ranks
        if (rank === 1) tr.classList.add("rank-1");
        else if (rank === 2) tr.classList.add("rank-2");
        else if (rank === 3) tr.classList.add("rank-3");

        // Clickable if any meaningful progress
        const baseXP = skillName === "hitpoints" ? 1154 : 0;
        const isClickable =
          (skill?.level || 1) > 1 || (skill?.xp || 0) > baseXP;
        if (isClickable) {
          tr.classList.add("clickable");
          tr.addEventListener("click", () => {
            window.open(
              `skill-hiscores.html?skill=${skillName}#skill=${skillName}`,
              "_blank",
            );
          });
        }

        const iconUrl = window.getSkillIcon(skillName);
        const nameCell = document.createElement("td");
        nameCell.className = "text-left";
        nameCell.innerHTML = `${iconUrl ? `<img src="${iconUrl}" class="skill-icon skill-icon--sm" alt="${skillName}">` : ""}<span class="skill-name text-capitalize">${skillName}</span>`;

        const lvl = skill?.level ?? 1;
        const xp = skill?.xp ?? 0;

        tr.appendChild(nameCell);
        tr.appendChild(
          el("td", "text-center skill-level", [text(String(lvl))]),
        );
        tr.appendChild(
          el("td", "text-right skill-xp", [text(xp.toLocaleString())]),
        );
        tr.appendChild(
          el("td", "text-center skill-rank", [text(rank ? `#${rank}` : "—")]),
        );

        tbody.appendChild(tr);
      });
      updateSummary(user, skillRankings);
      root.innerHTML = "";
      root.appendChild(wrap);
    })
    .catch(() => {
      root.innerHTML =
        '<div class="text-center py-8"><div class="text-danger text-xl font-semibold">❌ Player not found</div><div class="text-muted mt-2">The player you\'re looking for doesn\'t exist in our database.</div></div>';
      updateSummary(null);
    });
}

// ---------- Routing ----------
function handleRoute() {
  const hash = location.hash.slice(1);
  if (!hash) {
    renderHomeView();
    updateSummary(null);
  } else if (hash.startsWith("user/")) {
    const u = decodeURIComponent(hash.split("/")[1]);
    renderUserView(u);
  } else {
    renderHomeView();
    updateSummary(null);
  }
}

// ---------- Search + Suggestions ----------
function setupSearch() {
  const input = $("#playerSearch");
  const suggest = $("#searchSuggest");
  let debounce;
  let activeIndex = -1;
  let currentItems = [];
  let loading = false;
  function hideSuggest() {
    suggest.classList.add("hidden");
    suggest.innerHTML = "";
    activeIndex = -1;
    currentItems = [];
    input.setAttribute("aria-expanded", "false");
  }
  function renderSuggest(matches) {
    currentItems = matches;
    suggest.innerHTML = matches
      .map(
        (m, i) =>
          `<button role="option" aria-selected="${i === activeIndex}" data-user="${m}" class="block${i === activeIndex ? " active" : ""}">${m}</button>`,
      )
      .join("");
    suggest.classList.remove("hidden");
    input.setAttribute("aria-expanded", "true");
  }
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const q = input.value.trim().toLowerCase();
      if (!q) {
        hideSuggest();
        return;
      }
      try {
        // Show loading indicator
        loading = true;
        suggest.innerHTML = '<div class="p-2 text-center text-xs text-muted">Loading…</div>';
        suggest.classList.remove('hidden');
        const list = await loadUsers();
        const matches = list.users
          .filter((u) => u.toLowerCase().includes(q))
          .slice(0, 10);
        if (!matches.length) {
          hideSuggest();
          return;
        }
        activeIndex = -1;
        renderSuggest(matches);
      } catch (e) {
        hideSuggest();
      } finally {
        loading = false;
      }
    }, 200);
  });
  input.addEventListener("keydown", (e) => {
    if (suggest.classList.contains("hidden")) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
      }
      return;
    }
    if (e.key === "Escape") {
      hideSuggest();
      input.blur();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIndex = Math.min(currentItems.length - 1, activeIndex + 1);
      renderSuggest(currentItems);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex = Math.max(0, activeIndex - 1);
      renderSuggest(currentItems);
    } else if (e.key === "Enter") {
      if (activeIndex >= 0 && currentItems[activeIndex]) {
        const u = currentItems[activeIndex];
        location.hash = "user/" + encodeURIComponent(u);
        hideSuggest();
      }
    }
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("#searchSuggest button")) {
      const u = e.target.getAttribute("data-user");
      location.hash = "user/" + encodeURIComponent(u);
      hideSuggest();
    } else if (
      !e.target.closest("#playerSearch") &&
      !e.target.closest("#searchSuggest")
    ) {
      hideSuggest();
    }
  });
  input.addEventListener("change", async () => {
    const q = input.value.trim().toLowerCase();
    if (!q) return;
    try {
      const list = await loadUsers();
      const found = list.users.find((u) => u.toLowerCase() === q);
      if (found) location.hash = "user/" + encodeURIComponent(found);
    } catch (_) { }
  });
  // Accessibility attributes
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  suggest.setAttribute("role", "listbox");
}

// ---------- Delegation ----------
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".username-link");
  if (btn) {
    const u = btn.getAttribute("data-user");
    location.hash = "user/" + encodeURIComponent(u);
  }
  if (e.target.id === "themeToggle" || e.target.closest("#themeToggle"))
    toggleTheme();
  const brand = e.target.closest(".brand-link");
  if (brand) {
    e.preventDefault();
    // SPA: go back to main leaderboard view without reload
    location.hash = "";
  }
});

window.addEventListener("hashchange", handleRoute);

// Init
(() => {
  const saved = localStorage.getItem("theme");
  const startTheme =
    saved ||
    (matchMedia && matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light");
  setTheme(startTheme);
  setupSearch();
  handleRoute();
  // Show current API base in footer
  const apiSpan = $("#currentApiBase");
  if (apiSpan && window.API_BASE) {
    const displayBase =
      window.API_BASE === location.origin ? "Same-origin" : window.API_BASE;
    apiSpan.textContent = displayBase;
  }
})();
