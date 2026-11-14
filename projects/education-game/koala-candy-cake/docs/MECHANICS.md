# Koko's Cake Tower — Mechanics (`CK.CONFIG`, layout, motion, events, playtest tuning)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.5.
Everything not listed here works as in `../giraffe-jungle-tower/docs/MECHANICS.md` (the tuned Lulu numbers were kept).
Tests: `node tests/unit/run.js` (40 tests, ≈ 75 s, of which ≈ 58 s is the 1 000-session "never falls" test;
`node tests/unit/run.js <name part>` runs a subset). Sims (report-only, `tests/sim/`): `node tests/sim/hs_playtest.js [--n 20]
[--ages 3,4] [--models typical,slow3,…] [--jobs 2] [--config '{…}'] [--tag x]` (1 380 sessions at n = 20 ≈ 75 s on 2 cores →
`tests/sim/out/hs_<tag>.md`), `node tests/sim/determinism.js`, `node tests/sim/content_stats.js [chapters]`,
`node tests/sim/hs_designer.js` + `hd_analyze.js` (voice-queue model), `node tests/sim/hs_browser.js` (the real page, needs the
lead's build). JSON reports are git-ignored.

## 0. What changed versus Lulu (API summary for render / main)
| Lulu | Koko | note |
|---|---|---|
| `layout.S` = square block side | `layout.S` = item scale (124 / 110, min 92); **`layout.LW = round(1.3·S)`, `layout.LH = round(0.78·S)`** | draw `BlockArt.drawBlock(ctx, block, LW·scale, LH·scale, opt)` |
| `piece.side`, `towerBlock.side` | **`bw`, `bh`** (full or 0.72× for small); `side` kept = `bh` (deprecated) | small = 0.72 × both (`CK.Content.SMALL_SCALE`) |
| `w.lulu`, `layout.lulu`, `luluHit()` | **`w.koko`, `layout.koko`, `kokoHit()`**, `kokoMouth()` | `w.lulu`, `layout.lulu`, `luluHit` remain as aliases |
| `pointerDown → 'lulu' / 'butterfly'` | **`'koko'` / `'bee'`** | |
| `pointerUp → 'pokeLulu'`, event `pokeLulu` | **`'pokeKoko'`**, event **`pokeKoko`** | |
| `w.goal` bananas + `w.monkey`, `layout.branch`, `monkeyFrom` | **`w.goal` cherry on a cloud** + `cloudPose()`, `cherryPose()`; **`w.candles[]`** + `candlePose(j)`; `layout.goal {x, y, cloudY}` | no monkey, no branch |
| events `bloom`, `monkey`, `bananas` | **`cherry`, `cherryOn`, `blow`, `candlesOut`, `sprinkles`** | `count` gains `cx, cy` |
| `w.butterfly`, events `butterfly`, `butterflyTap` | **`w.bee`**, events **`bee`, `beeTap`**; `beeHit()`, `beePos()` | after a tap the bee loops once (`state 'loop'`) |
| — | **`setBreeze(v)`**, `w.breeze`, `w.blowT` | main: `world.setBreeze(weather.ambient.wind)` every frame |
| `dropPoint` 1.2·S above the top | 1.5·LH above the top | |
| Weather: morning/noon/sunset/night, `setNight`, sprites `petal/leaf/pollen/firefly`, `mist[]` | sunny/breezy/rain/rainbow, **`party()`**, particle `{kind, x, y, rot, s, a, tint, layer, flipX}`, clouds `{kind, x, y, s, alpha}` | `burst()` kept (new kinds) |

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. **Screen space = world space** (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s). Each sub-step first copies pieces / flying
  layers `x, y, rot → _px, _py, _prot`, `theta → _ptheta` (tower), `cloudY → _pcloudY`, `cherryX/Y → _pcherryX/Y` (goal), bee
  `_px/_py`. Render `v = _v + (v − _v)·w.alpha`; the pose helpers (`blockPose`, `cloudPose`, `cherryPose`, `candlePose`) take
  `alpha` and interpolate for you.
- Determinism: content + layout + surprises use the world's seeded `CK.RNG`; cosmetic randomness a second seeded generator; the
  breeze torque is a function of `w.time`. Same seed + same inputs on the same sub-steps → the same events whatever the frame
  size (`tests/sim/determinism.js`, and the unit test replays at 1/120 and 1/60 frames).

## 2. Public API (`CK.World`)
`new CK.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (no-op when unchanged),
`setAge(a)`, `setLang(l)` (apply at the next `newSession`), `newSession({lastTopics})`, `startLevel(i)`, `update(dt)`,
`drainEvents()`, `skipTalk()`, `resetNudges()`, `talkAnswer(choiceId)` → bool, **`setBreeze(v 0..1)`**.
**Input (one active pointer, logical px):** `pointerDown(x, y)` → piece id | `'locked'` | `'koko'` | `'bee'` | null;
`pointerMove(x, y)`; `pointerUp(x, y)` → `'tap'` | `'drop'` | `'miss'` | `'pokeKoko'` | null; `cancelDrag()`. `w.tapMoveMin` as Lulu.
**Queries:** `prompt()`, `answerId()`, `pieceHit(id)` → `{x, y, w: LW + 32, h: 2·(0.6·S + 14)}`, `kokoHit()` → `{x, y, w, h}`,
`kokoMouth()` → `{x, y}` (lips of the blow frame), `dropPoint()` → `{x, y}` 1.5·LH above the cake top, `towerTop()` →
`{x, y, rot}`, `blockPose(i, alpha)`, **`cloudPose(alpha)`**, **`cherryPose(alpha)`**, **`candlePose(j, alpha)`**, `drawOrder()`,
`pieceById(id)`, `hint()`, `interactive`, test hooks **`beeHit()`** → `{x, y, r}` | null (only while tappable), **`beePos()`**.
**Fields:** `layout, hudKeep, state, phase, level, levels, topic, weather (0..3 = level % 4: sunny, breezy, rain, rainbow), round,
roundsPerLevel, ask, asks, misses, askMisses, streak, stars, levelStars, roundStars, towers, talk, talkAnswered, alpha, time,
stateTime, phaseTime, wind (−1..1 gust surprise), breeze (smoothed setBreeze), blowT (1 → 0 over 0.9 s after the blow: lean the
flames), surprise, pieces, tower, goal, candles, bee, hintHand, koko, lastTopics`.
**Statics:** `CK.World.logicalSize(cssW, cssH)`, `computeLayout(W, H, ins, cfg, age)`, `slotsFor(layout, cfg, k)`, `kickFor`.

### States and phases — as Lulu
`menu → intro (2.5 s) → round → roundDone → round … → talk → levelDone (1.8 s) → intro (next chapter = next weather) … →
sessionDone`. After `done` the world is in **state `roundDone`, phase `'clear'`** while the layers hop off. Chapter = 4 cakes;
Talk comes early after ≥ 2 cakes when the chapter is > 80 s old or its pace predicts > 100 s.

## 3. Layout (`setViewport`, DESIGN §2) — `w.layout`
| key | rule |
|---|---|
| `W, H, ins, portrait, tall` | short-side rule; `tall` = H/W > 1.6 |
| `groundY` | `H − ins.bottom − 28` (landscape) / `− 40` (portrait) |
| `S`, `LW`, `LH` | S: 124 (age ≤ 4) / 110 (5+), shrunk (never < 92) so that `rows·LH ≤ budget` with LH = round(0.78·S) re-checked after rounding. Landscape: rows = maxN, budget = `baseTop − ins.top − room`, room 150 (phone landscape W/H > 1.9: 116). Portrait: rows = maxN + 1 (the tray row under the stand), budget = `groundY − baseDy − ins.top − room`, room 364 (tall: bubble bottom 234 + 12 + goalH 110 + 8), 272 (short / iPad: 142 + 12 + 110 + 8). maxN = 3 / 4 / 5 at ages 3 / 4 / 5–7. `LW = round(1.3·S)`, `LH = round(0.78·S)` (age 4: 161 × 97, 5+: 143 × 86) |
| `tower {x, baseTop, baseW}` | landscape `x = max(ins.left + 0.40·(W − ins.l − ins.r), ins.left + 400)` (was 0.45 / 360: the wide layers need room for 2 slots right of the drop zone on a 4:3 iPad), `baseTop = groundY − 96` (the stand is ≈ 98 px tall at baseW 221, so it stands on the ground); portrait `x = 0.58·W`, `baseTop = groundY − LH − 150` (short portrait − 90); `baseW = LW + 60` |
| `drop {x0, x1, y1}` | `tower.x ∓ (LW/2 + 60)`, `y < baseTop + 10` |
| `goalY`, `goal {x, y, cloudY}`, `goalH` | cherry bottom `goalY = baseTop − N·LH − 8` (N = layers of this cake; maxN outside a round); `cloudY = goalY − 18` (the cloud's top surface, anchor (100, 22) of `cloud_candy.svg`); cherry + cloud top ≈ 110 px (`goalH`). The cloud body (180 × 100 drawn) hangs ≈ 60 px below goalY: draw it BEHIND the cake |
| `koko {x, y, h}` | FEET: landscape `(ins.left + 120, groundY − 4)`, `h = 330` (W < 1100: 300); portrait `(ins.left + 110, baseTop + 70)`, `h = 300`. Hit box `x ± 0.38·h`, `y − h … y`, + 20 px |
| `slots` / `slotsFor(L, cfg, k)` | full-layer centres. Landscape: from `drop.x1 + 44 + LW/2` to `W − ins.right − LW/2 − 20` at `y = groundY − LH/2 − 6`, spacing ≥ LW + 26 (spread up to LW + 70, centred); what does not fit → 2nd row `LH + 40` higher (`row: 1`, `BlockArt.drawPlate` under it). Portrait: one row at `groundY − LH/2 − 8`, spread (≤ LW + 70, centred) over `ins.left + LW/2 + 20 … W − ins.right − LW/2 − 20`. Ages 3 / 4–5 / 6–7 get at most 2 / 3 / 4 choices: 4 wide age-4 layers would not fit one 720 px portrait row, and content never asks for that |
| `bubble`, `hud`, `safe` | as Lulu |
Unit-checked on 20 viewports (incl. iPhone 393×852 and iPad 820×1180 in both orientations, iPhone SE, safe-area insets) × 5 ages:
slots on screen, clear of the drop zone (± 44), HUD, bubble and (landscape) Koko; no slot overlap; the tallest cake + cherry box
(tower.x ± 90) fit and are never under the bubble or the HUD; Koko left of the drop zone; every `pieceHit` centre picks its piece.
A small layer rests bottom-aligned: `homeY = slot.y + (LH − bh)/2`.

## 4. Motion and round flow — every number is in `CK.CONFIG`
Unchanged from Lulu (with S → LW for widths, LH for heights): deal (stagger 0.08 s, ≤ 0.45 s fall, one small bounce), rest bob,
drag spring (ω 30, ζ 0.8, grab offset clamped to ± 0.35·LW / ± 0.35·LH), pendulum tilt, still drag (6 s), tap vs drag, drop / toss
(apex 1.2·LH), magnet fall (land within ± 0.18·LW), miss arc, wrong bounce, out, sway pendulum (`θ'' = −26θ − 3.2ω + τ`, cap
± 0.12 rad, layer i bent θ·(i+1)/n, `dx` self-centres at ≤ 0.6·LW/s), help / idle / tap assist / grace assist, stars, breeze
surprise (gust 0.1 rad, Koko `hold` 1.5 s). New or changed:

| what | how | numbers |
|---|---|---|
| **jelly landing** | the landing layer squashes to `sy 0.75` (`landSquash 0.25`, was 0.18) and springs back with a low damping (`squashOmega 20`, `squashZeta 0.25`, was 22 / 0.32): overshoot to ≈ 1.11 (stretch), 2–3 wobbles, < 1 % after ≈ 0.6 s; `sx = 1 + 0.5·q`. The 4 layers below compress `0.08·(1 − 0.25·depth)·(0.5 + 0.5·impact)` (was 0.06) — soft sponge. Choice layers use the same jelly on their deal / home landings | unit: sy 0.75 ± 0.02 at contact, max 1.05–1.2, settled after 2.5 s |
| **goal float-in** | at round start the cloud + cherry start ≈ (goalY + 140) px above their place and come in on a spring `ω 7, ζ 0.7` (≈ 4 % soft overshoot, 5–25 px), then bob `± 4 px` at 1.1 Hz. A landing within 1.5·LH of the cherry bumps the cloud up a little (`goalBump 60` px/s) | |
| **done** (`towerDone`) | Koko `cheer`. 0.15 s: **`cherry`** — the cloud puffs away (alpha 1 → 0, scale 1 → 1.35 in 0.35 s), the cherry hops (`vy −320`) and falls (g 2600, x magnet onto the top) → **`cherryOn`**: squash `csy 0.7` (ω 22, ζ 0.3), a tiny sway kick (0.012) + top-layer dip 0.06; from then on it rides the top layer. 0.65 s + 0.45·(i−1): **`count {i}`** bottom → top — layer i glows (stays 0.3), candle i pops (spring ω 18, ζ 0.4: overshoot ≈ 1.25) and lights 0.1 s later over 0.2 s. Last count + 0.45 s: **`blow`** — Koko mood `blow` 0.9 s, `w.blowT` 1 → 0, a breath kick of +0.025 rad (the cake jiggles right, away from Koko). + 0.45 s: **`candlesOut`** (each candle `out` 0 → 1 in 0.4 s, `lit` follows `1 − out`: smoke). + 0.3 s: **`sprinkles`** (Koko `cheer`). + 0.4 s: **`roundDone`**, then the clear starts at once. Total `towerDone → roundDone` = 2.25 + 0.45·n s: 3.15 / 3.6 / 4.05 s for 2 / 4 / 5 layers (unit: 3.3–3.9 s at n = 4). `doneMax 7` s safety | Lulu's bloom + monkey took ≈ 3.0 s at n = 4 |
| **candles** | `w.candles = [{ i (1…n), x (offset along the top layer), pop 0..≈1.25, lit 0..1, out 0..1 }]`, created at `towerDone` (pop 0 = invisible), offsets evenly across 0.7·LW (`−0.35·LW … +0.35·LW`; n = 1 → 0). They stand 0.06·LH behind the top's front edge (`candleBack`) | the middle candle of an odd n stands behind the cherry: draw candles first, the cherry in front |
| **clear** | as Lulu (top first, 0.1 s apart, ballistic towards `W + LW`, 0.55 s, fade 0.25 s). The cherry and the candles ride the top layer's flying pose; when that layer is gone `w.goal = null`, `w.candles = []` | |
| **setBreeze(v)** | input clamped 0..1, smoothed (τ 1.2 s) into `w.breeze`; torque `τ = 0.33·breeze·(0.75·sin 2π·0.30 t + 0.25·sin(2π·0.19 t + 1))` — far below the 0.81 Hz resonance, so |θ| from it ≈ 0.012–0.015 rad steady at v = 1 (bound 0.02 tested, also toggling 0 ↔ 1 every 1.3 s). Calms < 0.002 rad 8 s after v = 0. Koko's `hold` (gust) stiffens as before | unit + sims: max θ with breeze + landings 0.104 rad |
| **bee** (surprise, replaces the butterfly) | from the 2nd ask, 1–2 s after the ask (phase ask, a layer on the cake): buzzes in from a side on a curvy path (1.6 s, `flap = (14·t) % 1`), sits on the cake top (`top.y − 12`, follows the sway, `rot` = top rot) 4 s, flies away (1.2 s). **Tap** (radius 64, only `in` / `sit`) → `beeTap`, `state 'loop'`: one loop-the-loop of radius 46 above its spot (0.8 s), then `away`. A falling / tossed layer sends it away (no event). Once per surprise cake; a breeze surprise in a cake of < 3 layers becomes the bee | |
| **Koko** | moods idle / talk / happy / cheer / think / oops / hold / **blow** (0.9 s); blink every 2.2–5 s; look follows the active piece → the bee → the falling cherry → the cake top (`look` −1..1) | |
**Resize / rotation mid-round** as Lulu (S, LW, LH may change; `dx` scales with LW), plus: a dropping cherry lands at once
(`cherryOn`), a puffing cloud vanishes, the bee vanishes, flying clear layers vanish (and the cherry + candles with the top one).

## 5. Renderer contract (objects and pose helpers)
- `piece = { id, block, askIdx, choice, right, slot, row (0 | 1: on the plate), k, bw, bh, side (= bh), homeX, homeY, x, y (CENTRE),
  _px, _py, vx, vy, rot, _prot, sx, sy, scale, alpha, state, glow 0..1, z }`, states `in | rest | drag | fall | bounce | home | out`.
  Draw `translate(x, y)·rotate(rot)·scale(sx, sy)` then `BlockArt.drawBlock(ctx, block, LW·scale, LH·scale, {glow, lift, id})`
  with `globalAlpha = alpha` — pass the FULL LW × LH, BlockArt shrinks `size: 'small'` (0.72) itself. Order: `w.drawOrder()`; z ≤ 3
  before the cake, z 4 after it.
- `tower = { x, baseTop, blocks: [ { id, block, dx, bw, bh, side, sx, sy, glow 0..1, counted, fly } ], theta, _ptheta, omega, n }`.
  Draw layer i with `w.blockPose(i, alpha)` → `{x, y (centre), rot, sx, sy, alpha}`. The stand: `env/stand.svg` scaled so its plate
  (220 px wide at y 18) is `baseW` wide at `baseTop`, centred on `tower.x`.
- `goal = { x, y (cherry bottom rest = goalY), cloudY, _pcloudY, state: 'float' | 'drop' | 'on', bob, cherryX, _pcherryX, cherryY,
  _pcherryY, csx, csy (cherry squash), cloudA, cloudS, onId (id of the layer that carries it) } | null`. Use the helpers:
  `w.cloudPose(alpha)` → `{x, y, s, alpha}` | null: draw `cloud_candy.svg` 180·s × 100·s with its anchor (100, 22) at (x, y) —
  BEHIND the cake; `w.cherryPose(alpha)` → `{x, y, rot, sx, sy, alpha}` | null: draw `cherry.svg` 72 px tall (≈ 64 wide) with its
  bottom anchor (40, 86) at (x, y), rotated `rot`, scaled (sx, sy) about the anchor — after the cake.
- `candles[j]` → `w.candlePose(j, alpha)` → `{x, y (base), rot, s (pop scale), lit, out, alpha}` | null (not popped / gone): draw
  `BlockArt.drawCandle(ctx, h·s, lit, out, t)` at (x, y) rotated `rot` (suggested h ≈ 0.55·LH); lean the flames with `w.blowT`
  and `w.breeze`. Draw the candles before the cherry.
- `bee = null | { x, y, _px, _py, state: in | sit | loop | away, flip (±1), flap 0..1 (< 0.5 bee.svg, ≥ 0.5 bee_up.svg), rot }`,
  drawn 96 × 80 centred at (x, y), mirrored when flip < 0.
- `hintHand` as Lulu (to `dropPoint()`).
- `koko = { x, y (feet), mood, moodT, blink, blinkT, look −1..1, lookX, lookY }`: `koko_<mood>.svg` (blink overrides idle) drawn
  `h` tall with the feet anchor (150, 392) at (x, y). `kokoMouth()` gives the blow lips for a breath puff.
- `w.wind` −1..1 (gust surprise), `w.breeze` 0..1 (weather): lollipop trees / wrappers may lean with them.

## 6. Events (all carry `type`)
| event | fields | when |
|---|---|---|
| `session` | `levels` | newSession |
| `level` | `level, topic, weather` | a chapter starts (intro 2.5 s; weather 0 sunny, 1 breezy, 2 rain, 3 rainbow) |
| `round` | `round, topic, n (layers), asks, surprise ('breeze' / 'bee' / null)` | a cake starts (cloud + cherry float in) |
| `deal` | `ask, n (choices), pieces [ids]` | choice layers start to fall |
| `ask` | `ask, asks, promptKey, params, answerId, nameKind, nameValue, first` | all choices rest → speak the prompt |
| `grab` | `pieceId, nameKind, nameValue, block, right, x, y` | a press became a drag (once) |
| `tapPiece` | `pieceId, nameKind, nameValue, block, x, y, assist` | a tap on a layer |
| `drop` | `pieceId, x, y, right, assisted?, via? ('tower' / 'grace')` | released over the cake |
| `miss` | `pieceId, x, y` | released elsewhere |
| `land` | `pieceId, n, impact 0..1, x, y (contact), right` | the right layer hits the top (flump, pitch by n) |
| `stack` | `n, nameKind, nameValue, block, ask, asks, promptKey, params, topic, x, y` | right after `land` |
| `wrong` | `pieceId, nameKind, nameValue, block, want {…}, streak, misses, x, y, promptKey, params` | a wrong layer bounces off |
| `locked` | `pieceId` | a grab during the 0.7 s lock / the bounce |
| `hint` | `pieceId, x, y, idle?` | glow + ghost hand |
| `idle` | `n, promptKey, params` | idle nudge |
| `stillDrag` | `pieceId` | a still drag was cancelled |
| `pokeKoko` | `promptKey, params` | a tap on Koko (repeat the prompt) |
| `towerDone` | `n` | the last layer landed |
| `cherry` | `x, y` | the cloud puffs away, the cherry hops off it (puff + whoosh) |
| `cherryOn` | `x, y` | the cherry plops onto the top (plop) |
| `count` | `i (1…n), n, x, y (layer centre), cx, cy (candle base)` | count glow + candle i pops and lights (chime, candle fwip, `count.<i>`) |
| `blow` | `x, y (Koko's lips), tx, ty (cake top)` | Koko blows (blow sfx, `blow[]` line) |
| `candlesOut` | `n, x, y` | the flames go out (smoke puffs) |
| `sprinkles` | `x, y (cake top)` | sprinkle confetti (`weather.burst(x, y, {kind: 'sprinkles'})`) |
| `roundDone` | `round, stars, misses, assists` | stars; the clear starts |
| `clearBlock` | `i (from the top), x, y` | a layer hops off (puff) |
| `gust` | `dir, strength` | the breeze surprise |
| `bee` / `beeTap` | `x, y` | the bee arrives / is tapped (buzz, `bee.tap`) |
| `talk` / `talkAsk` / `talkResult` | as Lulu | Talk time |
| `levelDone` / `sessionDone` | `level, stars` / `stars, towers` | (session end → `weather.party()`) |
Removed: `bloom`, `monkey`, `bananas`, `butterfly`, `butterflyTap`, `pokeLulu`.

## 7. Content (`CK.Content`, DESIGN §5.1) — as Lulu, plus
- `CK.ANIMALS = ['bunny', 'bear', 'cat', 'dog', 'duck', 'pig', 'cow', 'sheep']` (animal cookies, sprite `animal_<x>`),
  `CK.ANIMAL_SOUND = { cat: 'meow', dog: 'woof', duck: 'quack', pig: 'oink', cow: 'moo', sheep: 'baa', bunny: null, bear: null }`:
  sound asks (`p.sound`, from cake 3 at age ≥ 4, every 2nd ask) only for the six with a sound (`validate()` checks it).
- `initial` words: en bunny B, bear B, cat C, dog D, duck D, pig P, cow C, sheep S; vi gấu G, mèo M, cún C, vịt V, heo H, bò B, cừu C
  ("thỏ" skipped: digraph th). Animals that share an initial are never distractors for each other, and **two consecutive asks
  never use the same letter** (new rule, `validate()` checks it).
- `SMALL_SCALE = 0.72` (was 0.7). Everything else (blocks per cake 3: 2,2,3,3 · 4: 2,3,3,4 · 5: 3,4,4,5 · 6–7: 4,5,5,5, choices,
  colour-clash rules, count-up / ascending dots, size, letters, arithmetic, Talk) unchanged; the 66 000-round self-check runs in
  the unit suite.

## 8. Weather (`CK.Weather`, DESIGN §5.3)
`new CK.Weather({width, height, seed, groundY, weather})`, `resize(W, H)`, `groundY` (set to `layout.groundY`: rain splashes land
on the plaza; default 0.92·H), `setWeather(i, {instant})` (2.5 s smoothstep crossfade of every ambient value and of the particle
populations), `update(dt)` (1/60 s steps), `party(on = true)`, `burst(x, y, {kind, n, tint})` with kinds `confetti`, `sprinkles`,
`puff`, `dust`, `sparkle`, `stars` (→ `pstar`), `splash`.
| mood | sky top → bottom | sun | wind (ambient.wind 0..1) | clouds (kind, speed) | particles |
|---|---|---|---|---|---|
| 0 sunny | `#A9DDF5 → #FFF4DA` | 1 | 0.06 base + 0.06·gust (≤ 0.15) | 3 white a/b/c, 10 px/s | sugar glints 12 (back), blossoms 6 drifting (front) |
| 1 breezy | `#BFDDEB → #F3EEDF` | 0.85 | 0.7·(1 ± 0.45 wander) + 0.3·gust, clamp ≤ 1: mean ≈ 0.75–0.8 | 5 white, 46 px/s | wrappers a/b 4 + 4 and blossoms 10 flying sideways (60 + 260·wind px/s) |
| 2 rain | `#8FA0B8 → #CBD5E0`, darkness 0.15, tint `rgba(120,136,172,0.08)` | 0 | 0.07 + 0.04·gust (≤ 0.15) | 6 (4 `rain`, 2 `b`), 16 px/s | 56 raindrops (1 000–1 300 px/s, slanted by the wind, `rot` along the motion) + a `splash` where each hits the plaza |
| 3 rainbow | `#9FD6F0 → #FFF1D6`, `rainbow` 1 | 0.9 | 0.05 + 0.05·gust | 3 white, 8 px/s | sparkles 14 (back), sugar 6, blossoms 4 |
Gusts every 4–7 s (0.6 s up, 0.8 s hold, 1.5 s down, amplitude 0.6–1). Ambient particles are capped at 80 (scaled by the screen area
0.6–1.5×), everything at **120**. Clouds: 6 fixed slots; a slot fades out (1.25 s) before its sprite kind changes (e.g. white → rain).
`party()`: 36 confetti sprinkles / s from the top edge (tinted with candy colours, tumbling `flipX`, slow fall) + sparkle bursts
until `party(false)`. Deterministic for a seed (`deepStrictEqual` of particles + clouds after 5 s).

## 9. Bot (`CK.Bot`)
As Lulu: `new CK.Bot(world, {skill, seed, think, retry, steps, stepDt, hold, bee: 0.6 (old option name butterfly still read),
poke: 0.03})`, `step(dt)` before `world.update(dt)`; drags to `dropPoint()` ± (0.15·LW, 0.2·LH); pokes Koko with p = poke; taps the
bee (in / sit) with p = bee after 0.4–1.2 s. `stats {drags, right, wrong, drops, misses, locked, taps, talks, talkRight, pokes, bee}`.

## 10. Tests and playtest
**Unit (`tests/unit/run.js`, 40 tests, all green):** content (66 000 rounds self-check + independent `matches`, animal cookies /
sounds / words, no repeated initial letter), layout numbers, all 20 viewports × ages (slots, drop zone, HUD, bubble, Koko, tallest
cake + cherry under the room), hit boxes, scripted pointer sessions per age with the full event order
(`… towerDone → cherry → cherryOn → count → blow → candlesOut → sprinkles → roundDone → clearBlock`), bot sessions with breeze,
chapter length, deal + cloud float-in / bob, drag, still drag, tap vs drag, drop + jelly squash + sponge, blockPose with LH, small
layers 0.72, wrong bounce + hints, stars, idle / Koko pokes, tap / grace assist + tapper / spammer finish, **done sequence order +
timing (3.3–3.9 s at n = 4), cherry squash + rides the top + flies off with the top layer, candles = n evenly across 0.7·LW with
pop overshoot / lit before the blow / out**, Talk cut, gust surprise, **setBreeze bound ≤ 0.02 rad (steady + toggled) and calm**,
**bee in / sit / tap → loop circle → away / once / sent away by a drop**, rotation mid-drag / fall / deal / cherry drop / clear,
sway physics, **the cake never falls in 1 000 random sessions** (random age, viewport, breeze, skill, fast flick drags, random taps,
random rotations: 5 005 cakes, 18 474 layers, max |θ| 0.104 rad, every stacked layer kept, offsets ≤ 0.18·LW, centre within the
stand — max 0.13·baseW), determinism (rerun + replay at 1/120 and 1/60), event fields, bot, weather.

**High-speed playtest (`node tests/sim/hs_playtest.js --n 20`, 1 380 sessions, `tests/sim/out/hs_ck1.md`; main's breeze emulated:
0.8 in breezy chapters):**
| age | typical chapter mean / p90 | typical session p90 / max | typical cake mean / p90 / max | typical ask mean / p90 | ★★★/★★/★ % | slow3 session p90 | spammer / tapper session |
|---|---|---|---|---|---|---|---|
| 3 | **92.1** / 103.5 s | 397 / 416 s | 22.4 / 30.5 / 43 s | 6.7 / 9.3 s | 29/49/22 | 405 s | 206 / 367 s |
| 4 | **91.0** / 108.8 s | 418 / 424 s | 23.6 / 34.2 / 53 s | 5.9 / 10.8 s | 41/32/27 | 386 s | 240 / 361 s |
| 5 | 87.7 / 101.1 s | 394 / 399 s | 25.1 / 33.5 / 41 s | 4.5 / 7.5 s | 66/24/10 | 504 s | 300 / 365 s |
| 6 | 92.5 / 104.5 s | 397 / 411 s | 28.4 / 37.4 / 57 s | 3.9 / 6.6 s | 78/14/7 | 609 s | 356 / 372 s |
| 7 | 92.1 / 106.3 s | 412 / 427 s | 25.7 / 33.0 / 49 s | 3.3 / 5.6 s | 92/6/2 | 622 s | 353 / 364 s |
- Targets met: toddler chapters 60–100 s, every typical session ≤ 8 min (max 427 s); **no stuck ask (> 60 s) and no stuck cake
  (> 120 s) for any engaged model** (longest cake: slow3 age 7, 104 s); every session of every active model reaches `sessionDone`
  (random tapper / swiper / confused / spammer included); absent child → 5th idle ≈ 94 s, ignored Talk ≈ 132 s (main auto-pauses).
- No NaN; sway ≤ 0.104 rad (cap 0.12) incl. breeze; landing offset ≤ 0.175·LW; every 2nd wrong drop hinted.
- Bees: 80 per 20 age-3 sessions (age-3 surprise cakes have 2 layers → always the bee); typical children tap ≈ 60 % at age 3.
- Deterministic: `tests/sim/determinism.js` all 10 cases same (rerun, replay 1/120, 1/60).
- Voice model (`hs_designer.js` smoke, age 4): a line on `cherryOn` ("Candles! Let's count them!") is mostly lost behind the
  `towerDone` line + count chimes (72–78 % dropped) — main should either fold it into the `towerDone` line or skip it; the `blow`
  line is heard (84–89 %).

**Tuning log (Koko).**
- v1 = Lulu's tuned numbers with LW/LH geometry. Layout fixes: tower x 0.45 / 360 → 0.40 / 400 (iPad 4:3 landscape: 1 slot per row
  at LW 161 → 2), stand drop `baseDyLand 64 → 96` (the pedestal stands on the plaza; S stays 124 / 110), portrait rooms raised to
  364 / 272 so the cherry never sits under the bubble.
- Jelly: `landSquash 0.25`, `squashZeta 0.25`, `squashOmega 20`, `belowSquash 0.08` (DESIGN "squash ~0.75, ζ ≈ 0.25").
- Done: cherry 0.15 s, count from 0.65 s (cherry lands at ≈ 0.45 s), blow / out / sprinkles / roundDone gaps 0.45 / 0.45 / 0.3 /
  0.4 s → 3.6 s at n = 4 (the 0.6 s more than Lulu's monkey is absorbed by the chapter budget: chapter means unchanged).
- Breeze torque 0.33 at 0.30 / 0.19 Hz → ≈ 0.012 rad steady (bound 0.02).
- Content: no repeated initial letter in a row (the cookie set has 3 shared initials in English).
