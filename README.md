# OSRS Hiscores

A simulated Old School RuneScape world with overall rankings, all 24 skill ladders including Sailing, boss kill counts, modeled bank-value rankings, player profiles, achievement history, and recorded firsts. Every 15 minutes, all players receive a training opportunity with skill-specific rates and a randomized time-of-day XP scale capped at 70x. This is an independent fan project; the accounts are simulated and it is not affiliated with Jagex.

## Run locally

Requires Node.js 22.16 or newer.

```sh
npm ci --prefix workers
cp workers/.dev.vars.example workers/.dev.vars
npm run dev
```

Open **http://localhost:8787**. Wrangler serves the frontend and API together and uses a local SQLite-backed Durable Object. No frontend build, CSS runtime, icon CDN, or JavaScript framework is required. The interface uses local system fonts, bundled stone and ivy SVG textures, and CSS parchment; no external font or texture requests are needed.

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

### Automatic releases

This repository is one application: `frontend/` holds the website, `workers/` holds the API and SQLite Durable Object, and `functions/` is the optional Cloudflare Pages adapter. GitHub stores the source and serves the GitHub Pages website; Cloudflare runs the Worker, Durable Object database and 15-minute cron.

Every push to `main` starts **Verify and deploy application** (`.github/workflows/release.yml`):

1. Run the application and release tests, JavaScript checks, the 5,000-player capacity check, Pages Functions build and Worker bundle check.
2. Deploy the Worker, its matching frontend assets, the existing Durable Object binding/migrations and cron. Tag the deployment with the commit SHA.
3. Check the live `/api/health` response for the exact commit and a healthy SQLite Durable Object binding.
4. Publish GitHub Pages from `frontend/`, with the same API connection, asset URLs stamped with the commit SHA, and a `release.json` manifest. Check the live manifest for the expected commit and Worker URL.

A failed backend deployment or health check stops the Pages deployment. Production releases run serially, without cancelling a release halfway through. Pull requests only verify; they cannot deploy. The workflow can also be run manually on `main` to retry a release. The former separate frontend and manual Worker workflows are replaced by this one pipeline.

One-time GitHub Actions configuration:

- `CLOUDFLARE_API_TOKEN`: a Cloudflare deployment API token scoped to the account, using the **Edit Cloudflare Workers** template. Store it in repository Actions secrets or the `cloudflare` environment.
- `CLOUDFLARE_ACCOUNT_ID`: the target account ID in the same secret settings.
- `WORKER_BASE_URL`: the existing repository secret, shared by Worker verification and Pages packaging. Defaults to `https://osrs-hiscores-clone.vs.workers.dev`; keep it pointed at the deployed Worker origin.
- Disable the separate Cloudflare Worker Builds trigger and the legacy Cloudflare Pages project's automatic production/preview deployments. Those direct Git integrations bypass the release checks and can race with GitHub Actions. Keep the services and Durable Object intact; only their duplicate automatic build triggers are disabled.
- GitHub Pages must use **GitHub Actions** as its source. The workflow uses the existing `github-pages` environment and the `cloudflare` environment for Worker deployment.

GitHub cannot reuse a local Wrangler browser login; CI needs the API token above. Credentials are checked before deployment, and a missing secret produces an explicit Actions error. `ADMIN_TOKEN` remains a Cloudflare runtime secret and is never copied into frontend assets or required by release health checks.

The Worker serves both the website and API. `HISCORES_WORLD` continues to point to class `HiscoresWorld` and the same `main-world` SQLite object. Keep the `v1-world-sqlite` migration tag unchanged for ordinary releases. Deploying code does not reset the world. Future database migrations belong in the same reviewed Wrangler configuration; the workflow deploys them with the backend. This is a staged rollout, not a cross-platform transaction: a Pages failure can leave the healthy new backend running with the previous Pages frontend. Automatic database rollback is deliberately not attempted.

For an exceptional local deployment:

```sh
cd workers
npx wrangler login
npx wrangler secret put ADMIN_TOKEN
npm run deploy
```

The GitHub Pages artifact is built only from `frontend/`. The site remains at the project root, and redirects preserve `/frontend/` bookmarks. `scripts/prepare-pages.mjs` supplies the API origin explicitly, including on a custom domain. Optional connection settings can select a different Worker. Cloudflare's Worker-hosted copy uses the same-origin API. Cron remains `*/15 * * * *` (UTC), and `/api` routes reach the same Durable Object.

### Cloudflare Pages

For an existing Pages project, use `frontend` as the output directory with no build command. Keep `functions/` at the repository root. In the Pages project, bind `HISCORES_WORLD` to class `HiscoresWorld` in Worker `osrs-hiscores-clone` after deploying that Worker. The sole `/api/[[path]]` Function forwards to the same `main-world` object. Do not bind the old KV namespace. Pages Functions do not run cron; the Worker owns scheduled updates.

## Application

One application serves every view. Routes work on static hosts, including under a GitHub Pages project prefix:

- `#overall` — rankings, name filtering, pagination, page-size selection, CSV export.
- `#skills/attack` — skill ladder, level and XP ranges, filtering, pagination, CSV export.
- `#user/Rune%20Mage` — player summary, combat level, skill ranks, XP progress, achievement history.
- `#wealth` — modeled bank-value rankings, name filtering and pagination.
- `#bosses` — total recorded boss KC; `#bosses?boss=vorkath` selects an encounter.
- `#stories` — new crowns, notable loot, boss milestones, rivalries and the race to max.
- `#achievements` — searchable catalog, category and rarity filters, sort controls, recent unlocks, recorded firsts.

The older `skill-hiscores.html?skill=attack` and `achievements.html` entry points still work. Theme and connection preferences are optional local storage settings. `?api=https://example.workers.dev` temporarily selects another API. Blank connection settings restore the default. A missing API or failed request produces a retry screen with connection controls. Player search supports keyboard submission and native username suggestions.

## API

Health and debug diagnostics include progression freshness, last successful update, update computation duration, pending history days, publication lag and failure counters. `/api/health` retains a separate liveness status; inspect `diagnostics.progression.state` for stale progression.

All responses are JSON with CORS enabled. Reads cache for 30 seconds in browsers and Cloudflare’s edge Cache API, except health and diagnostics. Invalid input returns `400`, missing players/routes return `404`, invalid credentials return `401`, and unavailable bindings return `503`.

| Method | Endpoint                              | Response                                                                            |
| ------ | ------------------------------------- | ----------------------------------------------------------------------------------- |
| GET    | `/api/stories`                        | Bounded world noticeboard, leading rivalries and maxing contenders |
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
| POST   | `/api/admin/progress/recover-2026-10-28` | Preview/apply the fixed, authenticated one-time 12-hour compensation plan |
| POST   | `/api/admin/rebuild`                  | Normalize stored documents at read time and rebuild ranking/achievement projections |
| POST   | `/api/admin/users/rename-all`         | One-time rename of all existing players; defaults to preview, preserves progress and history |
| POST   | `/api/admin/users/delete-batch`       | Preview or delete selected names, or a random batch                                 |

Activity rankings use `category=bank`, `category=bosses`, or a boss key from `frontend/lib/activities.js`, plus `page`, `limit`, and `q`. Zero-KC players are unranked.

Ranking parameters are `page` (default 1), `limit` (default 50; maximum 2000), and `q`. Skill rankings additionally accept `minLevel`, `maxLevel`, `minXP`, and `maxXP`. Filtering keeps the player's original global rank. Responses contain `players`, `page`, `pages`, `limit`, `total` (filtered count), `totalPlayers`, and `generatedAt`. An out-of-range page resolves to the final page.

**Every POST requires `X-Admin-Token`.** Query-string tokens are not accepted. Deletion defaults to `dryRun: true`; only the boolean `false` performs deletion:

```json
{ "usernames": ["Ada"], "dryRun": true }
```

The obsolete public migration, regex purge, hitpoints rebalance, and fake-word scraping endpoints have been removed. Stored levels/totals are normalized from XP when read, so the old one-off level migrations are unnecessary. Normalization preserves timestamps, multipliers, and historical achievement data. XP activity tiers now advance with current total XP. Simulation never lowers XP and caps each skill at 200 million.

## Data and consistency

The [Cloudflare architecture review](docs/cloudflare-architecture.md) records the
storage/CPU tradeoffs. The Grand Exchange, its public API and Analytics Engine
emission have been removed; legacy exchange state remains inert; the rare-item settlement step uses separate bounded stock.

The singleton `HiscoresWorld` Durable Object owns a SQLite database. Public reads, administrative updates, and 15-minute cron runs all go through the same request queue. There are no Workers KV bindings or KV operations in the active architecture. Public requests never create or rebuild snapshots; an uninitialized world returns `503` until it is seeded or the first cron runs.

A successful update writes packed 250-player ranking shards, 64-player profile shards, the manifest, and simulation metadata into one SQLite transaction. Profile shards are the canonical player records, including XP and achievement history. A failed computation or SQL commit leaves the previous generation intact. Obsolete generations are deleted in that same transaction, so snapshot storage does not grow on every update. The current generation has no expiry. Individual JSON rows are checked against a 1.9 MB safety threshold below SQLite's 2 MB row limit.

The object serializes reads and writes, and stores a simulation slot identifier atomically with the simulation. Repeated or concurrent cron/manual triggers in the same 15-minute UTC window return `429` without progressing players again. Seed, rebuild, and deletion remain available independently of that simulation guard. Failed simulations can be retried because their slot reservation rolls back too.

Achievement counts reflect retained historical unlocks. Firsts remain historical even if a player is removed. Missing historical timestamps cannot be reconstructed; newly discovered unlocks use the publication time.

Reads cache for 30 seconds at the edge and in browsers. Visible pages check `/api/world` every minute and reload when the generation changes; hidden tabs stop polling, and active form edits defer refresh. Immutable shards are cached in the object with bounded memory. Edge caching limits Durable Object requests, but arbitrary unique URLs can still consume its separate Free plan quotas.

### Capacity and cadence

The world updates every 15 minutes: 96 updates/day rather than six. XP remains calibrated to the elapsed training window with the period-weighted daily XP schedule; a more frequent cron does not multiply XP/hour. Browser freshness checks run once a minute while visible. `simulation-config.js` shares cadence and the 5,000-player population cap across the server and training metadata. Admin seed requests also respect the cap.

Cloudflare's SQLite Durable Object Free allowance is 100,000 rows written/day and 5 million rows read/day, with separate request/duration/storage limits. The disposable local workerd benchmark includes 5,000 endgame players, full eight-entry notable-loot logs, partial raids and 30 days of history. Run `npm run capacity` for current measurements; the older pre-history 14,880 scheduled writes/day estimate is obsolete. Public reads must write nothing. These are local projections, not account-wide production usage telemetry. Current limits and the measured release result are recorded in [the emergent world notes](docs/emergent-world.md).

Run `npm run capacity` after `npm ci --prefix workers` to repeat the real-runtime benchmark without contacting production. It fails if projected scheduled writes reach 30,000/day, reads at the request limit reach 4.5M/day, public reads write anything, stored documents/data exceed safety bounds, or population growth exceeds the cap. Account-wide usage and traffic still need observing after deployment. See [Cloudflare's pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

### Fresh-world cutover

1. Deploy the Worker with `workers/wrangler.toml`, including its Durable Object binding and `new_sqlite_classes` migration. Keep the migration tag unchanged on later deploys.
2. Update any Cloudflare Pages deployment to forward to the same object, or use the Worker-served frontend. Retire old Workers/Pages Functions that still write to KV; their usage does not disappear just because this Worker stopped using it.
3. Trigger `POST /api/cron/trigger` with `X-Admin-Token`, or wait for the next 15-minute cron. This creates five players. Later runs have a 45% chance of adding one player (up to 5,000 total) and progress the existing population.
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

EHP rates represent optimized training, **not average observed XP/hour**. Weekly XP gains do not reveal playtime. This competitive sample is biased and cannot measure population-wide popularity. The simulator uses explicit ordinary-training ceilings and level scaling, caps efficiency rates at 70%, and adjusts authored popularity preferences only slightly using sample participation. Agility and Runecraft remain slower and less frequently selected for general players; archetype preferences allow specialists to focus on them. The 29× baseline is shaped by weekly and daily intensity, randomized morning/lunch/evening peaks, and smaller correlated fluctuations. UTC schedules have 96 periods, a minimum of 11×, and a maximum of 70x including the existing 15% weekend uplift. Weekends shift activity later. Daily averages vary around the baseline (about ±9%, before weekend uplift). The date-seeded pattern is shared by all players and reproducible across retries. Elapsed windows crossing period or midnight boundaries weight each rate by time; the resulting multiplier applies once. Session history records the awarded scale; published metadata includes the current scale, its factors, and the day’s complete distribution. Old global tier XP multipliers no longer stack on the scale; skill multipliers influence selection instead.

Each 15-minute opportunity samples activity duration, including inactive sessions. Players hold skill goals across sessions and move through grind, steady and recovery phases. Persistent aptitude, evolving momentum, fatigue and execution variation alter XP efficiency. Shared stochastic training climates last 1.5–9 hours and change overall activity intensity and the popularity/productivity of one skill. The daily schedule remains a base pattern; climates make macro gains vary beyond that pattern. Skill preferences follow personality, persistent goals and shared training climates. Efficient Maxers prioritize unfinished skills; Skillers strongly avoid combat. XP tier contributes 20% of the activity weights, with personality contributing 80%, before dedication adjusts intensity. Established accounts can take deterministic personal UTC days off. Combat and Slayer award related combat/Hitpoints XP. Elapsed time remains capped at 15 minutes, inactive sessions receive no XP, and each skill remains capped at 200M. No missed-time catch-up is introduced.

Twenty-four internal career archetypes shape activities, skill goals, boss preferences and calendar rhythms. Archetypes are never displayed as profile labels. Treasure trails accumulate steps across sessions and produce caskets and occasional notable rewards.

Profiles show their latest and best session, session count, current focus, rest status, unfinished raids, bank contents and the latest eight notable rewards. Added milestones include 500/1000 total level, base 70, dual Agility/Runecraft mastery, first/100th training session and 1M XP in a UTC day. Session achievements begin with this version rather than inventing historical training logs.

See [the model notes](docs/training-model.md) for base/scaled rates and sampling limitations.

The username migration runs once with `POST /api/admin/users/rename-all` and `{"dryRun":false}`. It atomically saves original player records and history under `backup:username-v1:*`, rebuilds profiles and rankings with the new names, and records the old-to-new mapping in `system:username-migration:v1`. Repeating it returns the saved mapping without changing names again.

## Boss and wealth simulation

Sailing and 48 encounter categories share the existing world. Training uses calibrated XP rates, independent of supplies, cash or trading. Boss sessions use stat unlocks, estimated readiness, experience, personality and luck, with a shared session time budget and reduced world multiplier. Loot and estimated activity costs update bounded bank values at fixed catalog prices. Existing accounts, XP, KC, achievements, inventory and progression history remain intact. Arrivals and retention settings are unchanged. See [the simulation model](docs/simulation-economy.md) for accounting, migration and limitations.


## Gains and records

The public **Gains & records** page (`#progress`) tracks XP, skill and boss gains, rank rises/falls, player timelines, daily records, training streaks and rank-one reigns. Filter by today, 7 days or 30 days and any skill or boss. History starts at the first capture and retains 35 UTC dates; lifetime records remain. The live simulation stays in its Durable Object, with retryable publication to D1.

The release pipeline creates/resolves the named history database and applies migrations before Worker deployment. Add **Account / D1 / Edit** to the Cloudflare release token. Local preview needs `cd workers && npx wrangler d1 migrations apply osrs-hiscores-history --local` before `npx wrangler dev`. See [progress history](docs/progress-history.md) for data definitions, storage, quotas and manual deployment.


## Rare rewards and wealth progression

The roster now includes 48 encounters. The expansion adds Nex, Corporeal Beast,
Nightmare and Phosani, all four DT2 bosses, both Gauntlets, six Wilderness bosses,
Kalphite Queen, Abyssal Sire, Grotesque Guardians, Obor, Bryophyta, Araxxor, Yama
and Doom of Mokhaiotl. Existing Zulrah, God Wars and Hydra tables have more named
uniques. Selected tradeable rewards and item identities were researched using
[OSRS Wiki encounter pages](https://oldschool.runescape.wiki/w/Boss) and its
[item mapping API](https://prices.runescape.wiki/api/v1/osrs/mapping) on November 4, 2026.

These are authored simulation models, not exhaustive live-game drop tables or
live GE prices. Team contribution, keys, quests, preparation, delve depth and
component assembly are approximated through effective per-player encounter and
reward rates. Araxxor's completed halberd uses an effective 1/600 reward rate for
its three-piece assembly. Untradeable vestiges, axe pieces and pets are excluded
from priced rewards. Nightmare's orb table rolls independently of armour/staff;
each raid completion still permits only one purple. New boss ladders begin at
zero. The original 24 boss keys retain their packed-history positions, and the
one-time recovery plan continues to use its own immutable boss-key list.

Rare trading is a bounded settlement step inside each scheduled world transaction,
with up to 64 exchanges per tick. It matches participating players first, then
allows outside sales. Outside resale stock comes only from real recorded sales;
there is no generated rare-item shop supply. Purchases use cash, retain a reserve,
and never borrow. Fixed catalog estimates determine prices, and sellers pay a 2%
tax. Player trades conserve items and total wealth less tax; outside cash/item
flows are tracked explicitly. Each profile retains its latest eight trades and
lifetime drop discoveries. Collectors keep their first copy; self-sufficient
Iron Soul accounts do not trade. Other owners can choose to sell a first copy,
and duplicate rares are sold more readily. These are simulated account decisions.

Ordinary XP and levels remain independent of cash, supplies, trading or purchases.
Wealth adds up to 10% to training efficiency; the best retained relevant upgrade
adds up to 18%, with skill gates and no duplicate stacking. Expensive components
have authored upgrade potential rather than full finished-weapon power. Optional
funded methods add up to 25% to buyable-skill training and debit real costs. These
bonuses add, for at most 53% extra training efficiency. Gear also gives up to 18%
extra bossing efficiency. They affect future active sessions, never grant instant
XP on acquisition or sale, and never penalize the base rate when money runs out.
Routine cost accounting redeems ordinary resources but preserves rare holdings;
unaffordable costs are recorded unpaid. The existing 1T bank safety ceiling can
still sink excess assets. All ordinary skill XP remains capped at 200M.

Boss pages show selected notable rewards; bank profiles show the latest training
bonus and recent purchases/sales. `/api/world` includes the latest `rareTrading`
summary. The old `/api/exchange` remains retired. Simulation updates need no
external price requests. Capacity checks include profiles packed with discoveries
and recent trades; their resource figures are local projections, not production
measurements.
