#!/usr/bin/env node
// Visual QA for Mossy's Egg Grove environment art (Playwright + Chromium, preinstalled; never run `playwright install`).
// Renders into docs/art/:
//   seams.png            far/near/ground per zone tiled twice side by side (½ scale) + the join (x 960) magnified 4x, magenta mark
//   scene_<zone>.png     960x540 composed scene: sky cover-fit, far/near/ground layered with parallax offsets,
//                        nest (back, placeholder eggs, front, vine) at its in-game place (DESIGN §2)
//   scenes.png           the four scenes in a 2x2 grid (season distinctness)
//   portrait_<zone>.png  390x844 portrait composition
//   nest.png             nest back + front at 1x over a checker, with the contract lines (x 28 / 388, y 120 / 568)
//   parts.png            particles at 1x and 4x on dark / sky / white / snow, plus the vine
// Usage: node sheet.js [assetsDir] [outDir] [portraitZone]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const A = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '../../docs/art'));
const PZ = process.argv[4] || 'autumn';
fs.mkdirSync(OUT, { recursive: true });
const Z = ['spring', 'summer', 'autumn', 'winter'];
const PARTS = ['sparkle', 'star', 'glow', 'petal', 'leafbit', 'snow', 'firefly', 'streak', 'puff', 'shellbit', 'heart'];
const PAL = JSON.parse(fs.readFileSync(path.join(A, 'levels/palette.json'), 'utf8'));

const common = `
const A = ${JSON.stringify('file://' + A)}, Z = ${JSON.stringify(Z)}, PARTS = ${JSON.stringify(PARTS)}, PAL = ${JSON.stringify(PAL)};
const cache = {};
const load = s => cache[s] || (cache[s] = new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { console.log('MISSING ' + s); r(null); }; i.src = A + '/' + s; }));
const mark = (c, x0, y0, x1, y1) => { c.save(); c.strokeStyle = '#ff00ff'; c.lineWidth = 1; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.restore(); };
function tileX(c, im, off, y, w, h, VW) { let x0 = -(((off % w) + w) % w); for (let x = x0; x < VW; x += w) c.drawImage(im, x, y, w, h); }
const KR = [0.5, 0.66, 0.84, 1.04, 1.26, 1.5, 1.78, 2.1];
const KC = ['#cdeee0', '#8fc8f0', '#f6a8c8', '#c4b0ee', '#8ed07a', '#f59a6e', '#34408a', '#f2c84b'];
// a plausible resting pile: each circle drops at x and stops at the lowest free spot (floor y 0, walls x 0 / 9)
function pile(order) {
  const placed = [];
  for (const [k, x0] of order) {
    const r = KR[k - 1], x = Math.max(r, Math.min(9 - r, x0));
    let y = r; // floor
    for (const p of placed) { const dx = Math.abs(p.x - x), d = p.r + r; if (dx < d) y = Math.max(y, p.y + Math.sqrt(d * d - dx * dx)); }
    placed.push({ k, r, x, y });
  }
  return placed;
}
const EGGS = pile([[8, 2.1], [7, 6.9], [6, 4.4], [5, 8.2], [4, 0.9], [3, 3.2], [1, 6.0], [2, 5.0], [1, 7.6], [3, 8.4], [2, 2.0], [4, 6.4], [1, 0.4]]);
function egg(c, X, Y, R, col) {
  c.save(); c.translate(X, Y); c.fillStyle = col; c.strokeStyle = 'rgba(40,30,60,.55)'; c.lineWidth = Math.max(2, R * 0.05);
  c.beginPath(); c.ellipse(0, 0, R * 104 / 116, R, 0, 0, 7); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(-R * 0.35, -R * 0.45, R * 0.18, R * 0.12, -0.5, 0, 7); c.fill();
  c.fillStyle = 'rgba(40,30,50,.8)'; c.beginPath(); c.arc(-R * 0.22, -R * 0.05, R * 0.07, 0, 7); c.arc(R * 0.22, -R * 0.05, R * 0.07, 0, 7); c.fill();
  c.restore();
}
// full scene. VW/VH screen; portrait flag picks the unit formula; cam = parallax camera offset (px)
async function scene(c, z, VW, VH, cam, portrait) {
  const unit = portrait ? Math.min(VW / 11, (VH - 70) / 15.2) : Math.min(VH / 15.2, VW / 22);
  const groundPx = VH - 0.6 * unit, nestLeft = VW / 2 - 4.5 * unit, k = unit / 40;
  const s = portrait ? VH / 540 * 0.72 : 1; // background layer scale
  const sky = await load('levels/' + z + '/sky.svg'), far = await load('levels/' + z + '/far.svg'), near = await load('levels/' + z + '/near.svg'), gr = await load('levels/' + z + '/ground.svg');
  c.fillStyle = PAL[z].ground; c.fillRect(0, 0, VW, VH);
  const sc = Math.max(VW / 960, VH / 540); c.drawImage(sky, (VW - 960 * sc) / 2, (VH - 540 * sc) / 2, 960 * sc, 540 * sc);
  const gl = groundPx - 8; // ground tile top line (its y 10)
  tileX(c, far, cam * 0.2 + 480 * s - VW / 2, gl + 4 * s - 360 * s, 960 * s, 360 * s, VW);
  tileX(c, near, cam * 0.5 + 480 * s - VW / 2, gl + 8 * s - 240 * s, 960 * s, 240 * s, VW);
  tileX(c, gr, cam + 480 * s - VW / 2, gl - 10 * s, 960 * s, 120 * s, VW);
  const nb = await load('nest.svg'), nf = await load('nest_front.svg'), vi = await load('vine.svg');
  const x0 = nestLeft - 28 * k, y0 = groundPx - 568 * k;
  c.drawImage(nb, x0, y0, 416 * k, 620 * k);
  for (const e of EGGS) egg(c, nestLeft + e.x * unit, groundPx - e.y * unit, e.r * unit, KC[e.k - 1]);
  c.drawImage(nf, x0, y0, 416 * k, 620 * k);
  c.drawImage(vi, nestLeft + 4.5 * unit - 4.8 * unit, groundPx - 9.8 * unit - 20 * (9.6 * unit / 400), 9.6 * unit, 40 * (9.6 * unit / 400));
  // Mossy placeholder (moss green circle) + held egg
  const mx = nestLeft + 5.6 * unit, my = groundPx - 12.6 * unit;
  egg(c, mx, groundPx - 11.3 * unit, 0.66 * unit, KC[1]);
  c.fillStyle = '#6fa04a'; c.strokeStyle = '#3f6a2a'; c.lineWidth = 3; c.beginPath(); c.arc(mx, my, 0.9 * unit, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#d6f0c4'; c.beginPath(); c.arc(mx, my + 0.25 * unit, 0.45 * unit, 0, 7); c.fill();
  // HUD bar sample (palette check): bar + ink
  c.fillStyle = PAL[z].bar; c.beginPath(); c.roundRect(VW - (portrait ? 170 : 200), 12, portrait ? 150 : 180, 44, 14); c.fill();
  c.fillStyle = PAL[z].ink; c.font = 'bold 24px sans-serif'; c.fillText('1234', VW - (portrait ? 150 : 180), 43);
  c.fillStyle = PAL[z].accent; c.beginPath(); c.arc(VW - 40, 34, 9, 0, 7); c.fill();
}
`;
const page = (body, script) => `<!doctype html><html><body style="margin:0;background:#2a2a33;font:12px sans-serif;color:#ddd">${body}<script>${common}\n(async()=>{${script}\nwindow.DONE=1})().catch(e=>{console.log('ERR '+e.stack);window.DONE=1});</script></body></html>`;
const CAM = { spring: 0, summer: 130, autumn: 300, winter: 520 };

const jobs = {
  seams: page(`<canvas id="c" width="2000" height="10"></canvas>`, `
    const c0 = document.getElementById('c'); const rows = [];
    for (const z of Z) for (const [l, h] of [['far', 360], ['near', 240], ['ground', 120]]) rows.push([z, 'levels/' + z + '/' + l + '.svg', h]);
    c0.height = rows.reduce((s, r) => s + r[2] / 2 + 14, 10); const c = c0.getContext('2d'); let y = 10;
    const tmp = document.createElement('canvas'); tmp.width = 1920; tmp.height = 360; const t = tmp.getContext('2d');
    for (const [z, f, h] of rows) {
      const im = await load(f);
      t.clearRect(0, 0, 1920, 360); t.fillStyle = PAL[z].skyBottom; t.fillRect(0, 0, 1920, h);
      t.drawImage(im, 0, 0); t.drawImage(im, 960, 0);
      c.drawImage(tmp, 0, 0, 1920, h, 10, y, 960, h / 2); mark(c, 490, y, 490, y + h / 2);
      // the join magnified 2x: x 900..1020 of the doubled strip, each quarter of the height side by side
      c.imageSmoothingEnabled = false;
      for (let q = 0; q < 4; q++) { const X = 990 + q * 250; c.drawImage(tmp, 900, q * h / 4, 120, h / 4, X, y, 240, h / 2); mark(c, X + 120, y, X + 120, y + h / 2); }
      c.imageSmoothingEnabled = true;
      c.fillStyle = '#fff'; c.fillText(f, 14, y + 12);
      y += h / 2 + 14;
    }`),
  scenes: page(`<canvas id="c" width="1930" height="1090"></canvas>`, `
    const c = document.getElementById('c').getContext('2d'); const CAM = ${JSON.stringify(CAM)};
    for (let i = 0; i < 4; i++) { c.save(); c.translate((i % 2) * 970, Math.floor(i / 2) * 550); c.beginPath(); c.rect(0, 0, 960, 540); c.clip(); await scene(c, Z[i], 960, 540, CAM[Z[i]]); c.restore(); }`),
  nest: page(`<canvas id="c" width="900" height="640"></canvas>`, `
    const c = document.getElementById('c').getContext('2d');
    for (let y = 0; y < 640; y += 16) for (let x = 0; x < 900; x += 16) { c.fillStyle = ((x + y) / 16) % 2 ? '#7a8a8a' : '#9aaaa8'; c.fillRect(x, y, 16, 16); }
    const nb = await load('nest.svg'), nf = await load('nest_front.svg');
    c.drawImage(nb, 10, 10); c.drawImage(nf, 10, 10);
    c.drawImage(nf, 460, 10);
    for (const ox of [10, 460]) { mark(c, ox + 28, 0, ox + 28, 640); mark(c, ox + 388, 0, ox + 388, 640); mark(c, ox, 10 + 568, ox + 416, 10 + 568); mark(c, ox, 130, ox + 416, 130); }`),
  parts: page(`<canvas id="c" width="1700" height="780"></canvas>`, `
    const c = document.getElementById('c').getContext('2d');
    const bgs = ['#2a2a33', PAL.spring.skyTop, '#ffffff', PAL.winter.skyBottom];
    for (let b = 0; b < 4; b++) { c.fillStyle = bgs[b]; c.fillRect(0, b * 180, 1700, 180); }
    for (let i = 0; i < PARTS.length; i++) {
      const im = await load('particles/' + PARTS[i] + '.svg');
      for (let b = 0; b < 4; b++) { const x = 10 + i * 150, y = b * 180 + 10; c.drawImage(im, x, y, 32, 32); c.drawImage(im, x, y + 40, 128, 128); }
    }
    c.fillStyle = '#4b3a2e'; c.fillRect(0, 720, 1700, 60); const v = await load('vine.svg'); c.drawImage(v, 10, 730, 400, 40); c.drawImage(v, 430, 720, 800, 80);`)
};
for (const z of Z) jobs['scene_' + z] = page(`<canvas id="c" width="960" height="540"></canvas>`, `
  const c = document.getElementById('c').getContext('2d'); await scene(c, '${z}', 960, 540, ${CAM[z]});`);
jobs['portrait_' + PZ] = page(`<canvas id="c" width="390" height="844"></canvas>`, `
  const c = document.getElementById('c').getContext('2d'); await scene(c, '${PZ}', 390, 844, 200, true);`);

(async () => {
  const browser = await chromium.launch();
  const pg = await browser.newPage({ viewport: { width: 2000, height: 2400 } });
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
