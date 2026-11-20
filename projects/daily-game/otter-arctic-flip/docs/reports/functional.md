# Functional QA report: Ollie's Lighthouse Flip (2026-11-20)

This was a report-only pass. No game code was changed. The new checks are in `tests/e2e/extra_qa.js` (`node tests/e2e/extra_qa.js [section]`). That script serves `game/` over a local http server, the same way GitHub Pages does, and exits 1 on any FAIL.

| Suite | Result |
|---|---|
| `tests/unit/run.js` | 27 / 27 pass |
| `tests/e2e/functional.js` (existing) | 352 / 352 pass (355 s) |
| `tests/e2e/extra_qa.js` (new) | 45 pass / 10 fail (55 checks, about 105 s). Every FAIL is one of the issues below. |

## Issues

### P1-1: Enter/Space starts a new game behind the open Score Card, and the card stays on top
- **Repro (keyboard: desktop browser, iPad with a keyboard, Windows exe):**
  1. Lose a game and wait about 1 s.
  2. Click **Score Card**. If the browser has no Web Share (desktop Chrome/Firefox, WebView2), **Save picture** gets focus.
  3. Press Enter, or click the card picture and press Space.
- **Result:** a new run starts (`mode: 'playing'`) under the modal. The card still covers the whole stage. The modal also stops `pointerdown` from reaching the stage, so taps and clicks no longer flip Ollie. He hits hazards and loses hearts while the child sees only the card. The only way out is Close or Esc.
- **Cause:**
  - `game/js/main.js:185`: the game-over Enter/Space handler only skips focused `BUTTON`s that are not `btnAgain`. The `<a id="scSave">` (`extras.js:198`) and `<body>` both fall through to `startGame()`.
  - `extras.js:244` focuses the `<a>` on purpose.
  - `startGame()` (`main.js:92`) calls `OF.UI.hideAll()`. That only knows the 6 screens in `ui.js:5`, so `#scScreen` is never hidden.
- **Fix (both parts):**
  1. In `main.js:185`, add `if (document.querySelector('#scScreen:not(.hidden)')) return;` as the first statement of the `over` branch. Or use a generic guard: `if (f && f.closest && f.closest('#scScreen, a, button:not(#btnAgain)')) return;`.
  2. In `extras.js` `ensureModal()`, close the card whenever the game-over screen goes away: `new MutationObserver(() => { if ($('scrOver').classList.contains('hidden')) close(); }).observe($('scrOver'), { attributes: true, attributeFilter: ['class'] });`. Also, in the capture `keydown` listener (`extras.js` around line 205), call `e.stopPropagation()` for Enter/Space while the modal is open, unless the target is inside the modal. Apply the fix in `shared/daily-mobile/extras.js` and re-run `apply.py`, because every daily game has the same code.
- **Checks:** `scorecard: Enter on the focused "Save picture" link…`, `…Space after tapping the card picture…`, `…starting a game hides the Score Card modal`.

### P2-1: Settings is cut off on small iPhones in landscape (667×375, 568×320)
- **Repro:** iPhone SE 2/3, 8 or 7 held landscape (viewport 667×375). Open Settings.
- **Result:** the second grid column runs off the panel:
  - 667×375: Difficulty **Normal/Hard** and Best score **Reset** can't be seen or reached.
  - 568×320: all three difficulty buttons are cut off.
  - Screenshot: `tests/out/extra_settings_667x375.png`.
- **Cause:** `game/css/style.css:296` sets `#scrSettings .settings{display:grid;grid-template-columns:1fr 1fr}` in the `max-height:430px` block. The Volume row added by `extras.js` has a 422 px min-content width (− button, range, %, + button). A `1fr` column can't shrink below its min-content, so the grid gets wider than the panel (`max-width` 651 px), and the panel clips the right column.
- **Fix:**
  1. Change the grid to `grid-template-columns:repeat(2,minmax(0,1fr))`.
  2. Let the volume row span both columns on short screens: in the extras CSS, add `@media (max-height:430px){#scrSettings .set-volume{grid-column:1/-1}}`.
  3. Shrink the range to `width:min(22vw,180px);min-width:0`.
  4. Add 667×375 and 568×320 to the `sLayout` sizes in `functional.js`.
- **Checks:** `mobile 667×375: every Settings control…`, `mobile 568×320: …`.

### P2-2: Portrait play (iPhone upright, iPad portrait) shows hazards later than the reaction time the track is built for
- **Numbers:** time between a hazard entering the screen and the last moment to flip, computed as `screenReach·unit / speed − flightTime`:

  | Layout | Easy, Floor 1 | Easy, Floor 4 | Normal, Floor 4 | Hard, Floor 4 |
  |---|---|---|---|---|
  | Landscape phone | 3.3 s | | | |
  | iPad landscape | 2.4 s | | | |
  | Portrait (both) | **1.44 s** (tuned for 1.8 s) | 1.0 s | **0.72 s** (tuned for 0.95 s) | **0.57 s** (tuned for 0.7 s) |

- **Why the existing tests miss it:** the unit test `visibility rule…` documents that the headlamp beam is clamped to the screen in portrait. But a hazard beyond the right edge isn't dark, it's off screen, so lamps and beacons don't help. The fairness rule (`reaction` s between forced flips) assumes the player can see the hazard that long.
- **Cause:** `game/js/world.js:173/177`. In portrait, `unit = min(w/6, h/8)` and `heroX = 0.22·w`, so only 4.7 units are visible ahead of Ollie, versus 7.1–9.4 in landscape.
- **Fix (any one):**
  - (a) In portrait, use `heroX = 0.12·w` and `unit = min(w/7, h/8)`. That gives about 6.6 units ahead, and Easy Floor 1 gets about 2.0 s.
  - (b) Scale the floor speed in portrait by `min(1, screenReach·unit / (reaction·S + S·flightTime + 0.8·unit))`, so the lead time always matches `reaction`.
  - (c) At minimum, widen the hazard spacing in portrait (pass `layout.portrait` to the generator).
  - Then make the `fairness:` checks in `extra_qa.js` pass.
- **Checks:** `fairness: phone portrait easy Floor 1…`, `fairness: iPad portrait easy Floor 1…`. Normal Floor 1 still passes (1.04 s vs 0.95 s), but later floors don't.

### P3-1: Test-flag runs (`?bot=1`, `?speed`, `?level`, `?seed`) write the player's best score
- **Repro:**
  1. Open `?bot=1&autostart=1&speed=8&diff=normal` (the URLs the QA suites and playtest agents use) on the child's iPad, or in the same browser profile.
  2. Wait until the game ends.
- **Result:** `olf:best_normal = 4570`, a bot score, is saved as the child's best. `?level=3` runs also save bests from a head start. DESIGN §5.4 says test flags are never saved.
- **Cause:** `game/js/main.js:116-117`. `gameOver()` always saves the best.
- **Fix:** in `main.js`, define `this.testRun = Game.botMode || params.has('speed') || params.has('level') || params.has('seed')`. In `gameOver()`, write the best only when `!this.testRun` (or when `!this.bot && !this.testRun`). Still show the best on screen.
- **Check:** `flags: a ?bot=1 (test) run does not write the player's best score`.

### P3-2: The Score Card from the Windows app links to `http://127.0.0.1:47628/`
- **Repro:** run the exe (simulated with `?app=1` on 127.0.0.1), lose a game, open the Score Card.
- **Result:** the share text and the card footer say "Can you beat me? http://127.0.0.1:…/". Friends can't open that link.
- **Cause:** `extras.js:19`. `PLAY_URL` falls back to `location.origin`, and `index.html:145` has no `data-url`.
- **Fix:** add `data-url="https://phanlinh86.github.io/claude-learning/projects/daily-game/otter-arctic-flip/game/"` to the `extras.js` script tag. Also, in the shared `extras.js`, ignore loopback and `file:` origins when there is no `data-url`: drop the link line and say "Play free: Ollie's Lighthouse Flip".
- **Check:** `pictures/app: the Score Card share text from the app never links to a loopback address`.

### P3-3: The Volume − / + buttons are smaller than the other Settings controls
- **Result:** they measure 36 px on desktop and 31 px on short landscape phones (the row shrinks them). The other Settings controls are at least 40 px on touch (`style.css:228-232`), and Apple's guideline is 44 pt.
- **Cause:** `extras.js:263` sets `.vol-step{width:36px;height:36px}` with no `flex:none`.
- **Fix:** `.vol-step{width:44px;height:44px;flex:none}`. Inside `@media (max-height:430px)`, 40 px is acceptable.
- **Check:** `volume: the − / + buttons are finger-sized…`.

### P3-4: Custom pictures share one 5 MB localStorage quota with every other daily game
- **Context:** all the games are served from the same `phanlinh86.github.io` origin, so they share one localStorage quota.
- **Result:**
  - Each background is a JPEG data URL of up to 1600 px: 0.4–1.7 M chars. In the worst case (noisy photo), 3 backgrounds already fill the quota, and the 4th background, Ollie and the leaf all fail.
  - The error message ("Try resetting another picture first") is friendly, but the space may be held by *another game's* pictures, which the child can't see from here.
  - When the origin is full, `OF.Storage.set` returns false and `gameOver()` (`main.js:117`) and `extras.js` ignore it, so a new best score or volume is lost without any message.
- **Fix:**
  - Store pictures in IndexedDB (per-origin quota is hundreds of MB) and keep only settings and bests in localStorage.
  - Until then, lower the background long edge to 1280 px at JPEG quality 0.75.
  - In `gameOver()`, show a toast when saving the best fails.

## Checked and OK (no bug found)

**Input**
- Focused HUD mute/pause button plus Space/Enter flips without toggling (existing check, re-verified).
- HUD `pointerdown` never reaches the stage.
- The restart lock (0.7 s) holds for Enter, Space and the Play Again button.
- Enter on the focused Score Card button opens the card without restarting, and Esc closes it without pausing.

**Pause**
- No pause during the 1.6 s death delay (Esc, P or blur).
- Blur and `visibilitychange` auto-pause, and the game stays paused when the page comes back.

**Flags and settings**
- `?mute=1` and `?diff` never reach the saved settings.
- The volume slider saves as `olf:volume`, applies to `OF.Audio`, survives a reload, and doesn't save "muted" under `?mute=1`.
- Best score is kept per difficulty (existing check).

**Customise**
- SVG without width/height works.
- A full store gives a friendly toast and changes nothing.
- Good, bad and huge files and Reset are covered by the existing suite.

**Resize and rescue**
- Resizing or rotating while Pip is arriving or carrying Ollie works at 390×844, 1366×1024 and 844×390. Ollie is set down on a surface, with one fall and one heart lost, and no fall-through.

**Speed ×16**
- A skill-1 bot climbs 4 floors with no fall or bump.
- Events come in order: `levelUp 1..4`, then `lampsOn` exactly once, on entering Sunset.
- `gotoLevel(7)` gives Night round 2 with lamps on and `beam === min(max(seeAhead,3.2),reach)`.
- `?level=2/3` starts have lamps lit (`lampK = 1`) from the first frame.

**Darkness**
- The maximum darkness alpha measured over a full climb is 0.645 (≤ 0.7, so at least 30 % light).
- Lamps are off at Dawn/Noon and on at Sunset/Night.

**Mobile layouts** (simulated notch/home-indicator insets; Chromium can't emulate `env()`, so `#safeProbe` and `.screen` padding were overridden)
- At 844×390@3, 390×844@3, 1366×1024@2 and 1024×1366@2, the HUD buttons (≥ 44 px) and the score/floor panels stay inside the safe area.
- The Score Card modal fits, and the title/how/custom/over panels fit without clipping.
- No rotate prompt is needed: portrait is a supported layout (see P2-2 for its fairness cost).

**`app/main.go`**
- `GOOS=windows go vet` is clean.
- The store has a key regex, a 12 MB cap and atomic writes (tmp + rename; Go's `os.Rename` replaces on Windows).
- Single-instance mutex and FindWindow use the same title.
- Free-port fallback.
- WebView2 data is in `%LOCALAPPDATA%`.
- The browser fallback strips `?app=1`.
- Minor nit: `store.Set` doesn't `fsync` before rename, so a power cut can leave an empty file. Acceptable for a kids' game.

**`storage.js` / `assets.js`**
- Rollback on a failed write is per key and guarded by a sequence number.
- A failed custom-picture save keeps the old picture.
- `loadCustom` drops undecodable data.

## Design notes (not bugs)
- Music keeps playing on the Pause screen, because the `setInterval` scheduler isn't paused (`audio.js:182`). Tab-hide still suspends audio. Consider ducking the music on pause.
- With `?diff=…`, tapping another difficulty in Settings saves it, but the highlight stays on the URL's difficulty. The existing suite treats this as intended.
