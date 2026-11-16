// Moka's Fairy Tea Party: fairy-forest environment RECIPE + preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]      (filter e.g. "rain", "720x1556", "seams", "sheet")
// Writes docs/art/env_<1556x720|960x720|720x1556>_<mood>.png, docs/art/env_seams.png, docs/art/env_sheet.png and prints the
// layout numbers + a contrast table (answer colours vs the background right behind the tea things).
//
// ================================== RECIPE (render.js copies this; all numbers are logical px) ==================
// render.js pastes envLayout / trunkGeom / tileXs verbatim (pure, no DOM, no requires) plus the tables in RECIPE.
//   L = RECIPE.envLayout(W, H, ins, layout.table.y, layout.item)      (pass world.layout values; omitted → DESIGN §2 maths)
//   G = RECIPE.trunkGeom(W, ins, layout.groundY, layout.garland.y, L)  → G.tieL / G.tieR = the garland vine ends:
//       world.layout.garland.x0 = G.tieL.x, x1 = G.tieR.x (world can call trunkGeom too — it is pure).
// The stack is anchored to the TABLE, not to H: the ground tile's horizon row (30) sits at L.horizonY = table.y − 0.92·item,
// so the ground's CALM rows 40…150 lie right behind the tea things and the table (answer colours pop on plain moss).
// Draw order (DESIGN §7), every layer uniformly scaled (FT.Assets.exact(name, round(w·k), round(h·k)) can pre-render once):
//   0 sky     : vertical gradient SKY[m] = [top, bottom] from y 0 to L.skyY1 (= horizonY), bottom colour below.
//   1 sun     : env/sun.svg (200×200) centred at L.sun (x, y), drawn size L.sun.size, alpha SUN_A[m] × ambient.sunA
//               (rain 0). Before far so the trees occlude it. The far tile is shifted so its clearing + sun shafts sit under it.
//   2 rainbow : env/rainbow.svg (1200×600, arc centre (600,600)) at L.rainbow {x, y, w, h} (top-left + size), alpha
//               RAINBOW_A[m] × ambient.rainbow (rainbow mood only). Its base is hidden by the far trees.
//   3 clouds  : env/cloud_a|cloud_b (300×140) ×L.clouds.s (×0.8…1.2 per cloud), centre y ∈ [L.clouds.y0, y1];
//               CLOUDS[m] = {n, alpha, kind 'white'|'rain'}; kind 'rain' → env/cloud_rain ×1.25. Drift with wind.
//   4 far     : tile far_m (L.far.w × L.far.h) at x ∈ tileXs(L.far.x0, L.far.w, W), top y = L.far.y.
//   5 mid     : tile mid_m at L.mid (row 334 = horizon + 4·k).  (breezy: optional skewX sway ≤ 0.01 is fine; not needed)
//   6 ground  : tile ground_m at L.ground (row 30 = L.horizonY); then fillRect(0, L.ground.fillY, W, H − fillY) with
//               GROUND_BOTTOM[m] when fillY < H.
//   7 trunks  : env/trunk_l.svg at G.l {x, y, w, h}, env/trunk_r.svg at G.r (both 220×900 × G.k, bottom anchor (110,900)),
//               then (if TRUNK_TINT[m]) a 'source-atop' overlay of that colour on an offscreen copy (rain darkens them).
//               Tie points in the art: trunk_l (150,140), trunk_r (70,140) → G.tieL / G.tieR on screen (= garland ends).
//   … garland, table, things, Moka … (the env SVGs already carry the mood: do NOT darken them again with
//   ambient.darkness; an ambient.tint overlay over env layers only is fine, never over the tea things).
// Scale rule: k = 1 landscape, ×1.15 portrait, ×1.36 tall portrait (H/W > 1.6) for ground + mid; far k = FAR_K (landscape 0.8, portrait 0.9) × that.
// Mood crossfade: draw both stacks (old at 1, new at the mix alpha) — tiles are opaque below their silhouettes.
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ENV = require('./art_env.js');

const FAR_K = { landscape: 0.8, portrait: 0.9 };   // far tile scale relative to the mid/ground scale
const HORIZON_ITEM = 0.92;  // horizon = table.y − HORIZON_ITEM × item
// sun: x fraction of the safe width (clamped away from the HUD / bubble), y offset below ins.top, drawn size
const SUN = { landscape: { fx: 0.8, dy: 104, size: 150 }, portrait: { fx: 0.6, dy: 58, size: 118 } };
const SUN_A = { sunny: 1, breezy: 0.8, rain: 0, rainbow: 0.9 };
const RAINBOW_A = { sunny: 0, breezy: 0, rain: 0, rainbow: 1 };
const CLOUDS = {
  sunny: { n: 2, alpha: 0.85, kind: 'white' },
  breezy: { n: 3, alpha: 0.9, kind: 'white' },
  rain: { n: 4, alpha: 0.95, kind: 'rain' },
  rainbow: { n: 2, alpha: 0.8, kind: 'white' },
};
const TRUNK_TINT = { sunny: null, breezy: 'rgba(234,242,236,0.08)', rain: 'rgba(66,82,100,0.32)', rainbow: null };

/** Pure layout of the environment for a W × H screen. ins = safe-area insets; tableY / item = world.layout.table.y / item. */
function envLayout(W, H, ins, tableY, item) {
  ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
  const portrait = H > W, tall = H / W > 1.6;
  const groundY = H - ins.bottom - (portrait ? 26 : 14);
  if (item == null) item = 124 * (tall ? 1.12 : 1);
  if (tableY == null) tableY = portrait ? groundY - 6 - 220 - 40 : groundY - 150;
  const kp = portrait ? (tall ? 1.36 : 1.15) : 1;                 // skill rule: background ×1.36 on tall portrait
  const kg = kp, km = kp, kf = FAR_K[portrait ? 'portrait' : 'landscape'] * kp;
  const horizonY = Math.round(tableY - HORIZON_ITEM * item);
  const o = portrait ? 'portrait' : 'landscape', cw = W - ins.left - ins.right;
  // sun first (the far tile is aligned to it)
  const S = SUN[o]; let sx = ins.left + S.fx * cw;
  sx = Math.min(sx, W - ins.right - 170 - S.size / 2);                       // keep clear of the HUD (top-right)
  if (!portrait) sx = Math.max(sx, ins.left + 24 + Math.min(560, W - ins.right - 200 - ins.left - 24) + S.size * 0.45);   // right of the bubble
  const sun = { x: Math.round(sx), y: ins.top + S.dy, size: S.size };
  const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: Math.round(W * 0.5 - 600 * kg), y: horizonY - 30 * kg };
  ground.fillY = ground.y + 258 * kg;
  // mid: the stump house (mid x 840) right of centre in landscape, a bit right in portrait
  const mid = { k: km, w: 1200 * km, h: 340 * km, x0: Math.round(W * (portrait ? 0.62 : 0.7) - 840 * km), y: horizonY + 4 * km - 334 * km };
  // far: its row 690 sits on the mid bank (mid row 306); the clearing / sun-shaft origin (far x 700) under the sun
  const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(sun.x - 700 * kf), y: Math.round(mid.y + 306 * km - 690 * kf) };
  const skyY1 = horizonY;
  // rainbow: arc centre (600,600) of the art at (cx, baseY), outer radius 566·k reaching up to topY
  // centred on the far clearing (far x 680, under the sun): landscape top just below ins.top, portrait below the bubble
  const rcx = portrait ? W * 0.5 : far.x0 + 680 * kf;
  const rk = portrait ? 0.62 * W / 566 : (horizonY - ins.top - 36) / 566, topY = ins.top + (portrait ? 290 : 36);
  const baseY = topY + 566 * rk;
  const rainbow = { x: rcx - 600 * rk, y: baseY - 600 * rk, w: 1200 * rk, h: 600 * rk, k: rk };
  const clouds = portrait
    ? { y0: ins.top + 40, y1: Math.max(ins.top + 90, Math.min(far.y + 140 * kf, ins.top + 0.22 * H)), s: 0.55 }
    : { y0: ins.top + 34, y1: ins.top + 150, s: 0.6 };
  return { portrait, tall, groundY, tableY, item, horizonY, kp, far, mid, ground, skyY1, sun, rainbow, clouds };
}
/** Framing trunks: scaled so the vine tie points (art y 140) land on garlandY and the foot (art y 900) stands on the ground
 *  (landscape: groundY; portrait: just below the horizon); k clamped to [0.5, 1.2]. */
function trunkGeom(W, ins, groundY, garlandY, L) {
  ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
  const footY = L.portrait ? L.horizonY + 16 : groundY;
  const k = Math.max(0.5, Math.min(1.2, (footY - garlandY) / 760));
  const w = 220 * k, h = 900 * k, y = garlandY - 140 * k;
  const axL = ins.left + 36 * k, axR = W - ins.right - 36 * k;             // anchor (art x 110) screen x
  return { k, l: { x: axL - 110 * k, y, w, h }, r: { x: axR - 110 * k, y, w, h },
    tieL: { x: axL + 40 * k, y: garlandY }, tieR: { x: axR - 40 * k, y: garlandY }, footY: y + h };
}
/** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }

const RECIPE = {
  MOODS: ENV.MOODS,                 // ['sunny','breezy','rain','rainbow'] = weather 0..3
  SKY: ENV.SKY,                     // { mood: [top, bottom] } from y 0 to L.skyY1
  MOSS: ENV.MOSS,                   // moss colour at the top of the ground tile (reference / tints)
  GROUND_BOTTOM: ENV.GROUND_BOTTOM, // fill colour below the ground tile
  RIM: ENV.RIM,                     // warm rim-light colour per mood for things (never darken the things)
  TRUNK_TINT,                       // 'source-atop' overlay for the trunks per mood (null = as is)
  TILES: { far: [1200, 720, 690], mid: [1200, 340, 334], ground: [1200, 260, 30] },   // [w, h, anchor row]
  GROUND_ROWS: { horizon: ENV.GROUND_LINE, calm: ENV.CALM },
  TRUNK: ENV.TRUNK,                 // { w 220, h 900, anchor [110,900], tieL [150,140], tieR [70,140] }
  SUN, SUN_A, RAINBOW_A, CLOUDS, FAR_K, HORIZON_ITEM,
  envLayout, trunkGeom, tileXs,
};
module.exports = { RECIPE, envLayout, trunkGeom, tileXs };
if (require.main !== module) return;

// ----------------------------------------------------------------------------------------------------- previews
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');
const MOODS = ENV.MOODS;
const PARTS = ['mote', 'sparkle', 'leaf', 'leaf_b', 'petal', 'raindrop', 'splash', 'puff', 'dust', 'seed', 'confetti_a', 'confetti_b', 'star', 'dot'];
const NAMES = ['env/sun', 'env/rainbow', 'env/cloud_a', 'env/cloud_b', 'env/cloud_rain', 'env/trunk_l', 'env/trunk_r',
  ...MOODS.flatMap(s => ['far', 'mid', 'ground'].map(l => `env/${l}_${s}`)), ...PARTS.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const BOX = [['#E84A4A', '#A8282E'], ['#3C8DE8', '#1F5BA8'], ['#FFD23F', '#C99A12'], ['#4CC26B', '#2A8343']];

// placeholder world layout per DESIGN §2 (zero insets) — only for judging the previews
function uiLayout(W, H) {
  const portrait = H > W, tall = H / W > 1.6, groundY = H - (portrait ? 26 : 14);
  const item = Math.round(124 * (tall ? 1.12 : 1));
  if (!portrait) {
    const bubble = { x: 24, y: 18, w: Math.min(560, W - 224), h: 134 };
    const moka = { x: 120, y: groundY - 10, h: 250 };
    return { portrait, groundY, item, bubble, moka, garlandY: bubble.y + bubble.h + 46, table: { y: groundY - 150, x0: moka.x + 110, x1: W - 60 } };
  }
  const bubble = { x: 24, y: 110, w: W - 48, h: 124 };
  const moka = { x: 110, y: groundY - 6, h: 220 };
  const garlandY = bubble.y + bubble.h + 50;
  return { portrait, groundY, item, bubble, moka, garlandY, table: { y: Math.max(moka.y - moka.h - 40, garlandY + 40 + 260), x0: 50, x1: W - 50 } };
}

function pageScene({ mood, W, H, L, G, U, src, sky, groundBottom, clouds, sunA, bowA, trunkTint, boxes, rain }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  const tileXs = (x0, tw, W) => { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; };
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, L.skyY1); gr.addColorStop(0, sky[0]); gr.addColorStop(1, sky[1]);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    if (sunA) {
      const sn = L.sun, glow = g.createRadialGradient(sn.x, sn.y, sn.size * 0.2, sn.x, sn.y, sn.size * 1.4);
      glow.addColorStop(0, 'rgba(255,250,226,0.5)'); glow.addColorStop(1, 'rgba(255,250,226,0)');
      g.globalAlpha = sunA; g.fillStyle = glow; g.beginPath(); g.arc(sn.x, sn.y, sn.size * 1.4, 0, 7); g.fill();
      g.drawImage(im['env/sun'], sn.x - sn.size / 2, sn.y - sn.size / 2, sn.size, sn.size); g.globalAlpha = 1;
    }
    if (bowA) { const r = L.rainbow; g.globalAlpha = bowA; g.drawImage(im['env/rainbow'], r.x, r.y, r.w, r.h); g.globalAlpha = 1; }
    const cc = clouds[mood];
    for (let i = 0; i < cc.n; i++) {
      const ci = cc.kind === 'rain' ? im['env/cloud_rain'] : im[i % 2 ? 'env/cloud_b' : 'env/cloud_a'];
      const s = L.clouds.s * (0.8 + 0.4 * rnd()) * (cc.kind === 'rain' ? 1.25 : 1), x = (i + 0.3 + rnd() * 0.4) * W / cc.n, y = L.clouds.y0 + rnd() * (L.clouds.y1 - L.clouds.y0);
      g.globalAlpha = cc.alpha; g.drawImage(ci, x - 150 * s, y - 70 * s, 300 * s, 140 * s);
    }
    g.globalAlpha = 1;
    const lay = (name, Ly) => { for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(im[name], x, Ly.y, Ly.w + 0.5, Ly.h); };
    lay('env/far_' + mood, L.far); lay('env/mid_' + mood, L.mid); lay('env/ground_' + mood, L.ground);
    if (L.ground.fillY < H) { g.fillStyle = groundBottom; g.fillRect(0, L.ground.fillY - 1, W, H - L.ground.fillY + 1); }
    // samples for the contrast table: right behind where the things stand (before anything is drawn on top)
    const px = (x, y) => Array.from(g.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3));
    const T = U.table, midx = (T.x0 + T.x1) / 2;
    const samples = { behindTop: px(midx + 23, T.y - U.item * 0.85), behindMid: px(midx + 61, T.y - U.item * 0.45), underTable: px(midx + 17, T.y + 70) };
    // trunks (+ tint)
    for (const [img, b] of [[im['env/trunk_l'], G.l], [im['env/trunk_r'], G.r]]) {
      const off = document.createElement('canvas'); off.width = Math.ceil(b.w); off.height = Math.ceil(b.h); const o2 = off.getContext('2d');
      o2.drawImage(img, 0, 0, b.w, b.h); if (trunkTint) { o2.globalCompositeOperation = 'source-atop'; o2.fillStyle = trunkTint; o2.fillRect(0, 0, b.w, b.h); }
      g.drawImage(off, b.x, b.y);
    }
    // fake garland: quadratic vine between the tie points, sag 40, 4 bud lanterns (2nd one lit)
    const gx0 = G.tieL.x, gx1 = G.tieR.x, gy = U.garlandY, sag = 40;
    g.strokeStyle = '#6E8A4E'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); g.moveTo(gx0, gy); g.quadraticCurveTo((gx0 + gx1) / 2, gy + 2 * sag, gx1, gy); g.stroke();
    for (let i = 0; i < 4; i++) {
      const t = (i + 1) / 5, x = (1 - t) * (1 - t) * gx0 + 2 * (1 - t) * t * (gx0 + gx1) / 2 + t * t * gx1, y = (1 - t) * (1 - t) * gy + 2 * (1 - t) * t * (gy + 2 * sag) + t * t * gy;
      g.strokeStyle = '#6E8A4E'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 34); g.stroke();
      if (i === 1) { const hg = g.createRadialGradient(x, y + 50, 4, x, y + 50, 46); hg.addColorStop(0, 'rgba(255,231,163,0.9)'); hg.addColorStop(1, 'rgba(255,231,163,0)'); g.fillStyle = hg; g.beginPath(); g.arc(x, y + 50, 46, 0, 7); g.fill(); }
      g.fillStyle = i === 1 ? '#FFE7A3' : '#EDE3CC'; g.strokeStyle = '#B9A77E'; g.lineWidth = 2.5; g.beginPath(); g.ellipse(x, y + 50, 15, 18, 0, 0, 7); g.fill(); g.stroke();
    }
    // bubble + HUD placeholders
    const rr = (x, y, w, h, r, fill) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); };
    rr(U.bubble.x, U.bubble.y, U.bubble.w, U.bubble.h, 26, 'rgba(255,255,255,0.93)');
    rr(W - 160, 16, 144, 64, 20, 'rgba(255,255,255,0.9)');
    // fake log table: toadstool legs, plank (x0−30 … x1+30, thickness 46), moss edge, leaf placemats, 4 answer boxes
    const px0 = T.x0 - 30, px1 = T.x1 + 30;
    for (const lx of [T.x0 + 30, T.x1 - 30]) {
      g.fillStyle = '#F3E6CC'; g.strokeStyle = '#B8A684'; g.lineWidth = 3; g.beginPath(); g.roundRect(lx - 16, T.y + 30, 32, U.groundY - T.y - 36, 10); g.fill(); g.stroke();
      g.fillStyle = '#C98C86'; g.strokeStyle = '#94605A'; g.beginPath(); g.ellipse(lx, T.y + 54, 40, 18, 0, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
    }
    g.fillStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.ellipse((px0 + px1) / 2, U.groundY - 4, (px1 - px0) * 0.5, 9, 0, 0, 7); g.fill();
    g.fillStyle = '#A9784E'; g.strokeStyle = '#6E4A2E'; g.lineWidth = 4; g.beginPath(); g.roundRect(px0, T.y, px1 - px0, 46, 20); g.fill(); g.stroke();
    g.fillStyle = '#D2A576'; g.beginPath(); g.roundRect(px0 + 10, T.y + 10, px1 - px0 - 20, 7, 4); g.fill();
    g.fillStyle = '#8DAA6A'; g.strokeStyle = '#5E7C46'; g.lineWidth = 2.5; g.beginPath(); g.roundRect(px0 + 4, T.y - 4, px1 - px0 - 8, 12, 6); g.fill(); g.stroke();
    const n = 4, span = T.x1 - T.x0 - 80, sp = Math.max(1.25 * U.item, Math.min(1.7 * U.item, span / n)), sx0 = (T.x0 + T.x1) / 2 - sp * (n - 1) / 2;
    for (let i = 0; i < n; i++) {
      const x = sx0 + i * sp, s = U.item;
      g.fillStyle = '#B7C98E'; g.strokeStyle = '#7F9560'; g.lineWidth = 3; g.beginPath(); g.ellipse(x, T.y + 1, s * 0.5, 9, 0, 0, 7); g.fill(); g.stroke();
      g.fillStyle = boxes[i][0]; g.strokeStyle = boxes[i][1]; g.lineWidth = 5; g.beginPath(); g.roundRect(x - s * 0.36, T.y - s * 0.86, s * 0.72, s * 0.84, 18); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.ellipse(x - s * 0.18, T.y - s * 0.66, 7, 15, 0.3, 0, 7); g.fill();
    }
    // Moka placeholder (honey-brown sitting bear blob + cream muzzle + scarf)
    const M = U.moka; g.lineWidth = 5; g.strokeStyle = '#6E4422'; g.fillStyle = '#C88A4E';
    g.beginPath(); g.ellipse(M.x, M.y - M.h * 0.27, M.h * 0.28, M.h * 0.27, 0, 0, 7); g.fill(); g.stroke();
    for (const ex of [-0.18, 0.2]) { g.beginPath(); g.arc(M.x + ex * M.h, M.y - M.h * 0.9, M.h * 0.08, 0, 7); g.fill(); g.stroke(); }
    g.beginPath(); g.ellipse(M.x + M.h * 0.02, M.y - M.h * 0.7, M.h * 0.25, M.h * 0.22, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#F4E2C4'; g.beginPath(); g.ellipse(M.x + M.h * 0.1, M.y - M.h * 0.63, M.h * 0.11, M.h * 0.08, 0, 0, 7); g.fill();
    g.fillStyle = '#F4E2C4'; g.strokeStyle = '#6FB7B0'; g.lineWidth = 6; g.beginPath(); g.roundRect(M.x - M.h * 0.2, M.y - M.h * 0.5, M.h * 0.42, M.h * 0.08, 8); g.fill(); g.stroke();
    // a few mood particles
    const pk = { sunny: ['mote', 'seed'], breezy: ['leaf', 'leaf_b', 'petal'], rain: ['raindrop', 'raindrop', 'splash'], rainbow: ['sparkle', 'mote'] }[mood];
    const np = rain ? 60 : 14;
    for (let i = 0; i < np; i++) {
      const name = pk[i % pk.length], p = im['particles/' + name], s = 18 + (i % 4) * 6, x = (i * 0.618 % 1) * W, y = ((i * 0.37 + 0.05) % 1) * H;
      if (name === 'raindrop') { g.globalAlpha = 0.7; g.drawImage(p, x, y, 9, 24); g.globalAlpha = 1; }
      else if (name === 'splash') g.drawImage(p, x, T.y - 22, 26, 26);
      else g.drawImage(p, x, y, s, s);
    }
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

function pageSheet({ src, parts }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const c = document.createElement('canvas'); c.width = 1900; c.height = 1060; const g = c.getContext('2d');
    g.fillStyle = '#FBF6DF'; g.fillRect(0, 0, 1900, 130); g.fillStyle = '#6E7E70'; g.fillRect(0, 130, 1900, 130); g.fillStyle = '#B3C08E'; g.fillRect(0, 260, 1900, 130);
    let x = 20;
    for (const p of parts) { const im = await load(src['particles/' + p]); for (const y0 of [0, 130, 260]) p === 'raindrop' ? g.drawImage(im, x + 30, y0 + 17, 36, 96) : g.drawImage(im, x, y0 + 17, 96, 96); x += 132; }
    // trunks, sun, rainbow, clouds
    g.fillStyle = '#CFE6DA'; g.fillRect(0, 400, 1900, 660);
    const tl = await load(src['env/trunk_l']), tr = await load(src['env/trunk_r']);
    g.drawImage(tl, 20, 410, 140, 573); g.drawImage(tr, 180, 410, 140, 573);
    g.fillStyle = 'red'; for (const [tx, ox] of [[150, 20], [70, 180]]) { g.beginPath(); g.arc(ox + tx * 140 / 220, 410 + 140 * 140 / 220, 4, 0, 7); g.fill(); }
    const sun = await load(src['env/sun']); g.drawImage(sun, 360, 420, 200, 200);
    const bow = await load(src['env/rainbow']); g.fillStyle = '#A9DCEB'; g.fillRect(580, 410, 720, 370); g.drawImage(bow, 590, 420, 700, 350);
    x = 1320; for (const e of ['env/cloud_a', 'env/cloud_b', 'env/cloud_rain']) { const im = await load(src[e]); g.fillStyle = e.includes('rain') ? '#97A9B4' : '#BFE3D0'; g.fillRect(x - 6, 414 + (e.includes('_b') ? 200 : e.includes('rain') ? 400 : 0), 312, 152); g.drawImage(im, x, 420 + (e.includes('_b') ? 200 : e.includes('rain') ? 400 : 0), 300, 140); }
    return c.toDataURL('image/png');
  })();
}

const lum = rgb => { const a = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const dE = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
const PAL = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#8E44AD', pink: '#FF8FC0' };

(async () => {
  fs.mkdirSync(ART, { recursive: true });
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent('<html><body style="margin:0"></body></html>');
  const save = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  const only = process.argv[2];
  const table = [];
  for (const [W, H] of VPS) for (const m of MOODS) {
    const vp = `${W}x${H}`; if (only && !`${vp}_${m}`.includes(only)) continue;
    const U = uiLayout(W, H), L = envLayout(W, H, null, U.table.y, U.item), G = trunkGeom(W, null, U.groundY, U.garlandY, L);
    const r = await pg.evaluate(pageScene, { mood: m, W, H, L, G, U, src: SRC, sky: ENV.SKY[m], groundBottom: ENV.GROUND_BOTTOM[m], clouds: CLOUDS, sunA: SUN_A[m], bowA: RAINBOW_A[m], trunkTint: TRUNK_TINT[m], boxes: BOX, rain: m === 'rain' });
    save(r.url, path.join(ART, `env_${vp}_${m}.png`));
    table.push([vp, m, r.samples]);
    if (m === 'sunny') console.log(vp, JSON.stringify({ horizonY: L.horizonY, tableY: U.table.y, kp: L.kp, far: { y: L.far.y, k: +L.far.k.toFixed(3) }, midY: Math.round(L.mid.y), groundY: Math.round(L.ground.y), fillY: Math.round(L.ground.fillY), sun: L.sun, rainbow: { x: Math.round(L.rainbow.x), y: Math.round(L.rainbow.y), w: Math.round(L.rainbow.w) }, clouds: L.clouds, trunk: { k: +G.k.toFixed(3), tieL: G.tieL, tieR: G.tieR, footY: Math.round(G.footY) } }));
  }
  if (table.length) {
    console.log('\nanswer colours vs background behind the things (WCAG contrast min / crude RGB distance min)');
    for (const [vp, m, s] of table) {
      const bg = [s.behindTop, s.behindMid];
      const minC = Math.min(...Object.values(PAL).flatMap(h => bg.map(q => cr(hexRgb(h), q))));
      const minD = Math.min(...Object.values(PAL).flatMap(h => bg.map(q => dE(hexRgb(h), q))));
      const hx = q => '#' + q.map(v => v.toString(16).padStart(2, '0')).join('');
      console.log(vp.padEnd(9), m.padEnd(8), 'behind', hx(s.behindTop), hx(s.behindMid), 'under', hx(s.underTable), '| minContrast', minC.toFixed(2), 'minRGBdist', minD.toFixed(0), '| green dist', Math.min(...bg.map(q => dE(hexRgb(PAL.green), q))).toFixed(0));
    }
  }
  if (!only || only === 'sheet') save(await pg.evaluate(pageSheet, { src: SRC, parts: PARTS }), path.join(ART, 'env_sheet.png'));
  if (!only || only === 'seams') {
    const list = MOODS.flatMap(s => [['env/far_' + s, 1200, 720, 300, ENV.SKY[s][1]], ['env/mid_' + s, 1200, 340, 200, ENV.SKY[s][1]], ['env/ground_' + s, 1200, 260, 60, ENV.GROUND_BOTTOM[s]]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
