# Lolo's Jungle Leaf Match — Mechanics (rng · content · world · weather · bot)

Owner: mechanics engineer. Contract: `DESIGN.md` §1, §2, §6.1, §6.2, §6.5, §6.6. Built on Gigi's Peekaboo Windows
(`../giraffe-city-windows/docs/MECHANICS.md`); every rule this file does not change is Gigi's. **This file wins where it
differs from DESIGN** (see §0). Every tuned number lives in `LL.CONFIG` (`game/js/world.js`, commented) and can be overridden
per world: `new LL.World({ config: { roundDoneTime: 1 } })`.

Tests: `node tests/unit/run.js` (42 tests, ≈ 70 s; `node tests/unit/run.js swing` runs the tests whose name contains "swing").
Playtests: `node tests/sim/playtest.js [--n 6]` (2 400 sessions, ≈ 4 min on 2 cores), `node tests/sim/determinism.js`,
`node tests/sim/content_stats.js`, `tune.js --config '{…}'`, `pt_*.js` (older QA tools, adapted).
Units: logical px (short side 720), seconds, radians, y down; rot / angle > 0 = clockwise (canvas `rotate`).

## 0. Deviations from DESIGN.md (read first)
| # | DESIGN says | the code does | why |
|---|---|---|---|
| D1 | `critter {type, action}` | **`critter {critter, action, x, y}`** (`critter` ∈ `toucan│frog│butterfly`); frog `hop` also carries `big` | `type` is the event name |
| D2 | flip spring ω 12, ζ 0.45, "0.95 in ≤ 0.2 s" | **ω 14**, ζ 0.45, stop at 1.12 (bounce 0.3) | ω 12 reaches 0.95 only after 0.225 s; ω 14 → 0.19 s (tested ≤ 0.2) |
| D3 | swing impulse ±0.9 rad/s, clamp 0.14 | impulse **±0.6 rad/s** for a child's flip (hint lift 0.35, cheer 0.55); the **peek / hide waves kick 0.3** and a hide-wave kick pushes against the leaf's current swing (it calms the peek swing); clamp 0.14 (outward velocity → 0) | ±0.9 would peak at ≈ 0.18 rad and slam into the clamp every flip; QA: peek + hide kicks hit the clamp every round — now ≤ 0.130 rad at play start (12 viewports, wind 16) |
| D4 | pivot `(c.x, c.y − c.h/2 − c.stem)`, `c.stem = 0.62·gapY`, vine at `rowTop − 0.62·gapY` with sag 0.06 | the vine's **lowest point** (middle) is at `rowTop − 0.62·gapY`, its ends are `sag` higher, `sag = min(0.06·length, 0.28·gapY)`; every pivot lies ON the vine, so `c.stem = leafTop − vineY(c.x)` ∈ [0.62, 0.90]·gapY | with a straight 0.62·gapY stem a 0.06 sag (≈ 40 px on a wide row) would run the vine through the leaves |
| D5 | keep-out loloRect + 16 px; grid ≤ 1 empty slot | portrait board A (above Lolo): bottom ≤ loloRect top − **46** (16 keep-out + 30 hop room); board B x ≥ loloRect right + 40; **board C** (portrait, full width, down to the floor): rows above Lolo end ≥ 46 px above loloRect and the last row is **right-aligned**, its empty slots over Lolo (leftmost leaf ≥ loloRect right + 16 + 0.15·ch). Grids may have **2 empty slots** (last row ≥ 2 leaves; 1 on board C). Among layouts within **8 %** of the largest leaf the best fill / horizontal balance wins (§4). Landscape board x ≥ lolo.x + 130 | keep-out; QA: a 2×5 column right of Lolo left 36 % of an iPhone empty, 5×2 on iPad portrait left ≈ 290 px empty above the floor |
| D6 | backflip with a 70 px jump, happy hop 14, cheer hops | every jump apex = **min(px, `layout.loloRoom`)** (free px above loloRect before a leaf's 16 px keep-out; 200 when no leaf is above her). Landscape / portrait board B: 70 px backflip (airtime 0.70 s); under portrait board A: 30 px (airtime 0.46 s) | keep-out |
| D7 | vine swing "leap 0.2 s, swing, release, ballistic, land" | the liana hangs from a pivot 30 px above the screen top; the leap's apex IS the grab point (bottom of the liana) → a tangential grab, no impact; the pendulum (g 980, damping 0.15 /s) carries her to the release angle; ballistic flight; she lands with her hand at the seat height on the new log. Release angle searched 10–60°, the widest that lands ≤ T − 0.1 s with every frame on screen wins. Result on the 12 test viewports: **15–25°, 0.1–0.28 s on the vine, 0.7–1.1 s of flight, scrollTime 1.6 s everywhere** (never grows) | she has to cover one screen width (up to 1 600 px) in 1.6 s; bigger angles fly her above the HUD line or let the camera overtake her |
| D8 | lands "on the new log" | she lands **before** the scroll ends (≈ 1.3–1.5 s) and then rides in on the new log (`lolo.dx`) | the log moves with the tree; exact and continuous |
| D9 | bloom at "the stem point just above the leaf top" | 0.3·stem above the leaf top, rotated with the current swing about the pivot | exact point the renderer draws the orchid at |
| D10 | lean "to ±0.16" | target `0.16·clamp((leaf.x − lolo.x)/120, −1, 1)`, spring ω 8 ζ 0.5 → peaks ≈ 0.185 | a spring with ζ 0.5 overshoots ≈ 16 % |
| D11 | "the renderer clamps the arm" | the world gives **`lolo.armLen`** (already clamped: the hand stays ≥ 4 px out of every leaf rect) and the shoulder `lolo.shX/shY` | one implementation, tested |
| D12 | frog tap → big jump | if the frog is in the air the big jump starts at its next landing (the `tap` event fires at once) | it can only push off the floor |
| D13 | `cheer {x, y}` at the branch centre | `x = B.x + B.w/2, y = B.y − B.roofH/2` | — |
| D14 | — | Gigi's colour-round yellow rule kept (no yellow leaf within 40 px of Lolo's box); colours ≤ 4 one thing per round | "colour rules kept" |
| D15 | — | old names stay: `layout.dee/deeRect/road`, `w.dee/miu/items`, `c.flip/flipT/lift(0)/sx,sy(1)/rot(0)`, `lolo.walking (false)/walk (0)/tx,ty (= look point)`, `w.traffic = []`, `w.rewards = []`, `rect.door/doorX/doorW = null` | shared code |
| D16 | — | weather: jungle wind is calm (0–≈ 20 px/s), `ambient.rain/rainbow/wet` always 0, `wx.kites` always [] | — |
| D18 | Lolo portrait h 140, tree pad max(26, 0.24·cw) | tall phones (H/W > 1.6): Lolo **h 170 at x = ins.left + 120** (iPad portrait keeps 140 at 100); **pad = max(36, 0.32·cw)** — the trunks live entirely inside the pad (artist B: trunk width ≤ pad, nothing drawn outward), so the tree rect (inside the board, ≥ 24 px from the safe edges) never clips | QA: Lolo ≈ 76 CSS px on an iPhone; outer leaves overlapped the trunks / the right trunk clipped on iPad |
| D19 | — | mismatch shown **1.6 s** (age 3: 1.8 s); chapter limit **75 s**; surprise delay **3–5 s**; the frog stops ≥ 40 px right of loloRect (`x − 0.45·size ≥ loloRect right + 40`, and ≥ W/2 − 40) | QA / skill rule |
| D20 | — | pointerDown: inside the toucan / butterfly box a **turnable leaf** (face down, in play or during a shown mismatch) under the finger **wins**, unless the finger is in the middle 60 % (`critterCore`) of the critter box | QA: the butterfly ate 29 % of leaf taps |
| D21 | — | a resize / rotation during the scroll puts Lolo on the NEW log at once (`dx` follows `buildingDx`), the liana disappears, and exactly one `swing {phase:'land', skipped:true}` is emitted (none if she had already landed) | QA |
| D22 | topics: avoid last session's list | `topicsFor(age, rng, last, last2)` also never repeats the session before last (`newSession({lastTopics, lastTopics2})`; a World also remembers both itself for Play again) | QA: ages 3 / 6 alternated A, B, A, B |
| D17 | — | `LL.World.loloHead(w)` = a 0.6·h square with the head joint (96,172)/192 on the body socket (rotated by lean, lifted by hop) — used for the hit test | no neck any more |

## 1. API (DESIGN §6.2)
`setViewport(W, H, ins)`, `setAge`, `setLang`, `newSession({lastTopics, lastTopics2}?)` (D22), `startLevel(i)`, `update(dt)`, `drainEvents()`,
`pointerDown(x, y)` → leaf id │ `'critter'` │ `'lolo'` │ `null` (leaves turn **on touch-down**; critter vs leaf: D20), `pointerMove`, `pointerUp`, `cancelDrag()`,
`hint()` → leaf id, `talkAnswer(choiceId)` → bool, `skipTalk()`, `prompt()` → `{promptKey, params}`, `cardById(id)` (= `itemById`),
`cardRect(c)` (unrotated leaf rect, hit tests use it), `critterRect()` → tight box │ null, **`loloBox()`** (loloRect + dx, or the
hanging body while she swings).
Statics: `LL.World.logicalSize`, `computeLayout(W, H, ins)`, `chooseGrid(L, n, age)`, **`vineY(row, x)`**, **`leafBounds(c, swing?)`**
(axis-aligned box of the swung leaf), **`planSwing(L, cfg?, T?)`**, `loloHead(w, alpha?)` → `{x, y, w, h, jx, jy}`, `rectGap`,
`overlapArea`, palettes `LEAVES` / `BARKS` (`[base, dark]`), `FLOWERS`, `KINDS`.
Test hooks (main, DESIGN §6.6): `cardScreen(id)` = `cardRect(c)` (+ `buildingDx` while scrolling); `loloScreen()` = `world.loloBox()`
(better than `layout.loloRect`: it follows the swing); `critterScreen()` = `critterRect()`.

World fields: `layout, state, phase, phaseTime, stateTime, time, alpha, level, levels, topic, weather (= level = mood), round,
roundsPerLevel, stars, levelStars, roundStars, mismatches, streak, found, pairs, open, cur, talk, talkAnswered, interactive, solved,
wind (main copies weather.ambient.wind here every frame — it drives the leaf swing), cards, building, prevBuilding, lastBuilding, scroll,
scrollT, scrollTime, buildingDx, prevDx, cheer, critter, traffic ([]), lolo, collected, surprise, pairsHeld`.
States: `menu → intro → round → roundDone → … → talk → levelDone → … → sessionDone`.
Phases inside `round`: **`scroll → peek → hide → play ⇄ resolve → cheer`** (roundDone: phase `'done'`).

### Events
| event | fields |
|---|---|
| `session` / `level` | `levels` / `level, topic` |
| `scroll` | `first` (no old tree leaves), `building`, `time` (= w.scrollTime) — the camera starts panning (emitted just before `round`) |
| `round` | `round, topic, promptKey, params {n}, pairs, held, surprise ('toucan'│'frog'│'butterfly'│null), building` |
| `swing` | `phase` ∈ `leap` (Lolo jumps off the old log) → `grab` (catches the liana) → `release` (lets go: "wheee") → `land` (on the new log: thump), `x, y` (screen px of her hand; `land`: her seat) — exactly once each per scroll; after a mid-scroll resize only `land` with `skipped: true` (D21) |
| `peek` / `hide` / `play` | — (all leaves turn over in a wave / turn back in a reverse wave / the child may tap) |
| `flip` | `id, nameKind, nameValue, face, size, obj, open` (the child turned a leaf; open = 1 or 2) |
| `tap` | `id, nameKind, nameValue, face, size, obj` (a turned or matched leaf tapped → say its name again) |
| `clack` | `id, v` — a leaf settles back to its top side with speed v (≈ 7–9 /s; ≥ 4): soft leaf "fwip", volume ∝ v. One per turn-back |
| `match` | `a, b, key, nameKind, nameValue, found, pairs, nameKindA/B, nameValueA/B, faceA/B, sizeA/B, objA/B` + **`animal, food`** (food), `obj` (colours ≤ 4), `parity, word, text, lower` |
| `bloom` | `id, x, y` — an orchid opens on the stem (x, y = that point, see D9); twice per match, 0.15 s apart ("bloop-bloop"); spawn the butterfly particle here |
| `mismatch` | `a, b, streak, mismatches, nameKindA/B, nameValueA/B, faceA/B, sizeA/B, objA/B` |
| `hint` | `a, b, nameKind, nameValue` (+ `idle: true`) |
| `idle` | `n, promptKey, params` |
| `cheer` | `x, y` — the branch centre: petals (`weather.burst(x, y, {kind:'petals', w: B.w})`) + jungle fanfare |
| `backflip` | `jump` (apex px), `time` (airtime s) — Lolo's backflip starts (0.1 s into the cheer): "boing" |
| `roundDone` | `round, stars, mismatches` |
| `critter` | `critter, action, x, y` — toucan: `enter, land, tap, leave` (at the cheer); frog: `enter, hop (+big), stop, tap, leave`; butterfly: `enter, tap, leave` (untapped, off the top) |
| `talk` / `talkAsk` / `talkResult` | `talk` / `talk, n, glowAnswer` / `correct, choiceId, answerId` |
| `levelDone` / `sessionDone` | `level, stars` / `stars, found, rewards` |
Removed: **`walk`**, `deal`, `reward`, `land`, `shuffle`, `golden`.

## 2. Renderer contract (exact)
Interpolate every value `v` that has a `_v` partner: `v' = _v + (v − _v)·w.alpha`. Partners: leaves `_px _py _popen _pflip _pbloom
_pbounce _pswing`; frozen old leaves `_pswing`; world `_pscroll _pscrollT`; Lolo `_phop _plean _parmA _parmExt _parmLen _ptail _psquash
_pflipRot _pdx`; vine `_ppx _phx _phy _pang _pex _pey _palpha`; critter `_px _py _prot _phy`. Do **not** interpolate `tail` / butterfly
`flap` across their 2π wrap (use the raw value when `|v − _v| > π`).

### 2.1 Camera, trees, logs
- Parallax offsets far `−scroll'·0.15`, mid `−scroll'·0.4`, tree/floor `−scroll'·1.0` (mod the 1200 px tile).
  `sT = _pscrollT + (scrollT − _pscrollT)·alpha`; the **new tree and its leaves** are drawn shifted by `dx = (1 − sT)·W` (= `w.buildingDx`),
  the **old one** (`w.prevBuilding = {building, rect, grid, cards}`, frozen, lit; its leaves keep swinging — read their `swing`) by
  `−sT·W` (= `w.prevDx`). Outside the scroll `scrollT = 1`, dx 0, `prevBuilding = null`. Talk / levelDone / the next intro:
  `w.cards = []`, `layout.grid = null`, `w.lastBuilding` (same shape) is the lit tree to draw in place (dx 0) behind the panel.
- **Logs** belong to the trees: draw `env/log.svg` (seat top (160, 34) of 320×140, width ≈ 1.45·h) with its seat at `(layout.lolo.x + dx,
  layout.lolo.y)` for the current tree; while scrolling ALSO the old log at `layout.lolo.x + prevDx` (even when `prevBuilding` is null —
  the very first scroll — Lolo leaves from it).
- **Tree**: `LL.LeafArt.drawTree(ctx, R (+dx), w.building, {light: w.cheer, t, night: ambient.night})` with `R = layout.grid.building =
  {x, y, w, h, roofH, pad, rows, door: null}`: tree rect from the top pad down to `groundY + 4`, branch band `roofH` above `R.y`, trunks
  along the left / right pad. **Row vines** `R.rows[i] = {y, ye, x0, x1, sag, top}`: a quadratic from `(x0, ye)` with control point
  `((x0+x1)/2, ye + 2·sag)` to `(x1, ye)` (lowest point `y` in the middle; `top` = the row's leaf tops). Exact: `vineY(row, x) = ye +
  4·sag·u·(1 − u)`, `u = (x − x0)/(x1 − x0)`. **Do not sway the vines** (the leaf pivots sit on them; the leaves swing instead).
  `w.building = {bark, barkDark, moss, leaf, leafDark, vine, vineDark, flower, kind 'kapok'│'fig'│'palm', seed}`; `leaf` and `bark`
  always differ from the previous tree's.

### 2.2 Leaves `c` (all states drawn; matched leaves stay)
```
ctx.translate(c.px + dx, c.py); ctx.rotate(swing');            // pivot = stem top on the row vine
ctx.translate(0, c.stem + c.h / 2);                            // leaf centre (c.x === c.px)
LL.LeafArt.drawLeaf(ctx, c.w, c.h, c.face, open', { leaf: w.building.leaf, leafDark: w.building.leafDark, vine: w.building.vine,
  stem: c.stem, light: c.light, glow: c.glow, bloom: bloom', flower: w.building.flower, bounce: bounce', wiggle: c.wiggle,
  night: ambient.night, sprite, alpha });
```
`open'` 0 top side … 1 turned over (picture side), up to 1.12 overshoot (`sx = cos(open'·π)`). A hint lifts the leaf to ≈ 0.3–0.36.
`light` 0..1 sunbeam (golden rim + halo; stays). `bloom` 0..≈1.2 orchid on the stem 0.3·stem above the leaf top. `bounce` px: the FACE
hops up; `wiggle` rad: the face rotates (mismatch "no-no"). `w.cheer` 0..1 in the cheer phase (extra glow + garland). `c.seed` 0..65535.
`c.row` = its row index. The swing: `|swing| ≤ 0.14`.

### 2.3 Lolo (`w.lolo`, `layout.lolo = {x, y, h}` = seat / feet anchor)
Sitting (`!lolo.hang`), in this order: tail → body → head → arm.
```
X = layout.lolo.x + dx', Y = layout.lolo.y − hop'
ctx.translate(X, Y); ctx.rotate(lean'); ctx.scale(1 + squash', 1 − squash');      // squash about the feet
ctx.translate(0, −0.45·h); ctx.rotate(flipRot'); ctx.translate(0, 0.45·h);         // backflip about the body centre
// body frame: 1 px = h/256, the feet anchor (128, 244) at (0, 0)
tail  : LL.LoloArt.drawTail(ctx, (84−128)·h/256, (220−244)·h/256, h, tail', {side: 1})
body  : lolo_body_sit.svg (lolo_body_hop.svg while hop' > 4), h × h, feet anchor at (0, 0)
head  : head svg 0.6·h wide, joint (96, 172)/192 on the socket ((128−128)·h/256, (118−244)·h/256), rotated by
        LL.LoloArt.headTilt(lean', lookX, lookY, X, Y); frame by mood (happy │ cheer │ oops │ think while moodT > 0), blink 1 → blink,
        speaking → talk
arm   : (screen frame, after restoring) LL.LoloArt.drawArm(ctx, shX, shY, armA', armLen', {point: armExt' > 0.5})
        — shX/shY already include lean, hop and dx; armLen is already clamped off the leaves. While flipRot ≠ 0 draw the arm in
        the body frame at the shoulder (152, 136) with angle armRest (1.0) and length 0.3·h instead.
```
Fields: `mood, moodT, hop (px up), lean (rad, + = toward the right; ±0.16 target), armA (rad screen angle from the shoulder, 0 = right,
−π/2 = up, rest 1.0), armExt 0..1, armLen px (0.3·h rest → ≤ 0.55·h), shX, shY, lookX, lookY (eye / head target), blink 0│1, tail (phase
rad, faster when happy), squash (−0.15..0.15), flipRot (0 → −2π during the backflip), dx (px: −scrollT·W on the old log before the leap,
(1 − scrollT)·W on the new log after landing, else 0), hang (bool), vine (object │ null)`.
**Hanging** (`lolo.hang && lolo.vine`): `V = lolo.vine = {px, py, len, held, ang, hx, hy, ex, ey, vth, alpha, phase}` (screen px):
```
liana : a rope (2 tones of w.building.vine, ≈ 7 px, a few leaves) from (px', py) to (ex', ey'), globalAlpha = alpha'
        (held → ex = hx, ey = hy; before the grab it hangs straight down: ey = py + len; after the release it swings free, angle vth)
body  : ctx.translate(hx', hy'); ctx.rotate(ang'); lolo_body_hang.svg (h × h) with its hand point (128, 18) at (0, 0);
        head svg on the hang socket (128, 118); tail at (84, 200) with {hang: true}; no extra arm
```
`V.phase` ∈ `wait → leap → grab → fly → done`. After `land` the free liana stays (fading, `alpha` → 0 in 0.3 s) while Lolo sits again
(`hang = false`, `vine` kept until the scroll ends, then `null`): keep drawing the liana whenever `lolo.vine` is non-null.
Hit box: `w.loloBox()`. The keep-out: no leaf rect within 16 px of `layout.loloRect = 1.25·h × 1.15·h above the feet` (x centred).

### 2.4 Critters `w.critter` (null when none; drawn in front of the tree; toucan / butterfly also in front of the leaves)
- **toucan** — `toucan.svg` (`toucan_flap.svg` while `flap > 0.5` in flight), feet anchor (64, 120)/128 at `(x', y')`, width 72,
  mirror when `face = −1` (sprite faces right), rotate `rot'`, squash `sx/sy` about the feet, `bob` 0..1 dips the head/beak;
  `state fly → sit (on row vine perchRow at x, y = vineY) ⇄ hop (to another gap every 8–14 s) → away → gone`.
- **frog** — `frog.svg` (`frog_jump.svg` while `air`), feet anchor (64, 118)/128 at `(x', y' − hy')`, width 70, rotate `rot'`, squash
  `sx/sy` about the feet; `croak` 0..1 = throat puff (a pale bubble under the chin, radius ∝ croak); a soft floor shadow at `(x', y')`
  shrinking with `hy`; `y = groundY + 52`; `state in → stop → out → gone`; drawn in front of the tree, BEHIND Lolo.
- **butterfly** — `LL.LeafArt.drawButterfly(ctx, color, 60, flap)` centred `(x', y')` rotated `rot'`; `state rise → away (tapped:
  spirals up; add `weather.burst(x, y, {kind:'sparkle'})` on the tap event) → gone`.

### 2.5 Layout
`layout = {W, H, ins, portrait, tall, groundY, lolo, loloRect, loloSocket, loloShoulder, loloTail (rest anchors in screen px), loloRoom,
bubble, hud, boards (landscape [A]; portrait [A above Lolo, B right of her, C full with `lolo: true`]), board, safe, floor {y0, y1, frogY}, grid, hudKeep}`; `grid = {cols, rows, cw, ch, gap (= gapX), gapX, gapY, pad, x0,
y0, n, slots [{x, y, row, px, py, stem}], rect, board, boardIndex, minOk, building}`.

## 3. Content (DESIGN §6.1) — `LL.Content.makeRound(topic, {age, lang, rng, roundIndex, history, pairs?, pairsByAge?, peekByAge?})`
Pure and deterministic; `validate()` re-derives every pair from the faces (`facesMatch`) and rejects a round when a key is not on exactly
2 leaves, a pair does not match, any leaf also matches a leaf of another pair, a colour round below 6 has a clashing / pink colour, or the
colour-thing rule is broken; `makeRound` throws on a broken round (never in 96 000 test rounds).
`LL.ANIMALS` panda elephant rabbit squirrel bee bird hippo mouse · `LL.FOODS` panda–bamboo, elephant–peanut, rabbit–carrot,
squirrel–acorn, bee–honey, bird–worm, hippo–watermelon, mouse–cheese (`LL.FOOD_LIST`, same order) · no `HOMES` · `LL.THINGS` butterfly
balloon flower kite cup boot. `AGE_TOPICS` 3 colors/shapes/size/animals · 4 colors/shapes/count/food · 5 shapes/count/letters/food ·
6 lower/initial/add/count · 7 initial/add/sub/oddeven. `AGE_POOLS` 3 + count · 4 colors shapes count food animals size · 5 shapes count
letters food animals colors · 6 + letters · 7 + count. `DIFFICULTY` colors < animals < size < shapes < letters < count < food < lower <
initial < add < sub < oddeven.

| topic | pair key | faces |
|---|---|---|
| colors | `c:red` | 2 × `color {color, obj}` — ages ≤ 4 one thing for the whole round, 5+ two different things per pair; ≤ 3 pairs below 6 |
| **food** | `f:panda` | `{kind:'animal', value:'panda', sprite:'animal_panda', scale:1}` + `{kind:'food', value:'bamboo', sprite:'food_bamboo', animal:'panda'}`; name kinds `animal` / `food`; pairInfo `{nameKind:'animal', nameValue, animal, food}`; warm-up 2 pairs (CONFIG.pairsByAge) |
| initial | `I:P` | en panda P, elephant E, rabbit R, squirrel S, bee B, bird B, hippo H, mouse M (7 initials, ≤ 6 pairs by the 12-leaf cap); vi gấu trúc G, voi V, sóc S, ong O, hà mã H (thỏ chim chuột skipped); ≤ words − 1 pairs (vi 4) |
| shapes / size / animals / count / letters / lower / add / sub / oddeven | as Gigi | count dots = round berries |

Leaf names: `color` (+ `card.obj`), `shape`, `animal` (+ `card.size`), `food`, `dots`, `number`, `letter`, `sum`, `diff`.
Talk (`makeTalk`): **food "What does the {animal} love to eat?"** — `show` = the animal face, `params {animal, food}`, 3 choices
`{id, kind:'food', value, sprite:'food_<value>'}`; colours show a coloured thing (`params.obj`); animals "Where is the {animal}?" (show
null); the rest as Gigi.

## 4. Layout, grid, tree (DESIGN §2)
`groundY = H − ins.bottom − 90`. Lolo seat landscape `(ins.left + 110, groundY + 10)`, h 150; portrait `(ins.left + 100, groundY + 12)`,
h 140. `loloRect` = 1.25·h × 1.15·h above the seat, centred. Bubble / HUD as Gigi. **Boards**: from bubble bottom + 24 to groundY − 14.
Landscape x ≥ lolo.x + 130. Portrait **A** full width, bottom ≤ loloRect top − 46; **B** x ≥ loloRect right + 40; **C** full width
and height, last row right-aligned over Lolo (D5). Lolo portrait: tall phones h 170 at ins.left + 120, iPad h 140 at ins.left + 100 (D18).
**Grid**: every cols × rows with ≤ 2 empty slots in the last row (≥ 2 leaves there, board C ≥ 1) on every board; leaf w:h 0.78, gap x =
max(18, 0.16·cw), **gap y = max(30, 0.26·cw)**, **tree pad p = max(36, 0.32·cw)** left / right / top must fit the board (bisection per
shape; board C also its Lolo conditions). Choice: among the layouts whose leaf is within 8 % (`gridSizeTol`) of the largest (and ≥ the age
minimum when the largest is), the highest `size/largest + 0.5·fill − 0.5·offset − 0.02·empty` wins (`fill` = tree width share of the safe
width × tree height share of the play area, `offset` = |board centre − safe centre| / safe width); ties: squarer, lower board index, more
columns (landscape) / rows (portrait). Hit test: unrotated leaf rect + 10 px, nearest centre.
**Tree rect** = grid rect + p on the sides and the top, down to `groundY + 4`; `roofH = 0.34·cw`; it always lies inside the board, so
≥ 24 px inside the safe area (trunks must stay inside the pad); row vines §2.1 (each runs 0.35·p past the outer leaves; board C's short
last row starts at its first leaf, never over Lolo); no door.

Leaf widths (px, age 6; worst viewports):

| viewport | 2 pairs | 3 | 4 | 5 |
|---|---|---|---|---|
| iPhone portrait notch 720×1556 | 2×2 210 (A) | 2×3 170 (A) | 3×3 170 (A) | 3×4 163 (C) |
| iPhone landscape notch 1556×720 | 4×1 210 | 6×1 145 | 5×2 131 | 6×2 131 |
| iPad landscape insets 960×720 | 4×1 136 | 4×2 124 | 4×2 124 | 5×2 110 |
| iPad portrait insets 720×960 | 3×2 168 (C) | 4×2 131 (C) | 3×3 110 (C) | 4×3 110 (C) |
| 16:9 1280×720 | 4×1 198 | 4×2 143 | 5×2 143 | 5×2 143 |

The tuned game deals ≤ 3 pairs at ages 3–4 (smallest 124 px ≥ 120) and ≤ 5 at 5–7 (smallest **110 px** ≥ 104).

## 5. Motion (fixed 1/120 s sub-steps, semi-implicit Euler)
| element | model and numbers |
|---|---|
| scroll | `scrollT` = smooth-step(t / scrollTime), scrollTime 1.6 s (per-layout plan, ≤ 1.9); `scroll += W`; old tree at −scrollT·W, new at (1 − scrollT)·W; the critter shifts with the jungle; 0.15 s after it ends → peek |
| vine swing | plan per layout (cached): t 0–0.1 s the liana fades in; **leap** 0.2 s ballistic from the seat (hand point = seat − 0.883·h) with its apex at the grab point G; **swing** pendulum about P = (G.x, −30), length L = G.y + 30 (≈ 480–520 px landscape, 740–1 380 portrait), θ'' = −(g/L)·sinθ − 0.15·θ'; **release** at θ_R (15–25°); **flight** ballistic g 980 (her body rights itself: ang spring ω 8 ζ 0.8); **land** when the hand reaches the seat height at world x = seat + W: squash 0.15. Leap speeds 620–1 310 px/s (the camera does most of the screen motion: her screen x stays within ≈ 100–260 px) |
| peek / hide | leaves turn in slot order every 0.05 s; hold `peek` s once all are ≥ 0.95; turn back in reverse; `play` once every leaf < 0.5 and turning back |
| flip | spring on `open` → 1 / 0: ω 14, ζ 0.45; stop at 1.12 (v × −0.3); 0.95 in 0.19 s. Turning back: crossing 0 → `open = 0`, v × −0.25, `clack` when ≥ 4 /s; < 0.6 /s just stops |
| leaf pendulum | `swing'' = −4.2²·swing − 2·0.12·4.2·swing' + τ`; kick ±0.6 rad/s per child flip (sign `slot % 2 ? −1 : +1`, opposite when turning back), ±0.35 for a hint lift, **0.3 for the peek / hide waves** (a hide-wave kick opposes the current swing velocity), +0.55 cheer wave (slot order, 0.06 s apart); breeze torque τ = 0.0667·m·(0.3 + 0.7·sin(2π·0.31·t + phase)), m = max(|w.wind|, 9)·sign(wind) → ≈ 0.06 rad peak-to-peak sway at noon and at night, ≤ ≈ 0.07 rad at a 16 px/s gust; clamp ±0.14 (outward velocity → 0). Period 1.51 s; a single child kick peaks at 0.12 rad, decays to 5 % in 6 s; at play start every leaf is ≤ 0.130 rad |
| hint lift | the hinted face-down leaves open to 0.3 from 0.2 s to 0.65 s (peak ≈ 0.36), glow 6 s (in 0.2, out 0.4) |
| match | check when both ≥ 0.95; hold 0.25 s; `light` smooth-step 0 → 1 over 0.4 s; orchids at hold + 0.05 / + 0.2 s (bloom events), spring ω 14 ζ 0.45 → peak 1.20 → 1; faces hop twice (exact parabolas, 12 px apex, g 2000); back to `play` 0.4 s after the check |
| mismatch | faces wiggle `0.08·sin(2π·3u)·(1−u)²`, u = t/0.5 s; both stay turned **1.6 s (age 3: 1.8 s)** — the mismatch line names the 2nd leaf ≈ 1.5 s in — then turn back |
| cheer | 0.7 s after the last pair: phase `cheer` 1.2 s, `w.cheer = sin(π·t/1.2)`, every face hops 10 px + every leaf a swing kick in slot order 0.06 s apart, toucan leaves |
| backflip | at cheer + 0.1 s: ballistic jump `hop = v₀t − ½·1143·t²`, apex J = min(70, loloRoom) (airtime 2v₀/g = 0.70 s at 70 px), `flipRot = −2π·t/T` (constant spin), landing squash 0.15 (spring ω 16 ζ 0.35) |
| Lolo pose | lean spring ω 8 ζ 0.5 → 0.16·clamp(dx/120) for 3 s after a flip / tap / hint, then 0; armA spring ω 10 ζ 0.5 → atan2 from the shoulder to the leaf centre (rest 1.0); armExt spring → 1 / 0; armLen = 0.3·h + 0.25·h·armExt cut ≥ 4 px before any leaf rect; mood hops happy 14 px (1), cheer 26 px (3, × 0.7 each), capped by loloRoom; blink every 2.5–5 s for 0.12 s; tail phase 1.6 rad/s (3.6 happy / cheer) |
| toucan | quadratic-bezier flight in (control 0.25·d + 30 px above), 1.4 s, flap 7 Hz; lands on a perch = a row vine between two neighbouring leaves (or past a row's outer leaf when ≥ 24 px free) with a squash; bobs every 1.2–2.8 s (0.35 s); every 8–14 s flutters to another perch (0.8 s); tap → flies off up and out in 1.2 s (accelerating) |
| frog | from x = −40 at `groundY + 52`: hops 60–80 px long, apex 34 px (g 980, airtime 0.53 s), a hop every 0.6–0.9 s, landing squash 0.16 (spring ω 16 ζ 0.3), tilt −0.25·(v/v₀) in the air; the first landing at x ≥ max(W/2 − 40, loloRect right + 40 + 0.45·size) → `stop` 2.5 s, croak puff (0.4 s) every 0.8 s; then hops off right; tap → a 120 px jump in place (airtime 0.99 s, squash 0.22) |
| butterfly | from the floor in front of the leaves (15–85 % of the grid width) rising 45 px/s, x = x₀ + 26·sin(2π·0.5·t + φ) + 0.3·wind·t, flap 9 Hz (phase), rot = clamp(vx/200, ±0.3); tap → accelerates up (900 px/s²) to 380 px/s, spiralling ±30 px at 3 Hz → gone above the top. Colour = a palette colour not on the round's faces |

## 6. Rules (Gigi's, unchanged)
Taps turn leaves only in `play` and while a mismatch shows; ≤ 2 turned; turned / matched → `tap`; just after a match (≤ 0.4 s) other leaves
wait. Third tap after ≥ 0.5 s of a shown mismatch turns both back and turns the new one (counted once). 3 taps on the one turned leaf → auto
hint. Stars: ≤ max(1, pairs − 1) mismatches → 3, ≤ 2·pairs → 2, else 1; Talk right +1 (max 52). Hints: 2 mismatches in a row (cooldown 6 s,
glow 6 s); idle nudges 12, 30, 57, 87 … s (×1.5, ≤ 30 s gaps), hint from the 2nd. Chapter: 4 trees, Talk after ≥ 3 once the chapter passed
**75 s**. Adaptive hold after a hard round. **Surprise round**: round index 2 of every chapter, type `['toucan','frog','butterfly'][(level +
offset) % 3]` (offset random per session), **3–5 s** after play starts. `pointerDown` priority: toucan / butterfly core (or its whole box when no
turnable leaf is under the finger, D20) → leaf → Lolo → frog. Topics: `topicsFor(age, rng, last, last2)` (D22).

## 7. Timing (CONFIG)
`introTime 2.5`, `scrollTime 1.6` (+ `scrollSettle 0.15`), `peekByAge 2.8 / 2.2 / 2.0 / 1.5 / 1.5 × (0.6 + 0.1·leaves)`, `pairsByAge` 3: 2,2,2,3 ·
4: 2,2,3,3 · 5: 2,3,4,4 · 6: 3,3,4,5 · 7: 3,4,4,5, **`mismatchShow 1.6` (age 3: 1.8)**, `matchResolveTime 0.4`, `matchCelebrate 0.7`,
`cheerTime 1.2`, `roundDoneTime 0.8`, `talkAfterAnswer 2.0`, `levelDoneTime 2.0`, **`chapterTimeLimit 75`**, **`surpriseDelay [3, 5]`**.
The longer mismatch (+0.6 s per mistake) is paid back by the 75 s chapter limit (more chapters end after 3 trees); no other retuning.

## 8. Weather (`LL.Weather`, fixed 1/60 s steps; hard cap 140 particles, ambient ≤ 110)
`ambient = {skyTop, skyBottom, horizon, tint, wind, gust, windBase, sway, sun, sunX, sunY, moon, moonX, moonY, stars 0..1, darkness 0..0.45
(background overlay only), night 0..1 (leaf moon-rim, LeafArt opt.night), mist 0..1, rays 0..1 (sunbeams), cloudSpeed, mood, season (= mood),
rain 0, rainbow 0, wet 0}`; every number crossfades over 2.5 s (`setWeather(i)`), sunX/Y and moonX/Y are 0..1 of the screen.

| mood | sky top → bottom (horizon), tint | ambient | particles / extras |
|---|---|---|---|
| 0 morning | `#A9D3EA → #FBE3B4` (`#FCEBC8`), `rgba(255,214,160,.06)` | sun 1 at (0.2, 0.32), mist 0.7, rays 0.25, wind 4 + gust 5 | 6 dew `sparkle` (back) + 10 `pollen` drifting up; 3 slow clouds |
| 1 noon | `#6FBDE8 → #CDEBF5` (`#E4F3E2`) | sun 1 at (0.75, 0.12), **rays 1**, mist 0.1, wind 7 + gust 9 | 4 `leaf_a` + 4 `leaf_b` falling (tumbling `flipX`), 2 `dragonfly` (sprite `sparkle`: hover 0.6–1.6 s with a 7 Hz jitter, dash 0.25–0.4 s up to 260 px; `rot` = the dash direction) |
| 2 sunset | `#9F8CC9 → #F7A1A8` (`#FFB66E`), `rgba(255,150,90,.10)` | sun 0.9 at (0.82, 0.42), darkness 0.15, night 0.15, mist 0.3, rays 0.4 | **`wx.birds`**: a flock of 3–5 every 5–9 s (V shape, leader first) flying right → left at 70–100 px/s in the top 10–30 %; 5 `pollen` |
| 3 night | `#1E2A4A → #3A4F7A` (`#4A5F86`), `rgba(20,30,70,.10)` | sun 0, **moon 1 at (0.78, 0.16), stars 1**, darkness 0.45, night 1, mist 0.35 | ≤ 40 `firefly` (34 back + 6 front, Lissajous drift around a home point, blink: alpha = a0·(0.15 + 0.85·b²), size × (0.85 + 0.25·b)); 4 `pollen`; **`wx.stars`** 70 |

**Particle object (unchanged shape)**: `{sprite, x, y, size, rot, flipX, alpha, layer:'sky'│'back'│'front', kind, color?}` — draw:
`translate(x, y) → rotate(rot) → scale(flipX, 1) → sprite of width size centred, globalAlpha = alpha` (tint confetti by `color`; fireflies
and pollen look best with `globalCompositeOperation = 'lighter'`). Kinds: `leaf, sparkle, pollen, dragonfly, firefly, petals, confetti,
puff`. Sprites: `leaf_a leaf_b petal_a petal_b pollen firefly sparkle star puff confetti_a confetti_b` (`LL.Weather.SPRITES`).
`wx.clouds[] {sprite cloud1..3, x, y, scale, alpha}` (width 300·scale, centre); **`wx.birds[] {x, y, flap 0..1, s (wing span px), alpha,
vx, flock}`** — a dark V: wing tips at `(x ± s/2, y − 0.25·s·sin(2π·flap))`, body at (x, y); **`wx.stars[] {x, y, r, a}`** — a dot of radius
r, alpha `a·ambient.stars`. `wx.kites = []`.
`burst(x, y, {kind: confetti│puff│sparkle│petals, n, color, w})` — `petals` (default n 18) spread over ±w/2 around x, a gentle pop up
then a flutter down (terminal 40–70 px/s + sway), gone at the floor (`groundY + 40`) or after 2.6–3.6 s.

## 9. Bot (`LL.Bot`, DESIGN §6.6)
As Gigi: memory skill, reaction (0.9 − 0.5·skill)·U(0.8, 1.25) s, eased finger path, plays only via `pointerDown`; sees a face when a leaf
is fully turned (flip > 0.9) or a hint lift is open (> 0.25); aims ± 0.25·size, never on the critter's box; taps each new critter once with
p = `critterTaps` (0.2). Skill 1 never mismatches and never misses (test).

## 10. Playtest results (`node tests/sim/playtest.js --n 6`: 2 400 sessions = 10 drivers × 5 ages × 2 langs × 4 viewports × 6; 302 s; after the QA fix round)
| driver / age | session mean (p90, max) | chapter mean (p10–p90) | round | chapters cut to 3 trees |
|---|---|---|---|---|
| typical 3 | 401 s (428, 436) | 100 s (85–113) | 22.7 s | 20 % |
| **typical 4** | **383 s (406, 442)** | **96 s (85–108)** | 21.7 s | 21 % |
| typical 5 / 6 / 7 | 392 / 400 / 377 s (p90 ≤ 429, max 451) | 98 / 100 / 94 s | 21–23 s | 8–26 % |
| careful4 at 4 | 401 s (438, 473) | 100 s (87–115) | 26.2 s | 69 % |
| toddler 3 / 4 | 387 / 385 s (p90 414 / 405) | 97 / 96 s | 21–22 s | 9 / 24 % |
| slow3 3 / 4 (INFO) | p90 516 s | — | — | 96 % |

Typical: 0.8 mismatches / round, rounds with a hint 10–21 %, stars 46–49 of 52.
**Verdict** (all PASS): typical 4-year-old chapter **95.7 s** (60–100); child models at their ages (typical 3–7, careful4 3–5, toddler 3–4)
session p90 **436 s** (≤ 480); careful 4-year-old p90 **438 s**; typical sessions max **451 s**; 2 400 / 2 400 finished, **0 stuck rounds,
0 NaN, 0 errors**; Lolo keep-out + vine swing **0 / 878 431** checks; smallest leaf 110 px, 0 grids below the age minimum; 9 362 critters,
3 335 tapped. Determinism: all cases replay identically. Unit tests 42 / 42 — new since the first round: peek / hide never reach the swing
clamp, breeze sway at noon / night, critter-vs-leaf priority, frog clear of Lolo, rotation mid-swing → one `land` and she rides in on the
new log, topic rotation never repeats the last two sessions, board C fills the portrait screen and stays balanced, tree inside the safe area.
(First round, before QA: typical-4 chapter 95.2 s, p90 443 s, careful4-4 p90 459 s.)

## 11. Files
`game/js/rng.js` (mulberry32), `content.js`, `world.js`, `weather.js`, `bot.js`; `tests/unit/run.js` (+ `load.js`); `tests/sim/lib.js`
(harness + child models), `playtest.js`, `run_matrix.js`, `summarize.js`, `tune.js`, `determinism.js`, `content_stats.js`, `pt_*.js`.
`tests/sim/out/` holds generated reports.
