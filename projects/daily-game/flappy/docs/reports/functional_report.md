# Family Flappy: functional QA report

- **Tested:** the web game in `game/`, in headless Chromium (Playwright). The Windows exe wraps the same code in WebView2, which is Chromium-based.
- **Suite:** `tests/e2e/functional.js`. Run it with `node tests/e2e/functional.js [baseUrl] [--quick] [--only=name,…]`. The default base URL is `http://127.0.0.1:8771/index.html`.
  - Serve the game first: `cd game && python3 -m http.server 8771`.
  - The README's Test section serves on port **8765** but calls `functional.js` with no URL. Either pass `http://127.0.0.1:8765/index.html` or update the README.
- **Outputs:** screenshots in `tests/out/functional/`, per-check results in `tests/out/functional/results.json`, and the full log in `tests/out/functional/run.log`.
- **Result of the last full run:** 198 of 206 checks pass. The long run lasted 150 s at speed 16 with the bot at skill 0.5 and autorestart. It played 104 games and reached a season index of 8. There were no errors, the JS heap stayed flat at 9.5 MB, and entities stayed bounded (≤ 2 drops, ≤ 4 turtles, ≤ 90 particles, ≤ 28 fx, 27 cached sprites).
- **Note:** `game/` was edited while I was testing (around 20:12–20:14). The full run and the line numbers below are for the current files. The Change Pictures overflow I found in my first run was fixed by that edit (see "Fixed during testing").

## What passed
- **Boot.** There are zero console or page errors. The title shows Play, Change Pictures, How to Play, Settings and the best score. The attract demo runs behind the menu, and Esc closes How to Play.
- **READY state.** The bird bobs between 221 and 239 px with no gravity. Space, ArrowUp, W and a mouse click each start play and raise the bird, and the starting flap drops no treat.
- **Flap and death.** A flap raises the bird. With no input the bird hits the ground about 0.9 s later. The game-over panel appears 0.91 s after that, and the HUD hides.
- **Play Again.** Space within the 0.7 s lock is ignored. After the lock, Space, Enter and the button all restart. Menu returns to the title.
- **Drops.**
  - One drop is made per flap, and the cooldown blocks instant repeats.
  - Airborne drops never exceed `maxDrops`.
  - A deterministic shell hit gives +1 and the turtle's happy frame.
  - A miss emits a `miss` event, resets the combo and does not end the round.
  - A combo of 3 gives +2 on the third hit.
  - The ceiling gives a soft bounce and doesn't kill.
- **Seasons, tested with Settings → 5 points per season.** The new world uses 5. The season advances at 5, 10, 15 and 20 points: Summer → Autumn → Winter → Spring.
  - Weather sprites switch fully: Summer has butterflies, seeds and pollen dots; Autumn has three leaf colours; Winter has snowflakes and dots; Spring has petals, blossoms and seeds. No old-season sprites remain after the handover.
  - The HUD season name, the backdrop and the music season all follow.
  - A new game starts in Spring.
- **Pause.**
  - Esc, P and the HUD button all pause. Esc, P and Resume all resume.
  - While paused, nothing moves: world time, bird, scroll, weather and renderer time.
  - Window blur and a hidden tab auto-pause.
  - Restart gives a fresh READY round with score 0.
  - Pausing from READY resumes into READY.
  - Pause → Settings → Esc returns to the pause screen, and Main Menu goes to the title.
- **Settings.**
  - Easy, Normal and Hard give different `world.cfg` values for gravity, scroll speed, turtle speed, `shellForgive` and wind. Easy is gentler and Hard is harder.
  - Sound, music, difficulty and points-per-season persist across a reload, both in localStorage and in the UI.
  - Reset best clears every difficulty, shows a toast and refreshes the title.
  - M toggles mute, the HUD icon and a toast.
  - F11 on/off works in both browser and app modes.
- **Best score.** It is saved per difficulty. NEW! shows only on a real improvement and never for 0.
- **Change Pictures.**
  - The bird, treat, turtle and spring background go through the real file chooser. Each slot then shows "★ Your picture".
  - The renderer draws `custom:*` sprites, and a pixel probe finds the custom bird on the canvas.
  - The Round shape works and persists. Pictures persist after a reload.
  - Per-slot Reset and Reset all work, and storage is cleared.
  - A `.txt` file and a corrupt PNG each give a friendly toast and keep the existing picture.
  - An SVG with no width or height is accepted at 150×150.
  - A 4000×3000 character picture is stored at 640×480. A 4000×3000 background is stored at 1440×1080.
- **App mode, with the Go bindings emulated.**
  - `FF.Storage.native` is true, the Quit button is visible, and settings and pictures go through `ffStoreSet` and reload from `ffStoreAll`.
  - F11 calls `ffFullscreen(true)` and then `ffFullscreen(false)`. Quit calls `ffQuit`.
- **Layout.** Tested at 800×600, 1024×768, 1280×720, 1366×768, 1920×1080 and 2560×1440, each at DPR 1 and 1.5.
  - The canvas is letterboxed 16:9, centred, and its backing store is the CSS size × DPR.
  - All six screens (title, settings, pictures, how-to, pause, game over) fit with no clipped or scrolled-away buttons.
  - Live resizing while playing works.
- **Keyboard focus.**
  - Space or Enter on the focused Play button starts the game exactly once, and the next Space flaps.
  - After clicking Play, focus is cleared, so Space flaps.
  - Space on a Settings toggle toggles it.
  - Enter on the pause screen activates Resume.

## Bugs

### B1 (MAJOR): Clicking the HUD Pause or Mute button also flaps the bird and drops a treat
- **Repro:** Start playing and click the pause button (top-right). `world.flaps` and `drops_made` each go up by 1 (check *"pause button click does not flap…"*). The same happens with the mute button. The extra drop usually misses, which resets the player's combo, and the bird jumps just as the game pauses.
- **Root cause:**
  - `game/js/main.js:198-201`: the `pointerdown` listener on `#stage` flaps for any pointerdown during ready or playing.
  - `#hud` is inside `#stage` (`game/index.html:15-20`).
  - The HUD buttons only call `stopPropagation()` on `click` (`game/js/ui.js:14`), and `pointerdown` fires before `click`.
- **Fix:** In the stage `pointerdown` handler, return early when the target is UI:
  ```js
  if (e.target.closest('button, .screen, #hud')) return;
  ```

### B2 (MAJOR in browser mode; the exe is not affected): Pictures are silently lost when browser storage is full
- **Repro:** In a browser, choose four photo-like 1920×1080 backgrounds and three 640×640 characters. Each choice says "Picture saved!" and works for the current session. After a reload, 5 of the 7 are gone (`after: [false,false,false,true,true,false,false]`).
  - The data URLs total about 14 M characters, against Chrome's localStorage limit of about 5 M characters.
  - Real photos compress better, but 4 backgrounds + 3 characters can still hit the limit.
- **Root cause:**
  - `game/js/storage.js:28-33`: `set()` catches `QuotaExceededError`, only `console.warn`s, and leaves the value in the in-memory cache, so the UI believes it was saved.
  - `game/js/assets.js:133-135` and `game/js/ui.js:168-172` never learn about the failure.
  - In native mode, `storage.js:31` ignores the `false` that `ffStoreSet` returns on failure.
- **Fix:**
  1. Make `Storage.set` return `false` (or throw) on quota errors and remove the value from the cache. In `Assets.setCustom`, check the result and reject with *"That picture is too big to save — try a smaller one, or reset another picture."*
  2. Store smaller files. Use backgrounds of at most 1280×720 as JPEG at quality 0.85; the game draws at 960×540 logical, around 1.1× for panning. Use characters of at most 512 px as `image/webp` at quality 0.9, which keeps transparency and is roughly 3–5× smaller than PNG; fall back to PNG if `toDataURL('image/webp')` does not return `data:image/webp`.
  3. In native mode, await `ffStoreSet` inside `setCustom` and surface a `false` result.

### B3 (MINOR): Enter or a mouse click on Play Again restarts within the 0.7 s anti-mash lock
- **Repro:** Let the bird die. About 100 ms after the panel appears, press Enter (or click Play Again). The game restarts at once (check *"Enter within 0.7 s lock is ignored"*: `focused=btnAgain, mode=ready`). Space is correctly ignored.
- **Root cause:**
  - `game/js/ui.js:83-84` focuses the first `.btn-big` (`#btnAgain`) 30 ms after the screen shows.
  - Enter triggers the button's native activation, which calls `click('btnAgain', () => game.startGame())` (`game/js/ui.js:24`) with no lock check.
  - `game/js/main.js:195` only calls `preventDefault` on Enter when the lock has expired.
- **Fix:**
  - Guard the button: `click('btnAgain', () => { if (performance.now() - game.overAt > 700) game.startGame(); })`.
  - In `main.js:195`, call `e.preventDefault()` for Enter in `over` mode unconditionally and start only after the lock.
  - Optionally, delay focusing `#btnAgain` until the lock ends.

### B4 (MINOR): Music keeps playing on the title screen after Menu or Main Menu
- **Repro:** Play, then Pause → Main Menu (or Game Over → Menu). `FF.Audio._musicPlaying` is still `true`, so the season music plays over the title. On a fresh boot the title is silent.
- **Root cause:** `game/js/main.js:71-84`: `toTitle()` never stops the music, which `startGame()` started at `main.js:96`.
- **Fix:** Add `FF.Audio.stopMusic();` to `toTitle()`, or decide that the title has music and start it there too, for consistency.

### B5 (MINOR, test hygiene): `?mute=1` is written into the saved settings
- **Repro:** Open `index.html?mute=1` and change any setting. `ff:settings` now contains `"muted":true`, so the next normal launch is silent.
- **Root cause:** `game/js/main.js:46` copies the URL flag into `this.settings`, and `setSetting()` (`main.js:155`) persists the whole object.
- **Fix:** Keep the flag separate (`this.urlMute = params.get('mute') === '1'`). Pass `muted: this.settings.muted || this.urlMute` to `FF.Audio.setOptions` at `main.js:47` and `main.js:156`.

### B6 (MINOR, browser only): The Full screen checkbox stays ticked after leaving fullscreen with the browser's Esc
- **Repro:** Settings → tick Full screen, then exit fullscreen outside the game (browser Esc). `Game.fullscreen` becomes `false`, but `#setFull` stays checked.
- **Root cause:** `game/js/main.js:208`: the `fullscreenchange` handler updates the flag but not the UI.
- **Fix:** Call `FF.UI.syncSettings()` at the end of that handler.

### B7 (MINOR, accessibility): Space on the title always starts the game, even when another button has keyboard focus
- **Repro:** On the title, Tab to Settings (or Change Pictures) and press Space. The game starts instead of opening Settings. Enter works correctly.
- **Root cause:** `game/js/main.js:193` intercepts Space whenever `ui === 'scrTitle'`, whatever is focused.
- **Fix:** Only start the game if nothing is focused or Play is focused:
  ```js
  const a = document.activeElement;
  if (a && a.tagName === 'BUTTON' && a.id !== 'btnPlay') return;
  ```
  Put this before the Space-starts-game line, and let native activation handle other buttons.

### B8 (MINOR, polish): Pause is allowed during the 0.9 s "death beat"
- **Repro:** Let the bird hit the ground and press Esc within 0.9 s, or alt-tab, which triggers the blur pause. The "Paused" panel shows over the dead bird. Resume then immediately shows Game Over.
- **Root cause:** `game/js/main.js` `pause()` only checks the mode, which is still `playing` while `world.state === 'dead'`. The blur handler is at `main.js:202`.
- **Fix:** In `pause()`, add `if (this.world && this.world.state === 'dead') return;`.

### B9 (MINOR, performance): Rebuilding the picture cards re-encodes every custom picture as PNG
- **Detail:** `game/js/ui.js:131` calls `c.toDataURL()` on the full-size processed canvas (backgrounds up to 1920×1080) every time the cards are rebuilt: after each pick, shape click or reset. With 4 custom backgrounds this takes 94 ms per rebuild on a fast machine, which is noticeable on low-end laptops.
- **Fix:** For backgrounds and the "fit" shape, use the already-stored data URL (`FF.Assets.customSrc[id].src`). Otherwise, draw into a small thumbnail canvas (about 320×200) and append that canvas directly.

## Go wrapper review (`app/main.go`; it can't run here and passes `go vet` for GOOS=windows)
No blockers were found.
- Binding calls in go-webview2 (`msgcb` → `callbinding`) run synchronously on the UI thread. `ffFullscreen` and `ffQuit` correctly use `Dispatch`.
- The store is fine:
  - Writes go to a `.tmp` file and are then renamed; Go's `os.Rename` replaces the existing file on Windows.
  - Keys are validated against `^[a-zA-Z0-9_-]{1,64}$`. Every key the game uses fits (`img_bg_winter`, `shape_bird`, `best_normal`, `settings`).
  - The 12 MB value limit is far above the downscaled pictures.
  - `ffStoreAll` returns every picture in one `Eval` at boot, a few MB at most. That is acceptable.
- Fullscreen is correct:
  - The style math is right: `WS_OVERLAPPEDWINDOW` is `0x00CF0000`.
  - Negative monitor coordinates are sign-extended correctly by `uintptr(int32)`.
- http.FileServer redirects `/index.html?app=1` to `./?app=1` and keeps the query, so `isApp` still works. Detection also falls back on `typeof ffStoreSet`.
- **G1 (minor):** `Width: 1280, Height: 760` (`app/main.go:194-195`) is passed to `CreateWindowExW` in physical pixels, and the manifest is PerMonitorV2. On a 150 % display the window is only about 853×507 DIP, so it looks small. **Fix:** after creating the window, scale the size by `GetDpiForWindow(hwnd)/96` with `SetWindowPos`, or show it maximized (`ShowWindow(hwnd, SW_MAXIMIZE)`; `procShowWindow` and `swMaximize` are already declared but unused).
- **G2 (minor):** WebView2 zoom (Ctrl+wheel, Ctrl+±) and browser accelerators (F5, Ctrl+R, Ctrl+P) are left enabled, so kids can accidentally zoom or reload. The layout survives zoom, but consider disabling zoom through `ICoreWebView2Settings.PutIsZoomControlEnabled(false)`. That needs access to the settings object; the library only exposes it internally.
- **G3 (minor):** In the browser fallback (no WebView2 runtime), the server listens on a random port each launch. The localStorage origin therefore changes every run, so pictures, settings and best scores are not kept. **Fix:** try a fixed port first, such as `127.0.0.1:47823`, then fall back to `:0`.

## Fixed during testing (no action needed)
- In my first run, the **Change Pictures** panel overflowed on every 16:9 window (1280×720, 1366×768, 1920×1080, 2560×1440). The second row of slots, **Reset all** and **Done** were below the panel fold and needed scrolling. The integrator's CSS and layout change (3 + 4 cards) fixed it. The layout checks and the screenshot `15_layout_2560x1440_scrCustom.png` now pass.
