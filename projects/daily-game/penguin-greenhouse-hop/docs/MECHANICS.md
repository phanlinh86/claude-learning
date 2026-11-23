# Puddle's Greenhouse Hop — Mechanics

Owner: mechanics engineer. Files: `game/js/world.js` (PH.World), `game/js/weather.js` (PH.Weather), `game/js/bot.js` (PH.Bot), `tests/unit/run.js`, `tests/sim/*`.
Contract: `docs/DESIGN.md` §5.1–§5.4. Run the tests from the project folder with `node tests/unit/run.js` (37 tests, ≈ 1.6 s). Pacing table: `node tests/sim/pacing.js 20` (≈ 1 min).

Units are **u** (1 u = 1 metre on the HUD) and seconds. `y` grows upward; `hero.y` is Puddle's **feet**, her body centre is `hero.y + 0.55·size`.
The values in `CONFIG` are the truth; this file explains them.

## 1. CONFIG (world.js)

### 1.1 Hopper core (kept from the fork's playtested numbers)

| Key | Value | Unit | Why |
|---|---|---|---|
| `step` | 1/120 | s | Fixed sub-step: a 12 u/s bounce moves 0.1 u per step, so landings are exact. Any frame rate gives the same result (tested). |
| `COLW` | 12 | u | Column width; the renderer fits 12.8 u across a portrait phone. |
| `heroR`, `wallBounce` | 0.55, −0.35 | u, × | Hero centre clamped to `[0.55·size, COLW − 0.55·size]`; hitting a pillar: `vx *= −0.35`, event `wall` (only when \|vx\| > 1.2, 0.3 s cooldown). |
| `g`, `bounceV` | 26, 12.4 | u/s², u/s | **Apex v²/2g = 2.96 u, rise 0.48 s, hop 0.95 s** — a quick springy "boing". |
| `springK` | 1.6 | × | Mushroom: 19.8 u/s, apex 7.57 u. Fires only within `springPad` 0.45 u of the pot centre. |
| `rescueK` | 1.45 | × | Umbrella: 18 u/s, apex 6.2 u. |
| `maxFall` | 16 | u/s | Terminal fall speed (readable). |
| `maxVx`, `accel`, `drag` | 5.0, 34, 8 | u/s, u/s², 1/s | At size 1: full speed in 0.15 s, release decays as e^(−8t) (drift 0.63 u). All three are scaled by the weight factor (§1.2). |
| `landPad` | 0.32 | u | A landing counts while \|hero.x − p.x\| < w/2 + **0.32·size** (her feet get wider). |
| `squashT`, `stretchRate`, `tiltMax`, `tiltRate`, `crouchT` | 0.18, 14, 0.22, 10, 0.1 | s, 1/s, rad, 1/s, s | Pose: squash 1 → 0 linear after a bounce; stretch eases toward a vy-based target; lean eases toward clamp(vx/maxVx)·0.22. |
| `startDelay` | 0.6 | s | Puddle stands (`idle`) at the door before the first hop. Growth starts with the first hop. |
| `camLead`, `camRate` | 4.2, 6 | u, 1/s | Camera bottom eases toward hero.y − 4.2, upward only. |
| `genAhead`, `removeBelow`, `fallLine` | 24, 2, 1.2 | u | Generate to camY + 24; drop below camY − 2; hero.y < camY − 1.2 is a fall. |
| `catchR`, `bodyY` | 0.8, 0.55 | u | Catch radius **0.8·(0.75 + 0.25·size)** (0.8 → 0.92 u) around the body centre `y + 0.55·size`. |
| `lanternSize`, `flyPoints`, `comboT` | 15, 10, 1.2 | flies, pts, s | Full lantern → +1 heart. Catches < 1.2 s apart raise `combo`. |
| `flyAmp`, `flyPeriod` | 0.15, 1.5 | u, s | Figure-eight bob x = 0.15·sin φ, y = 0.09·sin 2φ (no drift: the wind is gone). |
| `rescueY`, `rescueHeroY`, `rescueW`, `rescueT`, `rescueLife`, `rescueAfter`, `invuln` | 0.6, −0.4, 3.0, 1.2, 2.0, 0.5, 1.6 | u, u, u, s, s, s, s | Umbrella at camY + 0.6, aimed under the nearest live platform 1.6–5 u above camY (baskets: pivot x, +1 u penalty). Steering is ignored for 1.2 s while she is lined up. |
| `ouchT`, `happyT`, `springShow` | 0.7, 1.0, 0.25 | s | Mood hold times; `springT < 0.25` = draw `mushroom_up`. |
| `sideChance`, `sideDx` | 0.35, [2.5, 5] | p, u | Extra side platforms (never baskets, never mushrooms) — **capped so they are never traps** (§2.5). |
| `springChance`, `springFrom` | 0.08, 20 | p, u | Mushrooms on path pots only, never in the first 20 m. |
| `maxGap`, `loopGap`, `reachSafety`, `edgeMargin` | 2.7, 0.08, 0.8, 0.3 | u, u, ×, u | Gaps grow 0.08/loop, never > 2.7 u; a path step uses ≤ 80 % of the reach; platforms stay 0.3 u inside the column. |
| `leafGapMargin` | 0.15 | u | The step after a leaf is 0.15 u shorter (a leaf landed on 0.95 s earlier may still sag a little). |
| `widths` | pot 2.4, shelf 1.7, leaf 2.2, basket 2.0 | u | × difficulty `widthK`. |
| `meterEvery`, `levelBonus` | 25, 100 | m, pts | `meter` event every 25 m; floor bonus 100·(zone+1)·(loop+1). |
| `goal` | easy 115, normal 125, hard 160 | u | Climb per floor, × (1 + 0.1·loop). |

### 1.2 Growth + weight (the twist)

| Key | Value | Unit | Why |
|---|---|---|---|
| `growRate` | 0.006 (playtest: was 0.004) | size/s | Slow steady growth while playing (after the first hop, not while shrinking). |
| `growPerFirefly` | **0.006** | size | DESIGN guessed ≈ 0.02; sims showed players catch 50–80 fireflies/min, so 0.02 made Puddle max size within 20 s. 0.006 puts a casual player at `big` around the middle of floor 1 and near max at its end (§6). |
| `maxSize` | 1.6 (difficulty: Easy 1.5, Normal/Hard 1.6) | size | Cap. |
| `bigAt` | 1.3 | size | `big` = size ≥ 1.3: ×2 metre points, the bot prefers leaves. |
| `growStep` | 0.1 | size | Event `grow {size, step}` each time `floor((size − 1)/0.1)` goes up (step 1 = 1.1, …). |
| `steerK` | **0.24** | 1/mass | Weight factor `k = 1 / (1 + 0.24·(mass − 1))`, mass = size². DESIGN wrote steerK ≈ 0.35 *and* "top speed ≈ 0.73× at 1.6"; those disagree (0.35 gives 0.65×). 0.24 gives the stated 0.73×. |
| `minVxK` | 0.7 | × | Floor of k (only reachable through `setSize` > 1.65). |
| `shrinkT` | 0.8 | s | After a new floor the size eases back to 1.0 with a smoothstep (no grow events while shrinking). |
| `sizeBonusK` | 200 | pts/size | `sizeBonus = round(200·(size − 1))` → up to 100 (Easy) / 120 points. |
| `sizeHookMax` | 2.5 | size | `setSize()` clamps to [1, 2.5] (test/debug only). |

| size | 1.0 | 1.1 | 1.2 | 1.3 | 1.4 | 1.5 | 1.6 |
|---|---|---|---|---|---|---|---|
| mass = size² | 1.00 | 1.21 | 1.44 | 1.69 | 1.96 | 2.25 | 2.56 |
| weight factor k (top speed, accel, drag) | 1.000 | 0.952 | 0.904 | 0.858 | 0.813 | 0.769 | **0.728** |
| top speed u/s | 5.0 | 4.76 | 4.52 | 4.29 | 4.07 | 3.85 | 3.64 |
| release drift vx/(drag·k) at top speed, u | 0.63 | 0.63 | 0.63 | 0.63 | 0.63 | 0.63 | 0.63 |
| leaf flick × | 1 | 1.038 | 1.079 | 1.124 | 1.150 (cap) | 1.150 | 1.150 |

Mass = size² because the sprite grows in 2-D on screen (area), so "twice as much penguin" reads right at size ≈ 1.4. The release drift stays 0.63 u because both top speed and drag scale by k: she reaches a lower speed but coasts proportionally longer, which feels heavier without being slippery.

### 1.3 Leaves (`CONFIG.leaf`)

| Key | Value | Unit | Why |
|---|---|---|---|
| `k` | 250 | 1/s² | Torsion stiffness per inertia: ω0 = √k = 15.8 rad/s. |
| `c` | 6 | 1/s | Damping: ζ = c/(2ω0) = 0.19 → damped period 0.405 s, amplitude × 0.30 per cycle, envelope e^(−3t) → **< 5 % after 1.0 s**, 2–3 visible oscillations. |
| `impulse` | 2.6 | rad/s | Landing kick `bendV += 2.6·mass·lever·|vy|/bounceV`, lever = 0.5 + d/w (0.5 at the stem, 1 mid-leaf, 1.5 at the tip). |
| `maxBend` | 0.35 | rad | Hard clamp (≈ 0.9 u tip drop on a 2.6 u leaf). |
| `flick`, `flickCap` | 0.18, 1.15 | ×/mass, × | Bounce = bounceV·min(1.15, 1 + 0.18·(mass − 1)): light Puddle gets no flick; big Puddle up to 3.92 u apex. |

Measured first-landing peak bend (2.6 u leaf, landing from 3 u): size 1.0 mid 0.12 rad (tip drop 0.31 u), size 1.0 near the tip 0.18 rad, size 1.3 mid 0.22 rad, size 1.6 → hits the 0.35 rad clamp.

### 1.4 Hanging baskets (`CONFIG.basket`)

| Key | Value | Unit | Why |
|---|---|---|---|
| `len` | [2.0, 3.2] | u | Chain length; period 2π√(len/g) = **1.74 s / 1.99 s / 2.20 s** at 2.0 / 2.6 / 3.2 u (tested within 5 %). |
| `push` | 0.35 | — | Landing nudge `angV += 0.35·mass·clamp(vx/maxVx, −1, 1)·2/len` (in her vx direction, ∝ mass). |
| `maxK`, `ampCap` | 1.25, 0.5 | ×, rad | Nudges can grow the swing to at most amp0·1.25 and never past 0.5 rad (energy clamp, the direction is kept). |
| zone `basketAmp` × difficulty `basketK` | see below | rad | Starting amplitude amp0 (× 1.05 per loop). |

| amp0 (rad) → max | fern | balcony | roof |
|---|---|---|---|
| Easy (`basketK` 0.75) | 0.19–0.24 → 0.30 | 0.22–0.32 → 0.39 | 0.21–0.29 → 0.36 |
| Normal (1.0) | 0.25–0.32 → 0.40 | 0.30–0.42 → 0.50 | 0.28–0.38 → 0.47 |
| Hard (1.15) | 0.29–0.37 → 0.46 | 0.34–0.48 → 0.50 | 0.32–0.44 → 0.50 |

### 1.5 Difficulty and zones

| | hearts | gap (u) | maxDx (u) | widthK | basketK | maxSize | flyEvery (u) |
|---|---|---|---|---|---|---|---|
| easy | 5 | 1.3–2.0 | 2.6 | 1.6 (playtest; was 1.5) | 0.75 | 1.5 | 5–7 |
| normal | 3 | 1.5–2.4 | 4.0 | 1.2 | 1.0 | 1.6 | 6–9 |
| hard | 3 | 1.7–2.6 | 4.6 | 0.95 | 1.15 | 1.6 | 7–10 |

| zone | key | kinds (weights) |
|---|---|---|
| 0 | potting | pot .6, shelf .4 |
| 1 | fern | pot .3, shelf .2, leaf .35, basket .15 |
| 2 | balcony | pot .25, shelf .2, leaf .25, basket .3 |
| 3 | roof | pot .3, shelf .25, leaf .25, basket .2 |

## 2. Physics formulas

1. **Hero, vertical**: exact ballistic step `vy₁ = max(−16, vy₀ − g·dt)`, `y += ½(vy₀ + vy₁)·dt` → apex exactly v²/2g (the bot's and tests' maths match).
2. **Hero, horizontal** (k = weight factor): holding a direction `vx += dir·accel·k·dt` up to `maxVx·k`; released `vx *= e^(−drag·k·dt)`; above the cap (she just got heavier) it relaxes down at `accel·k` — never snaps.
3. **One-way landing on moving tops**: while falling, a landing happens when `y_feet(prev) ≥ surf_prev(x_prev)` and `y_feet(now) ≤ surf_now(x_now)`, where `surf` is the platform's top **at the contact x** (baskets: `prevY`/`y`; leaves: the bent surface with `prevBend`/`bend`). The highest such surface wins and the feet are put exactly on it. Every platform stores `prevX`/`prevY` at the start of each sub-step.
4. **Leaf surface**: stem at `x_s = p.x + side·w/2`; `d = clamp(|x − x_s|, 0, w)`; `surf(x) = y0 − d·sin(bend)`; `p.y = y0 − (w/2)·sin(bend)` (the centre). Torsion spring `bendV += (−k·bend − c·bendV)·dt; bend += bendV·dt` (semi-implicit Euler), clamped to ±maxBend.
5. **Basket pendulum**: `angV += −(g/len)·sin(ang)·dt` as a kick-drift-kick (velocity Verlet) step, `ang += angV·dt`; `x = px + sin(ang)·len`, `y = py − cos(ang)·len`, `vx = cos·len·angV`. No damping: energy `½len²angV² + g·len(1 − cos ang)` stays within 0.5 % over 60 s (tested). Amplitude from energy: `cos A = cos ang − angV²·len/(2g)`. `world.platAt(p, t)` integrates the same pendulum forward (1/60 s steps) for the bot.
6. **Reach** (`PH.World.reachX(dy, C, k)`): with `t = (v + √(v² − 2g·dy))/g` and `ta = maxVx·k/(accel·k)`, reach = ½·a·t² (t ≤ ta) or `vm²/2a + vm·(t − ta)`.

| dy (u) | 0 | 1.3 | 1.65 | 2.0 | 2.4 | 2.7 |
|---|---|---|---|---|---|---|
| reach at size 1 (u) | 4.40 | 3.80 | 3.60 | 3.37 | 3.05 | 2.72 |
| reach at size 1.5 (Easy max) | 3.39 | 2.92 | 2.77 | 2.60 | 2.35 | 2.09 |
| reach at size 1.6 (slowest) | 3.20 | 2.77 | 2.62 | 2.45 | 2.22 | 1.98 |

## 3. Generation guarantees (tested over 2000 u, 3 seeds × 3 difficulties, loops 0–3)

1. One guaranteed **path** (`p.path = true`); side platforms and fireflies on top. Gaps in the difficulty range (+0.08/loop), ≤ 2.7 u **measured from the lower platform's lowest point to the upper one's highest swing point** (basket rise `len·(1 − cos ampMax)` included). The apex is 2.96 u, so no step needs a mushroom or a leaf flick.
2. **Horizontally reachable at the slowest steering** (k at the difficulty's maxSize), worst case (baskets at the far ends of their max swing, hr = len·sin ampMax):
   `|xA − xB| + hrA + hrB ≤ min(maxDx, 0.8·reachX(dy, k_slow) + ½(wA/2 + wB/2))`.
   The test re-checks it with an independent numeric hop at **k = 1 and k = k_slow** (landing pad of size 1, i.e. the narrowest feet): the remaining gap after both landing pads must be ≤ 95 % of the simulated reach.
3. Every platform (including a basket's whole swing) stays inside `[w/2 + 0.3, COLW − w/2 − 0.3]`.
4. Never two baskets in a row on the path (and never the first). Mushrooms only on path pots above 20 m. Potting floors only have pots and shelves. Leaves: `side` = the nearer wall.
5. **Side platforms are never traps**: their distance from their row's path platform is capped at `0.8·reachX(dy, k_slow) + ½(ws/2 + w/2) − hr`, so Puddle can always hop back even at max size (found by the bot: a heavy Puddle was stuck forever on a far side pot).
6. Zones by height (`_levelAt`): platforms generated ahead use the next floor's kinds.
7. Firefly arcs (3–5) every `flyEvery` u along the hop path. Arrays stay small (< 40 platforms, < 60 fireflies, tested).

## 4. Bot (bot.js)

Every 0.08 s: for each landable platform it solves the arc for the time T her feet come down through its top, **predicts a basket's position at T with `world.platAt`** (then re-solves T for that height), tabulates how far left/right she can get by T with full steer at her **current** top speed and accel (`maxVx·k`, `accel·k`, walls at `0.55·size`), and scores reachable platforms: 2·height + 0.6·(best next step reachable with the same slow steering) + 3 for a mushroom (it aims at the mushroom, not the pot edge) + **1.2 for a leaf while big** + up to 1 for fireflies on the way + spare margin; −2.5 for a dead end, −1.5·n after n repeats. The release-point controller uses the heavy drift `vx/(drag·k)`. Skill s: reaction delay (1 − s)·0.3 s, aim noise ≲ (1 − s)·0.8 u, (1 − s)·0.1 bad-pick chance.

Skill 1, 10 min, real hearts: 0 falls on Easy, Normal and Hard (20 seeds each in the pacing run), ≈ 100 basket landings and ≈ 160 leaf flicks per 10 minutes.

## 5. Weather (weather.js)

Screen-space, `k = min(W, H)/540`, counts × `areaK` (√area vs 960×540), hard cap 179 (24 kept free for bursts). Crossfade: on `setLevel` the old particles fade out over 0.8 s while new ones fade in. Front layer alpha ≤ 0.5. `setWind`/`setHorizon` are no-ops.

| floor | populations (at 960×540) | timed pops | motion |
|---|---|---|---|
| potting | 18 glass runnels (`raindrop`, back, ar 3–6) + 14 dust motes (`puff`, 2.5–4.5 px) | 0.9 drips/s | runnel: stick-slip (clings with vy → 0, lets go and eases to 45–110 px/s, re-sticks at 0.5/s), x wobbles with y; motes: Brownian drift with drag |
| fern | 7 `mist` (90–180 px, 6–10 s life, sin² fade, spreads) + 9 `leafbit`s | 1.2 drips/s | leaf bits: pendulum flutter |
| balcony | 44 back + 16 front `raindrop`s + 8 `petal`s | 4 `splash`/s | rain at terminal speed (back 430, front 720 px/s × k), slant 0.10 / 0.13, rot along velocity |
| roof | 24 drizzle drops (300 px/s, ar 3) + 12 `sparkle`s | 0.35 `bubble`/s | sparkle alpha = sin²(ωt) × life envelope; bubbles rise (buoyancy vs drag → 35–55 px/s), wobble, pop (fade) at the end of life |

- **Falling water**: `dv/dt = g − g·v²/vt²` (quadratic drag), g = 1400 px/s² (drizzle 900); a drip starts at rest and reaches 95 % of its 620 px/s terminal speed in ≈ 1 s, never exceeding it (tested).
- **Falling leaves/petals**: phase φ = ωt + φ0 (ω 1.6–2.6 rad/s); tilt = A·sin φ; target velocity vx = drift + glide·cos φ (gliding mid-swing), vy = fall·(0.45 + 0.9·|sin φ|) (dropping at the ends); velocities relax toward the target with drag 3/s.
- All motion adds the camera's climb speed × a parallax factor (back 0.25–0.55, front 1).

## 6. Measured pacing and growth (tests/sim/pacing.js, 20 seeds per row)

Cells: median **seconds for the floor · size at the floor's end (levelUp size) · seconds into the floor when Puddle got big**. "falls/min" with unlimited hearts; last column with real hearts, ≤ 900 s ("+" = most runs alive at the cap).

| diff | player | floor 1 potting | floor 2 fern | floor 3 balcony | floor 4 roof | falls/min | fireflies/min | real hearts: falls/run · survival s · floors |
|---|---|---|---|---|---|---|---|---|
| easy | kid5 | 69 · 1.50 · 34 | 61 · 1.50 · 34 | 61 · 1.50 · 34 | 61 · 1.50 · 34 | 3.04 | 52 | 39 · 900+ · 12 |
| easy | kid6 | 69 · 1.50 · 35 | 59 · 1.50 · 34 | 60 · 1.50 · 34 | 59 · 1.50 · 31 | 0.91 | 55 | 13 · 900+ · 13 |
| easy | casual | 53 · 1.50 · 28 | 45 · 1.50 · 27 | 46 · 1.50 · 28 | 47 · 1.50 · 27 | 0.08 | 73 | 1 · 900+ · 16 |
| easy | bot0.5 | 49 · 1.50 · 27 | 41 · 1.49 · 26 | 44 · 1.50 · 27 | 41 · 1.50 · 25 | 0.09 | 80 | 2 · 900+ · 17 |
| easy | bot1 | 45 · 1.50 · 27 | 38 · 1.47 · 25 | 40 · 1.46 · 26 | 41 · 1.48 · 26 | 0.00 | 79 | 0 · 900+ · 18 |
| normal | kid5 | 84 · 1.60 · 40 | 79 · 1.60 · 41 | 77 · 1.58 · 41 | 79 · 1.60 · 43 | 4.38 | 37 | 4 · 49 · 0 |
| normal | kid6 | 79 · 1.60 · 39 | 74 · 1.59 · 39 | 78 · 1.60 · 41 | 79 · 1.60 · 40 | 2.12 | 40 | 10 · 310 · 4 |
| normal | casual | 59 · 1.55 · 34 | 59 · 1.52 · 35 | 57 · 1.52 · 34 | 56 · 1.52 · 35 | 0.36 | 53 | 4.5 · 900+ · 14 |
| normal | bot0.5 | 52 · 1.51 · 30 | 51 · 1.49 · 33 | 48 · 1.48 · 30 | 49 · 1.49 · 32 | 0.18 | 63 | 2 · 900+ · 16 |
| normal | bot1 | 45 · 1.44 · 29 | 45 · 1.44 · 31 | 45 · 1.45 · 29 | 46 · 1.47 · 31 | 0.00 | 65 | 0 · 900+ · 18 |
| hard | kid5 | 104 · 1.60 · 44 | 102 · 1.60 · 43 | 101 · 1.60 · 42 | 102 · 1.60 · 42 | 5.92 | 34 | 3 · 30 · 0 |
| hard | kid6 | 97 · 1.60 · 40 | 101 · 1.60 · 43 | 100 · 1.60 · 42 | 103 · 1.60 · 44 | 3.54 | 36 | 4.5 · 57 · 0 |
| hard | casual | 74 · 1.60 · 34 | 77 · 1.60 · 36 | 73 · 1.60 · 35 | 76 · 1.60 · 37 | 0.83 | 49 | 12.5 · 900+ · 11 |
| hard | bot0.5 | 60 · 1.59 · 31 | 65 · 1.60 · 32 | 59 · 1.59 · 31 | 60 · 1.60 · 31 | 0.22 | 59 | 4 · 900+ · 13 |
| hard | bot1 | 50 · 1.54 · 28 | 54 · 1.55 · 29 | 54 · 1.55 · 30 | 54 · 1.57 · 30 | 0.00 | 66 | 0 · 900+ · 15 |

**Growth timeline on floor 1** (12 seeds, `tests/sim` models): a casual adult is at size 1.13 / 1.28 / 1.42 at 25 / 50 / 75 % of the Easy floor (big at ≈ 29 s of 57 s; max 1.5 at ≈ 49 s); on Normal 1.13 / 1.28 / 1.39 and ends the floor at ≈ 1.55. Kids catch fewer fireflies but take longer, so they also turn big near the middle (34–40 s of 69–84 s).

**Reading the numbers**
- **Easy floor 1 is easy for a 6-year-old**: the kid6 model clears it in ≈ 69 s with < 1 fall/min and never runs out of hearts in 15 minutes (5 hearts + lantern + floor hearts). Even the 5-year-old model survives 15 minutes on Easy.
- Casual adults: 45–60 s per floor on Easy/Normal, ≈ 75 s on Hard — inside the 45–90 s target.
- **The weight is a feel, not a punishment**: with `steerK = 0` (no weight) the kid5/kid6/casual models fall *more* (Easy kid6 1.56 vs 0.81 falls/min, Normal casual 1.04 vs 0.27): slower steering means less overshoot for impulsive players, and the wider feet help. Only ≈ 25–30 % of falls happen while big.
- Normal/Hard are not for 4–5-year-olds (kids lose their 3 hearts in 0.5–5 minutes), the same as the fork.

## 7. Deviations from DESIGN.md (all §5.1 names and events exist as written)

1. **`steerK` 0.24** (not ≈ 0.35) so that the stated "top speed ≈ 0.73× at 1.6" holds; **`growPerFirefly` 0.006** (not ≈ 0.02), see §1.2.
2. `fireflies` is the live **array**; its `valueOf()`/`toString()` give the caught count (`world.fireflyCount`, `getState().fireflies`). `world.flies` aliases the array. (As the fork.)
3. Extra event fields: `bounce` also has `flick` (the leaf flick multiplier, 1 elsewhere); `leafBend` has `depth` = predicted peak bend / maxBend (0..1) and `rad` (the predicted peak bend in rad). `levelUp.size` is the size **before** the shrink.
4. Extra platform fields: all kinds `vx`, `vy` (baskets: swing velocity), `xm` (rest/pivot x), `hr` (worst-case horizontal swing half range, 0 for static); leaves `prevBend`; baskets `y0` (rest y), `amp0`, `ampMax`, `rise`. Note: a leaf's `p.y` is the top at its **centre**; use `PH.World.surfY(p, x)` for the height under any x. Basket `x`/`y` move every step (with `prevX`/`prevY`).
5. Extra hero field `started`; extra statics `PH.World.reachX(dy, C, k)`, `pathLimit`, `steerF(size)`, `landable(p)`, `surfY(p, x, prev)`, `leafDist`, `basketAmp(p)`; methods `world.platAt(p, t)` / `platXAt(p, t)`, `world.steerF()`, `world.slowF()`.
6. `gotoLevel(i)` emits `levelUp` with `bonus: 0, sizeBonus: 0` but still shrinks Puddle and gives +1 heart. `setSize(s)` is silent (no `grow`/`big` events) and clamps to [1, 2.5]; `grow(n)` clamps to the difficulty's maxSize and emits events like real growth.
7. The umbrella after its bounce stays drawn 0.5 s with `state 'live'` but is no longer landable (`bounces > 0`), as the fork's mat.
8. Weather particles: `ar` = height/width, `size` = drawn width. Internal `kind` names (runnel, mote, rainBack, rainFront, drizzle, …) differ from `sprite`; draw by `sprite`. Dust motes use the `puff` sprite (tiny, faint).
9. Known visual caveat for the renderer: a basket's chain (pivot up to 3.2 u above it) can pass behind the next platform; the chain never collides.
