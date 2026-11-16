# Momo's Dino Drums: Mechanics

Code: `game/js/rng.js`, `world.js`, `weather.js`, `bot.js`. Tests: `node tests/unit/run.js` (29 tests, about 4 s).
High-speed playtest: `node tests/sim/run.js` (about 25 s on 2 cores; results in `tests/sim/results/summary.md`).
The contract is `DESIGN.md §5`. This file has the numbers, the formulas and the small additions.

## 1. Clock and simulation
- `update(dt)` clamps dt to 0..0.5 s and runs fixed sub-steps of `cfg.step = 1/120 s`. Leftover time stays in `w._acc`.
- `songTime` starts at `−readyBeats·beatLen` (count-in, state `'ready'`). At 0 the first downbeat plays, `count {n:0}` ("Go!") fires and the state becomes `'playing'`.
- **Tap time** = `songTime + _acc + offset`: the real time of the call between two sub-steps (no 8 ms rounding) plus the timing-offset setting.
- **Render interpolation** (values saved at the start of every sub-step, `a = _acc / step`):
  - Momo: `pos = kit._ppos + (kit.pos − kit._ppos)·a`.
  - Pip: `x = helper._px01 + (helper.x01 − helper._px01)·a`, same for y.
  - Gems: draw at render time `songTime + _acc`.
- **Determinism**: the chart of level *i* depends only on `(seed, i, difficulty config)`. Same seed + same taps at the same sub-steps → same events, score and Pip path (tested). Pip uses no randomness at all.

## 2. Chart generator (`_genChart`, seeded by `mix(seed, level)`) — unchanged from Kit, minus the pillows
1. `bars = round(songSec / barLen) + lapBars·lap`, capped at `floor(songMaxSec / barLen)`. `songLen = (bars−1)·4·beatLen + beatLen` (one beat after the closing "ta-da" gem).
2. Bar 0: one gem on beat 1. Level 1 bar 1: two gems. Other levels: bar 1 ≤ 3 notes. Last bar: a single gem on beat 1, pitch 7.
3. Other bars: target density `densStart[floor] + densLap·lap`, ramping by `+densRamp` over the song; 8-bar phrases (+0.5 on bars 7–8, −0.5 on bar 1). A pattern with `n = round(target ± 0.5)` notes is picked from 25 one-bar patterns; eighth patterns from level index `eighthsFrom`; cross-lane eighths only with `crossEighths` (Hard). Call-and-response repeat (`repeatChance`), lane keep (`laneKeep`).
4. No 0.25 s cross-lane jump on Normal/Easy: a bar starting right after a beat-3.5 eighth keeps that lane.
5. Pitch: random walk −2..+2 on degrees 0..7, upper lane leans up, downbeats snap to 0/2/4/7.
6. `kind`: `'gold'` (rainbow gem) with `goldChance` = 6 % (not in bars 0–1 or the last bar), else `'gem'`.
7. `minGap` filter across both lanes (earlier note wins).

### Pacing (30 seeds; from `tests/sim/results/baseline.md`)
| Level | BPM | song | Easy notes | Normal notes | Hard notes | approach E / N / H |
|---|---|---|---|---|---|---|
| 1 Riverbank | 84 | 57.9 s | 34 | 43 | 57 | 2.20 / 1.80 / 1.60 |
| 2 Fern Canopy | 96 | 58.1 s | 47 | 63 | 80 | 2.06 / 1.68 / 1.50 |
| 3 Nest Ledge | 104 | 58.3 s | 61 | 78 | 96 | 1.98 / 1.62 / 1.44 |
| 4 Sky Roof | 112 | 58.4 s | 76 | 94 | 113 | 1.91 / 1.56 / 1.39 |
| 8 Sky Roof lap 2 | 120 | 66.5 s | 103 | 129 | — | 1.84 / 1.51 / 1.34 |

## 3. CONFIG (all in `DD.CONFIG`, per-difficulty overrides in `DD.DIFFICULTY`)
| key | Normal | Easy | Hard | unit | why |
|---|---|---|---|---|---|
| `step` | 1/120 | | | s | fixed sub-step; judging uses the exact call time anyway |
| `maxDt` | 0.5 | | | s | a hidden tab must not run a whole song in one frame |
| `readyBeats` | 4 | | | beats | count-in: silence, 3, 2, 1, Go! |
| `clearedTime` | 2.6 | | | s | "floor cleared" moment, then the lift goes up by itself |
| `lapBpm` | 8 | | | BPM | after the Sky Roof the tower starts again a bit faster |
| `approach` / `approachMin` | 1.8 / 1.05 | 2.2 / 1.4 | 1.6 / 0.95 | s | how long a gem hops on screen; ≈ 2.5 beats at 84 BPM |
| `approachRefBpm`, `approachTempoExp` | 84, 0.5 | | | | `approach·(84/bpm)^0.5`: faster songs scroll faster, but stay readable |
| `songSec`, `lapBars`, `songMaxSec` | 60, 4, 75 | | | s, bars | about a minute per floor |
| `minGap` | 0.24 | 0.5 | 0.18 | s | no two notes closer (keeps Sky Roof's eighths on Normal) |
| `eighthsFrom` | 1 | 99 | 0 | level | Normal Riverbank is quarters only |
| `crossEighths` | false | false | true | | lane-jumping eighths are too fast for small hands |
| `maxDensity` | 6 | 4 | 6 | notes/bar | |
| `densStart`, `densRamp`, `densLap` | [1.5,2.1,2.5,2.9], 1.2, 0.4 (**Normal override [1.5,1.8,2.3,2.9]**) | [1.2,1.6,2.0,2.4], 0.8, 0.3 | [2.2,2.8,3.2,3.6], 1.4, 0.4 | notes/bar | gentle start, ramp within and across floors; playtest: Normal 4–6-year-olds reach floor 3 17 → 25 % |
| `repeatChance`, `laneKeep`, `goldChance` | 0.35, 0.55, 0.06 | | | p | call-and-response, calm runs, rare rainbow gems |
| `perfectWin` / `goodWin` / `earlyWin` | 0.075 / 0.17 / 0.34 | 0.10 / 0.22 / 0.34 | 0.055 / **0.09** / 0.28 | s | see §4 (goodWin 0.17 lets reaction-late kids catch; Hard 0.11 → 0.09 so adults must lock onto the beat) |
| `oneButton` | false | **true** | false | | Easy: any tap catches the next gem |
| `wrongLaneMiss` | true | false | true | | kills "tap both rails every beat" |
| `grooveStart`, `perfectGain`, `goodGain` | 0.6, 0.035, 0.02 | | | groove | |
| `missCost` | 0.08 | 0.04 | **0.13** | groove | ~10 misses in a row empty a fresh meter on Normal; ~5 from half full on Hard |
| `emptyCost` | **0.02** (Normal only) | 0 | 0 | groove | × firstLevelCostMul, **level index 0 only**: a tap that catches nothing. Blind one-rail metronome clears Normal floor 1 97 → 58 %; 4–6-year-olds 97 → 90 % |
| `firstLevelCostMul` | 0.5 | 1 | 1 | × | Normal Riverbank very winnable for a 6-year-old |
| `grooveFloor`, `grooveFloorLevels` | 0, 0 | 0.05, 1 | | | Easy level 1 cannot be lost |
| `grooveLow` | 0.25 | | | groove | `groovelow` warning |
| `comboStep`, `multMax`, `comboBreakMin` | 10, 4, 5 | | | catches | ×2/×3/×4; `combobreak` only for combos worth mentioning |
| `perfectPts`, `goodPts`, `goldMul`, `clearBonus` | 100, 50, 3, 1000 | | | points | |
| **`helperCombo`** | **5** | **4** | 5 | catches | REQUIREMENT: Pip at combo 5; small kids a bit sooner |
| **`helperEnter`** | 1.0 | | | s | fly-in: long enough to read as a flight, short enough not to miss a catch |
| **`helperStay`** | 20 | | | s | a third of a song: a treat, not a crutch |
| **`helperLeave`** | 1.0 | | | s | take-off and away |
| **`helperCooldown`** | 6 | | **12** | s | ≈ 2 bars: the child notices Pip went home before it comes back. Hard 12: Pip was a crutch (4.1 → 2.8 saves / song for adults) |
| **`helperMult`** | 2 | | | × | REQUIREMENT: double points |
| **`helperSaveTime`** | 0.6 | | | s | rescue swoop, about one beat |
| **`helperMinLeft`** | 4 | | | s | Pip doesn't arrive during the ta-da ending (DESIGN's "≥ 4 s of song left") |
| `kitMoveTime`, `reachTime`, `reachFirst`, `happyTime` | 0.065, 0.18, 0.08, 0.35 | | | s | Momo arrives with the gem |
| `dizzyTime` | 0.45 | | | s | "oops" face after a miss (was 0.9 s after a pillow) |

Removed with the pillow boss: `bossFirst, bossEvery, bossMinLeft, bossEnter, bossSettle, bossLinger, bossLeave, pillowsPerVisit, pillowGapBeats, pillowAir, pillowClear, oofTime, throwFrame, poofCost, bouncePts`.

## 4. Judging, groove, combo, score
- **Hit**: the earliest live note in the tapped lane (either lane for −1) with |err| ≤ goodWin; perfect if ≤ perfectWin.
- **Early miss** (anti-spam): no hit, but a live note in that lane is between goodWin and earlyWin after the tap → missed early.
- **Empty tap**: nothing judged → `empty`; on level index 0 it costs `emptyCost × firstLevelCostMul` groove (Normal 0.02 × 0.5), never a miss.
- **Wrong rail** (`wrongLaneMiss`): a lane tap that judges nothing while the other lane has a live note within ±goodWin misses that note.
- **Untapped**: `miss` on the first step where `songTime > time + goodWin`.
- Any of these three misses becomes a **save** if Pip is entering or perched (§5).
- Groove: start 0.6, perfect +0.035, good +0.02, miss −missCost (× firstLevelCostMul on level index 0). Clamped 0..1; Easy floor 0.05 on level 1. 0 → `'dead'` once (`dead {score}`), Momo sleepy, Pip leaves.
- Combo +1 per catch; every 10 → mult +1 (max 4, `multup`). A miss resets combo and mult (`combobreak` if ≥ 5). A save keeps the combo (does not add to it).
- Points per hit = `(100 | 50) × mult × (gold ? 3 : 1) × (Pip entering/perched ? 2 : 1)`. Clear bonus `round(groove·1000)·(1+lap)`.

## 5. Pip the helper
### State machine (`w.helper.state`)
```
            combo − base ≥ helperCombo, cool ≤ 0,
            state 'playing', songLen − songTime ≥ 4 s
  away ─────────────────────────────────────────────▶ enter ──(helperEnter 1 s)──▶ with
   ▲  (cool = helperCooldown 6 s)                       │  a would-be miss            │ a would-be miss ─┐
   │                                                    └────────────▶ save ◀─────────┘                  │
   │                                                                    │ (helperSaveTime 0.6 s)          │
   └──────────(helperLeave 1 s)─────── leave ◀──────────────────────────┴──── with: helperStay 20 s ──────┘
  song end / death: enter|with|save → leave (helperout).   startLevel: straight to away (helperout if it was there).
```
- **Calling**: `base` (`w._helperBase`) is the combo when Pip last left (0 after a miss). So Pip comes on the 5th catch in a row, and after a visit a continuing streak needs 5 *more* catches and the cooldown. The check runs on every catch and every step (so a streak that is already long enough calls Pip the moment the cooldown ends). The calling catch itself is not doubled.
- **Doubling**: `hit.helper = true` and points × `helperMult` while `enter` or `with` (not during the swoop or leave).
- **Save**: while `enter` or `with`, the first note that would become a miss (late, early, or wrong rail) is set to `state 'saved'`: no groove loss, combo kept, no points, `stats.saved++`, event `helpersave {id, lane, early}`; `tap()` returns that event. Pip goes to `save` (`saveLane`, `saveId`), then `leave`. A second miss during the swoop is a normal miss.
- **Fields**: `t` s in state; `left` s of stay left (20 during enter, counts down in `with`, 0 when leaving); `cool` s of cooldown (counts down while away); `frame` = `'cheer'` while perched, else `'fly'`. `stats.helpers` counts arrivals. Pip is never anywhere but `away` in the `'ready'` count-in (tested over 4 songs).
- **Debug**: `w.helperNow()` calls Pip now (ignores combo and cooldown) when playing and away; returns true/false.

### Motion (`x01`, `y01` in the HELPER box)
Suggested mapping: `x = ringX + x01·0.5·(VW − ringX)`, `y = coinY[0] + (y01 − 0.5)·2·(coinY[1] − coinY[0])`. So lane-0 drum = (0, 0.5), lane-1 drum = (0, 1). Anchors in `DD.World.HELPER`: away (1.15, −1.0) is just above the top edge in every layout (iPad portrait is the tightest: y ≈ −57 px), so Pip shows ~0.4 s into the fly-in, perch (0.14, 0.12) above-right of the upper drum, drum targets y 0.42 / 0.92.
- **Enter**: quadratic Bézier from where Pip is (away) through the control point (0.75, −0.25) to the perch, parameter `u = smoothstep(t/1 s)` → glides in high, slows and drops onto the perch with zero speed.
- **With (perched)**: `y = perch.y − 0.035·sin²(π·beat)·ramp`, `ramp = min(1, t/0.3 s)`. Pip touches the perch exactly on every beat (sin² has zero slope there, so the landing is soft) and is highest between beats; the ramp removes any jump at landing.
- **Save**: from the start point P0 to the drum D = (0.04, drumY[lane]) and back, `s = sin²(π·u)`, `u = t/0.6 s`: `x = P0.x + (D.x − P0.x)·s + 0.10·sin(2πu)·sin(πu)`, `y = P0.y + (D.y − P0.y)·s`. Zero speed at both ends; the extra term makes the return a little loop instead of retracing the same line.
- **Leave**: Bézier from the current point through (x + 0.15, y − 0.55) to away, `u = smoothstep(t/1 s)`: it rises first like a take-off, then heads off to the top-right.
- The largest per-sub-step move is < 0.06 box units (tested), so the path is smooth at 120 Hz.

## 6. Momo
- Critically damped spring toward `kit.lane`, ω = 4.6/`kitMoveTime`, exact analytic step (no overshoot from rest, clamped to [0,1]); 90 % in ≈ 0.06 s.
- Frames: dizzy ("oops", 0.45 s after a miss; forever when dead) > reach (first 0.08 s after a tap) > happy (0.35 s after a perfect) > reach (< 0.18 s) > idle.

## 7. Weather (`DD.Weather`)
- Fixed 1/60 s steps with an accumulator → deterministic for any dt partition. Ambient counts scale with screen area (×0.6–1.5). Ambient budget 96, fx 40, hard cap 136 (< 140), tested at 960×540, 1280×540, 560×1600, 720×1600, 960×960, 320×480 with burst spam, resizes and hand-overs.

| floor | particles (motion) | ambient |
|---|---|---|
| 0 Riverbank | `mote` pollen in 3 morning light shafts (random accel + drag, soft spring to the shaft); `leaf` back + front; warm `dot`s | warm tint 0.05; `shafts` |
| 1 Fern Canopy | `butterfly` back + front; `mote` drift; `dot`s | green tint 0.05 |
| 2 Nest Ledge | `fluff` in two depth layers (back: small, dim, 10–18 px/s; front: big, 22–32 px/s → parallax); `dot`s | cool tint 0.04, glow 0.1 |
| 3 Sky Roof | `star` (back, upper 55 %, twinkle in place); `firefly` back + front; `dot`s | navy 0.16, glow 1 |

Formulas:
- **Leaf** (pendulum + tumble): `φ = ph + ω·t` (ω 1.6–2.4 rad/s), swing `θ = A·sin φ` (A 0.6–1 rad). `vx = wind + L·dθ/dt`, `vy = fall·(0.35 + cos²φ)`: it sinks fastest at the bottom of the swing and nearly hangs at the turning points, like a real leaf gliding and stalling. `rot = −0.9·θ`.
- **Butterfly** (wander): heading `ψ` turns at rate `ω_turn`, which eases toward random targets in ±0.9 rad/s (loops of radius ≥ 40 px); near the edges it steers back to the centre. Wing beat 7–10 Hz: `sx = 0.22 + 0.78·|cos(flap)|`; each downstroke lifts (`vy −= 26·max(0, −sin flap)`) against a gentle sink of 10 px/s, so it bobs as it flaps. Speed ×(0.8..1.2) with the flap. `flipX` faces the direction of travel. Shies away from Momo (`env.kitX/kitY`).
- **Fluff** (terminal fall + pendulum sway): `x = x0 + A·sin(2πf·t + ph)` (f 0.25–0.45 Hz), `vy = fall·(0.75 + 0.25·cos²)` (slower at the ends of the sway), tilt `rot = 0.45·cos(…)` follows the sway velocity, `x0` drifts with a slow breeze.
- **Firefly**: velocity eases to random targets (lazy wander), soft walls; blink = `0.18 + 0.82·exp(−((phase − 0.5)/0.09)²)` with a 2.2–4 s period.
- **Star**: fixed position, `alpha·(0.5 + 0.5·twinkle)` with a slow and a fast sine.
- `pulse()` (or an integer crossing of `env.beat`): size +12 % and a 3 px bob, decaying over ≈ 0.25 s. Hand-over: old particles fade over 0–2 s, new ones fade in, tint/glow blend over 2 s.
- `burst(sprite, x, y, n, opts)`: defaults for `sparkle`, `star`, `fluff`, `leaf`, `firefly`, `note`, `confetti`, `dot`; `'feather'` is an alias of `fluff`; unknown names fall back to `sparkle`.

## 8. Bot and player models
- `DD.Bot`: plans each note 0.6 s ahead and taps with `offset = plannedTime − now` (frame-rate independent). Skill 1 = always perfect; else σ = 0.10·(1−skill) s, skip 0.3·(1−skill)², wrong lane 0.12·(1−skill). `bot.stats = {taps, planned, skipped, wrongLane, perfect, good, miss, saved, helpers, levels, maxLevel}`.
- `tests/sim/players.js`: `toddler` (new, 3–4 years), `kid`, `casual`, `camper`, spam / metronome exploits, idle.

## 9. High-speed playtest headline (`node tests/sim/run.js --runs 40`, 8 levels max)
| player | clear L1 | reach L3 | median levels | Pip visits / song | saves / song | reach L3 without Pip |
|---|---|---|---|---|---|---|
| Easy toddler | 100 % | 78 % | 2 | 1.3 | 1.3 | 68 % |
| Easy kid 4–6 | 100 % | 100 % | 8 | 3.7 | 3.6 | 100 % |
| Normal kid 4–6 | 100 % | 23 % | 1 | 1.2 | 1.1 | 15 % |
| Normal casual adult | 100 % | 100 % | 8 | 3.7 | 2.9 | 100 % |
| Normal spam both lanes | 0 % | 0 % | 0 | 0 | 0 | 0 % |

Pip arrives about 11–26 s into the first song for real players and roughly doubles a good player's score; for weaker players its saves raise the chance to reach floor 3 by 8–10 points without changing who clears floor 1. Spam and blind-metronome exploits still fail on Normal/Hard (Pip saves at most one miss per visit, and a visit needs 5 real catches).

## 10. Additions to the contract (optional for the integrator)
- `w.tap(lane, offset)` returns the event (`hit | miss | helpersave | empty`) or `null` when ignored.
- `helpersave` also carries `early`. `helper.saveId` (id of the saved gem while `save`). `w.helperNow()`. `DD.World.HELPER` anchors. `getState().helper` = helper state.
- Kept from Kit: `w.time`, `w.levelsCleared`, `w.bars`, `w.deadT` (−1 alive, else s since the groove ran out), `kit.vel`, `DD.World.PATTERNS`, `DD.Weather.TODS / MAX / SPRITES`, `wx.setTod` alias, `ambient.shafts` (Riverbank only).

## Medals (game over, `DD.UI.medalFor(diff, score, cleared)`)
Bronze = finish floor 1 (every small child who completes a song gets one). Silver / gold / platinum by the run's score and need ≥ 1 floor cleared (playtest §5: every age has a next medal to aim for).

| difficulty | silver | gold | platinum |
|---|---|---|---|
| Easy | 5,000 | 50,000 | 100,000 |
| Normal | 20,000 | 75,000 | 250,000 |
| Hard | 50,000 | 150,000 | 450,000 |
