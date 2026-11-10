#!/usr/bin/env node
// Contact sheet for the character art of Mochi's Fairy Bounce (QA only, output is gitignored).
// - every asset at in-game size (60 px per world unit) and at 4x, on light (#f3eefc) and dark (#1d2246)
// - Mochi's 6 frames side by side with anchor marks (feet line, body centre, paws)
//   and all frames overlaid at 50% opacity to prove the body does not jump
// - the cap placed over Mochi's paws at W = 3.0 u (180 px) and 2.1 u (126 px)
// Usage: node tools/art-characters/sheet.js  → tests/out/art-characters/{sheet,zoom}.png
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const A = path.join(ROOT, 'game/assets/default');
const OUT = path.join(ROOT, 'tests/out/art-characters');
const uri = (n) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n)).toString('base64');
const U = 60; // px per world unit

const FRAMES = ['idle', 'left', 'right', 'cheer', 'sleepy', 'oops'];
const ITEMS = [ // file, drawn w, drawn h (px at 60 px/u)
  ...FRAMES.map((f) => [`mochi_${f}.svg`, 1.35 * U, 1.35 * U]),
  ['cap.svg', 3.0 * U, 0.9 * U], ['ball.svg', 0.6 * U, 0.6 * U], ['star.svg', 0.7 * U, 0.7 * U],
  ['owl_0.svg', 1.5 * U, 1.25 * U], ['owl_1.svg', 1.5 * U, 1.25 * U], ['owl_throw.svg', 1.5 * U, 1.25 * U], ['owl_giggle.svg', 1.5 * U, 1.25 * U],
  ['pillow.svg', 0.75 * U, 0.56 * U], ['heart.svg', 30, 30], ['heart_empty.svg', 30, 30], ['icon.svg', 32, 32],
  ['particles/zzz.svg', 22, 22], ['particles/feather.svg', 22, 22],
];
const BG = { light: '#f3eefc', dark: '#1d2246' };
const H = (s, c = '#000') => `<div style="font:bold 13px sans-serif;margin:10px 0 4px;color:${c}">${s}</div>`;
const mark = (x, y, c) =>
  `<div style="position:absolute;left:${x - 6}px;top:${y - 0.5}px;width:12px;height:1px;background:${c}"></div>` +
  `<div style="position:absolute;left:${x - 0.5}px;top:${y - 6}px;width:1px;height:12px;background:${c}"></div>`;

function mochiBox(fr, size, marks = true) {
  const k = size / 120;
  let h = `<div style="position:relative;display:inline-block;width:${size}px;height:${size}px;margin:3px;outline:1px dashed rgba(128,128,128,.4)">`;
  h += `<img src="${uri('mochi_' + fr + '.svg')}" style="position:absolute;left:0;top:0;width:${size}px;height:${size}px">`;
  if (marks) {
    h += `<div style="position:absolute;left:0;top:${116 * k}px;width:100%;height:1px;background:#f0f"></div>`;
    h += mark(34 * k, 14 * k, '#f0f') + mark(86 * k, 14 * k, '#f0f') + mark(60 * k, 70 * k, '#0c0');
  }
  return h + `</div>`;
}
function overlay(size) {
  let h = `<div style="position:relative;display:inline-block;width:${size}px;height:${size}px;margin:3px">`;
  for (const fr of FRAMES) h += `<img src="${uri('mochi_' + fr + '.svg')}" style="position:absolute;left:0;top:0;width:${size}px;height:${size}px;opacity:.5">`;
  const k = size / 120;
  h += `<div style="position:absolute;left:0;top:${116 * k}px;width:100%;height:1px;background:#f0f"></div>`;
  h += mark(34 * k, 14 * k, '#f0f') + mark(86 * k, 14 * k, '#f0f') + mark(60 * k, 70 * k, '#0c0');
  return h + `</div>`;
}
// The cap sits over the paws: the bottom of its handles (y=58) level with the paw centres (y=14).
function capOnMochi(fr, W, scale = 1) {
  const mS = 1.35 * U * scale, cW = W * U * scale, cH = cW * 0.3;
  const k = mS / 120, kc = cW / 240;
  const pawY = 14 * k;
  const top = cH - 72 * kc; // cap top in box coords is 0; paws lower
  const hb = 58 * kc; const boxW = Math.max(cW, mS) + 8, boxH = hb + mS - pawY;
  const mx = (boxW - mS) / 2, my = cH - pawY + 72 * kc - cH; // cap bottom (y=72 → cH) meets paws
  let h = `<div style="position:relative;display:inline-block;width:${boxW}px;height:${boxH + 4}px;margin:4px;vertical-align:bottom">`;
  h += `<img src="${uri('mochi_' + fr + '.svg')}" style="position:absolute;left:${mx}px;top:${hb - pawY}px;width:${mS}px">`;
  h += `<img src="${uri('cap.svg')}" style="position:absolute;left:${(boxW - cW) / 2}px;top:0;width:${cW}px;height:${cH}px">`;
  h += `<div style="position:absolute;left:0;top:${12 * kc}px;width:100%;height:1px;background:#0aa;opacity:.6"></div>`;
  void top; void my;
  return h + `</div>`;
}
// In-world placement exactly as DESIGN.md says: feet at y=0, Mochi 1.35 u tall, cap bounce line at y=1.35 u.
function worldScene(bg) {
  const Wpx = 960, Hpx = 180, ground = 150;
  let h = `<div style="position:relative;width:${Wpx}px;height:${Hpx}px;background:${bg};overflow:hidden;outline:1px solid #888">`;
  h += `<div style="position:absolute;left:0;top:${ground}px;width:100%;height:${Hpx - ground}px;background:#9bc98a"></div>`;
  const put = (x, W, fr, ballOn) => {
    const mS = 81, cW = W * U, cH = cW * 0.3;
    let s = `<img src="${uri('mochi_' + fr + '.svg')}" style="position:absolute;left:${x - mS / 2}px;top:${ground - mS * 116 / 120}px;width:${mS}px">`;
    const bounce = ground - 1.35 * U; // world y 1.35
    s += `<img src="${uri('cap.svg')}" style="position:absolute;left:${x - cW / 2}px;top:${bounce - 12 * cW / 240}px;width:${cW}px;height:${cH}px">`;
    if (ballOn) s += `<img src="${uri('ball.svg')}" style="position:absolute;left:${x - 18 + 10}px;top:${bounce - 0.22 * U - 18}px;width:36px">`;
    return s;
  };
  h += put(140, 3.0, 'idle', true) + put(420, 2.1, 'cheer', false) + put(700, 3.0, 'sleepy', false);
  h += `<img src="${uri('owl_0.svg')}" style="position:absolute;left:840px;top:10px;width:90px">`;
  h += `<img src="${uri('pillow.svg')}" style="position:absolute;left:870px;top:100px;width:45px">`;
  h += `<img src="${uri('star.svg')}" style="position:absolute;left:560px;top:30px;width:42px">`;
  return h + `</div>`;
}

function panel(bg) {
  const c = bg === 'dark' ? '#fff' : '#223';
  let h = `<div style="background:${BG[bg]};padding:10px 12px;color:${c}">`;
  h += H(`${bg} — in-game size (60 px/u)`, c) + `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px">`;
  for (const [n, w, hh] of ITEMS) h += `<div style="text-align:center;font:10px sans-serif"><img src="${uri(n)}" width="${w}" height="${hh}"><br>${n.replace('.svg', '').replace('particles/', '')}</div>`;
  h += `</div>`;
  h += H('Mochi frames 1x + 2x (magenta = feet line y116 and paws, green = body centre) — then all 6 overlaid at 50%', c);
  h += `<div>` + FRAMES.map((f) => mochiBox(f, 81)).join('') + overlay(81) + `</div>`;
  h += `<div>` + FRAMES.map((f) => mochiBox(f, 162)).join('') + overlay(162) + `</div>`;
  h += H('A) handle bottoms (y58) level with the paws: W = 3.0 u (180 px) and 2.1 u (126 px); teal line = bounce line', c);
  h += `<div>` + capOnMochi('idle', 3.0) + capOnMochi('left', 3.0) + capOnMochi('cheer', 2.1) + capOnMochi('oops', 2.1) + capOnMochi('sleepy', 2.1) + `</div>`;
  h += H('B) in-world per DESIGN.md (feet y=0, cap bounce line y=1.35 u) — the placement the game uses', c) + worldScene(bg === 'dark' ? '#2a3366' : '#dfe8fb');
  h += `</div>`;
  return h;
}
function zoom(bg) {
  let h = `<div style="background:${BG[bg]};padding:8px">`;
  h += `<div>` + FRAMES.map((f) => `<img src="${uri('mochi_' + f + '.svg')}" width="324" height="324">`).join('') + `</div>`;
  h += `<div>` + overlay(324) + capOnMochi('idle', 3.0, 3) + `</div>`;
  h += `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px">`;
  h += `<img src="${uri('cap.svg')}" width="720" height="216">`;
  for (const n of ['ball.svg', 'star.svg']) h += `<img src="${uri(n)}" width="${n === 'ball.svg' ? 144 : 168}">`;
  for (const n of ['owl_0.svg', 'owl_1.svg', 'owl_throw.svg', 'owl_giggle.svg']) h += `<img src="${uri(n)}" width="360" height="300">`;
  h += `<img src="${uri('pillow.svg')}" width="180" height="134"><img src="${uri('heart.svg')}" width="120"><img src="${uri('heart_empty.svg')}" width="120">`;
  h += `<img src="${uri('particles/zzz.svg')}" width="96"><img src="${uri('particles/feather.svg')}" width="96">`;
  h += `<img src="${uri('icon.svg')}" width="256"><img src="${uri('icon.svg')}" width="32" style="vertical-align:top">`;
  h += `</div></div>`;
  return h;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:1400px">${panel('light')}${panel('dark')}</body></html>`);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'sheet.png'), fullPage: true });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:2000px">${zoom('light')}${zoom('dark')}</body></html>`);
  await page.setViewportSize({ width: 2000, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'zoom.png'), fullPage: true });
  await browser.close();
  console.log('wrote', path.relative(ROOT, OUT) + '/sheet.png and zoom.png');
})();
