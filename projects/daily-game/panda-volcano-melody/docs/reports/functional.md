# Functional QA report: Tofu's Volcano Melody

Date: 2026-11-14 · Tester: functional QA agent (report-only, no game/app edits)
Suite: `tests/e2e/functional.js` (Playwright, Chromium headless; it serves `game/` itself)

```
node tests/e2e/functional.js [outDir] [--only=boot,input,rules,persist,pictures,layout,bot] [--bot-seconds=60]
```
Screenshots are saved to `tests/out/functional/` (gitignored). A full run takes about 6 min.

## Summary

| Run | Result |
|---|---|
| Full suite, run 1 | **357 passed, 0 failed** |
| Full suite, run 2 (machine load avg ≈ 6) | 356 / 1: the bot "event queue drained" sample caught the `intro` event of a world just created by autorestart's timer. The test now allows ≤ 2 queued events. Bot group re-run: 22 / 0. |
| Earlier flaky checks | Fixed in the test (see "Test stability"), not ignored |

| Group | Checks | What it covers |
|---|---|---|
| boot / menus | 37 | Boot with zero console errors or failed requests. Title demo. How to Play, Settings and Change Pictures (button and Esc). Pause: HUD button, Esc and P; Resume, Restart, Settings and back to Pause, Main Menu. Game Over: Play Again and Menu, plus the 0.7 s lock for click and Enter. Only one screen visible at a time. |
| input | 52 | Mouse hold-to-walk, drag retargeting, release clears the target and stops Tofu. Arrows and WASD (each direction). Diagonal axis normalised and not faster. Blur pauses and releases keys (no stuck walking). `visibilitychange` pauses. HUD Pause and Mute pointerdown never set a target. Enter/Space during play do nothing. Enter/Space on focused Play or Play Again start exactly once. Space on How to Play opens it only. Enter on the focused Menu button does not restart. Touch (hasTouch): hold, drag, lift, target 10 px above the finger, second-finger tap on Pause while steering, no ghost click. |
| rules | 39 | Headless `PVM.World` in the page: 10 + 2·min(10, combo) (12…30, capped). Combo window continue/restart and the `comboEnd` event. Coco exactly at combo 5. Pinch: −1 heart, 2 s invulnerability, hurt/dizzy, combo ends, no hit while invulnerable, hit again afterwards. Last heart → `over`, nap, input frozen. Mango +1 heart, capped, never spawns at full hearts. Clear bonus +100 if perfect, +50 if not. Next season after 2.6 s. `pickR`/`catchZ` edges. Year-2 scaling. Hearts per difficulty. In-game: "+20" and "Combo ×5!" popups, Coco flies in, "Ouch!", mango, spring→summer renderer and weather swap, `gotoLevel(3)` → snow, nap before the over screen, first accepted Play Again 700–1000 ms after game over. |
| persist | 25 | sfx, music and difficulty persist across reload. `?mute=1` never written to storage, even when another setting changes in that run. M (mute) persists. Best score per difficulty; a lower score does not overwrite it. Title shows the best for the current difficulty. Best not saved for `bot`, `speed`, `level`, `diff` runs or after `debug.setSpeed()`. Reset Best needs two taps. Corrupted saved settings fall back to defaults. |
| pictures | 21 | Transparent PNG for Tofu → "fit" cut-out. JPEG photo for the note → 512×512 round sticker with transparent corners. 4000×3000 meadow → JPEG ≤ 1600 px. `.txt` → friendly error. A fake `.png` → friendly error, and the old picture is kept. Round/Whole shape buttons. Pictures survive a reload. Custom Tofu, note and meadow drawn in-game (and into the next season) with no frame errors. Reset one, Reset all, then the original art is drawn again. |
| layout | 176 | Sizes: 1280×720, 1920×1080, 844×390 @3x, 390×844 @3x, 1024×768 @2x, 1366×1024 @2x. Title Play button and title block on screen. Each menu panel alone, on screen, no sideways scroll, Done reachable, touch buttons ≥ 24 px. Canvas fills the viewport; backing store ≤ ~1920×1080. HUD buttons on screen and ≥ 44 px on touch. Score, meter and hearts pills on screen with no overlaps between them or with the HTML buttons. Whole arena on screen, not covered by the HUD. Hold-to-walk works at every size. Pause and Over panels on screen. Portrait phone: rotate prompt appears, the game waits, "Play upright anyway" works. Rotating the device mid-game re-fits the canvas. |
| bot | 2 × 13 | A: `?autostart=1&bot=1&speed=16&autorestart=1&diff=normal`, 60 s real time. B: same at `diff=hard&skill=0.15`, 30 s, which dies often and exercises autorestart. Both: no frame errors. Per-frame peak particles 168–228 (cap 260). Renderer texts+rings peak ≤ 7. Sprite cache ≤ 172, background cache ≤ 5, notes ≤ 9, crabs ≤ 4. Event queue drained. JS heap flat. Bot runs never write a best score. |

**No P1 (blocking) issues found.** Every rule in DESIGN §5 and every hook in §6 behaves as specified.

## Issues

### P2-1: Upright phone: HUD pills float in mid-screen, far from the pause/sound buttons
- **Repro:** 390×844 touch, start a game, tap "Play upright anyway" (screenshot `layout_iphone_port_390x844_game.png`).
- **What happens:** The canvas HUD (score, song meter, hearts) is drawn at stage y = max(−oy, −64) + 8. In portrait, oy ≈ 768 logical px, so the pills land at about y = 289 css px of 844. The HTML Pause/Sound buttons stay at the very top (y ≈ 10). The pills hover in the sea about 280 px below the buttons. The island is only about 390 px wide (cssScale 0.41, Tofu ≈ 29 px tall). The rotate prompt mitigates this, but a child who taps "Play upright" gets a small field and a split HUD.
- **Where:** `game/js/render.js:475` (`const top = Math.max(-this.oy + sf.t, -64) + 8;`)
- **Fix:** In portrait, put the HUD band at the real top of the screen: `const top = (this.portrait ? -this.oy + sf.t : Math.max(-this.oy + sf.t, -64)) + 8;`. Then align `hudBottom`, and the combo badge (top + 66) and Coco icon (top + 70) follow. Alternatively, draw the HUD with its own transform in screen space. Optionally shift the stage up in portrait (oy smaller) so the island sits under the HUD and the space below can hold a bigger thumb area.

### P3-1: `?bot=1&autorestart=1` without `autostart=1` only runs the title demo
- **Repro:** Open `?bot=1&speed=16&autorestart=1` (the URL from the test brief). `PVM.debug.mode` stays `title`, `stats.games` stays 0, and nothing is tested.
- **Where:** `game/js/main.js:45` (`if (params.get('autostart') === '1') this.startGame(); else this.toTitle();`). DESIGN §6 does not say that `bot` implies autostart.
- **Fix:** Either `if (params.get('autostart') === '1' || this.botMode) this.startGame();`, or document in DESIGN §6 and the playtest/bot instructions that `autostart=1` is required. The suite passes `autostart=1` explicitly.

### P3-2: No difficulty ceiling for a strong player in later years
- **Observed:** The skill-1 bot on Normal at speed 16 reached **level 33 (year 9) in 60 s real time with zero hearts lost**. That is about 16 game minutes, and the game never ends. Crab speed is capped at `min(1.35·base, 0.5·Tofu speed)` and only the goal grows by +2 per year (`game/js/world.js:316-321`).
- **Impact:** For a family game this is mostly fine: a child is never overwhelmed. An older child or adult will find years 3+ unchanging. This is a playtest/balance note rather than a bug.
- **Fix (optional):** From `loop ≥ 2`, add one crab per year (cap 5), or shorten `erupt` and `comboWindow` slightly per loop. Keep Easy unchanged.

### P3-3: Visible seam between the ground art's sea and the tiled sea
- **Repro:** 844×390 or 390×844 game screenshots (`layout_iphone_land_844x390_game.png`, `layout_iphone_port_390x844_game.png`).
- **What happens:** The 960×540 ground image's sea margin is flat colour (no wave strokes) and sits on top of the drifting `sea.svg` tile. On wide or tall screens a rectangle edge is visible: a vertical band near x ≈ 180 css px in landscape, a horizontal band in portrait.
- **Where:** `game/js/render.js:240-246` (ground drawn as an opaque 960×540 layer over the sea pattern); art in `game/assets/default/levels/*/ground.svg`.
- **Fix:** Make the ground SVGs transparent outside the island (keep only beach and meadow), so the tiled, drifting sea shows everywhere. Or fade the ground layer's outer 20 px with a mask. This belongs to the visual reviewer; noted here because it shows on every phone size.

### P3-4: `app/main.go` review notes (not compile-checked)
`go vet` could not run because `proxy.golang.org` is unreachable from the test box, so the go-webview2 module could not be downloaded. `gofmt -l` is clean. Read-through:
- **Bridges match the JS:** `pvStoreAll`, `pvStoreSet`, `pvStoreDel` (storage.js:13-56), `pvFullscreen` (main.js:172) and `pvQuit` (main.js:178, ui.js:77) are all bound before `Navigate`. The return types (map, bool) are what storage.js expects (`ok === false` → rollback).
- **Storage:** `%APPDATA%\TofusVolcanoMelody\data\<key>.txt` with atomic tmp+rename. Key regex `^[a-zA-Z0-9_\-]{1,64}$` accepts every key the game writes (`settings`, `best_easy|normal|hard`, `img_hero|note|ground`, `shape_*`). The 12 MB value cap is well above the largest picture (≈ 0.5–1.5 MB data URL). The fallback to the temp dir is OK.
- **Ports:** 48213/48223/48233/48243, then a random port. This is fine, but if all four are busy, the browser-fallback origin (and its localStorage) changes between runs. The native store is unaffected.
- **Minor:** If `LOCALAPPDATA` is empty, `DataPath` becomes `%APPDATA%\TofusVolcanoMelody\TofusVolcanoMelody\WebView2` (doubled folder name). Cosmetic; use `filepath.Join(base, "WebView2")` in that branch (`app/main.go:248-251`).
- **Minor:** `http.Serve` runs without a `ReadHeaderTimeout` (`app/main.go:242`). It is loopback-only and serves static files, so the risk is negligible.
- No functional bugs found.

## Notes and limits
- The JS heap is measured with `performance.memory`, which is coarse (quantised) in headless Chromium. It stayed at 10.0 MB, so "bounded" is shown but only roughly. The renderer `texts`/`rings`, weather particles and caches are counted exactly, per frame.
- CDP cannot lift one finger of a two-finger touch on its own. The second-finger Pause test lifts both fingers; Pause fires on the second finger's `pointerup` on the button.
- `env(safe-area-inset-*)` (notch) cannot be emulated in Chromium, so the notch/home-bar insets are not covered.
- Real iOS Safari behaviour (audio unlock, double-tap zoom, rubber-band) is not covered by Chromium emulation.

## Test stability
These checks were flaky on a loaded machine and are fixed in the test:
- Real-time `sleep()` before measuring movement was replaced with `holdGame()`, which waits for N seconds of world time.
- The Game Over lock checks now click and press Enter from inside the page, 100 ms after `Game.gameOver`. The "lock ≈0.7 s" check clicks every animation frame from inside the page and records the first accepted click (measured 700–1000 ms).
- `World.update()` caps dt at 0.25 s, so the rule tests advance time in 0.1 s chunks (`adv()`).
- The portrait rotate prompt freezes the world, so the layout test waits for `mode` and does not wait for `phase` until the prompt is dismissed.
