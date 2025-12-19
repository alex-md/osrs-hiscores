import { initCommonUi } from '../bootstrap.js';
import { fetchJson } from '../core/api.js';
import { $, createElement as el, createText as text, showToast } from '../core/dom.js';
import { formatRelativeTime, formatSigned, formatCompactNumber, friendlyAchievementLabel } from '../core/formatters.js';
import { ACHIEVEMENT_CATALOG } from '../constants/achievements.js';
import { SKILLS, getSkillIcon } from '../constants/skills.js';
import { applyTickerMotion } from '../core/ticker.js';

const cache = {
    leaderboard: null,
    users: null,
    skillRankings: null,
    usersFetchedAt: 0
};
function createUsernameLink(username) {
    let btn = document.createElement('button');
    return btn.type = 'button', btn.className = 'username-link', btn.setAttribute('data-user', username), btn.textContent = username, btn;
}
function createTierBadge(player) {
    let tier = player?.tier;
    if (!tier) return null;
    let badge = document.createElement('span');
    badge.className = `tier-badge tier--mini tier-${tier.toLowerCase()}`, badge.textContent = tier;
    let details = [];
    Number.isFinite(player?.rank) && details.push(`Overall #${player.rank}`);
    let top1 = Number(player?.tierInfo?.top1Skills || 0);
    return top1 > 0 && details.push(`#1 in ${top1} skill${1 === top1 ? '' : 's'}`), details.length && badge.setAttribute('data-tooltip', details.join(' • ')), badge;
}
function createDeltaSpan(value, digits = 0, { compact = !1 } = {}) {
    if (!Number.isFinite(value) || 0 === value) return null;
    let span = document.createElement('span');
    return span.className = `trend-delta ${value > 0 ? 'positive' : 'negative'}`, span.textContent = compact ? formatCompactNumber(value) : formatSigned(value, digits), span;
}
function describeWatchlistSource(entry) {
    return entry ? 'rare-achievement' === entry.source ? 'Rare unlock' : 'rank-climb' === entry.source ? 'Rank surge' : 'top-tier' === entry.source ? entry.fallback ? 'Top tier (fallback)' : 'Top tier' : 'Auto pick' : '';
}
let rareBannerInitialized = !1;
function buildStatBlock(label, value, deltaEl = null) {
    let block = el('div', 'flex flex-col gap-1');
    block.appendChild(el('span', 'text-xs uppercase tracking-wide text-muted', [
        text(label)
    ]));
    let row = el('div', 'flex-items-center gap-2 text-lg font-semibold');
    return row.appendChild(text('string' == typeof value ? value : String(value))), deltaEl && row.appendChild(deltaEl), block.appendChild(row), block;
}
function setHomeHeroVisible(show) {
    let hero = $('#homeHero');
    hero && (show ? (hero.classList.remove('is-hidden'), hero.removeAttribute('aria-hidden')) : (hero.classList.add('is-hidden'), hero.setAttribute('aria-hidden', 'true')));
}
function renderHeroSnapshot(leaderboard) {
    let hero = $('#homeHero');
    if (!hero) return;
    hero.classList.remove('is-hidden'), hero.removeAttribute('aria-hidden');
    let players = Array.isArray(leaderboard?.players) ? leaderboard.players : [], totalPlayers = Number(leaderboard?.totalPlayers) || players.length || 0, trend = leaderboard?.trendSummary || {}, generatedAt = Number(leaderboard?.generatedAt) || null, totalEl = $('#heroTotalPlayers');
    totalEl && (totalEl.textContent = totalPlayers ? totalPlayers.toLocaleString() : '—');
    let totalDeltaWrap = $('#heroTotalPlayersDelta');
    if (totalDeltaWrap) {
        totalDeltaWrap.innerHTML = '';
        let delta = createDeltaSpan(trend.totalPlayersChange24h, 0, {
            compact: !0
        });
        delta && totalDeltaWrap.appendChild(delta);
    }
    let avgLevel = Number(trend?.avgTotalLevel?.current), avgLevelEl = $('#heroAvgLevel');
    avgLevelEl && (avgLevelEl.textContent = Number.isFinite(avgLevel) ? avgLevel.toFixed(1) : '—');
    let avgLevelDeltaWrap = $('#heroAvgLevelDelta');
    if (avgLevelDeltaWrap) {
        avgLevelDeltaWrap.innerHTML = '';
        let delta = createDeltaSpan(trend?.avgTotalLevel?.change, 1);
        delta && avgLevelDeltaWrap.appendChild(delta);
    }
    let avgXp = Number(trend?.avgTotalXP?.current), avgXpEl = $('#heroAvgXp');
    avgXpEl && (avgXpEl.textContent = Number.isFinite(avgXp) ? formatCompactNumber(avgXp) : '—');
    let avgXpDeltaWrap = $('#heroAvgXpDelta');
    if (avgXpDeltaWrap) {
        avgXpDeltaWrap.innerHTML = '';
        let delta = createDeltaSpan(trend?.avgTotalXP?.change, 0, {
            compact: !0
        });
        delta && avgXpDeltaWrap.appendChild(delta);
    }
    let lastUpdated = $('#heroLastUpdated');
    lastUpdated && (generatedAt ? (lastUpdated.textContent = formatRelativeTime(generatedAt), lastUpdated.setAttribute('title', new Date(generatedAt).toLocaleString())) : (lastUpdated.textContent = 'Live snapshot', lastUpdated.removeAttribute('title')));
    let updateChip = $('#heroUpdateChip');
    updateChip && (updateChip.textContent = generatedAt ? `Updated ${formatRelativeTime(generatedAt)}` : 'Live snapshot');
    let podium = $('#heroPodium');
    podium && (podium.innerHTML = '', players.length ? players.slice(0, 3).forEach((player, index)=>{
        podium.appendChild(function(player, index) {
            let rank = Number(player?.rank) || index + 1, li = el('li', `hero-podium-slot hero-podium-slot--${index + 1}`);
            li.appendChild(el('span', 'hero-podium-rank', [
                text(`#${rank}`)
            ]));
            let nameRow = el('div', 'hero-podium-name');
            nameRow.appendChild(createUsernameLink(player?.username || 'Unknown'));
            let badge = createTierBadge(player);
            badge && nameRow.appendChild(badge), li.appendChild(nameRow);
            let level = Number(player?.totalLevel), xp = Number(player?.totalXP);
            Number.isFinite(level) && li.appendChild(el('div', 'hero-podium-meta', [
                text(`Total level ${level.toLocaleString()}`)
            ])), Number.isFinite(xp) && li.appendChild(el('div', 'hero-podium-meta', [
                text(`${formatCompactNumber(xp)} XP`)
            ]));
            let metaParts = [], top1 = Number(player?.tierInfo?.top1Skills || 0);
            if (top1 > 0 && metaParts.push(`#1 in ${top1} skill${1 === top1 ? '' : 's'}`), player?.archetype && metaParts.push(player.archetype.replace(/-/g, ' ')), player?.updatedAt) {
                let ts = new Date(player.updatedAt);
                Number.isNaN(ts.getTime()) || metaParts.push(`Updated ${formatRelativeTime(ts.getTime())}`);
            }
            return metaParts.length && li.appendChild(el('div', 'hero-podium-meta', [
                text(metaParts.join(' • '))
            ])), li;
        }(player, index));
    }) : podium.appendChild(el('li', 'hero-podium-empty', [
        text('Leaderboard warming up…')
    ])));
    let momentum = Array.isArray(leaderboard?.onTheRise?.players) ? leaderboard.onTheRise.players : [], spotlightWrap = $('#heroSpotlight'), spotlightName = $('#heroSpotlightName'), spotlightMeta = $('#heroSpotlightMeta');
    if (spotlightWrap && spotlightName && spotlightMeta) {
        let focus = momentum.find(Boolean);
        if (focus) {
            spotlightName.textContent = focus.username || 'Unknown contender';
            let details = [], delta = Number(focus.delta);
            Number.isFinite(delta) && 0 !== delta && details.push(`${formatSigned(delta)} ranks`), Number.isFinite(focus.currentRank) && details.push(`Now #${focus.currentRank}`), Number.isFinite(focus.totalLevel) && details.push(`Lv ${focus.totalLevel.toLocaleString()}`), Number.isFinite(focus.totalXP) && details.push(`${formatCompactNumber(focus.totalXP)} XP`), spotlightMeta.textContent = details.length ? details.join(' • ') : 'Surging through the standings right now.', spotlightWrap.classList.add('is-active');
        } else spotlightName.textContent = 'Awaiting challenger…', spotlightMeta.textContent = 'Stay tuned for the next dramatic climb.', spotlightWrap.classList.remove('is-active');
    }
    let tickerWrap = $('#heroTicker');
    if (tickerWrap) {
        tickerWrap.innerHTML = '';
        let track = function(onTheRise) {
            let track = el('div', 'ticker-track'), entries = Array.isArray(onTheRise?.players) ? onTheRise.players.slice(0, 4) : [];
            if (!entries.length) return track.appendChild(el('span', 'ticker-item', [
                text('Waiting for the next surge…')
            ])), track;
            let items = entries.map((player)=>{
                let item = el('span', 'ticker-item');
                item.appendChild(createUsernameLink(player?.username || 'Unknown'));
                let delta = Number(player?.delta), metaParts = [];
                return Number.isFinite(delta) && 0 !== delta && metaParts.push(formatSigned(delta)), Number.isFinite(player?.currentRank) && metaParts.push(`#${player.currentRank}`), Number.isFinite(player?.totalLevel) && metaParts.push(`${player.totalLevel.toLocaleString()} total`), Number.isFinite(player?.totalXP) && metaParts.push(`${formatCompactNumber(player.totalXP)} XP`), metaParts.length && item.appendChild(el('span', 'ticker-meta', [
                    text(metaParts.join(' • '))
                ])), item;
            });
            return items.forEach((node)=>track.appendChild(node)), items.length > 1 && items.forEach((node)=>{
                let clone = node.cloneNode(!0);
                clone.dataset.duplicate = 'true', track.appendChild(clone);
            }), track;
        }(leaderboard?.onTheRise || {});
        tickerWrap.appendChild(track), applyTickerMotion(tickerWrap, track);
    }
}
async function renderHomeView() {
    setHomeHeroVisible(!0);
    let root = $('#viewRoot');
    if (!root) return;
    let extras = document.querySelector('#leftStackExtras');
    extras && (extras.innerHTML = ''), root.innerHTML = '<div class="card text-center py-6 text-muted">Loading leaderboard…</div>';
    try {
        var onTheRise;
        let card, header, hours, body, list, entries, leaderboard = await loadLeaderboard();
        renderHeroSnapshot(leaderboard);
        let players = Array.isArray(leaderboard?.players) ? leaderboard.players : [];
        root.innerHTML = '';
        let container = el('div', 'flex flex-col gap-6'), headerCard = el('section', 'card flex flex-col gap-4'), headerRow = el('div', 'flex-between flex-wrap gap-3');
        headerRow.appendChild(el('h2', 'text-2xl font-bold text-foreground', [
            text('Overall Leaderboard')
        ]));
        let generatedAt = Number(leaderboard?.generatedAt);
        headerRow.appendChild(el('div', 'home-widget-meta', [
            text(generatedAt ? `Updated ${formatRelativeTime(generatedAt)}` : 'Live snapshot')
        ])), headerCard.appendChild(headerRow);
        let statsGrid = el('div', 'grid grid-cols-2 md:grid-cols-4 gap-4 text-sm'), totalPlayers = Number(leaderboard?.totalPlayers) || players.length || 0;
        statsGrid.appendChild(buildStatBlock('Total players', totalPlayers.toLocaleString(), createDeltaSpan(leaderboard?.trendSummary?.totalPlayersChange24h, 0, {
            compact: !0
        })));
        let visible = Number(leaderboard?.returned) || players.length;
        statsGrid.appendChild(buildStatBlock('Visible rows', visible.toLocaleString()));
        let avgLevel = leaderboard?.trendSummary?.avgTotalLevel?.current;
        statsGrid.appendChild(buildStatBlock('Avg total level', Number.isFinite(avgLevel) ? avgLevel.toFixed(1) : '—', createDeltaSpan(leaderboard?.trendSummary?.avgTotalLevel?.change, 1)));
        let avgXp = leaderboard?.trendSummary?.avgTotalXP?.current;
        statsGrid.appendChild(buildStatBlock('Avg total XP', Number.isFinite(avgXp) ? formatCompactNumber(avgXp) : '—', createDeltaSpan(leaderboard?.trendSummary?.avgTotalXP?.change, 0, {
            compact: !0
        }))), headerCard.appendChild(statsGrid), container.appendChild(headerCard);
        let widgets = el('div', 'home-widgets-grid');
        widgets.appendChild((onTheRise = leaderboard.onTheRise, card = el('section', 'card home-widget-card'), header = el('div', 'home-widget-header', [
            el('div', 'flex-items-center gap-2', [
                text('📈 On the Rise')
            ])
        ]), hours = Number(onTheRise?.windowHours), header.appendChild(el('div', 'home-widget-meta', [
            text(hours ? `Rank climbs across the last ${hours}h` : 'Latest notable rank gains')
        ])), body = el('div', 'home-widget-body'), list = el('ul', 'on-rise-list'), (entries = Array.isArray(onTheRise?.players) ? onTheRise.players : []).length ? entries.forEach((player)=>{
            let li = el('li', 'on-rise-item'), main = el('div', 'on-rise-item-main'), nameRow = el('div', 'on-rise-name-row');
            nameRow.appendChild(createUsernameLink(player.username));
            let delta = Number(player.delta);
            if (Number.isFinite(delta) && 0 !== delta) {
                let deltaEl = el('span', 'on-rise-delta', [
                    text(formatSigned(delta))
                ]);
                nameRow.appendChild(deltaEl);
            }
            main.appendChild(nameRow);
            let metaParts = [];
            Number.isFinite(player.currentRank) && metaParts.push(`Now #${player.currentRank}`), Number.isFinite(player.previousRank) && metaParts.push(`from #${player.previousRank}`), Number.isFinite(player.totalLevel) && metaParts.push(`Lv ${player.totalLevel.toLocaleString()}`), Number.isFinite(player.totalXP) && metaParts.push(`${formatCompactNumber(player.totalXP)} XP`), metaParts.length && main.appendChild(el('div', 'on-rise-meta', [
                text(metaParts.join(' • '))
            ])), li.appendChild(main), list.appendChild(li);
        }) : list.appendChild(el('li', 'on-rise-empty', [
            text('No major rank climbs detected yet.')
        ])), body.appendChild(list), card.appendChild(header), card.appendChild(body), card)), widgets.appendChild(function(summary) {
            let card = el('section', 'card home-widget-card'), header = el('div', 'home-widget-header', [
                el('div', 'flex-items-center gap-2', [
                    text('📊 Leaderboard Trends')
                ])
            ]);
            if (summary) {
                let sampleParts = [];
                Number.isFinite(summary.sampleSize) && sampleParts.push(`${summary.sampleSize} players`), Number.isFinite(summary.sampleWindowHours) && sampleParts.push(`${summary.sampleWindowHours}h window`), sampleParts.length && header.appendChild(el('div', 'home-widget-meta', [
                    text(sampleParts.join(' • '))
                ]));
            } else header.appendChild(el('div', 'home-widget-meta', [
                text('Awaiting recent history')
            ]));
            let body = el('div', 'home-widget-body'), list = el('ul', 'home-trends-list');
            if (summary) {
                let totalPlayers = Number(summary.totalPlayers) || 0, playersDelta = createDeltaSpan(summary.totalPlayersChange24h, 0, {
                    compact: !0
                }), totalRow = el('li', 'home-trend-item');
                totalRow.appendChild(el('span', 'home-trend-label', [
                    text('Total players')
                ]));
                let totalValue = el('span', 'home-trend-value', [
                    text(totalPlayers.toLocaleString())
                ]);
                playersDelta && totalValue.appendChild(playersDelta), totalRow.appendChild(totalValue), list.appendChild(totalRow);
                let avgLevel = summary.avgTotalLevel?.current, levelRow = el('li', 'home-trend-item');
                levelRow.appendChild(el('span', 'home-trend-label', [
                    text('Avg total level')
                ]));
                let levelValue = el('span', 'home-trend-value', [
                    text(Number.isFinite(avgLevel) ? avgLevel.toFixed(1) : '—')
                ]), levelDelta = createDeltaSpan(summary.avgTotalLevel?.change, 1);
                levelDelta && levelValue.appendChild(levelDelta), levelRow.appendChild(levelValue), list.appendChild(levelRow);
                let avgXp = summary.avgTotalXP?.current, xpRow = el('li', 'home-trend-item');
                xpRow.appendChild(el('span', 'home-trend-label', [
                    text('Avg total XP')
                ]));
                let xpValue = el('span', 'home-trend-value', [
                    text(Number.isFinite(avgXp) ? formatCompactNumber(avgXp) : '—')
                ]), xpDelta = createDeltaSpan(summary.avgTotalXP?.change, 0, {
                    compact: !0
                });
                xpDelta && xpValue.appendChild(xpDelta), xpRow.appendChild(xpValue), list.appendChild(xpRow);
            } else list.appendChild(el('li', 'home-trend-item', [
                text('History unavailable yet.')
            ]));
            return body.appendChild(list), card.appendChild(header), card.appendChild(body), card;
        }(leaderboard.trendSummary)), widgets.appendChild(function(weeklyRarest) {
            let card = el('section', 'card home-widget-card'), header = el('div', 'home-widget-header', [
                el('div', 'flex-items-center gap-2', [
                    text('🏅 Weekly Rarest Unlock')
                ])
            ]);
            header.appendChild(el('div', 'home-widget-meta', [
                text(weeklyRarest ? `Window: last ${weeklyRarest.windowDays || 7} days` : 'Watching rare achievement unlocks')
            ])), card.appendChild(header);
            let body = el('div', 'home-widget-body');
            if (weeklyRarest) {
                let title = friendlyAchievementLabel(weeklyRarest.key) || weeklyRarest.key;
                body.appendChild(el('div', 'text-base font-semibold', [
                    text(title)
                ]));
                let statsParts = [];
                Number.isFinite(weeklyRarest.globalCount) && statsParts.push(`${weeklyRarest.globalCount.toLocaleString()} total unlocks`), Number.isFinite(weeklyRarest.weeklyCount) && statsParts.push(`${weeklyRarest.weeklyCount} this week`), Number.isFinite(weeklyRarest.prevalencePct) && statsParts.push(`≈ ${function(value, digits = 2) {
                    if (!Number.isFinite(value)) return '—';
                    let trimmed = value.toFixed(digits).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
                    return `${trimmed}%`;
                }(weeklyRarest.prevalencePct, 3)} of players`), weeklyRarest.rarity && statsParts.push(`Rarity: ${weeklyRarest.rarity}`), statsParts.length && body.appendChild(el('div', 'home-widget-meta', [
                    text(statsParts.join(' • '))
                ]));
                let list = el('ul', 'weekly-rarest-unlocks'), recent = Array.isArray(weeklyRarest.recentUnlocks) ? weeklyRarest.recentUnlocks : [];
                recent.length ? recent.forEach((unlock)=>{
                    let item = el('li', 'weekly-rarest-player');
                    item.appendChild(createUsernameLink(unlock.username));
                    let timeEl = document.createElement('time'), ts = unlock.timestamp ? new Date(unlock.timestamp) : null;
                    ts && !Number.isNaN(ts.getTime()) ? (timeEl.dateTime = ts.toISOString(), timeEl.textContent = formatRelativeTime(ts.getTime()), timeEl.setAttribute('title', ts.toLocaleString())) : timeEl.textContent = '—', item.appendChild(timeEl), list.appendChild(item);
                }) : list.appendChild(el('li', 'weekly-rarest-empty', [
                    text('No unlocks recorded in the last few days.')
                ])), body.appendChild(list);
            } else body.appendChild(el('div', 'weekly-rarest-empty', [
                text('No rare achievements unlocked this week yet.')
            ]));
            return card.appendChild(body), card;
        }(leaderboard.weeklyRarest)), widgets.appendChild(function(watchlist) {
            let card = el('section', 'card watchlist-card'), header = el('div', 'home-widget-header', [
                el('div', 'flex-items-center gap-2', [
                    text('🕵️ Auto Watchlist')
                ])
            ]), generated = Number(watchlist?.generatedAt), metaParts = [];
            if (generated && metaParts.push(`Updated ${formatRelativeTime(generated)}`), Number.isFinite(watchlist?.windowHours) && metaParts.push(`Window ${watchlist.windowHours}h`), Number.isFinite(watchlist?.totalPlayers) && metaParts.push(`${watchlist.totalPlayers.toLocaleString()} players tracked`), header.appendChild(el('div', 'home-widget-meta', [
                text(metaParts.length ? metaParts.join(' • ') : 'Auto-curated from leaderboard activity')
            ])), card.appendChild(header), watchlist?.sources) {
                let { rare = 0, climbers = 0, anchors = 0 } = watchlist.sources, summary = [];
                rare && summary.push(`${rare} rare`), climbers && summary.push(`${climbers} climbers`), anchors && summary.push(`${anchors} anchors`), summary.length && card.appendChild(el('div', 'watchlist-actions', [
                    text(`Sources: ${summary.join(' • ')}`)
                ]));
            }
            let list = el('ul', 'watchlist-list'), tracked = Array.isArray(watchlist?.tracked) ? watchlist.tracked : [];
            return tracked.length ? tracked.forEach((entry)=>{
                let li = el('li', 'watchlist-player'), topRow = el('div', 'watchlist-player-top');
                topRow.appendChild(createUsernameLink(entry.username));
                let badge = createTierBadge(entry);
                if (badge && topRow.appendChild(badge), entry.source) {
                    let tag = el('span', 'watchlist-tag', [
                        text(describeWatchlistSource(entry))
                    ]);
                    topRow.appendChild(tag);
                }
                Number.isFinite(entry.delta) && entry.delta > 0 && topRow.appendChild(el('span', 'watchlist-delta', [
                    text(formatSigned(entry.delta))
                ])), li.appendChild(topRow);
                let reasonText = entry.reason || (entry.achievementKey ? friendlyAchievementLabel(entry.achievementKey) : '') || describeWatchlistSource(entry);
                reasonText && li.appendChild(el('div', 'watchlist-reason', [
                    text(reasonText)
                ]));
                let metaParts = [];
                if (Number.isFinite(entry.rank) && metaParts.push(`Rank #${entry.rank}`), Number.isFinite(entry.previousRank) && metaParts.push(`Prev #${entry.previousRank}`), entry.tier && !badge && metaParts.push(entry.tier), metaParts.length && li.appendChild(el('div', 'watchlist-meta', [
                    text(metaParts.join(' • '))
                ])), entry.happenedAt) {
                    let ts = new Date(entry.happenedAt);
                    if (!Number.isNaN(ts.getTime())) {
                        let when = el('div', 'watchlist-status', [
                            text(`Last event ${formatRelativeTime(ts.getTime())}`)
                        ]);
                        when.setAttribute('title', ts.toLocaleString()), li.appendChild(when);
                    }
                }
                list.appendChild(li);
            }) : list.appendChild(el('li', 'watchlist-empty', [
                text(watchlist?.message || 'No notable players detected yet.')
            ])), card.appendChild(list), watchlist?.message && tracked.length && card.appendChild(el('div', 'watchlist-more', [
                text(watchlist.message)
            ])), card;
        }(leaderboard.watchlist)), container.appendChild(widgets), container.appendChild(function(players) {
            let wrapper = el('div', 'osrs-table home-leaderboard'), scroll = el('div', 'table-scroll'), table = document.createElement('table');
            table.className = 'leaderboard-table', table.innerHTML = `
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
            let tbody = table.querySelector('tbody');
            if (players && players.length) players.forEach((player)=>{
                let tr = document.createElement('tr');
                tr.classList.add('top-player-row'), 1 === player.rank ? tr.classList.add('rank-1') : 2 === player.rank ? tr.classList.add('rank-2') : 3 === player.rank && tr.classList.add('rank-3');
                let rankCell = document.createElement('td');
                rankCell.className = 'text-center insight-rank', rankCell.textContent = Number.isFinite(player.rank) ? `#${player.rank}` : '—', tr.appendChild(rankCell);
                let playerCell = document.createElement('td');
                playerCell.className = 'text-left', playerCell.appendChild(createUsernameLink(player.username));
                let badge = createTierBadge(player);
                badge && playerCell.appendChild(badge);
                let metaParts = [], top1 = Number(player?.tierInfo?.top1Skills || 0);
                top1 > 0 && metaParts.push(`#1 in ${top1} skill${1 === top1 ? '' : 's'}`), player.archetype && metaParts.push(player.archetype.replace(/-/g, ' ')), metaParts.length && playerCell.appendChild(el('div', 'text-xs text-muted flex gap-2 flex-wrap mt-1', [
                    text(metaParts.join(' • '))
                ])), tr.appendChild(playerCell);
                let levelCell = document.createElement('td');
                levelCell.className = 'text-center skill-level', levelCell.textContent = Number.isFinite(player.totalLevel) ? player.totalLevel.toLocaleString() : '—', tr.appendChild(levelCell);
                let xpCell = document.createElement('td');
                xpCell.className = 'text-right skill-xp', xpCell.textContent = Number.isFinite(player.totalXP) ? player.totalXP.toLocaleString() : '—', tr.appendChild(xpCell);
                let updatedCell = document.createElement('td');
                if (updatedCell.className = 'text-right text-sm text-muted', player.updatedAt) {
                    let ts = new Date(player.updatedAt);
                    Number.isNaN(ts.getTime()) ? updatedCell.textContent = '—' : (updatedCell.textContent = formatRelativeTime(ts.getTime()), updatedCell.setAttribute('title', ts.toLocaleString()));
                } else updatedCell.textContent = '—';
                tr.appendChild(updatedCell), tbody.appendChild(tr);
            });
            else {
                let row = document.createElement('tr'), cell = document.createElement('td');
                cell.colSpan = 5, cell.className = 'text-center py-6 text-muted', cell.textContent = 'No leaderboard data available.', row.appendChild(cell), tbody.appendChild(row);
            }
            return scroll.appendChild(table), wrapper.appendChild(scroll), wrapper;
        }(players)), root.appendChild(container);
    } catch (err) {
        console.error('Failed to render home view', err);
        let message = err?.message || 'Check the console for more details.';
        root.innerHTML = `<div class="card text-center py-6"><div class="text-danger text-lg font-semibold">Failed to load leaderboard</div><div class="text-muted mt-2">${message}</div></div>`, renderHeroSnapshot(null);
    }
    rareBannerInitialized || (function() {
        let container = document.getElementById('bannerContainer');
        if (!container) return;
        let banners = [], idx = 0, timer = null, isIso = (s)=>'string' == typeof s && /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z/.test(s), validate = (b)=>!(!b || 'object' != typeof b || !Array.isArray(b.playerNames) || !b.playerNames.length || b.playerNames.some((n)=>'string' != typeof n || !n.trim()) || 'string' != typeof b.achievement || !b.achievement.trim() || !isIso(b.timestamp) || !isIso(b.expiry) || !b.details || 'object' != typeof b.details || null !== b.details.skill && 'string' != typeof b.details.skill || null !== b.details.title && 'string' != typeof b.details.title || Date.parse(b.expiry) <= Date.now()), next = ()=>{
            if (!banners.length) {
                container.innerHTML = '';
                return;
            }
            idx = (idx + 1) % banners.length, ((b)=>{
                if (container.innerHTML = '', !b) return;
                let div = document.createElement('div');
                div.className = 'rare-banner active';
                let icon = document.createElement('div');
                icon.className = 'banner-icon', icon.textContent = '🎉';
                let left = document.createElement('div');
                left.className = 'banner-left';
                let textWrap = document.createElement('div');
                textWrap.className = 'banner-text';
                let title = document.createElement('div');
                title.className = 'banner-title';
                let names = b.playerNames.join(', ');
                title.textContent = `Congrats ${names}! ${b.achievement}`;
                let meta = document.createElement('div');
                if (meta.className = 'banner-meta', meta.textContent = new Date(b.timestamp).toISOString(), b.details) {
                    if (b.details.skill) {
                        let pill = document.createElement('span');
                        pill.className = 'pill', pill.textContent = b.details.skill, meta.appendChild(pill);
                    }
                    if (b.details.title) {
                        let pill = document.createElement('span');
                        pill.className = 'pill', pill.textContent = b.details.title, meta.appendChild(pill);
                    }
                }
                textWrap.appendChild(title), textWrap.appendChild(meta), left.appendChild(icon), left.appendChild(textWrap), div.appendChild(left), container.appendChild(div);
            })(banners[idx]);
        };
        fetchJson('/api/banners/rare').then((arr)=>{
            try {
                if (!Array.isArray(arr)) return void console.error('rare banners: not array');
                banners = arr.filter(validate), (()=>{
                    if (timer && clearInterval(timer), !banners.length) {
                        container.innerHTML = '';
                        return;
                    }
                    banners.sort((a, b)=>Date.parse(b.timestamp) - Date.parse(a.timestamp)), idx = -1, next(), timer = setInterval(next, 10000);
                })();
            } catch (e) {
                console.error('rare banners parse error', e);
            }
        }).catch((e)=>{
            console.debug('No rare banners', e?.message || e);
        });
    }(), rareBannerInitialized = !0);
}
async function computeGlobalAchievementStats(skillRankings, leaderboard) {
    let averages = computeSkillAverages(skillRankings);
    try {
        let stats = await fetchJson('/api/achievements/stats'), counts = stats?.counts || {}, totalPlayers = Number(stats?.totalPlayers) || leaderboard?.totalPlayers || leaderboard?.players?.length || 0;
        return {
            counts,
            totalPlayers,
            averages
        };
    } catch (_) {
        return {
            counts: {},
            totalPlayers: leaderboard?.totalPlayers || leaderboard?.players?.length || 0,
            averages
        };
    }
}
async function loadLeaderboard(force = !1) {
    return cache.leaderboard && !force || (cache.leaderboard = await fetchJson("/api/leaderboard?limit=500")), cache.leaderboard;
}
async function loadUsers(force = !1) {
    return cache.users && !force && Date.now() - cache.usersFetchedAt < 60000 || (cache.users = await fetchJson("/api/users"), cache.usersFetchedAt = Date.now()), cache.users;
}
async function loadSkillRankings(force = !1) {
    return cache.skillRankings && !force || (cache.skillRankings = await fetchJson("/api/skill-rankings")), cache.skillRankings;
}
function getUserSkillRank(skillRankings, username, skill) {
    if (!skillRankings || !skillRankings.rankings || !skillRankings.rankings[skill]) return null;
    let playerData = skillRankings.rankings[skill].find((p)=>p.username === username);
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
    if (SKILLS.forEach((s)=>{
        let r = getUserSkillRank(skillRankings, user.username, s);
        r && r < bestRank && (bestRank = r, bestRankSkill = s);
    }), bestRankSkill) {
        let name = bestRankSkill.charAt(0).toUpperCase() + bestRankSkill.slice(1);
        rankEl.textContent = `Highest rank: ${name} (#${bestRank})`;
    } else rankEl.textContent = "Highest rank: —";
    let bestLevel = -1, bestXp = -1, bestLevelSkill = null;
    if (SKILLS.forEach((s)=>{
        let skill = user.skills[s], lvl = skill?.level || 1, xp = skill?.xp || 0;
        (lvl > bestLevel || lvl === bestLevel && xp > bestXp) && (bestLevel = lvl, bestXp = xp, bestLevelSkill = s);
    }), bestLevelSkill) {
        let name = bestLevelSkill.charAt(0).toUpperCase() + bestLevelSkill.slice(1);
        levelEl.textContent = `Highest level: ${name} (Lv. ${bestLevel}, ${bestXp.toLocaleString()} XP)`;
    } else levelEl.textContent = "Highest level: —";
}
function computeSkillAverages(skillRankings) {
    let averages = {};
    try {
        let all = skillRankings && skillRankings.rankings || {};
        SKILLS.forEach((s)=>{
            let arr = all[s] || [];
            if (arr.length) {
                let totalLvl = arr.reduce((sum, p)=>sum + (p.level || 0), 0), totalXp = arr.reduce((sum, p)=>sum + (p.xp || 0), 0);
                averages[s] = {
                    level: totalLvl / arr.length,
                    xp: totalXp / arr.length
                };
            } else averages[s] = {
                level: 1,
                xp: 0
            };
        });
    } catch (_) {
        SKILLS.forEach((s)=>averages[s] = {
                level: 1,
                xp: 0
            });
    }
    return averages;
}
async function loadUser(username) {
    return fetchJson("/api/users/" + encodeURIComponent(username));
}
function handleRoute() {
    let hash = location.hash.slice(1);
    if (hash) if (hash.startsWith("user/")) {
        var username;
        let root, __leftExtrasInit;
        username = decodeURIComponent(hash.split("/")[1]), setHomeHeroVisible(!1), (root = $("#viewRoot")).innerHTML = '<div class="text-center text-muted py-8">⏳ Loading player data...</div>', (__leftExtrasInit = document.querySelector('#leftStackExtras')) && (__leftExtrasInit.innerHTML = ''), Promise.all([
            loadUser(username),
            loadSkillRankings(),
            loadLeaderboard().catch(()=>null)
        ]).then(([user, skillRankings, leaderboard])=>{
            let wrap = el("div", "flex flex-col gap-8"), headerSection = el("div", "bg-layer2 p-6 rounded-lg border-2 border-border-dark primary-header-card"), headerContent = el("div", "flex-between flex-wrap gap-4"), userInfo = el("div", "flex-items-center gap-3 flex-wrap"), nameWrap = el("h3", "font-bold text-foreground flex-items-center gap-2");
            if (nameWrap.appendChild(text(`⚔️ ${user.username}`)), leaderboard && leaderboard.players) {
                let me = leaderboard.players.find((p)=>p.username === user.username);
                if (me && me.tier) {
                    let b = document.createElement('span');
                    b.className = `tier-badge tier-${me.tier.toLowerCase()}`, b.textContent = me.tier, (me.rank || me.tierInfo && 'number' == typeof me.tierInfo.top1Skills) && (b.title = `${me.tier} • Overall #${me.rank}${me.tierInfo && me.tierInfo.top1Skills ? ` • #1 in ${me.tierInfo.top1Skills} skills` : ''}`), nameWrap.appendChild(b);
                }
            }
            let copyBtn = document.createElement('button');
            copyBtn.className = 'icon-button', copyBtn.id = 'copyProfileLink', copyBtn.title = 'Copy profile link', copyBtn.setAttribute('aria-label', 'Copy profile link'), copyBtn.innerHTML = '<i data-lucide="link"></i>', userInfo.appendChild(copyBtn), window.lucide && window.lucide.createIcons(), userInfo.appendChild(nameWrap);
            let attack = user.skills.attack.level, strength = user.skills.strength.level, defence = user.skills.defence.level, hitpoints = user.skills.hitpoints.level, ranged = user.skills.ranged.level, magic = user.skills.magic.level, combatLevel = Math.floor((defence + hitpoints + Math.floor(user.skills.prayer.level / 2)) * 0.25 + 0.325 * Math.max(attack + strength, Math.max(1.5 * ranged, 1.5 * magic))), meta = el("div", "meta-badges text-sm flex items-center gap-2 flex-wrap");
            if (meta.appendChild(el("span", "meta-badge", [
                text(`Combat Lv. ${combatLevel}`)
            ])), leaderboard && leaderboard.players) {
                let me = leaderboard.players.find((p)=>p.username === user.username);
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
            let averages = computeSkillAverages(skillRankings), ACHIEVEMENT_CATALOG = ACHIEVEMENT_CATALOG || [
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
                Date.now();
                let results = [], push = (key)=>results.push({
                        key
                    });
                if (leaderboard && leaderboard.players) {
                    let me = leaderboard.players.find((p)=>p.username === user.username);
                    me?.tier === 'Grandmaster' && push('tier-grandmaster'), me?.tier === 'Master' && push('tier-master'), me?.tier === 'Diamond' && push('tier-diamond'), me?.rank === 1 && push('overall-rank-1');
                    let top1Count = me?.tierInfo?.top1Skills ?? 0;
                    top1Count || SKILLS.forEach((s)=>{
                        1 === getUserSkillRank(skillRankings, user.username, s) && top1Count++;
                    }), top1Count >= 3 && push('triple-crown'), top1Count >= 1 && push('crowned-any');
                }
                let levels = SKILLS.map((s)=>user.skills[s]?.level || 1), total = levels.reduce((a, b)=>a + b, 0);
                total >= 2277 ? push('total-2277') : total >= 2200 ? push('total-2200') : total >= 2000 ? push('total-2000') : total >= 1500 && push('total-1500');
                let count99 = levels.filter((l)=>l >= 99).length;
                levels.every((l)=>l >= 99) && push('maxed-account'), count99 >= 7 && push('seven-99s'), count99 >= 5 && push('five-99s'), [
                    'attack',
                    'strength',
                    'defence',
                    'hitpoints',
                    'ranged',
                    'magic',
                    'prayer'
                ].every((skill)=>(user.skills[skill]?.level || 1) >= 99) && push('combat-maxed'), Object.entries({
                    'skill-master-attack': 'attack',
                    'skill-master-strength': 'strength',
                    'skill-master-defence': 'defence',
                    'skill-master-hitpoints': 'hitpoints',
                    'skill-master-ranged': 'ranged',
                    'skill-master-magic': 'magic',
                    'skill-master-prayer': 'prayer'
                }).forEach(([achievement, skill])=>{
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
                ].map((s)=>user.skills[s]?.level || 1), nonCombatLevels = SKILLS.filter((s)=>![
                        'attack',
                        'strength',
                        'defence',
                        'hitpoints',
                        'ranged',
                        'magic',
                        'prayer'
                    ].includes(s)).map((s)=>user.skills[s]?.level || 1), avgCombat = combatLevels.reduce((a, b)=>a + b, 0) / combatLevels.length, avgNonCombat = nonCombatLevels.reduce((a, b)=>a + b, 0) / nonCombatLevels.length;
                avgNonCombat >= 70 && avgCombat <= 50 && push('skiller'), avgCombat >= 80 && avgNonCombat <= 30 && push('combat-pure');
                let ratio = SKILLS.filter((s)=>(user.skills[s]?.level || 1) > (averages[s]?.level || 1)).length / SKILLS.length;
                ratio >= 0.90 ? push('elite') : ratio >= 0.75 ? push('versatile') : ratio >= 0.50 && push('consistent');
                let totalXP = SKILLS.reduce((sum, s)=>sum + (user.skills[s]?.xp || 0), 0);
                totalXP >= 1000000000 && push('xp-billionaire'), totalXP >= 200000000 && push('totalxp-200m'), totalXP >= 100000000 && push('totalxp-100m'), totalXP >= 50000000 && push('totalxp-50m'), totalXP >= 10000000 && push('totalxp-10m');
                let avgLevel = total / SKILLS.length;
                avgLevel >= 90 ? push('level-90-average') : avgLevel >= 75 ? push('level-75-average') : avgLevel >= 50 && push('level-50-average');
                let ranged = user.skills.ranged?.level || 1;
                (user.skills.magic?.level || 1) >= 80 && ranged >= 80 && push('magic-ranged'), atk >= 85 && str >= 85 && def >= 85 && push('melee-specialist'), (user.skills.prayer?.level || 1) >= 80 && herblore >= 80 && runecraft >= 80 && push('support-master'), woodcutting >= 80 && fishing >= 80 && mining >= 80 && push('gathering-master');
                try {
                    let pray = user.skills.prayer?.level || 1, base = 0.25 * (def + hitpoints + Math.floor(pray / 2)), ranger = 0.325 * Math.floor(1.5 * ranged), mager = 0.325 * Math.floor(1.5 * (user.skills.magic?.level || 1)), cl = Math.floor(base + Math.max(0.325 * (attack + strength), ranger, mager));
                    cl >= 100 && push('combat-level-100'), cl >= 110 && push('combat-level-110'), cl >= 120 && push('combat-level-120'), cl >= 126 && push('combat-level-126');
                } catch (_) {}
                return SKILLS.forEach((s)=>{
                    (user.skills[s]?.xp || 0) >= 200000000 && push(`skill-200m-${s}`);
                }), [
                    ...new Set(results.map((r)=>r.key))
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
                if (featured.forEach((a)=>{
                    let card, icon, title, desc;
                    return featuredWrap.appendChild(((card = el('div', `achievement-card rarity-${a.rarity}`)).setAttribute('data-tooltip', `${a.label}\n${a.desc}`), 'number' == typeof a.prevalence && card.setAttribute('data-prevalence', `${a.prevalence.toFixed(1)}%`), icon = el('div', 'ach-icon', [
                        text(a.icon)
                    ]), title = el('div', 'ach-title', [
                        text(a.label)
                    ]), desc = el('div', 'ach-desc', [
                        text(a.desc)
                    ]), card.appendChild(icon), card.appendChild(title), card.appendChild(desc), card));
                }), section.appendChild(featuredWrap), achievements.length > 3) {
                    let rest = achievements.slice(3), toggleRow = el('div', 'flex-center mt-4'), toggleBtn = el('button', 'btn-sm', [
                        text('View all')
                    ]);
                    toggleBtn.setAttribute('aria-expanded', 'false'), toggleBtn.type = 'button', toggleRow.appendChild(toggleBtn), section.appendChild(toggleRow);
                    let allWrap = el('div', 'achievements-inline-grid mt-3 hidden');
                    rest.forEach((a)=>{
                        let prevalence, rarityClass, card, icon, content;
                        return allWrap.appendChild((prevalence = a.prevalence ?? 100, rarityClass = 'common', prevalence < 1 ? rarityClass = 'mythic' : prevalence < 5 ? rarityClass = 'legendary' : prevalence < 15 ? rarityClass = 'epic' : prevalence < 35 && (rarityClass = 'rare'), (card = el('div', `achievement-inline-card ach-${rarityClass}`)).setAttribute('data-tooltip', `${a.label}\n${a.desc}${'number' == typeof prevalence ? `\n${prevalence.toFixed(1)}% of players` : ''}`), icon = el('div', 'ach-inline-icon', [
                            text(a.icon)
                        ]), (content = el('div', 'ach-inline-content')).appendChild(el('div', 'ach-inline-name', [
                            text(a.label)
                        ])), 'number' == typeof prevalence && content.appendChild(el('div', 'ach-inline-rarity', [
                            text(`${prevalence.toFixed(1)}%`)
                        ])), card.appendChild(icon), card.appendChild(content), card));
                    }), section.appendChild(allWrap), toggleBtn.addEventListener('click', ()=>{
                        allWrap.classList.contains('hidden') ? (allWrap.classList.remove('hidden'), toggleBtn.textContent = 'View fewer', toggleBtn.setAttribute('aria-expanded', 'true')) : (allWrap.classList.add('hidden'), toggleBtn.textContent = 'View all', toggleBtn.setAttribute('aria-expanded', 'false'));
                    });
                }
                container.appendChild(section);
            }
            let leftExtras = document.querySelector('#leftStackExtras');
            leftExtras && leftExtras.appendChild(headerSection);
            let achievementsData = null, achievementsMount = el('div', '');
            computeGlobalAchievementStats(skillRankings, leaderboard).then((globalStats)=>{
                let unlockedSet = new Set(deriveUserAchievements(user, globalStats.averages));
                unlockedSet.size > 0 && (achievementsData = ACHIEVEMENT_CATALOG.filter((a)=>unlockedSet.has(a.key)).map((achievement)=>{
                    let prevalence = globalStats.counts[achievement.key] || 0, percentage = globalStats.totalPlayers > 0 ? prevalence / globalStats.totalPlayers * 100 : 0;
                    return {
                        ...achievement,
                        prevalence: percentage
                    };
                }).sort((a, b)=>a.prevalence - b.prevalence), renderAchievementsHero(achievementsMount, leaderboard && leaderboard.players ? leaderboard.players.find((p)=>p.username === user.username) : null, achievementsData));
            }).catch(()=>{
                try {
                    let userAchievementKeys = deriveUserAchievements(user, averages);
                    if (userAchievementKeys && userAchievementKeys.length) {
                        let unlockedAchievements = ACHIEVEMENT_CATALOG.filter((a)=>userAchievementKeys.includes(a.key)), me = leaderboard && leaderboard.players ? leaderboard.players.find((p)=>p.username === user.username) : null;
                        renderAchievementsHero(achievementsMount, me, unlockedAchievements);
                    }
                } catch (_) {}
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
                let found = leaderboard.players.find((p)=>p.username === user.username);
                found && (overallRank = found.rank);
            }
            let totalLevel = user.totalLevel || SKILLS.reduce((sum, s)=>sum + (user.skills[s]?.level || 1), 0), totalXP = user.totalXP || SKILLS.reduce((sum, s)=>sum + (user.skills[s]?.xp || 0), 0), overallTr = document.createElement("tr");
            overallTr.classList.add("font-bold"), overallTr.innerHTML = `
          <td class="text-left">Overall</td>
          <td class="text-center skill-level">${totalLevel}</td>
          <td class="text-right skill-xp">${totalXP.toLocaleString()}</td>
          <td class="text-center skill-rank">${overallRank ? "#" + overallRank : "—"}</td>
        `, tbody.appendChild(overallTr), SKILLS.forEach((skillName)=>{
                let skill = user.skills[skillName], rank = getUserSkillRank(skillRankings, username, skillName), tr = document.createElement("tr");
                1 === rank ? tr.classList.add("rank-1") : 2 === rank ? tr.classList.add("rank-2") : 3 === rank && tr.classList.add("rank-3");
                let baseXP = 1154 * ("hitpoints" === skillName);
                ((skill?.level || 1) > 1 || (skill?.xp || 0) > baseXP) && (tr.classList.add("clickable"), tr.addEventListener("click", ()=>{
                    window.open(`skill-hiscores.html?skill=${skillName}#skill=${skillName}`, "_blank");
                }));
                let iconUrl = getSkillIcon(skillName), nameCell = document.createElement("td");
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
        }).catch((err)=>{
            let __leftExtrasErr = document.querySelector('#leftStackExtras');
            __leftExtrasErr && (__leftExtrasErr.innerHTML = '');
            let is404 = err && /404/.test(String(err.message || err));
            root.innerHTML = `<div class="text-center py-8"><div class="text-danger text-xl font-semibold">${is404 ? "❌ Player not found" : "❌ Failed to load player data"}</div><div class="text-muted mt-2">${is404 ? "The player you're looking for doesn't exist in our database." : "Something went wrong while loading this player. Check the console/network tab for details."}</div></div>`, updateSummary(null);
        });
    } else renderHomeView(), updateSummary(null);
    else renderHomeView(), updateSummary(null);
}
document.addEventListener("click", (e)=>{
    let btn = e.target.closest(".username-link");
    if (btn) {
        let u = btn.getAttribute("data-user");
        location.hash = "user/" + encodeURIComponent(u);
    }
    if (e.target.closest('#copyProfileLink')) {
        let href = window.location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(href).then(()=>showToast('Profile link copied')).catch(()=>showToast('Copy failed', 'error'));
        else {
            let tmp = document.createElement('input');
            tmp.value = href, document.body.appendChild(tmp), tmp.select();
            try {
                document.execCommand('copy'), showToast('Profile link copied');
            } catch (_) {
                showToast('Copy failed', 'error');
            }
            tmp.remove();
        }
    }
    if (e.target.closest('.brand-link')) {
        e.preventDefault();
        location.hash = '';
    }
});
window.addEventListener("hashchange", handleRoute);

initCommonUi();
handleRoute();

document.addEventListener('keydown', (e)=>{
    if ('/' === e.key && !e.ctrlKey && !e.metaKey && !e.altKey) {
        let tag = e.target && e.target.tagName || '';
        if ('INPUT' !== tag && 'TEXTAREA' !== tag && !e.target.isContentEditable) {
            e.preventDefault();
            let inp = document.getElementById('playerSearch');
            inp && (inp.focus(), inp.select());
        }
    }
});
