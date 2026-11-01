# Mầm's Treasure Reef — Mechanics (rng · content · world · weather · bot)

Files: `game/js/rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js`. Plain scripts on `window.TR`, no DOM, no
dependency on `TR.I18N` (content/world only emit kinds, values and keys). Tests: `node tests/unit/run.js`
(53 tests, ≈ 11 s). Units everywhere: logical px (short side 720), seconds, radians, y down. Started from Owlet's Snow
Garden's mechanics (`../owl-snow-garden/docs/MECHANICS.md`): the drag mechanic, packing, motion models, tap guard,
hint cooldown, idle back-off, chapter time limit and Talk re-ask are kept as they were tuned there. Everything not listed
here works exactly as in Snow Garden (pots → chests, seeds → treasures, Lumi → Tutu).

## 1. API (DESIGN §5 + additions)
| | |
|---|---|
| `new TR.RNG(seed)` | `next, float(a,b)` (= `range`), `int(a,b)` inclusive, `pick, shuffle` (in place), `sample(arr,k), chance, sign, fork(salt)` |
| `TR.Content` | **`planFor(age, lagoon)`** → 4 chapters `{topic, mech, n?, range?}` (REQUIREMENT table; `n` = "×N", `range` = "count lo–hi"; `mixed` rows = 4 distinct topics the age knows, seeded by `(age, lagoon)`, easiest first), `knownTopics(age)`, `topicsFor(age)` (= lagoon 1), `makeRound(topic,{age,lang,rng,roundIndex,layout,mech,n,range,prev})`, `makeTalk(topic,{age,lang,rng})`, `validate(round)` → null or reason, **`digParams(round, itemId)`** (prompt params of a dig target), `chestsFor(topic,age)` (`potsFor`/`nestsFor` aliases), `placeBaskets(baskets, layout, mech)`, `placeMounds(mounds, layout)`, `longRect(layout, N, mech)` (`planterRect` alias), `matches`, `sameLabel`, `safeColors`, `clash`, constants `TOPICS, COLORS, SHAPES, ANIMALS, PLAN, LETTER_POOL, SIZE, SIZE_SCALE, COUNT_RANGE, LONG, DIG_COUNT_MAX` |
| `TR.World` | DESIGN §5.2, plus `World.logicalSize`, `World.computeLayout(W,H,ins,n)`, **`newSession({lagoon, plan, startLevel})`**, `startLevel(i)`, `w.plan / w.lagoon / w.levels / w.chapter / w.mech`, `w.pearls`, `w.chapterStars[]`, `w.chestAt(x,y)` (`potAt`/`nestAt` aliases), **`w.moundAt(x,y)`**, **`w.tapMound(id)`**, **`w.targetLabel()`**, **`w.targetMound()`**, `w.moundById`, `w.isDig()`, `w.goalOf(item)`, `w.prompt()` → `{promptKey, params}` for the current target (ask: the animal; dig: `digParams` / `{n}`), `w.itemById`, `w.basketById`, `w.interactive`, `w.completing`, `w.target` (ask: chest id; **dig: item id**), `w.queue`, `w.playRect`, `w.finger`, `w.packShrink`, `w.packOk`, `w.talkAnswered`, `w.roundStars`, `w.roundMistakes`, `w.levelStartTime`, `w.tutu {mood, moodT, lookX, lookY, hop, dance}` |
| `TR.Weather` | DESIGN §5.3, plus `wx.shafts[]`, `burst(x,y,{kind:'confetti'|'puff'|'sparkle', n})` (`puff` = sand puff, sprite `sand`), `ambient.gust`, `ambient.windBase`, `ambient.moonX/moonY`, `stars[].tw`, `Weather.SPRITES`, `CLOUD_SPRITES`, `MOODS`, `SKY`, `FADE_TIME` |
| `TR.Bot` | `new TR.Bot(world,{skill,seed})`, `step(dt)` (call before `world.update(dt)`), `stats {grabs, taps, correct, wrong, misses, crabs, talks, talkRight}`, `finger {x,y,down}`, `enabled` |

### Events (world.drainEvents()) — all carry `type`
`session {levels, lagoon, plan:[{topic, mech}]}`, `level {level, topic, mech}`, `round {round, topic, mech, mode, promptKey,
params, need|null}`, `ask {basketId, label, promptKey:'p.animals', params:{animal}}` (ask mode: after `round` and after every
`correct` that moves the target on), **`next {itemId, promptKey:'p.dig.<topic>', params}`** (dig: when a new target starts;
never at round start, never in count rounds), `appear {id}`, `grab {id, nameKind, nameValue}`, `tap {id, nameKind, nameValue}`
(drag tap guard), `drop {id, basketId|null}`, `correct {id, basketId, nameKind, nameValue, label, moundId?}` (dig: `label` = the
item's taught attribute `{type, value}`), **`dig {moundId, itemId, correct}`**, `wrong {id, basketId?, moundId?, itemId?, misses,
target, nameKind, nameValue}` (drag: `misses` = that item's; dig: `misses` = the round's), `miss {id}`, `land {id, basketId,
count, need|null}`, **`sparkle {id, basketId, x, y, gem}`** (every landing), **`count {n, need}`** (count rounds, on each land),
**`crab {moundId, x, y}`**, `hint {basketId}` (drag) / `hint {moundId, basketId:null}` (dig), `idle {promptKey, params}`,
`roundDone {stars, mistakes, count?, need?}`, **`pearl {n, total}`** (+1 correct, +5 roundDone, +10 levelDone, +25 sessionDone;
emitted right after the event that earned it), **`photobomb {dir:1|-1, y:0..1}`** (after the 3rd and 6th correct of a chapter),
`talk {talk}`, `talkAsk {talk, n, glowAnswer}`, `talkResult {correct, choiceId, answerId}`, **`levelDone {level, stars, mech}`**,
**`sessionDone {stars, lagoon, levelStars:[4], pearls}`**.

### Fields for the renderer
- **Chest (basket):** `kind 'chest'|'long'`, `x` (centre), `y` = opening centre = **`openY`** (chest: `top + 0.27 h`, long:
  `top + 0.30 h`), `w, h`, `top`, `bottom` (= groundY + 8), sprite rect `[x − w/2, top, w, h]`; `slots[{x, y}]` — chest: 1–3
  across 66 % of `w` (centre-out) at `openY + 0.12 h`, long: N across 84 % at `top + 0.6 h`, filled left → right; `slotSize`
  (drawn item size inside, chest ≤ 0.42 w), `count`, `need`, `squash`, `shake`, `glow`, `appear`. Size topic: the small chest
  is 0.72× (same x and bottom).
- **Item:** `x, y, rot, size, scale` (drawn = size·scale), `sx, sy, alpha, appear, lift, state, _px, _py, _prot`, `gem`
  (palette key of the landing sparkle), **`settle`** (0 → 1 under-damped after landing, peak ≈ 1.3), `overChest`
  (= `overPot`: falling half of a flight → draw between chest back/front), dig: `moundId`, `label`, `peek` (0..1). States:
  `appear, idle, drag, fly, return, in, leave` + dig `buried, peek, hop`. Sprites: `shell_<color>`, `pearl`, `tag` (+ `text`),
  `animal_<x>`, procedural shapes (`sprite null, shape, color`).
- **Mound (dig):** `{ id, x (centre), y (ground contact = bottom), w, h (= w·96/160), state 'buried'|'peek'|'open'|'gone',
  itemId|null, crab, wiggle (−1..1), puff (1 on dig → 0 over 0.6 s), breathe (0..1, period 2.5–3.5 s), glow (0..1), open (0..1
  over 0.25 s), appear (0..1), alpha (fades at round end), dance (crab 0..1 over 1.6 s), slot }`. **Mound rect =
  `[x − w/2, y − h, w, h]`, mound top = `y − h`.** Geometry is kept until the round ends (also when `gone`).
  **Drawing contract:** holes/sand for open/gone mounds → buried/peek items → the mound sprite for every buried/peek mound
  (it covers the lower part of the item) → hop/fly/free items → chest fronts. A buried item sits at `x = mound.x`,
  `y = moundTop + drawn·(0.5 − 0.42)` → exactly the top **42 %** (`cfg.peekFrac`) shows above the mound top; a peeking item
  rises to `y = moundTop − 0.55·drawn` (fully above). The crab mound has no item (`itemId null`); on tap the world emits `crab`
  and only times the 1.6 s dance (`mound.dance`) before `gone` — the renderer draws the crab.
- **Layout:** `chest {y, w, h, xs[], n, top, bottom, sign {w, h, bottomY}}` (also `pot`/`nest`), `playGap` (74), `tutu {x, y, h}`,
  `bubble`, `play`, `playAlt` (landscape, may be null), `groundY`, `portrait`, `tall`, `itemScale`, `hud`, **`dig {chest {x, y, w, h,
  top, bottom}, mound {w, h, peek, dx, dy}, grid, rows, cols}`**, **`mound`** (= dig.mound), **`moundGrid[6] {x, y, row, col}`**
  (= dig.grid, priority order: bottom row first, outer columns before the middle one — a round with M mounds uses the first M).
- Ids are strings: items `'i0'…`, baskets `'b0'…`, mounds `'m0'…`, talk choices `'c0'…`.

## 2. Content (DESIGN §5.1)
### Plan
`PLAN[age][lagoon−1]` is the REQUIREMENT table verbatim (`'colors:2'`, `'count:1-3'`, `'mixed'`). Mechanic per chapter: lagoons
1, 3, 5 → `dig, drag, dig, drag`; 2, 4, 6 → `drag, dig, drag, dig`. `n` is the number of chests in a drag round (default
`chestsFor`: colours/shapes/animals 2/3/4 for age 3/4/5+, size and odd-even 2, count 1 long chest, else 3) and the number of
attribute values in play in a dig round. `range` clamps a count chapter's N.

### Drag rounds (modes sort / count / ask) — Snow Garden's rules with sea sprites
| topic | mode | chests | items |
|---|---|---|---|
| colors | sort | n | `shell_<color>`, 2 per chest (warm-up 1), `nameKind 'color'` |
| shapes | sort | n | procedural shapes, one colour per shape ≤ 4, mixed colours 5+, rectangle from 5 |
| size | sort | 2 (big/small; small chest 0.72×) | shells of one colour, `size` 116, `scale` 1.3 / 0.72; warm-up 1+1, then 2+2 / 1+3 / 3+1 |
| animals | **ask** | n animal-badge chests | queue: warm-up each chest once, later 1–2× each, never the same chest twice in a row; shells of mixed colours, `answer null` |
| count | count | 1 long chest, `need N` | `pearl` × (N + 2, + 3 when N ≤ 3); N: 3–4 → 1–5, 5 → 3–10, 6–7 → 4–12 (warm-up ≤ 3, 2–4 from age 6; later ≥ 2), never the previous count round's N; 11–14 pearls use base size 104 |
| letters / lower / add / sub / oddeven | sort | 3 (2 for oddeven) | `tag` + `text` |
| initial | sort | 3 letters | sea-friend stickers; en C O S F D J W P, vi C B S (at most one "cá" word per round) |

### Dig rounds (mode `dig`)
- Mounds `M`: warm-up **4**, later `rng.int(5, 6)`; targets `T`: warm-up **1**, later **2–3**; count: `need N` (N ≤ 4; warm-up
  1–2, later 2–4, lo clamped to 3 so N varies), `max(4, N + 2)` pearl mounds. One chest (`'chest'`, label `{type:'dig',
  value: topic}`) or one long chest with `need` for count. Crab: `!warm && M ≥ 5` (count: N + 3 ≤ 6) with p = 0.35, replaces one
  mound (`item null, crab true`, `round.crab = moundId`).
- Values in play: colours `n` of `safeColors` (≤ 3 below age 5), shapes `n` (one fixed colour per shape below 5, mixed 5+),
  size big/small of one colour, animals `n`, letters/lower `K` distinct letters, initial `K` distinct words (vi ≤ 5 words, one
  "cá"), add/sub `K` distinct results (expressions as in drag), odd/even alternating parities with distinct numbers. Items are
  laid over the values cyclically; the first `T` are the targets (consecutive targets always differ in **label**); the mound
  order is shuffled; mound `k` uses grid anchor `k`.
- **Look-alike rule:** a tap is correct when the tapped item's `label` equals the current target's label (two red shells are
  interchangeable). The world then removes the tapped id from the queue (or the head if the id was not queued). Decoys are
  therefore exactly the mounds that differ from the current target in the taught attribute; `validate` requires ≥ 2 distinct
  labels in a round (count: pearls only, `queue.length === need`, ≥ N + 2 pearls), unique item ids, every item in exactly one
  mound, every target present, 4–6 mounds, ≤ 1 crab (never in the warm-up, never with ≤ 4 mounds).
- Prompts `p.dig.<topic>` with params from `digParams`: colours `{color}`, shapes `{shape}`, size `{size, color}`, animals
  `{animal}`, count `{n}`, letters/lower `{letter: shown text}`, initial `{letter}`, add/sub `{n}`, oddeven `{parity}`.
- `round.sig` = a signature of the items + targets; the world passes `prev {sig, n}` and `makeRound` re-rolls (≤ 12×) when the
  signature repeats, so no two identical rounds in a chapter.
- Colour-blind rule (below age 5): never blue+purple, red+green or yellow+orange in one round (colours, shapes, animals-ask
  shells and the colour Talk choices).
- Talk: colours show `shell_<color>`, count shows `count` pearls (`show.sprite 'pearl'`), animals show nothing and ask "Where is
  the {animal}?" with **3 animal picture choices** (`kind 'animal'`), letters/add/sub/oddeven show a `tag`, initial shows the
  animal sticker (`params.word`).

## 3. Layout (DESIGN §2)
`groundY = H − ins.bottom − 70` (tall portrait: − min(120, 0.25·(H − 1.6 W))); chests `w = min(230, (W − ins − 2·margin)/n − gap)`
with margin/gap 20/24 (landscape) or 6/8 (portrait), 290 max in tall portrait with ≤ 3 chests, landscape chests shrink (≥ 190)
until the alternative band is ≥ 240 px; `h = 0.78 w`, `bottom = groundY + 8`, `y = top + 0.27 h`. Long chest `w = min(safe − 80,
120 + 96 N)`, `h = min(0.42 w, 170, chest h)`, opening `top + 0.30 h`. Play band `x ins.left+40 … W−ins.right−40`,
`y tutu.y+10 … chest.top − 74`; landscape alternative L-band and tall-portrait rules as Snow Garden.

**Dig layout** (`layout.dig`): one chest `w = min(200, …)`, shrunk in 10 px steps to **170** when the rows do not fit, then
the mound `w` 170 → 130 in 5 px steps (×1.2 in tall portrait); `h = w·96/160`; `peek = 0.42·0.62·w` (the poking item).
Grid: landscape 3 columns × 2 rows between `tutu.x + 105` and `W − ins.right − 40`, rows between `bubble bottom + 16 + peek + h`
and `dig chest top − 12`; portrait 2 × 3 between `ins.left + 40 … W − 40`, rows from `tutu.y + 10` (tall phones: ≤ 0.85 W above
the chest). Row spacing `dy = min(190, available)`, rows hug the chest; the shrink loop keeps `dy ≥ 150`.

| viewport | dig chest | mound | dx | dy (= closest anchors) |
|---|---|---|---|---|
| 1280×720, 1556×720 | 200 | 170×102 | 343 / 435 | 190 |
| 960×720 notch (44/44/20) | 200 | 170×102 | 207 | 180 |
| 960×720 iPad insets (32/27) | 180 | 170×102 | 237 | 156 |
| 720×960 iPad portrait | 200 | 170×102 | 320 | 164 |
| 720×960 iPad portrait insets (44/30) | 170 | 140×84 | 320 | 152 |
| 720×1556 phone portrait | 200 | 204×122 | 320 | 190 |

Buried item drawn size = `min(base·scale·itemScale, 0.62·mound w)`. Tap rect = mound rect ∪ the peeking item, + 24 px all
sides; nearest mound centre wins where pads overlap. Drag drop zone: chest rect + 45 px sides/below, + 120 px up.

## 4. Motion (all in `TR.CONFIG`, fixed step 1/120 s, semi-implicit Euler)
| Motion | Model | Constants |
|---|---|---|
| Drag follow | `a = ω²(target − p) − 2ω v` (critically damped); target = finger + 0.5·grab offset − (0,10) | `dragOmega 28`, `grabKeep .5`, `liftPx 10` |
| Pendulum tilt | `θ* = clamp(−vx·0.0016, ±0.45)`, `α = ωr²(θ* − θ) − 2ζωr·vr` | `tiltOmega 9`, `tiltZeta .35` |
| Correct flight | parabola into the slot, `T = clamp(0.3 + d/2000, .32, .5)` s, apex ≥ 60 px (+0.06 px per px/s upward fling, ≤ 140) | `fly*` |
| Landing | item squash `q0 .15` (ω 22, ζ .3); chest squash .12 (ω 18, ζ .25); **settle spring 0 → 1, ω 16, ζ .35 (peak ≈ 1.3, settled ≈ 0.8 s)**; `sparkle` event | `landSquash`, `chest*`, `settle*` |
| **Dig hop** | correct tap: `y = y0 − A·(1 − (1−u)²)` over 0.32 s with `A = 90 + (y0 − moundTop)` → apex exactly 90 px above the mound top, small rot wobble, then a normal flight (apex ≥ 60) into the chest slot | `digHopApex 90`, `digHopTime .32` |
| **Peek** | wrong tap: `peek = smooth(t/0.18)·smooth((1.1 − t)/0.18)`, `y = lerp(buriedY, moundTop − 0.55·drawn, peek)`, back to `buried` at 1.1 s; mound `wiggle = sin(2π·3u)(1−u)^1.5` over 0.5 s | `peekTime 1.1`, `peekRise .18`, `peekAbove .55`, `moundWiggle*` |
| **Mound** | `open` smoothstep over 0.25 s, `puff` 1 → 0 over 0.6 s, `breathe = 0.5 + 0.5 sin(φ + 2πt/P)` with P 2.5–3.5 s, `appear` 0.35 s, `glow` as chests, crab `dance = t/1.6` | `moundOpenTime`, `moundPuffTime`, `moundBreathe*`, `crabTime 1.6` |
| Wrong drop | chest `shake` 3 wiggles over 0.5 s; item hops home 0.55 s, apex 45 px, wobble 0.28 rad at 2.5 Hz | `shake*`, `wrong*` |
| Miss | arc home 0.5 s, apex 22 px | `miss*` |
| Tap (drag) | finger moved < 24 px and released < 0.35 s → quiet hop home 0.25 s, apex 6 px, never a drop | `tap*` |
| Tap (dig) | finger moved < 24 px between down and up → `tapMound` at the down point (no time limit, a held finger still taps); moved ≥ 24 px → nothing | `tapMovePx` |
| Idle | bob 3 px, period 2–3 s; shells wiggle ±0.12 rad every 4–8 s | `bob*`, `wiggle*` |
| Appear | `easeOutBack` 0.45 s, 70 ms stagger; chests/mounds pop in 0.35 s | `appear*` |
| Round end | solved → `completing` (no input, no hints/idle); count: extra pearls pop away; **`roundDone` 0.5 s after the last landing**; at roundDone + 1.0 s treasures and mounds fade (0.4 s) | `landHold .5`, `leave*` |
| Tutu | correct → happy 0.9 s, wrong → oops 0.8, hint/idle → think 1.4, roundDone/talk right/levelDone → cheer 1.6 with 3 hops; looks at the held item or the hopping/flying/peeking treasure; **`dance` = stateTime / 2.0 during `levelDone`** | `moodTime`, `cheerHop*`, `levelDoneTime` |

## 5. Rules
- Stars per round from wrong drops / wrong taps: 0 → 3, 1 → 2, ≥ 2 → 1; Talk right +1; max 52 per lagoon.
- **Pearls** (`w.pearls`): +1 per `correct`, +5 per `roundDone`, +10 per `levelDone`, +25 at `sessionDone`; a perfect lagoon of
  16 rounds with C correct answers ends with `C + 80 + 40 + 25` pearls. `pearl {n, total}` is emitted every time.
- Dig: a crab tap is free (no `wrong`, no pearl); a tap on an open/peeking/gone mound or on bare sand does nothing; in a count
  round a tap once `reserved ≥ need` (last pearl in the air) does nothing; `roundMistakes` counts wrong taps; after 2 the target
  mound glows (`hint {moundId}`, 3 s, cooldown 6 s, not while glowing). `hint()` glows the target mound.
- Ask mode exactly as Snow Garden (`w.target` = queue head chest id).
- Photobomb: `_chapterCorrect % 3 === 0` and fewer than 2 this chapter → `photobomb {dir ±1, y 0.15–0.6}`; counters reset per chapter.
- Help, idle, Talk: hint after 2 misses (glow 3 s, cooldown 6 s); idle 12 → 24 → 48 → 60 s (reset by a grab or a tap); Talk
  re-ask every 12 s, answer glows from the 2nd re-ask; **chapter time limit 100 s after ≥ 3 rounds** (playtest: 75 s cut 38 % of a typical 4-year-old's chapters).

## 6. Dig state machine
```
mound: buried ──tap, label = target──▶ open (puff 1, open 0→1)  ·  item: buried → hop (0.32 s) → fly → in (settle) → land
       buried ──tap, other label────▶ peek (wiggle; item peek 0→1→0, 1.1 s) ──▶ buried      roundMistakes++, hint after 2
       buried ──tap, crab───────────▶ open (dance 0→1 over 1.6 s) ──▶ gone                   event crab, no mistake
       open / peek / gone ──tap──▶ (ignored)
round: appear (items pop in) → interactive → … → queue empty & nothing in the air (count: count ≥ need) → completing →
       roundDone (0.5 s after the last land) → leave (1.0 s) → next round / Talk
```
Session: `menu` → `newSession({lagoon, plan})` → `intro` 1.8 s → rounds (4, or 3 once the chapter is > 100 s old) → `talk` →
`levelDone` 2.0 s (Tutu dances, +10 pearls) → next chapter (time of day = chapter index) … → `sessionDone` (+25 pearls).
Rotation (`setViewport`): drag → re-pack resting items, re-target flights; dig → `cancelDrag`, mounds re-anchored to the new
`moundGrid[slot]`, buried/peek items re-sized and re-placed, hopping items re-based, flying items clamped into the viewport and
re-targeted (`_planFly keepTau`).

Bot sessions in the unit test (game seconds, 1/30 s frames, average over the 6 lagoons; a child is slower):

| age | bot 0.6: session / chapter | bot 1.0: session / chapter |
|---|---|---|
| 3 | 158 / 38 | 135 / 32 |
| 4 | 186 / 44 | 154 / 36 |
| 5 | 194 / 46 | 163 / 39 |
| 6 | 183 / 44 | 157 / 37 |
| 7 | 191 / 46 | 155 / 37 |

60 bot sessions (6 lagoons × 5 ages × 2 skills, both languages, 10 viewports) reach `sessionDone` with zero stuck rounds; the
perfect bot takes every star; 10 sessions simulate in < 1 s; the event log is deterministic for a seed and independent of the dt split.

## 7. Weather = time of day under the sea (`TR.Weather`, fixed 1/60 s steps)
Crossfade 2.5 s (smoothstep) of every ambient number and colour. `SKY` constants at the top of `weather.js`.

| mood | water top → bottom | surface glow | tint | current / sway | sun (x, y) | moon | stars | plankton (aurora) | darkness | shafts |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 morning | #7FCBD8 → #D8ECE0 | #F7D3C2 | rgba(255,190,160,.08) | .12 / .2 | 1 (.80, .20) | 0 | 0 | 0 | 0 | 4 × .28 |
| 1 noon | #5FC9DD → #B4EAEC | #EAFBFF | – | .25 / .35 | 1 (.66, .08) | 0 | 0 | 0 | 0 | 5 × .35 |
| 2 sunset | #E9907E → #7C6DB3 | #FFC29A | rgba(255,140,96,.10) | .18 / .3 | 1 (.24, .30) | .15 | .1 | 0 | .08 | 3 × .22 |
| 3 night | #13305A → #1F4A73 | #2E6190 | rgba(40,70,140,.08) | .1 / .2 | 0 | 1 (.78, .10) | 1 | 1 | .28 | 2 × .12 (moonlight) |

Particles per 1280×720 (scale with area 0.55–1.5×, ambient ≤ 112, hard cap 140 with bursts): morning 8 + 6 `sparkle`
drifting up, 8 slow bubbles; noon 24 bubbles + 4 big translucent front bubbles + a `fishlet` shoal of 9 (`layer 'back'`, one
direction per mood change); sunset 14 slow bubbles, 5 sparkles; night 16 twinkling `star` near the surface, 22 `plankton` glow
dots (alpha pulses, scaled by `ambient.aurora`), 10 slow bubbles. Clouds `cloud1..3` = drifting surface light blobs (alpha
.55/.6/.5/.3). `stars[]` fixed field of ≈ 70 points in the top 55 %. **`shafts[]`** 6 slots `{x, w, alpha, phase}`: `x` drifts
slowly, `w` breathes ±10 %, `alpha → moodAlpha · max(sun, 0.6·moon) · pulse(0.5–1)` eased over 1.2 s (the renderer draws a
soft wedge from `(x, 0)` widening downwards and wobbling with `phase`).
Bubble model: `vx = current·40·depth + L·ω·cos(ωt+φ)`, `vy = −rise·(0.85 + 0.15 sin)·(1 + 0.6 gust)`, grows ≤ 25 % on the
way up, fades out and pops in the top 6 % of the screen, respawns at the sand. Gusts (current surges) every 4–7 s as before.

## 8. Bot (§5.4)
Reaction `(0.8 − 0.55·skill)·U(0.8,1.2)` s; eased finger paths at 700–1100 px/s. Drag: as Snow Garden (wrong chest p =
(1 − skill)·0.35, miss p = (1 − skill)·0.12, Talk right p = 0.5 + skill/2). **Dig:** target = `w.targetMound()` (follows
`w.queue[0]`; count: any buried pearl, none once `reserved ≥ need`); before it, a wrong mound with p = (1 − skill)·0.5 and a
still-buried crab with p = 0.3; the finger lands somewhere on the mound / its poking item, holds 0.08–0.15 s and lifts without
moving (a tap). Skill 1 never errs (52/52 stars in every lagoon).

## 9. How to tune
- Dig feel: `digHopApex/digHopTime` (pop), `peekTime/peekRise/peekAbove` (wrong peek), `moundPuffTime`, `moundOpenTime`,
  `crabTime`, `peekFrac` (how much of a buried item shows), `moundItemFrac` (item size in a mound).
- Dig layout: `chestDigMaxW/chestDigMinW`, `moundW/moundMinW`, `moundGap` (nominal 190), `moundRowMin` (150), `moundChestGap`,
  `digTutuGap`, `moundPad` (tap rect).
- Landing: `settleOmega/settleZeta` (lower ζ = bouncier), `landHold` (pause before the stars).
- Difficulty: `PLAN` table and `chestsFor` in `content.js`, mound/target counts in `buildDig` (`rng.int(5, 6)`, `rng.int(2, 3)`),
  `DIG_COUNT_MAX`, crab chance 0.35, `COUNT_RANGE`.
- Pace / fun: `introTime, roundDoneTime, levelDoneTime, chapterTimeLimit/chapterMinRounds, idleTime/idleBackoff/idleMax,
  hintAfterMisses/hintCooldown, talkAskTime/talkGlowAfterAsks, photobombEvery/photobombMax, pearl*`.
- Any key per world: `new TR.World({ config: { digHopApex: 120 } })`. Water colours: `SKY`; particle density: `count` in
  `Weather.MOODS[i].emitters`; shafts: `MOODS[i].shafts {n, alpha}`.

## 10. Deviations from DESIGN.md
1. **Dig rounds use one chest** (label `{type:'dig', value: topic}`; count: one long chest with `need`), not the optional "2–4
   labelled chests"; the `correct` event carries the item's `label` instead so the voice can name the attribute.
2. **Look-alike rule:** `round.queue` holds item ids as specified, but a tap on any mound whose item has the same label as the
   current target is correct (the asked id is swapped out). Consequently "decoys always differ from the target" means: every mound
   that is *not* accepted differs in the taught attribute; a round needs ≥ 2 distinct labels.
3. `moundGrid` anchors are ≥ 190 px apart on 1280×720 / phones, but only ≥ 150 px (vertically) on short viewports (iPad with
   insets 156, iPad portrait 164/152) — rows hug the dig chest; the dig chest shrinks to 170 and the mound to 140 there.
4. Mound `y` is the **ground contact (bottom)**, mound top = `y − h` (lead's render contract); the crab mound has `itemId null`
   (no item object with `sprite null`).
5. `w.target` is an item id in dig mode (a chest id in ask mode); `next` is not emitted at round start (the `round` event
   carries the first prompt) nor in count rounds (`count {n, need}` on each land instead).
6. The play band ends 74 px above the chest top (DESIGN: 24; Snow Garden QA), chest drop zone +45 / +120 px, landscape chests
   may shrink to 190, portrait margins 6/8, tall portrait 290 px chests — all inherited from Snow Garden.
7. Count rounds' `params` are `{n}` only (no colour: pearls have none); count items are `pearl` with `nameKind 'pearl'`; coloured
   shells use `nameKind 'color'` everywhere (was `'seed'`).
8. `pearl` is emitted after `roundDone` / `levelDone` / before `sessionDone` (the payloads of those events already hold the totals).
9. Chapter time limit is **100 s** (raised from 75 after the playtest). Other playtest-tuned values: tapTime 1.0 s (toddlers hold pokes), moundPad 40, peekAbove 0.3, hintTime 5 s.
