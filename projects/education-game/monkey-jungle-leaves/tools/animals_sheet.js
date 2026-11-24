// Contact sheets for artist-C animal + food stickers (Lolo's Jungle Leaves, DESIGN §4.3).
//   docs/art/animals_sheet.png    : all 16 at 70 px (+ 45 px on cream) on the leaf underside cream #F3F6DF / jungle green / night,
//                                   at 128 px on cream, plus a leaf test (each sticker at 70 px on a pale leaf back)
//   docs/art/animals_sheet_3x.png : all 16 at 3x (384 px) on cream
//   docs/art/animals_pairs.png    : animal <-> food pairs side by side (70 px and 128 px) on cream
// Usage: python3 tools/art_animals.py && node tools/animals_sheet.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'game/assets/default/items');
const OUT = path.join(ROOT, 'docs/art');
const PAIRS = [['panda', 'bamboo'], ['elephant', 'peanut'], ['rabbit', 'carrot'], ['squirrel', 'acorn'],
  ['bee', 'honey'], ['bird', 'worm'], ['hippo', 'watermelon'], ['mouse', 'cheese']];
const ANIMALS = PAIRS.map(p => 'animal_' + p[0]);
const FOODS = PAIRS.map(p => 'food_' + p[1]);
const ALL = ANIMALS.concat(FOODS);
const BGS = { cream: '#F3F6DF', leaf: '#3E9A5E', night: '#1E2A4A' };

function uri(n) {
  return 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(DIR, n + '.svg')).toString('base64');
}

function row(bg, size, names, cols) {
  return `<div style="background:${bg};display:grid;grid-template-columns:repeat(${cols},${size + 8}px);gap:4px;padding:8px">` +
    names.map(n => `<img src="${uri(n)}" width="${size}" height="${size}">`).join('') + '</div>';
}

// leaf test: sticker at 70 px on a pale leaf underside (≈ 0.68 of a 104 px leaf), rim #C9D9A8
function leafRow(names) {
  return `<div style="background:#5E8F6A;display:flex;flex-wrap:wrap;gap:16px;padding:14px">` + names.map(n =>
    `<div style="width:104px;height:124px;background:#F3F6DF;border:3px solid #C9D9A8;box-sizing:border-box;` +
    `border-radius:50% 50% 50% 50% / 40% 40% 60% 60%;display:flex;align-items:center;justify-content:center">` +
    `<img src="${uri(n)}" width="70" height="70"></div>`).join('') + '</div>';
}

function pairRow(size) {
  return `<div style="background:#F3F6DF;display:flex;flex-wrap:wrap;gap:22px;padding:12px">` + PAIRS.map(([a, b]) =>
    `<div style="display:flex;gap:4px;padding:6px;border:2px dashed #C9D9A8;border-radius:12px">` +
    `<img src="${uri('animal_' + a)}" width="${size}" height="${size}"><img src="${uri('food_' + b)}" width="${size}" height="${size}"></div>`
  ).join('') + '</div>';
}

function html(body) {
  return `<html><body style="margin:0;background:#fff">${body}</body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  for (const n of ALL) if (!fs.existsSync(path.join(DIR, n + '.svg'))) throw new Error('missing ' + n);
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 400 } });
  let main = '';
  for (const c of Object.values(BGS)) main += row(c, 70, ALL, 16);
  main += row(BGS.cream, 45, ALL, 16);   // age-3 big/small topic draws stickers ~45 px
  main += row(BGS.cream, 128, ANIMALS, 8) + row(BGS.cream, 128, FOODS, 8) + leafRow(ALL);
  const big = row(BGS.cream, 384, ALL, 4);
  const pairs = pairRow(70) + pairRow(128);
  for (const [file, body] of [['animals_sheet.png', main], ['animals_sheet_3x.png', big], ['animals_pairs.png', pairs]]) {
    await p.setContent(html(body));
    await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log('wrote', file);
  }
  await b.close();
})();
