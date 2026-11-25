import { request } from './api.js';
import { BOSS_BY_KEY } from './activities.js';

export async function collectionView({ current, signal, isCurrent, view, escape, number, date, playerLink, pageHeading }) {
  const data = await request('/api/collections', {signal});
  if (!isCurrent()) return;
  const hall = data.hall;
  const heading = pageHeading('Drops have a history', 'The collection hall', 'Open a cabinet. Find an unclaimed treasure. Follow the next discovery.');
  if (!hall) { view.innerHTML = `${heading}<p class="history-note">The hall opens after the next scheduled update. <a href="#world">Explore world watch ↗</a></p>`; return; }
  view.innerHTML = `${heading}<section class="panel"><div class="panel-heading"><h2>Whose cabinet?</h2><a href="#stories">Explore world discoveries ↗</a></div><form id="cabinet-form" class="filter-bar"><label class="search-filter">Adventurer<input id="cabinet-name" placeholder="Exact player name" maxlength="80" required></label><button class="button" type="submit">Open cabinet</button><button class="button" type="button" id="cabinet-world">Whole world</button></form><p id="cabinet-status" class="history-note" role="status">Showing discoveries across ${number(hall.population)} adventurers. Purchases and opening banks do not count.</p><div class="collection-leaders">${hall.leaders.map(row=>`<button type="button" class="button cabinet-pick" data-name="${escape(row.username)}">${escape(row.username)} · ${row.found + row.relics}</button>`).join('')}</div></section>
    <section class="panel"><div class="panel-heading"><h2>Expedition atlas</h2><span>${hall.relics.length} encounters · ${hall.relics.length} keepsakes</span></div><p class="history-note">Simulation-only relics, earned from future completed encounters. Each encounter has its own relic, with an average of 40 ordinary boss-hours per discovery before activity scaling. Luck varies. Relics cannot be bought, sold or equipped; older KC grants none.</p><div id="relic-atlas" class="relic-atlas"></div></section>
    <section class="panel"><div class="panel-heading"><h2>Rare reward cabinet</h2><span>${hall.rewards.length} modeled rewards</span></div><div class="filter-bar"><label class="search-filter">Find a reward<input id="reward-search" type="search" placeholder="Item or encounter"></label><label>Show<select id="reward-filter"><option value="all">All rewards</option><option value="found">Discovered</option><option value="missing">Still missing</option></select></label><label>Order<select id="reward-order"><option value="rare">Fewest collectors</option><option value="recent">Latest discovery</option><option value="name">Item name</option></select></label></div><p class="history-note">Recorded personal drops, including items later sold. Selected tradeable rewards only; this is not the full OSRS collection log. Discovery tracking starts when the relevant feature was introduced.</p><div id="reward-cabinet" class="reward-cabinet"></div></section>`;
  let player = null, requestId = 0;
  const source = key => BOSS_BY_KEY[key]?.name || 'Treasure trails';
  const render = () => {
    view.querySelector('#relic-atlas').innerHTML = hall.relics.map(row => {
      const owned = player ? !!player.expedition?.relics?.[row.key] : row.collectors > 0;
      return `<a class="relic-tile ${owned ? 'discovered' : ''}" href="#bosses?boss=${row.key}" title="${escape(source(row.key))}"><span aria-hidden="true">${owned ? '◆' : '◇'}</span><strong>${escape(source(row.key))}</strong><small>${player ? owned ? 'In this cabinet' : 'Undiscovered' : `${number(row.collectors)} collectors`}</small></a>`;
    }).join('');
    const query = view.querySelector('#reward-search').value.trim().toLowerCase();
    const filter = view.querySelector('#reward-filter').value;
    const order = view.querySelector('#reward-order').value;
    const count = row => player ? player.economy?.rareFinds?.[row.id]?.quantity || 0 : row.collectors;
    const rows = hall.rewards.filter(row => `${row.name} ${row.sources.map(source).join(' ')}`.toLowerCase().includes(query) && (filter === 'all' || (filter === 'found' ? count(row)>0 : !count(row))));
    rows.sort((a,b) => (order === 'name' ? 0 : order === 'recent' ? (b.latest?.timestamp||0)-(a.latest?.timestamp||0) : count(a)-count(b)) || a.name.localeCompare(b.name));
    view.querySelector('#reward-cabinet').innerHTML = rows.map(row => `<article class="reward-slot ${count(row) ? 'discovered' : ''}"><div class="eyebrow">${count(row) ? 'Discovered' : 'Unclaimed'}</div><h3>${escape(row.name)}</h3><p>${row.sources.map(key=>`<a href="#bosses?boss=${key}">${escape(source(key))}</a>`).join(' · ')}</p><strong>${number(count(row))} ${player ? 'personal drops' : 'collectors'}</strong>${!player ? `<meter aria-label="Collectors of ${escape(row.name)}" min="0" max="${Math.max(1,hall.population)}" value="${row.collectors}"></meter>` : ''}${row.latest ? `<p class="history-note">Latest world find: <a href="${playerLink(row.latest.username)}">${escape(row.latest.username)}</a> · ${date(row.latest.timestamp)}</p>` : '<p class="history-note">No recorded world discovery yet.</p>'}</article>`).join('') || '<p class="history-note">No matching rewards. Try another filter.</p>';
  };
  const status = view.querySelector('#cabinet-status');
  const open = async name => {
    const id = ++requestId;
    status.textContent = `Opening ${name}…`;
    try {
      const user = await request(`/api/users/${encodeURIComponent(name)}`,{signal});
      if (!isCurrent() || id !== requestId) return;
      player = user;
      status.textContent = `${user.username} · ${Object.values(user.economy?.rareFinds || {}).filter(r=>r.quantity>0).length} rare rewards · ${Object.keys(user.expedition?.relics || {}).length} relics. Cabinet captured ${date(user.generatedAt)}.`;
      view.querySelector('#cabinet-name').value = user.username;
      render();
    } catch (error) { if (isCurrent() && id === requestId) status.textContent = error.message; }
  };
  view.querySelector('#cabinet-form').addEventListener('submit',event=>{event.preventDefault();open(view.querySelector('#cabinet-name').value.trim());});
  for (const button of view.querySelectorAll('.cabinet-pick')) button.addEventListener('click',()=>open(button.dataset.name));
  view.querySelector('#cabinet-world').addEventListener('click',()=>{requestId++;player=null;status.textContent=`Showing discoveries across ${number(hall.population)} adventurers.`;render();});
  for (const id of ['reward-search','reward-filter','reward-order']) view.querySelector('#'+id).addEventListener('input',render);
  render();
  if (current?.params?.get('username')) await open(current.params.get('username'));
}
