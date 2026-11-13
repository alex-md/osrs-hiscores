import { request } from './api.js';
import { BOSS_BY_KEY } from './activities.js';
import { SKILLS, title } from './domain.js';

export async function worldWatchView({signal,isCurrent,view,escape,number,date,playerLink,pageHeading,stats}) {
  const data = await request('/api/world-watch',{signal});
  if (!isCurrent()) return;
  const watch = data.watch;
  const heading = pageHeading('Around Gielinor','World watch','Find a grind to follow, a cape within reach, or an encounter worth exploring.');
  if (!watch) {
    view.innerHTML = `${heading}<section class="panel"><div class="panel-heading"><h2>The next watch begins soon</h2></div><p class="history-note">World activity appears after the next scheduled update. <a href="#stories">Read the world stories ↗</a></p></section>`;
    return;
  }
  const player = name => `<a href="${playerLink(name)}">${escape(name)}</a>`;
  const activity = key => BOSS_BY_KEY[key]?.name || (key === 'treasure-trails' ? 'Treasure trails' : title(key));
  view.innerHTML = `${heading}
    <p class="history-note">Captured ${date(data.generatedAt)} · Activity covers the preceding 15 minutes. <a href="#stories">Read the latest stories ↗</a></p>
    ${stats([['Active adventurers',number(watch.activePlayers)],['On boss trips',number(watch.bossingPlayers)],['XP earned',number(watch.recentXP)]],'ranking-summary')}
    <div class="watch-columns">
      <section class="panel"><div class="panel-heading"><h2>Where the world is playing</h2></div><ol class="watch-activities">${watch.activities.map(row=>`<li><a href="${BOSS_BY_KEY[row.key] ? '#bosses?boss='+row.key : row.key==='treasure-trails' ? '#stories' : SKILLS.includes(row.key) ? '#skills/'+row.key : '#progress'}">${escape(activity(row.key))}</a><span>${number(row.players)} ${row.players === 1 ? 'adventurer' : 'adventurers'}</span><meter aria-label="${escape(activity(row.key))} share of active adventurers" min="0" max="${Math.max(1,watch.activePlayers)}" value="${row.players}"></meter></li>`).join('')}</ol>${watch.activities.length ? '' : '<p class="history-note">No recent sessions in this capture. Explore the <a href="#progress">recorded gains</a>.</p>'}<p class="history-note">The eight busiest activities. Each adventurer counts once, under their main activity. Boss trips can also include a little skilling.</p></section>
      <section class="panel"><div class="panel-heading"><h2>A cape within reach</h2></div><ol class="max-race">${watch.nearMastery.map(row=>`<li><strong>${player(row.username)} · ${escape(title(row.skill))}</strong><span>Level ${row.level} · ${number(row.remainingXP)} XP to 99</span><a href="#progress?${new URLSearchParams({username:row.username,metric:row.skill,days:'7'})}">Follow the final stretch ↗</a></li>`).join('')}</ol>${watch.nearMastery.length ? '' : '<p class="history-note">Nobody is within 1M XP of their next 99. <a href="#stories">Follow the race to max ↗</a></p>'}<p class="history-note">The nearest unfinished 99 per player, within 1M XP. Distance measures XP remaining; finishing time depends on their next sessions.</p></section>
    </div>
    <section class="panel"><div class="panel-heading"><h2>Boss field guide</h2><button class="button" id="watch-explore">Explore an encounter ↗</button></div><p class="history-note">Find a busy hunt or watch an overlooked ladder grow. Lifetime counts include different starting dates and encounter speeds.</p>
      <div class="filter-bar"><label class="search-filter">Find an encounter<input id="watch-search" type="search" placeholder="Boss name"></label><label>Order<select id="watch-sort"><option value="active">Most hunters recently</option><option value="quiet">Least explored</option><option value="lifetime">Lifetime count</option></select></label></div>
      <div id="watch-encounters"></div>
    </section>
    <section class="panel"><div class="panel-heading"><h2>New faces</h2><a href="#overall">Meet the world ↗</a></div><p class="history-note">The latest arrivals from the past seven days. Follow an account from its first levels.</p><div class="watch-newcomers">${watch.newcomers.map(row=>`<article><h3>${player(row.username)}</h3><p>${number(row.totalLevel)} total level</p><p>Joined ${date(row.createdAt)}</p></article>`).join('')}</div>${watch.newcomers.length ? '' : '<p class="history-note">No new arrivals in the past seven days.</p>'}</section>`;
  let expanded = false;
  const render = () => {
    const query = view.querySelector('#watch-search').value.toLowerCase();
    const order = view.querySelector('#watch-sort').value;
    const rows = watch.encounters.filter(row=>BOSS_BY_KEY[row.key]?.name.toLowerCase().includes(query));
    rows.sort((a,b)=>(order==='quiet' ? a.participants-b.participants : order==='lifetime' ? b.totalKC-a.totalKC : b.hunters-a.hunters || b.recentKC-a.recentKC) || BOSS_BY_KEY[a.key].name.localeCompare(BOSS_BY_KEY[b.key].name));
    const visibleRows = expanded ? rows : rows.slice(0,12);
    view.querySelector('#watch-encounters').innerHTML = `<div class="table-scroll" role="region" aria-label="Boss field guide" tabindex="0"><table><thead><tr><th>Encounter</th><th class="numeric">Recent hunters</th><th class="numeric">Recent KC</th><th class="numeric">Lifetime participants</th><th class="numeric">Lifetime KC</th><th>Follow</th></tr></thead><tbody>${visibleRows.map(row=>`<tr><th scope="row"><a href="#bosses?boss=${row.key}">${escape(BOSS_BY_KEY[row.key].name)}</a></th><td class="numeric">${number(row.hunters)}</td><td class="numeric">${number(row.recentKC)}</td><td class="numeric">${number(row.participants)}</td><td class="numeric">${number(row.totalKC)}</td><td><a href="#progress?${new URLSearchParams({metric:row.key,days:'7'})}" aria-label="View ${escape(BOSS_BY_KEY[row.key].name)} gains">7-day gains ↗</a></td></tr>`).join('') || '<tr><td colspan="6" class="table-empty">No matching encounters. Try another name.</td></tr>'}</tbody></table></div><div class="watch-table-footer"><span>Showing ${number(visibleRows.length)} of ${number(rows.length)} encounters</span>${rows.length > 12 ? `<button class="button" id="watch-show">${expanded ? 'Show fewer' : 'Show all '+number(rows.length)+' encounters'}</button>` : ''}</div>`;
    view.querySelector('#watch-show')?.addEventListener('click',()=>{expanded=!expanded;render();});
  };
  view.querySelector('#watch-search').addEventListener('input',render);
  view.querySelector('#watch-sort').addEventListener('change',render);
  view.querySelector('#watch-explore').addEventListener('click',()=>{
    const candidates = watch.encounters.filter(row=>BOSS_BY_KEY[row.key]?.name.toLowerCase().includes(view.querySelector('#watch-search').value.toLowerCase()));
    const chosen = candidates[Math.floor(Math.random()*candidates.length)];
    if (chosen) location.hash = `bosses?boss=${chosen.key}`;
  });
  render();
}
