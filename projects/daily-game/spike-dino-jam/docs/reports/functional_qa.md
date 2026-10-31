# Spike's Dino Jam: functional QA report

Suite: `tests/e2e/functional.js` (Playwright + Chromium, opens `game/index.html` from disk).
Run it with `node tests/e2e/functional.js [--quick] [--only=boot,keyboard,mouse,touch,ghost,scoring,pause,settings,custom,layout,focus,long]`.
Screenshots go to `tests/out/functional/`. The suite exits 1 if any check fails.

## Result (full run, 60 s long run)
**351 PASS / 4 FAIL.** Every failure is a real game bug; none are test flakes. The issues are listed below.

| Group | What it covers | Result |
|---|---|---|
| boot | zero console errors, every DJ.debug hook, title bot demo, How to Play / Settings / Change Pictures / Pause / Game Over screens and their back navigation (button + Esc) | all pass |
| keyboard | arrows + WASD steer smoothly (eased, no snap), diagonals, heading kept after release, Space/Enter kickflip (hop ≈ jumpHeight, no flip while recharging, auto-repeat ignored), Esc/P pause, M mute, Enter/Space restart with the 0.7 s lock (exactly one start) | all pass |
| mouse | cursor follow (reaches the target, carves around it), left click ≠ kickflip, right-click = kickflip, hovering the HUD does not steer, HUD pause/sound, Space after clicking the sound button = kickflip only | all pass |
| touch (iPad 1180×820@2, CDP multi-touch) | one finger steers and drags, a 2nd finger kickflips and never steers, lifting it keeps steering, on-screen kickflip button (fires, never steers, honours recharge, shows charge), HUD pause with a 2nd finger while steering | 1 fail (issue 2) |
| ghost (iPhone 390×844@3) | taps on How/Settings/Change Pictures/Back/Pause/Settings Done/Menu: the delayed click never hits the new screen, no file picker or setting changed | all pass |
| scoring | note = 10 + 2×trail, gold ×3, regrab 5, no pickups during "ready", bonk −1 heart + trail cut + loose notes + invuln, no bonk while invulnerable, airborne, or within safeNeck, pillow hit = no heart and 3 notes knocked off, dodge +15, `bossNow()` gives 3 pillows inside the arena, song complete gives cleared, bonus hearts×100 and +1 heart, next biome (weather/music/background/banner switch), gotoLevel 2–5 incl. lap, speed scaling | all pass |
| pause / over | pause freezes time, no time jump on resume, blur and visibilitychange pause, held keys cleared, Restart, Main Menu, no pause / kickflip on the death frame, game over after ≈1.4 s, score/best/NEW/medal/stats, double-click Play Again gives one game, best per difficulty (also when changed mid-run) | all pass |
| settings | defaults, toggles reach audio, persist across reload (sound, music, difficulty), Hard config applied, M mute saved, `?mute=1` never saved, all localStorage keys start with `sdj:`, Reset best | 1 fail (issue 3) |
| custom | 7 slots, JPEG photo becomes a round sticker (≤ 512 px, transparent corners), transparent PNG stays "Whole picture", Round/Whole toggle, text file and corrupt PNG give friendly errors and keep the old picture, 4000×3000 is downscaled to ≤ 1280×720, custom Spike/note/trail notes/pillow/meadow drawn in play (pixel probes), swamp stays default, Reset one, Reset all (background cache invalidated), persists after reload | all pass |
| layout | 1280×720, 1920×1080, 1366×768, 800×600 @1; iPhone 390×844 and 844×390 @3; iPad 820×1180 and 1180×820 @2: canvas fills the window, backing-store cap, menus fit, renderer arena == world.arena, HUD texts vs buttons/hearts, HUD buttons ≥ 44 px, kickflip button ≥ 66 px and inside the screen, no-spawn circle covers it (3000 spawn samples), bot run with every step checked (Spike/notes/trail/pillows inside, no idle note under the button), rotation mid-game with a finger down (arena re-synced, all inside, finger released), live desktop resize | 1 fail (issue 4) |
| focus | Space/Enter on the title start one game, then kickflip only, Settings focus, Space/Enter on Pause resume without a kickflip, Enter on Game Over gives one start | 1 fail (issue 1) |
| long | 60 s at 16× (`bot=1&speed=16&autorestart=1&autostart=1&mute=1`): no errors, ≈970 s simulated, particles ≤ 68, fx ≤ 22, notes ≤ 2, pillows ≤ 3, texts ≤ 2, trail ≤ songMax; forced death auto-restarts | all pass |

Observation for the playtest team (not a functional bug): at skill 1 on Normal the bot **never lost** in ≈970 s of simulated play and reached level 23 (lap 6). Auto-restart therefore never happened by itself, so the suite forces a death to test it.

## Issues

### 1. P2: pressing Enter or Space in Settings wipes every best score
- **Repro:** set some best scores, open Settings from the title or from Pause, press Enter (or Space). `best_easy`, `best_normal` and `best_hard` are all deleted with no confirmation.
- **Cause:** `ui.js:100` focuses `querySelector('.btn-big, .btn')`. That returns the first `.btn` in DOM order, which in Settings is `#btnResetBest` (and in Change Pictures, the first "Choose…" button, so Enter opens the file picker).
- **Fix:** focus the primary button first:
  `const s = id && $(id); const first = s && (s.querySelector('.btn-big') || s.querySelector('.btn-back') || s.querySelector('.btn'));`
  Optionally make Reset best a two-tap confirm too (`ui.js:49`).

### 2. P2: a finger held through Pause → Resume turns the next touch into a kickflip, and that finger no longer steers
- **Repro (iPad):** hold one finger on the field, then tap Pause and Resume with the other hand. The held finger stops steering (`pointerDown` is false). Every new finger counts as a "second finger" and kickflips instead of steering until the old finger is lifted. The renderer also keeps a stale `pointer`.
- **Cause:** `main.js:112` `pause()` sets only `pointerDown = false`. `_touches` and `_steerId` stay set, so `pointerdown` sees `_touches.size >= 1` (main.js "second finger = action").
- **Fix:** in `pause()`, replace `this.pointerDown = false` with `this.releasePointer()`. That clears `_touches`, `_steerId` and the touch `pointer`.

### 3. P3: with `?mute=1` (or any URL mute), pressing M shows "Sound on" while the game stays silent
- **Repro:** open `?mute=1`, start a game, press M twice. The toast says "Sound on" but `DJ.Audio.muted` is still true and the HUD icon shows muted.
- **Cause:** `main.js:152` `toggleMute()` builds the toast from `settings.muted` only, and `urlMute` keeps audio muted.
- **Fix:** when the player unmutes, also clear the URL mute for the session (`if (!this.settings.muted) this.urlMute = false;`) before `setOptions`. If you'd rather keep the URL mute, base the toast on `this.settings.muted || this.urlMute`.

### 4. P3: on iPhone portrait the blinking Mumbles warning icon is drawn under the Pause button
- **Repro:** 390×844 portrait, score of any length, `boss.next < 3`. The icon spans logical x 370–426, and the Pause button starts at x ≈ 415, so about 11 px are hidden behind the round button.
- **Cause:** `render.js:507` draws it at `cx + (narrow ? 50 : 70)` without looking at the HUD buttons.
- **Fix:** clamp it: `const ix = Math.min(cx + (narrow ? 50 : 70), right - 62);` with `right` as computed for the score. On narrow screens you could also draw it under the score (`y0 + 40`).

### 5. P3: the HUD button position is measured only on resize, so it is null for the whole first game
- **Repro:** fresh load on a phone, then Play. `renderer._hudBtn` is `null` (the HUD was hidden at boot), so the score layout uses the fallback `VW − 120` (440) instead of the real 414.7 in portrait. There is no visible overlap today, but any HUD change could expose it.
- **Cause:** `render.js:89` `_measureHud()` is called from `resize()` only, and `#hud` has `display:none` at that moment.
- **Fix:** call `DJ.Game.renderer._measureHud()` from `UI.setHud(true)` (after removing `.hidden`), or measure lazily in `drawHud` when `_hudBtn` is null.

### 6. P3: Go wrapper and build script carry leftovers from the sister game
- `app/go.mod:1`: `module puffsvolcanocatch`. Rename it to `spikesdinojam`. This doesn't change the build output, but it's confusing.
- `tools/build.sh:5`: the comment says `# projects/daily-game/puff-volcano-catch`.
- Everything else in `app/main.go` checks out: title and messages say "Spike's Dino Jam", the data dir is `%APPDATA%\SpikesDinoJam\data`, the WebView2 dir is `%LOCALAPPDATA%\SpikesDinoJam\WebView2`, port 127.0.0.1:47617 is unique (the sister games use 47613–47616), the store key regex accepts every key the game uses (`settings`, `best_*`, `img_*`, `shape_*`), and `app.manifest` is named SpikesDinoJam. `app/web/`, `dist/` and `*.syso` are gitignored.

### Notes (no fix required)
- Loose (scattered) notes may roll under the touch kickflip button. Only spawning is excluded by design, and the bot runs never saw a loose note there.
- Panels that need scrolling: none were reported at any tested size.
