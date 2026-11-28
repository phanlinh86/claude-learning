# Mit's Treasure Map — Mechanics (`TM.CONFIG`, layout, motion, render contract, events, playtest numbers)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.5.
Tests: `node tests/unit/run.js` (44 tests, ≈ 25 s: layouts on 17 named viewports × 5 ages + 400 fuzzed ones with notch insets and
measured HUD boxes, ≈ 35 000 generated rounds checked with an independent matcher, world flows for wash-in / floating bob + hit circle / drip, correct / near-miss / wrong /
outside / tap drops + their splashes, help, alive + roll-up + scroll to Mit, session chest, surprises (sideways crab, bubbles + fish), rotation, determinism, every topic × age completable, 50 full bot sessions;
`node tests/unit/run.js <name part>` runs a subset).
Sims (report-only, `tests/sim/`): `node tests/sim/hs_playtest.js [--n 60] [--ages 3,4] [--models typical,slow3,…] [--jobs 4]
[--config '{…}'] [--tag x]` (→ `tests/sim/out/hs_<tag>.md`; exit 1 on a stuck round / stuck state / NaN / piece off screen),
`node tests/sim/content_stats.js [chapters]`; `hs_browser.js` / `hs_browser_vp.js` / `hs_voicelog.js` drive the real page in
Playwright (`?bot=1`).

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. **Screen space = world space** (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s per call, so `?speed=N` works). At the start of
  every sub-step each moving value is copied into its `_p` twin; render `v = _v + (v − _v)·w.alpha`.
- Determinism: content, the surprise round and its type use the world's seeded `TM.RNG`; cosmetic randomness (rest tilts, drop
  tumble, wiggles, blinks, crab / bubble details) a second seeded generator. Same seed + the same inputs on the same sub-steps →
  the same events whatever the frame size (unit test "deterministic").
- Every moving thing is a damped spring (`spring(o, k, kv, target, ω, ζ, h)`, semi-implicit Euler), a ballistic fall, or a closed-form
  constant-acceleration arc (`World.arc(x0, y0, x1, y1, T, apex, vx0, minY)`); `World.kickFor(peak, ω, ζ)` gives the initial
  velocity whose first peak is `peak` (used for every squash / jiggle).
- The world never needs `puzzle_art.js`; when `TM.PuzzleArt.pieceBox` is loaded it uses the real visible box (bottom-aligned tray
  homes, drop zones), else a size × size box.

## 2. Public API (`TM.World`)
`new TM.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (no-op when nothing changed; set
`world.hudKeep = [{x,y,w,h}…]` (the measured HUD / bubble boxes) then call it again), `setAge(a)` / `setLang(l)` (apply at the next
`newSession`), `newSession({lastTopics})`, `levels`, `startLevel(i)`, `update(dt)`, `drainEvents()`, `skipTalk()`, `resetNudges()`
(after a pause), `talkAnswer(choiceId)` → bool, `hint()` → `{piece, slot}` | null, `prompt()` → `{promptKey, params, mode, step,
nameKind, nameValue, need}` in enter / play, else null, `cancelDrag()`, `drawOrder()` (= `w.pieces`, already sorted).
Fields: `layout, hudKeep, state, phase, level, topic, round, cur, step, stepInfo, roundsPerLevel, stars, levelStars, roundStars, misses,
talk, talkAnswered, alpha, stateTime, phaseTime, interactive, weather (= level % 4), pieces, slots, board, mit, crab, bubbles,
hintHand, pictures, magnet, held, finger`.
States `menu → intro (2.5 s) → round [enter → play] → roundDone [alive 2.4 s → turn 0.8 s] → … → talk → levelDone (3.6 s) → … →
sessionDone`. **During alive / turn the state is `roundDone`** (phase `alive` / `turn`), like the sister game's cheer / clear.
`interactive` = state `round`, phase `play`, the step still open (not in the 1.0 s `askGap` after a fit) and no piece snapping.

**Input (one active pointer; extra fingers are dropped upstream)** — logical px:
- `pointerDown(x, y)` → `'grab'` (a tray piece under the finger: rest or gliding home; hit circle r = 0.6 × size + 26 (circles of neighbours may overlap), the nearest
  centre wins — a piece always wins over a surprise) | `'crab'` | `'bubble'` (react on the press) | `'mit'` (Mit's box; the tap
  fires on release) | `'soft'` (empty space / the board / a placed piece in play) | `'early'` (during enter) | null.
- `pointerMove(x, y)`; `pointerUp(x, y)` → `'snap'` | `'nearMiss'` | `'wrong'` | `'home'` | `'tap'` | `'pokeMit'` | null.
- **Tap** = moved < `tapMovePx` 24 px and released within `tapTime` 0.35 s → the piece hops home (40 px arc), `tapPiece`; never a drop.
- A release judges the **release point: the piece centre or the finger point** (either inside counts):
  asked piece in its slot zone (or, with `magnet`, anywhere in the board zone) → snap; asked piece elsewhere on the board → near miss;
  another piece on the board → wrong (a miss); off the board → home (quiet). findAll: any unplaced target is "asked" (its own slot).
- A release during the gap after a fit starts the next step at once (its `ask`) and is judged against it.
- `cancelDrag()` (touchcancel / pause / rotation): the held piece glides home, no event.
**Test hooks (logical px):** `pieceHit(id)` → `{x, y, r}`, `slotDrop(id)` → the slot centre (inside its zone), `slotZone(id)`,
`boardZone()`, `mitHit()` → `{x, y (CENTRE), w, h}`, `crabHit()` / `bubbleHit()` → `{x, y, r}` | null (only while tappable; the crab is never over the tray; a bubble not
under a tray piece), `answer()` → `{piece, slot}` | null, `pieceById`, `slotById`. Static: `World.logicalSize(cssW, cssH)`,
`World.computeLayout(W, H, ins, cfg, age, hudKeep)`, `World.placeSlots(board, sizes, item, cfg, seed)`, `World.traySpots(L, n, maxSize,
cfg)`, `World.kickFor`, `World.arc`.

## 3. Render contract (what render.js reads; everything else is internal)
```
w.layout   W, H, ins, portrait, tall (H/W > 1.6), phone (long/short > 1.9), groundY, bubble {x,y,w,h}, hud {x,y,w,h},
           mit {x, y (FEET), h, w}, mitBox {x,y,w,h} (tap box), board {x, y, w, h, r 26}, frame 22, item, maxSize, slotScale 1, hitR,
           tray {x, y (= board bottom + 30: the zone line), w, h, rows [{x0, x1, y (LEDGE: piece bottoms)}] (top row first),
                 spots [{x, y (resting centre of a normal piece), row}] (maxPieces of this age)}, keep [boxes], safe, fits
w.board    { x, y, w, h, r (rest rect), ox (px), tilt (rad about the board centre), jig (px, down), shine 0..1, alive 0..1, turn 0..1,
           unroll 0..1 (enter: ease-out 1 − (1 − u)³ over 0.7 s; draw only the TOP `unroll` fraction of the parchment + the roll at
             its lower edge y + unroll·h; slots / placed pieces clipped the same way),
           turn 0..1 (ROLL-UP: smooth over 0.9 s; draw only the TOP (1 − turn) fraction + the roll at y + (1 − turn)·h; 1 = gone),
           scrollX, scrollY (px, the roll's centre: during the roll-up = board centre x, the roll line; then it flies on an arc to
             Mit's paws (mit.x + 0.32 h, mit.y − 0.42 h) in 0.45 s), scrollK 1 → 0.35 (scale), scrollT 0..1 (fly progress, 0 while
             rolling), scrollA 0..1 (alpha: 1 while rolling / flying, fades in the last 25 % of the flight; 0 outside the turn phase),
             scrollRot (rad, the roll spinning) → PuzzleArt.drawScroll(ctx, board.w × scrollK, r) at (scrollX, scrollY) rotated,
           scene ('cove'|'sails'|'cave'|'lagoon'|'shore'|'deck'), season 0..3 (= the weather MOOD index), flip (bool, mirrored
             picture), show (bool: a board is on screen) } + _pox _ptilt _pjig _pturn _pshine _palive _punroll _pscrollX _pscrollY
           → translate(ox, jig) · rotate(tilt) about the centre (ox: a small 60 px spring slide while unrolling, tilt ≤ 0.04)
             → PuzzleArt.drawBoard(ctx, {w, h, r}, scene, season, {shine, alive, t}); then the SLOTS and PLACED pieces in the same
             transform (their x, y are rest positions with ox = 0).
w.slots[]  { id, piece, thing, u, v (0..1 of the board), x, y (centre), size, filled, glow 0..1 (hint / near-miss pulse) }
           → unfilled: PuzzleArt.drawShadow(ctx, thing, size, {glow})
w.pieces[] { id, thing, slot, size, state 'drop' (= washing in from the right)|'rest' (floating)|'held'|'snap'|'placed'|'home'|'wrong'|'gone', x, y (centre), rot,
           sx, sy (squash × LIFT SCALE: 1.12 when held — draw scale(sx, sy) as is), lift 0..1, glow 0..1, dim, count −1|0..n,
           ax, ay, arot (alive offsets), alive 0..1, pop 0..~1.15 (0 = invisible: not dropped yet / poofed), homeX, homeY, homeRot,
           boxW, boxH, drip 0..1 (1 at a pickup → 0 linearly in 0.4 s: draw 3 drips falling from the lifted piece),
           ph (rad, its bob phase), wx (px, the wash-in / wobble offset already in x) } + _px _py _prot _psx _psy _plift _pax _pay _parot _ppop
           FLOATING: a resting piece's x = homeX + wx, y = homeY + 4·sin(1.7 t + ph) (+ squash), rot → homeRot + 0.05·sin(1.3 t + ph)
             (t = world time) — x, y, rot already include the bob, so draw them as they are; the hit circle (0.6 × size + 26) is
             centred on the CURRENT x, y (pieceHit). Every arc home lands exactly on the bobbed spot (no jump).
           Already in DRAW ORDER: tray (rest / drop / gone) → placed → moving (home / wrong / snap) → the held piece LAST.
           → skip pop ≤ 0; translate(x + ax, y + ay) rotate(rot + arot) scale(sx·pop, sy·pop) →
             PuzzleArt.drawPiece(ctx, thing, size, {glow, lift, dim, count, alive, season})
w.mit      { x, y (feet), h, mood idle|talk|happy|cheer|think|oops|wave|point|woof, moodT, blink (bool), look −1..1, hop 0..1 (+ _phop) }
w.hintHand null | { id, slot, x, y (fingertip now), x0, y0 (piece home), x1, y1 (slot), t 0..1 (1.6 s cycle), press 0..1, alpha }
           → PuzzleArt.drawGhostHand(ctx, size, press) at (x, y), globalAlpha = alpha
w.crab   null | { x, y (FEET incl. the hop), dir ±1 (the SIDEWAYS travel direction; the art is frontal — never flip it), step 0..1
           (scuttle phase, 5 Hz while moving: alternate the 4 legs, sway the body ± a few px), scuttle 0..1 (1 while moving, eases),
           peck 0..1 (claw snip while standing, 1.4 Hz), flap 0..1 (≥ 0.5 → crab_flap.svg = both claws up; 1 during the hop in / out,
           oscillating 4 Hz when tapped = waving), hop px, size 96 (drawn width), state 'land' (a sideways hop in from beyond the
           right edge onto the ledge, 0.6 s arc) | 'walk' | 'flap' (tapped: 40 px hop, claws waving, 0.9 s) | 'fly' (= hopping off:
           a 0.6 s arc down past the right edge), t, lo, hi (its ledge) } + _px _py — draw its contact shadow only in 'walk' / 'flap'
w.bubbles[] { x, y (centre), r, wob (rad), pop 0..1 (popping), state 'rise'|'pop' } + _px _py → PuzzleArt.drawBubble(ctx, r, {pop})
w.fish     null | { x, y (centre of the head at the water line, bobs ± 3 px, sinks 18 px as a fades), a 0..1 (appear: 0.3 s in while
           bubbles come, 0.3 s out after) } + _py _pa → PuzzleArt.drawFish(ctx, size ≈ 70, a). Only when the bubbles rise in the band
           right of the board (never over the board).
w.chest    null | { x, gy (bottom centre in px: the bottom tray ledge = the sand line), size (px, ≤ 230), y 0..1 (RISE from the sand:
           ease-out over 0.6 s — draw it translated down by (1 − y)·size and clipped at gy), open 0..1 (the lid; opens at 1.2 s on an
           underdamped spring that hits the hinge stop and bounces back 40 % once or twice), sx, sy (landing squash when it is up),
           glow 0..1 (inner treasure glow, from 1.2 s over 0.5 s), t (s) } + _py _popen _psx _psy — only in state 'sessionDone'
           → translate(x, gy) scale(sx, sy) → PuzzleArt.drawChest(ctx, size, open, t)
w.talk     { topic, promptKey, params, show: icon | null, choices [{id, thing: icon, value}], answer, answerId, glowAnswer }
           icon = any piece thing (drawPiece / drawIcon) · {kind:'number', n} · {kind:'color', color} · {kind:'size', big, size, obj, color}
w.pictures [{ scene, season, flip, level, round, topic, pieces [{thing, u, v, rs (size / min(board w, h))}] }]   (session gallery)
```

## 4. Layout (DESIGN §2) — `computeLayout(W, H, ins, cfg, age, hudKeep)`
- groundY = H − ins.bottom − (portrait 26 : 14). Bubble / HUD exactly as the dig game (measured HUD in `hudKeep`: landscape bubble
  narrows beside it when ≥ 220 px are left, portrait bubble moves below it). Mit: landscape (ins.left + 118, groundY − 4) h 230,
  portrait (ins.left + 104, groundY − 4) h 200; w = 0.62 h; `mitBox` = + 10 px.
- **item** = 112 (ages ≤ 5) / 104 (6+) (QA round 2: ≥ 100 css touch targets on iPhone), × 1.2 when tall or phone **if** the board
  holds `maxSlots[age]` (2 / 3 / 4 / 4 / 4) at 1.25 × item for slot seeds 1–6 (and the size topic's big + small pair at ages ≤ 4)
  and the tray holds `maxPieces[age]` (3 / 4 / 5 / 5 / 5) at 1.3 × item; else the base item; else `itemMin` 112 / 104 / 96 (5 / 6+;
  iPad 4:3 at ages 5+ where 5 pieces at 112 do not fit the tray). `layout.fits` says whether the chosen tier fits.
  `maxSize` = 1.25 × item at ages ≤ 4 (the size topic's big piece), else item.
- **Landscape:** tray.y = min(H − ins.bottom − item − (phones 76 : 96), groundY − 8 − 44 − maxSize); ONE row x ∈ [ins.left + 250,
  W − ins.right − 30], ledge = tray.y + 44 + maxSize ≤ groundY − 8 (above the home indicator; every piece top is ≥ 44 px below the zone
  line tray.y = board bottom + 30). Board: y = max(ins.top + 152, bubble bottom + 30, measured top boxes + 12), bottom = tray.y − 30,
  w = min(x1 − x0, 1.75 h) — **phones (W/H > 1.9): 2.5 h** — centred in [x0, x1].
- **Portrait:** row 0 on the pavement (ledge groundY − 8) from ins.left + 230 (right of Mit) to W − ins.right − 24. While the rows hold
  fewer than maxPieces, a row is added above: beside Mit (gap max(1.3 item, maxSize + 24)) when that is enough, else **lifted above
  Mit's head** (ledge ≤ Mit box top − 6) and extended left to ins.left + 24. tray.y = top ledge − maxSize − 44. Board: x = ins.left
  + 24, w = W − 48 − insets, y ≥ bubble bottom + 34, bottom ≤ min(tray.y − 30, Mit box top − frame − 8), h = min(0.78 w, space),
  **centred in the free band** (on tall phones the band is taller than 0.78 w; the board no longer hugs the bubble).
- **Slots** (`placeSlots`): inset by max(0.6 item, size / 2 + 6), farthest-point sampling over a jittered 9 × 6 grid, 14 starts (up
  to 90 while no spaced set is found, then the regular 1…n-row arrangements), the best min-distance set (≥ 1.25 × the pair's mean
  size); among spaced sets the one least on **busy scenery** (`PuzzleArt.sceneBusy`: tree crowns + trunks, tent, Ferris wheel,
  chalkboard, windows; penalty overlap / slot area × `busyK` 1.2 × item, the spacing margin capped at 0.6 item); deterministic per
  round seed; stored as (u, v) of the board. The board picture is mirrored on odd rounds (`board.flip`, busy rects mirrored too). On a resize the
  slots move to their (u, v) (clamped to the inset); if two came too close they are re-placed with the round seed.
- **Tray spots** (`traySpots`): the fewest rows **counted from the bottom** (nearest the thumb; no empty shelf above a full one) that
  hold n, extra pieces to the lower rows, spacing clamp(span / (c − 1), 1.3 ×, 1.6 ×) × the round's biggest piece, centred, the row
  ends moved in by up to `trayMargin` 22 px as far as the 1.3 × spacing allows; pieces sit bottom-aligned on the ledge (homeY =
  ledge − boxH / 2), rest tilt ±0.14 rad. `tray.used` / `tray.roundSpots` = the rows / spots of this round: render draws only those
  shelves (each 14 px wider than its row on both sides).
- **Drop zone** of a slot = its piece box +30 px left / right / down, **+90 px up**; board zone = board + 30 px.
- Checked on 17 viewports × 5 ages + 400 fuzzed (unit tests): framed board on screen, board and every piece inside the safe area,
  clear of Mit / HUD / bubble / measured boxes, pieces above the ground line, ≥ 1.3 item apart, **≥ 44 px from the board drop zone**
  (so from every slot zone), slots ≥ 1.25 item apart inside the board. Examples at age 4: 960×720: item 112, board 525×300, 1 row;
  1556×720 + notch: item 134, board 591×237 (2.5 : 1); 1036×720 + insets: item 112, board 490×280; 720×1556: item 134, board 672×524,
  2 rows; 720×960: item 112, board 672×280, 2 rows beside Mit.

## 5. Motion (all numbers are `TM.CONFIG`)
| what | how | numbers |
|---|---|---|
| parchment unroll | `unroll` = 1 − (1 − u)³ over 0.7 s; meanwhile `ox` springs from 60 px to 0 (small slide), `tilt` = vox × 4e-4 (≤ 0.04 rad); `boardIn` | ω 11, ζ 0.68 (≈ 5 % overshoot) |
| wash-in | the pieces wash in from the right, left one first, 0.25 s + 0.15 s stagger: each starts at x = W + size; a wave target wD·(1 − u)³ (u = t / wT, wT = clamp(0.45 + wD × 0.0005, 0.5, 0.95) s) carries it, the piece follows on a spring → a damped overshoot of ≈ 15–25 px past its spot (≤ 40 px), the rest of the wobble settles while it floats (grabbable); it rides the wave (lifts ≤ 12 px) and pitches with its speed (≤ 0.22 rad); `wave` once, `pieceLand` when it reaches its spot (+ squash 0.1) | ω 9, ζ 0.55; enter = max(1.1 s, unroll + 0.12) and until every piece has arrived (≈ 1.3–1.9 s) |
| floating | resting pieces bob y ± 4 px (1.7 rad/s), rot ± 0.05 rad (1.3 rad/s), own phase; included in x, y, rot | the hit circle follows |
| drips | `drip` 1 → 0 in 0.4 s after every pickup | |
| idle wiggle | every 2.6–5 s one resting piece gets a tilt kick ("pick me!") | 0.12 rad, ω 18, ζ 0.15 |
| drag | target = finger + the press offset − 8 px × lift; 2-D spring; lift → 1 at 12 /s, scale 1 + 0.12 lift; **pendulum**: rot springs to clamp(−vx × 0.0009, ±0.35) (underdamped, swings past upright when the finger stops), hard-clamped to ±0.35 | ω 28, ζ 0.75; tilt ω 9, ζ 0.35 |
| snap (magnet) | ease-out-back glide from the release point to the slot centre, rot → 0 (smooth), lift → 0; then `placed`: squash 1.15 / 0.85 (spring back), board jig kick 2 px | 0.16 s; squash ω 22, ζ 0.35; jig ω 30, ζ 0.3 |
| near miss | arc home (apex 36 px, 0.35–0.6 s by distance, keeps 15 % of the release vx), slot glow pulse 2.2 s (0.55 + 0.45 sin 1.6 Hz; gold halo 16 px + rim 7 px), `magnet` on | |
| wrong | damped shake at the release point ±10 px × e^(−t/0.16) at 7 Hz for 0.4 s, then an arc home with apex 120 px above the higher end (0.55–0.85 s), a 0.35 rad tumble on the way, landing squash 0.22 | |
| home / tap | home: the near-miss arc (quiet); tap: 40 px hop in 0.36 s with a stretch, landing squash 0.12 | |
| back in the water | every arc home (wrong / near / home / tap / cancel) ends exactly on the bobbed spot → `splash {id, kind, x, y}` + the landing squash | |
| counting | a placed coin piece / dot tile lights `count` 1..n every 0.5 s (`count` events), all lit 0.8 s, then −1; the next ask waits n × 0.5 + 0.3 s more | |
| alive | `roundDone` → shine 0 → 1 over 0.7 s; `alive` event, board.alive 0 → 1 in 0.4 s; per piece (envelope 0.25 s): boat sails ± 14 px (0.6 Hz) and rocks ± 0.09 rad; kite floats up 10 px + sways, flag sways 0.12 rad; bottle bobs 6 px + rolls 0.18 rad; parasol / hat bob 8 px; animals hop twice (22 px, 0.38 s) with landing squashes; pail / shell / shapes / coins / dots / glyphs a 14 px bounce wave (0.12 s apart, 0.9 s period); Mit cheer → `woof` at 1.2 s; distractors `poof` at 0.3 s (swell 1.15 then shrink, 0.35 s) → `gone` | alive 2.4 s |
| roll-up | `boardOut`; board.turn = smooth(u) over 0.9 s (rolls up from the bottom); then the scroll flies on an arc (apex 90 px) into Mit's paws in 0.45 s, scale → 0.35, spinning; `scrollCatch` + Mit happy hop; then the picture goes into `w.pictures` and the next round enters | turn phase 1.35 s |
| chest | sessionDone: `chest`; rise ease-out 0.6 s + landing squash 0.14; at 1.2 s `chestOpen`, the lid springs open (target 1.2, clamped at the stop 1, bounce 40 %) + glow | ω 11, ζ 0.28 |
| hint hand | 1.6 s cycle: press on the piece (0–0.15), carry it on a 50 px arc to the slot (0.15–0.7), let go (0.7–0.82), float back fading | shows 3.2 s |
| crab | hops in SIDEWAYS (0.6 s arc from beyond the right edge, claws up) onto the right end of its **ledge — the top of the board frame** (crabEdge 70 px in from the frame's ends, clear of the bubble / HUD bands; if < 100 px are left: on top of the speech bubble left of the HUD; else on Mit's head, riding his hops); scuttles sideways left at 85 px/s (steps 5 Hz) to the ledge spot farthest from the open shadows, snips its claws (1.4 Hz) until ≈ 6 s, scuttles back to the end and hops off (0.6 s arc down past the right edge); tap → a 40 px hop with both claws waving (4 Hz, 0.9 s) and lands; untapped → once more 5 s later; hops off at once when the picture is done. Never over the tray (visual P1-1) | width 96 |
| bubbles | a little fish (`w.fish`) peeks out of the water under them when they rise right of the board; 4–6, one every 0.45 s, r 24–34, rise 45–70 px/s, wobble ± 14 px at 0.8 Hz; in the band right of the board when it is ≥ 2 r + 48 wide, else from the board's lower edge up over the picture (never over the tray); tap → pop 0.25 s; none popped → a 2nd wave 6 s later | |
| Mit | mood timers; blink every 2.2–5 s; looks at the held piece / hint hand / crab / bubbles / the board; `hop` sin over 0.42 s on every fit, cheer, woof and right Talk answer | |

## 6. Rounds, help, stars
- Steps: `ask` → drops → `placed` → `stepDone` → `askGap` 1.0 s (+ counting) → next `ask` (main prefixes "Now…") — the last one → alive.
  findAll (odd / even): one step, every right-parity piece into its own slot (`placed.all {i, n}`), `stepDone` after the last.
- **No progress** in a step = wrong drops, soft presses (space / board), piece taps and drops off the board (home). The 2nd → hint
  (cooldown 6 s, no new hint while one shows) — **except taps**: a curious tap counts towards the assist but never lights the
  2-miss hint; after **3 (ages ≤ 4) / 6 (5+)** → **assist**: the next grab of ANY tray piece hands the finger the asked piece
  (`assist {from}`), a grab of the asked piece itself arms it too (`assist {from: id}`, it keeps its grip) — an assisted tap glides
  it in, a drag works as usual — and a press on the board flies it in by itself (`assist {from: null}`). So a child who only taps
  the right piece always progresses (playtest P1). A fit resets the counter. Idle (no press, no held piece) 12 s → `idle {n}`, × 1.5 up to 30 s; the 2nd idle
  also hints. An absent child never finishes a round (no auto-play).
- Stars: misses (wrong drops only) 0 / 1 / ≥ 2 → 3 / 2 / 1; + 1 for a right Talk answer.
- Surprises: one round per chapter (round 1 or 2, never the warm-up), `crab` / `bubbles` rotating per chapter (session offset).
- Chapter time: a round that starts after `shortBudget[round]` = 30 / 48 / 62 s into the chapter is short (2 slots); Talk time after
  round 4, or after round ≥ 2 (`chapterMinRounds`) once the chapter passed 75 s. Talk re-asks every 12 s (`talkAsk {n}`), glows from the 2nd, stops after
  3; 12 s later Mit answers herself (`talkResult {auto: true}`, no star).

## 7. Events (every positional event carries x, y in logical px)
| event | fields | when |
|---|---|---|
| `session` | levels | newSession |
| `level` | level, topic, weather | a chapter starts (main: weather.setWeather, banner) |
| `round` | round, topic, surprise, scene, season, slots, pieces, steps, mode, short, key | a round starts |
| `boardIn` | x, y (board centre) | the parchment starts to unroll ("frrt") |
| `wave` | x (W), y (water line) | once, when the first piece starts washing in (wave wash sound) |
| `pieceLand` | id, i, x, y (piece bottom) | a washed-in piece reaches its spot (a small splash: weather.burst splash) |
| `splash` | id, kind 'home'\|'near'\|'tap'\|'wrong', x, y (piece bottom) | a piece lands back in the water (splash sound + burst) |
| `ask` | promptKey, params, mode, step, steps, first, round, nameKind, nameValue, need, x, y (Mit's mouth) | a step asks |
| `pickup` | id, thing, asked, x, y | a piece is grabbed (Mit names it, "plip") |
| `tapPiece` | id, thing, x, y | a quick tap (hop + name) |
| `placed` | id, slot, thing, step, x, y (slot centre), count? {n}, all? {i, n} | click! it fits |
| `count` | id, i, n, x, y | counting aloud lights item i (chime) |
| `stepDone` | step, steps, last | the step's pieces are in |
| `nearMiss` | id, slot, thing, x, y (slot centre) | the asked piece on the board outside its zone ("It goes here!") |
| `wrong` | id, thing, got {nameKind, nameValue, kind, obj, color, shape, n, animal, text, size}, want {nameKind, nameValue, promptKey, params}, streak, misses, x, y | another piece on the board |
| `home` | id, x, y | let go off the board (whoosh, no line) |
| `soft` | kind 'board'\|'space'\|'early', x, y | a press that is not a piece / Mit / surprise |
| `pokeMit` | promptKey, params, mode, step, x, y | Mit tapped (main repeats the prompt) |
| `hint` | id, slot, x, y (piece), toX, toY (slot), want, idle? | hint |
| `assist` | id (asked piece), from (piece id \| null), x, y | assist |
| `idle` | n, promptKey, params, mode, step | idle nudge |
| `roundDone` | round, stars, misses, x, y (board centre) | the picture is complete (alive starts) |
| `alive` | x, y | 0.7 s later: the pieces start moving ("look, it moves!") |
| `woof` | x, y (Mit's mouth) | 1.2 s into alive |
| `poof` | id, x, y | a leftover distractor pops away |
| `boardOut` | x, y (board bottom centre) | the roll-up starts ("fwip") |
| `scrollCatch` | x, y | the rolled map lands in Mit's paws |
| `crab` / `crabTap` | x, y | the crab hops in / is tapped (clicks; weather.burst sand / sparkle) |
| `chest` / `chestOpen` | x, y (sand line) · x, y (chest mouth) | sessionDone: the chest rises · the lid opens (creak + jingle; burst coins + confetti) |
| `bubbles` / `bubblePop` | x, y, n · x, y | bubbles start / one is popped |
| `talk` / `talkAsk` / `talkResult` | talk · talk, n, glowAnswer · correct, choiceId, answerId, auto | Talk time |
| `levelDone` / `sessionDone` | level, stars · stars, pictures | |

## 8. Content (`TM.Content`, DESIGN §5.1)
- Pieces: `{id 'p0'…, thing, slot 's…' | null}` in tray order; slots `{id, piece}`; steps one per real piece in random order (findAll:
  one). At every find step exactly one still-unplaced piece matches; distractors never match (validate simulates the round).
- Counts: warm-up 2 + 0 (odd / even: 2 + 1); age 3: 2 (+ 1 from round index 2, not in the first chapter); age 4: 3 + 1 (first chapter
  3 + 0); age 5: 3–4 + 1; ages 6+: 4 + 1; short rounds 2 slots. **colors below age 5: only 3 clash-free colours exist, so a round
  with a distractor has 2 slots + 1** (first chapter at age 4: 3 + 0). ≤ 5 pieces.
- Things: `obj` {obj, color} (colors: every piece a different object and colour; size: the same object + colour, `size` 'big'|'small'
  + `big` bool, its distractor another object with nameKind `'obj'`), `shape` {shape, color} (≤ 4: one colour, no square+rect /
  circle+oval / square+diamond; age 5: a 2 × 2 shape × colour grid, `p.shapes5`), `coins` {n} (ages ≤ 4, nameKind `'coins'` — the
  step's nameKind too; params.kind 'coins'; n all different, 1–2 warm-up, ≤ 4 in round 1, ≤ 5 later), `dots` {n} (5+: ≤ 5 warm-up, 1–10 / 12; age 5 never n and n ± 1 together), `animal` {animal}, `glyph` {text} (letters;
  small letters without i / l, at most one of b d p q, never m+w / n+u) or {text, n} (numbers: add / sub / odd-even).
- prevAns (the next round does not open with the answer asked last; size / odd-even ≤ 2 in a row, shapes5 exempt) and usedKeys
  (never the same set twice in a chapter). `content_stats.js 200`: 0 invalid in 20 000 rounds, 0.0 % repeated sets.
- Things (DESIGN §0.2): OBJECTS boat, flag, pail, parasol, hat, shell, kite, bottle; ANIMALS parrot, turtle, fish, monkey, octopus,
  seagull, dolphin, starfish; SCENES colors cove · shapes sails · count cave · animals / initial lagoon · size shore · letters / lower /
  add / sub / oddeven deck. `initial`: distinct initials — EN P T F M O S D S, VI (noun after "con") V R C K B H C S (VI letter pool
  + R); 7 distinct initials per language, so the 5-piece rounds always fit.
- Talk: as DESIGN (2 choices at age 3 for picture topics, else 3; icons are piece things or number / color / size).

## 9. Weather (`TM.Weather`, DESIGN §0.4)
`setWeather(i, {instant})` (0 sunny, 1 breezy, 2 rain, 3 rainbow; 2.5 s smoothstep crossfade of every number + colour), `resize(W, H,
groundY)`, `setWater(y0, y1)` (optional: the shallow-water band for sparkles / rain rings; default groundY − min(150, 0.2 H) … groundY − 6),
`update(dt)` (1/60 steps), `setParty(on)`, `addDust(x, y, n)`, `burst(x, y, {kind: 'stars'|'sparkle'|'coins'|'splash'|'confetti'|'dust'|
'dots'|'leaves'|'sand', n, color})` — coins: ballistic + spin (flipX) + a damped bounce on the sand; splash: a ring + droplets in arcs.
`ambient = { skyTop, skyMid, skyBottom, sea, tint (rgba | null), light, darkness 0..0.14, sunX, sunY, sunA, wind −1..1, gust 0..1, palm (rad =
wind × 0.08 + 0.02 sin 0.8 t), rain 0..1, rainbow 0..1, lantern 0..1 (= rain), whitecaps 0..1, mood, moodIndex, env (= mood name), envFrom,
envMix, party }` — skies sunny #7CC8F0 → #D8F1FB, breezy #93CBEA → #E4F3F8, rain #8FA3B8 → #CBD6DE, rainbow #86C9EE → #FBE9D6; sun
(0.78, 0.14) / (0.7, 0.12) / hidden in rain (sunA × (1 − 0.9 rain)) / (0.85, 0.18). **Wind** = base·(1 + slow wander) + gusty·gust; gusts every
4–7 s (0.6 s rise, 0.8 s hold, 1.5 s decay, smooth; 85 % blowing right): breezy within ±0.8, the others within ±0.15. **rain** follows the
crossfade (rain mood → 1); **rainbow** fades in over 3 s (smooth) in the rainbow mood, out over 2.5 s after. `clouds[6]` drifting
(7–16 px/s × cloudSpeed 1 / 3.2 / 0.8 / 1 + 30 × wind), visible 3 / 5 / 6 / 3; the rain mood swaps them to `cloud_rain` (each fades out,
swaps the sprite while invisible, fades back). `particles[]` {type = sprite, x, y, size, r, rot, alpha, layer, kind, color, flipX?, sy?}:
sunny 8 `sparkle` glints on the water band + 6 `mote`; breezy 10 `leaf_a`/`leaf_b` (blown 240 px/s × wind, tumbling, entering upwind) +
12 `sand` (skimming low, 420 px/s × wind); rain 40 `rain` streaks (900–1200 px/s, slanted: vx = (320 wind + 40), rot = −atan2(vx, vy),
sy 1.6) each spawning a `splash` ring where it lands (on the beach / water strip, ≤ 14 rings); rainbow 8 sparkles + 5 slow `droplet`s
(with rings). Cap 120 (ambient ≤ 56 × area scale). Sprites (particles/<name>.svg): sparkle, mote, leaf_a, leaf_b, sand, rain, splash,
droplet, star, confetti_a, confetti_b, dot, dust, coin (`Weather.SPRITES`).

## 10. Bot (`TM.Bot`, DESIGN §5.4)
Every press aims at `pieceHit(id)` — the piece's CURRENT (bobbing) centre. `new TM.Bot(world, {skill, seed})`, `step(dt)` before `world.update(dt)`, optional `onEvent(e)`, `stats`, `finger`. Only through
`pointerDown / pointerMove / pointerUp`: 0.8–2.2 s × (1.3 − 0.5·skill) after an ask; p 0.12 taps a piece first; drags the asked piece
with p = skill (always while the hint shows), else another tray piece; a quadratic Bézier path with 8–14 touchmoves over 0.4–0.9 s to
the slot ± 30 px (p 0.25 "high": 60 px above; p 0.06 a big miss on the board); wrong pieces go to a random board point. Talk right with
p = skill (always when glowing); taps the crab / one bubble with p = 0.6 per round.

## 11. Playtest
**Treasure Map (2026-11-28, `hs_playtest.js --n 20 --jobs 4`, 1 200 sessions, 0 failed, 0 NaN / stuck states / pieces off screen)** after the
wash-in, bob, roll-up + scroll flight (+ 0.55 s per round) and coins: typical age 4 chapter **92.8 s** [83.5–101.3] (Pom 92.7), session 6.4 min;
typical 3 / 5 / 6 / 7: 94–97 / 91–95 / 91–95 / 90–91 s (odd / even 67 s); perfect 4: 85.8 s; tap-only / tap-the-right-one: 100 % done at every
age, 6.8–7.0 min; spammer 5.7–6.4 min. The slow 3-year-old model at age 4 had one 125 s round (an unlucky streak: 4 wrong drops + 4 slips,
every one answered by a hint and the assist); the Pom baseline shows the same tail at `--n 80` (151 s at age 5), so it is model variance,
not the new motion. (The off-screen check skips pieces still washing in from the right.)

### Pom's Puzzle Town (`hs_playtest.js --n 60`, 2 420 sessions, 1/30 s frames, 5 viewports, EN / VI; 2026-11-09)
Targets: a toddler chapter 60–100 s, a session ≤ 8 min, 0 stuck rounds (> 120 s), 0 stuck states, 0 NaN, 0 pieces off screen.

| model | age | session min (p90) | chapter s mean [p10–p90] | round s (p90) | stars 3/2/1 % | wrong / near / home / tap / soft per round | assists / round | rounds with a hint % | stuck / NaN / off |
|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 6.4 (6.7) | 94.1 [83.5–103.8] | 19.9 (26.9) | 65 / 27 / 8 | 0.44 / 0.11 / 0.05 / 0.39 / 0.12 | 0 | 22 | 0 / 0 / 0 |
| typical | 4 | 6.3 (6.8) | 92.7 [82.6–103.1] | 21.0 (29.3) | 71 / 23 / 6 | 0.37 / 0.06 / 0.03 / 0.39 / 0.11 | 0 | 19 | 0 / 0 / 0 |
| typical | 5–7 | 5.7–6.3 | 84–92 | 16.6–20.5 | 71–84 / 14–23 / 2–6 | 0.18–0.37 wrong | 0 | 5–9 | 0 / 0 / 0 |
| slow 3-year-old | 3 | 8.7 (9.6) | 128.1 [100.5–161.5] | 35.8 (54.0) | 55 / 26 / 19 | 0.70 / 0.21 / 0.11 / 0.74 / 0.26 | 0.03 | 49 | 0 / 0 / 0 |
| slow 3-year-old | 4 | 9.2 (10.2) | 136.4 [108.1–169.9] | 38.7 (58.1) | 45 / 31 / 24 | 0.92 / 0.21 / 0.10 / 0.86 / 0.27 | 0.05 | 54 | 0 / 0 / 0 |
| random tapper | 3 / 4 | 6.9 / 7.1 | 102 / 104 | 28–29 | 78 / 19 / 3 · 70 / 24 / 5 | ≈ 3.4 taps, 8.3 soft | 1.9–2.1 | 100 | 0 / 0 / 0 |
| random tapper | 5–7 | 7.9–8.0 | 116–119 | 33–34 | ≈ 52 / 33 / 15 | | 2.0 | 100 | 0 / 0 / 0 |
| spammer (6 presses/s) | 3–7 | 5.5–6.2 | 80–92 | 15–19 | 100 / 0 / 0 | 8–16 taps, 17–21 soft | 2.0–2.7 | 100 | 0 / 0 / 0 |
| perfect | 3–7 | 4.2–5.7 | 62–83 | 10.8–17.1 | 100 / 0 / 0 | 0 | 0 | 0 | 0 / 0 / 0 |
| bot 0.8 | 3–7 | 3.4–5.2 | 50–76 | 7.8–14.6 | 54–74 / 23–30 / 3–16 | 0.3–0.7 wrong | 0 | 10–23 | 0 / 0 / 0 |
| absent | 3–7 | — (waits) | — | — | — | — | — | idle at 15.7, 33.7, 60.7, 90.7, 120.7, 150.7 s | 0 / 0 / 0 |

Per topic (typical): every topic at ages 3–7 is 89–97 s per chapter (p90 96–109) except odd / even (age 7) 64 s; typical children get a
4th round in about half the chapters (the 75 s limit cuts the rest). 0 "2 wrong drops without a hint", max round 56 s (typical) / 103 s
(slow 3-year-old). Tuning history: (1) assist after 6 no-progress actions (DESIGN) → **4 at ages ≤ 4** (the sister game's playtest
value): the random tapper's session 8.5 → 7.3 min, typical children unchanged; (2) a drop of the asked piece **off the board** now counts
towards the hint / assist (a slow 3-year-old who kept letting go too early had one 125 s round; now max 103 s); (3) the drag tilt is
hard-clamped at ± 0.35 (the underdamped pendulum overshot to 0.45 on fast swipes).
**Open:** the slow 3-year-old model (2.4 s listening + 2.8–6 s thinking per ask, 15 % distraction) needs ≈ 128–136 s per chapter and
≈ 9–10 min per session, above the 8 min target; the per-ask time is the child's, not the game's (fixed per-round animation ≈ 4.7 s).
A lever, if parents report it: `shortBudget` earlier for ages ≤ 3, or `roundsPerLevel` 3 for the slow profile.

**QA round 2 (2026-11-09, `hs_playtest.js --n 20`, 1 200 sessions, 0 failed, exit 0)** after `chapterMinRounds` 3 → 2,
`assistAfterYoung` 4 → 3, `askGap` 0.6 → 1.0, `levelDoneTime` 1.8 → 3.6, the asked-piece assist and "taps never hint":
typical 3 / 4 / 5 / 6 / 7: 6.5 / 6.5 / 6.4 / 6.4 / 5.9 min (p90 ≤ 6.8); slow 3-year-old 7.5 / 7.6 min (p90 8.2); **taps the right
piece only: 100 % done at every age, 6.6–7.0 min (was stuck 40 / 40)**; tap-only 6.6–7.1; slow tap-only 7.4–7.5 (was 17); 0 NaN /
stuck / off screen / "2 wrong without a hint". The open item above is closed by `chapterMinRounds` 2.

## 12. Deviations from DESIGN (agreed / to note)
- State during alive / turn is **`roundDone`** (phase `alive` / `turn`), as in the sister game; `roundDone` fires at its start.
- `sx`, `sy` **include the lift scale** (1 + 0.12 lift): render draws `scale(sx·pop, sy·pop)` and must not scale by lift again.
- `w.pieces` is kept in draw order (tray → placed → moving → held); `pop` is also used to hide pieces that have not dropped yet.
- Slots and placed pieces are in board rest coordinates: render applies the board transform (ox, jig, tilt, turn) to them.
- Landscape phones: board aspect up to **2.5 : 1** (DESIGN 1.75) so the bigger phone pieces fit the short board; portrait boards are
  **centred in the free band** and stay above Mit's head (DESIGN: y = bubble bottom + 34). Tray rows are exposed as `tray.rows`.
- **colors below age 5 with a distractor: 2 slots + 1** (only 3 clash-free colours exist; DESIGN says 3 + 1 at age 4).
- Age 3 distractor from **round index 2** and never in the first chapter; odd / even warm-up has 1 distractor (the other parity is the
  content); size-round distractor = another object (`nameKind 'obj'`).
- Assist after 3 no-progress actions at ages ≤ 4 (DESIGN 6); taps on pieces and drops off the board count as no progress (never as
  misses; taps never trigger the 2-miss hint); an assisted tap of any piece (the asked one included) / a board press after the
  assist threshold glides the asked piece in (a pure tapper — even one who only taps the right piece — always finishes).
- No grabbing during enter (`soft {kind: 'early'}`); a release during the 1.0 s gap after a fit starts the next step at once.
- Treasure Map: the crab keeps Pom's ledge on top of the board frame (DESIGN §0.3 says "along groundY", but the ground band is the
  tray — visual P1-1: never over the pieces) and moves sideways; its 'land' / 'fly' states are hops, not flights. The wash-in keeps the
  state name 'drop'. New events `wave`, `splash`, `scrollCatch`, `chest`, `chestOpen`; new fields `board.unroll/scroll*`, `piece.drip/ph/wx`,
  `crab.scuttle`, `w.fish`, `w.chest`; CONFIG `boardSlide, unrollTime, wash*, bob*, dripTime, scroll*, chest*, crabStepHz, crabLeaveTime,
  crabWaveHz` (`boardFrom, dropH, dropG, dropBounce, dropMinBounce, dropRot` removed); turnTime 0.8 → 0.9, dropStagger 0.12 → 0.15,
  restRot 0.14 → 0.1, crabSpeed 70 → 85, crabHop 60 → 40.
- New events: `session`, `count`, `alive`, `assist`; extra fields: `pickup.asked`, `placed.step`, `placed.all`, `hint.toX/toY`,
  `pieceLand.i`, `round.scene/season/slots/pieces`. New fields: `board.show`, `board._pjig/_pshine/_palive`, `crab.peck/hop/size`,
  `piece.boxW/boxH`, `layout.mitBox/maxSize/hitR/fits/tray.rows`, `p.count` params carry `kind` ('coins' | 'dots').
