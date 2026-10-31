# Mobile functional QA: Puff's Volcano Catch (iPhone / iPad layer)

**Date:** 2026-10-31
**Scope:** report only. Nothing under `game/` was changed.
**Test:** `tests/e2e/mobile_qa.js`. A full run takes about 10 minutes (each bot run is 60 s at `?speed=8`). Use `--quick` for 15 s bot runs.
**Method:** Chromium with Playwright.
- Mobile contexts used `isMobile` + `hasTouch`, driven by real touch through CDP `Input.dispatchTouchEvent` and `page.touchscreen`.
- Desktop contexts used real mouse and keyboard.
- Device sizes:
  - iPhone 393×852 @3, plus landscape
  - iPhone SE 375×667 @2, plus landscape
  - iPad 820×1180 @2, plus landscape
  - iPad Pro 1366×1024 @2
  - Short landscape with the Safari toolbar showing: 852×320 and 667×300
  - Desktop 1280×720 and 1920×1080

## Result: 542 passed, 27 failed

The 27 failures come from **5 distinct issues** (each one repeats across devices).

| # | Sev | Issue | Failing checks |
|---|---|---|---|
| 1 | **P2** | HUD/menu buttons ignore a tap made while another finger is down | 14 (7 devices × pause + Play Again) |
| 2 | **P2** | Rotating to portrait mid-flight leaves airborne coins out of Puff's reach | 4 (every landscape device) |
| 3 | **P2** | An overflowing panel cannot be scrolled by finger (Settings with the Safari toolbar showing) | 2 |
| 4 | P3 | The double-tap guard swallows a tap on a slot preview that comes less than 320 ms after another tap | 7 |
| 5 | P3 | Findings from reading the code (no failing check) | – |

### What works (verified with real touch)
- **Touch and canvas:** touch mode is detected. The canvas fills every screen. The backing store stays ≤ 3.2 MP on touch devices and ≤ 1920×1080 on desktop.
- **Manifest and icons:**
  - The manifest is valid and loads from the page.
  - Icons 192/512, maskable, and the 180×180 apple-touch-icon all exist at their declared sizes and decode.
  - The `viewport-fit=cover` and `apple-mobile-web-app-capable` meta tags are present.
- **Audio unlock:** no AudioContext exists before the first gesture. The first `touchend`, even on empty sky, creates the context, resumes it and starts a silent buffer *inside the touchend* (the iOS rule). Tapping the empty title sky does not start the game.
- **Menus by tap:** How to Play, Settings, the toggles, Difficulty and Change Pictures all respond.
  - A fast double tap on a toggle counts twice. Easy→Normal in quick succession ends on Normal.
  - "Choose…" and a single tap on a slot preview both open the file picker.
- **Rotation in menus:** rotating with Settings open keeps the panel on screen and the canvas full.
- **Kid-proofing:** `touchmove` on the game, `gesturestart` and `dblclick` are all `preventDefault`-ed.
- **Steering:** a finger hold steers.
- **Safari toolbar (−80 / +80 px) mid-drag:** the canvas refits, world range = layout range, and Puff stays inside it. The same finger keeps steering.
- **Lost fingers:** after `pointercancel`, steering is released and the next finger steers. With three fingers: the 2nd fires rain, the 3rd is harmless, and lifting the steering finger stops the follow while the other two stay down. One finger steers normally afterwards.
- **Fingers on buttons:**
  - A finger that starts on 💧 or on the sound button and slides onto the game never moves Puff.
  - Sliding off the sound button does not toggle it.
  - 💧 tapped by a 2nd finger while steering fires rain (it uses `pointerdown`).
- **Rotation during play:**
  - Rotating while paused clamps Puff, and the pause panel stays on screen.
  - Tapping Resume never moves Puff and leaves no stale touches. The first finger after pause/rotate/resume steers; it is not taken for a "second finger".
  - Rotating mid-drag (resize + `orientationchange`) cancels the drag. The old finger no longer steers, and a new finger does.
- **Page hidden (`visibilitychange`):**
  - Hiding the page pauses the game, releases the finger and calls `AudioContext.suspend()`.
  - An `unlock()` while hidden does not resume.
  - When the page is visible again, `resume()` is called and the game stays paused.
- **Game over:** reaching game over with a finger down, then starting a new run, leaves no stale touches. The first finger of the new run steers.
- **Notch insets** (probe padding overridden to 59/21 landscape and 59/34 portrait): 💧 and the HUD stay inside the safe area, Puff + basket never go under the notch, and 💧 never covers the reachable band.
- **Bot runs (60 s at speed 8, all 9 sizes):** 100 % of coins have `tx` within `cfg.targetMin..targetMax`. Every item lands within `xMin..xMax`, no coin lands off-screen, ≥ 90 % are "fair", and there were zero console errors. Ranges seen:
  - portrait: 250..710
  - iPhone landscape / iPad Pro / desktop: 70..890
  - SE landscape / iPad landscape: 70..786, clear of 💧
- **Desktop is unchanged:**
  - Not in touch mode; logical size is 960×540 with the classic range 70..890 and targets 90..870; no 💧.
  - Space starts the game; arrow keys and A/D move Puff; the mouse-follow works.
  - Hovering the HUD does not pull Puff. Right-click fires rain and the context menu is suppressed. Left-drag steers. Releasing the mouse keeps the follow.
  - Space fires rain. Esc pauses and resumes. Window blur pauses. A resize keeps Puff on the shore.
- **Zero console errors** in every session.

---

## Issues

### 1. P2: Pause / sound / Play Again can't be tapped while another finger is on the screen
**Repro:** in play, hold one finger on the game to steer, then tap ⏸ with a second finger. The game keeps running. The same thing happens with "Play Again" while the first finger is still down at game over. A lone tap works. This was checked in Chromium touch emulation.

**Why:** the browser does not synthesize `click` for a tap made while another touch is active, and iOS Safari also suppresses it during multi-touch. Every UI button is bound to `click` (`game/js/ui.js:14`, the `click()` helper). 💧 works only because it uses `pointerdown` (`game/js/main.js:229`).

A child steers with one thumb almost all the time, so in practice "pause" and "sound off" only work after letting go.

**Fix:** in `ui.js:14`, also act on `pointerup` from touch, and skip the `click` that follows:
```js
const click = (id, fn) => {
  const el = $(id); let t = 0;
  const run = e => { e.stopPropagation(); VC.Audio.unlock(); VC.Audio.play('click'); fn(e); };
  el.addEventListener('pointerup', e => { if (e.pointerType === 'touch' && document.elementFromPoint(e.clientX, e.clientY)?.closest('#' + id)) { t = performance.now(); run(e); } });
  el.addEventListener('click', e => { if (performance.now() - t < 500) { e.stopPropagation(); return; } run(e); });
};
```
- At minimum, apply this to `btnPause`, `btnMuteHud`, `btnAgain`, `btnOverMenu`, `btnResume`.
- The `elementFromPoint` check keeps "slide off to cancel" working.
- Apply the same pattern to `.btn-back` (`ui.js:31`).

### 2. P2: Rotating landscape → portrait strands coins that are already flying
**Repro:** play on any landscape device (iPhone, SE, iPad, iPad Pro) until 2+ coins are airborne, then rotate to portrait. Airborne coins keep `tx` ≈ 164–185, but the new reach is 250 − 38 = 212 to 710 + 38. They fall where Puff can never go, partly off-screen (visible 200..760), and break the combo for no fault of the player.

**Why:** `World.setPlayRange` (`game/js/world.js:268-276`) re-clamps Puff and future targets only. Its comment says "items already flying keep their arcs". The build-education-game pitfall says: *"On resize/rotation: cancel any drag and clamp every travelling item into the new screen."*

**Fix:** in `setPlayRange`, after line 275, re-aim each airborne item. Horizontal flight is linear (`world.js:519`), so a new `vx` lands it exactly at the same time:
```js
for (var i = 0; i < this.items.length; i++) {
  var it = this.items[i];
  if (it.state !== 'fly' || it.tCross <= this.time) continue;
  var nt = clamp(it.tx, c.targetMin, c.targetMax);
  if (nt !== it.tx) { it.vx = (nt - it.x) / (it.tCross - this.time); it.tx = nt; }
}
```

### 3. P2: An overflowing panel can't be scrolled by finger
**Repro:** on an iPhone in landscape with the Safari toolbar showing (852×320 or 667×300), open Settings. The panel overflows by 14–22 px, so the bottom of "Done" is clipped. A finger drag on the panel does not scroll it (`scrollTop` stays 0). Other panels fit at every size tested, but bigger text or a smaller window will hit the same problem on How to Play or Change Pictures.

**Why:** the kid-proof `touchmove` handler prevents scrolling everywhere except `input, textarea, select, .scroll` (`game/js/main.js:254`, `formy`). No element in `index.html` has the `.scroll` class. The `.panel` elements (`index.html:53, 66, 86, 101, 120`) are `overflow:auto` but are never exempted.

**Fix (pick one):**
- Add `scroll` to every panel: `<div class="panel scroll">` (also `wide`/`xwide`).
- Or change `main.js:254` to `t.closest('input, textarea, select, .scroll, .panel')`.

Also add `overscroll-behavior:contain` to `.panel` in `style.css` so the page never rubber-bands. Optionally tighten Settings for `max-height:340px` (smaller `.set` padding) so "Done" fits without scrolling.

### 4. P3: Double-tap guard swallows a tap on a picture preview
**Repro:** in Change Pictures, tap anywhere (for example the heading or another card), then tap a slot preview within about 320 ms. The file picker does not open. A single tap on its own works. A toddler double-tapping a picture gets nothing on the second tap.

**Why:** `game/js/main.js:261` calls `preventDefault()` on any `touchend` less than 320 ms after the previous one, unless the target matches `button, a, input, label, select, .scroll`. That cancels the synthetic `click` on `.slot .prev` (a clickable `div`, `ui.js:152`).

**Fix:** add the clickable cards to the exemption: `closest('button, a, input, label, select, .scroll, .prev, .slot')`. Alternatively, rely on `touch-action:manipulation`, which already disables double-tap zoom on buttons, and only guard `#game` (`closest('#game')`).

### 5. P3: Findings from reading the code (no failing check)
- **a. Dead kid-proof branch:** `game/js/main.js:256` prevents multi-touch `touchstart` only when the target is *outside* `#stage`. Every element is inside `#stage`, so this never runs. Pinch is currently stopped by `touch-action:none` and `gesturestart` only.
  - Fix: delete the line, or invert it to prevent multi-touch everywhere except `#stage` canvas steering. Keep the canvas un-prevented so the 2nd finger still gives rain.
- **b. Hybrid Windows touch laptops get the phone UI:** `isTouch` (`main.js:8`) is true whenever `maxTouchPoints > 0`. A Surface or touch laptop therefore hides the keyboard hints (`body.touch .kb-only`), shows 💧, narrows the play range (`render.js:95`) and uses the 3.2 MP cap. This is not "exactly as before" on desktop.
  - Fix: `isTouch = matchMedia('(pointer:coarse)').matches` (primary pointer), with the 💧 button revealed on the first `pointerType==='touch'` event.
- **c. Resize without `orientationchange` does not cancel a drag:** examples are iPad Split View / Stage Manager, and some Android browsers. `onResize` (`main.js:37`) only re-clamps `renderer.pointer[0]`, which is a scene coordinate computed for the old layout. Puff walks to a stale spot until the finger moves.
  - It is harmless for Safari toolbar changes, which keep the width. But consider calling `releasePointer()` in `relayout()` when `window.innerWidth` changed.

---

## Notes on the test
- CDP `touchEnd` must list the **lifted** points, not the remaining ones. `touchMove` without a point does not lift it. The test uses this to lift exactly one of several fingers.
- Puff's `maxSpeed` is 400 px/s, so hold checks wait 2.5 s for a full shore crossing.
- When a 2-finger tap fails (issue 1), the test confirms a lone tap works, then pauses or restarts through the API. That way the later checks (stale touches, rotate-while-paused, resume) still exercise the "finger still down" state.
- `visibilitychange` is simulated by overriding `document.hidden` / `visibilityState`. AudioContext `resume`/`suspend`/`createBufferSource` are spied on, and each call is tagged with `window.event.type`.
