# Playtest — proposed2 — 80 rounds per cell, 30 min cap — overrides proposed2.json

## Survival, score, progress

| Model | Diff | Survival min p10/p25/med/p75/p90 | Died ≤ cap | Death level med | Score p10/med/p90 | Score/min | Level p10/med/p90 | 1st catch s med (p90, none) | Clear L1 / loop 1 |
|---|---|---|---|---|---|---|---|---|---|
| kid4 | easy | 9.9 / 11.2 / 12.5 / 13.8 / 15.0 | 100% | 12 | 8010 / 10460 / 12720 | 833 | 10 / 12 / 15 | 3.8 (6.5, 0%) | 100% / 99% |
| kid4 | normal | 2.6 / 5.3 / 6.6 / 7.7 / 9.3 | 100% | 5 | 1270 / 3260 / 4260 | 478 | 2 / 5 / 7 | 3.2 (5.2, 0%) | 100% / 76% |
| kid4 | hard | 1.5 / 1.9 / 3.4 / 4.7 / 6.5 | 100% | 2 | 600 / 1480 / 2810 | 419 | 1 / 2 / 4 | 3.0 (4.7, 0%) | 99% / 23% |
| kid6 | easy | 12.1 / 13.4 / 15.9 / 17.6 / 19.5 | 100% | 17 | 12490 / 17070 / 21940 | 1080 | 13 / 17 / 22 | 3.8 (3.8, 0%) | 100% / 100% |
| kid6 | normal | 5.9 / 7.3 / 8.7 / 10.1 / 10.8 | 100% | 8 | 4210 / 5960 / 7930 | 693 | 5 / 8 / 10 | 3.2 (3.2, 0%) | 100% / 100% |
| kid6 | hard | 3.4 / 4.9 / 6.4 / 8.0 / 10.0 | 100% | 5 | 1710 / 3600 / 5940 | 564 | 3 / 5 / 8 | 3.0 (3.0, 0%) | 100% / 80% |
| casual | easy | 21.1 / 24.0 / 27.4 / 30.0 / 30.0 | 59% | 30 | 24560 / 37400 / 46920 | 1401 | 23 / 35 / 42 | 3.5 (3.8, 0%) | 100% / 100% |
| casual | normal | 10.3 / 12.8 / 15.2 / 18.4 / 21.8 | 100% | 15 | 9420 / 14680 / 20370 | 925 | 10 / 15 / 20 | 2.9 (3.2, 0%) | 100% / 100% |
| casual | hard | 9.0 / 11.4 / 14.0 / 15.7 / 18.2 | 100% | 13 | 6490 / 10290 / 14400 | 770 | 8 / 13 / 17 | 2.7 (3.0, 0%) | 100% / 100% |
| bot1.0 | easy | 25.6 / 30.0 / 30.0 / 30.0 / 30.0 | 18% | 31 | 34440 / 48070 / 52130 | 1584 | 32 / 42 / 43 | 3.8 (3.8, 0%) | 100% / 100% |
| bot1.0 | normal | 11.7 / 14.8 / 17.9 / 20.8 / 28.7 | 95% | 17 | 13440 / 21510 / 38150 | 1212 | 11 / 18 / 30 | 3.2 (3.2, 0%) | 100% / 100% |
| bot1.0 | hard | 9.3 / 11.3 / 13.5 / 16.5 / 20.6 | 99% | 13 | 11670 / 16770 / 25880 | 1239 | 9 / 13 / 20 | 3.0 (3.0, 0%) | 100% / 100% |
| bot0.3 | easy | 15.8 / 18.7 / 21.6 / 27.1 / 29.7 | 91% | 25 | 19050 / 28150 / 43490 | 1345 | 17 / 26 / 41 | 3.8 (3.8, 0%) | 100% / 100% |
| bot0.3 | normal | 8.9 / 10.8 / 13.3 / 15.5 / 17.4 | 100% | 12 | 7560 / 12020 / 16740 | 940 | 8 / 12 / 17 | 3.2 (3.2, 0%) | 100% / 100% |
| bot0.3 | hard | 7.4 / 9.8 / 11.7 / 14.1 / 15.6 | 100% | 11 | 5560 / 8940 / 11950 | 766 | 7 / 11 / 14 | 3.0 (3.0, 0%) | 100% / 100% |

## Level pacing: median s per level (zone → cleared), levels 1–12

| Model | Diff | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | L11 | L12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| kid4 | easy | 47 | 55 | 63 | 67 | 48 | 54 | 63 | 66 | 48 | 55 | 62 | 67 |
| kid4 | normal | 54 | 62 | 80 | 89 | 61 | 64 | 90 | 90 | 53 | – | – | – |
| kid4 | hard | 57 | 72 | 95 | 101 | 65 | – | – | – | – | – | – | – |
| kid6 | easy | 43 | 51 | 56 | 66 | 45 | 51 | 55 | 63 | 43 | 50 | 54 | 64 |
| kid6 | normal | 48 | 55 | 64 | 77 | 53 | 58 | 67 | 78 | 58 | 59 | 69 | 78 |
| kid6 | hard | 51 | 62 | 75 | 85 | 54 | 66 | 74 | 86 | 50 | 61 | 82 | – |
| casual | easy | 43 | 50 | 55 | 62 | 43 | 50 | 56 | 60 | 42 | 49 | 53 | 61 |
| casual | normal | 47 | 53 | 59 | 66 | 52 | 55 | 63 | 68 | 54 | 58 | 65 | 73 |
| casual | hard | 47 | 57 | 63 | 70 | 51 | 60 | 64 | 76 | 54 | 63 | 67 | 77 |
| bot1.0 | easy | 43 | 50 | 55 | 62 | 43 | 49 | 54 | 60 | 42 | 49 | 53 | 60 |
| bot1.0 | normal | 47 | 52 | 57 | 62 | 51 | 53 | 60 | 65 | 53 | 57 | 63 | 69 |
| bot1.0 | hard | 45 | 54 | 56 | 63 | 48 | 56 | 59 | 66 | 50 | 59 | 62 | 69 |
| bot0.3 | easy | 43 | 50 | 55 | 62 | 44 | 49 | 55 | 61 | 42 | 49 | 53 | 61 |
| bot0.3 | normal | 48 | 53 | 58 | 67 | 52 | 55 | 60 | 70 | 55 | 58 | 63 | 71 |
| bot0.3 | hard | 48 | 58 | 60 | 73 | 51 | 59 | 64 | 77 | 53 | 63 | 68 | 78 |

## Weather: catch rate (loop 1 / all), zaps per min played, mean star sideways travel px

| Model | Diff | Catch loop1 sun/rain/wind/snow | Catch all loops | Zap/min sun/rain/wind/snow | Drift px sun/rain/wind/snow |
|---|---|---|---|---|---|
| kid4 | easy | 0.91 / 0.90 / 0.87 / 0.89 | 0.90 / 0.90 / 0.86 / 0.89 | 0.65 / 0.91 / 0.71 / 0.55 | 3 / 4 / 58 / 10 |
| kid4 | normal | 0.87 / 0.82 / 0.68 / 0.69 | 0.85 / 0.81 / 0.68 / 0.69 | 0.69 / 1.11 / 0.77 / 0.43 | 4 / 6 / 72 / 4 |
| kid4 | hard | 0.77 / 0.70 / 0.55 / 0.59 | 0.76 / 0.70 / 0.55 / 0.59 | 0.63 / 1.35 / 0.67 / 0.70 | 6 / 7 / 80 / 3 |
| kid6 | easy | 0.99 / 0.99 / 0.98 / 0.94 | 0.98 / 0.98 / 0.97 / 0.93 | 0.45 / 0.59 / 0.48 / 0.33 | 4 / 5 / 54 / 8 |
| kid6 | normal | 0.98 / 0.95 / 0.89 / 0.80 | 0.96 / 0.94 / 0.89 / 0.80 | 0.41 / 0.73 / 0.47 / 0.34 | 5 / 7 / 69 / 3 |
| kid6 | hard | 0.89 / 0.86 / 0.75 / 0.72 | 0.88 / 0.85 / 0.74 / 0.72 | 0.40 / 0.77 / 0.37 / 0.38 | 7 / 8 / 77 / 3 |
| casual | easy | 1.00 / 1.00 / 1.00 / 1.00 | 0.99 / 0.99 / 0.98 / 0.98 | 0.15 / 0.16 / 0.20 / 0.23 | 7 / 7 / 53 / 10 |
| casual | normal | 1.00 / 0.99 / 0.96 / 0.94 | 0.99 / 0.98 / 0.96 / 0.94 | 0.16 / 0.22 / 0.18 / 0.29 | 6 / 8 / 68 / 6 |
| casual | hard | 0.94 / 0.93 / 0.90 / 0.87 | 0.94 / 0.93 / 0.90 / 0.87 | 0.13 / 0.21 / 0.27 / 0.30 | 8 / 9 / 75 / 7 |
| bot1.0 | easy | 1.00 / 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 / 1.00 | 0.12 / 0.10 / 0.15 / 0.11 | 7 / 8 / 53 / 10 |
| bot1.0 | normal | 1.00 / 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 / 1.00 | 0.17 / 0.16 / 0.25 / 0.12 | 7 / 8 / 66 / 8 |
| bot1.0 | hard | 1.00 / 1.00 / 1.00 / 0.98 | 1.00 / 1.00 / 1.00 / 0.98 | 0.32 / 0.31 / 0.20 / 0.07 | 8 / 9 / 75 / 8 |
| bot0.3 | easy | 1.00 / 1.00 / 1.00 / 1.00 | 1.00 / 1.00 / 1.00 / 0.99 | 0.21 / 0.28 / 0.32 / 0.30 | 6 / 7 / 54 / 9 |
| bot0.3 | normal | 1.00 / 0.99 / 0.98 / 0.93 | 0.99 / 0.99 / 0.98 / 0.92 | 0.21 / 0.34 / 0.25 / 0.32 | 6 / 7 / 67 / 5 |
| bot0.3 | hard | 0.94 / 0.93 / 0.92 / 0.86 | 0.94 / 0.93 / 0.92 / 0.86 | 0.21 / 0.27 / 0.28 / 0.32 | 8 / 9 / 78 / 6 |

## Gold, jets, streak

| Model | Diff | Gold / level | Gold share of stars | Gold caught (loop1 / all) | Jet/min (catch %) | Best streak med |
|---|---|---|---|---|---|---|
| kid4 | easy | 1.98 | 10% | 86% / 85% | 6.2 (38%) | 29 |
| kid4 | normal | 2.57 | 9% | 69% / 69% | 6.2 (33%) | 17 |
| kid4 | hard | 2.89 | 9% | 58% / 58% | 5.8 (31%) | 11 |
| kid6 | easy | 1.92 | 10% | 94% / 94% | 6.4 (70%) | 63 |
| kid6 | normal | 2.39 | 9% | 87% / 88% | 6.5 (67%) | 35 |
| kid6 | hard | 2.88 | 9% | 76% / 76% | 6.5 (61%) | 18 |
| casual | easy | 1.95 | 10% | 96% / 95% | 9.6 (88%) | 214 |
| casual | normal | 2.32 | 9% | 93% / 93% | 8.9 (89%) | 79 |
| casual | hard | 2.73 | 9% | 86% / 87% | 8.8 (83%) | 37 |
| bot1.0 | easy | 1.96 | 10% | 97% / 97% | 3.2 (105%) | 334 |
| bot1.0 | normal | 2.34 | 10% | 97% / 98% | 2.4 (78%) | 253 |
| bot1.0 | hard | 2.53 | 9% | 97% / 97% | 2.5 (83%) | 154 |
| bot0.3 | easy | 1.92 | 10% | 97% / 96% | 2.3 (99%) | 170 |
| bot0.3 | normal | 2.33 | 9% | 91% / 92% | 2.3 (94%) | 74 |
| bot0.3 | hard | 2.66 | 9% | 86% / 87% | 2.6 (95%) | 39 |

## Zap causes (share of all zaps) and medals (current thresholds 300/1000/2200/4000)

| Model | Diff | Zap/min | Causes | Medals none/bronze/silver/gold/plat | Score @3/@5/@10 min med |
|---|---|---|---|---|---|
| kid4 | easy | 0.66 | no dodge 52%, mistook for star 22%, distracted 19%, during Jet Hop 2%, wind push 2%, late dodge 2%, snow slide 1%, star next to puff 0% | 0% / 0% / 0% / 1% / 99% | 2660 / 4460 / 8620 |
| kid4 | normal | 0.73 | no dodge 49%, mistook for star 25%, distracted 14%, late dodge 6%, wind push 3%, during Jet Hop 2%, snow slide 1% | 0% / 10% / 13% / 60% / 18% | 1440 / 2350 / 3260 |
| kid4 | hard | 0.82 | no dodge 45%, mistook for star 30%, distracted 17%, late dodge 5%, star next to puff 1%, wind push 1%, during Jet Hop 1% | 1% / 34% / 41% / 24% / 0% | 1240 / 1480 / 1480 |
| kid6 | easy | 0.43 | no dodge 65%, mistook for star 18%, late dodge 6%, distracted 4%, during Jet Hop 4%, snow slide 2%, wind push 1%, star next to puff 1% | 0% / 0% / 0% / 0% / 100% | 3410 / 5720 / 11710 |
| kid6 | normal | 0.46 | no dodge 54%, mistook for star 23%, late dodge 8%, distracted 6%, during Jet Hop 3%, snow slide 3%, star next to puff 1%, wind push 1% | 0% / 0% / 0% / 10% / 90% | 2460 / 3620 / 5940 |
| kid6 | hard | 0.46 | no dodge 44%, mistook for star 25%, late dodge 9%, distracted 6%, snow slide 6%, during Jet Hop 4%, wind push 3%, star next to puff 3% | 0% / 3% / 14% / 48% / 36% | 1770 / 2760 / 3600 |
| casual | easy | 0.17 | no dodge 57%, snow slide 17%, late dodge 12%, wind push 11%, star next to puff 2%, distracted 1%, during Jet Hop 0% | 0% / 0% / 0% / 0% / 100% | 3670 / 6350 / 13520 |
| casual | normal | 0.20 | no dodge 54%, snow slide 28%, late dodge 7%, wind push 5%, star next to puff 4%, during Jet Hop 0%, distracted 0% | 0% / 0% / 0% / 0% / 100% | 3090 / 5210 / 10000 |
| casual | hard | 0.22 | no dodge 41%, snow slide 25%, wind push 21%, late dodge 6%, star next to puff 5%, distracted 1%, during Jet Hop 0% | 0% / 0% / 0% / 0% / 100% | 2580 / 4150 / 7720 |
| bot1.0 | easy | 0.11 | late dodge 37%, wind push 25%, snow slide 21%, star next to puff 14%, during Jet Hop 2% | 0% / 0% / 0% / 0% / 100% | 3710 / 6390 / 13550 |
| bot1.0 | normal | 0.16 | late dodge 40%, wind push 33%, snow slide 14%, star next to puff 11%, during Jet Hop 1% | 0% / 0% / 0% / 0% / 100% | 3570 / 6240 / 12270 |
| bot1.0 | hard | 0.21 | late dodge 65%, wind push 19%, star next to puff 7%, snow slide 7%, during Jet Hop 2% | 0% / 0% / 0% / 0% / 100% | 3970 / 6650 / 12690 |
| bot0.3 | easy | 0.26 | unseen 57%, snow slide 16%, late dodge 10%, wind push 10%, star next to puff 6% | 0% / 0% / 0% / 0% / 100% | 3680 / 6290 / 13250 |
| bot0.3 | normal | 0.26 | unseen 57%, snow slide 21%, late dodge 13%, wind push 5%, star next to puff 4% | 0% / 0% / 0% / 0% / 100% | 3190 / 5230 / 9770 |
| bot0.3 | hard | 0.26 | unseen 49%, snow slide 20%, wind push 15%, late dodge 9%, star next to puff 6% | 0% / 0% / 0% / 0% / 100% | 2570 / 4040 / 7540 |

1200 runs in 284 s.
