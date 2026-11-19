# Environment notes (bakery kitchen)

Generator: `node tools/art_env.js` · previews + seam test: `node tools/env_scenes.js` (writes `docs/art/env_*.png`).
The recipe and `envLayout()` / `tileXs()` (copy them into render.js word for word) are at the top of `tools/env_scenes.js`.

## Ambient per mood (`IB.Weather.ambient`)
| mood | `wall` (fill the whole screen first) | `floor` (fill below the ground tile) | `tint` (whole-screen wash after the ground) | `light` (alpha of `light.svg`) |
|---|---|---|---|---|
| spring | `#F6E9D2` | `#B98E66` | none | 0.45 |
| summer | `#F7EACF` | `#BC9068` | `rgba(255,236,190,0.06)` | 0.85 |
| autumn | `#F3E3C8` | `#B2875F` | `rgba(240,170,90,0.07)` | 0.50 |
| winter | `#EFE5D6` | `#AD8763` | `rgba(255,190,120,0.05)` | 0.28 |
The same values are exported as `AMBIENT` from `tools/art_env.js`. Crossfade them like the other ambient values.

## Draw order
wall fill → `far_<m>` tiles → `light.svg` per window (`L.lights`, alpha = `ambient.light`) → particles marked `outside`
(clip to `L.windows`: the glass rects on screen) → `mid_<m>` tiles → `ground_<m>` tiles → `floor` fill below `L.ground.fillY` → `tint` → tray, Mochi and the rest.

## Anchors
- `envLayout(W, H, groundY, {trayCx, freeTop})`. `trayCx` is the tray centre x. `freeTop` is the lowest UI edge above
  the free wall band: in landscape the bubble bottom (default 140), in portrait the choices-row bottom.
  It returns `counterY` (the counter's back edge, where the tray sits), `counterFront`, `far`, `mid`, `ground`, `windows[]` and `lights[]`.
- far 800×720: glass `<!-- window 250 90 300 310 -->`, the curtain rod at vb y 58, the backsplash from y 478.
- mid 1200×300: the props stand on vb y 296. The seasonal prop is at vb x 290 and 890: a tulip vase in spring, a lemonade jug in summer, a pumpkin in autumn and a gingerbread house in winter.
- ground 1200×260: the counter's back edge is at y 8 and its front edge at 48. The sage cabinets run from 58 to 236, the toe kick from 236 to 248 and the floor from 248.
  The scale is chosen so the toe kick lands about at `groundY`.
- light 600×720: same scale and y as far, placed at `tile x + 100·k` (its glass is at x 150–450).
- Particles (32×32): `sprinkle_a`, `sprinkle_b`, `confetti_a`, `confetti_b`, `star`, `flour` and `steam` are white, so code can tint them.
  `crumb`, `petal`, `leaf_a`, `leaf_b`, `snow` and `sparkle` are already coloured.
