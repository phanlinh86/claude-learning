// Pip's Camp Hide & Seek: environment preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]
// Writes docs/art/scene_<1556x720|960x720|720x1556>_<spring|summer|autumn|winter>.png, docs/art/env_seams.png
// (each tileable layer drawn twice side by side, seam marked + 4x zoom on the join) and prints seam scores + the RECIPE.
//
// RECIPE = the layer numbers recommended for render.js (all bottom-anchored layers: screen y of the layer's BOTTOM edge,
// scale k → drawn size 1200k × hk, tiled from x = 0 every 1200k px; the gap between the forest bottom and the top of the
// meadow tile is filled with GROUND[season] first):
//   sky gradient (DESIGN §3) → sun / clouds → mountains → forest → GROUND fill → meadow → tent_bg, bench, campfire → places.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { GROUND } = require('./art_env.js');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const NAMES = ['env/cloud_a', 'env/cloud_b', 'env/cloud_c', 'env/sun', 'env/campfire', 'env/bench', 'env/tent_bg', 'env/lantern',
  ...SEASONS.flatMap(s => ['mountains', 'forest', 'meadow'].map(l => `env/${l}_${s}`)),
  ...['petal', 'leaf_a', 'leaf_b', 'snow', 'seed', 'sparkle', 'star', 'puff', 'dust', 'confetti_a', 'confetti_b'].map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');

const SKY = { spring: ['#CDEBFB', '#F6F0D8'], summer: ['#8FD0F5', '#E3F4FF'], autumn: ['#F3D9B5', '#CFE3F0'], winter: ['#C9D9EA', '#F2F6FA'] };
const CLOUD_A = { spring: 0.9, summer: 0.95, autumn: 0.8, winter: 0.75 };
const PARTICLE = { spring: ['petal', 'petal', 'sparkle'], summer: ['seed', 'seed', 'sparkle'], autumn: ['leaf_a', 'leaf_b', 'leaf_a'], winter: ['snow', 'snow', 'snow'] };
// camp props relative to layout.camp (fire centre on the ground): x offset, BOTTOM y offset, scale. Draw order: tent, bench, fire.
const CAMP = { tent: { dx: 18, dy: -44, k: 0.8 }, bench: { dx: -168, dy: 6, k: 0.66 }, fire: { dx: 0, dy: 0, k: 0.9 }, lantern: { dx: 104, dy: -58, k: 0.8 } };
// layer y = fraction of H for the layer's bottom edge; k = scale (1 = native px)
const RECIPE = {
  landscape: { mountains: { bottom: 0.62, k: 1 }, forest: { bottom: 0.70, k: 1 }, meadow: { bottom: 1.0, k: 1.22 },
    sun: { x: 0.80, y: 0.15, w: 170 }, clouds: [['a', 0.18, 0.12, 300], ['b', 0.50, 0.08, 240], ['c', 0.66, 0.24, 210]],
    camp: CAMP },
  portrait: { mountains: { bottom: 0.50, k: 1.36 }, forest: { bottom: 0.58, k: 1.36 }, meadow: { bottom: 1.0, k: 1.36 },
    sun: { x: 0.78, y: 0.19, w: 190 }, clouds: [['a', 0.22, 0.20, 300], ['b', 0.62, 0.10, 240], ['c', 0.40, 0.31, 220]],
    meadowBack: { bottom: 0.80, k: 1.0 }, camp: CAMP },
  ground: GROUND, sky: SKY,
};
const VPS = [[1556, 720], [960, 720], [720, 1556]];

function pageScene({ W, H, season, R, sky, ground, src, cloudA, parts }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const portrait = H > W;
    const sk = g.createLinearGradient(0, 0, 0, H * (portrait ? 0.6 : 0.65)); sk.addColorStop(0, sky[0]); sk.addColorStop(1, sky[1]);
    g.fillStyle = sk; g.fillRect(0, 0, W, H);
    const spr = (img, x, y, w, a = 1) => { const h = w * img.height / img.width; g.save(); g.globalAlpha = a; g.drawImage(img, x - w / 2, y - h / 2, w, h); g.restore(); };
    spr(im['env/sun'], R.sun.x * W, R.sun.y * H, R.sun.w, season === 'winter' ? 0.8 : 1);
    for (const [k, x, y, w] of R.clouds) spr(im['env/cloud_' + k], x * W, y * H, w, cloudA);
    const tile = (name, L) => { const img = im[name], tw = img.width * L.k, th = img.height * L.k, by = L.bottom * H; for (let x = 0; x < W; x += tw) g.drawImage(img, Math.round(x), Math.round(by - th), Math.ceil(tw) + 1, th); return by - th; };
    tile('env/mountains_' + season, R.mountains);
    const fb = R.forest.bottom * H; tile('env/forest_' + season, R.forest);
    const mTop = H - 300 * R.meadow.k;
    g.fillStyle = ground; g.fillRect(0, fb - 2, W, H - fb + 2);
    if (R.meadowBack) tile('env/meadow_' + season, R.meadowBack);
    tile('env/meadow_' + season, R.meadow);
    // ---- DESIGN §2 layout (no insets) ----
    const groundY = H - (portrait ? 40 : 28), scale = (H / W > 1.6) ? 1.15 : 1, spotW = 220 * scale;
    const camp = { x: W - 150, y: groundY - 10 };
    const C = R.camp;
    const bot = (name, x, y, k, ax, ay) => { const img = im[name]; g.drawImage(img, x - ax * k, y - ay * k, img.width * k, img.height * k); };
    bot('env/tent_bg', camp.x + C.tent.dx, camp.y + C.tent.dy, C.tent.k, 130, 194);
    bot('env/lantern', camp.x + C.lantern.dx, camp.y + C.lantern.dy, C.lantern.k, 24, 0);
    bot('env/bench', camp.x + C.bench.dx, camp.y + C.bench.dy, C.bench.k, 180, 84);
    bot('env/campfire', camp.x + C.fire.dx, camp.y + C.fire.dy, C.fire.k, 100, 132);
    // flame stand-in (code draws flames above (100, 92) of the campfire)
    g.fillStyle = 'rgba(255,200,110,0.85)'; g.beginPath(); g.ellipse(camp.x, camp.y - 40 * C.fire.k - 30, 22, 34, 0, 0, 7); g.fill();
    // hiding places (grey boxes, bottom-centre on the row lines), 6 places
    const rows = portrait
      ? [{ y: 0.47 * H, s: 0.88, n: 2 }, { y: 0.62 * H, s: 0.94, n: 2 }, { y: groundY - 300, s: 1, n: 2 }]
      : [{ y: 0.58 * H, s: 0.86, n: 3, x0: spotW * 0.6, x1: W - spotW * 0.6 }, { y: groundY - 150, s: 1, n: 3, x0: 250, x1: W - 260 }];
    rows.forEach((r, ri) => {
      const x0 = r.x0 ?? spotW * 0.6, x1 = r.x1 ?? W - spotW * 0.6, w = spotW * r.s, h = 0.8 * w;
      for (let i = 0; i < r.n; i++) {
        // front / odd rows: evenly spread; back rows: shifted half a step so they sit between the front places
        const step = (x1 - x0) / r.n, shift = portrait ? (ri % 2 ? 0.25 : -0.25) : (ri === 0 ? 0 : 0.5);
        const x = portrait ? x0 + (x1 - x0) * (r.n === 1 ? 0.5 : i / (r.n - 1)) * 0.8 + (x1 - x0) * (0.1 + shift * 0.4) : x0 + step * (i + (ri === 0 ? 0.3 : 0.5));
        g.fillStyle = 'rgba(120,120,120,0.55)'; g.strokeStyle = 'rgba(70,70,70,0.7)'; g.lineWidth = 2;
        g.beginPath(); g.roundRect(x - w / 2, r.y - h, w, h, 18); g.fill(); g.stroke();
        // answer-colour hat peeking (contrast check)
        const ans = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#9B6BE0'][(ri * 3 + i) % 6];
        g.fillStyle = ans; g.beginPath(); g.ellipse(x, r.y - h - 4, 26, 18, 0, Math.PI, 0); g.fill();
      }
    });
    // Pip stand-in (feet at x 120, groundY-6, h 230/250)
    const ph = portrait ? 250 * scale : 230;
    g.fillStyle = '#D27B4E'; g.beginPath(); g.roundRect(120 - 55, groundY - 6 - ph, 110, ph, 50); g.fill();
    g.fillStyle = '#2FA7A0'; g.fillRect(120 - 45, groundY - 6 - ph * 0.62, 90, 14);
    // particles
    parts.forEach((p, j) => { for (let q = 0; q < 4; q++) spr(im['particles/' + p], ((j * 4 + q) * 0.0837 % 1) * W, (0.12 + ((j * 4 + q) * 0.137 % 0.5)) * H, 26, 0.95); });
    // HUD + bubble stand-ins
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.roundRect(W - 160, 16, 144, 64, 20); g.fill();
    const bx = 24, by = portrait ? 120 : 20, bwid = portrait ? W - 48 : Math.min(640, W - 24 - 440);
    g.beginPath(); g.roundRect(bx, by, bwid, portrait ? 124 : 122, 26); g.fill();
    void mTop;
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
      scores.push(`${n.padEnd(22)} seam=${seam.toFixed(2)} interiorAvg=${(sum / 1000).toFixed(2)} ${seam <= Math.max(1, sum / 1000 * 3) ? 'OK' : 'CHECK'}`);
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
  for (const [W, H] of VPS) for (const s of SEASONS) {
    const vp = `${W}x${H}`; if (only && !`${vp}_${s}`.includes(only)) continue;
    const R = H > W ? RECIPE.portrait : RECIPE.landscape;
    save(await pg.evaluate(pageScene, { W, H, season: s, R, sky: SKY[s], ground: GROUND[s], src: SRC, cloudA: CLOUD_A[s], parts: PARTICLE[s] }), path.join(ART, `scene_${vp}_${s}.png`));
  }
  if (!only) {
    const list = SEASONS.flatMap(s => [['env/mountains_' + s, 420, 230], ['env/forest_' + s, 360, 150], ['env/meadow_' + s, 300, 20]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
  console.log('RECIPE', JSON.stringify({ landscape: RECIPE.landscape, portrait: RECIPE.portrait, ground: GROUND }));
})().catch(e => { console.error(e); process.exit(1); });
