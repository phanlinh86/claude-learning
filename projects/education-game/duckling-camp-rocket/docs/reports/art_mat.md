# Art report: mats, things and camp props (character artist B)

Owner files: `game/js/mat_art.js` (`DK.MatArt`), `tools/mat_sheet.js`, `tests/unit/mat_art.test.js`, `docs/art/mat_*.png`.
I started from `stone_art.js` and kept its thing, icon, home-badge, hint-hand, tile and sign code. Then I deleted
`game/js/stone_art.js`, `tests/unit/stone_art.test.js` and `tools/stone_sheet.js`. There were no `docs/art/stone_*` files to delete.

- Test: `node tests/unit/mat_art.test.js` → 15 110 checks pass, with and without Path2D.
- Sheets: `node tools/mat_sheet.js [things things_3x states camp pad_3x icons round]`

## References (web search, reference only; all art is original)
Enamel camping mugs (speckled body, steel rim), vintage camp lanterns (hood + glass globe + fuel base + wire bail),
DIY water-rocket launchers (a wooden stand, a launch tube with a clamp collar, a hose to a pump with a pressure gauge), and
round woven seagrass/rattan mats (concentric coils, a darker woven ring, a bound edge). No brands, logos or known characters.

## API as implemented (DESIGN §4.3)
Every function guards a null ctx, NaN or Infinity input, alpha 0 and size 0. The file is node-safe at load and never
touches `document` while loading.

| Function | Origin / notes |
|---|---|
| `drawMat(ctx, S, opt)` | origin = mat centre on the ground; ellipse S × 0.42·S. `opt { seed, unfold, flap, squish, gold, glow, active, wet, alpha, t }` |
| `drawThing(ctx, thing, size, opt)` | origin = bottom-centre; `opt { glow, wiggle, alpha, rot, count, shadow, numeral, direct }` |
| `drawPennant(ctx, thing, w, opt)` | origin = top-left corner (pole side); height `pennantH(w)` = 0.62·w (w 72 → 44.6 fits the 46 px pitch); `opt { flutter, t, alpha, dir }` |
| `drawPole(ctx, x, y0, y1, opt)` | a wooden pole, a stone base at y0, a golden knob above y1, a rope and a cleat; `opt { t }` makes the rope sway |
| `drawPad(ctx, x, y, opt)` | (x, y) = the rocket's nozzle bottom; the tube hinge is 10 px below it, the ground at y + 34; `opt { aim, hose:{x,y}, alpha }` |
| `drawPump(ctx, x, y, opt)` | (x, y) = the plunger top at rest; drawn ×1.35 (≈ 127 × 85 px); `opt { press, glow, gauge, count, alpha }` |
| `drawArc(ctx, pts, opt)` | accepts `{x,y}` or `[x,y]` points; white dots with a soft shadow that shrink and fade, with a travelling pulse from `t` |
| `drawDrop`, `drawPuddleRing` | centred; the puddle ring has ry = 0.4·r |
| `drawHomeBadge`, `drawIcon`, `drawHintHand` | kept. The icon `{kind:'number'}` now shows a numeral + pinecones. The hint-hand cuff is now Mimi's khaki hat band |
| `drawBurrow(ctx, x, y, r)` | centred on the hole; r = hole half-width (the mound is ≈ 1.45 r wide) |
| `drawRock(ctx, x, y, w)` | bottom-centre; the goat stands at `y − rockTop(w)` (0.42·w) |

How the mat options work:
- **unfold**: 0 is a rolled tube on the left, with a spiral end and a khaki tie strap. The flat part appears behind the tube
  as it rolls to the right. Values above 1 (up to 1.25) make the mat wider and flatter for the overshoot wobble.
- **flap**: signed −1..1, meant to come from a spring. The cloth wave is drawn in 32 vertical strips of the cached bitmap.
- **squish**: −0.5..1. Positive presses the mat wider and flatter; negative makes it taller for the rebound.
- **gold**: a gold tint, a halo and sparkles.
- **glow**: a warm halo and outline.
- **active**: a dashed white ring; its dashes march with `t`.
- **wet**: a slightly darker, glossy face with water beads. The mat colours themselves never change with the weather.

Extra helpers: `pennantH(w)`, `rockTop(w)`, `matRy(S)`, `pumpHose(x, y)` (the pump's hose port, to pass as `drawPad`'s
`opt.hose`), `thingTop`, `dotLayout`, `variant`, `pal`, `lineOf`, `contrast`, `thingKey`, `clearCache`, `stats`. Constants:
`MAT GOLD SIGN CONE WATER INK FONT PALETTE OBJS SHAPES ANIMALS HOMES KINDS SMALL`.

### Deviations from §4.3 / additions (none break the listed signatures)
1. `drawMat` also takes `opt.t`, which animates the target-ring dashes and the flap wave phase. `flap` and `squish` take
   signed spring values (flap −1..1, squish −0.5..1), and `unfold` accepts up to 1.25 for the overshoot.
2. `drawPennant` also takes `opt.dir` (−1 = the tip points left, for a pole on the right in portrait) and `opt.alpha`.
3. `drawPad` takes `opt.hose {x, y}` (where the hose ends; use `pumpHose(pump.x, pump.y)`). §4.3 gives no pump position to
   `drawPad`. Without it, the hose curls off to the right.
4. `drawThing` keeps the old `count` / `rot` / `shadow` / `direct` options. `opt.numeral` works as well as `thing.numeral`.
5. The removed river-only functions are `drawStone`, `drawRipple`, `drawFruit`, `drawLilyPad` and `drawSnowflake`, together
   with `FRUITS`. `drawIcon` no longer has a `{kind:'fruit'}` choice.
6. `lineOf` (answer-colour outlines) is now checked for ≥ 3:1 contrast against the oatmeal mat `#EFE2C6`.

## Design notes
- **Mug**: the whole cylinder is the answer colour, with white enamel speckles, a steel rim, cocoa inside, a thick
  coloured D-handle and a curl of steam.
- **Lantern**: the colour is in the big dome hood, the big rounded fuel base and the two guard bars. The glass is pale cream
  with a tiny soft flame, so it never reads as yellow or orange.
- **Pinecones**: `#8A5E3B` with lighter scale arcs, a carved shadow and a tiny stem. Each is about 1.7·rs wide and 2·rs
  tall, inside the old dot circle, so the old separation still holds: gap ≥ 0.6·rs, in reading order, inside the sign.
  The pinecones contrast ≥ 4.5:1 with the sign.
- **Pennants**: a colour thing gives a pennant of that colour with a light silhouette of the thing. The mug icon has a real
  handle loop and the ball icon has seams, so the ball never looks like the circle shape. Other things get a cream pennant:
  pinecone signs show their numeral + a small pinecone, tiles show their text, and animals show their picture. Each
  pennant has a hem sleeve and grommets, and its free edges wave with `flutter`/`t`.
- **Caching**:
  - Things are cached per thing + device-px bucket (×1.1 steps).
  - Mat faces are cached per (variant 0..3, device-px bucket); a sheet run built 23 mat bitmaps and reused them 202 times.
  - Bitmaps are drawn on `document` canvases, or on an `OffscreenCanvas` when there is no document.
  - Without either (node), everything is drawn as vectors.

## Improvement rounds (looked at every sheet with Read)
1. **Round 1**:
   - The mat weave was too busy and the sand ring didn't show. I made the stitches quieter and gave the band crisp edges,
     so it now reads as a ring at phone size.
   - The flap strips stepped at the mat's edge, so I went from 16 to 32 strips.
   - I made the pinecones wider and fuller.
   - On the pennants the mug was a blob, so it now has a real handle loop.
   - The pump was too small for the main gesture, so I scaled it ×1.35. Its count lights were hidden behind the barrel, so
     I widened the base plate, moved the lights to the left and moved the hose port to the right.
2. **Round 2**:
   - The unfold roll looked like a standing scroll. I shortened it in perspective, raised the back end less and added a
     khaki tie strap, so the strip now reads as "a rolled mat unrolls".
   - The numeral signs' pinecones are bigger (1 cone rs 12; cap 9.4).
   - The ball pennant got seams.
3. Checked the in-game size (S 170, itemH 105) and the iPhone scale (×0.54) in `mat_round.png`. All 7 colours read clearly
   on the mug and the lantern, and 1–12 pinecones are separate and countable.

## For the integrator
Several files still mention `stone_art` / `StoneArt`: `game/index.html` (the script tag), `render.js`, `ui.js`,
`assets.js`, `world.js`, `weather.js`, `tests/unit/run.js`, `README.md`, `CLAUDE.md` and `docs/MECHANICS.md`. They need to
switch to `mat_art.js` / `DK.MatArt`, and the test command should run `node tests/unit/mat_art.test.js`.
