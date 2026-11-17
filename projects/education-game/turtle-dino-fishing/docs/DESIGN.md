# Tibo's Dino Lake Fishing — Design Spec (the contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace **`window.TL`**. Classic `<script>` files, no build step, node-safe at load
(touch the DOM lazily). The code base is a copy of `../bear-fairy-tea/` (Moka's Fairy Tea Party: state machine, voice,
input, storage, loud audio with volume, ui, main, tests) with `FT → TL` and storage prefix `ft: → tl:` already replaced.
The old contract is kept for reference in `docs/ref/*_bear-fairy-tea.md` — **when a detail is missing here, do what those
do** (i18n / voice API, hooks, Talk time, chapter-topic rotation between sessions, idle auto-pause, CONFIG style, hint
cooldown / idle backoff, prompt protection, phone layout tweaks, short rounds when a chapter runs long, soft-tap / assist
rules, content self-checks). **The tea-table world is replaced by a fishing-lake world.** Weather (morning → noon → sunset →
night) adapts `../bunny-dino-dig/game/js/weather.js` (same moods, dinosaur valley).
Target: iPhone + iPad Safari first, portrait and landscape.

## 1. What changes versus Moka's Fairy Tea Party (the loop must FEEL different)
| Moka's Fairy Tea Party | Tibo's Dino Lake Fishing |
|---|---|
| things fall and sit still on a table | **fish swim** back and forth in horizontal lanes under the water (tail wag, bob, smooth U-turns at the lake ends) — moving targets |
| tap the ODD one | tap the ASKED one ("Catch the RED fish!") — exactly one right fish per round (count-the-spots, shapes, homes …) |
| fairy lifts it into a garland | **a fishing line**: cast arc from the rod tip → plop + ripple → hook sinks to the fish → bite → rod bends → reel up, the fish **breaks the surface with a splash and swings on the line like a pendulum**, wriggling → shown to the child → **released**: a high ballistic leap back into the lake (spin, big splash) → a **water lily blooms** where it landed (4 lilies per chapter) |
| chime wave | **joy jumps**: the other fish leap one after another (rising notes), then everybody swims off, new fish swim in |
| Moka the bear, fairy forest, sunny → rainbow | **Tibo** the baby turtle in a straw sun hat on a mossy shore rock; **dinosaur valley lake**; **morning → noon → sunset → starry night** |

## 2. Screen and layout
- Short side 720 logical px; landscape `H=720, W=clamp(round(720×aspect),960,1600)`; portrait `W=720, H=clamp(round(720/aspect),960,1600)`.
  Screen space = world space (no camera), y down. `ins` = safe-area insets in logical px. `hudKeep` boxes as before.
- `World.setViewport(W, H, ins)` computes `layout`:
  ```
  layout = { W, H, ins, portrait, tall /* H/W > 1.6 */, phone /* long/short > 1.9 */,
    groundY,            // H - ins.bottom - (portrait ? 26 : 14)  (lake bed line)
    bubble: {x,y,w,h}, hud: {x,y,w,h},      // as before (top)
    surfaceY,           // water surface. landscape: round(H * 0.40); portrait: round(bubble bottom + 0.20 × H) clamped ≥ 0.30 H
    tibo: { x, y, h, w },   // seat point (bottom centre of Tibo) + height.
                        // landscape: x = ins.left + 110, y = surfaceY − 34 (on the rock), h = 190
                        // portrait:  x = ins.left + 105, y = surfaceY − 30, h = 170
    rock: { x, y, w, h },   // the shore rock (bottom-centre anchor at (x, y)), y = surfaceY + 30 (it stands in the water)
                        // landscape w = 300, portrait w = 270; x = tibo.x − 10
    rodBase: {x, y},    // Tibo's paw grip point = tibo seat + (+52, −0.42 h) in landscape units; rod length 170 (portrait 150),
                        // rest angle −1.05 rad (pointing up-right); the rod is drawn by code (bends)
    swim: { x0, x1, lanes: [y...] },  // fish swim range and lane centre ys.
                        // landscape x0 = rock right edge + 30, x1 = W − ins.right − 50; portrait x0 = ins.left + 40, x1 = W − ins.right − 40
                        // lanes evenly between surfaceY + 0.75 × size and groundY − 0.85 × size − (hud bottom keep):
                        // landscape 3 lanes, portrait 4 lanes (tall: 5 if they fit with ≥ 1.25 × size spacing)
    lilies: [{x, y}],   // 4 lily spots ON the surface line, spread across [swim.x0 + 40, swim.x1 − 40] (y = surfaceY + 6)
    showPt: {x, y},     // where a reeled fish hangs to be admired: ≈ (tibo.x + 170, surfaceY − 150) landscape,
                        // portrait (tibo.x + 210, surfaceY − 120); must be below the bubble
    size,               // fish body HEIGHT box: ages ≤ 4: 104, 5: 96, 6+: 90; × 1.12 when tall. Fish length = 1.5 × size.
  }
  ```
- **Fish hit test**: circle at the fish body centre, r = 0.6 × size + 14 (≈ 76), using the interpolated position at the
  time of the press **and** its position 0.12 s earlier (kids tap where it was) — either counts; nearest centre wins.
  Tibo box → `pokeTibo`. Lilies are not targets. Critter circle → `critterTap`.
- Nothing interactive under the home indicator; the lowest lane is ≥ 44 px above the bottom HUD keep-out.
- Portrait: Tibo's rock top-left above the surface, a big water area with 4 lanes below. Tall phones: background ×1.36.

## 3. Art style guide (ALL artists)
- **Original only.** Web search for reference only; never copy a known character/brand (no Crush/Squirt from Finding Nemo,
  no Franklin, no Nemo/Dory fish, no Land Before Time / Dinosaur Train / Peppa / Pokémon Squirtle look). Own design.
- Flat cartoon, chunky rounded shapes, big friendly eyes with white catch-light, rosy cheeks. Outline ≈ 4 px (at viewBox 256)
  in a darker tone of the fill (never pure black). One-step cel shading + one soft highlight upper-left.
- SVG: no `<text>`, no fonts, no scripts, no external refs, ≤ 1 light `feGaussianBlur`. `width`/`height` = viewBox.
- **Answer palette (exact hex, base/dark/light)** (unchanged; `TL.PALETTE` in `content.js`): red `#E84A4A/#A8282E/#F7A0A0`,
  blue `#3C8DE8/#1F5BA8/#A6CCF5`, yellow `#FFD23F/#C99A12/#FFEB9C`, green `#4CC26B/#2A8343/#A8E6B8`, orange
  `#FF9A2E/#C4650C/#FFCB8E`, purple `#8E44AD/#6840A8/#D2BDF3`, pink `#FF8FC0/#C9558A/#FFCCE2` (pink from age 5).
  Below age 5 never blue+purple, red+green, yellow+orange, green+orange, red+orange in one round.
- **Water** must make every answer colour pop: a clear, light turquoise-teal lake, never the same as answer blue/green —
  per mood (top → deep): morning `#9FD9D6 → #5FAFB4`, noon `#8FD6DA → #4E9FB0`, sunset `#B9C6C4 → #6E8C9A` (warm
  peach glints on the surface), night `#3D5677 → #22344F`. Fish are never darkened at night: they get a soft pale rim glow.
- **Neutral fish** (for shapes / spots / letters / numbers): pearly cream body `#FFF4DE` / shade `#E9D3AE` / outline
  `#B08E62`, fins soft peach `#F7CBA8`. Marks on the side: shapes in the answer colour (one colour per round at ages ≤ 4),
  spots `#5A3B26` (dark cocoa, dice layout, every spot clearly separate), letters/numbers dark cocoa `#5A3B26` rounded glyphs.
- **Colour fish**: body in the answer colour (base/dark/light), cream belly, fins in the dark tone.
- **Animal bubbles**: a big clear soap bubble (rim `#FFFFFF` alpha 0.85, faint iridescent rim tint, glossy highlight) with a
  guest animal (`guests/<a>.svg`, copied from the tea party — reuse) sitting inside, gently bobbing.
- **Tibo**: a baby turtle, skin **soft sage `#B9D6A5`** (shade `#8FB37E`, outline `#5E7F52`) — muted, clearly not answer
  green — shell **honey-caramel `#D7A65E`** with plates `#B9853F` and a cream rim `#F3E2B8`, cream belly plate `#F3E7C6`,
  big round eyes (`#2F2A3A` pupils, catch-light), rosy cheeks `#F2A99A`, a **straw sun hat `#EBD39A`** (weave lines
  `#C9AE6E`) with a small teal ribbon `#6FB7B0`. Never wears an answer colour. The rod: bamboo `#D9B66E` / nodes
  `#A9853E`, the line pale cream `#FFF8E6` (dark outline at night), the float cream + teal `#6FB7B0`, the hook silver.
- **Dinosaur valley** (calm, slightly warm, answer colours must pop): far = soft blue-violet mountains and a gentle volcano
  with a lazy smoke puff, a waterfall ribbon; mid = big tree ferns, palm-like cycads, a few soft long-neck dinosaur
  silhouettes far away; shore = sand + pebbles + reeds at the lake ends; lake bed = sand ripples, pebbles, waving weed.
  Moods (`morning | noon | sunset | night`): morning sky `#BFE6F2 → #FBE9C9` + mist over the water; noon `#8FD0F0 → #E6F6FA`
  bright, sun high, sparkles on the water; sunset `#F6B48A → #FBE3B8` warm, sun low, long glints; night `#1E2A55 → #3B4C7E`
  stars, moon, fireflies (darkness ≤ 0.35 on the background ONLY).
- **Water lily** (progress): a round sage lily pad `#9CC08A` / edge `#6F9361` with a notch + a flower that opens (petals
  cream-white `#FFF8EE`, centre tint of the caught fish's colour, or gold `#FFD86B` for neutral fish).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Tibo, critters & icon — character artist A (`tools/art_tibo.py`, `tools/tibo_sheet.js`)
| File | viewBox | Notes |
|---|---|---|
| `characters/tibo_{idle,blink,talk,happy,cheer,think,oops,cast,reel,wave}.svg` | 0 0 300 300 | Tibo SITTING on his shell bottom, 3/4 view facing RIGHT (towards the lake) but eyes on the child, **seat anchor (150, 292)**, identical body in every frame; both front flippers hold the rod GRIP at **(205, 175)** in every frame except wave (the rod itself is drawn by code from the grip — do NOT draw the rod); idle calm smile; happy big smile; cheer flippers up-ish holding the grip, eyes ^^; think head tilt; oops "hmm?" tilt (never sad); talk mouth open; cast leaning forward; reel leaning back, determined smile; wave one flipper waving (other holds grip). Write the grip point in a comment `<!-- grip 205 175 -->` |
| `characters/tibo_title.svg` | 0 0 300 300 | title pose: Tibo waving, hat on, holding a tiny fishing rod (drawn in this one) with a little cream fish on the line |
| `characters/ptero.svg`, `ptero_flap.svg` | 0 0 200 140 | a cute baby pterosaur (soft lilac-grey `#B9A9C9` / cream belly), centre anchor, facing RIGHT |
| `characters/bronto.svg`, `bronto_spray.svg` | 0 0 260 300 | a cute baby long-neck dinosaur (soft sky-teal `#8FC3C0`, cream belly, darker spots), standing in water up to its knees, facing LEFT, bottom anchor (130, 296); spray = head up, a water spout from its nose |
| `characters/frog.svg`, `frog_jump.svg` | 0 0 120 100 | a small frog (muted olive-sage `#A3B86C` — not answer green — with cream belly) sitting, bottom anchor (60, 96) |
| `characters/firefly.svg` | 0 0 48 48 | a tiny round firefly with a warm glowing tail `#FFE9A0`, centre anchor |
| `ui/star.svg`, `ui/star_empty.svg` | 0 0 64 64 | keep the existing ones |
| `icon.svg` | 0 0 512 512 | Tibo on his rock with the rod bent, a colourful fish on the line above the lake, a volcano + long-neck dino far away, full bleed |

### 4.2 Fish & lake art (canvas code) — character artist B: `game/js/fish_art.js` → `TL.FishArt`
Pure canvas drawing (Path2D / offscreen bitmap cached per thing+size), node-safe at load. **Anchor: origin = the fish body
CENTRE; the fish faces RIGHT (+x) at rot 0; `size` = body height box; length 1.5 × size.** The caller sets the transform
(translate, scale with sx < 0 to face left, rotate).
```
TL.FishArt.drawThing(ctx, thing, size, opt)
  // thing = { kind, color?, mark?, animal?, big? }
  //   kind 'fish'   : a chubby round friendly fish, big eye, smile, tail + fins. color → colour fish (answer colour body);
  //                   no color → neutral pearly fish. mark = null | {shape, color} (big shape on its side, ≈ 60 % of body
  //                   height: circle|square|triangle|star|heart|oval|rect|diamond) | {n} (1–12 dark spots, dice/rows,
  //                   clearly separate) | {text} (letters, "3+2", "7−4", numbers ≤ 20, rounded bold glyph fitted to the side)
  //   kind 'bubble' : clear soap bubble (diameter = size × 1.25) with TL.Assets.img('guests/<animal>') inside
  //                   (soft placeholder if not loaded)
  //   big: false → drawn at size × 0.6 (age-3 size topic: "the little fish")
  // opt = { t (s, for the tail wag / wobble), wag 0..1 (tail amplitude; 1 = swimming fast, 0.3 = idle), wriggle 0..1 (on the
  //   hook: whole-body S-bend), glow 0..1 (soft gold halo + outline pulse), night 0..1 (pale rim glow, never darkens),
  //   count -1..n (spots: the first `count` spots get a white ring + shine while being counted), blink 0|1, mouth 'smile'|'o' }
TL.FishArt.drawWater(ctx, layout, t, amb)        // lake: depth gradient (amb.waterTop/amb.waterDeep), gentle animated surface
                                                 // wave line, light caustic ripples, soft sun glints (amb.sunX), surface sheen;
                                                 // drawn from surfaceY − 6 down to H (lake bed SVG is drawn on top by render)
TL.FishArt.drawSurfaceFront(ctx, layout, t, amb) // a thin translucent surface highlight drawn over things crossing the surface
TL.FishArt.drawRod(ctx, base, len, angle, bend)  // bamboo rod from the grip, bend −1..1 (a curve, tip pulled down when > 0); returns tip {x,y}
TL.FishArt.drawLine(ctx, tip, hook, slack, night)// the fishing line (a quadratic sag by slack px) + the float when hook is in water
TL.FishArt.drawHook(ctx, x, y, s)                // a little rounded silver hook (kid-safe, no barb) with the cream/teal float above
TL.FishArt.drawRipple(ctx, x, y, r, alpha)       // surface ring (ellipse, flattened 0.3)
TL.FishArt.drawSplash(ctx, x, y, s, u)           // splash crown + droplets at phase u 0..1
TL.FishArt.drawBubbleDot(ctx, x, y, r, alpha)    // small air bubble
TL.FishArt.drawLily(ctx, x, y, s, open 0..1, color|null, t)  // lily pad on the surface + flower opening (sway with t)
TL.FishArt.drawHomeBadge(ctx, home, r, opt)      // round badge: sea, ice, forest, desert, savanna (as the tea party)
TL.FishArt.drawIcon(ctx, choice, size)           // Talk-time icons: any thing, {kind:'color', color} (paint blob),
                                                 // {kind:'number', n} (numeral + dots), {kind:'home', home}, {kind:'size', big}
TL.FishArt.drawHintHand(ctx, x, y, press, alpha)
TL.FishArt.drawSparkle(ctx, x, y, r, alpha, rot)
```
Contact sheets: `tools/fish_sheet.js` (Playwright) → `docs/art/fish_*.png` at in-game size and 3× on every water mood.
Tests: `tests/unit/fish_art.test.js` (every kind/mark/shape draws on a mock 2D context without throwing, caches work).
`tea_art.js`, its test and sheet are deleted by artist B.

### 4.3 Environment — environment artist (`tools/art_env.js`, `tools/env_scenes.js`)
For `m ∈ morning|noon|sunset|night`:
- `env/far_<m>.svg` (0 0 1200 720): sky-free layered mountains, volcano + smoke, waterfall, bottom-anchored, horizontally
  tileable (seam at 0/1200), transparent top. Sky colours in a comment `<!-- sky #top #bottom -->`.
- `env/mid_<m>.svg` (0 0 1200 300): tree ferns, cycads, far dino silhouettes, bushes; tileable; its bottom sits at surfaceY.
- `env/bed_<m>.svg` (0 0 1200 200): lake bed (sand ripples, pebbles, waving-weed bases, tiny shells), tileable, bottom-anchored at H.
- `env/rock.svg` (0 0 320 260, bottom-centre anchor (160, 260)): Tibo's mossy shore rock; its top seat at (150, 70)
  (comment `<!-- seat x y -->`), the lower 30 % is underwater (render tints it).
- `env/reeds.svg` (0 0 200 260, bottom anchor (100, 260)): reeds + cattails for the lake ends; `env/weed.svg` (0 0 80 200) weed strand.
- `env/sun.svg`, `env/moon.svg` (0 0 200 200), `env/cloud_a.svg`, `env/cloud_b.svg` (0 0 300 140), `env/smoke.svg`.
- Particles (0 0 32 32): `mote`, `sparkle`, `glint` (water sparkle), `firefly`, `star`, `dot`, `drop` (water drop 0 0 16 24),
  `bubble` (air bubble), `leaf_a`, `leaf_b`, `confetti_a`, `confetti_b`, `petal`.
- `tools/env_scenes.js` exports `RECIPE` (layer heights + offsets relative to `surfaceY` for landscape and portrait, sky and
  water colours per mood, sun/moon position per mood, the tall-portrait ×1.36 rule, rock + reeds placement, mist) +
  composed scenes at 1556×720, 960×720, 720×1556 per mood (with the rock, a fake water gradient and 4 coloured fish
  ellipses) and a seam test into `docs/art/`.

## 5. Code architecture (`game/js/`)
| File | Owner |
|---|---|
| `rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js` (+ `tests/unit/run.js`, `tests/sim/*`, `docs/MECHANICS.md`) | mechanics engineer |
| `i18n.js`, `voice.js`, `input.js` (+ `tests/unit/i18n_voice.test.js`, `docs/VOICE.md`) | voice & input engineer |
| `fish_art.js` (+ `tools/fish_sheet.js`, `tests/unit/fish_art.test.js`) | character artist B |
| `characters/*`, `icon.svg` (+ `tools/art_tibo.py`, `tools/tibo_sheet.js`) | character artist A |
| `env/*`, `particles/*` (+ `tools/art_env.js`, `tools/env_scenes.js`) | environment artist |
| `storage.js`, `assets.js`, `audio.js`, `render.js`, `ui.js`, `main.js`, `index.html`, `style.css`, `tests/e2e/*` | integrator |
Script order: rng, i18n, content, world, weather, bot, storage, assets, audio, voice, input, fish_art, render, ui, main.

### 5.1 Content (`content.js` → `TL.Content`) — same API as the tea party
```
TL.PALETTE, TL.COLORS, TL.SHAPES,
TL.GUESTS = { bunny:'forest', fox:'forest', deer:'forest', squirrel:'forest', owl:'forest', raccoon:'forest', mouse:'forest',
              hedgehog:'forest', penguin:'ice', crab:'sea', goldfish:'sea', camel:'desert', lion:'savanna' }
TL.AGE_TOPICS = { 3:['colors','shapes','size','animals'], 4:['colors','shapes','count','animals'],
  5:['shapes','count','letters','animals'], 6:['lower','initial','add','count'], 7:['initial','add','sub','oddeven'] }
TL.Content.makeRound(topic, { age, lang, rng, roundIndex, level, surprise, short }) → round   // pure, deterministic, self-checks
TL.Content.makeTalk(topic, { age, lang, rng }) → talk
TL.Content.topicsFor(age, rng, lastTopics)
TL.Content.validate(round) → null | reason
round = { topic, age, lang, roundIndex, surprise: null|'ptero'|'bronto'|'frog'|'fireflies',
  members: [ { id, thing: { kind, color?, mark?, animal?, home?, big?, nameKind, nameValue }, target: bool } ],
  targetId, promptKey, params, rule: { kind, value } }
```
**Exactly one target per round**, every other member clearly NOT matching the rule (self-check). Fish per round:
warm-up (round 0) 2; age 3: 2, 2, 3, 3; age 4: 2, 3, 3, 4; age 5: 3, 4, 4, 5; 6+: 4, 4, 5, 5. Max 5 (portrait tall may show 5).
- `colors`: colour fish, all different colours from the allowed set (age 3: 2 colours, age 4: 3, 5+: 4), `p.color {color}`
  "Catch the {color} fish!". Colour-pair rules (§3).
- `shapes`: neutral fish with a shape mark (one mark colour per round ≤ 4, mixed at 5); age 3/4 shape set circle, square,
  triangle, star, heart; `p.shape {shape}` "Catch the fish with the {shape}!".
- `size` (age 3): same colour fish, one big one little or 1 little among bigs: `p.size {big}` "Catch the little fish!" / "the big fish".
- `count`: neutral fish with N spots, all counts distinct, range 1–5 (age 4), 1–10 (5), up to 12 (6); `p.count {n}`
  "Catch the fish with {n} spots!". On catch the spots are counted aloud while it hangs on the line.
- `animals`: animal bubbles. Round 0 and age 3: by name `p.animal {animal}` "Catch the {animal}!". Age ≥ 4 from round 1:
  homes `p.home {home}` "Who lives in the {home}? Catch that friend!" — homes age 4: sea / ice / forest, 5+: + desert,
  savanna; exactly one member lives there; on catch its home badge shows.
- `letters` / `lower` / `initial` / `add` / `sub` / `oddeven`: neutral fish with a text mark (as the tea party rules, but
  "catch the one that IS …": `p.letter {letter}`, `p.lower {letter}` (capital asked, small letters on fish),
  `p.initial {letter}` (bubbles with guests, "Who starts with {letter}?" — names in the current language),
  `p.add {a} {b}` (numbers on fish, catch the sum), `p.sub`, `p.oddeven {parity}`). Drop I from lower-case rounds.

### 5.2 `TL.World` (headless, deterministic; fixed sub-steps ≤ 1/120 s; `_p*` previous values + `alpha` for interpolation)
Public API as the tea party: `setViewport(W,H,ins), setAge, setLang, newSession({lastTopics}), levels, startLevel(i),
update(dt), drainEvents(), pointerDown/Move/Up(x,y), cancelDrag(), hint(), talkAnswer(id), prompt(), resetNudges(), skipTalk(),
layout, hudKeep, state, phase, level, topic, round, roundsPerLevel, stars, levelStars, roundStars, misses, talk, alpha,
stateTime, phaseTime, interactive, weather (= level % 4), members, line, lilies, tibo, critter, hintHand, memberById(id),
answer(), memberHit(id), tiboHit(), critterHit()`.
States `intro | round | roundDone | talk | levelDone | sessionDone`. Phases in a round:
`'enter' | 'play' | 'cast' | 'reel' | 'show' | 'release' | 'joy' | 'leave'`.
- **Swimming (physical):** each member has a lane and a direction. **enter** (≈ 1.2–1.8 s): fish swim in from off-screen on
  their side (staggered 0.25 s) at 2.2× speed easing down to cruise; event `enterSwim {id}`; when all are in range →
  `ask {promptKey, params, first}` → `play`. Cruise: speed = CONFIG.speed[age] (3: 38, 4: 48, 5: 58, 6: 66, 7: 74 px/s)
  × per-fish 0.85–1.15; velocity follows the target with a soft spring (no instant changes); vertical bob ±6 px at 0.5 Hz +
  a slow lane drift ±10 px; **U-turn** near x0/x1 (or before getting closer than 1.3 × length to a lane neighbour): decelerate,
  flip `face` over 0.35 s (`sx` goes 1 → 0 → −1, so it looks like a turn), accelerate back; tail `wag` phase advances with
  speed. Bubbles drift slower (0.7×) with a wobble. Fish in the same lane never overlap.
  While a finger is down, fish within 180 px of it ease to 35 % speed (easier to tap). The target ALWAYS stays reachable.
- **play** — one active pointer; the FIRST contact of a gesture is judged on `pointerDown` (hit test §2); a press that starts
  on nothing, then slides onto a fish within 0.25 s, is judged on that fish. Later contacts of the same gesture are ignored.
  - the target → **right** `{id, thing, x, y}` → phase **cast**: the target stops with a spring (startled "!" → curious),
    Tibo `cast`; the hook flies on a **ballistic arc** from the rod tip to the surface above the fish (flight ≈ 0.55 s,
    apex ≥ 90 px above the tip; the rod whips forward −0.4 rad and springs back), event `plop {x, y}` (ripple), the hook
    sinks to the fish's mouth (≈ 0.35 s, slight sway), event `bite {id, x, y}` (the fish turns to it, a nibble bounce) →
    phase **reel**: Tibo `reel`, rod bend 0 → 0.8 (spring), line taut; the fish is pulled up and toward Tibo along a
    curve, wriggling (`wriggle` 1), bubbles trail; at the surface event `splash {x, y}`; above water it **swings on the line
    as a damped pendulum** (length shortening from ≈ 160 to 90 px, θ0 ≈ 0.6 rad, g = 1400 px/s², damping 0.6/s) up to
    `showPt` → phase **show** (≈ 1.4 s; count topic: n × 0.55 s + 0.8 s): Tibo `happy`; count topic: spots counted one by
    one (`member.count` 0..n, event `count {id, i, x, y}`); animals: event `home {home, x, y}` and `w.badge = {home, x, y, a}`
    for 2 s → event `roundDone {round, stars, misses}` (3/2/1 for 0/1/≥ 2 misses; assisted ≤ 2) → phase **release**:
    the hook lets go, the fish **leaps** on a ballistic arc (v0 ≈ 900 px/s up-right, g = 1400, spin one flip) to the next
    lily spot (`layout.lilies[i]`, i = round index in the chapter), event `dive {x, y}` (big splash + ripples), then
    `lily {i, x, y, color}` (the lily opens with a spring overshoot, `w.lilies[i].open` 0 → 1); the rod springs straight
    (overshoot); the caught fish swims away under water and fades.
  - a non-target fish → **wrong** `{id, got:{nameKind,nameValue}, want:{rule}, streak, x, y}`: it darts (quick 0.4 s burst
    away from the finger at 3× speed, squash-stretch), puffs 3 bubbles, then cruises on; counts as a miss. Pressing the
    same wrong fish again within 1 s is not a new miss (event `wiggle`).
  - press on water/nothing → `soft {x, y}` + a ripple/bubble puff, no line (3 → hint, 6 → assist: the target glows big,
    slows to 20 % and the next press ANYWHERE in the water band picks it). Tibo → `pokeTibo`. Critter → `critterTap`.
  - After 2 misses or `hint()`: `hint {id}` — the target glows, slows to 40 %, the ghost hand follows it and taps twice
    (`w.hintHand = {x, y, t, press, alpha, id, mode:'tap'}`); cooldown 6 s; idle nudges after 12 s, backoff ×1.5 up to 30 s.
- **joy** (≈ 0.35 s per remaining fish + 0.5 s): the other fish leap one after another left→right (small arcs 60–90 px out
  of the water, a flip, splash on re-entry), event `joy {i, n, id, x, y}` each (main plays a rising note; `splash` too).
- **leave** (≈ 0.9 s): every fish swims off-screen fast to its nearest side; then the next round (enter) or Talk time after
  round 4 / once the chapter passed 75 s with ≥ 3 rounds done. After the 4th lily: event `pondFull` (all lilies sway +
  sparkle) before Talk time; lilies reset per chapter.
- `w.members[] = { id, thing, target, lane, x, y (CENTRE), vx, vy, face ±1, sx, sy, rot, rotV, wag, wagPhase, wriggle,
  state 'enter'|'swim'|'dart'|'hooked'|'reel'|'show'|'leap'|'gone'|'joy'|'leave', glow, count -1..n, scale, blink,
  + _px _py _prot _psx _psy }`.
- `w.line = { state 'rest'|'fly'|'sink'|'taut'|'free', tip {x,y}, hook {x,y}, slack px, bend, rodAngle, _p* }` (render draws
  the rod from `layout.rodBase` with `rodAngle` and `bend`, the line from the tip to the hook; at rest the hook dangles a
  little below the tip swinging gently).
- `w.lilies = [{x, y, open 0..1, color|null, sway}]`, `w.badge | null`, `w.ripples = [{x, y, r, a}]`,
  `w.splashes = [{x, y, s, u}]`, `w.bubbles = [{x, y, r, vy, a}]` (cap 40) — render draws them via FishArt.
- `w.tibo = { mood idle|talk|happy|cheer|think|oops|cast|reel|wave, moodT, blink, look (−1..1), bounce 0..1 }`.
- Surprises (one round per chapter, never in the warm-up): chapter 0 **ptero** (a baby pterosaur glides across the sky
  above the lake, dips its feet with a splash, flies off; tap → happy loop), chapter 1 **bronto** (a baby long-neck wades in
  at the right end, `w.critter = {kind, x, y, t, state 'in'|'stay'|'spray'|'out'|'gone'}`; tap → it sprays a water fountain
  + mist sparkle), chapter 2 **frog** (sits on the first open lily or a pad near the right; tap → ribbit + hop to another
  pad), chapter 3 **fireflies** (6 fireflies drift over the water, `w.critter.flies = [{x, y, a}]`; tap one → twinkle burst).
  Critters are never targets and never cover the target. Event `critter {kind}` on appear.
- Events also: `level {level, topic, weather}`, `round {round, surprise}`, `talk`, `talkAsk {n}`, `talkResult`,
  `levelDone`, `sessionDone {stars}`. Every positional event carries `x, y`.
- Rotation / resize mid-round: re-layout; cancel the gesture; lanes re-placed, swimming fish move to their lane y with a
  spring, x clamped into the new range; a hooked/reeling fish snaps to the new path; everything clamped into the screen.

### 5.3 `TL.Weather` — adapt `../bunny-dino-dig/game/js/weather.js` (morning → noon → sunset → night):
`setWeather(i, {instant})` (crossfade 2.5 s), `setParty(on)`, `resize(W,H,surfaceY)`, `update(dt)`, `ambient` (`skyTop,
skyMid, skyBottom, waterTop, waterDeep, tint, light, night 0..1, sunX, sunY, sunA, moonX, moonY, moonA, mist 0..1, glint 0..1,
mood, moodIndex`), `clouds[]`, `particles[]` (morning motes + mist wisps, noon glints on the water surface, sunset glints +
drifting petals, night fireflies + twinkle stars; air bubbles rising underwater in every mood), `burst(x, y, {kind:'sparkle'|
'stars'|'confetti'|'drops', n})`, `addDrops(x, y, n)` (water droplets with gravity, used by splashes). Cap 120. Particle
kinds = the particle files in §4.3.

### 5.4 `TL.Bot` — taps through `world.pointerDown/Up` at the target's CURRENT position (moving!): taps the target with
p = skill (else a random other fish), aim error ±0.3 × r, human-ish delays (0.8–2.4 s) after `ask`; sometimes taps water;
answers Talk right with p = skill; taps critters sometimes.

### 5.5 Test hooks — URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&age=N&lang=en|vi&level=N&novoice=1&skill=x`
(never saved); `window.TL.debug = { world, weather, mode, stats, events, getState(), setSpeed(n), startGame(), goTitle(),
setBot(on, skill), setAutoRestart(on), gotoLevel(i), voiceLog, memberScreen(id) → {x,y,r} CSS px, tiboScreen(),
critterScreen(), answer() → {member} | null, toScreen(x,y), audio() }`. World supplies `memberHit(id)` {x,y,r},
`tiboHit()` box, `critterHit()` (circle or null), `answer()`.

## 6. Voice, language — as the tea party §6 with helper **Tibo** (EN "Tibo", VI "Rùa Tibo" in titles, "Tibo" in lines),
a cheerful baby turtle: pitch ≈ 1.2, rate ≈ 0.9. VI: fish "con cá", "con cá màu đỏ", "con cá có hình ngôi sao",
"con cá có 3 chấm", "con cá to / con cá nhỏ"; bubble friends as the tea party guests; homes: sea "biển", ice "xứ băng",
forest "rừng", desert "sa mạc", savanna "đồng cỏ châu Phi"; "Câu con cá màu đỏ nhé!"; release "Tạm biệt cá nhỏ!".
`I18N` API used by main (all `(lang, e)` → string): `ask`, `sayRight` ("A red fish! Well done!" / home: "The crab! The crab
lives in the sea."), `sayCount` / `sayCountRun` (spots), `sayWrong` ("That one is a blue fish. Let's find the red fish!"),
`sayName`, `talkWrong`; keys `hint[]`, `idle[]`, `praise[]`, `great[]` with `{child}`, `cast[]` ("Swish!" / "Vút!"),
`bite[]` ("Got it!"), `release[]` ("Bye bye, little fish!"), `lily[]`, `pond[]` ("Four lilies! The lake is so pretty!"),
`joy[]`, `talk.*`, `weather.0..3` ("Good morning, lake!", "The sun is high — sparkly water!", "What a pretty sunset!",
"Look at the stars!"), `surprise.ptero|bronto|frog|fireflies`, `critter.*` (tap lines), `enter[]` ("Here come the fish!"),
`topic.*`, `session.done`, `party`, `ui.*` incl. `ui.volume`, logo lines "Tibo's" / "Dino Lake Fishing",
VI "Rùa Tibo" / "Câu Cá Hồ Khủng Long".

## 7. Integration — title (Tibo waving on his rock with a little fish on the line, ▶ Play, star total, language toggle,
hold-⚙), settings with volume, HUD (4 lily dots), bubble, pause with −/+, chapter banner, Talk time, session done (all 16
lilies' flowers float up as confetti, fish leap in a fountain, Tibo cheers). Render order: sky → stars/moon/sun → clouds →
far → mid → reeds (back) → water (FishArt.drawWater) → lake bed → weed → underwater particles (bubbles) → fish (sorted by
lane, hooked fish on top) → ripples → lilies (+ frog) → surface front → bronto → rock → Tibo → rod + line + hook → fish
above water (show/leap) → splashes → ptero → fireflies → hint hand → soft-tap fx → front particles → fx → banner.
Audio: cast "swish" (filtered noise sweep) + reel click, plop (pitched drop), bite "nibble" (two quick pips), reel
ratchet ticks, splash (noise burst + low thump), show "ta-da" chime, release leap "whee" (rising sine) + dive splash,
lily bloom (soft bell chord), wrong soft "bloop-bloop" + bubble pops, count spot "pip" rising, joy jumps rising
pentatonic notes + small splashes, critter sounds (ptero chirp, bronto honk + spray, frog ribbit, firefly twinkle),
ambience per mood (morning birds + lapping water, noon cicadas-light + water, sunset gentle waves + distant dino hum, night
crickets + frogs), music bed per mood (soft marimba / kalimba plucks, ducked under speech).

## 8. Performance — ≤ 5 fish (+ critter), Path2D / bitmap cached per thing+size+frame-bucket, ≤ 120 particles;
adaptive quality as before.
