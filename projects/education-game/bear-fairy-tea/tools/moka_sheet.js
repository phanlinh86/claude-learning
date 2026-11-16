#!/usr/bin/env node
// Moka's Fairy Tea Party — contact sheets for character artist A's SVGs.
// Run from the game folder root:  python3 tools/art_moka.py && node tools/moka_sheet.js
//   → docs/art/moka_sheet.png   (every Moka frame at in-game size 250 px on light moss / sage / rain-dark)
//     docs/art/moka_3x.png      (idle / cheer / umbrella at 3×, light moss, with the seat anchor marked)
//     docs/art/critters.png     (fairy ×3, ladybug ×3, butterfly ×2, snail ×2 at in-game size and 2.5× on the 3 backgrounds)
//     docs/art/icon.png         (icon at 512 / 180 / 60)
//     docs/art/moka_bbox.json   (per-frame points from art_moka.py + measured getBBox (geometry, no stroke) and
//                                opaque pixel box (incl. outline) of every file, viewBox px)
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const CH = path.join(ROOT, 'game', 'assets', 'default', 'characters');
const OUT = path.join(ROOT, 'docs', 'art');
const POSES = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'wave', 'point', 'sip', 'umbrella', 'title'];
const OTHERS = [['fairy', 120, 120, 70], ['fairy_flap', 120, 120, 70], ['fairy_sprinkle', 120, 120, 70],
  ['ladybug', 100, 100, 56], ['ladybug_step', 100, 100, 56], ['ladybug_fly', 100, 100, 56],
  ['butterfly', 120, 120, 64], ['butterfly_flap', 120, 120, 64], ['snail', 140, 120, 84], ['snail_peek', 140, 120, 84]];
const BG = { moss: '#DDE8C8', sage: '#8DAA6A', rain: '#5E6B78' };
const uri = f => 'data:image/svg+xml;base64,' + fs.readFileSync(f).toString('base64');
const file = p => path.join(CH, 'moka_' + p + '.svg');

function row(bg, items, pad = 14) {
  return `<div style="display:flex;align-items:flex-end;gap:${pad}px;padding:${pad}px;background:${bg}">` +
    items.map(([src, w, h, mark]) => `<div style="position:relative;width:${w}px;height:${h}px">` +
      `<img src="${src}" style="width:${w}px;height:${h}px;display:block;outline:1px dashed rgba(0,0,0,.14)">` +
      (mark ? `<div style="position:absolute;left:${mark[0] - 5}px;top:${mark[1] - 1}px;width:10px;height:2px;background:#d02090"></div>` +
        `<div style="position:absolute;left:${mark[0] - 1}px;top:${mark[1] - 5}px;width:2px;height:10px;background:#d02090"></div>` : '') +
      '</div>').join('') + '</div>';
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
  const page = await b.newPage({ viewport: { width: 3400, height: 1400 } });
  const mk = POSES.map(p => uri(file(p)));
  const S = 250, k = S / 300;   // in-game: moka.h = 250 → the 300 box is drawn at 250 px
  await shot(page, Object.values(BG).map(bg => row(bg, mk.map(s => [s, S, S, [150 * k, 292 * k]]), 4)).join(''), 'moka_sheet.png');
  const three = ['idle', 'cheer', 'umbrella'].map(p => [uri(file(p)), 750, 750, [450, 876]]);
  await shot(page, row(BG.moss, three), 'moka_3x.png');

  const oth = OTHERS.map(([n, w, h, g]) => [uri(path.join(CH, n + '.svg')), w, h, g]);
  const small = oth.map(([s, w, h, g]) => [s, w * g / h, g]);
  const big = oth.map(([s, w, h]) => [s, w * 2.5, h * 2.5]);
  await shot(page, Object.values(BG).map(bg => row(bg, small) + row(bg, big)).join(''), 'critters.png');

  const icon = uri(path.join(ROOT, 'game', 'assets', 'default', 'icon.svg'));
  await shot(page, row('#FFFFFF', [[icon, 512, 512], [icon, 180, 180], [icon, 60, 60]]), 'icon.png');

  // measured boxes: getBBox of the root's content (geometry) + opaque pixel box at 2× (alpha > 8, includes outlines)
  const files = [...POSES.map(p => ['moka_' + p, file(p), 300, 300]),
    ...OTHERS.map(([n, w, h]) => [n, path.join(CH, n + '.svg'), w, h])];
  const boxes = [];
  for (const [, f, W, H] of files) {
    await page.setContent(`<html><body style="margin:0">${fs.readFileSync(f, 'utf8')}</body></html>`);
    const r = await page.evaluate(async ([src, W, H]) => {
      const s = document.querySelector('svg');
      const g = s.getBBox();
      const img = new Image(); img.src = src; await img.decode();
      const K = 2, c = document.createElement('canvas'); c.width = W * K; c.height = H * K;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0, W * K, H * K);
      const d = x.getImageData(0, 0, W * K, H * K).data;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
      for (let y = 0; y < H * K; y++) for (let i = 0; i < W * K; i++) if (d[(y * W * K + i) * 4 + 3] > 8) {
        if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
      const q = v => Math.round(v * 10) / 10;
      return { getBBox: [q(g.x), q(g.y), q(g.x + g.width), q(g.y + g.height)], pixel: [x0 / K, y0 / K, (x1 + 1) / K, (y1 + 1) / K] };
    }, [uri(f), W, H]);
    boxes.push(r);
  }
  const pf = path.join(OUT, 'moka_bbox.json');
  const pts = fs.existsSync(pf) ? JSON.parse(fs.readFileSync(pf, 'utf8')) : {};
  const res = {
    _about: 'viewBox px. Moka 0 0 300 300, seat anchor (150,292) = bottom centre of the body (scale = h/300). ' +
      'Per Moka frame: cup = teacup centre, mouth / nose / head / headTop / eye (speech bubble, sparkles), paw = near paw tip, ' +
      'umbrellaCap = extent of the mushroom cap; getBBox = geometry box (no stroke), pixel = opaque box incl. outline. ' +
      'Critters: fairy/butterfly centre (60,60); ladybug feet (50,96); snail bottom (70,116).',
  };
  files.forEach(([n], i) => {
    const key = n.startsWith('moka_') ? n.slice(5) : n;
    res[n] = Object.assign({}, pts[key] || pts[n] || {}, boxes[i]);
  });
  fs.writeFileSync(pf, JSON.stringify(res, null, 1) + '\n');
  for (const [n] of files) console.log(n.padEnd(16), JSON.stringify(res[n].getBBox), JSON.stringify(res[n].pixel));
  await b.close();
})();
