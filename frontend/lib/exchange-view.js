import { compactGP } from './gp.js';
export function mountExchange(root, data, { escape, number, date, heading, updated, stats }) {
  const exact = n => `<span title="${number(n)}">${compactGP(n)}</span>`;
  const units = n => n == null ? "—" : number(n);
  const recorded = data.version >= 3;
  // Official item sprites use the same numeric item IDs as the simulation catalog.
  const icon = id => `<img class="ge-icon" alt="" width="32" height="32" loading="lazy" src="https://secure.runescape.com/m=itemdb_oldschool/obj_big.gif?id=${encodeURIComponent(id)}">`;
  root.innerHTML = `<section class="rankings-page ge-page">
    ${heading('Player market', 'Grand Exchange', 'Resources, supplies and equipment traded between simulated players.')}
    ${stats([['Items',number(data.items.length)],['Units traded · 24h',recorded ? number(data.items.reduce((sum, i) => sum + (i.volume24h || 0),0)) : '—'],['Sales this update',number(data.fills || 0)]], 'ranking-summary')}
    <section class="panel ranking-panel"><div class="panel-heading"><h2>Market prices</h2>${updated(data)}</div>
    <form class="filter-bar" id="ge-filters"><label class="search-filter">Find an item<input type="search" name="q" placeholder="Item name"></label><label>Show<select name="liquidity"><option value="all">All items</option><option value="traded">Traded in 24h</option><option value="quiet">No trades in 24h</option></select></label><label>Sort by<select name="sort"><option value="volume24h">24h volume</option><option value="name">Item name</option><option value="price">Price</option><option value="circulatingSupply">Circulating supply</option></select></label></form>
    <div class="table-scroll" role="region" aria-label="Grand Exchange prices" tabindex="0"><table class="ge-market"><thead><tr><th>Item</th><th class="numeric">Price · GP</th><th class="numeric">24h volume</th><th class="numeric">Circulating supply</th><th class="numeric">Buy units</th><th class="numeric">Sell units</th><th class="numeric">24h change</th><th>Last trade</th></tr></thead><tbody id="ge-items"></tbody></table></div></section>
    <p class="coverage-note">Volume counts individual items. Supply counts items held by players. Buy and sell units are unfilled orders, replaced at the next update. Prices change on completed trades; quiet items retain their last price or opening estimate. Sales have a 2% fee.<br>24h records begin ${date(data.statsStartedAt)}. A dash means there is not yet a full day of price history.</p>
    </section>`;
  const render = () => {
    const filters = new FormData(root.querySelector('#ge-filters'));
    const query = String(filters.get('q') || '').trim().toLowerCase(), liquidity = filters.get('liquidity'), sort = filters.get('sort');
    const items = data.items.filter(i => i.name.toLowerCase().includes(query) && (liquidity === 'all' || (liquidity === 'traded' ? i.volume24h > 0 : !i.volume24h)));
    items.sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name) : (b[sort] || 0) - (a[sort] || 0) || a.name.localeCompare(b.name));
    root.querySelector('#ge-items').innerHTML = items.map(i => `<tr><th scope="row"><span class="ge-item">${icon(i.id)}${escape(i.name)}</span></th><td class="numeric">${exact(i.price)}</td><td class="numeric">${units(i.volume24h)}</td><td class="numeric">${units(i.circulatingSupply)}</td><td class="numeric">${units(i.buyUnits)}</td><td class="numeric">${units(i.sellUnits)}</td><td class="numeric">${!recorded || i.change == null ? '—' : `${i.change > 0 ? '+' : ''}${i.change.toFixed(2)}%`}</td><td class="ge-time">${i.lastTrade ? date(i.lastTrade.timestamp) : 'No recorded trade'}</td></tr>`).join('') || '<tr><td colspan="8" class="table-empty">No items match these filters.</td></tr>';
  };
  for (const form of root.querySelectorAll('form')) {
    form.addEventListener('submit', e => e.preventDefault());
    form.addEventListener('input', render); form.addEventListener('change', render);
  }
  render();
}
