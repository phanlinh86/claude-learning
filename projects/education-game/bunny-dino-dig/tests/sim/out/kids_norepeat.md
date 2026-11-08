# hs_kids norepeat — 600 sessions (0 failed), config {}, patch 'noRepeat', voice {} (38 s)

### A. Pace, help, stars

| model | age | n | done % | session min (p90) | chapter s [p10–p90] | round s (p90, max) | stuck | stars 3/2/1 % | wrong / round | 1st tap digs it % · 1st tap empty sand / soft % | 1st dig right % (assisted %) | ask → 1st dig s (p90) | tap → judged s (alone / tapping along, along %) | hint rounds % | assist rounds % | talk right % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 100 | 100.0 | 4.5 (4.9) | 66.1 [56.8–76.9] | 12.3 (17.9, 38.6) | 0 | 69.9/28.2/1.9 | 0.32 | 62.3 · 9.6 | 71.7 (0.0) | 5.8 (8.0) | 1.50 / 1.20 (43.9) | 5.3 | 0.0 | 76.3 |
| typical | 4 | 100 | 100.0 | 5.1 (5.5) | 74.7 [59.6–92.2] | 14.5 (22.0, 44.4) | 0 | 83.5/15.0/1.4 | 0.18 | 74.2 · 5.7 | 82.0 (0.0) | 5.2 (6.5) | 2.07 / 1.74 (87.8) | 2.5 | 0.0 | 84.3 |
| typical | 5 | 100 | 100.0 | 5.9 (6.1) | 85.9 [77.8–97.0] | 17.2 (24.9, 42.0) | 0 | 81.8/15.1/3.1 | 0.22 | 78.9 · 3.2 | 85.3 (0.0) | 4.7 (5.2) | 2.07 / 1.74 (87.1) | 2.8 | 0.0 | 90.5 |
| bot0.8 | 3 | 100 | 100.0 | 2.9 (3.1) | 42.2 [37.4–47.1] | 7.0 (9.6, 14.4) | 0 | 76.6/22.3/1.1 | 0.24 | 78.0 · 0.0 | 78.0 (0.0) | 1.6 (2.1) | 1.50 / 1.13 (82.0) | 1.1 | 0.0 | 80.5 |
| bot0.8 | 4 | 100 | 100.0 | 3.6 (3.9) | 52.2 [42.3–67.0] | 9.5 (15.0, 21.9) | 0 | 82.6/13.9/3.4 | 0.21 | 81.0 · 0.0 | 81.0 (0.0) | 1.5 (2.0) | 2.07 / 1.52 (96.1) | 3.1 | 0.0 | 79.3 |
| bot0.8 | 5 | 100 | 100.0 | 4.3 (4.5) | 62.4 [53.5–75.7] | 12.0 (18.0, 27.6) | 0 | 75.7/18.1/6.3 | 0.31 | 80.0 · 0.0 | 80.0 (0.0) | 1.6 (2.1) | 2.07 / 1.52 (96.8) | 4.8 | 0.0 | 78.0 |

### B. Speech (modelled main.js policy + voice.js queue)

| model | age | lines asked / min | spoken / min | talk time % | prompts started % | prompt cut % | ask → prompt starts s (p90) | same prompt text twice % | count words lost % | words lost % (/ min) | lost words by reason | cut lines by kind |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 18.2 | 15.4 | 59.3 | 100.0 | 1.7 | 0.15 (0.57) | 0.0 | 0.0 | 12.2 (12.7) | cut 3528, interrupted 747, dropped 10, stale 17 | wrong<found 290, surprise<surpriseTap 128, surprise<found 101, surpriseTap<found 80, found<surpriseTap 63, surprise<wrong 40 |
| typical | 4 | 18.9 | 16.9 | 56.9 | 100.0 | 3.1 | 0.24 (0.90) | 0.0 | 1.4 | 9.6 (9.1) | cut 2693, interrupted 457, stale 31, dropped 2 | surprise<surpriseTap 144, wrong<found 127, surprise<found 95, found<surpriseTap 69, surpriseTap<found 63, prompt<talkResult@second half 47 |
| typical | 5 | 19.2 | 17.2 | 58.3 | 100.0 | 3.6 | 0.31 (1.13) | 0.0 | 1.6 | 9.0 (8.7) | cut 2977, interrupted 641, dropped 27, stale 17 | wrong<found 165, surprise<found 132, surprise<surpriseTap 106, found<surpriseTap 71, surpriseTap<found 70, prompt<talkResult@second half 51 |
| bot0.8 | 3 | 25.7 | 19.9 | 78.8 | 99.6 | 40.6 | 0.20 (0.87) | 0.0 | 0.0 | 16.6 (23.8) | cut 4754, interrupted 745, dropped 8 | prompt<found@second half 371, wrong<found 321, prompt<talkResult@second half 217, prompt<talkResult@first half 172, prompt<found@first half 89, found<surpriseTap 41 |
| bot0.8 | 4 | 25.7 | 21.3 | 72.6 | 98.2 | 32.1 | 0.27 (1.00) | 0.0 | 1.7 | 14.9 (18.9) | cut 4128, interrupted 1174, dropped 36, stale 4 | prompt<found@second half 296, prompt<talkResult@second half 190, prompt<talkResult@first half 179, wrong<found 177, prompt<found@first half 67, found<surpriseTap 37 |
| bot0.8 | 5 | 25.8 | 21.1 | 72.0 | 98.7 | 32.4 | 0.32 (1.10) | 0.0 | 1.4 | 16.9 (21.9) | cut 6141, interrupted 1683, dropped 89, stale 19 | prompt<found@second half 383, wrong<found 257, prompt<talkResult@first half 190, prompt<talkResult@second half 181, prompt<found@first half 180, found<surpriseTap 46 |

| model | age | same answer twice in a row % by topic | repeated set / session by topic | wrong lines whose 1st sentence was heard % |
|---|---|---|---|---|
| typical | 3 | colors 0.0, shapes 0.9, size 2.3, animals 0.0 | shapes 0.05, size 0.43, colors 0.17, animals 0.02 | 90.6 |
| typical | 4 | colors 0.0, shapes 0.0, animals 0.2 | colors 0.21, count 0.36, animals 0.01 | 92.0 |
| typical | 5 | shapes 17.7, letters 0.0, animals 0.2 | animals 0.01 | 87.5 |
| bot0.8 | 3 | colors 0.0, shapes 0.0, size 2.3, animals 0.0 | shapes 0.05, size 0.43, colors 0.17, animals 0.02 | 72.9 |
| bot0.8 | 4 | colors 0.0, shapes 0.5, animals 0.2 | colors 0.21, count 0.37, animals 0.01 | 81.1 |
| bot0.8 | 5 | shapes 17.5, letters 0.0, animals 0.3 | animals 0.01 | 76.5 |

### C. Content variety + difficulty curve (per chapter: topic · chapter s · round s · wrong/round · mounds · steps · 3★ %)

| model | age | repeated set / session | same answer twice in a row % | target rank (left→right, n=3 mounds: 0/1/2 %) | ch1 | ch2 | ch3 | ch4 | bad lines |
|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 0.67 | 0.8 | 31.6 / 34.5 / 33.8 | colors · 67.5 · 12.6 · 0.34 · 2.4 · 1.00 · 68.8 | shapes · 67.0 · 12.5 · 0.36 · 2.4 · 1.14 · 68.0 | size · 62.8 · 11.5 · 0.28 · 2.0 · 1.00 · 72.5 | animals · 67.1 · 12.5 · 0.30 · 2.4 · 1.13 · 70.5 | 0 |
| typical | 4 | 0.58 | 0.1 | 31.4 / 35.4 / 33.2 | colors · 64.4 · 11.8 · 0.19 · 2.8 · 1.00 · 81.8 | shapes · 72.8 · 14.0 · 0.27 · 3.1 · 1.34 · 75.3 | count · 88.6 · 18.1 · 0.00 · 5.1 · 1.00 · 100.0 | animals · 73.2 · 14.1 · 0.25 · 3.1 · 1.38 · 77.3 | 0 |
| typical | 5 | 0.01 | 6.0 | 37.3 / 30.3 / 32.3 | shapes · 83.1 · 16.6 · 0.27 · 4.1 · 1.75 · 77.4 | count · 92.9 · 19.0 · 0.00 · 5.7 · 1.00 · 100.0 | letters · 83.8 · 16.7 · 0.31 · 3.8 · 1.75 · 73.5 | animals · 84.1 · 16.8 · 0.29 · 4.1 · 1.75 · 76.2 | 0 |
| bot0.8 | 3 | 0.67 | 0.5 | 31.3 / 34.1 / 34.6 | colors · 44.1 · 7.4 · 0.24 · 2.4 · 1.00 · 77.8 | shapes · 42.4 · 7.1 · 0.30 · 2.4 · 1.14 · 71.8 | size · 40.7 · 6.6 · 0.22 · 2.0 · 1.00 · 77.8 | animals · 41.6 · 6.8 · 0.21 · 2.4 · 1.13 · 79.3 | 0 |
| bot0.8 | 4 | 0.59 | 0.3 | 32.8 / 34.7 / 32.5 | colors · 45.4 · 7.8 · 0.24 · 2.8 · 1.00 · 80.0 | shapes · 48.8 · 8.6 · 0.30 · 3.1 · 1.35 · 75.0 | count · 65.3 · 12.7 · 0.00 · 5.1 · 1.00 · 100.0 | animals · 49.4 · 8.8 · 0.29 · 3.1 · 1.41 · 75.5 | 0 |
| bot0.8 | 5 | 0.01 | 5.9 | 37.3 / 30.3 / 32.3 | shapes · 58.5 · 11.1 · 0.43 · 4.1 · 1.75 · 65.5 | count · 74.6 · 15.0 · 0.00 · 5.7 · 1.00 · 100.0 | letters · 57.9 · 10.9 · 0.40 · 3.8 · 1.75 · 67.8 | animals · 58.5 · 11.1 · 0.42 · 4.1 · 1.75 · 69.5 | 0 |
