# Nini's Sea Painting — Mechanics (`SP.CONFIG`, layout, motion, render contract, events, playtest tuning)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.5.
Tests: `node tests/unit/run.js` (36 tests, ≈ 60 s, ≈ 7 000 generated rounds + full sessions; `node tests/unit/run.js <name part>`
runs a subset; uses the real `game/js/pictures.js`, or `tests/unit/stub_pictures.js` when it is missing / `SP_STUB_PICTURES=1`).
Sims (report-only, `tests/sim/`): `node tests/sim/hs_playtest.js [--n 100] [--ages 3,4] [--models typical,slow3,…] [--jobs 2]
[--config '{…}'] [--tag x]` (→ `tests/sim/out/hs_<tag>.md`), `node tests/sim/determinism.js`, `node tests/sim/content_stats.js
[chapters]`; `hs_browser*.js` / `hs_voice_browser.js` drive the real page in Playwright (`?bot=1`). JSON reports are git-ignored.

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. **Screen space = world space** (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s per call, so `?speed=N` works). At the start of
  every sub-step each moving value is copied into its `_p` twin; render `v = _v + (v − _v)·w.alpha`.
- Determinism: content, surprises and the surprise round use the world's seeded `SP.RNG`; cosmetic randomness (blinks, wobble
  sign, fishy direction) a second seeded generator. Same seed + the same inputs on the same sub-steps → the same events whatever
  the frame size (`tests/sim/determinism.js`: 30 age × model sessions, replays at 1/30, 1/60, 1/120 s frames — all identical).
- Picture px (600 × 400 authoring box) → screen: `X = canvas.x + pic.x + px·s`, `Y = canvas.y + pic.y + py·s`.

## 2. Public API (`SP.World`)
`new SP.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (no-op when nothing changed; set
`world.hudKeep = [{x,y,w,h}…]` then call it again: the canvas top moves below top DOM boxes), `setAge(a)` / `setLang(l)` (apply at
the next `newSession`), `newSession({lastTopics})`, `levels`, `startLevel(i)`, `update(dt)`, `drainEvents()`, `skipTalk()`,
`resetNudges()` (after a pause), `talkAnswer(choiceId)` → bool, `hint()` → `{target:'shell'|'part', id}` | null (manual hint, e.g. a
bubble tap), `prompt()` → `{promptKey, params, mode, step, follow?}` in enter / paint (after the right shell of a colour step:
`p.tapPart`), else null. Fields: `layout, hudKeep, state, phase, level, topic, round, roundsPerLevel, step, stepInfo (the step
object), stars, levelStars, roundStars, misses, talk, talkAnswered, alpha, stateTime, phaseTime, tapMoveMin (default 64),
interactive (round + paint + the step not finished), weather (= level % 4), picture, parts, st, shells, brush, pic, nini,
hintHand, fishy, clam, splats, canvasGlow, gallery, pictures (count)`.
**Input (one active pointer; extra fingers are dropped upstream):** `pointerDown(x, y)` → `'fishy'` | `'clam'` (they react on the
press) | `'press'` | null; `pointerMove(x, y)`; `pointerUp(x, y)` → `'pick'` | `'wrong'` | `'paint'` | `'needPaint'` | `'notThis'` |
`'already'` | `'pokeNini'` | null. A **tap** = press + release within `tapTime` 1.0 s and < `tapMovePx` 64 px (max(64, tapMoveMin));
it is handled at the PRESS point. A drag or a long press paints nothing; it emits `soft` (§8) and gives what is under the press
point a tiny wobble (part 3 px, shell 4 px) — not a mistake, not a no-progress tap. While a step is interactive a press on a
shell or an UNPAINTED part goes to the picture even when the swimming fishy is over it; only a press on the water or a painted
part reaches the fishy. `cancelDrag()` (touchcancel / pause) drops the press.
`tap(x, y)` = an already-classified tap (tests / keyboard).
**Test hooks (logical px):** `partTap(id)` → `{x, y}` safe point inside the part (authored safe point when a 12 px ring around it
stays on the part, else the deepest sample point; cached per round), `shellHit(color)` → `{x, y, r}` (r = hit radius 76),
`niniHit()` → `{x, y (centre), w, h}`, `fishyHit()` → `{x, y, r}` | null (only while it can be tapped: swimming, on screen, not
under HUD / bubble), `clamHit()` → `{x, y, r}` | null, `answer()` → `{shell: colour}` | `{part: id}` | null (what to tap next),
`picToScreen(x, y)`, `screenToPic(X, Y)`. Static: `World.logicalSize(cssW, cssH)`, `World.computeLayout(W, H, ins, cfg, plan)`,
`World.kickFor`, `World.safePoint`.

### States and phases
`menu → intro (2.5 s) → round → roundDone (phase 'clear', 0.4 s) → … → talk → levelDone (1.8 s) → … → sessionDone`.
In `round`: `enter (1.1 s) → paint (steps) → finish (≥ 1.2 s) → alive (2.4 s)`. Talk time after round 4, or after round ≥ 3 once
the chapter passed 75 s. Talk re-asks every 12 s (`talkAsk {n}`), the answer glows from the 2nd re-ask, re-asks stop after 3;
12 s later Nini answers herself (`talkResult {auto: true}`, no star) so an absent child never hangs a session.

## 3. Render contract (what render.js reads; everything else is internal)
```
w.layout   W, H, ins, portrait, tall, groundY, frame (16), bubble {x,y,w,h}, hud {x,y,w,h}, keep[] (debug),
           canvas {x, y, w, h, s}  — the INNER picture box (w = 600 s, h = 400 s); drawCanvasFrame(box) draws the shell frame
                                     ≤ frame px OUTSIDE it
           palette {y, slots[{x, y, r}], hitR, n}, nini {x, y (FEET), h, w}, brush {x, y} (resting tip),
           clam null | {x, y (bottom anchor), w, h}, fishY (fishy lane)
w.picture  = round.pic (SP.Pictures.build result) — pass to PaintArt.drawPicture
w.st       partId → { color (hex | null), t 0..1 (fill, eased), _pt, ox, oy (fill origin, picture px), glow 0..1, wob (px), _pwob,
           sparkle 0..1, painted }   ← pass as `st` (lerp t / wob with alpha). Same objects as w.parts[].
w.pic      { x, y, _px, _py (screen offset of the picture box from canvas x/y), rot, _prot (rad), sx, sy, _psx, _psy, wig, _pwig
           (rad skew), alpha, _palpha } about the picture's BOTTOM-CENTRE:
             translate(C.x + x + C.w/2, C.y + y + C.h) → rotate(rot) → transform(1, 0, −tan(wig), 1, 0, 0) → scale(sx, sy)
             → translate(−C.w/2, −C.h) → scale(C.s). Identity in paint / finish. Draw UNCLIPPED (it leaves the canvas in alive).
w.shells[] { color (name), hex, x, y, r, pop 0..~1.1 (scale, easeOutBack), lift 0..~0.8 (× ≈ 18 px up; 0.35 while selected),
           wob (px, horizontal), glow 0..1 (hint), dim 0..1 (finish / alive), selected, _ppop, _plift, _pwob }
           → PaintArt.drawPaintShell(ctx, hex, r·pop, {lift, wob, glow, selected, dim})
w.brush    { color (name | null), hex, x, y (bristle TIP), angle (rad, brush drawn tip at origin + handle UP; + = clockwise;
           rest −0.5), dip 0..1 (bristle squash), state 'rest'|'fly'|'dip'|'dab', size 120, _px, _py, _pangle, _pdip }
           → PaintArt.drawBrush(ctx, hex, size, angle, {drip: dip}). In 'rest' render may snap the tip to Nini's hand point
           (docs/art/nini_hand.json) — layout.brush is the fallback.
w.splats[] { x, y, color, hex, r, t 0..1 }  → PaintArt.drawSplash(ctx, hex, r, t) at (x, y)
w.canvasGlow 0..1 (finish + the first 0.6 s of alive) → drawCanvasFrame opt.glow
w.hintHand null | { x, y (fingertip now), x0, y0 (target), t 0..1 (1.2 s cycle), press 0..1, alpha, target 'shell'|'part', id }
           → PaintArt.drawGhostHand(ctx, size, press)
w.nini     { x, y (feet), h, mood idle|talk|happy|cheer|think|oops|wave|paint|point, moodT, blink (bool), look −1..1 }
w.fishy    null | { x, y, _px, _py (centre), dir ±1 (+1 = swims / faces right), state 'swim'|'happy', t, wig, _pwig (rad tail
           wag), size (120 px wide; fishy.svg 160×120 → height 0.75 size) }
w.clam     null | { x, y (bottom-centre), w 112, h 98, open 0..1.15 (lid spring; > 0.5 → clam_open.svg + pearl), _popen, glow, taps }
w.talk     { topic, promptKey, params, show: thing | null, choices [{id, thing, value}], answer, answerId, glowAnswer }
```
`SP.Weather` (§9) gives `ambient` + `particles[]`.

## 4. Layout (`setViewport` → `w.layout`; recomputed per round: palette size n, clam)
| field | landscape | portrait |
|---|---|---|
| groundY | H − ins.bottom − 18 | H − ins.bottom − 30 |
| bubble | (ins.left+24, ins.top+18), w = min(560, W − ins.right − 200 − x), h 122 | (ins.left+24, ins.top+110), full width − 48, h 124 |
| palette row | centre y = groundY − 8 − 58; centred on the canvas, x ≥ Nini's right + 12; gap 24…40; a pearl round keeps the clam room on the right (slides the Nini + canvas group left when needed) | centre y = groundY − 14 − 58; right of Nini; same gaps |
| palette column (landscape, `landColumn`) | used when its canvas scale beats the row's by ≥ 2 % (`columnMinGain`): shells stacked at x = middle of (canvas frame right … right safe edge) (≥ frame + 24 + r, ≤ safe right − 24 − r), centred on the canvas centre y inside [HUD bottom + 8, groundY − 8], gap 24…40, planned for max(n, 4) shells; the clam stands on the sand under the column when it fits, else left of Nini (the canvas gives up 126 px of width); the canvas: top as the row, bottom = groundY − 16 − 16 | – |
| Nini | h 250, w 0.72 h, feet (group-left + w/2, groundY − 6): the group Nini + 8 + frame + canvas is centred between the side margins (24) | h ≤ 210 (206 with the 4-shell plan; min 170), at the left edge (14) beside the palette |
| canvas (inner) | s = min((paletteTop − 16 − 16 − top)/400, width/600, 1.25), top = bubble bottom + 16 + 16 | s = min(…, (W − 40 − 32)/600 ≈ 1.08), bottom = min(palette top − 20, Nini top − 10) − 16 (anchored low: the water band above it is the fishy's lane) |
| fishy lane | middle of the water band above the canvas (below the bubble and the HUD) when it is ≥ 120 px, else canvas.y + 0.13 canvas.h (over the top of the picture — the picture wins presses there, §2) | middle of the band when it is ≥ 150 px, else as landscape |
Measured (n = 3 shells + clam; row → now): 1561×720 / 1556×720 (iPhone landscape) **column**, canvas 747×498 at (431, 172)
s 0.935 → **1.245 (+33 %)**, shells x 1378 at y 218 / 374 / 530, clam (1378, 700) under them, Nini x 317 · 1556×720 notch
108/38 s 0.84 → 1.15 (+37 %) · 1280×720 0.935 → 1.245 · 1036×720 (iPad Air 1180×820, ins 18/14) column 628×419 s 0.855 →
1.047 (+22 %; with 4 shells + clam the row stays, 0.855) · 960×720 row s 0.935 (column would be 0.92; ins 32/27: 0.79) ·
720×960 / 720×1000 / 720×1556 648×432 s 1.08 (720×960 ins 32/27: 0.92).
Tests check every one of 15 viewports × 0–5 shells × clam: 3:2, inside the safe area, nothing under the HUD or bubble, Nini clear
of canvas + shells, shells ≥ 24 px apart (centre distance) and off the picture (row: below it, column: right of the frame + 24),
clam clear, the fish lane below the bubble, and every part of real rounds has a safe tap point that maps back to it; a second
test checks the column is picked on phone landscape (never a smaller canvas than the row, +25 % on 1561×720) and not on 4:3. Portrait with 4 shells has no room for the clam → that round's surprise becomes
the fishy. 5 shells (unused) only fit portrait by overlapping Nini's corner.

## 5. Motion (all integrated per 1/120 s sub-step)
- **Picture enter (1.1 s):** y offset from 0.6 H, damped spring ω 8, ζ 0.6 (≈ 2 px left at 1.1 s → snapped to 0), sway
  0.07 rad · sin(2π·0.9 t)·(1 − u)², alpha in 0.25 s; `bubbles` at the start. Shells pop in from 0.35 s, 0.1 s apart, easeOutBack
  0.35 s (`shellPop` each).
- **Brush:** flies on an arc (smoothstep along the line + apex 34 + 0.06·d px), T = clamp(0.16 + d/3500, 0.16, 0.3) s; the handle
  tilts against the velocity. At a shell: `dip` 0.24 s (14 px into the paint, colour loaded at mid-dip, event `dip`); at a part: `dab`
  0.16 s (7 px) — the fill starts and `paint` fires on contact; holds 0.12 s, flies back to Nini (rest: breathing bob 2.5 px,
  0.45 Hz). A new tap while the brush is busy fires the pending contact at once and re-routes (fast tappers never lose a paint).
- **Fill:** t = easeOutCubic(u), u over `fillTime` 0.7 s (finish sweep 0.5 s) from the tap point; `filled` at t = 1 + sparkle 1 → 0
  in 0.8 s. A right dab kicks the part wobble 2.5 px.
- **Wobbles:** part `wob` — damped spring ω 30, ζ 0.2, a wrong tap kicks a 6 px first peak (sign random); shell `wob` ω 26, ζ 0.18,
  8 px; shell `lift` spring ω 14, ζ 0.45 → 0.35 while it is the loaded colour, a pick kicks a 0.8 peak (0.25 for "again").
- **Finish:** every still-white part (sorted by cx, left → right) starts its `def` fill 0.12 s after the previous (`sweep` each);
  the brush follows the sweep (follow-spring, dabbing); duration max(1.2, (n − 1)·0.12 + 0.5 + 0.25) s, until every fill is done.
- **Alive (2.4 s: motion 2.0 s, then the empty canvas for a beat; distances: off the right edge / above the top):**
  swim — anticipation (−16 px pull-back in 0.25 s), tail beat skew 0.11 rad at 2.8 Hz with ±2.5 % squash, constant thrust
  x = ½·a·t² (exits at ≈ 1.8 s), 7 px bob, nose up 0.04 rad, `bubbles` every 0.22 s; scuttle — crouch (sy 0.9) 0.18 s, then
  sideways parabolic hops every 0.26 s (30 px high, 72 % air time) with a landing squash sy 0.88 / sx 1.09 and a ±0.05 rad tilt,
  `hop {n}` per hop; sail — rocking 0.075 rad at 0.9 Hz about the keel + 5 px bob, glide x ∝ t^2.2; bob — a 14 px buoyant dip,
  then it drifts off up-right, accelerating (x = dx·k, y = −rise·k, k ∝ t²) with a 1.6 Hz pulse (±6 % sy), 0.04 rad sway and a
  0.05 rad lean; float — x = dx·u^1.6 + a 36 px sway (fading), y = −rise·u^1.6, 0.07 rad sway at 0.55 Hz, bubbles. Both leave
  over the RIGHT edge (dx = W − canvas.x + 80); rise = clamp(canvas top − frame − bubble bottom + ¼ canvas h, 60, 0.35 dy), so
  the picture rises at most a quarter of its height above the bubble's bottom while it slides away (visual P2-1).
- **Fishy:** crosses at 150 px/s (≈ 8–10 s across), bob 10 px at 0.7 Hz, tail wag 0.2 rad; tapped → 'happy', 420 px/s and rises
  60 px; comes back once (5 s later) when nobody tapped it. **Clam:** lid spring ω 9, ζ 0.45 (overshoot ≈ 1.1), open 2.2 s per tap,
  idle glow pulse 0.35 ± 0.25.
- **Nini:** moods with timers (happy 0.9, cheer 1.6, oops 0.8, think 1.4, talk 1.0, wave 1.4, paint 0.7, point 1.2 / hint 3 s);
  blink 0.13 s every 2.2–5 s; `look` follows hint hand > fishy > flying brush > canvas centre (rate 6/s).

## 6. `SP.CONFIG` (tuned values)
| group | key = value | why |
|---|---|---|
| flow | `roundsPerLevel 4`, `chapterTimeLimit 75`, `chapterMinRounds 3`, `introTime 2.5`, `clearTime 0.4`, `levelDoneTime 1.8`, `talkAfterAnswer 1.6`, `talkAskTime 12`, `talkGlowAfterAsks 2`, `talkMaxAsks 3`, `talkGiveUp 12` | skill rules; give-up = no hung sessions |
| short rounds | `shortBudget [∞, 34, 54, 70]` | a round starting later than this many s into the chapter is "short": 1 step at ages ≤ 4, ≤ 2 from 5 (slow3 age-3 chapter 116 → 103 s, session 7.8 → 7.0 min; typical unchanged ±1 s) |
| layout | `frame 16`, `canvasGapTop 16`, `canvasGapBottom 20` (landscape 16), `shellR 58`, `shellHitPad 18`, `shellGap 24…40`, `shellDrop 14` (landscape 8), `shellsPlan 4`, `niniHLand 250`, `niniHPort 210 (min 170)`, `niniWFrac 0.72`, `clamW 112`, `clamH 98`, `clamR 66` | DESIGN §2; landscape gaps trimmed so the canvas stays ≥ 0.85 s on phones |
| touch | `hitPad 14` (picture px), `tapTime 1.0` (was 0.6), `tapMovePx 64` (was 40), `niniPad 10`, `softWob 3`, `softShellWob 4` | playtest P2-1 (re-sim D): nothing here is a drag, so a loose tap only helps (dragger −2…−3 s per chapter, max no-progress gap 51 → 30 s); a too-long press / drag still gets a soft answer (`soft`) |
| layout (landscape) | `landColumn true`, `columnMinGain 1.02`, `fishLaneBandLand 120`, `fishLaneBandPort 150` | visual P2-2: phone landscape canvas +33 % |
| brush | `brushFlyMin 0.16`, `brushFlyMax 0.3`, `brushFlyPerPx 1/3500`, `brushArc 34`, `brushArcPerPx 0.06`, `dipTime 0.24`, `dipDepth 14`, `dabTime 0.16`, `dabDepth 7`, `brushRestDelay 0.12`, `brushSize 120` | DESIGN: 0.18 s arc |
| paint | `fillTime 0.7`, `sweepFill 0.5`, `sparkleTime 0.8`, `splatTime 0.45`, `partOmega 30`, `partZeta 0.2`, `partWob 6`, `paintWob 2.5`, `pickGlow 0.55` | |
| shells | `shellPopTime 0.35`, `shellStagger 0.1`, `shellDelay 0.35`, `shellLiftOmega 14`, `shellLiftZeta 0.45`, `shellSel 0.35`, `shellWobOmega 26`, `shellWobZeta 0.18`, `shellWob 8`, `shellOutTime 0.28` | |
| phases | `enterTime 1.1`, `enterFrom 0.6`, `enterOmega 8`, `enterZeta 0.6`, `enterSway 0.07`, `askGap 0.5`, `sweepGap 0.12`, `finishMin 1.2`, `finishTail 0.25`, `aliveTime 2.4`, `aliveMove 2.0`, `aliveBubbleGap 0.22` | DESIGN §5.2 |
| help | `hintAfterMisses 2` (taps without progress in a step: wrong / needPaint / notThis / empty canvas / empty sand + water), `hintTime 3`, `hintCooldown 6`, `hintCycle 1.2`, `idleTime 12`, `idleBackoff 1.5`, `idleMax 30`, `idleHintFrom 2`, `assistAfter 6` (ages ≤ `assistMaxAge 4`), `assistAfterOld 5` (was 7) | playtest: a random tapper got stuck in 11–22 % of sessions (taps reset idle, random taps rarely land) → only real taps reset idle, 2 non-progress taps hint, 6 / 5 → the next tap (canvas, shell, sand or water) does the right thing (`assist`): 0 stuck. 7 → 5 (P1-2): tapper age 5 session 9.6 → 7.4 min, rounds > 120 s 31 → 0. Sand / water taps count (P1-3): a child who never touches the picture now finishes |
| surprises | `surpriseRounds [1, 2]`, `surpriseTypes ['fishy', 'pearl']` (rotating per chapter from a random start), `fishyAt 2.5` s into paint, `fishySpeed 150`, `fishyHappySpeed 420`, `fishyPasses 2`, `fishyGapTime 5`, `fishyR 64`, `clamOpenTime 2.2` | never the warm-up; round 3 can be cut by the time limit |

## 7. Content (`SP.Content`, DESIGN §5.1)
- `makeRound(topic, {age, lang, rng, roundIndex, surprise, prevPics, short})` → `{topic, age, lang, roundIndex, surprise, templateId,
  kind, pic, palette, steps[{mode, targets, color, need?, promptKey, params, nameKind, nameValue, role}], short, key, seed}`.
  Template capacities are probed once (`capOf`: exact slot counts the template supports); consecutive rounds never repeat a
  template. The world passes `prevPics` = every template of the session (oldest first) and `level`: `templatesFor` keeps the
  unused templates of the pool, else the least-recently-used half (never the one just played when the pool has ≥ 2). Up to 60
  attempts, each `validate`d (the last 20 without `prevPics`).
- **Easiest first** (`level` 0 = the session's first chapter): ≤ 2 steps per round up to age 5; rounds 0–1 show 2 shells at ages
  ≤ 4 and 3 shells at age 5 (colours, age-5 pickTap shapes). `validate` checks both (`paletteSize(topic, age, ri, level)`).
- Steps: warm-up 1; later 2–3 (age 3: 2; short: 1 / 2; first chapter ≤ 2 up to age 5); step colours distinct. Palettes: colours 2 / 3 / 4 (ages 3 / 4 / 5+),
  shapes at 5+ 4; others none (brush preloaded). Below age 5 palette ∪ step colours never hold blue+purple, red+green,
  yellow+orange, green+orange or pink (the safe sets have ≤ 3 colours, so age-4 palettes are 3).
- Modes: `colors` pickColor (parts template, the target glows); `shapes` 2 / 3 shapes tapPart (ages 3 / 4; circle square triangle
  star heart), 4 shapes pickTap from 5 (all 8); `size` the same animal big + small (2 steps: both); `animals` 2 / 3 / 4 animals;
  `count` N: r0 1–2, r1 2–3, later 3–5 (≤ 4) / 4–10 (5) / 5–10 (6–7: the templates hold 12 spots, N + 2 spares) with
  N + 2 spots (N + 3 when N ≤ 3); `letters` 3–4 capitals; `lower` small letters (no i / l), prompt {letter: capital, small};
  `initial` animals with distinct initials in that language (EN fish F crab C octopus O starfish S jellyfish J seahorse S whale W
  dolphin D; VI cá/cua/cá ngựa/cá voi/cá heo C, bạch tuộc B, sao biển/sứa S → VI rounds have 3 animals, one per initial);
  `add` sums 2–10 (age 7: –20; r0 ≤ 6), `sub` results 0–9 (r0 ≤ 5, a ≤ 10), labels = the results + near distractors; `oddeven`
  3 (r0) / 4–5 numbers, mode count: need = the labels of that parity (≥ 1 wrong label).
- Pictures: 12 parts, 4 shapes, 5 count, 4 scene (reef, kelp, rocks, lagoon), 4 labels (fish_bubbles, buoy_balloons, whale_spout,
  jelly_lanterns) templates. A scene's `alive` follows its animals (majority: crab → scuttle, jellyfish / seahorse → float,
  octopus / starfish → bob, others swim; ties keep the template default — rocks: scuttle, else swim).
- `validate(round)`: every target exists, has the step's role, is unique by name among its role (size: by size), painted at most
  once; count needs ≤ targets and the spot rule; oddeven targets = exactly that parity; initials distinct; arithmetic right;
  palette sizes / membership; colour-blind rule; distinct shapes / animals / labels; SP.Pictures.validate (cached per build).
- `makeTalk` → `{promptKey 'talk.<topic>', params, show, choices [{id, thing, value}], answer (= answerId)}`; things use the
  PaintArt.drawIcon kinds. colours "Which one is {color}?" (blobs) · shapes / animals / letters "Where is …" · size {size, animal}
  ('size' things) · count {n, spot:'bubble'} show dots · lower {letter, small} show the capital · initial {animal, letter} show the
  animal · add / sub {a, b} · oddeven {parity}: exactly one choice of that parity. 2 choices at age 3 (size: 2), else 3.
- `topicsFor`: the first session = `SP.AGE_TOPICS`; later the pool topic left out last time opens, then 3 of the other 4 in
  difficulty order (`SP.AGE_POOLS`: 3 colors shapes size animals count · 4 colors size shapes count animals · 5 colors shapes count
  letters animals · 6 letters lower initial add count · 7 count initial add sub oddeven).

## 8. Events (with `x, y` where an effect can be placed)
`session {levels}` · `level {level, topic, weather}` · `round {round, topic, surprise, picId, templateId, alive, palette, steps,
mode, short}` · `bubbles {x, y, n}` · `pearl {x, y}` (clam on the sand this round) · `shellPop {color, x, y}` ·
`ask {promptKey, params, mode, step, steps, first, follow?, round, color, nameKind, nameValue, need?, x?, y?}` (follow = the
`p.tapPart` line after the right shell) · `pick {color, x, y, again?}` · `whoosh {to:'shell'|'part'|'rest', x, y}` (brush flies) ·
`dip {color, x, y}` · `wrong {kind:'color', color, got:{nameKind:'color', nameValue}, want:{…}, streak, misses, x, y}` |
`{kind:'part', partId, got:{nameKind, nameValue, size?}, want:{nameKind, nameValue, partId}, streak, misses, x, y}` ·
`needPaint {color, partId, x, y}` · `notThis {kind:'part', partId, nameKind, nameValue, want, x, y}` | `{kind:'shell', color, want}`
(another shell after the right one) · `already {partId, nameKind, nameValue, x, y}` · `paint {partId, color, hex, role, nameKind,
nameValue, size?, step, count?:{i, n}, x, y}` (on brush contact) · `filled {partId, color, hex, sweep, x, y}` · `stepDone {step,
steps, last}` · `hint {target:'shell'|'part', id, color, want, x, y, idle?}` · `assist {target, id, x, y}` · `idle {n, promptKey,
params, mode, step, follow}` · `pokeNini {promptKey, params, mode, step, follow, x, y}` · `fishy {x, y, dir}` · `fishyTap {x, y,
dir}` · `pearlTap {x, y, taps}` · `soft {kind:'hold'|'drag', target:'shell'|'part'|null, color?, partId?, x, y}` (a press that
was not a tap — held > 1 s or moved ≥ 64 px; at the press point; the thing under it wobbles a little; main.js may play the soft
sound, no voice line) · `finish {n}` · `sweep {partId, hex, i, n, x, y}` · `alive {kind, x, y}` · `hop {n, x, y}`
(scuttle) · `roundDone {round, stars, misses}` · `talk {talk}` · `talkAsk {talk, n, glowAnswer}` · `talkResult {correct, choiceId,
answerId, auto}` · `levelDone {level, stars}` · `sessionDone {stars, pictures, gallery[{picId, templateId, alive, fills{partId:
hex}, stars}]}`. Stars 3 / 2 / 1 per picture for 0 / 1 / ≥ 2 `wrong` (needPaint / notThis / already never count); Talk +1.

## 9. `SP.Weather` (DESIGN §5.3)
`setWeather(i, {instant})` (0 spring, 1 summer, 2 autumn, 3 winter; 2.5 s crossfade), `resize(W, H, groundY)`, `update(dt)` (1/60 s
steps), `addSplash(x, y, color, n)` (paint dots, hex or palette name, gravity + water drag, 0.45–0.8 s), `addBubbles(x, y, n)`,
`burst(x, y, {kind: confetti|sparkle|stars|bubbles|dots, n, color})`, `setParty(on)`. `ambient {waterTop, waterBottom (exact
DESIGN §3), tint, rays (0.45 / 1 / 0.55 / 0.2), caustic (0.5 / 1 / 0.45 / 0.15), ice (0 / 0 / 0 / 1), light, mood, moodIndex,
env, envFrom, envMix, surfaceY, party}`. Particles `{type = sprite, x, y, size, r, rot, alpha, layer, kind, color, sy?, flipX?}`
(sprites `bubble petal leaf_a leaf_b snow sparkle star plankton dot confetti_a confetti_b`): always rising bubbles (pop at the
surface) + drifting plankton; spring petals along the surface (⅓ sink, turning); summer glints in the rays; autumn leaves
pendulum-falling at water-drag speed; winter snowflakes sinking slowly. Ambient ≤ 64, total ≤ 120 (oldest ambient dropped first).

## 10. Playtest — `node tests/sim/hs_playtest.js --n 200 --jobs 2 --tag final2` (6 020 sessions, 2 cores ≈ 6 min; fix round 2026-11-07)
Child models: **typical** (think 0.9–3.2 s by age + the prompt 2.4 s / follow-up 1.4 s, skill 0.72–0.92, 4–8 % curious taps on
other parts, 5 % re-taps of painted spots in counting, 2–4 % drags / long presses, finger wobble 10–18 px, tap jitter ± 10–16 px,
4–7 % look-aways of 3–9 s), **slow3** (skill 0.6, think 2.8–6 s, 15 % curious taps, 8 % drags + 8 % long presses, 15 % look-aways
of 4–12 s), **perfect**, **tapper** (random taps anywhere: 55 % canvas, 25 % around a shell, 20 % anywhere, every 0.6–1.8 s),
**spammer** (3–4 taps/s on random parts / shells, never waits), **bot0.8** (SP.Bot), **absent**.

| model | age | session min (p90) | chapter s mean [p10–p90] | cut % | round s (p90) | rounds > 120 s (max) | stars 3/2/1 % | wrong / round | rounds with a hint % |
|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 5.8 (6.1) | 84.8 [76–95] | 16 | 19.5 (27.7) | 0 (49) | 69/22/10 | 0.43 | 15.5 |
| typical | 4 | 5.8 (6.1) | 85.2 [69–98] | 7 | 19.1 (26.8) | 0 (58) | 79/16/5 | 0.27 | 10.3 |
| typical | 5 | 5.6 (5.9) | 82.2 [72–93] | 0 | 18.0 (24.8) | 0 (43) | 77/17/6 | 0.31 | 5.6 |
| typical | 6 | 5.1 (5.4) | 74.5 [68–84] | 0 | 16.1 (22.3) | 0 (37) | 87/12/2 | 0.16 | 2.8 |
| typical | 7 | 4.6 (4.8) | 67.4 [57–75] | 0 | 14.3 (17.2) | 0 (32) | 85/13/2 | 0.17 | 2.2 |
| slow3 | 3 / 4 | 6.9 (7.4) / 7.1 (7.9) | 102 / 105 | 66 / 78 | 26.8 / 29.0 | 0 / 0 (114) | 57 / 62 % 3★ | 0.67 / 0.65 | 28 / 31 |
| slow3 | 5 / 6 / 7 | 8.1 (9.0) / 7.4 / 7.1 | 120 / 109 / 105 | 94 / 84 / 78 | 35.3 / 30.6 / 28.9 | 2 / 1 / 0 (145) | 48 / 55 / 41 % 3★ | 0.86–1.16 | 34–41 |
| perfect | 3–7 | 4.0–4.6 | 59–67 | 0 | 12.8–14.8 | 0 | 100/0/0 | 0 | 0 |
| tapper | 3 / 4 | 6.5 / 6.7 | 95 / 99 | 82 / 92 | 26.9 / 29.0 | 0 / 0 | 67 / 66 % 3★ | 0.43 / 0.48 | 93 / 96 |
| tapper | 5 / 6 / 7 | **7.4 (7.9)** / 6.7 / 6.4 | 109 / 99 / 94 | 95 / 83 / 65 | 32.5 / 28.1 / 25.0 | **0 / 0 / 0** (max 104) | 47 / 58 / 41 % 3★ | 0.64–0.99 | 96 |
| spammer | 3–7 | 4.7–5.5 | 69–81 | 0–13 | 14.6–17.8 | 0 | 16–49 % 3★ | 1.0–2.9 | 50–75 |
| bot0.8 | 3–7 | 3.4–3.8 | 49–55 | 0 | 10.3–12.0 | 0 | 67–76 % 3★ | 0.30–0.46 | 5–8 |

Before this fix round (`--n 100`, base): tapper 5 / 6 / 7 sessions 9.6 / 8.5 / 7.8 min with 31 / 27 / 0 rounds > 120 s (per 200),
tapper 3 / 4 6.9 / 7.5 min; typical and perfect are unchanged within ±0.1 min; age-5 typical 5.7 → 5.6 (the easier first chapter).

Per topic (typical, mean chapter s): age 3 colours 91 · shapes 85 · size 82 · animals 82; age 4 colours 95 · shapes 87 · count 72 ·
animals 87; age 5 shapes 95 → 87 (first chapter: 3 shells in rounds 0–1, ≤ 2 steps; slow3 151 → 143 s, still the slowest chapter
— pickTap needs two taps per step) · count 76 · letters 84 · animals 83; age 6 lower 81 · initial 71 · add 72 · count 73; age 7 initial
70 · add 70 · sub 70 · odd/even 59 (one counting step per round; age 7 has no chapter target).
- **Targets met:** a typical 3–4-year-old chapter is **85 s** (target 60–100; p90 95–98), a session **5.8 min, p90 6.2** (≤ 8).
  Every model finishes every session: 0 NaN, **0 stuck states** (no progress for 200 s), 0 brush off screen. Typical / perfect /
  spammer / bot: 0 rounds > 120 s and no round with > 60 s without progress (typical max gap 27 s).
- slow3: 3 rounds > 120 s in 1 000 sessions (max 145 s), 14 rounds with a > 60 s gap (look-aways + idle nudges; max 78 s) —
  progress continues, nudges + hints fire. tapper (random taps, incl. the sand and water, which now count toward the hint and the
  assist): 0 rounds > 120 s at every age (max 104 s); the assist (6 / 5 taps) keeps them moving (0 stuck).
- Absent child: idle nudges at 12 → 18 → 27 → 30 → 30 s after the ask (15.6, 33.6, 60.6, 90.6, 120.6 s), the 2nd hints; nothing
  else happens (no fail, no auto-play).
- "2nd miss without a hint" only happens inside the 6 s cooldown (spammer: by design; typical ≤ 10 per 100 sessions).
- Fix round 2026-11-07 (QA reports): `assistAfterOld` 7 → 5, sand / water taps = no-progress taps, `tapMovePx` 40 → 64,
  `tapTime` 0.6 → 1.0, easy first chapter, session-wide template avoidance + 2 templates (labels `jelly_lanterns`, scene `lagoon`),
  scene alive from its animals, float / bob leave to the right, landscape shell column, the picture wins presses over the fishy.
- Tuning history: random tapper 11–22 % stuck sessions → idle reset only by real taps, non-progress taps hint, `assist` 6 / 7 (0 stuck,
  tapper age-3 session 14.6 → 6.9 min); `shortBudget` added (slow3 age 3 chapter 116 → 103 s, typical ±1 s); landscape palette
  gaps trimmed (canvas scale ≥ 0.79 on iPad with insets, 0.86 on iPad Air, 0.935 on iPhone landscape).
