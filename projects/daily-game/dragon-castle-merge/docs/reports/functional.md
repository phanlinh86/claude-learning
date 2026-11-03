# Functional QA: Ember's Glow Castle

Suite: `tests/e2e/functional.js` (Playwright + the preinstalled Chromium, `file://`).
Run: `node tests/e2e/functional.js [sectionFilter]` (filters: `static`, `boot`, `menus`, `input`, `touch`, `rules`, `settings`, `pictures`, `layout`, `longrun`).
Screenshots: `tests/out/func_*.png`. `LONG_RUN_S` sets the real seconds of the ×16 bot run (default 60). A full run takes about 5 minutes.
The suite records every world event the game loop handles (`window._ev`) and counts real `startGame()` calls, so it can check "exactly one drop / one start".

## Summary

**358 checks: 355 PASS, 3 FAIL** (exit code 1). The 3 failures are one real layout bug (P2-1) at 3 pixel densities.
Stable: every section was run 3–8 times after fixing two races in the test itself (see "Test notes"), with the same result every time.

| Section | Checks | Result |
|---|---|---|
| Static review: `app/main.go` (port 47620 + free-port fallback, `%APPDATA%\EmbersGlowCastle\data`, bindings, single instance, WebView2 fallback, key filter vs the game's keys) and iOS kid-proofing in HTML/CSS/icons | 10 | all pass; `GOOS=windows go vet ./...` clean |
| Boot (title, demo bot, HUD hidden, Easy by default, no Quit in the browser, gesture/contextmenu/dblclick/touchmove blocked on the stage but panels can scroll) | 11 | all pass, 0 console errors |
| Menus, mouse + keyboard (How to Play, Settings, Change Pictures, Pause, Settings-from-Pause, Restart, Main Menu, Game over; Esc/P/Enter/Space; focused Play + Space or Enter starts exactly one game; 0.7 s restart lock for Enter, Space, Play Again and Menu; Esc/blur during the death pause ignored) | 33 | all pass |
| Input (mouse move aims, also in Ember's strip; click drops in the clicked column; right click ignored; click beside the board clamps; ←/→/A/D aim and clamp; Space/↓/Enter/S drop; digits 1–5, 6/0 ignored; key auto-repeat = one drop; aim during the flight; busy drops buffered (latest only); HUD Pause/Mute never drop and never re-aim; Space/Enter after clicking Mute drop instead of re-pressing Mute; M; blur and visibilitychange pause; a press interrupted by blur does not drop) | 35 | all pass |
| Touch (390×844@3, CDP touch: menus survive the ghost click, tap a column, slide then lift drops in the last column and not while sliding, a finger that starts on Mute and slides onto the board does nothing, HUD taps don't drop, Pause with a second finger, Play Again / Menu by tap) | 16 | all pass |
| Rules (points formula; 1+1 → 2 = +10; group of 3 → tier 3 = 30 × 1.1 combo = 33; cascade 10 + 22; combo reset + comboBreak; combo 5 → Boo carries; full column refuses (oops, nothing dropped, held kept); full column with matching top accepts; real goal: candle → +80 +100, level 1, tidy-up removes tier 1; gotoLevel 2/3/4 incl. loop; game over; best per difficulty incl. NEW!/lower score; Hard = 6 rows; Reset best needs two taps) | 21 | all pass |
| Settings & test flags (`?mute=1` not saved; M toggles and saves; sfx/music/difficulty survive reload (state, controls and `EG.Audio`); saved difficulty used; `?diff=hard` used but never saved; no other flag stored) | 10 | all pass |
| Change Pictures (transparent PNG → hero "fit"; opaque picture → light, round; text file and broken PNG → friendly toast, nothing stored; 4000×3000 → background 1600×1200 JPEG, Boo ≤ 512 px; Round/Whole; bot plays with all custom pictures incl. Boo; default scenes for other places; survives reload; Reset one; Reset all) | 18 | all pass |
| Layout: 1280×720, 1920×1080, 1024×768, 768×1024, 390×844, 844×390, each at DPR 1/2/3 (canvas/board on screen, HUD buttons ≥ 44 px and clear of the board, drawn HUD panels clear of board and buttons, portrait HUD clear of Ember, backing store sharp); all 6 panels at DPR 2 (fit, buttons visible, finger-sized on touch); live rotation | 194 | **3 FAIL** (P2-1, iPad portrait at DPR 1/2/3) |
| Long run `?bot=1&speed=16&autorestart=1&diff=hard&skill=0.5&seed=21`, 60 s real | 10 | all pass: 15.9 simulated minutes, 3 games, levels 3/3/3, 423 merges, 12 Boo visits, ≤ 101 particles, fx ≤ 1, items ≤ 30, never stuck, 0 errors |

The game logic and input layer are solid. Everything in REQUIREMENT.md and DESIGN §5.1/§5.4/§8 that can be driven from a browser behaves as specified: scoring matches the formula exactly, refuse/game over/goal/level-up/tidy-up are correct, the restart lock and focus handling never double-start, HUD buttons never leak a drop to the stage (mouse, touch, or a slide from the HUD), and custom pictures (including bad and huge files) are handled gracefully.

## Issues

### P2-1: On iPad in portrait, the HUD strip is drawn over Ember and the held light (FAIL)
- **Where:** `game/js/world.js:27,279` (`topPortrait: 190` is too small for a 104 px cell) together with `game/js/render.js:544-555` (portrait HUD: strip 92 px tall + the combo row at `top+118` + the "rise in" row at `top+150`).
- **Repro:** 768×1024 (any DPR; same for 1024×1366 and 820×1180, every iPad with aspect ≥ 0.6 gets the 720-wide view). Start a game. Screenshot: `tests/out/func_ipad_port_768x1024_play.png`. Check: `layout ipad_port_768x1024@Nx: portrait HUD strip clear of Ember's flight band`.
- **What happens:** logical view 720×960, cell 101, board top 193, Ember's centre at y 97, so her horns start at y ≈ 16 and the held light ends at y ≈ 196. The HUD strip covers y 12–104 and the "Boo ●●●●●" combo row (y ≈ 130) and "rise in N" row (y ≈ 162) are drawn right across her body. The HUD is drawn after Ember, so her head is hidden behind the translucent score panel and the "Boo" label sits on her face. On phones (560-wide view) there is plenty of room, which is why only iPads show it.
- **Fix (pick one, both are small):**
  1. In `World.computeLayout`, reserve room for the HUD *and* Ember in portrait instead of a fixed 190: Ember's visible top is `emberY − 0.80·cell`, so the board top must be ≥ `hudBottom + 1.75·cell`:
     ```js
     // portrait: HUD (≈ 180 px incl. combo + rise rows) + Ember (1.75 cells) above the board
     if (portrait) cell = M.floor(M.min((h - pad - C.hudPortrait) / (rows + 1.75), (w - C.sideMargin) / cols, C.maxCell));
     ```
     with `hudPortrait: 180`. iPad: cell 82 (board 410 × 574), phones stay at the 104 cap (no change).
  2. Or keep the bigger board and make the HUD shorter: draw the combo dots and the "rise in" counter inside the 92 px strip (e.g. under the score, left of the goal ring) and use `hudPortrait: 112` in the formula above → iPad cell 90.
  Either way, add the safe-area top inset (`renderer.ins.top`) to the reserved height (the world does not know it today; pass it via `setLayout(w, h, insets)`) so a notched iPhone in portrait cannot hit the same problem.

### P3-1: `?diff=` shows the wrong difficulty in Settings, and choosing one there has no effect
- **Where:** `game/js/ui.js:93` (`syncSettings` highlights `settings.difficulty`) vs `game/js/main.js:45` (`difficulty()` prefers `urlDiff`).
- **Repro:** open `?diff=hard`, open Settings: "Easy" (the saved value) is highlighted although every game is Hard; tapping "Normal" saves Normal but the next game is still Hard.
- **Fix:** test flag only, so low priority. Either highlight `game.difficulty()` and show a small "(test: hard)" tag, or clear `urlDiff` in `setSetting('difficulty', …)` (`if (k === 'difficulty') this.urlDiff = null;`).

### P3-2: With `?seed=N&autorestart=1` every auto-restarted game is the identical game
- **Where:** `game/js/main.js:47` (`makeWorld` uses `this.seed` for every game) and `:83` (bot seed fixed at 11).
- **Repro:** the long run: 3 games, scores `[8174, 8174, 8174]`, lengths 292.0/292.0/292.1 s. A soak test with a seed therefore only ever exercises one game.
- **Fix:** `const s = seed != null ? seed : (this.seed != null ? this.seed + this.stats.games * 7919 : …)` (and the same offset for the bot seed). Runs stay reproducible but each game differs.

### P3-3 (exe wrapper): the browser fallback shows a Quit button that cannot work, and loses saves if port 47620 is busy
- **Where:** `app/main.go:227` (`?app=1` is added to the URL also for the browser fallback at `:247`) → `game/js/main.js:14` makes `isApp` true → `ui.js:76` shows Quit → `main.js:166` `window.close()` is ignored by a tab the user did not open by script. Also `main.go:212-214`: when 47620 is taken, the free port changes the page origin, so the browser fallback's `localStorage` (best scores, pictures) is a fresh, empty one each time.
- **Fix:** only show Quit when `typeof window.ffQuit === 'function'` (drop the `?app=1` test from `isApp`, or set `isApp` from the bindings). For the fallback, retry 47620 for ~1 s before falling back, or show a note that scores may not be kept. Rare path (WebView2 is part of Windows 11), so P3.

### Observations (no action needed)
- `app/main.go`: port 47620 with a free-port fallback, data in `%APPDATA%\EmbersGlowCastle\data` (`LOCALAPPDATA\EmbersGlowCastle\WebView2` for the browser profile), atomic temp-file + rename writes, 12 MB value cap, key filter `^[a-zA-Z0-9_\-]{1,64}$` accepts every key the game writes (`settings`, `best_*`, `img_*`, `shape_*`), single-instance mutex, `Cache-Control: no-store`. `GOOS=windows go vet` is clean.
- iOS kid-proofing is complete: no zoom (`user-scalable=no`, `gesturestart` blocked), no rubber-band (`overscroll-behavior:none`, `touchmove` blocked outside panels), no callouts / text selection / tap highlight, double-tap zoom blocked, context menu blocked, `visibilitychange` pauses and suspends audio, home-screen icons and manifest exist.
- Bot balance (for the playtest team): at skill 0.5 on Hard the bot always reaches the Star Tower (level 3) and makes stars but never the moon; a game lasts ≈ 4.9 simulated minutes.

## Test notes (bugs found in the test, now fixed)
- `UI.show()` focuses the screen's main button 30 ms later. Focusing another button right after closing a menu raced with it and Enter then pressed Play (a game started). The suite now waits 80 ms after each close. Not a game bug: no real user acts within 30 ms.
- `page.click()` waits for the game-over panel's pop animation to settle, which sometimes took longer than the 0.7 s restart lock, so the "clicks within 0.7 s are ignored" check flaked. It now clicks the button centres with raw mouse events (≈ 160 ms after game over).
- The panel-fit check waits 750 ms: the `.45 s` pop animation overshoots (scale > 1) near its end and measured the title 2 px wider than the screen.
- The long run uses Hard + skill 0.5 + a fixed seed: with a random seed and a weaker bot, one game can last the whole 60 s (the bot reached level 6), so "several games" was not reliable.
