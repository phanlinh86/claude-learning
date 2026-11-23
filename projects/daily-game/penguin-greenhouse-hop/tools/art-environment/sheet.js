#!/usr/bin/env node
// Visual QA for Puddle's Greenhouse Hop environment art (Playwright + Chromium, preinstalled).
// Renders into tests/out/art/ (gitignored):
//   sky_<f>.png        sky.svg tiled 2x horizontally at full size, seam marked magenta at x 960
//   far_seams.png      each far.svg tiled 2x2 (half scale) over its sky gradient, seams marked
//   scene_<f>.png      960x540 composed scene: sky, far (parallax offset), poles at the column edges,
//                      a beam, placeholder platforms (terracotta pots / green leaf), penguin blob, fireflies;
//                      second panel with a different camera/parallax offset
//   scene_ground.png   the start scene: potting sky + ground.svg + poles + penguin on the floor
//   scene_portrait.png all four floors at 560x1000 (portrait cover-fit)
//   pole_beam.png      pole tiled 3x vertically and beam tiled 2x horizontally (seams marked)
//   particles.png      every particle at 1x and 4x on dark, sky and white backgrounds
// Usage: node sheet.js [assetsDir] [outDir]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const A = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '../../tests/out/art'));
fs.mkdirSync(OUT, { recursive: true });
const FL = ['potting', 'fern', 'balcony', 'roof'];
const PARTS = ['raindrop', 'drip', 'splash', 'mist', 'petal', 'leafbit', 'sparkle', 'glow', 'soil', 'puff', 'bubble'];
const PAL = JSON.parse(fs.readFileSync(path.join(A, 'levels/palette.json'), 'utf8'));

const common = `
const A = ${JSON.stringify('file://' + A)}, FL = ${JSON.stringify(FL)}, PARTS = ${JSON.stringify(PARTS)}, PAL = ${JSON.stringify(PAL)};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { console.log('MISSING ' + s); r(null); }; i.src = A + '/' + s; });
const mark = (c, x0, y0, x1, y1) => { c.save(); c.strokeStyle = '#ff00ff'; c.globalAlpha = .6; c.lineWidth = 1; c.setLineDash([4, 10]); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.restore(); };
function rr(c, x, y, w, h, r, fill, stroke) { c.beginPath(); c.roundRect(x, y, w, h, r); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 3; c.stroke(); } }
// one composed scene (the renderer's mapping: unit = VH/11.5 landscape, VW/12.8 portrait)
async function scene(c, fl, VW, VH, o) {
  const sky = await load('levels/' + fl + '/sky.svg'), far = await load('levels/' + fl + '/far.svg');
  const pole = await load('levels/pole.svg'), beam = await load('levels/beam.svg'), ground = await load('levels/ground.svg');
  const portrait = VH > VW, unit = portrait ? VW / 12.8 : VH / 11.5, colX = VW / 2 - 6 * unit, camY = o.camY;
  const sx = x => colX + x * unit, sy = y => VH - (y - camY) * unit;
  // sky cover-fit (parallax 0.02 is negligible)
  const s = Math.max(VW / 960, VH / 540), sw = 960 * s, sh = 540 * s;
  c.drawImage(sky, (VW - sw) / 2, (VH - sh) / 2, sw, sh);
  // far: tile both ways at the view scale, offset by the parallax (0.25 of the camera travel)
  const fs = VH / 540 * (portrait ? 0.75 : 1), fw = 960 * fs, fh = 1080 * fs;
  const off = ((camY * unit * 0.25) % fh + fh) % fh;
  for (let y = off - fh; y < VH; y += fh) for (let x = (VW - fw) / 2 - fw; x < VW; x += fw) c.drawImage(far, x, y, fw, fh);
  if (PAL[fl].tint) { c.fillStyle = PAL[fl].tint; c.fillRect(0, 0, VW, VH); }
  // ground (only in the start scene): ground line y 330 -> world y 0
  const gs = unit * 12 / 564, gLine = sy(0);
  if (o.ground) { const gw = 1280 * gs, gh = 420 * gs; c.drawImage(ground, VW / 2 - gw / 2, gLine - 330 * gs, gw, gh); c.fillStyle = '#8f6c5f'; c.fillRect(0, gLine - 330 * gs + gh - 1, VW, VH); }
  // beam across the view at world y = o.beam (decorative)
  if (o.beam != null) { const bh = 48 * VH / 540 * (portrait ? 0.6 : 1), bw = 960 * bh / 48, by = sy(o.beam) - bh * 0.3; for (let x = -((camY * 0) % bw); x < VW; x += bw) c.drawImage(beam, x, by, bw, bh); }
  // poles at the column edges (tiled vertically, parallax 1)
  const pw = Math.round(0.9 * unit), ph = Math.round(pw * 256 / 48);
  const lim = o.ground ? gLine : VH; c.save(); c.beginPath(); c.rect(0, 0, VW, lim); c.clip();
  for (const px of [colX, colX + 12 * unit]) for (let y = Math.round(gLine % ph) - ph; y < lim; y += ph) c.drawImage(pole, px - pw / 2, y, pw, ph);
  c.restore();
  // placeholder platforms
  for (const p of o.plats) {
    const x = sx(p.x - p.w / 2), y = sy(p.y), w = p.w * unit;
    if (p.k === 'pot') { c.beginPath(); c.moveTo(x + 6, y + 6); c.lineTo(x + w - 6, y + 6); c.lineTo(x + w - 0.25 * w, y + 0.9 * unit); c.lineTo(x + 0.25 * w, y + 0.9 * unit); c.closePath(); c.fillStyle = '#d9774a'; c.fill(); c.strokeStyle = '#7a3f25'; c.lineWidth = 3; c.stroke(); rr(c, x, y - 4, w, 12, 4, '#f09a6c', '#7a3f25'); }
    if (p.k === 'shelf') rr(c, x, y - 3, w, 0.36 * unit, 5, '#b98552', '#5e4330');
    if (p.k === 'leaf') { c.beginPath(); c.ellipse(x + w / 2, y + 0.12 * unit, w / 2, 0.22 * unit, 0, 0, 7); c.fillStyle = '#5cc35a'; c.fill(); c.strokeStyle = '#2f7a37'; c.lineWidth = 3; c.stroke(); c.strokeStyle = '#f3f7da'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 8, y + 0.12 * unit); c.lineTo(x + w - 8, y + 0.12 * unit); c.stroke(); }
  }
  // fireflies
  for (const [fx, fy] of o.flies || []) {
    const X = sx(fx), Y = sy(fy), g = c.createRadialGradient(X, Y, 0, X, Y, 0.4 * unit);
    g.addColorStop(0, 'rgba(255,242,122,.95)'); g.addColorStop(1, 'rgba(255,242,122,0)');
    c.fillStyle = g; c.beginPath(); c.arc(X, Y, 0.4 * unit, 0, 7); c.fill();
    c.fillStyle = '#ffb627'; c.beginPath(); c.arc(X, Y, 0.11 * unit, 0, 7); c.fill();
  }
  // penguin stand-in: slate-blue ball, white belly, coral collar, orange beak/feet
  const px = sx(o.hero[0]), r = 0.62 * unit, py = sy(o.hero[1]) - r;
  c.fillStyle = '#ff9f1c'; c.beginPath(); c.ellipse(px - 0.2 * unit, py + r, 0.16 * unit, 0.07 * unit, 0, 0, 7); c.ellipse(px + 0.2 * unit, py + r, 0.16 * unit, 0.07 * unit, 0, 0, 7); c.fill();
  c.fillStyle = '#33476e'; c.strokeStyle = '#1a2440'; c.lineWidth = 3; c.beginPath(); c.arc(px, py, r, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#fbfdff'; c.beginPath(); c.ellipse(px + 0.1 * unit, py + 0.12 * unit, 0.42 * unit, 0.46 * unit, 0, 0, 7); c.fill();
  c.fillStyle = '#ff5d73'; c.strokeStyle = '#9e2a40'; c.beginPath(); c.ellipse(px, py - 0.2 * unit, 0.6 * unit, 0.13 * unit, 0, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#1e1a33'; c.beginPath(); c.arc(px + 0.25 * unit, py - 0.42 * unit, 0.08 * unit, 0, 7); c.fill();
  c.fillStyle = '#ff9f1c'; c.beginPath(); c.moveTo(px + 0.42 * unit, py - 0.36 * unit); c.lineTo(px + 0.72 * unit, py - 0.3 * unit); c.lineTo(px + 0.42 * unit, py - 0.22 * unit); c.fill();
}
const PLATS = [
  { k: 'pot', x: 3.0, y: 2.0, w: 2.4 }, { k: 'shelf', x: 7.5, y: 3.8, w: 1.7 }, { k: 'leaf', x: 4.5, y: 5.7, w: 2.2 },
  { k: 'pot', x: 8.8, y: 7.4, w: 2.4 }, { k: 'leaf', x: 5.6, y: 9.1, w: 2.2 }, { k: 'shelf', x: 1.6, y: 10.4, w: 1.7 },
  { k: 'pot', x: 10.0, y: 1.0, w: 2.4 }, { k: 'pot', x: 9.4, y: 12.6, w: 2.4 }, { k: 'leaf', x: 3.2, y: 14.4, w: 2.2 }];
const FLIES = [[5.6, 4.6], [6.2, 5.0], [6.8, 4.8], [8.2, 9.8], [8.8, 10.3], [4, 12.6], [4.6, 13]];
const lift = (d) => ({ plats: PLATS.map(p => ({ ...p, y: p.y + d })), flies: FLIES.map(([x, y]) => [x, y + d]) });
`;

const page = (body, script) => `<!doctype html><html><body style="margin:0;background:#2a2a33;font:12px sans-serif;color:#ddd">${body}<script>${common}\n(async()=>{${script}\nwindow.DONE=1})().catch(e=>{console.log('ERR '+e);window.DONE=1});</script></body></html>`;

const jobs = {};
for (const fl of FL) jobs['sky_' + fl] = page(`<canvas id="c" width="1920" height="540"></canvas>`, `
  const c = document.getElementById('c').getContext('2d'), im = await load('levels/${fl}/sky.svg');
  c.drawImage(im, 0, 0); c.drawImage(im, 960, 0); mark(c, 960, 0, 960, 30); mark(c, 960, 510, 960, 540);`);
jobs.far_seams = page(`<canvas id="c" width="1950" height="2190"></canvas>`, `
  const c = document.getElementById('c').getContext('2d');
  for (let i = 0; i < 4; i++) {
    const fl = FL[i], bx = 10 + (i % 2) * 970, by = 10 + Math.floor(i / 2) * 1090, im = await load('levels/' + fl + '/far.svg');
    const g = c.createLinearGradient(0, by, 0, by + 1080); g.addColorStop(0, PAL[fl].skyTop); g.addColorStop(1, PAL[fl].skyBottom);
    c.fillStyle = g; c.fillRect(bx, by, 960, 1080);
    for (let ty = 0; ty < 2; ty++) for (let tx = 0; tx < 2; tx++) c.drawImage(im, bx + tx * 480, by + ty * 540, 480, 540);
    mark(c, bx + 480, by, bx + 480, by + 20); mark(c, bx, by + 540, bx + 20, by + 540);
    c.fillStyle = '#000'; c.fillText(fl, bx + 6, by + 14);
  }`);
for (const [i, fl] of FL.entries()) jobs['scene_' + fl] = page(`<canvas id="c" width="960" height="1100"></canvas>`, `
  const c = document.getElementById('c').getContext('2d');
  await scene(c, '${fl}', 960, 540, { camY: ${30 + i * 50}, beam: ${30 + i * 50 + 6.5}, ...lift(${30 + i * 50}), hero: [6.0, ${30 + i * 50 + 3.0}] });
  c.save(); c.translate(0, 560); c.beginPath(); c.rect(0, 0, 960, 540); c.clip();
  await scene(c, '${fl}', 960, 540, { camY: ${47 + i * 50}, ...lift(${47 + i * 50}), hero: [7.6, ${47 + i * 50 + 7.8}] });
  c.restore();`);
jobs.scene_ground = page(`<canvas id="c" width="960" height="540"></canvas>`, `
  const c = document.getElementById('c').getContext('2d');
  await scene(c, 'potting', 960, 540, { camY: -1.4, ground: true, plats: PLATS.filter(p => p.y > 1.5), flies: FLIES, hero: [6.0, 0] });`);
jobs.scene_portrait = page(`<canvas id="c" width="2300" height="1000"></canvas>`, `
  const c = document.getElementById('c').getContext('2d');
  for (let i = 0; i < 4; i++) {
    c.save(); c.translate(i * 580, 0); c.beginPath(); c.rect(0, 0, 560, 1000); c.clip();
    if (i === 0) await scene(c, 'potting', 560, 1000, { camY: -1.4, ground: true, plats: PLATS, flies: FLIES, hero: [6, 0] });
    else await scene(c, FL[i], 560, 1000, { camY: 40 * i, beam: 40 * i + 12, ...lift(40 * i), hero: [6, 40 * i + 3] });
    c.restore();
  }`);
jobs.pole_beam = page(`<canvas id="c" width="1960" height="820"></canvas>`, `
  const c = document.getElementById('c').getContext('2d'); c.fillStyle = PAL.fern.skyTop; c.fillRect(0, 0, 1960, 820);
  const p = await load('levels/pole.svg');
  for (let j = 0; j < 3; j++) { c.drawImage(p, 20, j * 256, 48, 256); c.drawImage(p, 100, j * 256, 96, 512 / 2 * 1); }
  for (let j = 1; j < 3; j++) mark(c, 0, j * 256, 220, j * 256);
  const bm = await load('levels/beam.svg');
  c.drawImage(bm, 0, 300 + 0, 960, 48); c.drawImage(bm, 960, 300, 960, 48); mark(c, 960, 280, 960, 300);
  c.save(); c.translate(-480, 400); c.scale(2, 2); c.drawImage(bm, 0, 0); c.drawImage(bm, 960, 0); c.restore(); mark(c, 1440, 380, 1440, 400);`);
jobs.particles = page(`<canvas id="c" width="1600" height="760"></canvas>`, `
  const c = document.getElementById('c').getContext('2d');
  const bgs = ['#2a2a33', PAL.balcony.skyTop, '#ffffff', PAL.fern.skyTop];
  for (let b = 0; b < 4; b++) { c.fillStyle = bgs[b]; c.fillRect(0, b * 190, 1600, 190); }
  for (let i = 0; i < PARTS.length; i++) {
    const im = await load('particles/' + PARTS[i] + '.svg'), w = im.naturalWidth, h = im.naturalHeight;
    for (let b = 0; b < 4; b++) {
      const x = 10 + i * 144, y = b * 190 + 10;
      c.drawImage(im, x, y, w, h); c.drawImage(im, x, y + 40, w * 4, h * 4);
      if (b === 0) { c.fillStyle = '#ddd'; c.fillText(PARTS[i], x + 40, y + 12); }
    }
  }`);

(async () => {
  const browser = await chromium.launch();
  const pg = await browser.newPage({ viewport: { width: 2400, height: 2300 } });
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
