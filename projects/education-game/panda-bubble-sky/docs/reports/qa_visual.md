# Visual QA report: Bao's Bubble Sky (2026-11-13)

This report only lists findings. No file under `game/` was changed.

## How it was tested
- **Scripts** (new, in `tests/qa/`):
  - `visual_flow.js` captures every screen of one session: title, settings, chapter banner, blow, ask, wrong squish, hint hand, pop, freed-thing flight, rainbow done, whoosh, pause, Talk time and session done.
  - `visual_topics.js` captures every topic for ages 3–7 at round 3 (the round with the most bubbles). Each topic is shown in a different season. It also catches the countSel counting moment, the animal home badge and a half-painted rainbow (k ≥ 2).
  - `visual_contrast.js` + `contrast.py` force every answer colour into a colours round in each of the 4 seasons and measure WCAG contrast on the rendered pixels.
  - `visual_sizes.js` reads the in-game sizes in CSS px for every device and age.
  - `visual_done.js` captures the celebration over time.
  - `visual_geom.js` holds the shared helpers: device and notch emulation, plus in-page overlap, safe-area and overflow checks.
  - Raw output goes to `tests/out/qa_visual/`.
- **Viewports** at DPR 1, with notch insets emulated through `--sa-*` overrides:
  - iPhone 393×852 (top 47 / bottom 34)
  - iPhone 852×393 (left/right 47, bottom 21)
  - iPad 820×1180 and 1180×820 (top 24 / bottom 20)
  - All in EN and VI.
- `tests/visual/screens.js` is still the **Bo's Farm Parade** script (it reads `w.members`, `L.barn`, `L.bo`). It cannot run on this game. The `tests/qa/visual_*.js` scripts replace it. See P3-8.

## What passes
- **Overlaps:** none in 56 flow screenshots and 33 topic screenshots. No bubble sat under the speech bubble or the HUD, sat on Bao, or crossed a safe edge. Bubbles never overlapped each other, and the speech bubble never touched the HUD. The only flags came during the *blow*, when a growing bubble sits on Bao's wand. That is by design.
- **Insets:** no DOM control, panel or speech bubble is cut by the emulated insets. On iPhone landscape, Bao, the speech bubble and the language buttons all clear the 47 px side inset.
- **Vietnamese text:** no speech-bubble overflow in either language. Diacritics (ấ ả ổ ộ ợ ữ) render crisply in the DOM text and in the canvas banner and tiles. The logo's stacked marks at `line-height .95` do not collide.
- **Bao:** the same body appears in every frame (idle, blow, think/oops, cheer, wave, dance). He is cute, with clear catch-lights, a cream bandana and no answer colours (`shots/ok_bao_frames_ipad.png`).
- **Things inside bubbles:** drawn untinted. The rendered fill equals the palette hex (ratio 1.00 in every season). The white halo and dark outline keep them readable.
- **Rainbow pieces:** each lands where its thing flies. In a k=3 round the second thing reaches the arch-top piece (logical 360, 986) and that piece paints there.
- **iPad (both orientations):** looks polished. Bubbles are 171 CSS px, things 103 px, Bao 251–273 px (`shots/ok_ask_ipad_land_vi.png`).

---

## P1: fix before release

### P1-1 Counting stars are far too small to count on iPhone (ages 4–7)
- **Screenshot:** `shots/p1_count_stars_age6_iphone.png` (age 6, "Bong bóng nào có 11 ngôi sao nhỉ?")
- **Measured** (`visual_sizes.js`, star outer diameter / closest gap between two stars, CSS px). The stars are drawn on a cream disc inside a bubble only 76–90 px wide.

  | Device | Ages 3–4 (n ≤ 5) | Age 5 (n ≤ 10) | Ages 6–7 (n ≤ 12) |
  |---|---|---|---|
  | iPhone portrait | 13.9 / 1.2 | 9.8 / 0.9 | 8.6 / 0.8 |
  | iPhone landscape | 12.6 / 1.1 | 8.9 / 0.8 | 7.8 / 0.7 |
  | iPad | 26.3 / 2.4 | 18.6 / 1.7 | 16.4 / 1.5 |

- **Why it matters:** stars about 8 px wide with under 1 px gaps merge into a gold blob. A child cannot count 11 of them, and in countSel the answer depends on exactly that count.
- Two causes:
  1. `drawThing` draws at `1.2·R`, and the star layout uses only about 60 % of that box (`rs` is capped at 22 units in `starLayoutU`).
  2. `starLayout(n, maxN)` shrinks **every** bubble's stars to the size of the round's largest count. So the "3" bubble also gets 8 px stars.
- **Fix:**
  1. `render.js` `_bubble` / `_freed`: draw `kind:'stars'` at `1.55 * r` instead of `1.2 * r`. The film edge still clears it.
  2. `bubble_art.js` `starLayoutU`: lay stars out on a pitch of `2.35·rs`, which gives about 0.35·rs of gap.
  3. Drop the `maxN` equalisation for n ≤ 6. If it stays for larger counts, keep stars at least 14 CSS px on iPhone.
  4. Raise the bubble size for counting rounds on phones (see P2-1).
- **Target:** stars ≥ 14 CSS px with gaps ≥ 3 px at n = 12 on iPhone.

### P1-2 The countSel "count aloud" moment does not enlarge the stars
- **Screenshot:** `shots/p1_count_moment_age6_iphone.png`
- **What happens:** while Bao counts "Một, hai, … mười một!", the freed star group keeps `fs = 1`, a 46 px box. It stays near the top edge, right under the speech bubble. The numeral "1" sits about 20 px below the bubble's bottom edge. The lit-star rings (`drawStarCount`, `rs·1.22`) are about 10 px circles.
- **Why it matters:** this is the one moment meant to teach counting, and the child cannot follow which star is being counted.
- **Fix:** in `world.js` `_stepFreed`, for `fstate === 'count'`:
  - ease `b.fs` to 2.2 (new `cfg.countScale: 2.2`);
  - move `fx/fy` toward the field centre (`_fieldCentre()`), clamped to at least `bubble bottom + 0.6·thingSize·countScale`.
  
  Then let the flight start from there (`_fs0` already carries the scale into the flight).

---

## P2: should fix

### P2-1 iPhone portrait looks empty, and Bao and the bubbles are small
- **Screenshots:** `shots/p2_portrait_empty_small_bao_iphone.png`, compared with `shots/ok_ask_ipad_land_vi.png`
- **Measured** (393×852, s = 0.546):
  - bubble 90 px (age 3–4), 83 px (age 5), 76 px (age 6–7); thing 46–56 px;
  - Bao 120 px tall, which is 14 % of the screen height (iPad: 21–23 %);
  - the field is 498×850 logical for 3–6 bubbles, so about 60 % of the sky is empty.
  
  iPhone landscape is similar: bubbles 69–82 px, things 41–49 px.
- **Fix** (`world.js` `CONFIG` / `computeLayout`):
  - when `L.phone`, multiply the bubble size by `cfg.phoneK = 1.25` before the fit loop (the fit loop still shrinks it if n homes don't fit). Portrait age 4 becomes 206 logical = 112 CSS px. Portrait has the room;
  - set `baoHPort: 220 → 290` when `L.phone && L.portrait`, which gives about 160 CSS px;
  - with the field and rainbow change in P2-3, this fills the screen.

### P2-2 The rainbow guide (the goal the child paints) is invisible during play
- **Screenshot:** `shots/p2_rainbow_guide_invisible_ipad_crop.png` (the arc runs through this crop, and nothing shows)
- **Measured:** the guide is 60 % white dots plus a 10 % white fill (`bubble_art.js` `drawRainbow`, the guide block). Over the pale floor and sky (#EDEDF7) the dots render about #F8F8FC, a contrast of **1.10:1**. Before the first pop the child sees no arch, so "paint a rainbow" has nothing to aim at.
- **Fix:** in `drawRainbow`'s guide:
  - stroke the dots in a soft lilac, `rgba(142,134,200,0.55)` (computed 1.6–1.7:1 on the spring, summer and autumn backgrounds);
  - fill the unpainted band with `rgba(185,178,238,0.16)`;
  - raise the dot size to `max(3, w*0.1)`.
  
  This stays pastel but becomes visible.

### P2-3 In portrait the arch sits under the bubble field, and its left foot lands behind Bao
- **Screenshots:** `shots/p2_rainbow_done_iphone.png`, `shots/p2_flight_tiny_bubbles_over_arch_iphone.png`
- **Measured** (iPhone portrait):
  - the rainbow top is y 961 logical, but `field.y1` = 1222, so the lower bubble rows float on the arch and cover painted pieces;
  - `rainbow.cx − r` = 45, while Bao's box spans x 26–222. The left foot is drawn over the cushion region and disappears behind Bao's head (178 logical px of horizontal overlap).
- **Fix** (`world.js` `computeLayout`, portrait branch):
  - set `f.y1 = min(f.y1, rainbow.cy − rainbow.r − 0.5·d)`. Height is ample;
  - move the arch right of Bao: `cx = max(field centre, bao.box.x + bao.box.w + r·0.15)`, or shrink `r` so `cx − r ≥ bao.box.x + bao.box.w − 20`.

### P2-4 Freed things shrink to a speck in flight
- **Screenshot:** `shots/p2_flight_tiny_bubbles_over_arch_iphone.png` (the pink oval is about 10 CSS px)
- **Measured:** `cfg.flyScale` 0.35, so a 50 px thing lands at about 17 px on iPhone (36 px on iPad). The eye loses it, and the "thing paints the piece" link is weak.
- **Fix:**
  - `world.js` CONFIG: `flyScale: 0.35 → 0.6`;
  - optional: a `burst('ring')` at the piece on `paint` in `main.js` / `render.js`.

### P2-5 The animal home badge is small and brief
- **Screenshot:** `shots/p2_home_badge_tiny_iphone.png`
- **Measured:** badge radius `0.32·thingSize` gives a 29–36 CSS px badge on iPhone, held 0.9 s (`cfg.badgeHold`). The horse also hops to y ≈ 230 CSS, about 45 px under the speech bubble.
- **Fix** (`world.js`):
  - badge `r: 0.32 → 0.5 * L.thingSize`;
  - `badgeHold: 0.9 → 1.4`;
  - set `fs` to 1.4 during `'badge'` (same mechanism as P1-2), so "who lives on the farm" is actually seen.

### P2-6 Yellow (and autumn orange) answer outlines fall below 3:1
- **Screenshot:** `shots/p2_yellow_orange_outline_crops.png`
- **Measured** (`tests/qa/contrast.py`, rendered pixels, worst bubble per season). Columns are fill against background, then outline against background.

  | Colour | Spring | Summer | Autumn | Winter |
  |---|---|---|---|---|
  | yellow | 1.24 / 2.23 | 1.29 / 2.32 | **1.14 / 2.05** | 1.16 / 2.08 |
  | orange | 1.82 / 3.46 | 1.76 / 3.35 | **1.62 / 3.07** | 1.70 / 3.24 |
  | pink | 2.01 / 3.87 | 1.73 / 3.34 | 1.67 / 3.22 | 1.78 / 3.44 |
  | green | 2.09 / 4.37 | 1.92 / 4.00 | 1.92 / 4.00 | 1.91 / 3.99 |
  | blue, red, purple | ≥ 2.56 / ≥ 5.06 | | | |

  Backgrounds measured inside the film: spring #EDEDF7, summer #E8F4FD, autumn #FAE1C4, winter #E0E7F3. Autumn's peach sky is the weakest case for yellow.
- **Fix:** in `bubble_art.js`, use a deeper **outline-only** tone for yellow inside bubbles, keeping `PB.PALETTE.yellow.dark` for other uses:
  - yellow `#C99A12 → #9A6F00` (computed ≥ 3.58:1 on every season);
  - orange `#C4650C → #A85A00` (≥ 4.0:1).
  
  The white halo stays.

### P2-7 The celebration is sparse, and on iPhone landscape the panel hides the rainbow top
- **Screenshots:** `shots/p2_done_sparse_ipad_portrait_5s.png`, `shots/p2_done_panel_covers_rainbow_iphone_land.png`
- **Sparse:** DESIGN asks for "a sky full of bubbles", but at 1.5 s, 3 s, 5 s and 8 s there are 0–5 bubbles on screen. `render.js` `_doneScene` spawns only when `Math.floor(t / 1.8) % 3 === 0` (1.8 s out of every 5.4 s), at most 16, with life 1.6–3.4 s. **Fix:**
  - spawn on 2 of every 3 bars (`% 3 !== 2`);
  - spawn interval `0.22 → 0.14`;
  - cap `16 → 26`;
  - life `[2.4, 4.5]`;
  - also launch a few bubbles from the screen bottom (`x` random across W).
- **Panel over the rainbow:** on iPhone landscape the done panel bottom sits at about 275 logical, while the arch top is at 212. **Fix:** in `_doneScene`, draw with `r = min(L.rainbow.r, L.rainbow.cy − panelBottomLogical − 24)`. Alternatively, `style.css` `@media (orientation: landscape) and (max-height: 500px)` can place `#scrDone` right-aligned (`justify-content: flex-end; padding-right: calc(var(--sa-r) + 16px)`) so the arch stays clear.
- Bao does alternate between dance, cheer and blow frames. That part is fine.

---

## P3: polish

1. **Vietnamese logo orphan.** "Gấu Trúc Bảo / Thổi Bong / **Bóng**" wraps to 3 lines on iPhone and iPad portrait (`shots/p3_title_vi_logo_orphan_iphone.png`, `shots/p3_title_vi_ipad_portrait.png`). `text-wrap: balance` sits on each `<span>`, but `#logo2` is `inline-block`, so it balances inside the span only. **Fix** in `style.css`: `#logo2 { white-space: nowrap; font-size: .82em }` in portrait, or `max-width: 90vw` on `.logo` for VI (`html[lang=vi] .logo`).
2. **Orphan words in the speech bubble.** Examples: "Can you find the purple one? Pop / it!" (iPad landscape, functional `9-kite`) and "So many rainbows! 13 / stars!" (done title). **Fix:** `#bubbleText, #doneTitle { text-wrap: balance; }` in `style.css`.
3. **Tile glyphs are small on iPhone.** For 3–4-character sums ("14+6", "10−5") the glyph is 10.9–13.7 CSS px (portrait) and 9.9–12.4 px (landscape). Single letters are 19–23 px (`shots/p2_tiles_add_age7_iphone.png`). They are readable for ages 6–7, but tight. **Fix:** draw `kind:'tile'` at `1.45·r` in `render.js` (the tile card is 84 of 100 units wide), and/or raise `signText` maxH `24 → 28` for n ≥ 4 in `bubble_art.js` `drawTile`.
4. **Talk time on iPhone landscape.** The shown thing is a 170 px canvas with the duck at about 60 px, and the question line is offset right of the title (`shots/p3_talk_iphone_land.png`). On iPad portrait the panel uses only the top 40 % (`shots/p3_talk_ipad_portrait.png`). **Fix** in `style.css`:
   - landscape phone grid column `170px → 200px`, and centre `.talk-q` (`text-align: center; grid-column: 1 / -1`);
   - iPad portrait `#talkShow { width: 380px }` and choice cards at least 140 px.
5. **Wand film.** The film inside Bao's wand ring is not visible (white at 0.25 on a pale sky). DESIGN §3 asks for "soap film inside the ring + iridescent edge". **Fix** in `tools/art_bao.py`: raise film opacity to about 0.45 and add a thin cyan → lilac edge, then regenerate.
6. **Speech text shrinks on iPhone landscape.** Two-line VI prompts shrink to 14.5 px. That is fine for a parent, but it could use the free width: the bubble is 560 logical px wide while 700+ is free left of the HUD. **Fix:** `world.js` CONFIG `bubbleMaxW` 560 → 700 for `phone && !portrait`.
7. **Title in iPhone landscape.** The rainbow runs behind the logo and the tagline pill. It is readable because of the outline, but busy. **Fix:** `render.js` `_titleScene` could draw the title rainbow at `alpha 0.55` in landscape phones.
8. **Stale visual script.** `tests/visual/screens.js` is the parade's script and would throw. Replace it with `tests/qa/visual_flow.js` and `visual_topics.js`, or delete it.

## Screenshot index (`docs/reports/shots/`, 21 PNGs, about 1 MB)
- **P1:** `p1_count_stars_age6_iphone`, `p1_count_moment_age6_iphone`
- **P2:** `p2_portrait_empty_small_bao_iphone`, `p2_rainbow_guide_invisible_ipad_crop`, `p2_rainbow_done_iphone`, `p2_flight_tiny_bubbles_over_arch_iphone`, `p2_home_badge_tiny_iphone`, `p2_yellow_orange_outline_crops`, `p2_done_sparse_ipad_portrait_5s`, `p2_done_panel_covers_rainbow_iphone_land`, `p2_tiles_add_age7_iphone`
- **P3:** `p3_title_vi_logo_orphan_iphone`, `p3_title_vi_ipad_portrait`, `p3_talk_iphone_land`, `p3_talk_ipad_portrait`
- **Good references:** `ok_ask_iphone_land_vi`, `ok_ask_ipad_land_vi`, `ok_hint_iphone`, `ok_banner_iphone`, `ok_letters_winter_iphone`, `ok_bao_frames_ipad`

Re-run any capture, for example: `DEV=ip-p QLANG=vi node tests/qa/visual_flow.js`, `AGE=6 DEV=ip-p QLANG=vi node tests/qa/visual_topics.js`, `DPR=2 DEV=ip-p node tests/qa/visual_contrast.js && python3 tests/qa/contrast.py ip-p 2`, `node tests/qa/visual_sizes.js`.
