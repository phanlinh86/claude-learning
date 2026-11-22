# Otto's Playroom Dash — Mechanics

Code: `game/js/world.js` (OD.World), `game/js/weather.js` (OD.Weather), `game/js/bot.js` (OD.Bot).
Tests: `node tests/unit/run.js` (26 tests, ≈ 4 s). Pacing sim: `node tests/sim/sim.js [biomes] [seeds]`;
high-speed playtest: `node tests/sim/playtest.js --seeds N --maxT S --out name` then `node tests/sim/report.js name`;
config A/B: `node tests/sim/explore.js [seeds] [names]`; fairness oracle: `node tests/sim/oracle.js --sample <model> <diff> <seeds>`.
Contract: DESIGN.md §5.1–5.4. Units: 1 u = one lane width, seconds, y up; lanes x = −1, 0, +1; z = s − dist.

## 1. The twist — gravity per biome

`CONFIG.zones[z].gk` is the gravity multiplier of each biome. `world.gk` eases (smoothstep over `gravEase` = 1.2 s)
from the old value to `world.gTarget` right after `levelUp` (event `gravity {gk, from, to}` fires when the ease starts;
`gotoLevel` snaps and fires `gravity` too if the value changed; `new World({level})` just snaps).
Every sub-step: `world.g = CONFIG.g·gk` (u/s²), `world.jumpV = CONFIG.jumpV·gk^jumpVexp` (u/s).

**Exponent choice — `jumpVexp = 0.35`.** Apex `= jumpV²/2g ∝ gk^(2·0.35 − 1) = gk^−0.3` (grows gently as gravity
falls), airtime `= 2·jumpV/g ∝ gk^(0.35 − 1) = gk^−0.65` (grows a lot more). A least-squares fit of DESIGN's four
apex/airtime targets gives 0.35–0.39 for apex and 0.25–0.39 for airtime; 0.35 + the apex hang hits all eight within
± 0.03. (DESIGN's "≈ 0.65" would make the apex *shrink* in low gravity, since 2·0.65 − 1 > 0, so it could not meet its own
targets; the intent — higher, much longer jumps on the moon — is what 0.35 delivers.)

**Apex hang** (only when gk < 1): while `|vy| < hangV` (1 u/s) the jump feels `g·(1 − hang·hk·(1 − (vy/hangV)²))`,
`hang` = 0.2, `hk = clamp((1 − gk)/0.3, 0, 1)` (full at gk ≤ 0.7, fades out toward 1). Smooth (no kink in vy), adds
≈ 0.02–0.03 s of float at the top.

**No jolt mid-jump:** a jump stores its take-off gravity (`hero.jg`, `hero.jv`, `hero.jk`) and flies its whole arc with
it, even while `world.gk` eases underneath. The ease itself is a smoothstep (zero rate at both ends, peak 1.5·Δgk/1.2 s).

| zone | biome | gk | g (u/s²) | jumpV (u/s) | apex (u) | airtime (s) | DESIGN target | ball steady hop / first hop (u) |
|---|---|---|---|---|---|---|---|---|
| 0 | The Felt Meadow | 1.0 | 19.00 | 6.20 | **1.01** | **0.66** | 1.0 / 0.65 | 0.30 / 0.78 |
| 1 | Pillow Mountains | 0.7 | 13.30 | 5.47 | **1.13** | **0.85** | 1.1 / 0.85 | 0.43 / 1.11 |
| 2 | The Crayon Jungle | 1.25 | 23.75 | 6.70 | **0.95** | **0.57** | 0.95 / 0.57 | 0.24 / 0.62 |
| 3 | The Glow-Star Galaxy | 0.5 | 9.50 | 4.86 | **1.25** | **1.06** | 1.25 / 1.05 | 0.61 / 1.56 |

Highest apex 1.25 u (≤ 1.6 u, stays on screen). Every apex clears the foam blocks (0.42 u) by > 0.5 u.
`OD.World.jumpProfile(gk)` returns `{gk, jumpV, g, apex, air, ys[], step}` (the exact sub-stepped path, cached);
`OD.World.pathY(profile, t)` samples it. Tests, arcs and the bot all use it, so they agree with the hero to the sub-step.

What follows gravity: the hero's jump, **bouncing balls** (`world.g`), knocked-aside objects, **acorn arcs** (generated
from the jump path of the row's biome), **row gaps** (scale with airtime), and the weather (`Weather.setGravity`).

## 2. CONFIG (units → why)

| key | value | why |
|---|---|---|
| `step` | 1/120 s | fixed sub-step: lane spring (ω·dt = 0.22) and jumps exact & stable; `alpha` for render lerp |
| `stride` | 1.1 u | one 4-frame leg cycle; `hero.run += speed·dt/stride` → feet don't skate |
| `laneOmega`, `laneZeta` | 26 rad/s, 0.85 | lane spring: 1 lane in ≈ 0.15 s, overshoot < 0.001 u |
| `queueAt` | 0.35 u | a move while still > 0.35 u from the lane is queued (one slot); a move back reverses at once |
| `tiltMax`, `tiltRate` | 0.3 rad, 18 /s | lean `clamp(vx/8, −1, 1)·0.3`, eased |
| `jumpV`, `g` | 6.2 u/s, 19 u/s² | the gk = 1 "boing": apex 1.01 u, airtime 0.66 s |
| `jumpVexp` | 0.35 | see §1 |
| `hang`, `hangV` | 0.2, 1 u/s | apex hang below gk 1 (DESIGN: "reduce g by up to 20 % while \|vy\| < 1") |
| `gravEase` | 1.2 s | smoothstep ease of gk after a biome change |
| `jumpBuffer` | 0.15 s | a press just before landing fires on landing (kids press early) |
| `squashDecay`, `stretchDecay` | 7 /s, 8 /s | renderer envelopes 0..1 |
| `accel` | 2.6 /s | speed eases to its target; a stumble reads in ≈ 0.3 s |
| `chapterRamp`, `zoneSpeedK`, `loopSpeedK` | 0.08, 0.06, 0.1 | +8 % over a biome, +6 % per biome, +10 % per loop |
| `stumble`, `stumbleSlow` | 0.6 s, 0.55 | soft slow-down after a bump |
| `invuln` | 1.6 s | blink time: long enough to pass the row you hit |
| `ouchT`, `happyT` | 0.8 s, 1.2 s | mood durations |
| `spawnAhead`, `removeBehind`, `firstRow` | 34 u, −3 u, 16 u | generation window (renderer shows z ≤ 36) |
| `maxSpeed` | 13 u/s | late-loop cap |
| `heroHalfW`, `heroH`, `hitZPad` | 0.28, 0.7, 0.25 u | Otto's collision box (heroH: a ball whose bottom is above it passes over him) |
| `acornPoints`, `comboEvery`, `levelBonus` | 10, 10, 100 | scoring |
| `ballSpeed`, `ballWake` | 1.2–1.8 u/s, 1.5–3 s | sideways roll (+10 % per biome after 3); wakes when z < speed·wake |
| `ballV`, `ballKick`, `ballRest` | 3.4 u/s, 1.6, 0.78 | wakes with a big hop (1.6·ballV), restitution 0.78 per bounce, never below ballV |
| `goal` | easy 410, normal 530, hard 640 u | ≈ 61–74 s per biome (×1.1 per loop) |
| `difficulty` | see §6 | hearts, speed, react |
| `zones[z]` | gk, patterns, gapK | see §4 |
| `kinds` | see §3 | collision sizes |
| `acornY` | 0.35 u | resting acorns float at Otto's mid height |

## 3. Motion and collisions

| Motion | Model |
|---|---|
| Running | `speed → D.speed·(1 + 0.06·zone + 0.1·loop)·(1 + 0.08·progress)·(stumble ? 0.55 : 1)`, rate 2.6 /s, cap 13; starts at 45 % (run-up) |
| Lane change | spring `a = ω²(lane − x) − 2ζω·vx`, semi-implicit Euler |
| Jump | `y += vy·dt − ½g'·dt²; vy −= g'·dt` with the take-off g (and the hang, below gk 1); lands exactly on y = 0; `land {hard}` if \|vLand\| > 0.8·jv; squash `clamp(−vLand/jv, 0.3, 1)`; `stats.maxAir`, `stats.maxApex` updated on landing |
| Ball | waits rocking at x = ±1.9 until `z < speed·wake`, then a big first hop; rolls across `x += vx·dt`, `rot += Δx/r` (r 0.31); vertical: `y += vy·dt − ½g·dt²` under the **current** `world.g`; on the floor `vy = max(0.78·\|vy\|, ballV)` + squash; `ballBounce {o, wall:false, z}` per floor bounce (only while z < 24); bounces off the far road edge (\|x\| > 1.45) **once** (`vx = −0.9·vx`, `ballBounce {o, wall:true, z}`) |
| Knocked aside (blocks, ball) | `vx ±2.2–3.2`, `vy 2.2–3.0`, `vs 1–1.8` (decays), spin 4–7 rad/s, gravity `world.g`, restitution 0.35 (ball 0.6), friction |
| Tower (hit) | stays, wobbles `rot = 0.3·e^(−4t)·sin(16t)`, passed through |
| Acorn | floats at y = 0.35 rocking; `taken` → rises 2.2 u/s for 0.35 s, then gone |

Collisions (each sub-step): overlap = `|z| < d + 0.25` and `|x − hero.x| < w + 0.28`. Sizes (`kinds`): tower h 1.6 w 0.34 d 0.3
(never jumpable), blocks h 0.42 w 0.44 d 0.18, ball h 0.62 (= 2r, measured from ball.y) w 0.28 d 0.28, acorn w 0.22 d 0.2.
- Acorn taken if `|y − hero.y − 0.35| < 0.6` (jumping over a ground acorn misses it; arc acorns need the jump).
- Obstacle hit if `hero.y < o.y + o.h − 0.05` — for balls **also** `hero.y + heroH > o.y + 0.05` (real vertical overlap:
  Otto can run under a high moon bounce). Hit: heart −1, stumble, invuln, mood `ouch`, combo 0, object `hit`.
- Combo: +1 per acorn; an acorn of a row you already took one from that gets past resets it; skipping a whole row does not.

## 4. Track generation

`rng.fork('track')`; rows while `nextS < dist + 34`. `_rowInfo(s)` predicts which biome Otto will be in at `s` (and where
that biome starts), so every rule uses the row's own gravity.

| Pattern | Contents | Zones |
|---|---|---|
| `tower1` | tower in 1 lane (variant 0 block stack / 1 stacking rings); 40 %: 3 lure acorns in a free lane | all |
| `tower2` | towers in 2 lanes, never 3; free lane within one lane of the previous free lane (Easy/Normal); 60 % lure | all |
| `blocks1` | foam blocks in 1 lane | 1+ |
| `blocks3` | blocks in all 3 lanes (must jump; not on Easy before zone 2); 50 %: 4 acorns on the jump arc over one lane | 1+ |
| `ball` | a bouncy ball waiting at one side | 2+ |
| `acornArc` | blocks + 6 acorns exactly on the jump path of the row's gravity, apex over the blocks, at the predicted speed | 1+ |
| `acornLine` | 5–8 acorns in one lane, 1.2 u apart | all |
| `acornZig` | 6–8 acorns 1.5 u apart, changing lane every 2 | all |

Weights: zone 0 `tower1 5, tower2 2, acornLine 3, acornZig 2` (gapK 1.35) — **towers + acorns only**; zone 1 adds blocks and
arcs (gapK 1.15); zone 2 adds balls (1.08); zone 3 everything (1.0). Easy: `tower2` weight halved.

Arc acorns carry `arc: true` and `arcS` (the take-off point): jump when Otto reaches `arcS` and he grabs all of them.

**Fairness rules** (checked by `tests/unit/run.js` over 20 min per difficulty, and again with *every* biome forced to
gk 0.5 / 0.7 / 1 / 1.25):
- `air` = the row's airtime; near a biome start (from 1.5 s·v before to `(gravEase + 1.5 s)·v` after) it is the longer of
  the old and new biome's airtime (`easing` rows; no `acornArc` there, since the arc shape is only exact once gk settled).
- obstacle rows are `≥ minGap = vEst·(react + 0.5·airGap) + 2.5 u` apart, `airGap = max(air, previous obstacle row's air)`
  (actual gap `minGap·gapK·U(1, 1.3)`), `vEst` = speed at the end of that biome (worst case). So after landing from a
  jump over the previous row, Otto always has ≥ `react` s (+ 2.5 u) before the next one — **a moon jump never lands you
  in an unavoidable row**.
- two rows that need a jump in the same place (an all-lane `blocks3` before/after a low row) are `≥ vEst·airGap + 2 u`
  apart: one jump, land, take off again.
- never 3 lanes of towers within any 2 u; always a free lane; a two-lane switch never needs < 0.5 s (Easy/Normal);
  every free lane reachable (`time ≥ 0.12·k + 0.25 s`).
- an arc's take-off point is ≥ 1.5 u past the previous obstacle row and its first acorn ≥ 1.5 u past the last acorn run;
  an obstacle row keeps `0.6·minGap` after an acorn run.

Measured obstacle-row spacing (seed 4, s per row, average / minimum): Easy 3.2/2.5 · 2.7/2.2 · 2.4/1.9 · 2.7/2.0;
Normal 2.8/2.0 · 2.2/1.8 · 1.9/1.5 · 2.0/1.65; Hard 2.4/1.7 · 1.8/1.5 · 1.6/1.2 · 1.7/1.4 (biomes 1·2·3·4).
Objects alive ≤ 29.

## 5. First biome — easy for a 6-year-old

Easy: **5.5 u/s**, **5 hearts**, biome 1 has **only towers and acorns** (nothing to jump), gapK 1.35 → an obstacle row
on average every **3.2 s**, never closer than 2.5 s (the unit test requires ≥ 1.5 s); normal gravity (the jump is a plain
"boing" to learn on). Lure acorns point to the free lane. A heart comes back at every new biome.

## 6. Difficulty

| | Easy | Normal | Hard |
|---|---|---|---|
| hearts | 5 | 3 | 3 |
| speed (biome 1 → 4, + 8 % ramp in each) | 5.5 → 6.5 | 7.0 → 8.3 | 8.4 → 9.9 |
| react (row gap ≥ v·(react + 0.5·air) + 2.5) | 1.1 s | 0.8 s | 0.62 s |
| goal per biome (×1.1 per loop) | 410 u | 530 u | 640 u |

## 7. Bot (OD.Bot)

Lanes (every 0.1 s, look-ahead `speed·(1.2 + skill)`): tall obstacle met within 0.75 s +1000 (further +25); low obstacle
+5 (ball +14 at its predicted x; +40 if too close); −3 per reachable acorn; +2.5 per lane change; +1000/+30 for a tall/low
thing in a lane it crosses. Jumps: knows the airtime of the current gravity (`OD.World.jumpProfile(world.gk)`, ≈
`2·jumpV/g`); for low obstacles within `speed·(air + 0.4 + delay)` it runs a tiny look-ahead sim (hero lane spring + jump
with this gravity; balls rolling and bouncing under `world.g`) of "no jump" / "jump after my delay" / "a bit later" and
jumps at the latest moment that still clears (so it never jumps if Otto would pass under a moon bounce). Arc acorns: jumps
at `arcS`. Skill: delay `(1 − skill)·0.35 s ±30 %`, jump timing error σ `(1 − skill)·0.15 s`, attention lapses
`(1 − skill)·0.15` per object, shorter look-ahead.

## 8. Measured (`node tests/sim/sim.js 5 3` and `playtest.js --seeds 4 --maxT 300`)

- Biome durations ≈ 72 / 68 / 64 / 61 s (Easy), 73 / 69 / 65 / 62 s (Normal), 74 / 69 / 66 / 62 s (Hard), loop 2 ≈ 72 s.
- Skill 1: 0 hits in 16 Normal biomes (unit test), 0 hits on Hard over 5 biomes × 3 seeds; with all biomes forced to any
  one gravity, ≤ 2 bumps in 4 min.
- Skill 0.5: 0–0.33 hits per biome on Easy, ≤ 0.75 on Normal (most in the Crayon Jungle — heavy hops + balls); skill 0.3
  ≈ 1–2.5 hits per biome.
- Player models (4 seeds): kid on Easy ≈ 1.25 hits in biome 1 (mostly towers: the kid model swipes late / wrong way),
  reaches biome 3 in 75 % of runs; casual adult on Normal survives 300 s in all runs. Idle / jump-spam / zig-zag players
  lose all hearts in biome 1 (towers cannot be jumped). Oracle: 0 of the sampled kid hits were unavoidable.
- 10 simulated minutes (Hard, bot 0.9) ≈ 0.15–0.25 s in node. Weather < 160 particles with bursts at 1280×540, 960×540,
  560×1600, 720×1000.

## 9. Weather (OD.Weather)

| biome | ambient (per 960×540, scaled by area) | motion |
|---|---|---|
| meadow | `butterfly` 7, `dust` 14 | butterflies on a flapping sine path; tiny motes in the window light at the sides, twinkling, sinking slowly |
| pillows | `feather` 18, `puff` 4 | feathers fall like pendulums (9–15 px/s·fk, swing 20–36 px); soft puffs drift at the horizon |
| crayon | `confetti` 18, `leaf` 9 | paper squares fall fast (30–48 px/s·fk), spin, flutter (`flap2`); paper leaves pendulum + spin |
| stars | `star` 42, `firefly` 14 | glow stars twinkle above the horizon and sink slowly (·fk), wrapping to the top; fireflies wander and pulse |

`setGravity(gk)`: fall speeds × `fk`, swing / spin rates × √fk, where `fk` eases (≈ 1 s) toward `gk^0.75` (drag-limited
fall speed ∝ √g; ^0.75 so the change reads). Burst gravity × gk. Front-layer particles: alpha ≤ 0.55, faded out in the
centre lane band near Otto. Sprites: `dust, sparkle, butterfly, feather, confetti, leaf, star, firefly, puff, ring` (DESIGN §4.3).

## QA changes (2026-11-22, from `docs/reports/playtest.md`)
| key | before | after | why |
|---|---|---|---|
| `zones[0].patterns.tower2` | 2 | 0 | two-tower rows caused 59 % of kids' biome-1 hits (kid Easy 1.07 → 0.37 hits) |
| `ballV` / `ballKick` / `ballRest` | 3.4 / 1.6 / 0.78 | 2.8 / 1.2 / 0.6 | moon first hop 1.56 u → 0.59 u: every bounce phase is now jumpable in-lane (≥ 375 ms window); steady hops 0.21 / 0.30 / 0.17 / 0.41 u |
| `zones[2].gapK` | 1.08 | 1.2 | Crayon Jungle adult hits 1.25 → 0.64 |
The unit test "Otto can run under a moon ball" became "every moon bounce phase is jumpable". Numbers above in this file that mention
the old ball values are superseded by this table.
