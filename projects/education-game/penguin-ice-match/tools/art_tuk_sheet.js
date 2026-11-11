// Contact sheets for artist A's sprites (Tuk, frosted ice block, stars, icon).
// Usage: node tools/art_tuk_sheet.js [outDir]   (default docs/art)
// Writes tuk_sheet.png (in-game size on light ice / snow / dark backgrounds, items, plus the feet-anchor frames)
// and tuk_sheet_3x.png (3x zoom). Also prints Tuk's drawn bounding box inside the 256 box (getBBox of every frame).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const OUT = process.argv[2] || path.join(ROOT, 'docs/art');
fs.mkdirSync(OUT, { recursive: true });
const uri = rel => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, rel)).toString('base64');
const TUK = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops'].map(n => `characters/tuk_${n}.svg`);
const BGS = ['#CFE6F2', 'linear-gradient(#E4EEF6,#FFFFFF)', '#1E2F48'];
const img = (rel, w, h, style = '') => `<img src="${uri(rel)}" width="${w}" height="${h}" style="${style}">`;
const panel = (bg, inner) => `<div class="p" style="background:${bg}">${inner}</div>`;

// in game Tuk is drawn ~180 px tall (layout.tuk.h): the 256 box is scaled so the drawn height (~228/256) is 180
const TUK_PX = Math.round(180 * 256 / 228);
const tukRow = (bg, sz) => panel(bg, TUK.map(p => img(p, sz, sz)).join(''));
const itemsRow = (bg, k) => panel(bg,
  img('ui/star.svg', 28 * k, 28 * k) + img('ui/star_empty.svg', 28 * k, 28 * k) +
  img('items/ice_back.svg', 104 * k, 104 * k / 0.9) + img('items/ice_back.svg', 150 * k, 150 * k / 0.9) +
  img('icon.svg', 60 * k, 60 * k, 'border-radius:13px') + img('icon.svg', 180 * k, 180 * k, 'border-radius:40px'));
const frames = panel('#F6FAFF', TUK.map(p => `<div style="position:relative">${img(p, 256, 256, 'outline:1px dashed rgba(0,0,0,.3)')}
  <div style="position:absolute;left:0;right:0;top:244px;border-top:1px solid red"></div>
  <div style="position:absolute;top:0;bottom:0;left:128px;border-left:1px solid red"></div></div>`).join(''));

const css = `<style>body{margin:0;background:#666}.p{display:flex;flex-wrap:wrap;gap:14px;padding:14px;align-items:flex-end}</style>`;
(async () => {
  const b = await chromium.launch();
  const shots = [
    ['tuk_sheet.png', 1560, BGS.map(c => tukRow(c, TUK_PX)).join('') + BGS.map(c => itemsRow(c, 1)).join('') + frames],
    ['tuk_sheet_3x.png', 1900, BGS.map(c => panel(c, TUK.slice(0, 4).map(x => img(x, 440, 440)).join('')) +
      panel(c, TUK.slice(4).map(x => img(x, 440, 440)).join(''))).join('') +
      panel('#FFFFFF', img('icon.svg', 512, 512, 'border-radius:110px') + img('items/ice_back.svg', 450, 500) + img('ui/star.svg', 192, 192) + img('ui/star_empty.svg', 192, 192))],
  ];
  for (const [name, width, body] of shots) {
    const p = await b.newPage({ viewport: { width, height: 400 } });
    await p.setContent(`<html><body>${css}${body}</body></html>`);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, name), fullPage: true });
    await p.close();
    console.log(path.join(OUT, name));
  }
  const p = await b.newPage();
  for (const f of TUK) {
    await p.setContent(fs.readFileSync(path.join(A, f), 'utf8'));
    const bb = await p.evaluate(() => { const r = document.querySelector('svg').getBBox(); return [r.x, r.y, r.x + r.width, r.y + r.height].map(v => Math.round(v)); });
    console.log(f, 'bbox x0,y0,x1,y1 =', bb.join(','), ' drawn height', bb[3] - bb[1]);
  }
  await p.close();
  await b.close();
})();
