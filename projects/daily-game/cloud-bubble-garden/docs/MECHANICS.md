# Nimbus's Bubble Garden: mechanics notes

Code: `game/js/world.js` (NB.World + CONFIG), `game/js/weather.js` (NB.Weather), `game/js/bot.js` (NB.Bot).
Tests: `node tests/unit/run.js` (24 tests, no deps, ≈1 s). Contract: `docs/DESIGN.md` §2, §5.

Units: lengths and speeds in CONFIG are **unit multiples** (unit = 100 px at 960×540) and are multiplied by `layout.unit` when used, so
the garden plays the same on an iPhone in portrait and on a desktop. y points down. Time in seconds.

## 1. CONFIG (the values that matter)

| Key | Value | Unit | Why |
|---|---|---|---|
| `step` | 1/120 | s | fixed sub-step. At full speed Nimbus moves 5 px per step, much less than a bubble radius, so pops never tunnel |
| `maxFrame` | 0.25 | s | a hidden tab doesn't fast-forward minutes |
| `heroR` | 0.34 | u | hit radius at size 1. The sprite is drawn 1.25× bigger, so a near-miss still looks like a touch |
| `growK` | 0.25 | × | `r = heroR·(1 + growK·(size−1))`: 0.34 → 0.68 u. At size 5 she is twice as wide, a clearly bigger target |
| `gemsPerSize` | 4 | gems | REQUIREMENT. Size 1 → 5 takes 16 gems, and 4 more start the shower (20 gems per cycle) |
| `heroOmega` | 7.0 | rad/s | spring stiffness at size 1, ÷(1 + 0.15·(size−1)) → 4.4 at size 5. 90 % of a 3 u trip takes ≈0.55 s (size 1) and ≈0.9 s (size 5) |
| `heroZeta` | 0.75 | – | damping ratio: ≈3 % overshoot, a soft cloud-like settle instead of a robotic stop |
| `heroMax` | 6.0 | u/s | speed cap: crossing a landscape screen takes ≈1.8 s, slow enough for a toddler's eye to follow |
| `keySpeed` / `keyLead` | 5.0 / 0.8 | u/s / u | the keyboard moves the target from Nimbus's position, and the target never runs more than 0.8 u ahead (no long glide after release) |
| `touchLift` | 0.7 | u | used by main.js: the touch target sits above the finger |
| `bobAmp` / `bobHz` | 0.04 / 0.6 | u / Hz | idle bob, folded into the spring target and fading out above 1 u/s |
| `tiltMax` / `tiltRate` | 0.25 / 8 | rad / 1/s | she leans into her motion |
| `rRate` | 9 | 1/s | r eases to the new size: 95 % in ≈0.33 s (a soft puff-up) |
| `squashDecay` | 6 | 1/s | squash kick: pop 0.45, grow/hit/shower 1 |
| `knockSpeed` / `knockT` / `knockSpring` | 3.0 / 0.35 / 0.25 | u/s / s / × | bump impulse. The spring runs at 25 % for 0.35 s so the knock-back is visible (≈0.4–0.6 u of travel) |
| `invuln` | 1.5 | s | blinking safety after a bump |
| `g` | 9.8 | u/s² | "real" gravity if 1 u = 1 m. A burr falls branch → lawn in ≈0.8 s (landscape) and lands at ≈8 u/s |
| `burrDrag` / `burrWind` | 0.15 / 0.5 | 1/s / × | heavy burrs: a little air drag, and they drift with only half the wind |
| `burrSpin` | 2–4.5 | rad/s | spin while falling (random sign) |
| `burrRest` | 0.26 | u | burr centre above `groundY` when it touches the lawn (the spike tips touch the lawn line) |
| `bounce` | 0.35 | × | the one soft bounce: `vy = −0.35·vy` → a hop of ≈0.35 u |
| `rollSpeed` / `rollDecay` / `rollLife` | 1.5 / 0.9 / 1.2 | u/s / 1/s / s | it rolls away from Nimbus (rot += vx/r: no slipping), slows down, and fades out over the last 0.4 s |
| `burrR` | 0.24 | u | hit radius (Easy ×0.85). The solid body is 0.19 u and the spikes reach 0.32 u, so a spike graze doesn't count |
| `burrClear` | easy 1.3, normal 0.5, hard 0 | u | a new burr never dangles this close to Nimbus's x |
| `burrBreather` / `burrFirst` | 3.5 / 0.6 | s / × | the first burr of a level comes after max(3.5 s, 0.6 × interval) |
| `bubbleR` | 0.30–0.42 | u | `r = 0.30 + 0.12·√rand`, so small ones are rarer… |
| `smallFast` / `riseVar` | 0.25 / ±0.1 | × | …and up to 25 % faster. Each bubble also gets ±10 % on its own terminal speed |
| `buoyRate` | 1.6 | 1/s | the rise speed relaxes toward terminal (buoyancy vs drag): 80 % in 1 s, so it is born slowly and speeds up |
| `wobAmp` / `wobHz` | 0.25 / 0.5–0.9 | u / Hz | sideways wobble |
| `windShare` / `sideRate` | 0.8 / 3 | × / 1/s | bubbles drift with 80 % of the wind; sideways velocity follows wobble + wind with a light lag |
| `pushK` | 40 | 1/s² | overlapping bubbles slide apart (accel = pushK·overlap, mostly sideways), never pop each other |
| `maxBubbles` / `maxBurrs` | 14 / 3 | – | alive at once |
| `showerTime` / `showerPop` | 2.5 / 0.08 | s | shower length; one bubble pops every 0.08 s, nearest to Nimbus first (the rain spreads out from her) |
| `comboWindow` | 1.2 | s | pop streak window (callouts at 3, 5, 8, 12, 20, 30, 40, …) |
| `popK` | 0.85 | × | pop when `dist < hero.r + b.r·0.85·difficulty.popK` |
| `goal` | easy 48, normal 48, hard 52 (+2/loop) | gems | ≈2 showers per level, 60–80 s for a casual player (see §3) |
| `loopRise` / `loopBurr` / `loopCap` | 0.08 / 0.10 / 4 | ×/loop | after Night, each round has bubbles 8 % faster and burrs 10 % more often (up to loop 4) |
| `windEvery` / `windRate` | 4–8 / 0.5 | s / 1/s | a new wind target every 4–8 s, and `wind.x` eases toward it |

**Per difficulty** (multipliers on the zone values):

| | hearts | rise | spawn | burrEvery | hangTime (s) | burrR | popK |
|---|---|---|---|---|---|---|---|
| easy | 5 | 0.75 | 1.05 | 1.5 | 1.6 | 0.85 | 1.25 |
| normal | 3 | 1.0 | 1.0 | 1.0 | 1.1 | 1.0 | 1.0 |
| hard | 3 | 1.2 | 0.95 | 0.72 | 0.85 | 1.0 | 0.95 |

**Per zone:** rise in u/s, spawn in bubbles/s, burrEvery in s, windMax in u/s.

| zone | rise | spawn | burrEvery | windMax | Easy result | Hard result |
|---|---|---|---|---|---|---|
| 0 dawn | 0.85 | 0.80 | 6.0 | 0.1 | 0.64 u/s, 0.84/s, a burr every **9 s** | 1.02 u/s, burr every 4.3 s |
| 1 noon | 0.95 | 0.82 | 5.0 | 0.35 | 0.71 u/s, 7.5 s | |
| 2 sunset | 1.05 | 0.84 | 4.2 | 0.6 | 0.79 u/s, 6.3 s | |
| 3 night | 1.12 | 0.86 | 3.5 | 0.3 | 0.84 u/s, 5.3 s | 1.34 u/s, a burr every **2.5 s** |

On Dawn Easy a bubble takes ≈7–8 s to cross a landscape screen, and 5–7 are on screen at once.

## 2. Motion model

- **Nimbus:** a critically-ish damped 2D spring toward the target, `a = ω²(t − p) − 2ζωv`, then a speed cap. Because ω drops as she grows,
  a big Nimbus is floatier and harder to steer around burrs, which is the risk side of the size twist. The idle bob is added to the
  spring *target*, not to the position, so it never fights the spring. The box `x ∈ [r, w−r]`, `y ∈ [minY+r, maxY−r]` is applied to
  both the target and the position every step, so she stays inside even while r eases to a bigger size.
- **Bubbles:** buoyancy/drag relaxation of vy toward their own terminal rise, plus a sideways velocity that follows
  `wobAmp·2πf·cos(wob) + 0.8·wind`. They wobble ±0.25 u and lean downwind. Soft walls at the screen edges. When `y < −r` the bubble
  escapes (combo resets, no penalty).
- **Burrs:** `hang` (rot 0; the renderer swings from `t`) → `fall`: gravity + light drag, a drift toward half the wind, spin →
  at `groundY − 0.26 u` one bounce (`land` event) and straight into `roll`. It is harmless from then on (fair for kids) while it finishes
  its little hop under gravity, rolls without slipping, slows, and fades out → `gone` → removed.
- **Bump:** only `fall` && `!hit`, and only when there is no invuln and no shower. The knock-back direction is away from the burr,
  with at least a bit of downward push. The burr bounces off (`vy = −0.3|vy|`, sideways) and becomes harmless.
- **Shower:** invulnerable, no new burrs, hanging burrs are washed off (`state 'gone'`, `washed: true`, `fade` 1 → 0 over 0.6 s while they
  slide down). Bubbles keep spawning and the rain keeps popping them.
- **setLayout:** x scales with the width, y maps linearly from the old `[topY, groundY]` to the new one, and sizes/speeds scale with the
  unit. Then everything is clamped (hanging burrs snap to the new branch line, ground burrs to the new lawn) and the `prev*` fields are
  reset so the interpolation doesn't smear.

## 3. Pacing (measured with NB.Bot, 6 seeds × 10 simulated minutes each, 960×540; portrait 560×1000 in brackets)

| difficulty | skill | s per level (avg) | first level (Dawn) | hits / min | games over in 10 min |
|---|---|---|---|---|---|
| easy | 0.5 | **61** (58) | 58–64 s | 0.48 (0.05) | 0/6 |
| easy | 0.9 | 57 (57) | 55–60 s | 0.02 | 0/6 |
| normal | 0.5 | **67** (62) | 60–70 s | 0.33 (0.03) | 0/6 |
| normal | 0.9 | 61 (60) | 57–63 s | 0.02 | 0/6 |
| hard | 0.5 | **78** (72) | 69–84 s | 0.91 (0.10) | 4/6 (mean 7.2 min) |
| hard | 0.9 | 71 (68) | 68–74 s | 0.12 | 0/6 |

- Level time depends mostly on the spawn rate × goal: slow bubbles are easy to catch, so even a casual bot pops ≈95 % of them. Skill
  shows up in the **score** (staying big means more points per gem, and a bump shrinks her) and in survival on Hard. A weaker bot
  (skill 0.3) pops ≈75 % of the bubbles and gets bumped now and then.
- In portrait the play area is taller, so burrs fall longer and are easier to dodge (fewer hits).
- 10 simulated minutes (Normal, skill 0.9, with weather and bursts): ≈150 ms, level 9, ≈24 500 points, 21 showers, max 172 particles.

**Bot model** (`bot.js`): it checks burrs every frame. A falling burr is "seen" after `(1−skill)·0.35 s`, and skill ≥ 0.6 also watches
burrs within `1.2·skill` s of dropping. It predicts their gravity arcs for 0.8 s and steps sideways (gap `r + burr.r + 0.7 u`) when one
will cross Nimbus, holding the dodge until the burr is below her. Every ≈0.17 s it picks a bubble by its intercept time (it solves where
the bubble will be when Nimbus gets there; a casual player plans with a slower speed). Bubbles that leave the box first or sit under a
burr are skipped. The score is `(1 + 0.5·neighbours)/(T + 0.25)` with a little stickiness. It aims with noise `N(0, (1−skill)·0.5 u)`,
and with chance `0.9·(1−skill)²` per decision it looks away for 0.4–1.2 s. `bot.stats {decisions, targets, dodges, lapses}`.

## 4. Weather (`weather.js`)

- **Rain** = `streak` particles with a depth `d`. Far drops (d 0.45–1) are shorter, slower (7–9.5 u/s × d), fainter, and land higher (up
  to 1.6 u above the lawn, "further back"). About 12 % are front drops (d > 1, alpha ≤ 0.35). The slant follows the wind
  (`vx = 2.2·wind·d`), and `rot = −atan2(vx, vy)` (canvas rotation) lines the streak up with its motion. Near drops landing make a
  `splash` (≤ 10 alive). `ambient.rain` crossfades to the zone's strength (0.35 / 0.25 / 0.4 / 0.45) over ≈2 s, and lighter rain fades
  the far drops first.
- **Zones:** dawn has 8 `mist` wisps hugging the lawn. Noon has 12 `sparkle`s floating up and twinkling. Sunset has 9 `leaf`s: 70 % do a
  pendulum glide (they swing side to side, fall fastest through the bottom of each arc, and tilt with the swing) and 30 % tumble fast.
  Night has 10 `glow` worms wandering near the grass and 20 `star`s at y < 0.35·h. Counts scale with √area (×0.85…1.4).
- **Shower:** `setShower(true, x, y)` adds 60 heavy streaks falling from a band ±1.3 u around (x, y). You can call it every frame as she
  moves. `setShower(false)` lets them fade.
- Hard cap: 179 particles (10 reserved for splashes). Bursts never take the ambient set's room.

## 5. Notes for the renderer / deviations from DESIGN.md

All DESIGN field, method and event names are used as written. Extras (optional):
- `hero.gemsInSize` (int 0..4), `hero.bob` (px, already included in `y`); `bubble.rise` (px/s), `bubble.freq` (Hz);
  `burr.fade` (alpha 1 → 0 while rolling out or washed), `burr.washed`; `world.alpha`, `world.acc`; `world.rFor(size)`,
  `world.riseSpeed()`, `world.burrInterval()`; `getState().counts`.
- Popped/escaped bubbles are removed from `bubbles[]` at the end of the step (the events carry the object). `'gone'` burrs stay in
  the array while `fade > 0`, so draw them with `alpha = burr.fade`.
- A burr touches the lawn at `groundY − 0.26 u` (its sprite's spike tips), not at `groundY − r` (the hit radius would sink the sprite).
  After the bounce it goes straight into `roll` and is harmless during the hop.
- `burrClear` (no spawn above Nimbus) also applies a 0.5 u margin on Normal (DESIGN says Easy only).
- Weather particles have `aspect` (w/h: streak 1/6, mist 2, others 1), and `size` is the long side. `setShower(on, x, y)` takes an
  optional position. `update(dt, wind)` takes the wind as px/s (a number or `{x}`).

## 9. Changes after the playtest (2026-11-06)
The numbers in the tables above were measured before these changes; see `docs/reports/playtest.md` for the before/after sims.
- Easy: `rise 0.75 → 0.6`, `spawn 1.05 → 1.1`, `burrEvery 1.5 → 1.8`, `burrR 0.85 → 0.75`, `popK 1.25 → 1.45`; `goal.easy 48 → 40`. Dawn Easy now: bubbles rise at ≈0.51 u/s, 0.88 per second, a burr every 10.8 s. The kid model's first level: 111 s → 79 s median; 10-minute game-over rate 25 % → 3 %.
- Normal: `burrEvery 1.0 → 1.15` (casual adult 10-min game over 88 % → 68 %).
- New `burrRefW: 9.6`: `burrInterval × max(1, 9.6 / field width in units)` — a 6-unit-wide portrait field had 1.6× the burrs per column (kid portrait game over 73 % → 0 %).
- New `boxK: 1.15` and layout insets (`computeLayout(w, h, {top, left, right})`): Nimbus keeps `r·1.15` from the sides and the top, and the play area starts under the HUD / clear of the notch.
