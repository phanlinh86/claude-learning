// Contact sheets for artist A's sprites (Pip, the squirrel critter, the icon).
// Usage: node tools/art_pip_sheet.js [outDir]   (default docs/art)
// Writes:
//   pip_sheet.png   : the 9 mood frames + full wave at in-game size (230 px tall = layout.pip.h) on light meadow green,
//                     snow white and dark backgrounds; critter + critter_pop at 100 px; anchor-check frames
//                     (red cross = feet anchor (128,292)).
//   pip_sheet_3x.png: every frame at 3× in-game size (690 px tall) on meadow and dark; critter at 3×; icon at 60/180/512.
// Also prints each SVG's drawn bounding box (getBBox).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const OUT = process.argv[2] || path.join(ROOT, 'docs/art');
fs.mkdirSync(OUT, { recursive: true });
const uri = rel => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, rel)).toString('base64');
const MOODS = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'cover', 'peek'];
const FRAMES = MOODS.map(m => `characters/pip_${m}.svg`).concat(['characters/pip_full_wave.svg']);
const BGS = {
  meadow: 'linear-gradient(#CDEBFB 0%,#F6F0D8 55%,#B9DC9C 56%,#9CC985 100%)',
  snow: 'linear-gradient(#C9D9EA 0%,#F2F6FA 55%,#FFFFFF 56%,#E6EEF6 100%)',
  dark: 'linear-gradient(#1D2A44,#2C3A52)',
};
const img = (rel, w, h, style = '') => `<img src="${uri(rel)}" width="${w}" height="${h}" style="${style}">`;
const panel = (bg, inner) => `<div class="p" style="background:${bg}">${inner}</div>`;
function anchorFrame(rel, w, h, ax, ay) {
  return `<div style="position:relative">${img(rel, w, h, 'outline:1px dashed rgba(0,0,0,.35);background:rgba(255,255,255,.4)')}
    <div style="position:absolute;left:0;right:0;top:${ay}px;border-top:1px solid red"></div>
    <div style="position:absolute;top:0;bottom:0;left:${ax}px;border-left:1px solid red"></div></div>`;
}
const css = `<style>body{margin:0;background:#666}.p{display:flex;flex-wrap:wrap;gap:10px;padding:14px;align-items:flex-end}</style>`;

(async () => {
  const b = await chromium.launch();
  const H = 230, W = Math.round(256 * H / 300);
  let s1 = '';
  for (const bg of Object.values(BGS)) {
    s1 += panel(bg, FRAMES.map(f => img(f, W, H)).join('') + img('characters/critter.svg', 100, 100) + img('characters/critter_pop.svg', 100, 100));
  }
  s1 += panel('#F6FAFF', FRAMES.map(f => anchorFrame(f, 256 * 0.7, 300 * 0.7, 128 * 0.7, 292 * 0.7)).join(''));
  let s3 = '';
  for (const bg of [BGS.meadow, BGS.dark]) {
    s3 += panel(bg, FRAMES.slice(0, 5).map(f => img(f, W * 3, H * 3)).join(''));
    s3 += panel(bg, FRAMES.slice(5).map(f => img(f, W * 3, H * 3)).join(''));
  }
  s3 += panel(BGS.meadow, img('characters/critter.svg', 384, 384) + img('characters/critter_pop.svg', 384, 384));
  s3 += panel('#FFFFFF', img('icon.svg', 60, 60, 'border-radius:13px') + img('icon.svg', 180, 180, 'border-radius:40px') + img('icon.svg', 512, 512));
  for (const [name, width, body] of [['pip_sheet.png', 2060, s1], ['pip_sheet_3x.png', 3060, s3]]) {
    const p = await b.newPage({ viewport: { width, height: 400 } });
    await p.setContent(`<html><body>${css}${body}</body></html>`);
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(OUT, name), fullPage: true });
    await p.close();
    console.log(path.join(OUT, name));
  }
  const p = await b.newPage();
  for (const f of FRAMES.concat(['characters/critter.svg', 'characters/critter_pop.svg', 'icon.svg'])) {
    await p.setContent(fs.readFileSync(path.join(A, f), 'utf8'));
    const bb = await p.evaluate(() => { const r = document.querySelector('svg').getBBox(); return [r.x, r.y, r.x + r.width, r.y + r.height].map(v => Math.round(v)); });
    console.log(f, 'bbox', bb.join(','));
  }
  await b.close();
})();
