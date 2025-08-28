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
  // Clear any left-side extras when on home view
  const leftExtras = document.querySelector('#leftStackExtras');
  if (leftExtras) leftExtras.innerHTML = '';

  const section = el("section", "flex flex-col gap-6");

  // Header section
  const headerDiv = el(
    "div",
    "flex items-center justify-between flex-wrap gap-4",
  );
  const titleEl = el("h2", "text-2xl font-bold flex items-center gap-2 text-foreground", [
    text("🏆 Overall Leaderboard"),
  ]);
  headerDiv.appendChild(titleEl);

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

  // Preload skill rankings for achievement badges (best-effort)
  let rankingsCache = null;
  loadSkillRankings().then(r => { rankingsCache = r; if (cache.leaderboard) renderPage(cache.leaderboard); }).catch(() => { });

  function buildTop1Counts(rankings) {
    const map = new Map();
    if (!rankings || !rankings.rankings) return map;
    const R = rankings.rankings;
    (window.SKILLS || []).forEach(s => {
      const arr = R[s] || [];
      if (arr[0] && arr[0].username) {
        const u = arr[0].username;
        map.set(u, (map.get(u) || 0) + 1);
      }
    });
    return map;
  }

  function inferTierFromRank(rank, totalPlayers, top1Skills = 0) {
    if (!rank || !totalPlayers) return null;
    const p = rank / totalPlayers;
    if (p <= 0.00001 || top1Skills >= 3) return 'Grandmaster';
    if (p <= 0.0001) return 'Master';
    if (p <= 0.001) return 'Diamond';
    if (p <= 0.01) return 'Platinum';
    if (p <= 0.05) return 'Gold';
    if (p <= 0.20) return 'Silver';
    if (p <= 0.50) return 'Bronze';
    // fallbacks by level can be added if needed, but we keep UI concise here
    return null;
  }

  function addMiniBadges(cell, player, rankings, totalPlayers) {
    try {
      const wrap = document.createElement('div');
      wrap.className = 'mini-badges';
      const add = (textContent, title, extraCls = '') => {
        const b = document.createElement('span');
        b.className = 'mini-badge' + (extraCls ? ' ' + extraCls : '');
        b.textContent = textContent;
        if (title) b.title = title;
        wrap.appendChild(b);
      };

      // Pre-calc top1 count
      let top1 = 0;
      if (rankings) {
        const map = buildTop1Counts(rankings);
        top1 = map.get(player.username) || 0;
      }

      // Tier fallback if missing
      const tier = player.tier || inferTierFromRank(player.rank, totalPlayers, top1);
      if (tier && !player.tier) {
        const tb = document.createElement('span');
        tb.className = `tier-badge tier-${tier.toLowerCase()}`;
        tb.textContent = tier;
        tb.title = `${tier} • Overall #${player.rank}${top1 ? ` • #1 in ${top1} skills` : ''}`;
        cell.appendChild(tb);
      }

      // Prestige badges (limit to avoid clutter)
      let added = 0; const LIMIT = 3;
      if (top1 >= 3 && added < LIMIT) { add('👑 Triple Crown', '#1 in 3+ skills', 'mini-badge--highlight'); added++; }
      else if (top1 >= 1 && added < LIMIT) { add(`🥇 x${top1}`, 'Rank #1 in skills'); added++; }

      if (player.totalLevel >= 2277 && added < LIMIT) { add('👑 Maxed', 'All skills 99'); added++; }
      else if (player.totalLevel >= 2000 && added < LIMIT) { add('📈 2k+', 'Total level 2000+'); added++; }

      if (player.updatedAt && added < LIMIT) {
        const diffH = (Date.now() - player.updatedAt) / 3600000;
        if (diffH <= 24) { add('🕒 Today', 'Updated within 24h'); added++; }
        else if (diffH <= 168) { add('🔄 Week', 'Updated within 7 days'); added++; }
      }

      if (wrap.childNodes.length) cell.appendChild(wrap);
    } catch (_) { }
  }

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
        const tierTitle = p.tierInfo && p.tierInfo.top1Skills != null ? ` title="${p.tier} • Overall #${p.rank}${p.tierInfo.top1Skills ? ` • #1 in ${p.tierInfo.top1Skills} skills` : ''}"` : '';
        const tierBadge = p.tier ? `<span class="tier-badge tier-${p.tier.toLowerCase()}"${tierTitle}>${p.tier}</span>` : "";
        tr.innerHTML = `
              <td class="text-center font-bold">${rankDisplay}</td>
              <td>
                  <button class="username-link" data-user="${p.username}" aria-label="View ${p.username} stats">${p.username}</button>
                  ${tierBadge}
              </td>
              <td class="text-center skill-level">${p.totalLevel}</td>
              <td class="text-right skill-xp">${p.totalXP.toLocaleString()}</td>`;
        tbody.appendChild(tr);

        // Enhance player cell with client-side badges
        const playerCell = tr.children[1];
        addMiniBadges(playerCell, p, rankingsCache, (cache.leaderboard && cache.leaderboard.totalPlayers) || players.length);
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
      // Tier prevalence quick pills
      if (data.tiers) {
        const tiers = data.tiers;
        const order = ["Grandmaster", "Master", "Diamond", "Platinum", "Gold", "Silver", "Bronze"]; // show elites first
        order.forEach(tn => {
          if (tiers[tn] > 0) {
            const pct = data.totalPlayers ? Math.round((tiers[tn] / data.totalPlayers) * 1000) / 10 : 0;
            const pill = el("div", `badge tier-badge tier-${tn.toLowerCase()}`, [text(`${tn} ${pct}%`)]);
            statsDiv.appendChild(pill);
          }
        });
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
  // Clear left-side extras before loading new user content
  const __leftExtrasInit = document.querySelector('#leftStackExtras');
  if (__leftExtrasInit) __leftExtrasInit.innerHTML = '';

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
        "bg-layer2 p-6 rounded-lg border-2 border-border-dark primary-header-card",
      );
      const headerContent = el(
        "div",
        "flex items-center justify-between flex-wrap gap-4",
      );

      const userInfo = el("div", "flex items-center gap-3 flex-wrap");
      const nameWrap = el("h3", "font-bold text-foreground flex items-center gap-2");
      nameWrap.appendChild(text(`⚔️ ${user.username}`));
      // try to fetch leaderboard to display tier badge next to name
      // (we have it from Promise.all)
      if (leaderboard && leaderboard.players) {
        const me = leaderboard.players.find(p => p.username === user.username);
        if (me && me.tier) {
          const b = document.createElement('span');
          b.className = `tier-badge tier-${me.tier.toLowerCase()}`;
          b.textContent = me.tier;
          if (me.rank || (me.tierInfo && typeof me.tierInfo.top1Skills === 'number')) {
            b.title = `${me.tier} • Overall #${me.rank}${me.tierInfo && me.tierInfo.top1Skills ? ` • #1 in ${me.tierInfo.top1Skills} skills` : ''}`;
          }
          nameWrap.appendChild(b);
        }
      }
      userInfo.appendChild(nameWrap);

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
      // Overall rank meta badge (from leaderboard)
      if (leaderboard && leaderboard.players) {
        const me = leaderboard.players.find(p => p.username === user.username);
        if (me && me.rank) {
          meta.appendChild(el('span', 'meta-badge', [text(`Overall #${me.rank}`)]));
        }
      }
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
        // Meta tier achievements
        const tiers = [
          { key: 'tier-grandmaster', icon: '👑', label: 'Grandmaster', desc: 'Ultra-elite: top 0.001% or #1 in 3+ skills.', category: 'tier' },
          { key: 'tier-master', icon: '🏆', label: 'Master', desc: 'Top 0.01% overall.', category: 'tier' },
          { key: 'tier-diamond', icon: '💎', label: 'Diamond', desc: 'Top 0.1% overall.', category: 'tier' },
          { key: 'tier-platinum', icon: '🥈', label: 'Platinum', desc: 'Top 1% overall.', category: 'tier' },
          { key: 'tier-gold', icon: '🥇', label: 'Gold', desc: 'Top 5% overall.', category: 'tier' },
          { key: 'tier-silver', icon: '🥈', label: 'Silver', desc: 'Top 20% overall.', category: 'tier' },
          { key: 'tier-bronze', icon: '🥉', label: 'Bronze', desc: 'Top 50% overall.', category: 'tier' },
          { key: 'tier-expert', icon: '📜', label: 'Expert', desc: 'High total level prowess.', category: 'tier' },
          { key: 'tier-adept', icon: '📘', label: 'Adept', desc: 'Solid progression.', category: 'tier' },
          { key: 'tier-novice', icon: '📗', label: 'Novice', desc: 'Starting the journey.', category: 'tier' },
        ];
        tiers.forEach(t => catalog.push(t));
        // Multi-top achievement
        catalog.push({ key: 'triple-crown', icon: '👑', label: 'Triple Crown', desc: 'Hold #1 rank in 3 or more skills.', category: 'rank' });
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
        // Tier-based achievement via leaderboard data
        if (leaderboard && leaderboard.players) {
          const me = leaderboard.players.find(p => p.username === user.username);
          if (me && me.tier) {
            const key = `tier-${me.tier.toLowerCase()}`;
            push({ key });
          }
          if (me && me.tierInfo && typeof me.tierInfo.top1Skills === 'number' && me.tierInfo.top1Skills >= 3) {
            push({ key: 'triple-crown' });
          } else {
            // Fallback using per-skill rankings
            let c1 = 0; SKILLS.forEach(s => { const r = getUserSkillRank(skillRankings, user.username, s); if (r === 1) c1++; });
            if (c1 >= 3) push({ key: 'triple-crown' });
          }
        }
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
      async function computeGlobalAchievementStats(skillRankings, leaderboard) {
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
        // Prefer authoritative total player count from leaderboard
        const totalPlayers = (leaderboard && leaderboard.totalPlayers) ? leaderboard.totalPlayers : userLevels.size;
        // Helper to increment
        function inc(key) { globalCounts.set(key, (globalCounts.get(key) || 0) + 1); }
        // Pre-calc rank achievements directly from rankings arrays: ranking arrays are sorted by xp already.
        SKILLS.forEach(s => {
          const arr = rankings[s] || [];
          if (arr[0]) inc(`rank-1-${s}`);
          arr.slice(0, 3).forEach(e => { if (e && e.username) inc(`rank-top3-${s}`); });
          arr.slice(0, 10).forEach(e => { if (e && e.username) inc(`rank-top10-${s}`); });
        });
        // Count users who hold #1 in at least 3 skills (approx using arr[0] only per skill)
        const r1Map = new Map();
        SKILLS.forEach(s => {
          const arr = rankings[s] || [];
          if (arr[0] && arr[0].username) {
            const u = arr[0].username;
            r1Map.set(u, (r1Map.get(u) || 0) + 1);
          }
        });
        r1Map.forEach((cnt, u) => { if (cnt >= 3) inc('triple-crown'); });
        // Tier achievements counts from leaderboard summary if available
        if (leaderboard && leaderboard.tiers) {
          const t = leaderboard.tiers;
          const map = {
            'tier-grandmaster': 'Grandmaster',
            'tier-master': 'Master',
            'tier-diamond': 'Diamond',
            'tier-platinum': 'Platinum',
            'tier-gold': 'Gold',
            'tier-silver': 'Silver',
            'tier-bronze': 'Bronze',
            'tier-expert': 'Expert',
            'tier-adept': 'Adept',
            'tier-novice': 'Novice'
          };
          Object.entries(map).forEach(([k, v]) => { if (t[v]) globalCounts.set(k, (globalCounts.get(k) || 0) + t[v]); });
        }
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

      // Function to render achievements section with expand/collapse functionality
      function renderAchievementsSection(container, achievements) {
        container.innerHTML = ''; // Clear existing content

        if (!achievements || achievements.length === 0) return;

        // Create achievements section 
        const achievementsSection = el('div', 'user-achievements mb-6 bg-layer2 p-4 rounded-lg border-2 border-border-dark');

        const achievementsHeader = el('div', 'flex items-center justify-between mb-3');
        achievementsHeader.appendChild(
          el('h4', 'text-lg font-medium text-foreground flex items-center gap-2',
            [text(`🏅 Achievements (${achievements.length})`)]
          )
        );

        // Show top achievements in a clean grid (limit to prevent overwhelming)
        const maxVisible = 8;
        const topAchievements = achievements.slice(0, maxVisible);

        // Create grid container that will hold all achievements
        const achievementsGrid = el('div', 'achievements-inline-grid');
        const expandableGrid = el('div', 'expandable-achievements-grid');

        // Add visible achievements
        topAchievements.forEach(achievement => {
          const achievementCard = createAchievementCard(achievement);
          achievementsGrid.appendChild(achievementCard);
        });

        expandableGrid.appendChild(achievementsGrid);

        // If there are more achievements, create the expandable section
        if (achievements.length > maxVisible) {
          const hiddenAchievements = achievements.slice(maxVisible);
          const hiddenGrid = el('div', 'hidden-achievements-grid hidden');

          hiddenAchievements.forEach(achievement => {
            const achievementCard = createAchievementCard(achievement);
            hiddenGrid.appendChild(achievementCard);
          });

          expandableGrid.appendChild(hiddenGrid);

          // Create expandable indicator with hover and click functionality
          const moreIndicator = el('div', 'achievements-expand-toggle text-sm text-muted mt-3 text-center cursor-pointer hover:text-accent transition-colors duration-200 select-none');
          moreIndicator.appendChild(text(`+${hiddenAchievements.length} more achievements`));

          let isExpanded = false;

          moreIndicator.addEventListener('click', () => {
            isExpanded = !isExpanded;

            if (isExpanded) {
              hiddenGrid.classList.remove('hidden');
              moreIndicator.textContent = 'Show fewer achievements';
            } else {
              hiddenGrid.classList.add('hidden');
              moreIndicator.textContent = `+${hiddenAchievements.length} more achievements`;
            }
          });

          expandableGrid.appendChild(moreIndicator);
        }

        achievementsSection.appendChild(achievementsHeader);
        achievementsSection.appendChild(expandableGrid);
        container.appendChild(achievementsSection);
      }

      // Function to create an achievement card
      function createAchievementCard(achievement) {
        const prevalence = achievement.prevalence;
        let rarityClass = 'common';
        if (prevalence < 1) rarityClass = 'mythic';
        else if (prevalence < 5) rarityClass = 'legendary';
        else if (prevalence < 15) rarityClass = 'epic';
        else if (prevalence < 35) rarityClass = 'rare';

        const card = el('div', `achievement-inline-card ach-${rarityClass}`);
        card.setAttribute('title', `${achievement.label}\n${achievement.desc}\n${prevalence.toFixed(1)}% of players have this`);

        const icon = el('div', 'ach-inline-icon', [text(achievement.icon)]);
        const content = el('div', 'ach-inline-content');
        content.appendChild(el('div', 'ach-inline-name', [text(achievement.label)]));
        content.appendChild(el('div', 'ach-inline-rarity', [text(`${prevalence.toFixed(1)}%`)]));

        card.appendChild(icon);
        card.appendChild(content);
        return card;
      }

      // Insert header section into the left-side stack under the sidebar
      const leftExtras = document.querySelector('#leftStackExtras');
      if (leftExtras) leftExtras.appendChild(headerSection);

      // Achievements container (move to left stack beneath primary header)
      const achievementsContainer = el("div", "achievements-container achievements-left-card");
      if (leftExtras) leftExtras.appendChild(achievementsContainer);

      // Store achievements data to be rendered in the left-side stack
      let achievementsData = null;

      computeGlobalAchievementStats(skillRankings, leaderboard).then(globalStats => {
        const userAchievementKeys = deriveUserAchievements(user, globalStats.averages);
        const unlockedSet = new Set(userAchievementKeys);

        if (unlockedSet.size > 0) {
          // Get unlocked achievements and sort by rarity (rarest first for showcase effect)
          const unlockedAchievements = ACHIEVEMENT_CATALOG
            .filter(a => unlockedSet.has(a.key))
            .map(achievement => {
              const prevalence = globalStats.counts[achievement.key] || 0;
              const percentage = globalStats.totalPlayers > 0 ? (prevalence / globalStats.totalPlayers) * 100 : 0;
              return { ...achievement, prevalence: percentage };
            })
            .sort((a, b) => a.prevalence - b.prevalence); // Rarest first

          achievementsData = unlockedAchievements;

          // Render into the left-side achievements container
          renderAchievementsSection(achievementsContainer, achievementsData);
        }
      }).catch(() => {
        // On error, achievements will just not be rendered
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
      // Clear left-side extras on error as well
      const __leftExtrasErr = document.querySelector('#leftStackExtras');
      if (__leftExtrasErr) __leftExtrasErr.innerHTML = '';
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
