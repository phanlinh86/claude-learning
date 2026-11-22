#!/usr/bin/env node
// Bo's Farm Parade — contact sheets for character artist C's animal SVGs.
// Run from the game folder root:  python3 tools/art_animals.py && node tools/animal_sheet.js
//   → docs/art/animals_ingame.png  every animal + step frame at in-game size (120 px) on path / grass / night,
//                                  standing on a drawn ground line (the feet anchor y = 194 of 200)
//     docs/art/animals_3x.png      every animal at 3× (360 px) on path / grass / night
//     docs/art/animals_walk.png    frame / step pairs side by side (3×) + an onion overlay of both frames
//   and prints the measured art box per file (viewBox px): top, bottom, x range, box centre height above the feet
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'game', 'assets', 'default', 'animals');
const OUT = path.join(ROOT, 'docs', 'art');
const NAMES = ['cow', 'pig', 'sheep', 'duck', 'hen', 'horse', 'goat', 'crab', 'penguin', 'lion', 'monkey', 'fishbowl'];
const BG = { path: '#D8BE95', grass: '#9CC27A', night: '#1E2A4A' };
const uri = f => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(DIR, f + '.svg')).toString('base64');

// one tile: the image with a ground line at the feet anchor (y = 194/200 of the tile)
function tile(src, size, bg, extra = '') {
  const gy = size * 194 / 200;
  return `<div style="position:relative;width:${size}px;height:${size}px;background:${bg}">` +
    `<div style="position:absolute;left:0;right:0;top:${gy}px;height:1px;background:rgba(80,40,20,.55)"></div>` +
    `<div style="position:absolute;left:${size / 2}px;top:${gy - 4}px;width:1px;height:8px;background:rgba(80,40,20,.55)"></div>` +
    `<img src="${src}" style="position:absolute;left:0;top:0;width:${size}px;height:${size}px">${extra}</div>`;
}
const rowOf = (tiles, gap = 8) => `<div style="display:flex;gap:${gap}px;padding:${gap}px">${tiles.join('')}</div>`;

async function shot(page, html, file) {
  await page.setContent(`<html><body style="margin:0;display:inline-block;background:#fff">${html}</body></html>`);
  await page.waitForTimeout(200);
  await (await page.$('body')).screenshot({ path: path.join(OUT, file) });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  // in-game size
  let html = '';
  for (const bg of Object.values(BG)) {
    html += rowOf(NAMES.flatMap(n => [tile(uri(n), 120, bg), tile(uri(n + '_step'), 120, bg)]), 4);
  }
  await shot(page, html, 'animals_ingame.png');

  // 3× (two rows of 6 per background)
  html = '';
  for (const bg of Object.values(BG)) {
    html += rowOf(NAMES.slice(0, 6).map(n => tile(uri(n), 360, bg)));
    html += rowOf(NAMES.slice(6).map(n => tile(uri(n), 360, bg)));
  }
  await shot(page, html, 'animals_3x.png');

  // walk pairs + onion overlay (step at 50 %)
  html = '';
  for (let i = 0; i < NAMES.length; i += 4) {
    html += rowOf(NAMES.slice(i, i + 4).flatMap(n => [
      tile(uri(n), 240, BG.path), tile(uri(n + '_step'), 240, BG.path),
      tile(uri(n), 240, BG.grass, `<img src="${uri(n + '_step')}" style="position:absolute;left:0;top:0;width:240px;height:240px;opacity:.5">`),
    ]));
  }
  await shot(page, html, 'animals_walk.png');

  // measured boxes
  const files = NAMES.flatMap(n => [n, n + '_step']);
  const boxes = await page.evaluate(async (list) => {
    const res = {};
    for (const [name, src] of list) {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = 400;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, 400, 400);
      const d = g.getImageData(0, 0, 400, 400).data;
      // opaque, non-white (= the art, not the sticker) and any-opaque (with sticker)
      let t = 1e9, b = -1, l = 1e9, r = -1, ta = 1e9, ba = -1, sy = 0, cnt = 0;
      for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) {
        const k = (y * 400 + x) * 4;
        if (d[k + 3] < 128) continue;
        ta = Math.min(ta, y); ba = Math.max(ba, y);
        if (d[k] > 245 && d[k + 1] > 245 && d[k + 2] > 245) continue;
        t = Math.min(t, y); b = Math.max(b, y); l = Math.min(l, x); r = Math.max(r, x); sy += y; cnt++;
      }
      const v = q => Math.round(q / 2 * 10) / 10;
      res[name] = { top: v(t), bottom: v(b + 1), left: v(l), right: v(r + 1), stickerTop: v(ta),
        massCentreY: v(sy / cnt), boxCentreY: v((t + b + 1) / 2), centreAboveFeet: v(194 * 2 - (t + b + 1) / 2) };
    }
    return res;
  }, files.map(n => [n, 'data:image/svg+xml;base64,' + require_b64(n)]));
  for (const n of files) {
    const q = boxes[n];
    console.log(n.padEnd(14), 'top', q.top, 'bottom', q.bottom, 'x', q.left + '..' + q.right, 'centre↑feet', q.centreAboveFeet);
  }
  await browser.close();

  function require_b64(n) { return fs.readFileSync(path.join(DIR, n + '.svg')).toString('base64'); }
})();
