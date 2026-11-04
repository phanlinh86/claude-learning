#!/usr/bin/env node
// Contact sheets for the character art of Juno's Moon Stack (Playwright + Chromium).
// - characters_sheet_light.png / _dark.png: every asset at in-game size (unit = 100) and at 4x,
//   on a light background and on deep navy #141a40; Juno frames get anchor crosshairs
//   (green = body centre 80,78; magenta = beam emitter 80,140)
// - characters_scene.png: mock tower (4 crates on the base) with Juno above holding a crate in the beam
// Usage: node tools/art-characters/sheet.js
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const A = path.join(ROOT, 'game/assets/default');
const OUTD = path.join(ROOT, 'docs/art');
const uri = (n) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n)).toString('base64');

const U = 100;
const JUNO = 1.55 * U, CW = 110, CH = 73, COIN = 0.42 * U;
const NAVY = '#141a40', LIGHT = '#eeeaf8';
// [file, w, h]
const ITEMS = [
  ...['idle', 'drop', 'happy', 'oops'].map((k) => [`juno_${k}.svg`, JUNO, JUNO]),
  ['beam.svg', CW * 0.8, 120],
  ...[0, 1, 2, 3].map((i) => [`crate_${i}.svg`, CW, CH]),
  ...[0, 1, 2].map((i) => [`coin_${i}.svg`, COIN, COIN]),
  ['base.svg', 240, 64], ['flag.svg', 60, 120], ['rocket.svg', 90, 150], ['flame.svg', 45, 60],
  ['heart.svg', 28, 28], ['heart_empty.svg', 28, 28], ['icon.svg', 32, 32],
];
const T = (t, c) => `<div style="font:bold 14px sans-serif;color:${c};margin:12px 0 6px">${t}</div>`;
const cross = (x, y, c) =>
  `<div style="position:absolute;left:${x - 7}px;top:${y - 0.5}px;width:14px;height:1px;background:${c}"></div>` +
  `<div style="position:absolute;left:${x - 0.5}px;top:${y - 7}px;width:1px;height:14px;background:${c}"></div>`;

function cell(n, w, h, fg, k = 1, marks = false) {
  w *= k; h *= k;
  let s = `<div style="text-align:center;font:10px sans-serif;color:${fg}"><div style="position:relative;width:${w}px;height:${h}px;outline:1px dashed rgba(128,128,160,.35)">`;
  s += `<img src="${uri(n)}" style="position:absolute;left:0;top:0;width:${w}px;height:${h}px">`;
  if (marks && n.startsWith('juno')) s += cross((80 * w) / 160, (78 * h) / 160, '#0c0') + cross((80 * w) / 160, (140 * h) / 160, '#f0f');
  return s + `</div>${k === 1 ? n.replace('.svg', '') : ''}</div>`;
}
function panel(bg) {
  const fg = bg === NAVY ? '#ddd' : '#222';
  let h = `<div style="background:${bg};padding:14px;width:1572px">` + T('in-game size (unit = 100)', fg);
  h += `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px">`;
  for (const [n, w, hh] of ITEMS) h += cell(n, w, hh, fg, 1, true);
  h += `</div>` + T('enlarged (Juno, base, rocket 2x; icon 6x; others 4x)', fg) + `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px">`;
  for (const [n, w, hh] of ITEMS) {
    const k = /juno|base|rocket|beam/.test(n) ? 2 : n === 'icon.svg' ? 6 : 4;
    h += cell(n, w, hh, fg, k, false);
  }
  h += `</div>` + T('coin spin 0,1,2,1(flipped) at 2x', fg) + `<div style="display:flex;gap:10px">`;
  for (const [i, fl] of [[0, 1], [1, 1], [2, 1], [1, -1], [0, 1]]) h += `<img src="${uri(`coin_${i}.svg`)}" style="width:84px;height:84px;transform:scaleX(${fl})">`;
  return h + `</div></div>`;
}
function scene() {
  const W = 620, H = 900, cx = W / 2, groundY = H - 90;
  let h = `<div style="position:relative;width:${W}px;height:${H}px;background:linear-gradient(#0e1333,${NAVY} 60%,#232a5c);overflow:hidden">`;
  for (let i = 0; i < 40; i++) {
    const x = (i * 137.5) % W, y = (i * 91.3) % (groundY - 40);
    if (Math.abs(x - cx) < 150) continue;
    h += `<div style="position:absolute;left:${x}px;top:${y}px;width:2px;height:2px;border-radius:1px;background:#cfd4ff;opacity:.6"></div>`;
  }
  h += `<div style="position:absolute;left:0;top:${groundY}px;width:${W}px;height:${H - groundY}px;background:#5e6094;border-top:3px solid #8d8fb8"></div>`;
  // base: flat top at svg y = 4
  const by = groundY - 64 + 4;
  h += `<img src="${uri('base.svg')}" style="position:absolute;left:${cx - 120}px;top:${groundY - 60}px;width:240px;height:64px">`;
  let top = by; // y of the current support surface
  const offs = [0, 6, -4, 10];
  [0, 1, 2, 3].forEach((s, i) => {
    top -= CH;
    h += `<img src="${uri(`crate_${s}.svg`)}" style="position:absolute;left:${cx - CW / 2 + offs[i]}px;top:${top}px;width:${CW}px;height:${CH}px">`;
  });
  // flag on top for illustration (left), rocket beside the tower
  h += `<img src="${uri('rocket.svg')}" style="position:absolute;left:${cx + 170 - 45}px;top:${groundY - 150 * 152 / 160}px;width:90px;height:150px">`;
  h += `<img src="${uri('flag.svg')}" style="position:absolute;left:${cx - 230 - 12 * 60 / 64}px;top:${groundY - 124 * 120 / 128}px;width:60px;height:120px">`;
  // Juno + beam + held crate
  const jx = cx + 30, jy = 130, k = JUNO / 160;
  const ex = jx, ey = jy - 78 * k + 140 * k; // emitter
  const heldTop = ey + 22;
  h += `<img src="${uri('beam.svg')}" style="position:absolute;left:${ex - CW / 2}px;top:${ey}px;width:${CW}px;height:${heldTop - ey + 6}px">`;
  h += `<img src="${uri('juno_idle.svg')}" style="position:absolute;left:${jx - 80 * k}px;top:${jy - 78 * k}px;width:${JUNO}px;height:${JUNO}px">`;
  h += `<img src="${uri('crate_0.svg')}" style="position:absolute;left:${ex - CW / 2}px;top:${heldTop}px;width:${CW}px;height:${CH}px">`;
  // coins in the fall band
  [[cx - 120, 340, 0], [cx + 100, 380, 1], [cx - 30, 410, 2]].forEach(([x, y, i]) => {
    h += `<img src="${uri(`coin_${i}.svg`)}" style="position:absolute;left:${x - COIN / 2}px;top:${y - COIN / 2}px;width:${COIN}px;height:${COIN}px">`;
  });
  // HUD hearts
  [0, 1, 2].forEach((i) => { h += `<img src="${uri(i < 2 ? 'heart.svg' : 'heart_empty.svg')}" style="position:absolute;left:${14 + i * 32}px;top:14px;width:28px;height:28px">`; });
  return h + `</div>`;
}

(async () => {
  fs.mkdirSync(OUTD, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 800 } });
  const shot = async (html, name) => {
    await page.setContent(`<!doctype html><html><body style="margin:0;display:inline-block">${html}</body></html>`);
    await page.waitForTimeout(250);
    await (await page.$('body > div')).screenshot({ path: path.join(OUTD, name) });
    console.log('wrote docs/art/' + name);
  };
  await shot(panel(LIGHT), 'characters_sheet_light.png');
  await shot(panel(NAVY), 'characters_sheet_dark.png');
  await shot(`<div style="display:flex">${scene()}</div>`, 'characters_scene.png');
  await browser.close();
})();
