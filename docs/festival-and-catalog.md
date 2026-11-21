# Festival, expeditions and the D1 game catalog

The world keeps its XP, boss KC, cash, holdings, achievements and history. This
release adds future progression rather than resetting accounts or fabricating
past rewards.

## Something new to follow

- **Weekly festival (`#festival`)**: four races for earned XP, featured-skill XP,
  completed boss KC and first personal discoveries (new rare item types plus
  expedition relics). Every Monday at 00:00 UTC, scores start fresh. Newcomers
  have a separate division: accounts created within the preceding fourteen days,
  or during that week. Qualification stays fixed for the week. An empty newcomer
  division is allowed; the population ceiling is unchanged.
- **Featured skill**: rotates through all 23 trainable skills, gets twice its
  ordinary selection weight and a 15% training XP bonus. Existing personalities,
  funding, downtime, level gates, climate and the 200M cap still apply. The base
  world XP schedule is unchanged. Existing multi-session goals can continue.
- **Expedition relics**: 48 simulation-only, permanent encounter keepsakes. A
  completed encounter can produce its own relic; previous KC cannot. The chance
  across K completions is `1 - exp(-K / (ordinaryKillsPerHour * 40))`, approximately
  forty ordinary boss-hours per relic before existing activity scaling. Relics
  have no GP value, combat power or trade route. No extra combat time or KC is
  granted. Different encounter speeds have equal expected ordinary effort.
- **Collection hall (`#collections`)**: encounter stamp atlas and searchable rare
  reward cabinets. Open an actual player's cabinet, filter found/missing rewards,
  sort by rarity or recency, or investigate an encounter. Rare finds persist when
  items are sold; purchases and opening inventory are never discoveries. Ranger
  boots now enter discovery records when actually earned from a future casket;
  old clue loot is not reconstructed.
- **Achievements**: sixteen new endgame milestones cover boss breadth, raid
  completions, earned collections, relics, festival honours and post-99 XP.
  Nine early milestones move into the catalog's archive view. Historical unlocks
  remain on accounts. New relic stories and important turning points receive
  reserved noticeboard space so repeat loot does not bury every breakthrough.

Scores use newly earned deltas within actual simulation sessions, including XP
caps and paid-method limits. Session completion time assigns the week. Publication
rebuilds do not create scores or relics. Closed festival records keep the last
observed results, not an invented final capture, for eight recorded weeks. The
first place in each scored track/division earns an honour; equal scores use name
order. One player can win multiple honours in a week. Each profile retains 24
honour details and a cumulative win count. Results begin at the first capture
with this feature, which can be partway through the first week.

## Database-owned content

`HISTORY_DB` also holds `game_catalog`: one versioned JSON document containing all
items, opening price estimates, equipment properties, encounters, readiness
requirements, supplies, explicit drop tables, resource tiers and training-rate
ceilings. Keeping it as one atomic document prevents a half-edited boss table
from being paired with another version's item definitions. It shares the existing
D1 binding; no second database or account secret is needed.

`content/catalog.json` is the extracted bootstrap and reviewable seed, rather than
executable JavaScript definitions. Migration `0002_game_catalog.sql` seeds D1 once
with `INSERT OR IGNORE`; future deployments do not overwrite database edits.
Engine formulas and a few broader simulation policies (personalities, spending
baskets, skill income/cost coefficients, clue rules and festival rules) remain code.
The migration does not rewrite player state or D1 history.

Each scheduled update loads the D1 document once, validates it and publishes it
with the world snapshot. The browser reads `/api/game-catalog`, using the same
published definitions as the ladders. Public reads issue no D1 catalog queries
and perform no writes. The bundled bootstrap supports old snapshots and tests.
If D1 becomes unavailable or an operator introduces invalid content, an existing
world keeps its last known good published catalog and reports `catalogInfo.source`
as `last-known-good` with an error. It never silently replaces custom content with
bootstrap values. A first update without any published catalog requires a valid
D1 migration. Successful subsequent reads restore `source: d1`.

### Editing without a JavaScript deployment

Set `WORKER_BASE_URL` and `ADMIN_TOKEN` in your shell environment, then:

```sh
node scripts/game-catalog.mjs pull /tmp/game-catalog.json
# Edit the content in that document, preserving its revision.
node scripts/game-catalog.mjs check /tmp/game-catalog.json
node scripts/game-catalog.mjs push /tmp/game-catalog.json
node scripts/game-catalog.mjs push /tmp/game-catalog.json --apply
```

Push previews by default. `--apply` explicitly saves the content in D1; it becomes
active on the next successful scheduled update. Optimistic revision checks reject
stale edits. Prior documents are retained in `game_catalog_revisions`. The admin
GET returns the current D1 draft, even before the next simulation capture. Admin
POST accepts `{ content, expectedRevision, dryRun }` and requires `X-Admin-Token`.
No secret is placed in the browser or committed to the repository.

Existing item IDs cannot be removed. Existing encounter keys and positions cannot
change, because historical metric arrays use that order. Append new encounters
(up to 96) and item IDs (up to 1,000); modify existing encounter balance and names
in place. Cross references, resource unlock levels, equipment gates, finite rates,
whole quantities and rare-group probability sums are validated before saving.
The catalog is bounded to 400KB. The world snapshot retains its existing 1.9MB
per-document guard and atomic rollback. Substantial catalog growth still warrants
a capacity run with the proposed content. Profile shards were reduced to forty
players to leave room for relics and honours.

For example, D1's console can inspect the contents without parsing JavaScript:

```sql
SELECT json_extract(value, '$.name') AS name,
       json_extract(value, '$.price') AS opening_price
FROM game_catalog, json_each(payload, '$.items')
WHERE game_catalog.id = 'active';

SELECT json_extract(value, '$.key') AS encounter,
       json_extract(value, '$.drops') AS drops
FROM game_catalog, json_each(payload, '$.bosses')
WHERE game_catalog.id = 'active';
```

Use the validated admin workflow for writes. Opening price estimates do not
replace the live market's supply/demand quotes; those continue to evolve.
