## playtest main-gold — 50 rounds per cell, ≤ 10 min

CONFIG overrides: `{"difficulty.easy.flakesNeeded":8,"difficulty.easy.gummyMaxCap":1,"goldSpeed":1.35}`

### rounds

#### landscape 960×540, wind on

| player | diff | game over | survived min p10/p50/p90 | score p10/p50/p90 | first point s p10/p50/p90 | levels cleared (mean) | level s p10/p50/p90 (L1–4) | level s in 45–90 | escapes/level | snaps/level | flakes/min | Perfect % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bot 1.00 | hard | 0% | 10.0 / 10.0 / 10.0 | 2655 / 2930 / 3165 | 4 / 4 / 5 | 9.7 | 45 / 58 / 75 | 87% | 0.00 | 0.03 | 10.1 | 91 |
| kid 5-6 | easy | 6% | 10.0 / 10.0 / 10.0 | 1865 / 2090 / 2260 | 6 / 7 / 11 | 11.0 | 40 / 50 / 63 | 71% | 0.27 | 0.29 | 9.3 | 36 |
| kid 5-6 | normal | 94% | 2.4 / 4.7 / 9.0 | 340 / 735 / 1375 | 5 / 7 / 10 | 3.8 | 47 / 61 / 89 | 80% | 1.86 | 1.07 | 7.0 | 23 |
| kid hesitant | easy | 8% | 10.0 / 10.0 / 10.0 | 1160 / 1310 / 1465 | 6 / 9 / 16 | 7.0 | 59 / 74 / 103 | 79% | 1.16 | 0.31 | 6.1 | 26 |
| casual adult | easy | 0% | 10.0 / 10.0 / 10.0 | 2470 / 2650 / 2820 | 6 / 7 / 12 | 11.6 | 41 / 52 / 69 | 68% | 0.00 | 0.09 | 9.6 | 68 |
| casual adult | normal | 22% | 6.9 / 10.0 / 10.0 | 1515 / 2345 / 2520 | 5 / 6 / 10 | 10.1 | 39 / 51 / 62 | 72% | 0.09 | 0.45 | 9.2 | 42 |
| casual adult | hard | 78% | 2.9 / 7.2 / 10.0 | 445 / 1480 / 1880 | 4 / 5 / 9 | 4.5 | 56 / 75 / 106 | 78% | 1.16 | 0.99 | 7.4 | 28 |

#### portrait 560×1212, wind on

| player | diff | game over | survived min p10/p50/p90 | score p10/p50/p90 | first point s p10/p50/p90 | levels cleared (mean) | level s p10/p50/p90 (L1–4) | level s in 45–90 | escapes/level | snaps/level | flakes/min | Perfect % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| bot 1.00 | hard | 0% | 10.0 / 10.0 / 10.0 | 2300 / 2505 / 2615 | 4 / 4 / 5 | 9.3 | 49 / 63 / 77 | 94% | 0.00 | 0.00 | 9.8 | 92 |
| kid 5-6 | easy | 0% | 10.0 / 10.0 / 10.0 | 1545 / 1670 / 1835 | 6 / 8 / 10 | 10.3 | 44 / 57 / 72 | 82% | 0.16 | 0.18 | 8.6 | 38 |
| kid 5-6 | normal | 66% | 4.5 / 7.9 / 10.0 | 550 / 990 / 1295 | 5 / 7 / 9 | 5.5 | 49 / 69 / 108 | 78% | 1.81 | 0.82 | 6.3 | 22 |
| kid hesitant | easy | 0% | 10.0 / 10.0 / 10.0 | 1010 / 1115 / 1270 | 7 / 9 / 15 | 6.9 | 57 / 76 / 105 | 77% | 0.94 | 0.25 | 5.9 | 25 |
| casual adult | easy | 0% | 10.0 / 10.0 / 10.0 | 2095 / 2215 / 2365 | 6 / 7 / 9 | 11.2 | 42 / 53 / 66 | 75% | 0.00 | 0.04 | 9.3 | 67 |
| casual adult | normal | 4% | 10.0 / 10.0 / 10.0 | 1775 / 1920 / 2070 | 5 / 6 / 8 | 10.1 | 42 / 56 / 73 | 82% | 0.07 | 0.27 | 8.5 | 43 |
| casual adult | hard | 46% | 5.1 / 10.0 / 10.0 | 855 / 1390 / 1530 | 4 / 6 / 10 | 5.4 | 56 / 80 / 126 | 65% | 0.92 | 0.64 | 6.9 | 27 |

### per-level median s (landscape)

| player | diff | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 |
|---|---|---|---|---|---|---|---|---|---|
| bot 1.00 | hard | 53 | 53 | 62 | 63 | 61 | 64 | 61 | 62 |
| kid 5-6 | easy | 50 | 48 | 50 | 54 | 45 | 48 | 56 | 54* |
| kid 5-6 | normal | 54 | 61* | 62* | 96* | 51* | 66* | 80* | 88* |
| kid hesitant | easy | 71 | 70 | 78 | 88* | 68* | 76* | 79* | 82* |
| casual adult | easy | 52 | 54 | 51 | 50 | 48 | 50 | 50 | 46 |
| casual adult | normal | 48 | 49 | 53 | 53* | 49* | 50* | 50* | 55* |
| casual adult | hard | 66 | 72* | 82* | 97* | 67* | 78* | 81* | – |

### wind on vs off (landscape)

| player | diff | snaps/level on → off | escapes/level on → off | level s p50 on → off | game over on → off | snaps where the sway moved the hook into the gummy | escapes during a strong gust (|wind|>0.5) | wind misses / level (straight line would have hooked) | wind assists / level | catch/hook on → off |
|---|---|---|---|---|---|---|---|---|---|---|

### golden flake

| player | diff | golden / min | golden / level | caught / spawned |
|---|---|---|---|---|
| bot 1.00 | hard | 1.41 | 1.32 | 64% |
| kid 5-6 | easy | 1.15 | 0.95 | 43% |
| kid 5-6 | normal | 1.12 | 1.17 | 26% |
| kid hesitant | easy | 0.96 | 1.17 | 26% |
| casual adult | easy | 1.13 | 0.90 | 77% |
| casual adult | normal | 1.21 | 1.01 | 60% |
| casual adult | hard | 1.29 | 1.61 | 42% |
