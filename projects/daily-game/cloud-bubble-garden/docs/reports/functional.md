# Functional QA report: Nimbus's Bubble Garden

Suite: `tests/e2e/functional.js` (Playwright + Chromium, `file://`). Run: `node tests/e2e/functional.js [section]`. It takes about 4 minutes; set `LONG_RUN_S` to change the length of the soak run (default 60 s real time at ×16 speed).
Screenshots are saved to `tests/out/func_*.png`.

## Summary

**324 checks passed, 5 failed.** All 5 failures are real layout bugs on iPhone and iPad, not problems in the test code. They come from two issues (F1, F2 below). Every rule, menu, input, save, picture and soak check passes.

| Section | Result | Covers |
|---|---|---|
| static | 16/16 | Go wrapper (port 47623 and fallback, `%APPDATA%` store, bindings registered before Navigate, atomic write, key filter, single instance), iOS meta tags, icons, 45 SVG assets |
| boot | 5/5 | Title with the bot demo running, Play focused, `NB.debug` hooks, zero console errors |
| menus | 23/23 | Title → How to Play / Settings / Change Pictures, each closed with its button and with Esc; Play; Pause → Settings → back; Resume, Restart, Main Menu; Game Over → Menu / Play Again |
| keys | 11/11 | Esc and P pause and resume; the world is frozen while paused; Esc during the 1.6 s nap delay and on Game Over does nothing; M mutes |
| input | 24/24 | The mouse sets the target exactly at the cursor (no lift); Nimbus reaches it; the target is clamped above the lawn; the 4 arrow keys and W/A/S/D each move her the right way and she settles when released; HUD mute and pause buttons never move the target; hover, clicks and arrows on the Pause screen never steer; the click on Play or Resume does not leak into play |
| touch | 16/16 | Finger down puts the target 0.7 unit above the finger; dragging steers her; a second finger on Pause pauses while the first one steers; a hover pointermove without a finger down does not steer; a tap moves her; HUD taps; no ghost clicks |
| rules | 22/22 | Pop scores 10 × size (sizes 1 to 5); she grows every 4 gems; size 5 + 4 gems starts the shower (pops every bubble at 50 points each, washes hanging burrs away, +50 × (level+1) bonus, back to size 1); bump costs 1 heart and 1 size; 1.5 s safety after a bump; hanging and rolling burrs are harmless; level up gives the bonus and +1 heart (capped at max); Night → Dawn round 2 with goal +2; hearts 5/3/3; game over stops spawns; deterministic; live game checks |
| over | 9/9 | Over screen shows the score; the 0.7 s restart lock covers Enter, Space and Play Again; after the lock, Enter, Space and held Enter each restart exactly once; Enter on a focused Menu button goes to the title |
| focus | 12/12 | Space and Enter on the title start exactly once; focus is dropped during play; focused How to Play, Settings (Done is focused, never Reset), Resume and Restart do what they say exactly once |
| settings | 15/15 | Defaults; settings saved and restored after a reload; Hard is applied to the next run; `?mute=1` and `?diff=` are never saved; Reset best needs 2 taps; only `nbg:` keys are used |
| best | 8/8 | Best is kept per difficulty and survives a reload; a lower score does not overwrite it; a run counts for the difficulty it started on; NEW! badge |
| pictures | 23/23 | Choose… opens the file chooser; `setInputFiles` on `#filePick` works for hero, gem and backgrounds; a photo becomes round, a cut-out stays whole; text and broken files show a friendly toast; a 6000×4000 image is shrunk to 1600×1067 (background) or ≤ 512 px (gem); pixels in play show the custom Nimbus, gem and sky; pictures survive a reload; Reset and Reset all work |
| layout | 115/120 | 1280×720, 1920×1080, iPad 1024×768 and 768×1024 (DPR 2), iPhone 390×844 and 844×390 (DPR 3, touch), with emulated safe-area insets: canvas, HUD buttons (≥ 44 px), panels, Nimbus at size 5 in every corner, all 6 screens fit, finger-sized buttons. **5 FAIL (F1, F2)** |
| rotate | 6/6 | 8 rotations with Nimbus forced into the corner and a burr and bubble at the edge: everything stays on screen; rotating while paused stays paused |
| blur | 7/7 | Window blur pauses and releases held keys; a hidden tab pauses and suspends audio; returning stays paused; a 30 s frame gap does not fast-forward; blur on the title does nothing |
| long run | 12/12 | 16 minutes of game time at ×16 with the skill-0.5 bot and autorestart: 2 games, 551 pops, 22 showers, 0 errors, particles ≤ 158, Nimbus never left her box |

## Issues

### F1 (P2): in portrait, and partly in landscape, burrs dangle hidden under the HUD
**What happens.** Burrs dangle at `topY + 0.15·unit`, and `topY = 0.85·unit` whatever the HUD needs. In portrait the canvas HUD has two rows: the score panel, then the jar panel at `top + 108`, ending around y ≈ 200 (≈ 265 with a notch). So the dangling warning is drawn under the semi-transparent panels, and on the right it is behind the DOM pause and mute buttons. `tests/out/func_iphone_port_390x844_play.png` shows a green burr peeking out from behind the mute button. The hidden share of the dangle line is 95 % on iPhone portrait, 70 % on iPad portrait and 55 % on iPad landscape (1280×720 and 1920×1080 pass at ≤ 50 %). The burr's warning wiggle is how the game is fair to small children, so on a phone held upright the warning is mostly lost. Only the faint shadow on the lawn remains.
**Repro.** Run `?mute=1&autostart=1&diff=easy` at 390×844 with touch, then run `w=NB.debug.world; w.spawnBurr(w.layout.width*0.85)` in the console. The burr hangs behind the pause and mute buttons.
**Where.** `game/js/world.js:130-136` (`computeLayout`: `topY = 0.85·unit`), `game/js/render.js:579` (portrait jar panel at `top + 108`), `game/js/render.js:89` and `main.js:45-49` (the world is never told where the HUD ends).
**Fix.** Let the layout take a top reserve (the HUD's bottom edge plus the safe-area inset), and have the renderer pass it in:
```js
// world.js
World.computeLayout = function (w, h, opt) {
  var portrait = h > w;
  var unit = portrait ? M.min(w / 6, h / 8) : M.min(w / 9.6, h / 5.4);
  var groundY = h - 0.95 * unit;
  var topY = M.max(0.85 * unit, (opt && opt.top) || 0);          // below the HUD / notch
  var left = (opt && opt.left) || 0, right = (opt && opt.right) || 0;
  return { width: w, height: h, portrait: portrait, unit: unit, groundY: groundY, topY: topY,
    minY: topY, maxY: groundY - 0.1 * unit, left: left, right: right };
};
// reset() / setLayout(w, h, opt) keep opt (this._lopt = opt) and pass it to computeLayout.
// render.js resize(): the HUD reserve in logical px
const hudBottom = v.ins.top + 12 + (VW < VH ? 108 + 78 : 98) + 6;   // the same numbers drawHud uses
this.layoutOpt = { top: hudBottom - 0.15 * unit, left: v.ins.left, right: v.ins.right };
if (this.world) this.world.setLayout(v.VW, v.VH, this.layoutOpt);
// main.js makeWorld(): new NB.World({ …, layout: R.layoutOpt })
```
Portrait screens have plenty of height (VH up to 1600), so moving the play area down about 1.2 units costs nothing. In landscape the reserve is only about 0.2 units. A simpler alternative for landscape alone: keep burr spawn `x` out from under the two panels (sample `x` outside `[x0, x0+pw]` and `[cx−cw/2, cx+cw/2]`). That does not fix portrait.

### F2 (P2): the play area ignores the notch / safe-area insets (iPhone)
**What happens.** The renderer reads the insets (`R.ins`) and keeps the HUD clear of them, but `NB.World` does not know about them. In iPhone landscape (844×390, notch insets 47 css px ≈ 65 logical px), Nimbus's box starts at `x = r` (≈ 34 px), so she can sit fully under the camera housing. The right-most puddle bubbles are born at x 1080 ± 42 of 1169, partly under the right inset. In iPhone portrait (top inset ≈ 67 logical px), the top of a dangling burr is at y 61, just under the status bar.
**Repro.** On 844×390 with insets (the layout test injects `#safeProbe{padding:0 47px 21px 47px}`), run `NB.debug.world.setTarget(0, 300)`. Nimbus's body sits in the left 65 px.
**Where.** `game/js/world.js:192-198` (`_box`), `world.js:211-221` (`_puddles`: `x > 0.45u && x < W − 0.45u`), `world.js:247` (burr `x` range).
**Fix.** The fix for F1 carries `left` and `right` in the layout. Use them:
```js
// world.js _box(r)
var x0 = (L.left || 0) + r, x1 = L.width - (L.right || 0) - r, y0 = L.minY + r, y1 = L.maxY - r;
// _puddles(): if (x > (L.left || 0) + 0.45 * u && x < L.width - (L.right || 0) - 0.45 * u) out.push(x);
// spawnBurr(): var c = r.range((L.left || 0) + 0.5 * u, L.width - (L.right || 0) - 0.5 * u)
// spawnBubble() fallback range likewise.
```
The background and lawn still draw full-bleed under the notch, which is fine. Only things you play with move inward.

### F3 (P3): a custom Nimbus picture is clipped at the screen edges
`render.js:477-482` draws the custom-hero cloud ring with puffs at `0.95·r` and radius `0.36·r`, so it reaches about 1.31·r. The box only keeps `r` from the edge, so at the side walls about 0.3·r of the fluffy ring is cut off. (Default Nimbus is fine: her SVG body is about 0.98·r.) **Fix:** shrink the ring to `r * 0.78` with puff radius `r * 0.24` (total about 1.02·r), or clamp the box with `r * 1.3` when `NB.Assets.hasCustom('hero')`. The first is simpler and keeps the world deterministic.

### F4 (P3): Go wrapper: the fallback port changes the browser-fallback origin
`app/main.go:213-216`. If 47623 is taken, the server moves to a random port. Inside WebView2 this is harmless (storage is native). In the "no WebView2" browser fallback (`main.go:246-250`), the page then has a new origin each run, so localStorage (best scores, pictures, settings) appears empty. **Fix:** try a short list of fixed ports before the random one:
```go
var ln net.Listener
for _, p := range []string{"47623", "47633", "47643"} {
    if ln, err = net.Listen("tcp", "127.0.0.1:"+p); err == nil { break }
}
if err != nil { ln, err = net.Listen("tcp", "127.0.0.1:0") }
```
Other wrapper points look correct: keys are filtered by a regex (every key the game writes passes), writes are atomic (tmp + rename), stale `.tmp` files are ignored by `All()`, the 12 MB value limit is fine, bindings are registered before `Navigate`, and fullscreen restores the window placement. The single-instance mutex returns `true` if `CreateMutexW` fails (h == 0), which is a safe default.

### F5 (P3, test flag only): Settings under `?diff=` shows the URL difficulty
`ui.js:93` highlights `game.difficulty()`, which is the URL difficulty when `?diff=` is set. Tapping another difficulty saves it, but the highlight does not move, so it looks like the tap failed. Real players never have `?diff=`. **Fix (optional):** while `urlDiff` is set, highlight `settings.difficulty` and add a small "(test: ?diff=hard)" note, or disable the segment.

### Note for the playtest / balance owner (not a bug)
On Normal the skill-0.5 "casual" bot is almost never bumped: 6 bumps in 16 minutes of game time. Without help, one game lasted over 12 minutes and reached level 10. Even when the test cut it to one heart every 15 s, a game took 3 to 9 minutes. Sessions on Normal may be very long for a family game, and Hard may be needed for any challenge. Only about 4 to 5 bubbles were alive at once on 1280×720.

## Not covered (needs real devices)
Real iOS Safari (safe-area `env()` values, audio unlock on the first `touchend`, home-screen mode), the Windows exe, and audio. Touch was emulated through CDP touch events in Chromium.
