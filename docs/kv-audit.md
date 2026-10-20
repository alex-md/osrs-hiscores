# KV quota audit and Durable Object cutover

Audited the checked-in Worker, Pages Function, frontend, scripts and GitHub workflows on October 20, 2026. Baseline: commit `4c04f28`.

## Original operation inventory

`workers/wrangler.toml` bound `HISCORES_KV` to namespace `884ba8e6b3484b0eb148b1e847c7a29a`.

| Original code | Operation | Callers and frequency |
| --- | --- | --- |
| `workers/src/store.js`, `writeJSON` | KV `put` | `putUser`, achievement metadata, manifest and `system:last-run` |
| `workers/src/store.js`, `allUsers` | KV `list` for every page of `user:*`, then bulk `get` | Cron, seed/rebuild/deletion, **public username-generation dry-run**, and public snapshot fallback |
| `workers/src/snapshots.js`, `publishSnapshot` | One KV `put` per changed/newly unlocked player | All simulation cycles; writes deduplicated by player, but still proportional to population |
| Same function | KV `put` per ranking/profile shard | Every publication; approximately `ceil(N/500) + ceil(N/100)` writes |
| Same function | KV `put` for changed firsts, counts, event log and manifest | Every publication, with some metadata writes conditional |
| `workers/src/simulation.js`, `runScheduled` | KV `put` for last successful run | Each scheduled or authenticated manual simulation |
| `workers/src/index.js`, delete route | KV `delete` per selected player | Authenticated live deletion only |
| `workers/src/index.js`, response cache | **Cache API** `put` | Public cacheable responses; this is not a KV operation |

There were no other KV `put`/`list` call sites, middleware, WebSockets, or minute-level scheduled jobs in the repository. The cron expression was already `0 */4 * * *`, or six invocations/day. The calibration script fetches Wise Old Man locally and writes source files, not KV. GitHub workflows had no scheduled API callers; Worker publishing is manual. GitHub Pages publishes on main pushes and delegates API traffic to the Worker. Cloudflare Pages delegates requests to the same API code.

## How writes and lists were coupled

`allUsers -> publishSnapshot` enumerated all players before generating ranking/profile shards and persisting changed records. `getSnapshot` called `publishSnapshot` when the manifest was absent or older than 2,500,000,000 ms (about 28.9 days). That made otherwise public reads capable of listing and writing. The in-memory rebuild promise only deduplicated within one isolate, and disappeared after any failed attempt. When writes failed before manifest publication, subsequent public requests could enumerate and attempt publication again. `GET /api/generate/users/dry-run` also always enumerated users, even with a valid snapshot, without authentication.

A healthy cron cycle could write approximately `N + ceil(N/500) + ceil(N/100) + metadata` keys if most players changed. Around 1,000 players could exhaust the 1,000-write allowance in one cycle. Bulk puts would not fix this: KV bills writes per key.

The frontend polled `/api/world` once per visible tab per minute. With a healthy manifest this used reads, not lists or writes; with a missing/old manifest it could reach the rebuild fallback. This is a plausible amplification mechanism, not proof of the observed live request rate.

**The repository alone does not establish a continuous 8–12 lists/minute source.** Six healthy cron runs cannot produce that rate for this population. Cloudflare request logs, deployed versions, older Worker/Pages deployments, external callers to the dry-run endpoint, and other users of the account's namespace/quota need checking if list usage continues after cutover. The telemetry is consistent with repeated scans/rebuild attempts, but cannot attribute callers by itself.

## Implemented architecture

The user approved starting fresh because all players are simulated. The Worker now binds only `HISCORES_WORLD`, a SQLite-backed Durable Object, and addresses `main-world` for all API and scheduled requests. No player import or destructive deletion of the old KV namespace is required.

- Normal operation uses **zero KV puts, lists, gets or deletes**, including cron and admin routes.
- Public reads cannot publish anything, even when no world exists.
- Profile shards contain canonical player state. Packed rankings, profiles, manifest and last-run/slot metadata commit atomically in SQLite.
- A failed transaction rolls back all changes. Obsolete shards are removed inside the same transaction.
- One simulation per 15-minute UTC slot is enforced by serialized requests and transactional storage. Failed runs may retry.
- Read responses use the edge cache. Frontend polling is every minute and pauses while hidden.
- The first scheduled or authenticated manual simulation seeds five players. Seed/rebuild/deletion use the same object.
- Pages must bind to the deployed Worker's Durable Object rather than the old KV namespace.

This removes the KV quota failure class. Durable Object request, duration, SQL row and storage quotas remain separate; no unlimited-traffic claim is made. The singleton is appropriate for this small simulated world; a much larger service should partition worlds or separate leaderboard serving from simulation.

## Verification

Node tests exercise SQLite transactions, rollback after an injected write failure, concurrent simulation deduplication, generation cleanup, zero legacy KV access, read-only empty-world traffic, and the singleton/edge gateway. Existing domain, API, ranking and achievement tests remain in the suite. A local Wrangler/workerd run verifies the real Durable Object storage API; Worker and hosted-version Pages bundling are checked separately. Production deployment, the first production simulation, and account usage verification remain deployment steps.

References: [KV pricing](https://developers.cloudflare.com/kv/platform/pricing/), [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).

## Increased cadence after migration

The production configuration now targets 15-minute updates (96/day), with elapsed-time XP scaling and a 5,000-player cap. A local workerd/SQLite measurement at the cap reports 185 rows written/update, or 17,760 scheduled writes/day, versus the Free plan's 100,000 allowance. This includes old-shard deletes and primary-key index work. The repeatable `npm run capacity` check rejects projections at or above 30,000/day. Public GETs perform no database writes, and visible-tab freshness polling is once a minute. These are measured local projections, not live account usage.
