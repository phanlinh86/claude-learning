# Nuka's Snow Dig: visual QA report (2026-11-23)

The tester only reported. No `game/` file was changed.

**How it was run.** `tests/visual/screens.js` was adapted from Bun's Dino Dig. The egg, hatch and hop steps are gone. A right dig is now a real **rub**: `QA.rub(id)` sends pointerDown, then one zig-zag pointerMove per frame along `world.rubPath`, then pointerUp. The script also adds:
- the hat twirl and the float up to the aurora,
- a **belly-slide** capture (`QA.slideGeom()` plus the montage `*-seq-slide.png`, new part `PART=slide`),
- new thing kinds for `fillShelf` and `treasures` (hat, gem, fish, toy, tablet).

There are 2 new probes:
- `tests/visual/sky_probe.js`: where the sun or moon sits compared with the aurora ribbon.
- `tests/visual/ribbon_probe.js`: slot order, pitch, and the tops of the finds compared with the bubble.

The sweep covered:
- 6 devices: ip-p 393×852, ip-l 852×393, se-p 375×667, pad-p 820×1180, pad-l 1180×820 and pro-l 1366×1024. Safe-area insets were emulated with the `--sa-*` overrides.
- EN and VI.
- Every screen: title, settings, banner, round, pause, digging, wrong-dim, hint, rub, reveal, float, full ribbon, slide, seal, tern, Talk time and session done.
- Every topic for ages 3 to 7 (ip-p, ip-l, pad-p).
- 4 moods × 6 devices.
- Rub / dig / float sequences (ip-p, ip-l, pad-l) and slide sequences on all 6 devices.
- Hero shots at DPR 3 and 2.

That made 298 PNGs and `tests/out/visual/geometry.json`. 40 curated files are in `docs/reports/visual/`.

**Automated geometry was clean.** No drift overlaps Nuka, the ribbon, the bubble or the HUD. No drift sits outside the safe x range. The bubble overlaps neither the ribbon nor the HUD. No text overflows in EN or VI. No page errors. The slide box never overlaps the bubble or the HUD and never leaves the screen: the largest slideX is 324 on portrait and 420 on landscape, with `outR` ≤ −198. The only DOM flag is the small settings chips on iPhone landscape (P3-6).

Overall the game is cute and polished. Nuka's warm cream separates well from the bluish snow. The hats, gems, fish and plush animals read well when they peek out, including on the winter night: the drifts stay near-white on the lavender field, and every answer colour pops (see `hero-ip-p@3-mood3-vi.png`). Vietnamese text fits everywhere. There is no P1 blocker. The main problems are where things sit in the sky band and some motion/pose details.

---

## P1: none

---

## P2: fix before release

### P2-1 · Portrait: the sun or moon sits inside the aurora ribbon and looks like a find
- **Seen in:** `ip-p-mood3.png`, `pad-p-mood3.png`, `hero-ip-p@3-mood3-vi.png`. The moon sits inside slot ring 7 of 8 and reads as a glowing found item. The spring, summer and autumn suns also sit on the ribbon (`ip-p-en-04-round.png`, sun at CSS ≈ 305,258).
- **Numbers (`sky_probe.js`, logical px).** The sun disc overlaps the ribbon on **every portrait device in every mood**:

  | Device | Ribbon y | Sun/moon y | Disc overlap |
  |---|---|---|---|
  | ip-p | 399–511 | 445–491 | 2450–3025 px² |
  | se-p | 357–449 | 348–394 | 862–3660 px² |
  | pad-p | 279–371 | 298–344 | 2378–3440 px² |

  Landscape is clean: 0 overlap on all devices.
- **Suspect:** `render.js envLayout()` around line 79. Portrait uses a hard-coded `shelfBottom = ins.top + 110 + 124 + 14 + 92` (= 340 + inset), which does not match the real `layout.shelf` (bottom 511 on ip-p). `gapMid` therefore lands inside the ribbon. On pad-p the gap between ribbon and peaks is only `hillTop 280 − shelfBottom 371 = −91`, so there is no free band at all.
- **Fix:** Pass the real `layout.shelf` into `envLayout`, or give `_envFor(L)` the shelf box. Place the portrait sun at `y = shelf.y + shelf.h + 0.5·s + 8`, or above the ribbon at `shelf.y − 0.5·s` (right of the bubble tail). Clamp it so the disc never intersects `shelf`. If no band is free (pad-p), shrink the sun to 0.7·s and put it at x = W·0.86, between the ribbon's last ring and the edge. You could also skip it in portrait and keep only the sky glow.

### P2-2 · The belly-slide is mostly hidden behind the drifts and the risen things it passes
- **Seen in:** `ip-p-seq-slide.png` (t 0.69–1.33). At the far point (slideX 243–324) Nuka is about 70 % hidden behind the open hole's rim and the front-right yellow drift: only his ears and scarf show. In `ip-l-vi-11-fullshelf.png` the wrong grey hat, still risen in its hole, covers Nuka's whole body. `pro-l-vi-11-fullshelf.png` and `ip-l-vi-11b-slide.png` show him half under the hole rims.
- **Why:** In `render.js _game()` (lines 237–244), Nuka is drawn before the front-row drifts (`m.y >= bunY − 40`) and before `_riseOver`. The slide lane `y = layout.bun.y` is the same baseline as the front row. DESIGN §5.2 accepts "passes behind", but in practice the round's best moment can't be seen.
- **Fix, choose one:**
  - (a) While `w.bun.slide > 0.3`, draw Nuka after the front drifts and after `_riseOver`. He then slides in front of the snow, which also reads better physically, since he is closer to the camera.
  - (b) Shift the slide lane down by `+0.12·bun.h`, about +26 px logical, and draw him in front.
  - (c) Start the clear sink of the remaining drifts at the start of the cheer, not after `cheerTime`.

  Option (a) is the smallest change. Keep the snow puffs (`slidePuff`) in front too.

### P2-3 · The hat twirl spins around the hat's bottom and flips it upside down into the hole
- **Seen in:** `ip-p-seq-rub-dig-float.png` (frame `t 36.74 trot 4.47`) and `pad-l-seq-rub-dig-float.png` (`trot 4.24`). Mid-twirl the hat lies on its side or upside down, with its pompom below the ground line inside the hole. It looks like the hat falls over rather than doing a happy spin.
- **Suspect:** `world.js` line 891 sets `m.trot = TAU * easeInOut3(u)`. `render` applies `translate(x, thingY) rotate(trot)`, so the pivot is the bottom centre (header comment line 15: "tilt about its bottom").
- **Fix:** Make the twirl a **y-axis spin**: draw with `scale(cos(2π·u), 1)`, giving `|cos| ≥ 0.15` so it never vanishes, and keep `trot` = 0. Add a small `jumpY` hop of 0.25·size so the hat clears the hole. If you keep a rotation, pivot it at the hat's centre with `translate(0, −size/2)`, rotate, then `translate(0, size/2)`, and limit it to ±25° wobbles rather than a full turn.

### P2-4 · Landscape: the finds' tops nearly touch the bubble, the tail overlaps the last slots, and ribbon order is reversed
- **Numbers (`ribbon_probe.js`, logical px).**

  | Device | Bubble bottom | Item top (hat/tablet at slot size) | Gap | Tail bottom |
  |---|---|---|---|---|
  | ip-l | 140 | 150 | 10 | 161 |
  | pad-l | 161 | 171 | 10 | 182 |
  | pro-l | 157 | 167 | 10 | 178 |

  The 21 px tail overlaps the left-most slot finds by about 11 px. `pro-l-vi-11-fullshelf.png` shows the purple hat's pompom and the "12" tablet reaching into the bubble's bottom edge; this is worse while the settle bounce runs.
- **Order:** In landscape, slot 0 is the **right-most** slot (x 1309 on ip-l, under the HUD). In portrait it is the left-most (x 66, under the bubble tail). The first find in landscape therefore floats far right and sits alone under the pause button (`ip-l-en-04-round.png`, `hero-ip-l@3-mood2-en.png`). That is not wrong, but it is inconsistent and looks lonely.
- **Fix:** In `world.js computeLayout()` (line 198), use `shelf.y = max(ins.top + shelfYLand, bubble.y + bubble.h + 21 /*tail*/ + 8)` in landscape, or keep the y and move the tail to the bubble's right end. Fill slots left to right in both orientations so the ribbon "grows" from Nuka's side, or keep the order and start from the centre.

### P2-5 · Winter sky aurora shows hard vertical seams (a "barcode")
- **Seen in:** `crop-winter-sky-aurora-seams.png` (pad-p winter, top-left) and `hero-ip-p@3-mood3-vi.png` (behind the bubble and HUD). Bright crisp lines appear every 6 logical px, about 3–4 CSS px.
- **Suspect:** `render.js _skyAurora()` (lines 220–228) draws `fillRect(x, …, step + 1, hgt)` under `aur.blend`, which is additive in winter. The 1 px overlap between strips is added twice, making a bright seam at each strip edge.
- **Fix:** Use `fillRect(Math.round(x), …, step, hgt)` with no overlap. Better, build each ribbon as one path or gradient: one vertical gradient filled across a wavy polygon, with an alpha mask that varies by x. That gives a soft curtain. If you want the curtain look, vary strip alpha smoothly with x and blur once (≤ 1 `filter: blur(2px)` pass into an offscreen canvas that is cached per mood).

### P2-6 · Gem peeks: star and triangle look almost the same
- **Seen in:** `crop-peeks-shapes-fish-animals-letters.png` (top-left; `ip-p-en-age5-shapes.png`, "Dig up the green star gem!"). With peek 0.42 the star shows a single point plus a thin flat "shoulder" line. The triangle shows a single point, a little narrower. At 375–393 px phone width each peek is about 28–35 CSS px wide, and a 4–5-year-old can't tell them apart. Diamond and triangle are borderline on the winter mood (`ip-p-mood3-shapes.png`).
- **Suspect:** `CONFIG.peek.gem = 0.42` (`world.js` line 65) together with `NK.DigArt.drawThing` 'gem' geometry. The star's arm tips are at about 38–40 % of its height, which is right at the clip line.
- **Fix:** Make the peek depend on the shape. Use 0.58 for `star` so both upper arms show, and 0.50 for `triangle` and `diamond` so the slope difference shows. Alternatively, keep 0.42 and draw the star with arms at 30 % height, or make the star "fatter" (inner radius 0.5). Also check in content that `triangle` and `star` never share a round below age 5 if the art can't change.

---

## P3: polish

1. **The rub paw is a floating forearm.** `drawShovel` draws a long cylindrical arm with a cuff, detached from Nuka (`ip-p-en-08b-rub.png`, seq frames). It reads like a glove or sock flying around, and it starts high in the sky near the ribbon (seq frame 2). Fix in `dig_art.js drawShovel`: cut the arm to a round, chubby paw (mitten shape, h ≈ 0.55 of the current length) with a soft fur tuft. Start the paw from Nuka's side, or appear above the drift with a 0.1 s fade, never from the sky band.
2. **Session done:** the finds sit in a crowded arc on the ground and overlap each other by 20–40 %: red hat + star gem, fox behind fish, fish + whale + "7" (`pad-p-vi-15-done.png`, `ip-l-vi-15-done.png`, `se-p-vi-15-done.png`). DESIGN §7 says "every find of the session dances in the aurora". Fix in `render.js`, gallery: put them on the ribbon arc in the sky band (spacing ≥ 1.05·size, scale to fit), or use 2 rows on SE.
3. **SE and iPad portrait ribbon pitch < item size:** pitch 55 vs size 64 logical (`ribbon_probe`). A full ribbon overlaps neighbours by 9 px (`se-p-vi-11-fullshelf.png`). Fix in `computeLayout`: `size = min(size, pitch − 4)`, or 10 slots when `W/size < 12`.
4. **Bubble tail touches the first find in portrait:** `ip-p-en-04-round.png`, where the tail tip at y ≈ 205 CSS points into the blue hat at ≈ 215. That is fine as a pointer, but the gap is only ≈ 10 CSS px. Move slot 0 right by +0.5 pitch, or move the tail to x = 0.18 of the bubble width.
5. **White plush animals on white snow** (owl, hare, husky, goose, arctic fox) rely only on the outline and the eyes. The measured centre ΔE vs the drift is 1–8 (`geometry.json` colours; e.g. `ip-p-en-age7-initial` owl/hare/dog all ΔE ≤ 4 vs the drift `#F4F8FC`). They are still recognisable (ears and eyes, see the crop), but low-contrast on bright summer/spring. Fix in `dig_art.js` toy palette: shade the plush 1 step warmer or greyer (e.g. hare `#EDE7DF`, goose `#F1ECE2`, owl `#EEF0F4` with darker speckles), and thicken the outline to 4.5 px at 256.
6. **Settings chips on iPhone landscape** are 40 px tall (< 44): age chips 56×40, "English" 94×40, "Tiếng Việt" 121×40. Fix in `style.css`: `@media (max-height:430px){ .chip{ min-height:44px } }`.
7. **Talk time on iPhone landscape:** the pause button (CSS 740–795, 10–65) overlaps the panel's top-right corner (panel top 57, right 790) by about 8 px (`ip-l-vi-14-talk.png`). Fix: `.panel { margin-top: calc(var(--hud-h) + 6px) }` in landscape-short, or hide the HUD while Talk time shows.
8. **Ice-puddle ellipses in the ground art** look like empty dug holes or drift shadows, especially next to a drift (`ip-p-en-04-round.png` right of the back drift; `pro-l-vi-11-fullshelf.png`). Kids may tap them. Fix in `tools/art_env.js` ground: make them fewer, or paler with lower alpha (≤ 0.35), and keep them out of the drift field rows.
9. **Drift silhouette** at dig 0 is a flat-topped trapezoid ("upturned bowl/table") rather than a soft rounded heap (all round shots). Fix in `dig_art.js drawMound`: round the top corners with a radius of 0.25·w and let the sides bulge out (a quadratic control point at 0.15·w outside). A wind-swept lip on one side would also add character.
10. **Title:** the white "Nuka's" / "Gấu Nuka" wordmark sits over pale mountains and sky, so contrast is low on iPad (`pro-l-vi-01-title.png`). There is a large empty field between the star chip and Nuka on tall phones (`ip-p-en-01-title.png`, y 480–650). There is no aurora, although §7 says "aurora". Fix: add a soft dark-blue 2-step outline or drop shadow to the white line. Draw a static aurora ribbon behind the logo. On tall portrait, move the Nuka / hat / fish / star row up by about 0.08·H, or scale Nuka ×1.2.
11. **Session-done heading wraps with an orphan:** "So many treasures! 5 / stars!" on ip-p EN (`ip-p-en-15-done.png`). Fix: use `text-wrap: balance` on the `h2`.
12. **The wrong-dimmed thing desaturates to grey-mauve** (red hat → `#8E7E86`-ish, `ip-p-en-07-wrongdim.png`). It can read as "a grey hat" next to colour answers. Consider keeping 35 % of the hue (`dim` → mix towards the snow shade rather than grey).
13. **Housekeeping (not `game/`):** the project `CLAUDE.md` still describes Bun's Dino Dig (`DD`, Bun, mole/pterosaur, eggs). DESIGN §5.5 lists a `NK.debug.rubMound(id)` hook, but `main.js hooks()` doesn't expose it (only `world.rubPath` exists). The visual script uses `world.rubPath` directly.

---

## What looked good
- Answer colours: no answer-colour pair below ΔE 20 on any mood. The winter night is the best-looking mood, with the drifts glowing on lavender snow and every hat colour vivid.
- Peeks: hat pompom plus crown, fish head with eye, animal heads with ears, antlers and tusks, whale spout, and the tablets (60 % peek, big carved glyphs) are all readable at in-game size.
- Nuka: warm cream versus bluish snow and a never-answer-colour scarf. He is never covered at rest, and geometry shows 0 overlaps with drifts, ribbon or bubble on all devices.
- The float-up with its sparkle trail and the settle on the ribbon are smooth (`ip-p-seq-rub-dig-float.png`). The rub flings snow in the stroke direction, and two rub passes dig a drift fully.
- Vietnamese prompts, chapter names, Talk time, pause and done all fit on SE with no overflow.
