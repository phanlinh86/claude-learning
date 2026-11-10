# Mochi's Fairy Bounce — design spec (the contract)

Namespace: `window.MFB`. Storage prefix `mfb:`. Requirement: `../REQUIREMENT.md`.
Every module below must use these exact names. If you need to deviate, say so in your final reply.

## 1. Lessons from the reference (Breakout / Arkanoid)
| Keep | Change for us |
|---|---|
| One paddle, one ball, a wall of blocks | The paddle is Mochi carrying a bouncy mushroom cap, so it has a face and reacts |
| The hit point on the paddle steers the ball | Max 60° from vertical; the ball never goes near-horizontal (\|vy\| ≥ 0.38·speed) |
| Clear the wall → next level | The levels are the four seasons, each with its own layout and look |
| Ball lost → life lost | Kid-friendly: Easy has a fairy-vine safety net (2 saves per season), you serve again with a tap, auto-serve after 3 s |
| Power-ups fall from blocks | Only stars fall (the item); catch them for points and hearts. Keep it simple |
| Speed creeps up | Gently: +4 % per season, +6 % per round, +1 % per 8 paddle hits (cap +15 % per life) |
| — | Twist: Hoot the owl boss throws a soft pillow every 30 s; a hit makes Mochi sleepy (slow) for 2 s, never costs a heart |

## 2. World, screen and units
- World units **u**, **y points up**, seconds. The ground (Mochi's feet) is at **y = 0**. The field is **x 0…16**, walls at x = 0 and x = 16, ceiling at **y = 8.6**.
- Bricks live in the band **y 4.1 … 7.5**. Hoot floats at **y ≈ 8.0** (between the bricks and the ceiling). The paddle top (the bounce line of the cap) is at **y = 1.35**.
- The ball is lost when its centre falls below **y = −0.3**.
- Screen: the logical canvas is 960×540 (16:9) and wider/taller for other aspect ratios (see render.js `computeView`). Landscape: `unit = min(VH / 9.1, VW / 16.4)`, the field is centred horizontally, `groundPx = VH − 0.4·unit` (world y 0). So 60 px per u at 960×540. Art was drawn for **60 px per u**.
- Portrait phones get a "turn sideways" card (same as earlier games); portrait iPads still play, letterboxed.
- Only `render.js` knows pixels. `world.js` knows nothing about pixels; `weather.js` works in **logical screen px** (it is pure decoration).

## 3. Art style guide
- 100 % original SVG written by generator scripts in `tools/art-characters/` and `tools/art-environment/`. Look at references only for inspiration; never trace.
- Outlines: 3–4 px at the 60 px/u drawing size, colour = a darker shade of the fill (never pure black). Characters `#3a2a4a` (deep plum) for outlines and features.
- One-step shading: a flat base + one darker shadow shape + one small highlight.
- No `<text>`, no fonts, no `<script>`, no `<image>`, no external references, no filters that blur heavily (`feGaussianBlur` with stdDeviation ≤ 4 is allowed for glows). Transparent background unless the file is a sky.
- Palette mood: soft pastel fairy forest. Characters must pop off the backgrounds: backgrounds are lower saturation and lighter in the play area; characters have strong outlines.
- Kid-friendly and cute: big eyes, round shapes, nothing scary.

## 4. Asset table (`game/assets/default/`)
### Characters (character artist)
| File | viewBox | Drawn size (u) | Anchors |
|---|---|---|---|
| `mochi_idle.svg` | 0 0 120 120 | 1.35 × 1.35 | feet line y=116, body centre (60,70). Both arms raised with paws at about (34,14) and (86,14), where the cap's handles are. Head top ≈ y 22 |
| `mochi_left.svg`, `mochi_right.svg` | same | same | leaning / mid-step to the left / right (moving). Same paw positions ±3 px |
| `mochi_cheer.svg` | same | same | happy, eyes closed in a smile (star caught, season clear) |
| `mochi_sleepy.svg` | same | same | drowsy half-closed eyes, a small pillow-dent; paws still up |
| `mochi_oops.svg` | same | same | surprised "o" mouth (ball lost) |
| `cap.svg` | 0 0 240 72 | paddle width W × 0.3·W | the bouncy mushroom-cap paddle (red/pink with cream spots, cream underside). **Bounce line = top surface at y=12**, ends at x=6 and x=234 (rounded). Small stems/handles at bottom x≈68 and x≈172, y 60–72 |
| `ball.svg` | 0 0 64 64 | 0.6 × 0.6 (radius 0.22 u hits) | a glowing fairy-light orb (warm cream core, soft gold glow ring, tiny sparkle). Centre (32,32); solid core radius 23 |
| `star.svg` | 0 0 64 64 | 0.7 × 0.7 | the falling star item (5 rounded points, gold, cute dot eyes). Centre (32,33) |
| `owl_0.svg`, `owl_1.svg` | 0 0 120 100 | 1.5 × 1.25 | Hoot: tiny round sleepy owl (lavender/grey) sitting on a little cloud. Two wing frames (0 = wings down, 1 = wings up). Centre (60,50); hit circle r ≈ 0.55 u. Night cap optional |
| `owl_throw.svg` | same | same | wings forward, tossing pose (a pillow is NOT drawn; it's separate) |
| `owl_giggle.svg` | same | same | bonked: eyes squeezed shut, laughing, feathers ruffled |
| `pillow.svg` | 0 0 64 48 | 0.75 × 0.56 | a soft square pillow (pale pink with a little star pattern), centre (32,24) |
| `heart.svg`, `heart_empty.svg` | 0 0 48 48 | HUD | a full heart and an empty outline heart |
| `icon.svg` | 0 0 256 256 | app icon | round badge: Mochi's face + the cap + the ball, on a purple/pink forest glow. Readable at 32 px |
| `particles/zzz.svg` | 0 0 32 32 | | a little "z" shape drawn with paths (not text) |
| `particles/feather.svg` | 0 0 32 32 | | a soft white feather |
All 6 Mochi frames must share **identical** body placement (the feet line, the body centre and the paws), so swapping frames never jumps.

### Environment (environment artist)
| File | viewBox | Notes |
|---|---|---|
| `levels/<s>/sky.svg` for s in `spring summer autumn winter` | 0 0 960 540 | full sky gradient + soft distant shapes (sun/moon, clouds, aurora in winter). Not tiled; drawn cover-fit |
| `levels/<s>/far.svg` | 0 0 960 300 | far tree line / hills, **horizontally tileable** (x=0 and x=960 edges match), transparent above. Bottom edge is drawn at groundPx − 40 px·k (so it tucks behind the near layer) |
| `levels/<s>/near.svg` | 0 0 960 200 | near forest floor: grass, flowers, mushrooms, roots, tileable. **The walking surface (world y = 0) is at art y = 150**; below it is ground fill to y = 200. Keep the area above y ≈ 100 sparse (tall stuff only at the far left and far right 120 px) so it never hides the ball |
| `bricks/<s>.svg` | 0 0 140 50 | a 1-hit block for season s (spring: blossom bud, summer: berry/mushroom, autumn: acorn/leaf, winter: ice crystal). Drawn 1.4 × 0.5 u. Rounded, fills the box with ≤ 3 px margin |
| `bricks/<s>_tough.svg` | 0 0 140 50 | a 2-hit block for season s: same shape language, sturdier (darker rim, a band/bolt pattern) |
| `bricks/<s>_crack.svg` | 0 0 140 50 | the 2-hit block after its first hit (cracks drawn on it) |
| `bricks/star.svg` | 0 0 140 50 | a star block (any season): a glass/lantern block with a gold star inside. Breaks in 1 hit and drops a star |
| `particles/petal.svg`, `firefly.svg`, `butterfly.svg`, `leaf.svg`, `snow.svg`, `sparkle.svg`, `puff.svg`, `glow.svg` | 0 0 32 32 (glow 64 64) | ambient and juice particles |
| `particles/chip_<s>.svg` | 0 0 24 24 | a small block chip for season s (the debris when a block breaks) |
| `levels/palette.json` | | `{ "<s>": { "skyTop","skyBottom","ink","bar","glow" } }` hex colours per season |
Season keys and names: `spring` Spring Meadow, `summer` Summer Glade, `autumn` Autumn Hollow, `winter` Winter Glow.
Backgrounds must leave the play area calm (low contrast between y = 1 and 8 u) and keep their colours away from the characters' colours: the cap is red/pink, the ball cream/gold, Mochi black and white.

## 5. Module contracts
### `rng.js` — `MFB.RNG(seed)`
`new MFB.RNG(seed)` → `.next()` in [0,1), `.range(a,b)`, `.int(a,b)` (inclusive), `.pick(arr)`, `.chance(p)`. mulberry32 or similar.

### `world.js` — `MFB.World` (headless, deterministic, no DOM, no Math.random)
```
MFB.World.CONFIG   // all tuning numbers, each with a unit + rationale comment; DIFF: { easy, normal, hard } overrides
MFB.World.LAYOUTS  // 4 layouts (one per season), each an array of 5–6 strings of 10 chars: '.' empty, 'b' block, 't' tough, 's' star block
new MFB.World({ seed, difficulty: 'easy'|'normal'|'hard', level: 0 })   // level = seasons already cleared (start index)
```
State fields (read by render / UI / tests):
- `time` (s), `phase`: `'serve'` (ball sits on the cap) | `'play'` | `'clear'` (season cleared, ~2 s celebration, no ball) | `'over'`
- `level` (seasons cleared in total), `zone` = level % 4, `loop` = floor(level / 4)
- `score`, `hearts`, `maxHearts` (5), `starCount` (stars caught), `combo` (blocks since the ball last touched the cap)
- `paddle`: `{ x, px, y, w, vx, target, sleepy, cheer, oops, face }`: x = centre (u), px = previous-step x (for interpolation), y = 1.35 (bounce line), w = width (u), vx (u/s), sleepy/cheer/oops = seconds remaining, `face` ∈ `'idle'|'left'|'right'|'cheer'|'sleepy'|'oops'` (which Mochi frame to draw)
- `ball`: `{ x, y, px, py, vx, vy, r, speed, onPaddle, spin }` or `null` during `'clear'`/`'over'`
- `bricks`: array of `{ id, x, y, w, h, hp, maxHp, kind: 'bud'|'tough'|'star', alive, hitT }`: x,y = centre; hitT = seconds since last hit (for a wobble), starts large
- `stars`: falling stars `{ id, x, y, px, py, vx, vy, rot, spin }`
- `boss`: `{ x, y, px, py, state: 'float'|'throw'|'giggle', stateT, nextThrow (s until the next pillow), hits (this season), flap (0…1 wing phase) }`
- `pillows`: `{ id, x, y, px, py, vx, vy, rot, spin, landX }` (landX = predicted ground x, for the shadow)
- `net`: `{ saves }` saves left this season (0 = no vine drawn)
- `alpha`: leftover fraction of a fixed step, for render interpolation
- `stats`: `{ bricks, stars, starsMissed, bossHits, tickles, pillowHits, pillowsPopped, lost, serves, paddleHits, netSaves, maxCombo, seasonTimes: [] }`

Methods:
- `reset()`; `update(dt)`: fixed sub-steps of **1/120 s**, keeps `px/py` from the previous sub-step and sets `alpha`
- `setPaddleTarget(x)`: absolute target x (u) from the pointer; the paddle eases to it with a max speed (`CONFIG.PADDLE_SPEED`, × `SLEEPY_SPEED_K` while sleepy)
- `movePaddle(dir)`: −1 / 0 / +1 from keys (held), at the max speed; calling it clears the pointer target
- `serve()`: launch from the cap during `'serve'` (no-op otherwise); returns true if served. The ball also auto-serves after `CONFIG.AUTO_SERVE` s
- `drainEvents()` → array of events (and clears it)
- `getState()` → plain JSON summary for tests (phase, level, zone, loop, score, hearts, starCount, bricksLeft, ball {x,y,vx,vy,speed} | null, paddle {x,w}, boss {x,state,nextThrow,hits}, pillows n, stars n, time)
- `gotoLevel(i)`: test hook, jump to season index i (emits `levelUp`)
- `bricksLeft()` → number of alive bricks
- `debugClear(leave = 1)`: test hook, kill all but `leave` bricks (no score)
- `debugThrow()`: test hook, Hoot throws a pillow now

Events (`{ type, ... }`), positions in u:
`serve {x}` · `paddle {x, y, off}` (off = −1…1 hit offset) · `wall {x, y, side: 'left'|'right'|'top'}` · `brick {id, x, y, kind, broken, hp, pts, combo, zone}` · `starSpawn {id, x, y}` · `starCatch {x, y, pts, count}` · `starMiss {x}` · `bossThrow {x, y}` · `bossHit {x, y, pts, hits}` · `bossTickled {x, y, pts}` · `pillowHit {x}` · `pillowPop {x, y, pts}` · `pillowLand {x}` · `net {x, savesLeft}` · `ballLost {x}` · `heartLost {hearts}` · `heartGain {hearts, why: 'stars'|'season'}` · `combo {n}` (at 3, 5, 8…) · `levelClear {zone, pts, time}` · `levelUp {level, zone, loop}` · `gameOver {score}`

Rules (details are the mechanics engineer's call, documented in `docs/MECHANICS.md`):
- Ball–cap: hit offset `off = (ball.x − paddle.x) / (w/2 + r)` clamped to −1…1 → angle from vertical = `off · 60°` (plus a small paddle-velocity nudge, clamped). Only bounces while moving down and its bottom crosses the bounce line within the cap's width (+ r).
- Ball–brick: circle vs. rounded box with swept sub-steps; reflect on the axis of least penetration; at most one brick reflection per sub-step (but it may break several on a corner, no tunnelling at any speed ≤ 16 u/s).
- Walls left/right/top reflect; enforce |vy| ≥ 0.38·speed after every bounce.
- Anti-stall: if no brick is hit for 12 s, the next cap bounce aims a little toward the nearest remaining brick.
- Stars fall at ~2.4 u/s with a gentle sway, caught when they touch the cap or Mochi (box x ±(w/2 + 0.25), y 0…1.7).
- Pillows: thrown from Hoot with a small sideways velocity aimed near Mochi (never perfectly), gravity ~3 u/s² to a terminal ~3.2 u/s, sway + tumble; hitting Mochi/cap → `sleepy = SLEEPY_TIME`. The ball pops a pillow it touches (+10, and the ball keeps going).
- Hoot drifts left–right (a slow sine plus noise) in the band x 2…14 at y 8.0 ± 0.15; he's a circle of r 0.55 for ball hits (the ball bounces off him).
- First season on Easy must be easy for a 6-year-old (wide cap 3.0 u, slow ball 6.2 u/s, vine saves).

### `weather.js` — `MFB.Weather` (ambient decoration in logical screen px)
```
new MFB.Weather({ width, height, seed })
.setLevel(zone, { instant })    // crossfades the particle mix: spring petals+sparkles, summer fireflies+butterflies, autumn tumbling leaves, winter snow (3 depth layers)
.resize(width, height); .setGround(groundPx)
.update(dt)
.particles   // [{ sprite: 'p_petal'|'p_firefly'|'p_butterfly'|'p_leaf'|'p_snow'|'p_sparkle', x, y, size, rot, flipX, alpha, layer: 'back'|'front' }]
```
Bounded: ≤ 90 particles at any time. Physically believable: petals flutter (sideways sine + slow fall), leaves tumble like a pendulum, snow in depth layers (far = small/slow/faint, near = bigger/faster), fireflies wander with a soft blink, butterflies flap (flipX toggles their wings via size squash is fine).

### `bot.js` — `MFB.Bot` (autopilot for tests and the title demo)
`new MFB.Bot(world, { skill: 0…1, seed })` → `.step(dt)`: predicts where the ball will reach the bounce line (bouncing off the walls), picks an offset to aim at the remaining bricks, catches stars and dodges pillows when it's safe, serves after a short random delay. `skill` 1 almost never misses; 0.3 is like a 5-year-old (late, jittery). Uses only `world.setPaddleTarget()` / `world.serve()`.

### `render.js` (integrator) draws: sky → far (parallax 0.1 with the paddle) → near → bricks → stars → Hoot → pillows (+ ground shadows) → the ball trail and ball → Mochi + cap → weather front → juice (popups, rings, chips, feathers, sparks, screen shake) → HUD (score, hearts, stars, season name) → banner.

## 6. Test hooks
URL params: `?speed=N&bot=1&skill=0.8&autostart=1&autorestart=1&seed=N&mute=1&debug=1&diff=easy|normal|hard&level=N`.
`window.MFB.debug`: `world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), serve(), setPaddle(x), clearBricks(leave), bossThrow()`.
Game modes: `'title'` (bot demo) → `'playing'` ⇄ `'paused'` → `'over'`.
