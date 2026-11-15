// Nim's River Hop: woodland-brook environment RECIPE + preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]      (filter e.g. "winter", "720x1556", "seams")
// Writes docs/art/env_scene_<season>_<1556x720|960x720|720x1556>.png and docs/art/env_seams.png, prints a placement check
// (decorations vs stones / Nim / goal / HUD / bubble) and a contrast table (answer colours vs the water behind the stones).
//
// ================================== RECIPE (render.js copies this; all numbers are logical px) ==================
// render.js pastes envLayout / tileXs / drawEnv verbatim (pure, no DOM at load, no requires) plus the RECIPE tables
// (SKY, CLOUDS, SUN, PARTICLES, TILES, K). Same shape as the bubble game's recipe, with these differences:
//   * envLayout(W, H, ins, layout): pass world.layout (needs play.y0, far, bubble, hud). Everything above the banks is
//     anchored to L.bankTop = the top line of the canvas-drawn banks:  landscape  play.y0 − 40  (the brook starts at
//     play.y0 − 30 under the tree line);  portrait  far.y − 6.  The mid tile row MID_BANK = 262 lands on L.bankTop (its
//     meadow band 244…300 is the bank-grass colour, so the banks continue it seamlessly); the far tile row 700 lands on mid
//     row 248 (hidden behind the meadow).
//   * No ground / cushion layers any more. drawEnv(…, {part: 'back'}) = sky, sun, clouds, far, mid; 'front' draws nothing
//     (kept for API compatibility). Then: back particles → NH.RiverArt.drawRiver → ripples → NH.RiverArt.drawBanks
//     (banks + decorations + far-bank tree) → fruit → stones … (DESIGN §7).
//
//   L = RECIPE.envLayout(W, H, ins, layout)
//   0 sky    : vertical gradient SKY[m] (2 stops, DESIGN §3 exact) from y 0 to L.sky.y1 (= L.bankTop); fillRect the screen.
//   1 sun    : L.sun[m] = {x, y, size, a}: env/sun.svg (200×200) centred, drawn size = .size, alpha .a, plus a soft radial
//              glow (r = 1.3·size, rgba(255,248,220,0.45) → 0; autumn rgba(255,214,170,0.45)). Placed in the sky gap
//              between the speech bubble and the HUD (landscape) / left of the HUD above the bubble (portrait).
//   2 clouds : env/cloud_a|b (300×140, white art) × L.clouds.s, centre y ∈ [L.clouds.y0, L.clouds.y1], CLOUDS[m] =
//              {n, alpha, tint} (tint = 'source-atop' overlay on an offscreen copy, null = as is).
//   3 far    : tile far_m (L.far.w × L.far.h) at x ∈ tileXs(L.far.x0, L.far.w, W), top y = L.far.y.
//   4 mid    : tile mid_m at L.mid (same tiling).
//   Scale rule (skill rule): background k = K[layer] × kp, kp = 1 landscape, 1.15 portrait, 1.36 tall portrait (H/W > 1.6).
//   K = {far: 0.6, mid: 0.62}. Every layer is uniformly scaled → NH.Assets.exact(name, round(w·k), round(h·k)) once per size.
//   Season crossfade (2.5 s): draw the old season's stack, then the new one with globalAlpha = mix (drawEnv opt.alpha,
//   RiverArt opt.alpha) — or cache each season's back stack offscreen and crossfade those.
// Landscape H = 720 (play.y0 162): bankTop 122, mid k 0.62 (y −40.4: pine tops ≈ −16, round tops ≈ 40…100), far k 0.6
//   (y −306.6: ridges ≈ 0…80), sky 0…122. Portrait 720×1556 (tall, play.y0 244): bankTop 238, mid k 0.843 (y 17.1),
//   far k 0.816 (y −343), sky 0…238.
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ENV = require('./art_env.js');

const K = { far: 0.6, mid: 0.62 };
// sun: x = fraction of the free sky gap (landscape: between the bubble's right edge and the HUD; portrait: ins.left … HUD
// left edge), y = fraction of the sky height (ins.top … bankTop)
const SUN = {
  landscape: { spring: { x: 0.36, y: 0.42, size: 92, a: 0.95 }, summer: { x: 0.5, y: 0.36, size: 104, a: 1 }, autumn: { x: 0.66, y: 0.5, size: 110, a: 0.95 }, winter: { x: 0.44, y: 0.46, size: 82, a: 0.8 } },
  portrait: { spring: { x: 0.34, y: 0.36, size: 96, a: 0.95 }, summer: { x: 0.5, y: 0.3, size: 108, a: 1 }, autumn: { x: 0.66, y: 0.42, size: 112, a: 0.95 }, winter: { x: 0.42, y: 0.4, size: 86, a: 0.8 } },
};
const CLOUDS = {
  spring: { n: 3, alpha: 0.9, tint: 'rgba(250,236,226,0.3)' },
  summer: { n: 3, alpha: 0.95, tint: null },
  autumn: { n: 2, alpha: 0.85, tint: 'rgba(250,214,180,0.4)' },
  winter: { n: 3, alpha: 0.9, tint: 'rgba(214,224,242,0.35)' },
};
// weather particles per season (names in particles/): back = behind the river / stones, front = in front (few, small)
const PARTICLES = {
  spring: { back: ['petal', 'blossom'], front: ['petal', 'butterfly'], n: 22 },      // petals also land on the water and float (flowDir)
  summer: { back: ['mote', 'glint'], front: ['dragonfly', 'butterfly'], n: 16 },      // 2–3 dragonflies darting above the water
  autumn: { back: ['leaf'], front: ['leaf'], n: 20 },                                 // blown by weather.wind; some float downstream
  winter: { back: ['snow'], front: ['snow', 'sparkle'], n: 40 },
};
const TILES = { far: [1200, 720], mid: [1200, 300], bush: [200, 140, 100, 136], reeds: [120, 160, 60, 156], rock: [120, 80, 60, 76], flowers: [140, 70, 70, 68], tree: [260, 360, 130, 354], dragonfly: [48, 32] };

/** Pure layout of the background for a W × H screen. ins = safe-area insets; layout = world.layout (play, far, bubble, hud). */
function envLayout(W, H, ins, layout) {
  ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
  const portrait = H > W, tall = H / W > 1.6;
  const lay = layout || {};
  const play = lay.play || { y0: portrait ? 244 : 162 };
  const bankTop = Math.round(portrait ? (lay.far ? lay.far.y : play.y0) - 6 : play.y0 - 40);
  const kp = portrait ? (tall ? 1.36 : 1.15) : 1;            // skill rule: background layers ×1.36 on tall portrait
  const kf = 0.6 * kp, km = 0.62 * kp;
  const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(W * 0.5 - 600 * km), y: bankTop - 262 * km };
  const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(W * (portrait ? 0.55 : 0.6) - 780 * kf), y: mid.y + 248 * km - 700 * kf };
  const sky = { y0: 0, y1: bankTop };
  const o = portrait ? 'portrait' : 'landscape', sun = {};
  const hud = lay.hud || { x: W - ins.right - 160, y: ins.top + 16, w: 144, h: 64 };
  const bub = lay.bubble || (portrait ? { x: 24, y: ins.top + 110, w: W - 48, h: 124 } : { x: ins.left + 24, y: ins.top + 18, w: Math.min(560, W - 224), h: 134 });
  const gx0 = portrait ? ins.left + 10 : bub.x + bub.w + 10, gx1 = hud.x - 10;
  const skyH = Math.max(40, (portrait ? bub.y : bankTop) - ins.top);
  for (const m of ['spring', 'summer', 'autumn', 'winter']) {
    const s = SUN[o][m];
    const x = gx1 - gx0 > s.size ? gx0 + s.size * 0.5 + s.x * (gx1 - gx0 - s.size) : ins.left + s.x * (W - ins.left - ins.right);
    sun[m] = { x, y: ins.top + s.y * skyH, size: s.size, a: s.a };
  }
  const clouds = { y0: ins.top + 24, y1: Math.max(ins.top + 40, (portrait ? bub.y : bankTop) - 50), s: portrait ? 0.46 : 0.4 };
  return { W, H, portrait, tall, kp, bankTop, far, mid, sky, sun, clouds };
}
/** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }
/** Draw the background for season m. img(name) → a drawable for 'env/far_spring' etc. (Image or NH.Assets.exact canvas).
 *  opt = { part: 'all'|'back'|'front', clouds: [{kind:'a'|'b', x, y, s, a?}] (centres, from weather.clouds),
 *  cloudImg(kind, m) → tinted drawable (optional), alpha }. Pure canvas. */
function drawEnv(g, L, m, img, opt) {
  opt = opt || {};
  const W = L.W, H = L.H, part = opt.part || 'all', R = RECIPE_TABLES;
  if (part === 'front') return;   // the banks are NH.RiverArt.drawBanks now
  g.save(); if (opt.alpha != null) g.globalAlpha = opt.alpha;
  const a0 = g.globalAlpha;
  const tile = (name, Ly) => { const im = img(name); if (!im) return; for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(im, Math.floor(x), Math.round(Ly.y), Math.ceil(Ly.w) + 1, Math.round(Ly.h)); };
  // 0 sky (the bottom stop continues below bankTop; the mid meadow + banks cover it)
  const gr = g.createLinearGradient(0, L.sky.y0, 0, L.sky.y1);
  for (const [o, c] of R.SKY[m]) gr.addColorStop(o, c);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // 1 sun + glow
  const sn = L.sun[m], warm = m === 'autumn' ? '255,214,170' : '255,248,220';
  const glow = g.createRadialGradient(sn.x, sn.y, sn.size * 0.2, sn.x, sn.y, sn.size * 1.3);
  glow.addColorStop(0, `rgba(${warm},0.45)`); glow.addColorStop(1, `rgba(${warm},0)`);
  g.fillStyle = glow; g.beginPath(); g.arc(sn.x, sn.y, sn.size * 1.3, 0, 7); g.fill();
  const si = img('env/sun'); if (si) { g.globalAlpha = a0 * sn.a; g.drawImage(si, sn.x - sn.size / 2, sn.y - sn.size / 2, sn.size, sn.size); g.globalAlpha = a0; }
  // 2 clouds
  const cc = R.CLOUDS[m];
  for (const c of opt.clouds || []) {
    const im = opt.cloudImg ? opt.cloudImg(c.kind, m) : img('env/cloud_' + c.kind), w = 300 * c.s, h = 140 * c.s;
    if (!im) continue;
    g.globalAlpha = a0 * cc.alpha * (c.a == null ? 1 : c.a); g.drawImage(im, c.x - w / 2, c.y - h / 2, w, h);
  }
  g.globalAlpha = a0;
  // 3 far, 4 mid
  tile('env/far_' + m, L.far); tile('env/mid_' + m, L.mid);
  g.restore();
}
// the colour tables drawEnv reads (render.js: `const RECIPE_TABLES = RECIPE;` after pasting the RECIPE literal)
const RECIPE_TABLES = { SKY: ENV.SKY, CLOUDS };

const RECIPE = {
  SEASONS: ENV.SEASONS,        // ['spring','summer','autumn','winter'] = weather 0..3
  SKY: ENV.SKY,                // { season: [[0, top], [1, bottom]] } from y 0 to L.sky.y1 (DESIGN §3 exact)
  HAZE: ENV.HAZE,              // far-distance haze per season (code-drawn distant things, Talk-time backdrop)
  BANK: ENV.BANK,              // bank grass tones per season {grass, light, dark, tuft} (title / Talk backdrop)
  K, SUN, CLOUDS, PARTICLES, TILES,
  ROWS: { midBank: ENV.MID_BANK, midBand: ENV.MID_BAND, midFar: ENV.MID_FAR, farBase: ENV.FAR_BASE },
  envLayout, tileXs, drawEnv,
};
module.exports = { RECIPE, envLayout, tileXs, drawEnv };
if (require.main !== module) return;

// ----------------------------------------------------------------------------------------------------- previews
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');
const SEASONS = ENV.SEASONS;
const PARTS = ['petal', 'blossom', 'butterfly', 'mote', 'glint', 'dragonfly', 'leaf', 'snow', 'sparkle'];
const NAMES = ['env/sun', 'env/cloud_a', 'env/cloud_b', 'env/rock', ...SEASONS.flatMap(s => ['far', 'mid', 'bush', 'reeds', 'flowers', 'tree'].map(l => `env/${l}_${s}`)), ...PARTS.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const PAL = { red: ['#E84A4A', '#A8282E', '#F7A0A0'], blue: ['#3C8DE8', '#1F5BA8', '#A6CCF5'], yellow: ['#FFD23F', '#C99A12', '#FFEB9C'], green: ['#4CC26B', '#2A8343', '#A8E6B8'], orange: ['#FF9A2E', '#C4650C', '#FFCB8E'], purple: ['#8E44AD', '#6840A8', '#D2BDF3'] };
const COLS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'blue', 'red', 'yellow'];

/** a fake world layout per DESIGN §2 (zero insets, age 4: S 150 shrinking until 3 rows fit) */
function fakeLayout(W, H) {
  const portrait = H > W, tall = H / W > 1.6, phone = Math.max(W, H) / Math.min(W, H) > 1.9;
  const ins = { top: 0, left: 0, right: 0, bottom: 0 };
  const bubble = portrait ? { x: 24, y: 110, w: W - 48, h: 124 } : { x: 24, y: 18, w: Math.min(560, W - 224), h: 134 };
  const hud = { x: W - 160, y: 16, w: 144, h: 64 };
  const play = { x0: 0, y0: bubble.y + bubble.h + 10, x1: W, y1: H - (portrait ? 26 : 14) };
  let near, far, river, nimHome, goal, nimH;
  if (!portrait) {
    near = { x: 0, y: play.y0, w: 230, h: H - play.y0 }; far = { x: W - 210, y: play.y0, w: 210, h: H - play.y0 };
    river = { x: 230, y: play.y0, w: W - 440, h: H - play.y0 };
    nimHome = { x: 120, y: (play.y0 + play.y1) / 2 + 40 }; goal = { x: W - 120, y: nimHome.y }; nimH = 190;
  } else {
    const nearH = 250 * (tall ? 1.2 : 1);
    near = { x: 0, y: H - nearH, w: W, h: nearH }; far = { x: 0, y: play.y0, w: W, h: 220 };
    river = { x: 0, y: far.y + far.h, w: W, h: near.y - far.y - far.h };
    nimHome = { x: W / 2 - 60, y: near.y + 0.62 * near.h }; goal = { x: W / 2 + 60, y: far.y + 0.38 * far.h }; nimH = phone ? 210 : 180;
  }
  const k = 3, m = 3;
  const span = portrait ? river.h : river.w;
  let S = 150; while (S > 116 && span / (k + 1) < (portrait ? S * 0.5 + 0.62 * S + 30 : S * 0.62 + 40)) S -= 2;
  const itemH = 0.62 * S, rowPos = [];
  for (let j = 0; j < k; j++) rowPos.push(portrait ? near.y - (j + 1) * span / (k + 1) : river.x + (j + 1) * span / (k + 1));
  const stones = [];
  let s = 5; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let j = 0; j < k; j++) for (let i = 0; i < m; i++) {
    const c0 = portrait ? 0.55 * S : play.y0 + 0.5 * itemH + 20, c1 = portrait ? W - 0.55 * S : H - 70;
    const c = c0 + (i + 0.5) / m * (c1 - c0) + (rnd() - 0.5) * 36;
    stones.push(portrait ? { x: c, y: rowPos[j], row: j } : { x: rowPos[j], y: c, row: j });
  }
  return { W, H, ins, portrait, tall, phone, ax: portrait ? { x: 0, y: -1 } : { x: 1, y: 0 }, bubble, hud, play, near, far, river, nimHome, goal, nimH, S, itemH, rows: k, rowPos, stones };
}

function pageScene({ season, W, H, L, E, src, cols, parts, fns }) {
  const drawEnv = new Function('RECIPE_TABLES', 'tileXs', 'return ' + fns.drawEnv)(fns.tables, new Function('return ' + fns.tileXs)());
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    window.NH.Assets = { img: k => im[k] || null };
    window.NH.RiverArt._reset();
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const cc = fns.tables.CLOUDS[season];
    const cloudImg = kind => { const o = document.createElement('canvas'); o.width = 300; o.height = 140; const x = o.getContext('2d'); x.drawImage(im['env/cloud_' + kind], 0, 0); if (cc.tint) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = cc.tint; x.fillRect(0, 0, 300, 140); } return o; };
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const clouds = []; for (let i = 0; i < cc.n; i++) clouds.push({ kind: i % 2 ? 'b' : 'a', s: E.clouds.s * (0.8 + 0.4 * rnd()), x: (i + 0.3 + rnd() * 0.4) * W / cc.n, y: E.clouds.y0 + rnd() * (E.clouds.y1 - E.clouds.y0) });
    drawEnv(g, E, season, n => im[n], { part: 'back', clouds, cloudImg });
    const RA = window.NH.RiverArt;
    RA.drawRiver(g, L, 3.7, season, { quality: 1 });
    // contrast samples on the water around the stones (before banks / stones)
    const dat = g.getImageData(0, 0, W, H).data, samples = [];
    for (const st of L.stones) for (let q = 0; q < 16; q++) { const a = q / 16 * 6.283, x = Math.round(st.x + Math.cos(a) * L.S * 0.62), y = Math.round(st.y + 0.1 * L.S + Math.sin(a) * L.S * 0.32); if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = (y * W + x) * 4; samples.push([dat[i], dat[i + 1], dat[i + 2]]); }
    RA.drawBanks(g, L, season, {});
    // fruit at the goal
    const gl = L.goal; g.fillStyle = '#E77A6E'; g.strokeStyle = '#A84A40'; g.lineWidth = 3; g.beginPath(); g.arc(gl.x, gl.y - 26, 24, 0, 7); g.fill(); g.stroke();
    // stones (grey ellipses) with an answer-coloured ball on each, back to front
    const S = L.S, st = L.stones.slice().sort((p, q) => p.y - q.y);
    st.forEach((s0, i) => {
      const x = s0.x, y = s0.y;
      g.fillStyle = 'rgba(30,58,64,0.25)'; g.beginPath(); g.ellipse(x, y + 0.24 * S, S * 0.56, S * 0.16, 0, 0, 7); g.fill();
      g.fillStyle = '#8E877C'; g.strokeStyle = '#6C665D'; g.lineWidth = 4;
      g.beginPath(); g.ellipse(x, y + 0.2 * S, S * 0.5, S * 0.16, 0, 0, Math.PI); g.lineTo(x - S * 0.5, y); g.ellipse(x, y, S * 0.5, S * 0.18, 0, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = season === 'winter' ? '#F4F7FA' : '#B9B2A6'; g.beginPath(); g.ellipse(x, y, S * 0.5, S * 0.18, 0, 0, 7); g.fill(); g.stroke();
      const col = cols[i % cols.length], r = L.itemH * 0.36;
      g.fillStyle = col[0]; g.strokeStyle = col[1]; g.lineWidth = 4; g.beginPath(); g.arc(x, y - r - 2, r, 0, 7); g.fill(); g.stroke();
      g.fillStyle = col[2]; g.beginPath(); g.ellipse(x - r * 0.35, y - r * 1.4, r * 0.28, r * 0.16, -0.6, 0, 7); g.fill();
    });
    // fake Nim box at nimHome (feet anchor), brown round body
    const nh = L.nimHome, h = L.nimH;
    g.fillStyle = 'rgba(138,90,60,0.92)'; g.strokeStyle = '#4E2F1D'; g.lineWidth = 4; g.beginPath(); g.roundRect(nh.x - h * 0.42, nh.y - h * 0.8, h * 0.84, h * 0.8, h * 0.35); g.fill(); g.stroke();
    g.fillStyle = '#F6E3C8'; g.beginPath(); g.ellipse(nh.x + h * 0.18, nh.y - h * 0.42, h * 0.2, h * 0.22, 0, 0, 7); g.fill();
    // front particles (few)
    const pk = parts[season];
    for (let i = 0; i < 6; i++) { const name = pk.front[i % pk.front.length], s = name === 'dragonfly' ? 40 : 18 + (i % 3) * 6, x = ((i * 0.71 + 0.33) % 1) * W, y = E.bankTop + ((i * 0.43 + 0.2) % 1) * (H - E.bankTop) * 0.8; g.drawImage(im['particles/' + name], x, y, s, name === 'dragonfly' ? s * 32 / 48 : s); }
    // UI placeholders
    const rr = (r, fill) => { g.beginPath(); g.roundRect(r.x, r.y, r.w, r.h, 22); g.fillStyle = fill; g.fill(); };
    rr(L.bubble, 'rgba(255,255,255,0.93)'); rr(L.hud, 'rgba(255,255,255,0.9)');
    return { url: c.toDataURL('image/png'), samples, decor: RA.decorRects(L), tree: RA.treeRect(L) };
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
      // show the seam (centre of a 2-tile strip, half size)
      o.drawImage(c, w - 600, 0, 1200, h, 0, y, 1200, h / 2 * 1);
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
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

(async () => {
  fs.mkdirSync(ART, { recursive: true });
  for (const fn of fs.readdirSync(ART)) if (/^env_(\d+x\d+_|sheet)/.test(fn)) fs.unlinkSync(path.join(ART, fn));   // old cloud-land previews
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent('<html><body style="margin:0"></body></html>');
  await pg.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'game/js/river_art.js'), 'utf8') });
  const save = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  const only = process.argv[2];
  const fns = { drawEnv: drawEnv.toString(), tileXs: tileXs.toString(), tables: RECIPE_TABLES };
  const rows = [], issues = [];
  for (const [W, H] of VPS) for (const m of SEASONS) {
    const vp = `${W}x${H}`; if (only && !`${vp}_${m}`.includes(only)) continue;
    const L = fakeLayout(W, H), E = envLayout(W, H, L.ins, L);
    const r = await pg.evaluate(pageScene, { season: m, W, H, L, E, src: SRC, cols: COLS.map(k => PAL[k]), parts: PARTICLES, fns });
    save(r.url, path.join(ART, `env_scene_${m}_${vp}.png`));
    // placement check: decorations never under stones (+ their thing), Nim, the goal, HUD, bubble
    const keep = [{ n: 'hud', ...L.hud }, { n: 'bubble', ...L.bubble },
      { n: 'nim', x: L.nimHome.x - L.nimH * 0.45, y: L.nimHome.y - L.nimH, w: L.nimH * 0.9, h: L.nimH },
      { n: 'goal', x: L.goal.x - 40, y: L.goal.y - 60, w: 80, h: 70 },
      ...L.stones.map((s, i) => ({ n: 'stone' + i, x: s.x - L.S * 0.6, y: s.y - L.itemH - 10, w: L.S * 1.2, h: L.itemH + 0.45 * L.S }))];
    for (const d of r.decor) for (const k of keep) if (hit(d, k)) issues.push(`${vp} ${m}: ${d.kind} @${Math.round(d.x)},${Math.round(d.y)} overlaps ${k.n}`);
    if (r.tree) for (const k of keep) if (k.n !== 'goal' && k.n !== 'nim' && hit({ x: r.tree.x + r.tree.w * 0.15, y: r.tree.y, w: r.tree.w * 0.7, h: r.tree.h }, k)) issues.push(`${vp} ${m}: tree overlaps ${k.n}`);
    const res = {};
    const pct = (arr, p) => arr.slice().sort((x, y) => x - y)[Math.floor(p * (arr.length - 1))];
    for (const [k, [base, dark]] of Object.entries(PAL)) res[k] = { cr: pct(r.samples.map(q => Math.max(cr(hexRgb(base), q), cr(hexRgb(dark), q))), 0.05), d: pct(r.samples.map(q => dE(hexRgb(base), q)), 0.05) };
    rows.push([vp, m, res, r.decor.length]);
  }
  if (rows.length) {
    console.log('answer colour vs the water around the stones: 5th-percentile WCAG contrast (best of base / dark) · RGB distance of the base; decorations placed');
    for (const [vp, m, res, n] of rows) console.log(vp.padEnd(9), m.padEnd(7), Object.entries(res).map(([k, v]) => `${k.slice(0, 3)} ${v.cr.toFixed(1)}·${v.d.toFixed(0)}`).join('  '), `| decor ${n}`);
    console.log(issues.length ? 'PLACEMENT ISSUES:\n  ' + issues.join('\n  ') : 'placement: no decoration / tree overlaps stones, Nim, goal, HUD or bubble');
  }
  if (!only || only === 'seams') {
    const last = s => ENV.SKY[s][1][1];
    const list = SEASONS.flatMap(s => [['env/far_' + s, 1200, 720, last(s)], ['env/mid_' + s, 1200, 300, last(s)]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
