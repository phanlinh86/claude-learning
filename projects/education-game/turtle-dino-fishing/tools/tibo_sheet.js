#!/usr/bin/env node
// Tibo's Dino Lake Fishing — contact sheets for character artist A's SVGs.
// Run from the game folder root:  python3 tools/art_tibo.py && node tools/tibo_sheet.js
//   → docs/art/tibo_sheet.png     (every Tibo frame at in-game size: the 300 box drawn at 190 px, on sky / teal water / night;
//                                  pink cross = seat anchor, teal cross = rod grip, a code-style rod drawn from the grip)
//     docs/art/tibo_3x.png        (idle / cheer / reel / wave / title at 3× on sky, with seat + grip marks)
//     docs/art/tibo_3x_night.png  (idle / think / oops / cast at 3× on night)
//     docs/art/critters_sheet.png (ptero ×2, bronto ×2, frog ×2, firefly at in-game size and 2.5× on the 3 backgrounds)
//     docs/art/tibo_icon.png      (icon at 512 / 180 / 60)
//     docs/art/tibo_bbox.json     (per-frame points from art_tibo.py + measured getBBox (geometry, no stroke) and
//                                  opaque pixel box (incl. outline) of every file, viewBox px)
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const CH = path.join(ROOT, 'game', 'assets', 'default', 'characters');
const OUT = path.join(ROOT, 'docs', 'art');
const POSES = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops', 'cast', 'reel', 'wave', 'title'];
const OTHERS = [['ptero', 200, 140, 90], ['ptero_flap', 200, 140, 90], ['bronto', 260, 300, 200], ['bronto_spray', 260, 300, 200],
  ['frog', 120, 100, 60], ['frog_jump', 120, 100, 60], ['firefly', 48, 48, 26]];
const BG = { sky: '#DDF1F7', water: '#5FAFB4', night: '#22344F' };
const uri = f => 'data:image/svg+xml;base64,' + fs.readFileSync(f).toString('base64');
const file = p => path.join(CH, 'tibo_' + p + '.svg');
const GRIP = [205, 175], SEAT = [150, 292], ROD_A = -1.05;

function cross(x, y, col) {
  return `<div style="position:absolute;left:${x - 5}px;top:${y - 1}px;width:10px;height:2px;background:${col}"></div>` +
    `<div style="position:absolute;left:${x - 1}px;top:${y - 5}px;width:2px;height:10px;background:${col}"></div>`;
}
// a code-style rod (as render.js will draw it) from the grip, so the paws can be judged with the rod in place
function rod(k, len) {
  const x = GRIP[0] * k, y = GRIP[1] * k, L = len * k;
  return `<svg style="position:absolute;left:0;top:0;overflow:visible" width="1" height="1"><line x1="${x}" y1="${y}" ` +
    `x2="${x + L * Math.cos(ROD_A)}" y2="${y + L * Math.sin(ROD_A)}" stroke="#A9853E" stroke-width="${3.4 * k / 0.633}" ` +
    `stroke-linecap="round"/><line x1="${x}" y1="${y}" x2="${x + L * Math.cos(ROD_A)}" y2="${y + L * Math.sin(ROD_A)}" ` +
    `stroke="#D9B66E" stroke-width="${2 * k / 0.633}" stroke-linecap="round"/></svg>`;
}

function row(bg, items, pad = 14) {
  return `<div style="display:flex;align-items:flex-end;gap:${pad}px;padding:${pad}px;background:${bg}">` +
    items.map(([src, w, h, marks, extra]) => `<div style="position:relative;width:${w}px;height:${h}px">` +
      `<img src="${src}" style="width:${w}px;height:${h}px;display:block;outline:1px dashed rgba(0,0,0,.14)">` +
      (extra || '') + (marks || []).map(([x, y, c]) => cross(x, y, c)).join('') + '</div>').join('') + '</div>';
}

async function shot(page, html, name) {
  await page.setContent(`<html><body style="margin:0;display:inline-block">${html}</body></html>`);
  await page.waitForTimeout(150);
  const el = await page.$('body');
  await el.screenshot({ path: path.join(OUT, name) });
}

const tiboItem = (p, S, rodOn) => {
  const k = S / 300;
  return [uri(file(p)), S, S, [[SEAT[0] * k, SEAT[1] * k, '#d02090'], [GRIP[0] * k, GRIP[1] * k, '#0a8f8a']],
    rodOn && p !== 'wave' && p !== 'title' ? rod(k, 170 * 300 / 190) : (rodOn && p === 'wave' ? rod(k, 170 * 300 / 190) : '')];
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 3400, height: 1600 } });
  const S = 190;
  await shot(page, Object.values(BG).map(bg => row(bg, POSES.map(p => tiboItem(p, S, true)), 6) +
    row(bg, POSES.map(p => tiboItem(p, S, false)), 6)).join(''), 'tibo_sheet.png');
  await shot(page, row(BG.sky, ['idle', 'cheer', 'reel', 'wave', 'title'].map(p => tiboItem(p, 570, p !== 'title'))), 'tibo_3x.png');
  await shot(page, row(BG.night, ['idle', 'think', 'oops', 'cast'].map(p => tiboItem(p, 570, true))), 'tibo_3x_night.png');

  const oth = OTHERS.map(([n, w, h, g]) => [uri(path.join(CH, n + '.svg')), w, h, g]);
  const small = oth.map(([s, w, h, g]) => [s, w * g / h, g]);
  const big = oth.map(([s, w, h]) => [s, w * 2.5 * (w > 200 ? 0.6 : 1), h * 2.5 * (w > 200 ? 0.6 : 1)]);
  await shot(page, Object.values(BG).map(bg => row(bg, small) + row(bg, big)).join(''), 'critters_sheet.png');

  const icon = uri(path.join(ROOT, 'game', 'assets', 'default', 'icon.svg'));
  await shot(page, row('#FFFFFF', [[icon, 512, 512], [icon, 180, 180], [icon, 60, 60]]), 'tibo_icon.png');

  // measured boxes: getBBox of the root's content (geometry) + opaque pixel box at 2× (alpha > 8, includes outlines)
  const files = [...POSES.map(p => ['tibo_' + p, file(p), 300, 300]),
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
  const pf = path.join(OUT, 'tibo_bbox.json');
  const raw = fs.existsSync(pf) ? JSON.parse(fs.readFileSync(pf, 'utf8')) : {};
  const pts = {};   // keep only the per-pose points written by art_tibo.py (re-runs of this script stay stable)
  for (const k of Object.keys(raw)) if (!k.startsWith('_')) pts[k.replace(/^tibo_/, '')] = raw[k];
  const res = {
    _about: 'viewBox px [x0,y0,x1,y1]. Tibo 0 0 300 300, seat anchor (150,292) = bottom centre (scale = h/300). ' +
      'grip = rod start (205,175): near paw centred on it, far paw = farPaw (15 px up the rest angle -1.05 rad), so the code ' +
      'rod from the grip runs across both paws (wave: only the far paw holds it, at the grip; title: rod + fish drawn in the file). ' +
      'mouth / eye / head / hatTop for the speech bubble and sparkles (tilt/lean applied). getBBox = geometry (no stroke), ' +
      'pixel = opaque box incl. outline. Critters: ptero centre (100,70); bronto bottom (130,296), legs end at the box ' +
      'bottom (knee-deep, soft ripple line at y≈280); frog bottom (60,96); firefly centre (24,24).',
  };
  files.forEach(([n], i) => {
    const key = n.startsWith('tibo_') ? n.slice(5) : n;
    res[n] = Object.assign({}, pts[key] && !pts[key].pixel ? pts[key] : (pts[key] ? stripBoxes(pts[key]) : {}), boxes[i]);
  });
  function stripBoxes(o) { const c = Object.assign({}, o); delete c.pixel; delete c.getBBox; return c; }
  fs.writeFileSync(pf, JSON.stringify(res, null, 1) + '\n');
  for (const [n] of files) console.log(n.padEnd(16), JSON.stringify(res[n].getBBox), JSON.stringify(res[n].pixel));
  await b.close();
})();
