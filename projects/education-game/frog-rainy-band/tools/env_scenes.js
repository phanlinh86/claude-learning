// Bop's Rainy Band: environment preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]
// Writes docs/art/scene_<1556x720|960x720|720x1556>_<spring|summer|autumn|winter>.png, docs/art/env_seams.png
// (each tileable layer drawn twice side by side, seam marked + 4x zoom on the join) and prints seam scores + the RECIPE.
//
// RECIPE = the layer numbers recommended for render.js. All layers are bottom-anchored to groundY (DESIGN §2):
//   layer BOTTOM edge screen y = groundY + off, scale k → drawn size 1200k × hk, tiled from x = −(parallaxX·k) mod 1200k.
//   Fill GROUND[season] from (mid bottom − 2) down to H before the ground tile, FARFILL[season] below the far tile.
//   Order: sky gradient (DESIGN §3) → sun / rainbow → clouds → far → mid → GROUND fill → ground
//   → pots + stage (3-slice, see drawStage) → band / Bop / big drum → particles.
// Placeholders here (DESIGN §2 layout, no insets): band members as answer-colour drums on stools, Bop + big drum
// stand-ins, sheet vine-line with note circles, HUD + bubble boxes.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { GROUND, FARFILL, SKY, SEASONS, STAGE, POT } = require('./art_env.js');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');

const NAMES = ['env/cloud_a', 'env/cloud_b', 'env/cloud_c', 'env/sun', 'env/rainbow', 'env/stage', 'env/pot',
  ...SEASONS.flatMap(s => ['far', 'mid', 'ground'].map(l => `env/${l}_${s}`)),
  ...['drop', 'splash', 'petal', 'leaf_a', 'leaf_b', 'snow', 'sparkle', 'star', 'puff', 'note_a', 'note_b', 'confetti_a', 'confetti_b'].map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');

// per season: sun alpha, rainbow alpha, cloud alpha + tint, particles
const AMB = {
  spring: { sunA: 0.0, rainbowA: 0, cloudA: 0.95, parts: ['drop', 'drop', 'petal'] },
  summer: { sunA: 1, rainbowA: 0.75, cloudA: 0.85, parts: ['drop', 'sparkle', 'drop'] },
  autumn: { sunA: 0.0, rainbowA: 0, cloudA: 0.9, parts: ['leaf_a', 'leaf_b', 'drop'] },
  winter: { sunA: 0.0, rainbowA: 0, cloudA: 0.9, parts: ['snow', 'snow', 'snow'] },
};
const RECIPE = {
  landscape: { far: { off: -306, k: 1, px: 0.15 }, mid: { off: -176, k: 1, px: 0.35 }, ground: { off: 24, k: 1, px: 1 },
    sun: [0.80, 0.15, 180], rainbow: [0.62, 0.50, 1.0],
    clouds: [['a', 0.16, 0.12, 300], ['b', 0.50, 0.07, 250], ['c', 0.88, 0.17, 220]] },
  portrait: { far: { off: -520, k: 1.8, px: 0.15 }, mid: { off: -324, k: 1.8, px: 0.35 }, ground: { off: 36, k: 1.8, px: 1 },
    sun: [0.80, 0.27, 180], rainbow: [0.5, 0.40, 1.1],
    clouds: [['a', 0.22, 0.17, 320], ['b', 0.72, 0.09, 260], ['c', 0.58, 0.29, 240]] },
  ground: GROUND, farfill: FARFILL, sky: SKY, stage: STAGE, pot: POT,
};
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const COLORS = [['#E84A4A', '#A8282E', '#F7A0A0'], ['#3C8DE8', '#1F5BA8', '#A6CCF5'], ['#FFD23F', '#C99A12', '#FFEB9C'],
  ['#4CC26B', '#2A8343', '#A8E6B8'], ['#FF9A2E', '#C4650C', '#FFCB8E'], ['#8E44AD', '#6840A8', '#D2BDF3']];

function pageScene({ W, H, season, R, sky, ground, farfill, src, amb, colors, rot, ST, POT }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const portrait = H > W, tall = H / W > 1.6;
    const groundY = H - (portrait ? 36 : 24);
    const sk = g.createLinearGradient(0, 0, 0, groundY); sk.addColorStop(0, sky[0]); sk.addColorStop(1, sky[1]);
    g.fillStyle = sk; g.fillRect(0, 0, W, H);
    const spr = (img, x, y, w, a = 1, h) => { h = h || w * img.height / img.width; g.save(); g.globalAlpha = a; g.drawImage(img, x - w / 2, y - h / 2, w, h); g.restore(); };
    if (amb.sunA) spr(im['env/sun'], R.sun[0] * W, R.sun[1] * H, R.sun[2], amb.sunA);
    if (amb.rainbowA) { const [rx, ry, rk] = R.rainbow; spr(im['env/rainbow'], rx * W, ry * H, 800 * rk, amb.rainbowA); }
    for (const [k, x, y, w] of R.clouds) spr(im['env/cloud_' + k], x * W, y * H, w, amb.cloudA);
    const tile = (name, L) => { const img = im[name], tw = 1200 * L.k, th = img.height * L.k, by = groundY + L.off; for (let x = -((L.px * 137) % tw); x < W; x += tw) g.drawImage(img, Math.round(x), Math.round(by - th), Math.ceil(tw) + 1, th); return by; };
    const fb = tile('env/far_' + season, R.far); g.fillStyle = farfill; g.fillRect(0, fb - 1, W, H - fb + 1);
    const mb = tile('env/mid_' + season, R.mid);
    g.fillStyle = ground; g.fillRect(0, mb - 2, W, H - mb + 2);
    tile('env/ground_' + season, R.ground);
    // ---- DESIGN §2 layout (no insets) ----
    const nMem = 3, S = portrait && tall ? 172 : 150;
    const stage = portrait ? { x0: 24, x1: W - 24, y: groundY - (tall ? 380 : 330) } : { x0: W < 1100 ? 350 : 380, x1: W - 24, y: groundY - 74 };
    // pots: bottom on groundY, top rim just under the plank (landscape) or scaled ≤ 1.3 (portrait) with legs between
    const plankB = stage.y + (ST.plankBottom - ST.top), gap = groundY - plankB;
    const kp = Math.min(1.0, gap / POT.h);
    const potTop = groundY - (118 - POT.rimTop) * kp;
    const stg = im['env/stage'];
    // legs: stretch rows plankBottom-6 … 140 between the plank and the pot top
    for (const [sx, dx] of [[0, stage.x0], [740, stage.x1 - 60]]) {
      g.drawImage(stg, sx, ST.plankBottom - 6, 60, 140 - ST.plankBottom + 6, dx, plankB - 6, 60, potTop + 8 * kp - plankB + 6);
    }
    // plank rows 0 … plankBottom: caps fixed, middle stretched
    const top0 = stage.y - ST.top, ph = ST.plankBottom;
    g.drawImage(stg, 0, 0, 60, ph, stage.x0, top0, 60, ph);
    g.drawImage(stg, 60, 0, 680, ph, stage.x0 + 60, top0, stage.x1 - stage.x0 - 120, ph);
    g.drawImage(stg, 740, 0, 60, ph, stage.x1 - 60, top0, 60, ph);
    for (const lx of [stage.x0 + ST.legX[0], stage.x1 - (800 - ST.legX[1])]) g.drawImage(im['env/pot'], lx - 60 * kp, groundY - 118 * kp, 120 * kp, 120 * kp);
    // band members on stools
    const col = i => colors[(i + rot) % 6];
    for (let i = 0; i < nMem; i++) {
      const xa = stage.x0 + S / 2 + 20, xb = stage.x1 - S / 2 - 20, x = xa + (xb - xa) * i / (nMem - 1), y = stage.y - 38 - S / 2;
      g.fillStyle = '#C97A52'; g.strokeStyle = '#8E4A2E'; g.lineWidth = 3; g.beginPath(); g.roundRect(x - 34, stage.y - 38, 68, 38, 6); g.fill(); g.stroke();
      const cc = col(i), w = S * 0.8, h = S * 0.62;
      g.fillStyle = cc[0]; g.strokeStyle = cc[1]; g.lineWidth = 5; g.beginPath(); g.roundRect(x - w / 2, y - h / 2 + 12, w, h, 12); g.fill(); g.stroke();
      g.fillStyle = '#FFF6E4'; g.beginPath(); g.ellipse(x, y - h / 2 + 12, w / 2, 16, 0, 0, 7); g.fill(); g.stroke();
    }
    // sheet vine-line + empty note circles
    const sheetY = portrait ? 110 + 124 + 60 : Math.max(200, stage.y - S - 38 - 170);
    g.strokeStyle = '#6E9E5E'; g.lineWidth = 5; g.beginPath(); g.moveTo(stage.x0 + 20, sheetY); g.lineTo(stage.x1 - 20, sheetY); g.stroke();
    g.setLineDash([8, 6]); g.strokeStyle = '#FFF6E4'; g.lineWidth = 4;
    for (let i = 0; i < 4; i++) { const x = (stage.x0 + stage.x1) / 2 + (i - 1.5) * 110; g.beginPath(); g.arc(x, sheetY, 34, 0, 7); g.stroke(); }
    g.setLineDash([]);
    // Bop + big drum stand-ins
    const bop = portrait ? { x: 150, y: groundY - 4, h: 320 } : { x: 100, y: groundY - 4, h: 300 };
    const bd = portrait ? { x: 470, y: groundY - 100, r: 100 } : { x: 250, y: groundY - 92, r: 92 };
    g.fillStyle = '#62C7CF'; g.strokeStyle = '#2A6E78'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(bop.x, bop.y - bop.h * 0.33, bop.h * 0.3, bop.h * 0.33, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#E9C98E'; g.beginPath(); g.ellipse(bop.x, bop.y - bop.h * 0.66, bop.h * 0.28, bop.h * 0.06, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#C98B55'; g.strokeStyle = '#7E5430'; g.beginPath(); g.roundRect(bd.x - bd.r, bd.y - bd.r * 0.75, 2 * bd.r, 1.5 * bd.r, 18); g.fill(); g.stroke();
    g.fillStyle = '#FFF6E4'; g.beginPath(); g.ellipse(bd.x, bd.y - bd.r * 0.75, bd.r, bd.r * 0.28, 0, 0, 7); g.fill(); g.stroke();
    // particles
    amb.parts.forEach((p, j) => { for (let q = 0; q < 6; q++) spr(im['particles/' + p], ((j * 6 + q) * 0.0837 + 0.03) % 1 * W, (0.10 + ((j * 6 + q) * 0.137 % 0.7)) * H, p === 'drop' ? 18 : 26, 0.9); });
    for (let q = 0; q < 5; q++) spr(im['particles/splash'], (q * 0.21 + 0.07) * W, groundY - 6 - (q % 2) * 30, 26, 0.85);
    // HUD + bubble stand-ins
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.beginPath(); g.roundRect(W - 160, 16, 144, 64, 20); g.fill();
    const bbx = 24, bby = portrait ? 110 : 18, bwid = portrait ? W - 48 : Math.min(560, W - 200 - 24);
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
    return { url: out.toDataURL('image/png'), scores };
  })();
}

(async () => {
  fs.mkdirSync(ART, { recursive: true });
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent('<html><body style="margin:0"></body></html>');
  const save = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  const only = process.argv[2];
  for (const [W, H] of VPS) for (const [si, s] of SEASONS.entries()) {
    const vp = `${W}x${H}`; if (only && !`${vp}_${s}`.includes(only)) continue;
    const R = H > W ? RECIPE.portrait : RECIPE.landscape;
    save(await pg.evaluate(pageScene, { W, H, season: s, R, sky: SKY[s], ground: GROUND[s], farfill: FARFILL[s], src: SRC, amb: AMB[s], colors: COLORS, rot: si * 3 % 6 + (W === 960 ? 1 : 0), ST: STAGE, POT }), path.join(ART, `scene_${vp}_${s}.png`));
  }
  if (!only || only === 'seams') {
    const list = SEASONS.flatMap(s => [['env/far_' + s, 420, 240], ['env/mid_' + s, 380, 220], ['env/ground_' + s, 260, 20]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
  console.log('RECIPE', JSON.stringify({ landscape: RECIPE.landscape, portrait: RECIPE.portrait, ground: GROUND, farfill: FARFILL, sky: SKY, stage: STAGE, pot: POT }));
})().catch(e => { console.error(e); process.exit(1); });
