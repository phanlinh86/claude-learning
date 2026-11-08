# Bun's Dino Dig — Mechanics (`DD.CONFIG`, layout, motion, render contract, events, playtest tuning)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.5.
Tests: `node tests/unit/run.js` (38 tests, ≈ 10 s: layouts on 15 named viewports + 400 fuzzed ones, ≈ 45 000 generated rounds,
world flows, full bot sessions; `node tests/unit/run.js <name part>` runs a subset).
Sims (report-only, `tests/sim/`): `node tests/sim/hs_playtest.js [--n 100] [--ages 3,4] [--models typical,slow3,…] [--jobs 2]
[--config '{…}'] [--tag x]` (→ `tests/sim/out/hs_<tag>.md`; exit 1 on a stuck round / NaN), `node tests/sim/content_stats.js
[chapters]`; `hs_browser.js` / `hs_browser_vp.js` drive the real page in Playwright (`?bot=1`). JSON reports are git-ignored.

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. **Screen space = world space** (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s per call, so `?speed=N` works). At the start of
  every sub-step each moving value is copied into its `_p` twin; render `v = _v + (v − _v)·w.alpha`.
- Determinism: content, the surprise round and its type use the world's seeded `DD.RNG`; cosmetic randomness (sand clumps, the
  shovel side, blinks, idle wiggles, mole spot score, pterosaur direction) a second seeded generator. Same seed + the same inputs on
  the same sub-steps → the same events whatever the frame size (unit test "deterministic").
- Every moving thing is a damped spring (`spring(o, k, kv, target, ω, ζ, h)`, semi-implicit Euler) or a closed-form ballistic
  path; `World.kickFor(peak, ω, ζ)` gives the initial velocity whose first peak is `peak`.

## 2. Public API (`DD.World`)
`new DD.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (no-op when nothing changed; set
`world.hudKeep = [{x,y,w,h}…]` then call it again: the back row moves below top DOM boxes), `setAge(a)` / `setLang(l)` (apply at
the next `newSession`), `newSession({lastTopics})`, `levels`, `startLevel(i)`, `update(dt)`, `drainEvents()`, `skipTalk()`,
`resetNudges()` (after a pause), `talkAnswer(choiceId)` → bool, `hint()` → `{mound: id}` | null (manual hint, e.g. a bubble tap),
`prompt()` → `{promptKey, params, mode, step, nameKind, nameValue, need}` in enter / dig, else null.
Fields: `layout, hudKeep, state, phase, level, topic, round, roundsPerLevel, step, stepInfo, cur (the round), stars, levelStars,
roundStars, misses, talk, talkAnswered, alpha, stateTime, phaseTime, tapMoveMin (64), interactive, weather (= level % 4), mounds,
dig, shovel, sand, flying, shelfItems, eggBits, bun, mole, ptero, hintHand, treasures`.
`interactive` = state `round`, phase `dig`, the step not finished and **no dig running** (a tap on a buried mound would start a
dig that gets judged).

**Input (one active pointer; extra fingers are dropped upstream):** `pointerDown(x, y)` → `'mole'` | `'ptero'` (they react on the
press, only when no mound is under the finger) | `'press'` | null; `pointerMove(x, y)`; `pointerUp(x, y)` → `'dig'` | `'busy'` |
`'already'` | `'pokeBun'` | `'sand'` | `'shelf'` | null. A **tap** = press + release within `tapTime` 1.0 s and < `tapMovePx` 64 px
(max(64, tapMoveMin)); it is judged at the **release** point. A drag or a long press digs nothing; it emits `soft` and gives the
mound under the press point a 3 px wobble — not a mistake, not a no-progress tap. `cancelDrag()` drops the press. `tap(x, y)` = an
already-classified tap (tests / keyboard).
**Tap rules in the dig phase:** buried mound, no dig running → dig it (`'dig'`); the digging mound again → one more scoop queued
(max 2, `dig {again: true}`); another mound while digging, or a buried one while the step is finishing → `'busy'` (soft, nothing
said, no miss); an open / found / empty mound → `'already'` (no miss); Bun → `'pokeBun'` (repeat the prompt); the shelf →
`'shelf'` (the nearest item hops); any other point → `'sand'` (a dust puff, counts as a tap without progress).
**Test hooks (logical px):** `moundTap(id)` → `{x, y}` (the hit centre: inside the hit area, clear of HUD / bubble / shelf),
`moundHit(id)` → `{x, y, r}`, `bunHit()` → `{x, y (centre), w, h}`, `moleHit()` / `pteroHit()` → `{x, y, r}` | null (only while
tappable), `answer()` → `{mound: id}` (what to tap next) | `{mound: id, digging: true}` (a dig is running: tapping it digs faster) |
null, `moundById(id)`. Static: `World.logicalSize(cssW, cssH)`, `World.computeLayout(W, H, ins, cfg, age, hudKeep)`,
`World.placeMounds(layout, n, cfg, seed)`, `World.kickFor`, `World.hopPath`.

### States and phases
`menu → intro (2.5 s) → round [enter → dig] → roundDone [cheer 1.4 s → clear ≥ 0.7 s] → … → talk → levelDone (1.8 s) → … →
sessionDone`. Talk time after round 4, or after round ≥ 3 once the chapter passed 75 s. Talk re-asks every 12 s (`talkAsk {n}`),
the answer glows from the 2nd re-ask, re-asks stop after 3; 12 s later Bun answers herself (`talkResult {auto: true}`, no star).
An absent child never finishes a round (no fail state, no auto-play): idle nudges come at 12 → 18 → 27 → 30 → 30 s.

## 3. Render contract (what render.js reads; everything else is internal)
```
w.layout   W, H, ins, portrait, tall (H/W > 1.6), groundY, bubble {x,y,w,h}, hud {x,y,w,h},
           shelf {x, y, w, h, slots[12]{x, y (plank top, item bottom centre)}, size 64, spacing}, bun {x, y (FEET), h, w},
           satchel {x, y} (where chapter-end items fly), field {x0, x1, y0 (back row y), y1 (front row y)}, rows[] {y, x0, x1, lo, hi, cap},
           item (thing base size), moundW, moundH, spacing, hitR, capacity, pteroY, keep[] (debug boxes), safe
w.mounds[] { id, x, y (bottom centre), w, h0, row, thing, size (thing height px), state 'buried'|'digging'|'open'|'found'|'empty',
           dig 0..1, rise 0..~1.2, peek, thingY (thing bottom centre y), clipY, tsx, tsy (thing squash), twob (px, wiggle x),
           trot (rad, tilt about the thing's bottom), glow 0..1, wob (px, mound jiggle x), pop 0..~1.1 (mound scale about its bottom
           centre), dim 0..1, crack 0..1, hatched, sparkle 0..1, + _pdig _prise _pthingY _pclipY _ptsx _ptsy _ptwob _ptrot _pwob _ppop }
           Draw back rows first (sort by y). Per mound, translate(x + wob, y), scale(pop):
             dig > 0.3 → DigArt.drawHoleBack(ctx, m, {night})
             state ≠ 'empty' → clip y < clipY; translate(x + twob, thingY) rotate(trot) scale(tsx, tsy):
               hatched ? draw characters/dino_baby_<thing.color>.svg (bottom anchor, height ≈ size)
                       : DigArt.drawThing(ctx, thing, size, {wob: 0, glow, dim, night, crack})
             DigArt.drawMound(ctx, m, {glow, wob: 0, pop: 1, night, sparkle})      (front of the pile / rims)
             rise > 0.6 → the thing again UNCLIPPED on top (never cut by the front rim)
w.shovel   { x, y (blade TIP), angle (rad; 0 = blade down, handle up; + = clockwise: handle leans right), sand 0..1, alpha,
           state 'off'|'in'|'scoop'|'wait'|'out', size 118, _px, _py, _pangle } → DigArt.drawShovel(ctx, angle, size, {sand}) at (x, y),
           globalAlpha = alpha (skip when 'off')
w.sand[]   { x, y, r, rot, alpha, landed, _px, _py, _prot } (≤ 80) → DigArt.drawSandBit(ctx, r, rot, {}) — in FRONT of the mounds
w.flying[] { thing, dino (colour | null), x, y (bottom centre), rot, s (drawn size px), sx, sy, _px, _py, _prot, _ps } → drawThing
           (or the dino SVG) at (x, y), rotate(rot), scale(sx, sy), size s — drawn above everything but the HUD
w.shelfItems[] { thing, dino, slot, x, y (bottom centre; bounce included), s (64; shrinks while leaving), sx, sy, bounce 0..1,
           leave 0..1, alpha, _px, _py } → on the plank after DigArt.drawShelf(ctx, layout.shelf)
w.eggBits[] { kind 'eggTop'|'eggBottom', color, x, y, rot, size, alpha, _px, _py, _prot } → drawThing({kind, color}, size)
w.hintHand null | { x, y (fingertip now), x0, y0 (target), t 0..1 (1.2 s cycle), press 0..1, alpha, id } → DigArt.drawGhostHand(ctx, size, press)
w.bun      { x, y (feet), h, mood idle|talk|happy|cheer|think|oops|wave|point|dig, moodT, blink (bool), look −1..1, hop 0..1
           (+ _phop; draw y − hop·18 px with a small stretch) }
w.mole     null | { x, y (bottom anchor), h, up 0..~1.1, spin (rad), sx, sy, state 'up'|'happy'|'down', _pup, _pspin } → mole.svg
           ('happy': mole_happy.svg) bottom at y + (1 − up)·h, clipped to y < mole.y + 2 (it rises out of its dirt ring), rotate(spin)
w.ptero    null | { x, y (centre), dir ±1 (+1 = faces right), flap 0..1 (≥ 0.5 → ptero_flap.svg), rot, loop 0..1, size 150 (wide),
           state 'fly'|'loop'|'happy', _px, _py, _prot }
w.talk     { topic, promptKey, params, show: icon | null, choices [{id, thing: icon, value}], answer, answerId, glowAnswer }
           icon = DigArt.drawIcon kinds: egg {color} · blob {color} · stone {shape, color} · toy {animal} · bone {} · number {n} ·
           letter {text} · dots {n} · size {size, of 'bone'|'egg', color?} · dino {color}
```

## 4. Layout (DESIGN §2) — `computeLayout(W, H, ins, cfg, age)`
- groundY = H − ins.bottom − (portrait 26 : 14). Bubble / HUD as DESIGN. Shelf: x = ins.left + 24, w = W − insets − 48, h = 92,
  landscape y = ins.top + 152, portrait y = bubble bottom + 14; 12 slots centred, spacing = min(76, (w − 64) / 11) (the end items
  stay on the plank; 56 px on a 720-wide portrait), slot y = plank top = shelf.y + 62.
- Bun: landscape (ins.left + 118, groundY − 4), h 230; portrait (ins.left + 104, groundY − 4), h 200; w = 0.62 h; tap box + 10 px.
- item = 112 (ages ≤ 4) / 104 (5) / 96 (6+), × 1.15 when tall. Mound w = 1.55 item, h0 = 0.62 item; spacing = 1.45 item.
- Rows (front first): y = groundY − 18 − k·gap, gap = max(170, spacing + 2·jitterY + 1) (= 204 for tall phones, so neighbours in
  two rows also stay ≥ 1.45 item apart); landscape ≤ 2 rows, portrait ≤ 4; a back row only while y ≥ shelf bottom + item + 40 and its
  hit circles clear every top keep-out box. Row x: landscape ins.left + 250 … W − ins.right − 30; portrait front row from
  ins.left + 220, back rows from ins.left + 30 — **but any row whose mounds or hit circles reach Bun's height band starts right of
  Bun** (portrait back rows would otherwise sit on his ears). The whole mound (± w/2) stays inside x0…x1.
- Capacity (mounds that fit): ≥ 8 on every iPhone / iPad viewport at every age (unit test; e.g. 960×720 iPad: 4 + 4,
  720×960: 2 + 3 + 3, iPhone portrait: 2 + 2 + 3 + 3, iPhone landscape: 6 + 6). `DD.Content.MAX_MOUNDS = 8`. Viewports in the odd
  1.45–1.77 portrait band (no Apple device) hold 6–7; `placeMounds` then squeezes the spacing (never below 0.6 item).
- `placeMounds(L, n, cfg, seed)`: the fewest rows that hold n, shares in proportion to row capacity, spread evenly (gap ≤ 2.1 ×
  spacing, the group centred), back rows offset ¼ gap, jitter ±14 px x (limited so two centres never get closer than the spacing)
  and ±8 px y; deterministic per round seed; re-run on every resize with the same seed.
- Hit test: circle (x, y − 0.45 item), r = 0.6 item + 14 (81 px at item 112), OR the visible box of the thing (± thingW·size/2 + 8,
  from the thing top − 8 to the mound bottom); the nearest centre wins. A mound under the finger always wins over the mole / ptero.
- pteroY = max(shelf bottom + 56, midway between the shelf bottom and the back row's hit top).

## 5. Motion (all numbers are `DD.CONFIG`)
| what | how | numbers |
|---|---|---|
| mounds appear (enter) | `pop` easeOutBack 0 → 1 (overshoot ≈ 10 %), staggered; the clue rises to its peek (`peekIn` smooth, 0.12 s late); a sand `puff` event each | popDelay 0.1, popStagger 0.12, popTime 0.35; enter = max(1.0, last pop + 0.2) s |
| peek | visible fraction at dig 0: egg 0.38, stone 0.42, toy 0.48, bone 0.40, tablet 0.62 (ages ≥ 5 × 0.85); + 0.15 × dig while digging | thingY = pileTop + size·(1 − peek·peekIn − 0.15·dig), pileTop = y − h0·(1 − dig), clipY = pileTop + 4 |
| idle wiggle | every 2.2–4.5 s one buried thing gets a tilt kick (spring) — "I'm here!" | wiggleKick 0.1 rad, ω 20, ζ 0.15 |
| shovel in | arc from above (or from where it is) to the hover pose, 0.16 s, smoothstep + 40 px lift | shovelIn 0.16 |
| scoop | **plunge** 40 % (accelerating, u²) into the bite pose → `scoop` event, dig target += 1/n, mound jiggle kick 4 px; **lift + fling** 60 % on a quadratic Bézier up and out to the side, angle swings from +0.22·side to −0.6·side; at half the lift the sand leaves the blade | scoopTime 0.34; tapped scoops 0.22; no tap: next scoop starts every autoScoop 0.55 s (hover in between); sides alternate |
| dig ease | `dig` follows its target exponentially (13 /s) | digRate 13 |
| sand clumps | 10 per scoop from the blade: 70 % to the fling side (vx 110–360), 30 % back over the mound (× 0.6), 28 % towards the camera (land 12–48 px lower, slower); vy −360…−620; gravity 1400 px/s²; one bounce (restitution 0.25) when hitting the ground faster than 260 px/s; fade 0.7 s after landing; `sandLand` events (≥ 0.07 s apart) | ≤ 80 clumps |
| dig time | age 3 (2 scoops): reveal 1.05 s after the tap, judged at 1.50 s; ages 4+ (3 scoops): 1.60 / 2.05 s; tapping along: 0.82 / 1.27 s | |
| reveal | `rise` spring 0 → 1 (ω 16, ζ 0.5: peak 1.16 at ≈ 0.22 s); stretch = rv·0.016 (−0.14…+0.18) while shooting up; when it stops at the top a squash spring is kicked (peak 0.12, ω 22, ζ 0.35); tsx = 1/√tsy (volume kept); judged at 0.45 s | thing stands at y − 0.12 h0, clipY → y + 2 |
| wrong | horizontal wiggle spring (peak 8 px, ω 18, ζ 0.12 → about 6 visible swings), stays open; after 1 s `dim` → 0.35 | |
| found (not an egg) | anticipation crouch 0.32 s (tsy 1 − 0.14·sin), then the hop | prepTime 0.32 |
| egg hatch | 0.9 s: tilt wobble 3 cycles (0.16 rad, growing), `crack` smoothstep 0 → 1 over 0.75 s, then `hatch`: `hatched` = true, two shell halves fly (top: ballistic up-sideways with spin; bottom: a small hop), fade 0.8 s after landing; the baby dino jumps 46 px (0.35 s air, stretch at take-off) and lands with a squash (0.15 s), then hops to the shelf | hatchTime 0.9, dinoJump 46, dinoJumpTime 0.5 |
| hop to the shelf | true ballistic arc: x linear in t, y = yA + c(u − u*)², apex yA = 140 px above the higher end, gravity 3000 px/s² (T ≈ 0.94 s from the front row of a 960×720 iPad, ≈ 1.2 s from the front row of an iPhone portrait); stones / bones / tablets spin exactly one turn, eggs / toys / dinos lean ±0.2 rad; size → 64 (smoothstep); take-off stretch 0.18·(1 − u)³; landing squash 0.28 (spring ω 22, ζ 0.35) | hopG 3000, hopApex 140 |
| shelf | items slide to their slot (10 /s); cheer: a bounce wave (0.42 s each, 0.07 s stagger, 22 px) with a small landing squash; a tap on the shelf bounces the nearest item; 12 full → the oldest slides away into the satchel and the rest shift left | |
| clear | mounds and things sink (pop, rise, peekIn → 0, 0.4 s, sand `puff` per mound); at a chapter end the shelf items fly in a 60 px arc into Bun's satchel, staggered 0.04 s, shrinking to 0.4, fading in the last 30 % (clear lasts until they are in) | clearTime 0.7, leaveTime 0.45 |
| mole | pops out of a free sand spot (≥ 1.25 item from every hit centre, clear of Bun and keep-outs; else the pterosaur comes) 3–8 s after the first ask; `up` spring (ω 14, ζ 0.42), stays 4 s; tap → happy twirl (one turn, easeOut 0.6 s) + squash, then ducks; untapped → a 2nd appearance 4 s later | moleR 62 |
| pterosaur | glides across the sky band at 170 px/s, bob 14 px at 0.5 Hz, flap 2.6 Hz; tap → a full vertical loop (radius 70, 1.0 s, smoothstep) then flies off at 380 px/s rising 50 px; untapped → a 2nd pass 5 s later | pteroR 70 |
| Bun | mood timers; blink every 2.2–5 s; looks at the hint hand / the flying thing / the shovel / the surprise; `hop` sin over 0.42 s on every find, cheer and right Talk answer | |

## 6. Rounds, help, stars
- Steps: `ask` → digs → `found` (count / findAll: `count {i, n}`) → when every claimed thing is on the shelf `stepDone` → 0.6 s →
  next `ask` (main prefixes "Now…") or `roundDone` (cheer). A find step whose mound was dug open by an earlier wrong dig is
  re-targeted at ask time (`Content.retarget`: a still-buried mound that is asked uniquely); with nothing left the round ends.
- Count: every mound holds a bone (no wrong dig possible), the step ends at N, the spares stay buried. findAll (odd / even): a dig of
  the other parity is a mistake.
- Help: taps without progress in a step = wrong digs + empty sand taps (busy / already / shelf / Bun / soft are not). The 2nd → hint
  (`hint {id, x, y}`: the mound glows 3 s, the ghost hand taps its hit centre; cooldown 6 s; no new hint while one glows). The 6th
  (ages ≤ 4) / 5th (5+) → **assist**: the next tap on any mound **or on the sand of the dig site** digs the right mound
  (`assist {id}`). A right find resets the counter. Idle (no dig, no press) 12 s → `idle {n}`, ×1.5 up to 30 s; the 2nd idle also
  hints. Misses (wrong digs only) give 3 / 2 / 1 stars for 0 / 1 / ≥ 2; +1 for a right Talk answer.
- Surprises: one round per chapter (round 1 or 2, never the warm-up), type `mole` / `ptero` rotating per chapter.
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
| `dig` | id, again, assist, queued, added?, x, y | a dig starts (again: another tap on the digging mound) |
| `scoop` | id, i, n, x, y | the blade bites (sound pitch steps with i) |
| `fling` | id, side, x, y | the sand leaves the blade |
| `sandLand` | x, y | a clump lands (≥ 0.07 s apart) — weather.addDust(x, y, 2) |
| `reveal` | id, thing, x, y | the last scoop is done, the thing rises ("pop") |
| `found` | id, thing, step, mode, count? {i, n}, last?, x, y | judged right |
| `hatch` | id, color, x, y | an egg hatches (crack + chirp, sparkles) |
| `hop` | id, dino, slot, x, y, toX, toY | the thing / dino jumps to the shelf |
| `shelved` | id, slot, dino, thing, x, y | it lands on the plank ("clonk") |
| `wrong` | id, kind 'thing', thing, got {nameKind, nameValue, kind, color, shape, animal, text, size}, want {nameKind, nameValue, promptKey, params}, streak, misses, x, y | judged wrong |
| `already` | id, thing, x, y | an open / found / empty mound tapped |
| `busy` | id, x, y | another mound tapped while digging (soft, nothing said) |
| `sandTap` | x, y | empty sand (dust puff) |
| `shelfTap` | x, y, hit | the shelf tapped |
| `soft` | kind 'drag'|'hold', id (mound or null), x, y | a press that was not a tap |
| `pokeBun` | promptKey, params, mode, step, x, y | Bun tapped (main repeats the prompt) |
| `hint` | id, x, y, want, idle? | hint |
| `assist` | id, x, y, fromX, fromY | the shovel digs the right mound for the child |
| `idle` | n, promptKey, params, mode, step | idle nudge |
| `stepDone` | step, steps, last | a step's finds are all on the shelf |
| `roundDone` | round, stars, misses, x, y | cheer starts |
| `clear` | chapterEnd | the clear phase starts |
| `shelfLeave` | n, x, y (satchel) | chapter end: the shelf empties into the satchel |
| `mole` / `moleTap` | x, y | the mole pops up / is tapped (giggle, sparkles) |
| `ptero` / `pteroTap` | x, y, dir | the pterosaur enters / is tapped (loop, feathers) |
| `talk` / `talkAsk` / `talkResult` | talk · n, glowAnswer · correct, choiceId, answerId, auto | Talk time |
| `levelDone` / `sessionDone` | level, stars · stars, treasures [{thing, dino, level, round}] | |

## 8. Content (`DD.Content`, DESIGN §5.1)
- Mounds: warm-up 2 (ages ≤ 4) / 3 (5+), 1 step; later age 3: 2–3, age 4: 3–4, age 5: 4–5, ages 6+: 4–6; level 0 (the first chapter)
  at ages ≤ 4: ≤ 3 mounds, 1 step. Steps 1–2 at ages 3–4 (p(2 steps) = 0.35 / 0.5, and only with ≥ 3 mounds), 2 from age 5;
  always at least one more mound than steps. `scoops` 2 at age 3, else 3. The same set (order-free key; count: + N) never twice in
  a row; count N never repeats in a row.
- colors: eggs, all colours different; below age 5 clash-free sets only (no blue+purple, red+green, yellow+orange, green+orange, no
  pink) → at most 3 eggs below age 5 (no clash-free set of 4 exists). shapes ≤ 4: one colour, different shapes (age 3: circle,
  square, triangle, star, heart; 4: all 8), never square+rect, circle+oval, square+diamond. shapes5: a 2 × 2 grid of 2 shapes ×
  2 colours (+ one extra stone for 5 mounds) — the answer always has a same-colour and a same-shape partner. size: 2 mounds, one
  kind (bone / egg / toy), big ×1.25 and small ×0.72 (1 step). animals: different toys. count: bones, N: round 0 1–2, round 1 2–3,
  later 3–5 (≤ 4) / 4–7 (5) / 5–7 (6–7); level 0 at ages ≤ 4 later rounds 2–3 with 1 spare; else mounds = min(8, N + 2).
  letters (age 5: 3 / 4 tablets), lower (small letters, no i / l, never b+d, p+q, b+p, d+q, m+w, n+u in one round), initial (toys
  with distinct initials in that language; VI leaves out ếch — Ê is not in the VI letter pool), add / sub (number tablets near the
  answer), oddeven (findAll, 2–3 right, ≥ 1 other).
- `validate(round)` re-checks all of it (exactly one match per find ask via `matches`), `makeRound` retries up to 80 times and
  throws if it cannot. `content_stats.js 300`: 0 invalid in 24 000 chapter rounds, 0.0 % same set in a row.

## 9. Weather (`DD.Weather`, DESIGN §5.3)
`setWeather(i, {instant})` (0 morning, 1 noon, 2 sunset, 3 night; 2.5 s smoothstep crossfade of every ambient number + colour),
`resize(W, H, groundY)`, `update(dt)` (1/60 steps), `setParty(on)`, `addSand(x, y, n)`, `addDust(x, y, n)`, `burst(x, y, {kind:
'confetti'|'sparkle'|'stars'|'feathers'|'leaves'|'dots'|'dust'|'sand', n, color})`.
`ambient = { skyTop, skyMid, skyBottom, tint (rgba | null), light, night, sunX, sunY, sunA, moonX, moonY, moonA, mist, glow (night
lantern glow over the field), mood, moodIndex, env, envFrom, envMix, party }` — skies: morning #BFE6F2 → #FBE9C9, noon #7CC7EE →
#CDEBF6, sunset #B98BB5 / #F6A86B → #F9D7A0, night #1F2A55 → #3E4C7E; sun low left (morning), high (noon), low right (sunset);
moon top right at night. `clouds[6] {type, x, y, s, alpha, flipX}` drifting 7–16 px/s (3 / 5 / 3 / 1 visible per mood, dimmer at
night). `particles[] {type = sprite, x, y, size, r, rot, alpha, layer, kind, color, flipX?}`: morning motes + dew sparkles, noon
fern bits on the breeze, sunset warm motes, night fireflies (smooth random walk, blinking) + twinkling stars in the sky band; cap
120 (ambient ≤ 56 × area scale). Sprites: sand, dust, leaf_a, leaf_b, sparkle, star, firefly, mote, confetti_a, confetti_b, dot,
feather. No DOM.

## 10. Bot (`DD.Bot`, DESIGN §5.4)
`new DD.Bot(world, {skill, seed})`, `step(dt)` before `world.update(dt)`, optional `onEvent(e)` (counts found / wrong), `stats`,
`finger`. Taps only through `pointerDown / pointerUp`: after 1.0–2.4 s × (1.3 − 0.5·skill) it digs the right mound with p = skill
(always when the hint glows), else another buried mound; while its dig runs it re-taps the same mound (p = 0.5 every 0.25 s);
Talk right with p = skill (always when glowing); taps the mole / pterosaur once with p = 0.6.

## 11. Playtest numbers (`hs_playtest.js --n 100`, 4 300 sessions, 1/30 s frames, 5 viewports, EN / VI; 2026-11-08)
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
- **≤ 8 mounds** (DESIGN says ≤ 10): with the DESIGN rows, item sizes and spacing a 960×720 iPad holds 8 (2 rows × 4) and so does a
  720×960 portrait (2 + 3 + 3). Count rounds therefore use N ≤ 7 with min(8, N + 2) mounds (ages 6–7: 5–7 instead of 5–10).
- Portrait **back rows start right of Bun** when they reach his height band (otherwise the hit areas sit on his ears).
- Shelf slot spacing = min(76, (w − 64) / 11) instead of w / 12 (keeps the end items on the plank).
- A tap is judged at the **release** point (DESIGN §5.2); the mole / pterosaur react on the press.
- Assist also triggers from a sand tap inside the dig site (DESIGN: "the next tap on any mound").
- During cheer / clear the state is `roundDone` (phase `cheer` / `clear`), like the paint game's `roundDone` + `clear`.
- Talk `size` icon: `{kind: 'size', size, of: 'bone'|'egg', color?}` (`kind` is the drawIcon dispatch key, so the thing is `of`).
- VI `initial` rounds leave out the frog (ếch starts with Ê, which is not in the VI letter pool / prompts).
- The world does not load `dig_art.js`: the hit box of a peeking thing uses `CONFIG.thingW` (egg 0.78, stone 1.0, toy 0.8, bone
  0.62, tablet 0.84 × size), close to `DigArt.thingBox`.
