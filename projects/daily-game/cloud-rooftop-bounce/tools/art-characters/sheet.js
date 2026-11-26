#!/usr/bin/env node
// Contact sheet for the character art of Wisp's Rooftop Bounce (art QA).
// - chars_ingame.png: every asset at in-game size (60 px per u; Wisp at w = 3.0 u → body 180 px)
//   on a deep night-blue sky, a mid sky and a light background, plus a tiny in-world mock-up
// - chars_4x.png:     the same assets at 4x, dark + light
// - chars_wisp.png:   the 6 Wisp frames side by side (2x) with the bounce line (art y = 14, x 6…234)
//   and the face centre marked, then all frames overlaid at 30 % to prove nothing jumps
// Usage: node tools/art-characters/sheet.js  → docs/art/chars_{ingame,4x,wisp}.png
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const A = path.join(ROOT, 'game/assets/default');
const OUT = path.join(ROOT, 'docs/art');
const uri = (n) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n)).toString('base64');
const U = 60; // px per world unit
const WISP_W = 3.0 * U * 240 / 228; // the 240-wide viewBox when the 228-px body = 3.0 u
const WISP_H = WISP_W * 100 / 240;

const FRAMES = ['idle', 'left', 'right', 'cheer', 'oops', 'magnet'];
const ITEMS = [ // file, drawn w, drawn h (px at 60 px/u)
  ...FRAMES.map((f) => [`wisp_${f}.svg`, WISP_W, WISP_H]),
  ['ball.svg', 0.6 * U, 0.6 * U], ['gem_0.svg', 0.7 * U, 0.7 * U], ['gem_1.svg', 0.7 * U, 0.7 * U], ['gem_2.svg', 0.7 * U, 0.7 * U],
  ['magnet.svg', 0.8 * U, 0.8 * U], ['heart.svg', 30, 30], ['heart_empty.svg', 30, 30], ['gem_hud.svg', 30, 30],
  ['particles/sparkle.svg', 20, 20], ['particles/puff.svg', 27, 27], ['icon.svg', 32, 32], ['icon.svg', 64, 64],
];
const BG = { night: '#141a40', sky: '#26347a', light: '#eef0fa' };
const H = (s, c) => `<div style="font:bold 14px sans-serif;margin:12px 0 6px;color:${c}">${s}</div>`;
const tile = (n, w, h, c) => `<div style="text-align:center;font:10px sans-serif;color:${c}"><img src="${uri(n)}" width="${w}" height="${h}" style="display:block;margin:auto"><span>${n.replace('.svg', '').replace('particles/', '')}</span></div>`;

function grid(bg, k) {
  const c = bg === 'light' ? '#223' : '#dde';
  let h = `<div style="background:${BG[bg]};padding:10px 14px">` + H(`${bg} — ${k === 1 ? 'in-game size (60 px/u)' : k + 'x'}`, c);
  h += `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:${12 * k}px">`;
  for (const [n, w, hh] of ITEMS) h += tile(n, w * k, hh * k, c);
  return h + `</div></div>`;
}
// world y = 0 at the rooftop; bounce line at y = 1.35 u; Wisp body w = 3.0 u
function scene() {
  const W = 960, Hh = 300, ground = 260;
  let h = `<div style="position:relative;width:${W}px;height:${Hh}px;overflow:hidden;background:linear-gradient(#0f1438,#2b3a85)">`;
  h += `<div style="position:absolute;left:0;top:${ground}px;width:100%;height:${Hh - ground}px;background:#1a2050"></div>`;
  const bounce = ground - 1.35 * U;
  const put = (x, fr) => {
    const k = WISP_W / 240;
    return `<img src="${uri('wisp_' + fr + '.svg')}" style="position:absolute;left:${x - 120 * k}px;top:${bounce - 14 * k}px;width:${WISP_W}px;height:${WISP_H}px">`;
  };
  h += put(150, 'idle') + put(480, 'magnet') + put(810, 'cheer');
  h += `<img src="${uri('ball.svg')}" style="position:absolute;left:${150 + 20 - 18}px;top:${bounce - 0.22 * U - 18}px;width:36px">`;
  h += `<img src="${uri('ball.svg')}" style="position:absolute;left:${480 - 30 - 18}px;top:${bounce - 0.22 * U - 18}px;width:36px">`;
  h += `<div style="position:absolute;left:0;top:${bounce}px;width:100%;height:1px;background:#0ff;opacity:.35"></div>`;
  for (const [i, x, y] of [[0, 300, 60], [1, 620, 110], [2, 700, 40]]) h += `<img src="${uri('gem_' + i + '.svg')}" style="position:absolute;left:${x}px;top:${y}px;width:42px">`;
  h += `<img src="${uri('magnet.svg')}" style="position:absolute;left:380px;top:40px;width:48px">`;
  return h + `</div>`;
}
function wispBox(fr, w, bg, overlayAll = false) {
  const k = w / 240, hh = 100 * k;
  let h = `<div style="position:relative;display:inline-block;width:${w}px;height:${hh}px;margin:6px;background:${bg};outline:1px dashed rgba(128,128,128,.5)">`;
  const list = overlayAll ? FRAMES : [fr];
  for (const f of list) h += `<img src="${uri('wisp_' + f + '.svg')}" style="position:absolute;left:0;top:0;width:${w}px;height:${hh}px;${overlayAll ? 'opacity:.3' : ''}">`;
  h += `<div style="position:absolute;left:${6 * k}px;top:${14 * k - 0.5}px;width:${228 * k}px;height:1px;background:#f0f"></div>`;
  h += `<div style="position:absolute;left:${6 * k - 0.5}px;top:0;width:1px;height:100%;background:#f0f;opacity:.6"></div>`;
  h += `<div style="position:absolute;left:${234 * k - 0.5}px;top:0;width:1px;height:100%;background:#f0f;opacity:.6"></div>`;
  h += `<div style="position:absolute;left:0;top:${92 * k - 0.5}px;width:100%;height:1px;background:#0c0;opacity:.7"></div>`;
  h += `<div style="position:absolute;left:${120 * k - 6}px;top:${56 * k - 0.5}px;width:12px;height:1px;background:#0c0"></div>`;
  h += `<div style="position:absolute;left:${120 * k - 0.5}px;top:${56 * k - 6}px;width:1px;height:12px;background:#0c0"></div>`;
  return h + `</div>`;
}

async function shot(page, html, width, file) {
  await page.setViewportSize({ width, height: 600 });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:${width}px;background:#000">${html}</body></html>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  console.log('wrote', path.relative(ROOT, path.join(OUT, file)));
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await shot(page, grid('night', 1) + grid('sky', 1) + grid('light', 1) +
    `<div style="background:#141a40;padding:10px 14px">${H('in-world mock-up (bounce line y = 1.35 u in cyan)', '#dde')}${scene()}</div>`, 1000, 'chars_ingame.png');
  await shot(page, grid('night', 4) + grid('light', 4), 1800, 'chars_4x.png');
  let w = `<div style="background:#141a40;padding:10px 14px">` + H('Wisp frames at 2x — magenta: bounce line y=14, x 6…234; green: belly y=92 + face centre (120,56)', '#dde');
  w += `<div>` + FRAMES.map((f) => wispBox(f, 480, '#26347a')).join('') + `</div>`;
  w += H('all 6 frames overlaid at 30 % (4x), on night and on light', '#dde');
  w += `<div>` + wispBox(null, 960, '#26347a', true) + wispBox(null, 960, BG.light, true) + `</div></div>`;
  await shot(page, w, 1520, 'chars_wisp.png');
  await browser.close();
})();
