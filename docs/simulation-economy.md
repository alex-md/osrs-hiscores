# Simulation economy

The serialized SQLite Durable Object remains the sole owner of live players,
inventories, prices and exchange state. D1 remains the existing 90-day historical
projection. Public GET requests never advance the simulation or write state.

## Integer ownership and migration

GP, inventories, trades, recorded XP and KC are integers. Rates, work durations,
percentages and XP/action definitions can be fractional; completed actions and
awarded XP are rounded down before storage. Opening bank estimates remain bounded
by the existing 5k–2B policy and do not grow automatically with earned XP.

Legacy fractional holdings migrate once (`inventoryVersion: 2`): retain whole
items and convert the fractional remainder to rounded integer cash at the migration
quote. The conversion records its value in `economy.migration`. This preserves
rounded portfolio value, saved XP, achievements and boss records, and does not
fabricate historic trades. Accounts without an inventory receive whole items from
eight seeded catalog allocations, spending at most 70% of their existing estimate;
the exact remainder stays in cash. This is an explicit opening endowment, not loot.

Every session records item creation/consumption and coin faucets/sinks in
`economy.flows`. Supplies cannot be funded by destroying a percentage of arbitrary
holdings. The 1T safety ceiling uses explicit integer asset removals (`capSink`),
never fractional scaling. Trade tax counts as spending and a coin sink. Market
revaluation remains separate from income and spending.

## Methods, production and decisions

`workers/data/methods.js` defines unlock levels, ordinary actions/hour, XP/action,
integer input/output recipes and explicit coin awards. Mining supplies ores for
Smithing; bars can become platebodies for high alchemy. Fishing supplies Cooking;
food and prayer potions supply PvM. Farming supplies herbs for Herblore; farmer
pickpocket batches provide seeds. Runecrafting consumes essence. Construction,
Prayer, Fletching, Crafting, Ranged and Firemaking consume their actual materials.
Four-dose potion batches preserve the four-herbs-to-three-bottles dose ratio;
leftover/recovered empty vials can be filled again without awarding XP.

Only completed, inventory-backed actions receive recipe XP. Missing inputs post
funded demand to the next exchange; they do not grant a discounted free XP rate.
Methods unlock through the existing OSRS XP/level thresholds. Their selection
balances XP/hour, current input/output prices, available wealth and skill gates.
Relative profitability also changes skill-choice weights. Persistent training
goals retain the existing multi-session behavior rather than switching every tick.
Non-recipe physical activities retain the existing calibrated XP-rate path.
Trading awards no XP.

Training and bossing share one session budget. Existing 6–31x world XP pacing is
retained. Physical work uses its square-root activity multiplier; recipe XP is
rescaled once from completed work. This intentionally accelerates progression
relative to item production, rather than multiplying wealth by the full XP scale.

## Bosses and equipment

The shared catalog now has 24 encounter categories, including KBD, Chaos Elemental,
Kraken, Thermonuclear Smoke Devil, Cerberus and individual Dagannoth Kings.
Existing aggregate Dagannoth history is retained. `drops` entries specify item,
integer quantity, probability and rare-table membership. Common independent drops
and one mutually exclusive rare roll per kill use bounded aggregate sampling;
geometric gaps avoid iterating every kill. New bosses begin at zero recorded KC.

Combat and Slayer gates remain in effect. `workers/data/equipment.js` defines owned
upgrade slots and skill requirements. Equipped item ratings affect kill efficiency;
unused cash cannot masquerade as equipment. Boss weights respond to the expected
value of their own drops less current supply prices. Available food/potions bound
actual kills; supplies are consumed before drops are credited. Death recovery is
a cash sink. Players retain useful equipped items and may buy affordable upgrades
or sell surplus loot through the same exchange.

Source references for selected drops:

- [KBD](https://oldschool.runescape.wiki/w/King_Black_Dragon): bones, two black hides and 1/5000 visage.
- [Kraken tentacle](https://oldschool.runescape.wiki/w/Kraken_tentacle): 1/400.
- [Jagex drop rates](https://www.runescape.com/drop-rates): Dagannoth unique tables.
- [Dagannoth Rex](https://oldschool.runescape.wiki/w/Dagannoth_Rex): Dagannoth bones.

This is a **selected-drop simulation**, not a complete OSRS server. Older encounters
retain authored common reward bundles and rare reward weights. New tables include
selected drops, not every reward. Kill rates, readiness gates, supply usage,
equipment power and some farming/seed yields are estimates. Quests, Slayer-task
assignment, teams, exact combat accuracy, travel, crop timers and ironman trade
restrictions are not reproduced. Some catalog materials currently have no renewable
producer or consumer; they can remain scarce or illiquid. No NPC liquidity or
invented completed sales are added to hide this limitation.

## Grand Exchange and 24-hour records

The catalog has more than 150 tradeable resources, consumables, materials,
equipment and uniques. Additional catalog opening prices are authored estimates;
legacy quotes retain their captured baseline. Persisted world prices always win.
There are no external price requests, daily resets or forced mean reversion.

Each update builds inventory-backed sell orders and cash-funded material/upgrade
buy orders. Input reserves and equipped gear are retained; surplus can be offered.
Offers rotate player priority, cannot self-match, and expire at the next clearing.
The exchange transfers whole items and exact coins, with a rounded-down authored
2% seller fee. Cash checks prevent overspending across multiple orders. There is
no external market maker, short selling, borrowing or persistent limit-order book.

Backed supply/demand imbalance proposes a small quote change with a 1M GP minimum
notional depth, 2% exponential movement bound and integer rounding. The quote
becomes the new price only if a trade completes. Unfilled orders cannot revalue
an account's inventory. Quiet items retain their last price or opening estimate.
Absolute quotes remain bounded to 1 GP–1T GP.

`system:exchange` version 3 retains at most 96 timestamped volume buckets, 98 price
observations (including a boundary quote) and the latest 100 fills within 24 hours.
The API strips transaction records, internal buckets and quote maps. Completed
fills remain in backend storage; the frontend displays market prices only.
Each item exposes:

- `price`: integer closing unit price.
- `volume24h`: actual units matched after the rolling cutoff.
- `circulatingSupply`: sum of owned player quantities after clearing.
- `buyUnits` / `sellUnits`: unfilled units in this update's order book.
- `change`: percentage against the observed quote at the 24-hour boundary; null until available.
- `lastTrade`: timestamp, integer unit price and quantity of the latest completed fill.

Legacy fractional volume/tape is not relabeled as integer or 24-hour activity.
`statsStartedAt` discloses the start of new observation. The UI shows unavailable
changes as a dash and distinguishes quiet items through filtering. GP abbreviations
are presentation only; tooltips preserve exact amounts. The market supports item
search, liquidity filtering, and name, price, volume and circulation sorting.
Tables scroll within the page on small screens, and the exchange uses a wider
desktop register.

## Population and retirement

For an existing population, arrivals average **0.45 per update**, down from 1.5
(70% fewer). Empty-world bootstrap remains five accounts; the cap remains 5,000.
No percentage of the existing population is removed.

Cleanup runs daily before progression. New/legacy records get a 14-day observation
grace. Default inactivity thresholds are 45 days, or 180 for established accounts
(100 sessions, 1M earned XP, 100 KC for a boss, 100 trades, or 10M total XP).
The most recent progression, meaningful economic action, completed trade, saved
update or creation timestamp protects an account. `retention.preserve` exempts it.
Configurable Worker variables:

- `POPULATION_INACTIVITY_DAYS`
- `POPULATION_ESTABLISHED_DAYS`
- `POPULATION_GRACE_DAYS`
- `POPULATION_CLEANUP_INTERVAL_HOURS`

Removed players do not enter the next snapshot, live profile index, rankings or
order book. Coins/items leave circulation, with cumulative retired asset totals
and a bounded latest-removal list at `system:population`. Old live snapshot shards
are removed by the existing atomic generation commit. Historical D1 observations
remain accurate historical records until their normal retention expiry; recent
ledger entries remain historical transactions, not outstanding orders.

## Validation and bounds

Run `npm test`, `npm run check`, `npm run capacity` and a Wrangler dry-run bundle.
Tests cover integer conversion, cash/item conservation, funded production and
supply consumption, unlocks, drop generation, economic choices, retirement,
rolling statistics, frontend number formatting and existing world rollback paths.
Browser checks use local simulated fills, including search/direction filters and
mobile overflow. These are local validation, not a production deployment or
long-run calibration of a live economy.

The local 5,000-player capacity harness exercises the serialized scheduled update,
packed profile/ranking reads, exchange and 30-day historical queries. Its existing
storage/database limits remain the acceptance gate. Profiles still use 125-player
shards; historical publication keeps the existing idempotent outbox. All added
histories, order state and accounting maps have catalog/population bounds, rather
than storing one database row per kill, resource action or trade.
