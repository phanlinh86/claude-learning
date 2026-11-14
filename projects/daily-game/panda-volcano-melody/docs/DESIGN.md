# Tofu's Volcano Melody — design spec (the contract)

Every module and every agent works against this file. Names here are exact.
Namespace: `window.PVM`. Storage prefix `pvm:`. Requirement: `../REQUIREMENT.md`.

## 1. Lessons from the reference (Pac-Man-style top-down collectors, our own `penguin-candy-dash`)
| Keep | Change |
|---|---|
| Top-down field, walk to pick things up | Free analog movement (hold a finger → walk to it), no maze, no corridors |
| Chasers that create tension | Few, **slow**, "grumpy-but-cute" pebble crabs; a pinch = dizzy + one heart, then 2 s safe blink; they wander part of the time instead of homing perfectly |
| Pellets fill the level; level clears when done | A **song meter**: a fixed number of notes per season; each caught note plays the next note of the season's melody |
| Power pellet flips the chase | Combo 5 brings **Coco the parrot** (10 s): she collects notes near Tofu and the crabs scuttle away |
| Obstacles shape the chase | Volcano in the middle + 3–5 props (palms, rocks, bushes); crabs path around them by sliding, so circling the volcano is a real escape |
| Fruit bonus | A rare **mango** restores a heart |

Fantasy: **wandering a sunny island scooping up music the friendly volcano hums out.**

## 2. Screen and coordinates
- Logical stage **960×540 px**, y down, units px and seconds. The renderer fits it with *contain* and fills the letterbox with the tileable sea.
- Top-down 3/4 view. Every entity's `x,y` is its **ground point** (feet / shadow centre). Things in the air have `z` (px above ground, up = +z) and are drawn at `y − z`, with a shadow at `y`.
- **Draw order:** ground → ground particles → shadows → props, volcano, crabs, notes, mango, Tofu **y-sorted by ground y** → Coco (always on top, she flies) → air particles → juice → HUD.
- HUD band y 0–60 (score pill left x 14–220; song meter centre x 300–660; hearts right x 680–850; HTML pause/sound buttons top-right x > 860). Nothing playable there.
- **Arena** (where ground points may be): `ARENA = { x: 40, y: 92, w: 880, h: 420 }` (x 40–920, y 92–512). The ground art's grass/meadow covers at least this rect; a sand beach rims it; sea beyond.
- **Volcano:** ground anchor `VOLCANO = { x: 480, y: 330 }` (base centre); solid circle `{ x: 480, y: 305, r: 78 }`; crater mouth (where notes and smoke leave) at `CRATER = { x: 480, y: 196 }`.
- Tofu spawns at `SPAWN = { x: 480, y: 470 }` (below the volcano).

## 3. Art style guide
- 100 % original SVG written by generator scripts in `tools/art-characters/` and `tools/art-environment/` (Python or Node, writing files). Web references are for inspiration only; never trace.
- Outline ~3.5–4 px at drawn size (scale the stroke with the viewBox), colour = a darker shade of the fill (never pure black — Tofu's black fur patches use `#2b2d3a`-ish, outlined `#15161f`). Round joins and caps.
- One-step shading: flat base + one darker shadow shape + one small highlight.
- No `<text>`, fonts, `<script>`, `<image>`, filters heavier than a tiny blur, or external refs. Transparent backgrounds (except `ground.svg` and `sea.svg`, opaque).
- Palette mood: sunny tropical — meadow greens, warm sand, turquoise sea, a chocolate-and-terracotta volcano with a soft pink-orange glow (never scary lava, no fire). Tofu is **white + charcoal panda with a small red scarf** (so he reads on every meadow, incl. snow). Crabs **pebble-grey shell with orange claws**. Coco **bright green parrot, yellow head, red tail**. Notes are **saturated** (red, blue, green, purple) with a cream outline glow so they pop on grass. Ground art is **mid/low saturation, low contrast** so characters and notes always win.

## 4. Asset table (`game/assets/default/`)
Sizes = drawn size. Anchors in viewBox units. Every frame of one character shares identical body geometry (only the moving parts differ).

### Characters (character artist)
| File | viewBox | Drawn | Anchors / notes |
|---|---|---|---|
| `tofu_idle.svg`, `tofu_walk1.svg`, `tofu_walk2.svg` | 0 0 120 120 | 72×72 | Ground point (feet) bottom-centre **(60,114)**. Faces **right** (renderer mirrors). 3/4 front view, round body, red scarf. walk1/walk2 = alternating legs/arms. |
| `tofu_happy.svg` | same | same | Eyes ^^, arms up. |
| `tofu_hurt.svg` | same | same | Dizzy: swirly eyes, little stars are drawn by the renderer — no tears, never sad. |
| `tofu_sleep.svg` | same | same | Sitting, eyes closed (game over nap). |
| `crab_1.svg`, `crab_2.svg` | 0 0 100 80 | 56×45 | Ground point (100→ bottom-centre **(50,76)**). Seen from the front: round pebble shell, two eye stalks, grumpy-cute brows, orange claws. Frames = legs alternate, claws open/closed. Symmetric (no facing). |
| `crab_dizzy.svg` | same | same | Eyes swirly, claws down (after a pinch / when scared). |
| `coco_1.svg`, `coco_2.svg` | 0 0 120 100 | 64×53 | Body centre **(60,50)**. Flying, faces **right**. 1 = wings up, 2 = wings down. |
| `note_0.svg` … `note_3.svg` | 0 0 64 64 | 40×40 | Centre (32,32). 0 = red quarter note ♩, 1 = blue eighth note ♪, 2 = green beamed pair ♫, 3 = purple half note (hollow head) 𝅗𝅥. Each with a soft cream halo ring so it reads on any ground. Shape + colour both differ (colour-blind safe). |
| `mango.svg` | 0 0 64 64 | 36×36 | Centre (32,32). Ripe mango with a leaf, a tiny heart highlight. |
| `heart_full.svg`, `heart_empty.svg` | 0 0 40 36 | 26×24 | HUD hearts. |
| `icon.svg` | 0 0 256 256 | — | Tofu's head with a note, on a round turquoise badge. |

### Environment (environment artist)
| File | viewBox | Notes |
|---|---|---|
| `levels/<season>/ground.svg` | 0 0 960 540 | Opaque, one per season (`spring summer autumn winter`). Top-down island: sea everywhere outside an irregular, soft island coastline that encloses ARENA with ≥ 20 px to spare (island ≈ x 14–946, y 66–534), a sand beach band, then meadow (winter: snowy meadow). Flat ground decor only (grass tufts, flowers, pebbles, fallen leaves, snow drifts) — low contrast, nothing that looks like a note, crab or mango. Leave the volcano footprint (circle 480,305 r≈100) as plain ground. The sea at the stage edges must be the flat sea colour so it meets `sea.svg`. |
| `levels/sea.svg` | 0 0 240 240 | Opaque, tileable in **both** directions. Turquoise water with a few lighter wave strokes. Its base colour = the ground art's sea colour. The renderer drifts it slowly. |
| `props/volcano.svg`, `props/volcano_winter.svg` | 0 0 240 200 | Drawn **216×180** with the base centre (120,190) at `VOLCANO` (480,330). Crater mouth centre at **(120,49)** (→ world 480,196). Friendly: chocolate/terracotta cone, a soft pink-orange glow in the crater, a few green patches (spring/summer), a snow cap in winter. A cute little face is welcome (two closed happy eyes on the slope). Base footprint ≈ 200 px wide at drawn size. |
| `props/<kind>_<season>.svg`, kind ∈ `palm rock bush` | palm 0 0 120 150 · rock 0 0 100 80 · bush 0 0 100 80 | palm drawn 96×120, rock 70×56, bush 80×64. Anchor: **bottom-centre** = ground point. Season variants (spring blossoms on bushes, summer lush, autumn orange bush + palm with coconuts, winter snow caps). |

`levels/palette.json` = `{ "spring": { "banner": "#…", "accent": "#…", "tint": "#…", "tintAlpha": 0.0, "sea": "#…", "hud": "#…" }, "summer": {…}, "autumn": {…}, "winter": {…} }` — banner = season banner colour; tint = optional light colour wash; sea = flat sea colour (letterbox fallback); hud = pill background colour that reads on that season.

### Particles (environment artist), `particles/`
`blossom.svg` (0 0 20 20 pink petal), `butterfly.svg` (0 0 24 20, wings open), `sunmote.svg` (0 0 16 16 soft glow dot), `leaf.svg` (0 0 20 20 autumn leaf), `snowflake.svg` (0 0 24 24), `smoke.svg` (0 0 64 64 soft cream-grey puff), `dust.svg` (0 0 32 32 soft sand puff), `sparkle.svg` (0 0 32 32 four-point star), `spark.svg` (0 0 12 12 tiny round bit), `ripple.svg` (0 0 48 24 a light water/ground ring, ellipse outline).

## 5. Module contracts

### `rng.js` — `PVM.RNG(seed)` → `{ next(): [0,1), range(a,b), int(a,b) inclusive, pick(arr), chance(p), shuffle(arr) }` (mulberry32). Already in place.

### `world.js` — `PVM.CONFIG`, `PVM.DIFFICULTY`, `PVM.LEVELS`, `PVM.ARENA`, `PVM.VOLCANO`, `PVM.CRATER`, `PVM.SPAWN`, `PVM.World` (headless, deterministic, no DOM)
```
const w = new PVM.World({ seed, difficulty: 'easy'|'normal'|'hard', level: 0, config: {} });
w.reset();
w.setTarget(x, y);      // walk towards this ground point (pointer held); stops within CONFIG.arriveR
w.clearTarget();        // pointer released
w.setAxis(ax, ay);      // keyboard: each in -1..1 (normalised internally); (0,0) = no key. Axis wins over target while non-zero.
w.update(dt); w.drainEvents() → [events]; w.getState() → plain object; w.gotoLevel(i);
w.alpha                 // [0,1) leftover of the fixed step, for render interpolation
```
- Fixed sub-step `CONFIG.step = 1/120` with an accumulator. Every moving thing stores `prevX/prevY` (and `prevZ`) at the start of each step.
- `PVM.LEVELS[i % 4] = { season, props: [{ kind:'palm'|'rock'|'bush', x, y }] }` — 3–5 props per season, chosen by the mechanics engineer: all inside ARENA with margin, ≥ 110 px apart and from the volcano circle, none within 110 px of SPAWN, leaving every part of the meadow reachable. Collider circles: palm r 18 at (x, y−8); rock r 28 at (x, y−16); bush r 28 at (x, y−18). The volcano circle is an obstacle too. `w.obstacles = [{ kind, x, y, cx, cy, r }]` (incl. `kind:'volcano'`).
- `phase`: `'intro'` (≈1.2 s: season banner; Tofu may walk, nothing else moves or spawns) → `'playing'` → `'clear'` (≈2.6 s: remaining notes fly to Tofu, crabs doze, celebration; then the next level's `'intro'`) or → `'over'` (last heart lost; Tofu naps). Movement input only in `'intro'`/`'playing'`.
- **State fields** (all also in `getState()`):
  - `t`, `level` (0,1,2,…), `season = level % 4`, `loop = floor(level/4)`, `phase`, `phaseT`, `score`, `hearts`, `maxHearts`, `got` (notes this level), `goal`, `combo` (current chain), `comboT` (s left in the chain window, 0 = no chain), `comboWindow`, `invulnT`.
  - `tofu = { x, y, prevX, prevY, vx, vy, face: 1|-1, state:'idle'|'walk'|'happy'|'hurt'|'sleep', stateT, walk (phase in cycles, grows with distance), r }` — accelerates towards the wanted velocity (`CONFIG.accel`), max speed `DIFFICULTY.speed`, slides along obstacle circles and ARENA edges. `face` follows vx with a dead zone.
  - `crabs[] = { id, x, y, prevX, prevY, vx, vy, state:'enter'|'wander'|'chase'|'dizzy'|'scared', stateT, walk, r }` — enter from the beach edge; mix of chase (seek Tofu, slow, with a little sideways scuttle) and wander; slide around obstacles; keep a little apart from each other; after a pinch the crab is `dizzy` (stops ~1.5 s, pushed back). While Coco helps they are `scared` (move away from Tofu).
  - `notes[] = { id, kind: 0..3, x, y, z, vx, vy, vz, prevX, prevY, prevZ, state:'fly'|'ground', age, life, src:'pop'|'volcano' }` — `'pop'` notes appear on the ground (small hop: vz up); `'volcano'` notes leave CRATER (z ≈ 134 = height of the crater above the volcano's ground point) on a **ballistic arc** (gravity `CONFIG.g`) to a landing point 120–300 px from the volcano inside ARENA and off obstacles, then one small bounce (restitution ~0.35) and rest. Ground notes despawn after `life` (blink in the last 2 s, the renderer reads `life − age`). A note can be caught when its `z < 30` and Tofu's ground point is within `CONFIG.pickR`.
  - `mango = null | { x, y, z, vz, prevX, prevY, prevZ, age, life }` — rare, only when `hearts < maxHearts`.
  - `coco = null | { x, y, z, prevX, prevY, prevZ, vx, vy, face, state:'in'|'help'|'out', t, flap }` — flies in from off-screen at combo 5 (`CONFIG.helperAt`), helps for `CONFIG.helperTime` (≈10 s): swoops (damped spring steering) to the nearest note within ~260 px of Tofu, collects it on contact (`byCoco: true`, counts for score/combo/meter), otherwise circles Tofu at z ≈ 60; then flies out. Only one Coco at a time; reaching combo 5 again while she helps refreshes her timer.
  - `volcano = { rumbleT (s left of the warning wobble, >0 while rumbling), next (s until next rumble), puffT }`.
  - `stats = { notes, volcanoNotes, cocoNotes, pinches, mangoes, levelsCleared, perfectLevels, bestCombo, distance }`.
- **Rules:**
  - Note value: `10 + 2 × min(10, combo)` where `combo` is the chain length *after* this note (first note of a chain = 12). Catching within `comboWindow` of the last catch continues the chain; otherwise it restarts at 1.
  - `got++` per note; `got >= goal` → `'clear'`: `score += 50` (+50 more if no heart lost this level = perfect).
  - Pinch: crab collider touches Tofu's collider and `invulnT <= 0` → `hearts--`, `invulnT = CONFIG.invulnTime` (≈2 s), Tofu `hurt` (~0.8 s, small knock-back away from the crab with friction), crab `dizzy`, the combo chain ends. `hearts == 0` → `'over'`.
  - Spawning: keep `DIFFICULTY.notesOnField` ground notes around (pop-ups at random reachable spots ≥ 120 px from Tofu and ≥ 60 px from crabs/obstacles); the volcano rumbles every `DIFFICULTY.erupt[season]` s (±20 %), `CONFIG.rumbleTime` ≈ 0.9 s of wobble, then erupts 3–5 notes. Never spawn more notes than the level still needs + 4.
  - Difficulty grows per season: more crabs, slightly faster crabs, longer song. `loop > 0` scales crab speed by `min(1.35, 1.1^loop)` and goal by `+2·loop`.
- `PVM.DIFFICULTY = { easy: { hearts: 5, speed, crabSpeed:[…4], crabs:[…4], goal:[…4], erupt:[…4], notesOnField, noteLife, … }, normal: { hearts: 3, … }, hard: { hearts: 3, … } }` — the mechanics engineer picks the numbers. Spring on Easy must be comfortably winnable by a 4–6-year-old (1 slow crab).
- **Events** (objects with `type`): `intro {level, season}`, `go`, `step {x, y}` (a footfall, ~every 0.3 s of walking), `pop {id, kind, x, y}`, `rumble`, `erupt {n}`, `land {id, x, y}`, `note {id, kind, x, y, score, combo, byCoco, idx}` (`idx` = got−1, index in the song), `comboEnd {n}`, `helperIn`, `helperOut`, `crabIn {id}`, `pinch {x, y, hearts}`, `mangoPop {x, y}`, `mango {x, y, hearts}`, `fade {id}` (a note expired), `levelClear {level, bonus, perfect}`, `levelUp {level, season}`, `gameOver {score}`.

### `weather.js` — `PVM.Weather({ width, height, seed })`
- `setLevel(season, { instant })`, `update(dt)`, `burst(kind, x, y, n)` (kind `'sparkle'|'spark'|'confetti'|'stars'`), `smoke(x, y)` (one volcano puff that rises and drifts, grows and fades), `dust(x, y)` (a footstep puff on the ground layer).
- `particles[] = { sprite, x, y, size, rot, flipX, alpha, layer, color? }`; `layer ∈ 'ground'` (drawn on the ground under entities: dust, ripples), `'air'` (over entities: petals, butterflies, leaves, snow, smoke), `'front'` (over everything, sparse: bursts and confetti). `sprite` = particle file name without `.svg`, or `'confetti'` (renderer draws a small rotated rect in `color`).
- Spring: blossom petals tumbling. Summer: sun motes + 2 butterflies (fluttering paths). Autumn: leaves (pendulum/tumble). Winter: snow in 3 depth layers (size/speed/alpha by depth). Steady gentle volcano smoke from CRATER. Weather must stay sparse over the play area.
- Hard cap: 260 particles.

### `bot.js` — `PVM.Bot(world, { skill: 0..1, seed })` → `step(dt)` steers with `world.setTarget()` (and `clearTarget()`): goes for the best note (near, safe from crabs, landing volcano notes included), steers away from crabs within a danger radius (skill 1 avoids well, skill 0 barely), reaction delay 0.05 s (skill 1) … 0.6 s (skill 0). Skill 1 should clear the first year on Normal; the title screen uses skill 0.8.

### Renderer, assets, audio, UI, main (integrator)
- `assets.js` loads SVGs, pre-rasterizes at render scale; custom picture slots: `hero` (Tofu), `note` (replaces all four notes, as a round sticker), `ground` (meadow).
- `render.js`: sea (letterbox, drifting) → ground → ground particles → shadows → y-sorted sprites → Coco → air particles → front particles → juice (rings, "+N", combo pops, shake) → HUD (score, song meter with note dots, hearts, combo badge) → banners.
- Debug view `?debug=1` draws colliders, the arena and the target.

## 6. Test hooks
URL params: `?speed=N&bot=1&skill=0.8&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`.
`window.PVM.debug`: `world, weather, mode, stats, getState(), setSpeed(n), setTarget(x, y), clearTarget(), setAxis(ax, ay), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i)`.
Modes: `title` (bot attract demo) → `playing` ⇄ `paused` → `over`.
