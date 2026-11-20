# Pip's Reef Tower — Mechanics (`RT.CONFIG`, layout, motion, events, playtest tuning)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.5.
Everything not listed here works as in `../koala-candy-cake/docs/MECHANICS.md` (Koko's tuned numbers were kept unless named).
Tests: `node tests/unit/run.js` (45 tests, ≈ 75 s, of which ≈ 60 s is the 1 000-session "never falls" test;
`node tests/unit/run.js <name part>` runs a subset). Sims (report-only, `tests/sim/`): `node tests/sim/hs_playtest.js [--n 20]
[--ages 3,4] [--models typical,dragger,…] [--jobs 4] [--config '{…}'] [--tag x]` (1 480 sessions at n = 20 ≈ 90 s on 4 cores →
`tests/sim/out/hs_<tag>.md`), `node tests/sim/determinism.js`, `node tests/sim/content_stats.js [chapters]`,
`node tests/sim/layout_check.js`, `node tests/sim/hs_pt2.js` (voice-queue / release model), `node tests/sim/hs_designer.js` +
`hd_analyze.js`, `node tests/sim/hs_browser.js` (the real page, needs the lead's build). JSON reports are git-ignored.

## 0. What changed versus Koko (API summary for render / main)
| Koko | Pip | note |
|---|---|---|
| `LW = round(1.3·S)`, `LH = round(0.78·S)` | **`LW = round(1.12·S)`, `LH = round(0.80·S)`** (age 4: 139 × 99, 5+: 123 × 88) | `layerW / layerH`; `baseW = LW + 60` (199) |
| tap on a layer = hop home + name (`tapPiece` → `'tap'`) | **TAP TO SEND**: `pointerUp` → `'drop'`; events `tapPiece {…, right, send: true, assist: false}` then `drop {pieceId, x, y, right, via: 'tap'}` | main: say the name on `tapPiece`, treat `drop` as before. `'tap'` is only returned for a tap outside an open ask |
| drop: gravity 2600, ballistic toss for assists | **water**: piece state **`'lift'`** (bubble, `piece.bubble` 0..1) → event **`bubblePop`** → `'fall'` = sinking (gWater 900, terminal 420 px/s, leaf rocking) | every assisted stack (tower tap, grace) and a release below the top also use the bubble lift |
| — | event **`trail {pieceId, x, y (bottom centre)}`** every 0.09 s while lifting / sinking | render: spawn 1–2 little bubbles |
| `land {…}` | `land {…, sand: true}` | render: sand puff at (x, y) |
| jelly landing sy 0.75, ζ 0.25 | soft plonk **sy 0.82, ζ 0.35** (ω 18), block below 0.06 | |
| sway k 26, c 3.2 | **k 14, c 1.9** (0.6 Hz, ζ 0.25: slower, watery); caps unchanged (0.12 / swayRoom 0.1) | breeze torque 0.33 → 0.18 (same ≈ 0.016 rad) |
| deal: layers drop from above the screen | blocks **drift down 300 px** into their slots (0.75 s, fade in, rock ± 0.14 rad, ± 10 px sway, soft settle 0.07) | |
| cloud + cherry, `cloudPose()` | jellyfish + starfish crown: **`cloudPose()` = jellyfish pose** (alias `jellyPose()`), gains `pulse`; `goal.pulse` 0..1 (0.9 Hz), `goal.swimY` | anchor = bell top (100, 30) of `jelly_ride.svg` |
| candles on the top layer | **pearl i beside block i** (hanging on its left side, outside the face), `pearlPose(j)` → `{x, y (base), rot, s, h, lit, out, alpha}` | `pearls[j] = {i, blockId, x, y, h, pop, lit, out}` |
| clear: layers hop off to the right | blocks **float up and away** (buoyant, drag), `fly.bubble = 1` | `blockPose` as before; crown rides the top block |
| bee: sits on the cake top, loop on tap | **puffer**: swims in from the RIGHT, hovers beside the top, tap → puffs up (`puffer.puff` 0..1), one spin (`rot` 0 → 2π), deflates, zooms off right | `flip` = facing (+1 right, −1 left); the art faces LEFT → mirror when flip > 0 |
| hint hand: drag path slot → drop point | **`hintHand.tap = true`**: the hand bobs on the piece (`x, y` = fingertip, `press`, `lift` 0..1); `fromX/fromY/toX/toY` kept as data | |
| `slotGap 26` | **34** (≥ 2·hitPadX + 2: neighbouring hit boxes never overlap with the narrower blocks) | |

## 1. Conventions — as Koko
Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise; screen = world. `update(dt)` runs fixed sub-steps of
`CONFIG.step = 1/120 s`; `_px/_py/_prot` interpolation with `w.alpha`. Content, layout, surprise timing use the seeded `RT.RNG`;
cosmetic randomness a second seeded generator. Same seed + inputs on the same sub-steps → same events at any frame size
(`tests/sim/determinism.js`: 10/10 same; unit test replays at 1/120 and 1/60).

## 2. Public API (`RT.World`) — as Koko, plus
`pointerUp(x, y)` → `'drop'` for a tap on a block in an open ask (tap to send). `pieceHit(id)` → `{x, y, w: LW + 32, h: 2·(0.6·S + 14)}`.
`cloudPose(alpha)` = `jellyPose(alpha)` → `{x, y, s, alpha, pulse}`; `crownPose`, `pearlPose(j)` (above), `pipHit()`, `pipMouth()`,
`pufferHit()` → `{x, y, r: 64}` (only `in` / `sit`), `pufferPos()`, `dropPoint()` (1.5·LH above the top), `towerTop()`, `blockPose(i)`.
`World.pearlOffsets(n, layout)` → `[x…]` with `.h` (drawn pearl height = `layout.pearlH`), `.y` (base below the block centre) and `.r` (ball radius).
Fields: `w.puffer = {x, y, _px, _py, t, state: in | sit | loop | away, flip, flap 0..1, rot, puff 0..1, lx, ly}`.

## 3. Layout — as Koko with the new block size
| key | value |
|---|---|
| `S` | 124 (age ≤ 4) / 110 (5+), shrunk to fit (≥ 92) with `rows·round(0.80·S) ≤ budget` (rooms unchanged) |
| `LW × LH` | 1280×720 age 4: **139 × 99**; age 5+: **123 × 88** |
| `tower`, `drop`, `goal`, `pip`, `bubble`, `hud` | unchanged rules (drop zone `tower.x ∓ (LW/2 + 60)`, release catch + 40 px) |
| `slots` | as Koko with **`slotGap 34`** |
| `pearlH` | round(0.80·LH) = 79 px at age 4 (ball 0.38·h = 30 px ≈ 16 CSS px on iPhone portrait; ≥ 14 CSS px at every age; small blocks: ≤ 1.0·bh) |
Unit-checked on 20 viewports × 5 ages (slots, drop zone, HUD, bubble, Pip, tallest tower + crown, hit boxes, Pip above the tray).
The bubble-lift arc stays on screen: the block's top edge stays ≥ 29 px below the top inset on all checked viewports (the arc's
control point is clamped to `ins.top + bh/2 + 8`).

## 4. Motion — every number is in `RT.CONFIG`
| what | how | numbers |
|---|---|---|
| **tap vs drag** | a press on a free block in phase `ask` (not locked) → `state 'drag'`; released with < 24 px movement (`tapMoveMin` may raise it) and < 0.35 s → TAP → `_send(p)`. Longer / farther → a drag (unchanged: drop zone → fall, elsewhere → miss / grace assist). One active pointer; a new `pointerDown` cancels the old press | `tapMovePx 24`, `tapTime 0.35` |
| **tap = answer** | a tap resets the idle clock (like a grab) and is never a "soft tap". A wrong tap bounces off the top like a wrong drop: `wrong` event, `misses++`, `askMisses++` (2nd → hint, 3rd → errorless fade), lock 1.3 s (playtest P2-1: 0.7 s ended before the bonked block was home), Pip `oops`. A right tap is a normal answer (no assist, even when hinted) | stars: as Koko (assists = tower tap / grace only) |
| **bubble lift** (`_send`) | `state 'lift'`, `z 4`, phase `drop`; `bubble` 0 → 1 in 0.1 s; quadratic Bézier start → control (70 % across, `2.5·(0.5·LH + 30)` px above the drop point, clamped on screen) → `dropPoint()` (tracked live) with smoothstep timing, so it rises, passes OVER the drop point and comes to rest on it; gentle rock `0.06·sin(2π·1.4 t)`, scale → 1.08. Then `bubblePop {pieceId, x, y}`, `bubble = 0`, sinking starts from rest. Not hittable while lifting (`_hit` skips it) | `sendTime 0.55`, `sendApex 0.5`, `sendApexPx 30`, `bubbleIn 0.1` |
| **sinking** (`fall`) | `vy += (gWater − k·vy·|vy|)·h`, `k = gWater / vTerm²`; x springs (ω 10, ζ 0.9) to `top.x + fallOff + 6·sin(2π·0.7 t)·near`, `fallOff` clamped to ± (0.18·LW − 6); `rot = rot₀·e^(−8t) + 0.12·near·sin(2π·1.3 t)` with `near = smoothstep(gap / 1.2·LH)` (the rocking fades as it reaches the top). A drag released below the top (beside the tower) gets the bubble lift instead of a hop. `impact = vy / vTerm` | `gWater 900`, `vTerm 420`, `rockA 0.12`, `rockHz 1.3`, `sinkSway 6`; tap → pop 0.55 s → land 1.06 s (contact speed ≈ 330 px/s, impact 0.8) |
| **landing** | the right block joins the stack: squash `sy 0.82` → overshoot ≈ 1.055 → settled in ≈ 0.5 s; the block below compresses `0.06·(1 − 0.25·depth)·(0.5 + 0.5·impact)`; sway kick as Koko (swayRoom); `land {…, sand: true}` | `landSquash 0.18`, `squashOmega 18`, `squashZeta 0.35`, `belowSquash 0.06` |
| **wrong bonk** | restitution 0.45 upwards, 260 px/s sideways towards its home side, spin 7 rad/s (ballistic g 1500 until it stops rising, ≈ 0.12 s), then a **watery drift home** (functional P3-1, `_driftHome`): a cubic Hermite curve from its bounce velocity to rest in its slot, rocking `0.06·sin(2π·1.3 t)`; `T` is stretched until the sampled peak speed is ≤ `homeDriftV` 420 px/s (the sinking terminal speed) but never past `homeBy` 2.4 s after the send (`p._sentAt`; a drag: from the release) | wrong tap → `wrong` at 1.06 s, home ≤ 2.4 s. Unit, 20 viewports × ages: peak ≤ 420 px/s for ⅔ of the trips; only the far 3rd slot of a wide landscape needs up to 844 px/s (was 1 327 ballistic) |
| **home / out arcs** | a missed drag / cancelled drag: ballistic with `gHome 1500` (was 2600); the unchosen blocks of an ask float up and fade (`outVy −200`, buoyancy −300 px/s², 0.35 s) | |
| **tower sway** | `θ'' = −14θ − 1.9ω + τ` (0.6 Hz, ζ 0.25; Pip's `hold` ×1.5 stiffer, ×3 damping); caps unchanged: |θ| ≤ 0.12, kicks limited to the 0.1 rad room. A 0.1 rad kick settles (< 0.005 rad) in **2.5 s** (Koko 1.6 s) | sims: max |θ| 0.106; 1 000 random sessions 0.104 |
| **sea current** `setBreeze(v)` | torque `0.18·breeze·(0.75 sin 2π·0.30 t + 0.25 sin(2π·0.19 t + 1))` → steady ≈ **0.016 rad** at v = 1 (bound 0.02 tested, also toggled) | `breezeTorque 0.18` |
| **deal** | each block starts `dealFrom` 300 px above its slot (alpha 0), `y = y₀ + 300·(1 − (1 − u)^2.2)` over 0.75 s (decelerating: it drifts to a stop), alpha 0 → 1 in 0.25 s, rock `0.14·sin(2π·1.1 t)·(1 − e)`, ± 10 px side sway, then a soft settle squash 0.07. Stagger 0.08 s; round start → ask ≈ 1.34 s (3 blocks). **Ask gate** (playtest P1-1, ages ≤ `askGateAges` 5): once the blocks have settled, the world stays in `deal` (nothing tappable, no boop, no prompt) while `world.speechBusy()` is true — main sets it to "Pip is speaking or has a line queued" (`RT.Voice.isBusy()`, false when the voice is off / speed mode) — for at most `askGateMax` 2.5 s; the `ask` event carries `waited`. Without the hook (headless tests, sims) there is no wait | `dealSink 0.75`, `dealFrom 300`, `dealRock 0.14`, `dealSway 10`, `dealFade 0.25`, `dealSquash 0.07` |
| **goal** | jellyfish + crown swim in on the spring (ω 7, ζ 0.7, 5–25 px overshoot), bob ± 4 px at 1.1 Hz, `goal.pulse = ½ − ½cos(2π·0.9 t)` (1.8 Hz while swimming away) | |
| **done** | `towerDone` → 0.15 s **`crown`** (the starfish hops 160 px/s and sinks with g 1400 onto its spot on the top; the jellyfish swims up 340 px, fading, over 1 s: `goal.swimY`, `cloudA`) → **`crownOn`** at ≈ 0.41 s (squash 0.7, tiny sway kick) → **`count {i}`** from 0.65 s every 0.45 s (block i glows, pearl i pops (ω 18, ζ 0.4 → ≈ 1.25) and lights) → +0.45 s **`blow`** (Pip `blow` 0.9 s, `blowT`, a soft water push +0.025 rad) → +0.45 s **`pearlsOut`** (`out` 0 → 1 in 0.4 s: the pearls float up as bubbles) → +0.3 s **`sprinkles`** (fish school + bubbles) → +0.4 s **`roundDone`**. Total **1.8 + 0.45·n s** (n = 5: 4.08 s) | unchanged timing |
| **pearls** | (visual P2-1) pearl i hangs on block i's LEFT side: base at `(−bw/2 − 0.55·r, +0.29·h)` in the block frame, `r = 0.19·h` (the art's ball), so the ball is centred on the block's mid-height and only 0.45·r of it overlaps the outline — it never covers a numeral, dots or a picture (they reach ±0.42·LW), stays clear of the crown and the count numerals (right side) and of Pip. Drawn after the tower. Colour blocks lost their tiny white corner pearl (block_art) so the counting pearl is the only white dot | unit: all viewports × ages (ball ≥ 0.28·LH, ≥ 14 CSS px on iPhone portrait) |
| **clear** | top first, 0.1 s apart: each block floats up (start −80 px/s, buoyancy 1100 px/s² with drag to 700 px/s), drifts ± 20–60 px/s sideways + an 18 px/s wobble, rocks 0.08 rad, fades over the last 0.3 s of 0.8 s. The crown rides the top block; pearls ride their blocks (already floated out). n = 5: `roundDone` → next round 1.3 s | `clearTime 0.8`, `clearBuoy 1100`, `clearVt 700`, `clearFade 0.3` |
| **puffer** | from the 2nd ask, 0.3–0.8 s after it (phase ask, a block on the tower): swims in from `W + 70` on a wavy path (1.2 s) to its hover spot `(top.x + 0.5·LW + 44, top.y − 56)` (clamped on screen), hovers 4 s (bob, follows the sway), swims out right (1.2 s). Tap (r 64, `in` / `sit`) → `pufferTap`, `state 'loop'` (1.4 s): `puff` 0 → 1 in 0.25 s, one spin on a circle of 46 px (0.3–1.05 s, `rot` = angle), deflates in the last 0.35 s, then `away`. Playtest P1-2: a drop / send does **not** chase it away any more (the lifting block, z 4, passes in front of it); it leaves after `pufferSit` or when tapped. main says the short puffer line ("A puffer fish! Tap it!") only when Pip is quiet. Once per surprise tower | `pufferDelay [0.3, 0.8]`, `pufferIn 1.2`, `pufferLoop 1.4`, `pufferSpin [0.3, 1.05]`, `pufferHoverDx 0.5`, `pufferHoverPx 44`, `pufferHoverDy 56` |
| **hint** | after the 2nd miss / every idle nudge / the 3rd Pip or water tap: the right block glows 4 s and `hintHand = {pieceId, tap: true, x, y (fingertip on the piece, bobbing 28 px), press (0.3–0.5 of each 0.9 s tap), lift 0..1, alpha, t, fromX/fromY (slot), toX/toY (drop point), T, time}` | `hintStroke 0.9`, `hintBob 28` |
| **unchanged** | auto-hint after 2 misses (cooldown 6 s), errorless fade from the 3rd wrong answer, idle 12 → ×1.5 → 30 s, Pip tap repeats the prompt (3rd hints), tower tap / grace assists, stars 3/2/1 (towers of ≥ 3 blocks forgive one slip), Talk, chapter time limit, gust surprise | |
**Resize / rotation mid-round**: as Koko, plus a lifting block finishes at once (`bubblePop`, then right → `land`, wrong → `wrong` and
it is home); `cancelDrag()` during a lift does nothing (no press is held).

## 5. Renderer contract (objects)
- `piece = { id, block, askIdx, choice, right, slot, row, k, bw, bh, homeX, homeY, x, y (CENTRE), rot, sx, sy, scale, alpha, state,
  glow 0..1, z, bubble 0..1 }`, states `in | rest | drag | lift | fall | bounce | home | out`. Draw as Koko; while `state === 'lift'`
  draw `BlockArt.drawBubble(ctx, r, a)` around it with `r ≈ 0.62·hypot(bw, bh)·bubble`. On `bubblePop` a pop burst at (x, y).
- `tower.blocks[i]` → `blockPose(i, alpha)`; flying (clear) blocks have `fly.bubble = 1` (draw the bubble around them, fading with alpha).
- `goal`: `cloudPose(alpha)` → draw `env/jelly_ride.svg` 150 × 150 (·s) with its anchor (100, 30) at (x, y), alpha, optionally scale
  the bell by `1 + 0.04·(pulse − 0.5)`; `crownPose(alpha)` → `characters/crown.svg` 72 px tall, bottom anchor (40, 86).
- `pearlPose(j, alpha)` → `BlockArt.drawPearl(ctx, h·s, lit, out, t)` at (x, y) rotated `rot` — after the tower (beside the block's left side).
- `puffer` → `puffer.svg` / `puffer_up.svg` (puff ≥ 0.5) ≈ 96 × 80 centred, rotated `rot`, mirrored when `flip > 0`.
- `hintHand.tap` → draw the ghost hand at (x, y) (fingertip), pressed look while `press`.

## 6. Events (all carry `type`)
| event | fields | when |
|---|---|---|
| `session`, `level`, `round` (`surprise: 'breeze' / 'puffer' / null`), `deal`, `ask` (+ `waited`: s held by the ask gate) | as Koko | |
| `grab` | `pieceId, nameKind, nameValue, block, right, x, y` | a press became a drag |
| `tapPiece` | `pieceId, nameKind, nameValue, block, x, y, right, assist (false), send (true)` | a tap on a block = an answer (say its name) |
| `drop` | `pieceId, x, y, right, assisted?, via? ('tap' / 'tower' / 'grace')` | sent (tap) or released over the tower |
| **`bubblePop`** | `pieceId, x, y` | the lift bubble pops at the drop point (pop sfx) |
| **`trail`** | `pieceId, x, y` | every 0.09 s while lifting / sinking (spawn bubbles) |
| `miss` | `pieceId, x, y` | a drag released elsewhere |
| `land` | `pieceId, n, impact 0..1, x, y (contact), right, sand: true` | the right block plonks onto the top |
| `stack`, `wrong`, `locked`, `hint`, `idle`, `stillDrag`, `fadeWrong`, `pokePip` | as Koko | |
| `towerDone` | `n` | |
| `crown` | `x, y` | the starfish drops off the jellyfish; the jellyfish swims away |
| `crownOn` | `x, y` | the starfish lands on the top (plop) |
| `count` | `i, n, x, y (block centre), cx, cy (pearl base)` | block i glows, pearl i pops + lights |
| `blow` | `x, y (Pip's lips), tx, ty (tower top)` | Pip blows bubbles |
| `pearlsOut` | `n, x, y` | the pearls float up as bubbles |
| `sprinkles` | `x, y (tower top)` | fish school + bubbles (`weather.burst(x, y, {kind: 'sprinkles'})`) |
| `roundDone`, `clearBlock {i, x, y}`, `gust`, `talk`, `talkAsk`, `talkResult`, `levelDone`, `sessionDone` | as Koko | |
| `puffer` / `pufferTap` | `x, y` | the puffer swims in / is tapped (boing-puff, `puffer.tap`) |
Never emitted: `cherry`, `cherryOn`, `candlesOut`, `bee`, `beeTap`, `pokeKoko`, `monkey`, `bananas`, `bloom`, `butterfly`, `pokeLulu`.

## 7. Content (`RT.Content`, DESIGN §5.1)
- `RT.ANIMALS = ['fish', 'crab', 'turtle', 'whale', 'seahorse', 'dolphin', 'jellyfish', 'shrimp']` (sprite `animal_<x>`).
- `RT.ANIMAL_SOUND` = **clue ids** `{ crab: 'claws', turtle: 'shell', whale: 'spout', seahorse: 'tail' }` (others null). Clue asks
  (`p.sound`, `params = {animal, sound: clueId}`) from round 3 at age ≥ 4, every 2nd ask (≈ 50 %). **`RT.CLUE_AVOID`** keeps
  look-alikes out of a clue set: claws ✗ shrimp, shell ✗ crab + shrimp, spout ✗ dolphin, tail ✗ shrimp (`validate()` checks it;
  `matches` re-derives the answer from the clue alone).
- `RT.WORDS` (age 6–7 "first letter"): en fish F, crab C, turtle T, whale W, seahorse S, dolphin D, jellyfish J, shrimp S; vi cá C,
  cua C, rùa R, cá voi C, cá ngựa C, cá heo C, sứa S, tôm T. **Every block of one choice set has a different initial** (vi has 4
  initials — enough for 4 choices), no letter twice in a row; `validate()` checks both.
- Everything else (blocks per tower 3: 2,2,3,3 · 4: 2,2,3,4 · 5: 3,3,4,5 · 6–7: 3,4,4,5, choices, colour-blind rules below age 5,
  count-up, size, letters, arithmetic, Talk) unchanged; the 66 000-round self-check runs in the unit suite.

## 8. Weather (`RT.Weather`, DESIGN §5.3) — under water, same API
New settable fields: **`wx.surfaceY`** (the water surface line; main: `ins.top + 40`; default 40) and **`wx.pip = {x, y}`** (optional:
a third of the rising bubbles start there). Kinds: `bubble` (new), `sparkle`, `sugar`, `wrapper_a`, `wrapper_b`, `blossom`, `raindrop`,
`splash`, `puff`, `dust`, `confetti_a`, `confetti_b`, `pstar`; `burst` gains `'bubbles'`.
| mood | water top → bottom | sun (rays) | wind (current) | particles (ambient cap 80, all ≤ 120) |
|---|---|---|---|---|
| 0 sunny | `#7FD0E3 → #DDF4EC` | 1 | ≤ 0.15 | 8 bubbles rising 30–70 px/s from the sand (wobble), 6 light glints (`sugar`), 10 plankton specks (`blossom`, pastel, ± 6 px/s) |
| 1 breezy | `#88C7DA → #D5EDE4` | 0.8 | ≈ 0.8 with surges | bubbles bent by the current, seaweed bits `wrapper_a/b` 4 + 4 (sage tints) + 10 plankton flowing sideways at 30 + 150·wind px/s |
| 2 rain | `#6C93AB → #BCD1D6`, darkness 0.15 | 0.2 | ≤ 0.15 | bubbles, 14 drop streaks ABOVE the surface (520–700 px/s) → a ripple ring (`splash`, 0.6 s, grows) at `surfaceY ± 20`, 12 greyish specks sinking 6–16 px/s |
| 3 rainbow | `#86D2E8 → #E9F6EA`, rainbow 1 | 0.9 | ≤ 0.1 | 10 bubbles, 12 sparkles, 5 plankton |
`party()`: 36 / s little fish (`confetti_a`, tinted, nose first) and bubbles swim in from both sides on wavy paths, rising a little,
+ sparkle / bubble bursts. Bursts: confetti / sprinkles = fish + bubble confetti swirling out (drag 0.12/s, slight rise), puff / dust
= sand spreading sideways along the floor, splash = ripple ring, sparkle / stars float. Nothing under the surface moves faster than
≈ 250 px/s (unit: < 25 px per 0.1 s for ambient particles). Deterministic per seed.

## 9. Bot (`RT.Bot`)
`new RT.Bot(world, {skill, seed, think, retry, steps, stepDt, hold, tap: 0.75, puffer: 0.6, poke: 0.03})`. Picks the right block
with p = skill (glowing: ≥ 0.9); with p = `tap` it TAPS it (pointerDown + pointerUp at the centre ± 0.1·LW/LH), else drags it to
the drop point as before. Taps the puffer with p = puffer. `stats {drags, sends, right, wrong, drops, misses, locked, taps, talks,
talkRight, pokes, puffer}` (unit: 60–90 % of answers are taps).

## 10. Tests and playtest
**Unit (`tests/unit/run.js`, 48 tests, all green):** ask gate (hook busy / quiet / max 2.5 s / ages 6–7 / no hook, bot session with the hook), watery wrong drift (speed + time), first session = `AGE_TOPICS`, content (66 000 rounds, sea animals, clue ids + look-alike rule, unique initials
per set in en + vi), layout numbers (139 × 99), 20 viewports × ages, hit boxes (no overlap), scripted pointer sessions per age with
wrong taps / right taps / drags and the full event order (`… drop → trail → land → stack → towerDone → crown → crownOn → count →
blow → pearlsOut → sprinkles → roundDone → clearBlock`, `tapPiece → drop → bubblePop → trail`), bot sessions at every age (breeze),
chapter length, deal drift, drag, still drag, tap vs drag, **tap to send** (lift 0.55 s, bubble, apex over the drop point, pop at
the drop point, trails, not grabbable while lifting, rotation mid-lift right / wrong), **water fall** (terminal speed, slow sink,
rocking ≤ 0.12, contact within ± 0.18·LW, plonk 0.82, settles), **landing tolerance at every age × viewport** (taps, drags high /
low / flicks: 418 landings, contact ≤ 0.01·LW off), wrong bounce + tapping hint hand, stars, idle / Pip pokes, tap-only child,
done order + timing, jellyfish swims away, crown floats up with the top block, pearls on their blocks, errorless fade, dropCatch,
Talk cut, gust, setBreeze bound, **puffer** (from the right, hover, puff, spin, away right), rotations, sway physics, **the tower
never falls in 1 000 random sessions** (4 994 towers, 16 518 blocks, max |θ| 0.104, centre ≤ 0.11·baseW), determinism, event fields,
bot taps, underwater weather.

**High-speed playtest (`node tests/sim/hs_playtest.js --n 20 --jobs 4 --tag rt1`, 1 480 sessions, `tests/sim/out/hs_rt1.md`;
typical children answer 80 / 75 / 70 / 65 / 65 % by tap at ages 3–7; `dragger` = the same child drag-only):**
| age | typical chapter mean / p90 | typical session mean / p90 / max | typical tower mean / p90 | typical ask mean / p90 | dragger chapter mean | slow3 session p90 | spammer / tapper session mean |
|---|---|---|---|---|---|---|---|
| 3 | **93.3** / 110.3 s | 380 / 415 / 438 s | 21.6 / 30.4 s | 6.4 / 9.4 s | 90.7 s | 390 s | 254 / 366 s |
| 4 | **89.1** / 104.3 s | 364 / 398 / 403 s | 21.0 / 31.1 s | 5.6 / 10.2 s | 88.2 s | 397 s | 307 / 343 s |
| 5 | 89.2 / 107.2 s | 364 / 401 / 409 s | 23.0 / 31.4 s | 4.4 / 7.3 s | 85.4 s | 391 s | 351 / 368 s |
| 6 | 93.1 / 106.8 s | 380 / 431 / 446 s | 23.0 / 31.6 s | 3.8 / 6.6 s | 88.4 s | 447 s | 350 / 368 s |
| 7 | 92.5 / 106.2 s | 377 / 414 / 415 s | 21.9 / 28.6 s | 3.5 / 6.2 s | 91.5 s | 441 s | 359 / 365 s |
- Targets met: toddler chapters 60–100 s, every typical session ≤ 8 min (max 446 s); no stuck ask (> 60 s) or tower (> 120 s) for any
  engaged model; every session of every active model reaches `sessionDone` (spammer — who now SENDS every block it taps — tapper,
  swiper, confused included); absent child → 5th idle ≈ 121 s, ignored Talk ≈ 133 s (main auto-pauses).
- No NaN; sway ≤ 0.106 rad (cap 0.12); landing offset ≤ 0.175·LW; every 2nd miss on an ask hinted.
- A tap answer costs ≈ 1.06 s from the tap to the landing (drag: the finger time + ≈ 0.45 s sinking), so tapping children are about
  as fast as dragging ones; the extra watching time (lift + slow sink) is absorbed by the chapter budget (chapter cut 19–35 % for typical
  3–4-year-olds).
- Voice model (`hs_designer.js` smoke, age 4): tapping children answer sooner, so more prompts are cut by the child's own answer
  (typical: 45 % heard / 44 % cut by the answer / 11 % lost) — main should keep the `tapPiece` name line short and never re-queue a
  cut prompt after a right answer.

**Tuning log (Pip).**
- v1 = Koko's numbers with the new block size + water: `gWater 900 / vTerm 420` (DESIGN), rocking 0.12 rad at 1.3 Hz fading within
  1.2·LH of the top (so it never lands tilted), `sinkSway 6` with `fallOff` clamped 6 px tighter (lands within ± 0.18·LW).
- Bubble lift: first a straight line + sine bump — with a slot ≈ 400 px below the drop point the bump never got above it (apex 9 px);
  now a quadratic Bézier with the control point 2.5·apex above the drop point (≈ 50 px over it), clamped below the top inset.
- Sway `k 14 / c 1.9` (DESIGN) moved the resonance to 0.6 Hz, closer to the current's 0.3 Hz tone: breeze torque 0.33 → 0.18
  (steady 0.016 rad, bound 0.02).
- `slotGap 26 → 34`: with LW 108 on the iPad landscape-with-insets layout two age-6 hit boxes overlapped (a tap at a block's edge
  picked its neighbour).
- Pearls: 5 pearls (square art) cannot fit on a 139 px top beside the 64 px starfish → one pearl on each block's front (the count
  reads bottom → top). QA 2026-11-20 (visual P2-1): on the front they were 8 CSS px and covered numerals / sat on dot blocks → now
  twice as big (0.80·LH) and hanging outside the left side of each block.
- QA 2026-11-20 round: ask gate (P1-1), the puffer stays (P1-2, `pufferDelay [0.3, 0.8]`, `pufferIn 1.2`), `wrongLock 0.7 → 1.3`
  (P2-1), watery wrong drift home (functional P3-1), first session plays `AGE_TOPICS[age]` (functional P3-2).
- Clue look-alikes (crab has a shell, shrimp small claws + a curled tail, dolphin a blowhole) are kept out of clue sets.
