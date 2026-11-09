# Finn's Island Fling — Mechanics

Code: `game/js/world.js` (FIF.World), `game/js/bot.js` (FIF.Bot), `game/js/weather.js` (FIF.Weather).
Tests: `node tests/unit/run.js` (27 tests, ~6 s); `node tests/unit/run.js --stats` adds the long bot / kid report below.
All world values are in units **u** (≈ 1 m) and seconds, y UP, sea surface y = 0 (DESIGN §2).

## 1. CONFIG (headline values)

| Key | Value | Why |
|---|---|---|
| `STEP` | 1/120 s | fixed sub-step with accumulator; `alpha` = leftover fraction for render lerp |
| `G` | 9 u/s² | a bit lighter than Earth: 1.4–2.2 s flights feel like "wheee… plop" |
| `VMAX` | 14 u/s | speed at full pull; a ½–⅔ pull reaches the raft |
| `PULL_MAX` / `PULL_MIN` | 1.8 / 0.3 u | big visible band; a smaller pull cancels |
| `PULL_DOWN` / `PULL_FWD` | 1.4 / 0 u | fox stays ≥ sling.y − 1.4; can't be pulled in front of the fork (every fling goes right) |
| `FLUTTER_VY` | 3.2 u/s | `vy = max(vy,0) + 3.2`: +0.57 u rise, ≈ 0.7 s more hang time — rescues a short shot |
| `R_FOX` + `R_LEAF` | 0.45 + 0.35 u | pickup radius 0.8 u (generous) |
| `FOOT` | 0.49 u | body centre → feet (art: feet line 112/128 of 1.3 u) |
| `LAND_PAD` | 0.15 u | toes on the edge still land |
| `BUMP_E`, `GULL_R` | 0.7, 0.42 u | soft gull "boing" |
| `RAFT_TOP`, `RAFT_GLIDE` | 0.35 u, 0.9 s | deck top; raft glides (smoothstep) to its next spot after each shot |
| `LAND_T` / `SPLASH_T` / `FLOP_T` | 1.0 / 1.2 / 0.8 s | outcome display times |
| `LAND_KEEP`, `FRICTION` | 0.3, 5 u/s² | touchdown keeps 30 % of the relative vx, then friction; the fox rides the drifting deck and never leaves it |
| `ROT_RATE` | 7 /s | nose eases toward the velocity angle |
| `BONK_T`, `BONK_SPIN`, `BONK_DRAG` | 0.5 s, 11 rad/s, 4 /s | tumble after a gull bump |
| `SPLASH_SINK`, `SINK_RATE` | 0.2 u, 6 /s | body eases down to the splash frame's water line |
| `GULL_SPEED`, `GULL_Y` | 0.5–0.9 u/s, 2.5–5.5 u | slow drift with wrap; climb to y ≥ 5.2 over the sling (x < 5.4) |
| `MIN_RAFT_DX` | 5 u | raft never closer than 5 u to the sling |
| `LEAF_Y`, `LEAF_MIN_X`, `LEAF_GAP` | 1.0–6.8 u, 4.4 u, 0.9 u | leaves in the calm band, off the rock/sling, spaced out |
| `ARC_ANG`, `ARC_APEX` | 34°–64°, 6.5 u | solution arc angle range and max apex |
| `LANDINGS_PER_LEVEL` | 5 | |
| `HEART_EVERY` | 20 leaves | capped at maxHearts |
| `DAY_LEN`, `DAY_START` | 150 s, 0.12 | |
| `DAWN_END`, `DUSK` | 0.12, [0.55, 0.70] | smoothstep ramps |
| `NIGHT_LIGHT`, `NIGHT_AT` | 0.3, 0.55 | darkest light; `isNight` while light < 0.55 |
| `NIGHT_PREVIEW`, `PREVIEW_DT` | 0.6, 0.06 s | preview 60 % as long at full night; dot spacing |
| `POINTS` | leaf 1, moon 2, land 2, bull +3, streak +1/step (max +4) | |
| `LOOP_CAP` | 3 | loops get harder up to loop 3 |

`DIFF` (per difficulty, multiplies the level table):

| | hearts | hwK | bullK | ampK | previewK | gullK | gullSpeedK |
|---|---|---|---|---|---|---|---|
| easy | 5 | 1.15 | 1.2 | 0.7 | 1.25 | +0 | 0.8 |
| normal | 3 | 1.0 | 1.0 | 1.0 | 1.0 | +0 | 1.0 |
| hard | 3 | 0.85 | 0.85 | 1.25 | 0.75 | +1 (on gull levels / loops) | 1.2 |

## 2. Formulas

- **Launch**: pull `p` (clamped), fox starts at `sling + p`, `v = −p / PULL_MAX · VMAX`.
- **Flight** (exact parabola per step, so preview = flight to 1e-6): `x += vx·h`, `y += vy·h − ½G·h²`, `vy −= G·h`. No drag.
- **Preview**: `x(t) = x0 + vx·t`, `y(t) = y0 + vy·t − ½G·t²` at `t = i·PREVIEW_DT`, stops below the sea. `previewCount = round(PREVIEW · (NIGHT_PREVIEW + (1−NIGHT_PREVIEW)·k))`, `k = (light − NIGHT_LIGHT)/(1 − NIGHT_LIGHT)`.
- **Landing**: feet `y − FOOT` cross `raft.top` downward with `|x − raft.x| ≤ hw + LAND_PAD` (touchdown x interpolated inside the step). Bull: `|x − raft.x| ≤ bull`. Points = 2 + (bull ? 3 : 0) + min(4, streak − 1).
- **Splash**: feet < 0, or x < −1, or x > 17.5 → −1 heart, streak 0. At 0 hearts → `over` + `gameOver` after the splash.
- **Flop** (addition): a weak fling whose feet come down on the beach rock (x < 4.6, top 1.2) → phase `flop` (0.8 s, fox state `bonk`), no heart lost, streak reset, then a normal `newShot`.
- **Gull bump**: circle `R_FOX + GULL_R`; relative normal speed `vn < 0` → `v −= (1 + BUMP_E)·vn·n`, push out, spin ±11 rad/s decaying.
- **Raft drift**: `x(t) = base(t) + amp·sin(2πt/period + φ)`, `φ ∈ {0, π}` so x(0) = previous x; `base(t)` smooth-steps from the old spot to the new one over 0.9 s. `base ∈ [xmin + amp, xmax − amp]` ⇒ the raft never leaves its range.
- **Gulls**: `x = wrap(x0 + vx·t)` over [−1.5, 17.5], `y = baseY + 0.18·sin(2πt/3 + φ)`, lifted toward 5.2 near the sling.
- **Leaves**: `solveSpeed(angle, raft.baseX ± jitter)` (bisection on speed, analytic flight time) gives the solution arc; 3–5 leaves at random fractions 0.12–0.9 of the flight (±0.12 u across the arc, ≥ 0.9 u apart, y 1.0–6.8, x ≥ 4.4), plus 0–2 bonus leaves 0.95–1.5 u off the arc (mostly above: a flutter or a higher angle gets them). Leaves bob ±0.06 u. At night new leaves are moon leaves (value 2).
- **Day**: `dayT += dt / DAY_LEN`; light = N + (1−N)·smooth(d/0.12) at dawn, 1 by day, 1 − (1−N)·smooth((d−0.55)/0.15) at dusk, N = 0.3 at night. `night` / `dawn` emitted once per crossing of 0.55.
- **Raft, gulls and leaves are pure functions of their clocks**, so `world.predictShot(pull, wait, flutterAt)` replays the future with the same step code (used by the bot and tests).

## 3. Level table (normal; easy/hard via DIFF)

| # | Zone | Raft x range | hw | bull | drift amp / period | gulls | PREVIEW dots |
|---|---|---|---|---|---|---|---|
| 0 | Sunny Cove (`cove`) | 8.0–12.5 | 1.7 | 0.45 | still | 0 | 34 (≈ 2 s: whole flight) |
| 1 | Jungle Isle (`jungle`) | 8.0–13.5 | 1.5 | 0.4 | 0.7 u / 6.5 s | 0 | 24 |
| 2 | Coral Lagoon (`lagoon`) | 8.5–14.0 | 1.3 | 0.35 | 0.85 u / 5.5 s | 1 | 18 |
| 3 | Lantern Bay (`lantern`) | 9.0–14.3 | 1.2 | 0.32 | 0.95 u / 5.2 s | 2 | 13 |

Loops (`loop = floor(level/4)`, capped at 3): hw × (1 − 0.06·loop), amp × (1 + 0.15·loop) (still levels get 0.3·loop u), preview × (1 − 0.08·loop), period × (1 − 0.06·loop), +1 gull on the still islands from loop 2 (and from loop 1 on hard). Example normal L12 (cove, loop 3): hw 1.39, amp 0.9, 1 gull, 26 dots.

## 4. Bot (FIF.Bot)

Think 0.4–0.9 s → for angles 30°–70° (4° steps) solve the speed for the raft position predicted at release + flight time (3 fixed-point iterations), verify each with `predictShot` and score (land +100, bull +8, leaf value ×6, bump −40, small preference for ~48° and the deck centre) → add error (angle σ = (1−s)·25°, power σ = (1−s)·36 %) → ease-out pull over 0.5 s → release. In flight it re-predicts every 0.1 s and flutters when it would come down short and a flutter now lands (skill ≥ 0.3).

Measured (`--stats`, 6 seeds × 300 s, immortal):

| skill | easy | normal | hard | s / level |
|---|---|---|---|---|
| 1 | 98.9 % | 99.1 % | 98.5 % | ≈ 19 |
| 0.85 (title demo) | 91.6 % | 88.1 % | 81.9 % | ≈ 22 |
| 0.6 | 70.1 % | 66.0 % | 63.9 % | ≈ 28 |

Skill 1 collects ≈ 4.2 leaves per shot. 10 simulated minutes (bot + world + weather) run in ≈ 1 s.

## 5. Casual kid model (tests/unit/run.js)

Thinks 1.5–3.5 s, random-ish angle 28°–62°, drags 0.7–1.4 s until the *visible* preview points at where the raft is now (no lead for drift); target error σ 0.9 u, power error 3 % + 10 % × unseen share of the flight, angle σ 3°; shots 1–2 are clumsier (×1.7, ×1.3); random flutter in 25 % of flights.

- Sunny Cove, easy: shot 1 ≈ 64 %, shot 2 ≈ 69 %, **shot 3+ ≈ 78 %** (test asserts 70–85 %).
- Time per level (60 runs × 10 min):

| | Sunny Cove | Jungle Isle | Coral Lagoon | Lantern Bay |
|---|---|---|---|---|
| easy | 44 s (71 %) | 52 s (59 %) | 65 s (48 %) | 88 s (36 %) |
| normal | 45 s (67 %) | 61 s (52 %) | 79 s (40 %) | 106 s (28 %) |
| hard | 53 s (59 %) | 79 s (39 %) | 105 s (28 %) | 147 s (21 %) |

Easy sits in the 45–90 s target band; normal/hard Lantern Bay runs long for a casual player but is meant for older kids (a real child also learns to lead the drifting raft, which the model doesn't).

## 6. Tuning notes

- First draft had lagoon/lantern hw 1.25/1.1 and amp 1.0/1.2: the kid needed 102 s on easy Lantern Bay (30 %) → widened to 1.3/1.2 and calmed the drift to 0.85/0.95.
- Bot error started at 9° / 11 %: skill 0.85 landed 97 % (no challenge in the demo) → 25° / 36 % puts it at 88 % on normal.
- The flutter is strong on purpose (≈ +3 u of reach when used on the way down): a short shot can be saved by one tap.
- `flop` exists so a tiny accidental fling never costs a heart.
- Weather: ambient ≤ 120 (CAP 160 − RESERVE 40 for bursts); counts scale with screen area; night (light < 0.6) fades in stars (layer `sky`) and fireflies with darkness.

## Playtest patch (applied 2026-11-09, see docs/reports/playtest.md)
| Change | Before | After |
|---|---|---|
| flutter | `vy = max(vy,0) + 3.2` | ignored while `vy ≥ 3.2`; else `vy = 3.2` |
| flop | new raft + leaves (free re-roll) | same shot again (`_retryShot`) |
| heart refill | every 20 leaves | easy 12 / normal 20 / hard 25 (`DIFF.heartEvery`) |
| raft x ranges | cove 8–12.5, jungle 8–13.5, lagoon 8.5–14, lantern 9–14.3 | 7.3–13.8, 7.4–14, 7.8–14.3, 8.3–14.5 |
| Easy | hw ×1.15, drift ×0.7, preview ×1.25 | hw ×1.4, drift ×0.5, preview ×1.6 |
| leaf arc | could run through a gull | re-rolled if it passes a gull 0.5–3 s after the shot appears |

Result (4–5-year-old model, Easy): runs 86 → 124 s, stuck on island 1 52.8 % → 16.5 %, time per level 91/109/158/206 → 69/76/104/135 s. Bot skill 1 unchanged; bot 0.85 normal 86 → 91 %.
