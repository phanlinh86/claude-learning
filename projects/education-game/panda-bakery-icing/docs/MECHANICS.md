# Mochi's Icing Bakery — Mechanics (events, render contract, `IB.CONFIG`, layout, trace, motion, playtest tuning)

Owner: mechanics engineer. Code: `game/js/{rng,trace,content,world,weather,bot}.js`. Contract: `docs/DESIGN.md` §2, §5.1–5.6.
Tests: `node tests/unit/run.js` (33 tests, ≈ 11 s: every glyph / shape / stroke traced by a follower at every age tolerance,
≈ 6 000 generated rounds, 40 full bot sessions, layouts of 15 viewports; `node tests/unit/run.js <name part>` runs a subset).
Sims (report-only, `tests/sim/`): `node tests/sim/hs_playtest.js [--n 100] [--ages 3,4] [--models typical,wobbly,…] [--jobs 4]
[--config '{…}'] [--tag x]` (→ `tests/sim/out/hs_<tag>.md`), `node tests/sim/determinism.js`, `node tests/sim/content_stats.js
[chapters]`; `hs_browser*.js` / `hs_voice_*.js` / `voice_*.js` drive the real page in Playwright (`?bot=1`) once it is integrated.

## 1. Events (`world.drainEvents()` every frame; `x, y` = logical screen px where an effect / sound can be placed)

Never a mistake: `needPick`, `offTap`, `offPath`, `traceTap`, `already`, `soft`. Stars count `wrong` only (3 / 2 / 1 for 0 / 1 / ≥ 2
per round); a right Talk answer is +1.

| event | when | payload | voice / audio hint |
|---|---|---|---|
| `session` | `newSession()` | `{levels: [4 topics]}` | |
| `level` | a chapter starts (intro 2.5 s) | `{level, topic, weather}` (weather = level % 4) | `topic.*`, `weather.<i>`; Weather.setWeather |
| `round` | a round starts | `{round, topic, surprise: null\|'bird'\|'mouse', steps, modes: [mode…], short, board: ck kind\|null, home: home\|null}` | |
| `enter` | right after `round` | `{x, y (tray centre), cookie: bool}` | whoosh as the cookie slides in |
| `sack` | mouse round: the flour sack is out | `{x, y}` | |
| `choicePop` | each bag / choice cookie pops in | `{id, kind: 'bag'\|'cookie', color, x, y}` | soft pop |
| `land` | a cookie lands | `{what: 'tray'\|'hop'\|'rack', x, y}` | "pat" |
| `whoosh` | a picked cookie takes off | `{what: 'cookie', x, y (destination)}` | |
| `ask` | every step starts | `{promptKey, params, mode, step, steps, first, follow, round, color, nameKind, nameValue, need?, what?, strokes?, x?, y?}` — trace: `x, y` = the shining start, `what` = `'stroke'\|'shape'\|'number'\|'letter'\|'road'`, `strokes` = n; chips: `need`, `x, y` = cookie centre | speak `promptKey` with `params` (`follow: true` = "Now follow the dots!" after a right pick) |
| `pick` | right choice tapped | `{id, kind, color, nameKind, nameValue, x, y}` | `say.pick` + bag "squish-plip" |
| `wrong` | wrong choice tapped (a mistake) | `{kind: 'bag'\|'cookie', id, color, got: {nameKind, nameValue}, want: {nameKind, nameValue}, streak, misses, x, y}` | `wrong.bag[]` / `wrong.cookie[]` "That's the circle. Where is the triangle?"; "boing" |
| `needPick` | tray tapped / dragged before the pick | `{kind: 'bag'\|'cookie', want, x, y}` | `needPick[]` |
| `offTap` | a tap that does nothing in a pick / chips step (empty counter, wall…) | `{mode, x, y}` | optional: repeat the prompt softly |
| `traceStart` | once per press, when the finger first touches the icing head (the shining start, or the end of the icing after a lift; ≤ 1.2 tol) — or any press in magic icing | `{stroke, n, resume, magic, x, y}` | start the icing-squeeze loop |
| `traceProgress` | 25 / 50 / 75 % of the whole path | `{total, x, y}` | `trace.progress[]` "Yummy!", pitch up |
| `strokeDone` | a stroke of a multi-stroke glyph is done (not the last) | `{i, n, x, y (stroke end)}` | `trace.stroke[]` "Now the next line!", chime |
| `tracePause` | finger lifted after some progress (kept) | `{total, stroke}` | stop the squeeze sound |
| `traceDone` | the whole path is iced | `{what, value, color, magic, x, y}` | `trace.done[]` per `what` ("A red wave!"), sparkle arpeggio |
| `offPath` | pressing > 0.6 s farther than tol from the dots after this press was once on them (≥ 3 s apart); or (`slide: true`) on release of a slide ≥ 20 px that made no progress | `{n, slide?, x, y (finger), hx, hy (icing head)}` | `offPath[]` "Follow the dots!" |
| `traceTap` | a short press (< 0.45 s, < 20 px) in a trace step, anywhere but Mochi; icing it made is rolled back | `{n, where: 'tray'\|'bag'\|'choice'\|'other', x, y}` | `traceTap[]` "Keep your finger down and slide!" |
| `chipDrop` | a chip leaves Mochi's paw (logical count +1) | `{i, n, x, y (target)}` | whistle |
| `chip` | the chip lands on the cookie (count aloud HERE) | `{i, n, x, y}` | `count.<i>` + "tock" |
| `chipsDone` | the last chip landed | `{n, x, y}` | `chipsDone[]` "3 chocolate chips!" |
| `already` | a chip tap after N, or no room | `{kind: 'chip', n, x, y}` | `already[]` |
| `stepDone` | a step finished (after its flight / landing) | `{step, steps, mode, last}` | |
| `hint` | 2 no-progress actions / 8 s without trace progress / the 2nd idle / `hint()` (cooldown 6 s) | `{target: 'choice'\|'path'\|'chip', id, x, y, mode, color, want, idle?}` | `hint[]`; ghost hand (`w.hintHand`) |
| `assist` | the struggling child gets help | `{target: 'path', magic: true, x, y}` (magic icing on) \| `{target: 'choice'\|'chip', id?, x, y}` (this tap did the right thing) | `assist[]` "Magic icing! Slide anywhere!" |
| `idle` | no press for 12 → 18 → 27 → 30 s… | `{n, promptKey, params, mode, step, follow}` | `idle[]` + repeat the prompt |
| `pokeMochi` | tap on Mochi | `{promptKey, params, mode, step, follow, x, y}` | repeat the current prompt |
| `soft` | a press that was not a tap (held > 1 s or moved ≥ 64 px) outside a trace | `{kind: 'hold'\|'drag', target: 'choice'\|'tray'\|null, id?, x, y}` | soft sound only |
| `finish` | all steps done | `{topic, x, y}` | `finish[]` "Sprinkles!"; gleam + sprinkle rain |
| `walk` | animals: the animal starts along the road | `{animal, home, x, y}` | footsteps |
| `home` | animals: it reached its home | `{animal, home, x, y}` | `home.<animal>` (sound + "home!") |
| `hop` | the cookie takes off | `{n, x, y, to?: 'rack'}` (n = 1 hop in place, 2 = the big hop onto the rack; animals: one hop, `to: 'rack'`) | boing; `hop[]` "Onto the cooling rack!" on `to: 'rack'` |
| `rack` | it lands on its rack slot | `{slot, n (cookies on the rack), x, y}` | |
| `roundDone` | the round ends (then 0.4 s clear) | `{round, stars, misses}` | stars, `praise[]` / `great[]` |
| `bird` | the bird flutters in (bird round) | `{x, y, dir}` | `surprise.bird` |
| `birdTap` | the bird tapped | `{x, y, dir}` | `bird.tap`, chirp; `Weather.addSplash(x, y, null, 16)` |
| `mouse` | the mouse peeks out of the sack | `{x, y}` | `surprise.mouse` (first time) |
| `mouseTap` | the sack / mouse tapped | `{x, y, taps}` | `mouse.tap`, squeak; `Weather.addPuff(x, y, 12)` |
| `talk` | Talk time starts | `{talk}` (see §10) | `talk.*` |
| `talkAsk` | re-ask every 12 s (3×) | `{talk, n, glowAnswer}` | |
| `talkResult` | an answer (or Mochi answers herself after 3 re-asks + 12 s) | `{correct, choiceId, answerId, auto}` | |
| `levelDone` | after Talk time | `{level, stars}` | oven "ding" |
| `sessionDone` | after chapter 4 | `{stars, cookies, gallery: [{ck (decorated, §3), topic, round, stars}]}` | `session.done` |

`pointerDown` returns `'bird' | 'mouse' | 'trace' | 'press' | null`; `pointerUp` returns `'pick' | 'wrong' | 'needPick' | 'chip' |
'already' | 'offTap' | 'traceTap' | 'tracePause' | 'traceDone' | 'pokeMochi' | 'soft' | 'assist' | null`.

## 2. Conventions
- Logical px (short side 720), seconds, radians, y DOWN, rot > 0 clockwise. **Screen space = world space** (no camera).
- `update(dt)` runs fixed sub-steps of `CONFIG.step = 1/120 s` (dt capped at 1 s per call, so `?speed=N` works). At the start of
  every sub-step each moving value is copied into its `_p` twin; render `v = _v + (v − _v)·w.alpha`.
- **Tray picture px**: the 600 × 400 authoring box of `layout.tray {x, y, w = 600 s, h = 400 s, s}`; `X = tray.x + px·s`,
  `Y = tray.y + py·s`. `w.path`, `w.icing`, `w.chips`, `w.walker` are picture px; everything else is screen px.
- Determinism: content, surprises and the surprise round use the world's seeded `IB.RNG`; cosmetics (blinks, wobble signs,
  sprinkles, bird direction) a second seeded generator. Same seed + the same inputs on the same sub-steps → the same events
  whatever the frame size (`tests/sim/determinism.js`: 35 age × model sessions, replays at 1/30, 1/60, 1/120 s — identical).

## 3. Render contract (what render.js reads; everything else is internal)
```
w.layout      W, H, ins, portrait, tall, groundY, frame (16), bubble {x,y,w,h}, hud {x,y,w,h}, keep[] (debug), safe
              tray {x, y, w, h, s}            INNER tray box; CookieArt.drawTray draws the rim ≤ frame px OUTSIDE it
              choices {y, slots[{x,y,r}], sets{k: slots}, hitR (76), n, column}
              mochi {x, y (FEET), h, w, up?}  (up: tall portrait — Mochi stands on the tray rim)
              bag {x, y}                       resting nozzle tip (fallback when docs/art/mochi_hand.json is missing)
              rack {x, y, w, h, size (cookie px, 50–74), cols, rows, slots[{x, y}] (4)}   → CookieArt.drawRack(ctx, rack)
              sack null | {x, y (bottom), w 112, h 98}, birdY (bird lane)
w.choices[]   {id, kind 'bag'|'cookie', color, hex, ck, nameKind, nameValue, scale (size topic: big 1 / small 0.62), x, y, r,
              pop 0..~1.1 (scale, easeOutBack), lift 0..~0.8 (× ≈ 18 px up), wob (px, horizontal), glow 0..1 (hint),
              dim 0..1 (0.55 during a trace / chips step, 1 in finish), selected, gone (picked: hidden), _ppop _plift _pwob _px _py}
              bag: CookieArt.drawIcingBag(ctx, hex, size, angle, {lift, wob, glow, selected, dim});
              cookie: CookieArt.drawCookie(ctx, ck, 2r·scale·pop, {lift, wob, glow, dim, selected})
w.cookie      null | {ck, x, y, size (screen diameter), rot, sx, sy, alpha, glow 0..1 (finish), sparkle 0..1, wob, plain 0..1,
              state 'rest'|'fly'|'hop', _px _py _psize _prot _psx _psy}     the big cookie on the tray (or flying / hopping)
              plain: a glyph cookie being traced fades its embossed text out (emboss alpha = 1 − plain; the dots + icing ARE
              the numeral / letter). After the finish ck carries the decoration (below) and ck.plain = true for glyphs.
w.side        null | same fields      initial topic: the animal cookie moved aside (tray left)
w.home        null | same fields + home   animals: the home cookie on the tray right (wob / sparkle when the animal arrives)
w.path        IB.Trace path of the trace step (picture px) | null;  w.traceState {stroke, done, total, off, complete}
              → CookieArt.drawGuide(ctx, w.path, w.traceState, {pulse, glow: w.guideGlow, alpha}) in tray picture space
w.icing[]     {pts [[x,y]…] picture px, hex, color, wet 0..1 (fresh = glossy, decays 2 s; 1 again in finish), alpha (clear fade),
              host 'cookie'|'tray'}   all icing strokes of the round (finished + in progress) → CookieArt.drawIcing(ctx, pts, hex, 22, {wet})
w.chips[]     {x, y (picture px; flying from Mochi's paw on a ballistic arc), r (15), squash 0..~0.35, rot, alpha, _px _py}
w.sprinkles[] {x, y, len (SCREEN px), hex, rot, alpha, landed, host, _px _py}   finish rain; stick on the cookie / tray
w.bag         {hex | null (cream), color, x, y (NOZZLE TIP), angle (rad, 0 = nozzle down; + clockwise), squeeze 0..1, state
              'rest'|'fly'|'trace', size 120, _px _py _pangle _psqueeze}   → CookieArt.drawIcingBag(ctx, hex, size, angle, {squeeze})
              rest: render may snap the tip to Mochi's paw point; trace: the tip follows the finger (spring)
w.walker      null | {animal, ck, x, y (picture px), rot, size (picture px), sx, sy, dir ±1 (faces right when +1), alpha, _px _py _prot}
w.rackCookies[] {ck (decorated), icing, slot, x, y, size, sx, sy, rot, _px _py _psx _psy}   persists through the chapter
w.hintHand    null | {x, y (fingertip now), x0, y0, press 0..1, alpha, t, target 'choice'|'path'|'chip', id, pts (path: the slide)}
              → CookieArt.drawGhostHand(ctx, size, press)
w.mochi       {x, y (feet), h, w, up, mood idle|talk|happy|cheer|think|oops|wave|pipe|point, moodT, blink (bool), look −1..1}
w.bird        null | {x, y, dir ±1, state 'fly'|'happy', t, flap 0..1 (> 0.5 → bird_flap.svg), size 120, _px _py}
w.sack        null | {x, y (bottom), w, h, mouse 0..~1.15 (peek spring), happy (bool → mouse_happy.svg), taps, glow, _pmouse}
w.trayGlow 0..1 (finish), w.gleam −1 | 0..1 (icing gleam sweep in finish), w.guideGlow 0..1 (path hint: dots glow),
w.flowing (bool) / w.flow 0..1 (icing is coming out — audio squeeze loop, pitch by w.traceState.total), w.magic (bool)
w.talk        {topic, promptKey, params, show: thing | null, choices [{id, thing, value}], answer, answerId, glowAnswer}
```
**Decorated cookie** (`w.rackCookies[i].ck`, `w.cookie.ck` while hopping, `gallery[i].ck`): `ck.icing [{pts, hex, w}]`,
`ck.chips [{x, y, r, rot}]`, `ck.sprinkles [{x, y, hex, rot, len}]` — all in **cookie units**: centre 0, 0 and 1 = the cookie's
diameter (draw a cookie of `size` px: `X = cx + x·size`, icing width `w·size`). `w.icing` / `w.chips` / `w.sprinkles` are emptied
for the cookie when it starts to hop (the road of the animals stays on the tray until the clear).

Picture px → screen: `X = tray.x + px·s`, `Y = tray.y + py·s`. `IB.Weather` (§11) gives `ambient` + `particles[]`.

## 4. Public API (`IB.World`)
`new IB.World({seed, age, lang, width, height, ins, config, hudKeep})`, `setViewport(W, H, ins)` (no-op when nothing changed;
set `world.hudKeep = [{x,y,w,h}…]` then call it again), `setAge(a)` / `setLang(l)` (apply at the next `newSession`),
`newSession({lastTopics})`, `levels`, `startLevel(i)`, `update(dt)`, `drainEvents()`, `skipTalk()`, `resetNudges()` (after a
pause), `talkAnswer(id)` → bool, `hint()` → `{target, id}` | null, `prompt()` → `{promptKey, params, mode, step, follow}` | null,
`pointerDown / pointerMove / pointerUp (x, y)`, `cancelDrag()` (touchcancel / pause: the trace keeps its progress), `tap(x, y)`
(an already-classified tap: tests / keyboard). Fields: `layout, hudKeep, state, phase, level, topic, round, roundsPerLevel,
step, stepInfo, stars, levelStars, roundStars, misses, talk, talkAnswered, alpha, stateTime, phaseTime, interactive, tol,
magic, weather, cookies, gallery` + §3.
**Input (one active pointer):** a **tap** = press + release within `tapTime` 1.0 s and < `tapMovePx` 64 px, handled at the press
point. In a **trace step** every press except on Mochi's body (the bird / the mouse react first) is a trace press — the resting
bag (within 90 px of (bag.x, bag.y − 40)) included: the bag follows the finger, icing only flows on the path; a release < 0.45 s /
< 20 px is a `traceTap` (its icing is rolled back unless it finished a stroke); a slide ≥ 20 px without progress is `offPath
{slide}`. In a **pick step** any press on the tray (tap or drag) is `needPick`; a drag that starts on a choice and is released over
the tray (+ 90 px) picks that choice like a tap (right → `pick`, wrong → `wrong`); any other drag is `soft` and counts toward the hint. In a **chips step** any press on the tray drops a chip at the press point (clamped onto the cookie).
**Test hooks (logical px):** `choiceHit(id)` → `{x, y, r}` | null, `mochiHit()` → `{x, y (centre), w, h}`, `birdHit()` /
`mouseHit()` → `{x, y, r}` | null, `answer()` → `{choice, x, y}` | `{trace: true, x, y (start)}` | `{chip: {x, y}}` | null,
`pathScreen()` → remaining points of the current stroke `[[x, y]…]`, `pathScreenAll()` → per remaining stroke, `chipSpot()` →
`{x, y}` | null, `cookieScreen()` → `{x, y, size}` | null, `picToScreen(x, y)`, `screenToPic(X, Y)`. Static:
`World.logicalSize(cssW, cssH)`, `World.computeLayout(W, H, ins, cfg, plan {n, sack}, hudKeep)`, `World.kickFor`,
`World.ballistic`, `World.tolOf(cfg, age)`.

### States and phases
`menu → intro (2.5 s) → round → roundDone (phase 'clear', 0.4 s) → … → talk → levelDone (1.8 s) → … → sessionDone`.
In `round`: `enter (1.0 s) → play (steps) → finish (1.3 s) → hop (≈ 1.3 s; animals ≈ 2.6 s with the walk)`. Talk time after
round 4, or after round ≥ 3 once the chapter passed 75 s. Talk re-asks every 12 s, the answer glows from the 2nd re-ask, re-asks
stop after 3; 12 s later Mochi answers herself (`talkResult {auto: true}`, no star).
Step flow in `play`: `ask` → (interactive) → done → wait for its flight / landing (`pick` bag 0.24–0.42 s, cookie 0.42–0.62 s,
trace 0.35 s, last chip + 0.15 s) → `stepDone` → 0.2 s (before a follow-up trace) / 0.45 s → next `ask` or `finish`.

## 5. Trace mechanics (`IB.Trace`, DESIGN §5.1)
- Paths are resampled every 4 px; a path = strokes `{pts, len, closed}`. Kinds: `stroke` (line, wave 1.5 periods, zigzag 4
  legs, arc = rainbow arch, loop = one prolate-trochoid loop, swirl = 2-turn spiral from the middle), `shape` (8 outlines, one
  closed stroke starting at the top — heart: the dip — clockwise; `IB.Trace.SHAPE_UNIT(shape)` = the unit outline so cookie_art
  can cut matching cookies), `glyph` (0–9, A–Z, a–z in kindergarten order: top first, down strokes first, circles
  counter-clockwise from the top / upper right; two-digit numbers = two glyphs, one scale; each glyph fitted to its own height,
  so a small letter is traced big), `road` (from → to with 0–2 bumps).
- `track(path, state, x, y, tol, look)`: **anchor** (QA BUG-1) — a press counts only after it touched the icing head (the stroke's
  first point, or the end of the icing after a lift / a finished stroke) within 1.2 tol; that touching sample does not ice. Then
  it projects the finger onto the current stroke **inside the window [done, done + look]** (look 90 px) and advances when the
  distance ≤ tol **and the projection moved forward since the previous sample**; leaving the band re-anchors on return. So tap-
  hopping, landing mid-path / ahead of the head and backwards drags never ice. Never goes back; a stroke completes at ≥ len −
  0.6 tol; a finger jump since the last move is walked in ≤ 8 px sub-steps. Backtracking glyphs (a, b, d, h, m, n, p, q, u) work
  because the window starts at `done`.
- **Closed outlines** (shapes, size circle): either way round — while nothing is iced the finger is followed in both directions,
  the first to reach 40 px wins (`state.rev`; the points are reversed in place, same start). Letters / numbers / strokes keep
  their direction.
- Tolerance per age (`CONFIG.tol`, picture px): 3: 72 · 4: 64 · 5: 55 · 6: 50 · 7: 45 (× tray.s on screen; QA P2-6, +10 %: on a
  phone the age-4 band is ≈ 6.5 mm). The icing is drawn
  ON the path (never under a wobbly finger), so it always looks neat.
- Help: `offPath` / `traceTap` count as no-progress; the 2nd → path hint (the ghost hand presses at the head and slides along the
  next 30 % ≥ 120 px, 1.8 s cycle × 2, dots glow); 8 s without progress → path hint; the 4th (ages ≤ 4) / 6th → **magic icing**
  (`assist {magic}`): finger movement anywhere advances the path by distance × 1.25, any tap squeezes a dollop of max(80 px, 12 %
  of the path), the bag rides the icing head. Never a mistake.
- Content sizes: round cookie 340 (strokes 250 × 110, two strokes at y 132 / 266, 220 × 74), glyph cookie 350 (glyph h 252, two
  digits 210, fitted so every icing point is ≥ 14 px inside the cookie), shape cookie 340 (outline 290; size topic small cookie
  210 / outline 166), animal at (112, 268) size 150, home at (482, 236) size 190, road between their edges (≈ 245–275 px).
  Every trace is validated: inside the tray with a 30 px margin, strokes ≥ 60 px, completed by a follower at tol 42.

## 6. Layout (`setViewport` → `w.layout`; recomputed per round for the number of choices and the sack)
Same maths as Nini's Sea Painting (canvas → tray, palette → choices, Nini → Mochi, clam → sack); the **cooling rack** is new:
| field | landscape | portrait |
|---|---|---|
| groundY | H − ins.bottom − 18 | H − ins.bottom − 30 |
| bubble | (ins.left+24, ins.top+18), w = min(560, W − ins.right − 200 − x), h 122 | (ins.left+24, ins.top+110), full width − 48, h 124 |
| choices row | centre y = groundY − 8 − 58; centred on the tray, right of Mochi; gap 24…40, planned for max(n, 4) | centre y = groundY − 14 − 58; right of Mochi (tall: the full row) |
| choices column (phone landscape) | when its tray scale beats the row's by ≥ 2 %: right of the tray rim, centred on the tray; only keep boxes that overlap the column band push it down; planned for max(n, 4), else max(n, 3), else with 12 px gaps (QA visual P1-1: 852×393 notch + HUD s 0.84 → 1.15, iPad Air 1.05) | portrait: r 72 (hit 90) when the row fits it without shrinking the tray > 3 % (tall phones), else 58 |
| Mochi | h 250, w 0.72 h, feet (group-left + w/2, groundY − 6) | h ≤ 210 (min 170) at the left edge; tall portraits: h 230 standing on the tray rim (`up`) |
| tray (inner) | s = min(…, 1.25), top = bubble bottom + 32 | s ≤ 1.08; bottom = min(choices top − 84 (rack band), Mochi top − 10) − 16; tall: centred in the free band |
| rack | left column above Mochi's head, below the bubble (4 × 1 or 2 × 2, whichever gives bigger cookies; 74 px) | tall: right of Mochi above the tray rim (4 × 1); else between the tray and the choices right of Mochi (4 × 1, ≥ 56 px) |
| sack | right of the choices on the counter (row), under the column, or left of Mochi | right of the choices when it fits (else the round's surprise becomes the bird) |
Measured (3 choices): 1556×720 column tray s 1.245 (rack 4 × 1, 74 px) · 1036×720 (iPad Air, insets) column s 1.047 (2 × 2, 74) ·
960×720 row s 0.935 / 0.787 with insets (2 × 2, 74) · 720×960 s 1.066 (4 × 1, 60 px) · 720×1556 tall s 1.08 (4 × 1, 74 px). Tests check 15 viewports × 0–5 choices × sack: 3:2 tray inside the safe area, nothing
under the HUD / bubble, Mochi clear of the tray, choices ≥ 24 px apart and off the tray, sack clear, bird lane below the bubble,
4 rack slots of ≥ 50 px on screen and clear of the tray, Mochi, bubble, HUD, choices and sack.

## 7. Motion (all integrated per 1/120 s sub-step)
- **Ballistic arcs** (`World.ballistic(y0, y1, A)`): x linear in time, y = y0 + v·u + ½·g·u² with v, g solved so the apex is A px
  above the HIGHER end — a true constant-gravity parabola whatever the height difference. Picked cookie: T = 0.42–0.62 s, A = 60 +
  0.05 d, size eases from the choice to the tray size, one spin (±0.35 rad), landing squash; bag: T 0.24–0.42 s, A 36 + 0.03 d;
  chips: from Mochi's paw, 0.36 s, A 50; the big hop to the rack: 0.56 s, A 90, one full flip, size → rack size.
- **Squash springs**: `sq` ω 20, ζ 0.32 (sx = 1 + 0.6 sq, sy = 1 − sq), landing kick for a 0.2 first peak; chips ω 24 ζ 0.3.
- **Enter**: board cookie / home slide in from 0.75 H above with a damped spring (ω 9, ζ 0.55) + a fading 0.08 rad sway, squash
  on first contact; choices pop in 0.3 s + 0.1 s apart (easeOutBack 0.35 s).
- **Bag**: follows the finger with a stiff spring (ω 32, ζ 0.82 → ≈ 10–30 px lag at a child's speed); the angle is a pendulum
  (ω 9, ζ 0.3) toward 0.3 rad + clamp(−vx · 0.0007, ±0.55) — it swings back when the finger moves and overshoots when it stops;
  squeeze → 1 while icing flows (rate 12/s), 0.25 while pressing off the path; hovers 0.55 s after a lift, then flies home; rest:
  2.5 px breathing bob.
- **Choices**: lift spring ω 14 ζ 0.45 (pick kick 0.8), wobble ω 26 ζ 0.18 (wrong: 8 px first peak), pop out 0.28 s.
- **Finish (1.3 s)**: gleam sweep 0.8 s, 26 sprinkles fall over 0.6 s from 160–300 px above with gravity 1500 px/s², one bounce
  (−0.22 v), then stick (on the cookie: they travel with it); tray glow.
- **Hop**: crouch 0.12 s (sx 1.14, sy 0.82) → hop in place 0.34 s, 46 px (stretch sy 1.08) → land squash → 0.08 s → the big
  ballistic hop with a flip onto the next rack slot → rack squash + a 12 px settle bounce (0.22 s).
- **Animals walk**: along the road (centre → road → in front of the home) at 230 px/s (1.0–1.7 s), waddle-hops every 0.22 s
  (10 px parabola, ±0.13 rad tilt, contact squash), a 34 px joy jump at the home (home wobbles + sparkles), then the hop.
- **Bird**: crosses at 170 px/s, wing beats 7 Hz (flap), 12 px bob + 3 px beat lift; tapped → 440 px/s and climbs 150·t²;
  comes back once 5 s later if nobody tapped it. **Mouse**: peek spring ω 10 ζ 0.4 (overshoot ≈ 1.1) for 2.2 s every 3.5–6 s;
  tap → pops up happy for 1.6 s.
- **Mochi**: moods with timers (happy 0.9, cheer 1.6, oops 0.8, think 1.4, talk 1.0, wave 1.4, pipe 0.7, point = hint time);
  blink 0.13 s every 2.2–5 s; `look` follows hint hand > bird > the bag (when not resting) > a flying cookie > tray centre.

## 8. `IB.CONFIG` (tuned values)
| group | key = value | why |
|---|---|---|
| flow | `roundsPerLevel 4`, `chapterTimeLimit 68` (was 75), `chapterMinRounds 3`, `shortBudget [∞, ∞, 30, 50]` (was 44, 58; QA P2-7), `introTime 2.5`, `clearTime 0.4`, `levelDoneTime 1.8`, `talk* 1.6 / 12 / 2 / 3 / 12` | a short round: colours keep one pair, counting starts with the numeral on the tray (slow3 age-4 counting chapter 135 → 129 s) |
| layout | `frame 16`, `choiceR 58`, `choiceHitPad 18`, `choiceGap 24…40`, `mochiHLand 250`, `mochiHPort 210 (min 170)`, `mochiHPortUp 230`, `sackW 112`, `sackH 98`, `rackCookie 74 (min 50)`, `rackPad 6`, `rackGap 6`, `rackBandPort 84`, `landColumn true`, `columnMinGain 1.02` | DESIGN §2 |
| touch | `tapTime 1.0`, `tapMovePx 64`, `trayPad 30`, `traceTapMove 20`, `traceTapTime 0.45` | |
| trace | `tol {3:72, 4:64, 5:55, 6:50, 7:45}` (QA P2-6), `bagGrabR 90`, `bagGrabUp 40`, `dragPickPad 90`, `traceDim 0.6`, `choiceRPort 72`, `look 90`, `startTolK 1.4`, `offPathTime 0.6`, `offPathGap 3`, `progressMarks [.25, .5, .75]`, `flowHold 0.12`, `magicGain 1.25`, `magicDollop 80`, `magicDollopFrac 0.12` | DESIGN §5.3; dollop 70 → max(80, 12 %) and taps anywhere count: tapper session 8.4–9.6 → 7.0–7.8 min |
| help | `hintAfterMisses 2`, `assistAfter 6` / `assistAfterOld 5` (pick / chips, ages ≤ 4 / 5+), `traceHintAfter 2`, `traceHintIdle 8`, `traceAssistAfter 4` / `traceAssistAfterOld 6`, `hintTime 3`, `pathHintTime 3.6`, `pathHintCycle 1.8`, `hintCooldown 6`, `idleTime 12`, `idleBackoff 1.5`, `idleMax 30`, `idleHintFrom 2` | |
| bag | `bagOmega 32`, `bagZeta 0.82`, `bagSwingOmega 9`, `bagSwingZeta 0.3`, `bagTraceAngle 0.3`, `bagRestAngle −0.35`, `bagTiltPerV 0.0007`, `bagTiltMax 0.55`, `bagHover 0.55`, `bagFly 0.24–0.42`, `bagArc 36 + 0.03 d`, `squeezeRate 12` | |
| cookies | `cookieFly 0.42–0.62 s`, `cookieArc 60 + 0.05 d`, `cookieSpin 0.35`, `squashOmega 20`, `squashZeta 0.32`, `landSquash 0.2`, `enterTime 1.0`, `enterFrom 0.75`, `enterOmega 9`, `enterZeta 0.55`, `choicePopTime 0.35`, `choiceStagger 0.1`, `choiceDelay 0.3`, `traceDim 0.55`, `askGap 0.45`, `askGapPick 0.2` | |
| chips | `chipR 15`, `chipGap 34`, `chipFlyTime 0.36`, `chipArc 50`, `chipEdge 10` | DESIGN: ≥ 34 px apart |
| finish / hop | `finishTime 1.3`, `gleamTime 0.8`, `sprinkleN 26`, `sprinkleG 1500`, `hopCrouch 0.12`, `hop1Time 0.34`, `hop1H 46`, `hop2Time 0.56`, `hop2Arc 90`, `settleTime 0.22`, `settleH 12`, `walkSpeed 230`, `walk 1.0–1.7 s`, `waddle 0.22`, `joyTime 0.38`, `joyH 34` | |
| surprises | `surpriseRounds [1, 2]`, `surpriseTypes ['bird', 'mouse']` (rotating per chapter), `birdAt 2.5`, `birdSpeed 170`, `birdHappySpeed 440`, `birdPasses 2`, `birdR 64`, `mousePeek 3.5–6`, `mousePeekTime 2.2`, `mouseHappyTime 1.6`, `sackR 66` | never the warm-up |

## 9. Content (`IB.Content`, DESIGN §5.2)
`makeRound(topic, {age, lang, rng, roundIndex, level, surprise, prev, short})` → `{topic, age, lang, roundIndex, level, surprise,
short, key, seed, answers, board: {cookie, at, home?, homeAt?}, steps}` (step fields: header of `content.js`). Up to 30 attempts,
each `validate`d. `prev` = the previous round's `answers` (no asked stroke / shape / animal / letter back to back).
- colors: bags 2 / 3 / 4 (ages 3 / 4 / 5+; warm-up 2), clash-free below 5, no pink below 5; round 0: a line, round 1: one pair
  (wave / zigzag / arc), rounds 2–3: two pairs (two colours, two strokes, upper + lower half). Strokes: 3: line wave zigzag arc,
  4: + loop, 5+: + swirl (single pair only).
- shapes: 2 / 3 / 4 cookies (warm-up 2: circle / square, age 5 also oval / rect), ≤ 4: 5 shapes, 5+: all 8; icing colour varies.
  The outline sits 16 px inside the cookie body (QA visual P2-4): `outlineSize(shape, 340)` from cookie_art's body (0.874 × size)
  and per-shape extent / in-radius (`SHAPE_FIT`): circle 265 · square 230 · triangle 253 · star 225 · heart 254 · rect 246 ·
  diamond 246 · oval 253. The single wave is 170 tall (QA P3-14: a straight swipe no longer ices it).
- size (age 3): big + small round cookies (warm-up: big), trace a circle around the picked one (big 290 / small 166).
- count: warm-up / short: the numeral is on the tray → trace it → N chips; else pick the numeral (3 choices) → trace → chips.
  N: r0 1–2, r1 2–3, later 3–5 (≤ 4), 4–10 (5), 5–12 (6+).
- animals: 2 / 3 / 4 animal cookies with distinct homes, the home on the tray from the start; pick → pipe the road → walk.
- letters / lower / initial / add / sub / oddeven: pick among glyph cookies (warm-up 2, else 3; age 7: 4), trace the picked glyph.
  lower: no i / l; initial: the animal on the tray, its initial among letters (VI words without ch / th / ê starts: mèo, ong, bò,
  cá, vịt, heo); oddeven: exactly one choice of the asked parity.
- `makeTalk` → `{promptKey 'talk.<topic>', params, show, choices [{id, thing, value}], answer}` (things = `CookieArt.drawIcon`
  kinds blob / shape / animal / home / number / letter / dots / size; animals: "Where does the dog live?" → homes).
- `topicsFor`: the first session = `IB.AGE_TOPICS`; later the pool topic left out last time is played and all four are sorted in
  pool (difficulty) order (QA P2-8: no session opens with counting at age 3).

## 10. Talk time
`w.talk = {topic, promptKey, params, show, choices, answer, answerId, glowAnswer}`; `talkAnswer(id)` once; see §4 States.

## 11. `IB.Weather` (DESIGN §5.4)
`setWeather(i, {instant})` (0 spring, 1 summer, 2 autumn, 3 winter; 2.5 s crossfade), `resize(W, H, groundY)`, `update(dt)` (1/60 s
steps), `setWindows([{x,y,w,h}])` (screen rects of the window glass; default: the far tile 800 × 720 with glass x 250–550,
y 90–400 scaled to the height and tiled from x 0), `setOven(x, y)` (steam source), `addSplash(x, y, hex|name|null, n)` (sprinkle
bits), `addPuff(x, y, n)` (flour), `burst(x, y, {kind: confetti|sparkle|stars|sprinkles|flour|crumbs, n, color})`, `setParty(on)`.
`ambient {wall, floor, sky (hex), tint (rgba | null), light, lightBars (env/light.svg alpha: 0.5 / 1 / 0.45 / 0.15), warmLights
(0 / 0 / 0.2 / 1), mood, moodIndex, env, envFrom, envMix, party}`. Particles `{type = sprite, x, y, size, r, rot, alpha, layer,
kind, color, outside, flipX?}`: always flour motes in the window light + steam from the oven; spring petals and autumn leaves drift
in through the window and sway down to the counter; summer glints in the light bars; winter snow falls **outside only**
(`outside: true`, inside its window rect — render clips to `wx.windows`). Ambient ≤ 60, total ≤ 120 (oldest ambient dropped).

## 12. `IB.Bot` (DESIGN §5.5)
Only `pointerDown / pointerMove / pointerUp` + `talkAnswer`: picks right with p = skill (a glowing hint always), traces by pressing
on the start of `pathScreen()` and sliding at 260–420 px/s with a smooth wobble ≤ 0.5 tol (ages 3–4 lift halfway 18 % of the
time), taps `chipSpot()`; delays 0.9–2.2 s × (1.3 − 0.5 skill); taps the bird / mouse once with p = 0.6. `bot.finger {x, y, down}`.

## 13. Playtest — `node tests/sim/hs_playtest.js --n 100 --jobs 4 --tag final` (3 520 sessions, 4 cores ≈ 3 min)
Child models (`tests/sim/lib.js`): **typical** (think 0.9–3.2 s by age + the prompt 2.4 s / follow-up 1.4 s, skill 0.72–0.92,
traces at 140–400 px/s by age with a smooth wobble 0.3–0.42 tol + ± 3–5 px noise, starts within 0.35–0.5 tol of the dot, lifts
halfway 10–20 %, wanders off the path 6–12 %, starts in the wrong place 5–10 %, taps instead of sliding 4–8 %, look-aways),
**slow3** (skill 0.6, 100–180 px/s, wobble 0.55 tol, 35 % lifts, 25 % excursions, 20 % wrong starts, 15 % taps), **wobbly**
(typical + wobble 1.0 tol, 30 % lifts), **perfect**, **tapper** (random taps anywhere, never slides), **spammer** (3–4 taps/s,
never slides), **bot0.8**, **absent**.

| model | age | session min (p90) | chapter s mean [p10–p90] | round s (p90) | trace s (p90) | rounds > 120 s | stars 3/2/1 % | offPath / traceTap per round | path hints / round | magic icing rounds % |
|---|---|---|---|---|---|---|---|---|---|---|
| typical | 3 | 5.9 (6.2) | 87.1 [78–97] | 19.6 (26.0) | 6.8 (10.4) | 0 | 72/21/7 | 0.12 / 0.09 | 0.07 | 0 |
| typical | 4 | **5.9 (6.2)** | **86.1 [75–99]** | 19.5 (27.1) | 6.1 (9.5) | 0 | 82/15/4 | 0.13 / 0.06 | 0.07 | 0 |
| typical | 5 / 6 / 7 | 5.5 / 5.3 / 4.7 | 80 / 78 / 69 | 17.8 / 17.1 / 14.7 | 5.7 / 5.4 / 5.1 | 0 | 88 / 92 / 90 % 3★ | ≤ 0.10 / 0.07 | ≤ 0.04 | 0 |
| wobbly | 3 / 4 / 5–7 | 6.0 / 5.9 / 4.9–5.6 | 88 / 87 / 72–82 | 19.9 / 19.8 / 15–18 | 7.0 / 6.4 / 5.7–6.2 | 0 | 69 / 83 / 88–92 % 3★ | 0.13 / 0.09 | ≤ 0.07 | 0 |
| slow3 | 3 / 4 | 7.1 (7.7) / 7.5 (8.0) | 104 / 110 | 29.8 / 31.6 | 12.3 / 12.4 (20.5) | 0 (max 78 s) | 61 / 66 % 3★ | 0.26 / 0.14 | 0.36 / 0.39 | 0 |
| slow3 | 5 / 6 / 7 | 7.9 / 8.0 / 7.5 (p90 ≤ 8.8) | 112–119 | 33–35 | 14–16 | 0 (max 111 s) | 60–66 % 3★ | ≤ 0.39 / 0.21 | ≤ 0.54 | 0 |
| tapper | 3–7 | 7.0–7.8 (p90 ≤ 8.1) | 103–115 | 31–35 | 15–19 | 0 (max 61 s) | 47–58 % 3★ | 0 / 4–6 | 1.0–1.07 | 100 (by design) |
| spammer | 3–7 | 5.3–5.7 | 78–84 | 17–18.5 | 6–7 | 0 | 34–50 % 3★ | 0 / 4–6 | 0.45–0.66 | 100 (by design) |
| perfect | 3–7 | 3.9–4.5 | 57–66 | 12.5–14.7 | 3.3–3.8 | 0 | 100 % 3★ | 0 / ≤ 0.03 | 0 | 0 |
| bot0.8 | 3–7 | 3.4–3.7 | 49–54 | 10.3–11.7 | 2.9–3.4 | 0 | 78–82 % 3★ | 0 / ≤ 0.01 | 0 | 0 |

Per topic (typical age 4, mean chapter s): colours 88 · shapes 85 · count 95 · animals 77 (age 3: colours 89 · shapes 91 · size
87 · animals 82). slow3 age 4 counting 129 s (3 steps per round: the slowest chapter; short rounds already skip the pick).
- **Targets met:** typical age-4 chapter **86 s** (60–100), session **5.9 min, p90 6.2** (≤ 8). Every model finishes every session:
  0 NaN, **0 stuck states**, **0 rounds > 120 s**, no round with > 60 s without progress except 1 / 500 slow3 age-5 rounds (65 s).
- Magic icing never fires for a child who tries to slide (typical / wobbly / slow3: 0 %); it is what carries the tapper and the
  spammer (they never slide). A shaky finger (wobbly, ≈ 1 tol) costs ≈ +0.3 s per trace.
- Absent child: idle nudges at 15.5, 33.5, 60.5, 90.5, 120.5 s after the round start (12 → 18 → 27 → 30 s), the 2nd hints; nothing
  else happens (no fail, no auto-play).
- "2nd miss without a hint" only inside the 6 s cooldown or while a hint is already showing (spammer by design; typical ≤ 4 / 100).
- Tuning history: magic dollop 70 px on tray taps → max(80 px, 12 %) on any tap (tapper 8.4–9.6 → 7.0–7.8 min, p90 ≤ 8.1);
  counting short rounds skip the pick; arcs moved to the true ballistic solver (a cookie tossed UP to the tray had a 15 px apex
  before, now 60+ px); the portrait rack margins trimmed (cookie 45 → 60 px on iPad portrait).

## 14. Deviations from / additions to DESIGN.md
- Events beyond DESIGN's list (all optional for main.js): `enter`, `sack`, `choicePop`, `land`, `whoosh`, `chipDrop` (the chip
  is counted on landing in `chip`), `offTap`, `soft`, `walk`, `rack`, `bird`, `mouse`. `hint.target` also `'chip'`;
  `assist.target` also `'choice' | 'chip'` (the pick / chips assist kept from sea paint so a random tapper never gets stuck).
- Render fields beyond DESIGN: `w.side` (initial topic: the animal moves aside), `w.cookie.plain` (fade the embossed glyph while
  it is traced), `choices[].scale` (size topic), `w.gleam`, `w.guideGlow`, `w.flow` / `w.flowing`, `w.magic`, `w.icing[].alpha /
  host`, `w.sprinkles[].landed`, `layout.rack.size / cols / rows`. Decorations travel with the cookie in cookie units (§3).
- `w.home` is screen px like `w.cookie` (DESIGN does not say); `w.walker` is picture px as specified.
- Animals: the animal walks to the FRONT of its home, jumps for joy, then hops onto the rack (the animal cookie is what lands on
  the rack, not the home).
- `count` short rounds (a long chapter) start with the numeral on the tray, like the warm-up.
- `p.trace` params: `{what, value, color, stroke? | shape? + size? | n? | letter? (+ animal for initial), intro?}`; `intro: true`
  marks a trace that opens a round (count warm-up: "Let's pipe the number 1!"). `p.road {home, animal, color}`. `p.initial {word,
  animal, letter}`; `talk.animals {animal, home}` asks where the animal lives (choices are homes).
- `pictures.js`, `tests/unit/pictures.test.js`, `tests/unit/stub_pictures.js` and `tests/sim/hs_deep.js` are deleted
  (`game/index.html`, `render.js` and `tools/pictures_sheet.js` still mention pictures.js — the lead's files).

## 15. QA fix round (2026-11-19) — `docs/reports/{functional,playtest,visual}_report.md`
- BUG-1 anchor + forward-motion tracking, tap rollback, traceStart per press · P1-1 slide without progress → `offPath {slide}` ·
  P1-2 any press but Mochi is a trace press (grab the resting bag) · P1-3 drag a choice onto the tray picks it, soft drags count
  for the hint · P2-4 offPath only after the press was on the dots · P2-5 closed outlines both ways · P2-6 tol +10 % · P2-7
  shortBudget [∞, ∞, 30, 50], chapterTimeLimit 68 · P2-8 topics in pool order · P3-14 wave 170 · visual P1-1 column keep boxes
  + retry · P2-1 portrait r 72 · P2-2 dim 0.6 · P2-4 outline inset 16 px. The bag's follow target is clamped to the screen.
- `node tests/sim/hs_playtest.js --n 40 --ages 3,4,5 --models typical,slow3,tapper,wobbly,bot0.8 --tag qa1` (1 000 sessions):
  typical age 3 / 4 / 5 session 5.6 / 5.5 / 5.3 min (p90 6.0 / 5.9 / 5.6), chapter 83 / **81** / 78 s (was 87 / 86 / 80);
  slow3 6.9 / 7.1 / 7.7 min (p90 ≤ 8.2); tapper 6.9–7.6 min; wobbly ≈ typical; bot0.8 3.5–3.7 min; **0 rounds > 120 s, 0 no-progress
  gaps > 60 s, 0 stuck, 0 NaN**; magic icing 0 % for every sliding model (100 % tapper, by design). Determinism: 35/35.
