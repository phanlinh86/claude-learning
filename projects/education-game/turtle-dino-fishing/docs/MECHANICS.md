# Tibo's Dino Lake Fishing — Mechanics (`TL.CONFIG`, layout, motion, render contract, events, playtest numbers)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.5 — **where
this file and DESIGN differ, this file is what the code does.**
Tests: `node tests/unit/run.js` (25 tests, ≈ 14 s): layout on 8 viewports (the 5 required ones: 1556×720, 960×720, 720×1556,
1180×820, 820×1180, with insets) × ages 3–7 × with / without a bottom keep-out; 44 000 rounds (11 topics × ages 3–7 × 200 seeds ×
4 rounds, en / vi) checked by an independent rule checker; swimming (lane range, smooth U-turns, no lane overlap, no jumps); the
whole catch; rod bend; counting / home badge; wrong → dart; hint; soft → hint → assist; stars; lagged hit test + slide + Tibo
poke; idle backoff; resize at 7 moments of a round × 3 device pairs; chapter flow + time limit; short rounds; every critter;
15 full bot sessions (skill 1 / 0.6 / 0.2 × ages 3–7, all events carry x, y); determinism + interpolation twins (incl. rot
through the flip); weather; bot; QA regressions (resize every 0.03 s of the cast; a child who only taps Tibo). `node tests/unit/run.js <name part>` runs a subset.
Sim (report-only): `node tests/sim/hs_playtest.js [--n 40] [--ages 3,4] [--models typical,slow3,bot1,bot0.6,bot0.2] [--config '{…}']`
(exit 1 when a target is missed; numbers in §9).

## 1. Conventions
- Logical px (short side 720), seconds, radians, **y DOWN, rot > 0 clockwise** (canvas convention). Screen space = world space.
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s per call, so `?speed=N` works). At the start of
  every sub-step each moving value is copied into its `_p` twin; render `v = _v + (v − _v)·w.alpha`.
- Determinism: content, lanes / entry sides, the surprise round and the session flow come from the world's seeded `TL.RNG`;
  cosmetic randomness (fish bubbles, blinks, bob phases, critter spots, joy heights) from a second seeded generator.
- Motion = damped springs (`spring(o, k, kv, target, ω, ζ, h)`, semi-implicit Euler), first-order velocity followers
  (`v += (v* − v)(1 − e^{−k h})`), constant-deceleration braking curves (`v* = v·√(d / d_brake)`), ballistic arcs (hook, leap,
  joy jumps, frog hops) and a real pendulum (§5.4). `World.kickFor(peak, ω, ζ)` = the initial velocity whose first spring peak is
  `peak` (squash kicks). The world never needs `fish_art.js` or the DOM.

## 2. Public API (`TL.World`)
`new TL.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (no-op when nothing changed; set
`world.hudKeep = [{x,y,w,h}…]` then call it again), `setAge` / `setLang` (apply at the next `newSession`), `newSession({lastTopics})`,
`levels`, `startLevel(i)`, `update(dt)`, `drainEvents()`, `skipTalk()`, `resetNudges()`, `talkAnswer(choiceId)` → bool (false while
locked: the first `talkLock` 1 s), `talkOpen()`, `setViewScale(cssPerLogical)` / `tapMoveMax()`, `hint()` → `{member}` | null,
`prompt()` → `{promptKey, params, rule, nameKind, nameValue}` while `interactive` | null, `cancelDrag()`, `memberById(id)`,
`answer()` → `{member: targetId}` (play, not answered) | null, `mouthOf(m)` → {x, y} (where the hook attaches).
Statics: `World.logicalSize(cssW, cssH)`, `World.computeLayout(W, H, ins, cfg, age, hudKeep)`, **`World.rodTip(base, len, angle,
bend)`** (§6.2), `World.ballistic(x0, y0, x1, y1, g, apex)` → {vx, vy, T}, `World.anchorVec(kind, size, dir, sy, rot)`,
`World.kickFor`, `World.segHit`.
Fields: `layout, hudKeep, state, phase, level, topic, round, cur, roundsPerLevel, stars, levelStars, roundStars, misses, streak,
talk, talkAnswered, alpha, time, stateTime, phaseTime, interactive, target (getter: the target member), weather (= level % 4),
members, line, lilies, badge, ripples, splashes, bubbles, puffs, tibo, critter, hintHand, assistId, finger, surprise, pondFull`.
Test hooks (logical px): `memberHit(id)` → `{x, y, r}` (null when it cannot be touched), `tiboHit()` → `{x, y, w, h, cx, cy}`,
`critterHit()` → `{x, y, r, kind, i?}` or null (only while tappable, on screen, clear of the bubble / HUD), `answer()`.

**States / phases.** `menu → intro (2.5 s) → round [enter → play → cast → reel → show] → roundDone [release → joy → leave] → … →
talk → levelDone (3.6 s) → … → sessionDone`. The `roundDone` event fires at the end of `show` (stars known), the state turns
`roundDone`. `interactive` = state `round`, phase `play`, not answered. After the 4th round's leave (or ≥ 3 rounds once the chapter
passed 75 s, ≥ 2 once past 110 s) the world stays in `roundDone / leave` for `pondFullTime` 1.6 s (event `pondFull`,
`w.pondFull → 1`; still-closed lilies open in gold, `lily {auto: true}`) and then starts Talk.

**Input (one active pointer; a gesture = down … up), logical px:**
- `pointerDown(x, y)` → `'member'` (play: the gesture's FIRST contact, judged) | `'brush'` (a fish pressed outside play: it
  wiggles, `wiggle {early}`) | `'critter'` | `'tibo'` (the poke fires on release, < `tapMoveMax()` move) | `'soft'` (nothing:
  bubbles + ripple in the water, a sparkle puff in the sky) | `'early'` (enter phase, nothing under the finger) | null (not in a round).
- **Hit test**: circle at the fish body centre, `r = 0.6 × size + 22` (little fish 0.85 × 0.6 × size + 22; bubbles `0.65 × size + 22`), tested at
  the fish's **interpolated position now AND its position 0.12 s ago** (a 0.25 s position history per fish) — either counts;
  **nearest centre wins**. A critter wins only when ≥ 2 × closer (`critterK`). Fish / critters beat Tibo.
- **Slide**: a press that started on nothing and moves onto a swimming fish within `flickTime 0.25 s` is judged on that fish.
- A soft press counts as "no progress" on **release** (play only; not within 1.5 × r of a critter). **Every 2nd Tibo poke in play**
  (`pokeNoProgress`) counts as a no-progress press too.
- **Idle clock**: fish / water / sky presses restart it; **Tibo pokes and critter taps do not** (a child who only taps Tibo or the
  critter still gets the idle nudges, the hint, the assist and main's auto-pause at idle n = 5).
- **Assist** (after 6 no-progress presses, armed only after ≥ 10 s of play): the target glows, grows × 1.12, slows to 20 %, and the
  next press anywhere in `layout.band` (the water) **or on Tibo** (`assistTibo`) picks it. An assisted round gets **1★**
  (`assistMaxStars`); the 2-miss hint rules are unchanged (3 / 2 / 1★ by misses).
- While a finger is down, fish within 180 px of it ease to 35 % speed.

## 3. Layout (`computeLayout`, DESIGN §2)
| field | landscape | portrait |
|---|---|---|
| `size` (fish body height box) | ages ≤ 4: 104, 5: 96, 6+: 90; × 1.12 when tall (H/W > 1.6). Fish length `len` = 1.5 × size | same |
| `groundY` (lake bed line) | H − ins.bottom − 14 | H − ins.bottom − 26 |
| `bubble` {x, y, w, h} | y = ins.top + 18, h 134; **x = right of the show fish** (`showBox` right + 16), w = min(560 (720 phones), W − ins.right − 200 − x), ≥ 220; beside / below a measured HUD | x = ins.left + 24, y = ins.top + 110, h 124 (140 phones), full width; below a measured HUD |
| `surfaceY` | round(0.40 H) | max(bubble bottom + 0.20 H, the rest rod tip ≥ 20 px below the bubble, Tibo's hat ≥ 6 px below it, 0.30 H) |
| `tibo` {x, y (seat), h, w = 0.78 h, mouth} | x = ins.left + 110, y = surfaceY − 34, h 190 | x = ins.left + 105, y = surfaceY − 30, h 170 |
| `tiboBox` | the poke box: tibo ± w/2, h tall, + 10 pad | same |
| `rodBase` {x, y} (the grip) | **from the Tibo SVG**: seat (150, 292) → grip (205, 175) in a 300 box drawn h tall: (tibo.x + 55 h/300, tibo.y − 117 h/300) | same |
| `rodLen` | 170 | 150 |
| `rock` {x, y (bottom-centre anchor), w, h, top, x0, x1, seat} | w 300, h = w·260/320; placed so the SVG seat (150, 70) is under Tibo's seat: x = tibo.x + 10·w/320, y = tibo.y + 190·w/320 (it stands deep in the water) | w 270 |
| `tipShow`, `lineShow`, `showPt`, `showBox` | the rod in the show pose (angle −0.75, bend 0.4) → tip; the fish hangs facing Tibo, head up 0.42 rad; `showPt` = its centre: y = surfaceY − 0.5 size − 24 (line length clamped 60–160) | same |
| `swim` {x0, x1, lanes [y], ranges [{x0, x1, cx0, cx1, cap}], spacing, len, top, bottom} | x0 = rock right + 30, x1 = W − ins.right − 50; up to 3 lanes evenly from `top` = surfaceY + 0.75 size + 12 (fins clear of the lily pads) to `bottom` = min(groundY − 0.85 size, **bedTop − 10 − 0.5 size**, a bottom keep-out − 44 − 0.5 size); spacing ≥ 1.0 size, fewer lanes if needed (a 720-high landscape now has 2 lanes) | x0 = ins.left + 40, x1 = W − ins.right − 40; up to 4 lanes (5 on tall screens with spacing ≥ 1.25 size). A lane whose left end is hidden by the rock starts at rock right + 20 |
| `bedTop` | H − 138·kp: the top of the opaque sand of the lake-bed art (kp = 1 landscape, 1.15 portrait, 1.36 tall portrait); no fish body goes below bedTop − 10 | same |
| lane range | `cx0 / cx1` = the range for the fish CENTRE (whole body inside x0..x1); `cap` = how many fish fit (1–3): k fish spread over [a, 1 − a] of the range (a = 0.22 for 2, 0.06 for 3) with centre gaps ≥ 1.3 len + 8. Only when the caps cannot hold the age's biggest round (3 / 4 / 5 fish at ages 3 / 4 / 5+) does the spacing tighten, down to 0.85 size (odd screens like 720×960; never on the required devices) | same |
| `lilies[4]` {x, y}, `lilyS` | on the surface (y = surfaceY + 6), evenly from max(swim.x0, rock right + 12 + pad/2) to swim.x1 − 12 (≥ 110 px apart on every required device). **`lilyS`** = the pad scale render must use (= size/104 × 0.95, shrunk when the spacing is < pad + 16; pad ≈ 84 × lilyS px) | same |
| `bronto` {x, y (bottom), h, w} | w = h·260/300 (art anchor 130/260 of the width), x = W − ins.right − w/2 − 4 (the whole art box on screen), y = surfaceY + 0.22 h, h 220 | h 200 |
| `band` (assist) | the water: y from surfaceY to groundY, full safe width | same |
| `sky` {y0, y1} | the band for the pterosaur / fireflies: below the bubble + HUD, ≥ 40 px above the surface | same |
Also `W, H, ins, portrait, tall, phone, hud, keep[], hudKeep, safe, hitR, hitPad, len`.
Examples (age 4): **960×720** (iPad, ins top 32 / bottom 27): surfaceY 288, lanes 378 / 520 (cap 2 + 2), centre range 377–832,
bubble 448,50 312×134, showPt (354, 212), tipShow (289, 91), lilies 321 / 514 / 706 / 898, bronto x 860, rock right 269.
**1556×720** (iPhone, notch 108 / 108, bottom 38): lanes 378 / 520 (cap 3 + 3), range 485–1320, lilies 429 … 1386, bubble
556,18 692×134, showPt (462, 212). **720×1556** (iPhone portrait): surfaceY 669, size 116, 4 lanes 768 / 945 / 1123 / 1300 (the
top lane 355–593 cap 1, the others cap 2), lilies 305 / 426 / 547 / 668 (lilyS 1.06), bronto x 629, bubble 24,218 672×140,
showPt (335, 587), line 65. **1180×820**: surfaceY 328, lanes 418 / 620 (cap 3 + 3). **820×1180**: surfaceY 504, 4 lanes
594 … 959, showPt (328, 428).

## 4. `TL.CONFIG` (all tunable via `new TL.World({config})`)
| group | values |
|---|---|
| flow | step 1/120, roundsPerLevel 4, chapterTimeLimit 75 s, chapterMinRounds 3, chapterHardLimit 110 s, chapterHardMinRounds 2, shortBudget [∞, 26, 42, 56] s (a later round is short: ≤ 2 fish at ages ≤ 4, ≤ 3 from 5), introTime 2.5, levelDoneTime 3.6, pondFullTime 1.6, talkAfterAnswer 1.6, talkLock 1, talkAskTime 12, talkGlowAfterAsks 2, talkMaxAsks 3, talkGiveUp 2 |
| layout | §3 (bubble*, hud*, surface*, tibo*, tiboSvg, rockSvg, rodLen*, swim*, laneTopPad 12, laneMinK 1.0, laneSqueezeK 0.85, laneCapMax 3, bedSand 138, bedGap 10, bedKPort 1.15, bedKTall 1.36, lilyEdge 12, lilyK 0.95, lilyPadW 84, lilyGapMin 110, showLift 24, lineShow 60–160, size, tallK 1.12, lenK 1.5, littleK 0.6, bubbleD 1.25, hitK 0.6, **hitPad 22**, littleHitK 0.85, bubbleHitK 0.65, **mouth {x 0.66, y 0.04}** × size (fish facing right), hangRot 0.42, bubbleHook 0.6) |
| rod angles | rodRest −1.05, rodWindup −1.22, rodWhip −0.62, rodCast −0.85, rodReel −1.0, rodShow −0.75; bendCast 0.15, bendReel 0.8, bendShow 0.4; angle spring ω 12 ζ 0.35, bend spring ω 9 ζ 0.45; back to rest ω 10 ζ 0.25 (overshoot) |
| swimming | speed {3: 38, 4: 48, 5: 58, 6: 66, 7: 74} px/s × per fish 0.85–1.15 (bubbles × 0.7); velK 2.6 /s (turns 6), turnTime 0.35 s, brakeL 0.3 len (constant-deceleration stop before the range end / a lane neighbour closer than neighK 1.3 len), sepK 1.08 (safety push), bob ±6 px at 0.5 Hz (bubbles ±9), drift ±10 px at 0.07 Hz (× 0.6 when lanes are tight), y spring ω 2.6 ζ 0.9, pitch 0.6 × atan(vy / |vx|) ≤ 0.25 rad, rot spring ω 10 ζ 0.8, tail wag 1.1–3.2 Hz with speed; fingerR 180 → 35 %, hint 40 %, assist 20 % (slowRate 3 /s); squash spring ω 14 ζ 0.4 |
| enter | stagger 0.25 s (the fish heading farthest into the lake first), enterMin 1.2 s, speed √(cruise² + 2·380·d) ≤ 480 px/s (× W/1100 on wide screens), braking to cruise at its entry point (one fish: 30–70 % of the lane; two: 22 % / 78 % from opposite sides; three: 6 / 50 / 94 %); a fish blocked by a lane neighbour inside the range counts as in |
| wrong | dart 0.4 s at 3 × cruise away from the finger (toward the roomier side near an end), turn 0.18 s, stretch kick 0.16, 3 bubbles; sameWrongWindow 1 s |
| cast | wind-up 0.12 s, whip 0.15 s, the hook leaves at the end of the whip; flight 0.55 s ballistic: apex 90 px above the release point (never above ins.top + 14; lowered × 0.7 steps until the sampled arc clears the bubble, ≥ 24); aims at the fish's predicted stop (it brakes with k 5 /s); sink 0.35 s (sway 6 px) to the mouth |
| reel | under water: the MOUTH follows a quadratic Bézier from the bite to the exit point (θ0 = 0.45 rad right of the show tip on the surface), 0.7–1.3 s (≈ 330 px/s, accelerating), wobble 10 px; air: pendulum g 1400, damping 1.2 /s while reeling in (0.6 in show), exit swing 0.25 × the tangential velocity, |θ| ≤ 1.1; line reeled in at 150 px/s to `lineShow` (≥ 0.6 s in the air); wriggle 4.2 Hz ± 0.16 rad × wriggle (1 → 0.55 → 0.2); hanging rot spring ω 24 |
| show / release | showTime 1.4 s (count: 0.25 + n × 0.55 + 0.8 s); badge 2 s (fade 0.25); leap: ballistic g 1400 from where it hangs to lily[round], apex ≤ 150 (≥ 60) and its body under the bubble when they overlap in x, one full flip, blend out of the hang pose 0.18 s; away 0.9 s fade; lily 0.12 s after the dive, open spring ω 8 ζ 0.4 (overshoot ≈ 1.25) |
| joy / leave | the others swim up to 0.55 size under the surface during the release; joyGap 0.35 s left → right, apex 60–90 px above the surface, g 1400, one flip, small splash on re-entry; joyTail 0.5, joyMaxT 4.5; leave 620 px/s (k 4) to the nearer side (turn 0.22 s), leaveMax 1.8 s |
| help | hint after 2 misses or 3 no-progress presses (every 2nd Tibo poke in play is one: pokeNoProgress 2); assist after 6, armed after ≥ 10 s of play, assistTibo true, assistMaxStars 1; hintTime 10 s, cooldown 6 s, hand cycle 1.6 s (taps twice, follows the swimming target); idle 12 s × 1.5 up to 30 s (12, 30, 57, 87 … s), the first idle hints; any fish / water / sky touch restarts the idle count (Tibo / critter taps do not); flickTime 0.25; tap = moved < max(24 logical, 24 CSS px ÷ viewScale) |
| fx | ripple 0.9 s (r 8 → 70·k), splash 0.5 s, bubbles ≤ 40, ripples ≤ 16, splashes ≤ 10, puffs 0.6 s |
| critters | one round per chapter (round 1 or 2, seeded), kind by chapter: ptero / bronto / frog / fireflies; appear 2–4.5 s after the first ask (also during cast / reel / show); ptero r 60 (in 2.6 s Bézier from the right → dip 0.6 s skimming the surface (splash) → glide out 2.4 s; tap → loop r 55 / 1.2 s); bronto r 0.3 h (wades in 2.5 s, stays 10 s, tap → spray 1.6 s, out 2.5 s; while in the water the lane ranges end at its legs: `cx1 ≤ block − len/2`); frog r 44 (hops in 0.8 s to the first open lily (else lily 3), sits 12 s, tap → hops 0.6 s to another lily, out 0.8 s); fireflies 6 × r 40 (in 1.4 s, dance 14 s, out 1.2 s; tap → twinkle 0.9 s) |
| Tibo | moods idle talk happy cheer think oops cast reel wave; moodTime happy 1 cheer 1.4 oops 0.8 think 1.4 talk 1 wave 1.4 cast 0.7 (reel held through the reel); bounce 0.42 s; blink 2.2–5 s (0.13 s); look spring 6 /s |

## 5. Motion by phase (what each member is doing)
| phase (state) | the target | the other fish | line / rod | Tibo |
|---|---|---|---|---|
| `enter` (round) | `enter` → `swim` | `enter` → `swim`; not yet spawned ones wait off-screen (x < −0.6 len or > W + 0.6 len) | `rest` | wave |
| `play` | `swim` (glows / slows when hinted; `dart` never) | `swim` / `dart` | `rest` (hook dangles 40 px under the tip, ± 0.1 rad) | talk / think / oops |
| `cast` | `hooked` (brakes to a stop, `alert` 1 → 0 over 0.6 s) | `swim` | `rest` (wind-up) → `fly` (ballistic) → `sink` | cast |
| `reel` | `reel`: under water (mouth on the Bézier, body trails, turns to face the pull) → `splash` → above water (`above` true), hanging, turning to face Tibo (dir −1) | `swim` | `taut`; bend → 0.8, then 0.4 | reel |
| `show` | `show` (hangs, swings, wriggle 0.2; count: `count` 0..n) | `swim` | `taut` | happy |
| `release` (roundDone) | `leap` (ballistic + flip) → `dive` → `away` (under water, fading) → `gone` | `swim`, rising under the surface | `free` (springs back) → `rest` | cheer |
| `joy` | `away` / `gone` | `joy` (in the air) → `swim` | `rest` | happy |
| `leave` | `gone` | `leave` → `gone` (off-screen) | `rest` | idle |

## 6. Render contract (render.js; interpolate every `_p` twin with `w.alpha`)
### 6.1 Fish (`w.members[]`, skip `state === 'gone'` or `alpha ≤ 0`)
- Two layers: **under water** (`!m.above`) drawn after the lake bed / weed / water particles, sorted by `lane`, a `reel` fish last;
  **above water** (`m.above`: a hooked fish out of the water, the leap, joy jumps) drawn after the rod + line.
- Transform: `globalAlpha = alpha; translate(x, y) · rotate(rot) · scale(sx·scale, sy·scale)` → `TL.FishArt.drawThing(ctx, thing,
  layout.size, {t: w.time, wag, wagPhase, wriggle, glow, night: weather.ambient.night, count, blink, mouth: alert > 0.3 ? 'o' :
  'smile'})`. `(x, y)` is the BODY CENTRE. `sx` already contains the facing: `sx = dir × stretch` (dir goes 1 → 0 → −1 in a U-turn,
  so the fish visibly turns edge-on), `sy` the squash. `scale` is 1 (1.12 assisted). `thing.big === false` → FishArt draws it at
  0.6 × (the world uses the same 0.6 for the mouth / hit test). Tail: angle = `wag × 0.35 × sin(wagPhase)` (`wagPhase` advances
  1.1–3.2 Hz with speed; pass it, or `t`); `wriggle` 0..1 = whole-body S-bend on the line. `glow` 0..1 (hint pulse, assist 1,
  hooked ≈ 0.6–0.85, right flash). `count` −1 except while the spots are counted (0..n: the first `count` spots ring).
- Twins: `_px _py _prot _psx _psy _pscale _palpha` (rot stays continuous through the leap flip — lerp it directly).
- **The mouth** (where the line attaches): fish-local (0.66 size, 0.04 size) for a fish facing RIGHT, i.e. world =
  `(x, y) + R(rot)·(sx·0.66·s, sy·0.04·s)` with s = size × (0.6 if little); bubbles: their top `R(rot)·(0, −0.6 s)`.
  **FishArt must draw the mouth there** (`world.mouthOf(m)`), so the line meets it.

### 6.2 Rod, line, hook (`w.line`)
`w.line = { state 'rest'|'fly'|'sink'|'taut'|'free', tip {x,y}, hook {x,y}, slack px, bend, rodAngle, len, theta, id, _ptip, _phook,
_pslack, _pbend, _prodAngle }`.
- **Rod-tip formula** (pure, `TL.World.rodTip(base, len, angle, bend)`): `a = angle + 0.5·bend; tip = (base.x + len·cos a,
  base.y + len·sin a)`. Draw `const tip = TL.FishArt.drawRod(ctx, layout.rodBase, layout.rodLen, lerp(_prodAngle, rodAngle),
  lerp(_pbend, bend))` — drawRod must return exactly this tip (a curve whose chord turns by 0.5·bend; bend > 0 pulls the tip
  down / forward, bend < 0 is the wind-up flex). `w.line.tip` is the same value at the current sub-step.
- Line: `TL.FishArt.drawLine(ctx, tip, lerp(_phook, hook), lerp(_pslack, slack), night)`; slack 26 → 8 in flight, → 0 in the sink,
  0 when taut, 10 → 0 while free. The float shows while the hook is under / on the water (`state` fly ending, `sink`).
- Hook: `drawHook(ctx, hook.x, hook.y, s)` in `rest`, `fly`, `sink`, `free`; in `taut` the hook is in the fish's mouth (skip it or
  draw it small).
### 6.3 Lake things
- `w.lilies[4] {x, y, open 0..~1.25 (spring; _popen), color (answer colour of the caught fish, null = gold), sway rad}` →
  `drawLily(ctx, x, y, layout.lilyS, clamp(open, 0, 1.25), color, t)` (**use `layout.lilyS` as the pad scale**); pads always drawn (open 0 = closed bud). `w.pondFull` 0..1 (twins
  `_ppondFull`): sway + sparkle after the 4th lily.
- `w.badge {home, x, y, a 0..1 (_pa), id}` → `drawHomeBadge(ctx, home, r, {alpha: a})` (beside the hanging fish, 2 s).
- `w.ripples [{x, y, r, a}]` → `drawRipple`, `w.splashes [{x, y, s, u 0..1}]` → `drawSplash`, `w.bubbles [{x, y, r, a}]` →
  `drawBubbleDot` (under water, in the water layer), `w.puffs [{x, y, r, alpha}]` → `drawSparkle` (sky taps).
- `w.hintHand {x, y (fingertip), press 0..1, alpha, _px, _py}` → `drawHintHand`.
### 6.4 Tibo and critters
- `w.tibo {x, y (seat), h, w, mood, moodT, blink, look −1..1, bounce 0..1 (_pbounce)}` → `characters/tibo_<mood>.svg` (blink →
  `tibo_blink` when idle), seat anchor (150, 292) at (x, y), drawn h tall, lifted `bounce × 10 px`. The rod is drawn by code
  from `layout.rodBase` (= the grip (205, 175) of the SVG).
- `w.critter` (null when none), all with `_px _py`:
  - ptero `{x, y (centre), face −1, flap 0|1 (→ ptero_flap), state 'in'|'dip'|'glide'|'loop'|'out'}`;
  - bronto `{x, y (bottom anchor, knees in the water), h (drawn height), face, spray 0..1 (> 0.2 → bronto_spray), state 'in'|'stay'|'spray'|'out'}` — draw it after the surface front, before the rock;
  - frog `{x, y (bottom anchor on its lily), h 80, jump 0|1 (→ frog_jump), face, pad (lily index), state 'in'|'sit'|'hop'|'out'}`;
  - fireflies `{flies: [{x, y, a (alpha), tw 0..1 (twinkle burst), _px, _py}], state 'in'|'dance'|'out'}` → `characters/firefly.svg`
    at each (≈ 40 px × (1 + 0.6 tw)).

## 7. Events (`drainEvents()`; every positional event has `x, y` in logical px — all but `session, talkAsk, talkResult, levelDone, sessionDone`) and what main.js does
| event | fields | main.js (sound / voice — VOICE.md has the line keys) |
|---|---|---|
| `session` | `{levels}` | — |
| `level` | `{level, topic, weather}` | `weather.setWeather(weather)`; chapter banner; `weather.<i>` greeting |
| `round` | `{round, topic, surprise, n, short, key}` | `enter[]` line on round 0 |
| `enterSwim` | `{id}` | soft swish / water gurgle |
| `ask` | `{promptKey, params, rule, first, round, n}` (x, y = Tibo's mouth) | speak the prompt (protected), show it in the bubble |
| `right` | `{id, thing, rule, misses, lily, count?: {n}, home?}` | `sayRight` (queued after the cast swish); **dim the bubble (landscape) until the next `ask`** (§10) |
| `cast` | `{id}` (x, y = rod tip) | "swish" + reel click; `cast[]` line |
| `plop` | `{id}` (on the surface) | pitched drop; `weather.addDrops(x, y, 4)` |
| `bite` | `{id}` (at the mouth) | "nibble" (two pips); `bite[]` |
| `reel` | `{id}` | ratchet ticks until `surface` / `show` |
| `splash` | `{x, y, s, big, kind 'exit'|'dive'|'joy'|'ptero'|'frog', id?}` | noise burst (+ low thump when big); `weather.addDrops(x, y, big ? 12 : 5)` |
| `surface` | `{id}` (the fish breaks the surface; a `splash {kind:'exit'}` comes with it) | — (optional "whoosh") |
| `show` | `{id}` | "ta-da" chime |
| `count` | `{id, i (1-based), n}` (fish centre) | rising "pip" + the number (`sayCountRun`) |
| `home` | `{home, id}` (badge centre) | home line ("The crab lives in the sea.") |
| `roundDone` | `{round, stars, misses, assisted}` (assisted → 1★) | HUD star; praise (droppable) |
| `release` | `{id}` | "whee" rising sine; `release[]` ("Bye bye, little fish!") |
| `dive` | `{id}` (lily spot on the surface) | big splash (with `splash`) |
| `lily` | `{i, color, auto?}` | soft bell chord + `weather.burst(x, y, {kind:'sparkle', n: 8})`; HUD lily dot i; `lily[]` (not when auto) |
| `joy` | `{i (0-based, left → right), n, id}` | rising pentatonic note (i); small splash follows |
| `leave` | `{n}` | swish |
| `pondFull` | `{n: 4}` | `pond[]` line + stars burst over the lilies |
| `wrong` | `{id, thing, got: {nameKind, nameValue}, want: {kind, value, nameKind, promptKey, params}, streak, misses, hint?: true}` | soft "bloop-bloop" + bubble pops; `sayWrong` (kind words, then the goal) |
| `wiggle` | `{id, repeat?: true, early?: true}` | a tiny bloop (no words) |
| `soft` | `{kind 'water'|'sky'|'early'}` | a soft blip (water: bubble sound); never a mistake |
| `pokeTibo` | `{promptKey, params, rule}` (play: repeat the question) or `{busy: true}` (giggle only, never cut a line). It does not restart the idle clock; while the assist is armed a press on Tibo catches the target (`assist` + `right` instead of `pokeTibo`) | |
| `hint` | `{id, mode 'tap', want, idle?}` | `hint[]` line |
| `idle` | `{n, promptKey, params, rule}` (x, y = mouth) | `idle[]` nudge + the question; main pauses at n = 5 |
| `assistArmed` / `assist` | `{id}` / `{id, from}` | — / as `right` |
| `critter` / `critterTap` | `{kind}` / `{kind, i? (firefly), spray? {x, y} (bronto)}` | `surprise.<kind>` / `critter.<kind>` + sound (chirp, honk + spray: `weather.addDrops(spray.x, spray.y, 14)`, ribbit, twinkle) |
| `talk {talk}`, `talkAsk {n, talk, glowAnswer}`, `talkResult {correct, choiceId, answerId, auto}`, `levelDone {level, stars}`, `sessionDone {stars}` | as the sister games | |
Main also calls `weather.resize(L.W, L.H, L.surfaceY, L.groundY)` after every `setViewport` that changed the layout.

## 8. Content (`TL.Content`, DESIGN §5.1)
- **Exactly one target** per round; every other fish does NOT answer the question (`validate` + the independent checker in the
  tests). Fish per round: round 0 (each chapter's warm-up) 2; then age 3: 2, 3, 3 · 4: 3, 3, 4 · 5: 4, 4, 5 · 6+: 4, 5, 5
  (short rounds ≤ 2 at ages ≤ 4, ≤ 3 from 5).
- `thing` = `{kind 'fish'|'bubble', color?, mark?: {shape, color} | {n} | {text}, big?, animal?, home?, letter?, nameKind, nameValue}`
  (header of `content.js`). `round = {topic, age, lang, roundIndex, level, short, surprise, key, seed, members [{id 'f0'…, thing,
  target}], targetId, targetValue, promptKey, params, rule {kind, value, nameKind, a?, b?}}`.
- Prompts: `p.color {color}` (colour set per round: age 3 two colours, 4 three, 5+ four; clash-free below 5) · `p.shape {shape}`
  (neutral fish, shape marks: one mark colour ≤ 4, mixed from 5; ages ≤ 4 circle / square / triangle / star / heart; no
  confusable pair with the asked shape; warm-up = very different outlines) · `p.size {big}` (one colour; even rounds the one little
  fish among big ones, odd rounds the one big among little ones) · `p.count {n}` (spot counts all different, 1–4 at 3, 1–5 at 4,
  1–10 at 5, 1–12 from 6; warm-up gap ≥ 2; from 6 spots gap ≥ 2) · `p.animal {animal}` (bubbles, all different friends; age 3 and
  every round 0) · `p.home {home}` (ages ≥ 4 from round 1; homes 4: sea / ice / forest, 5+: + desert / savanna; exactly one member
  lives there; the others from other taught homes, preferring different homes) · `p.letter {letter}` (capitals, no look-alikes) ·
  `p.lower {letter}` (the capital asked, small letters on the fish, never I / L / i / l) · `p.initial {letter}` (bubbles; one
  friend's name starts with it — names via `TL.I18N.name(lang, 'animal', a)` when loaded, else `TL.THING_NAMES`; VI digraph
  names are never used) · `p.add {a, b}` / `p.sub {a, b}` (numbers on fish; catch the sum / difference; age 6 sums ≤ 10, 7 ≤ 20)
  · `p.oddeven {parity}`. **Goldfish is never a bubble friend** (it is a fish and a freshwater pet).
- Never the same set twice in a chapter, the asked value differs from the last round's (parity ≤ 2 in a row), asked values met in
  the chapter are avoided; the target is never in the previous round's target lane when there is another lane.
- Talk: `makeTalk` as the tea party (colour blobs for a shown fish, fish with shape marks, sized fish, numbers for a spotted fish,
  home badges for a friend (age 3: "Who is this?"), letter fish, numbers for "3+2" / "7−4", parity numbers).

## 9. Weather (`TL.Weather`, DESIGN §5.3) and bot
- `new TL.Weather({width, height, seed, surfaceY, groundY})`, `resize(W, H, surfaceY, groundY)`, `setWeather(i, {instant})` (2.5 s
  crossfade), `setParty(on)`, `update(dt)`, `addDrops(x, y, n)`, `burst(x, y, {kind: 'sparkle'|'stars'|'confetti'|'drops'|
  'bubbles'|'petals', n, color})`. `ambient` = `{skyTop, skyMid, skyBottom, waterTop, waterDeep, tint (background only), light,
  night, sunX, sunY, sunA, moonX, moonY, moonA, mist, glint, glintX, mood, moodIndex, env, envFrom, envMix, party}`. Water / sky
  hex exactly DESIGN §3. `clouds[]`, `particles[] {sprite, x, y, size, r, rot, alpha, layer 'sky'|'back'|'water'|'surface'|'front',
  kind, color, flipX?}` — sprites = the §4.3 particle files (`mist` wisps use the `mote` sprite, 60–130 px, alpha ≤ 0.3; a `drop`
  is drawn `size` tall, 16/24 as wide, rotated `rot`). Moods: morning motes + mist + glints, noon dense glints, sunset glints +
  petals settling on the water, night fireflies + twinkle stars; rising air bubbles under water in every mood. Cap 120.
- `TL.Bot(world, {skill, seed})`: `step(dt)` before `world.update(dt)`, `onEvent(e)`; waits 0.8–2.4 s × (1.3 − 0.5·skill) after
  `ask`, taps the target at its CURRENT position (± 0.3 r) with p = skill (always while hinted / assisted), else another swimming
  fish; 15 % slides from the water below; ≈ 4 % taps on empty water; Talk right with p = skill; critters p 0.6 per round; pokes
  Tibo p 0.03 per round. `stats {taps, slides, right, wrong, soft, water, talks, talkRight, critter, poke}`.

## 10. Playtest numbers (`hs_playtest.js --n 30`, 1/30 s frames, 5 viewports, en / vi; after the QA fixes)
| model | age | session min median (p90, max) | chapter s median [p10–p90] | round s (to roundDone) median (p90) | misses / round | rounds with a hint | stars 3/2/1 % | stuck |
|---|---|---|---|---|---|---|---|---|
| typical | 3 / 4 | 5.1 / 5.0 (5.3–5.5, 5.5) | 67.9 / 68.1 [62–77] | 12.1 / 11.8 (15–17) | 0.34 / 0.19 | 11 / 4 % | 75–83 / 14–16 / 3–8 | 0 |
| typical | 5 / 6 / 7 | 5.1 / 5.2 / 4.9 (≤ 5.5) | 64–68 [62–77] | 10.9–11.5 | 0.10–0.17 | 2–4 % | 86–91 / 8–12 / 1–2 | 0 |
| **slow3** (slow 3-year-old) | 3 / 4 | **6.3 / 6.5 (6.7–7.0, max 7.1)** | **83.0 / 85.7 [74–99]** | 15.5 / 17.2 (26) | 0.52 / 0.55 | 28 / 31 % | 62–65 / 22–24 / 13–14 | 0 |
| bot1 / bot0.6 / bot0.2 | 3–7 | 3.8–4.2 / 4.1–4.4 / 4.5–4.9 | 49–52 / 53–57 / 60–64 | 8.0–8.3 / 8.8–9.3 / 10.9–11.3 | 0 / 0.55 / 1.4 | 0 / 14 / 62 % | 100 / 59 / 20 % 3★ | 0 |
A typical round: enter ≈ 1.6–2.0 s + play (listening ≈ 2.6 s + thinking) + cast 1.0 s + reel ≈ 2.2 s + show 1.4 s (count + 0.55 s
per spot) → `roundDone`; then release ≈ 0.9 s + joy ≈ 0.4 s/fish + 0.5 + leave ≈ 1.2 s. 0 NaN, 0 stuck rounds, 0 fish off screen.
The defaults hit the targets (toddler chapter 60–100 s, session ≤ 8 min), so no CONFIG value was changed for pacing; the slow
toddler's long chapters are kept in range by the 75 s / 110 s chapter limits (some chapters end after 3 rounds). hitPad 22 kept
the wrong-fish rate where it was (typical age 4: 0.19 misses / round).

## 11. Integrator notes
- **Landscape: the cast line / the leap can pass behind the DOM speech bubble** (the rod tip is top-left, the bubble top-right; for
  a far-right fish the straight line from the tip to the fish crosses the bubble — no arc can avoid it). The world keeps the hook
  and the leap under the bubble when it can; main should **fade the bubble to ≈ 0.25 opacity from `right` until the next `ask`**
  (or `talk`), or show the praise line small.
- Draw the fish mouth at local (0.66 s, 0.04 s) (fish facing right) and the rod with the §6.2 formula — the tests check the world
  side; FishArt's tests should check `drawRod(...)` returns `TL.World.rodTip(...)`.
- `world.layout.bubble` is where the DOM bubble goes (it moved right of the show area in landscape).
- New layout fields for render: `layout.lilyS` (lily pad scale), `layout.bedTop` (sand top the lanes respect), `layout.bronto.w`.
- The rock is anchored by its SVG seat under Tibo's seat (`layout.rock`), so it stands deep in the water; render tints its
  underwater part (below `surfaceY`).
- Files copied from the tea party still contain words broken by the `FT → TL` rename (`ft` → `tl`): `letl` (left), `sotl` (soft),
  `litl` (lift) … in `game/css/style.css`, `main.js`, `render.js`, `i18n_voice.test.js`, `tests/e2e/*`, `tests/qa/*`, `tools/*`
  (e.g. CSS `left:` never applies). My files are clean.
