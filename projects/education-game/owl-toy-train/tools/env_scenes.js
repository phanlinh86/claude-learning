// Momo's Toy Train: environment preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]
// Writes docs/art/scene_<1556x720|960x720|720x1556>_<mood>.png and docs/art/env_seams.png (each tileable layer twice
// side by side, seam marked, 4x zoom of the join) and prints seam scores.
//
// RECIPE (what render.js should reproduce; L = World layout of DESIGN §2):
//   FL  (floor line, wall meets floor) = round(L.rug.y0 + L.S/2)          (top-row cargo bottoms stand on the back floor)
//   RB  (rug bottom outer edge)         = round(L.rug.y1 + L.S/2 + 28)     (lowest cargo stands well inside the rug)
//   kf  (far + mid scale)               = clamp((FL + 10) / 575, 0.42, 0.8)
//   cx  (centre window x)               = portrait W/2; landscape round((bubble.x + bubble.w + W − 160)/2)
//   x0  (far tile origin)               = cx − 600·kf, tiles every 1200·kf both ways
//   1 fill the screen with WALL[m]; 2 sky gradient SKY[m] (top → bottom) over the window glass rows only:
//     glass screen y  gy0 = FL − (720 − 168)·kf … gy1 = FL − (720 − 440)·kf, all x (the wall hides it elsewhere)
//   3 sun (morning/noon/sunset) / moon + stars (night) inside the centre window, clouds anywhere in the glass rows
//   4 far tile: drawn 1200kf × 720kf with its BOTTOM at FL + 2 (top 60 px plain wall = WALL[m])
//   5 ground: kx = kg (landscape 1.0, portrait 1.2), tiles 1200·kg wide from x = −scroll; vertical 5-slice (source rows
//     in viewBox units, see art_env SLICES), kv = min(kg, (RB − FL)/160):
//       A 0–96   → FL … FL+96kv          B 96–104 → stretched FL+96kv … RB−64kv
//       C 104–168 → RB−64kv … RB         D 168–184 → stretched RB … H−76kg       E 184–260 → H−76kg … H
//   6 mid tile: km = 0.85·kf, origin xm = cx − 600·km, BOTTOM (viewBox y 300) at FL + 8 + 8km (props' feet, y 292, at FL + 8)
//   7 track at L.trackY, train, cargo (this file draws placeholders).
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { MOODS, WALL, SKY, FLOOR, RUG, SLICES } = require('./art_env.js');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');

const NAMES = ['env/cloud_a', 'env/cloud_b', 'env/sun', 'env/moon', ...MOODS.flatMap(s => ['far', 'mid', 'ground'].map(l => `env/${l}_${s}`)),
  ...['mote', 'bubble', 'feather', 'puff', 'star', 'sparkle'].map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const COLORS = [['#E84A4A', '#A8282E'], ['#3C8DE8', '#1F5BA8'], ['#FFD23F', '#C99A12'], ['#4CC26B', '#2A8343'], ['#FF9A2E', '#C4650C'], ['#8E44AD', '#6840A8'], ['#FF8FC0', '#C9558A']];

// DESIGN §2 layout with zero insets
function layout(W, H, nCars) {
  const portrait = H > W, tall = H / W > 1.6;
  const groundY = H - (portrait ? 30 : 18);
  const trackY = portrait ? groundY - (tall ? 300 : 220) : groundY - 40;
  const S = portrait && tall ? 125 : 104;
  const Ew = portrait ? 180 : (W < 1100 ? 210 : 240);
  const engine = { x0: 20, x1: 20 + Ew, y0: trackY - 1.15 * Ew };
  const sx0 = engine.x1 + 16, sx1 = W - 20, span = sx1 - sx0;
  const carW = Math.min(260, (span - 16 * (nCars - 1)) / nCars), carH = Math.max(96, Math.min(150, 0.62 * carW));
  const used = carW * nCars + 16 * (nCars - 1), cx0 = sx0 + (span - used) / 2;
  const cars = []; for (let i = 0; i < nCars; i++) { const x0 = cx0 + i * (carW + 16); cars.push({ x0, x1: x0 + carW, y0: trackY - 26 - carH }); }
  const bubble = portrait ? { x: 24, y: 110, w: W - 48, h: 124 } : { x: 24, y: 18, w: Math.min(560, W - 200 - 24), h: 122 };
  const y1 = Math.min(...cars.map(c => c.y0)) - 44 - S / 2;
  let y0 = bubble.y + bubble.h + 40 + S / 2; if (portrait) y0 = Math.max(y0, y1 - 0.85 * W);
  return { W, H, portrait, tall, groundY, trackY, S, engine, cars, bubble, rug: { x0: 40, x1: W - 40, y0, y1 } };
}
function recipe(L) {
  const FL = Math.round(L.rug.y0 + L.S / 2), RB = Math.round(L.rug.y1 + L.S / 2 + 28);
  const kf = Math.max(0.42, Math.min(0.8, (FL + 10) / 575));
  const kg = L.portrait ? 1.2 : 1.0, kv = Math.min(kg, (RB - FL) / 160), km = 0.85 * kf;
  // window centre: portrait = W/2; landscape = midway between the bubble's right edge and the HUD (W - 160)
  const cx = L.portrait ? L.W / 2 : Math.round((L.bubble.x + L.bubble.w + L.W - 160) / 2);
  return { FL, RB, kf, km, cx, x0: cx - 600 * kf, xm: cx - 600 * km, kg, kv, gy0: FL - 552 * kf, gy1: FL - 280 * kf };
}

function pageScene({ mood, L, Q, src, wall, sky, slices, colors }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const { W, H } = L; const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const spr = (img, x, y, w, a = 1) => { const h = w * img.height / img.width; g.save(); g.globalAlpha = a; g.drawImage(img, x - w / 2, y - h / 2, w, h); g.restore(); };
    // 1 wall fill, 2 sky over the glass rows
    g.fillStyle = wall; g.fillRect(0, 0, W, H);
    const sk = g.createLinearGradient(0, Q.gy0, 0, Q.gy1); sk.addColorStop(0, sky[0]); sk.addColorStop(1, sky[1]);
    g.fillStyle = sk; g.fillRect(0, Q.gy0 - 2, W, Q.gy1 - Q.gy0 + 4);
    // 3 sun / moon + stars inside the centre window, clouds
    const gw = 392 * Q.kf, gh = Q.gy1 - Q.gy0, gx = Q.cx - 196 * Q.kf;
    if (mood === 'night') {
      g.fillStyle = '#FFF6D6'; for (let i = 0; i < 40; i++) { const x = (i * 0.618 % 1) * W, y = Q.gy0 + ((i * 0.377 + 0.1) % 1) * gh; g.globalAlpha = 0.5 + (i % 3) * 0.2; g.beginPath(); g.arc(x, y, 1.4 + (i % 4) * 0.5, 0, 7); g.fill(); }
      g.globalAlpha = 1; spr(im['env/moon'], gx + gw * 0.72, Q.gy0 + gh * 0.36, gh * 0.62);
    } else {
      const sy = mood === 'sunset' ? 0.72 : mood === 'noon' ? 0.26 : 0.4;
      spr(im['env/sun'], gx + gw * 0.72, Q.gy0 + gh * sy, gh * 0.66);
      const ca = mood === 'sunset' ? 0.75 : 0.95;
      spr(im['env/cloud_a'], gx + gw * 0.24, Q.gy0 + gh * 0.32, gw * 0.42, ca);
      spr(im['env/cloud_b'], gx - gw * 0.9, Q.gy0 + gh * 0.5, gw * 0.4, ca);
      spr(im['env/cloud_b'], gx + gw * 2.2, Q.gy0 + gh * 0.4, gw * 0.4, ca);
    }
    // 4 far
    const far = im['env/far_' + mood], fw = 1200 * Q.kf, fh = 720 * Q.kf;
    const tileX = (x0, tw, fn) => { let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) fn(x); };
    tileX(Q.x0, fw, x => g.drawImage(far, x, Q.FL + 2 - fh, fw + 0.5, fh));
    // 5 ground 5-slice
    const gr = im['env/ground_' + mood], gw2 = 1200 * Q.kg, ux = gr.width / 1200, uy = gr.height / 260;
    const sl = (r0, r1, d0, d1) => { if (d1 <= d0) return; tileX(0, gw2, x => g.drawImage(gr, 0, r0 * uy, gr.width, (r1 - r0) * uy, x, d0, gw2 + 0.5, d1 - d0 + 0.5)); };
    const kv = Q.kv, FL = Q.FL, RB = Q.RB;
    sl(slices.A[0], slices.A[1], FL, FL + 96 * kv);
    sl(slices.B[0], slices.B[1], FL + 96 * kv, RB - 64 * kv);
    sl(slices.C[0], slices.C[1], RB - 64 * kv, RB);
    sl(slices.D[0], slices.D[1], RB, H - 76 * Q.kg);
    sl(slices.E[0], slices.E[1], H - 76 * Q.kg, H);
    void ux;
    // 6 mid
    const mid = im['env/mid_' + mood], mw = 1200 * Q.km, mh = 300 * Q.km;
    tileX(Q.xm, mw, x => g.drawImage(mid, x, FL + 8 + 8 * Q.km - mh, mw + 0.5, mh));
    // 7 placeholders: track, engine, cars, cargo
    const rr = (x, y, w, h, r, fill, st) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); if (st) { g.lineWidth = 4; g.strokeStyle = st; g.stroke(); } };
    rr(0, L.trackY - 6, W, 14, 4, '#D9B27E', '#B88A55');
    const e = L.engine; rr(e.x0, e.y0 + 0.35 * (e.x1 - e.x0), e.x1 - e.x0, L.trackY - 20 - e.y0 - 0.35 * (e.x1 - e.x0), 14, '#E3BE88', '#7A5530');
    rr(e.x0 + 20, e.y0, 40, 0.4 * (e.x1 - e.x0), 8, '#56607A');
    rr(e.x0 + 0.55 * (e.x1 - e.x0), e.y0 + 0.1 * (e.x1 - e.x0), 0.45 * (e.x1 - e.x0), 0.3 * (e.x1 - e.x0), 8, '#F4EBDD', '#7A5530');
    if (mood === 'night') { g.save(); const lg = g.createRadialGradient(e.x0, L.trackY - 60, 4, e.x0, L.trackY - 60, 120); lg.addColorStop(0, 'rgba(255,231,163,0.7)'); lg.addColorStop(1, 'rgba(255,231,163,0)'); g.fillStyle = lg; g.fillRect(e.x0 - 120, L.trackY - 180, 240, 240); g.restore(); }
    L.cars.forEach((cr, i) => {
      const col = colors[(i * 2 + (mood.length)) % colors.length];
      rr(cr.x0, cr.y0, cr.x1 - cr.x0, L.trackY - 26 - cr.y0, 12, col[0], col[1]);
      for (const wx of [cr.x0 + 30, cr.x1 - 30]) { g.beginPath(); g.arc(wx, L.trackY - 16, 16, 0, 7); g.fillStyle = '#56607A'; g.fill(); }
    });
    // cargo: farthest-point-ish grid over the rug band
    const s = L.S * 0.82, cols = L.portrait ? 3 : 5, rows = L.portrait ? 4 : 2;
    let k = 0;
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const x = L.rug.x0 + 60 + (L.rug.x1 - L.rug.x0 - 120) * (q + (r % 2) * 0.5) / (cols - 0.5);
      const y = rows === 1 ? (L.rug.y0 + L.rug.y1) / 2 : L.rug.y0 + (L.rug.y1 - L.rug.y0) * r / (rows - 1);
      const col = colors[k++ % colors.length];
      g.save(); g.globalAlpha = 0.22; g.fillStyle = '#3A2A1A'; g.beginPath(); g.ellipse(x, y + L.S / 2 - 2, s * 0.5, 9, 0, 0, 7); g.fill(); g.restore();
      rr(x - s / 2, y + L.S / 2 - s - 4, s, s, 14, col[0], col[1]);
    }
    // HUD + bubble stand-ins
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.beginPath(); g.roundRect(W - 160, 16, 144, 64, 20); g.fill();
    g.beginPath(); g.roundRect(L.bubble.x, L.bubble.y, L.bubble.w, L.bubble.h, 26); g.fill();
    // particles sample
    ['mote', 'bubble', 'feather', 'puff', 'star', 'sparkle'].forEach((p, j) => spr(im['particles/' + p], W * (0.55 + j * 0.06), Q.FL - 40, 30));
    return c.toDataURL('image/png');
  })();
}

function pageSeams({ src, list }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    let total = 0; for (const [, h] of list) total += h / 2 + 12;
    const out = document.createElement('canvas'); out.width = 1800; out.height = total;
    const o = out.getContext('2d'); o.fillStyle = '#9FCDEB'; o.fillRect(0, 0, out.width, out.height);
    const scores = []; let y = 0;
    for (const [n, h, zy] of list) {
      const im = await load(src[n]);
      const c = document.createElement('canvas'); c.width = 2400; c.height = h; const g = c.getContext('2d');
      g.fillStyle = '#9FCDEB'; g.fillRect(0, 0, 2400, h);
      g.drawImage(im, 0, 0, 1200, h); g.drawImage(im, 1200, 0, 1200, h);
      const d = g.getImageData(0, 0, 2400, h).data;
      const col = (x1, x2) => { let t = 0; for (let yy = 0; yy < h; yy++) { const i = (yy * 2400 + x1) * 4, j = (yy * 2400 + x2) * 4; for (let q = 0; q < 3; q++) t += Math.abs(d[i + q] - d[j + q]); } return t / h; };
      const seam = col(1199, 1200); let sum = 0; for (let x = 100; x < 1100; x++) sum += col(x, x + 1);
      scores.push(`${n.padEnd(20)} seam=${seam.toFixed(2)} interiorAvg=${(sum / 1000).toFixed(2)} ${seam <= Math.max(1.5, sum / 1000 * 3) ? 'OK' : 'CHECK'}`);
      o.drawImage(c, 0, y, 1200, h / 2);
      o.save(); o.setLineDash([6, 6]); o.strokeStyle = 'red'; o.lineWidth = 1.5; o.beginPath(); o.moveTo(600, y); o.lineTo(600, y + h / 2); o.stroke(); o.restore();
      const zh = (h / 2) / 4;
      o.imageSmoothingEnabled = false; o.drawImage(c, 1126, zy, 148, zh, 1210, y, 592, zh * 4); o.imageSmoothingEnabled = true;
      o.save(); o.setLineDash([8, 6]); o.strokeStyle = 'red'; o.lineWidth = 2; o.beginPath(); o.moveTo(1506, y); o.lineTo(1506, y + zh * 4); o.stroke(); o.restore();
      y += h / 2 + 12;
    }
    return { url: out.toDataURL('image/png'), scores };
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
    const L = layout(W, H, H > W ? 2 : 3), Q = recipe(L);
    save(await pg.evaluate(pageScene, { mood: m, L, Q, src: SRC, wall: WALL[m], sky: SKY[m], slices: SLICES, colors: COLORS }), path.join(ART, `scene_${vp}_${m}.png`));
    if (m === 'morning') console.log(vp, JSON.stringify(Q), 'rug', JSON.stringify(L.rug), 'trackY', L.trackY);
  }
  if (!only || only === 'sheet') {
    const items = ['env/sun', 'env/moon', 'env/cloud_a', 'env/cloud_b', 'particles/mote', 'particles/bubble', 'particles/feather', 'particles/puff', 'particles/star', 'particles/sparkle'];
    save(await pg.evaluate(({ src, items }) => (async () => {
      const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
      const c = document.createElement('canvas'); c.width = 1400; c.height = 440; const g = c.getContext('2d');
      g.fillStyle = '#BFE3F5'; g.fillRect(0, 0, 1400, 220); g.fillStyle = '#2A2F5E'; g.fillRect(0, 220, 1400, 220);
      let x = 20;
      for (const n of items) { const im = await load(src[n]); const big = n.startsWith('env'); const w = big ? (im.width > 200 ? 220 : 150) : 96, h = w * im.height / im.width;
        for (const y0 of [0, 220]) g.drawImage(im, x, y0 + (220 - h) / 2, w, h); x += w + 14; }
      return c.toDataURL('image/png');
    })(), { src: SRC, items }), path.join(ART, 'env_sky_particles.png'));
  }
  if (!only || only === 'seams') {
    const list = MOODS.flatMap(s => [['env/far_' + s, 720, 420], ['env/mid_' + s, 300, 150], ['env/ground_' + s, 260, 60]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
  console.log('FLOOR', JSON.stringify(FLOOR), 'RUG', JSON.stringify(RUG));
})().catch(e => { console.error(e); process.exit(1); });
