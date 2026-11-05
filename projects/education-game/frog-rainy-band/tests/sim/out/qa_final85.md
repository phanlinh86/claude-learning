## QA playtest "final85" — 2000 sessions · config {"beatLead":4.6,"beatGap":0.75,"songLead":1,"songGap":0.5,"drumQuiet":1.2,"drumQuietMax":3,"shortNudge":4,"tapMovePx":64,"tapTime":0.8,"chapterTimeLimit":85} · patch drumQuiet,shortNudge

### Time

| age | model | done/n | chapter mean (p10–p90) s | cut % | session mean / p90 / max s | round mean / p90 s | play / song / clear s | reward % of round | ask mean / p90 / max s | ask > 60 s / round > 120 s / stuck |
|---|---|---|---|---|---|---|---|---|---|---|
| 3 | typical | 200/200 | 88.5 (75.8–103.9) | 1 | 361 / 383 / 415 | 20.0 / 27.6 | 16.3 / 2.8 / 0.9 | 20 | 5.1 / 8.5 / 32 | 0 / 0 / 0 |
| 3 | overdrum | 200/200 | 88.4 (75.8–102.9) | 0 | 361 / 384 / 413 | 19.9 / 27.5 | 16.3 / 2.8 / 0.9 | 20 | 5.0 / 7.6 / 20 | 0 / 0 / 0 |
| 4 | typical | 200/200 | 97.9 (84.4–114.3) | 12 | 399 / 422 / 456 | 23.0 / 34.5 | 18.9 / 3.1 / 0.9 | 19 | 4.4 / 8.0 / 36 | 0 / 0 / 0 |
| 4 | overdrum | 200/200 | 96.9 (84.4–109.5) | 15 | 395 / 423 / 450 | 22.9 / 33.3 | 18.8 / 3.1 / 0.9 | 19 | 4.3 / 7.5 / 19 | 0 / 0 / 0 |
| 5 | typical | 200/200 | 99.8 (88.9–112.9) | 13 | 406 / 436 / 464 | 23.6 / 32.7 | 19.2 / 3.5 / 0.9 | 20 | 3.6 / 5.8 / 41 | 0 / 0 / 0 |
| 5 | overdrum | 200/200 | 98.7 (88.9–110.1) | 16 | 402 / 427 / 457 | 23.5 / 32.0 | 19.1 / 3.5 / 0.9 | 20 | 3.5 / 5.6 / 16 | 0 / 0 / 0 |
| 6 | typical | 200/200 | 100.5 (90.7–111.6) | 21 | 409 / 429 / 461 | 24.2 / 31.7 | 19.6 / 3.7 / 0.9 | 20 | 3.2 / 5.3 / 37 | 0 / 0 / 0 |
| 6 | overdrum | 200/200 | 100.6 (90.5–112.0) | 21 | 410 / 430 / 474 | 24.3 / 31.2 | 19.6 / 3.7 / 0.9 | 20 | 3.1 / 5.2 / 16 | 0 / 0 / 0 |
| 7 | typical | 200/200 | 98.7 (86.4–113.5) | 26 | 402 / 428 / 453 | 24.1 / 33.9 | 19.5 / 3.7 / 0.9 | 21 | 3.1 / 5.4 / 41 | 0 / 0 / 0 |
| 7 | overdrum | 200/200 | 98.6 (86.7–111.8) | 26 | 402 / 424 / 461 | 24.0 / 31.7 | 19.4 / 3.7 / 0.9 | 21 | 3.0 / 5.1 / 20 | 0 / 0 / 0 |

### Help, stars, drum carry-over, content

| age | model | wrong/ask | hinted asks % | hints/ask | idle/ask | ★★★/★★/★ % | stars/session | drum asks | drum counts < 0.7 s into a drum ask (asks hit / asks completed by them) | reactions to song taps | repeat asks % | all members asked (n ≥ k) | identical / same-band consecutive rounds |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | typical | 0.31 | 0 | 0.00 | 0.04 | 43/40/17 | 36.1 | 628 | 0 (0 / 0) | 0 | 18.3 | 100.0 % of 2876 | 0 / 0 of 2390 |
| 3 | overdrum | 0.32 | 0 | 0.00 | 0.03 | 43/40/17 | 36.0 | 628 | 41 (41 / 0) · model: 66 of 1189 extra taps counted on the next ask | 0 | 18.2 | 100.0 % of 2886 | 0 / 0 of 2400 |
| 4 | typical | 0.26 | 4 | 0.04 | 0.03 | 47/31/22 | 35.0 | 785 | 0 (0 / 0) | 0 | 19.2 | 100.0 % of 2788 | 0 / 0 of 2302 |
| 4 | overdrum | 0.27 | 4 | 0.04 | 0.01 | 47/31/22 | 34.7 | 785 | 8 (8 / 0) · model: 17 of 1551 extra taps counted on the next ask | 0 | 19.3 | 100.0 % of 2767 | 0 / 0 of 2281 |
| 5 | typical | 0.20 | 3 | 0.03 | 0.01 | 51/31/19 | 35.9 | 735 | 0 (0 / 0) | 0 | 29.6 | 100.0 % of 2801 | 0 / 0 of 2295 |
| 5 | overdrum | 0.20 | 2 | 0.02 | 0.00 | 51/31/18 | 35.7 | 735 | 9 (9 / 0) · model: 10 of 1475 extra taps counted on the next ask | 0 | 29.8 | 100.0 % of 2778 | 0 / 0 of 2272 |
| 6 | typical | 0.15 | 2 | 0.02 | 0.02 | 57/29/14 | 36.8 | 936 | 0 (0 / 0) | 0 | 26.7 | 100.0 % of 2721 | 0 / 0 of 2233 |
| 6 | overdrum | 0.15 | 2 | 0.02 | 0.00 | 56/30/14 | 36.8 | 936 | 19 (19 / 0) · model: 25 of 1883 extra taps counted on the next ask | 0 | 26.7 | 100.0 % of 2723 | 0 / 0 of 2235 |
| 7 | typical | 0.10 | 1 | 0.01 | 0.02 | 68/25/7 | 39.0 | 1200 | 0 (0 / 0) | 0 | 26.3 | 100.0 % of 2594 | 0 / 0 of 2194 |
| 7 | overdrum | 0.10 | 1 | 0.01 | 0.00 | 68/24/8 | 39.0 | 1200 | 20 (19 / 0) · model: 24 of 2379 extra taps counted on the next ask | 0 | 26.3 | 100.0 % of 2596 | 0 / 0 of 2196 |

### Chapter mean by topic (s), ask mean/p90 by mode, answer slot share, member variety (typical)

| age | topics | ask s by mode pick · drum · listen | answer slot share | members: kinds seen, most / least frequent share |
|---|---|---|---|---|
| 3 typical | colors 86.1 · animals 84.6 · size 85 · shapes 83.7 · count 103.2 | 5.0/8.1 · 6.5/11.2 · 4.8/8.1 | 0:50% 1:50% | colors 6 (19/14 %) · animals 8 (15/10 %) · size 12 (9/7 %) · shapes 30 (5/2 %) · count 3 (34/33 %) |
| 3 overdrum | colors 86.1 · animals 84.6 · size 85 · shapes 83.7 · count 102.7 | 5.0/8.1 · 4.5/6.0 · 4.9/7.3 | 0:50% 1:50% | colors 6 (19/14 %) · animals 8 (15/10 %) · size 12 (9/7 %) · shapes 30 (5/2 %) · count 3 (34/33 %) |
| 4 typical | colors 94.8 · animals 95.6 · size 93 · shapes 96.3 · count 110.4 | 4.3/7.8 · 5.6/10.0 · 4.0/7.4 | 0:39% 1:39% 2:22% | colors 6 (22/12 %) · animals 8 (14/12 %) · size 12 (9/8 %) · shapes 30 (5/2 %) · count 5 (22/17 %) |
| 4 overdrum | colors 94.8 · animals 95.6 · size 93 · shapes 96.3 · count 105.2 | 4.3/7.8 · 4.1/5.7 · 4.0/7.1 | 0:39% 1:39% 2:22% | colors 6 (22/12 %) · animals 8 (14/12 %) · size 12 (9/8 %) · shapes 30 (5/2 %) · count 5 (21/18 %) |
| 5 typical | colors 98.4 · animals 96.6 · shapes 97.2 · count 109.4 · letters 98 | 3.5/5.5 · 5.1/8.7 · 3.4/5.8 | 0:37% 1:36% 2:28% | colors 7 (15/13 %) · animals 8 (13/12 %) · shapes 56 (2/1 %) · count 10 (11/8 %) · letters 23 (6/2 %) |
| 5 overdrum | colors 98.4 · animals 96.6 · shapes 97.2 · count 103.6 · letters 98 | 3.5/5.5 · 4.2/6.3 · 3.3/5.3 | 0:37% 1:36% 2:28% | colors 7 (15/13 %) · animals 8 (13/12 %) · shapes 56 (2/1 %) · count 10 (11/8 %) · letters 23 (6/2 %) |
| 6 typical | letters 99.2 · count 107.6 · lower 99.4 · initial 97.8 · add 98.3 | 3.0/5.0 · 5.8/9.5 · 2.8/4.7 | 0:33% 1:32% 2:22% 3:13% | letters 23 (6/2 %) · count 11 (11/7 %) · lower 21 (6/2 %) · initial 8 (16/6 %) · add 9 (14/9 %) |
| 6 overdrum | letters 99.2 · count 108 · lower 100.5 · initial 96.7 · add 98.6 | 3.0/4.9 · 4.5/6.4 · 2.9/4.8 | 0:33% 1:32% 2:22% 3:13% | letters 23 (6/2 %) · count 11 (11/7 %) · lower 21 (6/2 %) · initial 8 (16/6 %) · add 9 (14/8 %) |
| 7 typical | count 111.6 · initial 94.8 · add 93.8 · sub 95.1 · oddeven 94 | 2.8/4.6 · 6.4/10.0 · 2.7/4.5 | 0:32% 1:33% 2:22% 3:13% | count 10 (11/9 %) · initial 8 (16/6 %) · add 19 (8/4 %) · sub 10 (11/8 %) · oddeven 20 (10/1 %) |
| 7 overdrum | count 109.6 · initial 95.1 · add 93.9 · sub 95.2 · oddeven 95.7 | 2.8/4.6 · 4.9/6.6 · 2.6/4.3 | 0:32% 1:33% 2:22% 3:13% | count 10 (11/9 %) · initial 8 (16/6 %) · add 19 (8/4 %) · sub 10 (11/8 %) · oddeven 20 (10/1 %) |

_80 s wall · tests/sim/hs_qa.js_
