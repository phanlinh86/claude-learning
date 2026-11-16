# Moka's Fairy Tea Party — Mechanics (`FT.CONFIG`, layout, motion, render contract, events, playtest numbers)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.5.
Tests: `node tests/unit/run.js` (34 tests, ≈ 11 s: DESIGN §2 boxes on 8 viewports × 5 ages × 3–5 things, 400 fuzzed viewports
with insets / HUD / bottom-toolbar keep-outs, hit decision, 220 000 generated rounds (11 topics × ages 3–7 × en/vi × 2000 seeds)
checked by an independent rule checker, chained chapters (odd slot never twice in a row, no repeated set / ask), warm-up,
initials en/vi, Talk, the fluff fall (stagger, terminal speed, pendulum sway, landing squash, table spring, mat pop, fluff drift),
breeze, fairy + rise + lantern, chime / cheers / clear, counting, forest badge, wrong wiggle, hint / cooldown / idle backoff,
soft → hint → assist, slide, Moka poke, every critter, chapter time limit, Talk, full bot sessions per age × skill × viewport
(all events carry x, y), rotation mid-fall / mid-rise / mid-play, determinism, interpolation twins, no > 40 px jumps per sub-step,
weather, bot). `node tests/unit/run.js <name part>` runs a subset.
Sims (report-only, `tests/sim/`): `node tests/sim/hs_playtest.js [--n 300] [--ages 3,4] [--models typical,slow3,…] [--jobs 8]
[--config '{…}'] [--tag x]` (→ `tests/sim/out/hs_<tag>.md/.json`; exit 1 on a stuck round / stuck state / NaN / thing off
screen / the same odd slot twice), `node tests/sim/content_stats.js [chapters]` (exit 1 on an invalid round or a repeated odd
slot); `hs_browser.js` / `hs_browser_vp.js` / `hs_voicelog.js` / `hs_voiceflow.js` drive the real page in Playwright (`?bot=1`)
once main.js is wired to this world.

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. **Screen space = world space** (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s per call, so `?speed=N` works). At the start of
  every sub-step each moving value is copied into its `_p` twin; render `v = _v + (v − _v)·w.alpha`.
- Determinism: content, the surprise round and the session flow come from the world's seeded `FT.RNG`; cosmetic randomness
  (fall order / jitter / sway phase, look hops, blinks, critter spots) from a second seeded generator. Same seed + the same inputs
  (incl. `setBreeze`) on the same sub-steps → the same events whatever the frame size (unit-tested).
- Motion = damped springs (`spring(o, k, kv, target, ω, ζ, h)`, semi-implicit Euler), first-order drag towards a terminal
  velocity, a pendulum, quadratic Bézier flight paths (fairy, critters) and parabolic hops. `World.kickFor(peak, ω, ζ)` = the
  initial velocity whose first spring peak is `peak` (every squash / wiggle / pop / swing kick).
- The world never needs `tea_art.js` or the DOM.

## 2. Public API (`FT.World`)
`new FT.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (no-op when nothing changed; set
`world.hudKeep = [{x,y,w,h}…]` then call it again), `setAge` / `setLang` (apply at the next `newSession`), `newSession({lastTopics})`,
`levels`, `startLevel(i)`, `update(dt)`, `drainEvents()`, **`setBreeze(wind 0..1)`** (pass `weather.ambient.wind` every frame),
`skipTalk()`, `resetNudges()`, `talkAnswer(choiceId)` → bool, `hint()` → `{member}` | null, `prompt()` →
`{promptKey, params, rule, nameKind, nameValue}` while `interactive` | null, `cancelDrag()`, `memberById(id)`, `answer()` →
`{member: id}` (play, not answered) | null.
Statics: `World.logicalSize(cssW, cssH)`, `World.computeLayout(W, H, ins, cfg, age, hudKeep, n)`, `World.slotsFor(L, k)`,
`World.garlandY(g, u)` (the vine's y at u ∈ 0..1: `g.y + g.sag·4u(1−u)`), `World.kickFor`, `World.segHit`.
Fields: `layout, hudKeep, state, phase, level, topic, round, cur, roundsPerLevel, stars, levelStars, roundStars, misses, streak,
talk, talkAnswered, alpha, time, stateTime, phaseTime, interactive, odd, weather (= level % 4), wind, members, mats, table,
garland, fairy, moka, critter, puffs, hintHand, assistId, finger, surprise`.
Test hooks (logical px): `memberHit(id)` → `{x, y, r}` (null when gone / in its lantern), `mokaHit()` → `{x, y, w, h, cx, cy}`,
`critterHit()` → `{x, y, r, kind, i?}` or null (only while tappable, on screen, clear of the bubble / HUD), `answer()`.

**States / phases.** `menu → intro (2.5 s) → round [enter → play → rise] → roundDone [chime → cheers → clear] → … → talk →
levelDone (3.6 s) → … → sessionDone`. `roundDone` (the event) fires the moment the thing is in its lantern (+ 0.35 s), when the
stars are known. `interactive` = state `round`, phase `play`, not answered. After the 4th round's clear (or ≥ 3 rounds once the
chapter passed 75 s) the world stays in `roundDone / clear` for `garlandFullTime` 1.6 s (event `garlandFull`, `garland.twinkle → 1`)
and then starts Talk.

**Input (one active pointer; a gesture = down … up), logical px:**
- `pointerDown(x, y)` → `'member'` (play: the gesture's FIRST contact, judged) | `'brush'` (a sitting thing pressed outside play:
  it hops 8 px, `wiggle {early: true}`) | `'critter'` | `'moka'` (the poke fires on release, < 24 px move) | `'soft'` (nothing:
  dust puff) | `'early'` (enter, nothing under the finger) | null (not in a round).
- Hit test: circle at the thing's body centre `(x, y − lift − drawH/2)` (drawH = size × 0.62 for `big: false` × scale × sy),
  `r = 0.6 × size + hitPad` (hitPad 14; on phones / tall screens it grows so the diameter is ≥ 184 logical px; the little one of a
  size round uses 0.85 ×). **Nearest centre wins.** A critter wins over the nearest thing only when the press is ≥ 2 × closer to
  the critter (`critterK`), so a tap on a thing's lower body is never stolen by the ladybug walking past. Things / critters beat
  Moka; Moka beats the table.
- **Slide**: a press that started on nothing and moves onto a thing's circle within `flickTime 0.25 s` is judged on that thing
  (segment-vs-circle). Later contacts of the same gesture are ignored.
- A soft press counts as "no progress" on **release** (play only) and only if the gesture never touched anything.
- Assist (after 6 no-progress presses): the next press anywhere in `layout.band` (the table band) picks the odd one (≤ 2★).

## 3. Layout (`computeLayout`, DESIGN §2) — sized for THIS round's thing count n
| field | landscape | portrait |
|---|---|---|
| `groundY` | H − ins.bottom − 14 | H − ins.bottom − 26 |
| `moka` {x, y seat, h, w = 0.7 h, cup, cupUp, mouth} | ins.left + 120, groundY − 10, 250 | ins.left + 110, groundY − 6, 220 |
| `mokaBox` | moka ± w/2, h tall, + 10 px pad | same |
| `garland` {x0, x1, y, sag 40, bottom, lanterns[4]} | x0 = ins.left + 70, x1 = W − ins.right − 70, y = bubble bottom + 46 | y = bubble bottom + 50 |
| `garland.lanterns[i]` {x, y hang point on the vine, u, cx, cy bulb centre} | u = 0.2, 0.4, 0.6, 0.8; cy = y + 34 + 35 | same |
| `fairyHome` {x, y} | the vine at u = 0.08, 16 px above it (near the left trunk) | same |
| `table` {y TOP surface = things' bottom, x0, x1, plankX0/X1 = x0 − 30 / x1 + 30, plankH 46, legs [x0 + 70, x1 − 70], legBottom = groundY} | y = groundY − 150, x0 = moka.x + 110, x1 = W − ins.right − 60 | y = max(moka.y − moka.h − 40, garland.bottom + 260), x0 = ins.left + 50, x1 = W − ins.right − 50 |
| `slots[{x, y}]`, `sp` | n centres in [x0 + 40, x1 − 40], sp = clamp(span / n, spK·item, 1.7·item) | same |
| `entryY` | −140 (things' bottom at spawn) | same |
Also `bubble, hud, item, spK, span, slotX0, slotX1, hitPad, hitR, band, keep[], safe, tall, phone, tier, fits, squeezed`.
Bottom keep-out boxes in `hudKeep` (lower half) lift `table.y` so resting things stay ≥ 44 px above them; `table.y ≤ groundY − 60`.
**Tiers** (first that fits = the n slot centres lie in [x0 + 40, x1 − 40]): item (124 at ages ≤ 4, 114 at 5, 106 at 6+) × 1.12 on
tall screens at spacing 1.25 ×, the base item, itemMin 100 at 1.25 ×, 100 at 1.12 ×; odd viewports squeeze (never an Apple device).
Examples (age 4): 1280×720 table.y 556, n 3 item 124 sp 211, n 5 sp 182, lanterns cx 298 / 526 / 754 / 982, cy 293–305;
960×720 (iPad) table.y 529, n 3 → 124, n 5 → item 100 sp 125; 1036×720 n 5 → 124 sp 155; 1561×720 (notch) n 5 → 124 sp 195;
720×1561 (iPhone portrait) table.y 1207, garland.y 392, n 3 → 139 (tall), n 5 → 100; 720×1036 (iPad portrait) table.y 726.

## 4. `FT.CONFIG` (all tunable via `new FT.World({config})`)
| group | values |
|---|---|
| flow | step 1/120, roundsPerLevel 4, chapterTimeLimit 75 s, chapterMinRounds 3, shortBudget [∞, 26, 42, 56] s (a later round is short: 3 things at ages ≤ 4, else 4), introTime 2.5, levelDoneTime 3.6, garlandFullTime 1.6, talkAfterAnswer 1.6, talkAskTime 12, talkGlowAfterAsks 2, talkMaxAsks 3, talkGiveUp 2 (Moka answers) |
| fall (enter) | enterStagger 0.22 s (random order), enterMin 1.4 s, settleTime 0.3 s after the last landing → ask; terminal speed vT = clamp((table.y − entryY) / fallTime 1.25, 260, 900) px/s (≈ 530 landscape, 900 tall portrait), starts at 0.6 vT, first-order drag 7 /s; the fluff **flares** in the last 0.36·vT px (target speed eases to landV 150) → lands at ≈ 240 px/s (landRef); hang length Lh = size × 1.32, fluffR = size × 0.42 |
| sway | the fluff pivot drifts back over its placemat (spring ω 2.6 ζ 0.85, start ±60 px off), breeze pushes 40·wind px/s²; pendulum ω 3.2 ζ 0.15, start ±0.08–0.13 rad, driven by 0.3 rad/s² flutter at 0.35–0.6 Hz + 0.5·wind − 0.9·(pivot accel)/Lh → peak ≈ 0.12 rad; rot = −swing (rigid hanging body) |
| landing | squash q-spring ω 16 ζ 0.4, kick 0.14 × clamp(v/240, 0.8, 1.15): sx = 1 + 0.86 q ≈ 1.12, sy = 1 − q ≈ 0.86; the swing becomes a tilt that settles (ω 10 ζ 0.5); table spring ω 14 ζ 0.3, kick 2.5 px × mass (guest 1, obj 0.8, plate 0.7, cookie 0.6, card 0.5) × clamp(v/240, 0.6, 1.5); placemat pop peak 1 (ω 14 ζ 0.35); the fluff lets go: (−46 + 0.3 vx − 30 wind, −64) px/s, rising, fades over 1.4 s |
| sitting | slot spring ω 9 ζ 0.8 (cap 520 px/s; only after a re-layout), breathing ±1.5 px (sy) at 0.6 Hz per-thing phase, breeze tilt ≤ 0.04·wind rad at 0.45 Hz, look-around hop 8 px / 0.3 s every 3–7 s in play |
| wrong | wiggle kick 0.18 rad, ω 18, ζ 0.25 + hop 14 px / 0.3 s; sameWrongWindow 1 s |
| rise | fairy flies 0.45 s (Bézier, 80 px arc) → circles once in 0.7 s (radius ≈ 0.6·size + 8, 3 dust events) while the thing levitates 12 px (0.4 s, ±3 px bob); plates: count every 0.5 s after 0.2 s, tail 0.35 s; float: vy → −vR (vR = clamp(dist / 1.6, 220, 400)) with drag 2.6 /s, slowing in the last 90 px (≥ 0.3), sway 26 px at 1.1 Hz (fades as it rises), spin 0.18 rad at 0.7 Hz, scale 1 → 0.42 (smoothstep of the height progress), x eases to the lantern's cx; the thing's body centre ends at the lantern bulb centre |
| lantern | `lit` spring → 1, ω 9 ζ 0.35 (overshoot ≈ 1.3); swing pendulum ω 4 ζ 0.12, kick 0.22 rad (+ breeze 0.25·wind); lanternHold 0.35 s → roundDone; home badge 2 s (fade 0.25 s) |
| fairy | lead: spring ω 10 ζ 0.9 to 30 px above the rising thing; back home 0.8 s Bézier; cheers loop r 34 in 0.9 s; rest bob ±3 px at 0.8 Hz; flap 4 Hz resting / 12 Hz flying |
| chime / cheers / clear | chimeGap 0.3 s, hop 26 px parabolic / 0.36 s (stretch at take-off, squash 0.08 on landing), `hop` frame held 0.15 s after landing, ring 1 → 0 in 0.5 s, chimeTail 0.4 s; cheersTime 1.1 s; clear 0.8 s: poofs sweep left → right 0.05 + 0.4·(x − xmin)/(xmax − xmin) s, each shrinks to 0 in 0.28 s (+10 px lift, alpha 1 − u²) |
| help | hint after 2 misses or 3 no-progress presses; assist after 6; hintTime 3.2 s, hintCooldown 6 s, hintCycle 1.6 s (taps twice); idle 12 s × 1.5 up to 30 s, the 2nd idle hints; flickTime 0.25 s; puff 0.6 s |
| critters | one round per chapter: round 1 or 2 (seeded), kind by chapter index ladybug / butterfly / snail / fairies; appear 2–4.5 s after the first ask (also during rise / chime); ladybug 70 px/s along y = table.y + 20 from plankX1, stops 3 s in the middle gap, r 40 (centre 12 px above its feet), fly-off 1.1 s; butterfly r 38: flies in 1.6 s, sits 5 s on a friend's top (never the odd one), loop r 50 / 1.2 s, out 1.6 s; snail r 46 (centre 40 px above): slides 70 px out from behind the right toadstool leg in 2.2 s, stays 10 s, peek 1 s, back 1.6 s; fairies 4 × r 40 orbit the lanterns (r 46, ω 1.6), in 1.4 s, dance 14 s, twirl 0.9 s, out 1.2 s. When the clear starts, a critter still around leaves |
| Moka | moods idle talk happy cheer think oops wave point sip (+ umbrella frame: main, rain chapter); moodTime happy 0.9 cheer 1.4 oops 0.8 think 1.4 talk 1.0 wave 1.4 point 1.2 sip 1.3; bounce 0.42 s; blink 2.2–5 s (0.13 s); look spring rate 6 |

## 5. Render contract (what render.js reads; interpolate every `_p` twin with `w.alpha`)
- **Table**: `TeaArt.drawTable(ctx, L.table.x0, L.table.x1, L.table.y, {spring: lerp(table._pspring, table.spring), wet})`
  (spring > 0 = plank pushed down px). **Placemats**: `w.mats[] {x, y, w, pop, _ppop}` → `drawPlacemat(ctx, w, {pop})` at (x, y)
  (one per slot of the current round; kept between rounds; pop can briefly go negative).
- **Things** (`w.members[]`, skip `state === 'lantern' | 'gone'`; draw sitting ones sorted by x, then `rise` ones in front):
  `globalAlpha = alpha; translate(x, y − lift) · rotate(rot) · scale(sx·scale, sy·scale)` → `TeaArt.drawThing(ctx, thing, size,
  {glow, dim, hop, count, ring, night: weather darkness})`. `y` is the BOTTOM (placemat) point, so rotate / squash pivot there; while
  falling `rot = −swing` makes the thing hang rigidly under its fluff. `count` −1 except while a plate is being counted (0..n).
  `glow` 0..1 (hint, assist = 1, rising ≈ 0.7–1, right flash). `ring` 0..1 bell flash, `hop` 1 → guest `_hop` frame.
  Twins: `_px _py _plift _prot _psx _psy _pscale _palpha`. A falling thing that has not spawned yet sits at `y ≈ entryY` (off screen).
- **Fluffs** (draw after things): every member with `fluff > 0` → `drawFluff(ctx, fluffX, fluffY, fluffR, fluff)` (twins
  `_pfluffX _pfluffY _pfluff`); attached while `state === 'fall'` (the string runs from (fluffX, fluffY) to the thing's top),
  drifting away afterwards (also after the thing is gone).
- **Garland**: `drawGarland(ctx, w.garland, w.garland.lanterns, t)`; each lantern `{x, y (hang point), cx, cy (bulb centre), lit
  0..~1.3 (spring; `_plit`), color (answer colour name or null = gold), thing (the thing inside or null), home, swing (rad; `_pswing`)}`
  → `drawLantern(ctx, x, y, s, clamp(lit, 0, 1.3), color, thing, swing)`. `garland.twinkle` 0..1 (garlandFull), `garland.lit`
  (count). `garland.badge {home, i, a 0..1, x, y}` → `drawHomeBadge(ctx, home, r, {alpha: a})` at (x, y) (below lantern i).
- **Fairy** `w.fairy {x, y, _px, _py, face ±1, flap 0|1 (wing frame), sprinkle 0..1 (> 0.5 → fairy_sprinkle frame), state
  'rest'|'fly'|'circle'|'lead'|'back'|'loop', id}` → `characters/fairy[_flap|_sprinkle].svg`, centre anchor at (x, y), mirrored by
  face. Main adds `weather.addDust` on `dust` events (and a trail while `state === 'lead'`).
- **Moka** `w.moka {x, y (seat), h, w, mood, moodT, blink, look −1..1, bounce 0..1 (_pbounce)}` → frame `moka_<mood>` (blink →
  `moka_blink`; rain chapter idle → `umbrella`), lift `bounce × 12 px`. Cup points for effects: `layout.moka.cup / cupUp / mouth`.
- **Critter** `w.critter` (null when none): `{kind, x, y, _px, _py, state, t, face}` +
  ladybug `{step 0|1, open 0|1}` (feet at (x, y); `state 'walk'|'stop'|'fly'|'gone'`; fly → `ladybug_fly`), butterfly `{flap 0..1}`
  (centre; `'in'|'sit'|'loop'|'out'`), snail `{show 0..1, peek 0..1}` (bottom at (x, y); peek → `snail_peek`; draw after the table
  legs so it peeks out from behind the right leg), fairies `{fairies: [{x, y, _px, _py, flap, twirl 0..1 (spin 2π·twirl), glow
  0..1.6}]}` (`'in'|'dance'|'out'`).
- **Hint hand**: `TeaArt.drawHintHand(ctx, x, y, press, alpha)` (fingertip at x, y; `_px _py`). **Puffs**: `w.puffs[] {x, y, r, alpha}`
  → `drawSparkle` (soft-tap sparkle).

## 6. Events (`drainEvents()`; every positional event has `x, y` in logical px — all but `session, talkAsk, talkResult, levelDone, sessionDone`)
| event | when / fields |
|---|---|
| `session` | `{levels}` |
| `level` | `{level, topic, weather}` chapter start (intro 2.5 s); lanterns reset |
| `round` | `{round, topic, surprise, n, short, key}` things start falling |
| `fall` | `{id, i (slot)}` a thing appears under its fluff (soft whoosh) |
| `land` | `{id, i, kind}` it lands on its placemat (plop + table thunk) |
| `ask` | `{promptKey, params, rule, first, round, n}` (x, y = Moka's mouth) — `first` = the round's first ask |
| `right` | `{id, thing, rule, misses, lantern (index), count?: {n, others}, home?}` the odd one was picked |
| `fairyFly` / `fairyArrive` | `{id}` the fairy sets off / arrives at the thing |
| `dust` | `{id}` 3 × while the fairy circles (main: `weather.addDust`) |
| `count` | `{id, i (1-based), n}` one berry counted (0.5 s apart), before the rise |
| `rise` | `{id}` the thing starts floating up (shimmer) |
| `lantern` | `{i, color, thing, home?, auto?}` the lantern opens (bloom); `auto` = lit by the fairy for a chapter cut short |
| `roundDone` | `{round, stars, misses, assisted}` |
| `chime` | `{i (0-based, left → right), n, id}` each friend's hop (rising bell note) |
| `cheers` | `{round}` at Moka's raised cup (clink + sparkle burst) |
| `poof` | `{id}` a thing vanishes into sparkles |
| `garlandFull` | `{n: 4}` the whole garland twinkles (then Talk) |
| `wrong` | `{id, thing, got: {nameKind, nameValue}, want: {kind, value, nameKind, promptKey, params}, streak, misses, hint?: true}` |
| `wiggle` | `{id, repeat?: true, early?: true}` the same wrong thing again < 1 s (no miss) / a thing pressed outside play |
| `soft` | `{kind 'table'|'early'}` press on nothing (dust sparkle) |
| `pokeMoka` | `{promptKey, params, rule}` (play) or `{busy: true}` (enter / rise / chime …: main only giggles, never cuts a line) |
| `hint` | `{id, mode 'tap', want, idle?}` |
| `idle` | `{n, promptKey, params, rule}` 12 → 18 → 27 → 30 s (x, y = Moka's mouth) |
| `assistArmed` / `assist` | `{id}` / `{id, from}` |
| `critter` / `critterTap` | `{kind}` / `{kind, i?}` (fairies: the index of the tapped fairy) |
| `talk {talk}`, `talkAsk {n, talk, glowAnswer}`, `talkResult {correct, choiceId, answerId, auto}`, `levelDone {level, stars}`, `sessionDone {stars}` | as the sister games |

## 7. Content (`FT.Content`, DESIGN §5.1)
- Things: `obj` (cup teapot jar bowl cupcake, colour) · `cookie` (shape icing, colour) · `plate` (n raspberries 1–12) · `card`
  (text) · `guest` (FT.GUESTS animal + home). Members per round: age 3: 3 3 3 4; age 4: 3 4 4 5 (first chapter and every
  counting chapter 3 3 4 4); age 5: 3 4 5 5; 6+: 4 5 5 5; short rounds 3 (ages ≤ 4) / 4.
- Warm-up (round 0): colours = the same object in two clash-free colours; shapes = very different outlines only (circle vs
  triangle / star / square …); count ≤ 4 berries with a gap ≥ 2; animals = the same forest guest + another forest guest.
- `animals`: age 3 and every round 0 → `p.animal` (forest guests only); from round 1 at ages ≥ 4 → `p.forest` (different forest
  guests + one of penguin / crab / camel / lion, its home on the badge). **Goldfish is never the odd one of a forest round nor a
  Talk "where does it live" question** (it is a freshwater pet; its "sea" badge would teach a wrong fact) — it still appears in
  initial rounds.
- `size`: the same obj (one colour) or the same forest guest; rounds 0 / 2 `p.size` (one little), 1 / 3 `p.sizeBig` (one big).
- **Odd slot: uniform over the slots except the previous round's odd slot — never the same slot twice in a row** (world passes
  `prevOddSlots`, reset per session). No non-forest guest / odd colour twice in a chapter (`usedOdd`).
- `initial`: names from `FT.I18N.name(lang, 'obj'|'animal', value)` when loaded, else `FT.THING_NAMES` (en + vi); classifier /
  article dropped, VI tone marks dropped (Ă Â Ê Ô Ơ Ư Đ kept), VI digraph words (con thỏ, con chuột, con nhím, chim cánh cụt) never
  used. VI groups: B (bát, bánh), C (cáo, cú, cua, cá vàng), S (sóc, sư tử) …; EN: C (cup, cupcake, crab, camel), B (bowl, bunny) ….
- Self-check (`validate`) as the parade game: exactly one odd; every other thing shares `rule`, the odd one does not; CVD pairs +
  no pink below age 5; topic rules (above).

## 8. Playtest numbers (`hs_playtest.js --n 300 --jobs 8`, 4 520 sessions, 1/30 s frames, 5 viewports, en / vi, every 7th session rotated mid-play)
| model | age | session min median (p90, max) | chapter s median [p10–p90] | round s median [p10–p90] | stars 3/2/1 % | stuck rounds |
|---|---|---|---|---|---|---|
| typical | 3 | 4.9 (5.2, 5.6) | 68.2 [63.3–77.5] | 14.0 [12.6–18.3] | 71.9 / 20.8 / 7.3 | 0 |
| typical | 4 | **4.8 (5.1, 5.3)** | **67.7 [62.2–76.7]** | **13.9 [12.5–17.2]** | 82.0 / 14.8 / 3.2 | 0 |
| typical | 5 | 4.7 (5.0, 5.3) | 66.4 [61.4–76.4] | 13.7 [12.5–17.4] | 86.4 / 11.5 / 2.2 | 0 |
| typical | 6 | 4.8 (5.0, 5.3) | 66.5 [62.3–77.8] | 13.8 [12.8–17.9] | 87.3 / 11.4 / 1.4 | 0 |
| typical | 7 | 4.6 (4.8, 5.1) | 64.3 [61.5–69.5] | 13.4 [12.6–14.6] | 90.0 / 8.9 / 1.1 | 0 |
| slow3 (slow toddler) | 3 / 4 | 6.3 / 6.3 (6.7–6.8, max 7.5) | 89.0 / 90.7 [78–105] (16–18 % of chapters cut to 3 rounds) | 17.8 / 18.3 | 60 / 24 / 16 | 0 |
| tapper / spammer / poker / flicky | 3–7 | 4.6–6.1 (max 6.7) | 64–88 | 13.4–20.8 | — | 0 |
| bot 1 / 0.6 / 0 | 3–7 | 3.3–3.7 / 3.5–3.9 / 4.3–4.6 | 46–50 / 50–54 / 61–65 | 9.6–10.7 / 10.4–11.6 / 13.3–14.4 | 100 / ≈ 60 / 0 % 3★ | 0 |
A typical round = enter 2.4 s (fall + settle) + play ≈ 5.5 s (listening 2.6 s + thinking) + rise 3.0–3.7 s (fairy 1.15 s + float
≈ 1.5 s + lantern 0.35 s; plates + 0.5 s per berry) + chime / cheers / clear ≈ 3.1 s. 0 NaN, 0 stuck states, 0 things off screen,
0 repeated odd slots, every 2nd miss got a hint (outside the cooldown) for every model; the absent child gets idle nudges at 17,
35, 62, 92, 122, 152 s (ask at ≈ 5 s). The defaults already hit the targets (toddler chapter 60–100 s, session ≤ 8 min), so the
tuned durations are: fallTime 1.25, fairyFly 0.45 + fairyCircle 0.7, riseTime 1.6, chime 0.3 / thing + 0.4, cheers 1.1, clear 0.8.
