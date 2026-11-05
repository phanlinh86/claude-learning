# Visual QA: Bolt's Rooftop Flip (2026-11-05)

Visual QA and art direction pass. This report only lists problems and fixes; the integrator applies them.

- **Capture:** `node tests/visual/capture.js [only=screens,zones,fade,motion,ff,custom]`. It takes about 5 minutes and writes PNGs to `tests/out/visual/`.
- **Frame stepping:** motion sheets freeze the game with `setSpeed(0)` and step it with `RF.Game.step(1/120)`. Every frame is exact and reproducible.
- **Hand-made tracks:** scenarios are built with `world.setTrack`.
- **Viewports:** desk 1280×720, iPad landscape 1024×768, iPad portrait 768×1024, iPhone 390×844 and 844×390 (iPad and iPhone at DPR 2).
- **Console:** no errors.
- **Not covered:** Chromium does not emulate iOS safe-area insets, so notch and home-bar clearance is not verified.

Logical sizes used below:
- **Desk / iPhone landscape:** VW×VH 1280×540 / 1169×540, unit 100, ceilY 141, floorY 431, heroX 333 / 304.
- **iPhone portrait:** 560×1212, unit 93.3, ceilY 471, floorY 741.
- **iPad portrait:** 720×960, unit 120.

## Overall verdict

The game looks good:
- The art is consistent and soft. Bolt is cute and readable. The times of day each have their own mood.
- The night zone is the best-looking one.
- Firefly shapes (heart, star, drop) survive greyscale and deuteranopia. See `ff_zone*_grey.png` and `ff_zone*_deutan.png`.
- Banners and the start hint sit on the facade, not in the corridor.
- Obstacles read clearly in all four times of day.

Four things hurt a 4–7-year-old, and they are the P1 items below:
1. The rescue happens off screen in landscape.
2. Bolt's own colour is tiny.
3. The flip collapses to a paper-thin sliver.
4. The nose dips the wrong way during the flip.

---

## P1: fix before shipping

### P1-1. The gap-fall rescue is off screen in every 16:9 landscape view (desk, iPhone landscape)
**Evidence:** `sheet_gap_rescue.png` and `sheet_gap_rescue_rail.png`.
- From t=8.03 to 8.76 there is no Bolt and no drone on screen for about 0.7 s. The drone then rises from the bottom edge already carrying him.
- When the fall is from the rail, Bolt and the drone disappear above the top edge and under the score panel.

**Cause:**
- At VH 540, floorY is 431. The fall triggers at `floorY + fallOut·u` = 431 + 130 = **561 > 540** (world.js:44, :606).
- Bolt keeps dangling down while the drone flies in (`catchDamp 8`, world.js:69, :682). His centre ends near y ≈ 640–670.
- The drone hangs 0.72 u above him, so it is also below 540.
- On the rail side, the fall triggers at `ceilY − 130 = 11`, which is under the 110-px-tall HUD panels.
- iPad landscape (VH 720) and all portrait views have room, so the bug is only in ≥16:9 views. iPhone landscape is one of them, and it is the main way kids hold a phone for a runner.

**Fix (mechanics + render):**
1. Make the fall threshold depend on the screen:
   `fallOut = min(1.3, (H − floorY)/u − 0.55)` for the floor, and `min(1.3, (ceilY − hudBottom)/u − 0.3)` for the rail. At 1280×540 that gives ≈0.54 u below and ≈0.3 u above.
2. Clamp Bolt's dangling y during `drone.state==='in'`: at most `H − 0.5u` (floor) and at least `hudBottom + 0.5u` (rail). Also raise `catchDamp` from 8 to 18, so he stops within about 0.2 u.
3. Start the drone on screen: `sy` at world.js:656 should be the clamped value, not `floorY − 0.6u`.
4. Check: in `sheet_gap_rescue`, every frame should show both Bolt and the drone.

### P1-2. Bolt's own colour is far too small for a 4–7-year-old
The twist depends on the child knowing "I am pink now".
- The only cue on Bolt is the chest symbol (render.js:546–556): `r = 10/128·S`, drawn at `r·0.72` ≈ **5.3 logical px** (an 11-px heart).
- On screen that is about 14 CSS px on desktop and about **7.5 CSS px on iPhone portrait** (`phone_play.png`, `phone_zone2.png`).
- A yellow star on the white body is especially weak (`sheet_night_flip_up.png`).
- The HUD "Catch" chip helps, but kids look at Bolt, not the HUD.

**Fix (render only, keep the art):**
- Draw the chest symbol at `r·1.15`, overflowing the screen a little, with a 2-px white outline. Raise the chest glow from `gr = r·2.6` to `r·4` and its alpha from 0.85 to 1.
- Add a coloured **aura ring under his paws**. Draw a flat ellipse on the current surface: rx 0.42 u, ry 0.08 u, `COL[color]`, alpha 0.55, additive. Place it at `standY ± 0.42u` (the feet line) so it flips with him. In the air, fade it out.
- Optional and strongest: tint the collar or ear insides with `COL[color]`. Do it by drawing a coloured ellipse in sprite space over the collar at (64, 92) r≈18×6 with `globalCompositeOperation='source-atop'` on a cached per-colour copy.
- Apply the same idea to the custom hero badge (render.js:539–540). It is `R·0.36` and reads well; keep it.

### P1-3. The turn-over collapses Bolt to a paper-thin sliver for about 75 ms of every flip
**Evidence:** `sheet_desk_flip_up.png` frames ft 0.38 / 0.49 / 0.59, `sheet_night_flip_up.png` ft 0.45 / 0.59, `sheet_custom_flip.png`.
- `sy = cos(π·ft)`, clamped to ±0.18 (render.js:509–510). For about 3 frames at 40 fps, Bolt is an 8-px line, at the very moment the child is watching him.
- It reads as a playing card turning, not a pup flipping, and a custom photo hero turns into a thin disc.

**Fix:**
- Raise the clamp to **±0.42** and pass through zero quickly. For example, `sy = sign(c)·max(0.42, |c|^0.6)` with `c = cos(π·ft)`, so the sign flips in one frame at ft = 0.5.
- In the same frames add a rotation of up to ±0.35 rad (see P1-4), so the swap is hidden by the motion.
- Optional: at |c| < 0.5, swap to `bolt_air` drawn without the y-scale and rotated ±π/2 (side-on tuck). It is a real drawing instead of a squashed one.
- Check `sheet_desk_flip_up.png`: every frame should show a body at least about 40 % tall.

### P1-4. The nose trails instead of leading during the flip (sign bug)
**Evidence:** `sheet_desk_flip_up.png` (going up, his face dips down and right) and `sheet_desk_flip_down.png` (going down, his face points up).

**Cause:** the comment at render.js:508 says "nose leads in the direction of travel", but `tilt = −sin(π ft)·0.55·going` with `going = −1` when flying up gives **+0.55 rad**, which is clockwise, so the nose turns down.

**Fix (render.js:512):** `tilt = sin(π·ft)·0.45·going`. Going up gives −0.45 (nose up); going down gives +0.45 (nose down). Combined with P1-3, he reads as diving head-first onto the rail and back.

---

## P2: important polish

### P2-1. The landing squash lifts Bolt's paws off the surface (pop at contact)
- `g.scale(1+sq·0.16, sy·(1−sq·0.16))` is applied around the body centre (render.js:514–517).
- The feet line is 0.42 u from the centre, so at landing (sq ≈ 0.63) the feet jump **≈ 4.2 px** away from the roof or rail for the first frames after contact. It is visible on the rail at t=1.47 in `sheet_desk_flip_up.png`.

**Fix:** pivot the squash on the feet:
```
translate(x, y + 0.42u·sign(sy))
scale(...)
translate(0, −0.42u·sign(sy))
```
Then draw. Also make it stronger: 0.16 → 0.24 horizontal and 0.22 vertical, so the "CLANK" reads at phone size.

### P2-2. Big callouts float in the play corridor over fireflies and obstacles
- `say()` texts ("×4 Glow streak!", "Not my colour!", "Blue!", "Boing!", "Whee-e-e!") sit at `y = midY` and `x ≈ heroX + 0.42·(VW−heroX)` (render.js:255–256), sized 20–28 × _hudK.
- This puts them exactly in the arc where the next fireflies and the flip path are (`desk_play.png`, `phone_play.png`, `desk_custom_play.png` "Blue!" sits over two fireflies, `desk_zone0.png`).
- They are also far from Bolt, so "Boing!" and "Whee!" do not connect to the event (`sheet_bump_vent.png`).

**Fix:**
- Put the **event words** ("Boing!", "Whee!", "Not my colour!", colour name) close to Bolt, on the side away from the surface. On the roof that is `y = h.y − 0.9u`; on the rail it is `h.y + 0.9u`. Use x = heroX + 0.5u and a smaller size (20).
- Put the **streak** callout on the facade line (`_lowY()`), like the banner, or above the rail, at `ceilY − 0.7u` in landscape and in the empty sky in portrait.
- Cap callout alpha at 0.9 and life at 1.0 s.

### P2-3. Firefly readability details
Shapes work in greyscale. Three issues:
1. **The yellow star lantern is visibly smaller and weaker** than the heart and drop: a star has about 45 % of a heart's area (`ff_zone1.png`, `desk_zone1.png`). It also loses its glow on warm skies. Fix: draw yellow fireflies at ×1.15 (render.js:462 `s *= f.color===1 ? 1.15 : 1`), or enlarge the star in `firefly_yellow_*.svg` to r ≈ 17.
2. **The non-matching glow is still strong** at 0.6 alpha × r 0.48 u (render.js:457–458). Mixed groups look equally "available". To strengthen the twist, drop non-matching glow to 0.35 and scale to 0.88. The matching ones then pop, and a 4-year-old sees which ones to grab.
3. **The custom-firefly symbol badge is too small:** `s·0.2` ≈ 4.4 px at desk (render.js:467). In greyscale the colour ring is the only cue. Use `s·0.32`, placed at `(x + s·0.36, y + s·0.36)`, with a dark backing disc like the hero badge.

### P2-4. Bright suns in the corridor band (backgrounds)
- **Dawn:** the sun disc (pale `#fff0c8`-ish, r ≈ 55 logical) sits at y ≈ 290 (= midY), in the middle of the corridor (`desk_zone0.png`, `desk_start_hint.png`). It barely moves (parallax 0.02), so every yellow star firefly passes over a pale-yellow disc.
- **Sunset, iPhone portrait:** a large bright orange-yellow sun glow sits at roof level right behind Bolt (`phone_zone2.png`, x 400–560 CSS, y 900–1030 at 2×).

DESIGN §3 says the corridor must stay darker and less saturated than the fireflies. Fix in `levels/dawn/sky.svg` and `levels/sunset/sky.svg`: move the sun centre down to y ≈ 430–470 (behind the `mid` skyline, so only its top shows above the roofs), and cut its core brightness by about 20 %.

### P2-5. Bumps "ghost" through the obstacle
**Evidence:** `sheet_bump_vent.png` and `sheet_bump_sign.png`.
- On a bump Bolt keeps running straight through the vent or sign, drawn over it, and starts blinking at alpha 0.45 (render.js:507).
- The obstacle's own squash (0.18) and sign swing are hard to see. For a kid it looks like "nothing happened" plus the battery goes.

**Fix:**
- Add a render-only hop. While `bumpT < 0.45`, offset Bolt's sprite by `−0.35u·sin(π·bumpT/0.45)` away from his surface, so he boings up over the vent or down under the sign.
- Raise the vent squash to 0.3.
- Blink between 0.55 and 1 at 8 Hz instead of 0.45 / 10 Hz, so he never disappears against a grey vent (frames t=3.40–3.47).

### P2-6. Portrait composition: the corridor is only about 22 % of the screen (iPhone portrait)
**Evidence:** `phone_play.png`, `phone_zone2.png`, `phone_custom_night.png`.
- At 560×1212 the corridor is 271 logical px (≈ 190 CSS px of 844).
- The screen splits into three bands: about 160 CSS px of empty sky between the HUD (bottom ≈ 138 CSS) and the rail cables, the corridor, and about 320 CSS px of facade below the roof.
- Bolt is about 62 CSS px tall.

**Options, in order of preference:**
- (a) In portrait use `unit = min(w/5.2, h/8)`, `heroX = 0.2·w` and corridor ±1.35 u. That makes Bolt and the fireflies about 15 % bigger. Look-ahead goes from 4.7 u to 4.2 u, which mechanics must check against `reaction·speed + flightDist`.
- (b) Raise `midY` to 0.46·h in portrait. Less empty sky, and more facade for the thumb and the hint.
- (c) Use the empty sky band. Move the second HUD panel (Dawn / progress / Catch) down to sit just above the rail cables (`cy = ceilY − 1.6u − 78`), or put the colour cue there as a big chip.

The iPad portrait (720×960) composition is good as is (`ipadP_zone3.png`).

### P2-7. How to Play: firefly icons overflow onto the text (iPhone portrait and landscape)
- **Evidence:** `phone_how.png` and `phoneL_how.png`, the third card. Three firefly images at `width: calc(var(--u)*4.2)` (style.css:280) plus gaps are wider than the icon column. The left one sticks out of the card, and the drop firefly sits on top of "only fireflies of".
- **Fix:** `.how-ico{flex:0 0 auto}` and, for 3 images, `.how-ico img:nth-last-child(3), .how-ico img:nth-last-child(3) ~ img{width:calc(var(--u)*3)}`. Or stack them in a 2+1 grid (the existing `.quad` class).

---

## P3: nice to have

1. **Score panel overlaps the rail truss** in landscape. The panel spans y 12–110, and the truss top is at `ceilY − 0.4u` = 101: 9 px overlap (render.js:630, panel height 98). Either reduce the panel to 88 high (batteries at top + 64), or keep it and accept it (it fades when Bolt is under it).
2. **The night moon hides behind the centre HUD panel** (`desk_zone3.png`, x ≈ 450). Move the moon in `levels/night/sky.svg` to x ≈ 760–820 or y ≈ 200.
3. **"+N" pops and the ✕ appear on Bolt's head** when he catches at body height. The pop is at `y − 26u` (render.js:211) and the ✕ at `ff.y − 20u` (render.js:216), as seen in `desk_play.png` and `sheet_phone_flip_up.png`. Pop above or ahead of the firefly, offset away from Bolt: `x + 0.5u`, and `y ∓ 0.55u` away from his surface.
4. **The gate flash washes the whole screen beige** for about 0.2 s (`sheet_gate.png` t=20.42; render.js:328, max alpha 0.35). Cap it at 0.18, or flash only the corridor band.
5. **Custom hero: the "magnet legs" are hidden** behind the ring. The legs run from `R·0.7` to 0.42 u, almost fully behind the disc (render.js:532–535, `desk_custom_play.png`). Draw the ring 0.06 u higher (`cy = −0.08u`) and the legs 0.12 u wide, so the paws show.
6. **Custom backgrounds are static.** There is no parallax at all (render.js:182), so the world feels like it slides over a poster. Draw the photo at 1.08× and pan it by `camX·0.02 mod overflow`.
7. **Custom backgrounds can kill firefly contrast.** A hot-pink custom photo behind pink fireflies is a good example (`phone_custom_night.png`). Add a corridor scrim for custom backgrounds only: `rgba(14,16,44,.22)` between `ceilY` and `floorY`.
8. **Game over (all sizes):**
   - The "NEW!" badge sticks out past the right edge of the score card (`desk_over.png` x 1057–1117, `phone_over.png`).
   - On phone the stats line wraps as "· Paint / arches: 1". Use one stat per line in portrait (`.stats span{display:block}`), and keep the badge inside the card (`right: 8px`).
   - The ×4 multiplier is still shown in the HUD behind the dim at 0 batteries. Hide it when `phase==='over'`.
9. **Portrait title** (`phone_title.png`, `ipadP_title.png`):
   - The top about 28 % is an empty cloud.
   - The round icon sits on the rail girder, and the demo's hanging sign peeks out behind the logo.
   - Fix: in portrait, move the title block up by about 12 vh, so the icon sits in the sky and the menu sits over the corridor and roof. Or pause the demo's sign spawning on the title.
10. **The facade bottom ends in a flat fill.** On iPhone portrait the drainpipes stop at y ≈ 745 CSS (`phone_play.png`). Draw a second building row (tile `building.svg` again below `top + bh`, darker) instead of the `info.bottom` fill (render.js:351).
11. **Sunset streak clouds** cross the corridor and the rail underside as salmon stripes. They read as a glow strip on the rail in `phone_zone2.png`. Drop their alpha in the corridor band by about 30 %.

## What is good (keep)
- **Gaps:** they read clearly in all four times of day. The darker side walls (0.1 u) and the rail end caps with red lights make edges obvious.
- **Obstacles:** vent, chimney with smoke, paw sign and flower basket are distinct, friendly and well outlined (`desk_obstacles.png`).
- **Upside-down Bolt:** paws sit on the rail underside, the face reads, and it is cute (`desk_play_rail.png`).
- **Crossfade:** smooth over 1.6 s with no pop (`sheet_fade_01.png`, `sheet_fade_23.png`).
- **Finish arch:** bunting and glowing star, with the "+100" and banner on the facade (`sheet_finish.png`).
- **HUD:** the panels fade under Bolt. Text sizes are fine at every size, and the pause and mute buttons clear the panels.
- **Menus:** Settings, Change Pictures and Pause fit at every size. Change Pictures on phone is long but complete.

## Most telling screenshots (`tests/out/visual/`)
- `sheet_gap_rescue.png`, `sheet_gap_rescue_rail.png`: P1-1
- `sheet_desk_flip_up.png`, `sheet_desk_flip_down.png`, `sheet_night_flip_up.png`: P1-3, P1-4, P2-1
- `phone_zone2.png`, `phone_play.png`: P1-2, P2-4, P2-6
- `desk_play.png`, `desk_custom_play.png`: P2-2
- `ff_zone1.png`, `ff_zone1_grey.png`, `ff_zone3_deutan.png`: P2-3
- `sheet_bump_vent.png`: P2-5
- `phone_how.png`: P2-7
