# Functional QA: Pip's Oasis Glow

Date: 2026-11-27. Tester: functional QA agent (report only, no game code changed).

## How it was run
- `node tests/e2e/functional.js` is a rewritten suite for the firefly / gold / napper rules. It runs in about 9 minutes; `SOAK=20` makes it shorter and `ONLY=scoring,best` runs only some sections. Screenshots and `run.log` go to `tests/out/functional/`.
- `node tests/e2e/smoke.js`: **PASS**.
- `node shared/daily-mobile/test_extras.js projects/daily-game/frog-oasis-glow` (from the repo root): **EXTRAS PASSED** (27/27).
- `tests/qa/probe_settings.js`: a small probe that finds the element overflowing the Settings panel (issue P2-2).
- Chromium 158 (Playwright), file:// with `--allow-file-access-from-files`. iPhone notch safe areas are emulated with CDP `Emulation.setSafeAreaInsetsOverride` (844×390: 47/47 sides + 21 bottom; 390×844: 47 top + 34 bottom; iPads: 24 top + 20 bottom).

## Totals
**450 PASS, 7 FAIL** (457 checks). The 7 failures come from 4 distinct issues: 1 P2 game bug, 1 P2 layout bug, and 2 P3 issues. One more P3 (doc/CSS hygiene) was found by reading the code, with no failing check.

| Area | Result |
|---|---|
| Boot: title, zero console errors, all 100 % of art loaded, DESIGN §6 hooks | all pass |
| Menus: title, How to Play, Settings, Change Pictures, Pause, Game over (+ Score Card). Back via OK/Done/Esc, from title and from Pause | all pass |
| Inputs: mouse, right-click ignored, generous hit zone, empty hole/sky, mash guard (3 empty taps → 1.5 s nap, no heart lost), re-aim mid-hop, keys 1–9 + numpad in back-row-first order, auto-repeat, Esc/P, M | all pass |
| Focus / double triggers: Enter/Space on Play, Settings, How, Change Pictures, Play Again, Menu, Restart, Resume, each acting exactly once. 0.7 s restart lock on buttons and Enter. A held Enter after the lock starts once | all pass |
| HUD buttons: pointerdown/click/touch never reach `tapAt`. Pause works as a 2nd finger. No ghost clicks after touch screen changes | all pass |
| Touch (844×390 @3x): tap firefly / gold / napper, two fingers, second finger while first held | all pass |
| Scoring: 10 × mult with ×2 at combo 5 and ×3 at combo 10, combo events 5 and 10, gold 50 at ×1 and 150 at ×3, gold counts 1 firefly + 1 golden | all pass |
| Hearts: start 4, max 5, +1 on the 12th firefly, napper −1 + combo reset + 0.35 s busy lock, miss free on Easy and −1 heart/combo on Normal/Hard, napper ducking is never a miss, gold up ×0.75 | all pass |
| Chapters: 15 fireflies → +50 and busy during the page turn. Palm Grove has 8 holes in the designed layout, banner "Chapter 2 · The Palm Grove", weather and visuals switch, first pop is a firefly. Dunes and night have 9 holes. Chapter 5 = spring "Book 2", faster | pass, except **P2-1** |
| Game over: last heart → over screen after ~1.6 s. Stats, medal (none / bronze), best per difficulty, NEW!, Reset best needs two taps | all pass |
| Best never saved for bot, `?speed`, `?level`, `?diff` | pass, except **P3-1** (debug hook) |
| Settings persistence: sfx, music, difficulty, volume across reload. `?mute=1` and `?diff=` never saved. Corrupt settings JSON and unknown difficulty fall back to defaults | all pass |
| Change Pictures: PNG cut-out → "Whole picture", JPEG photo → round sticker, shape toggles, 4000×3000 → 1600×1200, .txt and broken PNG give friendly messages, filling all 4 backgrounds degrades gracefully, survives reload, drawn in gameplay, Reset one / Reset all | all pass |
| Layout (1280×720, 1920×1080, 844×390@3, 390×844@3, 1024×768@2, 1366×1024@2): no page scroll, stage fits, panels in view and in the safe area, DOM and canvas HUD in the safe area and not overlapping each other or any hit zone, hit radius ≥ 22 px, real taps on holes 1/5/9 | pass, except **P2-2** and **P3-2** |
| Portrait: rotate card on phones only, world frozen behind it, dismiss once per session, rotation re-layout. iPad portrait shows no card | all pass |
| Auto-pause on blur and on a hidden tab; never pauses during the game-over moment | all pass |
| Soak `?speed=16`: skill 1 Easy 20.2 min of game time (level 37), skill 0.2 Normal 11.6 min (8 games). 0 errors, no NaN. Particles ≤ 30 (cap 60), ripples ≤ 3, fx ≤ 4, sprite cache ≤ 235, ≤ 3 pre-rendered chapters, heap 3 → 5 MB | all pass |

## Issues

### P2-1: A hop in flight when the chapter changes to a smaller layout crashes `_land`, and Pip freezes mid-air
- **Repro:** chapter 4 (night, 9 holes), firefly in hole 9. `POG.debug.tap(8); POG.debug.gotoLevel(4)` (to the 6-hole spring). Console shows `TypeError: Cannot read properties of undefined (reading 'critter') at P._land (world.js:369)`. After that Pip stays in state `'hop'` at the old head point (770, 368) with no flight, so he hangs in the field until the next tap. The failing check is `chapter: changing to a 6-hole chapter while Pip hops to hole 9…`.
- **Cause:** `game/js/world.js:155` `_enterLevel` sets only `this._fl.cid = -1` for a hop in flight and keeps `_fl.hole`. Then `game/js/world.js:369` indexes `this.holes[f.hole]` in the new, shorter layout. `_fl = null` has already run at :367, so the state machine is left with `state 'hop'` and no flight. Natural play cannot reach this, because the 1.2 s `CLEAR_T` is longer than the 0.55 s maximum hop. But the debug `gotoLevel` path (smoke test, visual capture, playtester tools) does hit it. The first version of this suite hit it 6 times by chance.
- **Fix:** in `_enterLevel` (world.js:155), send Pip home instead of keeping a stale target:
  `if (this._fl && this._fl.kind === 'hop') { this._fl.cid = -1; this._fl.hole = -1; this.pip.target = null; }`.
  Better still, call `this._goHome()` there. Also guard world.js:369:
  `var hole = f.hole >= 0 ? this.holes[f.hole] : null, c = hole ? hole.critter : null;`.

### P2-2: Settings panel overflows sideways on an iPhone in landscape with the notch (safe-area) insets
- **Repro:** 844×390 @3x with safe-area insets 47/47/21 → Settings. The panel's `scrollWidth` is 739 and its `clientWidth` is 728. The right column (Music toggle, Easy/Normal/Hard, Reset) runs past the panel's padding to the edge and the panel scrolls sideways. Screenshot: `tests/out/functional/probe_settings_insets.png`. Without insets it fits.
- **Cause:** `game/css/style.css:296` uses `grid-template-columns:1fr 1fr`. `1fr` has a min-content floor, and the Volume row (− slider 100% +, slider `width:min(28vw,180px)` from extras.js) is wider than half of the inset-narrowed panel.
- **Fix:** style.css:296 → `grid-template-columns:minmax(0,1fr) minmax(0,1fr)`. In the same media block, add `#scrSettings .set-volume input[type=range]{width:auto;flex:1 1 60px;min-width:60px}` and `#scrSettings .set{min-width:0}` so the slider shrinks instead.

### P3-1: `debug.setSpeed(n)` taint is cleared by the next `startGame()`
- **Repro:** `POG.debug.setSpeed(4); POG.debug.startGame()`, then play to game over. The score is saved as best (`best_normal` became 88888 in the test).
- **Cause:** `game/js/main.js:90` recomputes `runTainted` from URL params only. `setSpeed` (main.js:332) sets the flag on the current run, but the new run resets it while `Game.speed` is still 4.
- **Fix:** main.js:90, add `|| this.speed !== 1` to the `runTainted` expression.

### P3-2: Volume − / + buttons are 36×36 px on touch screens (finger target < 44 px)
- **Repro:** any touch layout → Settings. `.vol-step` measures 36×36. This failed on all 4 touch devices.
- **Cause:** `game/js/extras.js:263` (shared source `shared/daily-mobile/extras.js`) sets `width:36px;height:36px`.
- **Fix:** use 44 px in the shared extras.js, or add `body.touch .vol-step{width:44px;height:44px}`. Then copy it to every daily game. The shared `test_extras.js` does not check target size, so it could add that check.

### P3-3: Small hygiene items (no failing check)
- `game/css/style.css:298` has the selector `#scrSettings   #scrSettings .menu{margin-top:6px}`. The selector is doubled and never matches. It should read `#scrSettings .menu{…}`.
- `CLAUDE.md` still describes the fork ("Zippy's Jungle Boop", colour matching, 2026-11-11, functional 264/264). Rewrite the Goal and Status sections for Pip's Oasis Glow before committing.
- `main.js` header comment says "jungle friend". This is cosmetic.

## `app/main.go` review (Windows wrapper)
No blocking bugs found. The key regex accepts every key the game writes (`settings`, `best_*`, `img_*`, `shape_*`, `volume`). The write uses a temp file and then a rename (Go's `os.Rename` replaces on Windows). The 12 MB value limit is well above a 1600 px JPEG background. `.tmp` leftovers are ignored by `All()`. The port fallback loop and single-instance mutex are correct, and `WS_OVERLAPPEDWINDOW` (0x00CF0000) is correct. Notes:
- If all 4 fixed ports are taken, the random-port fallback changes the origin. That only matters in the browser fallback, where localStorage is per origin. This is already listed as open in CLAUDE.md.
- `pgFullscreen` returns the requested state before the dispatched change runs. This is harmless because JS ignores the value.
- The `pgStoreSet` error path: a write failure returns `false`, and `Storage.set` rolls back the cache correctly (storage.js:44).
- The browser-fallback message box blocks until OK and then the server stops, which ends the game in the browser. This is documented in the message text.

## Not covered
A real iPhone or iPad (Safari gestures, audio unlock, real notch), audio by ear, and the exe on Windows.

## Re-run after fixes (lead, 2026-11-27)
Full suite 456/457; the one failure (Settings 2 px sideways overflow at 390×844 after the 44 px volume buttons) was fixed in `style.css`, and the `ONLY=layout` group then passed 227/227. Unit 30/30, smoke PASS, `test_extras.js` PASS. The test assumptions for 4 starting hearts were updated to the new `START_LEAVES` 5.
