# Bristle's Moon Pop: mechanics (numbers and the reasons for them)

Code: `game/js/world.js` (MP.CONFIG / MP.DIFFICULTY / MP.World), `weather.js`, `bot.js`, `rng.js`.
Tests: `node tests/unit/run.js` (21 tests, ~4 s). Sims: `node tests/sim/run.js [N] [min]` (bot grid) and
`node tests/sim/playtest.js [--n 30] [--cap 15]` (all player models plus a pass/fail verdict). Results are in `tests/sim/results/`.

Units are logical px (960 × 540), seconds and radians, with y pointing down. The simulation uses fixed sub-steps of 1/120 s, so the
same seed and the same inputs always give the same game. Every tunable lives in `MP.CONFIG`, and its comment gives the unit and reason.

## 1. Skating ("a skateboard on the Moon")
| Key | Value | Why |
|---|---|---|
| `maxSpeed` | 380 px/s | Crosses the 840 px floor in 2.2 s, so any vent can be reached during its puff and early rise |
| `accel` / `turnAccel` | 1900 / 2800 px/s² | Reaches full speed in 0.2 s, like a push rather than a teleport. Reversing is snappier (a kick-turn) |
| `coastDecel` | 1500 px/s² | Released at full speed, he rolls about 48 px in 0.25 s: low friction you can feel, still precise for a 6-year-old |
| `followOmega` / `followAccel` / `followBrake` | 9 /s, 2600 px/s², 0.5 | Pointer follow: an exponential approach near the target plus a √(2·a·d) braking curve. Stops within 4 px with < 6 px overshoot (tested) |
| `airControl` / `airDrag` | ×0.6, 0.35 /s | You steer a jump but don't fly it. No air brakes: momentum carries |
| `tiltMax` / `tiltRate` | 0.2 rad, 7 /s | Leans into the motion, eased (0.1 s half-life) |
| `pushPeriod` | 0.36 s | The 'push' frame alternates with 'skate' while accelerating along the motion (> 300 px/s²) |
| `wheelR` | 5 px | `wheel` angle = distance / 5 |

## 2. Jump: Moon gravity
Apex H = v²/2g and air time T = 2v/g, which give v = 4H/T and g = 8H/T². For H = 200 px and T = 1.4 s that is **`jumpV` 572 px/s and `gravity` 818 px/s²**.
The position uses the average velocity of each step, so the arc is exact: apex 200.0 px and air time 1.40 s (tested).
- `curlDelay` 0.1 s, then `curl` eases to 1 (12 /s). Frame 'ball' shows once curl > 0.5, with `spin` at 2.2 turns/s in the facing direction.
- `popBounce` 400 px/s: an air pop sets vy = min(vy, −400), which gives about 98 px and 0.5 s more hang time, so chains are possible.
- Soft ceiling: above y 150 an extra pull eases him down, and y never goes above 110 (tested with endless bounces).
- `jumpBuffer` 0.12 s and `coyote` 0.08 s are kept from the design.
- **`landLag` 0.1 s** (new): the board settles for 0.1 s after a landing before the next jump. A buffered press fires right after.
  It makes mashing Jump slightly less free (see §8) and gives the landing squash time to show.
- Board: on the floor it is snapped under him (deck at y 484, rot = tilt). In the air it trails him on a critically damped spring
  (ω 20 /s) and does one smoothstep kick-flip in 0.9 s, flat again before the landing.
- Landing: `squash` = 0.75 × (vy / jumpV), decaying at 7 /s, plus the `land {x, vy}` event.

## 3. Bubbles
- **Puff → emerge.** A vent puffs for `puffTime` (0.8 s; Easy 1.1 s; `vents[i].puff` ramps 0 → 1). The bubble then appears at (vent.x, 470) with
  vy −45 px/s and a sideways kick of ±22 px/s, rolled at puff time so the bot can predict it exactly. `r` grows from 0.55 to 1 over 0.25 s.
- **Buoyancy + drag.** vy += (−buoy − k·vy)·h with k = 1.5 /s, giving a terminal rise `rise[zone]` = 65 / 75 / 85 / 95 px/s
  (dawn → night), +6 % per loop capped at +25 % (Easy ×0.85, Hard ×1.1). On dawn a bubble takes about 6.4 s from the vent to the escape line.
- **Sway.** x += (vx + 18·sin(sw))·h with sw at 2.4 rad/s, a gentle ±7.5 px wander. The kick decays with `dragX` 0.7 /s (≈ 30 px drift).
  `wob` (film wobble phase, 1.6 Hz) is for the renderer only. The film wobble rate and the path sway are separate:
  a 1.6 Hz path sway would only move ±2 px.
- **Soft mutual repulsion**: from 1.08 × (r1 + r2), 900 px/s² per unit overlap. A positional limit keeps overlap ≤ 30 %. Touching films `squish`.
- **Walls**: a spring at [xMin − 10, xMax + 10], so bubbles stay poppable from the edge of the play range.
- **Escape** when y < 60: the bubble keeps rising and fades over 0.5 s. A cupcake escape resets the streak; a magnet escape does not.
- **Closed form** `world.bubbleAt(it, τ)` (no magnet or repulsion) matches the integrator within 1.5 px over 2 s. The bot uses it.

## 4. Popping and scoring
- A bubble pops if dist(hog, bubble) < r + hogR, with hogR 28 standing and 30 as a ball (interpolated by curl). Standing on a vent pops
  its bubble as it emerges: **ground pops**, the skate-only way to play.
- Tiers by the bubble's y at the pop: **y > 360 → ×1, 220 < y ≤ 360 → ×2, y ≤ 220 → ×3**. *Deviation from DESIGN (200):* with
  apex y 246 plus 58 px reach, a single jump could only touch y ≥ 188, and the sims showed sky pops almost never happened.
  At 220 a perfectly timed apex pop or any chain reaches the sky tier. It is still rare: skill-1 bot ≈ 0.15 sky pops/min.
- Points = 10 × tier × mult + 10 × (chain − 1) (the second air pop of a jump onward). The streak counts +1 per pop (cupcake or magnet),
  mult ×1/×2/×3 at 0/8/20 (Easy 0/5/12). Escapes and bonks reset it.
- Box: each popped cupcake counts +1 (magnets don't). **Targets 20/24/28/32** (Easy 14/17/20/23, Hard 26/30/34/38), × `lengthK`, minimum 6.
  *Deviation from DESIGN (15/18/21/24):* level time is set by the spawn rate (a good player pops almost everything),
  and 15 cupcakes at 1.9 s each would make a level last about 30 s. The 45–90 s target needs these larger boxes (see §8).
- Box full → `boxfull`. Puffing vents are cancelled, falling pebbles turn harmless and fade, and there is a 1 s grace in which pops
  still score. Then `cleared`: bonus = hearts × 100, plus 1 heart back on the first loop (Easy: the first two loops; Hard: none),
  which emits a `heal` event. Bubbles still up float away quietly. The next level starts after 2.2 s.

## 5. Magnet bubble (the twist)
- First one after 12 s of play, then every 22–28 s. Never two alive, never while one is active, never in the last 2 cupcakes of a box.
- Pop → `magnet.t = magnetDur` (7 s; Easy 9 s, Hard 6 s). Each rising bubble within 300 px gets accel 520 × √(1 − d/300) toward him,
  extra drag of 2.4 /s on both axes (they curve in, not slingshot), 60 % of its buoyancy cancelled (bubbles above him sink to him),
  sway ×0.3, and a speed cap of 260 px/s.
- Test: five bubbles 200 px away (sides, diagonals, above) all reach him in < 4 s, and none goes faster than 260 px/s.
  A bubble 380 px away is not pulled.

## 6. Moon pebbles (the only thing that costs a heart)
- Fall: g = 266, k = 1.4 → terminal **190 px/s**, starting from y −30 at 30 px/s, with a ±10 px sway (1.3 rad/s) and a spin of 0.4–1.6 rad/s.
  That is about 2.7 s to the hero band, so a 0.5 s reaction leaves over 2 s to step aside.
- Schedule (s per pebble, lap 0): dawn 14 (none in the first 20 s of loop 1), noon 9, sunset 6, night 5.5. ±30 % jitter,
  +10 % rate per loop capped at +40 %. Easy has half the rate (and 30 s of grace at dawn). Hard has ×1.35.
- **Fair aiming**: 35 % of pebbles aim near him (± 60–160 px from x + 0.4 s·vx), the rest anywhere. A pebble never lands within 60 px
  of that spot unless it gives ≥ 1.3 s to the hero band (Easy: never). Two pebbles in the hero band at about the same time (± 0.9 s)
  land ≥ 130 px apart, so a gap to stand in always exists. Each warning event carries the exact predicted landing x (`it.lx`, shadow ring)
  and `it.shadow` 0..1. The tests check ≥ 1.3 s fall time, zero trap pairs over 18 runs × 150 s, and that Easy never aims near him.
- Hit: dist < 18 + hogR × 0.8 (forgiving). A bonk costs −1 heart, resets the streak, gives 1.5 s of invulnerability (Easy 1.8, Hard 1.2),
  shows the 'bonk' frame for 0.6 s and knocks him back at 170 px/s. The pebble bounces off and is then harmless.
  Landed pebbles roll a little and fade within 0.8 s, and are harmless.

## 7. Weather (`MP.Weather`)
Fixed 1/60 s steps (deterministic) and a hard cap of 176 particles (< 180, tested under burst spam in every zone).
Zone ambience: dawn has fading twinkles (they dim 60 % over 40 s as the Earth rises) and slow motes plus front dust. Noon has glittering motes.
Sunset has motes and a shooting star every 4.5–7.5 s. Night has 36 twinkling stars, a shooting star every 3–5 s and glowing motes.
`ambient.glow` (bubble glow) is 0.15 / 0 / 0.35 / 1.
Bursts:
- 'pop': droplets flung outward at 110–210 px/s, inheriting 80 % of the bubble's velocity (from `opts` or looked up in the last world), under Moon gravity 400 px/s², fading over 0.45–0.7 s.
- 'dust': low sideways puffs.
- 'star': dizzy stars.
- 'spark': magnet sparks.
- 'confetti', 'crumb' (pastel sprinkles that bounce), 'sparkle', 'twinkle'.

Automatic effects: wheel dust when skating faster than 170 px/s on the floor, and magnet sparks drawn inward on the field ring.

## 8. Sim results (`tests/sim/results/playtest_baseline.md`: 30 rounds per cell, 15 min cap)
| Check | Result |
|---|---|
| kid6 (skate only, no jumps, 0.5 s reaction) clears dawn on Normal | **100 %**, median 55 s |
| kid4 (0.6 s reaction, lapses) clears dawn on Easy | **100 %**, median 48 s |
| Bot 0.8 on Normal, s per level dawn / noon / sunset / night | **52 / 55 / 61 / 66** (target 45–90) |
| Bot 1.0 clears the first loop on Normal | 100 % (median survival > 15 min, 0.04 bonks/min) |
| First pop after 'go' | 1.3–1.9 s (skaters), 3–4.7 s (patient bots waiting for ×2 pops) |
| Spam-jump exploit (median score vs casual) | easy 17150 vs 17940, normal 5170 vs 4830, hard 2130 vs 1980: not dominant (it bonks more) |

Survival (median min): Normal: bot0.8 10.3, kid6 5.9 (5 levels, 53 % finish loop 1), casual 6.0, kid4 5.5.
Easy: kid4 15 (cap; 43 % die before 15 min). Hard: casual 2.9, bot0.8 6.0.
The bot's pop rate is 86–96 %. The skill-1 bot lets a few more bubbles go because it waits for higher-value pops.
About 70 % of the bot's pops are in the air, and its best chain is 5–7.
Speed: 10 simulated minutes (world + bot + weather) take 0.9–1.4 s.

## 9. Tuning notes
- **Level length is set by the spawn rate**: about boxTarget × spawnGap. Catch rate only matters for weak players.
  Change `boxTargets` or `spawnGap` to change pacing; `lengthK` 0.7 / 1.4 gives about 35 s / 75 s on dawn.
- **Kid-friendliness lives in three numbers**: `puffTime` (the telegraph), `rise` (the length of the low "ground pop" window,
  about 1.3 s at 65 px/s) and the pebble rate and delay. Escapes never cost hearts, so a slow kid always fills the box eventually.
- **Danger is pebbles only**: Normal deaths come from about 0.8 bonks/min for kids and casual players. If Normal feels too hard for 6-year-olds,
  first raise `pebbleGap` for noon to night (e.g. 11 / 7.5 / 7), or set `healOnClear` 1 for every loop.
- **Jumping is the skill expression**: ground pops are worth ×1, air pops ×2/×3 plus chain bonus. The bot's patience parameter
  (wait for high pops when nothing is urgent) shows that good play is 60–75 % air pops.
- Spam-jumping earns up to 9 % more per minute than the casual model but dies a little sooner. `landLag` (0.1 s) is the knob if it ever needs a nerf.

## 10. Bot (`MP.Bot`)
For every bubble the bot builds a *ground* plan (be under it while y > ≈ 400) and *jump* plans (sample hit times; the arc meets the
bubble's height on the way up or at the apex; jump time ≥ reaction delay; reachable at 0.8–0.9 × maxSpeed).
Utility = points / (t + patience), where patience = 0.6 + 1.8·skill, plus chain potential, streak rescue and a magnet bonus.
A committed jump keeps its hit time; re-planning used to postpone the jump forever.
For a jump plan it waits *beside* the bubble's path while the bubble is still low (otherwise it pops it from the floor) and steps under it just in time.
Every path, including the whole arc, is checked against the predicted pebble paths, and unsafe plans are dropped.
In the air it steers to the bubble the remaining arc can touch, which is how it chains.
Skill < 1 adds a reaction delay of 0.06 + 0.35·(1 − s) s, a notice delay, aim noise (σ 22·(1 − s) px), jump-timing error (±0.08·(1 − s) s)
and overlooked pebbles (35 %·(1 − s)).
