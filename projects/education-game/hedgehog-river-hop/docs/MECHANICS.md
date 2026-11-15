# Nim's River Hop — Mechanics (`NH.CONFIG`, layout, motion, render contract, events, playtest numbers)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js` (+ `nim_points.js` from character artist A, read at
runtime; `river_art.js` from the environment artist, `NH.RiverArt.flowDir` read by the weather). Contract: `docs/DESIGN.md` §2,
§5.1–5.5. Tests: `node tests/unit/run.js` (39 tests, ≈ 27 s; `node tests/unit/run.js <name part>` runs a subset). Sims (report-only,
`tests/sim/`): `node tests/sim/hs_playtest.js [--n 200] [--ages 3,4] [--models typical,slow3,botT0.8,…] [--jobs 2] [--config '{…}']
[--tag x]` (→ `tests/sim/out/hs_<tag>.md`, exit 1 on a stuck round / stuck state / NaN / off screen / 2 misses without a hint),
`node tests/sim/content_stats.js [chapters]`, `hs_browser.js` drives the real page in Playwright (`?bot=1`) once main.js is wired.

## 0. API — additions and deviations from DESIGN (read this first, integrator)
Every DESIGN §5.2 / §5.5 name exists with the DESIGN meaning. Additions and precisions:
1. **States / phases.** `menu → intro (2.5 s) → round [rise → play → bank] → roundDone [bank (cheer) → wipe] → … → talk → levelDone (3.6 s) →
   … → sessionDone`. The `roundDone` *event* fires when the fruit lands on Nim's back; the state then becomes `'roundDone'` with
   phase `'bank'` (0.45 s cheer) and then phase `'wipe'`. At the wipe's half time the next round is prepared (state `'round'`, phase
   `'wipe'`, stones `'hidden'`, Nim at home); at wipe t = 0.75 phase `'rise'` starts (the curtain's tail is still leaving). Talk time
   starts at the wipe's half time (state `'talk'`; `w.wipe` keeps running to t = 1 over the new empty crossing).
2. **`interactive`** = state `round`, phase `play`, `row < k`, Nim `'stand'` or `'land'` (the squash may still be recovering), no hop,
   not counting (countSel), no pending bank hop.
3. **Squat portraits (iPad: usable height / width < 1.6, e.g. 720×960, 720×1036) use a compact layout** — `layout.compact = true`:
   the speech bubble sits **beside the HUD** at the top (`bubble.y = ins.top + 18`, `bubble.w` ends left of Nim's head when he stands
   at the goal: ≈ 466 px), row pitch = footprint + 8 (`itemH + 0.4·S + 8`) instead of `0.5·S + itemH + 30`, banks down to near 170 /
   far 150, the fruit (`goal`) at the right under the HUD. **The DOM bubble must follow `layout.bubble` as before** (it moves only on a
   rotation, never between rounds). Any other portrait falls back to compact only if the normal one cannot fit.
4. **`World.maxRows(W, H, ins, age, m)`** — the most rows that fit (4 everywhere except the iPad 4:3 portrait 720×960: 3). The world
   passes it to `Content.makeRound(…, {maxK})`, so a 4-row round becomes 3 rows there (`round.maxK`). A rotation mid-round into a
   squat portrait with 4 rows lays out squeezed (`layout.fits = false`) until the next round.
5. **Landscape rows never overlap**: pitch ≥ `S + 8` (DESIGN's `S·0.62 + 40` would let columns overlap). Across range (stone top-face y):
   `a0 = max(play.y0, top keeps over the river + 10) + 20 + itemH` … `a1 = play.y1 − 0.4·S` (the thing's top is ≥ 20 px below the
   speech bubble — stricter than DESIGN's `play.y0 + 0.5·itemH + 20`). In landscape Nim standing on a top-row stone still reaches
   under the bubble band (his head, 190 px above his feet) — the DOM bubble is drawn over him for that moment.
6. **Goal / fruit**: `goal.x = min(W − ins.right − 120, W − ins.right − (NIM_POINTS.box[2] − feet[0])·nimH/300 − 45 − 4)` so his nose
   stays on screen at the end of the 90 px roll (`layout.rollStart / rollEnd` = goal ∓ 45). Portrait: `goal = (W/2 + 60, far.y + far.h −
   30)` (DESIGN's mirrored 0.62 would put his head into the bubble band).
7. **Taps during a hop**: a press on a stone of the row AFTER the one Nim is hopping onto returns `'queued'` and is judged when he lands
   (≤ 0.35 s old, else dropped silently, never a miss). Stones of later rows → `ahead`, other stones → `squish {early}`.
8. **`ahead` and soft presses count as "no progress"** (3 → hint, 6 → assist), never as misses.
9. **Extra layout fields**: `flowDir`, `compact`, `fits`, `m`, `pitch`, `a0 / a1` (= `across`), `minAcross`, `nimS` (= nimH / 300), `badgeR`,
   `fruitR`, `rollStart`, `rollEnd`, `keep[]`, `safe`, `hudKeep`. **Extra hooks**: `World.computeLayout(W, H, ins, cfg, age, hudKeep, k, m)`,
   `World.stoneHomes(L, k, m, seed)`, `World.footprint(L, x, y)`, `World.maxRows`, `World.plan / planAt` (the hop parabola),
   `World.nimPoints()` (NIM_POINTS with defaults), `World.logicalSize`, `NH.WindModel`. `answer()` → `{stone, id}`; `stoneHit(id)` →
   `{x, y, r: hitR, own: S/2}`; `nimHit()` → `{x, y, w, h, cx, cy}` (the ball while rolling); `fishHit / frogHit / snowHit` →
   `{x, y, r, cx, cy}` (a point off every stone body / Nim / bubble / HUD) or null.
10. **Extra event fields** (§6) and two extra events: `session {levels}` (as the bubble game) and `squish {repeat | early}` (DESIGN mentions it).
11. **`ask.first`** is true in a chapter's round 0 only (DESIGN §6); `ask.modeFirst` is true the first time a mode appears in the chapter
    (the count chapter's first `countSel` round) if main wants the long wording there too.
12. **Frog spot**: if no open water is ≥ hitR + 30 from every stone (crowded 4×3 rounds), the frog round shows a **fish** instead
    (sim: ≈ 7 % of frog rounds at ages 6–7, 0 at ages 3–5).
13. **`nim.dsx / dsy`** = the scale to apply to the CURRENT frame's art: `sx / sy`, except the `crouch` frame whose art is already squashed
    1.02 × 0.88 (art_nim.py) — there `dsx = sx / 1.02`, `dsy = sy / 0.88`. `nim.backSlots` already include it.
14. **Weather**: `resize(W, H, layout)` takes the layout (a number still means groundY); `ripples[]` (rings where leaves land);
    `wipeParticles(dir)`; burst kind `'leaves'`; party adds fireflies.

15. **Fix round 1 (integrator, after QA + playtest)** — CONFIG `hintTime 5` (was 3.2), `assistAfter 5` (was 6), `shortBudget
    [∞, 24, 42, 58]` (late rounds of a long chapter become 2 × 2 earlier; `chapterMinRounds` stays 3), new `repeatNoProgress 0.9`,
    `countHold 0.5`, `nimTopGap 8`, `apexMinCap 40`, `phoneMaxDots 10`.
    - The same wrong stone again within 1 s is still only a `squish {repeat}` (no miss) but counts as **no progress** at most once per
      0.9 s per stone, so a child hammering one wrong stone gets the hint and the assist (playtest P0).
    - **Mid-air taps**: while Nim hops (or waits, see countHold) a press on the next row's RIGHT stone is queued and judged when he can
      hop again (kept for the rest of the hop + 0.16 + 0.35 s); any other stone of that row only wobbles (`squish {early}`, never a
      miss). A press inside Nim's box while he is airborne is a poke (`'nim'`), never a press on a stone behind him.
    - **countSeq**: after each landing Nim stays 0.5 s (`interactive` false; taps queue) so "One! Two! Three!" keep up.
    - **Landscape layout**: per row, `layout.rowA0[j]` = the lowest top keep (bubble / HUD) over Nim's art width at that column + his
      height above the feet (0.8·nimH) + 8 — stones under the bubble start lower so Nim standing on them stays below it (strict pass
      first, shrinking S; a soft pass only when nothing fits). `stoneHomes` uses `rowA0`. The hop apex is capped (`_apexRoom`) so his
      head stays below the band (≥ 40 px apex); main.js also fades the DOM bubble while Nim's art reaches under it.
    - **Portrait layout**: the across range keeps Nim's whole art on screen: margin = max(0.55·S, his extent + 6).
    - **Shown / counted things** sit 0.5·nimH + 0.55·ih + 8 to his side (never flipped onto his face); with no room on either side
      they rise above him.
    - **Phones** (`layout.phone`) cap countSel at 10 dots (`Content.makeRound(…, {maxDots})`); `StoneArt` draws a sign with ≥ 7 dots
      1.28× bigger. The fruit never repeats from one round to the next, also across chapters (`_prevFruit` is no longer reset per chapter).

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. **Screen space = world space** (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s per call, so `?speed=N` works). At the start of every
  sub-step each moving value is copied into its `_p` twin; render `v = _v + (v − _v)·w.alpha`.
- Determinism: content, stone homes (seeded per round), the surprise round / type come from the world's seeded `NH.RNG`; cosmetic randomness
  (bob phases, droplets, blinks, surprise spots) from a second seeded generator; the wind from a third. Same seed + inputs on the same
  sub-steps → the same events (unit-tested).
- Motion = damped springs (`spring(o, k, kv, target, ω, ζ, h)`, semi-implicit Euler); `World.kickFor(peak, ω, ζ)` = the initial velocity
  whose first spring peak is `peak` (every tilt / wiggle kick).
- **The hop is a true ballistic parabola**: `plan(x0, y0, x1, y1, T, A)` — x moves at constant speed, `y(t) = y0 + vy0·t + ½·g·t²` through
  `(T, y1)` with the apex exactly `A` px above the HIGHER end: `√g = (√(2·H0) + √(2·(H0 + d))) / T`, `H0 = A + max(0, y0 − y1)`,
  `d = y1 − y0`, `vy0 = −√(2·g·H0)`. The stone's own small motion (bob / dip) is blended in linearly so the feet meet the stone exactly.
  E.g. a 220 px landscape hop: g ≈ 2650 px/s²; a 198 px portrait hop up: g ≈ 5780 px/s².
- The world never needs `stone_art.js`, `river_art.js` or the DOM.

## 2. Public API (`NH.World`)
`new NH.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (no-op when nothing changed; set
`world.hudKeep = [{x,y,w,h}…]` then call it again), `setAge` / `setLang` (apply at the next `newSession`), `newSession({lastTopics})`,
`levels`, `startLevel(i)`, `update(dt)`, `drainEvents()`, `pointerDown/Move/Up(x, y)`, `cancelDrag()`, `hint()` → `{stone, id}` | null,
`talkAnswer(choiceId)` → bool, `prompt()` → `{promptKey, params, rule, nameKind, nameValue, k, left, mode, row, count?}` while
`interactive` | null, `resetNudges()`, `skipTalk()`, `stoneById(id)`, `answer()`, `targets()` (the active row's target id, as a list).
Fields: `layout, hudKeep, state, phase, level, topic, round, cur, roundsPerLevel, stars, levelStars, roundStars, misses, streak, talk,
talkAnswered, alpha, stateTime, phaseTime, interactive, weather (= level % 4), wind, gust, stones, row, nim, fruit, fruitsOnBack (= nim.fruits),
fish, frog, snowflakes, drops, ripples, hintHand, assistId, wipe, surprise, finger`.

**Input (one active pointer; a gesture = down … up), logical px:** `pointerDown(x, y)` → `'stone'` (judged) | `'queued'` | `'squish'` |
`'ahead'` | `'fish'` | `'frog'` | `'snow'` | `'nim'` (poke fires on release, < 24 px move) | `'soft'` | null. Order: assist armed + press
in the river → the target; a surprise wins where the finger is off every stone's body (r = S/2 around the hit point); then the nearest stone
hit centre within hitR (top-centre raised 0.35·itemH; the active row gets a 10 px bias on ties); then Nim's box; else soft (+ a ripple on
open water). `pointerUp` → `'pokeNim'` | `'up'` | null.

## 3. Layout (`computeLayout`, DESIGN §2) — for this round's k rows × m stones
| field | landscape | portrait | compact portrait |
|---|---|---|---|
| `bubble` / `hud` | exactly the bubble game (bubble y = ins.top + 18, h 134, w ≤ 700; HUD 160 × (ins.top + 96)) | bubble y = ins.top + 110, h 124, full width | beside the HUD: y = ins.top + 18, h 124, w ≈ 466 |
| `play` | x ins; y0 = band bottom + 10, y1 = H − ins.bottom − 14 | y1 = H − ins.bottom − 26 | same |
| `near` / `far` | x 0 … ins.left + 230 (≥ 190) / W − ins.right − 210 (≥ 170) … W, y play.y0 … H | near.y = H − ins.bottom − 250 (tall × 1.2; ≥ 200); far = play.y0 … + max(220, nimH + 40) (≥ nimH + 20) | near ≥ 170, far ≥ 150 |
| `rowPos` (along) | river.x + 12 + (j + ½)·pitch, pitch = (river.w − 24)/k ≥ S + 8 | footprint centres evenly from the near bank: near.y − (j + ½)·pitch, y = that + ½(itemH − 0.4 S); pitch ≥ 0.5 S + itemH + 30 | pitch ≥ itemH + 0.4 S + 8 |
| across (`a0 … a1`) | y: top keeps + 10 + 20 + itemH … play.y1 − 0.4 S | x: ins.left + 0.55 S … W − ins.right − 0.55 S | same |
| stones | m per row, spacing ≥ itemH + 0.4 S + 8 (landscape) / S + 8 (portrait), 72–100 % of the room, seeded group offset, ± 18 px jitter keeping the gap | | |
| `S` | age base 150 / 150 / 140 / 128 / 128 (ages 3–7), −4 px steps to 116 until k × m fit; then the banks compress (10 px steps) and S is searched again | | |
| `nimHome` / `goal` | (ins.left + 120, play centre + 40) / (§0.6, same y) | (W/2 − 60, near.y + 0.62 near.h) / (W/2 + 60, far.y + far.h − 30) | goal under the HUD (§0.3) |
| `nimH` | 190 | 180 (phone 210) | 180 |
| `hitR`, `itemH` | 0.45 S + 14 (phones, long/short > 1.9: ≥ 92), 0.62 S | | |
Footprint of a stone = `x ± S/2, y − itemH … y + 0.4·S` (top face 0.36 S, side 0.22 S, thing above). **Unit-tested on 13 viewports
(iPhone 393×852 both ways with the notch, iPad 820×1180 both, 1600×720, 960×720 ± insets, 720×1600 notch, 720×960, 1556×720 notch,
iPad mini, iPhone SE both) × 5 ages × 5 (k, m) shapes × 12 seeds: no footprint overlaps another, the bubble / HUD, or the safe-screen edge.**
Examples (age 4, 3 × 3): iPhone landscape 1561×720 notch → S 150, pitch 294, across 275–608, hitR 92; iPhone portrait 720×1561 →
S 150, pitch 199, nimH 210; iPad 960×720 → S 150, pitch 165; iPad portrait 720×1036 (compact) → S 118; age 6 4 × 3: iPhone portrait
S 116, iPad 960×720 S 116 (pitch 124), 1600×720 S 128; 720×960 portrait holds 3 rows (S 116).

## 4. `NH.CONFIG` (all tunable via `new NH.World({config})`)
| group | values |
|---|---|
| flow | step 1/120, roundsPerLevel 4, chapterTimeLimit 75 s (after ≥ 3 rounds), **shortBudget [∞, 28, 48, 66] s** (a round starting later into the chapter is short: 2 × 2), introTime 2.5, levelDoneTime 3.6, Talk: afterAnswer 1.6, re-ask 12 s, glow after the 2nd, give up 2 s after the 3rd (Nim answers, `auto`) |
| stones | dip spring ω 11 ζ 0.22, tilt ω 9 ζ 0.18 (clamped ± 0.35 rad, dip ± 0.3 S), bob ± 2 px at 0.4–0.6 Hz, autumn gust tilt ≤ 0.03 rad, `sub` = (dip + offset) / (0.22 S) |
| rise | lead 0.4 s + 0.18 s per stone (row by row), 0.45 s each from 0.35 S below (ease-out) to 8 px above → the dip spring settles it; splash: 1 ripple + 3 droplets; ask 0.35 s after the last |
| hop | crouch 0.12 s (sy → 0.84, sx 1.1), air T = 0.46·√(dist/220) clamped 0.42–0.62 s, apex A = max(70, 0.2·|dx|) above the higher end, stretch sy up to 1.12 while rising (1.04 falling), take-off squash velocity +5 /s, push-off lifts the old stone (−56 px/s); land: sq −0.2 (sy 0.8, sx 1.12) → spring ω 16 ζ 0.35, `land` state 0.16 s; lean spring ω 10 ζ 0.45 (air 0.07 rad forward, wrong 0.14 rad towards the stone for 0.6 s); queued tap ≤ 0.35 s |
| land / right | stone dipV +160 px/s, tilt kick 0.05 rad towards the hop direction; 2 ripples (r 0.5 S → 1.05 S, 0.9 s, flat 0.38, 2nd 0.16 s later), 8 droplets (up 150–300 px/s, out 40–140, gravity 900, life 0.5 s, r 3–6; a drop falling back makes a tiny ring with p 0.3); gold → 1 in 0.4 s; the other stones of the row sink 0.6 s (0.32 S down, fade); thing: hops 20 px in 0.25 s, ×1.15, fades 0.1 → 0.5 s (`thingAway`) |
| count / badge | countSel: the dots sign rises above Nim's head (or beside him when that would touch the speech bubble) ×1.25 in 0.35 s, first `count` 0.45 s after landing, then every 0.4 s, 0.35 s tail, then `thingAway`; animals: the same rise + home badge (r 0.42 itemH) popping in at 6 /s beside it, held 1.0 s |
| wrong / ahead / soft | wrong: tilt kick ± 0.14 rad, dipV +90, thing wiggle 0.3 rad (ω 16 ζ 0.22), ripple, Nim `oops`; the same stone < 1 s → `squish {repeat}` (no miss); ahead: dipV +50, tilt 0.04; squish early: tilt 0.05 |
| bank (≈ 2.0 s from bankLand to roundDone) | bank hop 0.3 s after the last landing (a full hop to `bankLand`: landscape (far.x + 40, the last stone's across position mapped into the bank), portrait (the last stone's x, goal.y)); hold 0.12 s; 2 walk hops (0.3 s, apex 18 px, crouch 0.06 s) to `rollStart`; curl 0.25 s (`curl` 0 → 1); roll 0.5 s, 90 px, ease in-out, **rollRot = distance / ballR** (no slip), the ball rides 0.55·fruitR up over the fruit; the fruit sticks at the bottom of the ball when it is over it (`stick`) and turns with it; uncurl 0.25 s + the fruit glides 0.35 s (arc 26 px) to back slot `fruits.length % 4`; `roundDone`; cheer 0.45 s |
| wipe | 1.3 s; swap at t = 0.5, rise from t = 0.75 |
| help | hint after 2 misses (each further miss) or 3 no-progress presses (soft / ahead); assist after 6; hint 3.2 s, cooldown 6 s, hand cycle 1.6 s; idle 12 s × 1.5 up to 30 s (12, 30, 57, 87, 117 s after the ask), the 2nd idle hints; poke: a 0.3 s hop in place, apex 22 px |
| surprises | rounds [1, 2], chapters 0–2 fish / frog (rotating, random start), chapter 3 (winter) snow; 2–5 s after the ask (play or bank). fish: 2 leaps of 1.2 s, apex 120 px, span 150 px, 1.4 s under water between (a shadow), splash + 5 drops in and out, tap r 58 → flip 0.5 s; frog: a pad ≥ hitR + 30 from every stone (else a fish), in 0.6 s, sits 10 s drifting 6 px/s downstream while it stays clear, out 0.6 s; tap r 54 → croak 0.6 s + a 0.4 s hop of ± 16 px on the pad; snow: 5 flakes (r 36 ± 15 %), 0.7 s apart, ≈ 12 s fall, tap → twinkle 0.5 s |
| wind (`NH.WindModel`) | breeze 6 / 6 / 8 / 10 px/s² (two slow sines); autumn gusts: first after 3–6 s, then every 6–10 s, ± 40–60, 1.5 s sin² envelope, `gust {dir}` |
| Nim | moods idle talk happy cheer think oops wave giggle dance (`moodTime`), blink 2.2–5 s / 0.13 s, `crouchArt [1.02, 0.88]` |

## 5. Render contract (what render.js reads; use `_p*` + `alpha` for every moving value)
- **Layout**: `layout.river` (water), `near` / `far` (banks), `flowDir`, `goal` (fruit / tree), `S`, `itemH`, `nimH`, `bubble` (DOM bubble).
- **Ripples** (under the stones) `w.ripples[] {x, y, r, a, flat}` → `StoneArt.drawRipple(ctx, x, y, r, a, flat)` (skip a ≤ 0). Weather
  `weather.ripples[]` the same.
- **Stones** `w.stones[]` (skip `'hidden'` / `'gone'`), back-to-front by `y`: `translate(x, y)` (interpolated) →
  `StoneArt.drawStone(ctx, layout.S, {seed, tilt, dip: sub, gold, glow, active, alpha, snow: winter ? 1 : 0, wet})`. `x, y` already include
  bob, dip, rise / sink and the rotation glide; `sub` is the waterline (0 rest … 1 under). Golden = `gold`; hint / assist = `glow`; the
  active row's ring = `active`.
- **The thing** (when `thingA > 0`): at `(x + thingDx, y − thingHop)`, `rotate(wig)`, `scale(thingS)`, `StoneArt.drawThing(ctx, thing,
  layout.itemH, {glow, alpha: alpha · thingA, count})` (`count` = dots counted so far, −1 none; countSeq things have `numeral: true`).
  Counted / badge things rise above Nim — draw them AFTER Nim. Badge `stone.badge {home, x, y, r, a}` → `drawHomeBadge(ctx, home, r, {alpha: a})`.
- **Nim** `w.nim`: feet `(x, y)`, height `nim.h` (art 300 × 300, feet (150, 290), scale h/300), frame `nim_<nim.frame>.svg`
  (`crouch | jump | roll | blink | idle | talk | happy | cheer | think | oops | wave | giggle | dance`), `scale(dsx, dsy)` about the feet,
  `rotate(lean)` about the feet, facing right always (`face` 1). Roll frame: the ball centre is `(ballX, ballY)` (r = `ballR`); rotate the
  roll art by `rollRot` about the ball centre; `curl` 0..1 may cross-fade crouch ↔ roll. Drawn after the stone he stands on
  (`nim.onRow`), before stones in front of him (larger y).
- **Fruits on the back**: `nim.fruits[i]` (kind) at `nim.backSlots[i] {x, y, rot}` (world px, current pose incl. squash / lean / crouch);
  while rolling at `nim.rollSlots[i]` (they turn with the ball). The round's fruit `w.fruit {kind, x, y (centre), s (pop scale, springy),
  rot, size, state 'wait'|'stick'|'fly'|'done'}` → `drawFruit(ctx, kind, size · s, {rot})` unless `'done'` (then it is in `nim.fruits`).
- **Drops** `w.drops[] {x, y, r, a}` → `drawDrop`. **Fish** `w.fish {x, y (centre), rot, flip 0..1, face ±1, s, above}`: above → `fish.svg`
  (`fish_flip.svg` while 0 < flip < 1, spin by flip·2π), anchor (70, 50), mirrored when face = −1; not above → a soft shadow on the water.
  **Frog** `w.frog {x, y (feet), padX, padY, padR, padRot, croak, a, s}`: `drawLilyPad(ctx, padR, padRot)` at (padX, padY), then `frog.svg`
  (`frog_croak.svg` while croak > 0) feet (70, 112) at (x, y), scale s, alpha a. **Snowflakes** `w.snowflakes[] {x, y, r, rot, a, tw}`
  (skip `'wait'`) → `drawSnowflake(ctx, r·(1 + 0.3 tw), rot, a)`.
- **Hint hand** `w.hintHand {x, y, press, alpha}` → `drawHintHand` (it follows the stone).
- **Wipe** `w.wipe {t 0..1, dir {x, y}, season}`: the curtain covers the screen around t = 0.5 (swap); call `weather.wipeParticles(dir)`
  on the `wipe` event.
- **Weather**: `ambient` sky / tint / sun, `clouds`, `particles` (`layer 'back'` behind the stones — `onWater` ones flat on the water under
  the stones; `'front'` over everything incl. the wipe sweep), `ripples`.

## 6. Events (`drainEvents()`; every positional event has `x, y` in logical px, clamped on screen — unit-tested over 50 bot sessions)
| event | when / fields | main.js should |
|---|---|---|
| `session` | `{levels}` | — |
| `level` | `{level, topic, weather}` (x, y = river centre) | `weather.setWeather(weather)`, banner, `weather.N` line |
| `round` | `{round, topic, surprise, k, m, n, mode, short, key, fruit}` rise starts | (rarely) `rise[]` |
| `rise` | `{id, row, i}` (x, y = its home) | soft plop + bubbles |
| `ask` | `{promptKey, params, rule, first, modeFirst, round, k, m, mode}` (x, y = Nim's mouth) | `speakPrompt(I18N.ask(lang, promptKey, params, {first}))` |
| `right` | `{id, thing, rule, mode, row, k, left (rows left after this one), misses, count? (countSeq: row + 1), n? (countSel: dots), home? (animals)}` | `sayRight` |
| `hop` | `{from (−1 bank, row), to (row, k = far bank), id?, kind 'stone'|'bank', tx, ty}` on take-off | boing (pitch up) |
| `land` | `{id, row, k}` | tok + plip |
| `splash` | `{id?, big: false, fish?: true}` | water splash |
| `thingAway` | `{id}` | sparkle (`weather.burst(x, y, {kind: 'sparkle', n: 8})`) |
| `count` | `{id, i (1-based), n}` 0.4 s apart | pip + `sayCount(i)`; at i = n `sayCountRun(n, 'dots')` |
| `homeBadge` | `{id, home}` | small pop |
| `bankLand` | — | soft thump, `bank[]` (rarely) |
| `curl` / `stick` / `uncurl` | — / `{fruit}` / — | whirr / pomf + `sayFruit` / ta-da |
| `roundDone` | `{round, stars, misses, assisted, fruit, fruits}` (x, y above Nim's head) | stars fly to the HUD |
| `wipe` | `{season, dir}` | whoosh, `weather.wipeParticles(dir)` |
| `wrong` | `{id, thing, got {nameKind, nameValue}, want {kind, value, nameKind, promptKey, params, left, count?}, rule, mode, row, streak, misses, hint?}` | blub-wobble + `sayWrong` |
| `squish` | `{id, repeat? | early?}` | wobble only |
| `ahead` | `{id, row, active}` | bloop; "One at a time!" ≤ once / 6 s |
| `soft` | press on water / bank / nothing | plink |
| `hint` | `{id, want, idle?}` | `hint[]` |
| `assistArmed` / `assist` | `{id}` / `{id, from}` (a `right` follows) | — |
| `idle` | `{n, promptKey, params, rule, left, mode}` | `idle[]` / the question again |
| `pokeNim` | `{promptKey, params, rule, left, mode}` or `{busy: true}` | giggle (+ repeat the question in play) |
| `fish` / `fishTap` | `{n (leap 1 | 2)}` / — | splash; `surprise.fish` at n = 1 / `fish.tap` |
| `frog` / `frogTap` | — | croak; `surprise.frog` / `frog.tap` |
| `snow` / `snowTap` | `{n}` / — | twinkle; `surprise.snow` / `snow.tap` |
| `gust` | `{dir}` (autumn) | wind swell |
| `talk {talk}`, `talkAsk {n, talk, glowAnswer}`, `talkResult {correct, choiceId, answerId, auto}`, `levelDone {level, stars}`, `sessionDone {stars, fruits}` | as the bubble game | as the bubble game (sessionDone: Nim `dance`, `weather.setParty(true)`) |

## 7. Content (`NH.Content`, DESIGN §5.1)
- (k rows, m stones): warm-up (chapter 0 round 0) and short rounds (2, 2); age 3 (2,2) (2,2) (3,2) (3,2); age 4 (2,2) (3,2) (3,3) (3,3) —
  chapter 0: (2,2) (2,3) (3,2) (3,3); age 5 (3,2) (3,3) (3,3) (4,3); 6+ (3,3) (4,3) (4,3) (4,3); k ≤ `maxK`. Distinct distractor values per
  round (colours, shapes, animals, letters, initials): 1 / 2 / 3 at ages 3 / 4 / 5+; inside a row every stone differs.
- **Self-check** (`validate`, independent of the generator): k / m per table, exactly ONE target per row matching the rule (`ruleHolds(rule,
  thing, round, row)`; countSeq: n = row + 1) and no distractor matching, the target not at the same index in every row, CVD pairs + no
  pink below 5, topic rules (colours: warm-up one obj, later different objs among the targets from age 4 and the row's target obj also on a
  distractor; shapes: never square/rect, circle/oval, square/diamond, heart/circle; one colour < 5, age 5 every stone of a row its own colour
  and a target colour also on a distractor; size: one obj, one colour; countSeq: numerals, distractors in 1..k+2, never j+1, at age ≤ 4 never
  j+2; countSel: target a in 2–5 / 3–8 / 4–12, gaps ≥ 2 at ≤ 4, ≥ 1 (≥ 2 when a number ≥ 6) later, no numerals; animals: p.animal = farm
  animals at age 3 / round 0, p.home = farm or sea (sea's two animals take turns when k > 2), distractors from 2 / 3 other homes; letters
  never look-alike; lower: the rows alternate capital / small; initial from the names (VI classifiers con/cái/quả/chiếc/cây/bông dropped,
  digraph words never used, the rubber duck and goldfish bowl left out); add / sub / oddeven: distinct tiles), a fruit from NH.FRUITS.
- `makeRound` retries until valid, not the same set as earlier in the chapter (`usedKeys`), the asked value differs from the last round's
  (`prevRule`; countSeq exempt — its value is the row count), the fruit differs from the last round's (`prevFruit`).
- `content_stats.js 200`: 20 000 rounds, **0 invalid, 0 % repeated sets, 0 % repeated asks, 0 % repeated fruits**, 0.01–0.11 ms per round.
  Unit test: every topic × age 3–7 × 200 seeds × 4 rounds (20 000 rounds) + Talk 40 × every topic × age. With the real `i18n.js` names:
  15 000 rounds, 0 invalid.

## 8. Playtest numbers
`node tests/sim/hs_playtest.js --n 80 --models typical,slow3,botT0.8,kid0.3` (1 400 sessions) + `--n 40 --models
perfect,tapper,spammer,bot1,absent,kid0.6,kid0.9` (1 215 sessions), after the final tuning: 1/30 s frames through the real input API on 5 viewports (iPhone portrait / landscape with the notch, iPad 4:3 landscape with
insets, iPad portrait 720×1036 compact, iPad Air landscape), EN / VI alternating. **Every model, every age: 0 failed sessions, 0 rounds > 120 s,
0 stuck states, 0 NaN, 0 stones / Nim off screen, 0 "2 misses without a hint", 0 % repeated sets.**

| model | age | session min mean (p90, max) | chapter s mean [p10–p90] | round s mean | rise / first hop / play / bank s | stars 3/2/1 % | wrong / round | hint rounds % |
|---|---|---|---|---|---|---|---|---|
| typical | 3 | 6.4 (6.7, 7.0) | 92.2 [83.6–100.4] | 21.7 | 1.9 / 7.8 / 18.5 / 2.0 | 49 / 31 / 21 | 0.81 | 21 |
| **typical** | **4** | **6.2 (6.5, 7.0)** | **89.5 [80.8–98.3]** | 20.6 | 2.2 / 6.5 / 17.0 / 2.0 | 63 / 27 / 11 | 0.50 | 11 |
| typical | 5 | 6.3 (6.6, 6.9) | 91.0 [82.3–102.1] | 20.7 | 2.5 / 5.7 / 16.9 / 2.0 | 63 / 27 / 10 | 0.50 | 10 |
| typical | 6 | 6.4 (6.6, 6.8) | 91.8 [84.1–101.7] | 21.3 | 2.7 / 5.6 / 17.2 / 2.0 | 66 / 23 / 10 | 0.46 | 10 |
| typical | 7 | 6.1 (6.3, 6.6) | 87.9 [82.2–93.3] | 19.9 | 2.9 / 5.3 / 15.7 / 2.0 | 71 / 25 / 4 | 0.34 | 4 |
| botT0.8 (toddler-paced NH.Bot) | 3–7 | 5.3–6.4 (≤ 6.7) | 75.7–92.2 | 16.8–21.3 | — | 46–57 / 28–33 / 16–22 | 0.61–0.82 | 16–22 |
| kid0.3 | 3–7 | 6.5–7.1 (≤ 7.8, max 8.2) | 94–102 | 25.6–30.0 | — | 6–9 / 10–14 / 77–83 | 2.6–2.95 | 77–83 |
| kid0.6 | 3–7 | 6.4–6.6 (≤ 7.0, max 7.4) | 92–95 | 22–24 | — | 24–36 / 25–29 / 36–51 | — | — |
| kid0.9 | 3–7 | 5.9–6.3 (≤ 6.7) | 86–91 | 19–21 | — | 70–81 / 17–26 / 2–5 | — | — |
| slow3 | 3 | 7.5 (8.5, 8.8) | 108.4 [87.7–131.0] | 31.8 | 1.8 / 14.4 / 28.7 / 2.0 | 39 / 29 / 32 | 1.20 | 35 |
| slow3 | 4 | 7.7 (8.6, 9.9) | 111.8 [90.7–138.3] | 33.0 | 1.8 / 14.3 / 29.9 / 2.0 | 36 / 31 / 34 | 1.30 | 36 |
| tapper | 3–7 | 6.6–7.1 (≤ 7.5, max 7.9) | 95–103 | 28–31 | — | 11–17 / 46–53 / 30–43 | 1.1–1.4 | 89–94 (assist 69–78 %) |
| spammer | 3–7 | 5.4–6.3 (≤ 6.7) | 78–91 | 17–21 | — | 4–19 / 16–42 / 39–80 | 1.4–2.6 (+ 5.6–8.9 squish) | 74–89 |
| perfect | 3–7 | 4.1–5.2 | 58–75 | 13–17 | 1.8–3.0 / 4.0 / — / 2.0 | 100 / 0 / 0 | 0 | 0 |
| bot1 (quick) | 3–7 | 3.6–4.9 | 50–70 | 11–16 | — | 100 / 0 / 0 | 0 | 0 |

- **Targets met** for a typical child and the toddler-paced bot: chapters 76–92 s (target 60–100 s), sessions ≤ 6.7 min p90 (≤ 8 min).
- A typical age-4 round (20.6 s) = rise 2.2 s + listening + thinking → first hop 6.5 s after the ask + 2–3 more hops (≈ 2.5 s each: the hop
  0.6–0.8 s + the child's next look) + bank 2.0 s + cheer 0.45 s + wipe to the next rise 1.0 s.
- **slow3** (a very slow, distractible 3-year-old: skill 0.6, thinks 2.8–6 s, 15 % look-aways of 4–12 s) needs 7.5–7.7 min on average,
  p90 8.5 min: 92 % of its chapters end after 3 rounds by the 75 s rule and 57 % of its rounds are already short (2 × 2 — two hops are
  the minimum crossing; the bubble game's short round was a single pop). No fail state: a slower child simply plays a little longer.
- Short rounds: 25–33 % of typical rounds (they come late in a long chapter), 55–60 % for slow3 / kid0.3 / tapper.
- Surprises: 25 % of rounds; a typical child taps 62–68 % of them; the frog → fish fallback happens in 7 % of frog rounds at ages 6–7.
- Idle nudges for an absent child: 16.3, 34.3, 61.3, 91.3, 121.3, 151.3 s into the session = 12, 30, 57, 87, 117, 147 s after the
  ask (the 2nd and later also hint); a round waits for the child (no auto-play).
