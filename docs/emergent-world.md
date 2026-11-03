# Emergent world experiment — November 2, 2026

This release preserves existing XP, KC, items, achievements and history. It changes
future behavior. Lower total XP/KC than the prior universal T10 activity pattern
is expected; the aim is careers that remain different, with room for quiet days,
long raids, specialists, jackpots and competition.

## Rules

- Activity weights blend 80% archetype and 20% XP tier. Persistent dedication tilts
  activity intensity, and even grinders retain a small inactive probability.
- After two days, each account has a date-seeded chance of a full UTC rest day:
  1.5% + 7.5% × (1 − dedication), plus 6% for Idlers. Traits, not the current name,
  seed the decision. Rest does not erase goals or unfinished raids.
- Efficient Maxers heavily favor unfinished skills and abandon post-99 goals while
  a skill remains unmastered. Skillers apply a 0.04 selection weight to combat and
  Slayer. Existing combat XP is retained; Skillers are not retroactively pures.
- World XP calibration and the 6–31× ceiling stay intact. Personality now affects
  how often and how long an account participates rather than inflating that scale.
- Raid work persists as a fractional completion per encounter. Returning bossers
  complete a pending eligible raid before starting a different encounter. All
  attempted boss time is consumed, including zero-kill sessions. Raid supplies
  are estimated per unit of work; loot requires completed encounters.
- Explicit incomplete reward tables receive a common-GP allowance, net of the
  expected value of included common items. Rares remain individual item rewards.
  Prices and probabilities are authored estimates, not live game data.
- Group Dagannoth hunts are a distinct mode from solo Rex/Prime/Supreme sessions.
  Each defeated king increments one category only; legacy records remain.

## Visible stories

`GET /api/stories` reads the current snapshot. It exposes at most 48 stored events,
three race-to-max contenders, and leading overall/boss/wealth rivalries. Events
include observed crown changes, rare skill mastery/maxing milestones, notable
item rewards and boss-count milestones. The first new snapshot establishes crown
baselines rather than inventing older changes. Existing item holdings are never
converted into acquisition events. Rebuilds do not re-emit old rewards.

Profiles show cash, the ten most valuable holdings with quantity/value/bank share,
an expandable remainder, and eight recent notable loot entries. Acquisition logs
are bounded and do not promise a lifetime collection log. Costs show actually
paid spending and, from this release onward, estimated costs left unpaid. Missing
funds never block training or bossing. Legacy revaluation and asset-ceiling sinks
explain why lifetime income is not the current bank balance.

Filters appear above ladders. Mobile has a compact horizontally scrollable main
navigation and collapsible skills/categories; a compact player search remains above the main content. Tables show a sideways-scroll cue when columns overflow. Partial
UTC days use striped chart bars. Raids use completion labels.

## Operations and capacity

`/api/health` and `/api/debug` include read-only diagnostics. Liveness is separate
from `diagnostics.progression.state` (current, stale or awaiting first update).
More than two update intervals without success is stale. Computation duration,
last successful update, next expected boundary, active/resting population, pending
history days, last captured publication, publication lag and failures are exposed.
Counters begin at this release and survive later successes. An unavailable
publication timestamp is unknown, not proof of zero lag. Failed history
publication never rolls back committed player progress; diagnostics are best-effort
if storage itself is unavailable. Cloudflare account-wide usage requires its own
monitoring and is not inferred from these counters.

Run `npm run capacity` to measure disposable local workerd/SQLite/D1 at 5,000 players
with full loot logs and raid progress. Guardrails remain <30,000 scheduled DO row
writes/day, <4.5M projected reads at the request limit, <1.9MB per document, and
zero writes on public reads. DO and D1 writes have separate limits. No benchmark
contacts or mutates production. This release measured 27,456 scheduled DO
row writes/day and 3,936 D1 writes/day, with a largest document of
1,570,729 bytes, including full loot logs. The conservative read projection
was 4,123,136 DO rows/day. Local scheduled computation took about
1.6 seconds; this is not a production latency guarantee.

## Internal career expansion

Thirteen additional internal archetypes broaden the original eleven. They never
appear as profile labels, badges, filters or explanations in the website. The old
archetype label has also been removed. Players see activities and accomplishments.

| Internal motive | Distinct behavior |
| --- | --- |
| Raid specialist | Strong raid selection and persistent completions |
| Collection hunter | Unvisited bosses and rare items absent from produced loot |
| Clue hunter | Frequent multi-session treasure trails |
| Wanderer | Short skill goals, exploration and occasional clues |
| Completionist | Neglected skills and unvisited encounters |
| Gatherer | Resource skills and little bossing |
| Artisan | Production skills independent of wealth |
| Slayer specialist | Slayer training and unlocked Slayer bosses |
| Rune scholar | Runecraft, Magic and Prayer |
| Weekend warrior | Quiet weekdays and intense UTC weekends |
| Comeback player | Three days away, three intense, four steady in a personal ten-day cycle |
| Single-skill purist | A persistent personal specialty, including post-99 |
| Crown chaser | Stronger preference for skills where a crown is within reach |

New arrivals sample the full roster. A deterministic one-time adoption gives 42%
of existing generalists a new direction, preserving their stats, assets and
achievement history. Preferences and current goals change on a simulation update,
not a public read. Existing specialized accounts retain their identity.

Treasure trails share the session budget with training and replace bossing for
that session. Four accumulated steps complete a casket; unfinished steps persist.
Each casket creates an authored 20k–120k ordinary coin reward and has a 1/200
Ranger boots roll at a fixed authored 12M estimate. These are intentionally simple
simulation rules, not real clue loot odds. Travel costs remain affordable-only.
Clue counters and steps appear as observed activity, without exposing archetypes.

## Offline experiment

Before the additional career roster, a seeded seven-day replay of the November 2, 8 PM Arizona snapshot (1,340 accounts)
produced 137.18B XP and 92,625 boss completions/kills, three fully maxed accounts,
and zero invalid cash/inventories. Daily observation points had 61–82 resting
accounts. Mean seven-day XP gains were 215.5M for Efficient Maxers, 185.6M for
Elite Grinders and 63.7M for Idlers. Mean KC was 295 for PvMers versus 18 for
Idlers. These cohorts have different starting stats and sample sizes; this is an
offline experiment, not a controlled causal estimate or production forecast.

After the full 24-motive roster and treasure trails were added, the same seeded
seven-day starting snapshot produced 144.31B XP, 104,427 boss kills/completions,
14,001 treasure caskets, 2 maxed accounts and zero invalid cash/inventories.
These are offline outcomes, not promised live rates.
