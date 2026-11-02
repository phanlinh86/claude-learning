# Bim's Rainbow Rocket — Mechanics (`RR.CONFIG`, motion, events, playtest tuning)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.5.
Tests: `node tests/unit/run.js` (34 tests, ≈ 25 s). Sims: `node tests/sim/playtest.js [--n 100] [--fast] [--config '{…}']`
(2 500 sessions ≈ 4 min), `node tests/sim/determinism.js`, `node tests/sim/content_stats.js [chapters]`. Reports go to
`tests/sim/out/` (git-ignored JSON).

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. `update(dt)` runs fixed sub-steps of
  `CONFIG.step = 1/120 s`; every sub-step starts by copying `x, y, rot → _px, _py, _prot` (islands, rocket, wagon, rope points,
  flyers, shooting star) and `camY → _pcamY`. Render `p = _p + (p − _p)·w.alpha`.
- **World space**: x as the screen, y down and unbounded upwards. `w.camY` = world y of the screen top; screen y = world y − camY.
  The camera **only climbs** inside a session (`camY` never increases; enforced in `_stepCamera`). `newSession()` resets it to 0.
- Pointer input is **screen** logical px; the world adds `camY`.
- Determinism: everything random comes from the world's seeded `RR.RNG` (rows use a per-row seed, so a rotation re-places a
  row identically). Same seed + same inputs on the same sub-steps → the same events, whatever the frame size.

## 2. Public API (`RR.World`)
`new RR.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)`, `setAge(a)`, `setLang(l)`
(both apply at the next `newSession`), `newSession({lastTopics})`, `startLevel(i)`, `update(dt)`, `drainEvents()`,
`pointerDown(x, y)` → island id | `'rocket'` | `'pad'` | `'boost'` | `'shooting'` | null, `pointerMove(x, y)`,
`pointerUp(x, y)` → island id | `'pokeBim'` | null, `cancelDrag()`, `hint()` → id, `talkAnswer(choiceId)` → bool, `skipTalk()`,
`prompt()` → `{promptKey, params}` | null, `answerId()` → id | null, `islandHit(id)` / `rocketHit()` → screen `{x, y (centre), w, h}`,
`islandById(id)` (alias `itemById`), `tokenSize(island)`.
Fields: `layout, hudKeep, state, phase, level, levels, topic, weather, round, roundsPerLevel, hop, hops, misses, hopMisses, stars,
levelStars, roundStars, talk, talkAnswered, alpha, time, stateTime, phaseTime, wind, surprise, islands (alias items), rocket,
wagon, aim, trail, flyers, camY, _pcamY, bim, shooting, boostT, boostSpeed, cloudBankY, collected, interactive, lastTopics`.
Statics: `RR.World.logicalSize(cssW, cssH)`, `RR.World.computeLayout(W, H, ins, cfg, age)`, `RR.World.thrust(u, a, d)`.

### States and phases
`menu → intro (2.5 s) → round → roundDone → … → talk → levelDone → intro (next chapter) … → sessionDone`.
- `round` phases: `appear → ask → ignite → fly → land → climb → appear …`; after the last hop's climb → `roundDone`.
- `roundDone` phases (**deviation: the boost lives in state `roundDone`, not `round`**): `stars` (1.2 s: the wagon's items burst
  into the round's stars) → `boostReady` (tap anywhere, or auto after 5 s) → `boost` → (`boostEnd`, 0.25 s settle) → next round
  (`round`) or Talk time (`talk`). Every round, including a chapter's last, ends with a boost.

## 3. Layout (`setViewport`, DESIGN §2)
| key | rule |
|---|---|
| `portrait`, `tall` | H > W; H/W > 1.6 → `scale` 1.2 (else 1) |
| `bubble` | landscape `x = ins.left+24, y = ins.top+20, h = 122, w = min(640, W − x − ins.right − 440)`; portrait `y = ins.top + 96 + 24, h = 124, w = W − x − ins.right − 24` |
| `hud` | `x = W − ins.right − 160, y = 0, w = 160 + ins.right, h = ins.top + 96` |
| `padY` | `H − ins.bottom − 118` (landscape) / `− 150` (portrait): screen y of the pad surface |
| `rowY` | landscape `max(bubbleBottom + 175, 0.42·H)` (317 at 720); portrait `min(0.47·H, padY − 0.30·H)` |
| `islandW` | 200 (age ≤ 4), 180 (5+), × scale; `islandH` = 0.55·w (planet 0.8·w); `tokenSize` = 0.5·w |
| `field` | `{x0: ins.left + 0.6·islandW, x1: W − ins.right − 0.6·islandW}` (island centres) |
| `rocket` | `{h: 190·scale, w: h·2/3}`; `wagon {w: 0.6·rocket.h, h: w·110/160}` |
| `boost` | `{x, y, r: 78}` = the rocket's screen centre, updated every step |

**Row placement** (`_placeRow`, deterministic from the row seed): if `(n−1)·(islandW+28)` fits in the field → one row, the slack
split at random between the n+1 gaps (6 tries, fewest islands over the rocket wins), y = rowY ± 26. Else (portrait, 4 islands)
**zig-zag**: even x spacing across the field, rows ±A with `A = max(70, √(minD² − dx²)/2 + 1)`. Keep-outs: an island whose
x is within `islandW/2 + rocket.w/2 + 10` of the rocket is lifted so its body stays 14 px above the rocket's nose
(`y ≤ padY − rocket.h − islandH − 14`); every token box (+8 px) is pushed below `bubble`, `hud` and `w.hudKeep` (read
directly; no setViewport needed). In zig-zag rows the whole row shifts together (never breaking the min distance). Tokens are
assigned to slots by a fixed shuffle; the answer is **never straight above the rocket two hops in a row**.

**Hit test**: island = body ellipse (`w/2+24`, `h/2+24` around the body centre; planet: circle) ∪ token box + 24; the nearest
candidate wins. Rocket = its box (+30 px only where no island is hit; the unpadded body always wins). The pad island → `tapPad`.

**Rotation / resize mid-play** (`_relayout`): every object is mapped screen-relative (camY unchanged): x linearly from the old
field to the new one, y piecewise through `0 → 0, rowY → rowY', padY → padY', H → H'`. The current row is re-placed from its
seed (same slots, same answer), a flight is re-aimed (start point mapped, end = the island's new spot, same progress), a boost
keeps its x and lands on its (mapped) pad, the wagon is clamped on screen.

## 4. CONFIG (tuned values; DESIGN value in brackets where the playtest changed it)
| group | keys |
|---|---|
| flow | `step 1/120`, `roundsPerLevel 4`, `chapterTimeLimit 72` [80], `chapterMinRounds 3`, `introTime 2.5`, `roundDoneTime 1.2`, `autoBoost 5`, `talkAfterAnswer 1.6`, `levelDoneTime 1.8`, `talkAskTime 12`, `talkGlowAfterAsks 2` |
| content | `islandsByAge null` (= content table 3: 2,2,2,3 · 4: 2,3,3,3 · 5: 3,3,4,4 · 6–7: 3,4,4,4), `hopsPerRound [2,2,3,3]` [2,3,3,3] (count-up rounds use N) |
| surprise | `surpriseRound 2`, `surpriseTypes ['drift','shooting']` (rotates per chapter from a random start), `driftSpeed 25`, `shootingDelay [1, 2.5]`, `shootingTime 3`, `shootingR 70` |
| appear / leave | `appearTime 0.4`, `appearStagger 0.09`, `appearDrop 60`, `appearBack 1.9` (peak 1.12), `leaveTime 0.6`, `leaveDrop 90` |
| ignite / fly | `igniteTime 0.35`, `igniteCrouch 0.09`, `flyBase 0.4`, `flySpeed 1000`, `flyTime [0.6, 1.1]`, `flyApex [60,120]`, `flyApexK 0.25`, `thrustAccel 0.35`, `thrustRetro 0.3`, `retroFlame 0.3`, `rotMax 0.9`, `rotOmega 14`, `rotZeta 0.75`, `liftStretch 0.14` |
| land / climb | `landSquash 0.18`, `landTime 0.3`, `squashOmega 18`, `squashZeta 0.35`, `dipPx 14`, `dipOmega 14`, `dipZeta 0.35`, `flyerTime 0.55`, `flyerArc 90`, `flyerScale 0.45`, `climbOmega 6`, `climbAppearAt 0.4` |
| trail | `trailStep 12`, `trailMax 140`, `trailFade 1.6` |
| wrong / help | `wobbleAmp 0.12`, `wobbleTime 0.6`, `wobbleWiggles 2.5`, `wrongHop 12`, `hopG 2200`, `hintAfterMisses 2`, `hintCooldown 6`, `hintGlowTime 4`, `hintBob 6`, `hintBobHz 1.6`, `idleTime 12`, `idleBackoff 1.5`, `idleMax 30`, `idleHintFrom 2`, `tapMove 24`, `tapTime 0.35` |
| boost | `boostIgnite 0.25`, `boostRise 1.4`, `boostDecel 0.5`, `boostDistH 1.5` (× H), `boostAccel 0.3`, `boostCamOmega 10`, `boostSettle 0.25`, `readyBounceHz 1.4`, `readyBouncePx 10` |
| wagon | `ropeN 6`, `ropeLen 0.55` (× rocket.h), `wagonW 0.6`, `wagonG 700`, `wagonDrag 1.2`, `wagonOmega 7`, `wagonZeta 0.55`, `ropeIters 6`, `ropeDamp 0.985`, `wagonSink 10` |
| layout | `padLand 118`, `padPort 150`, `rowBelowBubble 175`, `rowFracLand 0.42`, `rowFracPort 0.47`, `rowMinFromPad 0.30`, `islandW {3:200,4:200,5:180,6:180,7:180}`, `islandAspect 0.55`, `planetFrac 0.8`, `tokenFrac 0.5`, `islandGap 28`, `rowJitter 26`, `zigzag 70`, `rocketGap 14`, `keepMargin 8`, `hitPad 24`, `rocketHitPad 30`, `rocketH 190`, `boostR 78`, `tallScale 1.2` |

## 5. Motion (all springs semi-implicit Euler at 1/120 s)
- **Appear**: per island after `k·0.09 s`: `scale = backOut(u, 1.9)` (0 → 1.12 → 1), `y −= 60·(1−u)²`, `alpha = min(1, 2.5u)`,
  `u = t/0.4`. Idle islands breathe ±2 px. **Leave**: `y += 90·v²`, `scale 1 − 0.3v`, `alpha 1 − v` (0.6 s) → removed.
- **Ignite** (0.35 s): `flame = smooth(u)`, `shake = u`, squash target crouch 0.09 (sy 0.91). Liftoff: stretch kick
  `q = −0.14` (sy 1.14) and the pad gets a 60 px/s push.
- **Flight curve**: cubic Bézier P0 (rocket base) → P3 (island surface centre). In the line frame (e along it, n ⊥ pointing
  up; near-vertical flights point n toward the screen centre) `C1 = P0 + 0.3·d·e + k·n`, `C2 = P0 + 0.7·d·e + k·n` with
  `k = apex/0.75`, `apex = clamp(0.25·d, 60, 120)` → the mid-curve sits `apex` off the straight line; control points are
  clamped inside the screen (convex hull ⇒ the whole curve stays on screen). Arc-length table (32 samples); re-aimed every
  step if the target moves (drift, dip).
- **Thrust speed profile** `s(u)` (`World.thrust`): velocity ramps up for 35 % of `T`, cruises, ramps down for the last 30 %
  ("retro"): `v = 1/(1 − a/2 − d/2)`; `s = v·u²/2a` / `v·(a/2 + u − a)` / `1 − v·(1−u)²/2d`. `T = clamp(0.4 + L/1000, 0.6, 1.1)`.
- **Heading**: target `clamp(atan2(tx, −ty), ±0.9)·(1 − retro)` (`retro = smooth` over the last 30 %: it lands upright),
  spring ω 14, ζ 0.75 → banking with a little lag. Flame `1 → 0.3` during retro, then → 0 on the pad.
- **Landing**: squash spring (ω 18, ζ 0.35) kicked to `q = 0.18` → `sy` 0.82 → overshoot 1.05–1.06 → 1, `sx = 1 + 0.6q`.
  The island dips on a spring (ω 14, ζ 0.35) with an initial velocity `v0 = dip·ω·exp(ζ/√(1−ζ²)·atan2(√(1−ζ²), ζ))` so the
  first dip peaks at 14 px, then rebounds.
- **Flyer**: quadratic Bézier from the token to the wagon basket (tracked live), control `flyerArc` 90 px above, smooth-step
  0.55 s, spin decays, scale 1 → 0.45 → `collect`; the wagon gets a +120 px/s bob.
- **Climb**: critically damped camera spring ω 6 toward `pad.y − padY` (95 % in ≈ 0.8 s); the next row spawns at 40 % of
  the climb (placed for the target camera, so it puffs in from above while the camera arrives).
- **Wrong**: wobble `rot = 0.12·sin(2π·2.5u)·(1−u)²` + squash `0.08·sin(2π·5u)·(1−u)²` over 0.6 s; the rocket does a
  parabolic 12 px hop (g 2200, 0.21 s) with a small landing squash; Bim `oops`.
- **Hint**: `glow` eases to 1 (rate 6/s) for 4 s, bob `6·glow·sin(2π·1.6t)` px.
- **boostReady**: the rocket bounces 10 px at 1.4 Hz with a squash on every contact; `glow` → 1.
- **Boost**: ignite 0.25 s (shake, crouch), then straight up `D = 1.5·H` with the thrust profile (accelerate 30 %,
  decelerate the last 0.5 s of 1.9 s), `boostT` 0..1, `boostSpeed` 0..1 (speed lines), `cloudBankY` = world y of the cloud
  bank (start − D/2, null after). Camera spring ω 10 follows `rocket.y − padY`. A fresh pad island puffs in under the rocket
  just before touchdown; landing squash + dip; `boostEnd`; 0.25 s settle.
- **Wagon**: hitch point as a particle. Resting: damped spring (ω 7, ζ 0.55) to its spot beside the rocket (trailing side,
  flipped away from screen edges) sitting 10 px into the pad. Towed (ignite/fly/boost): gravity 700 px/s², drag, max-length
  tether `0.55·rocket.h` from the tow hook that also pulls it along with the rocket. Tilt spring toward the rope pull
  (≤ 0.5 rad). Rope: 6-point Verlet chain pinned at hook and hitch, gravity 900, damping 0.985, 6 pull-only iterations.
- **Trail**: a point at the nozzle every 12 px during fly / boost, `a` fades 1 → 0 in 1.6 s, ≤ 140 points.

## 6. Events (`drainEvents()`)
| event | fields |
|---|---|
| `session` | `levels` |
| `level` | `level, topic` |
| `round` | `round, topic, hops, surprise` |
| `appear` | `id` (each island as it starts to puff in, also a boost's new pad) |
| `ask` | `hop, hops, promptKey, params, answerId` |
| `go` | `id, nameKind, nameValue, token` |
| `ignite` / `liftoff` / `land` | `id` (the target island) |
| `collect` | `id, token, n` (items now in the wagon), `hop` |
| `climb` | – |
| `wrong` | `id, nameKind, nameValue, token, want: {kind, value, animal?}, streak, misses` (this hop), `promptKey, params` |
| `hint` | `id`, `idle: true` when from an idle nudge |
| `idle` | `n, promptKey, params` |
| `pokeBim` | `promptKey, params` · `tapPad` `id` |
| `roundDone` | `round, stars, misses` |
| `boostReady` | – · `boost` `auto` · `boostEnd` – |
| `shooting` | – · `shootingTap` `x, y` (SCREEN px) |
| `talk` | `talk` · `talkAsk` `talk, n, glowAnswer` · `talkResult` `correct, choiceId, answerId` |
| `levelDone` | `level, stars` · `sessionDone` `stars, items` |

## 7. Content (`RR.Content`)
`makeRound(topic, {age, lang, rng, roundIndex, surprise, islandsByAge?, hopsPerRound?, islands?, hops?})` →
`{topic, age, lang, roundIndex, surprise, seed, hops:[{promptKey, params, answer, tokens}]}`; `validate(round)` re-derives the
answer of every hop from `promptKey/params` alone (`matches(hop, token, lang)`): exactly one token matches, tokens are distinct,
no answer twice in a row, colour-blind rule, count-up sequence. Token kinds and params: see the header of `content.js`.
Notable rules: colours below age 5 come from the 6 clash-free 3-colour sets (no pink); shapes ≤ 4 each gem its own colour;
count-up rounds 0–1 (N = 2,3 / 3,4 / 4,5) use `number` tokens with `showStars: true`; stars rounds at age ≤ 4 keep distractors
≥ 2 from the answer when possible; animals ask by sound in about half the hops from round 3 at age ≥ 4; `size` tokens are the
same animal big (1) / small (0.6) + another animal; `initial` uses the 8 animals (`RR.WORDS`, vi skips "chó", en skips "sheep").
`makeTalk` keeps Dee's talk shape (`show` is now a token: kinds color / shape / stars / number / animal / size / letter / text).
`topicsFor(age, rng, last)` rotates chapter topics between sessions from `RR.AGE_POOLS` (5 per age).

## 8. Weather (`RR.Weather`, DESIGN §5.3)
Times of day 0 morning, 1 noon, 2 sunset, 3 night; `setWeather(i)` crossfades sky colours and numbers over 2.5 s.
`update(dt, {camDY})` (camDY = camY − last camY): particles move down by `−camDY·0.6·par`, background clouds by `−camDY·par`
(layers 0.15 / 0.35 / 0.6, wrapping vertically), night stars by 0.05. Morning dust motes + sparkles, noon rainbow glints, sunset
glowing embers, night twinkling stars + a falling-star streak every 6.5–9.5 s. Hard cap 120 (ambient ≤ 80). `burst(x, y,
{kind:'confetti'|'puff'|'sparkle'|'stars'})` in screen px.

## 9. Playtest results (`node tests/sim/playtest.js`, 2 500 sessions: 100 per age × driver, en/vi, 4 viewports, step 1/120)
Drivers: `bot0.5 / bot0.8 / bot1` (RR.Bot: think 1.0–2.4 s, 30 % drags), `typical` (per-age child: skill 0.6/0.7/0.8/0.85/0.9,
think 2–3.5 / 1.5–3 / 1.3–2.6 / 1.1–2.2 / 1–2 s from the ask, retry 1–2 s, 8 % distracted 4–12 s at ≤ 4, follows a hint 85 %,
taps the boost after 0.8–3 s 85 % of the time), `tapper` (random taps anywhere every 0.3–1.5 s).

| age | driver | chapter mean / p90 (s) | session mean / max (s) | hints / hop | wrong / hop | ★★★ / ★★ / ★ % | cut to 3 rounds |
|---|---|---|---|---|---|---|---|
| 3 | typical | 94.7 / 106 | 386 / 439 | 0.03 | 0.43 | 29 / 43 / 28 | 33 % |
| 4 | typical | **92.4** / 102 | 377 / 421 | 0.07 | 0.36 | 42 / 32 / 26 | 33 % |
| 5 | typical | 89.3 / 98 | 365 / 402 | 0.04 | 0.25 | 54 / 30 / 17 | 23 % |
| 6 | typical | 85.2 / 94 | 348 / 380 | 0.02 | 0.18 | 63 / 27 / 10 | 20 % |
| 7 | typical | 84.0 / 93 | 343 / 380 | 0.01 | 0.11 | 74 / 21 / 5 | 23 % |
| 4 | bot0.5 / 0.8 / 1 | 81.7 / 77.4 / 74.2 | 334 / 317 / 304 | 0.19 / 0.03 / 0 | 0.70 / 0.24 / 0 | 17·28·55 / 54·32·14 / 100·0·0 | 7 / 0 / 0 % |
| 3–7 | tapper | 157–200 | 634–809 (max 1489) | 0.4–1.2 | 1.1–2.7 | mostly ★ | ≈ 100 % |

Verdict: PASS typical 4-year-old chapter 92.4 s (target 60–100); PASS typical sessions ≤ 8 min (max 439 s); PASS 2 500/2 500
sessions finished (the random tapper too: any tap in boostReady boosts, random taps eventually hit the answer, hints glow);
PASS no stuck state / NaN. `determinism.js`: 10/10 cases identical on rerun and on replay at 1/120 and 1/60 frames.

**Tuning log** (typical 4-year-old chapter mean): DESIGN timings 101.5 s with 40 % of chapters cut to 3 rounds by the 80 s
limit (ask 38 s, fly 9.7, boost 9.3, boostReady 8.6, climb 6.6, talk 6.5, appear 6.3, stars 5.5 per chapter). Trimmed
animation/transition times (roundDone 1.5 → 1.2, boost decel 0.6 → 0.5, ignite 0.3 → 0.25, land 0.35 → 0.3, row appears at
40 % of the climb instead of 60 %, appear 0.45 → 0.4, flight 0.45 + d/900 → 0.4 + L/1000, levelDone 2 → 1.8, talk hold
2 → 1.6): 99.3 s. Limit 70 s alone: 89 s but 60 % of chapters lose a round; hops 2,2,3,3 + limit 72 s: **92 s with 2/3 of
chapters complete** → chosen.

## 10. QA round 1 fixes (functional / visual / high-speed playtest reports)
| change | where | why |
|---|---|---|
| **Tap lock**: after a wrong island, island taps and drag releases are ignored for `wrongLock` 0.8 s (`wrongLock2` 1.6 s from the 2nd miss of a hop) → event `locked {id}` (no miss, no idle reset); `pointerDown/Up` return `'locked'` | `_answer`, `pointerDown`, `pointerUp` | playtest P1-1: spamming cleared hops in 0.4 s |
| **Drag snap**: a moved drag released on no island answers the nearest row island within `dragSnap` 80 px of its hit box; otherwise event `dragMiss {}` | `pointerUp`, `_snapIsland` | playtest P1-2: near-miss drags did nothing |
| Taps on empty sky no longer reset the idle timer (only hits on an island, the rocket, the pad or the shooting star do); `idleHintFrom` 2 → 1 | `pointerDown`, `_touch` | playtest P1-3: confused tappers never got the glow |
| The 2nd miss of a hop always glows (bypasses `hintCooldown`); later misses keep the cooldown | `_answer` | playtest P2-2 |
| `resetNudges()`: idle gap/count and the Talk re-ask counter start over (main calls it on resume) | new | playtest P2-3 |
| A chapter cut by the time limit sets `roundsPerLevel = round` (HUD dots fill); `startLevel` resets it | `_afterBoost` | playtest P3-2 |
| Shooting star spawns in the open sky: below max(bubble, HUD, every `hudKeep` box) + 50, above `rowY − islandH − 40` | `_stepRound` | functional B1 |
| `hudKeep` may be one box or an array of boxes (main passes HUD and bubble separately); `layout.hudKeep` is an array or null | `keepBoxes()` | visual P1-2 |
| Rows never cover the rocket: when a keep-out pushes an island over the rocket below the nose limit, the row is re-laid out in the segments left/right of the rocket's column (straight or zig-zag per segment); zig-zag rows that still hit the rocket switch to two tiers (column islands high, the rest lower beside the rocket) | `_placeRow` | visual P1-2 |
| Zig-zag rows keep `islandW + zigzagGap` (52) between centres, so the padded hit areas never overlap | `_placeRow` | functional B3 |
| CONFIG: `chapterMinRounds` 3 → 2, `autoBoost` 5 → 4, `roundDoneTime` 1.2 → 1.0, `boostRise` 1.4 → 1.2, `shootingDelay` [1, 2.5] → [2.5, 4] | CONFIG | playtest P2-1, P3-1, P3-3 |
| Colours below age 5: red+orange added to the clashes; the answer colour is drawn uniformly first, then a clash-free row holding it (orange can only appear in 2-island rows) | `content.js` | visual P3, playtest P3-4 |
| Number badges show stars only when `token.showStars` and n ≤ 10, in ≤ 2 rows under the badge (badge drawn on top); coloured islands/planets get an outer ink ring `rgba(51,54,79,.55)` | `sky_art.js` | visual P1-1, P2-3 |

Sim after the fixes (`node tests/sim/playtest.js --fast --n 30`, 750 sessions): typical 4-year-old chapter 91.3 s (p90 100.8),
longest typical session 418 s, 750/750 finished, no stuck state. Unit tests 38/38.
