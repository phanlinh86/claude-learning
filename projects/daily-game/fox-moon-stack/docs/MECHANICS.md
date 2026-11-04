# Juno's Moon Stack — Mechanics

Code: `game/js/world.js` (`MS.World`, `MS.World.CONFIG`), `game/js/weather.js` (`MS.Weather`), `game/js/bot.js` (`MS.Bot`).
Contract: `docs/DESIGN.md` §2 and §5. Tests: `node tests/unit/run.js` (23 tests, about 1.5 s).

Units are logical px (y points **down**) and seconds. Every length, speed and acceleration in CONFIG is given for
`layout.unit = 100` (a 960×540 view) and is multiplied by `unit/100` when used. Because of that, a 560×1000 portrait
phone plays exactly like a desktop window, only smaller. The simulation runs in fixed sub-steps of 1/120 s, so the
same seed and the same `drop()` times give the same game at any frame rate (tested with 1/60 vs 1/30 frames).

## 1. Rules (what the player sees)
- Juno's saucer swings left and right (`x = cx + swingA·sin φ`, `φ += swingW·dt`). The swing slows naturally at the edges, like a pendulum.
- A crate hangs in the beam. One tap releases it. It falls with the planet's gravity and keeps `inherit × saucer.vx` of the sideways speed.
- It lands on the top crate, or on the launch pad when the tower is empty. `dx` = crate x − (top x + sway at the top):
  - `|dx| ≤ perfectTol·w` → **Perfect**. It snaps to the top centre, combo +1, and the tower barely sways.
  - `|dx| ≤ w_top/2` → **Edge**. It stays where it touched, combo resets and the tower sways. On Easy/Normal the beam pulls it `assist` of the way back toward the centre.
  - `|dx| ≤ (w_top + w)/2` → **Miss on the edge**. The crate pivots on the top corner, slides off and tumbles to the ground.
  - Otherwise it misses the tower completely and falls to the ground.
- **Centre of mass:** after every crate that stays, the world checks each support from the launch pad upward. If the centre of mass of everything above a support is past that support's edge, everything above it topples off the heavier side.
- A miss or a topple costs **one heart** (one heart per drop at most). At 0 hearts the falling crates finish tumbling and then it is game over.
- **Coins:** each new crate has a chance (per planet) to bring 1–2 star-coins, with at most 3 alive. They float in the gap between the hanging crate and the tower top. 70 % hang over the drop path and 30 % sit out on the swing (a risky grab). A falling crate's box collects every coin it touches: +5 each. Every 5 coins Juno grows a step (max 5): the saucer gets ×1.08 per step and new crates get ×1.06 per step. Wider crates are easier to land on, but every landing shakes a heavier tower. A miss shrinks her one step.
- **Score:** a crate that stays +10. A perfect adds +10 × min(combo, 5). A coin +5. Goal bonus = 100 × (zone + 1) × (loop + 1).
- **Goal:** when `placed === goal` (10/12/14/16 crates, +2 per loop) the phase becomes `goal`:
  - 0 s: the flag is planted (event `goal`).
  - 0.75 s: the rocket appears at the top of the screen and the camera glides down the tower with it.
  - 2.05 s: touchdown beside the launch pad (event `rocket`).
  - 2.6 s: the phase becomes `travel`: the rocket lifts off and the crates fade.
  - 3.6 s: `levelUp`. A fresh tower starts on the next planet and 1 heart comes back, up to the maximum.
- After Comet Garden the planets loop. Each loop the swing is 12 % faster (cap ×1.6), gravity is 6 % stronger, the goal is +2 crates and the perfect zone is 6 % smaller (floor ×0.7).

## 2. Physics model
**Saucer.** Its position is analytic: `x = cx + swingA·sin φ` and `vx = swingA·swingW·cos φ`. It is fastest at the centre and has zero speed at the edges. It rides `saucerScreenY` below the camera with a 4 px, 2.9 s hover bob. Its tilt eases toward `vx·0.00045` rad (at most 0.2 rad). `scale` eases toward `1 + 0.08·grow` at a rate of 4/s.

**Held crate.** It follows the saucer x on a spring (ω = 18 rad/s, ζ = 0.6). That gives about 0.07 s of lag and a small pendulum swing-out at the turn-arounds. It hangs `emitterDY·scale + beamGap` below the saucer centre.

**Fall.** The crate starts with `vx = inherit·saucer.vx` and `vy = 0`. Each step is integrated exactly for constant gravity: `y += vy·h + ½g h²`, `vy += g h`. On drag planets the sideways speed decays exactly: `x += vx(1−e^{−dh})/d`, `vx ·= e^{−dh}`. On the moon there is no drag, so `y(t) = ½gt²` and `x(t) = inherit·vx·t` to 1e-6 px (tested). The crate spins a tiny bit (`vr = vx·0.0006`). Landing is detected when the crate's bottom crosses the support's top surface.

**Landing squash.** `squash = clamp(vy / 900u, 0.15, 0.65)` and it decays at a rate of 7/s, so the "thunk" is gone after about 0.3 s. A perfect snap or an assist moves the crate with an exponential slide (28/s, 95 % in 0.11 s), so it never jumps in one frame. The COM rule judges the final resting place.

**Tipping over an edge (miss pivot).** The crate becomes a rigid body pivoting on the top corner P. For a group (a topple), all crates rotate together about P:
- Angular acceleration `α = g · Σm·x_arm(θ) / Σm(k² + r²)`, where `k² = (w² + h²)/12` and `r` is the distance from P. `x_arm` is each crate's current horizontal offset from P, so the torque grows as the crate leans out.
- The crate starts spinning with `ω₀ = 0.55 · v_impact · arm / (k² + r²)`. That is the impact's angular momentum about the corner, minus the share lost to the thunk.
- At θ = 0.6 rad (about 34°) it slides off the corner. Each crate gets the rigid-body velocity `v = Ω × r`, the same spin, and a small outward push (60u px/s) so it clears the tower.
- During the pivot every point keeps its distance to P (a rigid rotation, tested).

The result is a slow teeter for a crate just past the edge (about 0.6 s) and a quick flip for one far past it (about 0.15 s).

**Tumble.** A free body falls with gravity and drag and keeps spinning. It collides with the launch pad shelf (where it slides off the outer edge) or with the ground. The collision uses the rotated box's lowest point, `|w/2·sin θ| + |h/2·cos θ|`. It bounces once with restitution 0.3: vx ×0.65, spin ×0.55, and no bounce below 120u px/s. Then it settles flat (it rotates to the nearest quarter turn), rests 0.55 s, fades out over 0.4 s and is `gone`.

**Centre-of-mass topple.** For support i = launch pad, crate 0, crate 1 … (bottom first), take the mass-weighted (w·h) mean x of all crates above it. If `|comX − x_i| > w_i/2`, every crate above i topples as one rigid group about the corner of i on the heavy side, starting at ω = 0.6 rad/s. The check repeats until the tower is stable, and one `topple` event reports the total count. The bottom-up scan means the lowest failing joint takes everything above it, which is the physical answer. (DESIGN says "from the top down". The result is the same whenever only one joint fails.)

**Sway.** The top offset follows a damped spring: `sway'' = −ω²·sway − 2ζω·sway'`, with ω = 3.4 rad/s (about one sway per 1.9 s) and ζ = 0.34. The first overshoot is 32 %, and after 2 swings it is under 5 % (tested: each swing is under 45 % of the one before).
- Every landing kicks the sway velocity by `1.3·dx (×0.25 if perfect) + 0.06·vx + grow·9u·sign(dx)`. The kick is scaled by `min(1, crates/4)` (a short tower is stiff) and by the difficulty's `sway`.
- The sway is clamped to ±0.32 unit.
- The drawing offset at height y is `sway·((groundY − y)/towerH)^1.5`. The sway shifts the drawing and the landing target only. It never topples anything.

**Camera.** The target is `min(0, topY − crateH − topLine)`, which leaves one crate of room above the top line. The camera follows a critically damped spring (ω = 5): 90 % in about 0.8 s, with no overshoot (tested to be monotonic). It is stepped after landings and topples. A guard keeps the tower top at or below `topLine` on screen in every frame (tested at 960×540, 560×1000 and 720×1600).
- In `goal`/`travel` the camera follows a C¹ smoothstep from its height down to 0 between 0.75 s and 2.05 s, gliding down with the rocket.
- On a new planet it springs from there to the new target. On a fresh game it starts on the target.

**Prediction.** `predictLanding()` replays the same integrator and the same sway spring from the current state, with no RNG and no mutation (tested). Its dx therefore equals the real landing's dx to 1e-6.

## 3. CONFIG (world.js)
| Key | Value | Why |
|---|---|---|
| step / maxFrame | 1/120 s / 0.25 s | about 7 px per step at the fastest fall, so landings are crisp; a hidden tab doesn't fast-forward |
| baseW / baseH / baseTopFrac | 2.4 / 0.64 unit / 4/64 | DESIGN §2; crates sit on base.svg's flat top line |
| saucerSize / emitterDY / beamGap | 1.55 / 0.6 / 0.3 unit | Juno's drawn size; emitter (80,140) − body (80,78) in the 160 box = 0.6 unit; a visible beam |
| rocketDX / rocketHalfH / flagH | 2.15 / 0.675 / 1.2 unit | rocket lands beside the pad, inside a 560-wide portrait; nozzle on the ground |
| crateGrow | 0.06 per step | +30 % at grow 5: noticeably easier, not trivial |
| holdOmega / holdZeta | 18 rad/s / 0.6 | the crate "hangs" with a little lag, never wobbly |
| inherit | 0.3 (× difficulty) | the beam damps most of the swing; with the drop guide the drift is readable |
| spinK | 0.0006 | a hint of spin from sideways speed |
| squashRef / Min / Max / Decay | 900u px/s / 0.15 / 0.65 / 7 per s | a cartoon thunk that is gone in 0.3 s |
| slideRate | 28 per s | perfect snap / assist slide, 95 % in 0.11 s |
| perfectSnapFloor | 6u px | the perfect zone never shrinks to nothing |
| comboCap / placePoints / perfectPoints / coinPoints / goalPoints | 5 / 10 / 10 / 5 / 100 | REQUIREMENT |
| settleTime / missSettle / overWait | 0.5 / 0.9 / 1.6 s | time to read the thunk and sway, or to watch the tumble, before the next crate |
| impactSpin / toppleSpin0 / releaseAngle / clearPush | 0.55 / 0.6 rad/s / 0.6 rad / 60u px/s | see the pivot model in §2 |
| slideAcc / bounce / bounceMin / groundFriction | 900u px/s² / 0.3 / 120u px/s / 0.65 | one soft "boing", then it rests |
| restFade / fadeTime | 0.55 / 0.4 s | the tumbled crate stays readable, then goes |
| swayOmega / swayZeta | 3.4 rad/s / 0.34 | springy but calm |
| swayKick / swayVxKick / perfectKick / growKick / swayHeightRef / swayMax | 1.3 per s / 0.06 / 0.25 / 9u px/s / 4 crates / 0.32 unit | off-centre landings rock the tower, perfect ones settle it, and a bigger Juno shakes more |
| camOmega / goalCamStart / goalCamEnd | 5 rad/s / 0.75 s / 2.05 s | see the camera model in §2 |
| saucerGrow / scaleRate | 0.08 / 4 per s | DESIGN |
| bobAmp / bobW | 0.04 unit / 2.2 rad/s | a gentle hover |
| tiltK / tiltMax / tiltRate | 0.00045 / 0.2 rad / 8 per s | leans into the swing |
| anim | drop 0.35, happy 0.8, oops 0.95 s | pose times |
| dropBuffer | 0.25 s | DESIGN: one early tap is kept, older taps are ignored |
| goalTime / rocketIn / rocketLand / travelTime / rocketAcc / heartReward | 2.6 / 0.75 / 2.05 / 1.0 s / 1400u px/s² / 1 | the goal sequence |
| coins | max 3, life 3 drops, r 0.21 unit, band ≥ saucer + 0.8 unit and below the held crate, ≤ top − 0.45 unit, minGap 0.65 unit, bob 0.06 unit at 2.6 rad/s, spin 7 frames/s, pair 0.25, onPath 0.7, follow 3 per s | coins sit in the fall gap; most can be grabbed with a good drop |
| growEvery / growMax | 5 / 5 | REQUIREMENT |
| loopSwing / loopSwingCap / loopG / loopGoal / loopTol / loopTolMin | 0.12 / 1.6 / 0.06 / 2 / 0.06 / 0.7 | loops get gently faster |

### Difficulty (`CONFIG.difficulty`)
| | swing × | crate × | perfectTol (×w) | hearts | inherit × | sway × | assist |
|---|---|---|---|---|---|---|---|
| easy | 0.6 | 1.35 | 0.22 | 5 | 0.5 | 0.65 | 0.6 |
| normal | 1.0 | 1.0 | 0.13 | 3 | 1.0 | 1.0 | 0.15 |
| hard | 1.22 | 0.9 | 0.085 | 3 | 1.15 | 1.25 | 0 |

### Planets (`CONFIG.planets`)
| zone | key | g (px/s² ×u) | swingW (rad/s) | drag (per s) | coin chance | goal |
|---|---|---|---|---|---|---|
| 0 | moon | 760 | 1.75 | 0 | 0.55 | 10 |
| 1 | dunes | 1050 | 1.95 | 0.25 | 0.6 | 12 |
| 2 | rings | 1250 | 2.3 | 0.1 | 0.6 | 14 |
| 3 | comet | 1400 | 2.5 | 0.15 | 0.65 | 16 |

### What that means at 960×540 (swing period, peak saucer speed, crate width, perfect zone, fall time, worst-case drift)
| diff | planet | period | v max px/s | crate w | perfect | inherit | g | fall | drift px | goal |
|---|---|---|---|---|---|---|---|---|---|---|
| easy | moon | 4.99 s | 363 | 127 | ±27.8 | 0.15 | 760 | 0.53 s | 29 | 10 |
| easy | dunes | 4.48 s | 404 | 127 | ±27.8 | 0.15 | 1050 | 0.45 s | 28 | 12 |
| easy | rings | 3.79 s | 477 | 127 | ±27.8 | 0.15 | 1250 | 0.42 s | 30 | 14 |
| easy | comet | 3.49 s | 518 | 127 | ±27.8 | 0.15 | 1400 | 0.39 s | 31 | 16 |
| normal | moon | 3.59 s | 504 | 110 | ±14.3 | 0.30 | 760 | 0.53 s | 81 | 10 |
| normal | comet | 2.51 s | 720 | 110 | ±14.3 | 0.30 | 1400 | 0.39 s | 85 | 16 |
| hard | moon | 2.94 s | 615 | 99 | ±8.4 | 0.345 | 760 | 0.53 s | 113 | 10 |
| hard | comet | 2.06 s | 878 | 99 | ±8.4 | 0.345 | 1400 | 0.39 s | 119 | 16 |

The fall distance stays about the same as the tower grows, because the camera keeps one crate of room above the top. On Easy the worst-case drift (about 30 px) is a quarter of a crate, so a child who taps when the crate is "over the tower" still lands it.

## 4. Balance: the bot as a player model (`MS.Bot`)
- **Think.** For each crate the bot first looks for `(0.8 − 0.5·skill)·U(0.85, 1.15)` s.
- **Watch and tap.** It then watches `predictLanding().dx` every frame. It estimates when dx will cross its aim point from dx's rate of change, and taps at that time plus a timing error τ ~ N(0, (1 − skill)·0.12 s), drawn once per crate. A negative τ means an early tap, a positive one a late tap.
- **Aim.** The aim point has an error with sd `(1 − skill)·0.12·w`. At skill ≥ 0.6 the bot also leans its aim back against the tower's drift.
- **Hesitation.** A casual bot lets a chance pass with probability `0.55·(1 − skill)` (halving each time), like a child waiting for the next swing.
- **Give-up.** After 7 s of watching, the bot drops anyway.

Sims (20 seeds each, 960×540, up to 300 s):

| difficulty | skill | planet 1 cleared | time to clear planet 1 | perfect | miss | game over within 5 min |
|---|---|---|---|---|---|---|
| **easy** | **0.35** | **20/20** | **31.8 s** | 58 % | 5.0 % | 11/20 |
| easy | 0.5 | 20/20 | 30.8 s | 71 % | 1.2 % | 1/20 |
| easy | 1 | 20/20 | 29.6 s | 100 % | 0 % | 0/20 |
| normal | 0.5 | 16/20 | 28.6 s | 35 % | 10.8 % | 20/20 |
| normal | 0.8 | 20/20 | 23.1 s | 58 % | 0.4 % | 0/20 |
| normal | 1 | 20/20 | 22.5 s | 97 % | 0 % | 0/20 |
| hard | 0.8 | 20/20 | 24.2 s | 33 % | 1.9 % | 9/20 |
| hard | 1 | 20/20 | 19.2 s | 92 % | 0 % | 0/20 |

- **The first planet is easy for a 6-year-old.** On Easy, a skill-0.35 player clears Moon Base in 20 of 20 runs (unit test: at least 80 %).
- **Pacing.** The bot taps as soon as it has looked. A human child looks longer, so the sim was rerun with +1.2 s of look time per crate. The Easy, skill-0.35 player then takes **59 / 60 / 63 / 68 s** for planets 1–4. Easy 0.5 takes 54 / 59 / 65 / 71 s. Normal 0.8 (+1.0 s) takes 39–44 s. These sit inside the 45–90 s target for a casual player.
- **The game rewards skill.** Normal costs a skill-0.5 player far more hearts than Easy (tested). Hard turns the beam assist off, so lean builds up and centre-of-mass topples become the main danger.
- **Speed.** 10 simulated minutes (bot + weather) run in about 0.2–0.3 s.

## 5. Weather (`MS.Weather`)
- **Ambient particles** live in screen space. Their counts at 960×540 are scaled by `clamp(√(area/960·540), 0.85, 1.35)`:
  - moon: 26 twinkling sparkles + 16 slow moon-dust puffs that float upward a little.
  - dunes: 8 sparkles + 30 red dust streaks. They blow sideways with a gust strength of `0.95 + 0.45 sin(0.37t) + 0.25 sin(1.13t)` (about 0.25–1.65×) and are rotated along their motion.
  - rings: 10 sparkles + 26 ice crystals that tumble and drift slowly.
  - comet: 8 sparkles + 38 soft pink snowflakes that sway as they fall, plus a shooting star every 6–10 s (a fast `star` head and a fading `sparkle` trail of up to 18 pieces).
- **Parallax.** When the camera rises, ambient particles shift down by 0.35 × the camera motion × their depth.
- **Calm column.** About 35 % of the drifting particles prefer the front layer. While a particle is inside the tower column (`|x − cx| < 1.6·unit`) it is drawn on the back layer instead, so nothing bright crosses in front of the tower. Twinkles never spawn in the column.
- **Level change.** `setLevel` crossfades: the old particles fade out over 0.9 s and the new ones fade in. With `{instant}` the switch is immediate.
- **Bursts.** `burst(sprite, x, y, n, {speed, life, size, gravity, spread, up, spin, layer, drag, angle})` places particles in world coordinates (`world: true`). The renderer draws them at `y − camY`. Bursts never take the budget reserved for the ambient set or the shooting-star trail.
- **Cap.** The total is under 140 at all times (tested for every zone at 960×540, 560×1000, 720×1600 and 1280×540 with a burst every 8 frames).

## 6. Notes for the renderer / integrator
- **Coins.** `world.coins` is the total coin count, a number. The alive coin objects are in **`world.coinList`** (also readable as `world.coinsAlive`). DESIGN uses the name `coins` for both, and one property cannot be both.
- **Extra crate fields:** `alpha` (fades in travel and after a tumble), `tx` (the rest x a placed crate is sliding to), `pivot` (non-null while it is tipping on a corner), `onGround`.
- **Extra coin fields:** `fade` (counts 1 → 0 once it is `gone`, before it is removed), `baseY`, `sy`.
- **Base.** `base.y` is the centre of the pad box (`groundY − h/2`). `base.top` is the surface crates sit on (base.svg's line y = 4).
- **Rocket.** It has an extra field `vy`. Its `y` is the rocket's centre; the nozzle is on the ground when it has landed.
- **Placed crates.** Draw them at `x + swayOffsetLerp(y, alpha)` (lerp `prevX → x` too: perfect snaps slide). A falling or toppling crate is already in world coordinates, so add no sway.
- **predictLanding()** returns `{x, dx, perfect, ok, landY, topX, topW, tol}`. The last three are extras for the drop guide.
- **Test hook:** `world.setTower([dx…])` builds a tower of placed crates at rest offsets (px ×u from cx).
- **Weather update.** Call `weather.update(dt, world.cam.y)` (lerped or not) and `weather.resize(VW, VH)` on layout changes.

## 8. Changes after the playtest (2026-11-04)
The high-speed playtest (`docs/reports/playtest.md`) found Easy too hard for a real 4–6-year-old (13 % cleared planet 1) and topples dominating Normal/Hard. Applied CONFIG changes (`tests/sim/results/proposal.patch`):
- `difficulty.easy`: swing 0.72 → 0.6, crate 1.15 → 1.35, hearts 4 → 5, assist 0.4 → 0.6 (kid clears planet 1: 13 % → 55 % landscape, 85 % iPhone portrait).
- `difficulty.normal`: perfectTol 0.13 → 0.15, assist 0.15 → 0.5 (topples per 100 drops 6.8 → 1.2).
- `difficulty.hard`: perfectTol 0.085 → 0.11, assist 0 → 0.2 (perfect window 29 → 35 ms).
- `loopGoal` 2 → 1, `loopTolMin` 0.7 → 0.8.
- Easy: a miss no longer shrinks Juno, so children see the "grows bigger" twist.
- Goal show is 0.4 s longer (`goalCamStart` 1.25, `rocketIn` 1.2, `rocketLand`/`goalCamEnd` 2.5, `goalTime` 3.0) so the flag is seen before the camera glides down; Juno flies into the rocket.
The tables in §3–§5 above were measured before these changes.
