import { request } from './api.js';
import { PROGRESS_METRICS } from './progress.js';
export async function progressView({ current, signal, isCurrent, view, escape, number, date, playerLink, pageHeading, stats }) {
  const params = new URLSearchParams(current.params);
  const data = await request(`/api/progress?${params}`,{signal});
  if (!isCurrent()) return;
  const change = values => {
    const next = new URLSearchParams(current.params);
    next.delete('page');
    for (const [key,value] of Object.entries(values)) value ? next.set(key,value) : next.delete(key);
    location.hash = `progress?${next}`;
  };
  const metric = PROGRESS_METRICS.find(m=>m.key === (data.metric || params.get('metric'))) || PROGRESS_METRICS[0];
  const signed = n => n == null ? '—' : `${n>0?'+':''}${number(n)}`;
  const move = n => n == null ? '<span title="No comparable starting rank">New / unranked</span>' : `<span class="${n>0?'gain':n<0?'loss':''}">${n>0?'↑ ':n<0?'↓ ':''}${number(Math.abs(n))}</span>`;
  const reign = r => r ? `${number(Math.floor((r.through-r.since)/3600000))}h ${number(Math.floor((r.through-r.since)%3600000/60000))}m` : '—';
  const player = name => `<a href="${playerLink(name)}">${escape(name)}</a>`;
  const options = (items,selected) => items.map(([v,label])=>`<option value="${escape(v)}" ${String(selected)===String(v)?'selected':''}>${escape(label)}</option>`).join('');
  const heading = pageHeading('World progress','Gains & records','XP, levels, boss kills and movement through the hiscores.');
  if (!data.available || data.collecting) {
    view.innerHTML = `${heading}<section class="panel"><div class="panel-heading"><h2>${data.collecting?'History starts with the next update':'History is not connected'}</h2></div><p class="history-note">${escape(data.reason || 'The first captured update sets each player’s starting point. Gains will appear as accounts progress.')}</p><p class="history-note"><a href="#overall">View current hiscores</a></p></section>`;
    return;
  }
  const records = data.records || {};
  const recordRows = [
    ['Daily '+metric.unit,records[`daily:${metric.key}`],metric.unit],
    ['Daily rank climb',records[`climb:${metric.key}`],'places'],
    ['Daily rank fall',records[`fall:${metric.key}`],'places'],
    ['Single session XP',records['session:overall'],'XP'],
    ['XP training streak',records['streak:xp'],'days'],
    ['Bossing streak',records['streak:bosses'],'days'],
  ];
  const max = Math.max(1,...data.series.map(p=>Math.abs(p.gain)));
  const width = Math.max(340,data.series.length*34), height = 170;
  const chart = data.series.some(p=>p.gain!==0) ? `<div class="history-chart" role="img" aria-label="${escape(metric.name)} daily gains. Exact values are in the daily totals table below."><svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><path class="chart-axis" d="M0 135H${width}"/>${data.series.map((p,i)=>{
    const x = i*width/data.series.length, w = width/data.series.length;
    const h = Math.abs(p.gain)/max*110;
    return `<rect class="${p.gain<0?'chart-loss':'chart-gain'}" x="${x+w/2-Math.min(26,w*.6)/2}" y="${135-h}" width="${Math.min(26,w*.6)}" height="${h}"><title>${escape(p.day)}: ${signed(p.gain)} ${metric.unit}</title></rect><text x="${x+w/2}" y="158" text-anchor="middle">${data.series.length<10 || i%5===0 ? escape(p.day.slice(5)) : ''}</text>`;
  }).join('')}</svg></div>` : '<p class="history-note">No gains recorded in this period.</p>';
  const recordsTable = `<div class="table-scroll" tabindex="0"><table><thead><tr><th>Record since tracking began</th><th>Player</th><th class="numeric">Result</th><th>UTC day</th></tr></thead><tbody>${recordRows.map(([label,r,unit])=>`<tr><td>${escape(label)}</td><td>${r?player(r.username):'—'}</td><td class="numeric">${r?`${number(r.value)} ${unit==='days' && r.value===1?'day':unit}`:'—'}</td><td>${r?escape(r.day):'—'}</td></tr>`).join('')}</tbody></table></div>`;
  view.innerHTML = `${heading}
    <form class="history-filters panel" id="history-filters">
      <label>Period<select name="days">${options([[1,'Today'],[7,'7 days'],[30,'30 days']],data.days)}</select></label>
      <label>Hiscores<select name="metric">${options(PROGRESS_METRICS.map(m=>[m.key,m.name]),metric.key)}</select></label>
      <label>Order<select name="sort">${options([['gains','Biggest gains'],['rises','Rank rises'],['falls','Rank falls'],['xp-streak','XP streaks'],['boss-streak','Boss streaks']],data.sort)}</select></label>
      <label>Player timeline<input name="username" maxlength="12" placeholder="All players" value="${escape(data.username)}"></label>
      <button class="button" type="submit">Show</button>${data.username?'<button class="button subtle" id="history-clear" type="button">All players</button>':''}
    </form>
    <p class="history-note">UTC calendar days · ${escape(data.from)} to ${escape(data.day)} · Published ${date(data.generatedAt)}<br>Tracking since ${date(data.startedAt)}. The current day and the first tracked day are partial. XP and KC accumulate; losses below refer to rank places. No earlier gains are reconstructed.</p>
    ${stats([[metric.unit+' gained',number(data.totalGain)],['Total levels gained',number(data.totalLevels)],['Players listed',number(data.total)]], 'history-summary')}
    <section class="panel"><div class="panel-heading"><h2>${data.username?escape(data.username)+' · ':''}${escape(metric.name)} by day</h2></div>${chart}
      <details class="history-note"><summary>Daily totals</summary><div class="table-scroll" tabindex="0"><table><thead><tr><th>UTC day</th><th class="numeric">${metric.unit} gained</th><th class="numeric">Total levels gained</th>${data.username?'<th class="numeric">Start rank</th><th class="numeric">End rank</th><th class="numeric">Rank change</th>':''}</tr></thead><tbody>${data.series.map(p=>`<tr><td>${escape(p.day)}</td><td class="numeric">${signed(p.gain)}</td><td class="numeric">${signed(p.levels)}</td>${data.username?`<td class="numeric">${p.startRank?number(p.startRank):'—'}</td><td class="numeric">${p.endRank?number(p.endRank):'—'}</td><td class="numeric">${move(p.movement)}</td>`:''}</tr>`).join('')}</tbody></table></div></details>
    </section>
    <section class="panel"><div class="panel-heading"><h2>${escape(metric.name)} · ${data.username?'Player timeline':'Gains & movement'}</h2></div>
      <div class="table-scroll" role="region" aria-label="Progress leaderboard" tabindex="0"><table><thead><tr><th>Player</th><th class="numeric">${metric.unit} gained</th><th class="numeric">Start rank</th><th class="numeric">End rank</th><th class="numeric">Rank change</th><th class="numeric">XP streak</th><th class="numeric">Boss streak</th></tr></thead><tbody>${data.players.length?data.players.map(p=>`<tr><td>${player(p.username)} <a class="timeline-link" aria-label="View ${escape(p.username)} timeline" href="#progress?${new URLSearchParams({days:String(data.days),metric:metric.key,username:p.username})}">↗</a></td><td class="numeric">${signed(p.gain)}</td><td class="numeric">${p.startRank?number(p.startRank):'—'}</td><td class="numeric">${p.endRank?number(p.endRank):'—'}</td><td class="numeric">${move(p.movement)}</td><td class="numeric">${number(p.xpStreak)}d</td><td class="numeric">${number(p.bossStreak)}d</td></tr>`).join(''):'<tr><td colspan="7" class="table-empty">No matching activity recorded. Try another category or period.</td></tr>'}</tbody></table></div>
      <div class="pagination"><span>${number(data.total)} players · Page ${data.page} of ${data.pages}</span><div><button class="button subtle" id="history-prev" ${data.page<=1?'disabled':''}>Previous</button><button class="button subtle" id="history-next" ${data.page>=data.pages?'disabled':''}>Next</button></div></div>
    </section>
    <section class="panel"><div class="panel-heading"><h2>World records</h2></div>${recordsTable}<p class="history-note">Daily records include partial days. Rank records keep the largest observed move from the day’s opening rank. Training streaks count consecutive UTC days with XP or KC gains; a single-session record uses one simulation update.</p></section>
    <section class="panel"><div class="panel-heading"><h2>${escape(metric.name)} · Rank-one streaks</h2></div><div class="table-scroll" tabindex="0"><table><thead><tr><th>Streak</th><th>Player</th><th class="numeric">Observed duration</th><th>Held since</th></tr></thead><tbody>${[['Current',data.leaders?.[metric.key]],['Longest',data.reigns?.[metric.key]]].map(([label,r])=>`<tr><td>${label}</td><td>${r?player(r.username):'—'}</td><td class="numeric">${reign(r)}</td><td>${r?date(r.since):'—'}</td></tr>`).join('')}</tbody></table></div><p class="history-note">Measured between captured updates. Ties follow the live hiscores ordering. Earlier reigns are unknown.</p></section>`;
  view.querySelector('#history-filters').addEventListener('submit',event=>{event.preventDefault();change(Object.fromEntries(new FormData(event.currentTarget)));});
  for (const select of view.querySelectorAll('#history-filters select')) select.addEventListener('change',()=>view.querySelector('#history-filters').requestSubmit());
  view.querySelector('#history-clear')?.addEventListener('click',()=>change({username:''}));
  view.querySelector('#history-prev').addEventListener('click',()=>change({page:String(data.page-1)}));
  view.querySelector('#history-next').addEventListener('click',()=>change({page:String(data.page+1)}));
}
