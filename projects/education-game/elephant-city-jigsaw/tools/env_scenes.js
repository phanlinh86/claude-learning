// Pom's Puzzle Town: town-street environment RECIPE + preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]      (filter e.g. "winter", "720x1556", "seams", "sheet")
// Writes docs/art/env_<1556x720|960x720|720x1556>_<mood>.png, docs/art/env_seams.png, docs/art/env_particles.png.
//
// ================================== RECIPE (render.js copies this; all numbers are logical px) ==================
// Same shape as ../bunny-dino-dig (render.js pastes envLayout / tileXs verbatim — pure, no DOM, no requires — plus the
// colour tables). DIFFERENCES from the dig recipe (what the lead must change when porting the dig render.js):
//   * MOODS are spring | summer | autumn | winter (weather 0..3), not morning … night. No moon, no stars, no smoke:
//     env/moon.svg and env/smoke.svg do not exist; L.volcano is always [] (the dig smoke loop is then a no-op).
//   * L.streetY is the street line (shop bases, the shop-side kerb). L.sandY is kept as an alias of streetY.
//   * SKY gradient: paint it from y 0 to **L.skyY1** (the skyline), not to sandY — then fill below with the last stop
//     (the dig render filled 0 … sandY; with skyY1 the pale bottom colour shows right at the rooftops).
//   * SAND_BOTTOM → **PAVE_BOTTOM** (fill colour below the ground tile, i.e. below L.ground.fillY). RECIPE.SAND_BOTTOM is
//     provided as an alias of PAVE_BOTTOM so the dig code runs unchanged.
//   * L.sun has keys spring / summer / autumn / winter (the dig render looked up sun[to] with night → sunset; just use
//     L.sun[mood]). Winter sun is meant to be drawn paler (ambient.sunA ≈ 0.6).
//   * L.clock = [{x, y, r}] screen points of the clock-tower face (optional: draw two moving hands, ink #7D7468).
//
//   L = RECIPE.envLayout(W, H, ins)           (ins = safe-area insets {top,left,right,bottom}, may be omitted)
//   0 streetY = Landscape: round(0.56 H) (H=720 → 403); portrait: round(0.74 H) (720×1556 → 1151, 720×960 → 710).
//   1 sky    : vertical linear gradient SKY[m] from y 0 to L.skyY1, last stop below (behind everything).
//   2 sun    : drawImage(env/sun.svg) centred at L.sun[m] = {x, y, size}; clouds env/cloud_a|b (300×140) at scale
//              L.clouds.s, centre y ∈ [L.clouds.y0, L.clouds.y1].
//   3 far    : tile far_m (L.far.w × L.far.h) at x ∈ tileXs(L.far.x0, L.far.w, W), top y = L.far.y. Its bottom line
//              (y 720) sits at streetY − 150·km, i.e. behind the shopfronts (only the roofs + clock tower show).
//   4 mid    : tile mid_m — its line y 298 (MID_BASE) lands on streetY (shops stand on y 268, props on y 292).
//   5 ground : tile ground_m — its line y 40 (GROUND_LINE, the shop-side kerb) = streetY; then
//              fillRect(0, L.ground.fillY, W, H − fillY) with PAVE_BOTTOM[m] when fillY < H.
//   Scale rule: background layers (far, mid) ×1.36 on tall portrait (H/W > 1.6), ×1.15 on other portrait
//   (kp; far k = 0.7·kp, mid k = 0.86·kp); ground kg = clamp((H − streetY) / 220, 1, 1.8) so the near pavement reaches
//   the bottom of the screen. Every layer is uniformly scaled so PZ.Assets.exact(name, round(w·rs), round(h·rs)) can
//   pre-render it once. Season crossfade: draw both seasons' stacks with alpha (1 − mix) / mix (same geometry).
// Landscape H=720 (any W): streetY 403; far k 0.70 (y −230, roofs ≈ y 100…200, clock-tower tip ≈ y 30);
//   mid k 0.86 (y 147, shop tops ≈ y 198…250); ground k 1.44 (y 345; road y 426…495, near pavement from y 512 — under
//   the tray (y 512) and Pom's feet (706)); fillY = 717. Free sky above y ≈ 100 between the bubble and the HUD.
// Portrait 720×1556: streetY 1151; far k 0.952, mid k 1.17 (shop tops ≈ 873…943, just under the board's bottom);
//   ground k 1.8 (road 1183…1266, near pavement 1288…); sun in the top-left sky beside the HUD.
// =================================================================================================================
'use strict';
const fs = require('fs');
const path = require('path');
const ENV = require('./art_env.js');

/** Pure layout of the environment layers for a W × H screen. ins = safe-area insets (logical px). */
function envLayout(W, H, ins) {
  ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
  const portrait = H > W, tall = H / W > 1.6;
  const streetY = Math.round(H * (portrait ? 0.74 : 0.56));
  const kp = portrait ? (tall ? 1.36 : 1.15) : 1;          // skill rule: background layers ×1.36 on tall portrait
  const kf = 0.7 * kp, km = 0.86 * kp;
  const kg = Math.max(1, Math.min(1.8, (H - streetY) / 220));
  const cx = W / 2;
  // clock tower (far x 864) just left of the HUD in landscape, right third in portrait
  const towerX = portrait ? W * 0.8 : W - ins.right - 210;
  const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(towerX - 864 * kf), y: Math.round(streetY - 150 * km - 720 * kf) };
  const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(cx - 560 * km), y: streetY - 298 * km };
  const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: Math.round(cx - 600 * kg), y: streetY - 40 * kg };
  ground.fillY = ground.y + 258 * kg;
  const hillTop = far.y + 470 * kf;                         // highest roof ridge of the far skyline (tower excluded)
  const skyY1 = Math.round(far.y + 560 * kf);               // sky gradient end: around the front-row roofs
  let sun;
  if (!portrait) {
    // in the free sky between the bubble's right edge (bx) and the clock tower, clear of the water tower
    // (far x 258 → towerX − 424·kf); on narrow screens it hides half behind the clock tower, which reads well.
    const bx = ins.left + 24 + Math.min(560, W - ins.right - 200 - ins.left - 24), sx = d => Math.max(bx + 70, towerX - d);
    sun = {
      spring: { x: sx(250), y: ins.top + 96, size: 150 },
      summer: { x: sx(170), y: ins.top + 60, size: 160 },
      autumn: { x: sx(280), y: ins.top + 104, size: 156 },
      winter: { x: sx(210), y: ins.top + 84, size: 140 },
    };
  } else {
    const s = Math.min(130, Math.max(100, W * 0.17));
    sun = {
      spring: { x: W * 0.2, y: ins.top + 62, size: s },
      summer: { x: W * 0.36, y: ins.top + 50, size: s * 1.08 },
      autumn: { x: W * 0.26, y: ins.top + 66, size: s * 1.04 },
      winter: { x: W * 0.3, y: ins.top + 58, size: s * 0.94 },
    };
  }
  const clouds = portrait
    ? { y0: ins.top + 24, y1: ins.top + 96, s: 0.5 }
    : { y0: ins.top + 26, y1: ins.top + 104, s: 0.6 };
  const clock = tileXs(far.x0, far.w, W).map(x => ({ x: x + 864 * kf, y: far.y + 440 * kf, r: 24 * kf })).filter(p => p.x > -40 && p.x < W + 40);
  return { portrait, tall, streetY, sandY: streetY, kp, far, mid, ground, hillTop, skyY1, sun, clouds, clock, volcano: [], starsY1: hillTop };
}
/** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }

const RECIPE = {
  MOODS: ENV.MOODS,             // ['spring','summer','autumn','winter'] = weather 0..3
  SKY: ENV.SKY,                 // { mood: [[offset, colour], …] } from y 0 to L.skyY1
  PAVE: ENV.PAVE,               // near-pavement colour (top of the band; for tints / the tray)
  PAVE_BOTTOM: ENV.PAVE_BOTTOM, // fill colour below the ground tile
  SAND_BOTTOM: ENV.PAVE_BOTTOM, // alias for the dig render code
  ROAD: ENV.ROAD,               // the road strip colour (reference)
  RIM: ENV.RIM,                 // rim-light colour per mood
  TILES: { far: [1200, 720, 720], mid: [1200, 300, 298], ground: [1200, 260, 40] }, // [w, h, line that maps to its anchor]
  CLOCK: ENV.CLOCK,             // clock face centre in far-tile coords (r 24)
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
const PARTS = ['petal', 'leaf_a', 'leaf_b', 'snow', 'mote', 'sparkle', 'star', 'confetti_a', 'confetti_b', 'dot', 'feather', 'dust'];
const NAMES = ['env/sun', 'env/cloud_a', 'env/cloud_b', ...MOODS.flatMap(s => ['far', 'mid', 'ground'].map(l => `env/${l}_${s}`)), ...PARTS.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const PIECES = { spring: ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B'], summer: ['#FF9A2E', '#8E44AD', '#3C8DE8', '#4CC26B'], autumn: ['#3C8DE8', '#E84A4A', '#4CC26B', '#FFD23F'], winter: ['#E84A4A', '#FF9A2E', '#4CC26B', '#8E44AD'] };

// placeholder UI (DESIGN §2, zero insets) — only for judging the previews
function uiLayout(W, H) {
  const portrait = H > W, tall = H / W > 1.6, groundY = H - (portrait ? 26 : 14);
  const item = 112 * (tall || Math.max(W, H) / Math.min(W, H) > 1.9 ? 1.2 : 1);
  if (!portrait) {
    const bubble = { x: 24, y: 18, w: Math.min(560, W - 224), h: 122 };
    const trayY = H - 112 - 96, x0 = 250, x1 = W - 30;
    const by = Math.max(152, bubble.y + bubble.h + 30), bh = trayY - 30 - by, bw = Math.min(x1 - x0, 1.75 * bh);
    const board = { x: x0 + (x1 - x0 - bw) / 2, y: by, w: bw, h: bh };
    const spots = []; for (let i = 0; i < 4; i++) spots.push({ x: x0 + 90 + i * 1.4 * 112, y: trayY + 56 });
    return { portrait, groundY, bubble, board, tray: { x: x0, y: trayY, w: x1 - x0, h: 112 + 30 }, spots, item: 112, pom: { x: 118, y: groundY - 4, h: 230 } };
  }
  const bubble = { x: 24, y: 110, w: W - 48, h: 124 };
  const by = bubble.y + bubble.h + 34, bw = W - 48, bh = Math.min(0.78 * bw, H - by - 2.9 * item - 300);
  const board = { x: 24, y: by, w: bw, h: bh };
  const trayY = by + bh + 44, spots = [];
  for (let r = 0; r < 2; r++) for (let i = 0; i < 2 + r; i++) spots.push({ x: (r ? 60 : 300) + i * 1.3 * item + item / 2, y: trayY + item / 2 + 30 + (1 - r) * 1.35 * item });
  return { portrait, groundY, bubble, board, tray: { x: 24, y: trayY, w: W - 48, h: 2.7 * item }, spots, item, pom: { x: 104, y: groundY - 4, h: 200 } };
}

function pageScene({ mood, W, H, L, U, src, sky, paveBottom, cols }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  const tileXs = (x0, tw, W) => { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; };
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, L.skyY1); for (const [o, col] of sky) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const sn = L.sun[mood];
    g.globalAlpha = mood === 'winter' ? 0.65 : 1; g.drawImage(im['env/sun'], sn.x - sn.size / 2, sn.y - sn.size / 2, sn.size, sn.size); g.globalAlpha = 1;
    const nC = mood === 'summer' ? 4 : 3;
    for (let i = 0; i < nC; i++) {
      const ci = im[i % 2 ? 'env/cloud_b' : 'env/cloud_a'], s = L.clouds.s * (0.8 + 0.4 * rnd()), x = (i + 0.3 + rnd() * 0.4) * W / nC, y = L.clouds.y0 + rnd() * (L.clouds.y1 - L.clouds.y0);
      g.globalAlpha = mood === 'winter' ? 0.75 : 0.9; g.drawImage(ci, x - 150 * s, y - 70 * s, 300 * s, 140 * s);
    }
    g.globalAlpha = 1;
    const lay = (name, Ly) => { for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(im[name], x, Ly.y, Ly.w + 0.5, Ly.h); };
    lay('env/far_' + mood, L.far); lay('env/mid_' + mood, L.mid); lay('env/ground_' + mood, L.ground);
    if (L.ground.fillY < H) { g.fillStyle = paveBottom; g.fillRect(0, L.ground.fillY - 1, W, H - L.ground.fillY + 1); }
    // ---- placeholders: bubble, HUD, the picture board (wooden frame, calm picture, 3 shadows + 1 placed piece), tray
    const rr = (x, y, w, h, r, fill, st, lw = 4) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); if (st) { g.lineWidth = lw; g.strokeStyle = st; g.stroke(); } };
    rr(U.bubble.x, U.bubble.y, U.bubble.w, U.bubble.h, 26, 'rgba(255,255,255,0.93)');
    rr(W - 160, 16, 144, 64, 20, 'rgba(255,255,255,0.9)');
    const b = U.board, F = 22;
    g.save(); g.shadowColor = 'rgba(60,40,20,0.3)'; g.shadowBlur = 18; g.shadowOffsetY = 8; rr(b.x - F, b.y - F, b.w + 2 * F, b.h + 2 * F, 26 + F, '#C98D52'); g.restore();
    rr(b.x - F, b.y - F, b.w + 2 * F, b.h + 2 * F, 26 + F, '#C98D52', '#8E5A2C', 4);
    rr(b.x - F + 6, b.y - F + 6, b.w + 2 * F - 12, b.h + 2 * F - 12, 26 + F - 6, 'rgba(0,0,0,0)', '#E6B47E', 3);
    g.save(); g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 26); g.clip();
    const pg = g.createLinearGradient(0, b.y, 0, b.y + b.h); pg.addColorStop(0, '#DDEFF7'); pg.addColorStop(1, '#F7F1E4'); g.fillStyle = pg; g.fillRect(b.x, b.y, b.w, b.h);
    g.fillStyle = '#CFE3C4'; g.fillRect(b.x, b.y + b.h * 0.7, b.w, b.h * 0.3);
    for (let i = 0; i < 4; i++) { g.fillStyle = ['#F1E6D3', '#E9DCCB', '#EDE3D6', '#E4DACB'][i]; g.fillRect(b.x + 30 + i * b.w * 0.24, b.y + b.h * 0.34, b.w * 0.18, b.h * 0.36); }
    const slots = [[0.22, 0.42], [0.55, 0.58], [0.82, 0.36]];
    slots.forEach(([u, v], i) => {
      const x = b.x + u * b.w, y = b.y + v * b.h, s = U.item;
      g.beginPath(); g.roundRect(x - s / 2, y - s / 2, s, s, 22);
      if (i === 1) { g.fillStyle = cols[3]; g.fill(); g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.25)'; g.stroke(); }
      else { g.fillStyle = 'rgba(40,36,60,0.30)'; g.fill(); g.setLineDash([10, 8]); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.stroke(); g.setLineDash([]); }
    });
    g.restore();
    U.spots.forEach((p, i) => { const s = U.item * 0.92; g.save(); g.translate(p.x, p.y); g.rotate((i % 2 ? 1 : -1) * 0.12);
      g.fillStyle = 'rgba(40,30,20,0.18)'; g.beginPath(); g.ellipse(0, s / 2 + 6, s * 0.45, 8, 0, 0, 7); g.fill();
      g.beginPath(); g.roundRect(-s / 2, -s / 2, s, s, 20); g.fillStyle = cols[i % 3]; g.fill(); g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.28)'; g.stroke(); g.restore(); });
    // Pom placeholder (warm grey elephant blob with ears and a cream scarf)
    const P = U.pom; g.lineWidth = 5; g.strokeStyle = '#6F7082';
    g.fillStyle = '#B9BAC6'; g.beginPath(); g.ellipse(P.x, P.y - P.h * 0.3, P.h * 0.3, P.h * 0.3, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(P.x - P.h * 0.26, P.y - P.h * 0.68, P.h * 0.2, P.h * 0.2, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(P.x, P.y - P.h * 0.7, P.h * 0.24, P.h * 0.22, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#F1E6CF'; g.beginPath(); g.ellipse(P.x, P.y - P.h * 0.5, P.h * 0.24, P.h * 0.06, 0, 0, 7); g.fill(); g.strokeStyle = '#A27B55'; g.stroke();
    // a few season particles
    const pk = { spring: ['petal', 'mote'], summer: ['mote', 'sparkle'], autumn: ['leaf_a', 'leaf_b'], winter: ['snow', 'snow'] }[mood];
    for (let i = 0; i < 14; i++) { const p = im['particles/' + pk[i % 2]], s = 20 + (i % 4) * 6, x = (i * 0.618 % 1) * W, y = ((i * 0.37 + 0.05) % 1) * H; g.drawImage(p, x, y, s, s); }
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
      // wrap check: column 1199 next to column 0 of the next tile must differ no more than interior neighbour pairs
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
    g.fillStyle = '#D3F0FB'; g.fillRect(0, 0, 1580, 130); g.fillStyle = '#7A7E8C'; g.fillRect(0, 130, 1580, 130); g.fillStyle = '#DCD2C3'; g.fillRect(0, 260, 1580, 300);
    let x = 20;
    for (const p of parts) { const im = await load(src['particles/' + p]); for (const y0 of [0, 130, 260]) g.drawImage(im, x, y0 + 17, 96, 96); x += 130; }
    x = 20; for (const e of extras) { const im = await load(src[e]); const w = e.includes('cloud') ? 300 : 200, h = e.includes('cloud') ? 140 : 200; const k = 160 / Math.max(w, h); g.drawImage(im, x, 390, w * k, h * k); x += w * k + 30; }
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
    save(await pg.evaluate(pageScene, { mood: m, W, H, L, U, src: SRC, sky: ENV.SKY[m], paveBottom: ENV.PAVE_BOTTOM[m], cols: PIECES[m] }), path.join(ART, `env_${vp}_${m}.png`));
    if (m === 'spring') console.log(vp, JSON.stringify({ streetY: L.streetY, skyY1: L.skyY1, hillTop: Math.round(L.hillTop), kf: +L.far.k.toFixed(3), km: +L.mid.k.toFixed(3), kg: +L.ground.k.toFixed(2), farY: Math.round(L.far.y), midY: Math.round(L.mid.y), groundY: Math.round(L.ground.y), fillY: Math.round(L.ground.fillY), sun: L.sun, clock: L.clock }));
  }
  if (!only || only === 'sheet') save(await pg.evaluate(pageParticles, { src: SRC, parts: PARTS, extras: ['env/sun', 'env/cloud_a', 'env/cloud_b'] }), path.join(ART, 'env_particles.png'));
  if (!only || only === 'seams') {
    const last = s => ENV.SKY[s][ENV.SKY[s].length - 1][1];
    const list = MOODS.flatMap(s => [['env/far_' + s, 1200, 720, 420, last(s)], ['env/mid_' + s, 1200, 300, 150, last(s)], ['env/ground_' + s, 1200, 260, 0, ENV.PAVE_BOTTOM[s]]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
