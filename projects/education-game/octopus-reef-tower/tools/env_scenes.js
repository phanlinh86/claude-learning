// Pip's Reef Tower: underwater preview scenes + seam test + asset sheet (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]
// Writes docs/art/env_scene_<1556x720|960x720|720x1556>_<sunny|breezy|rain|rainbow>.png, docs/art/env_seams.png (each
// tileable layer drawn twice side by side, seam marked + 4x zoom on the join), docs/art/env_sheet.png (rock, jellyfish,
// sun, rays, patches, particles on the water colour) and prints seam scores + the RECIPE.
//
// RECIPE = the numbers render.js should use (all bottom-anchored layers: screen y of the layer's BOTTOM edge = bottom·H,
// scale k → drawn size 1200k × hk, tiled from the centre; fill FARFILL[mood] below the far tile and GROUND[mood] from the
// mid layer's bottom − 2 px down to H before the ground tile):
//   water gradient (DESIGN §3, 0 → 0.7H) → rainbow arc (rainbow mood) → sun glow → rays (alpha = sun) → light patches
//   ("clouds") → far → mid → GROUND fill → ground → surface band (top) → darkness (rain)
//   → rock (top surface y 18 at tower.baseTop) → shell blocks → jellyfish + crown → characters → particles.
// Placeholders (DESIGN §2 layout, age 4: S 124, LW 139, LH 99, no insets): rock with a 3-block tower, jellyfish + starfish
// at the goal (4 blocks), tray blocks in ALL answer colours (red, blue, yellow, green, orange, purple, pink), Pip
// stand-in, HUD + speech-bubble boxes.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { GROUND, FARFILL, SKY, MOODS } = require('./art_env.js');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');

const PARTS = ['sparkle', 'sugar', 'bubble', 'wrapper_a', 'wrapper_b', 'blossom', 'raindrop', 'splash', 'puff', 'dust', 'confetti_a', 'confetti_b', 'star'];
const ENV1 = ['cloud_a', 'cloud_b', 'cloud_c', 'cloud_rain', 'sun', 'rays', 'surface', 'rainbow', 'rock', 'jelly_ride'];
const NAMES = [...ENV1.map(n => 'env/' + n), ...MOODS.flatMap(m => ['far', 'mid', 'ground'].map(l => `env/${l}_${m}`)), ...PARTS.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');

// per mood: sun/ray alpha, patch sprite + alpha, rainbow alpha, darkness (rain), particles (sprite, count, size)
const AMB = {
  sunny: { sunA: 1, cloud: 'cloud', cloudA: 0.9, bow: 0, dark: 0, parts: [['bubble', 8, 18], ['blossom', 6, 16], ['sugar', 3, 22]] },
  breezy: { sunA: 0.75, cloud: 'cloud', cloudA: 0.8, bow: 0, dark: 0, parts: [['wrapper_a', 5, 22], ['wrapper_b', 5, 22], ['blossom', 5, 14], ['bubble', 5, 16]] },
  rain: { sunA: 0.2, cloud: 'rain', cloudA: 0.9, bow: 0, dark: 0.15, parts: [['splash', 6, 34], ['bubble', 5, 16], ['dust', 5, 12]] },
  rainbow: { sunA: 0.9, cloud: 'cloud', cloudA: 0.8, bow: 0.8, dark: 0, parts: [['sparkle', 7, 20], ['bubble', 8, 18]] },
};
const RECIPE = {
  landscape: { far: { bottom: 0.76, k: 1 }, mid: { bottom: 0.86, k: 1 }, ground: { bottom: 1.0, k: 1 },
    sun: [0.26, 0.05, 260], rays: { x: 0.26, h: 0.95, second: [0.62, 0.55] }, surface: { y: -8, k: 1 }, bow: [0.5, 0.62, 0.95],
    clouds: [['a', 0.16, 0.26, 320], ['b', 0.58, 0.18, 280], ['c', 0.82, 0.34, 260]] },
  portrait: { far: { bottom: 0.72, k: 1.36 }, mid: { bottom: 0.80, k: 1.36 }, ground: { bottom: 1.0, k: 1.36 },
    sun: [0.3, 0.04, 300], rays: { x: 0.3, h: 0.7, second: [0.8, 0.5] }, surface: { y: -6, k: 1 }, bow: [0.5, 0.5, 1.25],
    clouds: [['a', 0.24, 0.2, 340], ['b', 0.7, 0.12, 300], ['c', 0.45, 0.36, 300]] },
};
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const COLORS = { red: ['#E84A4A', '#A8282E', '#F7A0A0'], blue: ['#3C8DE8', '#1F5BA8', '#A6CCF5'], yellow: ['#FFD23F', '#C99A12', '#FFEB9C'], green: ['#4CC26B', '#2A8343', '#A8E6B8'],
  orange: ['#FF9A2E', '#C4650C', '#FFCB8E'], purple: ['#8E44AD', '#6840A8', '#D2BDF3'], pink: ['#FF8FC0', '#C9558A', '#FFCCE2'] };

function pageScene({ W, H, mood, R, sky, ground, farfill, src, amb, colors, rot }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const portrait = H > W;
    const sk = g.createLinearGradient(0, 0, 0, H * 0.7); sk.addColorStop(0, sky[0]); sk.addColorStop(1, sky[1]);
    g.fillStyle = sk; g.fillRect(0, 0, W, H);
    const spr = (img, x, y, w, a = 1, h, rot = 0) => { h = h || w * img.height / img.width; g.save(); g.globalAlpha = a; g.translate(x, y); g.rotate(rot); g.drawImage(img, -w / 2, -h / 2, w, h); g.restore(); };
    if (amb.bow) { const [bx, by, bk] = R.bow, bw = W * bk; spr(im['env/rainbow'], bx * W, by * H - bw * 0.25, bw, amb.bow, bw / 2); }
    if (amb.sunA) { const [sx, sy, sw] = R.sun; spr(im['env/sun'], sx * W, sy * H, sw, amb.sunA); }
    if (amb.sunA) { // light rays: rays.svg (600x700) drawn h tall, its x=300 at the sun x, top at y 0; + a fainter 2nd copy
      const rh = R.rays.h * H, rw = rh * 600 / 700;
      g.globalAlpha = amb.sunA; g.drawImage(im['env/rays'], R.rays.x * W - rw / 2, 0, rw, rh);
      g.globalAlpha = amb.sunA * R.rays.second[1]; g.drawImage(im['env/rays'], R.rays.second[0] * W - rw / 2, 0, rw * 0.9, rh * 0.9); g.globalAlpha = 1;
    }
    for (const [k, x, y, w] of R.clouds) spr(im[amb.cloud === 'rain' ? 'env/cloud_rain' : 'env/cloud_' + k], x * W, y * H, amb.cloud === 'rain' ? w * 1.2 : w, amb.cloudA);
    const tile = (name, L) => { const img = im[name], tw = img.width * L.k, th = img.height * L.k, byy = L.bottom * H; const x0 = -(((W - tw) / 2 % tw + tw) % tw); for (let x = x0 - tw; x < W; x += tw) g.drawImage(img, Math.round(x), Math.round(byy - th), Math.ceil(tw) + 1, th); return byy - th; };
    tile('env/far_' + mood, R.far); const fb = R.far.bottom * H; g.fillStyle = farfill; g.fillRect(0, fb - 1, W, H - fb + 1);
    const mb = R.mid.bottom * H; tile('env/mid_' + mood, R.mid);
    g.fillStyle = ground; g.fillRect(0, mb - 2, W, H - mb + 2);
    tile('env/ground_' + mood, { bottom: R.ground.bottom + 2 / H, k: R.ground.k });
    { const img = im['env/surface'], tw = 1200 * R.surface.k, th = 90 * R.surface.k; const x0 = -(((W - tw) / 2 % tw + tw) % tw); for (let x = x0 - tw; x < W; x += tw) g.drawImage(img, Math.round(x), R.surface.y, Math.ceil(tw) + 1, th); }
    if (amb.dark) { g.fillStyle = `rgba(70,80,110,${amb.dark})`; g.fillRect(0, 0, W, H); }
    // ---- DESIGN §2 layout (age 4, no insets) ----
    const S = 124, LW = 139, LH = 99, groundY = H - (portrait ? 40 : 28);
    const tx = portrait ? 0.58 * W : Math.max(0.42 * W, 400);
    const baseW = LW + 60, ks = baseW / 220;
    const baseTop = portrait ? groundY - LH - 150 : groundY - 98 * ks;
    g.fillStyle = 'rgba(90,60,30,0.2)'; g.beginPath(); g.ellipse(tx, baseTop + 98 * ks, 0.4 * 260 * ks, 8, 0, 0, 7); g.fill();
    g.drawImage(im['env/rock'], tx - 130 * ks, baseTop - 18 * ks, 260 * ks, 120 * ks);
    const block = (x, y, col) => { // shell block stand-in (front, thin top face, scalloped ridge)
      const r = 0.2 * LH;
      g.lineWidth = 5; g.strokeStyle = col[1];
      g.fillStyle = col[0]; g.beginPath(); g.roundRect(x - LW / 2, y - LH / 2, LW, LH, r); g.fill(); g.stroke();
      g.fillStyle = col[2]; g.beginPath(); g.roundRect(x - LW / 2 + 3, y - LH / 2 + 3, LW - 6, LH * 0.14, [r, r, 3, 3]); g.fill();
      for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(x - LW / 2 + 16 + k * (LW - 32) / 5, y - LH / 2 + 2, 9, Math.PI, 0); g.fill(); g.stroke(); }
      g.strokeStyle = col[2]; g.lineWidth = 3; for (const dx of [-0.25, 0, 0.25]) { g.beginPath(); g.moveTo(x, y + LH * 0.4); g.lineTo(x + dx * LW, y - LH * 0.2); g.stroke(); }
    };
    const order = Object.keys(colors), col = i => colors[order[(i + rot) % order.length]];
    for (let i = 0; i < 3; i++) block(tx + (i === 1 ? 5 : 0), baseTop - LH / 2 - i * LH, col(i));
    // goal: 4 blocks; crown bottom at goalY; jellyfish drawn 150x150 with its bell top (100,30)·0.75 just under the crown
    const goalY = baseTop - 4 * LH - 8, bellTop = goalY + 4;
    g.drawImage(im['env/jelly_ride'], tx - 75, bellTop - 22.5, 150, 150);
    { g.save(); g.translate(tx, goalY - 34); g.fillStyle = '#F5B83D'; g.strokeStyle = '#B67A16'; g.lineWidth = 4; g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? 15 : 36; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fill(); g.stroke(); g.restore(); }
    // tray slots: every answer colour so contrast can be judged everywhere
    const slots = [];
    if (portrait) { const x0 = LW / 2 + 20, x1 = W - LW / 2 - 20; for (let i = 0; i < 4; i++) slots.push([x0 + (x1 - x0) * i / 3, groundY - LH / 2 - 6]); }
    else { const dx1 = tx + LW / 2 + 60; let x = dx1 + 30 + LW / 2, y = groundY - LH / 2 - 6, n = 0; while (n < 6) { if (x > W - LW / 2 - 16) { x = dx1 + 30 + LW / 2; y -= LH + 40; } slots.push([x, y]); x += LW + 20; n++; } }
    slots.forEach(([x, y], i) => block(x, y, col(3 + i)));
    if (portrait) { block(W * 0.2, H * 0.42, col(1)); block(W * 0.82, H * 0.24, col(5)); } // floating blocks over water
    else { block(W * 0.1, H * 0.3, col(4)); }
    // Pip stand-in (feet point, height)
    const kh = portrait ? 300 : (W < 1100 ? 300 : 330), kx = portrait ? 110 : 120, ky = portrait ? baseTop + 70 : groundY - 4;
    g.fillStyle = '#F6B08E'; g.strokeStyle = '#A85E45'; g.lineWidth = 4;
    g.beginPath(); g.arc(kx, ky - kh * 0.62, kh * 0.3, 0, 7); g.fill(); g.stroke();
    for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(kx - 60 + i * 40, ky - kh * 0.18, 16, kh * 0.18, 0, 0, 7); g.fill(); g.stroke(); }
    // particles
    let q = 0; for (const [p, n, sz] of amb.parts) for (let j = 0; j < n; j++, q++) spr(im['particles/' + p], ((q * 0.0937 + 0.04) % 1) * W, (0.12 + ((q * 0.173) % 0.7)) * H, sz, 0.95, 0, p.startsWith('wrapper') ? q : 0);
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
    const o = out.getContext('2d'); o.fillStyle = '#7FD0E3'; o.fillRect(0, 0, out.width, out.height);
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
      const zh = Math.min(h - zy, (h / 2) / 4);
      o.imageSmoothingEnabled = false; o.drawImage(c, 1126, zy, 148, zh, 1210, y, 592, zh * 4); o.imageSmoothingEnabled = true;
      o.save(); o.setLineDash([8, 6]); o.strokeStyle = 'red'; o.lineWidth = 2; o.beginPath(); o.moveTo(1506, y); o.lineTo(1506, y + zh * 4); o.stroke(); o.restore();
      y += h / 2 + 12;
    }
    return { url: out.toDataURL('image/png'), scores };
  })();
}

function pageSheet({ src, parts, sky }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = 1400; c.height = 900; const g = c.getContext('2d');
    const sk = g.createLinearGradient(0, 0, 0, 900); sk.addColorStop(0, sky[0]); sk.addColorStop(1, sky[1]); g.fillStyle = sk; g.fillRect(0, 0, 1400, 900);
    g.drawImage(im['env/surface'], 0, 0); g.drawImage(im['env/surface'], 1200, 0);
    g.drawImage(im['env/rock'], 40, 120, 520, 240);
    g.strokeStyle = 'rgba(220,0,0,0.7)'; g.lineWidth = 1; g.beginPath(); g.moveTo(40 + 40, 120 + 36); g.lineTo(40 + 480, 120 + 36); g.stroke(); // top y=18 (x2)
    g.drawImage(im['env/jelly_ride'], 600, 100, 300, 300);
    g.beginPath(); g.arc(600 + 150, 100 + 45, 4, 0, 7); g.fillStyle = 'red'; g.fill(); // (100,30) x1.5
    g.drawImage(im['env/sun'], 940, 110, 200, 200);
    g.drawImage(im['env/rays'], 1150, 90, 220, 257);
    ['cloud_a', 'cloud_b', 'cloud_c', 'cloud_rain'].forEach((n, i) => g.drawImage(im['env/' + n], 40 + i * 330, 420, 320, 170));
    parts.forEach((p, i) => { const x = 60 + i * 100, y = 680; g.drawImage(im['particles/' + p], x, y, 64, 64); g.drawImage(im['particles/' + p], x + 16, y + 100, 32, 32); });
    return c.toDataURL('image/png');
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
    save(await pg.evaluate(pageScene, { W, H, mood: m, R, sky: SKY[m], ground: GROUND[m], farfill: FARFILL[m], src: SRC, amb: AMB[m], colors: COLORS, rot: mi * 2 + (W === 960 ? 1 : 0) }), path.join(ART, `env_scene_${vp}_${m}.png`));
  }
  if (!only) {
    const list = [['env/surface', 90, 0], ...MOODS.flatMap(m => [['env/far_' + m, 420, 200], ['env/mid_' + m, 380, 200], ['env/ground_' + m, 260, 12]])];
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
    save(await pg.evaluate(pageSheet, { src: SRC, parts: PARTS, sky: SKY.sunny }), path.join(ART, 'env_sheet.png'));
  }
  await b.close(); console.log('wrote', ART);
  console.log('RECIPE', JSON.stringify({ landscape: RECIPE.landscape, portrait: RECIPE.portrait, ground: GROUND, farfill: FARFILL, sky: SKY, amb: AMB }));
})().catch(e => { console.error(e); process.exit(1); });
