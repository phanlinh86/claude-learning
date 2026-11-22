#!/usr/bin/env node
// Mimi's Splash Rocket — contact sheets for character artist A's SVGs.
// Run from the game folder root:  python3 tools/art_mimi.py && node tools/mimi_sheet.js
//   → docs/art/mimi_frames.png  every Mimi frame at in-game size (180 px) on light sky, grass #A9CF8E and dark #3A4048,
//                               then at 3× (540 px) on light sky with the DK.MIMI_POINTS marks (feet / wing tip / hat top
//                               crosses, hit box dashed)
//     docs/art/mimi_rocket.png  rocket (120 px tall in game) + chute / chute_closed attached to the nose, 1× and 3× on
//                               the three backgrounds, with nozzle / nose / com crosses at 3×
//     docs/art/mimi_extras.png  marmot ×2, goat ×2, bird ×2 (in-game ≈ 100 / 110 / 60 px) and 3×; title; icon 512/180/60
// Prints a JSON check: bbox of every frame (all must reach y ≈ 290) and the body-region pixel difference vs idle.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const CH = path.join(ROOT, 'game', 'assets', 'default', 'characters');
const OUT = path.join(ROOT, 'docs', 'art');
require(path.join(ROOT, 'game', 'js', 'mimi_points.js'));
const MP = globalThis.DK.MIMI_POINTS;
const RP = globalThis.DK.ROCKET_POINTS;
const FRAMES = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'pump', 'wave', 'giggle', 'dance', 'look', 'title'];
const BG = { sky: 'linear-gradient(#9FD3EE,#F3F7EE)', grass: '#A9CF8E', dark: '#3A4048' };
const uri = f => 'data:image/svg+xml;base64,' + fs.readFileSync(f).toString('base64');
const file = p => path.join(CH, p + '.svg');

function cross(x, y, k, col = 'red') {
  const s = 9;
  return `<div style="position:absolute;left:${x * k - s}px;top:${y * k - 1}px;width:${2 * s}px;height:2px;background:${col}"></div>` +
    `<div style="position:absolute;left:${x * k - 1}px;top:${y * k - s}px;width:2px;height:${2 * s}px;background:${col}"></div>`;
}
function box(b, k) {
  const [x0, y0, x1, y1] = b;
  return `<div style="position:absolute;left:${x0 * k}px;top:${y0 * k}px;width:${(x1 - x0) * k}px;height:${(y1 - y0) * k}px;border:2px dashed rgba(0,0,0,.35);box-sizing:border-box"></div>`;
}
function cell(src, w, h, marks = '', extra = '') {
  return `<div style="position:relative;width:${w}px;height:${h}px;outline:1px dashed rgba(0,0,0,.12)">${extra}` +
    `<img src="${src}" style="position:relative;width:${w}px;height:${h}px;display:block">${marks}</div>`;
}
function row(bg, cells, pad = 12) {
  return `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:${pad}px;padding:${pad}px;background:${bg}">${cells.join('')}</div>`;
}
async function shot(page, html, name, width) {
  await page.setContent(`<html><body style="margin:0;display:inline-block;width:${width || 'auto'}px">${html}</body></html>`);
  await page.waitForTimeout(300);
  await (await page.$('body')).screenshot({ path: path.join(OUT, name) });
}
// the rocket with a chute on its nose, in one cell (rocket h px tall)
function rocketCell(h, chute, marks) {
  const k = h / 240;
  const w = 240 * k, top = 200 * k - (RP.nose[1] * k);     // chute (240x200) above the nose
  const cw = Math.max(240 * k, 120 * k), ch = top + 240 * k;
  let html = `<div style="position:relative;width:${cw}px;height:${ch}px;outline:1px dashed rgba(0,0,0,.12)">`;
  if (chute) html += `<img src="${uri(file(chute))}" style="position:absolute;left:${(cw - w) / 2}px;top:0;width:${w}px;height:${200 * k}px">`;
  const rx = (cw - 120 * k) / 2;
  html += `<img src="${uri(file('rocket'))}" style="position:absolute;left:${rx}px;top:${top}px;width:${120 * k}px;height:${240 * k}px">`;
  if (marks) {
    html += `<div style="position:absolute;left:${rx}px;top:${top}px">` + cross(RP.nozzle[0], RP.nozzle[1], k) +
      cross(RP.nose[0], RP.nose[1], k, '#c0f') + cross(RP.com[0], RP.com[1], k, '#06c') +
      `<div style="position:absolute;left:0;top:${RP.waterTop * k}px;width:${120 * k}px;height:1px;background:#06c"></div></div>`;
  }
  return html + '</div>';
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 3000, height: 1400 } });
  const srcs = FRAMES.map(p => uri(file('mimi_' + p)));

  const k3 = 1.8;   // 3× of the 180 px in-game size → 540 px per frame
  const marks = (p) => {
    let m = cross(MP.feet[0], MP.feet[1], k3) + cross(MP.wingTip[0], MP.wingTip[1], k3, '#06c') +
      cross(MP.hatTop[0], MP.hatTop[1] + (p === 'pump' ? MP.pumpHatDy : 0), k3, '#c0f');
    return m + box(MP.box, k3);
  };
  const small = ['sky', 'grass', 'dark'].map(k => row(BG[k], srcs.map(s => cell(s, 180, 180)), 6)).join('');
  const big = row(BG.sky, FRAMES.map((p, i) => cell(srcs[i], 300 * k3, 300 * k3, marks(p))));
  await shot(page, small + big, 'mimi_frames.png', 2840);

  const res = await page.evaluate(async ({ list, idle }) => {
    const load = async (src) => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = c.height = 300; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 300, 300); return x.getImageData(0, 0, 300, 300).data; };
    const base = await load(idle);
    const out = {};
    for (const [name, src] of list) {
      const d = await load(src);
      let diff = 0;
      // body region: lower-left torso (below the head, left of the bill, wings excluded as far as possible)
      for (let y = 236; y < 280; y++) for (let x = 170; x < 222; x++) {
        const i = (y * 300 + x) * 4;
        if (Math.abs(d[i] - base[i]) + Math.abs(d[i + 1] - base[i + 1]) + Math.abs(d[i + 2] - base[i + 2]) + Math.abs(d[i + 3] - base[i + 3]) > 8) diff++;
      }
      let y1 = 0, x0 = 300, x1 = 0, y0 = 300;
      for (let y = 0; y < 300; y++) for (let x = 0; x < 300; x++) if (d[(y * 300 + x) * 4 + 3] > 8) { y1 = Math.max(y1, y); y0 = Math.min(y0, y); x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
      out[name] = { bodyDiffPx: diff, bbox: [x0, y0, x1 + 1, y1 + 1] };
    }
    return out;
  }, { list: FRAMES.map((p, i) => [p, srcs[i]]), idle: srcs[0] });
  console.log(JSON.stringify(res, null, 0));

  // rocket + chutes
  const rk = ['sky', 'grass', 'dark'].map(k => row(BG[k], [rocketCell(120, null), rocketCell(120, 'chute'), rocketCell(120, 'chute_closed'),
    rocketCell(360, null, true), rocketCell(360, 'chute', true), rocketCell(360, 'chute_closed', true)])).join('');
  await shot(page, rk, 'mimi_rocket.png', 1700);

  const oth = [['marmot', 160, 160, 100], ['marmot_wave', 160, 160, 100], ['goat', 180, 180, 110], ['goat_hop', 180, 180, 110],
    ['bird', 100, 90, 60], ['bird_sing', 100, 90, 60]].map(([n, w, h, s]) => [uri(file(n)), w, h, s]);
  const s1 = oth.map(([s, w, h, px]) => cell(s, px, px * h / w));
  const s3 = oth.map(([s, w, h, px]) => cell(s, px * 3, px * 3 * h / w));
  const title = uri(file('mimi_title'));
  const icon = uri(path.join(ROOT, 'game', 'assets', 'default', 'icon.svg'));
  const html = ['sky', 'grass', 'dark'].map(k => row(BG[k], [...s1, ...s3])).join('') +
    row(BG.sky, [cell(title, 180, 180), cell(title, 420, 420), cell(icon, 512, 512), cell(icon, 180, 180), cell(icon, 60, 60)]);
  await shot(page, html, 'mimi_extras.png', 2000);
  await b.close();
})();
