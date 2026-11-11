# Zippy's Jungle Boop — design spec (the contract)

Every module and asset must use the exact names below. Namespace: `window.ZJB`. Storage prefix `zjb:`.

## 1. Lessons from the reference (whack-a-mole)
| Keep | Change |
|---|---|
| Fixed grid of holes, critters pop up and duck down | Tap = *boop*, not a hammer: Zippy the jetpack snail flies over and bumps gently |
| Short reaction windows, rising pace | Colour matching: only critters holding a star of **Zippy's current colour** count |
| Big readable score, satisfying hit feedback | Each colour also has an **emblem shape** (colour-blind safe) |
| Rounds get faster | Four jungle biomes with distinct layouts, art and music; generous tap zones for kids |

Fantasy: *"I'm a speedy little snail-rocket booping my giggling jungle friends."*

## 2. Screen and coordinates
- Logical stage **960 × 540**, y **down**, units **px** and **seconds**. All world positions are logical px.
- The renderer fits the stage (contain) and centres it; backgrounds are extended to cover the letterbox.
- HUD band: y 0–70 (score pill left, leaves right, pause/sound buttons top-right in DOM). Zippy's home: (480, 112).
- Burrows sit on the floor between y 260 and 500. Nothing gameplay-related below y 530.

### Burrow layouts (rim centre x, y, scale s) — `World.LAYOUTS[level]`
- **L0 riverbank (6):** back y 330 s 0.86: x 280, 480, 680 · front y 460 s 1.0: x 230, 480, 730
- **L1 bamboo (8):** back y 315 s 0.84: x 225, 395, 565, 735 · front y 460 s 1.0: x 165, 375, 585, 795
- **L2 canopy (9) and L3 ruins (9):** back y 280 s 0.74: x 330, 480, 630 · mid y 375 s 0.87: x 250, 480, 710 · front y 480 s 1.0: x 190, 480, 770
- Burrow index order: back row left→right, then next row (keyboard 1–9 uses this order).

### Drawing a burrow + critter (render.js does this; art must match)
At scale `s` with rim centre `(bx, by)`:
1. `burrow_back.svg` (viewBox 170×90, anchor = rim centre at (85,45)) drawn at 170s×90s.
2. Critter (viewBox **140×150**), drawn at 140s×150s, bottom-centre at `(bx, by + 25s + (1-h)·140s)` where `h` ∈ [0,1] is the pop height; **clipped** to `y < by + 4s`.
3. Star (viewBox 64×64) drawn 58s×58s centred at critter-local **(70, 96)** — in front of the chest.
4. `<kind>_paws.svg` (same 140×150 viewBox) on top, so the paws hold the star. Clipped the same way.
5. `burrow_front.svg` (170×90, same anchor) on top: the front lip hides the critter's bottom.
- Hit zone: circle centre `(bx, by − 45s)`, radius `88s`; the nearest burrow whose zone contains the tap wins.

## 3. Art style guide
- 100% original SVG written by generator scripts in `tools/art-characters/` and `tools/art-environment/`. Web references for inspiration only; never trace.
- Outline: 3 px (at viewBox scale) rounded, colour = a darker shade of the fill (never pure black). Shading: one flat darker step + one highlight.
- No `<text>`, fonts, `<script>`, `<image>`, external refs or filters that need `feGaussianBlur` > 4. Transparent backgrounds except `sky.svg`.
- Frames of the same character share **identical body geometry** (only faces/paws/limbs change).
- Star palette (the 4 match colours) must stay distinct from the jungle greens:
  | id | name | fill | emblem |
  |---|---|---|---|
  | 0 | Coral | `#ff5d73` | heart |
  | 1 | Sunny | `#ffc93c` | sun (circle + 8 rays) |
  | 2 | Sky | `#3fa7ff` | water drop |
  | 3 | Grape | `#a46bff` | crescent moon |
  Emblems are white (`#ffffff`) with a thin darker outline, centred, ~40% of the star.

## 4. Asset table (`game/assets/default/`)
### Characters (character artist)
| file | viewBox | notes |
|---|---|---|
| `zippy_idle.svg`, `zippy_fly.svg`, `zippy_boop.svg`, `zippy_dizzy.svg` | 160×140 | Snail facing **right**, shell on back with a small jetpack. Body centre (80,82). Jetpack nozzle exit **(34,104)** pointing down-left (render draws the coloured flame there). Antenna tips (114,20) and (132,30): neutral white bulbs; render adds a coloured glow. fly = leaning forward, boop = squashed happy (eyes ^^), dizzy = swirly eyes. Drawn 120×105 at s=1. |
| `monkey_up.svg`, `monkey_happy.svg`, `monkey_wow.svg`, `monkey_paws.svg` | 140×150 | Body bottom at y 150, head top ≈ y 8. up = smiling, happy = giggling eyes closed + blush (booped), wow = surprised "o" mouth (wrong tap). paws = only the two paws, positioned around (70,96) where the star sits (paws at about (40,100) and (100,100)). |
| `frog_*.svg` (same 4) | 140×150 | as above |
| `toucan_*.svg` (same 4) | 140×150 | as above (wing tips act as paws) |
| `star_0.svg` … `star_3.svg` | 64×64 | Chubby 5-point star, rounded, fill from the palette with emblem. |
| `star_rainbow.svg` | 64×64 | Not used in gameplay — HUD icon for "any colour" (a multi-colour star). |
| `leaf.svg`, `leaf_empty.svg` | 48×48 | HUD life (green leaf / pale outline). |
| `icon.svg` | 256×256 | App icon: Zippy's face + a star, on a rounded-square jungle-green background (opaque). |

### Environment (environment artist) — `levels/<biome>/` with biome ∈ `riverbank`, `bamboo`, `canopy`, `ruins`
| file | viewBox | notes |
|---|---|---|
| `sky.svg` | 960×540 | Opaque. Drawn "cover". |
| `far.svg` | 1920×540 | Transparent; **horizontally tileable**; distant trees/hills. Drifts at 4 px/s (parallax 0.2). |
| `floor.svg` | 1920×540 | Transparent above y ≈ 230; the ground plane the burrows sit on (y 260–540 must be calm, low-contrast); **tileable**. Static, centred so x 480 of the stage = x 960 of the file. |
| `near.svg` | 960×540 | Foreground frame: leaves/vines at the left/right edges and top corners only (keep x 120–840, y 70–540 clear except edges). Static; render sways it a little. |
| `burrow_back.svg`, `burrow_front.svg` | 170×90 | Anchor rim centre (85,45). riverbank = mud burrow with reeds; bamboo = cut bamboo stump pot; canopy = hollow knot in a branch; ruins = mossy stone pot. back = dark opening + back rim; front = front lip (lower half of the rim) + a tuft of leaves/moss. |
| `levels/palette.json` | — | `{ biome: { sky, ground, accent, banner } }` hex colours for the renderer (banner text, letterbox fill). |
Particles (`particles/`): `dragonfly.svg` 48×32, `leaf.svg` 32×32, `butterfly_0.svg`, `butterfly_1.svg` 40×36 (wing frames), `firefly.svg` 24×24, `mist.svg` 256×96, `sparkle.svg` 32×32, `drop.svg` 16×24 (waterfall spray).

## 5. Module contracts
### `ZJB.RNG` (`js/rng.js`)
`new ZJB.RNG(seed)`: `next()` [0,1), `range(a,b)`, `int(a,b)` inclusive, `pick(arr)`, `chance(p)`.

### `ZJB.World` (`js/world.js`) — headless, deterministic, no DOM
- `new ZJB.World({ seed, difficulty: 'easy'|'normal'|'hard', level: 0 })`, `World.CONFIG`, `World.LAYOUTS`, `World.BIOMES = ['riverbank','bamboo','canopy','ruins']`, `World.BIOME_NAMES = ['Riverbank Morning','Bamboo Grove','Treetop Canopy','Waterfall Ruins']`, `World.KINDS = ['monkey','frog','toucan']`.
- `reset(seed)`, `update(dt)` (internally fixed sub-steps of 1/120 s), `tapHole(i)` → `'match'|'wrong'|'empty'|'busy'|'none'`, `tapAt(x,y)` (logical px; finds the burrow via the hit zone, then `tapHole`), `holeAt(x,y)` → index or −1, `drainEvents()`, `getState()` (plain JSON snapshot), `gotoLevel(i)`, `debugSpawn(i, colour)`.
- State fields:
  - `phase`: `'play'|'over'`; `time`; `score`; `leaves`, `maxLeaves` (5); `level` (absolute, 0,1,2,…), `zone` (= level % 4), `loop` (= floor(level/4)); `levelBoops`, `levelGoal` (15); `combo`, `mult` (1–3), `boops` (total).
  - `colour` (current colour id), `colours` (array of colour ids active this level), `nextColourIn` (boops until the change), `colourWarn` (true during the 1 s before a change), `graceColour` (previous colour accepted for 0.8 s after a change, else −1), `graceT`.
  - `holes`: `[{ x, y, s, critter }]`, with `critter` = `null` or `{ kind, colour, state: 'rise'|'up'|'sink'|'booped'|'wow', h, hPrev, t, upFor, id }`. `h`/`hPrev` are pop heights for render interpolation.
  - `zippy`: `{ x, y, px, py, vx, vy, tilt, face: 1|-1, state: 'home'|'fly'|'boop'|'dizzy'|'return', t, target }` (`px, py` previous step for interpolation; `tilt` in radians, clockwise positive, eased).
  - `stats`: `{ boops, wrong, missed, bestCombo, byColour: [n,n,n,n], leavesGained }`.
- Hit is decided **at tap time** (critter must be `rise` or `up` with h ≥ 0.25). Zippy's flight is the visible consequence: he flies an arc to `(bx, by − 120s)`, boops (0.18 s squash), then returns home. A new tap during flight retargets him (taps are never blocked by flight).
- Events (`drainEvents()` returns and clears): `pop {hole, kind, colour}`, `boop {hole, colour, points, combo, mult, x, y}`, `wrong {hole, x, y}`, `empty {x, y}`, `miss {hole, colour}` (a matching critter ducked un-booped), `leafLost {leaves}`, `leafGained {leaves}`, `colourWarn {to}`, `colour {from, to}`, `combo {n}` (at 5, 10, 15…), `levelClear {level, bonus}`, `levelUp {level, zone, loop, name}`, `gameOver {score}`, `zippyLaunch {x,y}`, `zippyArrive {x,y}`.
- Rules (CONFIG, tuned by the mechanics engineer + playtester): points 10 × mult, mult = 1 + (combo≥5) + (combo≥10); +50 per level clear; leaves start 3, +1 every 12 boops; wrong tap −1 leaf; miss −1 leaf except on Easy; colour changes every 6 boops (or 14 s without a boop); fairness: if no matching critter has been up for 1.4 s the next spawn matches. First level must be easy for a 4-year-old on Easy.

### `ZJB.Weather` (`js/weather.js`) — ambient particles
`new ZJB.Weather({ width: 960, height: 540, seed })`, `setLevel(zone, { instant })`, `update(dt)`, `burst(kind, x, y)` (kind `'sparkle'`), `particles`: `[{ sprite, x, y, size, rot, flipX, alpha, layer: 'back'|'front' }]` (logical px). Sprites are particle file basenames (`'leaf'`, `'butterfly_0'`, …). Bounded: ≤ 60 particles.
- riverbank: dragonflies darting (hover-and-dash), a few drifting leaves. bamboo: falling leaves with pendulum sway + tumble. canopy: butterflies (flap via frame swap, wandering), leaves. ruins: fireflies (blink, lazy Lissajous), mist puffs sliding on the floor (layer back), waterfall drops.

### `ZJB.Bot` (`js/bot.js`)
`new ZJB.Bot(world, { skill: 0..1, seed })`, `step(dt)`: watches `world.holes` and calls `world.tapHole(i)` after a human-like reaction delay (skill 1 ≈ 0.25 s, skill 0 ≈ 1.1 s), with a mistake rate (wrong-colour taps) falling with skill. Used for the title demo and high-speed tests.

## 6. Test hooks
URL params: `?speed=N&bot=1&skill=0..1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&diff=easy|normal|hard&level=N`.
`window.ZJB.debug`: `world, weather, mode, stats, getState(), setSpeed(n), startGame(), tap(i), tapAt(x,y), setBot(on, skill), setAutoRestart(on), gotoLevel(i), spawn(i, colour)`.

## 7. Files and ownership
- Character artist: `tools/art-characters/*`, `game/assets/default/{zippy_*,monkey_*,frog_*,toucan_*,star_*,leaf*,icon}.svg`.
- Environment artist: `tools/art-environment/*`, `game/assets/default/levels/**`, `game/assets/default/particles/**`.
- Mechanics engineer: `game/js/{rng,world,weather,bot}.js`, `tests/unit/*`, `docs/MECHANICS.md`.
- Lead (integration): `game/index.html`, `game/css/*`, `game/js/{storage,assets,audio,render,ui,main}.js`, `app/*`, `tools/build.sh`, `tests/e2e/smoke.js`.
- Testers: only `tests/` and `docs/reports/`.
