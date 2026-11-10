#!/usr/bin/env node
// Kiki's Camp Chimes — contact sheets for character artist A's SVGs.
// Run from the game folder root:  python3 tools/art_kiki.py && node tools/kiki_sheet.js
//   → docs/art/kiki_sheet.png     (every Kiki frame at in-game size 230 px on morning sky / grass / night)
//     docs/art/kiki_3x.png        (every Kiki frame at 3× in-game size, light sky)
//     docs/art/kiki_surprise.png  (hedgehog, hedgehog_ball, bird, bird_sing at in-game size and 3× on the 3 backgrounds)
//     docs/art/kiki_icon.png      (icon at 512 / 180 / 60)
//     docs/art/kiki_bbox.json     (measured opaque bounding box of every file, viewBox px; Kiki boxes merged into kiki_hand.json)
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const CH = path.join(ROOT, 'game', 'assets', 'default', 'characters');
const OUT = path.join(ROOT, 'docs', 'art');
const POSES = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'wave', 'point', 'dance', 'full_wave'];
const OTHERS = [['hedgehog', 160, 120], ['hedgehog_ball', 160, 120], ['bird', 120, 100], ['bird_sing', 120, 100]];
const BG = {
  sky: 'linear-gradient(#F7D9C4,#FDF3E1)',
  grass: '#A9C08A',
  night: 'linear-gradient(#1E2A4A,#3B4C78)',
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
  const kiki = POSES.map(p => uri(path.join(CH, `kiki_${p}.svg`)));

  // in-game: Kiki h = 230 → the 300 box is drawn at 230 px
  await shot(page, Object.values(BG).map(bg => row(bg, kiki.map(s => [s, 230, 230]), 6)).join(''), 'kiki_sheet.png');
  await shot(page, [0, 1, 2].map(r => row(BG.sky, kiki.slice(r * 4, r * 4 + 4).map(s => [s, 690, 690]))).join(''), 'kiki_3x.png');

  const oth = OTHERS.map(([n, w, h]) => [uri(path.join(CH, n + '.svg')), w, h]);
  // in-game: hedgehog ≈ 96 px tall box, bird ≈ 70 px tall box
  const small = oth.map(([s, w, h]) => [s, w * (h === 120 ? 0.8 : 0.7), h * (h === 120 ? 0.8 : 0.7)]);
  const big = oth.map(([s, w, h]) => [s, w * 3, h * 3]);
  await shot(page, Object.values(BG).map(bg => row(bg, [...small, ...big])).join(''), 'kiki_surprise.png');

  const icon = uri(path.join(ROOT, 'game', 'assets', 'default', 'icon.svg'));
  await shot(page, row('#FFFFFF', [[icon, 512, 512], [icon, 180, 180], [icon, 60, 60]]), 'kiki_icon.png');

  // measured opaque bounding boxes (alpha > 8) in viewBox px
  const files = [...POSES.map(p => ['kiki_' + p, 300, 300]), ...OTHERS];
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
  }, files.map(([n, w, h]) => [uri(path.join(CH, n + '.svg')), w, h]));
  const res = {}; files.forEach(([n], i) => { res[n] = bbox[i]; });
  fs.writeFileSync(path.join(OUT, 'kiki_bbox.json'), JSON.stringify(res, null, 1) + '\n');
  const hf = path.join(OUT, 'kiki_hand.json');
  if (fs.existsSync(hf)) {   // merge the measured boxes into the hand table
    const h = JSON.parse(fs.readFileSync(hf, 'utf8'));
    POSES.forEach(p => { const r = res['kiki_' + p]; if (h[p]) h[p].bbox = [r.x0, r.y0, r.x1, r.y1]; });
    fs.writeFileSync(hf, JSON.stringify(h, null, 1) + '\n');
  }
  console.log(JSON.stringify(res));
  await b.close();
})();
