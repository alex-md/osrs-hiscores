import items from './items.js';
import { BOSS_BY_KEY } from './activities.js';
import { signed } from './finance-view.js';

export function discoveryArticle(row, {escape,number,date,playerLink}) {
  const player=name=>`<a href="${playerLink(name)}">${escape(name)}</a>`;
  const item=`<a href="#economy?item=${row.itemId}">${escape(items[row.itemId]?.name || 'Item')}</a>`;
  const boss=escape(BOSS_BY_KEY[row.boss]?.name || row.boss || 'encounter');
  let heading, evidence;
  if (row.kind==='market') {
    heading=`${item} ${row.changePct<0?'fell':'rose'} ${Math.abs(row.changePct).toFixed(1)}% over ${(row.windowHours || 24).toFixed(1)} hours`;
    evidence=`Now ${number(row.price)} GP. Model pressure: ${escape(row.driver)}. Inspect the price history and exposed banks; estimated demand is not completed trade volume.`;
  } else if (row.kind==='windfall') {
    heading=`A substantial find for ${player(row.username)}`;
    evidence=`${number(row.quantity)} × ${item} from ${boss}, valued at ${number(row.value)} GP when found: ${(row.share*100).toFixed(1)}% of their pre-session bank. Recorded at ${number(row.kc)} KC. This is a drop value, not cash proceeds.`;
  } else if (row.kind==='unusual-income') {
    heading=`An unusual financial day for ${player(row.username)}`;
    evidence=`${signed(row.flows)} GP in net asset flows so far on ${escape(row.day)}, compared with a median ${signed(row.baseline)} GP across ${row.samples} complete observed days. Excludes the price effect on starting holdings. Compare their fortune journal to see what changed.`;
  } else {
    heading=`After an equipment purchase, ${player(row.username)} returned to ${boss}`;
    evidence=`Bought ${item} from ${escape(row.counterparty)} for ${number(row.price)} GP on ${date(row.purchasedAt)}; later completed ${number(row.kills)} kills while still holding it. This records the sequence, without attributing the result to the purchase.`;
  }
  return `<article class="discovery-entry"><div class="discovery-stamp"><span class="story-kind">${escape({market:'Market movement',windfall:'Windfall','unusual-income':'Outlier','after-purchase':'Player history'}[row.kind])}</span><time>${date(row.timestamp)}</time></div><h2>${heading}</h2><p>${evidence}</p>${row.username ? `<a href="${playerLink(row.username)}?view=finances">Open player finances ↗</a>` : ''}</article>`;
}
