# Kit's Toybox Beat: functional QA report

- **Date:** 2026-11-01
- **Suite:** `tests/e2e/functional.js` (Playwright with Chromium, `file://`, using the DESIGN §5.4 test hooks)
- **Run it from the project folder:** `node tests/e2e/functional.js`, or `--only=menus,input,judging,progression,settings,pause,custom,storage,layout,soak`
- **Run time:** about 4.5 minutes. The script prints PASS or FAIL for each check and exits with code 1 if any check fails. Screenshots go to `tests/out/qa_*.png`.

## Summary
| Run | Passed | Failed |
|---|---|---|
| 1 | 249 | 4 |
| 2 | 249 | 4 |

The two runs gave the same results, so the suite is not flaky. All 4 failures are real bugs (listed below). There is no P1, and the game is fully playable.

| Area | Result |
|---|---|
| Boot, title attract demo, every menu (How to Play, Settings, Change Pictures, Pause, Game Over) with Back, Done and Esc | all pass, zero console errors |
| Input: ↑/W/F and ↓/S/J map to the right lanes; Space/Enter; auto-repeat ignored; mouse and touch on the upper/lower half; multi-touch; right-click ignored; HUD/menu taps never become game taps; focused button + Space/Enter starts the game exactly once; 0.7 s restart lock | all pass |
| Judging: exact-time taps give perfect, score, combo and ×2 after 10 catches; 100 ms late is good; a wrong-lane tap is empty; a miss costs groove (0.06 on level 1) and resets the combo; a 200 ms early tap is an early miss; timing offset ±100 ms moves judging; pillows bounce (bot) and poof (dizzy); Easy one-button works; Easy level 1 cannot be lost | all pass |
| Progression: song done, cleared bonus, next time of day, banner, music and visuals switch; game over when groove empties; best score saved per difficulty; NEW! badge; medal; Reset best | pass, with 1 failure (title best line with `?diff`) |
| Settings persist across reload; corrupted settings JSON falls back to defaults; fullscreen checkbox and F11 don't crash; `?mute=1` and `?diff=` are not saved | pass, with 1 failure (M key with `?mute=1`) |
| Pause: auto-pause on blur and on visibilitychange; song time frozen while paused; resume has no jump (< 0.04 s); no pause on the death frame; music stops on Main Menu and on game over | all pass |
| Customisation: opaque photo becomes a round sticker; a transparent PNG stays the whole picture; a 4000×3000 image is downscaled; corrupted PNG and .txt files get friendly messages; pictures persist after reload; gameplay draws `custom:hero/coin/pillow` in all 4 times of day; Reset one; Reset all; 7 phone-size photos all fit (0.15 MB) | all pass |
| Layout: 8 viewports × 7 screens (title, how, settings, custom, play, pause, over), plus rotating during play and rotating back | all pass. The iPhone-landscape Settings panel scrolls; this is intended (overflow:auto), and every control is reachable |
| Soak: `speed=16`, bot skill 0.8, 6 levels (all 4 times of day plus lap 2), 25 s real time | pass: score 115,900, max particles 57 (< 140), max fx 40, frame p95 2.8 ms, JS heap 4.8 → 7.4 MB |
| storage.js contract | `set()` returns Promise<boolean> and rolls back on a quota error, on `false` and on a rejection. 2 failures (below) |
| app/main.go | `GOOS=windows go vet` is clean. `app/web` is byte-identical to `game/`. Notes are in P3-6 |

## Issues

### P2-1: `?mute=1` + M saves `muted:true` and keeps the sound off
- **Repro:** open `index.html?mute=1`, press **M** (or the HUD sound button). The toast says "Sound off", the sound stays off, and `ktb:settings` now contains `"muted":true`. After a reload without the flag, the game is still muted. A test flag has leaked into the saved settings.
- **Where:** `game/js/main.js:149-153` (`toggleMute`). It flips `settings.muted`, but the player hears `settings.muted || urlMute`.
- **Fix:** base the toggle on what the player actually hears:
  ```js
  toggleMute() {
    const heardMuted = this.settings.muted || this.urlMute;
    this.urlMute = false;                       // any M press lifts the test flag
    this.setSetting('muted', !heardMuted);
    KB.UI.syncMute(); KB.UI.toast(this.settings.muted ? 'Sound off' : 'Sound on', 900);
  }
  ```

### P3-1: the title "Best score" ignores `?diff=`
- **Repro:** open `?diff=hard` and finish a run. The Game Over screen shows the hard best, but the title says "Best score" with the normal best (14500 instead of 100).
- **Where:** `game/js/main.js:141` (`best()` reads `this.settings.difficulty`), shown by `game/js/ui.js:103`.
- **Fix:** `best() { return parseInt(KB.Storage.get('best_' + this.difficulty(), '0'), 10) || 0; }`. Better still, label the line too, e.g. "Best (Hard): 100", so parents know which difficulty it belongs to.

### P3-2: `Storage.set` rollback can wipe a newer successful write
- **Repro (in the page):** two `set(k, …)` calls are in flight on the native (Windows app) path. The first one fails after the second one succeeds. The failure handler restores the value from before the first call, so the newer value is lost (`get(k)` returns `undefined`, but it should be `'second'`). This can happen when the player picks two pictures quickly, or changes settings while a picture is still saving.
- **Where:** `game/js/storage.js:34` (`fail` always restores `prev`).
- **Fix:** roll back only if this write is still the latest one for the key:
  ```js
  const seq = (this._seq = (this._seq || 0) + 1); this._last = this._last || {}; this._last[k] = seq;
  const fail = () => { if (this._last[k] === seq) { if (prev === undefined) delete this.cache[k]; else this.cache[k] = prev; } return false; };
  ```

### P3-3: `setJSON` (and `del`) drop the Promise, so a failed settings save is silent
- **Where:** `game/js/storage.js:43-47`.
- **Fix:** `setJSON(k, v) { return this.set(k, JSON.stringify(v)); }`. Make `del` return `Promise<boolean>` too. Then `Game.setSetting` (`main.js` `setSetting`) can toast "Could not save settings" when the result is `false`.

### P3-4: Easy's `maxDensity: 4` is commented out
- **Where:** `game/js/world.js:112`. The override sits after `//` on the `minGap` line, so Easy uses the Normal cap of 6 notes per bar. The minGap of 0.5 s hides most of the effect, but the tuning is not what was intended.
- **Fix:** move `maxDensity: 4,` before the comment (or onto its own line). Then rerun `node tests/unit/run.js` and the pacing table in MECHANICS §2.

### P3-5: portrait photos used as a background are stored too small and get blurry
- **Repro:** use a 3024×4032 phone photo for "Dawn". It is stored at 540×720 (the image is fitted inside 1280×720) and then drawn "cover" over a 1280-wide wall, which upscales it about 2.4×.
- **Where:** `game/js/assets.js:88-89` (`fileToDataURL` uses a fit-inside limit).
- **Fix:** for `bg`, use a cover limit: `k = Math.min(1, Math.max(1280 / w, 720 / h))`, capped at about 1600 px on the long side. The pictures stay small: all 7 slots together took 0.15 MB in the test.

### P3-6: app/main.go notes (Windows wrapper)
`go vet` is clean, and the store writes are atomic (`.tmp` then rename) with key validation and a 12 MB limit.
- **`main.go:136` fullscreen:** saving and restoring with `GetWindowRect` on a window that starts **maximized** (`swMaximize`) brings it back as a "normal" window with the maximized rect and the WS_MAXIMIZE style mixed up, so the Restore/Maximize button can act oddly after leaving fullscreen. **Fix:** use `GetWindowPlacement` / `SetWindowPlacement` (Raymond Chen's fullscreen pattern).
- **`main.go:172` fixed port 47618 with a random fallback:** only the browser fallback (no WebView2) uses localStorage. If the port is busy, the origin changes and that player's progress is lost. A second copy of the app also runs at the same time, writing to the same data folder. **Fix:** allow only one instance (a named mutex via `CreateMutexW`, then focus the existing window), or in fallback mode tell the player progress may not be saved.
- **Minor:** the `http.Serve` error is ignored, and `ffStoreDel`'s result is never used by JS (see P3-3).

### Observations (not bugs)
- **"Reset best":** in Settings, it clears all three bests at once with no confirmation. A small child could tap it. Consider a second "Sure?" tap.
- **Settings panel on iPhone landscape (844×390):** it scrolls. This is fine (the panel is `overflow:auto`), but the Done button starts out of view.
- **Screens are measured 1 s after opening:** the `pop` animation briefly overshoots to scale 1.03 (on iPad portrait the How to Play panel is 1043 px wide for about 0.25 s). It looks fine, but note this if anyone takes screenshots right after opening a screen.
