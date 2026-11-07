# hs_deep a5 — 900 sessions (0 failed), config {"assistAfterOld":5} content {} (43 s)

### A. Durations and flow

| model | age | n | done % | stuck states | session min mean (p90, max) | chapter s mean [p10–p90] | chapters in 60–100 s % | round s (p90) | rounds > 120 s (max) | steps with a > 30 s no-progress gap % (n, max gap s) | Talk auto-answered % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 4 | 150 | 100.0 | 0 | 5.8 (6.2, 6.8) | 85.4 [70.7–97.6] | 93.8 | 19.7 (30.4) | 0 (59.6) | 0.0 (0, 23.6) | 0.0 |
| typical | 5 | 150 | 100.0 | 0 | 5.7 (6.1, 6.6) | 84.1 [71.3–97.5] | 93.5 | 18.7 (26.8) | 0 (47.0) | 0.0 (0, 18.0) | 0.0 |
| slow3 | 4 | 150 | 100.0 | 0 | 7.3 (8.0, 9.1) | 107.2 [87.1–132.6] | 41.2 | 30.0 (51.4) | 1 (151.3) | 5.4 (142, 62.5) | 0.0 |
| slow3 | 5 | 150 | 100.0 | 0 | 8.3 (9.2, 10.5) | 122.9 [92.1–165.2] | 22.5 | 36.3 (63.2) | 4 (153.1) | 5.0 (150, 59.8) | 0.0 |
| tapper | 4 | 150 | 100.0 | 0 | 7.6 (8.5, 9.7) | 112.5 [90.8–141.2] | 28.8 | 34.0 (58.7) | 1 (120.0) | 0.5 (11, 33.9) | 0.0 |
| tapper | 5 | 150 | 100.0 | 0 | 8.6 (9.5, 10.0) | 127.5 [97.9–162.7] | 14.2 | 39.1 (63.9) | 6 (156.9) | 0.2 (7, 38.6) | 0.0 |

### B. Feedback, help and stars (per round)

| model | age | stars 3/2/1 % | wrong | needPaint | notThis | already | rounds with a hint % | rounds with an assist % | idle nudges |
|---|---|---|---|---|---|---|---|---|---|
| typical | 4 | 77.3/16.5/6.2 | 0.30 | 0.04 | 0.25 | 0.03 | 9.9 | 0.0 | 0.05 |
| typical | 5 | 75.2/18.3/6.6 | 0.33 | 0.02 | 0.14 | 0.04 | 6.2 | 0.0 | 0.02 |
| slow3 | 4 | 64.3/18.5/17.2 | 0.66 | 0.07 | 0.58 | 0.06 | 31.9 | 0.9 | 0.49 |
| slow3 | 5 | 49.3/19.8/30.9 | 1.17 | 0.10 | 0.50 | 0.08 | 40.1 | 2.2 | 0.57 |
| tapper | 4 | 58.6/23.8/17.6 | 0.70 | 0.38 | 2.08 | 0.32 | 93.8 | 76.2 | 0.55 |
| tapper | 5 | 42.6/21.2/36.2 | 1.22 | 0.74 | 2.18 | 0.52 | 93.9 | 84.1 | 0.32 |

### C. Surprises and variety (per session)

| model | age | surprise rounds % | fishy shown / tapped | pearl shown / tapped | templates distinct (of 16) | same template back-to-back | template reused in session % | identical prompt lines repeated | same colour asked twice in a row % |
|---|---|---|---|---|---|---|---|---|---|
| typical | 4 | 26.1 | 2.28 / 1.40 | 2.00 / 1.25 | 13.5 | 0.00 | 11.9 | 1.49 | 9.1 |
| typical | 5 | 25.3 | 2.39 / 1.46 | 1.89 / 1.18 | 13.2 | 0.00 | 16.4 | 1.05 | 0.0 |
| slow3 | 4 | 31.6 | 2.48 / 1.37 | 2.00 / 1.37 | 12.3 | 0.00 | 2.7 | 0.44 | 13.4 |
| slow3 | 5 | 32.7 | 2.64 / 1.55 | 1.89 / 1.33 | 12.1 | 0.00 | 1.1 | 0.43 | 0.0 |
| tapper | 4 | 33.1 | 3.61 / 0.25 | 2.00 / 0.33 | 12.0 | 0.00 | 0.5 | 0.37 | 14.6 |
| tapper | 5 | 33.2 | 4.01 / 0.26 | 1.89 / 0.40 | 12.0 | 0.00 | 0.5 | 0.44 | 0.0 |

### D. First chapter

| model | age | topic | chapter s | round s | steps / round | shells | wrong / round | 3★ % |
|---|---|---|---|---|---|---|---|---|
| typical | 4 | colors | 92.9 | 24.3 | 1.77 | 3.0 | 0.39 | 70.5 |
| typical | 5 | shapes | 94.0 | 21.8 | 2.07 | 4.0 | 0.62 | 54.4 |
| slow3 | 4 | colors | 122.0 | 36.6 | 1.28 | 3.0 | 0.84 | 54.8 |
| slow3 | 5 | shapes | 157.9 | 48.6 | 1.78 | 4.0 | 2.16 | 20.9 |
| tapper | 4 | colors | 120.7 | 36.9 | 1.28 | 3.0 | 1.34 | 31.1 |
| tapper | 5 | shapes | 147.2 | 45.8 | 1.80 | 4.0 | 2.10 | 15.1 |
