# Momo's Toy Train — Mechanics (`TT.CONFIG`, layout, motion, render contract, events, playtest tuning)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.5.
Tests: `node tests/unit/run.js` (28 tests, ≈ 5 s, > 10 000 generated rounds; `node tests/unit/run.js <name part>` runs a subset).
Sims (report-only, `tests/sim/`): `node tests/sim/hs_playtest.js [--n 300] [--ages 3,4] [--models typical,slow3,…] [--jobs 2]
[--config '{…}'] [--tag x]` (high-speed playtest → `tests/sim/out/hs_<tag>.md`), `node tests/sim/determinism.js`,
`node tests/sim/content_stats.js [chapters]`, `node tests/sim/hs_browser.js` (the real page in Playwright with `?bot=1`, needs
the lead's build). JSON reports are git-ignored.

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. **Screen space = world space** (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s per call, so `?speed=N` works). At the start of
  every sub-step each moving value is copied into its `_p` twin; render `v = _v + (v − _v)·w.alpha`.
- Determinism: content, layout packing and surprises use the world's seeded `TT.RNG`; cosmetic randomness (cargo hops, puff
  jitter, bob phases, blinks) a second seeded generator. Same seed + the same inputs on the same sub-steps → the same events
  whatever the frame size (`tests/sim/determinism.js`: 25 age × model runs, replays at 1/30, 1/60 and 1/120 s frames).

## 2. Public API (`TT.World`)
`new TT.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (no-op when nothing changed;
set `world.hudKeep = [{x,y,w,h}…]` then call it again to keep cargo away from DOM buttons), `setAge(a)` / `setLang(l)` (apply at
the next `newSession`), `newSession({lastTopics})`, `levels`, `startLevel(i)`, `update(dt)`, `drainEvents()`, `skipTalk()`,
`resetNudges()` (after a pause), `talkAnswer(choiceId)` → bool, `hint()` → car id | null (manual hint, e.g. a bubble tap),
`prompt()` → `{promptKey, params, mode, phase}` in deal/load, `{promptKey:'loaded', …, phase:'whistle'}` while waiting for the
whistle, else null. Fields: `layout, hudKeep, state, phase, level, topic, round, roundsPerLevel, stars, levelStars, roundStars,
misses, talk, talkAnswered, alpha, stateTime, phaseTime, tapMoveMin (default 24), interactive (state round + phase load),
weather (= level % 4), trains, packShrink`.
**Input (one active pointer):** `pointerDown(x, y)` → cargo id | `'whistle'` | `'toot'` | `'momo'` | `'hitch'` | `'balloon'` |
null (whistle / toot / bunny / balloon fire on the press); `pointerMove(x, y)`; `pointerUp(x, y)` → `'correct'` | `'wrong'` |
`'miss'` | `'full'` | `'tap'` | `'pokeMomo'` | null; `cancelDrag()` (touchcancel / pause: a held cargo floats home, no event).
**Test hooks (logical px, `{x, y (centre), w, h}`):** `itemHit(id)`, `carBox(id)` (car body at its current position, + `x0, x1,
y0, floorY`), `whistleHit()`, `momoHit()`, `hitchHit()`, `balloonHit()`, `answerCarId(itemId)` (sort: its car; count: the first
count car with room), `carAt(x, y)`, `itemById`, `carById`. Static: `World.logicalSize(cssW, cssH)`, `World.computeLayout(W, H,
ins, cfg, plan)`, `World.packItems`, `World.kickFor`.

### States and phases
`menu → intro (2.5 s) → round → roundDone (clear 0.5 s) → … → talk → levelDone (1.8 s) → … → sessionDone`.
In `round`: `arrive → deal → load → whistle → depart`; `roundDone` has `phase = 'clear'`.

## 3. Render contract (what render.js reads; everything else is internal)
```
w.layout   W, H, ins, portrait, tall, groundY, trackY, S, n, carW, carH, carScale, tunnelX,
           engine {x0, x1, y0, w (= E)}, momo {x, y (feet), h}, whistle {x, y, r}, chimney {x, y},
           cars[i] {x0, x1, y0, y1 (= trackY), w, h, floorY, scale, slots[{x, y, row}]}  (PARKED positions)
           rug {x0, x1, y0, y1, top}, bubble {x, y, w, h}, hud {x, y, w, h}, keep[] (debug: cargo keep-out boxes)
w.train    x, _px (offset of the whole train from its parked layout), v, a, wheelRot, _pwheelRot (rad, rolled distance /
           CONFIG.wheelR 22 px; a wheel of radius r turns wheelRot·22/r), whistle 0..1 (pulled; 1 → 0 in 0.8 s), lamp 0..1
           (headlamp, night), glow 0..1 (pulsing whistle glow in the whistle phase, 1 after the nudge), dist,
           couple[i] {dx, _pdx (car i's total spring offset from its parked spacing, + = farther from the engine),
                      s (stretch of the coupling in FRONT of car i: + stretched / − compressed, −12…+16 px)}
           engine drawn at x = layout.engine.x0 + lerp(_px, x); TrainArt.drawEngine opt {wheelRot, whistle, lamp, glow}
w.cars[i]  id, index, label {type, value, color?, showDots?, a?, b?, op?}, need, nameKind, nameValue, filled, items [ids],
           x0, x1, y0, y1, w, h, floorY, slots, scale (= layout.cars[i]),
           ox, _pox (= train.x + couple[i].dx: draw the car at x0 + lerp(_pox, ox) + shake),
           sq, _psq (squash: scaleY 1 − sq about the car bottom), shake (px, already NOT in ox), glow 0..1 (hint), done 0..1
           (plate glow once the car has its cargo). TrainArt.drawCar(…, {need, filled}) for count plates.
           Coupling bar between car i−1 (or the engine) and car i: from the previous right edge to this left edge, stretch = s.
w.items[]  id, item (content item: kind, toy, shape, color, sprite, text, n, scale…), x, y, _px, _py (CENTRE), rot, _prot,
           size, _psize (drawn square size, px: includes the pop-in, the drag lift and the car scale), sx, sy (squash about
           the centre; y already keeps the bottom in place), alpha (count-round spares fade 'bye'), glow 0..1 (hint),
           state 'pop'|'rest'|'drag'|'fly'|'home'|'in'|'bye', carId, slot, row, inCar (true → draw between car carId's
           back and front, higher row first; w.items is kept in that order: cargo in cars first, back rows first),
           bounce (≤ 0 px hop in a moving car, already in y). Others in front of the train; the held cargo is LAST.
w.momo     x, y (feet; = layout.momo + train.x), h, mood idle|talk|happy|cheer|think|oops|wave|whistle|point, moodT,
           blink (bool), look −1..1 (horizontal gaze)
w.hintHand null | {kind 'drag'|'tap', x, y (fingertip now), x0, y0, x1, y1, t 0..1 (cycle), alpha, itemId, carId}
w.hitch    null | {x, y, _px, _py (bottom-centre of bunny_toy.svg), size (drawn px), state 'in'|'ride'|'wave' (wave frame), t}
w.balloon  null | {x, y, _px, _py (string end = tie point on the last car), size (drawn height), sway, _psway (rad, + leans
           right: rotate about the tie point), bob (px up), taps, popped (always false)}
```
`TT.Weather` (§6) gives `ambient`, `particles[]`, `stars[]`, `clouds[]`.

## 4. Layout (`setViewport` → `w.layout`, DESIGN §2; recomputed per round: cars n, slots per car, surprise)
| field | landscape | portrait |
|---|---|---|
| groundY | H − ins.bottom − 18 | H − ins.bottom − 30 |
| trackY | groundY − 40 | tall (H/W > 1.6): groundY − 300; else groundY − lerp(120, 220, (H − 960)/240) (short portraits, iPad: the rug needs ≥ 2 rows) |
| S (cargo) | 104 | 104; tall ×1.2 = 125 |
| engine E | 240 (W < 1100: 210) | 180 |
| cars | carW = min(260, (span − 16(n−1))/n), gap 16; carH = clamp(0.62 carW, 96, 150); y0 = trackY − 26 − carH; floorY = y0 + 0.62 carH | same |
| train x | the whole train (engine + cars) is **centred** in ins.left+20 … W−ins.right−20 when the cars do not fill it | same |
| carScale | clamp(carW / 2.3S, 0.55, 0.85); a count car with need N > 6: × √(6/N) (≥ 0.42) | same |
| slots | front row first, left → right, ≤ 6 columns spaced ≥ 0.45 S (≥ cs/2 in narrow cars); back rows raised 0.28 S·(scale/0.85), staggered ¼ step | same |
| momo | cab centre (TrainArt.engineGeom when loaded, else right 45 %), y = trackY − 34, h = 0.95 E | same |
| whistle | engineGeom, else (x0 + 0.40 E, trackY − 0.86 E), r 34, hit r + 26 | same |
| bubble | (ins.left+24, ins.top+18), w = min(560, W − ins.right − 200 − x), h 122 | tall: y = ins.top + 110, full width, h 124; short (iPad): on the HUD row, left of the HUD |
| rug (cargo centres) | x: ins.left + 40 + S/2 … W − ins.right − 40 − S/2; y1 = min(car tops) − 90 − 44 (every resting centre ≥ 44 px above every drop zone); y0 = bubble bottom + 40 + S/2; `top` = ins.top + 18 + S/2: the area right of the bubble is used only when the band is full | band ≤ 0.85 W tall above the cars |
| keep-out | bubble (+40 + S/2), HUD (+S/2 + 10), engine incl. whistle & Momo (+S/2 + 16), `hudKeep` (+S/2 + 8), the bunny / balloon above the last car in surprise rounds | same |
Packing: a grid from the rug bottom upwards (spacing 1.1·size + jitter 4), farthest-point sampling; shrinks in 0.05 steps
to `bandShrink` 0.85 in the main band, then also uses the area beside the bubble down to `minShrink` 0.6 (then anything).
Measured over 16 viewports × every age / pool topic × 15 seeds × 4 rounds (23 680 rounds): sort rounds always ≥ 0.85 (98 % at
full size); count rounds with 12–14 cargo on short landscapes (iPad with insets, notched iPhone) shrink to 0.65–0.9 (≈ 7 %,
0.65 in 0.2 %); touch targets stay ≥ 100 px (hit radius uses max(size, S·shrink)). Arcs never rise above ins.top + 8.

## 5. Motion (all integrated per 1/120 s sub-step)
- **Drag:** critically damped spring ω 28 (95 % in 0.17 s) to finger + ½ grab offset − 10 px lift; pendulum tilt = rotational
  spring (ω 9, ζ 0.35) towards clamp(−vx·0.0016, ±0.45 rad); lift scale 1.1.
- **Right drop:** ballistic arc to the next free slot: T = clamp(0.3 + d/2000, 0.35, 0.5) s, apex ≥ 60 px over the higher end
  (+0.06 px per px/s of upward release speed, ≤ 140), keeps 25 % of the release vx; the target follows the car while it is
  still springing. Landing: squash q 0.2 (sx 1 + q, sy 1 − 1.2q, spring ω 22 ζ 0.3) + car squash kick (peak 0.08, ω 18 ζ 0.25).
  `inCar` from u > 0.55 while descending.
- **Wrong car:** car shake 10 px · sin(2π·3u)·(1 − u)^1.5 over 0.5 s; cargo arcs home in 0.55 s (apex 45) with a ±0.28 rad
  wobble at 2.5 Hz. **Miss** (outside every zone): floats home in 0.5 s (apex 22). **Tap:** hops home in 0.25 s (apex 8).
  **Full** (count): home in 0.5 s (apex 40).
- **Arrive (1.6 s):** constant braking x = X0 (1 − u)², X0 = W + 120 (v0 = 2X0/T ≈ 2100 px/s on a 1556 screen, 1300 px/s² decel,
  then a hard stop). **Depart:** stands for `whistleLead` 0.55 s after the whistle (the toot), then a jolt (v = −120 px/s, an
  impulse felt by every coupling) and a = −900 px/s² up to 900 px/s; ends when the last car's right edge passes `tunnelX`
  (≈ 2.0–2.6 s after the whistle).
- **Couplings:** one damped spring per coupling (ω 9, ζ 0.35) driven by −0.75·a, coupling i sees the acceleration 0.07·i s
  later ("in turn"); compression clamp −12 px (buffers touch → `clack {hard}`), stretch ≤ 16. Braking: −8 px (960 wide) …
  −12 px (1556) bunch-up, spring-back after the stop; depart: +8 px stretch + the jolt wave. `clack` on every compression peak
  (< −2 px, ≥ 0.12 s apart per car).
- **Cargo in a moving car:** ballistic hops (g 2200, restitution 0.35): jolt kick 140–230 px/s (4–12 px), every 150 px of travel
  (rail joint, `rail` event) 70–150 px/s (1–5 px), staggered 0.05 s per car; tilt spring (ω 10, ζ 0.3) leans back with the
  acceleration. The bunny hops the same way.
- **Resting cargo:** bob 2.5 px at 2–3 s periods; pop-in easeOutBack 0.4 s, staggered 0.12 s.
- **Bunny (hitch):** 2 floor hops + 1 hop onto the last car's rim (parabolas, g 2200, apex 70, 0.12 s pauses), sits at
  (x1 − 0.17 carW, y0 + 6), size 1.05 S. **Balloon:** pendulum (ω 3.2, ζ 0.25) towards clamp(−v·0.0007, ±0.75) + 0.06 rad idle
  sway; tap → bob spring kick (ω 7) + a random swing; size 1.55 S.
- **Whistle glow** (train.glow): 0.55 (nudged: 1) × (0.6 + 0.4 sin 2π·1.2 t). Headlamp `train.lamp` → 1 at night.

## 6. `TT.CONFIG` (tuned values)
| group | key = value | why |
|---|---|---|
| flow | `roundsPerLevel 4`, `chapterTimeLimit 75`, `chapterMinRounds 3`, `introTime 2.5`, `clearTime 0.5`, `levelDoneTime 1.8`, `talkAfterAnswer 1.6`, `talkAskTime 12`, `talkGlowAfterAsks 2` | skill rules |
| short trains | `shortBudget [∞, 30, 52, 70]` | a sort round starting later than this many s into the chapter carries 1 cargo per car (slow-3 chapters 170 → 140 s; typical children never hit it before round 3) |
| packing | `minSpacing 1.1`, `bandShrink 0.85`, `minShrink 0.6`, `shrinkStep 0.05`, `packJitter 4` | crowded count rounds use the space beside the bubble before shrinking below 0.85 |
| touch | `hitFrac 0.6`, `hitPad 14` (targets ≥ 100 px), `zoneSide 30`, `zoneUp 90`, `zoneDown 20`, `tapMovePx 24`, `tapTime 0.35`, `momoTapTime 0.6`, `stillDragTime 6`, `stillPx 8` | DESIGN §2 / skill |
| drag | `dragOmega 28`, `grabKeep 0.5`, `liftPx 10`, `liftScale 1.1`, `tiltK 0.0016`, `tiltMax 0.45`, `tiltOmega 9`, `tiltZeta 0.35` | proven (snow garden) |
| fly | `flyBase 0.3`, `flyPerPx 1/2000`, `flyMin 0.35`, `flyMax 0.5`, `flyApex 60`, `flyApexMax 140`, `flyInherit 0.25`, `landSquash 0.2`, `carSquash 0.08` | DESIGN: apex ≥ 60, 0.35–0.5 s |
| wrong / miss | `shakeTime 0.5`, `shakePx 10`, `wrongReturnTime 0.55`, `wrongApex 45`, `missReturnTime 0.5`, `tapReturnTime 0.25`, `fullReturnTime 0.5` | |
| deal / done | `dealStagger 0.12`, `popTime 0.4`, `loadedSettle 0.4`, `byeTime 0.6` | |
| train | `arriveTime 1.6`, `arriveFrom 120`, `coupleOmega 9`, `coupleZeta 0.35`, `coupleGain 0.75`, `coupleLag 0.07`, `wheelR 22`, `railJoint 150`, `departKick 120`, `departAccel 900`, `departVmax 900`, `whistleLead 0.55`, `whistleTime 0.8`, `tootGap 0.3` | gain 0.6 → 0.75: the bunch-up was only 6 px at 960 wide |
| whistle help | `whistleNudge 6`, `whistleAuto 12` | DESIGN |
| puffs | `puffSlow 0.25`, `puffFast 0.12` (by speed), `puffIdle 2.6` (parked, small) | |
| help | `hintAfterMisses 2` (wrong or miss on the same cargo), `hintTime 3`, `hintCooldown 6`, `hintCycle 1.4`, `idleTime 12`, `idleBackoff 1.5`, `idleMax 30`, `idleHintFrom 2` | skill rules |
| surprises | `surpriseRound 2`, `surpriseTypes ['hitch','balloon']` (rotate per chapter from a random start), `hitchAt 2.5` s into load | never the warm-up |

## 7. Content (`TT.Content`, DESIGN §5.1)
- Cars: sort age 3: 2; 4: 3; 5: 3 (4 from round 2); 6–7: 3; `size` / `oddeven`: 2; warm-up round 0: 2 cars × 1 cargo. Count:
  1 car (age ≤ 4 round 3 and age 6–7 round 3: 2 cars, N1 ≠ N2).
- Cargo: round 0 one per car; later 1–2 per car, total = k + 1 in round 1, k + 1 … cap later (cap 5 at ages 3–4, 6 from 5).
- Count needs: r0 1–2 · r1 2–4 (age 3: 2–3) · r2 3–5 (age 3: 3–4) / age 5: 4–7 / ages 6–7: 5–9 · r3 two cars Σ ≤ 6 (≥ 4) / age 5:
  6–10 / ages 6–7 two cars 3–8 each, Σ ≤ 12. Spares: +2 (+3 when ΣN ≤ 3), ≤ 14 cargo. Plates show dots for N ≤ 5 at ages ≤ 4.
- Colours below age 5: one clash-free set for cars + cargo (no blue+purple, red+green, yellow+orange, green+orange, no pink).
  Shapes ≤ age 4: each shape in its sign's colour; age 5+: random colours (the shape matters). ABC / number blocks get a random
  face colour (no meaning).
- `initial` words: EN all 12 animals (C, P, S, D, F, B, M); VI bò B, heo H, cừu C, vịt V, cá C, sóc S, bướm B, cáo C (no digraph
  words, no ếch). `lower` never uses I / L. `add`: sums 2–10 (age 7: –20; round 0 ≤ 6), labels "a+b"; `sub`: results 0–9 (round
  0 ≤ 5), "a−b" with a ≤ 10; `oddeven`: 1–12 (age 7: 1–20).
- Self-check `validate(round)` on every round (≤ 80 retries): every cargo fits exactly one car (re-derived by `fits`), every car
  gets cargo, count needs satisfiable, colour rules, no two identical consecutive trains (`prevKey`).
- Topics: the first session = `TT.AGE_TOPICS`; later sessions rotate chapter 1 and pick 3 of the other 4 pool topics
  (`TT.AGE_POOLS`, in difficulty order). Talk time: 2–3 picture choices per topic (`talk.homes`: an animal → 3 home badges).

## 8. Events (with `x, y` where an effect can be placed)
`session {levels}`, `level {level, topic, weather}`, `round {round, topic, mode, surprise, cars, items, short, promptKey, params}`,
`balloon`, `arrive`, `deal {n}`, `pop {id}`, `ask {promptKey, params, mode, first, round, cars}`, `grab {id, nameKind, nameValue,
item}`, `tap {id, nameKind, nameValue, item}`, `drop {id, carId}`, `miss {id}`, `correct {id, carId, nameKind, nameValue, label,
item, count?:{i, n}}`, `wrong {id, carId, item:{nameKind, nameValue}, want:{nameKind, nameValue, carId, label}, got, streak,
misses}`, `full {id, carId}`, `land {id, carId, i, n, quiet}`, `carDone {carId}`, `bye {ids, n}` (count spares leave),
`hint {id, carId, item, want, idle?}`, `idle {n, promptKey, params, mode}`, `stillDrag {id}`, `hitch`, `hitchHop`, `hitchSit`,
`hitchTap`, `balloonTap {taps}`, `pokeMomo {promptKey, params, mode, phase}`, `loaded`, `whistleHint`, `whistle {auto}`, `toot`,
`depart` (the train starts moving), `puff {v, small}`, `clack {i, carId, hard, v}`, `rail {v}`, `departed`, `roundDone {round,
stars, misses}`, `talk {talk}`, `talkAsk {n, glowAnswer}`, `talkResult {correct, choiceId, answerId}`, `levelDone {level, stars}`,
`sessionDone {stars, trains}`. Stars: 3 / 2 / 1 per train for 0 / 1 / ≥ 2 wrong drops (misses, taps and `full` never count).

## 9. `TT.Weather` (DESIGN §5.3)
`setWeather(i, {instant})` (2.5 s crossfade), `resize(W, H, groundY)`, `update(dt)` (1/60 s steps), `addPuff(x, y, v, small)` (for
every world `puff` event), `burst(x, y, {kind: confetti|sparkle|stars|puff|steam|bubbles|feathers, n, color})`, `setParty(on)`.
`ambient {skyTop, skyBottom, skyMid, wall, tint, sun, sunX, sunY, moon, moonX, moonY, stars, beam, beamLine {x0, y0, x1, y1, w},
darkness, lamp, mood, moodIndex, env, envFrom, envMix, party}`. Walls / skies exactly DESIGN §3 (morning #F3E6CF, noon #F6EBD8,
sunset #F2D6C0, night #4B4F78); darkness 0 / 0 / 0.06 / 0.32; lamp 0 / 0 / 0.3 / 1. Particles (`particles/<sprite>.svg`): morning
dust `mote`s in the sunbeam band, noon soap `bubble`s that rise and pop into sparkles, sunset `feather`s (pendulum fall) + warm
motes, night `sparkle` twinkles + `stars[]` (14 night-light stars turning 0.03 rad/s around the upper middle of the wall), `puff`
steam (rises, swells, trails behind the train at −0.35·v). Ambient ≤ 64, total ≤ 120 (oldest ambient / puff dropped first).

## 10. Playtest — `node tests/sim/hs_playtest.js --n 300 --tag final` (10 650 sessions, 2 cores ≈ 5 min)
Child models: **typical** (age-based think 1.2–3.6 s + 2.5 s prompt, drag 380–950 px/s, skill 0.7–0.92, 3–12 % tap-first, 5–10 %
drops high, 3–6 % slips, whistle after 3–5 s), **slow3** (skill 0.6, think 3–6.5 s, drags 250–480 px/s, 25 % tap first, 18 % high,
12 % slips, 30 % never taps the whistle until nudged), **perfect**, **high** (70 % of releases 50–160 px above the car top),
**tapper** (random taps + random drags), **spammer** (3–4 flings/s, hammers the whistle), **bot0.8**, **absent**.

| model | age | session min (p90) | chapter s mean [p10–p90] | cut % | round s (p90) | stars 3/2/1 % | wrong / round | hints / round | whistle nudge % |
|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 6.4 (6.7) | 93.5 [83–106] | 81 | 26.1 (35.9) | 42/33/25 | 0.97 | 0.34 | 11 |
| typical | 4 | 6.4 (6.9) | 94.9 [83–109] | 66 | 25.3 (34.6) | 63/22/15 | 0.59 | 0.17 | 12 |
| typical | 5 | 6.6 (7.0) | 97.3 [84–109] | 35 | 23.8 (31.9) | 67/22/12 | 0.49 | 0.12 | 5 |
| typical | 6 | 6.6 (6.9) | 97.1 [85–110] | 13 | 22.4 (31.0) | 77/17/6 | 0.30 | 0.07 | 5 |
| typical | 7 | 6.2 (6.5) | 91.4 [83–100] | 5 | 20.5 (26.3) | 75/21/4 | 0.30 | 0.05 | 5 |
| slow3 | 3 | 9.5 (10.7) | 140 [108–176] | 100 | 42.8 (65.0) | 36/30/34 | 1.25 | 0.85 | 61 |
| slow3 | 4 | 10.6 (11.9) | 157 [117–202] | 100 | 48.4 (73.4) | 44/21/35 | 1.28 | 0.89 | 60 |
| perfect | 3–7 | 4.5–5.1 | 66–75 | 0 | 14.7–16.8 | 100/0/0 | 0 | 0 | 0 |
| high | 3 / 4 | 7.3 / 7.2 | 107 / 106 | 98 / 95 | 32 / 31 | 50/31/19, 68/21/11 | 0.78 / 0.48 | 1.24 / 0.99 | 12 |
| tapper | 3–7 | 6.1–7.4 | 90–109 | 20–74 | 21–31 | | 2.9–5.5 | 0.9–1.8 | 0 |
| spammer | 3–7 | 3.1–4.5 | 44–66 | 0 | 9.5–15 | 9–31 % 3★ | 3–8 | 0.9–1.6 | 0 |
| bot0.8 | 3–7 | 4.2–5.1 | 61–74 | 0 | 13–17 | 46–59 % 3★ | 0.7–0.9 | 0.12–0.15 | 0 |

Per topic (typical, mean chapter s): age 3 colours 93 · shapes 94 · size 93 · homes 95; age 4 colours 93 · shapes 93 · count 100 ·
homes 93; age 5 shapes 96 · count 101 · letters 96 · homes 96; age 6 lower 96 · initial 91 · add 96 · count 106; age 7 initial 90 ·
add 94 · sub 94 · odd/even 88.
- Every engaged model finishes every session: 0 NaN, 0 stuck states (no state change for 200 s), 0 cargo off screen, 0 rounds
  > 120 s for typical / perfect / high / spammer / bot. slow3: 0.3–1.1 % of rounds > 120 s (max 173 s) — inspected: 12–24 grabs
  with 6–8 wrong drops + misses on 4-car age-5 content, hints firing; no stall.
- A typical toddler chapter is **94 s** (target 60–100), a session **6.4 min, p90 6.9** (≤ 8). The 75 s chapter limit cuts the
  4th train for 66–81 % of typical 3–4-year-olds (by design); 6–7-year-olds play all four.
- "2nd miss without a hint" only happens inside the 6 s cooldown / while another car glows (typical: < 0.3 % of cargo).
- tapper (random drags to random cars) at age 5 (4 cars): 6 of 3 600 rounds > 120 s (max 143 s) — chance, no stall.
- Tuning history: arcs clamped below the top inset (a cargo dragged to the top edge floated home partly off screen: 6 frames
  in 1 500 slow3 sessions); packing tiers reordered (count rounds 0.6 → ≥ 0.65 worst, sort ≥ 0.85); `shortBudget` added (slow3 age 3 chapter 168 → 140 s, session 11.3 → 9.5 min; typical unchanged);
  `coupleGain` 0.6 → 0.75 (visible bunch-up at 960 px). Known: `high` releases > 90 px above the car top are misses (35 % of
  its drops) — `zoneUp` stays 90 per DESIGN because a bigger zone would push the rug into a single row on iPad landscape; the
  2nd miss hints the car.
