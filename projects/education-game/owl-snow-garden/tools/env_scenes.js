// Owlet's Snow Garden: environment preview scenes (Playwright + canvas, same layer maths as game/js/render.js _landscape).
// Run after tools/art_env.js:  node tools/env_scenes.js
// Writes docs/art/scene_<ipadL|iphoneL|iphoneP>_<morning|noon|sunset|night>.png and docs/art/env_seams.png
// (each layer, 2 tiles side by side + 4× zoom on the join) and prints numeric seam scores.
// The MOODS table below is the proposed SG.Weather ambient for each time of day (sky + tint + darkness), and drawSky()
// shows how stars / moon / aurora are meant to be drawn by code.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');

const NAMES = ['env/far', 'env/mid', 'env/ground', 'env/sun', 'env/moon', 'env/cloud1', 'env/cloud2', 'env/cloud3',
  ...['snow1', 'snow2', 'sparkle', 'star', 'petal', 'leaf', 'puff', 'confetti_a', 'confetti_b'].map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');

// Proposed ambient per time of day. tint = full-screen rect over sky + landscape (source-over), before pots/seeds/Lumi.
// darkness = rgba(DARK_RGB, a) vertical gradient over the background only: 0 at the far peak tops (gy-470·k),
// a at gy-330·k, 0.7a at the bottom (so the navy sky keeps its own colour and the play band stays lit).
const MOODS = [
  { id: 'morning', skyTop: '#F3B5C9', skyBottom: '#FFE3C8', horizon: '#FFD2B0', tint: 'rgba(255,186,160,0.10)', darkness: 0,
    sun: 1, sunX: 0.2, sunY: 0.30, moon: 0, stars: 0, aurora: 0, clouds: ['cloud2', 'cloud1'], parts: ['sparkle', 'sparkle', 'puff'] },
  { id: 'noon', skyTop: '#62B4F0', skyBottom: '#D5EEFF', horizon: '#EEF8FF', tint: null, darkness: 0,
    sun: 1, sunX: 0.66, sunY: 0.14, moon: 0, stars: 0, aurora: 0, clouds: ['cloud1', 'cloud3', 'cloud2'], parts: ['snow1', 'snow2', 'snow1', 'snow2', 'sparkle'] },
  { id: 'sunset', skyTop: '#6E58B4', skyBottom: '#FF9F6A', horizon: '#FFC27A', tint: 'rgba(255,140,96,0.13)', darkness: 0,
    sun: 1, sunX: 0.72, sunY: 0.42, moon: 0, stars: 0.25, aurora: 0, clouds: ['cloud3', 'cloud2'], parts: ['snow2', 'snow1', 'snow2'] },
  { id: 'night', skyTop: '#121B45', skyBottom: '#2D3E7C', horizon: '#4E63A6', tint: null, darkness: 0.26,
    sun: 0, sunX: 0, sunY: 0, moon: 1, moonX: 0.78, moonY: 0.14, stars: 1, aurora: 1, clouds: [], parts: ['star', 'star', 'snow2', 'snow1'] },
];
const DARK_RGB = '14,20,56';
const DEVICES = [['ipadL', 960, 720], ['iphoneL', 1556, 720], ['iphoneP', 720, 1556]];
const SEEDS = [['#E84A4A', '#A8282E'], ['#3C8DE8', '#1F5BA8'], ['#FFD23F', '#C99A12'], ['#4CC26B', '#2A8343'], ['#FF9A2E', '#C4650C'], ['#9B6BE0', '#6840A8']];

function pageScene({ W, H, mood, src, seeds, DARK_RGB }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const gy = H - 70, k = H > W * 1.6 ? 1.36 : 1, portrait = H > W;
    let seedR = 1; // deterministic pseudo-random for stars
    const rnd = () => { seedR = (seedR * 16807) % 2147483647; return seedR / 2147483647; };
    // 1) sky
    const sky = g.createLinearGradient(0, 0, 0, gy); sky.addColorStop(0, mood.skyTop); sky.addColorStop(1, mood.skyBottom);
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // horizon glow: band behind the far mountains
    const hz = g.createLinearGradient(0, gy - 620 * k, 0, gy - 140);
    hz.addColorStop(0, mood.horizon + '00'); hz.addColorStop(0.6, mood.horizon + '99'); hz.addColorStop(1, mood.horizon + 'DD');
    g.fillStyle = hz; g.fillRect(0, gy - 620 * k, W, 620 * k);
    // 2) stars (fixed field, upper sky)
    if (mood.stars > 0) {
      for (let i = 0; i < Math.round(W * H / 5200); i++) {
        const x = rnd() * W, y = rnd() * (gy - 380), r = 0.8 + rnd() * 1.6, ph = rnd();
        g.globalAlpha = mood.stars * (0.45 + 0.55 * ph); g.fillStyle = ph > 0.85 ? '#FFF3C4' : '#FFFFFF';
        g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      g.globalAlpha = 1;
    }
    // 3) aurora ribbons: wavy bands, bright lower edge fading upward, additive ('lighter')
    if (mood.aurora > 0) {
      const ribbons = [['#6FF0B0', 0.42, 0.15, 58, 0.0], ['#55D6E6', 0.30, 0.23, 40, 2.1], ['#B58CFF', 0.30, 0.09, 36, 4.2]];
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const [col, a, yy, hgt, ph] of ribbons) {
        const base = x => H * (portrait ? yy * 0.7 : yy) + 70 + 26 * Math.sin(x / W * 6.28 * 1.3 + ph) + 12 * Math.sin(x / W * 6.28 * 3.1 + ph * 2);
        const top = x => base(x) - hgt * (0.7 + 0.3 * Math.sin(x / W * 6.28 * 2 + ph));
        const step = 4;
        for (let x = 0; x < W; x += step) {
          const b = base(x), t = top(x), gr = g.createLinearGradient(0, t, 0, b);
          gr.addColorStop(0, col + '00'); gr.addColorStop(0.75, col); gr.addColorStop(1, col);
          g.globalAlpha = a * mood.aurora * (0.75 + 0.25 * Math.sin(x * 0.05 + ph)); g.fillStyle = gr; g.fillRect(x, t, step, b - t + 3);
        }
      }
      g.restore();
    }
    const spr = (n, x, y, w, a = 1) => { const i = im[n]; const h = w * i.height / i.width; g.globalAlpha = a; g.drawImage(i, x - w / 2, y - h / 2, w, h); g.globalAlpha = 1; };
    if (mood.moon) spr('env/moon', W * mood.moonX, Math.max(90, H * mood.moonY), 180, mood.moon);
    if (mood.sun) spr('env/sun', W * mood.sunX, Math.min(gy - 300, H * mood.sunY + 60), mood.id === 'sunset' ? 240 : 180, mood.sun);
    mood.clouds.forEach((cl, i) => spr('env/' + cl, (i * 0.34 + 0.18) * W, 70 + (i % 2) * 64, 300 * (1.05 - i * 0.12), mood.id === 'sunset' ? 0.92 : 1));
    // 4) landscape (as render.js _landscape)
    const layers = [['env/far', 420, gy - 120, 260], ['env/mid', 360, gy - 10, 620], ['env/ground', 260, gy - 30 - 40 * k + 260 * k, 0]];
    for (const [n, h, bottom, off] of layers) {
      const tw = 1200 * k, th = h * k, y = bottom - th;
      for (let x = -(((off % tw) + tw) % tw); x < W; x += tw) g.drawImage(im[n], Math.round(x), Math.round(y), Math.round(tw), Math.round(th));
      if (n === 'env/ground' && y + th < H) { g.fillStyle = '#E1EBF6'; g.fillRect(0, y + th - 2, W, H - y - th + 2); }
    }
    // 5) mood tint + darkness (background only)
    if (mood.tint) { g.fillStyle = mood.tint; g.fillRect(0, 0, W, H); }
    if (mood.darkness > 0) {
      const d = mood.darkness, y0 = gy - 470 * k, y1 = gy - 330 * k, dg = g.createLinearGradient(0, y0, 0, H);
      dg.addColorStop(0, `rgba(${DARK_RGB},0)`); dg.addColorStop((y1 - y0) / (H - y0), `rgba(${DARK_RGB},${d})`); dg.addColorStop(1, `rgba(${DARK_RGB},${0.7 * d})`);
      g.fillStyle = dg; g.fillRect(0, y0, W, H - y0);
    }
    // 6) foreground stand-ins (NOT tinted): pots on the ground line, 110 px seeds in the play band, Lumi (white owl)
    const n = 3, pw = Math.min(230, (W - 40) / n - 24), ph = 0.78 * pw, pb = gy + 8;
    for (let i = 0; i < n; i++) {
      const cx = (i + 0.5) * W / n;
      g.fillStyle = 'rgba(120,150,190,0.30)'; g.beginPath(); g.ellipse(cx, pb, pw * 0.42, 9, 0, 0, 7); g.fill();
      g.lineWidth = 4; g.fillStyle = '#E9DCC8'; g.strokeStyle = '#9C8466';
      g.beginPath(); g.moveTo(cx - pw * 0.5, pb - ph * 0.8); g.lineTo(cx + pw * 0.5, pb - ph * 0.8); g.lineTo(cx + pw * 0.38, pb); g.lineTo(cx - pw * 0.38, pb); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#D2C1A6'; g.fillRect(cx + pw * 0.12, pb - ph * 0.78, pw * 0.28, ph * 0.76);
      g.beginPath(); g.roundRect(cx - pw * 0.54, pb - ph * 0.9, pw * 1.08, ph * 0.18, 10); g.fillStyle = '#E9DCC8'; g.fill(); g.stroke();
      g.fillStyle = '#6B4A36'; g.beginPath(); g.ellipse(cx, pb - ph * 0.9, pw * 0.44, ph * 0.06, 0, 0, 7); g.fill();
    }
    const s = 110 * (H / W > 1.6 ? 1.2 : 1), lumiY = portrait ? 245 : 225;
    const top = lumiY + 10 + s / 2, bot = pb - ph * 0.9 - 24 - s / 2;
    seeds.forEach(([fc, dc], i) => {
      const x = 70 + (i + 0.5) / seeds.length * (W - 140), y = top + ((i * 0.41 + 0.2) % 1) * Math.max(0, bot - top);
      const w = s * 0.76, h = s * 0.95;
      g.lineWidth = 4; g.fillStyle = fc; g.strokeStyle = dc;
      g.beginPath(); g.moveTo(x, y - h / 2);
      g.bezierCurveTo(x + w * 0.35, y - h * 0.3, x + w / 2, y + h * 0.05, x + w / 2, y + h * 0.18);
      g.bezierCurveTo(x + w / 2, y + h * 0.42, x + w * 0.25, y + h / 2, x, y + h / 2);
      g.bezierCurveTo(x - w * 0.25, y + h / 2, x - w / 2, y + h * 0.42, x - w / 2, y + h * 0.18);
      g.bezierCurveTo(x - w / 2, y + h * 0.05, x - w * 0.35, y - h * 0.3, x, y - h / 2); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(x - w * 0.18, y - h * 0.02, w * 0.1, h * 0.16, 0.3, 0, 7); g.fill();
    });
    const lx = 105, lh = portrait ? 190 : 175;
    g.lineWidth = 4; g.fillStyle = '#FBFAF6'; g.strokeStyle = '#7C8899';
    g.beginPath(); g.ellipse(lx, lumiY - lh * 0.45, lh * 0.36, lh * 0.45, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#5FD3B4'; g.fillRect(lx - lh * 0.3, lumiY - lh * 0.55, lh * 0.6, 14);
    g.fillStyle = '#F2B73A'; g.beginPath(); g.arc(lx - 18, lumiY - lh * 0.68, 13, 0, 7); g.arc(lx + 22, lumiY - lh * 0.68, 13, 0, 7); g.fill();
    // weather particles
    mood.parts.forEach((p, i) => spr('particles/' + p, 260 + i * (W - 360) / Math.max(1, mood.parts.length - 1), 150 + ((i * 137) % 200), p === 'puff' ? 40 : 30));
    return c.toDataURL('image/png');
  })();
}

function pageSeams({ src }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const L = [['env/far', 420], ['env/mid', 360], ['env/ground', 260]];
    const im = {}; for (const [n] of L) im[n] = await load(src[n]);
    const out = document.createElement('canvas'); out.width = 1800; out.height = 3 * 290;
    const o = out.getContext('2d'); o.fillStyle = '#9ec9f0'; o.fillRect(0, 0, out.width, out.height);
    const scores = []; let y = 0;
    for (const [n, h] of L) {
      const c = document.createElement('canvas'); c.width = 2400; c.height = h; const g = c.getContext('2d');
      g.drawImage(im[n], 0, 0, 1200, h); g.drawImage(im[n], 1200, 0, 1200, h);
      const d = g.getImageData(0, 0, 2400, h).data;
      const col = (x1, x2) => { let t = 0; for (let yy = 0; yy < h; yy++) { const i = (yy * 2400 + x1) * 4, j = (yy * 2400 + x2) * 4; for (let q = 0; q < 4; q++) t += Math.abs(d[i + q] - d[j + q]); } return t / h; };
      // seam = join column pair vs the same pair on the image's own left/right edge (x=0 vs x=1199 should match its neighbour)
      const seam = col(1199, 1200); let sum = 0, mx = 0; for (let x = 100; x < 1100; x++) { const v = col(x, x + 1); sum += v; mx = Math.max(mx, v); }
      scores.push(`${n.padEnd(11)} seam=${seam.toFixed(2)} interiorAvg=${(sum / 1000).toFixed(2)} interiorMax=${mx.toFixed(2)} ${seam <= sum / 1000 * 3 ? 'OK' : 'CHECK'}`);
      o.drawImage(c, 0, y, 1200, h / 2); o.fillStyle = 'red'; o.fillRect(599, y, 2, 8);
      const sy = n === 'env/ground' ? 10 : n === 'env/mid' ? h - 130 : h - 230;
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
    let gr = g.createLinearGradient(0, 0, 0, 240); gr.addColorStop(0, '#62B4F0'); gr.addColorStop(1, '#D5EEFF'); g.fillStyle = gr; g.fillRect(0, 0, 1100, 240);
    g.fillStyle = '#1C2858'; g.fillRect(1100, 0, 400, 240);
    let x = 10; for (const n of ['env/sun', 'env/cloud1', 'env/cloud2', 'env/cloud3']) { const i = await load(src[n]); g.drawImage(i, x, 30); x += i.width + 10; }
    g.drawImage(await load(src['env/moon']), 1200, 20);
    const parts = Object.keys(src).filter(k => k.startsWith('particles/'));
    const bgs = ['#F6FAFF', '#62B4F0', '#1C2858'];
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
    save(await pg.evaluate(pageScene, { W, H, mood, src: SRC, seeds: SEEDS, DARK_RGB }), path.join(ART, `scene_${dn}_${mood.id}.png`));
  }
  const s = await pg.evaluate(pageSeams, { src: SRC }); save(s.url, path.join(ART, 'env_seams.png')); console.log(s.scores.join('\n'));
  save(await pg.evaluate(pageSheet, { src: SRC }), '/tmp/sg_env_sheet.png');
  await b.close(); console.log('wrote', ART, '(+ /tmp/sg_env_sheet.png)');
})().catch(e => { console.error(e); process.exit(1); });
