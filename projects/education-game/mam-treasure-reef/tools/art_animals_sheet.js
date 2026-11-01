// Contact sheets for artist-B arctic-animal badges.
//   docs/art/animals_sheet.png    : 64 px and 110 px rows on snow / stone / navy backgrounds
//   docs/art/animals_sheet_3x.png : 3x (384 px) on the three backgrounds
// Usage: node tools/art_animals_sheet.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'game/assets/default/items');
const OUT = path.join(ROOT, 'docs/art');
const NAMES = ['bear', 'seal', 'fox', 'hare', 'reindeer', 'walrus', 'penguin', 'puffin', 'whale'].map(n => 'animal_' + n);
const BGS = { snow: '#F6FAFF', stone: '#A9A49B', navy: '#1B2550' };

function uri(n) {
  return 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(DIR, n + '.svg')).toString('base64');
}

function row(bg, size, names, cols) {
  return `<div style="background:${bg};display:grid;grid-template-columns:repeat(${cols},${size + 8}px);gap:4px;padding:8px">` +
    names.map(n => `<img src="${uri(n)}" width="${size}" height="${size}">`).join('') + '</div>';
}

function html(body) {
  return `<html><body style="margin:0;background:#fff">${body}</body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 400 } });
  let main = '';
  for (const c of Object.values(BGS)) main += row(c, 64, NAMES, 9) + row(c, 110, NAMES, 9);
  let big = '';
  for (const c of Object.values(BGS)) big += row(c, 384, NAMES.slice(0, 3), 3);
  big += row(BGS.snow, 384, NAMES.slice(3, 6), 3) + row(BGS.stone, 384, NAMES.slice(6), 3);
  big += row(BGS.navy, 384, NAMES.slice(3, 6), 3) + row(BGS.snow, 384, NAMES.slice(6), 3);
  for (const [file, body] of [['animals_sheet.png', main], ['animals_sheet_3x.png', big]]) {
    await p.setContent(html(body));
    await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log('wrote', file);
  }
  await b.close();
})();
