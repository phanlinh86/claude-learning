# Functional QA report: Zippy's Jungle Boop

- **Date:** 2026-11-11
- **Build:** working tree at `b4183b5` (integrate art, mechanics and UI, WIP)
- **Script:** `tests/e2e/functional.js` (Playwright Chromium, `file://` with `--allow-file-access-from-files`)
- **How to run:** `node tests/e2e/functional.js`. A full run takes about 5 minutes. `SOAK=20` gives a shorter bot soak. Screenshots are saved to `tests/out/functional/`.

## Results summary

**260 PASS, 4 FAIL.** There are no P1 issues and no P2 issues. The 4 failures are P3 issues, listed below.

| Area | Checks | Result |
|---|---|---|
| Boot: title, bot demo, default Easy, zero console errors | 6 | all pass |
| Menus: Play, How to Play, Settings, Change Pictures, Pause/Resume/Restart/Settings/Main Menu, Game over Play Again/Menu, 0.7 s restart lock (button and Enter) | 22 | all pass |
| Inputs: mouse on a match, a wrong colour, an empty burrow, the sky, right-click; keys 1–9 in order, numpad, held key; Esc/P; number keys while paused; HUD buttons are not taps | 17 | all pass |
| Space/Enter on focused buttons: Play, Settings, How, Play Again, game-over Menu, Restart, Resume (one start each) | 10 | all pass |
| Touch (844×390 @3x): tap, two fingers at once, second finger while the first is held, HUD sound tap, Pause as a second finger, no ghost clicks after screen changes | 12 | all pass |
| Scoring: 10×mult (×2 at combo 5, ×3 at combo 10), +leaf on boop 12, max 5 leaves, wrong tap (−leaf, combo/mult reset), dizzy lock | 8 | all pass |
| Colour: change after 6 boops with a 1 s warning, 0.8 s grace, wrong after the grace, forced change after 14 s without a boop (measured 14.15 s) | 5 | all pass |
| Levels: 15 boops clear the biome (+50), taps are busy while clearing, Bamboo layout of 8 burrows matches `LAYOUTS[1]`, banner, 3 colours, canopy/ruins 9 burrows, loop "Round 2" | 6 | all pass |
| Miss rule (easy/normal/hard): up-time per preset, Easy costs nothing, Normal/Hard cost a leaf and the combo, a decoy ducking down is not a miss | 15 | all pass |
| Game over and best score per difficulty: NEW! badge, lower score keeps the best, Easy and Normal saved separately, a bot run does not save, Reset best needs 2 taps | 14 | **1 fail** (bot-assisted run, P3-1) |
| Settings persistence across reload (sfx, music, difficulty, muted), M key, `?mute=1` never saved | 11 | all pass |
| Change Pictures: PNG cut-out ("Whole picture"), opaque JPEG ("Round"), 4000×3000 photo becomes 1600×1200 (≈430 KB, 0.45 s), non-image file and broken PNG show friendly messages, all 4 backgrounds fit in storage, survives reload, custom art drawn in play on all biomes, reset one, reset all | 15 | all pass |
| Layout at 1280×720, 1920×1080, 844×390 @3x, iPad 1024×768, iPad Pro 1366×1024: no scroll, canvas fills the window, every screen and button on screen, ≥44 px touch targets, HUD clear of hit zones, hit radius ≥22 px (min 47 px on the phone) | 112 | **2 fail** (stage 2 device px too wide on iPads, P3-2) |
| Portrait 390×844: no rotate card on the title, card on Play, world frozen behind it, "Play upright anyway" is 44 px and works, a tap boops in portrait, card stays dismissed, rotating to landscape re-lays out | 12 | all pass |
| Portrait iPad 820×1180 | 1 | **1 fail** (phone rotate card on a tablet, P3-3) |
| Auto-pause: blur, visibilitychange, stays paused on return, no pause on the title, no pause during the game-over moment (and the over screen still arrives) | 7 | all pass |
| Bot soak at `?speed=16` (skill 1: 20 min of game time, level 40; skill 0.2 Normal: 12 min, 10 games with auto-restart) | 15 | all pass: 0 errors, ≤40 particles, ≤5 fx, sprite cache ≤218, heap 3 → 4 MB, no best saved |

Some failures during development were mistakes in the test, and I fixed them in the script. None were game bugs:
- I read the empty-tap ring in the same tick as the click. Events are drained on the next frame.
- The test spawned a "wrong" colour during grace, but in a 2-colour biome the grace colour still counts as a match.
- A screen was measured during its pop-in animation (scale overshoot).
- The test focused a button within 30 ms of `UI.show()` moving focus to Play.
- The low-skill soak ran on Easy, where a weak bot never loses: misses are free there and a leaf comes back every 12 boops. That is by design.

## Issues

### P3-1: A bot-assisted run can save a best score
- **Repro:** start a game, call `ZJB.debug.setBot(true, 1)`, let it score, then call `ZJB.debug.setBot(false)` and lose. `zjb:best_<diff>` now holds the bot's score (170 in the test). `tests/e2e/smoke.js` does exactly this, so running it against a real profile would overwrite a child's best.
- **Where:** `game/js/main.js:123` checks only `this.botMode` at game over. `game/js/main.js:334`: `setBot(false)` clears `botMode`.
- **Fix:** remember whether a bot touched the run.
  ```js
  // startGame()  (main.js:88)
  this.runBot = this.botMode;
  this.bot = this.botMode ? new ZJB.Bot(...) : null;
  // gameOver()   (main.js:123)
  const tainted = this.botMode || this.runBot;
  const prev = ..., newBest = w.score > prev && !tainted;
  if (newBest) ZJB.Storage.set(key, String(w.score));
  // ... best: tainted ? prev : Math.max(prev, w.score)
  // debug.setBot (main.js:334)
  setBot(on, skill) { Game.botMode = on; if (on) Game.runBot = true; Game.bot = on ? new ZJB.Bot(...) : null; },
  ```
  Optional: also treat `?speed≠1` / `?level` / `?diff` runs as test runs. Right now a `?diff=hard&autostart=1` session played by hand still saves `best_hard`.

### P3-2: On iPads the stage is 2 device px wider than the canvas
- **Repro:** iPad 1024×768 @2x (also 1366×1024). The backing store is capped at 1663 px wide, and `k = round(1.0667 × 1.6238 × 64) / 64 = 1.734375`, so 960·k = 1665 > 1663 and `ox = −1`. One device pixel of the stage (well under 1 CSS px) is cut off at each side. It is cosmetic only: hit zones and HUD are fine.
- **Where:** `game/js/render.js:58`
- **Fix:** round the scale down so the stage always fits.
  ```js
  this.k = Math.floor(this.cssScale * px * 64) / 64;
  ```

### P3-3: The "Turn your phone sideways" card appears on iPads held upright
- **Repro:** iPad 820×1180 (touch): press Play. The rotate card covers the game and the jungle freezes. The game would be 820×461 CSS px, about the size of a landscape phone. The text says "phone", which is wrong on a tablet, and the card is an extra step for a child.
- **Where:** `game/js/main.js:59` (`syncRotate`) shows it for any portrait touch screen. `game/index.html:131` has the text.
- **Fix:** ask only on small (phone) screens.
  ```js
  const small = Math.min(window.innerWidth, window.innerHeight) < 600;   // phones; iPads are ≥ 744 px wide
  const on = this.isTouch && small && this.renderer.portrait && this.mode === 'playing' && !this._rotOk && !this.botMode;
  ```

### Code review notes (no failing test)

- **`app/main.go:228` (P3):** if the 4 fixed ports are all taken, the server falls back to a random port. Normally that only changes the URL. But in the browser fallback (`main.go:261`, no WebView2), `localStorage` is per origin, so a new port means the child's saved pictures and best scores seem to vanish. Fix: in the fallback, refuse a random port and tell the player, or keep the data on disk through a small `/store` HTTP endpoint for the fallback page:
  ```go
  if err != nil && w == nil { messageBox(..., "Please close other copies of the game and try again."); return }
  ```
- **`app/main.go:108` (P3):** `Set` writes `tmp`, then renames it, without `Sync()`. After a power cut, NTFS can keep the renamed file empty. That would lose a custom picture, or turn a best score into `parseInt('') → 0`. Fix:
  ```go
  f, err := os.Create(tmp); if err != nil { return false }
  if _, err = f.Write([]byte(v)); err == nil { err = f.Sync() }
  if cerr := f.Close(); err != nil || cerr != nil { os.Remove(tmp); return false }
  return os.Rename(tmp, s.path(k)) == nil
  ```
- **`game/js/storage.js`:** the review found no bugs. Writes roll back the memory cache on a quota or native failure, and the per-key sequence numbers make sure a late failing write never clobbers a newer value. Reads are guarded, and blocked `localStorage` (Safari private mode) degrades to memory only. Change Pictures turns a full storage into the friendly "Not enough room…" toast. In the test, all 4 noisy 1600×1200 backgrounds plus 2 characters still fitted in Chromium's quota.
- **The rest of `main.go` looks correct.** The single-instance mutex check is right: `Call` always returns a last error, and the code compares it with `ERROR_ALREADY_EXISTS` only when the handle is non-zero. The `os.Rename` replace on Windows is fine. Keys are validated with `^[a-zA-Z0-9_\-]{1,64}$`, so there is no path traversal. The 12 MB value cap is well above the largest data URL (~0.6 MB).
