// Bim's Rainbow Rocket: environment preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]
// Writes docs/art/scene_<ipadL|iphoneL|iphoneP>_<morning|noon|sunset|night>.png, docs/art/scene_<device>_boost.png
// and docs/art/env_seams.png (each tileable file: 2 tiles side by side, seam marked, 4x zoom on the join) + seam scores.
//
// Layer recipe shown here = the recommendation for render.js (see RECIPE below, also printed when it runs):
//   sky: code gradient (DESIGN §3) · sun/moon/rainbow/planets (parallax 0.05) · cloud layers 0.15 / 0.35 / 0.6 (tinted per
//   mood by mixing toward a tint colour with 'source-atop', cached per mood) · hills (bottom-anchored, parallax 1 = they
//   scroll off with the world) · foreground islands (placeholders: outlined puffy clouds, red / blue / yellow; planets at night).
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');

const MOODS = ['morning', 'noon', 'sunset', 'night'];
const NAMES = ['env/cloud_a', 'env/cloud_b', 'env/cloud_c', 'env/cloud_d', 'env/cloud_e', 'env/cloudbank', 'env/rainbow', 'env/sun', 'env/moon',
  'env/planet_a', 'env/planet_b', 'env/planet_c', ...MOODS.map(m => 'env/hills_' + m),
  ...['sparkle', 'star', 'puff', 'dust', 'confetti_a', 'confetti_b'].map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');

// Recommended per-mood ambient for the renderer (sky stops from DESIGN §3, top → bottom).
const RECIPE = {
  morning: { sky: ['#FFE3C9', '#A9DBF7'], cloudTint: ['#FFE6D4', 0.22], layerAlpha: [0.55, 0.75, 0.92], sun: { x: 0.18, y: 0.16, w: 170, a: 1 }, rainbow: { x: 0.70, y: 0.30, w: 520, a: 0.55 }, hillsFill: '#A4D1A9' },
  noon:    { sky: ['#7EC8F2', '#CDEBFB'], cloudTint: ['#FFFFFF', 0], layerAlpha: [0.6, 0.8, 0.95], sun: { x: 0.80, y: 0.12, w: 190, a: 1 }, rainbow: { x: 0.30, y: 0.34, w: 480, a: 0.45 }, hillsFill: '#97CC9E' },
  sunset:  { sky: ['#FFB38A', '#E7A2C4', '#9E8BD6'], cloudTint: ['#F7B7C2', 0.38], layerAlpha: [0.55, 0.72, 0.9], sun: { x: 0.78, y: 0.20, w: 200, a: 0.95 }, rainbow: null, hillsFill: '#BEA5B7' },
  night:   { sky: ['#1D2556', '#3A2F6E'], cloudTint: ['#59609E', 0.62], layerAlpha: [0.35, 0.5, 0.68], moon: { x: 0.80, y: 0.15, w: 180, a: 1 }, planets: [['a', 0.14, 0.24, 120], ['b', 0.56, 0.08, 90], ['c', 0.36, 0.55, 70]], stars: 70, hillsFill: '#283057' },
};
const DEVICES = [['iphoneL', 1556, 720], ['ipadL', 960, 720], ['iphoneP', 720, 1556]];
const ANS = [['#E84A4A', '#A8282E'], ['#3C8DE8', '#1F5BA8'], ['#FFD23F', '#C99A12']];

function pageScene({ W, H, mood, R, src, ans, boost }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const portrait = H > W;
    // sky gradient (code)
    const sk = g.createLinearGradient(0, 0, 0, H); R.sky.forEach((col, i) => sk.addColorStop(i / (R.sky.length - 1), col));
    g.fillStyle = sk; g.fillRect(0, 0, W, H);
    // seeded rng
    let seed = 99; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // tinted cloud cache: mix toward tint colour on the opaque pixels only
    const tinted = {};
    const tint = n => {
      if (tinted[n]) return tinted[n];
      const i = im[n], o = document.createElement('canvas'); o.width = i.width * 2; o.height = i.height * 2; const q = o.getContext('2d');
      q.drawImage(i, 0, 0, o.width, o.height);
      if (R.cloudTint[1] > 0) { q.globalCompositeOperation = 'source-atop'; q.globalAlpha = R.cloudTint[1]; q.fillStyle = R.cloudTint[0]; q.fillRect(0, 0, o.width, o.height); }
      return (tinted[n] = o);
    };
    const spr = (img, x, y, w, a = 1) => { const h = w * img.height / img.width; g.save(); g.globalAlpha = a; g.drawImage(img, x - w / 2, y - h / 2, w, h); g.restore(); };
    // night stars (weather does this in-game; shown for context)
    if (R.stars) for (let i = 0; i < R.stars * (W * H) / (1556 * 720); i++) { g.fillStyle = `rgba(255,248,220,${0.35 + rnd() * 0.6})`; g.beginPath(); g.arc(rnd() * W, rnd() * H * 0.9, 0.8 + rnd() * 1.6, 0, 7); g.fill(); }
    // celestial
    const yk = portrait ? 0.6 : 1;
    if (R.sun) spr(im['env/sun'], R.sun.x * W, R.sun.y * H * yk + (portrait ? 230 : 0), R.sun.w, R.sun.a);
    if (R.moon) spr(im['env/moon'], R.moon.x * W, R.moon.y * H * yk + (portrait ? 230 : 0), R.moon.w, R.moon.a);
    if (R.planets) for (const [k, x, y, w] of R.planets) spr(im['env/planet_' + k], x * W, y * H, w, 0.85);
    if (R.rainbow) spr(im['env/rainbow'], R.rainbow.x * W, R.rainbow.y * H, R.rainbow.w, R.rainbow.a);
    // parallax cloud layers: 0.15 (small, faint) / 0.35 / 0.6 (big)
    const kinds = ['a', 'b', 'c', 'd', 'e'];
    const layers = [{ s: 0.5, n: 9 }, { s: 0.75, n: 6 }, { s: 1.05, n: 4 }];
    layers.forEach((L, li) => {
      const n = Math.round(L.n * (W * H) / (1556 * 720) + 1);
      for (let i = 0; i < n; i++) {
        const k = kinds[Math.floor(rnd() * 5)], w = 320 * L.s * (0.85 + rnd() * 0.3);
        const x = ((i + rnd() * 0.8) / n) * (W + 200) - 100, y = rnd() * H * 0.85;
        spr(tint('env/cloud_' + k), x, y, w, R.layerAlpha[li]);
      }
    });
    // hills (bottom-anchored; tile 1200 x 420; portrait: same size) + fill below if any
    const hk = 1, hw = 1200 * hk, hh = 420 * hk;
    if (!boost) for (let x = 0; x < W; x += hw) g.drawImage(im['env/hills_' + mood], Math.round(x), H - hh, hw, hh);
    if (boost) {
      // boost moment: the cloud bank crossing the middle of the screen
      for (let x = -200; x < W; x += 1200) g.drawImage(tint('env/cloudbank'), x, H * 0.5 - 150, 1200, 300);
    }
    // layout per DESIGN §2 (no insets)
    const padY = H - (portrait ? 150 : 118);
    const rowY = portrait ? 0.47 * H : Math.max(20 + 122 + 175, 0.42 * H);
    const iw = 200, ih = 110;
    const night = mood === 'night';
    const island = (x, y, col, dark) => {
      g.save();
      if (night) {
        const d = 0.8 * iw; const cy = y + d / 2;
        g.fillStyle = col || '#F1E6FF'; g.strokeStyle = dark || '#8A7FB0'; g.lineWidth = 5;
        g.beginPath(); g.ellipse(x, cy, d * 0.75, d * 0.18, -0.15, 0, 7); g.stroke();
        g.beginPath(); g.arc(x, cy, d / 2, 0, 7); g.fill(); g.stroke();
        g.fillStyle = 'rgba(0,0,0,0.12)'; g.beginPath(); g.arc(x - d * 0.15, cy + d * 0.1, d * 0.09, 0, 7); g.arc(x + d * 0.18, cy - d * 0.08, d * 0.06, 0, 7); g.fill();
      } else {
        const base = col || '#FFFFFF', line = dark || '#9AA6D1';
        g.fillStyle = base; g.strokeStyle = line; g.lineWidth = 5;
        const puffs = [[-60, 18, 42], [-20, 4, 50], [30, 6, 48], [68, 22, 36], [0, 40, 60]];
        g.beginPath(); for (const [u, v, r] of puffs) { g.moveTo(x + u + r, y + v); g.arc(x + u, y + v, r, 0, 7); } g.stroke();
        g.beginPath(); for (const [u, v, r] of puffs) { g.moveTo(x + u + r, y + v); g.arc(x + u, y + v, r, 0, 7); } g.fill();
        if (!col) { g.fillStyle = '#DCE2F6'; g.beginPath(); g.ellipse(x, y + 72, 80, 18, 0, 0, 7); g.fill(); }
        g.fillStyle = 'rgba(255,255,255,0.45)'; g.beginPath(); g.ellipse(x - 26, y - 22, 26, 10, -0.3, 0, 7); g.fill();
      }
      g.restore();
    };
    if (!boost) {
      const xs = [0.22, 0.5, 0.78];
      ans.forEach(([b, d], i) => island(xs[i] * W, rowY + (i === 1 ? -26 : 14), b, d));
      // pad island with the rocket placeholder
      island(W * 0.5, padY, null, null);
      g.fillStyle = '#FFF4E2'; g.strokeStyle = '#8A6E4E'; g.lineWidth = 4;
      g.beginPath(); g.roundRect(W * 0.5 - 34, padY - 160, 68, 160, 30); g.fill(); g.stroke();
      g.fillStyle = '#2FA7A0'; g.beginPath(); g.moveTo(W * 0.5 - 34, padY - 50); g.lineTo(W * 0.5 - 60, padY); g.lineTo(W * 0.5 - 34, padY); g.fill();
      g.beginPath(); g.moveTo(W * 0.5 + 34, padY - 50); g.lineTo(W * 0.5 + 60, padY); g.lineTo(W * 0.5 + 34, padY); g.fill();
    }
    // a few particles, tinted white/gold
    ['sparkle', 'dust', 'star', 'dust', 'sparkle'].forEach((p, j) => spr(im['particles/' + p], 120 + j * (W - 240) / 4, 120 + ((j * 173) % 300), 26, 0.9));
    // bubble stand-in
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.beginPath(); g.roundRect(24, portrait ? 120 : 20, Math.min(640, W - 48 - (portrait ? 0 : 440)), 122, 26); g.fill();
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
      g.drawImage(im, 0, 0, 1200, h); g.drawImage(im, 1200, 0, 1200, h);
      const d = g.getImageData(0, 0, 2400, h).data;
      const col = (x1, x2) => { let t = 0; for (let yy = 0; yy < h; yy++) { const i = (yy * 2400 + x1) * 4, j = (yy * 2400 + x2) * 4; for (let q = 0; q < 4; q++) t += Math.abs(d[i + q] - d[j + q]); } return t / h; };
      const seam = col(1199, 1200); let sum = 0; for (let x = 100; x < 1100; x++) sum += col(x, x + 1);
      scores.push(`${n.padEnd(20)} seam=${seam.toFixed(2)} interiorAvg=${(sum / 1000).toFixed(2)} ${seam <= Math.max(1, sum / 1000 * 3) ? 'OK' : 'CHECK'}`);
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
  for (const [dn, W, H] of DEVICES) {
    for (const m of MOODS) {
      if (only && !`${dn}_${m}`.includes(only)) continue;
      save(await pg.evaluate(pageScene, { W, H, mood: m, R: RECIPE[m], src: SRC, ans: ANS, boost: false }), path.join(ART, `scene_${dn}_${m}.png`));
    }
    if (!only || `${dn}_boost`.includes(only)) save(await pg.evaluate(pageScene, { W, H, mood: 'noon', R: RECIPE.noon, src: SRC, ans: ANS, boost: true }), path.join(ART, `scene_${dn}_boost.png`));
  }
  const list = [...MOODS.map(m => ['env/hills_' + m, 420, 240]), ['env/cloudbank', 300, 60]];
  const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  await b.close(); console.log('wrote', ART);
  console.log('RECIPE', JSON.stringify(RECIPE));
})().catch(e => { console.error(e); process.exit(1); });
module.exports = { RECIPE };
