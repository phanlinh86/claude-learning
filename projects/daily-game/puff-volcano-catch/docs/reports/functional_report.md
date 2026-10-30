# Puff's Volcano Catch: functional QA report

Date: 2026-10-30 · Suite: `tests/e2e/functional.js` (Playwright + Chromium, `file://` with `--allow-file-access-from-files`)
Run it with `node tests/e2e/functional.js` (about 3 min). Add `--quick` for a 15 s bot run, or `--only=touch,layout` to run a few tests. Screenshots go to `tests/out/functional/`.

## Summary

| | Count |
|---|---|
| Checks | 230 |
| PASS | 223 |
| FAIL | 7, which come down to 5 distinct issues (0 × P1, 1 × P2, 4 × P3) |
| Console errors or `stats.errors` | 0 in every test |

**What works:**
- **Start-up and menus:** the game boots with no errors. Title, How to Play, Settings, Change Pictures, Pause and Game Over all open. Back buttons and Esc navigate correctly.
- **Moving Puff:**
  - Arrow keys and A/D move Puff, up to `maxSpeed`, and he stops when the key is released. He is clamped to 70…890.
  - Mouse follow overshoots by less than 4 px.
  - Touch-hold follow works.
- **Cool Rain triggers:** Space, Enter, Shift, right-click, a second finger and the 💧 button all trigger Cool Rain, but only when it is charged. Holding a key down fires it once. Rain does nothing while paused, and rain steams rocks for +5.
- **Scoring:**
  - A catch scores `value × 10 × mult`.
  - The multiplier steps ×1 to ×5 at combos `[0,5,12,22,35]`, with exactly one `multup` event at each step.
  - A missed coin resets the combo and costs no heart.
  - Catching a rock costs one heart and the combo. A rock caught while Puff is blinking does no harm.
- **Zones:** a full pouch gives `pouchfull` and `cleared` with a bonus of hearts × 100. Then the next zone starts: weather, music (`VC.Audio.season`), renderer and banner all switch to it.
- **Pause:** Esc and P pause and resume, and the world clock stays frozen while paused. Losing window focus or hiding the tab pauses the game, and keys held at that moment are cleared. Restart and Main Menu work. You cannot pause during the death animation.
- **Game over:**
  - Pressing Enter repeatedly in the first 0.7 s does nothing. After that it starts exactly one game.
  - Double-clicking "Play Again" starts exactly one game.
  - Best scores are kept per difficulty. A run's score counts for the difficulty it started on.
- **Settings:** sound effects, music and difficulty are saved across a reload. The M key mutes and the setting is saved. `?mute=1` is never written to storage. "Reset best" clears all three difficulties.
- **Change Pictures:**
  - An opaque JPEG becomes a round sticker with transparent corners.
  - A transparent PNG stays as "Whole picture".
  - The Round / Whole picture toggle works.
  - A `.txt` file and a corrupt PNG both get a friendly error.
  - A 5000×4000 picture is scaled down to 1280×720 or smaller.
  - Custom Puff, coin, rock and beach background all show in gameplay (checked by reading canvas pixels).
  - "Reset" on one slot and "Reset all" work, and a custom picture survives a page reload.
- **Layout** at 1280×720 @1/2, 1920×1080, 800×600, iPad 1024×768 @1/2 and iPhone 844×390 @2/3:
  - The canvas is letterboxed to 16:9 and centred.
  - The canvas resolution is capped at 1920×1080.
  - The HUD buttons sit inside the canvas, to the right of the pouch panel.
  - The 💧 button appears only on touch devices and sits inside the canvas.
  - The page never scrolls. Resizing the window while playing re-anchors the HUD.
- **Focus:** no double-triggers. Space or Enter on the title starts exactly one game. Space or Enter on the Pause screen resumes without also making it rain.
- **Long bot run** (60 s at `?speed=16&bot=1&autorestart=1`): 1 full game (score about 30 000, reached level 16), then it auto-restarted. Peaks: 50 effects, 74 weather particles, 4 items, 6 floating texts. All stay bounded, with no errors.

## Issues

### P2-1: A second finger that moves steers Puff away from the first finger
- **Repro:** on a touch device (iPad or iPhone), hold finger 1 at the left of the screen so Puff floats there. Tap a second finger elsewhere to make it rain; real taps always move a few pixels. Puff now heads for the second finger. It also happens with a finger resting on the 💧 button.
- **Where:** `game/js/main.js:192-196`. The `pointermove` handler calls `setPtr(e)` for any pointer while `pointerDown` is true, without checking `e.pointerId`. Test: `touch: moving the 2nd (rain) finger…` (Puff ended at x 316 instead of 650).
- **Fix:** keep the id of the steering finger and ignore every other pointer:
  ```js
  // pointerdown (first finger):  this._steerId = e.pointerId;
  stage.addEventListener('pointermove', e => {
    if (this.mode !== 'playing') return;
    if (e.pointerType === 'mouse') { /* unchanged */ setPtr(e); return; }
    if (this.pointerDown && e.pointerId === this._steerId) setPtr(e);
  });
  // up(): if (e.pointerId === this._steerId) this._steerId = null; and if another finger is still down, hand steering to it (or stop following).
  ```

### P3-1: With `?mute=1`, the HUD sound icon shows "sound on"
- **Repro:** open `index.html?mute=1` and press Play. The game is silent, but the speaker icon has sound waves. Clicking it saves `muted: true` and the icon changes to the crossed speaker, but the game was already silent.
- **Where:** `game/js/ui.js:379-384`. `syncMute()` reads only `game.settings.muted` and ignores `game.urlMute` (`main.js:28`).
- **Fix:** `const m = this.game.settings.muted || this.game.urlMute;` in `syncMute()`. Optionally, have `toggleMute()` clear `urlMute` the first time it is used, so the button can turn sound on.

### P3-2: Hovering the mouse over the HUD buttons drags Puff to the right corner
- **Repro:** desktop, mouse play. Move the cursor onto the pause or sound button, or leave it there after resuming. Puff floats to x ≈ 855–890 under the button. When the game resumes with the cursor still on the pause button, Puff drifts there on his own.
- **Where:** `game/js/main.js:192-195`. The `pointermove` handler does not apply the HUD/menu filter that `pointerdown` uses (`main.js:184`).
- **Fix:** at the start of the `pointermove` handler add `if (e.pointerType === 'mouse' && e.target.closest && e.target.closest('button, .screen, #hud')) return;` so the last playfield position is kept.

### P3-3: The Change Pictures panel scrolls by a few px on iPhone landscape (844×390)
- **Repro:** iPhone 844×390 (@2 or @3), open Change Pictures. The panel's `scrollHeight` is 367 against a `clientHeight` of 361, so it scrolls by 6 px. Every button is still visible (screenshot `13_layout_844x390_*_scrCustom.png`), but the bottom edge is tight and the panel wobbles under touch scrolling.
- **Where:** `game/css/style.css:25` (`.panel{max-height:94vh}`) and `:157` (`#scrCustom .panel` padding). The card previews use `aspect-ratio:16/10`.
- **Fix:** add a short-screen rule, for example `@media (max-height:430px){ #scrCustom .slot .prev{aspect-ratio:16/8} #scrCustom .panel h2{margin-bottom:calc(var(--u)*.6)} }`, or reduce the vertical gap of `.slot`.

### P3-4: Portrait phones (390×844) get a tiny game and HUD buttons below finger size
- **Repro:** iPhone held upright. The canvas is 390×219. The HUD buttons are 19.5 px and the 💧 button is 43 px, both below the 44 pt touch-target guideline. Nothing asks the child to rotate the phone.
- **Where:** `game/css/style.css` (`--u` scaling, `.icon-btn` size) and `game/index.html` (no portrait hint).
- **Fix:** add an `@media (orientation:portrait) and (max-width:600px)` overlay that says "Turn your phone sideways 🔄" and pauses the game. Also give the HUD buttons a minimum size: `.icon-btn{min-width:40px;min-height:40px}`.

## Windows wrapper review (`app/main.go`)
- `app/web` is identical to `game/` (checked with `diff -rq`); `tools/build.sh` copies it fresh on each build.
- The store key regex, the atomic write through a `.tmp` file plus rename, and the 12 MB value cap are all fine. The fullscreen toggle and the Bind and Dispatch usage look correct.
- **P3 (only when WebView2 is missing):** `main.go:187` / `:207`. The browser fallback opens a URL that contains `?app=1`.
  - **Quit button:** `isApp` becomes true, so the title shows a Quit button. It calls `window.close()`, which browsers ignore for a tab the user opened, so the button does nothing.
  - **Save data:** if port 47616 is taken, the fallback port is random, so the browser origin changes and the saved data in `localStorage` (best scores, pictures) seems to disappear.
  - **Fix:** use `strings.TrimSuffix(url, "?app=1")` for the fallback, and prefer a small set of fixed ports (47616–47619) over a random one.
- Nothing else to flag.

## Notes on the suite
- These parts are deterministic: sim time is frozen with `setSpeed(0)` and stepped forward with `VC.Game.step`. Coins and rocks are placed straight above the rim, and eruptions are switched off.
- Every tuning number comes from `VC.debug.world.cfg` or `VC.DIFFICULTY`.
- Multi-touch uses CDP `Input.dispatchTouchEvent`, because Playwright's touchscreen can only tap.
- The 390×844 portrait checks are extra; the task did not ask for them. They are why P3-4 shows up as failures.
