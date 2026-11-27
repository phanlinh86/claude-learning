# Pip's Oasis Glow — design spec (the contract)

Every module and asset must use the exact names below. Namespace: `window.POG`. Storage prefix `pog:`.
Forked from `../snail-jungle-boop/` (same stage, hole layouts, sprite geometry and module split); this file replaces its spec.

## 1. Lessons from the reference (whack-a-mole)
| Keep | Change |
|---|---|
| Fixed grid of holes, critters pop up and duck down | Tap = a gentle *head-boop*: Pip the frog leaps in a real gravity arc and lands softly on the friend's head |
| Short reaction windows, rising pace | Friends either hold a **firefly** (boop them!) or are **napping** (leave them alone): one clear rule a 4-year-old can read by shape (open eyes + glowing firefly vs closed eyes + "z" + nightcap) |
| Big readable score, satisfying hit feedback | The firefly zooms into Pip's **lantern jar** (HUD), which glows brighter as the chapter fills |
| Rounds get faster | Four **storybook chapters** (morning → night) with a page-turn between them; a rare **golden firefly** worth 5 |

Fantasy: *"I'm a bouncy little frog collecting fireflies to light up the oasis before bedtime."*

## 2. Screen and coordinates
- Logical stage **960 × 540**, y **down**, units **px** and **seconds**. All world positions are logical px.
- The renderer fits the stage (contain) and centres it; backgrounds are extended to cover the letterbox.
- HUD band: y 0–70 (score pill left, hearts right, jar badge top-centre at (480, 38), pause/sound buttons top-right in DOM).
- **Pip's home:** a lily pad floating on the spring at **(480, 132)** (Pip's feet line). The pad (`lilypad.svg`) is drawn centred at (480, 136).
- Holes sit on the floor between y 260 and 500. Nothing gameplay-related below y 530.

### Hole layouts (rim centre x, y, scale s) — `World.LAYOUTS[zone]` (unchanged from the fork)
- **L0 spring (6):** back y 330 s 0.86: x 280, 480, 680 · front y 460 s 1.0: x 230, 480, 730
- **L1 palms (8):** back y 315 s 0.84: x 225, 395, 565, 735 · front y 460 s 1.0: x 165, 375, 585, 795
- **L2 dunes (9) and L3 night (9):** back y 280 s 0.74: x 330, 480, 630 · mid y 375 s 0.87: x 250, 480, 710 · front y 480 s 1.0: x 190, 480, 770
- Index order: back row left→right, then the next row (keys 1–9 use this order).

### Drawing a hole + friend (render.js does this; art must match)
At scale `s` with rim centre `(bx, by)`:
1. `burrow_back.svg` (viewBox 170×90, anchor = rim centre (85,45)) drawn 170s×90s.
2. Friend (viewBox **140×150**) drawn 140s×150s, bottom-centre at `(bx, by + 25s + (1−h)·140s)`, `h` ∈ [0,1] = pop height; **clipped** to `y < by + 4s`.
3. Awake with a firefly: `firefly.svg` or `firefly_gold.svg` (viewBox 64×64) drawn 62s×62s centred at friend-local **(70, 94)**, with a soft radial glow behind it (render), then `<kind>_paws.svg` on top so the paws cup it.
   Napping: the `<kind>_sleepy.svg` frame already has its paws folded; no firefly, no paws layer. Render adds floating "z" bubbles.
4. `burrow_front.svg` (170×90, same anchor) on top: the front lip hides the friend's bottom.
- Hit zone: circle centre `(bx, by − 45s)`, radius `88s`; the nearest hole whose zone contains the tap wins.
- **Head point** (where Pip lands): `(bx, by − 112s)` when h = 1 (top of the head is friend-local y ≈ 10).

## 3. Art style guide
- 100% original SVG written by generator scripts in `tools/art-characters/` and `tools/art-environment/`. Web references for inspiration only; never trace.
- Outline: 3 px (viewBox scale) rounded, colour = a darker shade of the fill (never pure black). Shading: one flat darker step + one highlight.
- No `<text>`, fonts, `<script>`, `<image>`, external refs, or filters with `feGaussianBlur` > 4. Transparent backgrounds except `sky.svg` and `icon.svg`.
- Frames of the same character share **identical body geometry** (only faces, paws, limbs and accessories change).
- **Storybook look:** warm, soft gouache-like flat colours, slightly hand-drawn rounded shapes, paper-warm highlights.
- Character vs background colour rule: the characters are saturated (frog green `#5cc96b`-ish, fennec orange-sand, jerboa peach, tortoise olive shell); backgrounds are softer and lower-contrast in the play band (y 260–540). Fireflies glow **warm yellow `#ffe066`** (gold: `#ffb81f` with white sparkle points); avoid that yellow in large background areas.

## 4. Asset table (`game/assets/default/`)
### Characters (character artist)
| file | viewBox | notes |
|---|---|---|
| `pip_idle.svg`, `pip_hop.svg`, `pip_boop.svg`, `pip_dizzy.svg` | 160×140 | Pip, a round little green frog facing **right**, sitting. Body centre (80,82), **feet line y 128** (anchor for drawing: feet centre (80,128)). Mouth corner / tongue origin **(118,74)**. idle = sitting, big eyes, smile; hop = legs stretched back, arms forward (same body blob, rotated pose allowed only for limbs); boop = squashed happy, eyes ^^; dizzy = swirly eyes, small stars are drawn by render. Drawn 120×105 at s=1. A tiny lantern-jar is **not** part of Pip (render draws the HUD jar). |
| `fennec_up/happy/wow/sleepy/paws.svg` | 140×150 | Fennec fox kit (huge ears). Body bottom at y 150, head top ≈ y 10 (ears may go to y 0). up = smiling, eyes open, paws ready; happy = giggling, eyes closed ^^ + blush (booped); wow = just woken: big round eyes, small "o" mouth, ears up (not scary, more "huh?"); sleepy = eyes closed peacefully, tiny soft nightcap, paws folded under chin, gentle smile. paws = only the two front paws around (70,94) (paws at about (42,100) and (98,100)), cupping the firefly. |
| `jerboa_*.svg` (same 5) | 140×150 | Jerboa (round body, long ears, big eyes). As above. |
| `tortoise_*.svg` (same 5) | 140×150 | Tortoise (dome shell with hex pattern, head sticking up). As above; sleepy = head half tucked, eyes closed. |
| `firefly.svg` | 64×64 | Chubby cute firefly facing the viewer: small dark-brown head with two dot eyes and a smile, tiny translucent wings, a big round glowing abdomen (`#ffe066` with a white highlight). No glow halo (render adds it). |
| `firefly_gold.svg` | 64×64 | Same body, golden (`#ffb81f`/`#ffd45a`), a tiny crown or three sparkle points around it; must read as "special" at 40 px. |
| `leaf.svg`, `leaf_empty.svg` | 48×48 | HUD heart: a round lily pad with a notch and a small pink flower (full) / pale outline only (empty). |
| `jar.svg` | 64×64 | HUD lantern jar: glass jar with a cork lid and string handle, transparent inside (render fills the glow behind it). |
| `lilypad.svg` | 200×70 | Pip's home lily pad (top view at an angle, ellipse ~ 180×44 with a notch, a pink lotus flower at one side). Centre (100,35). |
| `icon.svg` | 256×256 | App icon: Pip's face + a glowing firefly, on an opaque rounded-square dusk-teal background. |

### Environment (environment artist) — `levels/<chapter>/` with chapter ∈ `spring`, `palms`, `dunes`, `night`
| file | viewBox | notes |
|---|---|---|
| `sky.svg` | 960×540 | Opaque. Drawn "cover". spring = soft morning blue → peach; palms = bright noon blue; dunes = sunset orange → pink → violet; night = deep blue-violet with stars and a moon (not too dark: the play band must stay readable, min luminance ~ #2a2f5a). |
| `far.svg` | 1920×540 | Transparent; **horizontally tileable**; distant dunes / palms / mesas. Drifts at 4 px/s (parallax 0.2). Must reach the top of the stage area it covers (y ≥ 90) and fill down to y ≈ 300. |
| `floor.svg` | 1920×540 | Transparent above y ≈ 150; the ground plane the holes sit on (sand, with the **spring pool** in the centre top around (960, 140) so Pip's lily pad floats on water at stage (480,136)); y 260–540 calm and low-contrast; **tileable**. Static, centred so stage x 480 = file x 960. |
| `near.svg` | 960×540 | Foreground frame: palm fronds / reeds / rocks at the left and right edges and top corners only (keep x 120–840, y 70–540 clear except the edges). Static; render sways it a little. |
| `burrow_back.svg`, `burrow_front.svg` | 170×90 | Anchor rim centre (85,45). spring = reed clump ring around a dark water-edge hole; palms = woven basket; dunes = sand burrow ringed with pebbles; night = big clay jar mouth with a painted band. back = dark opening + back rim; front = front lip (lower half of the rim) + a tuft (reeds, palm leaf, a pebble, a small succulent). |
| `levels/palette.json` | — | `{ chapter: { sky, ground, accent, banner } }` hex colours (banner text, letterbox fill). |

Particles (`particles/`): `dragonfly.svg` 48×32, `butterfly_0.svg`, `butterfly_1.svg` 40×36 (wing frames), `petal.svg` 32×32 (lotus petal), `sandwisp.svg` 256×96 (soft translucent sand streak), `tumbleweed.svg` 48×48 (round, rotatable), `glow.svg` 24×24 (ambient firefly dot), `sparkle.svg` 32×32, `star_tw.svg` 24×24 (twinkle star).

## 5. Module contracts
### `POG.RNG` (`js/rng.js`) — unchanged
`new POG.RNG(seed)`: `next()` [0,1), `range(a,b)`, `int(a,b)` inclusive, `pick(arr)`, `chance(p)`.

### `POG.World` (`js/world.js`) — headless, deterministic, no DOM
- `new POG.World({ seed, difficulty: 'easy'|'normal'|'hard', level: 0 })`, `World.CONFIG`, `World.LAYOUTS`, `World.BIOMES = ['spring','palms','dunes','night']`, `World.BIOME_NAMES = ['The Morning Spring','The Palm Grove','The Sunset Dunes','The Starlit Oasis']`, `World.KINDS = ['fennec','jerboa','tortoise']`.
- `reset(seed)`, `update(dt)` (fixed sub-steps 1/120 s), `tapHole(i)` → `'match'|'wrong'|'empty'|'busy'|'none'`, `tapAt(x,y)`, `holeAt(x,y)` → index or −1, `drainEvents()`, `getState()`, `gotoLevel(i)`, `debugSpawn(i, type)` with type `'firefly'|'gold'|'sleepy'`.
- State fields:
  - `phase` `'play'|'over'`; `time`; `score`; `leaves`, `maxLeaves` (5); `level` (absolute), `zone` (= level % 4), `loop` (= floor(level/4)); `levelBoops`, `levelGoal` (15); `combo`, `mult` (1–3), `boops` (total fireflies caught, a gold counts 1), `golds`.
  - `holes`: `[{ x, y, s, critter }]`, `critter` = `null` or `{ kind, type: 'firefly'|'gold'|'sleepy', state: 'rise'|'up'|'sink'|'booped'|'wow', h, hPrev, t, upFor, id }`.
  - `pip`: `{ x, y, px, py, vx, vy, tilt, face: 1|-1, state: 'home'|'hop'|'boop'|'dizzy'|'return', t, target, squash }` — `(x,y)` is the **feet point**; `px,py` previous step; `tilt` radians clockwise positive, eased toward the velocity direction (max ±0.45); `squash` 0…1 landing squash for render (decays).
  - `stats`: `{ boops, golds, wrong, missed, bestCombo, leavesGained }`.
- Hit decided **at tap time** (critter `rise`/`up` with h ≥ 0.25). `type` sleepy → `'wrong'`; else `'match'`.
- **Pip's motion is ballistic:** a hop is a gravity parabola from the current feet point to the head point, `g = CONFIG.G` (≈ 2600 px/s²), flight time `T = clamp(a + b·dist)`; `vx = Δx/T`, `vy = (Δy − ½gT²)/T`. He lands (squash, `pipLand` event), the boop resolves visually there, then a return hop (a slower, higher parabola) back home to the lily pad, landing with a small squash and a ripple (`pipHome`). A tap during a hop retargets from the current point (a little mid-air kick). Taps are never blocked by his flight.
- Events: `pop {hole, kind, type}`, `boop {hole, gold, points, combo, mult, x, y}` (x,y = firefly position = hole firefly point), `wrong {hole, x, y}`, `empty {x, y}`, `miss {hole}` (a firefly holder ducked un-booped), `leafLost {leaves}`, `leafGained {leaves}`, `combo {n}` (5, 10, 15…), `levelClear {level, bonus}`, `levelUp {level, zone, loop, name}`, `gameOver {score}`, `pipLaunch {x,y}`, `pipLand {x,y}`, `pipHome {x,y}`, `nap {}` (mash guard).
- Rules (CONFIG): points 10 × mult (gold 50 × mult); mult = 1 + (combo≥5) + (combo≥10); +50 per chapter; hearts start 4, max 5, +1 every 12 fireflies; sleepy boop −1 heart + combo reset; miss −1 heart except on Easy; `GOLD_P` ≈ 0.07 of firefly pops from the 4th pop of a chapter, gold stays up ×0.75; fairness: if no firefly holder has been up for ~1.7 s the next pop holds one; after 2 firefly pops in a row with no sleeper up the next is a sleeper; the first pop of every chapter holds a firefly. First chapter on Easy must be easy for a 4-year-old.

### `POG.Weather` (`js/weather.js`) — ambient particles
`new POG.Weather({ width: 960, height: 540, seed })`, `setLevel(zone, { instant })`, `update(dt)`, `burst(kind, x, y)` (`'sparkle'`, `'gold'`, `'ripple'`), `particles`: `[{ sprite, x, y, size, rot, flipX, alpha, layer: 'back'|'front' }]` (logical px), plus `ripples: [{x, y, r, alpha}]` (water rings, drawn as ellipses by render). Bounded: ≤ 60 particles.
- spring: dragonflies (hover-and-dash), lotus petals drifting with pendulum sway, occasional ripples on the pool near the lily pad.
- palms: butterflies (frame swap, wandering), a few drifting petals.
- dunes: sand wisps sliding low (layer back, alpha breathing), a tumbleweed that rolls across now and then (rolling without slipping: rot = x / r, small hops with gravity on bumps).
- night: ambient fireflies (blink, lazy Lissajous), twinkle stars in the sky band (y < 200), occasional ripples.

### `POG.Bot` (`js/bot.js`)
`new POG.Bot(world, { skill: 0..1, seed })`, `step(dt)`: watches `world.holes` and calls `world.tapHole(i)` on firefly holders after a human-like reaction delay (skill 1 ≈ 0.25 s, skill 0 ≈ 1.1 s), with a mistake rate (tapping a sleeper) falling with skill; prefers gold.

## 6. Test hooks
URL params: `?speed=N&bot=1&skill=0..1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&diff=easy|normal|hard&level=N`.
`window.POG.debug`: `world, weather, mode, stats, getState(), setSpeed(n), startGame(), tap(i), tapAt(x,y), setBot(on, skill), setAutoRestart(on), gotoLevel(i), spawn(i, type)`.

## 7. Files and ownership
- Character artist: `tools/art-characters/*`, `game/assets/default/{pip_*,fennec_*,jerboa_*,tortoise_*,firefly*,leaf*,jar,lilypad,icon}.svg`.
- Environment artist: `tools/art-environment/*`, `game/assets/default/levels/**`, `game/assets/default/particles/**`.
- Mechanics engineer: `game/js/{rng,world,weather,bot}.js`, `tests/unit/*`, `tests/sim/*`, `docs/MECHANICS.md`.
- Lead (integration): `game/index.html`, `game/css/*`, `game/js/{storage,assets,audio,render,ui,main,extras}.js`, `app/*`, `tools/build.sh`, `tools/render_*.js`, `tests/e2e/smoke.js`.
- Testers: only `tests/` (their own new files) and `docs/reports/`.
