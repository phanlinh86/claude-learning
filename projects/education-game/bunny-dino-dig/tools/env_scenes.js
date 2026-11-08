// Bun's Dino Dig: dinosaur-valley environment RECIPE + preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]      (filter e.g. "night", "720x1556", "seams")
// Writes docs/art/env_<1556x720|960x720|720x1556>_<mood>.png, docs/art/env_seams.png, docs/art/env_particles.png.
//
// ================================== RECIPE (render.js copies this; all numbers are logical px) ==================
// const R = require('./env_scenes.js').RECIPE   — in the game, paste RECIPE.envLayout / RECIPE.tileXs verbatim (pure
// functions, no DOM, no requires) and the colour tables RECIPE.SKY / SAND_BOTTOM / RIM.
//   L = RECIPE.envLayout(W, H, ins)           (ins = safe-area insets {top,left,right,bottom}, may be omitted)
//   0 sandY  = the dig-site horizon (where the sky / hills meet the sand). Landscape H=720 → 338 (0.47 H);
//              portrait → 0.53 H (720×1556 → 825, 720×960 → 509).
//   1 sky    : vertical linear gradient with SKY[m] stops from y 0 to y = L.sandY over the whole screen
//              (sunset has 3 stops: lilac top #B98BB5 → #F6A86B at 0.42 → #F9D7A0).
//   2 sun / moon: drawImage(env/sun.svg | env/moon.svg) centred at L.sun[m] = {x, y, size} (size = drawn width = height;
//              moon uses L.sun.night). Alpha from ambient.sunA / moonA. Positions sit in the free sky between the
//              speech bubble and the HUD (landscape) or between the shelf and the hills (portrait).
//   2b stars (night) in the sky band y ∈ [0, L.starsY1]; clouds: env/cloud_a|b (300×140) drawn at scale L.clouds.s,
//              centre y ∈ [L.clouds.y0, L.clouds.y1], few and faint at night.
//   3 far    : tile far_m (L.far.w × L.far.h) at x ∈ tileXs(L.far.x0, L.far.w, W), top y = L.far.y.
//              Its line y 690 (FAR_BASE) lands on sandY. Volcano crater(s) for the animated smoke (env/smoke.svg,
//              puffs rising ~18 px/s, growing ×1.8, fading over ~6 s): L.volcano = [{x, y}] screen points.
//   4 mid    : tile mid_m (L.mid ...) — the props' bases (viewBox y 290) land on sandY + 8 (hidden by the ground edge).
//   5 ground : tile ground_m (L.ground ...) — its horizon line (viewBox y 30) = sandY; then
//              fillRect(0, L.ground.fillY, W, H − fillY) with SAND_BOTTOM[m] (always needed: the tile is ≤ 260·kg tall).
//   Scale rule: background layers (far, mid) ×1.36 on tall portrait (H/W > 1.6) and ×1.15 on other portrait so the hills
//   fill the sky; ground scale kg = clamp((H − sandY) / 260 × 0.7, 1, 1.8) so the footprints / pebbles spread down.
//   Every layer is uniformly scaled (k) so DD.Assets.exact(name, round(w·rs), round(h·rs)) can pre-render it once.
//   Mood crossfade: draw both moods' stacks with alpha (1 − mix) / mix, or crossfade per layer (same geometry).
//   Night: the render adds a warm lantern glow over the mound field (preview: a radial gradient, see pageScene).
// Landscape H=720 (W any): sandY 338; far k 0.56 (y −48, mountain tops ≈ y 126…200, volcano crater y ≈ 130);
//   mid k 0.74 (y 131, tallest palm top ≈ y 168); ground k 1.03 (y 307, fillY ≈ 572); sky band y 0…~120 is clear.
// Portrait 720×1556: sandY 825; far k 0.76 (top of hills ≈ 537); mid k 1.0; ground k 1.8; sun in the gap 340…540.
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ENV = require('./art_env.js');

/** Pure layout of the environment layers for a W × H screen. ins = safe-area insets (logical px). */
function envLayout(W, H, ins) {
  ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
  const portrait = H > W, tall = H / W > 1.6;
  const sandY = Math.round(H * (portrait ? 0.53 : 0.47));
  const kp = portrait ? (tall ? 1.36 : 1.15) : 1;         // skill rule: background layers ×1.36 on tall portrait
  const kf = 0.56 * kp, km = 0.74 * kp;
  const kg = Math.max(1, Math.min(1.8, (H - sandY) / 260 * 0.7));
  const cx = W / 2;
  // the far tile is placed so the volcano crater sits at 30 % (landscape: smoke rises behind the bubble) / 36 % (portrait)
  const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(W * (portrait ? 0.36 : 0.3) - ENV.VOLCANO.x * kf), y: sandY - 690 * kf };
  const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(cx - 520 * km), y: sandY + 8 - 290 * km };
  const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: Math.round(cx - 640 * kg), y: sandY - 30 * kg };
  ground.fillY = ground.y + 258 * kg;
  const hillTop = far.y + 310 * kf;                        // highest far-layer pixel (mountain peaks)
  // sun / moon: landscape → the free sky between the bubble (right edge) and the HUD; portrait → the band between the
  // treasure shelf bottom and the hill tops.
  let sun;
  if (!portrait) {
    const bx = ins.left + 24 + Math.min(560, W - ins.right - 200 - ins.left - 24), hx = W - ins.right - 160, span = hx - bx;
    const s = 150;
    sun = {
      morning: { x: bx + span * 0.22, y: ins.top + 112, size: s },
      noon: { x: bx + span * 0.55, y: ins.top + 62, size: s },
      sunset: { x: bx + span * 0.8, y: ins.top + 118, size: s * 1.1 },
      night: { x: bx + span * 0.62, y: ins.top + 72, size: s * 0.95 },
    };
  } else {
    const shelfBottom = ins.top + 110 + 124 + 14 + 92, gapMid = (shelfBottom + hillTop) / 2, s = Math.min(170, Math.max(120, hillTop - shelfBottom));
    sun = {
      morning: { x: W * 0.14, y: gapMid + 22, size: s },
      noon: { x: W * 0.68, y: gapMid - 12, size: s },
      sunset: { x: W * 0.8, y: gapMid + 26, size: s * 1.1 },
      night: { x: W * 0.74, y: gapMid - 4, size: s * 0.95 },
    };
  }
  const clouds = portrait
    ? { y0: ins.top + 360, y1: Math.max(ins.top + 380, hillTop - 50), s: 0.7 }
    : { y0: ins.top + 30, y1: ins.top + 110, s: 0.62 };
  const volcano = tileXs(far.x0, far.w, W).map(x => ({ x: x + ENV.VOLCANO.x * kf, y: far.y + ENV.VOLCANO.y * kf }))
    .filter(p => p.x > -60 && p.x < W + 60);
  return { portrait, tall, sandY, kp, far, mid, ground, hillTop, sun, clouds, volcano, starsY1: Math.min(sandY - 60, hillTop + 40) };
}
/** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }

const RECIPE = {
  MOODS: ENV.MOODS,
  SKY: ENV.SKY,                 // { mood: [[offset, colour], …] } from y 0 to sandY
  SAND: ENV.SAND,               // dig-site sand near the horizon (for reference / tints)
  SAND_BOTTOM: ENV.SAND_BOTTOM, // fill colour below the ground tile
  RIM: ENV.RIM,                 // rim-light colour per mood (moonlit at night)
  TILES: { far: [1200, 720, 690], mid: [1200, 300, 290], ground: [1200, 260, 30] }, // [w, h, line that maps to sandY]
  VOLCANO: ENV.VOLCANO,         // crater in far-tile coords
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
const PARTS = ['sand', 'dust', 'leaf_a', 'leaf_b', 'sparkle', 'star', 'firefly', 'mote', 'confetti_a', 'confetti_b', 'dot', 'feather'];
const NAMES = ['env/sun', 'env/moon', 'env/cloud_a', 'env/cloud_b', 'env/smoke', ...MOODS.flatMap(s => ['far', 'mid', 'ground'].map(l => `env/${l}_${s}`)), ...PARTS.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const EGGS = { morning: ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B'], noon: ['#FF9A2E', '#8E44AD', '#FF8FC0', '#3C8DE8'], sunset: ['#4CC26B', '#E84A4A', '#3C8DE8', '#FFD23F'], night: ['#FFD23F', '#FF8FC0', '#4CC26B', '#E84A4A'] };

// placeholder UI (DESIGN §2, zero insets) — only for judging the previews
function uiLayout(W, H) {
  const portrait = H > W, groundY = H - (portrait ? 26 : 14), item = 110 * (H / W > 1.6 ? 1.15 : 1);
  const bubble = portrait ? { x: 24, y: 110, w: W - 48, h: 124 } : { x: 24, y: 18, w: Math.min(560, W - 200 - 24), h: 122 };
  const shelf = portrait ? { x: 24, y: bubble.y + bubble.h + 14, w: W - 48, h: 92 } : { x: 24, y: 152, w: W - 48, h: 92 };
  const mounds = [];
  if (!portrait) {
    const x0 = 250, x1 = W - 30;
    for (const [y, n] of [[groundY - 188, 3], [groundY - 18, 4]]) for (let i = 0; i < n; i++) mounds.push({ x: x0 + (x1 - x0) * (i + 0.5) / n + (i % 2 ? 14 : -10), y });
  } else {
    const rows = []; for (let y = groundY - 18; y >= shelf.y + shelf.h + item + 40 && rows.length < 4; y -= 170) rows.push(y);
    rows.forEach((y, r) => { const x0 = r === 0 ? 220 : 30, x1 = W - 30, n = r === 0 ? 2 : 3; for (let i = 0; i < n; i++) mounds.push({ x: x0 + (x1 - x0) * (i + 0.5) / n + (i % 2 ? 12 : -8), y }); });
  }
  mounds.sort((a, b) => a.y - b.y);
  return { portrait, groundY, bubble, shelf, mounds, item, bun: portrait ? { x: 104, y: groundY - 4, h: 200 } : { x: 118, y: groundY - 4, h: 230 } };
}

function pageScene({ mood, W, H, L, U, src, sky, sandBottom, eggs }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  const tileXs = (x0, tw, W) => { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; };
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, L.sandY); for (const [o, col] of sky) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    if (mood === 'night') for (let i = 0; i < 46; i++) { const s = 10 + rnd() * 14; g.globalAlpha = 0.5 + rnd() * 0.5; g.drawImage(im['particles/star'], rnd() * W - s / 2, rnd() * L.starsY1 - s / 2, s, s); }
    g.globalAlpha = 1;
    const sn = L.sun[mood], si = mood === 'night' ? im['env/moon'] : im['env/sun'];
    g.globalAlpha = mood === 'morning' ? 0.85 : 1; g.drawImage(si, sn.x - sn.size / 2, sn.y - sn.size / 2, sn.size, sn.size); g.globalAlpha = 1;
    const nC = mood === 'night' ? 1 : mood === 'noon' ? 4 : 3;
    for (let i = 0; i < nC; i++) {
      const ci = im[i % 2 ? 'env/cloud_b' : 'env/cloud_a'], s = L.clouds.s * (0.8 + 0.4 * rnd()), x = (i + 0.3 + rnd() * 0.4) * W / nC, y = L.clouds.y0 + rnd() * (L.clouds.y1 - L.clouds.y0);
      g.globalAlpha = mood === 'night' ? 0.25 : mood === 'sunset' ? 0.75 : 0.9; g.drawImage(ci, x - 150 * s, y - 70 * s, 300 * s, 140 * s);
    }
    g.globalAlpha = 1;
    const lay = (name, Ly) => { for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(im[name], x, Ly.y, Ly.w + 0.5, Ly.h); };
    lay('env/far_' + mood, L.far);
    for (const v of L.volcano) { g.globalAlpha = 0.6; const s = 70 * L.far.k / 0.56; g.drawImage(im['env/smoke'], v.x - s / 2 + 10, v.y - s * 1.6, s, s); } g.globalAlpha = 1;
    lay('env/mid_' + mood, L.mid); lay('env/ground_' + mood, L.ground);
    g.fillStyle = sandBottom; g.fillRect(0, L.ground.fillY - 1, W, H - L.ground.fillY + 1);
    if (mood === 'night') { // the render's lantern glow over the field (approximation)
      const lg = g.createRadialGradient(W * 0.58, H * 0.82, 20, W * 0.58, H * 0.82, Math.max(W, H) * 0.55);
      lg.addColorStop(0, 'rgba(255,214,150,0.32)'); lg.addColorStop(1, 'rgba(255,214,150,0)'); g.fillStyle = lg; g.fillRect(0, L.sandY, W, H - L.sandY);
    }
    // ---- placeholders: bubble, HUD, shelf, mounds with peeking eggs, Bun
    const rr = (x, y, w, h, r, fill, st, lw = 4) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); if (st) { g.lineWidth = lw; g.strokeStyle = st; g.stroke(); } };
    rr(U.bubble.x, U.bubble.y, U.bubble.w, U.bubble.h, 26, 'rgba(255,255,255,0.93)');
    rr(W - 160, 16, 144, 64, 20, 'rgba(255,255,255,0.9)');
    const sh = U.shelf, pt = sh.y + sh.h - 30;
    rr(sh.x + 30, pt + 8, 14, 22, 4, '#A57C55', '#6E4E32', 3); rr(sh.x + sh.w - 44, pt + 8, 14, 22, 4, '#A57C55', '#6E4E32', 3);
    rr(sh.x, pt, sh.w, 16, 6, '#C49A6C', '#7A5636', 3);
    for (let i = 0; i < 4; i++) { const x = sh.x + sh.w / 2 + (i - 1.5) * 76, col = eggs[i]; g.beginPath(); g.ellipse(x, pt - 30, 22, 30, 0, 0, 7); g.fillStyle = col; g.fill(); g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.3)'; g.stroke(); }
    const night = mood === 'night';
    U.mounds.forEach((m, i) => {
      const w = U.item * 1.55, h0 = U.item * 0.62, col = eggs[i % eggs.length];
      g.save(); g.globalAlpha = 0.22; g.fillStyle = '#3A2A18'; g.beginPath(); g.ellipse(m.x + 6, m.y + 2, w * 0.55, 12, 0, 0, 7); g.fill(); g.restore();
      // egg peeking out of the top
      g.beginPath(); g.ellipse(m.x, m.y - h0 - U.item * 0.12, U.item * 0.36, U.item * 0.48, 0, 0, 7); g.fillStyle = col; g.fill(); g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.28)'; g.stroke();
      g.beginPath(); g.moveTo(m.x - w / 2, m.y); g.bezierCurveTo(m.x - w * 0.42, m.y - h0 * 1.05, m.x - w * 0.2, m.y - h0, m.x, m.y - h0 * 0.98); g.bezierCurveTo(m.x + w * 0.2, m.y - h0, m.x + w * 0.42, m.y - h0 * 1.05, m.x + w / 2, m.y); g.closePath();
      g.fillStyle = night ? '#B9AE9C' : '#E9CF9A'; g.fill(); g.lineWidth = 4; g.strokeStyle = night ? '#6E6656' : '#A9834A'; g.stroke();
      g.beginPath(); g.ellipse(m.x - w * 0.16, m.y - h0 * 0.7, w * 0.14, h0 * 0.12, -0.3, 0, 7); g.fillStyle = night ? '#D3C9B6' : '#F6E3B9'; g.fill();
    });
    const b = U.bun; g.beginPath(); g.ellipse(b.x, b.y - b.h * 0.34, b.h * 0.3, b.h * 0.34, 0, 0, 7); g.fillStyle = '#F4ECDF'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#9C8A70'; g.stroke();
    for (const dx of [-0.12, 0.1]) { g.beginPath(); g.ellipse(b.x + b.h * dx, b.y - b.h * 0.86, b.h * 0.06, b.h * 0.18, dx, 0, 7); g.fill(); g.stroke(); }
    g.beginPath(); g.ellipse(b.x, b.y - b.h * 0.62, b.h * 0.26, b.h * 0.06, 0, 0, 7); g.fillStyle = '#C9B48A'; g.fill(); g.stroke();
    // a few mood particles
    const pk = { morning: ['mote', 'sparkle'], noon: ['leaf_a', 'leaf_b'], sunset: ['mote', 'mote'], night: ['firefly', 'firefly'] }[mood];
    for (let i = 0; i < 12; i++) { const p = im['particles/' + pk[i % 2]], s = 18 + (i % 4) * 6, x = (i * 0.618 % 1) * W, y = L.sandY - 60 + ((i * 0.37) % 1) * (H - L.sandY); g.drawImage(p, x, y, s, s); }
    return c.toDataURL('image/png');
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

function pageParticles({ src, parts, extras }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const c = document.createElement('canvas'); c.width = 1580; c.height = 560; const g = c.getContext('2d');
    g.fillStyle = '#CDEBF6'; g.fillRect(0, 0, 1580, 130); g.fillStyle = '#2B3766'; g.fillRect(0, 130, 1580, 130); g.fillStyle = '#E4CB98'; g.fillRect(0, 260, 1580, 300);
    let x = 20;
    for (const p of parts) { const im = await load(src['particles/' + p]); for (const y0 of [0, 130, 260]) g.drawImage(im, x, y0 + 17, 96, 96); x += 130; }
    x = 20; for (const e of extras) { const im = await load(src[e]); const w = e.includes('cloud') ? 300 : 200, h = e.includes('cloud') ? 140 : 200; const k = 160 / Math.max(w, h); g.drawImage(im, x, 390, w * k, h * k); g.fillStyle = '#7CC7EE'; x += w * k + 30; }
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
    save(await pg.evaluate(pageScene, { mood: m, W, H, L, U, src: SRC, sky: ENV.SKY[m], sandBottom: ENV.SAND_BOTTOM[m], eggs: EGGS[m] }), path.join(ART, `env_${vp}_${m}.png`));
    if (m === 'morning') console.log(vp, JSON.stringify({ sandY: L.sandY, hillTop: Math.round(L.hillTop), kf: L.far.k, km: L.mid.k, kg: +L.ground.k.toFixed(2), farY: Math.round(L.far.y), midY: Math.round(L.mid.y), groundY: Math.round(L.ground.y), fillY: Math.round(L.ground.fillY), sun: L.sun.morning }));
  }
  if (!only || only === 'sheet') save(await pg.evaluate(pageParticles, { src: SRC, parts: PARTS, extras: ['env/sun', 'env/moon', 'env/cloud_a', 'env/cloud_b', 'env/smoke'] }), path.join(ART, 'env_particles.png'));
  if (!only || only === 'seams') {
    const list = MOODS.flatMap(s => [['env/far_' + s, 1200, 720, 420, ENV.SKY[s][ENV.SKY[s].length - 1][1]], ['env/mid_' + s, 1200, 300, 150, ENV.SKY[s][ENV.SKY[s].length - 1][1]], ['env/ground_' + s, 1200, 260, 0, ENV.SAND_BOTTOM[s]]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
