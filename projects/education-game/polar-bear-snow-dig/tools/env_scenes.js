// Nuka's Snow Dig: arctic-snowfield environment RECIPE + preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]      (filter e.g. "winter", "720x1556", "seams", "sheet")
// Writes docs/art/env_<1556x720|960x720|720x1556>_<mood>.png, docs/art/env_seams.png, docs/art/env_particles.png.
//
// ================================== RECIPE (render.js copies this; all numbers are logical px) ==================
// const R = require('./env_scenes.js').RECIPE   — in the game, paste RECIPE.envLayout / RECIPE.tileXs verbatim (pure
// functions, no DOM, no requires; they read FAR_ANCHOR) and the tables RECIPE.SKY / GROUND_BOTTOM / RIM / AURORA.
//   Moods: spring | summer | autumn | winter (index 0..3).
//   L = RECIPE.envLayout(W, H, ins)           (ins = safe-area insets {top,left,right,bottom}, may be omitted)
//   0 sandY  = the dig-site horizon (where the sea shore meets the snow field). Landscape H=720 → 338 (0.47 H);
//              portrait → 0.53 H (720×1556 → 825, 720×960 → 509).
//   1 sky    : vertical linear gradient with SKY[m] stops from y 0 to y = L.sandY over the whole screen
//              (autumn has 3 stops: lilac top #C6A9C4 → #F3C79A at 0.45 → #F8E3C4).
//   1b sky aurora (code): soft wavy ribbons in the band y ∈ [L.aurora.y0, L.aurora.y1] (behind the mountains, which are
//              drawn after it and hide its lower part), strength AURORA[m].strength × ambient.aurora crossfade,
//              colours AURORA[m].colors (3 stops along the ribbon), composite AURORA[m].blend ('lighter' at night,
//              'source-over' on the light day skies), peak alpha ≈ AURORA[m].alpha × strength.
//   2 sun / moon: drawImage(env/sun.svg | env/moon.svg) centred at L.sun[m] = {x, y, size} (size = drawn width = height;
//              winter = the moon). Alpha from ambient.sunA / moonA.
//   2b stars (winter) in the sky band y ∈ [0, L.starsY1]; clouds: env/cloud_a|b (300×140) drawn at scale L.clouds.s,
//              centre y ∈ [L.clouds.y0, L.clouds.y1], few and faint in winter. (No volcano / smoke any more.)
//   3 far    : tile far_m (L.far.w × L.far.h) at x ∈ tileXs(L.far.x0, L.far.w, W), top y = L.far.y.
//              Mountains + sea + icebergs; its line y 690 (FAR_BASE) lands on sandY; the sea starts at SEA_Y 572.
//   4 mid    : tile mid_m (L.mid ...) — the props' bases (viewBox y 290) land on sandY + 8 (hidden by the ground edge).
//   5 ground : tile ground_m (L.ground ...) — its horizon line (viewBox y 30) = sandY; then
//              fillRect(0, L.ground.fillY, W, H − fillY) with GROUND_BOTTOM[m] (always needed: the tile is ≤ 260·kg tall).
//   Scale rule: background layers (far, mid) ×1.36 on tall portrait (H/W > 1.6) and ×1.15 on other portrait so the hills
//   fill the sky; ground scale kg = clamp((H − sandY) / 260 × 0.7, 1, 1.8) so the footprints / rocks spread down.
//   Every layer is uniformly scaled (k) so NK.Assets.exact(name, round(w·rs), round(h·rs)) can pre-render it once.
//   Mood crossfade: draw both moods' stacks with alpha (1 − mix) / mix (same geometry).
//   Winter: the render adds a soft cool MOONLIGHT glow over the drift field (rgba(205,222,255,≈0.22), see pageScene) —
//   replaces the old warm lantern glow.
// Landscape H=720 (W any): sandY 338; far k 0.56 (y −48, twin-peak summit ≈ y 104, sea y ≈ 272…338);
//   mid k 0.74 (y 124, igloo top ≈ y 297); ground k 1.03 (y 307, fillY ≈ 572); sky band y 0…~100 is clear.
// Portrait 720×1556: sandY 825; far k 0.76 (summit ≈ 508); mid k 1.0; ground k 1.8; sun in the gap ≈ 340…500.
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ENV = require('./art_env.js');
const FAR_ANCHOR = ENV.FAR_ANCHOR;

/** Pure layout of the environment layers for a W × H screen. ins = safe-area insets (logical px). */
function envLayout(W, H, ins) {
  ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
  const portrait = H > W, tall = H / W > 1.6;
  const sandY = Math.round(H * (portrait ? 0.53 : 0.47));
  const kp = portrait ? (tall ? 1.36 : 1.15) : 1;         // skill rule: background layers ×1.36 on tall portrait
  const kf = 0.56 * kp, km = 0.74 * kp;
  const kg = Math.max(1, Math.min(1.8, (H - sandY) / 260 * 0.7));
  const cx = W / 2;
  // the far tile is placed so the big twin peak stands at 68 % (landscape: right of the bubble) / 30 % (portrait)
  const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(W * (portrait ? 0.3 : 0.68) - FAR_ANCHOR.x * kf), y: sandY - 690 * kf };
  const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(cx - 520 * km), y: sandY + 8 - 290 * km };
  const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: Math.round(cx - 640 * kg), y: sandY - 30 * kg };
  ground.fillY = ground.y + 258 * kg;
  const hillTop = far.y + FAR_ANCHOR.y * kf;               // highest far-layer pixel (the twin-peak summit)
  // sun / moon: landscape → the free sky between the bubble (right edge) and the HUD; portrait → the band between the
  // aurora ribbon (layout.shelf) bottom and the peaks.
  let sun;
  if (!portrait) {
    const bx = ins.left + 24 + Math.min(560, W - ins.right - 200 - ins.left - 24), hx = W - ins.right - 160, span = hx - bx;
    const s = 140;
    sun = {
      spring: { x: bx + span * 0.2, y: ins.top + 96, size: s },          // low spring sun
      summer: { x: bx + span * 0.42, y: ins.top + 58, size: s * 0.95 },  // the midnight sun, high
      autumn: { x: bx + span * 0.86, y: ins.top + 112, size: s * 1.1 },  // low warm sun
      winter: { x: bx + span * 0.3, y: ins.top + 66, size: s * 0.9 },    // the moon
    };
  } else {
    const shelfBottom = ins.top + 110 + 124 + 14 + 92, gapMid = (shelfBottom + hillTop) / 2, s = Math.min(160, Math.max(110, hillTop - shelfBottom));
    sun = {
      spring: { x: W * 0.78, y: gapMid + 10, size: s },
      summer: { x: W * 0.72, y: gapMid - 22, size: s * 0.95 },
      autumn: { x: W * 0.84, y: gapMid + 24, size: s * 1.1 },
      winter: { x: W * 0.76, y: gapMid - 10, size: s * 0.9 },
    };
  }
  const clouds = portrait
    ? { y0: ins.top + 360, y1: Math.max(ins.top + 380, hillTop - 50), s: 0.7 }
    : { y0: ins.top + 30, y1: ins.top + 100, s: 0.6 };
  // the sky aurora band (drawn in code behind the far layer)
  const aurora = portrait
    ? { y0: ins.top + 30, y1: hillTop + 40, amp: 34 }
    : { y0: ins.top + 4, y1: hillTop + 60, amp: 22 };
  return { portrait, tall, sandY, kp, far, mid, ground, hillTop, sun, clouds, aurora, starsY1: Math.min(sandY - 60, hillTop + 40) };
}
/** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }

// sky aurora per mood (render draws it; strength = DESIGN §5.3 ambient.aurora)
const AURORA = {
  spring: { strength: 0.25, alpha: 0.5, blend: 'source-over', colors: ['#8FDDB8', '#86CFE0', '#B7A8E6'] },
  summer: { strength: 0.15, alpha: 0.5, blend: 'source-over', colors: ['#9BE0C0', '#8ED3E6', '#BBAEEA'] },
  autumn: { strength: 0.45, alpha: 0.55, blend: 'source-over', colors: ['#8ED8B0', '#9CC6E8', '#C2A6E2'] },
  winter: { strength: 1.0, alpha: 0.6, blend: 'lighter', colors: ['#5FE8A8', '#4FCFD6', '#9C88EE'] },
};

const RECIPE = {
  MOODS: ENV.MOODS,
  SKY: ENV.SKY,                     // { mood: [[offset, colour], …] } from y 0 to sandY
  SNOW: ENV.SNOW,                   // dig-site snow near the horizon (for reference / tints)
  GROUND_BOTTOM: ENV.GROUND_BOTTOM, // fill colour below the ground tile (was SAND_BOTTOM)
  RIM: ENV.RIM,                     // rim-light colour per mood (moonlit in winter)
  AURORA,                           // sky aurora per mood
  TILES: { far: [1200, 720, 690], mid: [1200, 300, 290], ground: [1200, 260, 30] }, // [w, h, line that maps to sandY]
  FAR_ANCHOR,                       // twin-peak summit in far-tile coords (x placement + hillTop)
  SEA_Y: ENV.SEA_Y,                 // sea surface line in far-tile coords
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
const PARTS = ['snow', 'sand', 'dust', 'petal', 'fluff', 'leaf_a', 'leaf_b', 'sparkle', 'star', 'mote', 'confetti_a', 'confetti_b', 'dot', 'feather'];
const NAMES = ['env/sun', 'env/moon', 'env/cloud_a', 'env/cloud_b', ...MOODS.flatMap(s => ['far', 'mid', 'ground'].map(l => `env/${l}_${s}`)), ...PARTS.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const HATS = { spring: ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B'], summer: ['#FF9A2E', '#8E44AD', '#FF8FC0', '#3C8DE8'], autumn: ['#4CC26B', '#E84A4A', '#3C8DE8', '#FF9A2E'], winter: ['#FFD23F', '#FF8FC0', '#4CC26B', '#E84A4A'] };

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

function pageScene({ mood, W, H, L, U, src, sky, groundBottom, hats, aur }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  const tileXs = (x0, tw, W) => { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; };
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, L.sandY); for (const [o, col] of sky) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const winter = mood === 'winter';
    if (winter) for (let i = 0; i < 46; i++) { const s = 10 + rnd() * 14; g.globalAlpha = 0.5 + rnd() * 0.5; g.drawImage(im['particles/star'], rnd() * W - s / 2, rnd() * L.starsY1 - s / 2, s, s); }
    g.globalAlpha = 1;
    // ---- sky aurora (approximation of what the render should draw): 2 soft ribbons of vertical curtain strokes
    {
      const A = L.aurora, st = aur.strength, cols = aur.colors;
      g.save(); g.globalCompositeOperation = aur.blend;
      for (let rb = 0; rb < 2; rb++) {
        const yc = A.y0 + (A.y1 - A.y0) * (rb ? 0.55 : 0.32), hgt = (A.y1 - A.y0) * (rb ? 0.5 : 0.42);
        for (let x = -20; x < W + 20; x += 6) {
          const u = x / W, wv = Math.sin(u * 6.3 + rb * 2) * A.amp + Math.sin(u * 15 + rb) * A.amp * 0.35;
          const y = yc + wv, k = 0.55 + 0.45 * Math.sin(u * 9 + rb * 3) * Math.sin(u * 3.1 + 1);
          const ci = (u * 2 + rb * 0.7) % 2, col = ci < 1 ? cols[0] : cols[2], col2 = cols[1];
          const lgr = g.createLinearGradient(0, y - hgt / 2, 0, y + hgt / 2);
          const a = aur.alpha * st * Math.max(0.15, k) * (rb ? 0.7 : 1);
          const hexA = (h, al) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${al})`; };
          lgr.addColorStop(0, hexA(col, 0)); lgr.addColorStop(0.35, hexA(col, a * 0.6)); lgr.addColorStop(0.7, hexA(col2, a)); lgr.addColorStop(1, hexA(col2, 0));
          g.fillStyle = lgr; g.fillRect(x, y - hgt / 2, 7, hgt);
        }
      }
      g.restore();
    }
    const sn = L.sun[mood], si = winter ? im['env/moon'] : im['env/sun'];
    if (!winter) { const gl = g.createRadialGradient(sn.x, sn.y, sn.size * 0.2, sn.x, sn.y, sn.size * 1.2); const warm = mood === 'autumn' ? '255,205,150' : '255,250,225'; gl.addColorStop(0, `rgba(${warm},0.45)`); gl.addColorStop(1, `rgba(${warm},0)`); g.fillStyle = gl; g.beginPath(); g.arc(sn.x, sn.y, sn.size * 1.2, 0, 7); g.fill(); }
    g.drawImage(si, sn.x - sn.size / 2, sn.y - sn.size / 2, sn.size, sn.size);
    const nC = winter ? 1 : mood === 'summer' ? 2 : 3;
    for (let i = 0; i < nC; i++) {
      const ci = im[i % 2 ? 'env/cloud_b' : 'env/cloud_a'], s = L.clouds.s * (0.8 + 0.4 * rnd()), x = (i + 0.3 + rnd() * 0.4) * W / nC, y = L.clouds.y0 + rnd() * (L.clouds.y1 - L.clouds.y0);
      g.globalAlpha = winter ? 0.2 : mood === 'autumn' ? 0.75 : 0.9; g.drawImage(ci, x - 150 * s, y - 70 * s, 300 * s, 140 * s);
    }
    g.globalAlpha = 1;
    const lay = (name, Ly) => { for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(im[name], x, Ly.y, Ly.w + 0.5, Ly.h); };
    lay('env/far_' + mood, L.far); lay('env/mid_' + mood, L.mid); lay('env/ground_' + mood, L.ground);
    g.fillStyle = groundBottom; g.fillRect(0, L.ground.fillY - 1, W, H - L.ground.fillY + 1);
    if (winter) { // the render's soft moonlight glow over the drift field (approximation)
      const lg = g.createRadialGradient(W * 0.58, H * 0.8, 20, W * 0.58, H * 0.8, Math.max(W, H) * 0.55);
      lg.addColorStop(0, 'rgba(205,222,255,0.24)'); lg.addColorStop(1, 'rgba(205,222,255,0)'); g.fillStyle = lg; g.fillRect(0, L.sandY, W, H - L.sandY);
    }
    // ---- placeholders: bubble, HUD, aurora ribbon (shelf) with finds, drifts with peeking hats, Nuka
    const rr = (x, y, w, h, r, fill, st, lw = 4) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); if (st) { g.lineWidth = lw; g.strokeStyle = st; g.stroke(); } };
    rr(U.bubble.x, U.bubble.y, U.bubble.w, U.bubble.h, 26, 'rgba(255,255,255,0.93)');
    rr(W - 160, 16, 144, 64, 20, 'rgba(255,255,255,0.9)');
    const sh = U.shelf, my = sh.y + sh.h * 0.55;
    g.save(); g.globalCompositeOperation = winter ? 'lighter' : 'source-over';
    const rib = g.createLinearGradient(sh.x, 0, sh.x + sh.w, 0); rib.addColorStop(0, 'rgba(127,227,176,0.45)'); rib.addColorStop(0.5, 'rgba(111,211,224,0.5)'); rib.addColorStop(1, 'rgba(185,163,240,0.45)');
    g.strokeStyle = rib; g.lineCap = 'round'; g.lineWidth = 34; g.beginPath(); for (let x = sh.x; x <= sh.x + sh.w; x += 8) { const y = my + Math.sin((x - sh.x) / 70) * 8; x === sh.x ? g.moveTo(x, y) : g.lineTo(x, y); } g.stroke(); g.restore();
    const hat = (x, y, s, col) => { // beanie: dome + ribbed brim + pompom (placeholder)
      g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.3)';
      g.beginPath(); g.ellipse(x, y - s * 0.95, s * 0.2, s * 0.2, 0, 0, 7); g.fillStyle = col; g.fill(); g.stroke();
      g.beginPath(); g.ellipse(x, y - s * 0.38, s * 0.42, s * 0.45, 0, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
      rr(x - s * 0.46, y - s * 0.4, s * 0.92, s * 0.22, 8, col, 'rgba(0,0,0,0.3)');
    };
    for (let i = 0; i < 4; i++) hat(sh.x + sh.w / 2 + (i - 1.5) * 76, my + 22, 50, hats[i]);
    U.mounds.forEach((m, i) => {
      const w = U.item * 1.55, h0 = U.item * 0.62, col = hats[i % hats.length];
      g.save(); g.globalAlpha = 0.25; g.fillStyle = '#5F7A96'; g.beginPath(); g.ellipse(m.x + 6, m.y + 2, w * 0.55, 12, 0, 0, 7); g.fill(); g.restore();
      hat(m.x, m.y - h0 * 0.62, U.item * 0.9, col);
      g.beginPath(); g.moveTo(m.x - w / 2, m.y); g.bezierCurveTo(m.x - w * 0.42, m.y - h0 * 1.05, m.x - w * 0.2, m.y - h0, m.x, m.y - h0 * 0.98); g.bezierCurveTo(m.x + w * 0.2, m.y - h0, m.x + w * 0.42, m.y - h0 * 1.05, m.x + w / 2, m.y); g.closePath();
      g.fillStyle = winter ? '#C9D6EA' : '#F4F8FC'; g.fill(); g.lineWidth = 4; g.strokeStyle = winter ? '#6F86A6' : '#8FA9BF'; g.stroke();
      g.save(); g.clip(); g.fillStyle = winter ? '#A9BAD4' : '#CFDDEA'; g.beginPath(); g.ellipse(m.x + w * 0.3, m.y, w * 0.32, h0 * 0.6, 0, 0, 7); g.fill(); g.restore();
      g.beginPath(); g.ellipse(m.x - w * 0.16, m.y - h0 * 0.7, w * 0.14, h0 * 0.12, -0.3, 0, 7); g.fillStyle = '#FFFFFF'; g.fill();
    });
    const b = U.bun; g.lineWidth = 5; g.strokeStyle = '#9A8C74'; g.fillStyle = '#FBF5E8';
    g.beginPath(); g.ellipse(b.x, b.y - b.h * 0.3, b.h * 0.3, b.h * 0.3, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(b.x + b.h * 0.04, b.y - b.h * 0.72, b.h * 0.26, b.h * 0.23, 0, 0, 7); g.fill(); g.stroke();
    for (const dx of [-0.17, 0.2]) { g.beginPath(); g.arc(b.x + b.h * dx, b.y - b.h * 0.92, b.h * 0.06, 0, 7); g.fill(); g.stroke(); }
    g.beginPath(); g.ellipse(b.x + b.h * 0.02, b.y - b.h * 0.52, b.h * 0.27, b.h * 0.055, 0, 0, 7); g.fillStyle = '#A8714A'; g.strokeStyle = '#7A4E30'; g.fill(); g.stroke();
    // a few mood particles
    const pk = { spring: ['petal', 'mote'], summer: ['fluff', 'mote'], autumn: ['leaf_a', 'leaf_b'], winter: ['snow', 'snow'] }[mood];
    for (let i = 0; i < 14; i++) { const p = im['particles/' + pk[i % 2]], s = 16 + (i % 4) * 6, x = (i * 0.618 % 1) * W, y = (winter ? 0.05 : 0.3) * H + ((i * 0.37) % 1) * H * 0.65; g.drawImage(p, x, y, s, s); }
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
    const c = document.createElement('canvas'); c.width = 20 + parts.length * 110; c.height = 560; const g = c.getContext('2d');
    g.fillStyle = '#D4EEF8'; g.fillRect(0, 0, c.width, 130); g.fillStyle = '#26345E'; g.fillRect(0, 130, c.width, 130); g.fillStyle = '#E2EBF3'; g.fillRect(0, 260, c.width, 300);
    let x = 20;
    for (const p of parts) { const im = await load(src['particles/' + p]); for (const y0 of [0, 130, 260]) g.drawImage(im, x, y0 + 17, 90, 90); x += 110; }
    x = 20; for (const e of extras) { const im = await load(src[e]); const w = e.includes('cloud') ? 300 : 200, h = e.includes('cloud') ? 140 : 200; const k = 160 / Math.max(w, h); g.fillStyle = '#86CBEF'; g.fillRect(x - 6, 384, w * k + 12, h * k + 12); g.drawImage(im, x, 390, w * k, h * k); x += w * k + 30; }
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
    save(await pg.evaluate(pageScene, { mood: m, W, H, L, U, src: SRC, sky: ENV.SKY[m], groundBottom: ENV.GROUND_BOTTOM[m], hats: HATS[m], aur: AURORA[m] }), path.join(ART, `env_${vp}_${m}.png`));
    if (m === 'spring') console.log(vp, JSON.stringify({ sandY: L.sandY, hillTop: Math.round(L.hillTop), kf: L.far.k, km: L.mid.k, kg: +L.ground.k.toFixed(2), farY: Math.round(L.far.y), midY: Math.round(L.mid.y), groundY: Math.round(L.ground.y), fillY: Math.round(L.ground.fillY), sun: L.sun.spring, aurora: L.aurora }));
  }
  if (!only || only === 'sheet') save(await pg.evaluate(pageParticles, { src: SRC, parts: PARTS, extras: ['env/sun', 'env/moon', 'env/cloud_a', 'env/cloud_b'] }), path.join(ART, 'env_particles.png'));
  if (!only || only === 'seams') {
    const list = MOODS.flatMap(s => [['env/far_' + s, 1200, 720, 560, ENV.SKY[s][ENV.SKY[s].length - 1][1]], ['env/mid_' + s, 1200, 300, 180, ENV.SKY[s][ENV.SKY[s].length - 1][1]], ['env/ground_' + s, 1200, 260, 0, ENV.GROUND_BOTTOM[s]]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
