# Functional QA — Finn's Island Fling (2026-11-09)

Suite: `tests/e2e/functional.js` (Playwright Chromium, `file://` + `--allow-file-access-from-files`).
Run: `node tests/e2e/functional.js` (≈ 3.3 min; `--quick` uses a 15 s soak instead of 60 s). Raw results are in `tests/out/functional.json` and screenshots in `tests/out/func_*.png`.

**Result: 189 / 189 checks PASS.** There are no console errors, page errors or frame errors in any section. Three low-severity issues were found, by a manual probe and by code review (below).

## Results

| Section | Checks | Result | What is covered |
|---|---|---|---|
| boot | 6 | PASS | The title screen loads, the bot demo runs, the HUD is hidden, no image is missing, Play has focus, there are 0 errors |
| menus | 26 | PASS | Title, How to Play, Settings, Change Pictures (6 cards), Pause, Pause→Settings→Esc returns to Pause, Restart, Main Menu, Game Over → Menu / Play Again, Esc/back on every screen |
| input-desktop | 30 | PASS | Mouse drag + release flings. A 3 px drag cancels. A drag under PULL_MIN cancels. Dragging out and back cancels. A right-button drag does nothing. 3 taps in flight give 1 flutter. Arrow keys aim (angle and power). Space flings, and Space in flight flutters once. Held Space (auto-repeat) does not flutter. Mute/Pause clicks never fling or flutter. A focused mute button + Space/Enter gives 1 fling/flutter and does not toggle mute again. Space on the focused Resume button resumes cleanly. Esc during a drag cancels the pull. M toggles sound. On the title, focused How + Enter opens only How. Space on Play starts the game without flinging. The restart lock blocks Enter, Space and clicks for the first 0.7 s after Game Over, and the first press after it starts exactly one run |
| input-touch (844×390, DPR 3) | 10 | PASS | Touch drag + release (CDP touch) flings. Taps in flight give 1 flutter. A tiny wiggle does not fling. Touching mute toggles once with no pull. Touching Pause during flight gives no flutter. Resume works. A second finger tapping Pause while the first finger drags pauses and cancels the aim. The page never scrolls or zooms |
| rules | 31 | PASS | A fling on the level's solution arc lands and collects leaves. Leaf +1, landing +2, bullseye +3, streak +1/step capped at +4 (seen as 4,5,6,6,6). A splash costs −1 heart, scores 0 and resets the streak. The 20th leaf gives back a heart (never above max). 5 landings move to the next island; after 4 islands the game loops to round 2. Night (setDay 0.85): light 0.3, one `night` event, shorter preview, moon leaves worth 2. Back to day gives `dawn` and normal leaves. The natural cycle reaches night by itself. Pause freezes the whole state; resume has no time jump. Blur and a hidden tab auto-pause, and the game stays paused when the tab comes back |
| persist | 18 | PASS | Sound, music and difficulty survive a reload, and the controls show them. `?mute=1` and `?diff=` are never saved; pressing M during `?mute=1` saves nothing. Best is stored per difficulty, and the title shows the current difficulty's best. A mid-run difficulty change saves to the run's own difficulty. Reset best needs 2 taps. `?bot=1` saves no best |
| pictures | 18 | PASS | A photo PNG becomes a round sticker; a transparent PNG stays whole. The shape buttons work. A `.txt` file and a corrupt "PNG" both give a friendly toast. A 6000×4000 PNG is downscaled to 1600×1067 JPEG (23 KB, 0.6 s). Characters are stored at ≤ 512 px. The game plays with custom art. Pictures persist across reload. Reset on one card and Reset all both work |
| layout × 5 | 44 | PASS | Tested at 1280×720, 1920×1080, iPad 1024×768, phone 390×844 portrait and 844×390 landscape (isMobile, hasTouch, DPR 3). Title, How, Settings, Change Pictures, Pause and Game Over (with long stats) all fit, nothing sticks out and no panel needs scrolling. No horizontal page scroll. HUD and canvas are on screen, and touch HUD buttons are ≥ 44 px (exactly 44 on phones) |
| perf | 2 | PASS | Frame work at speed 1 (bot, half night / half day): p50 0.9 ms, **p95 3.7 ms**, max 17.4 ms over 285 frames |
| soak | 6 | PASS | 60 s at `?speed=16&bot=1&skill=0.55&autorestart=1`: 14 games, 229 shots, 173 landings, reached level 3. Particles peaked at 97 (limit 160), renderer fx lists peaked at 9. The game never stalled and no best was saved |

## Issues

### P3-1 — An arrow-key aim followed by a plain click/tap flings
- **Repro:** start a run, press ↑ once (the keyboard aim shows the band), then click or tap anywhere without dragging. Finn flies with the keyboard aim. Confirmed: `phase` goes from `aim` to `fly`. A child tapping the screen after a parent touched the arrow keys gets an unintended shot.
- **Where:** `game/js/main.js:222` (pointerdown starts a drag but keeps the keyboard pull) and `:229` (`|| this.world.pull` lets any pointer move overwrite the keyboard aim). On pointerup (`:235`), `release()` fires the leftover keyboard pull.
- **Fix:** when a pointer drag starts, drop the keyboard aim: in pointerdown, before `this.drag = {…}`, add `if (this.world.pull) this.world.cancelAim();`. In pointermove, replace `|| this.world.pull` with a per-drag flag (`d.moved = d.moved || Math.hypot(dx, dy) > 0.06; if (d.moved) this.world.aim(dx, dy);`).

### P3-2 — Bot / test runs still show "NEW!" best on Game Over
- **Repro:** `?bot=1&autostart=1`, then reach Game Over with a score above the stored best. The panel shows "NEW!", Best = the bot's score, and the "best" jingle plays, but nothing is saved (correctly). After a reload the old best is back. This only affects test URLs and the title demo never reaches it, so it is cosmetic.
- **Where:** `game/js/main.js:126` and `:131`.
- **Fix:** `const isNew = newBest && w.score > 0 && !this.botMode;` then pass `best: this.botMode ? prev : Math.max(prev, w.score), newBest: isNew` and play `'best'` only when `isNew`.

### P3-3 (Windows exe) — A second launch un-maximizes the running window
- **Repro (code review):** the game window opens maximized (`main.go:262`). Starting the exe again calls `ShowWindow(hwnd, SW_RESTORE)`. `SW_RESTORE` on a maximized window that is not minimized turns it back into the normal 1280×760 window.
- **Where:** `app/main.go:185`.
- **Fix:** only restore when minimized. Add `procIsIconic = user32.NewProc("IsIconic")`, then `if r, _, _ := procIsIconic.Call(hwnd); r != 0 { procShowWindow.Call(hwnd, swRestore) }` followed by `SetForegroundWindow`.

### Other notes on `app/main.go` (no bug)
- The store writes to a temp file and then renames it (atomic). Keys are validated with a regex and capped at 12 MB. The single-instance mutex, loopback-only server, fixed-port fallback and `no-store` headers are all sound.
- The fullscreen toggle saves and restores `WINDOWPLACEMENT`, which handles a maximized window correctly.
- Minor: the result of `go http.Serve(ln, mux)` is ignored. If the server ever failed, the window would be blank with no message. Logging it, or showing a `messageBox` on a non-nil error, would help.
- Minor: Esc pauses the game but does not leave the app's borderless full screen. This is consistent with the in-game Settings toggle and F11, so it is not a bug.

## Notes
- Hearts are kept full by the test inside the input sections; otherwise the many real flings would end the run before the checks finish.
- CDP touch cannot lift only one of two fingers, so the two-finger Pause test uses synthetic `PointerEvent`s with `pointerType: 'touch'`. The single-finger tests use real CDP touches.
