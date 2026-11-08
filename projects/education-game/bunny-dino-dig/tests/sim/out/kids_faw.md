# hs_kids faw — 600 sessions (0 failed), config {}, patch '', voice {"foundAfterWrong":4} (35 s)

### A. Pace, help, stars

| model | age | n | done % | session min (p90) | chapter s [p10–p90] | round s (p90, max) | stuck | stars 3/2/1 % | wrong / round | 1st tap digs it % · 1st tap empty sand / soft % | 1st dig right % (assisted %) | ask → 1st dig s (p90) | tap → judged s (alone / tapping along, along %) | hint rounds % | assist rounds % | talk right % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 100 | 100.0 | 4.5 (4.8) | 65.8 [56.7–77.1] | 12.2 (17.8, 38.6) | 0 | 70.3/27.5/2.3 | 0.32 | 62.2 · 9.8 | 72.0 (0.0) | 5.8 (7.9) | 1.50 / 1.20 (44.7) | 5.6 | 0.0 | 78.0 |
| typical | 4 | 100 | 100.0 | 5.1 (5.4) | 74.8 [59.5–91.9] | 14.5 (21.8, 44.4) | 0 | 84.9/14.1/1.0 | 0.16 | 75.0 · 6.2 | 83.8 (0.0) | 5.2 (6.5) | 2.07 / 1.74 (87.6) | 2.1 | 0.0 | 85.8 |
| spammer | 3 | 100 | 100.0 | 4.0 (4.2) | 58.5 [52.0–65.9] | 10.4 (12.9, 21.8) | 0 | 44.8/45.9/9.3 | 0.65 | 34.8 · 20.5 | 46.9 (0.1) | 3.8 (5.6) | 1.50 / 1.18 (49.9) | 32.0 | 0.9 | 75.3 |
| spammer | 4 | 100 | 100.0 | 4.7 (5.0) | 69.3 [59.3–78.9] | 13.0 (19.1, 28.0) | 0 | 48.1/28.3/23.6 | 0.80 | 26.9 · 18.4 | 39.8 (0.0) | 3.6 (5.0) | 2.07 / 1.71 (60.0) | 39.9 | 2.3 | 88.8 |
| slow3 | 3 | 100 | 100.0 | 6.0 (6.5) | 87.6 [74.8–100.4] | 18.2 (28.7, 53.2) | 0 | 59.0/36.4/4.6 | 0.46 | 48.4 · 15.6 | 60.7 (0.0) | 9.5 (15.9) | 1.50 / 1.23 (13.3) | 11.5 | 0.0 | 60.5 |
| slow3 | 4 | 100 | 100.0 | 6.6 (7.2) | 97.6 [82.9–116.9] | 23.1 (38.8, 80.0) | 0 | 67.7/23.1/9.2 | 0.42 | 49.8 · 14.9 | 62.8 (0.0) | 9.8 (16.4) | 2.07 / 1.82 (34.1) | 14.5 | 0.0 | 59.0 |

### B. Speech (modelled main.js policy + voice.js queue)

| model | age | lines asked / min | spoken / min | talk time % | prompts started % | prompt cut % | ask → prompt starts s (p90) | same prompt text twice % | count words lost % | words lost % (/ min) | lost words by reason | cut lines by kind |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 18.2 | 16.0 | 60.4 | 100.0 | 2.4 | 0.18 (0.63) | 3.1 | 0.0 | 10.4 (10.8) | interrupted 511, cut 2579, dropped 290, stale 44 | surprise<surpriseTap 127, surprise<found 99, surpriseTap<found 80, found<surpriseTap 61, surprise<wrong 41, wrong<surpriseTap 32 |
| typical | 4 | 18.8 | 17.1 | 57.2 | 100.0 | 3.1 | 0.26 (1.00) | 1.7 | 1.8 | 8.6 (8.1) | cut 2224, interrupted 312, dropped 119, stale 29 | surprise<surpriseTap 146, surprise<found 94, surpriseTap<found 67, found<surpriseTap 65, prompt<talkResult@second half 44, surprise<wrong 25 |
| spammer | 3 | 26.6 | 19.5 | 81.1 | 97.0 | 19.7 | 1.24 (2.80) | 2.7 | 0.0 | 25.6 (43.6) | cut 4647, dropped 7704, interrupted 3475, stale 234 | prompt<found@first half 122, prompt<talkResult@second half 120, prompt<talkResult@first half 114, hint<found 95, prompt<found@second half 90, wrong<wrong 82 |
| spammer | 4 | 27.8 | 20.5 | 79.9 | 98.1 | 17.8 | 1.41 (3.03) | 1.7 | 6.8 | 25.6 (42.4) | cut 6186, interrupted 4750, dropped 7166, stale 548 | wrong<wrong 357, prompt<talkResult@second half 136, prompt<talkResult@first half 123, prompt<found@second half 96, prompt<found@first half 90, already<found 88 |
| slow3 | 3 | 14.5 | 12.9 | 51.3 | 100.0 | 0.1 | 0.14 (0.47) | 2.8 | 0.0 | 8.0 (6.9) | cut 2390, interrupted 183, dropped 85, stale 30 | surprise<surpriseTap 224, idle<found 73, hint<found 57, surpriseTap<found 39, surpriseTap<wrong 32, surprise<found 29 |
| slow3 | 4 | 14.1 | 12.9 | 47.5 | 100.0 | 0.5 | 0.24 (0.87) | 1.4 | 0.6 | 7.2 (5.7) | cut 1942, interrupted 277, dropped 25, stale 64 | surprise<surpriseTap 233, hint<found 66, idle<found 38, wrong<found 33, surpriseTap<found 27, surpriseTap<wrong 18 |

| model | age | same answer twice in a row % by topic | repeated set / session by topic | wrong lines whose 1st sentence was heard % |
|---|---|---|---|---|
| typical | 3 | colors 17.3, shapes 19.5, size 53.3, animals 12.4 | colors 0.19, shapes 0.02, size 0.36, animals 0.01 | 93.6 |
| typical | 4 | colors 16.7, shapes 11.4, animals 7.8 | colors 0.20, count 0.36, animals 0.02, shapes 0.01 | 92.6 |
| spammer | 3 | colors 17.3, shapes 19.6, size 53.3, animals 12.1 | colors 0.19, shapes 0.02, size 0.36, animals 0.01 | 84.7 |
| spammer | 4 | colors 16.7, shapes 12.3, animals 9.5 | colors 0.20, count 0.37, animals 0.02, shapes 0.01 | 81.0 |
| slow3 | 3 | colors 17.4, shapes 19.5, size 54.6, animals 10.8 | colors 0.16, shapes 0.03, size 0.40, animals 0.04 | 98.7 |
| slow3 | 4 | colors 16.8, shapes 11.8, animals 9.0 | colors 0.14, count 0.01 | 99.0 |

### C. Content variety + difficulty curve (per chapter: topic · chapter s · round s · wrong/round · mounds · steps · 3★ %)

| model | age | repeated set / session | same answer twice in a row % | target rank (left→right, n=3 mounds: 0/1/2 %) | ch1 | ch2 | ch3 | ch4 | bad lines |
|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 0.58 | 24.9 | 32.9 / 32.3 / 34.8 | colors · 67.6 · 12.6 · 0.34 · 2.4 · 1.00 · 68.5 | shapes · 66.6 · 12.4 · 0.38 · 2.4 · 1.13 · 66.5 | size · 62.2 · 11.3 · 0.26 · 2.0 · 1.00 · 74.3 | animals · 66.9 · 12.5 · 0.29 · 2.4 · 1.14 · 71.8 | 0 |
| typical | 4 | 0.59 | 11.4 | 30.9 / 34.6 / 34.5 | colors · 64.4 · 11.8 · 0.19 · 2.8 · 1.00 · 81.8 | shapes · 72.7 · 13.9 · 0.24 · 3.2 · 1.35 · 77.5 | count · 89.1 · 18.2 · 0.00 · 5.1 · 1.00 · 100.0 | animals · 73.2 · 14.0 · 0.21 · 3.1 · 1.38 · 80.5 | 0 |
