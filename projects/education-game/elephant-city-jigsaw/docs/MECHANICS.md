# Pom's Puzzle Town — Mechanics (`PZ.CONFIG`, layout, motion, render contract, events, playtest numbers)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.5.
Tests: `node tests/unit/run.js` (41 tests, ≈ 13 s: layouts on 17 named viewports × 5 ages + 400 fuzzed ones with notch insets and
measured HUD boxes, ≈ 35 000 generated rounds checked with an independent matcher, world flows for correct / near-miss / wrong /
outside / tap drops, help, alive + turn, surprises, rotation, determinism, every topic × age completable, 50 full bot sessions;
`node tests/unit/run.js <name part>` runs a subset).
Sims (report-only, `tests/sim/`): `node tests/sim/hs_playtest.js [--n 60] [--ages 3,4] [--models typical,slow3,…] [--jobs 4]
[--config '{…}'] [--tag x]` (→ `tests/sim/out/hs_<tag>.md`; exit 1 on a stuck round / stuck state / NaN / piece off screen),
`node tests/sim/content_stats.js [chapters]`; `hs_browser.js` / `hs_browser_vp.js` / `hs_voicelog.js` drive the real page in
Playwright (`?bot=1`).

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. **Screen space = world space** (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s per call, so `?speed=N` works). At the start of
  every sub-step each moving value is copied into its `_p` twin; render `v = _v + (v − _v)·w.alpha`.
- Determinism: content, the surprise round and its type use the world's seeded `PZ.RNG`; cosmetic randomness (rest tilts, drop
  tumble, wiggles, blinks, pigeon / bubble details) a second seeded generator. Same seed + the same inputs on the same sub-steps →
  the same events whatever the frame size (unit test "deterministic").
- Every moving thing is a damped spring (`spring(o, k, kv, target, ω, ζ, h)`, semi-implicit Euler), a ballistic fall, or a closed-form
  constant-acceleration arc (`World.arc(x0, y0, x1, y1, T, apex, vx0, minY)`); `World.kickFor(peak, ω, ζ)` gives the initial
  velocity whose first peak is `peak` (used for every squash / jiggle).
- The world never needs `puzzle_art.js`; when `PZ.PuzzleArt.pieceBox` is loaded it uses the real visible box (bottom-aligned tray
  homes, drop zones), else a size × size box.

## 2. Public API (`PZ.World`)
`new PZ.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (no-op when nothing changed; set
`world.hudKeep = [{x,y,w,h}…]` (the measured HUD / bubble boxes) then call it again), `setAge(a)` / `setLang(l)` (apply at the next
`newSession`), `newSession({lastTopics})`, `levels`, `startLevel(i)`, `update(dt)`, `drainEvents()`, `skipTalk()`, `resetNudges()`
(after a pause), `talkAnswer(choiceId)` → bool, `hint()` → `{piece, slot}` | null, `prompt()` → `{promptKey, params, mode, step,
nameKind, nameValue, need}` in enter / play, else null, `cancelDrag()`, `drawOrder()` (= `w.pieces`, already sorted).
Fields: `layout, hudKeep, state, phase, level, topic, round, cur, step, stepInfo, roundsPerLevel, stars, levelStars, roundStars, misses,
talk, talkAnswered, alpha, stateTime, phaseTime, interactive, weather (= level % 4), pieces, slots, board, pom, pigeon, bubbles,
hintHand, pictures, magnet, held, finger`.
States `menu → intro (2.5 s) → round [enter → play] → roundDone [alive 2.4 s → turn 0.8 s] → … → talk → levelDone (3.6 s) → … →
sessionDone`. **During alive / turn the state is `roundDone`** (phase `alive` / `turn`), like the sister game's cheer / clear.
`interactive` = state `round`, phase `play`, the step still open (not in the 1.0 s `askGap` after a fit) and no piece snapping.

**Input (one active pointer; extra fingers are dropped upstream)** — logical px:
- `pointerDown(x, y)` → `'grab'` (a tray piece under the finger: rest or gliding home; hit circle r = 0.6 × size + 26 (circles of neighbours may overlap), the nearest
  centre wins — a piece always wins over a surprise) | `'pigeon'` | `'bubble'` (react on the press) | `'pom'` (Pom's box; the tap
  fires on release) | `'soft'` (empty space / the board / a placed piece in play) | `'early'` (during enter) | null.
- `pointerMove(x, y)`; `pointerUp(x, y)` → `'snap'` | `'nearMiss'` | `'wrong'` | `'home'` | `'tap'` | `'pokePom'` | null.
- **Tap** = moved < `tapMovePx` 24 px and released within `tapTime` 0.35 s → the piece hops home (40 px arc), `tapPiece`; never a drop.
- A release judges the **release point: the piece centre or the finger point** (either inside counts):
  asked piece in its slot zone (or, with `magnet`, anywhere in the board zone) → snap; asked piece elsewhere on the board → near miss;
  another piece on the board → wrong (a miss); off the board → home (quiet). findAll: any unplaced target is "asked" (its own slot).
- A release during the gap after a fit starts the next step at once (its `ask`) and is judged against it.
- `cancelDrag()` (touchcancel / pause / rotation): the held piece glides home, no event.
**Test hooks (logical px):** `pieceHit(id)` → `{x, y, r}`, `slotDrop(id)` → the slot centre (inside its zone), `slotZone(id)`,
`boardZone()`, `pomHit()` → `{x, y (CENTRE), w, h}`, `pigeonHit()` / `bubbleHit()` → `{x, y, r}` | null (only while tappable; the pigeon is never over the tray; a bubble not
under a tray piece), `answer()` → `{piece, slot}` | null, `pieceById`, `slotById`. Static: `World.logicalSize(cssW, cssH)`,
`World.computeLayout(W, H, ins, cfg, age, hudKeep)`, `World.placeSlots(board, sizes, item, cfg, seed)`, `World.traySpots(L, n, maxSize,
cfg)`, `World.kickFor`, `World.arc`.

## 3. Render contract (what render.js reads; everything else is internal)
```
w.layout   W, H, ins, portrait, tall (H/W > 1.6), phone (long/short > 1.9), groundY, bubble {x,y,w,h}, hud {x,y,w,h},
           pom {x, y (FEET), h, w}, pomBox {x,y,w,h} (tap box), board {x, y, w, h, r 26}, frame 22, item, maxSize, slotScale 1, hitR,
           tray {x, y (= board bottom + 30: the zone line), w, h, rows [{x0, x1, y (LEDGE: piece bottoms)}] (top row first),
                 spots [{x, y (resting centre of a normal piece), row}] (maxPieces of this age)}, keep [boxes], safe, fits
w.board    { x, y, w, h, r (rest rect), ox (px), tilt (rad about the board centre), jig (px, down), shine 0..1, alive 0..1, turn 0..1,
           scene, season 0..3, show (bool: a board is on screen) } + _pox _ptilt _pjig _pturn _pshine _palive
           → translate(ox, jig) · rotate(tilt) about the centre · page turn: scale x by cos(turn·π/2) about the left edge (+ darken)
             → PuzzleArt.drawBoard(ctx, {w, h, r}, scene, season, {shine, alive, t}); then the SLOTS and PLACED pieces in the same
             transform (their x, y are rest positions with ox = 0).
w.slots[]  { id, piece, thing, u, v (0..1 of the board), x, y (centre), size, filled, glow 0..1 (hint / near-miss pulse) }
           → unfilled: PuzzleArt.drawShadow(ctx, thing, size, {glow})
w.pieces[] { id, thing, slot, size, state 'drop'|'rest'|'held'|'snap'|'placed'|'home'|'wrong'|'gone', x, y (centre), rot,
           sx, sy (squash × LIFT SCALE: 1.12 when held — draw scale(sx, sy) as is), lift 0..1, glow 0..1, dim, count −1|0..n,
           ax, ay, arot (alive offsets), alive 0..1, pop 0..~1.15 (0 = invisible: not dropped yet / poofed), homeX, homeY, homeRot,
           boxW, boxH } + _px _py _prot _psx _psy _plift _pax _pay _parot _ppop
           Already in DRAW ORDER: tray (rest / drop / gone) → placed → moving (home / wrong / snap) → the held piece LAST.
           → skip pop ≤ 0; translate(x + ax, y + ay) rotate(rot + arot) scale(sx·pop, sy·pop) →
             PuzzleArt.drawPiece(ctx, thing, size, {glow, lift, dim, count, alive, season})
w.pom      { x, y (feet), h, mood idle|talk|happy|cheer|think|oops|wave|point|toot, moodT, blink (bool), look −1..1, hop 0..1 (+ _phop) }
w.hintHand null | { id, slot, x, y (fingertip now), x0, y0 (piece home), x1, y1 (slot), t 0..1 (1.6 s cycle), press 0..1, alpha }
           → PuzzleArt.drawGhostHand(ctx, size, press) at (x, y), globalAlpha = alpha
w.pigeon   null | { x, y (FEET incl. the flap hop), dir ±1 (+1 = faces right), step 0..1 (waddle phase), peck 0..1 (head bob while
           pecking), flap 0..1 (≥ 0.5 → pigeon_flap.svg), hop px, size 96 (drawn width), state 'land'|'walk'|'flap'|'fly', t,
           lo, hi (its ledge) } + _px _py — draw its contact shadow only in 'walk' / 'flap'
w.bubbles[] { x, y (centre), r, wob (rad), pop 0..1 (popping), state 'rise'|'pop' } + _px _py → PuzzleArt.drawBubble(ctx, r, {pop})
w.talk     { topic, promptKey, params, show: icon | null, choices [{id, thing: icon, value}], answer, answerId, glowAnswer }
           icon = any piece thing (drawPiece / drawIcon) · {kind:'number', n} · {kind:'color', color} · {kind:'size', big, size, obj, color}
w.pictures [{ scene, season, flip, level, round, topic, pieces [{thing, u, v, rs (size / min(board w, h))}] }]   (session gallery)
```

## 4. Layout (DESIGN §2) — `computeLayout(W, H, ins, cfg, age, hudKeep)`
- groundY = H − ins.bottom − (portrait 26 : 14). Bubble / HUD exactly as the dig game (measured HUD in `hudKeep`: landscape bubble
  narrows beside it when ≥ 220 px are left, portrait bubble moves below it). Pom: landscape (ins.left + 118, groundY − 4) h 230,
  portrait (ins.left + 104, groundY − 4) h 200; w = 0.62 h; `pomBox` = + 10 px.
- **item** = 112 (ages ≤ 5) / 104 (6+) (QA round 2: ≥ 100 css touch targets on iPhone), × 1.2 when tall or phone **if** the board
  holds `maxSlots[age]` (2 / 3 / 4 / 4 / 4) at 1.25 × item for slot seeds 1–6 (and the size topic's big + small pair at ages ≤ 4)
  and the tray holds `maxPieces[age]` (3 / 4 / 5 / 5 / 5) at 1.3 × item; else the base item; else `itemMin` 112 / 104 / 96 (5 / 6+;
  iPad 4:3 at ages 5+ where 5 pieces at 112 do not fit the tray). `layout.fits` says whether the chosen tier fits.
  `maxSize` = 1.25 × item at ages ≤ 4 (the size topic's big piece), else item.
- **Landscape:** tray.y = min(H − ins.bottom − item − (phones 76 : 96), groundY − 8 − 44 − maxSize); ONE row x ∈ [ins.left + 250,
  W − ins.right − 30], ledge = tray.y + 44 + maxSize ≤ groundY − 8 (above the home indicator; every piece top is ≥ 44 px below the zone
  line tray.y = board bottom + 30). Board: y = max(ins.top + 152, bubble bottom + 30, measured top boxes + 12), bottom = tray.y − 30,
  w = min(x1 − x0, 1.75 h) — **phones (W/H > 1.9): 2.5 h** — centred in [x0, x1].
- **Portrait:** row 0 on the pavement (ledge groundY − 8) from ins.left + 230 (right of Pom) to W − ins.right − 24. While the rows hold
  fewer than maxPieces, a row is added above: beside Pom (gap max(1.3 item, maxSize + 24)) when that is enough, else **lifted above
  Pom's head** (ledge ≤ Pom box top − 6) and extended left to ins.left + 24. tray.y = top ledge − maxSize − 44. Board: x = ins.left
  + 24, w = W − 48 − insets, y ≥ bubble bottom + 34, bottom ≤ min(tray.y − 30, Pom box top − frame − 8), h = min(0.78 w, space),
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
  clear of Pom / HUD / bubble / measured boxes, pieces above the ground line, ≥ 1.3 item apart, **≥ 44 px from the board drop zone**
  (so from every slot zone), slots ≥ 1.25 item apart inside the board. Examples at age 4: 960×720: item 112, board 525×300, 1 row;
  1556×720 + notch: item 134, board 591×237 (2.5 : 1); 1036×720 + insets: item 112, board 490×280; 720×1556: item 134, board 672×524,
  2 rows; 720×960: item 112, board 672×280, 2 rows beside Pom.

## 5. Motion (all numbers are `PZ.CONFIG`)
| what | how | numbers |
|---|---|---|
| board slide-in | `ox` spring from off-screen right (W − board.x + 80) to 0; `tilt` = vox × 4e-5 (≤ 0.06 rad); `boardIn` | ω 11, ζ 0.68 (≈ 5 % overshoot, settled ≈ 0.6 s) |
| pieces drop | 0.3 s + 0.12 s stagger; pop in over 0.08 s, 230 px above home; gravity 2600; bounce restitution 0.32 while v > 160 (≤ 2); squash kick ∝ impact (0.06–0.26) on every contact; a random spin kick; tumble tilt springs to the rest tilt; `pieceLand` at the first contact | enter = max(1.1 s, last landing + 0.12) and until every piece rests (≈ 1.1–1.5 s) |
| idle wiggle | every 2.6–5 s one resting piece gets a tilt kick ("pick me!") | 0.12 rad, ω 18, ζ 0.15 |
| drag | target = finger + the press offset − 8 px × lift; 2-D spring; lift → 1 at 12 /s, scale 1 + 0.12 lift; **pendulum**: rot springs to clamp(−vx × 0.0009, ±0.35) (underdamped, swings past upright when the finger stops), hard-clamped to ±0.35 | ω 28, ζ 0.75; tilt ω 9, ζ 0.35 |
| snap (magnet) | ease-out-back glide from the release point to the slot centre, rot → 0 (smooth), lift → 0; then `placed`: squash 1.15 / 0.85 (spring back), board jig kick 2 px | 0.16 s; squash ω 22, ζ 0.35; jig ω 30, ζ 0.3 |
| near miss | arc home (apex 36 px, 0.35–0.6 s by distance, keeps 15 % of the release vx), slot glow pulse 2.2 s (0.55 + 0.45 sin 1.6 Hz; gold halo 16 px + rim 7 px), `magnet` on | |
| wrong | damped shake at the release point ±10 px × e^(−t/0.16) at 7 Hz for 0.4 s, then an arc home with apex 120 px above the higher end (0.55–0.85 s), a 0.35 rad tumble on the way, landing squash 0.22 | |
| home / tap | home: the near-miss arc (quiet); tap: 40 px hop in 0.36 s with a stretch, landing squash 0.12 | |
| counting | a placed bunch / dot tile lights `count` 1..n every 0.5 s (`count` events), all lit 0.8 s, then −1; the next ask waits n × 0.5 + 0.3 s more | |
| alive | `roundDone` → shine 0 → 1 over 0.7 s; `alive` event, board.alive 0 → 1 in 0.4 s; per piece (envelope 0.25 s): car / bus drive ± 18 px (0.8 Hz) + 3 px bounce; balloon / kite / bunch float up 10 px + sway 0.12 rad; umbrella / hat bob 8 px; animals hop twice (22 px, 0.38 s) with landing squashes; house / flower / shapes / dots / glyphs a 14 px bounce wave (0.12 s apart, 0.9 s period); Pom cheer → `toot` at 1.2 s; distractors `poof` at 0.3 s (swell 1.15 then shrink, 0.35 s) → `gone` | alive 2.4 s |
| turn | `boardOut`; board.turn = u² over 0.8 s; then the picture goes into `w.pictures` and the next round enters | |
| hint hand | 1.6 s cycle: press on the piece (0–0.15), carry it on a 50 px arc to the slot (0.15–0.7), let go (0.7–0.82), float back fading | shows 3.2 s |
| pigeon | glides in (0.7 s arc, flapping) and lands on the right end of its **ledge — the top of the board frame** (pigeonEdge 70 px in from the frame's ends, clear of the bubble / HUD bands; if < 100 px are left: on top of the speech bubble left of the HUD; else on Pom's head, riding his hops); waddles left at 70 px/s (2.4 Hz) to the ledge spot farthest from the open shadows, pecks (1.4 Hz) until ≈ 6 s, walks back to the end and flies off; tap → flap (60 px hop, 0.9 s, flap 6 Hz) and land; untapped → once more 5 s later; flies off at once when the picture is done. Never over the tray (visual P1-1) | width 96 |
| bubbles | 4–6, one every 0.45 s, r 24–34, rise 45–70 px/s, wobble ± 14 px at 0.8 Hz; in the band right of the board when it is ≥ 2 r + 48 wide, else from the board's lower edge up over the picture (never over the tray); tap → pop 0.25 s; none popped → a 2nd wave 6 s later | |
| Pom | mood timers; blink every 2.2–5 s; looks at the held piece / hint hand / pigeon / bubbles / the board; `hop` sin over 0.42 s on every fit, cheer, toot and right Talk answer | |

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
- Surprises: one round per chapter (round 1 or 2, never the warm-up), `pigeon` / `bubbles` rotating per chapter (session offset).
- Chapter time: a round that starts after `shortBudget[round]` = 30 / 48 / 62 s into the chapter is short (2 slots); Talk time after
  round 4, or after round ≥ 2 (`chapterMinRounds`) once the chapter passed 75 s. Talk re-asks every 12 s (`talkAsk {n}`), glows from the 2nd, stops after
  3; 12 s later Pom answers herself (`talkResult {auto: true}`, no star).

## 7. Events (every positional event carries x, y in logical px)
| event | fields | when |
|---|---|---|
| `session` | levels | newSession |
| `level` | level, topic, weather | a chapter starts (main: weather.setWeather, banner) |
| `round` | round, topic, surprise, scene, season, slots, pieces, steps, mode, short, key | a round starts |
| `boardIn` | x, y (board centre) | the board starts sliding in (swoosh) |
| `pieceLand` | id, i, x, y (piece bottom) | a piece first hits the tray (weather.addDust) |
| `ask` | promptKey, params, mode, step, steps, first, round, nameKind, nameValue, need, x, y (Pom's mouth) | a step asks |
| `pickup` | id, thing, asked, x, y | a piece is grabbed (Pom names it, "plip") |
| `tapPiece` | id, thing, x, y | a quick tap (hop + name) |
| `placed` | id, slot, thing, step, x, y (slot centre), count? {n}, all? {i, n} | click! it fits |
| `count` | id, i, n, x, y | counting aloud lights item i (chime) |
| `stepDone` | step, steps, last | the step's pieces are in |
| `nearMiss` | id, slot, thing, x, y (slot centre) | the asked piece on the board outside its zone ("It goes here!") |
| `wrong` | id, thing, got {nameKind, nameValue, kind, obj, color, shape, n, animal, text, size}, want {nameKind, nameValue, promptKey, params}, streak, misses, x, y | another piece on the board |
| `home` | id, x, y | let go off the board (whoosh, no line) |
| `soft` | kind 'board'\|'space'\|'early', x, y | a press that is not a piece / Pom / surprise |
| `pokePom` | promptKey, params, mode, step, x, y | Pom tapped (main repeats the prompt) |
| `hint` | id, slot, x, y (piece), toX, toY (slot), want, idle? | hint |
| `assist` | id (asked piece), from (piece id \| null), x, y | assist |
| `idle` | n, promptKey, params, mode, step | idle nudge |
| `roundDone` | round, stars, misses, x, y (board centre) | the picture is complete (alive starts) |
| `alive` | x, y | 0.7 s later: the pieces start moving ("look, it moves!") |
| `toot` | x, y (Pom's mouth) | 1.2 s into alive |
| `poof` | id, x, y | a leftover distractor pops away |
| `boardOut` | x, y (left edge) | the page turn starts (fwip) |
| `pigeon` / `pigeonTap` | x, y | the pigeon walks in / is tapped (coo, feathers) |
| `bubbles` / `bubblePop` | x, y, n · x, y | bubbles start / one is popped |
| `talk` / `talkAsk` / `talkResult` | talk · talk, n, glowAnswer · correct, choiceId, answerId, auto | Talk time |
| `levelDone` / `sessionDone` | level, stars · stars, pictures | |

## 8. Content (`PZ.Content`, DESIGN §5.1)
- Pieces: `{id 'p0'…, thing, slot 's…' | null}` in tray order; slots `{id, piece}`; steps one per real piece in random order (findAll:
  one). At every find step exactly one still-unplaced piece matches; distractors never match (validate simulates the round).
- Counts: warm-up 2 + 0 (odd / even: 2 + 1); age 3: 2 (+ 1 from round index 2, not in the first chapter); age 4: 3 + 1 (first chapter
  3 + 0); age 5: 3–4 + 1; ages 6+: 4 + 1; short rounds 2 slots. **colors below age 5: only 3 clash-free colours exist, so a round
  with a distractor has 2 slots + 1** (first chapter at age 4: 3 + 0). ≤ 5 pieces.
- Things: `obj` {obj, color} (colors: every piece a different object and colour; size: the same object + colour, `size` 'big'|'small'
  + `big` bool, its distractor another object with nameKind `'obj'`), `shape` {shape, color} (≤ 4: one colour, no square+rect /
  circle+oval / square+diamond; age 5: a 2 × 2 shape × colour grid, `p.shapes5`), `bunch` {n} (ages ≤ 4: 1–2 warm-up, ≤ 4 in round 1,
  ≤ 5 later), `dots` {n} (5+: ≤ 5 warm-up, 1–10 / 12; age 5 never n and n ± 1 together), `animal` {animal}, `glyph` {text} (letters;
  small letters without i / l, at most one of b d p q, never m+w / n+u) or {text, n} (numbers: add / sub / odd-even).
- prevAns (the next round does not open with the answer asked last; size / odd-even ≤ 2 in a row, shapes5 exempt) and usedKeys
  (never the same set twice in a chapter). `content_stats.js 200`: 0 invalid in 20 000 rounds, 0.0 % repeated sets.
- Talk: as DESIGN (2 choices at age 3 for picture topics, else 3; icons are piece things or number / color / size).

## 9. Weather (`PZ.Weather`, DESIGN §5.3)
`setWeather(i, {instant})` (0 spring, 1 summer, 2 autumn, 3 winter; 2.5 s smoothstep crossfade of every number + colour),
`resize(W, H, groundY)`, `update(dt)` (1/60 steps), `setParty(on)`, `addDust(x, y, n)`, `burst(x, y, {kind: 'confetti'|'sparkle'|
'stars'|'feathers'|'dots'|'dust'|'leaves'|'petals'|'snow', n, color})`.
`ambient = { skyTop, skyMid, skyBottom, tint (rgba | null), light, sunX, sunY, sunA, snow 0..1, mood, moodIndex, env, envFrom,
envMix, party }` — skies spring #BFE3F5 → #FDEFF4, summer #79C6EF → #D3F0FB, autumn #F3C08E → #FCE7C8, winter #B9C8DC → #EDF1F6; sun
upper left (spring), high (summer), low right (autumn), pale (winter, sunA 0.55). `clouds[6]` drifting 7–16 px/s (3 / 5 / 3 / 4).
`particles[]` {type = sprite, x, y, size, r, rot, alpha, layer, kind, color, flipX?}: spring 14 petals + 8 motes, summer 6 motes + 6
sun glints, autumn 12 tumbling leaves (leaf_a / leaf_b, flipX) + 4 motes, winter 34 snowflakes; cap 120 (ambient ≤ 56 × area scale).
Sprites = DESIGN §4.3 files: petal, leaf_a, leaf_b, snow, mote, sparkle, star, confetti_a, confetti_b, dot, feather, dust.

## 10. Bot (`PZ.Bot`, DESIGN §5.4)
`new PZ.Bot(world, {skill, seed})`, `step(dt)` before `world.update(dt)`, optional `onEvent(e)`, `stats`, `finger`. Only through
`pointerDown / pointerMove / pointerUp`: 0.8–2.2 s × (1.3 − 0.5·skill) after an ask; p 0.12 taps a piece first; drags the asked piece
with p = skill (always while the hint shows), else another tray piece; a quadratic Bézier path with 8–14 touchmoves over 0.4–0.9 s to
the slot ± 30 px (p 0.25 "high": 60 px above; p 0.06 a big miss on the board); wrong pieces go to a random board point. Talk right with
p = skill (always when glowing); taps the pigeon / one bubble with p = 0.6 per round.

## 11. Playtest (`hs_playtest.js --n 60`, 2 420 sessions, 1/30 s frames, 5 viewports, EN / VI; 2026-11-09)
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
  **centred in the free band** and stay above Pom's head (DESIGN: y = bubble bottom + 34). Tray rows are exposed as `tray.rows`.
- **colors below age 5 with a distractor: 2 slots + 1** (only 3 clash-free colours exist; DESIGN says 3 + 1 at age 4).
- Age 3 distractor from **round index 2** and never in the first chapter; odd / even warm-up has 1 distractor (the other parity is the
  content); size-round distractor = another object (`nameKind 'obj'`).
- Assist after 3 no-progress actions at ages ≤ 4 (DESIGN 6); taps on pieces and drops off the board count as no progress (never as
  misses; taps never trigger the 2-miss hint); an assisted tap of any piece (the asked one included) / a board press after the
  assist threshold glides the asked piece in (a pure tapper — even one who only taps the right piece — always finishes).
- No grabbing during enter (`soft {kind: 'early'}`); a release during the 1.0 s gap after a fit starts the next step at once.
- New events: `session`, `count`, `alive`, `assist`; extra fields: `pickup.asked`, `placed.step`, `placed.all`, `hint.toX/toY`,
  `pieceLand.i`, `round.scene/season/slots/pieces`. New fields: `board.show`, `board._pjig/_pshine/_palive`, `pigeon.peck/hop/size`,
  `piece.boxW/boxH`, `layout.pomBox/maxSize/hitR/fits/tray.rows`, `p.count` params carry `kind` ('bunch' | 'dots').
