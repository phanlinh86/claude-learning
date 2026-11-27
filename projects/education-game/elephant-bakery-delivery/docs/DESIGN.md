# Tupi's Bakery Delivery — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.BD`**. Classic `<script>` files, no build step, node-safe at load
(touch the DOM lazily). The code base is a copy of `../hedgehog-river-hop/` (state machine, voice, input, storage, loud audio
with volume, ui, main, tests) with `NH → BD` and storage prefix `nh: → bd:` already replaced. **The river-crossing world is
replaced by a road-map delivery world** (mechanic family *path*, "maze ride": steer a little cart with a finger along the road
to the right answer). When a detail is missing here, do what `../hedgehog-river-hop/docs/DESIGN.md` / `MECHANICS.md` /
`VOICE.md` do (i18n / voice API style, hooks, Talk time, chapter-topic rotation, idle auto-pause, CONFIG style, hint cooldown /
idle backoff, prompt protection, phone layout tweaks, short rounds when a chapter runs long, `_p*` twins + `alpha`).
Target: iPhone + iPad Safari first, portrait and landscape. The old `docs/MECHANICS.md` / `docs/VOICE.md` in this folder are the
river game's; their owners rewrite them.

## 1. What changes versus Nim's River Hop
| Nim's River Hop | Tupi's Bakery Delivery |
|---|---|
| tap the right stone in the next row | **drag the delivery cart along an icing road** to the right gingerbread house (a tap on a house or on the road also drives there) |
| brook between two banks | **a big bakery table seen from above** = a little cookie town: Tupi's bakery (start) → a road that forks → 2–4 gingerbread houses |
| Nim the hedgehog hops | **Tupi**, a baby elephant baker (`tupi`), rides a little **bakery cart**; it rolls, leans in curves, bounces over sprinkle bumps, flips to face the way it drives |
| fruit sticks on Nim's spines | **deliver**: the door opens, a friend pops out, Tupi hands over the treat with her **trunk**; round done → Tupi trumpets and **sprays a sprinkle fountain** from her trunk, every delivered house's windows light up and its chimney puffs heart-shaped smoke |
| woodland brook seasons | **bakery window** at the back: spring → summer → autumn → winter outside (petals / sun beams / leaves / snow drift in) |

## 2. Screen and layout
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
  Screen space = world space (no camera), y down. `ins` = safe-area insets in logical px. `hudKeep` boxes as before.
- **Flow axis**: landscape → the bakery is at the LEFT, the houses in the right part, roads run left → right;
  portrait → the bakery at the BOTTOM, the houses in the upper part, roads run bottom → top. The content generator works in
  normalized flow coordinates `u` (along, 0 = bakery, 1 = houses) and `v` (across, 0..1); `World` maps them to the screen.
- `World.setViewport(W, H, ins)` computes `layout`:
  ```
  layout = { W, H, ins, portrait, tall /* H/W > 1.6 */, phone /* long/short > 1.9 */, compact,
    bubble: {x,y,w,h}, hud: {x,y,w,h},     // top band exactly as the river game (DOM bubble follows layout.bubble)
    wall: {x,y,w,h},                       // the back wall with the bakery window: the top band of the screen, from y 0 to
                                           //   wallH (landscape ≈ 0.30·H, portrait ≈ 0.20·H); the bubble/HUD sit over it
    table: {x,y,w,h},                      // the table top = everything below the wall (the play map)
    play: {x0,y0,x1,y1},                   // usable map rect: table inside insets, ≥ 12 px below the bubble/HUD band
    bakery: {x, y, w, h},                  // the start building (landscape: left, centred in play y; portrait: bottom centre)
    start: {x, y},                         // where the cart waits (road start, just outside the bakery door)
    houseS,                                // house box width (ages ≤ 4: 170, 5: 156, 6+: 146; ≥ 128 when squeezed); height = 0.95·houseS
    roadW,                                 // road width: ages ≤ 4: 78, 5+: 68 (phones ×1.05)
    cartS,                                 // cart width ≈ 1.05·houseS (Tupi + cart art box height = cartS)
    hitR,                                  // cart grab radius = 0.6·cartS + 14 (≥ 100); house hit = its box + 30 px each side
  }
  ```
- Per round the world builds **the map**: `world.houses[]` (n = 2–4, each `{id, i, x, y (door point, bottom-centre of the
  house), sign thing, target?…}`) placed in the far third of the play rect, spread evenly across, never within 44 px of the
  bubble / HUD / screen edge, ≥ houseS + 24 apart; and **roads**: a tree rooted at `start`: a trunk to a fork (age ≥ 5 maybe a
  second fork) and one branch per house, smooth curves (Catmull-Rom/Bezier through 1–2 seeded wiggle points), sampled as
  polylines every ≈ 8 px: `world.roads = { nodes[], edges: [{id, from, to, pts:[[x,y]…], len, cum:[…]}] }`, branches ≥ roadW + 40
  apart except within 120 px of a fork, no self-crossing, each branch ends at its house's door. Road length from start to any
  house ≥ 0.55 × the play diagonal (there must be some driving). Re-laid out on rotation.
- Cart hit: circle at the cart centre, r = hitR. House hit: house box + 30 px each side (+60 up). Road hit: within roadW/2 + 26
  of a road polyline. Tupi's head (on the cart) = the cart hit. Surprise hit circles. Everything else → `soft`.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand (no Babar, no Elmer, no Dumbo, no
  Peppa Pig, no Hansel & Gretel book art, no Pikachu, no game maps). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with a white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox
  256–300) in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark/light)** — `BD.PALETTE` in `content.js`, unchanged:
  red `#E84A4A/#A8282E/#F7A0A0`, blue `#3C8DE8/#1F5BA8/#A6CCF5`, yellow `#FFD23F/#C99A12/#FFEB9C`, green
  `#4CC26B/#2A8343/#A8E6B8`, orange `#FF9A2E/#C4650C/#FFCB8E`, purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2`
  (pink from age 5). Below age 5 never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round.
- **Table / map** (calm, warm, never an answer colour): a cream tablecloth `#F6ECD8` with a faint caramel gingham check
  `#EBDCC0` (season tint of the check: spring `#E3E6CF` sage-cream, summer `#F1E3B9` straw, autumn `#EBD3B8` terracotta-cream,
  winter `#DCE0E6` cool grey-cream); a few flour dusts and crumbs.
- **Roads**: a chocolate-biscuit road `#8C5E3F` (side/shade `#6E4630`, outline `#5A3826`) with cream piped icing edges
  `#FFF4E2` (dotted bead border) and a dashed icing centre line; small white & caramel sugar-bead "bumps" every ≈ 140 px. The
  road "pours out" from the bakery at the start of a round (reveal 0..1 along the tree).
- **Houses**: gingerbread walls `#C98A52` (shade `#A86C3C`, outline `#7E4E2A`), white icing trims `#FFF8EC`, a gumdrop on top.
  Roof and door are **neutral** (cream icing roof `#FFF2DC`, caramel door `#B5773F`) unless the house's sign is a colour: in the
  colour topic the roof icing AND the door are the answer colour and the sign shows a big colour blob (paint-splat sweet).
  Other topics: a big cream sign board `#F3E6CC` (outline `#9C7A5A`) over the door shows the thing (shape cookie, dots,
  numeral, letter, home badge, animal …) ≥ 0.55·houseS tall — readable from arm's length.
- **Tupi**: a small round baby elephant baker. Skin warm soft grey `#B7B2B8` (shade `#9893A0`, outline `#6B6574`), inner ears
  and cheeks `#F4B4B6`, eyes `#2E2836` with catch-light, a short curly trunk, a tiny white baker's hat `#FFFDF6` (outline
  `#BDB3A3`) and a cream apron `#F3E4C8` with a caramel trim `#C98E4E`. Never an answer colour. (Different from Bim the
  rocket elephant: rounder, hat + apron, warmer grey.)
- **Cart**: a little wooden bakery tricycle-cart: caramel wood `#D29A5F` / `#A8703C` (outline `#7A4C27`), a cream-and-caramel
  striped canopy, 2 big round wheels `#7A5A44` with cream hubs (wheels are separate sprites so they spin), a tray at the back
  where the treat / passenger rides.
- **Bakery** (start): a cosy little shop with a cream-and-caramel striped awning, a round oven window glowing warm `#FFC977`,
  a bread sign (picture only). Not an answer colour.
- **Back wall / window**: warm plaster `#F2DFC4` with shelves (jars, rolling pin, bread loaves) and one big window showing the
  season outside: spring blossoms `#F2CFD9` and pale sky `#CFE6F5`; summer sky `#8CCBEA`, sun, green hills `#8DBB82`; autumn
  sky `#F1C893`, amber trees `#D9A06A`; winter sky `#B9C8E2`, snowy roofs, falling snow. **The table and everything on it is
  never tinted by the mood** (readability).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Tupi, cart, surprises & icon — character artist A (`tools/art_tupi.py`, contact sheets `tools/tupi_sheet.js`)
| File | viewBox | Notes |
|---|---|---|
| `characters/tupi_{idle,blink,talk,happy,cheer,think,oops,honk,spray,wave,giggle,hand}.svg` | 0 0 300 300 | Tupi **seated** (she rides in the cart; her lower body is hidden by the cart front), 3/4 view facing RIGHT, eyes towards the child. **Seat anchor (150, 250)** (the bottom of her bottom = sits on the cart seat). Identical body in every frame. idle; blink = eyes shut arcs; talk = mouth open; happy = big smile; cheer = both arms up, eyes ^^; think = head tilt, trunk curled at chin; oops = "hmm?" head tilt + one hand up (never sad); **honk** = trunk raised straight up trumpeting, eyes shut happy; **spray** = trunk raised in an arc, tip pointing up-forward (the renderer emits the sprinkle fountain at `trunkTip`); wave; giggle (eyes ^^, hand at mouth); **hand** = trunk stretched forward-down holding out (the treat is drawn at `trunkHold`). |
| `characters/tupi_title.svg` | 0 0 300 360 | title pose: Tupi standing, waving, holding a cupcake on a plate; feet anchor (150, 350) |
| `characters/cart_back.svg`, `cart_front.svg` | 0 0 340 240 | the cart, facing RIGHT, drawn in two halves so Tupi sits INSIDE: back = seat back, rear tray, canopy pole + canopy; front = the front panel that covers Tupi's lower body, handlebar, front bumper. **Ground anchor (170, 232)** (where the wheels touch the table), wheels NOT drawn |
| `characters/wheel.svg` | 0 0 80 80 | a wheel, centre (40, 40) (rotated by the renderer) |
| `characters/mouse.svg`, `mouse_wave.svg` | 0 0 140 120 | a tiny mouse peeking out of a flour sack (sack included), soft fawn `#C9A887`, feet anchor (70, 114); wave = a paw up + happy squeak face |
| `characters/bird.svg`, `bird_sing.svg` | 0 0 120 100 | a round little bird on the window sill, soft peach `#F2B28A` (not an answer colour), feet anchor (60, 94); sing = beak open, eyes shut, a tiny hop pose |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | Tupi in her cart on an icing road with a gingerbread house, full bleed, no text |
Also write `game/js/tupi_points.js`: `BD.TUPI_POINTS = { seat: [150, 250], trunkTip: [x, y] /* spray frame */, trunkHold: [x, y]
/* hand frame */, mouth: [x, y], box: [x0, y0, x1, y1], cart: { ground: [170, 232], seat: [x, y] /* where Tupi's seat anchor goes
in cart coords */, wheels: [[x, y, r], [x, y, r]] /* wheel centres + radius in cart coords */, tray: [x, y] /* bottom-centre of
the cargo in the tray */, box: [x0, y0, x1, y1] } }` — exact numbers you drew (the renderer composes cart_back → Tupi → cargo →
cart_front → wheels). Delete `nim_points.js` (and keep no Nim art).

### 4.2 Animals — REUSED (`animals/<a>.svg`, `<a>_step.svg`, 0 0 200 200, feet (100, 194), facing right):
`cow pig sheep duck hen horse goat crab penguin lion monkey fishbowl`. Homes: farm (first 7), sea (crab, fishbowl), ice
(penguin), savanna (lion), jungle (monkey). They are the **friends** who come out of the houses and the **passengers** in the
animals chapter (they ride in the cart's tray).

### 4.3 House, treat & sign art (canvas code) — character artist B: `game/js/house_art.js` → `BD.HouseArt`
Start from `stone_art.js` (copy its thing / icon / badge / hint-hand / snowflake / star code; then **delete `stone_art.js`** and
`tests/unit/stone_art.test.js`). Pure canvas drawing, cached per thing+size (offscreen bitmaps), node-safe at load.
```
BD.HouseArt.drawHouse(ctx, S, opt)       // origin = the DOOR point = bottom-centre of the house. S = width (height ≈ 0.95·S).
   // opt = { seed (shape variation: roof style, window layout, gumdrop colour from a calm set), color (answer colour name → roof
   //   + door in that colour) | null, sign: thing | null (drawn on the sign board over the door, ≥ 0.55·S tall), door 0..1 (how
   //   open the door is), lit 0..1 (windows glow warm, after a delivery), glow 0..1 (hint: soft warm outline pulse), active 0..1,
   //   squash (landing squash: scaleY), snow 0..1 (icing snow on the roof), alpha }
BD.HouseArt.houseBox(S)                  // {x0, y0, x1, y1, signC: [x, y], signR, chimney: [x, y]} relative to the door point
BD.HouseArt.drawThing(ctx, thing, size, opt) // size = box height; origin = BOTTOM-CENTRE. thing = { kind, color?, obj?, shape?, n?,
   //   animal?, home?, text?, big?, numeral? }
   //   kind 'treat' : obj ∈ cupcake (swirl frosting + a cherry) | macaron | donut (glazed with sprinkles) | cakepop | jelly
   //                  — the frosting / shell / glaze / jelly in `color` (the answer colour)
   //   kind 'shape' : a chunky shape cookie (circle|square|triangle|star|heart|oval|rect|diamond) iced in `color`
   //   kind 'cookies': n round chocolate-chip cookies (1–12) in a neat little stack/row on a plate — each clearly separate
   //   kind 'dots'  : the cream sign with n dark dots `#3A3640` (1–12, dice/rows layout); opt.numeral → a big numeral above
   //   kind 'tile'  : the cream sign with `text` ("A", "a", "3+2", "7−4", numbers ≤ 20) in big rounded dark glyphs
   //   kind 'animal': BD.Assets.img('animals/<a>') fit in the box, feet at the origin
   //   kind 'home'  : the home badge (farm, sea, ice, jungle, savanna) as a picture
   //   kind 'blob'  : a big colour splat-sweet in `color` (the colour sign)
   //   big: false → drawn at size × 0.6 (age-3 size topic)
BD.HouseArt.drawHomeBadge(ctx, home, r, opt) // farm, sea, ice, jungle, savanna (keep)
BD.HouseArt.drawSnowflake(ctx, r, rot, a)    // keep
BD.HouseArt.drawIcon(ctx, choice, size)      // Talk-time picture choices: any thing, {kind:'color', color} (paint blob),
                                             //   {kind:'number', n} (numeral + dots), {kind:'home', home}, {kind:'size', big}
BD.HouseArt.drawHintHand(ctx, x, y, press, alpha) // keep
BD.HouseArt.drawHeartPuff(ctx, r, a)         // a soft pink-white heart-shaped smoke puff (chimney after a delivery)
BD.HouseArt.drawSprinkle(ctx, kind, r, rot)  // kind 0..5: tiny pastel sprinkle rods / dots for the trunk fountain (pastels at
                                             //   ≤ 0.5 saturation so they never read as an answer)
```
Contact sheets: `tools/house_sheet.js` (Playwright) → `docs/art/house_*.png` at in-game size and 3× on the four tablecloth tints.
Unit test `tests/unit/house_art.test.js`: every function runs against a recording mock ctx for every thing/colour/shape/n 1–12/
animal/home/treat, no NaN, node-safe.

### 4.4 Environment — environment artist (`tools/art_env.js`, `tools/env_scenes.js`, `game/js/table_art.js`)
- `env/wall_<m>.svg` (0 0 1600 400) for `m ∈ spring|summer|autumn|winter`: the back wall (plaster, a shelf with jars / loaves /
  a rolling pin, hanging copper pans) with a big window (the season outside), the bottom edge = the table's back edge (a wooden
  table rim). Horizontally **tileable** at the plaster parts or drawn wide enough to be cropped (renderer: scale to the wall
  height, centre the window, crop the sides). Sky colours in a comment `<!-- sky #top #bottom -->`.
- `env/bakery.svg` (0 0 260 240): Tupi's little bakery shop, bottom-centre anchor (130, 236), door facing the viewer.
- Table decorations (sprites, bottom-centre anchor): `env/flour.svg` (0 0 120 60, a flour dust patch), `env/rollingpin.svg`
  (0 0 200 60), `env/jar.svg` (0 0 90 110, sprinkle jar), `env/plant_<m>.svg` (0 0 120 140: a potted herb / tulip / sunflower
  / pine sprig per season) — placed by `TableArt` away from roads, houses, the bakery and the HUD/bubble.
- Particles (0 0 32 32): keep `mote sparkle star petal butterfly leaf confetti_a confetti_b dot snow blossom glint firefly`;
  add `crumb` (a tiny biscuit crumb) and `heart` (a soft pink heart).
- **`game/js/table_art.js` → `BD.TableArt`** (canvas, node-safe, cached):
  ```
  BD.TableArt.drawTable(ctx, layout, season, opt)  // the tablecloth in layout.table (gingham, season tint, soft vignette, flour
     // dust + crumbs, seeded decorations avoiding opt.keep rects); cached bitmap per (W, H, season); opt = { keep:[{x0,y0,x1,y1}], seed }
  BD.TableArt.drawRoads(ctx, roads, layout, opt)   // the whole road tree: shadow → biscuit body → icing bead edges → dashed
     // centre line → sugar bumps. opt = { reveal 0..1 (pour-out along the tree from the root; each edge reveals after its parent),
     // glowEdges: [edge ids] + glow 0..1 (hint: a warm glowing dotted trail on those edges), trail: [edge ids] + trailT (a soft
     // golden "driven" sheen on edges the cart used), snow 0..1, quality }. Cache the static road bitmap per map (key: roads.key).
  BD.TableArt.drawWall(ctx, layout, season, t, opt)  // the back wall + window (env/wall_<m>), the window shows a gentle outside
     // animation (clouds drift / swaying branch) — cheap.
  BD.TableArt.drawBakery(ctx, layout, t, opt)       // env/bakery at layout.bakery (+ the oven glow pulse, opt.puff steam 0..1)
  BD.TableArt.drawSkid(ctx, x, y, r, a)             // a little sugar-dust puff behind the wheels
  ```
- `tools/env_scenes.js`: composed scenes at 1556×720, 960×720, 720×1556, 720×960 per season (with a fake road tree, fake houses
  as boxes, a fake cart box) into `docs/art/`, and exports a `RECIPE` (wall heights per shape, sun position per season) that
  `render.js` copies verbatim.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `house_art.js` (+ `tools/house_sheet.js`, `tests/unit/house_art.test.js`) | character artist B |
| `characters/*`, `icon.svg`, `tupi_points.js` (+ `tools/art_tupi.py`, `tools/tupi_sheet.js`) | character artist A |
| `env/*`, `particles/*`, `table_art.js` (+ `tools/art_env.js`, `tools/env_scenes.js`) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, `tests/e2e/*` | integrator |
Script order: rng, i18n, content, tupi_points, world, weather, bot, storage, assets, audio, voice, input, house_art,
table_art, render, ui, main.

### 5.1 Content (`content.js` → `BD.Content`)
```
BD.PALETTE, BD.COLORS ['red','blue','yellow','green','orange','purple','pink'], BD.SHAPES, BD.TREATS ['cupcake','macaron','donut','cakepop','jelly'],
BD.ANIMALS = { cow:'farm', pig:'farm', sheep:'farm', duck:'farm', hen:'farm', horse:'farm', goat:'farm',
               crab:'sea', fishbowl:'sea', penguin:'ice', lion:'savanna', monkey:'jungle' }, BD.HOMES
BD.AGE_TOPICS = { 3:['colors','shapes','size','animals'], 4:['colors','shapes','count','animals'],
  5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
BD.Content.makeRound(topic, { age, lang, rng, roundIndex, level, surprise, short }) → round   // pure, deterministic, self-checks
BD.Content.makeTalk(topic, { age, lang, rng }) → talk   // { promptKey, params, show: thing | null, choices:[{id, thing}], answer }
BD.Content.topicsFor(age, rng, lastTopics), BD.Content.ageOf(a), BD.Content.validate(round) → null | reason
round = { topic, age, lang, roundIndex, surprise: null|'mouse'|'bird'|'snow',
  houses: [ { id, sign: thing } ],      // n houses (the map), left→right / bottom→top order is random
  orders: [ { cargo: thing, target: houseId, promptKey, params, count?: n } ],   // the deliveries of this round, in order
  map: { seed, forks: 1|2 },            // the road generator's seed (World turns it into roads for the current layout)
  promptKey, params }                    // the round's first prompt (= orders[0])
```
- Houses (n) × deliveries (d): warm-up (round 0): n 2, d 1. Age 3: (2,1) (2,2) (3,1) (3,2); age 4: (2,1) (3,2) (3,2) (3,2)
  — level 0 of age 4: (2,1) (2,2) (3,2) (3,2); age 5: (3,2) (3,2) (4,2) (4,3) with 2 forks from round 2; 6+: (3,2) (4,2) (4,3)
  (4,3). `short` rounds: n 2, d 1. Each order has EXACTLY ONE matching house (self-check); the d orders of a round target
  different houses; the target changes every round; content varies every round; never the same round twice in a chapter.
- `colors`: houses are coloured (roof + door + sign blob), distinct CVD-safe colours below age 5. Cargo = a `treat` in the
  target colour (a different treat kind per order at age ≥ 4; round 0 always a cupcake). `p.colors {color, treat}` "Take the red
  cupcake to the red house!".
- `shapes`: house signs = shape cookies (one icing colour per round), never similar pairs together (square/rect, circle/oval,
  square/diamond); cargo = the same shape cookie. `p.shapes {shape}`. Age 5 `p.shapes5`: house signs in mixed colours, the cargo
  in yet another colour, the shape is the rule.
- `size` (age 3): two houses, a big-sign and a small-sign one (same treat, `big` true / false); cargo = a big or small cake
  (`p.size {big}` "Take the BIG cake to the big house!").
- `count`: house signs = `dots` with `numeral: true` (age 4: numbers 1..5, the n houses differ by ≥ 1, never adjacent pairs only
  at the warm-up); cargo = `cookies n` — at the pickup the cookies hop into the tray one by one and are counted aloud (event
  `count {i}` every 0.45 s), then `p.count {n}` "Take 3 cookies to house number 3!". Age 5: 1..8, age 6: 4..12.
- `animals`: passengers. Age 3 + every round 0: house signs = animals (a picture of the friend), cargo = the same animal
  (`p.animal {animal}` "Take the cow to her friend!" — match the same animal). Age ≥ 4 from round 1: house signs = `home` badges
  (farm, sea, ice, jungle, savanna — n distinct), cargo = an animal (`p.home {animal}` "Take the penguin home!"). On arrival the
  animal hops off into its home.
- `letters` (5, capitals): signs = `tile` letters, cargo = a letter cookie (a `tile` thing) — avoid look-alikes (E/F, O/Q/C/G,
  M/N/W, P/R/B, I/L/T, U/V). `p.letters {letter}`. `lower` (6): cargo a capital, signs small letters; drop l/I; no b/d/p/q
  together. `p.lower {letter}`.
- `initial` (6–7): cargo = an animal or treat picture; signs = letters; target = the first letter of its name in THAT language
  (i18n `name()` first letter, ignoring diacritics and the VI classifier "con/cái/quả/chiếc/cây/bông/bánh"). `p.initial {}`.
- `add` / `sub` (6–7): cargo a `tile` "2+3", signs numbers, target = the result. `oddeven` (7): two houses with tile signs
  `odd` / `even` (text from i18n at render time: `text: '@odd'` / `'@even'`), cargo `cookies n` (2..10), `p.oddeven {}`.
- Talk time (`makeTalk`): as the river game (colour blobs; shape choices; count → show a `cookies` thing "How many cookies?"
  number choices; animals → "Where does the {animal} live?" home badges; age 3 "Who is this?"). 2 choices at age 3, 3 at 4+.

### 5.2 `BD.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s; `_p*` previous values + `alpha` for interpolation)
Public API as the river game: `setViewport(W,H,ins), setAge, setLang, newSession({lastTopics}), levels, startLevel(i),
update(dt), drainEvents(), pointerDown/Move/Up(x,y), cancelDrag(), hint(), talkAnswer(id), prompt(), resetNudges(), skipTalk(),
layout, hudKeep, state, phase, level, topic, round, roundsPerLevel, stars, levelStars, roundStars, misses, talk, alpha,
stateTime, phaseTime, interactive, weather (= level % 4), cur (the round), houses, roads, cart, tupi, order (index), orderObj,
mouse, bird, snowflakes, puffs, hintHand, wipe, houseById(id), answer(), targets()`.
States `intro | round | roundDone | talk | levelDone | sessionDone`. Phases in a round: `'build' | 'load' | 'play' | 'arrive' |
'return' | 'party' | 'wipe'`.
- **build** (≈ 1.6 s): the road pours out from the bakery (`world.roadReveal` 0 → 1 in 1.0 s, ease-out), houses pop up
  staggered along the reveal (`house.appear` 0 → 1 with a back-overshoot squash, event `house {id, x, y}`), the cart rolls
  out of the bakery door to `start` (event `rollOut`).
- **load** (≈ 0.9 s; count: 0.6 + 0.45 s per cookie): the cargo pops out of the oven window in an arc into the tray (event
  `load {cargo, x, y}`; cookies: one `count {i, x, y}` per cookie hopping in). Then `ask {promptKey, params, first, orderIndex}`
  → `play`.
- **Cart** `w.cart = { x, y (ground point), _px, _py, edge, s (distance along the edge), vel (px/s along the road, signed),
  dir {x, y} (unit, along motion), face ±1 (spring-smoothed `faceS` −1..1 for a squash-flip turn), lean (rad, spring:
  leans back on acceleration, into curves by curvature × speed), bounce (px, spring: sugar bumps + landing), wheelRot, squash,
  state 'wait'|'drag'|'auto'|'arrive'|'return'|'home', cargo (thing | null), cargoHop (px) }`. `w.tupi = { mood idle|talk|happy|
  cheer|think|oops|honk|spray|wave|giggle|hand, moodT, blink, look (rad) }`.
  Motion along the tree: the cart always moves along roads. The world keeps a **target position** (edge, s); the cart travels
  along the tree path to it with `vmax` 900 px/s while dragging (approach `v = min(vmax, 9·dist)`), 520 px/s in auto-drive,
  accel ≤ 2600 px/s², brake on stop ≤ 0.15 s. Wheels rotate by distance / r. Bumps: passing a sugar bump kicks `bounce`
  (spring ω 18, ζ 0.3) + event `bump`. Curves: lean = clamp(curv × v² × k, ±0.16). Faces: `face` = sign(dir.x) (keeps the last
  for vertical roads), flip through `faceS` in 0.18 s with a little hop. Dust puffs behind the wheels at speed (event-free,
  `w.puffs[]` cap 30).
- **play** — one active pointer.
  - press on the cart (≤ hitR) → **grab** (event `grab`): every `pointerMove` projects the finger onto the nearest road point
    (search all edges; hysteresis 18 px to stay on the current branch near the fork) within `roadW/2 + 140` px; that becomes the
    target (finger far from every road → keep the last target). Release → the cart rolls to a stop; released on a branch past
    80 % of its length → it auto-rolls into that house. **A tap is not a drive**: finger moved < 24 px and released within 0.35 s
    → `honk` (Tupi trumpets, the question is repeated), never a mistake.
  - press on a **house** (box + margins) or on a **road** point (not on the cart) → **auto-drive** there (event `autoDrive
    {houseId?}`) — the tap fallback for the youngest. Press on Tupi/cart while auto-driving → nothing.
  - **arriving** at the end of a branch (s ≥ len − 6) → phase `arrive`. Right house → event `right {houseId, cargo, x, y,
    left (orders left), home?, count?}`, the cart brakes with a squash, the door opens (`house.door` → 1 in 0.3 s), Tupi mood
    `hand`, the cargo hops from the tray to the door in an arc (0.5 s, event `deliver {houseId, x, y}`), a friend pops out of
    the door and waves (`house.friend = {animal, t, state}`: the animal from the order in the animals topic, else a seeded friend
    animal), the windows light (`lit` → 1), the chimney puffs 3 heart puffs (`w.puffs` kind 'heart', event `hearts`), stars
    for this order; then the door closes and phase `return`: the cart auto-drives back to `start` at 700 px/s (event `back`) —
    or, if it was the round's last order, phase `party`.
  - **wrong house** → event `wrong {houseId, got: {nameKind, nameValue}, want, streak, x, y}`: the cart bumps softly against
    the house's fence (bounce + squash), the door opens a crack, the friend peeks out and shakes its head kindly (0.8 s), then
    the cart **auto-reverses** to the last fork (event `reverse`), Tupi mood `oops` → `think`. Counts as a miss (≤ 1 per
    arrival). Driving into a wrong branch without arriving is never a miss.
  - press on nothing → `soft {x, y}` (a crumb puff); 3 soft → hint, 5 → assist. Press on Tupi while not interactive → `pokeTupi`.
  - After 2 misses or `hint()`: `hint {houseId, edges}` — the route from the cart to the target house glows (`w.hintEdges`,
    `w.hintGlow`), the target house glows, the ghost hand **drags** from the cart along the route (`w.hintHand = {x, y, t, press,
    alpha}` following the route over 1.6 s, twice); cooldown 6 s; idle nudges after 12 s, backoff ×1.5 up to 30 s (`idle {n}`;
    the 2nd idle also hints). Warm-up round of chapter 0: the hand demonstrates the drag right after the ask (no hint penalty).
  - assist (after 5 no-progress presses or 3 misses): the next press anywhere auto-drives to the right house (`assist` event);
    an assisted order caps the round at 2★.
- **return** (≈ 0.8–1.5 s) → back at `start` → `load` of the next order.
- **party** (≈ 2.4 s): event `party {x, y}`: Tupi `honk` (0.6 s) then `spray` — a sprinkle fountain from `trunkTip`
  (`w.sprinkles[]` cap 80, gravity 900, bounce once on the table, fade), every delivered house lights + puffs hearts; then
  `roundDone {round, stars, misses, x, y}` (stars 3/2/1 for 0/1/≥ 2 misses in the round; assisted ≤ 2; x, y above Tupi).
- **wipe** (≈ 1.3 s): event `wipe {season}`; `w.wipe = {t 0..1, dir}` — the renderer sweeps a curtain of seasonal particles
  + flour across; at t = 0.5 (screen covered) the next map is built (houses hidden, `roadReveal` 0, cart at the bakery door).
  Then `build`, or Talk time after round 4 / once the chapter passed 75 s with ≥ 3 rounds done.
- `interactive` = state 'round' && phase 'play' && cart not auto-driving.
- **Surprises** (one round per chapter, rotating, never in the warm-up): chapters 0–2 rotate **mouse** / **bird**, chapter 3
  (winter) **snow**:
  - mouse: peeks out of a flour sack on the table (a free spot ≥ 90 px from roads / houses / bakery), stays ~10 s, `mouse`
    event; tap → `mouseTap` (squeak + wave, flour puff). `w.mouse = {x, y, peek 0..1, wave 0..1, state, t}`.
  - bird: lands on the window sill (in the wall band, off the bubble), `bird` event; tap → `birdTap` (sings, hops).
    `w.bird = {x, y, hop, sing 0..1, state, t}`.
  - snow: 5 big snowflakes drift down over the table (`w.snowflakes[] = {x, y, r, rot, a, state}`, event `snow`); tap → `snowTap`.
- Events also: `level {level, topic, weather}`, `round {round, surprise}`, `gust {dir}` (autumn, a breeze through the window:
  a few leaves blow in), `talk`, `talkAsk {n}`, `talkResult`, `levelDone`, `sessionDone {stars}`, `session {levels}`,
  `fork {x, y}` (the cart passes a fork while driving — main may play a "ding"), `drive {on}` (motor/pedal sound start/stop).
  Every positional event carries `x, y` (clamped on screen).
- Rotation / resize mid-round: cancel the drag, re-layout, rebuild the roads for the new layout from the same `map.seed`, the
  cart snaps to the same edge at the same fraction of its length, houses to their new spots; everything clamped into the screen.

### 5.3 `BD.Weather` — `setWeather(i, {instant})` (0 spring, 1 summer, 2 autumn, 3 winter; crossfade 2.5 s), `resize(W,H,layout)`,
`update(dt)`, `wind` (autumn breezes every 6–10 s ±40 for 1.5 s with event `gust`), `ambient` (`skyTop, skyBottom, tint, light,
sunX, sunY, sunA, mood`) used for the WINDOW only, `particles[]`: spring petals + blossoms + a butterfly drifting in through the
window over the table, summer sun motes in warm light beams from the window (`ambient.beam` 0..1) + glints, autumn leaves blowing
in on gusts (they slide and settle on the table, then fade), winter snow outside the window (inside: a few flour motes, steam
curls from the bakery). `burst(x, y, {kind: 'stars'|'sparkle'|'confetti'|'petals'|'leaves'|'hearts'|'crumbs', n})`,
`setParty(on)`, `wipeParticles(dir)` (a dense sweep of ≈ 60 seasonal particles + flour for the wipe). Cap 120 (+60 in a wipe).

### 5.4 `BD.Bot` — drives through `world.pointerDown/Move/Up` like a finger: grabs the cart and moves the "finger" along the
route to its chosen house in steps of 12–30 px every 1/30 s with ±0.25 × roadW wobble (sometimes lifting halfway and grabbing
again); picks the right house with p = skill (else a random wrong one); human-ish delays (0.6–2.0 s) after `ask`; sometimes
uses a tap on the house instead (p 0.25); answers Talk right with p = skill; taps surprises sometimes.

### 5.5 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved); `window.BD.debug = { world, weather, mode, stats, events, getState(), setSpeed(n), startGame(), goTitle(),
setBot(on, skill), setAutoRestart(on), gotoLevel(i), voiceLog, cartScreen() → {x,y,r} CSS px, houseScreen(id) → {x,y,w,h},
routeScreen(houseId) → [[x,y]…] CSS px (the road points from the cart to that house, every ≈ 20 px), mouseScreen(), birdScreen(),
snowScreen(), answer() → {houseId} | null, targets() → [ids], toScreen(x,y), audio() }`.
World supplies `cartHit()` {x,y,r}, `houseHit(id)` {x0,y0,x1,y1,cx,cy}, `route(houseId)` [[x,y]…] (logical px, from the cart's
current point), `mouseHit()`, `birdHit()`, `snowHit()` (circles or null), `answer()` ({houseId} of the current order), `targets()`.

## 6. Voice, language — as the river game §6 with helper **Tupi** (written and spoken "Tupi" in both languages; VI titles "Voi
Tupi"), a cheerful little elephant baker: pitch ≈ 1.2, rate ≈ 0.9. Treats (VI): cupcake "bánh cupcake", macaron "bánh macaron",
donut "bánh donut", cake pop "kẹo bánh", jelly "thạch rau câu"; cookies "bánh quy"; cake "bánh kem"; house "ngôi nhà"; road
"con đường"; bakery "tiệm bánh"; shapes "hình …" (hình tròn, hình vuông, hình tam giác, ngôi sao, trái tim, hình chữ nhật, hình
thoi, hình bầu dục), dots "chấm"; animals "con bò, con heo, con cừu, con vịt, con gà mái, con ngựa, con dê, con cua, bể cá vàng,
chim cánh cụt, sư tử, con khỉ"; homes: farm "nông trại", sea "biển", ice "xứ băng", savanna "đồng cỏ châu Phi", jungle "rừng
rậm". Seasons "mùa xuân, mùa hè, mùa thu, mùa đông".
`I18N` API used by main (all `(lang, e)` → string):
- `ask(lang, promptKey, params, {first})` — 3 wordings each; `first` only in a chapter's round 0 ("Ding! A red cupcake is ready!
  Drive it to the RED house!"); `p.colors` "Take the red cupcake to the red house!" / "Bé chở bánh cupcake màu đỏ đến ngôi nhà
  màu đỏ nhé!"; `p.count` "Take 3 cookies to house number 3!"; `p.animal` "Take the cow to her friend!"; `p.home` "Take the
  penguin home!" / "Đưa chim cánh cụt về nhà nào!"; `p.size`, `p.shapes`, `p.shapes5`, `p.letters`, `p.lower`, `p.initial`,
  `p.add`, `p.sub`, `p.oddeven`. `drag` hint line ("Hold Tupi's cart and drive along the road!" / "Bé giữ xe của Tupi rồi chạy
  theo con đường nhé!").
- `sayRight(lang, e)` — names the delivery ("A red cupcake for the red house!" / "Bánh màu đỏ cho nhà màu đỏ!") + `left > 0` →
  "One more!" variants, `left == 0` → "All delivered!" variants; count: "Three cookies for house three!"; animals home: "The
  penguin lives on the ice!". `sayCount(lang, i)` ("One!", "Một!"), `sayCountRun(lang, n, kind)` ("Three cookies!").
- `sayWrong(lang, e)` — names the house, then the goal ("This is the blue house. The cupcake is red!" / "Đây là nhà màu xanh
  dương. Bánh màu đỏ cơ!"); count: "This is house 4. We have 2 cookies!"; never negative words. `sayWrongHint(lang, e)`.
- `sayName(lang, thing)`, `talkWrong(lang, answer)`, `honk[]` ("Toot toot!" / "Bim bim!"), `party[]` ("Hooray, all delivered!"),
  `thanks[]` (the friend: "Thank you!" / "Cảm ơn Tupi!").
- Keys: `hint[]`, `idle[]`, `praise[]`, `great[]` with `{child}`, `roadDone[]`, `talk.*`, `weather.0..3` ("Spring in the bakery!",
  "Sunny summer!", "Windy autumn!", "Snowy winter!"), `surprise.mouse`, `mouse.tap`, `surprise.bird`, `bird.tap`,
  `surprise.snow`, `snow.tap`, `poke[]`, `topic.*`, `session.done`, `ui.*` incl. `ui.volume`, logo lines "Tupi's" / "Bakery
  Delivery", VI "Voi Tupi" / "Giao Bánh Ngọt"; `ui.voice` "Tupi's voice" / "Giọng của Tupi"; `odd` / `even` words for tiles.

## 7. Integration — title (Tupi standing with a cupcake beside her cart, the bakery and an icing road behind the logo, ▶ Play,
star total, language toggle, hold-⚙), settings with volume, HUD, speech bubble, pause with −/+, chapter banner, Talk time,
session done (Tupi honks + sprays sprinkles, all houses lit, confetti). Render order: wall (window + outside season + sun) → back
particles (outside) → table → light beams → roads → bakery → houses back-to-front by y (house → sign → door → friend → hearts) →
mouse → cart (shadow → cart_back → Tupi → cargo → cart_front → wheels) → flying cargo → sprinkles → bird (on the sill) →
snowflakes → hint hand → front particles → fx → wipe curtain → banner. Audio: road pour (soft icing "squeeze" glide), house pop
("plop"), roll-out (little bell), load (oven "ding" + "pomf"), drive (soft pedal-clicks / tiny motor hum pitch ~ speed, loops
while moving), bump ("bonk" tiny), fork ("ting"), arrive brake ("squeak"), door ("creak-ding"), deliver ("ta-da" + friend's
cheer sound per animal), hearts ("bloop"), wrong (soft "boing-boing", low), reverse ("beep-beep" soft), honk (baby elephant
trumpet: a short FM brass-like toot), spray (fizzy sparkle), count pip rising, soft tap (crumb "tk"), wipe (airy whoosh), gust,
mouse squeak, bird song, snow twinkle; ambience = cosy kitchen (oven hum + soft clock tick) + per season (spring birds outside,
summer insects, autumn wind, winter soft chimes), music bed per season (kalimba / marimba, ducked under speech).

## 8. Performance — roads cached as one bitmap per map/layout, houses cached per (S bucket, seed, color, sign, snow) with door /
lit / glow as overlays, things cached per thing+size, the table cached per size/season, ≤ 120 particles, ≤ 80 sprinkles, ≤ 30 puffs;
adaptive quality as before.
