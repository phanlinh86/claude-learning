# Nim's River Hop — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.NH`**. Classic `<script>` files, no build step, node-safe at load
(touch the DOM lazily). The code base is a copy of `../panda-bubble-sky/` (state machine, voice, input, storage, loud audio
with volume, ui, main, tests) with `PB → NH` and storage prefix `nh:` already replaced. **The bubble world is replaced by a
river-crossing world.** When a detail is missing here, do what `../panda-bubble-sky/docs/DESIGN.md` / `MECHANICS.md` /
`VOICE.md` do (i18n / voice API style, hooks, Talk time, chapter-topic rotation between sessions, idle auto-pause, CONFIG
style, hint cooldown / idle backoff, prompt protection, phone layout tweaks, short rounds when a chapter runs long,
interpolation with `_p*` twins + `alpha`). Target: iPhone + iPad Safari first, portrait and landscape.

## 1. What changes versus Bao's Bubble Sky
| Bao's Bubble Sky | Nim's River Hop |
|---|---|
| tap floating bubbles anywhere | **tap a stone in the NEXT row** of a river crossing (rows from the near bank to the far bank) |
| bubble field in the sky, rainbow arch | **a brook** crossing the screen; near bank (Nim) → 2–4 rows of 2–3 stones → far bank (a fruit waits) |
| Bao the panda sitting with a wand | **Nim** (`nim`), a little hedgehog who **hops** stone to stone (crouch → ballistic arc → squash landing) |
| pop → freed thing paints the rainbow | **hop** → the stone dips + ripples, turns **golden**; on the far bank Nim **curls up and rolls over a fruit — it sticks on his spines** |
| whoosh → leftovers float away | **wipe**: a seasonal swirl (petals / sun motes / leaves / snow) sweeps across; a new crossing rises |
| cloud land | **woodland brook**, spring → summer → autumn → winter (blossoms, sunshine + dragonflies, floating leaves + gusts, snow) |

## 2. Screen and layout
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
  Screen space = world space (no camera), y down. `ins` = safe-area insets in logical px. `hudKeep` boxes as before.
- **Hop axis** `ax`: landscape `{x: 1, y: 0}` (Nim crosses left → right; the brook runs **top → bottom** of the screen,
  coming down out of the far woods); portrait `{x: 0, y: −1}` (Nim crosses bottom → top; the brook runs **left → right**
  across the screen). "along" = along the hop axis, "across" = perpendicular.
- `World.setViewport(W, H, ins)` computes `layout`:
  ```
  layout = { W, H, ins, portrait, tall /* H/W > 1.6 */, phone /* long/short > 1.9 */, ax,
    bubble: {x,y,w,h}, hud: {x,y,w,h},     // speech bubble + HUD exactly as the bubble game (top band)
    play: {x0, y0, x1, y1},                // usable rect: below the bubble/HUD band (+10), inside insets, bottom keep 14 (land) / 26 (port)
    near: {x, y, w, h},                    // near-bank rect. Landscape: x = 0 … ins.left + nearW (nearW 230, ≥ 190 when squeezed),
                                           //   y = play.y0 … H. Portrait: y = H − ins.bottom − nearH (nearH 250, tall ×1.2) … H, full width.
    far:  {x, y, w, h},                    // far-bank rect. Landscape: x = W − ins.right − farW (farW 210, ≥ 170) … W, y = play.y0 … H.
                                           //   Portrait: y = play.y0 … play.y0 + farH (farH 220), full width.
    river: {x, y, w, h},                   // the water between the banks (landscape: x from near right to far left, full height
                                           //   below the bubble band — the brook comes from under the far woods at the top;
                                           //   portrait: y from far bottom to near top, full width)
    nimHome: {x, y},                       // Nim's FEET on the near bank: landscape (ins.left + 120, centre of play y + 40);
                                           //   portrait (W/2 − 60, near.y + 0.62·near.h)
    goal: {x, y},                          // the fruit's spot on the far bank (feet point Nim rolls to): mirrored
    nimH,                                  // Nim's height: landscape 190, portrait 180 (phone portrait 210); on stones the same
    rows: k, rowPos: [a_j],                // centre of each row along the axis, evenly spaced between bank edges
    S,                                     // stone WIDTH: ages ≤ 4: 150, 5: 140, 6+: 128; shrinks (≥ 116) until rows fit
                                           //   (row pitch ≥ S·0.62 + 40 along the axis in landscape; ≥ S·0.5 + itemH + 30 in portrait)
    itemH,                                 // height of the thing on a stone: 0.62·S
    hitR,                                  // 0.6·S·0.75 + 14 (≥ 0.6·(item box) + 14); phones: max(that, 92). Nearest centre wins.
  }
  ```
- Per round `world.stones[]` hold their own home `hx, hy` (row j along the axis, stones spread across the river with even
  spacing, ± a seeded jitter of 18 px, never within 44 px of the speech bubble / HUD / screen edge). Landscape across-range
  = `play.y0 + 0.5·itemH + 20 … H − ins.bottom − 70`; portrait across-range = `ins.left + 0.55·S … W − ins.right − 0.55·S`.
- Stone hit test: circle at the stone's current top-centre raised by 0.35·itemH (covers stone + thing), r = `hitR`; nearest
  centre wins; ties → the active row wins. Nim box → `pokeNim`. Surprise hit circles. Everything else → `soft`.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand (no Sonic, no Mrs. Tiggy-Winkle /
  Beatrix Potter look, no Hedgehog in the Fog, no Peppa Pig, no Frogger). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox
  256–300) in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark/light)** — unchanged from the bubble game, `NH.PALETTE` in `content.js`:
  red `#E84A4A/#A8282E/#F7A0A0`, blue `#3C8DE8/#1F5BA8/#A6CCF5`, yellow `#FFD23F/#C99A12/#FFEB9C`, green
  `#4CC26B/#2A8343/#A8E6B8`, orange `#FF9A2E/#C4650C/#FFCB8E`, purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2`
  (pink from age 5). Below age 5 never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round.
- **Water** must not compete with answer blue: a muted teal-slate brook, `#7FB8B4` (shallow edge) → `#4E8E95` (deep middle),
  light ripples `#D9F0EC` at 0.5 alpha, winter `#8FB3BF → #5F8794` with ice rims `#EAF4F7`. Never saturated blue.
- **Grass banks** muted (spring `#9CC98A`, summer `#86B86E`, autumn `#B9A764` with rust leaves, winter snow `#F1F4F8` with
  blue-grey shade `#C9D4E2`) — calmer than answer green `#4CC26B`. Earth edge `#9A7B58` / dark `#6E5640`.
- **Stones**: rounded flat river stones, warm grey `#B9B2A6` top, side `#8E877C`, outline `#6C665D`, a soft top highlight
  `#D8D2C7`, a wet darker band at the waterline; slight per-stone shape variation (seeded). **Golden** (visited) stone =
  `#F4D27A` top / `#C9A043` side with a soft glow. Winter: a snow cap on top.
- **Nim**: a small round baby hedgehog. Spines = soft warm brown `#8A5A3C` (shade `#6B4229`, outline `#4E2F1D`, tip
  highlights `#B88760`), drawn as rounded petal-like tufts (soft, not sharp); face / belly cream `#F6E3C8` (shade `#E2C9A6,
  outline `#9C7A5A`), little pink-brown nose `#5A3A2E`, big eyes `#2A1E1A` with catch-light, rosy cheeks `#F4A7A0`, tiny
  paws `#D9B48F`. A **leaf-green-free** look: Nim wears a little **mustard scarf `#E3B65A`** (outline `#A9812E`) — never an
  answer colour (mustard is clearly duller than answer yellow `#FFD23F`).
- **Fruit rewards** (they stick on Nim's spines): apple (soft red-pink `#E77A6E` — a reward, never asked by colour), pear
  `#CFD77A`, strawberry `#E8706F` with seeds, mushroom (cream cap `#F2E6D0` with soft brown spots), acorn `#B98A55`.
- **Woodland brook** (calm, slightly warm; the answer colours must pop): far = distant wooded hills + a small wooden
  mill/cottage silhouette; mid = a tree line (round + pine trees) whose bottom meets the banks. Seasons:
  spring: sky `#CFE6F5 → #F6F1E4`, blossom trees (`#F2CFD9`), petals on the water;
  summer: sky `#8CCBEA → #E6F5F6`, full green trees (muted `#8DBB82`), sun glints on the water, dragonflies;
  autumn: sky `#F1C893 → #FBEBD3`, amber/rust trees (`#D9A06A`, `#C47E55`), leaves fall and **float downstream**, gusts;
  winter: sky `#B9C8E2 → #EEF2F8`, snowy pines, ice rims along the banks, snowfall.
  **Readability:** stones and their things are never tinted by the mood.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Nim, surprises & icon — character artist A (`tools/art_nim.py`, contact sheets `tools/nim_sheet.js`)
| File | viewBox | Notes |
|---|---|---|
| `characters/nim_{idle,blink,talk,happy,cheer,think,oops,crouch,jump,roll,wave,giggle,dance}.svg` | 0 0 300 300 | Nim 3/4 view facing RIGHT, eyes towards the child, standing on 4 tiny paws, **feet anchor (150, 290)**, identical body in every frame (except crouch/jump/roll). idle; blink = eyes shut arcs; talk = mouth open; happy = big smile; cheer = front paws up, eyes ^^; think = head tilt, paw at chin; oops = "hmm?" head tilt + one paw up (never sad); **crouch** = body squashed ~12 % lower, ready to jump; **jump** = airborne stretch, paws tucked, spines flowing back, delighted face; **roll** = curled into a round spiky ball (spines all round, face peeking + a smile), centred on (150, 200), r ≈ 88; wave; giggle (eyes ^^, paw at mouth); dance (bouncy pose, one paw up). Body faces right; the world mirrors it (portrait hops "up": keep facing right, the world never rotates Nim). |
| `characters/nim_title.svg` | 0 0 300 300 | title pose: Nim waving, an apple on his spines |
| `characters/fish.svg`, `fish_flip.svg` | 0 0 140 100 | a small round friendly fish, soft coral-peach `#F2A68A` (NOT an answer colour), cream belly, centre anchor (70, 50), facing RIGHT; flip = curved body mid-leap |
| `characters/frog.svg`, `frog_croak.svg` | 0 0 140 120 | a small round frog, muted sage `#9FBF7A` (NOT answer green), sitting on a lily pad `#7FA86A`; feet anchor (70, 112); croak = throat puffed, eyes closed happy |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | Nim mid-hop over stepping stones in a brook, an apple on his spines, full bleed, no text |
Also write `game/js/nim_points.js`: `NH.NIM_POINTS = { feet: [150, 290], backSlots: [[x,y,rot], …4], rollC: [150, 200],
rollR: 88, rollSlots: [[x,y], …4], mouth: [x, y], box: [x0, y0, x1, y1] }` — backSlots are where fruits sit on the spines in
the standing frames (the same for every standing frame; crouch/jump: give `crouchDy` = how much the back moves down), rollSlots
on the ball. Exact numbers you drew; the renderer draws fruits there.

### 4.2 Animals — REUSED (`animals/<a>.svg`, `<a>_step.svg`, 0 0 200 200, feet (100, 194), facing right):
`cow pig sheep duck hen horse goat crab penguin lion monkey fishbowl`. Homes: farm (first 7), sea (crab, fishbowl), ice
(penguin), savanna (lion), jungle (monkey). On a stone the animal stands on top (feet on the stone top).

### 4.3 Stone & thing art (canvas code) — character artist B: `game/js/stone_art.js` → `NH.StoneArt`
Start from `bubble_art.js` (copy its thing / icon / badge / hint-hand / snowflake / stars / tile code; then **delete
`bubble_art.js`**). Pure canvas drawing, cached per thing+size (offscreen bitmaps), node-safe at load.
```
NH.StoneArt.drawStone(ctx, S, opt)    // origin = the TOP-CENTRE of the stone's top face (where things / Nim stand).
                                      //   S = width. opt = { seed (shape variation), tilt (rad), dip 0..1 (how deep it sits in the
                                      //   water: the waterline band moves up), gold 0..1 (visited glow), glow 0..1 (hint / active
                                      //   row: soft warm outline pulse), snow 0..1, wet 0..1, alpha 0..1, active 0..1 (a soft
                                      //   white dashed ring on the water around the stone for the active row) }
                                      //   The stone's top face ≈ S × 0.36·S ellipse, side height ≈ 0.22·S down to the waterline.
NH.StoneArt.drawRipple(ctx, x, y, r, a, flat)     // an ellipse ring on the water (flat = y/x ratio, ≈ 0.38)
NH.StoneArt.drawDrop(ctx, x, y, r, a)             // a water droplet
NH.StoneArt.drawThing(ctx, thing, size, opt)      // size = box height; origin = BOTTOM-CENTRE (it stands on a stone);
  // opt = { glow, wiggle, alpha }. thing = { kind, color?, obj?, shape?, n?, animal?, text?, big? }
  //   kind 'obj'    : obj ∈ flower (a big 5-petal flower on a short stem) | mushroom (dome cap with white dots, cream stem)
  //                   | leaf (a big round leaf) | ball | duck (rubber duck) — the cap / petals / leaf / ball / duck in `color`
  //   kind 'shape'  : a chunky shape cookie/gem standing up (circle|square|triangle|star|heart|oval|rect|diamond) in `color`
  //   kind 'dots'   : a round cream wooden sign `#F3E6CC` (outline `#9C7A5A`) on a tiny post, with n dark dots `#3A3640`
  //                   (1–12, dice / rows layout, every dot clearly separate) — age ≥ 5 also the numeral under the dots? NO:
  //                   opt.numeral true → a big numeral above the dots (countSeq rounds always show it)
  //   kind 'tile'   : the same wooden sign with `text` ("A", "a", "3+2", "7−4", numbers ≤ 20) in big rounded dark glyphs
  //   kind 'animal' : NH.Assets.img('animals/<a>') fit in the box, feet at the origin
  //   big: false → drawn at size × 0.6 (age-3 size topic)
NH.StoneArt.drawFruit(ctx, kind, size, opt)       // kind apple|pear|strawberry|mushroom|acorn; origin = centre; opt {rot, alpha, glow}
NH.StoneArt.drawHomeBadge(ctx, home, r, opt)      // farm, sea, ice, jungle, savanna (keep)
NH.StoneArt.drawSnowflake(ctx, r, rot, a)         // keep
NH.StoneArt.drawIcon(ctx, choice, size)           // Talk-time / picture choices: any thing, {kind:'color', color} (paint blob),
                                                  //   {kind:'number', n} (numeral + dots), {kind:'home', home}, {kind:'size', big}
NH.StoneArt.drawHintHand(ctx, x, y, press, alpha) // keep
NH.StoneArt.drawLilyPad(ctx, r, rot)              // a muted green pad with a notch (surprise frog; also river decoration)
```
Contact sheets: `tools/stone_sheet.js` (Playwright) → `docs/art/stone_*.png` at in-game size and 3× on the four water colours.
Unit test `tests/unit/stone_art.test.js` (replaces `bubble_art.test.js`): every function runs against a recording mock ctx
for every thing/colour/shape/n 1–12/animal/fruit, no NaN, node-safe.

### 4.4 Environment — environment artist (`tools/art_env.js`, `tools/env_scenes.js`, `game/js/river_art.js`)
For `m ∈ spring|summer|autumn|winter`:
- `env/far_<m>.svg` (0 0 1200 720): distant wooded hills (+ a small mill/cottage silhouette); bottom-anchored, horizontally
  tileable (seam at 0/1200), transparent top. Sky colours in a comment `<!-- sky #top #bottom -->`.
- `env/mid_<m>.svg` (0 0 1200 300): a tree line (round + pine trees, season colours), tileable, bottom-anchored.
- Bank decorations (sprites, bottom-centre anchor): `env/bush_<m>.svg` (0 0 200 140), `env/reeds_<m>.svg` (0 0 120 160),
  `env/rock.svg` (0 0 120 80), `env/flowers_<m>.svg` (0 0 140 70; winter = snow tufts), `env/tree_<m>.svg` (0 0 260 360, a
  bank tree the fruit hangs under).
- `env/sun.svg`, `env/cloud_a.svg`, `env/cloud_b.svg` (0 0 300 140) — keep or redraw.
- Particles (0 0 32 32): keep `mote sparkle star petal butterfly leaf confetti_a confetti_b dot snow blossom glint firefly`;
  add `dragonfly` (0 0 48 32, soft teal-lilac wings).
- **`game/js/river_art.js` → `NH.RiverArt`** (canvas, node-safe, cached where possible):
  ```
  NH.RiverArt.drawRiver(ctx, layout, t, season, opt)   // the water in layout.river: depth gradient across the stream (shallow at
     // the bank edges), slow FLOWING highlights (soft light streaks moving along the flow direction — landscape: downwards,
     // portrait: left → right — speed ≈ 40 px/s), tiny sparkles, a soft wet shadow under the bank edges; winter ice rims.
     // Landscape: the brook narrows slightly towards the top and disappears under the far tree line (y ≈ play.y0 − 30).
     // opt = { quality 0.5..1, wind } — never re-allocate per frame (cache the gradient per size/season).
  NH.RiverArt.drawBanks(ctx, layout, season, opt)      // the near and far banks: grass with a rounded earth edge where they meet
     // the water (an organic wavy edge, a few pebbles), seeded decorations (bushes, reeds, rocks, flowers from env/*) placed
     // away from Nim's home, the goal and the HUD / bubble; the far bank gets env/tree_<m> near the goal.
  NH.RiverArt.flowDir(layout)                          // {x, y} unit flow direction (floating leaves / petals use it)
  ```
- `tools/env_scenes.js`: composed scenes at 1556×720, 960×720, 720×1556 per season (with fake stones, a fake Nim box) +
  seam test into `docs/art/`, and exports the `RECIPE` (layer heights, sky colours, sun position per season, tall-portrait
  background ×1.36 rule) that `render.js` copies verbatim.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `stone_art.js` (+ `tools/stone_sheet.js`, `tests/unit/stone_art.test.js`) | character artist B |
| `characters/*`, `icon.svg`, `nim_points.js` (+ `tools/art_nim.py`, `tools/nim_sheet.js`) | character artist A |
| `env/*`, `particles/*`, `river_art.js` (+ `tools/art_env.js`, `tools/env_scenes.js`) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, `tests/e2e/*` | integrator |
Script order: rng, i18n, content, nim_points, world, weather, bot, storage, assets, audio, voice, input, stone_art,
river_art, render, ui, main.

### 5.1 Content (`content.js` → `NH.Content`)
```
NH.PALETTE, NH.COLORS ['red','blue','yellow','green','orange','purple','pink'], NH.SHAPES, NH.OBJS ['flower','mushroom','leaf','ball','duck'],
NH.FRUITS ['apple','pear','strawberry','mushroom','acorn'],
NH.ANIMALS = { cow:'farm', pig:'farm', sheep:'farm', duck:'farm', hen:'farm', horse:'farm', goat:'farm',
               crab:'sea', fishbowl:'sea', penguin:'ice', lion:'savanna', monkey:'jungle' }
NH.AGE_TOPICS = { 3:['colors','shapes','size','animals'], 4:['colors','shapes','count','animals'],
  5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
NH.Content.makeRound(topic, { age, lang, rng, roundIndex, level, surprise, short }) → round   // pure, deterministic, self-checks
NH.Content.makeTalk(topic, { age, lang, rng }) → talk   // { promptKey, params, show: thing | null, choices:[{id, thing}], answer }
NH.Content.topicsFor(age, rng, lastTopics), NH.Content.ageOf(a), NH.Content.validate(round) → null | reason
round = { topic, age, lang, roundIndex, surprise: null|'fish'|'frog'|'snow', mode: 'match'|'countSeq'|'countSel',
  rows: [ [ { id, thing: { kind, color?, obj?, shape?, n?, animal?, home?, text?, big?, numeral?, nameKind, nameValue }, target: bool } ] ],
  k,                                   // number of rows (= hops on stones; every row has EXACTLY ONE target stone)
  fruit,                               // the reward on the far bank (NH.FRUITS, varies per round)
  promptKey, params,                   // e.g. 'p.colors' {color:'red'}
  rule: { kind, value } }              // what the targets share (countSeq: rule.kind 'seq', each row's target n = j+1)
```
- Rows (k) × stones per row (m): warm-up (round 0) k 2, m 2. Age 3: (2,2) (2,2) (3,2) (3,2); age 4: (2,2) (3,2) (3,3) (3,3)
  — level 0 of age 4: (2,2) (2,3) (3,2) (3,3); age 5: (3,2) (3,3) (3,3) (4,3); 6+: (3,3) (4,3) (4,3) (4,3). `short` rounds:
  k 2, m 2. Exactly ONE target per row; every other stone in that row clearly does NOT match (self-check); the target's
  position within a row is random (never the same index in every row of a round). Content varies every round; never the
  same round twice in a chapter; the target value changes every round in a chapter.
- `colors`: `obj` things; the targets share the colour (different objs at age ≥ 4; round 0: same obj everywhere). Each row's
  distractors use other colours (CVD-safe sets below age 5). `p.colors {color}` "Hop on the red ones!".
- `shapes`: `shape` things, one colour per round (varies), never similar pairs together (square/rect, circle/oval,
  square/diamond). `p.shapes {shape}`. Age 5 `p.shapes5`: mixed colours, the shape is the rule.
- `size` (age 3): the same obj, `big` true for targets, or the reverse (`p.size {big}`).
- `count`: rounds 0 and 2 → **`countSeq`**: row j's target is `dots n = j+1` with `numeral: true`; distractors are other
  numbers 1..(k+2) (never j+1; at age ≤ 4 differ by ≥ 1 and never equal j+2 in row j — the NEXT number would tempt to skip);
  `p.countSeq {n: k}` "Hop 1, 2, 3!". Events carry `count: j+1`. Rounds 1 and 3 → **`countSel`**: every row's target has
  `dots n = a` (age ≤ 4: a ∈ 2..5; age 5: 3–8; 6: 4–12), distractors differ by ≥ 2 at age ≤ 4, ≥ 1 at 5+ (≥ 2 when ≥ 6),
  `numeral: false`. `p.countSel {n: a}` "Hop on the stones with 4 dots!"; on landing the dots are counted aloud (event
  `count {i}` every 0.4 s).
- `animals`: `animal` things. Age 3 + every round 0: `p.animal {animal}` "Hop to the {animal}!" (the same animal is the target
  in every row; distractors other farm animals). Age ≥ 4 from round 1: `p.home {home}` "Who lives {home}? Hop on them!" —
  each row's target lives in that home; the home is farm or one with enough animals (sea, max 2 rows → k ≤ 2 then; the
  others max 1 row: so for ice / savanna / jungle use the `p.home` only in a k-row round if k distinct animals exist, else farm);
  distractors from 2 other homes at age 4, 3 at 5. Landing on an animal shows its home badge (event `homeBadge`).
- `letters` (5, capitals): `tile`, targets = one letter, distractors not look-alike (avoid E/F, O/Q/C/G, M/N/W, P/R/B, I/L/T, U/V).
  `p.letters {letter}`. `lower` (6): rows alternate the letter's capital and small form as target ("A" then "a"), distractors
  other letters; drop l/I; no b/d/p/q together. `p.lower {letter}`.
- `initial` (6–7): animal or obj things whose names (in THAT language, i18n `name()` first letter, ignoring diacritics and the
  VI classifier "con/cái/quả/chiếc/cây/bông") start with the letter. `p.initial {letter}`.
- `add` / `sub` (6–7): tiles "2+3", targets equal n. `p.add {n}` "Hop on the ones that make {n}!". `oddeven` (7): number
  tiles, `p.oddeven {parity}`.
- Talk time (`makeTalk`): as the bubble game (colour blobs; shape choices; count → show a `dots` thing "How many dots?"
  number choices; animals → "Where does the {animal} live?" home badges; age 3 "Who is this?"). 2 choices at age 3, 3 at 4+.

### 5.2 `NH.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s; `_p*` previous values + `alpha` for interpolation)
Public API as the bubble game: `setViewport(W,H,ins), setAge, setLang, newSession({lastTopics}), levels, startLevel(i),
update(dt), drainEvents(), pointerDown/Move/Up(x,y), cancelDrag(), hint(), talkAnswer(id), prompt(), resetNudges(), skipTalk(),
layout, hudKeep, state, phase, level, topic, round, roundsPerLevel, stars, levelStars, roundStars, misses, talk, alpha,
stateTime, phaseTime, interactive, weather (= level % 4), cur (the round), stones, row (index of the active row; k = on the
far bank), nim, fruitsOnBack, fish, frog, snowflakes, drops, ripples, hintHand, wipe, stoneById(id), answer(), targets()`.
States `intro | round | roundDone | talk | levelDone | sessionDone`. Phases in a round: `'rise' | 'play' | 'bank' | 'wipe'`.
- **Stones** `{ id, row, i, thing, target, x, y (top-centre of the top face, with motion), hx, hy, seed, state
  'hidden'|'rise'|'rest'|'sink'|'gone', riseT, dip (spring: how deep it is pushed into the water, 0 rest), dipV, tilt,
  tiltV, bob (idle phase), gold 0..1, glow 0..1, alpha, thingHop (the thing's own small hop / wiggle offset), wig, wigV }`.
  Physics: `dip` and `tilt` are damped springs (dip ω ≈ 11, ζ ≈ 0.22; tilt ω ≈ 9, ζ ≈ 0.18); resting stones bob ±2 px with
  the water (per-stone phase, 0.4–0.6 Hz). In autumn gusts tilt them a little (≤ 0.03 rad).
- **rise** (≈ 0.4 s lead + 0.18 s per stone, row by row from the near bank): each stone rises from below the waterline
  (`riseT` 0 → 1 in 0.45 s, overshoot 8 px up then settle via `dip` spring), event `rise {id, x, y}` (a splash +
  3 droplets, a ripple). After the last + 0.35 s → `ask {promptKey, params, first}` → `play`. The fruit appears on the far
  bank with a little bounce at the start of rise (`w.fruit = {kind, x, y, s, state 'wait'|'stick', t}`).
- **Nim** `w.nim = { x, y (feet), _px, _py, state 'stand'|'crouch'|'air'|'land'|'roll'|'walk', mood idle|talk|happy|cheer|
  think|oops|wave|giggle|dance, moodT, blink, sx, sy (squash/stretch scale), face 1, onRow (−1 near bank, 0..k−1, k far
  bank), lean (rad, spring), rollRot, fruits: [kind…] (on his back this chapter, max 4 shown) }`.
- **play** — one active pointer, judged on `pointerDown` (hit test) while Nim is standing (`state 'stand'`; a tap while he is
  in the air is queued for ≤ 0.35 s, else ignored → no miss).
  - a stone in the **active row** that is the target → **right**: event `right {id, thing, x, y, row, k, left (rows left),
    home?, count? (countSeq: row+1)}`; Nim **crouch** 0.12 s (sy 0.84, sx 1.1) → **air**: ballistic arc from his feet to the
    stone top (duration 0.46 s, apex ≥ 70 px above the higher end, true parabola in time: constant velocity along the line,
    gravity-shaped height; stretch sy 1.12 while rising) → **land** (event `land {id, x, y, row}`): squash sy 0.8 → spring
    back (ω 16, ζ 0.35); the stone gets `dipV` +160 px/s and a small tilt kick towards the hop direction; ripples (2 rings,
    0.9 s) + 8 droplets (gravity 900, life 0.5 s) → event `splash {x, y, big:false}`. The thing hops up 20 px with a twinkle
    and fades to sparkles over 0.5 s (event `thingAway {id}`); the stone turns golden (`gold` → 1 in 0.4 s). The other stones
    of that row `sink` (0.6 s, with a ripple each). countSel: dots are counted on landing (`count {i, x, y}` every 0.4 s, the
    thing stays until the run is done). animals: event `homeBadge {home, x, y}`, the badge hovers 1 s. Then `row++`; if
    `row == k` Nim hops onto the far bank automatically after 0.35 s (a plain hop, `land` on the bank with event
    `bankLand {x, y}`) → phase `bank`.
  - a non-target stone in the active row → **wrong** `{id, got:{nameKind,nameValue}, want:{rule}, streak, x, y}`: the stone
    wobbles (tilt kick ±0.14 rad, dip +90 px/s), a small ripple, the thing does a "no-no" wiggle (wig kick 0.3), Nim mood
    `oops` and leans towards it. Counts as a miss; the same stone again within 1 s is not a new miss (`squish` event only).
  - a stone in a **later row** → `ahead {id, x, y}` (a small ripple, the stone bobs; NOT a miss; main says "One at a time!"
    ≤ once per 6 s). A sunk / golden stone → `soft`.
  - press on water / bank / nothing → `soft {x, y}` + 1 ripple if on water; 3 soft → hint, 6 → assist (the target of the
    active row glows big and the next press anywhere in the river picks it). Press on Nim → `pokeNim` (giggle, a little hop
    in place; never a miss).
  - After 2 misses or `hint()`: `hint {id}` — the active row's target glows, the ghost hand moves to it and taps twice
    (`w.hintHand = {x, y, t, press, alpha, id}`); cooldown 6 s; idle nudges after 12 s, backoff ×1.5 up to 30 s
    (`idle {n}`; the 2nd idle also hints). The active row's stones get `active` 1 (a soft ring on the water); others 0.
- **bank** (≈ 2.2 s): Nim walks 2 small hops to the fruit, `roll` (curl 0.25 s, event `curl`), rolls over the fruit
  (`rollRot` spins, he moves 90 px over 0.5 s) → the fruit flies onto a free back slot (event `stick {fruit, x, y}`) →
  uncurl (event `uncurl`), mood `cheer`; then `roundDone {round, stars, misses, x, y}` (stars 3/2/1 for 0/1/≥ 2 misses;
  assisted ≤ 2; x, y = above Nim's head).
- **wipe** (≈ 1.3 s): event `wipe {season}`; `w.wipe = {t 0..1, dir}` — the renderer sweeps a curtain of seasonal particles
  across; at t = 0.5 (screen covered) the world swaps: next round's stones (hidden), Nim back at `nimHome` (state 'stand'),
  golden stones gone. Then the next round's `rise`, or Talk time after round 4 / once the chapter passed 75 s with ≥ 3 rounds
  done (Talk time comes after the wipe's first half; the scene behind it is the new empty crossing).
- `interactive` = state 'round' && phase 'play' && Nim standing (or a queued tap allowed).
- Surprises (one round per chapter, rotating, never in the warm-up): chapters 0–2 rotate **fish** / **frog**, chapter 3
  (winter) **snow**:
  - fish: 2–5 s after the ask it leaps out of the water between two rows (an arc of 1.2 s, apex 120 px, splash in and out,
    event `fish`), 2 leaps; tap → `fishTap` (a flip + sparkle splash). `w.fish = {x, y, rot, flip 0..1, state, t}`.
  - frog: sits on a lily pad drifting slowly along the flow at the river's downstream side (never on a stone, never over the
    active row's stones — keep ≥ hitR + 30 from every stone), stays ~10 s, `frog` event; tap → `frogTap` (croak, a hop to
    another spot on its pad). `w.frog = {x, y, padRot, croak 0..1, state, t}`.
  - snow: 5 big snowflakes drift down (`w.snowflakes[] = {x, y, r, rot, a, state}`, event `snow`); tap → `snowTap {x, y}`.
- Water bits: `w.ripples[] = {x, y, r, life, t, a}` (cap 40), `w.drops[] = {x, y, vx, vy, r, life, t}` (cap 60).
- Events also: `level {level, topic, weather}`, `round {round, surprise}`, `gust {dir}` (autumn), `talk`, `talkAsk {n}`,
  `talkResult`, `levelDone`, `sessionDone {stars}`, `hop {from, to}` (on take-off). Every positional event carries `x, y`.
- Rotation / resize mid-round: re-layout, new homes for the same stones (they glide there in 0.3 s), Nim snaps to his stone /
  bank point, a hop in flight finishes at the new target point, everything clamped into the screen.

### 5.3 `NH.Weather` — `setWeather(i, {instant})` (0 spring, 1 summer, 2 autumn, 3 winter; crossfade 2.5 s), `resize(W,H,layout)`,
`update(dt)`, `wind` (autumn gusts every 6–10 s ±40 for 1.5 s with event `gust`), `ambient` (`skyTop, skyBottom, tint, light,
sunX, sunY, sunA, mood`), `clouds[]`, `particles[]`: spring petals + blossoms + butterflies, summer glints + motes +
**dragonflies** (2–3, darting in hover-dash patterns above the water), autumn leaves (some land on the water and **float
along `RiverArt.flowDir`** for a while, with a tiny ripple), winter snow. `flowDir` / `river` rect come from the layout
passed to `resize`. `burst(x, y, {kind: 'stars'|'sparkle'|'confetti'|'petals'|'leaves', n})`, `setParty(on)`,
`wipeParticles(dir)` (a dense sweep of ≈ 60 seasonal particles for the wipe). Cap 120 (+60 during a wipe).

### 5.4 `NH.Bot` — taps through `world.pointerDown/Up`: the active row's target with p = skill (else a random non-target in
that row), aim error ±0.3 × hitR at the stone's current position, human-ish delays (0.6–2.0 s) after `ask` and after each
`land`; answers Talk right with p = skill; taps surprises sometimes.

### 5.5 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved); `window.NH.debug = { world, weather, mode, stats, events, getState(), setSpeed(n), startGame(), goTitle(),
setBot(on, skill), setAutoRestart(on), gotoLevel(i), voiceLog, stoneScreen(id) → {x,y,r} CSS px, nimScreen(), fishScreen(),
frogScreen(), snowScreen(), answer() → {stone id} | null, targets() → [ids], toScreen(x,y), audio() }`.
World supplies `stoneHit(id)` {x,y,r}, `nimHit()` box, `fishHit()`, `frogHit()`, `snowHit()` (circles or null), `answer()`
(the active row's target id), `targets()`.

## 6. Voice, language — as the bubble game §6 with helper **Nim** (EN "Nim", VI "Nhím Nim" in titles, "Nim" in lines), a
cheerful little hedgehog: pitch ≈ 1.2, rate ≈ 0.9. Things (VI): flower "bông hoa", mushroom "cây nấm", leaf "chiếc lá", ball
"quả bóng", duck "con vịt cao su", shape "hình …" (hình tròn, hình vuông, hình tam giác, ngôi sao, trái tim, hình chữ nhật,
hình thoi, hình bầu dục), dots "chấm", stone "hòn đá", river "con suối"; fruits: apple "quả táo", pear "quả lê", strawberry
"quả dâu tây", mushroom "cây nấm", acorn "hạt dẻ"; animals "con bò, con heo, con cừu, con vịt, con gà mái, con ngựa, con dê,
con cua, bể cá vàng, chim cánh cụt, sư tử, con khỉ"; homes: farm "nông trại", sea "biển", ice "xứ băng", savanna "đồng cỏ
châu Phi", jungle "rừng rậm". Seasons: "mùa xuân, mùa hè, mùa thu, mùa đông".
`I18N` API used by main (all `(lang, e)` → string):
- `ask(lang, promptKey, params, {first})` — 3 wordings each; `first` only in a chapter's round 0 ("Let's cross the brook! Hop
  on the RED stones!"); `p.colors` "Hop on the red ones!" / "Bé nhảy lên những hòn đá màu đỏ nhé!"; `p.countSeq` "Hop 1, 2, 3!"
  (lists 1..n); `p.countSel` "Hop on the stones with {n} dots!"; `p.animal` "Hop to the {animal}!"; `p.home` "Who lives {on the
  farm|…}? Hop on them!"; `p.size`, `p.shapes`, `p.shapes5`, `p.letters`, `p.lower`, `p.initial`, `p.add`, `p.sub`, `p.oddeven`.
- `sayRight(lang, e)` — names the thing ("A red flower!" / "Bông hoa màu đỏ!") + `left > 0` → "Next one!" / "Hòn tiếp theo
  nào!" (varied, short), `left == 0` → "Last hop to the bank!" variants; countSeq → the numeral word ("Three!"); animals with
  home: "The penguin lives on the ice!". `sayCount(lang, i)` ("One!", "Một!"), `sayCountRun(lang, n, kind)` ("Four dots!").
- `sayWrong(lang, e)` — names it, then the goal ("That's a blue mushroom. Find a red one!" / "Đây là cây nấm màu xanh dương.
  Mình tìm cái màu đỏ nhé!"); countSeq: "That's 4. Which one is 2?"; never negative words. `sayWrongHint(lang, e)` as before.
- `sayName(lang, thing)`, `talkWrong(lang, answer)`, `sayFruit(lang, fruit)` ("Yum, an apple!" / "Ôi, quả táo!").
- Keys: `hint[]`, `idle[]`, `praise[]`, `great[]` with `{child}`, `ahead[]` ("One at a time!" / "Từng hòn một thôi bé ơi!"),
  `bank[]` ("We crossed the brook!" / "Qua suối rồi!"), `rise[]` (rare: "Look, stepping stones!"), `talk.*`, `weather.0..3`
  ("Spring by the brook!", "Sunny summer!", "Windy autumn!", "Snowy winter!"), `surprise.fish`, `fish.tap`, `surprise.frog`,
  `frog.tap`, `surprise.snow`, `snow.tap`, `poke[]` (Nim giggles), `topic.*`, `session.done`, `party`, `ui.*` incl.
  `ui.volume`, logo lines "Nim's" / "River Hop", VI "Nhím Nim" / "Nhảy Đá Qua Suối"; `ui.voice` "Nim's voice" / "Giọng của Nim".

## 7. Integration — title (Nim waving with an apple on his back, a brook flowing behind the logo, ▶ Play, star total,
language toggle, hold-⚙), settings with volume, HUD, speech bubble, pause with −/+, chapter banner, Talk time, session done
(Nim dances with his fruits, fireflies / confetti, golden stones glow). Render order: sky → sun → clouds → far → mid →
back particles → river (water, flow streaks) → ripples (under stones) → banks + decorations → far-bank tree + fruit →
stones back-to-front (by y): stone → its thing → golden glow / hint glow → frog + lily pad → fish (when above the water;
below it a shadow) → Nim (+ fruits on his back; drawn after the stone he stands on, before stones in front of him) → drops
→ snowflakes → hint hand → front particles → fx → wipe curtain → banner. Audio: rise splash (soft "plop" + bubbles), hop
(springy "boing", pitch up), land (wooden-stone "tok" + water "plip"), ripple shimmer, wrong (soft "blub-wobble", low), ahead
(tiny bloop), soft tap (water "plink"), count pip rising, curl ("whirr"), stick (soft "pomf" + crunch), uncurl ("ta-da"
sparkle), wipe (airy whoosh), gust, fish splash, frog croak, snow twinkle, ambience = brook flow (filtered noise, gentle) +
per season (spring birds, summer insects, autumn wind, winter soft chimes), music bed per season (kalimba / marimba plucks,
ducked under speech).

## 8. Performance — ≤ 12 stones, stones cached per (size bucket, seed, snow) as offscreen bitmaps (dip/tilt applied by
transform; gold/glow as overlays), things cached per thing+size, the river gradient cached per size/season, ≤ 120 particles,
≤ 60 drops, ≤ 40 ripples; adaptive quality as before.
