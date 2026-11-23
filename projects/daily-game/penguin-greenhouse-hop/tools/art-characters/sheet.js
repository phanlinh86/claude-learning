// Contact sheets for Puddle's Greenhouse Hop characters & items (QA loop).
// Usage: node tools/art-characters/sheet.js [assetDir] [outDir]
// Writes tests/out/art/characters_ingame.png, characters_4x.png, puddle_frames.png and validates every SVG.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DIR = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || path.join(__dirname, '../../tests/out/art');

const PU = ['puddle_idle', 'puddle_crouch', 'puddle_up', 'puddle_fall', 'puddle_ouch', 'puddle_happy'];
const VB = {
  ...Object.fromEntries(PU.map(n => [n, [128, 128]])),
  firefly_0: [64, 64], firefly_1: [64, 64], pot: [192, 96], shelf: [160, 48], leaf: [192, 64], basket: [160, 112],
  mushroom: [64, 80], mushroom_up: [64, 80], umbrella: [256, 112], heart: [48, 48], heart_empty: [48, 48], jar: [64, 64], grow: [64, 64], icon: [256, 256],
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
  for (const m of s.matchAll(/stdDeviation="([\d.]+)"/g)) if (+m[1] > 3) errs.push(n + ': blur > 3');
  const ids = [...s.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  if (new Set(ids).size !== ids.length) errs.push(n + ': duplicate ids');
}
if (errs.length) { console.error('VALIDATION FAILED\n' + errs.join('\n')); process.exitCode = 1; } else console.log('validation ok (' + Object.keys(VB).length + ' files)');

const uri = n => 'data:image/svg+xml;base64,' + fs.readFileSync(`${DIR}/${n}.svg`).toString('base64');
const img = (n, w, st = '') => `<img src="${uri(n)}" width="${w}" height="${(w * VB[n][1] / VB[n][0]).toFixed(1)}" style="${st}">`;
// in-game sizes: unit ≈ 47 px (landscape 540/11.5); Puddle 1.35·unit ≈ 64; firefly 0.75·unit ≈ 36; platforms by width
const U = 47;
const SIZE = { puddle: 1.35 * U, firefly: 0.75 * U, pot: 2.4 * U, shelf: 1.7 * U, leaf: 2.2 * U, basket: 2.0 * U, mushroom: 0.6 * U, mushroom_up: 0.6 * U,
  umbrella: 3 * U, heart: 28, heart_empty: 28, jar: 40, grow: 40, icon: 64 };
const sz = n => SIZE[n] || SIZE[n.split('_')[0]];
const BGS = [['light', '#f4f6f8'], ['potting', '#a9bcc9'], ['fern', '#9cc9b4'], ['balcony', '#a7a9c9'], ['roof (dark)', '#8d86c2']];
const css = `<style>body{margin:0;background:#777;font:12px sans-serif}.p{display:flex;flex-wrap:wrap;gap:18px;padding:22px 14px 14px;align-items:flex-end}
.lab{position:absolute;left:6px;top:4px;color:#0008}.r{position:relative}.dk .lab{color:#fffb}</style>`;
const DASH = 'outline:1px dashed #0003';

// Puddle standing on a platform: feet line y118/128 on the platform's top anchor
const onPlat = (plat, top, w, frame = 'puddle_idle', size = 1) => {
  const [vbW, vbH] = VB[plat], k = w / vbW, cs = sz('puddle') * size;
  return `<span style="position:relative;display:inline-block;width:${Math.max(w, cs)}px;height:${vbH * k + cs}px">` +
    `<img src="${uri(plat)}" width="${w}" height="${vbH * k}" style="position:absolute;left:0;top:${cs}px">` +
    `<img src="${uri(frame)}" width="${cs}" height="${cs}" style="position:absolute;left:${w / 2 - cs / 2}px;top:${cs + top * k - cs * 118 / 128}px"></span>`; };
// pot with a mushroom on its rim (mushroom base y78 on pot rim y14)
const potShroom = (w, frame = 'mushroom') => { const k = w / 192, mw = sz('mushroom'), mh = mw * 80 / 64;
  return `<span style="position:relative;display:inline-block;width:${w}px;height:${96 * k + mh}px">` +
    `<img src="${uri('pot')}" width="${w}" height="${96 * k}" style="position:absolute;left:0;top:${mh}px">` +
    `<img src="${uri(frame)}" width="${mw}" height="${mh}" style="position:absolute;left:${w / 2 - mw / 2}px;top:${mh + 14 * k - mh * 78 / 80}px"></span>`; };
// basket with a chain from a pivot above, as the renderer would draw it
const basketChain = (w) => { const k = w / 160, ch = 50;
  return `<span style="position:relative;display:inline-block;width:${w}px;height:${112 * k + ch}px">` +
    `<svg style="position:absolute;left:0;top:0" width="${w}" height="${ch + 24 * k}"><path d="M${w / 2},2 L${22 * k},${ch + 24 * k} M${w / 2},2 L${w / 2},${ch + 24 * k} M${w / 2},2 L${138 * k},${ch + 24 * k}" stroke="#5a5f73" stroke-width="1.6" fill="none"/></svg>` +
    `<img src="${uri('basket')}" width="${w}" height="${112 * k}" style="position:absolute;left:0;top:${ch}px"></span>`; };
// leaf bent about its stem (4,20)
const leafBent = (w, deg, mirror = false) => { const k = w / 192;
  return `<span style="display:inline-block;width:${w}px;height:${64 * k + 20}px;padding-top:10px">` +
    `<img src="${uri('leaf')}" width="${w}" height="${64 * k}" style="transform-origin:${4 * k}px ${20 * k}px;transform:${mirror ? 'scaleX(-1) ' : ''}rotate(${deg}deg)"></span>`; };

function inGame() {
  return BGS.map(([name, bg], i) => `<div class="p r ${i === 4 ? 'dk' : ''}" style="background:${bg}"><span class="lab">${name} ${bg} — in-game size</span>` +
    PU.map(n => img(n, sz('puddle'))).join('') + img('firefly_0', sz('firefly')) + img('firefly_1', sz('firefly')) +
    img('pot', sz('pot')) + img('shelf', sz('shelf')) + img('leaf', sz('leaf')) + img('basket', sz('basket')) +
    potShroom(sz('pot')) + potShroom(sz('pot'), 'mushroom_up') + img('umbrella', sz('umbrella')) +
    img('heart', 28) + img('heart', 28) + img('heart_empty', 28) + img('jar', 40) + img('grow', 40) + img('icon', 32) + img('icon', 64) +
    onPlat('pot', 14, sz('pot')) + onPlat('shelf', 8, sz('shelf'), 'puddle_crouch') + onPlat('leaf', 16, sz('leaf'), 'puddle_happy') +
    onPlat('basket', 22, sz('basket'), 'puddle_idle', 1.6) + onPlat('umbrella', 26, sz('umbrella'), 'puddle_fall') +
    basketChain(sz('basket')) + leafBent(sz('leaf'), 14) + leafBent(sz('leaf'), 8, true) +
    `<span style="display:inline-block;position:relative;width:120px;height:90px">` +
    [[10, 10], [44, 30], [80, 8], [60, 54]].map(([x, y], j) => `<img src="${uri('firefly_' + (j % 2))}" width="${sz('firefly')}" height="${sz('firefly')}" style="position:absolute;left:${x}px;top:${y}px">`).join('') +
    `</span></div>`).join('');
}
function four() {
  return [BGS[0], BGS[2], BGS[4]].map(([name, bg], i) => `<div class="p r ${i === 2 ? 'dk' : ''}" style="background:${bg}"><span class="lab">${name} — 4×</span>` +
    PU.map(n => img(n, 4 * sz('puddle'), DASH)).join('') + img('firefly_0', 144, DASH) + img('firefly_1', 144, DASH) +
    img('pot', 4 * sz('pot') / 1.6, DASH) + img('shelf', 320, DASH) + img('leaf', 384, DASH) + img('basket', 320, DASH) +
    img('mushroom', 128, DASH) + img('mushroom_up', 128, DASH) + img('umbrella', 512, DASH) +
    img('heart', 112) + img('heart_empty', 112) + img('jar', 160, DASH) + img('grow', 160, DASH) + img('icon', 256) + `</div>`).join('');
}
// pose strip with guides: feet line y=118 (red), body centre (64,72) (blue), head circle (magenta)
function frames() {
  const s = 256;
  const guide = `<svg style="position:absolute;left:0;top:0" width="${s}" height="${s}" viewBox="0 0 128 128">` +
    `<line x1="0" x2="128" y1="118" y2="118" stroke="red" stroke-width=".6"/>` +
    `<line x1="64" x2="64" y1="0" y2="128" stroke="#00f" stroke-width=".4" stroke-dasharray="2 2"/><line x1="24" x2="104" y1="72" y2="72" stroke="#00f" stroke-width=".3" stroke-dasharray="2 2"/>` +
    `<circle cx="64" cy="72" r="1.6" fill="#00f"/><circle cx="66" cy="44" r="30" fill="none" stroke="#f0f" stroke-width=".4"/></svg>`;
  return `<div class="p r" style="background:#e7eef0;gap:0"><span class="lab">poses 2× — feet line y=118 (red), body centre (64,72) (blue), head circle (magenta)</span>` +
    PU.map(n => `<span style="position:relative;display:inline-block;width:${s}px;height:${s}px;outline:1px solid #0002">${img(n, s)}${guide}</span>`).join('') + `</div>` +
    `<div class="p r" style="background:#9cc9b4;align-items:flex-end"><span class="lab">size 1.0 vs 1.6 (in-game) on a pot, then a hop cycle</span>` +
    onPlat('pot', 14, sz('pot'), 'puddle_idle', 1) + onPlat('pot', 14, sz('pot'), 'puddle_idle', 1.6) + onPlat('leaf', 16, sz('leaf'), 'puddle_crouch', 1.6) +
    '<span style="width:30px"></span>' + ['puddle_crouch', 'puddle_up', 'puddle_up', 'puddle_fall', 'puddle_crouch', 'puddle_happy', 'puddle_ouch'].map(n => img(n, sz('puddle'))).join('') + `</div>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 400 } });
  for (const [file, html] of [['characters_ingame.png', inGame()], ['characters_4x.png', four()], ['puddle_frames.png', frames()]]) {
    await page.setContent(`<!doctype html><html><head>${css}</head><body>${html}</body></html>`);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log('wrote', path.join(OUT, file));
  }
  await browser.close();
})();
