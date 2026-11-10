# Functional QA: Mochi's Fairy Bounce

Suite: `tests/e2e/functional.js` (Playwright, Chromium, file:// with `--allow-file-access-from-files`).
Run: `node tests/e2e/functional.js` (about 2.5 min) or `--quick` (shorter bot soak, about 1.5 min). It prints PASS/FAIL for each check and exits 1 if anything fails. Screenshots go to `tests/out/functional_*.png`.

## Summary

| | |
|---|---|
| Checks | **255** |
| Pass | **248** |
| Fail | **7**. All 7 come from one issue (P2-1: touch buttons are 40 px, not 44 px) |
| P1 (must fix) | 0 |
| P2 (should fix) | 1 |
| P3 (nice) | 5 |
| Stability | 4 runs in a row gave the same result. One test-side race (a 200 ms sleep) was replaced by a wait |

Covered and passing:
- **Boot and menus.** The game boots with zero console errors. Every menu opens and closes, including the back paths: title ↔ How / Settings / Change Pictures, Pause ↔ Settings (Esc returns to Pause), Restart, Main Menu, and Game over → Play Again / Menu. Esc does nothing on the title and on game over.
- **Focus.** Space or Enter on a focused Play starts exactly one game and does not serve. Enter or Space on a focused Resume resumes without serving. Enter on a focused Settings button opens Settings. Enter on a focused Menu button (game over) opens the menu.
- **Restart lock.** The 0.7 s lock works for both Enter and the Play Again click.
- **Input.**
  - Mouse: moving the mouse steers without a button and lands exactly on the pointer. A click serves. Hovering or clicking the HUD buttons never steers or serves.
  - Keyboard: ←/→/A/D move. On keyup there is a ≈0.9 u glide, then Mochi stands still. Holding ← and → together cancels out. A key released during pause does not stick. Space/Enter serve.
  - Auto-serve fires at t ≈ 3.0 s.
  - Touch (real CDP touch events): a slide moves to the finger without serving. A tap serves. Tapping Pause, Resume or Mute never serves or steers, and the ghost click after Resume is swallowed. A second finger can tap Pause while the first one steers.
- **Rules.**
  - Blocks: +10 for a 1-hit block. A tough block takes 2 hits (+10 each). A star block drops a star, and a caught star scores +50 and is counted.
  - Hearts: a fall costs a heart and goes back to serve. 0 hearts gives phase `over`, a `gameOver` event and the game-over screen.
  - Vine: Easy has 2 vine saves, then a fall costs a heart. Saves per difficulty are 2/1/0, and they refill each season.
  - Pillows: a pillow on Mochi makes him sleepy (≈40 % speed), wears off, and never costs a heart. A pillow that lands on the ground costs nothing either.
  - Season clear: `clearBricks` + bot gives `levelClear` with 100 + 20/heart and +1 heart, then zone 1 with a new wall.
- **Best score.** It is kept per difficulty. A lower score does not overwrite it, a bot run never does, and a mid-run difficulty change saves under the run's difficulty. `?diff=` is never saved. Reset needs two taps and disarms itself after 3 s.
- **Pause.** The world freezes, and resume has no time jump. Blur and `visibilitychange` auto-pause. Coming back stays paused. Blur after the last heart does not block game over.
- **Settings persistence.** sfx, music and difficulty survive a reload, in both the UI and Audio. M mutes and saves. `?mute=1` mutes but is never written into settings, and the next normal visit is not muted. Corrupt or unknown saved settings fall back to defaults.
- **Change Pictures.**
  - PNG with transparency → kept "whole".
  - Opaque JPEG → round sticker (512²).
  - 4000×3000 background → 1600×1200 JPEG, under 1.5 MB.
  - 4000×3000 character → 512 px.
  - Text file → "Please choose a picture file…". A broken PNG → "That picture could not be opened.".
  - Full storage → "Not enough room…", and nothing is kept.
  - Round/Whole toggle, Reset one and Reset all work.
  - Pictures persist across a reload and show in game: hero, ball, the HUD star, and the Spring background (checked by canvas pixel colour).
- **Layout** at 1280×720, 1920×1080, 1024×768 iPad touch, 844×390 phone touch, 390×844 portrait touch and 2732×2048 DPR 2:
  - Every menu (title, how, settings, pictures, pause, game over) fits with no overflow, no inner scroll and no sideways scroll.
  - The canvas fills the screen, and pointer → world maps exactly onto both walls.
  - HUD buttons are ≥ 44 px on touch.
  - Portrait phone: the "turn sideways" card shows and the game waits behind it. It hides when the phone is turned and comes back when it is turned upright. "Play upright anyway" works.
- **Soak.** A bot run (`skill=0.8`, speed 16) covered 485 s of game time and reached season 9 (round 3). Score 8250, zero errors. Particles peaked at 60 (cap 90) and juice fx at 51. Ball speed stayed ≤ 7.6 u/s on Easy. No best score was saved.
- **Windows wrapper (static review).** The bridge names `mfStoreAll/mfStoreSet/mfStoreDel/mfFullscreen/mfQuit` match `storage.js`/`main.js` exactly. The server listens on loopback only. Ports fall back 47821/31/41/51 → any free port. Set/Del check the key regex before touching the disk. All 5 key shapes the game wrote during the suite pass the Go rule.

Not covered: the exe could not be compiled here. There is no network for `go-webview2`, and `app/web` is created by `tools/build.sh`. `gofmt -l` is clean.

## Issues

### P2-1: Several touch buttons are 40 px tall, below the 44 px minimum (Apple HIG and the brief)
**Repro:** Open on an iPad (1024×768) or a phone (844×390 / 390×844) and open Settings or Change Pictures (and How to Play on a landscape phone). Measure the buttons. The suite measures after the menu's `pop` scale-in animation has finished.

| Screen | Sizes |
|---|---|
| Settings, all touch sizes | Easy/Normal/Hard segments 56–92×40; Reset best 56–71×40; Done 153×40 on a short phone |
| Change Pictures, all touch sizes | Whole picture / Round 57–106×40; Choose… 77–103×40; Reset 49–71×40; Reset all / Done 153×40 on a short phone |
| How to Play, 844×390 | "OK, let's play!" 153×40 |

**Where:** `game/css/style.css`
- line 231: `.seg button,.slot .btn,.btn-tiny{min-height:40px}` (inside `@media (pointer:coarse)`)
- line 255: `.slot .shape button{…;min-height:40px}`
- line 241: `#scrCustom .menu .btn{min-height:40px;…}` (max-height:430px)
- line 299: `#scrSettings .menu .btn{min-height:40px;…}`
- line 330: `#scrHow .menu .btn{min-height:40px;…}`

**Fix:** Change these five values from 40px to 44px. The menus have room for it: the short-phone panels were measured with no scroll, and 4 px × 2 rows still fits. If Change Pictures gets tight at 390 px tall, drop `.slot .prev` height from `calc(var(--u)*4.6)` to `*4.2` (line 236) rather than shrinking the buttons. After the change, `node tests/e2e/functional.js` should be 255/255.

### P3-1: A fast flick of any length serves the ball (touch)
`game/js/main.js:233`: `if (moved < 1.2 || performance.now() - d.t0 < 260) this.serve();`. Any touch shorter than 260 ms serves, however far the finger travelled. A child who quickly swipes to get under the ball during the serve phase launches it from the wrong place.
**Fix:** Serve only on a real tap: `if (moved < 0.6 || (moved < 1.2 && performance.now() - d.t0 < 260)) this.serve();`. A long slow slide already doesn't serve, and the suite checks that.

### P3-2: The browser full-screen flag is set before the request succeeds
`game/js/main.js:163`: `this.fullscreen = on` runs before `requestFullscreen()` resolves. If the request is rejected (no user activation, or a policy), the Settings toggle shows "on" while the page is not full screen, until a later `fullscreenchange`.
**Fix:** In browser mode, set `this.fullscreen` only in the `fullscreenchange` handler (line 252) and call `MFB.UI.syncSettings()` in the `.catch` of `requestFullscreen()`. Keep the immediate set for the `mfFullscreen` (app) path.

### P3-3: `?app=1` without the native bridge shows a Quit button that cannot quit
`game/js/main.js:14` treats `?app=1` alone as app mode, so `ui.js:519` shows Quit. In a normal tab, `quit()` (main.js:170) calls `window.close()`, which browsers ignore for tabs the user opened. The Go fallback strips `?app=1` (main.go:257), so this only happens with a hand-typed or bookmarked URL.
**Fix:** `isApp: typeof window.mfStoreSet === 'function'`, or keep `?app=1` but show Quit only when `typeof window.mfQuit === 'function'`.

### P3-4: Go store: the key rule allows Windows reserved names and case-variants
`app/main.go:92`: `^[a-zA-Z0-9_\-]{1,64}$` accepts `CON`, `NUL`, `AUX`, `COM1`… On older Windows builds `CON.txt` opens the console device. It also accepts keys that differ only by case (`Best_easy` vs `best_easy`), which become one file on NTFS. The game only uses fixed lower-case keys today (`settings`, `best_<diff>`, `img_<slot>`, `shape_<slot>`), so this is defensive only.
**Fix:** Lower-case the key in `path()`, and reject `^(con|prn|aux|nul|com\d|lpt\d)$` (case-insensitive), or prefix every file name, e.g. `"k_"+k+".txt"`.

### P3-5: Go store: a failed `MkdirAll` turns into a misleading "Not enough room" message
`app/main.go:206` ignores the error from `os.MkdirAll(st.dir, …)`. If the folder can't be created (a locked or redirected AppData), every `Set` fails, and the game reports "Not enough room to save that picture…" (assets.js:149), while best scores and settings silently don't stick.
**Fix:** Check the error. On failure, fall back to `filepath.Join(os.TempDir(), "MochisFairyBounce", "data")`, or show a `messageBox` once ("Your progress can't be saved: …").

### Notes (no change needed)
- `main.js:124–125`: `newBest && !this.botMode` repeats the `!this.botMode` test (harmless).
- `mfFullscreen` returns `on` before the dispatched toggle has run. The JS ignores the return value, so this is fine.
- Writes go to a temp file and then `os.Rename`, which replaces the old file atomically on Windows. `All()` skips `.tmp` leftovers and invalid names. The 12 MB value cap is far above the largest picture (a 1600 px JPEG of about 0.3–1 MB).
