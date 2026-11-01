# Kit's Toybox Beat: Mechanics

Code: `game/js/rng.js`, `world.js`, `weather.js`, `bot.js`. Tests: `node tests/unit/run.js` (21 tests, about 3 s).
The contract is `DESIGN.md §5`. This file covers the numbers, the maths and the few additions.

## 1. Clock and simulation
- `update(dt)` clamps dt to 0..0.5 s and runs fixed sub-steps of `cfg.step = 1/120 s`. The leftover time is kept in `w._acc`.
- `songTime` starts at `−readyBeats·beatLen` (the count-in, state `'ready'`). At 0 the first downbeat plays, `count {n:0}` ("Go!") fires and the state becomes `'playing'`.
- **Tap time** = `songTime + _acc + offset`. This is the real time of the call between two sub-steps, so taps are not rounded to the 8 ms step. The optional `offset` is the timing-offset setting, in seconds.
- Render interpolation:
  - Kit: `pos = _ppos + (pos − _ppos)·(_acc/step)`.
  - Boss: `_px01/_py01` work the same way.
  - Coins: draw them at render time `songTime + _acc`.
- Determinism: the chart of level *i* depends only on `(seed, i, difficulty config)`. Same seed and the same taps at the same sub-steps give the same events and score (tested).

## 2. Chart generator (`_genChart`, seeded by `mix(seed, level)`)
1. `bars = round(songSec / barLen) + lapBars·lap`, capped at `floor(songMaxSec / barLen)`. `songLen = (bars−1)·4·beatLen + beatLen`, which ends one beat after the closing "ta-da" coin.
2. **Bar 0**: one coin on beat 1.
   - On level 1, bar 1 has two coins (beats 1+3, same lane or call-and-response).
   - On other levels, bar 1 has at most 3 notes.
   - **Last bar**: a single coin on beat 1, pitch 7 (the octave).
3. **Other bars**: target density = `densStart[tod] + densLap·lap`, ramping linearly by `+densRamp` over the song.
   - Phrases are 8 bars long. Bars 7–8 of a phrase add +0.5 (build-up) and bar 1 of the next phrase subtracts 0.5 (breather).
   - `n = round(target ± 0.5)`, clamped to `1..maxDensity`. A pattern with n notes is picked from the library (25 one-bar patterns: quarters, same-lane eighth pairs, and cross-lane eighths for Hard only).
   - Eighth-note patterns are only allowed from level index `eighthsFrom`.
   - With probability `repeatChance`, a bar repeats the previous rhythm with the lanes swapped (call-and-response).
   - Otherwise the main lane stays the same with probability `laneKeep`.
4. **Pitch**: a random walk of steps −2..+2 on scale degrees 0..7. The upper lane leans up and the lower lane leans down. Downbeats snap to a chord tone (0, 2, 4, 7). The first note is 0.
5. **Gold**: `goldChance` = 6 % per coin (never in bars 0–1 or the last bar).
6. **minGap filter**: across both lanes, a note closer than `minGap` to the previous kept note is dropped (the earlier note wins).
7. **Boss visits**: visit starts are at `bossFirst + k·bossEvery` (12 s, 42 s, …) while `start ≤ songLen − bossMinLeft`, and the 3rd pillow must land at least 2 beats before the ta-da bar.
   - Pillow 1 lands on the first integer beat with `tThrow = (beat − pillowAir)·beatLen ≥ start + bossEnter + bossSettle`.
   - Pillows 2 and 3 land 4 and 8 beats later (one bar apart). Each pillow's lane is random.
   - Coins within `max(pillowClear·beatLen, minGap)` of a pillow are removed, so the pillow replaces them.
   - Leave time: `tLeave = lastPillow.time + goodWin + bossLinger`. `tOut = tLeave + bossLeave`.
   - Result: **2 visits (6 pillows) on every level** (tested).

### Pacing (average over 10 seeds; approach = seconds a coin is on screen)
| Level | BPM | song | Easy notes | Normal notes (eighths) | Hard notes (eighths) | approach E / N / H |
|---|---|---|---|---|---|---|
| 1 Dawn | 84 | 57.9 s | 33 | 40 (0) | 50 (1) | 2.20 / 1.80 / 1.60 |
| 2 Noon | 96 | 58.1 s | 44 | 55 (0.2) | 71 (5) | 2.06 / 1.68 / 1.50 |
| 3 Sunset | 104 | 58.3 s | 57 | 70 (2) | 85 (12) | 1.98 / 1.62 / 1.44 |
| 4 Night | 112 | 58.4 s | 69 | 85 (5) | 100 (17) | 1.91 / 1.56 / 1.39 |
| 5 Dawn lap 2 | 92 | 68.5 s | 46 | 58 | 74 | 2.10 / 1.72 / 1.53 |
| 8 Night lap 2 | 120 | 66.5 s | 95 | 116 (11) | 140 (32) | 1.84 / 1.51 / 1.34 |

Note counts include the 6 pillows. Normal level 1 has about 1.9 notes per bar, quarter notes only.

Bot results (5 seeds, levels cleared out of 8):
- Easy: 8 / 8 / 8 for skill 0.2 / 0.5 / 0.8.
- Normal: 2.2 / 8 / 8.
- Hard: 0.2 / 8 / 8.

## 3. Timing windows (s, |tap − note.time|)
| | perfect | good | early-miss band | approach @84 |
|---|---|---|---|---|
| Easy | 0.10 | 0.22 | 0.22–0.30 (lane −1, any lane) | 2.2 s |
| Normal | 0.075 | 0.15 | 0.15–0.30 | 1.8 s |
| Hard | 0.055 | 0.11 | 0.11–0.28 | 1.6 s |

How a tap is judged:
- **Hit**: the earliest live note in the tapped lane (either lane for −1) with |err| ≤ goodWin.
- **Early miss**: if there is no hit, the earliest live note in that lane whose time is between goodWin and earlyWin after the tap is missed early. This is the anti-spam rule.
- **Empty**: anything else. There is no penalty, and a wrong-lane tap during a note's window is also just empty.
- **Untapped note**: it becomes `miss` (pillows become `poof`) on the first step where `songTime > time + goodWin`.

Approach time: `approach = max(approachMin, approach·(84/bpm)^0.5)`.

## 4. Groove, combo, score
- Groove starts at 0.6.
  - perfect +0.035, good +0.02.
  - miss or early miss −missCost: E 0.04, N 0.08, H 0.11.
  - poof −poofCost: E 0.03, N 0.08, H 0.10.
- **Level 1 (index 0) on Normal**: costs × `firstLevelCostMul = 0.75` (miss 0.06). It is clamped to 0..1.
- **Easy**: groove floor 0.05 on level 1 (`grooveFloor`/`grooveFloorLevels`), so level 1 can't be lost.
- Normal with no taps dies after about 10 misses (16–19 s into level 1).
- Crossing below 0.25 → `groovelow`. Reaching 0 → state `'dead'` at once, with `dead {score}` emitted once. Songtime freezes and taps are ignored. `kit.dizzy` is set huge so Kit shows the dizzy/sputter frame.
- **Combo**: +1 per catch or bounce. Every 10 catches, mult goes up by 1 (max ×4) and `multup` fires. A miss, early miss or poof resets combo to 0 and mult to 1 (`combobreak` fires if combo ≥ 5).
- **Points**:
  - perfect 100·mult, good 50·mult, gold ×3.
  - Pillow bounce 250·mult, for perfect or good.
  - Clear bonus `round(groove·1000)·(1+lap)`, added to the score.

## 5. Kit and Baron Fluff motion
- **Kit**: a critically damped spring toward `kit.lane`, with ω = 4.6 / `kitMoveTime` (0.09 s) ≈ 51 /s.
  - It uses the exact analytic step, so it never overshoots from rest and stays clamped to [0,1].
  - It reaches 90 % in about 0.08 s. The biggest per-step move is under 0.2.
- **Kit frames**: dizzy > happy (0.35 s after a perfect) > reach (< 0.18 s after a tap) > idle.
- **Boss path**, in 0..1 coordinates of the upper-right play area:
  - Away: (1.3, 0.12).
  - Enter: smoothstep from (1.3, 0.04) to the moving hover point over 1.2 s.
  - Hover: x = 0.80 + 0.03·sin(2π t / 2 bars) (slow sway), y = 0.22 + 0.02·sin(π·beat) (bob every 2 beats).
  - Leave: smoothstep to (1.3, 0.0) over 1.2 s.
  - Oof knock-back: +0.035·sin(π·u) in x over 0.8 s.
  - Frames: `oof` while knocked back; `throw` from 0.12 s before to 0.23 s after each throw; otherwise `idle`.
  - `boss.next` = seconds until the next visit (999 if there is none, 0 while visiting).
  - `boss.t` = seconds in the current state.

## 6. Weather (`KB.Weather`)
- Fixed 1/60 s steps with an accumulator, so it is deterministic for any dt partition.
- Ambient counts scale with screen area (×0.6–1.5).
- Limits: ambient budget 96, fx limit 40, hard cap 136 (< 140). These are tested on 960×540, 1280×540, 560×1600, 720×1600, 960×960 and 320×480, with burst spam and hand-overs.

| tod | particles | ambient |
|---|---|---|
| dawn | `mote` drifting inside 3 diagonal light shafts (brighter near the shaft centre), dust `dot`s | tint peach 0.06; `shafts` |
| noon | `bubble`s rising, wobbling (size ±6 %), popping (tiny `dot` burst) and respawning; nudged away by Kit | none |
| sunset | `fluff` blown right by a gusty breeze, with a pendulum swing and tilt; warm `dot`s | orange 0.10, glow 0.25 |
| night | projector `star`s on the wall (back) slide slowly, spin and twinkle; floating `sparkle`s (front) | navy 0.18, glow 1 |

- `pulse()` (or an integer crossing of `env.beat`): particles swell by 12 % and bob up 3 px, decaying over about 0.25 s.
- Hand-over (`setLevel(tod)` without `instant`): the old particles fade out over 0–1.2 s. The new ones fade in, and the tint and glow blend over 2 s.
- `burst(sprite,x,y,n,opts)` has defaults for `sparkle`, `star`, `feather` (falls slowly, rocking), `note` (floats up), `confetti` (random bright colours) and `dot`.
  - opts: `{speed:[a,b], life:[a,b], size:[a,b], color, layer, dir, spread}`.

## 7. Additions to the contract (all optional for the integrator)
- `w.tap(lane, offset)` returns the resulting event object, or `null` when the tap is ignored (cleared or dead).
- **Pillow events**: the `bounce` event also carries `judge, err, combo, mult`, and `poof` carries `early`. Pillows do **not** emit `hit` or `miss`; use `bounce` and `poof`.
- New world members:
  - `w.time` (total seconds), `w.levelsCleared`, `w.bars`.
  - `w.getState()` returns a summary for the debug hook.
  - `w.bossNow()` starts a visit now. Setting `w.boss.next = 0.01` while he is away (main.js `bossNow()`) also triggers it.
  - `kit.vel`, `boss.oof` (seconds of knock-back left).
- `KB.World.PATTERNS`, `KB.Weather.TODS / MAX / SPRITES`. `wx.setTod` is an alias of `setLevel`. `ambient.shafts` is set for dawn only.
- **CONFIG additions**:
  - `readyBeats, clearedTime, lapBpm, approachRefBpm, approachTempoExp, approachMin`
  - `songSec, lapBars, songMaxSec, eighthsFrom, crossEighths, maxDensity, densStart, densRamp, densLap, repeatChance, laneKeep`
  - `bossSettle, bossLinger, pillowsPerVisit, pillowGapBeats, pillowClear, oofTime, throwFrame`
  - `firstLevelCostMul, grooveFloor, grooveFloorLevels, grooveLow, comboBreakMin, clearBonus`
  - `kitMoveTime, reachTime, happyTime, dizzyTime, maxDt`
- **Deviation**: Easy `minGap` is **0.5 s** instead of 0.55. Night's beat at 112 BPM is 0.536 s, so 0.55 would drop every second quarter note and make Night easier than Sunset.
- **Bot** (`KB.Bot`): it plans each note 0.6 s ahead and taps with `offset = plannedTime − now`, so it is frame-rate independent. Skill 1 is always perfect. Otherwise:
  - timing error σ = 0.10·(1−skill) s
  - skip chance 0.3·(1−skill)²
  - wrong-lane chance 0.12·(1−skill), never in one-button mode
  - `bot.stats`: `{taps, planned, skipped, wrongLane, perfect, good, miss, bounced, poofed, levels, maxLevel}`. Call `bot.step(dt)` before `w.update(dt)`.

## Changes after QA (2026-11-01)
Playtest (`docs/reports/playtest.md`, re-simulated in `tests/sim/results/baseline.md`):
- Normal: `firstLevelCostMul` 0.75 → 0.5, `goodWin` 0.15 → 0.17, `earlyWin` 0.30 → 0.34. Easy: `earlyWin` 0.30 → 0.34, `maxDensity: 4` now actually applies (it was inside a comment). Hard: `pillowClear` 1 → 1.5.
- New `wrongLaneMiss` (CONFIG true, Easy false): a lane tap that judges nothing while the **other** lane has a live note within ±goodWin misses that note immediately (`miss`, early false). Kills the "tap both lanes on every beat" exploit (Normal: clears all 8 → median 1 level; Hard: 61 % → 0 %), honest players unaffected. Kid model clears Normal Dawn 53 % → 98 %.
- Chart: on Normal/Easy (no `crossEighths`), if a bar ends with an eighth on beat 3.5 and the next bar starts on its downbeat, that first coin stays in the same lane (no 0.25 s cross-lane jump). Unit-tested over 360 charts.

Kit / render (visual QA):
- `kitMoveTime` 0.09 → 0.065 s (Kit now arrives with the coin). New `reachFirst` 0.08 s: frame order is dizzy → reach (first 0.08 s after a tap, even on a perfect) → happy → reach (until `reachTime`) → idle.
- New world field **`w.deadT`**: −1 while alive, else seconds since the groove ran out (counts up in the 'dead' state). The renderer uses it for the rocket sputter / gentle sink before game over.
