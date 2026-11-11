# Zippy's Jungle Boop — mechanics

Owner: mechanics engineer. Code: `game/js/{rng,world,weather,bot}.js`. Tests: `node tests/unit/run.js` (add `--stats` for the bot sweep below).
All numbers live in `ZJB.World.CONFIG`; this page explains them. Units: logical px (960×540 stage, y down) and seconds.

## 1. Simulation model
- `World.update(dt)` accumulates time and runs fixed sub-steps of **1/120 s** (`CONFIG.STEP`). `dt` above 0.5 s is clipped.
  `world.alpha` = leftover / STEP, for render interpolation between `hPrev → h` and `(px,py) → (x,y)`.
- No DOM, no `Date`, no `Math.random`: everything random comes from `ZJB.RNG(seed)` (mulberry32). Same seed + same taps at the same
  times = the same game (a unit test compares full event logs).
- **Hit is decided at tap time.** Zippy's flight is only the visible consequence; taps are never queued behind his flight.

## 2. CONFIG (rules)
| key | value | unit | why |
|---|---|---|---|
| `POINTS` | 10 | pts | × `mult` per boop |
| `MULT_AT` | [5, 10] | combo | ×2 from combo 5, ×3 from combo 10 (DESIGN §5) |
| `CLEAR_BONUS` | 50 | pts | per biome cleared |
| `LEVEL_GOAL` | 15 | boops | per biome |
| `START_LEAVES` / `MAX_LEAVES` / `LEAF_EVERY` | 4 / 5 / 12 (was 3; playtest) | leaves, boops | +1 leaf every 12 boops (total), never above 5 |
| `COLOUR_EVERY` | 6 | boops | colour changes after 6 boops… |
| `COLOUR_TIME` | 14 | s | …or after 14 s without a boop (so a stuck kid gets a fresh colour) |
| `COLOUR_WARN` | 1.0 | s | `colourWarn {to}` fires 1 s before the change (render pulses the antenna / voice says the new colour) |
| `GRACE` | 1.5 (was 0.8; playtest) | s | the previous colour still counts as a match for 1.5 s after the change (no "gotcha" taps) |
| `FAIR_T` / `FAIR_HURRY` | 1.7 / 0.35 | s | no matching critter visible for 1.7 s → the next pop matches and comes within 0.35 s (it may exceed max-up by one). A matching critter is therefore never missing for more than ≈ 2.05 s. |
| `MAX_MATCH_STREAK` | 2 | pops | after 2 matching pops in a row while no decoy is up, the next pop is a decoy (there is always a real choice) |
| `HIT_MIN_H` | 0.25 | h | a critter is tappable in `rise`/`up` once it is a quarter out |
| `START_DELAY` | 1.5 | s | level start → first pop (the banner/voice has time). The **first pop of every level matches**. |
| `CLEAR_T` | 1.2 | s | levelClear → levelUp: everything sinks, no pops, taps answer `'busy'` |
| `VACATE_GAP` | 0.22 | s | a burrow that just emptied delays the next pop a little (no popcorn) |

### Difficulty presets (`CONFIG.DIFFICULTY`)
| preset | `up` (s) | `interval` (s) | `maxUp` per zone L0/L1/L2/L3 | `missCosts` | `matchP` |
|---|---|---|---|---|---|
| easy (default) | 2.8 | 3.0 | 2 / 3 / 3 / 3 | no | 0.75 |
| normal | 1.9 | 1.8 | 3 / 3 / 4 / 4 | yes | 0.50 |
| hard | 1.35 | 1.3 | 3 / 4 / 4 / 5 | yes | 0.42 |

- `up` = how long a critter stays fully up (each critter × U(0.88, 1.12)). `interval` = time between pops (× U(0.8, 1.2)).
- `matchP` = chance a regular pop holds Zippy's colour; the rest are decoys of another active colour. Fairness and the decoy
  streak rule adjust this, so the measured matching share is ≈ 0.5–0.75.
- `missCosts`: a matching critter that ducks un-booped emits `miss` always, but only costs a leaf (and resets the combo) on Normal/Hard.

### Speed-up
`speed = (1 + LEVEL_SPEEDUP·zone) · (1 + LOOP_SPEEDUP·min(loop, 4))`, `LEVEL_SPEEDUP = 0.08`, `LOOP_SPEEDUP = 0.15`.
Up time and interval are divided by `speed`, floored at `UP_MIN = 0.8 s` and `INTERVAL_MIN = 0.4 s`.
Example (Easy): riverbank 2.6 s up → ruins 2.1 s → riverbank round 2 2.26 s → ruins round 5+ ≈ 1.3 s.

### Colours per biome (`CONFIG.COLOURS`, ids from DESIGN §3)
| zone | colours |
|---|---|
| 0 riverbank | 0 Coral, 1 Sunny (heart vs sun: the most different pair for a first level) |
| 1 bamboo | 0, 1, 2 (Sky added) |
| 2 canopy | 1, 2, 3 (Coral out, Grape in — a new mix, still 3) |
| 3 ruins | 0, 1, 2, 3 |
The next colour is always different from the current one; it prefers a colour already up on the field so the new target is visible at once.

## 3. Spawning rules
1. Never into an occupied burrow (a sinking critter still occupies it).
2. Not into the burrow that emptied last, unless it is the only free one.
3. Live critters (not sinking) ≤ `maxUp[zone]` (+1 only for a fairness pop).
4. Colour: first pop of a level → match; fairness → match; decoy-streak rule → decoy; else `matchP`.
5. Kind (monkey / frog / toucan) is random.

## 4. Motion
### Critter pop height `h` (0 = hidden, 1 = fully up)
- **rise / up**: damped spring `h'' = ω²(1 − h) − 2ζω h'` with **ζ = 0.63, ω = 34 rad/s** (semi-implicit Euler, 1/120 s).
  Overshoot e^(−ζπ/√(1−ζ²)) ≈ 7.7 % → peak **h ≈ 1.08 at ≈ 0.11 s**, settled (±2 %) by ≈ 0.2 s. State is `rise` for 0.22 s, then `up`.
- **up** lasts `upFor` s, then **sink**: `h = h0·(0.5 + 0.5·cos(π·t/0.2))` — a smooth ease-in-out duck in 0.2 s.
- **booped**: the spring keeps it up, and at 0.2 s (when Zippy lands) a happy bounce `+0.07·sin(πu)` over 0.25 s; sinks at 0.45 s.
- **wow** (wrong tap): stays up surprised for 0.4 s, then sinks.
- `hPrev` = h of the previous sub-step (interpolate with `world.alpha`).

### Zippy
- **fly**: a cubic Hermite arc from his current position/velocity to `(bx, by − 120s)`.
  Start velocity = current velocity + an upward jetpack kick `LIFT = 260 px/s × (1 − speed/900)` (so from the hover he hops up, then
  swoops down; a retarget mid-flight keeps his velocity continuous). End velocity = 0.35 × chord speed (he arrives with a bump).
  Duration `T = clamp(0.18 + 0.00028·dist, 0.18, 0.30)` s.
- **boop**: holds at the target 0.18 s (render squashes), emits `zippyArrive` at the start.
- **return**: Hermite arc home (480, 112), start = 0.3 × current velocity + 140 px/s up, end velocity 0, `T = clamp(0.42 + 0.0009·dist, 0.42, 0.7)` s — slow and gentle.
- **home**: hover bob `y = 112 + 4·sin(2π·0.8·t)`.
- **dizzy** (wrong tap): 0.6 s, velocity decays (drag 8/s), tilt wobbles `0.38·sin(2π·3t)` (fading). Taps during the first 0.35 s
  return `'busy'`; after that a tap launches him straight out of the dizzy state. Then he returns home.
- **tilt** eases (rate 16/s) toward `face · atan2(vy, |vx| + 250)`, clamped ±0.5 rad (clockwise positive: nose down when facing right).
  `face` = sign(vx) whenever |vx| > 30 px/s. `px, py` = previous sub-step position.

## 5. Weather (`ZJB.Weather`)
Cap **60** particles (dying ones count; bursts evict old sparkles first). `setLevel(zone)` fades old particles out over 1.0 s while new ones fade in over 0.9 s; `{ instant: true }` swaps at once.
| biome | particles | motion |
|---|---|---|
| riverbank | 3 `dragonfly` (front), 4 `leaf` | hover: 3 px buzz at 9–13 Hz around an anchor for 0.6–1.8 s, then dash to a new anchor 90–230 px away on a critically-damped spring (ω = 9 rad/s, ≈ 0.45 s), nose tilted along the dash, flipX = moving left |
| bamboo | 16 `leaf` (30 % back layer) | pendulum: θ = A·sin(ωt + φ), A 0.5–0.95 rad, ω 1.4–2.4 rad/s, R 14–34 px; x = cx + R·sinθ, lifts R(1−cosθ) at the ends of a swing; rot = 1.1θ + tumble; falls 24–42 px/s plus a gusty wind (±15 px/s) |
| canopy | 6 `butterfly_0/1`, 6 `leaf` | heading = smoothed random walk, soft steering back into x 40–920 / y 90–370; frames swap at 6–8 Hz with a small lift per wing beat |
| ruins | 16 `firefly`, 4 `mist` (back), 8 `drop` | fireflies: Lissajous loops (20–60 × 12–40 px, 0.25–0.55 Hz, ratio 1.3–2.1) around a slowly drifting centre; blink = 0.12 s rise then 0.35 s exp fade every 1.6–3.2 s (alpha 0.18…1). Mist slides 8–18 px/s along y 445–515, alpha breathes. Drops spray from `Weather.WATERFALL` (x 860, y 170, ±20) and arc under 420 px/s² gravity |
| all | `burst('sparkle', x, y)` | 8 sparkles, radial 140–240 px/s, drag 4/s, light gravity, spin, fade over 0.5–0.75 s |

## 6. Bot (`ZJB.Bot`)
- Reaction delay `lerp(1.1, 0.25, skill) × U(0.8, 1.3)` s after a critter becomes tappable.
- Colour belief lags a change by one reaction delay (grace forgives most of that; slow players sometimes tap the old colour).
- Matching critter: taps with P = 0.75 + 0.25·skill (else looks again later). Decoy: taps by mistake with P = 0.18·(1−skill)^1.5 + 0.004.
- One finger: ≥ `0.5 − 0.38·skill` s between taps. `bot.taps` counts the answers.

## 7. Level pacing — bot sweep
`node tests/unit/run.js --stats` (20 seeds each, 900 s cap). "L0 cleared" = runs that finished the first biome.

| difficulty | skill | L0 cleared | median survival | median levels cleared | avg s per level L0 / L1 / L2 / L3+ |
|---|---|---|---|---|---|
| easy | 0.3 (a 4-year-old) | 19/20 | 900 s (cap) | 21 | 42 / 42 / 42 / 39 |
| easy | 0.5 | 20/20 | 900 s | 24 | 40 / 39 / 39 / 35 |
| easy | 0.8 | 20/20 | 900 s | 27 | 36 / 35 / 35 / 31 |
| easy | 1 | 20/20 | 900 s | 29 | 33 / 32 / 32 / 29 |
| normal | 0.3 | 19/20 | 105 s | 2 | 39 / 40 / 39 / 40 |
| normal | 0.5 | 20/20 | 377 s | 10 | 37 / 37 / 37 / 35 |
| normal | 0.8 | 20/20 | 900 s | 29 | 34 / 34 / 32 / 29 |
| normal | 1 | 20/20 | 900 s | 31 | 32 / 31 / 31 / 27 |
| hard | 0.3 | 2/20 | 24 s | 0 | 39 / – / – / – |
| hard | 0.5 | 15/20 | 55 s | 1 | 34 / 35 / 34 / 33 |
| hard | 0.8 | 20/20 | 674 s | 23 | 31 / 31 / 29 / 26 |
| hard | 1 | 20/20 | 900 s | 35 | 29 / 29 / 28 / 24 |

Reading it:
- Easy is forgiving (misses are free, wrong taps are rare at 2 colours) — a young kid keeps playing as long as they like.
  Normal punishes a careless player within a couple of minutes; Hard is for adults.
- The bot's level time (≈ 30–42 s) is the floor set by the fairness rule (a match at least every ≈ 2 s plus reaction time).
  Real children react slower than the bot (≈ 1.5–2 s, plus looking away), so expect ≈ 45–70 s per biome on Easy.
  If playtesting says it is still too quick: raise `FAIR_T` (main knob) or `interval`; to make it slower without making it
  emptier, keep `maxUp` and lower `matchP` on Normal/Hard only.

## 8. Contract notes (additions to DESIGN §5, nothing renamed)
- Extra state fields: `alpha` (interpolation factor), `difficulty`, `clearing` (true during the 1.2 s field clear),
  `stats.levelTimes` (s from level start to its levelClear). Extra method `world.speed()`.
- `tapHole` returns `'busy'` during the dizzy lock **and** during the level-clear pause; `'none'` for a bad index, after game over,
  or (`tapAt`) a tap outside every hit zone (no event). `'empty'` emits `empty {x, y}` at the hit-zone centre `(bx, by − 45s)`.
- `boop` / `wrong` events carry the star position `(bx, by − 29s)` (critter-local (70, 96) when h = 1).
- `gotoLevel(i)` drops queued events, then emits `levelUp`. `debugSpawn(i, colour)` replaces whatever is in burrow i (colour defaults to Zippy's).
- Weather: `Weather.CAP` (60), `Weather.WATERFALL` (spray origin — move it to match the ruins art), particles also carry `kind` and internal fields.
- Hit zones of neighbouring rows overlap a little (e.g. riverbank back/front); the nearest centre wins, as specified.

## Post-QA changes (2026-11-11)
- Playtest (`docs/reports/playtest.md`): `START_LEAVES` 3→4, `GRACE` 0.8→1.5, Easy up 2.6→2.8 s, interval 2.4→3.0 s, matchP 0.65→0.75. A 4-year-old model clears Riverbank on Easy 26 % → 83 %.
- Mash guard: `MASH_N` 3 empty taps within `MASH_WINDOW` 1 s → Zippy naps `MASH_NAP` 1.5 s (taps answer 'busy', combo resets, no leaf lost; event `nap`). Mashing no longer beats looking.
- `TARGET_DY` 120→160: Zippy boops from above the friend's head instead of covering its face (visual QA).
- The sweep tables above were measured before these changes.
