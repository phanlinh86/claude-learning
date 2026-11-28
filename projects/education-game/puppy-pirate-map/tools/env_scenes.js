// Mit's Treasure Map: pirate-cove environment RECIPE + preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]      (filter e.g. "rain", "720x1556", "seams", "sheet")
// Writes docs/art/env_<1556x720|960x720|720x1556>_<mood>.png, docs/art/env_seams.png, docs/art/env_particles.png.
//
// ================================== RECIPE (render.js copies this; all numbers are logical px) ==================
// render.js pastes envLayout / tileXs verbatim (pure, no DOM, no requires) plus the colour tables. CHANGES versus the town
// recipe (what the lead must change in render.js):
//   * MOODS = sunny | breezy | rain | rainbow (weather 0..3) → tiles env/{far,mid,ground,palm}_<mood>.svg.
//   * L.shoreY = the beach line (mid stands on it; streetY / sandY are aliases). L.horizonY = the sea horizon.
//   * SKY: paint the gradient from y 0 to L.skyY1 (= horizonY), last stop below (the sea covers it anyway).
//   * NEW sea fill, drawn right AFTER the far tiles: when L.sea.y1 > L.sea.y0, fill [0, W) × [sea.y0, sea.y1] with a vertical
//     gradient SEA[m].mid → SEA[m].near (the far tile's sea band ends in SEA.mid, so it continues seamlessly down to the
//     beach behind the mid layer). In landscape the far band already reaches behind the beach (y1 ≤ y0 → skip).
//   * PAVE_BOTTOM → SAND_BOTTOM[m] (fill below L.ground.fillY).
//   * NEW palms, drawn after mid and ground (behind Mit / the board / the tray): for each p of L.palms:
//       translate(p.x, p.y); rotate(wind × 0.08 + idle sway); scale(p.flip ? −p.s : p.s, p.s); drawImage(palm_<m>,
//       −PALM.ax, −PALM.ay, PALM.w, PALM.h)   (crossfade both moods like the tiles). The art leans LEFT; flip mirrors it.
//   * NEW rainbow (rainbow mood, alpha = ambient.rainbow): after the sun, before the clouds:
//       drawImage(env/rainbow.svg, L.rainbow.x − w/2, L.rainbow.y − h, w, h) — non-uniform scale is fine (soft arc).
//   * Rain clouds: weather may use env/cloud_rain.svg (same 300×140 box) for the rain mood.
//   * No clock: L.clock = [] (the clock-hands loop is a no-op; remove it). No moon / stars / smoke.
//
//   L = RECIPE.envLayout(W, H, ins)           (ins = safe-area insets {top,left,right,bottom}, may be omitted)
//   shoreY   = landscape round(0.60 H) (H=720 → 432); portrait round(0.74 H) (720×1556 → 1151, 720×960 → 710).
//   horizonY = landscape ins.top + round(0.40 H) (288, behind the board, visible left/right of it); portrait
//              ins.top + round(0.252 H) (1556 → 392: islands + ship show between the bubble and the board).
//   far    : tile far_m (1200·kf × 720·kf) at x ∈ tileXs(L.far.x0, L.far.w, W), top y = horizonY − 560·kf.
//   sea    : fill as above, y0 = horizonY + 160·kf (far bottom), y1 = shoreY − 50·km (hidden behind mid's sand).
//   mid    : tile mid_m — its line y 298 (MID_BASE) lands on shoreY; waterline foam at mid y ≈ 236.
//   ground : tile ground_m — its line y 40 (GROUND_LINE) = shoreY; then fillRect(0, L.ground.fillY, W, H − fillY) with
//            SAND_BOTTOM[m] when fillY < H.
//   Scale rule: background layers (far, mid) ×1.36 on tall portrait (H/W > 1.6), ×1.15 on other portrait (kp; far
//   kf = 0.7·kp, mid km = 0.86·kp); ground kg = clamp((H − shoreY) / 220, 1, 1.8). Palms ×kp too. Every layer is uniformly
//   scaled so TM.Assets.exact(name, round(w·rs), round(h·rs)) can pre-render it once. Mood crossfade: draw both moods'
//   stacks with alpha (1 − mix) / mix (same geometry).
//   far.x0 puts the lighthouse island (far x 200) at the left edge (landscape x ≈ 120: left of the board, above Mit) and
//   the ship lands right of the board on wide screens.
//   palms: landscape 2 palms (x = 0.045 W leaning in, x = 0.955 W), + a small third at 0.87 W when W/H ≥ 1.9; base on the
//   sand at shoreY + 40; portrait 2 palms at the edges (fronds peek out beside the board).
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ENV = require('./art_env.js');

/** Pure layout of the environment layers for a W × H screen. ins = safe-area insets (logical px). */
function envLayout(W, H, ins) {
  ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
  const portrait = H > W, tall = H / W > 1.6;
  const shoreY = Math.round(H * (portrait ? 0.74 : 0.60));
  const horizonY = Math.round(ins.top + H * (portrait ? 0.252 : 0.40));
  const kp = portrait ? (tall ? 1.36 : 1.15) : 1;          // skill rule: background layers ×1.36 on tall portrait
  const kf = 0.7 * kp, km = 0.86 * kp;
  const kg = Math.max(1, Math.min(1.8, (H - shoreY) / 220));
  const cx = W / 2;
  const lhX = portrait ? ins.left + 0.2 * W : ins.left + 190;   // where the lighthouse island (far x 200) lands
  const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(lhX - 200 * kf), y: Math.round(horizonY - 560 * kf) };
  const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(portrait ? cx - 330 * km : ins.left + 40 - 120 * km), y: shoreY - 298 * km };
  const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: Math.round(cx - 600 * kg), y: shoreY - 40 * kg };
  ground.fillY = ground.y + 258 * kg;
  const sea = { y0: Math.round(far.y + 720 * kf) - 1, y1: Math.round(shoreY - 50 * km) };
  const skyY1 = horizonY;
  let sun;
  if (!portrait) {
    // in the free sky between the speech bubble's right edge (bx) and the HUD (W − 160)
    const bx = ins.left + 24 + Math.min(560, W - ins.right - 200 - ins.left - 24), hx = W - ins.right - 160;
    const sx = d => Math.max(bx + 80, Math.min(hx - 90, hx - 150 - d));
    sun = {
      sunny: { x: sx(0), y: ins.top + 70, size: 150 },
      breezy: { x: sx(70), y: ins.top + 86, size: 140 },
      rain: { x: sx(40), y: ins.top + 80, size: 136 },
      rainbow: { x: sx(-20), y: ins.top + 64, size: 150 },
    };
  } else {
    const s = Math.min(130, Math.max(100, W * 0.17));
    sun = {
      sunny: { x: W * 0.3, y: ins.top + 56, size: s * 1.08 },
      breezy: { x: W * 0.22, y: ins.top + 62, size: s },
      rain: { x: W * 0.26, y: ins.top + 60, size: s },
      rainbow: { x: W * 0.34, y: ins.top + 52, size: s * 1.08 },
    };
  }
  const clouds = portrait
    ? { y0: ins.top + 24, y1: ins.top + 96, s: 0.5 }
    : { y0: ins.top + 26, y1: ins.top + 104, s: 0.6 };
  // palms (base points on the sand, s = scale of the 260 × 420 sprite, flip = mirror: the art leans left)
  let palms;
  if (!portrait) {
    const by = shoreY + 40, wide = W / H >= 1.9;
    palms = [
      { x: Math.round(ins.left + 0.045 * W), y: by + 6, s: 0.86, flip: true },
      { x: Math.round(W - ins.right - 0.045 * W), y: by, s: 0.8, flip: false },
    ];
    if (wide) palms.push({ x: Math.round(W - ins.right - 0.13 * W), y: by - 10, s: 0.58, flip: true });
  } else {
    const by = shoreY + 36 * kp, s = 0.5 * kp;   // small: the crowns stay in the gap between the board and the tray
    palms = [
      { x: Math.round(ins.left + 0.04 * W), y: Math.round(by), s, flip: true },
      { x: Math.round(W - ins.right - 0.04 * W), y: Math.round(by - 10), s: s * 0.92, flip: false },
    ];
  }
  // rainbow arc (env/rainbow.svg 1200 × 600, bottom-anchored at the horizon): drawn behind the far layer
  const rainbow = portrait
    ? { x: Math.round(W * 0.56), y: horizonY + 10, w: Math.round(W * 1.15), h: Math.round(horizonY - ins.top - 12) }
    : { x: Math.round(W * 0.6), y: horizonY + 10, w: Math.round(Math.min(1400, W * 0.82)), h: Math.round(horizonY - ins.top - 26) };
  return { portrait, tall, shoreY, streetY: shoreY, sandY: shoreY, horizonY, kp, far, sea, mid, ground, skyY1, sun, clouds, palms, rainbow, clock: [], volcano: [], hillTop: horizonY, starsY1: horizonY };
}
/** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }

const RECIPE = {
  MOODS: ENV.MOODS,               // ['sunny','breezy','rain','rainbow'] = weather 0..3
  SKY: ENV.SKY,                   // { mood: [[offset, colour], …] } from y 0 to L.skyY1
  SEA: ENV.SEA,                   // { mood: { deep (horizon), mid (far-tile bottom → sea fill top), near (sea fill bottom) } }
  SAND: ENV.SAND,                 // beach sand at the shore line (top of the ground tile)
  SAND_BOTTOM: ENV.SAND_BOTTOM,   // fill colour below the ground tile
  PAVE_BOTTOM: ENV.SAND_BOTTOM,   // alias for the town render code
  RIM: ENV.RIM,                   // rim-light colour per mood
  TILES: { far: [1200, 720, 720], mid: [1200, 300, 298], ground: [1200, 260, 40] }, // [w, h, line that maps to its anchor]
  FAR_HORIZON: ENV.HORIZON,       // 560: far-tile y of the horizon (→ L.horizonY)
  PALM: ENV.PALM,                 // { w: 260, h: 420, ax: 130, ay: 416 } base anchor; rotate about it by wind × 0.08 rad
  RAINBOW: { w: 1200, h: 600 },   // bottom-anchored arc
  envLayout, tileXs,
};
module.exports = { RECIPE, envLayout, tileXs };
if (require.main !== module) return;

// ----------------------------------------------------------------------------------------------------- previews
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');
const MOODS = ENV.MOODS;
const PARTS = ['sparkle', 'mote', 'leaf_a', 'leaf_b', 'sand', 'rain', 'splash', 'droplet', 'star', 'confetti_a', 'confetti_b', 'dot', 'dust', 'coin'];
const NAMES = ['env/sun', 'env/cloud_a', 'env/cloud_b', 'env/cloud_rain', 'env/rainbow', ...MOODS.flatMap(s => ['far', 'mid', 'ground', 'palm'].map(l => `env/${l}_${s}`)), ...PARTS.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const PIECES = { sunny: ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B'], breezy: ['#FF9A2E', '#8E44AD', '#3C8DE8', '#4CC26B'], rain: ['#3C8DE8', '#E84A4A', '#4CC26B', '#FFD23F'], rainbow: ['#E84A4A', '#FF9A2E', '#4CC26B', '#8E44AD'] };

// the real world layout (DESIGN §2) when world.js loads in node, else a rough placeholder — only for judging the previews
function uiLayout(W, H) {
  try {
    global.window = global; global.TM = global.TM || {};
    for (const f of ['rng', 'content', 'world']) { try { require(path.join(ROOT, 'game/js', f + '.js')); } catch (e) { /* optional */ } }
    const w = new global.TM.World({ seed: 1 }); w.setViewport(W, H, { top: 0, left: 0, right: 0, bottom: 0 });
    const L = w.layout;
    return { board: L.board, tray: L.tray, rows: L.tray.rows || [], item: L.item, mit: L.mit, bubble: L.bubble, hud: L.hud, spots: (L.tray.spots || []).slice(0, 4) };
  } catch (e) {
    const portrait = H > W;
    return portrait
      ? { board: { x: 24, y: 416, w: 672, h: 524 }, tray: { x: 230, y: 1119, w: 466, h: 437 }, rows: [], item: 134, mit: { x: 104, y: 1526, h: 200 }, bubble: { x: 24, y: 110, w: 672, h: 124 }, hud: { x: W - 160, y: 0, w: 160, h: 96 }, spots: [] }
      : { board: { x: 327, y: 182, w: 525, h: 300 }, tray: { x: 250, y: 512, w: W - 280, h: 208 }, rows: [], item: 112, mit: { x: 118, y: 702, h: 230 }, bubble: { x: 24, y: 18, w: 560, h: 134 }, hud: { x: W - 160, y: 0, w: 160, h: 96 }, spots: [] };
  }
}

function pageScene({ mood, W, H, L, U, src, sky, sea, sandBottom, cols, palm }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { throw new Error('bad image ' + s.slice(0, 60)); }; i.src = s; });
  const tileXs = (x0, tw, W) => { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; };
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, L.skyY1); for (const [o, col] of sky) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const sn = L.sun[mood];
    g.globalAlpha = mood === 'rain' ? 0.35 : 1; g.drawImage(im['env/sun'], sn.x - sn.size / 2, sn.y - sn.size / 2, sn.size, sn.size); g.globalAlpha = 1;
    if (mood === 'rainbow') { const rb = L.rainbow; g.drawImage(im['env/rainbow'], rb.x - rb.w / 2, rb.y - rb.h, rb.w, rb.h); }
    const nC = mood === 'rain' ? 5 : mood === 'breezy' ? 4 : 3;
    for (let i = 0; i < nC; i++) {
      const ci = im[mood === 'rain' ? 'env/cloud_rain' : i % 2 ? 'env/cloud_b' : 'env/cloud_a'], s = L.clouds.s * (0.8 + 0.4 * rnd()) * (mood === 'rain' ? 1.25 : 1), x = (i + 0.3 + rnd() * 0.4) * W / nC, y = L.clouds.y0 + rnd() * (L.clouds.y1 - L.clouds.y0);
      g.globalAlpha = 0.92; g.drawImage(ci, x - 150 * s, y - 70 * s, 300 * s, 140 * s);
    }
    g.globalAlpha = 1;
    const lay = (name, Ly) => { for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(im[name], x, Ly.y, Ly.w + 0.5, Ly.h); };
    lay('env/far_' + mood, L.far);
    if (L.sea.y1 > L.sea.y0) { const sg = g.createLinearGradient(0, L.sea.y0, 0, L.sea.y1); sg.addColorStop(0, sea.mid); sg.addColorStop(1, sea.near); g.fillStyle = sg; g.fillRect(0, L.sea.y0, W, L.sea.y1 - L.sea.y0); }
    lay('env/mid_' + mood, L.mid); lay('env/ground_' + mood, L.ground);
    if (L.ground.fillY < H) { g.fillStyle = sandBottom; g.fillRect(0, L.ground.fillY - 1, W, H - L.ground.fillY + 1); }
    // palms (wind lean in breezy)
    const wind = mood === 'breezy' ? 0.6 : 0.05;
    for (const p of L.palms) { g.save(); g.translate(p.x, p.y); g.rotate(wind * 0.08 * (p.flip ? 1 : 1)); g.scale(p.flip ? -p.s : p.s, p.s); g.drawImage(im['env/palm_' + mood], -palm.ax, -palm.ay, palm.w, palm.h); g.restore(); }
    if (mood === 'rain') { g.fillStyle = 'rgba(60,70,100,0.08)'; g.fillRect(0, 0, W, H); }
    // ---- placeholders: bubble, HUD, the parchment board (rope-wood frame), the water tray, pieces, Mit
    const rr = (x, y, w, h, r, fill, st, lw = 4) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); if (st) { g.lineWidth = lw; g.strokeStyle = st; g.stroke(); } };
    rr(U.bubble.x, U.bubble.y, U.bubble.w, U.bubble.h, 26, 'rgba(255,255,255,0.93)');
    rr(U.hud.x + 8, U.hud.y + 14, U.hud.w - 24, U.hud.h - 30, 20, 'rgba(255,255,255,0.9)');
    const b = U.board, F = 22;
    g.save(); g.shadowColor = 'rgba(60,40,20,0.3)'; g.shadowBlur = 18; g.shadowOffsetY = 8; rr(b.x - F, b.y - F, b.w + 2 * F, b.h + 2 * F, 26 + F, '#C98D52'); g.restore();
    rr(b.x - F, b.y - F, b.w + 2 * F, b.h + 2 * F, 26 + F, '#C98D52', '#8E5A2C', 4);
    rr(b.x, b.y, b.w, b.h, 26, '#F3E3BF', '#C9A46A', 3);
    g.fillStyle = 'rgba(227,205,156,0.6)'; g.beginPath(); g.ellipse(b.x + b.w * 0.3, b.y + b.h * 0.6, b.w * 0.12, b.h * 0.1, 0, 0, 7); g.fill();
    const slots = [[0.22, 0.42], [0.55, 0.58], [0.82, 0.36]];
    slots.forEach(([u, v], i) => {
      const x = b.x + u * b.w, y = b.y + v * b.h, s = U.item;
      g.beginPath(); g.roundRect(x - s / 2, y - s / 2, s, s, 22);
      if (i === 1) { g.fillStyle = cols[3]; g.fill(); g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.25)'; g.stroke(); }
      else { g.fillStyle = 'rgba(40,36,60,0.30)'; g.fill(); g.setLineDash([10, 8]); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.stroke(); g.setLineDash([]); }
    });
    // water tray: one strip per row (DESIGN §0.5 drawTray: #8FDCE0 → #5CC3D6 with a foam edge)
    const rows = U.rows.length ? U.rows : [{ x0: U.tray.x, x1: U.tray.x + U.tray.w, y: U.tray.y + U.tray.h - 10 }];
    for (const r of rows) {
      const y0 = r.y - U.item - 26, y1 = Math.min(H, r.y + 22);
      const tg = g.createLinearGradient(0, y0, 0, y1); tg.addColorStop(0, mood === 'rain' ? '#A3C6CB' : '#8FDCE0'); tg.addColorStop(1, mood === 'rain' ? '#7FA8B2' : '#5CC3D6');
      rr(r.x0 - 14, y0, r.x1 - r.x0 + 28, y1 - y0, 30, tg, 'rgba(255,255,255,0.85)', 5);
    }
    (U.spots || []).forEach((p, i) => { const s = U.item * 0.92; g.save(); g.translate(p.x, p.y); g.rotate((i % 2 ? 1 : -1) * 0.05);
      g.beginPath(); g.roundRect(-s / 2, -s / 2, s, s, 20); g.fillStyle = cols[i % 3]; g.fill(); g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.28)'; g.stroke(); g.restore(); });
    // Mit placeholder (cream puppy blob with brown ears and a paper hat)
    const P = U.mit; g.lineWidth = 5; g.strokeStyle = '#8E6A45';
    g.fillStyle = '#EFD9B4'; g.beginPath(); g.ellipse(P.x, P.y - P.h * 0.28, P.h * 0.28, P.h * 0.28, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(P.x, P.y - P.h * 0.68, P.h * 0.25, P.h * 0.22, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#9C6B45'; for (const d of [-1, 1]) { g.beginPath(); g.ellipse(P.x + d * P.h * 0.24, P.y - P.h * 0.62, P.h * 0.07, P.h * 0.14, d * 0.3, 0, 7); g.fill(); }
    g.fillStyle = '#F6EEDC'; g.strokeStyle = '#B9A27A'; g.beginPath(); g.moveTo(P.x - P.h * 0.22, P.y - P.h * 0.86); g.lineTo(P.x, P.y - P.h * 1.02); g.lineTo(P.x + P.h * 0.22, P.y - P.h * 0.86); g.closePath(); g.fill(); g.stroke();
    // a few mood particles
    const pk = { sunny: ['sparkle', 'mote'], breezy: ['leaf_a', 'leaf_b'], rain: ['rain', 'rain'], rainbow: ['sparkle', 'droplet'] }[mood];
    for (let i = 0; i < 16; i++) { const p = im['particles/' + pk[i % 2]], s = 20 + (i % 4) * 6, x = (i * 0.618 % 1) * W, y = ((i * 0.37 + 0.05) % 1) * H; g.drawImage(p, x, y, s, s); }
    return c.toDataURL('image/png');
  })();
}

function pageSeams({ src, list }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { throw new Error('bad image ' + s.slice(0, 60)); }; i.src = s; });
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

function pageParticles({ src, parts, extras }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { throw new Error('bad image ' + s.slice(0, 60)); }; i.src = s; });
  return (async () => {
    const c = document.createElement('canvas'); c.width = 14 * 112 + 40; c.height = 720; const g = c.getContext('2d');
    g.fillStyle = '#D8F1FB'; g.fillRect(0, 0, c.width, 120); g.fillStyle = '#8FA3B8'; g.fillRect(0, 120, c.width, 120); g.fillStyle = '#F1DDB0'; g.fillRect(0, 240, c.width, 480);
    let x = 20;
    for (const p of parts) { const im = await load(src['particles/' + p]); for (const y0 of [0, 120, 240]) g.drawImage(im, x, y0 + 12, 96, 96); x += 112; }
    x = 20; for (const e of extras) {
      const im = await load(src[e]); const w = e.includes('cloud') ? 300 : e.includes('rainbow') ? 1200 : e.includes('palm') ? 260 : 200, h = e.includes('cloud') ? 140 : e.includes('rainbow') ? 600 : e.includes('palm') ? 420 : 200;
      const k = Math.min(300 / h, 330 / w); g.drawImage(im, x, 390, w * k, h * k); x += w * k + 16;
    }
    return c.toDataURL('image/png');
  })();
}

(async () => {
  fs.mkdirSync(ART, { recursive: true });
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent('<html><body style="margin:0"></body></html>');
  const save = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  const only = process.argv[2];
  for (const [W, H] of VPS) for (const m of MOODS) {
    const vp = `${W}x${H}`; if (only && !`${vp}_${m}`.includes(only)) continue;
    const U = uiLayout(W, H), L = envLayout(W, H);
    save(await pg.evaluate(pageScene, { mood: m, W, H, L, U, src: SRC, sky: ENV.SKY[m], sea: ENV.SEA[m], sandBottom: ENV.SAND_BOTTOM[m], cols: PIECES[m], palm: ENV.PALM }), path.join(ART, `env_${vp}_${m}.png`));
    if (m === 'sunny') console.log(vp, JSON.stringify({ shoreY: L.shoreY, horizonY: L.horizonY, kf: +L.far.k.toFixed(3), km: +L.mid.k.toFixed(3), kg: +L.ground.k.toFixed(2), farY: Math.round(L.far.y), sea: L.sea, midY: Math.round(L.mid.y), groundY: Math.round(L.ground.y), fillY: Math.round(L.ground.fillY), sun: L.sun.sunny, palms: L.palms, rainbow: L.rainbow }));
  }
  if (!only || only === 'sheet') save(await pg.evaluate(pageParticles, { src: SRC, parts: PARTS, extras: ['env/sun', 'env/cloud_a', 'env/cloud_b', 'env/cloud_rain', ...MOODS.map(m => 'env/palm_' + m), 'env/rainbow'] }), path.join(ART, 'env_particles.png'));
  if (!only || only === 'seams') {
    const last = s => ENV.SKY[s][ENV.SKY[s].length - 1][1];
    const list = MOODS.flatMap(s => [['env/far_' + s, 1200, 720, 480, last(s)], ['env/mid_' + s, 1200, 300, 150, ENV.SEA[s].near], ['env/ground_' + s, 1200, 260, 0, ENV.SAND_BOTTOM[s]]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
