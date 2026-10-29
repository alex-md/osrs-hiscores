# Progression recovery

The v3 economy made an incomplete, closed supply chain a prerequisite for most
training and all bossing. Persistent goals kept attempting unavailable recipes;
method profitability also overrode training rates, sometimes selecting materials
with no source. Bank value treated illiquid inventory as recipe funding. The
exchange allocated all available order cash to the first ingredient, and training
requests could overwrite a boss's reserve for the same input.

The recovery keeps skill gates, completed-action XP, owned-item consumption,
existing player records and the bounded exchange. Training rates/preferences now
lead decisions, with small price adjustments. Recipes use owned inputs and
spendable cash. A separate paid supply service fills missing consumable bundles;
renewable surplus can fund those purchases at a discount. Neither service creates
GE trades. Blocked training goals yield to cash earning or another available skill.
Boss and training reserves merge, orders share funding across ingredients, and
partially supplied boss trips return unused time to training.

The service is an authored simulation mechanism, not a reproduction of OSRS shops.
It adds explicit item sources/sinks and coin sources/sinks, so this intentionally
changes the economy from entirely closed to partially open. Equipment and rares
retain player-only supply. No balances, XP, achievements, kill counts or history
are reset or retroactively replaced.

## Offline validation against the live population

A read-only public snapshot captured 1,132 existing players, with market generation
`2026-10-29T06:15:55.031Z` (October 28 in Phoenix). Their latest saved economic
sessions included 1,006 zero-action sessions and zero boss sessions. Median cash
was 0 GP. These latest-session fields are not a count of all current active players.

The offline replay uses 15-minute updates, the same initial population and quotes,
and a fixed random seed. Each version runs its actual decision paths, which consume
randomness differently; these are population comparisons rather than identical
individual session outcomes. No live updates were triggered for this analysis.

| First simulated day | Existing code | Recovery |
| --- | ---: | ---: |
| Active sessions with no XP | 74.59% | 0.39% |
| Players gaining XP | 1,131 | 1,132 |
| New boss kills | 0 | 2,401 |
| Completed GE fills | 42,867 | 78,807 |
| Total XP awarded | 3,871,342,990 | 6,315,588,429 |

The recovery also produced gains in every skill. Previously Fletching and Crafting
had none, while Runecraft and Construction made almost no progress.

Over seven simulated days, every player gained XP, there were 9,131 new boss kills
and 497,762 completed GE fills, and 0.33% of active sessions gained no XP. Bossing
continued on every day (925 kills on day seven). This validates recovery from the
captured state; it does not establish long-term equilibrium or production results.

`workers/src/recovery.test.js` covers funded restocking, exact accounting, surplus
liquidation, protected equipment, usable method selection, blocked-goal recovery,
bundle funding/reserves, and a supply-starved mixed population over three days.
Existing tests were updated where they specifically required prices to overpower
training or required cash-rich players to remain supply-starved.

Validation passed: 123 Worker/project tests plus 5 release tests, JavaScript checks,
the 5,000-player real-runtime capacity harness, and the Wrangler deployment dry run.
The capacity harness projected 27,552 scheduled writes/day and 4,122,944 reads at
the request limit, below its existing acceptance gates. No frontend changes or
storage migrations are required. Actual post-release scheduled progression still
needs checking against the deployed revision.

## One-time compensation authorized after the fix review

The owner explicitly requested a one-time injection for approximately twelve lost
hours. Exact historical session inputs and RNG state are not retained, so this is
an **estimated compensation grant**, not reconstructed historical activity.

The immutable plan is `workers/data/progress-recovery-2026-10-28.js`, ID
`2026-10-28-12h-v1`. It was generated from a fresh public snapshot ending
`2026-10-29T06:45:55.906Z`, covering the preceding twelve hours (October 28,
11:45 AM–11:45 PM Phoenix time). Its input SHA-256 is embedded in the plan. The
builder `scripts/build-progress-recovery.mjs` archives the broken `cc08c5a`
revision and replays both versions from the same captured state. Per-user,
per-interval seeds and shared climates keep the comparison reproducible. Accounts
created during the interval receive only their elapsed portion.

Because a snapshot of each player's exact state twelve hours earlier is absent,
the replay uses current saved skills, goals, inventories and market quotes. It
estimates missed progress at that readiness, not the precise lost outcomes.
For each account, positive skill differences are proportionally reduced to the
net total XP difference; boss differences use the same rule. This prevents
redistribution between skills/encounters from inflating the total compensation.
No award is made for a nonpositive net difference. Awarded XP remains capped at
200M per skill and levels are recalculated from XP, rather than separately added.

The reviewed preview is 1,042 recipients out of 1,132 players, 1,582,574,673 XP,
45,522 levels and 1,674 boss kills. Current-state cap checks can reduce actual
awards. There are no items, GP, loot rolls, fabricated trades, extra arrivals or
replayed cron intervals. The user-authorized injection is deliberately separate
from ordinary inventory-backed progression.

After release, an authenticated POST to
`/api/admin/progress/recover-2026-10-28` defaults to a read-only preview. Applying
requires `{"dryRun":false,"planId":"2026-10-28-12h-v1"}`. The API accepts no arbitrary
XP/KC data. It matches username and creation timestamp and refuses rolled-back
progress; missing/replaced accounts receive nothing. SQLite atomically commits
125-player backup shards, updated profiles/rankings/achievements/history outbox,
and `system:progress-recovery:2026-10-28-12h-v1`. A repeat returns the saved result
without granting anything again; per-player markers provide a second guard.

Each recipient has an explicit `recoveries` entry with estimated status, interval,
application time and individual XP/KC. Existing session counts, last-session and
best-session records are preserved. Progress history records the correction when
it is applied; earlier daily history is not rewritten to imply those sessions
were observed. D1 publication uses the existing retryable post-commit outbox.
