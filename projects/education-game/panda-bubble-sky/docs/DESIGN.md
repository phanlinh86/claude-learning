# Bao's Bubble Sky — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.PB`**. Classic `<script>` files, no build step, node-safe at load
(touch the DOM lazily). The code base is a copy of `../puppy-farm-parade/` (state machine, voice, input, storage, loud audio
with volume, ui, main, tests) with `FP → PB` and storage prefix `pb:` already replaced. **The parade world is replaced by a
bubble world.** When a detail is missing here, do what `../puppy-farm-parade/docs/DESIGN.md` / `MECHANICS.md` / `VOICE.md`
do (i18n / voice API style, hooks, Talk time, chapter-topic rotation between sessions, idle auto-pause, CONFIG style, hint
cooldown / idle backoff, prompt protection, phone layout tweaks, short rounds when a chapter runs long, interpolation with
`_p*` twins + `alpha`). Target: iPhone + iPad Safari first, portrait and landscape.

## 1. What changes versus Bo's Farm Parade
| Bo's Farm Parade | Bao's Bubble Sky |
|---|---|
| tap the ONE odd member of a parade | **tap the bubble(s) with the asked thing** — 1 to 3 right bubbles per round ("Pop the red ones!") |
| parade line on a path, barn, hay-bale stage | **a floating bubble field** in the sky above a fluffy cloud floor; a **rainbow arch** behind the field |
| Bo the puppy, bottom-left | **Bao** (`bao`), a little panda sitting on a cloud bottom-left with a **bubble wand** |
| hop onto stage, gate, march into barn | **pop** (droplet ring) → the freed thing zooms to the rainbow and **paints the next piece**; rainbow done → shimmer → Bao's **whoosh** blows the leftovers away |
| farm, morning → night | **rainbow cloud land**, **spring → summer → autumn → winter** (blossoms, sunshine, leaves + wind gusts, snow) |

## 2. Screen and layout
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
  Screen space = world space (no camera), y down. `ins` = safe-area insets in logical px. `hudKeep` boxes as before (main measures the HUD).
- `World.setViewport(W, H, ins)` computes `layout`:
  ```
  layout = { W, H, ins, portrait, tall /* H/W > 1.6 */, phone /* long/short > 1.9 */,
    groundY,            // top of the cloud floor: H − ins.bottom − (portrait ? 26 : 14)
    bubble: {x,y,w,h}, hud: {x,y,w,h},   // the speech bubble + HUD exactly as the parade (top band)
    bao:  { x, y, h, w, ring: {x, y, r}, blowRing: {x, y, r}, box },
          // FEET point (bottom of the sitting panda) + height. Landscape x = ins.left + 130, y = groundY − 4, h = 240.
          // Portrait x = ins.left + 120, y = groundY − 4, h = 220. ring / blowRing = the wand ring centres on screen
          // computed from PB.BAO_POINTS (§4.1) × (h / 300).
    field: { x0, y0, x1, y1 },   // where bubble CENTRES may rest.
          // Landscape: x0 = bao.box right + 0.55·d, x1 = W − ins.right − 0.55·d − 20, y0 = bubble bottom + 0.55·d + 16,
          //            y1 = groundY − 0.55·d − 30.
          // Portrait: x0 = ins.left + 0.55·d + 20, x1 = W − ins.right − 0.55·d − 20, y0 = bubble bottom + 0.55·d + 20,
          //           y1 = bao.box top − 0.5·d − 10 (the field is ABOVE Bao; the bottom row may come down to y1 + 0.3·d
          //           right of bao.box).
    homes: [{x, y}],      // n resting centres (farthest-point sampling in the field, min distance d + 22, seeded per round;
                          // ≥ 44 px above the bottom keep-outs; never under the bubble / HUD)
    d,                    // bubble DIAMETER: ages ≤ 4: 150, 5: 138, 6+: 126; × 1.1 when tall and it fits; shrinks (≥ 112) until n fit
    rainbow: { cx, cy, r, w },   // arch centre ON the cloud floor (cx = field centre x, cy = groundY + 30), outer radius
                          // r = min(0.5·(x1 − x0) + 0.4·d, groundY − bubble bottom − 30), band width w = clamp(0.16·r, 40, 70)
    hitR,                 // 0.6·d + 14 (nearest centre wins); phones: max(that, 92)
  }
  ```
- **Bubble hit test**: circle at the bubble's CURRENT centre (interpolated is the same within 1 px), r = `hitR`; nearest
  centre wins. Bao box → `pokeBao`. Surprise thing hit circles. Everything else → `soft`.
- Resting bubbles never overlap the speech bubble, the HUD, Bao's box, or the bottom 44 px keep-out.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand (no Kung Fu Panda / Po, no
  We Bare Bears, no Pusheen, no Care Bears, no Bubble Guppies, no Sanrio look). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox 256)
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark/light)**: red `#E84A4A/#A8282E/#F7A0A0`, blue `#3C8DE8/#1F5BA8/#A6CCF5`,
  yellow `#FFD23F/#C99A12/#FFEB9C`, green `#4CC26B/#2A8343/#A8E6B8`, orange `#FF9A2E/#C4650C/#FFCB8E`,
  purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2` (pink from age 5). `PB.PALETTE` in `content.js`.
  Below age 5 never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round.
- **Bubbles**: nearly clear film (white at 10–16 % alpha), a thin **iridescent rim** (soft pastel cyan → lilac → peach
  gradient around the edge, ≤ 0.55 alpha), one big curved white highlight upper-left + a small dot highlight, a faint
  bottom reflection. The thing inside is drawn UN-tinted (never washed by the film). Winter: a fine frost sparkle on the rim.
- **Stars (counting)**: golden `#FFC23A` / dark `#C98A12` — only ever counted, never asked by colour.
- **Rainbow**: 7 pastel bands (`#F6A6A6 #F8C49A #F7E19A #B9E3A8 #A9D2F2 #B9B2EE #E2B6E8`), alpha 0.75 when painted,
  unpainted part = a faint white dotted guide (0.25). Drawn behind the bubbles.
- **Bao**: a small round baby panda, sitting. Body / head white `#FBFAF6` (shade `#E3E0DA`, outline `#8B8794`), patches
  (ears, eye patches, arms, legs) soft charcoal `#3A3640` (outline `#24212A`, highlight `#57525E`), nose `#2B2830`,
  big eyes (`#1E1B24` pupils with catch-light inside the eye patches), rosy cheeks `#F4A7A0`, a **cream bandana `#EED9B5`**
  (outline `#B79E74`). Holds a **bubble wand** in the RIGHT paw (as seen): a wooden stick `#C8A27A` / `#8E6B45` with a
  silvery ring `#EEF3F6` / outline `#9AA7B0` and a soap film inside the ring (white 0.25 + iridescent edge). Never wears an
  answer colour.
- **Cloud land** (calm, pastel, slightly warm; the answer colours must pop): far = distant floating cloud islands with
  little round trees + a cloud castle silhouette; mid = big puffy cloud banks with small floating islands; ground = the fluffy
  cloud floor (Bao sits on it). Seasons (`spring | summer | autumn | winter`):
  spring: sky `#CFE6FA → #FCEFF4`, blossom-pink tiny trees (pale `#F4CADB`), petals;
  summer: sky `#86C9F0 → #E2F5FF`, bright sun, green round trees (muted `#9CCB98`), sun motes;
  autumn: sky `#F3C28F → #FCEBD3`, amber/rust trees (muted `#D9A06A`, `#C98A5E`), falling leaves, **wind gusts**;
  winter: sky `#B7C8E4 → #EEF2F9`, snow caps on islands, bare/white trees, snowfall, cool light.
  **Readability:** bubbles and their contents are never tinted by the mood; the background carries the mood.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Bao, surprises & icon — character artist A (`tools/art_bao.py`)
| File | viewBox | Notes |
|---|---|---|
| `characters/bao_{idle,blink,talk,happy,cheer,think,oops,blow,wave,giggle,dance}.svg` | 0 0 300 300 | Bao 3/4 view facing RIGHT (towards the field), eyes on the child, sitting, **feet anchor (150, 292)**, identical body in every frame; wand in the right paw: in idle/blink/talk/happy/think/oops/giggle the **wand ring centre at (250, 120), r 26** (rest); in **blow** the wand is raised in front of the mouth, **ring centre (214, 104), r 26**, cheeks puffed, lips "o"; happy = big smile; cheer = both paws up (wand up high, ring may move), eyes ^^; think = head tilt, paw at chin; oops = "hmm?" head tilt (never sad); talk = mouth open; wave = left paw waving; giggle = eyes ^^, paw over mouth; dance = bouncing pose |
| `characters/bao_title.svg` | 0 0 300 300 | title pose: Bao waving with the wand, a few bubbles around (bubbles in the SVG ok) |
| `characters/bird.svg`, `bird_flap.svg` | 0 0 120 100 | a small round swallow-like bird, soft slate-blue `#7F95B8` back (muted, NOT answer blue), cream belly, facing RIGHT, centre anchor (60, 50); flap = wings up |
| `characters/kite.svg` | 0 0 140 200 | a diamond paper kite in soft pastel patches (cream / peach / mint, muted), a ribbon tail with bows; anchor = the kite centre (70, 70); the string is drawn by code |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | Bao blowing three bubbles (a red ball, a duck, a star inside) on a cloud under a rainbow, full bleed |
Also write `game/js/bao_points.js`: `PB.BAO_POINTS = { feet: [150, 292], ring: [250, 120], blowRing: [214, 104], ringR: 26, mouth: [x, y] }`
(the exact numbers you drew) — the world uses it.

### 4.2 Animals — REUSED from Bo's Farm Parade (`animals/<a>.svg`, `<a>_step.svg`, 0 0 200 200, feet (100, 194), facing right):
`cow pig sheep duck hen horse goat crab penguin lion monkey fishbowl`. Homes: farm (first 7), sea (crab, fishbowl), ice
(penguin), savanna (lion), jungle (monkey). Generator `tools/art_animals.py` kept. Inside a bubble only the non-step frame is drawn.

### 4.3 Bubble art (canvas code) — character artist B: `game/js/bubble_art.js` → `PB.BubbleArt`
Pure canvas drawing (cache Path2D / offscreen bitmaps per thing+size), node-safe at load. Origin = the CENTRE of the thing.
```
PB.BubbleArt.drawBubble(ctx, r, opt)        // opt = { wob 0..0.3 (ellipse stretch), wobA (rad, stretch axis), t (s, rim
                                            //   shimmer phase), glow 0..1 (gold halo + rim pulse), frost 0..1, alpha 0..1,
                                            //   grow 0..1 (while still on the wand: a slightly flattened film), pop 0..1 (rupture:
                                            //   the film breaks into an expanding ring of short arcs that fade) }
PB.BubbleArt.drawThing(ctx, thing, size, opt)   // size = box height; opt = { glow, wiggle, night: 0 }
  // thing = { kind, color?, obj?, shape?, n?, animal?, text?, big? }
  //   kind 'toy'    : obj ∈ ball | duck (rubber duck) | umbrella | kite (little) | car (toy car) — in `color`
  //   kind 'shape'  : a chunky shape cookie/gem (circle|square|triangle|star|heart|oval|rect|diamond) in `color`
  //   kind 'stars'  : n golden stars (1–12) in a neat dice / rows layout, every star clearly separate
  //   kind 'tile'   : a round cloud card with `text` ("A", "a", "3+2", "7−4", numbers ≤ 20) in big rounded dark glyphs
  //                   (canvas font `bold <px> ui-rounded, "Arial Rounded MT Bold", system-ui`, colour #3A3640)
  //   kind 'animal' : PB.Assets.img('animals/<a>') (if loaded; else a soft placeholder), fit in the box
  //   big: false → drawn at size × 0.6 (age-3 size topic)
PB.BubbleArt.drawRainbow(ctx, rb, k, filled, opt)  // rb = layout.rainbow; the arch is split into k equal ANGLE pieces from the
                                            //   left foot; filled (float 0..k) = painted so far (a soft bright leading edge);
                                            //   opt = { shine 0..1 (sweeping white glint), alpha 0..1, guide 0..1 }
PB.BubbleArt.drawDrop(ctx, x, y, r, a)      // a soap droplet (pop spray)
PB.BubbleArt.drawMiniBubble(ctx, x, y, r, a)   // tiny bubbles (soft taps, Bao's giggle, celebration)
PB.BubbleArt.drawHomeBadge(ctx, home, r, opt)  // farm (barn), sea (waves + shell), ice (iceberg), jungle (palm), savanna (acacia + sun)
PB.BubbleArt.drawSnowflake(ctx, r, rot, a)  // big friendly 6-arm snowflake (winter surprise)
PB.BubbleArt.drawIcon(ctx, choice, size)    // Talk-time / picture choices: any thing, or {kind:'color', color} (paint blob),
                                            //   {kind:'number', n} (numeral + dots), {kind:'home', home}, {kind:'size', big}
PB.BubbleArt.drawHintHand(ctx, x, y, press, alpha)
```
Contact sheets: `tools/bubble_sheet.js` (Playwright) → `docs/art/bubble_*.png` at in-game size and 3× on all 4 season skies.

### 4.4 Environment — environment artist (`tools/art_env.js`, `tools/env_scenes.js`)
For `m ∈ spring|summer|autumn|winter`:
- `env/far_<m>.svg` (0 0 1200 720): distant floating cloud islands with tiny round trees, a soft cloud-castle silhouette;
  bottom-anchored, horizontally tileable (seam at 0/1200), transparent top. Sky colours in a comment `<!-- sky #top #bottom -->`.
- `env/mid_<m>.svg` (0 0 1200 300): big puffy cloud banks + 2–3 small floating islands (grass/snow tops by season); tileable.
- `env/ground_<m>.svg` (0 0 1200 260): the fluffy cloud floor (layered round puffs, top edge ≈ y 40–70, calm, very light),
  season decoration resting on it (spring: little blossoms; summer: sun glints; autumn: a few leaves; winter: snow sparkle). Tileable.
- `env/cushion_<m>.svg` (0 0 300 120, top-centre anchor (150, 30)): the puffy cloud Bao sits on (drawn under him).
- `env/sun.svg`, `env/moon.svg` (friendly crescent, no face; unused unless winter dusk), `env/cloud_a.svg`, `env/cloud_b.svg` (0 0 300 140).
- Particles (0 0 32 32): keep `mote sparkle star petal butterfly leaf confetti_a confetti_b dot`; add `snow` (soft
  snowflake dot), `blossom` (5-petal pink), `glint` (4-point sun glint).
- `tools/env_scenes.js` exports `RECIPE` (layer heights for H=720 landscape and portrait scaling, sky colours, sun position per
  season, the tall-portrait background ×1.36 rule) + composed scenes at 1556×720, 960×720, 720×1556 per season (with Bao's
  cushion, a fake rainbow and 5 fake bubbles) and a seam test into `docs/art/`.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `bubble_art.js` (+ `tools/bubble_sheet.js`, `tests/unit/bubble_art.test.js`) | character artist B |
| `characters/*`, `icon.svg`, `bao_points.js` (+ `tools/art_bao.py`, `tools/bao_sheet.js`) | character artist A |
| `env/*`, `particles/*` (+ `tools/art_env.js`, `tools/env_scenes.js`) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, `tests/e2e/*` | integrator |
Script order: rng, i18n, content, bao_points, world, weather, bot, storage, assets, audio, voice, input, bubble_art, render, ui, main.

### 5.1 Content (`content.js` → `PB.Content`)
```
PB.PALETTE, PB.COLORS ['red','blue','yellow','green','orange','purple','pink'], PB.SHAPES, PB.TOYS ['ball','duck','umbrella','kite','car'],
PB.ANIMALS = { cow:'farm', pig:'farm', sheep:'farm', duck:'farm', hen:'farm', horse:'farm', goat:'farm',
               crab:'sea', fishbowl:'sea', penguin:'ice', lion:'savanna', monkey:'jungle' }
PB.AGE_TOPICS = { 3:['colors','shapes','size','animals'], 4:['colors','shapes','count','animals'],
  5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
PB.Content.makeRound(topic, { age, lang, rng, roundIndex, level, surprise, short }) → round   // pure, deterministic, self-checks
PB.Content.makeTalk(topic, { age, lang, rng }) → talk   // { promptKey, params, show: thing | null, choices:[{id, thing}], answer }
PB.Content.topicsFor(age, rng, lastTopics), PB.Content.ageOf(a), PB.Content.validate(round) → null | reason
round = { topic, age, lang, roundIndex, surprise: null|'bird'|'kite'|'snow', mode: 'match'|'countPop',
  bubbles: [ { id, thing: { kind, color?, obj?, shape?, n?, animal?, home?, text?, big?, nameKind, nameValue }, target: bool } ],
  k,                                   // how many must be popped (= number of targets; countPop: the asked number n)
  promptKey, params,                   // e.g. 'p.colors' {color:'red', k:2}
  rule: { kind, value } }              // what the targets share (for kind words)
```
- `match` rounds: exactly `k` target bubbles share the rule value; every other bubble clearly does NOT (self-check).
  Bubbles per round (n) / targets (k): warm-up (round 0) n 3, k 1. Age 3: (3,1) (4,1) (4,2) (4,2); age 4: (3,1) (5,2)
  (5,2) (6,3) — level 0 of age 4: (3,1) (4,1) (5,2) (5,2); age 5: (4,1) (5,2) (6,2) (6,3); 6+: (5,1) (6,2) (6,2) (6,3).
  `short` rounds: n 4, k 1. Non-target bubbles use (age 3) 1 other value, (4) 2 other values, (5+) 3. Content varies every
  round; never the same set twice in a chapter; the target value changes every round in a chapter.
- `colors`: `toy` things. Round 0: all the same toy, different colours. Later: mixed toys; the targets share the colour
  (different toys at age ≥ 4). CVD-safe sets below age 5 (§3). `p.colors {color, k}`.
- `shapes` (ages 3–4): `shape` things, one colour per round (any palette colour, varies per round); age 3 shapes:
  circle/square/triangle/star/heart; never similar pairs together (square/rect, circle/oval, square/diamond). `p.shapes {shape, k}`.
  Age 5 `p.shapes5`: mixed colours on every bubble, the shape is the rule.
- `size` (age 3): the same toy, `big` true for targets (k), false for the others — or the reverse (`p.size {big, k}`).
- `count` (alternating modes):
  - `countPop` (rounds 0 and 2): all n bubbles hold the SAME thing (one star `stars n=1` or one toy), k = asked number
    (age ≤ 4: round 0 → 2, round 2 → 3 or 4, never ≥ n; age 5: 3–6; 6: 4–8 with n up to 9 — age 6 field may hold 9 small
    bubbles d ≥ 112), `p.countPop {n: k}` "Pop {n} bubbles!"; every pop is a target until k are popped (then the round ends,
    the rest whoosh away). Events carry `count: i+1` for the numeral.
  - `countSel` (rounds 1 and 3): `stars` things with different n; exactly one target with n = a; distractors differ by ≥ 2
    at age ≤ 4 (1–5), ≥ 1 at 5 (1–10, ≥ 2 when ≥ 6), to 12 at 6. n bubbles 3 / 4. `p.countSel {n: a}`; on pop the stars are
    counted aloud (event `count`).
- `animals`: `animal` things. Age 3 + every round 0: `p.animal {animal, k:1}` "Pop the {animal}!" (one target among other farm
  animals). Age ≥ 4 from round 1: `p.home {home, k}` "Who lives {home}? Pop them!" — target home farm (k 2–3) or a non-farm
  home with the available animals (sea k ≤ 2; ice/savanna/jungle k 1); distractors from 2 other homes at age 4, 3 at 5.
  The popped animal shows its home badge (event carries `home`).
- `letters` (5, capitals): `tile`, targets = one letter, distractors not look-alike (avoid E/F, O/Q/C/G, M/N/W, P/R/B, I/L/T, U/V).
  `p.letters {letter, k}`. `lower` (6): targets = the letter in BOTH cases (k = 2: "A" and "a"), distractors other letters in
  either case; drop l/I; no b/d/p/q together. `p.lower {letter}`.
- `initial` (6–7): animal or toy things whose names (in THAT language, i18n `name()` first letter, ignoring diacritics and the
  VI classifier "con/cái/quả/chiếc") start with the letter. `p.initial {letter, k}`.
- `add` / `sub` (6–7): tiles "2+3", targets equal n. `p.add {n, k}` "Pop the ones that make {n}!". `oddeven` (7): number
  tiles, `p.oddeven {parity, k}` "Pop the even numbers!".
- Talk time (`makeTalk`): colors → show a toy, "What colour is this?" (colour blobs); shapes → "Which one is the {shape}?"
  (shape choices); count → show a `stars` thing, "How many stars?" (number choices); animals → show a non-farm animal,
  "Where does the {animal} live?" (home badges; age 3: "Who is this?" animal choices); others as the parade. 2 choices at
  age 3, 3 at 4+.

### 5.2 `PB.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s; `_p*` previous values + `alpha` for interpolation)
Public API as the parade: `setViewport(W,H,ins), setAge, setLang, newSession({lastTopics}), levels, startLevel(i),
update(dt), drainEvents(), pointerDown/Move/Up(x,y), cancelDrag(), hint(), talkAnswer(id), prompt(), resetNudges(), skipTalk(),
layout, hudKeep, state, phase, level, topic, round, roundsPerLevel, stars, levelStars, roundStars, misses, talk, alpha,
stateTime, phaseTime, interactive, weather (= level % 4), bubbles, rainbow, bao, bird, kite, snowflakes, drops, minis,
hintHand, bubbleById(id), answer()`.
States `intro | round | roundDone | talk | levelDone | sessionDone`. Phases in a round: `'blow' | 'play' | 'rainbow' | 'whoosh' | 'out'`.
- **Bubble motion (physical):** each bubble `{ id, i, thing, target, x, y, vx, vy, r, hx, hy (home), state, grow, wob, wobV,
  wobA, glow, rot (thing rotation), rotV, popT, fx, fy, fs, ft (freed-thing flight), alpha, t (own time for shimmer) }`.
  Floating = a soft spring to a home point that wanders on a small Lissajous (±10 px, periods 3–5 s, per-bubble phase)
  (ω ≈ 2.4, ζ ≈ 0.55 — floaty, never snappy) + buoyancy wobble + the weather wind (`weather.wind` px/s², autumn gusts push
  everyone sideways, then they drift back) + pairwise soft collisions (overlap of `r_a + r_b + 6` → spring push-apart and a
  small velocity exchange, each contact kicks the membrane `wob`) + soft walls at the field edges / screen.
  Membrane: `wob` (0..0.3 stretch) is a damped spring (ω ≈ 13, ζ ≈ 0.12) along `wobA`; kicks from detach, collisions,
  wrong taps, gusts. The thing inside counter-rotates gently (`rot` spring ω ≈ 6, ζ ≈ 0.3).
- **blow** (≈ 0.5 s lead + 0.5 s per bubble): Bao mood `blow`; each bubble in turn grows on `bao.blowRing` (state 'grow',
  `grow` 0 → 1 over 0.35 s, r from 0.3·R to R, centre moves out from the ring along the blow direction), event
  `blow {i, x, y}`; then detaches (event `bubbleIn {id, i, x, y}`, wob kick 0.22) with an initial velocity towards its
  home (≈ 380–520 px/s, decaying in the floaty spring). After the last detaches + 0.4 s → `ask {promptKey, params, first}` → `play`.
- **play** — one active pointer, judged on `pointerDown` (hit test). A bubble in state 'float' (or 'grow' finished) only.
  - target → **right**: event `right {id, thing, x, y, i (0-based pop index), k, left, home?, count?}` and `pop {id, x, y, r}`:
    state 'pop' (`popT` 0 → 1 in 0.22 s; ≈ 14 droplets in `w.drops` fly out radially with gravity 900 px/s² and fade 0.6 s);
    the thing is freed: it **hops up** a little (squash), then flies along a curved arc (0.75 s, ease-in-out, apex ≥ 80 px
    above the straight line) to the rainbow's leading-edge point of piece i, shrinking to 0.35; on arrival event
    `paint {i, k, x, y}` and `rainbow.filled` animates from i to i+1 over 0.45 s (a sparkle burst at the edge).
    countSel: the stars are counted on the freed thing first (`count {id, i, x, y}` every 0.45 s, the thing hovers above the
    pop spot meanwhile), then it flies. Animal: `home` badge pops next to it for 0.9 s while hovering.
    Taps on other bubbles stay allowed while a freed thing flies (several targets).
  - `countPop` mode: ANY bubble is a target until k are popped (`right` carries `count: i+1`); after k, the input stops.
  - non-target → **wrong** `{id, got:{nameKind,nameValue}, want:{rule}, streak, x, y}`: jelly squish (wob kick 0.28 along the
    finger→centre axis), an impulse away from the finger (≈ 260 px/s), the thing does a "no-no" wiggle (rot kick 0.25). Counts
    as a miss; the same bubble again within 1 s is not a new miss (`squish` event only).
  - press on nothing → `soft {x, y}` + 5 mini bubbles at the finger (`w.minis`); 3 → hint, 6 → assist (a target glows big and
    the next press anywhere in the field picks it). Press on Bao → `pokeBao` (giggle + 3 mini bubbles from the wand).
  - After 2 misses or `hint()`: `hint {id}` — a target glows, the ghost hand moves to it and taps twice
    (`w.hintHand = {x, y, t, press, alpha, id}`, it follows the moving bubble); cooldown 6 s; idle nudges after 12 s, backoff
    ×1.5 up to 30 s (`idle {n}`; the 2nd idle also hints).
- **rainbow** (≈ 1.4 s): when the last piece is painted: `roundDone {round, stars, misses}` (3/2/1 for 0/1/≥ 2 misses;
  assisted ≤ 2) and `rainbowDone {x, y}` (x, y = the arch top) — `rainbow.shine` sweeps 0 → 1; Bao `cheer`.
- **whoosh** (≈ 1.6 s): Bao `blow` again, event `whoosh {}`; the leftover bubbles get an up-right wind (they wobble, rise
  and leave the screen; one may pop softly at the top edge → `pop {soft:true}`); event `away {id}` each.
- **out** (≈ 0.6 s): the rainbow fades (`rainbow.alpha` → 0); next round (blow) or Talk time after round 4 / once the chapter
  passed 75 s with ≥ 3 rounds done.
- `w.rainbow = { k, filled, _pfilled, shine, alpha, guide }` (+ geometry from layout).
- `w.bao = { mood idle|talk|happy|cheer|think|oops|blow|wave|giggle|dance, moodT, blink, look (−1..1), bounce 0..1 }`.
- Surprises (one round per chapter, rotating, never in the warm-up): chapters 0–2 rotate **bird** / **kite**, chapter 3
  (winter) **snow**:
  - bird: 2–5 s after the ask it flies in from one side along a gentle wave above the field (not over the speech bubble), perches
    on top of a NON-target bubble for 3 s (the bubble dips a little), then flies off (`w.bird = {x, y, flap 0..1, face ±1,
    state 'in'|'perch'|'loop'|'out'|'gone', t, on}`, event `bird`); tap → `birdTap` (loop-the-loop + tweet). It never blocks a
    target: a bubble under the bird stays tappable (the bubble wins when the finger is inside the bubble's own radius).
  - kite: drifts in from the left at the field's top, string to off-screen bottom-left, sways ~8 s, leaves (`w.kite = {x, y,
    rot, state, t}`, event `kite`); tap → `kiteTap` (a loop).
  - snow: 5 big snowflakes drift down between bubbles (`w.snowflakes[] = {x, y, r, rot, a, state}`, event `snow`); tap one →
    `snowTap {x, y}` (it twinkles into mini bubbles).
- Events also: `level {level, topic, weather}`, `round {round, surprise}`, `gust {dir}` (autumn, for a whoosh sound),
  `talk`, `talkAsk {n}`, `talkResult`, `levelDone`, `sessionDone {stars}`. Every positional event carries `x, y`.
- Rotation / resize mid-round: re-layout, new homes for the same bubbles (they drift there), freed things retarget the new
  rainbow, everything clamped into the screen.

### 5.3 `PB.Weather` — `setWeather(i, {instant})` (0 spring, 1 summer, 2 autumn, 3 winter; crossfade 2.5 s), `resize(W,H,groundY)`,
`update(dt)`, `wind` (px/s² horizontal force on bubbles: spring/summer a gentle ±6 breeze, autumn gusts every 6–10 s up to
±60 lasting 1.5 s with event `gust`, winter ±10), `ambient` (`skyTop, skyBottom, tint, light, sunX, sunY, sunA, mood`),
`clouds[]`, `particles[]`: spring petals + blossoms + butterflies, summer glints + motes, autumn leaves (blown by the wind),
winter snow. `burst(x, y, {kind: 'stars'|'sparkle'|'confetti'|'petals', n})`, `setParty(on)`. Cap 120.

### 5.4 `PB.Bot` — taps through `world.pointerDown/Up`: a target with p = skill (else a random non-target), aim error ±0.3 × r at
the bubble's current position, human-ish delays (0.8–2.4 s) after `ask` and between pops; answers Talk right with p = skill;
taps surprises sometimes.

### 5.5 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved); `window.PB.debug = { world, weather, mode, stats, events, getState(), setSpeed(n), startGame(), goTitle(),
setBot(on, skill), setAutoRestart(on), gotoLevel(i), voiceLog, bubbleScreen(id) → {x,y,r} CSS px, baoScreen(), birdScreen(),
kiteScreen(), snowScreen(), answer() → {bubble id} | null, targets() → [ids], toScreen(x,y), audio() }`.
World supplies `bubbleHit(id)` {x,y,r}, `baoHit()` box, `birdHit()`, `kiteHit()`, `snowHit()` (circles or null), `answer()`.

## 6. Voice, language — as the parade §6 with helper **Bao** (EN "Bao", VI "Gấu trúc Bảo" in titles, "Bảo" in lines), a gentle
little panda: pitch ≈ 1.15, rate ≈ 0.9. Things (VI): ball "quả bóng", duck "con vịt cao su", umbrella "cái ô", kite "con diều",
car "xe ô tô đồ chơi", shape "hình …" (hình tròn, hình vuông, hình tam giác, ngôi sao, trái tim, hình chữ nhật, hình thoi,
hình bầu dục), stars "ngôi sao", bubble "bong bóng"; animals "con bò, con heo, con cừu, con vịt, con gà mái, con ngựa, con dê,
con cua, bể cá vàng, chim cánh cụt, sư tử, con khỉ"; homes: farm "nông trại", sea "biển", ice "xứ băng", savanna "đồng cỏ
châu Phi", jungle "rừng rậm". Seasons: "mùa xuân, mùa hè, mùa thu, mùa đông".
`I18N` API used by main (all `(lang, e)` → string):
- `ask(lang, promptKey, params, {first})` — 3 wordings each; `first` only in a chapter's round 0 ("Look at the bubbles! Pop
  the RED one!"); k > 1 → plural ("Pop the red ones!" / "Bé chọc các bong bóng màu đỏ nhé!"); `p.countPop` "Pop {n} bubbles!";
  `p.countSel` "Pop the bubble with {n} stars!"; `p.animal` "Pop the {animal}!"; `p.home` "Who lives {on the farm|in the sea|
  on the ice|in the jungle|on the savanna}? Pop them!" (k = 1: "Pop the one who lives …"); `p.size`, `p.shapes`, `p.shapes5`,
  `p.letters`, `p.lower`, `p.initial`, `p.add`, `p.sub`, `p.oddeven`.
- `sayRight(lang, e)` — names the thing ("A red ball!" / "Quả bóng màu đỏ!") + `left > 0` → "One more!" / "Two more!"
  ("Còn một cái nữa!"); animals with home: "The penguin lives on the ice!". `sayCount(lang, i)` ("One!", "Một!"),
  `sayCountRun(lang, n, kind)` ("Three bubbles!" / "Four stars!").
- `sayWrong(lang, e)` — names it, then the goal ("That's a blue duck. Find a red one!" / "Đây là con vịt màu xanh dương.
  Mình tìm cái màu đỏ nhé!"), never negative words.
- `sayName(lang, thing)`, `talkWrong(lang, answer)`.
- Keys: `hint[]`, `idle[]`, `praise[]`, `great[]` with `{child}`, `rainbow[]` ("Rainbow!", "Cầu vồng rồi!"), `whoosh[]`
  ("Whoosh!", "Vù!"), `talk.*`, `weather.0..3` ("Spring in the clouds!", "Sunny summer!", "Windy autumn!", "Snowy winter!"),
  `surprise.bird`, `bird.tap`, `surprise.kite`, `kite.tap`, `surprise.snow`, `snow.tap`, `blow[]` (rare: "Here come the
  bubbles!"), `poke[]` (Bao giggles), `topic.*`, `session.done`, `party`, `ui.*` incl. `ui.volume`, logo lines "Bao's" /
  "Bubble Sky", VI "Gấu Trúc Bảo" / "Thổi Bong Bóng"; `ui.voice` "Bao's voice" / "Giọng của Bảo".

## 7. Integration — title (Bao waving with the wand, bubbles drifting up behind the logo, ▶ Play, star total, language toggle,
hold-⚙), settings with volume, HUD, speech bubble, pause with −/+, chapter banner, Talk time, session done (Bao blows a sky full
of bubbles that pop into confetti, Bao dances). Render order: sky → sun → clouds → far → mid → back particles → rainbow →
ground → Bao's cushion → Bao (+ wand film) → kite string + kite → bubbles (back-to-front by y; growing ones on the wand) →
things inside bubbles → bird → freed things (flying) → drops / mini bubbles → snowflakes → hint hand → front particles → fx →
banner. Audio: blow (soft breathy noise swell) per bubble + a little "blup" on detach, bubble bump (soft wet tick on
collisions, rate-limited), **pop** (bright short click + airy splash, pitch varies), paint (rising glassy chime per piece,
pitch climbs with i), rainbow done (shimmering arpeggio), wrong squish (rubbery "boing-wobble", low), soft tap (tiny bubbling),
count pip rising, whoosh (filtered noise sweep), gust (low wind swell), bird tweet, kite flutter, snow twinkle, ambience per
season (spring birds, summer bees + breeze, autumn wind, winter soft chimes), music bed per season (gentle marimba / kalimba
plucks, ducked under speech).

## 8. Performance — ≤ 9 bubbles, bubble film cached per radius bucket (offscreen canvas), things cached per thing+size, ≤ 120
particles, ≤ 60 drops; adaptive quality as before.
