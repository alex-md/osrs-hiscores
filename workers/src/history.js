import { SKILLS } from './constants.js';
import { BOSSES } from '../../frontend/lib/activities.js';
import { PROGRESS_METRICS } from '../../frontend/lib/progress.js';
import { readJSON, writeJSON } from './store.js';
import { HttpError, json, integer } from './http.js';
const DAY = 86400000;
export const HISTORY_DAYS = 35;
const SHARD = 125;
const dayOf = time => new Date(time).toISOString().slice(0, 10);
const values = user => [user.totalXP, ...SKILLS.map(s => user.skills[s].xp), BOSSES.reduce((n,b) => n + (user.bosses?.[b.key] || 0), 0), ...BOSSES.map(b => user.bosses?.[b.key] || 0)];
const ranks = user => [user.rank, ...SKILLS.map(s => user.ranks[s]), user.activityRanks.bosses || null, ...BOSSES.map(b => user.activityRanks[b.key] || null)];
function record(records, key, value, username, day, timestamp) {
  if (value > 0 && (!records[key] || value > records[key].value)) records[key] = { value, username, day, timestamp };
}
function streak(prior, day, gained) {
  if (!gained) return prior?.day === day ? prior : { day: prior?.day || null, count: prior?.count || 0 };
  if (prior?.day === day) return prior;
  return { day, count: prior?.day === dayOf(Date.parse(day) - DAY) ? prior.count + 1 : 1 };
}
// Called before snapshot serialization. Tracking, records and the outbox commit
// atomically with the world. D1 publication happens only after that commit.
export async function stageHistory(env, profiles, generation, now) {
  if (!env.HISTORY_DB) return;
  const day = dayOf(now);
  const meta = await readJSON(env, 'history:meta', { startedAt: now, records: {}, leaders: {}, reigns: {} });
  const rows = [], currentLeaders = {};
  for (const user of profiles) {
    const v = values(user), r = ranks(user);
    r.forEach((rank,i) => { if (rank === 1) currentLeaders[PROGRESS_METRICS[i].key] = user.username; });
    let h = user.tracking;
    if (!h) h = { day, base: v, rankBase: r, last: v, lastRanks: r, levelBase: user.totalLevel, lastLevel: user.totalLevel, from: now, initial: v, initialRanks: r, initialAt: now, initialLevel: user.totalLevel };
    if (h.day !== day) h = { ...h, day, base: h.last, rankBase: h.lastRanks, levelBase: h.lastLevel, from: h.at };
    h.initial ||= h.base; h.initialRanks ||= h.rankBase;
    h.initialAt ??= h.from; h.initialLevel ??= h.levelBase;
    const gains = v.map((n,i) => n - h.base[i]);
    h.xpStreak = streak(h.xpStreak, day, gains[0] > 0);
    h.bossStreak = streak(h.bossStreak, day, gains[SKILLS.length + 1] > 0);
    const activeXP = h.xpStreak.day === day ? h.xpStreak.count : 0;
    const activeBoss = h.bossStreak.day === day ? h.bossStreak.count : 0;
    // Packed row: name, daily metric deltas, day-start ranks, current ranks,
    // level delta, XP/KC streaks, interval start/end, cumulative metrics,
    // initial metrics/ranks/time, current/initial total level.
    rows.push([user.username, gains, h.rankBase, r, user.totalLevel - h.levelBase, activeXP, activeBoss, h.from, now, v, h.initial, h.initialRanks, h.initialAt, user.totalLevel, h.initialLevel]);
    for (let i = 0; i < gains.length; i++) {
      const key = PROGRESS_METRICS[i].key;
      record(meta.records, `daily:${key}`, gains[i], user.username, day, now);
      if (h.rankBase[i] && r[i]) {
        record(meta.records, `climb:${key}`, h.rankBase[i] - r[i], user.username, day, now);
        record(meta.records, `fall:${key}`, r[i] - h.rankBase[i], user.username, day, now);
      }
    }
    const session = user.progress?.lastSession;
    if (session?.timestamp > (h.at || now)) record(meta.records, 'session:overall', session.gainedXP, user.username, day, session.timestamp);
    record(meta.records, 'streak:xp', activeXP, user.username, day, now);
    record(meta.records, 'streak:bosses', activeBoss, user.username, day, now);
    user.tracking = { ...h, last: v, lastRanks: r, lastLevel: user.totalLevel, at: now };
  }
  for (let i = 0; i < PROGRESS_METRICS.length; i++) {
    const key = PROGRESS_METRICS[i].key;
    const leader = currentLeaders[key];
    const previous = meta.leaders[key];
    if (!leader) { delete meta.leaders[key]; continue; }
    // Boss ladders exclude zero-KC players, as do the live rankings.
    const reign = previous?.username === leader ? previous : { username: leader, since: now };
    meta.leaders[key] = { ...reign, through: now };
    if (!meta.reigns[key] || now - reign.since > meta.reigns[key].through - meta.reigns[key].since)
      meta.reigns[key] = { ...reign, through: now };
  }
  const summary = { ...meta, day, generation, generatedAt: now, totalPlayers: profiles.length,
    playerShards: Object.fromEntries(rows.map((row,i)=>[row[0].toLowerCase(),Math.floor(i/SHARD)])),
    totals: PROGRESS_METRICS.map((_,i)=>rows.reduce((n,row)=>n+row[1][i],0)),
    xp: rows.reduce((n,r) => n+r[1][0],0), kc: rows.reduce((n,r) => n+r[1][SKILLS.length+1],0),
    levels: rows.reduce((n,r) => n+r[4],0), activePlayers: rows.filter(r => r[1][0] > 0 || r[1][SKILLS.length+1] > 0).length };
  const pending = await readJSON(env, 'history:pending', {});
  const count = Math.ceil(rows.length / SHARD);
  for (let i=count; i<(pending[day] || 0); i++) await env.WORLD_STORE.delete(`history:outbox:${day}:${i}`);
  for (let i=0; i<count; i++) await writeJSON(env, `history:outbox:${day}:${i}`, rows.slice(i*SHARD,(i+1)*SHARD));
  await writeJSON(env, `history:outbox:${day}:summary`, summary);
  const cutoff = dayOf(now - (HISTORY_DAYS-1)*DAY);
  for (const [oldDay, oldCount] of Object.entries(pending)) if (oldDay < cutoff) {
    for (let i=0;i<oldCount;i++) await env.WORLD_STORE.delete(`history:outbox:${oldDay}:${i}`);
    await env.WORLD_STORE.delete(`history:outbox:${oldDay}:summary`);
    delete pending[oldDay];
  }
  pending[day] = count;
  await writeJSON(env, 'history:pending', pending);
  await writeJSON(env, 'history:meta', meta);
}
export async function flushHistory(env) {
  if (!env.HISTORY_DB) return;
  const pending = await readJSON(env, 'history:pending', {});
  for (const [day, count] of Object.entries(pending).sort()) {
    const summary = await readJSON(env, `history:outbox:${day}:summary`);
    const statements = [];
    for (let i=0;i<count;i++) {
      const rows = await readJSON(env, `history:outbox:${day}:${i}`);
      if (!rows) throw new Error('Missing history outbox shard');
      statements.push(env.HISTORY_DB.prepare('INSERT INTO progress_players(day,shard,payload) VALUES(?,?,?) ON CONFLICT(day,shard) DO UPDATE SET payload=excluded.payload').bind(day,i,JSON.stringify(rows)));
    }
    statements.push(env.HISTORY_DB.prepare('DELETE FROM progress_players WHERE day = ? AND shard >= ?').bind(day,count));
    statements.push(env.HISTORY_DB.prepare('INSERT INTO progress_days(day,captured_at,generation,summary) VALUES(?,?,?,?) ON CONFLICT(day) DO UPDATE SET captured_at=excluded.captured_at,generation=excluded.generation,summary=excluded.summary WHERE excluded.captured_at >= progress_days.captured_at').bind(day,summary.generatedAt,summary.generation,JSON.stringify(summary)));
    const cutoff = dayOf(summary.generatedAt - (HISTORY_DAYS-1)*DAY);
    statements.push(env.HISTORY_DB.prepare('DELETE FROM progress_players WHERE day < ?').bind(cutoff));
    statements.push(env.HISTORY_DB.prepare('DELETE FROM progress_days WHERE day < ?').bind(cutoff));
    // Each day is an atomic batch. Replaying after a crash overwrites the same keys.
    await env.HISTORY_DB.batch(statements);
    for (let i=0;i<count;i++) await env.WORLD_STORE.delete(`history:outbox:${day}:${i}`);
    await env.WORLD_STORE.delete(`history:outbox:${day}:summary`);
    delete pending[day];
    await writeJSON(env, 'history:pending', pending);
    env.WORLD_STORE.commit();
  }
}
export async function historyResponse(request, env) {
  try {
    const url = new URL(request.url);
    const days = integer(url.searchParams.get('days'), 7, 1, 30, 'days');
    if (![1,7,30].includes(days)) throw new HttpError(400, 'Choose 1, 7 or 30 days.');
    const metric = url.searchParams.get('metric') || 'overall';
    const index = PROGRESS_METRICS.findIndex(m => m.key === metric);
    if (index < 0) throw new HttpError(400,'Unknown progress category.');
    const sort = url.searchParams.get('sort') || 'gains';
    if (!['gains','rises','falls','xp-streak','boss-streak'].includes(sort)) throw new HttpError(400,'Unknown progress order.');
    const page = integer(url.searchParams.get('page'),1,1,10000,'page');
    const username = url.searchParams.get('username') || '';
    if (username && !/^[a-zA-Z0-9_ -]{1,12}$/.test(username)) throw new HttpError(400,'Invalid player name.');
    if (!env.HISTORY_DB) return json({ available:false, reason:'Progress history is not connected yet.', players:[], series:[] });
    const latest = await env.HISTORY_DB.prepare('SELECT summary FROM progress_days ORDER BY day DESC LIMIT 1').first();
    if (!latest) return json({ available:true, collecting:true, players:[],series:[] });
    let meta = JSON.parse(latest.summary);
    // Read the selected day's metadata and payload in a single transaction.
    const [head, lastRows] = await env.HISTORY_DB.batch([
      env.HISTORY_DB.prepare('SELECT summary FROM progress_days WHERE day = ?').bind(meta.day),
      ...(!username ? [env.HISTORY_DB.prepare('SELECT payload FROM progress_players WHERE day = ? ORDER BY shard').bind(meta.day)] : []),
    ]);
    meta = JSON.parse(head.results[0].summary);
    const from = dayOf(Date.parse(meta.day) - (days-1)*DAY);
    const byName = new Map();
    const addDaily = (row,day) => {
      let player = byName.get(row[0]);
      if (!player) byName.set(row[0],player={username:row[0],gain:0,levels:0,startRank:row[2][index],fromAt:row[7]});
      player.gain+=row[1][index];player.levels+=row[4];player.endRank=row[3][index];player.throughAt=row[8];
      player.xpStreak=day===meta.day?row[5]:0;player.bossStreak=day===meta.day?row[6]:0;
    };
    let series;
    if (username) {
      const points = await env.HISTORY_DB.prepare('SELECT day, json_extract(summary, ?) AS shard FROM progress_days WHERE day >= ? ORDER BY day')
        .bind(`$.playerShards."${username.toLowerCase()}"`,from).all();
      series=[];
      // At most 30 small shards, one per day, for a player timeline.
      for (const point of points.results) if (point.shard !== null) {
        const shard = await env.HISTORY_DB.prepare('SELECT payload FROM progress_players WHERE day = ? AND shard = ?').bind(point.day,point.shard).first();
        const row = shard && JSON.parse(shard.payload).find(row=>row[0].toLowerCase()===username.toLowerCase());
        if (row) {addDaily(row,point.day);series.push({day:point.day,gain:row[1][index],levels:row[4],startRank:row[2][index],endRank:row[3][index],movement:row[2][index] && row[3][index] ? row[2][index]-row[3][index] : null});}
      }
    } else {
      // Cumulative counters make any calendar window a two-snapshot comparison.
      // No json_each scan over all players/days, and no 30-day payload in memory.
      for (const shard of lastRows.results) for (const row of JSON.parse(shard.payload)) {
        byName.set(row[0], {username:row[0],gain:row[9][index]-row[10][index],levels:row[13]-row[14],
          startRank:row[11][index],endRank:row[3][index],fromAt:row[12],throughAt:row[8],xpStreak:row[5],bossStreak:row[6],current:row[9][index],currentLevel:row[13],initialAt:row[12]});
      }
      const first = await env.HISTORY_DB.prepare('SELECT MIN(day) AS day FROM progress_players WHERE day >= ?').bind(from).first();
      if (first?.day) {
        const startRows = await env.HISTORY_DB.prepare('SELECT payload FROM progress_players WHERE day = ? ORDER BY shard').bind(first.day).all();
        for (const shard of startRows.results) for (const row of JSON.parse(shard.payload)) {
          const player=byName.get(row[0]);
          if (player && player.initialAt === row[12]) {player.gain=player.current-(row[9][index]-row[1][index]);player.levels=player.currentLevel-(row[13]-row[4]);player.startRank=row[2][index];player.fromAt=row[7];}
        }
      }
      const totals = await env.HISTORY_DB.prepare("SELECT day, json_extract(summary, ?) AS gain, json_extract(summary, '$.levels') AS levels FROM progress_days WHERE day >= ? ORDER BY day")
        .bind(`$.totals[${index}]`,from).all();
      series=totals.results;
    }
    for (const player of byName.values()) {
      player.movement=player.startRank && player.endRank ? player.startRank-player.endRank : null;
      delete player.current;delete player.currentLevel;delete player.initialAt;
    }
    const order = sort === 'rises' ? p => p.movement || 0 : sort === 'falls' ? p => -(p.movement || 0) : sort === 'xp-streak' ? p => p.xpStreak : sort === 'boss-streak' ? p => p.bossStreak : p => p.gain;
    const players = [...byName.values()].filter(p => username || (sort === 'gains' ? p.gain !== 0 : order(p)>0))
      .sort((a,b) => order(b)-order(a) || b.gain-a.gain || a.username.localeCompare(b.username));
    const pages = Math.max(1,Math.ceil(players.length/25)), actualPage = Math.min(page,pages);
    const {playerShards,totals,...publicMeta}=meta;
    return json({ available:true, ...publicMeta, days,metric,sort,from, username, series,
      totalGain:[...byName.values()].reduce((n,p)=>n+p.gain,0), totalLevels:[...byName.values()].reduce((n,p)=>n+p.levels,0),
      total:players.length,page:actualPage,pages,limit:25, players:players.slice((actualPage-1)*25,actualPage*25) },200,{'cache-control':'public, max-age=60'});
  } catch (error) {
    if (!(error instanceof HttpError)) console.error('History read failed',error);
    return json({error:error instanceof HttpError ? error.message : 'Progress history is temporarily unavailable. The live hiscores are still available.'},error.status || 503);
  }
}
