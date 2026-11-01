// Contact sheets for artist A's sprites (Tutu, shells, pearl, tag, mounds, chests, sign, UI, avatars, icon).
// Usage: node tools/art_tutu_sheet.js [outDir]   (default docs/art)
// Writes tutu_sheet.png (9 frames at 180 px on sand / turquoise / navy), tutu_sheet_3x.png,
// tutu_frames.png (frames at 256 px with the feet-anchor cross), items_sheet.png (in-game sizes with a
// shell sandwiched between chest_back and chest_front, and an item poking out of a mound),
// items_sheet_3x.png, ui_sheet.png (stars, pearl icon, trophies, lagoon badges, lock, avatars, icon).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const OUT = process.argv[2] || path.join(ROOT, 'docs/art');
fs.mkdirSync(OUT, { recursive: true });
const uri = rel => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, rel)).toString('base64');
const TUTU = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'dance_a', 'dance_b'].map(n => `characters/tutu_${n}.svg`);
const SHELLS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple'].map(n => `items/shell_${n}.svg`);
const BGS = ['#F2DFB3', '#5FC9DD', '#13305A'];
const img = (rel, w, h, style = '') => `<img src="${uri(rel)}" width="${w}" height="${h}" style="${style}">`;
const abs = (rel, x, y, w, h, extra = '') => img(rel, w, h, `position:absolute;left:${x}px;top:${y}px;${extra}`);
const panel = (bg, inner) => `<div class="p" style="background:${bg}">${inner}</div>`;

// chest of width w (viewBox 256x200): back, an item at the opening centre (128,54), front
function chest(w, item = 'items/shell_red.svg', itemPx = 0.42) {
  const s = w / 256, h = 200 * s, pad = 70 * s, is = itemPx * w;
  const cx = w / 2, oy = pad + 54 * s;
  return `<div style="position:relative;width:${w}px;height:${h + pad}px">
    ${abs('items/chest_back.svg', 0, pad, w, h)}
    ${abs(item, cx - is / 2, oy - is * 0.62, is, is)}
    ${abs('items/chest_front.svg', 0, pad, w, h)}</div>`;
}
function longChest(w, items) {
  const s = w / 512, h = 200 * s, pad = 70 * s, is = 92 * s, oy = pad + 60 * s;
  let it = '';
  items.forEach((rel, i) => { it += abs(rel, w * (0.16 + 0.68 * i / (items.length - 1)) - is / 2, oy - is * 0.62, is, is); });
  return `<div style="position:relative;width:${w}px;height:${h + pad}px">
    ${abs('items/long_back.svg', 0, pad, w, h)}${it}
    ${abs('items/long_front.svg', 0, pad, w, h)}</div>`;
}
// mound of width w (viewBox 160x96, crest y 30): item behind, 42 % of it visible above the crest
function mound(w, item = 'items/shell_green.svg', peek = 0.42) {
  const s = w / 160, h = 96 * s, is = 0.6 * w, crest = 30 * s, pad = is;
  return `<div style="position:relative;width:${w}px;height:${h + pad}px">
    ${abs(item, w / 2 - is / 2, pad + crest - is * peek, is, is)}
    ${abs('items/mound.svg', 0, pad, w, h)}</div>`;
}

const tutuRow = (bg, sz) => panel(bg, TUTU.map(p => img(p, sz, sz)).join(''));
const itemsRow = (bg, k) => panel(bg, SHELLS.map(x => img(x, 110 * k, 110 * k)).join('') +
  img('items/pearl.svg', 110 * k, 110 * k) + img('items/tag.svg', 110 * k, 110 * k) +
  img('items/sign.svg', 126 * k, 110 * k)) +
  panel(bg, chest(230 * k) + chest(230 * k, 'items/pearl.svg') + chest(230 * k, 'items/tag.svg') +
    longChest(440 * k, ['items/pearl.svg', 'items/pearl.svg', 'items/pearl.svg', 'items/pearl.svg'])) +
  panel(bg, mound(165 * k) + mound(165 * k, 'items/pearl.svg') + mound(165 * k, 'items/tag.svg') + mound(165 * k, 'items/shell_yellow.svg', 1.0) +
    img('items/mound_hole.svg', 165 * k, 99 * k) + img('items/mound.svg', 165 * k, 99 * k));
const uiRow = (bg, k) => panel(bg,
  img('ui/star.svg', 56 * k, 56 * k) + img('ui/star_empty.svg', 56 * k, 56 * k) + img('ui/pearl_icon.svg', 28 * k, 28 * k) + img('ui/pearl_icon.svg', 56 * k, 56 * k) +
  img('ui/lock.svg', 48 * k, 48 * k) +
  ['bronze', 'silver', 'gold'].map(n => img(`ui/trophy_${n}.svg`, 110 * k, 110 * k)).join('') +
  img('icon.svg', 60 * k, 60 * k, 'border-radius:13px') + img('icon.svg', 120 * k, 120 * k, 'border-radius:26px')) +
  panel(bg, [1, 2, 3, 4, 5, 6].map(n => img(`ui/lagoon_${n}.svg`, 136 * k, 136 * k)).join('')) +
  panel(bg, ['turtle', 'crab', 'octopus', 'seahorse', 'clownfish', 'dolphin'].map(n => img(`avatars/${n}.svg`, 120 * k, 120 * k)).join('') +
    ['turtle', 'crab', 'octopus', 'seahorse', 'clownfish', 'dolphin'].map(n => img(`avatars/${n}.svg`, 64 * k, 64 * k)).join(''));

const frames = panel('#F2DFB3', TUTU.map(p => `<div style="position:relative">${img(p, 256, 256, 'outline:1px dashed rgba(0,0,0,.3)')}
  <div style="position:absolute;left:0;right:0;top:244px;border-top:1px solid red"></div>
  <div style="position:absolute;top:0;bottom:0;left:128px;border-left:1px solid red"></div></div>`).join(''));

const css = `<style>body{margin:0;background:#666}.p{display:flex;flex-wrap:wrap;gap:14px;padding:14px;align-items:flex-end}</style>`;
(async () => {
  const b = await chromium.launch();
  const shots = [
    ['tutu_sheet.png', 1800, BGS.map(c => tutuRow(c, 180)).join('')],
    ['tutu_sheet_3x.png', 2300, BGS.map(c => panel(c, TUTU.slice(0, 5).map(x => img(x, 440, 440)).join('')) +
      panel(c, TUTU.slice(5).map(x => img(x, 440, 440)).join(''))).join('')],
    ['tutu_frames.png', 2500, frames],
    ['items_sheet.png', 1500, BGS.map(c => itemsRow(c, 1)).join('')],
    ['items_sheet_3x.png', 2600, BGS.map(c => panel(c, SHELLS.map(x => img(x, 330, 330)).join('') + img('items/pearl.svg', 330, 330) + img('items/tag.svg', 330, 330))).join('') +
      BGS.map(c => panel(c, chest(690) + mound(495) + img('items/sign.svg', 384, 336))).join('') +
      panel(BGS[1], longChest(1320, ['items/pearl.svg', 'items/pearl.svg', 'items/pearl.svg']) + img('items/mound_hole.svg', 495, 297))],
    ['ui_sheet.png', 1500, BGS.map(c => uiRow(c, 1)).join('') + panel(BGS[0], img('icon.svg', 512, 512, 'border-radius:110px'))],
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
