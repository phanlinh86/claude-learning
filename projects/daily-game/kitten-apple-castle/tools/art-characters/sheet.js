#!/usr/bin/env node
// Contact sheets for the character art of Ziggy's Apple Castle (Playwright + Chromium).
// - characters_sheet_light.png / _dark.png: every asset at in-game size (unit = 100) and enlarged,
//   on a light background and on night blue-violet; Ziggy frames get anchor crosshairs
//   (green = body centre 80,78; magenta = lantern emitter 80,140)
// - characters_frames.png: the 4 Ziggy frames side by side at 2x (rocket geometry check)
// - characters_scene_day.png / _night.png: base + 4 crates (one with a lantern), Ziggy above holding a
//   crate in the glow, apples, Granny Boo beside the tower, HUD hearts + pie
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
const ZIG = 1.55 * U, CW = 110, CH = CW * 2 / 3, APPLE = 0.42 * U;
const NIGHT = '#1b1e4a', LIGHT = '#eeeaf8';
const ITEMS = [
  ...['idle', 'drop', 'happy', 'oops'].map((k) => [`ziggy_${k}.svg`, ZIG, ZIG]),
  ['beam.svg', CW * 0.8, 120],
  ...[0, 1, 2, 3].map((i) => [`crate_${i}.svg`, CW, CH]),
  ['lantern.svg', 34, 45],
  ['apple_0.svg', APPLE, APPLE], ['apple_1.svg', APPLE, APPLE], ['apple_glow.svg', 90, 90],
  ['base.svg', 240, 64], ['flag.svg', 60, 120], ['ghost.svg', 90, 150], ['ghost_wave.svg', 90, 150],
  ['heart.svg', 28, 28], ['heart_empty.svg', 28, 28], ['pie.svg', 37, 28], ['icon.svg', 32, 32],
];
const T = (t, c) => `<div style="font:bold 14px sans-serif;color:${c};margin:12px 0 6px">${t}</div>`;
const cross = (x, y, c) =>
  `<div style="position:absolute;left:${x - 7}px;top:${y - 0.5}px;width:14px;height:1px;background:${c}"></div>` +
  `<div style="position:absolute;left:${x - 0.5}px;top:${y - 7}px;width:1px;height:14px;background:${c}"></div>`;
const img = (n, x, y, w, h, extra = '') => `<img src="${uri(n)}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${extra}">`;

function cell(n, w, h, fg, k = 1, marks = false) {
  w *= k; h *= k;
  let s = `<div style="text-align:center;font:10px sans-serif;color:${fg}"><div style="position:relative;width:${w}px;height:${h}px;outline:1px dashed rgba(128,128,160,.35)">`;
  s += img(n, 0, 0, w, h);
  if (marks && n.startsWith('ziggy')) s += cross((80 * w) / 160, (78 * h) / 160, '#0c0') + cross((80 * w) / 160, (140 * h) / 160, '#f0f');
  if (marks && n.startsWith('ghost')) s += cross((48 * w) / 96, (80 * h) / 160, '#0c0') + cross((48 * w) / 96, (152 * h) / 160, '#f0f');
  if (marks && n === 'flag.svg') s += cross((12 * w) / 64, (124 * h) / 128, '#f0f');
  if (marks && n === 'lantern.svg') s += cross((24 * w) / 48, 0, '#f0f');
  return s + `</div>${k === 1 ? n.replace('.svg', '') : ''}</div>`;
}
function panel(bg) {
  const fg = bg === NIGHT ? '#ddd' : '#222';
  let h = `<div style="background:${bg};padding:14px;width:1572px">` + T('in-game size (unit = 100)', fg);
  h += `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px">`;
  for (const [n, w, hh] of ITEMS) h += cell(n, w, hh, fg, 1, true);
  h += `</div>` + T('enlarged (Ziggy, base, ghost, beam 2x; icon 6x; others 4x)', fg) + `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px">`;
  for (const [n, w, hh] of ITEMS) {
    const k = /ziggy|base|ghost|beam|flag/.test(n) ? 2 : n === 'icon.svg' ? 6 : /crate/.test(n) ? 3 : 4;
    h += cell(n, w, hh, fg, k, false);
  }
  return h + `</div></div>`;
}
function frames() {
  let h = `<div style="display:flex;gap:0;background:${LIGHT}">`;
  for (const bg of [LIGHT, NIGHT]) for (const k of ['idle', 'drop', 'happy', 'oops']) {
    h += `<div style="position:relative;width:320px;height:320px;background:${bg}">${img(`ziggy_${k}.svg`, 0, 0, 320, 320)}` +
      `<div style="position:absolute;left:0;top:${78 * 2}px;width:320px;height:1px;background:rgba(0,200,0,.35)"></div></div>`;
  }
  return h + `</div>`;
}
function scene(night) {
  const W = 620, H = 900, cx = W / 2, groundY = H - 90;
  const sky = night ? `linear-gradient(#141640,${NIGHT} 55%,#3a3478)` : 'linear-gradient(#7cc8ff,#d8f0ff)';
  let h = `<div style="position:relative;width:${W}px;height:${H}px;background:${sky};overflow:hidden">`;
  if (night) for (let i = 0; i < 40; i++) {
    const x = (i * 137.5) % W, y = (i * 91.3) % (groundY - 40);
    if (Math.abs(x - cx) < 150) continue;
    h += `<div style="position:absolute;left:${x}px;top:${y}px;width:2px;height:2px;border-radius:1px;background:#cfd4ff;opacity:.6"></div>`;
  }
  h += `<div style="position:absolute;left:0;top:${groundY}px;width:${W}px;height:${H - groundY}px;background:${night ? '#3e4a6a' : '#7fc26a'};border-top:3px solid ${night ? '#5a6688' : '#9ad884'}"></div>`;
  h += img('base.svg', cx - 120, groundY - 60, 240, 64);
  let top = groundY - 60 + 4;
  const offs = [0, 6, -4, 10];
  [0, 1, 2, 3].forEach((s, i) => {
    top -= CH;
    h += img(`crate_${s}.svg`, cx - CW / 2 + offs[i], top, CW, CH);
    if (i === 1 || i === 3) { // lantern hung on the side face
      const side = i === 1 ? 1 : -1, lx = cx + offs[i] + side * (CW / 2 - 14);
      h += img('lantern.svg', lx - 17, top + 10, 34, 45);
    }
  });
  h += img('flag.svg', cx - 230 - 12 * 60 / 64, groundY - 124 * 120 / 128, 60, 120);
  // Granny Boo beside the tower top
  h += img('ghost_wave.svg', cx + 110, top - 140, 90, 150);
  // Ziggy + glow + held crate
  const jx = cx - 30, jy = 130, k = ZIG / 160;
  const ex = jx, ey = jy - 78 * k + 140 * k;
  const heldTop = ey + 22;
  h += img('beam.svg', ex - CW / 2, ey, CW, heldTop - ey + 6, night ? 'mix-blend-mode:screen' : '');
  h += img('ziggy_idle.svg', jx - 80 * k, jy - 78 * k, ZIG, ZIG);
  h += img('crate_2.svg', ex - CW / 2, heldTop, CW, CH);
  [[cx - 150, 360, 0], [cx + 60, 400, 1], [cx - 40, 440, 0]].forEach(([x, y, i]) => {
    if (night) h += img('apple_glow.svg', x - 45, y - 45, 90, 90);
    h += img(`apple_${i}.svg`, x - APPLE / 2, y - APPLE * 34 / 64, APPLE, APPLE);
  });
  [0, 1, 2].forEach((i) => { h += img(i < 2 ? 'heart.svg' : 'heart_empty.svg', 14 + i * 32, 14, 28, 28); });
  h += img('pie.svg', 120, 14, 37, 28);
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
  await shot(panel(NIGHT), 'characters_sheet_dark.png');
  await shot(frames(), 'characters_frames.png');
  await shot(`<div style="display:flex">${scene(false)}${scene(true)}</div>`, 'characters_scene.png');
  await browser.close();
})();
