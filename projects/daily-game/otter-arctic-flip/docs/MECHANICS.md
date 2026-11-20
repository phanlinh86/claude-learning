# Ollie's Lighthouse Flip — Mechanics

Code: `game/js/world.js` (`OF.World`, `OF.World.CONFIG`), `game/js/weather.js` (`OF.Weather`), `game/js/bot.js` (`OF.Bot`).
Contract: `docs/DESIGN.md` §2 and §5. Tests: `node tests/unit/run.js` (27 tests, about 7 s, including 10 simulated minutes in about 0.3 s). Pacing sims: `node tests/sim/run.js` (about 25 s on 2 cores, writes `tests/sim/results/floors.md`).

Built from Bolt's Rooftop Flip (`../robot-rooftop-flip/`), whose flip physics, generator, fairness rules, rescue and tuned Easy preset are kept unchanged. Colour matching (paint gates, hero colour, wrong fireflies) is gone. Two things are new: fireflies became **leaves** that flutter like little pendulums, and the day-to-night **visibility twist** was added.

All three modules are classic scripts on `window.OF`. They are headless (no DOM or canvas) and deterministic: the same seed and the same `flip()` calls at the same simulated times give the same game at any frame rate. The world runs fixed sub-steps of 1/120 s. Everything that moves stores `prev*` at the start of each step, and the renderer lerps with `world.alpha`.

Units are px (logical, y down) and s. CONFIG lengths are in **units** (`layout.unit`, which is 100 at 960×540). Speeds and accelerations are given for unit = 100 and multiplied by `u = unit/100`, so the game plays the same on every screen.

## 1. Rules (what the player sees)
- Ollie runs at a fixed screen x (`layout.heroX`) while the lighthouse floor scrolls from right to left. **One tap flips gravity**: he springs off, arcs across the corridor and lands on the other surface with a soft "fwump".
- There are two surfaces: the floor (`roofs[]`, line `floorY`) and the ceiling beam (`rails[]`, underside `ceilY`). An open hatch is the space between two spans. Floor props (`vent`: snowball pile, crate stack) stand on the floor, and ceiling props (`sign`: mitten line, plant basket) hang from the beam.
- Bumping a prop costs one heart. The prop squashes (`hit`), and then Ollie gets 1.5 s of blinking safety.
- Falling through a hatch (leaving the corridor by 1.3 u) also costs one heart. Pip the puffin (`drone`) swoops in, carries Ollie to the next safe stretch, and then he gets 1.5 s of safety.
- **Leaves**: every leaf counts, +10 × mult. mult = 1 + ⌊combo/5⌋, up to ×5. A bump or a fall **resets** the combo on Normal and Hard and **halves** it on Easy.
- About every 60–80 s there is a stairway door: bonus 100 × (zone + 1) × (loop + 1), +1 heart, and the next floor (a later time of day) starts without a stop. After the Lantern Deck the next day starts at the Boot Room, 8 % faster.
- No hearts left → `gameOver`, and the scroll eases to a stop over 0.6 s.

## 2. Motion model
| What | Model | Numbers at unit 100 |
|---|---|---|
| Scroll | `speed` eases (rate 0.6/s) toward `speedTarget(x)` = zone speed × difficulty × loop factor × (1 + 0.10·progress) | Easy dawn 2.34 → 2.57 u/s; Normal 3.0 → night 4.29 u/s |
| Gravity | constant pull `g = 2200·u` px/s² toward the current surface (`grav` ±1) | — |
| Flip | `grav = −grav`, `vy = grav·kick` (140·u px/s): Ollie springs off, so there is no dead float | crosses the 2.06 u between the standing lines in **0.374 s** (`flightTime()`), contact speed ≈ 962 px/s |
| Turn-over | `flipT` goes 0 ↔ 1 with a smoothstep over 95 % of the flight: slow start, fastest mid-air, settled just before landing | — |
| Landing | crossing the standing line while supported: `vy = 0`, `squash = 0.7·speed/1000` (0.2–0.7), decays at 8/s | full flip squash ≈ 0.67 |
| Support | supported while either paw (x ± 0.18 u) is over a span. Cracks narrower than 0.36 u are run over. A sag of up to 0.12 u still catches on the far edge (a stumble). | — |
| Coyote / buffer | a flip is still allowed 0.12 s after running off an edge; a tap in the air is kept for 0.18 s and fires on landing | — |
| Bump | box (0.5 u) against the prop's hit box (80 % × 88 % of the drawn size × `hitK`). Sets `bumpT = 0` and `knock = 1` (decays at 5/s). There is no knock-back, so a bump can never push Ollie into a hatch. | — |
| **Leaf flutter** | a pendulum on an invisible string of length `L = 0.25 u`: `θ = swing·sin(ω·time + phase)` with swing 0.5–0.8 rad and ω 2.2–3.0 rad/s per leaf. `x = baseX + L·sin θ`, `y = baseY − L·(1 − cos θ) + 0.06u·sin(1.1·time + ph2)`, `rot = 1.2·θ`, `face = sign(dθ/dt)` | sways ±0.18 u, rises ≤ 0.08 u at the ends of the swing, bobs ±0.06 u; ≤ 0.6 px of motion per step |
| **Leaf caught** | spirals into Ollie's hit centre over **0.35 s**: radius `r0·(1 − e)` and angle `a0 ± 2π·e`, with one shared `e = smoothstep(t/0.35)`. It also spins at 14 rad/s, then goes to `gone`. | ≤ 10 px per step relative to Ollie, one full turn |
| Pip rescue | `in` 0.45 s: a smoothstep swoop from the upper left while Ollie's fall is damped (18/s) and kept on screen. `carry` ≥ 0.9 s: smootherstep in y to the target surface while `flipT` eases toward it. Drop: grounded, `invuln` 1.5 s, `rescue` event. `out` 0.6 s: accelerates away ahead. | Pip < 12 px per step, Ollie < 8 px per step |
| Headlamp | `hero.lamp = (x + 0.208u, y − 0.144u·cos(π·flipT))`, with `prevX`/`prevY` for the lerp (§6) | — |
| Game over | `speed = v0·(1 − t/0.6)²` | — |

**Why the leaf `y` has a minus sign.** DESIGN §5.1 writes `y = baseY + L(1 − cos θ)`, but with y pointing down that would make the leaf sink at the ends of its swing. A real hanging pendulum (and a real falling leaf rocking in the air) is **lowest in the middle** of the swing and rises at both ends, so the code uses `−`. `baseY` is the lowest point. The swing is driven by world time, so it is deterministic and the same at any frame rate.

## 3. CONFIG (top of world.js; every value carries its unit and reason)
| Key | Value | Unit | Why |
|---|---|---|---|
| step / maxFrame | 1/120 / 0.25 | s | crisp landings; a hidden tab doesn't fast-forward |
| standOff / heroBox / foot / stepUp | 0.42 / 0.50 / 0.18 / 0.12 | unit | body geometry (sprite feet line on the surface) |
| lampDx / lampDy | +0.208 / −0.144 | unit | headlamp lens (92, 44) in the 128 px sprite drawn at 0.95 u, anchored by its feet as render.js does |
| g / kick / maxVy | 2200 / 140 / 1500 | px/s², px/s (×u) | a 0.374 s flight: snappy, but the arc stays visible |
| turnK | 0.95 | × flight | he is upside-down just before he lands |
| coyote / buffer | 0.12 / 0.18 | s | kid-friendly input (DESIGN) |
| fallOut | 1.3 | unit | out of the corridor = fall (capped on screen) |
| squash* / knockDecay / stride | 1000, 0.2, 0.7, 8 / 5 / 1.1 | — | a cartoon fwump that is gone in 0.3 s; run cycle |
| speedRamp / speedEase / loopSpeed / loopSpeedCap | 0.10 / 0.6 / 0.08 / 1.4 | — | +10 % across a floor; each day 8 % faster, at most +40 % |
| invuln / overStop | 1.5 / 0.6 | s | blink after a hit; stop at game over |
| droneIn / carry / droneOut / hang / catchDamp / rescueAhead | 0.45 / 0.9 / 0.6 / 0.72 / 18 / 1.6 | s, unit, 1/s | Pip's rescue |
| leafPoints / multEvery / multMax / finishBonus / heartReward | 10 / 5 / 5 / 100 / 1 | — | REQUIREMENT |
| leaf.r / len / swing / omega | 0.22 / 0.25 / 0.5–0.8 / 2.2–3.0 | unit, rad, rad/s | DESIGN §5.1 pendulum; a lazy 2.1–2.9 s period that a child can follow |
| leaf.bob / bobW / tilt | 0.06 / 1.1 / 1.2 | unit, rad/s, × | slow bob out of step with the swing, so the motion never looks mechanical |
| leaf.caughtT / turns / spin | 0.35 / 1.0 / 14 | s, turns, rad/s | the caught spiral |
| leaf.spacing / minGap / obClear | 0.58 / 0.45 / 0.32 | unit | lines; no overlaps; the **whole swing** stays clear of props |
| light.min / lampsBelow / viewEase | 0.3 / 0.75 / 1.2 | —, —, 1/s | DESIGN: never darker than 30 %; lamps below 75 %; `lightView` settles in ≈ 2.5 s |
| light.seeExtra / beamMin | 0.8 / 3.2 | unit | visibility rule (§6) |
| light.lampEvery / lampDoorClear | 3.5–5.0 / 1.0 | unit | wall lamps, never right on a stairway door |
| gen.* | ahead 2.5 scr, behind 1 scr, margin 0.8 u, sameGap 1.2 u, finishClear 2.5 u, breather 1.2 s, arcLead 0.45 u, maxGapUnit 2.2 u | — | fairness (§4) |
| obstacles | vent 0.80×0.62 and 0.50×0.78; sign 0.80×0.66 and 0.55×0.70 | unit | DESIGN §4.1 drawn sizes |
| obHitW / obHitH | 0.8 / 0.88 | × | rounded corners and cords never "hit" |

### Difficulty (`CONFIG.difficulty`)
| | speed | hearts | reaction | hatches | gapShare | extra calm | catchK | hitK | comboKeep | safeStart |
|---|---|---|---|---|---|---|---|---|---|---|
| easy | ×0.78 | 5 | 1.8 s | 0.8–1.4 u | 30 % | 0.8–2.0 s | ×1.35 | ×0.6 | 0.5 (halves) | 3 s |
| normal | ×1.0 | 3 | 0.95 s | 0.8–1.9 u | 45 % | 0.2–1.1 s | ×1 | ×1 | 0 (resets) | 2 s |
| hard | ×1.15 | 3 | 0.7 s | 1.0–2.2 u | 50 % | 0.05–0.8 s | ×1 | ×1.05 | 0 (resets) | 2 s |

Hatches widen by +0.1 u per loop, capped at 2.2 u. Easy is Rooftop Flip's playtested 4–6-year-old preset. The game starts on Easy by default (main.js).

### Floors (`CONFIG.zones`, zone = level % 4)
| zone | floor | speed (u/s, ×1.1 by the door) | seconds | alt | gapK | extraK | arc | line | light from → to |
|---|---|---|---|---|---|---|---|---|---|
| dawn | Boot Room | 3.0 | 62 | 0.55 | 0.8 | 1.25 | 0.45 | 0.8 | 0.78 → 0.95 |
| noon | Greenhouse | 3.3 | 68 | 0.6 | 1.0 | 1.1 | 0.5 | 0.8 | 1.00 → 0.88 |
| sunset | Map Library | 3.6 | 72 | 0.65 | 1.1 | 1.0 | 0.55 | 0.75 | 0.72 → 0.48 |
| night | Lantern Deck | 3.9 | 76 | 0.65 | 1.15 | 0.95 | 0.6 | 0.75 | 0.40 → 0.32 |

`levelLen` (units) = seconds × the floor's mean speed, so a floor takes the same time on every difficulty. `alt` is the chance that the next hazard is on the other surface, which forces a flip.

Measured density per minute of play (`node tests/sim/run.js --only density`):
| | dawn | noon | sunset | night |
|---|---|---|---|---|
| Easy: hazards / forced flips / hatch % / leaves | 16 / 9 / 35 / 134 | 18 / 10 / 23 / 139 | 18 / 11 / 27 / 151 | 18 / 12 / 23 / 174 |
| Normal | 30 / 16 / 36 / 196 | 33 / 18 / 43 / 228 | 31 / 23 / 51 / 206 | 34 / 21 / 49 / 225 |
| Hard | 38 / 23 / 42 / 222 | 41 / 25 / 39 / 258 | 43 / 27 / 49 / 250 | 45 / 28 / 56 / 289 |

There are 38–84 wall lamps per floor, one every 4.25 u on average.

## 4. Track generator and fairness (`_placeNext`, `_decorate`) — unchanged from Rooftop Flip
The track is built one hazard at a time (hatch, floor prop or ceiling prop), always 2.5 screens ahead of the camera, and culled 1 screen behind. Each hazard on side A over `[x0, x1]` takes the smallest `x0` that meets every rule below, plus a random calm of `extra × extraK × S`. Here `S` is the upper bound of the real speed (the floor's end speed, or the previous floor's end speed in the first 35 % of a floor), `F = S·flightTime()` and `R = reaction·S`.
1. `x0 ≥ lastEnd[A] + 1.2 u`: solid surface between two hazards on one side.
2. `x0 ≥ lastEnd[B] + F + m`: **the other surface is clear from `x0 − F − m` to `x1 + m`**.
3. `x0 ≥ lastStart[B] + F + R`: **two forced flips are at least a reaction time plus a flight apart**.
4. Start of a run (and after `gotoLevel`): no hazard before `safeStart·S + F`.
5. A stairway door has both surfaces clear ±2.5 u, followed by 1.2 s of calm.

So at every x at least one surface is solid and free of props.

Leaves are placed using only the final track:
- **Arc**: 4 leaves on the exact flight path of the flip this hazard forces.
- **Line**: 3–5 leaves, 0.58 u apart, on a surface that is safe across the whole line.
- **Cluster**: a triangle of 3.

Each pattern is one leaf kind, cycling green → gold → red (`kind` 0..2). A leaf's whole swing stays ≥ r + 0.32 u from every prop. The run starts with a line of 3 leaves on the floor 2.6 u ahead.

The tests check all of this on 27 long tracks (every difficulty, loops 0..2, about 5,400 hazards). That covers every rule, a 0.05 u scan for "one surface safe", door clearance and the leaf-swing envelope against every prop.

## 5. The bot (`OF.Bot`)
- Standing on side A, it reads `hazardAhead(A, x − 0.18u, …)` and flips when the hazard is within `flightDist + lead − speed·τ`, where `lead = (0.4 + 0.5·(1 − skill))` u. `τ ~ N(0, (1 − skill)·0.15 s)` is drawn per hazard. With chance 0.3·(1 − skill) it has an attention lapse of +0.1–0.4 s + 0.5·(1 − skill) s.
- It never flips into trouble: the landing stretch (x + F/2 to x + F + 0.8 u) must be clear, otherwise it waits. It does a coyote save if it ran off an edge.
- At skill ≥ 0.6 it makes optional flips when the other surface holds ≥ 2 more fluttering leaves than its own side over the next 2.5 u, and stays hazard-free for F + 3.5 u.

Measured in the unit tests: skill 1 takes **0 hits in 2 × 10 min** on every difficulty (also with a resize every 1.7 s). A casual bot (skill 0.5) takes about 0.6 hits/min on Easy, 2.2 on Normal and 2.1 on Hard.

## 6. Visibility (the day-to-night twist)
- `world.light = clamp(lerp(lightFrom, lightTo, progress), 0.3, 1)`. It is a pure function of floor and progress (`lightAt(level, p)`), so it is monotonic within a floor. It jumps at a door, where the scene crossfades anyway. `world.lightView` is the same value eased at 1.2/s; **the renderer should draw darkness from `lightView`** so a door never pops.
- `world.lampsOn = light < 0.75`. It is false in dawn and noon and true from the very start of every sunset and night floor. The `{type:'lampsOn', level, zone, light}` event fires **once per floor, when lampsOn turns from false to true**. In play that is the first step of each sunset floor, right after its `levelUp`. A world created on a dark floor (or Night following Sunset) starts with lamps already on and no event.
- `lamps[] {id, x, side:'ceil'|'floor'}`: one every 3.5–5 u, alternating high and low, never within 1 u of a door. They come from their own RNG stream (`rng.fork('lamps')`), so they never change the track and are identical for a seed. They are generated as far ahead as the track and culled 1 screen behind. Draw them always; light them when `lampsOn`.
- Every prop has `beacon: true`. Hatch beacons sit on the span ends (`roofs[i].x1` / `x0`, `rails[i]…`).
- **Visibility rule.** `seeAheadUnits()` = `(reaction·S + S·flightTime)/unit + 0.8`, where S is the floor's top speed (and never below the current speed, which a test checks over a whole floor). `beamUnits()` = `min(max(seeAhead, 3.2), screenReachUnits())`, where `screenReachUnits()` = `(width − heroX)/unit`.
  - Landscape (960×540, 1280×540, 960×720), Normal and Hard: seeAhead is 6.1–6.5 u and fits on screen (reach 7.1 u, or 9.5 u at 1280 wide).
  - **Easy** (reaction 1.8 s) on sunset/night and on later days needs 7.5–11 u. **Every portrait layout** (reach 4.7 u) needs more than the screen shows, even in daylight. In those cases the beam is **clamped to the screen edge**: the whole visible run ahead is lit, so the darkness never hides anything that daylight would show, and beacons glow beyond the beam on both surfaces. The test lists the clamped cases (84 of 144 layout × difficulty × floor combinations).
- Headlamp: `hero.lamp {x, y, prevX, prevY}` is the lens in world space: `x + 0.208u` and `y − 0.144u·cos(π·flipT)`. That puts the lens ahead and above on the floor, ahead and below on the ceiling, and moves it smoothly during the turn-over. It matches render.js's sprite anchor (feet line on the surface). If the renderer adds the tilt or the squash, rotate the offset the same way. Aim the beam along +x from `lamp`.

## 7. Weather (`OF.Weather`)
Particles live in screen space with a hard cap of 139. Counts are given at 960×540 and scaled by √(area ratio), clamped to 0.85–1.35. At 720×1600 that is ×1.35, at most 80 ambient particles.

| zone | back layer (outside, behind the wall: shows through the windows) | front layer (inside, ≤ alpha 0.45) | tint |
|---|---|---|---|
| dawn | 24 `snow` (light, swaying fall) | 8 `mote` | `rgba(255,176,196,0.05)` |
| noon | 26 `flake` (drifting, twinkling, turning ice sparkles) | 10 `mote` | none |
| sunset | 30 `snow` (gentler, slower fall) | 8 `mote` | `rgba(255,140,70,0.07)` |
| night | 26 `snow` + 22 `star` (twinkling in the upper window band) + 5 `aurora` wisps (big, slow, breathing, upper band) | 6 tiny `sparkle` | `rgba(40,60,150,0.08)` |

- Front particles stay in the corridor's air (between ceilY and floorY). They use only `mote` (pale warm white) and `sparkle` (white), never leaf colours, and are small (4–8 px).
- Stars and aurora stay in the upper window band (about 0.14–0.43 H). The window band of mid.svg is y 170–330 of 540, scaled with H.
- Depth: each particle also drifts left by `depth × scrollSpeed` (stars 0.02, aurora 0.05, snow and flakes 0.15, motes 1.0).
- The Rooftop sprites `mist`, `seed`, `leaf` and `shoot` are no longer used, and there is no shooting star.
- `burst(sprite, …)` works as before (`bit_0..2`, `puff`, `sparkle`, `star`, `glow`) and never takes the room the ambient set needs.
- `setLevel` fades the old set out over 0.9 s. `resize` keeps relative positions and re-bands the particles.

## 8. Pacing (sims, `node tests/sim/run.js`, 40 rounds × ≤ 400 s per row)
Seconds per floor are **62 / 68 / 72 / 76** on every difficulty (inside the 45–90 s aim).

| Easy | clear floor 1 / 2 / 3 / 4 | hearts left at door 1 | hits/min |
|---|---|---|---|
| kid, struggling 4 y | 75 / 35 / 8 / 0 % | 3 | 3.3 |
| kid 4–6 (base) | **88** / 48 / 13 / 5 % | 3 | 2.6 |
| kid, steady 6 y | **100** / 83 / 58 / 40 % | 3 | 1.6 |
| casual adult | 100 / 100 / 100 / 100 % | 5 | 0.2 |
| spam a tap every 250 / 400 ms | 0 / 3 % clear floor 1 (dies in ≈ 35 s) | — | 8.5 |
| never taps | 3 % | — | 7.9 |

On Normal a casual adult clears floors 1–4 in 88 / 78 / 58 / 55 % of rounds, and on Hard in 75 / 50 / 35 / 20 %. Spamming never pays.

Kid hits on Easy come from random taps (31 %), double taps (18 %), misreads (17 %), forgetting (14 %) and chasing leaves (9 %). A late planned tap causes only 6 % (`node tests/sim/causes.js`). Determinism (same seed twice, and a replay by sub-step index) holds for every difficulty.

## 9. Notes for the renderer and integrator (API vs Rooftop Flip)
- **Removed**: `world.gates[]`, `world.fireflies[]`, `hero.color`, events `wrong` and `gate`, `stats.wrong` and `stats.gates`, `difficulty.wrongBreaks` and `hitBreaks`, `CONFIG.ff`, `CONFIG.gen.gateEvery/firstGate/gateClear/match/arcMatch/lineMono`, and `ffPoints` (now `leafPoints`). `setTrack` no longer takes `fireflies`/`gates`.
- **Leaves**: `world.leaves[] {id, x, y, prevX, prevY, baseX, baseY, kind, r, phase, swing, rot, prevRot, state:'fly'|'caught'|'gone', t}`, plus the extras `omega`, `len`, `ph2`, `face` (±1: mirror the sprite horizontally when it changes for the flutter) and `sp` (the caught spiral). Draw at `lerp(prev, cur, alpha)` and rotate by `lerp(prevRot, rot)`. Fade or shrink a caught leaf with `t / 0.35`.
- **Events**: `catch {leaf, x, y, combo, mult, points}` (was `ff`), `comboBreak {combo, to}` (`to` = 0 on Normal/Hard, half on Easy; fired when combo ≥ 2), new `lampsOn {level, zone, light}`, `finish {x, bonus}`. The rest are unchanged: `flip, land, combo, bump, fall, rescue, heartLost, heartGain, levelUp, gameOver`.
- **Visibility**: `light`, `lightView` (draw darkness from this one), `lampsOn`, `lamps[]`, `obstacle.beacon`, `seeAheadUnits(level?)`, `beamUnits()`, `screenReachUnits()`, `lightAt(level, progress)`, `hero.lamp {x, y, prevX, prevY}`.
- **getState()** adds `light, lampsOn, leaves` (alive count), `seeAhead`, `hero.lamp`, `counts.leaves` and `counts.lamps`. It drops `hero.color`, `counts.fireflies` and `counts.gates`.
- **Weather sprites**: `snow, flake, mote, sparkle, star, aurora` (ambient) and whatever bursts use (`bit_0..2`, `puff`, `glow`, …). Draw `back` particles **before** `mid.svg` (behind the wall) and `front` particles after the hero.
- Unchanged: `hazards[]`, `plans[]` (draw every visible `plans[i].finishX` door), `standY/clearRange/safeAt/hazardAhead/flightTime/flightDist/speedTarget/levelBase/levelUnits`, the `drone` fields (`flipY`, `side`), `setLayout(w, h)` (also rescales leaves, lamps and the spiral) and `gotoLevel(i)`, which emits `levelUp {bonus: 0}` and then `lampsOn` if the jump turns the lamps on.
- `setTrack(spec)` (tests): `{roofs, rails, obstacles:[{kind, variant, x}], leaves:[{x, side:'floor'|'ceil'|'mid', dy, kind, still}], finish}`. `still: true` gives a leaf that holds still, for exact tests. Lamps keep generating while the track generator is off.
