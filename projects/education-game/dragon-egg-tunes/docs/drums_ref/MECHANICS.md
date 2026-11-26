# Bibi's Cloud Drums — Mechanics (`CD.CONFIG`, layout, motion, render contract, events, playtest numbers)

Owner: mechanics engineer. Code: `game/js/{rng,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.4.
Tests: `node tests/unit/run.js` (55 tests, ≈ 20 s: DESIGN §2 boxes on 16 named viewports × 5 ages × every drum count + the beat
layout, a real round of every pool topic per viewport × age incl. short rounds (≈ 1 100 layouts), 400 fuzzed viewports with insets /
measured HUD boxes, iPhone ≥ 100 css px hit circles, ≈ 97 000 generated rounds checked with an independent matcher, the bounce
physics (anticipation, peak, landing squash, dent, skin, tilt, settle), strike strengths, idle bob, judging core vs rim, swipes,
soft / hint / assist, the cymbal, dots count run, **beat mode** (count / beatGap / completion / card / nudge / assist / song),
song wave + cymbal, out, surprises, rotation mid-round on 8 orientation pairs, time limit, determinism, every topic × age
completable, 60 full bot sessions, weather; `node tests/unit/run.js <name part>` runs a subset).
Sims (report-only, `tests/sim/`): `node tests/sim/hs_playtest.js [--n 60] [--ages 3,4] [--models typical,slow3,…] [--jobs 2]
[--config '{…}'] [--tag x]` (→ `tests/sim/out/hs_<tag>.md`; exit 1 on a stuck round / stuck state / NaN / a standing drum off
screen), `node tests/sim/content_stats.js [chapters]`; `hs_browser.js` / `hs_browser_vp.js` / `hs_voicelog.js` drive the real
page in Playwright (`?bot=1`).

## 1. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, `tilt > 0` clockwise (the drum top leans RIGHT). **Screen space = world
  space** (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s per call, so `?speed=N` works). At the start of
  every sub-step each moving value is copied into its `_p` twin; render `v = _v + (v − _v)·w.alpha`.
- Determinism: content, the surprise round and its type use the world's seeded `CD.RNG`; cosmetic randomness (idle wiggles,
  surprise details, blinks) a second seeded generator; pad heights and cushion bob phases generators seeded by the round. Same
  seed + the same inputs on the same sub-steps → the same events whatever the frame size.
- Motion = exact ballistic hops (`hop += v·h + ½a·h²`), damped springs (`spring(o, k, kv, target, ω, ζ, h)`), parabolic arcs
  (`World.arc`). `World.kickFor(peak, ω, ζ)` gives the initial velocity whose first spring peak is `peak`.
- The world never needs `drum_art.js`; when `CD.DrumArt.bodyBox(thing, size)` is loaded **and returns `cy < 0`** (the new
  bottom-anchor contract) it uses the real `{w, h, cy}`, else an estimate: drum / shape / dots / glyph w 1.0 h 0.86, animal w 0.9
  h 1.0, big w 1.0 h 0.95 (× size), cy = −h/2.

## 2. Public API (`CD.World`)
`new CD.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (no-op when nothing changed; set
`world.hudKeep = [{x,y,w,h}…]` then call it again), `setAge` / `setLang` (apply at the next `newSession`), `newSession({lastTopics})`,
`levels`, `startLevel(i)`, `update(dt)`, `drainEvents()`, `skipTalk()`, `resetNudges()`, `talkAnswer(choiceId)` → bool,
`hint()` → `{drum}` | `{song:true}` | null, `prompt()` → `{promptKey, params, mode, step, nameKind, nameValue, need}` in enter / play,
`cancelDrag()`, `drumById(id)`.
Fields: `layout, hudKeep, state, phase, level, topic, round, cur, step, stepInfo, roundsPerLevel, stars, levelStars, roundStars,
misses, talk, talkAnswered, alpha, stateTime, phaseTime, interactive, weather (= level % 4), drums, lanterns, card, cymbal, bibi,
lamb, bird, fireflies, notes, hintHand, songs, assistId, finger`.

**States / phases.** `menu → intro (2.5 s) → round [enter → play] → roundDone [song → out] → … → talk → levelDone (3.6 s) → … →
sessionDone`. During song and out the state is `roundDone`. `interactive` = state `round`, phase `play`, the step still open.

**Input (one active pointer; a gesture = down … up)** — logical px:
- `pointerDown(x, y)` → `'drum'` (first contact: struck + judged; beat mode: a beat) | `'song'` (started the wave) | `'brush'`
  (a drum struck outside the judged moment: enter, out, the wave, a drum already rung right) | `'lamb'` | `'bird'` | `'firefly'` |
  `'bibi'` (poke on release) | `'cymbal'` (a soft crash) | `'soft'` (nothing / the stage / the sky) | `'early'` (enter, nothing
  under the finger) | null. Priority: **drum > surprises > Bibi > cymbal > soft**.
- Hit test: circle at the body centre (current, hopped + tilted) r = 0.6 × size + hitPad (14; phones / tall screens hitPad grows
  so the diameter is ≥ 200 logical — **per drum, the small one too** (`layout.hitMin` 100) ≥ 100 css px even on a 360 px tall phone) **plus the cushion box** (`padX ± cushionW/2`, `padY … padY +
  cushionH`, + 6 px); nearest body centre wins. The **core** r = 0.42 × size + 8 is judged at once.
- Strike direction: finger left of the body centre → the drum leans right (`dir = +1`), i.e. away from the finger. A slide uses
  the finger's horizontal direction. Strength: tap 1; swipe `clamp(speed / swipeRef 900, 0.6, 1.6)`; rate-limited 0.18 s per drum.
- **Judging ("judge the core, brush the rim", `fairSwipe: true`)**: a press on a drum's core is judged at once (asked → right;
  another → wrong). A press on the RIM (gap, cushion) booms softly (brush) and defers: a tap (release / touchcancel before moving
  24 px) judges that drum; a slide judges the first CORE it enters. After the judged contact every further contact is a brush.
  Drums already rung right are brushes. In **beat mode fair judging is off**: every touch on the big drum is a beat.
- **No progress** (counts toward hint / assist, never a miss): a wrong judged contact; a soft press that never touched a drum; a
  slide that only brushed rims / drums already rung (released without a judged contact).
- A judged contact during the gap after a right note (no dots count running, not the last step) starts the next step (its `ask`).
  In beat mode the big drum is `done` during the gap, so extra beats only boom until the next ask.
- **Assist** (after 3 presses without progress at ages ≤ 4, else 6): `w.assistId` = the asked drum (glow 1); the next press in
  `layout.band` — or the next first contact of a slide — strikes the asked drum (`assist {id, from}` then `right` / a beat). An
  assisted note caps the round at 2★.

**Test hooks (logical px):** `drumHit(id)` → `{x, y, r}`, `bibiHit()` / `cymbalHit()` → `{x, y, w, h (top-left box), cx, cy}`,
`stageHit()` → `{x0, x1, y (mean cushion top), band}`, `lambHit()` / `birdHit()` / `fireflyHit()` → `{x, y, r}` | null (only while
tappable and not under a drum), `answer()` → `{drum}` (beat mode: the big drum until the count is done) | `{song:true}` | null,
`_drumMidY()`. Statics: `World.logicalSize(cssW, cssH)`, `World.computeLayout(W, H, ins, cfg, age, hudKeep, n, kMax, beat)`,
`World.padsFor(L, n, cfg, seed, sizes)`, `World.lanternsFor(L, n)`, `World.bodyBox(thing, size)`, `World.kickFor`, `World.arc`,
`World.segHit`.

## 3. Render contract (what render.js reads; everything else is internal)
Draw order: **sky → sun / moon / stars → clouds → far → mid → ground → back particles → cymbal → Bibi → garland + lanterns →
cushions → drums → card → notes → surprises → hint hand → front particles → fx**. Interpolate every field that has a `_p` twin.
```
w.layout   W, H, ins, portrait, tall (H/W > 1.6), phone (long/short > 1.9), groundY, bubble {x,y,w,h}, hud {x,y,w,h},
           bibi {x, y (FEET), h, w}, bibiBox, cymbal {x, y (stand foot on the ground), s, w 120·s, h 140·s} (the art must fit that
           box), cymbalBox, stage {x0, x1, y (mean cushion top)}, pads [{x, y (rest cushion top)}], cushion {w 1.25·item, h 0.32·item},
           garland {x0, x1, y, sag 22}, lanterns [{x, y}], item, n, zig, hitPad, beat null | {size, cardH, cardW, mode 'above'|'side'},
           band {x,y,w,h} (the drum band: soft-vs-stage, assist presses, the song press), lanternBottom, keep [bubble, hud, hudKeep…]
weather    CD.Weather (§9). main calls weather.fireAt(layout.cymbal.x, layout.cymbal.y − layout.cymbal.h) after every layout change
           (the warm glow / puffs rise from there; `ambient.fire` = warm glow strength for the cymbal rim / cottage windows).
w.cymbal   {tilt rad (+_ptilt), ring 0..1} → DrumArt.drawCymbal(ctx, layout.cymbal, {tilt, ring, night, t})
w.bibi     x, y (feet), h, w, mood idle|talk|happy|cheer|think|oops|wave|point|dance|beat, moodT, blink, look −1..1, hop 0..1 (+_phop)
           → characters/bibi_<mood>.svg, feet anchor (150, 292), lifted by hop × 18 px; 'beat' alternates with 'idle' while drumming.
w.lanterns [{x, y, lit 0..1 (+_plit), color (answer key | null), swing rad (+_pswing), flash 0..1}] → DrumArt.drawGarland(ctx,
           layout.garland, w.lanterns, {t, night}); (x, y) = the lantern centre on the string; it rotates by swing about its top.
w.drums    (pad order) for each with state ≠ 'gone':
             DrumArt.drawCushion(ctx, padX, padY, cushionW, {dent, t, night, pop: cushionPop, alpha})      when cushionPop > 0
             translate(x, y) rotate(tilt) globalAlpha × alpha → DrumArt.drawDrum(ctx, thing, size, {glow, ring, dull, sq, skin,
               skinPh, dim, night, pop, count, sing})                                                    when pop > 0
           fields: x, y (drum ANCHOR = bottom centre: padY − hop, + out sway), padX, padY (cushion top incl. bob + dent sink), size,
           cushionW, cushionH, sq (1 rest, ≈ 0.86 anticipation, ≈ 0.8 landing, ≈ 1.07 stretch), skin 0..1, skinPh rad, tilt rad,
           dent ≈ −0.35..1 (negative = the cushion springs up past rest; clamp to 0 if the art cannot puff), cushionPop 0..1
           (overshoots to ≈ 1.12 on enter), pop 0|1, alpha 0..1 (out fade), ring 0..1 (decays 0.8 s), dull 0|1, glow 0..1,
           count −1 | 0..n (dots drum: lit dots), dim; twins _px _py _ppadY _psq _ptilt _pdent _pskin _ppop _pcushionPop _palpha.
           sing = 1 while ring > 0.5 for animal drums is a render choice (not a world field).
w.card     null | {x, y (CENTRE), w, h, n, lit (dots lit so far), pop 0..1.12 (+_ppop), flash 0..1, mode 'above'|'side'} →
           DrumArt.drawCard(ctx, x, y, n, {lit, pop, flash, size: h})
w.notes    [{x, y (+_px _py), alpha, rot, color, lantern, note}] → DrumArt.drawNote(ctx, x, y, 34, {color, alpha, rot})
w.lamb     {x, y (feet on the ground line), dir −1|1 (flip the RIGHT-facing art when −1), step 0..1, ball 0..1 (+_pball;
           cross-fade lamb.svg → lamb_ball.svg + squash), roll rad (+_proll), sniff 0..1, state 'walk'|'sniff'|'ball'|'leave'} —
           bottom anchor (80, 116), drawn ≈ 120 px wide.
w.bird     {x, y (feet; on the lantern string while perched), dir −1|1 (art faces LEFT: flip when 1), hop 0..1, sing 0..1
           (bird_sing.svg while > 0.2), flap 0..1, state 'fly'|'perch'|'leave'} — feet anchor (60, 96), ≈ 84 px wide.
w.fireflies [{x, y (+_px _py), r 10, glow 0..1.6, state 'in'|'drift'|'zip'}] → DrumArt.drawFirefly(ctx, x, y, r, glow)
w.hintHand {x, y (fingertip, +_px _py), press 0..1, alpha, mode 'tap'|'swipe', id} → DrumArt.drawGhostHand(ctx, 96, press)
```

## 4. Layout (DESIGN §2) — `computeLayout(W, H, ins, cfg, age, hudKeep, n, kMax, beat)`
- Bubble / HUD as before (landscape 24, 18, ≤ 560 × 134; portrait full width at ins.top + 110, h 124; a measured HUD narrows /
  pushes the bubble). Bibi: landscape x = ins.left + 118, h 230; portrait x = ins.left + 104, h 200 (230 tall); feet y = groundY − 4.
- **Cymbal**: landscape x = bibi.x + 180 (clear of Bibi's stick), s 1; portrait x = W − ins.right − 120, s 1.1; y = groundY − 6; box 120 × 140 × s.
- **Stage**: landscape x0 = ins.left + 250, x1 = W − ins.right − 40; portrait x0 = ins.left + 36, x1 = W − ins.right − 36.
- **Garland** (no posts): x0 = ins.left + 60, x1 = W − ins.right − 60, y = max(bubble bottom, top keep boxes) + 46 (landscape) / + 84
  (portrait: the perched bird stays clear of the bubble; a very short portrait falls back to + 46), sag 22. `lanternBottom` = y + 22
  + 34; **topLimit** = max(lanternBottom + 14, bubble bottom + 8): every drum's hit circle top stays below it.
- **Floor** (the lowest cushion bottom): landscape groundY − 110 (the lamb walks below the drums); portrait min(Bibi's head, cymbal
  top, ground) − 40. Landscape: a pad whose cushion is over the cymbal keeps its cushion bottom ≥ 20 px above the cymbal top (on a
  screen too short for that the stage starts right of the cymbal: `layout.cymShift`).
- **Sized per round** for its real drum count n and its biggest size factor kMax (the size topic's big drum 1.25; between rounds
  maxDrums[age], 1). u = kMax × item, foot = 1.25 u. Tiers (first that fits): zig-zag (portrait, n ≥ 3, item = min(cap, usable /
  (kMax (0.95 (n − 1) + 1.25))) when ≥ 8 px bigger than the row) → row item = min(cap, usable / (kMax (1.3 (n − 1) + 1.25))) →
  itemMin at 1.3 → itemMin at 1.18 → (odd viewports only) squeezed. cap = itemCapTall 170 then itemCap 150 on tall portrait, 150 on phones, else the age's item
  (112 / 112 / 112 / 104 / 104). A tier fits when the span ≤ usable and the vertical band [highest pad whose hit circle stays below
  topLimit … lowest pad whose cushion stays above the floor] holds the stagger (±28; else one height, `layout.tight`) or the zig-zag.
- **Drum cap**: ages ≥ 5 on phones / tall portrait screens get ≤ 4 drums (`phoneMaxDrums`, passed to `makeRound({maxDrums})`; dots and
  letters stay big). A rotation mid-round keeps the round's drums (5 still fit in a zig-zag).
- **Portrait centring**: the band (row / zig-zag / beat drum + card) is centred between `lanternBottom` and the floor, clamped to the
  allowed pad range (QA visual P2-7). Size rounds (kMax > 1) never zig-zag and stand on **one line** (`pads[i].flat`).
- **Pads** (`padsFor`): centred on the stage, spacing clamp((usable − foot) / (n − 1), spK·u, 1.7 u) (zig ≤ 1.3 u); heights from the
  round seed: row = base ± 28 with neighbours ≥ 24 apart; zig-zag = alternate high / low rows 1.35 u + 56 apart (± 8 jitter) so a
  hopping low drum never touches the high neighbour's cushion; then clipped per drum to its own [lo, hi] (`pads[i].clipped`).
- **Beat mode** (n = 1, `beat`): the big drum `size = round(item × 1.45)`. The card (h 140; **170 on phones / tall**) goes **above**
  the drum (card bottom = drum top − hopMax 30 − the sound rings 0.3 × size − cardGap 24, card top ≥ lanternBottom + 8) if that fits with
  a drum ≥ 1.3 × item (the card may shrink to 110); otherwise the card goes **beside** it (right, gap 30 + 0.15 × size, card centre at the body centre; the pair is centred on the stage; the drum shrinks
  only as needed, never below item).
- Results: iPad 1180×820 112 for ≤ 5 drums (hit Ø 185 css), beat 162 + card beside; iPad 820×1180 112 (≤ 4), 104 / 100 for 5,
  beat 146 + card above (110); iPhone 393×852 150 (82 css, hit Ø 114 css) for 2–3 in a row and 4 in a zig-zag, 128 (hit Ø 100 css)
  for 5 in a zig-zag, beat 218 (119 css) + card above; iPhone 852×393 150 for every n, beat 192 + card beside.

## 5. Motion (all numbers are `CD.CONFIG`)
- **Strike** (`_strike(c, dir, strength, kind)`): on the cushion → **anticipation**: the squash spring is kicked to ≈ 0.86 and the
  cushion dents 0.25 for `windup` 0.06 s, then the hop launches with v = √(2 g peak); in the air → no windup, a boost up to the same
  apex (repeated strikes never stack higher than the peak). gravity 2600 px/s². Peaks: tap `hopTap 22 × strength` (clamp 8–30),
  strong swipe 30, brush 14, wrong 10, song 26, out 18. Skin = 1 (brush 0.5), decays linearly in 0.6 s, skinPh += 40 rad/s. Tilt
  spring ω 9, ζ 0.3 kicked to a first peak of 0.12 × min(1.3, strength) rad (brush × 0.6, wrong × 1.5), |tilt| ≤ 0.35. ring = 1
  (wrong 0.5 + dull 1; brush 0.6) decaying over 0.8 s.
- While airborne the squash target stretches: 1 + 0.07 × clamp(vy / v₂₂, −1, 1) (≈ 1.07 rising, ≈ 0.93 falling).
- **Landing**: impact k = v / v₂₂ → squash kick to a first dip of clamp(0.17 k, 0.04, 0.26) (a tap lands at ≈ 0.78–0.8), cushion
  dent kick clamp(0.9 k, 0.15, 1) (spring ω 12, ζ 0.35: it dips, springs back up past rest to ≈ −0.2, settles in ≈ 1 s); the drum
  sinks with the dent by dent × 0.2 × cushionH; event `land`. Squash spring ω 18, ζ 0.3, sq ∈ [0.66, 1.3].
- **Idle**: each cushion bobs ±3 px (sin, period 2.6–3.4 s, own phase; × cushionPop) and the drum rides it; every 1.2–3 s one
  standing drum gets a tiny tilt wiggle (≤ 0.025 rad). A soft press jiggles every cushion (dent 0.15), wobbles every drum (tilt 0.03)
  and sways the lanterns.
- **Enter**: cushion i puffs in at 0.05 + 0.1 i s (back-out ease 0.32 s, overshoot ≈ 1.12); drum i is released at
  0.05 + 0.1 (n − 1) + 0.12 + 0.14 i s with its bottom 40 px above the top edge, falling at 600 px/s + gravity → lands (squash 0.74,
  dent 1) → `drumIn` + `land`, state `stand`. The ask comes at max(1.2 s, last landing + 0.25 s).
- **Right note**: glow flash 1 s; a note flies on a parabola (apex 90 px above the higher end) to the next lantern in 0.7 s; the
  lantern lights (rate 3 /s), flashes 0.6 s and swings (spring ω 5, ζ 0.12, kick 0.22 rad). A right **dots** drum then lights its
  dots 1..n, 0.5 s apart (`count`, a little skin ripple + tilt each); the next ask waits for that run.
- **Beat mode** (`step.mode 'beat'`, count at ages ≤ 4): at the ask `w.card` pops up (back-out 0.25 s). A touch on the big drum ≥
  `beatListen` 0.9 s after the ask (the child hears the number first: QA playtest P1-1; earlier touches boom as `ring {brush, beat}`)
  and ≥ `beatGap` 0.2 s after the last counted beat → `ring {judged, beat}` + `count {i, n, beat}`, card.lit = i, card.flash = 1 (decays
  0.4 s), Bibi `beat`; faster touches → `ring {brush, beat}` (boom, no count). Beat i = n → `right {count: {n}, beat}` → note → lantern
  → `stepDone`; the card pops away after 0.6 s (0.2 s), the next ask after askGap 1 s + 0.8 s. A partial count with no finger down
  → `beatNudge` after 4 s, then × 1.5 backoff (6, 9 …; it is an idle nudge: the 2nd one also hints). Touches beside the drum are soft.
- **Song**: `songAsk` 0.5 s after `roundDone`; the swipe hand loops (2 s); a touch on any drum, a press in the drum band or songWait
  6 s (the VI song ask is 4.7 s long) → the wave: every drum left → right, 0.18 s apart (`song` strike, hop 26; beat mode: the big drum × 3, 0.3 s apart, the steps'
  climbing notes), each lantern flashes in turn, Bibi `beat` / `idle`; **`cymbal`** 0.25 s after the last note (w.cymbal tilt spring
  ω 7, ζ 0.15 kicked to 0.32 rad, ring 1 decaying 1.2 s; Bibi `cheer`); `songDone` 0.6 s later. A cymbal tap: kick 0.14, ring 0.5.
- **Out**: distractors first, 0.08 s apart: a last hop (peak 18, with anticipation), after its apex the drum floats away upward
  (+1500 px/s²) with a ±10 px sway, fading (alpha 1 → 0 between 0.25 and 0.7 s); its cushion puffs away (0.12 → 0.4 s). The next
  round after max(0.9 s, the last one gone).
- **Surprises stay** through the song and out and leave when the next round starts (`_nextRound`); at ages ≤ 4 they spawn 1 s
  after the first ask and the lamb starts just inside the right edge (30 px), so 3–4-year-olds see them (QA functional P2-1). On phones
  / tall screens the lamb and bird hit circles are r 92 (≥ 100 css).
- **Lamb**: 70 px/s along groundY − 8 from the right, sniffs 7 s at the spot nearest the middle ≥ 90 px right of Bibi's box and ≥
  cymbal w/2 + 80 from the cymbal, leaves right at 1.6 × speed. Tap: puffs into a ball (0.25 s), rolls 40 px without slipping
  (r 30), un-puffs (0.35 s). Hit circle r 58 at y − 34.
- **Bird**: flies in on an arc (1.1 s) to the middle of the widest gap between lanterns on the garland string whose 84 × 72 bird box
  is clear of the bubble / HUD; feet follow the string's sag; hops every 0.9–2 s (0.3 s, 14 px) within the gap, stays 7 s, leaves
  up-left. Tap: sings 1 s (the last note struck). Hit r 48 at y − 30.
- **Fireflies** (twinkle stars): 5, 0.35 s apart, drift down (1.6 s) to anchors in the free horizontal gaps between drums / the card
  at body height (≥ 76 px wide) and in the sky between the lanterns and the drum tops, wander ±18 / ±12 px; after 14 s or a tap
  they flare and zip off (0.8 s). Hit r 40.
- **Ghost hand**: tap mode (1.6 s cycle, 3.2 s long) glides in from (+70, +110), taps the moving drum twice, drifts back fading.

## 6. Rounds, help, stars
- Rounds per chapter 4; after ≥ 2 rounds once the chapter passed 75 s → Talk time. A round starting later than [–, 30, 48, 62] s
  into the chapter is short (2 targets; beat: 2 steps).
- Stars 3 / 2 / 1 for 0 / 1 / ≥ 2 misses, at most 2 when a note was assisted; +1 for a right Talk answer. Only wrong judged
  contacts are misses (never in beat mode).
- No progress: 2 → hint (cooldown 6 s), 3 (ages ≤ 4) / 6 → assist. Idle (no finger down) 12 → 18 → 27 → 30 → 30 s (`idle {n}`;
  beat partial count: `beatNudge` 4 → 6 → 9 …), the 2nd also hints. Talk re-asks every 12 s, glows after the 2nd, Bibi answers 12 s
  after the 3rd.
- The next round never opens with the answer asked last (beat: the first n ≠ the previous round's last n); never the same set twice
  in a chapter (a beat round's key includes its n sequence).
- Surprises: one round per chapter (round 1 or 2); chapters 0–2 alternate lamb / bird, chapter 3 (night) = fireflies; spawn 3–5 s
  after the first ask, never later than max(2, notes × 1.8 − 1) s (notes = lanterns: one per beat step); they leave at the song.

## 7. Events (every positional event carries x, y in logical px)
| event | payload | when |
|---|---|---|
| `session` | levels | newSession |
| `level` | level, topic, weather | a chapter starts (intro) |
| `round` | round, topic, surprise, drums, lanterns, steps, mode ('find'\|'findAll'\|'beat'), short, key, x, y | the cushions start to pop |
| `drumIn` | id, i, x, y (body centre) | a falling drum lands on its cushion (enter) |
| **`land`** (new) | id, x, y (cushion top centre), v (impact ≈ 1 for a tap, ≈ 5–7 on enter) | every landing (dust / cushion "poof") |
| `ask` | promptKey, params, mode, step, steps, first, round, nameKind, nameValue, need, x, y (Bibi's mouth) | a step opens |
| `ring` | id, thing, note, x, y, strength (1 tap, 0.6–1.6 swipe, 0.6 brush), judged, swipe, dull?, brush?, **beat?** | every strike (beat mode: the step's note) |
| `right` | id, thing, note, step, lantern, x, y, count? {n}, all? {i, n}, **beat?** | right after its `ring` (beat: after the n-th `count`) |
| `wrong` | id, thing, got {nameKind, nameValue, kind, color, shape, n, animal, text, size}, want {nameKind, nameValue, promptKey, params}, streak, misses, x, y | after its dull `ring` (never in beat mode) |
| `count` | id, i (1-based), n, x, y, **beat?** | beat mode: every counted beat (BEFORE `right`); dots drum: dot i lights (0.5 s apart, AFTER `right`) |
| **`beatNudge`** (new) | i, n, id, idleN, promptKey, params, mode, step, x, y | beat mode: a partial count, 4 s idle (then backoff), instead of `idle` |
| `lantern` | i, color, note, x, y | the note arrives, the lantern lights |
| `stepDone` | step, steps, last, x, y | the step's targets are all rung / the count is complete |
| `soft` | kind 'sky'\|**'stage'**\|'early', x, y | press on nothing ('beam' → 'stage') |
| **`cymbalTap`** (new) | x, y (cymbal top) | the cymbal box tapped (never soft, never progress) |
| `hint` | id, mode 'tap', x, y, want, idle? | 2 no-progress / 2nd idle / hint() |
| `assistArmed` | id, x, y | the asked drum glows big |
| `assist` | id, from (drum id under the finger \| null), x, y | the assisted strike (before `right` / `count`) |
| `idle` | n, promptKey, params, mode, step | nudges |
| `pokeBibi` | promptKey, params, mode, step, x, y | Bibi tapped in a round |
| `roundDone` | round, stars, misses, x, y | all notes in → state roundDone, phase song |
| `songAsk` | x, y | 0.5 s later |
| `songNote` | id, i, n, note, x, y | each wave strike (always left → right; beat mode 3 strikes of the big drum) |
| **`cymbal`** (new) | x, y (cymbal top) | 0.25 s after the last song note: the crash |
| `songDone` | auto, x, y | 0.6 s after the cymbal |
| `drumsOut` | x, y | the out phase (the tune is in `w.songs`) |
| `lamb` / `lambTap` | x, y | appears / tapped |
| `bird` / `birdTap` | x, y (perch) / note, x, y | appears / tapped |
| `fireflies` / `fireflyTap` | n, x, y / x, y | appear / tapped |
| `talk`, `talkAsk`, `talkResult`, `levelDone`, `sessionDone` | talk / talk, n, glowAnswer / correct, choiceId, answerId, auto / level, stars / stars, songs | as before |
`w.songs[] = {level, round, topic, notes: [note index…] (climbing; beat mode: one per step), colors: [answer key | null…]}`.

## 8. Content (`CD.Content`, DESIGN §5.1)
- Kinds `drum` (colours, size), `shape` (shapes, shapes5), `big` (beat mode), `dots`, `animal`, `glyph`. `CD.ANIMALS` = cow, duck,
  cat, pig, frog, sheep, hen, mouse (`CD.TOY_WORDS` VI bò, vịt, mèo, heo, ếch, cừu, gà, chuột → initials B V M H – C G C; EN C D C P
  F S H M; the frog has no VI initial).
- **size**: a big (1.25) and a small (0.75) drum of one colour; from round 2 the distractor is a **mid-size (1.0) drum of another
  clash-free colour** (`size 'mid'`, named by its colour) — not an animal drum (QA visual P2-3).
- Drums per round: warm-up 2 + 0; age 3: 2 (+1 from round 2, not in chapter 1); age 4: 3 + 1 (chapter 1: 3 + 0); age 5: 3–4 + 1;
  6+: 4 + 1; short 2; oddeven 2–3 + 1–2; colours below 5: ≤ 3 colours. Order = pad order (shuffled). Every find step: exactly one
  drum not rung yet matches (validated with an independent matcher).
- **count**: age 3 never (not in its pool); **age 4 = beat mode**: `drums = [{id, thing {kind 'big', big, nameKind 'number',
  nameValue = the first n}, target}]`, steps `{mode 'beat', targets [id], need n, promptKey 'p.beat', params {n}, nameKind 'number',
  nameValue n, note}`; warm-up n = 1, 2; later 3 steps (2 when short) of distinct n in **2–5** with one ≥ 3; the step notes climb; the
  drum's note = the first step's; `song` = the big drum once per step. Age 5+ = dots drums (`p.count {n, kind 'dots'}`, 1–10 / 12,
  no neighbours at 5).
- Talk: pictures only for ages ≤ 5; count shows a **dots drum** and offers `{kind:'number', n}` icons (≤ 5 at age 4);
  `talk.colors` shows a colour drum; 2 choices at age 3 (except glyph topics).

## 9. Weather (`CD.Weather`, DESIGN §5.3) — API unchanged
`setWeather(0..3)` (2.5 s crossfade of every ambient number + colour), `fireAt(x, y)` (warm glow / puffs origin), `burst(x, y,
{kind: stars|sparkle|notes|embers|confetti|dust|dots})`, `addDust`, `setParty`, `resize`. Ambient cap 56, hard cap 120. The mood
colours / emitters live in `Weather.MOODS` and belong to the environment artist; the unit test reads the expected sky colours and
glow strengths from that table (it checks the plumbing, not the hex values).

## 10. Bot (`CD.Bot`, DESIGN §5.4)
Waits 0.8–2.2 s × (1.3 − 0.5 skill) after an ask, touches the asked drum with p = skill (always with a hint / the assist), else
another standing drum: a tap (± 0.3 r); surprises are tapped (p 0.6 per round) ≈ 0.2 s after they become tappable, also during the song; or (p 0.25) a swipe that starts just outside the drum. **Beat mode**: taps the big drum with
0.35–0.7 s gaps; per beat p = 0.5 (1 − skill) a pause of 1.5–5 s (→ `beatNudge`), else p = 0.5 (1 − skill) a too-fast double tap
0.08–0.15 s (only booms). Stats add `beats, counts, beatPauses, beatDoubles`. Song: a band swipe after 0.6–2 s (p 0.8) or waits for
the auto wave. Talk right with p = skill. Taps surprises with p 0.6 per round.

## 11. Playtest (`hs_playtest.js --n 20`, 1 060 sessions, 12 models, 1/30 s frames, 5 viewports, EN / VI)
After the QA round (beatListen, songWait 6, beat n 2–5, phones ≤ 4 drums, hit Ø 200, surprises stay): exit 0, typical 3 / 4 6.1 /
6.4 min (chapter 88 / 92 s, 3★ 63 / 73 %), typical 5–7 5.7–6.4 min, slow3 7.0 (7.6) / 7.1 (7.8), slow3 auto songs 31 / 33 % (was 38–46).
Before it:
All models: **0 failed / stuck states / NaN / standing drums off screen, 0 rounds > 120 s**; max hop 30 px.
| model | age | session min (p90) | chapter s | 3★ % | assist rounds % | beats counted / too fast / nudges |
|---|---|---|---|---|---|---|
| typical | 3 / 4 | 6.0 (6.3) / 6.3 (6.5) | 86 / 90 | 67 / 76 | 1 / 1 | – / 412 / 3 / 11 |
| typical | 5–7 | 5.8–6.4 (≤ 6.6) | 84–92 | 72–80 | 0 | – |
| slow3 | 3 / 4 | 7.0 (7.6) / 7.1 (7.8) | 101 / 102 | 57 / 58 | 5 / 6 | – / 292 / 0 / 32 |
| swiper (strums, never aims) | 3–7 | 6.2–6.7 (≤ 7.4) | 90–98 | 20–45 | 35–44 | (age 4) 373 / 0 / 7 |
| beam (taps the stage) / tapper | 3–7 | 6.4–6.6 (≤ 7.1) | 92–96 | 14–26 | 54–84 | |
| absent | all | idles at 12 → 18 → 27 → 30 → 30 s after the ask, the round waits | | | | |
Gesture fairness: taps judged on the aimed drum 99.5–100 %, clean swipes 98–100 %, sloppy swipes 83–98 %, beats 99.3–99.8 %.

## 12. Deviations from DESIGN (to note)
- **States**: song / out run in state `roundDone` (phase `song` / `out`), enter / play in state `round`.
- **Card**: centre = drum top − 30 (hop) − 12 − h/2 (DESIGN said drum top − 70, which overlaps a 150 px card with the drum); when that
  does not leave a drum ≥ 1.3 × item, the card stands **beside** the big drum (`card.mode 'side'`, iPad landscape and phone
  landscape). Card h 140 (110–140), w 0.8 h.
- **Zig-zag** rows are 1.35 × u + 56 px apart (DESIGN ≈ 1.05 × item) so a hopping low drum never touches its high neighbour's cushion.
- **Garland in portrait** sits at bubble bottom + 84 (not + 46) so the perched bird never covers the bubble.
- **Landscape floor** groundY − 110 so the lamb walks under the drums; a pad over the cymbal rises above it.
- **Song wave** is always left → right (no "from the touched drum outwards").
- **Per-drum cushions** are 1.25 × that drum's size (the size topic's big / small drums get big / small cushions); `layout.cushion`
  is the item-size cushion.
- **No progress** also counts a slide that only brushed rims (unsticks strumming children; never a miss).
- **Extra fields / events**: `land`, `cymbalTap`, `beatNudge`, `soft.kind 'stage'`, `ring.beat`, `count.beat`, `right.beat`,
  `layout.beat / topLimit / lanternBottom / floor / tight / cymShift`, `pads[i].clipped`, `card.mode`.
