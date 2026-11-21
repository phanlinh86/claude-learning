# Visual QA report: Bibi's Cloud Drums (2026-11-21)

**What was run:** `tests/visual/screens.js`, rewritten for the drum world. It reads drums `stand`/`enter`, `bw/bh/cx/cy`, cushions, `cymbalBox`, `w.card`, lanterns, and samples the real canvas pixels to measure contrast.
- **Sweep:** 5 viewports. iPhone 393×852 portrait and 852×393 landscape (notch insets 59/0/34/0 and 0/59/21/59), iPad 820×1180 and 1180×820 (24/0/20/0), and a tall portrait 360×880 (48/0/34/0).
- **For each viewport:** EN and VI; every pool topic for ages 3–7 in its chapter mood; 5 colour-critical topics × 4 moods; plus title, settings, banner, play, wrong, right mid-bounce, lantern, hint, lamb (walk + ball), bird on the string, pause, song ask, song wave, cymbal crash, beat card (+ lit), night twinkle stars, Talk time, Talk right, level done and session done.
- **Output:** 515 PNGs in `tests/out/visual/` (rendered @1). The `ip-p-vi-*` set was re-rendered @3 as a spot check. Also `geometry-*.json` and `issues-*.txt` (271 auto-flags, most of them the cushion-contrast flag).
- **Commands:** `DEV=ip-p,ip-l,pad-p,pad-l,tall node tests/visual/screens.js` (one process per device). Add `DPR=native` for @2/@3.

No game code was edited.

**What is good:**
- Bibi's frames are consistent: same body, collar and size in all 12 frames on 3 backgrounds (`docs/art/bibi_sheet.png`) and in game.
- Vietnamese diacritics are never clipped (logo "Cún Bibi / Trống Mây", bubbles, Talk, settings, done at @3).
- No overlap between a drum and the bubble, HUD, garland, card or notch on any viewport. No JS errors.
- The colour-pair rule held in every round below age 5.
- Night is readable: drums are not tinted and cushions stand out (cushion vs. background distance 150–242).
- The pause, settings and done panels fit without scrolling on all 4 main viewports.

## P1 — fix before release
1. **Dot drums cannot be counted on phones.**
   - Screenshots: `ip-p-*-age5-2-count`, `ip-p-en-age7-0-count`, `tall-*-age6-4-count`, and the @3 crop of `ip-p-vi-age5-2-count`.
   - Measured: the drum is 128 logical = 70 css (64 on the tall phone). Dots for n ≤ 10 have r = 5 design units, so each dot is **7 css px across**; for n = 11–12 it is **6 css px** (r 4.4). Rows are 13 units apart. Telling "eight" from "ten" in that size is guesswork for a 5–7-year-old.
   - Fix in `game/js/drum_art.js`:
     - `PANEL = { x: -34, w: 68 }` → `{ x: -40, w: 80 }`.
     - In `dotLayout`, n 4–5: `sp 15, rr 6.6`. n 6–10: `sp 14.8, rr 6.2`, rows `cy ± 7.6`. n 11–12: two rows of 6 with `sp 12.6, rr 5.4` (instead of 3 rows).
     - This roughly doubles the dot area (about 10 css px per dot).
   - Optional fix in `world.js` `CONFIG`: for the `count` topic at age ≥ 5 on phones, keep `item` at the `itemCap` of 150 (it is 128 today with 5 drums in the zig-zag). Use 4 drums (3 + 1 distractor) instead of 5.
2. **Touch targets are under 100 css px on narrow and tall phones, and for the small drum.**
   - Screenshots: every `tall-*` round, `ip-p-*-age3-2-size`, `ip-p-*-age4-1-size`.
   - Measured:
     - Tall phone 360×880 (scale s = 0.5): every drum's hit circle is **92 css** (130 flags). The small "size" drum is **81 css**.
     - iPhone 393: the small size drum (112 logical, 0.75 × 150) has a hit circle of **89 css**, because `hitPad` is computed from `item`, not from each drum's size.
   - Fix in `game/js/world.js`:
     - `CONFIG.hitDiaPhone: 184` → `200` (that is 100 css at s = 0.5).
     - Apply it as a per-drum minimum: `P._hitR = c => Math.max(cfg.hitK*c.size + hitPad, L.phone||L.tall ? cfg.hitDiaPhone/2 : 0)` (line 393).
     - Nearest-centre already settles overlaps.

## P2 — should fix
3. **Size rounds look ambiguous to a 3–4-year-old.**
   - Screenshots: `ip-p-vi-age4-1-size` ("gõ trống nhỏ": big blue, pig drum, small blue) and `ip-p-en-age3-2-size` (big yellow, hen drum, small yellow).
   - Measured: the animal distractor's wood drum looks as small as the "small" drum (pig visible 76 css, small drum 60 css). The big drum also sits 200 logical higher than the small one, so the two drums are hard to compare.
   - Fix in `content.js` case `'size'` (line 243): use a **mid-size colour drum in another safe colour** as the distractor instead of an animal drum, and change the validator at line 495.
   - Or, in `world.js` `padsFor`, force one shared pad height when `topic === 'size'` so big and small stand on the same line.
4. **Purple at night and pink at sunset melt into the background.**
   - Screenshots: `tall-mood3-age4-colors` (purple vs. the night hill: contrast ratio 1.17, RGB distance 56), `tall-mood2-age5-colors` (pink vs. sunset hills: 1.33 / 57), `ip-p-vi-age5-0-colors` (pink on the pink morning: 1.74 / 99).
   - Every other colour/mood pair is at RGB distance ≥ 105.
   - Fix in `drum_art.js` `drawDrum`: when `opt.night > 0`, add a 2-unit `#FFFFFF` outline at alpha 0.55 around the body silhouette (today the moonlight rim is only on the top hoop).
   - Fix in `game/js/render.js` `ENV`/`SKY`: lighten the night mid-hill by about 15 % L so dark purple `#6840A8` separates.
   - For sunset, drop pink from `COLORS5` when the mood is sunset, or desaturate the sunset hills `#E8B4D0` → `#EFD2DA`.
5. **Cushions are white on white in morning and noon.**
   - Screenshots: `*-04-play`, `*-age*-0-*`, `*-age*-1-*`.
   - Measured: cushion centre vs. 16 px below its bottom has a median distance of 20 (morning) and 19 (noon), minimum 1. Only 21 of 182 morning cushions and 20 of 110 noon cushions reach 30 (sunset median 37, night 242). In the images the cushions read only through their thin lilac outline.
   - Fix in `drum_art.js` `drawCushion` / `drawCloud(…, true)`: make the underside shadow lilac `#CFC6E6` at alpha 0.6, 0.25 × h tall, and make the outline 1.5× thicker for the cushion variant.
   - Or tint the cushion `#F7F3FF` → `#EEE8FF` with a 4 px `#B9AEDD` bottom rim.
6. **Busy, noisy floor.**
   - Screenshots: `ip-l-*` (most visible), `pad-l-*-04-play`, `*-01-title`.
   - The ground layer has 34 clusters × up to 3 multicoloured outlined star flowers per 1200 px tile, so iPhone landscape (W 1561) shows about 90. They collect around the cymbal and Bibi and use the same lilac, blue and pink as the answer colours. At age 3 they compete with the drums.
   - Fix in `tools/art_env.js` (ground, line 278): `i < 34` → `i < 14`, size `sc` × 0.8, outline colours one step lighter, and no clusters in `y < 120` (keep the strip under the drum band calm). Regenerate `env/ground_*.svg`.
7. **Large empty sky in phone portrait; drums squeezed low.**
   - Screenshots: `ip-p-*-04-play`, `tall-*`.
   - Measured on iPhone portrait: garland y 453, highest drum top y 957, so **about 500 logical (273 css) of empty sky**. The drums are 82 css wide and sit just above Bibi's head. Tall phone: 372 → 1063.
   - Fix in `world.js` `computeLayout` (portrait): set `floor = min(bibiBox.y + bibiPad, cymbalBox.y, groundY) − 40` as today, then centre the band, i.e. use `stage.y = (lanternBottom + floor)/2` as the base when the band is shorter than the free space.
   - Also let `itemCap` grow to 170 on `tall` when the zig-zag fits. The content inside the drums (dots, letters, animals) gains the most from this.
8. **Beat card is small on phones.**
   - Screenshots: `ip-p-*-15-beat`, `ip-p-*-16-beat-lit`, `tall-*-15-beat`.
   - Measured: card height 76 css on iPhone (70 on tall). With n = 5 each dot is about 9 css and unlit dots are cream on cream (`ip-p-vi-age4-3-count`). On the 2nd beat, the drum's sound rings run into the card's bottom edge.
   - Fix in `world.js` `CONFIG`: `cardH` 140 → 170 on phones (keep the 110 minimum), and `cardGap` +12.
   - Fix in `drum_art.js` `drawCard`: unlit dots get outline `#B89B72` at 2.5 units and fill `#F1E6D2`, and dot radius goes up by 20 %.
9. **Talk-time choice buttons are below 100 css on phones.**
   - Screenshots: `ip-p-*-18-talk`, `tall-*-18-talk`.
   - Measured: 106 × **96** css.
   - Fix in `game/css/style.css` line 145: `.talk-choices button { min-height: 96px }` → `min-height: 108px; min-width: 112px`, and `button canvas` 88 → 96px.
   - In VI the mic pill wraps to 2 lines ("Bé chạm hoặc nói đáp án nhé!"). Allow `white-space: nowrap; font-size: clamp(15px, 4.2vw, 20px)`.
10. **Tall-portrait letterbox bands are cream.**
    - Screenshot: `tall-*` (the 360×880 view is clamped to H 1600, which leaves about 40 css bars top and bottom).
    - The bars use `--sky: #FFF1E4` (`style.css` line 9). At night this is a bright cream frame around a dark-blue scene.
    - Fix in `main.js` (in `frame()` or on every `setWeather`): set `document.body.style.background` to the current sky top colour (top bar) or the ground colour.
    - Or raise the clamp in `computeView` to `Math.min(1800, …)` so tall phones fill the screen (check `world.js` layouts at H 1760).
11. **Surprises are tiny and low-contrast on phones.**
    - Screenshots: `ip-p-*-09-lamb`, `ip-l-*-09-lamb`, `ip-p-*-10-bird`.
    - Measured: the lamb is drawn 120 logical, which is **66 css** (iPhone) — a white lamb on the white floor. Its hit area is r 58, so **63 css across**. The bird hit area is r 48, so **52 css across**.
    - Fix in `render.js` `_lamb`: `size = 120` → `layout.phone||layout.tall ? 160 : 120`, and give the wool a `#BDB3DA` outline.
    - Fix in `world.js` `CONFIG`: `lambR` 58 → 92 and `birdR` 48 → 92 on phones (≥ 100 css), and scale the bird art × 1.3.
12. **Cymbal crash is weak on phones.**
    - Screenshots: `ip-p-*-14-cymbal`, `ip-l-*-14-cymbal`.
    - The cymbal is 108 × 126 logical, about 59 css. The crash reads as a faint ring and the bubble still says "Tap for our song!".
    - Fix in `drum_art.js` `drawCymbal`: `ring` should draw 3 bold gold arcs out to 1.8 × the cymbal width plus a sparkle burst. Also call `weather.burst(x, y, {kind:'sparkle'})` on the `cymbal` event in `main.js`.
    - In portrait, `cymSPort` 0.9 → 1.1.

## P3 — polish
13. **Landscape: Bibi's lower stick crosses the cymbal stand.** Screenshots: `ip-l-*-04-play`, `pad-l-*-04-play`, `ip-l-vi-21-done`. Bibi's box ends at x 308 and the cymbal box starts at 316, but the stick tip reaches about x 330. Fix: `world.js` `CONFIG.cymOffLand: 150` → `180`.
14. **Title in landscape is crowded.** Screenshot: `ip-l-*-01-title`. The tagline runs over the title garland lanterns, and the play button covers the cloud cottage. Fix: in `render.js`, move the title garland right / below the tagline (start x ≥ tagline right + 20), or drop the title garland on `phone && !portrait`. The EN portrait tagline leaves an orphan "stars!" on its own line: `.tagline { text-wrap: balance }`.
15. **Session-done composition.** Screenshots: `ip-p-*-21-done`, `pad-p-*-21-done`. The rainbow's feet land on Bibi (left) and the cymbal (right). Fix: in the `render.js` done scene, scale the rainbow 0.8 and centre it between `bibiBox` right and `cymbalBox` left. The done title has a ragged 3-line wrap ("…12 / ngôi sao!"): `text-wrap: balance`.
16. **Landscape bubble tail points at the garland's left cloud, not at Bibi** (`*-l-*-04-play`). Fix in `style.css` `.bubble::before/::after`: hide the tail in landscape too, or move it to `left: calc(bibi.x − bubble.x)` from `main.js`.
17. **Pastel shape drums at noon.** Screenshot: `ip-p-en-age3-1-shapes`. The cream shape-drum body on the white-blue noon clouds is clear only through the silver hoops. An all-yellow round (square, heart, circle) is fine, but the square emblem (about 45 % of the front) is visibly smaller than the heart and circle. Fix: `drum_art.js` SHAPED: square side × 1.15.
18. **The "size" Talk icon and the animal Talk icons are small inside a 96 px button** (animal head about 30 css). Fix: `drawIcon` for `sound` / `animal` should draw the head only, at 0.8 × the box.
