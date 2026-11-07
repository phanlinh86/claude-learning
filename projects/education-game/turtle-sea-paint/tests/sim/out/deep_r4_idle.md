# hs_deep r4_idle — 1200 sessions (0 failed), config {"idleHintFrom":1} content {} (84 s)

### A. Durations and flow

| model | age | n | done % | stuck states | session min mean (p90, max) | chapter s mean [p10–p90] | chapters in 60–100 s % | round s (p90) | rounds > 120 s (max) | steps with a > 30 s no-progress gap % (n, max gap s) | Talk auto-answered % |
|---|---|---|---|---|---|---|---|---|---|---|---|
| slow3 | 3 | 200 | 100.0 | 0 | 7.0 (7.6, 8.8) | 103.0 [86.3–125.3] | 54.1 | 27.5 (44.2) | 0 (105.2) | 4.3 (167, 90.6) | 0.0 |
| slow3 | 4 | 200 | 100.0 | 0 | 7.2 (8.0, 9.6) | 106.3 [87.5–129.9] | 44.5 | 29.8 (49.8) | 1 (125.8) | 4.7 (164, 66.1) | 0.0 |
| slow3 | 5 | 200 | 100.0 | 0 | 8.3 (9.2, 10.6) | 123.0 [91.9–164.9] | 22.9 | 36.5 (62.0) | 6 (143.1) | 5.6 (224, 85.7) | 0.0 |
| typical | 3 | 200 | 100.0 | 0 | 5.8 (6.1, 6.6) | 84.6 [75.5–95.3] | 95.9 | 19.4 (27.5) | 0 (52.8) | 0.0 (1, 33.1) | 0.0 |
| typical | 4 | 200 | 100.0 | 0 | 5.8 (6.2, 6.5) | 85.1 [70.1–97.6] | 93.9 | 19.6 (30.4) | 0 (59.6) | 0.0 (1, 32.2) | 0.0 |
| typical | 5 | 200 | 100.0 | 0 | 5.7 (6.1, 6.6) | 84.1 [71.0–97.4] | 93.8 | 18.7 (26.9) | 0 (47.0) | 0.0 (0, 18.0) | 0.0 |

### B. Feedback, help and stars (per round)

| model | age | stars 3/2/1 % | wrong | needPaint | notThis | already | rounds with a hint % | rounds with an assist % | idle nudges |
|---|---|---|---|---|---|---|---|---|---|
| slow3 | 3 | 60.1/25.0/14.8 | 0.62 | 0.07 | 0.36 | 0.00 | 46.6 | 0.6 | 0.43 |
| slow3 | 4 | 62.7/20.0/17.3 | 0.65 | 0.07 | 0.52 | 0.05 | 50.4 | 0.5 | 0.48 |
| slow3 | 5 | 50.2/18.8/31.0 | 1.15 | 0.11 | 0.48 | 0.07 | 58.8 | 0.2 | 0.59 |
| typical | 3 | 69.4/22.5/8.1 | 0.40 | 0.04 | 0.23 | 0.00 | 18.4 | 0.0 | 0.06 |
| typical | 4 | 77.1/16.7/6.2 | 0.30 | 0.04 | 0.25 | 0.03 | 14.4 | 0.0 | 0.05 |
| typical | 5 | 74.4/18.6/7.0 | 0.35 | 0.02 | 0.14 | 0.04 | 7.9 | 0.0 | 0.02 |

### C. Surprises and variety (per session)

| model | age | surprise rounds % | fishy shown / tapped | pearl shown / tapped | templates distinct (of 16) | same template back-to-back | template reused in session % | identical prompt lines repeated | same colour asked twice in a row % |
|---|---|---|---|---|---|---|---|---|---|
| slow3 | 3 | 30.2 | 2.50 / 1.39 | 2.00 / 1.43 | 9.1 | 0.00 | 30.8 | 0.56 | 13.5 |
| slow3 | 4 | 31.5 | 2.48 / 1.39 | 2.00 / 1.31 | 12.3 | 0.00 | 2.7 | 0.56 | 12.0 |
| slow3 | 5 | 32.8 | 2.73 / 1.49 | 1.89 / 1.32 | 12.1 | 0.00 | 0.9 | 0.45 | 0.0 |
| typical | 3 | 26.1 | 2.25 / 1.45 | 2.00 / 1.31 | 9.8 | 0.00 | 36.1 | 1.36 | 9.3 |
| typical | 4 | 26.1 | 2.29 / 1.40 | 2.00 / 1.25 | 13.5 | 0.00 | 11.8 | 1.50 | 8.3 |
| typical | 5 | 25.3 | 2.42 / 1.45 | 1.89 / 1.13 | 13.2 | 0.00 | 16.7 | 1.14 | 0.0 |

### D. First chapter

| model | age | topic | chapter s | round s | steps / round | shells | wrong / round | 3★ % |
|---|---|---|---|---|---|---|---|---|
| slow3 | 3 | colors | 119.7 | 35.9 | 1.21 | 2.0 | 0.73 | 53.8 |
| slow3 | 4 | colors | 122.9 | 36.9 | 1.30 | 3.0 | 0.86 | 50.0 |
| slow3 | 5 | shapes | 157.3 | 48.5 | 1.78 | 4.0 | 2.14 | 21.0 |
| typical | 3 | colors | 92.0 | 24.4 | 1.52 | 2.0 | 0.55 | 60.1 |
| typical | 4 | colors | 93.2 | 24.3 | 1.78 | 3.0 | 0.39 | 70.1 |
| typical | 5 | shapes | 94.1 | 21.9 | 2.07 | 4.0 | 0.67 | 53.4 |
