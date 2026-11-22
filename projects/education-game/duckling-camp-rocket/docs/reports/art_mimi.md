# Character art A — Mimi, rocket, chute, surprises, icon

Generator: `python3 tools/art_mimi.py` (deterministic; also writes `game/js/mimi_points.js`).
Contact sheets: `node tools/mimi_sheet.js` → `docs/art/mimi_frames.png`, `mimi_rocket.png`, `mimi_extras.png`.
Home-screen PNGs: `node tools/render_icons.js` → `game/assets/icons/{apple-touch-icon (180), icon-192, icon-512}.png`.

## Files (`game/assets/default/`)
| File | viewBox | Anchor |
|---|---|---|
| `characters/mimi_{idle,blink,talk,happy,cheer,think,oops,pump,wave,giggle,dance,look}.svg`, `mimi_title.svg` | 0 0 300 300 | feet (150, 290) = bottom of the feet outline |
| `characters/rocket.svg` | 0 0 120 240 | nozzle bottom (60, 236), nose tip (60, 10), centre of mass (60, 150) |
| `characters/chute.svg`, `chute_closed.svg` | 0 0 240 200 | cords meet at (120, 196) = the rocket's nose |
| `characters/marmot.svg`, `marmot_wave.svg` | 0 0 160 160 | bottom-centre (80, 156) — flat bottom edge, sits in the burrow hole |
| `characters/goat.svg`, `goat_hop.svg` | 0 0 180 180 | feet (90, 174), facing LEFT (hop: legs tucked, airborne above the anchor) |
| `characters/bird.svg`, `bird_sing.svg` | 0 0 100 90 | perch feet (50, 86), facing LEFT |
| `icon.svg` | 0 0 512 512 | full bleed, opaque, no text |

Deleted: `characters/nim_*`, `fish*`, `frog*`, `game/js/nim_points.js`, `tools/art_nim.py`, `tools/nim_sheet.js`.

## Points (`game/js/mimi_points.js`, browser + node)
```
DK.MIMI_POINTS   = { feet: [150, 290], box: [40, 28, 284, 292], pumpDy: 15, pumpHatDy: 25,
                     wingTip: [115, 245], hatTop: [166, 32], head: [180, 130], bill: [282, 150] }
DK.ROCKET_POINTS = { nozzle: [60, 236], nose: [60, 10], com: [60, 150], waterTop: 150, w: 56 }
```
- `pumpDy` = how much lower the head centre is in `mimi_pump` (everything above the feet is squashed 1.06 × 0.90 about
  y 284; the feet stay put); `pumpHatDy` = the hat top's drop (25).
- `wingTip` = near wing tip at rest; `hatTop` = top of the bucket hat in the untilted frames.
- Rocket: water fills the bottle below `waterTop` (y 150); bottle width 56 (x 32–88), the fins reach x 8–112.
- Chute: drawn so that its (120, 196) sits on the rocket's `nose` point; scale both by the same factor
  (rocket 120 px tall in game → k = 0.5 → canopy ≈ 106 px wide).

## Design decisions
- **Mimi** — chibi proportions (head ≈ as big as the body), cream-white down `#FBF3DD` (never yellow), scalloped fluffy
  silhouette on the back/top, smooth underneath; tail flick; lighter belly patch; peach bill and webbed feet `#F0A982`;
  big eyes with two catch-lights; rosy cheek; khaki bucket hat with a dark band, dashed brim stitch and a small dusty-teal
  pin (an earlier cream feather read as a horn at small size — removed).
- Body identical in every frame except pump (squash) and dance (rocks −5°, lifts the near foot) — verified by the sheet
  script (body-region pixel diff vs idle = 0 for all other frames). Head + hat tilt about the neck (176, 186) in
  think (+8°), oops (−9°), giggle (+6°), dance (−6°), look (−15°, eyes up — for watching the flight), cheer/title (small).
- Bill: the upper mandible is fixed, the lower one rotates about (224, 155): talk 15°, big 24°, "o" 10°; closed bill has a
  seam smiling up at the back. Pump: determined slanted brows + grin, both wings out, effort puffs.
- Title: Mimi waves with the far wing while the bottle rocket (×0.54) is tucked under her near wing.
- **Rocket** — a clear PET bottle upside-down (nozzle neck down), water in the lower part with bubbles and a wave line,
  cream nose cone with a peach band, two khaki side fins (the third is behind the bottle in this front view — a front
  edge-on fin read as a stick, so it was dropped). Brown nozzle cap.
- **Chute** — 6 gores cream / dusty teal, scalloped rim, vent on top, cords to a small ring at (120, 196). Closed = a
  striped tied bundle with a short cord to the same point.
- **Marmot** warm tan `#C59A6A`, cream belly + muzzle, buck teeth, paws held up (wave: one paw up + motion lines).
  **Goat** white kid with tiny horns, floppy ears, beard tuft, smooth body (an early fluffy body read as a sheep).
  **Bird** lilac-grey `#B8B2CF`, peach breast, tuft; sing = open beak, happy eyes, little song squiggles (no text).
- **Icon** — sunny sky, lavender/blue-grey mountains with snow caps, pine edge, meadow; Mimi (look frame) watches the
  rocket shoot up on a water spray with the chute popping; the target mat with its dashed ring; dotted flight arc.
  Readable at 60 px.

## Review rounds (contact sheets)
1. Fixed the tail tuft (opposite winding cut a hole), lifted the body so the feet show, rest wing more backward,
   feather → pin, removed the rocket's front fin, darker water line, goat body smooth + removed a stray far ear that
   crossed the face, chute edge gores filled, icon recomposed (Mimi fully in frame, chute inside the icon).
2. Title rocket moved to the side and enlarged so it reads under the wing, feet outline ends exactly at y 290, eyes a
   touch bigger, chute rim gaps closed.

References (shape study only, nothing copied): generic "how to draw a cute duckling" guides (chibi head/body ratio),
NASA / Science Buddies water-rocket construction pages (bottle orientation, fins near the nozzle, nose cone, parachute).
