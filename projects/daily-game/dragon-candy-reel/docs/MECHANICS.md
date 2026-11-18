# Taffy's Candy Reel: mechanics

Files: `game/js/rng.js`, `world.js`, `weather.js`, `bot.js`. Contract: `docs/DESIGN.md` §5.
Tests: `node tests/unit/run.js` (34 tests, about 4 s). Pacing: `node tests/sim/pacing.js [seeds] [minutes]`; player models: `node tests/sim/run.js kid1|matrix|loops` (results in `tests/sim/results/`).

All motion runs in fixed sub-steps of **1/120 s**. Every moving object stores `prevX/prevY` at the start of each step (the hook too, since it now moves sideways), and `world.alpha` (0..1) is the leftover fraction, so the renderer draws `lerp(prev, cur, alpha)`. A frame longer than 0.25 s is clamped, so a hidden tab never fast-forwards. With the same seed and the same `press`/`release` calls you get the same game, wind included, whatever the frame rate (tests check this). The wind uses its own RNG stream (`rng.fork('wind')`), so gust timing doesn't reshuffle the flake and gummy spawns.

## 1. The twist: wind gusts that change direction

### 1.1 Wind state (`world.wind`)

| Field | Meaning |
|---|---|
| `value` | −1..1, + = blowing right. Eased, never jumps. This is what everything reads |
| `target` | where `value` is heading. Sign flips at every gust |
| `next` | s until the next gust |
| `warn` | s; > 0 while a coming gust is announced (counts down to 0 at the gust) |
| `warnDir` | −1 or 1: direction of the coming gust (= −sign(target)) |
| `strength` | level strength: sunny 0.6, rain 0.8, wind 1.0, snow 0.8 |
| `rate` | (extra) d`value`/dt, for the critically damped easing |

**Schedule.** At the start of every level, `target = dir · 0.3 · strength` (a light breeze that keeps the direction the wind already had; it is not a gust) and `next = max(6, U(gustEvery))`, so the first gust is never earlier than 6 s into a level. When `next` drops to 1.5 s, `warnDir = −sign(target)`, a magnitude `mag ~ U(0.55, 1)` is drawn, `warn = next`, and **`{type:'gustWarn', dir}`** is emitted. When `next` reaches 0: `target = warnDir · mag · strength`, **`{type:'gust', dir, strength: |target|}`** is emitted, `stats.gusts++`, and `next = U(gustEvery) · (zone 2 ? 0.75 : 1)`. So every gust flips the direction and is always announced exactly 1.5 s before (to the step). A `levelUp` cancels a pending warning (the windsock relaxes) and restarts the 6 s rule. No gusts are scheduled in `over`.

**Easing.** `value` follows `target` as a critically damped second-order system:

```
rate  += (ω² · (target − value) − 2ω · rate) · h        ω = windOmega = 4 rad/s
value += rate · h
```

It starts and stops smoothly, never overshoots, and settles within 5% in ≈ 1.2 s. The largest change in one 1/120 s step (a full −1 → +1 flip) is ≈ 0.025, so it never jumps.

### 1.2 The line bows: hook sway (a damped spring)

```
depthFrac = clamp((hook.y − waterTop) / (maxHookY − waterTop), 0, 1)   0 at the surface → 1 at the bottom
sway*     = wind.value · driftMax · depthFrac · (reel ? 0.5 : 1)
swayV    += (ωs² · (sway* − sway) − 2ζωs · swayV) · h                    ωs = 3.2 rad/s, ζ = 0.72
sway     += swayV · h,  clamped to ±(holeX − 60)
hook.x    = holeX + sway       (hook.vx = its sideways speed)
```

Why: a fishing line in a current doesn't snap sideways. The spring has a ≈ 2 s natural period (heavy, watery), lags the wind (after a sudden full wind it has moved less than a quarter of the way in 0.2 s), and overshoots by about 4% before it settles, like a real bobber swinging on its line. Because the target grows with depth, sinking makes the bobber swing further out ("the line bows deeper"); rising brings it back under the gap. The hook also leans with its sideways speed (`tilt += clamp(swayV · 0.004, ±0.25)`), so it trails like it is being dragged through water. The clamp keeps `hook.x` inside `[60, W − 60]` on every screen (tested at 560×1600, 1280×540 and 320×480). While reeling the line is taut, so the sway works at half strength and the hooked flake rides `hook.x`. Collisions use `hook.x`. A new line after a snap hangs straight (`sway = 0`).

### 1.3 The current pushes the swimmers

```
vxEff = vx + wind.value · current · (1 − 0.5 · depthFrac(item.y))
vxEff = vx ≥ 0 ? max(vxEff, 0.4 · |vx|) : min(vxEff, −0.4 · |vx|)
```

Flakes, gummies and fish all drift with the wind, half as much at the bottom as at the top. A swimmer is never pushed below 40% of its own speed and never reverses, so a flake always keeps coming (tested on every swimmer at every step). `item.vx` stays the swimmer's own speed; `item.vxEff` (extra field) is the speed it actually moves at. Escaping bubbles and puffed gummies drift with the full current (×0.6 for puffed gummies).

### 1.4 Wind constants (`CONFIG`)

| Key | Value | Unit | Why |
|---|---|---|---|
| `gustWarnTime` | 1.5 | s | windsock swings + whoosh 1.5 s before: always readable, never sudden |
| `firstGustMin` | 6 | s | the player gets settled in every level first |
| `gustMag` | 0.55–1.0 | — | how hard a gust blows (× level strength) |
| `breeze` | 0.3 | — | `|target|` at level start, before the first gust |
| `windOmega` | 4.0 | rad/s | critically damped wind ease, settles in ≈ 1.2 s |
| `windZoneEvery / windZoneBoost` | 0.75 / 1.4 | × | the Windy Swirl level gusts 25% more often, drift and current ×1.4 |
| `levelStrength` | 0.6, 0.8, 1.0, 0.8 | — | sunny, rain, wind, snow |
| `swayOmega / swayZeta` | 3.2 / 0.72 | rad/s, — | the line's spring: lag + ≈ 4% overshoot |
| `reelSway` | 0.5 | × | taut line while reeling |
| `swayTilt` | 0.004 | rad per px/s | hook lean from its sideways speed |
| `screenPad` | 60 | px | hook never closer than 60 px to the screen edge |
| `minOwnSpeed` | 0.4 | × | the current never stalls or reverses a swimmer |

| Per difficulty | easy | normal | hard |
|---|---|---|---|
| `gustEvery` (s) | 11–15 | 8–12 | 6–10 |
| `driftMax` (px sway at the bottom at \|wind\| = 1) | 34 | 52 | 70 |
| `current` (px/s at the surface at \|wind\| = 1) | 8 | 14 | 20 |

Largest real sway at the bottom (gust magnitude 1): Easy Sunny 20 px, Normal Sunny 31 px, Normal Windy 73 px, Hard Windy 98 px. A flake's reach is `flakeR + hookR` = 41 px on Easy, so on Easy level 1 the bobber can never swing past a flake it sank onto; on the Windy level of Normal/Hard the player has to read the windsock and aim upwind.

## 2. Other CONFIG constants (`PR.CONFIG`)

| Key | Value | Unit | Why |
|---|---|---|---|
| `step` | 1/120 | s | A 300 px/s hook moves 2.5 px per step, so it can't tunnel through a 26 px flake |
| `surfaceY / waterTop` | 150 / 190 | px | DESIGN §2: top of the wafer dock / soda surface |
| `floorPad / hookTopPad / hookBottomPad` | 34 / 14 / 22 | px | `floorY = H−34`, `minHookY = 204`, `maxHookY = floorY−22` |
| `bandSplits` | 0.36, 0.68 | frac | shallow (berry) / middle (lime) / deep (grape) |
| `hookR` | 11 | px | Hit radius around the hook's hit centre (`hook.x, hook.y`) |
| `airGravity / sinkAccel / riseAccel` | 980 / 900 / 520 | px/s² | Free fall in the gap; weight − buoyancy when held (heavy); buoyancy when released (calmer) |
| `limitBounce / limitRest` | 0.25 / 18 | — / px/s | A small "thunk" at the limits, no jitter |
| `tiltMax / tiltRate` | 0.42 / 7 | rad / 1/s | The hook leans with its speed |
| `hangTime / hangAbove / newLineAbove` | 0.35 / 22 / 30 | s / px | After a catch the empty hook hangs in the gap, then drops in with a splash |
| `dropSafe` | 0.35 | s | Gummies can't snap the hook while it falls back in (the player has no control then) and for 0.35 s after. Found by the bot sims: most "unavoidable" snaps were a gummy sitting right under the gap |
| `flakeHang / attachTime` | 18 / 0.15 | px / s | A hooked flake hangs under the hook and slides onto it |
| `tugTime / slipTime` | 0.22 / 0.38 | s | Good tap: quick ease-out tug. Slip: slower ease-in-out sink |
| `wobbleDecay / tugDecay` | 3.2 / 4.5 | 1/s | Slip wobble and rod bend fade |
| `stepMinPx` | 26 | px | Smallest reel step |
| `zoneJumpMin / zoneEdge / zoneStartMin` | 0.22 / 0.04 / 0.35 | frac | The green zone jumps after each tap, never touches the ends, starts ≥ 0.35 |
| `catchFly / jarDX / jarDY` | 0.75 / −150 / −20 | s / px | Caught flake arcs from the gap to the candy jar at `(holeX−150, surfaceY−20)` |
| `maxLines / snapReset / invuln` | 3 / 1.0 / 1.5 | — / s / s | Spools; the hook is gone 1 s; then 1.5 s gummy-proof |
| `puffTime / puffDrift / puffRise / leaveSpeed` | 0.28 / 42 / 16 / 150 | s, px/s | A bumped gummy puffs up, drifts away and floats up; on level clear gummies swim off |
| `points / perfectBonus` | berry 10, lime 20, grape 30, gold 50; +5 | pts | gold = 5 × berry |
| `goldChance / goldSpeed / goldNeedle` | 1/12, 1.6, 1.15 | — | Rare, drifts 60% faster, needle 15% faster |
| `depthSpeed / zoneSpeed / loopSpeedUp / loopSpeedCap` | 0.35 / 0.10 / 0.08 / 1.4 | × | Deeper and later = faster; endless +8% per loop, capped |
| `maxFlakes / maxFish` | 4 / 8 | — | Keeps the lake readable for small kids |
| `flakeBobAmp/Rate`, `gummyBobAmp/Rate` | 5, 1.9 / 10, 2.4 | px, rad/s | Flakes bob gently, gummies "swim" more |
| `gummySpeed / fishSpeed / fishEvery` | 28–46 / 55–95 / 2.5–5.5 | px/s, s | Gummies slow and readable; fish are decoration |
| `bandWeights` | sunny .62/.28/.10, rain .42/.38/.20, wind .34/.40/.26, snow .24/.36/.40 | — | Later levels put more value deeper (the wind level a bit less deep, since deep = more sway) |
| `firstZoneGrace / zoneGrace` | 10 / 4 | s | No gummies in the first 10 s of level 0, a 4 s breather later |

Per difficulty (`CONFIG.difficulty.easy|normal|hard`):

| Key | easy | normal | hard |
|---|---|---|---|
| `flakesNeeded` | 6 | 8 | 10 |
| `sinkTerm / riseTerm` (px/s) | 190 / 125 | 230 / 150 | 265 / 170 |
| `flakeR / gummyR` (px) | 30 / 16 | 27 / 19 | 24 / 21 |
| `flakeEvery` (s) / `flakeSpeed` (px/s) | 3.0–4.4 / 30–44 | 3.0–4.4 / 38–56 | 2.8–4.2 / 46–68 |
| `reelWidth / reelWidthZone / reelWidthMin` | .38/.02/.30 | .30/.02/.20 | .24/.02/.17 |
| `perfect` | 0.11 | 0.08 | 0.06 |
| `needle / needleZone` (sweeps/s) | 0.50/0.04 | 0.65/0.05 | 0.85/0.06 |
| `stepsFull` | 4 | 5 | 6 |
| `gummyEvery / gummyMin / gummyGrow` | 24/10/.85 | 13/5/.82 | 8/3.2/.80 |
| `gummyMax / gummyMaxCap` | 1 / 2 | 2 / 4 | 3 / 5 |
| `gustEvery / driftMax / current` | see §1.4 | | |

## 3. Motion model (unchanged from the scaffold, renamed)

- **Hook while roaming:** semi-implicit Euler with quadratic drag. Held: `a = sinkAccel − k_s·v|v|`, `k_s = sinkAccel/sinkTerm²`; released: `a = −riseAccel − k_r·v|v|`; above the water: `a = airGravity`. Letting go while sinking gives a short smooth stop (≈ 0.13 s, 15 px). `splash` fires when the hook crosses `waterTop` going down.
- **Hook while reeling:** physics off. Good/Perfect tap: `easeOutCubic` tug over 0.22 s; slip: `easeInOutSine` half a step down over 0.38 s plus a wobble (`±7 px · wob`). The last tug lifts the hook to `waterTop − 22`, then the flake arcs to the jar (`y = lerp − sin(πk)·150`, 0.75 s) and the empty hook drops back in.
- **Swimmers:** speed `base · (1 + 0.35·depth) · (1 + 0.1·zone) · loopMult`, plus the current (§1.3); `y = by + sin(phase)·bobAmp`.
- **Collisions** (roam only): circle vs circle at `hook.x, hook.y`. Gummy wins over a flake in the same step; the closest flake is hooked. Gummies are ignored during `invuln`, while the hook drops in (`hook.drop`) and for `dropSafe` after.

## 4. Reel meter maths

`needle = (1 − cos πu)/2`, `u += speed·h` (wraps at 2). `speed = (needle + needleZone·zone) · loopMult · (gold ? 1.15 : 1)`. `width = max(reelWidthMin, reelWidth − reelWidthZone·zone − 0.02·loop)`. `d = |needle − zone|`: Perfect if `d ≤ perfect/2` (2 steps, +5), Good if `d ≤ width/2` (1 step), else Slip (½ step down, 3 slips → escape). `stepPx = max(26, (maxHookY − waterTop)/stepsFull)`, so tall portrait screens need the same number of taps.

## 5. Weather (`PR.Weather`)

`update(dt, {hookX, hookY, surfaceY, waterTop, wind})`. Everything light has inertia toward the wind: `vx += (wind · push − vx)(1 − e^(−resp·dt))`, so when a gust flips, floss slows, stops and drifts back instead of snapping round.

| Level | Sky | Water | ambient {tint, glow, dark} |
|---|---|---|---|
| sunny | 6 `floss` puffs drifting slowly (push ≈ 30 px/s) | 26 `bubble_s` | null, 0, 0 |
| rain | 56 sprinkles (`sprinkle`, `sprinkle_b`, `sprinkle_y`), 190–360 px/s, slanted by the wind (`rot = −atan2(vx, vy)`, 0 = rod vertical); near ones (front layer) fall to the water and leave a `ring` ripple at `waterTop + 2` (spreads 6 → 32 px, `sx = 0.32` squash, ≤ 18 at once); far ones stop at the deck | 14 bubbles | rgba(110,100,150,.08), 0.2, 0.15 |
| wind | 14 `floss` tufts + 10 `wrapper`s tumbling at 150–250 px/s with spin | 14 bubbles | null, 0.05, 0 |
| snow | 64 `snowflake`s in depth layers (size 4–14, speed 14–48 px/s, alpha .45–.95, sway), near ones to the water | 10 bubbles + 14 glowing `sparkle`s | rgba(30,30,90,.16), 0.85, 0.45 |

Bubbles rise with buoyancy vs drag, wobble and are bent by the current (push 14 px/s), and pop at the surface. The hook leaves a bubble trail while it moves (≤ 12). Bursts ≤ 48. Hard cap 159 particles (tested in every level at 960×540, 1280×540, 720×1600, 560×1600, 560×960 with a flipping wind).

## 6. Bot (`PR.Bot`)

| Parameter | Formula | skill 0.5 | 0.75 | 1 |
|---|---|---|---|---|
| reaction floor | 0.10 + 0.30(1−s) s | 0.25 | 0.175 | 0.10 |
| tap timing error (sd) | 0.008 + 0.30(1−s)^1.5 s | 0.114 | 0.046 | 0.008 |
| re-plan period | 0.06 + 0.30(1−s) s (±30%) | 0.21 | 0.135 | 0.06 |
| gummy foresight | 0.6 + 1.6s s | 1.4 | 1.8 | 2.2 |
| gummy margin | 4 + 18s px | 13 | 17.5 | 22 |

- **Wind prediction** (what a player reads off the windsock): `windAt(t)` is the critically damped ease toward `target`, switching to `warnDir · 0.775 · strength` at `next` once a gust is announced. It is sampled every 0.1 s up to 12 s once per plan. For a flake at depth `y` the bot steps its x forward with the predicted current and compares it with the predicted hook column `holeX + windAt(t) · driftMax · depthFrac(y)`; that gives the window `[tIn, tOut]` when the flake is within reach of the swayed hook.
- **Roam:** value = `points / (max(tMid, travel) + reelTime)`, drop flakes it can't reach in time, 15% hysteresis.
- **Gummy avoidance in space and time:** each gummy that meets the swayed column within the foresight blocks a depth band during `[tIn − 0.2, tOut + 0.2]`, twice: a soft band (with the margin) and a hard band (real contact + 3 px, weighted ×1000). A plan is safe if the hook's straight trip to it (at terminal speed, +0.25 s if it has to reverse) is never inside a band while it is blocked. Otherwise the bot picks the cheapest candidate depth (band edges, top, bottom, where it is). Time-awareness fixed the old "trapped between two bands" dives; the hard/soft split lets it hide 1 px inside a soft margin instead of diving through a gummy.
- **Reel:** taps at the next needle crossing of the zone centre after one reaction time, plus Gaussian error.

## 7. Simulated results (960×540 unless noted)

**Bot pacing** (`node tests/sim/pacing.js 8 10`: 8 seeds × 10 min):

| diff | skill | level 1 (s) | mean level, L1–4 (s) | levels in 10 min | flakes/min | snaps/level | escapes/level | Perfect % | game overs |
|---|---|---|---|---|---|---|---|---|---|
| easy | 0.50 | 45 | 42 | 14.5 | 8.9 | 0.00 | 0.04 | 40 | 0/8 |
| easy | 0.75 | 42 | 39 | 16.5 | 10.1 | 0.00 | 0.00 | 80 | 0/8 |
| easy | 0.95 | 42 | 40 | 16.4 | 10.1 | 0.00 | 0.00 | 100 | 0/8 |
| normal | 0.50 | 56 | 64 | 8.9 | 7.4 | 0.08 | 1.52 | 25 | 0/8 |
| normal | 0.75 | 50 | 49 | 11.5 | 9.6 | 0.02 | 0.02 | 57 | 0/8 |
| normal | 0.95 | 45 | 46 | 12.1 | 10.2 | 0.01 | 0.00 | 99 | 0/8 |
| hard | 0.50 | 114 | 134 | 3.5 | 4.1 | 0.54 | 12.9 | 15 | 1/8 |
| hard | 0.75 | 58 | 69 | 8.0 | 8.5 | 0.03 | 0.38 | 35 | 0/8 |
| hard | 0.95 | 53 | 59 | 9.8 | 10.2 | 0.04 | 0.00 | 86 | 0/8 |

Bot skill 1, 12 seeds × 10 min: 1 snap in total on Easy and 1 on Normal, no game over (before the time-aware avoidance and `dropSafe`: 15 and 28 snaps).

**Player models, level 1 only** (`run.js kid1 --n 300`):

| player | diff | clears level 1 | level-1 s p25 / p50 / p90 | lines lost in level 1 | escapes in level 1 |
|---|---|---|---|---|---|
| kid (age 5–6) | easy | **100%** | 34 / 37 / 47 | 0.08 | 0.00 |
| kid | normal | 98.7% | 50 / 55 / 73 | 0.55 | 0.62 |
| kid | hard | 62.7% | 85 / 99 / 126 | 1.92 | 4.90 |
| casual adult | easy | 100% | 34 / 39 / 54 | 0.04 | 0.00 |
| casual adult | normal | 100% | 43 / 49 / 63 | 0.16 | 0.00 |
| casual adult | hard | 98.3% | 56 / 63 / 78 | 0.45 | 0.12 |

The same run with the wind switched off (`--set driftMax 0, current 0`) gives the kid on Easy 100% / 37 s / 0.09 lines lost: the wind on level 1 is visible but costs a small child nothing.

**10-minute rounds** (`run.js matrix --n 40`):

| player | diff | game over | levels reached | mean level s (L1–4) | flakes/min | snaps/level | escapes/level |
|---|---|---|---|---|---|---|---|
| kid | easy | 5% | 14.8 | 39 | 9.3 | 0.33 | 0.22 |
| kid | normal | 98% (median 4.8 min) | 3.6 | 65 | 7.1 | 1.19 | 1.63 |
| casual | easy | 0% | 15.9 | 39 | 9.8 | 0.12 | 0.00 |
| casual | normal | 28% | 9.9 | **52** | 8.9 | 0.44 | 0.09 |
| casual | hard | 90% (median 7.1 min) | 4.3 | 79 | 7.4 | 1.03 | 1.14 |
| spam (8–10 Hz) | easy / normal | 23% / 80% | 0 | – | 0 | 1.65 / 2.63 | 4.9 / 4.1 |
| spamReel (mash the meter) | normal | 90% | 0 | – | 0.2 | 2.90 | 71 |

Portrait 560×1212: casual Normal 57 s per level, kid Easy 45 s per level with no game over in 10 min.

How to read it:
- A casual player on Normal clears a level in about 50 s (45–90 s target), a sloppier one (bot 0.5) in about 65 s. The kid model clears Easy level 1 every time, in under 50 s for 9 of 10 rounds.
- Endless loops (`run.js loops`): the casual player on Normal stays at 47–59 s per level through 12 levels; Hard gets hard from the second loop.
- Mashing never works: spamming the button catches nothing and the reel meter's slips make every hooked flake escape.
- The wind is a reading challenge, not a punisher: it changes catch times by a few seconds on average; its main cost is on the Windy level of Normal/Hard, where deep flakes need the bobber placed upwind.
