import { title } from "./domain.js";
import items from './items.js';
import { BOSS_BY_KEY } from './activities.js';

export function bankView(user, { number, escape, date }) {
  const e = user.economy;
  const benefits = user.progress?.lastSession?.benefits;
  const holdings = Object.entries(e.holdings || {}).filter(([,n]) => n > 0)
    .map(([id,quantity]) => ({id,quantity,name:items[id]?.name || `Item ${id}`,value:quantity*(items[id]?.price || 0)}))
    .sort((a,b) => b.value-a.value || a.name.localeCompare(b.name));
  const row = item => `<tr><th scope="row">${escape(item.name)}</th><td class="numeric">${number(item.quantity)}</td><td class="numeric">${number(item.value)}</td><td class="numeric">${number(e.rareFinds?.[item.id]?.quantity || 0)}</td><td class="numeric">${e.bankValue ? (item.value/e.bankValue*100).toFixed(1) : '0'}%</td></tr>`;
  const table = rows => `<div class="table-scroll" role="region" aria-label="Bank items" tabindex="0"><table><thead><tr><th>Item</th><th class="numeric">Quantity</th><th class="numeric">Value (GP)</th><th class="numeric">Lifetime finds</th><th class="numeric">Bank share</th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table></div>`;
  return `<section class="panel bank-view"><div class="panel-heading"><h2>Inside the bank</h2><span class="updated">Fixed catalog estimates</span></div>
    <p class="history-note">Cash: <strong>${number(e.cash)} GP</strong> · ${number(holdings.length)} different items. ${e.bankValue===0?'This bank is empty. Training and bossing continue; only affordable costs are paid.':''}</p>
    ${holdings.length?table(holdings.slice(0,10)):'<p class="history-note">No items held.</p>'}
    ${holdings.length>10?`<details class="history-note"><summary>Show ${number(holdings.length-10)} more items</summary>${table(holdings.slice(10))}</details>`:''}
    <p class="history-note">Wealth and retained upgrades can improve future sessions. Ordinary XP continues with an empty bank. Rare items are kept until a voluntary sale; routine costs never redeem them. Lifetime finds count personal drops, including those later sold; purchases do not count as discoveries.${benefits ? ` Latest training bonus: <strong>+${((benefits.multiplier-1)*100).toFixed(1)}%</strong> (wealth ${(benefits.wealth*100).toFixed(1)}%, upgrades ${(benefits.equipment*100).toFixed(1)}%, funded methods ${(benefits.funded*100).toFixed(1)}%).` : ''}</p>
    <p class="history-note">Income is a lifetime counter, not the current balance. Spending, legacy revaluations and asset sinks affect what remains. Estimated costs left unpaid: ${number(e.unpaidCosts || 0)} GP ${e.costTrackingFrom?`since ${date(e.costTrackingFrom)}`:"since cost tracking began"}. Asset ceiling sinks: ${number(e.flows?.capSink || 0)} GP.</p></section>
    <section class="panel loot-log"><div class="panel-heading"><h2>Notable loot</h2><span class="updated">Latest eight recorded rewards</span></div>
    ${(e.notableLoot || []).length?`<ol class="story-list">${e.notableLoot.map(drop=>`<li><strong>${number(drop.quantity)} × ${escape(items[drop.itemId]?.name || `Item ${drop.itemId}`)}</strong><p>${escape(BOSS_BY_KEY[drop.boss]?.name || title(drop.boss))} · ${number(drop.value)} GP · ${number(drop.kc)} ${escape(drop.countUnit || "KC")} when recorded</p><time>${date(drop.timestamp)}</time></li>`).join('')}</ol>`:'<p class="history-note">New notable drops will appear here. Existing holdings do not establish when or how an item arrived.</p>'}</section>
    <section class="panel"><div class="panel-heading"><h2>Rare item trades</h2><span class="updated">Latest eight exchanges</span></div><p class="history-note">Player trades and outside sales use fixed estimates. Sellers pay 2% tax; purchases use available cash. Sold items leave the bank, while kept upgrades remain available for progression.</p>
    ${(e.trades || []).length ? `<ol class="story-list">${e.trades.map(trade=>`<li><strong>${trade.side==='buy'?'Bought':'Sold'} ${escape(items[trade.itemId]?.name || 'a rare item')}</strong><p>${escape(trade.counterparty)} · ${number(trade.price)} GP${trade.tax ? ` · ${number(trade.tax)} GP tax` : ''}</p><time>${date(trade.timestamp)}</time></li>`).join('')}</ol>` : '<p class="history-note">No recorded rare item trades yet.</p>'}</section>`;
}
