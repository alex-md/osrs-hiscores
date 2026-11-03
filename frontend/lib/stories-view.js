import { request } from './api.js';
import items from './items.js';
import { BOSS_BY_KEY } from './activities.js';
import { title } from './domain.js';
import { catalog } from './catalog.js';

export async function storiesView({signal,isCurrent,view,escape,number,date,playerLink,pageHeading}) {
  const data = await request('/api/stories', {signal});
  if (!isCurrent()) return;
  const player = name => `<a href="${playerLink(name)}">${escape(name)}</a>`;
  const metric = key => key === 'overall' ? 'overall rankings' : key === 'activity:bank' ? 'wealth rankings' : key === 'activity:bosses' ? 'total boss count' : title(key);
  const describe = story => story.kind === 'loot'
    ? `${player(story.username)} found <strong>${number(story.quantity)} × ${escape(items[story.itemId]?.name || 'a rare item')}</strong><p>${escape(BOSS_BY_KEY[story.boss]?.name || title(story.boss))} · ${number(story.value)} GP · ${number(story.kc)} ${escape(story.countUnit || "KC")} when recorded</p>`
    : story.kind === 'boss-milestone' ? `${player(story.username)} reached <strong>${number(story.value)} ${escape(BOSS_BY_KEY[story.boss]?.name || title(story.boss))} ${BOSS_BY_KEY[story.boss]?.unit || 'kills'}</strong>.`
    : story.kind === 'crown' ? `${player(story.username)} took the <strong>${escape(metric(story.metric))}</strong> crown from ${player(story.previous)}.`
    : `${player(story.username)} reached <strong>${escape(catalog().find(item=>item.key===story.key)?.name || title(story.key))}</strong>.`;
  view.innerHTML = `${pageHeading('The world noticeboard','World stories','New crowns, unlikely loot and the race to the final cape.')}
    <section class="panel noticeboard"><div class="panel-heading"><h2>Rivals to watch</h2><span class="updated">Updated ${date(data.generatedAt)}</span></div>
    <div class="rivalries">${data.races.map(race=>`<article><div class="eyebrow">${escape(metric(race.metric))}</div><h3>${player(race.first)} <span>vs</span> ${player(race.second)}</h3><p>${number(race.gap)} ${race.metric==='overall'?'levels':race.metric==='activity:bank'?'GP':'kills / completions'} apart${race.xpGap!==null?` · ${number(race.xpGap)} XP breaks the level tie`:''}.</p></article>`).join('')}</div></section>
    <section class="panel"><div class="panel-heading"><h2>The race to max</h2><a href="#overall">View the ladder ↗</a></div><ol class="max-race">${data.contenders.map(p=>`<li>${player(p.username)}<span>${number(p.totalLevel)} / 2,376 · ${number(2376-p.totalLevel)} levels to go</span><progress aria-label="${escape(p.username)} total level" max="2376" value="${p.totalLevel}"></progress></li>`).join('')}</ol></section>
    <section class="panel"><div class="panel-heading"><h2>From around the world</h2><span class="updated">Latest 48 events</span></div>${data.stories.length?`<ol class="story-list">${data.stories.map(story=>`<li><span class="story-kind">${story.kind==='loot'?'Loot':story.kind==='crown'?'New crown':'Milestone'}</span><div>${describe(story)}</div><time>${date(story.timestamp)}</time></li>`).join('')}</ol>`:'<p class="history-note">The noticeboard starts with the next new crown, notable drop or rare milestone. Earlier events are not reconstructed.</p>'}</section>`;
}
