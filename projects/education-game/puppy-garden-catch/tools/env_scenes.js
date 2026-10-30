// Puppy Garden Catch: environment QA renders (Playwright + canvas, same layer maths as game/js/render.js _landscape).
// Run after tools/art_env.js:  node tools/env_scenes.js
// Writes docs/art/scene_<device>_<mood>.png (4 moods × 3 screens), docs/art/env_seams.png (each layer, two tiles side
// by side + 4× zoom on the join), docs/art/env_sheet.png (sky sprites + particles), and prints numeric seam scores.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');

const NAMES = ['env/far', 'env/mid', 'env/ground', 'env/sun', 'env/rainbow', 'env/cloud1', 'env/cloud2', 'env/cloud3', 'env/cloud_rain',
  ...['leaf1', 'leaf2', 'petal', 'pollen', 'butterfly1', 'butterfly2', 'raindrop', 'splash', 'sparkle', 'puff', 'confetti_a', 'confetti_b', 'pop', 'droplet'].map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');

// moods = weather.js ambient values
const MOODS = [
  { id: 'sunny', top: '#8FD3FF', bot: '#E6F7FF', tint: null, sun: 1, rainbow: 0, dark: 0, clouds: ['cloud1', 'cloud2'], parts: ['butterfly1', 'pollen', 'petal', 'butterfly2'] },
  { id: 'breezy', top: '#7EC8F0', bot: '#DDF3E8', tint: null, sun: 0.8, rainbow: 0, dark: 0, clouds: ['cloud3', 'cloud1', 'cloud2'], parts: ['leaf1', 'leaf2', 'leaf1', 'petal'] },
  { id: 'rain', top: '#8C9BB0', bot: '#C9D3DC', tint: null, sun: 0, rainbow: 0, dark: 0.25, clouds: ['cloud_rain', 'cloud_rain', 'cloud_rain'], parts: [], rain: true },
  { id: 'rainbow', top: '#FFB38A', bot: '#FFE7B8', tint: 'rgba(255,170,90,0.12)', sun: 0.6, rainbow: 1, dark: 0, clouds: ['cloud2'], parts: ['sparkle', 'sparkle', 'butterfly1'] },
];
const DEVICES = [['iphoneL', 1556, 720], ['ipadL', 960, 720], ['iphoneP', 720, 1556]];

// runs in the page: draws one scene on a canvas exactly like the renderer (insets 0, level 1)
function pageScene({ W, H, mood, level, src }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; document.body.appendChild(c);
    const g = c.getContext('2d');
    const gy = H - 64, k = H > W * 1.6 ? 1.36 : 1;
    const sky = g.createLinearGradient(0, 0, 0, gy); sky.addColorStop(0, mood.top); sky.addColorStop(1, mood.bot); g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const spr = (n, x, y, w, a = 1) => { const i = im[n]; const h = w * i.height / i.width; g.globalAlpha = a; g.drawImage(i, x - w / 2, y - h / 2, w, h); g.globalAlpha = 1; };
    if (mood.sun) spr('env/sun', W * 0.64, Math.min(gy - 320, 150), 170, mood.sun);
    if (mood.rainbow) { const rw = Math.min(W * 0.95, 1150); spr('env/rainbow', W * 0.5, gy - 300 - rw * 0.21, rw, 0.85); }
    mood.clouds.forEach((cl, i) => spr('env/' + cl, (i * 0.34 + 0.16) * W, 70 + (i % 2) * 60, 300 * (1.1 - i * 0.12)));
    const layers = [['env/far', 420, gy - 120, 0.15 * 1300 * level], ['env/mid', 360, gy - 10, 0.35 * 1300 * level], ['env/ground', 260, gy - 30 - 40 * k + 260 * k, 0]];
    for (const [n, h, bottom, off] of layers) {
      const tw = 1200 * k, th = h * k, y = bottom - th;
      for (let x = -(((off % tw) + tw) % tw); x < W; x += tw) g.drawImage(im[n], Math.round(x), Math.round(y), Math.round(tw), Math.round(th));
      if (n === 'env/ground' && y + th < H) { g.fillStyle = '#b5cf78'; g.fillRect(0, y + th - 2, W, H - y - th + 2); }
    }
    if (mood.tint) { g.fillStyle = mood.tint; g.fillRect(0, 0, W, H); }
    if (mood.dark) { const d = mood.dark / 0.25, dg = g.createLinearGradient(0, 0, 0, H); dg.addColorStop(0, `rgba(30,40,60,${0.28 * d})`); dg.addColorStop(1, `rgba(30,40,60,${0.12 * d})`); g.fillStyle = dg; g.fillRect(0, 0, W, H); }
    // stand-ins: Pip (caramel) + basket at the centre, answer-colour balls in the sky band, two in bubbles
    const ph = (H > W ? 190 : 170) * (H / W > 1.6 ? 1.1 : 1), px = W / 2, py = gy + 6;
    g.lineWidth = 4;
    g.fillStyle = '#D9A066'; g.strokeStyle = '#8A5A2E';
    g.beginPath(); g.ellipse(px, py - ph * 0.3, ph * 0.26, ph * 0.3, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.arc(px, py - ph * 0.72, ph * 0.28, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#A8703C'; g.beginPath(); g.ellipse(px - ph * 0.27, py - ph * 0.68, ph * 0.08, ph * 0.17, 0.3, 0, 7); g.fill(); g.beginPath(); g.ellipse(px + ph * 0.27, py - ph * 0.68, ph * 0.08, ph * 0.17, -0.3, 0, 7); g.fill();
    g.fillStyle = '#3FBFA8'; g.fillRect(px - ph * 0.18, py - ph * 0.48, ph * 0.36, 8);
    const bw = 230, bh = 0.62 * bw, ry = py - 0.55 * ph;
    g.fillStyle = '#E8B86A'; g.strokeStyle = '#B8823A'; g.beginPath(); g.moveTo(px - bw / 2, ry); g.quadraticCurveTo(px - bw / 2 + 10, ry + bh * 0.8, px, ry + bh * 0.8); g.quadraticCurveTo(px + bw / 2 - 10, ry + bh * 0.8, px + bw / 2, ry); g.closePath(); g.fill(); g.stroke();
    const BALL = [['#E84A4A', '#A8282E'], ['#3C8DE8', '#1F5BA8'], ['#FFD23F', '#C99A12'], ['#4CC26B', '#2A8343'], ['#FF9A2E', '#C4650C'], ['#9B6BE0', '#6840A8'], ['#FFF4DC', '#C9A877']];
    const top = 150, bot = ry - 60;
    BALL.forEach(([fc, dc], i) => {
      const x = 80 + (i + 0.5) / BALL.length * (W - 160), y = top + ((i * 0.41 + 0.15) % 1) * Math.max(20, bot - top);
      g.fillStyle = fc; g.strokeStyle = dc; g.beginPath(); g.arc(x, y, 48, 0, 7); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(x - 16, y - 18, 14, 8, -0.6, 0, 7); g.fill();
      if (i % 3 === 1) { g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 66, 0, 7); g.stroke(); g.strokeStyle = 'rgba(170,230,255,.6)'; g.beginPath(); g.arc(x, y, 63, 0, 7); g.stroke(); g.lineWidth = 4; }
    });
    mood.parts.forEach((p, i) => spr('particles/' + p, 200 + i * (W - 300) / 4, 220 + ((i * 137) % 220), 30));
    if (mood.rain) {
      g.save(); for (let i = 0; i < 70; i++) { const x = (i * 97) % W, y = (i * 53 + 17 * i * i) % gy; g.translate(x, y); g.rotate(0.2); g.globalAlpha = 0.6; g.drawImage(im['particles/raindrop'], -15, -15, 30, 30); g.setTransform(1, 0, 0, 1, 0, 0); } g.restore();
      for (let i = 0; i < 7; i++) spr('particles/splash', (i * 271 + 40) % W, gy - 22, 30, 0.8);
      spr('particles/droplet', px + 160, gy - 200, 28); spr('particles/pop', px - 200, gy - 260, 64);
    }
    return c.toDataURL('image/png');
  })();
}

// seam strips: each layer, two tiles side by side (with the join marked) + a 4× zoom on the join; returns scores
function pageSeams({ src }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const L = [['env/far', 420], ['env/mid', 360], ['env/ground', 260]];
    const im = {}; for (const [n] of L) im[n] = await load(src[n]);
    const out = document.createElement('canvas'); out.width = 1800; out.height = L.length * 280;
    const o = out.getContext('2d'); o.fillStyle = '#9ad4ff'; o.fillRect(0, 0, out.width, out.height);
    const scores = []; let y = 0;
    for (const [n, h] of L) {
      const c = document.createElement('canvas'); c.width = 2400; c.height = h; const g = c.getContext('2d');
      g.drawImage(im[n], 0, 0, 1200, h); g.drawImage(im[n], 1200, 0, 1200, h);
      const d = g.getImageData(0, 0, 2400, h).data;
      const col = (x1, x2) => { let t = 0; for (let yy = 0; yy < h; yy++) { const i = (yy * 2400 + x1) * 4, j = (yy * 2400 + x2) * 4; for (let q = 0; q < 4; q++) t += Math.abs(d[i + q] - d[j + q]); } return t / h; };
      const seam = col(1199, 1200); let sum = 0, mx = 0; for (let x = 100; x < 1100; x++) { const v = col(x, x + 1); sum += v; mx = Math.max(mx, v); }
      scores.push(`${n.padEnd(11)} seam=${seam.toFixed(2)} interiorAvg=${(sum / 1000).toFixed(2)} interiorMax=${mx.toFixed(2)} ${seam <= sum / 1000 * 3 ? 'OK' : 'CHECK'}`);
      o.drawImage(c, 0, y, 1200, h / 2); o.fillStyle = 'red'; o.fillRect(599, y, 2, 8);
      const sy = n === 'env/ground' ? 20 : h - 200; // 4× zoom on a 150×66 window around the join
      o.imageSmoothingEnabled = false; o.drawImage(c, 1125, sy, 150, 66, 1210, y, 590, 260);
      o.fillStyle = 'red'; o.fillRect(1210 + 295 - 1, y, 2, 8);
      y += Math.max(h / 2, 260) + 20;
    }
    return { url: out.toDataURL('image/png'), scores };
  })();
}

function pageSheet({ src }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const c = document.createElement('canvas'); c.width = 1600; c.height = 1200; const g = c.getContext('2d');
    let gr = g.createLinearGradient(0, 0, 0, 260); gr.addColorStop(0, '#8FD3FF'); gr.addColorStop(1, '#E6F7FF'); g.fillStyle = gr; g.fillRect(0, 0, 1600, 260);
    let x = 10; for (const n of ['env/sun', 'env/cloud1', 'env/cloud2', 'env/cloud3']) { const i = await load(src[n]); g.drawImage(i, x, 30); x += i.width + 20; }
    g.fillStyle = '#8C9BB0'; g.fillRect(x - 10, 0, 1600 - x + 10, 260); g.drawImage(await load(src['env/cloud_rain']), x, 30);
    gr = g.createLinearGradient(0, 260, 0, 700); gr.addColorStop(0, '#FFB38A'); gr.addColorStop(1, '#FFE7B8'); g.fillStyle = gr; g.fillRect(0, 260, 1600, 440);
    g.drawImage(await load(src['env/rainbow']), 10, 270);
    const parts = Object.keys(src).filter(k => k.startsWith('particles/'));
    ['#E6F7FF', '#B6D683', '#6A7A90'].forEach(async (bg, r) => { g.fillStyle = bg; g.fillRect(0, 700 + r * 166, 1600, 166); });
    for (let r = 0; r < 3; r++) for (let i = 0; i < parts.length; i++) g.drawImage(await load(src[parts[i]]), 10 + i * 112, 712 + r * 166, 100, 100);
    return c.toDataURL('image/png');
  })();
}

(async () => {
  fs.mkdirSync(ART, { recursive: true });
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent('<html><body style="margin:0"></body></html>');
  const save = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  const level = +(process.argv.find(a => a.startsWith('--level=')) || '--level=1').split('=')[1];
  for (const [dn, W, H] of DEVICES) for (const mood of MOODS) save(await pg.evaluate(pageScene, { W, H, mood, level, src: SRC }), path.join(ART, `scene_${dn}_${mood.id}.png`));
  const s = await pg.evaluate(pageSeams, { src: SRC }); save(s.url, path.join(ART, 'env_seams.png')); console.log(s.scores.join('\n'));
  save(await pg.evaluate(pageSheet, { src: SRC }), path.join(ART, 'env_sheet.png'));
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
