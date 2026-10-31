# Puppy Garden Catch — Mechanics (rng · content · world · weather · bot)

Files: `game/js/rng.js`, `content.js`, `world.js`, `weather.js` (unchanged API), `bot.js`. Plain scripts on `window.PG`,
no DOM, no dependency on `PG.I18N` (content/world only emit kinds, values and keys). Units everywhere: logical px
(short side 720), seconds, radians, y down.

- Unit tests: `node tests/unit/run.js` (42 tests, ≈ 25 s; `node tests/unit/run.js <regex>` runs a subset).
- Playtest harness: `tests/sim/` (see §9).

## 0a. QA round 1 changes (functional / visual / playtest reports)
| | change | test |
|---|---|---|
| F2 | `pointerDown` on a bubble does **not** steer: the steer starts only once the finger has moved ≥ `tapMovePx` (24 px) or been held > `tapTime` (0.35 s). A detected bubble tap sets `pup.vx = 0` and `targetX = pup.x` (Pip stays exactly where he is). A tap elsewhere still sends Pip to the finger | `QA F2` |
| API | **`world.setTopReserve(y)`** (logical px, speech-bubble bottom from main.js): `spawnY = max(skyTop + spawnDy, y + 0.5·bubbleK·maxItemSize + 6)` (= y + 97.1 px); `fallScale` uses the new drop. The reserve is kept by `setViewport`; same value → no-op; a changed value re-lays out **without** cancelling the steer. `layout.topReserve` | `QA setTopReserve` |
| row 1 | `magnetMaxAge` 4 → **6** | magnet test (ages 3–6 pulled, 7 not) |
| row 2 | `COUNT_RANGE` 5: [3, 10] → **[3, 6]**, 6 and 7: [4, 12] → **[4, 8]** | content test |
| row 3 | still-Pip guard: a wrong bubble never lands within `0.5·basket.w + 0.25·size + stillWrongGap` (40 px) of a Pip whose `|vx|` has been ≤ 25 px/s for `stillTime` (1 s) | `QA still-Pip guard` |
| row 4 | idle hold: finger up and no touch for `idleHold` (15 s) → no new bubbles, except one right bubble every `idleTrickle` (8 s) when the sky is empty, aimed beyond catch + magnet reach + 40 px. Any pointer call counts as a touch; a new session resets it | `QA idle hold` |
| row 5 + visual P2-5 | colour-blind rule below age 5 now **no red+green, blue+purple or yellow+orange** — rounds (colours, shape colours) and the colours Talk choices (`PG.Content.clash`) | content + talk tests |
| row 6 | `makeRound(topic, {…, avoid})`: re-rolls (≤ 8 times, same rng stream) when `PG.Content.roundKey(round)` equals the previous round's (size: size + colour; others: target). The world passes its previous key from round 1 on | `QA content` |
| row 7 | `fallSpeed` 3: 58 → **62**, 4: 64 → **68**; `firstSpawn` 0.8 → **0.6** | durations |
| row 9 | `maxLaneW` **820** px: Pip's range (= the lanes) is capped and centred on very wide screens (iPhone landscape 1 100 → 820 px) | layout test |
| bot | if the world cancelled the steer while the bot's finger is down, it presses again (`stats.represses`) | `QA bot` |
| fix | a new bubble's drift centre is the planned lane and the sway offset is applied to the drawn x from the first frame (no 1-step jump) | — |

## 0. Deviations from DESIGN.md (all small, all in `PG.CONFIG`)
| | DESIGN | here | why |
|---|---|---|---|
| fall speed | 70/80/95/105/115 px/s | **62/68/78/88/98 px/s for a 460 px drop**, × `fallScale = clamp(drop/460, 0.75, 3)` | DESIGN's speeds give a 4.7 s fall on a 720-tall landscape screen and 15 s on a tall phone in portrait. Scaling by the real drop (spawn line → rim) gives the **≈ 6–8 s fall** DESIGN asks for on every device (≈ 7.2 s at age 4), and puts the age-4 chapter at the 60–100 s target |
| spawn gap | 1.3 s (age 3: 1.6) | **1.6 s (age 3: 2.0)** | calmer sky; little effect on round length (maxAir is what limits it) |
| spawn line | `sky.top` | `layout.spawnY = max(sky.top + 40, topReserve + 97.1)` | the new bubble's top edge clears the speech bubble (`setTopReserve`) |
| catch band | y ≥ rim − 10 | rim − 10 ≤ y ≤ rim + 30 (`catchBelow`), moving down | a bubble caught a moment late, just inside the basket mouth, still counts |
| magnet (ages ≤ 6, was ≤ 4) | 70 px horizontally of the rim | 70 px **beyond the catch edge** (`0.5·w + 0.25·size + 70`), 140 px above the rim | inside the catch edge no help is needed |
| item size | `0.6·size·scale + 14` hit radius | `item.size` **already includes** `scale`; hit radius `0.6·size + 14` | one number for the renderer (drawn width) |
| extra event | — | **`tapPup {promptKey, params}`**: a tap on Pip's chest (within `pupTap.r`) when no bubble was hit | main.js can repeat the prompt without its own hit test |
| extra layout | — | `layout.spawnY`, `layout.fallScale`, `layout.hud {x,y,w,h}` | |
| `w.wind` | weather.wind | the world keeps its **own** deterministic wind: `windBase[weather] × (1 + 0.25·sin(2π·t/8))`, base = the same 0.1/0.6/0.35/0.15 as `PG.Weather` | the simulation must not depend on the renderer's particle system |
| tap on a bubble | "Pip keeps running to x" | **`tapRuns: false`** (integrator decision): a bubble tap only names it, Pip stops where he is; `true` restores DESIGN | §6 finding |
| Pip / basket size | pup.h 170/190, basket 230/210/190, rim 0.55·pup.h | **pup.h 200/215, basket {3:220,4:210,5:200,6:185,7:185}, `rimFrac` 0.32** (integrator decisions) | the basket back wall hid Pip's face at 0.55 (artist A) |

## 1. API summary (DESIGN §5.2 + additions)
| | |
|---|---|
| `new PG.RNG(seed)` | `next, float(a,b)` (= `range`), `int(a,b)` inclusive, `pick, shuffle` (in place), `sample(arr,k), chance, sign, fork(salt)` |
| `PG.Content` | `makeRound(topic,{age,lang,rng,roundIndex})`, `makeTalk(topic,{age,lang,rng})`, `validate(round)` → null or reason, `matches(template,target)`, `topicsFor(age)`, `kindsFor(topic,age)`, `letterPool(lang,topic)`, constants `TOPICS, COLORS, SHAPES, FRUITS, ANIMALS, LETTER_POOL, SIZE, SIZE_SCALE, COUNT_RANGE, MAX_AIR` |
| tables | `PG.PALETTE`, `PG.AGE_TOPICS`, `PG.WORDS {en,vi}`, `PG.ANIMAL_SOUNDS {cow:'moo', duck:'quack', sheep:'baa', cat:'meow', hen:'cluck', frog:'ribbit', bird:'tweet', owl:'hoot', pig:'oink'}` |
| `PG.World` | exactly §5.2, plus `World.logicalSize(cssW,cssH)`, `World.computeLayout(W,H,ins,age,cfg,topReserve)`, `w.setTopReserve(y)`, `PG.Content.roundKey/clash`, `World.computeSlots(need,maxSize,bw,bh)`, `World.arc`, `w.itemById(id)`, `w.counters {spawns,catches,correct,wrong,misses,taps,hints,idles}`, `w.wind`, `w.windVx`, `w.finger`, `w.interactive`, `w.talkAnswered`, `w.roundStars`, `w.levelStartTime`, `w.age`, `w.lang`; `pointerDown` returns the hit bubble id or null |
| `PG.Weather` | unchanged (`setWeather, update(dt,{groundY}), particles, clouds, ambient {…, wind}, burst, resize`) |
| `PG.Bot` | `new PG.Bot(world,{skill,seed})`, `step(dt)` (call before `world.update(dt)`), `stats {steers,correct,wrong,misses,talks,talkRight}`, `finger {x,y,down}`, `enabled` |

Round object (`w.cur`): `{ topic, mode:'catch'|'count', promptKey, params, need, target:{kind,value}, pool:[template], rightShare, maxAir, seed }`;
template `{ sprite|null, shape, color, anyColor, text, scale, size, nameKind, nameValue, right }`.
Talk object: identical to the sister game (`{topic, promptKey:'talk.<topic>', params, show:{sprite,shape,color,text,count,scale}, choices:[{id,kind,value}], answerId}`, + `glowAnswer` set by the world).

Prompt params per topic (raw values; `PG.I18N` names them): colors `{color}`, shapes `{shape}`, size `{size:'big'|'small'}`,
count `{n, fruit}`, animals `{animal, sound}` (`sound` = the animal id → `sound.<animal>`; promptKey `p.animals`, or
`p.animalsSound` at age ≥ 5 after the warm-up), letters/lower/initial `{letter}` (capital), add/sub `{sum:'2+3'|'7−2'}`
(target = the answer number), oddeven `{parity}`. Talk params: animals `{sound}`, all others `{}`.

Name kinds used (`I18N.name(lang, kind, value)`): `color, shape, size, animal, fruit, number, letter, parity, word`
(`sum`/`diff` no longer appear in rounds — the sum is in the prompt and the balls show plain numbers).

### Events (exact payloads)
`session {levels}` · `level {level, topic}` · `round {round, topic, mode, promptKey, params, need}` · `appear {id}` ·
`catch {id, right}` → `pop {id, x, y}` → `correct {id, nameKind, nameValue, count /*reserved incl. this*/, need, target}` or
`wrong {id, nameKind, nameValue, target, misses /*wrong catches this round*/}` · `land {id, count, need}` (settled in the basket) ·
`bounce {id}` (grass) · `miss {id}` (right item on the grass) · `hint {id}` · `idle {promptKey, params}` · `tap {id, nameKind, nameValue}` ·
`tapPup {promptKey, params}` · `pop {id,x,y}` also for every bubble that bursts at round end · `roundDone {stars, mistakes, round, count, need}` ·
`talk {talk}` · `talkAsk {talk, n, glowAnswer}` · `talkResult {correct, choiceId, answerId}` · `levelDone {level, stars}` · `sessionDone {stars}`.

### Renderer contract (fields)
- **item**: centre `(x, y)` interpolated with `_px,_py,_prot` and `w.alpha`; drawn width `size`; `rot`; scale `appear × (sx, sy)`;
  `alpha`; bubble drawn at diameter `cfg.bubbleK × size` (1.35) scaled by `bubble` (1 intact → 0 popped) and by `(bsx, bsy)`
  (squash on the grass); `glow` 0..1 golden halo; `inBasket` → draw between `basket_back` and `basket_front`; `color` is set
  per spawn for `anyColor` shapes.
- **basket**: rim centre `(x, y)` (`_px,_py`), `w × h`, `wobble` (rad), `squash` (scaleX 1+q, scaleY 1−q about the bottom), `shake`
  (x offset `shake·10 px`, extra rotation `shake·0.06`), `glow` (full basket), `count/need` (dots).
- **pup**: feet at `(x, layout.pup.y − hop)` (`_px`), height `layout.pup.h`, `face`, `tilt`, `run` (0..1), `step` (stride phase:
  `run1` while `sin(step) ≥ 0`, else `run2`; idle pose when `run < 0.08`), `mood`, `lookX/lookY`.

## 2. Layout (§2)
`computeLayout(W,H,ins,age)` implements §2 with the integrator's sizes (groundY = H − ins.bottom − 64, pup.h 200/215 ×1.1 when H/W > 1.6,
basket 220/210/200/185/185 (age 3–7) ×1.1 portrait, rim = pup.y − 0.32·pup.h, lanes = Pip's centre range so **every lane x is catchable**,
bubble `min(680, W − insets − 190)` × 100, pupTap r = 0.5·pup.h; lanes capped at `maxLaneW` 820 px, centred).
Measured (age 4, no top reserve; vT and times with the QA fall speed 68 px/s):

| viewport (logical, insets) | groundY | rim y | spawn y | drop px | fallScale | vT px/s | spawn → rim | lanes |
|---|---|---|---|---|---|---|---|---|
| iPhone landscape 1556×720 (108/108/38) | 618 | 560 | 190 | 370 | 0.80 | 55 | 7.2 s | 368–1188 |
| iPad landscape 1036×720 (32/27) | 629 | 571 | 222 | 349 | 0.76 | 52 | 7.2 s | 121–915 |
| iPhone portrait 720×1556 (108/62) | 1430 | 1360 | 298 | 1062 | 2.31 | 157 | 7.2 s | 132–589 |
| iPad portrait 720×1036 (32/27) | 945 | 882 | 222 | 660 | 1.44 | 98 | 7.2 s | 132–589 |

With the iPhone-portrait speech bubble bottom at 252 (`setTopReserve(252)`) the spawn line moves 298 → 349 and the fall stays ≈ 7 s (fallScale follows the drop).

`setViewport` mid-round: cancels the steer, clamps Pip and his target into the new lanes, keeps each bubble's fall progress
(`(y − spawnY)/(groundY − spawnY)` is preserved), clamps drift centres into the lanes; basket items follow the basket.

## 3. CONFIG (`PG.CONFIG`, override per world with `new PG.World({config})`)
| group | constant | value | unit |
|---|---|---|---|
| sim | `step` / `maxFrame` | 1/120 / 1.0 | s |
| flow | `roundsPerLevel`, `chapterTimeLimit`, `chapterMinRounds` | 4, 75, 3 | –, s, – |
| flow | `introTime`, `roundDoneTime`, `leaveDelay`, `leaveTime`, `talkAfterAnswer`, `levelDoneTime` | 1.8, 1.7, 1.0, 0.4, 1.6, 2.0 | s |
| talk | `talkAskTime`, `talkGlowAfterAsks` | 12, 2 | s, – |
| layout | `groundOffset`, `pupFeetDy`, `pupHLand/Port`, `tallRatio/tallK`, `basketW`, `basketPortraitK`, `basketAspect`, `rimFrac`, `laneMargin`, `maxLaneW`, `maxItemSize` | 64, 6, 200/215, 1.6/1.1, {3:220,4:210,5:200,6:185,7:185}, 1.1, 0.62, 0.32, 16, 820, 135 | px / – |
| layout | `skyTopGap`, `spawnDy`, `bubbleX/Y/MaxW/SideGap/H`, `hudW/H`, `pupTapK`, `pupChestK` | 150, 40, 20/16/680/190/100, 160/92, 0.5, 0.6 | px / × pup.h |
| fall | `refFallPx`, `fallScaleMin/Max` | 460, 0.75/3 | px, – |
| touch | `tapMovePx`, `tapTime`, `touchR`, `touchPad`, `tapRuns` | 24, 0.35, 0.6, 14, false | px, s, × size, px, – |
| spawn | `autoSpawn`, `firstSpawn`, `spawnGap`, `spawnGapAge3`, `appearTime`, `bubbleK`, `spawnSepK`, `spawnCandidates` | true, 0.6, 1.6, 2.0, 0.4, 1.35, 1.4, 16 | –, s, s, s, s, × size, × bubble, – |
| spawn | `firstNearK`, `warmNearPx`, `rightGapMax`, `stillTime`, `stillWrongGap`, `idleHold`, `idleTrickle` | 0.35, [30, 70], 1.0, 1.0, 40, 15, 8 | × W, px, s, s, px, s, s |
| fall | `fallSpeed` | {3:62, 4:68, 5:78, 6:88, 7:98} | px/s per 460 px drop |
| fall | `fallLevelK`, `dragRate`, `swayAmp`, `swayPeriodMin/Max`, `rotSway` | 0.05, 2.2, 22, 2.4/3.2, 0.15 | –, 1/s, px, s, rad |
| wind | `windPx`, `windBase`, `windWobble`, `windPeriod`, `driftRate`, `edgeK` | 45, [0.1,0.6,0.35,0.15], 0.25, 8, 1.2, 6 | px/s per unit, –, –, s, 1/s, 1/s² |
| assist | `hintSlow`, `magnetMaxAge`, `magnetX`, `magnetUp`, `magnetRate` | 0.55, 6, 70, 140, 2.0 | ×, age, px, px, 1/s |
| catch | `catchAbove`, `catchBelow`, `catchSideK` | 10, 30, 0.25 | px, px, × size |
| catch | `popTime`, `popApex`, `popInherit`, `inScale` | 0.3, 18, 0.25, 0.7 | s, px, –, × size |
| springs | `landSquash`, `squashOmega/Zeta`, `basketSquash`, `basketOmega/Zeta` | 0.15, 22/0.3, 0.14, 18/0.35 | –, rad/s / – |
| Pip | `hopPx`, `hopTime`, `cheerHopPx`, `cheerHopTime` | 10, 0.25, 22, 0.4 | px, s |
| wrong | `wrongDip`, `shakeTime`, `shakeWiggles`, `shakePx`, `hopOutVx`, `hopOutVy`, `gravity`, `rebubbleTime`, `riseSpeed`, `riseRate` | 0.12, 0.5, 3, 10, 180, −520, 1500, 0.3, 140, 2.0 | s, s, –, px, px/s, px/s, px/s², s, px/s, 1/s |
| ground | `groundK`, `groundBounce`, `groundTime`, `groundSquash`, `groundG` | 0.4, 0.35, 0.5, 0.25, 600 | × size, –, s, –, px/s² |
| leave | `leaveVy`, `leaveVx`, `leaveG` | −420, 90, 1600 | px/s, px/s, px/s² |
| Pip | `pupSpeed`, `pupOmega`, `stepK`, `tiltK`, `tiltMax`, `tiltOmega/Zeta`, `faceVx`, `lookRate` | 1150, 9, 0.012, 0.00025, 0.12, 12/0.6, 40, 6 | px/s, rad/s, rad/px, rad per px/s, rad, rad/s / –, px/s, 1/s |
| basket | `swayOmega/Zeta`, `swayInertia`, `swayMaxK`, `wobbleK` | 14/0.4, 0.12, 0.12, 0.004 | rad/s / –, –, × basket.w, rad/px |
| help | `hintAfterMistakes`, `hintTime`, `hintCooldown`, `glowRate`, `idleTime`, `idleBackoff`, `idleMax` | 2, 4, 6, 5, 12, 1.5, 30 | –, s, s, 1/s, s, ×, s |
| moods | `moodTime` | happy .9, cheer 1.6, oops .8, think 1.2 | s |

## 4. Motion model (fixed step h = 1/120 s, semi-implicit Euler)
| motion | model |
|---|---|
| **Bubble fall** | `vy' = (vT − vy)·2.2` (exponential approach, time constant 0.45 s), `vT = fallSpeed[age]·(1 + 0.05·level)·fallScale`, ×(1 − 0.45·glow) when hinted (0.55×) |
| **Sway + wind** | drift centre `xb` with velocity `ub`: `ub' = (windVx − ub)·1.2` (+ soft wall spring `6·8·overshoot` and damping outside the lanes); shown `x = xb + 22·sin φ`, `φ' = 2π/P`, P ∈ [2.4, 3.2] s; `rot = 0.15·sin(φ − 0.6)` (lags the sway like a hanging bubble); `vx` = finite difference of the shown x |
| **Upwind spawning** | the planned landing x is chosen first, then the bubble is born at `land − windVx·T_fall` so wind drift brings it back over the lane |
| **Magnet (age ≤ 6)** | right bubble, `|x − basket.x| ≤ 0.5w + 0.25·size + 70`, within 140 px above the rim: `xb += (basket.x − x)·2.0·h` (critically damped pull, ≈ 63 % of the gap closed per 0.5 s) |
| **Catch** | `rim − 10 ≤ y ≤ rim + 30`, `vy > 0`, `|x − basket.x| ≤ 0.5·basket.w + 0.25·size`, `reserved < need` |
| **Pop-and-drop (right)** | parabola in **basket coordinates** (so it follows Pip while he runs): `p(τ) = p0 + v0τ + ½aτ²`, T = 0.3 s, apex 18 px above the higher end: `ya = min(y0,y1) − H`, `√g = (√(2(y0−ya)) + √(2(y1−ya)))/T`, `vy0 = −√(2g(y0−ya))`, `vx0 = 0.25·(vx_item − vx_pup)`, `ax = 2(x1 − x0 − vx0T)/T²`; size lerps to the slot size; on landing item squash `q0 = 0.15` (`sx = 1+q`, `sy = 1−1.2q` → 1.15/0.82, ω 22 ζ 0.3), basket `squash = 0.14` (ω 18, ζ 0.35: one visible rebound), Pip hop `10·4u(1−u)` px over 0.25 s |
| **Wrong** | 0.12 s dip into the basket (half gravity), then ballistic hop-out `vx = ±180` away from Pip's centre (flipped if it would leave the lanes), `vy = −520`, `g = 1500` → apex ≈ 90 px; at the apex `bubble` 0→1 in 0.3 s and it rises (`vy → −140·fallScale·(0.3 + 0.7·bubble)`, rate 2/s) with sway + wind, removed above the top; basket `shake = sin(2π·3u)·(1−u)^1.5`, u = t/0.5 s |
| **Ground** | contact at `groundY − 0.4·size`: `vy = −0.35·vy`, gravity 600 px/s², bubble squash spring `q0 = 0.25` (`bsx = 1+q`, `bsy = 1−q`), 0.5 s, then `rise` |
| **Pip** | `a = ω²(targetX − x) − 2ω·vx`, ω = 9 (critically damped: no overshoot), `|vx| ≤ 1150`, clamped to the lanes; `run = |vx|/1150`; `step += |vx|·0.012·h`; tilt spring (ω 12, ζ 0.6) toward `clamp(vx·0.00025, ±0.12)`; `face = sign(vx)` when `|vx| > 40` |
| **Basket pendulum** | `sway'' = −ω²·sway − 2ζω·sway' − 0.12·a_pup` (ω 14, ζ 0.4), `|sway| ≤ 0.12·w`; basket.x = pup.x + sway; `wobble = −0.004·sway` rad. A sprint start leaves the basket ≈ 8 px behind, braking swings it ≈ 5 px ahead, settles in ≈ 0.5 s |
| **Cheer** | 3 parabolic hops, 22 px then ×0.7 each, 0.4 s each |
| **Round end** | air bubbles: `pop` event, fade 0.4 s; at 1.0 s the caught items hop out (`vy ≈ −420`, g 1600) and fade |

## 5. Spawn rules (world `_stepSpawner`)
1. First spawn of a round at 0.6 s: always a **right** item. Warm-up (round 0): lands 30–70 px to one side of Pip
   (an easy first catch); later rounds: lands within 0.35·W of Pip.
2. Then a spawn whenever `bubbles in the air < maxAir` and ≥ `spawnGap` since the last one. If no right bubble is in the air
   the new one is right. Otherwise: at age ≤ 4, a right one after a wrong one (**never two wrong in a row**); else right with
   `rightShare` (0.55; warm-up and count 0.7). Wrong templates do not repeat back-to-back when the pool has several.
3. Rescue: if the air is full of wrong bubbles for ≥ 1 s, one extra right bubble is allowed (`maxAir + 1`). Measured max
   time with only wrong bubbles in the air: **1.6 s** (400 sim sessions); never > 2 s (unit test, 240 rounds).
4. Landing x: farthest-point sampling over 16 jittered lane candidates against bubbles in the upper sky (score = |Δx| + 0.35·Δy),
   empty sky → random lane. Unit test: < 5 % of new bubbles closer than 1.4 × bubble size (minus sway) to one at a similar height.
5. No spawning once `reserved ≥ need` (the last needed item is on its way into the basket).
6. Still-Pip guard and idle hold: see §0a (rows 3 and 4). The next round's target never repeats the previous one (row 6).

## 6. Help, taps, stars
- **Mistakes** = wrong catches + right bubbles reaching the grass, counted since the last right catch. At 2 → auto-hint:
  the lowest right bubble glows 4 s and falls at 0.55×; `hint {id}`; not while one glows, not within 6 s of the last hint
  (a pending hint fires as soon as both are allowed and a right bubble is in the air). `w.hint()` (manual) glows at once,
  returns the glowing id without a repeated event.
- **Idle**: no catch for 12 s (counted from the first spawn) → `idle` + `think` + a silent glow on the lowest right bubble;
  gaps 12 → 18 → 27 → 30 s; reset by any catch and by a new round.
- **Stars**: wrong catches 0 → 3, 1 → 2, ≥ 2 → 1. Misses never cost stars. Talk right → +1.
- **Tap** (finger moved < 24 px, released < 0.35 s, on a bubble): `tap {id, nameKind, nameValue}`. Pip does not start running
  while it might be a tap (F2) and stays exactly where he is afterwards (`tapRuns: false`; DESIGN had him keep running). **Finding** (`node tests/sim/tap_test.js`): a tap on a WRONG bubble ends in that bubble being caught
  54–66 % of the time with `tapRuns: true` (Pip runs under it), contradicting REQUIREMENT ("a tap is not a move-and-catch
  decision"). With the new default `tapRuns: false`: 14–40 % (Pip simply standing in the way).
- **Absent child**: with the idle hold and the still-Pip guard, 5 min away finishes only the warm-up round (it starts next
  to Pip): `node tests/sim/idle_absent.js` → 1 round, 2 lucky catches, idle nudges 12/18/27/30 s.

## 7. Content (§5.1)
Ages 3–7 × 11 topics × 200 seeds × rounds 0–4 × en/vi (55 000 rounds) all validate: ≥ 1 right and ≥ 1 wrong template, every
template's `right` flag equals `matches(template, target)`, names present, sprites from DESIGN §4. Kinds in the air:
colors/shapes/animals 2/3/4 (age 3/4/5+), size 2, count 2 (target fruit + 1 other), letters/lower/initial/add/sub 3, oddeven
5–6 numbers (≥ 3 distinct). need: 1, 2, 2–3, 3; count N: age 3 1–3, age 4 warm-up 1–2 then 2–5, age 5 warm-up 3 then 3–6,
age 6+ 4–8. maxAir 2/3/3/4/4 (warm-up −1, ≥ 2). Colour-blind safety below 5 (no blue+purple, red+green, yellow+orange) for colours and
shape colours (and Talk colour choices; yellow+orange added). Lower-case pool has no I and no L. `PG.WORDS` gained pig/pear/carrot (en) and heo/lê (vi) — new sprites.

## 8. Bot (`bot.js`)
Finger on the grass below Pip (`groundY + 24`), only `pointerDown/Move/Up`. Every reaction time `(0.8 − 0.55·skill)·U(0.8,1.2)` s
it re-plans: target = the lowest right bubble (switches to a lower one that arrives ≥ 0.3 s earlier); a new target is a wrong
one with p = (1 − skill)·0.35. Predicted rim x = `xb + ub·t + 22·sin(φ + 2πt/P)` (skill < 0.35: the current x). Stops short with
p = (1 − skill)·0.4 (45–85 % of the way). Dodges (p = skill) a wrong bubble that will reach the rim over the goal first.
Moves the finger on an eased path at 700–1100 px/s; holds ≥ 0.4 s (never a tap); lifts after a catch with p = 0.4.
Talk: 1.0–2.2 s, right with p = 0.5 + skill/2. Skill 1: 0–1 wrong catches in 6 sessions, > 97 % of the stars.

## 9. Measured durations
**Unit test bots** (`node tests/unit/run.js`, 6 seeds × mixed viewports, both languages; median game seconds):

| age | skill | round | chapter (max) | session (max) |
|---|---|---|---|---|
| 3 | 0.5 | 15.3 | 70 (79) | 282 (296) |
| 3 | 0.9 | 15.4 | 69 (84) | 285 (291) |
| 4 | 0.5 | 10.9 | **60** (81) | **251** (271) |
| 4 | 0.9 | 10.7 | **58** (72) | **241** (250) |
| 5 | 0.5 | 13.0 | 60 (99) | 266 (278) |
| 5 | 0.9 | 10.7 | 58 (91) | 253 (263) |
| 6 | 0.5 | 11.6 | 54 (99) | 243 (261) |
| 6 | 0.9 | 11.1 | 53 (99) | 240 (263) |
| 7 | 0.5 | 9.2 | 50 (56) | 205 (219) |
| 7 | 0.9 | 9.2 | 49 (56) | 199 (220) |

After QA round 1 (faster fall at 3–4, first spawn 0.6 s, magnet to age 6, smaller counts) the bots sit at the bottom
edge of the 60–100 s age-4 target (58–60 s); the child models are inside it (below). Every session ≤ 8 min (max 296 s).
The unit test asserts an age-4 median of 55–100 s for the bots.

**Sim child models** (`tests/sim`, 18 sessions per cell, iPad landscape + iPhone portrait + iPhone landscape, en+vi; median):

| age 4 | chapter s (p90) | session s (p90) | stars % | right caught before the grass |
|---|---|---|---|---|
| bot0.5 | 62 (73) | 257 (270) | 92 % | 94 % |
| bot0.9 | 59 (70) | 246 (252) | 99 % | 99 % |
| typical | 68 (83) | 274 (301) | 92 % | 84 % |
| toddler | 73 (92) | 303 (335) | 86 % | 75 % |
| slowKid | 78 (95) | 324 (347) | 87 % | 71 % |
| tapper | 85 (101) | 347 (370) | 82 % | 57 % |

Age 3 toddler session 330 s (p90 355), tapper 403 s (p90 446). 672 sessions: 0 stuck rounds, 0 invariant breaks,
0 errors, never more than `maxAir` bubbles (+1 rescue), only-wrong-in-the-air ≤ 1.9 s; determinism replays identical.

## 10. Playtest harness (`tests/sim/`, report-only)
- `lib.js` — loads rng/i18n/content/world/bot in a vm (i18n optional), `runSession({age, lang, vp, driver, seed, config})`,
  drivers `bot<skill>`, `toddler`, `typical` (scales with age), `slowKid`, `idleKid`, `tapper`, `spammer`, `absent`;
  speech model mirroring main.js (`SpeechModel.onEvent`); invariants: NaN/out-of-screen items, basket over-full, Pip outside lanes.
- `run_matrix.js --n 8 --name baseline [--variant v] [--config '{…}'] [--drivers …] [--ages …] [--vps …]` → `out/<name>.json` (all CPU cores).
- `summarize.js <name>` → markdown tables (durations, stars, catch rate, hints/idle per min, speech cuts, per-topic rounds).
- `compare.js <a> <b> …` — side-by-side metrics; `variants.js` — config/patch variants (`designSpeed`, `slowFall`, `noMagnet`,
  `magnet5`, `wideCatch`, `calmSpawn`, `noWrongGuard`, `tapStays`).
- `content_stats.js <name>` — target variety and Talk-time answer distribution; `determinism.js` — rerun + 1/120 s and
  1/60 s input replays give identical event hashes (all 10 cases); `idle_absent.js`; `tap_test.js`.
