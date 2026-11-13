# Live world review and engagement roadmap

Reviewed November 12, 2026 (America/Phoenix). Live revision: `f03507618a38b9e797d75996f332e1e930c635f2`. Pages reviewed: overall, Slayer, boss ladders, bank value, gains and records, item economy, world stories, achievements and an established player profile. Live reads were read-only. The changes below are local and have not been deployed.

## Findings and completed changes

### Boss selection became trapped in raids

The [Vardorvis ladder](https://osrs-hiscores-clone.vs.workers.dev/#bosses?boss=vardorvis) had 50 ranked players and a leading count of 21. [Chambers](https://osrs-hiscores-clone.vs.workers.dev/#bosses?boss=chambers-of-xeric) had 630 ranked players and a leading count of 748. The overall leader, [nondiscussed](https://osrs-hiscores-clone.vs.workers.dev/#user/nondiscussed), had 78 Chambers completions and zero KC in all 24 expansion encounters.

The simulation treated any positive fractional raid progress as a mandatory pending raid. Each completion retained another fraction, so virtually every established raider kept returning forever. Expansion bosses also genuinely have younger ladders, different eligibility gates and different encounter speeds; those contribute to the disparity, but the permanent selection lock is a confirmed bug.

The fix separates priority to finish a pending attempt from fractional work retained for a later visit. Legacy fractions resume; earning a completion releases that priority. KC, loot, XP and saved fractional work remain intact. No retrospective kills or compensation are invented.

A bounded offline replay used a copy of the live leader, 672 fifteen-minute opportunities, 0.2 active hours per opportunity, constant 29x scale and the same initial RNG seed. The original bossing function visited one encounter in 126 active bossing sessions; the corrected function visited 44 in 141. This isolates the selection behavior, holds skills fixed, and is not a full scheduled-world replay or a prediction of future live distribution. Regression coverage also exercises partial completion and release to expansion encounters.

### A race that had already finished

[World stories](https://osrs-hiscores-clone.vs.workers.dev/#stories) presented three maxed accounts as “The race to max,” each with zero levels remaining. The race now selects the highest-ranked unfinished accounts, advances as players max, and handles an entirely finished population.

### Boss ladders hid momentum and access

The ladder showed lifetime totals without a direct path to recent movement. Boss pages now link to seven-day gains and show the simulation’s combat/skill access gates. The global leading-count summary now stays accurate when changing pages or filtering players; previously it showed the first score on the displayed page.

### World watch: implemented locally at `#world`

A new snapshot-backed page turns existing simulation state into things to follow:

- **Where the world is playing:** the eight busiest primary activities, recent active players, bossing players and earned XP.
- **A cape within reach:** up to eight players within 1M XP of a 99, one nearest skill per player, linked to their actual progress timeline. No completion ETA is invented.
- **Boss field guide:** all 48 encounters, current hunters/KC, lifetime participation and totals. Search and sort by recent hunting, least explored or lifetime KC; twelve rows initially, with an expansion control. “Explore an encounter” selects a real encounter from the current search results.
- **New faces:** up to eight recent arrivals from the past seven days, linked to profiles.

Recent activity means recorded sessions in the fifteen minutes preceding the capture, rather than a claim that an account is online now. A boss trip with leftover skilling counts once under bossing. Totals, lists and API responses use the same published generation as the ladders. The page polls through the app’s existing generation refresh. Older snapshots show an awaiting-update state until a new capture is published.

## Highest-value next pages

| Priority | Page | What makes it entertaining | Evidence and data needed |
| --- | --- | --- | --- |
| 1 | **Following** | Pick a handful of adventurers and return to see their levels, rare finds and overtakes since the last visit. “Follow a newcomer to their first 99” gives spectators an ongoing attachment. | Store followed stable player IDs and last-seen markers locally; use actual profile/history events. Support removed players and unavailable local storage. Avoid relying on mutable usernames for identity. |
| 2 | **Rivalries** | Show genuinely close races with a narrowing gap, recent lead changes and two-player comparison timelines. Let viewers choose whom to root for. | Current stories compare rank one and two even when wealth differs by hundreds of millions. Rank proximity alone is weak evidence. Select near peers from recent gains and repeated captured positions. Label uncertain trajectories and avoid guaranteed overtake times. |
| 3 | **Collection hall** | Browse first personal discoveries, missing selected rewards and duplicate streaks. Follow a particular hunter’s next discovery. | Personal `rareFinds` and creation flows already distinguish discoveries from purchases. Present the modeled tradeable collection explicitly; pets and unmodeled untradeables need new simulation support. Never count a purchase as a drop. |
| 4 | **Adventurer journal** | Give each player a compact chronological story: first boss, first 99, personal best, major upgrade, comeback and next observed goal. | Profiles have latest sessions, loot and trades; retention is short. Save a bounded event journal with stable event IDs and source timestamps. Do not infer events from opening bank estimates or narrate motives as facts. |
| 5 | **Market desk / item detail** | Click an item to investigate price history, actual sources, recent discoveries and which upgrades players seek. Follow a rare find through a sale and into another bank. | Economy already has quotes, modeled demand and supply. Separate actual settlements, estimated supply use and upgrade interest. Deeper history needs downsampled storage beyond the current 24-hour window. |
| 6 | **Unclaimed records** | Follow still-unclaimed achievements, the closest eligible contenders, and the moment someone becomes the first. | Catalog already exposes unclaimed milestones. Proximity must be calculated from each achievement’s real predicate; some playstyle achievements are not monotonic or simple percent bars. Start with levels, XP and KC. |
| 7 | **Weekly chronicle** | A short digest gives visitors something worth returning for: new maxed accounts, closest finishes, biggest discoveries, breakthroughs and surprising comebacks. | Retain deduplicated daily summaries. Tie every sentence to recorded events and explicitly mark partial periods. Rank by significance and variety so routine raid drops do not bury firsts. |
| 8 | **Time-limited competitions** | A weekly skill race, boss hunt or newcomer division supplies a beginning, tension and an ending. Keep permanent hiscores alongside it. | Define start/end captures and eligibility in advance. Derive results from deltas, retain winners, and use newcomer divisions so established accounts do not dominate every event. Reward recognition before adding economic payouts. |

The first three would provide the strongest next layer: attachment to a player, tension between peers and anticipation of a discovery.

## Simulation improvements that would support those pages

1. **Bounded boss trips and collection goals.** After repairing the raid lock, boss choice can still switch frequently. Persist a target for several active sessions or until a modest KC/reward goal, with a completion/reassessment boundary. Let collectors, Slayer specialists and generalists differ. Preserve an exploration chance so new encounters remain reachable. Measure coverage by eligible player-days rather than forcing equal KC across bosses.
2. **Named turning points.** Record the first kill, first personal rare, first retained upgrade, first 99 and return after an observed absence. Use bounded priority queues for important events so ordinary loot cannot fill every noticeboard slot. The current world stories feed is heavily dominated by repeat raid rewards.
3. **Visible continuity.** Show a current observed goal, its progress, the latest meaningful event and a direct follow action in each profile. Internal career labels should remain internal; describe behavior the viewer can verify.
4. **Activity diversity diagnostics.** Monitor encounter visits, exclusive repeat streaks, fresh-boss participation, eligible players, collection coverage and time since each ladder gained KC. A raid-selection trap can look like plausible aggregate growth unless diversity is measured.
5. **Meaningful recovery and downtime.** Distinguish an observed resting player from stale world progression. Celebrate a return after a real absence without awarding fabricated missed sessions. Show freshness prominently when there is no new capture.

## Existing-page adjustments worth prioritizing

- **Home and skill ladders:** provide links to recent movers, a compact world-watch teaser and progress toward the next meaningful milestone. A visitor should be able to discover a story without opening several filters.
- **Profiles:** the full skill table, bank, loot, trades and 48 boss rows form a long page. Keep the current focus and latest turning point near the top; group deep bank accounting and unvisited bosses behind intentional expansion controls.
- **Stories:** add filters for crowns, discoveries and milestones, and reserve space for firsts and breakthroughs. Retain the actual event chronology within each view.
- **Achievements:** add a clear “Unclaimed” exploration entry and reachable-contender links for the predicates that support them.
- **Economy:** clicking through to one item would make price changes more comprehensible than scanning a wide table. Explain “modeled demand” separately from completed trades. Avoid implying that a short upward line predicts a future increase.
- **Gains and records:** add comparison links and retain the metric/period when moving between player timelines. Record results for closed periods so a returning spectator can see how a race ended.

## Verification

- 135 Worker tests and 8 script/release tests passed, including raid release, partial raids, max-race advancement, leader-score pagination/filtering, snapshot API immutability and the new world-watch summaries.
- JavaScript syntax checks and the Worker dry-run bundle passed.
- Existing capacity benchmark passed with the added summary at the configured 2,000-player ceiling. These remain local resource projections, not live traffic measurements.
- Browser checks covered the real local API with a small seeded world, plus a populated preview built from 25 publicly fetched live profiles. The latter was an explicitly sampled browser fixture, not the full-world population.
- Desktop and 390px mobile checks covered search, quiet-encounter sorting, empty results, discovery navigation, show-all/show-fewer, active navigation state and console errors. No page-level horizontal overflow was observed; the wide encounter table scrolls within its own region.
- Production remains unchanged. The selection fix and new summaries begin affecting the live world only after deployment and a scheduled capture.
