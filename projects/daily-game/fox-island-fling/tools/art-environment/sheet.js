#!/usr/bin/env node
// Visual QA for Finn's Island Fling environment art (Playwright + Chromium, preinstalled).
// Renders into tests/out/art-environment/:
//   seams.png          far/near (per zone) and sea tiled twice side by side; the join (x 960) cropped at 4x, marked magenta
//   scene_<zone>.png   960x540 composed day scene (top) and night version (bottom: multiply #24305e @ 60% + light glows)
//   scenes.png         all four day scenes in a 2x2 grid (zone distinctness check)
//   parts.png          rock.svg alone + particles at 1x and 4x on dark / sky / white
// Composition (DESIGN §2 at 960x540, unit 60): sea surface y 468, rock top-left (0, 372) at 288x132,
// near bottom y 462, far bottom y 392, with parallax offsets; placeholder fox/leaves/raft/sling for contrast.
// Usage: node sheet.js [assetsDir] [outDir]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const A = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '../../tests/out/art-environment'));
fs.mkdirSync(OUT, { recursive: true });
const Z = ['cove', 'jungle', 'lagoon', 'lantern'];
const PARTS = ['sparkle', 'bubble', 'drop', 'ripple', 'star', 'firefly', 'petal', 'butterfly', 'puff', 'leafbit', 'glow'];
const PAL = JSON.parse(fs.readFileSync(path.join(A, 'levels/palette.json'), 'utf8'));

const common = `
const A = ${JSON.stringify('file://' + A)}, Z = ${JSON.stringify(Z)}, PARTS = ${JSON.stringify(PARTS)}, PAL = ${JSON.stringify(PAL)};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { console.log('MISSING ' + s); r(null); }; i.src = A + '/' + s; });
const mark = (c, x0, y0, x1, y1) => { c.save(); c.strokeStyle = '#ff00ff'; c.lineWidth = 1; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.restore(); };
function tileX(c, im, off, y, w, h, VW) { let x0 = -(((off % w) + w) % w); for (let x = x0; x < VW; x += w) c.drawImage(im, x, y, w, h); }
async function scene(c, z, o, night) {
  const VW = 960, VH = 540, U = 60, SEA = 468;
  const sky = await load('levels/' + z + '/sky.svg'), far = await load('levels/' + z + '/far.svg'), near = await load('levels/' + z + '/near.svg');
  const sea = await load('levels/sea.svg'), rock = await load('rock.svg'), glow = await load('particles/glow.svg');
  c.drawImage(sky, 0, 0, VW, VH);
  tileX(c, far, o.far, 392 - 300, 960, 300, VW);
  tileX(c, near, o.near, 462 - 200, 960, 200, VW);
  tileX(c, sea, o.sea, SEA - 20, 960, 240, VW);
  // rock: left edge world x 0, top surface (y 40) at world y 1.2
  const rs = U / 100; c.drawImage(rock, 0, SEA - 1.2 * U - 40 * rs, 480 * rs, 220 * rs);
  const sx = x => x * U, sy = y => SEA - y * U;
  // placeholder sling (Y fork) at world (2.3, 2.9), base on the rock top
  c.lineCap = 'round'; c.strokeStyle = '#6b4a2f'; c.lineWidth = 12;
  c.beginPath(); c.moveTo(sx(2.3), sy(1.2)); c.lineTo(sx(2.3), sy(2.3)); c.moveTo(sx(2.3), sy(2.3)); c.lineTo(sx(1.85), sy(3.0)); c.moveTo(sx(2.3), sy(2.3)); c.lineTo(sx(2.75), sy(3.0)); c.stroke();
  c.strokeStyle = '#a5784c'; c.lineWidth = 7; c.stroke();
  // placeholder fox (orange circle) on an arc, leaves (bright green), raft
  const fox = [[6.4, 5.6]], leaves = [[4.6, 5.0], [5.6, 5.7], [8.0, 6.1], [9.6, 5.6], [11.2, 4.4], [7.2, 3.6]];
  for (const [x, y] of leaves) { c.save(); c.translate(sx(x), sy(y)); c.rotate(-0.6); c.fillStyle = '#5fd35a'; c.strokeStyle = '#2f8a32'; c.lineWidth = 3; c.beginPath(); c.ellipse(0, 0, 0.36 * U, 0.18 * U, 0, 0, 7); c.fill(); c.stroke(); c.restore(); }
  for (const [x, y] of fox) { c.fillStyle = '#f08a2c'; c.strokeStyle = '#a5531a'; c.lineWidth = 3; c.beginPath(); c.arc(sx(x), sy(y), 0.55 * U, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#fff1dc'; c.beginPath(); c.arc(sx(x) + 12, sy(y) + 8, 0.25 * U, 0, 7); c.fill(); }
  c.fillStyle = '#b07a4a'; c.strokeStyle = '#7a5030'; c.lineWidth = 3; c.beginPath(); c.roundRect(sx(12.4), sy(0.35), 3 * U, 0.5 * U, 8); c.fill(); c.stroke();
  if (night) {
    c.save(); c.globalCompositeOperation = 'multiply'; c.globalAlpha = 0.6; c.fillStyle = '#24305e'; c.fillRect(0, 0, VW, VH); c.restore();
    // what the renderer can do with palette.lights: additive glows on the light spots
    c.save(); c.globalCompositeOperation = 'lighter';
    const L = PAL[z].lights || { near: [], far: [] };
    const put = (arr, off, y0) => { for (const [x, y, r] of arr) for (let k = -1; k <= 1; k++) { const X = x - (((off % 960) + 960) % 960) + k * 960; if (X < -40 || X > 1000) continue; c.globalAlpha = 0.55; c.drawImage(glow, X - r * 1.4, y0 + y - r * 1.4, r * 2.8, r * 2.8); } };
    put(L.near, o.near, 262); put(L.far, o.far, 92);
    c.restore();
  }
}
`;
const page = (body, script) => `<!doctype html><html><body style="margin:0;background:#2a2a33;font:12px sans-serif;color:#ddd">${body}<script>${common}\n(async()=>{${script}\nwindow.DONE=1})().catch(e=>{console.log('ERR '+e);window.DONE=1});</script></body></html>`;
const OFF = { cove: { far: 0, near: 0, sea: 0 }, jungle: { far: 140, near: 120, sea: 300 }, lagoon: { far: 380, near: 600, sea: 500 }, lantern: { far: 700, near: 30, sea: 100 } };

const jobs = {
  // each row: the tile drawn twice (x 0 and x 960) at 1x on the zone sky colour; then a 120-px window around the join at 4x
  seams: page(`<canvas id="c" width="1940" height="10"></canvas>`, `
    const c = document.getElementById('c').getContext('2d');
    const rows = [];
    for (const z of Z) { rows.push([z, 'levels/' + z + '/far.svg', 300]); rows.push([z, 'levels/' + z + '/near.svg', 200]); }
    rows.push(['cove', 'levels/sea.svg', 240]);
    let H = 0; for (const r of rows) H += r[2] / 2 + 10 + 0; c.canvas.height = rows.reduce((s, r) => s + Math.max(r[2] / 2, r[2] * 2 > 600 ? 600 : r[2] * 2) + 20, 0);
    const c2 = c.canvas.getContext('2d'); let y = 10;
    const tmp = document.createElement('canvas'); tmp.width = 1920; tmp.height = 300; const t = tmp.getContext('2d');
    for (const [z, f, h] of rows) {
      const im = await load(f);
      t.clearRect(0, 0, 1920, 300); const g = t.createLinearGradient(0, 0, 0, h); g.addColorStop(0, PAL[z].skyTop); g.addColorStop(1, PAL[z].skyBottom); t.fillStyle = g; t.fillRect(0, 0, 1920, h);
      t.drawImage(im, 0, 0); t.drawImage(im, 960, 0);
      c2.drawImage(tmp, 0, 0, 1920, h, 10, y, 960, h / 2); mark(c2, 490, y, 490, y + h / 2);
      const zh = Math.min(h * 2, 600), zw = 960; // 4x of a 240 x h/2 window... show x 900..1020 at 4x -> 480 wide; use 960 px -> 240 src px
      c2.imageSmoothingEnabled = false; c2.drawImage(tmp, 840, 0, 240, h, 980, y, 960, h * 4 > zh ? zh : h * 4); c2.imageSmoothingEnabled = true;
      mark(c2, 1460, y, 1460, y + zh); c2.fillStyle = '#fff'; c2.fillText(f, 14, y + 12);
      y += Math.max(h / 2, zh) + 20;
    }`),
  scenes: page(`<canvas id="c" width="1930" height="1090"></canvas>`, `
    const c = document.getElementById('c').getContext('2d');
    const OFF = ${JSON.stringify(OFF)};
    for (let i = 0; i < 4; i++) { c.save(); c.translate((i % 2) * 970, Math.floor(i / 2) * 550); c.beginPath(); c.rect(0, 0, 960, 540); c.clip(); await scene(c, Z[i], OFF[Z[i]], false); c.restore(); }`),
  parts: page(`<canvas id="c" width="1700" height="820"></canvas>`, `
    const c = document.getElementById('c').getContext('2d');
    const bgs = ['#2a2a33', '#9fd0e8', '#ffffff'];
    for (let b = 0; b < 3; b++) { c.fillStyle = bgs[b]; c.fillRect(0, b * 180, 1700, 180); }
    for (let i = 0; i < PARTS.length; i++) {
      const im = await load('particles/' + PARTS[i] + '.svg');
      for (let b = 0; b < 3; b++) { const x = 10 + i * 150, y = b * 180 + 10; c.drawImage(im, x, y, 32, 32); c.drawImage(im, x, y + 40, 128, 128); }
    }
    const rock = await load('rock.svg'); c.fillStyle = '#9fd0e8'; c.fillRect(0, 550, 1700, 270); c.drawImage(rock, 10, 580);
    c.fillStyle = 'rgba(40,140,170,.5)'; c.fillRect(0, 580 + 160, 520, 80);
    mark(c, 0, 620, 520, 620); mark(c, 240, 560, 240, 820);`)
};
for (const z of Z) jobs['scene_' + z] = page(`<canvas id="c" width="960" height="1090"></canvas>`, `
  const c = document.getElementById('c').getContext('2d'); const o = ${JSON.stringify(OFF[z])};
  await scene(c, '${z}', o, false);
  c.save(); c.translate(0, 550); c.beginPath(); c.rect(0, 0, 960, 540); c.clip(); await scene(c, '${z}', o, true); c.restore();`);

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
