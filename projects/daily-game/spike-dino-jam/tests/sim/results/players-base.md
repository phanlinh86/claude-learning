# Player-model playtest — suite `base`, 60 rounds per cell (exploit probes N/4), 8 min cap, dt 1/60

Arenas: `land` = landscape 960×540 (desktop / default) [28,76,932,516]; `ipad` = iPad 4:3 (960×720, touch) [28,76,932,696]; `port` = portrait phone (setArena 28,88,532,1080) [28,88,532,1080]; `wide` = wide phone 1170×540 (notch insets, touch) [93,76,1077,487]

| Set | Model | Diff | Arena | N | Died ≤ cap | Clear biome 1 | Biome-1 s p10/p50/p90 | s per level lap 1 (median, n): meadow / swamp / canyon / snow | 1st note s (med) | Survival min p10/p50/p90 | Score p10/p50/p90 | Levels (med) | Bonks/min | Pillow hits/min | Dodges/min | Airborne % | In edge strip % | Edge-saved contacts/min |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| current | kid | easy | land | 60 | 60 | 100 % | 27 / 32 / 42 | 32 (60) / 43 (59) / 65 (29) / 80 (2) | 1.9 | 2 / 3 / 4 | 1680 / 2041 / 2816 | 2 | 1.96 | 0.33 | 0.03 | 3 | 16 | 0.15 |
| current | kid | easy | ipad | 60 | 60 | 100 % | 28 / 34 / 44 | 34 (60) / 48 (58) / 64 (35) / 82 (9) | 2.2 | 2 / 4 / 6 | 1620 / 2477 / 3803 | 3 | 1.70 | 0.30 | 0.02 | 3 | 11 | 0.10 |
| current | kid | easy | port | 60 | 60 | 100 % | 27 / 32 / 43 | 32 (60) / 50 (57) / 68 (35) / 67 (6) | 2.1 | 2 / 4 / 5 | 1679 / 2508 / 3716 | 3 | 1.78 | 0.32 | 0.01 | 3 | 13 | 0.13 |
| current | kid | easy | wide | 60 | 60 | 100 % | 26 / 31 / 42 | 31 (60) / 48 (58) / 66 (38) / 68 (9) | 1.9 | 3 / 3 / 6 | 1753 / 2383 / 4115 | 3 | 1.79 | 0.43 | 0.01 | 3 | 16 | 0.10 |
| current | kid | normal | land | 60 | 60 | 98 % | 31 / 37 / 56 | 37 (59) / 55 (17) / – (0) / – (0) | 1.9 | 1 / 2 / 3 | 789 / 961 / 1622 | 1 | 1.77 | 0.38 | 0.01 | 3 | 16 | 0.25 |
| current | kid | normal | ipad | 60 | 60 | 100 % | 31 / 41 / 58 | 41 (60) / 64 (20) / 72 (2) / – (0) | 2.2 | 1 / 2 / 3 | 774 / 972 / 1621 | 1 | 1.66 | 0.33 | 0.00 | 2 | 11 | 0.11 |
| current | kid | normal | port | 60 | 60 | 100 % | 31 / 39 / 53 | 39 (60) / 57 (32) / 55 (1) / – (0) | 1.7 | 2 / 2 / 3 | 798 / 1268 / 1787 | 2 | 1.59 | 0.38 | 0.00 | 2 | 13 | 0.15 |
| current | kid | normal | wide | 60 | 60 | 100 % | 30 / 37 / 54 | 37 (60) / 56 (22) / 75 (1) / – (0) | 1.5 | 1 / 2 / 3 | 776 / 941 / 1607 | 1 | 1.75 | 0.35 | 0.01 | 2 | 15 | 0.12 |
| current | adult | easy | land | 60 | 0 | 100 % | 16 / 20 / 26 | 20 (60) / 26 (60) / 33 (60) / 39 (60) | 1.2 | 7 / 7 / 7 | 11115 / 11959 / 12705 | 13 | 0.07 | 0.21 | 0.09 | 2 | 11 | 0.01 |
| current | bot0.4 | easy | land | 60 | 0 | 100 % | 17 / 24 / 30 | 24 (60) / 30 (60) / 35 (60) / 43 (60) | 1.4 | 7 / 7 / 7 | 9777 / 10416 / 11213 | 11 | 0.05 | 0.05 | 0.16 | 1 | 15 | 0.01 |
| current | bot1 | easy | land | 60 | 0 | 100 % | 17 / 20 / 26 | 20 (60) / 26 (60) / 32 (60) / 39 (60) | 1.2 | 7 / 7 / 7 | 11245 / 11878 / 12358 | 13 | 0.01 | 0.00 | 0.02 | 2 | 13 | 0.01 |
| current | adult | normal | land | 60 | 0 | 100 % | 18 / 22 / 27 | 22 (60) / 30 (60) / 36 (60) / 43 (59) | 1.0 | 7 / 7 / 7 | 9523 / 10861 / 11500 | 12 | 0.13 | 0.22 | 0.08 | 3 | 12 | 0.05 |
| current | bot0.4 | normal | land | 60 | 1 | 100 % | 20 / 25 / 31 | 25 (60) / 32 (60) / 41 (60) / 49 (59) | 1.2 | 7 / 7 / 7 | 8996 / 9534 / 10040 | 11 | 0.11 | 0.07 | 0.12 | 1 | 15 | 0.07 |
| current | bot1 | normal | land | 60 | 0 | 100 % | 18 / 21 / 26 | 21 (60) / 29 (60) / 37 (60) / 43 (60) | 1.0 | 7 / 7 / 7 | 10380 / 10927 / 11506 | 12 | 0.03 | 0.00 | 0.02 | 1 | 14 | 0.07 |
| current | adult | hard | land | 60 | 5 | 98 % | 26 / 31 / 40 | 31 (59) / 40 (59) / 50 (59) / 58 (59) | 1.4 | 7 / 7 / 8 | 5518 / 8433 / 9565 | 9 | 0.11 | 0.31 | 0.10 | 3 | 3 | 0.00 |
| current | bot0.4 | hard | land | 60 | 6 | 100 % | 28 / 37 / 49 | 37 (60) / 50 (60) / 61 (60) / 67 (58) | 1.5 | 7 / 7 / 8 | 6286 / 7114 / 7862 | 8 | 0.16 | 0.13 | 0.19 | 1 | 4 | 0.00 |
| current | bot1 | hard | land | 60 | 0 | 100 % | 25 / 30 / 36 | 30 (60) / 40 (60) / 47 (60) / 57 (60) | 1.4 | 7 / 7 / 7 | 8574 / 9072 / 9742 | 10 | 0.02 | 0.00 | 0.04 | 1 | 3 | 0.00 |
| current | adult | normal | port | 60 | 1 | 100 % | 18 / 22 / 28 | 22 (60) / 32 (60) / 37 (60) / 47 (60) | 1.2 | 7 / 7 / 7 | 8568 / 9942 / 10651 | 11 | 0.08 | 0.24 | 0.08 | 3 | 9 | 0.03 |
| current | adult | normal | wide | 60 | 1 | 100 % | 18 / 22 / 26 | 22 (60) / 30 (60) / 36 (58) / 45 (58) | 1.0 | 7 / 7 / 7 | 9912 / 10705 / 11304 | 12 | 0.11 | 0.20 | 0.06 | 3 | 11 | 0.03 |
| current | kid-oblivious | normal | land | 60 | 60 | 98 % | 31 / 37 / 53 | 37 (59) / 55 (22) / – (0) / – (0) | 1.9 | 1 / 2 / 3 | 783 / 951 / 1624 | 1 | 1.75 | 0.24 | 0.00 | 2 | 16 | 0.24 |
| current | flipspam | normal | land | 15 | 1 | 100 % | 18 / 20 / 24 | 20 (15) / 28 (15) / 38 (15) / 42 (15) | 0.8 | 7 / 7 / 7 | 10417 / 10892 / 11581 | 12 | 0.17 | 0.27 | 0.00 | 21 | 12 | 0.06 |
| current | flipspam | hard | land | 15 | 0 | 100 % | 28 / 31 / 42 | 31 (15) / 39 (15) / 52 (15) / 59 (15) | 1.2 | 7 / 7 / 7 | 8101 / 8727 / 9193 | 9 | 0.05 | 0.35 | 0.01 | 21 | 3 | 0.00 |
| current | circle | normal | land | 15 | 0 | 0 % | – / – / – | – (0) / – (0) / – (0) / – (0) | – | 8 / 8 / 8 | 0 / 0 / 0 | 0 | 0.00 | 0.00 | 0.00 | 0 | 0 | 0.00 |
| current | circle | hard | land | 15 | 0 | 0 % | – / – / – | – (0) / – (0) / – (0) / – (0) | – | 8 / 8 / 8 | 0 / 0 / 0 | 0 | 0.00 | 0.00 | 0.00 | 0 | 0 | 0.00 |
| current | orbit | normal | land | 15 | 0 | 0 % | – / – / – | – (0) / – (0) / – (0) / – (0) | 8.1 | 8 / 8 / 8 | 0 / 0 / 22 | 0 | 0.00 | 0.33 | 0.00 | 0 | 0 | 0.00 |
| current | orbit | hard | land | 15 | 0 | 0 % | – / – / – | – (0) / – (0) / – (0) / – (0) | 6.8 | 8 / 8 / 8 | 0 / 0 / 10 | 0 | 0.00 | 0.23 | 0.00 | 0 | 0 | 0.00 |
| current | wallhug | normal | land | 15 | 0 | 0 % | – / – / – | – (0) / – (0) / – (0) / – (0) | 6.8 | 8 / 8 / 8 | 0 / 10 / 42 | 0 | 0.00 | 2.18 | 0.00 | 0 | 98 | 0.00 |
| current | wallhug | hard | land | 15 | 0 | 0 % | – / – / – | – (0) / – (0) / – (0) / – (0) | 11.1 | 8 / 8 / 8 | 0 / 0 / 10 | 0 | 0.00 | 2.94 | 0.00 | 0 | 6 | 0.00 |
| current | edgedart | normal | land | 15 | 15 | 100 % | 25 / 34 / 39 | 34 (15) / 50 (15) / 58 (11) / 69 (3) | 0.8 | 2 / 3 / 6 | 1486 / 2698 / 4606 | 3 | 1.21 | 0.81 | 0.00 | 0 | 38 | 0.48 |
| current | edgedart | hard | land | 15 | 15 | 73 % | 38 / 54 / 76 | 54 (11) / 65 (1) / – (0) / – (0) | 1.1 | 1 / 2 / 2 | 278 / 966 / 1197 | 1 | 1.75 | 1.17 | 0.00 | 0 | 6 | 0.00 |
| current | edgedart | normal | port | 15 | 14 | 100 % | 29 / 33 / 42 | 33 (15) / 53 (14) / 60 (11) / 78 (3) | 0.8 | 2 / 4 / 6 | 1760 / 2662 / 4971 | 3 | 0.94 | 0.62 | 0.00 | 0 | 35 | 0.27 |

## Bonk context (share of all bonks; tags overlap) and death context

| Set | Model | Diff | Arena | Bonks | after-bounce | pillow-dizzy | boss-visit | kid-hold | near-strip | open-field | trail<10 / 10-15 / 16+ | Deaths by level (0 = biome 1) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| current | kid | easy | land | 356 | 12 % | 0 % | 18 % | 17 % | 35 % | 65 % | 24 % / 75 % / 1 % | L1:1 L2:30 L3:27 L4:1 L5:1 |
| current | kid | easy | ipad | 374 | 9 % | 0 % | 19 % | 17 % | 23 % | 77 % | 29 % / 70 % / 1 % | L1:2 L2:23 L3:26 L4:1 L5:4 L6:3 L7:1 |
| current | kid | easy | port | 374 | 13 % | 0 % | 18 % | 19 % | 28 % | 72 % | 29 % / 70 % / 2 % | L1:3 L2:22 L3:29 L5:2 L6:3 L7:1 |
| current | kid | easy | wide | 380 | 13 % | 0 % | 19 % | 15 % | 37 % | 63 % | 31 % / 69 % / 1 % | L1:2 L2:20 L3:29 L5:4 L6:4 L7:1 |
| current | kid | normal | land | 200 | 35 % | 1 % | 24 % | 22 % | 41 % | 60 % | 20 % / 80 % / 1 % | L0:1 L1:42 L2:17 |
| current | kid | normal | ipad | 207 | 27 % | 0 % | 15 % | 17 % | 31 % | 69 % | 15 % / 85 % / 0 % | L1:40 L2:18 L3:2 |
| current | kid | normal | port | 216 | 23 % | 0 % | 25 % | 17 % | 31 % | 69 % | 13 % / 83 % / 3 % | L1:28 L2:31 L3:1 |
| current | kid | normal | wide | 207 | 29 % | 0 % | 17 % | 21 % | 39 % | 61 % | 17 % / 82 % / 1 % | L1:38 L2:21 L3:1 |
| current | adult | easy | land | 32 | 28 % | 0 % | 28 % | 0 % | 41 % | 59 % | 34 % / 47 % / 19 % | – |
| current | bot0.4 | easy | land | 22 | 77 % | 0 % | 9 % | 0 % | 86 % | 14 % | 32 % / 55 % / 14 % | – |
| current | bot1 | easy | land | 6 | 33 % | 0 % | 33 % | 0 % | 50 % | 50 % | 33 % / 50 % / 17 % | – |
| current | adult | normal | land | 55 | 51 % | 0 % | 24 % | 0 % | 53 % | 47 % | 16 % / 27 % / 56 % | – |
| current | bot0.4 | normal | land | 46 | 61 % | 0 % | 17 % | 0 % | 72 % | 28 % | 15 % / 35 % / 50 % | L3:1 |
| current | bot1 | normal | land | 11 | 36 % | 0 % | 36 % | 0 % | 45 % | 55 % | 18 % / 0 % / 82 % | – |
| current | adult | hard | land | 49 | 69 % | 4 % | 37 % | 0 % | 73 % | 27 % | 18 % / 35 % / 47 % | L6:2 L7:3 |
| current | bot0.4 | hard | land | 70 | 87 % | 1 % | 23 % | 0 % | 81 % | 19 % | 26 % / 27 % / 47 % | L3:2 L6:3 L7:1 |
| current | bot1 | hard | land | 7 | 0 % | 0 % | 57 % | 0 % | 0 % | 100 % | 0 % / 0 % / 100 % | – |
| current | adult | normal | port | 36 | 44 % | 3 % | 25 % | 0 % | 42 % | 58 % | 11 % / 39 % / 50 % | L7:1 |
| current | adult | normal | wide | 49 | 59 % | 0 % | 45 % | 0 % | 67 % | 33 % | 18 % / 24 % / 57 % | L2:1 |
| current | kid-oblivious | normal | land | 201 | 35 % | 0 % | 24 % | 18 % | 39 % | 61 % | 18 % / 81 % / 0 % | L0:1 L1:37 L2:22 |
| current | flipspam | normal | land | 18 | 44 % | 0 % | 39 % | 0 % | 39 % | 61 % | 28 % / 33 % / 39 % | L11:1 |
| current | flipspam | hard | land | 6 | 83 % | 0 % | 17 % | 0 % | 83 % | 17 % | 33 % / 50 % / 17 % | – |
| current | edgedart | normal | land | 66 | 47 % | 0 % | 15 % | 0 % | 67 % | 33 % | 8 % / 67 % / 26 % | L2:4 L3:8 L5:1 L6:2 |
| current | edgedart | hard | land | 45 | 100 % | 0 % | 27 % | 0 % | 4 % | 96 % | 33 % / 67 % / 0 % | L0:4 L1:10 L2:1 |
| current | edgedart | normal | port | 55 | 38 % | 0 % | 20 % | 0 % | 69 % | 31 % | 4 % / 62 % / 35 % | L1:1 L2:3 L3:8 L6:2 |

## Fairness checks

| Set | Model | Diff | Arena | Pillows thrown | Unescapable + no flip (0.4 s reaction) | … (instant reaction) | Pillows landing under the touch button | Loose notes vanishing under the button | Notes spawned (under button / on trail / on Spike) | Oldest idle note s |
|---|---|---|---|---|---|---|---|---|---|---|
| current | kid | easy | land | 1066 | 0 (0.0 %) | 0 | 0 | 0 | 2927 (0 / 0 / 0) | 52 |
| current | kid | easy | ipad | 1295 | 0 (0.0 %) | 0 | 35 | 1 | 3296 (0 / 0 / 0) | 71 |
| current | kid | easy | port | 1247 | 0 (0.0 %) | 0 | 36 | 4 | 3225 (0 / 0 / 0) | 70 |
| current | kid | easy | wide | 1265 | 0 (0.0 %) | 0 | 41 | 6 | 3390 (0 / 0 / 0) | 71 |
| current | kid | normal | land | 662 | 0 (0.0 %) | 0 | 0 | 0 | 1943 (0 / 0 / 0) | 63 |
| current | kid | normal | ipad | 733 | 0 (0.0 %) | 0 | 5 | 1 | 2036 (0 / 0 / 0) | 47 |
| current | kid | normal | port | 818 | 0 (0.0 %) | 0 | 24 | 10 | 2273 (0 / 0 / 0) | 41 |
| current | kid | normal | wide | 706 | 0 (0.0 %) | 0 | 21 | 2 | 2057 (0 / 0 / 0) | 51 |
| current | adult | easy | land | 2557 | 0 (0.0 %) | 0 | 0 | 0 | 12609 (0 / 0 / 0) | 87 |
| current | bot0.4 | easy | land | 2615 | 0 (0.0 %) | 0 | 0 | 0 | 11160 (0 / 0 / 0) | 36 |
| current | bot1 | easy | land | 2560 | 0 (0.0 %) | 0 | 0 | 0 | 12528 (0 / 0 / 0) | 33 |
| current | adult | normal | land | 2596 | 0 (0.0 %) | 0 | 0 | 0 | 14012 (0 / 0 / 0) | 372 |
| current | bot0.4 | normal | land | 2632 | 0 (0.0 %) | 0 | 0 | 0 | 12730 (0 / 0 / 0) | 40 |
| current | bot1 | normal | land | 2606 | 0 (0.0 %) | 0 | 0 | 0 | 14404 (0 / 0 / 0) | 28 |
| current | adult | hard | land | 2959 | 0 (0.0 %) | 0 | 0 | 0 | 10420 (0 / 0 / 0) | 466 |
| current | bot0.4 | hard | land | 3027 | 0 (0.0 %) | 0 | 0 | 0 | 9254 (0 / 0 / 0) | 15 |
| current | bot1 | hard | land | 3002 | 0 (0.0 %) | 0 | 0 | 0 | 11403 (0 / 0 / 0) | 14 |
| current | adult | normal | port | 2582 | 0 (0.0 %) | 0 | 61 | 1 | 13079 (0 / 0 / 0) | 258 |
| current | adult | normal | wide | 2601 | 0 (0.0 %) | 0 | 69 | 1 | 13570 (0 / 0 / 0) | 418 |
| current | kid-oblivious | normal | land | 680 | 0 (0.0 %) | 0 | 0 | 0 | 1990 (0 / 0 / 0) | 41 |
| current | flipspam | normal | land | 646 | 0 (0.0 %) | 0 | 0 | 0 | 3632 (0 / 0 / 0) | 22 |
| current | flipspam | hard | land | 753 | 0 (0.0 %) | 0 | 0 | 0 | 2762 (0 / 0 / 0) | 144 |
| current | circle | normal | land | 720 | 0 (0.0 %) | 0 | 0 | 0 | 30 (0 / 0 / 0) | 480 |
| current | circle | hard | land | 855 | 0 (0.0 %) | 0 | 0 | 0 | 15 (0 / 0 / 0) | 480 |
| current | orbit | normal | land | 720 | 0 (0.0 %) | 0 | 0 | 0 | 38 (0 / 0 / 0) | 480 |
| current | orbit | hard | land | 855 | 0 (0.0 %) | 0 | 0 | 0 | 18 (0 / 0 / 0) | 480 |
| current | wallhug | normal | land | 720 | 0 (0.0 %) | 0 | 0 | 0 | 51 (0 / 0 / 0) | 480 |
| current | wallhug | hard | land | 855 | 0 (0.0 %) | 0 | 0 | 0 | 24 (0 / 0 / 0) | 480 |
| current | edgedart | normal | land | 322 | 0 (0.0 %) | 0 | 0 | 0 | 1153 (0 / 0 / 0) | 43 |
| current | edgedart | hard | land | 174 | 0 (0.0 %) | 0 | 0 | 0 | 415 (0 / 0 / 0) | 12 |
| current | edgedart | normal | port | 350 | 0 (0.0 %) | 0 | 14 | 0 | 1130 (0 / 0 / 0) | 33 |

(1365 games, 847 s wall time)
