// Kiki's Camp Chimes: mountain-campsite environment RECIPE + preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]      (filter e.g. "night", "720x1556", "seams", "sheet")
// Writes docs/art/env_<1556x720|960x720|720x1556>_<mood>.png, docs/art/env_seams.png, docs/art/env_particles.png.
//
// ================================== RECIPE (render.js copies this; all numbers are logical px) ==================
// Same shape as the Pom's Puzzle Town recipe (render.js pastes envLayout / tileXs verbatim — pure, no DOM, no requires —
// plus the colour tables). DIFFERENCES from the town recipe (what the lead changes when porting render.js):
//   * MOODS are morning | noon | sunset | night (weather 0..3), not spring … winter.
//   * L.campY is the camp line (mid layer base = ground line). L.streetY and L.sandY are kept as aliases of campY.
//   * SKY: paint the gradient from y 0 to L.skyY1 (the lake horizon), fill below with the last stop. SKY.sunset has 3 stops
//     (violet band on top); weather may still supply skyTop/skyMid/skyBottom (use SKY[m][1] as skyMid for sunset).
//   * PAVE_BOTTOM → **GROUND_BOTTOM** (fill colour below the ground tile, below L.ground.fillY). RECIPE.PAVE_BOTTOM and
//     RECIPE.SAND_BOTTOM are aliases so the old code runs unchanged.
//   * L.sun[m] = {x, y, size} for all 4 moods (night = just below the ridge, so a sunset→night crossfade glides it down;
//     draw it with ambient.sunA, 0 at night). From fractions RECIPE.SUN[orientation][m] of the safe area; in landscape x is
//     pushed right of the bubble edge. Morning: low, rising from behind the ridge just right of the bubble; noon: high;
//     sunset: low right, half behind the peaks (draw the sun BEFORE far so peaks occlude it).
//   * NEW L.moon = {x, y, size}: env/moon.svg (200×200, crescent + glow), draw before far with ambient.moonA.
//   * NEW L.stars = {y1, n}: star field area 0…y1 (above the main ridge) and the count from RECIPE.STARS.density
//     (stars per px² of W × y1, capped at STARS.max). Draw before the moon / far; alpha = ambient.starsA.
//   * NEW RECIPE.CLOUDS[m] = {n, alpha, tint|null}: how many clouds and how strongly (tint = 'source-atop' overlay colour for
//     the white cloud art, e.g. warm at sunset, blue-grey at night).
//   * NEW RECIPE.TINT[m]: suggested ambient.tint for far/mid/ground = null — the layer SVGs already carry each mood
//     (night is drawn dark blue in the files). Do NOT darken chimes / Kiki; add the warm RIM[m] rim light instead.
//   * NEW RECIPE.LAKE = {y0, y1} lake strip in far-tile coords; L.lake = {y0, y1} on screen (for optional sparkle particles).
//   * L.clock = [] and L.volcano = [] (no clock tower / smoke): the town clock-hands loop is a no-op.
//
//   L = RECIPE.envLayout(W, H, ins)           (ins = safe-area insets {top,left,right,bottom}, may be omitted)
//   0 campY  = Landscape: round(0.60 H) (H=720 → 432); portrait: round(0.70 H) (720×1556 → 1089, 720×960 → 672).
//   1 sky    : vertical linear gradient SKY[m] from y 0 to L.skyY1, last stop below. Night: stars (L.stars) on top.
//   2 sun / moon at L.sun[m] / L.moon; clouds env/cloud_a|b (300×140) at scale L.clouds.s, centre y ∈ [L.clouds.y0, y1].
//   3 far    : tile far_m (L.far.w × L.far.h) at x ∈ tileXs(L.far.x0, L.far.w, W), top y = L.far.y; its bottom (720)
//              sits at campY − 30·km, behind the mid layer's meadow bank. Lake on screen = L.lake.
//   4 mid    : tile mid_m — its line y 298 (MID_BASE) lands on campY.
//   5 ground : tile ground_m — its line y 40 (GROUND_LINE) = campY; then fillRect(0, L.ground.fillY, W, H − fillY) with
//              GROUND_BOTTOM[m] when fillY < H.
//   Scale rule: background layers (far, mid) ×1.36 on tall portrait (H/W > 1.6), ×1.15 on other portrait
//   (kp; far k = 0.7·kp, mid k = 0.86·kp); ground kg = clamp((H − campY) / 220, 1, 1.8). Every layer is uniformly scaled so
//   CC.Assets.exact(name, round(w·rs), round(h·rs)) can pre-render it once. Mood crossfade: draw both moods' stacks with
//   alpha 1 / mix (same geometry).
// Landscape H=720 (any W): campY 432; far k 0.70 (y −98; back peaks ≈ y 112…150, main peaks ≈ 176…224, lake 330…388);
//   mid k 0.86 (y 176; pine tops ≈ 248…320, tents ≈ 356…428); ground k 1.31 (y 380, fillY 718). The upper ≈ 45 % is sky +
//   mountains (where the beam / chimes hang).
// Portrait 720×1556: campY 1089; far k 0.952 (main peaks ≈ 742…790), mid k 1.17, ground k 1.8 (fillY 1481, fill below).
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ENV = require('./art_env.js');

// sun / moon spots as fractions of W / H (+ the safe-area insets), size in px
const SUN = {
  // landscape x is pushed right of the bubble edge (x ≥ bubbleRight + size/2): morning rises from behind the ridge
  landscape: { morning: { x: 0.3, y: 0.17, size: 140 }, noon: { x: 0.71, y: 0.1, size: 150 }, sunset: { x: 0.84, y: 0.19, size: 176 }, night: { x: 0.86, y: 0.40, size: 150 } },
  portrait: { morning: { x: 0.2, y: 0.24, size: 120 }, noon: { x: 0.72, y: 0.18, size: 130 }, sunset: { x: 0.78, y: 0.43, size: 150 }, night: { x: 0.8, y: 0.52, size: 130 } },
};
const MOON = { landscape: { x: 0.74, y: 0.13, size: 130 }, portrait: { x: 0.74, y: 0.21, size: 120 } };
const STARS = { density: 1 / 4500, max: 180, r: [0.7, 2.1], twinkle: 0.3 };   // twinkle = fraction that twinkles (alpha wave)
const CLOUDS = {
  morning: { n: 2, alpha: 0.8, tint: 'rgba(255,226,206,0.45)' },
  noon: { n: 4, alpha: 0.95, tint: null },
  sunset: { n: 3, alpha: 0.85, tint: 'rgba(246,170,140,0.5)' },
  night: { n: 2, alpha: 0.22, tint: 'rgba(90,108,160,0.6)' },
};

/** Pure layout of the environment layers for a W × H screen. ins = safe-area insets (logical px). */
function envLayout(W, H, ins) {
  ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
  const portrait = H > W, tall = H / W > 1.6;
  const campY = Math.round(H * (portrait ? 0.70 : 0.60));
  const kp = portrait ? (tall ? 1.36 : 1.15) : 1;          // skill rule: background layers ×1.36 on tall portrait
  const kf = 0.7 * kp, km = 0.86 * kp;
  const kg = Math.max(1, Math.min(1.8, (H - campY) / 220));
  // far: the tallest main peak (far x 690) right of centre in landscape, centred in portrait
  const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(W * (portrait ? 0.5 : 0.62) - 690 * kf), y: Math.round(campY - 30 * km - 720 * kf) };
  // mid: the two tents (mid x 330 / 486) a bit left of centre, behind the chimes; ground: the path branch (x ≈ 600) centre
  const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(W * (portrait ? 0.5 : 0.45) - 410 * km), y: campY - 298 * km };
  const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: Math.round(W * (portrait ? 0.5 : 0.55) - 600 * kg), y: campY - 40 * kg };
  ground.fillY = ground.y + 258 * kg;
  const hillTop = far.y + 300 * kf;                         // highest back-range peak
  const skyY1 = Math.round(far.y + ENV.LAKE.y0 * kf);       // sky gradient end: the lake horizon
  const lake = { y0: skyY1, y1: Math.round(far.y + ENV.LAKE.y1 * kf) };
  const o = portrait ? 'portrait' : 'landscape', sun = {};
  const cw = W - ins.left - ins.right, ch = H - ins.top - ins.bottom;
  // landscape: the sky above the ridge is shared with the bubble (top-left) — keep the sun right of the bubble's edge (bx)
  const bx = ins.left + 24 + Math.min(560, W - ins.right - 200 - ins.left - 24);
  for (const m of ENV.MOODS) {
    const s = SUN[o][m]; let x = ins.left + s.x * cw;
    if (!portrait) x = Math.max(x, bx + s.size * 0.5);
    sun[m] = { x, y: ins.top + s.y * ch, size: s.size };
  }
  const mo = MOON[o], moon = { x: ins.left + mo.x * cw, y: ins.top + mo.y * ch, size: mo.size };
  const starsY1 = Math.round(far.y + 460 * kf);
  const stars = { y1: starsY1, n: Math.min(STARS.max, Math.round(W * starsY1 * STARS.density)) };
  const clouds = portrait
    ? { y0: ins.top + 0.05 * H, y1: ins.top + 0.30 * H, s: 0.5 }
    : { y0: ins.top + 30, y1: ins.top + 150, s: 0.6 };
  return { portrait, tall, campY, streetY: campY, sandY: campY, kp, far, mid, ground, hillTop, skyY1, lake, sun, moon, stars, clouds, clock: [], volcano: [], starsY1 };
}
/** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }

const RECIPE = {
  MOODS: ENV.MOODS,                 // ['morning','noon','sunset','night'] = weather 0..3
  SKY: ENV.SKY,                     // { mood: [[offset, colour], …] } from y 0 to L.skyY1
  MEADOW: ENV.MEADOW,               // meadow colour at the top of the ground tile (reference / tints)
  GROUND_BOTTOM: ENV.GROUND_BOTTOM, // fill colour below the ground tile
  PAVE_BOTTOM: ENV.GROUND_BOTTOM,   // alias for the town render code
  SAND_BOTTOM: ENV.GROUND_BOTTOM,   // alias for the dig render code
  RIM: ENV.RIM,                     // warm rim-light colour per mood (night = fire / lantern light)
  TINT: { morning: null, noon: null, sunset: null, night: null },   // no overlay needed: the SVGs carry the mood
  LAKE: ENV.LAKE,                   // lake strip in far-tile coords
  TILES: { far: [1200, 720, 720], mid: [1200, 300, 298], ground: [1200, 260, 40] }, // [w, h, line that maps to its anchor]
  SUN, MOON, STARS, CLOUDS,
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
const PARTS = ['mist', 'mote', 'sparkle', 'star', 'ember', 'firefly', 'leaf', 'butterfly', 'confetti_a', 'confetti_b', 'dot', 'dust', 'note'];
const NAMES = ['env/sun', 'env/moon', 'env/cloud_a', 'env/cloud_b', ...MOODS.flatMap(s => ['far', 'mid', 'ground'].map(l => `env/${l}_${s}`)), ...PARTS.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const CHIMES = { morning: ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B'], noon: ['#FF9A2E', '#8E44AD', '#3C8DE8', '#4CC26B'], sunset: ['#3C8DE8', '#E84A4A', '#4CC26B', '#FFD23F'], night: ['#E84A4A', '#FF9A2E', '#4CC26B', '#8E44AD'] };

// placeholder UI (DESIGN §2, zero insets) — only for judging the previews
function uiLayout(W, H) {
  const portrait = H > W, groundY = H - (portrait ? 26 : 14), item = 112;
  if (!portrait) {
    const bubble = { x: 24, y: 18, w: Math.min(560, W - 224), h: 122 };
    const kiki = { x: 118, y: groundY - 4, h: 230 }, fire = { x: kiki.x + 150, y: groundY - 6, s: 1 };
    const beam = { x0: 250, x1: W - 36, y: Math.max(210, bubble.y + bubble.h + 92) };
    return { portrait, groundY, bubble, kiki, fire, beam, item, cord: [90, 150] };
  }
  const bubble = { x: 24, y: 110, w: W - 48, h: 124 };
  const kiki = { x: 104, y: groundY - 4, h: 200 }, fire = { x: W - 120, y: groundY - 6, s: 0.9 };
  const beam = { x0: 36, x1: W - 36, y: Math.max(bubble.y + bubble.h + 92, kiki.y - kiki.h - 60 - 190 - item) };
  return { portrait, groundY, bubble, kiki, fire, beam, item, cord: [110, 190] };
}

function pageScene({ mood, W, H, L, U, src, sky, groundBottom, cols, clouds, starsCfg }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  const tileXs = (x0, tw, W) => { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; };
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const night = mood === 'night';
    const gr = g.createLinearGradient(0, 0, 0, L.skyY1); for (const [o, col] of sky) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    if (night) {   // star field
      for (let i = 0; i < L.stars.n; i++) {
        const x = rnd() * W, y = rnd() * L.stars.y1, r = starsCfg.r[0] + Math.pow(rnd(), 2.2) * (starsCfg.r[1] - starsCfg.r[0]);
        g.globalAlpha = 0.45 + 0.55 * rnd() * (1 - y / L.stars.y1 * 0.5); g.fillStyle = '#FFF6DE'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
        if (r > 1.8) { g.globalAlpha = 0.9; g.drawImage(im['particles/star'], x - 9, y - 9, 18, 18); }
      }
      g.globalAlpha = 1;
      const mo = L.moon; g.drawImage(im['env/moon'], mo.x - mo.size / 2, mo.y - mo.size / 2, mo.size, mo.size);
    } else {
      const sn = L.sun[mood];
      const glow = g.createRadialGradient(sn.x, sn.y, sn.size * 0.2, sn.x, sn.y, sn.size * 1.3);
      const warm = mood === 'sunset' ? '255,200,150' : '255,248,220';
      glow.addColorStop(0, `rgba(${warm},0.45)`); glow.addColorStop(1, `rgba(${warm},0)`);
      g.fillStyle = glow; g.beginPath(); g.arc(sn.x, sn.y, sn.size * 1.3, 0, 7); g.fill();
      g.drawImage(im['env/sun'], sn.x - sn.size / 2, sn.y - sn.size / 2, sn.size, sn.size);
    }
    const cc = clouds[mood];
    for (let i = 0; i < cc.n; i++) {
      const ci = im[i % 2 ? 'env/cloud_b' : 'env/cloud_a'], s = L.clouds.s * (0.8 + 0.4 * rnd()), x = (i + 0.3 + rnd() * 0.4) * W / cc.n, y = L.clouds.y0 + rnd() * (L.clouds.y1 - L.clouds.y0);
      const w = 300 * s, h = 140 * s;
      const off = document.createElement('canvas'); off.width = Math.ceil(w); off.height = Math.ceil(h); const o2 = off.getContext('2d');
      o2.drawImage(ci, 0, 0, w, h); if (cc.tint) { o2.globalCompositeOperation = 'source-atop'; o2.fillStyle = cc.tint; o2.fillRect(0, 0, w, h); }
      g.globalAlpha = cc.alpha; g.drawImage(off, x - w / 2, y - h / 2);
    }
    g.globalAlpha = 1;
    const lay = (name, Ly) => { for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(im[name], x, Ly.y, Ly.w + 0.5, Ly.h); };
    lay('env/far_' + mood, L.far); lay('env/mid_' + mood, L.mid); lay('env/ground_' + mood, L.ground);
    if (L.ground.fillY < H) { g.fillStyle = groundBottom; g.fillRect(0, L.ground.fillY - 1, W, H - L.ground.fillY + 1); }
    // ---- placeholders: bubble, HUD, beam + posts + garland, chimes (bells), Kiki blob, campfire
    const rr = (x, y, w, h, r, fill) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); };
    rr(U.bubble.x, U.bubble.y, U.bubble.w, U.bubble.h, 26, 'rgba(255,255,255,0.93)');
    rr(W - 160, 16, 144, 64, 20, 'rgba(255,255,255,0.9)');
    const B = U.beam, gy = U.groundY;
    g.lineCap = 'round';
    for (const px of [B.x0, B.x1]) { g.strokeStyle = '#6E4526'; g.lineWidth = 26; g.beginPath(); g.moveTo(px, B.y - 70); g.lineTo(px, gy); g.stroke(); g.strokeStyle = '#A87245'; g.lineWidth = 20; g.stroke(); }
    // garland + lanterns
    const gY = B.y - 62; g.strokeStyle = night ? '#8C7A66' : '#7A5C40'; g.lineWidth = 2; g.beginPath(); g.moveTo(B.x0, gY); g.quadraticCurveTo((B.x0 + B.x1) / 2, gY + 52, B.x1, gY); g.stroke();
    for (let i = 0; i < 4; i++) {
      const t = (i + 1) / 5, x = B.x0 + (B.x1 - B.x0) * t, y = gY + 4 * 26 * t * (1 - t), lit = i < 2;
      if (lit) { const lg = g.createRadialGradient(x, y + 16, 4, x, y + 16, 60); lg.addColorStop(0, 'rgba(255,214,140,0.65)'); lg.addColorStop(1, 'rgba(255,214,140,0)'); g.fillStyle = lg; g.beginPath(); g.arc(x, y + 16, 60, 0, 7); g.fill(); }
      g.fillStyle = lit ? '#FFE3A8' : '#F6E7C8'; g.strokeStyle = '#B89870'; g.lineWidth = 3; g.beginPath(); g.ellipse(x, y + 18, 15, 18, 0, 0, 7); g.fill(); g.stroke();
    }
    g.strokeStyle = '#6E4526'; g.lineWidth = 32; g.beginPath(); g.moveTo(B.x0 - 18, B.y); g.lineTo(B.x1 + 18, B.y); g.stroke(); g.strokeStyle = '#A87245'; g.lineWidth = 26; g.stroke();
    g.strokeStyle = '#D29A66'; g.lineWidth = 4; g.beginPath(); g.moveTo(B.x0, B.y - 7); g.lineTo(B.x1, B.y - 7); g.stroke();
    const n = 4, sp = Math.max(1.3 * U.item, Math.min(1.7 * U.item, (B.x1 - B.x0) / n)), cx0 = (B.x0 + B.x1) / 2 - sp * (n - 1) / 2;
    const cords = [U.cord[0] + 20, U.cord[1], U.cord[0], U.cord[1] - 30];
    for (let i = 0; i < n; i++) {
      const x = cx0 + i * sp, top = B.y + 12 + cords[i], s = U.item, col = cols[i];
      g.strokeStyle = '#B49470'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, B.y + 10); g.lineTo(x, top); g.stroke();
      g.fillStyle = '#D8B26A'; g.beginPath(); g.arc(x, top + 4, 7, 0, 7); g.fill();
      const w = s * 0.86;
      g.beginPath(); g.moveTo(x - w * 0.3, top + 10); g.quadraticCurveTo(x - w * 0.36, top + s * 0.62, x - w / 2, top + s * 0.86); g.lineTo(x + w / 2, top + s * 0.86); g.quadraticCurveTo(x + w * 0.36, top + s * 0.62, x + w * 0.3, top + 10); g.quadraticCurveTo(x, top - 6, x - w * 0.3, top + 10);
      g.fillStyle = col; g.fill(); g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.28)'; g.stroke();
      if (night) { g.strokeStyle = 'rgba(255,211,138,0.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + w * 0.26, top + 16); g.quadraticCurveTo(x + w * 0.32, top + s * 0.6, x + w * 0.44, top + s * 0.82); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.ellipse(x - w * 0.14, top + s * 0.32, 7, 16, 0.2, 0, 7); g.fill();
      g.fillStyle = '#D8B26A'; g.beginPath(); g.arc(x, top + s * 0.92, 9, 0, 7); g.fill();
    }
    // campfire
    const F = U.fire, fs_ = F.s;
    if (night || mood === 'sunset') { const fg = g.createRadialGradient(F.x, F.y - 20, 10, F.x, F.y - 20, 220); fg.addColorStop(0, `rgba(255,190,110,${night ? 0.4 : 0.22})`); fg.addColorStop(1, 'rgba(255,190,110,0)'); g.fillStyle = fg; g.beginPath(); g.arc(F.x, F.y - 20, 220, 0, 7); g.fill(); }
    g.fillStyle = '#8C8478'; for (let k = -3; k <= 3; k++) { g.beginPath(); g.ellipse(F.x + k * 15 * fs_, F.y, 9 * fs_, 7 * fs_, 0, 0, 7); g.fill(); }
    g.fillStyle = '#FF9A2E'; g.beginPath(); g.moveTo(F.x - 30 * fs_, F.y - 6); g.quadraticCurveTo(F.x - 26 * fs_, F.y - 60 * fs_, F.x, F.y - 96 * fs_); g.quadraticCurveTo(F.x + 26 * fs_, F.y - 60 * fs_, F.x + 30 * fs_, F.y - 6); g.fill();
    g.fillStyle = '#FFD23F'; g.beginPath(); g.moveTo(F.x - 16 * fs_, F.y - 6); g.quadraticCurveTo(F.x - 14 * fs_, F.y - 40 * fs_, F.x, F.y - 62 * fs_); g.quadraticCurveTo(F.x + 14 * fs_, F.y - 40 * fs_, F.x + 16 * fs_, F.y - 6); g.fill();
    // Kiki placeholder (chestnut monkey blob, cream face + bandana)
    const P = U.kiki; g.lineWidth = 5; g.strokeStyle = '#4E2F1F';
    g.fillStyle = '#8A5A3B'; g.beginPath(); g.ellipse(P.x, P.y - P.h * 0.28, P.h * 0.26, P.h * 0.28, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(P.x, P.y - P.h * 0.7, P.h * 0.27, P.h * 0.25, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#F2D9B8'; g.beginPath(); g.ellipse(P.x + P.h * 0.03, P.y - P.h * 0.66, P.h * 0.18, P.h * 0.16, 0, 0, 7); g.fill();
    g.fillStyle = '#F1E6CF'; g.beginPath(); g.ellipse(P.x, P.y - P.h * 0.48, P.h * 0.22, P.h * 0.06, 0, 0, 7); g.fill();
    // a few mood particles
    const pk = { morning: ['mist', 'mote'], noon: ['butterfly', 'leaf'], sunset: ['ember', 'mote'], night: ['firefly', 'ember'] }[mood];
    for (let i = 0; i < 14; i++) { const name = pk[i % 2], p = im['particles/' + name], s = 18 + (i % 4) * 6, x = (i * 0.618 % 1) * W, y = ((i * 0.37 + 0.05) % 1) * H; g.drawImage(p, x, y, name === 'mist' ? s * 4 : s, name === 'mist' ? s * 2 : s); }
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
    const c = document.createElement('canvas'); c.width = 1720; c.height = 560; const g = c.getContext('2d');
    g.fillStyle = '#D6F0FB'; g.fillRect(0, 0, 1720, 130); g.fillStyle = '#2C3D58'; g.fillRect(0, 130, 1720, 130); g.fillStyle = '#A6BD8C'; g.fillRect(0, 260, 1720, 300);
    let x = 20;
    for (const p of parts) { const im = await load(src['particles/' + p]); for (const y0 of [0, 130, 260]) p === 'mist' ? g.drawImage(im, x - 24, y0 + 41, 144, 72) : g.drawImage(im, x, y0 + 17, 96, 96); x += 130; }
    x = 20; for (const e of extras) { const im = await load(src[e]); const w = e.includes('cloud') ? 300 : 200, h = e.includes('cloud') ? 140 : 200; const k = 160 / Math.max(w, h); g.fillStyle = e.includes('moon') ? '#1E2A4A' : 'rgba(0,0,0,0)'; g.fillRect(x - 10, 380, w * k + 20, h * k + 20); g.drawImage(im, x, 390, w * k, h * k); x += w * k + 40; }
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
    save(await pg.evaluate(pageScene, { mood: m, W, H, L, U, src: SRC, sky: ENV.SKY[m], groundBottom: ENV.GROUND_BOTTOM[m], cols: CHIMES[m], clouds: CLOUDS, starsCfg: STARS }), path.join(ART, `env_${vp}_${m}.png`));
    if (m === 'morning') console.log(vp, JSON.stringify({ campY: L.campY, skyY1: L.skyY1, hillTop: Math.round(L.hillTop), lake: L.lake, kf: +L.far.k.toFixed(3), km: +L.mid.k.toFixed(3), kg: +L.ground.k.toFixed(2), farY: Math.round(L.far.y), midY: Math.round(L.mid.y), groundY: Math.round(L.ground.y), fillY: Math.round(L.ground.fillY), stars: L.stars, beamY: U.beam.y }));
  }
  if (!only || only === 'sheet') save(await pg.evaluate(pageParticles, { src: SRC, parts: PARTS, extras: ['env/sun', 'env/moon', 'env/cloud_a', 'env/cloud_b'] }), path.join(ART, 'env_particles.png'));
  if (!only || only === 'seams') {
    const last = s => ENV.SKY[s][ENV.SKY[s].length - 1][1];
    const list = MOODS.flatMap(s => [['env/far_' + s, 1200, 720, 420, last(s)], ['env/mid_' + s, 1200, 300, 150, last(s)], ['env/ground_' + s, 1200, 260, 0, ENV.GROUND_BOTTOM[s]]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
