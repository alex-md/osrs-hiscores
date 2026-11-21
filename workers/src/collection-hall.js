import items from '../../frontend/lib/items.js';
import { BOSSES } from '../../frontend/lib/activities.js';
import { bossDropTable } from './economy.js';

export function buildCollectionHall(users) {
  const rewards = new Map();
  for (const boss of BOSSES) for (const drop of bossDropTable(boss).filter(row => row.rare)) {
    const id = String(drop.id);
    if (!items[id]) continue;
    if (!rewards.has(id)) rewards.set(id, { id, name: items[id].name, sources: [], collectors: 0, quantity: 0, latest: null });
    rewards.get(id).sources.push(boss.key);
  }
  rewards.set('2577', { id:'2577', name:items['2577'].name, sources:['treasure-trails'], collectors:0, quantity:0, latest:null });
  const relics = BOSSES.map(boss => ({ key: boss.key, collectors: 0, latest: null }));
  const leaders = [];
  for (const user of users) {
    let found = 0, relicCount = 0;
    for (const row of rewards.values()) {
      const find = user.economy?.rareFinds?.[row.id];
      if (!(find?.quantity > 0)) continue;
      row.collectors++;
      row.quantity += find.quantity;
      found++;
      if (find.lastAt > (row.latest?.timestamp || 0)) row.latest = { username: user.username, timestamp: find.lastAt };
    }
    for (const row of relics) {
      const timestamp = user.expedition?.relics?.[row.key];
      if (!timestamp) continue;
      row.collectors++;
      relicCount++;
      if (timestamp > (row.latest?.timestamp || 0)) row.latest = { username: user.username, timestamp };
    }
    if (found || relicCount) leaders.push({ username: user.username, found, relics: relicCount });
  }
  leaders.sort((a,b) => b.found + b.relics - a.found - a.relics || a.username.localeCompare(b.username));
  return { population: users.length, rewards: [...rewards.values()], relics, leaders: leaders.slice(0,12) };
}
