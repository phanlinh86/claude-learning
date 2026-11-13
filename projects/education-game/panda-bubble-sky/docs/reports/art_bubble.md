# Bubble art (character artist B) — `game/js/bubble_art.js` → `PB.BubbleArt`

Files: `game/js/bubble_art.js`, `tools/bubble_sheet.js` (→ `docs/art/bubble_*.png`), `tests/unit/bubble_art.test.js`
(`node tests/unit/bubble_art.test.js` → 11 015 checks, 0 failed). Node-safe at load; vector fallback without `document`.

## API (DESIGN §4.3, plus a few additions)
- `drawBubble(ctx, r, opt)` — origin = bubble centre. `opt = { wob, wobA, t, glow, frost, alpha, grow, pop, part }`.
  - **New `part: 'back' | 'front'`**. Draw as **back film → thing → front shine** so the highlight sits over the thing (glass
    look). Without `part` both are drawn and the highlight ends up under the thing.
  - `wob` stretches along `wobA` and keeps the area the same (×(1+wob), ×1/(1+wob)). `grow < 1` flattens the film and makes
    the rim stronger. `t` turns the rainbow rim slowly (shimmer). `glow` adds a gold halo (back) and a pulsing gold rim (front).
    `frost` adds rime and sparkles, baked into 8 levels.
  - `pop > 0` draws only the rupture: a flash, about 0.12 s of the film tearing, then 12 short rainbow/white arcs that grow
    and fade. Pass the same opt to both parts (the front part does nothing while popping). Don't draw the thing while
    popping (it's been freed).
- `drawThing(ctx, thing, size, opt)` — origin = the centre. **Recommended `size = 1.2·r`** inside a bubble (all sheets use this).
  `opt = { glow, wiggle (−1..1 → ±0.35 rad no-no wiggle), night (unused), count, maxN, direct }`.
  - **`maxN` (stars)**: pass the round's largest `n` so every bubble uses the **same star size** (otherwise fewer stars = bigger
    stars, which gives the answer away). With `maxN`, a lone star (countPop) is also drawn small; leave it out for countPop
    rounds to get one big star.
  - **`count` (stars)**: the first `count` stars light up (white + gold ring and a sparkle) while they're counted aloud. Hook it
    to the `count {id, i}` events on the freed thing.
  - `big:false` → ×0.6. Toys: `ball duck umbrella kite car`. Shapes: chunky cookies with a thick side. Tiles: a puffy cloud
    card with `#3A3640` glyphs ("-" becomes "−"). Animals use `PB.Assets.sprite/img('animals/<a>')`; until the image loads
    they show a soft placeholder, and the cached sprite switches over by itself once it does.
- `drawRainbow(ctx, rb, k, filled, opt)` — `opt = { shine, alpha, guide }`. Pieces follow the angle from the left foot. The
  painted part has a white rim and faint seams between pieces. The leading edge gets a glow, a white line and a sparkle (strong
  while `filled` is part-way through a piece, softer when it sits on a piece boundary). The unpainted part is a faint fill with
  dotted edges and dotted piece separators.
  - **New `rainbowPoint(rb, k, f)` → `{x, y, a}`** = middle of the band at fill `f`. Use it as the target for the freed thing's
    flight (piece i → `rainbowPoint(rb, k, i)`).
- `drawDrop(ctx,x,y,r,a)`, `drawMiniBubble(ctx,x,y,r,a)`, `drawSnowflake(ctx, r, rot, a)` (centred at the current origin —
  translate first), `drawHomeBadge(ctx, home, r, {a, pop})`, `drawIcon(ctx, choice, size)` (things, `color`, `number`
  (numeral + small gold stars), `home`, `size`, `letter`), `drawHintHand(ctx, x, y, press, alpha, size=96)` (fingertip at
  x,y; Bao's cream bandana cuff).
- Extras: `starLayout(n, maxN)`, `thingKey`, `pal`, `PALETTE`, `STAR`, `RAINBOW`, `IRIS`, `TOYS`, `SHAPES`, `HOMES`, `KINDS`,
  `SMALL`, `clearCache()`, `stats` (cache hits and builds).
- Colours come from `PB.PALETTE` when it's valid (3 hex values), otherwise from the DESIGN §3 copy.

## Performance
- Things are turned into bitmaps once per thing and per device-pixel size step (size buckets 1.1× apart, 16–900 px). The
  bitmap includes a white sticker edge, so the thing stays readable through the film on every sky. Drawing a thing each frame
  is then 1 `drawImage` (+ halo when glowing, + count overlay).
- The bubble film (inside + rainbow rim) and the shine (highlights + bottom reflection, with frost baked in) are cached per
  device-radius step: **2 `drawImage` per bubble**. The size step comes from `ctx.getTransform()`, so set the DPR transform
  before drawing. Wobble and rotation are applied as transforms, so they cost nothing extra.
- The cache clears itself above 220 entries. Freed things shrinking to 0.35 reuse the nearest larger step.
- Headless Chromium (software rendering, 2400×1080, DPR 2): 9 bubbles + things + rainbow ≈ 15 ms/frame. This is slow because
  it's software filling, so on iPhone/iPad (GPU) it should be well under that. The first frame builds the cache (≈ 40 ms with
  5 things). **Tip:** draw each bubble once off-screen during the `blow` phase (or call `drawThing` on a 1×1 scratch canvas
  per bubble when the round starts) so the cache building is not felt on the first tap.
- The rainbow is drawn as vectors each frame (7 arcs + a few strokes). It's cheap, but you could cache it while `filled` and
  `shine` don't change.

## For render.js (integrator)
1. Per bubble: `translate(x, y)`, then `drawBubble(ctx, r, {...b, part:'back'})`, then `rotate(b.rot)` + `drawThing(ctx,
   thing, 1.2*r, {glow, wiggle, maxN, count})`, then `drawBubble(ctx, r, {...b, part:'front'})`. Don't apply the bubble's
   wobble to the thing.
2. Growing bubbles on the wand: pass `grow`. Popping: `pop = popT` (back part only), no thing.
3. Freed thing in flight: `drawThing` at a shrinking size (to 0.35×), no bubble. Its target is
   `rainbowPoint(rb, k, i)`; it's counted with `opt.count`.
4. Stars: compute `maxN = max(n)` of the round's bubbles once and pass it to every star bubble (countSel). For countPop
   (all bubbles hold `stars n=1`) leave `maxN` out.
5. Winter: `frost` 0..1 follows the weather crossfade (8 steps).
6. Talk-time choice cards: `drawIcon(ctx, choice, size)` centred in the card.

## Review rounds (sheets in `docs/art/`)
- Round 1: the highlight looked like a blade and was too wide → made it a thinner crescent hugging the rim, with a small dot at
  its end. The red ball's stripe read as pink → stripe is now a 55 % mix of base and light. Dice-5 stars touched → wider
  spacing. Pop arcs were invisible on pale skies by p = 0.5 → thicker arcs with a cool under-stroke and a slower fade.
  Rainbow looked washed out → stronger bands, lighter white veils, softer multi-wedge shine. Kite was too small → bigger.
  Number icon dots were too small → bigger.
- Round 2: the frost dashed ring looked mechanical → a soft ring plus frost grains and sparkles. Frost was costly as vectors
  (5 ms) → baked into the shine sprite. Things were made bigger in the bubble (1.12·r → 1.2·r). The cream backing behind the
  stars now fades out at its edge.
- Star layouts are checked in the test: real star outlines never touch, every star stays inside the box, and stars are
  rs ≥ 8 units for every n from 1–12, with and without `maxN`.
- CVD: shapes keep clearly different outlines. Toys never mix colours (stripe, panels and wing are tints of the same colour;
  wheels, beak, handle and tail are neutral), so the answer colour is the only colour on the thing.

Research (reference only, all art original): cartoon soap-bubble tutorials (artincontext.org, easydrawingguides.com) and
how thin-film colours work (exploratorium.edu bubble colours, explainthatstuff.com): almost no colour in the middle, pastel
interference bands at the rim, one big window highlight plus a small one opposite.

## Fix round (visual QA, docs/reports/qa_visual.md)
- **Counting stars bigger:** the stars now use more of the box (usable radius 45 → 49 units, row spacing 2.25·rs). `maxN` now
  evens out sizes only when n > 6; n ≤ 6 always uses its own bigger stars. The integrator draws kind 'stars' at **1.55·r**.
  At r = 45 px, n = 12 gives stars 14.4 px across with gaps ≥ 3 px (the unit test checks both). n = 9 → 15.7 px,
  n = 5 → 19.5 px, n = 2 → 30.7 px.
- **The highlight crescent is now slimmer** (it only covers 0.77–0.87·R), so it no longer covers the top-left star at 1.55·r.
- **The rainbow guide is easier to see:** lilac dots `rgba(142,134,200,.55)`, size max(3, w·0.1), and a faint band fill
  `rgba(185,178,238,.16)`.
- **Darker outlines:** yellow outline `#9A6F00`, orange outline `#A85A00` (≥ 3:1 contrast on all season skies).
- **Bigger tile glyphs:** texts of 4 or more characters now get glyph height 28 (was 24) and width up to 88, so "14+6" reads.
