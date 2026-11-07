# hs_deep ctl65 — 900 sessions (0 failed), config {"chapterTimeLimit":65,"assistAfterOld":5} content {} (42 s)

### A. Durations and flow

| model | age | n | done % | stuck states | session min mean (p90, max) | chapter s mean [p10–p90] | chapters in 60–100 s % | round s (p90) | rounds > 120 s (max) | steps with a > 30 s no-progress gap % (n, max gap s) | Talk auto-answered % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 4 | 150 | 100.0 | 0 | 5.6 (5.9, 6.5) | 81.8 [69.5–94.2] | 97.3 | 19.8 (30.8) | 0 (59.6) | 0.0 (0, 26.4) | 0.0 |
| typical | 5 | 150 | 100.0 | 0 | 5.5 (5.8, 6.1) | 81.0 [71.6–92.7] | 98.2 | 18.6 (26.9) | 0 (47.0) | 0.0 (0, 18.0) | 0.0 |
| slow3 | 4 | 150 | 100.0 | 0 | 7.0 (7.7, 9.1) | 103.2 [81.4–130.7] | 51.5 | 30.2 (52.3) | 1 (151.3) | 5.3 (132, 62.5) | 0.0 |
| slow3 | 5 | 150 | 100.0 | 0 | 8.2 (9.1, 10.5) | 121.0 [87.9–165.2] | 27.2 | 36.2 (63.3) | 4 (153.1) | 5.0 (146, 59.8) | 0.0 |
| tapper | 4 | 150 | 100.0 | 0 | 7.6 (8.5, 9.7) | 112.0 [89.7–141.2] | 30.2 | 34.0 (58.9) | 1 (120.0) | 0.5 (11, 33.9) | 0.0 |
| tapper | 5 | 150 | 100.0 | 0 | 8.6 (9.5, 10.0) | 127.1 [96.6–162.7] | 15.3 | 39.1 (64.3) | 6 (156.9) | 0.2 (7, 38.6) | 0.0 |

### B. Feedback, help and stars (per round)

| model | age | stars 3/2/1 % | wrong | needPaint | notThis | already | rounds with a hint % | rounds with an assist % | idle nudges |
|---|---|---|---|---|---|---|---|---|---|
| typical | 4 | 77.8/16.1/6.1 | 0.30 | 0.04 | 0.26 | 0.03 | 9.7 | 0.0 | 0.06 |
| typical | 5 | 76.1/17.6/6.3 | 0.31 | 0.02 | 0.14 | 0.05 | 6.1 | 0.0 | 0.02 |
| slow3 | 4 | 64.8/18.4/16.8 | 0.65 | 0.07 | 0.58 | 0.06 | 31.6 | 0.8 | 0.49 |
| slow3 | 5 | 48.8/19.7/31.5 | 1.18 | 0.10 | 0.49 | 0.08 | 40.4 | 2.3 | 0.57 |
| tapper | 4 | 58.6/23.9/17.5 | 0.70 | 0.38 | 2.08 | 0.32 | 93.6 | 76.3 | 0.55 |
| tapper | 5 | 42.8/21.2/35.9 | 1.21 | 0.74 | 2.18 | 0.53 | 93.8 | 83.8 | 0.32 |

### C. Surprises and variety (per session)

| model | age | surprise rounds % | fishy shown / tapped | pearl shown / tapped | templates distinct (of 16) | same template back-to-back | template reused in session % | identical prompt lines repeated | same colour asked twice in a row % |
|---|---|---|---|---|---|---|---|---|---|
| typical | 4 | 27.6 | 2.27 / 1.39 | 2.00 / 1.30 | 13.1 | 0.00 | 9.8 | 1.26 | 9.1 |
| typical | 5 | 26.3 | 2.39 / 1.51 | 1.89 / 1.10 | 13.0 | 0.00 | 14.7 | 0.88 | 0.0 |
| slow3 | 4 | 33.0 | 2.49 / 1.36 | 2.00 / 1.38 | 12.1 | 0.00 | 0.4 | 0.39 | 13.2 |
| slow3 | 5 | 33.2 | 2.61 / 1.57 | 1.89 / 1.33 | 12.0 | 0.00 | 0.3 | 0.46 | 0.0 |
| tapper | 4 | 33.3 | 3.61 / 0.25 | 2.00 / 0.33 | 12.0 | 0.00 | 0.0 | 0.37 | 14.6 |
| tapper | 5 | 33.3 | 4.01 / 0.27 | 1.89 / 0.39 | 12.0 | 0.00 | 0.0 | 0.45 | 0.0 |

### D. First chapter

| model | age | topic | chapter s | round s | steps / round | shells | wrong / round | 3★ % |
|---|---|---|---|---|---|---|---|---|
| typical | 4 | colors | 85.8 | 25.0 | 1.83 | 3.0 | 0.41 | 69.3 |
| typical | 5 | shapes | 83.9 | 21.7 | 2.05 | 4.0 | 0.60 | 56.4 |
| slow3 | 4 | colors | 121.9 | 36.7 | 1.28 | 3.0 | 0.84 | 54.7 |
| slow3 | 5 | shapes | 157.9 | 48.6 | 1.78 | 4.0 | 2.16 | 20.9 |
| tapper | 4 | colors | 120.7 | 36.9 | 1.28 | 3.0 | 1.34 | 31.1 |
| tapper | 5 | shapes | 147.2 | 45.8 | 1.80 | 4.0 | 2.10 | 15.1 |
