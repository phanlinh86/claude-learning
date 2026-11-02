// Contact sheets for artist-B forest-animal stickers (Dee's Forest Memory).
//   docs/art/animals_sheet.png    : 70 px and 128 px rows on cream card / grass / autumn leaves / snow, plus a
//                                   card test (each sticker at 70 px on a 104 px cream card) and a half-flipped
//                                   card test (the same card squashed to scaleX 0.5, as mid-flip)
//   docs/art/animals_sheet_3x.png : 3x (384 px): one row of three per background (cream / grass / autumn / snow)
// Usage: node tools/art_animals_sheet.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'game/assets/default/items');
const OUT = path.join(ROOT, 'docs/art');
const NAMES = ['fox', 'deer', 'hedgehog', 'squirrel', 'bunny', 'frog', 'bear', 'owl', 'mouse'].map(n => 'animal_' + n);
const BGS = { cream: '#FFF8EA', grass: '#9CCB7C', autumn: '#E9C38A', snow: '#EEF4FA' };

function uri(n) {
  return 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(DIR, n + '.svg')).toString('base64');
}

function row(bg, size, names, cols) {
  return `<div style="background:${bg};display:grid;grid-template-columns:repeat(${cols},${size + 8}px);gap:4px;padding:8px">` +
    names.map(n => `<img src="${uri(n)}" width="${size}" height="${size}">`).join('') + '</div>';
}

// card test: sticker on a 104 x 133 cream card front (frame #E7D3AE, outline #9A774C); sx = horizontal squash
function cardRow(names, sx) {
  const w = 104, h = 133;
  return `<div style="background:#2F5E3A;display:flex;gap:12px;padding:12px">` + names.map(n =>
    `<div style="width:${w}px;height:${h}px;transform:scaleX(${sx});border-radius:${0.12 * w}px;background:#FFF8EA;` +
    `border:2px solid #9A774C;box-shadow:inset 0 0 0 6px #E7D3AE;display:flex;align-items:center;justify-content:center">` +
    `<img src="${uri(n)}" width="70" height="70"></div>`).join('') + '</div>';
}

function html(body) {
  return `<html><body style="margin:0;background:#fff">${body}</body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1300, height: 400 } });
  let main = '';
  for (const c of Object.values(BGS)) main += row(c, 70, NAMES, 9) + row(c, 128, NAMES, 9);
  main += cardRow(NAMES, 1) + cardRow(NAMES, 0.5);
  let big = '';
  const bg = Object.values(BGS);
  for (let i = 0; i < 4; i++) big += row(bg[i], 384, NAMES.slice((i % 3) * 3, (i % 3) * 3 + 3), 3);
  for (const [file, body] of [['animals_sheet.png', main], ['animals_sheet_3x.png', big]]) {
    await p.setContent(html(body));
    await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log('wrote', file);
  }
  await b.close();
})();
