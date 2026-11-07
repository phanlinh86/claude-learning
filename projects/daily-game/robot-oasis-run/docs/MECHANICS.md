# Pebble's Oasis Run — Mechanics

Code: `game/js/world.js` (PO.World), `game/js/weather.js` (PO.Weather), `game/js/bot.js` (PO.Bot).
Tests: `node tests/unit/run.js` (26 tests, ≈ 2.5 s). Pacing sim: `node tests/sim/sim.js [chapters] [seeds]`.
Contract: DESIGN.md §5.1–5.4. Units: 1 u = one lane width, seconds, y up; lanes x = −1, 0, +1; z = s − dist.

## 1. Motion model

Everything runs in fixed sub-steps of 1/120 s (`update(dt)` accumulates, max 0.25 s per call). At the start of each
sub-step every moving thing copies `x, y, z, rot, run` into `prev*`; `world.alpha` is the leftover fraction, so the
renderer draws `prev + (cur − prev)·alpha`.

| Motion | Model | Numbers | Why |
|---|---|---|---|
| Running | `speed` eases toward `target = speed[d]·(1 + 0.06·zone + 0.1·loop)·(1 + 0.08·progress)·(stumble ? 0.55 : 1)`, rate 2.6 /s; cap 13 u/s. Starts at 45 % (a run-up) | Easy 5.5, Normal 7.0, Hard 8.4 u/s | a stumble reads as a real slow-down in ≈ 0.3 s and recovers smoothly |
| Leg cycle | `hero.run += speed·dt / 1.1` → frame `⌊run·4⌋ % 4` | stride 1.1 u per 4 frames | feet never skate: the cycle is tied to distance, not time |
| Lane change | spring `a = ω²(lane − x) − 2ζω·vx`, semi-implicit Euler | ω 26 rad/s, ζ 0.85 | arrives (within 0.05 u) in **0.15 s**, overshoot **< 0.001 u** — snappy but not a teleport |
| Lean | `tilt → clamp(vx/8, −1, 1)·0.3` (rate 18 /s) | ±0.3 rad max, peak ≈ 0.22 on a 1-lane move | the body leans into the move and straightens as he arrives |
| Queued input | a move while `|x − lane| > 0.35` is stored (one slot, last wins) and applied when he gets within 0.35 u; a move **back** reverses at once | — | quick double swipes go two lanes; a "no, back!" swipe is instant |
| Jump | exact per-step parabola `y += vy·dt − ½g·dt²; vy −= g·dt`; landing clamps to y = 0 | jumpV 6.2 u/s, g 19 u/s² → apex **1.01 u**, airtime **0.65 s** | logs (0.42 u) need a real jump, the window over a log is ≈ 0.5 s — forgiving for kids |
| Jump buffer | a press in the air is kept 0.15 s and fires on landing (same sub-step) | 0.15 s | kids press early |
| Squash / stretch | `stretch = 1` on take-off (decay 8 /s); `squash = clamp(−vLand/jumpV, 0.3, 1)` on landing (decay 7 /s); `squash ≥ 0.7` on a bump | 0..1 envelopes | renderer: `scaleY = 1 + 0.18·stretch − 0.22·squash`, `scaleX = 1 − 0.08·stretch + 0.18·squash` |
| Knocked aside (log, pillow, tumbleweed) | `vx = ±2.2–3.2` (away from Pebble), `vy = 2.2–3.0`, forward `vs = 1–1.8` (decays 1.5 /s), spin 4–7 rad/s; gravity, bounce with restitution 0.35, ground friction | — | a soft "boink" off the path instead of vanishing |
| Pots (hit) | stay in place, `rot = 0.3·e^(−4t)·sin(16t)` wobble; passed through | — | a stack of pots doesn't fly; it rocks |
| Tumbleweed | waits rocking at the roadside (x = ±1.9) until `z < speed·wake` (wake 1.5–3 s), then rolls across at 1.2–1.8 u/s (+10 % per zone after 2). `rot += Δx / r` (r = 0.31 u: rolling without slipping), little hops (`vy = 1.36–2.04` each touchdown → ≈ 0.05–0.11 u high), bounces off the far path edge (|x| > 1.45) **once** (`vx = −0.9·vx`, event `tumbleBounce`), then leaves the path | — | readable, physical, and always jumpable (h 0.55) |
| Shells | float at y = 0.35 with a gentle rock (`rot = 0.18·sin(2.4t + id)`); on pickup state `taken`, rises 2.2 u/s for 0.35 s, then removed | — | renderer can fly them to the HUD |

## 2. Collisions (each sub-step, DESIGN §5.1)

Overlap = `|z| < d + 0.25` and `|x − hero.x| < w + 0.28`. Sizes (`CONFIG.kinds`): pots h 1.6 w 0.34 d 0.3 (never
jumpable), log h 0.42 w 0.44 d 0.18, tumbleweed h 0.55 w 0.28 d 0.28, resting pillow h 0.45 w 0.38 d 0.3, shell w 0.22 d 0.2.
- Shell taken if `|y_shell − hero.y − 0.35| < 0.6` (so a jump over a ground shell misses it; arc shells need the jump).
- Obstacle hit if `hero.y < o.y + h − 0.05` and `invuln = 0`: heart −1, `stumbleT 0.6`, `invuln 1.6`, mood `ouch` 0.8 s,
  combo 0, object `hit`. A flying pillow hits if it comes down on Pebble (`hero.y < o.y + h` and `hero.y + 0.9 > o.y`),
  also checked at the landing instant.
- Combo: +1 per shell; a shell of a row you already took one from that gets past (z < −0.6) resets it; skipping a whole row does not.

## 3. Track generation (rows)

`rng.fork('track')`; rows are generated while `nextS < dist + 34`. The chapter of a row is predicted from its `s`
(`endS` = where the current chapter ends), so chapter-1 rules hold right up to the page arch.

| Pattern | Contents | Kind |
|---|---|---|
| `pots1` | pots in 1 lane; 40 %: 3 "this way" shells in a free lane | tall |
| `pots2` | pots in 2 lanes, never 3; the free lane is within one lane of the previous free lane (Easy/Normal); 60 %: 3 lure shells in the free lane | tall |
| `log1` | a log in 1 lane | low |
| `log3` | logs in all 3 lanes (must jump); 50 %: 4 shells in a jump arc over one of them | low |
| `tumble` | a tumbleweed waiting at one side | low, moving |
| `shellArc` | a log + 6 shells exactly on Pebble's jump arc (apex over the log, at the predicted speed) | low |
| `shellLine` | 5–8 shells in one lane, 1.2 u apart | shells |
| `shellZig` | 6–8 shells 1.5 u apart, changing lane every 2 shells | shells |

Weights (`CONFIG.zones`): zone 0 `pots1 5, pots2 2, shellLine 3, shellZig 2` (gapK 1.35) — pots and shells only;
zone 1 adds logs/arcs (gapK 1.15); zone 2 adds tumbleweeds (gapK 1.08); zone 3 everything (gapK 1.0).
Easy: no `log3` before zone 2, `pots2` weight halved. **While Fizz is (predicted to be) visiting**: no `pots2`, `log3`,
`tumble`, shell rows ×1.5, gaps ×1.2.

Fairness rules (scanned by the unit test over 20 min per difficulty):
- obstacle rows are `≥ minGap = vEst·react + 2.5 u` apart (actual gap `minGap·gapK·U(1, 1.3)`), where `vEst` is the
  speed at the end of that row's chapter (worst case); an obstacle row also keeps `0.6·minGap` after a shell run.
- never 3 lanes of tall obstacles within any 2 u of track; always a free lane; a two-lane switch never needs to happen
  in under 0.5 s (Easy/Normal); every free lane is reachable (`time ≥ 0.12·k + 0.25 s` for k lane switches).
- pillow landing spots avoid pot stacks (±1.6 u) and keep a full jump length (`speed·0.65 + 1.2 u`) from other low
  things in the same lane (tumbleweeds: any lane), so one jump never has to clear two things.

Measured (seed 4, chapters 1–4): obstacle rows every 2.5 / 2.3 / 1.9 / 2.0 s on Easy (min 1.5 s),
1.9 / 1.7 / 1.5 / 1.3 s on Normal (min 1.1 s), 1.5 / 1.3 / 1.15 / 1.2 s on Hard (min 0.86 s). Objects alive: ≤ 33.

## 4. Fizz the boss and the pillows

- `nextT` counts from 30 s; the first visit starts at **t = 30.0 s**, then every **30 s from the start of the previous
  visit** (so visits really are "every 30 s"), but never earlier than 12 s after he left.
- `enter` 1.2 s: smoothstep from (z 30, y 6.5) to (z 11, y 2.4), swooping sideways `x = ±0.9·sin(π·e)`.
- `hover`: `x = ±1.1·sin(0.9·t)`, `y = 2.4 + 0.12·sin(2.6·t)`, z = 11. First throw 0.6 s after arriving, then every
  `pillowEvery`; `boss.windup` ramps 0 → 1 over the 0.4 s before each release (mood `throw`). He leaves 0.5 s after
  the last throw once every pillow of this visit has been passed or has hit (so "perfect" is decided fairly).
- `leave` 1.0 s: accelerates up/away (`z → 26`, `y + 5`, quadratic). `perfect = hits === 0` → `+50·(level+1)`,
  mood `hmph`; else mood `grin`. Game over also sends him away (no bonus).
- **Throw math**: lane = Pebble's target lane (Easy: 50 % a random lane). `T = flightT`,
  `landS = dist + speed·T + zLand`, start `s0 = dist + boss.z`, `x0 = boss.x`, `h0 = boss.y + 0.5`.
  In flight (`p = t/T`): `s = s0 + (landS − s0)·p`, `x = x0 + (landX − x0)·(1 − (1 − p)²)`,
  `y = h0 + vy0·t − ½g·t²` with `vy0 = (½gT² − h0)/T` ⇒ y(T) = 0 exactly and y > 0 before (a concave parabola through
  (0, h0) and (T, 0)), apex ≈ 4.2–4.6 u on Normal. `rot` spins exactly 1 turn (`pillowTurns`) so it lands upright.
  On landing: state `live`, a small settle-bounce (vy 1.4, restitution 0.3), `o.squash = 1`, event `pillowLand`;
  it lies ≈ zLand ahead (Normal 6.5 u ≈ 0.9 s) as a jumpable obstacle.
- Warning time (shadow visible from the throw until Pebble reaches the spot): Easy 1.3 + 7.5/5.5 ≈ **2.7 s**,
  Normal 1.1 + 6.5/7 ≈ 2.0 s, Hard 0.95 + 5.8/8.4 ≈ 1.6 s.

## 5. Difficulty table

| | Easy | Normal | Hard |
|---|---|---|---|
| hearts | 5 | 3 | 3 |
| speed (chapter 1 → 4, + 8 % ramp in each) | 5.5 → 6.5 | 7.0 → 8.3 | 8.4 → 9.9 |
| react (row gap ≥ v·react + 2.5) | 1.1 s | 0.8 s | 0.62 s |
| goal per chapter (×1.1 per loop) | 410 u | 530 u | 640 u |
| pillows per visit (+1 per loop, max 6) | 3 | 4 | 5 |
| pillowEvery | 1.5 s | 1.15 s | 0.95 s |
| zLand / flightT | 7.5 u / 1.3 s | 6.5 u / 1.1 s | 5.8 u / 0.95 s |
| aimRandom | 0.5 | 0 | 0 |

## 6. Bot (PO.Bot)

Every 0.1 s it scores each lane over a look-ahead of `speed·(1.2 + skill)`: tall obstacle met within 0.75 s +1000
(further: +25, "leave soon"); low obstacle +5 (tumbleweed +12; +40 if too close to time a jump); −3 per reachable shell;
+2.5 per lane change; +1000/+30 for a tall/low obstacle in a lane it would cross while crossing. It moves to the cheapest
lane (current lane wins ties within 0.5). Jumps are checked every call: low obstacle in its lane at the predicted x
within `speed·0.28 + 0.6`, or the start of a shell arc. Skill: actions delayed `(1 − skill)·0.35 s ±30 %`; an object is
"not noticed" with chance `(1 − skill)·0.15` until it is within `speed·(0.25 + 0.35·skill)`; low skill also looks less far.

## 7. Measured results (`node tests/sim/sim.js 8 6`, 6 seeds, bot plays from chapter 1)

Chapter durations (s) and hits per chapter (h):

| | ch1 | ch2 | ch3 | ch4 | ch5 (loop 2) | ch8 | runs reaching ch8 |
|---|---|---|---|---|---|---|---|
| Easy, skill 0.5 | 72.1 s, 0.33 h | 67.7 s, 0.17 h | 64.1 s, 0.33 h | 60.8 s, 0.17 h | 71.8 s, 0.5 h | 61.8 s, 0.5 h | 6/6 |
| Easy, skill 0.9 | 72.0 s, 0 h | 67.7 s, 0 h | 64.1 s, 0.17 h | 60.8 s, 0 h | 71.7 s, 0 h | 61.7 s, 0.17 h | 6/6 |
| Normal, skill 0.5 | 73.2 s, 0.33 h | 69.0 s, 0.83 h | 65.2 s, 0.67 h | 61.9 s, 0.6 h | 72.9 s, 0.5 h | 62.9 s, 1.0 h | 3/6 |
| Normal, skill 0.9 | 73.1 s, 0 h | 68.8 s, 0 h | 65.1 s, 0 h | 61.8 s, 0 h | 72.9 s, 0.17 h | 62.6 s, 0 h | 6/6 |
| Hard, skill 0.5 | 73.7 s, 0.67 h | 69.3 s, 0.5 h | 65.7 s, 1.0 h | 62.4 s, 1.0 h | 73.4 s, 0.33 h | 63.3 s, 1.0 h | 1/6 |
| Hard, skill 0.9 | 73.5 s, 0 h | 69.2 s, 0.17 h | 65.5 s, 0 h | 62.2 s, 0 h | 73.3 s, 0 h | 63.0 s, 0 h | 6/6 |

Skill 1: 0 hits on Easy/Normal over 48 chapters each, 2 hits in 48 chapters on Hard. Most casual-bot hits are
pillows (≈ 60 %), then logs. Perfect Fizz visits: skill 0.5 ≈ 80–90 % (Easy/Normal), skill 0.9 ≈ 98 %.
Ten simulated minutes (Hard, bot) take ≈ 0.2 s in node; weather stays < 160 particles with bursts at
1280×540, 960×540, 560×1600 and 720×1000.
