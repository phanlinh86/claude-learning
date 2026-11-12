// Bo's Farm Parade: sunny-farm environment RECIPE + preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]      (filter e.g. "night", "720x1556", "seams", "sheet")
// Writes docs/art/env_<1556x720|960x720|720x1556>_<mood>.png, docs/art/env_seams.png, docs/art/env_sheet.png and prints a
// contrast table (answer colours vs path / ground / stage background per mood).
//
// ================================== RECIPE (render.js copies this; all numbers are logical px) ==================
// render.js pastes envLayout / tileXs / drawPath / barnGeom verbatim (pure, no DOM, no requires) plus the colour tables.
// Differences from the Kiki's Camp Chimes recipe (what the integrator changes when porting render.js):
//   * envLayout(W, H, ins, lineY): pass world.layout.line.y (if omitted it is computed per DESIGN §2). Everything is
//     anchored to the PARADE LINE, not to a fixed fraction of H: the ground tile's PATH_ROW (140) lands on line.y, so the
//     calm rows 80…200 sit under the path band. L.horizonY = where the ground tile's top line (40) is.
//   * No lake, no campfire: L.lake / L.clock / L.volcano are gone. NEW L.path = {y, h} (the path band), NEW L.fence = {y, k}
//     (the fence top rail on screen: the rooster's FEET y; any x works, the fence is continuous), NEW drawPath().
//   * Sky: SKY[m] has 2 stops (DESIGN §3 exact) painted from y 0 to L.skyY1, the last stop below.
//   * NEW barn art: env/barn_<m>.svg + env/barn_door_l|r.svg + env/vane.svg placed by barnGeom(layout.barn) (below).
//
//   L = RECIPE.envLayout(W, H, ins, lineY)
//   0 sky    : vertical gradient SKY[m] from y 0 to L.skyY1, last stop below. Night: L.stars.n stars in 0…L.stars.y1
//              (r 0.7…2.1 px, cream #FFF6DE, the biggest ones with particles/star.svg; ~30 % twinkle), alpha ambient.starsA.
//   1 sun / moon at L.sun[m] / L.moon (env/sun.svg, env/moon.svg 200×200, drawn size = .size); BEFORE far so the hills
//              occlude a low sun. L.sun.night is parked below the ridge so a sunset→night crossfade glides it down.
//   2 clouds env/cloud_a|b (300×140) ×L.clouds.s, centre y ∈ [L.clouds.y0, y1], RECIPE.CLOUDS[m] = {n, alpha, tint}
//              (tint = 'source-atop' overlay colour for the white cloud art).
//   3 far    : tile far_m (L.far.w × L.far.h) at x ∈ tileXs(L.far.x0, L.far.w, W), top y = L.far.y.
//   4 mid    : tile mid_m at L.mid (its row 296 lands 4 px below the horizon). Rooster stands at y = L.fence.y.
//   5 ground : tile ground_m at L.ground (row 40 = L.horizonY, row 140 = line.y); then
//              fillRect(0, L.ground.fillY, W, H − fillY) with GROUND_BOTTOM[m] when fillY < H.
//   6 path   : RECIPE.drawPath(ctx, W, L.path.y, L.path.h, RECIPE.PATH[m]) — the dirt band the members stand on
//              (fill #D8BE95, edges #BFA27A at noon). Cache it per mood + size in an offscreen canvas.
//   7 barn back: barnGeom(layout.barn) → draw env/barn_<m>.svg at g.img (the doorway in it is already DARK).
//   … stage, members …
//   8 barn front: members inside the doorway are clipped to g.doorway (or hidden once 'in'); then the doors:
//              left door image at g.doorL, scaled in x by cos(θ) about its hinge g.doorL.hx (θ = door·80°, door 0 closed
//              … 1 open, overshoot allowed → clamp θ ≤ 100° and draw the back side darker when cos < 0); right door at
//              g.doorR about g.doorR.hx. At night draw the doors through RECIPE.DOOR_TINT[m] ('source-atop' overlay on an
//              offscreen copy) so they match the darker barn; then env/vane.svg with its pivot (40,64) at g.vane (x, y),
//              size 80·g.s, spin = horizontal scale cos(vane angle) about the pivot.
//   Scale rule: far + mid ×1.36 on tall portrait (H/W > 1.6), ×1.15 on other portrait (kp; far k = 0.9·kp,
//   mid k = 0.9·kp); ground kg = 1 landscape, 1.15 portrait, 1.3 tall portrait. Every layer is uniformly scaled so
//   FP.Assets.exact(name, round(w·k), round(h·k)) can pre-render it once. Mood crossfade: both stacks, alpha 1 / mix.
// Landscape H=720 (1556 / 960 wide): line.y 610, horizon 510, far k 0.9 (y −158: back ridge ≈ 240…290, hill A ≈ 300…340,
//   hill B ≈ 375…410), mid k 0.9 (y 248: oak crown ≈ 270…490, fence top rail 441), ground k 1 (y 470, fillY 728 > H).
// Portrait 720×1556: line.y 1256, horizon 1074, far k 1.224, mid k 1.224, ground k 1.3 (fillY 1411, fill below).
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ENV = require('./art_env.js');

// sun / moon: x = fraction of the safe width; y = fraction of the sky height (ins.top … L.ridgeY, the back-hill crest)
const SUN = {
  landscape: { morning: { x: 0.3, y: 0.66, size: 140 }, noon: { x: 0.62, y: 0.2, size: 150 }, sunset: { x: 0.8, y: 0.84, size: 176 }, night: { x: 0.84, y: 1.25, size: 150 } },
  portrait: { morning: { x: 0.24, y: 0.62, size: 130 }, noon: { x: 0.7, y: 0.42, size: 140 }, sunset: { x: 0.74, y: 0.86, size: 170 }, night: { x: 0.76, y: 1.2, size: 140 } },
};
const MOON = { landscape: { x: 0.68, y: 0.3, size: 130 }, portrait: { x: 0.72, y: 0.5, size: 130 } };
const STARS = { density: 1 / 3600, max: 200, r: [0.7, 2.1], twinkle: 0.3 };   // stars per px² of W × stars.y1
const CLOUDS = {
  morning: { n: 2, alpha: 0.8, tint: 'rgba(255,226,206,0.45)' },
  noon: { n: 4, alpha: 0.95, tint: null },
  sunset: { n: 3, alpha: 0.85, tint: 'rgba(246,170,140,0.5)' },
  night: { n: 2, alpha: 0.2, tint: 'rgba(90,108,160,0.6)' },
};
// overlay for the door SVGs (which are mood-less) so they sit in the barn's light; null = draw as is
const DOOR_TINT = { morning: 'rgba(246,217,198,0.08)', noon: null, sunset: 'rgba(194,128,110,0.14)', night: 'rgba(28,40,80,0.42)' };

/** Pure layout of the environment for a W × H screen. ins = safe-area insets; lineY = world.layout.line.y. */
function envLayout(W, H, ins, lineY) {
  ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
  const portrait = H > W, tall = H / W > 1.6;
  const groundY = H - ins.bottom - (portrait ? 26 : 14);
  if (lineY == null) lineY = portrait ? groundY - 4 - 200 - 70 : groundY - 96;
  const kp = portrait ? (tall ? 1.36 : 1.15) : 1;          // skill rule: background layers ×1.36 on tall portrait
  const kf = 0.9 * kp, km = 0.9 * kp;
  const kg = portrait ? (tall ? 1.3 : 1.15) : 1;
  const horizonY = Math.round(lineY - (140 - 40) * kg);     // ground row 140 (PATH_ROW) on the line, row 40 on the horizon
  const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: Math.round(W * 0.5 - 600 * kg), y: horizonY - 40 * kg };
  ground.fillY = ground.y + 258 * kg;
  // mid: the pond (mid x 570) a bit left of centre in landscape (behind the line), centred in portrait
  const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(W * (portrait ? 0.5 : 0.45) - 570 * km), y: horizonY + 4 - 296 * km };
  // far: tile centre a bit left of the screen centre → the wind pump (far x 840) sits right of centre, the silo left
  const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(W * (portrait ? 0.36 : 0.46) - 600 * kf), y: Math.round(horizonY - 22 * km - 720 * kf) };
  const ridgeY = Math.round(far.y + 400 * kf);              // ≈ the farthest range's crest (top of the land)
  const skyY1 = Math.round(far.y + 470 * kf);               // sky gradient end (hidden behind the back hills)
  const fence = { y: Math.round(mid.y + 214 * km), k: km };  // FENCE_TOP: the rooster's feet
  const path = { y: lineY, h: Math.round(110 * (portrait ? (tall ? 1.1 : 1.05) : 1)) };
  const o = portrait ? 'portrait' : 'landscape', sun = {};
  const cw = W - ins.left - ins.right, skyH = ridgeY - ins.top;
  // landscape: the sky is shared with the bubble (top-left) — keep the sun right of the bubble's edge (bx)
  const bx = ins.left + 24 + Math.min(560, W - ins.right - 200 - ins.left - 24);
  for (const m of ['morning', 'noon', 'sunset', 'night']) {
    const s = SUN[o][m]; let x = ins.left + s.x * cw;
    if (!portrait) x = Math.max(x, bx + s.size * 0.5);
    sun[m] = { x, y: ins.top + s.y * skyH, size: s.size };
  }
  const mo = MOON[o], moon = { x: ins.left + mo.x * cw, y: ins.top + mo.y * skyH, size: mo.size };
  const stars = { y1: ridgeY + 20, n: Math.min(STARS.max, Math.round(W * (ridgeY + 20) * STARS.density)) };
  const clouds = portrait
    ? { y0: ins.top + 0.06 * H, y1: Math.min(ins.top + 0.3 * H, ridgeY - 40), s: 0.55 }
    : { y0: ins.top + 30, y1: Math.min(ins.top + 170, ridgeY - 30), s: 0.6 };
  return { portrait, tall, groundY, lineY, horizonY, kp, far, mid, ground, ridgeY, skyY1, fence, path, sun, moon, stars, clouds };
}
/** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }
/** Barn placement from world.layout.barn {x, y (BASE centre), w}. s = w / 300 (art 300×320, base anchor (150, 316)). */
function barnGeom(b) {
  const s = b.w / 300, ox = b.x - 150 * s, oy = b.y - 316 * s;
  const R = (x, y, w, h) => ({ x: ox + x * s, y: oy + y * s, w: w * s, h: h * s });
  const doorL = R(80, 166, 70, 150), doorR = R(150, 166, 70, 150);
  doorL.hx = doorL.x; doorR.hx = doorR.x + doorR.w;          // hinge x (outer edges)
  return { s, img: R(0, 0, 300, 320), doorway: R(80, 166, 140, 150), doorL, doorR,
    vane: { x: ox + 150 * s, y: oy + 12 * s, size: 80 * s, pivot: [40, 64] }, loft: { x: ox + 150 * s, y: oy + 104 * s, r: 34 * s },
    lamp: { x: ox + 56 * s, y: oy + 180 * s }, roofTop: { x: ox + 150 * s, y: oy + 30 * s } };
}
/** The parade path: a dirt band centred on y (members' feet), height h, colours c = RECIPE.PATH[mood]. Pure canvas. */
function drawPath(g, W, y, h, c) {
  const top = x => y - h / 2 + 2.5 * Math.sin(x / 41) + 1.6 * Math.sin(x / 97 + 1.3);
  const bot = x => y + h / 2 + 2.2 * Math.sin(x / 53 + 0.7) + 1.8 * Math.sin(x / 113 + 2.1);
  const band = () => { g.beginPath(); g.moveTo(-4, top(-4)); for (let x = 0; x <= W + 8; x += 8) g.lineTo(x, top(x)); for (let x = W + 8; x >= -8; x -= 8) g.lineTo(x, bot(x)); g.closePath(); };
  g.save();
  band(); g.fillStyle = c.fill; g.fill();
  g.clip();
  // the back (top) part a touch darker, a lighter worn middle where the feet go
  const gr = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
  gr.addColorStop(0, c.edge); gr.addColorStop(0.22, c.fill); gr.addColorStop(0.55, c.light); gr.addColorStop(0.8, c.fill); gr.addColorStop(1, c.edge);
  g.globalAlpha = 0.55; g.fillStyle = gr; g.fillRect(0, y - h / 2 - 6, W, h + 12); g.globalAlpha = 1;
  // two soft wheel ruts
  g.strokeStyle = c.dark; g.lineWidth = 3; g.globalAlpha = 0.22; g.lineCap = 'round';
  for (const f of [-0.3, 0.3]) { g.beginPath(); for (let x = 0; x <= W; x += 10) { const yy = y + f * h + 1.5 * Math.sin(x / 70 + f * 5); x ? g.lineTo(x, yy) : g.moveTo(x, yy); } g.stroke(); }
  g.globalAlpha = 1;
  // pebbles (deterministic in x)
  for (let x = 13; x < W; x += 37) {
    const hsh = Math.abs(Math.sin(x * 12.9898) * 43758.5453) % 1, yy = y + (hsh - 0.5) * h * 0.8, r = 2 + hsh * 2.6;
    if (Math.abs(yy - y) < h * 0.12) continue;
    g.fillStyle = c.peb; g.beginPath(); g.ellipse(x + hsh * 20, yy, r * 1.4, r, 0, 0, 7); g.fill();
  }
  g.restore();
  // edges + overhanging grass
  g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = c.edge; g.lineWidth = 4; g.beginPath(); for (let x = -4; x <= W + 8; x += 8) x > -4 ? g.lineTo(x, top(x)) : g.moveTo(x, top(x)); g.stroke();
  g.lineWidth = 5; g.beginPath(); for (let x = -4; x <= W + 8; x += 8) x > -4 ? g.lineTo(x, bot(x)) : g.moveTo(x, bot(x)); g.stroke();
  g.strokeStyle = c.grass; g.lineWidth = 2;
  g.beginPath();
  for (let x = 9; x < W; x += 23) { const t = top(x) + 1, b = bot(x) - 1; g.moveTo(x, t); g.lineTo(x - 3, t + 6); g.moveTo(x + 3, t); g.lineTo(x + 5, t + 5); if (x % 2) { g.moveTo(x + 7, b); g.lineTo(x + 4, b - 7); g.moveTo(x + 10, b); g.lineTo(x + 12, b - 6); } }
  g.stroke();
}

const RECIPE = {
  MOODS: ENV.MOODS,                 // ['morning','noon','sunset','night'] = weather 0..3
  SKY: ENV.SKY,                     // { mood: [[offset, colour], …] } from y 0 to L.skyY1
  MEADOW: ENV.MEADOW,               // meadow colour at the top of the ground tile (reference / tints)
  GROUND_BOTTOM: ENV.GROUND_BOTTOM, // fill colour below the ground tile
  PATH: ENV.PATH,                   // path band colours per mood {fill, edge, dark, light, peb, grass}
  RIM: ENV.RIM,                     // warm rim-light colour per mood for members (never darken the members)
  TINT: { morning: null, noon: null, sunset: null, night: null },   // no overlay: the SVGs carry the mood
  DOOR_TINT,                        // 'source-atop' overlay for the doors per mood
  GLOW: { morning: 0.1, noon: 0, sunset: 0.4, night: 1 },   // extra warm window glow (loft / lamp) the render may add
  TILES: { far: [1200, 720, 720], mid: [1200, 300, 296], ground: [1200, 260, 40] }, // [w, h, row that maps to its anchor]
  GROUND_ROWS: { line: ENV.PATH_ROW, calm: ENV.CALM },   // ground tile rows: path centre, calm range
  BARN: ENV.BARN, DOOR: ENV.DOOR, VANE: ENV.VANE,
  SUN, MOON, STARS, CLOUDS,
  envLayout, tileXs, drawPath, barnGeom,
};
module.exports = { RECIPE, envLayout, tileXs, drawPath, barnGeom };
if (require.main !== module) return;

// ----------------------------------------------------------------------------------------------------- previews
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');
const MOODS = ENV.MOODS;
const PARTS = ['mist', 'mote', 'sparkle', 'star', 'firefly', 'petal', 'butterfly', 'leaf', 'confetti_a', 'confetti_b', 'dot', 'dust', 'feather'];
const NAMES = ['env/sun', 'env/moon', 'env/cloud_a', 'env/cloud_b', 'env/barn_door_l', 'env/barn_door_r', 'env/vane',
  ...MOODS.flatMap(s => ['far', 'mid', 'ground', 'barn'].map(l => `env/${l}_${s}`)), ...PARTS.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const PAL = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#8E44AD', pink: '#FF8FC0' };
const DARK = { red: '#A8282E', blue: '#1F5BA8', yellow: '#C99A12', green: '#2A8343', orange: '#C4650C', purple: '#6840A8', pink: '#C9558A' };
const COLS = { morning: ['red', 'blue', 'yellow', 'green', 'pink'], noon: ['orange', 'purple', 'blue', 'green', 'yellow'], sunset: ['blue', 'red', 'green', 'purple', 'orange'], night: ['red', 'purple', 'blue', 'yellow', 'green'] };
const DOORS = { morning: 0, noon: 1, sunset: 0.35, night: 1 };

// placeholder UI per DESIGN §2 (zero insets) — only for judging the previews
function uiLayout(W, H) {
  const portrait = H > W, groundY = H - (portrait ? 26 : 14), item = 120;
  if (!portrait) {
    const bubble = { x: 24, y: 18, w: Math.min(560, W - 224), h: 134 };
    const bo = { x: 112, y: groundY - 4, h: 220 };
    const lineY = groundY - 96;
    const barn = { x: W - 130, y: lineY + 12, w: 250, h: 270 };
    const line = { y: lineY, x0: bo.x + 120, x1: barn.x - barn.w / 2 - 30 };
    return { portrait, groundY, bubble, bo, line, barn, item, stage: { x: (line.x0 + line.x1) / 2, y: lineY - 200, s: 0.9 } };
  }
  const bubble = { x: 24, y: 110, w: W - 48, h: 124 };
  const bo = { x: 100, y: groundY - 4, h: 200 };
  const lineY = bo.y - bo.h - 70;
  const barn = { x: W - 105, y: lineY - 6, w: 200, h: 216 };
  const line = { y: lineY, x0: 70, x1: barn.x - 70 * barn.w / 300 - 40 };
  return { portrait, groundY, bubble, bo, line, barn, item, stage: { x: W / 2, y: lineY - 230, s: 0.95 } };
}

function pageScene({ mood, W, H, L, U, G, src, sky, groundBottom, pathC, cols, dark, clouds, starsCfg, doorTint, doorOpen, rim, fns }) {
  const drawPath = new Function('return ' + fns.drawPath)();
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
    drawPath(g, W, L.path.y, L.path.h, pathC);
    // samples for the contrast table (before anything is drawn on top)
    const px = (x, y) => Array.from(g.getImageData(Math.round(x), Math.round(y), 1, 1).data.slice(0, 3));
    const lx = (U.line.x0 + U.line.x1) / 2;
    const samples = { path: px(lx + 37, L.path.y + 22), groundAbove: px(lx + 37, L.path.y - L.path.h / 2 - 22), stageBg: px(U.stage.x + 70, U.stage.y - 70), barnSide: px(G.img.x - 12, G.doorway.y + 40) };
    // ---- barn back
    g.drawImage(im['env/barn_' + mood], G.img.x, G.img.y, G.img.w, G.img.h);
    // ---- placeholders: bubble, HUD, stage + one member on it, 4 members on the path, Bo blob
    const rr = (x, y, w, h, r, fill) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); };
    rr(U.bubble.x, U.bubble.y, U.bubble.w, U.bubble.h, 26, 'rgba(255,255,255,0.93)');
    rr(W - 160, 16, 144, 64, 20, 'rgba(255,255,255,0.9)');
    const S = U.stage, sw = 170 * S.s, sh = 66 * S.s;
    g.fillStyle = '#E9C46A'; g.strokeStyle = '#B8913A'; g.lineWidth = 4; g.beginPath(); g.roundRect(S.x - sw / 2, S.y, sw, sh, 14); g.fill(); g.stroke();
    g.strokeStyle = '#B98552'; g.lineWidth = 6; g.beginPath(); g.moveTo(S.x - sw / 2 + 8, S.y + sh * 0.5); g.lineTo(S.x + sw / 2 - 8, S.y + sh * 0.5); g.stroke();
    const member = (x, y, s, name) => {    // a wagon with a coloured box (feet at y)
      const w = s * 0.78, bh = s * 0.6, col = cols[name], dk = dark[name];
      g.fillStyle = 'rgba(0,0,0,0.16)'; g.beginPath(); g.ellipse(x, y, w * 0.55, 7, 0, 0, 7); g.fill();
      g.fillStyle = '#B98552'; g.strokeStyle = '#7A5130'; g.lineWidth = 3; g.beginPath(); g.roundRect(x - w / 2, y - s * 0.3, w, s * 0.12, 4); g.fill(); g.stroke();
      for (const dx of [-w * 0.3, w * 0.3]) { g.fillStyle = '#7A5130'; g.beginPath(); g.arc(x + dx, y - s * 0.12, s * 0.12, 0, 7); g.fill(); g.fillStyle = '#DDB07E'; g.beginPath(); g.arc(x + dx, y - s * 0.12, s * 0.05, 0, 7); g.fill(); }
      g.fillStyle = col; g.strokeStyle = dk; g.lineWidth = 4; g.beginPath(); g.roundRect(x - w * 0.4, y - s * 0.3 - bh, w * 0.8, bh, 12); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.beginPath(); g.ellipse(x - w * 0.2, y - s * 0.3 - bh * 0.7, 6, 13, 0.3, 0, 7); g.fill();
      if (night) { g.strokeStyle = rim; g.globalAlpha = 0.7; g.lineWidth = 3; g.beginPath(); g.moveTo(x + w * 0.38, y - s * 0.3 - bh + 10); g.lineTo(x + w * 0.38, y - s * 0.34); g.stroke(); g.globalAlpha = 1; }
    };
    member(S.x, S.y, U.item * 0.95, 4);
    const n = 4, sp = Math.max(1.22 * U.item, Math.min(1.6 * U.item, (U.line.x1 - U.line.x0) / n)), x0 = (U.line.x0 + U.line.x1) / 2 - sp * (n - 1) / 2;
    for (let i = 0; i < n; i++) member(x0 + i * sp, U.line.y, U.item, i);
    // ---- barn front: doors (squash about the hinge) + vane
    const drawDoor = (img, d, sign) => {
      const th = Math.min(1, doorOpen) * 80 * Math.PI / 180, sx = Math.max(0.1, Math.cos(th));
      const off = document.createElement('canvas'); off.width = Math.ceil(d.w); off.height = Math.ceil(d.h); const o2 = off.getContext('2d');
      o2.drawImage(img, 0, 0, d.w, d.h); if (doorTint) { o2.globalCompositeOperation = 'source-atop'; o2.fillStyle = doorTint; o2.fillRect(0, 0, d.w, d.h); }
      g.save(); g.translate(d.hx, 0); g.scale(sx, 1); g.translate(-d.hx, 0); g.drawImage(off, d.x, d.y); g.restore();
    };
    drawDoor(im['env/barn_door_l'], G.doorL); drawDoor(im['env/barn_door_r'], G.doorR);
    const v = G.vane; g.drawImage(im['env/vane'], v.x - 40 * v.size / 80, v.y - 64 * v.size / 80, v.size, v.size);
    // Bo placeholder (caramel puppy blob, cream muzzle, brown ear, collar)
    const B = U.bo; g.lineWidth = 5; g.strokeStyle = '#7A4E2C';
    g.fillStyle = '#D9A066'; g.beginPath(); g.ellipse(B.x, B.y - B.h * 0.26, B.h * 0.27, B.h * 0.26, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(B.x + B.h * 0.04, B.y - B.h * 0.68, B.h * 0.27, B.h * 0.24, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#7A4B2A'; g.beginPath(); g.ellipse(B.x - B.h * 0.2, B.y - B.h * 0.74, B.h * 0.07, B.h * 0.15, 0.3, 0, 7); g.fill();
    g.fillStyle = '#F6E7CF'; g.beginPath(); g.ellipse(B.x + B.h * 0.12, B.y - B.h * 0.6, B.h * 0.13, B.h * 0.1, 0, 0, 7); g.fill();
    g.fillStyle = '#8C5A3C'; g.beginPath(); g.ellipse(B.x + B.h * 0.03, B.y - B.h * 0.47, B.h * 0.2, B.h * 0.04, 0, 0, 7); g.fill();
    // a few mood particles
    const pk = { morning: ['mist', 'mote'], noon: ['butterfly', 'petal'], sunset: ['mote', 'leaf'], night: ['firefly', 'firefly'] }[mood];
    for (let i = 0; i < 12; i++) { const name = pk[i % 2], p = im['particles/' + name], s = 18 + (i % 4) * 6, x = (i * 0.618 % 1) * W, y = ((i * 0.37 + 0.05) % 1) * H; g.drawImage(p, x, y, name === 'mist' ? s * 4 : s, name === 'mist' ? s * 2 : s); }
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

function pageSheet({ src, parts, moods }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const c = document.createElement('canvas'); c.width = 1760; c.height = 820; const g = c.getContext('2d');
    g.fillStyle = '#D6F0FB'; g.fillRect(0, 0, 1760, 130); g.fillStyle = '#2C3D58'; g.fillRect(0, 130, 1760, 130); g.fillStyle = '#AFC189'; g.fillRect(0, 260, 1760, 130);
    let x = 20;
    for (const p of parts) { const im = await load(src['particles/' + p]); for (const y0 of [0, 130, 260]) p === 'mist' ? g.drawImage(im, x - 24, y0 + 25, 144, 72) : g.drawImage(im, x, y0 + 17, 96, 96); x += 132; }
    // barns per mood on their sky, doors closed / open, vane; sun, moon, clouds
    const skyBg = { morning: '#FDF4E3', noon: '#D6F0FB', sunset: '#FBD7A5', night: '#3B4C78' };
    x = 20;
    for (const m of moods) {
      g.fillStyle = skyBg[m]; g.fillRect(x - 10, 400, 280, 300);
      const b = await load(src['env/barn_' + m]); g.drawImage(b, x, 410, 255, 272);
      const k = 255 / 300, dl = await load(src['env/barn_door_l']), dr = await load(src['env/barn_door_r']);
      if (m !== 'noon') { g.drawImage(dl, x + 80 * k, 410 + 166 * k, 70 * k, 150 * k); g.drawImage(dr, x + 150 * k, 410 + 166 * k, 70 * k, 150 * k); }
      const v = await load(src['env/vane']); g.drawImage(v, x + 150 * k - 40 * k, 410 + 12 * k - 64 * k, 80 * k, 80 * k);
      x += 290;
    }
    const dl = await load(src['env/barn_door_l']), dr = await load(src['env/barn_door_r']), v = await load(src['env/vane']);
    g.drawImage(dl, x, 420, 105, 225); g.drawImage(dr, x + 115, 420, 105, 225); g.drawImage(v, x + 240, 420, 160, 160);
    x = 20; for (const e of ['env/sun', 'env/moon', 'env/cloud_a', 'env/cloud_b']) { const im = await load(src[e]); const w = e.includes('cloud') ? 300 : 200, h = e.includes('cloud') ? 140 : 200; const k = 100 / Math.max(w, h) * (e.includes('cloud') ? 1.6 : 1); g.fillStyle = e.includes('moon') ? '#1E2A4A' : '#7CC4EE'; g.fillRect(x - 6, 708, w * k + 12, h * k + 12); g.drawImage(im, x, 714, w * k, h * k); x += w * k + 30; }
    return c.toDataURL('image/png');
  })();
}

// relative luminance contrast (WCAG formula) for the report
const lum = rgb => { const a = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
const hexRgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const dE = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));   // crude RGB distance (hue pop)

(async () => {
  fs.mkdirSync(ART, { recursive: true });
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent('<html><body style="margin:0"></body></html>');
  const save = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  const only = process.argv[2];
  const table = [];
  for (const [W, H] of VPS) for (const m of MOODS) {
    const vp = `${W}x${H}`; if (only && !`${vp}_${m}`.includes(only)) continue;
    const U = uiLayout(W, H), L = envLayout(W, H, null, U.line.y), G = barnGeom(U.barn);
    const cols = {}, dark = {}; COLS[m].forEach((k, i) => { cols[i] = PAL[k]; dark[i] = DARK[k]; });
    const r = await pg.evaluate(pageScene, { mood: m, W, H, L, U, G, src: SRC, sky: ENV.SKY[m], groundBottom: ENV.GROUND_BOTTOM[m], pathC: ENV.PATH[m], cols, dark, clouds: CLOUDS, starsCfg: STARS, doorTint: DOOR_TINT[m], doorOpen: DOORS[m], rim: ENV.RIM[m], fns: { drawPath: drawPath.toString() } });
    save(r.url, path.join(ART, `env_${vp}_${m}.png`));
    if (vp === '1556x720' || vp === '720x1556') table.push([vp, m, r.samples]);
    if (m === 'morning') console.log(vp, JSON.stringify({ lineY: L.lineY, horizonY: L.horizonY, ridgeY: L.ridgeY, skyY1: L.skyY1, kf: +L.far.k.toFixed(3), km: +L.mid.k.toFixed(3), kg: L.ground.k, farY: L.far.y, midY: Math.round(L.mid.y), groundY: Math.round(L.ground.y), fillY: Math.round(L.ground.fillY), fence: L.fence, path: L.path, stars: L.stars, barn: { s: +G.s.toFixed(3), doorway: G.doorway, vane: G.vane } }));
  }
  if (table.length) {
    console.log('\ncontrast ratio (WCAG) of answer colours vs background samples; [min over colours] — path / ground above / stage bg');
    for (const [vp, m, s] of table) {
      const row = Object.entries(PAL).map(([k, h]) => `${k.slice(0, 3)} ${cr(hexRgb(h), s.path).toFixed(1)}/${cr(hexRgb(h), s.groundAbove).toFixed(1)}/${cr(hexRgb(h), s.stageBg).toFixed(1)}`);
      const minD = Math.min(...Object.values(PAL).flatMap(h => [s.path, s.groundAbove, s.stageBg].map(q => dE(hexRgb(h), q))));
      console.log(vp.padEnd(9), m.padEnd(8), 'path', '#' + s.path.map(v => v.toString(16).padStart(2, '0')).join(''), 'ground', '#' + s.groundAbove.map(v => v.toString(16).padStart(2, '0')).join(''), 'stageBg', '#' + s.stageBg.map(v => v.toString(16).padStart(2, '0')).join(''), '| minRGBdist', minD.toFixed(0));
      console.log('   ', row.join('  '));
    }
  }
  if (!only || only === 'sheet') save(await pg.evaluate(pageSheet, { src: SRC, parts: PARTS, moods: MOODS }), path.join(ART, 'env_sheet.png'));
  if (!only || only === 'seams') {
    const last = s => ENV.SKY[s][ENV.SKY[s].length - 1][1];
    const list = MOODS.flatMap(s => [['env/far_' + s, 1200, 720, 480, last(s)], ['env/mid_' + s, 1200, 300, 150, last(s)], ['env/ground_' + s, 1200, 260, 0, ENV.GROUND_BOTTOM[s]]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
