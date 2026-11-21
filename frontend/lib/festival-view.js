import { request } from './api.js';
import { title } from './domain.js';

export async function festivalView({ signal, isCurrent, view, escape, number, date, playerLink, pageHeading }) {
  const data = await request('/api/festival', { signal });
  if (!isCurrent()) return;
  const f = data.festival;
  const heading = pageHeading('A fresh race every Monday', 'Gielinor festival', 'Lifetime legends keep their crowns. This week starts from zero.');
  if (!f) { view.innerHTML = `${heading}<p class="history-note">The festival opens after the next scheduled world update. <a href="#world">Explore world watch ↗</a></p>`; return; }
  const names = { xp: 'The weekly sprint', skill: `${title(f.skill)} spotlight`, bosses: 'The great hunt', discoveries: 'First discoveries' };
  const units = { xp: 'XP earned', skill: `${title(f.skill)} XP`, bosses: 'kills / completions', discoveries: 'new rare items + relics' };
  view.innerHTML = `${heading}<section class="panel festival-banner"><div><div class="eyebrow">This week’s spotlight</div><h2>${escape(title(f.skill))} · +15% training XP</h2><p>Adventurers are more likely to choose this skill. Supplies, rest and the 200M cap still apply.</p></div><div><strong>Closes ${new Date(f.end).toUTCString()}</strong><p>Scores captured ${date(f.capturedAt)}</p></div></section>
    <p class="history-note">Scoring observed from ${date(f.observedFrom)}. Sessions count when completed; no past gains are backfilled. Newcomers joined within 14 days before this week began or during this week. <a href="#collections">Explore the collection hall ↗</a></p>
    <div class="filter-bar"><label>Division<select id="festival-division"><option value="open">Open · everyone</option><option value="newcomers">Newcomers</option></select></label><label>Follow a racer<input id="festival-search" type="search" placeholder="Highlight a name"></label></div><div id="festival-races" class="festival-races"></div>
    <section class="panel"><div class="panel-heading"><h2>The honours book</h2></div><p class="history-note">Last observed leaders from the eight most recent recorded weeks. Missed weeks are not invented. Equal scores use name order. Each race and division awards a separate honour.</p>${f.archive.length ? f.archive.map(week => `<details><summary>Week of ${new Date(week.start).toISOString().slice(0,10)} · ${escape(title(week.skill))}</summary><p class="history-note">Last capture ${date(week.observedAt)}</p>${Object.entries(week.divisions).map(([division,tracks]) => `<h3>${division === 'open' ? 'Open' : 'Newcomers'}</h3><ul>${Object.entries(tracks).map(([key,track]) => `<li>${escape(key === 'skill' ? title(week.skill)+' spotlight' : names[key])}: ${track.leaders[0] ? `<a href="${playerLink(track.leaders[0].username)}">${escape(track.leaders[0].username)}</a> · ${number(track.leaders[0].score)}` : 'No scored sessions'}</li>`).join('')}</ul>`).join('')}</details>`).join('') : '<p class="history-note">The first honours will be recorded after this week closes.</p>'}</section>`;
  const render = () => {
    const tracks = f.divisions[view.querySelector('#festival-division').value];
    const query = view.querySelector('#festival-search').value.trim().toLowerCase();
    view.querySelector('#festival-races').innerHTML = Object.entries(tracks).map(([key,track]) => `<section class="panel race-card"><div class="panel-heading"><h2>${escape(names[key])}</h2><span>${number(track.participants)} contenders</span></div><p class="history-note">${number(track.total)} ${escape(units[key])} across this division</p><ol class="race-lanes">${track.leaders.map((row,i) => `<li class="${query && row.username.toLowerCase().includes(query) ? 'racer-highlight' : ''}"><div><span class="race-position">${i+1}</span><a href="${playerLink(row.username)}">${escape(row.username)}</a><strong>${number(row.score)}</strong></div><meter min="0" max="${track.leaders[0].score}" value="${row.score}" aria-label="${escape(row.username)}: ${number(row.score)} ${escape(units[key])}"></meter>${i ? `<small>${number(track.leaders[0].score-row.score)} behind the lead</small>` : '<small>Current leader</small>'}</li>`).join('')}</ol>${track.leaders.length ? '<p class="history-note">Leading eight shown. Equal scores use name order.</p>' : '<p class="history-note">An open field. The first earned progress starts this race.</p>'}</section>`).join('');
  };
  view.querySelector('#festival-division').addEventListener('change',render);
  view.querySelector('#festival-search').addEventListener('input',render);
  render();
}
