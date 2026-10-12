# Training model

Calibration captured 2026-10-12T18:13:43.664Z; 20 weekly leaderboard players.

Sources: [WOM efficiency API](https://docs.wiseoldman.net/api/efficiency/efficiency-endpoints) and [player gains API](https://docs.wiseoldman.net/api/players/player-endpoints). Raw methods, sample gains and source URLs are in [calibration.json](../workers/data/calibration.json).

EHP describes optimized methods; weekly deltas have no session-hour denominator. These are **inferred simulation rates**, not measured population averages. A top-gainer sample overrepresents heavy and efficient play. Authored ordinary-training ceilings constrain EHP, and level scaling constrains early unlocks. Composite EHP values can include cross-skill efficiency; realRate is preferred where supplied. Hitpoints, Magic and Fletching lack standalone main EHP methods, so they use explicit estimates. Tree-run Farming is capped instead of treating effective EHP as continuous farming. The project retains its existing 23-skill ruleset.

## Level 99 rates

Before weekend bonuses, excluding related combat XP and inactive time. Rates below describe active training, not gains per wall-clock hour.

| Skill | Base XP/hour | Scaled XP/hour |
| --- | ---: | ---: |
| attack | 85,000 | 297,500 |
| defence | 85,000 | 297,500 |
| strength | 95,000 | 332,500 |
| hitpoints | 30,000 | 105,000 |
| ranged | 180,000 | 630,000 |
| prayer | 350,000 | 1,225,000 |
| magic | 140,000 | 490,000 |
| cooking | 280,000 | 980,000 |
| woodcutting | 80,000 | 280,000 |
| fletching | 250,000 | 875,000 |
| fishing | 60,000 | 210,000 |
| firemaking | 200,000 | 700,000 |
| crafting | 260,000 | 910,000 |
| smithing | 170,000 | 595,000 |
| mining | 60,000 | 210,000 |
| herblore | 220,000 | 770,000 |
| agility | 60,000 | 210,000 |
| thieving | 150,000 | 525,000 |
| slayer | 45,000 | 157,500 |
| farming | 120,000 | 420,000 |
| runecraft | 55,000 | 192,500 |
| hunter | 86,100 | 301,350 |
| construction | 350,000 | 1,225,000 |

Selection weights combine authored popularity, archetype focus and a small participation adjustment (0.85–1.15×). Sample participation is the fraction earning any XP, not XP share: fast skills do not appear more popular solely because of their training speed. The sample actually has strong Agility participation; the lower general-player Agility preference is a design prior, not a conclusion from this sample.

Refresh with `npm run calibrate`, then review changed methods and samples before deploying. WOM can clamp pagination (the requested 12 rows yielded 20); metadata records the actual sample size. Rate-limited requests retry once after a minute. A failed collection leaves the existing calibration file intact.
