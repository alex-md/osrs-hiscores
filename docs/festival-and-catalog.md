# Collections and the D1 game catalog

The world keeps its XP, boss KC, cash, holdings, achievements and history. This
release adds future progression rather than resetting accounts or fabricating
past rewards.

## Collections and retired competitions

The weekly festival, featured-skill XP bonus, score accumulation and further
honours were retired in favour of financial history and World discoveries.
Existing scores, honours and unlocks remain historical. `#festival` opens the
new journal; `/api/festival` returns `{ festival: null, retired: true }`.
See the [current feature and accounting rules](../README.md#fortunes-discoveries-and-editable-game-content).

The collection hall remains a record of personal rare drops and 48 permanent
expedition relics. Only completed encounters can produce a relic; old KC does
not backfill them. Their chance across K completions is
`1 - exp(-K / (ordinaryKillsPerHour * 40))`. Relics have no bank value, combat power
or trade route. Rare finds persist after sale, and purchases never count as finds.

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
and perform no writes. Progress-history reads also pass through the world so their
packed metric indices use the published encounter order; edge caching remains in
place. The bundled bootstrap supports old snapshots and tests.
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
