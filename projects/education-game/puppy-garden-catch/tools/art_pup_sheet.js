// Contact sheets for artist A's sprites (Pip, basket, balls, bubble, icon).
// Usage: node tools/art_pup_sheet.js [outDir] [rimDyFrac]   (default docs/art, 0.55 = DESIGN §2)
// Writes pup_sheet.png (in-game sizes on sky / grass / dark), pup_sheet_3x.png (3x zoom),
// pup_frames.png (all 9 frames with the feet-anchor cross and the paws box), pup_composite.png
// (Pip + basket_back + balls + basket_front stacked like the game, at rimDy 0.55·h and an alternative).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const OUT = process.argv[2] || path.join(ROOT, 'docs/art');
fs.mkdirSync(OUT, { recursive: true });
const uri = rel => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, rel)).toString('base64');
const PUP = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'run1', 'run2'].map(n => `characters/pup_${n}.svg`);
const BALLS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'plain'].map(n => `items/ball_${n}.svg`);
const BGS = ['#BFE6FF', '#9CC36E', '#2B3440'];
const img = (rel, w, h, style = '') => `<img src="${uri(rel)}" width="${w}" height="${h}" style="${style}">`;
const abs = (rel, x, y, w, h, extra = '') => img(rel, w, h, `position:absolute;left:${x}px;top:${y}px;${extra}`);
const panel = (bg, inner) => `<div class="p" style="background:${bg}">${inner}</div>`;

// Game-like stack: pup h, basket w, rim y = feet - frac*h, balls inside, paws circles over the rim
function composite(pupRel, h, bw, frac, balls, label) {
  const W = Math.max(bw + 60, h + 60), H = h + 70;
  const px = W / 2, feet = 20 + h * 244 / 256;
  const pupTop = feet - h * 244 / 256, pupLeft = px - h / 2;
  const s = bw / 256, bh = 160 * s, rimY = feet - frac * h, bTop = rimY - 40 * s, bLeft = px - bw / 2;
  const bs = bw * 0.36;
  const ballImgs = balls.map((b, i) => {
    const n = balls.length, x = px + (n === 1 ? 0 : (i / (n - 1) - 0.5) * bw * 0.5);
    return abs(b, x - bs / 2, rimY - bs * 0.55 + (i % 2) * 6, bs, bs, `transform:rotate(${(i - 1) * 12}deg)`);
  }).join('');
  // paws drawn by code over the front rim (circle pair in Pip's colours)
  const pawY = rimY + 26 * s - 4, pr = h * 0.06;
  const paws = [-1, 1].map(k => `<div style="position:absolute;left:${px + k * bw * 0.26 - pr}px;top:${pawY - pr}px;width:${pr * 2}px;height:${pr * 2}px;border-radius:50%;background:#FFF0D6;border:3px solid #D9B98C;box-sizing:border-box"></div>`).join('');
  return `<div style="position:relative;width:${W}px;height:${H}px">
    <div style="position:absolute;left:0;right:0;top:${feet}px;bottom:0;background:rgba(80,120,40,.35)"></div>
    ${abs(pupRel, pupLeft, pupTop, h, h)}${abs('items/basket_back.svg', bLeft, bTop, bw, bh)}${ballImgs}
    ${abs('items/basket_front.svg', bLeft, bTop, bw, bh)}${paws}
    <div style="position:absolute;left:4px;bottom:2px;font:12px sans-serif;color:#222">${label}</div></div>`;
}

function row(bg, s) {
  return panel(bg, PUP.map(p => img(p, 180 * s, 180 * s)).join('')) +
    panel(bg, BALLS.map(b => img(b, 110 * s, 110 * s)).join('') +
      `<div style="position:relative;width:${148 * s}px;height:${148 * s}px">${abs('items/ball_red.svg', 19 * s, 19 * s, 110 * s, 110 * s)}${abs('items/bubble.svg', 0, 0, 148 * s, 148 * s)}</div>` +
      `<div style="position:relative;width:${148 * s}px;height:${148 * s}px">${abs('items/ball_plain.svg', 19 * s, 19 * s, 110 * s, 110 * s)}${abs('items/bubble.svg', 0, 0, 148 * s, 148 * s)}</div>` +
      img('items/bubble.svg', 148 * s, 148 * s) +
      img('ui/star.svg', 56 * s, 56 * s) + img('ui/star_empty.svg', 56 * s, 56 * s) +
      img('icon.svg', 60 * s, 60 * s, 'border-radius:13px') + img('icon.svg', 120 * s, 120 * s, 'border-radius:26px')) +
    panel(bg, img('items/basket_back.svg', 230 * s, 144 * s) + img('items/basket_front.svg', 230 * s, 144 * s) +
      `<div style="position:relative;width:${230 * s}px;height:${144 * s}px">${abs('items/basket_back.svg', 0, 0, 230 * s, 144 * s)}${abs('items/basket_front.svg', 0, 0, 230 * s, 144 * s)}</div>`);
}

const frames = panel('#BFE6FF', PUP.map(p => `<div style="position:relative">${img(p, 256, 256, 'outline:1px dashed rgba(0,0,0,.3)')}
  <div style="position:absolute;left:0;right:0;top:244px;border-top:1px solid red"></div>
  <div style="position:absolute;top:0;bottom:0;left:128px;border-left:1px solid red"></div>
  <div style="position:absolute;left:70px;top:135px;width:116px;height:35px;border:1px dashed blue"></div></div>`).join(''));

const frac = parseFloat(process.argv[3] || '0.55');
const comps = BGS.map(bg => panel(bg,
  composite('characters/pup_idle.svg', 180, 230, frac, ['items/ball_red.svg', 'items/ball_blue.svg', 'items/ball_yellow.svg'], `spec rimDy ${frac}·h`) +
  composite('characters/pup_happy.svg', 180, 230, frac, ['items/ball_green.svg'], 'happy') +
  composite('characters/pup_run1.svg', 180, 230, frac, [], 'run1') +
  composite('characters/pup_idle.svg', 180, 230, 0.30, ['items/ball_red.svg', 'items/ball_blue.svg', 'items/ball_yellow.svg'], 'alt rimDy 0.30·h') +
  composite('characters/pup_cheer.svg', 180, 230, 0.30, ['items/ball_purple.svg', 'items/ball_orange.svg'], 'alt cheer') +
  composite('characters/pup_talk.svg', 180, 230, 0.33, [], 'alt talk 0.33'))).join('');

const css = `<style>body{margin:0;background:#666}.p{display:flex;flex-wrap:wrap;gap:12px;padding:12px;align-items:flex-end}</style>`;
(async () => {
  const b = await chromium.launch();
  const shots = [
    ['pup_sheet.png', 1800, BGS.map(c => row(c, 1)).join('')],
    ['pup_sheet_3x.png', 1900, panel(BGS[0], PUP.slice(0, 4).map(x => img(x, 440, 440)).join('')) +
      panel(BGS[1], PUP.slice(4, 8).map(x => img(x, 440, 440)).join('')) +
      panel(BGS[2], PUP.slice(8).map(x => img(x, 440, 440)).join('') + BALLS.slice(0, 3).map(x => img(x, 330, 330)).join('')) +
      panel(BGS[0], BALLS.slice(3).map(x => img(x, 330, 330)).join('') + img('items/bubble.svg', 400, 400)) +
      panel(BGS[1], `<div style="position:relative;width:690px;height:432px">${abs('items/basket_back.svg', 0, 0, 690, 432)}${abs('items/basket_front.svg', 0, 0, 690, 432)}</div>` + img('icon.svg', 512, 512, 'border-radius:110px'))],
    ['pup_frames.png', 1900, frames],
    ['pup_composite.png', 1900, comps],
  ];
  for (const [name, width, body] of shots) {
    const p = await b.newPage({ viewport: { width, height: 400 } });
    await p.setContent(`<html><body>${css}${body}</body></html>`);
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(OUT, name), fullPage: true });
    await p.close();
    console.log(path.join(OUT, name));
  }
  await b.close();
})();
