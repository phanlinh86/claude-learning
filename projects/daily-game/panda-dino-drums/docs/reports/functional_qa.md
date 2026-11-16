# Momo's Dino Drums: functional QA report

Date: 2026-11-16 · Tester: functional QA agent · Build: working tree on top of `fce8056` (WIP scaffold)
This was a report-only pass: I changed nothing in `game/` or `app/`.

## How to run
From `projects/daily-game/panda-dino-drums/`:
```bash
node tests/unit/run.js                                  # 29 mechanics tests, ~3 s
node tests/e2e/functional.js [--only=menus,helper,...]  # Playwright functional suite, ~4.5 min
node tests/e2e/mobile.js                                # Playwright iPhone/iPad suite, ~2.5 min
node ../../../shared/daily-mobile/test_extras.js .      # shared volume + score card checks
```
Screenshots go to `tests/out/` (`qa_*.png`) and `tests/out/mobile/`.

## Results
| Suite | Pass | Fail |
|---|---|---|
| `tests/unit/run.js` | 29 | 0 |
| `tests/e2e/functional.js` (rewritten for Pip, gems and the 4 floors) | 347 | 4 |
| `tests/e2e/mobile.js` (new) | 286 | 1 |
| `shared/daily-mobile/test_extras.js` | 28 | 0 |
| **Total** | **690** | **5** |

The 5 failures come from 3 real bugs (issues 1 to 3 below). Two of the failing checks catch the same score-card bug, and two catch the same Settings layout bug from different suites.

### What the functional suite covers
- **Boot:** zero console errors, all default art loads, the title attract demo runs (and can't be tapped), and no Kit, pillow or coin left-overs in How to Play.
- **Every screen:** title, How to Play, Settings, Change Pictures, pause, pause → settings, game over and the Score Card. Each one is opened by click and closed with Back/Done and with Esc.
- **Input:**
  - Keys ↑/W/F and ↓/S/J. Space/Enter tap Momo's current rail on Normal. A held key counts as one tap, and M is never a tap.
  - Mouse clicks on the upper and lower halves, including the screen edges. A right click is ignored.
  - Touch taps, `pointerdown` with `pointerType: 'touch'`, and two-finger multi-touch through CDP.
  - The HUD Pause and Sound buttons by mouse and by touch: they don't trigger gameplay and the ghost click is swallowed. Space after clicking the HUD Sound button drums instead of toggling the sound again.
- **Scoring:**
  - Perfect is 100 × mult, Good is 50 × mult, and a gold gem is ×3.
  - A tap outside the good window doesn't catch. Wrong-rail taps, untapped gems and early taps are misses.
  - A miss costs `missCost × firstLevelCostMul`, resets the combo and resets the ×2 multiplier.
  - An empty tap costs nothing. The ±100 ms timing offset works.
- **Pip:**
  - Comes on the 5th catch in a row (4 on Easy). `helperNow()` is refused during the count-in and when Pip is already there.
  - Doubles points while entering or perched, and the "+N ×2" and "Pip is here!" texts show.
  - Saves exactly one missed gem: no groove loss, combo kept, swoop to that rail, "Pip caught it!". A second miss is a normal miss.
  - Flies home with a cooldown, stays 1 + 20 s when nothing is missed, and leaves on death. Game over shows the visit and save counts.
  - The bot calls Pip naturally.
- **Floors:**
  - Levels 0 to 4 and 7: correct floor, lap, BPM (84/96/104/112, +8 per lap), visuals and music.
  - Clearing a floor fires `songdone` and `cleared`, shows the banner and adds the bonus.
  - Sky Roof → Riverbank lap 2 at 92 BPM.
- **Pause:** blur, `visibilitychange` and blur during the count-in all pause. Song time and Pip are frozen while paused. A resume doesn't jump, and there's no pause on the death frame.
- **Settings:**
  - Persist across reload, including volume. Everything is stored under `pdd:` only; `ktb:` keys from other games are ignored and survive Reset best.
  - `?mute=1` and `?diff=` are never saved. Corrupted or invalid settings JSON falls back to defaults.
- **Best score:**
  - Kept per difficulty, including `?diff=hard`. A worse run keeps the old best.
  - Changing difficulty in the middle of a run still saves under the difficulty the run started on.
  - Reset best needs two taps.
- **Customisation (through the file chooser and `setInputFiles`):**
  - Covers all 7 slots and checks shape detection, the 4000×3000 downscale, a broken PNG, a `.txt` file, the shape toggle, persistence, and Reset one / Reset all.
  - Gameplay draws the custom Momo, gem and Pip, plus the custom floor walls.
  - 7 phone photos fit in storage (0.52 MB in total).
- **Restart locks:** Enter/Space on a focused Play starts once. Game over ignores input for 0.7 s, then restarts once. Resume + Space doesn't tap.
- **Layout:** 9 window sizes (desktop DPR 1, 1.5 and 2; iPhone SE, iPhone and iPad in both orientations), every screen, rotation in the middle of a game, and the positions of Pip's perch and away point.
- **Soak at `?speed=16`:**
  - The bot (skill 0.8) clears 6 floors including a lap, with level events in order.
  - Pip visited 19 times and saved 11 gems.
  - Particles stay ≤ 77 and fx ≤ 40. Frame time p95 is 2.2 ms. The heap goes from 4.5 to 7.5 MB.
  - `autorestart` works.

### What the mobile suite covers
- **Devices:** 844×390 and 390×844 (DPR 3); 1024×768, 1366×1024 and 768×1024 (DPR 2); 375×667 and 667×375 (DPR 2).
- **Screen:** the canvas fills the screen with the backing store ≤ 3.3 MP, and there's no page scroll.
- **Buttons:** title buttons are ≥ 44 px. Each panel is opened with a real tap; it fits or scrolls, with Done reachable.
- **HUD:** buttons are ≥ 44 px and sit above the upper drum.
- **Touch input:**
  - Finger lanes, the screen edges, and two fingers counting as two taps.
  - A swipe is one tap and never scrolls or zooms.
  - Pause and Resume taps aren't drum taps.
- **Pip:** perched on screen, not under the HUD.
- **Rotation:** rotating in the middle of a game re-lays out and keeps playing, and lane taps still work afterwards. The game supports both orientations; there is no rotate prompt, and none is wanted, because DESIGN §8 allows portrait and landscape.
- **Game over:** the panel fits and Play Again restarts once.
- **Easy:** a tap anywhere catches.
- **Simulated notch:** 59 px landscape notches and a 34 px home bar. The HUD, Momo, the drums and the lower rail stay inside the safe area.
- **Errors:** zero console errors.

## Issues

### 1. P2: Enter or Space while the Score Card is open restarts the game behind it, and the card stays over the running game
- **Repro:**
  1. Play and die.
  2. Wait 0.7 s, then tap **Score Card**.
  3. Press Enter or Space. A Bluetooth keyboard on an iPad does this, and so does a desktop user pressing Enter on the focused Share/Save button.
  4. A new run starts underneath. `#scScreen` stays visible over the gameplay, so the child can't see the game, and the drums play under the card.
- **Where:** `game/js/main.js:209`. The over-screen restart takes any Enter/Space. `game/js/extras.js:206` only handles Escape for the modal.
- **Check:** `functional.js` › input › "score card open: Enter on its focused button does not restart the game underneath".
- **Fix:** at the top of the keydown handler in `main.js` (after the F11/M lines), ignore keys while the card is open, so the focused Share/Save/Copy button gets its native Enter:
  ```js
  const card = document.getElementById('scScreen');
  if (card && !card.classList.contains('hidden')) return;
  ```
  Defensively, also make `startGame()` hide `#scScreen`, or add `'scScreen'` handling to `UI.hideAll()`.

### 2. P2: Settings is cut off sideways on small landscape phones (iPhone SE/8/mini, 667×375)
- **Repro:**
  1. Open Settings on a 667×375 touch screen.
  2. The right column overflows the panel by about 90 px (`scrollWidth 737 > clientWidth 645`). The Music toggle, "Normal"/"Hard" and Reset best are clipped at the right edge. You can only reach them with a hidden sideways scroll, which a child won't find.
  3. See `tests/out/qa_layout_iPhone_SE_667x375_DPR2_settings.png` and `tests/out/mobile/iphone-se-landscape_scrSettings.png`.
- **Cause:** in the short-landscape grid, `grid-template-columns:1fr 1fr` gives each column a minimum width of `auto`. The Volume row that `extras.js` adds (− slider 180 px % +) forces the left column to 421 px.
- **Where:** `game/css/style.css:300` (and `:302`).
- **Check:** `functional.js` › layout › "iPhone SE 667x375 DPR2 / settings" and `mobile.js` › "iphone-se-landscape: scrSettings panel … no sideways overflow".
- **Fix:**
  ```css
  @media (max-height:430px){
    #scrSettings .settings{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
    #scrSettings .set-volume{grid-column:span 2}
  }
  ```
  Optionally also cap `.set-volume input[type=range]` at `min(22vw,180px)`. The 844×390 iPhone passes only because it is wider.

### 3. P2: Easy mode does not accept "any key" (REQUIREMENT: "Easy: any key or tap catches whichever gem is next")
- **Repro:**
  1. Run `?diff=easy`.
  2. When a gem lands, press A, L, Q or 1. Nothing happens and the gem is missed.
  3. Only the lane keys (↑W F D E / ↓S J K X), Space and Enter work. A small child mashing any key on a keyboard gets no response.
- **Where:** `game/js/main.js:199-207`. Lane keys are mapped only from `LANE0`, `LANE1`, Space and Enter.
- **Check:** `functional.js` › judging › "easy: ANY letter/digit key catches too".
- **Fix:** inside `if (this.mode === 'playing')`, after the lane mapping:
  ```js
  else if (this.world.cfg && this.world.cfg.oneButton && !e.ctrlKey && !e.metaKey && !e.altKey &&
           /^(Key|Digit|Numpad)/.test(e.code) && e.code !== 'KeyP' && e.code !== 'KeyM') lane = -1;
  ```
  P and M keep their meaning. Alternatively, change the requirement and the How to Play text to "Space, Enter or the arrow keys".

### 4. P2: README.md is still Kit's Toybox Beat (wrong play link and wrong debug API)
- **Where:** `README.md:1-40`, notably:
  - `:6` links to `.../kit-toybox-beat/game/`.
  - `:34` documents `window.KB.debug` and `bossNow()` "calls Baron Fluff".
  - The rules mention coins, pillows and Dawn/Noon/Sunset/Night.
  - The exe name is `KitsToyboxBeat.exe` and the port is 47618.
- **Impact:** whoever opens the folder on GitHub or follows the link plays the wrong game.
- **Fix:** rewrite the README for Momo's Dino Drums:
  - Play URL `…/projects/daily-game/panda-dino-drums/game/`.
  - Rules for gems, Pip, the 4 floors and the medal.
  - `window.DD.debug` with `helperNow()`.
  - `dist/MomosDinoDrums.exe`, `%APPDATA%\MomosDinoDrums\data`, port 47624.
  - The `tests/e2e/mobile.js` command.

### 5. P3: CLAUDE.md is still Kit's (`ktb:` prefix, `window.KB`, port 47618, Kit's QA counts)
- **Where:** `CLAUDE.md:1-25` (`:22` says "Storage keys use the `ktb:` prefix").
- **Impact:** a future agent following it would write `ktb:` keys and collide with Kit's saves on the shared GitHub Pages origin. The code itself correctly uses `pdd:`, and that is tested.
- **Fix:** update the title, goal, `window.DD`, the `pdd:` prefix, port 47624 and `MomosDinoDrums.exe`. Set the status to "v1.0 2026-11-16" with these QA numbers.

### 6. P3 (wrapper): the "Quit" button does nothing in the browser fallback of the Windows app
- **Repro:**
  1. On a PC without the WebView2 runtime, `main.go` opens `http://127.0.0.1:47624/index.html?app=1` in the default browser.
  2. `?app=1` makes `Game.isApp` true, so the title shows **Quit**.
  3. `quit()` falls back to `window.close()`, which browsers ignore for tabs they didn't open with script. The button is dead.
- **Where:** `app/main.go:227` (the URL used for both paths) and `game/js/main.js:19`, `:170`.
- **Fix:** in `main.go`, build the fallback URL without `?app=1`:
  ```go
  exec.Command("rundll32", "url.dll,FileProtocolHandler", "http://"+ln.Addr().String()+"/index.html")
  ```
  Alternatively, in `main.js` set `isApp` only when `typeof window.ffQuit === 'function'`.

### Wrapper review (`app/main.go`): no other bugs found
- Storage keys: the key regex `^[a-zA-Z0-9_\-]{1,64}$` accepts every key the game writes (`settings`, `volume`, `best_*`, `img_*`, `shape_*`; tested in `functional.js › storage`). The `pdd:` prefix is used only for localStorage, so no colon reaches Go.
- Storage writes: values are capped at 12 MB, far above a 1600 px JPEG data URL. Writes are atomic (tmp + rename) and guarded by a mutex.
- Port and naming: port 47624 matches DESIGN, with a free-port fallback. The single-instance mutex and window title match ("Momo's Dino Drums"). The data and WebView2 folders are `MomosDinoDrums`.
- Fullscreen: `ffFullscreen` uses `Dispatch` onto the UI thread and saves and restores the window placement.
- Not verified: the exe hasn't been built or run on Windows in this pass.

## Notes
- **Old suite replaced:** Kit's copy of `functional.js`, which still checked `boss`, `pillow` and `bounced`, is replaced. The new suite uses the Pip API (`helperNow()`, `world.helper`, `helperin`/`helpersave`/`helperout`) and the slots `hero, coin, helper, bg_river, bg_ferns, bg_nests, bg_sky`.
- **Pip balance:** looks as designed. Pip arrives on catch 5 exactly. The perfect bot's Pip stays 21.0 s (1 s fly-in + 20 s). During the soak, Pip visited 19 times in 6 floors and saved 11 gems.
- **Not covered:** these tests use emulated touch in Chromium. Nothing here checks how it sounds, or how it behaves on a real iPhone or iPad (Safari audio unlock, the real notch).
