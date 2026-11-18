// Contact sheets for artist-C animal + home stickers (Gigi's Peekaboo Windows, DESIGN §4.3).
//   docs/art/animals_sheet.png    : all 18 at 70 px on cream window interior #FFF6E2 / pavement grey / dark,
//                                   plus a window test (each sticker at 70 px in a 120 x 154 lit window)
//   docs/art/animals_sheet_3x.png : all 18 at 3x (384 px) on cream
//   docs/art/animals_pairs.png    : animal <-> home pairs side by side (70 px and 128 px) on cream
// Usage: python3 tools/art_animals.py && node tools/animals_sheet.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'game/assets/default/items');
const OUT = path.join(ROOT, 'docs/art');
const PAIRS = [['dog', 'kennel'], ['cat', 'basket'], ['bird', 'nest'], ['fish', 'bowl'], ['bee', 'hive'],
  ['rabbit', 'hutch'], ['duck', 'pond'], ['hen', 'coop'], ['spider', 'web']];
const ANIMALS = PAIRS.map(p => 'animal_' + p[0]);
const HOMES = PAIRS.map(p => 'home_' + p[1]);
const ALL = ANIMALS.concat(HOMES);
const BGS = { cream: '#FFF6E2', pavement: '#B9B5AE', dark: '#2B2E36' };

function uri(n) {
  return 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(DIR, n + '.svg')).toString('base64');
}

function row(bg, size, names, cols) {
  return `<div style="background:${bg};display:grid;grid-template-columns:repeat(${cols},${size + 8}px);gap:4px;padding:8px">` +
    names.map(n => `<img src="${uri(n)}" width="${size}" height="${size}">`).join('') + '</div>';
}

// window test: sticker at 70 px inside a cream window (aspect 0.78) with a white sill, on a sage facade
function windowRow(names) {
  const w = 120, h = 154;
  return `<div style="background:#C9D8B6;display:flex;flex-wrap:wrap;gap:18px;padding:14px">` + names.map(n =>
    `<div style="width:${w}px;height:${h}px;background:#FFF6E2;border:6px solid #FBF7EE;box-sizing:border-box;` +
    `outline:2px solid #8C9C7A;display:flex;align-items:center;justify-content:center">` +
    `<img src="${uri(n)}" width="70" height="70"></div>`).join('') + '</div>';
}

function pairRow(size) {
  return `<div style="background:#FFF6E2;display:flex;flex-wrap:wrap;gap:22px;padding:12px">` + PAIRS.map(([a, b]) =>
    `<div style="display:flex;gap:4px;padding:6px;border:2px dashed #E3CFA4;border-radius:12px">` +
    `<img src="${uri('animal_' + a)}" width="${size}" height="${size}"><img src="${uri('home_' + b)}" width="${size}" height="${size}"></div>`
  ).join('') + '</div>';
}

function html(body) {
  return `<html><body style="margin:0;background:#fff">${body}</body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1520, height: 400 } });
  let main = '';
  for (const c of Object.values(BGS)) main += row(c, 70, ALL, 18);
  main += row(BGS.cream, 128, ANIMALS, 9) + row(BGS.cream, 128, HOMES, 9) + windowRow(ALL);
  const big = row(BGS.cream, 384, ALL, 3);
  const pairs = pairRow(70) + pairRow(128);
  for (const [file, body] of [['animals_sheet.png', main], ['animals_sheet_3x.png', big], ['animals_pairs.png', pairs]]) {
    await p.setContent(html(body));
    await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log('wrote', file);
  }
  await b.close();
})();
