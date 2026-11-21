// Bibi's Cloud Drums: rainbow cloud-land environment RECIPE + preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]      (filter e.g. "night", "720x1556", "seams", "sheet")
// Writes docs/art/env_<1556x720|960x720|720x1556>_<mood>.png, docs/art/env_seams.png, docs/art/env_particles.png.
//
// ================================== RECIPE (render.js copies this; all numbers are logical px) ==================
// The layer GEOMETRY is the camp game's (render.js envLayout / tileXs are pasted verbatim — pure, no DOM, no requires), so
// only the constant tables change: SKY, GROUND_BOTTOM, ENV (LAKE = the cloud-sea horizon), SUN, MOON, STARS, CLOUDS.
//   * MOODS are morning | noon | sunset | night (weather 0..3).
//   * L.campY = the cloud-floor line (mid layer base = ground line). L.streetY / L.sandY are aliases of campY.
//   * SKY: paint the gradient from y 0 to L.skyY1 (the cloud-sea horizon), fill below with the last stop. SKY.sunset has 3
//     stops (violet on top, peach at 0.45 → weather's skyMid sits at 0.45 in render.js, so they match).
//   * GROUND_BOTTOM: fill colour below the ground tile (below L.ground.fillY). PAVE_BOTTOM / SAND_BOTTOM are aliases.
//   * L.sun[m] = {x, y, size} for all 4 moods (night = low, so a sunset→night crossfade glides it down; draw with
//     ambient.sunA). Landscape x is pushed right of the bubble edge. Draw the sun BEFORE far so cloud mountains occlude it.
//   * L.moon = {x, y, size}: env/moon.svg (200×200, crescent, no face), drawn before far with ambient.moonA.
//   * L.stars = {y1, n}: star field 0…y1, density RECIPE.STARS.density (per px² of W × y1), capped at STARS.max.
//   * RECIPE.CLOUDS[m] = {n, alpha, tint|null}: cloud count / strength and the 'source-atop' overlay for the white art.
//   * RECIPE.TINT[m] = ambient.tint overlay (weather.js MOODS[].tint): null by day; night a whisper — the SVGs carry the
//     mood (night is drawn deep blue-lilac). Never darken drums / Bibi; use the RIM[m] rim light instead.
//   * RECIPE.LAKE (= HORIZON {y0 560, y1 700}) = the cloud-sea strip in far-tile coords; L.lake = its screen span (no
//     special drawing needed; it only ends the sky gradient — L.skyY1 = L.lake.y0).
//   * NEW env/rainbow.svg (600×300, bottom-anchored arc with cloud feet) for the celebration (not part of the backdrop).
//
//   L = RECIPE.envLayout(W, H, ins)           (ins = safe-area insets {top,left,right,bottom}, may be omitted)
//   0 campY  = Landscape: round(0.60 H) (H=720 → 432); portrait: round(0.70 H) (720×1556 → 1089, 720×960 → 672).
//   1 sky    : vertical linear gradient SKY[m] from y 0 to L.skyY1, last stop below. Night: stars (L.stars) on top.
//   2 sun / moon at L.sun[m] / L.moon; clouds env/cloud_a|b (300×140) at scale L.clouds.s, centre y ∈ [L.clouds.y0, y1].
//   3 far    : tile far_m (L.far.w × L.far.h) at x ∈ tileXs(L.far.x0, L.far.w, W), top y = L.far.y; its bottom (720)
//              sits at campY − 30·km, behind the mid layer's front hills.
//   4 mid    : tile mid_m — its line y 298 (MID_BASE) lands on campY.
//   5 ground : tile ground_m — its line y 40 (GROUND_LINE) = campY; then fillRect(0, L.ground.fillY, W, H − fillY) with
//              GROUND_BOTTOM[m] when fillY < H.
//   Scale rule: background layers (far, mid) ×1.36 on tall portrait (H/W > 1.6), ×1.15 on other portrait
//   (kp; far k = 0.7·kp, mid k = 0.86·kp); ground kg = clamp((H − campY) / 220, 1, 1.8). Every layer is uniformly scaled so
//   CD.Assets.exact(name, round(w·rs), round(h·rs)) can pre-render it once. Mood crossfade: draw both moods' stacks with
//   alpha 1 / mix (same geometry).
// Landscape H=720 (any W): campY 432; far k 0.70 (y −98; rainbow top ≈ 49, islands ≈ 40…120, back cloud mountains
//   ≈ 112…196, main ≈ 210…238, skyY1 294); mid k 0.86 (y 176; hills ≈ 305…360, cottages ≈ 300…410); ground k 1.31
//   (y 380, floor 432…718, fillY 718). The drum band (cushion tops ≈ groundY − 150 ≈ 556) sits on the light cloud floor.
// Portrait 720×1556: campY 1089; far k 0.952 (y 369), mid k 1.17, ground k 1.8 (fillY 1481, fill below).
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ENV = require('./art_env.js');

// sun / moon spots as fractions of W / H (+ the safe-area insets), size in px
const SUN = {
  // landscape x is pushed right of the bubble edge (x ≥ bubbleRight + size/2); morning low, rising over the cloud mountains
  landscape: { morning: { x: 0.3, y: 0.2, size: 140 }, noon: { x: 0.71, y: 0.1, size: 150 }, sunset: { x: 0.84, y: 0.15, size: 176 }, night: { x: 0.86, y: 0.40, size: 150 } },
  portrait: { morning: { x: 0.2, y: 0.24, size: 120 }, noon: { x: 0.72, y: 0.18, size: 130 }, sunset: { x: 0.78, y: 0.27, size: 150 }, night: { x: 0.8, y: 0.40, size: 130 } },
};
const MOON = { landscape: { x: 0.74, y: 0.13, size: 130 }, portrait: { x: 0.74, y: 0.2, size: 120 } };
const STARS = { density: 1 / 3800, max: 200, r: [0.7, 2.1], twinkle: 0.35 };   // twinkle = fraction that twinkles (alpha wave)
const CLOUDS = {
  morning: { n: 3, alpha: 0.85, tint: 'rgba(255,214,226,0.35)' },
  noon: { n: 4, alpha: 0.95, tint: null },
  sunset: { n: 3, alpha: 0.85, tint: 'rgba(255,190,170,0.42)' },
  night: { n: 2, alpha: 0.3, tint: 'rgba(84,94,160,0.62)' },
};
const TINT = { morning: null, noon: null, sunset: null, night: 'rgba(20,24,70,0.08)' };   // = weather.js MOODS[].tint

/** Pure layout of the environment layers for a W × H screen. ins = safe-area insets (logical px). */
function envLayout(W, H, ins) {
  ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
  const portrait = H > W, tall = H / W > 1.6;
  const campY = Math.round(H * (portrait ? 0.70 : 0.60));
  const kp = portrait ? (tall ? 1.36 : 1.15) : 1;          // skill rule: background layers ×1.36 on tall portrait
  const kf = 0.7 * kp, km = 0.86 * kp;
  const kg = Math.max(1, Math.min(1.8, (H - campY) / 220));
  // far: x 690 (between the rainbow centre and the right island) right of centre in landscape, centred in portrait
  const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(W * (portrait ? 0.5 : 0.62) - 690 * kf), y: Math.round(campY - 30 * km - 720 * kf) };
  // mid: the two cottages (mid x 300 / 545) a bit left of centre, behind the drums; ground: tile centre (x 600)
  const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(W * (portrait ? 0.5 : 0.45) - 410 * km), y: campY - 298 * km };
  const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: Math.round(W * (portrait ? 0.5 : 0.55) - 600 * kg), y: campY - 40 * kg };
  ground.fillY = ground.y + 258 * kg;
  const hillTop = far.y + 300 * kf;                         // highest back cloud-mountain top
  const skyY1 = Math.round(far.y + ENV.LAKE.y0 * kf);       // sky gradient end: the cloud-sea horizon
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
  FLOOR: ENV.FLOOR,                 // cloud-floor colour at the top of the ground tile (reference / tints)
  MEADOW: ENV.FLOOR,                // alias (camp name)
  GROUND_BOTTOM: ENV.GROUND_BOTTOM, // fill colour below the ground tile
  PAVE_BOTTOM: ENV.GROUND_BOTTOM,   // alias for the town render code
  SAND_BOTTOM: ENV.GROUND_BOTTOM,   // alias for the dig render code
  RIM: ENV.RIM,                     // warm rim-light colour per mood (night = window / lantern light)
  TINT,                             // ambient.tint overlay per mood (weather.js)
  LAKE: ENV.HORIZON,                // cloud-sea strip in far-tile coords (render.js ENV.LAKE)
  HORIZON: ENV.HORIZON,
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
const NAMES = ['env/sun', 'env/moon', 'env/cloud_a', 'env/cloud_b', 'env/rainbow', ...MOODS.flatMap(s => ['far', 'mid', 'ground'].map(l => `env/${l}_${s}`)), ...PARTS.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const DRUMS6 = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD'];
const DRUMS = { morning: DRUMS6, noon: DRUMS6.slice(2).concat(DRUMS6.slice(0, 2)), sunset: DRUMS6.slice(4).concat(DRUMS6.slice(0, 4)), night: DRUMS6.slice(1).concat(DRUMS6.slice(0, 1)) };

// placeholder UI (DESIGN §2, zero insets) — only for judging the previews: bubble, HUD, star-lantern string, drums on
// cushions in the middle band (answer colours), Bibi (apricot blob) and the cymbal
function uiLayout(W, H) {
  const portrait = H > W, groundY = H - (portrait ? 26 : 14);
  if (!portrait) {
    const item = 112, bubble = { x: 24, y: 18, w: Math.min(560, W - 224), h: 122 };
    const bibi = { x: 118, y: groundY - 4, h: 230 }, cymbal = { x: bibi.x + 150, y: groundY - 6 };
    const garland = { x0: 250, x1: W - 40, y: bubble.y + bubble.h + 46, sag: 22 };
    const n = W > 1200 ? 6 : 4, x0 = 250 + item * 0.7, x1 = W - 40 - item * 0.7, pads = [];
    for (let i = 0; i < n; i++) pads.push({ x: x0 + (x1 - x0) * i / (n - 1), y: groundY - 150 + [0, -28, 18, -14, 26, -24][i] });
    return { portrait, groundY, bubble, bibi, cymbal, garland, pads, item };
  }
  const item = Math.round(112 * 1.15), bubble = { x: 24, y: 110, w: W - 48, h: 124 };
  const bibi = { x: 104, y: groundY - 4, h: 200 }, cymbal = { x: W - 110, y: groundY - 6 };
  const garland = { x0: 36, x1: W - 36, y: bubble.y + bubble.h + 46, sag: 22 };
  const base = bibi.y - bibi.h - 60, pads = [];
  for (let i = 0; i < 6; i++) pads.push({ x: 36 + item * 0.7 + (W - 72 - item * 1.4) * (i % 3) / 2 + (i < 3 ? 0 : item * 0.55) - (i < 3 ? item * 0.2 : 0), y: base - (i < 3 ? item * 1.05 * 2.1 : item * 1.05 * 0.4) - (i % 2) * 18 });
  return { portrait, groundY, bubble, bibi, cymbal, garland, pads, item };
}

function pageScene({ mood, W, H, L, U, src, sky, groundBottom, cols, clouds, starsCfg, tint }) {
  const load = s => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => j(new Error('bad image ' + s.slice(0, 60))); i.src = s; });
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
      const warm = mood === 'sunset' ? '255,196,140' : mood === 'morning' ? '255,226,190' : '255,248,220';
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
    if (tint) { g.fillStyle = tint; g.fillRect(0, 0, W, H); }
    // ---- placeholders
    const rr = (x, y, w, h, r, fill) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); };
    rr(U.bubble.x, U.bubble.y, U.bubble.w, U.bubble.h, 26, 'rgba(255,255,255,0.93)');
    rr(W - 160, 16, 144, 64, 20, 'rgba(255,255,255,0.9)');
    // star-lantern string
    const G = U.garland; g.strokeStyle = night ? '#9AA0C4' : '#B8BCCC'; g.lineWidth = 2; g.beginPath(); g.moveTo(G.x0, G.y); g.quadraticCurveTo((G.x0 + G.x1) / 2, G.y + 2 * G.sag, G.x1, G.y); g.stroke();
    const star = (x, y, r) => { g.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, q = k % 2 ? r * 0.5 : r; g.lineTo(x + q * Math.cos(a), y + q * Math.sin(a)); } g.closePath(); };
    for (let i = 0; i < 5; i++) {
      const t = (i + 1) / 6, x = G.x0 + (G.x1 - G.x0) * t, y = G.y + 4 * G.sag * t * (1 - t) + 18, lit = i < 2;
      if (lit) { const lg = g.createRadialGradient(x, y, 4, x, y, 50); lg.addColorStop(0, 'rgba(255,226,150,0.6)'); lg.addColorStop(1, 'rgba(255,226,150,0)'); g.fillStyle = lg; g.beginPath(); g.arc(x, y, 50, 0, 7); g.fill(); }
      star(x, y, 17); g.fillStyle = lit ? '#FFE9A8' : 'rgba(255,248,230,0.5)'; g.fill(); g.strokeStyle = '#D8C08A'; g.lineWidth = 2.5; g.stroke();
    }
    // drums on cushions (answer colours)
    U.pads.forEach((pd, i) => {
      const s = U.item, col = cols[i % cols.length], cw = s * 1.25, ch = s * 0.32;
      // cushion: white-lilac puff with a lilac underside
      g.fillStyle = night ? '#BCB8DA' : '#DCD6EC'; g.beginPath(); g.ellipse(pd.x, pd.y + ch * 0.55, cw * 0.5, ch * 0.5, 0, 0, 7); g.fill();
      g.fillStyle = night ? '#E4E1F4' : '#FBFAFE'; for (const [dx, r] of [[-0.3, 0.2], [0, 0.26], [0.3, 0.2]]) { g.beginPath(); g.arc(pd.x + dx * cw, pd.y + ch * 0.3, r * cw, Math.PI, 0); g.fill(); }
      g.beginPath(); g.ellipse(pd.x, pd.y + ch * 0.32, cw * 0.48, ch * 0.4, 0, 0, 7); g.fill();
      // drum body (cylinder) + cream skin
      const w = s, h = s * 0.86, x0 = pd.x - w / 2, top = pd.y - h;
      g.fillStyle = col; g.beginPath(); g.roundRect(x0, top + w * 0.14, w, h - w * 0.14, 10); g.fill();
      g.lineWidth = 4; g.strokeStyle = 'rgba(40,20,40,0.35)'; g.stroke();
      g.fillStyle = '#E4E6EE'; g.fillRect(x0, pd.y - 12, w, 10); g.fillRect(x0, top + w * 0.12, w, 9);
      g.fillStyle = '#FFF6E6'; g.beginPath(); g.ellipse(pd.x, top + w * 0.14, w / 2, w * 0.14, 0, 0, 7); g.fill(); g.strokeStyle = '#9AA0B4'; g.lineWidth = 3; g.stroke();
      if (night) { g.strokeStyle = 'rgba(210,220,255,0.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 + w - 4, top + w * 0.25); g.lineTo(x0 + w - 4, pd.y - 14); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x0 + w * 0.12, top + w * 0.28, w * 0.1, h * 0.5);
    });
    // cymbal on a stand
    const Cy = U.cymbal; g.strokeStyle = '#9AA0B4'; g.lineWidth = 5; g.beginPath(); g.moveTo(Cy.x, Cy.y); g.lineTo(Cy.x, Cy.y - 120); g.moveTo(Cy.x - 26, Cy.y); g.lineTo(Cy.x, Cy.y - 30); g.lineTo(Cy.x + 26, Cy.y); g.stroke();
    g.fillStyle = '#D8B26A'; g.beginPath(); g.ellipse(Cy.x, Cy.y - 124, 46, 11, -0.12, 0, 7); g.fill(); g.strokeStyle = '#9C7838'; g.lineWidth = 3; g.stroke();
    // Bibi placeholder (apricot puppy blob, cream muzzle, floppy ears, white collar)
    const P = U.bibi; g.lineWidth = 5; g.strokeStyle = '#8A5A34';
    g.fillStyle = '#E7B07A'; g.beginPath(); g.ellipse(P.x, P.y - P.h * 0.28, P.h * 0.26, P.h * 0.28, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(P.x, P.y - P.h * 0.7, P.h * 0.27, P.h * 0.25, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#B9784A'; g.beginPath(); g.ellipse(P.x - P.h * 0.25, P.y - P.h * 0.66, P.h * 0.07, P.h * 0.15, 0.3, 0, 7); g.fill(); g.beginPath(); g.ellipse(P.x + P.h * 0.25, P.y - P.h * 0.66, P.h * 0.07, P.h * 0.15, -0.3, 0, 7); g.fill();
    g.fillStyle = '#FBEBD3'; g.beginPath(); g.ellipse(P.x + P.h * 0.03, P.y - P.h * 0.62, P.h * 0.14, P.h * 0.1, 0, 0, 7); g.fill();
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.ellipse(P.x, P.y - P.h * 0.48, P.h * 0.22, P.h * 0.06, 0, 0, 7); g.fill();
    // a few mood particles
    const pk = { morning: ['mist', 'mote'], noon: ['butterfly', 'leaf'], sunset: ['ember', 'mote'], night: ['firefly', 'firefly'] }[mood];
    for (let i = 0; i < 14; i++) { const name = pk[i % 2], p = im['particles/' + name], s = 18 + (i % 4) * 6, x = (i * 0.618 % 1) * W, y = ((i * 0.37 + 0.05) % 1) * H; g.drawImage(p, x, y, name === 'mist' ? s * 4 : s, name === 'mist' ? s * 2 : s); }
    return c.toDataURL('image/png');
  })();
}

function pageSeams({ src, list }) {
  const load = s => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => j(new Error('bad image ' + s.slice(0, 60))); i.src = s; });
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
  const load = s => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => j(new Error('bad image ' + s.slice(0, 60))); i.src = s; });
  return (async () => {
    const c = document.createElement('canvas'); c.width = 1720; c.height = 560; const g = c.getContext('2d');
    g.fillStyle = '#D6F0FB'; g.fillRect(0, 0, 1720, 130); g.fillStyle = '#2C3D58'; g.fillRect(0, 130, 1720, 130); g.fillStyle = '#F4F1FA'; g.fillRect(0, 260, 1720, 300);
    let x = 20;
    for (const p of parts) { const im = await load(src['particles/' + p]); for (const y0 of [0, 130, 260]) p === 'mist' ? g.drawImage(im, x - 24, y0 + 41, 144, 72) : g.drawImage(im, x, y0 + 17, 96, 96); x += 130; }
    x = 20; for (const e of extras) { const im = await load(src[e]); const w = e.includes('cloud') ? 300 : e.includes('rainbow') ? 600 : 200, h = e.includes('cloud') ? 140 : e.includes('rainbow') ? 300 : 200; const k = (e.includes('rainbow') ? 340 : 160) / Math.max(w, h); g.fillStyle = e.includes('moon') ? '#1E2A4A' : 'rgba(0,0,0,0)'; g.fillRect(x - 10, 380, w * k + 20, h * k + 20); g.drawImage(im, x, 390, w * k, h * k); x += w * k + 40; }
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
    save(await pg.evaluate(pageScene, { mood: m, W, H, L, U, src: SRC, sky: ENV.SKY[m], groundBottom: ENV.GROUND_BOTTOM[m], cols: DRUMS[m], clouds: CLOUDS, starsCfg: STARS, tint: TINT[m] }), path.join(ART, `env_${vp}_${m}.png`));
    if (m === 'morning') console.log(vp, JSON.stringify({ campY: L.campY, skyY1: L.skyY1, hillTop: Math.round(L.hillTop), horizon: L.lake, kf: +L.far.k.toFixed(3), km: +L.mid.k.toFixed(3), kg: +L.ground.k.toFixed(2), farY: Math.round(L.far.y), midY: Math.round(L.mid.y), groundY: Math.round(L.ground.y), fillY: Math.round(L.ground.fillY), stars: L.stars, padY: Math.round(U.pads[0].y) }));
  }
  if (!only || only === 'sheet') save(await pg.evaluate(pageParticles, { src: SRC, parts: PARTS, extras: ['env/sun', 'env/moon', 'env/cloud_a', 'env/cloud_b', 'env/rainbow'] }), path.join(ART, 'env_particles.png'));
  if (!only || only === 'seams') {
    const last = s => ENV.SKY[s][ENV.SKY[s].length - 1][1];
    const list = MOODS.flatMap(s => [['env/far_' + s, 1200, 720, 420, last(s)], ['env/mid_' + s, 1200, 300, 150, last(s)], ['env/ground_' + s, 1200, 260, 0, ENV.GROUND_BOTTOM[s]]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
