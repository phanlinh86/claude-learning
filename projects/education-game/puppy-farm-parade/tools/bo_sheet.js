#!/usr/bin/env node
// Bo's Farm Parade — contact sheets for character artist A's SVGs.
// Run from the game folder root:  python3 tools/art_bo.py && node tools/bo_sheet.js
//   → docs/art/bo_sheet.png     (every Bo frame at in-game size 220 px on morning sky / grass / night)
//     docs/art/bo_3x.png        (every Bo frame at 3× in-game size, light sky)
//     docs/art/bo_surprise.png  (chick ×3, rooster ×2 at in-game size and 3× on the 3 backgrounds)
//     docs/art/bo_icon.png      (icon at 512 / 180 / 60)
//     docs/art/bo_bbox.json     (measured opaque bounding box of every file, viewBox px; Bo boxes merged into bo_points.json)
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const CH = path.join(ROOT, 'game', 'assets', 'default', 'characters');
const OUT = path.join(ROOT, 'docs', 'art');
const POSES = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'wave', 'point', 'bark', 'dance', 'title'];
const OTHERS = [['chick', 120, 120], ['chick_step', 120, 120], ['chick_flap', 120, 120], ['rooster', 160, 180], ['rooster_crow', 160, 180]];
const BG = {
  sky: 'linear-gradient(#F8DCC6,#FDF4E3)',
  grass: '#A9C27F',
  night: 'linear-gradient(#1E2A4A,#3B4C78)',
};
const uri = f => 'data:image/svg+xml;base64,' + fs.readFileSync(f).toString('base64');
const file = p => path.join(CH, (p === 'title' ? 'bo_title' : 'bo_' + p) + '.svg');

function row(bg, items, pad = 14) {
  return `<div style="display:flex;align-items:flex-end;gap:${pad}px;padding:${pad}px;background:${bg}">` +
    items.map(([src, w, h]) => `<img src="${src}" style="width:${w}px;height:${h}px;display:block;outline:1px dashed rgba(0,0,0,.12)">`).join('') +
    '</div>';
}

async function shot(page, html, name) {
  await page.setContent(`<html><body style="margin:0;display:inline-block">${html}</body></html>`);
  await page.waitForTimeout(150);
  const el = await page.$('body');
  await el.screenshot({ path: path.join(OUT, name) });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 3000, height: 1200 } });
  const bo = POSES.map(p => uri(file(p)));

  // in-game: Bo h = 220 → the 300 box is drawn at 220 px
  await shot(page, Object.values(BG).map(bg => row(bg, bo.map(s => [s, 220, 220]), 4)).join(''), 'bo_sheet.png');
  await shot(page, [0, 1, 2].map(r => row(BG.sky, bo.slice(r * 4, r * 4 + 4).map(s => [s, 660, 660]))).join(''), 'bo_3x.png');

  const oth = OTHERS.map(([n, w, h]) => [uri(path.join(CH, n + '.svg')), w, h]);
  // in-game: chick box ≈ 80 px, rooster box ≈ 120 px tall
  const small = oth.map(([s, w, h]) => { const k = h === 120 ? 0.67 : 0.67; return [s, w * k, h * k]; });
  const big = oth.map(([s, w, h]) => [s, w * 2, h * 2]);
  await shot(page, Object.values(BG).map(bg => row(bg, [...small, ...big])).join(''), 'bo_surprise.png');

  const icon = uri(path.join(ROOT, 'game', 'assets', 'default', 'icon.svg'));
  await shot(page, row('#FFFFFF', [[icon, 512, 512], [icon, 180, 180], [icon, 60, 60]]), 'bo_icon.png');

  // measured opaque bounding boxes (alpha > 8) in viewBox px
  const files = [...POSES.map(p => [p, file(p), 300, 300]), ...OTHERS.map(([n, w, h]) => [n, path.join(CH, n + '.svg'), w, h])];
  const bbox = await page.evaluate(async (list) => {
    const out = [];
    for (const [src, W, H] of list) {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, W, H);
      const d = x.getImageData(0, 0, W, H).data;
      let x0 = W, y0 = H, x1 = -1, y1 = -1;
      for (let y = 0; y < H; y++) for (let i = 0; i < W; i++) if (d[(y * W + i) * 4 + 3] > 8) {
        if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      out.push({ x0, y0, x1: x1 + 1, y1: y1 + 1 });
    }
    return out;
  }, files.map(([, f, w, h]) => [uri(f), w, h]));
  const res = {}; files.forEach(([n], i) => { res[POSES.includes(n) ? 'bo_' + n : n] = bbox[i]; });
  fs.writeFileSync(path.join(OUT, 'bo_bbox.json'), JSON.stringify(res, null, 1) + '\n');
  const pf = path.join(OUT, 'bo_points.json');
  if (fs.existsSync(pf)) {   // merge the measured boxes into the points table
    const h = JSON.parse(fs.readFileSync(pf, 'utf8'));
    POSES.forEach(p => { const r = res['bo_' + p]; if (h[p]) h[p].bbox = [r.x0, r.y0, r.x1, r.y1]; });
    fs.writeFileSync(pf, JSON.stringify(h, null, 1) + '\n');
  }
  console.log(JSON.stringify(res));
  await b.close();
})();
