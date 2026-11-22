# Visual QA — Mimi's Splash Rocket (2026-11-22, report-only)

**What was captured.** 4 viewports (iPhone 393×852 @3, 852×393 @3, iPad 820×1180 @2, 1180×820 @2) with notch insets
(CSS `--sa-*`: phone portrait 59/34, phone landscape L/R 59 + bottom 21, iPad 24/20) × EN/VI. Every screen: title, settings, chapter banner,
play, aim + arc, pump, boost, coast, chute (at the pop + low), landing, collect (thing flying), pennant, camp + fountain, wipe, pause, Talk
time, session done. Every mood (sunny / breezy / rain / rainbow). All 11 topics at ages 3–7 (iPhone portrait + landscape EN, portrait VI
at ages 4/6/7; count in round 0–2 for both modes). Surprises marmot / goat / bird. Forced colour sets on every mood. ≈ 900 screenshots.

Scripts (all in `tests/qa/`): `visual.js` (`PART=flow|topics|surprise DEV=… LANGS=…`, also writes per-shot geometry `geo-*.json`),
`overlaps.py` (mat footprints vs pole / pump / pad / Mimi / camp props / DOM bubble + HUD, rocket vs bubble / HUD), `bubble_fonts.js`
(fitted bubble font of every prompt wording, 4 devices × 2 languages), `contrast.js` (forced colour sets per mood), `pumpseq.js` (Mimi's
frames through one stomp, slowed), `sheet.py` (contact sheets). Output: `tests/out/qa_visual/{flow,topics,surprise,contrast,pumpseq,sheets}/`.
No console / page errors in any run. Positions below are **logical px** (short side 720) unless marked CSS px (phone: 1 logical = 0.546 CSS).

**Passes (no action):** HUD / pause / bubble clear of the notch and the home indicator on all 4 shapes; no mat ever overlaps the pole box,
pump, pad, Mimi, the bubble or the HUD (0 hits in 1 120 mat placements); the bubble steps back to 0.30 and the HUD to 0.35 whenever the
canopy floats under them (19 bubble / 3 HUD cases, all faded; the 2 unfaded hits were a short 1-line bubble the canopy passed below); chapter banner, pause, settings, Talk time fit in VI on every device; title layout clean
in both languages; Mimi's frames are consistent (idle ↔ pump: same hat / body, squash sy 0.91 → 1.03 spring, pump frame 0.2 s; look in
coast / chute; cheer at landing; dance at camp / done); all three surprises render at sensible spots (marmot burrow clear of mats, goat
on its rock below the horizon, bird on the pole top); answer colours readable on every mood (outlines carry them; see P2-6 for green on
rain); the countSeq / countSel signs and numerals read on all moods.

---

## P1 — fix before shipping

**P1-1 The rocket lands ON the chosen thing and hides it (every device, every topic).** The nozzle touches down at the mat centre, which is
exactly where the thing stands; the bottle (≈ 40 × 120) then covers the thing during `land` and the first part of `collect` (the thing
hops up *behind* the rocket: render order mats → … → rocket). The child loses sight of the very thing they picked at the reward moment
(the sign's numeral / letter is fully covered on "1", "H"…).
- Shots: `flow/iphone-portrait-en-m0-land.png`, `…-m0-collect.png`, `flow/iphone-portrait-en-m1-collect.png`, `flow/ipad-portrait-en-m2-land.png`.
- Fix (world.js `planFlight` target, render unchanged): land at `mat.x + side·0.30·S·ds`, `mat.y + 0.04·S·ds` (side = +1 if the mat is
  right of the pad, else −1; still inside the mat ellipse, half-width 0.5·S·ds) so the thing stays visible beside the bottle; the
  puddle ring centre follows the touchdown point. Also draw the collect hop (the thing while `thingHop > 0` in `collect`) and `w.flyer`
  **after** the landed rocket.

**P1-2 Landscape: Mimi and the rocket overlap at the pump (iPhone + iPad landscape).** pump.x = ins.left + 178, pad.x = ins.left + 236:
58 px apart. With Mimi on the plunger (pump frame, wings out, mimiH 180) her bill / front wing reach ≈ pump.x + 62, the bottle's left
edge is at pad.x − 22 → ≈ 25 px overlap; the rocket is drawn in front and cuts across her bill and cheek during the whole pump phase
(the core gesture).
- Shots: `pumpseq/iphone-landscape-0..3.png` (sheet `sheets/pumpseq.png`), `flow/iphone-landscape-en-m0-pump.png`, `flow/ipad-landscape-en-m1-pump.png`.
- Fix (MECHANICS §0.1 landscape row): pole / Mimi / pump / pad at ins.left + 26 / 96 / **160** / **262** (gap 102 px). Check: pad ≥ 90 +
  0.5·S·ds from the nearest mat is unaffected (mats stay ≥ 40 px right of camp.x1 = ins.left + 272); the aim tube tilt (≤ 0.6 rad) then
  leans away from Mimi. Portrait (gap 120) only touches bill ↔ bottle on the 3rd stomp squash — fine.

**P1-3 Phone portrait: mats and things too small, the meadow looks empty.** 393 × 852: the meadow below the horizon is 720 × 678
(y 499 → 1177); 2 mats at S·ds ≈ 150 (= 82 CSS px) with things itemH·ds ≈ 95 (52 CSS px) use ≈ 9 % of it; 300–400 px of bare grass
between the mats and the camp in most rounds; sign glyphs ≈ 20 CSS px tall, "10−6" / "7−4" ≈ 14 CSS px; the small ball (size topic) ≈ 24
CSS px; animals ≈ 40 CSS px. Phone landscape is similar (1 073 × 338 meadow, mats 82 CSS px, right third often empty).
- Shots: `sheets/ipp-a3.png` (all topics, age 3), `sheets/ipp-vi.png`, `topics/iphone-portrait-en-a3-sub.png`, `topics/iphone-landscape-en-a3-add.png`,
  `flow/iphone-portrait-en-m0-play.png`.
- Fix (`computeLayout`): when `phone && portrait`: S × 1.22 (ages ≤ 4: **208**, 5: 196, 6+: 180) and itemH = **0.70·S**; portrait horizon
  `play.y0 + 150` (mats a bit lower, nearer the camp); depth ds 0.86 → 1.0 instead of 0.82 (less shrink on a 680-tall meadow). Phone
  landscape: S × 1.1 (187 / 176 / 163), itemH 0.68·S. Sign text (`drawThing` tile / dots numeral): glyph ≥ 0.42·itemH (now ≈ 0.30). Re-run the
  `matHomes` fit test (11 viewports × 5 ages × m 2–3) — the portrait meadow has room for 3 × 208 easily; landscape 3 mats at 187 need
  the 14 px squeeze path at most.

## P2 — should fix

**P2-1 Bubble font falls to 12–13 CSS px for the first (chapter-opening) prompt on phones, mostly VI.** `bubble_fonts.json`:
iPhone portrait VI 98 / 375 wordings < 16 px (min **12.3 px**), EN 41 / 383 (min 13.4); iPhone landscape VI 88 / 374 (min 13.3); iPads ≥ 31 px.
Worst: "Mình phóng tên lửa nào! Bé đếm quả thông trên mỗi tấm biển nhé! Bé cho tên lửa đáp xuống tấm biển có 2 quả thông nhé!" (3 lines).
(The loop in `_fitBubble` also undershoots its own floor: 13.4 × 0.92 = 12.3.) Shots: `topics/iphone-portrait-vi-a6-initial.png`,
`topics/iphone-portrait-vi-a4-lower.png`, `topics/iphone-landscape-en-a3-initial.png`.
- Fix: world CONFIG `bubbleHPort` 124 → **150** on phones; landscape `bubbleMaxW` 700 → **960** when `phone` (iPhone landscape has 1 121 px free
  before `W − ins.right − bubbleRight`; the HUD is at x ≥ 1 293); clamp the fit loop at `Math.max(14, fs·0.92)`. Shorter VI openers would
  also help (drop "Mình phóng tên lửa nào!" when the opener has ≥ 2 sentences).

**P2-2 Rocket hangs almost sideways under the canopy (|swing| up to 1.13 rad = 65°).** 36 of 83 chute shots exceed DESIGN's 0.45; on
iPhone landscape every chute pop is 0.99–1.13 rad and still 0.75–1.03 in the "low" shots (canopy 0.45 rad, bottle nearly horizontal,
nose-first) — reads as "still flying", not "hanging". Shots: `flow/iphone-landscape-en-m3-chute.png`, `…-m1-chute.png`, `sheets/swing.png`.
- Fix (CONFIG flight): apply the soft wall from the pop (not only after the 0.3 + 0.15 s opening), wall **±0.5**; opening damping ζ 0.3 →
  0.5; drive 0.6·a/L → 0.35·a/L. Target: pop peak ≤ 0.6, steady sway ±0.25–0.4.

**P2-3 Pump numeral sits on the camp props.** `render.burst('count', pump.x, pump.y − mimiH − 40, size 70)` (main.js:391) lands on the log +
campfire in landscape (numeral centre (286, 395) vs log box x 242–318 y 375–397, campfire x 321–371 y 372–415, tent_a bottom 368) and on the
log in portrait ((240, 1192) vs log x 240–320 y 1192–1214). Shots: `sheets/pumpseq.png`, `flow/iphone-landscape-en-m0-pump.png`,
`flow/iphone-portrait-en-m0-pump.png`.
- Fix: add a keep box `{x: pump.x − 45, y: pump.y − mimiH − 95, w: 90, h: 90}` to `MeadowArt.keepBoxes` (props move away), or put the
  numeral on a cream disc `#FBF3DD` r 44 with the rim colour, so it always reads.

**P2-4 Pennants too small to read on phones.** 56 × 44 logical = **31 × 24 CSS px**; the icon on it ≈ 12 CSS px (a square vs a rectangle,
the pinecone count, the animal are guesswork). Done-screen garland pennants ≈ 20 CSS px, cream with tiny icons, crossing the golden mats.
Shots: `sheets/pennants.png` (native-res crops), `flow/iphone-portrait-en-done.png`, `flow/iphone-landscape-en-done.png`.
- Fix: CONFIG `pennantW 56 → 72`, `pennantH 44 → 56`, `pennantPitch 46 → 60` (4 slots = 240 + 24 < pole 442 portrait / 450 landscape);
  icon at 0.55·h. Garland: ≤ 8 pennants at 0.8× pole size, hung above the mats (y ≤ topmost golden mat − 40).

**P2-5 Aim arc nearly invisible.** White dots r 6 → 3.6 logical (3.3 → 2 CSS px), alpha fading to 0.4 at the mat end, shadow 0.28 — on the
light meadow the arc is hard to see, the end near the mat (the useful part) faintest. Shot: `pumpseq/arc-portrait.png` (`sheets/arc.png`),
`flow/*-m0-aim.png`.
- Fix (`MatArt.drawArc`): r **9 → 6**, alpha floor 0.75, shadow `rgba(36,52,40,0.4)` offset (2, 3), 18 points; or a 2 px dark-green ring
  `#4E7560` around each dot.

**P2-6 Green things on the rain meadow.** Answer green `#4CC26B` vs rain grass `#8FB385`: luminance ratio **1.03**, ΔE 34 (all other colour ×
mood pairs ΔE ≥ 53). The thing stands half over the mat (ΔE 59) and the outline `#2A8343` carries it, but a green flower (green stem +
green head) on a far, small, wet mat fades. Shots: `contrast/iphone-landscape-m2-gyr.png`, `contrast/iphone-portrait-m2-gyr.png`.
- Fix: `drawThing` light halo in rain (2.5 px `rgba(251,243,221,0.85)` stroke outside the outline when `wet > 0.3`), or rain grass
  → `#97B88E` with `near` mixed toward blue-grey (keep darkness ≤ 0.12).

**P2-7 Chute could be larger.** The open canopy is ≈ 110 logical (60 CSS px on phones) for a 120-long bottle; on a phone at the apex it is
a small object high on the screen. Shots: `flow/iphone-portrait-en-m0-chute.png`, `flow/iphone-landscape-en-m0-chute.png`.
- Fix: draw the canopy at `rocketS·1.3·chute` (render only; the attachment point stays at the nose).

## P3 — polish

- **P3-1 Talk mic button wraps in VI on iPhone portrait** ("Bé chạm hoặc nói đáp án / nhé!", 2 lines in a pill). `flow/iphone-portrait-vi-talk.png`.
  Fix: `ui.micLabel` VI short form "Chạm hoặc nói nhé!" or `white-space: nowrap; font-size: clamp(13px, 3.6vw, 18px)`.
- **P3-2 Settings toggle labels wrap in VI** ("Giọng của / Mimi") and are ≈ 11 CSS px in phone landscape. `flow/iphone-landscape-vi-settings.png`,
  `flow/iphone-portrait-vi-settings.png`. Fix: phone-landscape settings toggles in 2 columns, font ≥ 14 px.
- **P3-3 Landscape tent_b stands in the meadow** (box x 394–498, y 262–339 > camp.x1 380): a mat's thing comes within 0 px of it in 22
  phone-landscape shots (e.g. the pig in `flow/iphone-landscape-vi-m3-play.png`). Fix: clamp camp props to `x + w ≤ camp.x1 − 8`, or add the
  tent box to `hudKeep` like the windsock.
- **P3-4 Pump base touches the home indicator.** Phone portrait base plate bottom ≈ 817 CSS (safe bottom 818); landscape ≈ 373 (safe 372).
  Fine for tapping (the plunger is the target) but reads cramped. Fix: CONFIG `pumpUp` 66 → 76.
- **P3-5 Fountain rainbow overlaps the log / campfire** in portrait camp (`flow/iphone-portrait-en-m0-camp.png`) and the garland on the done
  screen (`flow/iphone-portrait-en-done.png`). Fix: rainbow arc radius 0.6× and drawn only above `pad.y − rocketH − 60`.
- **P3-6 Done screen (portrait):** the top golden mat sits right under the panel (`flow/iphone-portrait-en-done.png`); keep mats ≥ 30 px
  below `render.donePanel`.
- **P3-7 Bird on the pole is ≈ 22 CSS px on phones** (`surprise/iphone-portrait-en-surprise-bird.png`) — draw at 1.3×.

## Numbers used
| item | value |
|---|---|
| phone scale | 0.546 CSS / logical (both orientations); iPad portrait 1.139, landscape 0.756 |
| mat width (logical, median / min) | iPhone portrait 150 / 123, iPhone landscape 150 / 125, iPad 153–154 / 143 |
| bubble reserved height | phone portrait 67.7 CSS, landscape 73.1 CSS (never overflowed) |
| pump numeral | (pump.x, pump.y − mimiH − 40), size 70 |
| pennant | 56 × 44, pitch 46, slot 0 at pole.y1 + 24 |
| swing in chute shots | max 1.13 rad, 36 / 83 > 0.45 |
| colour vs rain grass | green 1.03 / ΔE 34, yellow 1.62 / 61, orange 1.11 / 70, red 1.63 / 84, blue 1.45 / 78, purple 2.50 / 97, pink 1.11 / 74 |
