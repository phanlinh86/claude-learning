# Puff's Volcano Catch: mechanics

Code: `game/js/rng.js` (VC.RNG), `world.js` (VC.CONFIG, VC.DIFFICULTY, VC.World), `weather.js` (VC.Weather), `bot.js` (VC.Bot).
Tests: `node tests/unit/run.js` (23 tests, about 6 s). Balance sim: `node tests/sim/run.js [N] [capMinutes]` (writes `tests/sim/results/latest.md`).
Contract: `docs/DESIGN.md` §2 and §5. Every name there is kept; deviations and additions are listed in §4.

## 1. Rules (as simulated)

- **Flow:** `ready` (1.4 s banner, no eruptions, Puff can already float) → `playing` → pouch full → `cleared` (2.2 s) → next level. Level `i` is zone `i % 4`, lap `floor(i / 4)`. Endless.
- **Eruption:** every `burstInterval` s the volcano rumbles for 0.5–0.7 s (`volcano.rumble` 0 → 1, smoothstep), then launches 1–3 items from the crater mouth (480, 210).
- **Coins:** copper 1, silver 2 (25 %), gold 5 (6 %). Catch = `value × 10 × mult`, combo +1, pouch +1. Combo thresholds `[0, 5, 12, 22, 35]` → ×1 … ×5. A coin landing on the sand → `miss`, combo 0, ×1. No heart lost.
- **Sizzly rocks:** caught → −1 heart, combo 0, 1.2 s invulnerability (rocks caught while blinking fizzle harmlessly). Landed rocks just fizzle. 0 hearts → `dead`.
- **Cool Rain:** needs `rain.charge = 1`. 1.2 s column, 130 px wide, centred on Puff and following him. Rocks in flight inside the column and above Puff's body turn to steam (+5). Recharge 7 s after the rain ends (Easy 5, Hard 8). Full at every level start.
- **Pouch full:** `pouchfull`, eruptions stop, rocks in flight steam (+5), `cleared` with bonus hearts × 100, then +1 heart (first 2 laps; Easy 4 laps; never on Hard).

## 2. Physics (why it feels real)

| Thing | Model |
|---|---|
| **Arcs** | Real ballistics with `gEff = 520 · speed²` px/s². For each item the world picks a crossing point `tx` on the catch line (y = 446) and an apex height `H` above the crater, then solves `vy = −√(2gH)`, `T = √(2H/g) + √(2(446 − 210 + H)/g)`, `vx = (tx − x0)/T`. Integration is the exact step `x += vx·h; y += vy·h + ½g·h²; vy += g·h`, so the item crosses the line at `tx` to < 1e-6 px (tested). `item.tx`, `item.tCross` and `item.apexY` are exposed (bot, debug, landing marker). Speed scaling changes g by speed², so arcs keep their shape and only play faster. |
| **Flight times** | Normal beach 1.98–2.21 s (apex 150–210 px) · crater lap 1 1.55–1.78 s · Easy beach 2.2–2.5 s. |
| **Coin spin / rock tumble** | Coins advance a flip phase `spin` at 6–10 rad/s × speed (draw `scaleX = cos(spin)`). Rocks rotate `rot` at ±2–4.5 rad/s. Both slow down exponentially on the ground. |
| **Ground** | Contact at `y = 492 − 0.6 r` (sinks a little in the sand). Coins bounce once (restitution 0.35, sand grabs 50 % of vx), land again and fade over 0.6 s. Rocks thud (vx × 0.15, no bounce) and fizzle over 0.8 s. |
| **Caught** | The item drops 14 px into the basket over 0.25 s (ease-in), riding with the rim, then is removed. Draw it before `basket_front.svg`. |
| **Steam** | Rises at 55 px/s and fades over 0.7 s. |
| **Puff, keys** | Velocity approaches `input × 400` at 2400 px/s² (3000 when braking or reversing): 0 → max in 0.17 s; stops from full speed in 0.13 s (≈ 27 px). |
| **Puff, pointer** | Critically damped spring, ω = 13 rad/s, `|a| ≤ 4200`, `|v| ≤ 400`, dead zone 3 px. Tested on 4 moves: arrives within 3 px, overshoot < 3 px. |
| **Tilt** | Eases (rate 7 /s) toward `+vx · 0.28/400`, clamp ±0.28 rad. |
| **Basket** | A pendulum in Puff's accelerating frame: `θ'' = −(1400/50)·sin θ − (0.3·a/50)·cos θ − 3.2·θ'`, θ clamped ±0.35 (soft, the swing rebounds 30 %). ≈ 0.84 Hz, ζ ≈ 0.3: when Puff sets off the basket lags behind, when he stops it swings forward and settles in about a second. `rimX = x + sin(θ)·50`. |
| **Squash, faces** | `squash` jumps to 0.6 on a catch and 1 on an ouch, decays at 8 /s. Frames: `ouch` (0.7 s or dead) > `blow` (raining) > `happy` (0.45 s after a catch, and during `cleared`) > `idle`. |
| **Volcano** | `rumble` smoothstep over the telegraph, decays in 0.25 s after the burst. `glow = 0.2 + 0.55·rumble + kick` (kick = 1 at launch, decays at 5 /s). `shake = 2.5·rumble + 5·kick` px. |

## 3. Fairness

1. **Telegraph:** every burst has a 0.5–0.7 s rumble first (tested: every `erupt` follows a `rumble` by 0.49–0.72 s).
2. **Reachable coins:** each new coin must satisfy `|Δx| ≤ 40 + 250·|Δt|` against Puff now and against every coin already in flight (a chain at 62 % of Puff's top speed: "a reasonably fast player, from where a sensible player would be"). Up to 24 candidates are tried; the least-violating one wins. In tests, < 1 % of consecutive coin pairs miss the rule (0 in practice on lap 1). This covers the DESIGN "2 coins of a burst ≤ 260 px apart or ≥ 0.6 s apart" rule and generalises it across bursts.
3. **Rocks keep clear of coins:** on lap 1 a rock never crosses within 110 px of a coin within 0.6 s. 45 % of rocks aim near Puff (±160 px) so they are a threat to read, the rest anywhere. A burst of 2–3 always carries a coin.
4. **Beach start:** no rocks for the first 20 s of level 1 (8 s on Hard), then 6 %.
5. **Endless laps end:** from lap 2 the keep-out shrinks by 40 px per lap, some rocks "shadow" a coin (20 % per lap after lap 1, cap 45 %): use Cool Rain or let that coin go. Healing stops after lap 2. Every simulated run ends.

## 4. Contract deviations and additions

- **Tilt sign (deviation):** DESIGN says `tilt → −vx·k (lean into motion)`. In canvas coordinates (y down) a positive `ctx.rotate` is clockwise, so leaning *into* a rightward move needs a positive angle. The world uses `tilt → +vx·k`: **draw with `ctx.rotate(puff.tilt)`** and Puff leans into motion.
- **`puff.y` includes the bob** (`392 + bob`); `rimY` stays 446 (the catch line). Draw the basket at `rimY + puff.bob` if it should bob with Puff.
- **Burst interval:** lap 1 is 3.0 / 2.7 / 2.5 / 2.3 s per zone (DESIGN suggested 1.9 → 1.2 s), so a good player needs 45–70 s per zone. Laps shorten it by 8 % each, down to 1.3 s.
- **Puff moves in `ready` and `cleared`** (nothing to catch in `ready`). Coins still in flight during `cleared` can be caught for points; misses during `cleared` don't reset the combo.
- **World additions:** `w.steps`, `w.gEff`, `w.rains`, `w.levelsCleared`, `w.launched`, `w.coinsLaunched`, `w.levelInfo(i)` → `{zone, lap, pouchTarget, interval, speed, rockChance, rockDelay, weights, apex, rockCoinDx, rockAimCoin}`, `w.solveArc(tx, H[, g])`, `w.snapshot()`.
- **puff additions:** `ax` (actual acceleration), `swingV`, `happy`, `ouch` (s left in those faces).
- **item additions:** `tx`, `tCross` (world time of the line crossing), `apexY`, `fair`, `variant` (0/1, rock art), `metal: null` for rocks.
- **Events:** `go {level}` (intro over), `heal {hearts}`; extra fields: `zone.lap`, `rumble.time`, `miss.combo`, `ouch.combo`, `dead.level`, `steam.points` is 0 for a fizzle during invulnerability.
- **`action()`** returns `true` when the rain starts.
- **Integrator note:** `update(dt)` does not clamp dt (for `?speed=N`); clamp long frame gaps in `main.js` **before** multiplying by speed.

## 5. Key tunables (`VC.CONFIG`, Normal) and difficulty presets

| Group | Key | Value | Why |
|---|---|---|---|
| Timing | `step`, `introDelay`, `clearTime`, `firstEruptDelay` | 1/120 s, 1.4 s, 2.2 s, 0.5 s | determinism; banner; celebration |
| Geometry | `crater`, `groundY`, `puffY`, `rimY`, `xMin..xMax` | (480,210), 492, 392, 446, 70..890 | DESIGN §2 |
| Catch | `catchHalfW`, `catchRFrac` | 38, 0.5 | 45–46 px half-window for coins: generous for kids |
| Puff | `maxSpeed`, `accel`, `brake` | 400, 2400, 3000 | crosses the shore in ~2.1 s; floaty but responsive |
| | `followOmega`, `followAccel`, `arriveStop` | 13, 4200, 3 | no-overshoot finger follow |
| | `tiltK`, `tiltMax`, `tiltRate` | 0.28/400, 0.28, 7 | |
| Basket | `ropeLen`, `swingG`, `swingDrive`, `swingDamp`, `swingMax` | 50, 1400, 0.3, 3.2, 0.35 | 0.84 Hz, 2–3 visible swings, rim moves ≤ 17 px |
| Items | `gravity` | 520 | readable 2 s arcs |
| | `coinR`, `rockR` | 14/15/17, 17 | half the drawn size |
| | `coinRestitution`, `fadeTime`, `fizzleTime` | 0.35, 0.6, 0.8 | |
| Eruptions | `rumbleTime` | 0.5–0.7 s | telegraph |
| | `burstInterval` | 3.0 / 2.7 / 2.5 / 2.3 | 45–70 s per zone |
| | `burstWeights` P(1,2,3) | beach .8/.2/0, jungle .6/.35/.05, ash .45/.42/.13, crater .35/.45/.2 | busier zones |
| | `apex` | 150–210 / 135–200 / 125–190 / 115–180 | lower = shorter flights later |
| | `zoneSpeed`, `lapSpeed`, `speedCap` | 1 / 1.06 / 1.12 / 1.18, +8 %, 1.45 | |
| | `rockChance`, `rockLap`, `rockCap`, `rockDelay` | 6 / 14 / 22 / 28 %, +4 %, 40 %, 20 s | DESIGN §5.1 mix |
| | `goldChance`, `silverChance` | 6 %, 25 % | |
| Fairness | `fairSpeed`, `fairSlack`, `rockCoinDt`, `rockCoinDx`, `rockAim` | 250 px/s, 40, 0.6 s, 110 px, 45 % | §3 |
| Laps | `rockCoinDxLap`, `rockAimCoinLap`, `lapBurst`, `healLaps` | 40, 0.2, 0.1, 2 | endless runs end |
| Score | `coinPoints`, `multThresholds`, `steamPoints`, `clearBonusPerHeart` | 10, [0,5,12,22,35], 5, 100 | |
| Levels | `pouchTargets` | 20 / 25 / 30 / 35 | |
| Hearts | `heartsMax`, `invulnTime`, `healOnClear` | 3, 1.2 s, 1 | |
| Rain | `rainTime`, `rainWidth`, `rainRecharge` | 1.2 s, 130 px, 7 s | |

| Key | Easy | Normal | Hard |
|---|---|---|---|
| `heartsMax` / `invulnTime` | 5 / 1.6 s | 3 / 1.2 s | 3 / 1.0 s |
| `pouchTargets` | 16 / 20 / 24 / 28 | 20 / 25 / 30 / 35 | 24 / 30 / 35 / 40 |
| `speedMul` / `apex` | 0.85 / lower (125–175 … 105–160) | 1 | 1.1 |
| `burstInterval` | 3.0 / 2.8 / 2.6 / 2.4 | 3.0 / 2.7 / 2.5 / 2.3 | 2.6 / 2.4 / 2.2 / 2.0 |
| `rockChance` (cap) | 4 / 10 / 15 / 20 % (30 %) | 6 / 14 / 22 / 28 % (40 %) | 10 / 20 / 28 / 34 % (40 %), beach delay 8 s |
| `rainRecharge` | 5 s | 7 s | 8 s |
| `fairSpeed` | 200 px/s | 250 | 290 |
| heal on clear | +1, laps 1–4 | +1, laps 1–2 | none |

## 6. Bot (`VC.Bot`)

1. Predicts each flying item's downward crossing of `rimY` (quadratic solve). Items are noticed after `(1 − skill)·0.4` s of flight; a skill-0.4 player overlooks 21 % of rocks.
2. DP over coins sorted by time: the best chain (value + 2 per coin, for the combo) whose hops satisfy `|Δx| ≤ v·Δt + slack`, `v = 400·(0.8 + 0.15·skill)`, starting from the rim after a reaction delay `0.05 + 0.25·(1 − skill)` s. Target = the first coin, leaning toward the next coin of the chain while staying inside the catch window (catches two close coins together).
3. A rock that will cross where the rim is heading within 1.1 s: Cool Rain if charged and the rock is still above Puff for the rain's duration (skill-dependent chance), else dodge to the side nearer the plan. Ignored while blinking.
4. No coin: drift toward the middle. Decisions every `0.02 + 0.25·(1 − skill)` s + jitter, aim noise σ ≈ 26·(1 − skill) px.
5. `bot.stats` = `{decisions, catches, misses, ouches, rains, steamed, levels, deaths, maxLevel}` from the world's counters (never drains events). `bot.plan` = the chosen chain (debug overlay).

## 7. Weather (`VC.Weather`)

Fixed 1/60 s sub-steps (identical for any dt partition, tested). Pre-warmed 2 s so the crater smokes on frame 1. Hard cap 158 particles; observed max with rumble + rain is under 100.

| Source | Particles | Motion |
|---|---|---|
| All zones | `smoke` (back, ≤ 30) | born in the crater mouth, buoyant rise that decays, drifts to the wind, expands ×2.6 (√ of age), fades; 0.9 /s + 7 /s × rumble, `dark` = rumble at birth |
| | `ember` burst (back, ≤ 12) | 8 embers thrown out ballistically (g 260) on each launch kick, + 3 smoke puffs |
| | `rain` (front, ≤ 22) | 70 streaks/s inside the rain column, 620–760 px/s, end at Puff's body |
| Beach | `sparkle` + `dot` glints (back) | twinkle in place on the sea band y 300–385, never on the volcano cone (sin² life); a few drifting sparkles, 2 front |
| Jungle | `leaf` back (depth .55) + front, `butterfly` ×3, pollen dots | leaf = pendulum: `x = x0 + A·sin φ`, tilt follows the swing (`0.55·cos φ`), falls fastest at the bottom of the arc, flipX tumble; butterflies wander with a bob, wing flap = `|flipX|` 0.25–1 |
| Ash | `dot` far (.25), `ash` mid (.55), `ash` front (1) | terminal fall, pendulum sway, tumble (flipX = cos), wind 34 px/s scaled 0.4 + 0.6·depth |
| Crater | `star` ×20 (y < 200), `ember` ×16, `firefly` 4 back + 3 front | stars twinkle; embers rise from the lava slopes inside the cone, cool (shrink, flicker, fade); fireflies wander with a glow pulse |

Zone hand-over: the old zone's particles fade within ~2 s while the new zone ramps in. Ambient tint: warm morning / green noon / orange sunset (fog 0.05) / navy night (12 %).

## 8. Simulated balance

`node tests/sim/run.js 100 20` — 100 rounds per cell, 20 min game-time cap. The bot sees every item and plays like a casual adult even at skill 0.4. Check child balance with the 4- and 6-year-old models in `tests/sim/players.js` (see `docs/reports/playtest_report.md`). Easy was retuned after the playtest (speedMul 0.75, catchHalfW 44, multThresholds [0,3,7,12,20], fewer rocks, fairSpeed 130); the Easy rows below are from before that change. "s per zone" = median seconds to fill the pouch on lap 1.

| Diff | Skill | Survival min (median) | Died ≤ cap | Score (median) | Level reached (median) | Clear L1 | Catch rate | Catch L1 | Ouches/min | Rains/min | Best combo | s per zone, lap 1: beach / jungle / ash / crater |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| easy | 0.4 | 14.5 | 100 % | 26030 | 21 | 100 % | 0.927 | 0.980 | 0.57 | 1.7 | 53 | 47 / 52 / 54 / 57 |
| easy | 0.7 | 15.0 | 100 % | 32435 | 22 | 100 % | 0.955 | 0.992 | 0.47 | 2.1 | 96 | 44 / 52 / 51 / 55 |
| easy | 1 | 17.6 | 87 % | 44790 | 29 | 100 % | 0.961 | 0.997 | 0.32 | 2.7 | 152 | 44 / 52 / 51 / 52 |
| normal | 0.4 | 12.7 | 100 % | 15675 | 13 | 100 % | 0.901 | 0.971 | 0.31 | 1.1 | 41 | 56 / 58 / 64 / 66 |
| normal | 0.7 | 12.6 | 100 % | 21455 | 14 | 100 % | 0.954 | 0.987 | 0.26 | 1.4 | 76 | 53 / 58 / 62 / 64 |
| normal | 1 | 14.6 | 99 % | 30345 | 18 | 100 % | 0.963 | 0.996 | 0.21 | 1.9 | 121 | 53 / 58 / 57 / 62 |
| hard | 0.4 | 10.5 | 100 % | 13115 | 10 | 100 % | 0.857 | 0.941 | 0.30 | 1.0 | 36 | 51 / 59 / 66 / 70 |
| hard | 0.7 | 11.4 | 100 % | 19870 | 13 | 100 % | 0.943 | 0.965 | 0.27 | 1.2 | 58 | 51 / 57 / 61 / 62 |
| hard | 1 | 12.7 | 100 % | 28115 | 15 | 100 % | 0.959 | 0.983 | 0.23 | 1.8 | 98 | 51 / 55 / 59 / 60 |

900 runs in 289 s on 2 cores (`tests/sim/results/latest.md`).

**Reading it:**
- **Level 1 is very winnable:** every bot cell clears it, catching 94–99.7 % of level-1 coins, and level 1 has no rocks for 20 s and only 6 % after.
- **Pacing:** 44–70 s per zone for good players; a child who catches 60–70 % of the coins needs about 70–100 s.
- **Every run ends:** later laps make rocks shadow coins and stop healing, so 99–100 % of Normal and Hard runs end within 20 min (median 12.6–14.6 min on Normal); on Easy the perfect bot survives 20 min in 13 % of runs.
- **Skill pays:** score roughly doubles from skill 0.4 to skill 1 (combo ×5 needs 35 catches in a row).
