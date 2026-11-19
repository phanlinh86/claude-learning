// Mochi's Icing Bakery: bakery-kitchen environment recipe + preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]
// Writes docs/art/env_scene_<1556x720|960x720|720x1556>_<mood>.png, docs/art/env_seams.png, docs/art/env_particles.png.
//
// RECIPE (render.js reproduces it; copy envLayout() + tileXs() verbatim — pure, no DOM, no requires):
//   L = envLayout(W, H, groundY, { trayCx, freeTop })   (groundY = layout.groundY; trayCx = tray centre x; freeTop =
//        the lowest UI edge above the free wall band: landscape the bubble bottom, portrait the choices-row bottom.
//        Both optional — defaults match DESIGN §2.)
//   1 wall : fillRect(0, 0, W, H) with ambient.wall (the far tile's top rows are exactly this colour)
//   2 far  : tile far_m (L.far.w × L.far.h) at x ∈ tileXs(L.far.x0, L.far.w, W), top y = L.far.y
//            (window glass rects on screen: L.windows[] {x, y, w, h} — clip `outside` snow / petals to these)
//   3 light: for each r of L.lights: drawImage(light.svg, r.x, r.y, r.w, r.h) with globalAlpha = ambient.light
//   4 mid  : tile mid_m (L.mid ...) — the props' bases (viewBox y 296) land on L.counterY + 2
//   5 ground: tile ground_m (L.ground ...) — viewBox y 8 (counter back edge) = L.counterY; then
//            fillRect(0, L.ground.fillY, W, H − fillY) with ambient.floor (only when the screen is taller)
//   6 tint : if ambient.tint, fillRect over the whole screen with it (warm season wash; skip during the tray draw)
//   The tray sits on the counter top (L.counterY … L.counterFront); keep the icing bags in front of the counter.
//   Every layer is uniformly scaled (k) so IB.Assets.exact(name, round(w·rs), round(h·rs)) can pre-render it once.
//   Mood crossfade: draw both moods' stacks with alpha (1 − mix) / mix, or crossfade per layer.
'use strict';
const fs = require('fs');
const path = require('path');

/** Pure layout of the environment layers for a W × H screen whose feet line is groundY.
 *  Returns { counterY, counterFront, far, mid, ground: {k, w, h, x0, y[, fillY]}, windows: [{x,y,w,h}],
 *  lights: [{x,y,w,h}] }. Tile x positions: tileXs(layer.x0, layer.w, W). */
function envLayout(W, H, groundY, opt) {
  opt = opt || {};
  const portrait = H > W;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const band = portrait ? clamp(Math.round((H - 960) / 3 + 60), 150, 260) : 190;       // counter top above groundY
  const counterY = Math.round(opt.counterY != null ? opt.counterY : groundY - band);
  const freeTop = opt.freeTop != null ? opt.freeTop : (portrait ? Math.round(H * 0.59) : 140);
  // far: one window per tile, glass (vb 250–550 × 90–400) centred in the free wall band
  const kf = clamp((counterY - freeTop) * 0.8 / 340, 0.62, 1.0);
  const wc = (freeTop + counterY - 60) / 2;
  const trayCx = opt.trayCx != null ? opt.trayCx : (portrait ? W / 2 : (270 + W - 30) / 2);
  const far = { k: kf, w: 800 * kf, h: 720 * kf, x0: portrait ? W / 2 - 400 * kf : trayCx, y: wc - 245 * kf };
  far.y = Math.max(far.y, freeTop - 52 * kf);                   // the curtain rod (vb 58) stays below the free-band top
  if (far.y + far.h < counterY + 12) far.y = counterY + 12 - far.h;
  const windows = [], lights = [];
  for (const x of tileXs(far.x0, far.w, W)) {
    windows.push({ x: x + 250 * kf, y: far.y + 90 * kf, w: 300 * kf, h: 310 * kf });
    lights.push({ x: x + 100 * kf, y: far.y, w: 600 * kf, h: 720 * kf });
  }
  const km = portrait ? 0.85 : 0.75;
  const mid = { k: km, w: 1200 * km, h: 300 * km, x0: (portrait ? W * 0.5 : W * 0.27) - 290 * km, y: counterY + 2 - 296 * km };
  const kg = Math.max(0.85, (groundY + 6 - counterY) / 234);   // toe kick (vb 242) ≈ at the feet line
  const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: W / 2 - 600 * kg, y: counterY - 8 * kg };
  ground.fillY = ground.y + 255 * kg;
  return { portrait, band, counterY, counterFront: ground.y + 58 * kg, freeTop, far, mid, ground, windows, lights };
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
    const tray = { x: colL + (avail - w) / 2, y: top + (bot - top - h) / 2, w, h };
    return { portrait, groundY, bubble, tray, palY, palX: tray.x + w / 2, mochi: { x: 130, y: groundY - 6, h: 250 }, rack: { x: 24, y: 160, w: 230, h: 60 } };
  }
  const bubble = { x: 24, y: 110, w: W - 48, h: 124 };
  const w = W - 40, h = w / 1.5 * (H / W > 1.6 ? 1.12 : 1);
  const tray = { x: 20, y: bubble.y + bubble.h + 24, w, h };
  const palY = tray.y + h + 20 + 58 + 10;
  return { portrait, groundY, bubble, tray, palY, palX: W / 2 + 60, mochi: { x: 110, y: groundY - 6, h: 210 }, rack: { x: 300, y: palY + 90, w: 380, h: 60 } };
}

module.exports = { envLayout, tileXs, uiLayout };
if (require.main !== module) return;

// ----------------------------------------------------------------------------------------------------- previews
const { chromium } = require('playwright');
const { MOODS, AMBIENT } = require('./art_env.js');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');
const PARTS = ['petal', 'leaf_a', 'leaf_b', 'snow', 'sparkle', 'star', 'flour', 'steam', 'sprinkle_a', 'sprinkle_b', 'confetti_a', 'confetti_b', 'crumb'];
const NAMES = ['env/light', ...MOODS.flatMap(s => ['far', 'mid', 'ground'].map(l => `env/${l}_${s}`)), ...PARTS.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const BAGS = { spring: ['#E84A4A', '#3C8DE8', '#FFD23F'], summer: ['#4CC26B', '#FF9A2E', '#8E44AD'], autumn: ['#3C8DE8', '#FFD23F', '#E84A4A'], winter: ['#FF9A2E', '#4CC26B', '#FF8FC0'] };

function pageScene({ mood, W, H, L, U, src, amb, bags, tileXsSrc }) {
  const tileXs = eval('(' + tileXsSrc + ')');
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = amb.wall; g.fillRect(0, 0, W, H);
    const lay = (name, Ly) => { for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(im[name], x, Ly.y, Ly.w + 0.5, Ly.h); };
    lay('env/far_' + mood, L.far);
    g.save(); g.globalAlpha = amb.light; for (const r of L.lights) g.drawImage(im['env/light'], r.x, r.y, r.w, r.h); g.restore();
    // outside particles clipped to the windows
    const pk = { spring: 'petal', summer: 'sparkle', autumn: 'leaf_a', winter: 'snow' }[mood];
    g.save(); g.beginPath(); for (const w of L.windows) g.rect(w.x, w.y, w.w, w.h); g.clip();
    for (const w of L.windows) for (let i = 0; i < 6; i++) { const s = 14 + (i % 3) * 5; g.drawImage(im['particles/' + pk], w.x + ((i * 0.618 + 0.1) % 1) * w.w, w.y + ((i * 0.37 + 0.2) % 1) * w.h, s, s); }
    g.restore();
    lay('env/mid_' + mood, L.mid); lay('env/ground_' + mood, L.ground);
    if (L.ground.fillY < H) { g.fillStyle = amb.floor; g.fillRect(0, L.ground.fillY, W, H - L.ground.fillY); }
    if (amb.tint) { g.fillStyle = amb.tint; g.fillRect(0, 0, W, H); }
    // ---- placeholders: bubble, HUD, tray, icing bags, Mochi blob, rack
    const rr = (x, y, w, h, r, fill, st, lw = 4) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); if (st) { g.lineWidth = lw; g.strokeStyle = st; g.stroke(); } };
    rr(U.bubble.x, U.bubble.y, U.bubble.w, U.bubble.h, 26, 'rgba(255,255,255,0.93)');
    rr(W - 160, 16, 144, 64, 20, 'rgba(255,255,255,0.9)');
    const t = U.tray;
    g.save(); g.globalAlpha = 0.22; g.fillStyle = '#4A3020'; g.beginPath(); g.roundRect(t.x + 4, t.y + 12, t.w, t.h, 26); g.fill(); g.restore();
    rr(t.x - 14, t.y - 14, t.w + 28, t.h + 28, 28, '#C9C2B8', '#9E968C', 5);
    rr(t.x, t.y, t.w, t.h, 16, '#FFF8EC', '#E6D3B8', 3);
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2, cs = t.h / 400;
    g.beginPath(); g.arc(cx, cy, 160 * cs, 0, 7); g.fillStyle = '#E9B872'; g.fill(); g.lineWidth = 6 * cs; g.strokeStyle = '#9A6330'; g.stroke();
    g.lineCap = 'round'; g.lineWidth = 22 * cs;
    g.strokeStyle = bags[0]; g.beginPath(); g.moveTo(cx - 110 * cs, cy - 30 * cs); g.bezierCurveTo(cx - 50 * cs, cy - 90 * cs, cx + 10 * cs, cy + 30 * cs, cx + 110 * cs, cy - 40 * cs); g.stroke();
    g.strokeStyle = bags[1]; g.beginPath(); g.moveTo(cx - 100 * cs, cy + 60 * cs); g.lineTo(cx + 100 * cs, cy + 60 * cs); g.stroke();
    bags.forEach((col, i) => {
      const x = U.palX + (i - 1) * 140, y = U.palY;
      g.save(); g.globalAlpha = 0.25; g.fillStyle = '#4A3020'; g.beginPath(); g.ellipse(x, y + 56, 46, 9, 0, 0, 7); g.fill(); g.restore();
      g.beginPath(); g.moveTo(x - 36, y - 50); g.quadraticCurveTo(x - 44, y + 10, x, y + 52); g.quadraticCurveTo(x + 44, y + 10, x + 36, y - 50); g.closePath();
      g.fillStyle = col; g.fill(); g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.3)'; g.stroke();
      g.fillStyle = '#D7DCE0'; g.fillRect(x - 8, y + 44, 16, 14);
    });
    const n = U.mochi;
    g.beginPath(); g.ellipse(n.x, n.y - n.h * 0.3, n.h * 0.3, n.h * 0.3, 0, 0, 7); g.fillStyle = '#FAF7F2'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#6F6A72'; g.stroke();
    g.beginPath(); g.arc(n.x, n.y - n.h * 0.72, n.h * 0.2, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#34323D'; for (const dx of [-0.13, 0.13]) { g.beginPath(); g.arc(n.x + dx * n.h, n.y - n.h * 0.88, n.h * 0.06, 0, 7); g.fill(); g.beginPath(); g.ellipse(n.x + dx * n.h * 0.6, n.y - n.h * 0.73, n.h * 0.04, n.h * 0.055, 0, 0, 7); g.fill(); }
    g.fillStyle = '#FFF6E8'; g.beginPath(); g.ellipse(n.x, n.y - n.h * 0.98, n.h * 0.14, n.h * 0.1, 0, 0, 7); g.fill(); g.strokeStyle = '#EADFCC'; g.stroke();
    const rk = U.rack; g.strokeStyle = '#9E968C'; g.lineWidth = 3; g.strokeRect(rk.x, rk.y + rk.h - 12, rk.w, 8);
    for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(rk.x + 40 + i * 70, rk.y + rk.h - 30, 28, 0, 7); g.fillStyle = '#E9B872'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#9A6330'; g.stroke(); }
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
    for (const [n, w, h, zy] of list) {
      const im = await load(src[n]);
      const c = document.createElement('canvas'); c.width = 2 * w; c.height = h; const g = c.getContext('2d');
      g.fillStyle = '#F0E6D8'; g.fillRect(0, 0, 2 * w, h);
      g.drawImage(im, 0, 0, w, h); g.drawImage(im, w, 0, w, h);
      const d = g.getImageData(0, 0, 2 * w, h).data;
      const col = (x1, x2) => { let t = 0; for (let yy = 0; yy < h; yy++) { const i = (yy * 2 * w + x1) * 4, j = (yy * 2 * w + x2) * 4; for (let q = 0; q < 3; q++) t += Math.abs(d[i + q] - d[j + q]); } return t / h; };
      const seam = col(w - 1, w); let sum = 0; for (let x = 50; x < w - 50; x++) sum += col(x, x + 1);
      const avg = sum / (w - 100);
      scores.push(`${n.padEnd(20)} seam=${seam.toFixed(2)} interiorAvg=${avg.toFixed(2)} ${seam <= Math.max(1.5, avg * 3) ? 'OK' : 'CHECK'}`);
      const dh = h / 2 * (1200 / w);
      o.drawImage(c, 0, y, 1200, dh);
      o.save(); o.setLineDash([6, 6]); o.strokeStyle = 'red'; o.lineWidth = 1.5; o.beginPath(); o.moveTo(600, y); o.lineTo(600, y + dh); o.stroke(); o.restore();
      const zh = Math.min(h, dh / 4);
      o.imageSmoothingEnabled = false; o.drawImage(c, w - 74, Math.max(0, Math.min(h - zh, zy)), 148, zh, 1210, y, 592, Math.min(dh, zh * 4)); o.imageSmoothingEnabled = true;
      o.save(); o.setLineDash([8, 6]); o.strokeStyle = 'red'; o.lineWidth = 2; o.beginPath(); o.moveTo(1506, y); o.lineTo(1506, y + dh); o.stroke(); o.restore();
      y += dh + 12;
    }
    return { url: out.toDataURL('image/png'), scores };
  })();
}

function pageParticles({ src, parts }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const n = parts.length, c = document.createElement('canvas'); c.width = 20 + n * 110; c.height = 360; const g = c.getContext('2d');
    g.fillStyle = '#F6E9D2'; g.fillRect(0, 0, c.width, 120); g.fillStyle = '#B9C3B2'; g.fillRect(0, 120, c.width, 120); g.fillStyle = '#8FB4CC'; g.fillRect(0, 240, c.width, 120);
    let x = 20;
    for (const p of parts) { const im = await load(src['particles/' + p]); for (const y0 of [0, 120, 240]) g.drawImage(im, x, y0 + 16, 88, 88); x += 110; }
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
    const U = uiLayout(W, H);
    const L = envLayout(W, H, U.groundY, { trayCx: U.tray.x + U.tray.w / 2, freeTop: U.portrait ? U.palY + 62 : U.bubble.y + U.bubble.h });
    save(await pg.evaluate(pageScene, { mood: m, W, H, L, U, src: SRC, amb: AMBIENT[m], bags: BAGS[m], tileXsSrc: tileXs.toString() }), path.join(ART, `env_scene_${vp}_${m}.png`));
    if (m === 'spring') console.log(vp, JSON.stringify({ counterY: L.counterY, kf: +L.far.k.toFixed(3), farY: Math.round(L.far.y), km: L.mid.k, kg: +L.ground.k.toFixed(3), win: L.windows.map(w => Math.round(w.x) + ',' + Math.round(w.y)) }));
  }
  if (!only || only === 'sheet') save(await pg.evaluate(pageParticles, { src: SRC, parts: PARTS }), path.join(ART, 'env_particles.png'));
  if (!only || only === 'seams') {
    const list = MOODS.flatMap(s => [['env/far_' + s, 800, 720, 300], ['env/mid_' + s, 1200, 300, 150], ['env/ground_' + s, 1200, 260, 60]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
