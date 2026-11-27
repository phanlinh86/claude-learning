# Environment art — report (environment artist)

Files: `tools/art_env.js` (SVG generator), `tools/env_scenes.js` (RECIPE + Playwright scenes), `game/js/table_art.js`
(`BD.TableArt`), `game/assets/default/env/*`, `particles/crumb.svg`, `particles/heart.svg`, previews `docs/art/env_*.png`.
`game/js/river_art.js` was deleted. Regenerate with `node tools/art_env.js && node tools/env_scenes.js`.

References studied for mood only: cosy bakery interiors (shelves, jars, arched windows), gingham café cloths, gingerbread-village
boards, piped royal-icing bead borders. All shapes are our own, and nothing copies a brand or a known map.

## Assets
| file | viewBox | anchor / notes |
|---|---|---|
| `env/wall_<m>.svg` | 1600×400 | Arched two-over-two window centred at x 800 (glass x 630–970, arch centre y 216, r 170, bottom 316). Cream frame, tied-back caramel-gingham curtains on a brass rod, sill y 312 (bird perch), a shelf (jars, loaves, plates, basket, crock, a seasonal touch: tulips / lemons / pumpkins / candle and garland), hanging copper pans, subway-tile backsplash, table rim from y 372. Strips x 0–400 and 1200–1600 each repeat with a period of 400. `<!-- sky top bottom -->` comment. |
| `env/bakery.svg` | 260×240 | door step (130, 236); oven window (192, 170) r 21 glowing `#FFC977`; chimney top (196, 28); striped awning, cookie-tile roof, bread sign. |
| `env/flour.svg` 120×60 (60,56) · `rollingpin.svg` 200×60 (100,54) · `jar.svg` 90×110 (45,106) · `plant_<m>.svg` 120×140 (60,136) | | Bottom-centre anchors. Plants: tulips / muted sunflower / sage-rosemary / pine sprig. |
| `particles/crumb.svg`, `particles/heart.svg` | 32×32 | biscuit crumb; soft pink heart with a halo. The other particles are unchanged. |

## API (`BD.TableArt`) — as DESIGN §4.4, plus a few helpers
```
drawTable(ctx, layout, season, opt)   opt = { keep:[{x0,y0,x1,y1}], seed, roads?, alpha, dpr }
drawRoads(ctx, roads, layout, opt)    opt = { reveal, glowEdges, glow, t, trail, trailT, snow, quality, alpha, dpr }
drawWall(ctx, layout, season, t, opt) opt = { alpha, quality, dpr }
drawBakery(ctx, layout, t, opt)       opt = { puff 0..1 (default 0.35), ding 0..1 (extra oven flash), alpha }
drawSkid(ctx, x, y, r, a)
wallLayout(layout) · bumps(roads, layout) → [{edge, s, x, y}] · bakeryPoints(layout) → {door, oven, chimney, box, k}
decorRects() · RECIPE · SPRITES · BAKERY · _reset()
```
Deviations and additions:
- `drawRoads` takes `opt.t` (seconds) so the hint dots can march.
- `drawTable` takes `opt.roads` (optional), so decorations keep ≥ roadW/2 + 22 px away from the real roads. It always avoids
  `layout.bakery`, `bubble`, `hud` and a box around `start`.
- **Sugar bumps**: `bumps()` gives the exact spots. On each edge they sit at s = 70 + 140·k, skip the first plazaR + 30
  after a fork (90 after the root), and stop 70 px before the end. **World should use `BD.TableArt.bumps` for its `bump`
  kicks**, so the bounce matches the art.
- Rects `wall / table / bakery / bubble / hud` are `{x, y, w, h}` (top-left). The bakery is drawn fit inside
  `layout.bakery`, with its door step at the box's bottom-centre.
- `dpr` defaults to the ctx transform scale, capped at 2 (an explicit `opt.dpr` may be up to 3).

## RECIPE (`tools/env_scenes.js`; table_art.js holds the identical literal, which the tool checks; `node tools/env_scenes.js sync`)
- k = wall.h / 400. The SVG is never scaled up to cover, and never cropped vertically.
- Window centre: in landscape it is the middle of the gap between the bubble and the HUD (when the gap ≥ 300·k), else W/2.
  In portrait it is W/2. It is clamped on screen.
- The left strip repeats leftwards and the right strip rightwards, with the period rounded to an integer device px (no seams).

| shape | wall h | k | window cx | glass (x, y) | sill y |
|---|---|---|---|---|---|
| 1556×720 | 216 | 0.54 | 990 | 898–1082 × 25–171 | 168 |
| 960×720 | 216 | 0.54 | 692 | 600–784 × 25–171 | 168 |
| 720×1556 | 311 | 0.7775 | 360 | 228–492 × 36–246 | 243 |
| 720×960 | 192 | 0.48 | 360 | 278–442 × 22–152 | 150 |

- SUN (SVG units): spring (700,118) r 22, summer (892,104) r 28, autumn (742,214) r 30, winter (868,132) r 20.
  `wallLayout().sun[m]` gives screen px.
- SKY: spring #BFDDF2→#E9F2F4, summer #8CCBEA→#D3ECF3, autumn #F1C893→#F8E3C4, winter #B9C8E2→#E4EAF3.
- ANIM (live view through the glass):
  - spring: 1 cloud and a swaying blossom branch
  - summer: 2 clouds
  - autumn: 1 cloud and a swaying amber branch
  - winter: 1 cloud and 28 snowflakes
- Portrait note: the full-width speech bubble (y 110–234) covers most of the window. The arch top (sky, snow, sun) shows
  above it, and the sill shows below it on tall phones. This is by design (DESIGN §2 puts the bubble over the wall).

## Caches and performance
- **Table**: one bitmap of `layout.table` × dpr. The LRU holds 4 entries, keyed by W, H, season, seed, roads.key, roadW,
  the keep rects, the bakery position and dpr. If the args are the same objects as last call, no key string is built.
- **Roads**: one bitmap of the road bounding box (+ margin) × dpr, keyed by roads.key, W, H, roadW and dpr. The snow
  overlay is a second bitmap of the same box, built the first time `snow > 0`.
  - `reveal < 1`: the cached bitmap is drawn through a clip of circles every 8 px along the revealed path, plus a glossy
    pour front. This runs only during the 1 s build phase.
  - Glow and trail are strokes of the cached Path2D per edge. The dash array is reused, so nothing is allocated per frame.
- **Wall**: up to 2 entries (for the crossfade), keyed by W, wall.h, season, window x, wall y and dpr. Each entry holds the
  full wall bitmap and a window-frame overlay with the glass cut out and reflections baked in.
  - A frame costs: 1 wall blit, a clip, ≤ 2 cloud blits or ≤ 28 snow arcs in one fill, 1 branch blit, and 1 overlay blit.
- **Bakery and skid**: soft sprites (shadow, oven glow, steam, dust) are cached once. A frame is ≤ 6 drawImage calls.
- Measured in headless Chromium:
  - First draw, which builds all caches: 20–60 ms. This happens once per map, rotation or season.
  - One cached frame of wall + table + roads (with hint glow) + bakery: about 2–4 ms. That number includes a forced GPU
    readback, so it is an upper bound.
- Memory at dpr 2:
  - 1556×720 table: about 12 MB
  - roads: up to about 8 MB
  - wall: about 5 MB plus a 1 MB overlay

## Checks (`node tools/env_scenes.js`)
- No decoration overlaps a house, the bakery, the HUD, the bubble or a road (16 scenes).
- WCAG contrast of the road body #8C5E3F against the cloth: 3.8–4.7. Its outline #5A3826 against the base cloth: 8.8.
- Answer colours against the cloth: yellow #FFD23F is only 1.0–1.2 against the cream (its dark #C99A12 reaches 1.8–2.2).
  House art should always outline yellow roofs and doors with the dark tone, which the house spec already does.

## For the integrator (not done here — these files belong to others)
- `index.html` still loads `js/river_art.js`. Replace it with `js/table_art.js` in the DESIGN §5 script order.
- `render.js` and `weather.js` still call `BD.RiverArt`.
- `assets.js` must register the keys in `BD.TableArt.SPRITES` plus `particles/crumb` and `particles/heart`.
- Season crossfade: call `drawWall` and `drawTable` for the old season, then for the new one with `opt.alpha`.
