# Stone & thing art — `game/js/stone_art.js` → `NH.StoneArt` (character artist B)

Replaces `bubble_art.js` (deleted, with `tests/unit/bubble_art.test.js` and `tools/bubble_sheet.js`).
Test: `node tests/unit/stone_art.test.js` (11 446 checks, mock 2D context, with and without Path2D).
Contact sheets: `node tools/stone_sheet.js [things things_3x states icons round]` → `docs/art/stone_*.png`.

## API (DESIGN §4.3, plus a few extras)
| Call | Origin / notes |
|---|---|
| `drawStone(ctx, S, opt)` | **origin = centre of the top face** (where things / Nim stand). Top face ≈ S × 0.36·S, waterline plane 0.22·S below the origin (`dip` 1 raises it by 0.10·S). The body continues under the water to 0.34·S and is drawn at 0.36 alpha (seen through the water). `opt = { seed, tilt, dip, gold, glow, snow, wet, alpha, active, t }`. `tilt` rotates about the origin, so the thing drawn after it at the same origin (with the same `rotate(tilt)`) stays on the stone. `t` (optional) animates the dashes of the active ring. |
| `drawRipple(ctx, x, y, r, a, flat=0.38)` | ellipse ring in `#D9F0EC` plus a faint dark under-ring and an inner ring |
| `drawDrop(ctx, x, y, r, a)` | teardrop, tip up, centred on the round part |
| `drawThing(ctx, thing, size, opt)` | **origin = bottom-centre**; size = box height (itemH). `opt = { glow, wiggle −1..1 (→ ±0.3 rad about the base), rot (rad, extra), alpha, count (dots: rings the first `count` dots), shadow (default on: a contact shadow on the stone), direct }`. `big:false` → ×0.6 |
| `drawFruit(ctx, kind, size, opt)` | centre origin; `opt { rot, alpha, glow }` |
| `drawHomeBadge`, `drawSnowflake`, `drawHintHand` | as in the bubble game. The badge rim is wood brown and the hint-hand cuff is Nim's mustard scarf. |
| `drawIcon(ctx, choice, size)` | centred: any thing, `color`, `number` (numeral + dark dots), `home`, `size {big, thing?}`, `letter`, `fruit {fruit}` |
| `drawLilyPad(ctx, r, rot, opt)` | centred, perspective `opt.flat` (0.45), `#7FA86A` with an outline of `#557A47` |
| `dotLayout(n, numeral)` | dot centres in the 100-unit box, **origin = foot**, so multiply by size/100 to place count FX; reading order = counting order |
| `thingTop(thing, size)` | px above the origin where the thing's top is (place badges / count numbers above it) |
| `variant(seed)`, `pal`, `lineOf`, `contrast`, constants | helpers |

Render recipe per stone: `translate(x, y)` → `drawStone(ctx, S, {...})` → `rotate(tilt)` → `translate(0, -thingHop)` →
`drawThing(ctx, thing, itemH, {glow, wiggle, alpha})`.

## Design
- **Stones:** 8 seeded shape variants (`seed` integer → `seed % 8`; a float seed is hashed). Warm grey top `#B9B2A6`,
  side `#8E877C` darkening towards the water, outline `#6C665D`, highlight `#D8D2C7` upper-left, a light shoulder under
  the front edge, specks. At the waterline there is a darker wet band (taller with `wet`) and a light rim. Golden =
  `#F4D27A` / `#C9A043`, drawn as an overlay at `gold` alpha, with a halo and sparkles. `glow` = a warm 3-layer outline
  above the water. `active` = a dashed white ring on the water. `snow` = a soft cap with a scalloped rim (4 levels).
- **Things** (100-unit box, outline 3.4 units ≈ 3.2 px at itemH 93, which matches the stone's 2.7 units at S 150 ≈ 4 px):
  - flower: 5 petals, a brown centre and a sage stem.
  - mushroom: a coloured cap with white dots and a cream stem.
  - leaf: pointed, with light veins.
  - ball: has a stripe.
  - rubber duck.
  - shapes: chunky cookies with a 6-unit side.
  - dots: a cream wooden disc on a post. With a numeral it becomes a tall tablet with the numeral on top. Dots are
    `#3A3640`, with a dice pattern for 3 and 5 and rows otherwise; the gap between dots is always ≥ 0.6·r.
  - tile: a disc for 1–2 characters and a wide sign otherwise.
  - animal: the SVG with its feet (100, 194) on the origin.
- **Outline contrast on the stone top (≥ 3:1, tested):** yellow `#7A5600`, orange `#8A4600`, pink `#9A3A6A`, green
  `#1E6A34` (darker than the palette's dark tone); red / blue / purple use their palette dark. `lineOf` darkens any
  future colour until it reaches 3:1.
- Sizes on the phone (×0.54 CSS, `stone_round.png`, right column): dot diameter ≥ 10 logical px for every n without a
  numeral, and for n ≤ 8 with one.

## Caching / performance
- Paths are cached as Path2D.
- Things and fruits are rasterised once per (thing, device-px bucket ×1.1).
- Stone bodies are cached per (variant, snow level, plain|gold, device-px bucket): at most 8 × 5 × 2 bitmaps per size.
  Per frame a stone costs 2–3 `drawImage` calls through clips, plus a few strokes.
- Nothing touches the DOM at load. Without `document`, everything is drawn as vectors.

## Deviations / notes for the integrator
- Origin of `drawStone` = **centre** of the top face (DESIGN says "top-centre"; this is the point where things stand,
  so the two are the same in practice).
- Extras beyond §4.3: `opt.t` and `opt.rot`, `opt.count` / `opt.shadow`, `{kind:'fruit'}` / `{kind:'letter'}` icons,
  and the helpers `dotLayout` and `thingTop`.
- Numeral signs with 11–12 dots get 9.4 px dots (never used: countSeq numerals are ≤ 6).
- Still pointing at the old file (integrator-owned, not edited): `game/index.html` (script tag `js/bubble_art.js` →
  `js/stone_art.js`), `render.js` / `ui.js` (`NH.BubbleArt`), `assets.js` comments, `README.md` / `CLAUDE.md` test
  line (`bubble_art.test.js` → `stone_art.test.js`). The old `docs/art/bubble_*.png` sheets are also still there.
