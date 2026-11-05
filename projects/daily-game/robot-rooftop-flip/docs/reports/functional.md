# Bolt's Rooftop Flip: functional QA report

Suite: `tests/e2e/functional.js` (Playwright, Chromium, `file://` + `--allow-file-access-from-files`).
Run it with `node tests/e2e/functional.js [section]`. It takes about 4 min 50 s. Screenshots go to `tests/out/func_*.png`. The default long run is `LONG_RUN_S=75` real seconds at ×16.

## Results (2 full runs, identical results each time)

**334 passed, 3 failed.** All 3 failures are real bugs (listed below), and the same 3 failed in both runs. The other 334 checks passed both times, so none of them is flaky.

| Section | Checks | Result |
|---|---|---|
| static (Go wrapper, iOS meta, 61 default SVGs) | 14 | pass |
| boot (title demo bot, Play focused, zero console errors) | 4 | pass |
| menus (How to Play / Settings / Change Pictures: open, back, Esc; pause menu; game-over buttons) | 22 | pass |
| input (mouse click; Space/↑/↓/Enter/W/S; key repeat; right click; HUD mute/pause never flip; focused mute + Space/Enter flips and doesn't re-toggle; focused Resume + Enter; title Space/Enter start once; focused How + Space) | 20 | pass |
| touch (390×844 @3x: ghost click, tap Play doesn't flip, tap stage flips once, HUD taps) | 11 | pass |
| mech (headless world in the page: flight 0.37 s, 0.18 s buffer, early press dropped, double press = one flip, 0.12 s coyote, late press → fall + drone, no flips during rescue, invuln after rescue, resize mid-flip / on the rail, fairness scan on all 3 difficulties) | 12 | pass |
| rules (own colour +10×mult, ×2 at combo 5, ×5 cap, wrong = 0 pts + comboBreak on Normal, gate changes colour, mid-air catch, Easy keeps the combo, Easy = 5 batteries) | 12 | pass |
| hearts (vent bump, sign untouched, gap fall + rescue, finish → finish/heartGain/levelUp, bonus 100 / 200 / 400 (round 2), max batteries, gotoLevel 3/0/5 switches the scene, last battery fall → game over) | 15 | pass |
| pause (Esc, P, frozen time, pause mid-flip, blur, visibilitychange, no pause on the death frame by Esc/blur/P) | 15 | pass |
| over (score/best/NEW!/medal/stats numbers, 0.7 s restart lock, Enter/Space restart once, focused Menu + Enter) | 11 | pass |
| settings (persist sfx/music/difficulty/mute across reload; `?mute=1`/`?diff=` never saved; Reset best needs 2 taps) | 14 | pass |
| best (per difficulty, survives reload, run keeps its start difficulty, `?diff=hard` saves to best_hard) | 6 | pass |
| pictures (6 slots, photo → round, cut-out → whole, bg JPEG, .txt and broken PNG → friendly error, 6000×4000 → 1600×1067 bg / ≤512 char, shape buttons, the custom pictures actually render (pixel checks on Bolt, a firefly and the sky), reload, Reset, Reset all) | 21 | pass |
| layout: 1280×720, 960×540, 1920×1080 @1x/@2x, iPad 1024×768 / 768×1024 @2x, iPhone 390×844 / 844×390 @3x (no page scroll, HUD buttons ≥ 44 px, Bolt on both surfaces on screen, rail and roofs on screen, HUD panels inside the canvas, clear of pause/mute and of each other, above the corridor, canvas sharp, all 6 menus fit, touch buttons ≥ 32 px) | 144 | **2 fail** |
| rotate (real page: landscape→portrait and portrait→iPad mid-flip in slow motion, a skill-1 bot through 8 rotations with 0 falls/bumps, the `_pump` race) | 6 | **1 fail** |
| long run (`?speed=16&bot=1&skill=0.5&autorestart=1&diff=normal`, ≈19 min of game time, 11 games, levels up to Night) | 10 | pass |

Long-run numbers: at most 92 weather particles (cap is 140) and at most 9 renderer fx+texts. At most 9 obstacles, 59 fireflies, 7 spans and 11 hazards were alive at once. No game stalled, every auto-restart worked, there were no errors, and the scores ranged from 390 to 5190.

Wrapper review (`app/main.go`, static checks only):
- Port: 47622, with a free-port fallback.
- Folders: `%APPDATA%\BoltsRooftopFlip\data`, plus WebView2 data in `%LOCALAPPDATA%\BoltsRooftopFlip\WebView2`.
- Single-instance mutex: `Local\BoltsRooftopFlip.SingleInstance`. The `FindWindowW` title matches the window title.
- Bindings: `ffStoreAll/Set/Del/Fullscreen/Quit`.
- Writes are atomic (tmp + rename), the key filter accepts every `brf` key, and the browser fallback strips `?app=1`.
- `build.sh` builds `dist/BoltsRooftopFlip.exe`.

**No wrapper bugs found.**

## Issues

### P2-1: Uncaught TypeError in `RF.Assets._pump` after a resize, rotate, DPR change or F11
- **Where:** `game/js/assets.js:194-195` (`do { const [key, w, h, ck] = this._wq.shift(); …`), triggered by `assets.js:175` (`setScale` clears `this._wq`).
- **Repro:**
  1. Start the game, then call `RF.Assets.warm([['vent_0',77,61]]); RF.Assets.setScale(RF.Assets.scale*1.37)`.
  2. Wait 300 ms.
  3. Result: `TypeError: undefined is not iterable` (uncaught, in the idle callback).
  - In real play this happens on iPhone/iPad rotation (`tests/out` rotate section; seen in about 1 of 2 rotation runs), on window resize or F11, and whenever a time-of-day `prewarm` is queued when `Renderer.resize` runs.
  - iOS Safari has no `requestIdleCallback`, so the `setTimeout` fallback makes the window even wider there.
- **Effect:** a console error every time it happens, and that idle batch is dropped. It does not crash the frame loop, because it runs outside `frame()`. It would still show up as an error in the WebView2 app and on any error reporting.
- **Fix:** make the loop safe on an empty queue:
  ```js
  while (this._wq.length) {
    const [key, w, h, ck] = this._wq.shift();
    if (!this._cache.has(ck)) { const c = this._raster(key, w, h, ck); if (c) { /* probe draw */ } }
    if (dl.timeRemaining() <= 12) break;
  }
  ```
  The simpler alternative is `const it = this._wq.shift(); if (!it) break;` at the top of the existing `do`.

### P2-2: How to Play doesn't fit an iPhone in landscape; the "OK, let's play!" button is below the fold
- **Where:** `game/css/style.css`. The `@media (max-height:430px)` blocks (lines ~198, 234, 293) shrink Settings and Change Pictures but not `#scrHow`. The text size comes from `.how p` at lines 106 and 250 (`max(14px, …)`).
- **Repro:** 844×390 @3x with touch, then title → How to Play. The panel is 374 px tall and scrolls, and only the top of the green button shows (`tests/out/func_iphone_land_844x390@3_scrHow.png`). A 4-year-old won't know to scroll a panel inside a game.
- **Fix:** add these rules inside `@media (max-height:430px)`:
  - `#scrHow .panel{padding:8px 16px}`
  - `#scrHow .panel h2{font-size:calc(var(--u)*3.2);margin-bottom:4px}`
  - `#scrHow .how-ico{display:none}`, or shrink the icons to about 28 px
  - `#scrHow .how p{font-size:13px;line-height:1.25}`
  - `#scrHow .how-grid{gap:6px}`

  Alternatively, keep the button outside the scroll area by making the grid the scrollable part: `.how-grid{overflow:auto;max-height:calc(100dvh - 140px)}`.

### P3-1: The game-over "NEW!" badge overflows the panel on iPhone landscape (horizontal scroll, badge clipped)
- **Where:** `game/css/style.css:193` (`.new-best{right:calc(var(--u)*-5.6);…}`), together with `.panel{overflow:auto}` at line 26.
- **Repro:** 844×390 @3x, then a game over with a new best (realistic numbers, e.g. a score of 2480). The panel `scrollWidth` is 457 against a `clientWidth` of 455, so the panel can be dragged sideways by 2 px. At the 6-digit width in the screenshot the badge sits right on the clipped edge.
- **Fix:** keep the badge inside the score box. For example, use `.new-best{right:0;top:calc(var(--u)*-1.6)}` in the mobile block, or place it under the Best number (`position:static;margin-left:6px`).

### P3-2 (note): under a `?diff=` test URL, choosing another difficulty in Settings looks ignored
- **Where:** `game/js/ui.js:83-84` (`syncSettings` highlights `game.difficulty()`, which returns the URL value).
- **Repro:** open `?diff=normal`, then Settings → tap Hard. Hard is saved, but Normal stays highlighted. This happens only with the test flag, so players never see it. The suite asserts the current behaviour, where the highlight shows what is actually played.
- **Fix (optional):** while `urlDiff` is set, show a small "(test URL)" note next to the difficulty row, or highlight the saved value with an outline style.

## What I confirmed works (highlights)
- **Input:**
  - Exactly one flip per press: key repeat is ignored, HUD taps never flip, the ghost click is swallowed, and a focused button never double-starts a game.
  - The 0.18 s buffer and the 0.12 s coyote time behave as specified.
  - A flip is refused during the drone rescue.
- **Resize and rotate:** a resize or rotate mid-flip re-anchors Bolt (screen x = `heroX`), and he lands on the intended surface with no fall or bump. A skill-1 bot survives 8 rotations without a hit.
- **Game-over delay:** pause is impossible during the 1.6 s death delay, and the 0.7 s restart lock holds against Enter, Space and the button.
- **Saved data:**
  - Best scores are saved per run difficulty, even if the difficulty is changed mid-run.
  - The test flags are never written to settings.
- **Custom pictures** render in play: pixel checks confirmed the red photo on Bolt, the green firefly sticker and the custom Dawn sky. The 6000×4000 photo is stored at 1600×1067 for a background and at ≤ 512 px for a character.
