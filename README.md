# OSRS Hiscores

A simulated Old School RuneScape world with overall rankings, all 23 skill ladders, player profiles, achievement history, and recorded firsts. Every four hours, all players receive a training opportunity with skill-specific rates and a 3.5× XP scale. This is an independent fan project; the accounts are simulated and it is not affiliated with Jagex.

## Run locally

Requires Node.js 22 or newer.

```sh
npm ci --prefix workers
cp workers/.dev.vars.example workers/.dev.vars
npm run dev
```

Open **http://localhost:8787**. Wrangler serves the frontend and API together and uses local KV storage. No frontend build, CSS runtime, icon CDN, or JavaScript framework is required. Google Fonts are optional; system fonts provide fallbacks.

A new local namespace starts empty. To create accounts, use the token you placed in `.dev.vars`:

```sh
curl http://localhost:8787/api/seed \
  -X POST \
  -H 'Content-Type: application/json' \
  -H 'X-Admin-Token: replace-with-a-local-development-token' \
  --data '{"usernames":["Rune Mage","Oak Knight","Iron Fox"]}'
```

`POST /api/cron/trigger` runs a simulation cycle with the same authentication. The scheduled handler initializes five accounts if the world is empty. Public reads never run the simulation.

## Publish

### Cloudflare Worker (recommended)

The Worker serves both the website and API. The existing `HISCORES_KV` namespace ID is retained in `workers/wrangler.toml`; change it only if you intend to use a different world.

```sh
cd workers
npx wrangler login
npx wrangler secret put ADMIN_TOKEN
npm run deploy
```

Keep `ADMIN_TOKEN` in Cloudflare secrets. It is deliberately absent from committed configuration. Existing deployments should replace the previously committed token with a fresh secret. Cron remains `0 */4 * * *` (UTC). Static assets run through Cloudflare's asset handler; `/api` and `/api/*` always reach the API router.

The **Publish Cloudflare Worker** workflow is manual and uses the `cloudflare` GitHub environment. Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets, then run it from Actions. Give the token permission to deploy the Worker, its assets, and the existing KV binding.

### GitHub Pages

Pushes to `main` run tests, syntax checks, and a Worker bundle check before publishing a static artifact built **only from `frontend/`**. The website is at the project root; redirects preserve old `/frontend/` bookmarks. GitHub Pages uses the repository’s `WORKER_BASE_URL` secret, falling back to `https://osrs-hiscores-clone.vs.workers.dev` as its API because it cannot execute Pages Functions. The publish script sets the connection explicitly, so custom domains such as `winrar.ai` work too. Connection settings can select a different Worker.

The client can also read the prior API during a rolling deployment. It paginates the available rows locally, derives profile ranks from the old snapshots, and builds the catalog from shared metadata. If an old skill snapshot is truncated, the UI explicitly states its coverage. Full rankings require the updated Worker.

### Cloudflare Pages

For an existing Pages project, use `frontend` as the output directory with no build command. Keep `functions/` at the repository root and bind `HISCORES_KV` to the same namespace. The sole `/api/[[path]]` Function delegates to the same API handler; there are no route-shadowing placeholder Functions. Pages Functions do not run cron: deploy the Worker against the shared namespace for scheduled updates.

## Application

One application serves every view. Routes work on static hosts, including under a GitHub Pages project prefix:

- `#overall` — rankings, name filtering, pagination, page-size selection, CSV export.
- `#skills/attack` — skill ladder, level and XP ranges, filtering, pagination, CSV export.
- `#user/Rune%20Mage` — player summary, combat level, skill ranks, XP progress, achievement history.
- `#achievements` — searchable catalog, category and rarity filters, sort controls, recent unlocks, recorded firsts.

The older `skill-hiscores.html?skill=attack` and `achievements.html` entry points still work. Theme and connection preferences are optional local storage settings. `?api=https://example.workers.dev` temporarily selects another API. Blank connection settings restore the default. A missing API or failed request produces a retry screen with connection controls. Player search supports keyboard submission and native username suggestions.

## API

All responses are JSON with CORS enabled. Reads cache for 30 seconds in browsers and Cloudflare’s edge Cache API, except health and diagnostics. Invalid input returns `400`, missing players/routes return `404`, invalid credentials return `401`, and unavailable bindings return `503`.

| Method | Endpoint                              | Response                                                                            |
| ------ | ------------------------------------- | ----------------------------------------------------------------------------------- |
| GET    | `/api/world`                          | Snapshot generation, training calibration and estimated next update                  |
| GET    | `/api/health`                         | Liveness and KV binding status                                                      |
| GET    | `/api/debug`                          | Binding status and last successful simulation; no secret values                     |
| GET    | `/api/leaderboard`                    | Paginated overall ranking                                                           |
| GET    | `/api/skill-rankings?skill=attack`    | Paginated skill ranking                                                             |
| GET    | `/api/skill-rankings`                 | All skill rankings, retained for compatibility                                      |
| GET    | `/api/users`                          | Sorted username list                                                                |
| GET    | `/api/users/batch?usernames=Ada,Zed`  | Up to 200 player documents                                                          |
| GET    | `/api/users/:username`                | Player document, authoritative rank, tier, combat level, skill ranks                |
| GET    | `/api/users/:username/achievements`   | Highest achievement families plus full historical unlocks                           |
| GET    | `/api/achievements/catalog`           | Shared metadata, historical unlock counts, rarity, recorded firsts                  |
| GET    | `/api/achievements/stats`             | Historical unlock counts and player count                                           |
| GET    | `/api/achievements/firsts`            | Earliest recorded unlocks, including legacy/v2 compatibility shape                  |
| GET    | `/api/banners/rare`                   | Up to 12 recent recorded unlocks in the last 48 hours                               |
| GET    | `/api/generate/users/dry-run?count=5` | Unique generated names without writes or external scrapers                          |
| POST   | `/api/seed`                           | Create 1–200 named players; existing names are skipped                              |
| POST   | `/api/cron/trigger`                   | Run the scheduled simulation                                                        |
| POST   | `/api/admin/rebuild`                  | Normalize stored documents at read time and rebuild ranking/achievement projections |
| POST   | `/api/admin/users/delete-batch`       | Preview or delete selected names, or a random batch                                 |

Ranking parameters are `page` (default 1), `limit` (default 50; maximum 5000), and `q`. Skill rankings additionally accept `minLevel`, `maxLevel`, `minXP`, and `maxXP`. Filtering keeps the player's original global rank. Responses contain `players`, `page`, `pages`, `limit`, `total` (filtered count), `totalPlayers`, and `generatedAt`. An out-of-range page resolves to the final page.

**Every POST requires `X-Admin-Token`.** Query-string tokens are not accepted. Deletion defaults to `dryRun: true`; only the boolean `false` performs deletion:

```json
{ "usernames": ["Ada"], "dryRun": true }
```

The obsolete public migration, regex purge, hitpoints rebalance, and fake-word scraping endpoints have been removed. Stored levels/totals are normalized from XP when read, so the old one-off level migrations are unnecessary. Normalization preserves timestamps, multipliers, and historical achievement data. XP activity tiers now advance with current total XP. Simulation never lowers XP and caps each skill at 200 million.

## Data and consistency

Permanent records remain under `user:<lowercase name>`. Existing player data and the `ach:firsts`, `ach:firsts:v2`, and `ach:events` stores are read and retained. No namespace reset or bulk migration is needed.

Player scans use Cloudflare KV bulk reads in groups of up to 100 keys. Independent writes run in bounded batches, with failures propagated before publishing a snapshot. This avoids one subrequest per player and long serial startup work. KV still bills bulk reads per key; bulk access improves subrequest usage, while the shard and edge caches reduce billed reads.

A successful simulation publishes a generation-scoped snapshot. All 24 ladders are packed together in 500-row shards, reducing ranking snapshot writes from 24 per shard to one. Profiles are stored in 100-player shards with their XP, ranks, goals and achievement history from the same generation. Profile reads need the manifest and one profile shard, instead of a permanent document and all skill ladders. Immutable shards are cached within each Worker isolate; the manifest stays authoritative. The `snapshot:current` manifest is written after all shards, with one generation's timestamp, counts, firsts, recent events and calibration metadata. Dirty simulation records and new unlocks are deduplicated into one permanent write per changed player. Unchanged firsts and event logs are not rewritten. Readers never deliberately combine generations. Temporary KV replication gaps produce a retryable error rather than partial or invented results. Snapshot shards expire after 30 days; an expired manifest can be rebuilt from permanent player records.

Achievement counts reflect retained historical unlocks rather than inferred lower milestones. Firsts are reconciled against earlier stored timestamps, including legacy mappings, and remain historical even if a player is removed. Missing records cannot reconstruct an exact historical unlock time; new discoveries use the time they were recorded.

KV is eventually consistent. The in-process mutation guard prevents overlapping jobs within one isolate, but is **not a distributed lock**. Avoid overlapping manual and scheduled operations. Strict serialization across isolates or strongly consistent rankings would require a Durable Object or a transactional store. The UI shows snapshot timestamps so stale data is visible. Visible pages check `/api/world` every minute and reload the current view when the generation changes; hidden tabs stop polling, and active form edits defer refresh.

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
  store.js                 KV access and player normalization
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

Tests exercise API contracts, malformed input, authorization, KV pagination, rankings beyond 500 accounts, tie ordering, profile ranks, preserved history, firsts reconciliation, dry-run deletion, scheduled progress, environment isolation, and Worker/Pages parity. Browser verification should cover desktop/mobile layouts, light/dark themes, search, filters, pagination, profiles, achievements, retry states, and legacy API compatibility.

## Training calibration

`workers/data/calibration.json` contains live Wise Old Man main-account EHP methods and a captured sample of 20 top weekly gainers, fetched October 12, 2026. Source URLs, weekly per-skill gains and retrieval timestamps are retained. Run `npm run calibrate` to refresh this bundled dataset before a deployment; it never polls WOM from the Worker or writes calibration to KV.

EHP rates represent optimized training, **not average observed XP/hour**. Weekly XP gains do not reveal playtime. This competitive sample is biased and cannot measure population-wide popularity. The simulator uses explicit ordinary-training ceilings and level scaling, caps efficiency rates at 70%, and adjusts authored popularity preferences only slightly using sample participation. Agility and Runecraft remain slower and less frequently selected for general players; archetype preferences allow specialists to focus on them. The 3.5× scale applies once, with the existing weekend bonus. Old global tier XP multipliers no longer stack on the scale; skill multipliers influence selection instead.

Each four-hour opportunity samples activity duration (including genuinely inactive sessions), then selects a trainable skill with weighted preferences. Combat and Slayer award related combat/Hitpoints XP. Elapsed time since the last successful run caps the window at four hours, preventing rapid manual triggers from granting four hours repeatedly. Missed cron windows do not produce unlimited catch-up. No player XP is reset, and every skill remains capped at 200M.

Profiles show their latest and best session, session count and nearest skill cape with a current-rate active-hours estimate. Added milestones include 500/1000 total level, base 70, dual Agility/Runecraft mastery, first/100th training session and 1M XP in a UTC day. Session achievements begin with this version rather than inventing historical training logs.

See [the model notes](docs/training-model.md) for base/scaled rates and sampling limitations.
