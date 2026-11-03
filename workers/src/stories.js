export function buildStories(profiles, rankings, events, previous, now) {
  const leaders = Object.fromEntries(Object.entries(rankings).filter(([key]) => key === 'overall' || !key.includes(':') || key === 'activity:bosses' || key === 'activity:bank')
    .map(([key, rows]) => [key, rows[0]?.username || null]));
  const fresh = [];
  const add = story => fresh.push({ ...story, id: `${story.kind}:${story.metric || story.itemId || story.key || ''}:${story.username}:${story.timestamp}` });
  if (previous) {
    for (const [metric, username] of Object.entries(leaders)) {
      const former = previous.storyLeaders?.[metric];
      if (username && former && former !== username)
        add({ kind: 'crown', metric, username, previous: former, timestamp: now });
    }
    for (const user of profiles) {
      for (const loot of user.economy?.notableLoot || [])
        if (loot.timestamp > previous.generatedAt) add({ ...loot, kind: 'loot', username: user.username });
      const milestone = user.career?.lastBossMilestone;
      if (milestone?.timestamp > previous.generatedAt)
        add({ ...milestone, metric:milestone.boss, kind:'boss-milestone', username:user.username });
    }
    for (const event of events) {
      if (!['maxed-account','total-2376','xp-billionaire'].includes(event.key) && !event.key.startsWith('skill-master-')) continue;
      const count = profiles.filter(p => p.achievements[event.key]).length;
      if (['maxed-account', 'total-2376', 'xp-billionaire'].includes(event.key) ||
          (event.key.startsWith('skill-master-') && count <= Math.max(3, profiles.length * .01)))
        add({ ...event, kind: 'milestone' });
    }
  }
  const seen = new Set();
  const stories = [...fresh.sort((a,b) => b.timestamp-a.timestamp || (b.value || 0)-(a.value || 0)), ...(previous?.stories || [])]
    .filter(event => !seen.has(event.id) && seen.add(event.id)).slice(0,48);
  const contenders = rankings.overall.slice(0,3).map(row => ({username:row.username,totalLevel:row.totalLevel,totalXP:row.totalXP,rank:row.rank}));
  const races = [];
  for (const metric of ['overall', 'activity:bosses', 'activity:bank']) {
    const [first, second] = rankings[metric];
    if (first && second) races.push({metric,first:first.username,second:second.username,
      gap:metric === 'overall' ? first.totalLevel-second.totalLevel : first.score-second.score,
      xpGap:metric === 'overall' && first.totalLevel===second.totalLevel ? first.totalXP-second.totalXP : null});
  }
  return { leaders, stories, contenders, races };
}
