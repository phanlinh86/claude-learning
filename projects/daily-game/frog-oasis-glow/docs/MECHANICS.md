# Pip's Oasis Glow — mechanics

Owner: mechanics engineer. Code: `game/js/{rng,world,weather,bot}.js`. Tests: `node tests/unit/run.js` (add `--stats` for the bot sweep).
Playtest sweep: `node tests/sim/run.js` (`--quick` for ¼ of the seeds).
All numbers live in `POG.World.CONFIG`; this page explains them. Units: logical px (960×540 stage, y down), seconds, radians.

## 1. Simulation model
- `World.update(dt)` accumulates time and runs fixed sub-steps of **1/120 s** (`CONFIG.STEP`). `dt` above 0.5 s is clipped.
  `world.alpha` = leftover / STEP, for render interpolation between `hPrev → h` and `(px,py) → (x,y)`.
- No DOM, no `Date`, no `Math.random`: everything random comes from `POG.RNG(seed)` (mulberry32). Same seed + same taps at the same
  times = the same game (a unit test compares full event logs, with uneven frame times too).
- **The hit is decided at tap time.** Pip's hop is only the visible consequence; taps are never queued behind his flight.
- The one rule for the child: a friend **holding a firefly** (`type` `'firefly'` or `'gold'`) → boop it; a friend **napping**
  (`'sleepy'`) → leave it alone (a tap answers `'wrong'`).

## 2. CONFIG (rules)
| key | value | unit | why |
|---|---|---|---|
| `POINTS` | 10 | pts | × `mult` per firefly |
| `GOLD_X` | 5 | × | a golden firefly = 5 × 10 × mult (DESIGN: "worth 5") |
| `MULT_AT` | [5, 10] | combo | ×2 from combo 5, ×3 from combo 10; `combo {n}` event at 5, 10, 15… |
| `CLEAR_BONUS` | 50 | pts | per chapter cleared |
| `LEVEL_GOAL` | 15 | fireflies | per chapter; a gold counts 1 |
| `START_LEAVES` / `MAX_LEAVES` / `LEAF_EVERY` | 4 / 5 / 12 | hearts, fireflies | +1 heart every 12 fireflies (total), never above 5 |
| `GOLD_P` / `GOLD_AFTER` | 0.07 / 3 | share, pops | from the 4th pop of a chapter, 7 % of firefly pops are golden (measured 6.7 %); never the first pop |
| `GOLD_UP_K` | 0.75 | × | a gold stays up ¾ as long: rare, quick, exciting |
| `FAIR_T` / `FAIR_HURRY` | 1.7 / 0.35 | s | no firefly holder visible for 1.7 s → the next pop holds one and comes within 0.35 s (may exceed max-up by one). A firefly is never missing for more than ≈ 2.05 s (measured max 2.0 s). |
| `MAX_FIREFLY_STREAK` | 2 (Easy: preset `maxStreak` 3) | pops | after that many firefly pops in a row while no sleeper is up, the next pop is a sleeper — there is always a real choice |
| `MASH_N` / `MASH_WINDOW` / `MASH_NAP` | 3 / 1.0 / 1.5 | taps, s, s | 3 empty taps within 1 s → Pip naps 1.5 s (taps `'busy'`, combo reset, event `nap`, **no heart lost**) |
| `HIT_MIN_H` | 0.25 | h | a friend is tappable in `rise`/`up` once a quarter out |
| `START_DELAY` | 1.5 | s | chapter start → first pop (banner + voice). The **first pop of every chapter holds a plain firefly**. |
| `CLEAR_T` | 1.2 | s | levelClear → levelUp: everything sinks, no pops, taps `'busy'` |
| `VACATE_GAP` | 0.22 | s | a burrow that just emptied delays the next pop a little (no popcorn) |

### Difficulty presets (`CONFIG.DIFFICULTY`)
| preset | `up` (s) | `interval` (s) | `maxUp` ch. 1/2/3/4 | `missCosts` | `fireflyP` | `maxStreak` |
|---|---|---|---|---|---|---|
| easy (default) | 2.8 | 3.0 | 2 / 3 / 3 / 3 | no | 0.75 | 3 |
| normal | 1.9 | 1.8 | 3 / 3 / 4 / 4 | yes | 0.60 | 2 |
| hard | 1.35 | 1.3 | 3 / 4 / 4 / 5 | yes | 0.50 | 2 |

- `up` = how long a friend stays fully up (× U(0.88, 1.12); gold × 0.75). `interval` = time between pops (× U(0.8, 1.2)).
- `fireflyP` = chance a regular pop holds a firefly (the old colour game's `matchP`). Fairness and the streak rule adjust it:
  measured sleeper share of pops is 30 % / 37 % / 46 %.
- `missCosts`: a firefly holder (gold too) ducking un-booped always emits `miss {hole}`, but costs a heart (and the combo) only on Normal/Hard.
- A sleepy boop costs a heart and resets the combo on every difficulty.

### Speed-up
`speed = (1 + LEVEL_SPEEDUP·zone) · (1 + LOOP_SPEEDUP·min(loop, 4))`, `LEVEL_SPEEDUP = 0.08`, `LOOP_SPEEDUP = 0.15`.
Up time and interval are divided by `speed`, floored at `UP_MIN = 0.8 s` and `INTERVAL_MIN = 0.4 s`.

## 3. Spawning rules
1. Never into an occupied burrow (a sinking friend still occupies it).
2. Not into the burrow that emptied last, unless it is the only free one.
3. Live friends (not sinking) ≤ `maxUp[zone]` (+1 only for a fairness pop).
4. Type: first pop of a chapter → firefly; fairness → firefly; streak rule → sleeper; else `fireflyP`.
   A firefly pop from the chapter's 4th pop on is golden with `GOLD_P`.
5. Kind (fennec / jerboa / tortoise) is random.

## 4. Motion
### Friend pop height `h` (0 = hidden, 1 = fully up)
- **rise / up**: damped spring `h'' = ω²(1 − h) − 2ζω h'`, **ζ = 0.63, ω = 34 rad/s** (semi-implicit Euler, 1/120 s).
  Overshoot e^(−ζπ/√(1−ζ²)) ≈ 7.7 % → peak **h ≈ 1.08 at ≈ 0.11 s**, settled by ≈ 0.2 s. `rise` for 0.22 s, then `up`.
- **sink**: `h = h0·(0.5 + 0.5·cos(π·t/0.2))`, a smooth ease-in-out duck in 0.2 s.
- **booped**: the spring keeps it up; **when Pip lands on its head** a happy bounce `+0.07·sin(πu)·(1 − 0.4u)` over 0.25 s,
  and it sinks `BOOP_AFTER = 0.32 s` after the landing (or after 0.9 s if Pip re-aimed elsewhere and never landed).
- **wow** (sleepy friend tapped: just woken, "huh?"): stays up 0.4 s, then sinks.

### Pip (ballistic frog)
`pip.(x, y)` is his **feet point**. Home = the lily pad **(480, 132)**. Head point of hole i = `(bx, by − 112s + (1 − h)·140s)`
(`= (bx, by − 112s)` at h = 1). Firefly point = `(bx, by − 31s)` (friend-local (70, 94)).

Every flight is an exact parabola under **g = `G` = 2600 px/s²** (y down), evaluated in closed form (no integration drift):
```
x(t) = x0 + vx·t            vx = Δx / T
y(t) = y0 + vy·t + ½·g·t²   vy = (Δy − ½·g·T²) / T      → (x(T), y(T)) = target exactly
```
- **hop** (tap on a firefly holder → `state 'hop'`, event `pipLaunch`): `T = clamp(0.30 + 0.00035·dist, 0.30, 0.48)` as in DESIGN,
  then **stretched** so the take-off velocity points up by at least `√(2g·HOP_LIFT)` (`HOP_LIFT` = 20 px), capped at
  `HOP_LIFT_MAX` = 0.55 s, and **shortened** if the apex would pass `SKY_Y` = 96 (so his ~96 px sprite never leaves the stage).
  Why: every head is *below* the pad, so the plain formula gave a 0–16 px rise and, for the centre column, a straight drop.
  Measured T: back rows 0.38–0.43 s, middle row 0.48 s, front rows 0.55 s; every hop rises 16–20 px first.
- **landing** on the head: `state 'boop'` for `BOOP_T` = 0.18 s, `squash = 1` (decays `e^(−11t)`), event `pipLand {x, y, hole}`;
  he rides the friend's happy bounce; then the return hop.
- **return** (`state 'return'`): T is chosen from an apex `RET_APEX` = 40 px above the pad (not above `SKY_Y`):
  `T = √(2(y0 − top)/g) + √(2(y1 − top)/g)`, clamped to [0.42, 0.72] s. Measured 0.45–0.62 s, always longer and
  higher than the hop that came before, apex at y ≈ 96 (36 px above the pad, 100–250 px above the head).
  Landing: `pipHome {x, y}`, `squash = 1` (render: ripple + `weather.burst('ripple', …)`), `state 'home'`.
- **re-aim**: a tap while he is hopping / on a head / flying home starts a fresh parabola from his current point (velocity jumps:
  the "mid-air kick"). Taps are never blocked by flight.
- **dizzy** (sleepy tap → 0.6 s; mash nap → 1.5 s): taps answer `'busy'` for the first `DIZZY_LOCK` = 0.35 s (and for the whole nap);
  a later firefly tap launches him straight out of it. Tilt wobbles `0.3·sin(2π·3t)` (fading). If he is in the air he finishes his
  parabola; if he lands on a head while dizzy, or is standing on one, he hops home dazed. Then `'home'`.
- **tilt** eases (rate 14/s) toward `face · atan2(vy, |vx| + 260)` while airborne, 0 on the ground; clamped ±0.45 rad (clockwise
  positive: nose up while rising when facing right). **face** = sign(Δx) of each take-off (kept when Δx ≈ 0).
- Events: `pipLaunch {x, y, tx, ty, kind: 'hop'|'return'}` on every take-off ((x, y) = take-off point, (tx, ty) = target),
  `pipLand {x, y, hole}`, `pipHome {x, y}`.

## 5. Weather (`POG.Weather`)
Cap **60** particles (dying ones count; bursts evict old sparkles first), **12** ripples (oldest dropped).
`setLevel(zone)` fades old particles out over 1.0 s while new ones fade in over 0.9 s; `{ instant: true }` swaps at once.
`ripples: [{ x, y, r, alpha }]`: `r = 2 + R·(1 − e^(−3t/life))` (fast then slowing, like a real ring), `alpha = a0·(1 − t/life)^1.5`, life 1.3 s.

| chapter | particles (sprite) | motion |
|---|---|---|
| spring | 3 `dragonfly` (front), 6 `petal`, pool ripples every 1.4–3.2 s | dragonfly: 3 px buzz at 9–13 Hz around an anchor for 0.6–1.8 s, then a dash to a new anchor 90–230 px away on a critically-damped spring (ω = 9 rad/s, ≈ 0.45 s), nose tilted along the dash. Petal: falling pendulum θ = A·sin(ωt+φ), A 0.5–0.9 rad, ω 1.5–2.5 rad/s, R 14–30 px; x = cx + R·sinθ, lifts 0.9·R(1−cosθ) at the swing ends, rot = 1.1θ + tumble; falls 18–30 px/s (light) + gusty wind ±15 px/s; 30 % on the back layer |
| palms | 5 `butterfly_0/1`, 5 `petal` | butterfly: heading = smoothed random walk, soft steering back into x 40–920 / y 90–370, frames swap at 6–8 Hz with a lift per wing beat |
| dunes | 4 `sandwisp` (back), 1 `tumbleweed` every 5–11 s (back) | wisp: slides 18–34 px/s (+ wind), alpha breathes 0.75–1 × a0. Tumbleweed: rolls 70–110 px/s along the horizon line y = 258 (behind the back row), **rot = (x − x0)/r** (rolling without slipping), bumps at 0.7/s throw it up 90–170 px/s, gravity 900 px/s², lands with restitution 0.3 |
| night | 14 `glow` (60 % front), 8 `star_tw` (back, y 22–185) | glow: Lissajous loops (20–60 × 12–40 px, 0.25–0.55 Hz, ratio 1.3–2.1) around a slowly drifting centre, blink = 0.12 s rise then 0.35 s exp fade every 1.6–3.2 s (alpha 0.18…1). Star: twinkle `alpha = 0.3 + 0.7·s³`, s = ½ + ½sin(2π f t), f 0.25–0.6 Hz, size pulses ±15 %, slow spin; pool ripples every 2–4 s |

Bursts: `'sparkle'` 8 sparkles (radial 140–240 px/s, drag 4/s, gravity 160 px/s², spin, fade 0.5–0.75 s); `'gold'` 12 (170–300 px/s,
every third one a `star_tw`, fade 0.7–1.0 s); `'ripple'` two rings (R 34 and 22, the second 0.16 s later) — for `pipHome`.
Ambient ripples land in `Weather.POOL` (x 405–555, y 130–154), around the lily pad.

## 6. Bot (`POG.Bot`)
- Reaction delay `lerp(1.1, 0.25, skill) × U(0.8, 1.3)` s after a friend becomes tappable (a gold × 0.8: it catches the eye).
- Firefly holder: taps with P = 0.75 + 0.25·skill (else looks again later). Sleeper: taps by mistake with P = 0.18·(1−skill)^1.5 + 0.004.
- Several ready at once: a gold first, then the one noticed earliest. One finger: ≥ `0.5 − 0.38·skill` s between taps.

## 7. Playtest results (`node tests/sim/run.js`, 2026-11-27)
Kid models (`tests/sim/harness.js`): gaze radius, reaction, focus, "impulse" taps on sleepers near the gaze, pauses (looking away).
kid4 = react 0.9–1.6 s, +0.4–1.0 s far from the gaze, focus 0.85, taps a sleeper near the gaze 55 % / far 15 %, a 2.5–3.5 s pause
every ~25 s (the sleeper impulse is kept as high as the colour game's decoy rate, so this is pessimistic). kid3 slower and more
impulsive, kid5 quicker.

**Chapter 1 (The Morning Spring) on Easy, 1000 seeds each:**

| kid model | cleared | clear time p10 / p50 / p90 s | first boop p50 / p90 s |
|---|---|---|---|
| kid3 | 60 % | 60 / 73 / 90 | 3.4 / 8.9 |
| **kid4** | **91 %** | **50 / 58 / 70** | 2.9 / 6.0 |
| kid5 | 100 % | 45 / 49 / 57 | 2.5 / 3.6 |

Tuning that got there (kid4 chapter-1 clear rate, 600 seeds): forked CONFIG 58 % → Easy `interval` 2.6→3.0 s 78 % → plus Easy
`maxStreak` 3 (fewer forced sleepers, sleeper share 37 % → 30 %) **92 %**. Pacing stays in the 45–90 s window.

**Bots and players, 100 seeds, 600 s cap** (selected rows; s/chapter = mean for chapters 1/2/3/4+):

| player | diff | alive @600 s | survival p50 s | chapters p50 | ch. 1 cleared | s/chapter | wrong share |
|---|---|---|---|---|---|---|---|
| bot 0.3 | easy | 98 % | 600 | 14 | 100 % | 45/45/43/41 | 3 % |
| bot 1 | easy | 100 % | 600 | 17 | 100 % | 35/35/34/32 | 0 % |
| bot 0.3 | normal | 0 % | 127 | 3 | 93 % | 40/40/39/38 | 6 % |
| bot 0.5 | normal | 9 % | 454 | 12 | 100 % | 37/36/36/34 | 4 % |
| bot 0.8 | hard | 100 % | 600 | 21 | 100 % | 31/30/29/26 | 2 % |
| kid4 | easy | 0 % | 128 | 2 | 92 % | 59/58/58/57 | 16 % |
| kid5 | easy | 16 % | 372 | 7 | 100 % | 51/49/48/46 | 9 % |
| parent | easy | 100 % | 600 | 14 | 100 % | 45/43/43/40 | 2 % |
| parent | normal | 2 % | 276 | 7 | 97 % | 39/38/37/35 | 3 % |
| parent | hard | 0 % | 110 | 3 | 86 % | 36/35/33/32 | 4 % |
| mash (8 taps/s) | easy | 0 % | 48 | 0 | 28 % | – | 27 % |
| tapAll (taps every friend) | easy | 0 % | 375 | 11 | 100 % | 33 | 6 % |

- Mashing never beats looking (the nap guard + sleepers under the finger). Idle on Easy never loses (misses are free); Normal/Hard idle ends in ≈ 11 s.
- Stall check: max gap between pops 3.8 s, max time with no firefly visible 2.0 s, Pip's feet y 96…368 px, no NaN.
- Bot sweep (`--stats`, 20 seeds, 900 s): Easy skill 0.3 clears 21 chapters in 15 min at ≈ 45 s each; Hard skill 0.3 lasts 45 s.

## 8. Contract notes (vs DESIGN §5)
- **Deviation:** the `pop` event carries the friend's type as **`critterType`** (`'firefly'|'gold'|'sleepy'`), because the event's own
  `type` field is `'pop'` — `{type: 'pop', …, type: 'firefly'}` cannot exist.
- **Deviation (tuning):** hop T is the DESIGN formula stretched for a ≥ 20 px rise (up to 0.55 s instead of 0.48 s); return hop
  T range is 0.42–0.72 s (DESIGN ≈ 0.5–0.7) so its apex stays under `SKY_Y`.
- Extra state fields: `alpha`, `difficulty`, `clearing`, `napT`, `stats.levelTimes` (s from chapter start to its levelClear).
  Extra statics/methods: `World.TYPES`, `World.ballistic(x0,y0,x1,y1,T,g)`, `World.hopT(...)`, `World.returnT(y0,y1)`,
  `world.headPoint(i, h)`, `world.speed()`. Extra event fields: `pipLaunch.tx/ty/kind`, `pipLand.hole`, `nap.t`.
- `tapHole` returns `'busy'` during the dizzy lock, the nap **and** the level-clear pause; `'none'` for a bad index, after game over,
  or (`tapAt`) a tap outside every hit zone (no event). `'empty'` emits `empty {x, y}` at the hit-zone centre `(bx, by − 45s)`;
  tapping a friend that is already booped / sinking is `'empty'`.
- `boop` / `wrong` events carry the firefly point `(bx, by − 31s)`. `boop.gold` is true for a golden firefly.
- `gotoLevel(i)` drops queued events, then emits `levelUp`. `debugSpawn(i, type)` replaces whatever is in burrow i (type defaults to `'firefly'`).
- Weather: `Weather.CAP` (60), `Weather.RIPPLE_CAP` (12), `Weather.SPRITES[zone]`, `Weather.POOL` (ripple area — move it if the
  pool art differs), `Weather.TUMBLE` (horizon line y 258). Particles also carry `kind` and internal fields. A `'gold'` burst uses
  `sparkle` and `star_tw` sprites in any chapter.
