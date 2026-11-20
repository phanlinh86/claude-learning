// Contact sheets for artist A's sprites (Pip, crown, puffer, pearl, icon).
// Usage: node tools/art_pip_sheet.js [outDir]   (default docs/art)
// Writes:
//   pip_sheet.png    the 10 Pip frames at in-game size (300 px tall) + crown/puffer/pearl on light sand, teal water and
//                    dark; an anchor-check panel (red cross = feet (150,392), hold tips (290,170), blow lips (265,150),
//                    crown bottom (40,86), pearl centre (24,22) + bottom (24,46)).
//   pip_sheet_3x.png every Pip frame at 3x (1200 px tall) on water / sand, small sprites at 3x on dark.
//   icon_sheet.png   icon at 60 / 180 / 512 px.
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
const PIP = MOODS.map(m => `characters/pip_${m}.svg`).concat(['characters/pip_full_wave.svg']);
const SMALL = [['characters/crown.svg', 80, 90], ['characters/puffer.svg', 120, 100], ['characters/puffer_up.svg', 120, 100], ['characters/pearl.svg', 48, 48]];
const BGS = {
  sand: '#F6EBD2',
  water: 'linear-gradient(#7FD0E3 0%,#DDF4EC 70%,#F1E2BE 85%,#E3CC9C 100%)',
  dark: 'linear-gradient(#1E3442,#38566A)',
};
const img = (rel, w, h, style = '') => `<img src="${uri(rel)}" width="${w}" height="${h}" style="${style}">`;
const panel = (bg, inner) => `<div class="p" style="background:${bg}">${inner}</div>`;
function anchor(rel, w, h, vw, pts) {
  const k = w / vw;
  const marks = pts.map(([x, y]) => `<div style="position:absolute;left:${x * k - 7}px;top:${y * k}px;width:14px;border-top:2px solid red"></div>
    <div style="position:absolute;left:${x * k}px;top:${y * k - 7}px;height:14px;border-left:2px solid red"></div>`).join('');
  return `<div style="position:relative">${img(rel, w, h, 'outline:1px dashed rgba(0,0,0,.35);background:rgba(255,255,255,.4)')}${marks}</div>`;
}
const css = `<style>body{margin:0;background:#666;width:max-content}.p{display:flex;flex-wrap:nowrap;gap:12px;padding:14px;align-items:flex-end}</style>`;

async function shot(b, html, file, width) {
  const p = await b.newPage({ viewport: { width, height: 400 } });
  await p.setContent(`<html><body>${css}${html}</body></html>`);
  await p.waitForTimeout(300);
  const f = path.join(OUT, file);
  await p.screenshot({ path: f, fullPage: true });
  await p.close();
  console.log(f);
}

(async () => {
  const b = await chromium.launch();
  const H = 300, W = Math.round(300 * H / 400);
  let s = '';
  for (const bg of Object.values(BGS)) {
    s += panel(bg, PIP.map(f => img(f, W, H)).join('') +
      img(SMALL[0][0], 64, 72) + img(SMALL[1][0], 72, 60) + img(SMALL[2][0], 72, 60) + img(SMALL[3][0], 36, 36));
  }
  s += panel('#F6FAFF', PIP.map(f => {
    const pts = [[150, 392]];
    if (f.includes('hold')) pts.push([290, 170]);
    if (f.includes('blow')) pts.push([265, 150]);
    return anchor(f, 225, 300, 300, pts);
  }).join('') + anchor(SMALL[0][0], 160, 180, 80, [[40, 86]]) + anchor(SMALL[3][0], 144, 144, 48, [[24, 22], [24, 46]]));
  await shot(b, s, 'pip_sheet.png', 2600);

  let t = '';
  t += panel(BGS.water, PIP.slice(0, 5).map(f => img(f, 900, 1200)).join(''));
  t += panel(BGS.sand, PIP.slice(5).map(f => img(f, 900, 1200)).join(''));
  t += panel(BGS.dark, SMALL.map(([f, w, h]) => img(f, w * 3, h * 3)).join('') + SMALL.map(([f, w, h]) => img(f, w, h)).join(''));
  await shot(b, t, 'pip_sheet_3x.png', 4700);

  await shot(b, panel('#FFFFFF', img('icon.svg', 60, 60, 'border-radius:13px') + img('icon.svg', 180, 180, 'border-radius:40px') + img('icon.svg', 512, 512)), 'icon_sheet.png', 820);

  const p = await b.newPage();
  for (const f of PIP.concat(SMALL.map(x => x[0]), ['icon.svg'])) {
    await p.setContent(fs.readFileSync(path.join(A, f), 'utf8'));
    const bb = await p.evaluate(() => { const r = document.querySelector('svg').getBBox(); return [r.x, r.y, r.x + r.width, r.y + r.height].map(v => Math.round(v)); });
    console.log(f, 'bbox', bb.join(','));
  }
  await b.close();
})();
