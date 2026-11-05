#!/usr/bin/env node
// Contact sheets for the character art of Bolt's Rooftop Flip (Playwright + Chromium).
// - characters_sheet_light.png / _dark.png: every asset at in-game size (unit = 100) and enlarged,
//   on a light background and on deep navy; Bolt frames get anchor marks (green = body centre 64,74;
//   magenta = chest screen 60,82; orange line = feet line y 120); run-cycle strip, firefly wing strips
//   (plus a greyscale row), Bolt upside-down (scaleY -1) clamped under a dark rail strip.
// - characters_scene.png: 960x540 mock scene (roof line y 431, rail underside y 141).
// Usage: node tools/art-characters/sheet.js
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const A = path.join(ROOT, 'game/assets/default');
const OUTD = path.join(ROOT, 'docs/art');
const uri = (n) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n)).toString('base64');

const U = 100, CORR = 290;
const BOLT = 0.95 * U, FF = 0.44 * U;
const NAVY = '#141a40', LIGHT = '#eef0f6';
const COLS = ['pink', 'yellow', 'cyan'];
const GLOW = { pink: '#ff5fa2', yellow: '#ffd23f', cyan: '#39e1ff' };
const BOLTS = ['bolt_run_0', 'bolt_run_1', 'bolt_run_2', 'bolt_run_3', 'bolt_air', 'bolt_bump', 'bolt_happy'];
// [file, w, h, enlarge]
const ITEMS = [
  ...BOLTS.map((n) => [n + '.svg', BOLT, BOLT, 4]),
  ...COLS.flatMap((c) => [0, 1].map((i) => [`firefly_${c}_${i}.svg`, FF, FF, 4])),
  ...COLS.map((c) => [`gate_${c}.svg`, 0.95 * U, CORR, 2]),
  ['vent_0.svg', 80, 62, 4], ['vent_1.svg', 50, 78, 4], ['sign_0.svg', 80, 66, 4], ['sign_1.svg', 55, 70, 4],
  ['drone.svg', 100, 75, 4], ['finish.svg', 140, CORR, 2],
  ['battery.svg', 28, 28, 4], ['battery_empty.svg', 28, 28, 4], ['icon.svg', 32, 32, 8],
];
const T = (t, c) => `<div style="font:bold 14px sans-serif;color:${c};margin:14px 0 6px">${t}</div>`;
const cross = (x, y, c) =>
  `<div style="position:absolute;left:${x - 6}px;top:${y - 0.5}px;width:12px;height:1px;background:${c}"></div>` +
  `<div style="position:absolute;left:${x - 0.5}px;top:${y - 6}px;width:1px;height:12px;background:${c}"></div>`;
const img = (n, x, y, w, h, extra = '') => `<img src="${uri(n)}" style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;${extra}">`;

function cell(n, w, h, fg, k = 1, marks = false, label = true) {
  w *= k; h *= k;
  let s = `<div style="text-align:center;font:10px sans-serif;color:${fg}"><div style="position:relative;width:${w}px;height:${h}px;outline:1px dashed rgba(128,128,160,.35)">`;
  s += img(n, 0, 0, w, h);
  if (marks && n.startsWith('bolt')) {
    const sx = w / 128;
    s += `<div style="position:absolute;left:0;top:${120 * sx}px;width:${w}px;height:1px;background:#f80"></div>`;
    s += cross(64 * sx, 74 * sx, '#0c0') + cross(60 * sx, 82 * sx, '#f0f');
  }
  return s + `</div>${label ? n.replace('.svg', '') : ''}</div>`;
}
function panel(bg) {
  const dark = bg === NAVY, fg = dark ? '#ddd' : '#222';
  let h = `<div style="background:${bg};padding:14px;width:1872px">` + T('in-game size (unit = 100; Bolt 95 px, firefly 44 px, gates/finish stretched to corridor 290 px)', fg);
  h += `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px">`;
  for (const [n, w, hh] of ITEMS) h += cell(n, w, hh, fg, 1, false);
  h += `</div>` + T('enlarged: Bolt / fireflies / obstacles / drone / battery 4x, gates + finish 2x, icon 8x (Bolt marks: green body centre, magenta chest screen, orange feet line)', fg);
  h += `<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px">`;
  for (const [n, w, hh, k] of ITEMS) h += cell(n, w, hh, fg, k, true, false);
  h += `</div>`;
  // run-cycle strip on a baseline at 2x
  h += T('run cycle 0-1-2-3-0-1-2-3 at 2x (identical body; feet on the line)', fg) + `<div style="position:relative;height:${BOLT * 2 + 10}px;width:${8 * BOLT * 1.6}px">`;
  for (let i = 0; i < 8; i++) h += img(`bolt_run_${i % 4}.svg`, i * BOLT * 1.6, 0, BOLT * 2, BOLT * 2);
  h += `<div style="position:absolute;left:0;top:${(120 / 128) * BOLT * 2}px;width:100%;height:2px;background:${dark ? '#6a78b0' : '#8a93b0'}"></div></div>`;
  // firefly wing strips (colour + greyscale)
  h += T('firefly wing flap 0-1-0-1 at 2x, colour and greyscale (with additive glow like in game)', fg) + `<div style="display:flex;gap:30px">`;
  for (const gs of [false, true]) {
    h += `<div style="display:flex;flex-direction:column;gap:6px;${gs ? 'filter:grayscale(1)' : ''}">`;
    for (const c of COLS) {
      h += `<div style="display:flex;gap:8px">`;
      for (let i = 0; i < 4; i++) h += `<div style="position:relative;width:88px;height:88px;background:radial-gradient(circle at 53% 62%, ${GLOW[c]}${dark ? '88' : '44'} 0, transparent 60%)">${img(`firefly_${c}_${i % 2}.svg`, 0, 0, 88, 88)}</div>`;
      h += `</div>`;
    }
    h += `</div>`;
  }
  h += `</div>`;
  // upside-down on a dark rail strip, at in-game size and 2x
  h += T('upside-down on the rail (scaleY -1), in-game size and 2x', fg);
  const RH = 40, W = 1400;
  h += `<div style="position:relative;height:${RH + BOLT * 2 + 20}px;width:${W}px;background:#1a2148">`;
  h += `<div style="position:absolute;left:0;top:0;width:${W}px;height:${RH}px;background:linear-gradient(#5a6488,#3b4466);border-bottom:3px solid #ffe2a0"></div>`;
  let x = 10;
  for (const n of [...BOLTS]) {
    h += img(n + '.svg', x, RH + 3 - (8 / 128) * BOLT, BOLT, BOLT, 'transform:scaleY(-1)');
    x += BOLT + 6;
  }
  for (const n of ['bolt_run_0', 'bolt_run_2', 'bolt_happy']) {
    h += img(n + '.svg', x, RH + 3 - (8 / 128) * BOLT * 2, BOLT * 2, BOLT * 2, 'transform:scaleY(-1)');
    x += BOLT * 2 + 6;
  }
  return h + `</div></div>`;
}
function scene() {
  const W = 960, H = 540, ROOF = 431, RAIL = 141;
  const k = BOLT / 128;
  let h = `<div style="position:relative;width:${W}px;height:${H}px;background:linear-gradient(#0e1638,#2b2f6b);overflow:hidden">`;
  for (let i = 0; i < 50; i++) {
    const x = (i * 137.5) % W, y = (i * 53.3) % 110;
    h += `<div style="position:absolute;left:${x}px;top:${y}px;width:2px;height:2px;border-radius:1px;background:#cfd4ff;opacity:.6"></div>`;
  }
  // far skyline
  for (let i = 0; i < 14; i++) {
    const bx = i * 72 - 10, bh = 120 + ((i * 47) % 90);
    h += `<div style="position:absolute;left:${bx}px;top:${ROOF - bh}px;width:64px;height:${bh}px;background:#232a58;opacity:.9"></div>`;
  }
  // roofs with a gap 560..660
  for (const [x0, x1] of [[0, 520], [640, W]]) {
    h += `<div style="position:absolute;left:${x0}px;top:${ROOF}px;width:${x1 - x0}px;height:${H - ROOF}px;background:#3b4466;border-top:6px solid #56608a;box-sizing:border-box"></div>`;
  }
  // rail with a gap 360..460
  for (const [x0, x1] of [[0, 330], [440, W]]) {
    h += `<div style="position:absolute;left:${x0}px;top:${RAIL - 40}px;width:${x1 - x0}px;height:40px;background:linear-gradient(#5a6488,#3b4466);border-bottom:3px solid #ffe2a0;box-sizing:border-box"></div>`;
  }
  const ff = (c, i, x, y) => `<div style="position:absolute;left:${x - 40}px;top:${y - 40}px;width:80px;height:80px;background:radial-gradient(circle, ${GLOW[c]}99 0, ${GLOW[c]}33 35%, transparent 65%);mix-blend-mode:screen"></div>` +
    img(`firefly_${c}_${i}.svg`, x - FF / 2, y - FF / 2, FF, FF);
  // gate
  h += img('gate_cyan.svg', 470, RAIL, 0.95 * U, ROOF - RAIL, '');
  // fireflies: line along the roof, an arc in the flip path, a cluster under the rail
  [[320, 380], [370, 380], [420, 380]].forEach(([x, y], i) => { h += ff('yellow', i % 2, x, y); });
  [[620, 360], [660, 300], [690, 240]].forEach(([x, y], i) => { h += ff('cyan', i % 2, x, y); });
  [[760, 190], [800, 190], [840, 205]].forEach(([x, y], i) => { h += ff(['pink', 'cyan', 'yellow'][i], i % 2, x, y); });
  // obstacles
  h += img('vent_0.svg', 780, ROOF - 62, 80, 62) + img('vent_1.svg', 900, ROOF - 78, 50, 78);
  h += img('sign_0.svg', 160, RAIL, 80, 66) + img('sign_1.svg', 590, RAIL, 55, 70);
  // Bolt on the roof (feet line y 120 at ROOF), body centre x 250
  h += img('bolt_run_1.svg', 250 - 64 * k, ROOF - 120 * k, BOLT, BOLT);
  // ghost: Bolt upside-down on the rail
  h += img('bolt_run_3.svg', 80 - 64 * k, RAIL - 8 * k, BOLT, BOLT, 'transform:scaleY(-1);opacity:.55');
  // drone carrying Bolt over the roof gap: Bolt's top hangs on the hook (64,92)
  const dx = 580, dy = 230;
  const dk = 100 / 128; // drone drawn 100 x 75, body centre (64,36), hook (64,92)
  h += img('bolt_bump.svg', dx - 64 * k, dy + (92 - 36) * dk - 14 * k, BOLT, BOLT);
  h += img('drone.svg', dx - 64 * dk, dy - 36 * dk, 100, 75);
  h += img('finish.svg', 880 - 70, RAIL, 140, ROOF - RAIL, 'opacity:.92');
  // HUD batteries
  [0, 1, 2].forEach((i) => { h += img(i < 2 ? 'battery.svg' : 'battery_empty.svg', 14 + i * 32, 14, 28, 28); });
  return h + `</div>`;
}

(async () => {
  fs.mkdirSync(OUTD, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1900, height: 800 } });
  const shot = async (html, name) => {
    await page.setContent(`<!doctype html><html><body style="margin:0;display:inline-block">${html}</body></html>`);
    await page.waitForTimeout(300);
    await (await page.$('body > div')).screenshot({ path: path.isAbsolute(name) ? name : path.join(OUTD, name) });
    console.log('wrote ' + name);
  };
  await shot(panel(LIGHT), 'characters_sheet_light.png');
  await shot(panel(NAVY), 'characters_sheet_dark.png');
  await shot(`<div style="display:flex">${scene()}</div>`, 'characters_scene.png');
  // close-ups for QA (scratch, not part of the deliverables) when QA_DIR is set
  if (process.env.QA_DIR) {
    const big = (names, k) => `<div style="background:${LIGHT};padding:10px;display:flex;gap:10px;flex-wrap:wrap;width:1800px">` +
      names.map((n) => `<img src="${uri(n)}" style="width:${k}px;height:${k}px;background:#c8cede">`).join('') + '</div>';
    await shot(big(BOLTS.map((b) => b + '.svg'), 380), path.resolve(process.env.QA_DIR, 'bolt_big.png'));
  }
  await browser.close();
})();
