# Simulation and bank accounting

Updated November 14, 2026. Item prices now evolve in a persistent supply-and-demand
model, with a public Item economy page and `/api/economy`. Rare trading settles at
current quotes. The former Grand Exchange order book remains removed; old
`system:exchange` records remain inert. No accounts or history are reset.

## Progression

Training uses `expectedRate` from the calibrated training model, skill level,
active session hours, the time-of-day XP multiplier, personal training state and
shared training climate. Wealth, retained upgrades and funded methods add bounded
bonuses. Buyable training is limited to the fraction affordable from pre-session
cash and ordinary assets at current quotes. Accounts with less than 1,000 GP
spendable temporarily earn money while retaining their longer-term skill goal.
Skills cap at 200M XP. Buying supplies does not require their gathering skills:
every archetype follows main-account trading rules.

Bossing keeps combat/skill unlocks, persistent preferences, experience, luck and
an estimated readiness factor derived from bank value. Encounters require a
usable offensive style and an affordable supply budget before rewards. Encounters
configured with no supply costs remain accessible without cash. Exact equipment
purchases, inventory recipes and other players are not prerequisites.
Bossing and training share one session time budget. KC uses the square root of
the world multiplier, with the activity multiplier capped at sqrt(31). The world
XP schedule uses an 11x floor, 29x baseline and 70x ceiling. Combat XP divides
out that KC multiplier before the ordinary XP multiplier is applied, avoiding
double acceleration. Selected whole-item drops and rare rewards remain tied to
recorded kills. No retrospective kills or XP are added by this change.

Personal fatigue, training phases, climate, activity probabilities and the daily
schedule remain active. A few slow hours can still occur naturally; removing the
GE does not force every hour to match yesterday's activity.

## Dynamic prices and bank values

The item catalog provides opening prices and physical production allowances.
`system:economy` persists subsequent prices inside the same SQLite transaction as
players, trades, rankings and the simulation-slot guard. No external price feed
is required. Only tagged current-economy quotes are used; archived exchange data
cannot inject prices. Rebuilds republish the saved quotes without advancing them.

Each 15-minute session measures newly produced whole items and estimated supply
use associated with actually paid activity costs. Paid construction raises plank
demand, prayer raises bone demand, bossing raises food/potion/ammunition demand,
and so on. These spending baskets are authored estimates, not completed trades
or exact recipes. More production pushes prices down; demand pushes them up.
Owned inventory relative to the opening stock adds scarcity/surplus pressure.
Rare resale stock is included, and eligible players with enough disposable cash
add upgrade interest only for gear that improves their existing equipment.
Iron accounts do not contribute purchase interest. Supply/demand rates smooth
over six hours, so one large session does not instantly reprice the world.

A bounded coin inflation factor compares average cash with opening conditions.
Prices tend toward opening value adjusted by inflation, flow imbalance and
scarcity. Market depth absorbs small changes; fractional internal quotes let
cheap goods accumulate movement before rounding to whole GP. Fair values move
at most 2% per full update and stay between 15% and 8× opening estimates (minimum
1 GP). Displayed integer prices for very cheap goods can jump by more than 2%.
These bounds and the opening anchor are deliberate simulation stabilizers.

Prices determine bank valuations, voluntary rare purchases/sales, reward values
at discovery and the cost of modeled spending baskets. Physical drop/resource
quantities do not shrink when prices rise. Base progression continues without
cash or purchases. Changing quotes revalue existing items without changing cash,
owned quantities, lifetime income, XP, achievements or earlier trade/drop records,
except for the pre-existing explicit 1T asset-ceiling sink.

The Item economy table shows prices, last-update/24-hour changes, up to 97 quotes
(24 hours at normal cadence), price pressure, new supply and estimated demand.
Younger markets show available history. Each bank stores the exact held-item
quotes and changes from its generation, so profile rows and wealth rankings agree.
Profile shards hold 48 players to leave space below SQLite's row-size limit.

Accounts retain their cash, whole-item holdings, earned/spent totals, rare-drop
counts and death records. Existing fractional legacy baskets still migrate once:
whole items remain and their fractional remainder becomes rounded cash. New
accounts receive the existing explicit opening bank estimate and representative
integer item basket, without fabricated historical kills or drops.

Price movements are recorded in `economy.revaluation`; items and cash are not
replaced or reset. Prices describe this simulated world, not current live OSRS GE
quotes. The model has estimated outside activity, liquidity and spending demand;
it is not a full exchange matching engine or exact inventory/crafting simulation.

Skilling generates estimated income or representative whole-item resources based
on level, elapsed activity time and modest session variation. It does not use
resource recipes to determine XP. Bossing generates drops from its selected drop
tables. Estimated training, supply and death costs debit available bank value.
Cash pays first, then ordinary whole items are redeemed at the current simulated market value;
any excess remains as cash. Rare holdings are preserved for voluntary sales.
Buyable training, paid boss attempts and clue work are bounded by pre-session
spendable assets; rewards cannot fund the attempt that generated them. Gathering
can still earn income without an upfront bank. These costs are an abstract
accounting model rather than an exact OSRS inventory simulation.

`economy.flows` records created/removed whole items and coin sources/sinks. Bank
value stays at or below the existing 1T GP safety ceiling using explicit asset
sinks. Existing GE fill counters, needs and restock records can remain on old
player documents as inactive historical fields. They no longer drive progress.

## Population and storage

Arrivals retain the existing reduced rate and 2,000-player cap. Daily retention
cleanup and its configured grace/established-account protections are unchanged.
Retired assets remain recorded. This change does not run a separate cleanup.

The SQLite Durable Object owns live player state. Each 15-minute update commits
profiles, rankings, economy prices, training climate, population metadata, history outbox and the
simulation-slot guard atomically. D1 retains public daily progression history.
Existing achievements, recovery audit records and history remain intact.

## Verification

- `npm test`: progression, empty-bank/buyable goals, whole-item accounting,
  dynamic prices, archived exchange isolation, time budgets, transaction rollback,
  history and recovery preservation.
- `npm run check`: JavaScript syntax.
- `npm run capacity`: disposable 2,000-player workerd storage/CPU/read checks.
- `node scripts/economy-replay.mjs 288 100`: deterministic three-day, 100-player
  economy experiment with active pricing/trading and bank-accounting invariants.
  Accepts tick/population counts; makes no network requests or production writes.
- `node scripts/simulation-health.mjs /tmp/snapshot.json 288`: deterministic
  three-day offline replay. Input requires `users` from the public batch API and
  `generatedAt` from the world API; older saved snapshots with
  `exchange.generatedAt` are also accepted. No production writes occur.

The historical October 28 recovery plan remains fixed and idempotent. Its audit
builder loads both original algorithms from pinned Git revisions, so removing
the exchange does not silently change that prior compensation calculation.

## Emergent careers and the noticeboard

See [emergent world](emergent-world.md) for personality blending, rest days,
maxing goals, raid progress, common reward allowances, bounded loot logs,
world stories, diagnostics and release validation.

Raid work accumulates a fractional completion across sessions. A returning raider
finishes that encounter before choosing another. Attempts consume their assigned
time and estimated costs even when no completion occurs; incomplete attempts
produce no item rewards. Ordinary zero-kill attempts also consume time. Raids
award completion XP and loot when the completion is recorded. Personality-based
days off preserve the unfinished raid.

Explicit partial drop tables have an authored common GP allowance covering their
missing common rewards. The allowance subtracts the expected value of common
items already in the table, then pays the remainder as coins per recorded kill.
Rares remain separate item rolls. This is an authored simulation, not a claim
about live OSRS profitability or exact drop tables. Group Dagannoth hunts and
solo king hunts are separate sessions; a kill enters only the selected category.

Costs retain estimated, actually paid and unpaid amounts. Historical unpaid costs
never create debt. Current paid methods are affordability-limited; unpaid gathering
overhead remains an estimate. The existing asset ceiling remains an explicit
sink. New notable-loot records identify the session's final KC when the reward
was recorded, not a fabricated exact per-kill drop timestamp. Existing holdings
and historical kill counts are unchanged.

See [rare rewards and wealth progression](../README.md#rare-rewards-and-wealth-progression) for bonus limits, stock and tax accounting, encounter approximations, retained rares and history compatibility.

See [logical integrity audit](logical-integrity-audit.md) for cross-system rules, regression coverage and remaining model boundaries.
