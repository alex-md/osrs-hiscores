const LEADERBOARD_LIMIT = 500;
const cache = {
  leaderboard: null,
  users: null,
  skillRankings: null,
  usersFetchedAt: 0
};
function formatRelativeTime(ts) {
  let date = new Date(ts), diffMs = void 0, sec = Math.round((Date.now() - date.getTime()) / 1000), min = Math.round(sec / 60), hr = Math.round(min / 60), day = Math.round(hr / 24), month = Math.round(day / 30), year = Math.round(day / 365);
  return sec < 5 ? 'just now' : sec < 60 ? `${sec}s ago` : min < 60 ? `${min}m ago` : hr < 24 ? `${hr}h ago` : day < 30 ? `${day}d ago` : month < 12 ? `${month}mo ago` : `${year}y ago`;
}
function formatSigned(value, digits = 0) {
  if (!Number.isFinite(value)) return '—';
  if (value === 0) return '±0';
  const sign = value > 0 ? '+' : '−';
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits > 0 ? 1 : 0
  });
  return `${sign}${formatted}`;
}
function formatCompactNumber(value) {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  const format = (divisor, suffix, decimals) => `${(value / divisor).toFixed(decimals).replace(/\.0+$/, '')}${suffix}`;
  if (abs >= 1e9) return format(1e9, 'B', abs >= 1e10 ? 0 : 1);
  if (abs >= 1e6) return format(1e6, 'M', abs >= 1e7 ? 0 : 1);
  if (abs >= 1e3) return format(1e3, 'K', abs >= 1e4 ? 0 : 1);
  return value.toLocaleString();
}
function formatPercentage(value, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  const fixed = value.toFixed(digits);
  const trimmed = fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  return `${trimmed}%`;
}

const ACHIEVEMENT_LABEL_OVERRIDES = {
  'overall-rank-1': 'Overall Rank #1',
  'first-99-any': 'First 99 (Any Skill)',
  'first-top1-any': 'First #1 (Any Skill)',
  'maxed-account': 'Maxed Account',
  'combat-maxed': 'All Combat Skills 99',
  'total-2277': 'Max Total Level (2277)',
  'total-2200': 'Total Level 2200+',
  'total-2000': 'Total Level 2000+',
  'total-1500': 'Total Level 1500+',
  'totalxp-200m': '200m Total XP',
  'totalxp-100m': '100m Total XP',
  'totalxp-50m': '50m Total XP',
  'totalxp-10m': '10m Total XP',
  'xp-billionaire': '1b Total XP',
  'xp-millionaire': '1m Total XP',
  'tier-grandmaster': 'Grandmaster Tier',
  'tier-master': 'Master Tier',
  'tier-diamond': 'Diamond Tier',
  'tier-platinum': 'Platinum Tier',
  'tier-gold': 'Gold Tier',
  'tier-silver': 'Silver Tier',
  'tier-bronze': 'Bronze Tier'
};

function capitalizeSkillName(skill) {
  if (!skill) return '';
  return skill.charAt(0).toUpperCase() + skill.slice(1);
}

function friendlyAchievementLabel(key) {
  if (!key) return '';
  const catalog = Array.isArray(window.ACHIEVEMENT_CATALOG) ? window.ACHIEVEMENT_CATALOG : [];
  const found = catalog.find((item) => item && item.key === key);
  if (found && found.label) return found.label;
  if (ACHIEVEMENT_LABEL_OVERRIDES[key]) return ACHIEVEMENT_LABEL_OVERRIDES[key];
  let match = /^skill-master-(.+)$/.exec(key);
  if (match) return `99 ${capitalizeSkillName(match[1])}`;
  match = /^skill-200m-(.+)$/.exec(key);
  if (match) return `200m XP in ${capitalizeSkillName(match[1])}`;
  match = /^totalxp-(\d+)([a-z]+)$/.exec(key);
  if (match) return `${match[1]}${match[2].toUpperCase()} Total XP`;
  if (key === 'triple-crown') return 'Three #1 Skill Ranks';
  if (key === 'crowned-any') return '#1 Rank (Any Skill)';
  if (key === 'top-10-any') return 'Top 10 (Any Skill)';
  if (key === 'top-100-any') return 'Top 100 (Any Skill)';
  if (key === 'gathering-elite') return '90+ Gathering Trio';
  if (key === 'artisan-elite') return '90+ Artisan Trio';
  if (key === 'support-elite') return '90+ Support Trio';
  if (key === 'balanced') return 'Balanced Skill Spread';
  if (key === 'glass-cannon') return 'Glass Cannon Build';
  if (key === 'tank') return 'Tank Build';
  if (key === 'skiller') return 'Skiller Build';
  if (key === 'combat-pure') return 'Combat Pure Build';
  return key.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function createUsernameLink(username) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'username-link';
  btn.setAttribute('data-user', username);
  btn.textContent = username;
  return btn;
}

function createTierBadge(player) {
  const tier = player?.tier;
  if (!tier) return null;
  const badge = document.createElement('span');
  badge.className = `tier-badge tier--mini tier-${tier.toLowerCase()}`;
  badge.textContent = tier;
  const details = [];
  if (Number.isFinite(player?.rank)) details.push(`Overall #${player.rank}`);
  const top1 = Number(player?.tierInfo?.top1Skills || 0);
  if (top1 > 0) details.push(`#1 in ${top1} skill${top1 === 1 ? '' : 's'}`);
  if (details.length) badge.setAttribute('data-tooltip', details.join(' • '));
  return badge;
}

function createDeltaSpan(value, digits = 0, { compact = false } = {}) {
  if (!Number.isFinite(value) || value === 0) return null;
  const span = document.createElement('span');
  span.className = `trend-delta ${value > 0 ? 'positive' : 'negative'}`;
  span.textContent = compact ? formatCompactNumber(value) : formatSigned(value, digits);
  return span;
}

function describeWatchlistSource(entry) {
  if (!entry) return '';
  if (entry.source === 'rare-achievement') return 'Rare unlock';
  if (entry.source === 'rank-climb') return 'Rank surge';
  if (entry.source === 'top-tier') return entry.fallback ? 'Top tier (fallback)' : 'Top tier';
  return 'Auto pick';
}

let rareBannerInitialized = false;

function buildStatBlock(label, value, deltaEl = null) {
  const block = el('div', 'flex flex-col gap-1');
  block.appendChild(el('span', 'text-xs uppercase tracking-wide text-muted', [text(label)]));
  const row = el('div', 'flex-items-center gap-2 text-lg font-semibold');
  row.appendChild(text(typeof value === 'string' ? value : String(value)));
  if (deltaEl) row.appendChild(deltaEl);
  block.appendChild(row);
  return block;
}

function buildOnTheRiseCard(onTheRise) {
  const card = el('section', 'card home-widget-card');
  const header = el('div', 'home-widget-header', [
    el('div', 'flex-items-center gap-2', [text('📈 On the Rise')])
  ]);
  const hours = Number(onTheRise?.windowHours);
  header.appendChild(el('div', 'home-widget-meta', [
    text(hours ? `Rank climbs across the last ${hours}h` : 'Latest notable rank gains')
  ]));
  const body = el('div', 'home-widget-body');
  const list = el('ul', 'on-rise-list');
  const entries = Array.isArray(onTheRise?.players) ? onTheRise.players : [];
  if (!entries.length) {
    list.appendChild(el('li', 'on-rise-empty', [text('No major rank climbs detected yet.')]));
  } else {
    entries.forEach((player) => {
      const li = el('li', 'on-rise-item');
      const main = el('div', 'on-rise-item-main');
      const nameRow = el('div', 'on-rise-name-row');
      nameRow.appendChild(createUsernameLink(player.username));
      const delta = Number(player.delta);
      if (Number.isFinite(delta) && delta !== 0) {
        const deltaEl = el('span', 'on-rise-delta', [text(formatSigned(delta))]);
        nameRow.appendChild(deltaEl);
      }
      main.appendChild(nameRow);
      const metaParts = [];
      if (Number.isFinite(player.currentRank)) metaParts.push(`Now #${player.currentRank}`);
      if (Number.isFinite(player.previousRank)) metaParts.push(`from #${player.previousRank}`);
      if (Number.isFinite(player.totalLevel)) metaParts.push(`Lv ${player.totalLevel.toLocaleString()}`);
      if (Number.isFinite(player.totalXP)) metaParts.push(`${formatCompactNumber(player.totalXP)} XP`);
      if (metaParts.length) {
        main.appendChild(el('div', 'on-rise-meta', [text(metaParts.join(' • '))]));
      }
      li.appendChild(main);
      list.appendChild(li);
    });
  }
  body.appendChild(list);
  card.appendChild(header);
  card.appendChild(body);
  return card;
}

function buildTrendSummaryCard(summary) {
  const card = el('section', 'card home-widget-card');
  const header = el('div', 'home-widget-header', [
    el('div', 'flex-items-center gap-2', [text('📊 Leaderboard Trends')])
  ]);
  if (summary) {
    const sampleParts = [];
    if (Number.isFinite(summary.sampleSize)) sampleParts.push(`${summary.sampleSize} players`);
    if (Number.isFinite(summary.sampleWindowHours)) sampleParts.push(`${summary.sampleWindowHours}h window`);
    if (sampleParts.length) header.appendChild(el('div', 'home-widget-meta', [text(sampleParts.join(' • '))]));
  } else {
    header.appendChild(el('div', 'home-widget-meta', [text('Awaiting recent history')]));
  }
  const body = el('div', 'home-widget-body');
  const list = el('ul', 'home-trends-list');
  if (!summary) {
    list.appendChild(el('li', 'home-trend-item', [text('History unavailable yet.')]));
  } else {
    const totalPlayers = Number(summary.totalPlayers) || 0;
    const playersDelta = createDeltaSpan(summary.totalPlayersChange24h, 0, { compact: true });
    const totalRow = el('li', 'home-trend-item');
    totalRow.appendChild(el('span', 'home-trend-label', [text('Total players')]));
    const totalValue = el('span', 'home-trend-value', [text(totalPlayers.toLocaleString())]);
    if (playersDelta) totalValue.appendChild(playersDelta);
    totalRow.appendChild(totalValue);
    list.appendChild(totalRow);

    const avgLevel = summary.avgTotalLevel?.current;
    const levelRow = el('li', 'home-trend-item');
    levelRow.appendChild(el('span', 'home-trend-label', [text('Avg total level')]));
    const levelValue = el('span', 'home-trend-value', [
      text(Number.isFinite(avgLevel) ? avgLevel.toFixed(1) : '—')
    ]);
    const levelDelta = createDeltaSpan(summary.avgTotalLevel?.change, 1);
    if (levelDelta) levelValue.appendChild(levelDelta);
    levelRow.appendChild(levelValue);
    list.appendChild(levelRow);

    const avgXp = summary.avgTotalXP?.current;
    const xpRow = el('li', 'home-trend-item');
    xpRow.appendChild(el('span', 'home-trend-label', [text('Avg total XP')]));
    const xpValue = el('span', 'home-trend-value', [
      text(Number.isFinite(avgXp) ? formatCompactNumber(avgXp) : '—')
    ]);
    const xpDelta = createDeltaSpan(summary.avgTotalXP?.change, 0, { compact: true });
    if (xpDelta) xpValue.appendChild(xpDelta);
    xpRow.appendChild(xpValue);
    list.appendChild(xpRow);
  }
  body.appendChild(list);
  card.appendChild(header);
  card.appendChild(body);
  return card;
}

function buildWeeklyRarestCard(weeklyRarest) {
  const card = el('section', 'card home-widget-card');
  const header = el('div', 'home-widget-header', [
    el('div', 'flex-items-center gap-2', [text('🏅 Weekly Rarest Unlock')])
  ]);
  header.appendChild(el('div', 'home-widget-meta', [
    text(weeklyRarest ? `Window: last ${weeklyRarest.windowDays || 7} days` : 'Watching rare achievement unlocks')
  ]));
  card.appendChild(header);
  const body = el('div', 'home-widget-body');
  if (!weeklyRarest) {
    body.appendChild(el('div', 'weekly-rarest-empty', [text('No rare achievements unlocked this week yet.')]));
  } else {
    const title = friendlyAchievementLabel(weeklyRarest.key) || weeklyRarest.key;
    body.appendChild(el('div', 'text-base font-semibold', [text(title)]));
    const statsParts = [];
    if (Number.isFinite(weeklyRarest.globalCount)) statsParts.push(`${weeklyRarest.globalCount.toLocaleString()} total unlocks`);
    if (Number.isFinite(weeklyRarest.weeklyCount)) statsParts.push(`${weeklyRarest.weeklyCount} this week`);
    if (Number.isFinite(weeklyRarest.prevalencePct)) statsParts.push(`≈ ${formatPercentage(weeklyRarest.prevalencePct, 3)} of players`);
    if (weeklyRarest.rarity) statsParts.push(`Rarity: ${weeklyRarest.rarity}`);
    if (statsParts.length) body.appendChild(el('div', 'home-widget-meta', [text(statsParts.join(' • '))]));

    const list = el('ul', 'weekly-rarest-unlocks');
    const recent = Array.isArray(weeklyRarest.recentUnlocks) ? weeklyRarest.recentUnlocks : [];
    if (!recent.length) {
      list.appendChild(el('li', 'weekly-rarest-empty', [text('No unlocks recorded in the last few days.')]));
    } else {
      recent.forEach((unlock) => {
        const item = el('li', 'weekly-rarest-player');
        item.appendChild(createUsernameLink(unlock.username));
        const timeEl = document.createElement('time');
        const ts = unlock.timestamp ? new Date(unlock.timestamp) : null;
        if (ts && !Number.isNaN(ts.getTime())) {
          timeEl.dateTime = ts.toISOString();
          timeEl.textContent = formatRelativeTime(ts.getTime());
          timeEl.setAttribute('title', ts.toLocaleString());
        } else {
          timeEl.textContent = '—';
        }
        item.appendChild(timeEl);
        list.appendChild(item);
      });
    }
    body.appendChild(list);
  }
  card.appendChild(body);
  return card;
}

function buildWatchlistCard(watchlist) {
  const card = el('section', 'card watchlist-card');
  const header = el('div', 'home-widget-header', [
    el('div', 'flex-items-center gap-2', [text('🕵️ Auto Watchlist')])
  ]);
  const generated = Number(watchlist?.generatedAt);
  const metaParts = [];
  if (generated) metaParts.push(`Updated ${formatRelativeTime(generated)}`);
  if (Number.isFinite(watchlist?.windowHours)) metaParts.push(`Window ${watchlist.windowHours}h`);
  if (Number.isFinite(watchlist?.totalPlayers)) metaParts.push(`${watchlist.totalPlayers.toLocaleString()} players tracked`);
  header.appendChild(el('div', 'home-widget-meta', [text(metaParts.length ? metaParts.join(' • ') : 'Auto-curated from leaderboard activity')]));
  card.appendChild(header);

  if (watchlist?.sources) {
    const { rare = 0, climbers = 0, anchors = 0 } = watchlist.sources;
    const summary = [];
    if (rare) summary.push(`${rare} rare`);
    if (climbers) summary.push(`${climbers} climbers`);
    if (anchors) summary.push(`${anchors} anchors`);
    if (summary.length) card.appendChild(el('div', 'watchlist-actions', [text(`Sources: ${summary.join(' • ')}`)]));
  }

  const list = el('ul', 'watchlist-list');
  const tracked = Array.isArray(watchlist?.tracked) ? watchlist.tracked : [];
  if (!tracked.length) {
    list.appendChild(el('li', 'watchlist-empty', [text(watchlist?.message || 'No notable players detected yet.')]));
  } else {
    tracked.forEach((entry) => {
      const li = el('li', 'watchlist-player');
      const topRow = el('div', 'watchlist-player-top');
      topRow.appendChild(createUsernameLink(entry.username));
      const badge = createTierBadge(entry);
      if (badge) topRow.appendChild(badge);
      if (entry.source) {
        const tag = el('span', 'watchlist-tag', [text(describeWatchlistSource(entry))]);
        topRow.appendChild(tag);
      }
      if (Number.isFinite(entry.delta) && entry.delta > 0) {
        topRow.appendChild(el('span', 'watchlist-delta', [text(formatSigned(entry.delta))]));
      }
      li.appendChild(topRow);

      const reasonText = entry.reason || (entry.achievementKey ? friendlyAchievementLabel(entry.achievementKey) : '') || describeWatchlistSource(entry);
      if (reasonText) li.appendChild(el('div', 'watchlist-reason', [text(reasonText)]));

      const metaParts = [];
      if (Number.isFinite(entry.rank)) metaParts.push(`Rank #${entry.rank}`);
      if (Number.isFinite(entry.previousRank)) metaParts.push(`Prev #${entry.previousRank}`);
      if (entry.tier && !badge) metaParts.push(entry.tier);
      if (metaParts.length) li.appendChild(el('div', 'watchlist-meta', [text(metaParts.join(' • '))]));

      if (entry.happenedAt) {
        const ts = new Date(entry.happenedAt);
        if (!Number.isNaN(ts.getTime())) {
          const when = el('div', 'watchlist-status', [text(`Last event ${formatRelativeTime(ts.getTime())}`)]);
          when.setAttribute('title', ts.toLocaleString());
          li.appendChild(when);
        }
      }

      list.appendChild(li);
    });
  }
  card.appendChild(list);
  if (watchlist?.message && tracked.length) {
    card.appendChild(el('div', 'watchlist-more', [text(watchlist.message)]));
  }
  return card;
}

function setHomeHeroVisible(show) {
  const hero = $('#homeHero');
  if (!hero) return;
  if (show) {
    hero.classList.remove('is-hidden');
    hero.removeAttribute('aria-hidden');
  } else {
    hero.classList.add('is-hidden');
    hero.setAttribute('aria-hidden', 'true');
  }
}

function buildHeroPodiumEntry(player, index) {
  const rank = Number(player?.rank) || index + 1;
  const li = el('li', `hero-podium-slot hero-podium-slot--${index + 1}`);
  li.appendChild(el('span', 'hero-podium-rank', [text(`#${rank}`)]));

  const nameRow = el('div', 'hero-podium-name');
  nameRow.appendChild(createUsernameLink(player?.username || 'Unknown'));
  const badge = createTierBadge(player);
  if (badge) nameRow.appendChild(badge);
  li.appendChild(nameRow);

  const level = Number(player?.totalLevel);
  const xp = Number(player?.totalXP);
  if (Number.isFinite(level)) {
    li.appendChild(el('div', 'hero-podium-meta', [text(`Total level ${level.toLocaleString()}`)]));
  }
  if (Number.isFinite(xp)) {
    li.appendChild(el('div', 'hero-podium-meta', [text(`${formatCompactNumber(xp)} XP`)]));
  }
  const metaParts = [];
  const top1 = Number(player?.tierInfo?.top1Skills || 0);
  if (top1 > 0) metaParts.push(`#1 in ${top1} skill${top1 === 1 ? '' : 's'}`);
  if (player?.archetype) metaParts.push(player.archetype.replace(/-/g, ' '));
  if (player?.updatedAt) {
    const ts = new Date(player.updatedAt);
    if (!Number.isNaN(ts.getTime())) metaParts.push(`Updated ${formatRelativeTime(ts.getTime())}`);
  }
  if (metaParts.length) {
    li.appendChild(el('div', 'hero-podium-meta', [text(metaParts.join(' • '))]));
  }
  return li;
}

function buildHeroTicker(onTheRise) {
  const track = el('div', 'ticker-track');
  const entries = Array.isArray(onTheRise?.players) ? onTheRise.players.slice(0, 4) : [];
  if (!entries.length) {
    track.appendChild(el('span', 'ticker-item', [text('Waiting for the next surge…')]));
    return track;
  }
  const makeItem = (player) => {
    const item = el('span', 'ticker-item');
    item.appendChild(createUsernameLink(player?.username || 'Unknown'));
    const delta = Number(player?.delta);
    const metaParts = [];
    if (Number.isFinite(delta) && delta !== 0) metaParts.push(formatSigned(delta));
    if (Number.isFinite(player?.currentRank)) metaParts.push(`#${player.currentRank}`);
    if (Number.isFinite(player?.totalLevel)) metaParts.push(`${player.totalLevel.toLocaleString()} total`);
    if (Number.isFinite(player?.totalXP)) metaParts.push(`${formatCompactNumber(player.totalXP)} XP`);
    if (metaParts.length) item.appendChild(el('span', 'ticker-meta', [text(metaParts.join(' • '))]));
    return item;
  };
  const items = entries.map(makeItem);
  items.forEach((node) => track.appendChild(node));
  if (items.length > 1) {
    items.forEach((node) => {
      const clone = node.cloneNode(true);
      clone.dataset.duplicate = 'true';
      track.appendChild(clone);
    });
  }
  return track;
}

function renderHeroSnapshot(leaderboard) {
  const hero = $('#homeHero');
  if (!hero) return;
  hero.classList.remove('is-hidden');
  hero.removeAttribute('aria-hidden');

  const players = Array.isArray(leaderboard?.players) ? leaderboard.players : [];
  const totalPlayers = Number(leaderboard?.totalPlayers) || players.length || 0;
  const trend = leaderboard?.trendSummary || {};
  const generatedAt = Number(leaderboard?.generatedAt) || null;

  const totalEl = $('#heroTotalPlayers');
  if (totalEl) totalEl.textContent = totalPlayers ? totalPlayers.toLocaleString() : '—';
  const totalDeltaWrap = $('#heroTotalPlayersDelta');
  if (totalDeltaWrap) {
    totalDeltaWrap.innerHTML = '';
    const delta = createDeltaSpan(trend.totalPlayersChange24h, 0, { compact: true });
    if (delta) totalDeltaWrap.appendChild(delta);
  }

  const avgLevel = Number(trend?.avgTotalLevel?.current);
  const avgLevelEl = $('#heroAvgLevel');
  if (avgLevelEl) avgLevelEl.textContent = Number.isFinite(avgLevel) ? avgLevel.toFixed(1) : '—';
  const avgLevelDeltaWrap = $('#heroAvgLevelDelta');
  if (avgLevelDeltaWrap) {
    avgLevelDeltaWrap.innerHTML = '';
    const delta = createDeltaSpan(trend?.avgTotalLevel?.change, 1);
    if (delta) avgLevelDeltaWrap.appendChild(delta);
  }

  const avgXp = Number(trend?.avgTotalXP?.current);
  const avgXpEl = $('#heroAvgXp');
  if (avgXpEl) avgXpEl.textContent = Number.isFinite(avgXp) ? formatCompactNumber(avgXp) : '—';
  const avgXpDeltaWrap = $('#heroAvgXpDelta');
  if (avgXpDeltaWrap) {
    avgXpDeltaWrap.innerHTML = '';
    const delta = createDeltaSpan(trend?.avgTotalXP?.change, 0, { compact: true });
    if (delta) avgXpDeltaWrap.appendChild(delta);
  }

  const lastUpdated = $('#heroLastUpdated');
  if (lastUpdated) {
    if (generatedAt) {
      lastUpdated.textContent = formatRelativeTime(generatedAt);
      lastUpdated.setAttribute('title', new Date(generatedAt).toLocaleString());
    } else {
      lastUpdated.textContent = 'Live snapshot';
      lastUpdated.removeAttribute('title');
    }
  }

  const updateChip = $('#heroUpdateChip');
  if (updateChip) {
    updateChip.textContent = generatedAt ? `Updated ${formatRelativeTime(generatedAt)}` : 'Live snapshot';
  }

  const podium = $('#heroPodium');
  if (podium) {
    podium.innerHTML = '';
    if (!players.length) {
      podium.appendChild(el('li', 'hero-podium-empty', [text('Leaderboard warming up…')]));
    } else {
      players.slice(0, 3).forEach((player, index) => {
        podium.appendChild(buildHeroPodiumEntry(player, index));
      });
    }
  }

  const momentum = Array.isArray(leaderboard?.onTheRise?.players) ? leaderboard.onTheRise.players : [];
  const spotlightWrap = $('#heroSpotlight');
  const spotlightName = $('#heroSpotlightName');
  const spotlightMeta = $('#heroSpotlightMeta');
  if (spotlightWrap && spotlightName && spotlightMeta) {
    const focus = momentum.find(Boolean);
    if (focus) {
      spotlightName.textContent = focus.username || 'Unknown contender';
      const details = [];
      const delta = Number(focus.delta);
      if (Number.isFinite(delta) && delta !== 0) details.push(`${formatSigned(delta)} ranks`);
      if (Number.isFinite(focus.currentRank)) details.push(`Now #${focus.currentRank}`);
      if (Number.isFinite(focus.totalLevel)) details.push(`Lv ${focus.totalLevel.toLocaleString()}`);
      if (Number.isFinite(focus.totalXP)) details.push(`${formatCompactNumber(focus.totalXP)} XP`);
      spotlightMeta.textContent = details.length ? details.join(' • ') : 'Surging through the standings right now.';
      spotlightWrap.classList.add('is-active');
    } else {
      spotlightName.textContent = 'Awaiting challenger…';
      spotlightMeta.textContent = 'Stay tuned for the next dramatic climb.';
      spotlightWrap.classList.remove('is-active');
    }
  }

  const tickerWrap = $('#heroTicker');
  if (tickerWrap) {
    tickerWrap.innerHTML = '';
    const track = buildHeroTicker(leaderboard?.onTheRise || {});
    tickerWrap.appendChild(track);
    if (window.applyTickerMotion) window.applyTickerMotion(tickerWrap, track);
    else tickerWrap.classList.toggle('paused', track.childElementCount <= 1);
  }
}

function buildLeaderboardTable(players) {
  const wrapper = el('div', 'osrs-table home-leaderboard');
  const scroll = el('div', 'table-scroll');
  const table = document.createElement('table');
  table.className = 'leaderboard-table';
  table.innerHTML = `
      <thead>
        <tr>
          <th class="text-center">Rank</th>
          <th class="text-left">Player</th>
          <th class="text-center">Total Level</th>
          <th class="text-right">Total XP</th>
          <th class="text-right">Last Update</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
  const tbody = table.querySelector('tbody');
  if (!players || !players.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.className = 'text-center py-6 text-muted';
    cell.textContent = 'No leaderboard data available.';
    row.appendChild(cell);
    tbody.appendChild(row);
  } else {
    players.forEach((player) => {
      const tr = document.createElement('tr');
      tr.classList.add('top-player-row');
      if (player.rank === 1) tr.classList.add('rank-1');
      else if (player.rank === 2) tr.classList.add('rank-2');
      else if (player.rank === 3) tr.classList.add('rank-3');

      const rankCell = document.createElement('td');
      rankCell.className = 'text-center insight-rank';
      rankCell.textContent = Number.isFinite(player.rank) ? `#${player.rank}` : '—';
      tr.appendChild(rankCell);

      const playerCell = document.createElement('td');
      playerCell.className = 'text-left';
      playerCell.appendChild(createUsernameLink(player.username));
      const badge = createTierBadge(player);
      if (badge) playerCell.appendChild(badge);
      const metaParts = [];
      const top1 = Number(player?.tierInfo?.top1Skills || 0);
      if (top1 > 0) metaParts.push(`#1 in ${top1} skill${top1 === 1 ? '' : 's'}`);
      if (player.archetype) metaParts.push(player.archetype.replace(/-/g, ' '));
      if (metaParts.length) {
        playerCell.appendChild(el('div', 'text-xs text-muted flex gap-2 flex-wrap mt-1', [text(metaParts.join(' • '))]));
      }
      tr.appendChild(playerCell);

      const levelCell = document.createElement('td');
      levelCell.className = 'text-center skill-level';
      levelCell.textContent = Number.isFinite(player.totalLevel) ? player.totalLevel.toLocaleString() : '—';
      tr.appendChild(levelCell);

      const xpCell = document.createElement('td');
      xpCell.className = 'text-right skill-xp';
      xpCell.textContent = Number.isFinite(player.totalXP) ? player.totalXP.toLocaleString() : '—';
      tr.appendChild(xpCell);

      const updatedCell = document.createElement('td');
      updatedCell.className = 'text-right text-sm text-muted';
      if (player.updatedAt) {
        const ts = new Date(player.updatedAt);
        if (!Number.isNaN(ts.getTime())) {
          updatedCell.textContent = formatRelativeTime(ts.getTime());
          updatedCell.setAttribute('title', ts.toLocaleString());
        } else {
          updatedCell.textContent = '—';
        }
      } else {
        updatedCell.textContent = '—';
      }
      tr.appendChild(updatedCell);

      tbody.appendChild(tr);
    });
  }
  scroll.appendChild(table);
  wrapper.appendChild(scroll);
  return wrapper;
}

async function renderHomeView() {
  setHomeHeroVisible(true);
  const root = $('#viewRoot');
  if (!root) return;
  const extras = document.querySelector('#leftStackExtras');
  if (extras) extras.innerHTML = '';
  root.innerHTML = '<div class="card text-center py-6 text-muted">Loading leaderboard…</div>';
  try {
    const leaderboard = await loadLeaderboard();
    renderHeroSnapshot(leaderboard);
    const players = Array.isArray(leaderboard?.players) ? leaderboard.players : [];
    root.innerHTML = '';
    const container = el('div', 'flex flex-col gap-6');

    const headerCard = el('section', 'card flex flex-col gap-4');
    const headerRow = el('div', 'flex-between flex-wrap gap-3');
    headerRow.appendChild(el('h2', 'text-2xl font-bold text-foreground', [text('Overall Leaderboard')]));
    const generatedAt = Number(leaderboard?.generatedAt);
    headerRow.appendChild(el('div', 'home-widget-meta', [
      text(generatedAt ? `Updated ${formatRelativeTime(generatedAt)}` : 'Live snapshot')
    ]));
    headerCard.appendChild(headerRow);

    const statsGrid = el('div', 'grid grid-cols-2 md:grid-cols-4 gap-4 text-sm');
    const totalPlayers = Number(leaderboard?.totalPlayers) || players.length || 0;
    statsGrid.appendChild(buildStatBlock('Total players', totalPlayers.toLocaleString(),
      createDeltaSpan(leaderboard?.trendSummary?.totalPlayersChange24h, 0, { compact: true })));
    const visible = Number(leaderboard?.returned) || players.length;
    statsGrid.appendChild(buildStatBlock('Visible rows', visible.toLocaleString()));
    const avgLevel = leaderboard?.trendSummary?.avgTotalLevel?.current;
    statsGrid.appendChild(buildStatBlock('Avg total level', Number.isFinite(avgLevel) ? avgLevel.toFixed(1) : '—',
      createDeltaSpan(leaderboard?.trendSummary?.avgTotalLevel?.change, 1)));
    const avgXp = leaderboard?.trendSummary?.avgTotalXP?.current;
    statsGrid.appendChild(buildStatBlock('Avg total XP', Number.isFinite(avgXp) ? formatCompactNumber(avgXp) : '—',
      createDeltaSpan(leaderboard?.trendSummary?.avgTotalXP?.change, 0, { compact: true })));
    headerCard.appendChild(statsGrid);
    container.appendChild(headerCard);

    const widgets = el('div', 'home-widgets-grid');
    widgets.appendChild(buildOnTheRiseCard(leaderboard.onTheRise));
    widgets.appendChild(buildTrendSummaryCard(leaderboard.trendSummary));
    widgets.appendChild(buildWeeklyRarestCard(leaderboard.weeklyRarest));
    widgets.appendChild(buildWatchlistCard(leaderboard.watchlist));
    container.appendChild(widgets);

    container.appendChild(buildLeaderboardTable(players));
    root.appendChild(container);
  } catch (err) {
    console.error('Failed to render home view', err);
    const message = err?.message || 'Check the console for more details.';
    root.innerHTML = `<div class="card text-center py-6"><div class="text-danger text-lg font-semibold">Failed to load leaderboard</div><div class="text-muted mt-2">${message}</div></div>`;
    renderHeroSnapshot(null);
  }
  if (!rareBannerInitialized) {
    initRareBannerRotator();
    rareBannerInitialized = true;
  }
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
async function loadLeaderboard(force = false) {
  if (cache.leaderboard && !force) return cache.leaderboard;
  cache.leaderboard = await fetchJSON(`/api/leaderboard?limit=${LEADERBOARD_LIMIT}`);
  return cache.leaderboard;
}
async function loadUsers(force = !1) {
  return cache.users && !force && Date.now() - cache.usersFetchedAt < 60_000 || (cache.users = await fetchJSON("/api/users"), cache.usersFetchedAt = Date.now()), cache.users;
}
async function loadSkillRankings(force = !1) {
  return cache.skillRankings && !force || (cache.skillRankings = await fetchJSON("/api/skill-rankings")), cache.skillRankings;
}
function getUserSkillRank(skillRankings, username, skill) {
  if (!skillRankings || !skillRankings.rankings || !skillRankings.rankings[skill]) return null;
  const playerData = skillRankings.rankings[skill].find((p) => p.username === username);
  return playerData ? playerData.rank : null;
}
function updateSummary(user, skillRankings) {
  const rankEl = $("#topRankSummary span"), levelEl = $("#topLevelSummary span");
  if (!rankEl || !levelEl) return;
  if (!user) {
    rankEl.textContent = "Highest rank: —";
    levelEl.textContent = "Highest level: —";
    return;
  }
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
    const name = bestRankSkill.charAt(0).toUpperCase() + bestRankSkill.slice(1);
    rankEl.textContent = `Highest rank: ${name} (#${bestRank})`;
  } else {
    rankEl.textContent = "Highest rank: —";
  }
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
    const name = bestLevelSkill.charAt(0).toUpperCase() + bestLevelSkill.slice(1);
    levelEl.textContent = `Highest level: ${name} (Lv. ${bestLevel}, ${bestXp.toLocaleString()} XP)`;
  } else {
    levelEl.textContent = "Highest level: —";
  }
}

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

async function loadUser(username) {
  return fetchJSON("/api/users/" + encodeURIComponent(username));
}
function renderUserView(username) {
  setHomeHeroVisible(false);
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
    const averages = computeSkillAverages(skillRankings);
    // Use shared catalog from common.js
    const ACHIEVEMENT_CATALOG = window.ACHIEVEMENT_CATALOG || [
      {
        key: 'tier-grandmaster',
        icon: '👑',
        label: 'Grandmaster: rank #1 or #1 in 3+ skills',
        desc: 'Rank #1 overall or #1 in 3+ skills.',
        category: 'tier',
        rarity: 'mythic'
      },
      {
        key: 'tier-master',
        icon: '🏆',
        label: 'Master: top 0.01% overall',
        desc: 'Be in the top 0.01% overall.',
        category: 'tier',
        rarity: 'legendary'
      },
      {
        key: 'tier-diamond',
        icon: '💎',
        label: 'Diamond: top 0.1% overall',
        desc: 'Be in the top 0.1% overall.',
        category: 'tier',
        rarity: 'epic'
      },
      {
        key: 'triple-crown',
        icon: '👑',
        label: 'Three #1 Skill Ranks',
        desc: 'Hold #1 rank in 3 or more skills at once.',
        category: 'rank',
        rarity: 'legendary'
      },
      {
        key: 'crowned-any',
        icon: '🥇',
        label: '#1 Rank (Any Skill)',
        desc: 'Achieve #1 rank in any single skill.',
        category: 'rank',
        rarity: 'rare'
      },
      {
        key: 'top-10-any',
        icon: '🎯',
        label: 'Top 10 (Any Skill)',
        desc: 'Reach top 10 in any skill.',
        category: 'rank',
        rarity: 'rare'
      },
      {
        key: 'top-100-any',
        icon: '⭐',
        label: 'Top 100 (Any Skill)',
        desc: 'Reach top 100 in any skill.',
        category: 'rank',
        rarity: 'common'
      },
      {
        key: 'total-2000',
        icon: '📈',
        label: 'Total Level 2000+',
        desc: 'Reach total level 2000 or higher.',
        category: 'account',
        rarity: 'epic'
      },
      {
        key: 'total-1500',
        icon: '📊',
        label: 'Total Level 1500+',
        desc: 'Reach total level 1500 or higher.',
        category: 'account',
        rarity: 'rare'
      },
      {
        key: 'maxed-account',
        icon: '👑',
        label: 'All Skills 99',
        desc: 'Reach level 99 in every skill.',
        category: 'account',
        rarity: 'mythic'
      },
      {
        key: 'seven-99s',
        icon: '💫',
        label: 'Seven 99s',
        desc: 'Reach level 99 in seven or more skills.',
        category: 'account',
        rarity: 'rare'
      },
      {
        key: 'five-99s',
        icon: '✨',
        label: 'Five 99s',
        desc: 'Reach level 99 in five or more skills.',
        category: 'account',
        rarity: 'common'
      },
      {
        key: 'combat-maxed',
        icon: '⚔️',
        label: 'All Combat Skills 99',
        desc: 'Attack, Strength, Defence, Hitpoints, Ranged, Magic, Prayer at 99.',
        category: 'account',
        rarity: 'epic'
      },
      {
        key: 'skill-master-attack',
        icon: '🗡️',
        label: '99 Attack',
        desc: 'Reach level 99 in Attack.',
        category: 'skill-mastery',
        rarity: 'rare'
      },
      {
        key: 'skill-master-strength',
        icon: '💪',
        label: '99 Strength',
        desc: 'Reach level 99 in Strength.',
        category: 'skill-mastery',
        rarity: 'rare'
      },
      {
        key: 'skill-master-defence',
        icon: '🛡️',
        label: '99 Defence',
        desc: 'Reach level 99 in Defence.',
        category: 'skill-mastery',
        rarity: 'rare'
      },
      {
        key: 'skill-master-hitpoints',
        icon: '❤️',
        label: '99 Hitpoints',
        desc: 'Reach level 99 in Hitpoints.',
        category: 'skill-mastery',
        rarity: 'rare'
      },
      {
        key: 'skill-master-ranged',
        icon: '🏹',
        label: '99 Ranged',
        desc: 'Reach level 99 in Ranged.',
        category: 'skill-mastery',
        rarity: 'rare'
      },
      {
        key: 'skill-master-magic',
        icon: '🔮',
        label: '99 Magic',
        desc: 'Reach level 99 in Magic.',
        category: 'skill-mastery',
        rarity: 'rare'
      },
      {
        key: 'skill-master-prayer',
        icon: '🙏',
        label: '99 Prayer',
        desc: 'Reach level 99 in Prayer.',
        category: 'skill-mastery',
        rarity: 'rare'
      },
      {
        key: 'gathering-elite',
        icon: '🪓',
        label: '90+ Woodcutting, Fishing, Mining',
        desc: 'Woodcutting, Fishing, and Mining at level 90+.',
        category: 'gathering',
        rarity: 'epic'
      },
      {
        key: 'woodcutting-expert',
        icon: '🌳',
        label: '85+ Woodcutting',
        desc: 'Reach level 85+ in Woodcutting.',
        category: 'gathering',
        rarity: 'common'
      },
      {
        key: 'fishing-expert',
        icon: '🎣',
        label: '85+ Fishing',
        desc: 'Reach level 85+ in Fishing.',
        category: 'gathering',
        rarity: 'common'
      },
      {
        key: 'mining-expert',
        icon: '⛏️',
        label: '85+ Mining',
        desc: 'Reach level 85+ in Mining.',
        category: 'gathering',
        rarity: 'common'
      },
      {
        key: 'artisan-elite',
        icon: '🔨',
        label: '90+ Smithing, Crafting, Fletching',
        desc: 'Smithing, Crafting, and Fletching at level 90+.',
        category: 'artisan',
        rarity: 'epic'
      },
      {
        key: 'cooking-expert',
        icon: '👨‍🍳',
        label: '85+ Cooking',
        desc: 'Reach level 85+ in Cooking.',
        category: 'artisan',
        rarity: 'common'
      },
      {
        key: 'firemaking-expert',
        icon: '🔥',
        label: '85+ Firemaking',
        desc: 'Reach level 85+ in Firemaking.',
        category: 'artisan',
        rarity: 'common'
      },
      {
        key: 'smithing-expert',
        icon: '⚒️',
        label: '85+ Smithing',
        desc: 'Reach level 85+ in Smithing.',
        category: 'artisan',
        rarity: 'common'
      },
      {
        key: 'support-elite',
        icon: '🧪',
        label: '90+ Herblore, Runecraft, Slayer',
        desc: 'Herblore, Runecraft, and Slayer at level 90+.',
        category: 'support',
        rarity: 'epic'
      },
      {
        key: 'herblore-expert',
        icon: '🌿',
        label: '85+ Herblore',
        desc: 'Reach level 85+ in Herblore.',
        category: 'support',
        rarity: 'common'
      },
      {
        key: 'agility-expert',
        icon: '🏃',
        label: '85+ Agility',
        desc: 'Reach level 85+ in Agility.',
        category: 'support',
        rarity: 'common'
      },
      {
        key: 'thieving-expert',
        icon: '🕵️',
        label: '85+ Thieving',
        desc: 'Reach level 85+ in Thieving.',
        category: 'support',
        rarity: 'common'
      },
      {
        key: 'balanced',
        icon: '⚖️',
        label: 'Balanced Levels',
        desc: 'All skills ≥40 with spread ≤30 levels.',
        category: 'playstyle',
        rarity: 'rare'
      },
      {
        key: 'glass-cannon',
        icon: '💥',
        label: 'High Offense, Low Defence',
        desc: 'Atk+Str ≥180 and Defence ≤60.',
        category: 'playstyle',
        rarity: 'epic'
      },
      {
        key: 'tank',
        icon: '🛡️',
        label: 'High Defence and Hitpoints',
        desc: 'Defence ≥90 and Hitpoints ≥85.',
        category: 'playstyle',
        rarity: 'rare'
      },
      {
        key: 'skiller',
        icon: '🎯',
        label: 'Non-Combat Focused',
        desc: 'Non-combat skills avg ≥70; combat skills avg ≤50.',
        category: 'playstyle',
        rarity: 'epic'
      },
      {
        key: 'combat-pure',
        icon: '⚔️',
        label: 'Combat Focused',
        desc: 'Combat skills avg ≥80; non-combat skills avg ≤30.',
        category: 'playstyle',
        rarity: 'rare'
      },
      {
        key: 'elite',
        icon: '🚀',
        label: 'Above Avg in 90%+ Skills',
        desc: 'Be above the population average in ≥90% of skills.',
        category: 'performance',
        rarity: 'legendary'
      },
      {
        key: 'versatile',
        icon: '🎭',
        label: 'Above Avg in 75%+ Skills',
        desc: 'Be above the population average in ≥75% of skills.',
        category: 'performance',
        rarity: 'epic'
      },
      {
        key: 'consistent',
        icon: '📊',
        label: 'Above Avg in 50%+ Skills',
        desc: 'Be above the population average in ≥50% of skills.',
        category: 'performance',
        rarity: 'rare'
      },
      {
        key: 'xp-millionaire',
        icon: '💰',
        label: '1,000,000+ Total XP',
        desc: 'Accumulate 1,000,000 or more total XP.',
        category: 'performance',
        rarity: 'epic'
      },
      {
        key: 'xp-billionaire',
        icon: '🏦',
        label: '1,000,000,000+ Total XP',
        desc: 'Accumulate 1,000,000,000 or more total XP.',
        category: 'performance',
        rarity: 'legendary'
      },
      {
        key: 'daily-grinder',
        icon: '🕒',
        label: 'Updated in Last 24h',
        desc: 'Profile updated within the last 24 hours.',
        category: 'activity',
        rarity: 'common'
      },
      {
        key: 'weekly-active',
        icon: '📅',
        label: 'Updated in Last 7d',
        desc: 'Profile updated within the last 7 days.',
        category: 'activity',
        rarity: 'common'
      },
      {
        key: 'monthly-active',
        icon: '🗓️',
        label: 'Updated in Last 30d',
        desc: 'Profile updated within the last 30 days.',
        category: 'activity',
        rarity: 'common'
      },
      {
        key: 'dedicated',
        icon: '🔥',
        label: 'Updated in Last 3d',
        desc: 'Profile updated within the last 3 days.',
        category: 'activity',
        rarity: 'common'
      },
      {
        key: 'level-50-average',
        icon: '🎯',
        label: 'Average Level 50+',
        desc: 'Average level of 50+ across all skills.',
        category: 'milestone',
        rarity: 'common'
      },
      {
        key: 'level-75-average',
        icon: '⭐',
        label: 'Average Level 75+',
        desc: 'Average level of 75+ across all skills.',
        category: 'milestone',
        rarity: 'rare'
      },
      {
        key: 'level-90-average',
        icon: '👑',
        label: 'Average Level 90+',
        desc: 'Average level of 90+ across all skills.',
        category: 'milestone',
        rarity: 'epic'
      },
      {
        key: 'magic-ranged',
        icon: '🧙‍♂️',
        label: '80+ Magic and Ranged',
        desc: 'Both Magic and Ranged at level 80+.',
        category: 'special',
        rarity: 'rare'
      },
      {
        key: 'melee-specialist',
        icon: '⚔️',
        label: '85+ Atk, Str, Def',
        desc: 'Attack, Strength, and Defence all at 85+.',
        category: 'special',
        rarity: 'rare'
      },
      {
        key: 'support-master',
        icon: '🛠️',
        label: '80+ Prayer, Herblore, Runecraft',
        desc: 'Prayer, Herblore, and Runecraft all at 80+.',
        category: 'special',
        rarity: 'rare'
      },
      {
        key: 'gathering-master',
        icon: '📦',
        label: '80+ WC, Fishing, Mining',
        desc: 'Woodcutting, Fishing, and Mining all at 80+.',
        category: 'special',
        rarity: 'rare'
      }
    ];
    function deriveUserAchievements(user, averages) {
      let now = Date.now(), results = [], push = (key) => results.push({
        key
      });
      if (leaderboard && leaderboard.players) {
        let me = leaderboard.players.find((p) => p.username === user.username);
        me?.tier === 'Grandmaster' && push('tier-grandmaster'), me?.tier === 'Master' && push('tier-master'), me?.tier === 'Diamond' && push('tier-diamond');
        me?.rank === 1 && push('overall-rank-1');
        let top1Count = me?.tierInfo?.top1Skills ?? 0;
        top1Count || SKILLS.forEach((s) => {
          let r = void 0;
          1 === getUserSkillRank(skillRankings, user.username, s) && top1Count++;
        }), top1Count >= 3 && push('triple-crown'), top1Count >= 1 && push('crowned-any');
      }
      let levels = SKILLS.map((s) => user.skills[s]?.level || 1), total = levels.reduce((a, b) => a + b, 0);
      total >= 2277 ? push('total-2277') : total >= 2200 ? push('total-2200') : total >= 2000 ? push('total-2000') : total >= 1500 && push('total-1500');
      let count99 = levels.filter((l) => l >= 99).length;
      levels.every((l) => l >= 99) && push('maxed-account'), count99 >= 7 && push('seven-99s'), count99 >= 5 && push('five-99s');
      let combatMaxed = void 0;
      [
        'attack',
        'strength',
        'defence',
        'hitpoints',
        'ranged',
        'magic',
        'prayer'
      ].every((skill) => (user.skills[skill]?.level || 1) >= 99) && push('combat-maxed'), Object.entries({
        'skill-master-attack': 'attack',
        'skill-master-strength': 'strength',
        'skill-master-defence': 'defence',
        'skill-master-hitpoints': 'hitpoints',
        'skill-master-ranged': 'ranged',
        'skill-master-magic': 'magic',
        'skill-master-prayer': 'prayer'
      }).forEach(([achievement, skill]) => {
        (user.skills[skill]?.level || 1) >= 99 && push(achievement);
      });
      let woodcutting = user.skills.woodcutting?.level || 1, fishing = user.skills.fishing?.level || 1, mining = user.skills.mining?.level || 1;
      woodcutting >= 90 && fishing >= 90 && mining >= 90 && push('gathering-elite'), woodcutting >= 85 && push('woodcutting-expert'), fishing >= 85 && push('fishing-expert'), mining >= 85 && push('mining-expert');
      let smithing = user.skills.smithing?.level || 1, crafting = user.skills.crafting?.level || 1, fletching = user.skills.fletching?.level || 1, cooking = user.skills.cooking?.level || 1, firemaking = user.skills.firemaking?.level || 1;
      smithing >= 90 && crafting >= 90 && fletching >= 90 && push('artisan-elite'), cooking >= 85 && push('cooking-expert'), firemaking >= 85 && push('firemaking-expert'), smithing >= 85 && push('smithing-expert');
      let herblore = user.skills.herblore?.level || 1, runecraft = user.skills.runecraft?.level || 1, slayer = user.skills.slayer?.level || 1, agility = user.skills.agility?.level || 1, thieving = user.skills.thieving?.level || 1;
      herblore >= 90 && runecraft >= 90 && slayer >= 90 && push('support-elite'), herblore >= 85 && push('herblore-expert'), agility >= 85 && push('agility-expert'), thieving >= 85 && push('thieving-expert');
      let minL = Math.min(...levels), maxL = Math.max(...levels);
      minL >= 40 && maxL - minL <= 30 && push('balanced');
      let atk = user.skills.attack?.level || 1, str = user.skills.strength?.level || 1, def = user.skills.defence?.level || 1;
      atk + str >= 180 && def <= 60 && push('glass-cannon');
      let hp = user.skills.hitpoints?.level || 1;
      def >= 90 && hp >= 85 && push('tank');
      let combatLevels = [
        'attack',
        'strength',
        'defence',
        'hitpoints',
        'ranged',
        'magic',
        'prayer'
      ].map((s) => user.skills[s]?.level || 1), nonCombatLevels = SKILLS.filter((s) => ![
        'attack',
        'strength',
        'defence',
        'hitpoints',
        'ranged',
        'magic',
        'prayer'
      ].includes(s)).map((s) => user.skills[s]?.level || 1), avgCombat = combatLevels.reduce((a, b) => a + b, 0) / combatLevels.length, avgNonCombat = nonCombatLevels.reduce((a, b) => a + b, 0) / nonCombatLevels.length;
      avgNonCombat >= 70 && avgCombat <= 50 && push('skiller'), avgCombat >= 80 && avgNonCombat <= 30 && push('combat-pure');
      let aboveAvg = void 0, ratio = SKILLS.filter((s) => (user.skills[s]?.level || 1) > (averages[s]?.level || 1)).length / SKILLS.length;
      ratio >= 0.90 ? push('elite') : ratio >= 0.75 ? push('versatile') : ratio >= 0.50 && push('consistent');
      let totalXP = SKILLS.reduce((sum, s) => sum + (user.skills[s]?.xp || 0), 0);
      if (totalXP >= 1000000000) push('xp-billionaire');
      if (totalXP >= 200000000) push('totalxp-200m');
      if (totalXP >= 100000000) push('totalxp-100m');
      if (totalXP >= 50000000) push('totalxp-50m');
      if (totalXP >= 10000000) push('totalxp-10m');
      let avgLevel = total / SKILLS.length;
      avgLevel >= 90 ? push('level-90-average') : avgLevel >= 75 ? push('level-75-average') : avgLevel >= 50 && push('level-50-average');
      let ranged = user.skills.ranged?.level || 1, magic = void 0;
      (user.skills.magic?.level || 1) >= 80 && ranged >= 80 && push('magic-ranged'), atk >= 85 && str >= 85 && def >= 85 && push('melee-specialist');
      let prayer = void 0;
      (user.skills.prayer?.level || 1) >= 80 && herblore >= 80 && runecraft >= 80 && push('support-master'), woodcutting >= 80 && fishing >= 80 && mining >= 80 && push('gathering-master');
      // Approx combat level milestones
      try {
        const pray = user.skills.prayer?.level || 1;
        const base = 0.25 * (def + hitpoints + Math.floor(pray / 2));
        const melee = 0.325 * (attack + strength);
        const ranger = 0.325 * Math.floor(1.5 * ranged);
        const mager = 0.325 * Math.floor(1.5 * (user.skills.magic?.level || 1));
        const cl = Math.floor(base + Math.max(melee, ranger, mager));
        if (cl >= 100) push('combat-level-100');
        if (cl >= 110) push('combat-level-110');
        if (cl >= 120) push('combat-level-120');
        if (cl >= 126) push('combat-level-126');
      } catch (_) { }
      // 200m per-skill display hint
      SKILLS.forEach((s) => { if ((user.skills[s]?.xp || 0) >= 200_000_000) push(`skill-200m-${s}`); });
      let uniq = void 0;
      return [
        ...new Set(results.map((r) => r.key))
      ];
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
      let userAchievementKeys = void 0, unlockedSet = new Set(deriveUserAchievements(user, globalStats.averages));
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
        let userAchievementKeys = deriveUserAchievements(user, averages);
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
      nameCell.className = "text-left", nameCell.innerHTML = `${iconUrl ? `<img src="${iconUrl}" class="skill-icon skill-icon--sm" alt="${skillName}">` : ""}<span class="skill-name text-capitalize">${skillName}</span>`;
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
  let CATALOG = {
    'tier-grandmaster': {
      key: 'tier-grandmaster',
      icon: '👑',
      label: 'Grandmaster',
      desc: 'Rank #1 overall or #1 in 3+ skills.',
      rarity: 'mythic'
    },
    'tier-master': {
      key: 'tier-master',
      icon: '🏆',
      label: 'Master',
      desc: 'Top 0.01% overall.',
      rarity: 'legendary'
    },
    'tier-diamond': {
      key: 'tier-diamond',
      icon: '💎',
      label: 'Diamond',
      desc: 'Top 0.1% overall.',
      rarity: 'epic'
    },
    'triple-crown': {
      key: 'triple-crown',
      icon: '👑',
      label: 'Triple Crown',
      desc: '#1 in 3+ skills.',
      rarity: 'legendary'
    },
    'crowned-any': {
      key: 'crowned-any',
      icon: '🥇',
      label: '#1 in a Skill',
      desc: '#1 rank in any skill.',
      rarity: 'rare'
    },
    'maxed-account': {
      key: 'maxed-account',
      icon: '👑',
      label: 'Maxed',
      desc: 'All skills 99.',
      rarity: 'mythic'
    },
    'total-2000': {
      key: 'total-2000',
      icon: '📈',
      label: 'Total 2000+',
      desc: 'Total level 2000 or higher.',
      rarity: 'epic'
    },
    'total-1500': {
      key: 'total-1500',
      icon: '📊',
      label: 'Total 1500+',
      desc: 'Total level 1500 or higher.',
      rarity: 'rare'
    },
    'daily-grinder': {
      key: 'daily-grinder',
      icon: '🕒',
      label: 'Updated 24h',
      desc: 'Updated within last 24 hours.',
      rarity: 'common'
    },
    dedicated: {
      key: 'dedicated',
      icon: '🔥',
      label: 'Updated 3d',
      desc: 'Updated within last 3 days.',
      rarity: 'common'
    },
    'weekly-active': {
      key: 'weekly-active',
      icon: '📅',
      label: 'Updated 7d',
      desc: 'Updated within last 7 days.',
      rarity: 'common'
    },
    'monthly-active': {
      key: 'monthly-active',
      icon: '🗓️',
      label: 'Updated 30d',
      desc: 'Updated within last 30 days.',
      rarity: 'common'
    }
  }, achievements = [], push = (key) => {
    let a = CATALOG[key];
    a && achievements.push(a);
  };
  'Grandmaster' === player.tier && push('tier-grandmaster'), 'Master' === player.tier && push('tier-master'), 'Diamond' === player.tier && push('tier-diamond');
  let top1Count = 0;
  if (rankings) {
    let map = void 0;
    top1Count = buildTop1Counts(rankings).get(player.username) || 0;
  }
  if (top1Count >= 3 && push('triple-crown'), top1Count >= 1 && push('crowned-any'), player.totalLevel >= 2277 && push('maxed-account'), player.totalLevel >= 2000 ? push('total-2000') : player.totalLevel >= 1500 && push('total-1500'), player.updatedAt) {
    let diffH = (Date.now() - player.updatedAt) / 3600000;
    diffH <= 24 ? push('daily-grinder') : diffH <= 72 ? push('dedicated') : diffH <= 168 ? push('weekly-active') : diffH <= 720 && push('monthly-active');
  }
  return achievements.sort((a, b) => RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity]);
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
