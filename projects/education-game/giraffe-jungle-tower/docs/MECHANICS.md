# Lulu's Jungle Tower — Mechanics (`JT.CONFIG`, layout, motion, events, playtest tuning)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.5.
Tests: `node tests/unit/run.js` (35 tests, ≈ 17 s; `node tests/unit/run.js <name part>` runs a subset).
Sims (report-only, `tests/sim/`): `node tests/sim/hs_playtest.js [--n 60] [--ages 3,4] [--models typical,slow3,…] [--jobs 2]
[--config '{…}'] [--tag x]` (high-speed playtest, 4 500 sessions at n = 60 ≈ 7 min on 2 cores → `tests/sim/out/hs_<tag>.md`),
`node tests/sim/determinism.js`, `node tests/sim/content_stats.js [chapters]`, `node tests/sim/hs_browser.js` (the real page
in Playwright, needs the lead's build). JSON reports are git-ignored.

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. **Screen space = world space** (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s per call, so `?speed=N` works). Each sub-step
  first copies `x, y, rot → _px, _py, _prot` (pieces, flying tower blocks, monkey; butterfly `_px/_py`), `theta → _ptheta`
  (tower), `swing → _pswing`, `y → _py` (goal). Render `v = _v + (v − _v)·w.alpha`; `w.blockPose(i, alpha)` interpolates for you.
- Determinism: content + layout + surprises use the world's seeded `JT.RNG`; cosmetic randomness (spins, kicks, blinks) a second
  seeded generator. Same seed + same inputs on the same sub-steps → the same events whatever the frame size
  (`tests/sim/determinism.js`, and the unit test replays at 1/120 and 1/60 frames).

## 2. Public API (`JT.World`)
`new JT.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (a no-op when nothing changed —
iOS fires resize often), `setAge(a)`, `setLang(l)` (both apply at the next `newSession`), `newSession({lastTopics})`,
`startLevel(i)`, `update(dt)`, `drainEvents()`, `skipTalk()`, `resetNudges()` (after a pause), `talkAnswer(choiceId)` → bool.
**Input (one active pointer, logical px):** `pointerDown(x, y)` → piece id | `'locked'` | `'lulu'` | `'butterfly'` | null;
`pointerMove(x, y)`; `pointerUp(x, y)` → `'tap'` | `'drop'` | `'miss'` | `'pokeLulu'` | null; `cancelDrag()` (touchcancel /
pause: the block flies home, no event). A new `pointerDown` while a drag is open means the old finger was lost (input.js forwards
one pointer): the old drag is cancelled (block home) and the new press is handled. `w.tapMoveMin` (logical px, default 0): main
sets `max(24, 18 / cssScale)`; the tap threshold is `max(CONFIG.tapMovePx 24, tapMoveMin)`.
**Queries:** `prompt()` → `{promptKey, params}` | null (only after that ask's `ask` event), `answerId()` → id of the right piece
(phases ask / drop / bounce), `pieceHit(id)` / `luluHit()` → `{x, y (centre), w, h}`, `dropPoint()` → `{x, y}` 1.2·S above the
tower top, `towerTop()` → `{x, y, rot}`, `blockPose(i, alpha)`, `drawOrder()`, `pieceById(id)`, `hint()` (manual, e.g. a tap on
the bubble) → piece id | null, `interactive` (round + phase ask).
**Fields:** `layout, hudKeep, state, phase, level, levels, topic, weather (0..3 = level % 4), round, roundsPerLevel, ask, asks,
misses, askMisses, streak, stars, levelStars, roundStars, towers, talk, talkAnswered, alpha, time, stateTime, phaseTime, wind,
surprise, pieces, tower, goal, monkey, butterfly, hintHand, lulu, lastTopics`.
**Statics:** `JT.World.logicalSize(cssW, cssH)`, `computeLayout(W, H, ins, cfg, age)`, `slotsFor(layout, cfg, k)`, `kickFor`.

### States and phases
`menu → intro (2.5 s) → round → roundDone → round … → talk → levelDone (1.8 s) → intro (next chapter = next time of day) … → sessionDone`.
- `round` phases: `deal → ask ⇄ (drop | bounce) → deal → ask … → done`. **Deviation (as the fox game):** after `done` the world
  is in **state `roundDone`, phase `'clear'`** while the blocks hop off; the `roundDone` *event* fires inside `done` (stars show
  while the monkey leaves).
- Chapter = 4 towers. Talk time comes early when ≥ 2 towers are done (`chapterMinRounds`, QA: 3 kept slow children > 8 min) and either the chapter is > 80 s old (`chapterTimeLimit`,
  as the fox game) **or this chapter's pace (s per stacked block) says the next tower would end past 100 s** (`chapterBudget`,
  new: it keeps toddler chapters inside 60–100 s, see §7). `roundsPerLevel` then becomes the towers played (HUD dots fill).
  Talk re-asks every 12 s (`talkAsk {n}`), `talk.glowAnswer` from the 2nd re-ask.

## 3. Layout (`setViewport`, DESIGN §2) — `w.layout`
| key | rule |
|---|---|
| `W, H, ins, portrait, tall` | DESIGN short-side rule; `tall` = H/W > 1.6 |
| `groundY` | `H − ins.bottom − 28` (landscape) / `− 40` (portrait) |
| `S` | block side: 112 (age ≤ 4) / 100 (5+), shrunk so `maxN·S ≤ baseTop − (ins.top + room)`, never < 84; room = 150 (landscape), 116 (phone landscape W/H > 1.9), 260 (tall portrait), 266 (short portrait = bubble bottom 142 + 12 + bananas 104 + 8). `maxN` = the age's biggest tower (3: 3, 4: 4, 5–7: 5). Fixed for the session (age) and viewport |
| `tower {x, baseTop, baseW}` | landscape `x = max(ins.left + 0.45·(W − ins.l − ins.r), ins.left + 360)`, `baseTop = groundY − 64` (phone landscape − 52: S 87 → 97 at ages 5–7, QA); portrait `x = 0.58·W`, `baseTop = groundY − S − 150` (short portrait − 90); `baseW = S + 70` (stump cut-top width) |
| `drop {x0, x1, y1}` | `tower.x ± (S/2 + 60)`, `y < baseTop + 10` (anywhere above the stump) |
| `goalY` | bottom of the bananas `= baseTop − N·S − 8` (N = blocks of the current round; `maxN` outside a round) |
| `goalH`, `branch {x, y}` | bananas drawn 104 px tall; the stem goes up to the branch point `(tower.x, ins.top + 16)` |
| `lulu {x, y, h}` | FEET point: landscape `(ins.left + 120, groundY − 4)`, `h = 420` (W < 1100: 380); portrait `(ins.left + 115, baseTop + 70)`, `h = 400`. Hit box `x ± 0.3·h`, `y − h … y`, + 20 px |
| `slots` / `slotsFor(L, cfg, k)` | full-block centres. Landscape: from `drop.x1 + 44 + S/2` to `W − ins.right − S/2 − 20` at `y = groundY − S/2 − 6`, spacing ≥ S + 26 (spread up to S + 70, centred); what does not fit goes to a 2nd row `S + 36` higher (`row: 1` — render draws `BlockArt.drawLeafPad` under it). Portrait: one row `y = groundY − S/2 − 8`, centres at `(i + ½)/k` of `ins.left + S/2 + 20 … W − ins.right − S/2 − 20` |
| `bubble` | landscape `x = ins.left + 24, y = ins.top + 18, w = min(560, drop.x0 − 20 − x), h = 122`; tall portrait `y = ins.top + 110, w = W − x − ins.right − 24, h = 124`; **short portrait (iPad, H/W ≤ 1.6): on the HUD row** `y = ins.top + 18, w = W − ins.right − 160 − 14 − x, h = 124` (QA: at 820×1180 the full-width bubble hid 76 % of the bananas) |
| `hud` | `x = W − ins.right − 160, y = 0, w = 160 + ins.right, h = ins.top + 96` |
| `monkeyFrom {x, y}` | vine pivot on the top edge (`y = −20`), right of the tower, at `tower.x + max(150, (W + 90 − tower.x)/2)` (≤ W − ins.right − 20): the mirror point of the bananas lies beyond the right edge (see §4 monkey) |
Checked on 12 viewports × 5 ages × 2–4 choices: slots on screen and clear of the drop zone (± 44), HUD, bubble and Lulu;
tallest tower + bananas fit and are never under the bubble or the HUD (16 viewports incl. iPad 820×1180, iPhone SE 375×667,
phone landscape); the centre of every `pieceHit` picks its piece.
A small block (`size: 'small'`) rests bottom-aligned: `homeY = slot.y + (S − side)/2`, `side = 0.7·S`.

## 4. Motion (physics) and round flow — every number is in `JT.CONFIG`
| what | how | numbers (why) |
|---|---|---|
| **deal** (round start and after each stack) | bananas drop in on their stem: free fall from above the screen, then a stem spring (ω 14, ζ 0.3, catch 0.35 of the impact speed → ≈ 35 px overshoot, settles < 1 s). Choice blocks (`state in`) fall from just above the screen into their slots, staggered 0.08 s, with constant gravity `max(2600, 2·dist/0.45²)` so even the iPhone-portrait 1 400 px drop takes ≤ 0.45 s; landing squash (`q = 0.18·v/1800`), ONE small bounce (restitution 0.28), spin eases out | `dealDelay 0.35` after the round starts, `nextDealDelay 0.15` after a stack (the new blocks fall while the old ones hop away), `dealSettle 0.08` → `ask`. Was 0.45 / 0.2 + out / 0.12 (playtest: −0.4 s per ask) |
| **rest** | idle bob 0…2 px (0.7 Hz, phase per slot); a hinted block glows, bobs 6 px at 1.6 Hz and wiggles ± 0.07 rad | |
| **drag** | spring-follow of `finger − grab offset` (offset clamped to ± 0.35·S): `a = ω²(target − x) − 2ζω·v`, **ω 30, ζ 0.8** (tight, no wobble, ≈ 0.15 s lag). Scale springs to 1.08 (ω 18, ζ 0.6). **Pendulum tilt**: `rot` springs (ω 14, ζ 0.45) to `0.0007·vx` (clamped ± 0.35 rad): the block leans into the motion, swings back past 0 once when the finger stops and settles in ≈ 1 s | ζ 0.35 → 0.45 after the unit test showed a 1.2 s swing |
| **still drag** | a drag whose finger moved < 10 px for 1 s lets the idle clock run; after 6 s still the drag is cancelled (block flies home) → `stillDrag {pieceId}` (main: "Let go over the tower!") — a resting thumb never freezes the game (QA P1) | `stillMove 10`, `stillTime 6` |
| **tap vs drag** | release with < max(24, `tapMoveMin`) px total travel and < 0.35 s → **tap**: `tapPiece` (name), a hop in place (ballistic, apex 22 px). Otherwise the press became a real grab when it moved ≥ 24 px or lasted 0.35 s (`grab`, once per press; resets the idle help) | DESIGN |
| **drop** | release with the block centre — or the held point `finger − offset` (a fast flick lags) — inside `layout.drop` → **fall**: vx × 0.4, gravity 2600 px/s², a horizontal magnet spring (ω 10, ζ 0.9) to `towerTop.x + offset` with the release offset clamped to ± 0.18·S (it lands within ± 0.18·S of the top block), rotation decays 8/s. Released *below* the tower top (beside the stack): first a toss up `vy = −√(2g·(bottom − top + 30))` so it falls ON the top | `drop {right}` |
| **miss** | elsewhere → ballistic arc home (apex 50 px over the higher end ⇒ ≈ 0.39 s from the slot height, longer from high up), `miss` (not a mistake) | |
| **land** (right block) | joins the tower at its x (`dx` = offset vs the axis), squash `sy 0.82` (q 0.18 on ω 22, ζ 0.32 → overshoot ≈ 1.05 then rest), the 4 blocks below dip `0.06·(1 − 0.25·depth)·(0.5 + 0.5·impact)`; **sway kick** to the peak `min(0.07, (0.02 + 0.03·|off|/(0.18·S) + 0.03·impact)·(0.8 + 0.1·n))` (QA: 0.1 / 0.06 sat at the cap on 86 % of landings; the breeze 0.1 is now ≈ 1.5× a landing) in the offset direction (a dead-centre landing still rocks a little, random side); bananas tremble when the top is within 1.5·S of them | `land {impact = vy/1600}` then `stack` |
| **tower sway** | the stack is a damped inverted pendulum on a spring: `θ'' = −26·θ − 3.2·ω` (ω₀ 5.1 rad/s = 0.81 Hz, ζ 0.31: 2–3 visible rocks, < 0.005 rad after ≈ 1.6 s); hard cap ± 0.12 rad (velocity reversed × 0.3 at the cap). Block i is rotated `θ·(i+1)/n` (a bend, the top leans most). `dx` self-centres (≤ 0.6·S/s, ease 4/s) so the stack straightens. The tower NEVER falls | playtests: max |θ| 0.099 rad in 4 500 sessions |
| **wrong** | the block hits the top and **bounces**: `vy = −0.45·vy`, sideways kick 260 px/s **towards its home side**, spin 7 rad/s; at the apex (vy = 0) it switches to a ballistic arc home with a 6 px apex (vy stays continuous); spin eases to 0 on the way. The tower gets a small kick (0.025·(0.5 + impact)), the top block a dip. `wrong {want}`, tap lock 0.7 s (`locked`), phase `bounce` until it is home | |
| **out** | the unused choices hop away from the tower (vx 180–320, vy −360, gravity, spin) and fade in 0.35 s | |
| **done** (`towerDone`) | Lulu `cheer`; `count {i}` at 0.25 + 0.45·(i−1) s (QA: room for a spoken number) bottom → top (block glow 1 → stays 0.3), `bloom` 0.1 s after the last count (flowers per block, staggered 0.12 s, 0.45 s each) and at the same moment the **monkey** swings in: a pendulum `φ'' = −(7000/L)·sin φ` from rest at the MIRROR angle of the bananas (beyond the right edge) — energy conservation makes it arrive exactly at the bananas with zero speed (its turning point) ≈ 0.8–1.1 s later → `grab` (`bananas`, the goal is `taken`), hold 0.3 s, push 1.4 rad/s and swing back out. `roundDone {stars}` 0.4 s after the grab | `monkeyG` 7000 (6000 was ≈ 0.2 s slower) |
| **clear** | as soon as `roundDone` fired (the monkey is leaving): the blocks hop off top first, 0.1 s apart, ballistic towards `W + S` (vy −680, 0.55 s, fade over the last 0.25 s) — `clearBlock {i}` at each start; 0.1 s after the last one the next tower (or Talk) | was: wait for the monkey to leave (−0.5 s per tower) |
| **breeze** (surprise, tower index 1 = `surpriseRound`; in a 2-block tower it becomes the butterfly) | 0.6 s after the 2nd block lands: `gust {dir −1}`, `w.wind = −1` (decays to 0 in 1.2 s), the stack is kicked to a 0.1 rad peak; 0.3 s later Lulu `hold`s it for 1.5 s (tower stiffness × 1.5, damping × 3: it calms in ≈ 0.5 s) | only in towers of ≥ 3 blocks |
| **butterfly** (surprise) | from the 2nd ask, 1–2 s after the ask (and only while a block is on the tower and phase is ask): flutters in from a side on a curved path (1.6 s), sits on the tower top (follows the sway, `rot` = top rot) 4 s, flies away (1.2 s). Tap (radius 64) → `butterflyTap` + away; a falling block also sends it away (no event) | once per surprise tower |
| **Lulu** | `mood` happy (land) / oops (wrong) / think (hint, idle) / cheer (done, grab, Talk right) / talk (poke) / hold (breeze); blink every 2.2–5 s (0.13 s); `lookX, lookY` follow the active piece → monkey → butterfly → tower top (rate 6/s); `look = (lookX − x)/500` clamped ± 1 | |

**Help.** Idle nudges after 12 s without a real grab, then × 1.5 up to 20 s (`idle {n}`: 12, 18, 20, 20 …; the 5th, where
main auto-pauses, comes at ≈ 90 s); every idle also hints (cooldown 6 s). The 2nd wrong drop on an ask ALWAYS hints, later ones with the cooldown. **Soft taps** — taps on Lulu (`pokeLulu`, main
repeats the prompt), taps on blocks, taps on the grass / sky / tower, and a block let go on the grass (`miss`) — never reset the
idle clock; the 3rd soft tap in an ask hints, then every 3rd again (with the cooldown). A hint = the right block glows 4 s +
`w.hintHand`. **Tap assist (new):** once the right block has been hinted in this ask, a TAP on it — or a tap on the tower /
inside the drop zone ("put it there") — hops it onto the tower (a ballistic toss to 1.2·S above the top, then the normal fall):
`tapPiece {assist: true}` (block tap) and `drop {assisted: true, via?: 'tower'}` → `land` / `stack`. Without it a child who only
taps could never build (playtest v1: random tapper and 6×/s spammer never finished a session). **Grace assist (QA):** once
hinted, letting go of the right block ANYWHERE off the tower also tosses it on (`drop {assisted: true, via: 'grace'}`) — swipers
and children who lift the block and bring it back down are no longer stuck (swiper age 4: 654 → 365 s).
Stars per tower: 3 / 2 / 1 for 0 / 1 / ≥ 2 wrong drops **+ assisted stacks**; towers of ≥ 4 blocks forgive one slip
(3★ with ≤ 1, 2★ with 2: `freeSlipFrom 4`) (a tower that needed the tap assist shows ≤ 2 stars;
nothing negative is said). Grass misses and plain taps are not mistakes.
**One active pointer:** while a block is being dragged every other `pointerDown` returns null; a pending tap press on Lulu /
the grass is simply replaced by a new press (so a lost `pointerUp` can never lock the game).

**Resize / rotation mid-round** (`setViewport` with a new size): the drag is cancelled, the layout recomputed (S may change;
tower `dx` scale with it), every running motion finishes at once **with its events**: a falling right block lands (`land`,
`stack`, and the flow goes on), a falling wrong block bounces (`wrong`) and is home; `in` / `home` / `bounce` / dragged pieces
snap to their (new) slots, `out` pieces and flying clear blocks vanish, the bananas snap to the new `goalY`, a monkey on its
way in grabs at once (`bananas`), one on its way out vanishes, the butterfly vanishes, the hint hand re-aims.

## 5. Renderer contract (objects)
- `piece = { id, block, askIdx, choice, right, slot, row (0 | 1: on the leaf), k, side (px), homeX, homeY, x, y (CENTRE), _px, _py,
  vx, vy, rot, _prot, sx, sy, scale (lift: 1 → 1.08 while dragged, 0.8 when hopping out), alpha, state, glow 0..1, z }` with
  `state ∈ in | rest | drag | fall | bounce | home | out` (`gone` ones are removed). Draw `translate(x, y)·rotate(rot)·
  scale(sx, sy)` then `BlockArt.drawBlock(ctx, block, S·scale, {glow, lift: state === 'drag' ? 1 : 0})` with `globalAlpha = alpha`
  (an `in` piece waiting for its stagger has alpha 0). **BlockArt shrinks `size: 'small'` blocks to 0.7 itself — pass the full S.**
  Order: `w.drawOrder()` (z: 0 resting 2nd row, 1 resting 1st row, 2 in / out, 3 hopping home, 4 dragged / falling / bouncing).
  Draw z ≤ 3 before the tower, z 4 after it (the falling block is in front of the stack).
- `tower = { x, baseTop, blocks: [ { id, block, dx, side, sx, sy, glow 0..1, counted, bloom 0..1, fly } ], theta, _ptheta, omega,
  n (blocks of this tower) }`. Draw block i with `w.blockPose(i, w.alpha)` → `{x, y (centre), rot, sx, sy, alpha}` (same draw as a
  piece, S = layout.S, glow = block.glow). Flowers: `BlockArt.drawFlower(ctx, size, block.bloom, hue)` beside block i (e.g. at
  its left edge, rotated with it) when `bloom > 0`. The stump: `env/stump.svg` scaled so its cut top (180 px wide at y 18) is
  `baseW` wide at `baseTop`, centred on `tower.x`.
- `goal = { x, y (stem anchor = top of the bunch), _py, h, stemX, stemY (branch point), bottom (= goalY), state: drop | hang |
  taken, swing (rad), _pswing, dy }`. Draw `bananas.svg` `h` tall (≈ 0.92·h wide), anchor (60, 6) at (x, y), rotated `swing`;
  a stem line from (x, y) up to (stemX, stemY); the branch `env/branch.svg` so its stem point (110, 140) is at (stemX, stemY).
  `taken` → do not draw (the monkey's grab frame holds them).
- `monkey = null | { x, y (vine anchor = hand), _px, _py, rot, _prot, state: in | grab | out, vx, vy (vine pivot), L (vine
  length), phi }`. Draw `monkey_swing.svg` (state in) or `monkey_grab.svg` (grab / out), 160×200, anchor (80, 6) at (x, y),
  rotated `rot`; the vine from (vx, vy) to (x, y). `monkey_cheer` is free for the session party.
- `butterfly = null | { x, y, _px, _py, state: in | sit | away, flip (±1: heading), flap 0..1 (wing phase: < 0.5 open, ≥ 0.5 up),
  rot }`. Draw `butterfly.svg` / `butterfly_up.svg` centred at (x, y), mirrored when flip < 0.
- `hintHand = null | { pieceId, fromX, fromY, toX, toY, x, y (fingertip now), alpha 0..1, press (bool: the hand holds the
  block), t 0..1 (stroke progress), time, T }` — strokes of 1.6 s from the right block up a gentle arc to the drop point,
  for 4 s. Draw `BlockArt.drawGhostHand(ctx, size, t)` at (x, y) with `globalAlpha = alpha`; optionally a faint ghost of the
  block under the hand while `press`.
- `lulu = { x, y (feet), mood, moodT, blink (bool), blinkT, look −1..1, lookX, lookY }` (main may set mood / moodT).
- `w.wind` −1..1: the breeze (leaves / lianas may lean with it).

## 6. Events (all carry `type`)
| event | fields | when |
|---|---|---|
| `session` | `levels` | newSession |
| `level` | `level, topic, weather` | a chapter starts (intro 2.5 s) |
| `round` | `round, topic, n (blocks), asks, surprise` | a tower starts (bananas drop) |
| `deal` | `ask, n (choices), pieces [ids]` | choice blocks start to fall |
| `ask` | `ask, asks, promptKey, params, answerId, nameKind, nameValue, first` | all choices rest → main speaks the prompt |
| `grab` | `pieceId, nameKind, nameValue, block, right, x, y` | a press became a drag (once) |
| `tapPiece` | `pieceId, nameKind, nameValue, block, x, y, assist` | a tap on a block (main: just the name) |
| `drop` | `pieceId, x, y, right, assisted?` | released over the tower (whoosh) |
| `miss` | `pieceId, x, y` | released elsewhere (the block flies home) |
| `land` | `pieceId, n (tower height now), impact 0..1, x, y (contact point), right` | the right block hits the top (clonk, pitch by n) |
| `stack` | `n, nameKind, nameValue, block, ask, asks, promptKey, params, topic, x, y` | right after `land` (sayStack) |
| `wrong` | `pieceId, nameKind, nameValue, block, want {kind, value, block, color?, shape?, animal?, size?, n?, text?}, streak, misses, x, y, promptKey, params` | a wrong block bounces off the top (boing, sayWrong) |
| `locked` | `pieceId` | a grab during the 0.7 s tap lock / the bounce |
| `hint` | `pieceId, x, y, idle?` | glow + ghost hand |
| `idle` | `n, promptKey, params` | idle nudge |
| `stillDrag` | `pieceId` | a drag held still for 6 s was cancelled (main: "Let go over the tower!") |
| `pokeLulu` | `promptKey, params` | a tap on Lulu |
| `towerDone` | `n` | the last block landed |
| `count` | `i (1…n), n, x, y` | count-up glow (chime, `count.<i>`) |
| `bloom` | `n` | flowers bloom up the tower |
| `monkey` | `x, y` | the monkey swings in |
| `bananas` | `x, y` | it grabs the bananas |
| `roundDone` | `round, stars, misses, assists` | stars |
| `clearBlock` | `i (from the top), x, y` | a tower block hops off (puff) |
| `gust` | `dir, strength` | the breeze surprise |
| `butterfly` / `butterflyTap` | `x, y` | the butterfly surprise |
| `talk` / `talkAsk` / `talkResult` | `talk` / `talk, n, glowAnswer` / `correct, choiceId, answerId` | Talk time |
| `levelDone` / `sessionDone` | `level, stars` / `stars, towers` | |

## 7. Content (`JT.Content`, DESIGN §5.1)
`round = { topic, age, lang, roundIndex, n, choices, asks: [ask ×n], surprise, seed }`, `ask = { promptKey, params, choices:
[block], answer, nameKind, nameValue }`. Blocks per tower 3: 2,2,3,3 · 4: 2,3,3,4 · 5: 3,4,4,5 · 6–7: 4,5,5,5 (QA: the 4th tower is the big one, and it is played more often); choices 2 at
age 3, in the warm-up tower and for `size`; 3 at ages 4–7; 4 at ages 6–7 from tower 3. `validate()` re-checks every round:
exactly one matching choice per ask (an independent `matches()` re-derivation from promptKey + params + block fields), distinct
choices, no two consecutive asks with the same answer block / value, distractor set differs from the previous ask's, colour
rules, count-up order, sound asks never `hippo`. `makeRound(…, {avoid})` never opens a tower with the previous tower's last ask.
- **Colours below age 5** (any choice set with colours: colours, shapes, size): the ANSWER never clashes with a distractor (no
  blue+purple, red+green, yellow+orange, green+orange, red+orange; no pink); two distractors may resemble each other (QA: the
  old whole-set rule put yellow in every 3-set and orange was 3 % of age-4 answers; now each colour ≈ 16–17 %, orange vs blue +
  purple). Pink is an answer colour from age 5.
- **shapes**: ≤ 4 each shape in its own colour (a clash-free set); 5+: one distractor has the answer's colour (colour is no cue).
- **count**: towers 0–2 count up (`p.countUp`, numeral + dots, 1, 2, … n from the bottom; ages 6–7 start at 2…5 = counting on),
  distractors near numbers; tower 3 dice dots (`p.count`, kind `dots`, nameKind `dots`) asked in ASCENDING order (the tower reads
  1-2-4-5 dots from the bottom, so the closing count-up glow matches): ages ≤ 4 distractors ≥ 2 away from
  the answer when possible (age 4: 87 %), 5+ near numbers (counting matters). Ranges 3: 1–4, 4: 1–5, 5: 1–10, 6: 2–10, 7: 3–10.
- **animals**: jungle animals; from tower 3 at age ≥ 4 every 2nd ask is by sound (`p.sound`, never hippo).
- **size** (age 3): two blocks of ONE colour (a new colour each ask), big + small; never 3× the same size in a row.
- **initial**: animal blocks with `word` + `initial` (en: monkey M, elephant E, tiger T, parrot P, lion L, frog F, snake S,
  hippo H; vi: voi V, hổ H, vẹt V, sư tử S, ếch Ê, rắn R, hà mã H — "khỉ" skipped: digraph kh); distractor initials differ.
- **letters / lower**: capitals / small letters (I and L skipped for `lower`). **add / sub**: numbers, distractors near.
  **oddeven**: one parity, the distractors all the other parity; every 3rd ask is a sum (variety).
- **Talk** (`makeTalk`): choices are blocks with `id` (kinds color, shape, number, dots, animal, letter, size; `parity` at 7).

## 8. Bot (`JT.Bot`)
`new JT.Bot(world, {skill, seed, think: [1.0, 2.4], retry: [0.6, 1.4], steps: [6, 10], stepDt: [0.04, 0.07], hold: [0.1, 0.25],
butterfly: 0.6, poke: 0.03})`, `step(dt)` before `world.update(dt)`. Presses a resting block (right with p = skill, a glowing one
max(skill, 0.9), else an untried one), drags it in 6–10 `pointerMove`s on a little arc to `dropPoint()` ± (0.15·S, 0.2·S),
holds, `pointerUp`. Waits out the lock after a wrong drop. `stats {drags, right, wrong, drops, misses, locked, taps, talks,
talkRight, pokes, butterfly}`, `finger {x, y, down}` for a debug overlay.

## 9. Playtest (high speed, `tests/sim/hs_playtest.js`; full table: `tests/sim/out/hs_base.md`)
Child models (`tests/sim/lib.js`, `hs_models.js`): **typical** per age (skill 0.6/0.7/0.8/0.85/0.9 at 3…7, think 2.0–3.5 s at 3 …
1.0–2.0 s at 7, drags of 10–18 moves × 50–90 ms at 3 … 6–10 × 30–60 ms at 7, release around the drop point ± 0.9 / 0.75 / 0.6 of
its half width, 8 % distraction 4–12 s at ≤ 4, 15 % first just tap a block at ≤ 4, 4 % poke Lulu), **thoughtful** (97 %),
**slow3** (40 % wrong, 3–8 s think, very slow drags), **dropHigh** (lets go up to 380 px above the drop point), **dropLow**
(half the releases beside the tower below its top), **sloppy** (aims 1.6× too wide: ≈ 35 % grass misses), **spammer** (6 taps/s
on blocks / Lulu, never drags), **swiper** (random quick swipes), **tapper** (random taps anywhere), **confused** (random taps,
drags a glowing block with p 0.85), **absent**, **talkAbsent**, **bot0.5 / 0.8 / 1**.

**Results (final tuning, 4 050 sessions, `tests/sim/out/hs_base.md`):**
| age | typical chapter mean / p90 | cut % | typical session p90 / max | typical ask mean / p90 | wrong / ask | ★★★/★★/★ % | bot 0.8 chapter | slow3 session p90 | spammer / tapper session |
|---|---|---|---|---|---|---|---|---|---|
| 3 | **92.8** / 104.8 s | 31 | 404 / 419 s | 6.8 / 9.7 s | 0.41 | 29/44/26 | 63.0 s | 476 s | 195 / 376 s |
| 4 | **91.8** / 106.0 s | 71 | 407 / 428 s | 5.8 / 10.6 s | 0.36 | 33/38/28 | 79.5 s | 625 s | 244 / 387 s |
| 5 | 90.9 / 104.7 s | 91 | 400 / 421 s | 4.4 / 7.2 s | 0.22 | 43/34/23 | 90.5 s | 811 s | 302 / 512 s |
| 6 | 93.7 / 106.5 s | 94 | 404 / 418 s | 3.8 / 6.3 s | 0.17 | 45/37/18 | 88.4 s | 919 s | 341 / 581 s |
| 7 | 94.2 / 108.0 s | 68 | 415 / 450 s | 3.3 / 5.7 s | 0.12 | 58/32/10 | 88.4 s | 940 s | 340 / 583 s |
- Targets met: toddler (3–4) chapter 60–100 s, every typical session ≤ 8 min (max 450 s). No NaN; tower sway ≤ 0.102 rad
  (cap 0.12) and landing offset ≤ 0.175·S (≤ 0.18) in every session; every 2nd wrong drop hinted; no ask > 60 s for any
  engaged model (typical, thoughtful, slow3, dropHigh, dropLow, sloppy, bots).
- Random-input models now all finish (tapper 376–583 s, spammer 195–341 s, confused 344–608 s, swiper 440–1 127 s; 9/120
  swipers at 6–7 hit the 1 500 s cap): their stacks come from the tap assist (tapper: 1.0 assisted stack per ask → always 1 ★).
- Absent child → the 5th idle (≈ 121 s) lets main auto-pause; ignored Talk → pause at ≈ 134 s.
- Age-4 typical play: 56 % asking, 30 % watching (deal / fall / bounce / done), 3 % clear, 11 % intro / Talk; answer slot
  L/M/R 31/34/35 % (3 choices); dropHigh / dropLow behave like typical (the toss rule makes low releases work: 0.28 grass
  misses per ask only for releases below the stump line).
- Deterministic: `tests/sim/determinism.js` (10 cases incl. spammer / swiper, replays at 1/120 and 1/60 frames).

**Tuning log.**
- v1 (DESIGN numbers + deal 0.55 s fall / 0.45 s delay, clear after the monkey left): typical age 3 / 4 chapter mean 100.5 /
  102.8 s (target 60–100); tap-only children (random tapper, spammer) never finished a session (a tap can never stack).
- v2: soft taps on blocks count towards the hint (every 3rd) and the **tap assist** (a tap on the hinted right block hops it
  onto the tower) → spammer sessions 207–319 s, random tapper finishes; deal fall 0.45 s, delay 0.35 s, next deal 0.15 s while
  the old blocks hop out, settle 0.08 s; count from 0.25 s; monkey with the bloom, g 7000; clear starts at `roundDone`
  → typical 98.5 / 104.1 s (faster towers only meant fewer chapter cuts at 80 s, so the 4th tower was played more often).
- v3: `chapterBudget 100` (pace-predicted cut, see §2) → typical 93.0 / 91.9 s, session p90 397 / 413 s.
- v4: the random tapper still failed 21–60 of 60 sessions (its taps hinted, but it hit the hinted block only 2.8 % of the
  time) → grass / tower taps and grass releases are soft taps, and a tap on the tower sends the hinted block up; assisted
  stacks count like a miss for the stars (else random tapping earned 3 ★) → every tapper session finishes, 1 ★ towers.
- A stale tap press on Lulu / the grass no longer blocks the next `pointerDown` (only a block drag is exclusive).
- Drag tilt ζ 0.35 → 0.45, ω 12 → 14, k 0.0008 → 0.0007 (the swing-back after a stop lasted 1.2 s; now ≈ 0.8 s).

**QA pass (2026-11-04, `docs/reports/playtest_report.md` + `visual_report.md`)** — applied: still-drag cancel (`stillDrag`) + a new
press takes over a lost drag; `chapterMinRounds 3 → 2`, `surpriseRound 2 → 1` (breeze → butterfly in 2-block towers); blocks
4: 2,3,3,4 and 5: 3,4,4,5; `swayPeakMax 0.1 → 0.07`, `swayOffset 0.06 → 0.03`; colour clash answer-vs-distractor only; 1 free slip
in towers ≥ 4; grace assist; count-up on towers 0–2 + ascending dots; `idleHintFrom 2 → 1`, `idleMax 30 → 20`, `countStep 0.35 →
0.45`; short-portrait bubble on the HUD row (+ `baseDyPortShort 90`, `topRoomPortShort 266`); phone landscape `baseDyWide 52`,
`topRoomWide 116` (S ≥ 97); `tapMovePx` + `w.tapMoveMin`.
Short re-run (`hs_playtest --n 20`, 1 380 sessions, `tests/sim/out/hs_qa1.md`): typical chapter 92.3 / 91.6 / 88.2 / 90.3 / 93.0 s
(ages 3–7), session p90 ≤ 413 s; slow3 age 4 session p90 625 → 400 s; swiper 354–382 s (was 440–1 127 s, 9 capped); every
session of every active model finishes; landing sway ≤ 0.069 rad (age 3, no breeze), breeze peak 0.098; typical ★★★/★★/★ age 4
40/33/27 (was 33/38/28), age 5 67/23/10; absent child pauses at ≈ 94 s (was 121 s).
