# Sailing, boss records and wealth

This is an authored OSRS-inspired simulation, not an attempt to report real accounts, live item prices or exact drop tables. Sailing joins the shared skill list as skill 24. It has a provisional ordinary training ceiling of 95,000 XP/hour before the world multiplier; the existing Wise Old Man capture predates Sailing. Max total level is 2,376. Combat level keeps its existing formula.

## Player state and upgrade

`normalizeUser` adds missing Sailing at zero XP / level 1. Existing skill XP, account timestamps and unlock history are retained. Historical max-account or 2,277 milestones are not deleted. New 2,376, Sailing mastery and Sailing 200M milestones can be earned.

Each player receives persistent aptitude, risk tolerance, thrift, dedication and a favorite boss. Opening traits use a username seed; after publication they are saved with the account and survive renames. The opening bank estimate is proportional to existing total XP, multiplied by a uniform variation and a lognormal factor. It is bounded between 5,000 GP and 2B GP. This is labeled as an estimate. No historical kills, rare drops or earned-income history are fabricated. Existing saved bank values, counters and traits take precedence on every rebuild.

The bank counter represents modeled banked items plus equipment at fixed authored values, rather than cash alone. Its running flow is opening estimate + earned income − actual spending, subject to a 1T GP safety cap. Income, spending, rare drops and deaths are aggregate counters; only the latest economic session is kept. There is no growing drop or transaction log.

## Coupled sessions

A sampled activity duration is divided between bossing and ordinary skill training. They share the same elapsed-time budget. Inactive sessions do neither. Boss selection depends on archetype, a shared daily appetite for that player's preferred boss, personal dedication, familiarity and appetite for harder encounters. Combat/skill gates and a minimum supply budget limit eligibility. Quest completion, team composition and exact equipment inventories are not separately simulated; the gates are proxies for readiness.

Bossing consumes 60–100% of an active session when chosen. Its effective hours are `boss hours × period-weighted world scale`. Kill intensity is authored ordinary kills/hour multiplied by effective hours, personal aptitude, gear quality (a saturating logarithm of bank value), familiarity (saturating exponential of past KC), level readiness, and bounded lognormal session variation. Small kill counts use an exact Poisson draw; larger counts use a normal approximation. Each session has a 1,000-kill safety bound.

Kills award combat XP from the encounter's modeled HP, with related Hitpoints XP and Slayer XP where applicable. Kill counts are already accelerated, so this XP is not multiplied again. The unused session time trains a skill using the existing ordinary-rate model and the same world scale. Buyable methods lose efficiency when the player cannot afford full supplies, representing slower self-supplied alternatives.

Ordinary loot uses a bounded lognormal value draw. Rare drops use geometric waiting gaps, equivalent to independent Bernoulli chances per kill without a loop over every kill. Rare values have their own bounded lognormal variation. Supply costs depend on kills and thrift; death frequency depends on risk and familiarity, with wealth-dependent recovery costs. Spending never makes the bank negative. Skill income rises with level and varies by session; construction, prayer and other buyables consume wealth. The same world scale accelerates income and costs together, preserving their relationship to scaled progression.

The 16 encounter categories cover early bosses, Barrows, Dagannoth Kings, Zulrah, Vorkath, Muspah, four God Wars generals, Hydra, and three raids. Rates, GP values and gates are deliberately authored estimates. A rare drop is a modeled valuable reward, not a claim that a specific named item dropped. Raids count completions, Barrows counts chests, and Dagannoth Kings is an aggregate category.

## Rankings and storage budget

`/api/activity-rankings?category=bank|bosses|<boss-key>` provides the same pagination/name filtering as skill ladders. Zero-KC accounts are unranked; ties use player names, and filtering preserves global rank. Profiles carry bank/boss ranks from the same published generation as their state. New UI routes are `#wealth` and `#bosses?boss=vorkath`.

All computation happens inside the existing serialized world update. Rankings share the existing 500-player packed documents. Profiles use 125-player documents, so a cold batch across the whole 5,000-player world reads at most 40 profile documents plus the manifest. Existing generations with 100-player packs remain readable through their manifest indexes. The next successful update repacks them atomically. Public reads never initialize or write state. New ranking endpoints use the existing edge cache.

`npm run capacity` uses disposable local workerd/SQLite, creates 5,000 maxed accounts with all boss records populated, measures a scheduled update including index/deletion costs, and exercises cold batch/wealth/boss/profile reads. It rejects scheduled writes of 30,000/day or more, a conservative read projection of 4.5M/day or more at the 100,000 DO request limit (including scheduled calls), any public-read writes, documents of 1.9 MB or more, or a live dataset of 100 MB or more. These are local workload measurements, not production traffic/account-usage telemetry. Cloudflare allowances are shared with unrelated applications; administrative rebuilds and other account usage also need headroom.
