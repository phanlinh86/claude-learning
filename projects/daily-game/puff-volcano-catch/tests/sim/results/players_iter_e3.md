# Player-model playtest — iter_e3 — 120 rounds per cell, 5 min cap — overrides e3.json

## Survival, score, progress

| Model | Diff | Survival min p10/med/p90 | Died ≤ cap | Score p10/med/p90 | Score/min | Level med (max) | 1st catch s (none) | Ouch/min | Rain/min |
|---|---|---|---|---|---|---|---|---|---|
| kid4 | easy | 5.0 / 5.0 / 5.0 | 1 % | 2670 / 3115 / 3840 | 636 | 3 (4) | 5.2 (0 %) | 0.43 | 0.1 |
| kid6 | easy | 5.0 / 5.0 / 5.0 | 0 % | 5940 / 6725 / 8010 | 1368 | 5 (6) | 5.1 (0 %) | 0.16 | 0.2 |
| adult | easy | 5.0 / 5.0 / 5.0 | 0 % | 8620 / 9915 / 11360 | 1983 | 5 (6) | 5.1 (0 %) | 0.01 | 0.2 |
| bot1.0 | easy | 5.0 / 5.0 / 5.0 | 0 % | 10235 / 11515 / 12695 | 2300 | 6 (6) | 5.1 (0 %) | 0.00 | 0.4 |

## Zones (lap 1): clear rate, median s to clear (p90), catch rate

| Model | Diff | Clear Z1 / Z2 / Z3 / Z4 | s per zone med (p90): beach / jungle / ash / crater | Catch rate beach / jungle / ash / crater / lap≥2 |
|---|---|---|---|---|
| kid4 | easy | 100 % / 100 % / 98 % / 9 % | 65 (83) / 78 (97) / 83 (106) / 69 (89) | 0.67 / 0.63 / 0.59 / 0.57 / 0.56 |
| kid6 | easy | 100 % / 100 % / 100 % / 100 % | 47 (53) / 55 (64) / 57 (67) / 60 (70) | 0.93 / 0.90 / 0.88 / 0.86 / 0.89 |
| adult | easy | 100 % / 100 % / 100 % / 100 % | 47 (50) / 52 (58) / 54 (62) / 55 (62) | 0.99 / 0.98 / 0.97 / 0.97 / 0.97 |
| bot1.0 | easy | 100 % / 100 % / 100 % / 100 % | 44 (50) / 50 (58) / 52 (59) / 53 (62) | 1.00 / 1.00 / 1.00 / 0.99 / 1.00 |

## Combo twist

| Model | Diff | Best combo med | Runs reaching ×2 / ×3 / ×4 / ×5 | Coin points earned at ×≥2 | …share of total score |
|---|---|---|---|---|---|
| kid4 | easy | 10 | 100 % / 27 % / 0 % / 0 % | 64 % | 36 % |
| kid6 | easy | 26 | 100 % / 100 % / 73 % / 18 % | 91 % | 59 % |
| adult | easy | 61 | 100 % / 100 % / 100 % / 95 % | 98 % | 71 % |
| bot1.0 | easy | 123 | 100 % / 100 % / 100 % / 100 % | 100 % | 75 % |

480 runs in 57 s.
