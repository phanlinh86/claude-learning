# Visual QA — Bop's Rainy Band (2026-11-05)

Report only: no game file was changed. Tools: `tests/visual/rb_lib.js` (Playwright contexts, notch emulation, hand-stepped
world), `rb_capture.js` (sections `screens count seasons surprise talk contrast topics`), `rb_analyze.js` (contrast +
layout flags → `analysis.md`), `rb_sheet.py` (contact sheets), `rb_compact.py` (palette PNGs), `colour.js` (ΔE00).

```
RB_VIS_OUT=/tmp/rbvis node tests/visual/rb_capture.js      # ≈ 8 min, ≈ 400 PNGs (default output tests/out/visual, gitignored)
RB_VIS_OUT=/tmp/rbvis node tests/visual/rb_analyze.js
```

**Coverage.** 12 screens (title, settings, chapter banner, ask, flying note, wrong wobble, hint hand, pause, song playback,
Talk time, chapter stars, session done) × 4 viewports (iPhone 393×852 / 852×393, iPad 820×1180 / 1180×820) × EN + VI;
counting (drum ask + card, listen beats, listen ask, card after the right pick); the 4 seasons per viewport (ask + song);
every topic of ages 3–7 (6 viewport/language combos, round 3 so 4 members at 6–7); snail (in / tap / song) and shower
rounds on every viewport (forced via `w.cfg.surpriseTypes`, round 2); Talk time for every topic of every age (iPhone P/L,
iPad L); contrast probe sampled from the real canvas for all 7 palette colours × 4 seasons × 2 viewports.
Notch insets: `--sa-*` overridden (the `#safeProbe` padding that `readInsets()` reads): iPhone portrait 47 top / 34 bottom,
landscape 47 left + right / 21 bottom, iPad 24 / 20; unsafe zones painted pink + island / home bar black in the shots.
Curated screenshots in `docs/reports/visual/` (2.9 MB); full numbers in `docs/reports/visual/analysis.md`.

Capture caveat: the star/confetti piles over the song sheet in some shots (e.g. `surprise/iphoneL-shower.png`) are a
test artefact — `toAsk()` steps several rounds inside one frame, so every round's sparkles drain at once. Not a game bug.

**Passed.** No element in the notch / home-bar zones in any game screen; Vietnamese fits everywhere (bubble max 3 lines on
iPhone landscape, 174 logical px tall, no overflow; Talk choices never clipped; pause / done / settings fit); members are
≥ 100 logical px everywhere (S 131–172; CSS 72–94 pt on iPhones, 149–171 pt on iPads); the hint hand + glow is clearly
visible on all 4 viewports; the done screen is readable (title 26–28 px, big star count, two big buttons); ages ≤ 5 never
get a text-only Talk answer (only 6–7 numbers/parity are text, as intended); snail and shower rounds render on all viewports.

---

## P1 — fix before release

### P1-1 Song-sheet notes and empty circles are drawn at 2× their size → circles overlap each other, notes hit the bubble / HUD
- **Where:** every round, every viewport. `hi/sheet@3.png`, `screens/iphoneP-vi-04-ask.png`, `topics/iphoneL-vi-a7-oddeven.png`
  (5 dashed circles chained into each other), `screens/ipadP-vi-07-hint.png` (blue note's stem enters the speech bubble),
  `screens/iphoneL-en-09-song.png` + `screens/ipadL-vi-09-song.png` (popped notes touch the star pill / bubble edge),
  `seasons/iphoneP-L3-winter-song.png` (5 popped notes merge into one blob).
- **Values:** `render.js _sheet()` calls `_note(x, y, nr * 2 * sc, …)` with `nr = 34` → size 68; `band_art.drawNote(ctx, size)`
  uses `size` as the **radius** (`var R = size`). Empty circle Ø = 136 logical px but slots are `noteGap` 110 apart
  (26 px overlap per pair). Filled note: stem top at `y − 1.75R = y − 119`, ×1.4 on its song beat → `y − 167`.
  iPad portrait: note top 137 vs bubble bottom 163 (26 px into the bubble, 157 frames flagged).
  iPhone landscape song: popped note tops at y 48 vs HUD bottom 106 (x 911–1238 vs HUD x ≥ 1030).
  Flying notes (`_flyNote`, size 60 → R 60) are also 2× DESIGN's intent.
- **Fix:** `game/js/render.js` — in `_note()` pass `size / 2` to `BA().drawNote` (one line: `drawNote(g, size / 2, …)`), or
  change the callers to `_note(s.x, s.y + bob, nr * sc, …)` / `_flyNote … 30`. Result: circle Ø 68 (42 px gap), stem
  top `y − 60` (popped `y − 83`) — clear of the bubble on iPad portrait (sheet y 300 → top 240 > 163) and of the HUD.
  Re-run `rb_analyze.js`: the "sheet circles overlap" and "note under bubble/HUD" flags should disappear.

### P1-2 iPhone portrait: the counting card hides under the speech bubble
- **Where:** `count/iphoneP-vi-d-listen-right.png` (the "5" card's numeral cut by the bubble), `count/iphoneP-vi-a-drum-ask.png`.
- **Values:** layout card box `x 516, y 332, 180×150` (from `bubble.y + bubble.h + cardGap` with layout bubble y 196). The
  DOM bubble is really at **y 222–355** (logical) because `main.placeBubble()` pushes it under the HUD (HUD bottom 207 >
  layout bubble y 196) → 23 logical px (≈ 13 CSS px) of the card's top under the bubble. Same root cause pushes the bubble
  26 px lower than the layout everywhere on tall phones.
- **Fix:** `game/js/world.js` CONFIG `bubbleYPort: 110 → 140` (HUD row is ≈ 56 CSS pt = 103 logical + 10 top margin at
  s 0.546), so the layout bubble = the DOM bubble and the card/sheet are placed under the real bubble. Better long-term:
  `main.applySize()` passes the measured HUD bottom into `world.setViewport` (e.g. `ins.hudBottom`) and `computeLayout`
  uses `max(ins.top + bubbleYPort, hudBottom + 8)`.

### P1-3 Talk time "How many dots?" (ages 4–5): answer pictures are too small to count
- **Where:** `hi/talk-a4-count@3.png`, `talk/iphoneP-vi-a4-count.png`, `talk/iphoneL-vi-a5-count.png`.
- **Values:** choice canvas 64×64 CSS (`.talk-choices button canvas`), a tiny wooden number drum inside: numeral ≈ 10 CSS px
  tall, dots ≈ 4.7 CSS px Ø (3 px gap). A non-reader cannot count 4–5 dots that size; the question's picture (dice face)
  is 275×165 but the answers are what the child must tap.
- **Fix:** `game/js/ui.js _choiceVisual()` — for `number` at age ≤ 5 return a `{kind:'dots', n}` / number-card visual instead of
  a drum, and render it with `BandArt.drawNumberCard` (numeral + big dots) in `render.drawItemBody`; and in
  `game/css/style.css` add `.talk-choices button canvas { width: 88px; height: 88px }` for phones (≥ 10 px dots). Same
  applies to the listen-ask number drums on stage (P2-2).

---

## P2 — should fix

### P2-1 Natural-wood drums nearly vanish into the autumn garden; green drum vs the summer hedges
- **Where:** `seasons/ipadL-L2-autumn.png`, `topics/iphoneP-vi-a7-sub.png`, `count/iphoneL-vi-c-listen-ask.png` (wood number
  drums in front of tan trees); `contrast/ipadL-L1.png`.
- **Values (canvas-sampled):** wood shell `#E7C590` vs autumn garden behind the band `#D7BD92` (iPhone P) **ΔE00 3.7, WCAG
  1.10**; vs `#C5BD8D` (iPad L) ΔE00 9.2. Only the `#A8743F` rim (2.1–2.2:1) separates them. Every non-colour topic uses
  wood drums, so chapter 3 is the weakest. Colour drums: green `#61C077` vs summer garden `#9DC89B` **ΔE00 9.6** (iPad L),
  12.4 (iPhone P); yellow vs autumn garden ΔE00 14.0; orange vs the stage wood `#AE7C4B` ΔE00 15.8 (lowest vs wood).
  All other colour/background pairs ΔE00 ≥ 19 (table in `analysis.md`).
- **Fix:** `game/js/render.js _member()` — draw a soft cream halo/backplate behind each member (e.g. radial
  `rgba(255,250,235,.55)` ellipse 1.1 S × 0.95 S centred on the drum) so every member sits on a light pad whatever the
  season; and/or darken the wood outline for wood drums in `band_art.js` (`WOOD.dark #A8743F → #7E5530`, 3.4:1 vs the
  autumn garden). For green-in-summer, the halo is enough (or desaturate `env/mid_summer.svg` hedges 15 %).

### P2-2 Number drums on stage: count dots small for ages 3–4
- **Where:** `hi/listen-drums@3.png`, `count/iphoneP-vi-d-listen-right.png`.
- **Values:** on iPhone portrait the dots on `number` drums with `showDots` are ≈ 8 CSS px Ø (numeral ≈ 20 CSS px); on iPhone
  landscape (S 150 → 82 CSS) ≈ 6 px. Readable but tight for counting 5.
- **Fix:** `game/js/band_art.js` number-face painter: dot radius `0.055 S → 0.075 S` and put 4–5 dots on two rows
  (2+3 / 2+2) so they don't shrink to fit the label width.

### P2-3 Done screen (landscape): the 4th band drum is under the done panel; iPhone portrait: Bop's hat cut at x 0
- **Where:** `screens/iphoneL-vi-12-done.png` (green drum behind the panel at x ≈ 420 CSS), `screens/iphoneP-en-12-done.png`.
- **Values:** landscape `_doneScene` band `cx = ins.left + max(470, 0.36 W)` = 562 logical with 4 drums (≈ ±210 px) → right
  edge ≈ 770 vs panel left ≈ 733 logical (iPhone L). Portrait: Bop at `ins.left + 120`, sprite 300 → hat brim starts at −30.
- **Fix:** `game/js/render.js _doneScene()` — clamp the band so `cx + 1.5·S·k ≤ dp.x − 20` (use 3 drums when it doesn't fit),
  and Bop `bx = ins.left + (portrait ? 150 : 150)` with `bx ≥ ins.left + 0.5·h·(BOP.w/BOP.h) + 8`.

### P2-4 Song playback: popped notes collide with the HUD on phones in landscape
- Covered by P1-1's fix (with R halved the popped stem top is `y − 83` → y 116 vs HUD bottom 106). If the 2× size is kept on
  purpose, then instead raise `sheetTopLand` from 200 to 230 and cap `noteGap` to `≥ 2·R + 12`.

---

## P3 — polish

- **P3-1 Bop cut at the left edge** (iPad landscape, no inset): `layout.bop.x = ins.left + 130`, sprite 300 wide anchored at
  150 → hat brim from x −20 (`screens/ipadL-vi-09-song.png`, top-left). iPhone portrait −10, title screen too
  (`screens/iphoneP-vi-01-title.png`). Fix: `world.js` CONFIG `bopLand.dx 130 → 160`, `bopPort.dx 150 → 165`; title
  `render.js _titleScene` `bx` the same.
- **P3-2 Title (portrait): Bop's arm covers half of the red drum** (`screens/iphoneP-vi-01-title.png`). `_titleScene`
  `cx = W·0.62`; use `W·0.68` on portrait, or shrink the mini-band S to 100.
- **P3-3 Landscape: the big drum hides Bop's belly and both drumsticks** (14 % of Bop's box; `screens/iphoneL-vi-07-hint.png`).
  When he "drums" the sticks are behind the drum. CONFIG `bigDrumLand.dx 280 → 300` (or Bop `dx` 160 per P3-1) keeps the
  stick tips visible on the drum head.
- **P3-4 Done title wraps with an orphan** in VI ("…5 ngôi / sao!", `screens/iphoneL-vi-12-done.png`). `style.css`
  `#doneTitle { text-wrap: balance }`.
- **P3-5 Snail is small** (110 logical = 60 CSS pt on iPhones; `surprise/iphoneP-snail-song.png`) and sits low in the grass
  far from the band; `snailSize 110 → 140`. (Its 70 px tap radius is fine.)
- **P3-6 Shape rounds at age 5 are monochrome** (all three shapes blue → all song notes blue; `surprise/iphoneP-shower.png`).
  Intended same-colour distractor, but the song sheet loses its colour fun: colour the *note* by slot pitch for non-colour
  members (`render._noteColor`, e.g. pentatonic C D E G A → red, orange, yellow, green, blue).
- **P3-7 Settings checkboxes 26×26 CSS** (row labels are tappable, so OK for parents); iPhone landscape settings panel scrolls
  62 px (Done button needs a scroll). `style.css` landscape: two-column `.set-grid` already — reduce row gaps 10 px.

## Contrast summary (canvas-sampled, iPhone P / iPad L)
| season | garden behind band | weakest colour vs garden (ΔE00) | weakest vs stage wood | closest answer pair (normal / deutan / protan) |
|---|---|---|---|---|
| spring | `#C6D0B8` / `#AECCA2` | green 19.2 / 12.6 | orange 15.8 | yellow–orange 17.8 / 7.1 / green–orange 8.0 |
| summer | `#9FC6A8` / `#9DC89B` | green 12.4 / **9.6** | orange 15.9 | same |
| autumn | `#D7BD92` / `#C5BD8D` | yellow 14.0, orange 15.5; **wood drum 3.7** | orange 15.7 | same |
| winter | `#DFE2E6` / `#E2E8EC` | pink 26.6 | orange 15.9 | same |
Yellow+orange and green+orange are never in one set below age 5 (DESIGN §3), so the deutan/protan pairs only matter at
5+ where shapes/labels carry the answer too.
