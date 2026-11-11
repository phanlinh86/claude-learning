// Tuk's Ice Match: environment preview scenes (Playwright + canvas, same layer maths as render.js _landscape).
// Run after tools/art_env.js:  node tools/env_scenes.js [filter]
// Writes docs/art/scene_<ipadL|iphoneL|iphoneP>_<sunny|breezy|rain|rainbow>.png, docs/art/env_seams.png (each layer of
// each stage: 2 tiles side by side with the seam marked + a 4x zoom on the join, seam scores printed) and
// docs/art/env_sheet.png (sun, clouds, rainbow, particles on light / mid / dark backgrounds).
// SKY below = the proposed IM.Weather ambient per stage. Layer placement (k = 1.36 on tall portrait, else 1; gy = groundY):
//   far    1200k x 420k, bottom at gy - 120          (top gy - 540)
//   mid    1200k x 360k, bottom at gy - 10           (top gy - 370; sea band svg y ≈ 300..340, lip hides y > 340)
//   ground 1200k x 260k, top at gy - 30 - 40k        (its snow lip, svg y ≈ 40, lands on gy - 30)
// Foreground stand-ins: the frozen-lake panel (DESIGN §3 colours), a 12-block grid (aspect 0.9: clear blocks with a
// coloured answer disc, frosted blocks), Tuk as a navy blob at the bottom-left, and the SEA line (cyan dashes).
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');
const { SEA, FILL } = require('./art_env.js');

const STAGES = ['sunny', 'breezy', 'rain', 'rainbow'];
const PARTS = ['snow1', 'snow2', 'drop', 'splash', 'sparkle', 'star', 'shard', 'puff', 'confetti_a', 'confetti_b'];
const NAMES = ['env/sun', 'env/cloud1', 'env/cloud2', 'env/cloud3', 'env/rainbow', ...PARTS.map(p => 'particles/' + p)];
for (const s of STAGES) NAMES.push('env/far_' + s, 'env/mid_' + s, 'env/ground_' + s);
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');

const SKY = {
  sunny: { skyTop: '#7CC2EE', skyBottom: '#DDF1FB', horizon: '#F2FAFF', sun: 1, panel: '#CFE6F2', parts: ['sparkle', 'sparkle', 'sparkle'], fill: FILL.sunny },
  breezy: { skyTop: '#A9AFD3', skyBottom: '#E6E4F0', horizon: '#F1EEF6', sun: 0.55, panel: '#D5E2EC', parts: ['snow1', 'snow2', 'snow1', 'snow2', 'snow1', 'snow1'], fill: FILL.breezy },
  rain: { skyTop: '#8EA3BA', skyBottom: '#D6DFE8', horizon: '#E4EAF0', sun: 0, panel: '#C3D6E3', parts: ['drop', 'drop', 'drop', 'drop', 'drop', 'drop', 'drop'], fill: FILL.rain, tint: 'rgba(90,110,140,0.06)' },
  rainbow: { skyTop: '#8FCDEE', skyBottom: '#E8F6FB', horizon: '#FBF0F4', sun: 1, panel: '#D9EAF5', parts: ['sparkle', 'snow1', 'sparkle', 'snow1', 'star'], fill: FILL.rainbow, rainbow: 1 },
};
const DEVICES = [['iphoneL', 1556, 720], ['ipadL', 960, 720], ['iphoneP', 720, 1556]];
const FACES = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#9B6BE0'];

function pageScene({ W, H, stage, sky, src, faces, sea }) {
  const load = s => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => j(new Error('bad svg')); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const tall = H > W * 1.6, k = tall ? 1.36 : 1, portrait = H > W;
    const gy = H - 90 - (tall ? Math.min(140, 0.3 * (H - 1.6 * W)) : 0);
    const sk = g.createLinearGradient(0, 0, 0, gy); sk.addColorStop(0, sky.skyTop); sk.addColorStop(1, sky.skyBottom);
    g.fillStyle = sk; g.fillRect(0, 0, W, H);
    const hz = g.createLinearGradient(0, gy - 620 * k, 0, gy - 140);
    hz.addColorStop(0, sky.horizon + '00'); hz.addColorStop(0.6, sky.horizon + '88'); hz.addColorStop(1, sky.horizon + 'CC');
    g.fillStyle = hz; g.fillRect(0, Math.max(0, gy - 620 * k), W, 620 * k);
    const spr = (n, x, y, w, a = 1, rot = 0) => { const i = im[n]; const h = w * i.height / i.width; g.save(); g.globalAlpha = a; g.translate(x, y); g.rotate(rot); g.drawImage(i, -w / 2, -h / 2, w, h); g.restore(); };
    if (sky.rainbow) spr('env/rainbow', W / 2, gy - 330 * k, Math.max(W, 1200) * 0.95, 0.9);
    if (sky.sun) spr('env/sun', W * 0.66, portrait ? 210 : 80, 150, sky.sun);
    ['cloud1', 'cloud3', 'cloud2'].forEach((cl, i) => spr('env/' + cl, (i * 0.34 + 0.18) * W, (portrait ? 150 : 60) + (i % 2) * 50, 300 * (1.05 - i * 0.12), stage === 'rain' ? 0.85 : 0.95));
    const layers = [['env/far_' + stage, 420, gy - 120], ['env/mid_' + stage, 360, gy - 10], ['env/ground_' + stage, 260, gy - 30 - 40 * k + 260 * k]];
    let midY = 0;
    for (const [n, h, bottom] of layers) {
      const tw = 1200 * k, th = h * k, y = bottom - th;
      if (n.includes('mid')) midY = y;
      for (let x = 0; x < W; x += tw) g.drawImage(im[n], Math.round(x), Math.round(y), Math.round(tw), Math.round(th));
      if (n.includes('ground') && y + th < H) { g.fillStyle = sky.fill; g.fillRect(0, y + th - 2, W, H - y - th + 2); }
    }
    if (sky.tint) { g.fillStyle = sky.tint; g.fillRect(0, 0, W, H); }
    // layout (DESIGN §2 / Dee §2, no insets)
    const tuk = portrait ? { x: 100, y: gy + 20, h: 170 } : { x: 110, y: gy + 16, h: 180 };
    const bub = portrait ? { x: 24, y: 120, h: 124 } : { x: 24, y: 20, h: 122 };
    bub.w = Math.min(640, W - bub.x - (portrait ? 24 : 160));
    let board;
    if (portrait) board = { x: 24, y: bub.y + bub.h + 24, w: W - 48 }; else board = { x: tuk.x + 120, y: bub.y + bub.h + 24 };
    if (portrait) board.h = Math.min(gy - 10, tuk.y - tuk.h - 10) - board.y; else { board.w = W - 24 - board.x; board.h = gy - 10 - board.y; }
    const cols = portrait ? 3 : 4, rows = portrait ? 4 : 3, ar = 0.9;
    let cw = Math.min(board.w / (cols + 0.12 * (cols - 1)), board.h / ((rows + 0.12 * (rows - 1)) / ar));
    cw = Math.min(cw, 170);
    const ch = cw / ar, gap = 0.12 * cw, gw = cols * cw + (cols - 1) * gap, gh = rows * ch + (rows - 1) * gap;
    const x0 = board.x + (board.w - gw) / 2, y0 = board.y + (board.h - gh) / 2;
    // frozen-lake panel
    g.save(); g.globalAlpha = 0.85; g.fillStyle = sky.panel; g.beginPath(); g.roundRect(x0 - 26, y0 - 22, gw + 52, gh + 44, 40); g.fill(); g.restore();
    g.save(); g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 4; g.beginPath(); g.roundRect(x0 - 26, y0 - 22, gw + 52, gh + 44, 40); g.stroke(); g.restore();
    // sea line (where fish dive), in screen coords for each tile
    g.save(); g.setLineDash([12, 8]); g.strokeStyle = 'rgba(0,170,200,0.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, midY + sea.y * k); g.lineTo(W, midY + sea.y * k); g.stroke(); g.restore();
    // bubble
    g.fillStyle = 'rgba(255,255,255,0.92)'; g.beginPath(); g.roundRect(bub.x, bub.y, bub.w, bub.h, 26); g.fill();
    g.fillStyle = '#3d3a52'; g.font = 'bold 28px sans-serif'; g.fillText('Find two blocks that match!  · ' + stage, bub.x + 26, bub.y + 70);
    // blocks
    let i = 0;
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++, i++) {
      const x = x0 + q * (cw + gap), y = y0 + r * (ch + gap), rr = 0.16 * cw;
      g.fillStyle = '#9CCBE3'; g.beginPath(); g.roundRect(x, y + 10, cw, ch, rr); g.fill();
      const up = i % 3 === 0;
      const gr = g.createLinearGradient(x, y, x + cw, y + ch); gr.addColorStop(0, up ? '#DDF1FB' : '#F2F8FC'); gr.addColorStop(1, up ? '#BFE3F5' : '#DCEAF3');
      g.fillStyle = gr; g.strokeStyle = '#6FA7C8'; g.lineWidth = 3; g.beginPath(); g.roundRect(x, y, cw, ch, rr); g.fill(); g.stroke();
      if (up) { g.fillStyle = faces[(i / 3) % faces.length]; g.beginPath(); g.ellipse(x + cw / 2, y + ch / 2, cw * 0.3, cw * 0.2, 0, 0, 7); g.fill(); g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 6, y + 6, cw - 12, ch - 12); }
      else { g.strokeStyle = '#C4DCEB'; g.lineWidth = 3; g.beginPath(); for (let a = 0; a < 6; a++) { g.moveTo(x + cw / 2, y + ch / 2); g.lineTo(x + cw / 2 + Math.cos(a * 1.047) * cw * 0.22, y + ch / 2 + Math.sin(a * 1.047) * cw * 0.22); } g.stroke(); }
    }
    // Tuk stand-in
    g.fillStyle = 'rgba(60,80,110,0.2)'; g.beginPath(); g.ellipse(tuk.x, tuk.y, 56, 10, 0, 0, 7); g.fill();
    g.fillStyle = '#2E3A59'; g.strokeStyle = '#161C2E'; g.lineWidth = 4;
    g.beginPath(); g.ellipse(tuk.x, tuk.y - tuk.h * 0.38, tuk.h * 0.3, tuk.h * 0.38, 0, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#FFFFFF'; g.beginPath(); g.ellipse(tuk.x + 10, tuk.y - tuk.h * 0.34, tuk.h * 0.2, tuk.h * 0.28, 0, 0, 7); g.fill();
    g.fillStyle = '#F4EFE6'; g.beginPath(); g.ellipse(tuk.x, tuk.y - tuk.h * 0.74, tuk.h * 0.22, tuk.h * 0.1, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#C9454F'; g.fillRect(tuk.x - tuk.h * 0.2, tuk.y - tuk.h * 0.78, tuk.h * 0.4, 8);
    g.fillStyle = '#F2A33A'; g.beginPath(); g.ellipse(tuk.x + tuk.h * 0.3, tuk.y - tuk.h * 0.55, 18, 8, 0, 0, 7); g.fill();
    // weather particles
    sky.parts.forEach((p, j) => {
      const x = 80 + j * (W - 160) / Math.max(1, sky.parts.length - 1), y = (portrait ? 280 : 160) + ((j * 137) % 260);
      spr('particles/' + p, x, y, p === 'drop' ? 26 : 30, 1, p === 'drop' ? 0.12 : j * 0.7);
    });
    if (stage === 'rain') for (let j = 0; j < 4; j++) spr('particles/splash', x0 + (j + 0.5) * gw / 4, y0 + gh + 8, 28, 0.9);
    g.save(); g.setLineDash([10, 8]); g.strokeStyle = 'rgba(200,0,120,0.7)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, gy); g.lineTo(W, gy); g.stroke(); g.restore();
    return c.toDataURL('image/png');
  })();
}

function pageSeams({ src, stages }) {
  const load = s => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => j(new Error('bad svg')); i.src = s; });
  return (async () => {
    const L = [['far', 420], ['mid', 360], ['ground', 260]];
    const rowOf = h => h / 2 + 12;
    let total = 0; for (const s of stages) for (const [, h] of L) total += rowOf(h);
    const out = document.createElement('canvas'); out.width = 1800; out.height = total;
    const o = out.getContext('2d'); o.fillStyle = '#8FB8D8'; o.fillRect(0, 0, out.width, out.height);
    const scores = []; let y = 0;
    for (const s of stages) for (const [ln, h] of L) {
      const n = 'env/' + ln + '_' + s, im = await load(src[n]), rowH = rowOf(h);
      const c = document.createElement('canvas'); c.width = 2400; c.height = h; const g = c.getContext('2d');
      g.drawImage(im, 0, 0, 1200, h); g.drawImage(im, 1200, 0, 1200, h);
      const d = g.getImageData(0, 0, 2400, h).data;
      const col = (x1, x2) => { let t = 0; for (let yy = 0; yy < h; yy++) { const i = (yy * 2400 + x1) * 4, j = (yy * 2400 + x2) * 4; for (let q = 0; q < 4; q++) t += Math.abs(d[i + q] - d[j + q]); } return t / h; };
      const seam = col(1199, 1200); let sum = 0; for (let x = 100; x < 1100; x++) sum += col(x, x + 1);
      scores.push(`${n.padEnd(20)} seam=${seam.toFixed(2)} interiorAvg=${(sum / 1000).toFixed(2)} ${seam <= sum / 1000 * 3 ? 'OK' : 'CHECK'}`);
      o.drawImage(c, 0, y, 1200, h / 2);
      o.save(); o.setLineDash([6, 6]); o.strokeStyle = 'red'; o.lineWidth = 1.5; o.beginPath(); o.moveTo(600, y); o.lineTo(600, y + h / 2); o.stroke(); o.restore();
      const zh = (rowH - 12) / 4, zy = ln === 'ground' ? 20 : ln === 'mid' ? 230 : 200;
      o.imageSmoothingEnabled = false; o.drawImage(c, 1126, zy, 148, zh, 1210, y, 592, zh * 4); o.imageSmoothingEnabled = true;
      o.save(); o.setLineDash([8, 6]); o.strokeStyle = 'red'; o.lineWidth = 2; o.beginPath(); o.moveTo(1506, y); o.lineTo(1506, y + zh * 4); o.stroke(); o.restore();
      y += rowH;
    }
    return { url: out.toDataURL('image/png'), scores };
  })();
}

function pageSheet({ src, parts }) {
  const load = s => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = () => j(new Error('bad svg')); i.src = s; });
  return (async () => {
    const c = document.createElement('canvas'); c.width = 1500; c.height = 820; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 440); gr.addColorStop(0, '#7CC2EE'); gr.addColorStop(1, '#DDF1FB'); g.fillStyle = gr; g.fillRect(0, 0, 1500, 440);
    g.drawImage(await load(src['env/rainbow']), 300, 200, 1200, 500 * 0.48);
    let x = 10; for (const n of ['env/sun', 'env/cloud1', 'env/cloud2', 'env/cloud3']) { const i = await load(src[n]); g.drawImage(i, x, 20); x += i.width + 20; }
    const bgs = ['#EAF4FA', '#8EA3BA', '#2E3A59'];
    for (let r = 0; r < 3; r++) { g.fillStyle = bgs[r]; g.fillRect(0, 440 + r * 126, 1500, 126); for (let i = 0; i < parts.length; i++) g.drawImage(await load(src['particles/' + parts[i]]), 14 + i * 146, 450 + r * 126, 104, 104); }
    return c.toDataURL('image/png');
  })();
}

(async () => {
  fs.mkdirSync(ART, { recursive: true });
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent('<html><body style="margin:0"></body></html>');
  const save = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  const only = process.argv[2];
  for (const [dn, W, H] of DEVICES) for (const s of STAGES) {
    if (only && !`${dn}_${s}`.includes(only)) continue;
    save(await pg.evaluate(pageScene, { W, H, stage: s, sky: SKY[s], src: SRC, faces: FACES, sea: SEA }), path.join(ART, `scene_${dn}_${s}.png`));
  }
  const sm = await pg.evaluate(pageSeams, { src: SRC, stages: STAGES }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  save(await pg.evaluate(pageSheet, { src: SRC, parts: PARTS }), path.join(ART, 'env_sheet.png'));
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
