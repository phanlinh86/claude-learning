# Kiki's Camp Chimes — Mechanics (`CC.CONFIG`, layout, motion, render contract, events, playtest numbers)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.5.
Tests: `node tests/unit/run.js` (52 tests, ≈ 19 s: DESIGN §2 boxes on 16 named viewports × 5 ages × every chime count, iPhone ≥ 100 css px hit circles, a real round of every pool
topic per viewport × age (≈ 800 layouts) + 400 fuzzed viewports with insets / measured HUD boxes, ≈ 97 000 generated rounds checked
with an independent matcher, pendulum period / damping, tap direction, judged vs brush contacts, swipes, soft / hint / assist,
counting, findAll, song + cascade, out, surprises, rotation, time limit, determinism, every topic × age completable, 50 full bot
sessions, weather; `node tests/unit/run.js <name part>` runs a subset).
Sims (report-only, `tests/sim/`): `node tests/sim/hs_playtest.js [--n 60] [--ages 3,4] [--models typical,slow3,…] [--jobs 2]
[--config '{…}'] [--tag x]` (→ `tests/sim/out/hs_<tag>.md`; exit 1 on a stuck round / stuck state / NaN / chime off screen),
`node tests/sim/content_stats.js [chapters]`; `hs_browser.js` / `hs_browser_vp.js` / `hs_voicelog.js` drive the real page in
Playwright (`?bot=1`).

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. **Screen space = world space** (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s per call, so `?speed=N` works). At the start of
  every sub-step each moving value is copied into its `_p` twin; render `v = _v + (v − _v)·w.alpha`.
- Determinism: content, the surprise round and its type use the world's seeded `CC.RNG`; cosmetic randomness (breeze, catch kicks,
  blinks, surprise details) a second seeded generator; cord lengths a generator seeded by the round. Same seed + the same inputs on
  the same sub-steps → the same events whatever the frame size.
- Motion = a damped pendulum per chime (semi-implicit Euler), damped springs (`spring(o, k, kv, target, ω, ζ, h)`), free fall, and
  closed-form parabolic arcs (`World.arc`). `World.kickFor(peak, ω, ζ)` gives the initial velocity whose first spring peak is `peak`.
- The world never needs `chime_art.js`; when `CC.ChimeArt.bodyBox(thing, size)` is loaded it uses the real `{w, h, cy}`, else an
  estimate per kind (bell 0.86 × 1, body centre 0.55 h; plate by shape: rect h 0.667, oval w 0.74 …; string w 0.45 + 0.13 n).

## 2. Public API (`CC.World`)
`new CC.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (no-op when nothing changed; set
`world.hudKeep = [{x,y,w,h}…]` then call it again), `setAge` / `setLang` (apply at the next `newSession`), `newSession({lastTopics})`,
`levels`, `startLevel(i)`, `update(dt)`, `drainEvents()`, `skipTalk()`, `resetNudges()`, `talkAnswer(choiceId)` → bool,
`hint()` → `{chime}` | `{song:true}` | null, `prompt()` → `{promptKey, params, mode, step, nameKind, nameValue, need}` in enter / play,
`cancelDrag()` (= cancel the gesture), `chimeById(id)`.
Fields: `layout, hudKeep, state, phase, level, topic, round, cur, step, stepInfo, roundsPerLevel, stars, levelStars, roundStars,
misses, talk, talkAnswered, alpha, stateTime, phaseTime, interactive, weather (= level % 4), chimes, lanterns, beam, kiki, hedgehog,
bird, fireflies, notes, hintHand, songs, assistId, finger`.

**States / phases.** `menu → intro (2.5 s) → round [enter → play] → roundDone [song → out] → … → talk → levelDone (3.6 s) → … →
sessionDone`. **During song and out the state is `roundDone`** (phase `'song'` / `'out'`), exactly like the jigsaw's alive / turn —
the 4 phases of DESIGN §5.2 are `enter` / `play` (state `round`) and `song` / `out` (state `roundDone`). Input works in both states.
`interactive` = state `round`, phase `play`, the step still open (not in the gap after a right note).

**Input (one active pointer; a gesture = down … up)** — logical px:
- `pointerDown(x, y)` → `'chime'` (first contact: struck + judged) | `'song'` (started the cascade) | `'brush'` (rang a chime outside
  the judged moment: enter, out, cascade, a chime already rung right) | `'hedgehog'` | `'bird'` | `'firefly'` | `'kiki'` (poke on
  release) | `'soft'` (nothing / the beam / the sky) | `'early'` (enter, nothing under the finger) | null. **A chime under the finger
  always wins** (then surprises, then Kiki).
- Hit test: circle at the body centre (current, swung) r = 0.6 × size + hitPad (14; on phones / tall screens hitPad grows so the
  diameter is ≥ 184 logical ≈ 100 css px, `layout.hitPad`), plus the cord (26 px capsule hook → body top); the nearest centre /
  cord line wins. Inside it, the **core** r = 0.42 × size + 8 is the visible body (cores of neighbours never overlap).
- A press on a chime pushes it AWAY from the finger: `ω += dir · kTap · ω0` (finger left of the centre → swings right; ω0 = √(g/L)).
- `pointerMove(x, y)`: the finger segment entering a chime's hit circle strikes it, impulse from the finger's horizontal speed:
  amplitude `clamp(|vx| · swipeK / L / ω0, 0.6, 1.6) × kTap`, direction = swipe direction; per chime rate-limited 0.18 s and only on
  entering the circle (a resting finger does not machine-gun).
- **Judging ("judge the core, brush the rim", `fairSwipe: true`, QA playtest P1-1)**: a press on a chime's core is judged at once
  (asked → right; another → wrong). A press on the RIM (the gap between bodies, the cord) rings it softly (brush) and defers: a tap
  (release — or touchcancel — before moving 24 px) judges that chime; a slide judges the first CORE it enters. On a slide, entering
  only a rim is a brush. After the judged contact every further contact of the gesture is a brush (never a mistake, never
  progress). Chimes already rung right are brushes and do not use up the judgement. `--config '{"fairSwipe":false}'` = the old
  rule (the first hit-circle contact is judged).
- A soft press counts as "no progress" on **release**, and only if the gesture never touched a chime (so a swipe from empty space
  into the right chime is not punished).
- A judged contact during the gap after a right note (no count running, not the last step) starts the next step at once (its `ask`)
  and is judged against it.
- **Assist** (after `assistAfter` presses without progress: 3 at ages ≤ 4, else 6): `assistArmed`, `w.assistId` = the asked chime
  (glow 1). The next press anywhere in `layout.band` — or the next first contact of a swipe — strikes the asked chime instead
  (`assist {id, from}` then `right`).
- `pointerUp(x, y)` → `'pokeKiki'` (a Kiki press that moved < 24 px, in a round) | `'up'` | null. `cancelDrag()`: the gesture ends.

**Test hooks (logical px):** `chimeHit(id)` → `{x, y, r}`, `kikiHit()` → `{x, y, w, h (top-left box), cx, cy}`, `beamHit()` →
`{x0, x1, y, r, band}`, `hedgehogHit()` / `birdHit()` / `fireflyHit()` → `{x, y, r}` | null (only while tappable and not under a
chime), `answer()` → `{chime}` | `{song:true}` | null, `_chimeMidY()` (mean body-centre y: where to swipe). Static:
`World.logicalSize(cssW, cssH)`, `World.computeLayout(W, H, ins, cfg, age, hudKeep)`, `World.hooksFor(L, n)`, `World.lanternsFor(L, n)`,
`World.bodyBox(thing, size)`, `World.kickFor`, `World.arc`, `World.segHit`.

## 3. Render contract (what render.js reads; everything else is internal)
Draw order: **sky → sun / moon / stars → clouds → far → mid → ground → back particles → fire → Kiki → posts + beam → garland +
lanterns → cords + chimes → notes → surprises → hint hand → front particles → fx**.
```
w.layout   W, H, ins, portrait, tall (H/W > 1.6), phone (long/short > 1.9), groundY, bubble {x,y,w,h}, hud {x,y,w,h},
           kiki {x, y (FEET), h, w}, kikiBox (tap box), fire {x, y (base centre on the ground), s, w, h}, fireBox,
           beam {x0, x1, y (centre line), r 15, hookY (= y + 21: where the cords start)}, posts [{x, top, bottom}] ×2,
           garland {x0, x1, y, sag 26}, lanterns [{x, y}] (this round), hooks [{x, y}] (this round), item, maxSize, cord [min, max],
           band {x,y,w,h} (the beam band: soft-vs-beam, assist presses, the song swipe), keep [bubble, hud, hudKeep…]
weather    CC.Weather (§9): ambient.skyTop/skyMid/skyBottom, sunX/sunY/sunA, moonX/moonY/moonA, stars[] × starsA, clouds[],
           ambient.tint over far / mid / ground only, particles with layer 'back' before the fire, 'front' after everything.
           main calls weather.fireAt(layout.fire.x, layout.fire.y − 30·s) after every layout change.
fire       ChimeArt.drawFire(ctx, layout.fire, {t, glow: weather.ambient.fire})
w.kiki     x, y (feet), h, w, mood idle|talk|happy|cheer|think|oops|wave|point|dance, moodT, blink (bool), look −1..1, hop 0..1 (+_phop)
           → characters/kiki_<mood>.svg (blink frame while blink), feet anchor (150, 292), lifted by hop × 18 px, flipped never
           (faces right); 'dance' alternates with 'cheer' during the cascade (the world does it).
w.beam     wob (px, vertical wobble, + _pwob) → ChimeArt.drawBeam(ctx, layout, {t, wob, night, hooks: layout.hooks.map(h => h.x)})
w.lanterns [{x, y, lit 0..1 (+_plit), color (answer key | null), swing rad (+_pswing), flash 0..1}] → ChimeArt.drawGarland(ctx,
           layout.garland, w.lanterns, {night}); (x, y) = the lantern centre on the string; it rotates by swing about its top.
w.chimes   (hook order) for each with state ≠ 'gone' and pop > 0:
             ChimeArt.drawCord(ctx, hookX, hookY, x, y, {night})          when cord > 2 (hookY already includes beam.wob)
             translate(x, y) rotate(rot) scale(pop) → ChimeArt.drawChime(ctx, thing, size, {glow, ring, dim, count, clap, night, pop})
           interpolate x, y, rot, cord, pop with _px _py _prot _pcord _ppop; ring 0..1 decays over 0.8 s (wrong: ring 0.5 and
           dull 1 → no rim flash); glow = hint pulse / right flash / assist 1; count −1 | 0..n (strings / dots light one by one).
w.notes    [{x, y (+_px _py), alpha, rot, color, lantern, note}] → ChimeArt.drawNote(ctx, x, y, 34, {color, alpha, rot})
w.hedgehog {x, y (feet on the ground line), dir −1|1 (faces left when −1: flip the RIGHT-facing art), step 0..1 (waddle phase),
           ball 0..1 (+_pball; cross-fade hedgehog.svg → hedgehog_ball.svg and squash), roll rad (+_proll; rotate the ball by it),
           sniff 0..1 (nose bob), state 'walk'|'sniff'|'ball'|'leave'} — bottom anchor (80, 116), drawn ≈ 120 px wide.
w.bird     {x, y (feet), dir −1|1 (art faces LEFT: flip when dir = 1), hop 0..1, sing 0..1 (bird_sing.svg while > 0.2), flap 0..1
           (wings while flying), state 'fly'|'perch'|'leave'} — feet anchor (60, 96), ≈ 84 px wide.
w.fireflies [{x, y (+_px _py), r 10, glow 0..1.6, state 'in'|'drift'|'zip'}] → ChimeArt.drawFirefly(ctx, x, y, r, glow)
w.hintHand {x, y (fingertip, +_px _py), press 0..1, alpha, mode 'tap'|'swipe', id} → ChimeArt.drawGhostHand(ctx, 96, press)
```

## 4. Layout (DESIGN §2) — `computeLayout(W, H, ins, cfg, age, hudKeep)`
- Bubble / HUD exactly as the jigsaw (landscape 24, 18, ≤ 560 × 134; portrait full width at ins.top + 110, h 124; a measured HUD
  narrows / pushes the bubble).
- Kiki: landscape x = ins.left + 118, h 230; portrait x = ins.left + 104, h 200 (× 1.15 = 230 on tall portrait); feet y = groundY − 4;
  tap box = w 0.62 h + 10 px pad.
- Beam: landscape x0 = ins.left + 250, x1 = W − ins.right − 36, y = max(ins.top + 210, bubble bottom + 92, measured top boxes + 92);
  portrait x0 = ins.left + 36, y = max(bubble bottom + 92, limit − 21 − cordMax − maxSize) with
  limit = min(Kiki's head − 60, fire top − 40); **tall portrait (phones)**: y = max(bubble bottom + 92, bubble bottom + 120) — the
  beam hangs high and long cords [160, 330] fill the middle (QA visual P2-1). Posts from beam.y − 70 to groundY; garland y = beam.y − 62, sag 26.
- Fire: landscape x = max(kiki.x + 150, x0 + 16 + 10 + w/2) (see §12), portrait x = W − ins.right − 120, s 0.9; y = groundY − 6;
  box `fireW 120 × fireH 130` × s (the art must fit that box).
- **The layout is sized per round** for its real chime count n (`layout.n`; between rounds maxChimes[age]); `_beginRound`
  re-lays out, so the beam / posts may shift between rounds (never mid-round except on rotation). Tiers (first that fits):
  zig-zag (portrait, n ≥ 3, cord range ≥ item + 16, item = min(cap, usable / ((n − 1) × 0.95 + 1)) when ≥ 8 px bigger than the
  row) → row item = min(cap, usable / (n × 1.3)) (if ≥ itemMin) → itemMin at 1.3 × → itemMin at 1.18 × → (odd viewports only)
  squeezed. cap = itemCap 150 on phones / tall screens, else the age's base item (112 / 112 / 112 / 104 / 104). usable =
  x1 − x0 − 32; also cordMax ≥ 50 and (landscape) a chime over the fire keeps ≥ 20 px of cord. maxSize = item × 1.25 at ages ≤ 4.
- Hooks: n chimes centred on the beam, spacing clamp(usable / n, spK × item, 1.7 × item) (zig-zag: clamp((usable − item) / (n − 1),
  0.95 × item, 1.3 × item)); hookY = beam.y + 21.
- **Zig-zag** (`layout.zig`): alternating short / long cords (start random per round); a long chime's body top is ≥ 16 px below its
  short neighbours' body bottoms, so bodies never overlap even at 0.95 × item spacing (same-row chimes are 1.9 × item apart).
- Cords: landscape [90, 150], portrait [110, 190], tall portrait [160, 330], clipped so the biggest body ends ≥ 40 px above the ground (portrait: above
  `limit`); a landscape chime over the fire stays 40 px above the fire top. Per round, from the round seed: random lengths with
  neighbours ≥ 30 px apart (a tight range alternates its ends).
- Results: iPad (both orientations) 112 for ≤ 4 chimes, 104 / 96 for 5 (ages 5 / 6–7), hit Ø 185 css px. iPhone 393×852 portrait:
  150 logical (82 css, hit Ø 113 css) for 2–3 chimes in a row and for 4 in a zig-zag, 128 (70 css, hit Ø 100 css) for 5 in a
  zig-zag; beam at bubble bottom + 120 (y 462). iPhone 852×393 landscape: 150 (82 css) for every n, beam 244.

## 5. Motion (all numbers are `CC.CONFIG`)
- **Pendulum** `θ'' = −(g/L) sin θ − damp·θ'`, g 2200 px/s², damp 1.6 /s (amplitude e^(−0.8 t): a swing is < 8 % after 3.3 s),
  L = cord + body centre offset (≈ 150–300 px → period 1.6–2.3 s). |θ| ≤ thetaMax 0.8 and never so far that the body leaves the
  screen (edge limit per chime); at the limit a soft bounce (ω × −0.3).
- **Body twist** `spin`: spring ω 10, ζ 0.25 driven by −1.4 × the pendulum's angular acceleration (lags the cord), ±0.3 max, kicked
  −dir × 0.7 rad/s on a strike. **Clapper** `clap`: spring ω 16, ζ 0.18 driven by −30 × the acceleration, kick dir × 0.8 × 16, ±1
  with a wall bounce.
- **Breeze**: every 0.4–1.2 s one hanging chime gets ω += U(−1, 1) × 0.02 × ω0 (≈ ±0.02 rad).
- **Strikes**: tap kTap 0.32 rad; swipe 0.6–1.6 × kTap (swipeK 0.35); cascade kSong 0.5; soft press nudges every chime 0.03 rad and
  wobbles the beam 2 px (spring ω 26, ζ 0.25); counting jingles 0.05 rad per bell.
- **Enter**: chime i appears at the hook at dropDelay 0.15 + i × 0.14 s (pop 0 → 1 in 0.08 s), falls on its unrolling cord with
  g 2600 (t = √(2 L / g) ≈ 0.26–0.38 s), the cord goes taut → `chimeIn` + a vertical spring (ω 14, ζ 0.45; catch speed ≤ the one
  that peaks at 40 px → a 20–40 px bounce), a small rocking kick (±0.06 rad), the beam bumps 0.8 px. The ask comes at
  max(1.2 s, last catch + 0.25 s) once every chime settled.
- **Right note**: glow flash 1 s; a note flies on a parabola (apex 90 px above the higher end) to the next lantern in 0.7 s; the
  lantern lights (rate 3 /s), flashes 0.6 s and swings (spring ω 5, ζ 0.12, kick 0.22 rad).
- **Song**: `songAsk` 0.5 s after `roundDone`; the swipe hand loops (2 s); a touch on any chime, a press anywhere
  in the beam band (from the nearest chime; QA playtest P2-5) or songWait 4 s → the cascade: every
  chime 0.16 s apart (left → right; a tap: from the touched one outwards), each lantern flashes in turn, Kiki dance / cheer;
  `songDone` 0.6 s after the last note.
- **Out**: distractors first, 0.08 s apart, each cord pulls up with an ease-in (u²) in 0.45 s, a ±0.12 rad kick (they swing up), then
  pop 1 → 0 in 0.14 s. The next round after max(0.9 s, the last one gone).
- **Hedgehog**: 70 px/s along groundY − 8 from the right, sniffs 7 s at the spot nearest the middle that is ≥ 90 px right of Kiki's
  box and ≥ fire w/2 + 80 from the fire, leaves right at 1.6 × speed. Tap: curls (0.25 s), rolls 40 px rolling without slipping
  (r 30), uncurls (0.35 s). Hit circle r 58 at y − 34.
- **Bird**: flies in on an arc (1.1 s) to the middle of the widest gap on the beam (between hooks or a post and the end hook), hops
  every 0.9–2 s (0.3 s, 14 px) within the gap, stays 7 s, leaves up-left. Tap: sings 1 s (the last note rung). Hit r 48 at y − 30.
- **Fireflies**: 5, 0.35 s apart, drift down (1.6 s) to anchors in the gaps between cords, above the chime bodies (else above the
  beam between the lanterns), wander ±18 / ±12 px, glow pulse; after 14 s or a tap they flare and zip off (0.8 s). Hit r 40.
- **Ghost hand**: tap mode (1.6 s cycle, 3.2 s long) glides in from (+70, +110), taps the moving chime twice, drifts back fading.

## 6. Rounds, help, stars
- Rounds per chapter 4; after ≥ 2 rounds (`chapterMinRounds: 2`) once the chapter passed 75 s → Talk time (`roundsPerLevel` shrinks). A round starting
  later than [–, 30, 48, 62] s into the chapter is short (2 targets).
- Stars 3 / 2 / 1 for 0 / 1 / ≥ 2 misses, **at most 2 when a note of the round was assisted** (QA playtest P2-1); +1 for a right
  Talk answer. Only wrong judged contacts are misses.
- No progress (a wrong first contact, a soft press without any chime): 2 → hint (cooldown 6 s, not while one glows), 3 (ages ≤ 4) /
  6 → assist. Idle (no finger down) 12 → 18 → 27 → 30 → 30 s (`idle {n}`), the 2nd idle also hints. Talk re-asks every 12 s, glows
  after the 2nd, Kiki answers herself 12 s after the 3rd (no star).
- The next round never opens with the answer asked last (size / odd-even: at most twice), never the same set twice in a chapter.
- Surprises: one round per chapter (round 1 or 2, never the warm-up); chapters 0–2 alternate hedgehog / bird (the first one per
  session random), chapter 3 (night) = fireflies; spawn 3–5 s after the round's first ask, but never later than
  max(2, notes × 1.8 − 1) s so a quick 2-note round sees it too; they leave at the song.

## 7. Events (every positional event carries x, y in logical px)
| event | payload | when |
|---|---|---|
| `session` | levels | newSession |
| `level` | level, topic, weather | a chapter starts (intro) |
| `round` | round, topic, surprise, chimes, lanterns, steps, mode, short, key, x, y | the chimes start to drop |
| `chimeIn` | id, i, x, y (body centre) | a cord goes taut (sound: a soft clink + its note very quietly) |
| `ask` | promptKey, params, mode, step, steps, first, round, nameKind, nameValue, need, x, y (Kiki's mouth) | a step opens |
| `ring` | id, thing, note, x, y, strength (≈ 1 tap, 0.6–1.6 swipe), judged, swipe, dull? brush? | every strike (judged: the answer ring; brush: soft) |
| `right` | id, thing, note, step, lantern, x, y, count? {n}, all? {i, n} | right after its `ring` |
| `wrong` | id, thing, got {nameKind, nameValue, kind, color, shape, n, animal, text, size}, want {nameKind, nameValue, promptKey, params}, streak, misses, x, y | right after its dull `ring` |
| `count` | id, i, n, x, y | strings / dots: bell i lights (0.5 s apart) |
| `lantern` | i, color, note, x, y | the note arrives, the lantern lights |
| `stepDone` | step, steps, last, x, y | the step's targets are all rung |
| `soft` | kind 'sky'\|'beam'\|'early', x, y | press on nothing |
| `hint` | id, mode 'tap', x, y, want, idle? | 2 no-progress / 2nd idle / hint() |
| `assistArmed` | id, x, y | the asked chime glows big |
| `assist` | id, from (chime id under the finger \| null), x, y | the assisted strike (before `right`) |
| `idle` | n, promptKey, params, mode, step | nudges |
| `pokeKiki` | promptKey, params, mode, step, x, y | Kiki tapped in a round |
| `roundDone` | round, stars, misses, x, y | all notes in → state roundDone, phase song |
| `songAsk` | x, y | 0.5 s later ("Now play our song — swipe across the chimes!") |
| `songNote` | id, i, n, note, x, y | each cascade strike |
| `songDone` | auto, x, y | 0.6 s after the last note |
| `chimesOut` | x, y | the out phase (the tune is in `w.songs`) |
| `hedgehog` / `hedgehogTap` | x, y | appears / tapped |
| `bird` / `birdTap` | x, y (perch) / note, x, y | appears / tapped |
| `fireflies` / `fireflyTap` | n, x, y / x, y | appear / tapped |
| `talk`, `talkAsk`, `talkResult`, `levelDone`, `sessionDone` | talk / talk, n, glowAnswer / correct, choiceId, answerId, auto / level, stars / stars, songs | as the jigsaw |
`w.songs[] = {level, round, topic, notes: [note index…] (climbing), colors: [answer key | null…]}`.

## 8. Content (`CC.Content`, DESIGN §5.1)
- Chimes per round (targets + distractors): warm-up 2 + 0; age 3: 2 (+1 from round 2, not in chapter 1); age 4: 3 + 1 (chapter 1:
  3 + 0); age 5: 3–4 + 1; 6+: 4 + 1; short 2 (+ the age's distractor); oddeven 2–3 + 1–2; colours below 5: ≤ 3 colours (2 + 1).
  Order = hook order (shuffled). Every step: exactly one chime not rung yet matches (validated with an independent matcher).
- Notes: the targets in step order get a climbing random set of the pentatonic CC.NOTES; distractors a free note; all distinct.
- Topics: colors (bells), shapes (plates, one colour < 5, no square+rect / circle+oval / square+diamond; age 5 `p.shapes5` mixed),
  size (age 3–4: a big 1.25 × and a small 0.75 × bell of one colour; the distractor is an animal chime — not a bell), count (strings
  1–5: warm-up 1 vs 2, round 1 ≤ 4; from round 1 the targets are the biggest strings and the distractor the smallest, so most asks
  practise 3–5 (QA playtest P2-3); dots from age 5, 1–10 / 12, no neighbours at 5), animals, letters, lower (no i / l, ≤ 1 of b d p q,
  no m+w / n+u), initial (distinct initials in the language — `CC.TOY_WORDS` + NFD rule like the jigsaw; VI drops the frog: Ê),
  add / sub / oddeven (number glyphs).
- `p.size` params `{size, color}`, `p.shapes` `{shape, color}`, `p.count` `{n, kind 'string'|'dots'}` (kind replaces the jigsaw's
  'bunch').
- Talk: pictures only for ages ≤ 5 (paint blobs, plates, `{kind:'size', big, size, color}`, animals, numerals with dots); 2 choices
  at age 3 (except glyph topics); `talk.colors {color}` shows a bell.

## 9. Weather (`CC.Weather`, DESIGN §5.3)
| mood | sky top → bottom | light | sun (x, y, A) | moonA | starsA | fire | clouds | particles |
|---|---|---|---|---|---|---|---|---|
| morning | #F7D9C4 → #FDF3E1 | 0.95 | 0.2, 0.32, 1 | 0 | 0 | 0.4 | 3 | mist ×6 (ar 2, lake band 55–80 % of ground), motes ×8, embers ×3 |
| noon | #7CC4EE → #D6F0FB | 1 | 0.62, 0.1, 1 | 0 | 0 | 0.25 | 5 | butterflies ×3, leaves ×6 (breeze), motes ×4, embers ×2 |
| sunset | #F29B6B → #FBD7A5 | 0.85 | 0.82, 0.52, 1 | 0.15 | 0.12 | 0.7 | 3 | embers ×7, golden motes ×8 |
| night | #1E2A4A → #3B4C78 | 0.55 | –, –, 0 | 1 | 1 | 1 | 2 (α 0.35) | fireflies ×9 (blink, `glow`), embers ×8 |
Crossfade 2.5 s (every ambient number + colours; `envFrom` / `envMix`). Stars: ≈ 70 × area, in the top half of the sky, `tw` twinkle.
Bursts: `stars`, `sparkle`, `notes` (sprite note, tinted), `embers`, `confetti`, `dust`, `dots`. Party: falling confetti + star
glints. Ambient cap 56, hard cap 120 (bursts push out the oldest ambient particles). Sprites = DESIGN §4.3 names exactly.

## 10. Bot (`CC.Bot`, DESIGN §5.4)
Waits 0.8–2.2 s × (1.3 − 0.5 skill) after an ask, touches the asked chime with p = skill (always with a hint / the assist), else
another chime not rung yet: a tap (± 0.3 r) or (p 0.25) a swipe that starts just outside the chime (checked to be on no chime) so the
aimed chime is the first contact. Song: a band swipe after 0.6–2 s (p 0.8) or waits for the auto cascade. Talk right with p = skill.
Taps surprises with p 0.6 per round.

## 11. Playtest (`hs_playtest.js --n 60`, 3 140 sessions, 12 models, 1/30 s frames, 5 viewports, EN / VI; after the QA fixes)
All models: **0 failed / stuck states / NaN / chimes off screen, 0 rounds > 120 s, 0 "2 wrong rings without a hint"**.
| model | age | session min (p90) | chapter s | stars 3★ % | assist rounds % | song auto % |
|---|---|---|---|---|---|---|
| typical | 3 / 4 | 6.0 (6.3) / 6.3 (6.6) | 86 / 91 | 66 / 68 | 1 | 10–12 |
| typical | 5–7 | 5.8–6.4 (≤ 6.6) | 83–92 | 72–81 | 0 | 9–11 |
| swipey (mostly swipes at the chime) | 3–7 | 5.7–6.4 | 83–92 | 63–79 | ≤ 2 | 8–12 |
| slow3 | 3 / 4 | 6.9 (7.4) / 7.0 (7.7) | 100 / 102 | 55 / 44 | 6 / 10 | 38–40 |
| beam (taps the log beam) | 3–7 | 6.3–6.8 (≤ 7.2) | 91–98 | 4–13 (was 43–69 before the 2★ cap) | 80–95 | 0 (was ≈ 48) |
| tapper | 3–7 | 6.4–6.8 (≤ 7.4) | 93–98 | 12–23 | 62–84 | 1–2 |
| swiper (strums, never aims) | 3–7 | 6.0–6.7 (≤ 7.2) | 87–97 | 22–37 | 31–48 | 0 |
| absent | all | idles at 12 → 18 → 27 → 30 → 30 s after the ask, the round waits (no auto-play in play) | | | | |
Swipe fairness (fairSwipe): clean swipes judged on the aimed chime 97–100 %, sloppy ones 88–96 %; taps 97–100 % (the rest
assisted). Surprises: 1.00 per chapter for quick bots at age 3 (was 0.42). `chapterMinRounds` = 2 keeps the slow 3-year-old ≤ 8 min
(with 3: p90 8.3 min).

## 12. Deviations from DESIGN (to note)
- **States**: song / out run in state `roundDone` (phase `song` / `out`), enter / play in state `round` (jigsaw convention).
- **Enter**: the chimes appear at their hooks (pop) and drop on their unrolling cords (free fall → spring bounce) instead of falling
  from above the top edge — nothing passes through the beam or the garland. `chimeIn` fires when the cord goes taut.
- **Fire (landscape)**: `kiki.x + 150` (= ins.left + 268) would stand in the left post (x0 = ins.left + 250), so the fire moves right
  of the post: x = max(kiki.x + 150, x0 + 26 + w/2) = ins.left + 336. The fire box is assumed 120 × 130 × s.
- **Hook spacing** uses (x1 − x0 − 2 × 16) / n (16 px clear of each post), not (x1 − x0) / n.
- **Item per round** (QA visual P1-1): the item comes from the round's chime count (not maxChimes[age]); phones / tall screens go up
  to 150 with hit circles ≥ 184 logical across; portrait rounds that would get small chimes hang in a zig-zag. `layout` (and the
  beam) is recomputed at every round start.
- **Tall portrait** (QA visual P2-1): beam at bubble bottom + 120, cords [160, 330], Kiki × 1.15.
- **Judging** (QA playtest P1-1): the core / rim rule of §2 instead of "the first hit-circle contact"; an assisted note caps the
  round at 2★; a beam-band press starts the song.
- **Extra fields / events**: `rot` (body draw rotation), `bw/bh/bcy`, `hookY`, `L`, `dull`, `assistId`, `layout.band`,
  `layout.fireBox`, `layout.kikiBox`; `layout.n / zig / hitPad`; events `assistArmed`, `soft.kind`, `ring.swipe/dull`; `p.size` / `p.shapes` also carry `color`.
- **Swing limit**: |θ| ≤ 0.8 rad and per chime never off screen (a soft bounce), so a hard swipe on the outermost portrait chime
  cannot fling it out of view.
