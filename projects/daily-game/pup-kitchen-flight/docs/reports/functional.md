# Functional QA: Biscuit's Kitchen Flight

Suite: `tests/e2e/functional.js` (Playwright + Chromium, file:// URL). Run it with `node tests/e2e/functional.js`. A full run takes about 5 minutes. To run only some sections, use `--only=menus,focus,inputs,scoring,settings,pictures,layout,autopause,soak`. To change the length of the bot run, use `--soak=60`.
The suite prints PASS/FAIL for each check and exits 1 on any failure. It writes no files.

## Summary

| Run | Checks | Passed | Failed |
|---|---|---|---|
| Full run 1 | 227 | 222 | 5 |
| Full run 2 | 227 | 221 | 6 (the extra failure is bug 1 showing up as a console error) |

Every failure comes from a real game bug listed below; none is a flaky test. The second run had one more failure because bug 1 is a race at boot: it sometimes adds a console error to a random page's "zero console errors" check.

| Section | Result |
|---|---|
| menus: boot, title bot demo, How to Play / Settings / Change Pictures / Pause / Pause→Settings / Restart / Main Menu / Game Over open and close, Esc/P pause and resume | all pass except the boot-race check (bug 1) |
| focus: Space/Enter on focused Play / Play Again start exactly once without a puff; the 0.7 s restart lock holds for Enter, Space and click; a focused Menu/How/Settings button does its own job; a HUD button focused by a click does not take Space | all pass |
| inputs: Space, ↑, W, Enter, mouse click (2 places) each puff exactly once (counted at `Game.flap`, so the 50 ms world cooldown cannot hide a double input); held Space/↑ puff once; right click, M, HUD mute and HUD pause never puff; touch on iPhone 13 and iPad Pro 11 landscape: taps puff once, HUD taps never puff, no ghost click | all pass |
| scoring: leaf +1, pass +1 (once), bump costs exactly one battery with a 1.5 s blink and no second cost while still overlapping, counter bump costs one / free during the blink, battery back on the 15th leaf (never above 3), level change after 60 s, +5 only for a clean level, banner, renderer and weather zone, `gotoLevel(3)` darkness > 0.5 (0.62 deep night), round 2 "Day 2", last battery → down → over, no puff while down, Game Over shows score/best/medal, medal thresholds | all pass |
| settings: sound, music and difficulty persist across reload; M mutes and the mute persists; `?mute=1` is never saved; best is saved per difficulty with NEW!; no best is saved for `?bot=1`, `?speed=`, `?level=`, `?diff=` or `debug.setSpeed`; reset best needs two taps and disarms after 3 s | all pass |
| pictures: transparent PNG → whole picture; opaque JPEG → round 512 sticker; 5000×4000 JPEG → wall 1600×1280; 5000×4000 PNG → Biscuit 512×410; a .txt file and a corrupt PNG show an error toast and keep the old picture; Round/Whole buttons work; the game draws `custom:pup`, `custom:leaf` and the custom wall; pictures survive a reload; Reset and Reset all restore the defaults and clear storage | all pass |
| layout: 1280×720@1, 1920×1080@2, 2560×1440@1, 800×600, iPhone 13 landscape, iPhone SE landscape, iPad Pro 11 landscape and portrait, iPhone 13 portrait. Checked: every menu fits, HUD buttons on screen and ≥ 44 px on touch, canvas covers the viewport, no horizontal scroll, backing store ≤ 1920×1080, rotate card | desktop and iPad pass; **iPhone 13 and iPhone SE landscape fail** (bugs 3, 4); iPhone portrait rotate card works |
| autopause: blur and visibilitychange pause while playing; stays paused when the tab comes back; nothing happens in Get Ready, on the over frames, on the Game Over screen or on the title | all pass except the powered-down float (bug 2) |
| soak: 60 s at `?speed=16&bot=1&skill=0.3&autorestart=1&autostart=1` | pass: 10–11 games, scores 5–458, up to level 4, max 163 particles (cap 260), at most 7 juice effects, zero errors, no best saved |

Notes on test setup (these are not bugs):
- `?bot=1&autorestart=1` without `autostart=1` stays on the title, so the bot only plays the attract demo. The suite adds `autostart=1`.
- At skill 1 the bot never dies in 16 game-minutes, which matches the design ("survive 10 minutes"), so the soak test uses `skill=0.3` to finish several games.

## Bugs

### 1. P2: TypeError at boot when the late zone art loads before the first resize
- **What happens:** the console shows `TypeError: Cannot read properties of undefined (reading 'outside_rainy@1.0000')`. It is intermittent; the suite caught it in roughly 1 of 3 page loads that use autostart, and once on iPhone 13. That zone is then not prewarmed (a small hitch at the first level change), and the error makes "zero console errors" fail.
- **Cause:** `Renderer` never initialises `this._bgCache` in its constructor (`game/js/render.js:29-40`); only `resize()` sets it (`render.js:59`). `Assets.loadAll()` starts loading the rainy/windy/snowy outside art in the background and calls `BKF.Game.renderer.prewarm(1)` when it finishes (`game/js/assets.js:117`). Boot still awaits `loadCustom()` before `relayout()` (`game/js/main.js:32-35`), so the idle callback can run first, and `_layer()` reads `this._bgCache[ck]` (`render.js:81`) while it is undefined.
- **Repro:** this always fails: `new BKF.Renderer(document.createElement('canvas'))._layer('room_wall',1200,540)` throws. Natural repro: reload `index.html?autostart=1&mute=1` a few times and watch the console.
- **Fix:** in the constructor add `this._bgCache = {};` (for example next to `this.custom = null;` at render.js:39). Optionally, also have `prewarm()` return early when `!this._bgCache`.

### 2. P3: The pause menu can open while Biscuit is powering down (blur, Esc, P or the HUD pause button)
- **What happens:** after the last battery is lost, the world is in phase `down` for about 1.2–1.8 s while Biscuit floats to the counter. During that time, switching apps, pressing Esc/P or tapping ⏸ opens the Pause menu over the "Zzz…" float. Resuming then plays the rest of the fall and the game over. Nothing breaks, but it delays the game over and contradicts the rule that the down/over frames cannot be paused. `pause()` already blocks the over frames (`deadT >= 0`), just not `down`.
- **Repro:** play, lose the last battery, and press Esc (or blur the window) before Game Over appears. The Pause screen shows `{mode:'paused', phase:'down'}`.
- **Location:** `game/js/main.js:104-106`.
- **Fix:** `if (this.world && (this.world.phase === 'down' || this.world.phase === 'over' || this.deadT >= 0)) return;`. Also hide `#hud` on the `down` event (`main.js:255`, `BKF.UI.setHud(false)`), so the ⏸ button is not offered while it does nothing.

### 3. P2: Change Pictures on landscape phones: Done and Reset all are below the fold, and the Kitchen wall card overflows
- **What happens:** on iPhone 13 landscape the panel needs 23 px of scrolling and on iPhone SE landscape 36 px. **Done** and **Reset all** are cut off at the bottom edge, so a parent has to discover that the panel scrolls. On every landscape screen, desktop included, the 3 cards are laid out 2 + 1, and the third card (Kitchen wall) is only a quarter of the width. Its Choose…/Reset buttons spill outside the card (visible on the iPhone 13 and SE screenshots).
- **Cause:** a rule left over from a 6-slot sister game: `style.css:363-368`, `@media (min-aspect-ratio:1/1){ .slot{grid-column:span 6} .slot:nth-child(n+3){grid-column:span 3} }`. The comment there still mentions "Zippy and the jungle friends".
- **Repro:** iPhone 13 landscape → Change Pictures.
- **Fix:** replace that block with three equal cards in one row, which also gets rid of the second row (enough to fit the panel):
  ```css
  @media (min-aspect-ratio: 1/1){ .slot,.slot:nth-child(n+3){grid-column:span 4} }
  ```

### 4. P3: iPhone SE landscape (568×320): the How to Play OK button is cut off by 17 px, and the title icon is 6 px off the top
- **What happens:** "OK, let's play!" sits partly under the bottom edge, so the panel has to be scrolled. On the title, `.title-wrap` starts at y = −6, so the propeller of the bobbing pup icon is clipped. The buttons are fine.
- **Location:** `style.css:320-332` (`@media (max-height:430px)` How rules) and `style.css:241-245` (title).
- **Fix:** inside `@media (max-height:340px)`, use `#scrHow .how-grid{grid-template-columns:1fr 1fr}` with `#scrHow .how p{font-size:12px;line-height:1.2}` and `#scrHow .panel h2{font-size:calc(var(--u)*2.6)}`, or hide the 4th tip on such screens. For the title, add `.title-icon{width:calc(var(--u)*5.5);height:calc(var(--u)*5.5)}` (or `display:none`) under `max-height:340px`.

### 5. P3: Small cleanups found while reading the code
- `game/js/assets.js:1-2` contains a stale duplicate header that names "Zippy's Jungle Boop".
- The custom-wall cache in `render.js:99-104` adds one full-screen canvas for every picture change (the key includes `Assets._ver`) and only frees them on resize. Changing the wall many times without resizing keeps several screen-sized canvases in memory. **Fix:** delete the old `cw@` keys in `picturesChanged()` (`main.js:170`), or clear `renderer._bgCache` there.
- `assets.js:129`: when a stored picture fails to decode, `customSrc[slot]` is left stale. **Fix:** also `delete this.customSrc[s.id]`.

## Windows wrapper review (`app/main.go`), report only

This is a code review only; the wrapper was not built or run here.
- **Bindings:** `bkStoreAll`, `bkStoreSet`, `bkStoreDel`, `bkFullscreen` and `bkQuit` match what `storage.js` and `main.js` expect: `bkStoreAll` → map, `Set`/`Del` → bool, and `false` triggers the JS rollback. The key regex `^[a-zA-Z0-9_\-]{1,64}$` accepts every key the game uses (`settings`, `best_easy`, `img_pup`, `shape_pup`…). The 12 MB value cap is well above a 1600 px JPEG data URL (< 1.5 MB measured).
- **Data dir:** `%APPDATA%\BiscuitsKitchenFlight\data`, falling back to `%TEMP%`. Writes are atomic (tmp + rename) under a mutex. One issue: when the temp fallback's `MkdirAll` also fails, the error is ignored and every save then silently returns false. That is acceptable, because the JS shows "Not enough room…" for pictures.
- **Port fallback:** tries 48011/48021/48031/48041, then `:0`. That works. One issue: the comment at lines 218–220 is duplicated (P3).
- **P3:** `bkFullscreen` returns the *requested* state before the dispatched `fsc.set` runs, which is fine for the JS. But F11 is also handled by the page: `main.js:180` calls `setFullscreen(!this.fullscreen)`. If the window is maximised and `GetWindowPlacement` fails, the restore uses a zeroed placement. Consider checking the return value of `procGetWindowPlace.Call` and skipping `SetWindowPlacement` when it is 0.
- **P3:** the browser fallback (no WebView2) opens the URL without `?app=1`, so storage is localStorage on `http://127.0.0.1:<port>`. When a fixed port is taken and `:0` is used, the saves are lost on the next run because the origin changes. This is already noted in the comments and is rare.
- **P3 (security, minor):** the loopback HTTP server serves the game to any local process. It is static and read-only, so this is fine. The bindings exist only inside the WebView, and the WebView only navigates to the embedded game, which has no external links.
- No issues with `singleInstance` (mutex + FindWindow + restore only if minimised), the DPI manifest (PerMonitorV2) or start-maximised.
