# Functional QA — Mossy's Egg Grove (2026-11-25)

Suite: `tests/e2e/functional.js` (Playwright + Chromium, game served from `game/` by a tiny node http server).
Run: `node tests/e2e/functional.js` (full, 60 s soak, about 3.5 min) or `--quick` (15 s soak, 4 layouts).
Raw results: `tests/out/functional.json`; screenshots: `tests/out/func_*.png`.

## Result

| Run | Checks | Pass | Fail |
|---|---|---|---|
| `functional.js` (full) | 220 | 219 | 1 (P2-1, layout safe area) |
| `node shared/daily-mobile/test_extras.js projects/daily-game/dragon-fairy-merge` | all | all | 0 ("EXTRAS PASSED") |

Zero console, page or frame errors in every section.

### What the suite covers (all green unless listed under Issues)
- **Boot:** title, bot demo behind the menu, every menu `<img>` loads, Play focused, every DESIGN §6 `MEG.debug` hook is present.
- **Menus:** How to Play, Settings and Change Pictures open and close with Esc and with the back button. Pause works with Esc, P and the HUD button. Pause → Settings → Esc goes back to Pause (the game does not resume). Restart, Main Menu, Game over → Menu and Play Again all work.
- **Desktop input:**
  - Hovering moves Mossy and a click drops. A second click during the cooldown is ignored.
  - Pressing (pointerdown) on Pause or the sound button never starts a drag or a drop.
  - ←/→ move Mossy. Space, ↓ and Enter each drop exactly one egg. Holding Space drops only once.
- **Start guards:**
  - Space or Enter on the focused Play button starts exactly one game, with no stray drop.
  - Space on the focused Settings button opens Settings.
  - Enter and Play Again are ignored for 0.7 s after game over, then start one game.
  - Enter on the focused Menu button goes to the menu and does not restart.
- **Touch** (844×390, DPR 3, `hasTouch`/`isMobile`):
  - Pressing moves Mossy there and sliding steers him. Neither drops until release, and release drops under the finger.
  - Tapping Pause or Resume causes no ghost drop.
  - A second finger can tap Pause while the first finger is steering.
- **Rules** (`MEG.debug`, stepped synchronously):
  - Two touching kind-1 eggs merge into one kind-2 egg for +3. A chain merge gives a combo (3 + 6 + 1). Different kinds never merge.
  - Two kind-8 eggs hatch for +100 and both are removed.
  - `setWind` bends a falling egg's path left and right while a calm drop falls straight. Resting eggs do not move during an 8 u/s² gust. `predictDrop` bends with the wind.
  - Fairy rescues before game over: Easy 2, Normal 1, Hard 0. Danger rises above the vine and decays after the egg comes down. A real pile-over leads to the Game Over screen after the 1.6 s beat.
  - `gotoLevel(2)` switches the zone, renderer visuals and banner. Level 5 is winter loop 2 with stronger wind. A score level-up (through a merge) and `gotoLevel` both keep the eggs.
- **Pause:** world time is frozen while paused, with no time jump on resume. `blur` and `visibilitychange` (hidden) auto-pause, and the game stays paused when the page comes back. Blur clears a held arrow key. Blur on the title does nothing.
- **Persistence:**
  - Sound off, music off, Hard and mute (M) all survive a reload.
  - `?mute=1&diff=easy` apply for the visit only and are never written, even when another setting is changed during that visit.
  - Best scores are kept per difficulty, with NEW! only on a real best. `?bot=1` and `debug.setBot(true)` runs never write a best. Reset best needs two taps.
- **Change Pictures:**
  - PNGs work for the hero, the egg (including the Round shape) and all four seasons.
  - A text file renamed `.png` and a `.txt` file both show a friendly toast and leave the slot unchanged.
  - A 4000×3000 picture is accepted and downscaled: backgrounds to a long edge ≤ 1600, the hero to ≤ 512 px.
  - Custom pictures persist across a reload. The game runs with them through all seasons and a hatch. Single Reset and Reset all both work.
- **Layout** at 960×540, 1366×768, 1920×1080 and touch 844×390, 390×844, 1024×768, 1366×1024 (DPR 2–3, with simulated notch and home-bar insets on touch):
  - No panel overflows and every button is reachable.
  - The playable nest frame (x −0.7…9.7, y −0.3…14) is visible.
  - The HUD is inside the viewport and the safe area, with buttons ≥ 44 px on touch.
  - Touch slide + release drops on every layout. The Pause panel and a long Game Over panel fit.
- **Soak** (`?speed=16&bot=1&autostart=1&autorestart=1`, 60 s real):
  - 2 games finished and auto-restarted (scores 1695 and 2810, levels 5 and 8), with 611 drops, 543 merges, 1 hatch, 4 rescues and maxKind 8.
  - At most 19 eggs, 91 particles and 5 fx at once. No NaN, no egg outside the nest, no stall, and no best score written.
  - One bot game lasts about 300 s of game time (about 19 s real at ×16), so the 15 s `--quick` soak checks "bot plays" instead of "games finished".

## Issues

### P2-1 — Landscape iPhone: the nest floor sits under the home indicator
- **Repro:** 844×390 touch landscape with safe-area insets `{right 47, bottom 21, left 47}` (simulated on `#safeProbe`), then `relayout()`. The nest floor lip (world y −0.3) ends at 382 px, but the safe area ends at 369 px. The bottom row of eggs and the floor sit in the home-indicator strip, where a swipe up while dragging can trigger the iOS home gesture. Screenshot: `tests/out/func_phone_landscape_844_390_play_safe.png`. This is the suite's only failing check.
- **Where:** `game/js/render.js:87-88`. The landscape branch ignores `I.bottom` (and `I.top`). Only the portrait branch uses the insets.
- **Fix:**
  ```js
  const room = v.VH - I.top - I.bottom;
  this.unit = Math.min(room / 15.2, v.VW / 22);
  this.groundPx = Math.round(v.VH - I.bottom - 0.6 * this.unit - Math.max(0, room - 15.2 * this.unit) * 0.3);
  ```

### P3-1 — The DESIGN §2 frame bottom (y −0.9 u) is never fully visible: the nest base is cropped
- **Repro:** at every layout the bottom of the DESIGN frame is below the screen. It sits at 551 px on a 540 px screen, 784/768, 1102/1080, 398/390, 764/768 − 20 inset, and 1019/1024 − 20 inset. With `groundPx = VH − 0.6·unit`, only 0.6 u of base fits under the floor. DESIGN asks for 0.9 u, and `nest.svg` draws 1.3 u (y 568–620 = 52 px / 40). Play is unaffected; it is cosmetic only (the woven base is cut by the screen edge).
- **Where:** `game/js/render.js:88` against `docs/DESIGN.md` §2.
- **Fix:** use `0.9 * this.unit` (and keep `unit = min((VH − insets) / 15.5, VW / 22)` so the top still fits). Alternatively, change DESIGN to say y −0.6.

### P3-2 — With `?diff=` the Settings screen highlights the saved difficulty, not the one being played
- **Repro:** save Hard, then open `index.html?diff=easy` → Settings. "Hard" is highlighted while the game and the title best use Easy.
- **Where:** `game/js/ui.js:94` (`syncSettings` reads `game.settings.difficulty`).
- **Fix:** highlight `game.difficulty()` and add a small "(test flag)" hint when `game.urlDiff` is set. Do not save it.

### P3-3 — Two fingers lifted at the same instant: the steering finger drops an egg before Pause opens
- **Repro:** finger 1 steers on the canvas and finger 2 is on Pause. Release both in one `touchEnd` (CDP). The `pointerup` events come in order id 1 (stage → `dropNow`) then id 2 (Pause), so one egg drops and then the game pauses. Lifting the Pause finger first works correctly (tested).
- **Where:** `game/js/main.js:218-223`.
- **Fix (optional):** defer the drop in `up` by one frame (`requestAnimationFrame(() => { if (this.playerCanAct()) this.dropNow(); })`). The Pause tap, handled in the same frame, then wins.

### Go wrapper (`app/main.go`) review — no functional bugs found
- The port fallback loop, the atomic `.tmp` → rename store, the key regex, the 12 MB value cap, the single-instance mutex, and fullscreen running on the UI thread through `Dispatch` all look correct.
- **P3-4:** in the exe's borderless fullscreen, Esc pauses the game but does not leave fullscreen, and only F11 does. Kids and parents expect Esc to exit. Fix: in `main.js:179`, when `this.fullscreen && this.isApp`, make the first Esc call `setFullscreen(false)` (or document F11 in the pause panel).
- **P3-5 (informational):** in the browser fallback (no WebView2), saves go to `localStorage` at `127.0.0.1:48613` instead of `%APPDATA%`, and the server stops when the message box is closed. This is intended and the message explains it, so no change is needed.
- **P3-6 (informational):** `http.FileServer` serves `.webmanifest` with a sniffed `text/plain` type. Add `mime.AddExtensionType(".webmanifest", "application/manifest+json")` to silence a possible WebView2 manifest warning. It is harmless today.
