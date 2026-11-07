# Nini's Sea Painting — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.SP`**. Classic `<script>` files, no build step, node-safe at load
(touch the DOM lazily). The code base is a copy of `../owl-toy-train/` (state machine, voice, input, storage, loud audio
with volume, ui, main, tests) with `TT → SP` and storage prefix `sp:` already replaced. **The train world is replaced by a
tap-to-paint world.** When a detail is missing here, do what `../owl-toy-train/docs/DESIGN.md` / `MECHANICS.md` do (i18n /
voice API, hooks, Talk time, chapter-topic rotation between sessions, idle auto-pause, CONFIG style, event names that still
make sense, hint cooldown / idle backoff). Target: iPhone + iPad Safari first, portrait and landscape.

## 1. What changes versus Momo's Toy Train
| Momo's Toy Train | Nini's Sea Painting |
|---|---|
| drag cargo into train cars | **tap** a paint shell (colour) and **tap** a part of a line drawing — the colour spreads inside its lines |
| Momo the owl in the engine cab | **Nini** (`nini`), a baby sea turtle in a cream painter's beret, beside the canvas, holding a brush |
| toy room, morning → night | **seabed painting studio**, seasons seen through the water: spring → summer → autumn → winter |
| whistle → train departs | the finished picture **comes alive** (swims / scuttles / sails / bobs off the canvas) |

## 2. Screen and layout
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
  Screen space = world space (no camera), y down. `ins` = safe-area insets in logical px.
- `World.setViewport(W, H, ins)` computes `layout`:
  ```
  layout = { W, H, ins, portrait, tall /* H/W > 1.6 */,
    groundY,      // seabed line: H - ins.bottom - (portrait ? 30 : 18)
    bubble: {x,y,w,h},  // landscape: x = ins.left + 24, y = ins.top + 18, w = min(560, W - ins.right - 200 - x), h = 122
                        // portrait: x = ins.left + 24, y = ins.top + 110, w = W - x - ins.right - 24, h = 124
    hud: {x,y,w,h},     // top-right keep-out: x > W - ins.right - 160, y < ins.top + 96
    canvas: { x, y, w, h, s },  // the painting board (a cream canvas in a shell frame). Pictures are authored in a
                        //   600 × 400 box; s = scale picture → screen; the drawn picture box is (x, y, 600 s, 400 s)
                        //   = canvas inner area. Landscape: right of Nini, between bubble bottom + 16 and palette top − 20,
                        //   w ≤ W − Nini column − margins; keep 3:2 (letterbox inside). Portrait: full width − 40, below the
                        //   bubble; tall portrait gets a larger s.
    palette: { y, slots:[{x, y, r}] },   // paint shells row under the canvas, centred on the canvas; shell radius r = 58
                        //   (≥ 116 px wide), gap ≥ 24; up to 5 slots (age 5+: 4–5 colours); hit radius = r + 18
    nini: { x, y, h },  // FEET point and height: landscape bottom-left (x = ins.left + 130, y = groundY - 6, h = 250);
                        //   portrait bottom-left beside the palette (h = 210). Nini must not cover the canvas or the palette.
    brush:  { x, y },   // resting brush tip position (Nini's right flipper + brush) — render draws the brush by code
  }
  ```
- Part hit test: in picture coordinates, the part's `hit` shape grown by `CONFIG.hitPad` (14 picture px) — ellipse or
  polygon; overlapping hits → the part with the smallest area wins (inner parts first). Nothing the child must touch under
  the HUD or the bubble.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand (no Crush/Squirt from Finding
  Nemo, no clownfish "Nemo" look, no Franklin, no Squirtle, no Sebastian the crab, no SpongeBob). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox
  256) in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark/light)**: red `#E84A4A/#A8282E/#F7A0A0`, blue `#3C8DE8/#1F5BA8/#A6CCF5`,
  yellow `#FFD23F/#C99A12/#FFEB9C`, green `#4CC26B/#2A8343/#A8E6B8`, orange `#FF9A2E/#C4650C/#FFCB8E`,
  purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2` (pink from age 5). `SP.PALETTE` in `content.js`.
  Below age 5 never blue+purple, red+green, yellow+orange, green+orange in one round.
- **Line drawings** (pictures): outline colour **`#33405E`** (deep navy), width 6 picture px (round joins); unpainted parts
  are filled `#FFFFFF` on the canvas `#FFF8EC`. Details (eyes, scales, mouth) are non-paintable deco strokes / small fills in
  navy / white. Painted fill = base colour + a soft light highlight band (upper-left) + a dark-tone shade (lower-right,
  ~18 % alpha), always clipped to the part.
- **Nini**: a small round baby sea turtle, shell **sea-foam teal `#5FB3B3`** (shade `#3F8E90`, outline `#2C6467`) with
  lighter scute patches `#9AD6CF`, skin warm sand `#F0CF98` (shade `#D3A96A`, outline `#8A6435`), cream belly `#FFF1DC`,
  big round eyes (white, `#2F2A3A` pupils, catch-light), pink cheeks `#F6B1A0`, a **cream painter's beret `#F4EBDD`** with
  a slate stalk `#7D8FA8`. Never wears an answer colour (the teal is grey-blue-green, clearly not answer green/blue).
- **Seabed studio**: calm, slightly desaturated so answer colours pop on the canvas: water gradient from the render
  (`ambient.waterTop → waterBottom`), distant reef silhouettes, kelp and coral in muted tones, warm sand `#EAD7AE`.
  Moods (`spring | summer | autumn | winter`):
  spring: water `#7FD3D8 → #2E8FA8`, soft pink coral, fresh sea grass, blossom petals floating at the surface;
  summer: water `#5CC8E8 → #1E78B4`, bright sun rays (god rays) and caustics, clear;
  autumn: water `#7CC0B8 → #2F6F86`, amber kelp, warmer light, orange leaves drifting down from the surface;
  winter: water `#A9D8EC → #3C6E9A`, an ice sheet along the top, pale frosty coral, snowflakes slowly sinking.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Nini & UI — character artist A
| File | viewBox | Notes |
|---|---|---|
| `characters/nini_{idle,blink,talk,happy,cheer,think,oops,wave,paint,point}.svg` | 0 0 300 300 | Nini 3/4 view facing RIGHT (towards the canvas) but eyes on the child, **feet anchor (150, 292)**, identical body in every frame; happy = big smile; cheer = flippers up, eyes ^^; think = head tilt, flipper on chin; oops = "hmm?" (never sad); talk = mouth open; wave = one flipper high; paint = right front flipper forward/up (brushing); point = right flipper pointing up-right (towards the canvas). The brush is NOT in the SVG: document the right-flipper "hand" point per frame (e.g. `HAND = {idle:[x,y], …}` in `docs/art/nini_hand.json`) — render draws the brush there |
| `characters/nini_full_wave.svg` | 0 0 300 300 | title pose (waving, beret on, holding a palette in the other flipper) |
| `characters/fishy.svg`, `characters/fishy_happy.svg` | 0 0 160 120 | a little friendly fish (soft lilac `#C9B6E4` with cream stripes — NOT orange/white clownfish), facing RIGHT, centre anchor; happy = eyes ^^ |
| `characters/clam.svg`, `characters/clam_open.svg`, `characters/pearl.svg` | 0 0 160 140 (pearl 0 0 64 64) | a clam (sandy pink-grey `#E4C9C2`) bottom anchor (80, 136); open = lid up with a glowing spot |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | Nini with her brush beside a half-painted fish on a canvas, full-bleed sea background |

### 4.2 Pictures & paint art — character artist B
- **`game/js/pictures.js`** → `SP.Pictures` (pure data + pure functions, node-safe, no DOM):
  ```
  SP.Pictures.TEMPLATES   // id → template (authored in a 600 × 400 box, outline navy)
  SP.Pictures.list(kind)  // template ids of a kind: 'parts' | 'shapes' | 'count' | 'scene' | 'labels'
  SP.Pictures.build(id, opt) → pic     // pure, deterministic; opt per kind (below)
  pic = { id, kind, alive: 'swim'|'scuttle'|'sail'|'bob'|'float', w: 600, h: 400,
          parts: [ { id, d /* SVG path string, picture px */, hit: {type:'ellipse', cx, cy, rx, ry} | {type:'poly', pts:[[x,y]…]},
                     area, cx, cy /* label / fill origin */, role /* 'part'|'shape'|'spot'|'animal'|'label' */,
                     nameKind, nameValue /* e.g. 'part'/'tail', 'shape'/'triangle', 'animal'/'crab', 'letter'/'B', 'number'/7 */,
                     size? /* 'big'|'small' */, text? /* glyph drawn in the part (labels) */, def /* default fill hex at the end */ } ],
          deco: [ { d, fill? , stroke?, width? } ]   // non-paintable details drawn ON TOP of the fills (eyes, scales, mouth)
          under: [ { d, fill } ] }                    // optional non-paintable background bits (sand line, water wave)
  ```
  Kinds and `opt`:
  - **parts** (colours): ≥ 10 templates with 3–4 named paintable parts, each ≥ 70 × 70 picture px (fish: body, tail, fin;
    crab: shell, claws, legs; sailboat: hull, sail, flag; jellyfish: bell, tentacles, spots? (only if ≥ 70 px); whale: body,
    belly, tail; octopus: head, arms, hat?; submarine: body, tower, fin; seahorse: body, belly, fin; snail shell: shell, body;
    starfish: big star, spots; lighthouse-on-rock: tower, roof, rock …). `opt` none. Part ids/nameValues come from
    `SP.PART_NAMES` (exported list, every name needs EN + VI in i18n).
  - **shapes**: ≥ 4 templates with 3–5 **shape slots** `{cx, cy, r}` (r ≥ 48) — submarine portholes, sandcastle windows,
    a coral-rock wall with shaped stones, a boat with shaped flags. `opt.shapes = [shape per slot]` (from `SP.SHAPES =
    ['circle','square','triangle','star','heart','rect','diamond','oval']`) → parts with `role:'shape'` and the shape path
    at that slot (rounded corners); the body of the template is one extra non-target part (`role:'part'`) so it also gets
    painted at the end.
  - **count**: ≥ 4 templates (a whale blowing bubbles, a fish with pearls, an octopus juggling bubbles, a treasure chest
    with pearls) each with a `spotArea` and `opt.n` (≤ 12) → n spots (`role:'spot'`, `nameKind:'spot'`, circles r ≥ 30,
    non-overlapping, laid out deterministically from `opt.seed`), plus the main figure as a non-target part.
  - **scene** (sea animals / size / initial): ≥ 3 backdrops with up to 4 **animal slots**; `opt.animals = [animal per
    slot]`, `opt.sizes?` (['big','small'] for size rounds: the same animal twice, big ≈ 1.6× small) → each animal is ONE
    paintable part (`role:'animal'`, its body silhouette) + its deco (eyes, lines). `SP.SEA_ANIMALS = ['fish','crab',
    'octopus','starfish','jellyfish','seahorse','whale','dolphin']` — each readable as a line drawing at ≥ 120 px.
  - **labels** (letters / numbers / sums): ≥ 2 templates (a fish blowing 3–5 big bubbles, balloons tied to a buoy) with
    `opt.labels = [text per bubble]` → parts `role:'label'`, `text`, r ≥ 52, nameKind given by `opt.kind`.
  `SP.Pictures.hit(pic, x, y, pad)` → part id | null (pure; smallest-area rule). `SP.Pictures.validate(pic)` → null | reason
  (sizes, overlaps, all parts inside 600 × 400). Default fills `def`: pleasant sea colours that are NOT used as targets.
- **`game/js/paint_art.js`** → `SP.PaintArt` (canvas, Path2D; cache Path2D per part):
  ```
  SP.PaintArt.drawCanvasFrame(ctx, box, opt)   // the shell-framed cream board (box = layout.canvas), opt {glow, night?}
  SP.PaintArt.drawPicture(ctx, pic, st, opt)   // origin = picture top-left, scaled by caller; st per part id:
      //   { color: hex|null, t: 0..1 fill progress, ox, oy (fill origin, picture px), glow 0..1, wob (px), sparkle 0..1 }
      //   draw order: under → white parts → fills (clipped, radial grow from (ox,oy) with a wobbly edge; at t=1 full
      //   fill + highlight + shade) → glow rims (pulsing gold dashed outline) → outlines → deco → labels (text) on top.
  SP.PaintArt.drawPaintShell(ctx, color, r, opt)  // an open clam shell holding a paint blob, origin = centre; opt {lift,
      //   wob, glow, selected, dim}
  SP.PaintArt.drawBrush(ctx, color, size, angle, opt)  // a paintbrush (wooden handle, a seaweed-green-free neutral ferrule)
      //   origin = bristle tip; color = the loaded paint (null → clean cream bristles); opt {drip}
  SP.PaintArt.drawSplash(ctx, color, r, t)     // a paint splash burst (t 0..1) at the origin
  SP.PaintArt.drawIcon(ctx, thing, size)       // for Talk time / previews: thing.kind 'blob' {color} | 'shape' {shape,color}
      //   | 'animal' {animal, color?} | 'number' {n} | 'letter' {text} | 'dots' {n} | 'size' {size, animal, color}
  SP.PaintArt.drawGhostHand(ctx, size, t)      // friendly pointing hand (hint), origin = fingertip, t = 0..1 tap animation
  ```
  Contact sheets (`tools/pictures_sheet.js` → `docs/art/pictures_*.png`): every template unpainted, half painted, fully
  painted (def fills), at in-game size on the canvas, plus shells and brush in all colours.

### 4.3 Environment — environment artist
For `m ∈ spring|summer|autumn|winter`:
- `env/far_<m>.svg` (0 0 1200 720): distant reef silhouettes + soft light, bottom-anchored, horizontally tileable (seam at
  0/1200), transparent top (the render paints the water gradient). Give the water colours in a comment
  `<!-- water #top #bottom -->`.
- `env/mid_<m>.svg` (0 0 1200 300): kelp, coral fans, rocks (muted), bottom-anchored on the sand line, tileable.
- `env/ground_<m>.svg` (0 0 1200 260): sandy seabed with ripples, small shells and pebbles, tileable.
- `env/surface_<m>.svg` (0 0 1200 120): the water surface seen from below, top-anchored, tileable (spring: a few floating
  petals; summer: bright ripples; autumn: floating leaves; winter: an ice sheet with cracks).
- `env/rays.svg` (0 0 600 720): soft god-ray fan (white, transparent), `env/caustic.svg` (0 0 400 200) light net.
- Particles (0 0 32 32): `bubble` (keep), `petal` (pink), `leaf_a`, `leaf_b` (orange/amber), `snow`, `sparkle`, `star`,
  `plankton` (tiny soft dot), `dot` (paint dot, white, tinted by code), `confetti_a`, `confetti_b`.
- Composed scenes at 1556×720, 960×720, 720×1556 per mood + seam test into `docs/art/` (use `tools/env_scenes.js` recipe:
  water gradient → rays → far → mid → ground → surface on top).

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `pictures.js`, `paint_art.js` (+ `tools/art_pictures*.js`, `tools/pictures_sheet.js`) | character artist B |
| `characters/*`, `icon.svg` (+ `tools/art_nini.py`) | character artist A |
| `env/*`, `particles/*` (+ `tools/art_env.js`, `tools/env_scenes.js`) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css` | lead |
Script order: rng, i18n, pictures, content, world, weather, bot, storage, assets, audio, voice, input, paint_art, render, ui, main.

### 5.1 Content (`content.js` → `SP.Content`)
```
SP.PALETTE, SP.SHAPES, SP.SEA_ANIMALS (from pictures.js), SP.AGE_TOPICS = { 3:['colors','shapes','size','animals'],
  4:['colors','shapes','count','animals'], 5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'],
  7:['initial','add','sub','oddeven'] }
SP.Content.makeRound(topic, { age, lang, rng, roundIndex, surprise }) → round   // pure, deterministic, self-checks completable
SP.Content.makeTalk(topic, { age, lang, rng }) → talk    // { promptKey, params, show: icon thing | null, choices:[{id, thing}], answer }
SP.Content.topicsFor(age, rng, lastTopics)
SP.Content.validate(round) → null | reason
round = { topic, age, lang, roundIndex, surprise: null|'fishy'|'pearl', pic /* SP.Pictures.build result */,
  palette: [colour] | null /* shells shown; null → no palette (brush preloaded) */,
  steps: [ { mode: 'pickColor' | 'tapPart' | 'count' | 'pickTap',
             targets: [partId] /* pickColor: the one glowing part; tapPart: the right part; count: candidate spots;
                                  pickTap (age 5 shapes): the right shape part */,
             color /* the paint for this step */, need? /* count: N; oddeven: number of right bubbles */,
             promptKey, params, nameKind, nameValue } ] }
```
- Steps per round: warm-up (round 0) 1 step; later 2–3 steps (age 3: ≤ 2). Every step's targets exist and are unpainted;
  a part is painted at most once. Content varies every round (template, colours, shapes, animals).
- `colors` (mode `pickColor`): template kind `parts`; palette = 2 (age 3) / 3 (age 4) colours (age 5+: 4); steps paint
  different parts in different palette colours ("Paint the tail BLUE!"). The child taps the right shell (wrong shell = a
  mistake), then taps the glowing part (tapping any other part = `notThis`, not a mistake).
- `shapes` age 3–4 (mode `tapPart`): kind `shapes`, 2 (age 3) / 3 (age 4) different shapes, brush preloaded with `color`
  ("Paint the TRIANGLE yellow!"). Age 5 (mode `pickTap`): 4 shapes, palette 4 colours: pick the colour, then tap the shape
  (either wrong = a mistake).
- `size` (age 3, `tapPart`): kind `scene`, the same animal big + small; "Paint the BIG fish!".
- `animals` (`tapPart`): kind `scene` with 2 / 3 / 4 different animals (age 3 / 4 / 5+); "Paint the CRAB red!".
- `count` (mode `count`): kind `count`, spots = N + 2 (≥ N + 3 when N ≤ 3), N: round 0 1–2, round 1 2–3, rounds 2–3
  age 3–4: 3–5, age 5: 4–10, age 6–7: 5–12. Each tap on an unpainted spot paints it and counts aloud; when N are painted
  the step is done (taps on painted spots → `already`, not a mistake). One step per count round.
- `letters` (age 5, `tapPart`, kind `labels`, 3–4 capital letters), `lower` (target "small b" shown as capital in the
  prompt, bubbles small letters; drop `l`/`I`), `initial` (scene animals with distinct initials in that language; VI word
  without classifier: cá, cua, bạch tuộc, sao biển, sứa, cá ngựa, cá voi, cá heo → pick sets with distinct first letters),
  `add` / `sub` (labels are numbers; target = a + b / a − b; prompt shows "2 + 3"), `oddeven` (count-like: "Paint all
  the ODD numbers!", need = number of odd labels, wrong parity = a mistake).
- Prompt keys: `p.colors {part, color}`, `p.shapes {shape, color}`, `p.shapes5 {shape, color}`, `p.size {size, animal,
  color}`, `p.animals {animal, color}`, `p.count {n, color}`, `p.letters {letter}`, `p.lower {letter}`, `p.initial
  {letter}`, `p.add {a, b}`, `p.sub {a, b}`, `p.oddeven {parity}`. In `pickColor`, after the right shell: `p.tapPart {part}`
  ("Now tap the shining tail!").

### 5.2 `SP.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s; `_p*` previous values + `alpha` for interpolation)
Public API as the train game where it makes sense: `setViewport(W,H,ins), setAge, setLang, newSession({lastTopics}),
levels, startLevel(i), update(dt), drainEvents(), pointerDown/Move/Up(x,y), cancelDrag(), hint(), talkAnswer(id),
prompt(), resetNudges(), skipTalk(), layout, hudKeep, state, phase, level, topic, round, roundsPerLevel, stars,
levelStars, roundStars, misses, talk, alpha, stateTime, phaseTime, tapMoveMin`. States `intro | round | roundDone | talk |
levelDone | sessionDone`.
- `w.phase` in a round: `'enter' | 'paint' | 'finish' | 'alive' | 'clear'`.
  - **enter** (≈ 1.1 s): the picture floats in (`w.pic.y` offset from +0.6 H with a spring, slight rotation sway, bubbles
    `bubbles {x,y}` event); shells pop in staggered (back-overshoot, 0.1 s apart). Then event `ask {promptKey, params,
    mode, step, first}` → `paint`.
  - **paint**: `w.step` = current step index, `w.brush = { color|null, x, y, _px, _py, angle, dip 0..1, state 'rest'|
    'fly'|'dab' }`. Input is a **tap** (down + up within 0.6 s and < 40 px move; a drag is ignored — just treat the press
    position at release). Events:
    - shell tap: right → `pick {color}` (shell `lift` spring, brush flies to the shell, dips, comes back loaded); in
      `pickColor` then `ask {promptKey:'p.tapPart', …, follow:true}`; wrong → `wrong {kind:'color', got:{nameKind:'color',
      nameValue}, want:{…}, streak}` (shell wobble, a small grey-free splash). Tapping a shell while the brush is already
      right-loaded → `pick` again (harmless).
    - part tap with the right paint and the right part → brush flies there (0.18 s arc), `dab`, the part starts filling
      from the tap point: `st[part].t` 0 → 1 over `CONFIG.fillTime` 0.7 s (ease-out, wobbly edge), event `paint {partId,
      color, count?:{i,n}}`; splash particles; when the fill completes `filled {partId}`. Step done → `stepDone {step}`
      → next step `ask` after 0.5 s (count: after the last spot's fill).
    - part tap in `pickColor` before the right paint is picked → `needPaint {}` ("First pick the blue paint!"), not a
      mistake. Tap on a non-target part in `pickColor` → `notThis {partId}`, not a mistake. Tap on a wrong part in
      `tapPart` / `pickTap` → part `wob` (damped ±6 px), `wrong {kind:'part', got:{nameKind,nameValue}, want:{…}, streak}`.
      `count`: tap on an unpainted spot → `paint` with count; on a painted spot → `already` (not a mistake).
    - tap on Nini → `pokeNini` (main repeats the prompt). Tap on empty canvas / water → nothing.
    - after 2 misses in a step, or `hint()`: `hint {target: 'shell'|'part', id}` — it glows, ghost hand taps it
      (`w.hintHand = {x, y, t, alpha}`); cooldown 6 s; idle nudges after 12 s, backoff ×1.5 up to 30 s (`idle {n}`; the
      2nd idle also hints).
  - **finish** (≈ 1.2 s): Nini `paint` mood; every still-white part fills with its `def` colour in a sweep (left → right,
    0.12 s apart, `sweep` event per part); sparkles.
  - **alive** (≈ 2.4 s): the whole picture comes off the canvas: `w.pic = {x, y, rot, sx, sy, alpha, wig}` animated per
    `pic.alive` (swim: wiggle squash + leave right with bubbles; scuttle: hop sideways; sail: rock and glide; bob: up and
    away; float: rise with bubbles) — event `alive {kind}`; the canvas shows empty for a beat, then `roundDone {round, stars,
    misses}` (3 / 2 / 1 stars for 0 / 1 / ≥ 2 misses), **clear** (0.4 s), next round or Talk time after round 4 / once the
    chapter passes 75 s with ≥ 3 rounds done.
- `w.parts` = the round's pic parts + state: `{ id, color, t, _pt, ox, oy, glow, wob, _pwob, sparkle, painted }`
  (render passes these as `st` to `PaintArt.drawPicture`). `w.shells[]` = `{ color, x, y, r, pop 0..1, lift, wob, glow,
  dim }` (layout palette slots, only `round.palette` colours).
- `w.nini = { mood idle|talk|happy|cheer|think|oops|wave|paint|point, moodT, blink, look }`.
- Surprises (one round per chapter, rotating, never in the warm-up): **fishy** — during `paint`, a little fish swims across
  the water above the canvas (`w.fishy = {x, y, _px, _py, dir, state 'swim'|'happy', t}`, event `fishy`); tap → `fishyTap`
  (paint-dot burst, giggle, no score); **pearl** — a clam on the sand beside the palette (`w.clam = {x, y, open 0..1,
  taps}`); tap → `pearlTap` (opens, pearl sparkles; no score).
- Events also: `level {level, topic}`, `round {round, surprise}`, `talk`, `talkAsk {n}`, `talkResult`, `levelDone`,
  `sessionDone {stars}`.
- Rotation / resize mid-round: re-layout; picture, shells and brush snap to the new layout; any fill keeps its progress.

### 5.3 `SP.Weather` — `setWeather(i, {instant})` (0 spring, 1 summer, 2 autumn, 3 winter; crossfade 2.5 s), `resize(W,H,
groundY)`, `update(dt)`, `ambient` (`waterTop, waterBottom, tint, rays 0..1, caustic 0..1, ice 0..1, light 0..1,
mood:'spring'|'summer'|'autumn'|'winter'`), `particles[]` (`{type, x, y, r, rot, alpha, size}`): always a few rising
bubbles + plankton; spring petals drifting along the surface and some sinking; summer sparkles in the rays; autumn leaves
drifting down and swaying; winter snowflakes sinking slowly. `addSplash(x, y, color, n)` / `addBubbles(x, y, n)` for world
events (paint dots tinted, short life). Cap 120.

### 5.4 `SP.Bot` — taps through `world.pointerDown/Up` at the right target (shell then part) with p = skill (a wrong answer
= a random other shell / part); human-ish delays (1.0–2.4 s) after `ask` and between taps; answers Talk right with p =
skill; taps fishy / clam sometimes.

### 5.5 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved); `window.SP.debug = { world, weather, mode, stats, getState(), setSpeed(n), startGame(), goTitle(),
setBot(on, skill), setAutoRestart(on), gotoLevel(i), voiceLog, partScreen(id) → {x,y} CSS px (a safe tap point inside the
part), shellScreen(color), ninaScreen(), answer() → {shell?: color, part?: id} (what to tap next), toScreen(x,y), audio() }`.
World supplies `partTap(id)` (logical safe tap point), `shellHit(color)`, `niniHit()`, `fishyHit()`, `clamHit()`,
`answer()`.

## 6. Voice, language — as the train game §6 with helper **Nini** (EN "Nini", VI "Rùa Nini" in titles, "Nini" in lines),
a cheerful baby turtle painter: pitch ≈ 1.2, rate ≈ 0.9. Sea animals (VI with classifiers): fish "con cá", crab "con cua",
octopus "con bạch tuộc", starfish "con sao biển", jellyfish "con sứa", seahorse "con cá ngựa", whale "con cá voi", dolphin
"con cá heo". Part names (`part` kind) for every `SP.PART_NAMES` entry: body "thân", tail "đuôi", fin "vây", sail "cánh
buồm", hull "thân thuyền", flag "lá cờ", shell "mai" (crab) / "vỏ" (snail), claws "càng", … Colours "màu đỏ / xanh dương /
vàng / xanh lá / cam / tím / hồng". Spot = bubble "bong bóng" / pearl "ngọc trai" (per template: `spotName`).
- Prompts (3 wordings each): `p.colors` "Let's paint the {part} {color}!" / "Bé ơi, tô {part} màu {color} nhé!" (+ "Find
  the {color} paint!"), `p.tapPart` "Now tap the shining {part}!", `p.shapes` "Paint the {shape}!" (brush already {color}),
  `p.size`, `p.animals` "Can you paint the {animal}?", `p.count` "Paint {n} bubbles!" (spot word per template; VI "Bé tô {n}
  {spot} nhé!"), letters etc.
- `say.pick` names the colour ("Blue!" / "Màu xanh dương!"), `say.paint` per role ("Blue tail — beautiful!", "The crab!"),
  counting `count.<n>`, `wrong.color[]` with `{got}` `{want}` ("That's yellow. Let's find blue!"), `wrong.part[]` ("That's
  the circle. Where is the triangle?"), `needPaint[]`, `notThis[]`, `already[]`, `finish[]` ("Nini finishes the rest!"),
  `alive.<kind>[]` ("Look, it's swimming!"), `hint[]`, `idle[]`, `praise[]`, `great[]` with `{child}`, `talk.*`,
  `weather.0..3` ("Spring petals!", "Sunny summer sea!", "Autumn leaves!", "Brr, winter! Ice on top!"), `surprise.fishy`,
  `fishy.tap`, `surprise.pearl`, `pearl.tap`, `enter[]` ("A new picture!"), `topic.*`, `session.done`, `ui.*` incl.
  `ui.volume`, logo lines "Nini's" / "Sea Painting", VI "Rùa Nini" / "Tô Màu Đại Dương".

## 7. Integration (lead) — title (Nini waving beside a painted fish canvas, ▶ Play, star total, language toggle,
hold-⚙), settings with volume, HUD, bubble, pause with −/+, chapter banner, Talk time, session done (the gallery: all
pictures of the session floating around Nini, confetti). Audio: shell pick "plip", brush whoosh, wet "splotch" + rising
fill shimmer (pitch per colour), count chimes, wrong "boing", sweep glissando, alive bubbles + swish, fishy giggle, clam
creak + chime, ambient underwater hum + bubbles, music per season (soft marimba / music box, ducked under speech).

## 8. Performance — ≤ 14 parts per picture, Path2D cached, fills drawn with one clip each, ≤ 120 particles; adaptive
quality as before.
