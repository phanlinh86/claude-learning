# Functional QA: Juno's Moon Stack

Suite: `tests/e2e/functional.js` (run `node tests/e2e/functional.js [section]`, `LONG_RUN_S=60` by default; screenshots go to `tests/out/func_*.png`).
Date: 2026-11-04. Chromium headless, opened from file://.

## Summary: 252 passed, 9 failed (5 distinct issues: 0 × P1, 1 × P2, 4 × P3)

| Section | Result | Notes |
|---|---|---|
| static (Go wrapper, iOS meta, assets) | 10/11 | one P3: the browser fallback sets `?app=1` |
| boot | 4/4 | zero console errors; the title demo plays; Play has focus |
| menus (title, How to Play, Settings, Change Pictures, Pause, Game over; back button + Esc) | 21/21 | Esc from Settings opened in Pause goes back to Pause |
| input (click, Space, Enter, ↓, key repeat, HUD clicks, focus + Space/Enter, 0.7 s restart lock, right-click) | 18/19 | one P3: Enter on the focused Menu button |
| touch (390×844 @3x) | 10/10 | ghost clicks are swallowed; taps on Play, Pause or Mute never drop a crate |
| rules (scoring, coin, goal bonus, level change, heart reward) | 14/14 | the score ledger matches exactly (500 = 500); goal bonus 100 on planet 1 and 600 on level 7; Rusty Dunes loads |
| hearts / game over | 7/7 | a miss costs exactly 1 heart and 1 grow step; Esc during the game-over delay does not pause |
| pause (Esc, P, blur, visibilitychange) | 11/11 | the world freezes; after resume time continues with no jump |
| settings persistence | 10/11 | `?mute=1` and `?diff=` are never saved ✔; one P3 display issue that only appears with test URLs |
| best per difficulty | 8/9 | one P3: the HUD "Best" after a difficulty change mid-run |
| pictures (hero, crate, coin, bg_moon; txt, broken PNG, 4000×3000; reset one, reset all; reload; gameplay) | 18/18 | backgrounds are reduced to 1600×1200 JPEG, characters to ≤ 512 px |
| layout (1280×720, 1024×768, 1920×1080 @1x; 390×844 @3x; 820×1180 and 1180×820 @2x; rotation) | 111/116 | **P2: the HUD panels cover Juno's dome** on 5 of 6 sizes |
| long run (speed 16, autorestart, normal, skill 0.5, 60 s) | 9/9 | 9 games, 15.6 simulated minutes, max particles 80, fx ≤ 6, crates ≤ 14, no errors |

## Issues

### P2-1: HUD panels draw over Juno's saucer dome
- **Where it happens:** 1280×720, 1024×768, 1920×1080, iPad portrait 820×1180 and iPad landscape 1180×820. The phone at 390×844 is fine.
- **Repro:** `?autostart=1&diff=normal` at 1280×720. Wait until the saucer swings to the far left or the centre. The score panel (left end of the swing) or the planet panel (centre) covers the top 40–66 css px of the glass dome and Juno's ears (see `tests/out/func_1280x720_play.png`). On iPad portrait the planet panel (logical y 120…198) covers the dome along the whole swing, by 37 px.
- **Cause:**
  - `game/js/world.js:168` places the saucer at `saucerScreenY = 0.17·h + 34` (landscape) or `0.20·h + 34` (portrait). The dome top is about 0.43·S above that point (S = 1.55·unit·scale, and grows up to ×1.4).
  - `game/js/render.js:563` and `:577` place the panels at y 12…110 in landscape and at 12…110 plus 120…198 in portrait.
  - `drawHud` runs after `drawSaucer` (`render.js:312` vs `:301`).
- **Fix:** derive the saucer line from the HUD's bottom edge in `World.computeLayout`. Landscape: `saucerScreenY = Math.max(0.17*h + 34, 122 + 0.62*unit*1.4)`. Portrait: `saucerScreenY = Math.max(0.20*h + 34, 210 + 0.62*unit*1.4)` (0.62 ≈ the dome top relative to the 1.55·unit sprite, including the grow ×1.4). Then re-check `topLine` and the fall band (`world.js:350`) so the held crate keeps its gap. Alternative: draw the panels with lower alpha whenever the saucer is under them.

### P3-1: Enter/Space on a focused "Menu" button on the game-over screen starts a new game
- **Repro:** reach game over and wait 0.8 s. Tab to "Menu" (or call `focus()` on it) and press Enter: a new game starts instead of opening the title.
- **Cause:** `game/js/main.js:185` handles Enter/Space whenever the game is over and calls `preventDefault()`, so the focused button never receives its click.
- **Fix:** ignore the key when another button has focus, as the title screen already does:
  `const f = document.activeElement; if (f && f.tagName === 'BUTTON' && f.id !== 'btnAgain') return;` (place it before `startGame`).

### P3-2: The HUD "Best" switches to another difficulty when Settings changes mid-run
- **Repro:** start a run on Easy, open Pause, then Settings, and pick Hard. The HUD now shows best_hard (560) while the run still counts toward best_easy (120). The save itself is correct because it uses `runDifficulty`.
- **Cause:** `game/js/render.js:559` calls `MS.Game.best()`, which reads `this.difficulty()` (`main.js:135`).
- **Fix:** change it to `best(d) { return parseInt(MS.Storage.get('best_' + (d || this.difficulty()), '0'), 10) || 0; }`. In `drawHud`, call `MS.Game.best(MS.Game.runDifficulty)`.

### P3-3: The browser fallback in the Go wrapper opens `?app=1`, so the game shows a Quit button that does nothing
- **Where:** `app/main.go:227` builds one URL with `?app=1`, and `:247` opens that same URL in the default browser when WebView2 is missing. In a browser tab, `isApp` is true, so Quit is shown, and `window.close()` cannot close a tab it did not open. The full-screen row is also forced on.
- **Fix:** `base := "http://" + ln.Addr().String() + "/index.html"`. Pass `base + "?app=1"` to `w.Navigate`, and give `base` to the fallback.
- **Rest of the Go review is OK:**
  - atomic tmp+rename writes behind a mutex
  - a key regex that blocks path traversal
  - a 12 MB value cap
  - a single-instance mutex
  - a fixed port with a free-port fallback
  - `Cache-Control: no-store`
  - all storage keys the game uses match the key filter
  - Minor: when the fallback port is used, the origin changes, so browser-fallback saves would not carry over between runs. This only matters for the rare no-WebView2 case.

### P3-4 (test-only): with `?diff=`, Settings highlights the saved difficulty, not the one being played
- **Repro:** `?diff=normal` on a fresh profile, then open Settings: **Easy** is highlighted, but the game plays Normal. Tapping another difficulty has no effect on play while the URL flag is set.
- **Where:** `game/js/ui.js:93`.
- **Fix:** highlight `this.game.difficulty()`. When `game.urlDiff` is set, add a "(test URL)" note or disable the segment. Players never see this.

### Note for visual QA (not a failed check)
A photo picked for the **crate** is set to the "Round" shape automatically (`game/js/assets.js:144`, opaque corners → `circle`). The crate renderer cover-crops it into the 3:2 box, so the round sticker's white border appears as cut-off arcs (`tests/out/func_custom_play.png`). Suggested fix: default `crate` to `fit`, or skip the circle crop for the crate slot.

## Verified OK (highlights)
- **Input:**
  - holding Space for 1.4 s drops one crate
  - two quick presses never drop more than two
  - Space/Enter on the title starts exactly once and drops nothing
  - the 0.7 s lock blocks both Enter and Play Again
  - right-click does nothing
  - HUD Pause and Mute (mouse and touch) never drop a crate
- **Scoring:**
  - first perfect = +20
  - second perfect = +30
  - edge landing = +10 and resets the combo
  - coin = +5
  - the combo cap is applied
  - +1 heart back on a new planet
- **Settings and best:**
  - sfx, music, difficulty and mute survive a reload
  - `?mute=1` and `?diff=` are never written to `jms:settings`
  - each difficulty keeps its own best
  - Reset best needs two taps
- **Pictures:**
  - txt and broken PNG files show friendly toasts and store nothing
  - Reset one and Reset all clear both storage and memory
  - custom pictures survive a reload and render in play
- **Layout:**
  - all menus fit on all 6 sizes; buttons are ≥ 44 px on touch
  - the canvas is sharp at each DPR and the page never scrolls
  - the saucer stays on screen across its whole swing, and the tower top stays visible
  - rotating from landscape to portrait re-anchors the tower
