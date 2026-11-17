// Tibo's Dino Lake Fishing: dinosaur-valley lake environment RECIPE + preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]      (filter e.g. "night", "720x1556", "seams", "sheet")
// Writes docs/art/env_<1556x720|960x720|720x1556>_<mood>.png, docs/art/env_seams.png, docs/art/env_sheet.png and prints the
// layout numbers + a contrast table (answer colours vs the water / lake bed right behind the fish).
//
// ================================== RECIPE (render.js copies this; all numbers are logical px) ==================
// render.js pastes envLayout / tileXs (pure, no DOM, no requires) plus the tables in RECIPE. Pass world.layout:
//   L = RECIPE.envLayout(layout, mood)       → every env layer's screen rect for this viewport + mood.
// Everything is anchored to layout.surfaceY (far + mid bottoms sit ON the surface line) and to H (lake bed).
// Scale rule: kp = 1 landscape, 1.15 portrait, 1.36 tall portrait (H/W > 1.6) — bed uses kp; far / mid / reeds / weeds use
// FAR_K / MID_K / REED_K / WEED_K[orientation] × kp. Each layer is uniformly scaled (TL.Assets.exact(name, round(w), round(h)) once).
// Draw order (DESIGN §7):
//   0 sky    : vertical gradient 0 → L.sky.y1 (= surfaceY) with SKY[m] = [top, mid (at 0.55), bottom].
//   1 stars  : night only (weather particles), above L.sky.y1 − 40.
//   2 sun    : env/sun.svg centred at L.sun {x, y, size}, alpha SUN[m].a (× crossfade). moon: env/moon.svg at L.moon, MOON[m].a.
//              Before far so the volcano / hills occlude a low sun (sunset).
//   3 clouds : env/cloud_a|b (300×140) × L.clouds.s (×0.8…1.2), centre y ∈ [L.clouds.y0, L.clouds.y1], CLOUDS[m] {n, alpha,
//              tint (source-atop rgba on an offscreen copy, or null)}. Drift slowly (8–14 px/s), wrap.
//   4 smoke  : env/smoke.svg (120×120, centre 60 60) puffs rising from every point in L.craters (≈ 1 per 2.5 s, rise 60–90 px,
//              grow ×1.6, fade); tint SMOKE_TINT[m]. Draw BEFORE far is fine (puff starts behind the crater rim).
//   5 far    : tile far_m at x ∈ tileXs(L.far.x0, L.far.w, W), top y = L.far.y, size L.far.w × L.far.h.
//   6 mid    : tile mid_m at L.mid (its bottom row = surfaceY).
//   7 mist   : morning / sunset / night band L.mist {y0, y1} filled with a vertical gradient MIST[m].col alpha 0 → MIST[m].a
//              (at 70 %) → 0.3·a, × ambient.mist / MIST[m].a if weather animates it.
//   8 reeds  : env/reeds.svg at each of L.reeds [{x, y, w, h, flip}] (top-left + size; flip → mirror around its centre);
//              PROP_TINT[m] 'source-atop'.
//   9 water  : FishArt.drawWater from surfaceY − 6 (WATER[m] = [top, deep]).
//  10 bed    : tile bed_m at L.bed (bottom = H); then the weeds: env/weed.svg at each of L.weeds [{x, y (bottom), w, h, phase}]
//              (sway: skewX(0.08·sin(1.1 t + phase)) around the bottom anchor), tinted WEED_TINT[m] 'source-atop'.
//   … fish, ripples, lilies, bronto …
//  11 rock   : env/rock.svg at L.rock {x, y, w, h} (seat (150, 70) → exactly (tibo.x, tibo.y)), PROP_TINT[m] on an offscreen
//              copy, then the part below L.rock.waterY gets ROCK_UNDER[m] (source-atop, rect from waterY down). The art fades
//              itself out under water (mask), so fish passing behind its lower part stay visible.
// NOTE for the integrator: DESIGN §2 says rock.y = surfaceY + 30; that cannot hold together with tibo.y = surfaceY − 34 and the
// seat at art (150, 70) for a 300-wide rock, so L.rock is solved from the seat (Tibo sits exactly on the moss) — use L.rock.
// Mood crossfade: draw both stacks (old at 1, new at the mix alpha) — far / mid are opaque below their silhouettes.
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ENV = require('./art_env.js');

const FAR_K = { landscape: 1.0, portrait: 0.85 };   // far tile scale relative to kp
const MID_K = { landscape: 0.82, portrait: 1.0 };   // mid tile scale relative to kp
const REED_K = { landscape: 0.78, portrait: 0.62 };  // reeds scale relative to kp
const WEED_K = { landscape: 0.7, portrait: 0.8 };    // weed scale relative to kp
// sun / moon centre: x = ins.left + fx × safe width; y = yTop + fy × (surfaceY − yTop); yTop = ins.top (landscape) or
// bubble bottom (portrait). a = alpha. size = drawn px (× kp in portrait).
const SUN = {
  morning: { landscape: { fx: 0.64, fy: 0.42 }, portrait: { fx: 0.86, fy: 0.3 }, a: 1 },
  noon: { landscape: { fx: 0.76, fy: 0.3 }, portrait: { fx: 0.84, fy: 0.16 }, a: 1 },
  sunset: { landscape: { fx: 0.7, fy: 0.42 }, portrait: { fx: 0.78, fy: 0.37 }, a: 1 },
  night: { landscape: { fx: 0.84, fy: 0.74 }, portrait: { fx: 0.88, fy: 0.62 }, a: 0 },
};
const MOON = {
  morning: { landscape: { fx: 0.8, fy: 0.3 }, portrait: { fx: 0.8, fy: 0.25 }, a: 0 },
  noon: { landscape: { fx: 0.8, fy: 0.3 }, portrait: { fx: 0.8, fy: 0.25 }, a: 0 },
  sunset: { landscape: { fx: 0.46, fy: 0.2 }, portrait: { fx: 0.4, fy: 0.14 }, a: 0 },
  night: { landscape: { fx: 0.78, fy: 0.3 }, portrait: { fx: 0.8, fy: 0.22 }, a: 1 },
};
const SUN_SIZE = { landscape: 140, portrait: 110 };
const CLOUDS = {
  morning: { n: 3, alpha: 0.85, tint: 'rgba(255,240,222,0.25)' },
  noon: { n: 4, alpha: 0.95, tint: null },
  sunset: { n: 3, alpha: 0.9, tint: 'rgba(246,170,130,0.35)' },
  night: { n: 2, alpha: 0.4, tint: 'rgba(70,86,140,0.6)' },
};
const SMOKE_TINT = { morning: 'rgba(255,246,236,0.0)', noon: 'rgba(255,255,255,0)', sunset: 'rgba(250,200,170,0.4)', night: 'rgba(120,134,176,0.55)' };
const MIST = { morning: { a: 0.55, col: '#FFF6EA' }, noon: { a: 0, col: '#FFFFFF' }, sunset: { a: 0.3, col: '#FBDCBE' }, night: { a: 0.22, col: '#9DB0DA' } };
const PROP_TINT = { morning: 'rgba(255,240,216,0.08)', noon: null, sunset: 'rgba(231,150,120,0.2)', night: 'rgba(30,42,88,0.46)' };
const WEED_TINT = { morning: 'rgba(95,175,180,0.22)', noon: 'rgba(78,159,176,0.22)', sunset: 'rgba(110,140,154,0.28)', night: 'rgba(34,52,79,0.5)' };
const ROCK_UNDER = { morning: 'rgba(95,175,180,0.32)', noon: 'rgba(78,159,176,0.32)', sunset: 'rgba(110,140,154,0.36)', night: 'rgba(34,52,79,0.42)' };

/** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }

/** Pure screen layout of the environment. lay = world.layout (W, H, ins, portrait, tall, surfaceY, bubble, tibo, rock, swim). */
function envLayout(lay, mood) {
  const W = lay.W, H = lay.H, ins = lay.ins || { top: 0, left: 0, right: 0, bottom: 0 }, sY = lay.surfaceY;
  const portrait = lay.portrait != null ? lay.portrait : H > W, tall = lay.tall != null ? lay.tall : H / W > 1.6;
  const o = portrait ? 'portrait' : 'landscape', cw = W - ins.left - ins.right;
  const kp = portrait ? (tall ? 1.36 : 1.15) : 1;
  const kf = FAR_K[o] * kp;
  // far: bottom row (720) on the surface; volcano crater (art x 760) at 0.56 W landscape / 0.62 W portrait → only ONE
  // volcano and ONE waterfall are ever on screen (tile ≥ 1200 px wide).
  // landscape: right of the speech bubble when it is wide (narrow iPads), but always < 940·kf so the next copy stays off-screen
  const bubR = lay.bubble ? lay.bubble.x + lay.bubble.w : 0;
  const vX = portrait ? W * 0.62 : Math.min(940 * kf - 20, Math.max(W * 0.56, bubR + 150));
  const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(vX - 760 * kf), y: sY - 720 * kf };
  const craters = tileXs(far.x0, far.w, W).map(x => ({ x: x + 760 * kf, y: far.y + 505 * kf })).filter(c => c.x > -80 && c.x < W + 80);
  // mid: bottom row (300) on the surface; the long-neck family (art x 260) at 0.36 W landscape / 0.3 W portrait
  const km = MID_K[o] * kp;
  const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(W * (portrait ? 0.3 : 0.36) - 260 * km), y: sY - 300 * km };
  // bed: bottom on H
  const bed = { k: kp, w: 1200 * kp, h: 200 * kp, x0: Math.round(-90 * kp), y: H - 200 * kp };
  // reeds at both lake ends, standing in the water (art row 260 → surfaceY + 4); the left clump peeks out behind the rock
  const kr = REED_K[o] * kp, rw = 200 * kr, rh = 260 * kr, ry = sY + 4 - rh;
  const reeds = [{ x: ins.left - rw * 0.22, y: ry, w: rw, h: rh, flip: false },
    { x: W - ins.right - rw * 0.8, y: ry + 6 * kr, w: rw, h: rh, flip: true }];
  // rock: solved from Tibo's seat (art (150, 70) → (tibo.x, tibo.y)), width = layout.rock.w
  const rk = (lay.rock && lay.rock.w ? lay.rock.w : (portrait ? 270 : 300)) / 320;
  const rock = { k: rk, x: lay.tibo.x - 150 * rk, y: lay.tibo.y - 70 * rk, w: 320 * rk, h: 260 * rk, waterY: sY };
  // weeds along the bed (behind the fish), every ≈ 230 px, skipping nothing (fish swim in front)
  const kw = WEED_K[o] * kp, n = Math.max(3, Math.round(W / 230)), weeds = [];
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * W / n + (i % 2 ? 26 : -18) * kp;
    const s = kw * (0.75 + 0.5 * ((i * 0.618) % 1));
    weeds.push({ x: x - 40 * s, y: bed.y + (ENV.BED_TOP + 38) * kp - 200 * s, w: 80 * s, h: 200 * s, phase: i * 1.7 });
  }
  // sky + sun + moon + clouds
  const yTop = portrait && lay.bubble ? lay.bubble.y + lay.bubble.h : ins.top;
  const pos = (t) => ({ x: Math.round(ins.left + t[o].fx * cw), y: Math.round(yTop + t[o].fy * (sY - yTop)), size: Math.round(SUN_SIZE[o] * (portrait ? kp : 1)), a: t.a });
  const m = mood || 'morning';
  const sun = pos(SUN[m]), moon = pos(MOON[m]);
  // keep the sun / moon clear of the volcano smoke column: push it to the right of the crater (left if no room)
  for (const b of [sun, moon]) for (const c of craters) if (Math.abs(b.x - c.x) < 150 && b.y < c.y + 40) b.x = Math.round(c.x + 170 + b.size * 0.3 < W - ins.right ? c.x + 170 : c.x - 170);
  const clouds = portrait
    ? { y0: yTop + 30, y1: yTop + 0.38 * (sY - yTop), s: 0.5 * kp }
    : { y0: ins.top + 40, y1: Math.max(ins.top + 60, sY * 0.42), s: 0.6 };
  const mist = { y0: sY - 80 * kp, y1: sY + 16 };
  return { portrait, tall, kp, sky: { y0: 0, y1: sY }, far, craters, mid, bed, reeds, rock, weeds, sun, moon, clouds, mist };
}

const RECIPE = {
  MOODS: ENV.MOODS,                 // ['morning','noon','sunset','night'] = weather 0..3
  SKY: ENV.SKY,                     // { mood: [top, mid (0.55), bottom] } from y 0 to surfaceY
  WATER: ENV.WATER,                 // { mood: [top, deep] } lake gradient (DESIGN §3)
  RIM: ENV.RIM,                     // rim-light colour per mood (night = moonlight) — e.g. fish night rim glow
  SUN, MOON, SUN_SIZE, CLOUDS, SMOKE_TINT, MIST, PROP_TINT, WEED_TINT, ROCK_UNDER,
  FAR_K, MID_K, REED_K, WEED_K, TALL_K: 1.36, PORTRAIT_K: 1.15,
  TILES: { far: [1200, 720, 720], mid: [1200, 300, 300], bed: [1200, 200, 200] },   // [w, h, anchor row]
  FAR_CRATER: [760, 505],           // art point the smoke rises from (L.craters on screen)
  ROCK: ENV.ROCK,                   // { w 320, h 260, anchor [160,260], seat [150,70], fadeFrom 150 }
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
const PARTS = ['mote', 'sparkle', 'glint', 'firefly', 'star', 'dot', 'drop', 'bubble', 'leaf_a', 'leaf_b', 'confetti_a', 'confetti_b', 'petal'];
const NAMES = ['env/sun', 'env/moon', 'env/cloud_a', 'env/cloud_b', 'env/smoke', 'env/rock', 'env/reeds', 'env/weed',
  ...MOODS.flatMap(s => ['far', 'mid', 'bed'].map(l => `env/${l}_${s}`)), ...PARTS.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const FISH = [['#E84A4A', '#A8282E', '#F7A0A0'], ['#3C8DE8', '#1F5BA8', '#A6CCF5'], ['#FFD23F', '#C99A12', '#FFEB9C'], ['#4CC26B', '#2A8343', '#A8E6B8']];

// placeholder world layout per DESIGN §2 (zero insets) — only for judging the previews
function uiLayout(W, H) {
  const portrait = H > W, tall = H / W > 1.6, groundY = H - (portrait ? 26 : 14), ins = { top: 0, left: 0, right: 0, bottom: 0 };
  const size = Math.round(104 * (tall ? 1.12 : 1));
  const bubble = portrait ? { x: 24, y: 110, w: W - 48, h: 124 } : { x: 24, y: 18, w: Math.min(560, W - 224), h: 134 };
  const surfaceY = portrait ? Math.max(Math.round(bubble.y + bubble.h + 0.2 * H), Math.round(0.3 * H)) : Math.round(H * 0.4);
  const tibo = portrait ? { x: 105, y: surfaceY - 30, h: 170 } : { x: 110, y: surfaceY - 34, h: 190 };
  const rock = { x: tibo.x - 10, y: surfaceY + 30, w: portrait ? 270 : 300 };
  const swim = portrait ? { x0: 40, x1: W - 40 } : { x0: rock.x + rock.w / 2 + 30, x1: W - 50 };
  const nl = portrait ? (tall ? 5 : 4) : 3, a = surfaceY + 0.75 * size, b = groundY - 0.85 * size - 44;
  swim.lanes = Array.from({ length: nl }, (_, i) => Math.round(a + (b - a) * i / (nl - 1)));
  return { W, H, ins, portrait, tall, groundY, size, bubble, surfaceY, tibo, rock, swim };
}

function pageScene({ mood, U, L, src, T, FISH }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  const tileXs = (x0, tw, W) => { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; };
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const { W, H } = U, sY = U.surfaceY;
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const tinted = (img, w, h, tint) => { const off = document.createElement('canvas'); off.width = Math.ceil(w); off.height = Math.ceil(h); const o = off.getContext('2d'); o.drawImage(img, 0, 0, w, h); if (tint) { o.globalCompositeOperation = 'source-atop'; o.fillStyle = tint; o.fillRect(0, 0, w, h); } return off; };
    // 0 sky
    const sk = T.SKY[mood], gr = g.createLinearGradient(0, 0, 0, sY); gr.addColorStop(0, sk[0]); gr.addColorStop(0.55, sk[1]); gr.addColorStop(1, sk[2]);
    g.fillStyle = gr; g.fillRect(0, 0, W, sY + 2);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    if (mood === 'night') for (let i = 0; i < 70; i++) { const x = rnd() * W, y = rnd() * (sY - 60), r = 0.8 + rnd() * 1.6; g.globalAlpha = 0.5 + rnd() * 0.5; g.fillStyle = '#FFF6D8'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }
    g.globalAlpha = 1;
    // 2 sun / moon
    for (const [k, p] of [['env/sun', L.sun], ['env/moon', L.moon]]) if (p.a > 0) { g.globalAlpha = p.a; g.drawImage(im[k], p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    g.globalAlpha = 1;
    // 3 clouds
    const cc = T.CLOUDS[mood];
    for (let i = 0; i < cc.n; i++) {
      const s = L.clouds.s * (0.8 + 0.4 * rnd()), x = (i + 0.3 + rnd() * 0.4) * W / cc.n, y = L.clouds.y0 + rnd() * (L.clouds.y1 - L.clouds.y0);
      g.globalAlpha = cc.alpha; g.drawImage(tinted(im[i % 2 ? 'env/cloud_b' : 'env/cloud_a'], 300 * s, 140 * s, cc.tint), x - 150 * s, y - 70 * s);
    }
    g.globalAlpha = 1;
    // 4 smoke (3 puffs at different ages)
    for (const cr of L.craters) for (const [u, dx] of [[0.15, 0], [0.5, 8], [0.85, 20]]) {
      const s = L.far.k * (0.45 + 0.5 * u), y = cr.y - 10 - u * 80 * L.far.k;
      g.globalAlpha = 0.85 * (1 - u * 0.7); g.drawImage(tinted(im['env/smoke'], 120 * s, 120 * s, T.SMOKE_TINT[mood]), cr.x + dx * L.far.k - 60 * s, y - 60 * s);
    }
    g.globalAlpha = 1;
    // 5 far, 6 mid
    const lay = (name, Ly) => { for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(im[name], x, Ly.y, Ly.w + 0.5, Ly.h); };
    lay('env/far_' + mood, L.far); lay('env/mid_' + mood, L.mid);
    // 7 mist
    const ms = T.MIST[mood];
    if (ms.a > 0) { const mg = g.createLinearGradient(0, L.mist.y0, 0, L.mist.y1); const rgb = [1, 3, 5].map(i => parseInt(ms.col.substr(i, 2), 16)).join(',');
      mg.addColorStop(0, `rgba(${rgb},0)`); mg.addColorStop(0.7, `rgba(${rgb},${ms.a})`); mg.addColorStop(1, `rgba(${rgb},${ms.a * 0.3})`); g.fillStyle = mg; g.fillRect(0, L.mist.y0, W, L.mist.y1 - L.mist.y0); }
    // 8 reeds
    for (const r of L.reeds) { const off = tinted(im['env/reeds'], r.w, r.h, T.PROP_TINT[mood]); g.save(); if (r.flip) { g.translate(r.x + r.w, r.y); g.scale(-1, 1); g.drawImage(off, 0, 0); } else g.drawImage(off, r.x, r.y); g.restore(); }
    // 9 fake water
    const wt = T.WATER[mood], wg = g.createLinearGradient(0, sY - 6, 0, H); wg.addColorStop(0, wt[0]); wg.addColorStop(1, wt[1]);
    g.fillStyle = wg; g.fillRect(0, sY - 6, W, H - sY + 6);
    g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, sY - 6, W, 3);
    if (mood === 'sunset' || mood === 'noon') { g.fillStyle = mood === 'sunset' ? 'rgba(255,214,170,0.55)' : 'rgba(255,255,255,0.5)'; for (let i = 0; i < 14; i++) { const w = 20 + rnd() * 40; g.fillRect(L.sun.x - 120 + rnd() * 240 - w / 2, sY + 4 + i * 6 + rnd() * 4, w, 2.5); } }
    // 10 bed + weeds
    lay('env/bed_' + mood, L.bed);
    for (const wd of L.weeds) { g.drawImage(tinted(im['env/weed'], wd.w, wd.h, T.WEED_TINT[mood]), wd.x, wd.y); }
    // sample backgrounds behind the lanes (before the fish)
    const px = (x, y) => Array.from(g.getImageData(Math.round(x), Math.round(Math.min(H - 1, y)), 1, 1).data.slice(0, 3));
    const samples = U.swim.lanes.map(y => px((U.swim.x0 + U.swim.x1) / 2, y)).concat([px(W * 0.5, U.groundY - 30)]);
    // fish ellipses (answer colours) — one per lane + one low over the bed
    const size = U.size, fl = 1.5 * size;
    const fishAt = (x, y, col, face) => {
      g.save(); g.translate(x, y); g.scale(face, 1);
      g.fillStyle = col[1]; g.beginPath(); g.moveTo(-fl * 0.38, 0); g.lineTo(-fl * 0.62, -size * 0.32); g.lineTo(-fl * 0.62, size * 0.32); g.closePath(); g.fill();
      g.fillStyle = col[0]; g.strokeStyle = col[1]; g.lineWidth = 4; g.beginPath(); g.ellipse(0, 0, fl * 0.4, size * 0.4, 0, 0, 7); g.fill(); g.stroke();
      g.fillStyle = col[2]; g.beginPath(); g.ellipse(-fl * 0.08, -size * 0.18, fl * 0.18, size * 0.08, -0.2, 0, 7); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(fl * 0.2, -size * 0.06, size * 0.1, 0, 7); g.fill(); g.fillStyle = '#2F2A3A'; g.beginPath(); g.arc(fl * 0.22, -size * 0.05, size * 0.055, 0, 7); g.fill();
      if (mood === 'night') { g.strokeStyle = 'rgba(230,240,255,0.55)'; g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, fl * 0.4 + 4, size * 0.4 + 4, 0, 0, 7); g.stroke(); }
      g.restore();
    };
    const lanes = U.swim.lanes, span = U.swim.x1 - U.swim.x0;
    FISH.forEach((col, i) => fishAt(U.swim.x0 + fl * 0.5 + (span - fl) * ((i * 0.37 + 0.12) % 1), lanes[i % lanes.length], col, i % 2 ? -1 : 1));
    fishAt(U.swim.x0 + span * 0.82, lanes[lanes.length - 1], FISH[(lanes.length) % 4], 1);
    // 11 rock (+ tint + underwater tint), Tibo placeholder
    const R = L.rock, roff = tinted(im['env/rock'], R.w, R.h, T.PROP_TINT[mood]);
    { const o = roff.getContext('2d'); o.globalCompositeOperation = 'source-atop'; o.fillStyle = T.ROCK_UNDER[mood]; o.fillRect(0, R.waterY - R.y, R.w, R.h); }
    g.drawImage(roff, R.x, R.y);
    const tb = U.tibo; g.lineWidth = 4;
    g.fillStyle = '#D7A65E'; g.strokeStyle = '#8A6A34'; g.beginPath(); g.ellipse(tb.x - 10, tb.y - tb.h * 0.28, tb.h * 0.3, tb.h * 0.26, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#B9D6A5'; g.strokeStyle = '#5E7F52'; g.beginPath(); g.arc(tb.x + tb.h * 0.16, tb.y - tb.h * 0.66, tb.h * 0.2, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#EBD39A'; g.strokeStyle = '#C9AE6E'; g.beginPath(); g.ellipse(tb.x + tb.h * 0.16, tb.y - tb.h * 0.82, tb.h * 0.28, tb.h * 0.06, 0, 0, 7); g.fill(); g.stroke();
    g.strokeStyle = '#D9B66E'; g.lineWidth = 6; g.beginPath(); g.moveTo(tb.x + 52, tb.y - 0.42 * tb.h); g.lineTo(tb.x + 52 + 170 * Math.cos(-1.05), tb.y - 0.42 * tb.h + 170 * Math.sin(-1.05)); g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(tb.x - 3, tb.y - 3, 6, 6);   // seat marker
    // bubble + HUD placeholders
    const rr = (x, y, w, h, r, fill) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); };
    rr(U.bubble.x, U.bubble.y, U.bubble.w, U.bubble.h, 26, 'rgba(255,255,255,0.93)');
    rr(W - 160, 16, 144, 64, 20, 'rgba(255,255,255,0.9)');
    // a few mood particles
    const pk = { morning: ['mote', 'sparkle'], noon: ['glint', 'glint', 'leaf_a'], sunset: ['glint', 'petal', 'mote'], night: ['firefly', 'firefly', 'star'] }[mood];
    for (let i = 0; i < 16; i++) {
      const name = pk[i % pk.length], p = im['particles/' + name], s = 16 + (i % 4) * 5;
      const x = (i * 0.618 % 1) * W, y = name === 'glint' ? sY + 6 + (i % 5) * 10 : (name === 'firefly' ? sY - 120 + ((i * 0.37) % 1) * 260 : ((i * 0.37 + 0.05) % 1) * sY);
      g.drawImage(p, x, y, s, name === 'glint' ? s * 0.8 : s);
    }
    for (let i = 0; i < 8; i++) g.drawImage(im['particles/bubble'], ((i * 0.43 + 0.2) % 1) * W, sY + 60 + ((i * 0.61) % 1) * (H - sY - 120), 14, 14);
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
    const c = document.createElement('canvas'); c.width = 1900; c.height = 900; const g = c.getContext('2d');
    for (const [y0, col] of [[0, '#FBE9C9'], [130, '#4E9FB0'], [260, '#1E2A55']]) { g.fillStyle = col; g.fillRect(0, y0, 1900, 130); }
    let x = 20;
    for (const p of parts) { const im = await load(src['particles/' + p]); for (const y0 of [0, 130, 260]) p === 'drop' ? g.drawImage(im, x + 24, y0 + 17, 64, 96) : g.drawImage(im, x, y0 + 17, 96, 96); x += 132; }
    g.fillStyle = '#8FD6DA'; g.fillRect(0, 400, 1900, 500);
    let px = 20;
    for (const [n, w, h] of [['env/rock', 320, 260], ['env/reeds', 200, 260], ['env/weed', 80, 200], ['env/sun', 200, 200], ['env/moon', 200, 200], ['env/cloud_a', 300, 140], ['env/cloud_b', 300, 140], ['env/smoke', 120, 120]]) {
      const im = await load(src[n]); g.drawImage(im, px, 420, w, h);
      if (n === 'env/rock') { g.fillStyle = 'red'; g.beginPath(); g.arc(px + 150, 420 + 70, 4, 0, 7); g.fill(); }
      px += w + 14;
    }
    return c.toDataURL('image/png');
  })();
}

const lum = rgb => { const a = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const dE = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
const PAL = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#8E44AD', pink: '#FF8FC0' };

(async () => {
  fs.mkdirSync(ART, { recursive: true });
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent('<html><body style="margin:0"></body></html>');
  const save = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  const only = process.argv[2];
  const table = [];
  const T = { SKY: ENV.SKY, WATER: ENV.WATER, CLOUDS, SMOKE_TINT, MIST, PROP_TINT, WEED_TINT, ROCK_UNDER };
  for (const [W, H] of VPS) for (const m of MOODS) {
    const vp = `${W}x${H}`; if (only && !`${vp}_${m}`.includes(only)) continue;
    const U = uiLayout(W, H), L = envLayout(U, m);
    const r = await pg.evaluate(pageScene, { mood: m, U, L, src: SRC, T, FISH });
    save(r.url, path.join(ART, `env_${vp}_${m}.png`));
    table.push([vp, m, r.samples]);
    if (m === 'morning') console.log(vp, JSON.stringify({ surfaceY: U.surfaceY, kp: L.kp, far: { x0: L.far.x0, y: Math.round(L.far.y), k: +L.far.k.toFixed(3) }, craters: L.craters.map(c => [Math.round(c.x), Math.round(c.y)]), midY: Math.round(L.mid.y), bedY: Math.round(L.bed.y), rock: { x: Math.round(L.rock.x), y: Math.round(L.rock.y), w: Math.round(L.rock.w) }, sun: L.sun, lanes: U.swim.lanes }));
  }
  if (table.length) {
    console.log('\nanswer colours vs background behind the fish lanes + low over the bed (min RGB distance / min luminance ratio)');
    const hx = q => '#' + q.map(v => v.toString(16).padStart(2, '0')).join('');
    for (const [vp, m, s] of table) {
      const minD = Math.min(...Object.values(PAL).flatMap(h => s.map(q => dE(hexRgb(h), q))));
      const worst = Object.entries(PAL).map(([k, h]) => [k, Math.min(...s.map(q => dE(hexRgb(h), q)))]).sort((a, c) => a[1] - c[1])[0];
      console.log(vp.padEnd(9), m.padEnd(8), 'bg', s.map(hx).join(' '), '| minRGBdist', minD.toFixed(0), 'worst', worst[0]);
    }
  }
  if (!only || only === 'sheet') save(await pg.evaluate(pageSheet, { src: SRC, parts: PARTS }), path.join(ART, 'env_sheet.png'));
  if (!only || only === 'seams') {
    const list = MOODS.flatMap(s => [['env/far_' + s, 1200, 720, 520, ENV.SKY[s][2]], ['env/mid_' + s, 1200, 300, 180, ENV.SKY[s][2]], ['env/bed_' + s, 1200, 200, 60, ENV.WATER[s][1]]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
