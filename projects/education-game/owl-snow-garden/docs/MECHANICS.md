# Owlet's Snow Garden — Mechanics (rng · content · world · weather · bot)

Files: `game/js/rng.js`, `content.js`, `world.js`, `weather.js`, `bot.js`. Plain scripts on `window.SG`, no DOM, no
dependency on `SG.I18N` (content/world only emit kinds, values and keys). Tests: `node tests/unit/run.js`
(45 tests, about 11 s). Playtest simulator: `tests/sim/` (`run_matrix.js` → `summarize.js`). Units everywhere: logical px
(short side 720), seconds, radians, y down. Started from Dino Nest Sort's mechanics. Everything not listed here works
exactly as in `../dino-nest-sort/docs/MECHANICS.md` (all the playtest fixes are kept: tap guard, hint cooldown,
idle back-off, chapter time limit, Talk re-ask).

## 0. QA round 1 changes (docs/reports/playtest_report.md, visual_report.md)
| | change | why |
|---|---|---|
| CONFIG | `potPadUp` 90 → **120**, `chapterTimeLimit` 75 → **60**, `idleBackoff` 1.5 → **2**, `idleMax` 30 → **60** | high drops missed 49 %; chapters into 60–100 s; fewer nudges to an empty room |
| P1-1 | `stemH = clamp(0.42 h, 45, 80)`; seed band gap `layout.playGap = max(74, flower clearance)` (74–81 px) | resting seeds covered the new flowers; seeds stay out of the 120 px zone |
| P2-2 | pots `flowerSize = min(96, sxp·1.05)` (1 slot: 0.5 w); planter `min(96, sxp·0.85)`, stems alternate 1 / 0.72; new `slot.lean` | neighbour flowers overlapped |
| P1-3 | size topic: the small pot is 0.72 × (same x and bottom); seed `size` is now the unscaled 116 and **drawn = size · scale** (packing, hit radius and slots use it) | both pots looked the same; big seeds overlapped in tall portrait (they were scaled twice) |
| P1-4 / P2-3 | portrait: pot margin 6, gap 8; tall portrait (H/W > 1.6): pots up to 290 px with ≤ 3 pots, groundY raised by min(120, 0.25·(H − 1.6 W)) | tiny signs with 4 pots; empty top on iPhones |
| P2-6 | below age 5 one colour of blue/purple, red/green **and yellow/orange** is dropped (3 colours left), also for colour Talk choices | yellow–orange is weak for deutan vision |
| C1 / C2 | size rounds always 4 seeds `[[2,2],[1,3],[3,1]]`; a count round never repeats the previous count round's N or colour | pack scale; variety |
| new | landscape pots shrink (not below 190 px) until the alternative seed band is ≥ 240 px tall; the planter is never taller than the n = 1 pot | the bigger gap left iPad landscape seeds at 0.75× |
| new | a drop is judged by the pot under the **finger** first, then the seed centre | with the taller zone a fast flick left the lagging seed over the neighbour pot |

## 1. API (DESIGN §5 + additions)
| | |
|---|---|
| `new SG.RNG(seed)` | `next, float(a,b)` (= `range`), `int(a,b)` inclusive, `pick, shuffle` (in place), `sample(arr,k), chance, sign, fork(salt)` |
| `SG.Content` | `makeRound(topic,{age,lang,rng,roundIndex,layout})`, `makeTalk(topic,{age,lang,rng})`, `validate(round)` → null or reason, `topicsFor(age)`, **`potsFor(topic,age)`** (`nestsFor` alias), `placeBaskets(baskets, layout)`, **`planterRect(layout, N)`**, `matches`, `clash`, constants `TOPICS, COLORS, SHAPES, ANIMALS, LETTER_POOL, SIZE, SIZE_SCALE, COUNT_RANGE, PLANTER` |
| `SG.World` | DESIGN §5.2, plus `World.logicalSize`, `World.computeLayout(W,H,ins,n)`, **`w.potAt(x,y)`** (`nestAt` alias), **`w.goalOf(item)`** (the pot that item belongs in right now: the target in ask mode), **`w.prompt()`** → `{promptKey, params}` for the current target, `w.itemById`, `w.basketById`, `w.interactive`, **`w.completing`** (solved and waiting for the last bloom), **`w.target`**, **`w.queue`** (targets still to come, `queue[0] === target`), **`w.playRect`** (the band the seeds rest in), `w.finger`, `w.packShrink`, `w.packOk`, `w.talkAnswered`, `w.roundStars`, `w.age`, `w.lang`, `w.levelStartTime` |
| `SG.Weather` | DESIGN §5.3, plus `burst(x,y,{kind:'confetti'|'puff'|'sparkle', n})`, `ambient.gust`, `ambient.windBase`, `ambient.moonX/moonY`, `stars[].tw`, `Weather.SPRITES`, `CLOUD_SPRITES`, `MOODS`, `SKY`, `FADE_TIME` |
| `SG.Bot` | `new SG.Bot(world,{skill,seed})`, `step(dt)` (call before `world.update(dt)`), `stats`, `finger {x,y,down}`, `enabled` |

### Events (world.drainEvents())
`session {levels}`, `level {level, topic}`, `round {round, topic, mode, promptKey, params}`, **`ask {basketId, label,
promptKey:'p.animals', params:{animal}}`** (ask mode: right after `round`, and right after every `correct` that moves the
target on; none after the last seed), `appear {id}`, `grab {id, nameKind, nameValue}`, `tap {id, nameKind, nameValue}`,
`drop {id, basketId|null}`, `correct {id, basketId, nameKind, nameValue, label}`, `wrong {id, basketId, misses, target}`,
`miss {id}`, `land {id, basketId, count, need|null}`, **`bloom {id, basketId, n, need|null, flower}`** (`n` = flowers
bloomed in that pot/planter so far → count "one, two, …" on bloom), `hint {basketId}`, `idle {promptKey, params}`
(ask mode names the current target), `roundDone {stars, mistakes, count?, need?}`, `talk {talk}`,
`talkAsk {talk, n, glowAnswer}`, `talkResult {correct, choiceId, answerId}`, `levelDone {level, stars}`, `sessionDone {stars}`.

### Fields for the renderer
- **Pot / planter (basket):** `kind` `'pot'|'planter'`, `x` (centre), `y` = soil centre = `soilY` (flower base), `w, h`,
  `top` (sprite top), `bottom` (= groundY + 8), sprite rect `[x − w/2, top, w, h]`; `slots[{x, y, stem}]` (`y` = centre of
  a seed resting on the soil = `soilY − 0.3·slotSize`; `stem` = height factor (pots 1 / 0.86 outer, planter 1 / 0.72
  alternating); **`lean`** = outward stem lean in rad, outer pot slots ±0.08, planter 0), `slotSize` (DRAWN seed size on the
  soil), **`flowerSize`** (flower head width, ≤ 96), **`stemH`** (`clamp(0.42 h, 45, 80)` px; head centre =
  `soilY − stem·stemH·slot.stem`), `count`, `blooms`, `need` (planter), `squash`, `shake`, `glow`, `appear` (pop-in when the pot set changes;
  the planter always pops in).
- **Seed (item):** as Dino plus `flower` (palette key of its flower — seed colour; plain/word seeds get a random colour),
  `planted`, `grow` (0→1 linear), **`sink`** (0→1 eased: seed shrinks and drops into the soil behind the pot front),
  **`stem`** (0→1, critically damped: stem height = `stem · stemH · slot.stem`), **`petals`** (0→≈1.2→1, petal opening
  with overshoot), `bloomed`, `overPot` (= `overNest`: falling half of a flight → draw between pot back/front), `alpha`,
  `appear`. `initial` items are animal stickers (`sprite: 'animal_<x>'`), shapes are procedural (`sprite: null`).
- **Layout:** `pot {y, w, h, xs[], n, top, bottom, flowerTop, sign {w, h, bottomY}}` (also as `layout.nest`;
  `flowerTop` = top of the highest possible flower head), **`playGap`** (px between the seed band and the pot top),
  `lumi {x, y, h}`, `bubble`, `play`, `playAlt` (landscape only, may be null), `groundY`, `portrait`, `tall`, `hud`.
- Seeds are drawn at `size · scale` (`scale` ≠ 1 only in the size topic); size-topic pots differ in `w`/`h`/`top`/`y`.
- Ids are strings: items `'i0'…`, baskets `'b0'…`, talk choices `'c0'…`.

## 2. Content (DESIGN §5.1)
| topic | mode | pots | seeds |
|---|---|---|---|
| colors | sort | 2/3/4 (age 3/4/5+) | `seed_<color>`, 2 per pot (warm-up 1) |
| shapes | sort | 2/3/4 | procedural shapes, one colour per shape ≤ 4, mixed colours 5+, rectangle from 5 |
| size | sort | 2 (big/small; small pot 0.72×) | `seed_<color>`, `size` 116, `scale` 1.3 / 0.72, one colour; warm-up 1+1, then 2+2 / 1+3 / 3+1 |
| animals | **ask** | 2/3/4 | `queue`: warm-up each pot once, later each pot 1–2×, shuffled, never the same pot twice in a row; seeds = queue length, mixed colours, `answer: null`, `nameKind 'seed'` |
| count | count | 1 planter, `need N` | N + 2 (+3 when N ≤ 3) seeds of one colour, `nameKind 'seed'`; N: 3–4 → 1–5, 5 → 3–10, 6–7 → 4–12 (round 0 ≤ 3, 2–4 from age 6; later N ≥ 2); N and the colour never repeat the previous count round's. 11–14 seeds use base size 104 instead of 116 so they fit an iPad in landscape |
| letters / lower / add / sub / oddeven | sort | 3 (2 for oddeven) | `seed_plain` with `text` (as Dino) |
| initial | sort | 3 letters | arctic animal stickers; en B F H P R S W, vi G C T H |

Colour-blind rule (below age 5): the round's colour set never holds blue+purple, red+green or yellow+orange (one of each
pair is dropped before sampling, 3 colours left) — colours, shapes, animals rounds and the colour Talk choices (the
answer's partner is the one dropped). Every round passes `validate()` (pots
non-empty, labels unique, each seed truly matches its pot; ask: queue length = seeds, every pot asked, `params.animal` =
first target; count: ≥ N + 2 seeds) or `makeRound` throws; tested for 11 topics × 5 ages × 600 seeds.
Talk: colours shows a flower (`show.flower`), count shows `count` flowers, animals shows nothing and puts the animal in
`talk.params.animal` (3 animal choices), initial puts the shown word in `talk.params.word`.

## 3. Layout (DESIGN §2) and packing
`groundY = H − ins.bottom − 70` (tall portrait: − min(120, 0.25·(H − 1.6 W)), e.g. −101 on a 720×1556 phone); pots
`w = min(maxW, (W − ins.l − ins.r − 2·margin)/n − gap)` with margin/gap 20/24 (landscape) or 6/8 (portrait), maxW 230
(290 in tall portrait with ≤ 3 pots); `h = 0.78 w`, `bottom = groundY + 8`, `top = bottom − h`, `y (soil) = top + 0.24 h`.
Landscape only: `w` steps down by 2 px (to ≥ 190) until the alternative band (below) is ≥ 240 px tall — 1280×720 keeps
230, iPhone landscape with insets ≈ 202, iPad landscape with insets 190. Size topic: the small pot is 0.72 × (same x,
same bottom). Planter `w = min(safe width − 80, 120 + 96 N)`, `h = min(0.42 w, 170, pot.h)`, same bottom, centred, soil
`top + 0.27 h`. Lumi/bubble/HUD exactly §2. Play band: `x ins.left+40 … W−ins.right−40`, `y lumi.y + 10 … pot.top − playGap`.
**`playGap = max(74, ⌈clear⌉)`** with `clear = stemH − 0.24 h + 0.5·min(96, 0.5 w)` (the highest flower head above the
pot top; `pot.flowerTop = top − clear`): 74 keeps resting seed centres out of the 120 px drop zone, `clear` keeps them
off a full-grown centred flower. Result: 75–81 px. I chose the full clearance (not "most of" the head) because it costs
at most 7 px over the 74 minimum and the landscape pot fit recovers the lost height. Tall portrait (H/W > 1.6): band ≤ 0.85 W just above the
pots and seeds × 1.2.

**Landscape alternative band (new):** the taller pots (0.78 w vs the old 0.62 w nest) left too little height on
iPad landscape, so World also tries `playAlt` = full width from 16 px below the bubble down to `pot.top − 44`, with
Lumi's box (±90 px around `lumi.x`, from his head to `lumi.y + 10`) cut out. The seeds use whichever band keeps them
bigger (`w.playRect`); same seed → same choice. Worst pack scale over every topic × age × 10 viewports × 30 seeds:
**0.75** (count rounds with 13–14 seeds on the 960-wide notch landscape test viewport); real devices in the simulator:
iPad landscape 0.8, iPad portrait 0.9, iPhone landscape 0.9, iPhone portrait 1.0. The alternative band is used in 7 % of rounds.

Slots: pots get one row on the soil line spread over 66 % of the width, filled centre-out (1–3 per pot), outer stems
lean outward (±0.08 rad); the planter has N holes over 84 % of its width, filled **left → right** (counting order), stems
alternating 1 / 0.72. Slots are reserved on drop. Hit tests: seed radius `0.6·size·scale + 14`, nearest centre wins;
pot zone = sprite rect + 45 px left/right/below + **120 px above**, nearest pot centre wins where zones overlap. A drop
takes the pot under the finger, else the pot under the seed centre.

## 4. Motion (all in `SG.CONFIG`, fixed step 1/120 s, semi-implicit Euler)
| Motion | Model | Constants |
|---|---|---|
| Drag follow | `a = ω²(target − p) − 2ω v` (critically damped); target = finger + 0.5·grab offset − (0,10) | `dragOmega 28` rad/s (95 % in 0.17 s), `grabKeep .5`, `liftPx 10` px |
| Pendulum tilt | `θ* = clamp(−vx·0.0016, ±0.45)`, `α = ωr²(θ* − θ) − 2ζωr·vr` | `tiltOmega 9` rad/s, `tiltZeta .35` (2–3 swings, ≈ 1.5 s) |
| Correct flight | true parabola into the slot, `T = clamp(0.3 + d/2000, .32, .5)` s, apex ≥ 60 px (+0.06 px per px/s of upward fling, ≤ 140) | `fly*` |
| Landing | seed squash `q0 .15` (ω 22, ζ .3) → 1.15 × 0.82; pot squash .12 (ω 18, ζ .25) | `landSquash`, `pot*` |
| **Planting** | `grow += dt / 1.1 s`; `sink = smoothstep(grow / 0.25)`; from grow 0.25 the stem is a critically damped spring to 1 (ω 15 rad/s → 95 % in 0.32 s, never overshoots); from grow 0.55 (0.605 s after landing, `bloom` event) the petals are an under-damped spring to 1 (ω 14 rad/s, ζ 0.45 → peak ≈ 1.2 after ≈ 0.25 s, settled ≈ 0.6 s) | `growTime 1.1`, `sinkEnd .25`, `bloomAt .55`, `stemOmega 15`, `petalOmega 14`, `petalZeta .45` |
| Wrong drop | pot `shake = sin(2π·3u)(1−u)^1.5` over 0.5 s (x offset `shake·10` px); seed hops home 0.55 s, apex 45 px, wobble 0.28 rad at 2.5 Hz | `shake*`, `wrong*` |
| Miss | arc home 0.5 s, apex 22 px, home squash .07 | `miss*` |
| Tap | quiet hop home 0.25 s, apex 6 px; finger moved < 24 px and released < 0.35 s = a tap, never a drop | `tap*` |
| Idle | bob 3 px, period 2–3 s, fades in 0.5 s; seeds wiggle ±0.12 rad over 0.4 s every 4–8 s | `bob*`, `wiggle*` |
| Appear | `easeOutBack` 0.45 s (peak ≈ 1.1), 70 ms stagger; pots pop in 0.35 s | `appear*` |
| Round end | solved → `completing` (no grabs, hints or idle nudges); count mode: the extra seeds pop away (0.4 s) at once; `roundDone` when every planted seed has bloomed and 0.4 s have passed since the last bloom; at roundDone + 1.0 s flowers fade in place (alpha 1→0, scale −15 % in 0.4 s) | `bloomHold .4`, `leave*` |
| Lumi | correct → happy 0.9 s, wrong → oops 0.8, hint/idle → think 1.4, roundDone/talk right → cheer 1.6 with 3 hops (26 px, each 70 % of the last, 0.4 s); looks at the held seed (rate 6/s) | `moodTime`, `cheerHop*` |

## 5. Rules and ask mode
- Stars per round from wrong-pot drops: 0 → 3, 1 → 2, ≥ 2 → 1; Talk right +1; max 52 per session (4 × 4 × 3 + 4).
- **Ask mode** (`animals`): `w.target = queue[0]`. A drop into the target pot is correct: the seed flies to the pot's
  next free slot, the queue moves on and `ask` names the next animal at once (main can delay the voice line until the
  praise is spoken). A drop into any other pot is wrong (`wrong.target` = the asked pot); the target stays. Auto-hint
  (2 misses on one seed), `hint()` and the bot all use `w.goalOf(item)` = the target. Idle nudges re-read the current
  target (`idle.params.animal`). Pot slots = how often the pot is in the queue.
- Count mode: done at the landing that makes `count == need`; a drop into a full planter (last seed still in the air)
  floats home without penalty.
- Help, idle, Talk: as Dino (hint after 2 misses, glow 3 s, cooldown 6 s; idle 12 → 18 → 27 → 30 s; Talk re-ask every
  12 s, answer glows from the 2nd re-ask; chapter time limit 75 s after ≥ 3 rounds) — **now** idle 12 → 24 → 48 → 60 s
  and the chapter time limit is **60 s** (QA round 1).

## 6. State machine and session timing
`menu` → `newSession()` → `intro` 1.8 s → `round` (pop-in ≈ 0.45 + 0.07·(n−1) s, then interactive → solved →
`completing` ≈ 1.0 s after the last landing) → `roundDone` 1.7 s (fade at 1.0 s) → … 4 rounds (3 once the chapter is
> 60 s old) → `talk` → `levelDone` 2.0 s → next chapter (time of day = chapter index) … → `sessionDone`.

Bot sessions in the unit test (game seconds, average of 3 seeds, 1/30 s frames):

| age | bot 0.6: session / chapter | bot 1.0: session / chapter |
|---|---|---|
| 3 | 215 / 52 | 172 / 41 |
| 4 | 227 / 55 | 193 / 46 |
| 5 | 256 / 62 | 221 / 53 |
| 6 | 220 / 53 | 192 / 46 |
| 7 | 236 / 57 | 194 / 47 |

The bot reacts in 0.25–0.8 s, much faster than a child. Child models from the playtest simulator (`tests/sim`,
before QA round 1: 1 920 sessions, 4 viewports, both languages; mean / p90 chapter seconds):

| driver | age 3 | **age 4** | age 5 | age 6 | age 7 |
|---|---|---|---|---|---|
| typical kid | 82 / 94 | **87 / 105** | 91 / 102 | 78 / 93 | 67 / 76 |
| toddler (slow, 35 % random pot) | 95 / 110 | **105 / 133** | 128 / 169 | 110 / 133 | 111 / 132 |

After QA round 1 (`run_matrix --n 2`, 640 sessions): typical kid age 3 / 4 → 77 / 76 s per chapter (p90 87 / 88),
session 306 / 304 s; toddler age 3 / 4 → 80 / 98 s (p90 92 / 131); drops-high misses 0 %; idle nudges for an absent
child 12 → 24 → 48 → 60 s (6 in 5 min). Before the fixes a typical 4-year-old's chapter was ≈ 87 s and a session ≈ 6 min. Planting adds ≈ 1 s per round
compared with Dino (the last bloom + 0.4 s). Simulator health: 0 errors, 0 invariant breaks, fully deterministic
(rerun, 1/60 and 1/120 s replays), taps judged as drops 0 %, near-pot misses 0 %, seeds resting in a drop zone 0 %,
worst pack scale 0.8 on iPad landscape. An absent child gets 11 nudges in 5 min. 10 full sessions simulate in < 1 s.
(The random `tapper` driver sometimes takes > 5 min per round in 4-pot ask rounds; that is a random monkey, not a child.)

## 7. Weather = time of day (`SG.Weather`, fixed 1/60 s steps → independent of the dt split)
Crossfade 2.5 s (smoothstep): every ambient number and colour is interpolated, so the sun travels across the sky when
the chapter changes. Colours are constants at the top of `weather.js` (`SKY`) for the environment artist to refine.

| mood | skyTop → skyBottom | horizon | tint | wind / sway | sun (x, y) | moon | stars | aurora | darkness |
|---|---|---|---|---|---|---|---|---|---|
| 0 morning | #F7B9A8 → #FFE6C7 | #FFD7B0 | rgba(255,190,160,.06) | .12 / .2 | 1 (.80, .34) | 0 | 0 | 0 | 0 |
| 1 noon | #6FB8F0 → #CDEBFF | #EAF6FF | – | .25 / .35 | 1 (.66, .12) | 0 | 0 | 0 | 0 |
| 2 sunset | #6B5BA8 → #FF9E6B | #FFB37A | rgba(255,140,90,.10) | .18 / .3 | 1 (.24, .46) | .15 | .1 | 0 | .08 |
| 3 night | #0E1640 → #2B3A7A | #3E5FA0 | rgba(40,60,140,.08) | .1 / .2 | 0 (.12, .62) | 1 (.78, .16) | 1 | 1 | .28 |

Particles per 1280×720 (scale with area 0.55–1.5×, ambient ≤ 112, hard cap 140 with bursts):
morning: 6 sky sparkles, 4 sparkles, 6 mist puffs on the horizon (alpha .14–.22), 3 petals; noon: 30 snowflakes +
5 big front flakes (alpha ≤ .7), 10 glitter sparkles lying on the snow; sunset: 18 slow flakes, 4 petals, 4 sky
sparkles; night: 18 twinkling `star` particles in the sky layer, 16 + 3 slow flakes. Clouds `cloud1..3`: 3/4/3/2, the
night ones at alpha .35. `stars[]` is a fixed field of ≈ 70 points in the top 55 % of the sky (`{x, y, r, phase, tw}`;
draw with alpha `ambient.stars · (0.55 + 0.45 sin(phase + tw·time))`); `auroraT` drives the aurora ribbons.
Snowflake model: `vx = wind·120·depth + L·A·ω·cos(ωt+φ)` (sideways flutter, L 10–22 px, ω 1.2–2.2 rad/s),
`vy = fall·(0.8 + 0.2|sin|)`, spin + flipX tumble, settles on the snow line and fades in 1.2 s, wraps horizontally.
Gusts every 4–7 s (0.6 s rise, 0.8 s hold, 1.5 s decay) raise `wind` (×1.8) and `sway` (+0.25), scaled by the base wind.

## 8. Bot (§5.4)
Reaction `(0.8 − 0.55·skill)·U(0.8,1.2)` s; eased finger paths at 700–1100 px/s with a slight arc; grabs the seed
centre, aims so the seed lands 0–40 px above the pot top (± 25 % of the pot width, at most ± 60 px for the planter),
settles 0.08–0.15 s, releases. Goal = `w.goalOf(seed)` (ask mode: the current target). Wrong pot
p = (1 − skill)·0.35 (sort and ask, ≥ 2 pots), miss p = (1 − skill)·0.12 (always ≥ 96 px of travel, never a tap),
Talk right p = 0.5 + skill/2 after 1.0–2.2 s. Skill 1 never errs (52/52 stars at every age).

## 9. How to tune
- Planting feel: `growTime` (whole sequence), `sinkEnd`/`bloomAt` (phase split), `stemOmega` (stem speed),
  `petalOmega`/`petalZeta` (lower ζ = more bounce), `bloomHold` (pause before the stars).
- Drag/flight: `dragOmega`, `tiltK/tiltMax/tiltZeta`, `flyApex`, `flyPerPx`, `flyInherit`.
- Difficulty: seeds per pot in `content.js` (`per`, warm-up rule, ask counts `rng.int(1, 2)`), `COUNT_RANGE`.
- Pace: `introTime, roundDoneTime, levelDoneTime, roundsPerLevel, chapterTimeLimit/chapterMinRounds, idleTime/idleBackoff/idleMax,
  hintAfterMisses/hintCooldown, talkAskTime/talkGlowAfterAsks`. Tap vs drop: `tapMovePx`, `tapTime`.
- Any key per world: `new SG.World({ config: { growTime: 0.8 } })`; sim variants in `tests/sim/variants.js`.
- Sky colours: `SKY` at the top of `weather.js`; particle density: `count` in `Weather.MOODS[i].emitters`.

## 10. Deviations from DESIGN.md
1. Pot drop zone grows **45 px** sideways/down and **120 px** up (DESIGN §2: 30 / 90); the seed band ends `layout.playGap`
   (75–81 px) above the pot top (DESIGN: 24). Landscape pots may shrink to 190 px, portrait pots use margin 6 / gap 8,
   tall portrait pots reach 290 px and the ground is raised (QA round 1).
2. Landscape alternative play band (§3 above) — internal to World; DESIGN's `layout.play` is unchanged.
3. Count rounds with 11–14 seeds use seed base size 104 (otherwise 116) so they fit iPad landscape at ≥ 0.75×. Size-topic
   seeds keep `size` 116 and carry the 1.3 / 0.72 in `scale` (drawn = size · scale).
8. A drop is judged by the finger's pot first (Dino: the item centre first).
4. `ask` is emitted on the **drop** that is correct (not on landing), so the next target is live while the seed flies.
5. Below age 5 the colour-blind rule also applies to shape colours, animal-round seeds and the colour Talk choices.
6. Flowers fade in place at round end (no hop-out like the Dino eggs); count extras pop away as soon as the planter is full.
7. `w.lumi` replaces `w.bo` (no alias); `layout.nest`, `w.nestAt`, `item.overNest` and `Content.nestsFor` remain as aliases.
