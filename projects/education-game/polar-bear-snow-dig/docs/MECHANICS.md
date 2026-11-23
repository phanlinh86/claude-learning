# Nuka's Snow Dig — Mechanics (`NK.CONFIG`, layout, motion, render contract, events, playtest tuning)

Base: `../bunny-dino-dig/docs/MECHANICS.md` (Bun's Dino Dig). Everything not listed in **§0** works as there; §1–§12 are that
document updated for the snow game ("mound" in code = a snow drift, "shovel" = Nuka's paw, "shelf" = the aurora ribbon,
`w.bun` = Nuka).

## 0. What is new versus Bun's Dino Dig (2026-11-23)
- **Rub to dig** (DESIGN §5.2). `pointerDown` on a drift binds the press to it (a press on empty snow binds to the first drift the
  finger slides onto). `pointerMove` adds path length while the finger is within the drift's hit circle + `rubPad` 40 px (or
  inside its hit box); a **stroke** = every `rubStroke` 70 px of path, or an x-reversal (moves under `rubJitter` 3 px ignored)
  once the segment and the path since the last stroke are both ≥ `rubMinSeg` 26 px; strokes ≥ `rubGap` 0.06 s apart. Each
  stroke = a tap on that drift (`_tapMound`): starts the dig (`dig {rub: true}`, the paw flings towards the stroke) or queues a
  scoop (`dig {again, rub}`; queue ≤ `rubMaxQueued` 3, never more than the scoops still needed; queued scoops run at `scoopFast`
  0.22 s, each flung the way the finger went) → `rub {id, x, y, dir ±1, result}`. An open hole: one `already` per press; another
  drift while digging: `busy` at most every 0.25 s; during `enter`: the first stroke is held like an early tap. A press that
  rubbed releases as `'rub'` — never a tap, never `soft`. Rubbing empty snow inside the dig site: `sandTap {rub: true}` at most
  every `rubSandGap` 0.25 s, **not** a no-progress tap (no hint / assist count, no miss). A rub on the wrong drift is a wrong dig
  like a tap (judged when it pops out). Tiny wiggles (< 26 px swings, < 70 px path) stay a tap.
- **Tap still works**: one scoop, then the paw keeps scooping every `autoScoop` **0.85 s** (was 0.55). Dig → reveal: tap only
  1.35 s (age 3, 2 scoops) / 2.21 s (3 scoops); rubbing ≈ 0.6 / 0.82 s.
- **Rub demo**: the first `ask` of the session (chapter 1, round 1, a find step) → after `rubDemoDelay` 0.9 s the ghost hand
  swishes ±`rubDemoAmp` 46 px over the right drift (cycle 0.6 s, finger down) for `rubDemoTime` 3.2 s: `hintHand.rub = true`,
  event `rubDemo {id, x, y}` (main: "Rub the snow!"); no glow, no hint cooldown; a dig ends it; once per session.
- **No hatch**. A right **hat** twirls: `m.trot` 0 → 2π (ease-in-out, `twirlTime` 0.5 s), lift `jumpY` 26·sin(πu), a soft
  squash, `sparkle` 1, event `twirl {id, thing, x, y}`; other kinds keep the 0.32 s crouch. Removed: `crack`, `hatched`,
  `eggBits` content (the array stays, always `[]`), `dino` on flying / shelf / treasures / events, event `hatch`, CONFIG hatch* /
  crackTime / dino* / bit* / hopG / hopApex / hopStretch / landSquash.
- **Float to the aurora** (replaces the ballistic hop): x, y ease-in-out (cubic) from the thing to its slot over `floatTime`
  0.9 s, sideways sway `floatSway` 18·sin(2πu) px, size → the slot size, tilt ≤ 0.12 rad, no squash; `trail` = the last
  `trailN` 10 centre points sampled every 0.03 s; on landing a settle bounce (spring ω 14, ζ 0.32, first peak 7 px up).
  `w.aurora = {n (finds in the ribbon), glow (→ 1 on each shelved, decays ≈ 1.4/s), ripple (cheer: up in 0.3 s, down over the
  last 0.6 s)}`. Event `hop` keeps its name (+ `float: true`, `T`), `shelved` gets `n`.
- **Leaving** (chapter end, and the oldest find when the ribbon is full): rises `leaveRise` 120 px (smoothstep, ±10 px sway),
  shrinks to 0.65, fades from 25 % on, `leaveTime` 0.8 s, stagger 0.06 s. `shelfLeave {n}` (no satchel coords).
- **Belly-slide** in the cheer (`cheerTime` **2.2 s**, was 1.4): hop 0.25 s → tummy down 0.1 s → slide right `slideDist` =
  min(420, 0.45 W, W − ins.right − 12 − 0.47 h − bun.x) with friction (x = D·(1 − (1 − u)²), 0.7 s) → pause 0.25 s → slide back
  (0.65 s, same law) → stand up 0.15 s. `bun.slide` 0..1, `bun.slideX` + `_pslideX`, `bun.slideDir` ±1, mood `'slide'` while
  slide > 0.5; events `slide {dist, x, y}` once, `slidePuff {x, y, dir}` every 0.09 s while faster than 60 px/s.
  `world.slideBox()` = the slide pose box (half width 0.47 h, 0.5 h tall above the feet) — unit-tested inside the screen and
  clear of the bubble on 1556×720, 960×720, 720×1556 (with and without notch insets).
- **Things**: `hat` (colours), `gem` (shapes), `fish` (count, size), `toy` (fox, hare, reindeer, walrus, whale, dog, goose, owl),
  `tablet`. Peek hat 0.40, gem 0.42, toy 0.48, fish 0.42, tablet 0.62; hit widths hat 0.9, gem 1.0, toy 0.8, fish 0.62, tablet
  0.84. Size rounds: two fish or two hats. `NK.WORDS` = `{en|vi: [{id, word, animal, initial}]}` (what i18n reads; `NK.TOY_WORDS`
  = the plain map); EN initials F H R W W D G O, VI C T T H C C N C → a VI `initial` round holds ≤ 4 toys (C / T / H / N).
- **Test hooks** `rubPath(id)` → logical points (from the hit centre, 4 swings ±min(50, 0.45 r + 14) px, a point every ~10 px);
  `slideBox()`.
- **Bot**: half of its digs (`pRub` 0.5) are rubs (press, 3–6 zig-zag swings ±50 px over 0.4–0.9 s, every corner dispatched as a
  `pointerMove` so a large dt never skips a reversal, lift).
- **Weather**: moods spring / summer / autumn / winter, `ambient.aurora`, new particles (§9).

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.5.
Tests: `node tests/unit/run.js` (52 tests, ≈ 14 s: layouts on 15 named viewports + 400 fuzzed ones, ≈ 45 000 generated rounds, rub / tap / slide rules,
world flows, full bot sessions; `node tests/unit/run.js <name part>` runs a subset).
Sims (report-only, `tests/sim/`): `node tests/sim/hs_playtest.js [--n 100] [--ages 3,4] [--models typical,taponly,rubber,slow3,…] [--jobs 2]
[--config '{…}'] [--tag x]` (→ `tests/sim/out/hs_<tag>.md`; exit 1 on a stuck round / NaN), `node tests/sim/content_stats.js
[chapters]`; `hs_browser.js` / `hs_browser_vp.js` drive the real page in Playwright (`?bot=1`). JSON reports are git-ignored.

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. **Screen space = world space** (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s per call, so `?speed=N` works). At the start of
  every sub-step each moving value is copied into its `_p` twin; render `v = _v + (v − _v)·w.alpha`.
- Determinism: content, the surprise round and its type use the world's seeded `NK.RNG`; cosmetic randomness (sand clumps, the
  shovel side, blinks, idle wiggles, seal spot score, tern direction) a second seeded generator. Same seed + the same inputs on
  the same sub-steps → the same events whatever the frame size (unit test "deterministic").
- Every moving thing is a damped spring (`spring(o, k, kv, target, ω, ζ, h)`, semi-implicit Euler) or a closed-form ballistic
  path; `World.kickFor(peak, ω, ζ)` gives the initial velocity whose first peak is `peak`.

## 2. Public API (`NK.World`)
`new NK.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (no-op when nothing changed; set
`world.hudKeep = [{x,y,w,h}…]` then call it again: the back row moves below top DOM boxes), `setAge(a)` / `setLang(l)` (apply at
the next `newSession`), `newSession({lastTopics})`, `levels`, `startLevel(i)`, `update(dt)`, `drainEvents()`, `skipTalk()`,
`resetNudges()` (after a pause), `talkAnswer(choiceId)` → bool, `hint()` → `{mound: id}` | null (manual hint, e.g. a bubble tap),
`prompt()` → `{promptKey, params, mode, step, nameKind, nameValue, need}` in enter / dig, else null.
Fields: `layout, hudKeep, state, phase, level, topic, round, roundsPerLevel, step, stepInfo, cur (the round), stars, levelStars,
roundStars, misses, talk, talkAnswered, alpha, stateTime, phaseTime, tapMoveMin (64), interactive, weather (= level % 4), mounds,
dig, shovel, sand, flying, shelfItems, aurora, eggBits (always []), bun, seal, tern, hintHand, treasures`.
`interactive` = state `round`, phase `dig`, the step not finished and **no dig running** (a tap on a buried mound would start a
dig that gets judged).

**Input (one active pointer; extra fingers are dropped upstream):** `pointerDown(x, y)` → `'seal'` | `'tern'` (they react on the
press, only when no mound is under the finger) | `'press'` | null; `pointerMove(x, y)` (rub strokes, §0); `pointerUp(x, y)` →
`'dig'` | `'busy'` | `'already'` | `'pokeBun'` | `'sand'` | `'shelf'` | `'rub'` (the press rubbed: nothing more) | null. A **tap** = press + release within `tapTime` 1.0 s and < `tapMovePx` 64 px
(max(64, tapMoveMin)); it is judged at the **release** point. A drag or a long press digs nothing; it emits `soft` and gives the
mound under the press point a 3 px wobble — not a mistake, not a no-progress tap. `cancelDrag()` drops the press. `tap(x, y)` = an
already-classified tap (tests / keyboard).
**Tap rules in the dig phase:** buried mound, no dig running → dig it (`'dig'`); the digging mound again → one more scoop queued
(max 2, `dig {again: true}`); another mound while digging, or a buried one while the step is finishing → `'busy'` (soft, nothing
said, no miss); an open / found / empty mound → `'already'` (no miss); Nuka → `'pokeBun'` (repeat the prompt); the shelf →
`'shelf'` (the nearest item hops); any other point → `'sand'` (a dust puff, counts as a tap without progress).
**Test hooks (logical px):** `moundTap(id)` → `{x, y}` (the hit centre: inside the hit area, clear of HUD / bubble / shelf),
`moundHit(id)` → `{x, y, r}`, `bunHit()` → `{x, y (centre), w, h}`, `sealHit()` / `ternHit()` → `{x, y, r}` | null (only while
tappable), `answer()` → `{mound: id}` (what to tap next) | `{mound: id, digging: true}` (a dig is running: tapping it digs faster) |
null, `moundById(id)`, `rubPath(id)`, `slideBox()`. Static: `World.logicalSize(cssW, cssH)`, `World.computeLayout(W, H, ins, cfg, age, hudKeep)`,
`World.placeMounds(layout, n, cfg, seed)`, `World.kickFor`, `World.hopPath` (kept, no longer used).

### States and phases
`menu → intro (2.5 s) → round [enter → dig] → roundDone [cheer 2.2 s (belly-slide) → clear ≥ 0.7 s] → … → talk → levelDone (1.8 s) → … →
sessionDone`. Talk time after round 4, or after round ≥ 3 once the chapter passed 75 s. Talk re-asks every 12 s (`talkAsk {n}`),
the answer glows from the 2nd re-ask, re-asks stop after 3; 12 s later Nuka answers himself (`talkResult {auto: true}`, no star).
An absent child never finishes a round (no fail state, no auto-play): idle nudges come at 12 → 18 → 27 → 30 → 30 s.

## 3. Render contract (what render.js reads; everything else is internal)
```
w.layout   W, H, ins, portrait, tall (H/W > 1.6), groundY, bubble {x,y,w,h}, hud {x,y,w,h},
           shelf (= the AURORA RIBBON box) {x, y, w, h, slots[8|12]{x, y (item bottom centre)}, size 64|84, spacing, fromRight},
           bun (= Nuka) {x, y (FEET), h, w}, satchel {x, y} (unused), field {x0, x1, y0 (back row y), y1 (front row y)},
           rows[] {y, x0, x1, lo, hi, cap}, item (thing base size), moundW, moundH, spacing, rowGap, jitterY, hitR, capacity, limit,
           phone, ternY, keep[] (debug), safe
w.mounds[] (snow drifts) { id, x, y (bottom centre), w, h0, row, thing, size (thing height px), state 'buried'|'digging'|'open'|'found'|'empty',
           dig 0..1, rise 0..~1.2, peek, thingY (thing bottom centre y), clipY, tsx, tsy (thing squash), twob (px, wiggle x),
           trot (rad, tilt about the thing's bottom; a right hat spins one full turn), glow 0..1, wob (px, drift jiggle x),
           pop 0..~1.1 (drift scale about its bottom centre), dim 0..1, sparkle 0..1,
           + _pdig _prise _pthingY _pclipY _ptsx _ptsy _ptwob _ptrot _pwob _ppop }
           Draw back rows first (sort by y). Per drift, translate(x + wob, y), scale(pop):
             dig > 0.3 → DigArt.drawHoleBack(ctx, m, {night})
             state ≠ 'empty' → clip y < clipY; translate(x + twob, thingY) rotate(trot) scale(tsx, tsy):
               DigArt.drawThing(ctx, thing, size, {wob: 0, glow, dim, night})
             DigArt.drawMound(ctx, m, {glow, wob: 0, pop: 1, night, sparkle})      (front of the drift / rims)
             rise > 0.6 → the thing again UNCLIPPED on top (never cut by the front rim)
w.shovel   (Nuka's PAW) { x, y (paw TIP), angle (rad; 0 = pointing down; + = clockwise), sand 0..1 (snow on the paw), alpha,
           state 'off'|'in'|'scoop'|'wait'|'out', size 118, _px, _py, _pangle } → DigArt.drawShovel(ctx, angle, size, {sand}) at (x, y),
           globalAlpha = alpha (skip when 'off')
w.sand[]   (snow clumps) { x, y, r, rot, alpha, landed, _px, _py, _prot } (≤ 80) → DigArt.drawSandBit(ctx, r, rot, {}) — in FRONT of the drifts
w.flying[] { thing, x, y (bottom centre), rot, s (drawn size px), sx, sy, trail [{x, y}] (≤ 10 CENTRE points, oldest first: a sparkle
           trail), _px, _py, _prot, _ps } → drawThing at (x, y), rotate(rot), scale(sx, sy), size s — above everything but the HUD
w.shelfItems[] { thing, slot, x, y (bottom centre; bounce + settle included), s (slot size 64 | 84; shrinks while leaving), sx, sy,
           bounce 0..1, leave 0..1 (rising 120 px out of the ribbon), alpha, _px, _py } → after DigArt.drawShelf(ctx, layout.shelf,
           {t, n: aurora.n, ripple: aurora.ripple, night})
w.aurora   { n (finds in the ribbon), glow 0..1 (a flash per find, decays), ripple 0..1 (round-end cheer) }
w.eggBits  always [] (kept so an older renderer does not break)
w.hintHand null | { x, y (fingertip now), x0, y0 (target), t 0..1 (cycle phase), press 0..1, alpha, id, rub? } →
           DigArt.drawGhostHand(ctx, size, press, {rub}) — rub: true = the once-per-session rub demo (x swishes ±46 px)
w.bun      (Nuka) { x, y (feet), h, mood idle|talk|happy|cheer|think|oops|wave|point|dig|slide, moodT, blink (bool), look −1..1,
           hop 0..1 (+ _phop; draw y − hop·18 px with a small stretch), slide 0..1 (0 standing, 1 on his tummy: nuka_slide.svg),
           slideX (+ _pslideX: draw the feet point at x + slideX), slideDir ±1 (−1 while sliding back) }
w.seal     null | { x, y (bottom anchor = the ice hole), h, up 0..~1.1, spin (rad), sx, sy, state 'up'|'happy'|'down', _pup, _pspin }
           → seal.svg ('happy': seal_happy.svg) bottom at y + (1 − up)·h, clipped to y < seal.y + 2 (it rises out of its hole), rotate(spin)
w.tern     null | { x, y (centre), dir ±1 (+1 = faces right), flap 0..1 (≥ 0.5 → tern_flap.svg), rot, loop 0..1, size 150 (wide),
           state 'fly'|'loop'|'happy', _px, _py, _prot }
w.talk     { topic, promptKey, params, show: icon | null, choices [{id, thing: icon, value}], answer, answerId, glowAnswer }
           icon = DigArt.drawIcon kinds: hat {color} · blob {color} · gem {shape, color} · toy {animal} · fish {} · number {n} ·
           letter {text} · dots {n} · size {size, of 'fish'|'hat', color?}
```

## 4. Layout (DESIGN §2) — `computeLayout(W, H, ins, cfg, age, hudKeep)`
**QA round 1 changes (2026-11-08):**
- **Measured HUD → bubble → shelf (visual P1-1).** `hudKeep` = the boxes main.js measures: `[HUD, bubble]`; the HUD box is the one in
  the right half. Portrait: `bubble.y = max(ins.top + 110, HUD bottom + 8)`. Landscape: the bubble gets narrower beside the HUD
  when ≥ `bubbleMinW` 220 logical px are left, else it moves below it. Shelf: portrait `bubble.y + 124 + shelfGapPort` **52** on tall
  screens (H/W > 1.6: the tail 21 px + a 2-line Vietnamese bubble up to 150 px + 3) and `shelfGapPad` **24** on iPads; landscape
  `max(ins.top + 152, bubble bottom + 12)`. **main.js should now place the DOM bubble exactly at `layout.bubble`** (its own push is
  then never needed). Checked: iPhone 15 (720×1561, HUD keep bottom 214 → bubble 222, shelf items from 396 ≥ 222 + 171) and SE
  (720×1280, 173 → 181) keep capacity ≥ 8 at every age.
- **Phone tier (visual P2-1 / P2-2).** `phone` = long / short side > `phoneRatio` 1.9 (iPhones; not SE 1.78, not iPads). Phone
  portrait items × `phoneItemPort` **1.35** (151 px at ages ≤ 4), phone landscape × `phoneItemLand` **1.2** (134); the shelf shows
  `shelfItemPhone` 84 px finds on a `shelfHPhone` 112 px shelf, `shelfSlotsPhonePort` **8** slots in portrait (12 in landscape;
  spacing = min(max(76, size + 12), (w − size) / (n − 1)) → 84 on a 720-wide portrait). Each step falls back to the DESIGN sizes when
  the field would hold fewer than `minCapacity` 8 mounds. `layout.phone`; the shelf's slot count = `layout.shelf.slots.length`
  (8 or 12; when full the oldest rises out of the ribbon and fades; a rotation to 8 slots drops the oldest and closes the gaps).
- **Rows spread (visual P2-1):** `placeMounds` spreads the USED rows upward over the free height: gap =
  clamp((front y − limit) / used, rowGap, `rowSpreadY` 1.7 × rowGap); the front row stays on the ground. `field.y0` is now
  min(back row, limit). Row gap = max(170, spacing + 2·`jitterYMin` 3 + 1) and the vertical jitter shrinks to fit it
  (`layout.jitterY`, ±3.8 px at item 112 — this keeps the 720×960 iPad portrait at 3 rows / 8 mounds with the bigger shelf gap).
- **Landscape shelf fills from the RIGHT end** (`shelf.fromRight`; slot 0 is the rightmost), away from the bubble (visual P2-3).

- groundY = H − ins.bottom − (portrait 26 : 14). Bubble / HUD as DESIGN. Shelf: x = ins.left + 24, w = W − insets − 48, h = 92,
  landscape y = ins.top + 152, portrait y = bubble bottom + 14; 12 slots centred, spacing = min(76, (w − 64) / 11) (the end items
  stay on the plank; 56 px on a 720-wide portrait), slot y = plank top = shelf.y + 62.
- Nuka (`layout.bun`): landscape (ins.left + 118, groundY − 4), h 230; portrait (ins.left + 104, groundY − 4), h 200; w = 0.62 h; tap box + 10 px.
- item = 112 (ages ≤ 4) / 104 (5) / 96 (6+), × 1.15 when tall. Mound w = 1.55 item, h0 = 0.62 item; spacing = 1.45 item.
- Rows (front first): y = groundY − 18 − k·gap, gap = max(170, spacing + 2·jitterY + 1) (= 204 for tall phones, so neighbours in
  two rows also stay ≥ 1.45 item apart); landscape ≤ 2 rows, portrait ≤ 4; a back row only while y ≥ shelf bottom + item + 40 and its
  hit circles clear every top keep-out box. Row x: landscape ins.left + 250 … W − ins.right − 30; portrait front row from
  ins.left + 220, back rows from ins.left + 30 — **but any row whose mounds or hit circles reach Nuka's height band starts right of
  him** (portrait back rows would otherwise sit on his ears). The whole mound (± w/2) stays inside x0…x1.
- Capacity (mounds that fit): ≥ 8 on every iPhone / iPad viewport at every age (unit test; e.g. 960×720 iPad: 4 + 4,
  720×960: 2 + 3 + 3, iPhone portrait: 2 + 2 + 3 + 3, iPhone landscape: 6 + 6). `NK.Content.MAX_MOUNDS = 8`. Viewports in the odd
  1.45–1.77 portrait band (no Apple device) hold 6–7; `placeMounds` then squeezes the spacing (never below 0.6 item).
- `placeMounds(L, n, cfg, seed)`: the fewest rows that hold n, shares in proportion to row capacity, spread evenly (gap ≤ 2.1 ×
  spacing, the group centred), back rows offset ¼ gap, jitter ±14 px x (limited so two centres never get closer than the spacing)
  and ±8 px y; deterministic per round seed; re-run on every resize with the same seed.
- Hit test: circle (x, y − 0.45 item), r = 0.6 item + 14 (81 px at item 112), OR the visible box of the thing (± thingW·size/2 + 8,
  from the thing top − 8 to the mound bottom); the nearest centre wins. A mound under the finger always wins over the seal / tern.
- ternY = max(shelf bottom + 56, midway between the shelf bottom and the back row's hit top).

## 5. Motion (all numbers are `NK.CONFIG`)
| what | how | numbers |
|---|---|---|
| mounds appear (enter) | `pop` easeOutBack 0 → 1 (overshoot ≈ 10 %), staggered; the clue rises to its peek (`peekIn` smooth, 0.12 s late); a sand `puff` event each | popDelay 0.1, popStagger 0.12, popTime 0.35; enter = max(1.0, last pop + 0.2) s |
| peek | visible fraction at dig 0: hat 0.40, gem 0.42, toy 0.48, fish 0.42, tablet 0.62 (ages ≥ 5 × 0.85); + 0.15 × dig while digging | thingY = pileTop + size·(1 − peek·peekIn − 0.15·dig), pileTop = y − h0·(1 − dig), clipY = pileTop + 4 |
| idle wiggle | every 2.2–4.5 s one buried thing gets a tilt kick (spring) — "I'm here!" | wiggleKick 0.1 rad, ω 20, ζ 0.15 |
| shovel in | arc from above (or from where it is) to the hover pose, 0.16 s, smoothstep + 40 px lift | shovelIn 0.16 |
| scoop | **plunge** 40 % (accelerating, u²) into the bite pose → `scoop` event, dig target += 1/n, mound jiggle kick 4 px; **lift + fling** 60 % on a quadratic Bézier up and out to the side, angle swings from +0.22·side to −0.6·side; at half the lift the sand leaves the blade | scoopTime 0.34; tapped scoops 0.22; no tap: next scoop starts every autoScoop **0.85 s** (hover in between); sides alternate; rubbing: queued scoops (≤ 3) back to back at 0.22 s, flung the way the finger went |
| dig ease | `dig` follows its target exponentially (13 /s) | digRate 13 |
| sand clumps | 10 per scoop from the blade: 70 % to the fling side (vx 110–360), 30 % back over the mound (× 0.6), 28 % towards the camera (land 12–48 px lower, slower); vy −360…−620; gravity 1400 px/s²; one bounce (restitution 0.25) when hitting the ground faster than 260 px/s; fade 0.7 s after landing; `sandLand` events (≥ 0.07 s apart) | ≤ 80 clumps |
| dig time | age 3 (2 scoops): reveal 1.35 s after the tap, judged at 1.80 s; ages 4+ (3 scoops): 2.21 / 2.66 s; tapping along or rubbing: 0.82 / 1.27 s | |
| reveal | `rise` spring 0 → 1 (ω 16, ζ 0.5: peak 1.16 at ≈ 0.22 s); stretch = rv·0.016 (−0.14…+0.18) while shooting up; when it stops at the top a squash spring is kicked (peak 0.12, ω 22, ζ 0.35); tsx = 1/√tsy (volume kept); judged at 0.45 s | thing stands at y − 0.12 h0, clipY → y + 2 |
| wrong | horizontal wiggle spring (peak 8 px, ω 18, ζ 0.12 → about 6 visible swings), stays open; after 1 s `dim` → **1.0** (`dimTo`; dig_art desaturates fully toward sand-grey); after `wrongSinkAfter` 0.9 s it sinks back partly: the rise spring targets `wrongRise` **0.55** | |
| found (not a hat) | anticipation crouch 0.32 s (tsy 1 − 0.14·sin), then the float | prepTime 0.32 |
| hat twirl | one full turn about the hat's bottom, ease-in-out 0.5 s, lift 26·sin(πu) px, squash ±0.08, sparkle → `twirl` | twirlTime 0.5, twirlJump 26 |
| float to the aurora | ease-in-out (cubic) x / y to the slot, sway 18·sin(2πu) px, size → slot size, tilt 0.12·sin(2πu), trail of 10 centre points (every 0.03 s); landing: no squash, a settle spring (ω 14, ζ 0.32, 7 px up) | floatTime 0.9 |
| aurora ribbon | items ease to their slot (10 /s); cheer: a bounce wave (0.42 s each, 0.07 s stagger, 22 px) + `aurora.ripple`; a tap on the ribbon bounces the nearest item; full → the oldest rises and fades, the rest shift along; `aurora.glow` 1 per find | |
| clear | drifts and things sink (pop, rise, peekIn → 0, 0.4 s, a powder `puff` per drift); at a chapter end every find rises 120 px out of the ribbon and fades, staggered 0.06 s (clear lasts until they are gone) | clearTime 0.7, leaveTime 0.8, leaveRise 120 |
| belly-slide (cheer) | hop 0.25 → tummy 0.1 → out 0.7 (friction: x = D(1 − (1 − u)²)) → pause 0.25 → back 0.65 → stand 0.15 s; D = min(420, 0.45 W, screen edge − 0.47 h − 12); powder puffs every 0.09 s while > 60 px/s | cheerTime 2.2 |
| seal | pops out of an ice breathing hole on a free snow spot (≥ 1.25 item from every hit centre, clear of Nuka and keep-outs; else the tern comes) 3–8 s after the first ask; `up` spring (ω 14, ζ 0.42), stays 4 s; tap → happy twirl (one turn, easeOut 0.6 s) + squash, then ducks; untapped → a 2nd appearance 4 s later | sealR 62 |
| tern | glides across the sky band at 170 px/s, bob 14 px at 0.5 Hz, flap 2.6 Hz; tap → a full vertical loop (radius 70, 1.0 s, smoothstep) then flies off at 380 px/s rising 50 px; untapped → a 2nd pass 5 s later | ternR 70 |
| Nuka | mood timers; blink every 2.2–5 s; looks at the hint hand / the flying thing / the shovel / the surprise; `hop` sin over 0.42 s on every find, cheer and right Talk answer | |

## 6. Rounds, help, stars
- Steps: `ask` → digs → `found` (count / findAll: `count {i, n}`) → when every claimed thing is on the shelf `stepDone` → 0.6 s →
  next `ask` (main prefixes "Now…") or `roundDone` (cheer). A find step whose mound was dug open by an earlier wrong dig is
  re-targeted at ask time (`Content.retarget`: a still-buried mound that is asked uniquely); with nothing left the round ends.
- Count: every drift holds a fish (no wrong dig possible), the step ends at N, the spares stay buried. findAll (odd / even): a dig of
  the other parity is a mistake.
- Hit box of a peeking thing: from `thingTopPad` **40** px above its tip (was 8; playtest P1-1: children tap what they see, a bit high).
- **Early taps (functional P3-2):** a mound tap during `enter` is kept and replayed through `tap()` right after the first `ask`
  (if the mound is still buried) → `soft {kind: 'early', id, held: true}` at the tap + a small wobble; any other early tap →
  `soft {kind: 'early', id: null, held: false}`.
- Help: taps without progress in a step = wrong digs + empty snow TAPS (busy / already / shelf / Nuka / soft / rubbing empty snow are not). The 2nd → hint
  (`hint {id, x, y}`: the mound glows 3 s, the ghost hand taps its hit centre; cooldown 6 s; no new hint while one glows). The 6th
  (ages ≤ 4; `assistAfter` **6 → 4**, playtest P2-2) / 5th (5+) → **assist**: the next tap on any mound **or on the sand of the dig site** digs the right mound
  (`assist {id}`). A right find resets the counter. Idle (no dig, no press) 12 s → `idle {n}`, ×1.5 up to 30 s; the 2nd idle also
  hints. Misses (wrong digs only) give 3 / 2 / 1 stars for 0 / 1 / ≥ 2; +1 for a right Talk answer.
- Surprises: one round per chapter (round 1 or 2, never the warm-up), type `seal` / `tern` rotating per chapter.
- Chapter time: a round that starts after `shortBudget[round]` = 30 / 48 / 62 s into the chapter is "short" (ages ≤ 4: 1 step);
  Talk time after round 3 once the chapter passed 75 s.

## 7. Events (every positional event carries x, y in logical px)
| event | fields | when |
|---|---|---|
| `session` | levels | newSession |
| `level` | level, topic, weather | a chapter starts (main: weather.setWeather, chapter banner) |
| `round` | round, topic, surprise, steps, mode, mounds, short, key | a round starts |
| `puff` | id, x, y, sink? | a mound pops up (enter) / sinks (clear) — weather.addDust |
| `ask` | promptKey, params, mode, step, steps, first, round, nameKind, nameValue, need, x, y (Bun's mouth) | a step asks |
| `dig` | id, again, assist, rub, queued, added?, x, y | a dig starts (again: another tap / rub stroke on the digging drift) |
| `rub` | id, x, y, dir ±1, result ('dig' \| 'early') | a rub stroke on a drift (render flings snow towards dir; audio "shff") |
| `rubDemo` | id, x, y | the ghost hand demonstrates the rub (main: "Rub the snow!") |
| `scoop` | id, i, n, x, y | the blade bites (sound pitch steps with i) |
| `fling` | id, side, x, y | the sand leaves the blade |
| `sandLand` | x, y | a clump lands (≥ 0.07 s apart) — weather.addDust(x, y, 2) |
| `reveal` | id, thing, x, y | the last scoop is done, the thing rises ("pop") |
| `found` | id, thing, step, mode, count? {i, n}, last?, x, y | judged right |
| `twirl` | id, thing, x, y | a right hat spins ("twinkle", sparkles) |
| `hop` | id, float: true, slot, x, y, toX, toY, T | the find starts floating up to the aurora ("shimmer") |
| `shelved` | id, slot, thing, n, x, y | it settles in the ribbon ("chime"); n = finds in the ribbon |
| `wrong` | id, kind 'thing', thing, got {nameKind, nameValue, kind, color, shape, animal, text, size}, want {nameKind, nameValue, promptKey, params}, streak, misses, x, y | judged wrong |
| `already` | id, thing, x, y | an open / found / empty mound tapped |
| `busy` | id, x, y | another mound tapped while digging (soft, nothing said) |
| `sandTap` | x, y, rub? | empty snow (powder puff); rub: true = rubbing empty snow (≤ every 0.25 s, never a no-progress tap) |
| `shelfTap` | x, y, hit | the shelf tapped |
| `soft` | kind 'drag'|'hold'|'early', id (mound or null), held? (early: kept for the dig phase), x, y | a press that was not a tap / a tap while the mounds pop up |
| `pokeBun` | promptKey, params, mode, step, x, y | Nuka tapped (main repeats the prompt) |
| `hint` | id, x, y, want, idle? | hint |
| `assist` | id, x, y, fromX, fromY | the shovel digs the right mound for the child |
| `idle` | n, promptKey, params, mode, step | idle nudge |
| `stepDone` | step, steps, last | a step's finds are all on the shelf |
| `roundDone` | round, stars, misses, x, y | cheer starts |
| `clear` | chapterEnd | the clear phase starts |
| `shelfLeave` | n | chapter end: the finds rise out of the ribbon and fade |
| `slide` / `slidePuff` | dist, x, y · x, y, dir | the belly-slide starts ("wheee") / a powder puff along it |
| `seal` / `sealTap` | x, y | the seal pops up / is tapped (giggle, sparkles) |
| `tern` / `ternTap` | x, y, dir | the tern enters / is tapped (loop, feathers) |
| `talk` / `talkAsk` / `talkResult` | talk · n, glowAnswer · correct, choiceId, answerId, auto | Talk time |
| `levelDone` / `sessionDone` | level, stars · stars, treasures [{thing, level, round}] | |

## 8. Content (`NK.Content`, DESIGN §5.1)
- Mounds: warm-up 2 (ages ≤ 4) / 3 (5+), 1 step; later age 3: 2–3, age 4: 3–4, age 5: 4–5, ages 6+: 4–6; level 0 (the first chapter)
  at ages ≤ 4: ≤ 3 mounds, 1 step. Steps 1–2 at ages 3–4 (p(2 steps) = 0.35 / 0.5, and only with ≥ 3 mounds), 2 from age 5;
  always at least one more mound than steps. `scoops` 2 at age 3, else 3. The same set (order-free key; count: + N) never twice in
  a row; count N never repeats in a row.
- colors: hats, all colours different; below age 5 clash-free sets only (no blue+purple, red+green, yellow+orange, green+orange,
  **red+orange**, no pink) → at most 3 hats below age 5; **in the winter-night chapter (level % 4 = 3) at any age also never
  red+pink, blue+purple, red+orange** (from age 5 at most 5 hats at night). `pairsFor(age, level)`, `maxSafe(age, level)`; the same
  rule for gems and Talk choices (`makeTalk` takes `level`).
- **prevAns:** the world passes the answer asked last (`prevAns`, `prevAnsRun`) and `makeRound` re-rolls (≤ 40 tries) while the
  first ask equals it; size / odd-even (2 answers) allow at most 2 in a row; shapes5 is exempt; count uses `prevN`.
- Counting rounds dig with 2 scoops at every age. shapes ≤ 4: one colour, different gem shapes (age 3: circle, square, triangle,
  star, heart; 4: all 8), never square+rect, circle+oval, square+diamond. shapes5: a 2 × 2 grid of 2 shapes × 2 colours (+ one
  extra gem for 5 drifts) — the answer always has a same-colour and a same-shape partner. size: 2 drifts, two fish or two hats
  (one colour), big ×1.25 and small ×0.72 (1 step). animals: different plush toys (fox, hare, reindeer, walrus, whale, dog,
  goose, owl). count: fish, N: round 0 1–2, round 1 2–3, later 3–5 (≤ 4) / 4–7 (5) / 5–7 (6–7); level 0 at ages ≤ 4 later rounds
  2–3 with 1 spare; else drifts = min(8, N + 2). letters (age 5: 3 / 4 ice blocks), lower (small letters, no i / l, never b+d,
  p+q, b+p, d+q, m+w, n+u in one round), initial (toys with distinct initials in that language: EN F H R W W D G O → walrus and
  whale never together; VI C T T H C C N C → one of cáo / cá voi / chó / cú, one of thỏ / tuần lộc, hải mã, ngỗng: ≤ 4 toys),
  add / sub (number ice blocks near the answer), oddeven (findAll, 2–3 right, ≥ 1 other).
- `validate(round)` re-checks all of it (exactly one match per find ask via `matches`), `makeRound` retries up to 80 times and
  throws if it cannot. `content_stats.js 300`: 0 invalid in 24 000 chapter rounds, 0.0 % same set in a row.

## 9. Weather (`NK.Weather`, DESIGN §5.3)
`setWeather(i, {instant})` (0 spring, 1 summer, 2 autumn, 3 winter / polar night; 2.5 s smoothstep crossfade of every ambient number
+ colour), `resize(W, H, groundY)`, `update(dt)` (1/60 steps), `setParty(on)`, `addSand(x, y, n)` (white snow clumps), `addDust(x, y,
n)` (white powder `#F4F8FC / #E3ECF5 / #FFFFFF`), `burst(x, y, {kind: 'confetti'|'sparkle'|'stars'|'feathers'|'leaves'|'dots'|
'dust'|'sand'|'snow', n, color})`.
`ambient = { skyTop, skyMid, skyBottom, tint (rgba | null), light, night, sunX, sunY, sunA, moonX, moonY, moonA, mist, glow
(winter moonlight glow over the field), aurora, mood, moodIndex, env, envFrom, envMix, party }` — skies (DESIGN §3; the env artist's
RECIPE may refine them): spring #BFE3F5 → #EAF6FB, summer #86CBEF → #D4EEF8, autumn #C6A9C4 / #F3C79A → #F8E3C4, winter #1E2A52 →
#3B4F7E; sun low left (spring), high — the midnight sun (summer), low right (autumn); moon top right in winter. `aurora` (sky aurora
strength): spring 0.25, summer 0.15, autumn 0.45, winter 1. `clouds[6] {type, x, y, s, alpha, flipX}` drifting 7–16 px/s (3 / 2 /
3 / 1 visible per mood, dimmer at night). `particles[] {type = sprite, x, y, size, r, rot, alpha, layer, kind, color, flipX?}`:
spring lilac `petal`s on the breeze + light `mote`s + drip `sparkle`s low over the ground; summer cotton-grass `fluff` floating
sideways and bobbing + motes; autumn `leaf_a` / `leaf_b` tumbling on the breeze + warm motes; winter gentle snowfall (`snow`, 40 ×
area scale ≤ 56 total ambient → ≤ 56 flakes, 22–42 px/s × size/12, sway 10–24 px, melting into the field) + twinkling `star`s in the
sky band. No fireflies, no smoke. Cap 120 (ambient ≤ 56 × area scale). Sprites: snow, sand, dust, petal, fluff, leaf_a, leaf_b,
sparkle, star, mote, confetti_a, confetti_b, dot, feather. No DOM.

## 10. Bot (`NK.Bot`, DESIGN §5.4)
`new NK.Bot(world, {skill, seed, pRub = 0.5})`, `step(dt)` before `world.update(dt)`, optional `onEvent(e)` (counts found / wrong),
`stats` (+ `rubs`), `finger`, `rubOn(id)`. Only through `pointerDown / pointerMove / pointerUp`: after 1.0–2.4 s × (1.3 − 0.5·skill)
it digs the right drift with p = skill (always when the hint glows), else another buried drift — with p = pRub as a **rub** (press,
3–6 swings ±50 px over 0.4–0.9 s, every corner a pointerMove, lift), else a tap; after a tap, while its dig runs it re-taps the same
drift (p = 0.5 every 0.25 s); Talk right with p = skill (always when glowing); taps the seal / tern once with p = 0.6.

## 11. Playtest — Nuka's Snow Dig (`hs_playtest.js --n 280 --tag nk1`, 14 020 sessions, 1/30 s frames, 5 viewports, EN / VI; 2026-11-23)
0 failed sessions, 0 NaN, 0 stuck states, 0 off-screen paws, 0 "2 wrong digs without a hint". Max snow clumps 59 (≤ 80), aurora ≤ 12 finds.
Models: typical (40–50 % of its digs are rubs), **taponly** (never rubs), **rubber** (every dig a rub), slow3, perfect, tapper,
spammer, bot0.5 / 0.8 / 1 (bot: half rubs), absent.

| model | age | session min (p90) | chapter s mean [p10–p90] | round s (p90) | max round s | stars 3/2/1 % |
|---|---|---|---|---|---|---|
| typical | 3 | 4.6 (4.9) | 67.2 [58.5–78.0] | 11.7 (17.3) | 32.4 | 70 / 28 / 2 |
| typical | 4 | 5.1 (5.4) | 74.1 [59.1–89.0] | 13.4 (20.4) | 43.2 | 84 / 14 / 2 |
| typical | 5 | 5.8 (6.1) | 85.4 [78.9–93.7] | 16.2 (22.3) | 40.6 | 83 / 14 / 4 |
| typical | 6 | 5.7 (6.0) | 83.6 [77.5–91.8] | 15.7 (21.6) | 40.3 | 87 / 12 / 2 |
| typical | 7 | 5.4 (5.6) | 79.2 [71.2–86.0] | 14.6 (19.2) | 41.0 | 85 / 14 / 2 |
| taponly | 3 / 4 / 5 / 6 / 7 | 4.7 / 5.2 / 6.0 / 5.9 / 5.6 | 68.0 / 76.2 / 88.4 / 86.2 / 82.2 | 11.8 / 13.9 / 16.9 / 16.3 / 15.3 | 56.1 | 70–87 % 3★ |
| rubber | 3 / 4 / 5 / 6 / 7 | 4.5 / 4.9 / 5.6 / 5.5 / 5.2 | 65.7 / 72.1 / 82.6 / 80.7 / 76.0 | 11.3 / 12.9 / 15.4 / 15.0 / 13.8 | 43.2 | 70–87 % 3★ |
| slow 3-year-old | 3 / 4 | 6.1 (6.6) / 6.6 (7.2) | 90.2 [76.9–104.0] / 97.7 [84.2–114.8] | 17.7 / 22.3 | 61.9 / 93.2 | 58–65 % 3★ |
| slow3 profile at ages 5–7 | 5–7 | 7.7 (8.5–8.6) | 113.6–114.4 | 30.8–31.1 | 105.6 / 109.0 / **123.0** | 40–59 % 3★ |
| tapper | 3 / 7 | 5.7 / 7.0 | 84.4 / 103.7 | 16.3 / 28.5 | 87.1 | |
| spammer | 3 / 7 | 3.8 / 5.8 | 54.7 / 85.8 | 8.5 / 16.3 | 36.1 | |
| bot 0.8 | 3–7 | 3.0–4.4 | 43.8–64.7 | 6.5–11.7 | 25.0 | 69–84 % 3★ |
| perfect | 3–7 | 3.5–4.8 | 50.3–70.4 | 8.2–13.1 | 20.6 | 99 % 3★ |
| absent | 3–7 | (waits) | | | | idle at 15.5, 33.5, 60.5, 90.5, 120.5, 150.5 s |

Rubbing is clearly faster per dig (0.82 s vs 2.21 s to the reveal at 3 scoops) and saves 2–6 s per chapter (rubber vs taponly);
a tap-only toddler still plays a 68 / 76 s chapter (age 3 / 4), inside the 60–100 s target. Versus the base game (typical 65.8 /
73.3 s) chapters are about +1 s: the longer cheer (+0.8 s per round for the belly-slide) is paid back by rubbing. Per topic (typical
age 4): colours 62.6 s, shapes 74.0, count 85.0 (p90 95.4), animals 74.9.
The only round over 120 s (123 s, 1 of 3 382 rounds; p99 67 s) is the slow-3-year-old profile run on age-7 sums: 4 idle nudges
(≈ 87 s of no touch from the model's look-aways) + 3 wrong digs. That comes from the model, not the mechanics → no CONFIG change.
`content_stats.js 200`: 0 invalid rounds; VI `initial` rounds 3–4 toys.

### Base game (Bun's Dino Dig) QA round 1 regression, for comparison (`hs_playtest.js --n 60`, 2 700 sessions, after all QA fixes)
0 stuck rounds (max round 100 s), 0 stuck states, 0 NaN, 0 off-screen, 0 "2 wrong digs without a hint" for every model × age.
typical age 3 / 4 chapter 65.8 [56.8–77.3] / 73.3 [59.9–88.1] s, session 4.5 / 5.0 min (p90 4.9 / 5.3); slow 3-year-old 88.7 /
97.2 s (session p90 6.4 / 7.2 min); tapper 82.9 / 89.8 s (was 91.4 / 95.8, assist after 4); spammer 51.4 / 60.4 s; typical ages
5–7 77.7–83.6 s.

## 11b. Base game playtest numbers before its QA (`hs_playtest.js --n 100`, 4 300 sessions, 1/30 s frames, 5 viewports, EN / VI; 2026-11-08)
Targets: a toddler chapter 60–100 s, a session ≤ 8 min, 0 stuck rounds (> 120 s), 0 stuck states, 0 NaN.

| model | age | session min (p90) | chapter s mean [p10–p90] | round s (p90) | stars 3/2/1 % | wrong / round | hint rounds % | stuck rounds / states / NaN |
|---|---|---|---|---|---|---|---|---|
| typical | 3 | 4.6 (5.0) | 66.5 [57.0–77.9] | 12.4 (18.4) | 71 / 27 / 2 | 0.31 | 4.0 | 0 / 0 / 0 |
| typical | 4 | 5.1 (5.4) | 75.0 [60.3–90.3] | 14.6 (22.6) | 82 / 16 / 3 | 0.21 | 4.3 | 0 / 0 / 0 |
| typical | 5 | 5.8 (6.1) | 85.7 [77.5–95.6] | 17.2 (24.1) | 81 / 16 / 3 | 0.22 | 2.9 | 0 / 0 / 0 |
| typical | 6 | 5.7 (6.0) | 84.3 [76.0–94.5] | 16.8 (24.2) | 86 / 11 / 2 | 0.16 | 2.1 | 0 / 0 / 0 |
| typical | 7 | 5.3 (5.5) | 77.7 [69.5–85.3] | 15.1 (19.7) | 83 / 15 / 2 | 0.19 | 1.6 | 0 / 0 / 0 |
| slow 3-year-old | 3 | 6.0 (6.5) | 88.8 [75.1–102.7] | 18.3 (28.8) | 59 / 37 / 4 | 0.45 | 11.9 | 0 / 0 / 0 |
| slow 3-year-old | 4 | 6.6 (7.2) | 97.0 [82.4–117.5] | 22.8 (38.7) | 66 / 24 / 10 | 0.45 | 16.4 | 0 / 0 / 0 |
| random tapper | 3 | 6.2 (6.6) | 91.4 [81.6–100.5] | 19.6 (24.7) | 71 / 27 / 2 | 0.31 | 90.8 | 0 / 0 / 0 |
| random tapper | 7 | 7.1 (7.6) | 103.9 [91.7–117.4] | 29.5 (40.3) | 39 / 37 / 24 | 0.91 | 98.3 | 0 / 0 / 0 |
| spammer (6 taps/s) | 3 | 4.0 (4.3) | 58.7 [51.4–65.8] | 10.4 (12.9) | 45 / 46 / 9 | 0.64 | 31.9 | 0 / 0 / 0 |
| spammer (6 taps/s) | 7 | 5.9 (6.2) | 87.0 [75.3–98.4] | 17.5 (24.7) | 13 / 24 / 63 | 1.99 | 74.4 | 0 / 0 / 0 |
| bot 0.8 | 3–7 | 2.9–4.3 | 42–63 | 7.0–12.1 | 67–81 / 16–25 / 1–8 | 0.22–0.42 | 1–7 | 0 / 0 / 0 |
| absent | 3–7 | — (waits) | — | — | — | — | idle at 15.5, 33.5, 60.5, 90.5, 120.5, 150.5 s | 0 / 0 / 0 |

Per topic (typical): age 3 colours 66.9 s, shapes 67.5, size 62.8, animals 68.9; age 4 colours 63.6, shapes 73.5, count 87.8
(p90 97.7), animals 75.0; ages 5–7 72–93 s. The spammer's ≈ 11–19 `busy` taps per round are ignored softly (no line, no miss);
max 50 sand clumps on screen, the shelf never exceeds 12. Tuning history: (1) a random tapper had rounds up to 165 s and one
200 s stall because only mound taps could trigger the assist → a sand tap inside the dig site now triggers it too (max round
99 s); (2) the first scoop no longer uses up a queued tap (tapping along now digs in 0.82 s instead of 1.27 s); (3) the reveal got
an explicit squash at its stop (the velocity-only squash was 2 %, invisible). `shortBudget` 30 / 48 / 62 s keeps the slow
3-year-old's chapters ≤ 103 s (p90) while typical children almost never get a shortened round (0.3–2.8 % cut chapters).

## 12. Deviations from DESIGN (agreed / to note)
- Phone tier, measured-HUD bubble, shelf gaps 52 / 24, right-filled landscape shelf, spread rows, hop top clamp, red+orange and night
  pairs, wrong dim 1.0 + sink 0.55, early taps, 2-scoop counting (QA round 1, §4–§8).
- **≤ 8 mounds** (DESIGN says ≤ 10): with the DESIGN rows, item sizes and spacing a 960×720 iPad holds 8 (2 rows × 4) and so does a
  720×960 portrait (2 + 3 + 3). Count rounds therefore use N ≤ 7 with min(8, N + 2) mounds (ages 6–7: 5–7 instead of 5–10).
- Portrait **back rows start right of Nuka** when they reach his height band (otherwise the hit areas sit on his ears).
- Shelf slot spacing = min(max(76, size + 12), (w − size) / (n − 1)) instead of w / 12 (keeps the end items on the plank).
- A tap is judged at the **release** point (DESIGN §5.2); the seal / tern react on the press.
- Assist also triggers from a sand tap inside the dig site (DESIGN: "the next tap on any mound").
- During cheer / clear the state is `roundDone` (phase `cheer` / `clear`), like the paint game's `roundDone` + `clear`.
- Talk `size` icon: `{kind: 'size', size, of: 'fish'|'hat', color?}` (DESIGN §4.2 writes `kind:'fish'|'hat'`, which would clash) (`kind` is the drawIcon dispatch key, so the thing is `of`).
- VI `initial` rounds hold at most 4 toys (only 4 distinct VI initials among the 8 arctic toys); ages 6–7 later rounds therefore
  have 4 drifts in VI (EN: 4–6).
- The rub demo shows the gesture on the right drift without the hint glow (DESIGN: "demonstrates a rub on the right drift").
- `rub` is emitted only when the stroke dug / queued on that drift (or was held during `enter`), not for open holes or busy strokes.
- The world does not load `dig_art.js`: the hit box of a peeking thing uses `CONFIG.thingW` (hat 0.9, gem 1.0, toy 0.8, fish
  0.62, tablet 0.84 × size), close to `DigArt.thingBox`.
