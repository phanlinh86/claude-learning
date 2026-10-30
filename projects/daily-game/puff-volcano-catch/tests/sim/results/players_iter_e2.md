# Player-model playtest — iter_e2 — 120 rounds per cell, 5 min cap — overrides e2.json

## Survival, score, progress

| Model | Diff | Survival min p10/med/p90 | Died ≤ cap | Score p10/med/p90 | Score/min | Level med (max) | 1st catch s (none) | Ouch/min | Rain/min |
|---|---|---|---|---|---|---|---|---|---|
| kid4 | easy | 5.0 / 5.0 / 5.0 | 2 % | 2570 / 2895 / 3375 | 587 | 3 (4) | 5.0 (0 %) | 0.41 | 0.1 |
| kid6 | easy | 5.0 / 5.0 / 5.0 | 0 % | 5890 / 6890 / 8220 | 1386 | 5 (6) | 4.9 (0 %) | 0.14 | 0.2 |
| adult | easy | 5.0 / 5.0 / 5.0 | 0 % | 8810 / 10185 / 11510 | 2037 | 6 (6) | 4.9 (0 %) | 0.01 | 0.2 |
| bot1.0 | easy | 5.0 / 5.0 / 5.0 | 0 % | 10360 / 11650 / 12950 | 2327 | 6 (6) | 4.9 (0 %) | 0.00 | 0.4 |

## Zones (lap 1): clear rate, median s to clear (p90), catch rate

| Model | Diff | Clear Z1 / Z2 / Z3 / Z4 | s per zone med (p90): beach / jungle / ash / crater | Catch rate beach / jungle / ash / crater / lap≥2 |
|---|---|---|---|---|
| kid4 | easy | 100 % / 100 % / 98 % / 1 % | 68 (83) / 81 (100) / 93 (114) / 57 (57) | 0.64 / 0.60 / 0.54 / 0.50 / 1.00 |
| kid6 | easy | 100 % / 100 % / 100 % / 100 % | 47 (53) / 55 (64) / 57 (67) / 60 (72) | 0.93 / 0.90 / 0.88 / 0.87 / 0.88 |
| adult | easy | 100 % / 100 % / 100 % / 100 % | 44 (50) / 52 (58) / 51 (62) / 55 (62) | 0.99 / 0.98 / 0.97 / 0.96 / 0.97 |
| bot1.0 | easy | 100 % / 100 % / 100 % / 100 % | 47 (50) / 50 (58) / 51 (59) / 55 (62) | 1.00 / 1.00 / 1.00 / 0.99 / 1.00 |

## Combo twist

| Model | Diff | Best combo med | Runs reaching ×2 / ×3 / ×4 / ×5 | Coin points earned at ×≥2 | …share of total score |
|---|---|---|---|---|---|
| kid4 | easy | 9 | 100 % / 17 % / 1 % / 0 % | 58 % | 32 % |
| kid6 | easy | 25 | 100 % / 100 % / 71 % / 21 % | 92 % | 59 % |
| adult | easy | 60 | 100 % / 100 % / 100 % / 95 % | 98 % | 71 % |
| bot1.0 | easy | 121 | 100 % / 100 % / 100 % / 100 % | 99 % | 75 % |

480 runs in 55 s.
