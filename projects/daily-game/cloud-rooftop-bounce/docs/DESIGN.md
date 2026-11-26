# Wisp's Rooftop Bounce — design spec (the contract)

Namespace: `window.WRB`. Storage prefix `wrb:`. Requirement: `../REQUIREMENT.md`. Exe port 48713 (fallbacks 48723/48733/48743), bridge `wrStoreAll/wrStoreSet/wrStoreDel/wrFullscreen/wrQuit`.
The project was forked from `../panda-fairy-bounce/` (same genre, 2026-11-10). Reuse its proven code, but the hero, twist, art, levels and feel are new. **Hoot the owl, pillows, sleepy and stars are removed** — gems and the magnet replace them.
Every module below must use these exact names. If you need to deviate, say so in your final reply.

## 1. Lessons from the reference (Breakout / Arkanoid) and from Mochi's Fairy Bounce
| Keep | Change for us |
|---|---|
| One paddle, one ball, a wall of blocks | The paddle IS Wisp: a soft cloud sprite with a face whose fluffy top is the bounce surface. It squashes on every hit |
| Hit point steers the ball | Max 60° from vertical; \|vy\| ≥ 0.38·speed after every bounce |
| Clear the wall → next level | Levels are 4 depth zones, Wisp floats DOWN from the cloud deck to street level (a 2.5 s "descend" transition: the scene scrolls up) |
| Ball lost → heart lost | Easy: moonbeam net saves the pearl 8× per zone (1× Normal, 0× Hard); tap to serve, auto-serve after 3 s |
| Arkanoid "catch" power-up | Our twist: **magnet** — gems are pulled to Wisp AND the pearl sticks to Wisp so you can aim, then release |
| Speed creeps up | +4 % per zone, +6 % per round, +1 % per 8 paddle hits (cap +15 % per life) |
| Mochi's lesson: anti-stall | Keep it (after 5 s without a brick hit the next Wisp bounce aims toward the nearest brick, 50 %→100 %) |

## 2. World, screen and units (same geometry as Mochi's Fairy Bounce)
- World units **u**, **y up**, seconds. Rooftop/ground line **y = 0**. Field **x 0…16**, walls at 0 and 16, ceiling **y = 8.6**.
- Bricks live in the band **y 4.3 … 8.0** (no boss any more, so the wall goes higher). 10 columns × 1.4 u wide, 0.5 u tall, centres x = 1.0 + 1.55·c (c = 0…9)… (mechanics engineer may adjust; document it).
- Wisp's bounce line (cloud top) is at **y = 1.35**. Wisp floats: render may add a ±0.04 u bob; physics ignores the bob.
- The ball is lost below **y = −0.3**.
- Screen: logical canvas 960×540 (16:9), wider/taller for other aspects (render.js `computeView`, unchanged from the fork). Landscape `unit = min(VH/9.1, VW/16.4)`; **art drawn for 60 px per u**. Portrait phones get the "turn sideways" card; portrait iPads play letterboxed.
- Only `render.js` knows pixels; `weather.js` works in logical screen px (decoration only).

## 3. Art style guide
- 100 % original SVG from generator scripts in `tools/art-characters/gen.js` and `tools/art-environment/gen.js`. References for inspiration only.
- Outlines 3–4 px at 60 px/u, colour = a darker shade of the fill (never pure black). Character ink `#2c2f5a` (deep night indigo).
- One-step shading: flat base + one shadow shape + one small highlight. Glows: `feGaussianBlur` stdDeviation ≤ 4 allowed.
- No `<text>`, fonts, `<script>`, `<image>` or external refs. Transparent background unless the file is a sky.
- Mood: a calm, cosy city at night — deep blues/indigos/teals with warm window and lantern glows. Characters must pop: Wisp is near-white with lilac shading, the pearl is silver-white with a pale-blue glow, gems are teal/pink/violet, the magnet is red/blue. Backgrounds keep the play area (y 1…8 u) low-contrast and darker than the characters. **Avoid white/near-white large shapes in the play area** of the backgrounds (Wisp and the pearl are white).
- Kid-friendly and cute: big eyes, round shapes, nothing scary (no dark alleys, no monsters).

## 4. Asset table (`game/assets/default/`)
### Characters (character artist)
| File | viewBox | Drawn size | Anchors |
|---|---|---|---|
| `wisp_idle.svg` | 0 0 240 100 | width = paddle w (u), uniform scale: 1 art px = w/228 u | Wisp IS the cloud paddle: a wide, puffy cloud body with a cute face in the middle (big eyes, rosy cheeks, small smile) and two tiny cloud arms. **Bounce line = top of the body at art y = 14, spanning art x 6…234**. Bottom of the body ≈ art y 92. Face centre ≈ (120, 56) |
| `wisp_left.svg`, `wisp_right.svg` | same | same | eyes look and body leans slightly left / right (moving); trailing mini-puffs on the far side. Same bounce line |
| `wisp_cheer.svg` | same | same | happy: eyes closed in ^ ^ smile, open mouth (gem caught, zone clear) |
| `wisp_oops.svg` | same | same | surprised "o" mouth, round eyes (pearl lost) |
| `wisp_magnet.svg` | same | same | determined smile, holding a tiny red/blue horseshoe magnet up with one arm (magnet active) |
| `ball.svg` | 0 0 64 64 | 0.6 × 0.6 u (hit radius 0.22 u) | the moon-pearl: silver-white core with a soft pale-blue glow ring, a tiny crescent highlight. Centre (32,32), solid core radius 23 |
| `gem_0.svg`, `gem_1.svg`, `gem_2.svg` | 0 0 64 64 | 0.7 × 0.7 u | the falling gem item, 3 cosmetic colours: 0 teal, 1 pink, 2 violet. Faceted cut gem with a shine; tiny friendly dot eyes are welcome. Centre (32,33) |
| `magnet.svg` | 0 0 64 64 | 0.8 × 0.8 u | the power-up: a red horseshoe magnet with blue/silver tips inside a translucent bubble. Centre (32,32) |
| `heart.svg`, `heart_empty.svg` | 0 0 48 48 | HUD | full heart, empty outline heart |
| `gem_hud.svg` | 0 0 48 48 | HUD | small gem icon for the gem counter |
| `icon.svg` | 0 0 256 256 | app icon | round badge: Wisp's face on a night sky with the moon-pearl and two gems, skyline silhouette at the bottom. Readable at 32 px. Opaque full-bleed background (for the iOS icons) |
| `particles/sparkle.svg` | 0 0 32 32 | | 4-point twinkle sparkle (white/pale yellow) |
| `particles/puff.svg` | 0 0 32 32 | | a tiny cloud puff (Wisp's squash puffs) |
All 6 Wisp frames must share an **identical** bounce line, body outline footprint (±3 px) and face position, so swapping frames never jumps.

### Environment (environment artist)
Zone keys and names: `cloud` Cloud Deck, `spires` Skyscraper Spires, `gardens` Rooftop Gardens, `lanes` Lantern Lane.
| File | viewBox | Notes |
|---|---|---|
| `levels/<z>/sky.svg` | 0 0 960 540 | full sky gradient + distant shapes. cloud: big friendly moon, starfield, sea of clouds far below; spires: deep blue, stars, crescent moon, far skyscraper silhouettes; gardens: indigo with a warm horizon glow; lanes: warm violet-to-indigo dusk with soft city glow. Not tiled; drawn cover-fit |
| `levels/<z>/far.svg` | 0 0 960 300 | far layer, **horizontally tileable** (x=0 and x=960 edges match), transparent above. cloud: rolling cloud banks; spires: tower tops with tiny lit windows and blinking-light dots; gardens: rooftops with water towers; lanes: shop-house fronts with lit windows |
| `levels/<z>/near.svg` | 0 0 960 200 | near layer the hero floats above, tileable. **World y = 0 is at art y = 150**; ground fill below to y = 200. cloud: fluffy cloud floor; spires: a flat roof edge with railings and an antenna at the sides; gardens: roof with planters, string lights only at the far left/right 120 px; lanes: street with lantern posts at the sides. Keep above art y ≈ 100 sparse except the outer 120 px |
| `bricks/<z>.svg` | 0 0 140 50 | 1-hit block for zone z (cloud: puffy star-cloud tile; spires: glowing window pane; gardens: flower box; lanes: paper lantern block). Drawn 1.4 × 0.5 u, rounded, ≤ 3 px margin |
| `bricks/<z>_tough.svg` | 0 0 140 50 | 2-hit block for zone z: sturdier (darker rim, frame/bands) |
| `bricks/<z>_crack.svg` | 0 0 140 50 | the tough block after its first hit (cracks) |
| `bricks/gem.svg` | 0 0 140 50 | any zone: a glass block with a teal gem inside; 1 hit; always drops a gem |
| `bricks/magnet.svg` | 0 0 140 50 | any zone: a block with a red horseshoe-magnet emblem and a soft pulse ring; 1 hit; drops the magnet |
| `particles/twinkle.svg`, `mist.svg`, `shooting.svg` (shooting star, 64×32 viewBox ok), `firefly.svg`, `petal.svg`, `ember.svg`, `glow.svg` (64×64) | 0 0 32 32 | ambient + juice particles |
| `particles/chip_<z>.svg` | 0 0 24 24 | block debris per zone |
| `levels/palette.json` | | `{ "<z>": { "skyTop","skyBottom","ink","bar","glow" } }` per zone (bar = HUD pill colour, glow = accent) |

## 5. Module contracts
### `rng.js` — `WRB.RNG(seed)` (unchanged from the fork)
`.next() .range(a,b) .int(a,b) .pick(arr) .chance(p)`.

### `world.js` — `WRB.World` (headless, deterministic, no DOM, no Math.random)
```
WRB.World.CONFIG   // tuning numbers with unit + rationale comments; DIFF: { easy, normal, hard } overrides
WRB.World.LAYOUTS  // 4 layouts (one per zone), arrays of 6–7 strings of 10 chars: '.' empty, 'b' block, 't' tough, 'g' gem block, 'm' magnet block
WRB.World.ZONES    // ['cloud','spires','gardens','lanes']
new WRB.World({ seed, difficulty: 'easy'|'normal'|'hard', level: 0 })
```
State fields (read by render / UI / tests):
- `time`, `phase`: `'serve'` | `'play'` | `'clear'` (zone cleared; ~2.5 s, no ball: the descend transition) | `'over'`
- `level` (zones cleared in total), `zone` = level % 4, `loop` = floor(level / 4)
- `score`, `hearts`, `maxHearts` (5), `gemCount` (gems caught), `combo`
- `paddle`: `{ x, px, y, w, vx, target, cheer, oops, squash, face }` — squash = 0…1 decaying after a ball hit (render squashes Wisp); face ∈ `'idle'|'left'|'right'|'cheer'|'oops'|'magnet'` (oops > cheer > magnet > left/right > idle)
- `ball`: `{ x, y, px, py, vx, vy, r, speed, onPaddle, stuck, stuckT, stuckOff }` or `null` during `'clear'`/`'over'`. `onPaddle` true during serve or while stuck; `stuck` true only for a magnet catch; `stuckOff` = x offset from paddle centre; `stuckT` = s until auto-release
- `bricks`: `{ id, x, y, w, h, hp, maxHp, kind: 'block'|'tough'|'gem'|'magnet', alive, hitT }`
- `gems`: falling gems `{ id, x, y, px, py, vx, vy, rot, spin, color: 0|1|2, pulled }` (pulled = true while the magnet attracts it)
- `powerups`: falling magnet bubbles `{ id, x, y, px, py, vx, vy, wob }`
- `magnet`: `{ t, max }` — t = seconds left (0 = off)
- `net`: `{ saves }`
- `alpha`, `stats`: `{ bricks, gems, gemsMissed, magnets, magnetsMissed, catches (ball sticks), lost, serves, paddleHits, netSaves, maxCombo, zoneTimes: [] }`

Methods: `reset()`, `update(dt)` (fixed 1/120 s sub-steps, keeps px/py, sets alpha), `setPaddleTarget(x)`, `movePaddle(dir)`, `serve()` (serves during 'serve', or **releases a stuck ball**; returns true if it launched), `drainEvents()`, `getState()` (phase, level, zone, loop, score, hearts, gemCount, bricksLeft, ball {x,y,vx,vy,speed,stuck}|null, paddle {x,w}, magnet t, gems n, powerups n, time), `gotoLevel(i)`, `bricksLeft()`, `debugClear(leave=1)`, `debugMagnet()` (give the magnet now), `debugDrop(kind)` (spawn a falling 'gem' or 'magnet' above the paddle).

Events (positions in u): `serve {x}` · `paddle {x, y, off}` · `wall {x, y, side}` · `brick {id, x, y, kind, broken, hp, pts, combo, zone}` · `gemSpawn {id, x, y, color}` · `gemCatch {x, y, pts, count, color}` · `gemMiss {x}` · `magnetSpawn {id, x, y}` · `magnetGet {x, y, t}` · `magnetMiss {x}` · `magnetEnd {}` · `magnetWarn {}` (2 s left) · `stick {x, y}` · `release {x, y, auto}` · `net {x, savesLeft}` · `ballLost {x}` · `heartLost {hearts}` · `heartGain {hearts, why: 'gems'|'zone'}` · `combo {n}` (3, 5, 8…) · `levelClear {zone, pts, time}` · `levelUp {level, zone, loop}` · `gameOver {score}`

Rules (numbers are the mechanics engineer's call, documented in `docs/MECHANICS.md`):
- Ball–Wisp, ball–brick (swept, no tunnelling ≤ 16 u/s), walls, |vy| floor, anti-stall: as in the fork.
- Gems: block 25 % chance, tough 50 % (on break), gem block 100 %. They pop up a little (vy +1.5) then fall with gravity to ~2.4 u/s terminal and a gentle sway. Caught when touching Wisp's box (x ±(w/2 + 0.25), y 0.2…1.8).
- Magnet bubble: falls slower (~1.8 u/s) with a wobble. Catching it sets `magnet.t = max` (refreshes if already on).
- While magnet.t > 0: gems/bubbles within `MAGNET_RANGE` (≈6 u) get an acceleration toward Wisp's centre (≈ 14 u/s², capped speed 7 u/s) — smooth curved paths, not teleports; a downward-falling pearl that hits Wisp **sticks** (`stuck`, offset kept, follows Wisp, `stuckT` ≈ 1.5 s); `serve()` or the timeout releases it at the angle for its offset. No sticking during the last 0.3 s.
- Ball lost while stuck can't happen. If the magnet ends while stuck, release at once.
- First zone on Easy must be easy for a 6-year-old (wide Wisp 3.6 u, ball 5.4 u/s, 8 net saves).

### `weather.js` — `WRB.Weather` (ambient, logical screen px)
```
new WRB.Weather({ width, height, seed }); .setLevel(zone, { instant }); .resize(w,h); .setGround(groundPx); .update(dt)
.particles  // [{ sprite: 'p_twinkle'|'p_mist'|'p_shooting'|'p_firefly'|'p_petal'|'p_ember'|'p_sparkle', x, y, size, rot, flipX, alpha, layer: 'back'|'front' }]
```
≤ 90 particles. cloud: twinkles (fixed positions, blink) + slow mist wisps drifting sideways (back layer); spires: twinkles + a shooting star every 4–8 s (fast diagonal, fades); gardens: fireflies (wander, blink) + petals (flutter/sway, slow fall); lanes: embers rising with a gentle wobble and fade + a few fireflies. Physically believable motion.

### `bot.js` — `WRB.Bot` (autopilot)
`new WRB.Bot(world, { skill: 0…1, seed })` → `.step(dt)`: predicts the pearl's landing x on the bounce line (with wall bounces), aims at remaining bricks, catches gems and magnet bubbles when safe, serves/releases after a short random delay (while stuck: slides to aim at bricks, then releases). Only uses `setPaddleTarget()` / `serve()`.

### `render.js` (integrator) draws: sky → far (parallax 0.1 with the paddle) → near → bricks → gems + magnet bubbles (+ soft glow, magnet pull streaks) → ball trail + ball → Wisp (squash, bob, shadow on the roof, magnet ring timer) → weather front → juice (popups, rings, chips, sparkles, puffs, screen shake) → HUD (score, hearts, gems, zone name) → banner. Zone change: a "descend" transition — the old scene slides up and the new one rises from below, crossfaded via an offscreen canvas.

## 6. Test hooks
URL params: `?speed=N&bot=1&skill=0.8&autostart=1&autorestart=1&seed=N&mute=1&debug=1&diff=easy|normal|hard&level=N`.
`window.WRB.debug`: `world, weather, mode, stats, getState(), setSpeed(n), startGame(), setBot(on, skill), setAutoRestart(on), gotoLevel(i), serve(), setPaddle(x), clearBricks(leave), giveMagnet(), drop(kind)`.
Modes: `'title'` (bot demo) → `'playing'` ⇄ `'paused'` → `'over'`.
