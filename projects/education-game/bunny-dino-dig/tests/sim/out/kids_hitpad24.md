# hs_kids hitpad24 — 540 sessions (0 failed), config {"hitPad":24}, voice {} (216 s)

### A. Pace, help, stars

| model | age | n | done % | session min (p90) | chapter s [p10–p90] | round s (p90, max) | stuck | stars 3/2/1 % | wrong / round | 1st dig right % (assisted %) | ask → 1st dig s (p90) | tap → judged s (alone / tapping along, along %) | hint rounds % | assist rounds % | talk right % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| high | 3 | 60 | 100.0 | 5.0 (5.3) | 72.6 [61.1–86.5] | 14.0 (21.1, 46.0) | 0 | 71.8/26.5/1.7 | 0.30 | 73.4 (0.5) | 7.1 (11.5) | 1.50 / 1.21 (29.6) | 36.5 | 1.4 | 73.8 |
| high | 4 | 60 | 100.0 | 5.6 (5.9) | 81.9 [64.1–99.1] | 16.5 (27.2, 47.5) | 0 | 83.9/14.3/1.8 | 0.18 | 81.6 (0.9) | 6.6 (11.8) | 2.07 / 1.77 (71.0) | 32.3 | 1.6 | 89.2 |
| high | 5 | 60 | 100.0 | 6.3 (6.7) | 92.9 [83.4–103.1] | 19.5 (28.7, 46.2) | 0 | 78.3/16.2/5.4 | 0.28 | 81.8 (1.2) | 5.6 (8.3) | 2.07 / 1.77 (71.4) | 34.2 | 3.2 | 91.7 |
| typical | 3 | 60 | 100.0 | 4.5 (4.8) | 65.9 [56.7–77.1] | 12.2 (17.8, 38.6) | 0 | 69.6/28.4/2.0 | 0.32 | 71.4 (0.0) | 5.8 (8.2) | 1.50 / 1.20 (45.7) | 5.8 | 0.0 | 76.7 |
| typical | 4 | 60 | 100.0 | 5.1 (5.4) | 74.9 [59.7–92.2] | 14.5 (22.3, 44.4) | 0 | 84.2/14.2/1.6 | 0.17 | 82.8 (0.0) | 5.2 (6.6) | 2.07 / 1.74 (87.1) | 2.7 | 0.0 | 85.8 |
| typical | 5 | 60 | 100.0 | 5.9 (6.1) | 86.1 [77.8–97.2] | 17.2 (24.5, 41.9) | 0 | 81.1/14.9/4.0 | 0.23 | 84.9 (0.0) | 4.7 (5.2) | 2.07 / 1.74 (87.8) | 3.6 | 0.0 | 89.2 |
| tapper | 3 | 60 | 100.0 | 6.1 (6.5) | 89.5 [80.0–100.7] | 19.1 (24.7, 50.2) | 0 | 64.8/32.6/2.5 | 0.38 | 66.3 (37.7) | 11.0 (16.7) | 1.50 / 0.00 (0.0) | 86.4 | 67.4 | 75.8 |
| tapper | 4 | 60 | 100.0 | 6.4 (7.0) | 93.9 [83.1–107.3] | 22.7 (36.9, 57.1) | 0 | 63.2/28.6/8.2 | 0.46 | 57.0 (30.2) | 9.5 (16.0) | 2.07 / 1.78 (1.6) | 87.4 | 62.6 | 83.3 |
| tapper | 5 | 60 | 100.0 | 7.0 (7.4) | 103.2 [89.8–116.7] | 29.1 (41.9, 72.2) | 0 | 49.9/27.4/22.7 | 0.76 | 52.5 (33.1) | 8.6 (14.1) | 2.07 / 1.77 (2.3) | 93.0 | 78.3 | 90.4 |

### B. Speech (modelled main.js policy + voice.js queue)

| model | age | lines asked / min | spoken / min | talk time % | prompts started % | prompt cut % | ask → prompt starts s (p90) | same prompt text twice % | count words lost % | words lost % (/ min) | lost words by reason | cut lines by kind |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| high | 3 | 17.8 | 15.1 | 58.9 | 100.0 | 1.7 | 0.14 (0.60) | 2.3 | 0.0 | 11.7 (11.9) | cut 2046, interrupted 592, stale 52 | surprise<surpriseTap 118, wrong<found 93, hint<found 73, surpriseTap<found 48, surprise<found 41, found<surpriseTap 24 |
| high | 4 | 18.2 | 16.2 | 56.4 | 100.0 | 2.5 | 0.24 (0.87) | 1.4 | 1.4 | 9.4 (8.8) | cut 1629, interrupted 444, dropped 11, stale 9 | surprise<surpriseTap 111, hint<found 47, wrong<found 46, surpriseTap<found 39, idle<found 31, surprise<found 31 |
| high | 5 | 18.9 | 16.8 | 58.5 | 100.0 | 2.5 | 0.29 (1.03) | 0.2 | 0.7 | 9.9 (9.8) | interrupted 579, cut 2188, dropped 24, stale 30 | surprise<surpriseTap 90, wrong<found 86, surprise<found 59, hint<found 57, surpriseTap<found 43, already<found 38 |
| typical | 3 | 18.2 | 15.4 | 59.3 | 100.0 | 1.9 | 0.15 (0.63) | 2.2 | 0.0 | 12.5 (13.0) | cut 2201, interrupted 414, dropped 14, stale 17 | wrong<found 183, surprise<surpriseTap 84, surprise<found 70, surpriseTap<found 48, found<surpriseTap 40, surpriseTap<wrong 20 |
| typical | 4 | 18.8 | 16.8 | 56.7 | 100.0 | 3.1 | 0.25 (0.90) | 1.7 | 1.6 | 9.7 (9.1) | cut 1622, interrupted 277, dropped 4, stale 15 | surprise<surpriseTap 80, wrong<found 72, surprise<found 66, found<surpriseTap 44, surpriseTap<found 39, prompt<talkResult@second half 31 |
| typical | 5 | 19.3 | 17.3 | 58.5 | 100.0 | 3.5 | 0.31 (1.10) | 0.2 | 1.5 | 9.0 (8.8) | cut 1782, interrupted 400, dropped 16, stale 12 | wrong<found 115, surprise<found 75, surprise<surpriseTap 58, surpriseTap<found 46, found<surpriseTap 41, prompt<talkResult@second half 30 |
| tapper | 3 | 20.0 | 15.3 | 64.2 | 99.7 | 4.9 | 0.29 (1.03) | 1.8 | 0.0 | 19.2 (23.7) | interrupted 3422, cut 3930, dropped 297, stale 121 | assist<found 295, idle<found 134, hint<found 110, wrong<found 57, hint<prompt 50, found<prompt 47 |
| tapper | 4 | 20.7 | 16.8 | 66.1 | 99.4 | 6.0 | 0.43 (1.43) | 1.2 | 6.9 | 15.4 (18.5) | cut 3327, interrupted 2466, dropped 294, stale 149 | assist<found 218, hint<found 86, hint<prompt 71, idle<found 56, wrong<found 45, prompt<talkResult@second half 38 |
| tapper | 5 | 21.1 | 16.8 | 67.8 | 99.8 | 6.1 | 0.49 (1.67) | 0.3 | 4.0 | 16.0 (20.0) | cut 4175, interrupted 2736, dropped 375, stale 272 | assist<found 346, wrong<found 90, hint<found 85, hint<prompt 73, wrong<prompt 48, prompt<talkResult@second half 42 |

| model | age | same answer twice in a row % by topic | repeated set / session by topic | wrong lines whose 1st sentence was heard % |
|---|---|---|---|---|
| high | 3 | colors 14.5, shapes 18.4, size 49.4, animals 12.3 | colors 0.20, shapes 0.02, size 0.37, animals 0.02 | 92.3 |
| high | 4 | colors 15.6, shapes 11.7, animals 7.3 | colors 0.27, count 0.32, animals 0.03, shapes 0.02 | 93.6 |
| high | 5 | shapes 24.7, letters 2.4, animals 6.1 |  | 89.2 |
| typical | 3 | colors 15.0, shapes 18.7, size 48.9, animals 12.3 | colors 0.20, shapes 0.02, size 0.37, animals 0.02 | 90.0 |
| typical | 4 | colors 15.6, shapes 13.0, animals 9.2 | colors 0.27, count 0.37, animals 0.03, shapes 0.02 | 91.6 |
| typical | 5 | shapes 26.1, letters 2.8, animals 6.1 |  | 89.3 |
| tapper | 3 | colors 15.4, shapes 19.3, size 52.6, animals 7.7 | colors 0.17, size 0.33, animals 0.02, shapes 0.02 | 91.9 |
| tapper | 4 | colors 14.6, shapes 14.0, animals 11.5 | colors 0.23, count 0.02 | 93.1 |
| tapper | 5 | shapes 23.0, letters 2.5, animals 10.7 |  | 89.6 |

### C. Content variety + difficulty curve (per chapter: topic · chapter s · round s · wrong/round · mounds · steps · 3★ %)

| model | age | repeated set / session | same answer twice in a row % | target rank (left→right, n=3 mounds: 0/1/2 %) | ch1 | ch2 | ch3 | ch4 | bad lines |
|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 0.60 | 23.1 | 33.2 / 32.4 / 34.4 | colors · 68.1 · 12.7 · 0.37 · 2.4 · 1.00 · 67.1 | shapes · 66.9 · 12.4 · 0.38 · 2.4 · 1.13 · 65.4 | size · 62.1 · 11.3 · 0.25 · 2.0 · 1.00 · 74.6 | animals · 66.5 · 12.3 · 0.30 · 2.4 · 1.14 · 71.3 | 0 |
| typical | 4 | 0.68 | 12.2 | 31.5 / 33.6 / 34.8 | colors · 64.3 · 11.8 · 0.19 · 2.8 · 1.00 · 82.9 | shapes · 72.5 · 13.9 · 0.28 · 3.2 · 1.34 · 75.8 | count · 89.6 · 18.4 · 0.00 · 5.1 · 1.00 · 100.0 | animals · 73.1 · 14.0 · 0.23 · 3.1 · 1.35 · 78.3 | 0 |
| typical | 5 | 0.00 | 11.7 | 41.7 / 27.8 / 30.6 | shapes · 82.9 · 16.4 · 0.24 · 4.1 · 1.75 · 79.2 | count · 93.3 · 19.0 · 0.00 · 5.7 · 1.00 · 100.0 | letters · 84.4 · 16.8 · 0.36 · 3.8 · 1.75 · 70.4 | animals · 83.9 · 16.6 · 0.33 · 4.1 · 1.75 · 75.0 | 0 |
