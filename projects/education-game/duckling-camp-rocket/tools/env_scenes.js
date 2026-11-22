// Mimi's Splash Rocket: mountain-campsite environment RECIPE + preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]      (filter e.g. "rain", "720x1556", "seams")
// Writes docs/art/env_scene_<mood>_<1556x720|960x720|720x1556>.png and docs/art/env_seams.png, prints a placement check
// (camp props vs Mimi / pad / pump / pole / pennants / HUD / bubble, props inside layout.camp) and a contrast table
// (answer colours vs the meadow around the fake mats).
//
// ================================== RECIPE (render.js copies this; all numbers are logical px) ==================
// render.js pastes envLayout / tileXs / drawEnv verbatim (pure, no DOM at load, no requires) plus the RECIPE tables
// (MOODS, SKY, K, SUN, CLOUDS, RAINBOW, PARTICLES, TILES, ROWS). Then `const RECIPE_TABLES = { SKY, SUN, CLOUDS, RAINBOW };`.
//   L = RECIPE.envLayout(W, H, ins, layout)       pass world.layout (needs horizon, play, bubble, hud, meadow)
//   0 sky     : vertical gradient SKY[m] (2 stops, DESIGN §3 exact) from y 0 to L.horizon; fillRect the screen (the meadow
//               covers everything below the horizon).
//   1 sun     : L.sun = {x, y, size}; SUN[m] = {a, glow}: env/sun.svg (200×200) centred, size, alpha a, + a soft radial glow
//               (r 1.3·size). rain: a = 0 (no sun). Landscape: in the sky gap right of the speech bubble (left of the HUD)
//               when it is wide enough, else just below-left of the HUD, peeking over the mountains. Portrait: above the
//               bubble, left of the HUD.
//   2 rainbow : rainbow mood only (or opt.rainbow 0..1 while crossfading): env/rainbow.svg drawn ONCE (not tiled) at L.rainbow
//               = {x, y, w, h} with alpha RAINBOW.a: the arc (svg centre (600,640), outer radius 560) is centred over the
//               meadow, its feet go down behind the far mountains; the top stays ≥ ins.top + 16.
//   3 clouds  : env/cloud_a | cloud_b | cloud_rain (300×140) × L.clouds.s, centre y ∈ [L.clouds.y0, L.clouds.y1];
//               CLOUDS[m] = {n, alpha, kinds, tint} (rain: mostly cloud_rain).
//   4 far     : tile far_m (L.far.w × L.far.h) at x ∈ tileXs(L.far.x0, L.far.w, W), top y = L.far.y.
//   5 mid     : tile mid_m at L.mid (same tiling). Its bottom row (MID_BASE 300) lands exactly on L.horizon, where
//               DK.MeadowArt.drawMeadow starts with the same far-meadow colour (no seam).
//   Scale rule (skill rule): k = K[layer] × kp, kp = 1 landscape, 1.15 portrait, 1.36 tall portrait (H/W > 1.6).
//   Every layer is uniformly scaled → DK.Assets.exact(name, round(w·k·rs), round(h·k·rs)) once per size.
//   Mood crossfade (2.5 s): draw the old mood's stack, then the new one with globalAlpha = mix (drawEnv opt.alpha,
//   MeadowArt opt.alpha).
// Then (DESIGN §7): back particles → DK.MeadowArt.drawMeadow(ctx, layout, mood, {t, wind, wet, quality, dpr: rs}) → …
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ENV = require('./art_env.js');

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

const RECIPE = {
  MOODS,                       // ['sunny','breezy','rain','rainbow'] = weather 0..3
  SKY,                         // { mood: [[0, top], [1, bottom]] } from y 0 to L.horizon (DESIGN §3 exact)
  HAZE: ENV.HAZE,              // distance haze per mood (code-drawn distant things, title / Talk-time backdrop)
  MEADOW: ENV.MEADOW,          // meadow tones per mood {base, far, light, near, tuft, stripe} (= DK.MeadowArt.MEADOW)
  K, SUN, CLOUDS, RAINBOW, PARTICLES, TILES, ROWS,
  envLayout, tileXs, drawEnv,
};
module.exports = { RECIPE, envLayout, tileXs, drawEnv };
// the literal tables must match the generator
{ const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b); const sp = {}; for (const k of Object.keys(ENV.SPRITES)) sp[k] = TILES[k];
  if (!eq(SKY, ENV.SKY) || !eq(sp, ENV.SPRITES) || ROWS.midBase !== ENV.MID_BASE || ROWS.midFar !== ENV.MID_FAR || ROWS.farBase !== ENV.FAR_BASE || ROWS.midBand !== ENV.MID_BAND) throw new Error('RECIPE tables out of sync with tools/art_env.js'); }
if (require.main !== module) return;

// ----------------------------------------------------------------------------------------------------- previews
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');
const PARTS = ['mote', 'butterfly', 'leaf', 'petal', 'raindrop', 'splash', 'rainbow_sparkle'];
const NAMES = ['env/sun', 'env/cloud_a', 'env/cloud_b', 'env/cloud_rain', 'env/rainbow', ...Object.keys(ENV.SPRITES).map(k => 'env/' + k),
  ...MOODS.flatMap(s => ['far', 'mid'].map(l => `env/${l}_${s}`)), ...PARTS.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const PAL = { red: ['#E84A4A', '#A8282E', '#F7A0A0'], blue: ['#3C8DE8', '#1F5BA8', '#A6CCF5'], yellow: ['#FFD23F', '#C99A12', '#FFEB9C'], green: ['#4CC26B', '#2A8343', '#A8E6B8'], orange: ['#FF9A2E', '#C4650C', '#FFCB8E'], purple: ['#8E44AD', '#6840A8', '#D2BDF3'] };
const COLS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'];

/** fake mats: 3 farthest-point homes in the meadow below the horizon (DESIGN §2 rules, simplified) */
function fakeMats(L, n) {
  const md = L.meadow, hz = L.horizon, bot = L.portrait ? L.camp.y - 44 : L.H - 44;
  const x0 = md.x + 44 + L.hitR * 0.6, x1 = md.x + md.w - 44 - L.hitR * 0.6, y0 = hz + 0.62 * L.S * 0.5 + 40, y1 = bot - 0.25 * L.S;
  let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const pts = [];
  for (let k = 0; k < n; k++) {
    let best = null, bd = -1;
    for (let q = 0; q < 300; q++) {
      const p = { x: x0 + rnd() * (x1 - x0), y: y0 + rnd() * (y1 - y0) };
      if (L.pad && Math.hypot(p.x - L.pad.x, p.y - L.pad.y) < 90 + L.hitR) continue;
      if (L.pole && Math.abs(p.x - L.pole.x) < 44 + L.hitR && p.y > L.pole.y1 - 20) continue;
      let d = 1e9; for (const o of pts) d = Math.min(d, Math.hypot(p.x - o.x, p.y - o.y));
      if (d > bd) { bd = d; best = p; }
    }
    best.ds = 0.82 + 0.18 * (best.y - hz) / (bot - hz);
    pts.push(best);
  }
  return pts;
}

function pageScene({ mood, W, H, L, E, mats, src, cols, parts, fns }) {
  const RECIPE_TABLES = fns.tables;
  const drawEnv = new Function('RECIPE_TABLES', 'tileXs', 'return ' + fns.drawEnv)(RECIPE_TABLES, new Function('return ' + fns.tileXs)());
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    window.DK.Assets = { img: k => im[k] || null };
    window.DK.MeadowArt._reset();
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const cc = RECIPE_TABLES.CLOUDS[mood];
    const cloudImg = kind => { const o = document.createElement('canvas'); o.width = 300; o.height = 140; const x = o.getContext('2d'); x.drawImage(im['env/cloud_' + kind], 0, 0); if (cc.tint) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = cc.tint; x.fillRect(0, 0, 300, 140); } return o; };
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const clouds = []; for (let i = 0; i < cc.n; i++) clouds.push({ kind: cc.kinds[i % cc.kinds.length], s: E.clouds.s * (0.8 + 0.4 * rnd()), x: (i + 0.3 + rnd() * 0.4) * W / cc.n, y: E.clouds.y0 + rnd() * (E.clouds.y1 - E.clouds.y0) });
    drawEnv(g, E, mood, n => im[n], { clouds, cloudImg });
    const MA = window.DK.MeadowArt;
    MA.drawMeadow(g, L, mood, { t: 1.3, wind: mood === 'breezy' ? 0.75 : 0.08, wet: mood === 'rain' ? 1 : 0 });
    // contrast samples on the meadow around the mats (before mats are drawn)
    const dat = g.getImageData(0, 0, W, H).data, samples = [];
    for (const m of mats) for (let q = 0; q < 16; q++) { const a = q / 16 * 6.283, x = Math.round(m.x + Math.cos(a) * L.S * m.ds * 0.62), y = Math.round(m.y + Math.sin(a) * L.S * m.ds * 0.3); if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = (y * W + x) * 4; samples.push([dat[i], dat[i + 1], dat[i + 2]]); }
    // pole + pennants (fake)
    const P = L.pole;
    g.strokeStyle = '#6B5038'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(P.x, P.y0); g.lineTo(P.x, P.y1); g.stroke();
    g.strokeStyle = '#A57E5E'; g.lineWidth = 4; g.beginPath(); g.moveTo(P.x - 1, P.y0); g.lineTo(P.x - 1, P.y1); g.stroke();
    g.fillStyle = '#E4C46A'; g.beginPath(); g.arc(P.x, P.y1 - 6, 8, 0, 7); g.fill();
    const right = P.x + 86 <= W;
    for (let j = 0; j < 3; j++) { const y = P.y1 + 24 + j * 46, col = cols[(j + 2) % cols.length]; g.fillStyle = col[0]; g.strokeStyle = col[1]; g.lineWidth = 3; g.beginPath(); g.moveTo(P.x, y - 18); g.lineTo(P.x + (right ? 64 : -64), y); g.lineTo(P.x, y + 18); g.closePath(); g.fill(); g.stroke(); }
    // mats back to front (cream ellipses + an answer-coloured ball)
    const S = L.S;
    mats.slice().sort((p, q) => p.y - q.y).forEach((m, i) => {
      const w = S * m.ds, x = m.x, y = m.y;
      g.fillStyle = 'rgba(40,60,40,0.22)'; g.beginPath(); g.ellipse(x, y + 0.06 * w, w * 0.52, w * 0.22, 0, 0, 7); g.fill();
      g.fillStyle = '#EFE2C6'; g.strokeStyle = '#9C8763'; g.lineWidth = 4; g.beginPath(); g.ellipse(x, y, w * 0.5, w * 0.21, 0, 0, 7); g.fill(); g.stroke();
      g.strokeStyle = '#CDB68E'; g.lineWidth = 6; g.beginPath(); g.ellipse(x, y, w * 0.38, w * 0.15, 0, 0, 7); g.stroke();
      const col = cols[i % cols.length], r = L.itemH * m.ds * 0.36;
      g.fillStyle = col[0]; g.strokeStyle = col[1]; g.lineWidth = 4; g.beginPath(); g.arc(x, y - r - 2, r, 0, 7); g.fill(); g.stroke();
      g.fillStyle = col[2]; g.beginPath(); g.ellipse(x - r * 0.35, y - r * 1.4, r * 0.28, r * 0.16, -0.6, 0, 7); g.fill();
    });
    // pad + rocket, pump, Mimi (fake boxes)
    const pd = L.pad, rh = L.rocketH;
    g.fillStyle = '#A57E5E'; g.strokeStyle = '#6B5038'; g.lineWidth = 3; g.beginPath(); g.roundRect(pd.x - 34, pd.y - 6, 68, 18, 5); g.fill(); g.stroke();
    g.fillStyle = 'rgba(221,239,242,0.9)'; g.strokeStyle = '#7FA3AA'; g.beginPath(); g.roundRect(pd.x - 22, pd.y - rh, 44, rh - 6, 16); g.fill(); g.stroke();
    g.fillStyle = '#F6EEDC'; g.beginPath(); g.moveTo(pd.x - 22, pd.y - rh + 14); g.quadraticCurveTo(pd.x, pd.y - rh - 30, pd.x + 22, pd.y - rh + 14); g.fill(); g.stroke();
    const pu = L.pump; g.fillStyle = '#C9B48A'; g.strokeStyle = '#7A6544'; g.beginPath(); g.roundRect(pu.x - 24, pu.y, 48, 30, 8); g.fill(); g.stroke(); g.fillRect(pu.x - 4, pu.y - 26, 8, 26); g.beginPath(); g.roundRect(pu.x - 18, pu.y - 32, 36, 9, 4); g.fill(); g.stroke();
    g.strokeStyle = '#6E7C80'; g.lineWidth = 4; g.beginPath(); g.moveTo(pu.x - 24, pu.y + 22); g.quadraticCurveTo((pu.x + pd.x) / 2, pd.y + 30, pd.x, pd.y + 8); g.stroke();
    const mh = L.mimiHome, h = L.mimiH;
    g.fillStyle = '#FBF3DD'; g.strokeStyle = '#A8936A'; g.lineWidth = 4; g.beginPath(); g.ellipse(mh.x, mh.y - h * 0.32, h * 0.34, h * 0.3, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.arc(mh.x + h * 0.05, mh.y - h * 0.72, h * 0.22, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#C9B48A'; g.strokeStyle = '#7A6544'; g.beginPath(); g.ellipse(mh.x + h * 0.05, mh.y - h * 0.9, h * 0.25, h * 0.08, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#F0A982'; g.beginPath(); g.ellipse(mh.x + h * 0.26, mh.y - h * 0.68, h * 0.1, h * 0.05, 0, 0, 7); g.fill();
    // front particles (few)
    const pk = parts[mood];
    for (let i = 0; i < 7; i++) { const name = pk.front[i % pk.front.length], s = 18 + (i % 3) * 6, x = ((i * 0.71 + 0.33) % 1) * W, y = E.horizon * 0.6 + ((i * 0.43 + 0.2) % 1) * (H - E.horizon) * 0.8; g.drawImage(im['particles/' + name], x, y, s, s); }
    if (mood === 'rain') for (let i = 0; i < 40; i++) { const x = ((i * 0.618 + 0.1) % 1) * W, y = ((i * 0.37 + 0.05) % 1) * H; g.globalAlpha = 0.7; g.drawImage(im['particles/raindrop'], x, y, 14, 14); g.globalAlpha = 1; }
    // UI placeholders + the camp rect outline (debug)
    const rr = (r, fill) => { g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 22); g.fillStyle = fill; g.fill(); };
    rr(L.bubble, 'rgba(255,255,255,0.93)'); rr(L.hud, 'rgba(255,255,255,0.9)');
    g.setLineDash([6, 6]); g.strokeStyle = 'rgba(120,60,60,0.35)'; g.lineWidth = 1.5; g.strokeRect(L.camp.x + 1, L.camp.y + 1, L.camp.w - 2, L.camp.h - 2); g.setLineDash([]);
    return { url: c.toDataURL('image/png'), samples, props: MA.campProps(L), keep: MA.keepBoxes(L) };
  })();
}

function pageSeams({ src, list }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    let total = 0; for (const [, w, h] of list) total += h / 2 + 12;
    const out = document.createElement('canvas'); out.width = 1200; out.height = Math.ceil(total);
    const o = out.getContext('2d'); o.fillStyle = '#556'; o.fillRect(0, 0, out.width, out.height);
    const scores = []; let y = 0;
    for (const [n, w, h, bg] of list) {
      const im = await load(src[n]);
      const c = document.createElement('canvas'); c.width = 2 * w; c.height = h; const g = c.getContext('2d');
      g.fillStyle = bg; g.fillRect(0, 0, 2 * w, h); g.drawImage(im, 0, 0, w, h); g.drawImage(im, w, 0, w, h);
      const d = g.getImageData(0, 0, 2 * w, h).data;
      const col = (x1, x2) => { let t = 0; for (let yy = 0; yy < h; yy++) { const i = (yy * 2 * w + x1) * 4, j = (yy * 2 * w + x2) * 4; for (let q = 0; q < 3; q++) t += Math.abs(d[i + q] - d[j + q]); } return t / h; };
      const seam = col(w - 1, w); let sum = 0; for (let x = 50; x < w - 50; x++) sum += col(x, x + 1);
      const avg = sum / (w - 100);
      scores.push(`${n.padEnd(18)} seam=${seam.toFixed(2)} interiorAvg=${avg.toFixed(2)} ${seam <= Math.max(1.5, avg * 3) ? 'OK' : 'CHECK'}`);
      o.drawImage(c, w - 600, 0, 1200, h, 0, y, 1200, h / 2);
      o.save(); o.setLineDash([6, 6]); o.strokeStyle = 'red'; o.lineWidth = 1.5; o.beginPath(); o.moveTo(600, y); o.lineTo(600, y + h / 2); o.stroke(); o.restore();
      y += h / 2 + 12;
    }
    return { url: out.toDataURL('image/png'), scores };
  })();
}

const hexRgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const dE = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
const lum = rgb => { const a = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hit = (a, b, m = 0) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;

(async () => {
  global.DK = {};
  require(path.join(ROOT, 'game/js/meadow_art.js'));
  const MA = global.DK.MeadowArt;
  fs.mkdirSync(ART, { recursive: true });
  for (const fn of fs.readdirSync(ART)) if (/^env_scene_(spring|summer|autumn|winter)_/.test(fn)) fs.unlinkSync(path.join(ART, fn));   // old river previews
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent('<html><body style="margin:0"></body></html>');
  await pg.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'game/js/meadow_art.js'), 'utf8') });
  const save = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  const only = process.argv[2];
  const fns = { drawEnv: drawEnv.toString(), tileXs: tileXs.toString(), tables: RECIPE_TABLES };
  const rows = [], issues = [];
  for (const [W, H] of VPS) for (const m of MOODS) {
    const vp = `${W}x${H}`; if (only && !`${vp}_${m}`.includes(only)) continue;
    const L = MA.fakeLayout(W, H), E = envLayout(W, H, L.ins, L), mats = fakeMats(L, 3);
    const r = await pg.evaluate(pageScene, { mood: m, W, H, L, E, mats, src: SRC, cols: COLS.map(k => PAL[k]), parts: PARTICLES, fns });
    save(r.url, path.join(ART, `env_scene_${m}_${vp}.png`));
    // placement check: props ≥ 30 px from Mimi / pad / pump / pole, ≥ 12 px from the pennants, 8 px from HUD / bubble; inside the camp
    for (const p of r.props) {
      for (const k of r.keep) if (hit(p.box, k, (p.edge ? 8 : ({ bubble: 8, hud: 8, pennants: 12 })[k.n] || 30) - 0.1)) issues.push(`${vp} ${m}: ${p.kind} @${Math.round(p.x)},${Math.round(p.y)} too close to ${k.n}`);
      if (!p.edge && (p.box.x < L.camp.x - 0.5 || p.box.x + p.box.w > L.camp.x + L.camp.w + 0.5)) issues.push(`${vp} ${m}: ${p.kind} outside the camp`);
      for (const q of mats) if (hit(p.box, { x: q.x - L.S * 0.6, y: q.y - L.itemH - 10, w: L.S * 1.2, h: L.itemH + 0.4 * L.S })) issues.push(`${vp} ${m}: ${p.kind} under a mat`);
    }
    const res = {};
    const pct = (arr, p) => arr.slice().sort((x, y) => x - y)[Math.floor(p * (arr.length - 1))];
    for (const [k, [base, dark]] of Object.entries(PAL)) res[k] = { cr: pct(r.samples.map(q => Math.max(cr(hexRgb(base), q), cr(hexRgb(dark), q))), 0.05), d: pct(r.samples.map(q => dE(hexRgb(base), q)), 0.05) };
    rows.push([vp, m, res, r.props.map(p => p.kind + '×' + p.s.toFixed(2)).join(' ')]);
  }
  if (rows.length) {
    console.log('answer colour vs the meadow around the mats: 5th-percentile WCAG contrast (best of base / dark) · RGB distance of the base; camp props');
    for (const [vp, m, res, n] of rows) console.log(vp.padEnd(9), m.padEnd(7), Object.entries(res).map(([k, v]) => `${k.slice(0, 3)} ${v.cr.toFixed(1)}·${v.d.toFixed(0)}`).join('  '), `| ${n}`);
    console.log(issues.length ? 'PLACEMENT ISSUES:\n  ' + issues.join('\n  ') : 'placement: every camp prop is inside the camp, ≥ 30 px from Mimi / pad / pump / pole (12 from the pennants), clear of HUD / bubble / mats');
  }
  if (!only || only === 'seams') {
    const last = s => SKY[s][1][1];
    const list = MOODS.flatMap(s => [['env/far_' + s, 1200, 720, last(s)], ['env/mid_' + s, 1200, 300, last(s)]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
