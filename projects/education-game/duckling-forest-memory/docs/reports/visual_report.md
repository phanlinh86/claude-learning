# Visual QA report — Dee's Forest Memory (2026-11-02)

Report only, no game code was changed. Tools are in `tests/visual/`: `capture.js` (sections screens, topics, seasons, rewards, notch, short, flip), `lib.js`,
`measure.js` (text fit), `title_fit.js`, `analyze.js` (geometry + ΔE00), `palette_cvd.js`, `colorblind.py`, `sheets.sh`.
Raw shots are in `tests/out/visual/` (gitignored, 330 PNGs). Representative shots are in `docs/reports/visual/`.
Viewports tested: 393×852@3, 852×393@3, 820×1180@2 and 1180×820@2, each in EN and VI, plus 667×375, 812×375 and 375×667. Notch shots use
`--sa-*` overrides (P: top 59 / bottom 34; L: 59 / 59 / bottom 21; iPad: 24 / 20 CSS px). Every age from 3 to 7 was tested with every topic, in the
biggest round (round index 3), on 4 devices in EN and 2 in VI. All 4 seasons were tested, and rewards were checked late in a chapter.
Note for testers: `DM.debug.setSpeed()` clamps the speed to ≥ 0.1, so `setSpeed(0.0001)` cannot freeze a frame. The scripts freeze the world by
swapping `world.update` for a no-op (`D.freeze/D.adv/D.sync` in `lib.js`).
Confetti that lies in a horizontal line in the reward shots is a capture artefact: 9–15 bursts start in one real frame.

## Verdict
**No P1.** The cards meet the size rule everywhere. Faces are readable, flips look 3D and backs are identical. The title and done layouts fit on
every viewport. The weak spots are **where rewards settle** (lattices, rewards hidden under the HUD, overlapping animals) and **the DOM HUD and
bubble being bigger than the world layout assumes** on phones.

## Measured — passes
| check | result |
|---|---|
| card width (logical) | min 122.6 at ages 6–7 (rule ≥ 104) and min 169.1 at ages 3–4 (rule ≥ 120). 205 / 205 rounds OK. Smallest on screen: 81 CSS px (iPhone P notch, age 7, 2×5), 84.5 (iPhone L notch), 88 (SE / mini landscape) |
| gaps | min 14.7 (iPad P, 5×2); every measured neighbour gap = grid gap ≥ 14 |
| cards inside safe area, not over Dee or the HUD | 0 violations (205 rounds, incl. notch and short landscape) |
| card backs identical | mean \|Δ\| per channel vs card 0 ≤ 3.3 / 255 (sub-pixel resampling only) on 16 device × season frames |
| half-flip (`flip/*-halfflip*.png`, `8-halfflip-ok-ipadL.png`) | scaleX + skew ±0.06 reads as a real 3D turn; the shadow narrows with the card; the face/back switch at 0.5 is clean |
| faces readable | numerals and letters are big and bold; "2 + 16" is about half the numeral size and still clear at 92 CSS px; shapes and animals are distinct; big vs small is obvious (scale 0.6); I/l are absent |
| answer colours on the cream card front (ΔE00) | red 42, blue 43, yellow 24.6, green 31, orange 30, purple 47, pink 34 |
| colour rounds below age 5 (2 000 rounds per age, `palette_cvd.js`) | weakest pair: normal 29.9 (orange-red), deuteranopia 15.3 (orange-red), protanopia 12.4 (green-yellow). No blue+purple, red+green, yellow+orange or green+orange |
| card back / cream front vs the clearing (ΔE00, min over shots) | back 31.6–39.0 in every season; cream 10.4 (winter) to 16.0 (summer). The brown card outline carries the edge |
| title (`title_fit.js`) | logo, tagline, ▶, star pill and language chips clear Dee and the 3 cards on 7 viewports × 2 languages |
| bubble text | no overflow for any prompt or feedback line, EN or VI; font ≥ 19.1 CSS px on phones, 30 on iPad. Banner topic names stay ≥ 27.8 CSS px ("Chữ hoa, chữ thường") |
| Talk panel | no clipped labels; 1 row of choices, except VI colours on iPhone P and SE L (2 rows); buttons ≥ 50 CSS px |
| Dee | never covered by cards, bubble or rewards (Dee keep-out holds); yellow cards keep their distance from Dee |

## P2 — fix before release
**P2-1 Butterflies settle as a lattice in one corner** (`1-butterfly-lattice-iphoneL.png`, `screens/*-10-rewards-late.png`, `rewards/ipadL-a4-colors-late.png`)
- iPhone L and iPad L colour chapter: all 9 butterflies sit in a 3×3 grid at the top-left (spread 0.10–0.16 W × 0.17 H, min gap 6 px). iPad L stars do the same (3×5 block left of the board).
- They read as an inventory, not a forest. They are also small: 46 logical = 25 CSS px on phones.
- Cause: `CONFIG.perchTight: 3` picks among the 3 free perches closest to other rewards, on a regular `perchStep: 64` lattice.
- Fix (`world.js` CONFIG):
  - `perchTight: 3 → 0`, meaning: pick randomly among free perches whose gap to other rewards is ≥ 24 px, preferring the 8 with the largest gap.
  - Jitter each candidate by ±18 px x / ±12 px y (`perchJitter`).
  - Butterflies `PREF.butterfly = ['branch','ground','air']` already, but the branch rows only exist left of the board in landscape. Add flower
    perches on the ground row (kind `ground`, offset −s·0.6 already exists), so the order becomes `['ground','branch','air']` for every 2nd butterfly.

**P2-2 Rewards land under the DOM HUD** (`2-stars-under-hud-iphoneP-notch.png`)
- iPhone P notch: 4 of 15 star rewards (boxes at y 121, x 265–512 logical) sit under the HUD pill. The same happens on iPhone L, age 7 add
  (3 under the HUD or bubble), and on iPad L shapes (a lantern next to the star pill).
- Cause: the world keeps out `hudW 160 × hudH 96`, but the DOM HUD measures **404–439 × 88–103 logical** on phones (the HUD is sized in CSS px and
  `s = 0.546`). On iPad it measures 210 × 49.
- Fix (`main.js applySize`, after `computeView`):
  `world.cfg.hudW = hudRect.width / view.s + 12; world.cfg.hudH = (hudRect.bottom - view.top) / view.s - view.ins.top + 8;`
  Then call `world.setViewport`. If `#hud` is hidden at that moment, use a stored last size.
- Also drop the canopy perch row (`canopyDy 26`) where its x lies under the HUD.

**P2-3 Bubble touches the top card row on iPhone portrait, ages 6–7** (`3-bubble-touches-grid-iphoneP-a7.png`)
- 393×852, with and without notch: the DOM bubble bottom is at grid top + 0.7 logical px. The design needs 24 (`boardTopGap`).
- `placeBubble` moves the bubble to `hud.bottom + 8` = 135.6 instead of the layout's 120, because the HUD is 102.6 tall, not 96. A 2-line prompt
  then grows it to 133 tall (layout 124).
- Fix: the same measured `hudH` as P2-2 (it moves `bubble.y` and the board), plus `bubbleHPort: 124 → 136` in `world.js` CONFIG.
- Cost: cards shrink about 3 % (173 → 168 logical), still ≥ 104.

**P2-4 Ground animals and acorn piles overlap** (`4-animals-overlap-ipadP.png`)
- iPad P, 9 animals: 10 overlapping box pairs. The bunny is hidden behind the hedgehog, and mouse and frog overlap.
- Acorn piles: 12 overlaps (iPhone P and iPad P count chapters, `spread Y = 0`).
- Cause: `PREF.animal = ['ground','lily']`. When the ground row is full, `_perch` falls back to the least-overlap ground perch.
- Fix (`world.js`):
  - `PREF.animal = ['ground','lily','branch']`, `PREF.acorns = ['ground','lily','branch']`; acorns hanging on a branch are fine.
  - Add a 2nd ground row: `groundPerchDy: 72 → [72, 40]`, the back row drawn first.
  - Owl and squirrel already take branches first; do the same for bunny and frog when the ground is ≥ 80 % full.

**P2-5 Talk "big or small?" shows a different animal in the choices** (`5-talk-size-bunny-vs-bear-seL.png`)
- The picture is a small bunny, but the "nhỏ / to" (small / big) choice icons show a bear.
- A 3-year-old compares the bunny with the bear and is confused, and a single small card has nothing to compare against.
- Fix (`content.js makeTalk('size')`): draw the choice icons with the **same sprite** as `show`, at scale 0.6 / 1.0.

**P2-6 Parent toggles hidden on short landscape phones** (`6-settings-toggles-hidden-seL.png`)
- 667×375 and 812×375 (EN and VI): the 4 toggles (sound, music, voice, mic) sit faded under the sticky Done button. The panel scrolls 110 px
  (92 px on 852×393) with no visible cue.
- Fix (`style.css`, `@media (max-height: 430px)`):
  - `.set-row { margin: 2px 0 }`
  - `.set-row label { font-size: 17px }`
  - `.set-grid { grid-template-columns: repeat(4, 1fr); margin: 4px 0 }`
  - These save about 110 px. Alternatively put Age and Language on one row.

## P3 — polish
- **P3-1 Winter clearing panel is invisible** (`7-winter-clearing-ipadP.png`): panel vs forest ΔE00 is 2.5 on average (min 0.7) in winter and 4.8 in autumn,
  against 7.7–8.3 in spring and summer. The cards still read because of their outline, but the "clearing" disappears. Fix (`render.js PANEL[3]`):
  `['234,242,248', 0.6, '#C9D9E6'] → ['205,222,236', 0.75, '#A9C3DA']`; autumn `[2]` alpha `0.5 → 0.65`.
- **P3-2 Green butterfly on spring foliage**: worst reward ΔE00 is 10.0, while the median over all butterflies is 39. Add a 2 px white rim to
  `drawButterfly` wings (as the sticker border), or perch green butterflies on `air`/sky perches.
- **P3-3 Number and letter stars are tiny on phones**: 44 logical = 24 CSS px, with text ≈ 10 CSS px (`rewards/iphoneL-a7-add-late.png`).
  Raise `sizes.star 44 → 56`.
- **P3-4 Dots at 10–12**: 10 = 2×5 column using about 35 % of the card width, acorns ≈ 12 CSS px at 92 CSS px cards. The 1-dot card is about 3× bigger
  than the others. In `card_art.js` DOTS, use 3+4+3 for 10, and cap the 1–3 dot size to 1.6× the 10-dot size so counting compares like with like.
- **P3-5 Deck covers Dee's wing during the deal** (`screens/ipadL-en-04-deal.png`): the stack at `dee.x + 72` is drawn over Dee's lower right body for
  ≈ 0.5 s. Change `stackDx: 72 → 125` in `world.js` CONFIG, or draw `_stack` before `_dee`.
- **P3-6 Big empty bubble**: one short line in a 122–124 logical-tall box. On iPad it is a 640 × 140 CSS px white slab, and its tail points left
  toward nothing (Dee is at the bottom-left). Use `bubbleH 122 → 96` (landscape), let `min-height` follow the text, and point the tail down-left
  toward Dee.
- **P3-7 VI title wraps "Xanh" alone** on iPhone P, iPad P and SE P (3 lines). Add `<br>`-free `text-wrap: balance` on `.logo`, or a non-breaking space
  in `logo2` "Rừng Xanh".
- **P3-8 Talk picture is small on short landscape**: the card fills about 45 % of the 170 px `#talkShow` canvas. Draw it at 0.9 of the canvas height
  in `Renderer.preview`. Also, VI colours on SE L overflow 20 px (2 rows of choices): `.talk-choices` gap 6 px there.
- **P3-9 iPad P clearing panel tucks behind Dee's daisy** (panel pad below the grid ≈ 28 px, while the grid bottom stops 10 px above Dee's head).
  Change `boardDeeHeadGap: 10 → 30`.
- **P3-10 Colour-vision safety at age 5**: colour rounds at age 5 allow blue+purple (ΔE00 1.2 under deuteranopia) and pink. Faces differ only by
  colour, so either extend the "no confusable pair" rule to age 5 in `content.js` or give each colour its own wing-spot pattern.
- Lanterns in the done party float without a string or branch at the top edge, and one sits half behind the iPad L done panel. This is cosmetic.

## Screenshots (`docs/reports/visual/`)
1. `1-butterfly-lattice-iphoneL.png` (P2-1)
2. `2-stars-under-hud-iphoneP-notch.png` (P2-2)
3. `3-bubble-touches-grid-iphoneP-a7.png` (P2-3)
4. `4-animals-overlap-ipadP.png` (P2-4)
5. `5-talk-size-bunny-vs-bear-seL.png` (P2-5)
6. `6-settings-toggles-hidden-seL.png` (P2-6)
7. `7-winter-clearing-ipadP.png` (P3-1)
8. `8-halfflip-ok-ipadL.png` (pass: 3D flip)

## Re-run
`NODE_PATH=/opt/npm-tools/node_modules node tests/visual/capture.js` (≈ 15 min), then `node tests/visual/analyze.js`, `node tests/visual/measure.js`,
`node tests/visual/title_fit.js`, `node tests/visual/palette_cvd.js`, `sh tests/visual/sheets.sh`.

## Status after fixes (lead, 2026-11-02)
Fixed: P2-1 (spread, jittered perches — no more inventory grid), P2-2/P2-3 (main.js measures the real HUD + bubble and passes
`world.hudKeep`; rewards never perch under them), P2-4 (second ground row + branch fallback), P2-5 (size Talk icons use the
shown animal), P2-6 (tighter settings rows on short landscape phones), P3 age-5 colour rounds keep the colour-blind pairs.
Open (P3): winter clearing panel contrast, deck over Dee's wing while dealing, small number stars on phones, VI title wrap.
