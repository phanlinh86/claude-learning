# Functional QA: Dottie's Reef Parade (2026-11-17)

Report only: no game code was changed. Only `tests/` was edited: a new `tests/e2e/mobile.js`, and two test fixes in `tests/e2e/functional.js`.
Environment: Linux, Playwright Chromium (headless), with touch, `isMobile` and DPR emulated. This is not a real iPhone or iPad.

## Totals

| Suite | Result |
|---|---|
| `node tests/unit/run.js` | **24 / 24 PASS** (4.6 s) |
| `node tests/e2e/smoke.js` | **PASS** (1 bot game, no console errors) |
| `node tests/e2e/functional.js` (full) | 1st run **344 / 345**: 1 flaky FAIL (see F1). After the test fix: **345 / 345 PASS**, and the keyboard section passed 3 / 3 re-runs |
| `node shared/daily-mobile/test_extras.js projects/daily-game/puffin-reef-parade` | **EXTRAS PASSED** (Volume slider, Score Card, 4 device layouts) |
| `node tests/e2e/mobile.js` (new, full: 180 s long run, 40 s loudness) | **102 / 103**: 1 real FAIL, the loudness peak (P2-1) |
| Go wrapper | `GOOS=windows go vet` is clean, and `go build` cross-compiles (7.8 MB exe). Not run on Windows |

**Overall: 0 × P1, 1 × P2, 6 × P3.** No functional defects were found in the gameplay itself, the menus, input, scoring, storage or layout.

## What `tests/e2e/mobile.js` adds
It uses `chromium.launch()` with no options and serves the game with `python3 -m http.server` on a free port. Flags: `--quick` and `--only=layout,input,lock,custom,storage,long,loud`. The script exits 1 on any FAIL.
- **layout**: four screens, 844×390@3, 390×844@3, 1024×768@2 and 1366×1024@2, all with `isMobile` and `hasTouch`. Safe-area insets are simulated by overriding the padding of `#safeProbe` and `.screen` (iPhone notch 47/21, home bar 34, iPad 24/20).
  - Title, How to Play, Settings, Change Pictures, Pause and Game Over all fit on screen or scroll, and every button can be reached.
  - The HUD Pause and Sound buttons and the HUD text sit inside the safe area and are at least 44 px.
  - The Flip button is at least 66 px, inside the safe area, and does not overlap the HUD buttons or HUD text.
  - The Score Card button is present.
  - No page scroll.
  - Rotating the device mid-game re-lays out the screen, the arena stays synced, and the Flip button stays clear of Pause.
  - `#rotate` does not exist. That is correct: the game is designed for both orientations, and both are tested.
- **input**:
  - Focused Play + Space twice starts exactly 1 game.
  - Tapping the HUD Sound or Pause buttons never steers or flips.
  - A finger on the field steers, a second finger flips, and the Flip button flips without steering.
- **lock**: presses are timed in page time (`performance.now() - overAt`). Enter spam inside 0.7 s causes 0 restarts. A Play Again click inside the lock is ignored. Spam after the lock starts exactly 1 game.
- **custom**: uses real `setInputFiles` on `#filePick` with these files:

  | File | Result |
  |---|---|
  | PNG 400×300 | saved |
  | JPEG 800×600 | saved and resized to 512×384 |
  | JPEG 6000×4000 | saved and resized to 1080×720 in 265 ms |
  | Corrupt PNG | "That picture could not be opened.", and the old picture is kept |
  | `.txt` file | "Please choose a picture file…" |

  Pictures survive a reload, and Reset all clears both memory and `prp:img_*`.
- **storage**:
  - Every key starts with `prp:` (`settings`, `best_easy`, `best_hard`, `volume`).
  - Best scores are kept per difficulty.
  - `?mute=1` is never saved, and a reload without it is not muted.
  - Volume is saved.
- **long**: a 180 s bot run at `?speed=16` on iPhone landscape:
  - 2909 s of game time, up to level 63 (all 4 seasons, many laps).
  - 0 runtime or console errors.
  - At most 85 particles and 32 fx.
- **loud**: an `AnalyserNode` is inserted after `RP.Audio.user` (the final gain) while the bot plays with sound on.

## Loudness (target ≈ −24 dBFS RMS, −5 dBFS peak)

| Run (40 s of bot play, music + SFX) | RMS | Active RMS | 95th pct 43 ms window | Peak | Samples > 0 dBFS |
|---|---|---|---|---|---|
| 1 | −24.5 | −24.4 | −17.3 | **−0.4** | 0 |
| 2 | −24.6 | −24.5 | −17.2 | **−0.5** | 0 |
| 3 | −24.5 | −24.4 | −17.3 | **−0.5** | 0 |

Each sound alone, music off (peak / RMS in dBFS):

| Sound | Peak | RMS |
|---|---|---|
| note | −4.4 | −25 |
| gold | −5.0 | −22 |
| cleared | −4.6 | −20 |
| songdone | −8.0 | −22 |
| bonk | −6.8 | −28 |
| dead | −8.5 | −23 |
| start | −7.4 | −28 |
| music alone | −15 | −31 |
| cleared + gold + music together | −2.3 | −19 |

RMS is on target. The peak is not: sounds that overlap stack above the target.

## Issues

### P2-1: Peaks reach −0.4 dBFS (target −5), so the mix is close to clipping
- **Where:** `game/js/audio.js:45-46`. The chain is `master → compressor(−18 dB, 4:1, knee 12) → user gain (volume × 1.7) → destination`. The +4.6 dB make-up gain sits after the compressor, and nothing limits the output.
- **Repro:** `node tests/e2e/mobile.js --only=loud` → `FAIL loud: peak ≤ −3 dBFS {"peak":-0.5}`. It happens when star plucks overlap with the cleared or gold chords and the music. A single note already peaks at −4.4.
- **Fix:** add a brick-wall limiter after the user gain: `const lim = c.createDynamicsCompressor(); lim.threshold.value = -6; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.1; this.user.connect(lim); lim.connect(c.destination);`. Alternatively, lower the make-up gain from 1.7 to 1.35 and raise the compressor ratio to 6. Re-check with the `loud` test: RMS should stay −24 ±2. If the shared patch is the source, apply the same change in `shared/daily-mobile/apply.py` so other games get it.

### P3-1 (test, fixed): the Enter-spam restart-lock check was flaky under load
- **Where:** `tests/e2e/functional.js:355-357`, the original version.
- **Cause:** 6 Playwright `keyboard.press` calls plus `waitForTimeout(40)` can take more than 700 ms of wall time on a busy machine. In the full run, one press landed after the lock and started a game. Logged press times were 75, 184 and 576 ms after game over, so each press takes 100–400 ms. It passed 3 / 3 times when run alone. **This was not a game bug:** `canRestart()` in `game/js/main.js:127` works correctly.
- **Fix applied:** presses are now timed in page time and stop at 620 ms. The full suite then passed 345 / 345.

### P3-2 (test label, fixed): stale "× 3" in the golden-star score check
- **Where:** `tests/e2e/functional.js:598`. The label said `× 3`, but the value checked is ×5 (goldMul 5).
- **Fix applied:** the label now reads `× goldMul (5)`.

### P3-3: `go.mod` module name is left over from the scaffold, and the direct dependency is marked `// indirect`
- **Where:** `app/go.mod:1`, `module spikesdinojam`. `go mod tidy -diff` wants `github.com/jchv/go-webview2` moved to a direct `require`.
- **Fix:** rename the module to `module dottiesreefparade`, then run `go mod tidy` inside `app/`. Cosmetic: the build already works.

### P3-4: WebView2 data path has a doubled folder name when `LOCALAPPDATA` is empty
- **Where:** `app/main.go:189-196`. The fallback `localAppData = base` gives `%APPDATA%\DottiesReefParade\DottiesReefParade\WebView2`.
- **Fix:** `DataPath: filepath.Join(base, "WebView2")` in that branch, or set `localAppData = appData`.

### P3-5: Browser fallback (no WebView2) shows a Quit button that does nothing
- **Where:** `app/main.go:187` and `:207`. The fallback opens the browser with `?app=1`, so `main.js:18` sets `isApp = true` and `ui.js:76` shows Quit. In a normal browser tab, `quit()` → `window.close()` is ignored. Also, if port 47625 is taken, the random port gives a new origin, and that browser's localStorage (best scores, pictures) starts empty.
- **Fix:** open the fallback URL without `app=1`, using a separate `fallbackURL := "http://" + ln.Addr().String() + "/index.html"`. You can also add a line to the message box saying progress is saved only when the fixed port was free.

### P3-6: `Renderer.attach` is defined twice
- **Where:** `game/js/render.js:143` and `:147`. The second definition silently overrides the first.
- **Fix:** delete the first one (lines 143-146). There is no behaviour change.

## Go wrapper and build script review (`app/main.go`, `tools/build.sh`)
These all check out:
- Names are consistent: `DottiesReefParade.exe`, the window title, `%APPDATA%\DottiesReefParade\data`, the manifest identity.
- It binds to the fixed port `127.0.0.1:47625` and falls back to `:0`.
- The store's key regex `^[a-zA-Z0-9_-]{1,64}$` accepts every key the game uses (`settings`, `best_*`, `img_bg_spring` and so on, `shape_*`, `volume`).
- Writes are atomic: tmp file + rename.
- The 12 MB value cap is well above a 1280×720 picture.
- The `ffStoreAll/Set/Del`, `ffFullscreen` and `ffQuit` bindings match `storage.js` and `main.js`.
- The `w == nil` check is valid, because `NewWithOptions` returns a nil interface on failure.
- `IconId: 2` matches the rsrc ordering, and `-H windowsgui` is set.
- `build.sh` copies `game/` → `app/web/`; `app/web/`, `*.syso`, `icon.ico`, `build/` and `dist/` are all gitignored.

Not tested: running the exe on Windows.

## Coverage map (where each item asked for is tested)

| Area | Where |
|---|---|
| Boot, every menu (title, how to play, settings, change pictures, pause, game over), Esc back | functional `boot`, `pause`; mobile `layout` |
| Arrows / WASD, mouse steer, right-click flip, Space / Enter flip, hold = one flip | functional `keyboard`, `mouse` |
| Touch steer, second-finger flip, Flip button, HUD taps not steering or flipping | functional `touch`, `ghost`; mobile `input` |
| Score: star 10 + 2×parade, golden ×5 and song +5 via `goldNow()`, regrab 5, clear bonus | functional `scoring` |
| All 4 seasons + lap (gotoLevel 0–5, and the long bot run reached level 63) | functional `scoring`; mobile `long` |
| Pause: Esc / P, blur, visibilitychange auto-pause | functional `pause` |
| Settings persistence, best per difficulty, `prp:` prefix, `?mute=1` never saved | functional `settings`, `pause`; mobile `storage` |
| Custom pictures: PNG / JPEG / 6000×4000 / corrupt / non-image / reset / reload | functional `custom`; mobile `custom` |
| 0.7 s restart lock, double start via focused button + Space | functional `keyboard`, `focus`; mobile `lock`, `input` |
| Layouts 844×390, 390×844, 1024×768, 1366×1024 (+ 820×1180, 1180×820, desktop) with DPR 2–3 and safe areas | functional `layout`; mobile `layout` |
| Long 16× bot run with zero console errors (60 s + 180 s) | functional `long`; mobile `long` |
| Score Card + Volume slider | test_extras; mobile `layout`, `storage` |

Screenshots: `tests/out/mobile/lay_*.png`, `tests/out/mobile/custom_winter.png`, `tests/out/functional/`. Loudness data: `tests/out/mobile/loudness.json`.
