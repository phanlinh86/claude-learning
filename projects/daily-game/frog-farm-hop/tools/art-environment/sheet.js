#!/usr/bin/env node
// Visual QA for Clover's Farm Hop environment art (Playwright + Chromium, preinstalled).
// Renders into tests/out/art/:
//   seams_far.png      each far.svg tiled 2x2 over its sky colour, seams marked magenta
//   seams_sky.png      each sky.svg tiled 2x1, seam marked; plus pole.svg tiled 3x vertically
//   scene_<w>.png      960x540 composed scene: sky, far (offset), poles at x 186 / 774, ground (sunny),
//                      placeholder platforms (hay gold / plank / cart red / puff white), a lime frog, fireflies
//   scene_portrait.png the sunny + snow scenes at 560x1000 (portrait cover-fit)
//   particles.png      every particle at 1x and 4x on dark, sky and white backgrounds
// Usage: node sheet.js [assetsDir] [outDir]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const A = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '../../tests/out/art'));
fs.mkdirSync(OUT, { recursive: true });
const W = ['sunny', 'rain', 'wind', 'snow'];
const PARTS = ['petal', 'butterfly', 'raindrop', 'splash', 'leaf', 'gust', 'snowflake', 'sparkle', 'straw', 'puff', 'glow', 'dust'];
const PAL = JSON.parse(fs.readFileSync(path.join(A, 'levels/palette.json'), 'utf8'));

const common = `
const A = ${JSON.stringify('file://' + A)}, W = ${JSON.stringify(W)}, PARTS = ${JSON.stringify(PARTS)}, PAL = ${JSON.stringify(PAL)};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { console.log('MISSING ' + s); r(null); }; i.src = A + '/' + s; });
const mark = (c, x0, y0, x1, y1) => { c.save(); c.strokeStyle = '#ff00ff'; c.lineWidth = 1; c.setLineDash([6, 6]); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.restore(); };
function rr(c, x, y, w, h, r, fill, stroke) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 3; c.stroke(); } }
// one composed scene (the renderer's mapping: unit = VH/11.5 landscape, VW/12.8 portrait)
async function scene(c, w, VW, VH, o) {
  const sky = await load('levels/' + w + '/sky.svg'), far = await load('levels/' + w + '/far.svg');
  const pole = await load('levels/pole.svg'), ground = await load('levels/ground.svg');
  const portrait = VH > VW, unit = portrait ? VW / 12.8 : VH / 11.5, colX = VW / 2 - 6 * unit;
  // sky cover-fit
  const s = Math.max(VW / 960, VH / 540), sw = 960 * s, sh = 540 * s;
  c.drawImage(sky, (VW - sw) / 2, (VH - sh) / 2, sw, sh);
  // far: tile both ways at the sky scale, offset by farOff
  const fs = VH / 540, fw = 960 * fs, fh = 1080 * fs; const fy0 = ((o.farOff || 0) * fs) % fh;
  for (let y = fy0 - fh; y < VH; y += fh) for (let x = (VW - fw) / 2 - fw; x < VW; x += fw) c.drawImage(far, x, y, fw, fh);
  // ground: ground line y 330 -> world y 0; drawn 1280 wide per 12 u * (1280/564)... scale so 564 px of art = column
  const camY = o.camY;
  const gs = unit * 12 / 564, gLine = VH - (0 - camY) * unit;
  if (o.ground) {
    const gw = 1280 * gs, gh = 420 * gs;
    c.drawImage(ground, VW / 2 - gw / 2, gLine - 330 * gs, gw, gh);
    c.fillStyle = '#7e5a3c'; c.fillRect(0, gLine - 330 * gs + gh - 1, VW, VH);
  }
  // poles at the column edges (tiled vertically, parallax 1)
  const pw = Math.round(0.9 * unit), ph = Math.round(pw * 256 / 48);
  const lim = o.ground ? gLine : VH; c.save(); c.beginPath(); c.rect(0, 0, VW, lim); c.clip();
  for (const px of [colX, colX + 12 * unit]) for (let y = Math.round(gLine % ph) - ph; y < lim; y += ph) c.drawImage(pole, px - pw / 2, y, pw, ph);
  c.restore();
  const sx = x => colX + x * unit, sy = y => VH - (y - camY) * unit;
  // optional: the character artist's real sprites (if they exist) instead of the placeholders
  if (o.real) {
    const TOP = { hay: [192, 96, 14], plank: [160, 48, 8], cart: [224, 128, 22], puff: [192, 96, 18] }, im = {};
    for (const k of ['hay', 'plank', 'cart', 'puff', 'wheel', 'clover_idle', 'firefly_0']) im[k] = await load(k + '.svg');
    if (Object.values(im).every(Boolean)) {
      for (const p of o.plats) {
        const [vw, vh, top] = TOP[p.k], w = p.w * unit, s = w / vw, x = sx(p.x) - w / 2, y = sy(p.y) - top * s;
        c.drawImage(im[p.k], x, y, w, vh * s);
        if (p.k === 'cart') for (const cx of [56, 168]) c.drawImage(im.wheel, x + cx * s - 0.19 * w, y + 104 * s - 0.19 * w, 0.38 * w, 0.38 * w);
      }
      for (const [fx, fy] of o.flies || []) { const d = 0.75 * unit; c.drawImage(im.firefly_0, sx(fx) - d / 2, sy(fy) - d / 2, d, d); }
      const d = 1.35 * unit; c.drawImage(im.clover_idle, sx(o.frog[0]) - d / 2, sy(o.frog[1]) - d * 118 / 128, d, d);
      return;
    }
  }
  // placeholder platforms {kind, x, y, w}
  for (const p of o.plats) {
    const x = sx(p.x - p.w / 2), y = sy(p.y), w = p.w * unit;
    if (p.k === 'hay') { rr(c, x, y - 4, w, 0.9 * unit, 14, '#e8b84a', '#c08a2a'); c.fillStyle = '#8a5a2a'; c.fillRect(x + w * 0.3, y - 2, 5, 0.85 * unit); c.fillRect(x + w * 0.66, y - 2, 5, 0.85 * unit); }
    if (p.k === 'plank') rr(c, x, y - 3, w, 0.42 * unit, 6, '#b97a45', '#8a5530');
    if (p.k === 'cart') { rr(c, x, y - 3, w, 0.8 * unit, 8, '#d9534f', '#8c2f2c'); c.fillStyle = '#e8b84a'; c.fillRect(x + 6, y - 8, w - 12, 8); c.fillStyle = '#b97a45'; for (const k of [0.25, 0.75]) { c.beginPath(); c.arc(x + w * k, y + 0.8 * unit, 0.3 * unit, 0, 7); c.fill(); } }
    if (p.k === 'puff') { rr(c, x, y - 4, w, 0.75 * unit, 0.37 * unit, '#c9d6ff'); rr(c, x, y - 8, w, 0.6 * unit, 0.3 * unit, '#ffffff'); }
  }
  // fireflies
  for (const [fx, fy] of o.flies || []) {
    const X = sx(fx), Y = sy(fy), g = c.createRadialGradient(X, Y, 0, X, Y, 0.38 * unit);
    g.addColorStop(0, 'rgba(255,242,122,.9)'); g.addColorStop(1, 'rgba(255,242,122,0)');
    c.fillStyle = g; c.beginPath(); c.arc(X, Y, 0.38 * unit, 0, 7); c.fill();
    c.fillStyle = '#ffb627'; c.beginPath(); c.arc(X, Y, 0.1 * unit, 0, 7); c.fill();
  }
  // frog stand-in: lime circle with outline + yellow hat
  const fx = sx(o.frog[0]), fy = sy(o.frog[1]) - 0.55 * unit;
  c.fillStyle = '#7ed957'; c.strokeStyle = '#2f6b2a'; c.lineWidth = 3; c.beginPath(); c.arc(fx, fy, 0.5 * unit, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#ffd23f'; c.strokeStyle = '#b8860b'; c.beginPath(); c.ellipse(fx, fy - 0.45 * unit, 0.42 * unit, 0.16 * unit, 0, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#2b2440'; c.beginPath(); c.arc(fx + 0.18 * unit, fy - 0.08 * unit, 0.09 * unit, 0, 7); c.fill();
}
const PLATS = [
  { k: 'hay', x: 3.0, y: 2.0, w: 2.4 }, { k: 'plank', x: 7.5, y: 3.8, w: 1.7 }, { k: 'cart', x: 4.5, y: 5.7, w: 2.3 },
  { k: 'puff', x: 8.8, y: 7.4, w: 2.1 }, { k: 'hay', x: 5.6, y: 9.1, w: 2.4 }, { k: 'plank', x: 1.6, y: 10.4, w: 1.7 },
  { k: 'cart', x: 10.0, y: 1.2, w: 2.3 }, { k: 'hay', x: 9.4, y: 12.6, w: 2.4 }, { k: 'puff', x: 3.2, y: 14.4, w: 2.1 },
  { k: 'hay', x: 6.5, y: 16.5, w: 2.4 }, { k: 'plank', x: 2.6, y: 18.3, w: 1.7 }];
const FLIES = [[5.6, 4.6], [6.2, 5.0], [6.8, 4.8], [8.2, 9.8], [8.8, 10.3], [4, 12.6], [4.6, 13]];
`;

const page = (body, script) => `<!doctype html><html><body style="margin:0;background:#2a2a33;font:12px sans-serif;color:#ddd">${body}<script>${common}\n(async()=>{${script}\nwindow.DONE=1})().catch(e=>{console.log('ERR '+e);window.DONE=1});</script></body></html>`;

const jobs = {
  seams_far: page(`<canvas id="c" width="${4 * 960 / 2 + 30}" height="${2 * 1080 / 2 + 30}"></canvas>`, `
    const c = document.getElementById('c').getContext('2d'); c.canvas.width = 4 * 2 * 480 / 2 + 50; c.canvas.height = 1080 + 20;
    // each level: 2x2 tiles at 0.5 scale -> 960x1080 block; 4 blocks side by side would be too wide, so 2x2 grid of blocks
    c.canvas.width = 2 * 960 + 30; c.canvas.height = 2 * 1080 + 30;
    for (let i = 0; i < 4; i++) {
      const w = W[i], bx = 10 + (i % 2) * 970, by = 10 + Math.floor(i / 2) * 1090, im = await load('levels/' + w + '/far.svg');
      const g = c.createLinearGradient(0, by, 0, by + 1080); g.addColorStop(0, PAL[w].skyTop); g.addColorStop(1, PAL[w].skyBottom);
      c.fillStyle = g; c.fillRect(bx, by, 960, 1080);
      for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) c.drawImage(im, bx + tx * 480, by + ty * 540, 480, 540);
      mark(c, bx + 480, by, bx + 480, by + 1080); mark(c, bx, by + 540, bx + 960, by + 540);
      c.fillStyle = '#000'; c.fillText(w, bx + 6, by + 14);
    }`),
  seams_sky: page(`<canvas id="c" width="1960" height="1150"></canvas>`, `
    const c = document.getElementById('c').getContext('2d');
    for (let i = 0; i < 4; i++) {
      const im = await load('levels/' + W[i] + '/sky.svg'), x = 10 + (i % 2) * 970, y = 10 + Math.floor(i / 2) * 290;
      c.drawImage(im, x, y, 480, 270); c.drawImage(im, x + 480, y, 480, 270); mark(c, x + 480, y, x + 480, y + 270);
    }
    const p = await load('levels/pole.svg');
    for (let k = 0; k < 2; k++) for (let j = 0; j < 3; j++) c.drawImage(p, 40 + k * 200, 600 + j * 170, 32 * (k + 1), 170);
    for (let j = 1; j < 3; j++) mark(c, 20, 600 + j * 170, 320, 600 + j * 170);
    const gr = await load('levels/ground.svg'); c.fillStyle = '#9fd8ff'; c.fillRect(420, 600, 1280, 420); c.drawImage(gr, 420, 600);
    mark(c, 420, 930, 1700, 930); mark(c, 820, 600, 820, 1020); mark(c, 1300, 600, 1300, 1020); mark(c, 420, 870, 1700, 870);`),
  particles: page(`<canvas id="c" width="1800" height="760"></canvas>`, `
    const c = document.getElementById('c').getContext('2d');
    const bgs = ['#2a2a33', '#8fd3ff', '#ffffff', '#b7a6d9'];
    for (let b = 0; b < 4; b++) { c.fillStyle = bgs[b]; c.fillRect(0, b * 190, 1800, 190); }
    for (let i = 0; i < PARTS.length; i++) {
      const im = await load('particles/' + PARTS[i] + '.svg'), w = im.naturalWidth, h = im.naturalHeight;
      for (let b = 0; b < 4; b++) {
        const x = 10 + i * 140 + (i > 5 ? 80 : 0), y = b * 190 + 10;
        c.drawImage(im, x, y, w, h);
        const s = w > 64 ? 2 : 4, ww = w * s, hh = h * s; c.drawImage(im, x, y + 40, Math.min(ww, 160), Math.min(hh, 140));
      }
    }`)
};
for (const w of W) jobs['scene_' + w] = page(`<canvas id="c" width="960" height="1100"></canvas>`, `
  const c = document.getElementById('c').getContext('2d');
  await scene(c, '${w}', 960, 540, { camY: ${w === 'sunny' ? -1.4 : 30}, ground: ${w === 'sunny'}, farOff: 0, plats: PLATS.map(p => ({...p, y: p.y + ${w === 'sunny' ? 0 : 30}})), flies: FLIES.map(([x, y]) => [x, y + ${w === 'sunny' ? 0 : 30}]), frog: [6.0, ${w === 'sunny' ? 0 : 33.2}] });
  c.save(); c.translate(0, 560); c.beginPath(); c.rect(0, 0, 960, 540); c.clip();
  await scene(c, '${w}', 960, 540, { camY: 60, farOff: 370, plats: PLATS.map(p => ({...p, y: p.y + 60})), flies: FLIES.map(([x, y]) => [x, y + 60]), frog: [7.6, 64.0] });
  c.restore();`);
jobs.scene_real = page(`<canvas id="c" width="1940" height="1100"></canvas>`, `
  const c = document.getElementById('c').getContext('2d');
  for (let i = 0; i < 4; i++) {
    const w = W[i], dy = i ? 20 * i : -1.4, ox = (i % 2) * 980, oy = Math.floor(i / 2) * 560;
    c.save(); c.translate(ox, oy); c.beginPath(); c.rect(0, 0, 960, 540); c.clip();
    await scene(c, w, 960, 540, { real: true, camY: dy, ground: i === 0, farOff: 120 * i, plats: PLATS.map(p => ({...p, y: p.y + Math.max(0, dy)})), flies: FLIES.map(([x, y]) => [x, y + Math.max(0, dy)]), frog: [6.0, i ? dy + 3.8 : 0] });
    c.restore();
  }`);
jobs.scene_portrait = page(`<canvas id="c" width="1140" height="1000"></canvas>`, `
  const c = document.getElementById('c').getContext('2d');
  await scene(c, 'sunny', 560, 1000, { camY: -1.4, ground: true, plats: PLATS, flies: FLIES, frog: [6, 0] });
  c.save(); c.translate(580, 0); c.beginPath(); c.rect(0, 0, 560, 1000); c.clip();
  await scene(c, 'wind', 560, 1000, { camY: 40, farOff: 200, plats: PLATS.map(p => ({...p, y: p.y + 40})), flies: FLIES.map(([x, y]) => [x, y + 40]), frog: [6, 42.0] });
  c.restore();`);

(async () => {
  const browser = await chromium.launch();
  const pg = await browser.newPage({ viewport: { width: 2000, height: 2300 } });
  pg.on('console', m => console.log('  [page] ' + m.text()));
  for (const [name, html] of Object.entries(jobs)) {
    const f = path.join(OUT, '_' + name + '.html');
    fs.writeFileSync(f, html);
    await pg.goto('file://' + f);
    await pg.waitForFunction('window.DONE === 1');
    await pg.locator('#c').screenshot({ path: path.join(OUT, name + '.png') });
    fs.unlinkSync(f);
    console.log('wrote ' + name + '.png');
  }
  await browser.close();
})();
