# hs_kids count2 — 900 sessions (0 failed), config {}, patch 'countScoops2', voice {} (86 s)

### A. Pace, help, stars

| model | age | n | done % | session min (p90) | chapter s [p10–p90] | round s (p90, max) | stuck | stars 3/2/1 % | wrong / round | 1st tap digs it % · 1st tap empty sand / soft % | 1st dig right % (assisted %) | ask → 1st dig s (p90) | tap → judged s (alone / tapping along, along %) | hint rounds % | assist rounds % | talk right % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 4 | 100 | 100.0 | 5.1 (5.4) | 74.0 [60.2–88.7] | 14.2 (20.9, 43.1) | 0 | 83.0/15.5/1.4 | 0.18 | 74.3 · 6.0 | 81.7 (0.0) | 5.3 (6.7) | 1.67 / 1.57 (75.9) | 2.8 | 0.0 | 87.8 |
| typical | 5 | 100 | 100.0 | 5.7 (6.0) | 83.9 [77.0–93.0] | 16.7 (23.2, 42.8) | 0 | 82.8/14.2/3.1 | 0.20 | 79.3 · 3.6 | 86.1 (0.0) | 4.7 (5.1) | 1.69 / 1.58 (77.0) | 2.4 | 0.0 | 90.5 |
| typical | 6 | 100 | 100.0 | 5.6 (5.9) | 82.1 [75.7–90.0] | 16.2 (22.7, 36.4) | 0 | 87.3/11.2/1.5 | 0.14 | 82.1 · 4.6 | 89.9 (0.0) | 4.5 (5.0) | 1.69 / 1.56 (75.3) | 1.7 | 0.0 | 95.5 |
| slow3 | 4 | 100 | 100.0 | 6.7 (7.2) | 98.1 [83.3–116.8] | 22.8 (38.8, 68.7) | 0 | 67.2/23.8/9.0 | 0.43 | 49.6 · 15.5 | 62.2 (0.0) | 9.7 (16.4) | 1.84 / 1.70 (27.3) | 14.5 | 0.1 | 60.5 |
| slow3 | 5 | 100 | 100.0 | 7.5 (8.2) | 110.6 [88.9–133.4] | 30.2 (48.4, 79.7) | 0 | 57.2/21.3/21.4 | 0.69 | 46.9 · 16.4 | 61.3 (0.0) | 9.7 (16.2) | 1.87 / 1.71 (27.3) | 24.4 | 0.2 | 62.3 |
| slow3 | 6 | 100 | 100.0 | 7.6 (8.3) | 112.3 [90.6–136.6] | 31.1 (50.5, 104.3) | 0 | 58.0/19.2/22.9 | 0.71 | 44.8 · 15.3 | 59.8 (0.0) | 9.8 (16.4) | 1.86 / 1.74 (27.4) | 25.3 | 0.1 | 57.8 |
| slowOnce | 4 | 100 | 100.0 | 6.6 (7.1) | 97.7 [84.7–114.6] | 23.2 (38.3, 73.2) | 0 | 65.8/23.8/10.4 | 0.46 | 46.4 · 15.2 | 59.7 (0.0) | 10.0 (16.2) | 1.87 / 0.00 (0.0) | 14.5 | 0.0 | 63.5 |
| slowOnce | 5 | 100 | 100.0 | 7.6 (8.2) | 111.7 [91.3–135.9] | 31.0 (49.4, 92.1) | 0 | 57.3/20.0/22.7 | 0.71 | 45.2 · 15.4 | 60.2 (0.0) | 10.1 (16.3) | 1.89 / 0.00 (0.0) | 25.0 | 0.2 | 59.3 |
| slowOnce | 6 | 100 | 100.0 | 7.8 (8.5) | 115.1 [94.1–136.7] | 32.2 (51.4, 101.1) | 0 | 57.6/20.0/22.4 | 0.71 | 44.1 · 17.9 | 60.0 (0.0) | 10.4 (16.6) | 1.89 / 0.00 (0.0) | 25.3 | 0.0 | 58.5 |

### B. Speech (modelled main.js policy + voice.js queue)

| model | age | lines asked / min | spoken / min | talk time % | prompts started % | prompt cut % | ask → prompt starts s (p90) | same prompt text twice % | count words lost % | words lost % (/ min) | lost words by reason | cut lines by kind |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 4 | 19.2 | 17.2 | 57.9 | 100.0 | 2.8 | 0.25 (0.90) | 1.4 | 1.2 | 9.4 (9.0) | cut 2618, interrupted 455, dropped 5, stale 15 | surprise<surpriseTap 130, wrong<found 123, surprise<found 92, surpriseTap<found 66, found<surpriseTap 61, prompt<talkResult@second half 47 |
| typical | 5 | 19.6 | 17.6 | 59.5 | 100.0 | 3.5 | 0.32 (1.17) | 0.3 | 1.4 | 9.1 (9.0) | cut 3026, interrupted 572, dropped 37, stale 19 | wrong<found 167, surprise<found 132, surprise<surpriseTap 117, found<surpriseTap 65, surpriseTap<found 63, prompt<talkResult@second half 48 |
| typical | 6 | 19.9 | 17.8 | 66.3 | 100.0 | 7.6 | 0.30 (0.97) | 0.5 | 2.5 | 7.5 (8.5) | cut 2748, interrupted 504, dropped 25, stale 16 | wrong<found 142, prompt<found@second half 122, surprise<found 120, surprise<surpriseTap 99, prompt<talkResult@second half 84, found<surpriseTap 73 |
| slow3 | 4 | 14.3 | 13.0 | 47.9 | 100.0 | 0.6 | 0.23 (0.87) | 1.4 | 0.5 | 7.3 (5.7) | cut 2026, interrupted 267, dropped 4, stale 91 | surprise<surpriseTap 243, hint<found 70, wrong<found 47, idle<found 39, surpriseTap<found 25, idle<wrong 21 |
| slow3 | 5 | 14.1 | 12.7 | 48.4 | 100.0 | 0.5 | 0.27 (1.03) | 0.3 | 0.5 | 7.7 (6.2) | interrupted 420, cut 2661, stale 136, dropped 3 | surprise<surpriseTap 215, hint<found 106, wrong<found 70, idle<found 50, wrong<wrong 38, wrong<prompt 32 |
| slow3 | 6 | 13.9 | 12.6 | 52.5 | 100.0 | 1.3 | 0.26 (0.93) | 0.2 | 0.7 | 6.2 (5.5) | cut 2620, interrupted 136, dropped 5, stale 10 | surprise<surpriseTap 215, hint<found 146, idle<found 78, idle<wrong 57, surpriseTap<found 26, hint<wrong 26 |
| slowOnce | 4 | 14.2 | 13.0 | 47.6 | 100.0 | 0.3 | 0.22 (0.87) | 1.9 | 0.4 | 6.5 (5.1) | cut 1633, dropped 4, interrupted 155, stale 122 | surprise<surpriseTap 230, hint<found 57, wrong<found 29, idle<found 26, surpriseTap<found 26, idle<wrong 20 |
| slowOnce | 5 | 13.8 | 12.5 | 47.6 | 100.0 | 0.5 | 0.28 (1.03) | 0.1 | 0.7 | 7.1 (5.6) | cut 2352, stale 124, interrupted 324, dropped 26 | surprise<surpriseTap 236, hint<found 68, wrong<found 59, idle<found 42, wrong<wrong 32, idle<wrong 29 |
| slowOnce | 6 | 13.6 | 12.4 | 51.4 | 100.0 | 1.1 | 0.26 (0.93) | 0.4 | 0.4 | 5.8 (5.0) | cut 2345, interrupted 121, dropped 12, stale 10 | surprise<surpriseTap 214, hint<found 111, idle<found 82, idle<wrong 46, hint<wrong 21, surpriseTap<found 21 |

| model | age | same answer twice in a row % by topic | repeated set / session by topic | wrong lines whose 1st sentence was heard % |
|---|---|---|---|---|
| typical | 4 | colors 16.7, shapes 11.4, animals 8.5 | colors 0.20, count 0.36, animals 0.02, shapes 0.01 | 90.2 |
| typical | 5 | shapes 24.9, letters 2.7, animals 6.7 |  | 86.2 |
| typical | 6 | lower 2.2, initial 9.3, add 3.8 | initial 0.10 | 92.1 |
| slow3 | 4 | colors 16.8, shapes 11.8, animals 9.2 | colors 0.14, count 0.05 | 99.0 |
| slow3 | 5 | shapes 23.7, letters 3.5, animals 6.7 |  | 99.3 |
| slow3 | 6 | lower 2.2, initial 6.3, add 6.3 | initial 0.01 | 99.5 |
| slowOnce | 4 | colors 16.2, shapes 13.0, animals 9.5 | colors 0.13, count 0.04 | 99.8 |
| slowOnce | 5 | shapes 23.7, letters 2.5, animals 6.1 |  | 99.5 |
| slowOnce | 6 | lower 2.0, initial 6.4, add 7.4 |  | 99.9 |

### C. Content variety + difficulty curve (per chapter: topic · chapter s · round s · wrong/round · mounds · steps · 3★ %)

| model | age | repeated set / session | same answer twice in a row % | target rank (left→right, n=3 mounds: 0/1/2 %) | ch1 | ch2 | ch3 | ch4 | bad lines |
|---|---|---|---|---|---|---|---|---|---|
| typical | 4 | 0.59 | 11.6 | 31.6 / 34.7 / 33.7 | colors · 64.4 · 11.8 · 0.19 · 2.8 · 1.00 · 81.8 | shapes · 72.7 · 13.9 · 0.24 · 3.2 · 1.35 · 77.5 | count · 84.3 · 16.9 · 0.00 · 5.1 · 1.00 · 100.0 | animals · 74.6 · 14.4 · 0.30 · 3.1 · 1.38 · 73.0 | 0 |
| typical | 5 | 0.00 | 11.4 | 37.7 / 31.0 / 31.3 | shapes · 83.1 · 16.6 · 0.27 · 4.1 · 1.75 · 77.4 | count · 85.8 · 17.2 · 0.00 · 5.7 · 1.00 · 100.0 | letters · 83.0 · 16.5 · 0.28 · 3.8 · 1.75 · 76.0 | animals · 83.7 · 16.6 · 0.27 · 4.1 · 1.75 · 77.8 | 0 |
| typical | 6 | 0.10 | 5.1 | 33.0 / 31.0 / 36.0 | lower · 81.7 · 16.1 · 0.18 · 4.5 · 1.75 · 83.5 | initial · 81.0 · 16.0 · 0.20 · 4.6 · 1.75 · 81.8 | add · 80.8 · 15.9 · 0.19 · 4.5 · 1.75 · 84.0 | count · 84.8 · 16.9 · 0.00 · 5.9 · 1.00 · 100.0 | 0 |
