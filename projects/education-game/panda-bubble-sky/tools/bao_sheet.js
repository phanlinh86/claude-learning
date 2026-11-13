#!/usr/bin/env node
// Bao's Bubble Sky — contact sheets for character artist A's SVGs.
// Run from the game folder root:  python3 tools/art_bao.py && node tools/bao_sheet.js
//   → docs/art/bao_sheet.png    every Bao frame at in-game size (240 px) on the 4 season skies, then at 3× (light spring sky)
//                               with red crosses at PB.BAO_POINTS ring / blowRing / feet / mouth (sheet only)
//     docs/art/bao_overlay.png  all frames stacked at 50 % opacity + a pixel-diff of the body region vs idle
//     docs/art/bao_surprise.png bird, bird_flap, kite at in-game size and 3× on the 4 skies
//     docs/art/bao_icon.png     icon at 512 / 180 / 60
// Prints a JSON check: body-region pixel difference per frame vs idle (must be 0) and measured ring centres.
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const CH = path.join(ROOT, 'game', 'assets', 'default', 'characters');
const OUT = path.join(ROOT, 'docs', 'art');
global.PB = {};
require(path.join(ROOT, 'game', 'js', 'bao_points.js'));
const BP = globalThis.PB.BAO_POINTS;
const POSES = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'blow', 'wave', 'giggle', 'dance', 'title'];
const REST = ['idle', 'blink', 'talk', 'happy', 'think', 'oops', 'wave', 'giggle'];
const BG = {
  spring: 'linear-gradient(#CFE6FA,#FCEFF4)',
  summer: 'linear-gradient(#86C9F0,#E2F5FF)',
  autumn: 'linear-gradient(#F3C28F,#FCEBD3)',
  winter: 'linear-gradient(#B7C8E4,#EEF2F9)',
};
const uri = f => 'data:image/svg+xml;base64,' + fs.readFileSync(f).toString('base64');
const file = p => path.join(CH, (p === 'title' ? 'bao_title' : 'bao_' + p) + '.svg');

function cross(x, y, k, col = 'red') {
  const s = 9;
  return `<div style="position:absolute;left:${x * k - s}px;top:${y * k - 1}px;width:${2 * s}px;height:2px;background:${col}"></div>` +
    `<div style="position:absolute;left:${x * k - 1}px;top:${y * k - s}px;width:2px;height:${2 * s}px;background:${col}"></div>`;
}
function cell(src, w, h, marks = '') {
  return `<div style="position:relative;width:${w}px;height:${h}px;outline:1px dashed rgba(0,0,0,.12)">` +
    `<img src="${src}" style="width:${w}px;height:${h}px;display:block">${marks}</div>`;
}
function row(bg, cells, pad = 12) {
  return `<div style="display:flex;align-items:flex-end;gap:${pad}px;padding:${pad}px;background:${bg}">${cells.join('')}</div>`;
}
async function shot(page, html, name) {
  await page.setContent(`<html><body style="margin:0;display:inline-block">${html}</body></html>`);
  await page.waitForTimeout(200);
  await (await page.$('body')).screenshot({ path: path.join(OUT, name) });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 3400, height: 1400 } });
  const bao = POSES.map(p => uri(file(p)));

  const k3 = 2.4;   // 3× of the ~240 px in-game size → 720 px per frame
  const marks = (p) => {
    let m = cross(BP.feet[0], BP.feet[1], k3) + cross(BP.mouth[0], BP.mouth[1], k3, '#c0f');
    if (REST.includes(p)) m += cross(BP.ring[0], BP.ring[1], k3);
    if (p === 'blow') m += cross(BP.blowRing[0], BP.blowRing[1], k3);
    return m;
  };
  const small = Object.values(BG).map(bg => row(bg, bao.map(s => cell(s, 240, 240)), 6)).join('');
  const big = [0, 1, 2].map(r => row(BG.spring, POSES.slice(r * 4, r * 4 + 4).map((p, i) => cell(bao[r * 4 + i], 300 * k3, 300 * k3, marks(p))))).join('');
  await shot(page, small + big, 'bao_sheet.png');

  // overlay: all frames stacked at low opacity (the body must look crisp = identical)
  const stack = bao.slice(0, 11).map(s => `<img src="${s}" style="position:absolute;left:0;top:0;width:600px;height:600px;opacity:.22">`).join('');
  await shot(page, `<div style="position:relative;width:600px;height:600px;background:#fff">${stack}${cross(BP.ring[0], BP.ring[1], 2)}${cross(BP.blowRing[0], BP.blowRing[1], 2)}${cross(BP.feet[0], BP.feet[1], 2)}</div>`, 'bao_overlay.png');

  // numeric checks: body region (y ≥ 230, x < 196 — below the arms' reach except the lap paw) identical; ring film centres
  const res = await page.evaluate(async ({ list, idle }) => {
    const load = async (src) => { const im = new Image(); im.src = src; await im.decode(); const c = document.createElement('canvas'); c.width = c.height = 300; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, 300, 300).data; };
    const base = await load(idle);
    const out = {};
    for (const [name, src] of list) {
      const d = await load(src);
      let diff = 0;
      // region: legs, soles, tail and lower belly (no arm/paw passes through it in any pose)
      for (let y = 256; y < 300; y++) for (let x = 60; x < 230; x++) {
        if (x > 100 && x < 145 && y < 262) continue;
        const i = (y * 300 + x) * 4;
        if (Math.abs(d[i] - base[i]) + Math.abs(d[i + 1] - base[i + 1]) + Math.abs(d[i + 2] - base[i + 2]) + Math.abs(d[i + 3] - base[i + 3]) > 8) diff++;
      }
      let y1 = 0; for (let y = 0; y < 300; y++) for (let x = 0; x < 300; x++) if (d[(y * 300 + x) * 4 + 3] > 8) y1 = y;
      out[name] = { bodyDiffPx: diff, bottomY: y1 + 1 };
    }
    return out;
  }, { list: POSES.map((p, i) => [p, bao[i]]), idle: bao[0] });
  console.log(JSON.stringify(res));

  const oth = [['bird', 120, 100], ['bird_flap', 120, 100], ['kite', 140, 200]].map(([n, w, h]) => [uri(path.join(CH, n + '.svg')), w, h]);
  // in-game: bird ≈ 90 px wide, kite ≈ 150 px tall
  const s1 = oth.map(([s, w, h]) => cell(s, w * 0.75, h * 0.75));
  const s3 = oth.map(([s, w, h]) => cell(s, w * 2.25, h * 2.25));
  await shot(page, Object.values(BG).map(bg => row(bg, [...s1, ...s3])).join(''), 'bao_surprise.png');

  const icon = uri(path.join(ROOT, 'game', 'assets', 'default', 'icon.svg'));
  await shot(page, row('#FFFFFF', [cell(icon, 512, 512), cell(icon, 180, 180), cell(icon, 60, 60)]), 'bao_icon.png');
  await b.close();
})();
