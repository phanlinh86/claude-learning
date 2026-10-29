# Foxy's Reef Memory: Mechanics

Owner: mechanics engineer. Code: `game/js/rng.js`, `world.js` (RF.CONFIG, RF.DIFFICULTY, RF.World), `weather.js` (RF.Weather), `bot.js` (RF.Bot).
Tests: `node tests/unit/run.js` from the project folder (31 tests, about 15 s).

## 1. Research and what was applied

| Topic | Finding | Applied |
|---|---|---|
| Memory game maths | With perfect memory, the best strategy is: take a known pair; otherwise flip an *unknown* card; if its partner is known, take it; otherwise flip another unknown card. This needs about **1.61·n** moves for n pairs (Velleman & Warrington, *Matching Expectations*, arXiv:1208.4854). | Bot strategy. The skill-1 bot uses about 1.55 moves per pair (test: ≤ 2.0). This number sets the air budget. |
| Kids and memory games | Children are good at Concentration, but they are *slow*: about 1.5–3 s per pick, plus watching the mismatch. Tension should come from a visible meter and refills, never a hard countdown. | Air meter with a refill per match. Normal is tuned against a simulated child (skill 0.5, 1.2–2.4 s per pick). That child clears Spring on all 8 seeds with about 40 of 60 s left. Easy adds a 2 s peek and much more air. |
| Not making fast players wait | A tap during the mismatch display closes the open pair at once (from DESIGN §1). | `select()` during the mismatch display closes the pair, then flips the new card. |
| Juicy motion and springs | Animation libraries (React Native SpringConfig, motion.dev, Android SpringForce) use underdamped springs (ζ ≈ 0.4–0.6) for a small overshoot. A fixed acceleration and top speed feel "physical". Arrive (brake) before a target to avoid a big bounce. | Slide = accelerate (900 px/s²) → cap at 260 px/s → brake (v ≤ √(2·1600·d) + 70) → hand over to a spring (3.4 Hz, ζ 0.5). Overshoot is about 2 px. Flip uses an ease-in-out sine. Pop uses ease-up then a quadratic shrink. The deal uses ease-out-back. |
| Steering (Reynolds) | Seek + arrive with a force limit gives smooth turns with no teleporting. | Foxy: desired velocity toward the target, slowed inside a 70 px arrive radius. The steering change is capped at 420 px/s² per step. |
| Boids-lite fish schools | Separation, alignment and cohesion. A cheap version: each fish springs to a slot in a formation (cohesion), matches the school velocity (alignment), and pushes off neighbours closer than 14 px (separation). | `Weather._moveSchool`. The school follows a slow sine path across the screen. Tail frames fish_a/fish_b switch at 4–6 Hz. |
| Bubble motion | Small bubbles rise at a terminal speed that grows with size. They wobble or zig-zag sideways and grow as pressure drops. | Rise speed = 22 + 3.2·size px/s, sinusoidal wobble, squash on flipX, +15 % size on the way up. |
| Jellyfish | Jellyfish swim by pulsing: a fast bell contraction gives thrust, then a slow relax while they sink. | Pulse period 1.6–2.4 s. The first 30 % of the cycle is jelly_b with upward thrust; the rest is jelly_a, sinking slowly with drag. Glow peaks on each pulse. |

Sources: [Matching Expectations (arXiv)](https://arxiv.org/pdf/1208.4854) · [ergodicity.net: expected time for an optimal game of memory](https://ergodicity.net/2013/11/05/) · [motion.dev spring](https://motion.dev/tutorials/js-spring) · [Android SpringForce](https://developer.android.com/reference/androidx/dynamicanimation/animation/SpringForce) · [Simulating the collective movement of fish schools (Univ. Tartu)](https://dspace.ut.ee/items/4b8bcf19-11ee-4e59-a5ff-7cdfda344a91).

## 2. Tunables (RF.CONFIG; override with `new RF.World({ config })`)

| Key | Value | Why |
|---|---|---|
| `step` | 1/120 s | Fixed sub-step. `w._acc` is the leftover, used for render interpolation. |
| `trayX/trayY`, `cardW/H`, `cardGap` | 585, 298 · 84×98 · 10 | DESIGN §2. Pitch is 94 px horizontally and 108 px vertically. |
| `grids` | 4×3, 4×4, 5×4, 6×4 | 6 / 8 / 10 / 12 pairs |
| `dealTotal`, `dealFly` | 0.9 s, 0.45 s | Cards rise from below (y 640+) fanned out sideways. The stagger is (0.9−0.45)/(n−1). |
| `peekTime` | 0 (Easy 2) | Peek = flip up, then show for peekTime, then flip down. |
| `flipTime` | 0.18 s | |
| `matchGlow`, `matchPop` | 0.25 s, 0.35 s | Glow, then pop to 1.2× and shrink to 0. The card becomes 'gone' 0.6 s after the match. |
| `mismatchWiggle`, `mismatchShow` | 0.4 s, 0.8 s | `mismatchShow` counts from the moment both faces are fully shown. |
| `slideAccel`, `slideMaxSpeed` | 900 px/s², 260 px/s | Gentle and trackable |
| `slideBrake`, `slideArrive` | 1600 px/s², 70 px/s | Arrival speed makes the overshoot (about 2 px) |
| `settleFreq`, `settleDamp` | 3.4 Hz, 0.5 | Settle bob of about 0.27 s |
| `airMax` | 60 / 70 / 85 / 100 s | Per season, lap 0 |
| `airPerMatch` | 3 s | Capped at airMax |
| `lapAirMul`, `lapAirMin` | 0.8, 0.3 | Both airMax and the refill are multiplied by `max(0.3, 0.8^lap)`. Endless play gets tight. |
| `airLowFrac`, `airLowRearm` | 0.25, 0.4 | 'airlow' fires once. It re-arms only after the air climbs back above 40 % (hysteresis). |
| `pointsPerMatch`, `comboCap` | 10, 5 | Points = 10 × min(combo, 5) |
| `airBonusPerSec` | 2 | Clear bonus = round(air) × 2 |
| `clearTime` | 2.5 s | |
| `foxIdleSpeed`, `foxFetchSpeed`, `foxAccel` | 55, 190 px/s, 420 px/s² | |
| `foxEatRadius` | 28 px | |
| `foxEatTime`, `foxOopsTime`, `foxCheerTime` | 0.4, 0.6, 0.9 s | |
| `cupcakeRise`, `cupcakeDrift`, `cupcakePopVy` | 22, 45, −70 px/s | Cupcake floats up to y 110, sways ±10 px at 1.6 Hz and drifts toward Foxy. Eaten after about 1.5–3 s. |

Measured slides:

| Slide | Travel (card can't be flipped) | Fully settled |
|---|---|---|
| 1 cell, vertical | 0.575 s | 0.86 s |
| 1 cell, horizontal | 0.52 s | 0.83 s |
| 2 cells (both removed cards in one line) | 0.99 s | 1.27 s |

A 2-cell slide is deliberately slow and stays readable. That is the twist.

### Difficulty presets (`RF.DIFFICULTY`, suggestions for the integrator)

| Preset | Overrides |
|---|---|
| easy | `peekTime: 2`, `airMax: [90,105,125,145]`, `airPerMatch: 4`, `mismatchShow: 1.0`, `lapAirMul: 0.88`, `lapAirMin: 0.5` |
| normal | none (CONFIG) |
| hard | `airMax: [40,50,62,75]`, `airPerMatch: 2`, `mismatchShow: 0.6`, `lapAirMul: 0.75` |

Example: `new RF.World({ seed, config: RF.DIFFICULTY.easy })`.

## 3. Rule decisions

- **Moving cards can't be flipped.** While `card.moving` is true, `isSelectable` is false. The card can be flipped again once it reaches its cell; the 0.27 s settle bob (`card.settling`) is cosmetic and does not block it. Other cards can be played during a slide.
- **Air pause rules.** Air drains 1 s/s only in `'playing'`. That includes slides and the mismatch display, because the player can still act on other cards and the mismatch display can be skipped. Air does not drain during the deal, the peek, `'cleared'` or `'dead'`. It also stops the moment the **last pair is matched**, so you can't die during the final pop animation.
- **Resolution.** A pair is judged only when both flips are complete (0.18 s). Taps between the 2nd flip and the judgement are ignored. Tapping one of the shown mismatched cards only closes the pair (returns false).
- **Gravity.** After each pair becomes 'gone', every column (vertical gravity) or row (horizontal) is packed toward the gravity side. Cards keep their order. Cards that are still popping ('matched') keep their cells until they are gone. `col,row` is always the target cell. Autumn's direction is `±1` from the seed and flips every lap. Summer has no slides.
- **Board randomness.** Faces depend only on `seed + level` (`rng.fork('level'+i)`), so restarting with the same seed gives the same boards whatever happened before. Foxy and cupcake randomness use their own fork.
- **Cursor.** It moves to the nearest live card in the pressed direction (straight line first, then the nearest diagonal). It clamps at the edges (no wrap) and skips gone cards. After a removal or slide it snaps to the nearest live card.
- **Foxy.** She wanders in her zone (new target every 1.8–3.6 s). She fetches the nearest cupcake with seek steering, leaving her zone if needed. Frame priority: eat beats oops; cheer happens on combo ≥ 3 and on clear. She faces her direction of travel with ±12 px/s hysteresis, and the tilt is mirrored when she turns. Swim frames cycle 1-2-3-2 faster when she swims faster. When she's out of air she floats up to the surface.

## 4. Contract additions (additive only; nothing renamed)

**Naming clash in §5.1:** `w.cupcakes` is listed both as a counter and as the array. **`w.cupcakes` is the array** of floating cupcakes. **The counter is `w.cupcakesEaten`.** For interop, the array has non-enumerable `valueOf`/`toString` that return the eaten count, so `'× ' + w.cupcakes` and `${w.cupcakes}` still print the number. `w.cupcakes || 0` is still the array, though, so the integrator should read `w.cupcakesEaten` (render.js HUD, main.js stats).

World:
- `w.cfg`, `w._acc`
- `w.pairs`, `w.moves`, `w.levelsCleared`
- `w.airPerMatch` (for this level)
- `w.open` (ids face-up and not yet resolved)
- `w.peeking`, `w.phase` (`'deal'|'peek'|'peekEnd'|'play'|'cleared'|'dead'`)
- `w.tray.cx/cy` (tray `x,y` is the top-left corner)
- `w.cellPos(col,row)`, `w.card(id)`, `w.isSelectable(id)`, `w.lapFactor(i)`, `w.levelAirMax(i)`, `w.snapshot()`
- `RF.DIFFICULTY`

Card:
- `rot` (radians; deal spin + wiggle shake, renderer rotates by it)
- `moving`, `settling`
- `_px,_py`

Fox:
- `target`, `_px,_py`
- `mood` (`'idle'|'happy'|'oops'|'worried'|'surface'`)

Cupcake:
- `age`, `_px,_py`

Weather:
- `w.schools`, `w.current`, `fullCount(s)`, `stats()`
- particle `depth`, `kind`, `season`
- jelly `glow`

Drawing conventions (also in the file headers):
- Cards: centre (x,y), scale, `rot`, alpha. Draw the back when flip < 0.5; x-squash = |1−2·flip|.
- Fox: translate(x, y+bob), rotate(angle), scale(flipX,1), then the right-facing sprite.
- Interpolate with `_px + (x−_px)·(_acc/cfg.step)`.

Extra events:
- `play {level}`: entering 'playing'
- `peek {on}`
- `unflip {ids}`: a mismatched pair flips back
- `cursor {col,row}`
- `cupcakepop {x,y}`: an uneaten cupcake expires after 12 s
- `slide` also carries `moves:[{id,fromCol,fromRow,col,row}]` and `gravity`
- `match` also carries `face`
- `cleared` also carries `air`
- `deal` carries `{level,count}`

`season` and `deal` are emitted on **every** `startLevel`, including level 0 at `reset()`.

## 5. Weather (underwater)

| Season | Particles (steady state) | Ambient |
|---|---|---|
| Spring | 22 plankton sparkles + 12 dot motes, 9+3 bubbles, 1 school of 6–8 fish (52–54 total) | tint aqua 0.04, rays 0.2 |
| Summer | 16+4 bubbles, 2 schools of 6–8, 12 motes (44–48) | warm tint, **rays 0.35** |
| Autumn | 16+4 kelp bits in a 38 px/s current, 9+2 bubbles, 1 school, 10 motes (46–48) | amber tint 0.07, fog 0.05 |
| Winter | sea snow in 3 depths (28 far dots, 16 mid dots, 8 'snow' sprites) + 5 front 'snow', 4 jellies, 4 bubbles (65) | navy tint 0.12, fog 0.3 |

- The front layer has ≤ 12 particles with alpha ≤ 0.6, so the cards stay readable.
- During a season change, old particles fade out over 1 s (staggered by 0–1 s) while new ones ramp in over 2 s. The current also blends.
- Counts stay at 40–90 in steady state and ≤ 150 during a change (measured peak: 96).

## 6. Bot

- **Memory.** The bot learns a face only while the card is face-up on screen. Each sighting is kept for good with probability `skill`; otherwise it is forgotten after 1–3 more moves.
- **Tracking.** Memory follows a card by its position. When a remembered card slides, the bot loses track of it with probability (1−skill)·0.5.
- **Think time.** 0.3–0.9 s divided by (0.5+skill). `thinkMin` and `thinkMax` can be overridden; the child model in the tests uses 1.2–2.4 s.
- **Stats.** `bot.stats = {picks, moves, matches, mistakes, forgotten, lostTrack, levels, deaths}`.

Results:
- Skill 1 clears every level with no forgetting and about 1.55 moves per pair.
- Skill 0.3 needs about 2 moves per pair and dies in endless play around levels 23–36. Bots are much faster than humans, so a person feels the air pressure several laps earlier.
