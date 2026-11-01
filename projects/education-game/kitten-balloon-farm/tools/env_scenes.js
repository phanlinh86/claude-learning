// Kitten's Balloon Farm: environment preview scenes (Playwright + canvas, same layer maths as game/js/render.js _landscape
// of the sister game Owlet's Snow Garden). Run after tools/art_env.js:  node tools/env_scenes.js [filter]
// Writes docs/art/scene_<ipadL|iphoneL|iphoneP>_<morning|noon|sunset|night>.png and docs/art/env_seams.png
// (each layer: 2 tiles side by side with the seam marked + a 4x zoom on the join) and prints numeric seam scores.
// MOODS below = the proposed KB.Weather ambient per time of day (sky colours, tint, darkness); drawSky shows stars/moon.
// Layer placement (k = 1.36 on tall portrait, else 1; gy = layout.groundY):
//   far    1200k x 420k, bottom at gy - 120          (top gy - 540)
//   mid    1200k x 360k, bottom at gy - 10           (top gy - 370; fence rails at svg y ~297..325)
//   ground 1200k x 260k, top at gy - 30 - 40k        (its grass lip, svg y ≈ 40, lands on gy - 30)
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');

const PARTS = ['sparkle', 'star', 'firefly', 'butterfly', 'petal', 'leaf', 'puff', 'confetti_a', 'confetti_b', 'seed'];
const NAMES = ['env/far', 'env/mid', 'env/ground', 'env/sun', 'env/moon', 'env/cloud1', 'env/cloud2', 'env/cloud3', ...PARTS.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');

const MOODS = [
  { id: 'morning', skyTop: '#F7C6D4', skyBottom: '#FFE9D4', horizon: '#FFF1DE', tint: 'rgba(255,190,170,0.08)', darkness: 0,
    sun: 1, sunX: 0.18, sunY: 0.26, moon: 0, stars: 0, clouds: ['cloud2', 'cloud1'], parts: ['butterfly', 'sparkle', 'butterfly', 'sparkle', 'petal'] },
  { id: 'noon', skyTop: '#86C8F4', skyBottom: '#DCF0FF', horizon: '#F2FAFF', tint: null, darkness: 0,
    sun: 1, sunX: 0.66, sunY: 0.10, moon: 0, stars: 0, clouds: ['cloud1', 'cloud3', 'cloud2'], parts: ['butterfly', 'leaf', 'butterfly', 'petal'] },
  { id: 'sunset', skyTop: '#8C7CC8', skyBottom: '#FFC79E', horizon: '#FFE0B0', tint: 'rgba(255,150,110,0.10)', darkness: 0,
    sun: 1, sunX: 0.74, sunY: 0.40, moon: 0, stars: 0.2, clouds: ['cloud3', 'cloud2'], parts: ['seed', 'seed', 'seed', 'seed', 'seed'] },
  { id: 'night', skyTop: '#141F4C', skyBottom: '#2C417E', horizon: '#4A63A3', tint: null, darkness: 0.26,
    sun: 0, moon: 1, moonX: 0.78, moonY: 0.12, stars: 1, clouds: [], parts: ['firefly', 'firefly', 'star', 'firefly', 'firefly', 'firefly'] },
];
const DARK_RGB = '14,20,56';
const DEVICES = [['ipadL', 1036, 720], ['iphoneL', 1556, 720], ['iphoneP', 720, 1556]];
const BALLOONS = [['#E84A4A', '#A8282E'], ['#3C8DE8', '#1F5BA8'], ['#FFD23F', '#C99A12'], ['#4CC26B', '#2A8343'], ['#FF9A2E', '#C4650C'], ['#9B6BE0', '#6840A8']];

function pageScene({ W, H, mood, src, balloons, DARK_RGB }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const tall = H > W * 1.6, k = tall ? 1.36 : 1, portrait = H > W;
    const gy = H - 96 - (tall ? Math.min(140, 0.3 * (H - 1.6 * W)) : 0);   // DESIGN §2 groundY (no insets)
    let seedR = 7; const rnd = () => { seedR = (seedR * 16807) % 2147483647; return seedR / 2147483647; };
    // 1) sky gradient (0 → gy) + horizon glow behind the far hills
    const sky = g.createLinearGradient(0, 0, 0, gy); sky.addColorStop(0, mood.skyTop); sky.addColorStop(1, mood.skyBottom);
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const hz = g.createLinearGradient(0, gy - 620 * k, 0, gy - 140);
    hz.addColorStop(0, mood.horizon + '00'); hz.addColorStop(0.6, mood.horizon + '99'); hz.addColorStop(1, mood.horizon + 'DD');
    g.fillStyle = hz; g.fillRect(0, Math.max(0, gy - 620 * k), W, 620 * k);
    // 2) stars
    if (mood.stars > 0) {
      for (let i = 0; i < Math.round(W * H / 5200); i++) {
        const x = rnd() * W, y = rnd() * (gy - 330 * k), r = 0.8 + rnd() * 1.6, ph = rnd();
        g.globalAlpha = mood.stars * (0.45 + 0.55 * ph); g.fillStyle = ph > 0.85 ? '#FFF3C4' : '#FFFFFF';
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
    }
    const spr = (n, x, y, w, a = 1, rot = 0) => { const i = im[n]; const h = w * i.height / i.width; g.save(); g.globalAlpha = a; g.translate(x, y); g.rotate(rot); g.drawImage(i, -w / 2, -h / 2, w, h); g.restore(); };
    // play band (DESIGN §2): balloons between bubble bottom + 30 + s/2 and gy - 150; sun/moon kept above it
    const size = 118 * (tall ? 1.15 : 1), bandTop = 20 + 104 + 30 + size / 2, bandBot = gy - 150;
    const skyMax = Math.min(gy - 230, bandTop - 70);
    if (mood.moon) spr('env/moon', W * mood.moonX, Math.min(skyMax, Math.max(90, H * mood.moonY)), 180, mood.moon);
    if (mood.sun) spr('env/sun', W * mood.sunX, Math.min(skyMax, H * mood.sunY + 40), mood.sunY > 0.38 ? 240 : 180, mood.sun);
    mood.clouds.forEach((cl, i) => spr('env/' + cl, (i * 0.34 + 0.2) * W, 70 + (i % 2) * 60, 300 * (1.05 - i * 0.12), mood.id === 'sunset' ? 0.9 : 1));
    // 3) landscape (as render.js _landscape)
    const layers = [['env/far', 420, gy - 120, 0], ['env/mid', 360, gy - 10, 0], ['env/ground', 260, gy - 30 - 40 * k + 260 * k, 0]];
    for (const [n, h, bottom, off] of layers) {
      const tw = 1200 * k, th = h * k, y = bottom - th;
      for (let x = -(((off % tw) + tw) % tw); x < W; x += tw) g.drawImage(im[n], Math.round(x), Math.round(y), Math.round(tw), Math.round(th));
      if (n === 'env/ground' && y + th < H) { g.fillStyle = '#9CCB7C'; g.fillRect(0, y + th - 2, W, H - y - th + 2); }
    }
    // 4) mood tint + night darkness (background only)
    if (mood.tint) { g.fillStyle = mood.tint; g.fillRect(0, 0, W, H); }
    if (mood.darkness > 0) {
      const d = mood.darkness, y0 = gy - 470 * k, y1 = gy - 330 * k, dg = g.createLinearGradient(0, y0, 0, H);
      dg.addColorStop(0, `rgba(${DARK_RGB},0)`); dg.addColorStop((y1 - y0) / (H - y0), `rgba(${DARK_RGB},${d})`); dg.addColorStop(1, `rgba(${DARK_RGB},${0.7 * d})`);
      g.fillStyle = dg; g.fillRect(0, y0, W, H - y0);
    }
    // 5) foreground stand-ins (NOT tinted): ground line, Miu blob, sign, balloons, a friend sticker
    g.save(); g.setLineDash([10, 8]); g.strokeStyle = 'rgba(200,0,120,0.85)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, gy); g.lineTo(W, gy); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.moveTo(0, bandBot); g.lineTo(W, bandBot); g.moveTo(0, bandTop - size / 2); g.lineTo(W, bandTop - size / 2); g.stroke(); g.restore();
    const mx = 110, my = gy + 18, mh = portrait ? 200 : 190;
    g.fillStyle = 'rgba(80,110,60,0.25)'; g.beginPath(); g.ellipse(mx, my, 60, 10, 0, 0, 7); g.fill();
    g.lineWidth = 4; g.fillStyle = '#FFF6E8'; g.strokeStyle = '#8A6650';
    g.beginPath(); g.ellipse(mx, my - mh * 0.3, mh * 0.27, mh * 0.3, 0, 0, 7); g.fill(); g.stroke();
    g.beginPath(); g.arc(mx + 8, my - mh * 0.72, mh * 0.22, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#EBD08C'; g.beginPath(); g.ellipse(mx + 8, my - mh * 0.88, mh * 0.3, mh * 0.06, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#5FD3B4'; g.fillRect(mx - 30, my - mh * 0.52, 76, 12);
    const sx = mx + 165, sy = gy + 24, sw = 150, sh = 112 * 150 / 128;
    g.fillStyle = '#E2C597'; g.strokeStyle = '#9A774C'; g.fillRect(sx - 7, sy - sh, 14, sh); g.strokeRect(sx - 7, sy - sh, 14, sh);
    g.beginPath(); g.roundRect(sx - sw / 2, sy - sh, sw, sh * 0.7, 10); g.fill(); g.stroke();
    g.fillStyle = '#FFF8EA'; g.beginPath(); g.roundRect(sx - sw / 2 + 14, sy - sh + 9, sw - 28, sh * 0.7 - 18, 6); g.fill();
    g.fillStyle = '#E84A4A'; g.beginPath(); g.arc(sx, sy - sh + sh * 0.35, 22, 0, 7); g.fill();
    // balloons: spread across the band, skipping the Miu+sign box (landscape)
    const pts = [];
    const x0 = 50 + size / 2, x1 = W - 50 - size / 2;
    const n = portrait ? 6 : 6;
    for (let i = 0; i < n; i++) {
      let x, y;
      if (portrait) { const col = i % 3, row = Math.floor(i / 3); x = x0 + (col + 0.5) / 3 * (x1 - x0) + (row ? 30 : -30); y = bandBot - (row + 0.3) * size * 1.35 - (col % 2) * 30; }
      else { x = x0 + 120 + (i + 0.5) / n * (x1 - x0 - 120); y = bandTop + ((i * 0.53 + 0.15) % 1) * (bandBot - bandTop); if (x < sx + 110 && y > gy - 320) y = gy - 320; }
      pts.push([x, y]);
    }
    balloons.forEach(([fc, dc], i) => {
      const [x, y] = pts[i], r = size / 2;
      g.strokeStyle = 'rgba(120,110,100,0.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y + r * 1.12);
      g.bezierCurveTo(x - 10, y + r * 1.5, x + 12, y + r * 1.9, x - 4, y + r * 2.3); g.stroke();
      const gr = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1); gr.addColorStop(0, fc); gr.addColorStop(1, dc);
      g.fillStyle = fc; g.beginPath(); g.ellipse(x, y, r, r * 1.12, 0, 0, 7); g.fill();
      g.fillStyle = gr; g.globalAlpha = 0.35; g.fill(); g.globalAlpha = 1;
      g.lineWidth = 3; g.strokeStyle = dc; g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(x - r * 0.38, y - r * 0.45, r * 0.16, r * 0.26, 0.5, 0, 7); g.fill();
      g.fillStyle = dc; g.beginPath(); g.moveTo(x - 7, y + r * 1.2); g.lineTo(x + 7, y + r * 1.2); g.lineTo(x, y + r * 1.08); g.fill();
    });
    // a friend sticker stand-in on the yard
    const fx = sx + 160, fy = gy + 30;
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.arc(fx, fy - 42, 42, 0, 7); g.fill(); g.fillStyle = '#FFB7CB'; g.beginPath(); g.arc(fx, fy - 42, 35, 0, 7); g.fill();
    // weather particles (sky layer)
    mood.parts.forEach((p, i) => {
      const x = 240 + i * (W - 340) / Math.max(1, mood.parts.length - 1), y = p === 'firefly' ? gy - 40 - ((i * 97) % 260) : (150 + ((i * 137) % 220)) * (portrait ? 1.4 : 1);
      if (p === 'firefly') { g.save(); g.globalCompositeOperation = 'lighter'; spr('particles/' + p, x, y, 34, 0.9); g.restore(); }
      else spr('particles/' + p, x, y, p === 'butterfly' ? 36 : 30, 1, i * 0.4);
    });
    return c.toDataURL('image/png');
  })();
}

function pageSeams({ src }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const L = [['env/far', 420], ['env/mid', 360], ['env/ground', 260]];
    const im = {}; for (const [n] of L) im[n] = await load(src[n]);
    const out = document.createElement('canvas'); out.width = 1800; out.height = 3 * 290;
    const o = out.getContext('2d'); o.fillStyle = '#BFE2FA'; o.fillRect(0, 0, out.width, out.height);
    const scores = []; let y = 0;
    for (const [n, h] of L) {
      const c = document.createElement('canvas'); c.width = 2400; c.height = h; const g = c.getContext('2d');
      g.drawImage(im[n], 0, 0, 1200, h); g.drawImage(im[n], 1200, 0, 1200, h);
      const d = g.getImageData(0, 0, 2400, h).data;
      const col = (x1, x2) => { let t = 0; for (let yy = 0; yy < h; yy++) { const i = (yy * 2400 + x1) * 4, j = (yy * 2400 + x2) * 4; for (let q = 0; q < 4; q++) t += Math.abs(d[i + q] - d[j + q]); } return t / h; };
      const seam = col(1199, 1200); let sum = 0, mx = 0; for (let x = 100; x < 1100; x++) { const v = col(x, x + 1); sum += v; mx = Math.max(mx, v); }
      scores.push(`${n.padEnd(11)} seam=${seam.toFixed(2)} interiorAvg=${(sum / 1000).toFixed(2)} interiorMax=${mx.toFixed(2)} ${seam <= sum / 1000 * 3 ? 'OK' : 'CHECK'}`);
      // overview: 2 tiles at half size, seam marked by a red dashed line
      o.drawImage(c, 0, y, 1200, h / 2);
      o.save(); o.setLineDash([6, 6]); o.strokeStyle = 'red'; o.lineWidth = 1.5; o.beginPath(); o.moveTo(600, y); o.lineTo(600, y + h / 2); o.stroke(); o.restore();
      // 4x zoom on the join, where the layer has content
      const zy = n === 'env/ground' ? 20 : n === 'env/mid' ? h - 150 : h - 160;
      o.imageSmoothingEnabled = false; o.drawImage(c, 1126, zy, 148, 65, 1210, y, 590, 260); o.imageSmoothingEnabled = true;
      o.save(); o.setLineDash([8, 6]); o.strokeStyle = 'red'; o.lineWidth = 2; o.beginPath(); o.moveTo(1210 + 295, y); o.lineTo(1210 + 295, y + 260); o.stroke(); o.restore();
      y += 290;
    }
    return { url: out.toDataURL('image/png'), scores };
  })();
}

function pageSheet({ src }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const c = document.createElement('canvas'); c.width = 1500; c.height = 640; const g = c.getContext('2d');
    let gr = g.createLinearGradient(0, 0, 0, 240); gr.addColorStop(0, '#86C8F4'); gr.addColorStop(1, '#DCF0FF'); g.fillStyle = gr; g.fillRect(0, 0, 1100, 240);
    g.fillStyle = '#1C2858'; g.fillRect(1100, 0, 400, 240);
    let x = 10; for (const n of ['env/sun', 'env/cloud1', 'env/cloud2', 'env/cloud3']) { const i = await load(src[n]); g.drawImage(i, x, 30); x += i.width + 10; }
    g.drawImage(await load(src['env/moon']), 1200, 20);
    const parts = Object.keys(src).filter(k => k.startsWith('particles/'));
    const bgs = ['#B5DB93', '#86C8F4', '#1C2858'];
    for (let r = 0; r < 3; r++) { g.fillStyle = bgs[r]; g.fillRect(0, 240 + r * 133, 1500, 133); for (let i = 0; i < parts.length; i++) g.drawImage(await load(src[parts[i]]), 14 + i * 148, 252 + r * 133, 110, 110); }
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
    save(await pg.evaluate(pageScene, { W, H, mood, src: SRC, balloons: BALLOONS, DARK_RGB }), path.join(ART, `scene_${dn}_${mood.id}.png`));
  }
  const s = await pg.evaluate(pageSeams, { src: SRC }); save(s.url, path.join(ART, 'env_seams.png')); console.log(s.scores.join('\n'));
  const sheet = process.env.SHEET || path.join(require('os').tmpdir(), 'kb_env_sheet.png');
  save(await pg.evaluate(pageSheet, { src: SRC }), sheet);
  await b.close(); console.log('wrote', ART, '(+', sheet + ')');
})().catch(e => { console.error(e); process.exit(1); });
