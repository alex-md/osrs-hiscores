# Logical integrity audit — November 14, 2026

The governing rule is that an outcome must follow from its prerequisites, available resources and the same activity that produces its other effects. Independent random choices are suitable for preferences and variation, but cannot replace causal relationships. All accounts follow main-account rules: skills may be trained with purchased supplies, and every archetype can trade. A low gathering level does not invalidate a high buyable skill.

| Area | Confirmed inconsistency | Enforced behavior |
| --- | --- | --- |
| Account creation | Random Slayer allocation had no combat support; averaged combat levels invented HP | Coupled initial allocation, damage-derived HP, versioned additive legacy correction |
| Slayer sessions | Two combat XP per Slayer XP differed from bossing's four; Slayer rate ignored damage skill | Same-kill rewards using integer awarded XP and a combat-limited rate |
| Buyable training | Empty banks received unlimited calibrated XP and invented ordinary income | Affordable fraction of training, no fabricated buyable income, temporary money-making while goals persist |
| Boss attempts | Rewards could pay for the attempts that produced them; bank exhaustion did not limit work | Pre-session supply funding, bounded attempts/KC, no forced rare liquidation; zero-cost encounters remain possible |
| Boss readiness | High total combat could qualify an account whose offensive skills could not support the encounter; XP style chosen independently | Offensive readiness floor, supported styles for selected encounters, XP awarded only to usable styles |
| Clues | Reward coins could finance an otherwise unfunded expedition | Work limited to pre-session funds; steps and caskets derive from actual funded work |
| Gathering | Level-one gathering produced endgame representative resources | Level-based output selection; thresholds apply to production, never GE purchases |
| Trading | An archetype was excluded from rare sales and purchases | Every archetype can trade; upgrade preferences, cash, stock, taxes and conservation still apply |
| History | Administrative XP correction looked like earned daily/weekly XP | Shifted tracking baselines plus cumulative correction fields across historical comparisons and UTC rollover |

Legacy Magic may support Slayer without requiring invented melee XP. Magic on its own does not imply HP, since noncombat training remains possible. The repair preserves excess HP and existing XP because exact historical methods are unknown. Corrections can change current ranks and unlock stat milestones; they do not become session XP, daily XP records or XP streak activity.

## Verification

- Seeded starting budgets and complete account generation exercise Slayer support, caps, HP and totals.
- Controlled sessions check Slayer reward ratios, money-making fallback, affordable buyable fractions, preserved rare equipment, zero-cost encounters and paid encounter budgets at changing supply prices.
- Readiness checks include accounts whose combat level is inflated by defensive/support stats, and encounters with restricted attack styles.
- Production tests check output-tier boundaries and priced item references. Selected unlock references: [red chinchompas](https://oldschool.runescape.wiki/w/Red_chinchompa), [death runes](https://oldschool.runescape.wiki/w/Death_rune), [monkfish](https://oldschool.runescape.wiki/w/Raw_monkfish), [ranarr farming](https://oldschool.runescape.wiki/w/Ranarr_seed).
- SQLite/D1 history tests verify corrections are excluded from daily and weekly earned XP on the same day and across UTC rollover.
- The existing three-day supply-starved population replay verifies recovery and cross-skill progression. The replay now checks XP/level totals, integer skill caps, integer nondecreasing KC and boss eligibility on every tick, as well as physical inventory balances.
- Full tests, JavaScript syntax checks and the local capacity benchmark validate integration. No production mutation is needed for these checks.

## Remaining model boundaries

This is a causal consistency pass, not a full OSRS emulator. Common supply purchases and ordinary-asset liquidation use aggregate spending baskets and external-market accounting; only retained rare trades have explicit player-to-player transfers and finite outside stock. There is no general GE order-matching engine. All accounts can participate in the modeled trading, but common trades do not yet resolve counterparties individually.

Quest/access unlocks, Slayer assignments, clue acquisition/step requirements, spell-specific Magic rewards, exact equipment loadouts and recipes, crop timers, travel and boss damage immunities outside selected style restrictions are not fully modeled. Lower-tier Hunter/Runecraft/Farming earnings use estimated coin income where the catalog lacks a representative resource; Sailing salvage is an authored estimate. Boss readiness floors are ordinary-play policy rather than exact real-game eligibility. Costs and throughput remain calibrated estimates, and acceleration deliberately changes real-time rates. These omissions should be addressed with explicit activity/method data and causal tests when those systems are expanded, not inferred from unrelated skill levels.

The legacy correction runs once during scheduled publication. Deploying alone does not update existing profiles. Published historical snapshots and pre-existing records are retained; append-only correction fields keep comparisons compatible with older history rows. No accounts are reset and no deployment is performed by this audit.
