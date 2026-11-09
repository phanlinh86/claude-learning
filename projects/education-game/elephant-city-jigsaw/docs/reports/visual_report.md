# Visual QA report: Pom's Puzzle Town (2026-11-09)

**Sweep:** `node tests/visual/screens.js` (≈ 9 min with the 4 devices in parallel: `DEV=ip-p`, `DEV=ip-l`, `DEV=pad-p` and `DEV=pad-l`).
It produced 395 screenshots in `tests/out/visual/`, plus `geometry-<dev>.json` and `issues-<dev>.txt`:
- **Screens:** 4 viewports × EN/VI × 17 screens (title, settings, chapter banner, play, held piece, near miss, wrong, hint hand, pigeon pecking, pigeon walking, bubbles, pause, alive, page turn, Talk time, Talk answer, done gallery).
- **Topics:** every topic for ages 3, 4, 5, 6 and 7 × 4 viewports × EN/VI (160 shots).
- **Seasons:** all 4 seasons × 6 board scenes per viewport.
- **Notch insets:** emulated through `--sa-*` overrides: 47/0/34/0 on phone portrait, 0/47/21/47 on phone landscape, 24/0/20/0 on iPad.

I reviewed 50+ screenshots and 4 zoomed crops (`tests/out/visual/crop-*.png`). I also rendered a glyph shadow/piece contact sheet: `tests/out/visual/glyph-shadows.png`.

Units: **logical px** (world units, short side 720). **css** = CSS px (iPhone: 1 logical = 0.546 css; iPad: 1.139 css).

**What is good:** Pom is charming and consistent across all screens. Vietnamese text fits everywhere: 2 lines at most, with no clipping in the bubble, Talk, done or settings. The answer colours pop on the cream tray in every season. The board frame, the hint hand, the banner, the pause panel and the title read cleanly. Talk choices are big: 106×96 css on iPhone portrait, 124×112 css on iPhone landscape, 138×125 css on iPad. Nothing important sits under the notch or the home indicator. The one small exception is P3-2.

---

## P1: fix before shipping

### P1-1 · The pigeon walks through the tray and covers pieces (all 4 viewports, not only portrait)
- **Screenshots:**
  - `tests/out/visual/ip-p-en-09b-pigeon-walk.png`: walks over the lower shelf and covers 40 % of the car.
  - `tests/out/visual/ip-l-vi-09-pigeon.png`: pecks inside the tray beside Pom.
  - `tests/out/visual/pad-l-en-09b-pigeon-walk.png`: covers 57–60 % of the car.
  - `tests/out/visual/pad-p-en-09-pigeon.png`
- **What:** The pigeon walks at `L.groundY`, which is inside the tray rect in every layout. In landscape the whole pavement *is* the tray. The pigeon is drawn after the resting pieces, so it covers the piece the child has to grab. The probe measured "pigeon crosses tray shelf" on all 4 viewports × 2 languages, and "pigeon overlaps tray piece" by 37–60 %.
- **Fix:**
  1. `game/js/world.js` `_stepSurprises` and `_pigeonPlan`: give the pigeon its own ledge **on top of the board frame**:
     - `g.y = L.board.y - L.frame + 2` instead of `L.groundY`, in all three places, and in `setViewport` line ~455.
     - Walk range: `lo = L.board.x + 70`, `hi = min(L.board.x + L.board.w - 70, hudKeepLeft - 70)`.
     - Spawn at `L.board.x + L.board.w + cfg.pigeonW` and walk left.
     - `pigeonW` 120 → 96 so its head (≈ 84 px) stays below the bubble in portrait. Bubble bottom 347 vs frame top 422 on iPhone portrait.
  2. `pigeonHit` then never meets a tray piece. Drop the `_pieceAt` veto.
  3. Fallback if you want the pavement: move `this._pigeon(w.pigeon, a)` in `render.js:235` *before* the tray shelves are drawn. Then it walks behind the ledge and never covers a piece.

### P1-2 · Shadows are see-through, so the scenery inside them breaks the silhouette (trees, windows, chalkboard)
- **Screenshots:**
  - `tests/out/visual/crop-ip-l-park.png`: winter park. The cat shadow is cut in half by a brown trunk, and the lion shadow is crossed by a tree.
  - `tests/out/visual/pad-l-season1-animals.png`: summer park. Every shadow is a green-tinted two-tone blob.
  - `tests/out/visual/ip-p-en-age7-initial.png`: the top-left shadow is half pink (blossom crown).
  - `tests/out/visual/ip-l-en-04-play.png`: the street hat shadow sits on the blossom tree.
  - `tests/out/visual/pad-p-season3-size.png`: the big umbrella shadow shows the window and a tree through it.
  - `tests/out/visual/ip-l-en-age7-oddeven.png`: the "19" shadow sits on the chalkboard edge and the "9" on the window.
- **What:** The hole fill is only `rgba(40,36,60,0.30)`. On the park, street, size and letters boards, `placeSlots` drops slots onto trees, windows and boards. The drawn scenery stays fully legible through the shadow, so a 4-year-old sees "a tree with a grey smudge", not "a cat-shaped hole". This is the core read of the game, and it happens on every season and both orientations. It is worst on the summer and winter park scenes.
- **Fix (do both):**
  1. `game/js/puzzle_art.js` `holeLayers` (line 938): before the existing tint, add a neutral underlay that flattens the scenery inside the silhouette:
     `h.drawImage(o.tint(A0, 'rgba(236,231,224,0.78)'), 0, 0);`
     Then raise the main tint `0.30 → 0.36`. The vector fallback in `drawShadow` needs the same change (`silPaint` with `rgba(236,231,224,0.78)` first, then `0.36`).
  2. `game/js/world.js` `placeSlots`: add a scene keep-out penalty.
     - Export `PZ.PuzzleArt.sceneBusy(scene, w, h)` → normalised rects of trunks, crowns, windows and the chalkboard. The scene geometry already exists in `drawBoard`.
     - Add `-0.5 × overlapArea/slotArea` per rect to the farthest-point score, so slots prefer open sky, grass and road.

### P1-3 · Letter and number shadows swell into blobs (ages 5–7: letters, lower, add, sub, oddeven)
- **Screenshots:**
  - `tests/out/visual/glyph-shadows.png`: top row = shadows, bottom row = pieces. **e, G, 9, a and 6 are unreadable. B, 8 and 0 are fat.**
  - `tests/out/visual/crop-ip-p-letters-board.png`: the "G" shadow is a disc with a "c".
  - `tests/out/visual/ip-p-vi-age6-lower.png`: the "e" shadow is a disc with a dash.
  - `tests/out/visual/ip-l-en-age7-oddeven.png`: the "9" and "19" shadows.
- **What:** The glyph silhouette mask is the piece's full footprint: the outer stroke `GLW = LW×1.3` plus the `GD = 4` extrusion steps. That closes small counters and apertures. The shadow is the only cue for *which letter goes where*, and at ages 6–7 the child matches letter shapes.
- **Fix (`game/js/puzzle_art.js`):** For `kind === 'glyph'`, build the silhouette (`layers()` / `vecSil`, spec at line ~821) from the **front face only**: `fillText` plus `strokeText` with `lineWidth = 0.35 × GLW`, no extrusion copies, and `grow = 0.35 × GLW` for the geom box. Keep the full outline for the piece itself. Check by re-running the contact sheet: every counter in e, a, 6, 9 and G must show as a light hole.

---

## P2: should fix

### P2-1 · The done gallery is tiny on phones (known; measured)
- **Screenshots:** `tests/out/visual/ip-l-en-16-done.png` (cards ≈ 72×48 css, 3 cols × 6 rows); `tests/out/visual/ip-p-vi-16-done.png` (cards ≈ 54×36 css, 4×4); `tests/out/visual/pad-l-vi-16-done.png` (≈ 140×95 css, fine).
- **What:** 16 pictures squeezed into the space left of or below the panel. On a phone, a 4-year-old can't recognise their own pictures.
- **Fix (`game/js/render.js`):**
  - `setGallery`: `.slice(-16)` → `.slice(-8)`. Show the last 8; the round count is already in the stars.
  - `_doneScene`: `gap = 26` → `14`.
  - Portrait: `y1 = gy - 24` and `x0 = pomBox.x + pomBox.w + 12` for the rows that sit beside Pom (or simply let Pom stand in front: `y1 = gy - 24`).
  - Result: ≈ 216 logical (118 css) cards on iPhone landscape and ≈ 157 logical (86 css) on iPhone portrait.

### P2-2 · The HUD round-dots pill shows the clock tower through it (known; all landscape viewports)
- **Screenshots:** `tests/out/visual/ip-l-en-04-play.png` and `tests/out/visual/pad-l-en-04-play.png`. The clock face shows between dot 2 and dot 3 and reads as a 5th, half-done dot.
- **Fix (`game/css/style.css` line ~122):**
  - `.hud-dots { background: rgba(255,255,255,.6) }` → `background: #FFFDF8; box-shadow: 0 3px 0 rgba(0,0,0,.12);`, which matches `.hud-stars`.
  - Make `.hud-stars` and `#hud .icon-btn` `rgba(255,255,255,.85)` → `#FFFDF8` too, so all three are consistent.
  - Optional, `render.js` far layer: shift the clock tower `x` so it is not under `layout.hud` in landscape (add `x -= 260` when `hud` overlaps it).

### P2-3 · Talk time panel slides under the HUD on landscape phones
- **Screenshot:** `tests/out/visual/ip-l-en-14-talk.png`. The panel top is at 56 css, the HUD reaches 66 css, and the pause button overlaps the panel's top-right corner by ~10 css.
- **Fix (`game/css/style.css`, inside `@media (max-height: 430px)`):** add
  `#scrTalk { padding-top: calc(var(--sa-t) + 72px); padding-bottom: calc(var(--sa-b) + 6px); }`.
  The 261 css panel still fits in 393 − 72 − 6 = 315 css.

### P2-4 · Tray pieces touch or overrun the shelf's side frames
- **Screenshots:**
  - `tests/out/visual/crop-ip-p-letters-tray.png`: "N" overlaps the left frame, and "I" touches the right.
  - `tests/out/visual/ip-p-en-age7-initial.png`: the cow is over the left frame, the pig over the right.
  - `tests/out/visual/pad-l-season3-colors.png`: the kite is on the left frame, the house on the right.
  - `tests/out/visual/pad-p-vi-07-wrong.png`: the car is on the right frame.
- **What:** `traySpots` uses `lo = r.x0 + ms/2`, `hi = r.x1 - ms/2`. That leaves zero margin, and the rest tilt (`restRot 0.14`) and wide pieces push past it.
- **Fix (`game/js/world.js` `traySpots`, line ~187):** `lo = r.x0 + ms/2 + 22`, `hi = r.x1 - ms/2 - 22`. Add the same 22 px to `rowCap`, so the caps stay honest.

### P2-5 · An empty second shelf when the round has few pieces
- **Screenshots:** `tests/out/visual/ip-p-vi-age3-size.png` (2 pieces on the top shelf, bottom shelf empty), `tests/out/visual/pad-p-vi-07-wrong.png` (3 on top, bottom empty) and `tests/out/visual/pad-p-season2-shapes.png`.
- **What:** The rows are built for `maxPieces[age]`, and spots fill the top row first. An empty wooden shelf in the middle of the screen looks broken, and it puts pieces farther from the child's thumb.
- **Fix (`game/js/world.js` `traySpots`):** fill rows from the **bottom** (the row nearest the pavement) when `n ≤` the bottom row cap. In `render.js`, draw only the shelves that hold at least one spot this round: pass `row.used` from `_layoutPieces`.

### P2-6 · Piece touch targets on iPhone are under 100 css for ages 5–7 and for the "small" size piece
- **Data:** `geometry-ip-p.json` and `geometry-ip-l.json`.

  | iPhone, age | item (logical) | hit Ø (css) | drawn (css) |
  |---|---|---|---|
  | 3–4 | 134 | 103 | 73 |
  | 5 (portrait) | 125 | 97 | 68 |
  | 5 (landscape) | **104** | **83** | **57** |
  | 6–7 | 115 | 91 | 63 |
  | size topic, small piece | – | 78 | 53 |

  iPad is 142–185 css everywhere (fine).
- **What:** Landscape age 5 does not get the big item: `layoutTier` falls back because `fits` fails on the 4-slot board. The 0.72× "small" piece is also tiny on phones.
- **Fix (`game/js/world.js` CONFIG):**
  - `hitPad: 14 → 26`. That gives hit ≥ 100 css for items ≥ 112 logical, and the tray spacing (1.3 × item) already allows it.
  - `item: { 5: 104 → 112, 6: 96 → 104, 7: 96 → 104 }`.
  - `sizeK.small: 0.72 → 0.8`.
  - Phone landscape: in `layoutTier`, try `boardAspectPhone 2.2 → 2.5` before falling back, so age 5 keeps 125.

### P2-7 · The Shapes board has faint shape outlines on the wall that look like extra holes
- **Screenshots:** `tests/out/visual/pad-p-en-age3-shapes.png` (a faint square right next to the real square shadow), `tests/out/visual/pad-p-season2-shapes.png`.
- **What:** The decor circle, star, heart, triangle and square outlines in the `shapes` scene are decoys for a 3-year-old asked "where is the square?".
- **Fix (`game/js/puzzle_art.js` drawBoard `shapes` scene):** remove the five decor outlines, or replace them with non-shape decor (posters with a sun or flower). Never use geometric outlines of the answer set.

### P2-8 · The near-miss glow is too faint on phones in landscape
- **Screenshot:** `tests/out/visual/ip-l-en-06-nearmiss.png`. The gold rim around the umbrella shadow is ≈ 2.5 css wide and barely visible. Portrait (`tests/out/visual/ip-p-en-06-nearmiss.png`) is OK.
- **Fix (`game/js/puzzle_art.js` `holeLayers` gold):**
  - Halo `dil(A0, 10*sc)` → `dil(A0, 16*sc)` and alpha `0.38 → 0.5`.
  - Rim `dil(A0, 4.5*sc)` → `dil(A0, 7*sc)`.
  - `world.js` CONFIG `nearGlow 1.6 → 2.2` s.

### P2-9 · Soap bubbles are almost invisible on the pale board
- **Screenshot:** `tests/out/visual/ip-p-en-10-bubbles.png`. Thin iridescent rims over the cream street; the 4-year-old will not see the surprise they are meant to tap.
- **Fix (`game/js/puzzle_art.js` bubble draw):**
  - Fill `rgba(255,255,255,0.28)`.
  - Rim `lineWidth 2 → 4` at `rgba(120,170,230,0.85)`.
  - Add a white highlight arc (r × 0.55, upper-left, width 5).

---

## P3: polish

- **P3-1 · The 2-line bubble touches the board frame on phone landscape.** `tests/out/visual/ip-l-vi-09-pigeon.png`. The DOM bubble grows to 132 logical while the layout assumes `bubbleHLand 122`. The bubble bottom is at 150 and the frame top at 148. **Fix:** `world.js` CONFIG `bubbleHLand: 122 → 134`.
- **P3-2 · Tray pieces dip into the home-indicator inset on phone landscape.** Piece bottom 686 > `H − ins.bottom` = 681.5 (`geometry-ip-l.json`, `ip-l-en-play`). **Fix:** `world.js` landscape `rows.push({ ..., y: Math.min(ty + zoneGap + maxSize, groundY - 8) })`, i.e. `groundY → groundY - 8`.
- **P3-3 · Settings chips are 40 css tall on landscape phones** (`tests/out/visual/ip-l-vi-02-settings.png`), below the 44 pt iOS minimum. This is parent-only. **Fix:** in `style.css` `@media (orientation: landscape) and (max-height: 430px)`, `.set-row .chip, .chips .chip { min-height: 44px; }` and `.toggle { min-height: 44px; }`.
- **P3-4 · The iPad HUD looks small** (`tests/out/visual/pad-l-en-04-play.png`): stars pill ≈ 80×46 css on a 1180 px screen. **Fix:** in `@media (min-width: 768px) and (min-height: 700px)`, use `.hud-stars { font-size: 32px } .hud-stars img { width: 46px; height: 46px } .icon-btn { width: 68px; height: 68px } .hud-dots i { width: 16px; height: 16px }`.
- **P3-5 · The board is small on phone landscape:** 553×252 logical (302×138 css), with 556 px of the 1109 px band unused (`tests/out/visual/ip-l-en-04-play.png`). **Fix:** `world.js` CONFIG `trayBelow: 96 → 76` for `phone` layouts. That gives +20 px board height and +44 px width at 2.2:1, so slots get ≈ 8 % bigger.
- **P3-6 · Dot cards with 9–10 dots** (`tests/out/visual/ip-p-season3-count.png`) have dots ≈ 13 css on iPhone. That is hard to count for age 5. **Fix:** in `puzzle_art.js` dots layout, use 2 rows max with dot r ≥ 0.12 × size, or cap `n ≤ 6` for age 5 in `content.js` count pools.
- **P3-7 · Yellow and orange pieces on the cream tray** have a luminance contrast of ≈ 1.2:1. They stay readable only thanks to the dark outline (`tests/out/visual/pad-l-season3-colors.png`). **Fix (optional):** tray inner fill `#EFE3CC` → `#E8D6B8` (a touch darker) so yellow #FFD23F stands off the shelf.

## Notes for the team
- I captured the "wrong" screens 160 ms after the drop, but the piece is still lagging behind the finger (spring follow). In landscape the shake happens near the tray (`tests/out/visual/ip-l-en-07-wrong.png`). This is a test-timing artefact, not a game bug.
- Re-run a subset with: `DEV=ip-l LANGS=vi PART=screens node tests/visual/screens.js`. The run prints the probe issues to `tests/out/visual/issues-<dev>.txt`.

## Fixes applied (2026-11-09, fixer)
Re-checked with `DEV=ip-l LANGS=en PART=screens,seasons`, `DEV=ip-p LANGS=en PART=screens,seasons`, `DEV=pad-l LANGS=vi
PART=screens`, `DEV=pad-p LANGS=en PART=screens,topics` and the glyph contact sheet `tests/out/visual/glyph-shadows-after.png`
(screenshots looked at: `ip-l-en-09-pigeon`, `ip-p-en-09-pigeon`, `pad-l-vi-09-pigeon`, `pad-l-vi-10-bubbles`, `ip-l-en-14-talk`,
`ip-l-en-16-done`, plus iPhone play shots). Note: the `issues-<dev>.txt` files still hold entries of the language / part that was
not re-run (geometry is merged); only the re-run keys count.

### P1
- **P1-1 pigeon — fixed.** It now lives on a **ledge on top of the board frame** (`world.js _perch`): feet at `board.y − frame + 2`,
  `pigeonEdge` 70 px in from the frame's ends, cut back from every keep-out box that reaches into its 84 px head band (speech bubble,
  HUD, measured boxes). It glides in (0.7 s flapping arc) onto the right end, waddles to the ledge spot farthest from the open
  shadows, pecks, walks back and flies off (at once when the picture is done). `pigeonW` 120 → **96**. When the ledge has < 100 px
  left (bubble / HUD reach down to the frame: iPad 4:3 landscape, notched iPhone portrait) it walks **on top of the speech bubble**
  (left of the HUD) and, if that is too short too, it **lands on Pom's head** and pecks there, riding his hops. It never stands over
  the tray in any layout, so the `_pieceAt` veto in `pigeonHit` was dropped. Contact shadow only on the ledge. Unit test rewritten
  (5 viewports: on its ledge, above the tray, not under the HUD, tappable, flies off). The probe's "pigeon overlaps Pom" on
  `ip-p-en-pigeon` is this intentional Pom's-head fallback, not a bug.
- **P1-2 shadows — fixed (both parts).** `puzzle_art.js holeLayers`: a warm underlay `rgba(236,231,224,0.78)` is painted first,
  then the tint `0.30 → 0.36` (same in the vector fallback), so trees / windows no longer cut the silhouette. Scene keep-out:
  `PuzzleArt.sceneBusy(scene, w, h, {flip})` returns the tree crowns + trunks, tent, Ferris wheel, chalkboard and windows from the
  scene painters; `World.placeSlots(…, busy)` keeps every pair ≥ 1.25 item apart first and then picks the least busy set (penalty
  overlap / slot area × `busyK` 1.2 × item).
- **P1-3 glyph shadows — fixed.** Shadows of letters / numbers are built from the **front face only** (`fillText` + `strokeText`
  0.35 × GLW, no extrusion copies; separate `layers(…, face)` cache, dashed rim from the face too); the piece keeps its full outline.
  On the new contact sheet every counter (e, a, 6, 9, 8, B, 0, A, R) is an open light hole and G reads as G.

### P2
- **P2-1 gallery — fixed:** last 8 pictures, `gap` 14; portrait picks the bigger of "above Pom, full width" and "right of Pom, down
  to the ground". iPhone landscape cards ≈ 233 logical (≈ 127 css) instead of 72 css.
- **P2-2 HUD dots — fixed:** `.hud-dots` solid `#FFFDF8` + drop shadow; `.hud-stars` and the HUD icon buttons solid too. (Clock
  tower not moved; the pill is opaque now.)
- **P2-3 Talk under the HUD — fixed:** `@media (max-height: 430px) #scrTalk { padding-top: sa-t + 72px; padding-bottom: sa-b + 6px }`
  (`ip-l-en-14-talk.png`: panel starts below the pause button).
- **P2-4 tray pieces inside the shelf — fixed:** `traySpots` moves the row ends in by up to `trayMargin` 22 px as far as the
  1.3 × spacing allows (a hard 22 px would have broken the 5-piece tray on iPad 4:3), and each shelf is drawn 14 px wider than its
  row on both sides (was 8).
- **P2-5 empty shelf — fixed:** rows fill **from the bottom** (`traySpots`), extra pieces go to the lower rows; render draws a shelf
  only while one of this round's pieces rests on it / drops to it / glides home to it, fading out (0.25 s) when its last piece is in
  the picture and back in with the next round.
- **P2-6 touch targets — fixed:** `hitPad` 14 → **26**, `item` 5 / 6 / 7 → **112 / 104 / 104** (a last-resort `itemMin` 104 / 96 / 96
  tier keeps iPad 4:3 ages 5+ fitting 5 pieces), `sizeK.small` 0.72 → **0.8**, `boardAspectPhone` 2.2 → **2.5**; the fits check
  now tries slot seeds 1–6 and `placeSlots` falls back to regular arrangements on a tight board. iPhone landscape age 3–4 hit
  116 css, ages 5–7 ≥ 100 css; the size topic's small piece 99 css (was 78). Hit circles of neighbours may overlap now (nearest
  centre wins — unit test adapted).
- **P2-7 shapes wall — fixed:** the five embossed shape outlines are removed (plain stone wall).
- **P2-8 near-miss glow — fixed:** halo `dil 10 → 16`, alpha `0.38 → 0.5`, rim `4.5 → 7`, `nearGlow` 1.6 → 2.2 s.
- **P2-9 soap bubbles — fixed:** milky fill (`0.28` centre), a 4 px `rgba(120,170,230,0.85)` rim and a 5 px white glint arc
  (`pad-l-vi-10-bubbles.png`: clearly visible).

### P3
- P3-1 `bubbleHLand` 122 → **134** — done.
- P3-2 tray above the home indicator — done differently: the landscape ledge is ≤ `groundY − 8` and `tray.y` moves up when needed so
  the 44 px gap to the drop zones always holds (the probe's "outside safe area" used a square piece box; `screens.js` now uses the
  piece's real box and `L.W`).
- P3-3 settings chips / toggles 44 px on landscape phones — done.
- P3-4 iPad HUD (stars 32 px / 46 px icon, HUD buttons 68 px, dots 16 px) — done.
- P3-5 bigger phone-landscape board — done as `trayBelowPhone` 76 (+ aspect 2.5); for ages ≤ 4 the "ledge above the home
  indicator" rule takes most of the 20 px back, ages 5+ gain it.
- Bigger round dots everywhere (12 → 14 px) — done.
- P3-7 tray felt `#E4CFAE → #EEDFC6` (was `#EBD9BE → #F5E9D6`) — done.
- **Not done:** P3-6 (9–10 dot cards for age 5) — content / art change with its own tests; left for the next round.
