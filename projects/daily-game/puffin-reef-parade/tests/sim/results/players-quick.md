# Player-model playtest — suite `quick`, 30 rounds per cell (probes N/4), 8 min cap, dt 1/60

Arenas: `land` = landscape 960×540 (desktop / default) [28,76,932,516]; `ipad` = iPad 4:3 (960×720, touch) [28,76,932,696]; `port` = portrait phone (setArena 28,88,532,1080) [28,88,532,1080]; `wide` = wide phone 1170×540 (notch insets, touch) [93,76,1077,487]

| Model | Diff | Arena | N | Died ≤ cap | Clear season 1 / 2 / 3 / 4 (lap 1) | s per season, lap 1 (median): spring / summer / autumn / winter | Season-1 s p10/p50/p90 | Survival min p10/p50/p90 | Levels (med) | Bonks/min | Flips/min | Gold caught | Score (med) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| kid | easy | land | 30 | 0 | 100% / 100% / 100% / 100% | 18 / 30 / 34 / 40 | 14 / 18 / 37 | 7 / 7 / 7 | 12 | 0.13 | 1.9 | 466/550 (85%) | 8992 |
| casual | easy | land | 30 | 0 | 100% / 100% / 100% / 100% | 14 / 17 / 21 / 26 | 12 / 14 / 17 | 7 / 7 / 7 | 17 | 0.01 | 0.7 | 553/558 (99%) | 13368 |
| spam | easy | land | 30 | 0 | 100% / 100% / 100% / 100% | 14 / 17 / 21 / 26 | 12 / 14 / 17 | 7 / 7 / 7 | 17 | 0.01 | 27.3 | 554/559 (99%) | 13368 |
| kid | normal | land | 30 | 0 | 100% / 100% / 100% / 100% | 26 / 30 / 40 / 37 | 18 / 26 / 44 | 7 / 7 / 7 | 11 | 0.05 | 1.9 | 459/578 (79%) | 7088 |
| casual | normal | land | 30 | 0 | 100% / 100% / 100% / 100% | 14 / 18 / 22 / 25 | 12 / 14 / 17 | 7 / 7 / 7 | 17 | 0.00 | 1.2 | 539/545 (99%) | 11352 |
| spam | normal | land | 30 | 0 | 100% / 100% / 100% / 100% | 14 / 18 / 22 / 25 | 12 / 14 / 17 | 7 / 7 / 7 | 17 | 0.00 | 22.2 | 539/545 (99%) | 11352 |
| kid | hard | land | 30 | 30 | 97% / 57% / 30% / 3% | 62 / 55 / 66 / 82 | 37 / 62 / 82 | 2 / 3 / 5 | 2 | 0.92 | 1.7 | 143/247 (58%) | 1900 |
| casual | hard | land | 30 | 6 | 100% / 100% / 100% / 100% | 33 / 35 / 42 / 52 | 29 / 33 / 36 | 7 / 7 / 7 | 10 | 0.20 | 2.1 | 614/640 (96%) | 9444 |
| spam | hard | land | 30 | 7 | 100% / 100% / 100% / 100% | 33 / 36 / 43 / 52 | 29 / 33 / 37 | 7 / 7 / 7 | 10 | 0.21 | 21.2 | 604/630 (96%) | 9562 |

## Bonk context and golden-star sanity

| Model | Diff | Arena | after-bounce | kid-hold | near-strip / open-field | Deaths by level | Gold outside arena (steps) | Gold longest still (s) |
|---|---|---|---|---|---|---|---|---|
| kid | easy | land | 0 | 6 | 14 / 15 | – | 0 | 0.02 |
| casual | easy | land | 0 | 0 | 1 / 2 | – | 0 | 0.02 |
| spam | easy | land | 0 | 0 | 0 / 2 | – | 0 | 0.02 |
| kid | normal | land | 0 | 2 | 0 / 10 | – | 0 | 0.03 |
| casual | normal | land | 0 | 0 | 0 / 1 | – | 0 | 0.02 |
| spam | normal | land | 0 | 0 | 0 / 0 | – | 0 | 0.02 |
| kid | hard | land | 63 | 14 | 22 / 68 | L0:1 L1:12 L2:8 L3:8 L5:1 | 0 | 0.03 |
| casual | hard | land | 42 | 0 | 35 / 8 | L7:2 L8:2 L9:2 | 0 | 0.28 |
| spam | hard | land | 44 | 0 | 30 / 15 | L6:1 L7:2 L8:1 L9:3 | 0 | 0.28 |

(270 games, 116 s wall time)
