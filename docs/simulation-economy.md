# Simulation and bank accounting

Updated October 29, 2026. The Grand Exchange has been removed, including player
orders, price changes, trade fees, the public market page/API and market telemetry.
The simulation does not read or update `system:exchange`. Old exchange records
remain inert in storage; no account reset or historical rewrite is performed.

## Progression

Training uses `expectedRate` from the calibrated training model, skill level,
active session hours, the time-of-day XP multiplier, personal training state and
shared training climate. Cash, recipes, input availability and market prices do
not limit XP or steer skill choices. Persisted skill goals can continue directly,
including buyable skills on accounts with empty banks. Skills cap at 200M XP.

Bossing keeps combat/skill unlocks, persistent preferences, experience, luck and
an estimated readiness factor derived from bank value. It does not require an
owned equipment purchase, spendable cash, food, potions or another player.
Bossing and training share one session time budget. KC uses the square root of
the world multiplier, bounded by the existing 6–31x XP scale. Combat XP divides
out that KC multiplier before the ordinary XP multiplier is applied, avoiding
double acceleration. Selected whole-item drops and rare rewards remain tied to
recorded kills. No retrospective kills or XP are added by this change.

Personal fatigue, training phases, climate, activity probabilities and the daily
schedule remain active. A few slow hours can still occur naturally; removing the
GE does not force every hour to match yesterday's activity.

## Fixed bank estimates

The bundled item catalog supplies fixed GP estimates. There are no price refreshes,
order books, supply chains, recipes, restock budgets or liquidity checks.

Accounts retain their cash, whole-item holdings, earned/spent totals, rare-drop
counts and death records. Existing fractional legacy baskets still migrate once:
whole items remain and their fractional remainder becomes rounded cash. New
accounts receive the existing explicit opening bank estimate and representative
integer item basket, without fabricated historical kills or drops.

Switching an existing item bank from the former floating quotes to the catalog can
change its displayed bank value. This is recorded in `economy.revaluation`; its
items and cash are not replaced or reset. The fixed catalog is an estimate, not
current real-world GE pricing.

Skilling generates estimated income or representative whole-item resources based
on level, elapsed activity time and modest session variation. It does not use
resource recipes to determine XP. Bossing generates drops from its selected drop
tables. Estimated training, supply and death costs debit available bank value.
Cash pays first, then whole items are redeemed at the same fixed catalog value;
any excess remains as cash. An exhausted bank pays only its available balance,
without blocking training or kills or borrowing below zero. These costs are an
abstract accounting model rather than an exact OSRS inventory simulation.

`economy.flows` records created/removed whole items and coin sources/sinks. Bank
value stays at or below the existing 1T GP safety ceiling using explicit asset
sinks. Existing GE fill counters, needs and restock records can remain on old
player documents as inactive historical fields. They no longer drive progress.

## Population and storage

Arrivals retain the existing reduced rate and 5,000-player cap. Daily retention
cleanup and its configured grace/established-account protections are unchanged.
Retired assets remain recorded. This change does not run a separate cleanup.

The SQLite Durable Object owns live player state. Each 15-minute update commits
profiles, rankings, training climate, population metadata, history outbox and the
simulation-slot guard atomically. D1 retains public daily progression history.
Existing achievements, recovery audit records and history remain intact.

## Verification

- `npm test`: progression, empty-bank/buyable goals, whole-item accounting,
  fixed quotes, archived exchange isolation, time budgets, transaction rollback,
  history and recovery preservation.
- `npm run check`: JavaScript syntax.
- `npm run capacity`: disposable 5,000-player workerd storage/CPU/read checks.
- `node scripts/simulation-health.mjs /tmp/snapshot.json 288`: deterministic
  three-day offline replay. Input requires `users` from the public batch API and
  `generatedAt` from the world API; older saved snapshots with
  `exchange.generatedAt` are also accepted. No production writes occur.

The historical October 28 recovery plan remains fixed and idempotent. Its audit
builder loads both original algorithms from pinned Git revisions, so removing
the exchange does not silently change that prior compensation calculation.
