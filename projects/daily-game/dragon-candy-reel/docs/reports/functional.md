# Functional QA: Taffy's Candy Reel (2026-11-18)

Report only: no game code was changed. Suite: `tests/e2e/functional.js`, which now serves `game/` from a built-in static http server and uses `chromium.launch()` with no options.

## Summary

| Run | Result |
|---|---|
| `node tests/unit/run.js` | 34 / 34 PASS |
| `node tests/e2e/smoke.js` | PASS (no console errors; bot reached level 2, 4 gusts) |
| `node shared/daily-mobile/test_extras.js projects/daily-game/dragon-candy-reel` (repo root) | EXTRAS PASSED |
| `node tests/e2e/functional.js` | **414 PASS, 3 FAIL** (exit 1) |
| Windows wrapper (`app/main.go`), cross-compiled in a scratch copy | `go vet` and `go build` OK (PE32+ GUI exe) |

**Issues: P1 0 · P2 2 · P3 5.** All 3 failing checks belong to the two P2 issues, which have the same cause.

### What the suite covers
- **Boot and menus:** boot with zero console errors. Title, How to Play, Settings, Change Pictures, Pause/Resume/Restart/Main Menu and Game over, tested with mouse, keyboard and touch. Play Again and Menu use the 0.7 s restart lock (click, Enter, Space and touch).
- **Input:** hold Space, ↓ or S to sink, mouse, and touch through CDP touch points. A second finger keeps the hold, and a second finger can tap Pause. Right click does nothing. Key auto-repeat gives one reel tap. Blur and a hidden page both pause. HUD buttons never cast or reel, with mouse or touch, and also while reeling.
- **Rules:** catch scores 10, 20, 30 and 50, and each Perfect adds +5. Good moves the catch one step and Perfect two steps. A slip drops it half a step, and three slips mean the snowflake escapes. A gummy snap costs a line, gives a short invulnerability, and losing the last line ends the game. The best score is kept per difficulty and Reset best needs two taps.
- **Wind (new):**
  - On all 4 levels, over 150 s of game time each (64 gusts), every gust comes **exactly 1.5 s** after its `gustWarn`.
  - Every gust flips the direction, its strength is between 0.55 and 1 × the level strength, the first gust comes no earlier than 6 s, and the gaps stay inside `gustEvery` (× 0.75 on the Windy level).
  - The windsock points the same way as `wind.value`, checked by instrumenting `ctx.scale`. It stretches further in strong wind. While a gust is announced, the sock keeps pointing with the current wind and the arrow points the new way.
  - `PR.debug.gust(dir)` and the instant gust both work. A warning that is pending at a level change is cancelled.
  - Hook sway settles at wind × driftMax × depthFrac (shallow < mid < deep) and flips side when the wind flips. A real Space hold in a right wind bows the line to the right. Swimmers drift with the current.
- **Levels (new):** real catches in reel mode take the game through Sunny, Rain, Windy and Snow, then back to Sunny in round 2. On each level change the visuals, weather, music zone and banner all switch, you get a line back (max 3), and the counter resets. Round 2 is faster (needle ≥ 1.08×). The green zone never widens. The Windy level has the strongest wind.
- **Settings (new):**
  - Volume: "−", "+" and the slider work, with clamps at 0 and 100 %. The value is saved as `dcr:volume` and reaches `PR.Audio.volume`.
  - Sound and music toggles reach the audio engine.
  - Each difficulty button highlights alone and is saved.
  - Full screen works from the toggle, from F11 on the title and during play, and when the browser leaves full screen.
  - Full screen and `?mute=1` are never saved.
  - A normal reload after a `?mute=1` session is not muted.
  - **Every localStorage key starts with `dcr:`**.
- **Change Pictures:** a PNG with transparency, an opaque JPEG and an opaque PNG (which becomes a round sticker), a 6000×4000 photo (downscaled to 1600 px for a background and 512 px for a character), a .txt file, and a broken .png (new) that shows the "could not be opened" toast and stores nothing. Also the shape toggle, survival across reload, reset of one picture and Reset all.
- **Layout:**
  - Screen sizes: 844×390 @3, 390×844 @3, 1024×768 @2 with touch, 1366×1024 @2 with touch, 1024×1366 @2, 960×540, 1920×1080, 1280×720, 1024×768 and 2560×1440.
  - The canvas and HUD stay inside the viewport and don't overlap Taffy, the pill or the windsock.
  - New: the play band (gap ± 160, water top to floor) fits on screen, and no HUD element, score plate, level pill or windsock sits over the band or where the hook can reach.
  - Every panel fits, and buttons are ≥ 32 px tall on touch screens.
  - Rotating from landscape to portrait works.
  - The low-power 30 fps mode does not drop the resolution.
- **Long bot run:** speed 16, 75 s real time = 20.1 min of game time. Bot reached level 36. Particles peaked at 129–145 (< 160). No errors.
- **Server:** no 404s for any game asset.

### Test-side fixes made while extending the suite (not game bugs)
- The one baseline failure (`layout ipad_portrait: scrHow panel fits`, panel at −7…1031 px) came from the test measuring during the panel's "pop" animation, which overshoots to 1.03×. The panel really is 8…1016 px. The layout checks now wait for finite CSS animations to finish.
- The test's copy of the score-plate position was out of date: it placed the plate in the water in portrait, using a K cap of 1.3. It now matches `render.js drawHud()`, which uses `y0 = ins.top + 10` and a K cap of 1.1.
- The suite moved from `file://` with `--allow-file-access-from-files` to a local http server. This is the same kind of origin as GitHub Pages.

## Issues

### P2-1: Enter or Space on any focused game-over button starts a new game
- **Repro:**
  1. Play until game over and wait 1 s.
  2. Press Tab to move focus to **Menu** (or to **Score Card**).
  3. Press Enter.
- **Result:** a new game starts. Menu does not go to the title, and Score Card does not open.
- **Expected:** the focused button does its own action. Enter and Space only mean "play again" when Play Again is focused or nothing is focused.
- **Where:** `game/js/main.js:198`. The `mode === 'over'` branch calls `preventDefault()` and `startGame()` without looking at `document.activeElement`. The `preventDefault()` also cancels the button's own click.
- **Fix:** before restarting, check what has focus:
  ```js
  if (this.mode === 'over' && (e.code === 'Enter' || e.code === 'Space')) {
    const f = document.activeElement, sc = document.getElementById('scScreen');
    if (sc && !sc.classList.contains('hidden')) return;                         // P2-2
    if (f && (f.tagName === 'BUTTON' || f.tagName === 'A') && f.id !== 'btnAgain') return;   // let the button act
    e.preventDefault(); if (!e.repeat && this.canRestart()) this.startGame(); return;
  }
  ```
- **Check:** `focus: Enter on a focused game-over Menu button goes to the Menu` (FAIL).

### P2-2: Keyboard use in the Score Card window restarts the game behind it, and the card stays on screen
- **Repro:**
  1. Reach game over and wait 1 s.
  2. Click **Score Card**. Focus moves to "Save picture" automatically.
  3. Press Enter, or Tab to "Copy text" and press Space.
- **Result:**
  - `PR.Game.mode` becomes `playing` and a new run starts underneath.
  - The `#scScreen` window stays visible over the live game. Its buttons stop pointer events, so a child sees a picture while the line runs.
  - The picture is never saved and the text is never copied.
- **Where:** `game/js/main.js:198`, same cause as P2-1. Also `game/js/extras.js:206`: the window's capture-phase key listener only handles Escape. Finally, `startGame()` and `toTitle()` (`main.js:78`, `main.js:64`) don't close `#scScreen`, because it is not in `UI.SCREENS`.
- **Fix:**
  - The guard shown in P2-1, which ignores keys while `#scScreen` is visible.
  - Defence in depth: in `startGame()` and `toTitle()`, add `#scScreen` to hidden (or call the extras `close()`).
  - Optionally, in the shared `extras.js`, stop the propagation of Enter and Space at the window when the focused element is inside it. That fixes every daily game.
- **Checks:** `focus: Enter on the focused Score Card button…` and `focus: Space on the Score Card "Copy text" button…` (both FAIL).

### P3-1: The full-screen toggle stays ticked when the browser refuses full screen
- **Found by:** reading the code. Headless Chromium always allows full screen, so the suite cannot hit this.
- **Where:** `game/js/main.js:157-162`. `setFullscreen(on)` sets `this.fullscreen = on` before `requestFullscreen()` succeeds. A rejection is swallowed by `.catch(() => {})`, for example when full screen is not triggered by a tap on some iPad Safari versions, or inside an iframe.
- **Result:**
  - The Settings toggle stays on.
  - The next F11 press is spent on "off", so the player has to press it twice.
- **Fix:** in the rejection handler, set `this.fullscreen = !!document.fullscreenElement; PR.UI.syncSettings();`. Better still, set the flag only inside `fullscreenchange`.

### P3-2: Pictures with an empty MIME type are rejected as "not a picture"
- **Where:** `game/js/assets.js:82` checks `/^image\//.test(file.type)`. Some files picked from the iOS or iPadOS Files app, and some HEIC or desktop files, arrive with `type === ''`. The player then gets "Please choose a picture file" even though the file decodes fine.
- **Fix:** reject only when the type is known and is not an image:
  ```js
  if (!file || (file.type && !/^image\//.test(file.type))) reject(...)
  ```
  Let the existing `img.onerror` handle files that really are broken. The broken-PNG test shows that path already gives a friendly toast.

### P3-3: `app/go.mod` marks a direct dependency as indirect
- **Where:** `app/go.mod`. `github.com/jchv/go-webview2` is imported by `main.go` but listed with `// indirect`.
- **Effect:** `go build` (readonly) works; I checked. But `go mod tidy` or `-mod=mod` rewrites the file, which leaves a dirty diff after the next build.
- **Fix:** run `go mod tidy` in `app/` and commit the result.

### P3-4: The browser fallback can lose saves between runs (Windows exe without WebView2)
- **Where:** `app/main.go:212-214` and `:247`.
- **Cause:** if port 47626 is busy, the server falls back to a random port. In the WebView2 window this is harmless, because saves are files via `ffStore*`. In the "WebView2 missing → default browser" fallback there are no bindings, so saves live in that origin's localStorage. A new port means a new origin, so best scores and pictures disappear.
- **Fix:** in the fallback, retry 47626 a few times before using a random port. Or tell the player in the message box that saves could not be kept. Low priority: Windows 11 ships WebView2.

### P3-5: `tools/build.sh` assumes `rsrc` installs into `$GOPATH/bin`
- **Where:** `tools/build.sh:19-21`. `go install` puts the binary in `$GOBIN` when that is set, so the script's `"$RSRC"` path doesn't exist and the build stops (`set -e`).
- **Fix:**
  ```sh
  BIN=$(go env GOBIN); [ -n "$BIN" ] || BIN="$(go env GOPATH)/bin"; RSRC=$(command -v rsrc || echo "$BIN/rsrc")
  ```
  Nothing else in the build scripts needed a change: `go build -o dist/...` creates `dist/` itself, and only gitignored outputs are written (`app/web`, `app/icon.ico`, `app/*.syso`, `build/`, `dist/`).

## Read-through notes (no action needed)
- **`app/main.go`:**
  - The store only accepts keys matching `^[A-Za-z0-9_-]{1,64}$` and values up to 12 MB. It writes atomically (tmp file, then rename) behind a mutex. The game's keys (`settings`, `volume`, `best_*`, `img_*`, `shape_*`) all fit.
  - A single-instance mutex brings the existing window to the front.
  - The server listens only on loopback, has no API endpoints and sends `Cache-Control: no-store`.
  - Full-screen state is saved and restored with WINDOWPLACEMENT.
- **Balance (for the playtest agent):** at skill 0.9 the bot never lost all three lines in 20 minutes of game time on Easy and reached level 36. That is endless as designed (loop speed-up capped at +40 %), but with no end state a child can play indefinitely.

## Fixes applied (fix engineer, 2026-11-18)
- **P2-1 fixed** (`game/js/main.js` keydown): on game over, Enter/Space restart only when Play Again or nothing is focused; a focused Menu / Score Card / link keeps its own action.
- **P2-2 fixed** (`main.js`): keys are ignored while `#scScreen` is visible (`scoreCardOpen()`), and `startGame()` / `toTitle()` close the window (`closeScoreCard()`). Done in `main.js` only; the shared `extras.js` is untouched (apply.py would overwrite it).
- **P3-1 fixed** (`main.js setFullscreen`): in the browser, the flag is set from `document.fullscreenElement` once the request settles (success or refusal), and Settings resyncs. The exe path (`ffFullscreen`) is unchanged.
- **P3-2 fixed** (`game/js/assets.js`): an empty MIME type is accepted, and a broken file still ends in `img.onerror` with the friendly toast. A `.txt` (text/plain) is still rejected.
- **P3-3 fixed**: `go mod tidy` ran offline from the module cache (`GOPROXY=off GOSUMDB=off`). `go-webview2` is now a direct requirement and `go.sum` is unchanged.
- **P3-4 skipped**, as instructed (low priority: Windows 11 ships WebView2).
- **P3-5 fixed** (`tools/build.sh`): `rsrc` is looked up in `$(go env GOBIN)`, falling back to `$(go env GOPATH)/bin`.
- **Results after the fixes:**
  - unit: 34/34
  - smoke: PASS
  - `functional.js` (full): **417 passed, 0 failed**, including the three P2 checks
  - `test_extras.js`: EXTRAS PASSED
  - `apply.py`: idempotent ("already has extras.js; audio: already patched")
