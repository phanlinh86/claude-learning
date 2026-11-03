// Contact sheets for artist-B animal-friend stickers (Bim's Rainbow Rocket).
//   docs/art/animals_sheet.png    : 16 stickers (plain + _wave) at 70 px and 128 px on white, light-blue sky,
//                                   sunset pink and night navy; plus a 70 px row sitting on a white cloud and on a
//                                   pastel night planet, with a red guide line at the sitting baseline (y = 117/128)
//   docs/art/animals_sheet_3x.png : 3x (384 px) of all 8 plain stickers + 4 wave ones, alternating backgrounds
// Usage: node tools/art_animals_sheet.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'game/assets/default/items');
const OUT = path.join(ROOT, 'docs/art');
const BASE = ['cat', 'dog', 'cow', 'pig', 'sheep', 'duck', 'lion', 'frog'];
const ALL = BASE.flatMap(n => ['animal_' + n, 'animal_' + n + '_wave']);
const BGS = { white: '#FFFFFF', sky: '#A9DBF7', sunset: '#E7A2C4', night: '#1D2556' };

const uri = n => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(DIR, n + '.svg')).toString('base64');

function row(bg, size, names, cols) {
  return `<div style="background:${bg};display:grid;grid-template-columns:repeat(${cols},${size + 8}px);gap:4px;padding:8px">` +
    names.map(n => `<img src="${uri(n)}" width="${size}" height="${size}">`).join('') + '</div>';
}

// stickers at 70 px sitting on islands: the island top surface is at the sticker's baseline (117/128 of its box)
function islandRow(bg, island, names) {
  const s = 70, base = Math.round(s * 117 / 128);
  return `<div style="background:${bg};display:flex;gap:10px;padding:14px">` + names.map(n =>
    `<div style="position:relative;width:110px;height:120px">` +
    `<div style="position:absolute;left:5px;top:${10 + base - 6}px;width:100px;height:46px;${island}"></div>` +
    `<img src="${uri(n)}" width="${s}" height="${s}" style="position:absolute;left:20px;top:10px">` +
    `<div style="position:absolute;left:0;right:0;top:${10 + base}px;height:1px;background:rgba(255,0,0,.5)"></div>` +
    `</div>`).join('') + '</div>';
}

const html = body => `<html><body style="margin:0;background:#fff">${body}</body></html>`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 400 } });
  let main = '';
  for (const c of Object.values(BGS)) main += row(c, 70, ALL, 16);
  for (const c of Object.values(BGS)) main += row(c, 128, BASE.map(n => 'animal_' + n), 8);
  const plain = BASE.map(n => 'animal_' + n);
  main += islandRow('#7EC8F2', 'background:#fff;border:2px solid #9AA6D1;border-radius:50%;box-shadow:inset -6px -8px 0 #DCE2F6', plain);
  main += islandRow('#1D2556', 'background:#F1E6FF;border:2px solid #8F86B8;border-radius:50%;box-shadow:inset -6px -8px 0 #D6C9F0', plain);
  let big = '';
  const bgs = Object.values(BGS);
  const bigNames = [...plain, 'animal_cat_wave', 'animal_duck_wave', 'animal_sheep_wave', 'animal_frog_wave'];
  for (let i = 0; i < 4; i++) big += row(bgs[i], 384, bigNames.slice(i * 3, i * 3 + 3), 3);
  for (const [file, body] of [['animals_sheet.png', main], ['animals_sheet_3x.png', big]]) {
    await p.setContent(html(body));
    await p.waitForTimeout(250);
    await p.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log('wrote', path.join(OUT, file));
  }
  await b.close();
})();
