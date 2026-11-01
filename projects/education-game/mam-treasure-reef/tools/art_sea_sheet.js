// Contact sheets for artist-B sea-friend badges and the photobomb fish / dancing crab.
//   docs/art/animals_sheet.png    : 64 px and 110 px rows on sand / turquoise / navy backgrounds
//   docs/art/animals_sheet_3x.png : 3x (384 px) on the three backgrounds
//   docs/art/fish_sheet.png       : fish_photobomb_a/b (2x) and crab_dance_a/b (2x) on the three backgrounds
// Usage: node tools/art_sea_sheet.js   (Playwright + chromium are pre-installed)
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const ITEMS = path.join(ROOT, 'game/assets/default/items');
const CHARS = path.join(ROOT, 'game/assets/default/characters');
const OUT = path.join(ROOT, 'docs/art');
const NAMES = ['crab', 'octopus', 'seahorse', 'clownfish', 'dolphin', 'jellyfish', 'starfish', 'whale', 'puffer']
  .map(n => path.join(ITEMS, 'animal_' + n + '.svg'));
const FISH = ['fish_photobomb_a', 'fish_photobomb_b'].map(n => path.join(CHARS, n + '.svg'));
const CRAB = ['crab_dance_a', 'crab_dance_b'].map(n => path.join(CHARS, n + '.svg'));
const BGS = { sand: '#F2DFB3', turquoise: '#5FC9DD', navy: '#13305A' };

function uri(file) {
  return 'data:image/svg+xml;base64,' + fs.readFileSync(file).toString('base64');
}

function row(bg, w, h, files, cols) {
  return `<div style="background:${bg};display:grid;grid-template-columns:repeat(${cols},${w + 8}px);gap:4px;padding:8px">` +
    files.map(f => `<img src="${uri(f)}" width="${w}" height="${h}">`).join('') + '</div>';
}

function html(body) {
  return `<html><body style="margin:0;background:#fff;display:inline-block">${body}</body></html>`;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1200, height: 400 } });
  let main = '';
  for (const c of Object.values(BGS)) main += row(c, 64, 64, NAMES, 9) + row(c, 110, 110, NAMES, 9);
  let big = '';
  big += row(BGS.sand, 384, 384, NAMES.slice(0, 3), 3) + row(BGS.turquoise, 384, 384, NAMES.slice(3, 6), 3) +
    row(BGS.navy, 384, 384, NAMES.slice(6), 3);
  let fish = '';
  for (const c of Object.values(BGS)) fish += row(c, 512, 256, FISH, 2) + row(c, 256, 256, CRAB, 2);
  for (const [file, body] of [['animals_sheet.png', main], ['animals_sheet_3x.png', big], ['fish_sheet.png', fish]]) {
    await p.setContent(html(body));
    await p.waitForTimeout(200);
    await p.screenshot({ path: path.join(OUT, file), fullPage: true });
    console.log('wrote', file);
  }
  await b.close();
})();
