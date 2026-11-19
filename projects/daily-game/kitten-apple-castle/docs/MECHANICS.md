# Ziggy's Apple Castle — Mechanics

Code: `game/js/world.js` (`AC.World`, `AC.World.CONFIG`), `game/js/weather.js` (`AC.Weather`), `game/js/bot.js` (`AC.Bot`).
Contract: `docs/DESIGN.md` §2 and §5. Tests: `node tests/unit/run.js` (28 tests, about 1.7 s). Sims: `node tests/sim/run.js`.

Units are logical px (y points **down**) and seconds. Every length, speed and acceleration in CONFIG is given for
`layout.unit = 100` (a 960×540 view) and is multiplied by `unit/100` when used, so a 390×844 iPhone plays exactly like
a desktop window, only smaller. The simulation runs in fixed sub-steps of 1/120 s: the same seed and the same `drop()`
times give the same game at any frame rate (tested with 1/60 vs 1/30 frames).

The stacking physics (swing, fall, landing, pivot, topple, sway, camera) is the proven fox-moon-stack model; what is new
here is the **light** (the day-to-night twist), **lanterns**, **apples and pies**, and **Granny Boo's goal show**.

## 1. Rules (what the player sees)
- Ziggy's hover-rocket swings left and right (`x = cx + swingA·sin φ`, `φ += swingW·dt`). It slows naturally at the edges, like a pendulum.
- A crate hangs in her lantern glow. One tap releases it. It falls with the zone's gravity and keeps `inherit × rocket.vx` of the sideways speed.
- It lands on the top crate, or on the stone plinth when the tower is empty. `dx` = crate x − (top x + sway at the top):
  - `|dx| ≤ perfectTol·w` → **Perfect**: it snaps to the top centre, combo +1, the tower barely sways, and **a lantern is hung on it**.
  - `|dx| ≤ w_top/2` → **Edge**: it stays, combo resets, the tower sways. The glow pulls it `assist` of the way back toward the centre.
  - `|dx| ≤ (w_top + w)/2` → **Miss on the edge**: it pivots on the top corner, slides off and tumbles to the ground.
  - Otherwise it misses the tower completely and falls.
- **Centre of mass:** after every crate that stays, each support from the plinth upward is checked. If the centre of mass of everything above a support is past that support's edge, everything above it topples off the heavier side.
- A miss or a topple costs **one heart** (one per drop at most). At 0 hearts the tumbles finish, then game over.
- **Apples:** each new crate has a chance (per zone) to bring 1–2 floating apples (≤ 3 alive) in the gap between the hanging crate and the tower top; 70 % hang over the drop path, 30 % out on the swing. A falling crate's box collects every apple it touches: **+5**, or **+10 while `light < 0.5` in a darkening time of day** (a "glow apple"; Sunset and Night only, so the sunrise that eases a looped Dawn up from Night's darkness never counts: `World._dark()`, QA 2026-11-19).
- **Pies:** every 5 apples Granny Boo bakes a pie: **+1 heart** up to the maximum (event `pie`, `gained` false when hearts are full).
- **Score:** a crate that stays +10. A perfect adds +10 × min(combo, 5). Apple +5 / +10. Goal bonus = 100 × (zone + 1) × (loop + 1).
- **Goal** (`placed === goal`, 10/12/13/15 crates, +1 per loop) → phase `goal` (3.0 s), then `travel` (1.2 s), then `levelUp`:

| time | what happens | event |
|---|---|---|
| 0 s | the pennant is planted on top; floating apples fade | `goal {x, y, bonus}` |
| 0.35 s | Granny Boo appears off-screen at the right, 1.1 unit above her hover point | — |
| 1.45 s | she arrives beside the tower top (`state: 'hover'`) | `ghost` |
| 1.7–2.8 s | she waves (`wave: true`) while bobbing | — |
| 3.0 s | `travel`: she floats up and away (`state: 'out'`), the crates fade, the camera glides down to the ground | — |
| 4.2 s | fresh tower on the next time of day, +1 heart (up to max) | `levelUp {level, zone}` |

- After Night the day starts again. Each loop: swing +12 % (cap ×1.6), gravity +6 %, goal +1, perfect zone −6 % (floor ×0.8).

## 2. Light: the day-to-night twist
- Each zone has a start light (`CONFIG.zones[i].light`): dawn 0.85, noon 1.0, sunset 0.55, night 0.3. Its **end** light is the next zone's start light; Night ends at `nightEnd` 0.24.
- Tower progress `p = max over this level of placed/goal` (a high-water mark, so a topple never makes it brighter again).
- Target light = `start + (end − start)·smoothstep(p)`. `world.light` follows it with an exponential ease at `lightRate` = 1/s, so every crate darkens the scene gently over about a second, never in one frame.
- Within a level the light is **monotonic** (tested to 1e-3 while playing, 1e-9 on a built tower): dawn brightens 0.85 → 1.0, noon dims 1.0 → 0.55, sunset 0.55 → 0.3, night 0.3 → 0.24. At each level change the value carries straight over (dawn's end = noon's start, …). After Night the new Dawn's target is 0.85, and the ease turns the 0.24 → 0.85 jump into a ≈3 s **sunrise** (no step bigger than 0.01 per frame, tested).
- `world.dayT = zone + pE`, where `pE` eases toward `p` at the same rate: continuous 0 → 4 over a whole day (wraps to 0 after Night) for the sky tint and the sun/moon dial. `world.lightTint` = the current zone key while `pE < 0.5`, else the next zone's key (Night stays `night`).
- `getState()` reports `light`, `dayT`, `lightTint`, `apples`, `pieApples`, `lanterns`.

### Lanterns
- A Perfect sets `crate.lantern = true` and `crate.lanternSide = ±1` (alternating up the tower, first one on the right), emits `{type:'lantern', crate}`.
- The lantern hangs from a hook `0.12 unit` inside the crate's side edge and `0.1 unit` below its top, rotated with the crate. `world.lanternPos(crate, alpha?)` → `{x, y}` (the hook = lantern.svg's (24, 0)), `{lx, ly}` (the glowing body centre, 0.25 unit below), `rot` (the lantern's angle). Sway is included for placed crates.
- **The lantern swings like a real pendulum on its hook:** `θ'' = −ω²θ − 2ζωθ' + a_hook/ℓ` with `ℓ = 0.25 unit`, ω = 5.8 rad/s (≈ √(g/ℓ) for a small paper lantern: a 1.1 s swing), ζ = 0.12. `a_hook` is the sideways acceleration of the tower at that height (the sway spring's acceleration × the sway shape), so lanterns rock when the tower wobbles and hang still when it calms. It is kicked outward (2.2 rad/s) when it is hung, and |θ| ≤ 0.6 rad. Fields: `crate.lanternRot`, `prevLanternRot` (lerp), `lanternW`.

### `world.lights()` (pure, no RNG, world coords)
`[{x, y, r, a, kind}]`, in this order:

| kind | where | r (unit) | a |
|---|---|---|---|
| `ziggy` | the emitter (rocket centre + 0.6 unit) | 2.0 | 1 |
| `held` | the hanging crate's centre | 1.1 | 0.6 |
| `falling` (extra) | a released crate until it lands | 0.9 | 0.45 |
| `lantern` | `lanternPos().lx/ly` of each lantern crate still in the tower, top 10 only | 1.5 | 0.9 |
| `apple` | every floating apple, only while `light < 0.5` | 0.55 | 0.5 |
| `flag` | the pennant's lantern during goal/travel | 1.2 | 1 |
| `ghost` (extra) | Granny Boo while she is on screen | 1.1 | 0.55 |

### `predictLanding().lit`
How well the player can see the landing spot: `lit = 1 − (1 − light)·(1 − best)`, where `best = max over lights of a·(1 − d²/r²)²` at the tower-top centre. Ziggy's own lantern and the held crate are left out (they light the crate, not the target); lanterns, glow apples, the flag and Granny Boo count. An unlit top = ambient light; a top lantern lifts a Night top from 0.30 to ≈0.75 (tested: > +0.2).

## 3. Physics model
**Rocket.** Position is analytic: `x = cx + swingA·sin φ`, `vx = swingA·swingW·cos φ` (fastest at the centre, zero at the edges). It rides `saucerScreenY` below the camera with a 4 px, 2.9 s hover bob, and its tilt eases toward `vx·0.00045` rad (≤ 0.2). `saucer.scale` is always 1 (grow/shrink were removed).

**Held crate.** It follows the rocket x on a spring (ω = 18 rad/s, ζ = 0.6): ≈0.07 s of lag and a small pendulum swing-out at the turn-arounds. It hangs `emitterDY + beamGap` below the rocket centre.

**Fall.** `vx0 = inherit·rocket.vx`, `vy0 = 0`, integrated exactly for constant gravity (`y += vy·h + ½gh²`). With drag the sideways speed decays exactly (`x += vx(1−e^{−dh})/d`, `vx ·= e^{−dh}`). At dawn there is no drag, so `y(t) = ½gt²` and `x(t) = inherit·vx·t` to 1e-6 px (tested). A tiny spin `vr = vx·0.0006`.

**Landing squash.** `squash = clamp(vy / 900u, 0.15, 0.65)`, decaying at 7/s: the wooden thunk is gone in ≈0.3 s. A perfect snap or an assist slides the crate exponentially (28/s, 95 % in 0.11 s), never a one-frame jump.

**Tipping over an edge.** The crate becomes a rigid body pivoting on the top corner P (for a topple the whole group rotates about P): `α = g · Σm·x_arm(θ) / Σm(k² + r²)`, `k² = (w² + h²)/12`. It starts at `ω₀ = 0.55·v_impact·arm/(k² + r²)` (the impact's angular momentum about the corner minus the thunk). At θ = 0.6 rad it slides off with `v = Ω × r`, the same spin and a 60u px/s outward push. During the pivot every point keeps its distance to P (tested). A crate just past the edge teeters ≈0.6 s; one far past flips in ≈0.15 s.

**Tumble.** Free fall with gravity, drag and spin; it collides with the plinth (slides off its outer edge) or the ground using the rotated box's lowest point `|w/2·sin θ| + |h/2·cos θ|`, bounces once (restitution 0.3, vx ×0.65, spin ×0.55, no bounce below 120u px/s), settles flat to the nearest quarter turn, rests 0.55 s, fades 0.4 s.

**Centre-of-mass topple.** Supports bottom-up (plinth, crate 0, 1, …); the lowest joint whose upper COM is past its edge takes everything above it as one rigid group (ω₀ = 0.6 rad/s). One `topple` event reports the total count.

**Sway.** `sway'' = −ω²·sway − 2ζω·sway'`, ω = 3.4 rad/s, ζ = 0.34 (first overshoot 32 %, each swing < 45 % of the one before, tested). Each landing kicks `1.3·dx (×0.25 if perfect) + 0.06·vx`, × `min(1, crates/4)` × difficulty sway; clamped to ±0.32 unit. Offset at height y = `sway·((groundY − y)/towerH)^1.5`. `tower.swayA` (the spring's acceleration) drives the lanterns.

**Layout (landscape, 2026-11-19).** `saucerScreenY = max(0.17·h + 34, min(1.95u, max(1.72u, 0.60·h − 1.9u)))` and `topLine = max(0.60·h, saucerScreenY + 1.9u)`: Ziggy stays below the HUD panels, and the apple band (`topLine − saucerScreenY − 1.65u`) never closes (≥ 0.25u). 4:3 iPads get the full 1.95u with topLine 0.60·h; 16:9 gets 1.72u (960×540: 172 / 362 px, was 126 / 324). Portrait is unchanged.

**Camera.** Target `min(0, topY − crateH − topLine)`, a critically damped spring (ω = 5, no overshoot, tested monotonic) plus a guard that keeps the tower top at or below `topLine` in every frame (tested at 960×540, 560×1000, 720×1600). During `goal` it keeps following the tower (the show happens at the top). In `travel` it glides down with a C¹ smoothstep over 1.2 s while Granny Boo floats up, so she leaves the view quickly and the new level starts at the ground.

**Apples.** Each floats in screen space where the camera is heading (`baseY` follows at 3/s as the tower grows) and bobs `0.06 unit·sin(φ + 2.6t)`. It **rocks like a fruit hanging on a stem**: `rot = 0.14·cos(φ + 2.6t)`, a quarter period ahead of the bob (tilt is largest as it passes the middle, upright at the top and bottom of the bob). `frame` (0|1) flips 2.2 times/s for the leaf flutter. `glow` follows `light < 0.5` while floating and is frozen at collection. Collection = the falling crate's box overlaps the apple's circle (r 0.21 unit).

**Granny Boo.** Arrival: `x = x0 + (home.x − x0)·easeOutCubic(s)`, `y = y0 + (home.y − y0)·smoothstep(s)`, `s = (t − 0.35)/1.1`. Because x decelerates earlier than y, the path is a curved swoop down and in, and both components have zero speed at arrival (tested: last-step speed < 10 % of the peak), so the switch to hover is seamless. Home = tower top + (1.3, −0.45) unit (beside the top crate, inside a 6-unit-wide portrait). Hover: `y = home.y + 0.07 unit·sin(3.2·(t − 1.45))`. Out: she starts with the bob's current velocity and accelerates upward at 700u px/s² and outward at 40 % of that.

**Prediction.** `predictLanding()` replays the same integrator and sway spring with no RNG and no mutation (tested), so its dx equals the real landing's to 1e-6. Returns `{x, dx, perfect, ok, landY, topX, topW, tol, lit}`.

## 4. CONFIG (world.js)
| Key | Value | Why |
|---|---|---|
| step / maxFrame | 1/120 s / 0.25 s | ≈7 px per step at the fastest fall: crisp landings; a hidden tab doesn't fast-forward |
| baseW / baseH / baseTopFrac | 2.4 / 0.64 unit / 4/64 | DESIGN §2; crates sit on base.svg's flat top line |
| saucerSize / emitterDY / beamGap | 1.55 / 0.6 / 0.3 unit | Ziggy's drawn size; emitter (80,140) − body (80,78) = 62/160 × 1.55; a visible glow |
| flagH | 1.2 unit | pennant height (goal event y, flag light) |
| holdOmega / holdZeta | 18 rad/s / 0.6 | the crate "hangs" with a little lag, never wobbly |
| inherit | 0.3 (× difficulty) | the glow damps most of the swing; the drift stays readable |
| spinK | 0.0006 | a hint of spin from sideways speed |
| squashRef / Min / Max / Decay | 900u px/s / 0.15 / 0.65 / 7 per s | a cartoon thunk gone in 0.3 s |
| slideRate | 28 per s | perfect snap / assist slide, 95 % in 0.11 s |
| perfectSnapFloor | 6u px | the perfect zone never shrinks to nothing |
| comboCap / placePoints / perfectPoints / goalPoints | 5 / 10 / 10 / 100 | REQUIREMENT |
| **applePoints / appleGlowPoints / glowBelow** | 5 / 10 / 0.5 | REQUIREMENT: apples are worth double in the dark, a reason to keep stacking into the night |
| **pieEvery** | 5 apples | REQUIREMENT: a pie = +1 heart (replaces grow) |
| **apples** | max 3, life 3 drops, r 0.21 unit, band ≥ rocket + 0.8 unit and below the held crate, ≤ top − 0.45 unit, minGap 0.65 unit, bob 0.06 unit at 2.6 rad/s, rock 0.14 rad, flutter 2.2 frames/s, pair 0.25, onPath 0.7, follow 3 per s | apples sit in the fall gap; most can be grabbed with a good drop |
| **nightEnd** | 0.24 | darkest point: darkness alpha (1 − 0.24)·0.82 = 0.62, still readable (DESIGN: never black) |
| **lightRate** | 1 per s | 63 % of a change in 1 s: you see it get darker, never a jump |
| **darkNoise** | 0.7 | bot noise × (1 + 0.7·(1 − lit)): ×1.5 on an unlit night top. Normal skill-0.5 night misses 20 % → 31 % of drops (1.0 gave 34 %, too harsh); Easy skill-0.35 2 % → 8 % |
| **lightFalloff** | 2 | `(1 − d²/r²)²`, the shape of a soft radial gradient |
| **lights** | see §2 table; maxLanterns 10 | DESIGN §5.1 radii; 10 lanterns keep the darkness pass cheap |
| **lantern** | hookIn 0.12, hookDown 0.1, bodyDY 0.25 unit; ω 5.8 rad/s, ζ 0.12, kick 2.2 rad/s, maxRot 0.6 rad | hangs on the side face, inside the crate's height; a small paper lantern's natural swing |
| impactSpin / toppleSpin0 / releaseAngle / clearPush | 0.55 / 0.6 rad/s / 0.6 rad / 60u px/s | see the pivot model in §3 |
| slideAcc / bounce / bounceMin / groundFriction | 900u px/s² / 0.3 / 120u px/s / 0.65 | one soft "boing", then it rests |
| restFade / fadeTime | 0.55 / 0.4 s | the tumbled crate stays readable, then goes |
| swayOmega / swayZeta | 3.4 rad/s / 0.34 | springy but calm |
| swayKick / swayVxKick / perfectKick / swayHeightRef / swayMax | 1.3 per s / 0.06 / 0.25 / 4 crates / 0.32 unit | off-centre landings rock the tower, perfect ones settle it |
| camOmega | 5 rad/s | see the camera model |
| bobAmp / bobW | 0.04 unit / 2.2 rad/s | a gentle hover |
| tiltK / tiltMax / tiltRate | 0.00045 / 0.2 rad / 8 per s | leans into the swing |
| anim | drop 0.35, happy 0.8, oops 0.95 s | pose times |
| dropBuffer | 0.25 s | one early tap is kept, older taps are ignored |
| **goalTime / ghostIn / ghostArrive / ghostWaveOn / ghostWaveOff** | 3.0 / 0.35 / 1.45 / 1.7 / 2.8 s | the flag is seen first, then a 1.1 s swoop, then 1.1 s of waving |
| **ghostDX / ghostDY / ghostFrom** | 1.3 / −0.45 / 1.1 unit | beside the top crate (½ crate ≤ 0.75 + ½ ghost 0.45 + a gap); she floats down into place |
| **ghostBob / ghostBobW / ghostRiseAcc / ghostSide** | 0.07 unit / 3.2 rad/s / 700u px/s² / 1.0 | a soft ghostly hover, then an easy float away, drifting sideways as fast as she rises (0.4 let her float up through Ziggy) |
| travelTime / heartReward | 1.2 s / 1 | camera glide down; a heart back each level |
| loopSwing / loopSwingCap / loopG / loopGoal / loopTol / loopTolMin | 0.12 / 1.6 / 0.06 / 1 / 0.06 / 0.8 | loops get gently faster (fox-moon-stack playtest values) |

### Difficulty (`CONFIG.difficulty`, from the fox-moon-stack playtest; **bold** = changed by the 2026-11-19 playtest)
| | swing × | crate × | perfectTol (×w) | hearts | inherit × | sway × | assist |
|---|---|---|---|---|---|---|---|
| easy | **0.52** | **1.45** | 0.22 | 5 | 0.5 | 0.65 | 0.6 |
| normal | 1.0 | 1.0 | 0.15 | 3 | 1.0 | 1.0 | 0.5 |
| hard | 1.22 | 0.9 | 0.11 | 3 | 1.15 | 1.25 | **0.35** |

Why (docs/reports/playtest.md): a small kid's late tap costs v × delay, so Easy swings 13 % slower (4–5-year-old dawn clear 63 → 83 %, Easy adult dawn 41 → 47 s) with a wider crate (a wider stay window for noisy taps); Hard's assist 0.2 → 0.35 halves the surprise centre-of-mass topples (6.3 → 2.8 per 100 drops), and Hard stays hard.

### Times of day (`CONFIG.zones`)
| zone | key | light (start → end) | g (px/s² ×u) | swingW (rad/s) | drag (per s) | apple chance | goal |
|---|---|---|---|---|---|---|---|
| 0 | dawn | 0.85 → 1.0 | 760 | 1.75 | 0 | 0.55 | 10 |
| 1 | noon | 1.0 → 0.55 | 980 | 1.95 | 0.1 | 0.6 | 12 |
| 2 | sunset | 0.55 → 0.3 | 1120 | 2.2 | 0.15 | 0.6 | **13** (was 14) |
| 3 | night | 0.3 → 0.24 | 1220 | 2.35 | 0.1 | 0.65 | **15** (was 16) |

Sunset/Night goals: a 6-year-old on Easy took 93–110 s for them. The playtest proposed night 14; we kept 15 to soften the Normal-adult trade-off (shorter levels bring the faster loop 2 sooner: survival p50 357 → 297 s with 14).

Sunset and Night are a little gentler than fox-moon-stack's last planets (g 1250/1400, swing 2.3/2.5), because the dark is now part of the challenge.

### What that means at 960×540
| diff | zone | swing period | v max px/s | crate w | perfect ± px | fall | worst drift px | goal |
|---|---|---|---|---|---|---|---|---|
| easy | dawn | 6.90 s | 262 | 160 | 35.1 | ≈0.53 s | ≈21 | 10 |
| easy | noon | 6.20 s | 292 | 160 | 35.1 | ≈0.47 s | ≈20 | 12 |
| easy | sunset | 5.49 s | 329 | 160 | 35.1 | ≈0.44 s | ≈21 | 13 |
| easy | night | 5.14 s | 352 | 160 | 35.1 | ≈0.42 s | ≈22 | 15 |
| normal | dawn | 3.59 s | 504 | 110 | 16.5 | 0.53 s | 81 | 10 |
| normal | night | 2.67 s | 677 | 110 | 16.5 | 0.42 s | 84 | 15 |
| hard | dawn | 2.94 s | 615 | 99 | 10.9 | 0.53 s | 113 | 10 |
| hard | night | 2.19 s | 826 | 99 | 10.9 | 0.42 s | 117 | 15 |

(2026-11-19: Easy rows recomputed for swing 0.52 / crate 1.45; fall times and drift are scaled estimates, not re-measured. The landscape layout change keeps the drop height at 960×540 within 8 px of before.)

On Easy the worst-case drift (≈25 px) is a sixth of a crate, and the perfect zone is ±33 px: a child who taps when the crate is "over the tower" lands it.

## 5. Balance: the bot as a player model (`AC.Bot`)
- **Think** `(0.8 − 0.5·skill)·U(0.85, 1.15)` s, then **watch** `predictLanding().dx` every frame, estimate when it crosses the aim point and tap then plus a timing error τ ~ N(0, (1 − skill)·0.12 s).
- **Aim** error sd `(1 − skill)·0.12·w`; at skill ≥ 0.6 it leans its aim back against the tower's drift.
- **Darkness:** τ and the aim error are × `(1 + darkNoise·(1 − lit))`, with `lit` read when it starts watching. Lanterns therefore make the next drops more accurate in the sims, as they do for a person. At skill 1 there is no noise, so the expert bot is unaffected.
- **Hesitation** `0.55·(1 − skill)` (halving each time); **give-up** after 7 s.

Bot sims (20 seeds, 960×540, 5 min cap):

| difficulty | skill | dawn cleared | time to clear dawn | perfect | miss + topple per drop | levels in 5 min (p50) | game over within 5 min |
|---|---|---|---|---|---|---|---|
| **easy** | **0.35** | **20/20** | **36.1 s** | 57 % | 6.7 % | 7 | 0/20 |
| easy | 0.5 | 20/20 | 35.6 s | 71 % | 1.7 % | 7 | 0/20 |
| easy | 1 | 20/20 | 35.1 s | 100 % | 0 % | 8 | 0/20 |
| normal | 0.5 | 18/20 | 25.3 s | 31 % | 16.3 % | 2 | 20/20 |
| normal | 0.8 | 20/20 | 23.1 s | 53 % | 2.9 % | 9 | 1/20 |
| normal | 1 | 20/20 | 23.1 s | 94 % | 0 % | 11 | 0/20 |
| hard | 0.8 | 19/20 | 24.5 s | 30 % | 8.2 % | 6 | 13/20 |
| hard | 1 | 20/20 | 19.8 s | 94 % | 0.4 % | 9 | 0/20 |

- **Dawn is easy for a 6-year-old:** Easy + skill 0.35 clears it 20/20 (unit test: ≥ 80 %). With 5 hearts and pies (+1 heart per 5 apples) that player never reached game over in 5 minutes. The human-like `kid6` model in `tests/sim` (slower reactions, random and double taps) clears dawn in about 75 s on Easy.
- **Skill matters:** Normal costs a skill-0.5 player far more hearts than Easy (tested), and Night with no lanterns is clearly harder than Dawn for the same bot (Normal 0.5: 20 % → 31 % misses).
- **Speed:** 10 simulated minutes (bot + weather) run in ≈0.25 s.

## 6. Weather (`AC.Weather`)
Ambient particles live in **screen space**. Their counts are given at 960×540 and scaled by `clamp(√(area/960·540), 0.85, 1.35)`. Each one has a drifting base point `(bx, by)` plus its own oscillator, and the drawn `(x, y, rot)` comes from a small motion model:

| zone | particles | motion model |
|---|---|---|
| dawn | 8 `mist` (back only, 110–200 px, alpha 0.16–0.32) | slow sideways drift 4–11 px/s with a 3–7 px vertical breathing |
| dawn | 32 `petal` | **pendulum fall:** phase φ at 1.3–2.1 rad/s; `x = bx + A sin φ`, `y = by − 0.28A·sin²φ` (rises at the swing ends like a pendulum bob); sink speed `vy·(0.55 + 0.75 cos²φ)`, slowest at the ends where it "catches air"; tilt `rot = tilt·cos φ`, i.e. along its sideways velocity (tested: > 90 % sign agreement) |
| noon | 30 `leaf` | **tumbling:** spins at 1.6–3.4 rad/s (±15 % wobble); the sink is `vy·(1.25 − 0.6|cos rot|)`, so a leaf falls slower when broadside and faster edge-on; side glide `18·|cos rot|·sin rot` px/s plus a flutter `A sin φ` |
| noon | ≤ 4 `sparkle` glints | one every 0.4–1.3 s at a side position, 0.5–0.8 s life, alpha = sin envelope |
| sunset | 9 bats (`bat_0` wings up / `bat_1` wings down, ≈25 % front) | sine flight `y = by + A sin φ` across the screen at 45–80 px/s; **the wingbeat follows the vertical velocity**: climbing flaps at 7–16 frames/s, dipping glides at ≤ 2.5 (tested: climbing flap rate > 2× dipping). `flipX = vx < 0` (sprites face right), `rot` = half the flight-path angle. Each pass re-enters at a new height |
| sunset | 12 `leaf` | as noon |
| night | 24 `firefly` (`glow: true`) | **smooth wander:** velocity = two incommensurate sines per axis (0.35–1.5 rad/s) + a weak 0.15/s spring to a home point, so paths curve smoothly (max step < 3 px/frame, tested). **Blink:** a smooth `sin²` pulse that is on for 45 % of each 1.5–3.3 s cycle; alpha 0.12…1 × base |
| night | 18 `sparkle` twinkles (`glow: true`, sky above 50 %, never in the column) | alpha `base·(0.45 + 0.55·(½ + ½ sin))` |
| night | shooting star (`star` head + up to 18 `sparkle` trail pieces, `glow: true`) | every 6–10 s, 620–820 px/s at 18–32° |
| night | ≤ 3 `wisp` (`glow: true`, back) | one every 3–6 s from the lower sides; rises 14–24 px/s with a lazy sway, 6–9 s life, fades in 1 s and out 1.5 s |

- **Glow.** `glow: true` particles (fireflies, night twinkles, the shooting star and its trail, wisps; bursts with `{glow: true}`) are meant to be drawn **above the darkness layer**. Dawn and noon have none (tested).
- **Parallax.** When the camera rises, ambient base points shift down by 0.35 × the camera motion × depth.
- **Calm column.** About 35 % of drifting particles (25 % of bats) prefer the front layer. Inside the tower column (`|x − cx| < 1.6·unit`) they are drawn on the back layer instead, from the moment they spawn. Mist and twinkles are always back.
- **Level change.** `setLevel` crossfades (old particles fade over 0.9 s); `{instant}` switches at once.
- **Bursts.** `burst(sprite, x, y, n, {speed, life, size, gravity, spread, up, spin, layer, drag, angle, glow})` in world coordinates (`world: true`). Bursts never take the budget reserved for the ambient set or the timed effects.
- **Cap.** Always < 140 (tested for every zone at 960×540, 560×1000, 720×1600 and 1280×540 with a burst every 8 frames). Sprite names are exactly DESIGN §4.3 (tested).

## 7. Notes for the renderer / integrator
- **World fields:** `light`, `dayT`, `lightTint`, `apples` (total), `pieApples` (0..4), `lanterns` (getter: lantern crates in the tower), `appleList[]`, `ghost`, `flag`, `planet` (current zone params: `key, zone, loop, light, lightEnd, g, swingW, drag, appleChance, goal, perfectTol, inherit`), `saucer.scale` (always 1), `tower.swayA`.
- **Apple object:** `{id, x, y, prevX, prevY, r, t, frame, rot, prevRot, state:'float'|'collected'|'gone', glow, fade, baseY, sy, life, ph}`. Fade it by `fade` once it is `gone`.
- **Crate extras:** `lantern`, `lanternSide`, `lanternRot`, `prevLanternRot` (draw the lantern rotated by `lanternPos(c, alpha).rot` about the hook), `alpha`, `tx`, `pivot`, `onGround`.
- **Ghost object:** `{x, y, prevX, prevY, state:'in'|'hover'|'out', t, wave, side, vx, vy}` (centre of the 96×160 sprite = (48, 80)). Use `ghost_wave` while `wave`.
- **Events:** `drop, land, perfect, lantern, edge, miss, topple, heartLost, apple {apple, x, y, total, points, glow}, pie {hearts, gained}, combo, comboBreak, goal {x, y, bonus}, ghost, levelUp {level, zone}, spawn, gameOver`. `grow`, `shrink`, `coin` and `rocket` are gone.
- **Helpers:** `lights()`, `lanternPos(crate, alpha)`, `litAt(x, y)`, `predictLanding()` (+ `lit`), `swayOffset[Lerp]`, `setTower(dxs, {lanterns})` (test hook).
- **Weather:** call `weather.update(dt, world.cam.y)` and `weather.resize(VW, VH)`; draw `glow` particles after the darkness layer.
