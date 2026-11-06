# Momo's Toy Train — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.TT`**. Classic `<script>` files, no build step, node-safe at load
(touch the DOM lazily). The code base is a copy of `../frog-rainy-band/` (state machine, voice, input, storage, loud audio
with volume, ui, main, tests) with `RB → TT`, storage prefix `tt:`, `band_art.js → train_art.js`, `BandArt → TrainArt`
already replaced. **The band world is replaced by a drag-and-load train world.** For drag physics, tap-vs-drop, drop zones,
wrong-drop bounce, count mode and "ask"/sort mode reuse the proven code of `../owl-snow-garden/` and `../dino-nest-sort/`
(`world.js`, `content.js`, `bot.js`). When a detail is missing here, do what `../frog-rainy-band/docs/DESIGN.md` does
(i18n/voice API, hooks, Talk time, chapter-topic rotation between sessions, idle auto-pause, CONFIG style, event names that
still make sense). Target: iPhone + iPad Safari first, portrait and landscape.

## 1. What changes versus Bop's Rainy Band
| Bop's Rainy Band | Momo's Toy Train |
|---|---|
| tap a band member | **drag cargo** from the rug **into a train car** (spring-follow drag, ballistic hop into the car) |
| Bop the frog beside his drum | **Momo the little owl** (`momo`) riding in the **engine cab** (left end of the train) |
| rainy garden, seasons | **toy room**, time of day through the window: morning → noon → sunset → starry night |
| song played back | **departure**: child taps the **whistle** → TOOT → the train jolts off leftwards, cars on springy couplings, cargo bouncing, steam puffs; the next train rolls in from the right |

## 2. Screen and layout
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
  Screen space = world space (no camera), y down. `ins` = safe-area insets in logical px.
- `World.setViewport(W, H, ins)` computes `layout` (the train's *parked* position; while moving everything is offset by `w.train.x`):
  ```
  layout = { W, H, ins, portrait, tall /* H/W > 1.6 */,
    groundY,          // front floor line: H - ins.bottom - (portrait ? 30 : 18)
    trackY,           // rail top (wheel contact): landscape groundY - 40; portrait groundY - 220 (tall: groundY - 300)
    S,                // cargo size (bounding square): 104 (tall portrait ×1.2 = 125); in a car cargo is drawn ×carScale
    engine: { x0, x1, y0 },    // parked engine box: x0 = ins.left + 20; width E = 240 landscape (W < 1100: 210), 180 portrait;
                               //   y0 = trackY - 1.15·E (top of the chimney); cab = the RIGHT 45 % of the engine (Momo's window)
    momo: { x, y, h },         // Momo's FEET point and height inside the cab: x = cab centre, y = trackY - 34, h = 0.95·E
                               //   (render draws cab back → Momo → cab front wall, which hides her below the waist)
    whistle: { x, y, r },      // the big brass whistle on the engine roof (tap target, r = 34; hit = r + 26)
    cars: [ { id, x0, x1, y0, floorY, slots:[{x,y}] } ],  // n cars right of the engine, gap 16 (couplings),
                               //   x from engine.x1 + 16 to W - ins.right - 20; carW = min(260, (span - 16(n-1))/n), centred if smaller;
                               //   body height carH = clamp(0.62·carW, 96, 150); y0 = trackY - 26 /*wheels*/ - carH (top rim);
                               //   floorY = y0 + 0.62·carH (cargo bottoms sit here, drawn between car back and front);
                               //   slots: up to 6 per car in 2 rows (front row 3, back row 3 raised 0.28·S), spaced ≥ 0.45·S
    carScale,                  // cargo scale in a car = clamp(carW / (2.3·S), 0.55, 0.85)
    rug: { x0, x1, y0, y1 },   // where cargo rests: y1 = min(car tops) - 44 - S/2 (resting items never inside a drop zone),
                               //   y0 = bubble bottom + 40 + S/2; x within ins.left + 40 … W - ins.right - 40, avoid HUD / bubble
                               //   (world.hudKeep boxes). Portrait: band ≤ 0.85·W tall just above the cars. Farthest-point sampling.
    bubble: { x, y, w, h },    // landscape: x = ins.left + 24, y = ins.top + 18, w = min(560, W - ins.right - 200 - x), h = 122
                               // portrait: x = ins.left + 24, y = ins.top + 110, w = W - x - ins.right - 24, h = 124
    tunnelX,                   // x where departing trains vanish: the toy-block tunnel mouth at the LEFT edge (ins.left − 40)
  }
  ```
- Cargo hit test: centre ± (0.6·S + 14). Drop zone of a car: its box + 30 px left/right, + 90 px up (kids drop high), +20 down.
  Overlapping zones → the car whose centre x is nearest the cargo. Nothing the child must touch under the HUD
  (`x > W - ins.right - 160, y < ins.top + 96`) or the bubble.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand (no Thomas-the-Tank-Engine face on
  the engine, no Brio/IKEA product look, no Hedwig, no Owl from Winnie-the-Pooh, no Duolingo owl). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox 256)
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left. Toys look like
  painted wood / soft plush (rounded edges, subtle grain lines).
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark/light)**: red `#E84A4A/#A8282E/#F7A0A0`, blue `#3C8DE8/#1F5BA8/#A6CCF5`,
  yellow `#FFD23F/#C99A12/#FFEB9C`, green `#4CC26B/#2A8343/#A8E6B8`, orange `#FF9A2E/#C4650C/#FFCB8E`,
  purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2` (pink from age 5). Defined in `content.js` as `TT.PALETTE`.
  Below age 5 never blue+purple, red+green, yellow+orange, green+orange together.
- **Momo**: a small round owl, feathers **caramel `#C98F5A`**, shade `#A06C3E`, outline `#6E4526`, face disc + belly cream
  `#FFF1DC`, big round eyes (white, `#2F2A3A` pupils, catch-light) with soft **lilac eye rings `#C9B6E4`**, a tiny peach beak
  `#F2A65A`, ear tufts, pink cheeks `#F6B1A0`, and a **striped engineer cap** (cream `#F4EBDD` with slate stripes `#7D8FA8`) +
  a slate neckerchief. Never wears an answer colour.
- **Train** (drawn by code in `train_art.js`): wooden toy train, chunky. **Engine**: natural wood `#E3BE88` (shade `#B98E57`,
  outline `#7A5530`) with a slate-blue boiler `#6F86A6` (not answer blue: greyish), black-free: chimney `#56607A`, cream cab
  roof `#F4EBDD`, a round headlamp (warm `#FFE7A3`, glows at night), red-free buffer beam in wood, **brass whistle**
  `#E2B24C`/`#A9822F` on the roof, 4 big wheels `#56607A` with cream hubs + rods that turn. A friendly painted smile on the
  front buffer is fine (no face on the smokebox). **Cars**: open toy wagons. *Colour* cars: the body painted in the answer
  colour (base / dark rim / light highlight). Other cars: natural wood `#E7C590` (rim `#A8743F`) with a **sign plate** on the
  side (cream `#FFF6E4`, rounded) showing the label: shape (in its colour, dark outline), number (bold rounded numeral) +
  dots below (age ≤ 4), letter, text ("3+2"), home badge picture, or size (big / small cars for age 3). Couplings: short
  wooden bars with a magnet knob. Wheels 2 per car, slate.
- **Toy room**: soft, calm colours so answer colours pop: wall `#F3E6CF` (morning) with a wainscot `#E7D3B4`, wooden floor
  `#D8B88E`/`#C9A577`, a big soft rug `#CFE3D8` (sage) with a cream border, toy shelves with blurred, desaturated toys,
  a window showing the sky. Moods: morning (wall `#F3E6CF`, sky `#BFE3F5 → #FFF3D6`, a sunbeam), noon (wall `#F6EBD8`, sky
  `#86CBF0 → #DFF2FB`), sunset (wall `#F2D6C0`, sky `#F7A86B → #FCD9A8`, warm light), night (wall `#4B4F78`, sky `#1D2350 →
  #3B3F7A`, moon, stars; a star night-light on the shelf; the room dim blue, the train headlamp on). Track: wooden rails
  `#D9B27E` with grooves on sleepers `#B88A55`, running along the full width on the floor at `trackY`.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Momo, toys & UI — character artist A
| File | viewBox | Notes |
|---|---|---|
| `characters/momo_{idle,blink,talk,happy,cheer,think,oops,wave,whistle,point}.svg` | 0 0 300 300 | Momo 3/4 view facing LEFT (direction of travel) but eyes on the child, **feet anchor (150, 292)**, identical body in every frame; happy = big smile; cheer = wings up, eyes ^^; think = head tilt, wing on chin; oops = "hmm?" (never sad); talk = beak open; wave = one wing waving high; whistle = wing pulling a cord down (cord goes up out of frame at x≈200), eyes closed happy; point = wing pointing down-right (towards the cars). Upper body (head + wings + cap) must read well when the lower 45 % is hidden by the cab wall |
| `characters/momo_full_wave.svg` | 0 0 300 300 | title pose (standing, waving, cap on) — full body visible |
| `characters/bunny_toy.svg`, `characters/bunny_toy_wave.svg` | 0 0 140 140 | a plush toy bunny (soft lilac-grey `#CFC6DD`, cream belly), sitting, bottom anchor (70, 136); wave = one paw up, giggling |
| `characters/balloon.svg` | 0 0 120 220 | a round balloon in soft mint `#9ED9C5` with a curly string, string end anchor (60, 216) |
| `items/cargo_{teddy,ball,duckie,rocket,boat,drum}.svg` | 0 0 160 160 | counting cargo: toys in **neutral / pastel** tones (teddy honey `#D9A066`, ball cream with slate stripes, rubber duckie soft yellow `#FBE38E`, toy rocket cream+slate, toy boat sage+cream, toy drum wood+cream) — never a pure answer colour; white sticker border; bottom anchor (80, 156); readable at 90 px |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | Momo in the cab of the wooden engine pulling a red, yellow and blue car with blocks, full-bleed warm background |

### 4.2 Train art, animals & home badges — character artist B
- `items/animal_<x>.svg` (0 0 160 160, white sticker border, sitting/standing pose, **bottom anchor (80, 156)**) for
  `TT.ANIMALS = ['cow','pig','sheep','duck','frog','fish','bird','squirrel','butterfly','bunny','mouse','fox']`
  (look like friendly painted wooden / plush toys). Friendly, round, readable at 90 px. The bunny must differ from
  `bunny_toy` (white-and-tan, not lilac).
- `items/home_{barn,pond,tree,burrow}.svg` (0 0 160 160): home badges for car sign plates, simple and iconic (barn = soft
  brick-red barn `#C8654F` with white X door; pond = round blue-green pond with a lily pad; tree = round green tree with a
  hollow; burrow = a grassy hill with a round dark hole and a carrot). Readable at 64 px.
- **`game/js/train_art.js`** → `TT.TrainArt` (all origins documented; cache static parts per (key, size, dpr)):
  ```
  TT.TrainArt.drawTrack(ctx, x0, x1, trackY, scrollX)  // wooden rails + sleepers across the floor (scrollX shifts sleepers)
  TT.TrainArt.drawEngine(ctx, E, opt, part)  // origin = engine's bottom-left at rail level (x0, trackY); part 'back'|'front':
                                             //   'back' = body, boiler, chimney, cab back wall + window opening; 'front' = cab front
                                             //   wall / sill (covers Momo's lower body) + wheels + rods + headlamp + whistle.
                                             //   opt { wheelRot, whistle 0..1 (pulled: knob down, steam), lamp 0..1, glow 0..1, night 0..1 }
  TT.TrainArt.engineGeom(E) → { cab:{x0,x1,floorY}, whistle:{x,y,r}, chimney:{x,y}, lamp:{x,y} }   // offsets from origin
  TT.TrainArt.drawCar(ctx, car, w, h, opt, part) // origin = car's bottom-left at rail level; part 'back' (inner back wall,
                                             //   floor) | 'front' (front wall with the label / colour + rim + wheels).
                                             //   car = { label:{type:'color'|'shape'|'number'|'letter'|'text'|'home'|'size'|'parity', value, color?, showDots?},
                                             //           need? (count cars: shows N dots on the plate, filled ones lit) , filled }
                                             //   opt { wheelRot, glow 0..1, shake (px offset, already applied by caller ok), img(name) }
  TT.TrainArt.drawCoupling(ctx, x0, x1, y, stretch)  // a wooden bar between two cars at axle height (stretch 0..1 springy look)
  TT.TrainArt.drawCargo(ctx, item, size, opt)  // origin = item CENTRE. item.kind: 'block' (a wooden toy in a colour: cube,
                                             //   ball, cone or cylinder per item.toy), 'shape' (a flat wooden cut-out shape block in
                                             //   item.color), 'sprite' (an SVG: item.sprite e.g. 'cargo_teddy' / 'animal_cow' via opt.img),
                                             //   'letter' / 'number' / 'text' (an ABC wooden cube with the glyph, item.color face),
                                             //   'size' (a block at 1 / 0.68). opt { glow, dpr, img, shadow (bool), squash {sx, sy} }
  TT.TrainArt.drawGhostHand(ctx, size, t)    // friendly pointing hand (hint), origin = fingertip, t = 0..1 drag animation
  TT.TrainArt.drawGlow(ctx, w, h, t, strength)
  TT.TrainArt.drawTunnel(ctx, x, trackY, h, part) // toy-block tunnel mouth (stacked painted blocks in muted tones),
                                             //   part 'back'|'front' so the train vanishes into it
  ```
  Shapes: `TT.SHAPES = ['circle','square','triangle','star','heart','rect','diamond','oval']`. Toys for colour cargo:
  `TT.TOYS = ['cube','ball','cone','cylinder']` (one colour per item; same-colour items in one round may differ in toy).

### 4.3 Environment — environment artist
For `m ∈ morning|noon|sunset|night`:
- `env/far_<m>.svg` (0 0 1200 720): the **back wall**, bottom-anchored, horizontally tileable (seam at 0/1200): top 60 px
  plain wall colour `WALL[m]` (render fills everything above the layer with the same colour — give the exact hex in a comment
  `<!-- wall #xxxxxx -->`), one big window per tile (≈ x 380–820, y 140–470) whose **glass is transparent** (cut-out) so the
  render's sky gradient (+ sun / moon / stars) shows through, curtains, wainscot, picture frames with simple drawings, a
  shelf with blurred toys. Night: dim blue room, a star night-light glowing on the shelf.
- `env/mid_<m>.svg` (0 0 1200 300): floor-back props: toy box, block towers, a teddy, a play tent (desaturated, calm),
  bottom-anchored on the floor line, tileable.
- `env/ground_<m>.svg` (0 0 1200 260): wooden floorboards + the soft rug (rug band where cargo rests, calm), tileable.
- `env/sun.svg`, `env/moon.svg` (0 0 160 160), `env/cloud_{a,b}.svg` (0 0 320 170, soft white).
- Particles (0 0 32 32): `mote` (dust sparkle, warm), `bubble` (soap bubble, rainbow sheen), `feather` (soft cream),
  `star`, `sparkle`, `puff` (steam, white-grey round), `confetti_a`, `confetti_b` (white, tinted by code). Keep existing
  `drop`, `splash`, `petal`, `leaf_*`, `snow`, `note_*` files untouched (unused).
- Composed scenes at 1556×720, 960×720, 720×1556 per mood + seam test into `docs/art/`.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `train_art.js` + `items/animal_*`, `items/home_*` (+ `tools/art_animals.py`, `tools/train_sheet.js`) | character artist B |
| `characters/*`, `items/cargo_*`, `icon.svg` (+ `tools/art_momo.py`) | character artist A |
| `env/*`, `particles/*` (+ `tools/art_env.js`, `tools/env_scenes.js`) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css` | lead |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, train_art, render, ui, main.

### 5.1 Content (`content.js` → `TT.Content`)
```
TT.PALETTE, TT.ANIMALS, TT.SHAPES, TT.TOYS, TT.CARGO = ['teddy','ball','duckie','rocket','boat','drum']
TT.HOMES = { barn:['cow','pig','sheep'], pond:['duck','frog','fish'], tree:['bird','squirrel','butterfly'], burrow:['bunny','mouse','fox'] }
TT.AGE_TOPICS = { 3:['colors','shapes','size','homes'], 4:['colors','shapes','count','homes'],
                  5:['shapes','count','letters','homes'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
TT.Content.makeRound(topic, { age, lang, rng, roundIndex, surprise }) → round   // pure, deterministic, self-checks completable
TT.Content.makeTalk(topic, { age, lang, rng }) → talk                          // as the band game (picture choices ≤ 5)
TT.Content.topicsFor(age, rng, lastTopics)
round = { topic, mode:'sort'|'count', promptKey, params, surprise:null|'hitch'|'balloon',
  cars: [ { id, label:{type, value, color?, showDots?}, need? /*count*/, nameKind, nameValue } ],
  items:[ { id, kind:'block'|'shape'|'sprite'|'letter'|'number'|'text'|'size', toy?, shape?, color?, sprite?, text?, scale,
            answer /* car id | null (count: any count car with room) */, nameKind, nameValue } ] }
```
- Cars per round (sort): age 3: 2; 4: 3; 5: 3 (4 from round 2); 6–7: 3. Warm-up round 0: 2 cars, 1 item each. Items per car:
  round 0: 1; later 1–2 (age 3–4 total ≤ 5 items; age 5+ ≤ 6). Every car gets ≥ 1 item. New labels/items every round.
- `colors`: colour cars; items kind `block` (random toy) in the car colours. `shapes`: label shape (in a colour); items kind
  `shape`; age ≤ 4 each shape one colour that matches its sign; age 5 colours mixed (the shape matters, not the colour).
  `size` (age 3): 2 cars `size` big/small (same colour), items `size` big/small of that colour.
  `homes`: car label `home` (barn/pond/tree/burrow), items `sprite` animals of those homes.
  `count` (mode `count`): cars with `label {type:'number', value:N, showDots: age ≤ 4}`, `need:N`. Round 0: 1 car N ∈ 1–2;
  round 1: 1 car N 2–4; rounds 2–3: age 3–4: 1 car N 3–5 / 2 cars with N1 ≠ N2, N1+N2 ≤ 6; age 5: N ≤ 10 (1 car), 6–7: ≤ 12.
  Items: one cargo toy (`sprite cargo_<toy>`, one kind per round) × (ΣN + 2) (≥ 3 extra when ΣN ≤ 3), `answer:null`. A drop
  into a car with room is correct; into a full car → `full` (bounce home, NOT a mistake). Done when every car holds N; the
  extra cargo then waves goodbye (fades out).
  `letters` (ABC blocks; car = capital letter, items = capital blocks), `lower` (car capital, items small letters; drop `I`
  from lower-case rounds), `initial` (car = letter, items = animal sprites whose word starts with it — words list per
  language from TT.ANIMALS, VI: avoid ch/th/nh/ph/kh/gi/ng/tr initials), `add` / `sub` (car = sum text "2+3", item = number
  block), `oddeven` (2 cars `parity` odd/even, items number blocks). Reuse the band/tower content generators for those.
- Prompt keys: `p.colors` "Load the {color} car!"-style generic sort line ("Put each toy in the car of its colour!"), the
  world also emits `target` hints per item on pick-up (name the item). `p.count {n}` "Load {n} teddies!" (2 cars: `p.count2
  {a,b}`). `p.shapes`, `p.size`, `p.homes`, `p.letters`, `p.lower`, `p.initial`, `p.add`, `p.sub`, `p.oddeven`.

### 5.2 `TT.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s; `_p*` previous values + `alpha` for interpolation)
Public API/fields as the band game: `setViewport(W,H,ins), setAge, setLang, newSession({lastTopics}), levels, startLevel(i),
update(dt), drainEvents(), pointerDown/Move/Up(x,y), cancelDrag(), hint(), talkAnswer(id), prompt(), layout, hudKeep, state,
level, topic, round, roundsPerLevel, stars, levelStars, talk, alpha, stateTime, resetNudges(), tapMoveMin`; states
`intro | round | roundDone | talk | levelDone | sessionDone`; plus:
- `w.phase` in a round: `'arrive' | 'deal' | 'load' | 'whistle' | 'depart' | 'clear'`.
- **Train** `w.train = { x /*offset of the whole train from its parked layout, logical px*/, _px, v, wheelRot, _pwheelRot,
  whistle 0..1, lamp 0..1, couple: [ { dx, _pdx, v } ] /*per car: spring offset relative to its parked spacing*/ }`.
  - **arrive** (≈ 1.6 s): the train starts at `x = W + 120` (off right, engine leading leftwards) and brakes to `x = 0`
    with a smooth decel; each car's coupling is a damped spring (ω ≈ 9, ζ ≈ 0.35) driven by the train's acceleration, so the
    cars bunch up then settle (`clack` event on each coupling compression peak). Wheel rotation = distance / wheel radius.
    Event `arrive` at stop → `deal`.
  - **deal**: items appear on the rug with staggered back-overshoot pop (0.12 s apart), event `deal` then `ask {promptKey,
    params, mode, first}` → `load`.
  - **load**: drag cargo (below). When every item has an answer place (sort: all loaded; count: all cars full) → after the
    last landing settles (+0.4 s) event `loaded`, phase **whistle**: the whistle glows/pulses; Momo `point`/`happy`.
    A tap on the whistle (or the engine, hit box + 20 px) → event `whistle` (Momo `whistle` frame, `train.whistle` 1 → 0
    over 0.8 s, 3 steam rings), then **depart**. After `CONFIG.whistleNudge` 6 s → `whistleHint` (glow + ghost hand tap);
    after `CONFIG.whistleAuto` 12 s Momo pulls it herself (`whistle {auto:true}`). Extra taps during depart → `toot` (fun).
  - **depart** (≈ 2.4 s): jolt (−v kick) then accelerate leftwards (a = 900 px/s² up to 900 px/s); couplings stretch in turn
    (spring), cargo in the cars bounces (`item.bounce` spring per item, small hops), `puff {x,y}` events from the chimney
    every 0.12–0.25 s depending on speed; the hitch bunny rides along. When the last car passes `tunnelX` →
    `departed`, then `roundDone {round, stars, misses}` (3 / 2 / 1 stars for 0 / 1 / ≥ 2 misses), **clear** (0.5 s), next
    round (new train arrives) or Talk time after round 4 / once the chapter passes 75 s with ≥ 3 rounds done.
- `w.items[]`: `{ id, item, x, y, _px, _py, rot, _prot, sx, sy, glow, state: 'pop'|'rest'|'drag'|'fly'|'in'|'home'|'bye',
  homeX, homeY, carId, slot, t, bounce }`. Motion (proven): spring-follow drag (ω ≈ 28) with pendulum tilt from horizontal
  velocity; release in a car zone → ballistic arc into the next free slot (apex ≥ 60 px, 0.35–0.5 s), landing squash
  (sy 0.8 → spring back) + car `squash` spring (`car.sq`) — event `land {id, carId}`; items `in` a car ride with it (their
  x follows `train.x + couple.dx`). Wrong car → car `shake` (damped ±10 px, 0.5 s), item arcs home (`wrong {id, carId,
  item:{nameKind,nameValue}, want:{nameKind,nameValue}, streak}`); release outside any zone → floats home (`miss {id}`,
  not a mistake). **A tap is not a drop**: moved < `tapMoveMin` (24) px and released < 0.35 s → hops home quietly, event
  `tap {id, nameKind, nameValue}`. Events also `grab {id, nameKind, nameValue}`, `drop`, `correct {id, carId, count?:{i, n}}`
  (count mode: i = items now in that car, n = need), `full {id, carId}`, `carDone {carId}` (a car reached need / got its
  last item: its plate glows, `car.done` 0→1).
  After the 2nd miss on the same item, or `hint()`: `hint {id, carId}` — the right car glows, ghost hand drags from the
  item to the car (`w.hintHand = {x0,y0,x1,y1,t}`); cooldown 6 s; idle nudges after 12 s, backoff ×1.5 up to 30 s
  (`idle {n}`; the 2nd idle also hints). Only one active pointer; a still drag (finger resting) times out after 6 s.
- `w.cars[]` = layout cars + `{ label, need, items:[ids], sq, _psq, shake, glow, done }`; `w.momo = { mood /*idle|talk|happy|
  cheer|think|oops|wave|whistle|point*/, moodT, blinkT, look }`; tap on Momo (< 24 px move, < 0.6 s) → `pokeMomo` (main
  repeats the prompt).
- Surprises (one round per chapter, rotating, never in the warm-up): **hitch** — during `load`, a plush bunny hops in from
  the right onto the last car's roof edge (`w.hitch = {x, y, state:'in'|'ride'|'wave', t}`, event `hitch`); tap → `hitchTap`
  (wave + giggle, no score effect); it rides away with the train. **balloon** — a balloon tied to the last car
  (`w.balloon = {x, y, sway, t, popped}`); tap → `balloonTap` (bob, sparkles, a bonus sparkle star — no score change); it
  floats along with the train when departing.
- Events also: `level {level, topic}`, `round {round, surprise}`, `talk`, `talkAsk {n}`, `talkResult`, `levelDone`,
  `sessionDone {stars}`.
- Rotation / resize mid-round: cancel the drag, re-layout, snap items in cars to their slots, re-pack resting items into the
  new rug, finish any arc instantly; a moving train keeps its phase (its x offset is clamped).

### 5.3 `TT.Weather` — API as the giraffe/band game: `setWeather(i, {instant})` (0 morning, 1 noon, 2 sunset, 3 night;
crossfade 2.5 s), `resize(W,H,groundY)`, `update(dt)`, `ambient` (`skyTop, skyBottom, wall /*hex, = far layer top colour*/,
tint, sun 0..1, sunX, sunY /*0..1 of the window*/, moon 0..1, stars 0..1, beam 0..1 /*sunbeam strength*/, darkness /*0;
0.32 at night*/, lamp 0..1 /*night-light + headlamp*/, mood:'morning'|'noon'|'sunset'|'night'`), particles: morning dust
motes drifting in a diagonal sunbeam, noon a few soap bubbles floating up and popping (tiny sparkle), sunset slow feathers +
warm motes, night: projected night-light stars slowly turning on the wall (`weather.stars[] {x,y,r,phase}`) + twinkles.
Cap 120. `weather.puffs` — the world's `puff` events become steam particles via `weather.addPuff(x, y, v)`.

### 5.4 `TT.Bot` — drags through `world.pointerDown/Move/Up` (6–10 steps to the target car's centre, 30 px above its
floor) with p = skill (a wrong answer = a random other car); human-ish delays (1.0–2.4 s) after `ask` and between items;
taps the whistle after 0.8–2 s; answers Talk right with p = skill; taps the bunny/balloon sometimes.

### 5.5 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved); `window.TT.debug = { world, weather, mode, stats, getState(), setSpeed(n), startGame(), goTitle(), setBot(on, skill),
setAutoRestart(on), gotoLevel(i), voiceLog, itemScreen(id) → {x, y} CSS px (centre), carScreen(id) → {x,y,w,h} (drop target
centre box), whistleScreen(), momoScreen(), answerCarId(itemId) → id of a right car for that item, toScreen(x,y), audio() }`.
World supplies `itemHit(id)`, `carBox(id)`, `whistleHit()`, `momoHit()` (logical) and `answerCarId(itemId)`.

## 6. Voice, language — as the band game §6 with helper **Momo** (EN "Momo", VI "Cú Momo" in titles, "Momo" in lines), a
cheerful little owl conductor: pitch ≈ 1.2, rate ≈ 0.9. Animals (VI with classifiers): cow "con bò", pig "con heo", sheep
"con cừu", duck "con vịt", frog "con ếch", fish "con cá", bird "con chim", squirrel "con sóc", butterfly "con bướm", bunny
"con thỏ", mouse "con chuột", fox "con cáo". Homes: barn "the barn" / "chuồng", pond "the pond" / "cái ao", tree "the tree" /
"cái cây", burrow "the burrow" / "cái hang". Cargo: teddy "teddy bear" / "gấu bông", ball / "quả bóng", duckie "rubber duck" /
"vịt cao su", rocket "toy rocket" / "tên lửa đồ chơi", boat "toy boat" / "thuyền đồ chơi", drum "toy drum" / "cái trống";
toys cube "block" / "khối gỗ", ball, cone "cone" / "khối nón", cylinder "tube" / "khối trụ".
- Prompts (3 wordings each): `p.colors` "Put each toy in the car of the same colour!" / "Bé ơi, xếp đồ chơi vào toa cùng màu
  nhé!", `p.shapes` "Put each shape in the car with the same shape!", `p.size` "Big toys in the big car, small toys in the small
  car!", `p.homes` "Who lives where? Take each animal to its home car!", `p.count` "Load {n} {cargo} into the car!" (`{cargo}`
  plural-aware in EN; VI "Bé ơi, chất {n} {cargo} lên toa nhé!"), `p.count2 {a, b, cargo}`, letters etc. as the band game.
- `say.grab` names the item ("Red block!" / "Khối màu đỏ!"; animal: "The cow!" / "Con bò!"), `say.correct.<labelType>` with
  the label ("Red car — yes!", "Moo! The cow goes to the barn!"), counting on each correct drop in count mode ("One!", "Two!"
  … = `count.<n>`), `full[]` ("This car is full! Try another one." — never negative), `wrong[]` with `{item}` and `{want}`
  ("Boing! That's the blue car. The red block wants the red car!"), `loaded[]` ("All aboard! Tap the whistle!" / "Lên tàu
  nào! Bé kéo còi đi!"), `whistleHint[]`, `whistleAuto[]` ("Toot toot! Off we go!"), `depart[]` ("Choo choo! Bye-bye!"),
  `toot[]`, `hint[]`, `idle[]`, `praise[]`, `great[]` with `{child}`, `talk.*`, `weather.0..3` ("Good morning, train!",
  "Sunny noon!", "Look, the sunset!", "Good night, stars! Lights on!"), `surprise.hitch` ("Look! Bunny wants a ride!"),
  `hitch.tap`, `surprise.balloon` ("A balloon on our train!"), `balloon.tap`, `deal[]` ("Here comes the train!"), `topic.*`,
  `session.done`, `ui.*` incl. `ui.volume`, logo lines "Momo's" / "Toy Train", VI "Cú Momo" / "Tàu Đồ Chơi".

## 7. Integration (lead) — title (Momo waving beside the engine and two cars on the track, ▶ Play, star total, language
toggle, hold-⚙), settings with volume, HUD, bubble, pause with −/+, chapter banner, Talk time, session done (night room, the
whole train with every toy riding, confetti, headlamp on). Audio: pickup blip, whoosh, wooden clonk on landing (pitch per
car), car wiggle "boing", count chimes, full "tok-tok", train chug (filtered noise pulses, rate ∝ speed), coupling clacks,
the **whistle** (two-tone sine/triangle chord with breathy noise, "TOOT TOOT"), steam hiss, wheel clatter, animal voices
(synth), bunny giggle, balloon squeak, music per time of day (toy-piano / music box, quiet, ducked under speech).

## 8. Performance — ≤ 4 cars, ≤ 8 items, cached train parts and cargo faces, ≤ 120 particles; adaptive quality as before.
