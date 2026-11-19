# Functional QA: Ziggy's Apple Castle (2026-11-19)

Report only: no game code was changed. The test suite is `tests/e2e/functional.js`. It now serves `game/` with `python3 -m http.server` on a free loopback port, so it runs on a real http origin like GitHub Pages. It prints PASS/FAIL for every check and exits with 1 if anything fails.

## Results

| Suite | Result |
|---|---|
| `node tests/unit/run.js` | **28/28 pass** (10 simulated minutes of bot play ran in about 2 s) |
| `node tests/e2e/smoke.js` | **pass**, exit 0, zero console errors (1 game, score 1360, reached Night) |
| `node shared/daily-mobile/test_extras.js projects/daily-game/kitten-apple-castle` | **27/27 pass** (EXTRAS PASSED) |
| `node tests/e2e/functional.js` | **448 pass, 5 fail** (about 13 min). Only 2 real issues cause the 5 failures (below). |

New in the functional suite (it was 272 checks, now 453):
- **extras**: volume slider and its −/+ buttons (saved as `kac:volume`, clamps at 0, survives a reload), the full-screen toggle and F11, the Score Card (opening it, Esc, and Enter/Space while it is open).
- **pointer**: synthetic `pointerdown` from mouse, touch and pen on the canvas; on the HUD buttons, icons and bar; on the Pause and Title screens.
- **rules2**: combo cap (combo 5, 6 and 10 all give +50), Noon apple = 5, Night glow apple = 10 (plus the `glowApples` stat), a pie at full hearts gives `gained:false` and no heart above the max.
- **zones**: a perfect bot plays Dawn → Noon → Sunset → Night → Dawn round 2. It checks goal bonuses 100/200/300/400, Granny Boo appearing 4×, loop goal 11 and a faster swing, that the renderer and weather switch scenes, and that **light changes in one direction only within each level** (dawn 0.85→1.0, noon 1.0→0.55, sunset 0.55→0.30, night 0.30→0.24, dawn 2 0.24→0.86). It also checks lanterns = perfects (55/55), that the darkest night is never black (luminance 54, darkness 0.62) and that the tower top stays lit with lanterns (`lit` 0.65).
- **storage**: every key uses `kac:`. The settings JSON holds only sfx/music/muted/difficulty. With `?mute=1&diff=hard&speed…` in the URL, nothing from those flags is saved. A corrupt settings value or best score falls back to defaults.
- **pictures**: all **7 slots** get a picture, including Noon, Sunset and Night. Darkness still falls over a custom Night picture, and all 7 survive a reload.
- **layout**: 4 more touch sizes: 844×390@3, 1024×768@2, 1366×1024@2 and 1024×1366@2.
- **safe area**: notch and home-indicator insets are injected into `#safeProbe` at 390×844, 844×390, 1024×768 and 1366×1024. Checks: the insets reach the renderer, the HUD panels and buttons sit inside the safe area, Ziggy's swing stays clear of the notch, and no rotate prompt blocks play.
- **rotation**: portrait → landscape with a crate in the air, and rotating while paused.
- **long run**: a check that at least 5 simulated minutes were played (15.4 min at ×16: 10 games, 0 stuck, at most 107 particles, at most 7 fx, at most 14 crates, 0 errors).
- **static**: Go wrapper checks for a loopback-only listener, the 12 MB value cap, the key filter, the WebView2 profile with Debug off, and UI-thread dispatch.

All requested areas pass apart from the issues below: boot with zero errors; every menu and input; the HUD never drops a crate; scoring; hearts and pies; light; zones and loop; pause and blur; the 0.7 s restart lock; no double start; settings persistence; `?mute=1` never saved; best score per difficulty; layouts; the long run.

## Issues

### P2-1: Enter/Space with the Score Card open starts a new game behind the card, and the card stays over the game
- **Repro:** desktop Chromium on Linux, or any browser without `navigator.share` (for example Firefox), or tab to "Save picture". Lose a game, tap **Score Card**, then press **Enter** or **Space**.
- **Result:** `startGame()` runs while the card is still open. The run is playing underneath, invisible, and the card's own Close button is now the only way back. Test: `extras: Enter/Space with the Score Card open (focus scSave) …` (4 FAILs).
- **Cause:** `game/js/main.js:185`. The game-over key handler only lets *buttons* other than `btnAgain` keep their keys. The card focuses the `<a id="scSave">` link when Share is hidden (`game/js/extras.js:243-244`), so the handler takes the key. `startGame()` (`main.js:76`) never closes `#scScreen`, because it is not in `UI.SCREENS`.
- **Fix:** in `main.js:185`, return early when the card is open or when the focus is any control:
  ```js
  const card = document.getElementById('scScreen');
  if (card && !card.classList.contains('hidden')) return;
  const f = document.activeElement;
  if (f && f.id !== 'btnAgain' && f.matches && f.matches('button, a, input, [role=button]')) return;
  ```
  Also, belt and braces: in `startGame()` / `toTitle()` add `document.getElementById('scScreen')?.classList.add('hidden')`.

### P2-2: How to Play does not fit on an iPhone in landscape (844×390), and the only exit button is below the fold
- **Repro:** iPhone 12/13/14 in landscape (844×390 touch). Title → **How to Play**.
- **Result:** the panel fills the screen and scrolls. The "OK, let's play!" button is hidden below the bottom edge (`func_phone_land_844x390_scrHow.png`). Nothing shows that the panel scrolls, and a child has no Esc key, so they look stuck. Test: `layout phone_land_844x390@3x: scrHow fits the screen` (FAIL). The same screen fits at 390×844, 1180×820 and the iPads.
- **Cause:** `game/css/style.css:250`. The `(pointer:coarse)` rule sets a 14 px minimum font for `.how p`, and the short-landscape (`max-height:430px`) blocks don't shrink How to Play.
- **Fix (either one):**
  - Compact the screen for short touch landscape:
    ```css
    @media (pointer:coarse) and (max-height:430px){
      #scrHow .how p{font-size:12.5px;line-height:1.25}
      #scrHow .how-ico img{width:calc(var(--u)*4)}
      #scrHow h2{margin:0 0 4px}
    }
    ```
  - Or keep the button visible: `#scrHow .menu{position:sticky;bottom:0;background:inherit;padding-top:6px}`.

### P3-1: DESIGN §9 promises a "rotate prompt" the game doesn't have
`docs/DESIGN.md:87` lists a rotate prompt in the mobile layer. The game has none, and that is correct: it supports portrait and landscape (REQUIREMENT, "portrait and landscape"), and the tests confirm play works in both and across a rotation. **Fix:** change the DESIGN line to "both orientations supported; no rotate prompt".

### P3-2: Round 2 Dawn starts in Night darkness (sunrise of about 2 s), so its first apples count as glow apples
`game/js/world.js:263`: a non-instant level start keeps the current light, so after the loop Dawn starts at 0.24 and eases up to 0.85 (`lightRate` 1/s). This reads nicely as a sunrise. But for the first second or so `light < 0.5`, so apples spawned or caught then are "glow" (+10) in Dawn. This is minor, and the light still only rises. **Fix (optional):** in `_startLevel` when `zone === 0 && loop > 0`, use `CONFIG.lightRate * 3` for that level, or treat apples as glow only when `light < glowBelow && zone >= 2`.

### P3-3 (Go wrapper): MIME types depend on the Windows registry
`app/main.go:222-226` serves files with `http.FileServer`, which takes Content-Type from Go's `mime` package. On Windows that package reads the registry, and some PCs map `.js`/`.css` to odd types (a known Go issue: `.js` served as text/plain). A stylesheet with the wrong MIME type is blocked in standards mode. **Fix:** set the type in the handler before `fileServer.ServeHTTP`:
```go
switch filepath.Ext(r.URL.Path) {
case ".js": w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
case ".css": w.Header().Set("Content-Type", "text/css; charset=utf-8")
case ".svg": w.Header().Set("Content-Type", "image/svg+xml")
case ".webmanifest": w.Header().Set("Content-Type", "application/manifest+json")
}
```

### Go wrapper review: other notes (no change needed)
- Good: loopback-only listener with a fixed port 47627 and a free-port fallback; single-instance mutex that focuses the existing window; atomic tmp+rename writes; the key regex is checked on Set/Del/All; 12 MB value cap; storage roll-back on failure (in `storage.js`); WebView2 profile in `%LOCALAPPDATA%`; Debug off; full screen and quit dispatched to the UI thread; full screen restores through WINDOWPLACEMENT.
- Known and accepted: the browser fallback (no WebView2) keeps the server alive only while its message box is open. If port 47627 is taken, the random fallback port changes the origin, so browser-fallback saves would not carry over. This does not affect the WebView2 app, which uses the file store.

## Note on the test harness
- The layout tour forces each screen up while the HUD is visible, so screenshots such as `func_phone_land_844x390_scrHow.png` show the pause and sound buttons over the panel. In real play the HUD is hidden on menus, so this is not a game bug.
- Run one section with `node tests/e2e/functional.js <section>` (for example `sExtras`, `sZones`, `sSafeArea`). Set `LONG_RUN_S` to shorten or lengthen the soak.
