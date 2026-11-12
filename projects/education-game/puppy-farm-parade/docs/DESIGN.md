# Bo's Farm Parade — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.FP`**. Classic `<script>` files, no build step, node-safe at load
(touch the DOM lazily). The code base is a copy of `../monkey-camp-chimes/` (state machine, voice, input, storage, loud audio
with volume, ui, main, tests) with `CC → FP` and storage prefix `fp:` already replaced. **The chime world is replaced by a
parade world.** When a detail is missing here, do what `../monkey-camp-chimes/docs/DESIGN.md` / `MECHANICS.md` / `VOICE.md`
do (i18n / voice API, hooks, Talk time, chapter-topic rotation between sessions, idle auto-pause, CONFIG style, hint cooldown /
idle backoff, prompt protection, phone layout tweaks, short rounds when a chapter runs long). Target: iPhone + iPad Safari
first, portrait and landscape.

## 1. What changes versus Kiki's Camp Chimes
| Kiki's Camp Chimes | Bo's Farm Parade |
|---|---|
| tap / swipe the asked chime | **tap (or flick) the ONE member of the parade that is different** (odd one out) |
| log beam with hanging chimes | **a parade line on a farm path** (3–5 members standing on the ground), a **barn** at the line's end, a **hay-bale stage** behind the line |
| Kiki the monkey + campfire | **Bo** (`bo`), a little caramel puppy with a brown ear and a leather collar, bottom-left, the parade leader |
| lanterns light, song cascade | the odd one **boings onto the hay bale**; the child taps the **barn doors**; the rest **march in step into the barn**; weathervane spins, stars burst |
| campsite, morning → night | **sunny farm** (hills, fields, windmill, silo, fence, pond), **morning → noon → sunset → starry night** |

## 2. Screen and layout
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
  Screen space = world space (no camera), y down. `ins` = safe-area insets in logical px. `hudKeep` boxes as before.
- `World.setViewport(W, H, ins)` computes `layout`:
  ```
  layout = { W, H, ins, portrait, tall /* H/W > 1.6 */, phone /* long/short > 1.9 */,
    groundY,              // H - ins.bottom - (portrait ? 26 : 14)
    bubble: {x,y,w,h}, hud: {x,y,w,h},     // as the chime game
    bo:   { x, y, h, w }, // FEET point + height. Landscape x = ins.left + 112, y = groundY − 4, h = 220.
                          // Portrait x = ins.left + 100, y = groundY − 4, h = 200 (Bo stands BELOW/in front of the line).
    line: { y, x0, x1 },  // the parade line: members' FEET y and the x range of their slots.
                          // Landscape: y = groundY − 96, x0 = bo.x + 120, x1 = barn.x − barn.w/2 − 30.
                          // Portrait: y = bo.y − bo.h − 70 (≥ bubble bottom + stage room), x0 = ins.left + 70, x1 = W − ins.right − 70.
    slots: [{x}],         // n member slots, centred in [x0, x1], spacing = clamp((x1 − x0)/n, 1.22 × item, 1.6 × item)
    item: 120,            // member size (height of the body box): ages ≤ 4: 120, 5: 112, 6+: 104; × 1.12 when tall and it fits;
                          // if 5 do not fit at 1.22 ×, item shrinks to itemMin = 100, then spacing to 1.12 ×.
    barn: { x, y, w, h, door: {x, y, w, h} },   // barn BASE CENTRE (x, y) and size; the door box is the tap target (+30 px pad).
                          // Landscape: x = W − ins.right − 130, y = line.y + 12, w = 250, h = 270.
                          // Portrait: barn stands at the line's RIGHT end but further back: x = W − ins.right − 105,
                          //   y = line.y − 6, w = 200, h = 216, and the line's x1 = barn.door.x − 40 (members walk to the door).
    stage: { x, y, s },   // hay-bale stage TOP-CENTRE where the odd one lands (it stands on it), s = draw scale (perspective).
                          // Landscape: x = (line.x0 + line.x1)/2, y = line.y − 200, s = 0.9.
                          // Portrait: x = W/2, y = line.y − 230, s = 0.95. Must be ≥ 30 px below the bubble bottom.
    homeBadge: { x, y, r },   // the home badge the odd ANIMAL shows: beside the stage (stage.x + 120, stage.y − 60, r = 46)
    entryX,               // where members enter: ins.left − 160 (they walk in behind Bo)
  }
  ```
- **Member hit test**: circle at the member's body centre (feet y − size/2, current position incl. hop), r = 0.6 × size + 14;
  nearest centre wins (neighbours may touch, never overlap the decision). Bo box → `pokeBo`. Barn door box → `door` (gate phase).
  Everything else is no target (except surprises; a member under the finger always wins over a surprise).
- Resting members are ≥ 44 px above the bottom HUD keep-outs; nothing interactive under the home indicator.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand (no Paw Patrol / Bluey / Snoopy /
  Peppa / Animal Crossing / Hay Day / Farmville look). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox 256)
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark/light)**: red `#E84A4A/#A8282E/#F7A0A0`, blue `#3C8DE8/#1F5BA8/#A6CCF5`,
  yellow `#FFD23F/#C99A12/#FFEB9C`, green `#4CC26B/#2A8343/#A8E6B8`, orange `#FF9A2E/#C4650C/#FFCB8E`,
  purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2` (pink from age 5). `FP.PALETTE` in `content.js`.
  Below age 5 never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round.
- **Wood** (wagons, crates, tiles, fence): `#B98552` / dark `#7A5130` / light `#DDB07E`. **Hay**: `#E9C46A` / dark `#B8913A` /
  light `#F6E2A6` (the hay is a soft straw, less saturated than answer yellow; never next to a yellow member without the wood rim).
  **Apples** in crates: `#D9483B` (fixed, apples are counters, never asked by colour). **Metal** (wheel hubs, buckets' handles):
  `#9AA4AE` / `#636C75`.
- **Bo**: a small round puppy, fur **caramel `#D9A066`** (shade `#B98250`, outline `#7A4E2C`), cream muzzle / chest / paws
  `#F6E7CF`, one **dark-brown ear `#7A4B2A`** (the other ear caramel), a dark nose `#3A2B2B`, big round eyes (`#2F2A3A` pupils,
  catch-light), rosy cheeks `#F2A99A`, a waggy tail, a **brown leather collar `#8C5A3C` with a brass tag `#D8B26A`**.
  Never wears an answer colour.
- **Farm** (calm, desaturated, slightly yellow-green; the answer colours must pop): far = rolling hills with patchwork fields,
  a windmill and a silo; mid = a wooden fence line, haystacks, a small pond with reeds, a tree; ground = a grassy meadow with a
  **dirt path band** (the parade path `#D8BE95`, edges `#BFA27A`) where the line stands. The **barn** is weathered wood in a
  **muted terracotta `#B5735E`** (dark `#7E4A3C`, trim cream `#F1E6CF`) — never answer-red-saturated; a weathervane rooster
  silhouette on the roof. Moods (`morning | noon | sunset | night`):
  morning: sky `#F8DCC6 → #FDF4E3`, low sun upper-left, mist bands over the fields;
  noon: sky `#7CC4EE → #D6F0FB`, bright, sun high, puffy clouds;
  sunset: sky `#F29B6B → #FBD7A5`, sun low right, long warm light, silhouetted windmill;
  night: sky `#1E2A4A → #3B4C78`, a crescent moon, star field, barn windows glowing warm, fireflies.
  **Night readability:** members are always drawn un-tinted with a soft warm rim light; the ground and far layers carry the darkness.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Bo, surprise birds & icon — character artist A (`tools/art_bo.py`)
| File | viewBox | Notes |
|---|---|---|
| `characters/bo_{idle,blink,talk,happy,cheer,think,oops,wave,point,bark,dance}.svg` | 0 0 300 300 | Bo 3/4 view facing RIGHT (towards the parade) but eyes on the child, standing on four paws / sitting, **feet anchor (150, 292)**, identical body in every frame; happy = big smile, tail up; cheer = sitting up, both front paws up, eyes ^^; think = head tilt, one paw raised; oops = "hmm?" head tilt, ears perked (never sad); talk = mouth open; wave = one front paw waving; point = nose + paw pointing right; bark = mouth wide open "woof", ears flying up, little motion arcs (no letters); dance = hop pose, tail swirl |
| `characters/bo_title.svg` | 0 0 300 300 | title pose: Bo waving, wearing a tiny parade-leader cap in cream / brown (NOT an answer colour) |
| `characters/chick.svg`, `chick_step.svg`, `chick_flap.svg` | 0 0 120 120 | a fluffy chick (soft butter `#F7E3A0` — paler than answer yellow, with a darker outline `#C9A44A`), facing RIGHT, feet anchor (60, 116); step = other foot forward; flap = wings up, beak open |
| `characters/rooster.svg`, `rooster_crow.svg` | 0 0 160 180 | a proud rooster (cream/white body `#F5EFE4`, brown-gold tail `#B98552` / `#8A6A3A`, small comb in a soft coral `#E07A6A`), facing LEFT, feet anchor (80, 176); crow = head up, beak open, chest out |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | Bo leading a little parade (a bucket on a wagon + a sheep) towards a barn, warm morning farm, full bleed |

### 4.2 Animals — character artist C (`tools/art_animals.py`)
`animals/<a>.svg` and `animals/<a>_step.svg` (0 0 200 200, **feet anchor (100, 194)**, facing RIGHT — the parade walks right,
body box ≈ 180 tall incl. head, identical body; `_step` = the legs in the other phase so alternating = walking) for
farm: `cow pig sheep duck hen horse goat`; not farm: `crab penguin lion monkey fishbowl` (a goldfish in a round glass bowl
on two tiny wheels — fish cannot walk). Cute baby proportions (big head, short legs), muted natural fur / feather colours
(the pig soft pink `#F2B8B0` but clearly paler than answer pink; the duck's beak a soft orange `#F0A65A`; no saturated answer
colours on bodies). White sticker-ish 6 px outer outline so they read on the path and the dark night.

### 4.3 Parade art (canvas code) — character artist B: `game/js/parade_art.js` → `FP.ParadeArt`
Pure canvas drawing (Path2D cached per thing+size), node-safe at load. **Anchor: origin = the member's FEET centre (bottom),
the body goes UP (−y), `size` = body box height.** The caller sets the transform (translate to feet, scale squash, rotate tilt).
```
FP.ParadeArt.drawMember(ctx, thing, size, opt)
  // thing = { kind, color?, obj?, shape?, n?, animal?, text?, big? }
  //   kind 'obj'    : obj ∈ bucket|boot|can (watering can)|tractor (toy)|flower (in a little pot) — painted in `color`, riding
  //                   a small wooden WAGON (2 wheels); wheel rotation opt.wheel (radians)
  //   kind 'block'  : a chunky toy shape block (shape ∈ circle|square|triangle|star|heart|oval|rect|diamond) in `color`, on a wagon
  //   kind 'crate'  : a wooden crate with n apples (1–12, neat dice/rows layout, every apple clearly separate), on a wagon
  //   kind 'tile'   : a wooden sign board on a post-cart with `text` (letters, "3+2", "7−4", numbers ≤ 20) in big rounded
  //                   dark-brown glyphs (draw glyphs with canvas font `bold <px> ui-rounded, "Arial Rounded MT Bold", system-ui`)
  //   kind 'animal' : draws the SVG image FP.Assets.img('animals/<a>' or '_step') (if loaded; else a soft placeholder),
  //                   frame by opt.step (0|1)
  //   big: false → drawn at size × 0.62 (age-3 size topic: "the little one")
  // opt = { glow 0..1 (soft gold halo + outline pulse), dim 0..1, wheel (rad), step 0|1, night 0..1 (warm rim light, never
  //         darkens the body), count -1..n (crate: the first `count` apples get a white ring + shine while being counted),
  //         shake (−1..1 "no-no" wobble offset is applied by the caller; art only reacts with eyes/brows if any) }
FP.ParadeArt.drawWagon(ctx, w, wheel)            // used by drawMember; exported for the title/icon
FP.ParadeArt.drawStage(ctx, s, opt)              // hay-bale stage (origin = TOP centre where a member stands), a small rosette
                                                 // ribbon on its front in cream/brown, opt.pop 0..1 (squash when landed on)
FP.ParadeArt.drawHomeBadge(ctx, home, r, opt)    // round badge: farm (barn), sea (waves + shell), ice (iceberg), jungle (palm +
                                                 // leaves), savanna (acacia + sun) — white rim, muted colours
FP.ParadeArt.drawIcon(ctx, choice, size)         // Talk-time / picture choice icons: any member thing, or
                                                 // {kind:'color', color} (a paint blob), {kind:'number', n} (numeral + dots),
                                                 // {kind:'home', home}, {kind:'size', big}
FP.ParadeArt.drawHintHand(ctx, x, y, press, alpha)
FP.ParadeArt.drawDust(ctx, x, y, r, alpha)       // little dust puff (feet / landing)
```
Contact sheets: `tools/parade_sheet.js` (Playwright) → `docs/art/parade_*.png` at in-game size and 3× on path / grass / night.

### 4.4 Environment — environment artist (`tools/art_env.js`, `tools/env_scenes.js`)
For `m ∈ morning|noon|sunset|night`:
- `env/far_<m>.svg` (0 0 1200 720): rolling hills, patchwork fields, a windmill and a silo far away; bottom-anchored,
  horizontally tileable (seam at 0/1200), transparent top. Sky colours in a comment `<!-- sky #top #bottom -->`.
- `env/mid_<m>.svg` (0 0 1200 300): fence line, haystacks, a pond with reeds, a round tree, bushes; bottom-anchored, tileable.
- `env/ground_<m>.svg` (0 0 1200 260): grassy meadow, muted little flowers, pebbles; the **dirt path band** is drawn by code
  (render) at `line.y`, so the ground stays plain-ish where the path goes (rows 80–200 calm). Tileable.
- `env/barn_<m>.svg` (0 0 300 320, base anchor (150, 316)): the barn with an **open dark doorway** (doors NOT painted), a hay
  loft window (night: glowing warm), a roof with the weathervane post (the vane itself is separate);
  `env/barn_door_l.svg`, `env/barn_door_r.svg` (0 0 70 150, hinge on the outer edge: left door hinge x=0, right door hinge x=70,
  bottom anchor) — muted terracotta with cream X-bracing; `env/vane.svg` (0 0 80 80, centre pivot (40, 64)): a rooster
  weathervane arrow, dark metal.
- `env/sun.svg`, `env/moon.svg` (0 0 200 200, friendly crescent, no face), `env/cloud_a.svg`, `env/cloud_b.svg` (0 0 300 140).
- Particles (0 0 32 32): `mist` (64×32 allowed), `mote`, `sparkle`, `star`, `firefly`, `petal`, `butterfly`, `leaf`,
  `confetti_a`, `confetti_b`, `dot` (white, tinted by code), `dust` (soft round puff), `feather` (small cream feather).
- `tools/env_scenes.js` exports `RECIPE` (layer heights for H=720 landscape and portrait scaling, sky colours, sun / moon
  positions per mood, the tall-portrait background ×1.36 rule, star-field density, path band colours) + composed scenes at
  1556×720, 960×720, 720×1556 per mood (with a barn and a fake line of 4 coloured boxes) and a seam test into `docs/art/`.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `parade_art.js` (+ `tools/parade_sheet.js`, `tests/unit/parade_art.test.js`) | character artist B |
| `characters/*`, `icon.svg` (+ `tools/art_bo.py`, `tools/bo_sheet.js`) | character artist A |
| `animals/*` (+ `tools/art_animals.py`, `tools/animal_sheet.js`) | character artist C |
| `env/*`, `particles/*` (+ `tools/art_env.js`, `tools/env_scenes.js`) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, `tests/e2e/*` | integrator |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, parade_art, render, ui, main.

### 5.1 Content (`content.js` → `FP.Content`)
```
FP.PALETTE, FP.COLORS ['red','blue','yellow','green','orange','purple','pink'], FP.SHAPES, FP.OBJECTS ['bucket','boot','can','tractor','flower'],
FP.ANIMALS = { cow:'farm', pig:'farm', sheep:'farm', duck:'farm', hen:'farm', horse:'farm', goat:'farm',
               crab:'sea', fishbowl:'sea', penguin:'ice', lion:'savanna', monkey:'jungle' }
FP.AGE_TOPICS = { 3:['colors','shapes','size','animals'], 4:['colors','shapes','count','animals'],
  5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
FP.Content.makeRound(topic, { age, lang, rng, roundIndex, level, surprise, short }) → round   // pure, deterministic, self-checks
FP.Content.makeTalk(topic, { age, lang, rng }) → talk   // { promptKey, params, show: thing | null, choices:[{id, thing}], answer }
FP.Content.topicsFor(age, rng, lastTopics)
FP.Content.validate(round) → null | reason
round = { topic, age, lang, roundIndex, surprise: null|'chick'|'rooster'|'fireflies',
  members: [ { id, thing: { kind, color?, obj?, shape?, n?, animal?, home?, text?, big?, nameKind, nameValue }, odd: bool } ],
  oddId, promptKey, params,            // the ask (e.g. 'p.colors' {color:'red'} = the colour the OTHERS share)
  rule: { kind, value },               // what the majority shares, for kind words: {kind:'color', value:'red'} / shape / n / home / letter / sum / parity / size / animal / initial
}
```
- **Exactly one odd member**; every other member shares the rule value AND the odd one clearly does not (self-check). Members
  vary in everything that is NOT the rule when the age allows (colours round at age 4 from round 2: different objects all red;
  shapes round: all one colour at ages ≤ 4, mixed colours at 5). The odd one's slot is random but never the same slot in two
  consecutive rounds, and not always an end.
- Members per round: warm-up (round 0) 3. Age 3: 3, 3, 3, 4; age 4: 3, 4, 4, 5 (level 0: 3, 3, 4, 4); age 5: 3, 4, 5, 5; 6+: 4, 5, 5, 5.
  `short` rounds: 3 (age 3–4) / 4. Max 5. Content varies every round; never the same set twice in a chapter.
- `colors`: `obj` members. Round 0: all the same object, the odd one another colour. Later: mixed objects (age ≥ 4), the rule
  colour shared. Odd colour must be a CVD-safe pair with the rule colour (below age 5 see §3). `p.colors {color}` "Which one is NOT {color}?"
- `shapes` (ages 3–4): `block` members, one colour per round; rule shape vs odd shape; never similar pairs (square/rect,
  circle/oval, square/diamond, heart/... ) — age 3 shapes: circle/square/triangle/star/heart. `p.shapes {shape}`.
  Age 5 (`p.shapes5 {shape}`): mixed colours, odd shape.
- `size` (age 3): same object or same animal, all `big` except the odd one (little). `p.size {}` "Which one is the little one?"
- `count`: `crate` members, all n = a except the odd n = b; age ≤ 4: a, b ∈ 1–5, |a − b| ≥ 2 (warm-up 1 vs 3 / 2 vs 4 style);
  age 5: 1–10, |a − b| ≥ 1 but ≥ 2 when ≥ 6; age 6: up to 12. `p.count {n: a}` "Which crate does not have {n} apples?"
  On right: the odd crate's apples are counted aloud (event `count`).
- `animals`: `animal` members. Age 3 + every round 0: two/three of the same farm animal + one other farm animal
  (`p.animal {animal}` "Which one is not a {animal}?"). Age ≥ 4 from round 1: different farm animals + one non-farm animal
  (`p.farm {}` "Who doesn't live on the farm?"); the odd one's `home` is shown on the home badge when it lands.
- `letters` (age 5, capitals): `tile` members, all one letter, odd = another letter that does not look alike (avoid E/F,
  O/Q/C/G, M/N/W, P/R/B, I/L/T, U/V). `p.letters {letter}`. `lower` (6): the same letter in both cases (A, a mixed) + one other
  letter; drop l/I; no b/d/p/q together. `p.lower {letter}`.
- `initial` (6–7): animal or object members whose names (in THAT language, i18n `name()` first letter, ignoring diacritics and
  the VI classifier "con/cái/quả") start with the same letter + one that does not; a little letter flag on the sign. `p.initial {letter}`.
- `add` / `sub` (6–7): tiles "2+3" etc., all equal the same value except one. `p.add {n}` "Which one does not make {n}?".
- `oddeven` (7): number tiles, all even + one odd (or the reverse) `p.oddeven {parity}` "Which number is not {parity}?".
- Talk time (`makeTalk`): colors → show an obj, "What colour is this?" choices colour blobs; shapes → "Which one is the {shape}?"
  block choices; count → show a crate, "How many apples?" number choices; animals → show a non-farm animal, "Where does the
  {animal} live?" home badge choices (age 3: "Who is this?" animal choices); others as the chime game. 2 choices at age 3, 3 at 4+.

### 5.2 `FP.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s; `_p*` previous values + `alpha` for interpolation)
Public API as the chime game: `setViewport(W,H,ins), setAge, setLang, newSession({lastTopics}), levels, startLevel(i),
update(dt), drainEvents(), pointerDown/Move/Up(x,y), cancelDrag(), hint(), talkAnswer(id), prompt(), resetNudges(), skipTalk(),
layout, hudKeep, state, phase, level, topic, round, roundsPerLevel, stars, levelStars, roundStars, misses, talk, alpha,
stateTime, phaseTime, interactive, weather (= level % 4), members, stage, barn, bo, chick, rooster, fireflies, hintHand,
memberById(id), answer()`.
States `intro | round | roundDone | talk | levelDone | sessionDone`. Phases in a round: `'enter' | 'play' | 'hop' | 'gate' | 'march' | 'out'`.
- **Member motion (physical):** each member has a slot target `tx`; x follows with a critically-damped-ish spring
  (ω ≈ 9, ζ ≈ 0.8) while WALKING it hops: walking = a step cycle (stepRate ≈ 3.2 steps/s for animals; wagons roll: `wheel +=
  dx / wheelR`), each step a small parabolic bob (6–9 px) with a landing squash (sx 1.06, sy 0.94, spring back ω ≈ 16, ζ ≈ 0.4)
  and a forward tilt proportional to speed (pendulum lag, ≤ 0.12 rad). Standing: idle breathing bob (±1.5 px, 0.6 Hz, per-member phase)
  and an occasional look/hop. `step` frame flips each step (animals).
- **enter** (≈ 1.6–2.4 s): members spawn at `entryX` one after another (0.28 s apart) and walk to their slots; event
  `memberIn {id, i, x, y}` on arrival (a little settle squash); when all stand → `ask {promptKey, params, first}` → `play`.
- **play** — one active pointer; a gesture's FIRST contact is judged on `pointerDown` (hit test); a press that starts on
  nothing, then moves onto a member within 0.25 s (a flick), is judged on that member. Later contacts of the same gesture ignored.
  - the odd one → **right**: event `right {id, thing, x, y, count?: {n}, home?}` → phase **hop**: the member jumps in a ballistic
    arc (apex ≥ 120 px above the higher end, flight 0.75 s, spin a little, stretch at take-off, squash on landing) onto the stage
    (event `land {id, x, y}`, stage `pop`), animals show the home badge (`w.stage.badge = {home, a 0..1}`). Crates: the apples
    are counted one by one (`member.count` 0..n, `countStep` 0.5 s, event `count {id, i, x, y}` each) on the stage. The other
    members **close the gap**: slots are recomputed for n − 1 members, they walk (with steps) to their new slots. Then
    `roundDone {round, stars, misses}` (3/2/1 for 0/1/≥ 2 misses; assisted ≤ 2) and phase **gate**.
  - a matching member → **wrong** `{id, got:{nameKind,nameValue}, want:{rule}, streak, x, y}`: it does a "no-no" wiggle
    (rotation spring kick ±0.18 rad, ω ≈ 18, ζ ≈ 0.25) + a small hop (18 px) in place; counts as a miss. Pressing the same
    wrong member again within 1 s is not a new miss (just wiggles).
  - press on nothing → `soft {x, y}` + a dust puff (`w.puffs`), no line; counts as a tap without progress
    (3 → hint, 6 → assist: the odd one glows big and the next press ANYWHERE in the line band picks it). Press on Bo → `pokeBo`.
  - After 2 misses or `hint()`: `hint {id}` — the odd one glows, the ghost hand moves to it and taps twice
    (`w.hintHand = {x, y, t, press, alpha, id, mode:'tap'}`); cooldown 6 s; idle nudges after 12 s, backoff ×1.5 up to 30 s
    (`idle {n}`; the 2nd idle also hints).
- **gate**: event `gateAsk {}` (main: "Open the barn!"); after 1.2 s without a tap the ghost hand points at the doors. Tap the door
  box or ANY member (or the barn) → doors open (event `doorOpen {x, y}`), or auto after `gateWait` 4 s (`doorOpen {auto:true}`).
  Doors: each door angle 0 → 1 (open) with an overshoot spring (ω ≈ 8, ζ ≈ 0.35), drawn as a horizontal squash (cos) about its hinge.
- **march** (≈ 2.5 s): members walk in step (ALL step together, synchronised bob, event `marchStep {i}` each step for a
  clip-clop sound) one after another into the doorway; a member that reaches `door.x` shrinks a little (scale 1 → 0.85, it
  goes "in") and is hidden behind the door frame (render draws the barn front frame over it); event `inBarn {id}` each. The odd
  one on the stage waves (a little hop) and when everyone is in: animals hop off towards the left edge (to their home), objects
  bounce once and roll off left. Weathervane spins (`w.barn.vane` angle + `vaneSpin`), a star burst from the roof (event
  `parade {x, y}` at the roof). Bo `cheer`.
- **out** (≈ 0.8 s): doors close (spring), event `doorClose`; next round (enter) or Talk time after round 4 / once the chapter
  passed 75 s with ≥ 3 rounds done.
- `w.members[] = { id, thing, odd, slot, x, y (FEET), tx, vx, bob, sx, sy, rot, rotV, wheel, step, stepT, state 'enter'|'stand'|
  'hop'|'stage'|'march'|'in'|'leave'|'gone', glow 0..1, dim, count -1..n, scale, hopT, + _px _py _prot _psx _psy }`.
- `w.stage = { x, y, s, pop, memberId|null, badge|null }`, `w.barn = { door 0..1, _pdoor, doorV, vane, vaneSpin }`.
- `w.bo = { mood idle|talk|happy|cheer|think|oops|wave|point|bark|dance, moodT, blink, look (−1..1), hop 0..1 }`.
- Surprises (one round per chapter, rotating, never in the warm-up): chapters 0–2 rotate **chick** / **rooster**, chapter 3 (night) **fireflies**:
  - chick: 2–6 s after the ask it scurries in from the left at the end of the line (behind the last member, never in a slot,
    never a target for the answer) and waits, pecking (`w.chick = {x, y, step, flap 0..1, state 'run'|'peck'|'march'|'in'|'gone', t}`,
    event `chick`); tap → `chickTap` (it flaps + peeps); in **march** it marches into the barn last.
  - rooster: appears on the mid-layer fence top at a spot that is ≥ 120 px from the stage and the bubble (`w.rooster = {x, y,
    crow 0..1, state 'in'|'stand'|'leave', t}`, event `rooster`); tap → `roosterTap` (crow); it leaves after ≈ 8 s.
  - fireflies: 5 fireflies drift near the line band, between members (`w.fireflies[] = {x, y, r, glow, phase, state}`, event
    `fireflies`); tap one → `fireflyTap {x, y}`.
- Events also: `level {level, topic, weather}`, `round {round, surprise}`, `talk`, `talkAsk {n}`, `talkResult`, `levelDone`,
  `sessionDone {stars}`. Every positional event carries `x, y`.
- Rotation / resize mid-round: re-layout; cancel the gesture; slots re-placed, members snap their `tx` and walk; a hop in
  flight retargets the new stage; members are clamped into the screen.

### 5.3 `FP.Weather` — `setWeather(i, {instant})` (0 morning, 1 noon, 2 sunset, 3 night; crossfade 2.5 s), `resize(W,H,groundY)`,
`update(dt)`, `ambient` (`skyTop, skyBottom, tint, light 0..1, sunX, sunY, sunA, moonA, starsA, glow 0..1 (barn window glow:
morning 0.1, noon 0, sunset 0.4, night 1), mood`), `stars[]`, `clouds[]`, `particles[]`: morning mist bands + motes, noon
butterflies + petals, sunset golden motes + a few leaves, night fireflies. `addDust(x, y, n)`, `burst(x, y, {kind:
'stars'|'sparkle'|'feathers'|'confetti', n})`, `setParty(on)`. Cap 120.

### 5.4 `FP.Bot` — taps through `world.pointerDown/Up`: taps the odd one with p = skill (else a random other member), aim
error ±0.3 × r, human-ish delays (0.8–2.4 s) after `ask`; sometimes flicks (down on empty ground just beside, move onto the
member); gate: taps the door (or waits for auto); answers Talk right with p = skill; taps surprises sometimes.

### 5.5 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved); `window.FP.debug = { world, weather, mode, stats, events, getState(), setSpeed(n), startGame(), goTitle(),
setBot(on, skill), setAutoRestart(on), gotoLevel(i), voiceLog, memberScreen(id) → {x,y,r} CSS px, doorScreen() → {x,y,w,h},
boScreen(), chickScreen(), roosterScreen(), fireflyScreen(), answer() → {member} | {door:true} | null, toScreen(x,y), audio() }`.
World supplies `memberHit(id)` {x,y,r}, `doorHit()` box, `boHit()` box, `chickHit()`, `roosterHit()`, `fireflyHit()` (circles or null), `answer()`.

## 6. Voice, language — as the chime game §6 with helper **Bo** (EN "Bo", VI "Cún Bo" in titles, "Bo" in lines), a cheerful
little puppy: pitch ≈ 1.2, rate ≈ 0.9. Things (VI): bucket "cái xô", boot "chiếc ủng", watering can "bình tưới", tractor "xe
máy cày", flower "chậu hoa", block "khối hình …", crate "thùng táo" (n "quả táo"), animals "con bò, con heo, con cừu, con vịt,
con gà mái, con ngựa, con dê, con cua, bể cá vàng, chim cánh cụt, sư tử, con khỉ"; homes: farm "nông trại", sea "biển", ice
"xứ băng", savanna "đồng cỏ châu Phi", jungle "rừng rậm"; shapes "hình tròn, hình vuông, hình tam giác, ngôi sao, trái tim,
hình chữ nhật, hình thoi, hình bầu dục".
`I18N` API used by main (all `(lang, e)` → string):
- `ask(lang, promptKey, params, {first})` — 3 wordings each: `p.colors` "They're all {color}… but one! Which one is NOT {color}?"
  (first) / "Which one is not {color}?"; `p.shapes`, `p.shapes5` "Which one is not a {shape}?"; `p.size` "Which one is the
  little one?"; `p.count` "Which crate does not have {n} apples?"; `p.animal` "Which one is not a {animal}?"; `p.farm` "Who
  doesn't live on the farm?"; `p.letters`/`p.lower` "Which letter is not {letter}?"; `p.initial` "Which one does not start with
  {letter}?"; `p.add`/`p.sub` "Which one does not make {n}?"; `p.oddeven` "Which number is not {parity}?".
- `sayRight(lang, e)` — names the odd one and why ("The blue bucket! It's not red." / "Cái xô màu xanh dương! Nó không phải
  màu đỏ."); farm: "The penguin! The penguin lives on the ice." `sayCount(lang, i)`, `sayCountRun(lang, n, othersN)`
  ("One, two, three, four apples! The others have two.").
- `sayWrong(lang, e)` — names it + it matches, then the goal ("That one is red, like its friends. Find the one that's not red!").
- `sayName(lang, thing)`, `talkWrong(lang, answer)`.
- Keys: `hint[]`, `idle[]`, `praise[]`, `great[]` with `{child}`, `woof[]` ("Woof! You found it!"), `gate[]` ("Open the barn!"),
  `gateShort[]`, `march[]` ("Hop, hop, hooray!"), `talk.*`, `weather.0..3` ("Good morning, farm!", "Sunny noon!", "Sunset
  time!", "Starry night!"), `surprise.chick`, `chick.tap`, `surprise.rooster`, `rooster.tap`, `surprise.fireflies`,
  `firefly.tap`, `enter[]` ("Here comes the parade!"), `topic.*`, `session.done`, `party`, `ui.*` incl. `ui.volume`, logo
  lines "Bo's" / "Farm Parade", VI "Cún Bo" / "Tìm Bạn Lạc Đàn".

## 7. Integration — title (Bo in the parade cap waving beside a little line: a bucket wagon, a sheep, a block, ▶ Play, star
total, language toggle, hold-⚙), settings with volume, HUD, bubble, pause with −/+, chapter banner, Talk time, session done
(the friends parade out of the barn in a loop, Bo dances, confetti). Render order: sky → stars → sun / moon → clouds → far →
mid → rooster → ground → path band → barn back (incl. dark doorway) → stage + home badge → members behind the line (none) →
members (sorted by x; marching members that are "in" clipped by the door frame) → barn front frame + doors + vane → Bo → chick →
fireflies → hint hand → front particles → fx → banner. Audio: walk steps (soft wooden "tok" per step, wagons a rolling rattle),
hop "boing" (rising pitch) + landing thump, right "ding-ding" + Bo bark (synth: short formant "woof"), wrong soft "boop-boop"
wobble, count apple "pip" rising per apple, door creak (soft, filtered noise sweep) + clunk, march clip-clop in step + little
fanfare at the end, vane whirr, chick peep, rooster crow (synth sweep, gentle), firefly twinkle, ambience per mood (morning
birds, noon breeze + bees, sunset crickets start, night crickets), music bed per mood (bouncy ukulele/marimba plucks, ducked
under speech and during the march fanfare).

## 8. Performance — ≤ 5 members (+ chick), Path2D / bitmap cached per thing+size, ≤ 120 particles; adaptive quality as before.
