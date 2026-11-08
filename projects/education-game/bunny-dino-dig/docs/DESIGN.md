# Bun's Dino Dig — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.DD`**. Classic `<script>` files, no build step, node-safe at load
(touch the DOM lazily). The code base is a copy of `../turtle-sea-paint/` (state machine, voice, input, storage, loud audio
with volume, ui, main, tests) with `SP → DD` and storage prefix `dd:` already replaced. **The paint world is replaced by a
dig world.** When a detail is missing here, do what `../turtle-sea-paint/docs/DESIGN.md` / `MECHANICS.md` / `VOICE.md` do
(i18n / voice API, hooks, Talk time, chapter-topic rotation between sessions, idle auto-pause, CONFIG style, hint cooldown
/ idle backoff, prompt protection). `../fox-camp-hide-seek/game/js/world.js` is a good reference for clipped "peeking"
things. Target: iPhone + iPad Safari first, portrait and landscape.

## 1. What changes versus Nini's Sea Painting
| Nini's Sea Painting | Bun's Dino Dig |
|---|---|
| tap a paint shell, tap a part of a line drawing | **tap a sand mound to dig** (each tap = one shovel scoop; one tap is enough, the shovel keeps going; more taps dig faster) |
| Nini the turtle beside a canvas | **Bun** (`bun`), a bunny explorer in a khaki explorer hat with a satchel, bottom-left, watching / cheering |
| seabed, seasons | **dinosaur valley dig site**, **morning → noon → sunset → starry night** (fireflies, moon) |
| picture comes alive | the found thing **pops out of the hole**; a right egg **hatches a baby dino**; things hop in an arc onto the **treasure shelf** |

## 2. Screen and layout
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
  Screen space = world space (no camera), y down. `ins` = safe-area insets in logical px.
- `World.setViewport(W, H, ins)` computes `layout`:
  ```
  layout = { W, H, ins, portrait, tall /* H/W > 1.6 */,
    groundY,          // bottom of the dig site: H - ins.bottom - (portrait ? 26 : 14)
    bubble: {x,y,w,h},// landscape: x = ins.left + 24, y = ins.top + 18, w = min(560, W - ins.right - 200 - x), h = 122
                      // portrait:  x = ins.left + 24, y = ins.top + 110, w = W - x - ins.right - 24, h = 124
    hud: {x,y,w,h},   // top-right keep-out: x > W - ins.right - 160, y < ins.top + 96
    shelf: { x, y, w, h, slots: [{x, y}], size },
                      // the wooden treasure shelf (a plank on two little posts). Landscape: x = ins.left + 24,
                      // y = ins.top + 152, w = W - ins.left - ins.right - 48, h = 92; portrait: under the bubble
                      // (y = bubble.y + bubble.h + 14). Up to 12 slots centred on the plank, item display size 64
                      // (slot spacing 76; when 12 do not fit, spacing shrinks to w / 12). slot (x, y) = bottom centre of the
                      // item standing on the plank top (plank top = shelf.y + h − 30).
    bun: { x, y, h }, // FEET point and height: landscape x = ins.left + 118, y = groundY − 4, h = 230;
                      // portrait x = ins.left + 104, y = groundY − 4, h = 200. Bun must not cover any mound.
    field: { x0, x1, y0, y1 },   // the rectangle mound bottoms may use (see placement)
    item: 110          // base thing size (px, the thing's height ≈ width): ages ≤ 4: 112, 5: 104, 6+: 96; ×1.15 when tall
  }
  ```
- **Mound placement** (world, deterministic per round): rows of mounds; `mound.y` = bottom centre on the ground. Landscape:
  field x0 = ins.left + 250, x1 = W − ins.right − 30, rows bottom-up at y = groundY − 18, then −170 each row (max 2 rows,
  the back row ≥ shelf bottom + item + 40). Portrait: x0 = ins.left + 30, x1 = W − ins.right − 30, rows from the bottom with
  170 spacing up to 4 rows; the front row starts right of Bun (x0 = ins.left + 220). Within a row spread evenly with a
  small deterministic jitter (±14 px x, ±8 px y), mound centres ≥ 1.45 × item apart. Rows farther back draw first. Back
  rows are NOT scaled smaller (touch targets stay big).
- Mound hit test: an ellipse around the mound and its peeking thing: centre (x, y − 0.45 × item), rx = 0.6 × mound.w/2 + 14
  … use `hit radius = 0.6 × size + 14` with size = mound width (≈ 1.55 × item), plus the visible thing box. Nearest centre
  wins when two overlap. Nothing the child must touch under the HUD, the bubble or the shelf.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand (no Peter Rabbit, Bugs Bunny,
  Miffy, Judy Hopps, no Land Before Time / Dinosaur Train / Barney / Jurassic Park looks). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox
  256) in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark/light)**: red `#E84A4A/#A8282E/#F7A0A0`, blue `#3C8DE8/#1F5BA8/#A6CCF5`,
  yellow `#FFD23F/#C99A12/#FFEB9C`, green `#4CC26B/#2A8343/#A8E6B8`, orange `#FF9A2E/#C4650C/#FFCB8E`,
  purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2` (pink from age 5). `DD.PALETTE` in `content.js`.
  Below age 5 never blue+purple, red+green, yellow+orange, green+orange in one round.
- **Sand** (mounds, holes, flung sand): mound `#E9CF9A` (shade `#CFAE72`, outline `#A9834A`, highlight `#F6E3B9`), hole
  inside `#8E6A3E` → `#5E4426`. Sand is warm beige, clearly not answer yellow/orange.
- **Bun**: a round chubby bunny, fur **warm cream `#F4ECDF`** (shade `#DCCDB6`, outline `#9C8A70`), inner ears and nose
  soft blush `#F2C1BC` (pastel, NOT answer pink), big round eyes (`#2F2A3A` pupils, catch-light), rosy cheeks `#F6B1A0`,
  long ears (one slightly bent), **khaki explorer hat `#C9B48A`** (band `#7D6A4A`), a little brown satchel `#9A6B43`.
  Never wears an answer colour.
- **Dinosaur valley**: calm and slightly desaturated so answer colours pop: distant hills/mountains with a gently smoking
  volcano and a **friendly long-neck dinosaur silhouette** (original), mid layer of ferns, cycads, palm trees and rocks,
  ground = a sandy dig site with a few pebbles, a rope and little flags at the edges (muted). Moods
  (`morning | noon | sunset | night`):
  morning: sky `#BFE6F2 → #FBE9C9`, soft mist, pale sun low left; noon: sky `#7CC7EE → #CDEBF6`, bright, puffy clouds;
  sunset: sky `#F6A86B → #F9D7A0` with lilac top `#B98BB5`, long warm light, silhouettes darker; night: sky
  `#1F2A55 → #3E4C7E`, moon, stars, fireflies, valley in blue-grey with soft rim light (mounds still readable: render adds
  a warm lantern glow over the field at night).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Bun, surprises & icon — character artist A
| File | viewBox | Notes |
|---|---|---|
| `characters/bun_{idle,blink,talk,happy,cheer,think,oops,wave,point,dig}.svg` | 0 0 300 300 | Bun 3/4 view facing RIGHT (towards the dig site) but eyes on the child, **feet anchor (150, 292)**, identical body in every frame; happy = big smile; cheer = both arms up, eyes ^^, ears up; think = head tilt, paw on chin; oops = "hmm?" (never sad); talk = mouth open; wave = one paw high; point = right paw pointing right/up-right (towards the field); dig = holding a small trowel-free pose with paws together forward (excited "dig dig!"). Bun holds no tool in the SVGs |
| `characters/bun_full_wave.svg` | 0 0 300 300 | title pose (waving, holding a little magnifying glass in the other paw) |
| `characters/mole.svg`, `characters/mole_happy.svg` | 0 0 160 140 | a cute mole (soft grey-brown `#8F7E74`, pink nose `#F2B8B0`, big round glasses-free eyes) popping out of a little dirt ring, bottom anchor (80, 136); happy = eyes ^^ |
| `characters/ptero.svg`, `characters/ptero_flap.svg` | 0 0 200 140 | a baby pterosaur (soft teal-grey `#7FB2B0` — NOT answer green/blue, cream belly), wings up / wings down, facing RIGHT, centre anchor |
| `characters/dino_baby_{red,blue,yellow,green,orange,purple,pink}.svg` | 0 0 160 160 | the hatchling: a round baby dinosaur (small horns or back spikes, big eyes, tiny arms) in that answer colour (base/dark/light from the palette), standing, bottom anchor (80, 156), facing RIGHT; identical body across colours |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | Bun holding up a speckled egg with a baby dino peeking out, sand mound, full-bleed valley background |

### 4.2 Dig art (canvas code) — character artist B: `game/js/dig_art.js` → `DD.DigArt`
Pure canvas drawing (Path2D, cache paths), node-safe at load. Origins and sizes are in logical px; the caller sets the
transform. All things share the same anchor: **origin = bottom centre**, `size` = the thing's height.
```
DD.DigArt.drawThing(ctx, thing, size, opt)
  // thing = { kind, color?, shape?, animal?, text?, size? }  opt = { wob (px), glow 0..1, dim 0..1, night 0..1, crack 0..1 }
  //  kind 'egg'    : a speckled dinosaur egg in thing.color (base/dark/light), width ≈ 0.78 size; crack 0..1 draws a zig-zag
  //                   crack line growing around its middle (for the hatch)
  //  kind 'eggTop' / 'eggBottom' : the two shell halves after hatching (jagged edge), same size reference
  //  kind 'stone'  : a chunky fossil stone in thing.shape (DD.SHAPES = circle, square, triangle, star, heart, rect,
  //                   diamond, oval) filled thing.color with a carved rim and a tiny ammonite swirl — the silhouette IS
  //                   the shape (readable from the top 40 %); rect is clearly wider than tall (1.5:1), oval taller (1:1.35)
  //  kind 'bone'   : a cream dinosaur bone `#F3E6C8` (outline `#A8946A`) standing at a slight tilt; thing.size big|small
  //                   is handled by the caller via `size`
  //  kind 'toy'    : a painted wooden toy figurine of thing.animal (DD.ANIMALS = duck, cat, dog, cow, pig, frog, lion,
  //                   elephant) — standing, head on top, recognisable from the top 45 % (head + ears), on a small round base;
  //                   own colours per animal (duck yellow-ish is fine: toys are not colour answers; keep them distinct)
  //  kind 'tablet' : a rounded stone tablet (grey-beige `#CFC6B4`, outline `#8A8070`) with thing.text carved big in the
  //                   upper half (dark `#4A4237` with a light bevel), readable when only the top 60 % shows
DD.DigArt.thingBox(thing, size) → { w, h }        // visible bounding box (for hit tests and the shelf)
DD.DigArt.drawMound(ctx, mound, opt)              // origin = mound bottom centre. mound.w = width, mound.h0 = full height,
  //   mound.dig 0..1: 0 = a full rounded sand heap (width w, height h0, a slightly flat top where the thing peeks out),
  //   as dig grows the heap lowers and becomes a ring of loose sand around a hole (hole ellipse w × 0.55, h 0.16 w) with
  //   heaped rims left and right; dig 1 = the open hole with rims. opt = { glow 0..1 (soft gold rim + pulse), wob (px),
  //   pop 0..1 (appear scale with back-overshoot by caller is fine), night 0..1 (darker, bluish), sparkle 0..1 }
DD.DigArt.drawHoleBack(ctx, mound, opt)           // the dark back of the hole (drawn BEFORE the thing), only when dig > 0.3
DD.DigArt.drawShovel(ctx, angle, size, opt)       // a kid's spade (wooden handle, rounded steel-grey blade `#B9C3CC`,
  //   NOT an answer colour), origin = blade tip, angle 0 = blade pointing down; opt { sand 0..1 (a scoop of sand on it) }
DD.DigArt.drawSandBit(ctx, r, rot, opt)           // one flung sand clump (for particles), origin = centre
DD.DigArt.drawShelf(ctx, shelf, opt)              // the wooden plank shelf with two posts and a little flag (muted), box = layout.shelf
DD.DigArt.drawIcon(ctx, thing, size)              // Talk time / previews, origin = CENTRE: thing.kind 'egg' {color} | 'blob' {color}
  //   | 'stone' {shape,color} | 'toy' {animal} | 'bone' {} | 'number' {n} | 'letter' {text} | 'dots' {n} (n bone icons in
  //   a tidy grid) | 'size' {size, kind:'bone'|'egg'} | 'dino' {color}
DD.DigArt.drawGhostHand(ctx, size, t)             // friendly pointing hand (hint), origin = fingertip, t = 0..1 tap animation
```
The hatchling uses the SVG `characters/dino_baby_<color>.svg` (render draws it). Contact sheets (`tools/dig_sheet.js` →
`docs/art/dig_*.png`): every thing kind × colour/shape/animal at in-game size and 3×, mounds at dig 0 / 0.33 / 0.66 / 1
with a thing peeking (clipped as in §5.2), on morning / noon / sunset / night ground.

### 4.3 Environment — environment artist
For `m ∈ morning|noon|sunset|night`:
- `env/far_<m>.svg` (0 0 1200 720): distant hills/mountains, the volcano (soft smoke puff), a long-neck dino silhouette,
  bottom-anchored, horizontally tileable (seam at 0/1200), transparent top (the render paints the sky gradient). Put the sky
  colours in a comment `<!-- sky #top #bottom -->`.
- `env/mid_<m>.svg` (0 0 1200 300): ferns, cycads, palms, rocks (muted), bottom-anchored, tileable.
- `env/ground_<m>.svg` (0 0 1200 260): the sandy dig site: smooth sand `#E6CC98`-ish (darker / bluish at night), soft
  footprints, pebbles, rope posts with little pennants at the far edge; tileable; the top 40 px is a soft grass/sand edge.
- `env/sun.svg` (0 0 200 200), `env/moon.svg` (0 0 200 200), `env/cloud_a.svg`, `env/cloud_b.svg` (0 0 300 140),
  `env/smoke.svg` (0 0 120 120, soft puff, white).
- Particles (0 0 32 32): `sand` (a sand clump), `dust` (soft round puff), `leaf_a`, `leaf_b` (fern bits), `sparkle`,
  `star` (twinkle), `firefly` (warm glowing dot), `mote` (morning light mote), `confetti_a`, `confetti_b`, `dot` (white,
  tinted by code), `feather` (tiny, for the pterosaur).
- `tools/env_scenes.js` recipe + composed scenes at 1556×720, 960×720, 720×1556 per mood + seam test into `docs/art/`
  (sky gradient → sun/moon → clouds → far → mid → ground; the ground fills down to the bottom with its bottom colour).
  Export the recipe constants (layer heights in logical px for H=720 landscape and portrait scaling, sky colours, sun /
  moon positions) as `tools/env_scenes.js` `RECIPE` so the renderer copies them.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `dig_art.js` (+ `tools/dig_sheet.js`) | character artist B |
| `characters/*`, `icon.svg` (+ `tools/art_bun.py` or `.js`) | character artist A |
| `env/*`, `particles/*` (+ `tools/art_env.js`, `tools/env_scenes.js`) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, `tests/e2e/smoke.js` | lead |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, dig_art, render, ui, main.

### 5.1 Content (`content.js` → `DD.Content`)
```
DD.PALETTE (as §3, {red:{base,dark,light}, …}), DD.COLORS order ['red','blue','yellow','green','orange','purple','pink'],
DD.SHAPES, DD.ANIMALS, DD.AGE_TOPICS = { 3:['colors','shapes','size','animals'], 4:['colors','shapes','count','animals'],
  5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
DD.Content.makeRound(topic, { age, lang, rng, roundIndex, level, surprise }) → round   // pure, deterministic, self-checks
DD.Content.makeTalk(topic, { age, lang, rng }) → talk    // { promptKey, params, show: icon thing | null, choices:[{id, thing}], answer }
DD.Content.topicsFor(age, rng, lastTopics)
DD.Content.validate(round) → null | reason
round = { topic, age, lang, roundIndex, surprise: null|'mole'|'ptero',
  mounds: [ { id, thing: { kind, color?, shape?, animal?, text?, size?, nameKind, nameValue } } ],   // order = slot order
  scoops /* 2 at age 3, 3 otherwise */,
  steps: [ { mode: 'find' | 'count' | 'findAll',
             targets: [moundId]   // find: the ONE right mound; count: every mound holding the counted thing; findAll: all right ones
             need,                // find: 1; count: N; findAll: number of right mounds (oddeven)
             promptKey, params, nameKind, nameValue } ] }
```
- Mounds per round: warm-up (round 0) = 2 (age ≤ 4) / 3 (age 5+), one step. Later rounds: age 3: 2–3 mounds, 1–2 steps;
  age 4: 3–4 mounds, 1–2 steps; age 5: 4–5, 2 steps; age 6+: 4–6, 2 steps. Each step's target is a still-buried mound; no
  two mounds of a `find` round answer the same step (exactly one match per ask). Content varies every round; never the
  same set twice in a row.
- Easiest first: level 0 (the first chapter) keeps ≤ 3 mounds and 1 step per round up to age 4.
- `colors` (`find`): eggs in different colours ("Find the RED egg!"); age 3: 2 colours, 4: 3, 5+: 4. Thing kind `egg`;
  a right egg hatches.
- `shapes` age 3–4 (`find`): stones in different shapes, all the same random colour (age 3: circle/square/triangle/star/
  heart; 4: + oval, rect, diamond but never square+rect, circle+oval, square+diamond in one round). Age 5 (`find`, key
  `p.shapes5`): 4 stones mixing shapes and colours so the answer needs both ("Find the BLUE STAR": at least one other blue
  stone and one other star).
- `size` (age 3, `find`): two mounds with the same kind (bone or egg or toy), big (thing size ×1.25) and small (×0.72).
- `animals` (`find`): toys, 2 / 3 / 4 different animals (age 3 / 4 / 5+). "Where is the DUCK?".
- `count` (`count`): bones; N: round 0 1–2, round 1 2–3, later age 3–4: 3–5, age 5: 4–8, age 6–7: 5–10; mounds = N + 2
  (≤ 10); every mound holds a bone; each found bone counts aloud; when N are found the step is done (remaining mounds
  stay buried). Talk asks "How many bones?" with dots choices.
- `letters` (age 5, `find`, tablets with 3–4 capital letters), `lower` (target "small b": tablets show small letters,
  prompt shows the capital; drop `l`/`I`), `initial` (toys with distinct initials in that language; VI words without
  classifier: vịt, mèo, chó, bò, heo, ếch, sư tử, voi), `add` / `sub` (number tablets; target a + b / a − b; prompt
  shows "2 + 3"), `oddeven` (`findAll`: "Dig up all the ODD numbers!", need = number of odd tablets 2–3; wrong parity = a
  mistake).
- Prompt keys: `p.colors {color}`, `p.shapes {shape}`, `p.shapes5 {shape, color}`, `p.size {size, kind}`, `p.animals
  {animal}`, `p.count {n}`, `p.letters {letter}`, `p.lower {letter}`, `p.initial {letter}`, `p.add {a, b}`, `p.sub {a, b}`,
  `p.oddeven {parity}`; `p.next` is prefixed by main for a 2nd step ("Now…").

### 5.2 `DD.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s; `_p*` previous values + `alpha` for interpolation)
Public API as the paint game where it makes sense: `setViewport(W,H,ins), setAge, setLang, newSession({lastTopics}),
levels, startLevel(i), update(dt), drainEvents(), pointerDown/Move/Up(x,y), cancelDrag(), hint(), talkAnswer(id),
prompt(), resetNudges(), skipTalk(), layout, hudKeep, state, phase, level, topic, round, cur, step, stepInfo,
roundsPerLevel, stars, levelStars, roundStars, misses, talk, alpha, stateTime, phaseTime, tapMoveMin, interactive`.
States `intro | round | roundDone | talk | levelDone | sessionDone`.
- `w.phase` in a round: `'enter' | 'dig' | 'cheer' | 'clear'`.
  - **enter** (≈ 1.0 s): mounds pop up staggered 0.12 s apart (`pop` 0 → 1 back-overshoot, a sand puff event `puff
    {x, y}`), the clue things rise to their peek. Then event `ask {promptKey, params, mode, step, first}` → `dig`.
  - **dig**: input is a **tap** (down + up within 1.0 s and < 64 px move; handled at the release position; a long press or
    drag → `soft {}` and a tiny mound wobble, nothing dug). One dig at a time:
    - tap on a buried mound while no dig runs → `w.dig = { id, scoops: 0, need: round.scoops, t, queued: 0 }`, the shovel
      flies in from above (0.16 s) and scoops: each scoop takes `CONFIG.scoopTime` 0.34 s (shovel plunge 40 %, lift +
      fling 60 %), `mound.dig` steps up by 1/need with an ease, ~10 sand clumps fly in ballistic arcs (gravity 1400 px/s²,
      both sides, a few towards the camera), land, puff and fade; event `scoop {id, i, n, x, y}`. Further taps on the same
      mound queue one scoop each (max 2 queued) and shorten the scoop to `scoopFast` 0.22 s. No tap → the shovel keeps
      going by itself every `autoScoop` 0.55 s. A tap on ANOTHER mound while digging → ignored softly (`busy {}`, no line,
      not a mistake).
    - after the last scoop → `reveal {id, thing}`: the thing rises out of the hole (`rise` 0 → 1, 0.45 s, spring with a
      little overshoot and squash on stop), the shovel flies away.
    - judge: right → `found {id, thing, count?:{i,n}}` (count mode: i = bones found so far). Egg: **hatch** (0.9 s: wobble
      ×3, `crack` 0 → 1, `hatch {id, color}` — the shell halves pop apart, the baby dino jumps up and waves); then the thing
      (or the dino) **hops onto the shelf**: ballistic arc with apex 140 px above the higher end, spin ≤ 1 turn for stones /
      bones / tablets, landing squash at the next free `shelf.slots[k]`, scale to the shelf size → `shelved {id, slot}`.
      The mound is then `empty` (an open hole). Step done → `stepDone {step}` → next step `ask` after 0.6 s.
    - wrong → `wrong {id, kind:'thing', got:{nameKind,nameValue}, want:{nameKind,nameValue}, streak}`: the thing wiggles
      (damped ±8 px) and stays in its open hole (`state 'open'`, `dim` → 0.35 after 1 s). Tapping an `open` / `empty` mound
      → `already {id}` (not a mistake).
    - tap on Bun → `pokeBun` (main repeats the prompt). Tap on empty sand → a little dust puff (`sandTap {x,y}`), no line, not
      a mistake, but taps without progress count (2 → hint, 6 at ages ≤ 4 / 5 at ages 5+ → `assist`: the next tap on any
      mound digs the right one instead — the shovel goes there).
    - after 2 misses in a step, or `hint()`: `hint {id}` — the right mound glows, the ghost hand taps it (`w.hintHand = {x, y,
      t, alpha}`); cooldown 6 s; idle nudges after 12 s, backoff ×1.5 up to 30 s (`idle {n}`; the 2nd idle also hints).
  - **cheer** (≈ 1.4 s): Bun `cheer`, the shelf items bounce in a wave (`w.shelfItems[k].bounce`), event `roundDone {round,
    stars, misses}` at its start (3 / 2 / 1 stars for 0 / 1 / ≥ 2 misses).
  - **clear** (≈ 0.7 s): remaining mounds and holes sink / smooth over (`pop` → 0 with sand puffs), the shelf items slide
    off to the left into Bun's satchel (`w.shelfItems[k].leave` 0 → 1) only at the END of a chapter (they stay on the shelf
    across rounds of a chapter while slots remain; when the shelf is full, the oldest slide away). Next round or Talk time
    after round 4 / once the chapter passes 75 s with ≥ 3 rounds done.
- `w.mounds[]` = `{ id, x, y, w /* ≈ 1.55 item */, h0 /* ≈ 0.62 item */, row, thing, size /* thing height */, state
  'buried'|'digging'|'open'|'found'|'empty', dig 0..1, _pdig, rise 0..1, peek /* visible fraction at dig 0: egg 0.38,
  stone 0.42, toy 0.48, bone 0.40, tablet 0.62 (ages ≥ 5: ×0.85) */, thingY /* screen y of the thing's bottom centre */,
  _pthingY, clipY /* the thing is drawn clipped to y < clipY */, glow, wob, _pwob, pop, dim, crack, hatched, sparkle }`.
  Geometry: pileTop = y − h0·(1 − dig); buried: thingY = pileTop + size·(1 − peek), clipY = pileTop + 4; as `rise` goes to
  1 thingY → y − 0.12·h0 (standing on the hole rim) and clipY → y + 2 (whole thing visible). Render order per mound (back
  rows first): `drawHoleBack` → thing (clipped to y < clipY) → `drawMound` front → (when rise > 0.6 the thing is drawn
  again unclipped on top so it is never cut by the front rim).
- `w.shovel = { x, y, _px, _py, angle, _pangle, sand 0..1, alpha, state 'off'|'in'|'scoop'|'out' }`.
- `w.flying[]` (things/dinos hopping to the shelf) = `{ thing, x, y, _px, _py, rot, _prot, s, sx, sy, t, dino?: color }`;
  `w.shelfItems[]` = `{ thing, dino?, slot, x, y, s, bounce, leave }` (shelf size; render draws them on the plank).
- `w.sand[]` = flung clumps `{ x, y, _px, _py, vx, vy, r, rot, life, alpha }` (≤ 80).
- `w.bun = { mood idle|talk|happy|cheer|think|oops|wave|point|dig, moodT, blink, look, hop 0..1 (a happy hop) }`.
- Surprises (one round per chapter, rotating, never in the warm-up): **mole** — during `dig`, a mole pops out of a free
  sand spot in the field 3–8 s after the ask (`w.mole = {x, y, up 0..1, state 'up'|'happy'|'down', t}`, event `mole`), stays
  4 s; tap → `moleTap` (spins, giggles, sparkles; no score), then ducks; **ptero** — a baby pterosaur glides across the
  sky band between the shelf and the field top (`w.ptero = {x, y, _px, _py, dir, flap, loop 0..1, state}`, event `ptero`);
  tap → `pteroTap` (loop-the-loop, feathers; no score). A mound under the finger always wins over the surprise.
- Events also: `level {level, topic, weather}`, `round {round, surprise}`, `talk`, `talkAsk {n}`, `talkResult`, `levelDone`,
  `sessionDone {stars}`. Every positional event carries `x, y`.
- Rotation / resize mid-round: re-layout; mounds re-placed into the new field keeping their dig state; shelf items snap to
  their slots; flying things land instantly; the dig in progress continues.

### 5.3 `DD.Weather` — `setWeather(i, {instant})` (0 morning, 1 noon, 2 sunset, 3 night; crossfade 2.5 s), `resize(W,H,
groundY)`, `update(dt)`, `ambient` (`skyTop, skyBottom, tint (overlay rgba for the scene), light 0..1, night 0..1,
sunX, sunY (logical), moonA 0..1, sunA 0..1, mood`), `clouds[]` (`{type:'cloud_a'|'cloud_b', x, y, s, alpha}`, slow drift,
few at night), `particles[]` (`{type, x, y, r, rot, alpha, size}`): morning light motes + dew sparkles, noon a few
drifting fern bits, sunset motes in warm light, night fireflies (wander, blink) + twinkling stars in the sky band.
`addSand(x, y, n)` / `addDust(x, y, n)` / `burst(x, y, {kind, n})` for world events. `setParty(on)` (confetti). Cap 120.

### 5.4 `DD.Bot` — taps through `world.pointerDown/Up` at the right mound with p = skill (a wrong answer = a random other
buried mound); human-ish delays (1.0–2.4 s) after `ask` and between taps; sometimes taps the digging mound again to dig
faster; answers Talk right with p = skill; taps mole / ptero sometimes.

### 5.5 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved); `window.DD.debug = { world, weather, mode, stats, getState(), setSpeed(n), startGame(), goTitle(),
setBot(on, skill), setAutoRestart(on), gotoLevel(i), voiceLog, moundScreen(id) → {x,y,r} CSS px (a safe tap point),
bunScreen(), moleScreen(), pteroScreen(), answer() → {mound: id} (what to tap next), toScreen(x,y), audio() }`. World
supplies `moundTap(id)` (logical safe tap point, inside the hit area, clear of the HUD/bubble/shelf), `bunHit()` (box),
`moleHit()`, `pteroHit()` (circles), `answer()`.

## 6. Voice, language — as the paint game §6 with helper **Bun** (EN "Bun", VI "Thỏ Bun" in titles, "Bun" in lines), a
cheerful bunny explorer: pitch ≈ 1.2, rate ≈ 0.9. Things (VI with classifiers): egg "quả trứng", stone "hòn đá" (shape
stones: "hòn đá hình tam giác"), bone "khúc xương", toy animals "con vịt / con mèo / con chó / con bò / con heo / con ếch /
con sư tử / con voi", tablet "tấm đá chữ …", baby dino "khủng long con". Colours "màu đỏ / xanh dương / vàng / xanh lá / cam
/ tím / hồng". Shapes: hình tròn, hình vuông, hình tam giác, ngôi sao, trái tim, hình chữ nhật, hình thoi, hình bầu dục.
- Prompts (3 wordings each): `p.colors` "Find the {color} egg!" / "Bé ơi, tìm quả trứng màu {color} nhé!", `p.shapes`
  "Dig up the {shape}!", `p.shapes5` "Find the {color} {shape}!", `p.size` "Find the BIG bone!", `p.animals` "Where is the
  {animal}?", `p.count` "Dig up {n} bones!", letters/numbers as the paint game.
- `say.scoop` (first scoop only, rarely: "Dig, dig, dig!"), `say.found` per kind ("A red egg — it's hatching!", "The star
  stone!", "The duck!"), `hatch[]` ("Hello, baby dino!"), counting `count.<n>`, `wrong.thing[]` with `{got}` `{want}`
  ("That's a blue egg. Let's find the red one!"), `already[]`, `hint[]`, `idle[]`, `praise[]`, `great[]` with `{child}`,
  `talk.*`, `weather.0..3` ("Good morning, valley!", "Sunny noon!", "Sunset colours!", "Starry night — fireflies!"),
  `surprise.mole`, `mole.tap`, `surprise.ptero`, `ptero.tap`, `enter[]` ("New mounds!"), `topic.*`, `session.done`,
  `party`, `ui.*` incl. `ui.volume`, logo lines "Bun's" / "Dino Dig", VI "Thỏ Bun" / "Đào Kho Báu".

## 7. Integration (lead) — title (Bun waving with a magnifying glass beside a hatched egg and a baby dino, ▶ Play, star
total, language toggle, hold-⚙), settings with volume, HUD, bubble, pause with −/+, chapter banner, Talk time, session done
(every treasure of the session dances around Bun, confetti). Audio: shovel "chff" scoop (pitch steps per scoop), sand
patter, reveal "pop", egg crack + chirp, hop "boing-up" + shelf "clonk", count chimes, wrong "boing", already "pat", mole
squeak, ptero flutter, ambient birds (morning/noon), crickets (night), music per mood (marimba / ukulele-ish, ducked under
speech).

## 8. Performance — ≤ 10 mounds, Path2D cached per thing kind, ≤ 80 sand clumps + ≤ 120 particles; adaptive quality as before.
