# Visual QA report — Dino Nest Sort (2026-10-29)

Reviewer: visual QA / art director. I only reported. I did not change any game code.

## How it was captured
- `node tests/visual/capture.js [screens moods topics drag motion notch]` does the Playwright captures (isMobile + hasTouch, Chromium) into `tests/out/visual/`.
- `sh tests/visual/sheets.sh` builds the montages in `tests/out/visual/sheets/`.
- `python3 -I tests/visual/colorblind.py <png…>` writes deuteranopia/protanopia simulations (Machado 2009, linear RGB) to `tests/out/visual/cvd/`.
- `python3 -I tests/visual/palette_cvd.py` gives the CIE ΔE76 for each pair of answer colours.
- `node tests/visual/measure.js` measures DOM geometry (bubble, HUD and talk-panel overflow) and writes `tests/out/visual/measure.jsonl`.
- Devices: iPhone portrait 393×852@3, iPhone landscape 852×393@3, iPad portrait 820×1180@2, iPad landscape 1180×820@2. `measure.js` also checks iPhone SE landscape 667×375.
- 80 screen shots (4 devices × 2 languages × 10 screens), 16 mood shots, 44 topic shots (all 11 topics at the right age, in the rain mood as the worst case), drag shots, 5 motion sheets (50 ms frames) and 16 notch shots.

Main sheets to open: `sheets/screens_<dev>_<lang>.png`, `sheets/topics_<dev>-<lang>.png`, `sheets/moods.png`, `sheets/cvd.png`, `sheets/plates_iphoneL.png`, `sheets/notch.png`, `sheets/motion_*.png`, `sheets/drag.png`.

---

## P1 — fix before release

### P1-1 The Talk-time panel overflows on landscape phones, and the mic button is cut off
- Evidence: `screens/iphoneL-vi-07-talk.png`, `screens/iphoneL-en-07-talk.png`, `notch/iphoneL-*-talk.png`. From `measure.jsonl`:
  - iPhone 852×393, age 3 (picture choices): panel `scrollHeight 381` vs `clientHeight 361`, so it overflows by 20 px. The mic button bottom is at y = 397, past the 393 px viewport and under the home bar.
  - iPhone SE 667×375: it overflows by 38 px and the mic bottom is at 398 of 375.
  - Age 6 (number choices) just fits (364 of 380).
- Cause: in `style.css:159-167` the content stack for `max-height:430px` adds up to about 381 px, but only 343–361 px is available. The panel (`style.css:33`, `max-height:100%`) does not scroll, so the content spills out.
- Fix (style.css, inside `@media (max-height: 430px)`). Use a two-column layout so the preview goes beside the question:
  ```css
  .talk-panel { display:grid; grid-template-columns: 170px 1fr; grid-template-areas:"t t" "s q" "s c" "s m";
                column-gap:16px; align-items:center; max-width:760px; padding:10px 16px; }
  .talk-panel h2 { grid-area:t; font-size:24px; margin:0 0 4px; }
  .talk-panel #talkShow { grid-area:s; width:170px; }      /* 170×102 */
  .talk-q { grid-area:q; margin:0 0 6px; }
  .talk-choices { grid-area:c; }
  .mic-btn { grid-area:m; justify-self:center; margin-top:8px; min-height:48px; }
  ```
  The total height drops to about 300 px. If you prefer to keep one column, the minimum fix is `#talkShow{width:150px}` (90 px tall, was 126) plus `.talk-panel h2{font-size:24px;margin-bottom:2px}`. That saves about 46 px.

### P1-2 Portrait phones: items are spread over about 1,100 px of empty sky, far from the nests
- Evidence: `screens/iphoneP-en-04-round.png`, `sheets/topics_iphoneP-vi.png`, `moods/iphoneP-L*.png`, `drag/iphoneP-*.png`.
  - iPhone portrait has logical size 720×1561. `layout.play` = `{y:255, h:1087}`, and the nest top is at 1366 (`topics/layout.jsonl`).
  - An egg at y = 314 is about 1,050 logical px (≈570 CSS px) from its nest. A 3-year-old has to drag across most of the screen, and the whole upper half shows only sky.
  - Items are picked at random from a grid of about 4×8 points (`world.js:192`, `rng.shuffle(pts)`). So 3 sums can end up in one column at the far right (`topics/iphoneP-vi-add-a6.png`, `ipadP-en-add-a6.png`).
- Fix (world.js `computeLayout`, lines 121-140). In portrait only, cap the item band height and anchor it to the nests:
  ```js
  var playH = nestTop - cfg.playNestGap - py;
  if (portrait) { var cap = Math.round(0.85 * W);          // 612 at W=720
    if (playH > cap) { py = nestTop - cfg.playNestGap - cap; playH = cap; } }
  ```
  On iPhone portrait this gives `play = {y:730, h:612}`. The longest drag drops from 1,087 to ≤612 logical px, and iPad portrait (playH 597) is unchanged.
- Also in portrait, scale items ×1.2 (116 → 139 logical, 63 → 76 CSS px). For example, `SIZE_SCALE`, or `it.baseSize *= 1.2` when `layout.portrait` and `H/W > 1.8`. Spacing still fits: 4 columns × 3 rows ≥ 8 items.
- Fill the sky by scaling the landscape layers in portrait (`render.js:121-126`): `k = clamp((H/W)/1.6, 1, 1.4)`, which is 1.36 at 720×1561. Use `far.h = 420·k`, `mid.h = 360·k`, and draw the tiles scaled by k (`w = 1200·k`). The far hills then top out at about y = 800 instead of 950, right behind the new item band. The top 700 px is left for Bo, the bubble, the sun, clouds and the rainbow.
- Packing: replace the random pick with a spread pick. Shuffle the columns, take one point per column first, and prefer rows nearer the nests: `sort by (row distance to bottom) + rng jitter`.

### P1-3 In 'lower', lowercase l and uppercase I look identical
- Evidence: `crops/iphoneP-lower.png` (from `topics/iphoneP-vi-lower-a6.png`). The 'l' egg goes to nest L, but it is the same glyph as nest **I** in the rounded system font (SF Pro Rounded on iOS too). The game teaches a wrong match, and a child who matches what they see is marked wrong.
- Fix (content.js:58 `LETTER_POOL`): remove `I` from the pool for `lower` (and `initial`): `pool(lang).filter(c => topic !== 'lower' || c !== 'I')`. Alternatively, draw lowercase l with a tail in `render.js:345` / `render.js:274` by drawing it as a custom path.

---

## P2 — should fix

### P2-1 Shape and size sign plates have almost no contrast
- Evidence: `sheets/plates_iphoneL.png` (bottom row), `topics/*-shapes-*`, `topics/*-size-*`.
- `render.js:271` draws the shape **white** on the cream board (`sign.svg` ≈ #F6E6C4), with a thin outline. That is a contrast of about 1.2:1.
- `render.js:273` draws `egg_plain` (cream) on the cream board. The small egg is `ih*0.5` ≈ 29 logical px ≈ 16 CSS px on iPhone, and nearly invisible.
- Fix:
  - Shapes: use `drawShape(g, L.value, '#8a6a4a', ih*0.9, {flat:true})`, a dark silhouette (≈4.6:1 on cream).
  - Size: use the round's item egg colour (`egg_yellow` in the captures, or `egg_blue`) with `big ih*1.15` and `small ih*0.62`, `y: ih*0.18`.

### P2-2 Sign plates are small overall; count dots and parity hints are tiny
- `render.js:251` uses plate width `nw*0.44` (106 logical ≈ 58 CSS px on iPhone), but `CONFIG.signScale` is 0.55 (`world.js:48`). Use `nw*0.52` and centre it at `b.y + nw*0.21`.
- Count dots `render.js:285`: `d = ih*0.22` gives about 7 CSS px dots on iPhone (`plates_iphoneL.png`, the "2 ∘∘" plate). Use `d = ih*0.3`, number `ih*0.58`, number y `-ih*0.18`.
- Parity sub-line `render.js:278` (`'2 4 6'` at `ih*0.3` ≈ 9 CSS px): use `ih*0.36` with colour `#6e5238`. The parity words 'chẵn' and 'lẻ' fit well (`crops/iphoneP-oddeven-plate.png`).

### P2-3 Colour-blind safety: blue/purple, red/green and yellow/orange collapse
- `palette_cvd.py` (ΔE76, under 20 is hard to tell apart):

  | pair | normal | deut | prot |
  |---|---|---|---|
  | blue–purple | 37 | **4.5** | **8.9** |
  | red–green | 114 | **14.3** | 33 |
  | yellow–orange | 32 | **12.4** | 20 |

- Evidence: `cvd/iphoneL-en-07-talk_prot.png`, where the "purple" choice egg is the same blue as the question egg. Also `cvd/iphoneL-L*-colors_deut.png`.
- Colour nests are identified only by colour: the ribbon (`render.js:243-250`) and the egg on the plate. Fixes:
  - (a) Give each colour its own egg pattern in `tools/art_*`: red = big dots (current), blue = stripes, yellow = zig-zag, green = small dots, orange = rings, purple = stars. Draw the same pattern on the plate egg. A colour-blind child, or a parent, can then still sort.
  - (b) In `content.js`, do not put blue+purple, red+green or yellow+orange in the same round below age 4. Allow them in the same round only from age 5.
  - (c) Talk time: the `small` label under each choice already shows the colour word, which is good.

### P2-4 Level-done banner always shows 5 stars
- `render.js:422` always draws 5 stars under "Stars: 4" (`screens/*-09-leveldone.png`). This looks like a mismatch.
- Fix: draw `min(5, levelStars)` gold stars and the rest as `star_empty` (asset exists: `ui/star_empty.svg`). Better, show rounds × stars as 5 small stars, each filled if that round got 3 stars.

### P2-5 Bo's shadow hops with him, and the hop has no squash
- `render.js:363` passes `L.y - hop` into `_character`, and `render.js:374-375` draws the contact shadow at that same y. The shadow lifts off the ground with Bo (`sheets/motion_5_bo_cheer.png`). The title screen has the same issue (`render.js:390`).
- Fix: pass `hop` separately, keep the shadow at `L.y`, and set the shadow radius ×`(1 - hop/80)` and alpha ×`(1 - hop/60)`.
- Add landing squash: for 80 ms after each hop contact, `scale(1.08, 0.92)`, anchored at the feet. This uses the existing hop phase in `world.js:724`.

### P2-6 No feedback when an item is over the target nest
- `item.overNest` / `nestAt` are not used while dragging, and the renderer has no hover state (`render.js:216-253`). Toddlers benefit from a "this one?" cue.
- Fix: while held, compute `w.nestAt(it.x,it.y)` and draw that nest at `scale 1.05` with a soft rim glow (reuse the hint glow at 0.35 alpha). Do not tie the cue to right/wrong, so the hover never gives the answer away.

### P2-7 Portrait iPhone: the relocated bubble touches the top item row
- `main.js:76` moves the bubble below the HUD (`bubble.b = 138 CSS px`), but `play.y` stays 255 logical, which puts the item top at 140 CSS px. The gap is **2 px** (`measure.jsonl` iphoneP).
- The bubble is `z-index:4` and tappable, so a child reaching for the top egg taps the bubble instead (it repeats the prompt).
- Fix: in `computeLayout`, put `play.y = max(bo.y+10, bubble.y+bubble.h+hudH+16)` for portrait when `bubble.w < 300`. P1-2 makes this moot by moving the band to y = 730.

### P2-8 Done screen composition (portrait and iPad)
- `screens/iphoneP-*-10-done.png`, `ipadP-*-10-done.png`: Bo stays tiny in the top-left corner (layout Bo), the panel sits at the bottom (`style.css:148`), and the middle is empty sky. The confetti reads as a few pink specks: 70 pieces at 18–28 logical px (`render.js:445-448`), in 2 sprites.
- Fix:
  - When `mode==='done'`, draw Bo centred at `x=W/2`, `y=panelTop-20` (logical), at `h = min(300, H*0.25)`, using `bo_cheer` and the hop cycle from the title.
  - Confetti: 110 pieces, size 22–34, 4 tints. Rotate the hue of `confetti_a/b` or add yellow and blue variants.

### P2-9 Talk choices wrap 2+1 on iPhone portrait
- `measure.jsonl` iphoneP: 3 choices → 2 rows, because `style.css:134` has `min-width:108px` and 3×108 + 2×12 = 348 > 313 px available. The question image, 2 buttons and 1 orphan look unbalanced (`notch/iphoneP-*-talk.png`).
- Fix: `@media (max-width: 430px){ .talk-choices{gap:8px} .talk-choices button{min-width:90px; padding:6px 8px} }`, which fits as 3×90 + 16 = 286. In VI the mic label wraps to 2 lines (`notch/iphoneP-vi-talk.png`). Use `font-size:18px` there.

---

## P3 — polish

1. **Rain darkness covers the whole portrait screen.** `render.js:175` fills `rgba(30,40,60,.25)` over the full H. On 720×1561 the screen becomes a large grey slab (`moods/iphoneP-L2-colors.png`). Use a vertical gradient (0.28 at the top → 0.12 at `groundY`) so the nests and items stay bright. Items stay readable in all moods. The orange egg on the evening sky (L3) is the weakest at ~2.0:1 against the background, but its dark outline `#C4650C` carries it.
2. **Sun hidden behind the bubble in portrait.** `render.js:163` puts the sun at `x=W*0.64, y=ins.top+150`, which is under the bubble on iPhone and iPad portrait (`moods/ipadP-L0`). In portrait use `x=W*0.82, y=bubble.y+bubble.h+90`.
3. **Volcano face.** The volcano's closed eyes and blush (`far.svg`) peek out behind items near centre screen and read as an extra "character" (`screens/iphoneL-vi-04-round.png`). Fine as is, but lower the far-layer face opacity to 0.6.
4. **Drag swing.** `sheets/motion_1_drag_swing.png` shows the tilt leading the motion, then about 1.5 swings that settle within ~1 s. The lift is ×1.12 and the shadow drops to `+0.85 s` and grows lighter. This reads well. You could raise `tiltMax` to 0.5 and `liftScale` to 1.15 for a bit more "pick-up" feel at toddler scale.
5. **Flight and landing.** `sheets/motion_2_fly_land.png`: the arc, the shrink to slot size, and the drop between `nest_back` and `nest_front` (z-order correct) all work. So do the gold ring and sparkles. The egg sits about half hidden by the nest front. That is acceptable, but raise the slot y by `0.08·s` (`world.js:202`) so more of the item shows (letters, sums).
6. **Wrong drop.** `sheets/motion_3_wrong_return.png`: the ring and return arc are clear. The nest shake (`shakePx:10`) is almost invisible at phone scale (≈5 CSS px). Use 14 px, or rotate the nest by ±0.06 rad.
7. **Appear pop.** easeOutBack plus the puff is fine (`sheets/motion_4_appear_pop.png`).
8. **Weather layering.** Front rain (alpha 0.3–0.5) and front leaves draw over items and nests (`render.js:183`). They are translucent and do not hide labels in any capture. Keep the front pollen ≤ 3.
9. **iPad Talk panel.** The panel is capped at 640 px and the choice canvases at 64 px (`style.css:33,138`), so they look small on iPad. Add `@media (min-width:768px) and (min-height:700px){ .panel{max-width:760px} .talk-choices button{min-width:140px;min-height:130px} .talk-choices button canvas{width:88px;height:88px} }`.
10. **Notch / home bar.** With the inset simulation (`sheets/notch.png`), nothing important sits under the sensor housing or the home bar. The HUD, the bubble, Bo (at `ins.left+105`), the title chips and the gear all respect the insets. The only offender is the talk mic button in landscape (P1-1).
11. **Title.** The VI logo wraps cleanly in portrait ("Khủng Long / Bo Xếp Tổ"). In landscape the VI logo is wide (≈1,190 of 2,556 px) and sits close to the language chips. Use `max-width:80vw` on `.logo` (`style.css:59`). Portrait title is fine: Bo stands at the bottom and the play button is centred, as intended.
12. **Bubble text.** 17 CSS px on phones and 30 px on iPad (`ui.js:91`). The VI prompts fit in 2 lines everywhere, and the bubble never overlaps the HUD (`measure.jsonl overlapHud:false`).

## What already works
- The landscape layouts (iPhone and iPad) are well balanced: items sit just above the nests, and Bo, the bubble and the HUD do not collide.
- Sums like `2+4` and `8−1` and numbers up to 15 are legible on eggs, at 0.34·s for 3 characters.
- Plates for letters, numbers and the parity words (EN and VI) are legible.
- All Vietnamese strings fit the buttons, the banner ("Chương 1 / Màu sắc"), the settings panel and the bubble.
- Z-order is correct: items in a nest sit between the back and front, the held item is drawn on top, and particles go in their layers.
