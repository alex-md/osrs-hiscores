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
    "flex-between flex-wrap gap-4",
  );
  const titleEl = el("h2", "text-2xl font-bold flex-items-center gap-2 text-foreground", [
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
  const controls = el("div", "flex-between gap-4 flex-wrap text-sm bg-layer2 p-3 rounded border-2 border-border-dark");
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

      // Tier badge (existing)
      const tier = player.tier || inferTierFromRank(player.rank, totalPlayers, top1);
      if (tier && !player.tier) {
        const tb = document.createElement('span');
        tb.className = `tier-badge tier-${tier.toLowerCase()}`;
        tb.textContent = tier;
        tb.title = `${tier} • Overall #${player.rank}${top1 ? ` • #1 in ${top1} skills` : ''}`;
        cell.appendChild(tb);
      }

      // Achievement badges (new)
      const achievements = deriveAchievementsForPlayer(player, rankings, totalPlayers);
      achievements.slice(0, 3).forEach(achievement => { // Limit to 3 badges
        const badge = document.createElement('span');
        badge.className = 'mini-achievement-badge';
        badge.textContent = achievement.icon;
        badge.title = `${achievement.label}: ${achievement.desc}`;
        badge.setAttribute('data-tooltip', `${achievement.label}\n${achievement.desc}`);
        wrap.appendChild(badge);
      });

      // Prestige badges (existing)
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
        "flex-between flex-wrap gap-4",
      );

      const userInfo = el("div", "flex-items-center gap-3 flex-wrap");
      const nameWrap = el("h3", "font-bold text-foreground flex-items-center gap-2");
      nameWrap.appendChild(text(`⚔️ ${user.username}`));
      // try to fetch leaderboard to display tier badge next to name
      // (we have it from Promise.all)
      if (leaderboard && leaderboard.players) {
        const me = leaderboard.players.find(p => p.username === user.username);
        if (me && me.tier) {
          const b = document.createElement('span');
          b.className = `tier-badge tier-${me.tier.toLowerCase()}`;
          b.textContent = me.tier;
          if (me.rank || (me.tierInfo && me.tierInfo.top1Skills === 'number')) {
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

      // --- Achievements System (curated set) ---
      // Curated list (~10) of achievements to foster competition and clarity
      const ACHIEVEMENT_CATALOG = [
        // Meta tier (prestige)
        { key: 'tier-grandmaster', icon: '👑', label: 'Grandmaster', desc: 'Ultra-elite: top 0.001% overall or #1 in 3+ skills.', category: 'tier', rarity: 'mythic' },
        { key: 'tier-master', icon: '🏆', label: 'Master', desc: 'Elite: top 0.01% overall.', category: 'tier', rarity: 'legendary' },
        { key: 'tier-diamond', icon: '💎', label: 'Diamond', desc: 'Top 0.1% overall.', category: 'tier', rarity: 'epic' },
        // Competitive rankers
        { key: 'triple-crown', icon: '👑', label: 'Triple Crown', desc: 'Hold rank #1 in 3 or more skills at once.', category: 'rank', rarity: 'legendary' },
        { key: 'crowned-any', icon: '🥇', label: 'Skill Crowned', desc: 'Achieve rank #1 in any single skill.', category: 'rank', rarity: 'rare' },
        { key: 'top-10-any', icon: '🎯', label: 'Elite Contender', desc: 'Reach top 10 in any skill.', category: 'rank', rarity: 'rare' },
        { key: 'top-100-any', icon: '⭐', label: 'Rising Star', desc: 'Reach top 100 in any skill.', category: 'rank', rarity: 'common' },
        // Account progression
        { key: 'total-2000', icon: '📈', label: '2K Club', desc: 'Reach total level 2000 or higher.', category: 'account', rarity: 'epic' },
        { key: 'total-1500', icon: '📊', label: '1.5K Milestone', desc: 'Reach total level 1500 or higher.', category: 'account', rarity: 'rare' },
        { key: 'maxed-account', icon: '👑', label: 'Maxed Account', desc: 'Reach level 99 in every skill.', category: 'account', rarity: 'mythic' },
        { key: 'seven-99s', icon: '💫', label: 'Seven Seals', desc: 'Reach level 99 in seven or more skills.', category: 'account', rarity: 'rare' },
        { key: 'five-99s', icon: '✨', label: 'Five Star', desc: 'Reach level 99 in five or more skills.', category: 'account', rarity: 'common' },
        { key: 'combat-maxed', icon: '⚔️', label: 'Combat Master', desc: 'Max all combat skills (Attack, Strength, Defence, Hitpoints, Ranged, Magic, Prayer).', category: 'account', rarity: 'epic' },
        // Skill mastery
        { key: 'skill-master-attack', icon: '🗡️', label: 'Attack Master', desc: 'Reach level 99 in Attack.', category: 'skill-mastery', rarity: 'rare' },
        { key: 'skill-master-strength', icon: '💪', label: 'Strength Master', desc: 'Reach level 99 in Strength.', category: 'skill-mastery', rarity: 'rare' },
        { key: 'skill-master-defence', icon: '🛡️', label: 'Defence Master', desc: 'Reach level 99 in Defence.', category: 'skill-mastery', rarity: 'rare' },
        { key: 'skill-master-hitpoints', icon: '❤️', label: 'Constitution Master', desc: 'Reach level 99 in Hitpoints.', category: 'skill-mastery', rarity: 'rare' },
        { key: 'skill-master-ranged', icon: '🏹', label: 'Ranged Master', desc: 'Reach level 99 in Ranged.', category: 'skill-mastery', rarity: 'rare' },
        { key: 'skill-master-magic', icon: '🔮', label: 'Magic Master', desc: 'Reach level 99 in Magic.', category: 'skill-mastery', rarity: 'rare' },
        { key: 'skill-master-prayer', icon: '🙏', label: 'Prayer Master', desc: 'Reach level 99 in Prayer.', category: 'skill-mastery', rarity: 'rare' },
        // Gathering skills
        { key: 'gathering-elite', icon: '🪓', label: 'Resource Baron', desc: 'Reach level 90+ in Woodcutting, Fishing, and Mining.', category: 'gathering', rarity: 'epic' },
        { key: 'woodcutting-expert', icon: '🌳', label: 'Lumberjack', desc: 'Reach level 85+ in Woodcutting.', category: 'gathering', rarity: 'common' },
        { key: 'fishing-expert', icon: '🎣', label: 'Angler', desc: 'Reach level 85+ in Fishing.', category: 'gathering', rarity: 'common' },
        { key: 'mining-expert', icon: '⛏️', label: 'Miner', desc: 'Reach level 85+ in Mining.', category: 'gathering', rarity: 'common' },
        // Artisan skills
        { key: 'artisan-elite', icon: '🔨', label: 'Master Craftsman', desc: 'Reach level 90+ in Smithing, Crafting, and Fletching.', category: 'artisan', rarity: 'epic' },
        { key: 'cooking-expert', icon: '👨‍🍳', label: 'Chef', desc: 'Reach level 85+ in Cooking.', category: 'artisan', rarity: 'common' },
        { key: 'firemaking-expert', icon: '🔥', label: 'Pyromancer', desc: 'Reach level 85+ in Firemaking.', category: 'artisan', rarity: 'common' },
        { key: 'smithing-expert', icon: '⚒️', label: 'Blacksmith', desc: 'Reach level 85+ in Smithing.', category: 'artisan', rarity: 'common' },
        // Support skills
        { key: 'support-elite', icon: '🧪', label: 'Utility Expert', desc: 'Reach level 90+ in Herblore, Runecraft, and Slayer.', category: 'support', rarity: 'epic' },
        { key: 'herblore-expert', icon: '🌿', label: 'Herbalist', desc: 'Reach level 85+ in Herblore.', category: 'support', rarity: 'common' },
        { key: 'agility-expert', icon: '🏃', label: 'Acrobat', desc: 'Reach level 85+ in Agility.', category: 'support', rarity: 'common' },
        { key: 'thieving-expert', icon: '🕵️', label: 'Thief', desc: 'Reach level 85+ in Thieving.', category: 'support', rarity: 'common' },
        // Playstyle
        { key: 'balanced', icon: '⚖️', label: 'Balanced Build', desc: 'All skills ≥40 with spread within 30 levels.', category: 'playstyle', rarity: 'rare' },
        { key: 'glass-cannon', icon: '💥', label: 'Glass Cannon', desc: 'Offense 180+ (Atk+Str) with Defence ≤60.', category: 'playstyle', rarity: 'epic' },
        { key: 'tank', icon: '🛡️', label: 'Tank', desc: 'Defence 90+ with Hitpoints 85+.', category: 'playstyle', rarity: 'rare' },
        { key: 'skiller', icon: '🎯', label: 'Pure Skiller', desc: 'Non-combat skills average 70+ while combat skills ≤50.', category: 'playstyle', rarity: 'epic' },
        { key: 'combat-pure', icon: '⚔️', label: 'Combat Pure', desc: 'Combat skills 80+ while non-combat skills ≤30.', category: 'playstyle', rarity: 'rare' },
        // Performance
        { key: 'elite', icon: '🚀', label: 'Polymath', desc: 'Above average in ≥90% of skills.', category: 'performance', rarity: 'legendary' },
        { key: 'versatile', icon: '🎭', label: 'Versatile', desc: 'Above average in ≥75% of skills.', category: 'performance', rarity: 'epic' },
        { key: 'consistent', icon: '📊', label: 'Consistent', desc: 'Above average in ≥50% of skills.', category: 'performance', rarity: 'rare' },
        { key: 'xp-millionaire', icon: '💰', label: 'XP Millionaire', desc: 'Accumulate 1,000,000+ total XP.', category: 'performance', rarity: 'epic' },
        { key: 'xp-billionaire', icon: '🏦', label: 'XP Billionaire', desc: 'Accumulate 1,000,000,000+ total XP.', category: 'performance', rarity: 'legendary' },
        // Activity
        { key: 'daily-grinder', icon: '🕒', label: 'Daily Grinder', desc: 'Updated within the last 24 hours.', category: 'activity', rarity: 'common' },
        { key: 'weekly-active', icon: '📅', label: 'Weekly Warrior', desc: 'Updated within the last 7 days.', category: 'activity', rarity: 'common' },
        { key: 'monthly-active', icon: '🗓️', label: 'Monthly Maven', desc: 'Updated within the last 30 days.', category: 'activity', rarity: 'common' },
        { key: 'dedicated', icon: '🔥', label: 'Dedicated', desc: 'Updated within the last 3 days.', category: 'activity', rarity: 'common' },
        // Milestones
        { key: 'level-50-average', icon: '🎯', label: 'Halfway Hero', desc: 'Average level of 50+ across all skills.', category: 'milestone', rarity: 'common' },
        { key: 'level-75-average', icon: '⭐', label: 'Three-Quarter Champion', desc: 'Average level of 75+ across all skills.', category: 'milestone', rarity: 'rare' },
        { key: 'level-90-average', icon: '👑', label: 'Elite Average', desc: 'Average level of 90+ across all skills.', category: 'milestone', rarity: 'epic' },
        // Special combinations
        { key: 'magic-ranged', icon: '🧙‍♂️', label: 'Hybrid Mage', desc: 'Both Magic and Ranged at level 80+.', category: 'special', rarity: 'rare' },
        { key: 'melee-specialist', icon: '⚔️', label: 'Melee Specialist', desc: 'Attack, Strength, and Defence all 85+.', category: 'special', rarity: 'rare' },
        { key: 'support-master', icon: '🛠️', label: 'Support Master', desc: 'Prayer, Herblore, and Runecraft all 80+.', category: 'special', rarity: 'rare' },
        { key: 'gathering-master', icon: '📦', label: 'Gathering Master', desc: 'Woodcutting, Fishing, and Mining all 80+.', category: 'special', rarity: 'rare' }
      ];

      function deriveUserAchievements(user, averages) {
        const now = Date.now();
        const results = [];
        const push = (key) => results.push({ key });
        // Tier-based prestige
        if (leaderboard && leaderboard.players) {
          const me = leaderboard.players.find(p => p.username === user.username);
          if (me?.tier === 'Grandmaster') push('tier-grandmaster');
          if (me?.tier === 'Master') push('tier-master');
          if (me?.tier === 'Diamond') push('tier-diamond');
          // Triple crown via leaderboard-derived context or fallback to per-skill checks
          let top1Count = me?.tierInfo?.top1Skills ?? 0;
          if (!top1Count) { SKILLS.forEach(s => { const r = getUserSkillRank(skillRankings, user.username, s); if (r === 1) top1Count++; }); }
          if (top1Count >= 3) push('triple-crown');
          if (top1Count >= 1) push('crowned-any');
        }
        // Totals and maxing
        const levels = SKILLS.map(s => user.skills[s]?.level || 1);
        const total = levels.reduce((a, b) => a + b, 0);
        if (total >= 2000) push('total-2000');
        if (total >= 1500) push('total-1500');
        const count99 = levels.filter(l => l >= 99).length;
        if (levels.every(l => l >= 99)) push('maxed-account');
        if (count99 >= 7) push('seven-99s');
        if (count99 >= 5) push('five-99s');

        // Combat maxed check
        const combatSkills = ['attack', 'strength', 'defence', 'hitpoints', 'ranged', 'magic', 'prayer'];
        const combatMaxed = combatSkills.every(skill => (user.skills[skill]?.level || 1) >= 99);
        if (combatMaxed) push('combat-maxed');

        // Individual skill mastery
        const skillMasteryMap = {
          'skill-master-attack': 'attack',
          'skill-master-strength': 'strength',
          'skill-master-defence': 'defence',
          'skill-master-hitpoints': 'hitpoints',
          'skill-master-ranged': 'ranged',
          'skill-master-magic': 'magic',
          'skill-master-prayer': 'prayer'
        };
        Object.entries(skillMasteryMap).forEach(([achievement, skill]) => {
          if ((user.skills[skill]?.level || 1) >= 99) push(achievement);
        });

        // Gathering skills
        const woodcutting = user.skills.woodcutting?.level || 1;
        const fishing = user.skills.fishing?.level || 1;
        const mining = user.skills.mining?.level || 1;
        if (woodcutting >= 90 && fishing >= 90 && mining >= 90) push('gathering-elite');
        if (woodcutting >= 85) push('woodcutting-expert');
        if (fishing >= 85) push('fishing-expert');
        if (mining >= 85) push('mining-expert');

        // Artisan skills
        const smithing = user.skills.smithing?.level || 1;
        const crafting = user.skills.crafting?.level || 1;
        const fletching = user.skills.fletching?.level || 1;
        const cooking = user.skills.cooking?.level || 1;
        const firemaking = user.skills.firemaking?.level || 1;
        if (smithing >= 90 && crafting >= 90 && fletching >= 90) push('artisan-elite');
        if (cooking >= 85) push('cooking-expert');
        if (firemaking >= 85) push('firemaking-expert');
        if (smithing >= 85) push('smithing-expert');

        // Support skills
        const herblore = user.skills.herblore?.level || 1;
        const runecraft = user.skills.runecraft?.level || 1;
        const slayer = user.skills.slayer?.level || 1;
        const agility = user.skills.agility?.level || 1;
        const thieving = user.skills.thieving?.level || 1;
        if (herblore >= 90 && runecraft >= 90 && slayer >= 90) push('support-elite');
        if (herblore >= 85) push('herblore-expert');
        if (agility >= 85) push('agility-expert');
        if (thieving >= 85) push('thieving-expert');

        // Playstyle
        const minL = Math.min(...levels); const maxL = Math.max(...levels);
        if (minL >= 40 && (maxL - minL) <= 30) push('balanced');
        // Glass Cannon: strong offense with modest defence
        const atk = user.skills.attack?.level || 1;
        const str = user.skills.strength?.level || 1;
        const def = user.skills.defence?.level || 1;
        if ((atk + str) >= 180 && def <= 60) push('glass-cannon');
        // Tank: high defence and hitpoints
        const hp = user.skills.hitpoints?.level || 1;
        if (def >= 90 && hp >= 85) push('tank');
        // Pure Skiller: high non-combat, low combat
        const combatLevels = ['attack', 'strength', 'defence', 'hitpoints', 'ranged', 'magic', 'prayer'].map(s => user.skills[s]?.level || 1);
        const nonCombatLevels = SKILLS.filter(s => !['attack', 'strength', 'defence', 'hitpoints', 'ranged', 'magic', 'prayer'].includes(s)).map(s => user.skills[s]?.level || 1);
        const avgCombat = combatLevels.reduce((a, b) => a + b, 0) / combatLevels.length;
        const avgNonCombat = nonCombatLevels.reduce((a, b) => a + b, 0) / nonCombatLevels.length;
        if (avgNonCombat >= 70 && avgCombat <= 50) push('skiller');
        // Combat Pure: high combat, low non-combat
        if (avgCombat >= 80 && avgNonCombat <= 30) push('combat-pure');

        // Performance
        const aboveAvg = SKILLS.filter(s => (user.skills[s]?.level || 1) > (averages[s]?.level || 1)).length;
        if (aboveAvg / SKILLS.length >= 0.90) push('elite');
        if (aboveAvg / SKILLS.length >= 0.75) push('versatile');
        if (aboveAvg / SKILLS.length >= 0.50) push('consistent');
        // XP achievements
        const totalXP = SKILLS.reduce((sum, s) => sum + (user.skills[s]?.xp || 0), 0);
        if (totalXP >= 1000000000) push('xp-billionaire');
        if (totalXP >= 1000000) push('xp-millionaire');

        // Activity
        if (user.updatedAt) {
          const diffH = (now - user.updatedAt) / 3600000;
          if (diffH <= 24) push('daily-grinder');
          if (diffH <= 72) push('dedicated');
          if (diffH <= 168) push('weekly-active');
          if (diffH <= 720) push('monthly-active');
        }

        // Level milestones
        const avgLevel = total / SKILLS.length;
        if (avgLevel >= 90) push('level-90-average');
        if (avgLevel >= 75) push('level-75-average');
        if (avgLevel >= 50) push('level-50-average');

        // Special combinations
        const ranged = user.skills.ranged?.level || 1;
        const magic = user.skills.magic?.level || 1;
        if (magic >= 80 && ranged >= 80) push('magic-ranged');
        if (atk >= 85 && str >= 85 && def >= 85) push('melee-specialist');
        const prayer = user.skills.prayer?.level || 1;
        if (prayer >= 80 && herblore >= 80 && runecraft >= 80) push('support-master');
        if (woodcutting >= 80 && fishing >= 80 && mining >= 80) push('gathering-master');

        const uniq = [...new Set(results.map(r => r.key))];
        return uniq;
      }

      // Function to render achievements section with expand/collapse functionality
      function renderAchievementsSection(container, achievements) {
        container.innerHTML = ''; // Clear existing content

        if (!achievements || achievements.length === 0) return;

        // Create achievements section 
        const achievementsSection = el('div', 'user-achievements mb-6 bg-layer2 p-4 rounded-lg border-2 border-border-dark');

        const achievementsHeader = el('div', 'flex-between mb-3');
        achievementsHeader.appendChild(
          el('h4', 'text-lg font-medium text-foreground flex-items-center gap-2',
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
        card.setAttribute('data-tooltip', `${achievement.label}\n${achievement.desc}\n${prevalence.toFixed(1)}% of players have this`);
        card.setAttribute('title', `${achievement.label}: ${achievement.desc} (${prevalence.toFixed(1)}% of players)`);

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
      const section = el("section", "flex-col gap-4");
      const headerRow = el("div", "flex-between");
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

function deriveAchievementsForPlayer(player, rankings, totalPlayers) {
  const achievements = [];
  const push = (key) => {
    const achievement = ACHIEVEMENT_CATALOG.find(a => a.key === key);
    if (achievement) achievements.push(achievement);
  };

  // Tier-based prestige
  if (player.tier === 'Grandmaster') push('tier-grandmaster');
  if (player.tier === 'Master') push('tier-master');
  if (player.tier === 'Diamond') push('tier-diamond');

  // Triple crown via top1 count
  let top1Count = 0;
  if (rankings) {
    const map = buildTop1Counts(rankings);
    top1Count = map.get(player.username) || 0;
  }
  if (top1Count >= 3) push('triple-crown');
  if (top1Count >= 1) push('crowned-any');
  if (top1Count >= 0) { // Check for top 10 and top 100
    // This would need skill rankings data to check individual ranks
    // For now, we'll skip these as they require more complex logic
  }

  // Totals and maxing
  if (player.totalLevel >= 2277) push('maxed-account'); // Assuming max total is 2277
  if (player.totalLevel >= 2000) push('total-2000');
  if (player.totalLevel >= 1500) push('total-1500');

  // Activity
  if (player.updatedAt) {
    const diffH = (Date.now() - player.updatedAt) / 3600000;
    if (diffH <= 24) push('daily-grinder');
    if (diffH <= 72) push('dedicated');
    if (diffH <= 168) push('weekly-active');
    if (diffH <= 720) push('monthly-active');
  }

  // Sort by rarity (mythic first, then legendary, etc.)
  const rarityOrder = { mythic: 0, legendary: 1, epic: 2, rare: 3, common: 4 };
  return achievements.sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity]);
}
