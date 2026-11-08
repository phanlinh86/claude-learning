#!/usr/bin/env node
// Bun's Dino Dig — contact sheets for character artist A's SVGs.
// Run from the game folder root:  python3 tools/art_bun.py && node tools/bun_sheet.js
//   → docs/art/bun_sheet.png   (every Bun frame at in-game size 230 px on sky / sand / night)
//     docs/art/bun_3x.png      (every Bun frame at 3× in-game size, light sky)
//     docs/art/extras_sheet.png (mole, pterosaur, the 7 baby dinos at in-game size and 3× on the three backgrounds)
//     docs/art/icon_sheet.png  (icon at 512 / 180 / 60)
//     docs/art/bun_bbox.json   (measured opaque bounding box of every Bun frame, viewBox px; also merged into bun_hand.json)
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const CH = path.join(ROOT, 'game', 'assets', 'default', 'characters');
const OUT = path.join(ROOT, 'docs', 'art');
const POSES = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'wave', 'point', 'dig', 'full_wave'];
const COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const BG = {
  sky: 'linear-gradient(#BFE6F2,#FBE9C9)',
  sand: '#E6CC98',
  night: 'linear-gradient(#1F2A55,#3E4C7E)',
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
  const page = await b.newPage({ viewport: { width: 3000, height: 1200 } });
  const bun = POSES.map(p => uri(path.join(CH, `bun_${p}.svg`)));

  // in-game: Bun h = 230 → the 300 box is drawn at 230 px
  await shot(page, Object.values(BG).map(bg => row(bg, bun.map(s => [s, 230, 230]), 6)).join(''), 'bun_sheet.png');
  await shot(page, [0, 1, 2].map(r => row(BG.sky, bun.slice(r * 4, r * 4 + 4).map(s => [s, 690, 690]))).join(''), 'bun_3x.png');

  const ex = [['mole', 160, 140], ['mole_happy', 160, 140], ['ptero', 200, 140], ['ptero_flap', 200, 140],
    ...COLORS.map(c => [`dino_baby_${c}`, 160, 160])].map(([n, w, h]) => [uri(path.join(CH, n + '.svg')), w, h]);
  const k1 = 110 / 140, k3 = 3 * 110 / 160;
  let html = Object.values(BG).map(bg => row(bg, ex.map(([s, w, h]) => [s, w * k1, h * k1]))).join('');
  html += Object.values(BG).map(bg => row(bg, ex.slice(0, 4).map(([s, w, h]) => [s, w * k3, h * k3]))).join('');
  html += Object.values(BG).map(bg => row(bg, ex.slice(4).map(([s, w, h]) => [s, w * 2, h * 2]))).join('');
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
  }, bun);
  const res = {}; POSES.forEach((p, i) => { res[p] = bbox[i]; });
  fs.writeFileSync(path.join(OUT, 'bun_bbox.json'), JSON.stringify(res, null, 1) + '\n');
  const hf = path.join(OUT, 'bun_hand.json');
  if (fs.existsSync(hf)) {   // merge the measured boxes into the hand table
    const h = JSON.parse(fs.readFileSync(hf, 'utf8'));
    POSES.forEach(p => { if (h[p]) { h[p].bbox = [res[p].x0, res[p].y0, res[p].x1, res[p].y1]; h[p].earTop = res[p].y0; } });
    fs.writeFileSync(hf, JSON.stringify(h, null, 1) + '\n');
  }
  console.log(res);
  await b.close();
})();
