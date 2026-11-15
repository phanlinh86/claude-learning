#!/usr/bin/env node
// Nim's River Hop — contact sheets for character artist A's SVGs.
// Run from the game folder root:  python3 tools/art_nim.py && node tools/nim_sheet.js
//   → docs/art/nim_frames.png  every Nim frame at in-game size (190 px) on light sky, grass #9CC98A and dark #3A4048,
//                              then at 3× (570 px) on the light sky with 4 apple circles (46 units) at NH.NIM_POINTS
//                              backSlots (crouch: + crouchDy, jump: + jumpDy, roll: rollSlots), red crosses at feet / mouth,
//                              the hit box dashed
//     docs/art/nim_extras.png  fish, fish_flip, frog, frog_croak, nim_title at in-game size and 3×; icon at 512 / 180 / 60
// Prints a JSON check: lowest opaque pixel per frame (standing frames must reach y≈290) and the body-region pixel
// difference vs idle (coat + legs region, must be 0 for the standing frames).
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const CH = path.join(ROOT, 'game', 'assets', 'default', 'characters');
const OUT = path.join(ROOT, 'docs', 'art');
require(path.join(ROOT, 'game', 'js', 'nim_points.js'));
const NP = globalThis.NH.NIM_POINTS;
const FRAMES = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'crouch', 'jump', 'roll', 'wave', 'giggle', 'dance', 'title'];
const STAND = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'wave', 'giggle', 'dance', 'title'];
const BG = { sky: 'linear-gradient(#CFE6F5,#F6F1E4)', grass: '#9CC98A', dark: '#3A4048', water: 'linear-gradient(#7FB8B4,#4E8E95)' };
const uri = f => 'data:image/svg+xml;base64,' + fs.readFileSync(f).toString('base64');
const file = p => path.join(CH, 'nim_' + p + '.svg');

function cross(x, y, k, col = 'red') {
  const s = 9;
  return `<div style="position:absolute;left:${x * k - s}px;top:${y * k - 1}px;width:${2 * s}px;height:2px;background:${col}"></div>` +
    `<div style="position:absolute;left:${x * k - 1}px;top:${y * k - s}px;width:2px;height:${2 * s}px;background:${col}"></div>`;
}
function ring(x, y, r, k, col) {
  return `<div style="position:absolute;left:${(x - r) * k}px;top:${(y - r) * k}px;width:${2 * r * k}px;height:${2 * r * k}px;` +
    `border-radius:50%;background:${col};opacity:.8;box-sizing:border-box;border:2px solid #A9473F"></div>`;
}
function cell(src, w, h, marks = '') {
  return `<div style="position:relative;width:${w}px;height:${h}px;outline:1px dashed rgba(0,0,0,.12)">` +
    `<img src="${src}" style="width:${w}px;height:${h}px;display:block">${marks}</div>`;
}
function row(bg, cells, pad = 12) {
  return `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:${pad}px;padding:${pad}px;background:${bg}">${cells.join('')}</div>`;
}
async function shot(page, html, name, width) {
  await page.setContent(`<html><body style="margin:0;display:inline-block;width:${width || 'auto'}px">${html}</body></html>`);
  await page.waitForTimeout(250);
  await (await page.$('body')).screenshot({ path: path.join(OUT, name) });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 3000, height: 1400 } });
  const srcs = FRAMES.map(p => uri(file(p)));

  const k3 = 1.9;   // 3× of the 190 px in-game size → 570 px per frame
  const marks = (p) => {
    let m = '';
    if (p === 'roll') NP.rollSlots.forEach(([x, y]) => { m += ring(x, y, 23, k3, '#E77A6E'); });
    else if (p !== 'title') {
      const dy = p === 'crouch' ? NP.crouchDy : p === 'jump' ? NP.jumpDy : 0;
      NP.backSlots.forEach(([x, y]) => { m += ring(x, y + dy, 23, k3, '#E77A6E'); });
    }
    m += cross(NP.feet[0], NP.feet[1], k3) + cross(NP.mouth[0], NP.mouth[1], k3, '#c0f');
    if (p === 'roll') m += `<div style="position:absolute;left:${(NP.rollC[0] - NP.rollR) * k3}px;top:${(NP.rollC[1] - NP.rollR) * k3}px;width:${2 * NP.rollR * k3}px;height:${2 * NP.rollR * k3}px;border-radius:50%;border:2px dashed #06c;box-sizing:border-box"></div>`;
    const [x0, y0, x1, y1] = NP.box;
    m += `<div style="position:absolute;left:${x0 * k3}px;top:${y0 * k3}px;width:${(x1 - x0) * k3}px;height:${(y1 - y0) * k3}px;border:2px dashed rgba(0,0,0,.35);box-sizing:border-box"></div>`;
    return m;
  };
  const small = ['sky', 'grass', 'dark'].map(k => row(BG[k], srcs.map(s => cell(s, 190, 190)), 6)).join('');
  const big = row(BG.sky, FRAMES.map((p, i) => cell(srcs[i], 300 * k3, 300 * k3, marks(p))));
  await shot(page, small + big, 'nim_frames.png', 2940);

  const res = await page.evaluate(async ({ list, idle }) => {
    const load = async (src) => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = c.height = 300; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 300, 300); return x.getImageData(0, 0, 300, 300).data; };
    const base = await load(idle);
    const out = {};
    for (const [name, src] of list) {
      const d = await load(src);
      let diff = 0;
      // coat region left of x 136 and above y 270 (no paw / face feature reaches it, except the wave/cheer paw circles)
      for (let y = 40; y < 226; y++) for (let x = 10; x < 136; x++) {
        const i = (y * 300 + x) * 4;
        if (Math.abs(d[i] - base[i]) + Math.abs(d[i + 1] - base[i + 1]) + Math.abs(d[i + 2] - base[i + 2]) + Math.abs(d[i + 3] - base[i + 3]) > 8) diff++;
      }
      let y1 = 0, x0 = 300, x1 = 0, y0 = 300;
      for (let y = 0; y < 300; y++) for (let x = 0; x < 300; x++) if (d[(y * 300 + x) * 4 + 3] > 8) { y1 = Math.max(y1, y); y0 = Math.min(y0, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
      out[name] = { coatDiffPx: diff, bbox: [x0, y0, x1 + 1, y1 + 1] };
    }
    return out;
  }, { list: FRAMES.map((p, i) => [p, srcs[i]]), idle: srcs[0] });
  console.log(JSON.stringify(res, null, 0));

  const oth = [['fish', 140, 100], ['fish_flip', 140, 100], ['frog', 140, 120], ['frog_croak', 140, 120]].map(([n, w, h]) => [uri(path.join(CH, n + '.svg')), w, h]);
  // in-game: fish ≈ 90 px wide, frog ≈ 100 px wide
  const s1 = oth.map(([s, w, h]) => cell(s, w * 0.7, h * 0.7));
  const s3 = oth.map(([s, w, h]) => cell(s, w * 2.1, h * 2.1));
  const title = uri(file('title'));
  const icon = uri(path.join(ROOT, 'game', 'assets', 'default', 'icon.svg'));
  const html = ['water', 'grass', 'dark'].map(k => row(BG[k], [...s1, ...s3])).join('') +
    row(BG.sky, [cell(title, 190, 190), cell(title, 420, 420), cell(icon, 512, 512), cell(icon, 180, 180), cell(icon, 60, 60)]);
  await shot(page, html, 'nim_extras.png', 1500);
  await b.close();
})();
