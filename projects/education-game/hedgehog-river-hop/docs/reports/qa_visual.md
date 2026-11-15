# Visual QA report — Nim's River Hop (2026-11-15)

Report-only pass by the visual QA tester. Nothing under `game/` or the existing tests was changed.

## How it was tested
- `tests/qa/visual_capture.js <device> <lang> [notch] [main|ages]` loads the game with URL flags (`mute`, `seed`, `age`, `lang`),
  drives it through `NH.debug` and saves a screenshot plus a measurement for every screen. A measurement is taken in the page
  (`tests/qa/visual_lib.js`). It records the DOM rects (bubble, HUD, panels, buttons), text overflow, controls that sit
  under the safe-area insets, and Nim's art box (`NIM_POINTS.box` scaled, no tap padding). It also records each thing's box
  and the canvas pixels around each stone: water, stone top and the banks.
- The screens captured are: title, settings, chapter banner, play in the four seasons (colours at age 4 and at age 5 with
  pink, plus shapes, count, animals and count), a wrong tap (wobble), the hint hand, a hop in mid-air, Nim on each row, the
  bank roll, the fruit sticking, the fruit on his back, the wipe, pause, the countSel count, the home badge, Talk time, the
  chapter stars, 3 fruits on his back and done.
- The device matrix is iPhone 393×852 @2x and 852×393 @2x, plus iPad 820×1180 and 1180×820. Each was run in EN and VI,
  which gives 8 × 31 shots.
- The iPhone shapes were run again with notch insets, set by overriding `--sa-*`: portrait top 59 / bottom 34, landscape
  left/right 59 / bottom 21. That adds 4 × 31 shots.
- Every topic at ages 3, 4, 5, 6 and 7 was captured, one round each (round 1, not the warm-up) plus its Talk time. This
  ran on iPhone portrait EN/VI and landscape VI, giving 112 shots. In the landscape VI ages run, age 5 count and letters
  timed out under machine load. Both topics are covered in the portrait runs.
- During 4 full bot sessions per run (ages 4, 6, 3 and 7), a 30 ms sampler recorded the worst overlap of Nim or a thing
  with the bubble band, the HUD and the safe screen.
- `tests/qa/visual_edges.js` then replayed sessions until the worst case appeared and froze it for a screenshot. The cases
  are Nim off an edge, Nim standing under the bubble, and Nim mid-hop under the bubble.
- `tests/qa/visual_analyze.js` prints all of this. It also gives answer-colour distance against the local background as
  CIEDE2000 ΔE and WCAG contrast.
- All screenshots are in `tests/out/qa_visual/` (gitignored). Below, a path like `iphone-landscape-vi/17-hop-midair.png`
  is relative to that folder. Units: **CSS px** unless marked *logical* (the 720-short-side world). iPhone scale s = 0.546.

## P1 — fix before release

### P1-1 Landscape phone: Nim disappears under the speech bubble while he hops to (or stands on) a top-row stone
- **Mid-air (worst case):** 56 CSS px (102.7 logical) of Nim's 84 CSS px height is under the visible DOM bubble, so
  about two thirds of him is hidden. Screenshot: `edges-iphone-landscape-vi/air-age3.png`.
- **Mid-air, normal round 0 hop:**
  - `iphone-landscape-vi-notch/17-hop-midair.png`: 43.1 px hidden (Nim top 39.1, bubble bottom 82.2).
  - `iphone-landscape-en-notch/26-home-badge.png`: 53.2 px.
  - `iphone-landscape-en/17-hop-midair.png`: 22 px with a one-line bubble.
- **Standing on a top-row stone:** the sampler found Nim's head up to 40.9 logical (22 CSS px) into the bubble band.
  - VI-notch age 6 / age 7 sessions; 37 of 519 sampled play frames at age 7.
  - EN age 6, row 0, k = 4: 33.6 logical over Nim's full width (dx 178 logical).
  - Screenshots: `edges-iphone-landscape-vi/bubble-age5.png`, `edges-iphone-landscape-en-notch/bubble-age3.png`.
  - Usually it is only his spines and fruit at the bubble's lower edge or rounded corner. The flight is the real problem.
- **Vietnamese** makes it worse: VI prompts are nearly always two lines, so the bubble's real bottom is 82 CSS px, not 61.
- **iPad and portrait:** 0 overlaps in all sessions.
- **Probable cause:**
  - `game/js/world.js:139` (`hopApex` = max(70, 0.2·|dx|) above the higher end) and `world.js:858` (`_takeOff`). The apex
    is never limited by the bubble band.
  - `world.js:227`: the landscape across range `a0 = top + landTopGap + itemH` keeps the *thing* (0.62·S ≈ 79 logical)
    clear of the band. Nim is 190 logical tall, so a Nim standing on that stone pokes about 40 logical above it.
- **Suggested fix**, any one of these:
  1. In `_takeOff`, cap the apex to `A = min(A, max(20, min(y0, y1) − (band + 0.85·nimH)))` with `band = bubble.y + bubble.h`.
     A flatter, longer arc still reads as a hop.
  2. In landscape, add `0.85·nimH − itemH` to `a0` for the target rows, so Nim's head stays below the band.
  3. In `main.js`, call `NH.UI.fadeBubble(true)` whenever Nim's art box (in the air or standing) intersects
     `layout.bubble`, and unfade on the next `ask` / `right` line. This is the cheapest fix, and the bubble already has a
     `.fade` style.

## P2 — should fix

### P2-1 Portrait: Nim's face or back is cut off by the screen edge on edge-column stones
- iPhone portrait: Nim's art goes up to **21 CSS px (38.5 logical) past the right edge**. His nose and part of his face are
  off screen while he stands or lands on a right-hand stone. Sampler: age 6 / age 7 sessions, 23–55 frames each, in EN, VI
  and notch runs.
  - Screenshots: `edges-iphone-portrait-en/edge-age3.png` (15 CSS px; the nose is cut) and
    `iphone-portrait-en-ages/26-age6-initial.png` (12.1 px).
  - On the left the cut is smaller: 7 CSS px of spines in `iphone-portrait-en/18-nim-on-row0.png`.
- iPad portrait: **37 CSS px (32.7 logical) of his face off the right edge**. Screenshot: `edges-ipad-portrait-en/edge-age7.png`.
- **Probable cause:** `world.js:242` puts the stone centres at `ins.left + portSideK·S … W − ins.right − portSideK·S`
  (portSideK 0.55, `world.js:42`). Nim's art reaches `(296−150)/300·nimH` = 0.487·nimH to the right of his feet (102 logical
  on a phone) and 0.453·nimH to the left. That is wider than 0.55·S (70 logical at S = 128).
- **Suggested fix:** use `lx = ins.left + max(portSideK·S, nimExtent(nimH).left + 6)` and
  `rx = W − ins.right − max(portSideK·S, nimExtent(nimH).right + 6)`. `nimExtent` already exists at `world.js:177`. If 3
  stones then no longer fit, let the existing S shrink loop handle it.

### P2-2 The counted / home-badge thing is drawn over Nim's face
- When a thing shows its home or is counted beside Nim (because "above his head" would touch the bubble), it lands on top
  of his face or spines.
  - `iphone-landscape-en-notch/26-home-badge.png`: the crab and the sea badge cover Nim's face on a top-row stone.
  - `edges-ipad-portrait-en/edge-age7.png`: the crab and the badge cover his face at the screen edge.
  - `edges-iphone-portrait-en/edge-age3.png`: the twinkling-away purple triangle sits in front of his body. That case is
    transient, about 0.5 s.
- **Probable cause:**
  - `world.js:934`: the side offset is `dx = 0.42·nimH + 0.55·ih`. Nim's art reaches 0.487·nimH on the nose side and
    0.453·nimH on the spine side.
  - `world.js:935`: when it flips side at a screen edge, it flips onto his face.
  - The thing is drawn after Nim (integration decision 5, `render.js` ~385).
- **Suggested fix:**
  1. Use `dx = 0.5·nimH + 0.55·ih + 8`.
  2. At a screen edge, show the thing **above** Nim, raising `hop` up to the band, instead of flipping it onto his face.
  3. If neither side fits, draw it at 0.7 scale.

### P2-3 countSel dots are too small to count on a phone at ages 6–7 (10–12 dots)
- At age 6 on an iPhone the round dots sign is about **35 CSS px** across (thing box 43.3 px). With 10–12 dots, each dot is
  **about 4.5 CSS px** wide at a 6.5 px pitch (measured on the @2x pixels: 9 px dots, 13 px pitch).
  - The child must tell 10, 11 and 12 apart: distractors differ by ≥ 2 and the target is up to 12.
  - Screenshots: `iphone-portrait-en-ages/30-age6-count.png` (crop: `crops/ip-dots12.png`) and
    `iphone-landscape-vi-ages/26-age6-count.png`.
- **Probable cause:**
  - `world.js:38`: `sBase` is 128 at age 6+, the smallest stones exactly when n is largest; `itemK` 0.62.
  - `stone_art.js:490-498`: `drawDots` packs all n dots into the fixed `disc` sign.
- **Suggested fix:**
  1. For `dots` with n ≥ 7, draw the tall/oval sign (as `numeral` uses) at about 1.25× the box, with the dots in two
     dice-style groups of 5 + n−5.
  2. Or keep S at 140 for countSel rounds.
  3. Or cap countSel at 10 on phones.
- Target: dots of at least 7 CSS px with at least 3 px gaps.

## P3 — polish

1. **Yellow looks too much like the golden path and Nim's scarf.**
   - Answer yellow `#FFD23F` vs the visited golden stone `#F4D27A`: ΔE2000 **7.0**. Yellow vs the scarf `#E3B65A`:
     ΔE **9.3**. Every other answer colour is ≥ 13.8 from both.
   - In a "Hop on the YELLOW ones" round, the stones Nim already used also turn yellow. They cannot be tapped, so this is
     mild.
   - Fix: make the golden glow warmer and amber-er (top `#E9B860`, side `#B98A3A`) in `stone_art.js` gold, or add a soft
     sparkle pattern so gold reads as "shiny stone", not "yellow".
2. **Answer blue on winter water:** ΔE **16.0**, contrast **1.07–1.10** (water `#638A97`). The other seasons' water against
   blue measures ΔE 22–26. It is still readable thanks to the dark outline and the snow cap behind the thing. Optional:
   lighten the winter deep water a little (`#6E95A0`).
3. **Answer green vs the summer banks:** ΔE **8.0** (far bank `#86B86E`), contrast 1.02. Things never stand on banks, so
   this is OK in play. Keep the banks out of Talk-time picture backgrounds.
4. **Talk-time picture stone is cut flat at the bottom** on every device. The canvas edge slices the stone mid-side.
   - Screenshots: `iphone-portrait-vi/27-talk.png`, `iphone-landscape-vi-notch/27-talk.png`.
   - Cause: `render.js:787`, where the stone top is at `ch·0.5 + 0.42·ih` and `S = min(0.62·cw, 0.95·ch)`, so stone and
     waterline need about 0.6·S below the top.
   - Fix: `top = ch·0.42 + 0.35·ih` and `S = min(0.62·cw, 0.8·ch)`, or fade the bottom 12 px.
5. **Fruit-sticking frame:** while the fruit glides onto the ball, it and the multicoloured stick burst are drawn over
   Nim's face. Screenshot: `iphone-landscape-en/21-fruit-sticking.png` (crop: `crops/ll-sticking.png`). On done, a
   confetti piece sitting on his eye reads like a tear (`ipad-portrait-vi/30-done.png`). Fix: keep the stick burst at the
   slot, away from `NIM_POINTS.mouth ± 60`.
6. **The wipe reads as a flat pink haze** with only a few petals at the right edge (`iphone-landscape-vi/23-wipe.png`). It
   is not really a "seasonal swirl". Fix: bring in more swirl particles across the screen at t ≈ 0.3–0.6, or add a soft
   gradient band moving along `wipe.dir` (integration decision 2).
7. **Talk choice cards change size between rounds:** 74×67 vs 105×96 CSS px on iPhone portrait, and 86×78 vs 124×112 in
   landscape (shown picture present vs absent). They stay ≥ 44 pt but jump around. Consider a fixed card size per device.
8. **Title tagline orphan in VI portrait:** "nhé!" wraps alone (`iphone-portrait-vi/00-title.png`). Add
   `text-wrap: balance` to `.tagline`.
9. **Little things in the age 3 size round** are 30.5 CSS px boxes, so the little ball is about 17 CSS px
   (`iphone-portrait-en-ages/04-age3-size.png`). It is readable, but 0.65× would help.
10. **iPad portrait:** edge-column stones come within about 10 px of the screen edge (`ipad-portrait-en/12-play-winter-colors.png`).
    This is fine, but the P2-1 fix will also centre them.

## What passed (measured)
- **Safe areas and notch:** with `--sa-*` set, no DOM control (HUD, bubble, chips, buttons, panels, logo) crosses an inset.
  The `unsafeControls` list was empty for every notch shot. No stone or thing box crosses the safe screen, and no thing is
  under the bubble or HUD (sampler: 0 in all runs).
- **Landscape goal:** Nim at the far-bank goal stays on screen in landscape (the edge sampler found 0 frames).
- **Text:** no text overflows or clips in EN or VI in the bubble, buttons, chips, banner, settings, pause, Talk or done. The
  bubble font shrinks to 17.1 px for the longest VI count run ("Một, hai, ba, … Mười một chấm!"), which still fits in two
  lines. Canvas banner text is width-fitted by `fitText`.
- **Talk choices** are always pictures (canvas, no caption) at every age, and only 2 choices at age 3.
- **Answer colours vs water** (median of 16 samples around each stone): ΔE2000 22–49 in every season, apart from winter
  blue at 16 (P3-2). Against the grey stone top: ΔE 24–43. The golden stone against water: ΔE 39 in spring and summer.
- **Readability at phone size:** things are 43–51 CSS px tall and stones 70–82 px wide on iPhone. Nim is 84–93 px tall.
- **Fruits** sit on the spines at the back slots, in the right size, not floating (`crops/ll-onback.png`,
  `crops/ll-fruits3.png`, `crops/ipp-done-nim.png`).
- **Things stand on their stones** with a contact shadow, and the stone dip and golden glow read clearly.
- **The brook reads as water:** teal-slate with flow streaks, foam rims, ripples and ice rims in winter. The scene is calm
  and consistent: same outline weight and flat cel style across Nim, stones, things and env, and the art is original.
