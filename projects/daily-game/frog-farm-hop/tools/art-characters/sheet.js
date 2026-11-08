// Contact sheets for Clover's Farm Hop characters & items (QA loop).
// Usage: node tools/art-characters/sheet.js [assetDir] [outDir]
// Writes tests/out/art/characters_ingame.png, characters_4x.png, clover_frames.png and validates every SVG.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DIR = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || path.join(__dirname, '../../tests/out/art');

const VB = {
  clover_idle: [128, 128], clover_crouch: [128, 128], clover_up: [128, 128], clover_fall: [128, 128], clover_ouch: [128, 128], clover_happy: [128, 128],
  firefly_0: [64, 64], firefly_1: [64, 64], hay: [192, 96], plank: [160, 48], cart: [224, 128], wheel: [48, 48], puff: [192, 96],
  spring: [64, 80], spring_up: [64, 80], trampoline: [256, 96], heart: [48, 48], heart_empty: [48, 48], jar: [64, 64], vane: [96, 96], icon: [256, 256],
};
// validation (DESIGN §3)
const errs = [];
for (const [n, [w, h]] of Object.entries(VB)) {
  const f = `${DIR}/${n}.svg`;
  if (!fs.existsSync(f)) { errs.push(n + ': missing'); continue; }
  const s = fs.readFileSync(f, 'utf8');
  const head = s.match(/<svg[^>]*>/)[0];
  if (!head.includes(`viewBox="0 0 ${w} ${h}"`) || !head.includes(`width="${w}"`) || !head.includes(`height="${h}"`)) errs.push(n + ': size/viewBox');
  if (/<text|<image|<script|xlink:href|href="http|@import|font-family/i.test(s)) errs.push(n + ': forbidden content');
  const ids = [...s.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  if (new Set(ids).size !== ids.length) errs.push(n + ': duplicate ids');
}
if (errs.length) { console.error('VALIDATION FAILED\n' + errs.join('\n')); process.exitCode = 1; } else console.log('validation ok (' + Object.keys(VB).length + ' files)');

const uri = n => 'data:image/svg+xml;base64,' + fs.readFileSync(`${DIR}/${n}.svg`).toString('base64');
const img = (n, w, st = '') => `<img src="${uri(n)}" width="${w}" height="${(w * VB[n][1] / VB[n][0]).toFixed(1)}" style="${st}">`;
// in-game sizes: unit ≈ 47 px (landscape 540/11.5); Clover 1.35·unit ≈ 64; firefly 0.75·unit ≈ 36; platforms by width
const U = 47;
const SIZE = { clover: 64, firefly: 36, hay: 2.4 * U, plank: 1.7 * U, cart: 2.3 * U, puff: 2.1 * U, spring: 0.55 * U, spring_up: 0.55 * U,
  trampoline: 3 * U, heart: 28, heart_empty: 28, jar: 40, vane: 64, icon: 64, wheel: 0.38 * 2.3 * U };
const sz = n => SIZE[n] || SIZE[n.split('_')[0]];
const BGS = [['sunny', '#cfeeff'], ['rain', '#b8c8c4'], ['wind', '#ffe1ad'], ['snow (dark)', '#5a4f7a']];
const CL = ['clover_idle', 'clover_crouch', 'clover_up', 'clover_fall', 'clover_ouch', 'clover_happy'];
const css = `<style>body{margin:0;background:#777;font:12px sans-serif}.p{display:flex;flex-wrap:wrap;gap:18px;padding:14px;align-items:flex-end}
.lab{position:absolute;left:6px;top:4px;color:#0007}.r{position:relative}.dk .lab{color:#fff9}.box{outline:1px dashed #0003}</style>`;

// cart with its wheels at (56,104) & (168,104), wheel size 0.38·width
const cartW = (w) => { const k = w / 224, ws = 0.38 * w;
  return `<span style="position:relative;display:inline-block;width:${w}px;height:${(128 + 24) * k}px">` +
    [56, 168].map(cx => `<img src="${uri('wheel')}" width="${ws}" height="${ws}" style="position:absolute;left:${cx * k - ws / 2}px;top:${104 * k - ws / 2}px">`).join('') +
    `<img src="${uri('cart')}" width="${w}" height="${128 * k}" style="position:absolute;left:0;top:0"></span>`; };
// hay bale with spring on top (spring base y78 on hay top y14)
const haySpring = (w) => { const k = w / 192, sw = 0.55 * U * (w / (2.4 * U)), sh = sw * 80 / 64;
  return `<span style="position:relative;display:inline-block;width:${w}px;height:${96 * k + sh}px">` +
    `<img src="${uri('hay')}" width="${w}" height="${96 * k}" style="position:absolute;left:0;top:${sh}px">` +
    `<img src="${uri('spring')}" width="${sw}" height="${sh}" style="position:absolute;left:${w / 2 - sw / 2}px;top:${sh + 14 * k - sh * 78 / 80}px"></span>`; };
// mini scene: Clover's feet (y118 of 128) on a platform top
const onPlat = (plat, top, vbW, vbH, w, frame = 'clover_idle') => { const k = w / vbW, cs = 64;
  return `<span style="position:relative;display:inline-block;width:${w}px;height:${vbH * k + cs}px">` +
    `<img src="${uri(plat)}" width="${w}" height="${vbH * k}" style="position:absolute;left:0;top:${cs}px">` +
    `<img src="${uri(frame)}" width="${cs}" height="${cs}" style="position:absolute;left:${w / 2 - cs / 2}px;top:${cs + top * k - cs * 118 / 128}px"></span>`; };

function inGame() {
  return BGS.map(([name, bg], i) => `<div class="p r ${i === 3 ? 'dk' : ''}" style="background:${bg}"><span class="lab">${name} — in-game size</span>` +
    CL.map(n => img(n, 64)).join('') + img('firefly_0', 36) + img('firefly_1', 36) +
    img('hay', sz('hay')) + img('plank', sz('plank')) + cartW(sz('cart')) + img('puff', sz('puff')) + haySpring(sz('hay')) +
    img('spring_up', sz('spring')) + img('trampoline', sz('trampoline')) +
    img('heart', 28) + img('heart', 28) + img('heart_empty', 28) + img('jar', 40) + img('vane', 64) + img('icon', 32) + img('icon', 64) +
    onPlat('hay', 14, 192, 96, sz('hay')) + onPlat('puff', 18, 192, 96, sz('puff'), 'clover_crouch') + onPlat('plank', 8, 160, 48, sz('plank'), 'clover_happy') +
    `<span style="display:inline-block;position:relative;width:120px;height:90px">` +
    [[10, 10], [44, 30], [80, 8], [60, 54]].map(([x, y], j) => `<img src="${uri('firefly_' + (j % 2))}" width="36" height="36" style="position:absolute;left:${x}px;top:${y}px">`).join('') +
    `</span></div>`).join('');
}
function four() {
  return [BGS[0], BGS[3]].map(([name, bg], i) => `<div class="p r ${i ? 'dk' : ''}" style="background:${bg}"><span class="lab">${name} — 4×</span>` +
    CL.map(n => img(n, 256, 'outline:1px dashed #0003')).join('') + img('firefly_0', 144, 'outline:1px dashed #0003') + img('firefly_1', 144, 'outline:1px dashed #0003') +
    img('hay', 384, 'outline:1px dashed #0003') + img('plank', 320, 'outline:1px dashed #0003') + cartW(448) + img('wheel', 144, 'outline:1px dashed #0003') +
    img('puff', 384, 'outline:1px dashed #0003') + img('spring', 128, 'outline:1px dashed #0003') + img('spring_up', 128, 'outline:1px dashed #0003') +
    img('trampoline', 512, 'outline:1px dashed #0003') + img('heart', 112) + img('heart_empty', 112) + img('jar', 160, 'outline:1px dashed #0003') +
    img('vane', 192, 'outline:1px dashed #0003') + img('icon', 256) + `</div>`).join('');
}
// frames strip with guides: feet line y=118, body centre (64,74), head ellipse outline
function frames() {
  const s = 256, k = s / 128;
  const guide = `<svg style="position:absolute;left:0;top:0" width="${s}" height="${s}" viewBox="0 0 128 128">` +
    `<line x1="0" x2="128" y1="118" y2="118" stroke="red" stroke-width=".6"/>` +
    `<line x1="64" x2="64" y1="0" y2="128" stroke="#00f" stroke-width=".4" stroke-dasharray="2 2"/>` +
    `<circle cx="64" cy="74" r="1.6" fill="#00f"/><ellipse cx="66" cy="58" rx="40" ry="26" fill="none" stroke="#f0f" stroke-width=".4"/></svg>`;
  return `<div class="p r" style="background:#cfeeff;gap:0"><span class="lab">frames 2× with feet line y=118 (red), body centre (64,74), head ellipse (magenta)</span>` +
    CL.map(n => `<span style="position:relative;display:inline-block;width:${s}px;height:${s}px;outline:1px solid #0002">${img(n, s)}${guide}</span>`).join('') + `</div>` +
    `<div class="p r" style="background:#b8c8c4;gap:0">` + CL.map(n => img(n, 96)).join('') + '<span style="width:30px"></span>' +
    ['clover_idle', 'clover_crouch', 'clover_up', 'clover_fall', 'clover_crouch', 'clover_up'].map(n => img(n, 64)).join('') + `</div>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 400 } });
  for (const [file, html] of [['characters_ingame.png', inGame()], ['characters_4x.png', four()], ['clover_frames.png', frames()]]) {
    await page.setContent(`<!doctype html><html><head>${css}</head><body>${html}</body></html>`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log('wrote', path.join(OUT, file));
  }
  await browser.close();
})();
