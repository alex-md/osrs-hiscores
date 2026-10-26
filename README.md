# OSRS Hiscores

A simulated Old School RuneScape world with overall rankings, all 24 skill ladders including Sailing, boss kill counts, modeled bank-value rankings, player profiles, achievement history, and recorded firsts. Every 15 minutes, all players receive a training opportunity with skill-specific rates and a randomized time-of-day XP scale capped at 31×. This is an independent fan project; the accounts are simulated and it is not affiliated with Jagex.

## Run locally

Requires Node.js 22.16 or newer.

```sh
npm ci --prefix workers
cp workers/.dev.vars.example workers/.dev.vars
npm run dev
```

Open **http://localhost:8787**. Wrangler serves the frontend and API together and uses a local SQLite-backed Durable Object. No frontend build, CSS runtime, icon CDN, or JavaScript framework is required. Google Fonts are optional; system fonts provide fallbacks.

A new local Durable Object starts empty. To create accounts, use the token you placed in `.dev.vars`:

```sh
curl http://localhost:8787/api/seed \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-Admin-Token: replace-with-a-local-development-token' \
  --data '{"usernames":["Rune Mage","Oak Knight","Iron Fox"]}'
```

`POST /api/cron/trigger` runs a simulation cycle with the same authentication. The scheduled handler initializes five accounts if the world is empty. New usernames use invented words from thisworddoesnotexist.com with optional capitals, spaces, and numbers, always within 12 characters. Word fetches time out after 1.5 seconds; a local pronounceable-word generator handles outages and larger previews. Set `ALLOW_TWODNE_SCRAPE=false` to use only local words. Public reads never run the simulation. Repeated simulation triggers within the same 15-minute UTC slot return `429`.

## Publish

### Cloudflare Worker (recommended)

The Worker serves both the website and API. `HISCORES_WORLD` points to a single SQLite-backed Durable Object named `main-world`. The `v1-world-sqlite` Wrangler migration creates its database. This cutover intentionally starts a fresh simulated world; the old KV namespace is no longer bound or used, and is not deleted.

```sh
cd workers
npx wrangler login
npx wrangler secret put ADMIN_TOKEN
npm run deploy
```

Keep `ADMIN_TOKEN` in Cloudflare secrets. It is deliberately absent from committed configuration. Existing deployments should replace the previously committed token with a fresh secret. Cron is `*/15 * * * *` (UTC). Static assets run through Cloudflare's asset handler; `/api` and `/api/*` always reach the API router.

The **Publish Cloudflare Worker** workflow is manual and uses the `cloudflare` GitHub environment. Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets, then run it from Actions. Give the token permission to deploy the Worker, its assets, and Durable Objects. SQLite-backed Durable Objects are available on the Workers Free plan; their request, duration and SQL/storage limits still apply.

### GitHub Pages

Pushes to `main` run tests, syntax checks, and a Worker bundle check before publishing a static artifact built **only from `frontend/`**. The website is at the project root; redirects preserve old `/frontend/` bookmarks. GitHub Pages uses the repository’s `WORKER_BASE_URL` secret, falling back to `https://osrs-hiscores-clone.vs.workers.dev` as its API because it cannot execute Pages Functions. The publish script sets the connection explicitly, so custom domains such as `winrar.ai` work too. Connection settings can select a different Worker.

The client can also read the prior API during a rolling deployment. It paginates the available rows locally, derives profile ranks from the old snapshots, and builds the catalog from shared metadata. If an old skill snapshot is truncated, the UI explicitly states its coverage. Full rankings require the updated Worker.

### Cloudflare Pages

For an existing Pages project, use `frontend` as the output directory with no build command. Keep `functions/` at the repository root. In the Pages project, bind `HISCORES_WORLD` to class `HiscoresWorld` in Worker `osrs-hiscores-clone` after deploying that Worker. The sole `/api/[[path]]` Function forwards to the same `main-world` object. Do not bind the old KV namespace. Pages Functions do not run cron; the Worker owns scheduled updates.

## Application

One application serves every view. Routes work on static hosts, including under a GitHub Pages project prefix:

- `#overall` — rankings, name filtering, pagination, page-size selection, CSV export.
- `#skills/attack` — skill ladder, level and XP ranges, filtering, pagination, CSV export.
- `#user/Rune%20Mage` — player summary, combat level, skill ranks, XP progress, achievement history.
- `#wealth` — modeled bank-value rankings, name filtering and pagination.
- `#bosses` — total recorded boss KC; `#bosses?boss=vorkath` selects an encounter.
- `#achievements` — searchable catalog, category and rarity filters, sort controls, recent unlocks, recorded firsts.

The older `skill-hiscores.html?skill=attack` and `achievements.html` entry points still work. Theme and connection preferences are optional local storage settings. `?api=https://example.workers.dev` temporarily selects another API. Blank connection settings restore the default. A missing API or failed request produces a retry screen with connection controls. Player search supports keyboard submission and native username suggestions.

## API

All responses are JSON with CORS enabled. Reads cache for 30 seconds in browsers and Cloudflare’s edge Cache API, except health and diagnostics. Invalid input returns `400`, missing players/routes return `404`, invalid credentials return `401`, and unavailable bindings return `503`.

| Method | Endpoint                              | Response                                                                            |
| ------ | ------------------------------------- | ----------------------------------------------------------------------------------- |
| GET    | `/api/world`                          | Snapshot generation, training calibration and estimated next update                  |
| GET    | `/api/health`                         | Liveness and Durable Object storage status                                                      |
| GET    | `/api/debug`                          | Binding status and last successful simulation; no secret values                     |
| GET    | `/api/leaderboard`                    | Paginated overall ranking                                                           |
| GET    | `/api/skill-rankings?skill=attack`    | Paginated skill ranking                                                             |
| GET    | `/api/skill-rankings`                 | All skill rankings, retained for compatibility                                      |
| GET    | `/api/activity-rankings?category=bank` | Paginated wealth ranking; `bosses` selects total KC and a boss key selects an encounter |
| GET    | `/api/users`                          | Sorted username list                                                                |
| GET    | `/api/users/batch?usernames=Ada,Zed`  | Up to 200 player documents                                                          |
| GET    | `/api/users/:username`                | Player document, authoritative rank, tier, combat level, skill ranks                |
| GET    | `/api/users/:username/achievements`   | Highest achievement families plus full historical unlocks                           |
| GET    | `/api/achievements/catalog`           | Shared metadata, historical unlock counts, rarity, recorded firsts                  |
| GET    | `/api/achievements/stats`             | Historical unlock counts and player count                                           |
| GET    | `/api/achievements/firsts`            | Earliest recorded unlocks, including legacy/v2 compatibility shape                  |
| GET    | `/api/banners/rare`                   | Up to 12 recent recorded unlocks in the last 48 hours                               |
| GET    | `/api/generate/users/dry-run?count=5` | Unique generated names without database writes                          |
| POST   | `/api/seed`                           | Create 1–200 named players; existing names are skipped                              |
| POST   | `/api/cron/trigger`                   | Run the scheduled simulation                                                        |
| POST   | `/api/admin/rebuild`                  | Normalize stored documents at read time and rebuild ranking/achievement projections |
| POST   | `/api/admin/users/rename-all`         | One-time rename of all existing players; defaults to preview, preserves progress and history |
| POST   | `/api/admin/users/delete-batch`       | Preview or delete selected names, or a random batch                                 |

Activity rankings use `category=bank`, `category=bosses`, or a boss key from `frontend/lib/activities.js`, plus `page`, `limit`, and `q`. Zero-KC players are unranked.

Ranking parameters are `page` (default 1), `limit` (default 50; maximum 5000), and `q`. Skill rankings additionally accept `minLevel`, `maxLevel`, `minXP`, and `maxXP`. Filtering keeps the player's original global rank. Responses contain `players`, `page`, `pages`, `limit`, `total` (filtered count), `totalPlayers`, and `generatedAt`. An out-of-range page resolves to the final page.

**Every POST requires `X-Admin-Token`.** Query-string tokens are not accepted. Deletion defaults to `dryRun: true`; only the boolean `false` performs deletion:

```json
{ "usernames": ["Ada"], "dryRun": true }
```

The obsolete public migration, regex purge, hitpoints rebalance, and fake-word scraping endpoints have been removed. Stored levels/totals are normalized from XP when read, so the old one-off level migrations are unnecessary. Normalization preserves timestamps, multipliers, and historical achievement data. XP activity tiers now advance with current total XP. Simulation never lowers XP and caps each skill at 200 million.

## Data and consistency

The singleton `HiscoresWorld` Durable Object owns a SQLite database. Public reads, administrative updates, and 15-minute cron runs all go through the same request queue. There are no Workers KV bindings or KV operations in the active architecture. Public requests never create or rebuild snapshots; an uninitialized world returns `503` until it is seeded or the first cron runs.

A successful update writes packed 500-player ranking shards, 125-player profile shards, the manifest, and simulation metadata into one SQLite transaction. Profile shards are the canonical player records, including XP and achievement history. A failed computation or SQL commit leaves the previous generation intact. Obsolete generations are deleted in that same transaction, so snapshot storage does not grow on every update. The current generation has no expiry. Individual JSON rows are checked against a 1.9 MB safety threshold below SQLite's 2 MB row limit.

The object serializes reads and writes, and stores a simulation slot identifier atomically with the simulation. Repeated or concurrent cron/manual triggers in the same 15-minute UTC window return `429` without progressing players again. Seed, rebuild, and deletion remain available independently of that simulation guard. Failed simulations can be retried because their slot reservation rolls back too.

Achievement counts reflect retained historical unlocks. Firsts remain historical even if a player is removed. Missing historical timestamps cannot be reconstructed; newly discovered unlocks use the publication time.

Reads cache for 30 seconds at the edge and in browsers. Visible pages check `/api/world` every minute and reload when the generation changes; hidden tabs stop polling, and active form edits defer refresh. Immutable shards are cached in the object with bounded memory. Edge caching limits Durable Object requests, but arbitrary unique URLs can still consume its separate Free plan quotas.

### Capacity and cadence

The world updates every 15 minutes: 96 updates/day rather than six. XP remains calibrated to the elapsed training window with the period-weighted daily XP schedule; a more frequent cron does not multiply XP/hour. Browser freshness checks run once a minute while visible. `simulation-config.js` shares cadence and the 5,000-player population cap across the server and training metadata. Admin seed requests also respect the cap.

Cloudflare's SQLite Durable Object Free allowance is 100,000 rows written/day and 5 million rows read/day, with separate request/duration/storage limits. The disposable local workerd benchmark at the full 5,000-player cap measured 155 SQL rows written and 146 read for one update, including index writes and deleting the previous shards: **14,880 scheduled rows written/day** at 96 updates. The conservative cold-read projection at the 100,000 DO request limit was 4,110,080 SQL reads/day; this includes scheduled reads and assumes every remaining request touches all 40 profile packs. The test dataset occupied about 42.5 MB and its largest document was about 1.31 MB. This projection leaves room for admin changes and ordinary traffic; it is not production usage telemetry. GET routes do not write to SQLite. One full endgame-population run took about 600 ms locally, which is not a production latency guarantee.

Run `npm run capacity` after `npm ci --prefix workers` to repeat the real-runtime benchmark without contacting production. It fails if projected scheduled writes reach 30,000/day, reads at the request limit reach 4.5M/day, public reads write anything, stored documents/data exceed safety bounds, or population growth exceeds the cap. Account-wide usage and traffic still need observing after deployment. See [Cloudflare's pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

### Fresh-world cutover

1. Deploy the Worker with `workers/wrangler.toml`, including its Durable Object binding and `new_sqlite_classes` migration. Keep the migration tag unchanged on later deploys.
2. Update any Cloudflare Pages deployment to forward to the same object, or use the Worker-served frontend. Retire old Workers/Pages Functions that still write to KV; their usage does not disappear just because this Worker stopped using it.
3. Trigger `POST /api/cron/trigger` with `X-Admin-Token`, or wait for the next 15-minute cron. This creates five players. Later runs add one or two players (up to 5,000 total) and progress the existing population.
4. Check `/api/health` for `storage: "durable-object-sqlite"`, then check `/api/world`, profiles and rankings. Check Cloudflare usage after cutover; other scripts using the old namespace can still consume account-wide KV quotas.

No destructive namespace wipe or player import is required. The previous KV dataset remains available for manual backup or later removal. Local tests and a bundle dry run do not deploy the migration or change production data.

See [the KV audit](docs/kv-audit.md) for the original call paths and quota diagnosis.

## Structure and verification

```text
frontend/
  app.js                   Routing and view rendering
  styles.css               Shared responsive design system
  lib/api.js               Connection handling and v1 transition reader
  lib/domain.js            Shared skills, combat math, rarity
  lib/achievement-keys.js   Backend/frontend achievement contract
  lib/catalog.js           Shared achievement metadata
functions/api/[[path]].js   Cloudflare Pages adapter
workers/src/
  index.js                 API routing and Worker entry point
  http.js                  Validation, errors, auth, pagination
  store.js                 Database access and player normalization
  durable-store.js         SQLite documents and atomic commits
  world.js                 Serialized Durable Object request handling
  gateway.js               Worker/Pages forwarding and edge caching
  snapshots.js             Rankings, unlock persistence, firsts, snapshot publishing
  simulation.js            Account generation and scheduled progress
  achievements.js          Achievement evaluation
  constants.js, utils.js   Simulation probabilities and XP math
```

```sh
npm test
npm run check
cd workers && npx wrangler deploy --dry-run
```

Tests exercise API contracts, malformed input, authorization, packed player reads, rankings beyond 500 accounts, tie ordering, profile ranks, preserved history, firsts reconciliation, dry-run deletion, scheduled progress, environment isolation, SQL rollback, concurrent trigger deduplication, and Worker/Pages parity. Browser verification should cover desktop/mobile layouts, light/dark themes, search, filters, pagination, profiles, achievements, retry states, and legacy API compatibility.

## Training calibration

`workers/data/calibration.json` contains live Wise Old Man main-account EHP methods and a captured sample of 20 top weekly gainers, fetched October 12, 2026. Source URLs, weekly per-skill gains and retrieval timestamps are retained. The generated `workers/data/calibration.js` contains the runtime rates and metadata using a plain JavaScript export, compatible with both Pages’ Wrangler 3 bundler and the Worker’s Wrangler 4 bundler. Run `npm run calibrate` to refresh both files before a deployment; it never polls WOM from the Worker or writes calibration to KV.

EHP rates represent optimized training, **not average observed XP/hour**. Weekly XP gains do not reveal playtime. This competitive sample is biased and cannot measure population-wide popularity. The simulator uses explicit ordinary-training ceilings and level scaling, caps efficiency rates at 70%, and adjusts authored popularity preferences only slightly using sample participation. Agility and Runecraft remain slower and less frequently selected for general players; archetype preferences allow specialists to focus on them. The 18.5× baseline is shaped by weekly and daily intensity, randomized morning/lunch/evening peaks, and smaller correlated fluctuations. UTC schedules have 96 periods, a minimum of 6×, and a maximum of 31× including the existing 15% weekend uplift. Weekends shift activity later. Daily averages vary around the baseline (about ±9%, before weekend uplift). The date-seeded pattern is shared by all players and reproducible across retries. Elapsed windows crossing period or midnight boundaries weight each rate by time; the resulting multiplier applies once. Session history records the awarded scale; published metadata includes the current scale, its factors, and the day’s complete distribution. Cape estimates use the published rate and explicitly assume it stays constant. Old global tier XP multipliers no longer stack on the scale; skill multipliers influence selection instead.

Each 15-minute opportunity samples activity duration (including genuinely inactive sessions), then selects a trainable skill with weighted preferences. Combat and Slayer award related combat/Hitpoints XP. Elapsed time since the last successful run caps the window at 15 minutes, preventing rapid manual triggers from granting a full training window repeatedly. Missed cron windows do not produce unlimited catch-up. No player XP is reset, and every skill remains capped at 200M.

Profiles show their latest and best session, session count and nearest skill cape with a current-rate active-hours estimate. Added milestones include 500/1000 total level, base 70, dual Agility/Runecraft mastery, first/100th training session and 1M XP in a UTC day. Session achievements begin with this version rather than inventing historical training logs.

See [the model notes](docs/training-model.md) for base/scaled rates and sampling limitations.

The username migration runs once with `POST /api/admin/users/rename-all` and `{"dryRun":false}`. It atomically saves original player records and history under `backup:username-v1:*`, rebuilds profiles and rankings with the new names, and records the old-to-new mapping in `system:username-migration:v1`. Repeating it returns the saved mapping without changing names again.

## Boss and wealth simulation

Sailing, 16 encounter categories, and bank value share the existing world and time-of-day scaling. Persistent preferences, combat/skill gates, gear quality, growing boss familiarity, rare-drop luck, supply costs and buyable-skill spending connect progression and wealth. Existing accounts gain level-1 Sailing and an explicitly estimated opening bank, while boss records begin at zero. No previous XP or unlocks are reset. Exact quests, loadouts, live prices and named drop tables are not simulated. See [the economy model](docs/simulation-economy.md) for equations, migration behavior, limits and storage checks.
