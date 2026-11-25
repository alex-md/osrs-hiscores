import { request } from './api.js';
import items from './items.js';
import { playerLink } from './presentation.js';
const percent = n => `${n>0?'+':''}${(n || 0).toFixed(1)}%`;
function trend(history, escape) {
  if (!history?.length) return '—';
  const values = history.map(row=>row[1]), low = Math.min(...values), high = Math.max(...values);
  const points = values.map((value,i)=>`${(history[i][0]-history[0][0])*100/Math.max(1,history.at(-1)[0]-history[0][0])},${25-(value-low)/Math.max(1,high-low)*22}`).join(' ');
  return `<svg width="100" height="28" viewBox="0 0 100 28" role="img" aria-label="${escape(`Price trend from ${values[0]} to ${values.at(-1)} GP`)}"><polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${points}" /></svg>`;
}
export function economyTable(economy, {escape,number}, query='', sort='movers') {
  const rows = Object.entries(economy.items).filter(([id]) => (items[id]?.name || id).toLowerCase().includes(query.toLowerCase()));
  rows.sort(([a,x],[b,y]) => sort==='name' ? (items[a]?.name || a).localeCompare(items[b]?.name || b) : sort==='price' ? y.price-x.price : Math.abs(y.dayChangePct)-Math.abs(x.dayChangePct) || (items[a]?.name || a).localeCompare(items[b]?.name || b));
  if (!rows.length) return '<p class="history-note">No matching items.</p>';
  return `<div class="table-scroll" role="region" aria-label="Item economy prices" tabindex="0"><table><thead><tr><th>Item</th><th class="numeric">Price (GP)</th><th class="numeric">Last update</th><th class="numeric">24h change</th><th>Price trend</th><th>Pressure</th><th class="numeric">New supply</th><th class="numeric">Demand*</th></tr></thead><tbody>${rows.map(([id,row])=>`<tr><th scope="row"><a href="#economy?item=${id}">${escape(items[id]?.name || id)}</a></th><td class="numeric">${number(row.price)}</td><td class="numeric">${percent(row.changePct)}</td><td class="numeric">${percent(row.dayChangePct)}</td><td>${trend(row.history,escape)}</td><td>${escape(row.driver)}</td><td class="numeric">${number(row.produced)}</td><td class="numeric">${number(Math.round(row.demand+row.upgradeDemand))}</td></tr>`).join('')}</tbody></table></div>`;
}
export async function economyView({signal,isCurrent,view,escape,number,date,pageHeading,current}) {
  const [{economy},{finance}] = await Promise.all([request('/api/economy',{signal}),request('/api/finance',{signal})]);
  if (!isCurrent()) return;
  view.innerHTML = `${pageHeading('Supply, demand & wealth','Item economy','Every drop adds supply. Training uses supplies. Players seek upgrades. Prices follow the balance.')}
    <div id="item-investigation"></div><section class="panel"><div class="panel-heading"><h2>Item prices</h2><span class="updated">${economy ? `Updated ${date(economy.capturedAt)}` : 'Awaiting the next world update'}</span></div>
    <p class="history-note">Prices update every 15 minutes and change the value of items in player banks. Trades use these quotes; sellers pay 2% tax. ${economy ? `Coin inflation factor: ${economy.inflation.toFixed(2)}× opening conditions.` : ''}</p>
    ${economy ? '<div class="filter-bar"><label class="search-filter">Find an item <input id="economy-search" type="search" placeholder="Item name" /></label><label>Sort <select id="economy-sort"><option value="movers">Biggest movers</option><option value="price">Highest price</option><option value="name">Item name</option></select></label></div><div id="economy-table"></div>' : '<p>Prices begin with the first scheduled economy update.</p>'}
    <p class="history-note">*Demand combines estimated supply use from paid activity costs and affordable upgrade interest; it is not a count of completed trades. New supply counts items produced in the latest session. Trends retain up to 24 hours; younger markets show their available history. These are prices within this simulated world. Training and bossing continue even when a bank is empty.</p></section>`;
  if (economy) {
    const render = () => { view.querySelector('#economy-table').innerHTML = economyTable(economy,{escape,number},view.querySelector('#economy-search').value,view.querySelector('#economy-sort').value); };
    view.querySelector('#economy-search').addEventListener('input',render);
    view.querySelector('#economy-sort').addEventListener('change',render);
    render();
    const selected=current?.params.get('item');
    const first=Object.keys(economy.items).sort((a,b)=>Math.abs(economy.items[b].dayChangePct)-Math.abs(economy.items[a].dayChangePct))[0];
    const id=Object.hasOwn(economy.items,selected) ? selected : first;
    const target=view.querySelector('#item-investigation');
    target.innerHTML=`<section class="panel item-investigation"><div class="panel-heading"><h2>Investigate an item</h2><a href="#stories">Follow market discoveries ↗</a></div><div class="filter-bar"><label class="search-filter">Item<select id="investigate-item">${Object.keys(economy.items).sort((a,b)=>(items[a]?.name || a).localeCompare(items[b]?.name || b)).map(key=>`<option value="${key}" ${key===id?'selected':''}>${escape(items[key]?.name || key)}</option>`).join('')}</select></label><label>History<select id="price-horizon"><option value="day">Past 24 hours</option><option value="month">Up to 35 days</option></select></label></div><div id="item-evidence"></div></section>`;
    const investigate=()=>{
      const key=view.querySelector('#investigate-item').value, row=economy.items[key], exposure=finance?.exposures[key];
      const history=view.querySelector('#price-horizon').value==='month' ? row.dailyHistory || [] : row.history || [];
      view.querySelector('#item-evidence').innerHTML=`<p><strong>${escape(items[key]?.name || key)} · ${number(row.price)} GP</strong> · ${percent(row.dayChangePct)} over available 24h quotes</p><div class="item-price-chart">${history.length>1 ? trend(history,escape) : '<p class="history-note">At least two observations are needed for this chart. Daily closing quotes accumulate from the next update.</p>'}</div>${history.length ? `<p class="history-note">${date(history[0][0])} to ${date(history.at(-1)[0])} · ${history.length} quotes. History starts when observed; gaps are not reconstructed.</p><details><summary>Price observations</summary><div class="table-scroll"><table><thead><tr><th>Observed</th><th class="numeric">Price (GP)</th></tr></thead><tbody>${[...history].reverse().map(([at,price])=>`<tr><td>${escape(new Date(at).toISOString())}</td><td class="numeric">${number(price)}</td></tr>`).join('')}</tbody></table></div></details>` : ''}<p class="history-note">Model pressure: <strong>${escape(row.driver)}</strong>. Latest session produced ${number(row.produced)} items; estimated paid demand ${number(Math.round(row.demand))}, upgrade interest ${number(Math.round(row.upgradeDemand))}. These estimates are not executed orders. Prices also respond to smoothed flows, holdings and coin conditions.</p><h3>Who is exposed?</h3>${exposure ? `<p class="history-note">${number(exposure.holders)} current holders · ${number(exposure.value)} GP in this item. Largest three positions shown; these are current holdings, not historical trading returns.</p><ul>${exposure.players.map(p=>`<li><a href="${playerLink(p.username)}?view=finances">${escape(p.username)}</a> · ${number(p.quantity)} items · ${number(p.value)} GP · ${(p.share*100).toFixed(1)}% of their bank</li>`).join('')}</ul>` : '<p class="history-note">No current player holdings recorded. Outside stock is separate.</p>'}`;
    };
    view.querySelector('#investigate-item').addEventListener('change',()=>{location.hash=`economy?item=${view.querySelector('#investigate-item').value}`;});
    view.querySelector('#price-horizon').addEventListener('change',investigate);investigate();
  }
}
