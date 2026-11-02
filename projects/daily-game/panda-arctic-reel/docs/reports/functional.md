# Functional QA: Bao's Arctic Reel

Suite: `tests/e2e/functional.js` (Playwright, Chromium, `file://`).
Run it with `NODE_PATH=$(npm root -g) node tests/e2e/functional.js [sectionFilter]`.
Screenshots go to `tests/out/func_*.png`. `LONG_RUN_S` sets how many real seconds the ×16 bot run lasts (default 75 s, about 20 simulated minutes).

## Summary

**249 checks: 248 PASS, 1 FAIL** (exit code 1).

| Section | Checks | Result |
|---|---|---|
| Boot / title | 7 | all pass |
| Menus with mouse and keyboard (How to Play, Settings, Change Pictures, Pause, Game over; Esc/Enter/Space; restart lock; no double start) | 25 | all pass |
| Menus with touch (tap, ghost click, HUD) | 11 | all pass |
| Input (Space/↓/S/mouse hold; two keys; right click; HUD never plays; one reel tap per press; key repeat; hooking with a real hold; timed taps; blur and visibility) | 20 | all pass |
| Touch input with CDP multi-touch (hold, second finger, reel taps, Pause with a second finger) | 6 | all pass |
| Rules (hook, Good/Perfect/slip/escape, points 10/20/30/50 +5 per Perfect, counters, zone clear +1 line (max 3), loop, snap and invulnerability, puffers ignored while reeling, game over, no pause during the death moment, best score per difficulty, Reset best) | 30 | all pass |
| Mute and settings persistence (`?mute=1` and `?diff=` never saved, M toggles, reload keeps sound/music/difficulty) | 9 | all pass |
| Change Pictures (transparent PNG kept whole, opaque JPEG made round, `.txt` gives an error toast, 6000×4000 scaled to 1600 / 512 px, Round/Whole, play with a custom hero/gem/puffer/background, reload, Reset, Reset all) | 15 | all pass |
| Layout at 7 sizes (1280×720, 960×540, 1024×768, 2560×1440, iPhone 390×844@3, iPad 1024×1366@2, phone landscape 844×390@3) plus rotating the phone | 119 | all pass |
| Steady 30 fps phone (iOS Low Power Mode) | 2 | **1 FAIL** |
| Long bot run at ×16 (skill 0.9, about 20 simulated minutes) | 6 | all pass: 0 errors, up to level 26–28, at most 125 particles, fx ≤ 2, items ≤ 17 |
| `app/main.go` review | — | `GOOS=windows go vet` is clean; only P3 notes |

The core game works correctly. Every rule in REQUIREMENT.md and DESIGN §5.1 behaves as specified. Input is correct on keyboard, mouse and multi-touch. The menus are robust: a focused button plus Space starts only one game, the ghost click is swallowed, and the 0.7 s restart lock works. Every panel fits on every tested screen without scrolling.

## Issues

### P2-1: The adaptive resolution blurs the game for good on a phone that runs at 30 fps (FAIL)
- **Where:** `game/js/main.js:292-299` (`adapt`), together with `game/js/render.js:65`.
- **Repro:** iPhone 390×844@3 with requestAnimationFrame fixed at 30 Hz. iOS Low Power Mode does exactly this, and so do some older iPads and the WebView2 app on battery saver. Start a game and wait 10 s. The check is `low power (30 fps)` in the suite.
- **What happens:** the frame time is 33 ms, which is above the 22 ms threshold. Every 1.5 s, `adapt()` cuts `renderer.maxPx` to 75 %. It goes 2.09 → 1.57 → 1.18 → 1.0 and stays there. The canvas ends up 560 px wide on a screen 1170 px wide, so everything is drawn at half resolution and looks blurry. `maxPx` is never raised again, even after leaving Low Power Mode or a short busy moment such as decoding a 6000×4000 picture or switching tabs. The long ×16 run shows the same thing: px ends at 1.33 instead of 2.0.
- **Fix:** measure how long the work takes, not the time between vsyncs. Time `step+draw` inside `frame()` (`const t0 = performance.now(); …; const work = performance.now() - t0`) and adapt on `work > 12 ms` rather than on `real > 22 ms`. Also, never go below about `min(1.5, dpr)` on touch devices. Let it recover: if `_ft` stays under 8 ms for 5 s, raise `R.maxPx` by ×1.25 (or set it back to 0 = no cap once it is back at the natural value) and call `R.resize()`. Finally, skip adapting while `this.speed !== 1`, so the test speed-ups do not lower the resolution.

### P3-1: The long bot run never ends a game (balance note, for the playtest team)
- **Repro:** `?bot=1&skill=0.9&speed=16&autorestart=1&seed=21` for 75 s real time, about 20 simulated minutes. It reaches level 26–28 (dive 7+) with 0 game overs (`stats.games` = 0).
- **Why:** the endless difficulty stops growing after about level 5. `loopSpeedCap` is 1.4, `pufferMaxCap` is 4 on normal, `pufferMin` is 5 s, and `reelWidthMin` is 0.20. A good player can play forever and the best score just grows with time.
- **Fix (`game/js/world.js:79-81, 99-141`):** keep ramping after the cap in small steps. For example, add `+1 pufferMaxCap per loop up to 6` and let `reelWidthMin` shrink 0.01 per loop down to 0.14. Or accept this as intended for a kids' game and say so in DESIGN.

### P3-2: The game-over "Menu" button has no restart lock
- **Where:** `game/js/ui.js:42` (`btnOverMenu`, compared with `btnAgain` on line 41).
- **Repro:** lose the last line while tapping quickly. The over panel appears with Menu under the finger, and a tap within 0.7 s sends the child back to the title.
- **Fix:** `click('btnOverMenu', () => { if (game.canRestart()) game.toTitle(); });`

### P3-3: The Change Pictures "Whole picture / Round" buttons are 32 px tall on phones
- **Where:** `game/css/style.css` (`@media (pointer:coarse) .slot .shape button{min-height:32px}`).
- **Repro:** phone landscape 844×390, Change Pictures. These buttons are 32 px tall. Apple's guideline is 44 px, and every other button meets it.
- **Fix:** use `min-height:40px` for the shape buttons, and in the short-landscape media query put them in one row with `.slot .shape{gap:4px}`. There is still room, as the screenshot `func_phone_landscape_scrCustom.png` shows.

### P3-4: Dead code and leftover CSS from another game
- **Where:** `game/css/style.css`. The "Kit's Toybox Beat theme / additions" blocks (`.action-btn`, `.offset`, `.set-offset`, `canvas#game{background:#f6d2c4}`) do not apply to this game. `game/js/ui.js:96` (`fmtOffset`) is never used.
- **Fix:** delete them. Make the canvas background `#1d3a6b` again, so a letter-box frame before the first draw is navy instead of pink.

### P3-5: `app/main.go` review (Windows WebView2 wrapper)
`GOOS=windows go vet .` is clean, and `app/web` is identical to `game/`. I found no P1 or P2 bugs. The store writes are atomic (tmp + rename), keys are checked against a whitelist, values are capped at 12 MB and the store is mutex-protected. Notes:
1. **Browser fallback loses saves if port 47619 is busy** (`main.go:212-215`). With no WebView2, the game runs in the default browser and uses `localStorage`, which is tied to the origin `127.0.0.1:<port>`. If the fixed port is taken, a random port is used and the best scores and pictures disappear. Fix: in fallback mode, retry 47619 a few times, or tell the player that saves need the fixed port.
2. **A wrong error message when the data folder cannot be created** (`main.go:202`). The `MkdirAll` error is ignored. If it fails, every `Set` returns false, and the game shows "Not enough room to save that picture". Fix: on error, show a `messageBox` with the real path, or fall back to `os.TempDir()`.
3. **Single-instance race** (`main.go:178-190`). A second launch during the first one's start-up finds no window yet and exits silently. Fix: retry `FindWindowW` a few times with a 200 ms sleep before giving up. This is cosmetic.
4. **`ffFullscreen` returns the requested state, not the real one** (`main.go:261-264`). That is fine today, because JS never reads it. Keep it in mind if Settings ever shows the real window state.

## Notes on how the suite works (for future runs)
- Rule checks freeze the game clock with `PR.debug.setSpeed(0)` and drive `world.update()` by hand. Note that `world.update(dt)` caps a single call at 0.25 s (`CONFIG.maxFrame`), so the suite loops in 0.05 s steps.
- Multi-touch uses CDP `Input.dispatchTouchEvent`. In this Chromium, `touchEnd` with a list of points lifts *those* points.
- Layout checks convert Bao's sprite box, the score plate, the zone pill and the reel meter, all taken from the renderer's own math, into CSS pixels. They test those against `#hud` and the viewport. Every panel is opened at every size and must fit without scrolling.

## Applied by the integrator (2026-11-02)
- P2-1 fixed: `adapt()` measures work time (step+draw), never goes below ~2/3 of the natural resolution on touch, recovers, and is off at test speeds. The `low power (30 fps)` check now passes.
- P3-2 fixed (Menu respects the 0.7 s restart lock), P3-3 (shape buttons 40 px), P3-4 (leftover CSS and `fmtOffset` removed, navy canvas background).
- First-run difficulty is now Easy (playtest suggestion); `sRules` sets Normal explicitly. Re-run: all sections pass (243 + 30/30 in sRules after the fix).
- P3-1 (endless loops never end for a strong bot) and the main.go notes are left as they are (by design / minor).
