// Contact sheets for artist A's sprites (Bim, rocket, wagon, stars, icon).
// Usage: node tools/art_bim_sheet.js [outDir]   (default docs/art)
// Writes:
//   bim_sheet.png    : the 7 cockpit frames + 2 full-body poses at in-game size (cockpit frame 141 px = 256 × 0.55 × 1,
//                      i.e. Bim at 0.55 in a 300-px rocket frame drawn 190 px tall → ×0.633) and at 3×, on morning /
//                      sunset / night skies, plus anchor-check frames (red cross = neck (128,236) / feet (128,288)).
//   rocket_sheet.png : the rocket composite (rocket_back + Bim at 0.55 on the neck point + rocket_front) at 190 px tall,
//                      upright and tilted ±0.5 rad, every mood, on the three skies; 3× composite; wagon halves with a
//                      sample item between them; stars; icon at 60 / 180 / 512.
// Also prints each SVG's drawn bounding box (getBBox).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const OUT = process.argv[2] || path.join(ROOT, 'docs/art');
fs.mkdirSync(OUT, { recursive: true });
const uri = rel => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, rel)).toString('base64');
const MOODS = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops'];
const SKIES = {
  morning: 'linear-gradient(#A9DBF7,#FFE3C9)',
  sunset: 'linear-gradient(#9E8BD6,#E7A2C4,#FFB38A)',
  night: 'linear-gradient(#1D2556,#3A2F6E)',
};
const img = (rel, w, h, style = '') => `<img src="${uri(rel)}" width="${w}" height="${h}" style="${style}">`;
const panel = (bg, inner) => `<div class="p" style="background:${bg}">${inner}</div>`;

// rocket composite: rocket frame 200×300 drawn h px tall; Bim's 256 box at 0.55 of the rocket frame with
// (128,236) on (100,118). Pivot of the tilt = feet bottom (100,296).
function rocket(h, mood, rot = 0) {
  const k = h / 300, W = 200 * k;
  const bimS = 256 * 0.55 * k;
  const bx = (100 - 128 * 0.55) * k, by = (118 - 236 * 0.55) * k;
  return `<div style="position:relative;width:${W}px;height:${h}px;transform:rotate(${rot}rad);transform-origin:${W / 2}px ${296 * k}px;margin:${h * 0.12}px ${h * 0.18}px">
    ${img('characters/rocket_back.svg', W, h, 'position:absolute;left:0;top:0')}
    ${img('characters/bim_' + mood + '.svg', bimS, bimS, `position:absolute;left:${bx}px;top:${by}px`)}
    ${img('characters/rocket_front.svg', W, h, 'position:absolute;left:0;top:0')}</div>`;
}
function wagon(k) {
  return `<div style="position:relative;width:${160 * k}px;height:${110 * k}px">
    ${img('items/wagon_back.svg', 160 * k, 110 * k, 'position:absolute;left:0;top:0')}
    ${img('ui/star.svg', 34 * k, 34 * k, `position:absolute;left:${44 * k}px;top:${30 * k}px;transform:rotate(-12deg)`)}
    ${img('ui/star.svg', 30 * k, 30 * k, `position:absolute;left:${84 * k}px;top:${34 * k}px;transform:rotate(10deg)`)}
    ${img('items/wagon_front.svg', 160 * k, 110 * k, 'position:absolute;left:0;top:0')}
    <div style="position:absolute;left:${80 * k - 3}px;top:${18 * k - 3}px;width:6px;height:6px;background:red;border-radius:3px"></div></div>`;
}
function anchorFrame(rel, w, h, ax, ay) {
  return `<div style="position:relative">${img(rel, w, h, 'outline:1px dashed rgba(0,0,0,.35);background:rgba(255,255,255,.4)')}
    <div style="position:absolute;left:0;right:0;top:${ay}px;border-top:1px solid red"></div>
    <div style="position:absolute;top:0;bottom:0;left:${ax}px;border-left:1px solid red"></div></div>`;
}

const css = `<style>body{margin:0;background:#666}.p{display:flex;flex-wrap:wrap;gap:12px;padding:12px;align-items:flex-end}</style>`;
(async () => {
  const b = await chromium.launch();
  const inGame = Math.round(256 * 0.55 * 190 / 300);
  let bim = '';
  for (const s of Object.values(SKIES)) bim += panel(s, MOODS.map(m => img(`characters/bim_${m}.svg`, inGame, inGame)).join('') +
    img('characters/bim_full_wave.svg', 140, 164) + img('characters/bim_full_cheer.svg', 140, 164));
  for (const s of [SKIES.morning, SKIES.night]) {
    bim += panel(s, MOODS.slice(0, 4).map(m => img(`characters/bim_${m}.svg`, 384, 384)).join(''));
    bim += panel(s, MOODS.slice(4).map(m => img(`characters/bim_${m}.svg`, 384, 384)).join('') + img('characters/bim_full_wave.svg', 330, 387));
  }
  bim += panel('#F6FAFF', MOODS.map(m => anchorFrame(`characters/bim_${m}.svg`, 256, 256, 128, 236)).join('') +
    ['wave', 'cheer'].map(m => anchorFrame(`characters/bim_full_${m}.svg`, 256, 300, 128, 288)).join(''));

  let rk = '';
  for (const s of Object.values(SKIES)) {
    rk += panel(s, MOODS.map(m => rocket(190, m)).join(''));
    rk += panel(s, [-0.5, -0.25, 0.25, 0.5].map((r, i) => rocket(190, MOODS[i * 2 % 7], r)).join('') + wagon(1) + wagon(1.6) +
      img('ui/star.svg', 32, 32) + img('ui/star_empty.svg', 32, 32) + img('ui/star.svg', 64, 64) + img('ui/star_empty.svg', 64, 64));
  }
  rk += panel(SKIES.morning, rocket(570, 'idle') + rocket(570, 'cheer') + wagon(3));
  rk += panel('#FFFFFF', img('icon.svg', 60, 60, 'border-radius:13px') + img('icon.svg', 180, 180, 'border-radius:40px') + img('icon.svg', 512, 512));
  for (const [name, width, body] of [['bim_sheet.png', 1700, bim], ['rocket_sheet.png', 1900, rk]]) {
    const p = await b.newPage({ viewport: { width, height: 400 } });
    await p.setContent(`<html><body>${css}${body}</body></html>`);
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(OUT, name), fullPage: true });
    await p.close();
    console.log(path.join(OUT, name));
  }
  const p = await b.newPage();
  const files = MOODS.map(m => `characters/bim_${m}.svg`).concat(['characters/bim_full_wave.svg', 'characters/bim_full_cheer.svg',
    'characters/rocket_back.svg', 'characters/rocket_front.svg', 'items/wagon_back.svg', 'items/wagon_front.svg', 'ui/star.svg']);
  for (const f of files) {
    await p.setContent(fs.readFileSync(path.join(A, f), 'utf8'));
    const bb = await p.evaluate(() => { const r = document.querySelector('svg').getBBox(); return [r.x, r.y, r.x + r.width, r.y + r.height].map(v => Math.round(v)); });
    console.log(f, 'bbox', bb.join(','));
  }
  await b.close();
})();
