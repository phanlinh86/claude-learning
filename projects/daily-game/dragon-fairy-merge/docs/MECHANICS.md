# Mossy's Egg Grove — Mechanics

Code: `game/js/world.js` (MEG.World), `game/js/bot.js` (MEG.Bot), `game/js/weather.js` (MEG.Weather).
Tests: `node tests/unit/run.js` (28 tests, ~5 s). Sim: `node tests/sim/playtest.js [--n=8] [--pace=2] [--kid]` (~30 s).
World values are in units **u**, seconds, y UP; nest floor y = 0, inner walls x = 0 and x = 9 (DESIGN §2).
Egg `rot` / `w` use the world convention (counter-clockwise positive): draw with `rotate(-rot)`.

## 1. One step function

| User | What it runs |
|---|---|
| live eggs | `integrateEgg(e, h, wind)` → contact solver → merges → danger, every 1/120 s sub-step |
| `predictDrop(x[, vx])` (drop guide, bot) | the same `integrateEgg` per sub-step + the same circle-overlap test vs the (static) pile and `touchesNest()`; the current wind force is held constant |

`integrateEgg`: `vy −= G·h`; falling eggs only: `vx += wind·h`; `v *= 1 − AIR·h`; `vy ≥ −VMAX`; `x += v·h`; `rot += w·h`.
Free fall is therefore bit-identical in both (unit test: 1e-12 u); landings match the real drop within 0.25 u on a
real pile, calm and in left/right gusts (unit test, 30 drops). Before first contact a live egg feels only gravity,
drag and wind, so the only possible difference is a pile egg moving while the egg falls.

`update(dt)` accumulates dt (capped at `MAX_DT` 0.25 s) and runs whole 1/120 s steps; `alpha` = leftover / STEP.
At 16× speed the game calls `update(h ≤ 1/60)` many times per frame — same fixed steps, so the result is identical.

## 2. Contact solver (why it is stable)

Position-based dynamics (PBD), per sub-step:

1. Integrate (above). Mass ∝ r² (density 1), inverse mass `im = 1/r²`.
2. **ITERS (8) Gauss–Seidel passes**, each: push every overlapping pair apart along the normal (split by inverse
   mass; the push is summed per contact as λ ≈ normal impulse·h), clamp to the floor/walls (also summed), and
   apply **position-level Coulomb friction**: cancel the contact points' relative tangential slip over this step
   (spin included: a solid disc, I = ½ m r², so a rolling egg takes ⅔ of the correction as spin), with the
   accumulated tangential correction clamped to μ·λ. μ = `MU` 0.4 if either egg rolls, `MU_S` 0.6 between two resting eggs.
3. **Anchors**: a contact that is sticking (friction below its limit) remembers its leftover slip (≤ `ANCHOR_MAX`)
   and corrects it next step. Gauss–Seidel never fully converges in a deep pile; without anchors those leftovers
   add up to a slow creep (measured: 11 of 20 full piles crept > 0.05 u in 5 s); with anchors 0 of 20.
4. **FIX_ITERS (4) normal-only passes**: friction corrections can re-press a small egg wedged between a wall and a
   heavy egg (measured 0.11 u overlap); these passes remove it (worst after settling: < 0.01 u).
5. `v = Δx / h`, `w = Δrot / h`. Landed eggs in contact are capped at `PUSH_VMAX` 6 u/s (a small egg pinched in a
   wedge by a growing merged egg was squeezed out at 12 u/s like a melon seed); free flight keeps `VMAX` 16.
6. Restitution `REST` 0.15 only for impacts faster than `REST_MIN` 1.2 u/s → a little "plonk" bounce (≈ 0.05 u),
   resting contacts never bounce.
7. Damping: rolling egg in contact `CONTACT_DAMP` 0.6/s linear, `ROLL_RES` 1.6/s spin; resting egg `REST_DAMP` 3/s,
   `REST_SPIN` 8/s; in the air `SPIN_DAMP` 0.3/s. **Rest dead-band**: a resting egg slower than `REST_V` 0.08 u/s
   (0.03 px per frame) carries no velocity into the next step — this kills a period-2 stick/slip cycle at a wall
   (0.0006 u amplitude). It is not sleeping: every egg is solved every step, so a push moves it at once.

**Rolling vs resting.** An egg *rolls* (friction spins it) when it is faster than `ROLL_MIN` 0.6 u/s, spins that
fast, or had fewer than 2 supports last step. Eggs are not balls: a slow egg sitting in a groove (≥ 2 supports)
rests instead of rolling — but an egg perched on top of a single round egg always rolls off (with pure static
friction it balanced there, which looked wrong). Unit test: an egg rolling right spins clockwise (`w < 0`) with
`w·r ≈ −vx` (rolling without slipping) and stops within 6 s.

**Broad phase**: sort-and-sweep on x (insertion sort of a nearly sorted list) → O(n) candidate pairs. A full nest
(~20–30 eggs) costs ≈ 15 µs per step; 10 simulated minutes with the bot ≈ 1 s.

**Walls** are infinite planes x = 0 / x = 9 and the floor y = 0, so eggs can never leave the nest (tested on every
sub-step of 3-minute bot games).

## 3. Merges, hatch, combo

- Equal kinds with distance < r1 + r2 + `MERGE_GAP` 0.02 merge (one merge per egg per step; pairs in
  sort order → deterministic). New egg: mass-weighted midpoint (clamped inside the nest for its final radius),
  mass-weighted velocity + `POP_VY` 2 u/s up, spin = mean.
- **No explosions**: the new egg's physics radius starts at `GROW_FROM`·R = 0.75·R (about the old radius) and grows
  to R over `GROW_T` 0.3 s with smoothstep → ≈ 1–1.5 u/s push on neighbours (test: pile eggs stay < 6 u/s while a
  pair merges on top of a full nest). The renderer scales 0.7 → 1 from `born`.
- Two kind-8 eggs → `hatch {x, y, points: 100 + combo bonus}`, both removed.
- Combo: a merge within `COMBO_T` 0.8 s of the previous one → combo + 1, bonus `combo − 1` points; `comboT` =
  seconds left in the window. Hatches count as combo steps too.
- A falling egg that merges on first touch still emits `land` (just before `merge`) so the "plonk" plays.
- `newKind {kind}` the first time a kind is made by merging; `stats.kinds[k]` counts eggs of kind k made (drops + merges).

## 4. Drop, drop pool, danger, rescue

- `drop()` needs `canDrop` (egg held, `DROP_COOLDOWN` **0.8 s** over — playtest R2: 0.55 s let players spam eggs).
- **Blocked drop** (playtest R1): if the spawn point (x, `HOLD_Y`) overlaps a landed egg, `drop()` emits
  **`blocked {x}`** (an event added to the DESIGN §5 list) and returns false; the egg stays held and the vine timer keeps
  running, so rescue / game over still happen. `dropBlocked(x)` lets the bot (and a UI hint) test a spot; the bot
  never picks a blocked spot, and if a drop is refused it thinks again (0.35–0.8 s) instead of retrying every frame.

- Pool weights (DESIGN): Easy 45/35/20, Normal 35/30/22/13, Hard 30/28/20/14/8; only kinds ≤ max(2, maxKind − 1),
  from the world's `pool` RNG fork (deterministic).
- `over += dt` for an egg that is not falling, `age > OVER_AGE` 1 s and whose top is above `DANGER_Y` 9.8, else it
  decays at 2·dt. `danger = max over / OVER_T` (2.5 s); `warnOn` at 0.35, `warnOff` below 0.25.
- `over ≥ 2.5 s` → rescue (Easy 2, Normal 1, Hard 0): the 4 highest eggs leave, all `over` reset; else `gameOver`.
  Test: the order is always warnOn → rescue(s) → warnOn → gameOver, per difficulty.

## 5. Wind

Calm `CALM` 5–9 s (the first calm ≥ `FIRST_CALM` 8 s) → `windWarn {dir}` → warn `WARN_T` 1.5 s → `gust {dir,
strength}` 3–5 s → `calm`. 70 % of gusts reverse direction. Force = dir · strength · smoothstep(t / 0.5) ·
smoothstep((dur − t) / 0.6) → no jumps. Strength = `LEVELS[zone].wind` (2, 3, 4, 5 u/s²) × difficulty (0.6 / 1 /
1.25) × (1 + 0.15·loop). Only eggs with `falling = true` feel it: a 5 u/s² gust over a 10 u drop moves an egg
≈ 2.2 u sideways (test: resting eggs move < 1e-6 u). Hook `setWind(dir, strength, hold)`: dir ±1 = full force now
for `hold` (default 6) s then eases out; dir 0 = calm for `hold` s (default a normal calm).

## 6. Seasons

`levelGoal` = score to leave the season: Normal 150 / 400 / 750, then +500 per winter loop; Easy × 0.75
(115 / 300 / 565), Hard × 1.2 (180 / 480 / 900), rounded to 5 (playtest R3: autumn 800 → 750, autumn felt long). `levelStart` = previous goal. Level up keeps the eggs;
`zone = min(level, 3)`, `loop = max(0, level − 3)`. (DESIGN started at 120 / 320 / 650 / +450: seasons lasted
36–46 s at a human pace, so the goals were raised ≈ 25 %.)

## 7. Bot

Think 0.35–0.8 s, sample 12 + 12·skill x positions, `predictDrop` each, score: on a twin +9 + k, a twin ≤ 1.5 u
away and not above (it will likely roll in) up to +6 + k, kind ± 1 +1.5, landing height −0.7·y, burying a much
smaller egg −1.5 per kind step, top near the vine −25 −. Error: σ = 2.2·(1 − skill) u aim noise + a random spot with
probability 0.6·(1 − skill). `pace` (s) = least time between drops (the sims use 2 s ≈ a human).
Suika-style games are forgiving to random play (random drops merge a lot), so the skill gap is modest — which is
good for kids.

## 8. Sim results (`node tests/sim/playtest.js --n=8 --kid`, pace 2 s/drop; after playtest fixes R1–R3)

| diff | skill | drops | score | season reached (S/Su/A/W) | s per season: spring / summer / autumn | game length s | 1st warn @drop |
|---|---|---|---|---|---|---|---|
| easy | 1 | 219 | 1835 | 8/8/8/8 of 8 | 46 / 42 / 63 | 445 | 168 |
| easy | 0.8 | 195 | 1590 | 8/8/8/8 of 8 | 45 / 45 / 67 | 398 | 147 |
| easy | 0.5 | 164 | 1280 | 8/8/8/8 of 8 | 51 / 46 / 66 | 336 | 115 |
| normal | 1 | 120 | 1009 | 8/8/8/8 of 8 | 49 / 53 / 76 | 246 | 114 |
| normal | 0.8 | 146 | 1358 | 8/8/8/8 of 8 | 57 / 52 / 72 | 298 | 114 |
| normal | 0.5 | 109 | 888 | 8/8/8/4 of 8 | 64 / 52 / 74 | 224 | 95 |
| hard | 1 | 83 | 755 | 8/8/8/2 of 8 | 56 / 59 / 63 | 170 | 82 |
| hard | 0.8 | 81 | 703 | 8/8/7/1 of 8 | 64 / 64 / 63 | 167 | 82 |
| hard | 0.5 | 77 | 608 | 8/8/5/1 of 8 | 66 / 59 / 56 | 158 | 72 |

Kid check (Easy, skill 0.15 ≈ random drops, 16 games): drops before the first vine warning min **84**, median 130
(target ≥ 40); total drops per game median 161, min 129.

Pace sensitivity (Normal, 6 games, measured before R1–R3): bot's own tempo (≈ 1.6 s/drop) seasons 46 / 46 / 58 s; 1.5 s/drop 41–48 / 40–48
/ 51–70 s; 2.5 s/drop 65–78 / 62–70 / 96–100 s. So a human dropping every 1.5–2.5 s gets ≈ 40–100 s seasons, a
good Normal player reaches winter (8/8 at skill 0.8–1), a casual one about half the time; Hard mostly stops in autumn. No egg left the
nest or went NaN in any sim game (`bad` column = 0).

Targets: Easy spring very forgiving ✔ (≥ 69 random drops before any warning); seasons 45–90 s at 2 s/drop ✔;
a good player reaches winter on Normal ✔ (casual 4/8, good 8/8).

## 9. Weather (screen px, `MEG.Weather`)

≤ 160 particles, ambient ≤ 120 (scaled by screen area 0.6–1.6×), bursts dropped when full; on a season change
the old ambient fades over 1.2 s while the new fades in (fading ones give way first). Ambient drift eases
(2.5/s) toward `force × 22 px × k` × per-kind response (near snow / petals 1–1.1, mid snow 0.75, far snow 0.45,
fireflies 0.35). During gusts (|force| > 0.6 u/s²) `streak` sprites cross the screen in the wind direction
(`flipX` = blowing left), ≈ 0.6 + 0.9·|force| per second, ≤ 10 alive. Petals and leaves are pendulums
(x = x0 + A·sin φ, fall speed × (0.55 + 0.7·|cos φ|): slow at the ends of a swing, fast through the middle;
petals rock, leaves also spin); snow in 3 layers (`sky` / `back` / `front`: size 5–7 / 8–11 / 13–18 px, fall 14–22 /
26–38 / 44–62 px/s, × k = min(W, H)/540). Particle `name` = file in `assets/default/particles/`, `sprite` = `'p_' + name`.
