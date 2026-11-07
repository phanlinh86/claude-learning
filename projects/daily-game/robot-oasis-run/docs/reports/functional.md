# Functional QA report: Pebble's Oasis Run (2026-11-07)

Suite: `tests/e2e/functional.js` (Playwright, Chromium, the game opened from `file://`).
Run it with `NODE_PATH=$(npm root -g) node tests/e2e/functional.js` (add `--only=input,pictures` to run some groups).
Screenshots, `results.json` and `run.log` are in `tests/out/functional/`.

**Result of the full run: 233 PASS, 2 FAIL, 3 WARN** (the suite exits with code 1 because of the 2 FAILs). Both FAILs come from one P2 bug: the hero picture shown in play goes stale.

## Summary

| Group | Pass | Fail | Warn | What it covers |
|---|---|---|---|---|
| boot | 6 | 0 | 0 | No console errors. The title demo bot runs and changes lanes. HUD hidden. Play is focused. |
| menus | 29 | 0 | 0 | Play, Change Pictures, How to Play, Settings, Pause/Resume/Restart/Main Menu, Pause→Settings→back, Game Over Play Again/Menu. Esc and back buttons. Music stops on title and on game over. |
| input | 45 | 0 | 1 | ←/→/A/D, ↑/W/Space, held-key auto-repeat, jump buffer, keys ignored while paused. Tap on each third and swipes (left, right, up, from inside a tap zone, quick double swipe, quick double tap), with the mouse **and** with touch (iPhone, `hasTouch`/`isMobile`, CDP touch). Tapping the HUD Pause/Mute buttons does not move or jump Pebble (mouse and touch). Second-finger tap on Pause. |
| scoring | 20 | 0 | 0 | Shell +10, combo event at 10, a bump costs a heart and gives invulnerability (no second hit), Easy has 5 hearts and Normal 3, the Settings difficulty is used. At the chapter goal: +1 heart, +100 bonus and the banner. The chapter is also reached naturally (bot at speed 12). Fizz throws all 4 pillows. Perfect dodge gives a 50×chapter bonus; a hit gives no bonus. Game over at 0 hearts. |
| best | 7 | 0 | 0 | NEW! badge on a new best. Best score survives a reload and is kept per difficulty. No NEW! when below the best or when the score is 0. Reset best needs two taps. |
| lifecycle | 10 | 0 | 0 | Blur and `visibilitychange` pause and suspend audio. No pause on the death frame. Enter spam during the 0.7 s lock does not restart. After the lock, Enter/Space restart exactly once. Music is off after Game over → Menu. `autorestart` works. |
| focus | 10 | 0 | 0 | Space on a focused Play button starts once with no jump. After the HUD mute button is clicked, Space jumps and Enter does nothing. Space/Enter on a focused Resume button resume with no jump. Space on a focused Settings button or difficulty button does what that button does. Enter on title starts once. |
| settings | 12 | 0 | 1 | Sfx, music and difficulty are saved and survive a reload; the full-screen toggle exists and is not saved. `?mute=1` is never written to the saved settings; M under `?mute=1` un-mutes only for the session; M on a normal load is saved. |
| pictures | 19 | **2** | 0 | Generated images uploaded via the file chooser: a PNG photo (becomes Round automatically), a transparent PNG (stays Whole), a 4000×3000 JPEG (background shrunk to ≤1600 px, hero to ≤512 px), a `.txt` file and a broken PNG (both give a friendly toast). Round/Whole toggle, reset one, reset all, persistence across reload. The custom hero, shell and grove/night backgrounds are actually drawn in play. **The hero picture shown in play does not update after a second change (FAIL ×2, issue 1).** |
| layout | 66 | 0 | 0 | 1280×720, 1920×1080, 960×600, 800×1280, iPhone 390×844 and 844×390 (DPR 3, touch), iPad 1024×768 and 768×1024 (touch). Checked on title, How to Play, Settings, Change Pictures, play, pause and game over: no sideways overflow, every button inside the viewport and not covered, HUD buttons visible, clickable and ≥ 30 px. Rotating portrait → landscape re-lays out the canvas, and the tap zones follow. |
| soak | 9 | 0 | 1 | Bot at skill 0.8, Normal, speed 16, for 75 s: chapter 17 reached, 40 Fizz visits, at most 29 objects, at most 94 particles, sprite cache levels off at about 400, zero errors. Hard at skill 0.4: several games with autorestart and no errors. |

The 3 WARNs: the slow-drag swipe window (issue 2), the difficulty highlight under the `?diff=` test flag (issue 4), and the skill-0.8 soak never dying (so autorestart was not exercised there; it is covered in lifecycle, and the balance note is below).

## Issues

### 1. P2: The renderer keeps an old custom Pebble/Seashell picture after you change the picture or its shape
- **Repro:** open Change Pictures and choose a photo for Pebble. The title demo draws it right away, behind the panel. Now press "Whole picture" (or choose another photo), then Done and Play. Pebble still shows the first picture or shape. It only updates after the window is resized or rotated. The Seashell slot has the same bug.
- **Evidence:** `pictures` checks "changing Pebble's picture again shows the NEW picture" (sprite centre was still the yellow of the red photo, `[255,212,0]`, after a blue photo was chosen) and "Round → Whole picture change shows in play" (sprite corner still transparent). Screenshot: `tests/out/functional/pictures_play_after_change.png`.
- **Cause:** `Renderer.spr()` (`game/js/render.js:126-134`) caches rasterized sprites in `this._spr` under keys like `custom:hero|169|169`. That map is only cleared in `resize()` (`render.js:80`). `PO.Assets.setShape/clearCustom/loadCustom` (`game/js/assets.js:147`, `:153`, `:125`) clear only `Assets._cache`. `Game.picturesChanged()` (`game/js/main.js:160`) bumps `Assets._ver`, but only the background key (`render.js:150`) uses `_ver`.
- **Fix:** in `main.js:160` use `picturesChanged() { PO.Assets._ver = (PO.Assets._ver || 0) + 1; if (this.renderer) this.renderer._spr.clear(); }`. Also make the slot actions call it, because the title demo keeps drawing while the panel is open. In `ui.js:181` (shape button) and `ui.js:186` (reset) add `this.game.picturesChanged()`. In `applyFile` (`ui.js:206`) add it after `setCustom`. A more robust alternative is to put the version in the sprite key: in `render.js:128` use `ck = key + '|' + (key.startsWith('custom:') ? (PO.Assets._ver || 0) : '') + '|' + ...`, and bump `_ver` inside `Assets.loadCustom/setShape/clearCustom`.

### 2. P3: The swipe time window is 600 ms; DESIGN §8 says 350 ms
- **Repro:** press, drag 10 px, wait 450 ms, then drag to 40 px. It changes lane (WARN in `input`).
- **Where:** `game/js/main.js:204` (`performance.now() - s.t > 600`).
- **Fix:** use 350, or update DESIGN §8 if 600 was chosen on purpose for small children. Related: a long press (finger resting, then lifted with no movement) still counts as a tap on release (`main.js:209-215`). Consider ignoring "taps" held longer than about 400 ms (`if (performance.now() - s.t > 400) return;` before `this.act(...)`), so a resting thumb does not change lanes.

### 3. P3: Go wrapper: a second launch un-maximizes the running window
- **Where:** `app/main.go:185`. `ShowWindow(hwnd, SW_RESTORE)` turns a maximized window (the default, see `:262`) back to its normal size, and does odd things when the window is in borderless full screen.
- **Fix:** restore only when minimized. Add `procIsIconic = user32.NewProc("IsIconic")` and use `if r, _, _ := procIsIconic.Call(hwnd); r != 0 { procShowWindow.Call(hwnd, swRestore) }`, then `SetForegroundWindow`.
- **Other notes on `app/main.go` (no bugs found):** the storage bridge is sound. `ffStoreSet` validates keys with a regex, caps values at 12 MB and writes atomically (tmp + rename). `ffStoreDel` treats a missing file as success. `ffStoreAll` skips non-matching names. The JS side rolls the in-memory cache back when a save returns `false`. Port fallback works: 47671 → 47681 → 47691 → 47701 → any free port. The mutex check (`h != 0 && err == ERROR_ALREADY_EXISTS`) is correct, and the handle is deliberately kept open. `ffFullscreen` and `ffQuit` marshal to the UI thread with `Dispatch`. One minor point: in the no-WebView2 browser fallback, saved data lives in `localStorage` for `127.0.0.1:<port>`, so if a fallback port is used on a later run the player's saves seem to disappear. This is already acknowledged in the comment at `:211-213`; no action needed.

### 4. P3 (test flag only): With `?diff=…`, the difficulty highlight in Settings does not follow your click
- **Where:** `game/js/ui.js:93`. The highlight uses `game.difficulty()`, which prefers `urlDiff`. The click does save the setting.
- **Fix:** highlight `this.game.settings.difficulty`, or clear `game.urlDiff` when the player picks a difficulty in `setSetting('difficulty', …)`. Real players never see this.

### 5. P3 (cleanup): Unused cache helpers
`PO.Assets.trimSeasons` and `warmSeason` (`assets.js:189`, `:235`) are never called. The sprite cache levels off at about 400 canvases in a 28-chapter run, so this is not a leak. Either remove them or call `trimSeasons([zone, (zone + 1) % 4])` on `levelUp` to trim memory on older iPhones.

### Note for the playtest/mechanics team (not a functional bug)
The bot at skill 0.8 on Normal ran 17 chapters (75 s at speed 16, about 20 min of play) without losing the run. The game is very forgiving at that skill. Check against the casual-player target (skill 0.5) in the playtest report.

## What was verified and has no issues
Zero console errors across all groups and viewports. Every menu path, Esc/back and focus handling works with no double triggers. Every input method works on desktop and touch; HUD taps never leak into steering. Scoring rules, hearts and invulnerability, chapters, Fizz, perfect bonus and game over behave as in DESIGN §5.1. The 0.7 s restart lock holds. There is no pause on the death frame. Settings and best scores persist, and `?mute=1` is never saved. Picture upload covers the error paths and downscaling. All 8 screen sizes fit with no overflow. Objects, particles and caches stay bounded on long runs.
