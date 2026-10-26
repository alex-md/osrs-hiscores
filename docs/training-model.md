# Training model

Calibration captured 2026-10-12T18:13:43.664Z; 20 weekly leaderboard players.

Sources: [WOM efficiency API](https://docs.wiseoldman.net/api/efficiency/efficiency-endpoints) and [player gains API](https://docs.wiseoldman.net/api/players/player-endpoints). Raw methods, sample gains and source URLs are in [calibration.json](../workers/data/calibration.json).

EHP describes optimized methods; weekly deltas have no session-hour denominator. These are **inferred simulation rates**, not measured population averages. A top-gainer sample overrepresents heavy and efficient play. Authored ordinary-training ceilings constrain EHP, and level scaling constrains early unlocks. Composite EHP values can include cross-skill efficiency; realRate is preferred where supplied. Hitpoints, Magic and Fletching lack standalone main EHP methods, so they use explicit estimates. Tree-run Farming is capped instead of treating effective EHP as continuous farming. The shared ruleset now has 24 skills, including Sailing. Sailing uses an authored provisional rate because the calibration capture predates it.

## Level 99 rates

Excluding related combat XP and inactive time. Rates below describe active training, not gains per wall-clock hour. The reference column uses the 18.5× baseline; actual rates vary across a date-seeded UTC schedule between 6× and 31×, including weekend uplift.

| Skill | Base XP/hour | Reference XP/hour (18.5×) |
| --- | ---: | ---: |
| attack | 85,000 | 1,572,500 |
| defence | 85,000 | 1,572,500 |
| strength | 95,000 | 1,757,500 |
| hitpoints | 30,000 | 555,000 |
| ranged | 180,000 | 3,330,000 |
| prayer | 350,000 | 6,475,000 |
| magic | 140,000 | 2,590,000 |
| cooking | 280,000 | 5,180,000 |
| woodcutting | 80,000 | 1,480,000 |
| fletching | 250,000 | 4,625,000 |
| fishing | 60,000 | 1,110,000 |
| firemaking | 200,000 | 3,700,000 |
| crafting | 260,000 | 4,810,000 |
| smithing | 170,000 | 3,145,000 |
| mining | 60,000 | 1,110,000 |
| herblore | 220,000 | 4,070,000 |
| agility | 60,000 | 1,110,000 |
| thieving | 150,000 | 2,775,000 |
| slayer | 45,000 | 832,500 |
| farming | 120,000 | 2,220,000 |
| runecraft | 55,000 | 1,017,500 |
| hunter | 86,100 | 1,592,850 |
| sailing | 95,000 | 1,757,500 |
| construction | 350,000 | 6,475,000 |

Selection weights combine authored popularity, archetype focus and a small participation adjustment (0.85–1.15×). Sample participation is the fraction earning any XP, not XP share: fast skills do not appear more popular solely because of their training speed. The sample actually has strong Agility participation; the lower general-player Agility preference is a design prior, not a conclusion from this sample.

Refresh with `npm run calibrate`, then review changed methods and samples before deploying. WOM can clamp pagination (the requested 12 rows yielded 20); metadata records the actual sample size. Rate-limited requests retry once after a minute. A failed collection leaves the existing calibration file intact.

## Daily activity and XP distribution

`workers/src/xp-schedule.js` models an overnight lull, morning and lunch shoulders, and a stronger evening peak. Weekly timing/intensity feeds daily intensity; each daily peak gets its own randomized timing, width and strength. Interpolated three-hour perturbations and small quarter-hour noise add local variation. Weekends shift peaks later and retain their 15% uplift. These shapes are authored simulation assumptions, not measured real-player traffic.

The weekday daily mean varies around 18.5× via weekly (0.97–1.03) and daily (0.94–1.06) factors. Each curve is centered on that mean, with its amplitude limited to a randomized low (6–10×) and peak (27–31×). The absolute cap includes weekend uplift. The implementation scales the curve to fit both limits, so the actual low may be above the sampled floor or the peak below the sampled ceiling. A UTC-date seed reproduces the same distribution across restarts and retries without additional database writes or changing the session RNG stream.

For each elapsed window (at most 15 minutes), sum `period scale × overlapping milliseconds`, then divide by elapsed milliseconds. Award `ordinary skill rate × sampled active hours × weighted scale`, flooring only the final per-skill award. Activity occupies its sampled fraction of each overlapping period. The interval ends at the simulation timestamp; an update exactly on a period boundary awards the preceding period. Midnight windows include both dates and their respective weekend factors. No missed-time catch-up is introduced. Related combat XP uses that same scaled award, and existing caps/history remain intact.

Published training metadata describes the rate at publication time; `progress.lastSession.xpScale` records the weighted rate actually awarded for the preceding window. They can differ at a period boundary. The daily schedule, base scale, daily factor, weekend multiplier and time-of-day factor are available in the API. Profile cape estimates use the publication rate as a constant-rate estimate, not a forecast of future randomized schedules.
