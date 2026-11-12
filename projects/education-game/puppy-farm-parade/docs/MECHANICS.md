# Bo's Farm Parade — Mechanics (`FP.CONFIG`, layout, motion, render contract, events, playtest numbers)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.5.
Tests: `node tests/unit/run.js` (34 tests, ≈ 3 s: DESIGN §2 boxes on 18 viewports × 5 ages × 3–5 members, 400 fuzzed viewports
with insets / HUD / bottom-toolbar keep-outs, hit decision, ≈ 16 000 generated rounds checked with an independent rule checker,
initials en / vi (+ with the real `i18n.js`), Talk time, enter walk physics, hop arc / stretch / squash, counting, home badge, gate
auto-open + taps, synchronised march, wrong wiggle + "same member twice = 1 miss", hint / cooldown / idle backoff, soft → hint →
assist, flick, Bo poke, rotation mid-hop / mid-play / mid-march, surprises, time limit + short rounds, Talk flow, full sessions per
age × bot skill 1 / 0.6 / 0, determinism, interpolation twins, weather). `node tests/unit/run.js <name part>` runs a subset.
Sims (report-only, `tests/sim/`): `node tests/sim/hs_playtest.js [--n 500] [--ages 3,4] [--models typical,slow3,…] [--jobs 2]
[--config '{…}'] [--tag x]` (→ `tests/sim/out/hs_<tag>.md`, exit 1 on a stuck round / stuck state / NaN / member off screen),
`node tests/sim/content_stats.js [chapters]`; `hs_browser.js` / `hs_browser_vp.js` / `hs_voicelog.js` / `hs_voiceflow.js` drive
the real page in Playwright (`?bot=1`) once main.js is wired.

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. **Screen space = world space** (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s per call, so `?speed=N` works). At the start of
  every sub-step each moving value is copied into its `_p` twin; render `v = _v + (v − _v)·w.alpha`.
- Determinism: content, the surprise round and its type come from the world's seeded `FP.RNG`; cosmetic randomness (look hops,
  blinks, chick / rooster / firefly details) from a second seeded generator. Same seed + same inputs on the same sub-steps → the
  same events whatever the frame size (unit-tested).
- Motion = damped springs (`spring(o, k, kv, target, ω, ζ, h)`, semi-implicit Euler), a speed-capped spring for walking, closed-form
  parabolic arcs (`World.arc(x0, y0, x1, y1, T, apexH, vx0, minY)`, `World.arcAt(f, t)`). `World.kickFor(peak, ω, ζ)` = the initial
  velocity whose first spring peak is `peak` (used for every squash / wiggle / pop kick).
- The world never needs `parade_art.js` or the DOM.

## 2. Public API (`FP.World`)
`new FP.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (no-op when nothing changed; set
`world.hudKeep = [{x,y,w,h}…]` then call it again), `setAge` / `setLang` (apply at the next `newSession`), `newSession({lastTopics})`,
`levels`, `startLevel(i)`, `update(dt)`, `drainEvents()`, `skipTalk()`, `resetNudges()`, `talkAnswer(choiceId)` → bool,
`hint()` → `{member}` | `{door:true}` | null, `prompt()` → `{promptKey, params, rule, nameKind, nameValue}` while `interactive` (play, not answered) | null (enter, hop, gate …),
`cancelDrag()`, `memberById(id)`, `answer()` → `{member: id}` (play) | `{door: true}` (gate, doors still shut) | null.
Statics: `World.logicalSize(cssW, cssH)`, `World.computeLayout(W, H, ins, cfg, age, hudKeep, n)`, `World.slotsFor(L, k)`.
Fields: `layout, hudKeep, state, phase, level, topic, round, cur, roundsPerLevel, stars, levelStars, roundStars, misses, streak,
talk, talkAnswered, alpha, stateTime, phaseTime, interactive, odd, weather (= level % 4), members, stage, barn, bo, chick, rooster,
fireflies, puffs, hintHand, assistId, finger, surprise`.
Test hooks (logical px): `memberHit(id)` → `{x, y, r}`, `doorHit()` → `{x, y, w, h, cx, cy}` (doorway + 30 px), `boHit()` → box,
`chickHit()` / `roosterHit()` / `fireflyHit()` → `{x, y, r}` or null (never centred on a member), `answer()`.

**States / phases.** `menu → intro (2.5 s) → round [enter → play → hop] → roundDone [gate → march → out] → … → talk → levelDone
(3.6 s) → … → sessionDone`. Like the sister games, the post-answer phases run in state `roundDone` (`roundDone` event = the moment
the stars are known, just before the gate). `interactive` = state `round`, phase `play`, not answered yet.

**Input (one active pointer; a gesture = down … up), logical px:**
- `pointerDown(x, y)` → `'member'` (play: the gesture's FIRST contact, judged) | `'door'` (gate: opened the barn) | `'brush'` (a
  member pressed outside play: it bobs, `wiggle {early:true}`) | `'chick'` | `'rooster'` | `'firefly'` | `'bo'` (poke fires on
  release, < 24 px move) | `'soft'` (nothing: dust puff) | `'early'` (enter, nothing under the finger) | null.
- Hit test: circle at the member's body centre `(x, y − bob − drawnH/2)` incl. hops, `r = 0.6 × size + hitPad` (hitPad 14; on
  phones / tall screens it grows so the diameter is ≥ 184 logical ≈ 100 css px; the little one of a size round uses 0.85 × size).
  **Nearest centre wins**; members win over surprises, surprises over Bo, Bo over the ground.
- **Flick**: a press that started on nothing and moves onto a member's circle within `flickTime 0.25 s` is judged on that member
  (segment-vs-circle, first hit along the path). Later contacts of the same gesture are ignored (no second judgement).
- A soft press counts as "no progress" on **release** (play only), and only if the gesture never touched anything.
- Gate: a press (or flick) on the door box, ANY member (incl. the one on the stage) or the barn box opens the doors.

## 3. Layout (`computeLayout`, DESIGN §2) — sized for THIS round's member count n
| field | landscape | portrait |
|---|---|---|
| `groundY` | H − ins.bottom − 14 | H − ins.bottom − 26 |
| `bo` {x, y feet, h, w = 0.7 h} | ins.left + 112, groundY − 4, 220 | ins.left + 100, groundY − 4, 200 |
| `line.y` (members' FEET) | groundY − 96 | bo.y − bo.h − 70 |
| `line.x0` / `x1` (slot CENTRES) | max(bo.x + 120, boBox right + 0.62·item) (the first BODY clears Bo) / barn.x − barn.w/2 − 30 | ins.left + 64 / barn.door.x + 40 (5 members may stand in front of the barn); `x1Clear` = door.l − 0.5·item − 4: k members that fit left of it at spK stand there (`slotsFor`), so after the gap closes the doors are free for the gate |
| `barn` {x, y BASE centre, w, h} | W − ins.right − 130, line.y + 12, 250 × 270 (compact: −105, 200 × 216) | W − ins.right − 105, line.y − 6, 200 × 216 |
| `barn.door` | {x centre, y sill (= barn.y), w = 140/300·barn.w, h = 150/320·barn.h, l, r (hinge x), top, box (+30 px)} | same |
| `stage` {x, y TOP centre, s} | (x0 + x1)/2, line.y − 200, 0.9 | W/2, line.y − 230, 0.95; pushed down to hopMinY + 40 (arc room), never below line.y − item − 92·s − 8 |
| `homeBadge` | stage + (120, −60), r 46 (mirrored left if it would leave the screen) | same |
| `fenceY` (rooster feet) | line.y − 170 | line.y − 190 |
Also `bubble, hud, boBox, slots[{x, y}], item, sp, hitR, hitPad, band (assist box), entryX = ins.left − 160, exitX, hopMinY, keep[],
safe, tall, phone, compact, tier, fits`. `stage.y` is pushed down when needed so the member standing on it stays ≥ 30 px below the
bubble. `hopMinY` (the hop's highest FEET y) = max(ins.top + item + 10, bubble bottom + 1.02·item + 16): the hopping member's BODY top stays ≥ 16 px below the bubble. Bottom keep-out boxes in `hudKeep` (lower half) lift `line.y` so resting feet stay ≥ 44 px above them.
**Tiers** (first that fits = the n slot centres lie in [x0, x1]): item (120 at ages ≤ 4, 112 at 5, 104 at 6+; × 1.12 on tall
screens) at spacing 1.22 ×, the base item, itemMin 100 at 1.22 ×, 100 at 1.12 ×; landscape then the same with the **compact barn**
(iPad 4:3 with 5 members); odd viewports squeeze (never an Apple device). Spacing `sp = clamp((x1 − x0)/n, spK·item, 1.6·item)`.
Examples (age 4): 1280×720 n 5 → item 120, sp 153, hitR 86; 960×720 n 5 → compact barn, item 100, sp 122; 960×720 n 3 → item 120;
720×1556 n 3 → item 134, n 5 → item 120 (was 100; age 6: 116); 720×1036 (iPad portrait) n 5 → 120; 1036×720 (iPad landscape) n 5 → compact barn, item 100, first body 13 px right of Bo's box; 1556×720 (notch) n 5 → item 120.

## 4. `FP.CONFIG` (all tunable via `new FP.World({config})`)
| group | values |
|---|---|
| flow | step 1/120, roundsPerLevel 4, chapterTimeLimit 75 s, chapterMinRounds 3, shortBudget [∞, 26, 42, 56] s (a later round is short: 3 members at ages ≤ 4, else 4), introTime 2.5, levelDoneTime 3.6, talkAfterAnswer 1.6, talkAskTime 12, talkGlowAfterAsks 2, talkMaxAsks 3, **talkGiveUp 2** (was 12: Bo answers 2 s after the 3rd re-ask; a Talk nobody answers lasts 38 s) |
| walking | spring ω 9, ζ 0.8, speed cap walkMax 520 (gap closing) / enterV clamp(lead distance / 1.7 s, 440, 760), enterStagger 0.28 s (leader first), enterMin 1.4 s, arrive < 3 px & < 25 px/s; stepRate 2.6 + v/300 (≤ 4.6) steps/s, step bob 6–9 px (wagons 2.5), wheel += dx / (0.12·size) |
| squash | q-spring ω 16, ζ 0.4; sx = 1 + q, sy = 1/(1 + q); step kick 0.06 (wagons 0.03), settle 0.07, landing 0.16, crouch 0.1, take-off stretch −0.14 |
| tilt / wiggle | lean = 0.12 · clamp(vx/600) (wagons × 0.5), spring ω 10 ζ 0.7; wiggle kick 0.18 rad, ω 18, ζ 0.25; wrong hop 18 px / 0.32 s; sameWrongWindow 1 s |
| idle | breathing ±1.5 px (0.75 ± 0.75) at 0.6 Hz per-member phase; a random look-hop 8 px every 3–7 s in play |
| layout (new) | linePortSide 64, portX1Door −40, doorClear 4, boClearK 0.62, hopBodyK 1.02, hopBodyGap 16, hopRoom 40, stageBale 92 (bale + trestle at s = 1) |
| hop | crouch 0.1 s, flight 0.75 s, apex ≥ 120 px above the higher end (never above hopMinY), spin 0.3·sin(πu), scale 1 → stage.s, landHold 0.9 s, gapDelay 0.3 s, countDelay 0.25 s, countStep 0.5 s, countTail 0.4 s, stage pop 0.12 (ω 14 ζ 0.35), badge fade 0.25 s |
| gate | **gateHandAfter 2.0 s** (was 1.2), gateWait 4 s (auto), **gateWaitAfterAuto 2.5 s** (after a gate that opened by itself, the chapter's next gate opens after 2.5 s; a door tap restores 4 s), door spring ω 8 ζ 0.35 (overshoot ≈ 1.3, clamped ≥ 0 with a bounce), march starts 0.35 s after doorOpen |
| march | marchTime 2.2 s → v = clamp(distance / 2.2, 220, 560) px/s, accel 0.25 s, marchRate 2.6 steps/s, bob 9 px (wagons × 0.35), "in": scale 1 → 0.85 over 0.35 door.w, alpha 1 → 0 over 0.3 door.w; odd one waves (14 px hop every 0.7 s); the chapter's last round (round 3) is a **grand parade**: `parade {grand: true}`, Bo `dance` 2.2 s (main: long fanfare + a 40-piece confetti burst); leave: hop down 0.45 s then 520 px/s to the left; outDelay 0.5 s after parade, outTime 0.8 s; vane kick 16 rad/s, drag 1.1/s, wind ±0.15 rad/s |
| help | hint after 2 misses or 3 no-progress presses; assist after 6; hintTime 3.2 s, hintCooldown 6 s, hintCycle 1.6 s (taps twice); idle 12 s × 1.5 up to 30 s, the 2nd idle hints; flickTime 0.25 s; puff 0.6 s |
| surprises | rounds [1, 2], types chick / rooster rotating, night (level 3) fireflies; appear 2–4.5 s after the first ask (also during hop / gate); chick 260 px/s, r 46; rooster stay 8 s, r 62 (centre 80 px above its feet), ≥ 120 px from the stage; fireflies 5, r 40, stay 14 s |
| Bo | moods idle talk happy cheer think oops wave point bark (0.8 s, then happy) dance; hop 0.42 s; blink 2.2–5 s |

## 5. Render contract (what render.js reads; use `_p*` + `alpha` for every moving value)
- **Member** (`w.members[]`, skip `state === 'gone'`): `ctx.globalAlpha = alpha`; when `clip` → clip to the doorway rect
  `{x: door.l, y: door.top, w: door.w, h: door.h + 4}` (the part outside it is "behind the wall"); then
  `translate(x, y − bob) · rotate(rot) · scale(face·sx·scale, sy·scale)` → `ParadeArt.drawMember(ctx, thing, size, {glow, dim,
  wheel, step, night, count})`. Sort by `y` then `x` (members on the path share y; the stage member is drawn after the stage).
  `thing.big === false` → the art draws it at 0.62 (the world already uses that for the hit centre). Recommended order: barn back
  + front + doors → members (clipped while `clip`) — so a standing member in front of the portrait barn is never covered; the
  DESIGN order (frame over members) also works because only marching members get near the doorway in landscape.
- **Stage**: `ParadeArt.drawStage(ctx, layout.stage.s, {pop: stage.pop})` at `(stage.x, stage.y)`; badge:
  `drawHomeBadge(ctx, stage.badge.home, layout.homeBadge.r, {alpha: stage.badge.a})` at `layout.homeBadge`.
- **Barn**: `env/barn_<m>.svg` scaled `(barn.w/300, barn.h/320)` with its base anchor (150, 316) at `(barn.x, barn.y)`. Doors:
  `open = clamp(barn.door, 0, 1.3)`, `k = cos(π/2 · open)` (negative past 1 = swung beyond flat); left door: `translate(door.l,
  door.y) · scale(k·barn.w/300, barn.h/320)` → `barn_door_l.svg` at (0, −150); right door: `translate(door.r, door.y) · scale(k·…)`
  → `barn_door_r.svg` at (−70, −150). Vane: `env/vane.svg` pivot (40, 64) at `layout.barn.vane`, rotate `barn.vane` (unwrapped
  angle; interpolate with `_pvane`). Barn window glow = `weather.ambient.glow`.
- **Bo**: `bo.x, bo.y` (feet), `bo.h`; frame from `bo.mood` (`blink` → blink frame), lift `bo.hop × 14 px`, eyes / head turn `bo.look`.
- **Chick**: `(x, y)` feet, `face`, frame `flap > 0 ? flap : step ? 'step' : idle`, peck head-dip `peck`, `alpha`, `scale` (in barn).
  **Rooster**: `(x, y)` feet, `face`, `crow > 0` → crow frame, `flap` while flying. **Fireflies**: `(x, y)`, `glow` (0..1.6).
- **Hint hand**: `ParadeArt.drawHintHand(ctx, x, y, press, alpha)` (fingertip at x, y); `mode 'tap' | 'door'`.
- **Puffs**: `w.puffs[] {x, y, r, alpha}` → `ParadeArt.drawDust(ctx, x, y, r, alpha)`.
- The path band: at `layout.line.y` (feet), from the left edge to the barn door.

## 6. Events (`drainEvents()`; every positional event has `x, y` in logical px)
| event | when / fields |
|---|---|
| `session` | `{levels}` |
| `level` | `{level, topic, weather}` chapter start (intro 2.5 s) |
| `round` | `{round, topic, surprise, n, short, key}` members start walking in |
| `step` | `{id, kind 'animal'|'wagon'}` a walking step lands (tok / rattle) |
| `memberIn` | `{id, i (slot)}` a member arrives in its slot |
| `ask` | `{promptKey, params, rule, first, round, n}` (from Bo's mouth) — `first` = the round's first ask |
| `right` | `{id, thing, rule, misses, count?: {n, others}, home?}` the odd one was picked |
| `hop` / `land` | `{id}` take-off (boing) / landing on the stage (thump) |
| `gap` | `{n}` the others start closing the gap |
| `count` | `{id, i (1-based), n}` one apple counted on the stage (0.5 s apart) |
| `wrong` | `{id, thing, got: {nameKind, nameValue}, want: {kind, value, nameKind, promptKey, params}, streak, misses, hint?: true}` (`hint` = this miss brought the hint) |
| `wiggle` | `{id, repeat?: true, early?: true}` the same wrong member again < 1 s (no miss) / a member pressed outside play |
| `soft` | `{kind 'ground'|'early'}` press on nothing (dust puff) |
| `pokeBo` | `{promptKey, params, rule}` (play) or `{gate: true}` (doors shut) or `{busy: true}` (enter / hop / march: main only giggles, never cuts a line) |
| `hint` | `{id, mode 'tap', want, idle?}` ; `gateHint` (hand at the doors) |
| `idle` | `{n, promptKey, params, rule}` 12 → 18 → 27 → 30 s |
| `assistArmed` / `assist` | `{id}` / `{id, from}` |
| `roundDone` | `{round, stars, misses, assisted}` then immediately `gateAsk` |
| `doorOpen` | `{auto, tapX?, tapY?}` (x, y = doorway centre) ; `marchStart {n, v}` ; `marchStep {i}` every shared step ; `inBarn {id}` (id `'chick'` too) |
| `parade` | `{round, grand}` at the roof (`layout.barn.roof`) once everyone is in (star burst, vane spin, fanfare; grand = round 3) |
| `leave` | `{id, home}` the odd one hops / rolls off to the left |
| `doorClose` | doors swing shut (out, 0.8 s) |
| `chick` / `chickTap`, `rooster` / `roosterTap`, `fireflies {n}` / `fireflyTap` | surprises |
| `talk {talk}`, `talkAsk {n, talk, glowAnswer}`, `talkResult {correct, choiceId, answerId, auto}`, `levelDone {level, stars}`, `sessionDone {stars}` | as the chime game |

## 7. Content (`FP.Content`, DESIGN §5.1)
- Members per round: age 3: 3 3 3 4; age 4: 3 4 4 5 (first chapter **and every counting chapter** 3 3 4 4); age 5: 3 4 5 5; 6+: 4 5 5 5; short rounds 3 (ages ≤ 4) / 4.
- Shapes: age 3 circle square triangle star heart; age 4 + rect (oval / diamond from age 5). Size rounds 0 / 2 ask "Which one is the little one?" (`p.size`, rule size=big); rounds 1 / 3 ask "Which one is the big one?" (`p.sizeBig`, rule size=small, one big among little ones).
- **Self-check** (`validate`): exactly one odd; every other member shares `rule`, the odd one does not (independent re-check per
  kind, e.g. sums parsed from the tile text); CVD pairs + no pink below age 5; topic rules (same object in colour warm-ups and at
  age 3, mixed distinct objects later; one block colour ≤ 4, mixed colours + the odd colour shared at 5; never square/rect,
  circle/oval, square/diamond, heart/circle; |a − b| ≥ 2 for crates at ages ≤ 4, ≥ 1 (≥ 2 from 6 apples) later; letters never
  look-alike; lower: both cases + no b/d/p/q, n/u, m/w, c/o together; initials from the names; distinct tiles).
- `makeRound` retries until valid and not the same set as earlier in the chapter (`usedKeys`), not the same asked value as the last
  round (`prevRule`; farm / size have one value, parity ≤ 2 in a row). **Odd slot: uniform** over the n slots, only never the same slot
  3 rounds in a row (`prevOddSlots` = [last, before], reset per session) — measured 33/33/33 · 25×4 · 20×5 % (±3), the same slot twice
  in a row is allowed (≈ 1/n). **No wild animal / odd colour twice in a chapter** (`usedOdd`, the world keeps it per chapter;
  `round.oddValue`); colour rounds pick the odd colour first (balanced, then a friends' colour without a CVD clash).
- `topicsFor`: chapter 1 rotates between the pool's two easiest topics (the one that did not open last time); chapters 2–4 = 3 of
  the others (the left-out topic first), easiest first.
- **initial**: names from `FP.I18N.name(lang, 'obj'|'animal', value)` when loaded, else `FP.THING_NAMES` (identical today);
  classifier / article dropped (`con, cái, quả, chiếc` / `the, a, an`), VI tone marks dropped (Ă Â Ê Ô Ơ Ư Đ kept), VI words that
  start with a digraph (ch, ng, nh, kh, ph, th, tr, gh, gi, qu) are never used. The group's things appear once each, then repeat
  (objects in other colours). Every member carries `thing.letter` (for the letter flag on the sign).
- Topic pools (rotation between sessions): 3 colors shapes size animals count · 4 colors size shapes count animals · 5 colors
  shapes count letters animals · 6 letters lower initial add count · 7 count initial add sub oddeven.

## 8. Playtest numbers (`hs_playtest.js --n 500`, 5 620 sessions, 1/30 s frames, 5 viewports, en / vi)
| model | age | session min mean (p90) | chapter s mean [p10–p90] | round s mean [p10–p90] | stars 3/2/1 % | stuck rounds |
|---|---|---|---|---|---|---|
| typical | 3 | 5.2 (5.5) | 74.9 [68.9–82.4] | 16.6 [14.2–19.8] | 72.5 / 19.7 / 7.9 | 0 |
| typical | 4 | 5.1 (5.3) | **72.8 [67.0–79.8]** | 16.0 [13.9–18.6] | 82.6 / 14.0 / 3.4 | 0 |
| typical | 5 | 5.0 (5.2) | 71.0 [65.8–77.8] | 15.6 [13.6–17.9] | 86.0 / 12.1 / 1.9 | 0 |
| typical | 6 | 5.0 (5.1) | 71.1 [65.7–78.7] | 15.6 [13.6–18.2] | 88.1 / 10.6 / 1.4 | 0 |
| typical | 7 | 4.8 (5.0) | 68.4 [64.4–73.7] | 14.9 [13.4–16.3] | 89.9 / 9.3 / 0.8 | 0 |
| slow3 | 3–4 | 6.6 (7.0–7.1) | 96 [85–108] (≈ 36 % of chapters cut to 3 rounds by the 75 s limit) | 23.5 | 58 / 24 / 17 | 0 |
| bot 1 / 0.6 / 0 | 3–7 | 3.5 / 3.8 / 4.5 | 48 / 52 / 63 | 10.7 / 11.7 / 14.5 | 100 / 60 / 0 % 3★ | 0 |
A typical round = enter 2.2 s + play ≈ 5.5 s (listening 2.6 s + thinking) + hop / count ≈ 2 s + gate 2.6 s (20 % auto-open) +
march 2.1 s + out 0.8 s. No NaN, no stuck state, no member off screen, every 2nd miss got a hint (outside the cooldown) for every
model incl. tapper / spammer / flicky; the absent child gets idle nudges at 16.5, 34.5, 61.5, 91.5, 121.5 s (ask at 4.5 s).
