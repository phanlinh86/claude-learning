# Clover's Farm Hop — Functional QA report

Suite: `tests/e2e/functional.js` (Playwright + chromium, `file://` with `--allow-file-access-from-files`).
Run: `node tests/e2e/functional.js [boot menus keys pointer rules levels wind settings custom focus native layout soak]`. It exits 1 on any FAIL. Screenshots and the generated test pictures go to `tests/out/functional/`.

## Summary

| | Count |
|---|---|
| Checks | 513 per full run (about 6 min) |
| PASS | 500 |
| FAIL | 3 (2 bugs) |
| WARN | 9 (6 soft issues) |

The suite was run in full twice and the soak group three more times, and every run gave the same result. Notes on reliability:
- The touch tests send multi-finger input through CDP `Input.dispatchTouchEvent`. In CDP, `touchEnd` lists the fingers being lifted.
- Headless Chromium has no notch, so the iPhone and iPad layout checks fake the safe-area insets by overriding `#safeProbe`, `.screen` and `.panel`.

**Works correctly:**
- **Boot and menus:**
  - The game boots to the title with zero console errors.
  - Every menu path works: Play, Change Pictures, How to Play, Settings, Pause, Resume, Restart, Main Menu, Play Again and Menu on game over.
  - The keys Esc, P, M, F11, and Enter/Space on game over all work.
  - The 0.7 s restart lock blocks clicks, Enter, Space and Menu.
- **Keyboard steering:** ←/→ and A/D work, including the fallback when one of two held keys is released. Blur and a hidden tab both pause the game and clear the input.
- **Mouse and touch steering:**
  - Holding either half of the screen with the mouse or with a finger steers.
  - With several fingers down, the latest finger wins, and lifting it falls back to the finger still down.
  - Sliding a finger across the middle switches direction.
  - Tapping the HUD Mute or Pause button with a second finger never steers.
  - There are no ghost clicks.
- **Game rules:**
  - Clover bounces with vy = bounceV exactly on the platform top. She passes up through one-way platforms and lands on them from above.
  - A firefly gives +10 points and +1 lantern. The 20th firefly gives +1 heart (capped at the maximum).
  - A fall costs one heart, and the trampoline brings Clover back on screen. Losing the last heart leads to game over.
  - The score always equals metres + 10 × fireflies + level bonuses.
- **Levels:**
  - With the bot on Easy at skill 1, all 4 weather levels are reached by climbing, followed by the loop (level 5 is Sunny again, round 2, goal +10 %).
  - The visuals, banner, weather particles and music switch at every level.
  - Levels take about 45–55 s of game time each.
- **Wind:**
  - Each gust goes warn → blow → calm, in both directions.
  - The vane shows only while a gust is warning or blowing.
  - The gust pushes Clover with no input and also drives the weather particles.
- **Settings:**
  - Sound effects, music and difficulty persist across a reload.
  - `?mute=1` and `?diff=` are never saved.
  - The best score is kept per difficulty, and Reset needs two taps (it disarms after 3 s).
- **Change Pictures:**
  - The hero, firefly and all 4 backgrounds can be set with the file chooser or by drag & drop.
  - A 6000×4000 picture is downscaled (to ≤1600 px for backgrounds, ≤512 px for the hero).
  - A text file and a broken .png are refused with a friendly message.
  - Custom pictures persist across a reload, show in gameplay (hero, firefly, each level's sky) and survive a fall and rescue with no errors.
  - Reset one and Reset all work.
  - All 6 pictures use 1.6 M characters of localStorage.
- **Layout:** at all 7 sizes and DPRs:
  - the canvas is letterboxed correctly and fills the window;
  - there is no page scroll;
  - the HUD buttons are ≥ 44 px and sit inside the canvas and the safe area;
  - the canvas HUD pills don't overlap the buttons;
  - the panels and toast stay inside the window;
  - rotating the device re-lays out the screen.
- **Soak test** (`?speed=16`, autorestart, bot skill 0.3, about 370–410 s of game time, 7–12 games): zero errors, and every count stayed bounded. Maximums: particles ≤ 97, platforms ≤ 22, fireflies ≤ 17, sprite cache ≤ 330 entries, JS heap about 6 MB.
- **Focus and double triggers:** Space or Enter on a focused Play or Play Again button starts the game exactly once (holding Enter too). Space and Enter after mouse-clicking the HUD mute button do nothing. Default focus never lands on a destructive button. Esc during the game-over fall does nothing.
- **Native bridge** (with a fake `ffStore*`):
  - Saved data loads from disk, and writes go to `ffStoreSet`.
  - A failed `set` rolls back with a "not enough room" toast.
  - If an older write fails after a newer one succeeded, the newer value is kept.
  - `ffStoreAll` failing falls back to localStorage.
  - F11 calls `ffFullscreen(true/false)` and Quit calls `ffQuit`.

## Issues

### P2-1 Stale preview in Change Pictures after picking a second photo (or after Reset)
- **Repro:**
  1. Change Pictures → Clover → Choose… → pick a red photo (opaque, so it becomes "Round").
  2. Choose… again and pick a blue photo. The card still shows the red picture, although gameplay uses the blue one.
  3. The same happens after **Reset**: choosing a new photo shows the old picture.
- **Cause:** `game/js/assets.js:163`. The thumbnail cache key is `slot|shape|WxH` of the processed canvas, and "Round" pictures are always 512×512. Two photos therefore get the same key, and the old data URL is returned. `clearCustom` (`assets.js:154`) never clears `_thumbs`.
- **Fix:** In `loadCustom()` and `clearCustom()`, run `this._thumbs = {}` (or `delete this._thumbs[slotId]`). Alternatively, put a version counter that `setCustom`/`setShape` bump into the key.
- Caught by: `custom` group (2 checks).

### P2-2 `FH.debug.getState()` throws (DESIGN §5.4 test hook)
- **Repro:** `FH.debug.getState()` → `TypeError: Cannot read properties of undefined (reading 'length')`.
- **Cause:** `game/js/main.js:332` reads `Game.renderer.fx.length`, but the Renderer has no `fx` property (it has `texts`, `rings` and `flyers`).
- **Fix:** `st.fx = Game.renderer.texts.length + Game.renderer.rings.length + Game.renderer.flyers.length;`
- Caught by: `boot` group.

### P3-1 Bot/test runs overwrite the player's best score
- **Repro:** Open `?bot=1&autostart=1&diff=hard`. When the bot dies, `best_hard` is written to the player's storage.
- **Cause:** `game/js/main.js:118` saves the best score unconditionally. DESIGN §5.4 says test flags are never saved.
- **Fix:** `if (newBest && !this.botMode && this.speed === 1) FH.Storage.set(...)`. At minimum skip it when `this.botMode`.

### P3-2 Enter on the title does nothing once Play has lost focus
- **Repro:** On the title, click the background (Play loses focus), then press Enter. Nothing happens; Space works.
- **Cause:** `main.js:191` handles only `Space` on the title.
- **Fix:** `(e.code === 'Space' || e.code === 'Enter')`, with the same `f.id !== 'btnPlay'` guard.

### P3-3 A held arrow key does not steer after Resume
- **Repro:** Hold →, press Esc twice (pause, then resume) while still holding →. Clover doesn't steer until the key is pressed again.
- **Cause:** `pause()` calls `clearInput()` (`main.js:168`), and auto-repeat keydowns are ignored (`!e.repeat`).
- **Fix:** Keep the keyboard entries in `_order` while paused (only `blur`/`visibilitychange` should drop them), and call `applySteer()` in `resume()`. Alternatively, accept a repeat keydown when its id is missing from `_order`.

### P3-4 With `?diff=…`, the difficulty buttons look broken
- **Repro:** Open `?diff=hard`, go to Settings and tap Normal. "Hard" stays highlighted; Normal is saved but not shown.
- **Cause:** `game/js/ui.js:93` highlights `game.difficulty()`, which returns the URL value.
- **Fix:** Highlight `settings.difficulty` instead. Optionally, clear `urlDiff` when the player picks a difficulty.

### P3-5 Change Pictures cards on phones
- **Card overflow:** At 390×844 and 844×390, 2–3 picture cards are 1–2 px narrower than their contents. The Choose…/Reset buttons sit flush against the card edge (`style.css:263`, `:268`).
  - **Fix:** Add `.slot .btns{max-width:100%;flex-wrap:wrap}` with `gap:4px`, and give `.slot .btn` `flex:0 1 auto`.
- **Panel needs scrolling:** With a real notch and home bar (safe-area insets of 47/34 px), the Change Pictures panel must scroll on iPhone, in both portrait and landscape. It does scroll and nothing is clipped, but Done is below the fold in landscape.
  - **Fix:** In `@media (max-height:430px)`, shrink `.slot .prev` further, or put the bottom 3 background cards on one row with the first three.

### P3-6 `Storage.del()` doesn't keep memory and disk in sync on failure
- **Behaviour:** `game/js/storage.js:52` deletes from the cache even when `ffStoreDel` returns false. The picture or best score then disappears for this session but comes back after a restart.
- **Fix:** Mirror `set()`: remember the previous value and restore it when the call returns false or rejects (with the same `_seq` guard).

### Review notes: `app/main.go`, `storage.js` (no blocking issues)
- The store is solid:
  - keys are checked against `^[a-zA-Z0-9_-]{1,64}$`, and values are capped at 12 MB;
  - `Set` writes a temporary file and renames it over the old one under a mutex;
  - `Del` treats a missing file as success;
  - `All` skips foreign files.
- The bindings are set up before `Navigate`, so `ffStoreAll` exists at boot.
- The single-instance mutex prevents two copies from racing on the same save folder.
- The fixed ports (47731/41/51/61) keep the fallback browser's origin stable.
- `app/web` is identical to `game/` (`diff -rq` is empty).
- Optional hardening:
  - call `f.Sync()` before the rename in `store.Set` (a power cut can leave an empty file on NTFS);
  - `ffStoreAll` could log read errors.
- `storage.js set()`: rollback, the sequence guard and rejection handling are all verified by the `native` group.
