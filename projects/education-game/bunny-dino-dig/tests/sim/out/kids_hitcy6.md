# hs_kids hitcy6 — 540 sessions (0 failed), config {"hitCY":0.6}, voice {} (158 s)

### A. Pace, help, stars

| model | age | n | done % | session min (p90) | chapter s [p10–p90] | round s (p90, max) | stuck | stars 3/2/1 % | wrong / round | 1st dig right % (assisted %) | ask → 1st dig s (p90) | tap → judged s (alone / tapping along, along %) | hint rounds % | assist rounds % | talk right % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| high | 3 | 60 | 100.0 | 4.9 (5.4) | 72.0 [60.4–85.6] | 13.8 (20.6, 44.9) | 0 | 71.0/27.6/1.5 | 0.31 | 72.6 (0.2) | 7.0 (11.0) | 1.50 / 1.20 (31.4) | 31.9 | 0.3 | 73.3 |
| high | 4 | 60 | 100.0 | 5.5 (5.9) | 81.2 [63.7–98.3] | 16.4 (26.6, 49.4) | 0 | 83.0/14.6/2.3 | 0.20 | 81.0 (0.3) | 6.3 (10.3) | 2.07 / 1.77 (74.8) | 31.1 | 1.0 | 87.9 |
| high | 5 | 60 | 100.0 | 6.2 (6.5) | 91.6 [82.5–101.9] | 19.0 (27.5, 45.0) | 0 | 80.0/16.4/3.6 | 0.24 | 83.6 (1.2) | 5.4 (7.8) | 2.07 / 1.76 (73.7) | 32.8 | 3.0 | 91.3 |
| typical | 3 | 60 | 100.0 | 4.5 (4.8) | 66.1 [56.7–78.5] | 12.2 (17.9, 38.6) | 0 | 70.3/26.8/2.9 | 0.33 | 72.0 (0.0) | 5.8 (8.2) | 1.50 / 1.19 (45.5) | 7.3 | 0.0 | 78.8 |
| typical | 4 | 60 | 100.0 | 5.1 (5.4) | 75.0 [59.7–92.6] | 14.5 (22.1, 38.2) | 0 | 84.7/14.1/1.1 | 0.17 | 83.3 (0.0) | 5.3 (6.6) | 2.07 / 1.75 (87.0) | 3.4 | 0.0 | 85.8 |
| typical | 5 | 60 | 100.0 | 5.8 (6.1) | 85.9 [77.6–97.1] | 17.2 (24.6, 41.9) | 0 | 82.2/14.8/3.0 | 0.21 | 85.4 (0.0) | 4.7 (5.2) | 2.07 / 1.74 (87.8) | 2.5 | 0.0 | 91.7 |
| tapper | 3 | 60 | 100.0 | 6.2 (6.6) | 91.0 [80.7–100.8] | 19.4 (24.5, 51.0) | 0 | 70.0/27.5/2.5 | 0.33 | 71.0 (46.2) | 11.7 (17.5) | 1.50 / 0.00 (0.0) | 89.0 | 71.1 | 77.9 |
| tapper | 4 | 60 | 100.0 | 6.4 (6.9) | 94.2 [83.6–106.1] | 22.9 (35.2, 62.4) | 0 | 66.6/27.0/6.3 | 0.40 | 61.4 (39.1) | 10.0 (15.8) | 2.07 / 1.79 (1.6) | 91.2 | 67.7 | 86.7 |
| tapper | 5 | 60 | 100.0 | 7.0 (7.5) | 102.6 [88.7–116.1] | 29.0 (41.0, 86.9) | 0 | 55.2/29.9/14.9 | 0.62 | 58.4 (41.2) | 9.1 (14.1) | 2.07 / 1.79 (1.5) | 93.0 | 80.4 | 90.0 |

### B. Speech (modelled main.js policy + voice.js queue)

| model | age | lines asked / min | spoken / min | talk time % | prompts started % | prompt cut % | ask → prompt starts s (p90) | same prompt text twice % | count words lost % | words lost % (/ min) | lost words by reason | cut lines by kind |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| high | 3 | 17.8 | 15.1 | 58.8 | 100.0 | 2.0 | 0.14 (0.47) | 2.6 | 0.0 | 11.8 (12.1) | cut 2019, interrupted 631, stale 38, dropped 9 | wrong<found 117, surprise<surpriseTap 99, hint<found 70, surprise<found 43, surpriseTap<found 42, found<surpriseTap 29 |
| high | 4 | 18.3 | 16.3 | 56.5 | 100.0 | 2.2 | 0.24 (0.87) | 1.6 | 1.0 | 9.4 (8.8) | cut 1589, interrupted 474, dropped 3, stale 7 | surprise<surpriseTap 98, wrong<found 55, hint<found 40, surprise<found 38, idle<found 33, surpriseTap<found 30 |
| high | 5 | 18.9 | 16.9 | 58.0 | 100.0 | 2.7 | 0.29 (1.03) | 0.2 | 0.8 | 9.5 (9.2) | interrupted 501, cut 2028, stale 50, dropped 18 | surprise<surpriseTap 90, hint<found 70, wrong<found 64, surprise<found 55, surpriseTap<found 44, found<surpriseTap 32 |
| typical | 3 | 18.2 | 15.4 | 59.1 | 100.0 | 2.1 | 0.15 (0.57) | 2.8 | 0.0 | 12.4 (12.9) | cut 2155, interrupted 448, dropped 14, stale 14 | wrong<found 179, surprise<surpriseTap 87, surprise<found 57, surpriseTap<found 50, found<surpriseTap 30, surprise<wrong 23 |
| typical | 4 | 18.8 | 16.8 | 56.2 | 100.0 | 2.8 | 0.23 (0.87) | 1.6 | 1.6 | 9.8 (9.1) | cut 1638, interrupted 243, dropped 5, stale 31 | surprise<surpriseTap 88, wrong<found 70, surprise<found 68, found<surpriseTap 48, surpriseTap<found 41, prompt<talkResult@second half 29 |
| typical | 5 | 19.3 | 17.3 | 58.5 | 100.0 | 3.9 | 0.33 (1.17) | 0.1 | 1.5 | 8.6 (8.4) | cut 1685, interrupted 344, dropped 16 | wrong<found 97, surprise<found 72, surprise<surpriseTap 62, found<surpriseTap 45, surpriseTap<found 44, prompt<talkResult@second half 30 |
| tapper | 3 | 20.0 | 15.3 | 63.9 | 99.7 | 4.5 | 0.28 (1.03) | 2.7 | 0.0 | 19.3 (23.6) | interrupted 3489, cut 3984, dropped 271, stale 147 | assist<found 314, idle<found 155, hint<found 122, found<prompt 53, wrong<found 51, hint<prompt 51 |
| tapper | 4 | 20.4 | 16.8 | 65.3 | 99.3 | 5.1 | 0.40 (1.27) | 1.4 | 2.9 | 14.7 (17.2) | cut 2984, stale 143, interrupted 2315, dropped 289 | assist<found 229, idle<found 76, hint<found 65, hint<prompt 60, wrong<found 38, prompt<talkResult@second half 36 |
| tapper | 5 | 20.8 | 16.8 | 67.2 | 99.9 | 5.5 | 0.48 (1.60) | 0.2 | 5.4 | 15.0 (18.3) | cut 3775, interrupted 2521, dropped 355, stale 136 | assist<found 370, hint<found 87, hint<prompt 68, wrong<found 63, wrong<prompt 40, idle<found 35 |

### C. Content variety + difficulty curve (per chapter: topic · chapter s · round s · wrong/round · mounds · steps · 3★ %)

| model | age | repeated set / session | same answer twice in a row % | target rank (left→right, n=3 mounds: 0/1/2 %) | ch1 | ch2 | ch3 | ch4 | bad lines |
|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 0.60 | 23.3 | 33.4 / 32.6 / 34.0 | colors · 68.1 · 12.7 · 0.35 · 2.4 · 1.00 · 68.8 | shapes · 67.4 · 12.6 · 0.39 · 2.4 · 1.13 · 65.8 | size · 61.9 · 11.2 · 0.23 · 2.0 · 1.00 · 77.1 | animals · 66.8 · 12.4 · 0.34 · 2.4 · 1.14 · 69.6 | 0 |
| typical | 4 | 0.68 | 12.1 | 32.2 / 34.0 / 33.8 | colors · 64.2 · 11.8 · 0.18 · 2.8 · 1.00 · 83.3 | shapes · 72.2 · 13.9 · 0.26 · 3.2 · 1.33 · 77.0 | count · 89.9 · 18.4 · 0.00 · 5.1 · 1.00 · 100.0 | animals · 73.5 · 14.1 · 0.22 · 3.1 · 1.34 · 78.8 | 0 |
| typical | 5 | 0.00 | 11.5 | 41.7 / 27.8 / 30.6 | shapes · 82.7 · 16.4 · 0.23 · 4.1 · 1.75 · 80.4 | count · 93.3 · 19.0 · 0.00 · 5.7 · 1.00 · 100.0 | letters · 84.3 · 16.8 · 0.33 · 3.8 · 1.75 · 71.7 | animals · 83.3 · 16.6 · 0.29 · 4.1 · 1.75 · 76.6 | 0 |
