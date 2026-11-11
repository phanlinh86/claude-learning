// Contact sheets for Zippy's Jungle Boop characters (QA loop).
// Usage: node tools/art-characters/sheet.js [assetDir] [outDir]
// Validates every SVG, then writes ingame.png, x4.png, composite.png to tools/art-characters/out/.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DIR = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || path.join(__dirname, 'out');

const VB = {};
for (const f of ['idle', 'fly', 'boop', 'dizzy']) VB['zippy_' + f] = [160, 140];
for (const k of ['monkey', 'frog', 'toucan']) for (const f of ['up', 'happy', 'wow', 'paws']) VB[k + '_' + f] = [140, 150];
for (const n of ['star_0', 'star_1', 'star_2', 'star_3', 'star_rainbow']) VB[n] = [64, 64];
VB.leaf = [48, 48]; VB.leaf_empty = [48, 48]; VB.icon = [256, 256];

// ---------- validation (DESIGN §3) ----------
const errs = [];
for (const [n, [w, h]] of Object.entries(VB)) {
  const f = `${DIR}/${n}.svg`;
  if (!fs.existsSync(f)) { errs.push(n + ': missing'); continue; }
  const s = fs.readFileSync(f, 'utf8');
  const head = s.match(/<svg[^>]*>/)[0];
  if (!head.includes(`viewBox="0 0 ${w} ${h}"`) || !head.includes(`width="${w}"`) || !head.includes(`height="${h}"`)) errs.push(n + ': size/viewBox');
  if (/<text|<image|<script|href=|@import|font-family|feGaussianBlur/i.test(s)) errs.push(n + ': forbidden content');
  const ids = [...s.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  if (new Set(ids).size !== ids.length) errs.push(n + ': duplicate ids');
}
if (errs.length) { console.error('VALIDATION FAILED\n' + errs.join('\n')); process.exitCode = 1; } else console.log('validation ok (' + Object.keys(VB).length + ' files)');

const uri = n => 'data:image/svg+xml;base64,' + fs.readFileSync(`${DIR}/${n}.svg`).toString('base64');
const img = (n, w, st = '') => `<img src="${uri(n)}" width="${w}" height="${(w * VB[n][1] / VB[n][0]).toFixed(1)}" style="${st}">`;
// in-game sizes (stage px at a 960×540 stage): Zippy 120×105, critters 140s (s .74–1), stars 58s, leaves 34, icon 64
const ZS = ['zippy_idle', 'zippy_fly', 'zippy_boop', 'zippy_dizzy'];
const CR = ['monkey', 'frog', 'toucan'].flatMap(k => ['up', 'happy', 'wow', 'paws'].map(f => k + '_' + f));
const ST = ['star_0', 'star_1', 'star_2', 'star_3', 'star_rainbow'];
const BGS = [['light (riverbank sky)', '#dff4ff'], ['jungle floor', '#4f9a45'], ['dark (ruins dusk)', '#2d2a48']];
const css = `<style>body{margin:0;background:#777;font:12px sans-serif}.p{display:flex;flex-wrap:wrap;gap:14px;padding:22px 14px 14px;align-items:flex-end;position:relative}
.lab{position:absolute;left:6px;top:4px;color:#000a}.dk .lab{color:#fffa}</style>`;

function inGame() {
  return BGS.map(([name, bg], i) => `<div class="p ${i ? 'dk' : ''}" style="background:${bg}"><span class="lab">${name} — in-game size</span>` +
    ZS.map(n => img(n, 120)).join('') + CR.map(n => img(n, n.endsWith('paws') ? 104 : 104)).join('') +
    ST.map(n => img(n, 58)).join('') + ST.map(n => img(n, 43)).join('') +
    img('leaf', 34) + img('leaf', 34) + img('leaf_empty', 34) + img('icon', 64) + img('icon', 32) + `</div>`).join('');
}
// 4× sheets, with anchor guides on Zippy (nozzle + antenna tips + body centre) and critters (star centre + paw points)
const guideZ = `<svg style="position:absolute;left:0;top:0" width="640" height="560" viewBox="0 0 160 140">` +
  [[34, 104, 'red'], [114, 20, 'magenta'], [132, 30, 'magenta'], [80, 82, 'blue']].map(([x, y, c]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="${c}"/><circle cx="${x}" cy="${y}" r="3.5" fill="none" stroke="${c}" stroke-width=".5"/>`).join('') +
  `<line x1="34" y1="104" x2="22" y2="122" stroke="red" stroke-width=".6" stroke-dasharray="2 1"/></svg>`;
const guideC = `<svg style="position:absolute;left:0;top:0" width="560" height="600" viewBox="0 0 140 150">` +
  `<line x1="0" x2="140" y1="129" y2="129" stroke="red" stroke-width=".5" stroke-dasharray="2 2"/>` +
  `<line x1="0" x2="140" y1="8" y2="8" stroke="#00f" stroke-width=".4" stroke-dasharray="2 2"/>` +
  [[70, 96], [40, 100], [100, 100]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" fill="magenta"/>`).join('') + `</svg>`;
function x4() {
  const box = (n, w, h, g) => `<span style="position:relative;display:inline-block;width:${w}px;height:${h}px;outline:1px dashed #0004">${img(n, w)}${g || ''}</span>`;
  return [BGS[0], BGS[2]].map(([name, bg], i) => `<div class="p ${i ? 'dk' : ''}" style="background:${bg}"><span class="lab">${name} — 4× (red line = clip at full pop, magenta = star/paw anchors)</span>` +
    ZS.map(n => box(n, 640, 560, guideZ)).join('') + CR.map(n => box(n, 560, 600, guideC)).join('') +
    ST.map(n => box(n, 256, 256)).join('') + box('leaf', 192, 192) + box('leaf_empty', 192, 192) + box('icon', 256, 256) + `</div>`).join('');
}
// composite per DESIGN §2 drawing steps, with a mock burrow (anchor rim centre (85,45) in a 170×90 box)
function burrowBack(bx, by, s) {
  return `<g transform="translate(${bx - 85 * s} ${by - 45 * s}) scale(${s})"><ellipse cx="85" cy="45" rx="72" ry="24" fill="#6b4a2b" stroke="#3e2a17" stroke-width="3"/><ellipse cx="85" cy="47" rx="60" ry="17" fill="#24170d"/></g>`;
}
function burrowFront(bx, by, s) {
  return `<g transform="translate(${bx - 85 * s} ${by - 45 * s}) scale(${s})"><path d="M13,45 Q85,74 157,45 L160,62 Q85,96 10,62 Z" fill="#8a6239" stroke="#3e2a17" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="M26,60 q6,-14 12,0 q6,-16 12,0 M122,62 q6,-14 12,0 q6,-16 12,0" fill="#3f9a3a" stroke="#22631f" stroke-width="2"/></g>`;
}
let cid = 0;
function critterAt(kind, frame, colour, bx, by, s, h) {
  const top = by + 25 * s + (1 - h) * 140 * s - 150 * s, left = bx - 70 * s, id = 'c' + (cid++);
  const sx = left + 70 * s - 29 * s, sy = top + 96 * s - 29 * s;
  return burrowBack(bx, by, s) +
    `<clipPath id="${id}"><rect x="0" y="0" width="2000" height="${by + 4 * s}"/></clipPath><g clip-path="url(#${id})">` +
    `<image href="${uri(kind + '_' + frame)}" x="${left}" y="${top}" width="${140 * s}" height="${150 * s}"/>` +
    `<image href="${uri('star_' + colour)}" x="${sx}" y="${sy}" width="${58 * s}" height="${58 * s}"/>` +
    `<image href="${uri(kind + '_paws')}" x="${left}" y="${top}" width="${140 * s}" height="${150 * s}"/></g>` +
    burrowFront(bx, by, s);
}
function zippyAt(frame, x, y, colour) {
  // drawn 120×105 at s=1, centred on (x,y); coloured glow + flame added like render.js will
  const k = 120 / 160, l = x - 60, t = y - 52.5, col = ['#ff5d73', '#ffc93c', '#3fa7ff', '#a46bff'][colour];
  const P = (px, py) => [l + px * k, t + py * k];
  const [nx, ny] = P(34, 104), [a1x, a1y] = P(114, 20), [a2x, a2y] = P(132, 30);
  return `<circle cx="${a1x}" cy="${a1y}" r="9" fill="${col}" opacity=".55"/><circle cx="${a2x}" cy="${a2y}" r="8" fill="${col}" opacity=".55"/>` +
    `<path d="M${nx - 4},${ny - 2} L${nx - 16},${ny + 20} L${nx + 4},${ny + 3} Z" fill="#ffb03a" opacity=".9"/>` +
    `<image href="${uri('zippy_' + frame)}" x="${l}" y="${t}" width="120" height="105"/>`;
}
function composite() {
  const W = 960, H = 540;
  const kinds = ['monkey', 'frog', 'toucan'];
  let g = `<rect width="${W}" height="${H}" fill="#bfe8ff"/><rect y="230" width="${W}" height="${H - 230}" fill="#5aa64c"/><rect y="230" width="${W}" height="20" fill="#4c9441"/>`;
  // L2-style 3 rows: back s .74, mid .87, front 1
  const rows = [[280, 0.74, [330, 480, 630]], [375, 0.87, [250, 480, 710]], [480, 1, [190, 480, 770]]];
  let n = 0;
  for (const [by, s, xs] of rows) for (const bx of xs) {
    const kind = kinds[n % 3], frame = ['up', 'happy', 'wow'][Math.floor(n / 3) % 3], col = n % 4;
    const h = n === 4 ? 0.55 : n === 7 ? 0.3 : 1;
    g += critterAt(kind, frame, col, bx, by, s, h); n++;
  }
  g += zippyAt('idle', 480, 112, 0) + zippyAt('fly', 140, 120, 1) + zippyAt('boop', 820, 110, 2) + zippyAt('dizzy', 660, 150, 3);
  g += `<image href="${uri('leaf')}" x="760" y="14" width="34" height="34"/><image href="${uri('leaf')}" x="796" y="14" width="34" height="34"/><image href="${uri('leaf_empty')}" x="832" y="14" width="34" height="34"/>`;
  const one = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${g}</svg>`;
  // zoomed: each kind × each star at 2.2×
  let z = `<rect width="1600" height="420" fill="#4f9a45"/>`; cid = 1000;
  kinds.forEach((kind, ki) => ['up', 'happy', 'wow', 'up'].forEach((fr, j) => {
    z += critterAt(kind, fr, j, 110 + (ki * 4 + j) * 125, 250, 0.82, 1);
  }));
  const two = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="330" viewBox="0 0 1600 330">${z}</svg>`;
  return `<div style="background:#333;padding:10px">${one}</div><div style="padding:10px;background:#333">${two}</div>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1640, height: 400 } });
  // well-formed XML check (an SVG that fails to parse shows as a broken image in the game)
  const bad = await page.evaluate(files => files.filter(([, s]) =>
    new DOMParser().parseFromString(s, 'image/svg+xml').getElementsByTagName('parsererror').length).map(([n]) => n),
  Object.keys(VB).map(n => [n, fs.readFileSync(`${DIR}/${n}.svg`, 'utf8')]));
  if (bad.length) { console.error('XML PARSE FAILED: ' + bad.join(', ')); process.exitCode = 1; } else console.log('xml ok');
  for (const [file, html] of [['ingame.png', inGame()], ['x4.png', x4()], ['composite.png', composite()]]) {
    await page.setContent(`<!doctype html><html><head>${css}</head><body>${html}</body></html>`);
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log('wrote', path.join(OUT, file));
  }
  await browser.close();
})();
