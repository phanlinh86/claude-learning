#!/usr/bin/env node
// Nuka's Snow Dig — contact sheets for character artist A's SVGs.
// Run from the game folder root:  python3 tools/art_nuka.py && node tools/nuka_sheet.js
//   → docs/art/nuka_sheet.png   (every Nuka frame at in-game size 220 px on light snow / sky blue / night)
//     docs/art/nuka_3x.png      (every Nuka frame at 3x in-game size on the three backgrounds)
//     docs/art/extras_sheet.png (seal, tern at in-game size and 3x on the three backgrounds)
//     docs/art/icon_sheet.png   (icon at 512 / 180 / 60)
//     docs/art/nuka_bbox.json   (measured opaque bounding box of every Nuka frame, viewBox px; also merged into nuka_hand.json)
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const CH = path.join(ROOT, 'game', 'assets', 'default', 'characters');
const OUT = path.join(ROOT, 'docs', 'art');
const POSES = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'wave', 'point', 'dig', 'full_wave', 'slide'];
const BG = {
  snow: 'linear-gradient(#FFFFFF,#E6EEF6)',
  sky: 'linear-gradient(#86CBEF,#D4EEF8)',
  night: 'linear-gradient(#1E2A52,#3B4F7E)',
};
const uri = f => 'data:image/svg+xml;base64,' + fs.readFileSync(f).toString('base64');

function row(bg, items, pad = 14) {
  return `<div style="display:flex;align-items:flex-end;gap:${pad}px;padding:${pad}px;background:${bg}">` +
    items.map(([src, w, h]) => `<img src="${src}" style="width:${w}px;height:${h}px;display:block;outline:1px dashed rgba(0,0,0,.12)">`).join('') +
    '</div>';
}

async function shot(page, html, file) {
  await page.setContent(`<html><body style="margin:0;display:inline-block">${html}</body></html>`);
  await page.waitForTimeout(150);
  const el = await page.$('body');
  await el.screenshot({ path: path.join(OUT, file) });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 3200, height: 1200 } });
  const nk = POSES.map(p => uri(path.join(CH, `nuka_${p}.svg`)));

  // in-game: Nuka h ≈ 220 → the 300 box drawn at 220 px
  await shot(page, Object.values(BG).map(bg => row(bg, nk.map(s => [s, 220, 220]), 6)).join(''), 'nuka_sheet.png');
  const bgs = Object.values(BG);
  await shot(page, [0, 1, 2].map(r => row(bgs[r], nk.slice(r * 4, r * 4 + 4).map(s => [s, 660, 660]))).join(''), 'nuka_3x.png');

  const ex = [['seal', 160, 140], ['seal_happy', 160, 140], ['tern', 200, 140], ['tern_flap', 200, 140]]
    .map(([n, w, h]) => [uri(path.join(CH, n + '.svg')), w, h]);
  const k1 = 110 / 140, k3 = 3 * 110 / 140;
  let html = bgs.map(bg => row(bg, ex.map(([s, w, h]) => [s, w * k1, h * k1]))).join('');
  html += bgs.map(bg => row(bg, ex.map(([s, w, h]) => [s, w * k3, h * k3]))).join('');
  await shot(page, html, 'extras_sheet.png');

  const icon = uri(path.join(ROOT, 'game', 'assets', 'default', 'icon.svg'));
  await shot(page, row('#FFFFFF', [[icon, 512, 512], [icon, 180, 180], [icon, 60, 60]]), 'icon_sheet.png');

  // measured opaque bounding boxes (alpha > 8) in viewBox px
  const bbox = await page.evaluate(async (srcs) => {
    const out = [];
    for (const src of srcs) {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = 300; c.height = 300;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, 300, 300);
      const d = x.getImageData(0, 0, 300, 300).data;
      let x0 = 300, y0 = 300, x1 = -1, y1 = -1;
      for (let y = 0; y < 300; y++) for (let i = 0; i < 300; i++) if (d[(y * 300 + i) * 4 + 3] > 8) {
        if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      out.push({ x0, y0, x1: x1 + 1, y1: y1 + 1 });
    }
    return out;
  }, nk);
  const res = {}; POSES.forEach((p, i) => { res[p] = bbox[i]; });
  fs.writeFileSync(path.join(OUT, 'nuka_bbox.json'), JSON.stringify(res, null, 1) + '\n');
  const hf = path.join(OUT, 'nuka_hand.json');
  if (fs.existsSync(hf)) {   // merge the measured boxes into the hand table
    const h = JSON.parse(fs.readFileSync(hf, 'utf8'));
    POSES.forEach(p => { if (h[p]) { h[p].bbox = [res[p].x0, res[p].y0, res[p].x1, res[p].y1]; } });
    fs.writeFileSync(hf, JSON.stringify(h, null, 1) + '\n');
  }
  console.log(res);
  await b.close();
})();
