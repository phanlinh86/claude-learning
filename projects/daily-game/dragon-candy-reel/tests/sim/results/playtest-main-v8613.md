## playtest main-v8613 — 50 rounds per cell, ≤ 10 min

CONFIG overrides: `{"difficulty.easy.flakesNeeded":8,"difficulty.easy.gummyMaxCap":1,"difficulty.normal.gummyMaxCap":3,"difficulty.normal.gummyMin":6.5}`

### rounds

#### landscape 960×540, wind on

| player | diff | game over | survived min p10/p50/p90 | score p10/p50/p90 | first point s p10/p50/p90 | levels cleared (mean) | level s p10/p50/p90 (L1–4) | level s in 45–90 | escapes/level | snaps/level | flakes/min | Perfect % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bot 1.00 | easy | 0% | 10.0 / 10.0 / 10.0 | 2730 / 2975 / 3140 | 5 / 6 / 8 | 12.6 | 35 / 47 / 60 | 50% | 0.00 | 0.00 | 10.4 | 100 |
| bot 1.00 | normal | 0% | 10.0 / 10.0 / 10.0 | 2880 / 3140 / 3380 | 4 / 5 / 6 | 12.7 | 36 / 46 / 60 | 46% | 0.00 | 0.01 | 10.6 | 100 |
| bot 0.50 | easy | 0% | 10.0 / 10.0 / 10.0 | 2110 / 2270 / 2425 | 6 / 7 / 9 | 10.8 | 43 / 55 / 69 | 77% | 0.07 | 0.00 | 9.0 | 41 |
| bot 0.50 | normal | 0% | 10.0 / 10.0 / 10.0 | 1530 / 1705 / 1880 | 5 / 6 / 10 | 8.3 | 48 / 65 / 91 | 80% | 1.63 | 0.05 | 7.0 | 24 |
| kid 5-6 | easy | 4% | 10.0 / 10.0 / 10.0 | 1850 / 2005 / 2240 | 6 / 7 / 11 | 10.9 | 42 / 51 / 68 | 74% | 0.24 | 0.30 | 9.2 | 36 |
| kid 5-6 | normal | 96% | 2.9 / 4.6 / 8.6 | 415 / 625 / 1285 | 5 / 7 / 10 | 3.8 | 48 / 61 / 92 | 85% | 2.03 | 1.10 | 6.7 | 22 |
| kid hesitant | easy | 8% | 10.0 / 10.0 / 10.0 | 1060 / 1245 / 1425 | 6 / 9 / 16 | 6.8 | 59 / 77 / 113 | 75% | 1.21 | 0.39 | 6.0 | 26 |
| kid hesitant | normal | 90% | 2.7 / 5.2 / 10.0 | 230 / 450 / 790 | 6 / 10 / 19 | 2.2 | 71 / 104 / 168 | 29% | 4.72 | 1.38 | 3.9 | 16 |
| casual adult | easy | 0% | 10.0 / 10.0 / 10.0 | 2470 / 2660 / 2775 | 6 / 7 / 11 | 11.4 | 41 / 52 / 65 | 68% | 0.00 | 0.08 | 9.5 | 67 |
| casual adult | normal | 6% | 10.0 / 10.0 / 10.0 | 2200 / 2385 / 2585 | 5 / 6 / 10 | 10.9 | 39 / 51 / 64 | 75% | 0.10 | 0.33 | 9.3 | 43 |

#### portrait 560×1212, wind on

| player | diff | game over | survived min p10/p50/p90 | score p10/p50/p90 | first point s p10/p50/p90 | levels cleared (mean) | level s p10/p50/p90 (L1–4) | level s in 45–90 | escapes/level | snaps/level | flakes/min | Perfect % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bot 1.00 | easy | 0% | 10.0 / 10.0 / 10.0 | 2420 / 2565 / 2685 | 6 / 6 / 8 | 12.0 | 39 / 50 / 60 | 64% | 0.00 | 0.00 | 9.9 | 100 |
| bot 1.00 | normal | 0% | 10.0 / 10.0 / 10.0 | 2470 / 2610 / 2815 | 5 / 5 / 6 | 12.1 | 40 / 49 / 63 | 58% | 0.00 | 0.00 | 10.1 | 100 |
| bot 0.50 | easy | 0% | 10.0 / 10.0 / 10.0 | 1870 / 1970 / 2145 | 6 / 7 / 10 | 10.6 | 43 / 53 / 69 | 81% | 0.07 | 0.00 | 8.8 | 41 |
| bot 0.50 | normal | 0% | 10.0 / 10.0 / 10.0 | 1385 / 1490 / 1630 | 5 / 6 / 11 | 8.2 | 48 / 66 / 98 | 78% | 1.29 | 0.03 | 6.9 | 24 |
| kid 5-6 | easy | 0% | 10.0 / 10.0 / 10.0 | 1480 / 1645 / 1765 | 6 / 8 / 10 | 10.3 | 44 / 56 / 72 | 83% | 0.18 | 0.17 | 8.5 | 37 |
| kid 5-6 | normal | 54% | 3.9 / 8.9 / 10.0 | 500 / 1030 / 1340 | 5 / 7 / 10 | 5.5 | 49 / 73 / 101 | 75% | 1.84 | 0.75 | 6.2 | 22 |
| kid hesitant | easy | 0% | 10.0 / 10.0 / 10.0 | 1020 / 1145 / 1300 | 7 / 9 / 15 | 7.0 | 56 / 78 / 108 | 77% | 0.94 | 0.21 | 6.0 | 26 |
| kid hesitant | normal | 56% | 5.7 / 9.1 / 10.0 | 390 / 570 / 785 | 6 / 9 / 19 | 3.3 | 69 / 112 / 194 | 31% | 4.83 | 0.91 | 3.7 | 16 |
| casual adult | easy | 0% | 10.0 / 10.0 / 10.0 | 2120 / 2245 / 2455 | 6 / 7 / 9 | 11.4 | 41 / 52 / 64 | 74% | 0.00 | 0.06 | 9.4 | 68 |
| casual adult | normal | 4% | 10.0 / 10.0 / 10.0 | 1770 / 1865 / 2015 | 5 / 6 / 8 | 10.2 | 42 / 55 / 70 | 82% | 0.04 | 0.19 | 8.7 | 43 |

### per-level median s (landscape)

| player | diff | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 |
|---|---|---|---|---|---|---|---|---|---|
| bot 1.00 | easy | 49 | 48 | 47 | 46 | 44 | 46 | 47 | 46 |
| bot 1.00 | normal | 45 | 47 | 46 | 46 | 45 | 46 | 45 | 46 |
| bot 0.50 | easy | 52 | 56 | 55 | 55 | 47 | 51 | 55 | 59 |
| bot 0.50 | normal | 54 | 62 | 69 | 79 | 60 | 62 | 77 | 85* |
| kid 5-6 | easy | 50 | 48 | 52 | 54 | 49 | 49 | 52 | 55* |
| kid 5-6 | normal | 54 | 59* | 69* | 87* | 59* | 66* | 76* | – |
| kid hesitant | easy | 70 | 66 | 79 | 102* | 68* | 74* | 79* | 96* |
| kid hesitant | normal | 94* | 104* | 155* | 110* | 100* | – | – | – |
| casual adult | easy | 52 | 53 | 53 | 51 | 51 | 52 | 50 | 47 |
| casual adult | normal | 50 | 49 | 52 | 53 | 51 | 51 | 52* | 53* |

### wind on vs off (landscape)

| player | diff | snaps/level on → off | escapes/level on → off | level s p50 on → off | game over on → off | snaps where the sway moved the hook into the gummy | escapes during a strong gust (|wind|>0.5) | wind misses / level (straight line would have hooked) | wind assists / level | catch/hook on → off |
|---|---|---|---|---|---|---|---|---|---|---|

### golden flake

| player | diff | golden / min | golden / level | caught / spawned |
|---|---|---|---|---|
| bot 1.00 | easy | 1.11 | 0.82 | 79% |
| bot 1.00 | normal | 1.28 | 0.93 | 71% |
| bot 0.50 | easy | 1.09 | 0.92 | 73% |
| bot 0.50 | normal | 1.16 | 1.25 | 44% |
| kid 5-6 | easy | 1.14 | 0.95 | 31% |
| kid 5-6 | normal | 1.17 | 1.27 | 19% |
| kid hesitant | easy | 1.05 | 1.30 | 20% |
| kid hesitant | normal | 1.19 | 2.08 | 16% |
| casual adult | easy | 1.20 | 0.96 | 73% |
| casual adult | normal | 1.21 | 1.00 | 58% |
