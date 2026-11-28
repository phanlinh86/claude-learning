# Mit's Treasure Map — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.TM`**, storage prefix `tm:`. The code base is a copy of
`../elephant-city-jigsaw/` (Pom's Puzzle Town, a working, tested jigsaw game) with `PZ → TM`, `Pom → Mit`, `pigeon → crab`,
`toot → woof`, `pz: → tm:` already replaced everywhere (code, tests, tools, docs, asset file names). **§0 below overrides
everything after it.** Sections §1–§8 are Pom's spec (renamed mechanically — read "Mit" as the helper, "crab" as the walking
surprise); keep every rule there that §0 does not change (layout, drag physics, snap, near miss, wrong, hints, Talk time, hooks,
prompt protection, tests). Season index 0..3 is now the **weather mood index** (0 sunny, 1 breezy, 2 rain, 3 rainbow); the
field names `season` / `weather` stay in the code.

## 0. Changes for Mit's Treasure Map (OVERRIDES)
### 0.1 Theme, helper, moods
- **Pirate island cove.** far = the sea horizon, two small distant islands, a far pirate ship at anchor (cream sails, no flags
  with skulls), a little lighthouse; mid = rocks, a wooden pier, a beached rowboat, barrels, a rope fence, a beach hut
  (palms are separate sprites, see 0.4); ground = warm sand `#F1DDB0` (shade `#DEC28C`) with shells and footprints, the
  shallow water strip is drawn by `drawTray`, not the ground layer.
- Moods (index → name → sky top/bottom):
  0 `sunny` `#7CC8F0 → #D8F1FB`, sea `#5CC3D6`, bright sun, a few puffy clouds, sparkles on the water;
  1 `breezy` `#93CBEA → #E4F3F8`, clouds move fast, palms bend in gusts, leaf bits and sand dust fly, white caps on the sea;
  2 `rain` `#8FA3B8 → #CBD6DE`, grey-lilac rain clouds, rain streaks + splash rings, a soft dark tint, warm lantern glow at the hut;
  3 `rainbow` `#86C9EE → #FBE9D6`, the sun is back, a big soft rainbow arc over the sea, sparkles, a few last drops.
  Backgrounds stay calmer and lighter than the answer colours; never saturated answer colours in the scenery.
- **Mit** (`mit`): a round chubby puppy sitting up, fur cream `#EFD9B4` (shade `#D9BC8E`, outline `#8E6A45`), floppy brown
  ears `#9C6B45`, a brown patch over one eye (fur, NOT an eyepatch), big round eyes `#2F2A3A` with catch-lights, a tiny black-
  brown nose `#4A3428`, rosy cheeks `#F4B0A3`, a folded paper pirate hat (cream `#F6EEDC`, outline `#B9A27A`, a small brown
  anchor drawn on it), a cream/brown striped shirt collar, a brass spyglass `#C9A86A` in the title pose. Never an answer colour.
- **Crab** (walking surprise): round soft-peach crab `#F3B39A` (shade `#DD9378`, outline `#A8604A`), big eye stalks, smiles;
  it walks SIDEWAYS. `crab.svg` = claws down, `crab_flap.svg` = both claws up waving (viewBox 0 0 160 140, bottom anchor
  (80, 136), identical body).

### 0.2 Content (things) — `content.js` + `puzzle_art.js` + `i18n.js` must agree on these ids
- `TM.OBJECTS` (colours topic, `kind 'obj'`): `boat` (a sailboat), `flag` (on a pole, waving), `pail` (sand bucket with handle),
  `parasol` (beach umbrella), `hat` (a tricorn pirate hat, no skull), `shell` (a scallop shell), `kite`, `bottle` (a message
  bottle with a cork and a rolled note). Every silhouette clearly different.
- Counting age ≤ 4: **`kind 'coins'`** replaces `bunch`: `n` (1–5) separate round gold coins `#F2C14E` / dark `#B8862A` /
  light `#FFE6A0` with a star stamp, arranged 1 · 2 side by side · 3 pyramid · 4 (2+2) · 5 (dice five 2·1·2), ONE coin radius for every n
  (the n=5 scale), gaps ≥ 6 px at size 112 so the SHADOW shows n separate discs (QA fix). nameKind `coins`. Coins are not an answer colour (only the count matters).
- `TM.ANIMALS` (`kind 'animal'`): `parrot`, `turtle`, `fish`, `monkey`, `octopus`, `seagull`, `dolphin`, `starfish`
  (natural colours, white sticker border 6 px, distinct silhouettes).
- `TM.SCENES` (board pictures): colors → `cove` (sea, sand, a little island), shapes → `sails` (a ship's big sail / a
  sandcastle wall), count → `cave` (a treasure cave with an open chest), animals → `lagoon` (rocks, palm, pond), size →
  `shore` (beach with a towel), letters/lower/add/sub/oddeven → `deck` (a ship's deck with bunting), initial → `lagoon`.
  Every picture is drawn on **old parchment** (`#F3E3BF`, stains `#E3CD9C`, burnt-ish soft edges `#C9A46A`) with a faint
  dotted trail and a small brown "X" `#8E5A2C` in one corner — calm so answer colours pop.

### 0.3 World changes (`world.js`)
- **Tray = shallow water at the shore.** Resting pieces FLOAT: each resting piece bobs `y = homeY + sin(t·1.7 + φ)·4` and
  `rot = homeRot + sin(t·1.3 + φ)·0.05` (φ per piece) — include the bob in `x, y, rot` so hit tests and render agree; the
  hit radius stays 0.6 × size + 14 around the CURRENT centre.
- **Enter:** the parchment unrolls (`board.unroll` 0 → 1 over 0.7 s, render draws only the top `unroll` fraction plus a roll;
  `board.ox` slide-in may stay small) and the pieces **wash in from the right** on a wave one by one 0.15 s apart: each starts
  at x = W + size, glides to its spot with a damped overshoot (spring ω ≈ 9, ζ ≈ 0.55) while bobbing, event
  `pieceLand {id, x, y}` when it arrives (render/audio: a small splash). Event `wave {}` once at the start of the wash-in.
- Wrong piece / a piece let go off the board: it flies home in an arc and lands in the water with a splash (`pieceLand` again
  or `splash {x, y}` — emit `splash {id, x, y}` every time a piece lands back in the water).
- Pickup emits `pickup` as before; render draws 3 drips falling from a piece lifted out of the water for 0.4 s
  (`piece.drip` 1 → 0 decays in the world).
- **turn → roll up:** keep `board.turn` 0 → 1 (≈ 0.9 s) but it means the parchment ROLLS UP from the bottom to the top into a
  scroll (render), then the scroll flies to Mit (`board.scrollX/scrollY` optional) — event `boardOut {}` as before.
- **sessionDone:** add `w.chest = { y (rise from the sand 0..1), open 0..1, t }` animated during `sessionDone` (rise 0.6 s, open
  at 1.2 s, event `chestOpen {x, y}` → coins burst + confetti).
- Crab surprise = the old pigeon mechanics (walks along `groundY`, pauses, tap → `crabTap` claws wave), but it moves SIDEWAYS
  with a quick scuttle (`step` phase faster, 4 legs), facing the child (no `dir` flip of the face needed — the art is frontal).
- Bubbles surprise: rise from the water on the right (a fish peeks out: `w.fish = {x, y, a}` optional, render draws it).

### 0.4 Weather (`weather.js`) — moods `sunny | breezy | rain | rainbow`
`ambient` gains `wind` (−1..1, gusts: smooth noise, breezy ±0.8, others ±0.15), `rain` 0..1 (rain mood 1), `rainbow` 0..1
(rainbow mood 1, fades in over 3 s), `env` = the mood name (render picks `env/*_<mood>.svg`), `envFrom` for crossfades;
no `snow`. Particles: sunny `sparkle` (on the water band) + `mote`; breezy `leaf_a`/`leaf_b` (blown sideways by `wind`) + `sand`;
rain `rain` (slanted streaks, fast) + `splash` rings at the ground/water line (spawned where drops land); rainbow `sparkle` +
a few `droplet`. Party confetti and `burst(x, y, {kind: 'stars'|'sparkle'|'coins'|'splash', n})`. Cap 120.
Palms: render draws 2–3 `env/palm_<mood>.svg` sprites (0 0 260 420, base anchor (130, 416)) rotated about the base by
`wind × 0.08 rad` + a gentle idle sway; positions come from the env RECIPE.

### 0.5 Assets (paths relative to `game/assets/default/`)
- Character artist A: `characters/mit_{idle,blink,talk,happy,cheer,think,oops,wave,point,woof}.svg` (0 0 300 300, feet/seat
  anchor (150, 292), identical body; facing RIGHT 3/4 towards the board, eyes on the child; point = a front paw pointing up-
  right; wave = paw waving high; woof = happy bark, mouth wide, eyes ^^ closed, two little puff lines; cheer = both paws up,
  hat bouncing; think = head tilt, paw on chin; oops = "hmm?" never sad), `characters/mit_full_wave.svg` (title: waving,
  holding a rolled treasure map with the other paw, spyglass tucked in the belt), `crab.svg`, `crab_flap.svg`, `icon.svg`
  (Mit holding up a map piece in front of a parchment with one shadow, beach + sea full-bleed).
- Environment artist: for m ∈ sunny|breezy|rain|rainbow: `env/far_<m>.svg` (0 0 1200 720), `env/mid_<m>.svg` (0 0 1200 300),
  `env/ground_<m>.svg` (0 0 1200 260), `env/palm_<m>.svg` (0 0 260 420); `env/sun.svg`, `env/cloud_a.svg`, `env/cloud_b.svg`,
  `env/cloud_rain.svg` (0 0 300 140), `env/rainbow.svg` (0 0 1200 600, a soft semi-transparent arc, bottom-anchored); particles
  (0 0 32 32): `sparkle, mote, leaf_a, leaf_b, sand, rain, splash, droplet, star, confetti_a, confetti_b, dot, dust, coin`.
  Delete the old town files (`far/mid/ground_{spring,summer,autumn,winter}`, `petal`, `snow`, `feather`).
- Character artist B (`puzzle_art.js`): the 0.2 things; `drawBoard` = parchment + a thin rope-and-wood frame; `drawTray` =
  the shallow turquoise water strip `#8FDCE0 → #5CC3D6` with a foam edge on the sand (animated lapping with `opt.t`, per mood:
  rain = greyer, ripples); `drawChest(ctx, size, open 0..1, t)` (origin = bottom centre; wooden chest with brass bands, lid
  opens to show gold coins and a soft glow); `drawScroll(ctx, w, r)` (a rolled parchment cylinder, origin = centre) for the
  roll-up; `drawFish(ctx, size, a)` (a little friendly fish head peeking out of water for the bubbles surprise).

### 0.6 Voice (`i18n.js`)
Helper "Mit" (VI "Cún Mít" in titles, "Mít" in lines — VI spelling with the diacritic; EN "Mit"). A cheerful puppy pirate:
"Ahoy!", "Arf arf!" / "Gâu gâu!". Piece = "piece" / "mảnh ghép". Things (VI with classifiers): boat "chiếc thuyền", flag "lá cờ",
pail "cái xô", parasol "chiếc ô", hat "chiếc mũ cướp biển", shell "vỏ sò", kite "con diều", bottle "chai thư"; coins "đồng xu";
animals "con vẹt / con rùa / con cá / con khỉ / con bạch tuộc / con hải âu / con cá heo / con sao biển". Keys renamed/new:
`woof[]` ("Arf arf!" / "Gâu gâu!"), `weather.0..3` ("Sunny day!", "A breezy day — whoosh!", "Pitter-patter, rain!",
"Look, a rainbow!"), `surprise.crab`, `crab.tap`, `surprise.bubbles` ("A little fish is blowing bubbles!"), `bubble.pop`,
`enter[]` ("The map pieces are floating in!"), `rollup[]` ("Roll it up!"), `chest[]` ("We found the treasure!"),
logo lines "Mit's" / "Treasure Map", VI "Cún Mít" / "Ghép Bản Đồ Kho Báu".
Count words: "One, two, three coins!" / "Một, hai, ba đồng xu!".

### 0.7 Audio (lead): pickup "plip" + water drip, drag swish, snap click-clack + chime, count chimes (coin "ting"), splash when a
piece lands in the water, wave wash, wrong "boing", parchment unroll "frrt", roll-up "fwip", puppy "arf" (synth), crab clicks,
bubble pops, chest creak + coin jingle; ambience: waves always, gulls (sunny/rainbow), wind (breezy), rain (rain); music per
mood (ukulele / marimba sea-shanty-ish, ducked under speech).

## 1. What changes versus Bun's Dino Dig
| Bun's Dino Dig | Mit's Puzzle Town |
|---|---|
| tap a sand mound to dig | **drag a puzzle piece from the tray into its shadow** on the picture board (magnet snap + click) |
| Bun the bunny, bottom-left | **Mit** (`mit`), a baby elephant with a knitted scarf, bottom-left, watching / cheering / trumpeting |
| dinosaur valley, morning → night | **a little town street** (shops, bus stop, park corner), **spring → summer → autumn → winter** |
| finds hop onto a shelf | the **finished picture comes alive** (each piece animates), then the board turns away like a page |

## 2. Screen and layout
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
  Screen space = world space (no camera), y down. `ins` = safe-area insets in logical px. `hudKeep` boxes as in the dig game.
- `World.setViewport(W, H, ins)` computes `layout`:
  ```
  layout = { W, H, ins, portrait, tall /* H/W > 1.6 */, phone /* long/short > 1.9 */,
    groundY,          // pavement line at the bottom: H - ins.bottom - (portrait ? 26 : 14)
    bubble: {x,y,w,h},// as the dig game (landscape top-left beside the HUD, portrait below the HUD)
    hud: {x,y,w,h},
    mit: { x, y, h, w },      // FEET point and height: landscape x = ins.left + 118, y = groundY − 4, h = 230;
                              // portrait x = ins.left + 104, h = 200. Nothing the child must touch is under Mit.
    board: { x, y, w, h, r }, // the picture board (top-left corner, size, corner radius 26). Landscape: x0 = ins.left + 250,
                              // x1 = W − ins.right − 30, y = max(ins.top + 152, bubble bottom + 30), bottom = tray.y − 30
                              // (tray needs item + 96 below); w = min(x1 − x0, 1.75 h), centred in [x0, x1].
                              // Portrait: under the bubble (y = bubble bottom + 34), x = ins.left + 24, w = W − 48 − insets,
                              // h = min(0.78 w, space left after the tray).
    frame: 22,                // wooden frame thickness drawn OUTSIDE the board rect (the picture is inside)
    tray: { x, y, w, h, spots: [{x, y}] },   // the piece tray (a wooden ledge / pavement strip) under the board;
                              // landscape: x from ins.left + 250 to W − ins.right − 30, y = H − ins.bottom − item − 96;
                              // portrait: below the board, right of Mit (x0 = ins.left + 230) — use 2 rows when one row
                              // does not hold 5 spots at 1.3 × item spacing (the 2nd row may extend left above Mit's head).
                              // spots = resting CENTRES of pieces, ≥ 1.3 × item apart, the piece tops ≥ 44 px below the board
                              // bottom (+ the 30 px drop-zone pad) so a tap can never land in a shadow zone.
    item: 112,                // base piece size (the piece's longest side): ages ≤ 4: 112, 5: 104, 6+: 96; × 1.2 when tall
                              // (H/W > 1.6) or phone, as long as the board still holds the slots at 1.25 × item spacing
    slotScale                 // slot (shadow) size = item × slotScale (1.0; slots and pieces have the same size)
  }
  ```
- **Slot placement** (world, deterministic per round): `n` slot centres inside the board rect (inset by 0.6 × item from the
  edges), spread with farthest-point sampling from a jittered grid, ≥ 1.25 × item apart; the picture background is drawn first.
  Slot positions are stored normalised (`u, v` ∈ 0..1 of the board) so a rotation re-lays them.
- **Drop zone** of a slot = the piece box (size × size) around the slot centre, grown 30 px left/right/down and **90 px up**
  (kids drop high). Board zone = board rect + 30 px.
- **Piece hit test**: circle at the piece centre, r = 0.6 × size + 14; nearest centre wins; pieces in the tray only.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand (no Dumbo, Babar, Elmer, Peppa's
  George, Ellie from Ice Age, no Sesame Street / Bluey / Paw Patrol look). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox 256)
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark/light)**: red `#E84A4A/#A8282E/#F7A0A0`, blue `#3C8DE8/#1F5BA8/#A6CCF5`,
  yellow `#FFD23F/#C99A12/#FFEB9C`, green `#4CC26B/#2A8343/#A8E6B8`, orange `#FF9A2E/#C4650C/#FFCB8E`,
  purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2` (pink from age 5). `TM.PALETTE` in `content.js`.
  Below age 5 never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round.
- **Shadows (the empty slots)**: the piece's exact silhouette filled `rgba(40,36,60,0.30)` with an inner darker rim
  (`rgba(40,36,60,0.45)`, 4 px) and a soft dashed light outline `rgba(255,255,255,0.55)` (dash 10/8) — clearly "a hole the
  shape of the piece", readable on every board picture.
- **Board**: a warm wooden frame `#C98D52` (dark `#8E5A2C`, light `#E6B47E`) with rounded corners and 4 little screws; the
  picture inside is calm, light and slightly desaturated so answer colours pop (pastel sky, cream buildings, soft grass).
- **Mit**: a round chubby baby elephant, skin **warm grey `#B9BAC6`** (shade `#9C9DAC`, outline `#6F7082`), big round ears
  with soft blush inside `#F1C7C2` (pastel, NOT answer pink), a short curly trunk, big round eyes (`#2F2A3A` pupils,
  catch-light), rosy cheeks `#F4B0A3`, a tiny tuft of hair, a **cream knitted scarf `#F1E6CF` with brown stripes `#A27B55`**.
  Never wears an answer colour.
- **Town street** (calm, so answer colours pop): far = rooftops / chimneys / a clock tower / water tower / distant trees,
  mid = shopfronts with soft striped awnings (desaturated rose, sage, sand — never saturated answer colours), a bus-stop sign,
  street trees and lamp posts, ground = pavement (warm grey-beige tiles `#D9CFC0`) with a kerb and a strip of road.
  Moods (`spring | summer | autumn | winter`):
  spring: sky `#BFE3F5 → #FDEFF4`, blossom trees (soft pink-white `#F7DDE6`, not answer pink), petals drift;
  summer: sky `#79C6EF → #D3F0FB`, bright, full green trees (sage `#8DBF8A`), puffy clouds, sun high;
  autumn: sky `#F3C08E → #FCE7C8`, trees amber/ochre (muted `#D9A15A`, `#C77F4A`), leaves fall;
  winter: sky `#B9C8DC → #EDF1F6`, snow on roofs/awnings/ground, bare trees with snow, snowflakes, warm shop-window glow.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Mit, crab & icon — character artist A
| File | viewBox | Notes |
|---|---|---|
| `characters/mit_{idle,blink,talk,happy,cheer,think,oops,wave,point,woof}.svg` | 0 0 300 300 | Mit 3/4 view facing RIGHT (towards the board) but eyes on the child, **feet anchor (150, 292)**, identical body in every frame; happy = big smile; cheer = both front legs up, eyes ^^, ears flapped out; think = head tilt, trunk curled to the chin; oops = "hmm?" (never sad); talk = mouth open; wave = trunk waving high; point = trunk pointing right/up-right (towards the board); woof = trunk raised trumpeting, eyes closed happily, little music-note-free puff lines |
| `characters/mit_full_wave.svg` | 0 0 300 300 | title pose (waving the trunk, holding a big puzzle piece — neutral cream/tan — with one front leg) |
| `characters/crab.svg`, `characters/crab_flap.svg` | 0 0 160 140 | a cute round city crab (soft lilac-grey `#A9A6B8`, a gentle teal-grey neck sheen `#8FB3B0` — NOT answer green/blue, orange-free pale pink feet `#E7B6B0`), facing RIGHT, bottom anchor (80, 136); flap = wings up |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | Mit holding up a puzzle piece next to a picture board with one shadow, full-bleed spring street background |

### 4.2 Puzzle art (canvas code) — character artist B: `game/js/puzzle_art.js` → `TM.PuzzleArt`
Pure canvas drawing (Path2D, cache paths per thing+size), node-safe at load. Origins and sizes in logical px; the caller sets
the transform. **All pieces share the anchor: origin = piece CENTRE, `size` = the longest side of the piece.**
```
TM.PuzzleArt.drawPiece(ctx, thing, size, opt)
  // thing = { kind, obj?, color?, shape?, n?, animal?, text?, big? }
  // opt = { glow 0..1 (soft gold halo), lift 0..1 (drop shadow below, for a held piece), dim 0..1, count -1|0..n (balloons /
  //         dots lit up so far while counting aloud: the first `count` items get a white ring), alive 0..1 (the piece's own
  //         "comes alive" pose: wheels spin / balloons sway / animal blinks & smiles), season 0..3 }
  //  kind 'obj'   : a town thing in thing.color (base/dark/light): obj ∈ TM.OBJECTS = car, bus, balloon, kite, umbrella,
  //                 house, flower, hat — each with a clearly different silhouette (the silhouette alone must say what it is);
  //                 non-answer details in neutral cream/grey/brown (windows, wheels, string, stem)
  //  kind 'shape' : a chunky shape tile in thing.shape (TM.SHAPES = circle, square, triangle, star, heart, rect, diamond,
  //                 oval) filled thing.color with a bevel and a tiny shine; the silhouette IS the shape; rect 1.5:1 wide,
  //                 oval 1:1.35 tall
  //  kind 'bunch' : a bunch of thing.n balloons (1–5), tied together with strings to one knot at the bottom, balloons in
  //                 mixed palette colours (cosmetic, fixed order red, yellow, blue, green, orange); the silhouette shows
  //                 n distinct round balloons (countable from the shadow alone)
  //  kind 'dots'  : a rounded cream tile `#FFF6E6` (outline `#B89B72`) with thing.n (1–12) red dots in a tidy ten-frame-ish
  //                 grid (rows of 5, max 3 rows); the tile width follows the columns (so silhouettes differ a little)
  //  kind 'animal': a cute sticker of thing.animal (TM.ANIMALS = duck, cat, dog, cow, pig, frog, lion, rabbit), standing or
  //                 sitting, a white sticker border 6 px, own natural colours (not answers), distinct silhouettes
  //  kind 'glyph' : a chunky 3D letter / number thing.text (1–2 chars), cream-white face `#FFF8EC` with a coloured side
  //                 (thing.color or `#8FA6C9`) and outline; drawn from a font path: ctx.font = '900 …px ui-rounded, "Arial
  //                 Rounded MT Bold", Nunito, "Arial Black", system-ui' (shadow uses the same drawing → identical outline)
  //  thing.big true/false (age 3 "big & small"): the caller already passes the size; nothing extra to draw
TM.PuzzleArt.drawShadow(ctx, thing, size, opt)  // the empty slot: the same silhouette as drawPiece, style in §3.
                                                 // opt = { glow 0..1 (pulsing gold rim for hints / near-miss), alpha }
TM.PuzzleArt.pieceBox(thing, size) → { w, h }   // the visible bounding box (≤ size × size) for hit tests / zones
TM.PuzzleArt.drawBoard(ctx, board, scene, season, opt)  // origin = the board's top-left; board = {w, h, r}; draws the wooden
  //   frame OUTSIDE (thickness layout.frame) and the picture inside (clipped to the rounded rect). scene ∈ 'street' | 'shapes'
  //   | 'balloons' | 'park' | 'letters' | 'size' : a calm background picture for that topic (street: houses + road; shapes: a
  //   shape-town wall; balloons: a fair with a balloon stand; park: grass, pond, trees; letters: a classroom-ish wall with
  //   bunting; size: a toy shop shelf); season 0..3 changes the picture's sky / tree colours / snow; opt = { shine 0..1 (a white
  //   diagonal shine sweep across the picture, position = shine), alive 0..1 (background life: clouds drift, a little flag
  //   waves), t (seconds, for idle motion) }
TM.PuzzleArt.drawTray(ctx, tray, season, opt)   // the wooden ledge / pavement strip the pieces rest on (box = layout.tray)
TM.PuzzleArt.drawBubble(ctx, r, opt)            // a soap bubble (surprise): rainbow-sheen ring + highlight; opt { pop 0..1 }
TM.PuzzleArt.drawIcon(ctx, thing, size)         // Talk time / previews, origin = CENTRE: any piece thing (drawn with drawPiece),
  //   plus 'number' {n} (a big rounded numeral), 'color' {color} (a paint-blob), 'size' {big, obj}
TM.PuzzleArt.drawGhostHand(ctx, size, press)    // friendly pointing hand (hint), origin = fingertip, press 0..1
```
Contact sheets (`tools/puzzle_sheet.js` → `docs/art/puzzle_*.png`): every kind × colour/shape/animal/n/glyph at in-game size
(112) and 3×, the matching shadow next to each piece, every board scene × 4 seasons with 3 shadows and 1 placed piece.
Plus `tests/unit/puzzle_art.test.js` (node, with a mock 2D context: every kind draws without throwing, pieceBox ≤ size).

### 4.3 Environment — environment artist
For `m ∈ spring|summer|autumn|winter`:
- `env/far_<m>.svg` (0 0 1200 720): distant town rooftops, chimneys, a clock tower, a water tower, far trees; bottom-anchored,
  horizontally tileable (seam at 0/1200), transparent top (the render paints the sky gradient). Sky colours in a comment
  `<!-- sky #top #bottom -->`.
- `env/mid_<m>.svg` (0 0 1200 300): shopfronts with awnings (muted), a bus-stop sign, street trees (per season), lamp posts,
  a bench; bottom-anchored, tileable.
- `env/ground_<m>.svg` (0 0 1200 260): pavement tiles + kerb + a strip of road (winter: snow edges); tileable; the top 40 px is
  the pavement edge where the mid layer stands.
- `env/sun.svg` (0 0 200 200), `env/cloud_a.svg`, `env/cloud_b.svg` (0 0 300 140).
- Particles (0 0 32 32): `petal` (blossom petal, soft pink-white), `leaf_a`, `leaf_b` (autumn leaves, amber/ochre), `snow`
  (snowflake), `mote` (light mote), `sparkle`, `star` (twinkle), `confetti_a`, `confetti_b`, `dot` (white, tinted by code),
  `feather` (tiny grey, for the crab), `dust` (soft round puff). The existing `sand`/`firefly` files are removed.
- `tools/env_scenes.js` recipe + composed scenes at 1556×720, 960×720, 720×1556 per mood + seam test into `docs/art/`
  (sky gradient → sun → clouds → far → mid → ground). Export `RECIPE` (layer heights in logical px for H=720 landscape and
  portrait scaling, sky colours, sun positions, the tall-portrait background ×1.36 rule) so the renderer copies them.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `puzzle_art.js` (+ `tools/puzzle_sheet.js`, `tests/unit/puzzle_art.test.js`) | character artist B |
| `characters/*`, `icon.svg` (+ `tools/art_mit.py` or `.js`, `tools/mit_sheet.js`) | character artist A |
| `env/*`, `particles/*` (+ `tools/art_env.js`, `tools/env_scenes.js`) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, `tests/e2e/smoke.js` | lead |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, puzzle_art, render, ui, main.

### 5.1 Content (`content.js` → `TM.Content`)
```
TM.PALETTE, TM.COLORS ['red','blue','yellow','green','orange','purple','pink'], TM.SHAPES, TM.ANIMALS, TM.OBJECTS,
TM.AGE_TOPICS = { 3:['colors','shapes','size','animals'], 4:['colors','shapes','count','animals'],
  5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
TM.SCENES = { colors:'street', shapes:'shapes', size:'size', count:'balloons', animals:'park', letters:'letters',
  lower:'letters', initial:'park', add:'letters', sub:'letters', oddeven:'letters' }
TM.Content.makeRound(topic, { age, lang, rng, roundIndex, level, surprise, short }) → round   // pure, deterministic, self-checks
TM.Content.makeTalk(topic, { age, lang, rng }) → talk   // { promptKey, params, show: thing | null, choices:[{id, thing}], answer }
TM.Content.topicsFor(age, rng, lastTopics)
TM.Content.validate(round) → null | reason
round = { topic, scene, age, lang, roundIndex, surprise: null|'crab'|'bubbles',
  pieces: [ { id, thing: { kind, obj?, color?, shape?, n?, animal?, text?, big?, nameKind, nameValue }, slot: slotId | null } ],
  slots:  [ { id, piece: pieceId } ],         // one slot per real piece; distractors have slot null
  steps:  [ { mode: 'find' | 'findAll', targets: [pieceId] /* find: exactly one */, need, promptKey, params, nameKind, nameValue } ] }
```
- Every step asks for one still-unplaced piece; at each step exactly ONE unplaced tray piece matches the ask (distractors
  never match). Steps order = random. A round is done when every slot is filled.
- Slots per round: warm-up (round 0) = 2, one distractor never in the warm-up. Age 3: 2 slots (+1 distractor from round 2);
  age 4: round 0: 2, later 3 slots + 1 distractor (level 0 = the first chapter: 3 slots, no distractor); age 5: 3–4 + 1;
  age 6+: 4 + 1. `short` rounds (chapter running long) use 2 slots. Content varies every round; never the same set twice.
- `colors`: `obj` pieces, each a DIFFERENT object in a different colour (age 3: 2 colours, 4: 3, 5+: 4); the distractor is
  another object in a colour not used. Prompt `p.colors {color}` ("Find the RED piece!"); pickup / placed name = "the red car".
- `shapes` age 3–4: shape tiles, all one random colour (age 3: circle/square/triangle/star/heart; 4: + oval, rect, diamond but
  never square+rect, circle+oval, square+diamond in one round). Age 5 (`p.shapes5 {shape, color}`): 4 tiles mixing shapes and
  colours so the answer needs both.
- `size` (age 3): two pieces of the same object and colour, big (size × 1.25) and small (× 0.72): two shadows. `p.size {size, obj}`.
- `count`: age ≤ 4 `bunch` pieces n ∈ 1–5, all different n; warm-up 1 vs 2, then up to 3–5; `p.count {n}`; the placed
  piece is counted aloud. Age 5+ `dots` tiles n 1–10 (6: up to 12), distinct n, no two neighbours (n, n±1) at age 5 in one round.
- `animals`: `animal` pieces, 2 / 3 / 4 different animals (age 3 / 4 / 5+). `p.animals {animal}` ("Where is the DOG?").
- `letters` (age 5: capital glyphs, 3–4 distinct, `p.letters {letter}`), `lower` (small-letter glyphs, prompt shows the capital;
  drop `l`/`I`, no b/d/p/q together), `initial` (animal pieces with distinct initials in that language), `add` / `sub` (number
  glyphs; target a + b / a − b; prompt shows "2 + 3"), `oddeven` (`findAll`: "Put in all the ODD numbers!", need 2–3;
  in that round the slots are the odd numbers' shadows, even numbers are distractors; a wrong-parity drop = a mistake).

### 5.2 `TM.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s; `_p*` previous values + `alpha` for interpolation)
Public API as the dig game: `setViewport(W,H,ins), setAge, setLang, newSession({lastTopics}), levels, startLevel(i), update(dt),
drainEvents(), pointerDown/Move/Up(x,y), cancelDrag(), hint(), talkAnswer(id), prompt(), resetNudges(), skipTalk(), layout,
hudKeep, state, phase, level, topic, round, cur, step, stepInfo, roundsPerLevel, stars, levelStars, roundStars, misses, talk,
alpha, stateTime, phaseTime, interactive, weather (= level % 4), pieces, slots, board, mit, crab, bubbles, hintHand, pictures`.
States `intro | round | roundDone | talk | levelDone | sessionDone`. Phases in a round: `'enter' | 'play' | 'alive' | 'turn'`.
- **enter** (≈ 1.1 s): the board slides in from the right (`board.ox` offset, spring, slight overshoot, `board.tilt`), event
  `boardIn {x, y}`; the pieces drop into the tray one by one 0.12 s apart from above the tray (ballistic, bounce on the tray,
  landing squash, rest tilt ±8°), event `pieceLand {id, x, y}` each. Then `ask {promptKey, params, mode, step, first}` → `play`.
- **play** — one active pointer:
  - `pointerDown` on a tray piece (hit circle) → `grab`: the piece lifts (`lift` 0 → 1, scale 1.12), event `pickup {id, thing,
    x, y}`. It follows the finger with a critically-damped-ish spring (ω ≈ 28, ζ ≈ 0.75) offset so the finger holds the piece
    where it was pressed; `rot` swings like a pendulum from the horizontal velocity (k ≈ 0.0009 rad per px/s, clamp ±0.35,
    spring back) — physical, not linear.
  - **Tap** (moved < 24 px and released within 0.35 s): the piece hops home (`hop` arc 40 px), event `tapPiece {id, thing}`
    (main says its name); never a mistake.
  - `pointerUp` (a drag): judge the RELEASE point (the piece centre, and also the finger point — either inside counts):
    - the asked piece inside its slot's drop zone → **snap**: magnet glide to the slot centre (0.16 s ease-out-back), `rot` → 0,
      landing squash (sx 1.15 / sy 0.85 → spring 1), the board jiggles 2 px, event `placed {id, slot, thing, x, y, count?: {n}}`;
      then `stepDone {step, last}`; the next step's `ask` after 0.6 s (`p.next` wording); last slot → `alive`.
    - the asked piece on the board but outside its zone → it glides back to its tray spot (0.35 s arc) and its shadow pulses
      (`slot.glow`), event `nearMiss {id, slot}` — not a mistake; `w.magnet = true` for this step: the next drop of the asked
      piece anywhere in the board zone snaps.
    - another piece (not asked, or a distractor) inside the board zone → **wrong** `{id, got:{nameKind,nameValue},
      want:{nameKind,nameValue}, streak, x, y}`: shake (damped ±10 px for 0.4 s) then a ballistic arc home with apex 120 px
      above the higher end, landing squash; counts as a miss.
    - anywhere else → glides home quietly (`home {id}`); no line.
  - Pressing empty space / the board / a placed piece → `soft {}` (a gentle pat, a tiny board jiggle); counts as a tap without
    progress (2 → hint, 6 → assist: the next grab of ANY piece swaps it for the asked one — the asked piece flies into the
    finger). Tap on Mit → `pokeMit` (main repeats the prompt).
  - After 2 misses in a step, or `hint()`: `hint {id, slot}` — the right piece glows, the ghost hand moves from the piece to its
    slot and back (`w.hintHand = {x, y, x0, y0, x1, y1, t, press, alpha, id}`); cooldown 6 s; idle nudges after 12 s, backoff
    ×1.5 up to 30 s (`idle {n}`; the 2nd idle also hints).
- **alive** (≈ 2.4 s): event `roundDone {round, stars, misses}` at its start (3/2/1 stars for 0/1/≥2 misses), `board.shine`
  0 → 1 over 0.7 s, then `board.alive` 0 → 1 and every placed piece gets its own motion (`piece.ax, piece.ay, piece.arot,
  piece.alive`): obj car/bus drive ±18 px with a bounce, balloon/kite/bunch sway and float up 10 px, umbrella/hat bob, house &
  flower & shapes pulse-bounce in a wave (0.12 s apart), animals hop twice; Mit `cheer` then `woof` (event `woof {}` at 1.2 s).
  Leftover distractors pop away (`piece.pop` 1 → 0, sparkle, event `poof {id, x, y}`).
- **turn** (≈ 0.8 s): the board turns away to the left like a page (`board.turn` 0 → 1: render scales x by cos(turn·π/2) about
  the left edge and darkens slightly; at 1 it is gone), event `boardOut {}`; the finished picture is added to `w.pictures` (for
  the session gallery: `{scene, season, pieces:[{thing, u, v}]}`). Next round (enter) or Talk time after round 4 / once the
  chapter passed 75 s with ≥ 3 rounds done.
- `w.board = { x, y, w, h, r, ox, _pox, tilt, _ptilt, jig, shine, alive, turn, _pturn, scene, season }` (x, y, w, h = layout).
- `w.slots[] = { id, piece, u, v, x, y (centre), size, filled, glow 0..1 }`.
- `w.pieces[] = { id, thing, slot, size, state 'drop'|'rest'|'held'|'snap'|'placed'|'home'|'wrong'|'gone', x, y (centre),
  rot, sx, sy, lift 0..1, glow 0..1, dim, count -1..n (lit balloons/dots while counting), ax, ay, arot, alive, pop, homeX,
  homeY, homeRot, + _px _py _prot _psx _psy _plift _pax _pay _parot }` — render order: tray pieces (resting) → placed pieces on
  the board → the held / flying piece LAST (on top of everything but the HUD).
- `w.mit = { mood idle|talk|happy|cheer|think|oops|wave|point|woof, moodT, blink, look (−1..1 eyes to the held piece), hop 0..1 }`.
- Surprises (one round per chapter, rotating, never in the warm-up): **crab** — 3–8 s after the ask a crab walks in along the
  pavement line (bottom, not over the tray spots' hit circles: y = groundY, walking between Mit and the right edge;
  `w.crab = {x, y, dir, step 0..1 (waddle phase), flap 0..1, state 'walk'|'flap'|'fly', t}`, event `crab`), stays ≈ 6 s;
  tap → `crabTap` (flaps up and lands again, feathers; no score); **bubbles** — 4–6 soap bubbles rise slowly from the right
  edge, wobbling (`w.bubbles[] = {x, y, r, wob, pop 0..1, state}`, event `bubbles`); tap one → `bubblePop {x, y}`. A tray piece
  under the finger always wins over a surprise; bubbles never pass over the tray spots' hit circles at rest heights (they rise
  in the band right of the board when there is room, else above the board).
- Events also: `level {level, topic, weather}`, `round {round, surprise}`, `talk`, `talkAsk {n}`, `talkResult`, `levelDone`,
  `sessionDone {stars, pictures}`. Every positional event carries `x, y`.
- Rotation / resize mid-round: re-layout; cancel the drag (the held piece glides home); slots re-placed from their (u, v); tray
  pieces snap to their new spots; placed pieces follow their slots.

### 5.3 `TM.Weather` — `setWeather(i, {instant})` (0 spring, 1 summer, 2 autumn, 3 winter; crossfade 2.5 s), `resize(W,H,
groundY)`, `update(dt)`, `ambient` (`skyTop, skyBottom, tint (overlay rgba), light 0..1, sunX, sunY, sunA 0..1, mood, snow 0..1`),
`clouds[]` (`{type:'cloud_a'|'cloud_b', x, y, s, alpha}`), `particles[]` (`{type, x, y, r, rot, alpha, size}`): spring petals +
motes, summer a few motes + sparkles in the sun, autumn falling leaves (tumbling, swaying), winter snowflakes (gentle, slow).
`addDust(x, y, n)` / `burst(x, y, {kind: 'stars'|'feathers'|'sparkle', n})`, `setParty(on)` (confetti). Cap 120.

### 5.4 `TM.Bot` — drags through `world.pointerDown/Move/Up`: picks the asked piece with p = skill (else a random other tray
piece), moves along a slightly curved path in 8–14 steps over 0.4–0.9 s to the slot (with a ±30 px aim error, sometimes "high"),
releases; human-ish delays (0.8–2.2 s) after `ask`; sometimes taps a piece first; answers Talk right with p = skill; taps
crab / bubbles sometimes.

### 5.5 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved); `window.TM.debug = { world, weather, mode, stats, getState(), setSpeed(n), startGame(), goTitle(), setBot(on,
skill), setAutoRestart(on), gotoLevel(i), voiceLog, pieceScreen(id) → {x,y,r} CSS px, slotScreen(id) → {x,y} CSS px (the slot
centre), mitScreen(), crabScreen(), bubbleScreen(), answer() → {piece, slot} (what to drag next), toScreen(x,y), audio() }`.
World supplies `pieceHit(id)` {x,y,r}, `slotDrop(id)` (a logical point inside the slot's drop zone), `mitHit()` (box),
`crabHit()`, `bubbleHit()` (circles or null), `answer()`.

## 6. Voice, language — as the dig game §6 with helper **Mit** (EN "Mit", VI "Voi Mit" in titles, "Mit" in lines), a
cheerful baby elephant: pitch ≈ 1.2, rate ≈ 0.9. Piece = "piece" / "mảnh ghép". Things (VI with classifiers): car "chiếc ô tô",
bus "chiếc xe buýt", balloon "quả bóng bay", kite "con diều", umbrella "chiếc ô", house "ngôi nhà", flower "bông hoa", hat
"chiếc mũ"; animals "con vịt / con mèo / con chó / con bò / con heo / con ếch / con sư tử / con thỏ"; balloons "quả bóng";
dots "chấm"; shapes "hình tròn, hình vuông, hình tam giác, ngôi sao, trái tim, hình chữ nhật, hình thoi, hình bầu dục".
`I18N` API used by main (all `(lang, e)` → string, e = the event + `{topic, params, thing}`):
- `ask(lang, promptKey, params, {next})` — prompts (3 wordings each): `p.colors` "Find the {color} piece!" / "Bé ơi, tìm mảnh
  ghép màu {color} nhé!", `p.shapes` "Find the {shape}!", `p.shapes5` "Find the {color} {shape}!", `p.size` "Find the BIG car!",
  `p.count` "Find the piece with {n} balloons!" (dots: "with {n} dots"), `p.animals` "Where is the {animal}?", `p.letters`,
  `p.lower`, `p.initial`, `p.add`, `p.sub`, `p.oddeven`; `next` → "Now…" / "Giờ thì…".
- `sayPickup(lang, e)` — the piece's name ("The red car!", "The triangle!", "Three balloons!", "The dog!", "B!").
- `sayPlaced(lang, e)` — the fit line ("Click! The red car fits!"); `sayCount(lang, i)` count words, `sayCountRun(lang, n,
  kind)` ("One, two, three balloons!" / "Một, hai, ba quả bóng!").
- `sayWrong(lang, e)` — names what was dropped, then the goal ("That's the blue kite. Let's find the red one!"), never negative.
- `talkWrong(lang, answer)` as before.
- Keys: `nearMiss[]` ("It goes here — look at the shadow!"), `hint[]`, `idle[]`, `praise[]`, `great[]` with `{child}`, `alive[]`
  ("The picture is done — look, it moves!"), `woof[]` ("Toot woof!"), `talk.*`, `weather.0..3` ("Spring flowers!", "Sunny
  summer!", "Autumn leaves!", "Snowy winter!"), `surprise.crab`, `crab.tap`, `surprise.bubbles`, `bubble.pop`, `enter[]`
  ("A new picture!"), `topic.*`, `session.done`, `party`, `ui.*` incl. `ui.volume`, logo lines "Mit's" / "Puzzle Town",
  VI "Voi Mit" / "Ghép Hình".

## 7. Integration (lead) — title (Mit waving with a puzzle piece beside a small board, ▶ Play, star total, language toggle,
hold-⚙), settings with volume, HUD, bubble, pause with −/+, chapter banner, Talk time, session done (the finished pictures
parade, confetti). Audio: pickup "plip" (pitch per piece), drag swish (soft, rate-limited), snap "click-clack" + sparkle chime,
count chimes, near-miss "hm" tone, wrong "boing", home "whoosh", board slide-in "swoosh", page turn "fwip", trumpet woof
(synth brass), crab coo + flutter, bubble pops, ambient city (birds spring/summer, wind autumn, soft bells winter), music per
season (marimba / ukulele-ish, ducked under speech).

## 8. Performance — ≤ 6 pieces, Path2D cached per thing+size, ≤ 120 particles; adaptive quality as before.
