# Visual QA report: Kitten's Balloon Farm (2026-11-01)

Tester: visual QA agent (report only; nothing under `game/` was changed).
Scripts: `tests/visual/capture.js` (sections `screens moods topics hits notch short`), `tests/visual/analyze.js`
(geometry + ΔE2000/WCAG + CVD numbers → `tests/out/visual/analysis.txt`), `tests/visual/measure.js` (DOM bubble / Talk / settings,
with and without notch insets), `tests/visual/title_fit.js` (title vs canvas Miu + balloon bunch; it also takes a CSS string to try a fix),
`colorblind.py`, `palette_cvd.py`, `sheets.sh` (montages). About 200 screenshots are in `tests/out/visual/` (gitignored).
8 representative PNGs are in `docs/reports/visual/`.

**Coverage.** Screens: title, settings, chapter banner, play mid-round, wrong-tap wobble, pop with confetti, count round with sign dots,
animals round with friends landed, pause, Talk time, chapter stars, 2nd banner and done, × iPhone 393×852@3 portrait, 852×393@3 landscape,
iPad 820×1180@2 and 1180×820@2, × EN/VI. All 4 times of day (level 0–3) with colour rounds at ages 3/4 and shapes at 5, on all 4 viewports.
Every topic of every age (3–7, 20 topic×age pairs) on 4 device/language combos (night on iPhone L / iPad L, noon on iPhone P / iPad P).
Crowded rounds with `debug=1` hit circles (count N ≥ 10, odd/even, size, animals) on the 4 devices + iPhone SE landscape 667×375.
Notch insets (top 59 / bottom 34 portrait; left/right 59 / bottom 21 landscape) emulated by overriding `--sa-*`, which `#safeProbe` →
`main.js readInsets()` picks up (the measured `ins` was 108 / 62 logical px, so the emulation works). Short landscape phones: SE 667×375 and mini 812×375.

Time was frozen by swapping `world.update` for a no-op and moving the world forward by hand. A "background probe" redraws each frame
without balloons and samples the pixels behind every balloon body and on a 21×13 grid over the whole play band.

---

## P1: fix before shipping

### P1-1 Notched iPhone portrait: the speech bubble covers the top row of balloons
- **Viewport:** iPhone 393×852 portrait with notch insets (every Face ID / Dynamic Island iPhone), EN and VI, ages 3–7.
- **Screenshot:** `docs/reports/visual/p1-bubble-covers-balloons-iphoneP-notch.png` (VI, age 6, "bấm 12 quả bóng"); `tests/out/visual/notch/iphoneP-*-count12-top.png`.
- **Measured** (`measure.js`, highest balloon body top over 8 re-rolls of every topic): DOM bubble bottom = **347.7 (EN) / 363.5 (VI)** logical px.
  `world.layout.bubble` bottom = 232.1. Highest balloon body top = 299.5 (age 5–7) / **264.9 (age 3)**. Balloons are covered by **48–99 logical px
  (26–54 CSS px)**, so up to half a balloon sits under the bubble, and the bubble also takes the tap. Without a notch the gap is fine (bubble 240–256, top body 327).
- **Cause:** in portrait, `main.js placeBubble()` (l. 90–94) moves the bubble below the HUD (`r.y = hud.bottom + 8`) because only
  128 CSS px fit beside the HUD. `world.js computeLayout()` (l. 158) still believes the bubble is at `ins.top + 20` with h 104, so the
  play band starts too high.
- **Fix:** `game/js/world.js` `computeLayout`: in portrait, place the bubble under the HUD, as the DOM does:
  `if (portrait) { bubble.y = ins.top + cfg.hudH + 24; bubble.h = 124; }` (124 fits the two-line VI prompt: 65 CSS px / 0.546).
  The band top then becomes ≥ ins.top + 248 + 30 + size/2 and the 1.05·W band cap still applies. Re-run `node tests/visual/measure.js`:
  `coveredBy` must be 0 on every row.

### P1-2 Portrait title: the ▶ button and the star/age pill sit on Miu's hat and the balloon bunch
- **Viewport:** iPhone 393×852 and iPad 820×1180 portrait (also SE 375×667 portrait), EN and VI.
- **Screenshot:** `docs/reports/visual/p1-title-overlaps-miu-iphoneP.png`; `tests/out/visual/screens/ipadP-vi-01-title.png`.
- **Measured** (`title_fit.js`, CSS px of overlap): star pill over Miu by **41 (EN) / 62 (VI)** on iPhone P and **30 / 72** on iPad P.
  ▶ over Miu by 14 (iPhone VI) / 18 (iPad VI), and ▶ over the bunch by 17–183. In the picture, the "0 · Tuổi 4" pill covers Miu's hat and eyes.
- **Cause:** `.title-wrap` centres the logo + ▶ + pill over the full height (`padding-bottom: 6vh`). On the canvas, Miu (h = min(330, 0.22·H))
  and the bunch take up the lower ~40 %.
- **Fix (verified with `title_fit.js "<css>"`: all 0 on iPhone P and iPad P EN; iPad P VI pill only touches the bunch's bounding box):**
  add to `game/css/style.css`:
  ```css
  @media (orientation: portrait) {
    .title-wrap { justify-content: flex-start; padding-top: 4vh; padding-bottom: 0; gap: 6px; }
    .btn-play { width: clamp(110px, 22 * var(--u), 170px); }
  }
  ```

### P1-3 Sunset: the sun sits inside the balloon band, and a yellow balloon disappears into it
- **Viewport:** all 4 viewports, level 2 (sunset). It is worst on iPad 1180×820 and iPhone 852×393 landscape.
- **Screenshot:** `docs/reports/visual/p1-sun-behind-yellow-sunset-ipadL.png` (count round, 4 yellow balloons, one right next to/on the sun).
- **Measured:** yellow `#FFD23F` against the sun disc rgb(255,218,133): **ΔE00 7.7, contrast 1.03:1**. Worst band pixel at sunset for yellow:
  ΔE00 7.7–9.6 on every device (`analysis.txt`, "Worst pixel of the whole play band"). Count rounds are single-colour, so all
  N balloons can be yellow. Age ≤ 4 shape rounds are single-colour too.
  The sun centre is `min(skyMax, 0.5·H)` with `skyMax = min(gy−230, P.y−40)` = 168 on iPad L, so its 180 px disc covers y 78–258,
  while balloon bodies start at y 143.
- **Fix:** `game/js/render.js` l. 193: keep the disc above every balloon body:
  `const skyMax = Math.max(60 + ins.top, (P ? P.y - 0.6 * layout.balloonSize : gy - 300) - 62);` (sun radius ≈ 0.3·size + 8 px gap).
  Also `game/js/weather.js` l. 66 (sunset): `sunX: 0.22 → 0.74`, which puts the disc in the free gap between the bubble's right end (x ≤ 664)
  and the HUD (x ≥ W−160) on every landscape screen, instead of behind the bubble.
  If the disc must stay low as a "setting sun", draw it with `amb.sun` 1 → **0.4** at sunset instead (ΔE00 to yellow rises from 7.7 to 17.2).
  The same `skyMax` change fixes the moon sitting behind the top-right balloon on iPad portrait at night (`screens/ipadP-vi-08-animals.png`).

---

## P2: should fix

### P2-1 Colour-blind: green + orange (and green + yellow) are paired in age-4 colour rounds
- **Viewport:** any; iPhone L, morning, age 4. **Screenshot:** `docs/reports/visual/p2-cvd-green-orange-age4.png` (normal / deuteranopia / protanopia).
- **Measured** (CIEDE2000, Machado 2009 severity 1): green–orange **deut 13.1, prot 8.3**. green–yellow deut 18.5, prot 12.4.
  For comparison, the pairs already banned below age 5: blue–purple 1.2 / 5.9, red–green 8.8 / 25, yellow–orange 8.1 / 11.9.
  Both pairs appeared on screen together in age-4 colour rounds (`iphoneL-a4-colors-L0-s5`, `-s9`). In the protanopia picture the
  orange and green balloons are two olive balloons that differ only in lightness, and green also merges into the trees.
- **Fix:** `game/js/content.js` l. 82: `var PAIRS = [['blue','purple'], ['red','green'], ['yellow','orange'], ['green','orange']];`
  (3 safe colours remain, e.g. blue/red/yellow or purple/green/yellow). Update DESIGN §5.1 "Never blue+purple or red+green…" to match.

### P2-2 Talk time on landscape phones: an empty 170 px column when there is no picture (animals "Which animal says…?")
- **Viewport:** iPhone 852×393, SE 667×375, mini 812×375 landscape (every `max-height: 430px`), EN and VI.
- **Screenshot:** `docs/reports/visual/p2-talk-empty-column-iphoneL.png`.
- **Measured:** `#talkShow` is hidden but the grid stays `170px 534px` (iPhone L) / `170px 417px` (SE). The question and answers sit
  ~100 px right of centre under a centred title, with blank space on the left.
- **Fix:** `game/css/style.css`, inside `@media (max-height: 430px)` after l. 178:
  `.talk-panel:has(#talkShow.hidden) { grid-template-columns: minmax(0, 1fr); } .talk-panel:has(#talkShow.hidden) > * { grid-column: 1; }`
  (Safari ≥ 15.4). Or toggle a `noshow` class on `.talk-panel` in `ui.js openTalk()` l. 98 and use that class.

### P2-3 Short landscape phones, Vietnamese title: the logo wraps and pushes the star pill off-screen
- **Viewport:** iPhone SE 667×375 and mini 812×375 landscape, VI. **Screenshot:** `docs/reports/visual/p2-title-offscreen-seL-vi.png`.
- **Measured:** "Bóng Bay Nông Trại Mèo Con" at 44 px (clamp minimum) needs ~650 px but `max-width: 80vw` = 534 px, so it takes 2 lines
  (logo 74→158). The `.title-info` bottom is at **389 > 375** (14 px off-screen), and the tagline overlaps Miu by 31 px (SE).
- **Fix:** `game/css/style.css`, add to `@media (max-height: 430px)`:
  `.logo { font-size: 38px; max-width: 70vw; } .title-wrap { padding-bottom: 0; gap: 4px; } .btn-play { width: 104px; } .tagline { margin: 2px 0 4px; }`
  (`title_fit.js` with this CSS: "off-screen" gone on SE and mini).

### P2-4 Done screen in portrait (and iPad landscape) hides the farm friends
- **Viewport:** iPhone 393×852, iPad 820×1180 (all 9 friends hidden); iPad 1180×820 (5 of 9 hidden: sheep, duck, horse, goat, chick).
- **Screenshot:** `docs/reports/visual/p2-done-hides-friends-ipadL.png`; `tests/out/visual/screens/ipadP-en-13-done.png`.
- **Measured:** iPad P panel y 805–1133 CSS px vs friends y ≈ 1014–1109. iPad L panel x 310–870, y 508–787 vs friends row y ≈ 654–750,
  x 45–1135. The night-party friends are the reward for the whole session.
- **Fix:** `game/css/style.css` l. 156: `@media (orientation: portrait) { #scrDone { padding-bottom: calc(var(--sa-b) + 20vh); } }`, and
  `game/js/render.js` l. 434 `H * (H > W ? 0.5 : 0.52)` → `H * (H > W ? 0.4 : 0.52)` (Miu moves up; panel top 352 > Miu feet 341 CSS on iPhone P).
  iPad landscape: use the right-hand layout of l. 158–160 for every landscape (`@media (orientation: landscape)` without `max-height`,
  `max-width: min(470px, 46vw)`). In `main.js` l. 354, pass `compact: innerWidth > innerHeight` so Miu is drawn on the left.

### P2-5 Landscape VI: the two-line bubble touches the top balloons
- **Viewport:** iPhone 852×393, SE 667×375 landscape, VI. **Measured:** DOM bubble bottom **140.1 (iPhone L) / 142.3 (SE)** vs layout 124;
  highest body top 137.4 (age 3). Overlap 2.7 / 5 px, and the designed 30 px gap is gone (`measure.js`).
- **Fix:** `game/js/world.js` l. 47 `bubbleH: 104 → 122` (the VI prompts take 2 lines at the 17 px minimum font on phones).

### P2-6 Pop confetti is hard to see on phones
- **Viewport:** iPhone 852×393 / 393×852. **Screenshot:** `tests/out/visual/screens/iphoneL-en-06-pop.png`.
- **Measured:** 16 confetti of 16–26 logical px → **9–14 CSS px** at s = 0.546, plus 5 sparkles. At 0.1 s after the pop the burst
  is a faint ring the size of one balloon. This is the main reward moment.
- **Fix:** `game/js/render.js` l. 474/478: `n = Math.round(16 …)` → `24`, `size: 16 + R() * 10` → `22 + R() * 12`, `sp = 180 + R()*320` → `220 + R()*360`.

---

## P3: polish

1. **Green balloon on the mid-layer trees** (noon/morning, all landscape): green `#4CC26B` vs tree rgb(136,185,116) **ΔE00 8.1–9.7, contrast 1.00:1**.
   It is readable only thanks to the dark rim `#2A8343` (`docs/reports/visual/p3-green-on-trees-noon.png`). Fix: after drawing the `mid` layer in
   `render.js _landscape()` (l. 112–122), fill a haze `rgba(240,248,255,0.22)` over that layer's rect (trees go to ≈ rgb(165,200,150), ΔE00 ≈ 13).
   Or lighten the tree fills in `env/mid.svg` to ≈ `#A9CC93`.
2. **Yellow on hay bales** (noon, iPhone L): ΔE00 10.4 vs rgb(233,209,138). Fix: hay in `mid.svg` `#E9D18A` → `#D8C394` (more muted).
3. **Cream text balloons on a white cloud** (noon, iPad P, letters): ΔE00 3.7. The rim `#B08F5E` carries the outline, so it is OK. Optionally
   give cream a 1 px darker rim (`balloon_art.js` cream rim `#B08F5E` → `#9C7A48`).
4. **Size topic "small" balloons are below 100 logical px:** 92.2 (128 × 0.72) at age 3, which is **48 CSS px** on SE landscape and 50 on iPhone L.
   Fix: `content.js` l. 67 `small: 0.72 → 0.8` (102 px; big/small ratio still 1.63×).
5. **Strings end in the grass on tall portrait:** string end 54.9–66 px below groundY (limit 50) at age 3/4 on iPhone P / iPad.
   Fix: `world.js` l. 51 `stringReach: 1.5 → 1.6`.
6. **Crowded rounds (count N 10–12, 14 balloons) on iPad landscape:** the band is only 266 px tall. Hit circles overlap (centre distance 110–117 vs
   0.75·(rA+rB) = 118), and the lowest row sits on the fence with strings across lower bodies (`tests/out/visual/hits/ipadL-a6-count.png`).
   Nearest-centre-wins keeps taps correct. If wanted: `world.js` `playGroundGap 150 → 130` on non-tall landscape.
7. **Landscape title on iPad:** "Farm" in the logo touches the yellow heart of the bunch (37 CSS px box overlap). Fix: `.logo { max-width: 64vw }`
   under `@media (orientation: landscape) and (min-height: 600px)`, but test VI: at 60vw the VI logo wraps to 3 lines and hits Miu.
8. **Settings on landscape phones:** the 4th toggle ("Answer by voice" / "Trả lời bằng giọng nói") is hidden behind the sticky Done button
   (scroll 46 px iPhone L, 64 SE, 67 with notch). It is for parents and scrollable, but `.set-grid` `minmax(170px,1fr)` → `minmax(150px,1fr)` in the
   `max-height:500px` block gives 4 columns on iPhone L.
9. **Done screen is daytime** (noon sky, sun), but DESIGN §7 asks for a night party with lanterns. Also **"1 stars!" / "0 stars!"** plural in
   `i18n.js` l. 342 `session.done` (use a `{stars}` plural helper or "Stars: {stars}!").
10. **Wind is never applied to the balloons:** `main.js` does not set `world.wind`, so `w.wind` stays 0 and balloons ignore the gusts
    that move the clouds and dandelion fluff (DESIGN §5.2). Fix: in `main.js frame()` before the update loop:
    `world.wind = (weather.ambient && weather.ambient.wind) || 0;`.
11. **Sign on phones:** the board is 150 logical = **82 CSS px** on iPhone. Count dots for N = 12 are ~6 CSS px. Odd/even "1 3 5" text ≈ 9 CSS px. Readable,
    but small for a 6–7-year-old. Optionally `signW 150 → 170` when `s < 0.6`.
12. **Test robustness (mechanics):** calling `_beginRound()` many times in one chapter (history > ~8 count rounds) throws
    `KB.Content: invalid round (count): bad colour undefined`. This cannot happen in play (4 rounds per chapter), but `content.js` colour picking
    should fall back when the history excludes every colour.
13. **Project `CLAUDE.md` is still the sister game's** ("Owlet's Snow Garden", `window.SG`, prefix `sg:`). Rewrite it for Kitten's Balloon Farm.

---

## What passed
- **Balloons on screen:** in 1 600+ checked balloon placements (screens, 4 moods × 3 rounds × 4 devices, 20 topic pairs × 4, crowded rounds,
  notch, short phones), no body went off the safe screen, under the HUD, onto Miu or onto the sign (only the bubble in P1-1 / P2-5).
  Homes are ≥ 1.05–1.12 × size apart; packing never shrank (shrink 1.0, ok true).
- **Sizes:** every balloon is ≥ 100 logical px except the "small" size balloons (P3-4). On screen: 56–80 CSS px on phones, 123–146 on iPad.
- **Friends** land on the grass inside the screen (y = groundY + 30, x within the yard) on all 4 viewports and with the notch.
- **Contrast against the background:** red, blue and purple keep ΔE00 ≥ 14 against every pixel of the play band (sky, hills and trees) in every mood.
  Pink stays ≥ 13.2 (sunset sky). Night readability is good (the darkness tint
  is only on the hills, and balloons, Miu, friends and the sign stay lit). Text on balloons: dark `#1A1210` on yellow/green/orange/pink/cream (8.1–16.9:1),
  dark on red (4.84:1), blue (5.42:1) and purple (4.90:1). All are ≥ 4.5:1.
- **Vietnamese diacritics** are not clipped in the bubble (17 px phone / 30 px iPad, no overflow), Talk panel, settings, banners or done panel.
  Bubble overflow is 0 everywhere.
- **Talk panel:** no overflow on any viewport (iPhone P choices 90×110, iPad 140×130). Pause, banners and chapter stars look clean on all viewports.
- **Notch:** the title chips and gear, HUD, bubble and panels respect the insets (the HUD and bubble start below 59 px; Miu x = ins.left + 110).

## Status after fixes (lead, 2026-11-01)
Fixed: P1-1 (portrait bubble below the HUD in the world layout), P1-2 (portrait title CSS + smaller, lower balloon bunch;
`title_fit.js` clean except SE portrait VI pill touching the bunch box by 9 px), P1-3 (sun/moon kept above the balloon band,
sunset sun at x 0.74), P2-1 (green+orange banned below age 5), P2-2 (`.noshow` Talk layout), P2-3 (short-landscape logo,
tagline hidden ≤ 380 px tall), P2-4 (done screen: night party, right-hand panel on every landscape, portrait padding),
P2-5 (bubble h 122), P2-6 (24 bigger confetti), P3 small balloons 0.8×, strings ≤ 50 px into the grass, wind now reaches
the balloons, CLAUDE.md. Open (P3): green balloons over the trees / yellow over hay bales (ΔE00 8–10).
