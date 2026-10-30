// Contact sheets for artist A's sprites (Bo, eggs, nest, sign, stars, icon).
// Usage: node tools/art_characters_sheet.js [outDir]   (default docs/art)
// Writes characters_sheet.png (in-game sizes on sky + grass), characters_sheet_3x.png (3x zoom),
// characters_frames.png (Bo's 7 frames side by side with the anchor cross).
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const OUT = process.argv[2] || path.join(ROOT, 'docs/art');
fs.mkdirSync(OUT, { recursive: true });
const uri = rel => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, rel)).toString('base64');
const BO = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops'].map(n => `characters/bo_${n}.svg`);
const EGGS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'plain'].map(n => `items/egg_${n}.svg`);
const BGS = [['sky', '#BFE6FF'], ['grass', '#9BCB6B']];

const img = (rel, w, h, style = '') => `<img src="${uri(rel)}" width="${w}" height="${h}" style="${style}">`;
// nest of width w with eggs composited between back and front (eggs ~ 0.46*w each, sitting in the opening)
function nest(w, eggs, s = 1) {
  const h = w * 160 / 256, eh = w * 0.5;
  const n = eggs.length, cx = w / 2, oy = h * 62 / 160;
  const spread = w * 0.5;
  const eggImgs = eggs.map((e, i) => {
    const x = cx + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread) - eh / 2;
    const y = oy + eh * 0.06 - eh * 0.62; // egg centre ~ a bit below the opening centre
    return img(e, eh, eh, `position:absolute;left:${x}px;top:${y}px;transform:rotate(${(i - (n - 1) / 2) * 8}deg)`);
  }).join('');
  return `<div style="position:relative;width:${w}px;height:${h}px;margin-top:${eh * 0.4}px">
    ${img('items/nest_back.svg', w, h, 'position:absolute;left:0;top:0')}${eggImgs}
    ${img('items/nest_front.svg', w, h, 'position:absolute;left:0;top:0')}</div>`;
}
// sign with a label drawn on a canvas in the board rect (x12-116, y8-78 of 128x112)
let signN = 0;
function sign(w, label, color) {
  const h = w * 112 / 128, id = 'sg' + (signN++);
  return `<div style="position:relative;width:${w}px;height:${h}px">${img('items/sign.svg', w, h)}
    <canvas id="${id}" data-label="${label}" data-color="${color || ''}" width="${w * 2}" height="${h * 2}"
      style="position:absolute;left:0;top:0;width:${w}px;height:${h}px"></canvas></div>`;
}
const panel = (bg, inner) => `<div class="p" style="background:${bg}">${inner}</div>`;

function row(bg, s) {
  return panel(bg, BO.map(b => img(b, 180 * s, 180 * s)).join('')) +
    panel(bg, EGGS.map(e => img(e, 110 * s, 110 * s)).join('') +
      img('ui/star.svg', 56 * s, 56 * s) + img('ui/star_empty.svg', 56 * s, 56 * s) +
      img('icon.svg', 60 * s, 60 * s, 'border-radius:13px') + img('icon.svg', 120 * s, 120 * s, 'border-radius:26px')) +
    panel(bg, `<div style="display:flex;flex-direction:column;align-items:center">${sign(121 * s, 'A')}${nest(220 * s, ['items/egg_red.svg', 'items/egg_blue.svg'])}</div>` +
      `<div style="display:flex;flex-direction:column;align-items:center">${sign(121 * s, '', '#3C8DE8')}${nest(220 * s, ['items/egg_yellow.svg', 'items/egg_green.svg', 'items/egg_plain.svg'])}</div>` +
      `<div style="display:flex;flex-direction:column;align-items:center">${sign(121 * s, '7')}${nest(220 * s, ['items/egg_purple.svg'])}</div>` +
      `<div style="display:flex;flex-direction:column;align-items:center">${sign(121 * s, 'big')}${nest(220 * s, [])}</div>` +
      `<div style="display:flex;flex-direction:column;align-items:center"><div style="font:12px sans-serif">back only</div>${img('items/nest_back.svg', 220 * s, 137 * s)}<div style="font:12px sans-serif">front only</div>${img('items/nest_front.svg', 220 * s, 137 * s)}</div>`);
}

const frames = panel('#BFE6FF', BO.map(b => `<div style="position:relative">${img(b, 256, 256, 'outline:1px dashed rgba(0,0,0,.3)')}
  <div style="position:absolute;left:0;right:0;top:244px;border-top:1px solid red"></div>
  <div style="position:absolute;top:0;bottom:0;left:128px;border-left:1px solid red"></div></div>`).join('')) +
  panel('#9BCB6B', BO.map(b => img(b, 90, 90)).join('') + EGGS.map(e => img(e, 56, 56)).join('') + img('icon.svg', 60, 60, 'border-radius:13px') + img('icon.svg', 29, 29, 'border-radius:7px'));

const css = `<style>body{margin:0;background:#666}.p{display:flex;flex-wrap:wrap;gap:12px;padding:12px;align-items:flex-end}</style>`;
const drawSigns = () => {
  document.querySelectorAll('canvas[data-label]').forEach(c => {
    const g = c.getContext('2d'), sx = c.width / 128;
    const x = 12 * sx, y = 8 * sx, w = 104 * sx, h = 70 * sx;
    if (c.dataset.color) { g.fillStyle = c.dataset.color; g.beginPath(); g.arc(x + w / 2, y + h / 2, h * 0.34, 0, 7); g.fill(); }
    const t = c.dataset.label; if (!t) return;
    g.fillStyle = '#4A3020'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `bold ${Math.round(h * (t.length > 2 ? 0.5 : 0.78))}px "Arial Rounded MT Bold", Arial, sans-serif`;
    g.fillText(t, x + w / 2, y + h / 2 + h * 0.04);
  });
};

(async () => {
  const b = await chromium.launch();
  const shots = [
    ['characters_sheet.png', 1500, BGS.map(([, c]) => row(c, 1)).join('')],
    ['characters_sheet_3x.png', 1900, BGS.slice(0, 1).map(([, c]) => panel(c, BO.slice(0, 4).map(x => img(x, 440, 440)).join('')) + panel(c, EGGS.map(e => img(e, 330, 330)).join(''))).join('') +
      panel('#9BCB6B', BO.slice(3).map(x => img(x, 440, 440)).join('')) +
      panel('#9BCB6B', nest(660, ['items/egg_red.svg', 'items/egg_blue.svg']) + sign(363, 'B') + img('ui/star.svg', 192, 192) + img('ui/star_empty.svg', 192, 192) + img('icon.svg', 360, 360, 'border-radius:80px'))],
    ['characters_frames.png', 1900, frames],
  ];
  for (const [name, width, body] of shots) {
    const p = await b.newPage({ viewport: { width, height: 400 } });
    await p.setContent(`<html><body>${css}${body}</body></html>`);
    await p.waitForTimeout(300);
    await p.evaluate(drawSigns);
    await p.screenshot({ path: path.join(OUT, name), fullPage: true });
    await p.close();
    console.log(path.join(OUT, name));
  }
  await b.close();
})();
