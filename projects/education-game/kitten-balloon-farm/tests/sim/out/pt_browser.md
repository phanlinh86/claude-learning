## pt_browser: real Chromium (Playwright), mobile emulation with touch


### A. ?speed=8&bot=1&autostart=1&autorestart=1&mute=1 (bot skill 0.8), 2 sessions per device × age (18 sessions)

Headless Chromium, software rendering, on a shared 2-core machine (load ≈ 5) — fps here is a lower bound, not an iPhone figure.

| device | age | sessions finished | wall s per session | rAF fps | frames > 22 ms | worst frame ms | game slowFrames / frames | render quality after adapt | rounds | correct / wrong | console errors |
|---|---|---|---|---|---|---|---|---|---|---|---|
| iphoneP 393×852 @3 | 3 | 2 | 20.0, 19.3 | 46 | 13.4% | 500 | 247 / 1821 | 0.52 | 33 | 60 / 17 | 0 |
| iphoneP | 4 | 2 | 21.4, 21.3 | 45 | 15.8% | 567 | 311 / 1952 | 0.52 | 33 | 87 / 13 | 0 |
| iphoneP | 5 | 2 | 22.9, 22.2 | 42 | 21.1% | 367 | 401 / 1884 | 0.52 | 32 | 104 / 9 | 0 |
| iphoneL 852×393 @3 | 3 | 2 | 19.2, 21.1 | 37 | 22.4% | 433 | 342 / 1512 | 0.52 | 33 | 60 / 13 | 0 |
| iphoneL | 4 | 2 | 23.0, 20.8 | 43 | 14.6% | 417 | 280 / 1891 | 0.52 | 32 | 86 / 12 | 0 |
| iphoneL | 5 | 2 | 22.3, 21.7 | 55 | 8.2% | 83 | 209 / 2494 | 0.72 | 33 | 105 / 9 | 0 |
| ipadL 1180×820 @2 | 3 | 2 | 16.8, 17.4 | 50 | 15.7% | 133 | 279 / 1760 | 0.61 | 33 | 61 / 4 | 0 |
| ipadL | 4 | 2 | 19.2, 19.8 | 51 | 13.9% | 100 | 289 / 2054 | 0.61 | 33 | 87 / 9 | 0 |
| ipadL | 5 | 2 | 21.4, 21.5 | 52 | 12.8% | 267 | 290 / 2231 | 0.61 | 32 | 104 / 18 | 0 |

18/18 sessions finished with autorestart, 0 console errors, adaptive quality stepped down as designed (never below 0.5).

### B. Played by real touch taps at speed 2 (page.touchscreen.tap on KB.debug.balloonScreen)

- **iphoneP, age 4**: ended in mode `done` after 116 s wall; stats {"sessions":1,"rounds":16,"correct":38,"wrong":1,"misses":0,"talks":4,"talkRight":4,"frames":6499,"slowFrames":422}; console errors 0
  - tap on rising balloon (riseU 0.41): popped
  - wrong tap L0 R2 (colors): correct 0, wrong 1
  - talk L0: tapped answer
  - string tap L1 R1 (shapes): correct 1, wrong 0
  - talk L1: tapped answer
  - talk L2: tapped answer
  - talk L3: tapped answer
- **iphoneL, age 3**: ended in mode `done` after 103 s wall; stats {"sessions":1,"rounds":16,"correct":30,"wrong":1,"misses":0,"talks":4,"talkRight":4,"frames":5705,"slowFrames":422}; console errors 0
  - tap on rising balloon (riseU 0.34): IGNORED (no feedback)
  - wrong tap L0 R2 (colors): correct 0, wrong 1
  - talk L0: tapped answer
  - string tap L1 R1 (size): correct 1, wrong 0
  - talk L1: tapped answer
  - talk L2: tapped answer
  - talk L3: tapped answer

Screenshots of run B (title, each topic, wrong tap, string tap, friends, Talk, done) were looked at during the review; they are not kept in the repo (re-create with `node tests/sim/pt_browser.js --only B`, written to tests/sim/out/pt_shots/).
