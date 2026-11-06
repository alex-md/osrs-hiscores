import { request } from './api.js';
import items from './items.js';
const percent = n => `${n>0?'+':''}${(n || 0).toFixed(1)}%`;
function trend(history, escape) {
  if (!history?.length) return '—';
  const values = history.map(row=>row[1]), low = Math.min(...values), high = Math.max(...values);
  const points = values.map((value,i)=>`${i*100/Math.max(1,values.length-1)},${25-(value-low)/Math.max(1,high-low)*22}`).join(' ');
  return `<svg width="100" height="28" viewBox="0 0 100 28" role="img" aria-label="${escape(`Price trend from ${values[0]} to ${values.at(-1)} GP`)}"><polyline fill="none" stroke="currentColor" stroke-width="1.5" points="${points}" /></svg>`;
}
export function economyTable(economy, {escape,number}, query='', sort='movers') {
  const rows = Object.entries(economy.items).filter(([id]) => (items[id]?.name || id).toLowerCase().includes(query.toLowerCase()));
  rows.sort(([a,x],[b,y]) => sort==='name' ? (items[a]?.name || a).localeCompare(items[b]?.name || b) : sort==='price' ? y.price-x.price : Math.abs(y.dayChangePct)-Math.abs(x.dayChangePct) || (items[a]?.name || a).localeCompare(items[b]?.name || b));
  if (!rows.length) return '<p class="history-note">No matching items.</p>';
  return `<div class="table-scroll" role="region" aria-label="Item economy prices" tabindex="0"><table><thead><tr><th>Item</th><th class="numeric">Price (GP)</th><th class="numeric">Last update</th><th class="numeric">24h change</th><th>Price trend</th><th>Pressure</th><th class="numeric">New supply</th><th class="numeric">Demand*</th></tr></thead><tbody>${rows.map(([id,row])=>`<tr><th scope="row">${escape(items[id]?.name || id)}</th><td class="numeric">${number(row.price)}</td><td class="numeric">${percent(row.changePct)}</td><td class="numeric">${percent(row.dayChangePct)}</td><td>${trend(row.history,escape)}</td><td>${escape(row.driver)}</td><td class="numeric">${number(row.produced)}</td><td class="numeric">${number(Math.round(row.demand+row.upgradeDemand))}</td></tr>`).join('')}</tbody></table></div>`;
}
export async function economyView({signal,isCurrent,view,escape,number,date,pageHeading}) {
  const {economy} = await request('/api/economy',{signal});
  if (!isCurrent()) return;
  view.innerHTML = `${pageHeading('Supply, demand & wealth','Item economy','Every drop adds supply. Training uses supplies. Players seek upgrades. Prices follow the balance.')}
    <section class="panel"><div class="panel-heading"><h2>Item prices</h2><span class="updated">${economy ? `Updated ${date(economy.capturedAt)}` : 'Awaiting the next world update'}</span></div>
    <p class="history-note">Prices update every 15 minutes and change the value of items in player banks. Trades use these quotes; sellers pay 2% tax. ${economy ? `Coin inflation factor: ${economy.inflation.toFixed(2)}× opening conditions.` : ''}</p>
    ${economy ? '<div class="filter-bar"><label class="search-filter">Find an item <input id="economy-search" type="search" placeholder="Item name" /></label><label>Sort <select id="economy-sort"><option value="movers">Biggest movers</option><option value="price">Highest price</option><option value="name">Item name</option></select></label></div><div id="economy-table"></div>' : '<p>Prices begin with the first scheduled economy update.</p>'}
    <p class="history-note">*Demand combines estimated supply use from paid activity costs and affordable upgrade interest; it is not a count of completed trades. New supply counts items produced in the latest session. Trends retain up to 24 hours; younger markets show their available history. These are prices within this simulated world. Training and bossing continue even when a bank is empty.</p></section>`;
  if (economy) {
    const render = () => { view.querySelector('#economy-table').innerHTML = economyTable(economy,{escape,number},view.querySelector('#economy-search').value,view.querySelector('#economy-sort').value); };
    view.querySelector('#economy-search').addEventListener('input',render);
    view.querySelector('#economy-sort').addEventListener('change',render);
    render();
  }
}
