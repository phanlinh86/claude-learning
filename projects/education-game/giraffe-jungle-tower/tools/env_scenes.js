// Lulu's Jungle Tower: environment preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]
// Writes docs/art/scene_<1556x720|960x720|720x1556>_<morning|noon|sunset|night>.png, docs/art/env_seams.png
// (each tileable layer drawn twice side by side, seam marked + 4x zoom on the join) and prints seam scores + the RECIPE.
//
// RECIPE = the layer numbers recommended for render.js (all bottom-anchored layers: screen y of the layer's BOTTOM edge
// = bottom·H, scale k → drawn size 1200k × hk, tiled from x = 0 every 1200k px; fill GROUND[mood] from the mid layer's
// bottom − 2 px down to H before the ground tile):
//   sky gradient (DESIGN §3) → stars / sun / moon → clouds → far → mist bands → mid → GROUND fill → ground
//   → stump (top surface y 18 at tower.baseTop) → blocks → branch + bananas → characters → particles.
// Placeholders here (DESIGN §2 layout, no insets): stump with a 3-block tower, branch + banana dot at the goal, tray blocks
// in the 6 answer colours (112 px), Lulu stand-in, HUD + bubble boxes.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { GROUND, FARFILL, SKY, MOODS } = require('./art_env.js');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');

const NAMES = ['env/cloud_a', 'env/cloud_b', 'env/cloud_c', 'env/sun', 'env/moon', 'env/stump', 'env/branch', 'env/vine',
  ...MOODS.flatMap(m => ['far', 'mid', 'ground'].map(l => `env/${l}_${m}`)),
  ...['leaf_a', 'leaf_b', 'petal', 'firefly', 'pollen', 'sparkle', 'star', 'puff', 'dust', 'confetti_a', 'confetti_b'].map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');

// per mood: sun/moon, cloud alpha, mist band alpha, env tint overlay (drawn over the env layers only, never over blocks)
const AMB = {
  morning: { body: 'sun', bodyA: 0.85, cloudA: 0.75, mist: 0.55, tint: 'rgba(255,248,230,0.06)', parts: ['pollen', 'pollen', 'sparkle'] },
  noon: { body: 'sun', bodyA: 1, cloudA: 0.95, mist: 0, tint: null, parts: ['leaf_a', 'leaf_b', 'sparkle'] },
  sunset: { body: 'sun', bodyA: 1, cloudA: 0.8, mist: 0.2, tint: 'rgba(255,170,110,0.08)', parts: ['petal', 'petal', 'leaf_a'] },
  night: { body: 'moon', bodyA: 1, cloudA: 0.22, mist: 0.12, tint: 'rgba(20,30,80,0.10)', parts: ['firefly', 'firefly', 'firefly'] },
};
const RECIPE = {
  landscape: { far: { bottom: 0.76, k: 1 }, mid: { bottom: 0.86, k: 1 }, ground: { bottom: 1.0, k: 1 },
    body: { morning: [0.16, 0.24, 170], noon: [0.82, 0.13, 170], sunset: [0.80, 0.40, 210], night: [0.82, 0.14, 150] },
    clouds: [['a', 0.20, 0.13, 300], ['b', 0.55, 0.08, 240], ['c', 0.70, 0.27, 210]],
    mistBands: [[0.50, 0.66, 1.0]] },
  portrait: { far: { bottom: 0.72, k: 1.36 }, mid: { bottom: 0.80, k: 1.36 }, ground: { bottom: 1.0, k: 1.36 },
    farBack: { bottom: 0.52, k: 1.0 },
    body: { morning: [0.22, 0.24, 190], noon: [0.78, 0.17, 190], sunset: [0.76, 0.33, 230], night: [0.78, 0.17, 170] },
    clouds: [['a', 0.24, 0.18, 300], ['b', 0.66, 0.08, 240], ['c', 0.40, 0.30, 220]],
    mistBands: [[0.47, 0.36, 1.2], [0.62, 0.55, 1.2]] },
  ground: GROUND, farfill: FARFILL, sky: SKY,
};
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const COLORS = [['#E84A4A', '#A8282E', '#F7A0A0'], ['#3C8DE8', '#1F5BA8', '#A6CCF5'], ['#FFD23F', '#C99A12', '#FFEB9C'],
  ['#4CC26B', '#2A8343', '#A8E6B8'], ['#FF9A2E', '#C4650C', '#FFCB8E'], ['#9B6BE0', '#6840A8', '#D2BDF3']];

function pageScene({ W, H, mood, R, sky, ground, farfill, src, amb, colors, rot }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const portrait = H > W;
    const sk = g.createLinearGradient(0, 0, 0, H * (portrait ? 0.6 : 0.7)); sk.addColorStop(0, sky[0]); sk.addColorStop(1, sky[1]);
    g.fillStyle = sk; g.fillRect(0, 0, W, H);
    const spr = (img, x, y, w, a = 1, h) => { h = h || w * img.height / img.width; g.save(); g.globalAlpha = a; g.drawImage(img, x - w / 2, y - h / 2, w, h); g.restore(); };
    if (mood === 'night') { // twinkling stars stand-in
      for (let i = 0; i < 46; i++) { const x = (i * 0.6180339 % 1) * W, y = ((i * 0.3819 + 0.07) % 0.55) * H * (portrait ? 0.7 : 1); spr(im['particles/star'], x, y, 8 + (i % 3) * 4, 0.55 + (i % 4) * 0.12); }
    }
    const [bx, by, bw] = R.body[mood]; spr(im['env/' + amb.body], bx * W, by * H, bw, amb.bodyA);
    for (const [k, x, y, w] of R.clouds) spr(im['env/cloud_' + k], x * W, y * H, w, amb.cloudA);
    const tile = (name, L) => { const img = im[name], tw = img.width * L.k, th = img.height * L.k, byy = L.bottom * H; for (let x = 0; x < W; x += tw) g.drawImage(img, Math.round(x), Math.round(byy - th), Math.ceil(tw) + 1, th); return byy - th; };
    if (R.farBack) { g.save(); g.globalAlpha = 0.55; tile('env/far_' + mood, R.farBack); g.restore(); }
    const fb = tile('env/far_' + mood, R.far) + 420 * R.far.k; g.fillStyle = farfill; g.fillRect(0, fb - 1, W, H - fb + 1);
    if (amb.mist) for (const [y, a, k] of R.mistBands) for (const [ck, x] of [['a', 0.15], ['c', 0.5], ['b', 0.85]]) spr(im['env/cloud_' + ck], x * W, y * H + (portrait ? 0 : 0) , 520 * k, amb.mist * a, 110 * k);
    const mb = R.mid.bottom * H; tile('env/mid_' + mood, R.mid);
    g.fillStyle = ground; g.fillRect(0, mb - 2, W, H - mb + 2);
    tile('env/ground_' + mood, R.ground);
    if (amb.tint) { g.fillStyle = amb.tint; g.fillRect(0, 0, W, H); }
    // ---- DESIGN §2 layout (no insets) ----
    const S = 112, groundY = H - (portrait ? 40 : 28);
    const tx = portrait ? 0.58 * W : Math.max(0.45 * W, 360);
    const baseTop = portrait ? groundY - S - 150 : groundY - 64;
    // stump: top surface (y 18) at baseTop, scale so the cut top = baseW (S + 70)
    const ks = (S + 70) / 180, st = im['env/stump'];
    g.drawImage(st, tx - 120 * ks, baseTop - 18 * ks, 240 * ks, 120 * ks);
    const block = (x, y, col, sc = 1) => { // centre x,y
      const s = S * sc, r = 0.14 * s;
      g.fillStyle = col[0]; g.strokeStyle = col[1]; g.lineWidth = 5;
      g.beginPath(); g.roundRect(x - s / 2, y - s / 2, s, s, r); g.fill(); g.stroke();
      g.fillStyle = col[2]; g.beginPath(); g.roundRect(x - s / 2 + 4, y - s / 2 + 4, s - 8, 0.14 * s, [r * 0.8, r * 0.8, 4, 4]); g.fill();
    };
    const col = i => colors[(i + rot) % 6];
    for (let i = 0; i < 3; i++) block(tx + (i === 1 ? 6 : 0), baseTop - S / 2 - i * S, col(i));
    // goal: 4 blocks; bananas bottom at goalY, stem 124 px above
    const goalY = baseTop - 4 * S - 8, stemY = goalY - 124;
    const kb = Math.max(1, Math.min(1.9, (W - tx) / 490)), br = im['env/branch'];
    g.fillStyle = '#F6D45A'; g.strokeStyle = '#B99A2E'; g.lineWidth = 3;
    for (const [dx, dy] of [[-18, 70], [14, 74], [-2, 96], [0, 50]]) { g.beginPath(); g.ellipse(tx + dx, stemY + dy, 16, 30, dx * 0.02, 0, 7); g.fill(); g.stroke(); }
    g.drawImage(br, tx - 110 * kb, stemY - 140 * kb, 600 * kb, 160 * kb);
    // vine the monkey swings on (right of the tower)
    const vx = Math.min(W - 60, tx + (portrait ? 190 : 330)); for (let y = -100; y < groundY - 260; y += 600) g.drawImage(im['env/vine'], vx - 20, y, 40, 600);
    // tray slots
    const slots = [];
    if (portrait) { const x0 = S / 2 + 20, x1 = W - S / 2 - 20; for (let i = 0; i < 3; i++) slots.push([x0 + (x1 - x0) * i / 2, groundY - S / 2 - 8]); }
    else { const dx1 = tx + S / 2 + 60; let x = dx1 + 44 + S / 2, y = groundY - S / 2 - 6, n = 0; while (n < 3) { if (x > W - S / 2 - 20) { x = dx1 + 44 + S / 2; y -= S + 36; } slots.push([x, y]); x += S + 26; n++; } }
    slots.forEach(([x, y], i) => block(x, y, col(3 + i)));
    // Lulu stand-in (feet point, height)
    const lh = portrait ? 400 : (W < 1100 ? 380 : 420), lx = portrait ? 115 : 120, ly = portrait ? baseTop + 70 : groundY - 4;
    g.fillStyle = 'rgba(237,203,146,0.95)'; g.strokeStyle = '#8A5A32'; g.lineWidth = 4;
    g.beginPath(); g.roundRect(lx - 60, ly - lh * 0.45, 120, lh * 0.45, 40); g.fill(); g.stroke();
    g.beginPath(); g.roundRect(lx + 10, ly - lh, 50, lh * 0.6, 22); g.fill(); g.stroke();
    g.fillStyle = '#7CCBB5'; g.fillRect(lx + 6, ly - lh * 0.5, 58, 16);
    // particles
    amb.parts.forEach((p, j) => { for (let q = 0; q < 5; q++) spr(im['particles/' + p], ((j * 5 + q) * 0.0837 + 0.03) % 1 * W, (0.14 + ((j * 5 + q) * 0.137 % 0.6)) * H, p === 'firefly' ? 30 : 24, 0.95); });
    // HUD + bubble stand-ins
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.roundRect(W - 160, 16, 144, 64, 20); g.fill();
    const bbx = 24, bby = portrait ? 110 : 18, bwid = portrait ? W - 48 : Math.min(560, tx - S / 2 - 60 - 20 - 24);
    g.beginPath(); g.roundRect(bbx, bby, bwid, portrait ? 124 : 122, 26); g.fill();
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
    // vine: vertical seam (row 599 vs row 0)
    const vi = await load(src['env/vine']); const vc = document.createElement('canvas'); vc.width = 40; vc.height = 1200; const vg = vc.getContext('2d');
    vg.drawImage(vi, 0, 0, 40, 600); vg.drawImage(vi, 0, 600, 40, 600);
    const vd = vg.getImageData(0, 0, 40, 1200).data; const row = (a, b) => { let t = 0; for (let x = 0; x < 40; x++) for (let q = 0; q < 4; q++) t += Math.abs(vd[(a * 40 + x) * 4 + q] - vd[(b * 40 + x) * 4 + q]); return t / 40; };
    let vs = 0; for (let r = 50; r < 550; r++) vs += row(r, r + 1);
    scores.push(`env/vine (vertical)     seam=${row(599, 600).toFixed(2)} interiorAvg=${(vs / 500).toFixed(2)}`);
    return { url: out.toDataURL('image/png'), scores };
  })();
}

(async () => {
  fs.mkdirSync(ART, { recursive: true });
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent('<html><body style="margin:0"></body></html>');
  const save = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  const only = process.argv[2];
  for (const [W, H] of VPS) for (const [mi, m] of MOODS.entries()) {
    const vp = `${W}x${H}`; if (only && !`${vp}_${m}`.includes(only)) continue;
    const R = H > W ? RECIPE.portrait : RECIPE.landscape;
    save(await pg.evaluate(pageScene, { W, H, mood: m, R, sky: SKY[m], ground: GROUND[m], farfill: FARFILL[m], src: SRC, amb: AMB[m], colors: COLORS, rot: mi * 3 % 6 + (W === 960 ? 1 : 0) }), path.join(ART, `scene_${vp}_${m}.png`));
  }
  if (!only) {
    const list = MOODS.flatMap(m => [['env/far_' + m, 420, 200], ['env/mid_' + m, 380, 300], ['env/ground_' + m, 260, 12]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
  console.log('RECIPE', JSON.stringify({ landscape: RECIPE.landscape, portrait: RECIPE.portrait, ground: GROUND, farfill: FARFILL, sky: SKY, amb: AMB }));
})().catch(e => { console.error(e); process.exit(1); });
