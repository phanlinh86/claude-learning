// Contact sheet for artist A's sprites (Lulu, monkey, bananas, butterfly, icon).
// Usage: node tools/art_lulu_sheet.js [outDir]   (default docs/art)
// Writes lulu_sheet.png:
//   row panels on light, jungle green #5E9E6A and night #1C2650: the 9 Lulu frames at in-game size (200 px tall),
//   monkey ×3 at 100 px, bananas, butterflies; an anchor-check panel (red cross = feet (150,432), monkey hand (80,6),
//   banana stem (60,6), hold contact (285,60)); every Lulu frame at 3× (600 px tall); monkey/bananas at 3×; icon 60/180/512.
// Also prints each SVG's drawn bounding box (getBBox).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const OUT = process.argv[2] || path.join(ROOT, 'docs/art');
fs.mkdirSync(OUT, { recursive: true });
const uri = rel => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, rel)).toString('base64');
const MOODS = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'hold'];
const LULU = MOODS.map(m => `characters/lulu_${m}.svg`).concat(['characters/lulu_full_wave.svg']);
const MONK = ['swing', 'grab', 'cheer'].map(k => `characters/monkey_${k}.svg`);
const SMALL = ['characters/bananas.svg', 'characters/butterfly.svg', 'characters/butterfly_up.svg'];
const BGS = {
  light: 'linear-gradient(#DDF1FB 0%,#F4EFD6 70%,#CFE6C4 100%)',
  jungle: '#5E9E6A',
  night: 'linear-gradient(#1C2650,#3B4A7A)',
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
  const H = 200, W = Math.round(300 * H / 440);
  let s = '';
  for (const bg of Object.values(BGS)) {
    s += panel(bg, LULU.map(f => img(f, W, H)).join('') + MONK.map(f => img(f, 80, 100)).join('') +
      img(SMALL[0], 60, 65) + img(SMALL[1], 48, 40) + img(SMALL[2], 48, 40));
  }
  s += panel('#F6FAFF', LULU.map(f => anchor(f, 210, 308, 300, f.includes('hold') ? [[150, 432], [285, 60]] : [[150, 432]])).join('') +
    MONK.map(f => anchor(f, 160, 200, 160, [[80, 6]])).join('') + anchor(SMALL[0], 120, 130, 120, [[60, 6]]));
  s += panel(BGS.jungle, LULU.slice(0, 5).map(f => img(f, W * 3, H * 3)).join(''));
  s += panel(BGS.light, LULU.slice(5).map(f => img(f, W * 3, H * 3)).join(''));
  s += panel(BGS.night, MONK.map(f => img(f, 240, 300)).join('') + img(SMALL[0], 240, 260) + img(SMALL[1], 192, 160) + img(SMALL[2], 192, 160));
  s += panel('#FFFFFF', img('icon.svg', 60, 60, 'border-radius:13px') + img('icon.svg', 180, 180, 'border-radius:40px') + img('icon.svg', 512, 512));
  const p = await b.newPage({ viewport: { width: 2200, height: 400 } });
  await p.setContent(`<html><body>${css}${s}</body></html>`);
  await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(OUT, 'lulu_sheet.png'), fullPage: true });
  console.log(path.join(OUT, 'lulu_sheet.png'));
  for (const f of LULU.concat(MONK, SMALL, ['icon.svg'])) {
    await p.setContent(fs.readFileSync(path.join(A, f), 'utf8'));
    const bb = await p.evaluate(() => { const r = document.querySelector('svg').getBBox(); return [r.x, r.y, r.x + r.width, r.y + r.height].map(v => Math.round(v)); });
    console.log(f, 'bbox', bb.join(','));
  }
  await b.close();
})();
