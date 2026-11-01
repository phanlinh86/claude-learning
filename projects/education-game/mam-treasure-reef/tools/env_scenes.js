// Mầm's Treasure Reef: environment preview scenes (Playwright + canvas, same layer maths as game/js/render.js _landscape).
// Run after tools/art_env.js:  node tools/env_scenes.js [filter]
// Writes docs/art/scene_<ipadL|iphoneL|iphoneP>_<morning|noon|sunset|night>.png and docs/art/env_seams.png
// (each layer, 2 tiles side by side + 4× zoom on the join) and prints numeric seam scores.
// The MOODS table below is the proposed TR.Weather ambient for each time of day (water gradient + light shafts + tint +
// darkness); drawWater() shows how the surface glow, shafts, stars, moon and plankton are meant to be drawn by code.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');

const PARTS = ['bubble1', 'bubble2', 'sparkle', 'star', 'plankton', 'sand', 'fishlet', 'confetti_a', 'confetti_b'];
const NAMES = ['env/far', 'env/mid', 'env/ground', 'env/sun', 'env/moon', 'env/cloud1', 'env/cloud2', 'env/cloud3', ...PARTS.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');

// Proposed ambient per time of day.
//  skyTop/skyBottom = water gradient 0..groundY; horizon = a soft glow band just above the sand (depth haze);
//  shaft = light-shaft colour (+ alpha), tint = full-screen rect over water + layers (source-over) before items;
//  darkness = rgba(DARK_RGB, a) vertical gradient over the background only (0 at gy-470k → a at gy-330k → 0.7a bottom).
const MOODS = [
  { id: 'morning', skyTop: '#F7CDBE', skyMid: '#BFE3D6', skyBottom: '#5FC4C6', horizon: '#9FDDD8', shaft: '#FFE6D6', shaftA: 0.11, tint: 'rgba(255,200,180,0.08)', darkness: 0,
    sun: 1, sunX: 0.22, sunY: 0.12, moon: 0, stars: 0, plankton: 0, clouds: ['cloud2', 'cloud1'], parts: ['sparkle', 'bubble2', 'sparkle'] },
  { id: 'noon', skyTop: '#5FC9DD', skyMid: '#48B0CC', skyBottom: '#2E8FB8', horizon: '#6FB9CE', shaft: '#EFFFFF', shaftA: 0.12, tint: null, darkness: 0,
    sun: 1, sunX: 0.68, sunY: 0.08, moon: 0, stars: 0, plankton: 0, clouds: ['cloud1', 'cloud3', 'cloud2'], parts: ['bubble1', 'fishlet', 'bubble2', 'fishlet', 'bubble1'] },
  { id: 'sunset', skyTop: '#F9B08A', skyMid: '#C98BA8', skyBottom: '#6E5BAE', horizon: '#8F79BE', shaft: '#FFD9A8', shaftA: 0.10, tint: 'rgba(255,150,110,0.10)', darkness: 0.06,
    sun: 1, sunX: 0.74, sunY: 0.16, moon: 0, stars: 0.2, plankton: 0, clouds: ['cloud3', 'cloud2'], parts: ['bubble2', 'bubble1', 'sparkle'] },
  { id: 'night', skyTop: '#13305A', skyMid: '#0F2749', skyBottom: '#0B1E3A', horizon: '#1E4A6E', shaft: '#9FC4F2', shaftA: 0.05, tint: null, darkness: 0.26,
    sun: 0, sunX: 0, sunY: 0, moon: 1, moonX: 0.78, moonY: 0.12, stars: 1, plankton: 1, clouds: ['cloud2'], parts: ['star', 'plankton', 'bubble1', 'plankton', 'star'] },
];
const DARK_RGB = '8,18,48';
const DEVICES = [['ipadL', 960, 720], ['iphoneL', 1556, 720], ['iphoneP', 720, 1556]];
const SHELLS = [['#E84A4A', '#A8282E'], ['#3C8DE8', '#1F5BA8'], ['#FFD23F', '#C99A12'], ['#4CC26B', '#2A8343'], ['#FF9A2E', '#C4650C'], ['#9B6BE0', '#6840A8']];

function pageScene({ W, H, mood, src, shells, DARK_RGB }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const gy = H - 70, k = H > W * 1.6 ? 1.36 : 1, portrait = H > W;
    let seedR = 1; const rnd = () => { seedR = (seedR * 16807) % 2147483647; return seedR / 2147483647; };
    const hex2 = (h, a) => h + Math.round(a * 255).toString(16).padStart(2, '0');
    // 1) water gradient
    const sky = g.createLinearGradient(0, 0, 0, gy); sky.addColorStop(0, mood.skyTop); if (mood.skyMid) sky.addColorStop(0.5, mood.skyMid); sky.addColorStop(1, mood.skyBottom);
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // surface shimmer band (bright at the very top)
    const sf = g.createLinearGradient(0, 0, 0, 120); sf.addColorStop(0, 'rgba(255,255,255,0.22)'); sf.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sf; g.fillRect(0, 0, W, 120);
    // 2) stars (night / dusk) near the surface
    if (mood.stars > 0) {
      for (let i = 0; i < Math.round(W * H / 6000); i++) {
        const x = rnd() * W, y = rnd() * Math.min(gy - 380, H * 0.35), r = 0.8 + rnd() * 1.5, ph = rnd();
        g.globalAlpha = mood.stars * (0.4 + 0.6 * ph); g.fillStyle = ph > 0.85 ? '#FFF3C4' : '#FFFFFF';
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
    }
    // 3) light shafts: soft tilted wedges from the surface, fading by 60 % of the height ('lighter' so they glow)
    if (mood.shaftA > 0) {
      g.save(); g.globalCompositeOperation = 'lighter';
      const n = mood.id === 'night' ? 3 : 5;
      for (let i = 0; i < n; i++) {
        const x0 = (i + 0.3 + 0.5 * ((i * 7) % 3) / 3) / n * W, w0 = 30 + ((i * 53) % 40), w1 = w0 * 3.2, tilt = -(0.1 + 0.05 * (i % 2)) * H;
        const y1 = H * 0.62;
        const gr = g.createLinearGradient(0, 0, 0, y1); gr.addColorStop(0, hex2(mood.shaft, mood.shaftA * 0.4)); gr.addColorStop(0.5, hex2(mood.shaft, mood.shaftA * 0.22)); gr.addColorStop(1, hex2(mood.shaft, 0));
        g.fillStyle = gr;
        for (const sc of [1, 0.78, 0.56, 0.34]) { // nested wedges → soft edges without a blur filter
          g.beginPath(); g.moveTo(x0 - w0 * sc, 0); g.lineTo(x0 + w0 * sc, 0); g.lineTo(x0 + w1 * sc + tilt, y1); g.lineTo(x0 - w1 * sc + tilt, y1); g.closePath(); g.fill();
        }
      }
      g.restore();
    }
    // horizon haze: a soft glow band above the sand so the layers melt into the water
    const hz = g.createLinearGradient(0, gy - 520 * k, 0, gy - 100);
    hz.addColorStop(0, mood.horizon + '00'); hz.addColorStop(0.7, mood.horizon + '55'); hz.addColorStop(1, mood.horizon + '88');
    g.fillStyle = hz; g.fillRect(0, Math.max(0, gy - 520 * k), W, gy);
    const spr = (n, x, y, w, a = 1) => { const i = im[n]; const h = w * i.height / i.width; g.globalAlpha = a; g.drawImage(i, x - w / 2, y - h / 2, w, h); g.globalAlpha = 1; };
    if (mood.moon) spr('env/moon', W * mood.moonX, Math.max(90, H * mood.moonY), 170, mood.moon);
    if (mood.sun) spr('env/sun', W * mood.sunX, Math.min(gy - 300, H * mood.sunY + 60), mood.id === 'sunset' ? 230 : 190, mood.sun * (mood.id === 'morning' ? 0.85 : 1));
    mood.clouds.forEach((cl, i) => spr('env/' + cl, (i * 0.34 + 0.18) * W, 60 + (i % 2) * 70, 320 * (1.05 - i * 0.12), mood.id === 'night' ? 0.5 : 0.9));
    // 4) landscape (as render.js _landscape)
    const layers = [['env/far', 420, gy - 120, 260], ['env/mid', 360, gy - 10, 620], ['env/ground', 260, gy - 30 - 40 * k + 260 * k, 0]];
    for (const [n, h, bottom, off] of layers) {
      const tw = 1200 * k, th = h * k, y = bottom - th;
      for (let x = -(((off % tw) + tw) % tw); x < W; x += tw) g.drawImage(im[n], Math.round(x), Math.round(y), Math.round(tw), Math.round(th));
      if (n === 'env/ground' && y + th < H) { g.fillStyle = '#E3C98E'; g.fillRect(0, y + th - 2, W, H - y - th + 2); }
    }
    // 5) mood tint + darkness (background only)
    if (mood.tint) { g.fillStyle = mood.tint; g.fillRect(0, 0, W, H); }
    if (mood.darkness > 0) {
      const d = mood.darkness, y0 = gy - 470 * k, y1 = gy - 330 * k, dg = g.createLinearGradient(0, y0, 0, H);
      dg.addColorStop(0, `rgba(${DARK_RGB},0)`); dg.addColorStop((y1 - y0) / (H - y0), `rgba(${DARK_RGB},${d})`); dg.addColorStop(1, `rgba(${DARK_RGB},${0.7 * d})`);
      g.fillStyle = dg; g.fillRect(0, y0, W, H - y0);
    }
    // glowing plankton at night (drawn by code from particles, after darkness so it glows)
    if (mood.plankton > 0) {
      for (let i = 0; i < Math.round(W / 60); i++) { const x = rnd() * W, y = gy - 420 + rnd() * 380; spr('particles/plankton', x, y, 14 + rnd() * 16, 0.5 + rnd() * 0.5); }
    }
    // 6) foreground stand-ins (NOT tinted): chests on the sand line, shells in the play band, a mound, Tutu
    const n = 3, cw = Math.min(230, (W - 40) / n - 24), ch = 0.78 * cw, cb = gy + 8;
    for (let i = 0; i < n; i++) {
      const cx = (i + 0.5) * W / n;
      g.fillStyle = 'rgba(60,70,90,0.22)'; g.beginPath(); g.ellipse(cx, cb, cw * 0.46, 9, 0, 0, 7); g.fill();
      g.lineWidth = 4; g.strokeStyle = '#4E2E16';
      g.fillStyle = '#8A5A33'; g.beginPath(); g.roundRect(cx - cw / 2, cb - ch * 0.7, cw, ch * 0.7, 10); g.fill(); g.stroke();
      g.fillStyle = '#D9A441'; g.fillRect(cx - cw / 2 + 2, cb - ch * 0.42, cw - 4, 10); g.fillRect(cx - cw * 0.3, cb - ch * 0.7, 12, ch * 0.7); g.fillRect(cx + cw * 0.18, cb - ch * 0.7, 12, ch * 0.7);
      g.fillStyle = '#6B4224'; g.beginPath(); g.roundRect(cx - cw / 2 - 6, cb - ch, cw + 12, ch * 0.34, 14); g.fill(); g.stroke();
      g.fillStyle = '#3B2414'; g.beginPath(); g.ellipse(cx, cb - ch * 0.68, cw * 0.44, 9, 0, 0, 7); g.fill();
    }
    // placeholder sand mound in the play band
    const ms = 160 * (H / W > 1.6 ? 1.2 : 1), mx = W * 0.5, my = gy - ch - 60;
    g.fillStyle = '#F2DFB3'; g.strokeStyle = '#B59A62'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(mx - ms / 2, my); g.quadraticCurveTo(mx, my - ms * 0.7, mx + ms / 2, my); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#D9C18A'; g.beginPath(); g.moveTo(mx + ms * 0.1, my - ms * 0.32); g.quadraticCurveTo(mx + ms * 0.45, my - ms * 0.3, mx + ms / 2, my); g.lineTo(mx + ms * 0.1, my); g.closePath(); g.fill();
    const s = 110 * (H / W > 1.6 ? 1.2 : 1), tutuY = portrait ? 245 : 225;
    const top = tutuY + 10 + s / 2, bot = cb - ch - 24 - s / 2;
    shells.forEach(([fc, dc], i) => {
      const x = 70 + (i + 0.5) / shells.length * (W - 140), y = top + ((i * 0.41 + 0.2) % 1) * Math.max(0, bot - top);
      const w = s * 0.8, h = s * 0.76;
      g.lineWidth = 4; g.fillStyle = fc; g.strokeStyle = dc;
      g.beginPath(); g.moveTo(x, y + h / 2);
      for (let j = 0; j <= 6; j++) { const a = Math.PI + j / 6 * Math.PI; const px = x + Math.cos(a) * w / 2, py = y - h * 0.05 + Math.sin(a) * h * 0.55; if (j === 0) g.lineTo(px, py); else g.quadraticCurveTo(x + Math.cos(a - Math.PI / 12) * w * 0.58, y - h * 0.05 + Math.sin(a - Math.PI / 12) * h * 0.66, px, py); }
      g.closePath(); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.ellipse(x - w * 0.2, y - h * 0.15, w * 0.1, h * 0.14, 0.5, 0, 7); g.fill();
    });
    // Tutu stand-in: tan oval with a brown shell + mint bandana
    const lx = 105, lh = portrait ? 190 : 175;
    g.lineWidth = 4; g.fillStyle = '#E3CC9A'; g.strokeStyle = '#6B4A2E';
    g.beginPath(); g.ellipse(lx, tutuY - lh * 0.45, lh * 0.34, lh * 0.45, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#8E5B3A'; g.beginPath(); g.ellipse(lx + 10, tutuY - lh * 0.4, lh * 0.26, lh * 0.3, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#5FD3B4'; g.fillRect(lx - lh * 0.28, tutuY - lh * 0.72, lh * 0.5, 12);
    g.fillStyle = '#3A2E2A'; g.beginPath(); g.arc(lx - 16, tutuY - lh * 0.82, 7, 0, 7); g.arc(lx + 14, tutuY - lh * 0.82, 7, 0, 7); g.fill();
    // weather particles
    mood.parts.forEach((p, i) => spr('particles/' + p, 260 + i * (W - 360) / Math.max(1, mood.parts.length - 1), 130 + ((i * 137) % 220), p === 'sand' ? 40 : 30));
    return c.toDataURL('image/png');
  })();
}

function pageSeams({ src }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const L = [['env/far', 420], ['env/mid', 360], ['env/ground', 260]];
    const im = {}; for (const [n] of L) im[n] = await load(src[n]);
    const out = document.createElement('canvas'); out.width = 1800; out.height = 3 * 290;
    const o = out.getContext('2d'); o.fillStyle = '#3F9FC4'; o.fillRect(0, 0, out.width, out.height);
    const scores = []; let y = 0;
    for (const [n, h] of L) {
      const c = document.createElement('canvas'); c.width = 2400; c.height = h; const g = c.getContext('2d');
      g.fillStyle = '#3F9FC4'; g.fillRect(0, 0, 2400, h);
      g.drawImage(im[n], 0, 0, 1200, h); g.drawImage(im[n], 1200, 0, 1200, h);
      const d = g.getImageData(0, 0, 2400, h).data;
      const col = (x1, x2) => { let t = 0; for (let yy = 0; yy < h; yy++) { const i = (yy * 2400 + x1) * 4, j = (yy * 2400 + x2) * 4; for (let q = 0; q < 4; q++) t += Math.abs(d[i + q] - d[j + q]); } return t / h; };
      const seam = col(1199, 1200); let sum = 0, mx = 0; for (let x = 100; x < 1100; x++) { const v = col(x, x + 1); sum += v; mx = Math.max(mx, v); }
      scores.push(`${n.padEnd(11)} seam=${seam.toFixed(2)} interiorAvg=${(sum / 1000).toFixed(2)} interiorMax=${mx.toFixed(2)} ${seam <= sum / 1000 * 3 ? 'OK' : 'CHECK'}`);
      o.drawImage(c, 0, y, 1200, h / 2); o.fillStyle = 'red'; o.fillRect(599, y, 2, 8);
      const sy = n === 'env/ground' ? 10 : n === 'env/mid' ? h - 150 : h - 230;
      o.imageSmoothingEnabled = false; o.drawImage(c, 1125, sy, 150, 66, 1210, y, 590, 260);
      o.fillStyle = 'red'; o.fillRect(1210 + 295 - 1, y, 2, 8);
      y += 290;
    }
    return { url: out.toDataURL('image/png'), scores };
  })();
}

function pageSheet({ src }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const c = document.createElement('canvas'); c.width = 1500; c.height = 640; const g = c.getContext('2d');
    let gr = g.createLinearGradient(0, 0, 0, 240); gr.addColorStop(0, '#5FC9DD'); gr.addColorStop(1, '#2E8FB8'); g.fillStyle = gr; g.fillRect(0, 0, 1100, 240);
    g.fillStyle = '#13305A'; g.fillRect(1100, 0, 400, 240);
    let x = 10; for (const n of ['env/sun', 'env/cloud1', 'env/cloud2', 'env/cloud3']) { const i = await load(src[n]); g.drawImage(i, x, 30); x += i.width + 10; }
    g.drawImage(await load(src['env/moon']), 1200, 20);
    const parts = Object.keys(src).filter(k => k.startsWith('particles/'));
    const bgs = ['#F2DFB3', '#3F9FC4', '#13305A'];
    for (let r = 0; r < 3; r++) { g.fillStyle = bgs[r]; g.fillRect(0, 240 + r * 133, 1500, 133); for (let i = 0; i < parts.length; i++) g.drawImage(await load(src[parts[i]]), 14 + i * 120, 252 + r * 133, 110, 110); }
    return c.toDataURL('image/png');
  })();
}

(async () => {
  fs.mkdirSync(ART, { recursive: true });
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent('<html><body style="margin:0"></body></html>');
  const save = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  const only = process.argv[2];
  for (const [dn, W, H] of DEVICES) for (const mood of MOODS) {
    if (only && !`${dn}_${mood.id}`.includes(only)) continue;
    save(await pg.evaluate(pageScene, { W, H, mood, src: SRC, shells: SHELLS, DARK_RGB }), path.join(ART, `scene_${dn}_${mood.id}.png`));
  }
  const s = await pg.evaluate(pageSeams, { src: SRC }); save(s.url, path.join(ART, 'env_seams.png')); console.log(s.scores.join('\n'));
  save(await pg.evaluate(pageSheet, { src: SRC }), '/tmp/tr_env_sheet.png');
  await b.close(); console.log('wrote', ART, '(+ /tmp/tr_env_sheet.png)');
})().catch(e => { console.error(e); process.exit(1); });
