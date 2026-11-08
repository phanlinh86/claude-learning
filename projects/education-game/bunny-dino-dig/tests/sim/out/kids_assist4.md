# hs_kids assist4 — 1000 sessions (0 failed), config {"assistAfter":4}, patch '', voice {} (62 s)

### A. Pace, help, stars

| model | age | n | done % | session min (p90) | chapter s [p10–p90] | round s (p90, max) | stuck | stars 3/2/1 % | wrong / round | 1st tap digs it % · 1st tap empty sand / soft % | 1st dig right % (assisted %) | ask → 1st dig s (p90) | tap → judged s (alone / tapping along, along %) | hint rounds % | assist rounds % | talk right % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sandOnly | 3 | 100 | 100.0 | 6.2 (6.5) | 90.5 [82.2–99.3] | 19.5 (26.5, 51.4) | 0 | 97.1/2.9/0.0 | 0.03 | 0.5 · 98.9 | 97.2 (95.1) | 14.0 (19.5) | 1.50 / 1.20 (43.9) | 98.9 | 98.0 | 80.5 |
| sandOnly | 4 | 100 | 100.0 | 6.7 (7.1) | 98.7 [82.1–127.6] | 23.3 (39.3, 82.0) | 0 | 96.8/3.2/0.1 | 0.03 | 0.6 · 98.3 | 96.4 (95.0) | 12.2 (17.5) | 2.07 / 1.75 (87.8) | 99.4 | 98.9 | 87.8 |
| tapper | 3 | 100 | 100.0 | 5.8 (6.2) | 85.0 [75.7–95.8] | 17.2 (21.5, 44.2) | 0 | 75.6/23.3/1.1 | 0.26 | 4.3 · 80.7 | 76.8 (59.7) | 10.2 (14.4) | 1.50 / 0.00 (0.0) | 90.1 | 81.7 | 76.3 |
| tapper | 4 | 100 | 100.0 | 6.2 (6.5) | 91.2 [80.7–103.3] | 20.5 (33.7, 58.0) | 0 | 73.3/23.6/3.0 | 0.30 | 4.1 · 77.4 | 70.2 (52.0) | 8.8 (12.9) | 2.07 / 1.79 (2.1) | 89.7 | 77.8 | 87.3 |
| spammer | 3 | 100 | 100.0 | 4.0 (4.2) | 58.5 [51.6–66.3] | 10.4 (12.9, 22.0) | 0 | 43.9/46.9/9.2 | 0.65 | 33.8 · 20.9 | 46.2 (0.4) | 3.8 (5.6) | 1.50 / 1.18 (49.4) | 32.9 | 6.6 | 74.8 |
| spammer | 4 | 100 | 100.0 | 4.7 (5.0) | 69.0 [59.1–78.4] | 13.0 (19.1, 28.0) | 0 | 48.1/28.3/23.6 | 0.80 | 27.5 · 18.3 | 40.3 (0.2) | 3.5 (5.0) | 2.07 / 1.71 (60.5) | 40.1 | 12.3 | 88.5 |
| typical | 3 | 100 | 100.0 | 4.5 (4.8) | 65.8 [56.7–77.1] | 12.2 (17.8, 38.6) | 0 | 70.3/27.5/2.3 | 0.32 | 62.2 · 9.8 | 72.0 (0.0) | 5.8 (7.9) | 1.50 / 1.20 (44.7) | 5.6 | 0.0 | 78.0 |
| typical | 4 | 100 | 100.0 | 5.1 (5.4) | 74.8 [59.5–91.9] | 14.5 (21.8, 44.4) | 0 | 84.9/14.1/1.0 | 0.16 | 75.0 · 6.2 | 83.8 (0.0) | 5.2 (6.5) | 2.07 / 1.74 (87.6) | 2.1 | 0.0 | 85.8 |
| slow3 | 3 | 100 | 100.0 | 6.0 (6.5) | 87.6 [74.8–100.4] | 18.2 (28.7, 53.2) | 0 | 59.0/36.4/4.6 | 0.46 | 48.4 · 15.6 | 60.7 (0.1) | 9.5 (15.9) | 1.50 / 1.23 (13.3) | 11.5 | 0.2 | 60.5 |
| slow3 | 4 | 100 | 100.0 | 6.6 (7.2) | 97.6 [82.9–116.9] | 23.1 (38.8, 80.0) | 0 | 67.7/23.1/9.2 | 0.42 | 49.8 · 14.9 | 62.8 (0.0) | 9.8 (16.4) | 2.07 / 1.82 (34.1) | 14.5 | 0.4 | 59.0 |

### B. Speech (modelled main.js policy + voice.js queue)

| model | age | lines asked / min | spoken / min | talk time % | prompts started % | prompt cut % | ask → prompt starts s (p90) | same prompt text twice % | count words lost % | words lost % (/ min) | lost words by reason | cut lines by kind |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sandOnly | 3 | 18.2 | 14.1 | 59.7 | 100.0 | 1.3 | 0.15 (0.63) | 3.1 | 0.0 | 16.0 (17.4) | cut 6378, interrupted 2813, stale 22, dropped 8 | assist<found 1225, surprise<surpriseTap 231, idle<found 191, hint<found 92, hint<surpriseTap 41, prompt<talkResult@second half 26 |
| sandOnly | 4 | 19.3 | 16.1 | 63.6 | 99.9 | 2.8 | 0.30 (1.03) | 1.9 | 6.0 | 11.2 (12.2) | cut 4208, interrupted 2181, dropped 266, stale 53 | assist<found 925, surprise<surpriseTap 206, idle<found 110, hint<found 65, hint<surpriseTap 58, prompt<talkResult@second half 41 |
| tapper | 3 | 20.1 | 15.6 | 64.7 | 99.6 | 4.3 | 0.31 (1.17) | 2.6 | 0.0 | 16.3 (19.4) | cut 6148, interrupted 3304, stale 138, dropped 172 | assist<found 993, hint<found 107, wrong<found 100, idle<found 92, found<prompt 69, hint<prompt 68 |
| tapper | 4 | 20.6 | 17.2 | 66.1 | 99.5 | 5.9 | 0.38 (1.27) | 1.3 | 5.2 | 12.3 (14.1) | cut 4463, interrupted 2357, dropped 300, stale 183 | assist<found 628, hint<prompt 82, wrong<found 78, found<prompt 67, prompt<talkResult@second half 64, prompt<found@first half 56 |
| spammer | 3 | 26.9 | 19.0 | 80.3 | 97.0 | 19.3 | 1.16 (2.67) | 2.6 | 0.0 | 27.7 (47.6) | cut 8715, dropped 1156, interrupted 7804, stale 24 | wrong<found 686, prompt<talkResult@second half 119, prompt<found@second half 108, prompt<talkResult@first half 106, prompt<found@first half 103, hint<found 91 |
| spammer | 4 | 28.2 | 19.9 | 79.3 | 98.2 | 17.4 | 1.33 (2.97) | 1.7 | 6.7 | 27.7 (46.6) | interrupted 9021, cut 9319, dropped 1821, stale 389 | wrong<found 654, wrong<wrong 337, prompt<talkResult@second half 127, prompt<talkResult@first half 114, prompt<found@second half 109, prompt<found@first half 84 |
| typical | 3 | 18.2 | 15.4 | 59.4 | 100.0 | 1.9 | 0.15 (0.57) | 3.3 | 0.0 | 12.4 (12.8) | cut 3528, interrupted 772, dropped 14, stale 15 | wrong<found 292, surprise<surpriseTap 126, surprise<found 99, surpriseTap<found 81, found<surpriseTap 63, surprise<wrong 42 |
| typical | 4 | 18.8 | 16.8 | 56.8 | 100.0 | 2.9 | 0.24 (0.87) | 1.7 | 1.8 | 9.7 (9.1) | cut 2704, interrupted 461, dropped 4, stale 27 | surprise<surpriseTap 148, wrong<found 126, surprise<found 94, surpriseTap<found 66, found<surpriseTap 66, prompt<talkResult@second half 47 |
| slow3 | 3 | 14.5 | 12.8 | 51.2 | 100.0 | 0.0 | 0.14 (0.47) | 2.3 | 0.0 | 8.3 (7.2) | cut 2578, interrupted 277, stale 28 | surprise<surpriseTap 227, wrong<found 82, idle<found 69, hint<found 56, surpriseTap<found 38, surpriseTap<wrong 32 |
| slow3 | 4 | 14.1 | 12.8 | 47.5 | 100.0 | 0.5 | 0.23 (0.87) | 1.4 | 0.6 | 7.4 (5.8) | cut 1988, interrupted 324, stale 70, dropped 3 | surprise<surpriseTap 232, hint<found 64, wrong<found 49, idle<found 33, surpriseTap<found 27, surpriseTap<wrong 18 |

| model | age | same answer twice in a row % by topic | repeated set / session by topic | wrong lines whose 1st sentence was heard % |
|---|---|---|---|---|
| sandOnly | 3 | colors 17.4, shapes 18.8, size 54.3, animals 11.5 | colors 0.17, shapes 0.01, size 0.34, animals 0.02 | 97.7 |
| sandOnly | 4 | colors 17.1, shapes 11.5, animals 11.2 | colors 0.18, animals 0.02, shapes 0.01 | 97.9 |
| tapper | 3 | colors 17.3, shapes 17.8, size 53.0, animals 12.7 | colors 0.19, shapes 0.02, size 0.36, animals 0.01 | 88.6 |
| tapper | 4 | colors 16.7, shapes 10.2, animals 9.6 | colors 0.20, count 0.02, animals 0.02, shapes 0.01 | 93.3 |
| spammer | 3 | colors 17.3, shapes 19.5, size 53.3, animals 12.1 | colors 0.19, shapes 0.02, size 0.36, animals 0.01 | 46.5 |
| spammer | 4 | colors 16.7, shapes 12.2, animals 9.6 | colors 0.20, count 0.37, animals 0.02, shapes 0.01 | 65.4 |
| typical | 3 | colors 17.3, shapes 19.5, size 53.3, animals 12.4 | colors 0.19, shapes 0.02, size 0.36, animals 0.01 | 90.6 |
| typical | 4 | colors 16.7, shapes 11.4, animals 7.8 | colors 0.20, count 0.36, animals 0.02, shapes 0.01 | 90.3 |
| slow3 | 3 | colors 17.4, shapes 19.5, size 54.6, animals 10.8 | colors 0.16, shapes 0.03, size 0.40, animals 0.04 | 98.6 |
| slow3 | 4 | colors 16.8, shapes 11.8, animals 9.0 | colors 0.14, count 0.01 | 99.0 |

### C. Content variety + difficulty curve (per chapter: topic · chapter s · round s · wrong/round · mounds · steps · 3★ %)

| model | age | repeated set / session | same answer twice in a row % | target rank (left→right, n=3 mounds: 0/1/2 %) | ch1 | ch2 | ch3 | ch4 | bad lines |
|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 0.58 | 24.9 | 32.9 / 32.3 / 34.8 | colors · 67.6 · 12.6 · 0.34 · 2.4 · 1.00 · 68.5 | shapes · 66.6 · 12.4 · 0.38 · 2.4 · 1.13 · 66.5 | size · 62.2 · 11.3 · 0.26 · 2.0 · 1.00 · 74.3 | animals · 66.9 · 12.5 · 0.29 · 2.4 · 1.14 · 71.8 | 0 |
| typical | 4 | 0.59 | 11.4 | 30.9 / 34.6 / 34.5 | colors · 64.4 · 11.8 · 0.19 · 2.8 · 1.00 · 81.8 | shapes · 72.7 · 13.9 · 0.24 · 3.2 · 1.35 · 77.5 | count · 89.1 · 18.2 · 0.00 · 5.1 · 1.00 · 100.0 | animals · 73.2 · 14.0 · 0.21 · 3.1 · 1.38 · 80.5 | 0 |
