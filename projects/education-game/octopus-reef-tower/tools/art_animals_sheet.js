// Contact sheet for artist-B sea-animal stickers (Pip's Reef Tower).
//   docs/art/animals_sheet.png : the 8 stickers at 60 px and 128 px on sand, teal water, pale aqua and deep-sea dark,
//                                60 px stickers printed on a sand-stone block swatch (as on a block), a grey-scale row
//                                (silhouette / colour-blind check) and a 3x (384 px) row.
// Usage: node tools/art_animals_sheet.js
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'game/assets/default/items');
const OUT = path.join(ROOT, 'docs/art');
const NAMES = ['fish', 'crab', 'turtle', 'whale', 'seahorse', 'dolphin', 'jellyfish', 'shrimp'].map(n => 'animal_' + n);
const BGS = { sand: '#F1E2BE', water: '#7FD0E3', aqua: '#DDF4EC', dark: '#17364A' };

const uri = n => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(DIR, n + '.svg')).toString('base64');

function row(bg, size, names, cols, style) {
  return `<div style="background:${bg};display:grid;grid-template-columns:repeat(${cols},${size + 10}px);gap:6px;padding:10px">` +
    names.map(n => `<img src="${uri(n)}" width="${size}" height="${size}" style="${style || ''}">`).join('') + '</div>';
}
function blockRow(names) {
  return `<div style="background:#7FD0E3;display:flex;gap:10px;padding:10px">` + names.map(n =>
    `<div style="width:131px;height:84px;background:#F3DDB2;border:4px solid #B98A4E;border-radius:20px;display:flex;align-items:center;justify-content:center">` +
    `<img src="${uri(n)}" width="60" height="60"></div>`).join('') + '</div>';
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1600, height: 400 } });
  let body = '';
  for (const c of Object.values(BGS)) body += row(c, 60, NAMES, 8) + row(c, 128, NAMES, 8);
  body += blockRow(NAMES);
  body += row('#FFFFFF', 60, NAMES, 8, 'filter:grayscale(1)');
  body += row(BGS.sand, 384, NAMES.slice(0, 4), 4) + row(BGS.dark, 384, NAMES.slice(4), 4);
  await p.setContent(`<html><body style="margin:0;background:#fff">${body}</body></html>`);
  await p.waitForTimeout(300);
  await p.screenshot({ path: path.join(OUT, 'animals_sheet.png'), fullPage: true });
  console.log('wrote', path.join(OUT, 'animals_sheet.png'));
  await b.close();
})();
