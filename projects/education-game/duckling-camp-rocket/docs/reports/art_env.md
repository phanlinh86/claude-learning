# Environment art — mountain campsite meadow (environment artist)

## Files
| File | What |
|---|---|
| `tools/art_env.js` | Generator (`node tools/art_env.js`). Writes every env SVG + particles, deletes all other env files and the river-only particles (glint, dragonfly, snow, blossom, firefly). Checks: no `<text>`/script/font/href, ≤ 1 blur, width/height = viewBox. |
| `env/far_<m>.svg` (1200×720), m = sunny·breezy·rain·rainbow | Two snow-capped ranges (lavender-grey back range #A9A6C4 hazed into the sky, blue-grey main range #8FA3B8 with shaded right flanks, snow #F4F6FA), a mist band, two rows of forested foothills. rain = mistier (haze ×1.45, thick mist band), rainbow = clearer. Tileable, bottom-anchored, transparent top, `<!-- sky #top #bottom -->`. Row 660 sits on mid row 205. |
| `env/mid_<m>.svg` (1200×300) | Pine forest edge (hazy back wall + outlined clusters #5F8A6E / #4E7560) with two still lake strips (white glints) in front, on a meadow band (rows 240–300) in the **exact far-meadow colour**. Row 300 = `layout.horizon`. Tileable. |
| `env/tent_a.svg`, `tent_b.svg` (260×200, anchor 130,196) | A-frame tents, khaki #D9C59A / dusty teal #7FA8A2 (mirrored), open door, guy ropes. |
| `env/campfire.svg` (140×120, anchor 70,114) | Stone ring + log teepee + ember bed; the flame is `drawFlame` at (70,92). |
| `env/pine.svg` (160×300, 80,294) · `rock.svg` (120×80, 60,76) · `flowers.svg` (140×70, 70,68) | Camp / meadow decorations (pale daisies + lilac-grey bells; nothing in an answer colour). |
| `env/windsock.svg` (120×200, anchor 60,196) | Wooden pole + hinge ring at (62,34); the sock is `drawWindsock`. |
| `env/sun.svg` (200), `cloud_a`, `cloud_b`, `cloud_rain` (300×140, centre 150,70) | Clouds white (tintable); `cloud_rain` blue-grey with a darker belly. |
| `env/rainbow.svg` (1200×600) | Pastel arcs, centre (600,640), outer radius 560, one light blur. Drawn ONCE by `drawEnv` (not tiled). |
| `particles/*` (32×32; mist 64×32) | mote sparkle star leaf (sage) petal (blush) butterfly confetti_a confetti_b dot dust + **raindrop** (point up, vertical) + **splash** (crown, bottom centre 16,28) + **rainbow_sparkle** (multi-colour, do not tint). Kept from the base: `mist`, `feather` (now cream duckling down — Mimi pokes). |
| `game/js/meadow_art.js` | `DK.MeadowArt` (below). `game/js/river_art.js` is deleted. |
| `tools/env_scenes.js` | RECIPE + previews `docs/art/env_scene_<m>_<W>x<H>.png` (1556×720, 960×720, 720×1556) + `docs/art/env_seams.png`, a placement check and a contrast table. |

## DK.MeadowArt API (as implemented)
- `drawMeadow(ctx, layout, mood, opt)` — ground below `layout.horizon`: grass gradient (far #9CC48A-style colour under the forest edge → light hazy band → base → deeper near), soft mown stripes converging in perspective, gentle roll bands, seeded tufts / flecks / tiny pale flowers / pebbles, edge decorations (landscape: 2 pines at the right edge; flowers / rock at the edges), the camp corner (trodden clearing under Mimi / pad / pump / fire / tents, tents, campfire, log seat, + pine / rock / flowers when they fit), rain puddles (rain mood). `opt = { t, wind, wet, quality, alpha, dpr }`: `wind` −1..1 (|v| > 1.5 → treated as px/s² ÷ 60), `wet` 0..1 (default 1 in rain) = animated sheen glints, `dpr` = render scale (bitmap resolution; pass `rs`). `mood` = name or 0..3.
  - Cache: the static part per (layout key, mood, dpr) as ONE offscreen bitmap cropped to the rows it covers (≤ 4 kept → a crossfade keeps both moods). A frame draws the bitmap + flame + windsock sock + sheen ellipses (no gradients, no allocations). If `DK.Assets` sprites are not loaded yet it draws live without them and caches later. Images via `DK.Assets.img(key)` (vector, crisp) else `sprite(key, px)`. Node-safe; without a DOM it draws live (tested with a recording mock ctx: 6 screen shapes × 4 moods, no NaN).
- `drawFlame(ctx, x, y, s, t)` — base centre (x, y), ≈ 62·s tall; 3 tongues + inner + core, glow, 3 sparks. For a campfire prop `p`: `drawFlame(ctx, p.fx, p.fy, p.s, t)`.
- `drawWindsock(ctx, x, y, s, wind, t)` — the sock only, for the pole sprite at anchor (x, y), scale s (hinge (x + 2s, y − 162s)). 5 striped segments (cream #F6EEDC / dusty teal #8FB8B2, outline #5E8580); wind 0 hangs down and sways, 0.7 nearly horizontal with a travelling ripple; sign = side.
- `campProps(layout)` → `[{kind, x, y, s, box:{x,y,w,h}, fx?, fy? (flame), hx?, hy? (sock hinge), edge? }]` back-to-front, cached per layout. Kinds `tent_a tent_b campfire log windsock pine rock flowers`.
- `keepBoxes(layout)` → `[{n, x, y, w, h}]`: mimi (feet ± 0.45·mimiH, mimiH tall), pad (± 52, rocketH + 24 above), pump (± 52, −44…+52), pole stick, pennants (76 wide to the right of the pole, or left when it would leave the screen; 4 slots), bubble, hud. Gaps: 30 px (mimi, pad, pump, pole), 12 px (pennants), 8 px (bubble, hud).
- `fakeLayout(W, H, portrait)` → a DESIGN §2 layout with zero insets (camp, meadow, horizon, mimiHome, mimiH, pad, pump, pole, rocketH, S, itemH, hitR, bubble, hud, play). The real one comes from world.js.
- `propBox(kind, x, y, s)`, `MEADOW` (per-mood {base, far, light, near, tuft, stripe, dirt, dirtEdge}), `MOODS`, `SPRITES` (asset keys: `env/tent_a tent_b campfire pine rock flowers windsock`), `SP`, `_reset()`.

## Asset keys assets.js must load
`env/far_<m>`, `env/mid_<m>` (m = sunny|breezy|rain|rainbow), `env/sun`, `env/cloud_a`, `env/cloud_b`, `env/cloud_rain`, `env/rainbow`, `env/tent_a`, `env/tent_b`, `env/campfire`, `env/pine`, `env/rock`, `env/flowers`, `env/windsock`; particles `mote sparkle star leaf petal butterfly confetti_a confetti_b dot dust mist feather raindrop splash rainbow_sparkle`. **Remove** the seasonal env keys (`far_spring` …, `bush_*`, `reeds_*`, `flowers_<season>`, `tree_*`, `moon`) and `particles/{glint,dragonfly,snow,blossom,firefly}`; remove `<script src="js/river_art.js">` and add `meadow_art.js` after `mat_art.js`.

## RECIPE (copy verbatim into render.js)
Then add `const RECIPE_TABLES = { SKY, SUN, CLOUDS, RAINBOW };` (the last line below) — `drawEnv` reads it, `envLayout` reads `RAINBOW`.
Call: `L = envLayout(W, H, ins, world.layout)` (cache per W, H, insets, horizon); `drawEnv(g, L, mood, img, { clouds, cloudImg, alpha, rainbow, sunA })` with `img('env/far_sunny')` → `DK.Assets.exact(name, round(L.far.w·rs), round(L.far.h·rs))` for far/mid and `sprite(name, …)` for the rest; clouds `{kind: 'a'|'b'|'rain', x, y, s, a}` (weather's `cloud_rain` → kind 'rain'). Order: `drawEnv` (sky → sun → rainbow → clouds → far → mid) → back particles → `DK.MeadowArt.drawMeadow(g, layout, mood, {t, wind, wet, quality, dpr: rs, alpha})` → burrow/marmot … (DESIGN §7). Crossfade: draw both moods' env + meadow with alpha.

```js
const MOODS = ['sunny', 'breezy', 'rain', 'rainbow'];
const SKY = {                 // DESIGN §3 exact (= tools/art_env.js SKY, asserted below)
  sunny: [[0, '#9FD3EE'], [1, '#F3F7EE']],
  breezy: [[0, '#B7D9EC'], [1, '#F1F3EA']],
  rain: [[0, '#A7B5C3'], [1, '#DCE2E6']],
  rainbow: [[0, '#B6DDF0'], [1, '#FBF3E6']],
};
const K = { far: 0.6, mid: 0.62 };
// sun per mood: alpha + glow colour (rain: hidden)
const SUN = {
  sunny: { a: 1, size: 100, glow: '255,248,220' },
  breezy: { a: 0.92, size: 92, glow: '255,248,226' },
  rain: { a: 0, size: 86, glow: '255,248,230' },
  rainbow: { a: 0.95, size: 96, glow: '255,244,220' },
};
const CLOUDS = {
  sunny: { n: 3, alpha: 0.95, kinds: ['a', 'b'], tint: null },
  breezy: { n: 4, alpha: 0.92, kinds: ['b', 'a'], tint: 'rgba(236,240,246,0.25)' },
  rain: { n: 5, alpha: 0.96, kinds: ['rain', 'rain', 'a'], tint: 'rgba(170,182,196,0.35)' },
  rainbow: { n: 2, alpha: 0.9, kinds: ['a', 'b'], tint: 'rgba(255,244,230,0.2)' },
};
const RAINBOW = { a: 0.55, rMax: 0.62 };     // alpha; outer radius ≤ rMax × meadow width
// weather particles per mood (names in particles/): back = behind mats, front = in front (few, small)
const PARTICLES = {
  sunny: { back: ['mote'], front: ['butterfly'], n: 14 },
  breezy: { back: ['leaf', 'petal'], front: ['leaf', 'petal'], n: 22 },        // blown across by the wind, gusts
  rain: { back: ['raindrop'], front: ['raindrop'], ground: ['splash'], n: 60 },
  rainbow: { back: ['rainbow_sparkle', 'mote'], front: ['butterfly', 'rainbow_sparkle'], n: 16 },
};
// [w, h] or [w, h, anchorX, anchorY] (viewBox; bottom-centre anchors) — = tools/art_env.js SPRITES
const TILES = { far: [1200, 720], mid: [1200, 300], rainbow: [1200, 600], cloud: [300, 140], sun: [200, 200],
  tent_a: [260, 200, 130, 196], tent_b: [260, 200, 130, 196], campfire: [140, 120, 70, 114], pine: [160, 300, 80, 294],
  rock: [120, 80, 60, 76], flowers: [140, 70, 70, 68], windsock: [120, 200, 60, 196] };
const ROWS = { midBase: 300, midBand: 240, midFar: 205, farBase: 660 };   // mid row 300 = horizon; far row 660 on mid row 205

/** Pure layout of the background for a W × H screen. ins = safe-area insets; layout = world.layout. */
function envLayout(W, H, ins, layout) {
  ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
  const portrait = H > W, tall = H / W > 1.6;
  const lay = layout || {};
  const play = lay.play || { y0: portrait ? 244 : 162 };
  const horizon = Math.round(lay.horizon != null ? lay.horizon : (portrait ? play.y0 + 120 : play.y0 + 0.3 * (H - play.y0)));
  const kp = portrait ? (tall ? 1.36 : 1.15) : 1;            // skill rule: background layers ×1.36 on tall portrait
  const kf = 0.6 * kp, km = 0.62 * kp;
  const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(W * 0.5 - 600 * km), y: horizon - 300 * km };
  const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(W * (portrait ? 0.55 : 0.6) - 690 * kf), y: mid.y + 205 * km - 660 * kf };
  const sky = { y0: 0, y1: horizon };
  const hud = lay.hud || { x: W - ins.right - 160, y: 0, w: 160 + ins.right, h: ins.top + 96 };
  const bub = lay.bubble || (portrait ? { x: 24, y: ins.top + 110, w: W - 48, h: 124 } : { x: ins.left + 24, y: ins.top + 18, w: Math.min(700, W - 224), h: 134 });
  const md = lay.meadow || { x: 0, y: play.y0, w: W, h: H - play.y0 };
  // sun
  const size = portrait ? 90 : 96;
  let sx, sy;
  if (portrait) { sx = ins.left + Math.max(size * 0.7, 0.3 * (hud.x - ins.left)); sy = ins.top + Math.max(size * 0.55, (bub.y - ins.top) * 0.5); }
  else {
    const gx0 = bub.x + bub.w + 12, gx1 = hud.x - 12;
    if (gx1 - gx0 >= size + 20) { sx = gx0 + 0.5 * (gx1 - gx0); sy = ins.top + Math.max(size * 0.6, (play.y0 - ins.top) * 0.42); }
    else { sx = hud.x - size * 0.55; sy = Math.max(hud.y + hud.h, bub.y + bub.h) + size * 0.42; }
  }
  const sun = { x: sx, y: sy, size };
  // rainbow: centred over the meadow, top ≥ ins.top + 16, feet behind the mountains (≈ the horizon − 40)
  const rbBase = horizon - 40 * kp;
  const rOut = Math.max(120, Math.min(RAINBOW.rMax * md.w, rbBase - (ins.top + 16)));
  const rk = rOut / 560;
  // landscape: shift it right so the arc shows beside / below the speech bubble (it would hide behind it otherwise)
  const rcx = portrait ? md.x + md.w / 2 : Math.min(W - ins.right - rOut * 0.45, Math.max(md.x + md.w / 2, bub.x + bub.w + rOut * 0.35));
  const rainbow = { x: rcx - 600 * rk, y: rbBase - 640 * rk, w: 1200 * rk, h: 600 * rk };
  const clouds = { y0: ins.top + 26, y1: Math.max(ins.top + 44, (portrait ? bub.y : play.y0) - 40), s: portrait ? 0.46 : 0.42 };
  return { W, H, portrait, tall, kp, horizon, far, mid, sky, sun, rainbow, clouds, _g: null };
}
/** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }
/** Draw the background for mood m. img(name) → a drawable for 'env/far_sunny' etc. (Image or DK.Assets.exact canvas).
 *  opt = { clouds: [{kind:'a'|'b'|'rain', x, y, s, a?}] (centres, from weather.clouds), cloudImg(kind, m) → tinted drawable
 *  (optional), alpha, rainbow (0..1 override of the rainbow's strength; default 1 in the rainbow mood, else 0),
 *  sunA (0..1 multiplier, e.g. weather.ambient.sunA) }. Pure canvas; gradients cached on L per context. */
function drawEnv(g, L, m, img, opt) {
  opt = opt || {};
  const W = L.W, H = L.H, R = RECIPE_TABLES;
  g.save(); if (opt.alpha != null) g.globalAlpha = opt.alpha;
  const a0 = g.globalAlpha;
  const tile = (name, Ly) => { const im = img(name); if (!im) return; for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(im, Math.floor(x), Math.round(Ly.y), Math.ceil(Ly.w) + 1, Math.round(Ly.h)); };
  if (!L._g || L._g.ctx !== g) L._g = { ctx: g, sky: {}, glow: {} };
  // 0 sky (the bottom stop continues below the horizon; the meadow covers it)
  let gr = L._g.sky[m];
  if (!gr) { gr = g.createLinearGradient(0, L.sky.y0, 0, L.sky.y1); for (const [o, c] of R.SKY[m]) gr.addColorStop(o, c); L._g.sky[m] = gr; }
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // 1 sun + glow
  const sm = R.SUN[m], sn = L.sun, sa = sm.a * (opt.sunA == null ? 1 : opt.sunA);
  if (sa > 0.01) {
    let gl = L._g.glow[m];
    if (!gl) { gl = g.createRadialGradient(sn.x, sn.y, sn.size * 0.2, sn.x, sn.y, sn.size * 1.3); gl.addColorStop(0, `rgba(${sm.glow},0.45)`); gl.addColorStop(1, `rgba(${sm.glow},0)`); L._g.glow[m] = gl; }
    g.globalAlpha = a0 * sa; g.fillStyle = gl; g.beginPath(); g.arc(sn.x, sn.y, sn.size * 1.3, 0, 7); g.fill();
    const si = img('env/sun'); if (si) g.drawImage(si, sn.x - sn.size / 2, sn.y - sn.size / 2, sn.size, sn.size);
    g.globalAlpha = a0;
  }
  // 2 rainbow (drawn once, behind the clouds and the mountains)
  const rb = opt.rainbow != null ? opt.rainbow : (m === 'rainbow' ? 1 : 0);
  if (rb > 0.01) { const ri = img('env/rainbow'); if (ri) { g.globalAlpha = a0 * R.RAINBOW.a * rb; g.drawImage(ri, L.rainbow.x, L.rainbow.y, L.rainbow.w, L.rainbow.h); g.globalAlpha = a0; } }
  // 3 clouds
  const cc = R.CLOUDS[m];
  for (const c of opt.clouds || []) {
    const im = opt.cloudImg ? opt.cloudImg(c.kind, m) : img('env/cloud_' + c.kind), w = 300 * c.s, h = 140 * c.s;
    if (!im) continue;
    g.globalAlpha = a0 * cc.alpha * (c.a == null ? 1 : c.a); g.drawImage(im, c.x - w / 2, c.y - h / 2, w, h);
  }
  g.globalAlpha = a0;
  // 4 far, 5 mid
  tile('env/far_' + m, L.far); tile('env/mid_' + m, L.mid);
  g.restore();
}
// the tables drawEnv reads (render.js: `const RECIPE_TABLES = { SKY, SUN, CLOUDS, RAINBOW };`)
const RECIPE_TABLES = { SKY, SUN, CLOUDS, RAINBOW };
```
Extra tables in `RECIPE` (not needed by drawEnv): `HAZE = { sunny: '#DAECEE', breezy: '#E0EBEB', rain: '#CFD7DD', rainbow: '#E6ECE9' }` (distance haze for code-drawn backdrops), `MEADOW` = `DK.MeadowArt.MEADOW` (title / Talk backdrop: sunny base #A9CF8E far #9CC48A, breezy #A2C78C/#97BD88, rain #8FB385/#86A982, rainbow #AFD596/#A2CB90).

Screen numbers (fake layout, zero insets): landscape H 720, horizon 329 → mid k 0.62 (y 143, forest tops ≈ 200–260), far k 0.6 (peaks ≈ 110–200, partly behind the bubble); sky 0…329. Tall portrait 720×1556, horizon 364 → kp 1.36: mid k 0.843 (y 111), far k 0.816; the mountains show above the bubble (0–110), the forest between the bubble and the horizon.

## Checks (node tools/env_scenes.js)
- Seams: far 0.44–0.53 vs interior 0.64–0.72, mid 5.4–6.0 vs 5.9–7.3 — all OK (`docs/art/env_seams.png`).
- Placement: every camp prop inside `layout.camp` (except the `edge` ones below), ≥ 30 px from Mimi / pad / pump / pole, ≥ 12 px from the pennant column, clear of HUD / bubble / the fake mats — at all 3 sizes × 4 moods.
- Contrast of the answer colours against the meadow around the mats (5th pct WCAG, best of base/dark · RGB distance): red 2.8–4.1, blue 2.7–3.9, purple 2.9–4.2, green 1.9–2.8 (RGB 67–103), orange 1.6–2.3, yellow 1.3–1.5 (RGB ≥ 116). The cream mats (#EFE2C6 + outline) separate yellow/green from the grass; rain is the lowest (green 1.9 / RGB 67) — mats are never tinted, so fine.

## Deviations / notes for the integrator and the mechanics engineer
- **Rainbow arc not baked into far_rainbow**: in a tiled layer it would repeat on wide screens. It is `env/rainbow.svg`, drawn once by `drawEnv` (landscape: shifted right so it shows beside the speech bubble; feet hidden by the far mountains).
- **Windsock outside the camp corner**: the camp column (230–270 px) has no room for its pole beside the pennants, tents and fire, so it stands at the meadow's far end just under the horizon (landscape: right edge, `W − ins.right − 140`; portrait: left edge, `ins.left + 34`), small (s ≈ 0.57–0.6), `edge: true` in `campProps`. Mats are ≥ 44 px from the edges and their things never rise above horizon + 7, so it never collides; the world may add its `box` to the mat keep-outs to be safe.
- **Landscape second tent**: only one tent fits legibly in the column right of the pennants, so the teal tent is pitched just right of the column at the forest edge (bottom = horizon + 8, `edge: true`, scale ≤ 0.8 × the khaki tent's). Portrait has both tents, the fire and a log in the band.
- Pennant column assumed to the RIGHT of the pole (left in portrait when the pole is near the right edge), 76 px wide, 4 slots; if MatArt's pennants differ, `keepBoxes` is the one place to change.
- The fake layout in landscape puts the pole (x 40) through Mimi's box (feet x 100, 180 tall) — DESIGN §2 numbers; world.js should keep them apart.
- `env` weighs ≈ 540 KB (mid tiles ≈ 87 KB each: many pine paths); fine for one load, rasterized once per size by `Assets.exact`.
