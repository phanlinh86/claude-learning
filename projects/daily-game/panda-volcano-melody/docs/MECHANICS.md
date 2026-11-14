# Tofu's Volcano Melody — mechanics and tuning

Code: `game/js/world.js` (simulation), `game/js/weather.js` (particles), `game/js/bot.js` (autoplayer).
Contract: `docs/DESIGN.md` §5. Tests: `node tests/unit/run.js` (27 tests, ~10 s).

## 1. Simulation frame
- Fixed sub-step **1/120 s** with an accumulator; `update(dt)` takes any dt (capped at 0.25 s), `alpha` = leftover / step.
  Every moving thing saves `prevX/prevY` (and `prevZ`) at the start of each step, so the renderer can interpolate.
- Deterministic: the seeded `PVM.RNG` is split with `fork()` into a world stream (spawns, landing spots, note kinds)
  and a crab stream (moods, wander spots). That way the crab AI never shifts where notes spawn.
- Ground plane + height: `x, y` = ground point, `z` = height above it. All collisions are circles on the ground.

## 2. Tuning table

### CONFIG (shared)
| Key | Value | Unit | Why |
|---|---|---|---|
| step | 1/120 | s | smooth, deterministic, cheap (10 sim-minutes ≈ 1.2 s) |
| introTime / clearTime | 1.2 / 2.6 | s | season banner / celebration |
| tofuR | 18 | px | half of his ~36 px body at 72 px drawn size |
| accel = brake | 1900 | px/s² | 0 → 230 px/s in 0.12 s and back: weighty, never instant |
| arriveR / arriveSafety | 6 / 0.85 | px / × | arrive profile `v ≤ √(2·brake·0.85·d)`: no overshoot |
| faceDeadZone | 25 | px/s | no facing flicker when walking straight up or down |
| stride | 120 | px/cycle | a `step` footfall every ≈ 0.26 s at full speed |
| hurtTime / knockBack / hurtBrake | 0.8 / 260 / 800 | s, px/s, px/s² | ≈ 42 px knock-back that slides out with friction |
| invulnTime / hitForgive | 2.0 / 4 | s / px | safe blink; crabs must overlap 4 px (kind hitbox) |
| pickR / catchZ | 34 / 30 | px | generous catch for small fingers; only low notes |
| g | 900 | px/s² | arcs take ≈ 1.1 s: long enough for a child to read the shadow |
| craterZ | 134 | px | crater height above the volcano's ground point (330 − 196) |
| eruptVz | 340–420 | px/s | apex ≈ 200–230 px above ground |
| landMin / landMax | 120 / 300 | px | landing ring around VOLCANO |
| bounce / bounceSlide | 0.35 / 0.25 | × | one small hop (≤ 29 px measured), rolls ≈ 15 px, rests |
| popVz | 170 | px/s | pop-up hop ≈ 16 px |
| popDelay | 1.3 | s | the meadow refills gently |
| noteSpacing / noteEdge / noteTop | 56 / 26 / 116 | px | notes never stack, never clip the beach, never sit under the HUD |
| noteFromTofu / Crab / Obstacle | 150 / 60 / 60 | px | pop-up spot rules (relaxed ×0.6 after 30 failed tries) |
| noteObsPad | 26 | px | volcano-note landing/rest clearance from collider edges (always reachable) |
| extraNotes | 4 | notes | field ≤ notes still needed + 4 |
| rumbleTime / eruptCount / eruptJitter / firstErupt | 0.9 / 3–5 / ±20 % / ×0.55 | s, n | readable warning; first eruption comes early |
| helperAt / helperTime | 5 / 10 | combo / s | Coco |
| cocoK / cocoDamp / cocoMaxSpeed | 38 / 0.7 / 560 | 1/s², ζ, px/s | damped-spring swoop with a little overshoot |
| cocoOrbitR / cocoOrbitW / cocoZ / cocoDiveZ | 72 / 2.4 / 60 / 10 | px, rad/s, px | circling ellipse (×0.6 vertically), dive height |
| cocoSeekR / cocoReach / cocoReachZ | 260 / 30 / 45 | px | which notes she goes for and when she has one |
| crabR / crabAccel | 16 / 700 | px, px/s² | quick little scuttle starts |
| crabCapFrac | 0.5 | × Tofu speed | crabs can always be outrun |
| crabSepDist | 46 | px | crabs keep apart |
| crabEnterTime / crabFirstDelay / crabGap / crabSpawnMin | 0.9 / 0.6 / 2.5 / 300 | s, px | harmless walk-in from the beach, far from Tofu |
| chaseTime / wanderTime / wanderMul / scaredMul | 3–6 / 2–4 / 0.7 / 1.15 | s, × | mood spells |
| wobble / wobbleHz | 0.35 / 1.7 | ×, Hz | sideways scuttle |
| dizzyTime / crabKnock / crabFriction | 1.5 / 140 / 5 | s, px/s, 1/s | after a pinch |
| afterPinchAway | 300 | px | then it wanders off at least this far: no pinch chains (added) |
| noteBase / noteStep / noteMaxCombo | 10 / 2 / 10 | pts | note = 10 + 2·min(10, combo) |
| clearBonus / perfectBonus | 50 / 50 | pts | |
| mangoLife | 9 | s | |

### DIFFICULTY (per season spring / summer / autumn / winter)
| | Easy | Normal | Hard |
|---|---|---|---|
| hearts | 5 | 3 | 3 |
| Tofu speed (px/s) | 230 | 230 | 235 |
| crabSpeed (px/s) | 45 / 52 / 58 / 64 | 60 / 68 / 76 / 84 | 78 / 88 / 96 / 104 |
| crabs | 1 / 1 / 2 / 2 | 1 / 2 / 2 / 3 | 2 / 3 / 3 / 4 |
| goal (notes) | 10 / 12 / 14 / 16 | 14 / 16 / 18 / 20 | 16 / 18 / 20 / 22 |
| erupt (s) | 9 / 8 / 8 / 7 | 8 / 7 / 7 / 6 | 7 / 6 / 6 / 5 |
| notesOnField | 3 | 2 | 2 |
| noteLife (s) | 14 | 12 | 10 |
| comboWindow (s) | 3.2 | 2.4 | 2.0 |
| chaseFrac | 0.4 | 0.6 | 0.75 |
| mangoEvery (s) | 14–22 | 18–28 | 24–36 |

Loops (after winter): crab speed × min(1.35, 1.1^loop) (still ≤ 0.5 × Tofu), goal + 2·loop.

Measured (tests and probes): perfect bot ≈ 15–28 s per season on Normal (a year in ≈ 84 s, 10/10 seeds cleared).
The skill-0.8 title bot survived 70 s in 8/8 seeds. A "small kid" model (skill-0 aim, touching only 2 s out of every
4.5 s, ignoring crabs) finished Easy spring in 23–38 s (median 28) and never lost. A real 4–6-year-old wanders more
than that, so 45–90 s per season is what we expect from children, and Normal players get there as the song gets longer.

## 3. Tofu: acceleration towards the wanted velocity
`wanted` = axis × speed (keyboard wins while held), or the direction to the finger × the arrive speed. Velocity moves
towards `wanted` by at most `accel·dt` per step (a constant-acceleration "approach"), so starting, stopping and
turning all take ≈ 0.12 s: he feels like a little body with mass, not a cursor. The arrive speed
`min(max, √(2·brake·0.85·(d − arriveR)))` is the speed he can still brake from before the finger, so he settles
without overshooting (the test measures overshoot ≤ 2 px).
Collision: after moving he is pushed out of every obstacle circle and the inward part of his velocity is removed.
The tangential part stays, so he **slides** along the volcano and props. ARENA edges work the same way.
Finger auto-steer: if an obstacle blocks the straight line to the finger, he aims at the tangent point of that
circle grown by his radius (the side is remembered, so it never flip-flops). A kid holding a finger behind the
volcano sees Tofu walk round it (1.8 s from SPAWN to the far side). Facing follows vx with a 25 px/s dead zone.
`walk` grows with distance travelled (120 px per cycle), and `step` fires on every half cycle.

## 4. Notes: ballistic arcs with gravity and one bounce
A volcano note is planned before launch. Pick a landing point L (120–300 px from VOLCANO) and a launch vz₀
(340–420 px/s). The flight time T solves `craterZ + vz₀T − ½gT² = 0`, and the ground velocity is (L − VOLCANO)/T.
The rest point after the bounce, `L + v·bounceSlide·t_b` with `t_b = 2·0.35·|v_hit|/g`, is computed too. Both L
and the rest point must be inside ARENA (26 px in, y ≥ 116), off every collider by 26 px and away from other notes,
so every landing spot is reachable. Integration uses `z += vz·dt − ½g·dt²` (exact for constant gravity; the test
checks z″ = −g·dt² every step). First touchdown: `vz ← −0.35·vz`, ground speed × 0.25 and a `land` event. Second
touchdown: rest, `state = 'ground'`. Pop-ups hop straight up (`popVz`) and settle the same way. A note is catchable
only when `z < 30`. The renderer draws the shadow at (x, y), which shows a child where the note will come down.

## 5. Crabs: seek + wander, sliding, separation
Each crab alternates mood spells. A **chase** (3–6 s) seeks Tofu, a **wander** (2–4 s) heads at 0.7× speed to a
random free spot. The next spell is a chase with probability `chaseFrac`. Both use the same tangent-point steering
around obstacles as Tofu, plus the same push-out slide, so circling the volcano is a real escape: the crab has to
walk the long way round. A sideways scuttle `wobble·sin(2π·1.7·t)` is added perpendicular to the heading, a little
zig-zag that reads as "crab". Separation adds a repulsion inside 46 px to the wanted velocity, and a hard
position push stops shells overlapping. The crab's velocity approaches the wanted velocity at 700 px/s², so its
turns are quick but not instant. A pinch knocks the crab back (140 px/s, exponential friction) and makes it dizzy
for 1.5 s. It then always wanders off at least 300 px away first, so a child standing still can't be pinched
over and over. While Coco helps, crabs are `scared`: they steer away from Tofu at 1.15× speed and can't pinch.
Speeds are capped at half of Tofu's.

## 6. Coco: damped-spring swoop and orbit
Coco is steered by a spring `a = k·(target − p) − 2ζ√k·v` with k = 38 and ζ = 0.7. Being slightly underdamped,
she swoops towards a target, overshoots a touch and curves back, the way a bird banks. Her target is the nearest
note within 260 px of Tofu (diving to z ≈ 10). When there's no note, it's a point orbiting Tofu at 2.4 rad/s on a
72 × 43 px ellipse at z ≈ 60. Height has its own spring (k = 30, ζ = 0.9). She enters from the far stage edge
('in', ≤ 1.6 s), helps for 10 s and flies out ('out'). Reaching combo 5 in a new chain while she's around refreshes
her timer. Combo 10, 15… in the same chain don't, so the crabs aren't scared for the whole level.

## 7. Weather (particles)
- Layers: `ground` (dust, ripples), `air` (petals, motes, butterflies, leaves, snow, smoke), `front` (bursts). Cap
  260. Ambience never evicts; a burst may evict the oldest ambient particle.
- **Petals / leaves:** they drift at a terminal speed with a pendulum sway `x = x0 + A·sin(ωt)`. The rotation
  follows the swing (`rot ∝ cos ωt`), so they tilt most mid-swing like a real falling leaf, and `flipX = cos(tumble·t)`
  gives the 3-D tumble (|flipX| ≥ 0.2, never edge-on).
- **Snow:** 3 depth layers (18 / 12 / 7 flakes). Farther flakes are smaller (5–7 vs 14–18 px), slower (12–18 vs
  38–50 px/s) and dimmer (α 0.35–0.5 vs 0.8–0.95), which gives parallax.
- **Summer:** 14 twinkling sun motes plus 2 butterflies on Lissajous paths that flap (flipX) and face where they fly.
- **Smoke:** a puff from CRATER every 1.4–2.4 s. It rises with buoyancy that decays (drag e^(−0.7t)), drifts with a
  light wind, grows ×2.3–2.9 and fades in and then out over 2.4–3.2 s.
- **Dust:** 1–2 footstep puffs on the ground layer with strong drag, gone in 0.5 s. **Ripple:** a ring that grows ×2.2.
- **Bursts:** sparkle and spark are radial with drag (sparks also fall). Stars are a fountain that arcs up and falls
  back, spinning. Confetti is launched up, then gravity and quadratic drag make it flutter down at ~60 px/s.
- Sparse over the play area: ≤ 16 ambient particles per season except winter (37 small flakes).

## 8. Bot
It re-plans every 0.05 s (skill 1) to 0.6 s (skill 0), and between plans it acts on a stale snapshot of the crabs,
which is its reaction delay. Its goal is the note with the lowest cost: distance, plus a penalty for crabs near the
note, plus a big penalty if the note will fade first. Flying volcano notes count at their landing spot. A mango
wins when a heart is missing. Harmful crabs inside the danger radius (60 → 130 px) push the steering direction
away (weight 0.15 → 2.4). It ignores crabs while blinking safe, and aim noise goes up to 24 px at skill 0.
