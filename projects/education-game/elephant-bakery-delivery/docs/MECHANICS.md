# Tupi's Bakery Delivery — Mechanics (API deviations, `BD.CONFIG`, layout, motion, render contract, events, playtest numbers)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js` (+ `tupi_points.js` from character artist A, read at
runtime with defaults). Contract: `docs/DESIGN.md` §2, §5.1–5.5 — **this file wins where they differ**. Tests: `node tests/unit/run.js`
(34 tests; `node tests/unit/run.js <name part>` runs a subset; `BD_BOT_N=50` bot sessions per age, forked on 2 workers, ≈ 3–4 min in all).
Sims (report-only, `tests/sim/`): `node tests/sim/hs_playtest.js [--n 40] [--ages 3,4] [--models typical,slow3,…] [--jobs 2] [--config '{…}']
[--tag x]` (→ `tests/sim/out/hs_<tag>.md/.json`; exit 1 on a stuck round / stuck state / NaN / cart off the road or screen / event off
screen / 2 wrong houses without a hint), `node tests/sim/content_stats.js [chapters]`, `node tests/sim/hs_browser.js` (the real page in
Playwright with `?bot=1`, once main.js is wired).

## 0. API — additions and deviations from DESIGN (read this first, integrator)
Every DESIGN §5.2 / §5.5 name exists with the DESIGN meaning. Additions and precisions:
1. **States / phases.** `menu → intro (2.5 s) → round [build → load → play ⇄ arrive → (return → load → play …) → party] → roundDone [wipe]
   → round [wipe (hidden map) → build] … → talk → levelDone (3.6 s) → … → sessionDone`. After a **wrong** house the phase goes `arrive →
   play` with `cart.state 'reverse'` (not interactive) until the cart is back at the fork. The `roundDone` event fires at the end of the
   party; the state is then `'roundDone'`, phase `'wipe'`; at wipe t = 0.5 the next round is prepared (state `'round'`, phase `'wipe'`,
   houses hidden, no road, the cart at the bakery door, `cart.alpha 0`), at t = 0.75 `build` starts. Talk time starts at the wipe's half.
2. **`interactive`** = state `round`, phase `play`, `cart.state` ∈ `wait | drag | coast` (auto-driving, reversing, returning: false).
3. **The map is per round AND per layout**: `World.genMap(layout, {ids, forks}, map.seed)` (cached). **The house width can shrink** from
   the age base (170 / 170 / 156 / 146 / 146) in 6 px steps down to 128 when the map does not fit; **the cart scales with the map's houses**
   (`cartS = 1.05 · roads.S`). So render.js must read **`w.roads.S` / `house.S`** for houses and **`w.cart.k`** (px per art unit) /
   **`w.cartExt()`** for the cart — `layout.houseS / cartS / cartK / hitR` are only the age defaults (menus, Talk time, before a map).
   `w.cartHit().r` = `w.roads.hitR` (≥ 100).
4. **`World.maxHouses(W, H, ins)`** = 3 on squat iPads (landscape narrower than 1000 px after insets, compact portraits), else 4. The world
   passes it to `Content.makeRound(…, {maxN})` (`round.maxN`). A 4-house round always has 2 forks (age ≥ 5); a map whose 2nd fork does not
   fit falls back to 1 fork (`w.roads.forks` is what was built; `cur.map.forks` what content asked).
5. **Two rule passes**: strict (house ≥ 24 px from the bubble / HUD / screen edge — DESIGN says 44, which leaves no room on a 960×720
   iPad —, branches ≥ roadW + 40 apart) then loose (12 px, roadW + 16: roads never touch). `w.roads.loose` tells which; `w.roads.ok` /
   `layout.fits` false only if both failed (never in the tests: 0 of 360 maps × 6 shapes × 5 ages). The **branch exemption around a fork
   is 160 px** (DESIGN: 120 — two branches leaving a fork towards houses 118 px apart cannot be 118 px apart 120 px out).
6. **Tupi's art may pass UNDER the speech bubble while driving** (the road band itself never does); at every stop (the start, each fork,
   each parking spot) the whole cart + Tupi art is clear of the bubble / HUD and on screen. **`w.cartUnderBubble()`** → main.js fades the
   DOM bubble while true (the river game's safety net). `w.cartBox()` = the art box now.
7. **The cart parks BESIDE the door**, not on it: each branch ends with a straight into the door point (DESIGN "each branch ends at its
   house's door" ✓) and the cart stops `roads.park` px before it (`edge.stopS`; Tupi's front just at the house's side, trunk towards the
   door). Arrival = `s ≥ stopS − 6` (DESIGN: `len − 6`). `house.side` −1 = parks left of the house (approach moving right), +1 = right.
   Landscape: always from the left. Portrait: rows of 2 park outwards, single houses towards their screen edge / towards their passage.
8. **The bakery's door is the tree root**; the cart waits at `roads.start` (`startS` px along the trunk, just right of the bakery). It can
   never be dragged back into the bakery (targets on the trunk are clamped to `s ≥ startS`). Portrait: the bakery sits at the bottom-left
   (`0.2` of the free width; compact portraits in the corner, 0.82 × houseS wide) and the trunk leaves it to the right.
9. **Taps while the cart drives itself are ignored** (`'soft'`): a house / road tap does not re-route an auto-driving cart (a spammer
   otherwise kept it dithering between houses forever — playtest P0). A press on the cart then returns `'busy'`.
10. **A tap on the cart is not a drive but counts as no progress** (never a miss): 3 honks → the drag demo hint, 5 → assist.
11. **Hints requested while not interactive** (the 2nd miss happens at the wrong house) are **pending** (`w._hintPending`) and shown as soon
    as the cart is back at the fork. The demo hint of the session's first delivery carries `demo: true`. Hints never cost stars.
12. **Rotation mid-round**: the drag is cancelled and the cart **stops** (no coast to the old finger point); an auto-drive keeps its house;
    `return` / `rollout` keep the start; anything else keeps its fraction. Houses, flyers, the mouse / bird are re-placed.
13. **Road length** start → house ≥ 0.55 × the play diagonal is a **soft** rule (preferred in the first 16 attempts per size): met by
    ≈ 58 % of maps (median 0.57); squat iPads cannot fit it with 3 houses.
14. **Extra fields / hooks**: `World.genMap`, `World.maxHouses`, `World.tupiPoints()` (TUPI_POINTS with defaults), `World.cartExtent(k)`,
    `World.boxDist`, `BD.Roads.{gen, at(edge, s), curvature, path(R, e1, s1, e2, s2), project(R, x, y, preferEdge, hyst), edge(R, id)}`,
    `w.cartPoint(u, v, 'tupi'?)` (an art point → world px with the current pose), `w.cartExt()`, `w.cartHitR()`, `w.cartBox()`,
    `w.cartUnderBubble()`, `w.flyers[]`, `w.trail[]`, `w.hintHouse`, `w.roadReveal`. `answer()` → `{houseId, id}`; `targets()` → `[houseId]`.
15. **Weather layers**: `'back'` (outside, clip to `wx.window`), **`'table'`** (settled petals / leaves, glints: draw after the roads, before
    the bakery), `'front'`. `wx.window {x, y, w, h}` is an estimate (centred in the wall) — use the env RECIPE's window if it differs.

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. **Screen space = world space** (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s per call, so `?speed=N` works). At the start of every
  sub-step each moving value is copied into its `_p` twin; render `v = _v + (v − _v)·w.alpha`.
- Determinism: content, map seeds and surprise rounds from the world's seeded `BD.RNG`; the map from `map.seed` alone (+ the layout);
  cosmetic randomness (puffs, sprinkles, blinks, surprise spots) from a second generator; the wind from a third. Same seed + inputs → the
  same events (unit-tested).
- Motion = damped springs (`spring(o, k, kv, target, ω, ζ, h)`, semi-implicit Euler); `World.kickFor(peak, ω, ζ)` = the initial
  velocity whose first spring peak is `peak`.

## 2. Public API (`BD.World`)
`new BD.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (no-op when nothing changed; set
`world.hudKeep = [{x,y,w,h}…]` then call it again), `setAge` / `setLang` (apply at the next `newSession`), `newSession({lastTopics})`,
`levels`, `startLevel(i)`, `update(dt)`, `drainEvents()`, `pointerDown / pointerMove / pointerUp(x, y)`, `cancelDrag()`, `hint()` →
`{houseId}` | null, `talkAnswer(choiceId)` → bool, `prompt()` → `{promptKey, params, rule, nameKind, nameValue, cargo, orderIndex, left,
houseId, count?}` while interactive | null, `resetNudges()`, `skipTalk()`, `houseById(id)`, `answer()`, `targets()`, `route(houseId)`,
`cartHit()` `{x, y, r, cx, cy}`, `houseHit(id)` `{x0, y0, x1, y1, cx, cy, x, y, w, h}`, `mouseHit() / birdHit() / snowHit()` `{x, y, r}` | null.
Fields: `layout, hudKeep, state, phase, level, levels, topic, round, cur, roundsPerLevel, stars, levelStars, roundStars, misses, streak,
talk, talkAnswered, alpha, stateTime, phaseTime, interactive, weather (= level % 4), wind, gust, houses, roads, roadReveal, cart, tupi,
order, orderObj, flyers, sprinkles, puffs, mouse, bird, snowflakes, hintHand, hintEdges, hintGlow, hintHouse, assistId, wipe, surprise,
finger, trail`.

**Input (one active pointer; a gesture = down … up), logical px:** `pointerDown` → `'cart'` (grabbed: every `pointerMove` projects the
finger onto the nearest road point within roadW/2 + 140, hysteresis 18 px on the current edge; farther → the last target is kept) |
`'house'` / `'road'` (auto-drive; a road point past 80 % of a branch → into that house) | `'assist'` | `'mouse' | 'bird' | 'snow'` |
`'busy'` (the cart while it drives itself) | `'tupi'` (the cart outside play: a poke on release) | `'soft'` | null (not in a round).
Order: assist armed → any press drives to the right house; surprises (when not on the cart); the cart (≤ hitR from its centre); a house
(box + 30, + 60 up); a road (≤ roadW/2 + 26); else soft. `pointerUp` → `'honk'` (cart press < 24 px and < 0.35 s) | `'pokeTupi'` |
`'up'` | null. Release after a drag: the cart rolls on v²/(2·2600) px (never past the finger's point) and stops; past 80 % of a branch it
auto-rolls into that house.

## 3. Layout (`computeLayout`, DESIGN §2) — then the map (`genMap`)
| field | landscape | portrait | compact portrait (usable H / W < 1.6: iPad 4:3) |
|---|---|---|---|
| `bubble` / `hud` | bubble y = ins.top + 18, h 134, w ≤ 700 (− 200 right); HUD 160 × (ins.top + 96) | y = ins.top + 110, h 124, full width | beside the HUD: y = ins.top + 18, h 124 |
| `wall` / `table` | wall 0 … 0.30·H | 0 … 0.20·H | same |
| `play` | x ins; y0 = max(table.y, band bottom + 12); y1 = H − ins.bottom − 6 | y1 = H − ins.bottom − 10 | same |
| `bakery` / `door` / `start` | 1.1·houseS wide (aspect 240/260) at x ins.left + 20, centred in play y (pushed below the bubble so the bakery top and the waiting cart clear it); door = its bottom centre; start = door + startS (bakery half + cart left extent + 8) along the trunk | bottom, 0.2 of the free width from the left; door on the play bottom − roadW/2 − 6 | 0.82·houseS, in the corner |
| `houseS`, `roadW` | age 3–7: 170 / 170 / 156 / 146 / 146; road 78 (≤ 4) / 68 (5+), phones × 1.05, compact × 0.88 | | |
| cart | `cartS = 1.05·S` = the composite (cart + Tupi) art width (`TUPI_POINTS.cart.box`, 344 units) → `k = cartS / 344`; extents left 168k, right 176k, up 312k | | |
| `hitR` | max(100, 0.6·cartS + 14) | | |

**Map (per round, per layout; `BD.Roads.gen`)** — rejection-sampled structured patterns, every rule checked; house width from the age base
down to 128 (6 px steps), then the loose pass; 26 attempts per size:
- **Landscape**: up to 3 staggered columns at the right (door x of the right column = W − ins.right − 24 − S/2, then −(S + 24 + ≤ 26) per
  column). Every column sequence top → bottom is tried: a house to the RIGHT of the one above needs `max(roadW + 40, up − 0.3·S + 4)` px
  (its road passes under that house), any other order the house height + roadW/2 + 12; the sequences that fit (house tops below the
  bubble / HUD + 24, parked carts clear of them, fork room ≥ 130 px) are kept, fewer columns preferred, slack spread at random. Each
  branch: fork → **lane** point (its house's height, `max(180, 1.25·|Δy|)` px after the fork, scaled down on narrow screens) → straight in.
- **Portrait**: rows (bottom → top) of 1–2 houses, patterns per n (`[2]`, `[1,1]`, `[2,1]`, `[1,2]`, `[1,1,1]`, `[2,2]` …). A row of 2 parks
  outwards (roads rise along the screen sides), a single house sits left / right (alternating) and parks towards its edge, the lowest row
  away from the bakery; upper rows' roads rise through the **passage** of each row below (the centre of the inner free interval), then a
  **riser** 46 px out and 60 px below the parking straight turns them in. With one fork, roads sharing a passage get their own lanes in it
  (`sep` apart, ordered by destination; a pattern whose passage is too narrow is dropped). Row gap = house height + roadW/2 + 8 + 60
  (+ 180 when a pair above a pair must split); the lowest row stays above the bakery top − (roadW/2 + 8 + 60 + 40). A top house too
  close to its passage moves sideways so it can park towards it. **On 720-wide portraits a row of two needs S ≤ 134**, so rounds with
  3–4 houses use S 128–134 there (2 houses: the full 170); landscape phones keep 146–170.
- **Forks**: f1 between the start and the lanes / risers (portrait: always right of the bakery); f2 (age ≥ 5, round ≥ 2 or
  4 houses) on a pair: landscape two neighbours by height, portrait the pair sharing all passages (f2 just above them).
- **Curves**: tangent-continuous cubic pieces through the waypoints (handles 0.38·d), departures fanned 0.9 rad apart at a fork (25 %
  towards each branch's own direction),
  optional seeded wiggles on legs > 260 px, resampled every 8 px (`pts`, `cum`), sugar bumps every 140 px (`edge.bumps`).
- **Rules** (independently re-checked by the unit test on 6 shapes × 5 ages × the round sizes × seeds): houses on the safe screen, ≥ 24
  px (loose 12) from the bubble / HUD / screen edge, ≥ 24 px apart (centres ≥ S + 24), ≥ 40 px from the bakery; parked cart, start and
  forks: the whole Tupi art on screen and clear of the bubble / HUD, a parked cart never over another house's sign; road centre lines on
  the table, their band clear of the bubble / HUD; the driving cart on screen everywhere; roads ≥ roadW/2 + 8 from every other house and
  from the bakery; branches ≥ roadW + 40 (loose + 16) apart beyond 160 px of a shared fork; no kink > 0.5 rad between 8 px segments; no
  self-loop; every house reachable (depth ≤ 2 forks). 0 invalid maps in the unit test (240), in a 480-map survey (6 shapes × 5 ages ×
  round sizes × 8 seeds: ≈ 21 % need the loose pass, mostly squat iPads) and in every sim round.

## 4. `BD.CONFIG` (all tunable via `new BD.World({config})`)
| group | values |
|---|---|
| flow | step 1/120, roundsPerLevel 4, chapterTimeLimit 75 s (after ≥ 3 rounds), **shortBudget [∞, 32, 50, 58] s** (a round starting later into the chapter is short: 2 houses × 1), introTime 2.5, levelDoneTime 3.6, Talk: afterAnswer 1.6, re-ask 12 s, glow after the 2nd, Tupi answers 2 s after the 3rd |
| drag | vDrag 900 px/s, approach v = min(900, 9·dist), accel ≤ 2600 px/s², brake ≤ v/0.15 (6000 px/s²); projection radius roadW/2 + 140, hysteresis 18 px; tap = < 24 px & < 0.35 s; release: coast v²/(2·2600); auto-roll past 80 % of a branch |
| auto | vAuto 520 (taps, assist, auto-roll, coast), vReturn 700, vReverse 380, vRollOut 320; v = min(vmax, √(2·2600·d) + 30) |
| pose | lean = clamp(−3.2e-5·accel·fwd + 5.5e-5·κ·v²·face, ±0.16) → spring ω 12 ζ 0.5 (art frame, < 0 nose up); bounce spring ω 18 ζ 0.3 (bump: peak 6 px × clamp(v/500, 0.3, 1.2)); squash spring ω 16 ζ 0.35 (brake 0.1, bump −0.06, landing cargo 0.04); cargoHop ω 14 ζ 0.25; faceS → face at 2/0.18 per s, hop = 8·(1 − faceS²) px; face = sign(dir.x) when |dir.x| > 0.3 (locked while reversing); wheels: wheelRot += fwd·ds / (wheel r·k); dust puffs every 0.07 s above 260 px/s; `drive {on}` above 40 / below 10 px/s |
| build / load | road reveal 1.0 s (ease-out by the arc distance from the root, `roads.maxDist`), houses pop 0.35 s (back-out) when the reveal reaches them, roll-out at 0.45 s from 0.35·startS; build ≥ 1.6 s; load 0.9 s (the cargo arcs 0.5 s from `layout.oven` to the tray), cookies: one every 0.45 s (`count`), 0.6 + 0.45·n s |
| right (2.1 s) | door opens 0.12–0.42, cargo hops tray → door 0.35 + 0.5 s (`deliver`), friend pops 0.3 s and waves, windows light 0.4 s, 3 heart puffs from 0.95 s every 0.18 s (`hearts`), door closes 1.75–2.05; then `return` (or `party`) |
| wrong (1.1 s) | bounce 7.2 px + house squash, door crack 0.25 (0.1–0.9 s), friend peeks 0.2 s (pop 0.6, head shake ± 0.18 rad), then reverse to the fork |
| party (2.4 s) | honk 0.6 s, then spray to 2.0 s: 48 sprinkles/s from `trunkTip` at −70° ± 18° (mirrored), 380–560 px/s, gravity 900, one bounce (× −0.35) on a floor near the cart, rest 0.55 s, cap 80; delivered houses lit + 2 heart puffs; `roundDone` at 2.4 s |
| help | hint after 2 misses (each further miss) or 3 no-progress presses (soft taps, honks); assist after 5 no-progress or 3 misses; hint glow 5 s, cooldown 6 s, ghost hand: 1.6 s × 2 drags along `route()`; idle 12 s × 1.5 up to 30 s (12, 30, 57, 87, 117 s after the ask), the 2nd idle hints; warm-up demo 0.6 s after the session's first ask |
| surprises | rounds [1, 2], chapters 0–2 mouse / bird (rotating, random start), chapter 3 snow; 2–5 s after the round's first ask. mouse: a table spot ≥ 90 px from roads / houses / bakery, peek 0.4 s, stays 10 s, tap r 62 → wave 0.8 s; bird: on the wall's sill (0.86·wall.h, else higher / the table's back edge) off the bubble / HUD, in 0.5 s, 12 s, tap r 58 → sings 1.2 s + hops; snow: 5 flakes r 36, 0.7 s apart, ≈ 12 s fall |
| wind (`BD.WindModel`) | breeze 6 / 6 / 8 / 10 px/s²; autumn gusts first after 3–6 s, then every 6–10 s, ± 40–60, 1.5 s, `gust {dir}` |

## 5. Render contract (what render.js reads; use `_p*` + `alpha` for every moving value)
- **Wall / window**: `layout.wall`, `weather.ambient` (sky, sun inside `weather.window`, `beam` 0..1 = warm light shafts over the table),
  `weather.clouds` (clip to the window), particles `layer 'back'` (clip to the window).
- **Table**: `layout.table`, `TableArt.drawTable(ctx, layout, season, {keep: [bakery box, house boxes, layout.keep…], seed: roads.seed})`.
- **Roads**: `TableArt.drawRoads(ctx, w.roads, layout, {reveal: w.roadReveal (interpolate with w._proadReveal), glowEdges: w.hintEdges,
  glow: w.hintGlow (_phintGlow), trail: w.trail, snow: weather === 3 ? 1 : 0})`. Per edge: `pts` (8 px), `cum`, `len`, `d0` (arc distance
  of pts[0] from the root: reveal by `(d0 + cum) / roads.maxDist ≤ reveal`), `bumps` (s of each sugar bump), `roads.key` for the bitmap cache.
  Width = `layout.roadW`.
- Then particles `layer 'table'`, the bakery (`layout.bakery`, door `layout.door`, oven glow at `layout.oven`).
- **Houses** `w.houses[]` back-to-front by `y` (skip `appear ≤ 0`): origin = the door `(x, y)`, size `house.S`:
  `HouseArt.drawHouse(ctx, S, {seed, color, sign: house.sign, door, lit, glow, active, squash, snow, alpha: appear})` scaled by `s`
  (pop with overshoot) about the door; `house.side` = where the cart parks. **Friend** `house.friend {animal, pop 0..1 (_ppop), wave 0..1,
  shake (rad, _pshake), state 'wait'|'peek'|'out'|'in'}` — draw `animals/<animal>` (+ `_step` when wave > 0.5) rising out of the door by
  `pop`, rotated by `shake`. **Puffs** `w.puffs[] {kind 'heart'|'dust', x, y, r, a, rot}` → `drawHeartPuff(ctx, r, a)` / a soft dust disc.
- **Mouse** `w.mouse {x, y (feet), peek 0..1, wave 0..1, s, state}` → `characters/mouse(_wave).svg` (feet 70, 114), revealed by `peek`.
- **Cart** `w.cart`: ground `(x, y − bounce − hop)`, then `scale(faceS · sx, sy)` → `rotate(lean)` (both about the ground point; art
  scale `k`, art frame facing RIGHT, ground anchor `TUPI_POINTS.cart.ground`), `alpha`. Compose: shadow → `cart_back` → Tupi
  (`characters/tupi_<w.tupi.frame>.svg` with its seat anchor on `cart.seat`) → cargo → `cart_front` → wheels (`wheel.svg`, r = wheel r · k,
  rotated by `wheelRot`, at `cart.wheels`). **Cargo** `cart.cargo` (thing) at `cart.tray` raised by `cargoHop`; cookies: draw
  `{kind:'cookies', n: cart.cargoCount}`. Tupi: `tupi.mood` / `frame` (`idle blink talk happy cheer think oops honk spray wave giggle
  hand`), `look` (rad, ± 0.5, optional eye offset). `w.cartPoint(u, v, 'tupi')` maps an art point to world px (e.g. `trunkHold` for the
  treat in the `hand` frame).
- **Flyers** `w.flyers[] {thing, kind 'load'|'deliver', x, y, s, rot}` → `HouseArt.drawThing(ctx, thing, size, …)` (centre-bottom at x, y).
- **Sprinkles** `w.sprinkles[] {kind 0..5, x, y, r, rot, a}` → `HouseArt.drawSprinkle(ctx, kind, r, rot)`.
- **Bird** `w.bird {x, y (feet), hop (px up), sing 0..1, a, s, face ±1, state}` → `bird(_sing).svg` (feet 60, 94).
- **Snowflakes** `w.snowflakes[] {x, y, r, rot, a, tw}` (skip state `'wait'`) → `drawSnowflake(ctx, r·(1 + 0.3·tw), rot, a)`.
- **Hint hand** `w.hintHand {x, y (fingertip), press 0..1, alpha, demo}` → `drawHintHand`. **Wipe** `w.wipe {t 0..1, dir {x, y}, season}`:
  the curtain covers the screen around t = 0.5; call `weather.wipeParticles(dir)` on the `wipe` event. Front particles, fx, banner.
- Every moving field has a `_p` twin: cart `_px _py _plean _pbounce _pfaceS _phop _pwheelRot _psquash _palpha _pcargoHop`; house
  `_px _py _pappear _ps _pdoor _plit _pglow _psquash` (+ friend `_ppop _pshake`); flyers `_px _py _ps _prot`; sprinkles `_px _py _prot _pa`;
  puffs `_px _py _pr _pa`; snowflakes `_px _py _prot`; mouse `_px _py _ppeek _pwave`; bird `_px _py _phop _pa`; hint hand `_px _py`;
  `w._proadReveal`, `w._phintGlow`, `w.tupi._plook`, `w.wipe._pt`.

## 6. Events (`drainEvents()`; every positional event has `x, y` in logical px, clamped on screen — unit-tested over 250 bot sessions)
| event | when / fields | main.js should |
|---|---|---|
| `session` | `{levels}` | — |
| `level` | `{level, topic, weather}` | `weather.setWeather(weather)`, banner, `weather.N` line |
| `round` | `{round, topic, surprise, n, d, forks, short, key}` build starts | road pour (icing squeeze) |
| `house` | `{houseId}` a house pops up | plop |
| `rollOut` | the cart leaves the bakery | little bell |
| `load` | `{cargo}` (x, y = the oven) | oven ding + pomf |
| `count` | `{i (1-based), n}` 0.45 s apart while cookies hop in | pip + `sayCount(i)`; at i = n `sayCountRun(n, 'cookies')` |
| `ask` | `{promptKey, params, rule, cargo, first, orderIndex, left, round, n, d, houseId, count?}` (x, y = Tupi's mouth) | `speakPrompt(I18N.ask(lang, promptKey, params, {first}))` |
| `grab` | the cart is held | tiny squeak |
| `drive` | `{on}` the cart starts / stops moving | pedal / motor loop on / off |
| `bump` | a sugar bump | bonk (tiny) |
| `fork` | `{node}` the cart passes a fork | ting |
| `autoDrive` | `{houseId?}` a tap on a house / road | — |
| `right` | `{houseId, cargo, rule, orderIndex, left (orders left after this), misses, count?, home?}` | brake squeak, door creak-ding, `sayRight` |
| `deliver` | `{houseId, cargo, animal}` the treat reaches the door, the friend pops out | ta-da + the friend's cheer, `thanks[]` |
| `hearts` | `{houseId}` (x, y = the chimney) | bloop |
| `back` | the cart drives back to the bakery | — |
| `wrong` | `{houseId, sign, got {nameKind, nameValue}, want {kind, value, nameKind, nameValue, promptKey, params, cargo, houseId, count?}, streak, misses, cargo, hint?}` | soft boing-boing, `sayWrong` |
| `reverse` | the cart backs up to the fork | beep-beep (soft) |
| `honk` | `{promptKey, params, rule, left, cargo, count?}` a tap on the cart in play | trumpet toot + the question again |
| `pokeTupi` | `{promptKey, params, left}` or `{busy: true}` | giggle |
| `soft` | a press on nothing | crumb "tk" + `weather.burst(x, y, {kind: 'crumbs'})` |
| `hint` | `{houseId, edges, want, idle?, demo?}` | `hint[]` (demo: the `drag` line) |
| `assistArmed` / `assist` | `{houseId}` | — |
| `idle` | `{n, promptKey, params, rule, cargo, left, count?}` | `idle[]` / the question again |
| `party` | the last delivery done (x, y = Tupi) | trumpet, `party[]` |
| `spray` | the sprinkle fountain starts (x, y = the trunk tip) | fizzy sparkle |
| `roundDone` | `{round, stars, misses, assisted}` (x, y above Tupi) | stars fly to the HUD |
| `wipe` | `{season, dir}` | whoosh, `weather.wipeParticles(dir)` |
| `mouse` / `mouseTap` | — | squeak; `surprise.mouse` / `mouse.tap` + flour puff |
| `bird` / `birdTap` | — | chirp; `surprise.bird` / `bird.tap` (song) |
| `snow` / `snowTap` | `{n}` / — | twinkle; `surprise.snow` / `snow.tap` |
| `gust` | `{dir}` (autumn) | wind swell |
| `talk {talk}`, `talkAsk {n, talk, glowAnswer}`, `talkResult {correct, choiceId, answerId, auto}`, `levelDone {level, stars}`, `sessionDone {stars}` | as the river game | as the river game (sessionDone: Tupi `spray`, `weather.setParty(true)`) |

## 7. Content (`BD.Content`, DESIGN §5.1)
- (houses n, deliveries d): session warm-up (chapter 0 round 0) and short rounds (2, 1); age 3 (2,1) (2,2) (3,1) (3,2); age 4 (2,1) (3,2)
  (3,2) (3,2) — chapter 0: (2,1) (2,2) (3,2) (3,2); age 5 (3,2) (3,2) (4,2) (4,3); 6+ (3,2) (4,2) (4,3) (4,3); n ≤ `maxN`; size / oddeven
  always 2 houses; forks 2 from age 5 at round ≥ 2 or with 4 houses.
- **Self-check** (`validate`, its own matcher `matches(round, cargo, sign)`): sizes per table, distinct house signs, every order matches
  EXACTLY one house = its target, the d orders target different houses, CVD pairs + no pink below 5, topic rules (colours: houses
  coloured = their sign, warm-up cupcakes, a different treat per order from age 4; shapes: never square/rect, circle/oval, square/diamond,
  heart/circle, one icing colour below 5, age 5 every house its own colour and the cargo in yet another one; size: one treat, a big and a
  small house; count: numerals 1–4 / 1–5 / 1–8 / 4–12, the warm-up never neighbours; animals: farm animals at age 3 / round 0, homes
  later; letters / lower / initial: no look-alikes, lower = small signs + capital cargo, never l / I, b d p q together; initial: the
  cargo's name's first letter in THAT language (classifiers con / cái / quả / chiếc / cây / bông / bánh dropped, digraph words never used);
  add / sub: tiles in range; oddeven: `@odd` / `@even` signs, cookies 2–10).
- `makeRound` retries until valid, never the same round twice in a chapter (`usedKeys`), the first ask differs from the previous round's
  last (`prevRule`). `content_stats.js 200`: **20 000 rounds, 0 invalid, 0 % repeated rounds, 0 % repeated first asks**, 0.01–0.07 ms per
  round. Unit test: every topic × age 3–7 × 120 seeds × 4 rounds × EN / VI (26 400 rounds) with an independent matcher.

## 8. Playtest numbers
`node tests/sim/hs_playtest.js --n 40 --tag final` — **1 295 sessions** (12 models × ages 3–7; typical / slow3 40 per age, kid 30, others 20),
1/30 s frames through the real input API (presses, drags along the road with wobble, lifts, taps) on the 6 shapes (iPhone 720×1556 /
1556×720 with the notch, iPad 960×720 / 720×960 with insets, iPad Air 1036×720 / 720×1036), EN / VI alternating; 275 s on 2 cores.
**Every model, every age: 0 failed sessions, 0 rounds > 120 s, 0 stuck states, 0 NaN, 0 frames with the cart off the road or Tupi off
screen, 0 events off screen, 0 "2 wrong houses without a hint", 0 repeated rounds.** Maps: 16 011 strict + 1 650 loose; the 16 that
failed both passes (phone portrait, 3 houses, one too-sharp sample) are fixed by a last 60-attempt series (re-checked: 0 / 3 200).

| model | age | session min mean (p90, max) | chapter s mean [p10–p90] | round s mean | ask → delivery s | stars 3/2/1 % | wrong / honk per round | hint rounds % (assist %) | houses × deliveries | mean house S |
|---|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 6.5 (6.9, 7.1) | 93.5 [83.5–107.5] | 24.4 | 12.1 | 63 / 24 / 14 | 0.52 / 0.17 | 15 (3) | 2.07 × 1.27 | 164 |
| **typical** | **4** | **6.4 (6.7, 6.8)** | **92.0 [83.2–100.1]** | 23.6 | 9.5 | 77 / 18 / 5 | 0.27 / 0.15 | 5 (0.2) | 2.35 × 1.42 | 156 |
| typical | 5 | 6.3 (6.6, 6.8) | 91.5 [84.4–100.2] | 23.4 | 8.6 | 78 / 17 / 5 | 0.26 / 0.08 | 5 (0.2) | 2.54 × 1.49 | 148 |
| typical | 6 | 6.3 (6.6, 6.9) | 91.2 [83.3–99.2] | 23.8 | 7.9 | 82 / 14 / 4 | 0.24 / 0.06 | 4 (0.7) | 2.61 × 1.57 | 141 |
| typical | 7 | 6.3 (6.6, 6.7) | 90.7 [83.5–99.3] | 23.1 | 7.6 | 85 / 13 / 3 | 0.19 / 0.07 | 3 (0.4) | 2.52 × 1.57 | 142 |
| botT0.8 (toddler-paced BD.Bot) | 3–7 | 6.0–6.3 (≤ 6.6) | 87.0–90.6 | 19.6–23.1 | 7.4–7.7 | 73–78 / 14–20 / 5–8 | 0.33–0.39 / 0 | 5–8 | 2.23–2.63 × 1.36–1.58 | 141–160 |
| slow3 | 3 | 7.3 (8.0, 8.1) | 105.5 [89.0–124.5] | 31.0 | 18.3 | 55 / 25 / 20 | 0.70 / 0.32 | 22 (6) | 2.01 × 1.21 | 166 |
| slow3 | 4 | 7.6 (8.2, 8.4) | 110.1 [91.0–128.9] | 32.6 | 19.1 | 53 / 25 / 22 | 0.74 / 0.33 | 26 (6) | 2.16 × 1.23 | 162 |
| kid0.3 | 3–7 | 7.0 (≤ 7.8, max 8.0) | 101–102 | 29.7–30.3 | 14.0–17.1 | 27–29 / 15–22 / 50–57 | 1.3–1.5 / 0.1–0.2 | 51–58 (13–18) | | |
| offroad (drags straight at the house) | 3–7 | 6.4–6.6 (≤ 7.5) | 92.7–95.9 | 25.0–27.5 | 9.8–13.9 | 58–83 / 11–21 / 6–22 | 0.2–0.8 / 0.1–0.2 | 6–22 | | |
| tapper (random) | 3–7 | 6.4–6.7 (≤ 7.3) | 92–96 | 25.9–27.5 | 12.2–13.0 | 33–39 / 30–41 / 25–36 | 1.0–1.2 / 0.4–0.5 (+ 9.5–10.8 soft) | 58–64 (37–47) | | |
| spammer (6 presses / s) | 3–7 | 6.2–6.3 (≤ 6.8) | 89–91 | 21.6–24.7 | 9.8–10.3 | 30–41 / 22–30 / 29–41 | 1.0–1.5 / 0.9–1.2 (+ 44–55 soft) | 40–55 (23–40) | | |
| bot0.5 | 3–7 | 5.5–6.0 (≤ 6.7) | 78.6–87.1 | 18.2–22.6 | 5.6–6.3 | 35–43 / 21–27 / 36–43 | 0.97–1.15 | 36–43 (5–10) | | |
| perfect | 3–7 | 5.3–5.9 | 76–85 | 17.7–23.3 | 5.1 | 100 / 0 / 0 | 0 | 0 | | |
| bot1 (quick) | 3–7 | 4.4–5.6 | 63–80 | 14.2–19.2 | 2.8 | 100 / 0 / 0 | 0 | 0 | | |

- **Targets met**: a typical child and the toddler-paced bot play 87–94 s chapters (target 60–100 s), sessions 6.0–6.5 min (p90 ≤ 6.9;
  target ≤ 8 min). A typical age-4 round (23.6 s) = build 1.6 s + load 0.9 s + listening / thinking + driving (ask → delivery 9.5 s) +
  the delivery 2.1 s (+ the way back ≈ 1.3 s and the next load for 2-order rounds) + party 2.4 s + wipe to the next build 1.0 s.
- **slow3** (skill 0.6, thinks 2.8–6 s, drags 150–320 px/s, stops half way 45 %, looks away 15 %) needs 7.3–7.6 min, p90 8.0–8.2 min:
  93–95 % of its chapters end after 3 rounds by the 75 s rule and 45 % of its rounds are short (2 houses × 1). No fail state.
- Short rounds: 30–45 % of typical rounds (round 3 of a chapter that passed 58 s); the chapter limit ends 43–52 % of typical chapters
  after round 3. 2-fork maps: 3–11 % of typical rounds at ages 5–7 (shorter rounds have 2 houses).
- Help: a typical 4-year-old sees a hint in 5 % of rounds; the random tapper / spammer get the hint (≈ 60 %) and the assist (≈ 40 %);
  a spammer's taps never re-route the cart once it drives itself (fix during this run: before, its rounds took up to 358 s).
- Surprises: 28 % of rounds; a typical child taps ≈ 65 % of them. Idle nudges for an absent child: 17, 35, 62, 92, 122, 152 s into the
  session = 12, 30, 57, 87, 117, 147 s after the ask (the 2nd and later also hint); a round waits for the child (no auto-play).
- Content: `content_stats.js 200` — 20 000 rounds, 0 invalid, 0 % repeated rounds in a chapter, 0 % repeated first asks.
