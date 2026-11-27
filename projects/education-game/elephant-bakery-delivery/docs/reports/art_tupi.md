# Character artist A: Tupi, the cart, surprises and the icon

Generator: `python3 tools/art_tupi.py` writes every SVG listed below plus `game/js/tupi_points.js`. It is deterministic.
Contact sheets: `node tools/tupi_sheet.js` writes `docs/art/tupi_frames.png`, `tupi_cart.png` and `tupi_extras.png`, and prints a JSON check.
App icons: `node tools/render_icons.js` (re-run after the generator).
`game/js/nim_points.js` was deleted.

## What I drew (100 % original vector art)
- **Tupi** (`characters/tupi_*.svg`, 0 0 300 300). She is a round baby elephant baker in 3/4 view, facing RIGHT, with her eyes on the child. Her skin is warm grey `#B7B2B8`. She has one big round pink-lined near ear, a short tapered trunk with wrinkle ticks and a nostril, a puffy three-bump baker's hat with a band, and a cream apron bib with a caramel trim. She differs from Bim: Bim is front-facing with two flared ears, goggles and a scarf, and is a bluer grey.
  - The torso is pixel-identical in all 12 seated frames (the sheet check reports `torsoDiffPx` = 0). Only these change:
    - the face (eyes, mouth, brows, cheeks)
    - the trunk pose
    - the near arm, plus the far arm in `cheer`
    - a ±6° head tilt in `think` and `oops`
  - In most frames her near hand holds the handlebar grip, at Tupi (246, 184) = cart (296, 102).
  - Frames:
    - idle: open eyes, small smile
    - blink: shut arcs
    - talk: open mouth
    - happy: big smile, trunk curled up
    - cheer: ^^ eyes, both arms up
    - think: tilt, eyes looking up, trunk curled at her chin
    - oops: other tilt, raised brows, wavy mouth, hand up; never sad
    - honk: trunk straight up with toot lines, ^^ eyes
    - spray: trunk arcs up and forward
    - wave: arm up with motion ticks
    - giggle: hand at her mouth
    - hand: trunk stretched forward and down to hold a treat
- **tupi_title** (0 0 300 360, feet (150, 350)): Tupi standing. Her far arm waves behind her ear, her near arm holds out a plate with a strawberry-cream cupcake, and her trunk curls up happily.
- **cart_back / cart_front** (0 0 340 240, facing right, ground (170, 232), no wheels):
  - **cart_back**: a striped cream and caramel parasol on a pole over the tray, the seat back, and the tray's inner back wall.
  - **cart_front**: the wooden body (a low tray wall at the back and a higher front panel that hides Tupi's lower body), a cream bead stripe, a bread emblem (picture only), wheel arches, a copper bumper, a head lamp, and the handlebar stem with a thin copper grip and a little bell.
- **wheel** (0 0 80 80, centre (40, 40), r 38): a dark tyre, a cream rim, 5 spokes, a hub, and a cream tread dot so the spin reads even when the wheel is small.
- **mouse / mouse_wave** (0 0 140 120, feet (70, 114)): a fawn mouse peeking out of a flour sack with its paws on the rim. In the wave frame it has ^^ eyes, an open mouth and one paw up.
- **bird / bird_sing** (0 0 120 100, feet (60, 94)): a round peach bird with a tuft. In the sing frame its beak is open, its eyes are shut, its wing is up and it is lifted 6 units (a hop).
- **icon.svg** (512): a gingham tablecloth, a chocolate icing road, a gingerbread house, and Tupi in her cart (happy) with a cupcake. It is full bleed with no text. It is re-rendered to `icons/{apple-touch-icon,icon-192,icon-512}.png`.

## Anchors (`BD.TUPI_POINTS`)
```
seat [150,250]  trunkTip [274,58] (spray)  trunkHold [282,176] (hand: bottom-centre of the treat)  mouth [196,162]
box [45,4,298,255]  (union of all seated frames)
cart: ground [170,232]  seat [200,168]  wheels [[92,194,38],[262,194,38]]  tray [86,138]  box [0,-74,338,232]
```

## How to compose (render.js)
- **Tupi is drawn at the same scale as the cart** (1 unit = 1 unit). Draw her 300×300 frame at cart offset `cart.seat − seat` = **(+50, −82)**.
- Order: shadow → `cart_back` → Tupi frame → cargo (bottom-centre on `cart.tray`) → `cart_front` → 2 × `wheel`.
- Each wheel: scale it by `r / 38`, put its centre (40, 40) on `[cx, cy]`, and rotate it by `wheelRot`.
- The tray front lip covers the bottom ~8 units of the cargo.
- At cart width 180 px, the scale is 0.53. The whole group is then about 180 × 162 px, and Tupi's hat rises 74 units above the cart viewBox top (`cart.box` y0 = −74).
- Facing left: mirror the whole composed group about the ground x (the sheet shows both facings).
- Sprinkle fountain direction from `trunkTip`: up and forward, about −70°.

## Known limits
- The parasol can overlap very tall passengers (animals taller than ~90 units at cart scale). Draw passengers at about 80 cart units or less.
- In `wave` and `cheer` the near arm crosses in front of the trunk. This is deliberate and reads fine at in-game size.
- `trunkHold` sits just above the curled trunk tip. A treat wider than ~50 units goes past the cart nose (x > 340); that is fine on screen.
- The old river tools `tools/art_nim.py` and `tools/nim_sheet.js` are still in the folder. They are not mine; the integrator may delete them.
