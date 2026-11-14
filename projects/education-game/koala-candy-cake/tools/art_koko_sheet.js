// Contact sheet for artist A's sprites (Koko, cherry, bee, candle, icon).
// Usage: node tools/art_koko_sheet.js [outDir]   (default docs/art)
// Writes koko_sheet.png:
//   the 10 Koko frames at in-game size (330 px tall) + cherry/bee/candle on light cream, pastel plaza and dark;
//   an anchor-check panel (red cross = feet (150,392), hold palm (285,150), blow lips (270,140), cherry bottom (40,86),
//   candle wick (12,4)); every Koko frame at 3x (1200 px tall); small sprites at 3x; icon 60/180/512.
// Also prints each SVG's drawn bounding box (getBBox) so clipping by the viewBox is visible.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const OUT = process.argv[2] || path.join(ROOT, 'docs/art');
fs.mkdirSync(OUT, { recursive: true });
const uri = rel => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, rel)).toString('base64');
const MOODS = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'hold', 'blow'];
const KOKO = MOODS.map(m => `characters/koko_${m}.svg`).concat(['characters/koko_full_wave.svg']);
const SMALL = [['characters/cherry.svg', 80, 90], ['characters/bee.svg', 96, 80], ['characters/bee_up.svg', 96, 80], ['characters/candle.svg', 24, 72]];
const BGS = {
  cream: '#FFF8EC',
  plaza: 'linear-gradient(#A9DDF5 0%,#FFF4DA 55%,#F3E2C0 75%,#E6CC9E 100%)',
  dark: 'linear-gradient(#2A2F45,#4A4F6A)',
};
const img = (rel, w, h, style = '') => `<img src="${uri(rel)}" width="${w}" height="${h}" style="${style}">`;
const panel = (bg, inner) => `<div class="p" style="background:${bg}">${inner}</div>`;
function anchor(rel, w, h, vw, pts) {
  const k = w / vw;
  const marks = pts.map(([x, y]) => `<div style="position:absolute;left:${x * k - 7}px;top:${y * k}px;width:14px;border-top:2px solid red"></div>
    <div style="position:absolute;left:${x * k}px;top:${y * k - 7}px;height:14px;border-left:2px solid red"></div>`).join('');
  return `<div style="position:relative">${img(rel, w, h, 'outline:1px dashed rgba(0,0,0,.35);background:rgba(255,255,255,.4)')}${marks}</div>`;
}
const css = `<style>body{margin:0;background:#666}.p{display:flex;flex-wrap:wrap;gap:12px;padding:14px;align-items:flex-end}</style>`;

(async () => {
  const b = await chromium.launch();
  const H = 330, W = Math.round(300 * H / 400);
  let s = '';
  for (const bg of Object.values(BGS)) {
    s += panel(bg, KOKO.map(f => img(f, W, H)).join('') +
      img(SMALL[0][0], 64, 72) + img(SMALL[1][0], 72, 60) + img(SMALL[2][0], 72, 60) + img(SMALL[3][0], 16, 48));
  }
  s += panel('#F6FAFF', KOKO.map(f => {
    const pts = [[150, 392]];
    if (f.includes('hold')) pts.push([285, 150]);
    if (f.includes('blow')) pts.push([270, 140]);
    return anchor(f, 225, 300, 300, pts);
  }).join('') + anchor(SMALL[0][0], 160, 180, 80, [[40, 86]]) + anchor(SMALL[3][0], 48, 144, 24, [[12, 4]]));
  s += panel(BGS.plaza, KOKO.slice(0, 5).map(f => img(f, 900, 1200)).join(''));
  s += panel(BGS.cream, KOKO.slice(5).map(f => img(f, 900, 1200)).join(''));
  s += panel(BGS.dark, SMALL.map(([f, w, h]) => img(f, w * 3, h * 3)).join(''));
  s += panel('#FFFFFF', img('icon.svg', 60, 60, 'border-radius:13px') + img('icon.svg', 180, 180, 'border-radius:40px') + img('icon.svg', 512, 512));
  const p = await b.newPage({ viewport: { width: 4600, height: 400 } });
  await p.setContent(`<html><body>${css}${s}</body></html>`);
  await p.waitForTimeout(400);
  const outFile = path.join(OUT, 'koko_sheet.png');
  await p.screenshot({ path: outFile, fullPage: true });
  console.log(outFile);
  for (const f of KOKO.concat(SMALL.map(x => x[0]), ['icon.svg'])) {
    await p.setContent(fs.readFileSync(path.join(A, f), 'utf8'));
    const bb = await p.evaluate(() => { const r = document.querySelector('svg').getBBox(); return [r.x, r.y, r.x + r.width, r.y + r.height].map(v => Math.round(v)); });
    console.log(f, 'bbox', bb.join(','));
  }
  await b.close();
})();
