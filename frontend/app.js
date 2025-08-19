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

      // --- Achievements System (refactored & expanded) ---
      const LEVEL_THRESHOLDS = [80, 90, 99];
      const TOTAL_LEVEL_MILESTONES = [500, 1000, 1500, 2000];
      // Build full catalog of *possible* achievements (static list + skill generated)
      function buildAchievementCatalog() {
        const catalog = [];
        // Skill level thresholds (one per threshold per skill; user only earns highest attained)
        SKILLS.forEach(s => {
          LEVEL_THRESHOLDS.forEach(t => {
            catalog.push({ key: `skill-${t}-${s}`, icon: t === 99 ? '🏅' : '🆙', label: `${s} ${t}+`, desc: `Reach level ${t} in ${s}.`, category: 'skill', tier: t });
          });
          catalog.push({ key: `rank-1-${s}`, icon: '🥇', label: `#1 ${s}`, desc: `Hold rank 1 in ${s}.`, category: 'rank', rankTier: 1 });
          catalog.push({ key: `rank-top3-${s}`, icon: '🥉', label: `Top 3 ${s}`, desc: `Place top 3 in ${s}.`, category: 'rank', rankTier: 3 });
          catalog.push({ key: `rank-top10-${s}`, icon: '📈', label: `Top 10 ${s}`, desc: `Place top 10 in ${s}.`, category: 'rank', rankTier: 10 });
          // Competitive firsts (client-side only: would need backend flags to be authoritative)
          catalog.push({ key: `first-99-${s}`, icon: '⚡', label: `First 99 ${s}`, desc: `Be the first account to reach 99 ${s}.`, category: 'rank', competitive: true });
          catalog.push({ key: `first-50m-${s}`, icon: '💥', label: `50M ${s}`, desc: `Reach 50,000,000 XP in ${s}.`, category: 'skill', ultra: true });
          catalog.push({ key: `first-200m-${s}`, icon: '🔥', label: `200M ${s}`, desc: `Reach 200,000,000 XP in ${s}. (Extreme)`, category: 'skill', ultra: true });
        });
        TOTAL_LEVEL_MILESTONES.forEach(m => {
          catalog.push({ key: `total-${m}`, icon: '📊', label: `Total ${m}+`, desc: `Reach total level ${m}.`, category: 'account' });
        });
        catalog.push({ key: 'maxed-account', icon: '👑', label: 'Maxed Account', desc: 'Reach 99 in every skill.', category: 'account' });
        catalog.push({ key: 'first-maxed-account', icon: '🌟', label: 'First Maxed', desc: 'Be the first account to max (all 99s).', category: 'account', competitive: true });
        catalog.push({ key: 'first-total-2277', icon: '🏆', label: 'First 2277', desc: 'Be first to total level 2277.', category: 'account', competitive: true });
        catalog.push({ key: 'balanced', icon: '⚖️', label: 'Balanced', desc: 'Maintain min level 40; spread within 30 levels.', category: 'playstyle' });
        catalog.push({ key: 'specialist', icon: '�', label: 'Specialist', desc: 'At least one 99 plus 5+ skills under 50.', category: 'playstyle' });
        catalog.push({ key: 'elite', icon: '🚀', label: 'Elite', desc: 'Above-average in ≥90% of skills.', category: 'performance' });
        // Activity achievements (prevalence not computed globally here)
        catalog.push({ key: 'active-today', icon: '🕒', label: 'Active Today', desc: 'Updated within last 24h.', category: 'activity' });
        catalog.push({ key: 'active-week', icon: '🔄', label: 'Active This Week', desc: 'Updated within last 7d.', category: 'activity' });
        return catalog;
      }
      const ACHIEVEMENT_CATALOG = buildAchievementCatalog();

      function deriveUserAchievements(user, averages) {
        const now = Date.now();
        const results = [];
        const push = (a) => results.push(a);
        // Per skill highest threshold
        SKILLS.forEach(s => {
          const lvl = user.skills[s]?.level || 1;
          for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
            const t = LEVEL_THRESHOLDS[i];
            if (lvl >= t) { push({ key: `skill-${t}-${s}` }); break; }
          }
          const rank = getUserSkillRank(skillRankings, user.username, s);
          if (rank) {
            if (rank === 1) push({ key: `rank-1-${s}` });
            else if (rank <= 3) push({ key: `rank-top3-${s}` });
            else if (rank <= 10) push({ key: `rank-top10-${s}` });
          }
          // XP mega milestones (client-side detection)
          const xp = user.skills[s]?.xp || 0;
          if (xp >= 50_000_000) push({ key: `first-50m-${s}` }); // treat as unlocked once reached (not necessarily first)
          if (xp >= 200_000_000) push({ key: `first-200m-${s}` });
          if (lvl >= 99) push({ key: `first-99-${s}` }); // placeholder (needs backend to know real first)
        });
        const levels = SKILLS.map(s => user.skills[s]?.level || 1);
        const total = levels.reduce((a, b) => a + b, 0);
        for (let i = TOTAL_LEVEL_MILESTONES.length - 1; i >= 0; i--) {
          const m = TOTAL_LEVEL_MILESTONES[i]; if (total >= m) { push({ key: `total-${m}` }); break; }
        }
        if (levels.every(l => l >= 99)) push({ key: 'maxed-account' });
        if (levels.every(l => l >= 99)) push({ key: 'first-maxed-account' }); // placeholder
        if (total >= 2277) push({ key: 'first-total-2277' }); // placeholder
        const minL = Math.min(...levels); const maxL = Math.max(...levels);
        if (minL >= 40 && (maxL - minL) <= 30) push({ key: 'balanced' });
        const lowCount = levels.filter(l => l < 50).length;
        if (levels.some(l => l >= 99) && lowCount >= 5) push({ key: 'specialist' });
        const aboveAvg = SKILLS.filter(s => (user.skills[s]?.level || 1) > (averages[s]?.level || 1)).length;
        if (aboveAvg / SKILLS.length >= 0.90) push({ key: 'elite' });
        if (user.updatedAt) {
          const diffH = (now - user.updatedAt) / 3600000;
          if (diffH <= 24) push({ key: 'active-today' });
          else if (diffH <= 24 * 7) push({ key: 'active-week' });
        }
        const uniq = [...new Set(results.map(r => r.key))];
        return uniq;
      }

      // Global prevalence estimation (client-side using skillRankings)
      async function computeGlobalAchievementStats(skillRankings) {
        if (window.__achievementStats) return window.__achievementStats;
        const rankings = skillRankings.rankings || {};
        // Reconstruct per-user levels (username -> {skill:level})
        const userLevels = new Map();
        SKILLS.forEach(s => {
          (rankings[s] || []).forEach(entry => {
            let obj = userLevels.get(entry.username);
            if (!obj) { obj = { skills: {}, updatedAt: null }; userLevels.set(entry.username, obj); }
            obj.skills[s] = entry.level;
          });
        });
        // Average per skill
        const averagesTmp = {};
        SKILLS.forEach(s => {
          const arr = rankings[s] || [];
          if (!arr.length) { averagesTmp[s] = { level: 1 }; return; }
          const totalLvl = arr.reduce((sum, p) => sum + (p.level || 1), 0);
          averagesTmp[s] = { level: totalLvl / arr.length };
        });
        const globalCounts = new Map();
        const totalPlayers = userLevels.size;
        // Helper to increment
        function inc(key) { globalCounts.set(key, (globalCounts.get(key) || 0) + 1); }
        // Pre-calc rank achievements directly from rankings arrays: ranking arrays are sorted by xp already.
        SKILLS.forEach(s => {
          const arr = rankings[s] || [];
          if (arr[0]) inc(`rank-1-${s}`);
          arr.slice(0, 3).forEach(e => { if (e && e.username) inc(`rank-top3-${s}`); });
          arr.slice(0, 10).forEach(e => { if (e && e.username) inc(`rank-top10-${s}`); });
        });
        // For each user determine highest threshold, milestones, playstyle, performance
        userLevels.forEach((data, uname) => {
          const levels = SKILLS.map(s => data.skills[s] || 1);
          // Highest threshold per skill
          SKILLS.forEach(s => {
            const lvl = data.skills[s] || 1;
            for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) { const t = LEVEL_THRESHOLDS[i]; if (lvl >= t) { inc(`skill-${t}-${s}`); break; } }
          });
          const total = levels.reduce((a, b) => a + b, 0);
          for (let i = TOTAL_LEVEL_MILESTONES.length - 1; i >= 0; i--) { const m = TOTAL_LEVEL_MILESTONES[i]; if (total >= m) { inc(`total-${m}`); break; } }
          if (levels.every(l => l >= 99)) inc('maxed-account');
          const minL = Math.min(...levels); const maxL = Math.max(...levels);
          if (minL >= 40 && (maxL - minL) <= 30) inc('balanced');
          const lowCount = levels.filter(l => l < 50).length;
          if (levels.some(l => l >= 99) && lowCount >= 5) inc('specialist');
          const aboveAvg = SKILLS.filter(s => (data.skills[s] || 1) > (averagesTmp[s]?.level || 1)).length;
          if (aboveAvg / SKILLS.length >= 0.90) inc('elite');
          // activity skipped (needs updatedAt)
        });
        const stats = { counts: Object.fromEntries(globalCounts), totalPlayers, averages: averagesTmp };
        window.__achievementStats = stats;
        return stats;
      }

      computeGlobalAchievementStats(skillRankings).then(globalStats => {
        const userAchievementKeys = deriveUserAchievements(user, globalStats.averages);
        const unlockedSet = new Set(userAchievementKeys);
        if (!unlockedSet.size) return; // nothing to show
        const categoriesOrder = ['skill', 'rank', 'account', 'playstyle', 'performance', 'activity'];
        const categoryLabels = { skill: 'Skill Progress', rank: 'Skill Ranks', account: 'Account Milestones', playstyle: 'Playstyle', performance: 'Performance', activity: 'Activity' };
        // Only include unlocked items
        const catalogByCategory = categoriesOrder.map(cat => ({ cat, items: ACHIEVEMENT_CATALOG.filter(a => a.category === cat && unlockedSet.has(a.key)) }));
        const unlockedVisible = [...unlockedSet].filter(k => ACHIEVEMENT_CATALOG.find(c => c.key === k)).length;

        // Sidebar insertion (compact)
        const panel = el('div', 'flex flex-col gap-3 achievements-panel achievements-panel--compact');
        panel.id = 'sidebarAchievements';
        const header = el('div', 'flex flex-col gap-2');
        const headerLine = el('div', 'flex items-center justify-between gap-2');
        headerLine.appendChild(el('h4', 'font-semibold flex items-center gap-2', [text(`🏅 Achievements (${unlockedVisible})`)]));
        // Filter controls
        const filterWrap = el('div', 'flex items-center gap-1 flex-wrap text-[10px]');
        function makeFilter(label, val, checked = true) {
          const id = 'af-' + val;
          const w = el('label', 'flex items-center gap-1 cursor-pointer select-none');
          const inp = document.createElement('input'); inp.type = 'checkbox'; inp.checked = checked; inp.dataset.filter = val; inp.className = 'ach-filter';
          w.appendChild(inp); w.appendChild(text(label));
          return w;
        }
        filterWrap.appendChild(makeFilter('Skill', 'skill'));
        filterWrap.appendChild(makeFilter('Rank', 'rank'));
        filterWrap.appendChild(makeFilter('Account', 'account'));
        filterWrap.appendChild(makeFilter('Style', 'playstyle'));
        filterWrap.appendChild(makeFilter('Perf', 'performance'));
        filterWrap.appendChild(makeFilter('Activity', 'activity', false));
        filterWrap.appendChild(makeFilter('Competitive', 'competitive')); // competitive flag (firsts)
        filterWrap.appendChild(makeFilter('Ultra', 'ultra'));

        header.appendChild(headerLine);
        header.appendChild(filterWrap);
        panel.appendChild(header);

        catalogByCategory.forEach(group => {
          if (!group.items.length) return;
          const catWrap = el('div', 'achievement-category flex flex-col gap-2');
          const catHeader = el('div', 'flex items-center gap-2');
          const toggleBtn = el('button', 'cat-toggle', [text('▶')]);
          toggleBtn.setAttribute('aria-expanded', 'false');
          const title = el('h5', 'font-semibold text-sm uppercase tracking-wide', [text(categoryLabels[group.cat] || group.cat)]);
          catHeader.appendChild(toggleBtn); catHeader.appendChild(title);
          catWrap.appendChild(catHeader);
          const grid = el('div', 'achievement-grid collapsed anim-capable');
          group.items.forEach(item => {
            const count = globalStats.counts[item.key];
            let prevalence = '';
            if (typeof count === 'number' && globalStats.totalPlayers) prevalence = `${count}/${globalStats.totalPlayers} (${Math.round(count / globalStats.totalPlayers * 100)}%)`;
            if (item.category === 'activity' && !prevalence) prevalence = 'Dynamic';
            const badge = el('div', `achievement-card owned achievement-${item.category}`);
            badge.innerHTML = `
              <div class="ach-icon">${item.icon}</div>
              <div class="ach-body">
                <div class="ach-title">${item.label}</div>
                <div class="ach-desc text-xs">${item.desc}</div>
              </div>`;
            if (prevalence) badge.setAttribute('data-prevalence', prevalence);
            // Rarity tier classes based on prevalence percentage
            if (prevalence && /\((\d+)%\)/.test(prevalence)) {
              const pct = parseInt(prevalence.match(/\((\d+)%\)/)[1], 10);
              if (pct <= 1) badge.classList.add('rarity-mythic');
              else if (pct <= 5) badge.classList.add('rarity-legendary');
              else if (pct <= 15) badge.classList.add('rarity-epic');
              else if (pct <= 35) badge.classList.add('rarity-rare');
              else badge.classList.add('rarity-common');
            }
            if (item.competitive) badge.classList.add('ach-competitive');
            if (item.ultra) badge.classList.add('ach-ultra');
            badge.dataset.category = item.category;
            if (item.competitive) badge.dataset.competitive = '1';
            if (item.ultra) badge.dataset.ultra = '1';
            grid.appendChild(badge);
          });
          catWrap.appendChild(grid);
          toggleBtn.addEventListener('click', () => {
            const expanded = toggleBtn.getAttribute('aria-expanded') === 'true';
            toggleBtn.setAttribute('aria-expanded', String(!expanded));
            toggleBtn.textContent = expanded ? '▶' : '▼';
            if (grid.classList.contains('anim-capable')) {
              if (expanded) {
                grid.style.maxHeight = grid.scrollHeight + 'px';
                requestAnimationFrame(() => {
                  grid.classList.add('collapsed');
                  grid.style.maxHeight = '0px';
                  grid.style.opacity = '0';
                });
              } else {
                grid.classList.remove('collapsed');
                grid.style.maxHeight = '0px';
                grid.style.opacity = '0';
                requestAnimationFrame(() => {
                  grid.style.maxHeight = grid.scrollHeight + 'px';
                  grid.style.opacity = '1';
                  setTimeout(() => { grid.style.maxHeight = ''; }, 400);
                });
              }
            } else {
              grid.classList.toggle('collapsed');
            }
          });
          panel.appendChild(catWrap);
        });

        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
          const summaryBlock = sidebar.querySelector('.summary');
          if (summaryBlock) summaryBlock.insertAdjacentElement('afterend', panel); else sidebar.appendChild(panel);
          // Inject summary line link
          const summaryList = summaryBlock && summaryBlock.querySelector('ul');
          if (summaryList) {
            let achLine = document.getElementById('summaryAchievementsLine');
            if (achLine) achLine.remove();
            achLine = document.createElement('li');
            achLine.id = 'summaryAchievementsLine';
            achLine.className = 'flex items-center gap-2';
            achLine.innerHTML = '<i data-lucide="medal" class="w-4 h-4"></i><span><button type="button" class="underline hover:text-accent text-left" id="openAllAchievements">Achievements: ' + unlockedVisible + '</button></span>';
            summaryList.appendChild(achLine);
            // wire up icon refresh
            if (window.lucide) window.lucide.createIcons();
            document.getElementById('openAllAchievements').addEventListener('click', () => {
              // expand all categories & scroll into view
              panel.querySelectorAll('.cat-toggle').forEach(btn => {
                if (btn.getAttribute('aria-expanded') === 'false') btn.click();
              });
              panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
          }
        } else {
          headerSection.appendChild(panel); // fallback
        }

        // Filter logic
        const filters = panel.querySelectorAll('.ach-filter');
        function applyFilters() {
          const activeCats = new Set();
          const showCompetitive = panel.querySelector('input[data-filter="competitive"]').checked;
          const showUltra = panel.querySelector('input[data-filter="ultra"]').checked;
          filters.forEach(f => { if (f.dataset.filter && f.checked && !['competitive', 'ultra'].includes(f.dataset.filter)) activeCats.add(f.dataset.filter); });
          panel.querySelectorAll('.achievement-card').forEach(card => {
            const cat = card.dataset.category;
            const isComp = card.classList.contains('ach-competitive');
            const isUltra = card.classList.contains('ach-ultra');
            const catAllowed = activeCats.has(cat);
            const compAllowed = isComp ? showCompetitive : true;
            const ultraAllowed = isUltra ? showUltra : true;
            card.style.display = (catAllowed && compAllowed && ultraAllowed) ? '' : 'none';
          });
        }
        filters.forEach(f => f.addEventListener('change', applyFilters));
        applyFilters();
      });



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
