# Bun's Dino Dig — visual QA report (2026-11-08)

Reviewer: visual QA (report-only; nothing in `game/` or the design docs was changed).

## How this was checked
- `node tests/visual/screens.js` (rewritten for the dig game; the old `qa_full.js` from the paint game is deleted).
  It boots the game in Playwright `isMobile/hasTouch` contexts, sets notch insets by overriding `--sa-t/r/b/l` on `:root`,
  drives the game through `DD.debug`, and measures layout, colours and DOM text fit inside the page.
  Output: about 350 PNGs + `geometry.json` in `tests/out/visual/` (gitignored). The 57 shots listed in
  `tests/visual/keep.txt` are copied to `docs/reports/visual/` (8-bit palette PNGs, about 5 MB) with a trimmed
  `geometry.json`. Subsets: `DEV=ip-p,pad-l LANGS=en PART=screens,topics,moods,seq,hero`.
- Viewports (CSS px, insets t/r/b/l): iPhone 15 portrait `ip-p` 393×852 (47/0/34/0), landscape `ip-l` 852×393
  (0/47/21/47), iPhone SE `se-p` 375×667 (20/0/0/0), iPad `pad-p` 820×1180 and `pad-l` 1180×820 (24/0/20/0), iPad Pro
  `pro-l` 1366×1024 (24/0/20/0). Review shots use DPR 1. The hero shots are iPhone @3 (night, VI) and (sunset, EN), plus iPad @2.
- Screens: title, settings, chapter banner, a round, pause, mid-dig, wrong dig dimmed, hint hand, reveal, egg hatch / hop,
  full shelf (12 injected items), mole, pterosaur, Talk time and session done. Each was captured on all 6 viewports in EN and VI.
  Every topic for ages 3–7 was captured on `ip-p`, `ip-l` and `pad-p` in both languages. All 4 moods (levels 0–3, colour
  and shape rounds) were captured on every viewport. Frame sequences of dig → reveal → crack were taken at 1/5 speed, and
  per-frame motion was traced at 1×.
- Colour numbers are measured from the rendered canvas: the median of a 5–7 px patch of the visible clue and the sand of its
  mound. WCAG contrast ratio (cr) and CIE76 ΔE are given. Logical px = world units (short side 720). CSS px = what the
  finger sees (×0.546 on iPhone 15, ×0.521 on SE, ×1.139 on iPad, ×1.422 on iPad Pro).
- Zero console errors in every run.

## Summary of what is good
- No mound overlaps Bun, the shelf, the HUD or the bubble, and no mound leaves the safe area. This holds on every viewport,
  age and topic, with zero geometry issues apart from the bubble/shelf issue in P1-1.
- Hit circles: diameter 162–186 logical. In CSS px: 100 (iPhone portrait, ages ≤ 4), 87 (ages 6+), 89 / 78 (iPhone
  landscape), 95 (SE), 185 (iPad) and 231 (iPad Pro).
- Peeking clues are readable at @3/@2 for every kind. Visible peek heights in logical px: egg 53, stone 58 (51 at age 5+),
  toy 49–66, bone 41–56, tablet 62. Toy heads (frog, pig, cow, dog, lion, elephant) read clearly. The silhouettes of
  circle, star, heart and rect stones read clearly from the top.
- Vietnamese text fits every button, panel, bubble and the banner. Bubble font is 18–20 CSS px on phones and 34 on iPads.
  The Talk panel fits on every viewport without scrolling. Choice buttons are 106×96 CSS px (iPhone), 101×88 (SE),
  124×112 (iPhone landscape) and 140×128 (iPad).
- The motion looks physical:
  - Dig steps 0 → 0.33 → 0.66 → 1 with eased plunges.
  - The shovel arcs in from above and leans while lifting.
  - Sand clumps (≤ 30) fly in arcs and settle.
  - The thing rises with an overshoot to 1.14, then settles, with squash `tsy` 0.87–1.14.
  - The crack grows 0 → 1 over about 0.75 s.
  - The hop shrinks 112–129 → 64 along a parabola.

  See `docs/reports/visual/*-seq-dig-hatch-hop.png`.
- The art style is consistent: Bun, the eggs, the stones, the toys, the dinos, the mole and the pterosaur all use the same
  flat chunky cartoon style with tone outlines.

---

## P1 — fix before release

### P1-1 Portrait: the speech bubble covers the treasure shelf (every iPhone / SE, both languages)
- Cause: `main.js placeBubble()` moves the DOM bubble below the real HUD (`r.y = hud.bottom + 8`). On iPhone 15 the
  bubble starts at logical y 222 instead of the layout's 196 (`ins.top + bubbleYPort` = 86 + 110). `world.js
  computeLayout` still places the shelf from the layout bubble, at `shelf.y = 196 + 124 + 14 = 334`. Vietnamese 2-line
  prompts also grow the bubble (`_fitBubble` allows up to 1.35 × h).
- Measured, in logical px:

| viewport | DOM bubble bottom EN / VI | shelf item tops (plank − 64) | covered | bubble tail tip |
|---|---|---|---|---|
| iPhone 15 portrait | 346 / 355 | 332 | 14–23 px of every item | 367 (over slot 0–1, x ≈ 57–77) |
| iPhone SE | 305 / 317 | 284 | 21–33 px (about half an item) | 338 |
| iPad portrait | 255 / 255 | 267 | 0 | 276 (over slot 0, x ≈ 56) |

- What you see: on SE the shelf shows only the bottom third of the finds; the heads of dinos, toys and tablets ("B",
  "12") are hidden. See `se-p-vi-11-fullshelf.png`, `ip-p-en-11-fullshelf.png` and `pad-p-vi-11-fullshelf.png`.
- Fix: compute the portrait bubble from the measured HUD in the world, not in main.js. In `computeLayout`, use
  `bubble.y = max(ins.top + bubbleYPort, hudKeepBottom + 8)` with `hudKeep` (already passed as `world.hudKeep =
  measureHud()`). Then place the DOM bubble exactly at `layout.bubble`. Also make `shelfGapPort` 14 → 40: tail 21 px,
  plus 9 px of VI growth, plus a 10 px gap. Alternatively give the bubble `max-height: h` and shrink the font instead
  of the box. Cheaper interim fix: in `computeLayout` portrait, `shelf.y = bubble.y + bubble.h + 40` and
  `bubbleYPort = 150`. The layout bubble then starts at 236 on iPhone 15 (HUD + 8 = 222) and at 188 on SE (HUD + 8 = 181),
  so main.js never pushes it.

### P1-2 Night (chapter 4): the answer colours go muddy, so "red", "orange" and "yellow" look maroon, brown and olive
- Cause: `dig_art.js T()` mixes every thing colour `0.42 × night` toward `NIGHT #34416C`.
  - Palette → night: red `#E84A4A → #9C4658`, orange `#FF9A2E → #AA7548`, yellow `#FFD23F → #AA9552`,
    pink `#FF8FC0 → #AA6E9D`.
  - Measured on screen (`ip-p-mood3`, `pad-l-mood3`, `pro-l-mood3`): orange egg `#AF7D53`, red `#A25465`,
    purple `#74539B`, sand `#9D9387`.
  - Pairwise ΔE at night: orange–red 34 (47 by day), red–purple 40 (72 by day).
  - Orange egg vs sand: cr 1.18, ΔE 26.
  - In the @3 hero shot (`hero-ip-p@3-mood3-vi.png`) the yellow egg reads as mustard/olive and the red one as raspberry.
- Same problem for the other clue kinds at night (`ip-p-en-age3-animals`, `age5-animals`, `age6-count`, `age7-oddeven`):
  - Bones `#ACAAAA` on sand `#9D9387`: cr 1.31, ΔE 11. The count clue almost vanishes.
  - Toys: duck `#A59662` (cr 1.03, ΔE 22), pig ΔE 23, dog ΔE 13, cow ΔE 17.
  - Tablet stone vs sand ΔE ≈ 20.
- Fix in `dig_art.js`:
  - Add a separate factor for the thing fills (eggs, stones, toys, bones, tablets, dinos): mix ≤ 0.12 × night
    (red → `#D2494E`, yellow → `#E5BF46`). Keep 0.42 for the sand / mound / outline tints only.
  - Keep the shelf items at their current `night × 0.6`, then scale it to the same ≤ 0.12.
- Fix in `render.js`:
  - Draw the "warm lantern glow" after the mounds and before the things. The current glow in `_backdrop` is painted
    under the mounds, so the mounds stay grey `#9D9387`.
  - Or warm the night mound in `DigArt.drawMound`: mix the sand 0.25 toward NIGHT plus 0.12 toward `#FFD68C`, aiming
    for a night mound of about `#B9A88E`.
- Target: every night clue at ΔE ≥ 35 vs its mound, and every answer pair at ΔE ≥ 45.

### P1-3 Red + orange eggs in the same round at age ≤ 4 (and at night at any age)
- Seen in `ip-p-en-age3-colors` (morning) and the night rounds `ip-p-mood3`, `pad-p-mood3` and `pro-l-mood3`.
- ΔE red–orange is 47 by day and 34 at night. Every other pair in the same rounds is ≥ 72 by day.
- For a 3–4-year-old, red vs orange on beige sand is the hardest pair in the palette.
- Fix: in `content.js` (colors topic, the "never together below age 5" list in DESIGN §3), add red+orange for ages ≤ 4.
  For level 3 (night) at any age, also avoid red+orange, red+pink and blue+purple.

---

## P2 — should fix

### P2-1 Portrait phones are empty in the middle; the play field sits in the bottom third
- Gap between the shelf bottom and the top of the highest mound, with 3 mounds (age 3–4, most rounds), in logical px:
  699 on iPhone 15 (45 % of the screen height), 529 on SE (41 %) and 326 on iPad portrait (31 %).
  With 5 mounds (`count`) it is 492 (32 %).
- On iPhone portrait the things are 70 CSS px tall (60 at age 6+). The middle 380 CSS px are just sand and sky.
  See `ip-p-en-04-round.png`, `se-p-en-04-round.png` and `ip-p-en-age7-oddeven.png`.
- Fix (`world.js` CONFIG / `computeLayout` / `placeMounds`):
  - (a) Use a bigger item on tall phones: `tallItem 1.15 → 1.35` when `H/W > 1.9`. That gives item 151 logical
    (82 CSS px), mound 234 and hit radius 105 (115 CSS px diameter). Capacity stays ≥ 2 per row.
    `MAX_MOUNDS = 8` still fits in the 4 portrait rows (check with the unit capacity test).
  - (b) When fewer rows are used than available, spread them over the free height:
    `gap_used = clamp((rows[0].y − limit) / used, rowGap, 1.7 × rowGap)`. The back row then sits about mid-screen
    instead of at `groundY − 18 − 204`.
  - Optionally (c) on tall portrait screens, put the shelf just above the back row instead of under the bubble. The
    hop then becomes short and stays clear of the bubble (see P2-3).

### P2-2 iPhone landscape: things and shelf finds are small
- Things are 61 CSS px (52 at ages 6–7). Hit circles are 89 / 78 CSS px. Shelf items are 35 CSS px on every iPhone
  (33 on SE), so a hatched dino on the shelf is about the size of a fingertip.
- The landscape field has room: 3 mounds use 1 of 2 rows, and 40 % of the height above the field is empty.
- Fix:
  - Scale `item` by 1.2 on phone-sized viewports. main.js can pass `phone = view.s < 0.6` to `World.setViewport` /
    `computeLayout` (item 134 / 125 / 115 by age).
  - On phones: `shelfItem 64 → 84`, and on portrait `shelfSlots 12 → 8`. On 720-wide portrait, spacing is then
    (672 − 84) / 7 = 84, so nothing overlaps. Keep the 12 slots on iPad.

### P2-3 Hopping finds fly behind the speech bubble and off the top of the screen
- Cause: `hopApex 140` is measured above the higher end of the arc, and that end is the shelf slot.
- Landscape iPhone: trace minimum item bottom y = 74 logical with an item of about 88 px. The top of the item reaches
  y ≈ −14, off-screen. For slots 0–3 (x 324–552) the item passes behind the bubble (x 24–584, y 18–150). iPad landscape:
  minimum item bottom y = 95, bubble 42–161.
- Portrait: the bubble spans the full width, so every hop's apex (item bottom y ≈ 286, top ≈ 196 on iPhone 15) and its
  final drop pass behind the bubble at y 222–346. Visible in `ip-l-vi-11-fullshelf.png`: a yellow dino at the top edge,
  half behind the bubble.
- Fix:
  - main.js: on `hop` call `DD.UI.fadeBubble(true)`, and on `shelved` with `world.flying.length === 0` call
    `fadeBubble(false)` (the 0.32-opacity hook already exists).
  - world.js `_launch`: clamp the apex so the item top stays on screen,
    `apexY = max(ins.top + s + 8, min(y0, y1) − hopApex)`, and pass `apex = min(y0, y1) − apexY` to `hopPath`.
  - Landscape: fill the slots from the right end of the plank (slot order reversed), so the first finds of a chapter
    land away from the bubble.

### P2-4 A wrong dig is not visibly dimmed
- `dimTo 0.35` with the 0.55 grey mix gives only a 19 % shift. The wrong red egg measures (225, 95, 90) against base
  (232, 74, 74), basically unchanged.
- It stands fully risen on the rim and is the biggest, most saturated thing on screen after a mistake, competing with
  the real target (`ip-p-en-07-wrongdim.png`).
- Fix (world.js CONFIG / dig_art.js `T()`): `dimTo 0.35 → 1.0` (55 % toward `#C9BCA4`). Also let an `open` thing sink
  back to about 60 % visible after `dimAfter` (thingY → y − 0.12·h0 + 0.4·size), so it stays recognisable but quiet.

### P2-5 The night ground and mounds are flat blue-grey; the "lantern glow" is not visible
- Night mound `#9D9387`, ground fill `SAND_BOTTOM.night #697090`. The radial glow in `_backdrop` (0.34 alpha at its
  centre) is drawn before the mounds, so the playfield reads as cold and dull. See `ip-p-mood3`, `pad-p-mood3` and
  `pro-l-mood3`.
- Fix: covered by P1-2 (draw the glow over the field after the mounds with `globalCompositeOperation = 'soft-light'`,
  alpha 0.45, or warm the mound tint). Optionally also give each mound a small warm contact light, e.g.
  `rgba(255,214,140,.18)`, as an ellipse under it.

---

## P3 — polish

1. **Bubble tail points at the shelf, not at Bun.** `style.css .bubble::before/::after` sit at `left: 38px`. Bun stands
   bottom-left, 900–1000 logical px below the bubble in portrait, so the tail lands on shelf slot 0. Either drop the tail
   in portrait (`.bubble.port::before, .bubble.port::after {display:none}`) or put a small round Bun-face avatar
   (48 px) at the bubble's left edge.
2. **Chapter banner duplicates the bubble.** On the `level` event, main.js calls `DD.UI.say(T('topic.' + topic))`,
   so "Colour Eggs" is shown twice during the 2.5 s intro (`ip-p-en-03-banner.png`). Use `DD.UI.say('')` during
   `intro` and show the topic only on the banner. In iPhone landscape the banner (cy = 0.42 H = 302, h 170) also
   covers the shelf plank at y 214 for that time; use `cy = max(H*0.42, shelf bottom + bh/2 + 12)`.
3. **Yellow on sand is the weakest daytime pair:** cr 1.06–1.08, ΔE 38–43 (all others are cr ≥ 2 or ΔE ≥ 59). It reads
   because of the `#C99A12` outline. Darken the egg/stone outline for yellow to `#A87E0A` and add a 2 px darker
   contact shadow where the clue meets the sand (`dig_art.js`, egg/stone outline).
4. **Shelf slot 0 overlaps the shelf's pennant pole** (`pad-l-mood2-shapes.png`: the orange circle stone at slot 0
   over the flag). In `computeLayout` start the slots ≥ `shelf.x + 48`, or move the flag in `DigArt.drawShelf` to the
   right end.
5. **Session-done gallery on narrow portrait** (SE, iPhone): 12 treasures plus Bun are packed into about
   330 × 130 CSS px. Items overlap Bun's ears and each other (`se-p-vi-15-done.png`, `ip-p-en-15-done.png`), while
   about 140 CSS px of sand between the panel and Bun stays free. In `render._doneScene` use two arcs (inner radius
   0.55, outer 0.85 × the free height above Bun) on portrait.
6. **Bun is not night-tinted.** He is full cream `#F4ECDF` at night (`hero-ip-p@3-mood3-vi.png`). This is fine for
   readability but looks pasted on; a 10 % night tint plus a warm rim light from the lantern side would match the scene.
7. **iPhone landscape title:** the logo "Thỏ Bun Đào Kho Báu" fits on one line but is about 24 CSS px tall, in white
   and gold over a pale morning sky (`ip-l-vi-01-title.png`). Raise the landscape logo `font-size` to `clamp(30px, 8vh, 56px)`
   and darken its outline, or add a soft dark glow.
8. **Settings chips are 40 CSS px tall** in iPhone landscape (age, language). These are parent-only controls, but 44 px is
   the iOS minimum: `.set-row .chip { min-height: 44px }` in the landscape media query.
9. **Shovel path:** on its fly-in from the top, the shovel sweeps over a different mound for about 2 frames before
   reaching the tapped one (`ip-p-seq-dig-hatch-hop.png` frame 3). A 3-year-old may think the wrong mound is being dug.
   Start the fly-in straight above the target (`shovel.x = m.x + 60`, `y = m.y − 420`).
10. **Project `CLAUDE.md` is still the "Nini's Sea Painting" file** (goal, stack, test command,
    `tests/unit/pictures.test.js`). Rewrite it for Bun's Dino Dig when you update the README.

---

## Numbers by viewport (logical px unless noted; round with 3 mounds at age 4)

| viewport | W×H | scale | item | hit Ø CSS | thing CSS | shelf item CSS | bubble bottom | shelf item top | empty gap above field |
|---|---|---|---|---|---|---|---|---|---|
| iPhone 15 portrait | 720×1561 | 0.546 | 129 | 100 | 70 | 35 | 346 (VI 355) | 332 | 699 (45 %) |
| iPhone SE | 720×1281 | 0.521 | 129 | 95 | 67 | 33 | 305 (VI 317) | 284 | 529 (41 %) |
| iPhone 15 landscape | 1561×720 | 0.546 | 112 | 89 | 61 | 35 | 140–150 | 150 | 287 (40 %) |
| iPad portrait | 720×1036 | 1.139 | 112 | 185 | 128 | 73 | 255 | 267 | 326 (31 %) |
| iPad landscape | 1036×720 | 1.139 | 112 | 185 | 128 | 73 | 161 | 171 | 286 (40 %) |
| iPad Pro landscape | 960×720 | 1.422 | 112 | 231 | 159 | 91 | 157 | 167 | 294 (41 %) |

Ages 6–7 use item 96 (110 when tall): hit Ø 78–87 CSS px on iPhones.

## Colour of the peeking clue vs its mound (iPhone 15; WCAG cr / ΔE)
| mood | sand | red | orange | yellow | green | blue | purple | bones | worst pair ΔE |
|---|---|---|---|---|---|---|---|---|---|
| morning | `#E9CF9A` | 2.30 / 61 | 1.33 / 43 | 1.06 / 43 | 1.30–1.81 / 45 | 2.05 / 83 | 3.41 / 91 | — | orange–red 47 |
| noon | `#E9CF9A` | 2.31 / 61 | 1.33 / 43 | — | 1.31–1.59 / 47 | 2.07 / 83 | — | 1.26 / 18 | orange–red 47 |
| sunset | `#DEC697` | — | 1.22 / 34 | 1.07 / 38 | 1.39 / 49 | — | 3.13 / 85 | 1.24 / 16 | yellow–green 61 |
| night | `#9D9387` | 1.70 / 36 | **1.16 / 26** | — | — | — | 2.04 / 54 | **1.31 / 11** | **orange–red 34** |

The bones are cream on cream sand by day (ΔE 16–18) but still read thanks to their outline. At night they disappear.

## Files
- Script: `tests/visual/screens.js`; curated list: `tests/visual/keep.txt`.
- Screenshots: `docs/reports/visual/*.png` (57). Measurements: `docs/reports/visual/geometry.json`, with per-capture
  `geom` (boxes, mounds, issues), `dom` (text-fit issues, panel and choice sizes, bubble font) and `colours`.
- Key shots per finding:
  - P1-1: `se-p-vi-11-fullshelf`, `ip-p-en-11-fullshelf`, `pad-p-vi-11-fullshelf`.
  - P1-2 / P2-5: `hero-ip-p@3-mood3-vi`, `ip-p-mood3`, `pad-p-mood3`, `pro-l-mood3`, `ip-p-en-age6-count`,
    `ip-p-en-age7-oddeven`.
  - P1-3: `ip-p-mood3`, `pro-l-mood3`.
  - P2-1: `ip-p-en-04-round`, `se-p-en-04-round`.
  - P2-3: `ip-l-vi-11-fullshelf`.
  - P2-4: `ip-p-en-07-wrongdim`.
  - Motion: `*-seq-dig-hatch-hop`.
