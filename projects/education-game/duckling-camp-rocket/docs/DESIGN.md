# Mimi's Splash Rocket — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.DK`**. Classic `<script>` files, no build step, node-safe at load
(touch the DOM lazily). The code base is a copy of `../../hedgehog-river-hop/` (Nim's River Hop: state machine, voice, input,
storage, loud audio with volume, ui, main, tests) with `NH → DK` and storage prefix `nh: → dk:` already replaced. **The
river-crossing world is replaced by a rocket-launch meadow.** When a detail is missing here, do what
`../../hedgehog-river-hop/docs/DESIGN.md` / `MECHANICS.md` / `VOICE.md` do (i18n / voice API style, hooks, Talk time,
chapter-topic rotation between sessions, idle auto-pause, CONFIG style, hint cooldown / idle backoff, prompt protection,
phone layout tweaks, short rounds when a chapter runs long, interpolation with `_p*` twins + `alpha`). Those files are the
base: read them first. Target: iPhone + iPad Safari first, portrait and landscape.

## 1. What changes versus Nim's River Hop
| Nim's River Hop | Mimi's Splash Rocket |
|---|---|
| rows of stones in a brook; tap the right stone of the NEXT row | **one launch at a time**: m mats (2–3) unfold on a meadow; tap the ONE right mat |
| Nim the hedgehog hops (crouch → arc) | **Mimi** (`mimi`), a fluffy cream duckling, aims her **water-bottle rocket**, then the child **pumps ×3** (new gesture) |
| hop lands, stone dips + turns golden | rocket **whooshes** up on a water spray → apex → **parachute pops** → sways down (pendulum, wind) → lands on the mat (mat squish ripple) |
| fruit sticks on Nim's spines | the mat's thing hops up and flies to the **camp flagpole**, becomes a **pennant** hoisted up in order (collect in order) |
| far bank: Nim curls & rolls | **camp** finale: pennants flutter + counted, Mimi dances, the rocket shoots a **fountain** with a little rainbow in the spray |
| seasonal wipe | **wipe**: a weather sweep (sun motes / leaves / rain / rainbow sparkles) across; new mats |
| woodland brook spring→winter | **mountain campsite**, sunny → breezy → rain → rainbow |
| fish / frog / snowflakes | **marmot** (pops from a burrow) / **goat** (hops onto a far rock) / **bird** (rainbow chapter, lands on the flagpole) |

## 2. Screen and layout
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720,
  H=clamp(round(720/aspect),960,1600)`. Screen space = world space, y down. `ins` = safe-area insets (logical px); `hudKeep`
  boxes as in the base.
- **Camp corner** (`layout.camp`): landscape = a left column `x ∈ [0, ins.left + campW]` (campW 270, ≥ 230 squeezed),
  `y ∈ [play.y0, H]`; portrait = a bottom band `y ∈ [H − ins.bottom − campH, H]` (campH 280, tall ×1.15), full width.
  In it: `layout.mimiHome` (Mimi's FEET), `layout.pad` (the launch pad: the rocket's base point, i.e. the bottle's nozzle
  bottom when standing on the pad), `layout.pump` (the foot-pump's plunger top — a hit circle r = max(hitR, 80)),
  `layout.pole` (`{x, y0 (base), y1 (top)}` the flagpole; pennant slot j at `y1 + 24 + j·pennantPitch`, pennantPitch 46).
  Landscape: pole x = ins.left + 40, Mimi feet (ins.left + 100, H − ins.bottom − 70), pad (ins.left + 200, H − ins.bottom − 60),
  pump (ins.left + 160, H − ins.bottom − 40) — adjust so nothing overlaps; pole top ≥ play.y0 + 30.
  Portrait: Mimi left (ins.left + 120, H − ins.bottom − 70), pad (W/2, H − ins.bottom − 60), pump (W/2 + 110, …), pole right
  (W − ins.right − 70), pole top ≥ the camp band top − 180 (the pole may rise into the meadow; mats keep ≥ 40 px from it).
- **Meadow** (`layout.meadow`): the rest of `play` (landscape: right of the camp column; portrait: above the camp band),
  with a horizon line `layout.horizon` (landscape ≈ play.y0 + 0.30·(H − play.y0); portrait ≈ play.y0 + 120): mats live
  BELOW the horizon. Depth: a mat's scale `ds = 0.82 + 0.18·(y − horizon)/(meadow bottom − horizon)` (farther = smaller,
  higher). Drawn back-to-front by y.
- `layout = { W, H, ins, portrait, tall, phone, bubble, hud, play, camp, meadow, horizon, mimiHome, mimiH, pad, pump, pole,
  rocketH, S, itemH, hitR }`: `mimiH` landscape 180 / portrait 170 (phone portrait 200); `rocketH` = 120 (bottle + nose,
  standing on the pad); `S` = mat WIDTH at ds 1: ages ≤ 4: 170, 5: 160, 6+: 148 (≥ 130 when squeezed); `itemH` = 0.62·S;
  `hitR` = 0.6·(S·ds·0.8) + 14, phones ≥ 92 — hit circle centred 0.3·itemH above the mat centre (covers mat + thing).
  Nearest centre wins.
- **Mat homes** per launch: m mats spread with farthest-point sampling inside the meadow below the horizon, ≥ hitR·2 + 20
  apart (centres), ≥ 44 px from the bubble / HUD / screen edges / pole, ≥ 90 px from the pad (landscape the nearest mat
  x ≥ camp right + 40). Seeded jitter. The right mat's position varies (not always the farthest / nearest).

## 3. Art style guide (ALL artists)
- **Original only.** Web search (a sub-agent or WebSearch) for reference only; never copy a known character/brand (no
  Donald/Daisy Duck, no Psyduck, no Ugly Duckling book art, no Peppa, no Bluey; no NASA logos). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox
  256–300) in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark/light)** — `DK.PALETTE` in `content.js`, unchanged:
  red `#E84A4A/#A8282E/#F7A0A0`, blue `#3C8DE8/#1F5BA8/#A6CCF5`, yellow `#FFD23F/#C99A12/#FFEB9C`, green
  `#4CC26B/#2A8343/#A8E6B8`, orange `#FF9A2E/#C4650C/#FFCB8E`, purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2`
  (pink from age 5). Below age 5 never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round.
- **Mimi** (never an answer colour): a small round fluffy duckling, **cream-white** down `#FBF3DD` (shade `#EADBB5`, outline
  `#A8936A`), soft fluffy tufts on the head, **peach bill and feet `#F0A982`** (shade `#D98A64`, outline `#A9634A` — clearly
  softer/paler than answer orange), big eyes `#2A1E1A` with catch-light, rosy cheeks `#F4B3A6`, little wings. She wears a
  **khaki camping bucket hat `#C9B48A`** (band `#8A7350`, outline `#7A6544`). NOT yellow (answer yellow must stay unique).
- **Rocket**: a clear plastic bottle (glass tint `#DDEFF2` at 0.85, outline `#7FA3AA`, highlight streak white) with water in
  the bottom half (`#B9DDE3`), a cream nose cone `#F6EEDC` with a peach band `#F0A982`, three fins in khaki `#C9B48A`; nozzle
  down. **Parachute**: a dome of 6 gores alternating cream `#F6EEDC` and dusty teal `#8FB8B2` (outline `#5E8580`), thin cords.
- **Mats** (landing targets): round woven picnic mats seen in perspective (ellipse, h ≈ 0.42·w), oatmeal `#EFE2C6` with a
  sand-brown woven ring `#CDB68E`, outline `#9C8763`, a soft shadow; target ring (dashed white) when active. Never tinted
  by weather. Visited mat: a golden glow `#F4D27A`.
- **Meadow / camp** (calm, muted — the answer colours must pop): meadow grass sunny `#A9CF8E` → far `#9CC48A`, breezy
  `#A2C78C`, rain `#8FB385` (darker, wet sheen), rainbow `#AFD596`; all calmer than answer green `#4CC26B`. Mountains:
  blue-grey `#8FA3B8` / lavender-grey `#A9A6C4` (never saturated blue/purple; snow caps `#F4F6FA`), pine forest
  `#5F8A6E` / `#4E7560`. Tents: canvas khaki `#D9C59A` and dusty teal `#7FA8A2` (never an answer colour). Campfire logs
  `#8A6244`, flame soft `#F7B267` (small, never near a mat). Skies: sunny `#9FD3EE → #F3F7EE`, breezy `#B7D9EC → #F1F3EA`,
  rain `#A7B5C3 → #DCE2E6` (darkness ≤ 0.12), rainbow `#B6DDF0 → #FBF3E6` with a soft rainbow arc over the mountains.

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Mimi, rocket, surprises & icon — character artist A (`tools/art_mimi.py`, sheets `tools/mimi_sheet.js` → `docs/art/`)
| File | viewBox | Notes |
|---|---|---|
| `characters/mimi_{idle,blink,talk,happy,cheer,think,oops,pump,wave,giggle,dance,look}.svg` | 0 0 300 300 | Mimi 3/4 view facing RIGHT, **feet anchor (150, 290)**, identical body in every frame except pump/dance. idle; blink; talk (bill open); happy; cheer (wings up, eyes ^^); think (head tilt, wing at chin); oops ("hmm?" head tilt, one wing up, never sad); **pump** = both feet on a plunger, body squashed ~10 % lower, wings out, determined happy face (the world alternates idle↔pump for each stomp); wave; giggle; dance; **look** = head tilted up, watching the sky (during flight). |
| `characters/mimi_title.svg` | 0 0 300 300 | title pose: Mimi waving, holding the bottle rocket under one wing |
| `characters/rocket.svg` | 0 0 120 240 | the bottle rocket standing nose UP, **anchor = nozzle bottom (60, 236)**, centre of mass ≈ (60, 150) |
| `characters/chute.svg`, `chute_closed.svg` | 0 0 240 200 | open dome canopy with cords meeting at **(120, 196) = the rocket's nose attachment**; closed = a folded bundle (0 0 240 200, same attachment point) |
| `characters/marmot.svg`, `marmot_wave.svg` | 0 0 160 160 | a round friendly marmot, warm tan `#C59A6A` (not an answer colour), popping up from a burrow hole (the hole is drawn by the world), anchor bottom-centre (80, 156) |
| `characters/goat.svg`, `goat_hop.svg` | 0 0 180 180 | a small white mountain goat with little horns, feet (90, 174), facing LEFT |
| `characters/bird.svg`, `bird_sing.svg` | 0 0 100 90 | a small round songbird, soft lilac-grey `#B8B2CF` + peach breast, perch feet (50, 86) |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | Mimi watching her bottle rocket fly up on a water spray with the parachute popping, mountains behind, full bleed, no text |
Also write `game/js/mimi_points.js`: `DK.MIMI_POINTS = { feet: [150, 290], box: [x0,y0,x1,y1], pumpDy (how much lower
the body is in the pump frame), wingTip: [x, y], hatTop: [x, y] }` and `DK.ROCKET_POINTS = { nozzle: [60, 236], nose:
[60, y], com: [60, 150], waterTop: y, w: bottle width }`. Delete `characters/nim_*`, `fish*`, `frog*`, `nim_points.js`,
`tools/art_nim.py`, `tools/nim_sheet.js`.

### 4.2 Animals — REUSED (`animals/<a>.svg`, `<a>_step.svg`, 0 0 200 200, feet (100, 194), facing right):
`cow pig sheep duck hen horse goat crab penguin lion monkey fishbowl`. On a mat the animal sits on top (feet at the mat
centre). Homes: farm (first 7), sea (crab, fishbowl), ice (penguin), savanna (lion), jungle (monkey).

### 4.3 Mats, things & camp props (canvas code) — character artist B: `game/js/mat_art.js` → `DK.MatArt`
Start from `stone_art.js` (copy its thing / icon / badge / hint-hand / tile / dots / home-badge code; then **delete
`stone_art.js`, `tests/unit/stone_art.test.js`, `tools/stone_sheet.js`**). Pure canvas drawing, cached per thing+size
(offscreen bitmaps), node-safe at load.
```
DK.MatArt.drawMat(ctx, S, opt)     // origin = mat CENTRE on the ground. S = width (already × depth scale). opt = { seed,
                                   //   unfold 0..1 (0 = a rolled-up tube, 1 = flat: unrolls from the left with a wobble),
                                   //   flap 0..1 (cloth wave ripple when tapped wrong / landed on), squish 0..1 (pressed
                                   //   down by the landing rocket: wider + flatter), gold 0..1, glow 0..1 (hint: warm pulse),
                                   //   active 0..1 (dashed white target ring), wet 0..1 (rain sheen), alpha }
DK.MatArt.drawThing(ctx, thing, size, opt)   // origin = BOTTOM-CENTRE (stands on the mat centre); opt { glow, wiggle, alpha }
  //   kind 'obj'   : obj ∈ flower | mushroom | ball | mug (a camping enamel mug) | lantern (a camping lantern) — in `color`
  //   kind 'shape' : a chunky standing shape block (circle|square|triangle|star|heart|oval|rect|diamond) in `color`
  //   kind 'dots'  : a small wooden camp sign `#F3E6CC` (outline `#9C7A5A`) with n PINECONES `#8A5E3B` (1–12, dice/rows
  //                  layout, each clearly separate); opt.numeral / thing.numeral → a big numeral above them
  //   kind 'tile'  : the same wooden sign with `text` ("A", "a", "3+2", "7−4", ≤ 20) in big rounded dark glyphs
  //   kind 'animal': DK.Assets.img('animals/<a>') fit in the box, feet at the origin;  big:false → × 0.6 (age-3 size)
DK.MatArt.drawPennant(ctx, thing, w, opt)    // a triangular cloth pennant (cream `#F6EEDC`, outline `#9C8763`) hanging from
                                             //   its top-left corner on the pole, showing a small icon of the thing (colour
                                             //   things: the pennant IS that colour with a light icon); opt { flutter 0..1, t }
DK.MatArt.drawPole(ctx, x, y0, y1, opt)      // a wooden camp flagpole with a rope + a little golden knob; opt { t }
DK.MatArt.drawPad(ctx, x, y, opt)            // the launch pad: a small wooden stand + a tilting launcher tube (opt.aim rad
                                             //   from vertical), a hose to the foot pump
DK.MatArt.drawPump(ctx, x, y, opt)           // the foot pump at (x,y) = plunger top: opt { press 0..1 (plunger down), glow
                                             //   0..1, gauge 0..1 (pressure dial needle), count 0..3 (little lights lit) }
DK.MatArt.drawArc(ctx, pts, opt)             // the dotted aim arc preview (white dots with a soft shadow, fading), opt { t, alpha }
DK.MatArt.drawDrop(ctx, x, y, r, a)          // a water droplet (spray / splash)
DK.MatArt.drawPuddleRing(ctx, x, y, r, a)    // a flat splash ring on the ground
DK.MatArt.drawHomeBadge(ctx, home, r, opt)   // keep
DK.MatArt.drawIcon(ctx, choice, size)        // Talk-time / picture choices: any thing, {kind:'color', color}, {kind:'number', n}
                                             //   (numeral + pinecones), {kind:'home', home}, {kind:'size', big}
DK.MatArt.drawHintHand(ctx, x, y, press, alpha)  // keep
DK.MatArt.drawBurrow(ctx, x, y, r)           // a burrow hole in the grass (marmot surprise)
DK.MatArt.drawRock(ctx, x, y, w)             // a far rock the goat hops onto
```
Contact sheets: `tools/mat_sheet.js` (Playwright) → `docs/art/mat_*.png` at in-game size and 3× on the 4 meadow colours.
Unit test `tests/unit/mat_art.test.js`: every function against a recording mock ctx for every thing/colour/shape/n
1–12/animal, no NaN, node-safe.

### 4.4 Environment — environment artist (`tools/art_env.js`, `tools/env_scenes.js`, `game/js/meadow_art.js`)
For `m ∈ sunny|breezy|rain|rainbow`:
- `env/far_<m>.svg` (0 0 1200 720): a mountain range (2 layers of peaks with snow caps; rainbow: a rainbow arc behind them;
  rain: misty, softer); bottom-anchored, horizontally tileable (seam at 0/1200), transparent top. Sky colours in a comment
  `<!-- sky #top #bottom -->`.
- `env/mid_<m>.svg` (0 0 1200 300): pine forest edge + a lake glint, tileable, bottom-anchored.
- Camp sprites (bottom-centre anchor): `env/tent_a.svg` (0 0 260 200, khaki), `env/tent_b.svg` (teal), `env/campfire.svg`
  (0 0 140 120; the flame is drawn animated by MeadowArt on top), `env/pine.svg` (0 0 160 300), `env/rock.svg` (0 0 120 80),
  `env/flowers.svg` (0 0 140 70), `env/windsock.svg` (0 0 120 200; the sock is drawn animated in code),
  `env/sun.svg`, `env/cloud_a.svg`, `env/cloud_b.svg`, `env/cloud_rain.svg` (0 0 300 140), `env/rainbow.svg` (0 0 1200 600).
- Particles (0 0 32 32): `mote sparkle star leaf petal butterfly confetti_a confetti_b dot raindrop splash dust` +
  `rainbow_sparkle` (multi-colour); delete the river-only ones (glint, dragonfly, snow, blossom, firefly may stay if used).
  Delete `env/*_{spring,summer,autumn,winter}.svg`, `env/bush_*`, `reeds_*`, `tree_*`, `river_art.js`.
- **`game/js/meadow_art.js` → `DK.MeadowArt`** (canvas, node-safe, cached):
  ```
  DK.MeadowArt.drawMeadow(ctx, layout, mood, opt)  // the ground below the horizon: grass gradient (lighter far, deeper near),
     // soft mown stripes in perspective, seeded grass tufts / flowers / small rocks (away from mat homes? no — mats are drawn
     // on top; keep decorations sparse), the camp corner: 2 tents behind Mimi, the campfire, a log seat, a windsock — all
     // kept ≥ 30 px from layout.pad / pump / pole / mimiHome boxes and inside the camp rect. opt = { t, wind, wet 0..1,
     // quality }. Cache the static part per (size, mood) as an offscreen bitmap; animate only flame / windsock / wet sheen.
  DK.MeadowArt.drawFlame(ctx, x, y, s, t)          // the animated campfire flame
  DK.MeadowArt.drawWindsock(ctx, x, y, s, wind, t) // flutters with the wind (breezy: horizontal, rippling)
  DK.MeadowArt.campProps(layout)                   // → [{kind, x, y, s}] the placed props (so render / tests can check overlaps)
  ```
- `tools/env_scenes.js`: composed scenes at 1556×720, 960×720, 720×1556 per mood (fake mats, fake Mimi box, pad, pole) +
  seam test into `docs/art/`, and exports the `RECIPE` (layer heights, sky colours, sun position per mood, horizon,
  tall-portrait background ×1.36 rule) that `render.js` copies verbatim.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `mat_art.js` (+ `tools/mat_sheet.js`, `tests/unit/mat_art.test.js`) | character artist B |
| `characters/*`, `icon.svg`, `mimi_points.js` (+ `tools/art_mimi.py`, `tools/mimi_sheet.js`) | character artist A |
| `env/*`, `particles/*`, `meadow_art.js` (+ `tools/art_env.js`, `tools/env_scenes.js`) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, `tests/e2e/*` | integrator |
Script order: rng, i18n, content, mimi_points, world, weather, bot, storage, assets, audio, voice, input, mat_art,
meadow_art, render, ui, main.

### 5.1 Content (`content.js` → `DK.Content`) — as the base with these changes
```
DK.OBJS = ['flower','mushroom','ball','mug','lantern']   // (duck → mug, leaf → lantern: a duckling helper + a duck obj confuses)
// no FRUITS any more (remove; the reward is the pennant)
round = { topic, age, lang, roundIndex, surprise: null|'marmot'|'goat'|'bird', mode: 'match'|'countSeq'|'countSel',
  launches: [ [ { id, thing, target: bool } ] ],   // = the base's rows: launch j has m mats, EXACTLY ONE target
  k, promptKey, params, rule }
```
- k (launches) × m (mats): exactly the base's rows × stones table (warm-up k 2, m 2; age 4: (2,2) (3,2) (3,3) (3,3) …;
  `short`: k 2, m 2). Self-checks, variety rules, CVD rules, topic rules: unchanged (countSeq = launch j's target is `dots
  n = j+1` with numeral; countSel = every launch's target has `dots n = a`, counted aloud after landing).
- Prompts keep their keys (`p.colors`, `p.countSeq`, `p.countSel`, `p.animal`, `p.home`, …); i18n rewords them for landing.
- Surprises: chapters rotate `marmot` / `goat`; chapter 3 (rainbow) `bird`.
- `makeTalk` unchanged (count talk shows a pinecone sign).

### 5.2 `DK.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s; `_p*` twins + `alpha`)
Public API as the base: `setViewport(W,H,ins), setAge, setLang, newSession({lastTopics}), levels, startLevel(i), update(dt),
drainEvents(), pointerDown/Move/Up(x,y), cancelDrag(), hint(), talkAnswer(id), prompt(), resetNudges(), skipTalk(), layout,
hudKeep, state, phase, level, topic, round, roundsPerLevel, stars, levelStars, roundStars, misses, talk, alpha, stateTime,
phaseTime, interactive, weather (= level % 4), cur, mats, launch (index of the current launch; k = done), mimi, rocket,
pennants, marmot, goat, bird, drops, rings, hintHand, wipe, matById(id), answer(), targets(), setBreeze(wind)`.
States `intro | round | roundDone | talk | levelDone | sessionDone`. Round phases:
`'unfold' | 'play' | 'aim' | 'pump' | 'flight' | 'collect' | 'camp' | 'wipe'`.
- **Mats** `{ id, launch, i, thing, target, x, y (centre on ground, with motion), hx, hy, ds (depth scale), seed, state
  'hidden'|'unfold'|'rest'|'fold'|'gone'|'landed', unfold 0..1, flap, flapV (spring), squish, squishV (spring ω ≈ 14, ζ 0.3),
  gold, glow, active, alpha, thingHop, wig, wigV }`. Resting things bob gently (±2 px, 0.5 Hz, own phase).
- **unfold** (≈ 0.35 s lead + 0.16 s per mat): each mat rolls in (unfold 0 → 1 in 0.4 s with a small overshoot wobble);
  its thing drops on with a little bounce; event `unfold {id, x, y}`. Then `ask {promptKey, params, first}` (only before the
  FIRST launch of a round; later launches: event `next {launch, left}`) → `play`.
- **Mimi** `w.mimi = { x, y (feet), state 'stand'|'pump'|'look'|'dance', mood idle|talk|happy|cheer|think|oops|wave|giggle|
  dance|look|pump, moodT, blink, sx, sy (squash spring), lean (spring), face 1 }`.
- **Rocket** `w.rocket = { x, y (nozzle bottom), _px, _py, rot (rad, 0 = nose up), _prot, aim (launcher angle), state
  'pad'|'aim'|'boost'|'coast'|'chute'|'landed'|'return'|'fountain', water 0..1, chute 0..1 (open amount), swing (pendulum
  angle of the rocket under the chute), swingV, vx, vy, t }`.
- **play**: one active pointer, judged on `pointerDown`:
  - the target mat → **right** `{id, thing, x, y, launch, k, left, home?, count?}`; the mat gets `active` → phase **aim**
    (0.45 s): the launcher swings to aim (`rocket.aim` spring towards the angle of the flight's initial velocity, ≤ 0.6 rad),
    `w.arc = [{x,y}…]` 14 preview points of the planned flight (ascent ballistic part + a straight descent line), event
    `aim {id}` → phase **pump**: event `pumpAsk`.
  - another mat → **wrong** `{id, got, want, streak, x, y}`: the mat flaps (flapV kick), the thing wiggles "no-no" (wig kick
    0.3), Mimi `oops` + leans towards it; a miss (the same mat again within 1 s → `squish` only, not a miss).
  - Mimi box → `pokeMimi` (giggle + a little hop, never a miss); pump / rocket / empty grass → `soft {x, y}`; 3 soft → hint,
    6 → assist (the target glows big and the next press anywhere on the meadow picks it). Surprise hits → their tap events.
  - After 2 misses or `hint()`: `hint {id}` (the target glows, the ghost hand taps it twice; `w.hintHand`); cooldown 6 s; idle
    nudges after 12 s, backoff ×1.5 up to 30 s (`idle {n}`; the 2nd idle also hints).
- **pump** (the new gesture): ANY press (pump, Mimi, meadow, anywhere on the canvas) = one stomp: Mimi `pump` frame + squash
  (sy 0.88), the plunger goes down and springs back, `rocket.water` bubbles, gauge += 1/3, event `pump {n}` (n = 1..3).
  Presses closer than 0.22 s apart are merged. After `pumpAuto` (3.0 s) with no press Mimi stomps by herself every 0.5 s
  (events carry `auto: true`). The pump hit circle glows (`pumpGlow`). After the 3rd pump + 0.25 s → event `launch {id}` →
  **flight**. (`pumpCount` = 3 at every age; CONFIG.)
- **flight** (≈ 1.9–2.3 s, physical):
  1. **boost** 0.25 s: thrust along the launcher axis (accel ≈ 2600 px/s²) + gravity 900 px/s²; a water jet from the nozzle
     (`w.drops` spray, 30–40 drops, backwards along −velocity with spread, gravity, life 0.6 s); `rocket.water` → 0;
     event `whoosh`.
  2. **coast**: ballistic (gravity 900), `rot` follows the velocity direction (nose forward, spring ω 10); the boost is solved
     so the apex lies ABOVE the mat at height ≥ max(220, 0.5·distance) above the higher of pad/mat (clamped below the bubble
     band: apex y ≥ play.y0 + 40). At the apex (vy ≥ 0) → event `chute` and
  3. **chute**: the canopy opens (chute 0 → 1 in 0.3 s with an overshoot), vertical speed eases to a drift speed of 170 px/s;
     horizontal: steered so it ends EXACTLY on the mat (a critically damped follow of x towards the mat x + wind offset that
     decays to 0 near the ground); the rocket hangs below the canopy as a **pendulum** (swing angle driven by horizontal
     acceleration and `wind`, ω ≈ 4.5, ζ ≈ 0.15 → visible sway, |swing| ≤ 0.45); breezy weather adds gusts (`setBreeze`),
     rain adds nothing to the path (just drips).
  4. **landing** (event `land {id, x, y}`): the mat `squish` kick (+ flap), a puddle ring + 8 splash drops (event `splash`),
     the rocket bounces once (12 px) and tips to rest upright; the chute settles down over/behind it (chute → 0.3, draped).
     The other mats of this launch **fold** up (0.5 s, roll up + fly off upwards with a little spin, event `fold {id}`).
- **collect** (≈ 0.9 s): the thing hops up from the mat (20 px), then flies on an arc to the next free pennant slot on the
  pole and turns into a pennant (event `pennant {id, slot, thing, x, y}`; `w.pennants[] = {thing, slot, flutter, t}`);
  countSel: before flying, the pinecones are counted aloud (`count {i, x, y}` every 0.4 s); animals: `homeBadge {home, x, y}`
  (1 s). Meanwhile the rocket hops back to the pad in 2 springy hops (`rocket.state 'return'`, 0.8 s, squash on each
  touch, event `hopBack`), the chute folds (`chute_closed`). Then `launch++`; if launch < k → the next launch's mats
  **unfold** (no new `ask`, event `next`), else → **camp**.
- **camp** (≈ 2.4 s): event `camp`; the pennants flutter one by one bottom→top in order with `count {i}`
  events (0.35 s apart, the pennant does a little wave); Mimi `dance`; then the rocket fires a **fountain** straight up
  (`rocket.state 'fountain'`, 40 drops up to ~260 px, a little rainbow arc in the spray `w.fountain = {t, x, y, h}`, event
  `fountain`); then `roundDone {round, stars, misses, x, y}` (stars 3/2/1; assisted ≤ 2).
- **wipe** (≈ 1.3 s): event `wipe {mood}`; `w.wipe = {t, dir}`; at t 0.5 the world swaps (pennants cleared, rocket on the
  pad, new mats hidden); then `unfold` of the next round, or Talk time after round 4 / once the chapter passed 75 s with ≥ 3
  rounds done.
- `interactive` = state 'round' && (phase 'play' || phase 'pump').
- **Surprises** (one round per chapter, never the warm-up): `marmot` — 2–5 s after the ask a burrow appears in a free meadow
  spot (≥ hitR + 40 from every mat), the marmot pops up, looks around, waves, stays ~10 s, ducks; tap → `marmotTap` (whistle,
  a jump). `goat` — hops onto a far rock near the horizon (≥ 60 px above the top mat), 3 little hops, bleats; tap →
  `goatTap`. `bird` — flies in (an arc) and perches on the pole top; tap → `birdTap` (sings, notes). `w.marmot / goat / bird
  = {x, y, state, t, …}`; hit circles via `marmotHit() / goatHit() / birdHit()`.
- Water bits: `w.drops[] = {x, y, vx, vy, r, life, t}` (cap 90), `w.rings[] = {x, y, r, life, t, a}` (cap 30).
- Events also: `level {level, topic, weather}`, `round {round, surprise}`, `gust {dir}` (breezy), `talk`, `talkAsk {n}`,
  `talkResult`, `levelDone`, `sessionDone {stars}`. Every positional event carries `x, y`.
- Rotation / resize: re-layout, new homes for the same mats (they glide there in 0.3 s), Mimi/pad/pole snap, a flight in
  progress re-targets its mat's new position smoothly, everything clamped into the screen.

### 5.3 `DK.Weather` — `setWeather(i, {instant})` (0 sunny, 1 breezy, 2 rain, 3 rainbow; crossfade 2.5 s). Start from
`../../bear-fairy-tea/game/js/weather.js` (the same 4 moods) adapted to this game: `ambient` (`skyTop, skyBottom, tint,
light, sunX, sunY, sunA, dark, wind, gust, rain, rainbow, mood, moodIndex, env, envFrom, envMix`), `clouds[]` (rain clouds
in rain), `particles[]`: sunny motes + butterflies, breezy leaves + petals across (gusts every 6–10 s, event `gust`), rain
raindrops (+ splash bits on the ground below the horizon), rainbow sparkles + butterflies. `burst(x, y, {kind:
'stars'|'sparkle'|'confetti'|'drops'|'rainbow', n})`, `setParty(on)`, `wipeParticles(dir)`. Cap 120 (+60 during a wipe).
`weather.windSource = world` (the world reads wind via `setBreeze`).

### 5.4 `DK.Bot` — through `world.pointerDown/Up`: the target with p = skill (else a random non-target), aim error ±0.3 ×
hitR at the mat's current position, delays 0.6–2.0 s after `ask` / `next`; in `pump` it taps 3 times 0.3–0.6 s apart (or
waits for the auto-pump with p 0.15); answers Talk right with p = skill; taps surprises sometimes.

### 5.5 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved); `window.DK.debug = { world, weather, mode, stats, events, getState(), setSpeed(n), startGame(), goTitle(),
setBot(on, skill), setAutoRestart(on), gotoLevel(i), voiceLog, matScreen(id) → {x,y,r} CSS px, mimiScreen(), pumpScreen(),
marmotScreen(), goatScreen(), birdScreen(), answer() → {mat id} | null, targets() → [ids], toScreen(x,y), audio() }`.
World supplies `matHit(id)`, `mimiHit()`, `pumpHit()`, `marmotHit()`, `goatHit()`, `birdHit()`, `answer()`, `targets()`.

## 6. Voice, language — as the base §6 with helper **Mimi** (EN "Mimi", VI titles "Vịt Mimi", "Mimi" in lines), a cheerful
little duckling: pitch ≈ 1.25, rate ≈ 0.9. Things (VI): flower "bông hoa", mushroom "cây nấm", ball "quả bóng", mug "cái
cốc", lantern "chiếc đèn lồng", shapes "hình …", pinecones "quả thông", mat "tấm thảm", rocket
"tên lửa", parachute "dù", pump "bơm", flagpole "cột cờ", pennant "lá cờ". Animals/homes as the base. Moods: "trời nắng",
"trời gió", "trời mưa", "cầu vồng".
`I18N` API used by main (all `(lang, e)` → string):
- `ask(lang, promptKey, params, {first})` — 3 wordings each; `first` only in a chapter's round 0 ("Let's launch the rocket!
  Land on the RED one!"); `p.colors` "Land on the red one!" / "Bé cho tên lửa đáp xuống thứ màu đỏ nhé!"; `p.countSeq` "Land
  on 1, then 2, then 3!"; `p.countSel` "Land on the sign with {n} pinecones!"; `p.animal` "Fly to the {animal}!"; `p.home`
  "Who lives {home}? Land there!"; and the other topics.
- `sayNext(lang, e)` — the reminder before launch j ≥ 1 ("Next one: red!" short; countSeq "Now {n}!").
- `sayRight(lang, e)` — names the thing ("A red mug!") + "Now pump!"; `sayPump(lang, n)` "One!", "Two!", "Three! Blast off!"
  (VI "Một!", "Hai!", "Ba! Bay nào!"); `pumpAsk[]` ("Pump, pump, pump!" / "Bé bơm đi nào!") ; `pumpAuto[]` ("I'll help!");
  `chute[]` (rare: "Parachute!" / "Bung dù!"); `land[]` ("Touchdown!" / "Đáp rồi!") ; `sayPennant(lang, e)` (names the thing
  going up the flagpole, short); `camp[]` ("All our flags!"); `sayCount(lang, i)`, `sayCountRun(lang, n, kind)` ("Four
  pinecones!").
- `sayWrong(lang, e)` — names it, then the goal; never negative words. `sayWrongHint`, `sayName`, `talkWrong`.
- Keys: `hint[]`, `idle[]`, `praise[]`, `great[]` with `{child}`, `poke[]` (Mimi giggles "Quack!"), `weather.0..3`
  ("A sunny day at camp!", "Whoosh, it's windy!", "Pitter-patter, rain! Ducks love rain!", "Look, a rainbow!"),
  `surprise.marmot`, `marmot.tap`, `surprise.goat`, `goat.tap`, `surprise.bird`, `bird.tap`, `topic.*`, `session.done`,
  `party`, `talk.*`, `ui.*` incl. `ui.volume`, logo lines "Mimi's" / "Splash Rocket", VI "Vịt Mimi" / "Tên Lửa Nước";
  `ui.voice` "Mimi's voice" / "Giọng của Mimi".

## 7. Integration — title (Mimi with her rocket, mountains behind, ▶ Play, star total, language toggle, hold-⚙), settings with
volume, HUD, speech bubble, pause with −/+, chapter banner, Talk time, session done (Mimi dances under all the pennants,
fountains + confetti). Render order: sky → sun → rainbow (mood) → clouds → far → mid → meadow (+ camp props, flame,
windsock) → back particles → burrow/marmot, goat on rock → pole + pennants (+ bird) → mats back-to-front by y (mat → thing →
glow) → aim arc → pad + pump → Mimi → rocket (+ chute; in flight drawn in front of everything except fx) → drops / rings →
fountain → hint hand → front particles (rain) → fx → wipe → banner. Audio: unfold (soft cloth "fwump"), tap right (bright
bloop), aim (ratchet click), pump (squeaky "pff" with rising pitch per stomp + bubbling), launch (water WHOOSH: filtered
noise burst + rising tone), chute pop ("fwap"), landing ("pomf" + splash), wrong (soft "blub-wobble", low), soft (grass
tick), fold (cloth flap), pennant (rope zip up + ding), count pips rising, fountain (sparkling spray), hop back (boing),
marmot whistle, goat bleat (synth), bird chirp; ambience per mood (sunny birds, breezy wind, rain patter, rainbow soft
chimes), music bed per mood (ukulele/marimba plucks, ducked under speech).

## 8. Performance — ≤ 4 mats on screen, mats cached per (size bucket, seed, wet) as offscreen bitmaps (unfold/squish/flap by
transform + a cheap wave; gold/glow overlays), things cached per thing+size, meadow static part cached per size/mood,
≤ 120 particles, ≤ 90 drops, ≤ 30 rings; adaptive quality as before.
