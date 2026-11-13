# Comet's Gem Factory — mechanics and motion model

Code: `game/js/world.js` (CGF.CONFIG, CGF.DIFFICULTY, CGF.World), `weather.js`, `bot.js`, `rng.js`.
Tests: `node tests/unit/run.js` (30 tests). Contract: `DESIGN.md` §5. Units: px on the 960×540 stage, seconds, radians, y down.

## 1. Simulation loop
- `update(dt)` adds `dt` to an accumulator and runs fixed sub-steps of **1/120 s** (at most 240 per call, so a tab-out never freezes the page). `alpha = leftover / step` ∈ [0,1).
- Comet and flyers save `prevX/prevY/prevRot` at the **start** of each sub-step → the renderer draws `prev + (cur − prev)·alpha`.
- Everything random comes from `CGF.RNG(seed)` (mulberry32): decks from the main stream, flyer spin from a forked stream (`rng.fork('fx')`), so visual randomness never changes the boards. Same seed + same taps on the same sub-steps → identical event stream (tested).

## 2. Board layout
Cards fit `cols×rows` into `BOARD {180,76,720,392}` with a 12 px gap, centred:
`h = min(124, (392 − 12·(rows−1))/rows)`, `w = min(availW, h·a)` with `a = 0.86` for big cards and `a = 1.0` (square) when h < 100 px — small cards get the biggest finger target. Results:

| Season | Grid | Card w×h | Grid size |
|---|---|---|---|
| Spring | 4×3 | 105×122 | 456×390 |
| Summer | 4×4 | 89×89 | 392×392 |
| Autumn | 5×4 | 89×89 | 481×392 |
| Winter | 6×4 | 89×89 | 594×392 |

`card.x, card.y` = **top-left** (like BOARD); `cx, cy` = centre. Hit test grows each card by 6 px (half the gap), so a tap between two cards still lands on one.

## 3. Card motion
- **Deal** (from the right along the conveyor): each card starts with its left edge at x = 1000 (off-screen). Column `c`, row `r` waits `0.07·c + 0.03·r` s (left column first: it has the longest way), then slides for 0.55 s. Offset for progress p:
  - `p < 0.75`: ease-out cubic `−O + (D+O)(1 − p/0.75)³` → arrives at the overshoot `−O = −9 px` with zero speed;
  - `p ≥ 0.75`: half-cosine back `−O·(½ + ½cos πq)` → zero speed at both ends. Position and velocity are continuous (no pop). Whole deal: 0.82 s (4×3) … 0.99 s (6×4).
- **Flip**: a linear parameter runs 0→1 in `flipTime = 0.22 s`; `flip = easeInOutCubic(param)`; the renderer squashes by `|cos(π·flip)|`. `lift = 6·sin(π·param)` px — the card rises at mid-flip and lands softly.
- **Wiggle** (wrong pair): a damped sine, `wiggleX = 6·e^(−τ/0.16)·(wiggleT/0.45)·sin(2π·7·τ)` px, plus `wiggleRot` = 0.05 rad with the same shape. ~3 visible shakes, |x| ≤ 6 px, exactly 0 at the end (the linear factor removes any final snap).
- The wrong pair stays visible for `missDelay` (≥ wiggleTime) and then flips back. A **3rd tap** closes it immediately (`flipBack` event) and still counts.
- **Match**: cards go `matched` (glow; `pop = popT/0.5`), then `gone` after 0.5 s.

## 4. Comet (rocket kitten) — damped spring steering
`a = k·(target − x) − 2ζ√k·v` with **k = 34 s⁻²** (ω ≈ 5.8 rad/s ≈ 0.93 Hz) and **ζ = 0.78** (one small overshoot, then rest). The thrust is limited to **2400 px/s²** and the speed to **680 px/s**, so a long trip accelerates, cruises, and brakes like a real little rocket — never a teleport (max 5.7 px per sub-step, tested). HOME → far right card ≈ 1.1 s.
- **Target**: centre-x of the last tapped card, 30 px above its top edge (clamped to y ≥ 62, below the HUD) for 2 s after the tap; otherwise HOME (120,200).
- **Hover bob**: the *target* moves ±4 px at 0.8 Hz; the spring follows it, so at rest there is only a smooth bob, no jitter (2nd difference tested).
- **Banking**: `rot → clamp(0.55·vx/680, ±0.35)`, exponential smoothing (8 s⁻¹). Always |rot| ≤ 0.35 (tested over 5 min of play).
- **Flame** (0..1): `0.25 + 0.75·|thrust|/2400`, smoothed (10 s⁻¹); 0 when asleep.
- **happy** (on a match, 0.9 s; on level clear, the whole celebration): a loop-the-loop offset `(R sin θ, ∓R(1−cos θ))`, R = 26 px, with the spring 5× stiffer so it really traces the circle; it loops downwards when there is no room above (top row).
- **oops** (on a combo-breaking miss, 0.8 s): a startled hop kick (−90, −160) px/s; the spring brings it back.
- **sleep** (game over): flies down to (196,440) next to Gizmo, flame out.

## 5. Flyers (matched gems → Gizmo's hopper)
Exact ballistic solution, no integration drift. Flight time `T = 0.62 + dist/1700` s (0.75–1.03 s). With gravity `g = 1500 px/s²` and Δ = HOPPER − start:
`vx = Δx/T`, `vy = (Δy − ½gT²)/T`, `x(t) = x₀ + vx·t`, `y(t) = y₀ + vy·t + ½gt²`.
Since ½gT² (≥ 420 px) > Δy for every card, `vy < 0` → the gem always rises first (apex above the start) and drops into the hopper from above, landing exactly at HOPPER when t = T (tested ≤ 1 px). Spin 5–9 rad/s, random sign. The twin gem leaves 0.12 s later. On landing: `gemLand {kind}`, Gizmo `eat` for 0.45 s (`eaten++`), then back to idle / happy (after a clear) — never while asleep.

## 6. Difficulty and timer — the reasoning
A 4-year-old takes **≈ 1.5–2.5 s per tap** and, with the peek and weak memory, needs **≈ 2.2 attempts (pair flips) per pair**. One attempt = 2 taps, so a level costs ≈ 2.2·pairs·2·(2…2.5 s) + misses × missDelay:

| Season | Pairs | Estimate at 2.5 s/tap | Easy time | + match bonus | Effective |
|---|---|---|---|---|---|
| Spring | 6 | ≈ 73 s | 100 s | 6 × 4 s | 124 s |
| Summer | 8 | ≈ 98 s | 130 s | 8 × 4 s | 162 s |
| Autumn | 10 | ≈ 122 s | 160 s | 10 × 4 s | 200 s |
| Winter | 12 | ≈ 146 s | 195 s | 12 × 4 s | 243 s |

The fuel gauge is capped at `timeLimit` (a refuel cannot overfill it).

| | time [spring, summer, autumn, winter] s | matchBonus | missDelay | peek (6 pairs) + per extra pair | combo break |
|---|---|---|---|---|---|
| **easy** | 100, 130, 160, 195 | 4 s | 1.0 s | 2.5 s + 0.25 s | streak −1 |
| **normal** | 50, 65, 80, 95 | 3 s | 0.8 s | 1.8 s + 0.15 s | streak −2 |
| **hard** | 35, 44, 54, 64 | 2 s | 0.6 s | 1.2 s + 0.10 s | streak → 0 |

Next year: `timeLimit × max(0.6, 0.88^loop)`.

Measured with the bot (40 seeds each; `skill` ≈ memory; a slow bot has its delay replaced by the tap time):

| Player | Spring | Summer | Autumn | Winter |
|---|---|---|---|---|
| easy, 2.5 s/tap, skill 0.2 (≈ 2.2 attempts/pair) | 38/40 cleared, 73 s | 28/40, 102 s | 14/40, 144 s | 9/40, 205 s |
| easy, 2.5 s/tap, skill 0.3 | 39/40, 60 s | 38/40, 89 s | 35/40, 125 s | 35/40, 168 s |
| easy, 2.0 s/tap, skill 0.3 (unit test) | 49 s | 68 s | 98 s | 115 s |
| normal, 1.2 s/tap, skill 0.2 | 40/40, 30 s | 40/40, 48 s | 40/40, 66 s | 39/40, 81 s |
| hard, 0.9 s/tap, skill 0.1 | 39/40 | 35/40 | 30/40 | 23/40 |

So Spring on Easy is comfortably winnable for a 4–6-year-old; the year gets gradually harder and the shift ends gently (Gizmo naps) rather than abruptly.

**Rules recap**: match = 10 × mult (mult = clamp(streak, 1, 5)); a miss only breaks the combo when one of the two cards had already been seen (turned face up by a tap earlier; the peek does not count). Clear: 5 × ceil(timeLeft) + 50 if no combo-breaking miss this level. `hurry` fires once at 10 s left, `tick {s}` at 5,4,3,2,1.

## 7. Weather (`CGF.Weather`)
Cap 260 particles; ambience never exceeds ~80, bursts evict the oldest ambient particle when full.
- Petals / leaves: terminal fall speed (petals 18–36 px/s, leaves 24–44 px/s), a wind drift to the left, and a **pendulum sway** `x = x₀ + A·sin(ωt)`; the tilt follows the swing (`rot ∝ cos ωt`) and `flipX = cos(tumble·t)` gives the 3-D tumble (|flipX| clamped ≥ 0.2).
- Snow: 3 depth layers (4–6 px at 12–20 px/s, 8–11 px at 24–34, 13–17 px at 40–54) → parallax.
- Summer: sun motes (slow drift up, twinkle, 5–10 s life) + 2 butterflies on a Lissajous path, `flipX` = facing × wing flap.
- Steam: every 2.6–4.6 s per vent (`setVents`), 3–4 puffs rising at 40–60 px/s with drag, growing ×2.5, fading.
- Bursts: `sparkle` (radial, drag 4.5 s⁻¹, grow-then-shrink), `spark` (drag + gravity 600 px/s²), `confetti` (launched up 260–560 px/s, gravity 520 + quadratic drag → flutters down at ~60 px/s with a sideways sway and tumble).
- Season change: the old season fades out over 1.5 s while the new one trickles in from the top (`{instant: true}` refills at once).

## 8. Bot
Sees a card when `flip ≥ 0.5` (own flips, wrong pairs, the peek). Each sighting is kept for good with probability `skill`, else forgotten after 1–4 s; good memories also slip at (1 − skill)·3 %/s. Strategy: known pair first; else an unknown card, then its known twin or another unknown. Delay 0.25 s (skill 1) … 1.4 s (skill 0) ± 20 %. Skill 1 clears the whole year on Normal in ≈ 43 s; skill 0.3 clears Easy Spring 30/30.
