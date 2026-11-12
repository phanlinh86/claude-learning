# Biscuit's Kitchen Flight — mechanics

How the simulation in `game/js/world.js`, `weather.js` and `bot.js` moves, the numbers we use, and why.
The contract (field names, events) is in `DESIGN.md` §5; this file explains the motion behind it.
Tests: `node tests/unit/run.js` (27 tests, about 9 s). Add `--stats` for a bot difficulty sweep.

## 1. Time step
- `update(dt)` adds dt to an accumulator and runs fixed sub-steps of **1/120 s** (at most 0.25 s per call, so a
  background tab doesn't fast-forward). A run depends only on seed + difficulty + *which sub-step* each `flap()`
  happened in. The tests show 30, 60 and 120 Hz frames give byte-identical runs.
- Every step first stores `prevX/prevY/prevRot` (Biscuit, leaves), `prevX` (obstacles) and `prevAng` (hangers).
  `w.alpha = leftover/step` ∈ [0,1): the renderer draws `prev + (cur − prev)·alpha`.
- 10 minutes of world take ≈0.5 s in node; with the bot ≈1.4 s.

## 2. Biscuit's flight: a soft helicopter hop
| | Easy | Normal | Hard |
|---|---|---|---|
| gravity (px/s²) | 1250 | 1300 | 1350 |
| tap sets vy to (px/s) | −420 | −430 | −440 |
| rise per tap = v²/2g | 70.6 px | 71.1 px | 71.7 px |
| time to the top = v/g | 0.34 s | 0.33 s | 0.33 s |
| terminal fall | 520 | 560 | 600 |

- A tap **sets** vy (not adds), so every tap feels the same whatever Biscuit was doing: the most important
  rule for a one-button game. Gravity is lower than Flappy Bird's and the fall speed is capped, so the arc is
  floaty and readable: a hop ≈ 1¼ body heights.
- `flapCooldown` 0.05 s swallows the double event (touch + click) that one tap can produce.
- Ceiling (the top of the hit circle at y 24) only clamps and zeroes upward speed. It never hurts.
- **Tilt** (`rot`, positive = nose down): for 0.14 s after a tap the target is −0.36 rad; then the target follows
  `vy/520 · 0.45`. It moves to that target quickly when the nose goes up (rate 14/s) and slowly when it goes down
  (3.2/s), and is clamped to ±0.45 rad (≈26°). He never nose-dives.
- **Propeller** `prop` is a continuous phase (frame = `floor(prop·3) % 3`). It spins at 4.5 cycles/s while gliding and
  9 cycles/s for 0.3 s after a tap (eased at 10/s). 9 cycles/s = 27 frame changes/s, below 30, so at 60 fps no frame
  is skipped and the spin can't seem to run backwards.
- **Squash**: a damped spring (3.2 Hz, damping 0.45). A tap kicks its velocity, so `squash` dips to ≈0.88, overshoots to ≈1.02
  and settles in about 0.3 s. Draw `scaleY = squash`, `scaleX ≈ 1 + (1 − squash)·0.8` around the body centre.
- **Ready**: hovers at y 250 with an 8 px, 0.8 Hz bob. The background drifts at 60 px/s, there are no obstacles and the
  clocks don't run. The first tap emits `start` and then `flap`. Scroll speed then eases up from 60 to the level speed (rate 1.2/s).

## 3. Bumps, batteries and powering down
- Hit shapes: Biscuit is a circle r = 28 − `hitForgive` (Easy 4, Normal 2, Hard 0). The other shapes are from DESIGN.md §4:
  hanger head circle r 42, handle segment hook→head r 8, **chain segment rail→hook r 5** (added: otherwise he
  could fly through the chain), stack pieces as inset rects, the kettle as an inset rect, and the counter at y 470.
- A bump costs **exactly one battery**. It then:
  - Bounces vy away from what he hit: −230 off the top of something, +170 off the underside of a hanger. For a
    side hit, it's down for hangers and up for stacks and kettles.
  - Knocks him back: a spring on `pup.x` (1.8 Hz, damping 0.9) kicked backwards. The peak is ≈10–20 px and he eases
    back to PUP_X within ≈0.8 s. So `pup.x` is no longer a constant, and `pup.prevX` exists.
  - Swings the hanger (angular kick 0.7 rad/s), squashes Biscuit, and sets `hurtT = 1.5` (`state 'hurt'`).
    Obstacle collisions are ignored while hurtT > 0. If he is still overlapping something when the blink would end,
    it is held at 0.02 s until he is clear, so one touch can never cost two batteries.
- **Counter**: Biscuit is clamped to the counter top and vy = −380 (rises ≈55 px). It costs a battery and blink
  unless he is already blinking; while blinking he just bounces (`counter {cost:false}`).
- Leaves: +1 each. Every 15th leaf gives a battery back if he has fewer than 3 (`battery {n}`). `lowBattery` fires
  when he drops to 1.
- **Down**: at 0 batteries, `down` fires. The propeller spin decays (2.2/s), he makes a tiny −140 hop, and then falls with
  parachute drag (gravity 520, terminal 250 px/s), rocking ±0.18 rad. That's ≈1–2 s from mid-air. He lands on the
  counter, or on a stack or kettle top if he floats down onto one. The kitchen slows to a stop (rate 3/s). After 0.6 s
  of rest: `over` + `gameOver {score}`.

## 4. Obstacles
- **Hanging utensils** are rigid pendulums pivoting on the rail at (x, 40). `ang` > 0 swings the head to the
  right. Hook = pivot + len·(sin, cos); head = pivot + (len + 144)·(sin, cos). `w.hangHook(o)` and `w.hangHead(o)` give both.
  Draw the chain pivot→hook and the sprite rotated by `ang` around its hook (60,6).
  - The equation: θ'' = −(g/L)·sinθ − 0.35·θ' + drive·sin(ω₀t + φ) − windSwing·gust, where L = len + 90 (the mass
    centre is 90 px below the hook) and g = 800 px/s². The period is 2π√(L/g) ≈ 2.1–2.9 s, a lazy kitchen sway.
  - A tiny draught at the natural frequency (0.075 rad/s²) keeps a steady sway of about ±0.07 rad. Gusts push the head sideways,
    and a bump swings it. Hard clamp ±0.25 rad.
- **Stacks**: 1–3 pieces from a list (wider pieces at the bottom). Upper pieces are offset ±6 px (`dx`). `o.top` = y of
  the top, `o.height`.
- **Kettles** (zone ≥ 1): the steam column is x ∈ kettle.x ± 40 (+14 forgiveness), from y 350 up to 350 − `steamH` (240–290).
  Lift = −1700·(1 − h/H) px/s², where h = height above the spout line. That beats gravity up to ≈70 px above the spout, so
  Biscuit hovers there. Inside, vy is also damped (1.8/s), so it feels like a soft cushion. Steam never hurts (the kettle body
  still does). `steam {x}` fires once per entry. `o.puffs` increments every 0.22 s: when it changes, the renderer calls
  `weather.steam(o.x, 350)`.

## 5. Generation: beats on a safe path
- Beats are generated one beat ahead, offscreen, once the previous beat has moved left of SPAWN_X (1240). Each beat is placed
  `beatGap × U(0.92, 1.12)` after the previous one (Easy 380, Normal 340, Hard 300 px).
- **First 3 s are empty**: the first beat is placed at `1100 + 80 + speed·3`, so nothing is visible (even on a 2.2:1
  phone, where the frame shows up to x ≈ 1074) during the first 3 s. The first beat is always a single low piece (≤ 90 px).
  A friendly arc of 3 leaves at hover height comes first.
- After every level change there is 1.2 s of extra space (room for the banner).
- Types and weights (Normal): hanger 0.32, stack 0.38, gate 0.30 (+0.05 per round), kettle 0.20 (only from zone 1).
- **gapMin is a clearance, and it is always honoured** (Easy 230, Normal 200, Hard 175):
  - Lone hanger: counter − head bottom ≥ gapMin. A len-0 head already reaches y 226, so lone chains are short on Easy (≤ 14 px).
  - Lone stack: top − ceiling ≥ gapMin.
  - **Gate** (hanger + stack): with these sprite sizes, a hanger directly over a stack can never leave even 175 px
    (the shortest hanger reaches 226 and the lowest stack top is 400). So a gate is **staggered**: the second piece is
    moved along x until the straight-line clearance between the head circle and the stack's pieces is ≥ gapMin (+9 px
    swing pad). That gives a diagonal opening: dip under the hanger, then hop over the stack (or the reverse).
    Each piece also keeps the lone-piece rule.
- **Leaves** (3–5 per group, 46 px apart; group chance Easy 0.8, Normal 0.65, Hard 0.55):
  - an arc through the opening (it sags under hangers and humps over stacks; above a kettle it sits in the steam),
  - a line along a gate's diagonal, or
  - a line joining the previous obstacle's safe point to this one.
  Every leaf must clear every obstacle shape by its radius + 12 px + the bob (+18 px around swinging heads), stay in
  y 70–430, and spawn offscreen. Otherwise it is dropped. Leaves bob ±6 px at 0.55 Hz and spin at 0.4–0.9 rad/s. They
  drift with half of the wind, damped at 1.6/s, so they settle after a gust.

## 6. Levels, wind, light
- `levelLen` 60 s. After each level: `levelUp {level, zone, clean, score}`, and +5 if there were no bumps in that level.
  Speed = base · (1 + 0.025·zone) · (1 + 0.08·min(loop, 4)). On Easy that is 150 → 161 px/s through the day, and +8 % on day 2.
- **Gusts (zone 2 only)**: the first comes 4–6 s into the level, then one every 6–9 s (start to start). `gustWarn {dir}` comes 1.0 s
  before `gust {dir}` (`dir` = `'up'|'down'`). The push is ±gustAccel (Easy 150, Normal 200, Hard 230 px/s², only 12–17 % of
  gravity) for 2.5 s, eased in and out over 0.5 s with smoothstep. Then `gustEnd`. No gust starts if it would run past the
  level end. `wind.gy` acts on Biscuit, and half of it on the leaves. Extra fields: `wind.k` (0..1, eased strength, use it
  for curtain sway and streak alpha), `wind.phase` (`'calm'|'warn'|'gust'`), `wind.gustT`, `wind.nextT`. `wind.dir` is `''`
  when calm.
- **Day–night**: `dayT = (zone + levelT/levelLen)/4`. `darkness` = smoothstep between keys (dayT → value): 0 → 0,
  0.18 → 0, 0.375 → 0.08 (rain), 0.5 → 0.12, 0.625 → 0.25 (sunset), 0.72 → 0.45, 0.8 → 0.62, 0.96 → 0.62, 1 → 0. Night is dark
  from 12 s to 50 s into the snowy level, then ≈10 s of dawn leads into the next morning. There is no jump when the loop wraps.
- **Lamp**: `lamp = {x, y, r}`, 64 px ahead along the nose angle. r = 215 / 180 / 160 (Easy / Normal / Hard).

## 7. Weather particles (`BKF.Weather`)
- Each particle is `{sprite, x, y, size (drawn width px), rot, flipX, alpha, layer}` and also has private fields.
  Particles wrap in x ∈ [−160, 1120] so wide letterboxes are covered. Scroll parallax: outside 0.08, room 0.35, front 1.1.
- Sunny: 40 room dust motes wandering and twinkling, plus 3 big faint front motes. Rainy: 84 slanted streaks outside
  (520–860 px/s, rot = slant). Windy: 18 tumbling `outside_leaf` (flipX = cos phase, faster in gusts) and, during gusts,
  `wind` streaks in the room (10/s · strength). Snowy: 3 depth layers outside (42 far/small/slow/faint, 26 mid,
  12 near).
- `setLevel` fades the old ambient particles out over 1 s and fills the new ones over ≈1.5 s. `{instant:true}` fills at once.
- `steam(x,y)`: a puff that rises (≈−35 px/s settling), grows 30–42 px/s and fades over 1.1–1.5 s.
  `burst('sparkle'|'bit'|'dust', x, y, n)` makes radial, dragged particles (bits fall with gravity) that fade in 0.45–0.95 s.
  All are in the front layer.
- A hard cap of **260** is enforced at insertion (new particles are refused). The 10-minute stress test peaks at ≤ 260.

## 8. Bot (`BKF.Bot`)
- It thinks 20 times a second. Each time it simulates ≈1.2 s ahead for "tap now" and "wait", each followed by "tap
  whenever below yT" for six target heights. It uses the world's own gravity, flapVy, wind and steam, plus the current hit
  shapes shifted by the scroll. The ballistic steps are exact, plus the world's Euler bias, so 1/20 s steps are accurate.
- The cost of a plan: touching anything = 1000·(2 − t/T) (sooner is worse; the depth of the touch breaks ties). Being inside an
  8 px safety margin costs a soft penalty. A leaf is worth −30, and there is a slight preference for mid-room. It taps when the
  best tap plan beats the best wait plan.
- `skill < 1` adds perception noise (12·k px), a reaction delay that the planner knows about (k·0.04–0.16 s) and lapses
  (k·0.15 per second, lasting k·0.25–0.7 s).
- Sweep (`--stats`, 10 seeds, 600 s cap; median survival):

  | | 0.3 | 0.5 | 0.7 | 0.85 | 1 |
  |---|---|---|---|---|---|
  | Easy | 143 s | 600 s | 600 s | 600 s | 600 s |
  | Normal | 33 s | 183 s | 461 s | 158 s | 600 s |
  | Hard | 61 s | 78 s | 135 s | 121 s | 600 s |

  Skill 1 survives 10 minutes on every difficulty (the test checks Normal). Easy is very forgiving. At about one leaf
  per second, a battery comes back about every 15 s. That is on purpose for a young child. To make Normal/Hard stricter,
  lower `leafGroupChance` or raise `leavesPerBattery`.

## 9. Extra API (beyond the contract)
`w.zoneName`, `w.hangHook(o)`, `w.steamAt(x, y)`, `w.spawn(kind, opts)` / `w.addLeaf(x, y, sprite)` / `noSpawn` (test hooks),
`World.darknessAt(dayT)`, `BKF.GEOM` (sprite geometry), `pup.prevX`, `pup.propRate`, `pup.knock`, `o.puffs` (kettle),
`o.halfW`, `o.top`/`o.height` (stack), `o.gate`, the `wind.*` extras above, event extras (`bump.kind/part/id`,
`counter.cost`, `levelUp.score`, `levelUp.skip` from gotoLevel), and `hitShapes()` entries carry a `tag`
(`pup|leaf|head|handle|chain|stack|kettle|steam`).
