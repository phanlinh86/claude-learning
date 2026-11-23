# hs_kids smoke — 4 sessions (0 failed), config {}, patch '', voice {} (1 s)

### A. Pace, help, stars

| model | age | n | done % | session min (p90) | chapter s [p10–p90] | round s (p90, max) | stuck | stars 3/2/1 % | wrong / round | 1st tap digs it % · 1st tap empty sand / soft % | 1st dig right % (assisted %) | ask → 1st dig s (p90) | tap → judged s (alone / tapping along, along %) | hint rounds % | assist rounds % | talk right % |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 4 | 2 | 100.0 | 4.7 (5.0) | 68.6 [60.3–85.0] | 11.9 (17.3, 27.2) | 0 | 90.6/9.4/0.0 | 0.09 | 82.1 · 0.0 | 89.3 (0.0) | 4.7 (5.2) | 1.80 / 1.40 (98.2) | 0.0 | 0.0 | 87.5 |
| bot0.8 | 4 | 2 | 100.0 | 3.7 (3.7) | 53.4 [40.9–63.9] | 8.8 (14.0, 16.4) | 0 | 68.8/25.0/6.3 | 0.38 | 63.0 · 0.0 | 63.0 (0.0) | 1.7 (2.1) | 1.80 / 1.30 (98.4) | 6.3 | 0.0 | 75.0 |

### B. Speech (modelled main.js policy + voice.js queue)

| model | age | lines asked / min | spoken / min | talk time % | prompts started % | prompt cut % | ask → prompt starts s (p90) | same prompt text twice % | count words lost % | words lost % (/ min) | lost words by reason | cut lines by kind |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| typical | 4 | 19.8 | 18.0 | 60.5 | 100.0 | 0.0 | 0.28 (1.57) | 0.0 | 4.2 | 8.5 (8.6) | interrupted 16, cut 37 | surprise<surpriseTap 3, wrong<found 2, surpriseTap<found 2, found<surpriseTap 2, surprise<found 1 |
| bot0.8 | 4 | 24.9 | 20.0 | 71.8 | 100.0 | 37.2 | 0.31 (1.17) | 0.0 | 8.3 | 15.2 (19.7) | cut 104, interrupted 15 | prompt<found@second half 8, wrong<found 6, prompt<talkResult@second half 5, prompt<talkResult@first half 2, surprise<surpriseTap 1, surprise<wrong 1 |

| model | age | same answer twice in a row % by topic | repeated set / session by topic | wrong lines whose 1st sentence was heard % |
|---|---|---|---|---|
| typical | 4 | colors 0.0, shapes 0.0, animals 0.0 | colors 0.50, count 0.50 | 66.7 |
| bot0.8 | 4 | colors 0.0, shapes 0.0, animals 0.0 | colors 0.50, count 0.50 | 75.0 |

### C. Content variety + difficulty curve (per chapter: topic · chapter s · round s · wrong/round · mounds · steps · 3★ %)

| model | age | repeated set / session | same answer twice in a row % | target rank (left→right, n=3 mounds: 0/1/2 %) | ch1 | ch2 | ch3 | ch4 | bad lines |
|---|---|---|---|---|---|---|---|---|---|
| typical | 4 | 1.00 | 0.0 | 33.3 / 33.3 / 33.3 | colors · 62.5 · 10.3 · 0.13 · 2.8 · 1.00 · 87.5 | shapes · 72.8 · 13.0 · 0.25 · 3.3 · 1.25 · 75.0 | count · 74.2 · 13.5 · 0.00 · 5.0 · 1.00 · 100.0 | animals · 64.8 · 10.9 · 0.00 · 3.0 · 1.25 · 100.0 | 0 |
| bot0.8 | 4 | 1.00 | 0.0 | 35.7 / 35.7 / 28.6 | colors · 47.2 · 7.3 · 0.38 · 2.8 · 1.00 · 75.0 | shapes · 49.6 · 7.8 · 0.25 · 3.3 · 1.25 · 75.0 | count · 63.0 · 11.1 · 0.00 · 5.0 · 1.00 · 100.0 | animals · 53.7 · 9.0 · 0.88 · 3.0 · 1.25 · 25.0 | 0 |
