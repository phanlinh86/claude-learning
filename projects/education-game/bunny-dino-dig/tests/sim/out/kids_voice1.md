# hs_kids voice1 — 900 sessions (0 failed), config {}, patch '', voice {"praiseIfQuiet":1,"noRepeatWhileSpeaking":1} (65 s)

### A. Pace, help, stars

| model | age | n | done % | session min (p90) | chapter s [p10–p90] | round s (p90, max) | stuck | stars 3/2/1 % | wrong / round | 1st tap digs it % · 1st tap empty sand / soft % | 1st dig right % (assisted %) | ask → 1st dig s (p90) | tap → judged s (alone / tapping along, along %) | hint rounds % | assist rounds % | talk right % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 100 | 100.0 | 4.5 (4.8) | 65.8 [56.7–77.1] | 12.2 (17.8, 38.6) | 0 | 70.3/27.5/2.3 | 0.32 | 62.2 · 9.8 | 72.0 (0.0) | 5.8 (7.9) | 1.50 / 1.20 (44.7) | 5.6 | 0.0 | 78.0 |
| typical | 4 | 100 | 100.0 | 5.1 (5.4) | 74.8 [59.5–91.9] | 14.5 (21.8, 44.4) | 0 | 84.9/14.1/1.0 | 0.16 | 75.0 · 6.2 | 83.8 (0.0) | 5.2 (6.5) | 2.07 / 1.74 (87.6) | 2.1 | 0.0 | 85.8 |
| typical | 6 | 100 | 100.0 | 5.7 (6.0) | 84.1 [75.8–95.3] | 16.8 (24.4, 39.3) | 0 | 87.3/11.2/1.5 | 0.14 | 82.1 · 4.6 | 89.9 (0.0) | 4.5 (5.1) | 2.07 / 1.74 (86.5) | 1.6 | 0.0 | 95.8 |
| slow3 | 3 | 100 | 100.0 | 6.0 (6.5) | 87.6 [74.8–100.4] | 18.2 (28.7, 53.2) | 0 | 59.0/36.4/4.6 | 0.46 | 48.4 · 15.6 | 60.7 (0.0) | 9.5 (15.9) | 1.50 / 1.23 (13.3) | 11.5 | 0.0 | 60.5 |
| slow3 | 4 | 100 | 100.0 | 6.6 (7.2) | 97.6 [82.9–116.9] | 23.1 (38.8, 80.0) | 0 | 67.7/23.1/9.2 | 0.42 | 49.8 · 14.9 | 62.8 (0.0) | 9.8 (16.4) | 2.07 / 1.82 (34.1) | 14.5 | 0.0 | 59.0 |
| slow3 | 6 | 100 | 100.0 | 7.7 (8.5) | 113.3 [92.6–136.8] | 31.5 (52.2, 104.3) | 0 | 57.9/19.2/22.9 | 0.72 | 44.8 · 15.3 | 59.8 (0.0) | 9.8 (16.5) | 2.07 / 1.82 (33.0) | 25.4 | 0.1 | 58.5 |
| shelfBun | 3 | 100 | 100.0 | 5.3 (5.9) | 77.8 [64.0–91.5] | 15.4 (24.3, 68.6) | 0 | 68.8/28.6/2.5 | 0.34 | 29.6 · 7.6 | 70.4 (0.0) | 8.1 (14.1) | 1.50 / 1.20 (43.9) | 5.1 | 0.0 | 75.0 |
| shelfBun | 4 | 100 | 100.0 | 5.7 (6.2) | 83.8 [66.2–100.0] | 17.7 (30.4, 58.1) | 0 | 84.4/13.3/2.4 | 0.18 | 38.1 · 4.8 | 82.9 (0.0) | 7.3 (12.8) | 2.07 / 1.74 (87.8) | 3.7 | 0.0 | 86.5 |
| shelfBun | 6 | 100 | 100.0 | 6.4 (6.8) | 93.7 [82.8–106.8] | 19.9 (29.8, 59.1) | 0 | 88.0/10.6/1.4 | 0.13 | 40.8 · 3.9 | 90.7 (0.0) | 6.0 (9.5) | 2.07 / 1.74 (86.5) | 1.7 | 0.0 | 95.0 |

### B. Speech (modelled main.js policy + voice.js queue)

| model | age | lines asked / min | spoken / min | talk time % | prompts started % | prompt cut % | ask → prompt starts s (p90) | same prompt text twice % | count words lost % | words lost % (/ min) | lost words by reason | cut lines by kind |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 17.7 | 14.8 | 58.6 | 100.0 | 1.8 | 0.15 (0.63) | 2.7 | 0.0 | 12.7 (13.1) | cut 3653, interrupted 787, dropped 13, stale 17 | wrong<found 296, surprise<surpriseTap 129, surprise<found 98, surpriseTap<found 81, found<surpriseTap 63, surprise<wrong 45 |
| typical | 4 | 18.6 | 16.6 | 56.5 | 100.0 | 2.8 | 0.25 (0.87) | 1.7 | 1.7 | 9.7 (9.1) | cut 2720, interrupted 439, dropped 3 | surprise<surpriseTap 144, wrong<found 122, surprise<found 95, found<surpriseTap 66, surpriseTap<found 65, prompt<talkResult@second half 37 |
| typical | 6 | 19.2 | 17.2 | 64.3 | 100.0 | 6.8 | 0.30 (0.97) | 0.4 | 1.0 | 7.5 (8.1) | cut 2697, stale 22, interrupted 460, dropped 19 | wrong<found 139, surprise<found 118, prompt<found@second half 104, surprise<surpriseTap 94, prompt<talkResult@second half 82, found<surpriseTap 74 |
| slow3 | 3 | 13.9 | 12.3 | 50.1 | 100.0 | 0.0 | 0.13 (0.47) | 2.8 | 0.0 | 8.4 (7.2) | cut 2490, interrupted 308, stale 21 | surprise<surpriseTap 224, wrong<found 80, idle<found 71, hint<found 53, surpriseTap<found 43, surpriseTap<wrong 31 |
| slow3 | 4 | 13.8 | 12.5 | 47.1 | 100.0 | 0.3 | 0.23 (0.87) | 1.4 | 0.7 | 7.4 (5.8) | cut 1989, interrupted 286, stale 86, dropped 4 | surprise<surpriseTap 233, hint<found 66, wrong<found 45, idle<found 34, surpriseTap<found 28, idle<wrong 21 |
| slow3 | 6 | 13.3 | 12.1 | 51.4 | 100.0 | 1.4 | 0.26 (0.93) | 0.2 | 0.1 | 6.3 (5.5) | cut 2677, interrupted 100, dropped 1, stale 10 | surprise<surpriseTap 221, hint<found 139, idle<found 70, idle<wrong 54, surpriseTap<found 24, hint<wrong 24 |
| shelfBun | 3 | 16.2 | 13.8 | 54.8 | 100.0 | 3.2 | 0.13 (0.47) | 2.3 | 0.0 | 11.2 (10.8) | cut 3652, interrupted 612 | wrong<found 185, surprise<surpriseTap 160, wrong<prompt 89, surpriseTap<found 63, surprise<found 61, prompt<found@second half 56 |
| shelfBun | 4 | 17.0 | 15.2 | 53.4 | 100.0 | 2.6 | 0.20 (0.83) | 1.4 | 1.7 | 9.3 (8.3) | cut 2855, interrupted 423, dropped 2 | surprise<surpriseTap 164, wrong<found 77, surprise<found 70, surpriseTap<found 63, wrong<prompt 51, prompt<talkResult@second half 47 |
| shelfBun | 6 | 18.0 | 16.0 | 62.8 | 100.0 | 9.2 | 0.24 (0.80) | 0.3 | 1.6 | 7.9 (8.6) | cut 3561, interrupted 371, dropped 22, stale 26 | prompt<found@second half 235, surprise<surpriseTap 111, surprise<found 98, wrong<found 86, prompt<talkResult@second half 84, surpriseTap<found 57 |

| model | age | same answer twice in a row % by topic | repeated set / session by topic | wrong lines whose 1st sentence was heard % |
|---|---|---|---|---|
| typical | 3 | colors 17.3, shapes 19.5, size 53.3, animals 12.4 | colors 0.19, shapes 0.02, size 0.36, animals 0.01 | 91.2 |
| typical | 4 | colors 16.7, shapes 11.4, animals 7.8 | colors 0.20, count 0.36, animals 0.02, shapes 0.01 | 90.3 |
| typical | 6 | lower 2.2, initial 9.3, add 3.8 | initial 0.10 | 93.0 |
| slow3 | 3 | colors 17.4, shapes 19.5, size 54.6, animals 10.8 | colors 0.16, shapes 0.03, size 0.40, animals 0.04 | 98.1 |
| slow3 | 4 | colors 16.8, shapes 11.8, animals 9.0 | colors 0.14, count 0.01 | 99.0 |
| slow3 | 6 | lower 2.2, initial 6.3, add 6.3 | initial 0.01 | 99.5 |
| shelfBun | 3 | colors 17.2, shapes 18.9, size 54.0, animals 13.9 | colors 0.19, shapes 0.02, size 0.36, animals 0.01 | 86.5 |
| shelfBun | 4 | colors 16.8, shapes 10.0, animals 9.0 | colors 0.19, count 0.14, shapes 0.01, animals 0.01 | 85.9 |
| shelfBun | 6 | lower 2.0, initial 8.7, add 4.2 | initial 0.10 | 81.7 |

### C. Content variety + difficulty curve (per chapter: topic · chapter s · round s · wrong/round · mounds · steps · 3★ %)

| model | age | repeated set / session | same answer twice in a row % | target rank (left→right, n=3 mounds: 0/1/2 %) | ch1 | ch2 | ch3 | ch4 | bad lines |
|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 0.58 | 24.9 | 32.9 / 32.3 / 34.8 | colors · 67.6 · 12.6 · 0.34 · 2.4 · 1.00 · 68.5 | shapes · 66.6 · 12.4 · 0.38 · 2.4 · 1.13 · 66.5 | size · 62.2 · 11.3 · 0.26 · 2.0 · 1.00 · 74.3 | animals · 66.9 · 12.5 · 0.29 · 2.4 · 1.14 · 71.8 | 0 |
| typical | 4 | 0.59 | 11.4 | 30.9 / 34.6 / 34.5 | colors · 64.4 · 11.8 · 0.19 · 2.8 · 1.00 · 81.8 | shapes · 72.7 · 13.9 · 0.24 · 3.2 · 1.35 · 77.5 | count · 89.1 · 18.2 · 0.00 · 5.1 · 1.00 · 100.0 | animals · 73.2 · 14.0 · 0.21 · 3.1 · 1.38 · 80.5 | 0 |
| typical | 6 | 0.10 | 5.1 | 33.0 / 31.0 / 36.0 | lower · 81.7 · 16.1 · 0.18 · 4.5 · 1.75 · 83.5 | initial · 81.0 · 16.0 · 0.20 · 4.6 · 1.75 · 81.8 | add · 80.8 · 15.9 · 0.19 · 4.5 · 1.75 · 84.0 | count · 93.0 · 18.9 · 0.00 · 5.9 · 1.00 · 100.0 | 0 |
