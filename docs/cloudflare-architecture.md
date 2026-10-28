# Cloudflare architecture review

Reviewed against the code and Cloudflare documentation on October 28, 2026.

## Keep the simulation and snapshots in the Durable Object

The scheduled Worker forwards one request to the singleton `HiscoresWorld`.
The object owns simulation, market settlement, and snapshot publication; the
gateway does not compute the ladders. Cloudflare documents a default 30-second
CPU limit for Durable Object requests. Ordinary free Workers have a 10 ms CPU
limit, and free Workflows have 10 ms per step. The proposed 50 ms limit is not
the current free Worker allowance, and moving computation into Workflows does
not automatically provide more CPU.

Profile shards are canonical player state, not disposable public exports.
SQLite atomically commits those profiles, rankings, exchange state, history
outbox, and the simulation slot. Failed updates roll back together, and retries
cannot advance a successful slot twice. Replacing this with R2 would require a
cross-service publication and garbage-collection protocol. Reading a whole world
JSON object for an individual profile would also increase parsing and memory.
R2 is a reasonable future destination for downloadable archives, but the current
bounded snapshot storage does not justify migrating canonical player state.

Ranking shards hold 500 players and profile shards hold 125. Each row is checked
against a 1.9 MB safety threshold under SQLite's 2 MB row limit; old generations
are deleted in the same transaction. D1 progression history has separate daily
shards, retention, and an idempotent publication outbox. Neither store accumulates
a full snapshot every 15 minutes indefinitely.

`npm run capacity` exercises a disposable 5,000-player world in local workerd and
checks row reads/writes, document sizes, history storage, and read-only APIs. Its
elapsed times are not production CPU measurements. Production CPU, memory,
duration, traffic, and account-wide usage still need Cloudflare metrics; no local
benchmark guarantees that an account stays within every free allowance.

## Export market telemetry after commit

`workers/src/telemetry.js` writes to the `EXCHANGE_ANALYTICS` binding after a
successful world commit. It uses the staged exchange and manifest, with no extra
SQL operations. Scheduled and authenticated manual cycles take this same path.
Reads, rebuilds, rejected duplicate triggers, and failed transactions emit nothing.

The `osrs_exchange` dataset is created automatically on its first write. The
binding is configured in `workers/wrangler.toml`; remove that binding to disable
telemetry. The world also runs without it in tests and alternate environments.
Queries use the Analytics Engine SQL API with a separate Account Analytics Read
token; the simulation does not need a query token.

Each cycle emits one summary plus one point per catalog item, including items
without fills so prices and supply remain observable. At the current 159 items
and 96 daily cycles, that is 15,360 points/day, below the documented 100,000/day
free write allowance, before other account usage. Emission is capped at 250
points per invocation (summary plus the first 249 items) for future catalog
growth. Aggregate cycle totals still cover all items.

All points have `blob1 = 'exchange-v1'` and `blob4 = snapshot generation`.
The Analytics Engine event timestamp is ingestion time; `double1` is the
simulation timestamp in Unix milliseconds.

| Field | Cycle point (`blob2 = 'cycle'`) | Item point (`blob2 = 'item'`) |
| --- | --- | --- |
| index1 | `cycle` | Item ID |
| blob3 | Empty | Item ID |
| double1 | Simulation timestamp | Simulation timestamp |
| double2 | Cycle turnover (GP) | Closing price (GP) |
| double3 | Cycle GE tax sink (GP) | Cycle traded units |
| double4 | Cycle fill count | Cycle turnover (GP) |
| double5 | Player count | Closing circulating supply |
| double6 | Unused | Unfilled buy units |
| double7 | Unused | Unfilled sell units |

Cycle metrics are interval totals, not cumulative or rolling 24-hour totals.
GE tax measures exchange fees only, not every coin sink in the simulation.
For example, daily traded units and turnover by item, accounting for sampling:

```sql
SELECT blob3 AS item_id,
       SUM(double3 * _sample_interval) AS units,
       SUM(double4 * _sample_interval) AS turnover_gp
FROM osrs_exchange
WHERE blob1 = 'exchange-v1' AND blob2 = 'item'
  AND timestamp > NOW() - INTERVAL '1' DAY
GROUP BY item_id
```

Analytics is best effort: a crash after the SQLite commit may lose telemetry,
and Analytics Engine can sample data. There is no exactly-once delivery guarantee
or analytics retry outbox. An analytics error is logged and cannot undo the world
commit or make a successful cycle return failure. This dataset is for monitoring,
not authoritative accounting or player history.

The public GE page and the next simulation still use bounded local data:
100 tape entries, 24 item chart prices, 96 rolling volume buckets, and at most
98 price observations for the 24-hour comparison boundary. Moving those fields
entirely into analytics would break their current consumers and introduce query
credentials, sampling, and availability dependencies into gameplay and public reads.

## References

- [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Durable Object limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
- [Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/)
- [R2 pricing and free allowances](https://developers.cloudflare.com/r2/pricing/)
- [Analytics Engine setup](https://developers.cloudflare.com/analytics/analytics-engine/get-started/)
- [Analytics Engine limits and retention](https://developers.cloudflare.com/analytics/analytics-engine/limits/)
- [Analytics Engine pricing](https://developers.cloudflare.com/analytics/analytics-engine/pricing/)
