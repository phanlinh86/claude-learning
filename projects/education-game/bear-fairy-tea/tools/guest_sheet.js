#!/usr/bin/env node
// Moka's Fairy Tea Party — contact sheets for character artist C's guest SVGs.
// Run from the game folder root:  python3 tools/art_guests.py && node tools/guest_sheet.js
//   → docs/art/guests_ingame.png  all 26 frames (idle + _hop) at in-game size (120 px) on table wood / moss / rain-dark,
//                                 with a line at the bottom anchor (y = 196 of 200)
//     docs/art/guests_3x.png      every idle frame at 3× (360 px) on the three backgrounds
//     docs/art/guests_bbox.json   measured boxes per file (viewBox px): geometry via getBBox() (no stroke) and the
//                                 painted art box incl. outline (pixels, sticker excluded) + painted box incl. sticker
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'game', 'assets', 'default', 'guests');
const OUT = path.join(ROOT, 'docs', 'art');
const NAMES = ['bunny', 'fox', 'deer', 'squirrel', 'owl', 'raccoon', 'mouse', 'hedgehog',
  'penguin', 'crab', 'camel', 'goldfish', 'lion'];
const BG = { table: '#A9784E', moss: '#8DAA6A', rain: '#5E6B78' };
const read = f => fs.readFileSync(path.join(DIR, f + '.svg'), 'utf8');
const uri = f => 'data:image/svg+xml;base64,' + Buffer.from(read(f)).toString('base64');

function tile(src, size, bg) {
  const gy = size * 196 / 200;
  return `<div style="position:relative;width:${size}px;height:${size}px;background:${bg}">` +
    `<div style="position:absolute;left:0;right:0;top:${gy}px;height:1px;background:rgba(40,20,10,.5)"></div>` +
    `<img src="${src}" style="position:absolute;left:0;top:0;width:${size}px;height:${size}px"></div>`;
}
const rowOf = (tiles, gap = 8) => `<div style="display:flex;gap:${gap}px;padding:${gap}px">${tiles.join('')}</div>`;

async function shot(page, html, file) {
  await page.setContent(`<html><body style="margin:0;display:inline-block;background:#fff">${html}</body></html>`);
  await page.waitForTimeout(250);
  await (await page.$('body')).screenshot({ path: path.join(OUT, file) });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const files = NAMES.flatMap(n => [n, n + '_hop']);

  // in-game: per background two rows (13 idle / 13 hop)
  let html = '';
  for (const bg of Object.values(BG)) {
    html += rowOf(NAMES.map(n => tile(uri(n), 120, bg)), 4);
    html += rowOf(NAMES.map(n => tile(uri(n + '_hop'), 120, bg)), 4);
  }
  await shot(page, html, 'guests_ingame.png');

  // 3×: idle frames, rows of 5, cycling backgrounds
  html = '';
  const bgs = Object.values(BG);
  for (let i = 0; i < NAMES.length; i += 5) {
    html += rowOf(NAMES.slice(i, i + 5).map((n, j) => tile(uri(n), 360, bgs[(i + j) % 3])));
  }
  await shot(page, html, 'guests_3x.png');

  // measurements
  const res = {};
  for (const n of files) {
    const svg = read(n);
    await page.setContent(`<html><body style="margin:0">${svg}</body></html>`);
    const m = await page.evaluate(async (src) => {
      const el = document.querySelector('svg');
      // geometry box of the art (all drawn children except defs)
      const b = el.querySelector('svg > g').getBBox();  // the sticker group = union of all silhouettes
      const img = new Image();
      img.src = src;
      await img.decode();
      const S = 400, c = document.createElement('canvas');
      c.width = c.height = S;
      const g = c.getContext('2d');
      g.drawImage(img, 0, 0, S, S);
      const d = g.getImageData(0, 0, S, S).data;
      let t = 1e9, bo = -1, l = 1e9, r = -1, ta = 1e9, ba = -1, la = 1e9, ra = -1;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const k = (y * S + x) * 4;
        if (d[k + 3] < 128) continue;
        ta = Math.min(ta, y); ba = Math.max(ba, y); la = Math.min(la, x); ra = Math.max(ra, x);
        if (d[k] > 245 && d[k + 1] > 245 && d[k + 2] > 245) continue;
        t = Math.min(t, y); bo = Math.max(bo, y); l = Math.min(l, x); r = Math.max(r, x);
      }
      const v = q => Math.round(q * 200 / S * 10) / 10;
      const rd = q => Math.round(q * 10) / 10;
      return {
        geom: { x: rd(b.x), y: rd(b.y), w: rd(b.width), h: rd(b.height), bottom: rd(b.y + b.height) },
        art: { top: v(t), bottom: v(bo + 1), left: v(l), right: v(r + 1), h: v(bo + 1 - t) },
        sticker: { top: v(ta), bottom: v(ba + 1), left: v(la), right: v(ra + 1) },
      };
    }, uri(n));
    // XML sanity: the SVG parses with DOMParser without a parsererror
    m.parses = await page.evaluate(s => !new DOMParser().parseFromString(s, 'image/svg+xml')
      .querySelector('parsererror'), svg);
    res[n] = m;
    console.log(n.padEnd(14), 'geom', m.geom.y + '..' + m.geom.bottom, ' art', m.art.top + '..' + m.art.bottom,
      'h', m.art.h, ' x', m.art.left + '..' + m.art.right, m.parses ? 'ok' : 'PARSE ERROR');
  }
  fs.writeFileSync(path.join(OUT, 'guests_bbox.json'), JSON.stringify(res, null, 1) + '\n');
  await browser.close();
})();
