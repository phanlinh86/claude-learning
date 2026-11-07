// Nini's Sea Painting: seabed environment recipe + preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]
// Writes docs/art/scene_<1556x720|960x720|720x1556>_<mood>.png, docs/art/env_seams.png, docs/art/env_particles.png.
//
// RECIPE (render.js reproduces it; copy envLayout() verbatim — it is pure, no DOM, no requires):
//   L = envLayout(W, H, groundY)            (groundY = world.layout.groundY)
//   1 water: vertical linear gradient WATER[m][0] (y 0) → WATER[m][1] (y = L.sandY), filled over the whole screen
//   2 rays : for r of L.rays: drawImage(rays.svg, r.x, r.y, r.w, r.h) with alpha = ambient.rays × r.a ('lighter' or
//            normal source-over both fine; previews use source-over)
//   3 far  : tile far_m (L.far.w × L.far.h) at x ∈ tileXs(L.far.x0, L.far.w, W), top y = L.far.y
//   4 mid  : tile mid_m  (L.mid ...)  — the props' bases (viewBox y 290) land on sandY + 6
//   5 ground: tile ground_m (L.ground ...) — viewBox y 60 (sand line) = L.sandY; then fillRect(0, L.ground.fillY, W,
//            H − fillY) with SAND_BOTTOM[m] (only needed when the screen is taller than the tile)
//   5b caustic (summer, ambient.caustic): tile caustic.svg L.caustic.tw × L.caustic.th over y L.caustic.y0 … y1
//            (clip to that band), alpha = ambient.caustic × L.caustic.a; optional slow drift: offset x by t·12 px/s
//   6 surface: tile surface_m (L.surface ...) at the top, y = L.surface.y (0)
//   Every layer is uniformly scaled (k) so SP.Assets.exact(name, round(w·rs), round(h·rs)) can pre-render it once.
//   Mood crossfade: draw both moods' layer stacks with alpha (1 − mix) / mix, or crossfade per layer.
'use strict';
const fs = require('fs');
const path = require('path');

/** Pure layout of the environment layers for a W × H screen whose seabed line (feet line) is groundY.
 *  Returns { sandY, far, mid, ground, surface: {k, w, h, x0, y}, caustic: {tw, th, x0, y0, y1, a},
 *  rays: [{x, y, w, h, a}] }. Tile x positions: tileXs(layer.x0, layer.w, W). */
function envLayout(W, H, groundY) {
  const portrait = H > W;
  const band = portrait ? Math.min(210, Math.max(150, Math.round((H - 960) / 3 + 150))) : 150; // sand above groundY
  const sandY = Math.round(groundY - band);
  const kg = Math.max(0.8, (H - sandY) / 200);                 // ground: sand line (vb 60) at sandY, bottom ≥ H
  const km = portrait ? 1.4 : 0.82;                            // mid: props stand on the sand line
  const kf = Math.max(0.9, Math.min(portrait ? 1.45 : 1.1, (sandY + 40) / 600)); // far: bigger in portrait → fuller
  const ks = 1;
  const cx = W / 2;
  const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: cx - 600 * kf, y: sandY + 26 - 720 * kf };
  const mid = { k: km, w: 1200 * km, h: 300 * km, x0: cx - 470 * km, y: sandY + 6 - 290 * km };
  const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: cx - 600 * kg, y: sandY - 60 * kg };
  ground.fillY = ground.y + 255 * kg;
  const surface = { k: ks, w: 1200 * ks, h: 120 * ks, x0: 0, y: 0 };
  const caustic = { tw: 400, th: 120, x0: 0, y0: sandY - 10, y1: H, a: 1 };
  const kr = (sandY + 40) / 720, rw = 600 * kr * (portrait ? 0.9 : 1);
  const rays = portrait
    ? [{ x: cx - rw * 0.62, y: 0, w: rw, h: 720 * kr, a: 1 }, { x: cx - rw * 0.05, y: 0, w: rw * 0.7, h: 720 * kr * 0.8, a: 0.55 }]
    : [{ x: W * 0.3 - rw / 2, y: 0, w: rw, h: 720 * kr, a: 1 }, { x: W * 0.78 - rw * 0.4, y: 0, w: rw * 0.8, h: 720 * kr * 0.85, a: 0.6 }];
  return { sandY, band, far, mid, ground, surface, caustic, rays };
}
/** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }

// placeholder UI layout (DESIGN §2, zero insets) — only for judging the previews
function uiLayout(W, H) {
  const portrait = H > W, groundY = H - (portrait ? 30 : 18);
  if (!portrait) {
    const bubble = { x: 24, y: 18, w: Math.min(560, W - 200 - 24), h: 122 };
    const palY = groundY - 92, top = bubble.y + bubble.h + 16, bot = palY - 58 - 20;
    const colL = 270, avail = W - colL - 30;
    let h = bot - top, w = h * 1.5; if (w > avail) { w = avail; h = w / 1.5; }
    const canvas = { x: colL + (avail - w) / 2, y: top + (bot - top - h) / 2, w, h };
    return { portrait, groundY, bubble, canvas, palY, palX: canvas.x + w / 2, nini: { x: 130, y: groundY - 6, h: 250 } };
  }
  const bubble = { x: 24, y: 110, w: W - 48, h: 124 };
  const w = W - 40, h = w / 1.5 * (H / W > 1.6 ? 1.12 : 1);
  const canvas = { x: 20, y: bubble.y + bubble.h + 24, w, h };
  const palY = canvas.y + h + 20 + 58 + 10;
  return { portrait, groundY, bubble, canvas, palY, palX: W / 2 + 60, nini: { x: 110, y: groundY - 6, h: 210 } };
}

module.exports = { envLayout, tileXs, uiLayout };
if (require.main !== module) return;

// ----------------------------------------------------------------------------------------------------- previews
const { chromium } = require('playwright');
const { MOODS, WATER, SAND_BOTTOM, RAYS_ALPHA, CAUSTIC_ALPHA } = require('./art_env.js');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');
const PARTS = ['bubble', 'petal', 'leaf_a', 'leaf_b', 'snow', 'sparkle', 'star', 'plankton', 'dot', 'confetti_a', 'confetti_b'];
const NAMES = ['env/rays', 'env/caustic', ...MOODS.flatMap(s => ['far', 'mid', 'ground', 'surface'].map(l => `env/${l}_${s}`)), ...PARTS.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const SHELLS = { spring: ['#E84A4A', '#3C8DE8', '#FFD23F'], summer: ['#4CC26B', '#FF9A2E', '#8E44AD'], autumn: ['#3C8DE8', '#FFD23F', '#E84A4A'], winter: ['#FF9A2E', '#4CC26B', '#8E44AD'] };

function pageScene({ mood, W, H, L, U, src, water, sandBottom, raysA, causticA, shells, envLayoutSrc, tileXsSrc }) {
  const tileXs = eval('(' + tileXsSrc + ')'); void envLayoutSrc;
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, L.sandY); gr.addColorStop(0, water[0]); gr.addColorStop(1, water[1]);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.save(); for (const r of L.rays) { g.globalAlpha = raysA * r.a; g.drawImage(im['env/rays'], r.x, r.y, r.w, r.h); } g.restore();
    const lay = (name, Ly) => { for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(im[name], x, Ly.y, Ly.w + 0.5, Ly.h); };
    lay('env/far_' + mood, L.far); lay('env/mid_' + mood, L.mid); lay('env/ground_' + mood, L.ground);
    if (L.ground.fillY < H) { g.fillStyle = sandBottom; g.fillRect(0, L.ground.fillY, W, H - L.ground.fillY); }
    g.save(); g.beginPath(); g.rect(0, L.caustic.y0, W, L.caustic.y1 - L.caustic.y0); g.clip(); g.globalAlpha = causticA;
    for (let y = L.caustic.y0; y < L.caustic.y1; y += L.caustic.th) for (const x of tileXs(0, L.caustic.tw, W)) g.drawImage(im['env/caustic'], x, y, L.caustic.tw, L.caustic.th);
    g.restore();
    lay('env/surface_' + mood, L.surface);
    // ---- placeholders: bubble, HUD, canvas board, paint shells, Nini
    const rr = (x, y, w, h, r, fill, st, lw = 4) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); if (st) { g.lineWidth = lw; g.strokeStyle = st; g.stroke(); } };
    rr(U.bubble.x, U.bubble.y, U.bubble.w, U.bubble.h, 26, 'rgba(255,255,255,0.93)');
    rr(W - 160, 16, 144, 64, 20, 'rgba(255,255,255,0.9)');
    const cv = U.canvas;
    g.save(); g.globalAlpha = 0.22; g.fillStyle = '#123'; g.beginPath(); g.roundRect(cv.x + 6, cv.y + 10, cv.w, cv.h, 30); g.fill(); g.restore();
    rr(cv.x - 12, cv.y - 12, cv.w + 24, cv.h + 24, 34, '#F3D9C4', '#B98C6E', 5);
    rr(cv.x, cv.y, cv.w, cv.h, 22, '#FFF8EC', '#E6D3B8', 3);
    // a sample painted fish on the board (answer colours on cream)
    const fx = cv.x + cv.w / 2, fy = cv.y + cv.h / 2, fs2 = cv.h / 400;
    g.lineWidth = 6 * fs2; g.strokeStyle = '#33405E'; g.lineJoin = 'round';
    g.beginPath(); g.ellipse(fx - 20 * fs2, fy, 130 * fs2, 80 * fs2, 0, 0, 7); g.fillStyle = shells[0]; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(fx + 100 * fs2, fy); g.lineTo(fx + 190 * fs2, fy - 70 * fs2); g.lineTo(fx + 190 * fs2, fy + 70 * fs2); g.closePath(); g.fillStyle = shells[1]; g.fill(); g.stroke();
    g.beginPath(); g.moveTo(fx - 60 * fs2, fy - 76 * fs2); g.quadraticCurveTo(fx, fy - 150 * fs2, fx + 50 * fs2, fy - 70 * fs2); g.fillStyle = '#FFFFFF'; g.fill(); g.stroke();
    g.beginPath(); g.arc(fx - 90 * fs2, fy - 15 * fs2, 14 * fs2, 0, 7); g.fillStyle = '#FFFFFF'; g.fill(); g.stroke();
    shells.forEach((col, i) => {
      const x = U.palX + (i - 1) * 140, y = U.palY;
      g.save(); g.globalAlpha = 0.25; g.fillStyle = '#123'; g.beginPath(); g.ellipse(x, y + 54, 50, 10, 0, 0, 7); g.fill(); g.restore();
      g.beginPath(); g.arc(x, y, 58, 0, 7); g.fillStyle = '#F6E7DA'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#B98C6E'; g.stroke();
      g.beginPath(); g.arc(x, y + 4, 40, 0, 7); g.fillStyle = col; g.fill();
    });
    const n = U.nini; g.beginPath(); g.ellipse(n.x, n.y - n.h * 0.38, n.h * 0.36, n.h * 0.36, 0, 0, 7); g.fillStyle = '#5FB3B3'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#2C6467'; g.stroke();
    g.beginPath(); g.arc(n.x + n.h * 0.3, n.y - n.h * 0.72, n.h * 0.18, 0, 7); g.fillStyle = '#F0CF98'; g.fill(); g.strokeStyle = '#8A6435'; g.stroke();
    // a few particles
    const pk = { spring: ['petal', 'bubble', 'plankton'], summer: ['sparkle', 'bubble', 'plankton'], autumn: ['leaf_a', 'leaf_b', 'bubble'], winter: ['snow', 'snow', 'bubble'] }[mood];
    for (let i = 0; i < 14; i++) { const p = im['particles/' + pk[i % 3]], s = 22 + (i % 4) * 6, x = (i * 0.618 % 1) * W, y = 130 + ((i * 0.37) % 1) * (L.sandY - 160); g.drawImage(p, x, y, s, s); }
    return c.toDataURL('image/png');
  })();
}

function pageSeams({ src, list }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    let total = 0; for (const [, w, h] of list) total += h / 2 * (1200 / w) + 12;
    const out = document.createElement('canvas'); out.width = 1800; out.height = Math.ceil(total);
    const o = out.getContext('2d'); o.fillStyle = '#2E7F9C'; o.fillRect(0, 0, out.width, out.height);
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
      const sc = 1200 / (2 * w) * 2, dh = h / 2 * (1200 / w);
      o.drawImage(c, 0, y, 1200, dh);
      o.save(); o.setLineDash([6, 6]); o.strokeStyle = 'red'; o.lineWidth = 1.5; o.beginPath(); o.moveTo(600, y); o.lineTo(600, y + dh); o.stroke(); o.restore();
      const zh = Math.min(h, dh / 4) ; void sc;
      o.imageSmoothingEnabled = false; o.drawImage(c, w - 74, Math.max(0, Math.min(h - zh, zy)), 148, zh, 1210, y, 592, zh * 4 > dh ? dh : zh * 4); o.imageSmoothingEnabled = true;
      o.save(); o.setLineDash([8, 6]); o.strokeStyle = 'red'; o.lineWidth = 2; o.beginPath(); o.moveTo(1506, y); o.lineTo(1506, y + dh); o.stroke(); o.restore();
      y += dh + 12;
    }
    return { url: out.toDataURL('image/png'), scores };
  })();
}

function pageParticles({ src, parts }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const c = document.createElement('canvas'); c.width = 1460; c.height = 400; const g = c.getContext('2d');
    g.fillStyle = '#7FD3D8'; g.fillRect(0, 0, 1460, 130); g.fillStyle = '#1E78B4'; g.fillRect(0, 130, 1460, 130); g.fillStyle = '#EAD7AE'; g.fillRect(0, 260, 1460, 140);
    let x = 20;
    for (const p of parts) { const im = await load(src['particles/' + p]); for (const y0 of [0, 130]) g.drawImage(im, x, y0 + 17, 96, 96); x += 130; }
    // tinted paint dots (multiply) on sand
    const dot = await load(src['particles/dot']);
    ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0'].forEach((col, i) => {
      const t = document.createElement('canvas'); t.width = t.height = 96; const q = t.getContext('2d');
      q.drawImage(dot, 0, 0, 96, 96); q.globalCompositeOperation = 'multiply'; q.fillStyle = col; q.fillRect(0, 0, 96, 96);
      q.globalCompositeOperation = 'destination-in'; q.drawImage(dot, 0, 0, 96, 96);
      g.drawImage(t, 20 + i * 130, 282, 96, 96);
    });
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
    const U = uiLayout(W, H), L = envLayout(W, H, U.groundY);
    save(await pg.evaluate(pageScene, { mood: m, W, H, L, U, src: SRC, water: WATER[m], sandBottom: SAND_BOTTOM[m], raysA: RAYS_ALPHA[m], causticA: CAUSTIC_ALPHA[m], shells: SHELLS[m], envLayoutSrc: '', tileXsSrc: tileXs.toString() }), path.join(ART, `scene_${vp}_${m}.png`));
    if (m === 'spring') console.log(vp, JSON.stringify({ sandY: L.sandY, kf: L.far.k, km: L.mid.k, kg: L.ground.k }));
  }
  if (!only || only === 'sheet') save(await pg.evaluate(pageParticles, { src: SRC, parts: PARTS }), path.join(ART, 'env_particles.png'));
  if (!only || only === 'seams') {
    const list = [...MOODS.flatMap(s => [['env/far_' + s, 1200, 720, 520, '#4FA9C0'], ['env/mid_' + s, 1200, 300, 150, '#3F99B4'], ['env/ground_' + s, 1200, 260, 60, '#3F99B4'], ['env/surface_' + s, 1200, 120, 0, '#6CC4DA']]), ['env/caustic', 400, 200, 40, '#2E8FA8']];
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
