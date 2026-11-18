# Visual QA report: Gigi's Peekaboo Windows (2026-11-18)

**How it was tested:** `node tests/visual/capture.js [screens moods critters talk notch]`. This captures about 250 PNGs plus `geometry.jsonl` into `tests/out/visual/<section>/`. The setup is Playwright Chromium with isMobile and hasTouch on four viewports: iPhone P 393×852 @3, iPhone L 852×393 @3, iPad P 820×1180 @2 and iPad L 1180×820 @2. In the notch section, `--sa-*` is overridden on `:root` before boot, with 47/0/34/0 for iPhone P, 0/47/21/47 for iPhone L and 24/0/20/0 for iPad. The world is frozen and stepped by hand, so every frame is deterministic. I looked at every listed screenshot myself.

**Automatic geometry checks (CSS px, all 4 viewports × 4 moods × peek/closed/matched/mismatch/stretch/cheer/scroll + critters + notch):**
- Speech bubble over a window: **0 px² everywhere**.
- HUD over a window: **0 px² everywhere**.
- Gigi's head box over a window: **0 px² everywhere**. The smallest head-to-window gap is 8.9 px (iPhone P, homes mismatch); it is usually 10–25 px.
- HUD, bubble and windows outside the notch safe area: **0 px²**.
- Talk-time panel overflow: 0, and no clipped text in any EN/VI case (ages 3–7).

The layout contract holds. What follows are composition and polish problems that the numbers do not catch.

> Note for test authors: `GW.debug.cardScreen(id)` returns the window **centre** in `x/y` (plus w/h). The e2e tests rely on that by tapping at `(x, y)`, but MECHANICS.md calls it "`cardRect(c)` → CSS px". The new capture script converts the value. See P3-9.

---

## P1

### P1-1: The session-done payoff (the lit street and Gigi) is hidden behind the done panel
Screenshots: `screens/iphoneP-*-06-done.png`, `screens/ipadP-*-06-done.png`, `screens/iphoneL-*-06-done.png`, `notch/iphoneL-vi-6-done.png`, `screens/ipadL-*-06-done.png`.
- **iPhone P:** the panel spans y 321–681 CSS on an 852 px screen. The mini building's windows sit right under its bottom edge, so only the flower boxes and umbrella handles show, and Gigi's head is behind the panel. The upper 40 % of the screen is empty sky with confetti.
- **iPad P:** the panel spans y 616–944. It covers the whole building facade (the umbrella windows show through the panel at about 10 % opacity) and Gigi's head and neck.
- **iPhone L:** the panel spans x 448–840. The building is centred at `W·0.6` (logical), which is about x 511 CSS, so only one window peeks out to the left of the panel.
- **iPad L:** the panel spans x 698–1168. The building is cut in half by the panel.

Suggested fix:
- `game/css/style.css`: for portrait, put the done panel at the **top**. Change `#scrDone { align-items: flex-end; padding-bottom: … }` to `align-items: flex-start; padding-top: calc(var(--sa-t) + 6vh)` for the portrait media query. The scene (ground band) is at the bottom.
- `game/js/render.js` `_doneScene()`: in landscape (`o.compact`), set `cx = L.ins.left + W * 0.36` instead of `W * 0.6`, so the building stands between Gigi (`gx ≈ W·0.14`) and the right-hand panel. Also cap `cw` so that `rowW + 2·pad ≤ W·0.42`.
- Optional: add `pointer-events:none` translucency, or give the done panel `max-width: 46vw` in landscape.

### P1-2: Talk-time choice pictures are tiny, and the text label dominates (ages ≤ 5)
Screenshots: `talk/iphoneP-en-a4-homes.png`, `talk/iphoneP-en-a4-colors.png`, `talk/iphoneL-vi-a4-colors.png`, `talk/iphoneP-vi-a3-colors.png`, `talk/ipadL-en-a4-*.png`.

The choice `<canvas>` is 64×64 CSS (84 on iPad). `Renderer.preview` → `drawItemBody(s = min(ch·0.98, cw·1.2) ≈ 63)` draws a window card that is `0.62·s ≈ 39 × 50` CSS px. The sticker inside it (web, nest, hutch, balloon) is only about 25–30 px. The word below it is a 16 px label that is wider than the picture, but a 3–4-year-old must answer from the picture. The "web" choice is hard to read at that size. The show card above (`#talkShow`) is fine on portrait; on iPhone L it is only ≈ 70 px wide in a 170 px empty column.

Suggested fix:
- `style.css`: set `.talk-choices button canvas { width: 92px; height: 92px }` (iPad 120), and set `.talk-choices button { min-width: 112px }`.
- `render.js` `drawItemBody`: add an `opt.fill` used for choices that draws the face without the card frame (or `cw = s·0.86`). In `Renderer.preview` pass `s = Math.min(ch, cw) * 1.25` for choice canvases.
- For ages ≤ 4, consider hiding the label (`small`) or reducing it to 14 px under the picture. The name is spoken anyway.

---

## P2

### P2-1: Cars and the surprise bus pass under Gigi's hooves, so she looks like she is standing on the roof
Screenshots: `moods/*-1-peek.png` (every viewport: a car at x 30–96 logical when the peek starts), `moods/iphoneP-m0-colors-5-stretch-far.png`, `moods/iphoneL-m0-colors-5-stretch-far.png`, `moods/iphoneP-m2-count-7-scroll-mid.png`, `notch/iphoneP-*-2-peek-a7.png`, `moods/ipadL-m2-count-1-peek.png`.

The lane 1 car sits at `groundY + 82` with h 75 and the sprite top at `y − h·114/120`, so its roof is at **`groundY + 11`**. The bus (`busDy 82`, h 92) has its roof at **`groundY − 8`**. Gigi's feet anchor is at `groundY + 22/24`. She is drawn after the traffic, so her hooves land on the car or bus roof. Every round starts with a car entering from the left at Gigi's x. On iPhone P (no inset) the road band is only `H − (groundY + 40) = 50` logical px (27 CSS), and the bus wheels touch the screen bottom (`critters/iphoneP-bus.png`).

Suggested fix: the road is nearer the viewer than the pavement, so in `render.js` `_game()` draw `traffic` and the bus **after** `this._gigi(...)`, before the pigeon and balloon. As an alternative, keep them behind her, shrink the cars to `carW 120 / carH 60`, and skip drawing any car whose `|x − layout.gigi.x| < 0.6·h` while it is under her. In portrait, also clamp `busDy`/`carLaneDy` so the sprite bottom is ≤ H − 2.

### P2-2: In phone landscape Gigi's neck lies horizontal at pavement level when she "peeks" or cheers
Screenshots: `moods/iphoneL-m0-colors-5-stretch-far.png`, `moods/iphoneL-m0-colors-6-cheer.png` (neck flat, head at hoof height next to the facade), `moods/iphoneP-m0-colors-5-stretch-far.png` (head at the front door, below all windows), `moods/ipadP-m1-shapes-4-mismatch.png`.

With a 6×1 or 5×2 grid filling the height between the bubble and the ground, the only valid head joints outside `grid.rect + 16` are below the grid. `_nearestHead` therefore pushes the head down and sideways. She looks away from the window she is supposed to peek at, and the neck reads as a snake or a lying giraffe. Cheer has the same problem: the roof target is unreachable, so the head ends up beside her body.

Suggested fix: in `game/js/world.js` `_headOk`, require the head to rise. Add `if (jy > L.neckBase.y - cfg.headRiseK * h) return false;` with `headRiseK ≈ 0.3` in CONFIG. When nothing qualifies, `_nearestHead` already falls back to `headRest`, and the eyes can still look at the window through `lookX/lookY`. For `key 'roof'` in landscape, fall back to `headRest` plus the cheer face.

### P2-3: Open shutters of neighbouring windows overlap each other and the door arch
Screenshots: `moods/iphoneL-m3-homes-1-peek.png`, `moods/iphoneL-m1-shapes-1-peek.png`, `moods/iphoneL-m0-colors-6-cheer.png`, `moods/iphoneP-m0-colors-1-peek.png`.

With `gap = max(18, 0.16·cw)` (≈ 22 logical on these layouts) and each open shutter swinging out to about 0.25·cw past the frame, two neighbouring open shutters stack on top of each other with no facade between them. On iPhone L (6×1), the shutters of windows 3 and 4 also overlap the top of the door arch (`door.y − door.h` ≈ the window bottom). This breaks DESIGN §2 ("every window keeps ≥ 0.5·gap of facade") once the windows are open, and the facade reads as a solid wall of shutters during peek.

Suggested fix:
- `world.js` `chooseGrid`: raise `gap = max(22, 0.30·cw)` for the column gap only (row gap can stay).
- or `window_art.js` `drawWindow`: limit the open shutter's outward extent to `min(0.25·w, gap·0.45)` by foreshortening it more (the cos term ×0.6).
- Door placement: require `door top ≥ last-row window bottom + bloom box height + 8`.

### P2-4: "1 stars" in English
Screenshots: `screens/ipadL-en-06-done.png` ("You did it all! 1 stars! Hooray!") and `screens/iphoneP-en-06-done.png`.

Fix in `game/js/i18n.js:437`: use a `{starsWord}` param, or add `session.done1` variants for `stars === 1` ("1 star!"). Check `ui.allDone` the same way. Vietnamese needs no plural.

### P2-5: Vietnamese colour choices on iPhone portrait wrap 2 + 1, and button widths are uneven
Screenshots: `talk/iphoneP-vi-a3-colors.png` and `talk/iphoneL-vi-a4-colors.png` (widths 113 / 100 / 166 px).

"màu xanh dương" makes the third button 154–166 px wide, so on iPhone P it drops to its own row. The panel grows from 483 to 605 px tall and the mic button wraps to two lines.

Suggested fix: in `style.css`, set `.talk-choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); }` with `max-width` 3 columns, and `small { white-space: normal; line-height: 1.05; font-size: 15px }`. Or label colour choices without the "màu" prefix (the voice still says it): `ui.js` `openTalk` → `NAME(lang,'color',v).replace(/^màu /,'')`.

---

## P3

1. **Speech bubble oversized on iPad.** It is 728×141 CSS (iPad P) or 728×138 (iPad L) for one line of text, with about 60 % white space (`moods/ipadL-m2-count-1-peek.png`, `critters/ipadL-pigeon.png`). It hides the sun and gable roof. Fix: in `world.js` CONFIG, set `bubbleH` to 96 and `bubbleHPort` to 100 on large screens, or have `placeBubble` shrink to `scrollHeight + 20`.
2. **Bubble tail points at nothing.** The `.bubble::before` arrow is on the left at 54 % height, but Gigi is at the bottom-left, 600+ px away. Fix: remove the arrow on the in-game bubble, or move it to the bottom-left corner (`left: 28px; top: 100%; border-top-color`).
3. **Title, iPad L VI** (`screens/ipadL-vi-01-title.png`): the line gap between "Hươu Gigi" and "Mở Cửa Sổ" is too tight, and the descender of "Gigi" touches the hook of "ổ". Fix: `.logo { line-height: 1.12 }` (or `#logo2 { margin-top: .06em }`) for `:lang(vi)`. The tagline pill (x 270–908) also overlaps Gigi's ear by about 20 px. Shift the title wrap with `padding-left: 8vw` in landscape, or shrink `gigi_title` to `H·0.5`.
4. **Title, phone portrait** (`screens/iphoneP-*-01-title.png`): there is an empty band of about 150 CSS px between the age chip (bottom 468) and the skyline. The composition feels top-heavy. Fix: `justify-content: space-evenly` on `.title-wrap`, or raise `gigi_title` to `H·0.34`.
5. **Settings, iPhone L** (`screens/iphoneL-*-02-settings.png`): the panel scrolls 41 px and the 4th toggle ("Trả lời bằng giọng nói") sits half under the sticky Done button at rest. Fix: `.set-grid { grid-template-columns: repeat(4, 1fr) }` when `max-height: 430px`, with toggle font 15 px.
6. **Done text line breaks** split "1 / ngôi sao" and "1 / stars". Fix: join `{stars}` and its noun with ` ` in `i18n.js`.
7. **Two-digit numerals** ("12", age 7) nearly touch the window frame at cssW 78 (`notch/iphoneP-*-2-peek-a7.png`). Fix: in `window_art.js` `drawFace` number, set font size `min(0.62·w, 0.5·h)` for 2 digits.
8. **Yellow on a lit interior.** Yellow `#FFD23F` on the lit interior `#FFE9A8` has a luminance contrast of only 1.20:1; it reads thanks to the dark outline `#C99A12` (2.15:1). That is fine at present sizes (`moods/iphoneL-m0-colors-6-cheer.png`), but do not thin that outline. All other answer colours have ≥ 1.76:1 on the lit interior and are clearly distinct in hue from every facade and shutter colour. Rain mood stays readable and cosy: drops on the glass are subtle and do not cover numerals.
9. **`cardScreen()` docs.** `cardScreen()` returns the centre, not a rect. Either rename the fields `{cx, cy, w, h}` or fix `docs/MECHANICS.md` line 35 / DESIGN §6.6.
10. **Stale project CLAUDE.md.** `CLAUDE.md` at the project root still describes Dee's Forest Memory (`DM`, `dm:` prefix, card_art.js). Update it to Gigi/`GW`/`gw:`.
11. **Pigeon over the shutter.** The sitting pigeon (64 px) covers the lower-left shutter of its window (`critters/ipadL-pigeon.png`). It is acceptable since a tap on it never counts, but the sill spot could be clamped to the outer 30 % of the sill.
12. **Talk on iPhone L** (`talk/iphoneL-vi-*.png`): the left column (170 px) holds a 70 px show card with empty space, and the title is centred over the whole panel while the question and choices are centred over the right column. Fix: `.talk-panel h2 { grid-column: 2 }` and `#talkShow { width: 170px; align-self: center }` drawn at full canvas size (see P1-2).

## What looks good
- HUD and bubble respect the Dynamic Island and the home indicator in every notch shot. Windows never enter the unsafe zones.
- Window faces are crisp and readable at every size measured (cssW 76–174). Homes stickers are distinct and empty, and the parity frames (odd blue, even orange) are clear.
- All four moods are coherent. Breezy has leaves and a kite. Rain darkens but stays warm because the window interiors glow. Rainbow has puddle reflections. Parallax layers align with the pavement and no seams were visible in scroll-mid shots. The scroll shows both buildings cleanly.
- Matched windows light up, with bloom flowers in the pair colour (mixed for non-colour topics) plus confetti. Cheer bunting looks good.
- Pigeon, bus and balloon are well scaled. The balloon string pendulum looks right.
- Vietnamese diacritics render correctly everywhere: HUD, bubble, banner, pause, settings, Talk, done.
