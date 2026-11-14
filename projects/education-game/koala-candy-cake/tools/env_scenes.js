// Koko's Cake Tower: Candy Village preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]
// Writes docs/art/scene_<1556x720|960x720|720x1556>_<sunny|breezy|rain|rainbow>.png, docs/art/env_seams.png
// (each tileable layer drawn twice side by side, seam marked + 4x zoom on the join) and prints seam scores + the RECIPE.
//
// RECIPE = the layer numbers render.js already uses (all bottom-anchored layers: screen y of the layer's BOTTOM edge
// = bottom·H, scale k → drawn size 1200k × hk, tiled; fill GROUND[mood] from the mid layer's bottom − 2 px down to H
// before the ground tile; FARFILL[mood] below the far tile):
//   sky gradient (DESIGN §3) → rainbow arc (rainbow mood) → sun → clouds → far → mid → GROUND fill → ground
//   → stand (top surface y 18 at tower.baseTop) → cake layers → cloud_candy + cherry → characters → particles.
// Placeholders (DESIGN §2 layout, age 4: S 124, LW 161, LH 97, no insets): stand with a 3-layer tower, cherry cloud at
// the goal (4 layers), tray layers in the answer colours (red, blue, yellow, green), Koko stand-in, HUD + bubble boxes.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { GROUND, FARFILL, SKY, MOODS } = require('./art_env.js');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');

const PARTS = ['sparkle', 'sugar', 'wrapper_a', 'wrapper_b', 'blossom', 'raindrop', 'splash', 'puff', 'dust', 'confetti_a', 'confetti_b', 'star'];
const NAMES = ['env/cloud_a', 'env/cloud_b', 'env/cloud_c', 'env/cloud_rain', 'env/sun', 'env/rainbow', 'env/stand', 'env/cloud_candy',
  ...MOODS.flatMap(m => ['far', 'mid', 'ground'].map(l => `env/${l}_${m}`)), ...PARTS.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');

// per mood: sun alpha, cloud sprite + alpha, rainbow alpha, env tint (env layers only, never over cake layers), particles
const AMB = {
  sunny: { sunA: 1, cloud: 'cloud', cloudA: 0.95, bow: 0, tint: null, parts: ['sugar', 'sparkle', 'blossom'] },
  breezy: { sunA: 0.8, cloud: 'cloud', cloudA: 0.9, bow: 0, tint: null, parts: ['wrapper_a', 'wrapper_b', 'blossom'] },
  rain: { sunA: 0, cloud: 'rain', cloudA: 0.95, bow: 0, tint: 'rgba(40,48,80,0.15)', parts: ['raindrop', 'raindrop', 'raindrop'] },
  rainbow: { sunA: 0.9, cloud: 'cloud', cloudA: 0.8, bow: 1, tint: null, parts: ['sparkle', 'sugar', 'sparkle'] },
};
const RECIPE = {
  landscape: { far: { bottom: 0.76, k: 1 }, mid: { bottom: 0.86, k: 1 }, ground: { bottom: 1.0, k: 1 },
    sun: [0.82, 0.14, 170], bow: [0.42, 0.66, 0.95],
    clouds: [['a', 0.20, 0.13, 300], ['b', 0.55, 0.08, 240], ['c', 0.70, 0.27, 210]] },
  portrait: { far: { bottom: 0.72, k: 1.36 }, mid: { bottom: 0.80, k: 1.36 }, ground: { bottom: 1.0, k: 1.36 },
    sun: [0.78, 0.17, 190], bow: [0.5, 0.56, 1.25],
    clouds: [['a', 0.24, 0.18, 300], ['b', 0.66, 0.08, 240], ['c', 0.40, 0.30, 220]] },
};
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const COLORS = [['#E84A4A', '#A8282E', '#F7A0A0'], ['#3C8DE8', '#1F5BA8', '#A6CCF5'], ['#FFD23F', '#C99A12', '#FFEB9C'], ['#4CC26B', '#2A8343', '#A8E6B8']];

function pageScene({ W, H, mood, R, sky, ground, farfill, src, amb, colors, rot }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const portrait = H > W;
    const sk = g.createLinearGradient(0, 0, 0, H * (portrait ? 0.6 : 0.7)); sk.addColorStop(0, sky[0]); sk.addColorStop(1, sky[1]);
    g.fillStyle = sk; g.fillRect(0, 0, W, H);
    const spr = (img, x, y, w, a = 1, h, rot = 0) => { h = h || w * img.height / img.width; g.save(); g.globalAlpha = a; g.translate(x, y); g.rotate(rot); g.drawImage(img, -w / 2, -h / 2, w, h); g.restore(); };
    if (amb.bow) { const [bx, by, bk] = R.bow, bw = W * bk; spr(im['env/rainbow'], bx * W, by * H - bw * 0.25, bw, amb.bow, bw / 2); }
    if (amb.sunA) { const [sx, sy, sw] = R.sun; spr(im['env/sun'], sx * W, sy * H, sw, amb.sunA); }
    for (const [k, x, y, w] of R.clouds) spr(im[amb.cloud === 'rain' ? 'env/cloud_rain' : 'env/cloud_' + k], x * W, y * H, amb.cloud === 'rain' ? w * 1.2 : w, amb.cloudA);
    const tile = (name, L) => { const img = im[name], tw = img.width * L.k, th = img.height * L.k, byy = L.bottom * H; const x0 = -(((W - tw) / 2 % tw + tw) % tw); for (let x = x0 - tw; x < W; x += tw) g.drawImage(img, Math.round(x), Math.round(byy - th), Math.ceil(tw) + 1, th); return byy - th; };
    tile('env/far_' + mood, R.far); const fb = R.far.bottom * H; g.fillStyle = farfill; g.fillRect(0, fb - 1, W, H - fb + 1);
    const mb = R.mid.bottom * H; tile('env/mid_' + mood, R.mid);
    g.fillStyle = ground; g.fillRect(0, mb - 2, W, H - mb + 2);
    tile('env/ground_' + mood, { bottom: R.ground.bottom + 2 / H, k: R.ground.k });
    if (amb.tint) { g.fillStyle = amb.tint; g.fillRect(0, 0, W, H); }
    // ---- DESIGN §2 layout (age 4, no insets) ----
    const S = 124, LW = 161, LH = 97, groundY = H - (portrait ? 40 : 28);
    const tx = portrait ? 0.58 * W : Math.max(0.45 * W, 360);
    const baseW = LW + 60, ks = baseW / 220;
    const baseTop = portrait ? groundY - S - 150 : groundY - 98 * ks;
    g.fillStyle = 'rgba(70,55,40,0.18)'; g.beginPath(); g.ellipse(tx, baseTop + 98 * ks, 0.45 * 260 * ks, 9, 0, 0, 7); g.fill();
    g.drawImage(im['env/stand'], tx - 130 * ks, baseTop - 18 * ks, 260 * ks, 120 * ks);
    const layer = (x, y, col) => { // centre x,y: sponge + frosting top with drips
      const r = 0.18 * LH;
      g.fillStyle = col[2]; g.strokeStyle = col[1]; g.lineWidth = 5;
      g.beginPath(); g.roundRect(x - LW / 2, y - LH / 2, LW, LH, r); g.fill(); g.stroke();
      g.fillStyle = col[0]; g.beginPath(); g.roundRect(x - LW / 2 + 2.5, y - LH / 2 + 2.5, LW - 5, LH * 0.34, [r, r, 4, 4]); g.fill();
      for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(x - LW / 2 + 22 + k * (LW - 44) / 4, y - LH / 2 + LH * 0.34, 9, 7 + (k % 2) * 6, 0, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,0.75)'; g.fillRect(x - LW / 2 + 6, y + LH * 0.12, LW - 12, 6);
    };
    const col = i => colors[(i + rot) % 4];
    for (let i = 0; i < 3; i++) layer(tx + (i === 1 ? 5 : 0), baseTop - LH / 2 - i * LH, col(i));
    // goal: 4 layers; cherry bottom at goalY on the candy cloud (cloud 180x100, top surface 18 px above cherry bottom)
    const goalY = baseTop - 4 * LH - 8;
    g.drawImage(im['env/cloud_candy'], tx - 90, goalY - 18 * (100 / 110) - 4, 180, 100);
    g.fillStyle = '#C8243A'; g.strokeStyle = '#7E1424'; g.lineWidth = 3; g.beginPath(); g.arc(tx, goalY - 32, 30, 0, 7); g.fill(); g.stroke();
    // tray slots
    const slots = [];
    if (portrait) { const x0 = LW / 2 + 20, x1 = W - LW / 2 - 20; for (let i = 0; i < 3; i++) slots.push([x0 + (x1 - x0) * i / 2, groundY - LH / 2 - 6]); }
    else { const dx1 = tx + LW / 2 + 60; let x = dx1 + 44 + LW / 2, y = groundY - LH / 2 - 6, n = 0; while (n < 4) { if (x > W - LW / 2 - 20) { x = dx1 + 44 + LW / 2; y -= LH + 40; } slots.push([x, y]); x += LW + 26; n++; } }
    slots.forEach(([x, y], i) => layer(x, y, col(3 + i)));
    // Koko stand-in (feet point, height)
    const kh = portrait ? 300 : (W < 1100 ? 300 : 330), kx = portrait ? 110 : 120, ky = portrait ? baseTop + 70 : groundY - 4;
    g.fillStyle = '#A9B1BC'; g.strokeStyle = '#56606E'; g.lineWidth = 4;
    g.beginPath(); g.roundRect(kx - 70, ky - kh * 0.55, 140, kh * 0.55, 50); g.fill(); g.stroke();
    g.beginPath(); g.arc(kx + 6, ky - kh * 0.75, kh * 0.24, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#9ED8CB'; g.fillRect(kx - 40, ky - kh * 0.45, 80, kh * 0.3);
    // particles
    amb.parts.forEach((p, j) => { for (let q = 0; q < 6; q++) spr(im['particles/' + p], ((j * 6 + q) * 0.0837 + 0.03) % 1 * W, (0.14 + ((j * 6 + q) * 0.137 % 0.6)) * H, p === 'raindrop' ? 30 : 24, 0.95, 0, p.startsWith('wrapper') ? q : 0); });
    // HUD + bubble stand-ins
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.roundRect(W - 160, 16, 144, 64, 20); g.fill();
    const bbx = 24, bby = portrait ? 110 : 18, bwid = portrait ? W - 48 : Math.min(560, tx - LW / 2 - 60 - 20 - 24);
    g.beginPath(); g.roundRect(bbx, bby, bwid, portrait ? 124 : 122, 26); g.fill();
    return c.toDataURL('image/png');
  })();
}

function pageSeams({ src, list }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    let total = 0; for (const [, h] of list) total += h / 2 + 12;
    const out = document.createElement('canvas'); out.width = 1800; out.height = total;
    const o = out.getContext('2d'); o.fillStyle = '#A9DDF5'; o.fillRect(0, 0, out.width, out.height);
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
  // remove the old jungle previews
  for (const fn of fs.readdirSync(ART)) if (/^scene_.*_(morning|noon|sunset|night)\.png$/.test(fn)) fs.unlinkSync(path.join(ART, fn));
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent('<html><body style="margin:0"></body></html>');
  const save = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  const only = process.argv[2];
  for (const [W, H] of VPS) for (const [mi, m] of MOODS.entries()) {
    const vp = `${W}x${H}`; if (only && !`${vp}_${m}`.includes(only)) continue;
    const R = H > W ? RECIPE.portrait : RECIPE.landscape;
    save(await pg.evaluate(pageScene, { W, H, mood: m, R, sky: SKY[m], ground: GROUND[m], farfill: FARFILL[m], src: SRC, amb: AMB[m], colors: COLORS, rot: mi + (W === 960 ? 1 : 0) }), path.join(ART, `scene_${vp}_${m}.png`));
  }
  if (!only) {
    const list = MOODS.flatMap(m => [['env/far_' + m, 420, 200], ['env/mid_' + m, 380, 200], ['env/ground_' + m, 260, 12]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
  console.log('RECIPE', JSON.stringify({ landscape: RECIPE.landscape, portrait: RECIPE.portrait, ground: GROUND, farfill: FARFILL, sky: SKY, amb: AMB }));
})().catch(e => { console.error(e); process.exit(1); });
