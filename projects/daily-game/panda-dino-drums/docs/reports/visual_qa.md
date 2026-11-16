# Momo's Dino Drums: visual QA (2026-11-16)

Reviewer: visual QA / art director (report-only; nothing in `game/` edited).
Capture: `node tests/visual/capture.js [screens floors trans pip bursts custom cvd measure]` → `tests/out/visual/` (contact sheets `sheet_*`, `burst_*`, `trans_*`, `custom_*`, `metrics.json`). Sizes: desk 1280×720, phoneL 844×390 touch DPR 2, phoneP 390×844 touch DPR 2. No page errors in any run.

## Overall
The game looks good: a warm, readable stage, a cute Momo and Pip, clear drums, gems that hop on every beat (the hop sheet shows a clean parabola, squash on landing), a smooth 0.9 s crossfade between floors, and the Sky Roof is lovely. The custom pictures work, and colour-blind play is OK: the teal gem turns lavender under deutan/protan, which still stands out against the yellow-tan walls. Measured: no judgement text ever overlaps Momo or a drum, and no text goes off screen (1500 frames per size, 3 Pip visits). There is no letterbox at the three tested sizes.

There is one visual bug (the swing ropes come loose from the ceiling). The other fixes are about overlap and phone legibility.

## P1 (must fix)
1. **Swing ropes come loose from the ceiling when Momo tilts** (game over "sleepy" and every lane switch). In `render.js:561–568` the ropes are drawn inside the rotated group (`g.rotate(tilt …)`), so the rope tops swing sideways by (y+40)·sin(tilt). With the sleepy tilt of 0.18 rad that is about 80 px on desk and about 170 px on phone portrait, so the ropes cross the screen at a slant (see `burst_phoneP_sleepy.png`, `burst_desk_sleepy.png`).
   Fix: draw the ropes **before** `g.rotate`, in un-rotated space. Rotate each seat attachment point by the angle `a = tilt + wobble`: `ax = x + (sx·cos a − sy·sin a)`, `ay = y + (sx·sin a + sy·cos a)`, with `sx = swL + rx·s`, `sy = swT + 2·s`. Then draw a line from `(ax, ay)` up to a **fixed** top `(x + sx, −40)`. Keep the seat and Momo rotated as now. The ropes then pivot at the ceiling like a real pendulum.

## P2 (should fix)
2. **The ropes are drawn over the upper drum** when Momo is on the lower lane. The right rope x = kitX + 48·s = ringX − 8, which is inside the drum's 36 px half-width (`phoneL` play, `scr_desk_play.png`). Fix: in `draw()` (`render.js:378–381`), draw the ropes in their own pass `drawRopes(g,w,al)` **before** `drawRings`, so the drums sit in front of the rope. Take the rope code out of `drawKit` (lines 566–570) and keep the P1 geometry.
3. **"Pip caught it!" covers Pip during the swoop** (measured in 4–5 of 27 text frames per size; `burst_desk_pip.png` save +0.1…+0.6). In `render.js:289`, change the position from `x + 60*gs, y - 64*gs` to `x: x + 120*gs, y: e.lane === 0 ? y + 72*gs : y - 72*gs`. That puts the text in the band between the two rails, away from Pip's swoop path and from the gem hops.
4. **"+N ×2" points text sits on the incoming upper-lane gem** (it lands at y − 30, inside the hop arc, which reaches coinY − 50; see the ferns, nests and sky floor frames). In `render.js:269`, change the points text to `x: x + 140*gs, y: y - 66*gs`, and in `render.js:268` change "Perfect!/Good" to `y: y - 66*gs` (now −58). Both then sit above the highest gem top.
5. **The Game Over panel covers sleepy Momo**, even though overlays must never cover Momo. On desktop, Momo is at css x ≈ 130–260 under a centred 636 px panel; on phone portrait the panel grows to about 620 css px tall and covers him. Add to `style.css`:
   ```css
   @media (orientation:landscape){ #scrOver{justify-content:flex-end;padding-right:calc(var(--u)*4)} }
   @media (orientation:portrait){ #scrOver{align-items:flex-start;padding-top:calc(env(safe-area-inset-top) + 72px)} }
   ```
   This puts the desk panel at x 593…1229 (Momo's right edge is 259 css) and the phoneL panel at 480…815 (Momo's right edge is 170 css).
6. **The title screen buttons cover Momo on phone portrait**. The title-wrap spans css y 198–646 and the demo Momo's head is at about 561 (`sheet_screens_phoneP.png` title). Add `@media (orientation:portrait){ #scrTitle{align-items:flex-start;padding-top:12vh} }`. Also, the `.title-wrap` is 406 px wide on a 390 px screen; add `max-width:94vw` at `style.css:58`.
7. **The low-groove "!" bubble covers the first score digit** (`sheet_cvd_hud.png`: "1300" reads "!300"). In `render.js:666`, move it to the end of the meter: `bx2 = bx + bw + 12*K, by2 = gy + bh/2`, and widen the plate (`plateW` at line 650) by `+ 22*K` so it stays on the plate.
8. **Text is too small on phones** (css px = logical × 0.72 on phoneL, 0.70 on phoneP; measured in `metrics.json hud_*`):
   - "Miss" / "Too early" is 13.9 css px in grey `#c9c3d9`, which is weak on the light walls. In `render.js:275`, use `size: Math.round(24*Math.sqrt(gs))` and `color: '#efeaff'`.
   - The Pip "×2" badge is 8.7 css px on phoneL. In `render.js:537–540`, use `r = 16*gs*K` and font `Math.round(14*gs*K)`, with `K = this._hudK || 1`.
   - The "+N" points text is 12.3 css px on phoneL. In `render.js:269`, use `size: Math.round(20*Math.sqrt(gs))`.
9. **Gems have low luminance contrast on three of the four floors.** The gem mean is `#67b6ba`. Contrast with the wall band the gem hops through: river lane1 **1.03**, river lane0 1.29, ferns lane0 **1.09–1.11**, ferns lane1 1.13, nests lane1 1.17, sky 3.7–4.0. Only the hue difference makes the gems readable, and that weakens at a glance for small kids. Fix:
   - In `render.js:451`, change the contact halo from `rgba(40,30,60,.18)` with r `s*0.56` to `rgba(40,30,60,.32)` with r `s*0.60`, and add a 2 px stroke `rgba(255,255,255,.85)` at r `s*0.60` (a sticker ring).
   - In `render.js:235`, change the lower-rail bed alpha from `.10` to `.16`.
   - Target a mean ratio of at least 1.5. Re-measure with `node tests/visual/capture.js measure`.
10. **The Easy one-button hint shows a "down" chevron** (`render.js:422`), which tells a 3-year-old to tap the bottom. Draw a neutral tap target instead, at `(x, L.split)`: a filled circle `#5cc65a` with r 18, and a pulsing white ring with r `22 + 10*this.beatPulse`, lineWidth 4, `rgba(255,255,255,.9)`.
11. **Touch targets are too small on phones**: the Custom screen's Choose/Reset/shape buttons are **27 px** tall and the Settings buttons 31 px (the iOS minimum is 44). Add to `style.css`: `@media (pointer:coarse){ .btn-tiny,.slot .shape button{min-height:40px;font-size:max(13px,calc(var(--u)*1.4))} }`. Also, the Settings hint "(for wireless headphones)" is 11 px on phones; change `.set small{font-size:.65em}` to `font-size:max(12px,.65em)`.

## P3 (nice to have)
12. **"Pip is here! Points ×2" appears 0.55 s before Pip is visible.** Pip starts at `AWAY = [2.3, −1.4]` (world.js:587), which is far off-screen. Use `[1.15, −0.7]` so Pip flies in at once (world.js is a mechanics file, so check with mechanics). On desk the text also always sits on the arch window (x 512, y 182). Use `y: L.coinY[0] - 150` there, or accept it, since the text has an outline.
13. **The custom hero overlaps the drum** (photo circle on `custom_*_play.png`). In `render.js:576`, change `A.fit('hero', 84, 84)` to `76, 76` and translate by `-6*gs` in x.
14. **The floor change is a crossfade only**, with no sense of "the lift goes up". During `vis.t < 1` (`render.js:370–373`), draw `prev` shifted down by `vis.t * 60 * px` and `cur` from `(1 − vis.t) * −60 * px`, so the room slides down while Momo rises. The banner also hides the new floor's arch for 2 s (`render.js:706`). Placing it at `cy = L.win.y + L.win.h + 50` when there is room would fix that.
15. **The ropes show through the HUD plate**, which has alpha .5 (`render.js:651`). Raise the plate alpha to `.62`, or end the ropes at `L.ins.top + L.hudH` when `x < plateW + 30`.
16. **The Pip call meter in the HUD is tiny on phones** (16 css px icon, 5 px dots). In `render.js:688–693`, use `ic2 = 28*K`, dot r `4.5*K`, and spacing `12*K`.
17. **The phone-portrait HUD floor name and progress bar** are squeezed to about 50 px between the plate and the pause button. When `pw < 90`, hide the bar and show only the name, or move the bar under the plate.
18. **On phoneL, the wind-chime deck prop at the right edge is half-hidden** by the down chip. In `render.js:224`, reduce the inset `140` to `220` so the props spread less wide on touch, or skip the last prop when `touch`.
19. **The letterbox is plain `#2b2350`** (`style.css:13`, `:177`). It is only seen at aspect ratios above 2.37:1 or below 0.35. Use `background:linear-gradient(#ead2a6,#c9a77b)` (the river wall tones) so it reads as scenery.
20. **The Game Over stats wrap mid-phrase on phones** ("Miss:" / "2"). Use `white-space:nowrap` on each stat chunk, or shorten them. The desk Settings panel reports `scrollHeight > clientHeight` (it fits visually), so check the 2 px overflow.

## Verified OK
- Hop: one parabola per beat with max height 30·gs, squash on touch-down, a shadow that shrinks in the air, and the last touch on the drum at the hit time (`burst_*_hop.png`).
- Hit: the drum squashes, a teal ring and sparks appear, and the gem arcs into Momo's pouch. Momo shows reach for about 0.08 s, then happy.
- Miss: the gem bounces off the rim and tumbles off, fading in 0.35 s. Momo's dizzy wobble shows stars. Nothing is scary.
- Lane switch: the swing snaps in about 0.08 s with a lean (apart from the rope anchors, see P1).
- Pip: perched at desk (264, 133) / phoneP (188, 385), clear of the gem hops (0 overlap frames while perched). He touches Momo or a drum only during the swoop (2 / 7 of 1310 frames). The ×2 badge has a time ring.
- Floor crossfade, both arches aligned, and props kept in place. The Easy layout matches Normal.
- Colour-blind (deutan/protan): the gem goes lavender and the rainbow gem goes pale yellow with a pulsing ring, so both stay distinct. The groove bar colours collapse, but the "!" bubble is a shape cue (after the P2 #7 move).
- Custom pictures: a blurred, washed photo wall, round hero/helper stickers, and a gem in a teal disc all read well. Pip keeps its lilac wings.
