## hs_pt2 "v6gust" — 40 sessions · config {"gustAfter":1.5}

### Time & flow

| age | model | done/n | chapter mean/p90/max s | cut % | session mean/p90/max s | cake mean/p90/max s | ask mean/p90 s | stuck ask>60/cake>120 | done seq s (min–max) | roundDone→next ask s | round→1st ask s |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 4 | typical | 20/20 | 91.9 / 105.9 / 121 | 54 | 375 / 406 / 414 | 23.2 / 32.8 / 49 | 5.7 / 10.5 | 0 / 0 | 3.12 (2.73–3.67) | 2.29 | 1.46 |
| 4 | thoughtful | 20/20 | 82.5 / 104.3 / 111 | 84 | 337 / 376 / 379 | 22.5 / 27.5 / 36 | 5.8 / 7.1 | 0 / 0 | 3.07 (2.73–3.67) | 2.28 | 1.46 |

### Help, stars, releases

| age | model | wrong/ask | hints/ask (2-miss/idle/soft) | asks hinted % | assist/ask | ★★★/★★/★ % | release → drop / side-miss / low-miss % | side-misses ≤40 / 40–80 px out % | fall s high/normal (n high) |
|---|---|---|---|---|---|---|---|---|---|
| 4 | typical | 0.34 | 0.09 (0.07/0.02/0.00) | 9 | 0.00 | 47/31/22 | 100 / 0 / 0 | 0 / 0 | 0.44 / 0.36 (270) |
| 4 | thoughtful | 0.03 | 0.00 (0.00/0.00/0.00) | 0 | 0.00 | 93/7/0 | 100 / 0 / 0 | 0 / 0 | 0.43 / 0.36 (248) |

### Warm-up, weather, bee, variety

| age | model | warm-up ask s / wrong / choices | other ask s / wrong / choices | ask s sunny/breezy/rain/rainbow | max θ all / breezy | gusts | bees (tapped) / grabs stolen by bee | ask s with bee / no surprise | same answer twice in a row % | unique answers % |
|---|---|---|---|---|---|---|---|---|---|---|
| 4 | typical | 5.4 / 0.28 / 2.0 | 5.8 / 0.35 / 2.8 | 5.9/5.8/5.8/5.4 | 0.102 / 0.102 | 40 | 40 (14) / 0 | 5.4 / 5.8 | 7 | 47 |
| 4 | thoughtful | 5.7 / 0.04 / 2.0 | 5.8 / 0.03 / 2.8 | 5.7/5.8/5.7/5.8 | 0.103 / 0.103 | 40 | 40 (31) / 0 | 5.9 / 5.8 | 8 | 48 |

### Voice model (speed 1, en 12 / vi 14 chars/s + 0.25 s latency; engaged models)

| lang | line | n | heard % | cut % (mean heard) | flushed % | dropped % | stale % | mean start delay s | lost to (top) |
|---|---|---|---|---|---|---|---|---|---|
| en | prompt | 814 | 80 | 19 (68 %) | 1 | 0 | 0 | 0.55 | praise 74, talkResult 67, cake 12 |
| en | praise | 463 | 100 | 0 (–) | 0 | 0 | 0 | 0.10 |  |
| en | name | 370 | 95 | 5 (91 %) | 0 | 0 | 0 | 0.03 | praise 15, cake 4, wrong 1 |
| en | cake | 261 | 100 | 0 (–) | 0 | 0 | 0 | 0.10 |  |
| en | blow | 261 | 100 | 0 (–) | 0 | 0 | 0 | 1.37 |  |
| en | wrong | 147 | 38 | 61 (77 %) | 1 | 0 | 0 | 0.34 | praise 54, cake 22, wrong 15 |
| en | chapter | 80 | 100 | 0 (–) | 0 | 0 | 0 | 0.10 |  |
| en | weather | 80 | 100 | 0 (–) | 0 | 0 | 0 | 2.38 |  |
| en | deal | 80 | 91 | 9 (70 %) | 0 | 0 | 0 | 2.31 | praise 7 |
| en | talkResult | 80 | 100 | 0 (–) | 0 | 0 | 0 | 0.10 |  |
| en | bee | 40 | 10 | 83 (34 %) | 8 | 0 | 0 | 1.48 | praise 24, beeTap 8, wrong 3 |
| en | gust | 40 | 40 | 53 (57 %) | 8 | 0 | 0 | 2.64 | cake 16, wrong 8 |
| en | hint | 32 | 0 | 50 (21 %) | 50 | 0 | 0 | 3.39 | praise 20, cake 12 |
| en | beeTap | 22 | 36 | 14 (33 %) | 50 | 0 | 0 | 1.02 | praise 13, wrong 1 |
| en | party | 20 | 100 | 0 (–) | 0 | 0 | 0 | 0.10 |  |
| en | sessionDone | 20 | 100 | 0 (–) | 0 | 0 | 0 | 2.45 |  |
| en | idle | 7 | 0 | 100 (44 %) | 0 | 0 | 0 | 0.03 | praise 3, cake 2, wrong 1 |
| vi | prompt | 856 | 79 | 21 (75 %) | 1 | 0 | 0 | 0.65 | praise 107, talkResult 42, cake 33 |
| vi | praise | 487 | 100 | 0 (–) | 0 | 0 | 0 | 0.10 |  |
| vi | name | 351 | 79 | 21 (89 %) | 0 | 0 | 0 | 0.03 | praise 47, cake 21, wrong 4 |
| vi | cake | 269 | 100 | 0 (–) | 0 | 0 | 0 | 0.10 |  |
| vi | blow | 269 | 100 | 0 (–) | 0 | 0 | 0 | 0.85 |  |
| vi | wrong | 140 | 47 | 51 (75 %) | 1 | 0 | 0 | 0.41 | praise 46, cake 17, wrong 11 |
| vi | chapter | 80 | 100 | 0 (–) | 0 | 0 | 0 | 0.10 |  |
| vi | weather | 80 | 100 | 0 (–) | 0 | 0 | 0 | 2.03 |  |
| vi | deal | 80 | 93 | 8 (83 %) | 0 | 0 | 0 | 1.62 | praise 6 |
| vi | talkResult | 80 | 100 | 0 (–) | 0 | 0 | 0 | 0.10 |  |
| vi | gust | 40 | 55 | 38 (51 %) | 8 | 0 | 0 | 2.99 | cake 16, wrong 2 |
| vi | bee | 40 | 25 | 55 (42 %) | 18 | 3 | 0 | 1.86 | praise 24, wrong 3, prompt 2 |
| vi | beeTap | 23 | 22 | 13 (23 %) | 65 | 0 | 0 | 2.37 | praise 13, wrong 3, prompt 2 |
| vi | hint | 20 | 0 | 60 (26 %) | 40 | 0 | 0 | 2.97 | praise 15, cake 5 |
| vi | party | 20 | 100 | 0 (–) | 0 | 0 | 0 | 0.10 |  |
| vi | sessionDone | 20 | 100 | 0 (–) | 0 | 0 | 0 | 1.87 |  |
| vi | idle | 10 | 0 | 100 (43 %) | 0 | 0 | 0 | 0.18 | praise 7, cake 2, wrong 1 |

| lang | prompts heard % / cut by the child's own answer % / lost to another line % (by) | prompt start delay mean p90 s · 1st prompt of a chapter mean p90 s | cake line (count + cherry) heard % / 1st number vs visual count 1 (s, + = voice later) / line ends after towerDone s | blow line heard % / its "fffff" heard after the blow event mean p90 s (candles go out at +0.45) |
|---|---|---|---|
| en | 87 / 12 / 1 (wrong 10) | 0.50 2.37 · 3.65 4.70 | 100 / -0.30 / 3.26 | 100 / 2.48 2.74 |
| vi | 82 / 18 / 0 (prompt 2) | 0.66 1.17 · 3.24 4.30 | 100 / -0.30 / 2.77 | 100 / 2.11 2.26 |

_4 s wall · tests/sim/hs_pt2.js_
