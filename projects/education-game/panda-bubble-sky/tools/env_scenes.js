// Bao's Bubble Sky: rainbow-cloud-land environment RECIPE + preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]      (filter e.g. "winter", "720x1556", "seams", "sheet")
// Writes docs/art/env_<1556x720|960x720|720x1556>_<season>.png, docs/art/env_seams.png, docs/art/env_sheet.png and prints a
// contrast table (answer colours vs the background behind the bubble field, per season and viewport).
//
// ================================== RECIPE (render.js copies this; all numbers are logical px) ==================
// render.js pastes envLayout / tileXs / drawEnv / cushionRect verbatim (pure, no DOM at load, no requires) plus the tables
// in the RECIPE object literal below (SKY, CLOUD_TINT, GROUND_BOTTOM, SUN, MOON, CLOUDS, PARTICLES, TILES).
// Differences from the Bo's Farm Parade recipe (what the integrator changes when porting render.js):
//   * moods → SEASONS ['spring','summer','autumn','winter'] = weather 0..3. No barn, no path band, no stars, no night.
//   * envLayout(W, H, ins, groundY): pass world.layout.groundY (computed per DESIGN §2 when omitted). Everything is
//     anchored to the CLOUD FLOOR: L.floorY = the visible top of the fluffy floor (ground tile row GROUND_ROW = 50) sits
//     150 px (landscape) / 250 px (portrait) / 300 px (tall portrait) above groundY, so Bao (feet at groundY − 4) sits IN
//     the floor and the lowest bubble row floats in front of its calm rows (tile rows 110…215).
//   * NEW env/cushion_<m>.svg (300×120, top-centre anchor (150, 30) = Bao's feet): cushionRect(layout.bao) → draw it right
//     BEFORE Bao (after the ground and the rainbow).
//
//   L = RECIPE.envLayout(W, H, ins, groundY)
//   0 sky    : vertical gradient SKY[m] (2 stops, DESIGN §3 exact) from y L.sky.y0 (= 0) to L.sky.y1, last stop below
//              (fillRect the whole screen; the far cloud sea covers the bottom).
//   1 sun    : L.sun[m] = {x, y, size, a} (env/sun.svg 200×200 centred, drawn size = .size, alpha .a) + a soft radial glow
//              (r = 1.3·size, rgba(255,248,220,0.45) → 0; autumn rgba(255,214,170,0.45)). Winter sun is small and pale.
//              env/moon.svg is unused (only a winter-dusk extra: L.moon).
//   2 clouds : env/cloud_a|b (300×140, white art) × L.clouds.s, centre y ∈ [L.clouds.y0, L.clouds.y1] (portrait: also put
//              one cloud in [L.clouds.y1, L.clouds.y2] — the lower band behind the high islands), RECIPE.CLOUDS[m] =
//              {n, alpha, tint} (tint = 'source-atop' overlay colour on an offscreen copy, null = as is).
//   3 far    : tile far_m (L.far.w × L.far.h) at x ∈ tileXs(L.far.x0, L.far.w, W), top y = L.far.y.
//   4 mid    : tile mid_m at L.mid (same tiling).
//   … back particles, rainbow (DESIGN §7 order) …
//   5 ground : tile ground_m at L.ground; then fillRect(0, L.ground.fillY, W, H − fillY) with GROUND_BOTTOM[m] when fillY < H.
//   6 cushion: r = cushionRect(layout.bao, L) → drawImage(env/cushion_m, r.x, r.y, r.w, r.h); then Bao.
//   Scale rule (skill rule): far + mid ×1.36 on tall portrait (H/W > 1.6), ×1.15 on other portrait (kp; far k = 0.9·kp,
//   mid k = kp); ground kg = 1 landscape, 1.15 portrait, 1.3 tall portrait; cushion k = bao.h / 220. Every layer is
//   uniformly scaled, so PB.Assets.exact(name, round(w·k), round(h·k)) can pre-render it once per size.
//   Season crossfade (weather.setWeather, 2.5 s): draw the whole stack (sky … mid, then ground + cushion) of the old season,
//   then the new one with globalAlpha = mix; or cache each season's back stack in an offscreen canvas and crossfade those.
//   drawEnv(g, L, m, img, opt) below does steps 0–5 exactly (opt.part = 'back' → 0–4, 'front' → 5) and is what the
//   preview scenes use.
// Landscape H=720 (1556 / 960 wide): groundY 706, floorY 556, far k 0.9 (y −134: high islands ≈ 24…150 behind the HUD,
//   big islands + castle ≈ 210…400), mid k 1 (y 284: islands ≈ 310…460, bank tops ≈ 400…480), ground k 1 (y 506, fillY
//   764 > H). Sky gradient 0…406.
// Portrait 720×1556 (tall): groundY 1530, floorY 1230, far k 1.224 (y 290: high islands ≈ 480…690, castle / islands ≈
//   770…1000), mid k 1.36 (y 858), ground k 1.3 (y 1165, fillY 1500 → fill below). Sky gradient 0…1040.
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ENV = require('./art_env.js');

// sun: x = fraction of the safe width; y = fraction of the sky height (ins.top … L.landY, the top of the far islands)
const SUN = {
  landscape: { spring: { x: 0.74, y: 0.62, size: 140, a: 0.95 }, summer: { x: 0.8, y: 0.5, size: 160, a: 1 }, autumn: { x: 0.86, y: 0.95, size: 170, a: 0.95 }, winter: { x: 0.68, y: 0.7, size: 120, a: 0.8 } },
  portrait: { spring: { x: 0.74, y: 0.5, size: 130, a: 0.95 }, summer: { x: 0.76, y: 0.42, size: 150, a: 1 }, autumn: { x: 0.8, y: 0.72, size: 160, a: 0.95 }, winter: { x: 0.7, y: 0.55, size: 112, a: 0.8 } },
};
const MOON = { landscape: { x: 0.68, y: 0.4, size: 120 }, portrait: { x: 0.72, y: 0.5, size: 120 } };
// drifting clouds (white art): count, alpha, season tint
const CLOUDS = {
  spring: { n: 3, alpha: 0.9, tint: 'rgba(250,226,238,0.35)' },
  summer: { n: 3, alpha: 0.95, tint: null },
  autumn: { n: 3, alpha: 0.85, tint: 'rgba(250,214,180,0.4)' },
  winter: { n: 3, alpha: 0.9, tint: 'rgba(214,224,242,0.35)' },
};
// weather particles per season (names in particles/): back = behind the rainbow + bubbles, front = in front (few, small)
const PARTICLES = {
  spring: { back: ['petal', 'blossom'], front: ['petal', 'butterfly'], n: 22 },
  summer: { back: ['mote', 'glint'], front: ['glint', 'butterfly'], n: 18 },
  autumn: { back: ['leaf'], front: ['leaf'], n: 20 },          // blown by weather.wind (gusts)
  winter: { back: ['snow'], front: ['snow', 'sparkle'], n: 40 },
};

/** Pure layout of the environment for a W × H screen. ins = safe-area insets; groundY = world.layout.groundY. */
function envLayout(W, H, ins, groundY) {
  ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
  const portrait = H > W, tall = H / W > 1.6;
  if (groundY == null) groundY = H - ins.bottom - (portrait ? 26 : 14);
  const kp = portrait ? (tall ? 1.36 : 1.15) : 1;          // skill rule: background layers ×1.36 on tall portrait
  const kf = 0.9 * kp, km = kp;
  const kg = portrait ? (tall ? 1.3 : 1.15) : 1;
  const floorY = Math.round(groundY - (portrait ? (tall ? 300 : 250) : 150));   // visible top of the cloud floor
  const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: Math.round(W * 0.5 - 600 * kg), y: Math.round(floorY - 50 * kg) };
  ground.fillY = ground.y + 258 * kg;
  // mid: row 296 hides behind the floor; the waterfall island (x 300) a bit left of centre in landscape, left in portrait
  const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(W * (portrait ? 0.3 : 0.42) - 300 * km), y: Math.round(floorY + 24 * kg - 296 * km) };
  // far: its row 720 lands on mid row 236 (inside the mid banks' solid part); the castle (far x 860) right of centre
  const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(W * (portrait ? 0.62 : 0.66) - 860 * kf), y: Math.round(mid.y + 236 * km - 720 * kf) };
  const landY = Math.round(far.y + 400 * kf);               // ≈ the top of the big far islands (sun reference)
  const sky = { y0: 0, y1: Math.round(far.y + 640 * kf) };   // sky gradient end (behind the far cloud sea)
  const o = portrait ? 'portrait' : 'landscape', sun = {};
  const cw = W - ins.left - ins.right, skyH = landY - ins.top;
  // landscape: the top band is shared with the speech bubble (top-left) — keep the sun right of the bubble's edge (bx)
  const bx = ins.left + 24 + Math.min(560, W - ins.right - 200 - ins.left - 24);
  for (const m of ['spring', 'summer', 'autumn', 'winter']) {
    const s = SUN[o][m]; let x = ins.left + s.x * cw;
    if (!portrait) x = Math.max(x, bx + s.size * 0.5);
    sun[m] = { x, y: ins.top + s.y * skyH, size: s.size, a: s.a };
  }
  const mo = MOON[o], moon = { x: ins.left + mo.x * cw, y: ins.top + mo.y * skyH, size: mo.size };
  const clouds = portrait
    ? { y0: ins.top + 0.17 * H, y1: Math.max(ins.top + 0.17 * H + 40, landY - 170), y2: landY - 40, s: 0.62 }
    : { y0: ins.top + 40, y1: Math.min(ins.top + 200, landY - 20), y2: landY, s: 0.6 };
  return { W, H, portrait, tall, groundY, floorY, kp, far, mid, ground, landY, sky, sun, moon, clouds };
}
/** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }
/** Bao's cushion rect from world.layout.bao {x, y (FEET), h}: art 300×120, anchor (150, 30) on the feet, k = h / 220. */
function cushionRect(bao) { const k = bao.h / 220; return { x: bao.x - 150 * k, y: bao.y - 30 * k, w: 300 * k, h: 120 * k, k }; }
/** Draw the environment for season m (steps 0–5 of the recipe). img(name) → a drawable for 'env/far_spring' etc. (an
 *  Image or a pre-scaled canvas from PB.Assets.exact). opt = { part: 'all'|'back'|'front', clouds: [{kind:'a'|'b', x, y,
 *  s}] (centres, from weather.clouds), cloudImg(kind, m) → tinted drawable (optional), alpha }. Pure canvas. */
function drawEnv(g, L, m, img, opt) {
  opt = opt || {};
  const W = L.W, H = L.H, part = opt.part || 'all', R = RECIPE_TABLES;
  g.save(); if (opt.alpha != null) g.globalAlpha = opt.alpha;
  const a0 = g.globalAlpha;
  const tile = (name, Ly) => { const im = img(name); for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(im, Math.floor(x), Math.round(Ly.y), Math.ceil(Ly.w) + 1, Math.round(Ly.h)); };
  if (part !== 'front') {
    // 0 sky
    const gr = g.createLinearGradient(0, L.sky.y0, 0, L.sky.y1);
    for (const [o, c] of R.SKY[m]) gr.addColorStop(o, c);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // 1 sun + glow
    const sn = L.sun[m], warm = m === 'autumn' ? '255,214,170' : '255,248,220';
    const glow = g.createRadialGradient(sn.x, sn.y, sn.size * 0.2, sn.x, sn.y, sn.size * 1.3);
    glow.addColorStop(0, `rgba(${warm},0.45)`); glow.addColorStop(1, `rgba(${warm},0)`);
    g.fillStyle = glow; g.beginPath(); g.arc(sn.x, sn.y, sn.size * 1.3, 0, 7); g.fill();
    g.globalAlpha = a0 * sn.a; g.drawImage(img('env/sun'), sn.x - sn.size / 2, sn.y - sn.size / 2, sn.size, sn.size); g.globalAlpha = a0;
    // 2 clouds
    const cc = R.CLOUDS[m];
    for (const c of opt.clouds || []) {
      const im = opt.cloudImg ? opt.cloudImg(c.kind, m) : img('env/cloud_' + c.kind), w = 300 * c.s, h = 140 * c.s;
      g.globalAlpha = a0 * cc.alpha; g.drawImage(im, c.x - w / 2, c.y - h / 2, w, h);
    }
    g.globalAlpha = a0;
    // 3 far, 4 mid
    tile('env/far_' + m, L.far); tile('env/mid_' + m, L.mid);
  }
  if (part !== 'back') {
    // 5 ground + fill below
    tile('env/ground_' + m, L.ground);
    if (L.ground.fillY < H) { g.fillStyle = R.GROUND_BOTTOM[m]; g.fillRect(0, Math.floor(L.ground.fillY) - 1, W, H - L.ground.fillY + 2); }
  }
  g.restore();
}
// the colour tables drawEnv reads (render.js: `const RECIPE_TABLES = RECIPE;` after pasting the RECIPE literal)
const RECIPE_TABLES = { SKY: ENV.SKY, GROUND_BOTTOM: ENV.GROUND_BOTTOM, CLOUDS };

const RECIPE = {
  SEASONS: ENV.SEASONS,             // ['spring','summer','autumn','winter'] = weather 0..3
  SKY: ENV.SKY,                     // { season: [[0, top], [1, bottom]] } from y 0 to L.sky.y1 (DESIGN §3 exact)
  GROUND_BOTTOM: ENV.GROUND_BOTTOM, // fill colour below the ground tile
  CLOUD: ENV.CLOUD,                 // cloud tones per season {hi, base, shade, deep, ol} (for code-drawn puffs / Talk bg)
  HAZE: ENV.HAZE,                   // the far-distance haze colour per season (for code-drawn distant things)
  SUN, MOON, CLOUDS, PARTICLES,
  TILES: { far: [1200, 720], mid: [1200, 300], ground: [1200, 260], cushion: [300, 120, 150, 30] },   // [w, h, (anchor)]
  GROUND_ROWS: { top: ENV.GROUND_TOP, floor: ENV.GROUND_ROW, calm: ENV.CALM },   // ground tile rows
  envLayout, tileXs, cushionRect, drawEnv,
};
module.exports = { RECIPE, envLayout, tileXs, cushionRect, drawEnv };
if (require.main !== module) return;

// ----------------------------------------------------------------------------------------------------- previews
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');
const SEASONS = ENV.SEASONS;
const PARTS = ['mote', 'sparkle', 'star', 'petal', 'blossom', 'butterfly', 'leaf', 'snow', 'glint', 'confetti_a', 'confetti_b', 'dot', 'mist', 'firefly', 'dust', 'feather'];
const NAMES = ['env/sun', 'env/moon', 'env/cloud_a', 'env/cloud_b', ...SEASONS.flatMap(s => ['far', 'mid', 'ground', 'cushion'].map(l => `env/${l}_${s}`)), ...PARTS.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const PAL = { red: ['#E84A4A', '#A8282E', '#F7A0A0'], blue: ['#3C8DE8', '#1F5BA8', '#A6CCF5'], yellow: ['#FFD23F', '#C99A12', '#FFEB9C'], green: ['#4CC26B', '#2A8343', '#A8E6B8'], orange: ['#FF9A2E', '#C4650C', '#FFCB8E'], purple: ['#8E44AD', '#6840A8', '#D2BDF3'], pink: ['#FF8FC0', '#C9558A', '#FFCCE2'] };
const COLS = { spring: ['red', 'blue', 'yellow', 'green', 'pink'], summer: ['orange', 'purple', 'yellow', 'green', 'blue'], autumn: ['blue', 'red', 'orange', 'purple', 'yellow'], winter: ['red', 'purple', 'blue', 'yellow', 'pink'] };
const RAINBOW = ['#F6A6A6', '#F8C49A', '#F7E19A', '#B9E3A8', '#A9D2F2', '#B9B2EE', '#E2B6E8'];

// placeholder world layout per DESIGN §2 (zero insets, age 4) — only for judging the previews
function uiLayout(W, H) {
  const portrait = H > W, tall = H / W > 1.6, groundY = H - (portrait ? 26 : 14);
  const bubble = portrait ? { x: 24, y: 110, w: W - 48, h: 124 } : { x: 24, y: 18, w: Math.min(560, W - 224), h: 134 };
  const hud = { x: W - 160, y: 16, w: 144, h: 64 };
  const bao = portrait ? { x: 120, y: groundY - 4, h: 220 } : { x: 130, y: groundY - 4, h: 240 };
  bao.box = { x: bao.x - bao.h * 0.42, y: bao.y - bao.h, w: bao.h * 0.84, h: bao.h };
  let d = 150; if (tall) d = 165;
  const bb = bubble.y + bubble.h;
  const field = portrait
    ? { x0: 0.55 * d + 20, x1: W - 0.55 * d - 20, y0: bb + 0.55 * d + 20, y1: bao.box.y - 0.5 * d - 10 }
    : { x0: bao.box.x + bao.box.w + 0.55 * d, x1: W - 0.55 * d - 20, y0: bb + 0.55 * d + 16, y1: groundY - 0.55 * d - 30 };
  const cx = (field.x0 + field.x1) / 2, r = Math.min(0.5 * (field.x1 - field.x0) + 0.4 * d, groundY - bb - 30);
  const rainbow = { cx, cy: groundY + 30, r, w: Math.max(40, Math.min(70, 0.16 * r)) };
  // 5 homes, farthest-point sampling (deterministic)
  let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const cand = []; for (let i = 0; i < 400; i++) cand.push([field.x0 + rnd() * (field.x1 - field.x0), field.y0 + rnd() * (field.y1 - field.y0)]);
  const homes = [cand[0]];
  while (homes.length < 5) { let best = null, bd = -1; for (const c of cand) { const dd = Math.min(...homes.map(h => Math.hypot(h[0] - c[0], h[1] - c[1]))); if (dd > bd) { bd = dd; best = c; } } homes.push(best); }
  return { portrait, groundY, bubble, hud, bao, field, d, rainbow, homes };
}

function pageScene({ season, W, H, L, U, src, cols, rainbowCols, fns, parts }) {
  const cushionRectF = new Function('return ' + fns.cushionRect)();
  const drawEnv = new Function('RECIPE_TABLES', 'tileXs', 'return ' + fns.drawEnv)(fns.tables, new Function('return ' + fns.tileXs)());
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    // clouds (tinted offscreen copies), placed in the band like weather would
    const cc = fns.tables.CLOUDS[season];
    const tinted = {};
    const cloudImg = kind => { if (tinted[kind]) return tinted[kind]; const o = document.createElement('canvas'); o.width = 300; o.height = 140; const x = o.getContext('2d'); x.drawImage(im['env/cloud_' + kind], 0, 0); if (cc.tint) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = cc.tint; x.fillRect(0, 0, 300, 140); } return (tinted[kind] = o); };
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const clouds = [];
    for (let i = 0; i < cc.n; i++) clouds.push({ kind: i % 2 ? 'b' : 'a', s: L.clouds.s * (0.8 + 0.4 * rnd()), x: (i + 0.3 + rnd() * 0.4) * W / cc.n, y: L.clouds.y0 + rnd() * (L.clouds.y1 - L.clouds.y0) });
    if (L.portrait) clouds.push({ kind: 'b', s: L.clouds.s * 0.8, x: W * 0.3, y: (L.clouds.y1 + L.clouds.y2) / 2 });
    const img = n => im[n];
    drawEnv(g, L, season, img, { part: 'back', clouds, cloudImg });
    // back particles
    const pk = parts[season];
    for (let i = 0; i < 10; i++) { const name = pk.back[i % pk.back.length], s = 16 + (i % 4) * 5, x = ((i * 0.618 + 0.1) % 1) * W, y = ((i * 0.37 + 0.12) % 1) * L.floorY; g.globalAlpha = 0.85; g.drawImage(im['particles/' + name], x, y, s, s); }
    g.globalAlpha = 1;
    // contrast samples: background under the bubble field (env only: before rainbow, bubbles, Bao)
    const F = U.field, d = U.d, samples = [];
    const sc = document.createElement('canvas'); sc.width = W; sc.height = H; const sg = sc.getContext('2d'); sg.drawImage(c, 0, 0); drawEnv(sg, L, season, img, { part: 'front' }); const dat = sg.getImageData(0, 0, W, H).data;
    for (let y = F.y0 - d * 0.4; y <= F.y1 + d * 0.4; y += 24) for (let x = F.x0 - d * 0.4; x <= F.x1 + d * 0.4; x += 24) {
      const i = (Math.round(y) * W + Math.round(x)) * 4; samples.push([dat[i], dat[i + 1], dat[i + 2]]);
    }
    // ---- rainbow (fake, ~4 of 7 pieces painted: angle fill from the left foot)
    const rb = U.rainbow, bw = rb.w / 7, filled = 4 / 7;
    for (let i = 0; i < 7; i++) {
      const rr = rb.r - bw * (i + 0.5);
      g.lineWidth = bw + 0.6; g.lineCap = 'butt';
      g.globalAlpha = 0.75; g.strokeStyle = rainbowCols[i]; g.beginPath(); g.arc(rb.cx, rb.cy, rr, Math.PI, Math.PI + Math.PI * filled); g.stroke();
    }
    g.globalAlpha = 0.25; g.strokeStyle = '#FFFFFF'; g.lineWidth = 4; g.setLineDash([2, 12]); g.lineCap = 'round';
    for (const rr of [rb.r - 2, rb.r - rb.w + 2]) { g.beginPath(); g.arc(rb.cx, rb.cy, rr, Math.PI + Math.PI * filled, Math.PI * 2); g.stroke(); }
    g.setLineDash([]); g.globalAlpha = 1;
    // ---- ground (front part)
    drawEnv(g, L, season, img, { part: 'front' });
    // ---- cushion + Bao placeholder (white round panda, charcoal patches, cream bandana)
    const B = U.bao, cr = cushionRectF(B), k = cr.k;
    g.drawImage(im['env/cushion_' + season], cr.x, cr.y, cr.w, cr.h);
    const el = (x, y, rx, ry, fill, st) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fillStyle = fill; g.fill(); if (st) { g.lineWidth = 4 * k; g.strokeStyle = st; g.stroke(); } };
    const h = B.h;
    el(B.x - h * 0.2, B.y - h * 0.06, h * 0.1, h * 0.07, '#3A3640', '#24212A'); el(B.x + h * 0.2, B.y - h * 0.06, h * 0.1, h * 0.07, '#3A3640', '#24212A');
    el(B.x, B.y - h * 0.26, h * 0.27, h * 0.25, '#FBFAF6', '#8B8794');
    el(B.x - h * 0.2, B.y - h * 0.9, h * 0.08, h * 0.08, '#3A3640', '#24212A'); el(B.x + h * 0.2, B.y - h * 0.9, h * 0.08, h * 0.08, '#3A3640', '#24212A');
    el(B.x, B.y - h * 0.66, h * 0.27, h * 0.24, '#FBFAF6', '#8B8794');
    el(B.x - h * 0.1, B.y - h * 0.68, h * 0.06, h * 0.075, '#3A3640'); el(B.x + h * 0.1, B.y - h * 0.68, h * 0.06, h * 0.075, '#3A3640');
    el(B.x - h * 0.09, B.y - h * 0.69, h * 0.025, h * 0.03, '#FFFFFF'); el(B.x + h * 0.11, B.y - h * 0.69, h * 0.025, h * 0.03, '#FFFFFF');
    el(B.x, B.y - h * 0.58, h * 0.03, h * 0.02, '#2B2830');
    g.fillStyle = '#EED9B5'; g.strokeStyle = '#B79E74'; g.lineWidth = 3 * k; g.beginPath(); g.ellipse(B.x, B.y - h * 0.45, h * 0.2, h * 0.04, 0, 0, 7); g.fill(); g.stroke();
    g.strokeStyle = '#8E6B45'; g.lineWidth = 6 * k; g.beginPath(); g.moveTo(B.x + h * 0.22, B.y - h * 0.3); g.lineTo(B.x + h * 0.33, B.y - h * 0.48); g.stroke();
    g.strokeStyle = '#9AA7B0'; g.lineWidth = 5 * k; g.beginPath(); g.arc(B.x + 100 * h / 300, B.y - 172 * h / 300, 26 * h / 300, 0, 7); g.stroke();
    el(B.x - h * 0.22, B.y - h * 0.32, h * 0.07, h * 0.1, '#3A3640', '#24212A'); el(B.x + h * 0.22, B.y - h * 0.32, h * 0.07, h * 0.1, '#3A3640', '#24212A');
    // ---- bubbles: clear film + iridescent rim + highlight, a coloured ball inside (untinted)
    U.homes.forEach(([x, y], i) => {
      const r = d / 2, col = cols[i];
      g.fillStyle = 'rgba(255,255,255,0.13)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      const ig = g.createLinearGradient(x - r, y - r, x + r, y + r);
      ig.addColorStop(0, 'rgba(170,230,245,0.55)'); ig.addColorStop(0.5, 'rgba(205,180,245,0.5)'); ig.addColorStop(1, 'rgba(255,205,170,0.55)');
      g.strokeStyle = ig; g.lineWidth = 5; g.beginPath(); g.arc(x, y, r - 2.5, 0, 7); g.stroke();
      // the thing: a ball in the answer colour
      const br = r * 0.5;
      g.fillStyle = col[0]; g.strokeStyle = col[1]; g.lineWidth = 4; g.beginPath(); g.arc(x, y, br, 0, 7); g.fill(); g.stroke();
      g.fillStyle = col[2]; g.globalAlpha = 0.9; g.beginPath(); g.ellipse(x - br * 0.35, y - br * 0.4, br * 0.28, br * 0.16, -0.6, 0, 7); g.fill(); g.globalAlpha = 1;
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.arc(x, y, r * 0.78, Math.PI * 1.08, Math.PI * 1.42); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.arc(x + r * 0.5, y - r * 0.5, 4, 0, 7); g.fill();
      if (season === 'winter') { g.fillStyle = 'rgba(255,255,255,0.8)'; for (let q = 0; q < 6; q++) { const a = q * 1.1 + 0.4; g.beginPath(); g.arc(x + Math.cos(a) * (r - 3), y + Math.sin(a) * (r - 3), 1.6, 0, 7); g.fill(); } }
    });
    // ---- front particles (few) + UI placeholders
    for (let i = 0; i < 6; i++) { const name = pk.front[i % pk.front.length], s = 18 + (i % 3) * 6, x = ((i * 0.71 + 0.33) % 1) * W, y = ((i * 0.43 + 0.2) % 1) * H * 0.85; g.drawImage(im['particles/' + name], x, y, s, s); }
    const rr = (x, y, w, h, r, fill) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); };
    rr(U.bubble.x, U.bubble.y, U.bubble.w, U.bubble.h, 26, 'rgba(255,255,255,0.93)');
    rr(U.hud.x, U.hud.y, U.hud.w, U.hud.h, 20, 'rgba(255,255,255,0.9)');
    return { url: c.toDataURL('image/png'), samples };
  })();
}

function pageSeams({ src, list }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    let total = 0; for (const [, w, h] of list) total += h / 2 * (1200 / w) + 12;
    const out = document.createElement('canvas'); out.width = 1800; out.height = Math.ceil(total);
    const o = out.getContext('2d'); o.fillStyle = '#556'; o.fillRect(0, 0, out.width, out.height);
    const scores = []; let y = 0;
    for (const [n, w, h, zy, bg] of list) {
      const im = await load(src[n]);
      const c = document.createElement('canvas'); c.width = 2 * w; c.height = h; const g = c.getContext('2d');
      g.fillStyle = bg; g.fillRect(0, 0, 2 * w, h);
      g.drawImage(im, 0, 0, w, h); g.drawImage(im, w, 0, w, h);
      const d = g.getImageData(0, 0, 2 * w, h).data;
      const col = (x1, x2) => { let t = 0; for (let yy = 0; yy < h; yy++) { const i = (yy * 2 * w + x1) * 4, j = (yy * 2 * w + x2) * 4; for (let q = 0; q < 3; q++) t += Math.abs(d[i + q] - d[j + q]); } return t / h; };
      const seam = col(w - 1, w); let sum = 0; for (let x = 50; x < w - 50; x++) sum += col(x, x + 1);
      const avg = sum / (w - 100);
      scores.push(`${n.padEnd(22)} seam=${seam.toFixed(2)} interiorAvg=${avg.toFixed(2)} ${seam <= Math.max(1.5, avg * 3) ? 'OK' : 'CHECK'}`);
      const dh = h / 2 * (1200 / w);
      o.drawImage(c, 0, y, 1200, dh);
      o.save(); o.setLineDash([6, 6]); o.strokeStyle = 'red'; o.lineWidth = 1.5; o.beginPath(); o.moveTo(600, y); o.lineTo(600, y + dh); o.stroke(); o.restore();
      const zh = Math.min(h, dh / 4);
      o.imageSmoothingEnabled = false; o.drawImage(c, w - 74, Math.max(0, Math.min(h - zh, zy)), 148, zh, 1210, y, 592, zh * 4 > dh ? dh : zh * 4); o.imageSmoothingEnabled = true;
      o.save(); o.setLineDash([8, 6]); o.strokeStyle = 'red'; o.lineWidth = 2; o.beginPath(); o.moveTo(1506, y); o.lineTo(1506, y + dh); o.stroke(); o.restore();
      y += dh + 12;
    }
    return { url: out.toDataURL('image/png'), scores };
  })();
}

function pageSheet({ src, parts, seasons, skies, grounds }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const c = document.createElement('canvas'); c.width = 1760; c.height = 980; const g = c.getContext('2d');
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, 1760, 980);
    // particles on each season's sky (rows)
    seasons.forEach((m, j) => { const gr = g.createLinearGradient(0, j * 110, 0, j * 110 + 110); gr.addColorStop(0, skies[m][0][1]); gr.addColorStop(1, skies[m][1][1]); g.fillStyle = gr; g.fillRect(0, j * 110, 1760, 110); });
    let x = 14;
    for (const p of parts) { const im = await load(src['particles/' + p]); for (let j = 0; j < 4; j++) p === 'mist' ? g.drawImage(im, x - 20, j * 110 + 25, 128, 64) : g.drawImage(im, x, j * 110 + 13, 84, 84); x += 108; }
    // cushions per season on their floor colour, sun, moon, clouds
    x = 20;
    for (const m of seasons) {
      g.fillStyle = grounds[m]; g.fillRect(x - 10, 460, 400, 200);
      const gr = g.createLinearGradient(0, 460, 0, 540); gr.addColorStop(0, skies[m][1][1]); gr.addColorStop(1, grounds[m]); g.fillStyle = gr; g.fillRect(x - 10, 460, 400, 80);
      const im = await load(src['env/cushion_' + m]); g.drawImage(im, x + 20, 500, 345, 138);
      g.fillStyle = 'rgba(232,74,74,0.9)'; g.beginPath(); g.arc(x + 20 + 150 * 1.15, 500 + 30 * 1.15, 5, 0, 7); g.fill();   // the anchor
      x += 430;
    }
    x = 20;
    for (const e of ['env/sun', 'env/moon', 'env/cloud_a', 'env/cloud_b']) {
      const im = await load(src[e]); const cl = e.includes('cloud'), w = cl ? 300 : 200, h = cl ? 140 : 200, k = cl ? 1 : 1.1;
      g.fillStyle = e.includes('moon') ? '#B7C8E4' : '#86C9F0'; g.fillRect(x - 6, 700, w * k + 12, 240); g.drawImage(im, x, 710 + (cl ? 40 : 0), w * k, h * k); x += w * k + 40;
    }
    return c.toDataURL('image/png');
  })();
}

// relative luminance contrast (WCAG formula) + a crude RGB distance (hue pop)
const lum = rgb => { const a = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const dE = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
const chroma = c => Math.max(...c) - Math.min(...c);

(async () => {
  fs.mkdirSync(ART, { recursive: true });
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent('<html><body style="margin:0"></body></html>');
  const save = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  const only = process.argv[2];
  const fns = { drawEnv: drawEnv.toString(), tileXs: tileXs.toString(), cushionRect: cushionRect.toString(), tables: RECIPE_TABLES };
  const rows = [];
  for (const [W, H] of VPS) for (const m of SEASONS) {
    const vp = `${W}x${H}`; if (only && !`${vp}_${m}`.includes(only)) continue;
    const U = uiLayout(W, H), L = envLayout(W, H, null, U.groundY);
    const cols = COLS[m].map(k => PAL[k]);
    const r = await pg.evaluate(pageScene, { season: m, W, H, L, U, src: SRC, cols, rainbowCols: RAINBOW, fns, parts: PARTICLES });
    save(r.url, path.join(ART, `env_${vp}_${m}.png`));
    // answer colour vs background: min WCAG (with the colour's DARK outline too) and min RGB distance over the field
    const s = r.samples, res = {};
    const pct = (arr, p) => arr.slice().sort((x, y) => x - y)[Math.floor(p * (arr.length - 1))];
    for (const [k, [base, dark]] of Object.entries(PAL)) res[k] = { cr: pct(s.map(q => Math.max(cr(hexRgb(base), q), cr(hexRgb(dark), q))), 0.02), d: pct(s.map(q => dE(hexRgb(base), q)), 0.02) };
    rows.push([vp, m, res, Math.max(...s.map(chroma)), Math.min(...s.map(q => lum(q)))]);
    if (m === 'spring') console.log(vp, JSON.stringify({ groundY: L.groundY, floorY: L.floorY, landY: L.landY, sky: L.sky, far: { y: L.far.y, k: +L.far.k.toFixed(3) }, mid: { y: L.mid.y, k: L.mid.k }, ground: { y: L.ground.y, k: L.ground.k, fillY: Math.round(L.ground.fillY) }, sun: L.sun, clouds: L.clouds }));
  }
  if (rows.length) {
    console.log('\nanswer colour vs bubble-field background: 2nd-percentile WCAG contrast (best of base / dark outline) · 2nd-percentile RGB distance of the base fill; bg max chroma, min luminance');
    for (const [vp, m, res, chm, lmin] of rows) console.log(vp.padEnd(9), m.padEnd(7), Object.entries(res).map(([k, v]) => `${k.slice(0, 3)} ${v.cr.toFixed(1)}·${v.d.toFixed(0)}`).join('  '), `| bg chroma ≤ ${chm} lum ≥ ${lmin.toFixed(2)}`);
  }
  if (!only || only === 'sheet') save(await pg.evaluate(pageSheet, { src: SRC, parts: PARTS, seasons: SEASONS, skies: ENV.SKY, grounds: ENV.GROUND_BOTTOM }), path.join(ART, 'env_sheet.png'));
  if (!only || only === 'seams') {
    const last = s => ENV.SKY[s][1][1];
    const list = SEASONS.flatMap(s => [['env/far_' + s, 1200, 720, 420, last(s)], ['env/mid_' + s, 1200, 300, 120, last(s)], ['env/ground_' + s, 1200, 260, 20, ENV.GROUND_BOTTOM[s]]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
