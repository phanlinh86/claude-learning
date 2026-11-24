# Nubi's Farm Fling — Mechanics

Code: `game/js/world.js` (CFF.World), `game/js/bot.js` (CFF.Bot), `game/js/weather.js` (CFF.Weather).
Tests: `node tests/unit/run.js` (29 tests, ~20 s); `node tests/unit/run.js --stats` adds the long bot / kid report (§6).
All world values are in units **u** (≈ 1 m) and seconds, y UP, grass top y = 0 (DESIGN §2). The day–night cycle of
the fox game is gone: no `dayT`, `light`, `isNight`, `night`/`dawn` events or `NIGHT_PREVIEW`.

## 1. One step function

Everything that predicts the future uses the **same** code as the live flight:

| User | What it runs |
|---|---|
| live flight | `stepMovers` + `stepFlight` each 1/120 s sub-step |
| `preview(n, dt)` | a copy of wagon / crows / fireflies + the same `stepMovers` + `stepFlight` (pickups and bumps included) |
| `predictShot(pull, wait, puffAt)` (bot, tests) | same, after `wait` s of aiming (the wagon keeps rolling and Nubi keeps growing) |
| `solveSpeed` / `bodyLand` (arc generator, bot, kid model) | `stepBody` only (size growth + buoyant gravity + drag; no pickups) |

`stepFlight` = `stepBody` (growth, gravity, drag) → tilt / bonk spin → firefly pickups → crow bounce → landing / flop / plop
tests. Integration: `x += v·h + ½·a·h²; v += a·h` with `a` from the start of the step, so at size 1 the arc is an exact
parabola (unit test: error < 1e-6 u). The preview is identical to the real flight to 1e-9 u at sizes 1 and 1.7, and also
with real fireflies and a crow on the way (unit test).

## 2. Growth twist

| Key | Value | Why |
|---|---|---|
| `SIZE_MAX` | 1.7 | at 1.7× Nubi is 2.2 u wide: clearly bigger, still never covers the wagon |
| `GROW_RATE` | 0.006 /s | "soaking up mist": +0.1 in ≈ 17 s of play — felt over a level, never sudden |
| `GROW_FLY` / `GROW_GOLD` | 0.05 / 0.1 per firefly | a perfect 5-firefly shot adds ≈ 0.25 |
| `SIZE_EASE` | 4 /s | `size` eases toward `goal` (≈ 0.25 s): a gulp swells Nubi smoothly, no pops (max 0.004 per step) |
| `SHRINK_EASE` | 2.5 /s | the shrink while raining is 95 % done by the end of the 1.2 s rain phase |
| `RAIN_KEEP` | 0.4 | landing: `goal = 1 + (goal − 1)·0.4` (raining uses 60 % of the extra water) |
| `PLOP_LOSS` | 0.15 | plop: `goal = max(1, goal − 0.15)` |
| `BIG_AT` | 1.4 | `big` event when size crosses it upward; a landing at ≥ 1.4 is a Big Shower (+2) |
| `BUOY` | 0.15 | `g = G·(1 − 0.15·(s − 1))`: 9 → 8.06 u/s² at 1.7 (a puffier cloud is lighter) |
| `DRAG` | 0.05 /u | `a = −0.05·(s − 1)·|v|·v`; 0 at size 1, 0.035/u at 1.7 (a 10 u/s Nubi loses 3.5 u/s²) |
| `RAIN_PAD` | 0.5 u | landing pad `LAND_PAD + 0.5·(s − 1)`: +0.35 u each side at max size (rain falls wider) |
| pickup | `R_NUBI·s + R_FLY` | 0.8 u at size 1, 1.12 u at 1.7 |
| bottom | `FOOT·s` | the art's bottom line (108/128 of a 1.3 u box) scales with the sprite |

Why these drag/buoyancy numbers: buoyancy alone would make a bigger Nubi fly *further*. Drag must win at every pull so
the rule "bigger = shorter, slower, floatier" is always true (unit test over pulls 0.8–1.4 u × 35°/45°/55°), but it must
stay small enough that a **full pull at 1.7 still reaches the farthest wagon** (x 14.5): it reaches 16.9 on the grass /
≥ 15.5 at the wagon top (unit test, + a real max-size shot onto the far winter wagon on Hard). A medium pull
(1.1 u at 45°) lands 10.65 u at size 1 and ≈ 1.3 u shorter at 1.7, and hangs a little longer.
Candidates tried: BUOY 0.3 / DRAG 0.065 (weak lobs flew *further* when big — rejected), 0.2 / 0.06 (barely monotone),
0.12 / 0.05 (too little float). 0.15 / 0.05 had the best balance.

Size and levels: a new level keeps the size (reward). `setSize(s)` (test hook) sets size = psize = goal at once and
re-lays the fireflies of an aiming shot. `new CFF.World({ size })` starts at that size (clamped to [1, 1.7]).

Fireflies are laid for the **current** size: the generator expects the size `ARC_WAIT` = 1 s from now, solves a launch
speed with `solveSpeed` (size-aware), places 3–5 fireflies on that path (jitter ≤ 0.12 u), then re-traces the shot WITH
the pickups (each gulp makes Nubi bigger → shorter flight) and re-aims up to 4 times until the perfect shot collects
them all and lands within 0.25·hw of its target; then 1–2 bonus fireflies off the arc. Verified for 120 seeds × sizes
1 / 1.35 / 1.7 (`world.solution = {pull, angle, T, landX, wait, size}`). Gold firefly chance `GOLD_P` = 0.125 (1 in 8,
worth 3).

## 3. CONFIG (everything else)

| Key | Value | Why |
|---|---|---|
| `STEP` | 1/120 s | fixed sub-step with accumulator; `alpha` = leftover fraction for render lerp |
| `G` | 9 u/s² | a bit lighter than Earth: 1.4–2.2 s flights read as "wheee… pitter-patter" |
| `VMAX` | 14 u/s | full-pull speed; ½–⅔ pulls reach the wagon |
| `PULL_MAX` / `PULL_MIN` | 1.8 / 0.3 u | big visible band; a smaller pull cancels |
| `PULL_DOWN` / `PULL_FWD` | 1.4 / 0 u | Nubi stays ≥ sling.y − 1.4; can't be pulled in front of the fork |
| `PUFF_VY` | 3.2 u/s | puff only when vy ≤ 3.2, then vy = 3.2: ≈ +0.57 u rise / +0.7 s hang time; a tap while still shooting up is ignored and not used up |
| `R_NUBI` + `R_FLY` | 0.45 + 0.35 u | generous pickup (×size for Nubi) |
| `FOOT` | 0.45 u | body centre → bottom at size 1 |
| `LAND_PAD` | 0.15 u | the edge of the cloud on the wagon still counts |
| `BUMP_E`, `CROW_R` | 0.7, 0.42 u | soft crow "boing"; hit radius `R_NUBI·s + CROW_R` |
| `BALE_X`, `BALE_TOP` | 4.6, 1.2 u | a weak fling that comes down on the hay bale is a harmless flop (retry of the same shot) |
| `OUT_L` / `OUT_R` | −1 / 17.5 u | leaving the field sideways is a plop |
| `WAGON_TOP`, `WAGON_GLIDE` | 0.55 u, 0.9 s | soil top; the wagon rolls (smoothstep) to its next spot — no teleports |
| `LAND_T` / `PLOP_T` / `FLOP_T` | 1.2 / 1.2 / 0.8 s | outcome display times (rain phase long enough for the crops to pop) |
| `LAND_KEEP`, `FRICTION` | 0.3, 5 u/s² | touchdown keeps 30 % of the vx relative to the wagon, then friction; Nubi rides the rolling wagon, bottom stays on the soil while shrinking |
| `ROT_RATE`, `TILT` | 7 /s, 0.45 | a cloud doesn't nose-dive: rot eases toward 0.45 × the velocity angle (≈ ±35° max) |
| `BONK_T`, `BONK_SPIN`, `BONK_DRAG` | 0.5 s, 11 rad/s, 4 /s | short tumble after a crow bump |
| `PUFF_T` | 0.45 s | `puff` frame duration |
| `PLOP_SQUASH`, `PLOP_RATE` | 0.75, 6 /s | after a plop the centre eases to `FOOT·s·0.75` (the pancake frame) |
| `FLY_BOB` / `FLY_BOB_T` | 0.06 u / 2.2 s | fireflies hover gently (well inside the pickup tolerance) |
| `CROW_SPEED`, `CROW_Y` | 0.5–0.9 u/s, 2.5–5.5 u | slow drift with wrap; crows climb to y ≥ 5.2 over the slingshot (x < 5.4) |
| `MIN_WAGON_DX` | 5 u | the wagon never comes closer than 5 u to the sling |
| `FLY_Y`, `FLY_MIN_X`, `FLY_GAP` | 1.0–6.8 u, 4.4 u, 0.9 u | fireflies in the calm band, off the bale/sling, spaced out |
| `ARC_ANG`, `ARC_APEX`, `ARC_WAIT` | 34°–64°, 6.5 u, 1 s | solution-arc angles, max apex, expected aim time |
| `LANDINGS_PER_LEVEL` | 5 | then the next season |
| `PREVIEW_DT` | 0.06 s | dot spacing; dots per level = `LEVELS[i].PREVIEW × DIFF.previewK` |
| `POINTS` | fly 1, gold 3, land 2, bull +3, big +2, streak +1/step (max +4) | |
| `LOOP_CAP` | 3 | loops get harder up to loop 3, then stay |

`DIFF`: easy 5 hearts, heart back every 12 fireflies, wagon ×1.4, bull ×1.2, roll ×0.5, preview ×1.6, slower crows;
normal 3 / 20 / ×1; hard 3 / 25, wagon ×0.85, roll ×1.25, preview ×0.75, +1 crow where crows exist.

`LEVELS` (`x` range of the wagon centre incl. rolling, `hw` half width, `amp`/`period` roll, crows, preview dots):
spring "Spring Sprouts" 7.3–13.8, 1.6, parked, 0 crows, 34 · summer "Sunflower Summer" 7.4–14.0, 1.45, 0.7 u / 6.5 s, 0, 24 ·
autumn "Pumpkin Autumn" 7.8–14.3, 1.3, 0.85 / 5.5, 1 crow, 18 · winter "Snowy Winter" 8.3–14.5, 1.2, 0.95 / 5.2, 2 crows, 13.

## 4. Weather (screen px)

Ambient per season (counts at 960×540, scaled by area): spring 14 petals + 4 butterflies; summer 6 butterflies + 10
sparkles; autumn 14 tumbling leaves (pendulum: sideways speed ∝ cos, fall faster through the middle of each swing,
rocking ±0.9 rad + a steady spin, wind drift right); winter snow in 3 depth layers — far 26 (5–7 px, 14–22 px/s, layer
`sky`, fades out behind the hills), mid 20 (8–11 px, 26–38 px/s, `back`), near 10 (13–18 px, 44–62 px/s, `front`), each
with sinus sway. Everywhere 3–4 tiny ambient fireflies (layer `back`, slow wander, glow pulse).
Bursts: `plop` (mist puffs spreading along the grass + drops), `fly` (sparkles with drag + one swelling glow), `land`
(shower of n drops over `opts.width` px, staggered over 0.7 s, gravity, a ripple where each hits `y + opts.fall`; snow in
winter or with `opts.snow`), `bump` (stars), `puff` (small puffs), `grow` (ring of tiny puffs pushed outward from
`opts.r`). Cap 160 particles, ambient ≤ 120. Sprites `p_sparkle p_drop p_snow p_ripple p_star p_firefly p_petal
p_butterfly p_puff p_leafbit p_glow` (the autumn leaf uses `p_leafbit`).

## 5. Bot

Size-aware: the size at release comes from `world.sizeAfter(AIM_T)`. For angles 30°–70° (5° steps) it solves the speed
with `solveSpeed` for the wagon position predicted at landing (3 iterations when the wagon rolls), replays the shot with
`predictShot` (pickups make Nubi bigger mid-flight) and re-aims once by the landing error. Score: land +100, bull +8,
firefly points ×6, crow bump −40, small angle/centre preferences. Error σ: angle (1 − skill)·35°, power (1 − skill)·58 %.
Puff when the prediction says "short" and a puff now would land (skill ≥ 0.3). Think 0.4–0.9 s, pull animated over 0.5 s.

## 6. Results (`node tests/unit/run.js --stats`, 6 seeds × 300 s, immortal)

| Bot | land easy / normal / hard | fireflies/shot | Big Showers per landing | s per level |
|---|---|---|---|---|
| skill 1 | 99.5 / 98.9 / 96.4 % | 4.8 | 0.74 | ≈ 21 |
| skill 0.85 | 89.8 / 82.8 / 77.5 % (mean 83 %) | 3.5 | 0.31–0.37 | 22–26 |
| skill 0.6 | 64 / 58 / 54 % | 2.2 | 0.07–0.14 | 32–38 |
| skill 0.5 | 58 / 47 / 43 % | 2.0 | ≈ 0.1 | 34–46 |

Casual kid model (4–6 years, aims the visible size-aware preview at the wagon, hand error 0.9 u): Spring on Easy shot 1
77 %, shot 2 79 %, shot 3+ 88 %; skill-0.5 bot on Spring Easy from attempt 3: 71 %. Kid time per season on Easy:
spring 40 s, summer 42 s, autumn 49 s, winter 61 s (land 78 / 76 / 65 / 51 %).
Performance: 10 simulated minutes (bot 0.85 + world + weather + preview every other frame) ≈ 2.0 s in node.
