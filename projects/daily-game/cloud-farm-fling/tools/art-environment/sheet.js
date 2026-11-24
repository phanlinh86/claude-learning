#!/usr/bin/env node
// Visual QA for Nubi's Farm Fling environment art (Playwright + Chromium, preinstalled).
// Renders into docs/art/:
//   seams.png          far/near/ground (per zone) tiled twice side by side; the join (x 960) cropped at 4x, marked magenta
//   scene_<zone>.png   960x540 composed scene with parallax offsets (far 0.3, near 0.6, ground 1)
//   scenes.png         all four scenes in a 2x2 grid (zone distinctness check)
//   parts.png          particles at 1x and 4x on dark / sky / white / snow
// Composition (DESIGN §2 at 960x540, unit 60): grass top (world y 0) at screen y 468, sky cover-fit to y 488,
// far bottom y 392, near bottom y 462, ground tile from y 448 (its line y 20 = 468).
// Placeholders: bale (left), Y sling, wagon, white circle hero (r 40, lavender-grey outline) in the flight band,
// yellow-green firefly dots. Thin ticks on the left edge mark the flight band (world y 1 and 7).
// Usage: node sheet.js [assetsDir] [outDir]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const A = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '../../docs/art'));
fs.mkdirSync(OUT, { recursive: true });
const Z = ['spring', 'summer', 'autumn', 'winter'];
const PARTS = ['sparkle', 'drop', 'snow', 'ripple', 'star', 'firefly', 'petal', 'butterfly', 'puff', 'leafbit', 'glow'];
const PAL = JSON.parse(fs.readFileSync(path.join(A, 'levels/palette.json'), 'utf8'));

const common = `
const A = ${JSON.stringify('file://' + A)}, Z = ${JSON.stringify(Z)}, PARTS = ${JSON.stringify(PARTS)}, PAL = ${JSON.stringify(PAL)};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { console.log('MISSING ' + s); r(null); }; i.src = A + '/' + s; });
const mark = (c, x0, y0, x1, y1) => { c.save(); c.strokeStyle = '#ff00ff'; c.lineWidth = 1; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.restore(); };
function tileX(c, im, off, y, w, h, VW) { let x0 = -(((off % w) + w) % w); for (let x = x0; x < VW; x += w) c.drawImage(im, x, y, w, h); }
async function scene(c, z, cam) {
  const VW = 960, VH = 540, U = 60, G = 468;
  const sky = await load('levels/' + z + '/sky.svg'), far = await load('levels/' + z + '/far.svg'), near = await load('levels/' + z + '/near.svg'), gr = await load('levels/' + z + '/ground.svg');
  c.fillStyle = PAL[z].ground; c.fillRect(0, 0, VW, VH);
  c.drawImage(sky, 0, 0, VW, G + 20);
  tileX(c, far, cam * 0.3, G - 76 - 300, 960, 300, VW);
  tileX(c, near, cam * 0.6, G - 6 - 200, 960, 200, VW);
  tileX(c, gr, cam, G - 20, 960, 240, VW);
  const sx = x => x * U, sy = y => G - y * U;
  // placeholder bale: left edge x 0, top at world y 1.2, right edge 4.6
  c.fillStyle = '#d8c49a'; c.strokeStyle = '#9c8458'; c.lineWidth = 3; c.beginPath(); c.roundRect(-10, sy(1.2), sx(4.6) + 10, 1.2 * U + 6, 10); c.fill(); c.stroke();
  // placeholder sling (Y fork) at world (2.3, 2.9)
  c.lineCap = 'round'; c.strokeStyle = '#6b4a2f'; c.lineWidth = 12;
  c.beginPath(); c.moveTo(sx(2.3), sy(1.2)); c.lineTo(sx(2.3), sy(2.3)); c.moveTo(sx(2.3), sy(2.3)); c.lineTo(sx(1.85), sy(3.0)); c.moveTo(sx(2.3), sy(2.3)); c.lineTo(sx(2.75), sy(3.0)); c.stroke();
  c.strokeStyle = '#a5784c'; c.lineWidth = 7; c.stroke();
  // placeholder wagon on the grass
  c.fillStyle = '#a8603f'; c.strokeStyle = '#6d3a24'; c.lineWidth = 3; c.beginPath(); c.roundRect(sx(11.6), sy(0.55), 2.6 * U, 0.4 * U, 6); c.fill(); c.stroke();
  for (const wx of [12.1, 13.7]) { c.fillStyle = '#7a4a30'; c.beginPath(); c.arc(sx(wx), sy(0.18), 0.18 * U, 0, 7); c.fill(); c.stroke(); }
  // fireflies (yellow-green) and the hero: white circle r 40 with a lavender-grey outline
  for (const [x, y] of [[5.0, 5.2], [7.8, 6.2], [9.6, 5.6], [11.4, 4.0], [13.6, 2.6], [8.8, 3.1]]) {
    c.fillStyle = 'rgba(220,255,120,.35)'; c.beginPath(); c.arc(sx(x), sy(y), 18, 0, 7); c.fill();
    c.fillStyle = '#d9f56a'; c.strokeStyle = '#8aa83a'; c.lineWidth = 2; c.beginPath(); c.arc(sx(x), sy(y), 9, 0, 7); c.fill(); c.stroke();
  }
  for (const [x, y] of [[6.4, 5.6], [12.2, 2.7]]) {
    c.fillStyle = '#ffffff'; c.strokeStyle = '#9d97b3'; c.lineWidth = 3; c.beginPath(); c.arc(sx(x), sy(y), 40, 0, 7); c.fill(); c.stroke();
    c.fillStyle = '#4a4560'; c.beginPath(); c.arc(sx(x) + 10, sy(y) - 6, 4, 0, 7); c.arc(sx(x) + 24, sy(y) - 6, 4, 0, 7); c.fill();
  }
  // flight band ticks (world y 1 and 7)
  c.fillStyle = '#ff00ff'; c.fillRect(0, sy(7), 14, 2); c.fillRect(0, sy(1), 14, 2);
}
`;
const page = (body, script) => `<!doctype html><html><body style="margin:0;background:#2a2a33;font:12px sans-serif;color:#ddd">${body}<script>${common}\n(async()=>{${script}\nwindow.DONE=1})().catch(e=>{console.log('ERR '+e);window.DONE=1});</script></body></html>`;
const CAM = { spring: 0, summer: 1500, autumn: 2900, winter: 4300 };

const jobs = {
  // each row: the tile drawn twice (x 0 and x 960) on the zone sky colour at 1/2 scale; then a 240-px window around the join at 4x
  seams: page(`<canvas id="c" width="1940" height="10"></canvas>`, `
    const c = document.getElementById('c').getContext('2d');
    const rows = [];
    for (const z of Z) for (const [l, h] of [['far', 300], ['near', 200], ['ground', 240]]) rows.push([z, 'levels/' + z + '/' + l + '.svg', h]);
    const zh = h => Math.min(h * 4, 480);
    c.canvas.height = rows.reduce((s, r) => s + Math.max(r[2] / 2, zh(r[2])) + 20, 10);
    const c2 = c.canvas.getContext('2d'); let y = 10;
    const tmp = document.createElement('canvas'); tmp.width = 1920; tmp.height = 300; const t = tmp.getContext('2d');
    for (const [z, f, h] of rows) {
      const im = await load(f);
      t.clearRect(0, 0, 1920, 300); const g = t.createLinearGradient(0, 0, 0, h); g.addColorStop(0, PAL[z].skyTop); g.addColorStop(1, PAL[z].skyBottom); t.fillStyle = g; t.fillRect(0, 0, 1920, h);
      t.drawImage(im, 0, 0); t.drawImage(im, 960, 0);
      c2.drawImage(tmp, 0, 0, 1920, h, 10, y, 960, h / 2); mark(c2, 490, y, 490, y + h / 2);
      // 4x zoom of x 900..1020 (120 src px -> 480), showing the bottom part of the tile where most detail is
      const H = zh(h), sh = H / 4, sy0 = h - sh;
      c2.imageSmoothingEnabled = false; c2.drawImage(tmp, 900, sy0, 120, sh, 1000, y, 480, H); c2.imageSmoothingEnabled = true;
      mark(c2, 1240, y, 1240, y + H); c2.fillStyle = '#fff'; c2.fillText(f, 14, y + 12);
      y += Math.max(h / 2, H) + 20;
    }`),
  scenes: page(`<canvas id="c" width="1930" height="1090"></canvas>`, `
    const c = document.getElementById('c').getContext('2d');
    const CAM = ${JSON.stringify(CAM)};
    for (let i = 0; i < 4; i++) { c.save(); c.translate((i % 2) * 970, Math.floor(i / 2) * 550); c.beginPath(); c.rect(0, 0, 960, 540); c.clip(); await scene(c, Z[i], CAM[Z[i]]); c.restore(); }`),
  parts: page(`<canvas id="c" width="1700" height="720"></canvas>`, `
    const c = document.getElementById('c').getContext('2d');
    const bgs = ['#2a2a33', PAL.spring.skyTop, '#ffffff', PAL.winter.skyBottom];
    for (let b = 0; b < 4; b++) { c.fillStyle = bgs[b]; c.fillRect(0, b * 180, 1700, 180); }
    for (let i = 0; i < PARTS.length; i++) {
      const im = await load('particles/' + PARTS[i] + '.svg');
      for (let b = 0; b < 4; b++) { const x = 10 + i * 150, y = b * 180 + 10; c.drawImage(im, x, y, 32, 32); c.drawImage(im, x, y + 40, 128, 128); }
    }`)
};
for (const z of Z) jobs['scene_' + z] = page(`<canvas id="c" width="960" height="540"></canvas>`, `
  const c = document.getElementById('c').getContext('2d'); await scene(c, '${z}', ${CAM[z]});`);

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
