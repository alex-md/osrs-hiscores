let LEADERBOARD_LIMIT = 500, cache = {
  leaderboard: null,
  users: null,
  skillRankings: null,
  usersFetchedAt: 0
};
function formatRelativeTime(ts) {
  let date = new Date(ts), diffMs = void 0, sec = Math.round((Date.now() - date.getTime()) / 1000), min = Math.round(sec / 60), hr = Math.round(min / 60), day = Math.round(hr / 24), month = Math.round(day / 30), year = Math.round(day / 365);
  return sec < 5 ? 'just now' : sec < 60 ? `${sec}s ago` : min < 60 ? `${min}m ago` : hr < 24 ? `${hr}h ago` : day < 30 ? `${day}d ago` : month < 12 ? `${month}mo ago` : `${year}y ago`;
}
async function computeGlobalAchievementStats(skillRankings, leaderboard) {
  const averages = computeSkillAverages(skillRankings);
  try {
    let stats = await fetchJSON('/api/achievements/stats'), counts = stats?.counts || {}, totalPlayers = Number(stats?.totalPlayers) || leaderboard?.totalPlayers || leaderboard?.players?.length || 0;
    return {
      counts,
      totalPlayers,
      averages
    };
  } catch (_) {
    return {
      counts: {},
      totalPlayers: leaderboard?.totalPlayers || leaderboard?.players?.length || 0 || 0,
      averages
    };
  }
}
async function loadLeaderboard(force = !1) {
  return cache.leaderboard && !force || (cache.leaderboard = await fetchJSON("/api/leaderboard?limit=500")), cache.leaderboard;
}
async function loadUsers(force = !1) {
  return cache.users && !force && Date.now() - cache.usersFetchedAt < 60_000 || (cache.users = await fetchJSON("/api/users"), cache.usersFetchedAt = Date.now()), cache.users;
}
async function loadSkillRankings(force = !1) {
  return cache.skillRankings && !force || (cache.skillRankings = await fetchJSON("/api/skill-rankings")), cache.skillRankings;
}
function getUserSkillRank(skillRankings, username, skill) {
  if (!skillRankings || !skillRankings.rankings || !skillRankings.rankings[skill]) return null;
  let skillData = void 0, playerData = skillRankings.rankings[skill].find((p) => p.username === username);
  return playerData ? playerData.rank : null;
}
function updateSummary(user, skillRankings) {
  let rankEl = $("#topRankSummary span"), levelEl = $("#topLevelSummary span");
  if (!rankEl || !levelEl) return;
  if (!user) {
    rankEl.textContent = "Highest rank: —", levelEl.textContent = "Highest level: —";
    return;
  }
  let bestRank = 1 / 0, bestRankSkill = null;
  if (SKILLS.forEach((s) => {
    let r = getUserSkillRank(skillRankings, user.username, s);
    r && r < bestRank && (bestRank = r, bestRankSkill = s);
  }), bestRankSkill) {
    let name = bestRankSkill.charAt(0).toUpperCase() + bestRankSkill.slice(1);
    rankEl.textContent = `Highest rank: ${name} (#${bestRank})`;
  } else rankEl.textContent = "Highest rank: —";
  let bestLevel = -1, bestXp = -1, bestLevelSkill = null;
  if (SKILLS.forEach((s) => {
    let skill = user.skills[s], lvl = skill?.level || 1, xp = skill?.xp || 0;
    (lvl > bestLevel || lvl === bestLevel && xp > bestXp) && (bestLevel = lvl, bestXp = xp, bestLevelSkill = s);
  }), bestLevelSkill) {
    let name = bestLevelSkill.charAt(0).toUpperCase() + bestLevelSkill.slice(1);
    levelEl.textContent = `Highest level: ${name} (Lv. ${bestLevel}, ${bestXp.toLocaleString()} XP)`;
  } else levelEl.textContent = "Highest level: —";
}

// Compute average level/xp per skill from skillRankings
function computeSkillAverages(skillRankings) {
  const averages = {};
  try {
    const all = (skillRankings && skillRankings.rankings) || {};
    (window.SKILLS || []).forEach((s) => {
      const arr = all[s] || [];
      if (arr.length) {
        const totalLvl = arr.reduce((sum, p) => sum + (p.level || 0), 0);
        const totalXp = arr.reduce((sum, p) => sum + (p.xp || 0), 0);
        averages[s] = { level: totalLvl / arr.length, xp: totalXp / arr.length };
      } else {
        averages[s] = { level: 1, xp: 0 };
      }
    });
  } catch (_) {
    (window.SKILLS || []).forEach((s) => (averages[s] = { level: 1, xp: 0 }));
  }
  return averages;
}

// Local copy of tier inference for client-only usage
function inferMetaTierWithContextFrontend(user, ctx) {
  try {
    const rank = Number(ctx?.rank) || Infinity;
    const totalPlayers = Math.max(1, Number(ctx?.totalPlayers) || 1);
    const top1SkillsCount = Math.max(0, Number(ctx?.top1SkillsCount) || 0);
    if (rank === 1 || top1SkillsCount >= 3) return { name: 'Grandmaster', ordinal: 0 };
    if (totalPlayers <= 500) {
      if (rank <= 2) return { name: 'Master', ordinal: 1 };
      if (rank <= 5) return { name: 'Diamond', ordinal: 2 };
      if (rank <= 15) return { name: 'Platinum', ordinal: 3 };
      if (rank <= Math.ceil(totalPlayers * 0.05)) return { name: 'Gold', ordinal: 4 };
      if (rank <= Math.ceil(totalPlayers * 0.20)) return { name: 'Silver', ordinal: 5 };
      if (rank <= Math.ceil(totalPlayers * 0.50)) return { name: 'Bronze', ordinal: 6 };
    } else {
      const percentile = rank / totalPlayers;
      if (percentile <= 0.0001) return { name: 'Master', ordinal: 1 };
      if (percentile <= 0.001) return { name: 'Diamond', ordinal: 2 };
      if (percentile <= 0.01) return { name: 'Platinum', ordinal: 3 };
      if (percentile <= 0.05) return { name: 'Gold', ordinal: 4 };
      if (percentile <= 0.20) return { name: 'Silver', ordinal: 5 };
      if (percentile <= 0.50) return { name: 'Bronze', ordinal: 6 };
    }
    const total = (window.SKILLS || []).map(s => user?.skills?.[s]?.level || 1).reduce((a, b) => a + b, 0);
    if (total >= 1700) return { name: 'Expert', ordinal: 5 };
    if (total >= 900) return { name: 'Adept', ordinal: 6 };
    return { name: 'Novice', ordinal: 7 };
  } catch (_) {
    return { name: 'Novice', ordinal: 7 };
  }
}
function renderHomeView() {
  let root = $("#viewRoot");
  root.innerHTML = "";
  let leftExtras = document.querySelector('#leftStackExtras');
  leftExtras && (leftExtras.innerHTML = '');
  // Kick off rare banner rotator (non-blocking)
  try { initRareBannerRotator(); } catch (_) { }
  let section = el("section", "flex flex-col gap-6"), headerDiv = el("div", "flex-between flex-wrap gap-4"), titleEl = el("h2", "text-2xl font-bold flex-items-center gap-2 text-foreground", [
    text("🏆 Overall Leaderboard")
  ]);
  headerDiv.appendChild(titleEl);
  let statsDiv = el("div", "flex gap-3 flex-wrap text-muted text-sm");
  statsDiv.appendChild(el("div", "badge js-leaderboard-range", [
    text("Loading…")
  ])), section.appendChild(headerDiv);
  let tableWrap = el("div", "osrs-table home-leaderboard");
  tableWrap.classList.add('full-width');
  let scrollWrap = el("div", "table-scroll"), table = el("table", "min-w-full leaderboard-table");
  table.innerHTML = '<thead><tr><th>Rank</th><th class="text-left">Player</th><th>Total Level</th><th>Total Experience</th></tr></thead><tbody></tbody>', scrollWrap.appendChild(table), tableWrap.appendChild(scrollWrap), section.appendChild(tableWrap), root.appendChild(section);
  let tbody = table.querySelector("tbody");
  // Skeleton rows while loading
  tbody.innerHTML = Array.from({ length: 8 }).map(() => (
    `<tr>
      <td class="text-center"><div class="skeleton skeleton-line" style="width:40px;margin:0 auto;"></div></td>
      <td><div class="skeleton skeleton-line" style="width:160px"></div></td>
      <td class="text-center"><div class="skeleton skeleton-line" style="width:60px;margin:0 auto;"></div></td>
      <td class="text-right"><div class="skeleton skeleton-line" style="width:120px; margin-left:auto;"></div></td>
    </tr>`
  )).join('');
  let page = 1, controls = el("div", "flex-between gap-4 flex-wrap text-sm bg-layer2 p-3 rounded border-2 border-border-dark");
  controls.innerHTML = `
      <div class="flex items-center gap-2">
        <button class="btn-sm" data-action="prev">← Prev</button>
        <button class="btn-sm" data-action="next">Next →</button>
      </div>
      <div class="font-semibold">Page <span class="js-page">1</span> / <span class="js-pages">1</span></div>
      <div class="opacity-70 js-range"></div>
    `, section.appendChild(controls);
  let rankingsCache = null;
  function renderPage(data) {
    let players = data.players || [], total = players.length, totalPages = Math.max(1, Math.ceil(total / 50));
    page > totalPages && (page = totalPages);
    let start = (page - 1) * 50, slice = players.slice(start, start + 50);
    tbody.innerHTML = "", slice.length ? slice.forEach((p) => {
      let tr = document.createElement("tr"), rankDisplay = p.rank;
      1 === p.rank ? rankDisplay = "🥇 " + p.rank : 2 === p.rank ? rankDisplay = "🥈 " + p.rank : 3 === p.rank && (rankDisplay = "🥉 " + p.rank), 1 === p.rank ? tr.classList.add("rank-1") : 2 === p.rank ? tr.classList.add("rank-2") : 3 === p.rank && tr.classList.add("rank-3");
      let tierAttrs = '';
      if (p.tier) {
        let tip = p.tierInfo && null != p.tierInfo.top1Skills ? `${p.tier} • Overall #${p.rank}${p.tierInfo.top1Skills ? ` • #1 in ${p.tierInfo.top1Skills} skills` : ''}` : p.tier;
        tierAttrs = ` title="${tip}" data-tooltip="${tip}" aria-label="${p.tier}"`;
      }
      let tierBadge = p.tier ? `<span class="tier-badge tier-${p.tier.toLowerCase()} tier--icon-only"${tierAttrs}></span>` : "";
      tr.innerHTML = `
              <td class="text-center font-bold">${rankDisplay}</td>
              <td>
                  <button class="username-link" data-user="${p.username}" aria-label="View ${p.username} stats">${p.username}</button>
                  ${tierBadge}
              </td>
              <td class="text-center skill-level">${p.totalLevel}</td>
              <td class="text-right skill-xp">${p.totalXP.toLocaleString()}</td>`, tbody.appendChild(tr);
      let playerCell = void 0;
      !function (cell, player, rankings, totalPlayers) {
        try {
          let wrap = document.createElement('div');
          wrap.className = 'mini-badges';
          let add = (textContent, title, extraCls = '') => {
            let b = document.createElement('span');
            b.className = 'mini-badge' + (extraCls ? ' ' + extraCls : ''), b.textContent = textContent, title && (b.title = title), wrap.appendChild(b);
          }, top1 = 0;
          if (rankings) {
            top1 = buildTop1Counts(rankings).get(player.username) || 0;
          }
          let tier = player.tier, inferred = null;
          if (
            tier ||
            (inferred = inferMetaTierWithContextFrontend(player, {
              rank: player.rank,
              totalPlayers,
              top1SkillsCount: top1
            })),
            tier = inferred?.name || null,
            tier && !player.tier
          ) {
            let tb = document.createElement('span');
            tb.className = `tier-badge tier-${tier.toLowerCase()} tier--icon-only`;
            let tip = `${tier} • Overall #${player.rank}${top1 ? ` • #1 in ${top1} skills` : ''}`;
            tb.setAttribute('title', tip), tb.setAttribute('data-tooltip', tip), tb.setAttribute('aria-label', tier), cell.appendChild(tb);
          }
          let achievements = void 0;
          deriveAchievementsForPlayer(player, rankings, totalPlayers).slice(0, 3).forEach((achievement) => {
            let badge = document.createElement('span');
            badge.className = 'mini-achievement-badge', badge.textContent = achievement.icon, badge.title = `${achievement.label}: ${achievement.desc}`, badge.setAttribute('data-tooltip', `${achievement.label}\n${achievement.desc}`), wrap.appendChild(badge);
          });
          let added = 0;
          if (top1 >= 3 && added < 3 ? (add('👑 Three #1 Skills', '#1 in 3+ skills', 'mini-badge--highlight'), added++) : top1 >= 1 && added < 3 && (add(`🥇 x${top1}`, 'Rank #1 in skills'), added++), player.totalLevel >= 2277 && added < 3 ? (add('👑 Maxed', 'All skills 99'), added++) : player.totalLevel >= 2000 && added < 3 && (add('📈 2k+', 'Total level 2000+'), added++), player.updatedAt && added < 3) {
            let diffH = (Date.now() - player.updatedAt) / 3600000;
            diffH <= 24 ? (add('🕒 Today', 'Updated within 24h'), added++) : diffH <= 168 && (add('🔄 Week', 'Updated within 7 days'), added++);
          }
          wrap.childNodes.length && cell.appendChild(wrap);
        } catch (_) { }
      }(tr.children[1], p, rankingsCache, cache.leaderboard && cache.leaderboard.totalPlayers || players.length);
    }) : tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-6">No players</td></tr>', controls.querySelector('.js-page').textContent = String(page), controls.querySelector('.js-pages').textContent = String(totalPages);
    let rangeStart = total ? start + 1 : 0, rangeEnd = Math.min(total, start + 50), rangeEl = void 0;
    controls.querySelector('.js-range').textContent = `Showing ${rangeStart}–${rangeEnd} of ${total} (limit 500)`;
    let pill = statsDiv.querySelector('.js-leaderboard-range');
    pill && (pill.textContent = `Players ${rangeStart}–${rangeEnd}`);
  }
  loadSkillRankings().then((r) => {
    rankingsCache = r, cache.leaderboard && renderPage(cache.leaderboard);
  }).catch(() => { }), controls.addEventListener('click', (e) => {
    let btn = e.target.closest('button[data-action]');
    if (!btn) return;
    let act = btn.getAttribute('data-action');
    if ('prev' === act && page > 1 && (page--, renderPage(cache.leaderboard)), 'next' === act) {
      let players = void 0, maxPages = Math.ceil((cache.leaderboard?.players || []).length / 50) || 1;
      page < maxPages && (page++, renderPage(cache.leaderboard));
    }
  }), loadLeaderboard().then((data) => {
    if (renderPage(data), data.totalPlayers > 0 && statsDiv.appendChild(el("div", "badge", [
      text(`${data.totalPlayers} total players`)
    ])), data.tiers) {
      let tiers = data.tiers;
      [
        "Grandmaster",
        "Master",
        "Diamond",
        "Platinum",
        "Gold",
        "Silver",
        "Bronze"
      ].forEach((tn) => {
        if (tiers[tn] > 0) {
          let pct = data.totalPlayers ? Math.round(tiers[tn] / data.totalPlayers * 1000) / 10 : 0, pill = el("div", `badge tier-badge tier-${tn.toLowerCase()}`, [
            text(`${tn} ${pct}%`)
          ]);
          statsDiv.appendChild(pill);
        }
      });
    }
  }).catch((e) => {
    let htmlLike = /Received HTML|Unexpected content-type/.test(e.message);
    tbody.innerHTML = `<tr><td colspan="4" class="text-center py-8"><div class="text-danger font-semibold">❌ ${e.message}</div>${htmlLike ? '<div class="mt-4 text-sm text-left max-w-lg mx-auto p-4 bg-layer2 rounded border-l-4 border-accent">⚠️ <strong>Backend not mounted:</strong><br>Verify _worker.js is present at repo root and KV binding HISCORES_KV is configured in Pages project settings. Also ensure deployment finished successfully.<br><br><code class="bg-layer p-1 rounded text-xs">/api/health</code> should return JSON.</div>' : ""}</td></tr>`;
  });
}
async function loadUser(username) {
  return fetchJSON("/api/users/" + encodeURIComponent(username));
}
function renderUserView(username) {
  let root = $("#viewRoot");
  root.innerHTML = '<div class="text-center text-muted py-8">⏳ Loading player data...</div>';
  let __leftExtrasInit = document.querySelector('#leftStackExtras');
  __leftExtrasInit && (__leftExtrasInit.innerHTML = ''), Promise.all([
    loadUser(username),
    loadSkillRankings(),
    loadLeaderboard().catch(() => null)
  ]).then(([user, skillRankings, leaderboard]) => {
    let wrap = el("div", "flex flex-col gap-8"), headerSection = el("div", "bg-layer2 p-6 rounded-lg border-2 border-border-dark primary-header-card"), headerContent = el("div", "flex-between flex-wrap gap-4"), userInfo = el("div", "flex-items-center gap-3 flex-wrap"), nameWrap = el("h3", "font-bold text-foreground flex-items-center gap-2");
    if (nameWrap.appendChild(text(`⚔️ ${user.username}`)), leaderboard && leaderboard.players) {
      let me = leaderboard.players.find((p) => p.username === user.username);
      if (me && me.tier) {
        let b = document.createElement('span');
        b.className = `tier-badge tier-${me.tier.toLowerCase()}`, b.textContent = me.tier, (me.rank || me.tierInfo && 'number' == typeof me.tierInfo.top1Skills) && (b.title = `${me.tier} • Overall #${me.rank}${me.tierInfo && me.tierInfo.top1Skills ? ` • #1 in ${me.tierInfo.top1Skills} skills` : ''}`), nameWrap.appendChild(b);
      }
    }
    // Copy profile link button
    const copyBtn = document.createElement('button');
    copyBtn.className = 'icon-button';
    copyBtn.id = 'copyProfileLink';
    copyBtn.title = 'Copy profile link';
    copyBtn.setAttribute('aria-label', 'Copy profile link');
    copyBtn.innerHTML = '<i data-lucide="link"></i>';
    userInfo.appendChild(copyBtn);
    if (window.lucide) window.lucide.createIcons();
    userInfo.appendChild(nameWrap);
    let attack = user.skills.attack.level, strength = user.skills.strength.level, defence = user.skills.defence.level, hitpoints = user.skills.hitpoints.level, ranged = user.skills.ranged.level, magic = user.skills.magic.level, prayer = void 0, combatLevel = Math.floor((defence + hitpoints + Math.floor(user.skills.prayer.level / 2)) * 0.25 + 0.325 * Math.max(attack + strength, Math.max(1.5 * ranged, 1.5 * magic))), meta = el("div", "meta-badges text-sm flex items-center gap-2 flex-wrap");
    if (meta.appendChild(el("span", "meta-badge", [
      text(`Combat Lv. ${combatLevel}`)
    ])), leaderboard && leaderboard.players) {
      let me = leaderboard.players.find((p) => p.username === user.username);
      me && me.rank && meta.appendChild(el('span', 'meta-badge', [
        text(`Overall #${me.rank}`)
      ]));
    }
    if (user.createdAt) {
      let createdStr = new Date(user.createdAt).toLocaleDateString();
      meta.appendChild(el("span", "meta-badge", [
        text(`Created ${createdStr}`)
      ]));
    }
    if (user.updatedAt) {
      let updatedStr = new Date(user.updatedAt).toLocaleString(), rel = formatRelativeTime(user.updatedAt), badge = el("span", "meta-badge meta-badge--muted", [
        text(`Updated ${rel}`)
      ]);
      badge.setAttribute('title', `Updated ${updatedStr}`), meta.appendChild(badge);
    }
    userInfo.appendChild(meta), headerContent.appendChild(userInfo), headerSection.appendChild(headerContent);
    const ACHIEVEMENT_CATALOG = window.ACHIEVEMENT_CATALOG || [];
    const ACHIEVEMENT_FAMILY_CHAINS = [
      ['tier-grandmaster', 'tier-master', 'tier-diamond'],
      ['triple-crown', 'crowned-any'],
      ['top-10-any', 'top-100-any'],
      ['maxed-account', 'seven-99s', 'five-99s'],
      ['total-2277', 'total-2200', 'total-2000', 'total-1500'],
      ['elite', 'versatile', 'consistent'],
      ['level-90-average', 'level-75-average', 'level-50-average'],
      ['xp-billionaire', 'totalxp-200m', 'totalxp-100m', 'totalxp-50m', 'totalxp-10m', 'xp-millionaire'],
      ['combat-level-126', 'combat-level-120', 'combat-level-110', 'combat-level-100']
    ];
    function deriveUserAchievements(user) {
      const keys = user?.achievements && typeof user.achievements === 'object' ? Object.keys(user.achievements) : [];
      if (!keys.length) return [];
      const active = new Set(keys);
      ACHIEVEMENT_FAMILY_CHAINS.forEach((chain) => {
        const present = chain.filter((k) => active.has(k));
        if (present.length > 1) {
          for (let i = 1; i < present.length; i++) active.delete(present[i]);
        }
      });
      return [...active];
    }
    function renderAchievementsHero(container, me, achievements) {
      if (container.innerHTML = '', !achievements || 0 === achievements.length) return;
      let section = el('section', 'bg-layer2 p-6 rounded-lg border-2 border-border-dark achievements-hero'), header = el('div', 'flex-between flex-wrap gap-3 mb-4'), title = el('h3', 'text-2xl font-bold text-foreground flex-items-center gap-2', [
        text('🏅 Achievements')
      ]);
      if (header.appendChild(title), me && me.tier) {
        let tier = el('span', `tier-badge tier-${me.tier.toLowerCase()}`);
        tier.textContent = me.tier, (me.rank || me.tierInfo && 'number' == typeof me.tierInfo.top1Skills) && (tier.title = `${me.tier} • Overall #${me.rank}${me.tierInfo && me.tierInfo.top1Skills ? ` • #1 in ${me.tierInfo.top1Skills} skills` : ''}`), header.appendChild(tier);
      }
      section.appendChild(header);
      let featured = achievements.slice(0, 3), featuredWrap = el('div', 'featured-grid');
      if (featured.forEach((a) => featuredWrap.appendChild(function (achievement) {
        let card = el('div', `achievement-card rarity-${achievement.rarity}`);
        card.setAttribute('data-tooltip', `${achievement.label}\n${achievement.desc}`), 'number' == typeof achievement.prevalence && card.setAttribute('data-prevalence', `${achievement.prevalence.toFixed(1)}%`);
        let icon = el('div', 'ach-icon', [
          text(achievement.icon)
        ]), title = el('div', 'ach-title', [
          text(achievement.label)
        ]), desc = el('div', 'ach-desc', [
          text(achievement.desc)
        ]);
        return card.appendChild(icon), card.appendChild(title), card.appendChild(desc), card;
      }(a))), section.appendChild(featuredWrap), achievements.length > 3) {
        let rest = achievements.slice(3), toggleRow = el('div', 'flex-center mt-4'), toggleBtn = el('button', 'btn-sm', [
          text('View all')
        ]);
        toggleBtn.setAttribute('aria-expanded', 'false'), toggleBtn.type = 'button', toggleRow.appendChild(toggleBtn), section.appendChild(toggleRow);
        let allWrap = el('div', 'achievements-inline-grid mt-3 hidden');
        rest.forEach((a) => allWrap.appendChild(function (achievement) {
          let prevalence = achievement.prevalence ?? 100, rarityClass = 'common';
          prevalence < 1 ? rarityClass = 'mythic' : prevalence < 5 ? rarityClass = 'legendary' : prevalence < 15 ? rarityClass = 'epic' : prevalence < 35 && (rarityClass = 'rare');
          let card = el('div', `achievement-inline-card ach-${rarityClass}`);
          card.setAttribute('data-tooltip', `${achievement.label}\n${achievement.desc}${'number' == typeof prevalence ? `\n${prevalence.toFixed(1)}% of players` : ''}`);
          let icon = el('div', 'ach-inline-icon', [
            text(achievement.icon)
          ]), content = el('div', 'ach-inline-content');
          return content.appendChild(el('div', 'ach-inline-name', [
            text(achievement.label)
          ])), 'number' == typeof prevalence && content.appendChild(el('div', 'ach-inline-rarity', [
            text(`${prevalence.toFixed(1)}%`)
          ])), card.appendChild(icon), card.appendChild(content), card;
        }(a))), section.appendChild(allWrap), toggleBtn.addEventListener('click', () => {
          let open = void 0;
          allWrap.classList.contains('hidden') ? (allWrap.classList.remove('hidden'), toggleBtn.textContent = 'View fewer', toggleBtn.setAttribute('aria-expanded', 'true')) : (allWrap.classList.add('hidden'), toggleBtn.textContent = 'View all', toggleBtn.setAttribute('aria-expanded', 'false'));
        });
      }
      container.appendChild(section);
    }
    let leftExtras = document.querySelector('#leftStackExtras');
    leftExtras && leftExtras.appendChild(headerSection);
    let achievementsData = null, achievementsMount = el('div', '');
    computeGlobalAchievementStats(skillRankings, leaderboard).then((globalStats) => {
      let userAchievementKeys = void 0, unlockedSet = new Set(deriveUserAchievements(user));
      if (unlockedSet.size > 0) {
        let unlockedAchievements = void 0;
        achievementsData = ACHIEVEMENT_CATALOG.filter((a) => unlockedSet.has(a.key)).map((achievement) => {
          let prevalence = globalStats.counts[achievement.key] || 0, percentage = globalStats.totalPlayers > 0 ? prevalence / globalStats.totalPlayers * 100 : 0;
          return {
            ...achievement,
            prevalence: percentage
          };
        }).sort((a, b) => a.prevalence - b.prevalence);
        let me = void 0;
        renderAchievementsHero(achievementsMount, leaderboard && leaderboard.players ? leaderboard.players.find((p) => p.username === user.username) : null, achievementsData);
      }
    }).catch(() => {
      try {
        let userAchievementKeys = deriveUserAchievements(user);
        if (userAchievementKeys && userAchievementKeys.length) {
          let unlockedAchievements = ACHIEVEMENT_CATALOG.filter((a) => userAchievementKeys.includes(a.key)), me = leaderboard && leaderboard.players ? leaderboard.players.find((p) => p.username === user.username) : null;
          renderAchievementsHero(achievementsMount, me, unlockedAchievements);
        }
      } catch (_) { }
    });
    let section = el("section", "flex-col gap-4"), headerRow = el("div", "flex-between");
    headerRow.appendChild(el("h3", "text-2xl font-bold text-foreground", [
      text("📜 Hiscores")
    ])), section.appendChild(headerRow);
    let tableWrap = el("div", "osrs-table"), table = el("table", "min-w-full text-sm");
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
        `, tableWrap.appendChild(table), section.appendChild(tableWrap), wrap.appendChild(achievementsMount), wrap.appendChild(section);
    let tbody = table.querySelector("tbody"), overallRank = null;
    if (leaderboard && leaderboard.players) {
      let found = leaderboard.players.find((p) => p.username === user.username);
      found && (overallRank = found.rank);
    }
    let totalLevel = user.totalLevel || SKILLS.reduce((sum, s) => sum + (user.skills[s]?.level || 1), 0), totalXP = user.totalXP || SKILLS.reduce((sum, s) => sum + (user.skills[s]?.xp || 0), 0), overallTr = document.createElement("tr");
    overallTr.classList.add("font-bold"), overallTr.innerHTML = `
          <td class="text-left">Overall</td>
          <td class="text-center skill-level">${totalLevel}</td>
          <td class="text-right skill-xp">${totalXP.toLocaleString()}</td>
          <td class="text-center skill-rank">${overallRank ? "#" + overallRank : "—"}</td>
        `, tbody.appendChild(overallTr), SKILLS.forEach((skillName) => {
      let skill = user.skills[skillName], rank = getUserSkillRank(skillRankings, username, skillName), tr = document.createElement("tr");
      1 === rank ? tr.classList.add("rank-1") : 2 === rank ? tr.classList.add("rank-2") : 3 === rank && tr.classList.add("rank-3");
      let baseXP = 1154 * ("hitpoints" === skillName), isClickable = void 0;
      ((skill?.level || 1) > 1 || (skill?.xp || 0) > baseXP) && (tr.classList.add("clickable"), tr.addEventListener("click", () => {
        window.open(`skill-hiscores.html?skill=${skillName}#skill=${skillName}`, "_blank");
      }));
      let iconUrl = window.getSkillIcon(skillName), nameCell = document.createElement("td");
      nameCell.className = "text-left", nameCell.innerHTML = `${iconUrl ? `<img src="${iconUrl}" class="skill-icon skill-icon--sm" alt="${skillName}" loading="lazy" decoding="async">` : ""}<span class="skill-name text-capitalize">${skillName}</span>`;
      let lvl = skill?.level ?? 1, xp = skill?.xp ?? 0;
      tr.appendChild(nameCell), tr.appendChild(el("td", "text-center skill-level", [
        text(String(lvl))
      ])), tr.appendChild(el("td", "text-right skill-xp", [
        text(xp.toLocaleString())
      ])), tr.appendChild(el("td", "text-center skill-rank", [
        text(rank ? `#${rank}` : "—")
      ])), tbody.appendChild(tr);
    }), updateSummary(user, skillRankings), root.innerHTML = "", root.appendChild(wrap);
  }).catch((err) => {
    let __leftExtrasErr = document.querySelector('#leftStackExtras');
    __leftExtrasErr && (__leftExtrasErr.innerHTML = '');
    let is404 = err && /404/.test(String(err.message || err));
    root.innerHTML = `<div class="text-center py-8"><div class="text-danger text-xl font-semibold">${is404 ? "❌ Player not found" : "❌ Failed to load player data"}</div><div class="text-muted mt-2">${is404 ? "The player you're looking for doesn't exist in our database." : "Something went wrong while loading this player. Check the console/network tab for details."}</div></div>`, updateSummary(null);
  });
}
function handleRoute() {
  let hash = location.hash.slice(1);
  if (hash) if (hash.startsWith("user/")) {
    let u = void 0;
    renderUserView(decodeURIComponent(hash.split("/")[1]));
  } else renderHomeView(), updateSummary(null);
  else renderHomeView(), updateSummary(null);
}
function setupSearch() {
  let debounce, input = $("#playerSearch"), suggest = $("#searchSuggest"), activeIndex = -1, currentItems = [], loading = !1;
  function hideSuggest() {
    suggest.classList.add("hidden"), suggest.innerHTML = "", activeIndex = -1, currentItems = [], input.setAttribute("aria-expanded", "false");
  }
  function renderSuggest(matches) {
    currentItems = matches, suggest.innerHTML = matches.map((m, i) => `<button role="option" aria-selected="${i === activeIndex}" data-user="${m}" class="block${i === activeIndex ? " active" : ""}">${m}</button>`).join(""), suggest.classList.remove("hidden"), input.setAttribute("aria-expanded", "true");
  }
  input.addEventListener("input", () => {
    clearTimeout(debounce), debounce = setTimeout(async () => {
      let q = input.value.trim().toLowerCase();
      if (!q) return void hideSuggest();
      try {
        loading = !0, suggest.innerHTML = '<div class="p-2 text-center text-xs text-muted">Loading…</div>', suggest.classList.remove('hidden');
        let list = void 0, matches = (await loadUsers()).users.filter((u) => u.toLowerCase().includes(q)).slice(0, 10);
        if (!matches.length) return void hideSuggest();
        activeIndex = -1, renderSuggest(matches);
      } catch (e) {
        hideSuggest();
      } finally {
        loading = !1;
      }
    }, 200);
  }), input.addEventListener("keydown", (e) => {
    if (suggest.classList.contains("hidden")) {
      "ArrowDown" === e.key && e.preventDefault();
      return;
    }
    if ("Escape" === e.key) hideSuggest(), input.blur();
    else if ("ArrowDown" === e.key) e.preventDefault(), activeIndex = Math.min(currentItems.length - 1, activeIndex + 1), renderSuggest(currentItems);
    else if ("ArrowUp" === e.key) e.preventDefault(), activeIndex = Math.max(0, activeIndex - 1), renderSuggest(currentItems);
    else if ("Enter" === e.key) {
      e.preventDefault();
      let u = null;
      if (activeIndex >= 0 && currentItems[activeIndex]) u = currentItems[activeIndex];
      else if (currentItems && currentItems.length) u = currentItems[0];
      if (u) { location.hash = "user/" + encodeURIComponent(u); hideSuggest(); }
    }
  }), document.addEventListener("click", (e) => {
    if (e.target.closest("#searchSuggest button")) {
      let u = e.target.getAttribute("data-user");
      location.hash = "user/" + encodeURIComponent(u), hideSuggest();
    } else e.target.closest("#playerSearch") || e.target.closest("#searchSuggest") || hideSuggest();
  }), input.addEventListener("change", async () => {
    let q = input.value.trim().toLowerCase();
    if (q) try {
      let list = void 0, found = (await loadUsers()).users.find((u) => u.toLowerCase() === q);
      found && (location.hash = "user/" + encodeURIComponent(found));
    } catch (_) { }
  }), input.setAttribute("role", "combobox"), input.setAttribute("aria-autocomplete", "list"), input.setAttribute("aria-expanded", "false"), suggest.setAttribute("role", "listbox");
}
document.addEventListener("click", (e) => {
  let btn = e.target.closest(".username-link");
  if (btn) {
    let u = btn.getAttribute("data-user");
    location.hash = "user/" + encodeURIComponent(u);
  }
  const cp = e.target.closest('#copyProfileLink');
  if (cp) {
    const href = window.location.href;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(href).then(() => toast('Profile link copied')).catch(() => toast('Copy failed', 'error'));
    } else {
      // Fallback: create a temporary input
      const tmp = document.createElement('input');
      tmp.value = href; document.body.appendChild(tmp); tmp.select();
      try { document.execCommand('copy'); toast('Profile link copied'); } catch (_) { toast('Copy failed', 'error'); }
      tmp.remove();
    }
  }
  ("themeToggle" === e.target.id || e.target.closest("#themeToggle")) && toggleTheme();
  let brand = void 0;
  e.target.closest(".brand-link") && (e.preventDefault(), location.hash = "");
}), window.addEventListener("hashchange", handleRoute), (() => {
  let saved = void 0, startTheme = void 0;
  setTheme(localStorage.getItem("theme") || (matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")), setupSearch(), handleRoute();
  let apiSpan = $("#currentApiBase");
  if (apiSpan && window.API_BASE) {
    let displayBase = void 0;
    apiSpan.textContent = window.API_BASE === location.origin ? "Same-origin" : window.API_BASE;
  }
  // Keyboard shortcut: focus search with '/'
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const tag = (e.target && e.target.tagName) || '';
      if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !e.target.isContentEditable) {
        e.preventDefault();
        const inp = document.getElementById('playerSearch');
        if (inp) { inp.focus(); inp.select(); }
      }
    }
  });
})();
let RARITY_ORDER = {
  mythic: 0,
  legendary: 1,
  epic: 2,
  rare: 3,
  common: 4
};

// Helper: compute a map of username -> number of skills where they are rank #1
function buildTop1Counts(rankings) {
  const map = new Map();
  if (!rankings || !rankings.rankings) return map;
  const R = rankings.rankings;
  (window.SKILLS || []).forEach((s) => {
    const arr = R[s] || [];
    if (arr[0] && arr[0].username) {
      const u = arr[0].username;
      map.set(u, (map.get(u) || 0) + 1);
    }
  });
  return map;
}
function deriveAchievementsForPlayer(player, rankings, totalPlayers) {
  const byKey = new Map((window.ACHIEVEMENT_CATALOG || []).map((a) => [a.key, a]));
  const keys = player?.achievements && typeof player.achievements === 'object'
    ? Object.keys(player.achievements)
    : [];
  if (!keys.length) return [];
  const achievements = keys.map((k) => byKey.get(k)).filter(Boolean);
  return achievements.sort((a, b) => (RARITY_ORDER[a.rarity] || 999) - (RARITY_ORDER[b.rarity] || 999));
}

// ————————————————————————————————————————————————
// Rare Banners: fetch, validate, and rotate at top of homepage
function initRareBannerRotator() {
  const container = document.getElementById('bannerContainer');
  if (!container) return;
  let banners = [];
  let idx = 0; let timer = null;
  const isIso = (s) => typeof s === 'string' && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/.test(s);
  const validate = (b) => {
    if (!b || typeof b !== 'object') return false;
    if (!Array.isArray(b.playerNames) || !b.playerNames.length) return false;
    if (b.playerNames.some(n => typeof n !== 'string' || !n.trim())) return false;
    if (typeof b.achievement !== 'string' || !b.achievement.trim()) return false;
    if (!isIso(b.timestamp) || !isIso(b.expiry)) return false;
    if (!b.details || typeof b.details !== 'object') return false;
    if (!(b.details.skill === null || typeof b.details.skill === 'string')) return false;
    if (!(b.details.title === null || typeof b.details.title === 'string')) return false;
    // Exclude expired
    if (Date.parse(b.expiry) <= Date.now()) return false;
    return true;
  };
  const render = (b) => {
    container.innerHTML = '';
    if (!b) return;
    const div = document.createElement('div');
    div.className = 'rare-banner active';
    const icon = document.createElement('div'); icon.className = 'banner-icon'; icon.textContent = '🎉';
    const left = document.createElement('div'); left.className = 'banner-left';
    const textWrap = document.createElement('div'); textWrap.className = 'banner-text';
    const title = document.createElement('div'); title.className = 'banner-title';
    const names = b.playerNames.join(', ');
    title.textContent = `Congrats ${names}! ${b.achievement}`;
    const meta = document.createElement('div'); meta.className = 'banner-meta';
    const ts = new Date(b.timestamp).toISOString();
    meta.textContent = ts;
    if (b.details) {
      if (b.details.skill) {
        const pill = document.createElement('span'); pill.className = 'pill'; pill.textContent = b.details.skill; meta.appendChild(pill);
      }
      if (b.details.title) {
        const pill = document.createElement('span'); pill.className = 'pill'; pill.textContent = b.details.title; meta.appendChild(pill);
      }
    }
    textWrap.appendChild(title); textWrap.appendChild(meta);
    left.appendChild(icon); left.appendChild(textWrap);
    div.appendChild(left);
    container.appendChild(div);
  };
  const next = () => {
    if (!banners.length) { container.innerHTML = ''; return; }
    idx = (idx + 1) % banners.length;
    render(banners[idx]);
  };
  const start = () => {
    if (timer) clearInterval(timer);
    if (!banners.length) { container.innerHTML = ''; return; }
    // Sort newest first just in case
    banners.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
    idx = -1; next();
    timer = setInterval(next, 10_000);
  };
  fetchJSON('/api/banners/rare').then((arr) => {
    try {
      if (!Array.isArray(arr)) { console.error('rare banners: not array'); return; }
      banners = arr.filter(validate);
      start();
    } catch (e) { console.error('rare banners parse error', e); }
  }).catch((e) => {
    console.debug('No rare banners', e?.message || e);
  });
}
