# Pip's Candy Dash — Design Spec (contract between modules)

Requirement: `../REQUIREMENT.md`. Namespace: **`window.CD`**. Classic scripts, no build step.
Sister games to reuse (same stack, proven code): `projects/daily-game/foxy-reef-memory` (newest: storage, assets, audio, renderer helpers incl. pixel-exact layers + interpolation + idle pre-warm, ui, main, Go wrapper, tests) and `projects/daily-game/flappy`.

## 1. Lessons from top-down collectors (keep / change)
| Classic (Pac-Man-like / snake / agar.io) | Pip's Candy Dash |
|---|---|
| Collect items while avoiding chasers | Same, but chasers are slow, cute and readable; never faster than Pip |
| Snake/agar: growth = bigger target | Pip grows 1→5 with each gem; bigger = more points but harder to dodge; **Pop!** at max size resets size for a bonus + stuns bears (risk/reward loop) |
| Instant death on touch | 3 hearts (Easy 5), bump = −1 heart, shrink one size, drop 2 gems (re-collectable), 1.5 s blinking invulnerability |
| Grid movement | Smooth analog movement with momentum (keys or pointer-follow) + belly-slide dash |
| Static maze | Open arena per biome with one gentle terrain flavour (slow chocolate river, floaty clouds, slippery glacier) |
| Score only | Gem jar fills → candy-cane gate opens → walk through = next biome (clear goal every ~60–90 s) |

## 2. Screen & coordinates
- Logical **960 × 540**, letter-boxed; y down; px; seconds.
- **HUD band**: y 0–64 (hearts top-left, score top-centre, gem jar top-right under the HUD buttons) — nothing gameplay-relevant drawn there.
- **Arena (walkable)**: x 40–920, y 84–516 (`CONFIG.arena = {x:40,y:84,w:880,h:432}`). Ground art covers the whole screen; its decorative border ring sits outside the arena.
- **Gate**: centre (900, 300) on the right edge; Pip walks into it when open.
- Entities are drawn with **feet anchor** = (x, y) (y = ground contact); sort by y for depth (bigger y in front). Shadows are ellipses under the feet.
- Pip size level s ∈ {1..5}: visual scale = 1 + 0.15·(s−1) (1.0 → 1.6), collision radius = 16 × scale.

## 3. Art style guide (ALL art agents)
Same as the sister games: original hand-written SVG (web search = inspiration only; never copy/trace; no known characters/brands — e.g. no trademarked gummy bear designs; make an ORIGINAL cute jelly bear), flat cartoon, rounded, big eyes, one-step cel shading + highlight, outline ≈3 px in a dark tone of the fill, saturated pastel candy palette, kid-friendly (bears are grumpy-cute, never scary). No `<text>`/fonts/scripts/external refs; width/height = viewBox; transparent unless stated. **View**: friendly ¾ top-down (like classic action-adventure games): characters seen slightly from above, facing RIGHT (renderer mirrors for left).

## 4. Assets (paths relative to `game/assets/default/`)
### 4.1 Characters & items (character artist)
| File | viewBox | Drawn (size 1) | Notes |
|---|---|---|---|
| `pip_idle.svg`, `pip_walk1.svg`, `pip_walk2.svg` | 0 0 96 96 | 60 × 60, feet anchor at (48, 90) | Cute round penguin, facing right ¾ view, small orange beak/feet, rosy cheeks, maybe a tiny scarf. Walk = waddle (feet + slight lean). Body geometry identical across frames. |
| `pip_slide.svg` | 0 0 96 96 | same | belly-slide pose (horizontal, flippers back, happy) |
| `pip_hurt.svg` | same | same | bonked "oof" (dizzy swirl eyes, NOT crying) |
| `pip_cheer.svg` | same | same | flippers up, sparkly eyes (gem jar full / Pop!) |
| `bear_<red|green|orange>_1.svg`, `_2.svg` | 0 0 80 80 | 52 × 52, feet anchor (40, 76) | ORIGINAL cute translucent jelly bear (glossy jelly with highlight, slight transparency look via lighter inner shape), grumpy-cute brows; 1/2 = waddle frames. Three colour variants = three behaviours. |
| `bear_<colour>_stun.svg` | same | same | dizzy, stars/sugar swirl over head |
| `gem_pink.svg`, `gem_blue.svg`, `gem_yellow.svg`, `gem_green.svg` | 0 0 48 48 | 30 × 30 centre | faceted candy gem with glossy highlight + tiny sparkle; distinct shapes per colour too (heart-cut, round, star, square) |
| `heart_full.svg`, `heart_empty.svg` | 0 0 48 48 | 28 × 28 | HUD |
| `jar.svg` | 0 0 64 80 | 44 × 55 | empty glass candy jar with lid; fill level is drawn by code inside the inner rect (x 10–54, y 22–72) |
| `gate_closed.svg`, `gate_open.svg` | 0 0 120 160 | 90 × 120, bottom-centre anchor | candy-cane arch gate (closed = swirl-lollipop barrier) |
| `icon.svg` | 0 0 256 256 | app icon | Pip + a gem on a round pink badge, readable at 32 px |

### 4.2 Biomes (environment artist) — `biomes/<meadow|river|clouds|glacier>/`
| File | viewBox | Use |
|---|---|---|
| `ground.svg` | 0 0 960 540 | opaque top-down ground for the whole screen. Calm, low-contrast play area (arena x 40–920, y 84–516) with subtle texture; decorative **border ring** outside the arena (bushes, lollipop trees, wafer fences…). Top band y 0–64 is behind the HUD: keep it simple. |
| `edge.svg` | 0 0 960 540 | transparent foreground border decorations drawn OVER entities near the edges (e.g. tops of bushes along the bottom edge) for depth; must stay outside the arena by ≥ 8 px except tiny overlaps |
| `zone.svg` (river/clouds/glacier only) | 0 0 960 540 | transparent overlay showing the terrain-flavour zone (see §5.1 `zones`): river = a horizontal chocolate stream band y 270–350 with wafer-bridge gaps at x 300–360 and x 640–700; clouds = 3 soft trampoline-puff circles; glacier = large slippery ice patches. Keep shapes matching the rects/circles listed in `world.js` CONFIG (mechanics agent documents them; environment artist uses: river band y 270–350; clouds puffs at (300,200,r70),(640,380,r80),(760,170,r60); glacier ice rects (160,140,260,140),(560,320,280,150)). |
Looks: **meadow** mint grass + gumdrop bushes + lollipop trees; **river** cocoa riverbank, wafer bridges, marshmallow stones; **clouds** pastel pink/blue fluff ground, rainbow arc in a corner, candy-floss; **glacier** vanilla/strawberry/mint ice-cream ground, wafer igloo, sprinkles. Characters must pop on every ground: avoid big areas of the bear colours (red/green/orange) and gem colours in the play area.

### 4.3 Particles — `particles/` (viewBox 0 0 32 32, centred)
`sparkle.svg`, `sugar.svg` (sugar crystal glint), `floss.svg` (candy-floss puff), `sprinkle.svg` (one capsule sprinkle, white — renderer tints via `'dot'`/colour? no: draw 3 colour files) → `sprinkle_pink.svg`, `sprinkle_blue.svg`, `sprinkle_yellow.svg`, `ripple.svg` (chocolate ring), `snowflake.svg` (sugar snowflake), `star.svg` (stun star).

## 5. Code architecture (`game/js/`)
`rng.js` `world.js` `weather.js` `bot.js` **[mechanics]** · `storage.js` `assets.js` `audio.js` `render.js` `ui.js` `main.js` **[integration]**

### 5.1 `CD.World` (headless, deterministic for seed + inputs)
```js
const w = new CD.World({ seed, config });   // config overrides CD.CONFIG; CD.DIFFICULTY = { easy, normal, hard } presets
w.reset();                  // level 0 (meadow), score 0, full hearts, state 'ready'
w.startLevel(i);            // biome = i % 4, lap = floor(i / 4)
w.setMove(mx, my);          // analog keyboard input, each −1..1 (call every frame; (0,0) = none)
w.setTarget(x, y);          // pointer-follow target in logical coords, or w.setTarget(null)
w.action();                 // dash, or Pop! when size === sizeMax
w.update(dt);  w.drainEvents();
// state
w.state        // 'ready' (intro ~1.4 s, banner) | 'playing' | 'cleared' (gate walk-out, ~2 s) | 'dead'
w.level, w.biome /*0..3*/, w.lap, w.time, w.levelTime
w.score, w.hearts, w.heartsMax, w.size /*1..5*/, w.sizeMax, w.jar, w.jarTarget, w.gemsTotal, w.pops, w.bumps
w.arena {x,y,w,h};  w.zones [{type:'slow'|'bouncy'|'ice', shape:'rect'|'circle', x,y,w,h | x,y,r}]
w.gate  { x, y, open, t /*0..1 open anim*/ }
w.pip   { x, y, vx, vy, facing /*±1*/, frame /*'idle'|'walk1'|'walk2'|'slide'|'hurt'|'cheer'*/, scale /*smoothed visual*/, radius, invuln /*s left*/, dashCd, sliding /*bool*/, squash }
w.bears [{ id, kind /*'red'|'green'|'orange'*/, x, y, vx, vy, facing, frame /*'1'|'2'|'stun'*/, stun /*s*/, radius, spawnT /*0..1 fade-in*/ }]
w.gems  [{ id, color /*'pink'|'blue'|'yellow'|'green'*/, x, y, vx, vy, appear /*0..1 sparkle telegraph → collectable at 1*/, loose /*dropped after a bump*/, life }]
w.cfg; w._acc;  // and `_px,_py` on pip, bears, gems saved at the start of each fixed step (render interpolation)
```
Events: `start`, `biome {biome, level}` (every level start incl. 0), `gem {x,y,points,size,color}`, `grow {size}`, `maxsize`, `pop {x,y,stunned,points}`, `dash {x,y}`, `bump {x,y,hearts}`, `shrink {size}`, `drop {x,y,n}`, `jarfull`, `gateopen {x,y}`, `cleared {bonus,level}`, `dead {score}`.

Rules/feel:
- Movement: acceleration toward input direction × maxSpeed(size) with friction; facing by vx with hysteresis. maxSpeed falls a little with size (e.g. 210 → 165 px/s) and turn rate drops (heavier). Pointer-follow: arrive behaviour, stop within ~6 px. Arena walls clamp softly.
- Dash: 0.25 s burst (~2.2× speed) in move direction (or facing), 1.2 s cooldown, frame 'slide'; during dash Pip still collides with bears (no free invulnerability) but bumps bears back slightly? — designer's call, document.
- Gems: keep 3–5 on the arena (more on later levels), spawn with 0.6 s telegraph away from Pip/bears and not in the HUD band; small bob. Points = 10 × size. Each gem `grow` until sizeMax 5; at max size, gems still count (×5) and Pip sparkles (`maxsize`).
- **Pop!** (action at max size): size → 1, +50 + 10 per bear within 160 px (they get `stun` 2.5 s), burst event.
- Bears: red = wanderer (random walk, gentle), green = follower (seeks Pip with lag), orange = guard (orbits the nearest gem). Speeds ≤ 0.75 × Pip's current max speed. Spawn with fade-in at edges away from Pip. Count by level (e.g. 2,3,3,4; lap +1). Stunned bears don't hurt.
- Bump: hearts −1, size −1 (min 1), 2 gems drop as `loose` (scatter with velocity, re-collectable, vanish after 6 s), knock-back, `invuln` 1.5 s. hearts 0 → 'dead'.
- Zones (biome flavour): river = `slow` band (×0.55 speed for everyone); clouds = `bouncy` puffs (entering gives a gentle springy pushback / float); glacier = `ice` patches (friction ×0.25, keeps momentum). Meadow: none.
- Jar full → `jarfull`, gate opens (`gateopen`), gems stop spawning, bears slow; Pip touching the open gate → 'cleared' (bonus hearts × 100) → next level after ~2 s.
- First level on Normal must be very winnable for a 6-year-old.

### 5.2 `CD.Weather` — same contract as the sister games: `new CD.Weather({width,height,seed})`, `setSeason(biome,{instant})` (alias `setBiome`), `update(dt,{})`, `particles[] {sprite,x,y,size,rot,flipX,alpha,layer:'back'|'front',color?}`, `ambient {tint,fog}`. Sprites from §4.3 (names without `.svg`) + `'dot'`. Meadow: drifting sugar sparkles + a few floss puffs; river: chocolate ripples (placed on the river band, back layer) + sparkles; clouds: floss puffs drifting + rainbow sparkles; glacier: sprinkles snowing (3 colours, tumbling) + sugar snowflakes.

### 5.3 `CD.Bot` — `new CD.Bot(world, {skill, seed})`, `bot.step(dt)` drives `setMove`/`setTarget`/`action`: picks the best reachable gem weighing distance vs bear danger, steers around bears, dashes to escape, Pops at max size when ≥1 bear is close; skill < 1 adds reaction delay and noise. `bot.stats`.

### 5.4 Test hooks
URL `?speed=N&bot=1&autostart=1&autorestart=1&seed=N&mute=1&debug=1&level=N`; `window.CD.debug` → `{ world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i) }`.

## 6. Customisation slots
`hero` (Pip, all frames), `gem` (all colours use the picture), `bear` (all bears; kind shown by a coloured ring), `bg_meadow|bg_river|bg_clouds|bg_glacier` (replaces `ground.svg`; zones still drawn on top). Same storage/processing rules as the sister games.

## 7. Performance rules (from day one)
Pixel-exact full-screen layer blits, render interpolation, pre-warm next biome in idle time, backing store capped at 1920×1080 + adaptive quality (smoothed frame time > 20 ms for 1.5 s) + debounced resize, cached gradients/panels, y-sorted entity drawing without per-frame allocations where easy.
