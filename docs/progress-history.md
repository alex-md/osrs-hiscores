# Public progress history

`#progress` is linked from the main navigation and from player profiles. `GET /api/progress` is public. It supports `days=1|7|30`, `metric=overall|<skill>|bosses|<boss>`, `sort=gains|rises|falls|xp-streak|boss-streak`, `username` and `page`. Pages contain 25 players. Each response includes daily chart values, current and longest rank-one reigns, daily gain/climb/fall records, session XP records and XP/boss activity streak records.

## Meaning of the numbers

Days use UTC calendar boundaries. Seven days means today and the six preceding dates, rather than a rolling 168-hour window. The current day and first tracked day are partial. XP/KC are cumulative; rank falls mean places lost. Overall ranks follow the existing total-level, total-XP ordering. A formerly unranked boss player has no starting rank, so movement stays unclassified rather than counting a fabricated climb.

Daily rank records retain the largest observed move from that day's opening rank, including partial-day peaks.

The first capture establishes a baseline for existing players. New players start at their generated scores. Neither starting XP nor starting boss kills count as earned gains. All records start with history capture; existing lifetime/session aggregates are not backdated into this history. Rank-one durations measure uninterrupted observed ownership between captures, with the live ranking tie-break rules. Gaps between observations do not prove continuous ownership during downtime.

XP and boss streaks count consecutive UTC days with positive XP/KC gain. Repeated updates in one day do not extend a streak. An inactive day breaks the streak; a skipped date also breaks it. Historical longest streaks and records persist in the Durable Object even after daily history expires.

The leaderboard compares the latest population with its baseline at the start of the selected window. Entrants use their initial captured baseline. Deleted accounts remain in earlier daily totals and records but leave the current leaderboard. A named player timeline still reads that player's retained daily rows.

## Storage and publication

The existing SQLite Durable Object remains authoritative. Snapshot publication records per-player baselines, cumulative counters and current ranks; a compact record/reign summary; and one pending daily publication in the **same SQLite commit** as the live world. No separate queue service is required for this first version.

After that commit, the object publishes the pending day to D1 in one atomic batch. The key is `(UTC day, shard)`, with up to 125 players per shard. Updating or replaying a day replaces those keys. A failed D1 batch cannot undo the committed simulation. The outbox remains for the next successful POST/scheduled update to retry. Publication acknowledgement removes the outbox only after D1 succeeds; a crash before acknowledgement safely replays the batch. Public history reads do not advance the simulation or perform writes.

The history API runs separately from the simulation queue. It compares only the first and latest daily captures for leaderboard windows, and reads precomputed world daily totals for charts. Named timelines read one indexed shard per day. It does not run a JSON table scan of every player on every day. Successful responses are edge-cacheable for 60 seconds. Published timestamps identify the actual captured data; D1 outages may leave history behind the live hiscores.

Daily player shards and summaries retain **35 UTC dates**, enough for the 30-day view with margin, and expire on successful publication. Pending publications use the same retention bound. Records and longest streaks survive retention. There is no reconstruction of history from before tracking began.

At 5,000 players there are 40 daily player rows plus a daily summary. A successful update upserts those rows and removes the acknowledged outbox. The capacity benchmark includes 30 days of worst-case maxed-player history, actual D1 read counts for the monthly API, and simulated world read/write accounting. Exact production quota use still depends on traffic and retries.

## Setup and releases

Local development:

```sh
cd workers
npx wrangler d1 migrations apply osrs-hiscores-history --local
npx wrangler dev
```

Wrangler references the provisioned `osrs-hiscores-history` database. Local Wrangler development still uses a separate local database. The release workflow runs `scripts/prepare-history-db.mjs`, which finds or creates `osrs-hiscores-history` in the configured Cloudflare account and writes its real ID into the release checkout. It then applies `workers/migrations` remotely before deploying the Worker. Existing database data is preserved; migrations use Wrangler's migration ledger. The Cloudflare release token needs **Account / D1 / Edit**, in addition to its existing Worker permissions. No token belongs in the repository.

`npm run deploy` follows the same database-setup/migration sequence and requires `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. The lower-level `workers` deploy script expects the database ID and schema to have been prepared already. A missing binding shows a public setup state; a missing schema or D1 outage shows a retryable error while the live hiscores keep working.

API and batch behavior follow the [Cloudflare D1 binding documentation](https://developers.cloudflare.com/d1/worker-api/).

The public health response reports the serving Worker's `revision` separately from `worldRevision`, which identifies the Durable Object's captured environment. Asset-only releases may retain the world instance; release checks still require its successful response and healthy SQLite storage/binding.
