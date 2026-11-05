# Bolt's Rooftop Flip — Mechanics

Code: `game/js/world.js` (`RF.World`, `RF.World.CONFIG`), `game/js/weather.js` (`RF.Weather`), `game/js/bot.js` (`RF.Bot`).
Contract: `docs/DESIGN.md` §2 and §5. Tests: `node tests/unit/run.js` (22 tests, about 5 s, includes 10 simulated minutes in about 0.35 s).

All three modules are classic scripts on `window.RF`, headless (no DOM or canvas), and deterministic: the same seed and the same `flip()` calls at the same simulated times give the same game at any frame rate. The world runs fixed sub-steps of 1/120 s. Every moving thing stores `prev*` at the start of each step, and the renderer lerps with `world.alpha`.

Units: px (logical, y down) and s. CONFIG lengths are in **units** (`layout.unit`, 100 at 960×540). Speeds and accelerations are given for unit = 100 and multiplied by `u = unit/100`, so the game plays the same on every screen.

## 1. Rules (what the player sees)
- Bolt runs at a fixed screen x (`layout.heroX`) while the city scrolls right to left. **One tap flips gravity**: he springs off, arcs across the corridor and clamps onto the other surface with a "clank".
- Two surfaces: the rooftops (`roofs[]`, line `floorY`) and the sky-rail (`rails[]`, underside `ceilY`). Gaps are the space between two spans. Vents stand on roofs, signs hang from the rail.
- Bump into a vent or sign: one battery, the obstacle squashes (`hit`), then 1.5 s of blinking safety.
- Fall through a gap (out of the corridor by 1.3 u): one battery. A drone swoops in, carries Bolt to the next safe stretch, then 1.5 s of safety.
- Fireflies: only Bolt's colour counts (+10 × mult). A wrong one zips away; on Normal and Hard it also resets the combo, on Easy nothing else happens.
- Paint gates change Bolt's colour, roughly every 8.5–13.5 s.
- About every 60–80 s there is a finish arch: bonus 100 × (zone + 1) × (loop + 1), +1 battery, and the next time of day starts without a stop. After Night it loops to Dawn, 8 % faster.
- No batteries left → `gameOver`, and the scroll eases to a stop over 0.6 s.

## 2. Motion model
| What | Model | Numbers at unit 100 |
|---|---|---|
| Scroll | `speed` eases (rate 0.6/s) toward `speedTarget(x)` = zone speed × difficulty × loop factor × (1 + 0.10·progress) | Normal: dawn 3.0 → night 4.29 u/s |
| Gravity | constant pull `g = 2200·u` px/s² toward the current surface (`grav` ±1) | — |
| Flip | `grav = −grav`, `vy = grav·kick` (140·u px/s): Bolt springs off, so there is no dead float at the top | crosses the 2.06 u between the standing lines in **0.374 s** (`flightTime()`), contact speed ≈ 962 px/s |
| Turn-over | `flipT` goes 0 ↔ 1 with a smoothstep over 95 % of the flight: slow start, fastest mid-air, settled just before the clank | — |
| Landing | crossing the standing line while supported: `vy = 0`, `squash = 0.7·speed/1000` (0.2–0.7), decays at 8/s (gone in ≈ 0.3 s) | full flip squash ≈ 0.67 |
| Support | supported while either paw (x ± 0.18 u) is over a span. A crack narrower than 0.36 u is simply run over. Sagging up to 0.12 u still "catches" on the far edge (a stumble); deeper means he is inside the wall, so he keeps falling. | — |
| Coyote / buffer | flip still allowed 0.12 s after running off an edge; a tap in the air is kept 0.18 s and fires on landing (one press) | — |
| Terminal speed | 1500·u px/s (only reached in gap falls) | — |
| Run cycle | `runPhase` advances 1 per 1.1 u of distance (frame = ⌊runPhase·4⌋) | ≈ 3 strides/s at Normal noon |
| Bump | box (0.5 u) vs obstacle hit box (80 % × 88 % of the drawn size × `hitK`). Sets `bumpT = 0` and `knock = 1` (decays 5/s, a wobble for the renderer); no positional knock-back, so a bump can never push him into a gap | — |
| Fireflies | hover `baseY + 0.08u·sin(2.4t)` with a tiny ±0.05 u drift. **Caught**: sucked toward his chest (rate 22/s) for 0.22 s. **Flee**: 2.2 u/s forward and 2.6 u/s away from his surface (up from the roof, down from the rail), accelerating 4.5 u/s² with a flutter, gone after 1.1 s | — |
| Drone rescue | `in` 0.45 s: smoothstep swoop from the upper left while Bolt's fall is damped (8/s). `carry` ≥ 0.9 s: smootherstep in y to the target surface, x locked to Bolt (the world keeps scrolling), `flipT` eased to the target side. Drop: grounded, `invuln` 1.5 s, `rescue`. `out` 0.6 s: accelerates away ahead | max drone motion < 12 px per step, Bolt < 8 px per step |
| Game over | `speed = v0·(1 − t/0.6)²` | — |

## 3. CONFIG (top of world.js; every value carries its unit and reason)
| Key | Value | Unit | Why |
|---|---|---|---|
| step | 1/120 | s | crisp landings: at 4.3 u/s Bolt moves 3.6 px per step |
| maxFrame | 0.25 | s | a hidden tab doesn't fast-forward |
| standOff / heroBox / foot | 0.42 / 0.50 / 0.18 | unit | DESIGN §5.1 body geometry |
| stepUp | 0.12 | unit | a narrow crack reads as a stumble, not a fall |
| g / kick | 2200 / 140 | px/s² / px/s (×u) | 0.374 s flight: snappy, but the arc is visible |
| maxVy | 1500 | px/s (×u) | terminal speed for gap falls |
| turnK | 0.95 | × flight | upside-down just before the clank |
| coyote / buffer | 0.12 / 0.18 | s | kid-friendly input (DESIGN) |
| fallOut | 1.3 | unit | out of the corridor = fall |
| squashRef / Min / Max / Decay | 1000 / 0.2 / 0.7 / 8 | px/s, —, —, 1/s | a cartoon "CLANK" that is gone in 0.3 s |
| knockDecay | 5 | 1/s | bump wobble for the renderer |
| stride | 1.1 | unit | run-cycle length |
| speedRamp / speedEase | 0.10 / 0.6 | ×, 1/s | +10 % across a level; level changes blend over ≈ 3 s |
| loopSpeed / loopSpeedCap | 0.08 / 1.4 | ×/loop, × | each round 8 % faster, at most 40 % |
| overStop | 0.6 | s | scroll stop at game over |
| invuln | 1.5 | s | blink after a bump or rescue |
| droneIn / carry / droneOut / hang | 0.45 / 0.9 / 0.6 / 0.72 | s, s, s, unit | rescue timing; hang = drone ↔ Bolt distance |
| catchDamp | 8 | 1/s | the fall eases out as the drone grabs him |
| rescueAhead | 1.6 (+ half a reaction) | unit | the drop spot has a clear run ahead |
| ffPoints / multEvery / multMax | 10 / 5 / 5 | pts, ff, × | REQUIREMENT |
| finishBonus / heartReward | 100 / 1 | pts, battery | REQUIREMENT |
| ff.* | r 0.22, bob 0.08 @ 2.4 rad/s, drift 0.05, caughtT 0.22, flee 2.2 / 2.6 / 4.5, fleeT 1.1, spacing 0.58, minGap 0.45 | unit, s | see §2 |
| gen.ahead / behind | 2.5 / 1.0 | screens | generated ahead, culled behind |
| gen.margin (m) | 0.8 | unit | fairness margin |
| gen.sameGap | 1.2 | unit | at least a 1.2 u building between two hazards on one surface |
| gen.finishClear / breather | 2.5 / 1.2 | unit, s | calm around each finish arch |
| gen.gateEvery / firstGate / gateClear | [8,13] / [6,9] / 0.8 | s, s, unit | gates every ≈ 8.5–13.5 s in play, posts on safe ground |
| gen.match / arcMatch / arcLead | 0.65 / 0.8 / 0.45 | —, —, unit | colour mix; flip-arc fireflies are mostly a reward |
| obstacles | vent 0.80×0.62 and 0.50×0.78; sign 0.80×0.66 and 0.55×0.70 | unit | DESIGN §4.1 drawn sizes |
| obHitW / obHitH | 0.8 / 0.88 | × | rounded corners and chains/smoke never "hit" |

### Difficulty (`CONFIG.difficulty`)
| | speed | hearts | reaction | gaps | gapShare | extra calm | catchK | hitK | wrong / hit breaks combo | safeStart |
|---|---|---|---|---|---|---|---|---|---|---|
| easy | ×0.78 | 5 | 1.8 s | 0.8–1.4 u | 30 % | 0.8–2.0 s | ×1.35 | ×0.6 | no / no | 3 s |
| normal | ×1.0 | 3 | 0.95 s | 0.8–1.9 u | 45 % | 0.2–1.1 s | ×1 | ×1 | yes / yes | 2 s |
| hard | ×1.15 | 3 | 0.7 s | 1.0–2.2 u | 50 % | 0.05–0.8 s | ×1 | ×1.05 | yes / yes | 2 s |

Gaps widen by +0.1 u per loop, capped at 2.2 u.

### Times of day (`CONFIG.zones`, zone = level % 4)
| zone | speed (u/s, ×1.1 by the arch) | seconds | alt | gapK | extraK | arc | line |
|---|---|---|---|---|---|---|---|
| dawn | 3.0 | 62 | 0.55 | 0.8 | 1.25 | 0.45 | 0.8 |
| noon | 3.3 | 68 | 0.6 | 1.0 | 1.1 | 0.5 | 0.8 |
| sunset | 3.6 | 72 | 0.65 | 1.1 | 1.0 | 0.55 | 0.75 |
| night | 3.9 | 76 | 0.65 | 1.15 | 0.95 | 0.6 | 0.75 |

`levelLen` (units) = seconds × the level's mean speed, so every difficulty takes the same time per level. Column meanings: `alt` is the chance the next hazard is on the other surface (that forces a flip). `gapK` scales gapShare, `extraK` scales the extra calm. `arc` and `line` are the chances of firefly patterns.

### What that means (unit 100, loop 0, from the generator)
| | dawn | noon | sunset | night |
|---|---|---|---|---|
| Easy: speed, flight distance, hazards/min | 2.34–2.57 u/s, 0.9 u, 19 | 2.6–2.8, 1.0, 22 | 2.8–3.1, 1.1, 23 | 3.0–3.4, 1.2, 22 |
| Normal | 3.0–3.3, 1.1–1.2, 31 | 3.3–3.6, 1.3, 33 | 3.6–4.0, 1.4, 35 | 3.9–4.3, 1.5, 34 |
| Hard | 3.5–3.8, 1.3–1.4, 36 | 3.8–4.2, 1.5, 43 | 4.1–4.6, 1.6, 39 | 4.5–4.9, 1.8, 43 |

Fireflies: about 2.5 per second on Easy and 3–4 per second on Normal and Hard. Gates: 6–7 per level.

## 4. Track generator and fairness (`_placeNext`, `_decorate`)
The track is made one hazard at a time (gap, vent or sign), always 2.5 screens ahead of the camera, and culled 1 screen behind. Each hazard on side A over `[x0, x1]` is placed at the smallest `x0` that meets every rule below, plus a random calm of `extra × extraK × S`.

`S` is the **upper bound** of the real speed there: the level's end speed, or the previous level's end speed in the first 35 % of a level, because the eased speed may still be higher there (Night → Dawn). `F = S · flightTime()` and `R = reaction · S`.

1. `x0 ≥ lastEnd[A] + 1.2 u`: a real building between two hazards on one surface.
2. `x0 ≥ lastEnd[B] + F + m`: the **other surface is clear from `x0 − F − m` to `x1 + m`**. You can fly over in time, and you land on a safe stretch.
3. `x0 ≥ lastStart[B] + F + R`: **two forced flips are at least a reaction time plus a flight apart.** After landing you get ≥ `reaction` s (Easy 1.4 s) before the next forced flip.
4. Start of a run (and after `gotoLevel`): no hazard before `safeStart·S + F` (Easy 3 s, others 2 s).
5. A finish arch has both surfaces clear ±2.5 u, then 1.2 s of calm.

Since the hazards come in order and never overlap, rule 2 gives "at every x at least one surface is solid and obstacle-free".

Decoration, in each stretch between hazards, using only the final track:
- **Gates**: the first x after the scheduled time where both surfaces are safe ±0.8 u, not within 2.5 u of a finish. The colour always changes.
- **Arc**: four fireflies on the exact flight path of the flip this hazard forces, starting 0.45 u before the latest flip point. They are 80 % matching.
- **Lines** (3–5 at 0.58 u) or **clusters** (a triangle of 3, one colour) on a surface that is safe across them.

Fireflies never sit in an obstacle (circle vs drawn box + 0.12 u) or on a gate or arch. About 65 % match the colour that will be in force at their x.

The tests check all of this on 9 × 3 long tracks (every difficulty, loops 0..2, about 5,700 hazards): every rule, a 0.05 u scan of "one surface safe", finish clearance, gate colours, firefly placement and the match share.

## 5. The bot (`RF.Bot`, player model for autoplay and pacing)
- Standing on side A, it reads `hazardAhead(A, x − 0.18u, …)` and flips when the hazard is within `flightDist + lead − speed·τ`, where lead = (0.4 + 0.5·(1 − skill)) u.
- τ ~ N(0, (1 − skill)·0.15 s) is drawn once per hazard. With probability 0.3·(1 − skill) there is also an **attention lapse**: +0.1–0.4 s + 0.5·(1 − skill) s late.
- It never flips into trouble. The landing stretch on B, from x + F/2 to x + F + 0.8 u, must be clear, otherwise it waits.
- Coyote save if it ran off an edge. After each landing it pauses 0.1 + 0.25·(1 − skill) s.
- skill ≥ 0.6: optional flips when the other surface holds ≥ 2 more matching fireflies (wrong ones count −1.5 on Normal/Hard) and stays hazard-free for F + 3.5 u.

Measured (unit 100, 6 seeds × 10 min, real batteries; `hits` = bumps + falls):
| | skill 1 | skill 0.8 | skill 0.5 (casual) | skill 0.3 |
|---|---|---|---|---|
| Easy | 0 hits, all 10 min | all 10 min | median 10 min (min 4 min), ≈ 1.1 hits/min | median 3.4 min |
| Normal | 0 hits, all 10 min | all 10 min | median ≈ 3 min, ≈ 1.7 hits/min | median ≈ 1.5 min |
| Hard | 0 hits, all 10 min | median 10 min (one run ended at 6.4 min) | median ≈ 1.5–3.5 min, ≈ 2.4 hits/min | ≈ 1.3 min |

Skill 1 also stays at zero hits with a resize every 1.7 s for 3 min (portrait and landscape).

## 6. Level pacing
Measured with the bot: **62, 68, 72, 76 s** for dawn, noon, sunset and night on every difficulty and every loop (one round ≈ 4.6 min). Everything stays inside the 60–80 s aim.

**Easy for a 6-year-old**: dawn on Easy is 2.3 u/s, 19 hazards a minute (one about every 3 s), only 30 % × 0.8 of them gaps and those at most 1.4 u wide. There are ≥ 1.4 s between forced flips, the first 3 s are empty, there are 5 batteries, a ×1.35 catch radius and a ×0.8 hit box, wrong fireflies never break the combo, and every arch gives a battery back. A casual-skill bot survives Easy for about 10 minutes.

## 7. Weather (`RF.Weather`)
Particles are in screen space with a hard cap of 139. Counts are given at 960×540 and scaled by √(area ratio), clamped to 0.85–1.35, so 720×1600 portrait gets ×1.35 (≤ 80 ambient).

Each ambient particle drifts left by `depth × scrollSpeed`: stars 0.02, back 0.2, front 1.1.

| zone | particles | tint |
|---|---|---|
| dawn | 9 mist wisps (back, alpha ≤ 0.28) + 12 dew sparkles (back, twinkle) | `rgba(255,170,190,0.05)` |
| noon | 22 dandelion seeds (sway, 30 % front) + 4 tumbling leaves | none |
| sunset | 24 warm motes rising (back only) + 8 leaves | `rgba(255,130,60,0.06)` |
| night | 34 stars twinkling in the sky band only (y < ceilY − 0.5 u) + 10 dim sparkles + a shooting star (`shoot`, with `rot`) every 6–10 s with a sparkle trail | `rgba(30,50,140,0.08)` |

Front-layer ambient particles are small, at most alpha 0.5, and never glowing coloured dots. `burst()` is screen-space and stays put by default; `opts.scroll` sets the share of the scroll it follows. Bursts never take the room the ambient set needs. `setLevel` fades the old set out over 0.9 s (instant on request). `resize` keeps relative positions and trims or tops up the counts.

## 8. Notes for the renderer and integrator (fields beyond DESIGN §5)
- **world**: `hazards[] {kind, side, x0, x1, ob}` (for debug overlays). Pure helpers: `standY(side)`, `clearRange(side, a, b)`, `safeAt(side, x)`, `speedTarget(x)`, `levelBase(level)`, `levelUnits(level)`. `plans[]` holds the level spans `{level, startX, finishX}` (the previous one is kept). `world.finish` switches to the next arch the moment Bolt passes one, so to keep drawing the arch he just ran through as it scrolls away, draw every visible `plans[i].finishX`.
- **hero**: `prevX`, `coyote`, `buffer`, `knock` (0..1 bump wobble), `turn` (internal). `flipT` is already eased; draw the rotation as `π·flipT` (or a vertical flip at 0.5) and the body at `lerp(prevY, y, alpha)`.
- **firefly**: `baseX` and `ph2` (drift phase). `caught` fireflies move into Bolt's chest for 0.22 s, so shrink or fade them with `t / 0.22`. `flee` ones fade with `t / 1.1`.
- **drone**: `flipY` (true when it carries Bolt **up to the rail** from below: draw it upside-down under him) and `side` (the target surface). In `carry` Bolt hangs `0.72 u` below it (or above it if `flipY`).
- **Events**: `land.speed` ≈ 960 for a full flip and smaller for a stumble (scale the clank). A bump or fall on Normal/Hard also emits `comboBreak` when the combo was ≥ 2 (Easy keeps the combo). `gotoLevel` emits `levelUp` with `bonus: 0`.
- `setLayout(w, h)` keeps everything at the same place in units (x scaled by the unit ratio, y kept relative to the corridor mid-line). It zeroes the lerp and generates ahead for wider screens. Call it on every resize or rotate.
- `setTrack(spec)` (tests): x in units relative to Bolt. `{roofs:[[a,b]], rails:[[a,b]], obstacles:[{kind, variant, x}], fireflies:[{x, side:'floor'|'ceil'|'mid', dy, color}], gates:[{x, color}], finish}`. It turns the generator off.

## 9. Changes after QA (2026-11-05)
- Playtest (docs/reports/playtest.md): Easy `reaction` 1.4 → 1.8 s, `extra` [0.5, 1.6] → [0.8, 2.0] s, `hitK` 0.8 → 0.6 (the kid model now finishes Dawn 93 % / Noon 52 %); firefly lines are one colour each (`gen.lineMono`), so reading the colour now pays off.
- Visual QA: the fall line is capped to stay on screen (`_fallY`: ≤ height − 0.45 u, ≥ 0.75 u), the dangle is clamped on screen and `catchDamp` 8 → 18, so the whole drone rescue is visible on 16:9.
- Portrait `midY` 0.50·h → 0.47·h (less empty sky above the rail).
