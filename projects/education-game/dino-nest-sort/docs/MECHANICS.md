# Dino Nest Sort — Mechanics (rng · content · world · weather · bot)

Files: `game/js/rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js`. Plain scripts on `window.DN`, no DOM, no
dependency on `DN.I18N` (content/world only emit kinds, values and keys). Tests: `node tests/unit/run.js`
(38 tests, ~9 s). Playtest simulator: `tests/sim/` (see `docs/reports/playtest_report.md`). Units everywhere: logical px (short side 720), seconds, radians, y down.

## 0. Playtest changes (applied from `docs/reports/playtest_report.md`)
| | change | why |
|---|---|---|
| CONFIG | `nestPadSide` 30→**45**, `playNestGap` 24→**44**, `roundsPerLevel` 5→**4**, `roundDoneTime` 2.0→**1.7**, `leaveDelay` 1.2→**1.0**, `levelDoneTime` 2.4→**2.0** | sloppy "beside" drops accepted; resting items stay out of the 90 px drop zone; shorter chapters |
| C1 tap guard | finger travelled < `tapMovePx` 24 px (max distance from the down point, so out-and-back counts as travel) and released < `tapTime` 0.35 s after down → **`tap {id,nameKind,nameValue}`**, item hops home (0.25 s, 6 px apex); no `drop/miss/wrong/hint`, no `misses++` | tapping to hear a name was judged a miss (21 % a wrong nest on iPad portrait) |
| C2 hint cooldown | auto-hint skipped while the target nest glows or < `hintCooldown` 6 s after the last hint; manual `hint()` returns the nest id without re-emitting while it already glows | hint spam (34–59/min for random play) |
| C3 chapter time limit | at roundDone end: if `round ≥ chapterMinRounds` (3) and `time − levelStartTime > chapterTimeLimit` (75 s) → Talk time | toddler chapters 129–171 s |
| C4 idle back-off | gaps 12 → 18 → 27 → 30 s (`idleBackoff` 1.5, `idleMax` 30); reset on grab and on a new round | 24 nudges in 5 min for an absent child |
| Talk re-ask | no answer for `talkAskTime` 12 s → **`talkAsk {talk, n, glowAnswer}`**, repeating; from n = `talkGlowAfterAsks` (2) `talk.glowAnswer = true` | Talk time never re-prompted |
| Count roundDone | `roundDone {stars, mistakes, count: N, need: N}` in count rounds | lets Bo say "N! Great!" |
| Content | chapter order easiest first; `COUNT_RANGE` 5→[3,10], 6/7→[4,12], rounds ≥ 1 draw `int(max(2,min), max)`, warm-up 1–3 (2–4 from age 6); initial Talk picks the letter uniformly, then a word; age-5 homes 3 of 4; size rounds 2–3 eggs per nest (≤ 5), two colours in half the rounds from round 2 | flat/inverted difficulty ramp, trivial counts, low variety |
| Bot | a planned miss always travels ≥ 4×`tapMovePx` from the item (never mistaken for a tap) | |
Lead changes kept: portrait play band (`portraitPlayMaxFrac`, `portraitItemScale`, `play.itemScale`), `spreadPick`
farthest-point packing, no `I` in the lower-case pool, colour-blind pair avoidance below age 5.

## 1. API summary (DESIGN §5 + additions)
| | |
|---|---|
| `new DN.RNG(seed)` | `next, float(a,b)` (= `range`), `int(a,b)` inclusive, `pick, shuffle` (in place), `sample(arr,k), chance, sign, fork(salt)` |
| `DN.Content` | `makeRound(topic,{age,lang,rng,roundIndex,layout})`, `makeTalk(topic,{age,lang,rng})`, **`validate(round)`** → null or reason, **`topicsFor(age)`**, **`nestsFor(topic,age)`**, `placeBaskets`, constants `TOPICS, COLORS, SHAPES, HOMES, FRUITS, LETTER_POOL, SIZE` |
| `DN.World` | exactly §5.2, plus: **`World.logicalSize(cssW,cssH)`** (§2 short-side rule), `World.computeLayout(W,H,ins,n)`, `w.nestAt(x,y)`, `w.itemById(id)`, `w.basketById(id)`, `w.interactive` (round started and every item has popped in), `w.finger`, `w.packShrink`, `w.packOk`, `w.talkAnswered`, `w.roundStars`, `w.age`, `w.lang`, `w.levelStartTime`; events **`tap`**, **`talkAsk`**; `talk.glowAnswer` |
| `DN.Weather` | exactly §5.3, plus **`burst(x,y,{kind:'confetti'|'puff'|'sparkle', n})`**, `ambient.gust` (0..1), `Weather.SPRITES`, `Weather.CLOUD_SPRITES` |
| `DN.Bot` | `new DN.Bot(world,{skill,seed})`, `step(dt)` (call before `world.update(dt)`), `stats`, `finger {x,y,down}`, `enabled` |

Extra fields (renderer may use, nothing depends on them):
- item: `alpha` (fades on leave), `baseSize`, `slot`, `overNest` (true in the falling half of a flight → draw between nest back/front).
- basket: `reserved`, `slotSize`, `appear` (0→1 pop-in when the nest set changes), `slots[]`.
- round: `seed` (re-pack RNG). talk: `topic`, `show.scale` (size topic), `show.count`.
- layout: `portrait`, `nest.top` (sprite top), `nest.n`, `nest.sign {w,h,bottomY}` (suggestion only), `hud {x,y,w,h}`.
- Ids are strings: items `'i0'…`, baskets `'b0'…`, talk choices `'c0'…` (never falsy).

## 2. Layout (§2) and packing
`computeLayout(W,H,ins,n)` implements the §2 formulas verbatim. The nest rect used for hit tests and overlap
checks is `[x−w/2, y−0.39h, w, h]` (the opening of `nest_back.svg` is at 62/160 of its height). `play` ends
44 px above that top (bottom-row centres ≥ ≈ 92 px above it, i.e. outside the 90 px upward drop zone). Because `play.y = bo.y + 10` it is always below Bo, the bubble and the HUD buttons.

Packing (`World.packItems`): spacing `d = 1.1 × maxSize + 2√2·jitter` (jitter 4 px, so jittered neighbours stay ≥ 1.1×size
apart). Candidate centres form a stretched rectangular grid (if it has enough points) or a hex grid; rows are stretched
up to 1.7 d and centred. A random subset is used. If there are not enough points the scale steps down by 0.05 to 0.75
(`packOk=false` only if it had to go below 0.75 — never happens for the test viewports; worst case seen is 0.8
on iPad landscape with the 44 px nest gap). `setViewport` mid-round: nests and slots are recomputed, in-nest
items snap to their slots, a flying item re-targets its slot keeping its remaining flight time, resting items
(idle/appear/drag/return) get new homes (RNG = round seed ⊕ W,H so the same viewport gives the same packing).

## 3. Motion maths (all in `DN.CONFIG`, fixed step 1/120 s, semi-implicit Euler)
| Motion | Model | Constants |
|---|---|---|
| Drag follow | `a = ω²(target − p) − 2ω v` (critically damped, no overshoot); target = finger + 0.5·grab offset − (0,10) | `dragOmega 28` (95 % in 0.17 s), `grabKeep .5`, `liftPx 10` |
| Pendulum tilt | target `θ* = clamp(−vx·0.0016, ±0.45)`; `α = ωr²(θ* − θ) − 2ζωr·vr` | `tiltOmega 9`, `tiltZeta .35` → swings 2–3 times, settles in ≈1.5 s |
| Lift | `lift += (1−lift)·12·h` → renderer scale ×(1 + 0.12·lift), shadow | `liftRate 12`, `liftScale 1.12` |
| Correct flight | constant acceleration (a true parabola) `p(τ)=p0+v0τ+½aτ²`. Apex `ya = min(y0,y1) − H`, `√g = (√(2(y0−ya)) + √(2(y1−ya)))/T`, `vy0 = −√(2g(y0−ya))`; x: `vx0 = 0.25·release vx`, `ax = 2(x1−x0−vx0T)/T²`. `T = clamp(0.3 + d/2000, .32, .5)`, `H = clamp(60 + 0.06·max(0,−vy_release), 60, 140)`. Rotation `rot0(1−u)²`, size lerps to the slot size | `fly*` |
| Landing | item squash spring `q`: `sx = 1+q, sy = 1−1.2q`, `q0 = .15` (1.15 / 0.82), ω 22 ζ .3; nest `squash` .12 → ω 18 ζ .25 | `landSquash`, `nest*` |
| Wrong drop | nest `shake = sin(2π·3u)(1−u)^1.5`, u = t/0.5 s (render x offset `shake·10 px`); item returns on the same arc solver, 0.55 s, apex 45 px, wobble `0.28 sin(2π·2.5t)(1−u)` | `shake*`, `wrong*` |
| Miss | arc home 0.5 s, apex 22 px, small home squash .07 | `miss*` |
| Idle | bob `3·w·sin(φ + 2πt/P)`, P ∈ [2,3] s, w fades in over 0.5 s after landing home (no pop); eggs wiggle `0.12 sin(4πu)(1−u/2)` over 0.4 s every 4–8 s | `bob*`, `wiggle*` |
| Appear | `easeOutBack` 0.45 s (peak ≈1.1), staggered 70 ms; `appear` event when each starts | `appear*` |
| Tap | quiet hop home 0.25 s, apex 6 px (see C1) | `tap*` |
| Leave | at roundDone + 1.0 s: in-nest items hop (vy −420·(0.85–1.15), vx ±90, g 1600, spin), extras shrink; alpha 1→0 in 0.4 s | `leave*` |
| Bo | moods: correct→happy .9 s, wrong/… →oops .8, hint/idle→think 1.4, roundDone/talk right→cheer 1.6 with 3 parabolic hops (26 px, each 70 % of the last, 0.4 s); look follows the held item (rate 6/s) | `moodTime`, `cheerHop*` |

Hit tests: item radius `0.6·size + 14`; the **closest** grabbable centre wins (radii overlap a bit with the generous
pad, so nearest feels better than strict z-order). Nest zone = rect +45 px left/right/bottom, +90 px up; where zones
of neighbours overlap the nest with the nearest centre x wins. The drop uses the item centre, falling back to the finger.
Only one held item. Grabbable states: `idle` and **`return`** (a kid who grabs again while it floats home gets it —
it continues from its current position/velocity). Not grabbable: `appear`, `fly`, `in`, `leave`.

Nest slots: sort mode one row of ≤3 (4th item goes on a second row); count mode pyramid rows
`≤3 → 1 row, ≤5 → 3+2, ≤9 → 4+3+2, ≤12 → 5+4+3`, centre-out fill, rows 0.62·slot apart, slot size
`min(0.82·base, 1.3·0.74w/row, 0.5w)`. Slots are reserved on drop, so two quick drops never share a slot.

## 4. Rules
- Stars per round from `roundMistakes` (wrong-nest drops only): 0 → 3, 1 → 2, ≥2 → 1. Talk right → +1. Max session 64.
- `item.misses` counts wrong drops **and** misses (taps don't count); when it reaches 2 (and on later ones) → `hint`
  for its nest (glow 1 for 2.6 s, fades over the last 0.4 s; total 3 s), unless that nest still glows or the last hint
  was < 6 s ago.
- `idle` after 12 s of interactive round time without a held item, then after 18, 27, 30, 30 … s; reset on grab / new round.
- Talk: `talkAsk` every 12 s without an answer; `glowAnswer` from the 2nd one.
- Count mode: round ends at the `land` that makes `count == need`; a drop into a nest whose slots are all reserved
  (last fruit still in the air) just floats home without penalty.

## 5. State machine timings
`menu` → `newSession()` → `intro` 1.8 s → `round` (pop-in ≈ 0.45 + 0.07·(n−1) s, then interactive) →
`roundDone` 1.7 s (leave at 1.0 s) → … 4 rounds (or 3 once the chapter is > 75 s old) → `talk` (waits, re-asks
every 12 s; answer → +1.6 s; `skipTalk` → immediately) → `levelDone` 2.0 s → next `intro` (weather = level) … after level 3 → `sessionDone` (stays).
Simulated session length (game seconds, average of 3 seeds, 1/30 s frames):

| age | bot 0.6 | bot 1.0 |
|---|---|---|
| 3 | 200 | 161 |
| 4 | 226 | 177 |
| 5 | 242 | 198 |
| 6 | 235 | 191 |
| 7 | 223 | 181 |

10 full sessions simulate in ≈ 0.4 s. Playtest simulator on the applied code (`applied` vs the report's
`recommended`, same seeds, 1 440 sessions): toddler chapter age 3 95 s / age 4 102 s (p90 105 / 129); typical session
p90 361 / 380 / 378 s (ages 3/4/5); near-nest misses 0 %; items resting in a drop zone 0 % on iPad portrait;
taps judged miss/wrong 0 %; tapper/spammer hints 6.9 / 6.2 per min; absent child 11 nudges in 5 min; 0 errors,
fully deterministic.

## 6. Weather (`DN.Weather`, fixed 1/60 s steps → independent of the dt split)
Ambient per mood (crossfaded with smoothstep over 2 s, colours lerped in RGB, tint alpha from 0):

| mood | skyTop | skyBottom | tint | wind | sway | sun | rainbow | darkness |
|---|---|---|---|---|---|---|---|---|
| 0 sunny | #8FD3FF | #E6F7FF | null | .1 | .25 | 1 | 0 | 0 |
| 1 breezy | #7EC8F0 | #DDF3E8 | null | .6 | .8 | .8 | 0 | 0 |
| 2 rain | #8C9BB0 | #C9D3DC | null | .35 | .5 | 0 | 0 | .25 |
| 3 rainbow | #FFB38A | #FFE7B8 | rgba(255,170,90,.12) | .15 | .3 | .6 | 1 | 0 |

`wind` and `sway` rise with gusts (every 4–7 s; 0.6 s rise, 0.8 s hold, 1.5 s decay; strength ∝ base wind).
Emitter counts are per 1280×720 and scale with area (0.55–1.5×), ambient share ≤ 112, hard cap 140 including
splashes and bursts. Typical: sunny ≈ 29 (butterflies 5, pollen 19, petals 5), breezy ≈ 30, rain ≈ 113 (90 drops +
splashes), rainbow ≈ 30. Old-mood particles fade out (0.8 s) as the ramp falls; new ones fade in / enter from the top
or upwind edge. Clouds: 3–4 per mood, wrap horizontally, old set fades out over 2 s.
Motion models are documented in the header of `weather.js` (butterfly wander + flap, falling-leaf pendulum, rain
streak angle `rot = −atan2(vx,vy)` with `vx = wind·500`, splash 0.28 s at `groundY + 0..40`, twinkling sparkles).

## 7. Bot (§5.4)
Reaction `(0.8 − 0.55·skill)·U(0.8,1.2)` s; eased (smoothstep) finger paths at 700–1100 px/s with a slight arc;
grabs at the item centre, aims so the item (not the finger) lands 0–40 px above the nest top, settles 0.08–0.15 s,
releases. Wrong nest p = (1−skill)·0.35 (sort mode with ≥2 nests), miss p = (1−skill)·0.12, talk right p = 0.5+skill/2
after 1.0–2.2 s. Skill 1 never errs (tested: 64/64 stars for every age).

## 8. How to tune
- Feel of the drag: `dragOmega` (higher = stiffer), `tiltK/tiltMax` (how far it swings), `tiltZeta` (lower = more swings).
- Flight: `flyApex` (hop height), `flyPerPx` (slower over long distances), `flyInherit` (how much a throw matters).
- Difficulty: item counts per nest live in `content.js` (`per`, warm-up rule), count ranges in `COUNT_RANGE`.
- Pace: `introTime, roundDoneTime, levelDoneTime, roundsPerLevel`, `chapterTimeLimit/chapterMinRounds` (time box),
  `idleTime/idleBackoff/idleMax` (nudges), `hintAfterMisses/hintCooldown`, `talkAskTime/talkGlowAfterAsks`.
- Tap vs drop: `tapMovePx`, `tapTime` (raise them if toddlers' short drags get read as taps).
- Any key can be overridden per world: `new DN.World({ config: { roundsPerLevel: 3 } })`.
- Weather density: `count` in `Weather.MOODS[i].emitters`; caps `HARD_CAP/AMBIENT_CAP` at the top of `weather.js`.

## 9. Deviations from DESIGN.md (all small)
1. **Warm-up round:** roundIndex 0 of every chapter uses 1 item per nest (oddeven 2) instead of 2, so each chapter
   (and age 4's first chapter) starts trivially easy. Rounds 1–4 follow §5.1 exactly.
2. Topic order per session is the fixed `AGE_TOPICS` order (easiest first, re-ordered after the playtest); only the content is randomised.
3. `item.misses` counts misses too (for the auto-hint); stars only count wrong-nest drops (a drop on empty grass is
   not a "mistake").
4. Size talk shows a big **or** small egg at random (`show.scale`), otherwise "big" would always be the answer.
5. `land.need` is `null` in sort mode. `skipTalk()` emits no `talkResult`. DESIGN §2 still says the nest zone grows 30 px; it is 45 px now.
6. Grab picks the nearest grabbable centre within its radius (equivalent to top-most since items never overlap).
7. Shapes have `nests` 2/3/4 by age (§5.1 left n implicit; REQUIREMENT gives 2/3/4); homes 2/3/3 nests (age 5 uses 3 of 4,
   playtest); homes and colours 2 per nest,
   oddeven 3 per nest, sizes: egg 116, animal 112, fruit 100, shape 106 px before fit-shrink.
