# Family Flappy: mechanics and physics notes

Implements the contracts in `DESIGN.md` §5.1 to §5.3. The code lives in `game/js/rng.js`, `world.js`, `weather.js` and `bot.js`. Tests are in `tests/unit/run.js`, which you run with `node tests/unit/run.js`.

## Research applied
- **Flappy Bird feel.** The game uses constant gravity, and a tap *sets* the vertical velocity instead of adding to it. That makes every flap feel identical and predictable. Terminal velocity is capped. The bird holds nose-up briefly after a flap, then pitches down only once it is falling fast. The original game is famously harsh (a short, steep arc). We keep the same shape but make it about 20–30% floatier: a lower g/impulse ratio and a slightly longer apex time give kids more reaction time.
- **Fixed timestep.** "Fix your timestep" accumulator. The sim always advances in 1/120 s steps, and leftover time carries over to the next update. The result depends only on seed + the step at which `flap()` was called, never on frame rate. A single `update(3)` equals 360 × `update(1/120)` (this is tested).
- **Game feel / juice.** Squash-stretch on flap (1.15 → 1, about 0.1 s), a fast wing burst after each flap, exponential easing for everything that turns (angle, scroll speed, wind profile), and small secondary motion: drop spin, one small bounce, slide-and-fade.
- **Falling leaves.** Modelled as a pendulum. The leaf swings side to side, falls fastest through the bottom of the swing and slows at the ends (`vy ∝ 0.3 + 1.15·cos²φ`), and tilts with the swing. About 40% of leaves also tumble, faked in 3D with `flipX = cos(tumblePhase)`. Strong gusts loft them.
- **Petals.** Helical "spiral" drift (circular sway with in-plane rotation) and `flipX = cos(phase)`.
- **Snow.** Depth layering: far flakes are tiny, slow and low-parallax (0.22); near flakes are big, fast and high-parallax (1.15). Each flake has a gentle sine drift.
- **Butterflies.** Correlated random walk. The turn rate eases toward a random target that changes every 0.4–1.4 s, and soft steering keeps each butterfly in a meadow band. Flutter bob is in phase with the wing beat, and the sprite alternates `_a`/`_b` at 8–12 Hz.
- **Wind.** The sum of 3 seeded sines (incommensurate frequencies) gives smooth, never-repeating gusts. The wind is a velocity of the air, so drops and particles *relax toward* it through drag. Nothing is pushed by a raw force.

## Coordinate convention
All `x` values are **screen-space**. The bird is fixed at x = 260. The world scrolls left at `scrollSpeed`, so ground things move by `-scrollSpeed·dt` plus their own walk. Drops store a screen `vx` and a world `vxWorld = vx + scrollSpeed`. Drag acts on world velocity relative to the air (`w.wind`).

## Tunables (`FF.CONFIG`)
| Name | Value | Unit | Why |
|---|---|---|---|
| gravity | 1500 | px/s² | with impulse gives the apex at 0.31 s |
| flapImpulse | −460 | px/s | one flap rises ≈ 69 px |
| maxFall | 650 | px/s | terminal; dies ≈ 1 s after the last flap from mid-screen |
| birdRadius | 22 | px | forgiving vs the 78×65 sprite |
| tiltUp / tiltDown | −25° / +70° | deg | Flappy-style pitch |
| tiltHold | 0.18 | s | stays nose-up after a flap |
| noseDownFrom → Full | 160 → 640 | px/s | smoothstep from vy to target angle |
| tiltUpRate / tiltDownRate | 20 / 4.5 | 1/s | snappy up, lazy down |
| wingFastRate / wingGlideRate | 10 / 3.2 | cycles/s | energetic for 0.25 s, then gliding |
| squashFlap | 1.15 | – | recovers at 11/s |
| readyBobAmp / Freq | 9 / 0.85 | px / Hz | READY hover |
| ceilingBounce | 140 | px/s | soft downward bounce, no death |
| dropCooldown / maxDrops | 0.18 / 6 | s / count | |
| dropOffset | (−8, +20) | px | under and slightly behind the bird |
| dropInheritVy / dropInitialVy | 0.25 / 40 | – / px/s | uses the bird's *pre-flap* vy (a dropped, not thrown, feel) |
| dropGravity / dropMaxFall | 950 / 720 | px/s² / px/s | takes ≈ 0.7 s from bird to ground |
| dropDrag | 1.5 | 1/s | drifts ≈ 30–55 px back-left on screen |
| dropBounce / dropFadeTime | 0.28 / 0.6 | – / s | one small bounce, slide, fade |
| turtle speed | 15–45 → max 75 | px/s | crawl; the spread grows with difficulty; 45% walk right |
| turtle gap | 300–520 → 380–680 | px of scroll | 1–3 turtles on screen; never empty for more than 1.5 s |
| turtle pauses | every 3–7 s for 0.5–1.3 s | s | look around (`look` −1..1) |
| happyTime / hitCooldown | 0.6 / 0.4 | s | |
| shell box | x 20–80%, y 12–58% of 132×79, +6 px | – | matches viewBox x 40–160, y 15–70 |
| comboBonusAt / comboBonus | 3 / +1 | – | |
| pointsPerSeason | 10 | pts | |
| scrollSpeedStart → Max | 120 → 220 | px/s | smoothstep over score 0..60, eased at 0.8/s |
| readyScrollSpeed | 70 | px/s | |
| wind spring/summer/autumn/winter | −10±12, −3±5, −22±36, −14±18 | px/s | gust amplitude ×(1 + 0.5·difficulty) |

First season: speed is 120–130 px/s, wind is about −22..+2 px/s, and turtles are slow. A drop released over a turtle's shell hits if the turtle is within about 30–40 px of the bird's x.

## Weather (steady-state counts)
| Season | Particles | Ambient |
|---|---|---|
| Spring | 34 petals (22 back, 12 front), 6 blossoms, 4 seeds = 44 | pink tint 0.05, sunRays 0.25 |
| Summer | 3–6 butterflies (front), 20 dandelion seeds, 22 pollen `dot`s = 45–48 | warm tint, sunRays 0.85 |
| Autumn | 40 leaves (26 back, 14 front), 3 colours | orange tint, fog 0.06 |
| Winter | 40 far dots, 22 mid dots, 10 mid snowflakes, 14 front snowflakes = 86 | blue tint, fog 0.35 |

Layer parallax: back × 0.4, front × 1.1 (winter has per-depth overrides). Particles that leave the screen re-enter at the upwind/top edge, chosen by flux so density stays constant. On `setSeason` (not instant), old particles stop respawning and fade out over 1–4 s (staggered). New ones ramp to full count over 2 s, spawning inside the view and fading in over 0.9 s. Sizes: sprites 8–26 px; `dot`s 2–7 px.

## Bot
On each step the bot does three things:
- It **forces** a flap when the bird would be below y ≈ 372 after its own reaction lag.
- It **never** flaps above y = 115, so it never hits the ceiling.
- Otherwise it **aims**: it flaps when `world.predictDrop()` says a drop released now hits a shell with at least 4 px of margin. `predictDrop()` uses the same `stepDropAir` physics, with ghost turtles that know about their happy/pause timers.

`skill < 1` adds reaction delay (up to 0.25 s), noise in how it sees the bird's height, a stricter aim margin, random flaps, and short "look away" lapses. With skill 1 it survives indefinitely and scores about 0.6 points/s. With skill 0.2 it usually crashes within 2 minutes.

## Contract additions (all additive)
- **World:** `w.cfg`, `w.difficulty` (0..1), `w.playTime`, `w.flaps`, `w.bestCombo`, `w.canDrop()`, `w.dropInit(preVy)`, `w.predictDrop(preVy, maxT)` → `{hitId, t, x, y, margin}`, `w.snapshot()`, `w.reset(seed?)` (a seed re-seeds; without one the RNG continues so each round differs), and statics `FF.World.stepDropAir`, `FF.World.smoothstep`.
- **Drop:** `vxWorld`, `bounced`, `alpha` (= life after landing), `age`. `life` is 1 while airborne and fades 1→0 over 0.6 s after landing, so it can be used as alpha.
- **Turtle:** `hitCooldown`, `paused`, `pauseTimer`, `look` (−1..1 head-turn hint while paused).
- **Events:** `drop` and `miss` also carry `id` (the drop id). The ready→playing starting flap emits `start` + `flap` but **no `drop`**.
- **Dead state:** the bird rests on the ground, eases nose-down, and `scrollSpeed` decelerates to 0 (about 1 s). Drops and turtles keep animating.
- **Weather particles:** `depth` (0..1), plus internals (`season`, `kind`, …) that the renderer can ignore. Extra API: `wx.stats()`, `wx.ramp[4]`, `wx.butterflies`, `FF.Weather.SEASONS` (emitter tables).
- **Bot:** `bot.stats = {flaps, aimed, altitude, random, starts, deaths, predicted, lapses, time}`, `bot.enabled`, `bot.reset()`.
