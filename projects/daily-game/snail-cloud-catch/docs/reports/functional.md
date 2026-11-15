# Functional QA: Shelly's Sky Catch (2026-11-15)

Tested in headless Chromium (Playwright) on Linux. The game code was not changed. Only `tests/e2e/functional.js` and this report were edited.

## Results per suite

| Suite | Command | Result |
|---|---|---|
| Unit (mechanics, bot, weather, perf) | `node tests/unit/run.js` | **30 passed, 0 failed** |
| Smoke | `node tests/e2e/smoke.js` | **PASS** (bot ×8, game over, no console errors) |
| Functional, original suite (full) | `node tests/e2e/functional.js` | 236 passed, **1 failed** (a flaky test, see note 1) |
| Functional, extended by QA (full) | `node tests/e2e/functional.js` | **300 passed, 4 failed** (4 real issues, below), ≈ 4 min 45 s |
| Mobile | `node tests/e2e/mobile.js` | **98 passed, 0 failed** |
| Mobile QA (quick) | `node tests/e2e/mobile_qa.js --quick` | **59 passed, 0 failed** |
| Shared extras (volume + Score Card) | `node shared/daily-mobile/test_extras.js projects/daily-game/snail-cloud-catch` | **EXTRAS PASSED** |

Every suite prints PASS / FAIL lines and exits 1 when anything fails. The extended functional suite exits 1 now because of the open issues below. It will go green once they are fixed.

**Note 1: the original failure was a flaky test, not a game bug.** `over: Enter spam in the first 0.7 s does not restart` pressed Enter 6 times with fixed waits. On a loaded machine the presses ran past the 700 ms restart lock (the debug run restarted at +727 ms, after the lock had expired). The lock itself works: `main.js:139`. The test now resets the lock clock, and only spams Enter and Space (alternating) while less than 600 ms have passed, measured inside the page.

## What the extended suite covers

- **Menus:** title, How to Play, Settings, Change Pictures, Pause, Game Over and the Score Card. Each has its Back / Done / Esc path.
- **Moving Shelly:**
  - ← → A D, with clamping at both edges.
  - Mouse-follow with overshoot under 4 px; the cursor's height has no effect.
  - The cursor leaving the window keeps Shelly in range.
  - The keyboard overrides the mouse, and Shelly doesn't snap back to a cursor that hasn't moved.
- **Touch steering:**
  - Holding and dragging a finger steers.
  - Lifting all fingers stops the follow.
  - A tap on 🚀 is never counted as the steering finger (new test).
- **Jet Hop:**
  - Fires from Space, ↑, W, Enter, right-click, the 🚀 button and a second finger.
  - Nothing happens while airborne or recharging.
  - Holding a key fires once (auto-repeat ignored).
  - Nothing happens while paused.
- **HUD isolation:**
  - Hovering or clicking Pause or Mute never moves Shelly.
  - Right-clicking the HUD neither hops nor pauses (new test).
  - A HUD tap by touch neither steers nor hops.
- **Game over:**
  - Enter/Space spam during the lock does nothing.
  - After the lock, the same spam starts exactly one game, and a double-click on Play Again starts one game.
  - Enter on the focused Menu or Score Card button (new tests, which fail; see P2-1).
- **Pause:** Esc and P, auto-pause on blur and on a hidden tab, held keys cleared on blur, Restart, Main Menu, and no pause during the death animation.
- **Settings persistence:**
  - Sound effects, music, difficulty and Level length (new test) persist across reload.
  - `?mute=1` is never saved, both on its own and combined with M (new test, which fails; see P3-1).
- **Volume** (new tests):
  - Nothing is written until the player moves the slider; toggling sound, music or M never writes a volume.
  - The − button reaches 0 % and the + button goes from 0 to 10 %.
  - Moving the slider to 0 and then to 65 saves 65 %, which survives a reload and is applied once the AudioContext exists.
  - `?mute=1` leaves the saved volume alone.
- **Best score:** NEW badge, kept per difficulty, credited to the difficulty the run started on, and Reset.
- **Change Pictures, with generated images uploaded via the file chooser (`setInputFiles`):**
  - Hero photo becomes a round sticker; a transparent star stays "Whole picture"; puff upload works.
  - **A custom background for each of the four weathers is saved at 1280×720 or smaller, and each one is drawn in its own weather** (new test).
  - Error handling: a .txt file, a corrupt PNG and an empty file each get a friendly error.
  - Huge images: a 5000×4000 JPEG background and a 6000×6000 PNG hero (shrunk to 512 px in about 0.7 s) are both accepted.
  - Reset one, Reset all, and pictures survive a reload.
- **Layout:**
  - Desktop: 1280×720 (DPR 1 and 2), 1920×1080, 800×600.
  - Touch / isMobile: 1024×768 (DPR 1 and 2), 844×390 (DPR 2 and 3), 390×844 (DPR 2 and 3), and new 1366×1024, 1024×1366 and 667×375 (DPR 2).
  - On every one: the canvas fills the screen, the backing store stays under the cap, and every panel fits. A panel may scroll on touch, as long as every button can be scrolled into view.
  - The HUD and 🚀 are on screen and finger-sized, and the page never scrolls. **All pass.**
- **Long run at `?speed=16`** (bot, auto-restart, an idle phase so games end): 60 s, 7 games, up to level 6. No errors; particles under 70, fx at most 30, items and texts bounded.
- **Loudness** (new test): an AnalyserNode is tapped after the make-up gain while the bot plays with sound and music at 100 % volume, for 25 s.

## Issues

### P2-1: On the game-over screen, Enter on the focused "Menu" or "Score Card" button starts a new game
- **Repro:**
  1. Lose a game and wait 1 s.
  2. Press Tab to move focus to **Menu** (or **Score Card**).
  3. Press Enter.
  4. Expected: the title screen (or the card). Actual: a new game starts.
- **Where:** `game/js/main.js:212`. The global keydown handler takes every Enter/Space in `over` mode, calls `preventDefault()` (which also cancels the focused button's own click) and calls `startGame()`.
- **Fix:** only treat the key as "Play Again" when no other button has focus:
  ```js
  if (this.mode === 'over' && (e.code === 'Enter' || e.code === 'Space')) {
    const f = document.activeElement;
    if (f && f.tagName === 'BUTTON' && f.id !== 'btnAgain') return;   // let Menu / Score Card handle their own key
    e.preventDefault(); if (this.canRestart()) this.startGame(); return;
  }
  ```
  `btnAgain`'s own click is already guarded by `canRestart()` (`ui.js:41`), so the restart lock still holds.
- **Tests:** `over keys: Enter on the focused Menu button…` and `…Score Card button…`

### P3-1: With `?mute=1`, pressing M saves `muted: true` for the next normal launch
- **Repro:**
  1. Open `index.html?mute=1`.
  2. Press M. The toast says "Sound off", although the sound was already off.
  3. Open `index.html` without the switch: the game starts muted.
- **Where:** `game/js/main.js:168`. `toggleMute()` flips `settings.muted` and saves it, but the effective mute state is `settings.muted || urlMute` (`main.js:33`), so M can never unmute in this session and its first press only writes `true`.
- **Fix:** while `urlMute` is on, make M a session-only toggle:
  ```js
  toggleMute() {
    if (this.urlMute) { this.urlMute = false; SC.Audio.setOptions({ muted: this.settings.muted }); }
    else this.setSetting('muted', !this.settings.muted);
    SC.UI.syncMute(); SC.UI.toast((this.settings.muted || this.urlMute) ? 'Sound off' : 'Sound on', 900);
  }
  ```
  The same change applies to the HUD mute button, which calls `toggleMute()`.
- **Test:** `settings+: with ?mute=1, pressing M does not save muted=true…`

### P3-2: The mix is about 5 dB quieter than the target
- **Measurement:** while the bot plays, with sound and music at 100 % volume, measured after the make-up gain:
  - **RMS −28.8 dBFS** (target ≈ −24).
  - **Peak −5.2 dBFS** (target ≈ −5, fine).
  - 95th-percentile window −21.4 dBFS, median −39 dBFS (long quiet gaps between sounds).
- **Repro:** `node tests/e2e/functional.js --only=loudness`
- **Where:** `game/js/audio.js:36` (make-up gain `× 1.7`) and `audio.js:80` (music bed `0.16`).
- **Fix:** a trial with the make-up gain at `× 2.4` measured **RMS −25.7, peak −2.9**. Two options:
  - Raise the make-up gain to about `× 2.3`.
  - Or raise the music bed to about `0.22` (the music fills the quiet gaps) and keep the make-up gain near `× 2.0`.

  Then re-run the loudness test: it passes when RMS is between −28 and −20 dBFS and the peak is at most −1 dBFS.
- **Also in audio.js:** lines 33–35 set the compressor threshold twice (−14, then −18). Delete the first line: it's dead code with a misleading comment.

### P3-3: A volume of 0 % is saved silently, and the HUD still shows "sound on"
- **Repro:**
  1. In Settings, drag Volume to 0 %.
  2. Reload: the game is silent, while the HUD speaker icon shows sound on and M only toggles mute.
- **Context:** the 0 is written only when the player moves the slider, which is correct (the tests confirm that nothing else writes it). But a child who slides it to 0 by accident gets a silent game with no visible reason.
- **Where:** `game/js/extras.js:50` (shared copy: `shared/daily-mobile/extras.js`) and `game/js/ui.js:89` (`syncMute`).
- **Fix:** do both of these:
  - Show the muted icon in `syncMute()` when `DailyExtras.volume() === 0`.
  - In `toggleMute()`, when unmuting with volume 0, set the volume to 50 % (`DailyExtras.setVolume(0.5)`).

  Alternatively, clamp the slider's minimum to 10 %.

### P3-4: Go wrapper hardening (`app/main.go`, review only; it can't be built offline here)
The code is sound: a loopback-only listener, a key whitelist regex, atomic writes (tmp file + rename), a 12 MiB value cap, and a browser fallback when WebView2 is missing. Minor points:
- `main.go:219`: `w.Bind(...)` exposes `ffStoreSet` / `ffStoreDel` to **any** page the WebView shows. The game has no external links today, but a future link would hand file write access to that site. Fix: before `w.Navigate`, add a `NavigationStarting` handler (or check `location.origin` in a small `w.Init` script) that blocks navigation away from `http://127.0.0.1:<port>`.
- `main.go:186`: the error from `http.Serve` is ignored. That's harmless, but log it or show a message box if the server stops.
- `main.go:172`: if port 47623 is taken, the fallback to a random port changes the page origin. That's fine here, because saves go through the file store and not localStorage. Worth a comment.
- `app/web/` is a stale build copy (missing `basket.svg`, `icon.svg` and others). It is gitignored and rebuilt by `tools/build.sh`, so this is not a bug, but don't test against it.

## Not covered or not feasible
- Real iOS Safari behaviour (audio session, the side switch, the Add to Home Screen launch) can't be tested in Chromium. The touch tests use CDP touch events.
- The Windows exe was not built (no network for Go modules) or run.
- Loudness is measured in headless Chromium with an AnalyserNode. Absolute speaker level on a phone will differ, but relative changes are reliable.
