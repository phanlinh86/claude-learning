# Shelly's Sky Catch — Mechanics

The mechanics code lives in `game/js/world.js`, `weather.js` and `bot.js`, with `rng.js` as the seeded RNG. All three modules are headless and deterministic, and none of them touch the DOM. The contract they follow is `docs/DESIGN.md` §5. Every number below is defined in `SC.CONFIG`, with its units and a one-line reason next to it. `SC.DIFFICULTY` overrides some of these numbers for Easy and Hard.

## 1. Simulation loop
- `update(dt)` uses a fixed-step accumulator: sub-steps of **1/120 s**, and `w._acc` holds the leftover time. The result depends only on the seed and on the sub-step at which each input call happens. A unit test checks that the dt partitions 1/30, 1/40, 1/60 and 1/120 give the same result.
- At the start of every sub-step, `_px,_py` are saved on the snail and on every item, so the renderer can draw `_px + (x − _px)·_acc/step`.
- Each sub-step runs in this order: wind → Shelly (horizontal) → Jet Hop (vertical, rim) → state machine (ready → playing → grace → cleared) → drops → items (catch / ground) → visuals (tilt, face, squash, frame).
- States:
  - `ready` lasts 1.4 s. There are no drops, but Shelly can move and hop.
  - `playing` comes next. When the jar fills, a **1 s grace** follows (still `playing`): falling stars can still be caught, while peeks are removed and falling puffs pop.
  - `cleared` lasts 2.2 s, then the next level starts.
  - `dead` is the end of the game.

## 2. Shelly
| | Value | Why |
|---|---|---|
| maxSpeed | 380 px/s | Crosses the 820 px floor in about 2.2 s, faster than any star falls |
| accel / brake (keys) | 2400 / 3000 px/s² | Reaches full speed in 0.16 s and stops in 0.13 s (about 24 px of drift): responsive but soft |
| pointer-follow | `v_des = sign·min(vmax, ω·dx, √(2·0.5·F·dx))`, ω = 13/s, F = 4200 px/s² | Near the target the approach is exponential, so there is no overshoot. Farther out, the braking parabola uses half the acceleration cap, so the spring never asks for more than the cap allows. This still holds on ice. Tested: stops within 3 px, overshoot < 3 px. |
| snow grip | ×0.35 on accel, brake and F | She slides about 70 px after you let go, and gets up to speed slowly, but her top speed is unchanged |
| wind drift | `vw → wind.x·0.45`, capped at 15 % of maxSpeed, eased at 2/s | A separate velocity component. Pointer-follow compensates for it (like a finger holding position). Idle keys drift with the wind. |
| tilt | `vx·0.22/380`, at most ±0.22 rad, eased at 8/s | Positive tilt is clockwise: she leans into her motion |
| face | ±1 with a 30 px/s dead zone | Stops the sprite flipping back and forth on tiny moves |
| basket sway | `s'' = −ω²s − 2ζωs' − 0.3·ax`, f = 1.6 Hz, ζ = 0.22, at most ±10 px | The basket lags about 7 px on a hard start, swings forward when she stops, wobbles 2–3 times and settles in about 1 s. `rimX = x + sway`. |
| squash | catch 0.6 / zap 1 / landing 0.75, decays at 8/s | Feedback (the renderer scales by about 15 %) |

## 3. Falling items (drag + gravity)
Vertical: `vy += (g − k·vy)·h`, which gives terminal speed `vT = g/k` with time constant `1/k`.
Horizontal: the item's centre line follows `vx += (wind.x·windK − kx·vx)·h` with kx = 1.1/s, so wind is an acceleration and drag limits the drift.
Flutter: `x = bx + A·sin(φ)`, where φ advances at ω while the item falls. `rot` = spin plus a wobble of 0.16·cos φ, so the item tilts with its swing like a falling leaf.

| Kind | vT (px/s) | k (1/s) | windK | Sway A / ω | Spin (rad/s) | Value |
|---|---|---|---|---|---|---|
| star (r 15) | 165 | 2.0 | 1 | 10 px / 2.6 | 0.6–1.4 | 1 (10 points × mult) |
| gold (r 20) | 248 (×1.5, heavier) | 1.4 | 0.55 | 5 / 3.4 | 2.4–3.4 | **5** (50 × mult) |
| thunder puff (r 19) | 99 (×0.6) | 2.6 | 1.3 | 16 / 1.4 (bobbing) | 0 | heart −1 |

- A star takes about **2.3 s** from the cloud bank (y 96) to the rim (y 384), after a 0.6 s peek (0.8 s on Easy). A gold star takes about 1.8 s and a puff about 3.3 s.
- Weather multiplies the terminal speed: rain ×1.15 (wet stars), snow ×0.85 with sway ×1.8 (fluttery). Each loop adds +12 %, capped at ×1.7. Easy is ×0.82, Hard ×1.12.
- Side limits: the centre line bounces softly off the play range (restitution 0.35), so a blown star always stays where Shelly can reach.
- On the floor, a star bounces once (restitution 0.4, g 400, a hop of about 5 px), then fades over 0.6 s and fires `miss`. A puff pops and fires `puffland`.
- `World.predict(it, Y)` solves the same ODE exactly: Newton on `y(τ) = y0 + vT·τ + (v0 − vT)/k·(1 − e^{−kτ})`, plus the closed-form horizontal drift and the sway phase. It includes the remaining peek time. It matches the sim to within 2 px and 0.02 s in calm air, and within 6 px in wind (the gust turbulence is the only part it leaves out). `itemAt(it, τ)` gives the position at any time, and the bot uses it for hop planning.

## 4. Catching and scoring
- **Catch test:** the item enters the basket opening from above during a sub-step. In coordinates relative to the moving rim, `y − rimY` goes from negative to ≥ 0, and the x interpolated at that crossing is within `36 + r·0.5` of the interpolated rimX (44 on Easy). Because the test uses the rim's own previous and current positions, a Jet Hop that rises into a star catches it.
- **Scoring:** points = value × 10 × mult. The streak counts every star or gold, with thresholds `[0, 8, 20]` giving ×1 / ×2 / ×3 (Easy `[0, 5, 12]`), and `multup` fires on each step up. A missed star resets the streak and mult to ×1.
- **Thunder puff caught:** `zap`, hearts −1, the streak resets, 1.2 s of invulnerability (1.6 s Easy, 1.0 s Hard) and the frame shows `zap`. A puff caught while invulnerable pops harmlessly (`pop`). At 0 hearts the state becomes `dead`.
- **Jar:** every star or gold adds +1. Targets are 20/22/26/30 (Easy 14/17/20/23, Hard 22/26/30/34). When the jar is full: `jarfull`, then the grace second, then `cleared` with bonus = hearts × 100, and +1 heart on the first loop (two loops on Easy, never on Hard).

## 5. Drops (scheduler + fairness)
- **Gap between drops:** Normal 2.1 / 1.85 / 1.75 / 1.6 s (sunny / rain / wind / snow), Easy 2.8 / 2.5 / 2.35 / 2.2, Hard 1.7 / 1.55 / 1.45 / 1.35. Each gap is jittered ±15 %, and each loop shortens it by 8 % (minimum 0.8 s).
  - These are slower than the "e.g." numbers in DESIGN (1.5 → 1.1 s). With those numbers an 18-star jar filled in about 30 s. The brief asked for levels of about 45–90 s, which these slower gaps give.
- **Mix:**
  - Gold is 8 % of stars, and one is guaranteed by the time the jar is half full.
  - Thunder puffs: sunny 8 % (none in the first 20 s of the first loop), rain 16 %, wind 14 %, snow 18 %. Each loop adds +12 %, capped at 48 % (loop 1 is untouched; the cap is reached on loop 4). Easy is about 60 % of these, +6 % per loop, capped at 30 %. Hard is higher, capped at 52 %.
  - Never more than 2 puffs in a row. 40 % of puffs aim near Shelly (±150 px; 60 % on Hard), so they are a threat to read, never a trap.
- **Fair aim:** up to 40 random candidates in the drop range. The new item itself is the probe (its flutter phase is part of the aim). Each candidate's crossing is predicted with the current wind. Its cost is:
  - Star: `|x − lastStar.x| − 36 − 230·Δt` (chainable at 230 px/s, about 60 % of max speed; Easy 150, Hard 280). When no star is pending, the reach from Shelly is used instead. Add 3 × (110 − d) when it crosses within 110 px and 0.7 s of a puff.
  - Puff: (110 − d) against every pending star.
  - From loop 3 on, the keep-out shrinks by 35 px per loop (110 → 75 → 40 px, minimum 40), so endless runs eventually end.
- Measured over 10 seeds × 4 levels: unfair star pairs < 1 % in calm weather (about 4 % in wind, where a later gust moves an earlier star; Jet Hop is the answer), and at most 2 puff/star conflicts. The test also checks that every level has a gold star.
- `setPlayRange(xMin, xMax)` (mobile) sets Shelly's clamp. The drop range becomes `[max(80, xMin + 10), min(880, xMax − 10)]`. Peeking items are moved into the new range. Falling items whose centre line is outside are moved in; they start from vx = 0 and `_px` is reset, so there is no smear.

## 6. Jet Hop
- `action()` works when `charge ≥ 1`, Shelly is on the hover line and the state is not `dead`. It sets `vy = −570`, with gravity `jetG = 1630`. From `v = 4H/T` and `g = 8H/T²`, this gives an **apex of 100 px** and an **air time of 0.70 s** (both tested).
- While airborne, her sideways max speed is ×1.35. On landing: `jetland` and squash 0.75. The charge refills over **2.5 s** from landing (2.0 s Easy, 3.0 s Hard), then fires `jetcharged`. `jet.cooldown` is the number of seconds until the hop is ready.
- `rimY = y − 46`, so a hop meets falling stars about 0.3–0.5 s earlier: before the wind takes them, or when they are too far to reach on the floor.
- `flame` is 1 at take-off, follows the rise speed and decays at about 0.1 s after the apex.
- Spamming the hop is not an exploit. The `spamJet` model scores about the same as `casual` (fewer than 40 % of its hops catch anything).

## 7. Wind (the wind level)
- Gusts are scheduled only when `windMax > 0`. That is the wind level, with 110 px/s² on Normal (Easy 75, Hard 140) and +10 % per loop.
- Each gust goes through these steps:
  1. The first telegraph comes after **4 s** of play.
  2. **`gustwarn {dir}` fires 1.2 s before the gust.** `wind.warn` counts down and `wind.nextDir` holds the direction.
  3. `gust {dir, strength}` fires, with strength in [0.45, 1] × windMax. One gust in five is a lull at ×0.2.
  4. The new target is eased in with a smoothstep over 0.6 s.
- Gusts come every **5–8 s**. The direction flips 70 % of the time.
- A slow turbulence of ±8 % keeps the wind alive (it is a deterministic function of time). `wind.level` = |x| / windMax, from 0 to 1, for the windsock.
- With a 110 px/s² gust, a star drifts sideways at up to about 100 px/s (about 50 px over the first 1.2 s). Gold drifts about half as far.
- In the other weathers `wind.x` stays at 0. Outside `playing`, the wind eases back to calm.

## 8. Weather particles (`SC.Weather`)
- Fixed sub-steps of 1/60 s, deterministic for any dt partition. There is a **hard cap of 176 particles**, of which at most 64 are gameplay fx. It holds during hand-overs between zones and during fx spam (tested).
- **Sunny:** 14 back motes (velocities ease toward random wander targets), 5 sparkle glints (sin² life) and 2 front motes. Calm.
- **Rain:** 32 back drops (thin, 470–560 px/s, end behind the floor at y 455–478) and 16 front drops (big, 760–880 px/s). Both slant with a base lean plus `wind.x`. Front drops make a `splash` on the floor at y 488–496.
- **Wind:** 13 streaks in 2 layers. Their speed and alpha follow `wind.level`, and while `wind.warn > 0` they preview the new direction (`flipX` = direction). 10 petals use a falling-leaf pendulum, and their velocity relaxes toward `wind.x`.
- **Snow:** 3 depth layers (28 / 20 / 8). Size, fall speed and alpha grow with depth. Each flake drifts on a pendulum `x = x0 + A·sin φ`, falls a little faster through the bottom of its swing, tumbles, and follows the wind by depth (parallax).
- **Fx:**
  - `burst(kind, x, y, n)` supports sparkle, twinkle, zap, puff, splash and confetti. Confetti is ballistic with air drag and a flutter `flipX`, lands on the floor and takes its `color` from a palette.
  - `jet(x, y, s, {vx, vy, face})` emits exhaust that goes down and backwards and inherits 30 % of Shelly's vx. It has drag, floats up a little, grows ×2.2 and fades.
  - **`update()` emits jet puffs automatically from `env.snail.flame`** at the nozzle `(x − 30·face, y + 16)`, so the renderer must not also call `jet()` every frame. Pass `{autoJet:false}` to turn this off.
- Sprite names: sparkle, twinkle, puff, rain, splash, snowflake, streak, petal, zap, mote, plus `dot` and `confetti`. `ambient {tint, fog}` blends between zones during a hand-over.

## 9. Bot (`SC.Bot`)
1. Predicts each item's crossing of the resting rim with `world.predict`, which covers peeking items, wind and sway. An item is noticed after (1 − skill)·0.45 s.
2. Builds a DP chain of reachable stars. Each star is worth its value + 2. It counts as reachable when `|Δx| ≤ v·Δt + slack`, with v = 380·(0.78 + 0.15·skill), ×0.8 on snow. The bot heads for the first star of the chain and leans toward the next one.
3. For Jet Hop, it simulates a hop starting now (rim arc and air speed) against `itemAt()` for each star that arrives within 1.2 s. It hops when the hop catches a star it cannot reach otherwise, or a gold star, and no puff meets the hop path.
4. Thunder puffs: it side-steps toward the side of its plan. A lower-skill bot misses (1 − skill)·30 % of puffs.
5. Below skill 1 it also adds a reaction delay (0.05 + 0.3·(1 − skill) s), aim noise (σ 24·(1 − skill) px) and slower decisions.

`bot.stats` = { decisions, catches, gold, misses, zaps, jets, jetCatches, levels, deaths, maxLevel }.

## 10. Results
> **Tuning update (playtest 2026-11-15, `docs/reports/playtest.md`).** The loop ramps, Easy/Normal jar targets and medals were changed after the tables below were measured. Loop 1 is untouched apart from the jar targets (sunny now ≈ 43–47 s). After the change, the casual adult on Normal survives a median **15.2 min** (was 22.8), bot1.0 Normal 17.9 min (was ≥ 30), kid4 on Easy 12.4 min with 99 % clearing loop 1, kid6 on Normal 8.7 min with 100 % clearing loop 1. Medals are now bronze 700 / silver 3000 / gold 8000 / platinum 18000 (before: 300 / 1000 / 2200 / 4000, which every model reached). Full before/after tables: `tests/sim/results/playtest_baseline.md` and `playtest_proposed2*.md`; re-run with `node tests/sim/playtest.js`.

Run with `node tests/unit/run.js`: **30 unit tests, all passing.** Ten minutes of world + bot + weather simulate in about 1.1 s.

### Bot × difficulty
`node tests/sim/run.js 30 15`, 30 runs per cell, 15-minute cap.

| Diff | Skill | Clear L1 | Catch rate | Died within 15 min | s per level (sunny / rain / wind / snow) | Jets/min (share that catch) |
|---|---|---|---|---|---|---|
| easy | 0.3 / 0.5 / 1 | 100 % | 1.00 | 0 % | 37 / 44 / 50 / 56 | 2.2 (64–96 %) |
| normal | 0.3 | 100 % | 0.96 | 33 % | 42 / 52 / 56 / 68 | 2.4 (93 %) |
| normal | 1.0 | 100 % | 1.00 | 13 % | 42 / 51 / 56 / 62 | 2.4 (69 %) |
| hard | 0.3 | 100 % | 0.91 | 53 % | 47 / 58 / 61 / 72 | 2.7 (94 %) |
| hard | 1.0 | 100 % | 0.99 | 30 % | 45 / 54 / 57 / 64 | 2.6 (74 %) |

### Player models
`node tests/sim/players.js --n 40`. Full tables are in `tests/sim/results/players_baseline.md`.

| Model | Diff | Clears sunny / rain / wind / snow | Median s per level | Catch rate (sunny) | Survival (median) |
|---|---|---|---|---|---|
| kid4 (4-year-old) | **easy** | 100 / 100 / 100 / 100 % | 40 / 48 / 58 / 64 | 0.91 | 13.9 min |
| kid4 | normal | 100 / 85 / 83 / 75 % | 49 / 60 / 78 / 86 | 0.87 | 7.6 min |
| kid6 (6-year-old) | **normal** | 100 / 100 / 100 / 100 % | 43 / 57 / 63 / 78 | 0.98 | 12.7 min |
| kid6 | hard | 100 / 98 / 90 / 75 % | 51 / 62 / 74 / 82 | 0.88 | 6.7 min |
| casual adult | normal | 100 % for all four | 43 / 54 / 58 / 68 | 1.00 | ≥ 15 min (13 % die) |
| casual adult | hard | 100 % for all four | 48 / 57 / 63 / 72 | 0.93 | ≥ 15 min (30 % die) |
| spamJet (exploit) | normal | 100 % | 43 / 52 / 57 / 67 | 1.00 | about the same as casual, 37 % of hops catch |
| park (never moves) | normal | 60 % sunny | 326 | 0.12 | 6.8 min (always dies) |
| mash (random finger) | easy | 100 % sunny, 0 % snow | 241 | 0.15 | Easy is a soft floor for toddlers |

- Level 1 on Normal is very winnable for a 6-year-old (100 %, 98 % catch rate). Level 1 on Easy is very winnable for a 4-year-old (100 %, 91 % catch rate).
- With real child models, levels take about 40–90 s.
- Gold stars earn about a third of all star points (the twist matters). Kids reach ×2 in every run, and ×3 in 35–100 % of runs.
