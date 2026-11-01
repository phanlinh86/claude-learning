// Contact sheets for artist-B farm-animal stickers.
//   docs/art/animals_sheet.png    : 60 px and 128 px rows on sky / grass / navy, plus a balloon test
//                                   (each sticker at 60 px on a red and on a blue balloon disc)
//   docs/art/animals_sheet_3x.png : 3x (384 px) on sky / grass / navy
// Usage: node tools/art_animals_sheet.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'game/assets/default/items');
const OUT = path.join(ROOT, 'docs/art');
const NAMES = ['cow', 'pig', 'sheep', 'duck', 'horse', 'goat', 'chick', 'bunny', 'puppy'].map(n => 'animal_' + n);
const BGS = { sky: '#DDEFFC', grass: '#B5DB93', navy: '#1C2547' };
const BALLOONS = { red: ['#E84A4A', '#A8282E'], blue: ['#3C8DE8', '#1F5BA8'] };

function uri(n) {
  return 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(DIR, n + '.svg')).toString('base64');
}

function row(bg, size, names, cols) {
  return `<div style="background:${bg};display:grid;grid-template-columns:repeat(${cols},${size + 8}px);gap:4px;padding:8px">` +
    names.map(n => `<img src="${uri(n)}" width="${size}" height="${size}">`).join('') + '</div>';
}

// balloon test: sticker centred on a balloon-coloured disc (the game draws stickers ≈0.55× balloon width)
function balloonRow(fill, dark, names) {
  const disc = 110;
  return `<div style="background:${BGS.sky};display:flex;gap:10px;padding:10px">` + names.map(n =>
    `<div style="width:${disc}px;height:${disc * 1.15}px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#fff6 0,#fff0 35%),${fill};` +
    `border:2px solid ${dark};display:flex;align-items:center;justify-content:center">` +
    `<img src="${uri(n)}" width="64" height="64"></div>`).join('') + '</div>';
}

function html(body) {
  return `<html><body style="margin:0;background:#fff">${body}</body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1300, height: 400 } });
  let main = '';
  for (const c of Object.values(BGS)) main += row(c, 60, NAMES, 9) + row(c, 128, NAMES, 9);
  for (const [f, d] of Object.values(BALLOONS)) main += balloonRow(f, d, NAMES);
  let big = '';
  const bg = Object.values(BGS);
  for (let i = 0; i < 3; i++) for (let k = 0; k < 3; k++) big += row(bg[(i + k) % 3], 384, NAMES.slice(i * 3, i * 3 + 3), 3);
  for (const [file, body] of [['animals_sheet.png', main], ['animals_sheet_3x.png', big]]) {
    await p.setContent(html(body));
    await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log('wrote', file);
  }
  await b.close();
})();
