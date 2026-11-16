# Visual QA — Moka's Fairy Tea Party (2026-11-16)

Script: `tests/qa/visual_capture.js` (Playwright, isMobile + hasTouch, DPR 1, notch insets emulated by overriding the CSS
`--sa-t/r/b/l` variables that `#safeProbe` → `main.js readInsets()` reads, plus a drawn Dynamic Island / home bar).
Output: `tests/out/visual/` — 343 PNGs + `layout.json` (world layout per device) + `contrast.json` (canvas-pixel colour check).

Covered: title, settings (+ scrolled), pause, chapter banner, fall, fairy circle, rise, lantern lit, chime, cheers, each mood
mid-round (sunny / breezy / rain / rainbow), rain hint hand, home badge, Talk time, session done — × iPhone 393×852 (insets
59/0/34/0), 852×393 (0/59/21/59), iPad 820×1180 and 1180×820 (24/0/20/0) × EN + VI; every topic of every age pool 3–7 at
round 3 (most things) × 4 devices EN + iPhone portrait / iPad landscape VI; berry plates forced to 9–12 at 5 things.
Script errors / page errors: 0.

Logical layouts measured (`layout.json`):

| device | W×H | ins t/b/l/r | item (3–4 things) | garland y / bottom | table.y | groundY | Moka x, y, h | legs |
|---|---|---|---|---|---|---|---|---|
| iPhone portrait | 720×1561 | 108/62/0/0 | 139 (5 things: **100**) | 419 / 563 | **1207** | 1473 | 110, 1467, 220 | **120**, 600 |
| iPhone landscape | 1561×720 | 0/38/108/108 | 124 | 198 / 342 | 518 | 668 | 228, 658, 250 | 408, 1323 |
| iPad portrait | 720×1036 | 21/18/0/0 | 124 | 305 / 449 | 726 | 992 | 110, 986, 220 | **120**, 600 |
| iPad landscape | 1036×720 | 21/18/0/0 | 124 | 219 / 363 | 538 | 688 | 120, 678, 250 | 300, 906 |

---

## P1 — fix before release

### P1-1 Portrait: the play area sits at the bottom, a ~500 px empty forest band above it, things small
Files: `game/js/world.js` `layoutTier()` (portrait branch) + `CONFIG`; `game/js/render.js` `envLayout()` callers.
iPhone portrait: garland bottom 563, things' tops at 1068, table 1207 → **505 logical px (276 CSS px, 32 % of the screen)
of empty forest** between the lanterns and the things; things are 139 px (76 CSS px), and **100 px (55 CSS px) at 5 things**
because the table (x0 50 → x1 670, slot inset 40 → span 540) is narrower than the screen allows. Cause: `ty = max(moka.y −
mh − tableAboveMoka, g.bottom + 260)` pins the table to Moka's head, Moka pinned to the ground.

Proposed portrait layout (landscape unchanged). In `layoutTier()` for `portrait`:
```js
// CONFIG additions
mokaHPortTall: 260, tablePortSideP: 30, slotInsetPort: 24, itemPortK: { tall: 1.3, std: 1.08 }, spPort: 1.2,
tableMokaGap: 24, riseRoomMin: 90, legDrop: 150, legU: [0.27, 0.12],

// Moka: bigger on tall phones, still front-left on the ground
var mh = portrait ? (tall ? cfg.mokaHPortTall : cfg.mokaHPort) : cfg.mokaHLand;           // 260 on iPhone
moka = { x: ins.left + 110, y: groundY - 6, h: mh, w: 0.7 * mh };
// table: full width, centred between the lanterns and Moka's head
x0 = ins.left + 30; x1 = W - ins.right - 30;                       // span = W − 60 − 2·24 = 612
var s0 = x0 + cfg.slotInsetPort, s1 = x1 - cfg.slotInsetPort, span = s1 - s0;
// item: as big as the span allows (one size per round; stable env anchor = cap below)
var cap = Math.round(cfg.item[a] * (tall ? 1.3 : 1.08));            // ages ≤4: 161 tall / 134 iPad; 5: 148/123; 6–7: 138/114
item = Math.max(cfg.itemMin, Math.min(cap, Math.floor(span / (Math.max(1, n - 1) * cfg.spPort))));
var mokaTop = moka.y - mh;
var tyMax = mokaTop - cfg.plankH - cfg.tableMokaGap;               // the plank never touches Moka's head
ty = Math.round(g.bottom + 0.5 * (mokaTop - g.bottom) + 0.5 * item);  // things centred in the free band
ty = Math.max(g.bottom + item + cfg.riseRoomMin, Math.min(tyMax, ty));
legs = [x0 + 0.27 * (x1 - x0), x1 - 0.12 * (x1 - x0)];             // left leg right of Moka (Moka spans x ≈ 19…201)
legBottom = Math.min(groundY, ty + cfg.plankH + cfg.legDrop);      // legs stand on the ground plane BEHIND Moka
```
Resulting numbers:

| | iPhone portrait now → new | iPad portrait now → new |
|---|---|---|
| item 3–4 things | 139 (76 CSS) → **161 (88 CSS)** | 124 (141 CSS) → **134** |
| item 5 things | 100 (55 CSS) → **127 (69 CSS)** | 100 → **127** |
| table.y | 1207 → **966** (things' centre at 57 % of H instead of 73 %) | 726 → **675** |
| gap lantern bottom → things top | 505 → **242** | 153 → **141** |
| plank bottom → Moka head | −6 (overlap) → **+195** (Moka 260 tall fills it) | −6 → **+45** |
| legs | 120 (under Moka) / 600 → **208 / 611**, bottom 1473 → **1162** | 120/600 → 208/611, bottom 871 |

Also: `slotsFor()` uses `L.spK` — set `spK = cfg.spPort` in portrait; `hitPad` unchanged (phone hit dia 184 still met);
`render.js envLayout(W, H, ins, tableY, item)` is anchored on "the age's base item × 1.12" (integration §2) — pass the
portrait `cap` instead so the horizon (`tableY − 0.92·item`) stays put between 3- and 5-thing rounds; the trunks' foot
(`horizonY + 16`) then lands ≈ 830 on iPhone, so the ground band (moss + clover) fills the Moka zone. `weather.setTable` /
splash line follow `applyTable()` automatically. The banner `cy` formula in `_banner()` already centres between
`garland.bottom` and `table.y − item` — fine with the new numbers. Re-run `tests/e2e/functional.js` (rotate tests) after.

### P1-2 Moka sits on the left table leg: the leg's toadstool cap reads as a hat, his head cuts the plank (portrait, title too)
`world.js layoutTier()`: portrait `legs[0] = x0 + legInset = 120` while `moka.x = 110` (Moka spans x 33…187), and
`ty = moka.y − mh − 40` puts the plank bottom (`ty + 46`) **6 px below** the top of Moka's head; Moka is drawn after the
table, so the dusty-rose cap with spots appears on top of his head (screens `iphone-p-*-04-mood-sunny`, `ipad-p-*-11-*`,
`*-p-*-00-title`). In rain the mushroom umbrella also covers the bottom of the leftmost thing (`iphone-p-*-11-mood-rain`,
`ipad-p-*-12-rain-hint`: the 3-berry plate's rim is under the umbrella). Fixed by P1-1 (legs at 0.27 span, `tableMokaGap`
24, legBottom). If P1-1 is not taken: minimum change = `tableAboveMoka: 40 → 70` and portrait `legs[0] = moka.x + 0.35·mh + 40`.

## P2 — should fix

1. **Lanterns + lit icon too small on phones** — `CONFIG.lanternH 70` → 38 CSS px on iPhone; the thing icon inside
   (`TeaArt.drawLantern` `drawIcon(ctx, thing, 34)` × 1.25) is ≈ 23 CSS px: the cup / plate / card in a lit lantern is hard
   to read (`iphone-p-*-08-lantern-lit`, `iphone-l-*-08`). Fix: when `layout.phone`, draw lanterns at s = 1.3
   (`render.js _garland` → `drawLantern(..., s)`), `lanternH 70 → 91`, `lanternDrop` unchanged; the garland `g.bottom`
   grows 21 px (already accounted in P1-1 via `g.bottom`).
2. **Card glyphs with 4 characters are small**: `1+16`, `10+5`, `10−9`, `13+4` at age 7 shrink to ≈ 12 CSS px glyph height on
   iPhone portrait (`iphone-p-en-t-age7-add`, `-sub`). `tea_art.js` card text fit: keep a minimum font of 0.30 × size and
   widen the tent card to 1.15 × size for `text.length ≥ 4` (P1-1's 127 px item makes this ≈ 17 CSS px).
3. **12 berries at 5 things**: plate 100 px → berries ≈ 7 CSS px, 3 rows packed edge to edge (`iphone-p-en-t-age7-plates12`).
   Countable but tight; P1-1 (127 px) brings them to ≈ 9 CSS px. Also in `berryLayout` for n ≥ 10 use 4 columns × 3 rows with
   ≥ 1.5 px gap (currently rows of 4/4/4 nearly touch at 100 px).
4. **Answer green on the sage clearing**: canvas-pixel check (`contrast.json`, body box behind each thing, things hidden):
   background mean `#B0BD90` (sunny/breezy/rainbow), `#849187` (rain). CIEDE2000 ΔE / WCAG luminance ratio vs mean:

   | colour | sunny | breezy | rain | rainbow |
   |---|---|---|---|---|
   | red #E84A4A | 46 / 1.91 | 46 / 1.90 | 37 / 1.17 | 47 / 1.95 |
   | blue #3C8DE8 | 49 / 1.71 | 47 / 1.71 | 25 / 1.05 | 46 / 1.74 |
   | yellow #FFD23F | 21 / 1.38 | 21 / 1.38 | 26 / 2.26 | 21 / 1.35 |
   | **green #4CC26B** | **14–17 / 1.12** | **14–16 / 1.13** | 14–21 / 1.43 | **14–16 / 1.15** |
   | orange #FF9A2E | 30 / 1.06 | 30 / 1.05 | 33 / 1.54 | 31 / 1.08 |
   | purple #8E44AD | 62 / 2.9 | 61 / 2.9 | 28 / 1.8 | 61 / 3.0 |
   | pink #FF8FC0 | 48 / 1.06 | 47 / 1.05 | 24 / 1.54 | 47 / 1.08 |

   Painted colours are exact in every mood (ΔE 0, rain darkness never tints the things — good). Green is the only colour
   with ΔE00 < 20 against the clearing; every colour except purple has luminance ratio ≈ 1.0–1.9, so the things read by hue
   + their dark outline. Fix (cheap): in `tea_art.js drawThing` give `obj` / `cookie` things a 3 px cream sticker rim
   `#FFF8EA` outside the dark outline (the guests already have one) — that gives every colour an edge with ≥ 3:1 against
   the moss; or darken the moss / ground behind the table band by 10 % L in `env/ground_*.svg`.
5. **Phone landscape things are small**: 124 px = 68 CSS px on 852×393 while the table runs 338…1393 with 3–4 things in the
   middle (`iphone-l-*-11-*`). Vertical room: lantern bottom 342, table 518 → things up to 150 fit with 26 px clearance.
   In `computeLayout` use `big = round(base × 1.15)` also when `layout.phone && !portrait` (→ 143, 78 CSS px).
6. **Size topic, 4 things, iPhone**: little ones at `littleK 0.62` of 139 → 47 CSS px tall raccoons
   (`iphone-p-en-t-age4-size`); the face is ≈ 20 CSS px. With P1-1 they become 54 CSS px — acceptable; otherwise
   `littleK 0.62 → 0.68` on phones.

## P3 — polish

1. **Session done: the 4 garland lanterns glow empty** — `render.js _doneScene()` calls `this._garland(L.garland, 1, …,
   [1,1,1,1])` with no things, so four lit bells with nothing inside hang on the vine (`ipad-l-vi-15-done`). Pass the last
   chapter's `w.garland.lanterns[i].thing / color` (or draw them unlit).
2. Done: gallery lanterns start at `T.y + 40` and drift over Moka's head / raised cup (`ipad-l-*-15-done`); start x range at
   `moka.x + 0.5·moka.w + 40` for the bottom 200 px, or draw Moka before the gallery.
3. Title portrait: the logo ("Fairy Tea / Tiệc Trà") overlaps the garland vine and the first lantern on iPhone / iPad
   portrait (`*-p-*-00-title`); drop the garland 40 px or skip lanterns under `#logo` (already done for lanterns — also skip
   the vine segment, or draw it at 0.5 alpha).
4. Title landscape: the ▶ button sits on the table plank between the things and the star pill overlaps the left leg area
   (`iphone-l-*-00-title`) — fine to read, but the pill text sits over the busy plank; give `.title-info` a solid cream
   background (`#FFF8EA`, alpha 0.95).
5. Settings VI landscape: "Giọng của Gấu Moka" wraps and "Moka" touches the chip's bottom edge (`iphone-l-vi-01-settings`);
   `.toggle` min-height 44 → 52 px or `font-size: 0.92em` for the VI chips.
6. Talk on iPad uses ≈ 45 % of the width; choices 70 CSS px (`ipad-*-14-talk`): allow `#scrTalk .panel` max-width 640 px,
   choices 110 px on `min-width: 768px`.
7. Rainbow chapter: the rainbow arc is almost hidden behind the garland + bubble on iPhone portrait (`iphone-p-*-11-mood-rainbow`);
   portrait `rainbow.topY = ins.top + 290` → `garland.bottom + 20` so it shows in the (new) free band.

## What looks good
Nothing interactive under the home indicator (Moka's feet at 801 CSS px vs bar at 818); HUD, bubble and garland never
overlap on any device (bubble pushed under the measured HUD on iPhone portrait: bubble 245…369, garland 419); every VI prompt
fits the bubble in ≤ 2 lines on phones, 3 on iPad landscape; guests (13) are recognisable at 55 CSS px incl. the sticker rim
in rain; home badge (ice / sea / desert / savanna) readable at ≈ 70 CSS px; hint hand clearly visible in rain; banner and
pause fit in VI; rain chapter readable (things not darkened, ΔE ≥ 14 everywhere).
