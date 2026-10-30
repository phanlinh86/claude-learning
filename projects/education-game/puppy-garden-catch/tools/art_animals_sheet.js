// Contact sheet for artist-B sprites: in-game size (110 px), 3x (384 px), and 64 px rows,
// on sky / grass / dark backgrounds. Usage: node tools/art_animals_sheet.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'game/assets/default/items');
const OUT = path.join(ROOT, 'docs/art');
const NAMES = ['fish', 'frog', 'duck', 'bird', 'owl', 'squirrel', 'rabbit', 'cow', 'sheep', 'bat', 'bear', 'hen', 'cat']
  .map(n => 'animal_' + n)
  .concat(['apple', 'banana', 'strawberry', 'orange'].map(n => 'fruit_' + n))
  .concat(['pond', 'tree', 'field', 'cave'].map(n => 'home_' + n));
const BGS = { sky: '#BFE6FF', grass: '#9BCB6B', dark: '#3A4A5A' };

function uri(n) {
  return 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(DIR, n + '.svg')).toString('base64');
}

function page(size, names, cols, only) {
  let rows = '';
  for (const [k, c] of Object.entries(BGS)) {
    if (only && k !== only) continue;
    rows += `<div style="background:${c};display:grid;grid-template-columns:repeat(${cols},${size + 8}px);gap:4px;padding:8px">` +
      names.map(n => `<img src="${uri(n)}" width="${size}" height="${size}">`).join('') + '</div>';
  }
  return `<html><body style="margin:0;background:#fff">${rows}</body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 400 } });
  const shots = [
    ['animals_sheet.png', page(110, NAMES, 11)],
    ['animals_sheet_64.png', page(64, NAMES, 21)],
    ['animals_sheet_3x_a.png', page(384, NAMES.slice(0, 7), 4, 'grass')],
    ['animals_sheet_3x_b.png', page(384, NAMES.slice(7, 13), 3, 'sky')],
    ['animals_sheet_3x_c.png', page(384, NAMES.slice(13), 4, 'dark')],
  ];
  for (const [file, html] of shots) {
    await p.setContent(html);
    await p.waitForTimeout(150);
    await p.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log('wrote', file);
  }
  await b.close();
})();
