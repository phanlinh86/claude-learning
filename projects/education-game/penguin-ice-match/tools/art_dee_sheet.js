// Contact sheets for artist A's sprites (Dee, card back, stars, icon) and IM.CardArt (tools/card_sheet.html).
// Usage: node tools/art_dee_sheet.js [outDir]   (default docs/art)
// Writes dee_sheet.png (in-game size on light / forest-green / snowy backgrounds, plus the feet-anchor frames),
// dee_sheet_3x.png (3x zoom), cards_sheet.png and rewards_sheet.png (both rendered by tools/card_sheet.html).
// Also prints Dee's drawn bounding box inside the 256 box (getBBox of every frame).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const OUT = process.argv[2] || path.join(ROOT, 'docs/art');
fs.mkdirSync(OUT, { recursive: true });
const uri = rel => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, rel)).toString('base64');
const DEE = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops'].map(n => `characters/dee_${n}.svg`);
const BGS = ['#F4F8EC', '#4F8A5E', 'linear-gradient(#E4EEF6,#FFFFFF)'];
const img = (rel, w, h, style = '') => `<img src="${uri(rel)}" width="${w}" height="${h}" style="${style}">`;
const panel = (bg, inner) => `<div class="p" style="background:${bg}">${inner}</div>`;

// in game Dee is drawn 170-180 px tall (layout.dee.h): the 256 box is scaled so the drawn height (~232/256) is 180
const DEE_PX = Math.round(180 * 256 / 232);
const deeRow = (bg, sz) => panel(bg, DEE.map(p => img(p, sz, sz)).join(''));
const itemsRow = (bg, k) => panel(bg,
  img('ui/star.svg', 28 * k, 28 * k) + img('ui/star_empty.svg', 28 * k, 28 * k) +
  img('ui/star.svg', 56 * k, 56 * k) + img('ui/star_empty.svg', 56 * k, 56 * k) +
  img('items/card_back.svg', 104 * k, 104 * k / 0.78) + img('items/card_back.svg', 150 * k, 200 * k) +
  img('icon.svg', 60 * k, 60 * k, 'border-radius:13px') + img('icon.svg', 180 * k, 180 * k, 'border-radius:40px'));
const frames = panel('#F6FAFF', DEE.map(p => `<div style="position:relative">${img(p, 256, 256, 'outline:1px dashed rgba(0,0,0,.3)')}
  <div style="position:absolute;left:0;right:0;top:244px;border-top:1px solid red"></div>
  <div style="position:absolute;top:0;bottom:0;left:128px;border-left:1px solid red"></div></div>`).join(''));

const css = `<style>body{margin:0;background:#666}.p{display:flex;flex-wrap:wrap;gap:14px;padding:14px;align-items:flex-end}</style>`;
(async () => {
  const b = await chromium.launch();
  const shots = [
    ['dee_sheet.png', 1500, BGS.map(c => deeRow(c, DEE_PX)).join('') + BGS.map(c => itemsRow(c, 1)).join('') + frames],
    ['dee_sheet_3x.png', 1900, BGS.map(c => panel(c, DEE.slice(0, 4).map(x => img(x, 440, 440)).join('')) +
      panel(c, DEE.slice(4).map(x => img(x, 440, 440)).join(''))).join('') +
      panel('#FFFFFF', img('icon.svg', 512, 512, 'border-radius:110px') + img('items/card_back.svg', 390, 500) + img('ui/star.svg', 192, 192) + img('ui/star_empty.svg', 192, 192))],
  ];
  for (const [name, width, body] of shots) {
    const p = await b.newPage({ viewport: { width, height: 400 } });
    await p.setContent(`<html><body>${css}${body}</body></html>`);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, name), fullPage: true });
    await p.close();
    console.log(path.join(OUT, name));
  }
  // drawn bounding box of each Dee frame
  const p = await b.newPage();
  for (const f of DEE) {
    await p.setContent(fs.readFileSync(path.join(A, f), 'utf8'));
    const bb = await p.evaluate(() => { const r = document.querySelector('svg').getBBox(); return [r.x, r.y, r.x + r.width, r.y + r.height].map(v => Math.round(v)); });
    console.log(f, 'bbox x0,y0,x1,y1 =', bb.join(','), ' drawn height', bb[3] - bb[1]);
  }
  await p.close();
  // card + reward sheets (IM.CardArt test page)
  for (const [name, hash] of [['cards_sheet.png', '#cards'], ['rewards_sheet.png', '#rewards']]) {
    const q = await b.newPage({ viewport: { width: 1400, height: 800 } });
    q.on('console', m => console.log('[sheet]', m.text()));
    q.on('pageerror', e => console.log('[sheet error]', e.message));
    await q.goto('file://' + path.join(__dirname, 'card_sheet.html') + hash);
    await q.waitForFunction(() => document.title === 'done', null, { timeout: 15000 });
    await q.locator('#c').screenshot({ path: path.join(OUT, name) });
    await q.close();
    console.log(path.join(OUT, name));
  }
  await b.close();
})();
