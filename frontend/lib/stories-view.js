import { request } from './api.js';
import { discoveryArticle } from './discovery-view.js';

export async function storiesView(ctx) {
  const {signal,isCurrent,view,escape,number,date,playerLink,pageHeading,current}=ctx;
  const data=await request('/api/discoveries',{signal});
  if (!isCurrent()) return;
  const selected=current?.params.get('username') || '';
  view.innerHTML=`${pageHeading('The Gielinor field journal','World discoveries','Follow changing fortunes, unusual days and the consequences of life in this world.')}<section class="panel"><div class="panel-heading"><h2>Worth investigating</h2><span class="updated">Updated ${date(data.generatedAt)}</span></div><div class="filter-bar"><label>Show<select id="discovery-kind"><option value="">All discoveries</option><option value="market">Market movements</option><option value="windfall">Windfalls</option><option value="unusual-income">Financial outliers</option><option value="after-purchase">Player histories</option></select></label><label class="search-filter">Player<input id="discovery-player" type="search" placeholder="Player name" value="${escape(selected)}"></label></div><p class="history-note">A developing journal of the past seven days. Market stories require a full day of prices; financial outliers need seven complete days of personal history. Routine milestones stay in player records.</p><div id="discoveries"></div></section>`;
  const render=()=>{
    const kind=view.querySelector('#discovery-kind').value, query=view.querySelector('#discovery-player').value.trim().toLowerCase();
    const rows=data.discoveries.filter(r=>(!kind || r.kind===kind) && (!query || r.username?.toLowerCase().includes(query)));
    view.querySelector('#discoveries').innerHTML=rows.length ? rows.map(row=>discoveryArticle(row,{escape,number,date,playerLink})).join('') : '<p class="history-note">No qualifying discoveries in this selection yet. <a href="#economy">Explore item trends</a> or <a href="#world">inspect current activity</a> while observations accumulate.</p>';
  };
  view.querySelector('#discovery-kind').addEventListener('change',render);
  view.querySelector('#discovery-player').addEventListener('input',render);render();
}
