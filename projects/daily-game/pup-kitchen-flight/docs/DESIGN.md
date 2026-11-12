# Biscuit's Kitchen Flight — design spec (the contract)

Every module and every agent works against this file. Names here are exact.
Namespace: `window.BKF`. Storage prefix `bkf:`. Requirement: `../REQUIREMENT.md`.

## 1. Lessons from the reference (Flappy Bird and our own `projects/daily-game/flappy/`)
| Keep | Change |
|---|---|
| One input; the hero stays at a fixed x, the world scrolls left | No pipes: hanging utensils (top), pot stacks (bottom), kettles with steam |
| Impulse sets vy; gravity arc; nose tilts with velocity | 3 batteries instead of instant death; 1.5 s safe blink after a bump |
| "Get Ready" hover with a bob until the first tap | Gaps are wide on Easy (≥ 230 px) and the first 3 s have no obstacles |
| Big score, medal on game over | Leaves to collect (+1), obstacles passed (+1) |
| Ground kills | The counter bounces Biscuit up and costs a battery; the ceiling only clamps |

Fantasy: **it must feel like a happy little helicopter pup bobbing through Grandma's kitchen.**

## 2. Screen and coordinates
- Logical stage **960×540 px**, y down, units px and seconds. The renderer fits it with *contain* and fills the letterbox by drawing the background layers wider (layers are tileable), so obstacles can be seen entering from the right on wide phones.
- All entity `x` values are **screen-space x inside the 960 frame**. The world scrolls left at `world.scrollSpeed` px/s; `world.scroll` is total distance (for parallax).
- `COUNTER_Y = 470`: the top of the counter. `RAIL_Y = 40`: the hanging rail the utensils hang from. Ceiling clamp at y = 24.
- Biscuit's fixed x: `PUP_X = 260`.
- Spawn x for obstacles and leaves: `SPAWN_X = 1240` (offscreen even on 2.2:1 screens); despawn when x < −200.

## 3. Art style guide
- 100 % original SVG written by our generator scripts in `tools/art-characters/` and `tools/art-environment/`. Web references are for inspiration only; never trace.
- Outline: 4 px at drawn size (scale the stroke with the viewBox), colour = a darker shade of the fill (never pure black). Round joins and caps.
- One-step shading: a flat base + one darker shadow shape + one small highlight.
- No `<text>`, fonts, `<script>`, `<image>`, filters that blur heavily, or external refs. Transparent backgrounds (except `outside_*.svg`, which is opaque).
- Palette mood: warm cream, butter yellow, tomato red, sage green, copper. Biscuit is **teal + cream with a red propeller** so he pops against all four lightings. Leaves are **saturated greens with a pale vein** and a soft halo shape. Obstacles are copper/steel/ceramic, mid-value, so they read clearly against the wall but differ from Biscuit.

## 4. Asset table (`game/assets/default/`)
Sizes are the size the renderer draws at (1 viewBox unit = 1 px unless noted). Anchors are in viewBox units.

### Characters (character artist)
| File | viewBox | Drawn | Anchors / hit |
|---|---|---|---|
| `pup_0.svg`, `pup_1.svg`, `pup_2.svg` | 0 0 120 110 | 120×110 | Body centre (60,64) = world `pup.x,pup.y`. Identical body in all three; only the propeller differs (3 spin frames: blades wide, ¾, edge-on blur). Propeller hub at (60,14). Hit circle r = 28 around the body centre. Faces right. |
| `pup_hurt.svg` | same | same | Same body; swirly dizzy eyes, little "bonk" star NOT drawn (the renderer adds sparks). Propeller as frame 1. |
| `pup_sleep.svg` | same | same | Powered down: eyes closed, ears droopy, propeller still. |
| `leaf_mint.svg`, `leaf_basil.svg`, `leaf_bay.svg` | 0 0 64 64 | 44×44 | Centre (32,32). Hit circle r = 22. Each a different shape (mint: round serrated, basil: wide cupped, bay: long oval). |
| `hang_ladle.svg`, `hang_whisk.svg`, `hang_pan.svg` | 0 0 120 200 | 120×200 | Attach (hook) point (60,6) at the top. Head centre (60,150), head hit circle r = 42. Handle hit = segment (60,6)→(60,150) with r = 8. The world rotates the sprite around the attach point. |
| `stack_pot.svg` | 0 0 150 90 | 150×90 | Bottom-centre (75,90) sits on what is below. Hit rect inset 8 px left/right, 6 px top. |
| `stack_mug.svg` | 0 0 110 90 | 110×90 | same rule |
| `stack_jar.svg` | 0 0 100 120 | 100×120 | same rule |
| `stack_bowl.svg` | 0 0 150 70 | 150×70 | same rule |
| `kettle.svg` | 0 0 140 120 | 140×120 | Bottom-centre (70,120) on the counter; spout tip (128,40) — steam rises from x = kettle.x and y = COUNTER_Y − 120. Hit rect inset 12 px. |
| `battery_full.svg`, `battery_empty.svg` | 0 0 64 40 | 48×30 | HUD icon. |
| `icon.svg` | 0 0 256 256 | — | Biscuit's head on a round butter-yellow badge. |

### Environment (environment artist)
Layers, back to front. Each is **horizontally tileable** (left edge = right edge) and drawn pixel-exact.
| File | viewBox | Parallax | Notes |
|---|---|---|---|
| `levels/<zone>/outside.svg` | 0 0 960 540 | 0.08 | Opaque. What you see through the windows: sky, garden hedge, a tree, a fence, distant houses. One per zone. |
| `room/wall.svg` | 0 0 1200 540 | 0.35 | Shared by all zones. Warm wallpaper with **two big transparent window openings** per tile (frames, sills with pots of herbs), open shelves with jars, a clock, a fridge edge. The top rail (copper bar) runs the full width at y 34–46 (RAIL_Y = 40). Keep y 110–440 calm (no strong detail at the band Biscuit flies through, except window frames). |
| `room/counter.svg` | 0 0 600 70 | 1.0 | Drawn at y 470–540. Wooden counter top with a 10 px lip, drawers and knobs below. |
| `room/curtain.svg` | 0 0 120 300 | wall | A curtain panel hung at each window edge; the renderer sways it (rotate around top-centre (60,0)) during wind. |
| `room/frost.svg` | 0 0 300 220 | wall | Frosted corner pattern for the snowy zone, drawn on window corners. |

Zone keys: `0 sunny`, `1 rainy`, `2 windy`, `3 snowy`. `levels/palette.json` = `{ "sunny": {"tint":"#…","tintAlpha":0.0,…}, … }` with the lighting tint for each zone (the renderer multiplies a coloured overlay over the room: morning warm, rain cool grey, sunset orange, night deep blue).

### Particles (environment artist), `particles/`
`dust.svg` (0 0 16 16, soft glow dot), `raindrop.svg` (0 0 10 30 streak), `snowflake.svg` (0 0 24 24), `steam.svg` (0 0 64 64 soft puff), `wind.svg` (0 0 120 16 curved streak), `sparkle.svg` (0 0 32 32 four-point star), `bit.svg` (0 0 16 16 tiny leaf bit), `outside_leaf.svg` (0 0 20 20 blown autumn leaf).

## 5. Module contracts

### `rng.js` — `BKF.RNG(seed)` → `{ next(): [0,1), range(a,b), int(a,b) inclusive, pick(arr), chance(p) }` (mulberry32).

### `world.js` — `BKF.CONFIG`, `BKF.DIFFICULTY`, `BKF.World` (headless, deterministic, no DOM)
```
const w = new BKF.World({ seed, difficulty: 'easy'|'normal'|'hard', level: 0, config: {} });
w.reset(); w.flap(); w.update(dt); w.drainEvents() → [events]; w.getState() → plain object; w.gotoLevel(i);
w.hangHead(o) → {x,y}; w.hitShapes() → [{kind:'circle',x,y,r}|{kind:'rect',x,y,w,h}|{kind:'seg',x1,y1,x2,y2,r}] (for debug view)
```
- Fixed sub-step `CONFIG.step = 1/120`, accumulator; `w.alpha` = leftover/step in [0,1) for render interpolation. Every moving thing stores `prevX/prevY` (and `prevRot`/`prevAng`) at the start of each step.
- `phase`: `'ready'` (hover bob, no scroll of obstacles, background scrolls slowly) → `'playing'` (first `flap()`) → `'down'` (0 batteries: propeller stops, Biscuit floats down to the counter over ~1.2 s) → `'over'`.
- State fields:
  - `t` (s since playing), `scroll` (px), `scrollSpeed` (px/s), `level` (0,1,2,… counting loops), `zone = level % 4`, `loop = floor(level/4)`, `levelT` (s in level), `levelLen` (s).
  - `dayT` in [0,1): `(zone + levelT/levelLen)/4`. `darkness` in [0, 0.62]: smooth curve from dayT (≈0 morning, 0.08 rain, 0.25 sunset, 0.62 night). `lamp` = { x, y, r } nose-lamp circle ahead of Biscuit (r = CONFIG.lampRadius, larger on Easy).
  - `pup = { x, y, vy, prevY, rot, prevRot, prop, squash, hurtT, state: 'fly'|'hurt'|'sleep' }`. `prop` = propeller phase (continuous, frames = floor(prop*3) % 3); spins faster for 0.3 s after a flap. `rot` eased: nose-up after a flap, nose-down when falling (max ±0.45 rad; kid-friendly, never a nose-dive).
  - `batteries`, `maxBatteries` (3), `score`, `leafCount`, `passed`, `levelBumps`.
  - `wind = { gy, target, warnT, dir }` (zone 2 only; gy px/s² applied to the pup, half to leaves).
  - `obstacles[]`: `{ id, kind:'hang'|'stack'|'kettle', x, prevX, passed }` plus
    - hang: `sprite:'ladle'|'whisk'|'pan', len` (chain px from RAIL_Y to the attach point), `ang, prevAng, angVel` (pendulum, small amplitude ≤ 0.25 rad, nudged by wind).
    - stack: `pieces:[{ sprite:'pot'|'mug'|'jar'|'bowl', w, h, y }]` (y = bottom of the piece; pieces centred on x; the lowest piece's y = COUNTER_Y; small x offsets `dx` allowed).
    - kettle: `steamH` (column height px), `puffT` (renderer emits steam when it ticks).
  - `leaves[]`: `{ id, sprite:'mint'|'basil'|'bay', x, y, prevX, prevY, rot, prevRot, phase }` (bob and slow spin; drift with wind).
  - `stats = { flaps, leaves, bumps, passed, steam, cleanLevels, bestRun }`.
- Generation: "beats" every `CONFIG.beatGap` px of scroll. A beat is a top hanger, a bottom stack, a gate (hanger + stack with a gap ≥ `gapMin`), or (zones ≥1) a kettle. Leaves come in small arcs/lines (3–5) placed on the safe path through the gaps. First 3 s of play are empty.
- Events (objects with `type`): `start`, `flap`, `leaf {x,y,sprite,score}`, `pass {x}`, `bump {x,y,what}`, `counter {x,y}` (bump on the counter), `battery {n}` (gained), `lowBattery`, `steam {x}` (entered a steam column), `gustWarn {dir}`, `gust {dir}`, `gustEnd`, `levelUp {level, zone, clean}`, `down`, `gameOver {score}`.

### `weather.js` — `BKF.Weather({ width, height, seed })`
- `setLevel(zone, { instant })`, `update(dt, scrollSpeed)`, `gust(dir)` / `calm()`, `steam(x, y)`, `burst(kind, x, y, n)` (kind `'sparkle'|'bit'|'dust'`).
- `particles[]` = `{ sprite, x, y, size, rot, flipX, alpha, layer }`; `layer` ∈ `'outside'` (drawn behind the wall: visible only through the windows), `'room'` (in front of the wall, behind obstacles), `'front'` (in front of everything, sparse). `sprite` = a particle file name without `.svg`.
- Sunny: dust motes drifting in sunbeams (room). Rainy: rain streaks (outside) at a slant. Windy: blown leaves (outside) + wind streaks (room, only during gusts). Snowy: snow in 3 depth layers (outside: size/speed/alpha by depth). Steam puffs rise, grow and fade (room). Room particles drift left with scroll × their parallax.
- Hard cap: 260 particles.

### `bot.js` — `BKF.Bot(world, { skill: 0..1, seed })` → `step(dt)` calls `world.flap()`; picks a target y on the safe path (gaps and leaves), with reaction delay and noise that grow as skill drops. Skill 1 should survive 10 minutes on Normal; the title screen uses skill 0.85.

### Renderer, assets, audio, UI, main (integrator)
- `assets.js` loads SVGs, pre-rasterizes at render scale, handles custom pictures (slots: `pup`, `leaf`, `wall`).
- `render.js`: outside → outside particles → wall (windows transparent) → curtains/frost → room particles → rail → hangers (chain + sprite) → stacks/kettles/steam → leaves → Biscuit → counter → darkness overlay with lamp hole and soft glows (leaves, lamp) → lighting tint → front particles → juice (sparkles, "+1", rings, shake) → HUD (batteries, score, level progress) → banner.
- Debug view `?debug=1` draws `w.hitShapes()`.

## 6. Test hooks
URL params: `?speed=N&bot=1&skill=0.8&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N&diff=easy|normal|hard`.
`window.BKF.debug`: `world, weather, mode, stats, getState(), setSpeed(n), flap(), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i)`.
Modes: `title` (bot attract demo) → `ready` → `playing` ⇄ `paused` → `over`.
