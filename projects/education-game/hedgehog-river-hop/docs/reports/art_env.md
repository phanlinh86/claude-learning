# Environment art — woodland brook (environment artist)

## Files
| File | What |
|---|---|
| `tools/art_env.js` | Generator (`node tools/art_env.js`). Writes every env SVG + particles, deletes old env files (cushion_*, ground_* are gone). Checks: no `<text>`/script/font/href, ≤ 1 blur, width/height = viewBox. |
| `game/assets/default/env/far_<m>.svg` (1200×720) | Two rows of distant wooded hills + a small water-mill cottage (x ≈ 780). Tileable, bottom-anchored, `<!-- sky #top #bottom -->` comment. |
| `env/mid_<m>.svg` (1200×300) | Tree line (round trees + pines, hazier back row) on a meadow band (rows 244–300) in the **exact bank-grass colour**. Tileable. Row 262 = bank top. |
| `env/bush_<m>` 200×140 (100,136) · `reeds_<m>` 120×160 (60,156) · `rock` 120×80 (60,76) · `flowers_<m>` 140×70 (70,68; winter = snow tufts) · `tree_<m>` 260×360 (130,354) | Bank sprites, bottom-centre anchors. Tree: blossom / green / amber / bare + snow. |
| `env/sun`, `cloud_a`, `cloud_b`, `moon` | Kept (moon unused). |
| `particles/*` | All 16 old particles kept + **`dragonfly.svg`** (48×32, teal-lilac wings, faces right). |
| `game/js/river_art.js` | `NH.RiverArt` (canvas, node-safe, cached). |
| `tools/env_scenes.js` | `RECIPE` + previews `docs/art/env_scene_<m>_<W>x<H>.png` (1556×720, 960×720, 720×1556), `docs/art/env_seams.png`, a placement check and a contrast table. |

## NH.RiverArt API (DESIGN §4.4 + extras)
- `drawRiver(ctx, layout, t, season, opt{quality, wind, alpha})`: teal-slate gradient across the stream (shallow at the banks, deep in the middle), light streaks that flow along `flowDir` at 40 px/s (slower near the banks), sparkles (more in summer), wet shadow under the banks, winter ice rims. In landscape the water starts at `play.y0 − 30`, narrows slightly near the top, and is darker at its source.
- `drawBanks(ctx, layout, season, opt{alpha, decor, tree, dpr})`: grass with a wavy edge (≈ 9 px inside the bank rect, ±9 px), an earth lip that reaches into the water (landscape 10–17 px; portrait far 22, near 8), a waterline, foam, pebbles, patches/tufts, and season bits (petals, clover, rust leaves). It then draws the seeded decorations and the far-bank tree. In landscape a grassy lip crosses the brook's source with 2–3 bushes on it.
- `drawTree(ctx, layout, season, opt)`: the tree alone, if you want to draw it in a later pass (then call `drawBanks` with `tree:false`).
- `flowDir(layout)` returns `{0,1}` for landscape and `{1,0}` for portrait (the same object every call).
- `across(layout, a)` returns `[lo, hi]`, the water's extent across the stream (reused array). Leaves and petals floating on the water use it.
- `treeRect(layout)`, `decorRects(layout)`, `SPRITES` (asset keys), `_reset()`.
- `season` can be a name or 0..3. Geometry is cached per layout. Path2D shapes, gradients, texture and placement are cached per layout and season. A frame only strokes about 18–90 streaks and fills about 12–60 sparkles. Images come from `NH.Assets.sprite(key, px)` when it exists, otherwise from `img(key)`; if the result is null the sprite is skipped.
- Placement rules: no decoration within nimHome ±110 (from Nim's height + 24 above to 110 below) or within goal ±120 (+ 90 px in the roll direction). None touches HUD/bubble + 12, or comes within 6 px of the water rect. Decorations do not overlap each other. The preview check found no overlaps with stones, Nim, goal, HUD or bubble at any size or season.

## Asset keys `assets.js` must load
`env/far_<m>`, `env/mid_<m>`, `env/bush_<m>`, `env/reeds_<m>`, `env/flowers_<m>`, `env/tree_<m>` (m = spring|summer|autumn|winter), `env/rock`, `env/sun`, `env/cloud_a`, `env/cloud_b` (`env/moon` optional), and `particles/dragonfly` (add `'dragonfly'` to `PARTICLES`). **Remove** `env/ground_<m>` and `env/cushion_<m>`, because those files no longer exist.

## RECIPE (tools/env_scenes.js, same shape as the bubble game's)
- `envLayout(W, H, ins, layout)` → `{W, H, portrait, tall, kp, bankTop, far, mid, sky, sun, clouds}`. **Pass `world.layout`** (it needs play.y0, far, bubble, hud). `bankTop` = landscape `play.y0 − 40`, portrait `far.y − 6`. Mid row 262 sits on `bankTop`, and far row 700 sits on mid row 248.
- Scale: `K = {far: 0.6, mid: 0.62}` × `kp` (1 landscape, 1.15 portrait, **1.36 tall portrait**, H/W > 1.6).
- `SKY` (DESIGN exact) runs from 0 to `bankTop`. `SUN` per orientation/season is placed in the free sky gap between the bubble and the HUD. `CLOUDS {n, alpha, tint}`. `PARTICLES` (summer front includes `dragonfly`). `TILES`, `ROWS`, `HAZE`, `BANK`.
- `drawEnv(g, L, m, img, opt)` draws the 'back' part: sky, sun, clouds, far, mid. `'front'` is now a no-op, because the banks come from RiverArt. `tileXs` is unchanged. Render: drawEnv back → back particles → `RiverArt.drawRiver` → ripples → `RiverArt.drawBanks` → fruit → stones …

## Deviations / notes for the integrator
- In landscape the tree line covers most of the 122 px sky band, so the sun is only a glow peeking between the trees. This is intended, since the band sits behind the speech bubble and HUD anyway.
- The mid tile's meadow band is the bank-grass colour. Do **not** tint the mid layer by mood, or a seam will show against the canvas banks.
- **World layout risk:** in portrait the far bank is 220 px tall and `goal.y = far.y + 0.38·far.h`. A 180–210 px Nim standing at the goal reaches about 100 px into the speech-bubble band. In narrow landscape (960 wide, 4 rows) the evenly spaced rows put stones within about 10 px of the bank lip. Stones are drawn over the lip, so it looks fine, but the mechanics engineer may want a margin of 0.55·S from the bank edges.
- Answer colours on teal water: WCAG 1.4–2.0 against the water around the stones (the stones and outlines separate them), with RGB distance of 66 (green) up to 190. Water is never saturated blue: answer blue is 82 RGB away.
