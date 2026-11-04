# Lulu's Jungle Tower — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.JT`**. Classic `<script>` files, no build step, node-safe at load
(touch the DOM lazily). The code base is a copy of `../fox-camp-hide-seek/` (state machine, voice, input, storage, loud
audio with volume, ui, main, tests) with `FC → JT` and the storage prefix `jt:` already replaced. **The hide-and-seek
world is replaced by a tower-stacking world.** When a detail is missing here, do what `../fox-camp-hide-seek/docs/DESIGN.md`
does (i18n/voice API, hooks, Talk time, chapter-topic rotation between sessions, idle auto-pause, tap lock, CONFIG style).
Target: iPhone + iPad Safari first, portrait and landscape.

## 1. What changes versus Pip's Camp Hide & Seek
| Pip's Camp Hide & Seek | Lulu's Jungle Tower |
|---|---|
| tap a hiding place to peek | **drag a block UP and let go over the tower**: it falls by gravity and lands on top |
| Pip the fox, bottom-left | **Lulu the giraffe calf** (`lulu`), tall, standing left of the tower |
| campsite, 4 seasons | **jungle clearing**, one **time of day** per chapter: morning → noon → sunset → starry night |
| friends hide in places | **3 blocks on the grass** ("tray"), the tower on an **old tree stump** in the middle, **bananas** hanging from a branch at the goal height |
| campfire dance | **tower done**: count-up glow bottom→top, flowers bloom up the tower, a **monkey swings in** on a vine and grabs the bananas, then the blocks hop away |

## 2. Screen and layout
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
  Screen space = world space (no camera), y down. `ins` = safe-area insets in logical px.
- `World.setViewport(W, H, ins)` computes `layout`:
  ```
  layout = { W, H, ins, portrait, tall /* H/W > 1.6 */,
    groundY,          // front grass line: H - ins.bottom - (portrait ? 40 : 28)
    S,                // block size (square side): age ≤ 4 → 112, 5+ → 100; shrunk (never below 84) so that
                      //   maxBlocks·S ≤ baseTop - (ins.top + 150) (portrait: ins.top + 260, under the bubble)
    tower: { x, baseTop, baseW },  // stump: landscape x = ins.left + 0.45·(W - ins.left - ins.right), at least ins.left + 360;
                      //   portrait x = 0.58·W; baseTop = landscape groundY - 64, portrait groundY - S - 150; baseW = S + 70
    drop: { x0, x1, y1 },          // release zone: x ∈ tower.x ± (S/2 + 60), y < tower.baseTop + 10 (anywhere ABOVE the stump)
    goalY,            // bottom of the banana bunch = baseTop - N·S - 8 (N = blocks of this round); the branch comes in from the top edge
    lulu: { x, y, h },// FEET point and height: landscape x = ins.left + 120, y = groundY - 4, h = 420 (W < 1100: 380);
                      //   portrait x = ins.left + 115, y = tower.baseTop + 70, h = 400 (drawn behind the tray)
    slots: [ {x, y} ],// resting centres of the choice blocks: landscape: on the grass right of the drop zone, y = groundY - S/2 - 6,
                      //   spacing S + 26, from drop.x1 + 44 + S/2 to W - ins.right - S/2 - 20; if 3–4 don't fit, a 2nd row
                      //   at y - S - 36 (blocks there sit on a big leaf, render draws it); portrait: one row across the bottom
                      //   y = groundY - S/2 - 8, spread evenly over ins.left + S/2 + 20 … W - ins.right - S/2 - 20
    bubble: { x, y, w, h },        // landscape: x = ins.left + 24, y = ins.top + 18, w = min(560, drop.x0 - 20 - x), h = 122
                                   // portrait: x = ins.left + 24, y = ins.top + 110, w = W - x - ins.right - 24, h = 124
    monkeyFrom: { x, y }           // where the monkey's vine hangs from (top edge, right of the tower)
  }
  ```
- Rule: no slot inside the drop zone (± 44 px margin), no slot under `world.hudKeep` boxes (HUD top-right `x > W - ins.right - 160,
  y < ins.top + 96`, bubble). The goal bananas may overlap the bubble's column only in portrait if unavoidable (bubble is DOM above).
- Hit test of a block: centre ± (0.6·S + 14). Lulu: her box + 20 px (a tap repeats the prompt).

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand (no famous cartoon giraffe: no toy-store
  mascot, no "Sophie" teether, no Madagascar look; no famous cartoon monkey: no yellow-hat friend). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox 256)
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark/light)**: red `#E84A4A/#A8282E/#F7A0A0`, blue `#3C8DE8/#1F5BA8/#A6CCF5`,
  yellow `#FFD23F/#C99A12/#FFEB9C`, green `#4CC26B/#2A8343/#A8E6B8`, orange `#FF9A2E/#C4650C/#FFCB8E`,
  purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2` (pink from age 5). Defined in `content.js` as `JT.PALETTE`.
- **Lulu**: baby giraffe, fur **sandy cream `#EDCB92`**, shade `#D6AE6E`, outline `#8A5A32`, patches **toffee `#B9773F`**
  (rounded polygons), cream muzzle `#FFF0D8`, ossicones (little horns) with dark-brown tufts `#6B4326`, eyes `#2F2A3A` with
  catch-light, long lashes, pink cheeks `#F6B1A0`, a **seafoam neckerchief `#7CCBB5`/`#4E9C88`** (not an answer green: it's
  pale blue-green). Lulu never wears an answer colour. Long neck: she is tall (viewBox 300×440).
- **Blocks** (drawn by code in `block_art.js`): chunky wooden cubes seen from the front with a thin top face (pseudo-3D,
  top 14 % of S), rounded corners r = 0.14·S, wood grain lines. *Colour* blocks are painted all over in the answer colour
  (base face, light top face, dark outline 5 px, grain in a slightly darker tone). Other blocks are **natural pine
  `#F1D3A1` / top `#F8E4C0` / outline `#A8743F`** with a painted face: shape (in its colour, dark outline), dice dots
  (dark `#5A3A22`), numeral (dark, bold rounded font), animal sticker (the `items/animal_<x>.svg` image with white border),
  letter. Ages ≤ 4: shapes on blocks are in different colours; below age 5 never blue+purple, red+green, yellow+orange,
  green+orange in one choice set.
- **Jungle**: lush but CALM greens (`#5E9E6A`, `#3F7F57`, `#2F6447` far blue-greens), big leaves, ferns, lianas, a few soft
  flowers (muted coral/cream, desaturated so answer colours pop). Sky: morning `#BFE6F2 → #F4EFD6` (mist), noon
  `#7FC8F0 → #DDF1FB`, sunset `#F5A878 → #FBE0A8`, night `#1C2650 → #3B4A7A` (stars, moon, fireflies). The stump is a warm
  brown `#8B5E3C` with a lighter cut top `#D9B27C` and rings.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & UI — character artist A
| File | viewBox | Notes |
|---|---|---|
| `characters/lulu_{idle,blink,talk,happy,cheer,think,oops,hold}.svg` | 0 0 300 440 | Lulu standing 3/4 view facing RIGHT (towards the tower), **feet anchor (150, 432)**, identical body/legs in every frame; happy = big smile, cheer = head up, eyes closed smile, tail flick; think = head tilt, eyes up; oops = "hmm?" head tilt (never sad); talk = mouth open; **hold = neck leaning right, head pushing gently against something at x≈285, y≈60 (steadying the tower in a breeze)** |
| `characters/lulu_full_wave.svg` | 0 0 300 440 | title pose (one front leg raised, waving) |
| `characters/monkey_{swing,grab,cheer}.svg` | 0 0 160 200 | small brown monkey `#9A6A48` with cream face `#F3DDBF` (no yellow-hat friend look); **swing**: one hand up holding a vine at **(80, 6)** (the anchor), body hanging; **grab**: same anchor, other hand holding a banana bunch; **cheer**: same anchor, both legs kicking, big grin |
| `characters/bananas.svg` | 0 0 120 130 | bunch of 4–5 bananas (yellow `#F6D45A`, NOT the answer yellow: paler, green tips) hanging from a stem at **(60, 6)** |
| `characters/butterfly.svg`, `characters/butterfly_up.svg` | 0 0 96 80 | soft teal-and-cream butterfly, wings open / closed-up (flap frames) |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | Lulu's head and neck beside a tower of 3 coloured blocks under jungle leaves, full-bleed background |

### 4.2 Blocks & animals — character artist B
- `items/animal_<x>.svg` (0 0 128 128, white sticker border) for **jungle animals** `JT.ANIMALS = ['monkey','elephant','tiger',
  'parrot','lion','frog','snake','hippo']` — friendly, round, readable at 60 px (the face of a block). Regenerate from
  `tools/art_animals.py` (extend it; lion and frog exist; drop cat/dog/cow/pig/sheep/duck files).
- **`game/js/block_art.js`** → `JT.BlockArt`:
  ```
  JT.BlockArt.drawBlock(ctx, block, S, opt)  // origin = block CENTRE; S = side px; opt: { glow 0..1, lift 0..1 (drag: a bit brighter),
                                             //   dpr, img(name) → loaded Image|null for animal stickers }
  JT.BlockArt.drawGhostHand(ctx, size, t)    // a friendly pointing hand (hint), origin = fingertip
  JT.BlockArt.drawFlower(ctx, size, t, hue)  // small jungle flower that blooms (t 0..1 scale-in) — muted coral/cream/lilac
  JT.BlockArt.drawLeafPad(ctx, w, h)         // the big leaf the 2nd tray row rests on (origin = top-centre of the leaf surface)
  JT.BlockArt.drawGlow(ctx, w, h, t, strength)
  JT.BlockArt.COLORS = JT.PALETTE
  ```
  `block = { kind, value, color?, shape?, n?, text?, animal?, size? }` where kind ∈ `color` (whole block in `color`), `shape`
  (shape `shape` in `color`), `dots` (n dice dots 1–10, dice layout), `number` (numeral text + optional dots below when
  `showDots`), `animal` (sticker), `letter` (text), `size` (`size: 'big'|'small'` — a colour block drawn at 1 / 0.7 × S),
  `text` (anything else: sums like "2+3", parity). Cache static faces per (key, S, dpr) in offscreen canvases.
  Shapes: `JT.SHAPES = ['circle','square','triangle','star','heart','rect','diamond','oval']`.

### 4.3 Environment — environment artist
- `env/far_<m>.svg` (0 0 1200 420), `env/mid_<m>.svg` (0 0 1200 380), `env/ground_<m>.svg` (0 0 1200 260) for
  `m ∈ morning|noon|sunset|night`: horizontally tileable, bottom-anchored, transparent above. far = misty blue-green canopy
  and distant trees; mid = big jungle trees, lianas, ferns; ground = the clearing's grass with ferns, stones, a few flowers
  (keep the middle band calm: blocks rest there).
- `env/stump.svg` (0 0 240 120, anchor bottom-centre (120, 116), cut top surface at **y = 18** across x 30–210), roots + moss.
- `env/branch.svg` (0 0 600 160): a big branch entering from the RIGHT edge (x 600) with leaves; the banana stem hangs at
  **(110, 140)** (render places that point above the tower). `env/vine.svg` (0 0 40 600): a hanging liana (tileable vertically).
- `env/sun.svg`, `env/moon.svg` (0 0 200 200), `env/cloud_{a,b,c}.svg` (0 0 320 170, soft, also used as mist bands).
- Particles (0 0 32 32): `leaf_a`, `leaf_b` (green), `petal` (coral/cream), `firefly` (soft yellow-green glow dot),
  `pollen`, `sparkle`, `star`, `puff`, `dust`, `confetti_a`, `confetti_b` (tinted by code).

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `block_art.js` | character artist B |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css` | lead |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, block_art, render, ui, main.

### 5.1 Content (`content.js` → `JT.Content`)
```
JT.PALETTE, JT.ANIMALS, JT.SHAPES, JT.ANIMAL_SOUND = { monkey:'ooh-ooh', elephant:'toot', tiger:'grr', parrot:'squawk',
  lion:'roar', frog:'ribbit', snake:'hiss', hippo:null /* never asked by sound */ }
JT.AGE_TOPICS = { 3:['colors','shapes','size','animals'], 4:['colors','shapes','count','animals'],
                  5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
JT.Content.makeRound(topic, { age, lang, rng, roundIndex, surprise }) → round   // pure, deterministic, self-checks solvable
JT.Content.makeTalk(topic, { age, lang, rng }) → talk                          // as the fox game (picture choices ≤ 5)
JT.Content.topicsFor(age, rng, lastTopics)
```
```
round = { topic, n /* blocks to stack */, asks: [ ask ×n ], surprise: null|'breeze'|'butterfly' }
ask   = { promptKey, params, choices: [ block ], answer /* index into choices */, nameKind, nameValue }
block = { kind, value, color?, shape?, n?, text?, animal?, size?, showDots?, nameKind, nameValue }
```
- Blocks per round: age 3: 2,2,3,3; age 4: 2,3,4,4; age 5: 3,4,5,5; 6–7: 4,5,5,5. Choices per ask: age 3: 2; 4–5: 3;
  6–7: 3 (4 from round 2). Warm-up round 0: 2 choices. Exactly one choice matches; no two consecutive asks share an answer value;
  distractors vary every ask.
- `colors`: kind `color`, prompt `p.colors {color}` "Stack the RED block!". `shapes`: kind `shape` (age ≤ 4 shapes in different
  colours; age 5 mixed colours as distractor: same colour different shape), prompt `p.shapes {shape}`.
- `count`: rounds 0–1 **count up**: kind `number` with `showDots`, asks go 1, 2, … n in order (the tower reads 1-2-3 from the
  bottom), prompt `p.countUp {n}`; rounds 2–3: kind `dots`, prompt `p.count {n}` (age 4: n ∈ 1–5, ≥ 2 apart when possible).
- `animals`: kind `animal`, prompt `p.animals {animal}`; from round 2 at age ≥ 4 half the asks by sound `p.sound {animal}`
  (never hippo).
- `size` (age 3): two/three colour blocks of the SAME colour, big and small; "Stack the BIG block!" `p.size {size}`
  (a small block is stacked at 0.7·S, the tower then is shorter — layout uses S for the goal anyway).
- `letters`, `lower`, `initial`, `add`, `sub`, `oddeven`: kinds `letter` / `text` / `number` — same logic as the fox game.

### 5.2 `JT.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s; `_p*` previous values + `alpha` for interpolation)
Public API/fields as the fox game: `setViewport(W,H,ins), setAge, setLang, newSession({lastTopics}), levels, startLevel(i),
update(dt), drainEvents(), pointerDown/Move/Up(x,y), cancelDrag(), hint(), talkAnswer(id), prompt(), layout, hudKeep, state,
level, topic, round, roundsPerLevel, stars, levelStars, talk, alpha, stateTime, wind, resetNudges()`; states
`intro | round | roundDone | talk | levelDone | sessionDone`; plus:
- `w.phase` in a round: `'deal' | 'ask' | 'drop' | 'bounce' | 'done' | 'clear'`.
- `w.pieces[]` (the choice blocks on screen): `{ id, block, slot, homeX, homeY, x, y, _px, _py, rot, _prot, sx, sy, scale,
  state: 'in'|'rest'|'drag'|'fly'|'fall'|'bounce'|'home'|'out'|'gone', glow 0..1, t }`.
  - **in**: drop in from above the screen into the slot (staggered 0.08 s; gravity, landing squash, small bounce) → `rest`
    (idle bob ±2 px, wiggle when hinted). **out**: the unused pieces hop off downwards/sideways and fade (0.35 s).
  - **drag**: spring-follow the finger (ω ≈ 30, ζ ≈ 0.8) lifted by 1.08 scale, pendulum tilt from horizontal velocity (max
    ±0.35 rad, damped). The finger holds the block at the grab offset (clamped to ±0.35·S).
  - Release: (a) finger moved < 24 px and < 0.35 s → **tap**: hop in place, event `tapPiece` (name only); (b) release point
    inside `layout.drop` → **fall**: keeps its horizontal velocity (×0.4), a horizontal spring pulls it over the tower top
    (so it lands within ±0.18·S of the top block's centre), gravity 2600 px/s², rotation eases to 0 — event `drop`;
    (c) elsewhere → **home**: ballistic arc back to its slot (apex 50 px, 0.4 s), event `miss` (not a mistake).
  - Landing (fall reaches the tower top surface): right block → it joins the tower (piece `gone`, a tower block appears at its
    exact x) with landing squash (sy 0.82 → spring back), the blocks below compress a bit, the tower gets a sway impulse ∝ the
    landing offset and fall speed — event `land {pieceId, n /*tower height now*/, impact 0..1}` then `stack {n, nameKind,
    nameValue}`; the other pieces go `out`, then (if more asks) `deal` the next choices, phase `ask` after the last one rests.
    Wrong block → **bounce**: it bounces off the top (restitution 0.45, sideways kick away from the tower, spin), the tower
    gets a small impulse, then arcs home — event `wrong {pieceId, nameKind, nameValue, want:{kind,value}, streak}` at the
    bounce; tap lock `CONFIG.wrongLock` 0.7 s; after the 2nd miss on the same ask → `hint {pieceId}` (glow + ghost hand
    drag from the right piece to the tower top, `w.hintHand = {fromX, fromY, toX, toY, t}`), always on the 2nd miss;
    idle hints respect a 6 s cooldown; idle nudges after 12 s without a real grab, backoff ×1.5 up to 30 s (`idle {n}`;
    the 2nd idle also hints).
- `w.tower = { x, baseTop, blocks: [ { id, block, dx /*x offset vs the stump centre*/, sy, glow, bloom 0..1 } ], theta, _ptheta,
  omega, n /*target*/ }` — **physics**: the stack is an inverted pendulum with a spring (`theta'' = -k·theta - c·omega + torque`,
  k ≈ 26, c ≈ 3.2 — visible sway that settles in ≈ 1.5 s, max |theta| 0.12 rad), plus a gentle self-centring of each block's
  `dx` (0.6·S/s). The tower NEVER falls. `w.blockPose(i, alpha)` → `{ x, y /*centre*/, rot, sx, sy }` for render (bend: block i
  leans by theta·(i+1)/n around the stump top; landing squash per block).
- `w.goal = { x, y, state:'hang'|'taken', swing /*rad*/, _pswing }` — bananas hang at `layout.goalY`; they sway a little when the
  tower is close. `w.monkey = null | { x, y, rot, state:'in'|'grab'|'out', t }` (hangs from a vine at monkeyFrom, swings in on a
  pendulum arc to the bananas, grabs, swings out).
- `w.lulu = { x, y, mood /*idle|talk|happy|cheer|think|oops|hold*/, moodT, blinkT, look }`.
- **deal** (≈ 0.6 s) at round start and after each correct stack; at round start the tower is empty, the goal bananas drop in
  on their stem (bounce), event `round`, then `deal`. **ask**: event `ask {ask, asks, promptKey, params}`.
- **done** (≈ 3.2 s, after the n-th block lands): events `towerDone {n}`, then `count {i}` every 0.35 s for i = 1…n (block i glows,
  bottom → top), `bloom` (flowers bloom up the tower), `monkey` (swing in), `bananas` (grab), then `roundDone {round, stars,
  misses}` (3 / 2 / 1 stars for 0 / 1 / ≥ 2 misses). **clear** (≈ 0.8 s): the tower blocks hop off one by one from the top to
  the right edge and puff (`clearBlock {i}`), then the next round (or Talk time after round 4 / 80 s chapter limit with ≥ 3 rounds).
- Taps on Lulu (< 24 px, < 0.35 s) → `pokeLulu` (main repeats the prompt). Pointer input during deal/drop/bounce/done/clear: a
  resting piece may be grabbed only in phase `ask`; others → null.
- Surprise (one round per chapter, rotating): `breeze` — after the 2nd stack a gust (`gust` event, `w.wind` impulse) makes the
  tower sway extra; Lulu `hold`s it with her head for 1.5 s ("Whoa! I've got it!"). `butterfly` — once in the round a butterfly
  flutters in and lands on the tower top for 4 s (`w.butterfly = {x, y, t, state}`); a tap on it → `butterflyTap {x, y}`
  (sparkles, flies away, no score effect). Events `gust`, `butterfly`, `butterflyTap`.
- Events also: `level {level, topic}`, `grab {pieceId, nameKind, nameValue}`, `talk`, `talkAsk {n}`, `talkResult`, `levelDone`,
  `sessionDone {stars}`.
- Rotation / resize mid-round: cancel the drag, re-layout, snap pieces to their (new) slots, tower to the new stump, finish any
  running fall/bounce instantly (a falling right block lands; a bouncing wrong block goes home).

### 5.3 `JT.Weather` — API as the fox game (`setWeather(i)` 0 morning, 1 noon, 2 sunset, 3 night; crossfade 2.5 s), `resize(W,H)`,
`update(dt)`, `ambient` (`skyTop, skyBottom, tint, sun, sunX, sunY, moon, darkness /*0, 0.45 at night*/, mist 0..1, wind,
mood:'morning'|'noon'|'sunset'|'night'`), particles: morning mist bands + drifting pollen, noon floating leaves + sun glints,
sunset petals on a warm breeze, night fireflies (glow, wander) + twinkling stars. Cap 120.

### 5.4 `JT.Bot` — drags through `world.pointerDown/Move/Up` (moves the piece in 6–10 steps to a point above the tower top) with
p = skill (a wrong answer = a random other piece); human-ish delays (1.0–2.4 s) after `ask`; answers Talk right with p = skill;
taps the butterfly sometimes.

### 5.5 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved); `window.JT.debug = { world, weather, mode, stats, getState(), setSpeed(n), startGame(), goTitle(), setBot(on, skill),
setAutoRestart(on), gotoLevel(i), voiceLog, pieceScreen(id) → {x, y, w, h} CSS px (centre), dropScreen() → CSS point 1.2·S above
the tower top, luluScreen(), answerId() → id of the right piece in the current ask, toScreen(x,y), audio() }`. World supplies
`pieceHit(id)`, `luluHit()`, `dropPoint()` (logical) and `answerId()`.

## 6. Voice, language — as the fox game §6 with helper **Lulu** (written and spoken "Lulu" in both languages), a cheerful baby
giraffe: pitch ≈ 1.2, rate ≈ 0.9. Jungle animals: monkey "con khỉ" (ooh-ooh / "khẹc khẹc"), elephant "con voi" (toot /
"bim bim"? the engineer picks a natural VI sound word), tiger "con hổ" (grr / "gừ gừ"), parrot "con vẹt" (squawk / "két két"),
lion "con sư tử" (roar / "gừm gừm"), frog "con ếch" (ribbit / "ộp ộp"), snake "con rắn" (hiss / "xì xì"), hippo "con hà mã".
- `p.colors` "Stack the {color} block!" / "Bé ơi, xếp khối màu {color} nhé!", `p.shapes` "Put the {shape} block on top!",
  `p.countUp` "Block number {n}!", `p.count` "Find the block with {n} dots!", `p.animals` "Stack the {animal} block!",
  `p.sound` "Who says {sound}? Stack that block!", `p.size` "Stack the {size} block!", letters etc. as the fox game. 3 wordings each.
- `sayStack(lang, ev)` names the block and counts the tower ("Red! Two blocks tall!" / "Màu đỏ! Tháp cao hai khối rồi!"),
  `sayWrong(lang, ev)` ("Boing! That's the blue block. Let's find red!" — names what bounced, repeats the goal, never negative),
  `sayTap(lang, ev)` (just the name: "Blue!"), `count.<n>` ("One!", "Two!" …), `towerDone[]` ("We reached the bananas!"),
  `monkey[]` ("Thank you, Lulu! says the monkey"), `hint[]`, `idle[]`, `praise[]`, `great[]` with `{child}`, `talk.*`,
  `weather.0..3` ("Good morning, jungle!", "Sunny noon!", "What a pretty sunset!", "Look, fireflies!"), `surprise.breeze`,
  `surprise.butterfly`, `butterfly.tap`, `gust` ("Whoa, a breeze! I've got it!"), `deal[]` ("Let's build up to the bananas!"),
  `topic.*`, `session.done`, `ui.*` incl. `ui.volume`, logo lines "Lulu's" / "Jungle Tower", VI "Hươu Lulu" / "Xếp Tháp".

## 7. Integration (lead) — title (Lulu waving beside a 3-block tower and bananas), settings with volume, HUD, bubble, pause with −/+,
chapter banner, Talk time, session done (starry-night party: fireflies, the monkey, every tower block confetti).
Audio: loud chain; SFX: clonk (pitch rises per tower block), creak (sway), boing (bounce-off), whoosh (drop), pick-up pop, deal
taps, count chimes (rising), bloom sparkle, monkey "ooh-ooh" (synth), star dings, fanfare; jungle ambience (birds, insects at night);
music per time of day.

## 8. Performance — ≤ 6 tower blocks, ≤ 4 pieces, cached block faces, ≤ 160 particles; adaptive quality as the fox game.
