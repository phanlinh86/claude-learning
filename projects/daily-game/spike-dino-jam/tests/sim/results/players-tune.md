# Player-model playtest — suite `tune`, 60 rounds per cell (exploit probes N/4), 8 min cap, dt 1/60

Arenas: `land` = landscape 960×540 (desktop / default) [28,76,932,516]; `ipad` = iPad 4:3 (960×720, touch) [28,76,932,696]; `port` = portrait phone (setArena 28,88,532,1080) [28,88,532,1080]; `wide` = wide phone 1170×540 (notch insets, touch) [93,76,1077,487]

| Set | Model | Diff | Arena | N | Died ≤ cap | Clear biome 1 | Biome-1 s p10/p50/p90 | s per level lap 1 (median, n): meadow / swamp / canyon / snow | 1st note s (med) | Survival min p10/p50/p90 | Score p10/p50/p90 | Levels (med) | Bonks/min | Pillow hits/min | Dodges/min | Airborne % | In edge strip % | Edge-saved contacts/min |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| current | kid | easy | land | 60 | 60 | 100 % | 27 / 32 / 42 | 32 (60) / 43 (59) / 65 (29) / 80 (2) | 1.9 | 2 / 3 / 4 | 1680 / 2041 / 2816 | 2 | 1.96 | 0.33 | 0.03 | 3 | 16 | 0.15 |
| proposed | kid | easy | land | 60 | 47 | 100 % | 28 / 35 / 48 | 35 (60) / 38 (60) / 53 (58) / 70 (38) | 2.0 | 3 / 6 / 7 | 2318 / 4661 / 6124 | 6 | 1.22 | 0.37 | 0.05 | 3 | 15 | 0.08 |
| current | kid | easy | port | 60 | 60 | 100 % | 27 / 32 / 43 | 32 (60) / 50 (57) / 68 (35) / 67 (6) | 2.1 | 2 / 4 / 5 | 1679 / 2508 / 3716 | 3 | 1.78 | 0.32 | 0.01 | 3 | 13 | 0.13 |
| proposed | kid | easy | port | 60 | 44 | 100 % | 28 / 34 / 42 | 34 (60) / 43 (60) / 55 (59) / 70 (42) | 2.2 | 4 / 7 / 8 | 2411 / 4659 / 5738 | 7 | 1.18 | 0.41 | 0.03 | 3 | 12 | 0.10 |
| current | kid | easy | wide | 60 | 60 | 100 % | 26 / 31 / 42 | 31 (60) / 48 (58) / 66 (38) / 68 (9) | 1.9 | 3 / 3 / 6 | 1753 / 2383 / 4115 | 3 | 1.79 | 0.43 | 0.01 | 3 | 16 | 0.10 |
| proposed | kid | easy | wide | 60 | 47 | 100 % | 27 / 36 / 46 | 36 (60) / 41 (60) / 54 (58) / 64 (48) | 1.9 | 4 / 7 / 8 | 2594 / 4705 / 6143 | 7 | 1.23 | 0.34 | 0.02 | 3 | 15 | 0.14 |
| current | kid | normal | land | 60 | 60 | 98 % | 31 / 37 / 56 | 37 (59) / 55 (17) / – (0) / – (0) | 1.9 | 1 / 2 / 3 | 789 / 961 / 1622 | 1 | 1.77 | 0.38 | 0.01 | 3 | 16 | 0.25 |
| proposed | kid | normal | land | 60 | 59 | 100 % | 30 / 37 / 51 | 37 (60) / 44 (57) / 53 (41) / 62 (11) | 1.9 | 2 / 3 / 6 | 1352 / 2135 / 3970 | 3 | 1.22 | 0.30 | 0.01 | 2 | 16 | 0.11 |
| current | kid | normal | port | 60 | 60 | 100 % | 31 / 39 / 53 | 39 (60) / 57 (32) / 55 (1) / – (0) | 1.7 | 2 / 2 / 3 | 798 / 1268 / 1787 | 2 | 1.59 | 0.38 | 0.00 | 2 | 13 | 0.15 |
| proposed | kid | normal | port | 60 | 57 | 100 % | 31 / 39 / 54 | 39 (60) / 46 (57) / 66 (40) / 64 (16) | 1.7 | 2 / 3 / 7 | 1440 / 2114 / 4186 | 3 | 1.06 | 0.33 | 0.01 | 2 | 13 | 0.08 |
| current | kid | normal | wide | 60 | 60 | 100 % | 30 / 37 / 54 | 37 (60) / 56 (22) / 75 (1) / – (0) | 1.5 | 1 / 2 / 3 | 776 / 941 / 1607 | 1 | 1.75 | 0.35 | 0.01 | 2 | 15 | 0.12 |
| proposed | kid | normal | wide | 60 | 60 | 100 % | 29 / 36 / 45 | 36 (60) / 45 (58) / 56 (39) / 56 (11) | 1.5 | 2 / 3 / 6 | 1336 / 2128 / 4201 | 3 | 1.16 | 0.36 | 0.00 | 2 | 16 | 0.10 |
| current | adult | normal | land | 60 | 0 | 100 % | 18 / 21 / 27 | 21 (60) / 29 (60) / 36 (60) / 44 (60) | 1.0 | 7 / 7 / 7 | 10129 / 10880 / 11738 | 12 | 0.08 | 0.26 | 0.06 | 3 | 12 | 0.03 |
| current | bot1 | normal | land | 60 | 0 | 100 % | 18 / 21 / 26 | 21 (60) / 29 (60) / 37 (60) / 43 (60) | 1.0 | 7 / 7 / 7 | 10380 / 10927 / 11506 | 12 | 0.03 | 0.00 | 0.02 | 1 | 14 | 0.07 |
| current | edgedart | normal | land | 60 | 54 | 100 % | 27 / 32 / 40 | 32 (60) / 46 (57) / 60 (42) / 69 (16) | 0.9 | 2 / 3 / 8 | 1691 / 2692 / 6155 | 3 | 1.02 | 0.83 | 0.00 | 0 | 37 | 0.35 |
| proposed | adult | normal | land | 60 | 0 | 100 % | 18 / 21 / 26 | 21 (60) / 24 (60) / 29 (60) / 32 (60) | 1.0 | 7 / 7 / 7 | 10155 / 10669 / 11278 | 14 | 0.05 | 0.30 | 0.10 | 2 | 12 | 0.01 |
| proposed | bot1 | normal | land | 60 | 0 | 100 % | 18 / 21 / 26 | 21 (60) / 25 (60) / 27 (60) / 31 (60) | 1.0 | 7 / 7 / 7 | 10184 / 10716 / 11395 | 14 | 0.01 | 0.00 | 0.04 | 2 | 13 | 0.02 |
| proposed | edgedart | normal | land | 60 | 17 | 100 % | 27 / 31 / 40 | 31 (60) / 38 (60) / 43 (60) / 50 (60) | 0.9 | 6 / 7 / 7 | 4871 / 6614 / 7194 | 9 | 0.43 | 0.72 | 0.00 | 0 | 33 | 0.09 |

## Bonk context (share of all bonks; tags overlap) and death context

| Set | Model | Diff | Arena | Bonks | after-bounce | pillow-dizzy | boss-visit | kid-hold | near-strip | open-field | trail<10 / 10-15 / 16+ | Deaths by level (0 = biome 1) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| current | kid | easy | land | 356 | 12 % | 0 % | 18 % | 17 % | 35 % | 65 % | 24 % / 75 % / 1 % | L1:1 L2:30 L3:27 L4:1 L5:1 |
| proposed | kid | easy | land | 406 | 5 % | 0 % | 18 % | 15 % | 35 % | 65 % | 26 % / 74 % / 0 % | L2:2 L3:20 L5:1 L6:13 L7:11 |
| current | kid | easy | port | 374 | 13 % | 0 % | 18 % | 19 % | 28 % | 72 % | 29 % / 70 % / 2 % | L1:3 L2:22 L3:29 L5:2 L6:3 L7:1 |
| proposed | kid | easy | port | 423 | 3 % | 0 % | 26 % | 14 % | 29 % | 71 % | 25 % / 75 % / 0 % | L2:1 L3:17 L4:1 L5:2 L6:8 L7:15 |
| current | kid | easy | wide | 380 | 13 % | 0 % | 19 % | 15 % | 37 % | 63 % | 31 % / 69 % / 1 % | L1:2 L2:20 L3:29 L5:4 L6:4 L7:1 |
| proposed | kid | easy | wide | 443 | 7 % | 0 % | 19 % | 15 % | 36 % | 64 % | 29 % / 71 % / 0 % | L2:2 L3:10 L4:1 L5:4 L6:10 L7:20 |
| current | kid | normal | land | 200 | 35 % | 1 % | 24 % | 22 % | 41 % | 60 % | 20 % / 80 % / 1 % | L0:1 L1:42 L2:17 |
| proposed | kid | normal | land | 256 | 39 % | 0 % | 22 % | 18 % | 38 % | 62 % | 13 % / 87 % / 0 % | L1:3 L2:16 L3:30 L4:1 L5:2 L6:6 L7:1 |
| current | kid | normal | port | 216 | 23 % | 0 % | 25 % | 17 % | 31 % | 69 % | 13 % / 83 % / 3 % | L1:28 L2:31 L3:1 |
| proposed | kid | normal | port | 248 | 32 % | 0 % | 21 % | 21 % | 30 % | 70 % | 9 % / 91 % / 0 % | L1:3 L2:17 L3:24 L4:1 L5:3 L6:9 |
| current | kid | normal | wide | 207 | 29 % | 0 % | 17 % | 21 % | 39 % | 61 % | 17 % / 82 % / 1 % | L1:38 L2:21 L3:1 |
| proposed | kid | normal | wide | 245 | 44 % | 0 % | 19 % | 14 % | 45 % | 55 % | 14 % / 86 % / 0 % | L1:2 L2:19 L3:28 L5:1 L6:9 L7:1 |
| current | adult | normal | land | 35 | 40 % | 3 % | 20 % | 0 % | 34 % | 66 % | 9 % / 23 % / 69 % | – |
| current | bot1 | normal | land | 11 | 36 % | 0 % | 36 % | 0 % | 45 % | 55 % | 18 % / 0 % / 82 % | – |
| current | edgedart | normal | land | 244 | 43 % | 1 % | 25 % | 0 % | 73 % | 27 % | 5 % / 64 % / 31 % | L1:2 L2:15 L3:26 L5:1 L6:5 L7:5 |
| proposed | adult | normal | land | 20 | 75 % | 0 % | 15 % | 0 % | 60 % | 40 % | 25 % / 55 % / 20 % | – |
| proposed | bot1 | normal | land | 4 | 75 % | 0 % | 50 % | 0 % | 75 % | 25 % | 25 % / 50 % / 25 % | – |
| proposed | edgedart | normal | land | 182 | 64 % | 0 % | 23 % | 0 % | 64 % | 36 % | 4 % / 89 % / 7 % | L6:5 L7:10 L9:2 |

## Fairness checks

| Set | Model | Diff | Arena | Pillows thrown | Unescapable + no flip (0.4 s reaction) | … (instant reaction) | Pillows landing under the touch button | Loose notes vanishing under the button | Notes spawned (under button / on trail / on Spike) | Oldest idle note s |
|---|---|---|---|---|---|---|---|---|---|---|
| current | kid | easy | land | 1066 | 0 (0.0 %) | 0 | 0 | 0 | 2927 (0 / 0 / 0) | 52 |
| proposed | kid | easy | land | 1938 | 0 (0.0 %) | 0 | 0 | 0 | 5231 (0 / 0 / 0) | 57 |
| current | kid | easy | port | 1247 | 0 (0.0 %) | 0 | 36 | 4 | 3225 (0 / 0 / 0) | 70 |
| proposed | kid | easy | port | 2106 | 0 (0.0 %) | 0 | 41 | 3 | 5301 (0 / 0 / 0) | 63 |
| current | kid | easy | wide | 1265 | 0 (0.0 %) | 0 | 41 | 6 | 3390 (0 / 0 / 0) | 71 |
| proposed | kid | easy | wide | 2116 | 0 (0.0 %) | 0 | 59 | 9 | 5650 (0 / 0 / 0) | 63 |
| current | kid | normal | land | 662 | 0 (0.0 %) | 0 | 0 | 0 | 1943 (0 / 0 / 0) | 63 |
| proposed | kid | normal | land | 1231 | 0 (0.0 %) | 0 | 0 | 0 | 3669 (0 / 0 / 0) | 76 |
| current | kid | normal | port | 818 | 0 (0.0 %) | 0 | 24 | 10 | 2273 (0 / 0 / 0) | 41 |
| proposed | kid | normal | port | 1385 | 0 (0.0 %) | 0 | 51 | 2 | 3880 (0 / 0 / 0) | 59 |
| current | kid | normal | wide | 706 | 0 (0.0 %) | 0 | 21 | 2 | 2057 (0 / 0 / 0) | 51 |
| proposed | kid | normal | wide | 1262 | 0 (0.0 %) | 0 | 49 | 8 | 3705 (0 / 0 / 0) | 55 |
| current | adult | normal | land | 2626 | 0 (0.0 %) | 0 | 0 | 0 | 14329 (0 / 0 / 0) | 132 |
| current | bot1 | normal | land | 2606 | 0 (0.0 %) | 0 | 0 | 0 | 14404 (0 / 0 / 0) | 28 |
| current | edgedart | normal | land | 1434 | 0 (0.0 %) | 0 | 0 | 0 | 4903 (0 / 0 / 0) | 431 |
| proposed | adult | normal | land | 2646 | 0 (0.0 %) | 0 | 0 | 0 | 14357 (0 / 0 / 0) | 312 |
| proposed | bot1 | normal | land | 2665 | 0 (0.0 %) | 0 | 0 | 0 | 14593 (0 / 0 / 0) | 25 |
| proposed | edgedart | normal | land | 2431 | 0 (0.0 %) | 0 | 0 | 0 | 9198 (0 / 0 / 0) | 303 |

(1080 games, 421 s wall time)
